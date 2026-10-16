/**
 * Explication courte de la confiance d'un lead, bâtie uniquement sur les données déjà renvoyées :
 * « 54 % : 6 critères vérifiés sur 18, 1 contraire ; manque surtout : registre BCE réel ».
 * La source citée est celle qui, d'après `criteresManquants`, pourrait établir le plus de critères encore non vérifiés.
 */
import type { Prospect } from "../../contrats/index.js";
import { criteresManquants } from "../../serveur/qualification-prospects.js";

/** Nom lisible des sources de la passerelle (service · outil). */
const LIBELLES_SOURCES: Readonly<Record<string, string>> = {
  "bce · bce_entreprise": "registre BCE réel",
  "bce · bce_changements": "changements du registre BCE",
  "bnb · bnb_comptes": "comptes annuels BNB",
  "osm · osm_commerces": "carte OpenStreetMap",
  "fsma · fsma_rechercher": "registre FSMA",
  "b2c · b2c_demandes_devis": "demande de devis",
};

/** Source qui débloquerait le plus de critères non vérifiés (égalité : la première rencontrée) ; null si aucune n'est connue. */
export function sourceQuiDebloqueLePlus(p: Prospect): string | null {
  if (!p.confiance) return null;
  const compte = new Map<string, number>();
  for (const m of criteresManquants(p, p.confiance).manquants) {
    for (const v of m.verifiePar) {
      const cle = `${v.service} · ${v.outil}`;
      compte.set(cle, (compte.get(cle) ?? 0) + 1);
    }
  }
  let meilleure: string | null = null;
  let max = 0;
  for (const [cle, n] of compte) {
    if (n > max) {
      max = n;
      meilleure = cle;
    }
  }
  return meilleure === null ? null : (LIBELLES_SOURCES[meilleure] ?? meilleure);
}

/** Phrase d'explication, ou null si la confiance n'est pas calculée. */
export function expliquerConfiance(p: Prospect): string | null {
  const c = p.confiance;
  if (!c) return null;
  const verifies = c.criteres.filter((x) => x.statut === "verifie").length;
  const contraires = c.criteres.filter((x) => x.statut === "contraire").length;
  let texte = `${c.valeur} % : ${verifies} critère${verifies > 1 ? "s" : ""} vérifié${verifies > 1 ? "s" : ""} sur ${c.criteres.length}`;
  if (contraires > 0) texte += `, ${contraires} contraire${contraires > 1 ? "s" : ""}`;
  const manque = sourceQuiDebloqueLePlus(p);
  if (manque !== null) texte += ` ; manque surtout : ${manque}`;
  return texte;
}
