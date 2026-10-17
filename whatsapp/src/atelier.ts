/**
 * Client de l'instance Paperclip (boucle locale) : uniquement les routes que l'interface de l'atelier appelle déjà,
 * pour que chaque décision suive exactement le même chemin et les mêmes gardes.
 *
 * Identité : en mode `local_trusted`, toute requête sans jeton porteur est attribuée par Paperclip au board humain
 * « local-board » (paperclip/server/src/middleware/auth.ts, actorMiddleware), que le plugin traduit en acteur
 * `humain` (plugin-atelier/src/serveur/atelier.ts, acteurDepuisRequete). La passerelle n'envoie donc jamais
 * d'en-tête d'agent (`x-paperclip-run-id`) ; en mode authentifié, ATELIER_CLE_BOARD fournit une clé board.
 *
 * - discussion : routes du plugin `discussion.envoyer` et `discussion.messages` (onglet Discussion) ;
 * - « À faire » : `accueil.lister`, services du client par `departements.lister` ;
 * - contenu à valider : `tache.dossier` (?vue=complete) puis `tache.decision` (même garde que `decider`), puis la
 *   même transition native que l'écran (PATCH /issues/:id) ;
 * - approbation native : POST /approvals/:id/approve|reject ; carte de confirmation : POST
 *   /issues/:id/interactions/:id/accept|reject ; liaison : route du plugin `liaison.decider` ;
 * - agents et services : POST /agents/:id/pause|resume, PATCH /companies/:id {status}.
 */
import type { Config } from "./config.js";

export class ErreurAtelier extends Error {
  constructor(message: string, readonly statut: number) {
    super(message);
  }
}

export interface MessageDiscussion {
  id: string;
  auteur: "humain" | "agent";
  nom: string;
  texte: string;
  date: string;
}

export interface ElementAccueil {
  id: string;
  type: string;
  urgence: string;
  titre: string;
  raison: string;
  lien: string;
  action: string;
  issueId?: string;
  approbationId?: string;
  approbation?: { type: string; surPlace: boolean; demandeur: string; lignes: Array<{ libelle: string; valeur: string }> };
  interaction?: {
    id: string;
    kind: string;
    invite: string | null;
    details: string | null;
    refusRaisonObligatoire: boolean;
    natifSeulement: boolean;
  };
  liaison?: { liaisonId: string; serviceSource: string; serviceCible: string; objet: string; question: string; extraits: Array<{ titre: string; texte: string }> };
}

export interface Departement {
  companyId: string;
  slug: string;
  nom: string;
  estDirection: boolean;
}

export interface AppelPropose {
  id: string;
  revisionId: string;
  service: string;
  outil: string;
  action: "publier" | "envoyer" | "modifier_crm";
  compte: string;
  empreinte: string;
  apercu: { resume: string };
  approbation: { id: string; service: string; outil: string; compte: string; empreinte: string };
  revisionCourante: boolean;
}

export interface Dossier {
  issueId: string;
  companyId: string;
  titre: string;
  mode: string;
  statut: { statut: string; motif: string };
  livrable: { revisionId: string; revisionNumber: number; titre: string | null; corps: string } | null;
  evaluationPorte?: { decision: string; perimee: boolean; revisionId: string } | null;
  appelsProposes: AppelPropose[];
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  companyId: string;
}

export interface EvenementJournal {
  seq: number;
  type: string;
  issueId: string | null;
  donnees: Record<string, unknown>;
}

export interface ClientAtelier {
  envoyerDiscussion(texte: string): Promise<{ id: string; date: string }>;
  messagesDiscussion(depuis: string | null): Promise<MessageDiscussion[]>;
  departements(): Promise<Departement[]>;
  accueil(companyId: string): Promise<ElementAccueil[]>;
  dossier(issueId: string): Promise<Dossier>;
  decider(issueId: string, corps: Record<string, unknown>): Promise<{ id?: string; transmission?: { transmission?: string } }>;
  transitionTache(issueId: string, statut: "done" | "in_progress", commentaire: string): Promise<void>;
  deciderApprobation(approbationId: string, decision: "approve" | "reject", note: string | null): Promise<void>;
  deciderInteraction(issueId: string, interactionId: string, decision: "accept" | "reject", raison: string | null): Promise<void>;
  deciderLiaison(companyId: string, liaisonId: string, decision: "approuver" | "refuser", raison: string | null): Promise<void>;
  agents(companyId: string): Promise<Agent[]>;
  agent(agentId: string): Promise<Agent>;
  pauseAgent(agentId: string, pause: boolean): Promise<void>;
  entreprise(companyId: string): Promise<{ id: string; name: string; status: string }>;
  statutEntreprise(companyId: string, statut: "paused" | "active"): Promise<void>;
  journal(companyId: string, apres: number): Promise<{ evenements: EvenementJournal[]; dernierSeq: number; complet: boolean }>;
}

export function clientAtelier(config: Config, f: typeof fetch = fetch): ClientAtelier {
  const base = config.atelierApi;
  const plugin = `${base}/plugins/${encodeURIComponent(config.pluginId)}/api`;
  const enc = encodeURIComponent;

  async function appel<T>(methode: string, url: string, corps?: unknown): Promise<T> {
    const entetes: Record<string, string> = { accept: "application/json" };
    if (corps !== undefined) entetes["content-type"] = "application/json";
    if (config.cleBoard) entetes["authorization"] = `Bearer ${config.cleBoard}`;
    const r = await f(url, {
      method: methode,
      headers: entetes,
      ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });
    const texte = await r.text();
    let json: unknown = null;
    try {
      json = texte ? JSON.parse(texte) : null;
    } catch {
      json = null;
    }
    if (!r.ok) {
      const j = json as { error?: unknown; message?: unknown } | null;
      const msg = typeof j?.error === "string" ? j.error : typeof j?.message === "string" ? j.message : `HTTP ${r.status}`;
      throw new ErreurAtelier(msg.slice(0, 500), r.status);
    }
    return json as T;
  }

  return {
    async envoyerDiscussion(texte) {
      return appel("POST", `${plugin}/discussion/message`, { companyId: config.entreprise, texte });
    },
    async messagesDiscussion(depuis) {
      const q = new URLSearchParams({ companyId: config.entreprise, ...(depuis ? { depuis } : {}) });
      const r = await appel<{ messages?: MessageDiscussion[] }>("GET", `${plugin}/discussion/messages?${q}`);
      return r.messages ?? [];
    },
    async departements() {
      const r = await appel<{ departements?: Departement[] }>("GET", `${plugin}/departements?companyId=${enc(config.entreprise)}`);
      return r.departements ?? [];
    },
    async accueil(companyId) {
      const r = await appel<{ elements?: ElementAccueil[] }>("GET", `${plugin}/accueil?companyId=${enc(companyId)}`);
      return r.elements ?? [];
    },
    async dossier(issueId) {
      return appel("GET", `${plugin}/taches/${enc(issueId)}/dossier?vue=complete`);
    },
    async decider(issueId, corps) {
      return appel("POST", `${plugin}/taches/${enc(issueId)}/decisions`, corps);
    },
    async transitionTache(issueId, statut, commentaire) {
      await appel("PATCH", `${base}/issues/${enc(issueId)}`, { status: statut, comment: commentaire });
    },
    async deciderApprobation(approbationId, decision, note) {
      await appel("POST", `${base}/approvals/${enc(approbationId)}/${decision}`, note ? { decisionNote: note } : {});
    },
    async deciderInteraction(issueId, interactionId, decision, raison) {
      await appel("POST", `${base}/issues/${enc(issueId)}/interactions/${enc(interactionId)}/${decision}`, decision === "reject" && raison ? { reason: raison } : {});
    },
    async deciderLiaison(companyId, liaisonId, decision, raison) {
      await appel("POST", `${plugin}/liaisons/decider`, { companyId, liaisonId, decision, ...(raison ? { raison } : {}) });
    },
    async agents(companyId) {
      return appel("GET", `${base}/companies/${enc(companyId)}/agents`);
    },
    async agent(agentId) {
      return appel("GET", `${base}/agents/${enc(agentId)}`);
    },
    async pauseAgent(agentId, pause) {
      await appel("POST", `${base}/agents/${enc(agentId)}/${pause ? "pause" : "resume"}`, {});
    },
    async entreprise(companyId) {
      return appel("GET", `${base}/companies/${enc(companyId)}`);
    },
    async statutEntreprise(companyId, statut) {
      await appel("PATCH", `${base}/companies/${enc(companyId)}`, { status: statut });
    },
    async journal(companyId, apres) {
      return appel("GET", `${plugin}/journal?companyId=${enc(companyId)}&afterSeq=${apres}&limite=200`);
    },
  };
}
