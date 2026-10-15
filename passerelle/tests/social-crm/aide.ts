// Utilitaires des tests du lot L7 : appel direct d'un outil par le même chemin que la passerelle
// (catalogue + validation Zod + enveloppe de démonstration), sans réseau.

import { expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
import { appelerOutil, construireCatalogue } from "../../src/outils.js";
import { COMPTE_DEMONSTRATION, MENTION_DEMONSTRATION } from "../../src/services.js";
import { enregistrerSocialCrm } from "../../src/demo/social-crm/enregistrer.js";

export const registreSocialCrm = (): RegistreFournisseurs => enregistrerSocialCrm(new RegistreFournisseurs());

const registre = registreSocialCrm();

export function catalogueDe(service: string) {
  const fiche = registre.fiche(service)!;
  return construireCatalogue(fiche, "demonstration", registre.obtenir("demonstration", service));
}

/** Appel brut : renvoie le résultat MCP tel que la passerelle le produit. */
export async function appeler(service: string, outil: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
  const fiche = registre.fiche(service)!;
  return appelerOutil(catalogueDe(service), outil, args, {
    service,
    mode: "demonstration",
    identite: { compte: COMPTE_DEMONSTRATION, propriete: fiche.proprietesDemo[0] ?? null },
    jetonPorteur: null,
  });
}

/** Appel qui doit réussir : vérifie la mention, puis renvoie les données structurées (sans `_atelier`). */
export async function donnees<T = any>(service: string, outil: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await appeler(service, outil, args);
  expect(res.isError, JSON.stringify(res.structuredContent)).toBeFalsy();
  const { _atelier, ...reste } = res.structuredContent as Record<string, unknown>;
  expect(_atelier).toEqual({ mode: "demonstration", mention: MENTION_DEMONSTRATION });
  return reste as T;
}

/** Parcourt toutes les pages d'un outil paginé et renvoie les éléments concaténés. */
export async function toutesLesPages<T>(
  lire: (suite: unknown) => Promise<{ elements: T[]; suite: unknown | null }>,
): Promise<{ elements: T[]; pages: number }> {
  const elements: T[] = [];
  let suite: unknown = undefined;
  for (let pages = 1; pages < 500; pages++) {
    const page = await lire(suite);
    elements.push(...page.elements);
    if (page.suite === null) return { elements, pages };
    suite = page.suite;
  }
  throw new Error("pagination sans fin");
}

export const SEPTEMBRE = { debut: "2026-09-01", fin: "2026-09-30" } as const;
/** Période qui contient des contacts « hors zone » (Herstal), restés au stade lead. */
export const ANNEE = { debut: "2026-01-01", fin: "2026-09-30" } as const;
