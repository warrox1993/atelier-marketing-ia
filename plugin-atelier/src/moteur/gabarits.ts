/**
 * Moteur de missions (#49, tâche 3) : gabarit par type de livrable. Le type fixe les revues (plus de choix libre
 * d'un agent pour un livrable public) et la porte est posée d'office. Les gabarits sont importés de
 * `organisation/gabarits/*.json` ; les revues se dérivent de `GABARIT_LIVRABLE_PUBLIC`, sans le recopier.
 */
import { z } from "zod";
import { CLE_LIVRABLE_DEFAUT, GABARIT_LIVRABLE_PUBLIC, LIMITES } from "../contrats/index.js";
import contenuReseauSocial from "../../../organisation/gabarits/contenu-reseau-social.json" with { type: "json" };
import documentInterne from "../../../organisation/gabarits/document-interne.json" with { type: "json" };
import wfCContenu from "../../../organisation/gabarits/wf-c-contenu.json" with { type: "json" };
import wf01Prospection from "../../../organisation/gabarits/wf-01-prospection.json" with { type: "json" };
import { chargerContrat } from "./contrats.js";
import { agentDuRegistre } from "./registre.js";

const ROLES_REVUE = GABARIT_LIVRABLE_PUBLIC.revuesRequises.map((r) => r.role);
const REVUE_CONFORMITE = { role: "conformite", agentId: "{{agent:conformite-publicitaire}}" };

const Etape = z.object({
  rang: z.number().int().min(1),
  role: z.string().min(1),
  competences: z.array(z.string().min(1)),
  /** Contrat de l'étape : sans contrat valide, de ce rôle, l'étape est refusée. */
  contratId: z.string().min(1),
  contratVersion: z.number().int().min(1),
  /** Étape faite en code (pas de réveil d'agent) : le rôle est le responsable, le contrat et les compétences ne sont pas contrôlés. Absent = étape d'agent. */
  nature: z.enum(["agent", "code"]).optional(),
  /** Nom de l'étape dans la chaîne (libellé stable, absent pour les gabarits à étape unique). */
  action: z.string().min(1).optional(),
}).strict().superRefine((e, ctx) => {
  const agent = agentDuRegistre(e.role);
  if (!agent) return ctx.addIssue({ code: "custom", message: `Rôle d'étape « ${e.role} » absent du registre des agents.`, path: ["role"] });
  if (e.nature === "code") return;
  try {
    if (chargerContrat(e.contratId, e.contratVersion).roleResponsable !== e.role) ctx.addIssue({ code: "custom", message: `Le contrat « ${e.contratId} » n'est pas celui du rôle « ${e.role} ».`, path: ["contratId"] });
  } catch (err) {
    ctx.addIssue({ code: "custom", message: (err as Error).message, path: ["contratId"] });
  }
  const inconnues = e.competences.filter((c) => !(agent.competences as string[]).includes(c));
  if (inconnues.length > 0) ctx.addIssue({ code: "custom", message: `Compétences que « ${e.role} » ne porte pas : ${inconnues.join(", ")}.`, path: ["competences"] });
});

export const Gabarit = z.object({
  cle: z.string().min(1),
  version: z.number().int().min(1),
  description: z.string().min(1),
  typeLivrable: z.enum(["public", "interne"]),
  etapes: z.array(Etape).min(1),
  /** Rôles de revue imposés, dans l'ordre de `GABARIT_LIVRABLE_PUBLIC` : le type les fixe, pas l'agent. */
  revues: z.array(z.enum(ROLES_REVUE as [string, ...string[]])).min(1),
  /** Ajoute la revue `conformite` quand un module de conformité est actif dans la fiche du client. */
  conformiteSiModuleActif: z.boolean(),
  porte: z.boolean(),
  approbationRequise: z.boolean(),
}).strict();
export type Gabarit = z.infer<typeof Gabarit>;

const GABARITS: Gabarit[] = [contenuReseauSocial, documentInterne, wfCContenu, wf01Prospection].map((brut) => Gabarit.parse(brut));

/** Rang de la tâche sous porte : la dernière étape qui n'est pas faite en code (les étapes en code suivent la porte sans tâche). */
export const rangPorte = (gabarit: Gabarit): number => Math.max(...gabarit.etapes.filter((e) => e.nature !== "code").map((e) => e.rang));

/** Gabarit `cle` ; sans `version`, la plus récente. */
export function chargerGabarit(cle: string, version?: number): Gabarit {
  const versions = GABARITS.filter((g) => g.cle === cle);
  if (versions.length === 0) throw new Error(`Gabarit « ${cle} » inconnu.`);
  const g = version === undefined ? versions.reduce((a, b) => (b.version > a.version ? b : a)) : versions.find((v) => v.version === version);
  if (!g) throw new Error(`Gabarit « ${cle} » : version ${version} inconnue.`);
  return g;
}

/** Revues du type, avec leur agent (références `{{agent:...}}` non résolues). */
export function revuesImposees(gabarit: Gabarit, options: { conformite?: boolean } = {}): Array<{ role: string; agentId: string }> {
  const revues = GABARIT_LIVRABLE_PUBLIC.revuesRequises.filter((r) => gabarit.revues.includes(r.role));
  return gabarit.conformiteSiModuleActif && options.conformite ? [...revues, REVUE_CONFORMITE] : revues;
}

export interface DepsPorteMission {
  /** `base.creerPorte` : faux si la tâche a déjà une porte. */
  creerPorte(p: { issueId: string; companyId: string; campagneId: string; cleLivrable: string; exigencesCiblees: string[]; revuesRequises: unknown; maxCycles: number }): Promise<boolean>;
  /** `ctx.issues.update` : pose la politique d'exécution native de la tâche. */
  majPolitique(issueId: string, companyId: string, politique: unknown): Promise<unknown>;
  /** Résout `{{agent:<slug>}}` et `{{humain:responsable}}` dans l'entreprise. */
  resoudre<T>(valeur: T): T;
  conformiteImposee(companyId: string): Promise<boolean>;
}

/** Refus définitif de la pose de porte (porte sans campagne, agent ou humain introuvable ou ambigu, tâche absente) : la mission part en blocage. Toute autre erreur est passagère. */
export class PorteRefusee extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PorteRefusee";
  }
}

/**
 * Pose d'office la porte d'une mission (sans `RequeteRoute`) : politique native puis porte, comme
 * `tache.mettre-sous-porte`. Une porte exige une campagne : sans elle, la mission est refusée, jamais de campagne inventée.
 */
export async function poserPorteMission(
  deps: DepsPorteMission,
  p: { companyId: string; issueId: string; campagneId: string | null; gabarit: Gabarit; exigencesCiblees: string[]; maxCycles?: number },
): Promise<{ posee: boolean }> {
  if (!p.gabarit.porte) return { posee: false };
  if (!p.campagneId) throw new PorteRefusee(`Mission refusée : le gabarit « ${p.gabarit.cle} » pose une porte, qui exige une campagne.`);
  const revuesRequises = deps.resoudre(revuesImposees(p.gabarit, { conformite: await deps.conformiteImposee(p.companyId) }));
  const stages = GABARIT_LIVRABLE_PUBLIC.executionPolicy.stages.filter((s) => p.gabarit.approbationRequise || s.type !== "approval");
  await deps.majPolitique(p.issueId, p.companyId, deps.resoudre({ ...GABARIT_LIVRABLE_PUBLIC.executionPolicy, stages }));
  const posee = await deps.creerPorte({
    issueId: p.issueId, companyId: p.companyId, campagneId: p.campagneId, cleLivrable: CLE_LIVRABLE_DEFAUT,
    exigencesCiblees: p.exigencesCiblees, revuesRequises, maxCycles: p.maxCycles ?? LIMITES.maxCyclesCorrectionParDefaut,
  });
  return { posee };
}
