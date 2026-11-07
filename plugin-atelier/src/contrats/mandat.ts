/**
 * Mandat : ce qu'un humain a accepté, une seule fois, sur la carte de confirmation d'une tâche du Coordinateur.
 * Document natif `mandat` de la tâche (JSON), écrit par l'agent AVANT la carte :
 * `PUT /api/issues/<issueId>/documents/mandat` avec `{ "title": "Mandat", "format": "markdown", "body": "<JSON ci-dessous>" }`.
 * La carte `request_confirmation` le vise par `payload.target = { type: "issue_document", key: "mandat", revisionId: <révision courante> }`.
 * Il ne vaut que si une carte acceptée par un humain vise la révision COURANTE : réécrire le mandat annule l'accord.
 * Les publications, envois, dépenses et exports gardent leur approbation propre : le mandat ne les remplace pas.
 */
import { z } from "zod";

export const CLE_DOCUMENT_MANDAT = "mandat" as const;

export const Mandat = z.object({
  objectifs: z.array(z.string().min(1).max(500)).max(20).default([]),
  /** Cible, établissements et zones couverts. */
  perimetre: z.array(z.string().min(1).max(2000)).max(100).default([]),
  canaux: z.array(z.string().min(1).max(100)).max(20).default([]),
  /** Budget maximal en centimes ; `null` : aucune dépense dans le mandat. */
  budgetMaxCents: z.number().int().nonnegative().nullable().default(null),
}).strict();
export type Mandat = z.infer<typeof Mandat>;

/** Lit le corps JSON du document ; `null` si illisible ou hors contrat. */
export function lireMandat(corps: unknown): Mandat | null {
  try {
    const p = Mandat.safeParse(JSON.parse(String(corps ?? "")));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

const norm = (s: string) => s.normalize("NFC").trim().toLowerCase();

export interface DemandeCampagne {
  objectifs: string[]; cible: string | null; canaux: string[]; etablissements: string[]; zones: string[];
  budgetMaxCents: number | null;
}

/** Ce que la demande contient hors du mandat (liste vide : dans le mandat). */
export function horsMandat(m: Mandat, d: DemandeCampagne): string[] {
  const hors: string[] = [];
  const dans = (permis: string[], valeurs: string[], nom: string) => {
    const ok = new Set(permis.map(norm));
    for (const v of valeurs) if (!ok.has(norm(v))) hors.push(`${nom} « ${v} »`);
  };
  dans(m.canaux, d.canaux, "canal");
  dans(m.objectifs, d.objectifs, "objectif");
  dans(m.perimetre, [...(d.cible ? [d.cible] : []), ...d.etablissements, ...d.zones], "cible ou périmètre");
  if (d.budgetMaxCents !== null && (m.budgetMaxCents === null || d.budgetMaxCents > m.budgetMaxCents)) hors.push(`budget ${d.budgetMaxCents} centimes`);
  return hors;
}
