/**
 * Moteur de missions (#49, tâche 5) : exécuteur, reprise et réglage d'activation.
 * Source : `docs/moteur-missions.md` (décisions 1 à 6, états, clé d'idempotence, écarts 1 et 4).
 *
 * Toute écriture rejouable passe par `executions` : intention en `demandee`, effet, puis `appliquee`. Une clé `appliquee`
 * ne produit plus rien ; une clé `demandee` est reprise. Le SDK ne transmet pas `idempotencyKey` à la création d'une
 * tâche : l'unicité vient de la lecture par origine avant chaque création.
 */
import { createHash } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { CanalContact, IdNatif, PLUGIN_ID, exportFichierMax } from "../contrats/index.js";
import type { BaseAtelier, EtapeMission, Mission } from "../serveur/base.js";
import { chargerContrat, verifierEntrees, verifierSortie } from "./contrats.js";
import { chargerGabarit as chargerGabaritReel, poserPorteMission, PorteRefusee, rangPorte, type DepsPorteMission, type Gabarit } from "./gabarits.js";
import { exporterLot, type EtapesCode } from "./export-crm.js";
import { STATUT_PROJETE, TransitionInvalide, transitionner, type EtatMission, type EvenementMission } from "./transitions.js";

export const ORIGINE_ETAPE = `plugin:${PLUGIN_ID}:etape-mission` as const;
const CONTEXTE = "atelier.moteur";
const ROLE_COORDINATEUR = "coordinateur";
/** Essais d'export CRM partiels avant de signaler l'effet comme ambigu. */
export const ESSAIS_EXPORT_MAX = 3;
/** Refus identiques d'une même étape avant d'appliquer la conduite en cas d'échec du contrat. Valeur sans mesure, à relire avec les journaux de runs après #57. */
export const REFUS_IDENTIQUES_MAX = 5;

export interface HoteMoteur {
  issues: Pick<PluginContext["issues"], "create" | "list" | "get" | "update" | "requestWakeup" | "listInteractions" | "createComment" | "listComments">;
  /** Agent de l'entreprise qui tient le rôle (slug du registre) ; null s'il n'y en a pas. */
  resoudreAgent(companyId: string, role: string): Promise<string | null>;
}

type BaseMoteur = Pick<
  BaseAtelier,
  | "lireMission" | "missionsActives" | "changerEtatMission" | "changerRangMission" | "creerEtape" | "lireEtapes" | "majEtape"
  | "etapeParIssue" | "enregistrerExecution" | "marquerExecution" | "lireExecution" | "compterExecutionsAppliquees" | "executionsDemandees" | "journaliser"
>;

/** Agent tel que le liste `ctx.agents.list` : seuls l'identifiant, l'état et les métadonnées servent. */
export interface AgentListe { id: string; status?: string; metadata?: unknown }

const slugDe = (a: AgentListe) => ((a.metadata as { atelier?: { slug?: unknown } } | null | undefined)?.atelier)?.slug;

/** Agent non terminé dont `metadata.atelier.slug` est `slug` (jamais l'urlKey) ; aucun ou plusieurs : null, comme `idDe` des services. */
export function agentParSlug(agents: AgentListe[], slug: string): string | null {
  const trouves = agents.filter((a) => a.status !== "terminated" && slugDe(a) === slug);
  return trouves.length === 1 ? trouves[0]!.id : null;
}

/** Résout `{{agent:<slug>}}` et `{{humain:responsable}}` comme `tache.mettre-sous-porte` ; lève si un agent manque ou est ambigu. */
export function creerResolveur(agents: AgentListe[], humain: string): DepsPorteMission["resoudre"] {
  return <T>(v: T): T => JSON.parse(JSON.stringify(v).replace(/\{\{(agent|humain):([a-z0-9-]+)\}\}/gu, (_m, genre: string, nom: string) => {
    if (genre === "humain") return humain;
    return agentParSlug(agents, nom) ?? (() => { throw new PorteRefusee(`Agent « ${nom} » absent de l'entreprise ou ambigu : mise sous porte impossible.`); })();
  }));
}

/** Ce que `poserPorteMission` demande, avec les lectures qui dépendent de l'entreprise (agents, humain, exigences de la campagne). */
export interface DepsPorteMoteur extends Omit<DepsPorteMission, "resoudre"> {
  /** Codes d'exigence de la campagne : ils sont tous ciblés par la porte de la mission (liste vide si la campagne n'en a pas). */
  exigences(companyId: string, campagneId: string): Promise<string[]>;
  /** Résolveur de références de l'entreprise ; lève si l'humain responsable est inconnu. */
  resolveur(companyId: string): Promise<DepsPorteMission["resoudre"]>;
}

export interface DepsExecuteur {
  hote: HoteMoteur;
  base: BaseMoteur;
  porte: DepsPorteMoteur;
  horloge: () => Date;
  /** Révision courante du document livrable de la tâche (clé de sa porte) ; null s'il n'y en a pas. */
  revisionLivrable: (companyId: string, issueId: string) => Promise<string | null>;
  /** Charge un gabarit versionné ; injectable pour les tests, le vrai par défaut. */
  chargerGabarit?: (cle: string, version?: number) => Gabarit;
  /** Étapes en code (nature `code`) du gabarit ; absentes, une mission qui en a une part en blocage. */
  etapesCode?: EtapesCode;
}

export interface ResultatEtape {
  /** `accepte` : transition faite ; `refuse` : sortie hors contrat ; `ignore` : rejeu ou mission ailleurs. */
  statut: "accepte" | "refuse" | "ignore";
  erreurs: string[];
}

export type Executeur = ReturnType<typeof creerExecuteur>;

/** Réglage `moteurMissions` d'une entreprise : faux tant qu'il n'est pas explicitement vrai. */
export function moteurActif(config: Record<string, unknown> | null | undefined): boolean {
  return config?.moteurMissions === true;
}

export const cleEvenement = (missionId: string, rang: number, tentative: number, evenement: string, source?: string) =>
  `${missionId}:${rang}:${tentative}:${evenement}${source ? `:${source}` : ""}`;

/** Clé du cycle de blocage courant de la mission : celle de `cleEvenement`, plus `:c<n>` après la `n`-ième sortie de blocage. Une mission jamais bloquée garde ses clés d'origine. */
const suffixeCycle = (m: Pick<Mission, "cycleBlocage">) => (m.cycleBlocage > 0 ? `:c${m.cycleBlocage}` : "");
export const cleCycle = (m: Pick<Mission, "id" | "cycleBlocage">, rang: number, tentative: number, evenement: string, source?: string) =>
  `${cleEvenement(m.id, rang, tentative, evenement, source)}${suffixeCycle(m)}`;

/** Échec de `createComment` seul (pas celui de la marque d'exécution) : l'appelant peut le tolérer. */
class ErreurCommentaire extends Error {}

export function creerExecuteur(deps: DepsExecuteur) {
  const { hote, base, horloge } = deps;
  const charger = deps.chargerGabarit ?? chargerGabaritReel;

  const journal = (m: Mission, type: string, donnees: Record<string, unknown>, issueId?: string | null) =>
    base.journaliser({ companyId: m.companyId, type, entite: "mission", entiteId: m.id, issueId: issueId ?? null, acteur: "moteur", donnees: { ...donnees, le: horloge().toISOString() } });

  /** Journalise une fois par clé (`type` et discriminant) : une cause qui se répète à chaque passe ne remplit pas le journal. */
  async function journalUneFois(m: Mission, rang: number, type: string, donnees: Record<string, unknown>, issueId?: string | null, discriminant?: string) {
    const cle = cleCycle(m, rang, 1, type, discriminant);
    const neuve = await base.enregistrerExecution({ companyId: m.companyId, missionId: m.id, rang, type: "evenement", cle, requete: { type } });
    if (!neuve && (await base.lireExecution(m.companyId, cle))?.statut === "appliquee") return;
    await journal(m, `moteur.${type}`, donnees, issueId);
    await base.marquerExecution(m.companyId, cle, "appliquee");
  }

  /** Transition pure, puis compare-and-set. `applique` faux : clé déjà appliquée (rejeu) ou changement perdu. */
  async function appliquer(companyId: string, missionId: string, rang: number, tentative: number, evenement: EvenementMission, source?: string) {
    const m = await base.lireMission(companyId, missionId);
    if (!m) throw new Error(`Mission « ${missionId} » inconnue.`);
    const cle = cleCycle(m, rang, tentative, evenement, source);
    const neuve = await base.enregistrerExecution({ companyId, missionId, rang, type: "evenement", cle, requete: { evenement } });
    if (!neuve && (await base.lireExecution(companyId, cle))?.statut === "appliquee") return { applique: false, etat: null };
    let suivant: EtatMission;
    try {
      suivant = transitionner(m.etat, evenement);
    } catch (e) {
      if (!(e instanceof TransitionInvalide)) throw e;
      // Reprise d'une clé demandée dont le changement d'état a déjà eu lieu : rien à refaire, les effets restent rejouables.
      await base.marquerExecution(companyId, cle, neuve ? "refusee" : "appliquee");
      if (neuve) throw e;
      return { applique: true, etat: m.etat };
    }
    const change = await base.changerEtatMission(companyId, missionId, m.etat, suivant);
    await base.marquerExecution(companyId, cle, "appliquee");
    return { applique: change || !neuve, etat: change ? suivant : m.etat };
  }

  /** Commente la tâche `issueId` (défaut : la racine) une fois par clé (et par `discriminant`) ; le repère « Mission : » du texte évite le doublon d'un arrêt entre le commentaire et sa marque. */
  async function commenterUneFois(m: Mission, rang: number, type: string, texte: string, issueId?: string | null, discriminant?: string) {
    const cible = issueId ?? m.issueRacineId;
    if (!cible) return;
    const cle = cleCycle(m, rang, 1, type, discriminant);
    const neuve = await base.enregistrerExecution({ companyId: m.companyId, missionId: m.id, rang, type: "evenement", cle, requete: { type } });
    if (!neuve && (await base.lireExecution(m.companyId, cle))?.statut === "appliquee") return;
    const corps = `${texte}\n\nMission : ${m.id}`;
    if (!(await hote.issues.listComments(cible, m.companyId)).some((c) => c.body === corps)) {
      try {
        await hote.issues.createComment(cible, corps, m.companyId);
      } catch (e) {
        throw new ErreurCommentaire(e instanceof Error ? e.message : String(e));
      }
    }
    await base.marquerExecution(m.companyId, cle, "appliquee");
  }

  /** Réveil direct, une fois par clé : `appliquee` ne repart pas, `demandee` est rejouée. */
  async function reveiller(m: Mission, rang: number, tentative: number, issueId: string, raison: string, source?: string) {
    const cle = cleCycle(m, rang, tentative, "reveil", source ? `${raison}:${source}` : raison);
    const neuve = await base.enregistrerExecution({ companyId: m.companyId, missionId: m.id, rang, type: "reveil", cle, requete: { issueId } });
    if (!neuve && (await base.lireExecution(m.companyId, cle))?.statut === "appliquee") return;
    await envoyerReveil(m, cle, issueId, raison);
  }

  /** Envoie le réveil de la clé `cle` et la marque `appliquee`, sauf si l'hôte ne l'a pas mis en file. */
  async function envoyerReveil(m: Mission, cle: string, issueId: string, raison: string) {
    const r = await hote.issues.requestWakeup(issueId, m.companyId, { reason: `moteur_${raison}`, contextSource: CONTEXTE, idempotencyKey: cle });
    // Réveil non mis en file par l'hôte (`queued: false`) : la clé reste `demandee`, la passe suivante le rejoue.
    if (r?.queued === false) return;
    await base.marquerExecution(m.companyId, cle, "appliquee");
  }

  /** L'approbation humaine se lit dans l'état natif : l'étape `approval` de la politique est terminée. Un simple `done` ne la prouve pas. */
  const approuveeNativement = (t: { status: string; executionPolicy?: { stages: Array<{ id: string; type: string }> } | null; executionState?: { completedStageIds: string[] } | null } | null | undefined) => {
    const approbations = t?.executionPolicy?.stages.filter((e) => e.type === "approval") ?? [];
    return t?.status === "done" && approbations.length > 0 && approbations.every((e) => t.executionState?.completedStageIds.includes(e.id));
  };

  /** `issues.list` rend la politique et l'état d'exécution à null : l'approbation se lit par `issues.get`. */
  const approuvee = async (companyId: string, issueId: string | null | undefined) =>
    Boolean(issueId) && approuveeNativement((await hote.issues.get(issueId!, companyId)) as Parameters<typeof approuveeNativement>[0]);

  const trouverTache = async (companyId: string, originId: string) =>
    (await hote.issues.list({ companyId, originKind: ORIGINE_ETAPE as never, originId, includePluginOperations: true, limit: 5 })).find((i) => i.originId === originId);

  /** Description de la tâche d'étape : mandat, mission, champs de sortie du contrat et outil de dépôt (écrite moteur actif seulement, donc absente des AGENTS.md). */
  function consigneEtape(m: Mission, g: Gabarit["etapes"][number]): string {
    let champs = "";
    try {
      champs = Object.entries(chargerContrat(g.contratId, g.contratVersion).sortie.champs).map(([cle, type]) => `${cle} (${type})`).join(", ");
    } catch { /* contrat illisible : `preparer` bloque la mission en `contrat_invalide`, la description se passe des champs */ }
    return `${m.mandat}\n\nMission : ${m.id}${champs ? `\nChamps de la sortie : ${champs}.` : ""}\nDéposer le livrable avec l'outil livrable_deposer (missionId : cet identifiant ; versionContrat : celle que donne mission_etat).`;
  }

  /** Une tâche par étape (origine `mission:<id>:<rang>`), en `backlog`, bloquée par la précédente ; sans doublon. */
  async function creerTaches(m: Mission, gabarit: Gabarit): Promise<EtapeMission[]> {
    let precedente: string | null = null;
    for (const g of [...gabarit.etapes].sort((a, b) => a.rang - b.rang)) {
      if (g.nature === "code") {
        // Étape en code : aucune tâche native, ni agent, ni maillon de la chaîne de blocage.
        if (!(await base.lireEtapes(m.companyId, m.id)).some((e) => e.rang === g.rang && e.tentative === 1)) await base.creerEtape({ companyId: m.companyId, missionId: m.id, rang: g.rang, role: g.role, etat: "en_attente", issueId: null });
        continue;
      }
      const originId = `mission:${m.id}:${g.rang}`;
      await base.enregistrerExecution({ companyId: m.companyId, missionId: m.id, rang: g.rang, type: "creation_tache", cle: cleEvenement(m.id, g.rang, 1, "creation_tache"), requete: { originId } });
      // shortcut: un issues.create en vol qui aboutit après cette lecture crée un doublon (le SDK ne transmet pas idempotencyKey), passer à l'idempotence native quand le SDK la transmettra.
      const deja = await trouverTache(m.companyId, originId);
      let issueId = deja?.id;
      if (!issueId) {
        const agent = await hote.resoudreAgent(m.companyId, g.role);
        if (!agent) throw new Error(`Aucun agent pour le rôle « ${g.role} » dans l'entreprise.`);
        issueId = (await hote.issues.create({
          companyId: m.companyId, title: `${gabarit.description.split(".")[0]} : étape ${g.rang} (${g.role})`, description: consigneEtape(m, g), status: "backlog",
          assigneeAgentId: agent, originKind: ORIGINE_ETAPE as never, originId, blockedByIssueIds: precedente ? [precedente] : [], ...(m.issueRacineId ? { parentId: m.issueRacineId } : {}),
        })).id;
      }
      await base.marquerExecution(m.companyId, cleEvenement(m.id, g.rang, 1, "creation_tache"), "appliquee");
      const etape = (await base.lireEtapes(m.companyId, m.id)).find((e) => e.rang === g.rang && e.tentative === 1);
      if (!etape) await base.creerEtape({ companyId: m.companyId, missionId: m.id, rang: g.rang, role: g.role, etat: "en_attente", issueId });
      else if (etape.issueId !== issueId) await base.majEtape(m.companyId, etape.id, { issueId });
      precedente = issueId;
    }
    return base.lireEtapes(m.companyId, m.id);
  }

  /** Tâche de l'étape `rang`, ou à défaut de la dernière étape antérieure qui en a une (une étape en code n'a pas de tâche). */
  const issueDe = (etapes: EtapeMission[], rang: number) => etapes.filter((e) => e.rang <= rang && e.issueId).sort((a, b) => b.rang - a.rang)[0]?.issueId ?? null;

  /** Version du gabarit et contrats de la mission et de chaque étape : tout doit exister à la version enregistrée. */
  function contratsValides(m: Mission, gabarit: Gabarit): boolean {
    try {
      chargerContrat(m.contratId, m.contratVersion);
      for (const g of gabarit.etapes) chargerContrat(g.contratId, g.contratVersion);
      return true;
    } catch {
      return false;
    }
  }

  /** Entrée dans `blocage` : l'étape courante passe au coordinateur, seul réveillé du moteur. */
  async function bloquer(m: Mission, etapes: EtapeMission[], evenement: EvenementMission) {
    const rang = Math.max(1, m.rangCourant);
    const r = await appliquer(m.companyId, m.id, rang, 1, evenement);
    if (!r.applique) return;
    await journal(m, "moteur.blocage", { evenement, rang });
    await signalerBlocage(m, etapes, rang, evenement);
  }

  /** `raison` : cause du blocage, citée dans la consigne du coordinateur ; le `motif` (il peut citer des prospects) n'y figure jamais. */
  async function signalerBlocage(m: Mission, etapes: EtapeMission[], rang: number, raison?: string) {
    const issueId = issueDe(etapes, rang);
    const coordinateur = await hote.resoudreAgent(m.companyId, ROLE_COORDINATEUR);
    if (!coordinateur) return void (await journalUneFois(m, rang, "blocage_sans_reveil", { rang, tache: Boolean(issueId), coordinateur: false }, issueId));
    // Réveil déjà appliqué : la tâche est déjà chez le coordinateur, on ne la réécrit pas (une reprise ne doit rien changer).
    if ((await base.lireExecution(m.companyId, cleCycle(m, rang, 1, "reveil", "blocage")))?.statut === "appliquee") return;
    const leveeSeule = ["decision_refusee", "preuve_revoquee", "preuve_expiree", "preuve_non_signee"].includes(raison ?? "")
      ? " L'approbation humaine fait repartir la mission seule."
      : ["export_a_reconcilier", "absents_du_crm"].includes(raison ?? "") ? " La confirmation humaine des envois réussis fait repartir la mission seule." : "";
    const consigne = `Mission ${m.id} en blocage (n° ${m.cycleBlocage + 1}) à l'étape ${rang}${raison ? ` (raison : ${raison})` : ""}. Arbitrage du coordinateur : lire l'état avec l'outil mission_etat, puis déposer la décision avec l'outil arbitrage_deposer (« reprendre », 3 reprises au plus, ou « abandonner » : l'abandon exige une carte request_confirmation acceptée par un humain sur cette tâche, posée par l'API, dont detailsMarkdown contient la ligne « Abandon : mission ${m.id} (cycle ${m.cycleBlocage}) »).${leveeSeule}`;
    // Aucune tâche avant ce rang (étape en code), ou tâche déjà approuvée (done) qu'on ne réécrit pas : une tâche d'arbitrage dédiée porte le blocage.
    if (!issueId || (await hote.issues.get(issueId, m.companyId))?.status === "done") {
      const originId = `mission:${m.id}:${rang}:arbitrage${suffixeCycle(m)}`;
      const tacheId = (await trouverTache(m.companyId, originId))?.id ?? (await hote.issues.create({
        companyId: m.companyId, title: `Arbitrage de la mission ${m.id} : étape ${rang}`, description: consigne, status: "todo", assigneeAgentId: coordinateur,
        originKind: ORIGINE_ETAPE as never, originId, ...(m.issueRacineId ? { parentId: m.issueRacineId } : {}),
      })).id;
      return void (await reveiller(m, rang, 1, tacheId, "blocage"));
    }
    await hote.issues.update(issueId, { status: STATUT_PROJETE.blocage, assigneeAgentId: coordinateur }, m.companyId);
    await commenterUneFois(m, rang, "blocage_consigne", consigne, issueId);
    await reveiller(m, rang, 1, issueId, "blocage");
  }

  /** Gabarit, tâches puis contrats ; null si la mission est partie en blocage. */
  async function preparer(m: Mission): Promise<{ gabarit: Gabarit; etapes: EtapeMission[] } | null> {
    let gabarit: Gabarit;
    try {
      gabarit = charger(m.gabaritCle, m.gabaritVersion);
    } catch {
      await bloquer(m, await base.lireEtapes(m.companyId, m.id), "contrat_invalide");
      return null;
    }
    const etapes = await creerTaches(m, gabarit);
    if (!contratsValides(m, gabarit)) {
      await bloquer(m, etapes, "contrat_invalide");
      return null;
    }
    if (!(await poserPorte(m, gabarit, etapes))) return null;
    return { gabarit, etapes };
  }

  /** Porte d'office sur la tâche de la dernière étape, une fois par clé ; faux si la mission est partie en blocage (porte refusée). */
  async function poserPorte(m: Mission, gabarit: Gabarit, etapes: EtapeMission[]): Promise<boolean> {
    if (!gabarit.porte) return true;
    const rangDernier = rangPorte(gabarit);
    const cle = cleEvenement(m.id, rangDernier, 1, "pose_porte");
    const neuve = await base.enregistrerExecution({ companyId: m.companyId, missionId: m.id, rang: rangDernier, type: "evenement", cle, requete: { issueId: issueDe(etapes, rangDernier) } });
    if (!neuve && (await base.lireExecution(m.companyId, cle))?.statut === "appliquee") return true;
    try {
      const issueId = issueDe(etapes, rangDernier);
      if (!issueId) throw new PorteRefusee(`Pas de tâche pour l'étape ${rangDernier}.`);
      const exigencesCiblees = m.campagneId ? await deps.porte.exigences(m.companyId, m.campagneId) : [];
      const resoudre = m.campagneId ? await deps.porte.resolveur(m.companyId) : (<T>(v: T) => v);
      await poserPorteMission({ ...deps.porte, resoudre }, { companyId: m.companyId, issueId, campagneId: m.campagneId, gabarit, exigencesCiblees });
    } catch (e) {
      if (!(e instanceof PorteRefusee)) throw e; // panne passagère : la mission ne part pas en blocage, la passe suivante retente
      await journal(m, "moteur.porte_refusee", { motif: e.message, rang: rangDernier });
      // Au lancement d'un brouillon (`attente_information`), `contrat_invalide` n'est pas permis : le refus remonte à l'appelant, sans consommer la clé de blocage.
      if (!transitionPermise(m.etat, "contrat_invalide")) throw e;
      await bloquer(m, etapes, "contrat_invalide");
      return false;
    }
    await base.marquerExecution(m.companyId, cle, "appliquee");
    return true;
  }

  const objet = (v: unknown) => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

  /** Entrées de l'étape : l'accumulation, par rang croissant, de l'entrée puis de la sortie de chaque étape antérieure, puis de ses propres entrées (le plus récent l'emporte). */
  const entreesDe = (etapes: EtapeMission[], rang: number): Record<string, unknown> => {
    const avant = etapes.filter((e) => e.tentative === 1 && e.rang < rang).sort((a, b) => a.rang - b.rang);
    return { ...avant.reduce((acc, e) => ({ ...acc, ...objet(e.entree), ...objet(e.sortie) }), {}), ...objet(etapes.find((e) => e.rang === rang)?.entree) };
  };

  /** Démarre l'étape `rang` : entrées vérifiées en code (sans modèle), puis réveil direct de son agent. */
  async function lancerRang(m: Mission, gabarit: Gabarit, etapes: EtapeMission[], rang: number, rejeu = false) {
    const g = gabarit.etapes.find((e) => e.rang === rang)!;
    const etape = etapes.find((e) => e.rang === rang && e.tentative === 1)!;
    if (g.nature === "code") return lancerEtapeCode(m, gabarit, etapes, g, etape, rejeu);
    const manquantes = verifierEntrees(chargerContrat(g.contratId, g.contratVersion), entreesDe(etapes, rang)).manquantes;
    if (manquantes.length > 0) {
      if ((await appliquer(m.companyId, m.id, rang, 1, "entree_manquante")).applique) {
        await mettreEnAttenteInformation(m.companyId, etape);
        await journal(m, "moteur.entree_manquante", { rang, manquantes }, etape.issueId);
      }
      return;
    }
    await base.changerRangMission(m.companyId, m.id, m.rangCourant, rang);
    if (!(await appliquer(m.companyId, m.id, rang, 1, "demarrage")).applique) return;
    // Une tâche en `backlog` ne se réveille pas : `todo` suffit, l'agent la prend en `in_progress`. Écrite avant l'état de l'étape : un arrêt entre les deux se rattrape à la reprise (étape encore `en_attente`).
    await hote.issues.update(etape.issueId!, { status: STATUT_PROJETE.prete }, m.companyId);
    await base.majEtape(m.companyId, etape.id, { etat: "en_cours" });
    await reveiller(m, rang, 1, etape.issueId!, "etape");
  }

  /**
   * Étape en code d'avant la porte : aucun contrôle de contrat ni réveil. `rejeu` : le démarrage est déjà pris (reprise), le calcul se refait,
   * c'est une lecture. Entrées manquantes : même chemin que pour un agent, sans tâche à bloquer.
   */
  async function lancerEtapeCode(m: Mission, gabarit: Gabarit, etapes: EtapeMission[], g: Gabarit["etapes"][number], etape: EtapeMission, rejeu: boolean) {
    const calcul = deps.etapesCode?.avantPorte[g.action ?? ""];
    if (!calcul) return void (await bloquer(m, etapes, "contrat_invalide"));
    await base.changerRangMission(m.companyId, m.id, m.rangCourant, g.rang);
    if (!rejeu && !(await appliquer(m.companyId, m.id, g.rang, 1, "demarrage")).applique) return;
    const r = await calcul({ companyId: m.companyId, missionId: m.id, campagneId: m.campagneId, entrees: entreesDe(etapes, g.rang) });
    if ("blocage" in r) {
      // Rien à faire passer à l'étape suivante : blocage au rang de l'étape (comme la reprise le relira), le coordinateur est signalé, aucun agent du rang suivant n'est réveillé.
      await journalUneFois(m, g.rang, r.blocage, { rang: g.rang }, issueDe(etapes, g.rang));
      return bloquer({ ...m, rangCourant: g.rang }, etapes, "arbitrage_demande");
    }
    if ("manquantes" in r) {
      if ((await appliquer(m.companyId, m.id, g.rang, 1, "entree_manquante")).applique) {
        await mettreEnAttenteInformation(m.companyId, etape);
        await journal(m, "moteur.entree_manquante", { rang: g.rang, manquantes: r.manquantes }, etape.issueId);
      }
      return;
    }
    await terminerEtapeCode(m, etape, r.sortie);
  }

  /** Sortie de l'étape en code, transition, puis étape suivante ; rejouable (la transition rejouée rend `applique: false` une fois prise). */
  async function terminerEtapeCode(m: Mission, etape: EtapeMission, sortie: Record<string, unknown>) {
    await base.majEtape(m.companyId, etape.id, { sortie, etat: "terminee" });
    if ((await appliquer(m.companyId, m.id, etape.rang, 1, "sortie_valide_etape")).applique) await avancerAuRang(m.companyId, m.id, etape.rang + 1);
  }

  /** Tâche en `blocked` puis étape en `attente_information` : dans cet ordre, pour que la reprise (étape encore `en_attente`) refasse les deux. */
  async function mettreEnAttenteInformation(companyId: string, etape: EtapeMission) {
    if (etape.issueId) await hote.issues.update(etape.issueId, { status: STATUT_PROJETE.attente_information }, companyId);
    await base.majEtape(companyId, etape.id, { etat: "attente_information" });
  }

  /** La tâche passe à `done` avant `cloture` : un arrêt entre les deux laisse la mission en `resultat_confirme`, que la reprise termine. */
  async function cloturer(m: Mission, etape: EtapeMission) {
    if (etape.issueId) await hote.issues.update(etape.issueId, { status: "done" }, m.companyId);
    await appliquer(m.companyId, m.id, etape.rang, etape.tentative, "cloture");
  }

  async function demarrer(companyId: string, missionId: string): Promise<void> {
    const m = await base.lireMission(companyId, missionId);
    if (!m) throw new Error(`Mission « ${missionId} » inconnue.`);
    if (m.etat !== "prete" || m.rangCourant !== 0) return;
    const p = await preparer(m);
    if (p) await lancerRang(m, p.gabarit, p.etapes, 1);
  }

  /**
   * Lancement d'un brouillon (`attente_information`) après l'accord humain, campagne déjà rattachée : tâches et porte préparées,
   * entrées posées sur l'étape 1 AVANT la transition (un arrêt entre les deux se rejoue, la clé `information_recue` n'étant pas encore prise), puis démarrage.
   * Faux si la mission n'est plus en attente d'information ou a été prise entre-temps. Une porte refusée lève (la mission reste en attente).
   */
  async function lancer(companyId: string, missionId: string, entrees: Record<string, unknown>): Promise<boolean> {
    const m = await base.lireMission(companyId, missionId);
    if (!m) throw new Error(`Mission « ${missionId} » inconnue.`);
    if (m.etat !== "attente_information") return false;
    const p = await preparer(m);
    const premiere = p?.etapes.find((e) => e.rang === 1 && e.tentative === 1);
    if (!p || !premiere) return false;
    await base.majEtape(companyId, premiere.id, { entree: entrees });
    if (!(await appliquer(companyId, m.id, 0, 1, "information_recue")).applique) return false;
    await lancerRang(m, p.gabarit, await base.lireEtapes(companyId, m.id), 1);
    return true;
  }

  /**
   * Inscrit ce refus (signature des erreurs, qui ne citent que des noms de champs) à la première clé libre de 0 à `REFUS_IDENTIQUES_MAX - 1`.
   * Vrai quand le plafond est atteint. Le compte repart de zéro après un cycle de blocage (`cleCycle`) ou une demande de changements
   * (« manche » : nombre de `changements_demandes` appliqués pour cette étape dans le cycle courant).
   */
  async function compterRefus(m: Mission, rang: number, tentative: number, erreurs: string[]): Promise<boolean> {
    const signature = createHash("sha256").update(JSON.stringify([...erreurs].sort())).digest("hex").slice(0, 16);
    const manche = await base.compterExecutionsAppliquees(m.companyId, m.id, `${cleEvenement(m.id, rang, tentative, "changements_demandes")}:`, suffixeCycle(m));
    for (let n = 0; n < REFUS_IDENTIQUES_MAX; n++) {
      const cle = cleCycle(m, rang, tentative, "refus", `${signature}${manche ? `:m${manche}` : ""}:${n}`);
      if (!(await base.enregistrerExecution({ companyId: m.companyId, missionId: m.id, rang, type: "evenement", cle, requete: { type: "refus", signature } }))) continue;
      await base.marquerExecution(m.companyId, cle, "appliquee");
      return n === REFUS_IDENTIQUES_MAX - 1;
    }
    return true;
  }

  async function traiterResultat(companyId: string, r: { missionId: string; rang: number; tentative: number; sortie: unknown; cleEvenement?: string; revisionLivrable?: string }): Promise<ResultatEtape> {
    const m = await base.lireMission(companyId, r.missionId);
    if (!m) throw new Error(`Mission « ${r.missionId} » inconnue.`);
    if (m.etat !== "en_cours" || m.rangCourant !== r.rang) {
      await journal(m, "moteur.resultat_ignore", { rang: r.rang, etat: m.etat, rangCourant: m.rangCourant });
      return { statut: "ignore", erreurs: [] };
    }
    const p = await preparer(m);
    if (!p) return { statut: "ignore", erreurs: ["Contrat invalide : mission en blocage."] };
    const etape = p.etapes.find((e) => e.rang === r.rang && e.tentative === r.tentative);
    const g = p.gabarit.etapes.find((e) => e.rang === r.rang);
    if (!etape || !g) throw new Error(`Étape ${r.rang} (tentative ${r.tentative}) inconnue pour la mission « ${m.id} ».`);
    const contrat = chargerContrat(g.contratId, g.contratVersion);
    const verdict = verifierSortie(contrat, r.sortie);
    if (!verdict.ok) {
      // Un dépôt redélivré (même clé d'événement) est un rejeu : il ne prend pas une place de plus du compteur.
      const t = await appliquer(companyId, m.id, r.rang, r.tentative, "sortie_hors_contrat", r.cleEvenement);
      if (!t.applique && r.cleEvenement !== undefined) return { statut: "refuse", erreurs: verdict.erreurs };
      await journal(m, "moteur.sortie_hors_contrat", { rang: r.rang, erreurs: verdict.erreurs }, etape.issueId);
      const plafond = await compterRefus(m, r.rang, r.tentative, verdict.erreurs);
      if (!plafond) return { statut: "refuse", erreurs: verdict.erreurs };
      const echec = contrat.conduiteEchec === "echec";
      // shortcut: un arrêt entre l'inscription du dernier refus et cette conduite laisse la mission en `en_cours` ; le dépôt suivant (autre clé d'événement) retrouve les clés prises et l'applique. Sans nouveau dépôt, la reprise ne la rattrape pas : à reprendre si cet arrêt est observé.
      if (echec) await arreterEnEchec(m, r.rang);
      else await bloquer(m, p.etapes, "plafond_atteint");
      return { statut: "refuse", erreurs: [...verdict.erreurs, `Plafond de refus identiques atteint : ${echec ? "la mission s'arrête" : "l'étape passe à l'arbitrage"}.`] };
    }
    await base.majEtape(companyId, etape.id, { sortie: r.sortie, etat: "terminee", ...(r.revisionLivrable ? { revisionLivrable: r.revisionLivrable } : {}) });
    const derniere = r.rang === rangPorte(p.gabarit);
    const evenement: EvenementMission = !derniere ? "sortie_valide_etape" : p.gabarit.porte ? "sortie_valide_sous_porte" : "sortie_valide_finale";
    const t = await appliquer(companyId, m.id, r.rang, r.tentative, evenement, r.cleEvenement);
    if (!t.applique) return { statut: "ignore", erreurs: [] };
    if (!derniere) {
      if (etape.issueId) await hote.issues.update(etape.issueId, { status: "done" }, companyId);
      await avancerAuRang(companyId, m.id, r.rang + 1);
    } else if (!p.gabarit.porte) {
      await cloturer(m, etape);
    }
    return { statut: "accepte", erreurs: [] };
  }

  /** Clé déjà appliquée : le même run rejoue son dépôt, sans effet. */
  const dejaApplique = async (companyId: string, cle: string) => (await base.lireExecution(companyId, cle))?.statut === "appliquee";

  /** Refus d'un événement hors tableau, constaté avant toute écriture (évite la branche `TransitionInvalide` de `appliquer`, qui rend `applique: true` à une clé rejouée). */
  function transitionPermise(etat: EtatMission, evenement: EvenementMission): boolean {
    try {
      transitionner(etat, evenement);
      return true;
    } catch (e) {
      if (e instanceof TransitionInvalide) return false;
      throw e;
    }
  }

  /** Verdict du relecteur sur une mission en revue ; la clé porte l'identifiant du run : même run rejoué sans effet, nouveau run appliqué. */
  async function traiterVerdict(companyId: string, v: { missionId: string; rang: number; tentative: number; accepte: boolean; runId: string; justification?: string }) {
    const m = await base.lireMission(companyId, v.missionId);
    if (!m) throw new Error(`Mission « ${v.missionId} » inconnue.`);
    const evenement: EvenementMission = v.accepte ? "porte_franchie" : "changements_demandes";
    if (await dejaApplique(companyId, cleCycle(m, v.rang, v.tentative, evenement, v.runId))) return { statut: "rejeu" as const, etat: m.etat };
    if (!transitionPermise(m.etat, evenement)) return { statut: "transition_invalide" as const, etat: m.etat };
    // L'étape repasse en cours avant la transition : un arrêt entre les deux ne doit pas faire retraiter l'ancienne sortie par la reprise.
    const etape = v.accepte ? undefined : (await base.lireEtapes(companyId, m.id)).find((e) => e.rang === v.rang && e.tentative === v.tentative);
    if (etape) await base.majEtape(companyId, etape.id, { etat: "en_cours" });
    // Le réveil de la correction est inscrit `demandee` avant la transition : un arrêt ensuite se rejoue à la reprise (`rejouerCorrections`).
    if (etape?.issueId) await base.enregistrerExecution({ companyId, missionId: m.id, rang: v.rang, type: "reveil", cle: cleCycle(m, v.rang, v.tentative, "reveil", `correction:${v.runId}`), requete: { issueId: etape.issueId, raison: "correction" } });
    const t = await appliquer(companyId, m.id, v.rang, v.tentative, evenement, v.runId);
    if (t.applique) await journal(m, "moteur.verdict", { rang: v.rang, verdict: v.accepte ? "accepte" : "changements_demandes", ...(v.justification ? { justification: v.justification } : {}) });
    if (t.applique && etape?.issueId) {
      // Changements demandés : le rédacteur reprend sa tâche.
      await hote.issues.update(etape.issueId, { status: STATUT_PROJETE.en_cours }, companyId);
      await reveiller(m, v.rang, v.tentative, etape.issueId, "correction", v.runId);
    }
    return { statut: t.applique ? ("applique" as const) : ("rejeu" as const), etat: t.etat ?? m.etat };
  }

  /**
   * Refus humain à l'approbation : l'hôte a déjà rendu la tâche à son assigné (statut `in_progress`, `returnAssignee`, voir
   * issue-execution-policy.ts), donc aucun réveil ici. La clé est liée à la décision : un rejeu, ou un refus ancien relu, ne fait rien.
   */
  async function changementsNatifs(companyId: string, issueId: string): Promise<void> {
    const etape = await base.etapeParIssue(companyId, issueId);
    if (!etape) return;
    const m = await base.lireMission(companyId, etape.missionId);
    if (!m || m.etat !== "attente_autorisation") return;
    const tache = (await hote.issues.get(issueId, companyId)) as { updatedAt?: Date | string; executionState?: { status?: string; lastDecisionOutcome?: string | null; lastDecisionId?: string | null } | null } | null;
    const natif = tache?.executionState;
    // `status` distingue un refus en cours d'une décision ancienne dont la trace reste dans l'état natif.
    if (natif?.status !== "changes_requested" || natif.lastDecisionOutcome !== "changes_requested") return;
    const source = `humain:${natif.lastDecisionId ?? new Date(tache?.updatedAt ?? 0).toISOString()}`;
    if (await dejaApplique(companyId, cleCycle(m, etape.rang, etape.tentative, "changements_demandes", source))) return;
    // L'étape repasse en cours avant la transition, comme pour un verdict de relecteur.
    await base.majEtape(companyId, etape.id, { etat: "en_cours" });
    if ((await appliquer(companyId, m.id, etape.rang, etape.tentative, "changements_demandes", source)).applique) await journal(m, "moteur.changements_humains", { rang: etape.rang }, issueId);
  }

  async function avancerAuRang(companyId: string, missionId: string, rang: number) {
    const m = (await base.lireMission(companyId, missionId))!;
    const p = await preparer(m);
    if (p) await lancerRang(m, p.gabarit, p.etapes, rang);
  }

  /** Corrections demandées dont le réveil n'est pas parti : la tâche du rédacteur repasse en cours, puis le réveil part sous sa clé. */
  async function rejouerCorrections(m: Mission) {
    for (const x of await base.executionsDemandees(m.companyId, m.id, "reveil")) {
      const r = objet(x.requete);
      if (r.raison !== "correction" || typeof r.issueId !== "string") continue;
      await hote.issues.update(r.issueId, { status: STATUT_PROJETE.en_cours }, m.companyId);
      await envoyerReveil(m, x.cle, r.issueId, "correction");
    }
  }

  /** Rattrape une mission active après un arrêt ou un événement perdu, sans doublon (clés d'exécution). */
  async function reprendreMission(m: Mission) {
    if (m.etat === "blocage") {
      const etapes = await base.lireEtapes(m.companyId, m.id);
      if ((await blocageLeve(m, etapes)) && (await sortirDeBlocage(m))) return;
      return signalerBlocage(m, etapes, Math.max(1, m.rangCourant));
    }
    if (m.etat === "attente_information") {
      // Arrêt entre `entree_manquante` et la mise à jour de la tâche et de l'étape : on réapplique, sans réveiller de modèle.
      const etape = (await base.lireEtapes(m.companyId, m.id)).find((e) => e.tentative === 1 && e.etat !== "terminee");
      if (!etape && m.issueRacineId) {
        // Brouillon du chat (aucune étape) : refusé par l'humain sur toutes ses cartes, il est annulé, sinon il reste listé comme actif.
        const cartes = (await hote.issues.listInteractions(m.issueRacineId, m.companyId)).filter((c) => c.kind === "request_confirmation" && String((c.payload as { detailsMarkdown?: unknown }).detailsMarkdown ?? "").split("\n").includes(`Mission : ${m.id}`));
        if (cartes.length > 0 && cartes.every((c) => c.status === "rejected") && (await appliquer(m.companyId, m.id, 0, 1, "annulation")).applique) await journal(m, "moteur.brouillon_refuse", {});
        return;
      }
      return etape?.etat === "en_attente" ? mettreEnAttenteInformation(m.companyId, etape) : undefined;
    }
    if (m.etat === "resultat_confirme") {
      // Arrêt entre la dernière sortie valide et la clôture ; avec porte, la suite appartient à la porte.
      const gabarit = charger(m.gabaritCle, m.gabaritVersion);
      const derniere = (await base.lireEtapes(m.companyId, m.id)).find((e) => e.tentative === 1 && e.rang === rangPorte(gabarit));
      if (gabarit.porte && !(await approuvee(m.companyId, derniere?.issueId))) return;
      return derniere ? cloturer(m, derniere) : undefined;
    }
    if (m.etat === "attente_autorisation") {
      // Approbation (ou `done` sans approbation) survenue pendant l'arrêt, sans événement.
      const etape = (await base.lireEtapes(m.companyId, m.id)).find((e) => e.rang === Math.max(1, m.rangCourant) && e.tentative === 1);
      const tache = etape ? await trouverTache(m.companyId, `mission:${m.id}:${etape.rang}`) : null;
      if (!tache) return;
      return tache.status === "done" ? surDoneNatif(m.companyId, tache.id) : changementsNatifs(m.companyId, tache.id);
    }
    if (m.etat === "en_execution") {
      const gabarit = charger(m.gabaritCle, m.gabaritVersion);
      return executerEffet(m, gabarit);
    }
    if (m.etat !== "prete" && m.etat !== "en_cours") return;
    const p = await preparer(m);
    if (!p) return;
    const courante = p.etapes.find((e) => e.rang === m.rangCourant && e.tentative === 1);
    if (m.etat === "prete") {
      if (m.rangCourant === 0) return lancerRang(m, p.gabarit, p.etapes, 1);
      // Arrêt entre le changement de rang et `demarrage` : l'étape courante n'est pas partie.
      if (courante?.etat === "en_attente") return lancerRang(m, p.gabarit, p.etapes, m.rangCourant);
      if (courante?.etat === "terminee") {
        // Arrêt possible entre la transition et le passage à `done` : le bloqueur doit être `done` avant le réveil de la suivante.
        if (courante.issueId) await hote.issues.update(courante.issueId, { status: "done" }, m.companyId);
        return lancerRang(m, p.gabarit, p.etapes, m.rangCourant + 1);
      }
      return;
    }
    if (!courante) return;
    if (p.gabarit.etapes.find((e) => e.rang === courante.rang)?.nature === "code") {
      // Arrêt pendant une étape en code : le calcul est une lecture, on le rejoue ; une sortie déjà écrite reprend à la transition.
      return courante.etat === "terminee" && courante.sortie !== null ? terminerEtapeCode(m, courante, objet(courante.sortie)) : lancerRang(m, p.gabarit, p.etapes, courante.rang, true);
    }
    if (courante.etat === "terminee" && courante.sortie !== null) {
      await traiterResultat(m.companyId, { missionId: m.id, rang: courante.rang, tentative: courante.tentative, sortie: courante.sortie });
    } else if (courante.issueId && courante.etat === "en_attente") {
      // Arrêt entre `demarrage` et la mise à `todo` : la tâche est encore en `backlog`, que l'hôte ne réveille pas.
      await hote.issues.update(courante.issueId, { status: STATUT_PROJETE.prete }, m.companyId);
      await base.majEtape(m.companyId, courante.id, { etat: "en_cours" });
      await reveiller(m, courante.rang, 1, courante.issueId, "etape");
    } else if (courante.issueId) {
      await rejouerCorrections(m);
      const tache = await trouverTache(m.companyId, `mission:${m.id}:${courante.rang}`);
      if (tache?.status === "done") {
        // `done` posé pendant l'arrêt, sans événement : on rouvre la tâche et on réveille avec une clé liée à cette fermeture.
        await surDoneNatif(m.companyId, courante.issueId);
        await reveiller(m, courante.rang, 1, courante.issueId, "etape", new Date(tache.updatedAt).toISOString());
      } else {
        await reveiller(m, courante.rang, 1, courante.issueId, "etape");
      }
    }
  }

  async function reprendre(companyId: string): Promise<void> {
    for (const m of await base.missionsActives(companyId)) {
      try {
        // Relue dans la file : un traitement concurrent a pu faire avancer la mission depuis la liste.
        await enFile(m.id, async () => {
          const courante = await base.lireMission(companyId, m.id);
          if (courante) await reprendreMission(courante);
        });
      } catch (e) {
        const erreur = e instanceof Error ? e.message : String(e);
        // Une cause identique ne se journalise qu'une fois ; le journal ne doit jamais arrêter la passe.
        try {
          await journalUneFois(m, Math.max(1, m.rangCourant), "reprise_echec", { erreur }, null, erreur.slice(0, 120));
        } catch { /* journal indisponible : la passe continue */ }
      }
    }
  }

  /** Une file par mission : démarrage, résultat et reprise ne s'entrelacent pas (un seul worker par instance). Appelée aux points d'entrée publics seulement. */
  const files = new Map<string, Promise<unknown>>();
  function enFile<T>(missionId: string, travail: () => Promise<T>): Promise<T> {
    const suite = (files.get(missionId) ?? Promise.resolve()).then(travail);
    const trace = suite.catch(() => undefined);
    files.set(missionId, trace);
    void trace.then(() => { if (files.get(missionId) === trace) files.delete(missionId); });
    return suite;
  }

  /** Ferme une tâche encore ouverte ; rien si elle est absente ou déjà `done` ou `cancelled`. */
  async function fermerTache(m: Mission, id: unknown, status: "done" | "cancelled") {
    if (typeof id !== "string") return;
    const tache = await hote.issues.get(id, m.companyId);
    if (tache && tache.status !== "done" && tache.status !== "cancelled") await hote.issues.update(id, { status }, m.companyId);
  }

  /** Effet ambigu : la mission part en blocage et le coordinateur est signalé sur la dernière tâche existante. */
  async function effetAmbigu(m: Mission, rang: number, donnees: Record<string, unknown>) {
    const raison = typeof donnees.raison === "string" ? donnees.raison : undefined;
    const etape = (await base.lireEtapes(m.companyId, m.id)).find((e) => e.rang === rang && e.tentative === 1);
    // La raison se relit à la reprise (levées automatiques) : écrite avant la transition, un arrêt entre les deux se rejoue.
    if (etape && raison) await base.majEtape(m.companyId, etape.id, { sortie: { ...objet(etape.sortie), blocage: raison } });
    if (!(await appliquer(m.companyId, m.id, rang, 1, "effet_ambigu")).applique) return;
    await journal(m, "moteur.blocage", { evenement: "effet_ambigu", rang, ...donnees });
    await signalerBlocage(m, await base.lireEtapes(m.companyId, m.id), rang, raison);
  }

  /**
   * Levée sans modèle : un acte humain déjà enregistré suffit (confirmation de la diffusion ambiguë, nouvelle décision). La raison est lue sur l'étape du rang
   * (`effetAmbigu`) ; toute autre raison attend le coordinateur. La route reste la seule barrière : la reprise ne fait que rejouer le code.
   */
  async function blocageLeve(m: Mission, etapes: EtapeMission[]): Promise<boolean> {
    const crm = deps.etapesCode?.deps.crm;
    const rang = Math.max(1, m.rangCourant);
    const courantes = etapes.filter((e) => e.tentative === 1);
    const raison = objet(courantes.find((e) => e.rang === rang)?.sortie).blocage;
    if (!crm || typeof raison !== "string") return false;
    if (raison === "export_a_reconcilier" || raison === "absents_du_crm") {
      const reussis = objet(courantes.find((e) => e.rang === rang - 1)?.sortie).reussis;
      if (!Array.isArray(reussis) || reussis.length === 0) return false;
      for (const id of reussis) if (!(await crm.confirme(m.companyId, m.id, String(id)))) return false;
      return true;
    }
    if (["decision_refusee", "preuve_revoquee", "preuve_expiree", "preuve_non_signee"].includes(raison)) return (await crm.decisionNouvelle?.(m.companyId, m.id)) === true;
    return false;
  }

  /**
   * Sortie de blocage : une transition (`arbitrage_repris_effet` après la porte, `arbitrage_repris` avant), puis le code de reprise rejoue sous les mêmes gardes.
   * Avant la porte, la tâche tenue par le coordinateur revient à l'agent de son étape, qui repart (même une étape terminée dont la sortie est à refaire).
   * Faux si la mission n'est plus en blocage ou si la transition est perdue.
   */
  async function sortirDeBlocage(m: Mission): Promise<boolean> {
    const rang = Math.max(1, m.rangCourant);
    const effet = rang > rangPorte(charger(m.gabaritCle, m.gabaritVersion));
    const evenement: EvenementMission = effet ? "arbitrage_repris_effet" : "arbitrage_repris";
    let cible: EtapeMission | undefined;
    if (!effet) {
      const etapes = (await base.lireEtapes(m.companyId, m.id)).filter((e) => e.tentative === 1);
      const issueId = issueDe(etapes, rang);
      cible = (issueId ? etapes.find((e) => e.issueId === issueId) : undefined) ?? etapes.find((e) => e.rang === rang);
      if (cible?.issueId) {
        const agent = await hote.resoudreAgent(m.companyId, cible.role);
        if (!agent) throw new Error(`Aucun agent pour le rôle « ${cible.role} » : reprise impossible.`);
        await hote.issues.update(cible.issueId, { assigneeAgentId: agent }, m.companyId);
      }
      if (cible && cible.etat !== "en_attente") await base.majEtape(m.companyId, cible.id, { etat: "en_attente" });
    }
    if (!(await appliquer(m.companyId, m.id, rang, 1, evenement)).applique) return false;
    // shortcut: un arrêt entre la transition et ce retour de rang relance l'étape bloquée (nouveau cycle) au lieu de celle de la tâche, à revoir si cet arrêt se produit.
    if (cible && cible.rang < m.rangCourant) await base.changerRangMission(m.companyId, m.id, m.rangCourant, cible.rang);
    await journal(m, "moteur.blocage_leve", { evenement, rang });
    // shortcut: un arrêt entre la transition et cette fermeture laisse la tâche d'arbitrage ouverte, le veilleur des tâches orphelines la rattrape.
    const arbitrage = await trouverTache(m.companyId, `mission:${m.id}:${rang}:arbitrage${suffixeCycle(m)}`);
    if (arbitrage && arbitrage.status !== "done") await hote.issues.update(arbitrage.id, { status: "done" }, m.companyId);
    await reprendreMission((await base.lireMission(m.companyId, m.id))!);
    return true;
  }

  /** Annule les tâches encore ouvertes de la mission (étapes, exécution, arbitrage du rang) ; les tâches terminées, dont la porte, ne sont pas touchées. */
  async function annulerTachesOuvertes(m: Mission, rang: number) {
    const etapes = await base.lireEtapes(m.companyId, m.id);
    const ids = new Set<string>(etapes.flatMap((e) => [e.issueId, objet(e.sortie).tacheExecution].filter((x): x is string => typeof x === "string")));
    const arbitrage = await trouverTache(m.companyId, `mission:${m.id}:${rang}:arbitrage${suffixeCycle(m)}`);
    if (arbitrage) ids.add(arbitrage.id);
    // shortcut: un arrêt entre la transition et ces annulations laisse des tâches ouvertes sur une mission en échec, le veilleur des tâches orphelines les rattrape.
    for (const id of ids) {
      const tache = await hote.issues.get(id, m.companyId);
      if (tache && tache.status !== "done" && tache.status !== "cancelled") await hote.issues.update(id, { status: "cancelled" }, m.companyId);
    }
  }

  /** Conduite `echec` du contrat : la mission s'arrête (`echec_declare`), sans réveil, et ses tâches ouvertes sont annulées. */
  async function arreterEnEchec(m: Mission, rang: number) {
    if (!(await appliquer(m.companyId, m.id, rang, 1, "echec_declare")).applique) return;
    await journal(m, "moteur.plafond_atteint", { rang, conduite: "echec" });
    await annulerTachesOuvertes(m, rang);
  }

  /**
   * Abandon décidé par le coordinateur sous accord humain (contrôlé par l'outil) : une transition vers `echec`, puis les tâches encore ouvertes sont annulées.
   * Les tâches terminées (dont la porte) ne sont pas touchées. Faux si la mission n'est plus en blocage ou si la transition est perdue.
   */
  async function abandonner(m: Mission): Promise<boolean> {
    const rang = Math.max(1, m.rangCourant);
    if (!(await appliquer(m.companyId, m.id, rang, 1, "arbitrage_abandon")).applique) return false;
    await journal(m, "moteur.abandon", { rang });
    await annulerTachesOuvertes(m, rang);
    return true;
  }

  /**
   * Mission `en_execution` : les étapes en code d'après la porte, dans l'ordre, sans réveil de modèle ni transition entre elles.
   * Une étape terminée est sautée ; l'export partiel s'arrête là (la reprise ne réécrit que les échecs, clés `appliquee`).
   */
  async function executerEffet(m: Mission, gabarit: Gabarit) {
    const ec = deps.etapesCode;
    for (const g of gabarit.etapes.filter((e) => e.nature === "code" && e.rang > rangPorte(gabarit)).sort((a, b) => a.rang - b.rang)) {
      const courantes = (await base.lireEtapes(m.companyId, m.id)).filter((e) => e.tentative === 1);
      const etape = courantes.find((e) => e.rang === g.rang);
      if (!etape || etape.etat === "terminee") continue;
      await base.changerRangMission(m.companyId, m.id, (await base.lireMission(m.companyId, m.id))!.rangCourant, g.rang);
      const termine = (sortie: Record<string, unknown>) => base.majEtape(m.companyId, etape.id, { sortie, etat: "terminee" });
      const ctx = { companyId: m.companyId, missionId: m.id, campagneId: m.campagneId, entrees: entreesDe(courantes, g.rang) };
      if (g.action === "carte_groupee") await termine({ approuvee: true });
      else if (g.action === "export_crm" && ec) {
        const lot = await ec.lot(ctx);
        if (lot.length === 0) return effetAmbigu(m, g.rang, { raison: "lot_vide" });
        const exportes = new Set(lot.map((l) => l.prospectId));
        const ecartes = (Array.isArray(ctx.entrees.prospectIds) ? (ctx.entrees.prospectIds as unknown[]) : []).filter((id) => !exportes.has(id as string));
        // Valeurs d'une sortie d'agent : seuls des identifiants conformes, en nombre borné, entrent au journal.
        if (ecartes.length > 0) await journalUneFois(m, g.rang, "export_ids_ecartes", { ids: ecartes.filter((id) => IdNatif.safeParse(id).success).slice(0, 50), total: ecartes.length });
        // La marque informe, elle n'écarte jamais ; identifiants seuls, aucune coordonnée, et avant l'export : un arrêt après l'écriture ne la perd pas.
        const marques = lot.filter((l) => l.marqueOpposition).map((l) => l.prospectId);
        if (marques.length > 0) await journalUneFois(m, g.rang, "export_marque_opposition", { ids: marques });
        // Sans CRM : le choix se lit sur l'entrée du rang 1 (jamais sur `ctx.entrees`, qui fusionne des sorties d'agent) ; le lot est rendu en fichier, rien n'est écrit.
        const entreeRang1 = objet(courantes.find((e) => e.rang === 1)?.entree);
        if (Object.keys(objet(entreeRang1.exportCrm)).length === 0) {
          const canal = objet(entreeRang1.exportFichier).canal;
          if (!CanalContact.safeParse(canal).success) return effetAmbigu(m, g.rang, { raison: "canal_fichier_absent" });
          const prospectIds = [...new Set(lot.map((l) => l.prospectId))];
          // La route du fichier refuse au-delà : mieux vaut bloquer ici que clore sur un fichier impossible à télécharger.
          if (prospectIds.length > exportFichierMax) return effetAmbigu(m, g.rang, { raison: "lot_fichier_trop_grand", prospects: prospectIds.length });
          await journalUneFois(m, g.rang, "fichier_pret", { canal, prospects: prospectIds.length });
          // Le commentaire informe seulement : son échec ne retient pas le fichier, le journal le dit.
          try {
            await commenterUneFois(m, g.rang, "fichier_commentaire", "Le fichier du lot est prêt dans la vue Prospects, section « Fichiers de mission ».");
          } catch (e) {
            if (!(e instanceof ErreurCommentaire)) throw e;
            await journalUneFois(m, g.rang, "fichier_commentaire_echec", { erreur: e.message });
          }
          await termine({ reussis: [], echecs: [], essais: 0, fichier: { canal, prospectIds } });
          continue;
        }
        const precedents = typeof objet(etape.sortie).essais === "number" ? (objet(etape.sortie).essais as number) : 0;
        const { reussis, echecs, attente, execution, blocage } = await exporterLot(ec.deps, m, g.rang, lot);
        if (blocage) {
          // La diffusion ne repartira plus telle quelle : la tâche d'exécution de l'agent est annulée (un arrêt avant la transition se rejoue sans dommage).
          await fermerTache(m, objet(etape.sortie).tacheExecution, "cancelled");
          return effetAmbigu(m, g.rang, { raison: blocage.raison, motif: blocage.motif });
        }
        if (execution) {
          // Diffusion préparée : le moteur n'a pas le jeton du CRM, l'agent `crm-conversion` rejoue la diffusion avec la même clé. Une seule tâche par diffusion (la garde `trouverTache` couvre une nouvelle passe).
          const agent = await hote.resoudreAgent(m.companyId, "crm-conversion");
          if (!agent) return effetAmbigu(m, g.rang, { raison: "agent_crm_absent" });
          const originId = `mission:${m.id}:${g.rang}:diffusion:${execution.diffusionId}`;
          const porteId = issueDe(courantes, rangPorte(gabarit)) ?? m.issueRacineId;
          const existante = await trouverTache(m.companyId, originId);
          // Tâche fermée alors que la diffusion reste préparée : l'agent a clos sans déposer d'issue, rien à réveiller.
          if (existante && (existante.status === "done" || existante.status === "cancelled")) {
            // Après une reprise de l'arbitrage, la même tâche (même clé, même diffusion) est rouverte une seule fois par cycle ; refermée dans le même cycle, nouveau blocage.
            // shortcut: un arrêt entre l'enregistrement de la clé et la réouverture bloque à la passe suivante, le coordinateur arbitre de nouveau (3 cycles au plus), à revoir si le journal montre un arbitrage relancé sans changement d'état de la diffusion.
            const rouverte = m.cycleBlocage > 0 && (await base.enregistrerExecution({ companyId: m.companyId, missionId: m.id, rang: g.rang, type: "evenement", cle: cleCycle(m, g.rang, 1, "reouverture_execution", execution.diffusionId), requete: { type: "reouverture_execution" } }));
            if (!rouverte) return effetAmbigu(m, g.rang, { raison: "execution_crm_sans_issue", tacheId: existante.id });
            await hote.issues.update(existante.id, { status: "todo" }, m.companyId);
            await base.marquerExecution(m.companyId, cleCycle(m, g.rang, 1, "reouverture_execution", execution.diffusionId), "appliquee");
          }
          let tacheId = existante?.id;
          if (!tacheId) {
            tacheId = (await hote.issues.create({
              companyId: m.companyId, title: `Exécuter l'export CRM de la mission (diffusion ${execution.diffusionId.slice(0, 8)})`, status: "todo", assigneeAgentId: agent, originKind: ORIGINE_ETAPE as never, originId,
              description: `Tâche d'exécution du moteur : appliquer les étapes 3 à 6 de la consigne d'écriture, sans nouvelle proposition.\n\nTâche de la porte : ${porteId ?? "inconnue"}\nDiffusion : ${execution.diffusionId}\nAppel à relire : ${execution.appelId}\nclé d'idempotence : ${execution.cleDiffusion}\n\nLes arguments sont à relire dans les appels proposés de la tâche de la porte.`,
              ...(m.issueRacineId ? { parentId: m.issueRacineId } : {}),
            })).id;
          }
          // Reprise après une preuve morte : la tâche de l'ancienne diffusion est annulée, l'agent ne rejoue plus une clé révoquée.
          const ancienne = objet(etape.sortie).tacheExecution;
          if (typeof ancienne === "string" && ancienne !== tacheId && typeof objet(etape.sortie).blocage === "string") await hote.issues.update(ancienne, { status: "cancelled" }, m.companyId);
          await reveiller(m, g.rang, 1, tacheId, "execution_crm", execution.diffusionId);
          await base.majEtape(m.companyId, etape.id, { sortie: { reussis, echecs, essais: precedents, tacheExecution: tacheId }, etat: "en_cours" });
          await journalUneFois(m, g.rang, "export_a_executer", { diffusionId: execution.diffusionId, tacheId }, null, execution.diffusionId);
          return;
        }
        if (attente) {
          // Attente de l'approbation humaine : ni échec ni essai, la mission reste en exécution et une passe suivante rejoue la même clé.
          await base.majEtape(m.companyId, etape.id, { sortie: { reussis, echecs: [], essais: precedents, enAttente: true }, etat: "en_cours" });
          await journalUneFois(m, g.rang, "export_en_attente", { appelId: attente.appelId, consigne: attente.consigne }, null, attente.appelId ?? undefined);
          // Présenter l'appel à l'humain sur la tâche de la porte : service, nombre de prospects, identifiant de l'appel ; aucune coordonnée ni dénomination.
          const service = objet(entreeRang1.exportCrm).service;
          await commenterUneFois(
            m, g.rang, "export_appel_a_approuver",
            `Export vers le CRM « ${typeof service === "string" ? service : "?"} » en attente d'approbation : ${attente.prospects} prospect${attente.prospects > 1 ? "s" : ""}, appel ${attente.appelId ?? "?"}, à approuver dans la décision de cette tâche.`,
            issueDe(courantes, rangPorte(gabarit)), attente.appelId ?? undefined,
          );
          return;
        }
        const essais = precedents + 1;
        if (echecs.length === 0) {
          await fermerTache(m, objet(etape.sortie).tacheExecution, "done");
          await termine({ reussis, echecs: [], essais });
        } else {
          // La tâche d'exécution reste dans la sortie : l'abandon et la fermeture la retrouvent.
          const tacheExecution = objet(etape.sortie).tacheExecution;
          await base.majEtape(m.companyId, etape.id, { sortie: { reussis, echecs, essais, ...(typeof tacheExecution === "string" ? { tacheExecution } : {}) }, etat: "en_cours" });
          await journal(m, "moteur.export_partiel", { rang: g.rang, reussis, echecs, essais });
          if (essais >= ESSAIS_EXPORT_MAX) {
            await fermerTache(m, tacheExecution, "cancelled");
            await effetAmbigu(m, g.rang, { raison: "export_partiel", essais });
          }
          return;
        }
      } else if (g.action === "verifier" && ec) {
        const exporte = courantes.find((e) => e.rang === g.rang - 1);
        const reussis = (Array.isArray(objet(exporte?.sortie).reussis) ? (objet(exporte?.sortie).reussis as string[]) : []);
        const absents: string[] = [];
        for (const id of reussis) if (!(await ec.deps.crm.confirme(m.companyId, m.id, id))) absents.push(id);
        if (absents.length > 0) {
          // Un export dont l'issue est ambiguë n'est pas « absent » : à réconcilier, jamais réécrit.
          let ambigu = false;
          for (const id of absents) if (await ec.deps.crm.ambigu?.(m.companyId, m.id, id)) ambigu = true;
          return effetAmbigu(m, g.rang, { raison: ambigu ? "export_a_reconcilier" : "absents_du_crm", absents });
        }
        await termine({ verifies: reussis.length });
      } else return effetAmbigu(m, g.rang, { raison: "etape_code_inconnue", action: g.action ?? null });
    }
    // Toutes les étapes en code sont terminées (atteint sans `return`) : confirmation puis clôture, rejouables seules si un arrêt les sépare.
    const rangFinal = Math.max(...gabarit.etapes.map((e) => e.rang));
    const derniere = (await base.lireEtapes(m.companyId, m.id)).find((e) => e.tentative === 1 && e.rang === rangFinal);
    if (!derniere) return;
    await appliquer(m.companyId, m.id, rangFinal, 1, "effet_confirme");
    return cloturer(m, derniere);
  }

  /** Filet `issue.updated` : un `done` natif sans sortie valide ne change rien à la mission, la tâche retrouve son statut projeté. */
  async function surDoneNatif(companyId: string, issueId: string): Promise<void> {
    const etape = await base.etapeParIssue(companyId, issueId);
    if (!etape) return;
    const m = await base.lireMission(companyId, etape.missionId);
    if (!m || ["cloturee", "annulee", "echec"].includes(m.etat)) return;
    let type = "done_sans_sortie";
    if (m.etat === "attente_autorisation") {
      // shortcut: sans étape en code après la porte, seule l'approbation sans effet externe clôture ici ; un effet externe hors étape en code n'a pas d'exécuteur, à ajouter avec le gabarit qui en aura besoin.
      const gabarit = charger(m.gabaritCle, m.gabaritVersion);
      const avecEtapesCode = gabarit.etapes.some((e) => e.nature === "code" && e.rang > rangPorte(gabarit));
      const sansEffet = chargerContrat(m.contratId, m.contratVersion).effetExterne === "aucun";
      if ((sansEffet || avecEtapesCode) && (await approuvee(companyId, etape.issueId ?? issueId))) {
        // Approuvée sur une autre révision que celle relue : pas de clôture, la tâche est rouverte comme un done sans approbation.
        if (etape.revisionLivrable && (await deps.revisionLivrable(companyId, issueId)) !== etape.revisionLivrable) type = "revision_changee";
        else if (avecEtapesCode) {
          await appliquer(companyId, m.id, etape.rang, etape.tentative, "approuvee_avec_effet");
          return executerEffet(m, gabarit);
        } else {
          await appliquer(companyId, m.id, etape.rang, etape.tentative, "approuvee_sans_effet");
          return cloturer(m, etape);
        }
      }
    } else if (etape.etat === "terminee" && etape.sortie !== null) return;
    // Statut projeté : `backlog` pour une étape à venir, sinon celui de l'état de la mission.
    const rangCourant = m.etat === "blocage" ? Math.max(1, m.rangCourant) : m.rangCourant; // comme `bloquer` : un blocage avant l'étape 1 concerne l'étape 1
    const projete = etape.etat === "en_attente" && etape.rang > rangCourant ? "backlog" : STATUT_PROJETE[m.etat];
    await hote.issues.update(issueId, { status: projete }, companyId);
    await journal(m, `moteur.${type}`, { rang: etape.rang }, issueId);
  }

  return {
    demarrerMission: (companyId: string, missionId: string) => enFile(missionId, () => demarrer(companyId, missionId)),
    lancerMission: (companyId: string, missionId: string, entrees: Record<string, unknown>) => enFile(missionId, () => lancer(companyId, missionId, entrees)),
    recevoirResultat: (companyId: string, r: Parameters<typeof traiterResultat>[1]) => enFile(r.missionId, () => traiterResultat(companyId, r)),
    deposerVerdict: (companyId: string, v: Parameters<typeof traiterVerdict>[1]) => enFile(v.missionId, () => traiterVerdict(companyId, v)),
    reprendre,
    /** Reprise de l'arbitrage (coordinateur ou levée automatique) : faux si la mission n'est pas en blocage. */
    sortirDeBlocage: (companyId: string, missionId: string) => enFile(missionId, async () => {
      const m = await base.lireMission(companyId, missionId);
      return m?.etat === "blocage" ? sortirDeBlocage(m) : false;
    }),
    /** Abandon de l'arbitrage : faux si la mission n'est pas en blocage. L'accord humain est contrôlé par l'outil, pas ici. */
    abandonner: (companyId: string, missionId: string) => enFile(missionId, async () => {
      const m = await base.lireMission(companyId, missionId);
      return m?.etat === "blocage" ? abandonner(m) : false;
    }),
    surChangementsNatifs: async (companyId: string, issueId: string) => {
      const etape = await base.etapeParIssue(companyId, issueId);
      return etape ? enFile(etape.missionId, () => changementsNatifs(companyId, issueId)) : undefined;
    },
    // Dans la file de la mission, comme les autres entrées : l'approbation écrit plusieurs transitions.
    surDoneNatif: async (companyId: string, issueId: string) => {
      const etape = await base.etapeParIssue(companyId, issueId);
      return etape ? enFile(etape.missionId, () => surDoneNatif(companyId, issueId)) : undefined;
    },
  };
}

export interface DepsReprise {
  /** Toutes les entreprises de l'instance (`ctx.companies.list`). */
  entreprises: () => Promise<string[]>;
  config: (companyId: string) => Promise<Record<string, unknown> | null | undefined>;
  executeur: Pick<Executeur, "reprendre">;
  logger: Pick<PluginContext["logger"], "warn">;
}

/**
 * Reprise de toutes les entreprises où le réglage est actif ; les autres ne touchent aucune table du moteur.
 * La liste vient de l'hôte, jamais d'une table : aucune promesse rejetée ne s'échappe (minuterie `void`).
 */
export async function reprendreSiActif(d: DepsReprise): Promise<void> {
  let entreprises: string[];
  try {
    entreprises = await d.entreprises();
  } catch (e) {
    d.logger.warn("Moteur de missions : liste des entreprises en échec", { erreur: e instanceof Error ? e.message : String(e) });
    return;
  }
  for (const companyId of entreprises) {
    try {
      if (moteurActif(await d.config(companyId))) await d.executeur.reprendre(companyId);
    } catch (e) {
      d.logger.warn("Moteur de missions : reprise en échec", { companyId, erreur: e instanceof Error ? e.message : String(e) });
    }
  }
}
