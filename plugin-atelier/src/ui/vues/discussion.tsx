/**
 * Discussion avec le Coordinateur : un fil de bulles pour piloter l'atelier en langage libre.
 *
 * Le fil est celui d'une issue native unique (routes `discussion.*`). L'écran se met à jour par
 * interrogation toutes les 4 s quand l'onglet est visible, jamais en arrière-plan. Le texte est rendu
 * sans HTML (aucun `dangerouslySetInnerHTML`) ; seuls les identifiants de tâche (`ABC-12`) deviennent
 * des liens vers la tâche.
 *
 * Destinataire : pour un client à plusieurs services (une entreprise par service), le fil est celui de l'entreprise
 * Direction, dont le coordinateur est le coordinateur général, seul interlocuteur de l'humain ; il délègue aux
 * coordinateurs de département par le bureau de liaison. L'entreprise Direction est lue par `departements.lister`
 * (déclaration des services du même client, jamais d'un autre). Entreprise non déclarée ou sans Direction : le fil
 * reste celui de l'entreprise courante. Une lecture en échec n'aiguille jamais en silence vers un autre destinataire :
 * elle s'affiche en erreur avec « Réessayer ».
 */
import {
  useCallback,
  useId,
  useMemo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { MarkdownBlock, useHostContext, useHostLocation } from "@paperclipai/plugin-sdk/ui";
import { abaisserTitres } from "./contenus.js";
import type { ActionDiscussion } from "../../serveur/discussion-actions.js";
import type { ElementAccueil } from "../../serveur/services-accueil.js";
import { GererLesAgents } from "../composants/agents-en-service.js";
import {
  ID_ELEMENT_CONNEXIONS,
  useAFaireAccueil,
} from "../composants/chat-a-faire.js";
import {
  MessageSituation,
  useConnexionsManquantes,
} from "../composants/chat-situation.js";
import { BoutonDicter } from "../composants/dictee.js";
import {
  ReglagesDuChat,
  useLectureAuto,
  useReglagesChat,
} from "../composants/reglages-chat.js";
import { VoixEnDirect } from "../composants/voix-en-direct.js";
import {
  Chargement,
  EtatErreur,
  LienHote,
  TexteSur,
  MessageFait,
} from "../composants.js";
import { IconeEnvoi } from "../composants/icones-discussion.js";
import { MODELES_DEMANDE, texteModele } from "../demande.js";
import { dateHeure, classerErreur } from "../format.js";
import {
  ActionsIndisponibles,
  ActionsMessage,
  CarteFil,
  elementsVises,
  useAFaireClient,
  usePrefixesServices,
} from "../discussion-telecommande.js";
import { appelRoute } from "../routes-prospection.js";
import { useCartesServices, useMissionsServices, type CarteService } from "../cartes-services.js";
import { avancements } from "../avancement-missions.js";
import { BandeauMissions } from "../composants/bandeau-missions.js";
import { STYLES_BANDE, STYLES_DISCUSSION, STYLES_FRISE } from "../styles-discussion.js";
import { STYLES_HISTORIQUE } from "../styles-historique-discussions.js";
import { BasculeHistorique, HistoriqueDiscussions, useHistoriqueDiscussions } from "../composants/historique-discussions.js";
import type {
  DepartementDeclare,
  ReponseDepartements,
} from "../../contrats/departements.js";

export interface MessageFil {
  id: string;
  auteur: "humain" | "agent";
  nom: string;
  texte: string;
  date: string;
  /** Actions validées par le serveur (télécommande) ; absentes pour l'humain. */
  actions?: ActionDiscussion[];
}
interface Ouverture {
  issueId: string | null;
  identifiant: string | null;
  messages: MessageFil[];
  /** Cartes natives en attente sur les tâches liées à la discussion. */
  cartes?: ElementAccueil[];
  /** La lecture des cartes natives a échoué côté serveur : proposer de réessayer. */
  cartesIndisponibles?: boolean;
}

export const INTERVALLE_MS = 4000;
/** Au-delà, l'indicateur « réfléchit » s'efface : le Coordinateur n'a peut-être pas pu répondre. */
export const DELAI_ATTENTE_MS = 180_000;
const MAX_TEXTE = 4000;
/** Relecture du « À faire » du chat (onglet visible seulement). */
export const INTERVALLE_AFAIRE_MS = 30_000;
/**
 * Pastilles du fil vide : quatre au plus, et toutes se comportent pareil, elles REMPLISSENT la saisie sans jamais
 * envoyer (la personne relit, complète les <…> puis envoie). Trois modèles de demande, puis la question sur les missions.
 * La prospection passe par le modèle « Prospection d'une zone » : le Coordinateur pose ensuite ses questions.
 */
export const PASTILLES: ReadonlyArray<{ libelle: string; texte: string }> = [
  ...[
    "Prospection d'une zone",
    "Campagne Google Ads",
    "Veille concurrentielle hebdomadaire",
  ].flatMap((libelle) => MODELES_DEMANDE.filter((m) => m.libelle === libelle)),
  { libelle: "Où en sont les missions ?", texte: "Où en sont les missions ?" },
];

/** Fusionne sans doublon (identifiant) et trie du plus ancien au plus récent. */
function fusionner(
  actuels: MessageFil[],
  nouveaux: MessageFil[],
): MessageFil[] {
  if (nouveaux.length === 0) return actuels;
  const connus = new Set(actuels.map((m) => m.id));
  const ajouts = nouveaux.filter((m) => !connus.has(m.id));
  if (ajouts.length === 0) return actuels;
  return [...actuels, ...ajouts].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
}

/**
 * Entreprise dont la discussion est ouverte : la Direction du client si l'entreprise courante est un service déclaré
 * d'un client qui en a une (coordinateur général), sinon l'entreprise courante. `companyId` reste indéfini pendant la
 * lecture ; `general` est vrai quand le fil est celui du coordinateur général du client (y compris quand l'entreprise
 * courante est la Direction elle-même) ; `services` liste les services du client (null sans client à plusieurs services).
 */
export function useEntrepriseDiscussion(courante: string | null | undefined): {
  companyId: string | null;
  general: boolean;
  services: DepartementDeclare[] | null;
  erreur: unknown;
  reessayer: () => void;
} {
  const [etat, setEtat] = useState<{
    pour: string | null;
    cible: string | null;
    general: boolean;
    services: DepartementDeclare[] | null;
    erreur: unknown;
  }>({ pour: null, cible: null, general: false, services: null, erreur: null });
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    if (!courante) return;
    let annule = false;
    setEtat({
      pour: null,
      cible: null,
      general: false,
      services: null,
      erreur: null,
    });
    appelRoute<Partial<ReponseDepartements>>(
      "GET",
      `/departements?companyId=${encodeURIComponent(courante)}`,
    )
      .then((r) => {
        if (annule) return;
        const services = Array.isArray(r?.departements) ? r.departements : [];
        const direction = services.find((d) => d.estDirection);
        const plusieurs = direction !== undefined && services.length >= 2;
        setEtat({
          pour: courante,
          cible: direction?.companyId ?? courante,
          general: plusieurs,
          services: plusieurs ? services : null,
          erreur: null,
        });
      })
      .catch(
        (erreur: unknown) =>
          !annule &&
          setEtat({
            pour: courante,
            cible: null,
            general: false,
            services: null,
            erreur,
          }),
      );
    return () => {
      annule = true;
    };
  }, [courante, essai]);
  const pret = etat.pour === courante ? etat.cible : null;
  return {
    companyId: pret,
    general: pret !== null && etat.general,
    services: pret !== null ? etat.services : null,
    erreur: etat.pour === courante ? etat.erreur : null,
    reessayer: () => setEssai((e) => e + 1),
  };
}

export function VueDiscussion() {
  const { companyId: courante } = useHostContext();
  const {
    companyId,
    general,
    services,
    erreur: erreurDestinataire,
    reessayer: reessayerDestinataire,
  } = useEntrepriseDiscussion(courante);
  const [etat, setEtat] = useState<{
    ouverture: Ouverture | null;
    erreur: unknown;
    chargement: boolean;
  }>({ ouverture: null, erreur: null, chargement: true });
  const [messages, setMessages] = useState<MessageFil[]>([]);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  /** Vrai après une tentative d'envoi à vide : le message d'aide n'apparaît qu'alors. */
  const [tentativeVide, setTentativeVide] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  /** Instant (ms) du dernier envoi sans réponse reçue ; `null` si le Coordinateur a répondu. */
  const [attenteDepuis, setAttenteDepuis] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const [cartes, setCartes] = useState<ElementAccueil[]>([]);
  const [cartesIndisponibles, setCartesIndisponibles] = useState(false);
  /** Actions et cartes déjà traitées (clé → message de confirmation), pour les retirer sans attendre l'interrogation. */
  const [faits, setFaits] = useState<Record<string, string>>({});
  const [versionElements, setVersionElements] = useState(0);
  /** Le bilan d'une approbation groupée est affiché : la ligne des points en attente reste montée jusqu'à « Fermer ». */
  const [bilanGroupe, setBilanGroupe] = useState(false);
  /** Discussion demandée par un clic ou créée à l'instant ; `null` : la plus récemment active (le serveur choisit). */
  const [cible, setCible] = useState<string | null>(null);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  const [rafraichirHistorique, setRafraichirHistorique] = useState(0);
  const [creation, setCreation] = useState(false);
  /** Discussion dont les messages sont à l'écran : lue par l'interrogation périodique et par l'envoi. */
  const ouverteRef = useRef<string | null>(null);
  /** Discussion déjà reçue en réponse (création, `/clear`) : l'ouverture ne la relit pas. */
  const prechargee = useRef<string | null>(null);
  const historique = useHistoriqueDiscussions(companyId, rafraichirHistorique);
  const {
    elements,
    origines,
    autres,
    erreur: erreurElements,
    reessayer: reessayerElements,
  } = useAFaireClient(
    companyId,
    services,
    elementsVises(messages),
    versionElements,
  );
  const prefixesServices = usePrefixesServices(services, messages);
  // Décisions qui attendent dans les autres services (tâches reçues par liaison depuis ce chat) : lecture partagée avec
  // le menu, le bandeau et le titre de l'onglet, relue toutes les 15 s.
  const svc = useCartesServices(general ? companyId : null);
  // Frises d'avancement des missions : même lecture, même rythme (15 s) que les cartes, aucune lecture en plus.
  const missionsLues = useMissionsServices(general ? companyId : null);
  // Le fil d'une discussion ne montre que ce qui en est né : cartes et missions d'une autre discussion, ou sans
  // discussion d'origine, restent dans la ligne « points en attente » (voir plus bas).
  const issueOuverte = etat.ouverture?.issueId ?? null;
  const cartesDeLaDiscussion = useMemo(
    () => svc.cartes.filter((c) => issueOuverte !== null && c.discussionId === issueOuverte),
    [svc.cartes, issueOuverte],
  );
  const frises = useMemo(
    () =>
      avancements(
        missionsLues.filter((m) => issueOuverte !== null && m.discussionId === issueOuverte),
        new Set(cartesDeLaDiscussion.map((c) => c.tache)),
      ),
    [missionsLues, issueOuverte, cartesDeLaDiscussion],
  );
  /** Cartes des services déjà vues : une carte traitée garde sa place (message de confirmation) après avoir quitté la liste. */
  const cartesVues = useRef(new Map<string, CarteService>());
  for (const c of svc.cartes) cartesVues.current.set(c.element.id, c);
  const idsServices = new Set(cartesDeLaDiscussion.map((c) => c.element.id));
  const cartesHorsDiscussion = svc.cartes.filter((c) => c.discussionId !== issueOuverte);
  const traite = (cle: string, message: string) => {
    setFaits((f) => ({ ...f, [cle]: message }));
    setVersionElements((v) => v + 1);
    if (cle.startsWith("carte:") && cartesVues.current.has(cle.slice(6)))
      svc.rafraichir();
  };
  const [reglages, changerReglages] = useReglagesChat();
  const afaire = useAFaireAccueil(companyId, INTERVALLE_AFAIRE_MS);
  const connexionsManquantes = useConnexionsManquantes();
  // Le message du Coordinateur dit déjà les connexions manquantes : l'élément « Aucune connexion à vos outils » quitte la liste tant qu'il les nomme.
  const elementsAFaire = afaire.etat.data
    ? afaire.etat.data.elements.filter(
        (e) =>
          !afaire.traites.has(e.id) &&
          !(connexionsManquantes.length > 0 && e.id === ID_ELEMENT_CONNEXIONS),
      )
    : [];
  /** Seule la carte du dernier message du Coordinateur est actionnable (les états « faits » ne vivent qu'en mémoire). */
  const dernierAgentId = [...messages]
    .reverse()
    .find((m) => m.auteur === "agent")?.id;
  const fil = useRef<HTMLDivElement | null>(null);
  const champ = useRef<HTMLTextAreaElement | null>(null);
  const idRaison = useId();
  const messagesRef = useRef<MessageFil[]>([]);
  messagesRef.current = messages;
  const enVol = useRef(false);

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    if (cible !== null && prechargee.current === cible) {
      prechargee.current = null;
      return;
    }
    // Une relecture (« Réessayer ») garde la discussion affichée, jamais « la plus récente » du serveur.
    const visee = cible ?? ouverteRef.current;
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    appelRoute<Ouverture>(
      "GET",
      `/discussion?companyId=${encodeURIComponent(companyId)}${visee ? `&issueId=${encodeURIComponent(visee)}` : ""}`,
    )
      .then((o) => {
        if (annule) return;
        ouverteRef.current = o.issueId;
        setEtat({ ouverture: o, erreur: null, chargement: false });
        setCartes(o.cartes ?? []);
        setCartesIndisponibles(o.cartesIndisponibles === true);
        setMessages((actuels) => fusionner(actuels, o.messages));
      })
      .catch(
        (erreur: unknown) =>
          !annule && setEtat({ ouverture: null, erreur, chargement: false }),
      );
    return () => {
      annule = true;
    };
  }, [companyId, version, cible]);

  const interroger = useCallback(async () => {
    if (!companyId || enVol.current) return;
    enVol.current = true;
    const issueId = ouverteRef.current;
    try {
      const derniere = messagesRef.current.at(-1)?.date;
      const r = await appelRoute<{
        messages: MessageFil[];
        cartes?: ElementAccueil[];
        cartesIndisponibles?: boolean;
      }>(
        "GET",
        `/discussion/messages?companyId=${encodeURIComponent(companyId)}${derniere ? `&depuis=${encodeURIComponent(derniere)}` : ""}${issueId ? `&issueId=${encodeURIComponent(issueId)}` : ""}`,
      );
      // L'humain a changé de discussion pendant la lecture : cette réponse n'est plus la sienne.
      if (ouverteRef.current !== issueId) return;
      // Même contenu : on garde l'état (aucun nouveau rendu du fil à chaque interrogation).
      if (r.cartes) setCartes((actuelles) => (JSON.stringify(actuelles) === JSON.stringify(r.cartes) ? actuelles : r.cartes!));
      setCartesIndisponibles(r.cartesIndisponibles === true);
      if (r.messages.length > 0) {
        setMessages((actuels) => fusionner(actuels, r.messages));
        if (r.messages.some((m) => m.auteur === "agent"))
          setAttenteDepuis(null);
      }
      setAttenteDepuis((depuis) =>
        depuis !== null && Date.now() - depuis > DELAI_ATTENTE_MS
          ? null
          : depuis,
      );
    } catch {
      // Une interrogation ratée ne casse rien : la suivante réessaie.
    } finally {
      enVol.current = false;
    }
  }, [companyId]);

  // Interrogation toutes les 4 s, en pause quand l'onglet est caché, reprise immédiate au retour.
  const pret = etat.ouverture !== null;
  useLectureAuto(messages, reglages.lectureAuto, reglages.voix, pret);
  useEffect(() => {
    if (!pret) return;
    let minuteur: ReturnType<typeof setInterval> | null = null;
    const demarrer = () => {
      if (minuteur === null)
        minuteur = setInterval(() => void interroger(), INTERVALLE_MS);
    };
    const arreter = () => {
      if (minuteur !== null) clearInterval(minuteur);
      minuteur = null;
    };
    const surVisibilite = () => {
      if (document.visibilityState === "visible") {
        void interroger();
        demarrer();
      } else arreter();
    };
    if (document.visibilityState === "visible") demarrer();
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      document.removeEventListener("visibilitychange", surVisibilite);
      arreter();
    };
  }, [pret, interroger]);

  // Le fil reste calé en bas quand un message arrive.
  useEffect(() => {
    const el = fil.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [
    messages.length,
    cartes.length,
    cartesDeLaDiscussion.length,
    attenteDepuis,
  ]);

  // Le champ grandit avec le texte (repli pour les navigateurs sans `field-sizing`), puis se plafonne par le style.
  useEffect(() => {
    const el = champ.current;
    if (!el) return;
    el.style.height = "auto";
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, [texte]);

  /** Affiche une discussion déjà lue (création, `/clear`) sans la relire. */
  const adopter = useCallback((o: Ouverture) => {
    ouverteRef.current = o.issueId;
    prechargee.current = o.issueId;
    setMessages(fusionner([], o.messages));
    setCartes(o.cartes ?? []);
    setCartesIndisponibles(o.cartesIndisponibles === true);
    setAttenteDepuis(null);
    setEtat({ ouverture: o, erreur: null, chargement: false });
    setCible(o.issueId);
    setHistoriqueOuvert(false);
    setRafraichirHistorique((n) => n + 1);
  }, []);

  const choisir = (issueId: string) => {
    setHistoriqueOuvert(false);
    if (issueId === ouverteRef.current) return;
    ouverteRef.current = null;
    prechargee.current = null;
    setMessages([]);
    setCartes([]);
    setCartesIndisponibles(false);
    setAttenteDepuis(null);
    setErreurEnvoi(null);
    setEtat({ ouverture: null, erreur: null, chargement: true });
    setCible(issueId);
  };

  const nouvelle = async () => {
    if (!companyId || creation) return;
    setCreation(true);
    setErreurEnvoi(null);
    try {
      adopter(await appelRoute<Ouverture>("POST", "/discussion/nouvelle", { companyId }));
      setTexte("");
    } catch (e) {
      setErreurEnvoi(classerErreur(e).message);
    } finally {
      setCreation(false);
    }
  };

  /** Supprime une discussion ; si c'est l'ouverte, ouvre la plus récente restante, sinon une nouvelle. */
  const supprimer = async (issueId: string) => {
    if (!companyId) return;
    setErreurEnvoi(null);
    try {
      await appelRoute("POST", "/discussion/supprimer", { companyId, issueId });
    } catch (e) {
      setErreurEnvoi(classerErreur(e).message);
      return;
    }
    setRafraichirHistorique((n) => n + 1);
    if (issueId !== ouverteRef.current) return;
    const suivante = historique.discussions.find((d) => d.issueId !== issueId);
    if (suivante) choisir(suivante.issueId);
    else await nouvelle();
  };

  const envoyer = useCallback(
    async (brut: string) => {
      const propre = brut.trim();
      if (!companyId || propre === "" || envoi) return;
      setEnvoi(true);
      setErreurEnvoi(null);
      try {
        const issueId = ouverteRef.current;
        const m = await appelRoute<MessageFil & { reveilDemande?: boolean; nouvelle?: Ouverture }>(
          "POST",
          "/discussion/message",
          { companyId, texte: propre, ...(issueId ? { issueId } : {}) },
        );
        // `/clear` ou `/nouveau` : le serveur a ouvert une nouvelle discussion au lieu d'envoyer le texte.
        if (m.nouvelle) {
          adopter(m.nouvelle);
          setTexte("");
          return;
        }
        setMessages((actuels) =>
          fusionner(actuels, [
            {
              id: m.id,
              auteur: "humain",
              nom: m.nom || "Vous",
              texte: propre,
              date: m.date,
            },
          ]),
        );
        setAttenteDepuis(Date.now());
        setTexte("");
        setRafraichirHistorique((n) => n + 1);
        // Premier message d'une entreprise sans discussion : le serveur vient de la créer, on la rouvre pour connaître son identifiant.
        if (!issueId) setVersion((v) => v + 1);
      } catch (e) {
        setErreurEnvoi(classerErreur(e).message);
      } finally {
        setEnvoi(false);
      }
    },
    [companyId, envoi, adopter],
  );

  /** Une pastille remplit la saisie sans l'envoyer : l'humain complète les <…> puis envoie. */
  const poserModele = (modele: string) => {
    setTexte(modele);
    setTentativeVide(false);
    requestAnimationFrame(() => {
      const el = champ.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  // Un lien « Demandez au Coordinateur » (`?modele=<libellé>`) arrive avec le modèle à préremplir : jamais envoyé tout seul.
  const { search } = useHostLocation();
  const modeleDemande = texteModele(new URLSearchParams(search).get("modele"));
  const modelePose = useRef<string | null>(null);
  useEffect(() => {
    if (modeleDemande === null || modelePose.current === modeleDemande) return;
    modelePose.current = modeleDemande;
    poserModele(modeleDemande);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeleDemande]);

  const surTouche = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (texte.trim() === "") setTentativeVide(true);
      void envoyer(texte);
    }
  };

  if (erreurDestinataire)
    return (
      <EtatErreur
        erreur={erreurDestinataire}
        onReessayer={reessayerDestinataire}
        contexte="la discussion"
      />
    );
  if (etat.erreur)
    return (
      <EtatErreur
        erreur={etat.erreur}
        onReessayer={() => setVersion((v) => v + 1)}
        contexte="la discussion"
      />
    );
  const colonne = (
    <HistoriqueDiscussions
      discussions={historique.discussions}
      courante={etat.ouverture?.issueId ?? null}
      ouvert={historiqueOuvert}
      occupe={creation}
      indisponible={historique.indisponible}
      onChoisir={choisir}
      onNouvelle={() => void nouvelle()}
      onReessayer={historique.reessayer}
      onSupprimer={supprimer}
    />
  );
  if (etat.chargement && !etat.ouverture)
    return (
      <div className="atl-disc-cadre">
        <style>{STYLES_DISCUSSION}{STYLES_HISTORIQUE}</style>
        {colonne}
        <section className="atl-disc" aria-label="Discussion avec le Coordinateur">
          <Chargement libelle="Ouverture de la discussion" lignes={3} />
        </section>
      </div>
    );

  // Fil chronologique : messages et cartes des services mêlés, par date de création.
  const cartesServices = [...cartesVues.current.values()].filter(
    (c) =>
      issueOuverte !== null &&
      c.discussionId === issueOuverte &&
      (idsServices.has(c.element.id) || faits[`carte:${c.element.id}`]),
  );
  // Cartes des autres discussions ou sans discussion d'origine, et rappels « À faire » du client : repliés, jamais dans le fil.
  const cartesAilleurs = [...cartesVues.current.values()].filter(
    (c) =>
      c.discussionId !== issueOuverte &&
      (cartesHorsDiscussion.some((h) => h.element.id === c.element.id) || faits[`carte:${c.element.id}`]),
  );
  const autresDuClient = autres.filter(({ element }) => !cartesVues.current.has(element.id));
  const pointsEnAttente =
    elementsAFaire.length +
    svc.cartes.length +
    autresDuClient.filter(({ element }) => !faits[`carte:${element.id}`]).length +
    (connexionsManquantes.length > 0 ? 1 : 0);
  const filChrono: Array<{
    date: string;
    message?: MessageFil;
    carte?: CarteService;
  }> = [
    ...messages.map((message) => ({ date: message.date, message })),
    ...cartesServices.map((carte) => ({ date: carte.date, carte })),
  ].sort((a, b) => a.date.localeCompare(b.date) || ("message" in a ? -1 : 1));
  const vide =
    messages.length === 0 &&
    cartes.length === 0 &&
    cartesServices.length === 0;
  const raison =
    tentativeVide && texte.trim() === ""
      ? "Écrivez d'abord votre message."
      : null;
  /** Carte d'un autre service : en carte, ou en message de confirmation une fois traitée. */
  const rendreCarteService = (carte: CarteService, date: string) =>
    faits[`carte:${carte.element.id}`] ? (
      <MessageFait
        key={`svc-${carte.element.id}`}
        className="atl-disc-attente"
        texte={faits[`carte:${carte.element.id}`]!}
      />
    ) : (
      <CarteFil
        key={`svc-${carte.element.id}`}
        element={carte.element}
        origine={{
          companyId: carte.companyId,
          nom: carte.nom,
          slug: carte.slug,
          estDirection: false,
        }}
        date={date}
        libelleService
        onFait={(message) => traite(`carte:${carte.element.id}`, message)}
      />
    );
  const phrasePoints =
    pointsEnAttente > 1
      ? `${pointsEnAttente} points vous attendent`
      : "1 point vous attend";
  const nomCoordinateur = general ? "Coordinateur général" : "Coordinateur";

  return (
    <div className="atl-disc-cadre">
    <style>{STYLES_HISTORIQUE}</style>
    {colonne}
    <section className="atl-disc" aria-label="Discussion avec le Coordinateur">
      <style>{STYLES_DISCUSSION}{STYLES_FRISE}{STYLES_BANDE}</style>
      <div className="atl-disc-entete">
        <span
          className="atl-disc-avatar atl-disc-avatar-grand"
          aria-hidden="true"
        >
          C
        </span>
        <div className="atl-disc-entete-texte">
          <h1>{nomCoordinateur}</h1>
          {general ? (
            <span className="atl-attenue">
              Direction : il transmet aux départements
            </span>
          ) : null}
        </div>
        {/* Actions de l'en-tête, sur la même ligne : gestion des agents, réglages (avec l'identifiant du fil). */}
        <div className="atl-disc-entete-actions">
          <BasculeHistorique ouvert={historiqueOuvert} onBasculer={() => setHistoriqueOuvert((o) => !o)} />
          <GererLesAgents companyId={courante} />
          <ReglagesDuChat
            reglages={reglages}
            onChange={changerReglages}
            identifiant={etat.ouverture?.identifiant}
          />
        </div>
      </div>
      {/* Bande d'avancement épinglée : hors du fil (elle ne défile pas) et hors de la zone role="log". */}
      {general ? <BandeauMissions enCours={frises.enCours} terminees={frises.terminees} /> : null}
      <div ref={fil} className="atl-disc-fil">
        {/* Une seule ligne discrète : ce qui attend la personne hors de CETTE discussion (rappels « À faire », connexions, cartes des autres discussions). Repliée, hors du journal : rien ne s'insère dans le fil. */}
        {pointsEnAttente > 0 || afaire.confirmation || bilanGroupe ? (
          <details className="atl-disc-attentes" data-testid="points-en-attente">
            <summary>{pointsEnAttente > 0 ? phrasePoints : "Dernière action"}</summary>
            <MessageSituation
              nom={nomCoordinateur}
              connexions={connexionsManquantes}
              elements={elementsAFaire}
              onFait={afaire.surTraite}
              confirmation={afaire.confirmation}
              onFaitGroupe={afaire.surTraiteGroupe}
              decisionsServices={svc.cartes}
              onBilanActif={setBilanGroupe}
            />
            {cartesAilleurs.map((carte) => rendreCarteService(carte, carte.date))}
            {autresDuClient.map(({ element, origine }) =>
              faits[`carte:${element.id}`] ? (
                <MessageFait
                  key={element.id}
                  className="atl-disc-attente"
                  texte={faits[`carte:${element.id}`]!}
                />
              ) : (
                <CarteFil
                  key={element.id}
                  element={element}
                  origine={origine}
                  onFait={(message) => traite(`carte:${element.id}`, message)}
                />
              ),
            )}
          </details>
        ) : null}
        <div
          className="atl-disc-messages"
          role="log"
          aria-live="polite"
          aria-label="Messages de la discussion"
        >
          {vide ? (
            <div className="atl-disc-vide">
              <span
                className="atl-disc-avatar atl-disc-avatar-grand"
                aria-hidden="true"
              >
                C
              </span>
              <p>
                Que voulez-vous savoir ou demander à l'équipe ? État des
                missions, blocages, nouveaux leads, nouvelle prospection.
              </p>
            </div>
          ) : (
            filChrono.map(({ message: m, carte, date }) =>
              carte ? (
                rendreCarteService(carte, date)
              ) : m ? (
                <div
                  key={m.id}
                  className="atl-disc-bulle"
                  data-auteur={m.auteur}
                  data-actions={
                    m.actions && m.actions.length > 0 ? "oui" : undefined
                  }
                >
                  <span className="atl-disc-meta">
                    {m.auteur === "agent" ? (
                      <>
                        <span className="atl-disc-avatar" aria-hidden="true">
                          C
                        </span>
                        <span className="atl-disc-nom">{m.nom}</span>
                      </>
                    ) : (
                      <span className="atl-sr">{m.nom}</span>
                    )}
                    <time dateTime={m.date}>{dateHeure(m.date)}</time>
                  </span>
                  {m.texte.trim() === "" ? null : m.auteur === "agent" ? (
                    // Réponse du Coordinateur : Markdown de l'hôte (HTML brut ignoré, identifiants de tâche en liens).
                    <div className="atl-disc-texte atl-disc-md">
                      <MarkdownBlock content={abaisserTitres(m.texte)} />
                    </div>
                  ) : (
                    <p className="atl-disc-texte">
                      <TexteSur texte={m.texte} />
                    </p>
                  )}
                  {m.auteur === "agent" && m.actions && m.actions.length > 0 ? (
                    <ActionsMessage
                      idMessage={m.id}
                      actions={m.actions}
                      elements={elements}
                      origines={origines}
                      faits={faits}
                      onFait={traite}
                      services={services}
                      prefixes={prefixesServices}
                      actionnable={m.id === dernierAgentId}
                    />
                  ) : null}
                </div>
              ) : null,
            )
          )}
          {cartes
            .filter((c) => faits[`carte:${c.id}`])
            .map((c) => (
              <MessageFait
                key={c.id}
                className="atl-disc-attente"
                texte={faits[`carte:${c.id}`]!}
              />
            ))}
          {cartes
            .filter((c) => !faits[`carte:${c.id}`])
            .map((c) => (
              <CarteFil
                key={c.id}
                element={c}
                onFait={(message) => traite(`carte:${c.id}`, message)}
              />
            ))}
          {erreurElements || cartesIndisponibles || svc.indisponible ? (
            <ActionsIndisponibles
              onReessayer={() => {
                reessayerElements();
                svc.rafraichir();
                if (cartesIndisponibles) setVersion((v) => v + 1);
              }}
            />
          ) : null}
          {attenteDepuis !== null ? (
            <p className="atl-disc-attente" role="status">
              Le Coordinateur réfléchit…
            </p>
          ) : null}
        </div>
        {/* Pastilles dans le fil, sous l'accueil : elles défilent avec lui au lieu de rogner le fil depuis le pied collant. */}
        {vide ? (
          <div
            className="atl-disc-pastilles atl-disc-colonne"
            role="group"
            aria-label="Pour commencer"
          >
            {PASTILLES.map((p) => (
              <button
                key={p.libelle}
                type="button"
                className="atl-disc-suggestion"
                disabled={envoi}
                onClick={() => poserModele(p.texte)}
              >
                {p.libelle}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {erreurEnvoi ? (
        <p className="atl-disc-erreur atl-disc-colonne" role="alert">
          {erreurEnvoi}
        </p>
      ) : null}
      {/* Pied collant : le compositeur seul (message de situation et pastilles sont dans le fil). */}
      <div className="atl-disc-pied">
        <form
          className="atl-disc-saisie"
          onSubmit={(e) => {
            e.preventDefault();
            if (texte.trim() === "") setTentativeVide(true);
            void envoyer(texte);
          }}
        >
          <textarea
            ref={champ}
            aria-label="Votre message au Coordinateur"
            placeholder="Écrivez au Coordinateur"
            rows={1}
            maxLength={MAX_TEXTE}
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value);
              setTentativeVide(false);
            }}
            onKeyDown={surTouche}
          />
          <div className="atl-disc-emplacements">
            {reglages.dictee ? (
              <div data-emplacement="dicter">
                <BoutonDicter
                  companyId={companyId ?? null}
                  onTexte={(t) =>
                    setTexte((actuel) =>
                      actuel.trim() === "" ? t : `${actuel.trimEnd()} ${t}`,
                    )
                  }
                />
              </div>
            ) : null}
            <div data-emplacement="parler-en-direct">
              <VoixEnDirect companyId={companyId ?? null} />
            </div>
          </div>
          {raison ? (
            <span id={idRaison} className="atl-disc-raison">
              {raison}
            </span>
          ) : null}
          <button
            type="submit"
            className="atl-disc-envoyer"
            title="Envoyer (Entrée)"
            aria-disabled={texte.trim() === "" || envoi ? "true" : undefined}
            aria-busy={envoi || undefined}
            aria-describedby={raison ? idRaison : undefined}
          >
            <IconeEnvoi />
            <span className="atl-sr">{envoi ? "Envoi…" : "Envoyer"}</span>
          </button>
        </form>
      </div>
    </section>
    </div>
  );
}
