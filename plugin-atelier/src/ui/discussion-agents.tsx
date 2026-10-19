/**
 * Carte « agents » de la Discussion : allumer ou couper des agents sur demande du Coordinateur général.
 *
 * Sécurité (point critique) :
 * - le Coordinateur ne fournit qu'un service (ou « tous »), une opération et des NOMS d'agents : aucun identifiant
 *   d'entreprise ni d'agent. Le service est résolu parmi les services déclarés du client de la Discussion ;
 * - AUCUN appel en écriture au montage ni aux relectures : la carte ne fait que LIRE (`GET …/agents`) pour calculer
 *   l'effet exact et l'afficher. Seul le clic de l'humain sur « Confirmer » déclenche les POST pause/resume ;
 * - au clic, les agents sont relus puis l'effet est recalculé : on n'agit jamais sur un état périmé, et un agent déjà
 *   dans l'état voulu n'est pas touché ;
 * - on n'agit JAMAIS sur un agent que l'humain n'a pas vu à l'écran : au clic, seuls les agents AFFICHÉS qui sont encore
 *   concernés sont touchés ; si de nouvelles cibles sont apparues, aucun POST, la carte se met à jour et demande de
 *   confirmer à nouveau ;
 * - « allumer » ne rallume jamais une pause pour budget ni pour entreprise archivée ;
 * - seule la carte du dernier message du Coordinateur est actionnable (les états « faits » ne vivent qu'en mémoire) ;
 * - les services sont filtrés comme dans le tiroir (`gardesDuClientCourant`) : jamais un autre client de l'instance ;
 * - l'agent ceo de la Direction (le Coordinateur général lui-même) n'est jamais visé, ni par « tous » ni par « direction ».
 * Lectures et écritures passent par l'API de l'hôte avec les droits de l'utilisateur (comme le tiroir « Agents en service »).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionDiscussion } from "../serveur/discussion-actions.js";
import { MOTIFS_PAUSE, type DepartementDeclare } from "../contrats/departements.js";
import { MessageFait } from "./composants.js";
import { ciblesAction, cheminAction, gardesDuClientCourant } from "./composants/agents-en-service.js";
import { appelHote } from "./hote.js";
import { agentsDepuisHote, type AgentHote } from "./organigramme-arbre.js";
import { departementsVisibles, enParallele, lireEntreprises, LECTURES_SIMULTANEES, type EntrepriseHote } from "./vues/departements.js";

export type ActionAgentsDiscussion = Extract<ActionDiscussion, { type: "agents" }>;

/** Au-delà, la liste des noms est repliée (un client compte plus de 200 agents). */
const NOMS_VISIBLES = 12;

const messageDe = (e: unknown) => (typeof (e as { message?: unknown } | null)?.message === "string" ? (e as { message: string }).message : "erreur inconnue");
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const normaliser = (nom: string) => nom.trim().toLocaleLowerCase("fr");

interface Lu {
  service: DepartementDeclare;
  agents: AgentHote[];
}

/** Pauses qu'« allumer » ne lève jamais d'office : le budget et l'archivage ont leur propre décision. */
const PAUSES_NON_RALLUMEES: ReadonlySet<string> = new Set(["budget", "company_archived"]);
const motifDe = (a: AgentHote) => (a.pauseReason ? (MOTIFS_PAUSE[a.pauseReason] ?? a.pauseReason) : "motif non précisé");

export interface GroupeEffet {
  service: DepartementDeclare;
  agents: AgentHote[];
}

export interface EffetAgents {
  /** Agents qui seront touchés, à plat (ordre des services). */
  cibles: AgentHote[];
  /** Les mêmes, groupés par service (deux homonymes de services différents restent distinguables). */
  groupes: GroupeEffet[];
  introuvables: string[];
  /** « Allumer » : agents en pause pour budget ou entreprise archivée, volontairement laissés en pause. */
  nonRallumes: AgentHote[];
}

/** Services visés par l'action : un service précis, ou tous ; `null` si le service n'est pas déclaré pour ce client. */
export function servicesVises(action: ActionAgentsDiscussion, services: readonly DepartementDeclare[] | null | undefined): DepartementDeclare[] | null {
  if (!services || services.length === 0) return null;
  if (action.service === "tous") return [...services];
  const s = services.find((x) => x.slug === action.service);
  return s ? [s] : null;
}

/**
 * Effet calculé de l'action sur les agents LUS : noms rapprochés sans casse (les noms sans correspondance sont
 * rapportés), l'agent ceo de la Direction (le Coordinateur général, qui tient le chat) toujours écarté, puis seuls les agents qui changent d'état restent
 * (allumer = en pause, hors pause budget ou entreprise archivée ; couper = pas déjà en pause).
 */
export function calculerEffet(action: ActionAgentsDiscussion, lus: readonly Lu[]): EffetAgents {
  const pool = lus.flatMap((l) => l.agents.filter((a) => !(l.service.estDirection && a.role === "ceo")).map((a) => ({ a, service: l.service })));
  let retenus: typeof pool;
  const introuvables: string[] = [];
  if (action.agents && action.agents.length > 0) {
    const vus = new Set<string>();
    retenus = [];
    for (const nom of action.agents) {
      const trouves = pool.filter((p) => normaliser(p.a.name) === normaliser(nom));
      if (trouves.length === 0) introuvables.push(nom);
      for (const p of trouves) if (!vus.has(p.a.id)) retenus.push(p), vus.add(p.a.id);
    }
  } else {
    retenus = pool;
  }
  const changent = new Set(ciblesAction(action.operation, retenus.map((p) => p.a)).map((a) => a.id));
  const nonRallumes: AgentHote[] = [];
  const groupes: GroupeEffet[] = [];
  for (const p of retenus) {
    if (!changent.has(p.a.id)) continue;
    if (action.operation === "allumer" && p.a.pauseReason && PAUSES_NON_RALLUMEES.has(p.a.pauseReason)) {
      nonRallumes.push(p.a);
      continue;
    }
    const groupe = groupes.find((g) => g.service.companyId === p.service.companyId);
    if (groupe) groupe.agents.push(p.a);
    else groupes.push({ service: p.service, agents: [p.a] });
  }
  return { cibles: groupes.flatMap((g) => g.agents), groupes, introuvables, nonRallumes };
}

async function lireServices(vises: readonly DepartementDeclare[]): Promise<Lu[]> {
  const lus: Lu[] = [];
  await enParallele(vises, LECTURES_SIMULTANEES, async (service) => {
    const brut = await appelHote<unknown>("GET", `/companies/${encodeURIComponent(service.companyId)}/agents`);
    lus.push({ service, agents: agentsDepuisHote(brut) });
  });
  // Ordre des services conservé (les lectures se terminent dans un ordre quelconque).
  return vises.map((s) => lus.find((l) => l.service.companyId === s.companyId)!);
}

interface Bilan {
  reussis: number;
  refus: Array<{ nom: string; raison: string }>;
}

export function messageBilan(operation: ActionAgentsDiscussion["operation"], b: Bilan): string {
  const ok = operation === "allumer" ? (b.reussis > 1 ? "allumés" : "allumé") : b.reussis > 1 ? "coupés" : "coupé";
  const refus = b.refus.length > 1 ? "refusés" : "refusé";
  return [b.reussis > 0 ? `${b.reussis} ${ok}` : null, b.refus.length > 0 ? `${b.refus.length} ${refus}` : null].filter(Boolean).join(", ") || "Aucun agent concerné";
}

export interface PropsCarteAgents {
  action: ActionAgentsDiscussion;
  /** Services déclarés du client de la Discussion (null : client sans services déclarés). */
  services: readonly DepartementDeclare[] | null | undefined;
  /** Message de confirmation si l'action a déjà été faite (clé `cleAction`, comme les autres actions). */
  fait?: string;
  onFait(message: string): void;
  /** Faux pour une carte d'un message précédent : ni lecture ni bouton (le « fait » n'est gardé qu'en mémoire). */
  actionnable?: boolean;
}

export const MESSAGE_SITUATION_CHANGEE = "La situation a changé, vérifiez et confirmez à nouveau.";
const TAILLE_NOM_INTROUVABLE = 40;
const tronquer = (t: string) => (t.length > TAILLE_NOM_INTROUVABLE ? `${t.slice(0, TAILLE_NOM_INTROUVABLE)}…` : t);

/**
 * Services de la carte : la déclaration filtrée comme dans le tiroir « Agents en service » (entreprises visibles par
 * l'utilisateur et du client courant seulement). `undefined` tant que la liste des entreprises n'est pas lue ; si elle
 * est illisible (`null`), la déclaration fait foi, comme dans le tiroir.
 */
function servicesFiltres(services: readonly DepartementDeclare[] | null | undefined, entreprises: readonly EntrepriseHote[] | null | undefined): readonly DepartementDeclare[] | null | undefined {
  if (!services || services.length === 0) return services;
  if (entreprises === undefined) return undefined;
  if (entreprises === null) return services;
  const courant = (services.find((s) => s.courant) ?? services.find((s) => s.estDirection) ?? services[0]!).companyId;
  const croises = gardesDuClientCourant(departementsVisibles(services, entreprises), courant);
  return croises.length > 0 ? croises.map(({ companyId, slug, nom, estDirection, courant: c }) => ({ companyId, slug, nom, estDirection, courant: c })) : services;
}

export function CarteAgents({ action, services, fait, onFait, actionnable = true }: PropsCarteAgents) {
  const actif0 = actionnable && !fait;
  const [entreprises, setEntreprises] = useState<EntrepriseHote[] | null | undefined>(undefined);
  useEffect(() => {
    if (!actif0 || !services || services.length === 0) return;
    let annule = false;
    lireEntreprises().then(
      (l) => !annule && setEntreprises(l),
      () => !annule && setEntreprises(null),
    );
    return () => {
      annule = true;
    };
  }, [actif0, services]);
  const servicesCarte = useMemo(() => servicesFiltres(services, entreprises), [services, entreprises]);
  const vises = servicesVises(action, servicesCarte);
  const cleServices = vises ? vises.map((s) => s.companyId).join("|") : "";
  const enAttenteServices = servicesCarte === undefined && !!services && services.length > 0;
  const [etat, setEtat] = useState<{ phase: "chargement" } | { phase: "erreur"; message: string } | { phase: "pret"; effet: EffetAgents }>({ phase: "chargement" });
  const [essai, setEssai] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [changement, setChangement] = useState(false);
  const actif = useRef(true);
  /** Garde synchrone contre le double clic (l'état `envoi` n'est à jour qu'au rendu suivant). */
  const enCours = useRef(false);
  /** Identifiants des agents AFFICHÉS à l'humain : le clic n'agit jamais en dehors. */
  const affiches = useRef<ReadonlySet<string>>(new Set());
  affiches.current = new Set(etat.phase === "pret" ? etat.effet.cibles.map((a) => a.id) : []);

  useEffect(() => {
    actif.current = true;
    return () => {
      actif.current = false;
    };
  }, []);

  // LECTURE SEULE : le montage et les relectures ne font que des GET. Aucune écriture ici, jamais (voir l'en-tête).
  useEffect(() => {
    if (!vises || fait || !actionnable || enAttenteServices) return;
    let annule = false;
    setEtat({ phase: "chargement" });
    setChangement(false);
    lireServices(vises)
      .then((lus) => {
        if (!annule) setEtat({ phase: "pret", effet: calculerEffet(action, lus) });
      })
      .catch((e: unknown) => {
        if (!annule) setEtat({ phase: "erreur", message: messageDe(e) });
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `vises` suit `cleServices` ; `action` est stable par message.
  }, [cleServices, essai, fait, actionnable, enAttenteServices, action.operation, action.service, JSON.stringify(action.agents ?? null)]);

  const confirmer = useCallback(async () => {
    if (!vises || enCours.current || !actionnable) return;
    enCours.current = true;
    setEnvoi(true);
    setChangement(false);
    try {
      // Relecture juste avant d'agir : l'effet est recalculé sur l'état réel, pas sur celui affiché plus tôt.
      let effet: EffetAgents;
      try {
        effet = calculerEffet(action, await lireServices(vises));
      } catch (e) {
        if (actif.current) setEtat({ phase: "erreur", message: messageDe(e) });
        return;
      }
      // Jamais d'agent que l'humain n'a pas vu : de nouvelles cibles = aucune écriture, affichage mis à jour.
      const vus = affiches.current;
      if (effet.cibles.some((a) => !vus.has(a.id))) {
        if (actif.current) {
          setEtat({ phase: "pret", effet });
          setChangement(true);
        }
        return;
      }
      const cibles = effet.cibles.filter((a) => vus.has(a.id));
      const refus: Bilan["refus"] = [];
      let reussis = 0;
      await enParallele(cibles, LECTURES_SIMULTANEES, async (a) => {
        try {
          await appelHote("POST", cheminAction(action.operation, a.id));
          reussis++;
        } catch (e) {
          refus.push({ nom: a.name, raison: messageDe(e) });
        }
      });
      const b: Bilan = { reussis, refus };
      if (actif.current) setBilan(b);
      onFait(messageBilan(action.operation, b));
    } finally {
      enCours.current = false;
      if (actif.current) setEnvoi(false);
    }
  }, [vises, action, onFait, actionnable]);

  const couper = action.operation === "couper";
  const refusAffiches = bilan && bilan.refus.length > 0 ? (
    <ul className="atl-disc-ag-refus">
      {bilan.refus.map((r, i) => (
        <li key={`${r.nom}-${i}`}>{`${r.nom} : ${r.raison}`}</li>
      ))}
    </ul>
  ) : null;

  if (fait) {
    return (
      <div className="atl-disc-ag">
        <MessageFait element="p" className="atl-disc-fait" texte={fait} />
        {refusAffiches}
      </div>
    );
  }
  if (!actionnable) {
    return (
      <div className="atl-disc-ag">
        <p className="atl-disc-ag-ancienne">Action d'un message précédent : elle n'est plus proposée. Demandez-la de nouveau au Coordinateur.</p>
      </div>
    );
  }
  if (!enAttenteServices && !vises) {
    return (
      <div className="atl-disc-ag">
        <p role="status">{`Service introuvable : « ${action.service} » n'est pas un service de ce client.`}</p>
      </div>
    );
  }
  if (enAttenteServices || etat.phase === "chargement") {
    return (
      <div className="atl-disc-ag">
        <p role="status">Lecture des agents…</p>
      </div>
    );
  }
  if (etat.phase === "erreur") {
    return (
      <div className="atl-disc-ag">
        <p role="alert" className="atl-disc-erreur">
          {`Lecture des agents impossible : ${etat.message}`}{" "}
          <button type="button" className="atl-bouton" onClick={() => setEssai((n) => n + 1)}>
            Réessayer
          </button>
        </p>
      </div>
    );
  }

  const { cibles, groupes, introuvables, nonRallumes } = etat.effet;
  const lieu = action.service === "tous" ? "de tous les services" : `de ${vises![0]!.nom}`;
  const detail = (
    <div className="atl-disc-ag-noms">
      {groupes.map((g) => (
        <p key={g.service.companyId}>
          <strong>{g.service.nom}</strong>
          {" : "}
          {g.agents.map((a) => (couper ? a.name : `${a.name} (${motifDe(a)})`)).join(", ")}
        </p>
      ))}
    </div>
  );
  const motifsNonRallumes = [...new Set(nonRallumes.map(motifDe))].join(", ");
  return (
    <div className="atl-disc-ag">
      {changement ? (
        <p role="alert" className="atl-disc-ag-changement">
          {MESSAGE_SITUATION_CHANGEE}
        </p>
      ) : null}
      {cibles.length > 0 ? (
        <>
          <p className="atl-disc-carte-titre">{`${couper ? "Couper" : "Allumer"} ${pluriel(cibles.length, "agent", "agents")} ${lieu}`}</p>
          {cibles.length <= NOMS_VISIBLES ? (
            detail
          ) : (
            <details className="atl-disc-ag-noms">
              <summary>{`Voir les ${cibles.length} noms`}</summary>
              {detail}
            </details>
          )}
        </>
      ) : (
        <p>{`Rien à ${couper ? "couper" : "allumer"} ${lieu} : ${couper ? "les agents visés sont déjà en pause" : "aucun agent visé n'est en pause"}.`}</p>
      )}
      {nonRallumes.length > 0 ? <p className="atl-disc-ag-introuvables">{`${pluriel(nonRallumes.length, "agent non rallumé", "agents non rallumés")} : ${motifsNonRallumes}`}</p> : null}
      {introuvables.length > 0 ? (
        <div className="atl-disc-ag-introuvables">
          <p>{pluriel(introuvables.length, "nom introuvable", "noms introuvables")}</p>
          <details>
            <summary>Voir les noms</summary>
            <p>{introuvables.map(tronquer).join(", ")}</p>
          </details>
        </div>
      ) : null}
      {refusAffiches}
      {cibles.length > 0 ? (
        <div className="atl-disc-ag-bouton">
          <button type="button" className="atl-bouton" data-variante={couper ? "danger" : undefined} disabled={envoi} onClick={() => void confirmer()}>
            {envoi ? "En cours…" : "Confirmer"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
