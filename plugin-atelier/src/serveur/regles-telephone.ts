/**
 * DROIT-1.3 (audit du 29/10/2026) : aucun numéro de téléphone belge en clair dans un livrable. Les numéros des
 * prospects vivent chiffrés dans leur fiche (route `tache.prospects.telephone`) ; la porte refuse un livrable qui en
 * recopie un. Seuls les numéros présents dans la fiche du client (les siens) restent permis.
 *
 * Formats reconnus : +32 et 0032 (avec ou sans « (0) »), national 0X… ; séparateurs espace, point, barre, tiret
 * (typographiques compris), entourés ou non d'espaces (« 04 -/ 223 45 67 »), jamais un saut de ligne ; indicatif entre
 * parenthèses « (04) » ; chiffres pleine chasse ramenés par NFKC ; caractères invisibles retirés.
 * Un numéro écrit 0123.456.789 n'est un BCE (donc pas un téléphone) que si son contrôle modulo 97 le confirme.
 */
import { ADRESSES_CONNAISSANCE_DANS_TEXTE } from "../contrats/connaissances.js";
import { retirerInvisibles } from "./contenu-externe.js";
import { bceValide } from "./regles-prospection.js";

// Espaces bornés (sans saut de ligne), puis au plus deux signes (« -/ ») chacun suivi d'espaces : bornes fixes, pas de retour arrière explosif.
const SEP = String.raw`[^\S\r\n]{0,3}(?:[./-][^\S\r\n]{0,3}){0,2}`;
const CANDIDAT = new RegExp(String.raw`(?<![\d+])(?:(?:\+|00)[^\S\r\n]{0,3}32${SEP}(?:\(0\)${SEP})?|0)[1-9](?:${SEP}\d){7,8}(?!\d)`, "gu");
const TIRETS = /[\u2010-\u2015\u2212]/gu; // tirets typographiques et signe moins, ramenés à « - »
const ZONE_ENTRE_PARENTHESES = /\((0[1-9]\d?)\)/gu; // « (04) » -> « 04 » ; le « (0) » de « +32 (0)4 » n'est pas touché
const FORMAT_BCE = /^0\d{3}\.\d{3}\.\d{3}$/u;

/** Forme nationale (0 suivi de 8 ou 9 chiffres) d'un candidat, ou null s'il n'a pas la longueur d'un numéro belge. */
function national(brut: string): string | null {
  if (FORMAT_BCE.test(brut.trim()) && bceValide(brut)) return null;
  const chiffres = brut.replace("(0)", "").replace(/\D/gu, "");
  const n = chiffres.startsWith("0032") ? `0${chiffres.slice(4)}` : chiffres.startsWith("32") ? `0${chiffres.slice(2)}` : chiffres;
  // Portable : 04xx xx xx xx (10 chiffres) ; fixe : 9 chiffres.
  return n.length === 9 || (n.length === 10 && n.startsWith("04")) ? n : null;
}

/** Numéros belges d'un texte, en forme nationale (pour comparer à ceux de la fiche du client). */
export function numerosTelephone(texte: string): string[] {
  const prepare = retirerInvisibles(texte.normalize("NFKC")).texte.replace(TIRETS, "-").replace(ZONE_ENTRE_PARENTHESES, "$1");
  return [...prepare.matchAll(CANDIDAT)].map((m) => national(m[0])).filter((n): n is string => n !== null);
}

/** Numéros en clair d'un livrable absents de la fiche du client, avec leur ligne ; jamais la valeur. */
export function telephonesEnClair(livrable: string, autorises: readonly string[]): Array<{ ligne: number }> {
  const permis = new Set(autorises);
  const trouves: Array<{ ligne: number }> = [];
  livrable.split("\n").forEach((texte, i) => {
    // Les uuid d'une adresse de citation peuvent se lire comme un numéro : l'adresse n'est pas examinée (issue #42).
    for (const n of numerosTelephone(texte.replace(ADRESSES_CONNAISSANCE_DANS_TEXTE, ""))) if (!permis.has(n)) trouves.push({ ligne: i + 1 });
  });
  return trouves;
}
