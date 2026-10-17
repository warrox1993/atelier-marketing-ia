/**
 * Télécommande de la Discussion : boutons d'actions sous un message du Coordinateur et cartes de
 * questions en attente dans le fil.
 *
 * - `ouvrir` : lien vers une rubrique de l'atelier (liste fermée, libellé fixe, jamais d'URL libre) ;
 * - `traiter` : déplie EN PLACE le panneau de `accueil-sur-place.tsx` (aucune logique dupliquée) pour
 *   l'élément « À faire » visé. L'élément est cherché dans l'Accueil de l'entreprise courante : un
 *   identifiant inconnu ou d'une autre entreprise n'y figure pas, et le bouton est alors ignoré.
 * Une action de type ou de cible inconnus est ignorée (avertissement console), jamais une erreur visible.
 */
import { useEffect, useState, type ReactElement } from "react";
import { parametresDepuisFiltre } from "../contrats/filtre-prospects.js";
import type { ActionDiscussion } from "../serveur/discussion-actions.js";
import type { ElementAccueil } from "../serveur/services-accueil.js";
import type { DepartementDeclare } from "../contrats/departements.js";
import { SurPlace, natifSeulement, traitableSurPlace } from "./accueil-sur-place.js";
import { LienHote, MessageFait } from "./composants.js";
import { MINIMUM_DEPARTEMENTS } from "./departements-sonde.js";
import { appelRoute } from "./routes-prospection.js";
import { chemin, type CleVue } from "./route.js";
import { enParallele, lireEntreprises } from "./vues/departements.js";

export const LIBELLES_CIBLES: Readonly<Record<string, string>> = {
  accueil: "Voir ce qui est à faire",
  prospects: "Voir les prospects",
  carte: "Voir la carte des prospects",
  campagnes: "Voir les campagnes",
  contenus: "Voir les contenus",
  calendrier: "Voir le calendrier",
  resultats: "Voir les résultats",
  equipe: "Voir l'équipe",
  marque: "Voir la marque",
  connaissances: "Voir les connaissances",
  "mise-en-place": "Voir la mise en place",
  parametres: "Voir les paramètres",
  corbeille: "Voir la corbeille",
};

/** Libellé du bouton « traiter », tiré de l'élément visé (le Coordinateur ne fournit aucun libellé libre). */
export function libelleTraiter(e: ElementAccueil): string {
  if (e.interaction?.kind === "ask_user_questions") {
    const n = e.interaction.questions.length;
    return n > 1 ? `Répondre aux ${n} questions` : "Répondre à la question";
  }
  if (e.interaction) return "Répondre à la demande de confirmation";
  if (e.approbationId) return "Approuver ou refuser";
  if (e.type === "contenu_a_valider") return "Approuver ce contenu";
  return "Voir pourquoi c'est bloqué";
}

export const cleAction = (a: ActionDiscussion): string => (a.type === "ouvrir" ? `ouvrir:${a.cible}${a.filtre ? `:${JSON.stringify(a.filtre)}` : ""}` : `traiter:${a.element}`);

/**
 * Adresse d'une action `ouvrir`. Le filtre (facultatif) n'a de sens que pour les prospects : correspondance
 * explicite vers les paramètres d'adresse lus par la liste, champ inconnu ou invalide ignoré.
 */
export function cheminOuvrir(a: Extract<ActionDiscussion, { type: "ouvrir" }>): string {
  const base = chemin(a.cible as CleVue);
  if (a.cible !== "prospects") return base;
  const q = parametresDepuisFiltre(a.filtre).toString();
  return q ? `${base}?${q}` : base;
}

/** Identifiants d'éléments visés par des actions `traiter` (ordre stable, sans doublon). */
export function elementsVises(messages: ReadonlyArray<{ actions?: ActionDiscussion[] }>): string[] {
  const ids = new Set<string>();
  for (const m of messages) for (const a of m.actions ?? []) if (a.type === "traiter") ids.add(a.element);
  return [...ids].sort();
}

/**
 * Éléments de « À faire » de l'entreprise courante, lus seulement quand un message porte une action
 * `traiter`. Relu quand l'ensemble des éléments visés change, après un traitement (`version`) ou sur
 * demande (`reessayer`). Une lecture ratée est signalée (`erreur`) : jamais de bouton muet.
 */
export function useElementsAFaire(
  companyId: string | null | undefined,
  vises: readonly string[],
  version: number,
): { elements: Map<string, ElementAccueil>; erreur: boolean; reessayer(): void } {
  const [elements, setElements] = useState<Map<string, ElementAccueil>>(new Map());
  const [erreur, setErreur] = useState(false);
  const [essai, setEssai] = useState(0);
  const cle = vises.join("|");
  useEffect(() => {
    if (!companyId || cle === "") {
      setErreur(false);
      return;
    }
    let annule = false;
    appelRoute<{ elements: ElementAccueil[] }>("GET", `/accueil?companyId=${encodeURIComponent(companyId)}`)
      .then((r) => {
        if (annule) return;
        setElements(new Map(r.elements.map((e) => [e.id, e])));
        setErreur(false);
      })
      .catch(() => {
        if (annule) return;
        setElements(new Map());
        setErreur(true);
      });
    return () => {
      annule = true;
    };
  }, [companyId, cle, version, essai]);
  return { elements, erreur, reessayer: () => setEssai((n) => n + 1) };
}

/** Service d'où vient un élément de « À faire » : la décision se prend dans cette entreprise. */
export interface OrigineElement {
  companyId: string;
  nom: string;
  estDirection: boolean;
}

/** Intervalle de relecture du « À faire » des départements (onglet visible seulement). */
export const INTERVALLE_DEPARTEMENTS_MS = 30_000;

/** Lectures du « À faire » simultanées au plus (un client compte au plus 14 services). */
const LECTURES_AFAIRE_SIMULTANEES = 4;

/** Types d'éléments proposés dans le fil : ceux qui attendent une décision de la personne. */
export const estDecisionAttendue = (e: ElementAccueil): boolean => Boolean(e.interaction || e.approbationId || e.liaison || e.type === "contenu_a_valider");

export interface AFaireClient {
  elements: Map<string, ElementAccueil>;
  /** Service d'origine de chaque élément (vide hors client à plusieurs services). */
  origines: Map<string, OrigineElement>;
  /** Éléments des départements autres que la Direction, à proposer dans le fil. */
  autres: Array<{ element: ElementAccueil; origine: OrigineElement }>;
  erreur: boolean;
  reessayer(): void;
}

/**
 * « À faire » de TOUT le client. Client à plusieurs services : une lecture `/accueil` par service avec le companyId de
 * SON service (l'hôte refuse tout autre appel), chaque lien est préfixé par celui de son entreprise, et chaque élément
 * garde son service d'origine (la décision se prend là). Un service illisible, ou dont le préfixe est inconnu, est
 * signalé (`erreur`) sans masquer les autres. Sinon (lecture des services en échec, un seul service) : comportement
 * historique, `useElementsAFaire` sur l'entreprise du fil.
 */
export function useAFaireClient(
  companyId: string | null | undefined,
  services: readonly DepartementDeclare[] | null | undefined,
  vises: readonly string[],
  version: number,
): AFaireClient {
  const multi = (services?.length ?? 0) >= MINIMUM_DEPARTEMENTS;
  const simple = useElementsAFaire(multi ? null : companyId, vises, version);
  const [etat, setEtat] = useState<Omit<AFaireClient, "reessayer">>({ elements: new Map(), origines: new Map(), autres: [], erreur: false });
  const [essai, setEssai] = useState(0);
  const [tic, setTic] = useState(0);
  useEffect(() => {
    if (!multi) return;
    const minuteur = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") setTic((n) => n + 1);
    }, INTERVALLE_DEPARTEMENTS_MS);
    return () => clearInterval(minuteur);
  }, [multi]);
  useEffect(() => {
    if (!multi || !services) return;
    let annule = false;
    void (async () => {
      const entreprises = await lireEntreprises().catch(() => []);
      const prefixes = new Map(entreprises.map((e) => [e.id, e.issuePrefix]));
      const resultats = new Map<string, ElementAccueil[] | null>();
      await enParallele(services, LECTURES_AFAIRE_SIMULTANEES, async (s) => {
        try {
          const r = await appelRoute<{ elements?: ElementAccueil[] }>("GET", `/accueil?companyId=${encodeURIComponent(s.companyId)}`);
          resultats.set(s.companyId, Array.isArray(r?.elements) ? r.elements : null);
        } catch {
          resultats.set(s.companyId, null);
        }
      });
      if (annule) return;
      const elements = new Map<string, ElementAccueil>();
      const origines = new Map<string, OrigineElement>();
      const autres: AFaireClient["autres"] = [];
      let erreur = false;
      // Direction d'abord : en cas d'identifiant commun, son élément l'emporte.
      for (const s of [...services].sort((a, b) => Number(b.estDirection) - Number(a.estDirection))) {
        const liste = resultats.get(s.companyId);
        const prefixe = prefixes.get(s.companyId);
        if (!liste || (!s.estDirection && !prefixe)) {
          erreur = true;
          continue;
        }
        const origine: OrigineElement = { companyId: s.companyId, nom: s.nom, estDirection: s.estDirection };
        for (const brut of liste) {
          // Lien relatif à l'entreprise d'origine : préfixé pour rester valable depuis la Direction.
          const element = prefixe && brut.lien.startsWith("/") ? { ...brut, lien: `/${prefixe}${brut.lien}` } : brut;
          if (elements.has(element.id)) continue;
          elements.set(element.id, element);
          origines.set(element.id, origine);
          if (!s.estDirection && estDecisionAttendue(element)) autres.push({ element, origine });
        }
      }
      setEtat({ elements, origines, autres, erreur });
    })();
    return () => {
      annule = true;
    };
  }, [multi, services, version, essai, tic]);
  if (!multi) return { elements: simple.elements, origines: new Map(), autres: [], erreur: simple.erreur, reessayer: simple.reessayer };
  return { ...etat, reessayer: () => setEssai((n) => n + 1) };
}

/** Message et bouton affichés quand les actions ou les cartes de la Discussion n'ont pas pu être lues. */
export function ActionsIndisponibles({ onReessayer }: { onReessayer(): void }) {
  return (
    <p className="atl-disc-erreur" role="alert">
      Actions indisponibles.{" "}
      <button type="button" className="atl-bouton" onClick={onReessayer}>
        Réessayer
      </button>
    </p>
  );
}

export interface PropsActions {
  /** Message porteur : préfixe des clés d'état, pour que deux messages visant le même élément restent indépendants. */
  idMessage: string;
  actions: readonly ActionDiscussion[];
  elements: ReadonlyMap<string, ElementAccueil>;
  /** Actions déjà traitées, avec le message de confirmation à afficher à la place du bouton. */
  faits: Readonly<Record<string, string>>;
  onFait(cle: string, message: string): void;
  /** Service d'origine des éléments (client à plusieurs services) : affiché devant le bouton, décision prise là. */
  origines?: ReadonlyMap<string, OrigineElement>;
}

/** Étiquette du service d'origine d'un élément. */
export function EtiquetteService({ nom }: { nom: string }) {
  return (
    <span className="atl-disc-dep" title="Service concerné">
      {nom}
    </span>
  );
}

export function ActionsMessage({ idMessage, actions, elements, faits, onFait, origines }: PropsActions) {
  const [ouverts, setOuverts] = useState<ReadonlySet<string>>(new Set());
  const boutons: Array<{ cle: string; bouton: ReactElement; panneau: ReactElement | null; service?: string }> = [];
  for (const a of actions) {
    const cle = `${idMessage}:${cleAction(a)}`;
    if (a.type === "ouvrir") {
      const libelle = LIBELLES_CIBLES[a.cible];
      if (!libelle) {
        console.warn("Discussion : cible d'action inconnue, bouton ignoré", a.cible);
        continue;
      }
      boutons.push({
        cle,
        bouton: (
          <LienHote vers={cheminOuvrir(a)} className="atl-bouton">
            {libelle}
          </LienHote>
        ),
        panneau: null,
      });
    } else if (a.type === "traiter") {
      const e = elements.get(a.element);
      const origine = origines?.get(a.element);
      if (faits[cle]) {
        boutons.push({ cle, bouton: <MessageFait element="span" className="atl-disc-fait" texte={faits[cle]!} />, panneau: null });
        continue;
      }
      if (e && natifSeulement(e)) {
        // Demande d'accès, budget, type inconnu ou carte qui exécute un outil : jamais de décision ici.
        boutons.push({
          cle,
          bouton: (
            <LienHote vers={e.lien} className="atl-bouton">
              {e.approbationId ? "Examiner dans la page native" : "Ouvrir la tâche"}
            </LienHote>
          ),
          panneau: null,
          service: origine?.nom,
        });
        continue;
      }
      if (!e || !traitableSurPlace(e)) continue;
      const ouvert = ouverts.has(cle);
      boutons.push({
        cle,
        bouton: (
          <button
            type="button"
            className="atl-bouton"
            data-variante="principal"
            aria-expanded={ouvert}
            onClick={() => setOuverts((o) => (o.has(cle) ? new Set([...o].filter((x) => x !== cle)) : new Set([...o, cle])))}
          >
            {ouvert ? "Replier" : libelleTraiter(e)}
          </button>
        ),
        panneau: ouvert ? <SurPlace element={e} companyId={origine?.companyId} onFait={(m) => onFait(cle, m)} /> : null,
        service: origine?.nom,
      });
    } else {
      console.warn("Discussion : type d'action inconnu, bouton ignoré", (a as { type?: unknown }).type);
    }
  }
  if (boutons.length === 0) return null;
  return (
    <div className="atl-disc-actions">
      <div className="atl-disc-actions-boutons">
        {boutons.map((b) => (
          <span key={b.cle}>
            {b.service ? <EtiquetteService nom={b.service} /> : null}
            {b.bouton}
          </span>
        ))}
      </div>
      {boutons.map((b) => (b.panneau ? <div key={b.cle} className="atl-disc-panneau">{b.panneau}</div> : null))}
    </div>
  );
}

/** Carte native en attente, affichée dans le fil comme un message du Coordinateur, répondable en place. */
export function CarteFil({ element, onFait, origine }: { element: ElementAccueil; onFait(message: string): void; origine?: OrigineElement }) {
  return (
    <div className="atl-disc-bulle" data-auteur="agent" data-carte="oui" data-service={origine ? origine.nom : undefined}>
      <span className="atl-disc-meta">
        {origine ? <EtiquetteService nom={origine.nom} /> : null}
        {origine ? "En attente de votre décision" : "Coordinateur · en attente de votre réponse"}
      </span>
      <div className="atl-disc-texte atl-disc-carte">
        <p className="atl-disc-carte-titre">{element.titre}</p>
        <div className="atl-disc-panneau">
          <SurPlace element={element} companyId={origine?.companyId} onFait={onFait} />
        </div>
      </div>
    </div>
  );
}
