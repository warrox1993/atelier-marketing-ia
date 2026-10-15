// Numéros BCE de démonstration (lot P2, docs/prospection-conception.md §7).
//
// Un numéro d'entreprise belge a 10 chiffres : 8 chiffres de base (le premier vaut 0 ou 1) puis 2 chiffres de
// contrôle égaux à 97 − (base modulo 97). Un numéro d'unité d'établissement commence par 2 et suit la même règle.
// Les numéros de démonstration ont un chiffre de contrôle VOLONTAIREMENT FAUX : ils échouent au contrôle
// modulo 97, donc ne peuvent correspondre à aucune vraie entreprise. Le simulateur refuse même de répondre pour
// un numéro dont le contrôle est valide (il pourrait être réel).

import { alea } from "../modele/alea.js";

/** Chiffres de contrôle corrects (1 à 97) pour 8 chiffres de base. */
export function controleValide(base8: string): number {
  if (!/^\d{8}$/.test(base8)) throw new Error("Base de numéro BCE : 8 chiffres attendus.");
  const reste = Number(base8) % 97;
  return 97 - reste;
}

/** Vrai si 10 chiffres respectent le contrôle modulo 97 (donc numéro potentiellement réel). */
export function controleModulo97Valide(dix: string): boolean {
  return /^\d{10}$/.test(dix) && Number(dix.slice(8)) === controleValide(dix.slice(0, 8));
}

export type TypeNumero = "entreprise" | "etablissement";

export interface NumeroAnalyse {
  type: TypeNumero;
  /** 10 chiffres, sans séparateur. */
  chiffres: string;
  /** Forme d'affichage : 0123.456.789 (entreprise) ou 2.123.456.789 (établissement). */
  formate: string;
  controleValide: boolean;
}

export function formaterNumero(chiffres: string, type: TypeNumero): string {
  return type === "entreprise"
    ? `${chiffres.slice(0, 4)}.${chiffres.slice(4, 7)}.${chiffres.slice(7)}`
    : `${chiffres[0]}.${chiffres.slice(1, 4)}.${chiffres.slice(4, 7)}.${chiffres.slice(7)}`;
}

/** Lit un numéro saisi (« BE 0123.456.789 », « 0123456789 »…). Lève une erreur en français si le format est invalide. */
export function analyserNumero(saisie: string): NumeroAnalyse {
  const nettoye = saisie.trim().replace(/^BE\s*/i, "").replace(/[\s.]/g, "");
  if (!/^\d{10}$/.test(nettoye)) {
    throw new Error(`Numéro BCE invalide (« ${saisie} ») : 10 chiffres attendus (format 0123.456.789 pour une entreprise, 2.123.456.789 pour une unité d'établissement).`);
  }
  const premier = nettoye[0]!;
  let type: TypeNumero;
  if (premier === "0" || premier === "1") type = "entreprise";
  else if (premier === "2") type = "etablissement";
  else throw new Error(`Numéro BCE invalide (« ${saisie} ») : un numéro d'entreprise commence par 0 ou 1, celui d'une unité d'établissement par 2.`);
  return { type, chiffres: nettoye, formate: formaterNumero(nettoye, type), controleValide: controleModulo97Valide(nettoye) };
}

/**
 * Numéro de démonstration tiré de la graine : base de 8 chiffres, puis chiffre de contrôle faux.
 * `essai` décale la base en cas de collision (le jeu garantit l'unicité).
 */
export function numeroDemonstration(type: TypeNumero, cle: string, essai = 0): string {
  const hasard = Math.floor(alea("prospection", "numero", type, cle, essai) * 10 ** 7);
  const entete = type === "etablissement" ? 2 : alea("prospection", "numero-tete", cle, essai) < 0.5 ? 0 : 1;
  const base = `${entete}${String(hasard).padStart(7, "0")}`;
  const valide = controleValide(base);
  // Décalage de 1 à 95 modulo 97 sur 1..97 : le résultat ne peut jamais redonner le contrôle valide.
  const decalage = 1 + Math.floor(alea("prospection", "controle-faux", type, cle, essai) * 95);
  const faux = ((valide - 1 + decalage) % 97) + 1;
  return `${base}${String(faux).padStart(2, "0")}`;
}
