// Briques communes des outils réels réseaux sociaux et CRM.
//
// Schémas : les schémas d'entrée sont ceux des simulateurs L7 (importés de src/demo/social-crm/, jamais
// recopiés), à deux différences près, toutes deux invisibles ou explicites dans le catalogue MCP :
//   1. les dates `debut`, `fin` et `au` gardent le même format, la même description et le même schéma JSON,
//      mais ne sont plus bornées à la période du modèle de démonstration (2025 à 2027) ;
//   2. les outils de mutation reçoivent deux paramètres facultatifs : `preuve_approbation` (preuve signée par le plugin) et
//      `revocations_approbation` (liste de révocation `arv1` récente, signée par le plugin, exigée avec la preuve).

import * as z from "zod";
import type { OutilPasserelle } from "../../fournisseurs.js";
import type { DefinitionOutil } from "../../commun/social-crm/outils.js";

const MOTIF_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Date civile AAAA-MM-JJ, sans borne de période (même schéma JSON que la date du modèle). */
export const DateReelle = z
  .string()
  .regex(MOTIF_DATE, "date attendue au format AAAA-MM-JJ")
  .refine((d) => !MOTIF_DATE.test(d) || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d, "date civile inexistante");

export const PreuveApprobation = z
  .string()
  .max(4000)
  .optional()
  .describe(
    "Preuve d'approbation humaine délivrée par le plugin de l'atelier pour CETTE action exacte (diffusion approuvée). " +
      "Sans elle, l'action est seulement préparée, jamais exécutée.",
  );

export const RevocationsApprobation = z
  .string()
  .max(100_000)
  .optional()
  .describe(
    "Liste de révocation des preuves d'approbation (arv1), signée par le plugin de l'atelier et émise depuis moins de 5 minutes " +
      "(GET /preuves/revocations, champ « liste »), à lire juste avant l'appel. Exigée avec la preuve : sans elle, ou périmée, " +
      "l'action est seulement préparée, jamais exécutée.",
  );

/** Reprend un outil de démonstration : nom, schéma et annotations identiques ; dates sans borne de modèle. */
export function schemaReel(outil: Pick<DefinitionOutil, "schemaEntree">, mutation: boolean): z.ZodRawShape {
  const forme: Record<string, z.ZodType> = {};
  for (const [cle, schema] of Object.entries(outil.schemaEntree)) {
    const s = schema as z.ZodType;
    if (cle === "debut" || cle === "fin") forme[cle] = DateReelle.describe(s.description ?? "");
    else if (cle === "au") forme[cle] = DateReelle.optional().describe(s.description ?? "");
    else forme[cle] = s;
  }
  if (mutation) {
    forme["preuve_approbation"] = PreuveApprobation;
    forme["revocations_approbation"] = RevocationsApprobation;
  }
  return forme as z.ZodRawShape;
}

/** Gabarit d'un outil réel tiré de sa définition neutre (src/commun/social-crm/) : nom, schéma et annotations de l'outil, dates sans borne de modèle. */
export function gabarit(def: DefinitionOutil, description: string): Gabarit {
  const mutation = def.annotations.readOnlyHint === false;
  return {
    nom: def.nom,
    description: mutation
      ? `MUTATION (exécutée seulement avec une preuve d'approbation humaine valide ; sinon préparée, non exécutée). ${description}`
      : `LECTURE. ${description}`,
    schemaEntree: schemaReel(def, mutation),
    annotations: { ...def.annotations },
  };
}

export interface Gabarit {
  nom: string;
  description: string;
  schemaEntree: z.ZodRawShape;
  annotations: NonNullable<OutilPasserelle["annotations"]>;
}

// --- Dates ---------------------------------------------------------------------------------------

export const msDate = (date: string): number => Date.parse(`${date}T00:00:00.000Z`);
export const secondesDate = (date: string): number => Math.floor(msDate(date) / 1000);
export const lendemain = (date: string): string => new Date(msDate(date) + 86_400_000).toISOString().slice(0, 10);

export function verifierPeriode(debut: string, fin: string): void {
  if (debut > fin) throw new Error("La date de début doit précéder ou égaler la date de fin.");
}

/**
 * `au` (état du CRM à une date) : l'API réelle ne connaît que l'état présent. Une date passée est refusée
 * (aucun état n'est reconstitué ni inventé) ; aujourd'hui ou plus tard, ou absent : état présent.
 */
export function verifierAu(au: string | undefined, maintenant: number = Date.now()): void {
  if (au === undefined) return;
  const aujourdhui = new Date(maintenant).toISOString().slice(0, 10);
  if (au < aujourdhui) {
    throw new Error(`[requete_invalide] « au » = ${au} : la plateforme réelle ne donne que l'état actuel du CRM ; aucun état passé n'est reconstitué. Omettre « au ».`);
  }
}

export const objet = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const texte = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
export const nombre = (v: unknown, defaut = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : defaut;
};

/** Plafond de pages lues pour reconstituer une période (évite de vider un quota sur une erreur de paramètre). */
export const MAX_PAGES_PARCOURUES = 20;

export function tropDeResultats(plateforme: string): Error {
  return new Error(`[requete_invalide] Trop d'éléments chez ${plateforme} pour cette période (plus de ${MAX_PAGES_PARCOURUES} pages lues) : réduire la période.`);
}

/** Retire tout paramètre de jeton d'une URL de pagination renvoyée par une plateforme (Meta y met access_token). */
export function urlSansJeton(adresse: unknown): string | undefined {
  if (typeof adresse !== "string" || adresse === "") return undefined;
  try {
    const u = new URL(adresse);
    for (const p of ["access_token", "appsecret_proof", "client_secret", "api_token"]) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return undefined;
  }
}
