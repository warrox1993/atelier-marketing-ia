/**
 * Moteur de missions (#49, tâche 5) : exécuteur, reprise et réglage d'activation.
 * Source : `docs/moteur-missions.md` (décisions 1 à 6, états, clé d'idempotence, écarts 1 et 4).
 *
 * Toute écriture rejouable passe par `executions` : intention en `demandee`, effet, puis `appliquee`. Une clé `appliquee`
 * ne produit plus rien ; une clé `demandee` est reprise. Le SDK ne transmet pas `idempotencyKey` à la création d'une
 * tâche : l'unicité vient de la lecture par origine avant chaque création.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { PLUGIN_ID } from "../contrats/index.js";
import type { BaseAtelier, EtapeMission, Mission } from "../serveur/base.js";
import { chargerContrat, verifierEntrees, verifierSortie } from "./contrats.js";
import { chargerGabarit as chargerGabaritReel, poserPorteMission, PorteRefusee, type DepsPorteMission, type Gabarit } from "./gabarits.js";
import { STATUT_PROJETE, TransitionInvalide, transitionner, type EtatMission, type EvenementMission } from "./transitions.js";

export const ORIGINE_ETAPE = `plugin:${PLUGIN_ID}:etape-mission` as const;
const CONTEXTE = "atelier.moteur";
const ROLE_COORDINATEUR = "coordinateur";

export interface HoteMoteur {
  issues: Pick<PluginContext["issues"], "create" | "list" | "get" | "update" | "requestWakeup" | "listInteractions">;
  /** Agent de l'entreprise qui tient le rôle (slug du registre) ; null s'il n'y en a pas. */
  resoudreAgent(companyId: string, role: string): Promise<string | null>;
}

type BaseMoteur = Pick<
  BaseAtelier,
  | "lireMission" | "missionsActives" | "changerEtatMission" | "changerRangMission" | "creerEtape" | "lireEtapes" | "majEtape"
  | "etapeParIssue" | "enregistrerExecution" | "marquerExecution" | "lireExecution" | "journaliser"
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

const cleEvenement = (missionId: string, rang: number, tentative: number, evenement: string, source?: string) =>
  `${missionId}:${rang}:${tentative}:${evenement}${source ? `:${source}` : ""}`;

export function creerExecuteur(deps: DepsExecuteur) {
  const { hote, base, horloge } = deps;
  const charger = deps.chargerGabarit ?? chargerGabaritReel;

  const journal = (m: Mission, type: string, donnees: Record<string, unknown>, issueId?: string | null) =>
    base.journaliser({ companyId: m.companyId, type, entite: "mission", entiteId: m.id, issueId: issueId ?? null, acteur: "moteur", donnees: { ...donnees, le: horloge().toISOString() } });

  /** Journalise une fois par clé (`type` et discriminant) : une cause qui se répète à chaque passe ne remplit pas le journal. */
  async function journalUneFois(m: Mission, rang: number, type: string, donnees: Record<string, unknown>, issueId?: string | null, discriminant?: string) {
    const cle = cleEvenement(m.id, rang, 1, type, discriminant);
    if (!(await base.enregistrerExecution({ companyId: m.companyId, missionId: m.id, rang, type: "evenement", cle, requete: { type } }))) return;
    await journal(m, `moteur.${type}`, donnees, issueId);
    await base.marquerExecution(m.companyId, cle, "appliquee");
  }

  /** Transition pure, puis compare-and-set. `applique` faux : clé déjà appliquée (rejeu) ou changement perdu. */
  async function appliquer(companyId: string, missionId: string, rang: number, tentative: number, evenement: EvenementMission, source?: string) {
    const cle = cleEvenement(missionId, rang, tentative, evenement, source);
    const neuve = await base.enregistrerExecution({ companyId, missionId, rang, type: "evenement", cle, requete: { evenement } });
    if (!neuve && (await base.lireExecution(companyId, cle))?.statut === "appliquee") return { applique: false, etat: null };
    const m = await base.lireMission(companyId, missionId);
    if (!m) throw new Error(`Mission « ${missionId} » inconnue.`);
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

  /** Réveil direct, une fois par clé : `appliquee` ne repart pas, `demandee` est rejouée. */
  async function reveiller(m: Mission, rang: number, tentative: number, issueId: string, raison: string, source?: string) {
    const cle = cleEvenement(m.id, rang, tentative, "reveil", source ? `${raison}:${source}` : raison);
    const neuve = await base.enregistrerExecution({ companyId: m.companyId, missionId: m.id, rang, type: "reveil", cle, requete: { issueId } });
    if (!neuve && (await base.lireExecution(m.companyId, cle))?.statut === "appliquee") return;
    await hote.issues.requestWakeup(issueId, m.companyId, { reason: `moteur_${raison}`, contextSource: CONTEXTE, idempotencyKey: cle });
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

  /** Une tâche par étape (origine `mission:<id>:<rang>`), en `backlog`, bloquée par la précédente ; sans doublon. */
  async function creerTaches(m: Mission, gabarit: Gabarit): Promise<EtapeMission[]> {
    let precedente: string | null = null;
    for (const g of [...gabarit.etapes].sort((a, b) => a.rang - b.rang)) {
      const originId = `mission:${m.id}:${g.rang}`;
      await base.enregistrerExecution({ companyId: m.companyId, missionId: m.id, rang: g.rang, type: "creation_tache", cle: cleEvenement(m.id, g.rang, 1, "creation_tache"), requete: { originId } });
      // shortcut: un issues.create en vol qui aboutit après cette lecture crée un doublon (le SDK ne transmet pas idempotencyKey), passer à l'idempotence native quand le SDK la transmettra.
      const deja = await trouverTache(m.companyId, originId);
      let issueId = deja?.id;
      if (!issueId) {
        const agent = await hote.resoudreAgent(m.companyId, g.role);
        if (!agent) throw new Error(`Aucun agent pour le rôle « ${g.role} » dans l'entreprise.`);
        issueId = (await hote.issues.create({
          companyId: m.companyId, title: `${gabarit.description.split(".")[0]} : étape ${g.rang} (${g.role})`, description: m.mandat, status: "backlog",
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

  const issueDe = (etapes: EtapeMission[], rang: number) => etapes.find((e) => e.rang === rang && e.issueId)?.issueId ?? null;

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
    await signalerBlocage(m, etapes, rang);
  }

  async function signalerBlocage(m: Mission, etapes: EtapeMission[], rang: number) {
    const issueId = issueDe(etapes, rang);
    const coordinateur = await hote.resoudreAgent(m.companyId, ROLE_COORDINATEUR);
    if (!issueId || !coordinateur) return void (await journalUneFois(m, rang, "blocage_sans_reveil", { rang, tache: Boolean(issueId), coordinateur: Boolean(coordinateur) }, issueId));
    // Réveil déjà appliqué : la tâche est déjà chez le coordinateur, on ne la réécrit pas (une reprise ne doit rien changer).
    if ((await base.lireExecution(m.companyId, cleEvenement(m.id, rang, 1, "reveil", "blocage")))?.statut === "appliquee") return;
    await hote.issues.update(issueId, { status: STATUT_PROJETE.blocage, assigneeAgentId: coordinateur }, m.companyId);
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
    const rangDernier = Math.max(...gabarit.etapes.map((e) => e.rang));
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

  /** Entrées de l'étape : la sortie de la précédente, complétée par ses propres entrées. */
  const entreesDe = (etapes: EtapeMission[], rang: number): Record<string, unknown> => {
    const objet = (v: unknown) => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
    return { ...objet(etapes.find((e) => e.rang === rang - 1)?.sortie), ...objet(etapes.find((e) => e.rang === rang)?.entree) };
  };

  /** Démarre l'étape `rang` : entrées vérifiées en code (sans modèle), puis réveil direct de son agent. */
  async function lancerRang(m: Mission, gabarit: Gabarit, etapes: EtapeMission[], rang: number) {
    const g = gabarit.etapes.find((e) => e.rang === rang)!;
    const etape = etapes.find((e) => e.rang === rang && e.tentative === 1)!;
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
    const verdict = verifierSortie(chargerContrat(g.contratId, g.contratVersion), r.sortie);
    if (!verdict.ok) {
      await appliquer(companyId, m.id, r.rang, r.tentative, "sortie_hors_contrat", r.cleEvenement);
      await journal(m, "moteur.sortie_hors_contrat", { rang: r.rang, erreurs: verdict.erreurs }, etape.issueId);
      return { statut: "refuse", erreurs: verdict.erreurs };
    }
    await base.majEtape(companyId, etape.id, { sortie: r.sortie, etat: "terminee", ...(r.revisionLivrable ? { revisionLivrable: r.revisionLivrable } : {}) });
    const derniere = r.rang === Math.max(...p.gabarit.etapes.map((e) => e.rang));
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
    if (await dejaApplique(companyId, cleEvenement(m.id, v.rang, v.tentative, evenement, v.runId))) return { statut: "rejeu" as const, etat: m.etat };
    if (!transitionPermise(m.etat, evenement)) return { statut: "transition_invalide" as const, etat: m.etat };
    // L'étape repasse en cours avant la transition : un arrêt entre les deux ne doit pas faire retraiter l'ancienne sortie par la reprise.
    const etape = v.accepte ? undefined : (await base.lireEtapes(companyId, m.id)).find((e) => e.rang === v.rang && e.tentative === v.tentative);
    if (etape) await base.majEtape(companyId, etape.id, { etat: "en_cours" });
    const t = await appliquer(companyId, m.id, v.rang, v.tentative, evenement, v.runId);
    if (t.applique) await journal(m, "moteur.verdict", { rang: v.rang, verdict: v.accepte ? "accepte" : "changements_demandes", ...(v.justification ? { justification: v.justification } : {}) });
    if (t.applique && etape?.issueId) {
      // Changements demandés : le rédacteur reprend sa tâche. shortcut: un arrêt entre la transition et ce réveil le laisse endormi (la clé « etape » du réveil initial est déjà appliquée, la reprise ne le rejoue pas) ; le veilleur des tâches orphelines le rattrape, à revoir si ce délai gêne.
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
    if (await dejaApplique(companyId, cleEvenement(m.id, etape.rang, etape.tentative, "changements_demandes", source))) return;
    // L'étape repasse en cours avant la transition, comme pour un verdict de relecteur.
    await base.majEtape(companyId, etape.id, { etat: "en_cours" });
    if ((await appliquer(companyId, m.id, etape.rang, etape.tentative, "changements_demandes", source)).applique) await journal(m, "moteur.changements_humains", { rang: etape.rang }, issueId);
  }

  async function avancerAuRang(companyId: string, missionId: string, rang: number) {
    const m = (await base.lireMission(companyId, missionId))!;
    const p = await preparer(m);
    if (p) await lancerRang(m, p.gabarit, p.etapes, rang);
  }

  /** Rattrape une mission active après un arrêt ou un événement perdu, sans doublon (clés d'exécution). */
  async function reprendreMission(m: Mission) {
    if (m.etat === "blocage") {
      const etapes = await base.lireEtapes(m.companyId, m.id);
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
      const etapes = (await base.lireEtapes(m.companyId, m.id)).filter((e) => e.tentative === 1);
      const derniere = etapes.at(-1);
      if (charger(m.gabaritCle, m.gabaritVersion).porte && !(await approuvee(m.companyId, derniere?.issueId))) return;
      return derniere ? cloturer(m, derniere) : undefined;
    }
    if (m.etat === "attente_autorisation") {
      // Approbation (ou `done` sans approbation) survenue pendant l'arrêt, sans événement.
      const etape = (await base.lireEtapes(m.companyId, m.id)).find((e) => e.rang === Math.max(1, m.rangCourant) && e.tentative === 1);
      const tache = etape ? await trouverTache(m.companyId, `mission:${m.id}:${etape.rang}`) : null;
      if (!tache) return;
      return tache.status === "done" ? surDoneNatif(m.companyId, tache.id) : changementsNatifs(m.companyId, tache.id);
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
    if (courante.etat === "terminee" && courante.sortie !== null) {
      await traiterResultat(m.companyId, { missionId: m.id, rang: courante.rang, tentative: courante.tentative, sortie: courante.sortie });
    } else if (courante.issueId && courante.etat === "en_attente") {
      // Arrêt entre `demarrage` et la mise à `todo` : la tâche est encore en `backlog`, que l'hôte ne réveille pas.
      await hote.issues.update(courante.issueId, { status: STATUT_PROJETE.prete }, m.companyId);
      await base.majEtape(m.companyId, courante.id, { etat: "en_cours" });
      await reveiller(m, courante.rang, 1, courante.issueId, "etape");
    } else if (courante.issueId) {
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

  /** Filet `issue.updated` : un `done` natif sans sortie valide ne change rien à la mission, la tâche retrouve son statut projeté. */
  async function surDoneNatif(companyId: string, issueId: string): Promise<void> {
    const etape = await base.etapeParIssue(companyId, issueId);
    if (!etape) return;
    const m = await base.lireMission(companyId, etape.missionId);
    if (!m || ["cloturee", "annulee", "echec"].includes(m.etat)) return;
    let type = "done_sans_sortie";
    if (m.etat === "attente_autorisation") {
      // shortcut: seule l'approbation sans effet externe clôture ici, l'exécution d'un effet approuvé arrive avec #51.
      const sansEffet = chargerContrat(m.contratId, m.contratVersion).effetExterne === "aucun";
      if (sansEffet && (await approuvee(companyId, etape.issueId ?? issueId))) {
        // Approuvée sur une autre révision que celle relue : pas de clôture, la tâche est rouverte comme un done sans approbation.
        if (etape.revisionLivrable && (await deps.revisionLivrable(companyId, issueId)) !== etape.revisionLivrable) type = "revision_changee";
        else {
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
