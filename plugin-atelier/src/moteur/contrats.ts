/**
 * Moteur de missions (#49, tâche 4) : contrat de tâche validé par schéma, importé de `organisation/contrats/*.json`.
 * Entrées, sorties et critères viennent du registre des agents (`registre.ts`) : le contrat ne les recopie pas,
 * il désigne les entrées par leur rang et donne un contrôleur par critère, dans l'ordre du registre.
 */
import { z } from "zod";
import wfC from "../../../organisation/contrats/wf-c-contenu.json" with { type: "json" };
import wfCParametre from "../../../organisation/contrats/wf-c-contenu-parametre.json" with { type: "json" };
import wf01 from "../../../organisation/contrats/wf-01-prospection.json" with { type: "json" };
import documentInterne from "../../../organisation/contrats/document-interne.json" with { type: "json" };
import { agentDuRegistre } from "./registre.js";

const TYPES_CHAMP = {
  chaine: (v: unknown) => typeof v === "string" && v.trim() !== "",
  nombre: (v: unknown) => typeof v === "number" && Number.isFinite(v),
  booleen: (v: unknown) => typeof v === "boolean",
  liste_chaines: (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string" && x.trim() !== ""),
} as const;
const LIBELLE_TYPE = { chaine: "une chaîne non vide", nombre: "un nombre", booleen: "un booléen", liste_chaines: "une liste de chaînes non vides" } as const;

const ContratBrut = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1),
  tache: z.string().min(1),
  roleResponsable: z.string().min(1),
  entreesRequises: z.array(z.object({ cle: z.string().min(1), indexRegistre: z.number().int().min(0) }).strict()).min(1),
  sortie: z.object({ champs: z.record(z.string().min(1), z.enum(["chaine", "nombre", "booleen", "liste_chaines"])).refine((c) => Object.keys(c).length > 0, "Au moins un champ de sortie.") }).strict(),
  /** Un contrôleur par critère du registre, dans le même ordre. */
  controleurs: z.array(z.enum(["code", "relecteur", "jb"])).min(1),
  competences: z.array(z.string().min(1)),
  plafondTours: z.number().int().min(1),
  plafondJetons: z.number().int().min(1),
  effetExterne: z.enum(["aucun", "depot_plugin", "publication"]),
  conduiteEchec: z.enum(["blocage", "echec"]),
  mesureReussite: z.string().min(1),
  maturite: z.enum(["M0", "M1", "M2", "M3", "M4", "M5"]),
}).strict().superRefine((c, ctx) => {
  const agent = agentDuRegistre(c.roleResponsable);
  if (!agent) return ctx.addIssue({ code: "custom", message: `Rôle « ${c.roleResponsable} » absent du registre des agents.`, path: ["roleResponsable"] });
  if (c.controleurs.length !== agent.criteresReussite.length) ctx.addIssue({ code: "custom", message: `${agent.criteresReussite.length} critères au registre, ${c.controleurs.length} contrôleurs.`, path: ["controleurs"] });
  if (c.entreesRequises.some((e) => e.indexRegistre >= agent.entrees.length)) ctx.addIssue({ code: "custom", message: "Entrée requise hors du registre.", path: ["entreesRequises"] });
  if (c.plafondTours > agent.maxToursParExecution) ctx.addIssue({ code: "custom", message: `Plafond de tours au-dessus de celui de l'agent (${agent.maxToursParExecution}).`, path: ["plafondTours"] });
  const inconnues = c.competences.filter((x) => !(agent.competences as string[]).includes(x));
  if (inconnues.length > 0) ctx.addIssue({ code: "custom", message: `Compétences que « ${c.roleResponsable} » ne porte pas : ${inconnues.join(", ")}.`, path: ["competences"] });
});

/** Contrat complet : le brut, plus ce que le registre fournit (libellés des entrées, des sorties, critères et leur contrôleur). */
export const Contrat = ContratBrut.transform((c) => {
  const agent = agentDuRegistre(c.roleResponsable)!;
  return {
    ...c,
    entreesRequises: c.entreesRequises.map((e) => ({ cle: e.cle, libelle: agent.entrees[e.indexRegistre]! })),
    criteres: agent.criteresReussite.map((libelle, i) => ({ libelle, controleur: c.controleurs[i]! })),
    sortie: { libelles: [...agent.sorties], champs: c.sortie.champs },
  };
});
export type Contrat = z.output<typeof Contrat>;

const CONTRATS: Contrat[] = [wfC, wfCParametre, wf01, documentInterne].map((brut) => Contrat.parse(brut));

/** Contrat `id` à la `version` de la mission : une autre version est refusée (reprise d'une mission commencée sous un autre contrat). */
export function chargerContrat(id: string, version: number): Contrat {
  const versions = CONTRATS.filter((c) => c.id === id);
  if (versions.length === 0) throw new Error(`Contrat « ${id} » inconnu.`);
  const c = versions.find((v) => v.version === version);
  if (!c) throw new Error(`Contrat « ${id} » : la version ${version} n'existe pas (versions : ${versions.map((v) => v.version).join(", ")}).`);
  return c;
}

const absente = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/** Clés des entrées requises que `entrees` ne fournit pas (absentes, nulles, vides). */
export function verifierEntrees(contrat: Contrat, entrees: Record<string, unknown>): { manquantes: string[] } {
  return { manquantes: contrat.entreesRequises.map((e) => e.cle).filter((cle) => absente(entrees[cle])) };
}

/** Sortie conforme au schéma du contrat ; sinon la liste des erreurs, sans appel de modèle ni de relecteur. */
export function verifierSortie(contrat: Contrat, sortie: unknown): { ok: boolean; erreurs: string[] } {
  if (typeof sortie !== "object" || sortie === null || Array.isArray(sortie)) return { ok: false, erreurs: ["La sortie doit être un objet."] };
  const objet = sortie as Record<string, unknown>;
  const champs = contrat.sortie.champs;
  const erreurs = [
    ...Object.entries(champs).flatMap(([cle, type]) => (!(cle in objet) ? [`« ${cle} » manque.`] : TYPES_CHAMP[type](objet[cle]) ? [] : [`« ${cle} » doit être ${LIBELLE_TYPE[type]}.`])),
    ...Object.keys(objet).filter((cle) => !(cle in champs)).map((cle) => `« ${cle} » n'est pas un champ du contrat.`),
  ];
  return { ok: erreurs.length === 0, erreurs };
}
