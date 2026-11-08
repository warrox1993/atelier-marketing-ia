/**
 * Moteur de missions (#50, tâche 1) : les cinq outils typés de l'agent. Forme `(paramètres, run)` comme `creerOutilsFabrique`.
 * Chaque appel contrôle côté serveur, dans l'ordre : moteur actif, schéma, identité du run, version du contrat, droit.
 * Un refus rend une `ErreurOutil` avec une action recommandée, sans rien écrire ni réveiller. L'identifiant du run sert de
 * source à la clé d'idempotence : même run rejoué sans effet, nouveau run appliqué.
 */
import type { PluginContext, PluginToolDeclaration, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { DeposerVerdictEntree, PLUGIN_ID } from "../contrats/index.js";
import type { Services } from "../serveur/atelier.js";
import type { BaseAtelier, EtapeMission, Mission } from "../serveur/base.js";
import { ErreurAtelier } from "../serveur/erreurs.js";
import { agentParSlug, moteurActif, type AgentListe, type Executeur } from "./executeur.js";
import { chargerGabarit as chargerGabaritReel, rangPorte, revuesImposees, type Gabarit } from "./gabarits.js";

export type ErreurOutil = { code: string; message: string; actionRecommandee: string };

/** shortcut: un plafond unique pour tous les contrats (aucun ne déclare de taille de sortie), à remplacer par une limite du contrat dès qu'il en porte une. */
export const TAILLE_MAX_LIVRABLE_OCTETS = 256 * 1024;
const LIMITE_SOURCES = 50;
const ROLE_COORDINATEUR = "coordinateur";
/** Origine des sous-tâches de revue créées par `assurerRevues` (services.ts) : `<étape>:<révision>:<rôle>`. */
const ORIGINE_REVUE = `plugin:${PLUGIN_ID}:revue`;

const Id = z.string().min(1).max(100);
const Version = z.number().int().min(1);
const SCHEMAS = {
  mission_etat: z.object({ missionId: Id }).strict(),
  livrable_deposer: z.object({ missionId: Id, versionContrat: Version, sortie: z.record(z.string(), z.unknown()) }).strict(),
  // Champs du verdict structuré repris de la route `tache.verdict` (une seule source) ; la route le valide en entier.
  verdict_deposer: z.object({ missionId: Id, versionContrat: Version, ...DeposerVerdictEntree.shape }).strict(),
  decision_demander: z.object({ missionId: Id, versionContrat: Version, question: z.string().min(1).max(2000) }).strict(),
  sources_lister: z.object({ missionId: Id }).strict(),
} as const;
type NomOutil = keyof typeof SCHEMAS;

const DESCRIPTIONS: Record<NomOutil, [string, string]> = {
  mission_etat: ["État d'une mission", "Lit l'état de la mission (état, rang, étape courante, ce qui attend). Lecture seule."],
  livrable_deposer: ["Déposer le livrable d'une étape", "Dépose la sortie de votre étape, conforme au contrat (versionContrat comprise). Texte transmis sans altération."],
  verdict_deposer: ["Déposer un verdict de relecture", "Verdict structuré du relecteur sur la mission en revue (mêmes champs que la route des verdicts). La porte s'évalue ensuite : tant que toutes les revues requises ne sont pas passées, la mission reste en revue."],
  decision_demander: ["Demander une décision", "Pose une carte de décision sur votre tâche ; l'humain y répond. La mission ne change pas d'état. Une carte identique encore en attente n'est pas recréée, quel que soit le run."],
  sources_lister: ["Lister les sources", "Liste les sources de la mission (ou de sa campagne). Lecture seule."],
};

/** Déclarations pour le manifeste ; le schéma JSON vient du schéma zod, une seule source. */
const schemaJson = (name: NomOutil) => {
  const { $schema: _s, ...parametersSchema } = z.toJSONSchema(SCHEMAS[name], { target: "draft-7", io: "input" });
  return parametersSchema;
};
// Une constante par outil, nom littéral : le contrôle du dépôt (verifier-organisation) résout chaque nom du manifeste.
export const DECLARATION_MISSION_ETAT: PluginToolDeclaration = { name: "mission_etat", displayName: DESCRIPTIONS.mission_etat[0], description: DESCRIPTIONS.mission_etat[1], parametersSchema: schemaJson("mission_etat") } as unknown as PluginToolDeclaration;
export const DECLARATION_LIVRABLE_DEPOSER: PluginToolDeclaration = { name: "livrable_deposer", displayName: DESCRIPTIONS.livrable_deposer[0], description: DESCRIPTIONS.livrable_deposer[1], parametersSchema: schemaJson("livrable_deposer") } as unknown as PluginToolDeclaration;
export const DECLARATION_VERDICT_DEPOSER: PluginToolDeclaration = { name: "verdict_deposer", displayName: DESCRIPTIONS.verdict_deposer[0], description: DESCRIPTIONS.verdict_deposer[1], parametersSchema: schemaJson("verdict_deposer") } as unknown as PluginToolDeclaration;
export const DECLARATION_DECISION_DEMANDER: PluginToolDeclaration = { name: "decision_demander", displayName: DESCRIPTIONS.decision_demander[0], description: DESCRIPTIONS.decision_demander[1], parametersSchema: schemaJson("decision_demander") } as unknown as PluginToolDeclaration;
export const DECLARATION_SOURCES_LISTER: PluginToolDeclaration = { name: "sources_lister", displayName: DESCRIPTIONS.sources_lister[0], description: DESCRIPTIONS.sources_lister[1], parametersSchema: schemaJson("sources_lister") } as unknown as PluginToolDeclaration;

type BaseOutils = Pick<BaseAtelier, "lireMission" | "lireEtapes" | "listerSources">;

/** Évaluation de la porte (`evaluer` des services) : appelée par le moteur, qui n'est pas le participant de revue de la route. */
export type EvaluerPorte = (companyId: string, issueId: string, par: string) => Promise<{ decision: string; motifs: unknown[] }>;

export interface DepsOutilsMoteur {
  /** Réglage de l'entreprise (`ctx.config.get`) : `moteurMissions` doit être vrai. */
  config(companyId: string): Promise<Record<string, unknown> | null | undefined>;
  base: BaseOutils;
  /** Tâche d'origine du run (`base.tacheDuRun`). */
  tacheDuRun(companyId: string, runId: string): Promise<string | null>;
  agents(companyId: string): Promise<AgentListe[]>;
  executeur: Pick<Executeur, "recevoirResultat" | "deposerVerdict">;
  /** Cartes de décision natives (`ctx.issues`). */
  issues: Pick<PluginContext["issues"], "listInteractions" | "requestConfirmation" | "get">;
  /** Route du plugin réutilisée telle quelle : enregistrement du verdict (elle contrôle le relecteur désigné). */
  routes: Required<Pick<Services["routes"], "tache.verdict">>;
  evaluerPorte: EvaluerPorte;
  /** Révision courante du document livrable de la tâche (clé de sa porte) ; null s'il n'y en a pas. */
  revisionLivrable: (companyId: string, issueId: string) => Promise<string | null>;
  chargerGabarit?: (cle: string, version?: number) => Gabarit;
}

const refus = (code: string, message: string, actionRecommandee: string): ToolResult => {
  const data: ErreurOutil = { code, message, actionRecommandee };
  return { error: `${message} Action recommandée : ${actionRecommandee}`, data };
};
const succes = (data: Record<string, unknown>): ToolResult => ({ content: JSON.stringify(data), data });

/** Slug d'un agent de revue écrit `{{agent:<slug>}}` dans le gabarit. */
const slugDeRevue = (agentId: string) => /^\{\{agent:([a-z0-9-]+)\}\}$/u.exec(agentId)?.[1];

const ATTENTES: Partial<Record<Mission["etat"], string>> = {
  prete: "démarrage de l'étape", en_cours: "livrable de l'agent de l'étape", en_revue: "verdict d'un relecteur",
  attente_autorisation: "autorisation humaine", en_execution: "effet externe en cours", resultat_confirme: "clôture",
  attente_information: "information manquante à fournir", blocage: "arbitrage du coordinateur", pause: "reprise de la mission",
};

export function creerOutilsMoteur(deps: DepsOutilsMoteur) {
  const gabaritDe = deps.chargerGabarit ?? chargerGabaritReel;

  /** Contrôles communs ; rend le contexte ou le refus. `acces` : qui a le droit (assigné de l'étape, relecteur, ou les deux pour la lecture). */
  async function controler<N extends NomOutil>(nom: N, params: unknown, run: ToolRunContext, acces: "etape" | "revue" | "lecture") {
    if (!moteurActif(await deps.config(run.companyId))) {
      return refus("moteur_desactive", "Le moteur de missions n'est pas activé pour cette entreprise.", "Ne pas utiliser cet outil ; la tâche se traite comme d'habitude.");
    }
    const lu = SCHEMAS[nom].safeParse(params);
    if (!lu.success) {
      const detail = lu.error.issues.map((i) => `${i.path.join(".") || "paramètres"} : ${i.message}`).join(" ; ");
      return refus("parametres_invalides", `Paramètres invalides (${detail}).`, "Corriger les paramètres selon le schéma de l'outil, puis rappeler.");
    }
    const p = lu.data as { missionId: string; versionContrat?: number; sortie?: Record<string, unknown> };
    if (p.sortie !== undefined && Buffer.byteLength(JSON.stringify(p.sortie), "utf8") > TAILLE_MAX_LIVRABLE_OCTETS) {
      return refus("livrable_trop_gros", `Le livrable dépasse ${TAILLE_MAX_LIVRABLE_OCTETS} octets.`, "Raccourcir le livrable (textes plus courts, moins d'éléments), puis redéposer.");
    }
    const m = await deps.base.lireMission(run.companyId, p.missionId);
    if (!m) return refus("mission_inconnue", `Mission « ${p.missionId} » inconnue pour votre entreprise.`, "Vérifier l'identifiant de la mission dans la description de votre tâche.");
    const etapes = await deps.base.lireEtapes(run.companyId, m.id);
    const tache = await deps.tacheDuRun(run.companyId, run.runId);
    const rang = Math.max(1, m.rangCourant);
    const etape = etapes.filter((e) => e.rang === rang).sort((a, b) => b.tentative - a.tentative)[0];
    // Lecture : le rattachement du run à la mission ou à l'étape ne compte pas, seuls le rôle et l'entreprise comptent.
    if (acces === "revue") {
      // Le relecteur travaille sur la sous-tâche de revue de l'étape courante (`assurerRevues`), jamais sur la tâche d'étape elle-même.
      const role = (lu.data as { role?: string }).role;
      const revue = tache && etape?.issueId ? await deps.issues.get(tache, run.companyId) : null;
      const origine = revue?.originId ?? "";
      if (!revue || revue.companyId !== run.companyId || revue.parentId !== etape!.issueId || revue.originKind !== ORIGINE_REVUE || !origine.startsWith(`${etape!.issueId}:`) || !origine.endsWith(`:${role}`)) {
        return refus("run_hors_mission", "Ce passage d'agent n'est pas rattaché à la tâche de revue de l'étape courante de cette mission.", "Appeler l'outil depuis votre tâche de revue, pour le rôle qui vous y est assigné.");
      }
    } else if (acces !== "lecture" && (!tache || !etapes.some((e) => e.issueId === tache))) {
      return refus("run_hors_mission", "Ce passage d'agent n'est pas rattaché à une tâche de cette mission.", "Appeler l'outil depuis la tâche de la mission.");
    }
    if (acces !== "lecture" && acces !== "revue" && (!etape || etape.issueId !== tache)) {
      return refus("run_hors_etape", "Votre tâche n'est pas l'étape courante de la mission.", "Appeler mission_etat pour connaître l'étape courante ; ne rien déposer pour une autre étape.");
    }
    let gabarit: Gabarit;
    try {
      gabarit = gabaritDe(m.gabaritCle, m.gabaritVersion);
    } catch {
      return refus("gabarit_inconnu", "Le gabarit de la mission est introuvable.", "Signaler le blocage au coordinateur.");
    }
    const g = gabarit.etapes.find((e) => e.rang === rang);
    if (p.versionContrat !== undefined && p.versionContrat !== g?.contratVersion) {
      return refus("contrat_version", `Version de contrat ${p.versionContrat} périmée : l'étape attend la version ${g?.contratVersion}.`, "Appeler mission_etat, relire le contrat à la version indiquée, puis redéposer.");
    }
    const agents = await deps.agents(run.companyId);
    const assigne = etape !== undefined && agentParSlug(agents, etape.role) === run.agentId;
    const relecteur = revuesImposees(gabarit, { conformite: true }).some((r) => { const s = slugDeRevue(r.agentId); return s !== undefined && agentParSlug(agents, s) === run.agentId; });
    const coordinateur = agentParSlug(agents, ROLE_COORDINATEUR) === run.agentId;
    if (!(acces === "etape" ? assigne : acces === "revue" ? relecteur : assigne || relecteur || coordinateur)) {
      return refus("droit_refuse", acces === "revue" ? "Seul un relecteur de la mission peut déposer un verdict." : "Vous n'êtes pas l'agent assigné à l'étape courante.", "Ne rien déposer ; signaler la difficulté sur votre tâche.");
    }
    // `etape` n'est absente que pour une lecture ; les autres accès l'ont exigée plus haut.
    return { m, etape, p, g, gabarit } as { m: Mission; etape: EtapeMission; p: typeof p; g: Gabarit["etapes"][number] | undefined; gabarit: Gabarit };
  }
  const refuse = (c: unknown): c is ToolResult => typeof c === "object" && c !== null && ("error" in c);

  const transitionRefusee = (etat: string) => refus("transition_invalide", `Cette action n'est pas permise dans l'état « ${etat} ».`, "Appeler mission_etat pour connaître l'état et ce qui attend.");

  return {
    async mission_etat(params: unknown, run: ToolRunContext): Promise<ToolResult> {
      const c = await controler("mission_etat", params, run, "lecture");
      if (refuse(c)) return c;
      const { m, g } = c;
      const etape: EtapeMission | undefined = c.etape;
      return succes({ missionId: m.id, etat: m.etat, rangCourant: m.rangCourant, enAttente: ATTENTES[m.etat] ?? null, etapeCourante: etape ? { rang: etape.rang, role: etape.role, tentative: etape.tentative, etat: etape.etat, contratId: g?.contratId ?? null, contratVersion: g?.contratVersion ?? null } : null });
    },

    async livrable_deposer(params: unknown, run: ToolRunContext): Promise<ToolResult> {
      const c = await controler("livrable_deposer", params, run, "etape");
      if (refuse(c)) return c;
      const { m, etape, p, gabarit } = c;
      // Sous porte, la dernière sortie se rattache au document relu : sans document, rien n'est écrit.
      let revisionLivrable: string | undefined;
      if (gabarit.porte && etape.rang === rangPorte(gabarit)) {
        revisionLivrable = (await deps.revisionLivrable(run.companyId, etape.issueId!)) ?? undefined;
        if (!revisionLivrable) return refus("livrable_absent", "Aucun document livrable sur la tâche : la porte n'aurait rien à relire.", "Écrire d'abord le livrable dans le document de la tâche, puis redéposer.");
      }
      const r = await deps.executeur.recevoirResultat(run.companyId, { missionId: m.id, rang: etape.rang, tentative: etape.tentative, sortie: p.sortie, cleEvenement: run.runId, ...(revisionLivrable ? { revisionLivrable } : {}) });
      if (r.statut === "refuse") return refus("sortie_hors_contrat", `Livrable hors contrat : ${r.erreurs.join(" ")}`, "Corriger la sortie selon le contrat de l'étape, puis redéposer.");
      return succes({ depose: r.statut === "accepte", statut: r.statut });
    },

    async verdict_deposer(params: unknown, run: ToolRunContext): Promise<ToolResult> {
      const c = await controler("verdict_deposer", params, run, "revue");
      if (refuse(c)) return c;
      const { m, etape, p } = c as typeof c & { p: z.infer<typeof SCHEMAS.verdict_deposer> };
      if (m.etat !== "en_revue") return transitionRefusee(m.etat);
      const { missionId: _m, versionContrat: _v, ...corps } = p;
      const acteur = { type: "agent" as const, id: run.agentId, agentId: run.agentId, userId: null, runId: run.runId };
      const appeler = () => deps.routes["tache.verdict"]({ cle: "tache.verdict", params: { issueId: etape.issueId! }, query: {}, corps, acteur, companyId: run.companyId });
      const deposer = (accepte: boolean) => deps.executeur.deposerVerdict(run.companyId, { missionId: m.id, rang: etape.rang, tentative: etape.tentative, accepte, runId: run.runId, ...(p.justification ? { justification: p.justification } : {}) });
      try {
        await appeler();
        if (p.verdict === "BLOCKED_INFORMATION") return succes({ statut: "enregistre", etat: m.etat });
        // Changements demandés : immédiat. Sinon la porte s'évalue, et seul un PASS de la porte (toutes les revues requises) la franchit.
        if (p.verdict !== "CHANGES_REQUESTED") {
          const evaluation = await deps.evaluerPorte(run.companyId, etape.issueId!, `moteur:${run.runId}`);
          if (evaluation.decision !== "PASS") return succes({ statut: "en_attente_revues", motifs: evaluation.motifs });
        }
        const r = await deposer(p.verdict !== "CHANGES_REQUESTED");
        // Deux relecteurs passent en même temps : le verdict du second est enregistré et la porte déjà franchie, ce n'est pas un refus.
        if (r.statut === "transition_invalide" && p.verdict !== "CHANGES_REQUESTED" && r.etat === "attente_autorisation") return succes({ statut: "deja_franchie", etat: r.etat });
        return r.statut === "transition_invalide" ? transitionRefusee(r.etat) : succes({ statut: r.statut, etat: r.etat });
      } catch (e) {
        if (!(e instanceof ErreurAtelier)) throw e;
        return refus(e.code, e.message, "Relire le contexte de la tâche, corriger le verdict selon ce refus, puis redéposer.");
      }
    },

    async decision_demander(params: unknown, run: ToolRunContext): Promise<ToolResult> {
      const c = await controler("decision_demander", params, run, "etape");
      if (refuse(c)) return c;
      const { etape, p } = c as typeof c & { p: { question: string } };
      const issueId = etape.issueId!;
      // Même carte que l'envoi d'emailing : une carte identique encore en attente est réutilisée, quel que soit le run.
      const attente = (await deps.issues.listInteractions(issueId, run.companyId)).find((i) => i.kind === "request_confirmation" && i.status === "pending" && i.payload.prompt === p.question);
      if (attente) return succes({ statut: "deja_demandee", carteId: attente.id });
      const carte = await deps.issues.requestConfirmation(issueId, { continuationPolicy: "wake_assignee_on_accept", resolverPolicy: "human_only", payload: { version: 1, prompt: p.question, acceptLabel: "Valider", rejectLabel: "Refuser", supersedeOnUserComment: false, allowDeclineReason: true } }, run.companyId, { authorAgentId: run.agentId });
      return succes({ statut: "demandee", carteId: carte.id });
    },

    async sources_lister(params: unknown, run: ToolRunContext): Promise<ToolResult> {
      const c = await controler("sources_lister", params, run, "lecture");
      if (refuse(c)) return c;
      const { m } = c;
      const etape: EtapeMission | undefined = c.etape;
      if (!m.campagneId && !etape?.issueId) return succes({ sources: [] });
      const lignes = await deps.base.listerSources(run.companyId, m.campagneId ? { campagneId: m.campagneId } : { issueId: etape!.issueId! });
      return succes({ sources: lignes.slice(0, LIMITE_SOURCES).map((s) => ({ id: s.id, url: s.url, titre: s.titre, statutAcces: s.statutAcces, dateCollecte: s.dateCollecte })) });
    },
  };
}
