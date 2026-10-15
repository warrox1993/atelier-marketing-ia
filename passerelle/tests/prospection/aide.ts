// Aides des tests de prospection : appel direct d'un outil (schéma Zod appliqué comme le fait la passerelle)
// et export complet de tout ce que les simulateurs peuvent répondre.

import * as z from "zod";
import type { ContexteAppel, OutilPasserelle } from "../../src/fournisseurs.js";
import { outilChangements, outilEntreprise, outilRechercher } from "../../src/demo/prospection/bce.js";
import { outilComptes } from "../../src/demo/prospection/bnb.js";
import { outilIntermediaire, outilRechercherFsma } from "../../src/demo/prospection/fsma.js";
import { jeuProspection } from "../../src/demo/prospection/jeu.js";

const CONTEXTE: ContexteAppel = { service: "bce", mode: "demonstration", identite: { compte: "essai", propriete: null }, jetonPorteur: null };

export async function appeler(outil: OutilPasserelle, args: Record<string, unknown> = {}): Promise<Record<string, any>> {
  const valides = z.object(outil.schemaEntree).parse(args) as Record<string, unknown>;
  return (await outil.executer(valides, CONTEXTE)) as Record<string, any>;
}

/** Parcourt toutes les pages d'une recherche et renvoie les éléments de la clé donnée. */
export async function toutesLesPages(outil: OutilPasserelle, cle: string, args: Record<string, unknown> = {}): Promise<any[]> {
  const premiere = await appeler(outil, { ...args, page: 1 });
  const sortie: any[] = [...premiere[cle]];
  for (let page = 2; page <= premiere["pages"]; page++) sortie.push(...(await appeler(outil, { ...args, page }))[cle]);
  return sortie;
}

/** Tout ce que les six outils peuvent renvoyer, en un seul texte JSON (pour les balayages). */
export async function exportComplet(): Promise<string> {
  const jeu = jeuProspection();
  const sorties: unknown[] = [];
  sorties.push(await toutesLesPages(outilRechercher, "entreprises"));
  sorties.push(await toutesLesPages(outilChangements, "changements", { depuis: "2020-01-01" }));
  sorties.push(await toutesLesPages(outilRechercherFsma, "intermediaires"));
  const numeros = [...jeu.entreprises.map((e) => e.numero), ...jeu.radiees.map((r) => r.numero)];
  for (const n of numeros) {
    sorties.push(await appeler(outilEntreprise, { numero: n }), await appeler(outilComptes, { numero: n }));
  }
  for (const e of jeu.entreprises) for (const x of e.etablissements) sorties.push(await appeler(outilEntreprise, { numero: x.numero }));
  sorties.push(await appeler(outilIntermediaire, { nom: "Courtage" }));
  return JSON.stringify(sorties);
}
