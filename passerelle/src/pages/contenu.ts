// Contenu d'une page de destination : uniquement des champs TEXTE, bornés et nettoyés. Aucun HTML libre n'existe :
// ce que fournit un agent est toujours rendu échappé (gabarit.ts) ; ici on borne la taille et on retire ce qui ne
// doit jamais s'afficher (caractères de contrôle, marques de direction de texte, caractères invisibles).

import * as z from "zod";

export const TYPES_OFFRE = ["guide_gratuit", "rappel_conseiller"] as const;
export type TypeOffre = (typeof TYPES_OFFRE)[number];

export const CRENEAUX = [
  { code: "matin", libelle: "Matin (9 h à 12 h)" },
  { code: "apres_midi", libelle: "Après-midi (12 h à 17 h)" },
  { code: "soir", libelle: "Soir (17 h à 20 h)" },
  { code: "peu_importe", libelle: "Peu importe" },
] as const;
export type CodeCreneau = (typeof CRENEAUX)[number]["code"];

// Contrôles C0/C1, séparateurs de ligne et de paragraphe, marques bidirectionnelles, espaces de largeur nulle, BOM.
// Les retours à la ligne (\n) sont traités à part.
const PLAGES_INVISIBLES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x08], [0x0b, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x180e, 0x180e], [0x200b, 0x200f], [0x2028, 0x202e],
  [0x2060, 0x2064], [0x2066, 0x206f], [0xfeff, 0xfeff],
];
const INVISIBLES = new RegExp(`[${PLAGES_INVISIBLES.map(([a, b]) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`).join("")}]`, "gu");

/** Nettoie un texte : normalisation NFC, caractères invisibles retirés, espaces réduits. `lignes` = retours à la ligne permis. */
export function nettoyerTexte(brut: string, lignes = false): string {
  const nfc = brut.normalize("NFC").replace(/\r\n?/gu, "\n").replace(INVISIBLES, "");
  if (!lignes) return nfc.replace(/\s+/gu, " ").trim();
  return nfc
    .split("\n")
    .map((l) => l.replace(/[ \t]+/gu, " ").trim())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

const champ = (min: number, max: number, lignes = false) =>
  z
    .string()
    .transform((s) => nettoyerTexte(s, lignes))
    .pipe(z.string().min(min, `au moins ${min} caractères`).max(max, `${max} caractères au plus`));

const MOTIF_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Champs que fournit l'agent pour créer une page (tous des textes simples). */
export const schemaContenuPage = {
  entreprise_id: z.string().regex(MOTIF_UUID, "identifiant d'entreprise (UUID) attendu").describe("Identifiant (UUID) de l'entreprise de l'atelier où seront créés les prospects de cette page."),
  titre: champ(3, 120).describe("Titre de la page (texte simple, 120 caractères au plus)."),
  accroche: champ(10, 300).describe("Phrase d'accroche sous le titre (texte simple, 300 caractères au plus)."),
  offre_type: z.enum(TYPES_OFFRE).describe("Offre : « guide_gratuit » (la personne reçoit un guide) ou « rappel_conseiller » (un conseiller la rappelle)."),
  offre_intitule: champ(3, 120).describe("Nom de l'offre, par exemple « Guide de l'isolation en 10 questions »."),
  offre_description: champ(10, 600, true).describe("Description de l'offre (texte simple, 600 caractères au plus, sans mise en forme)."),
  responsable: champ(2, 120).describe("Nom de l'organisation responsable du traitement des données (nommée dans le consentement)."),
  contact_confidentialite: champ(5, 200).describe("Adresse e-mail ou adresse web où la personne exerce ses droits et retire son consentement (affichée en texte)."),
};
export const SchemaContenuPage = z.object(schemaContenuPage);
export type ContenuPage = z.infer<typeof SchemaContenuPage>;

/**
 * Texte EXACT de la case de consentement, construit par le serveur (jamais écrit par l'agent) pour qu'une page ne puisse
 * pas présenter un consentement trompeur. Il est figé avec la page et stocké tel quel comme preuve à chaque envoi.
 */
export function texteConsentement(c: Pick<ContenuPage, "responsable" | "contact_confidentialite" | "offre_intitule" | "offre_type">): string {
  const objet = c.offre_type === "guide_gratuit" ? `recevoir « ${c.offre_intitule} »` : `être rappelé(e) au sujet de « ${c.offre_intitule} »`;
  return (
    `J'accepte que ${c.responsable} utilise mon nom, mon numéro de téléphone et, si je l'ai indiqué, mon adresse e-mail pour ` +
    `me recontacter afin de ${objet}. Je peux retirer mon consentement à tout moment en écrivant à ${c.contact_confidentialite}.`
  );
}
