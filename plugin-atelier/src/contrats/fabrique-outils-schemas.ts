/**
 * Déclarations des deux outils d'agent de la fabrique (lot 2) : schémas JSON fermés
 * (`additionalProperties: false` partout), d'après docs/conception-execution-etroite.md §5.
 * Module pur (aucune entrée-sortie) : le manifeste l'importe.
 */
import type { PluginToolDeclaration } from "@paperclipai/plugin-sdk";

export const NOM_OUTIL_FABRIQUER_DOCUMENT = "fabriquer_document" as const;
export const NOM_OUTIL_FABRIQUER_VIDEO = "fabriquer_video" as const;
export const NOM_OUTIL_ETAT_FABRICATION = "etat_fabrication" as const;

export const FORMATS_DOCUMENT = ["docx", "xlsx", "pptx", "pdf"] as const;
export const MODELES_DOCUMENT = ["sobre"] as const;
export const LANGUES_DOCUMENT = ["fr-BE", "nl-BE", "en"] as const;
export const TYPES_CELLULE = ["texte", "nombre", "date", "booleen"] as const;

export const LIMITE_TITRE = 200;
export const LIMITE_BLOCS = 2000;
export const LIMITE_COLONNES = 50;
export const LIMITE_LIGNES = 2000;
export const LIMITE_FEUILLES = 20;
export const LIMITE_TEXTE = 20000;
export const LIMITE_ELEMENTS_LISTE = 500;
export const LIMITE_PLAGES = 500;

export const FORMATS_SORTIE_VIDEO = ["1080x1920", "1920x1080", "1080x1080"] as const;
export const GABARITS_VIDEO = ["titre_plein_ecran", "chiffre_cle", "liste_3_points"] as const;
export const MOTIF_IDENTIFIANT_VIDEO = "^[a-z0-9-]{1,64}$";
export const LIMITE_SCENES = 30;
export const LIMITE_TEXTE_VOIX = 1500;
export const LIMITE_TITRE_VISUEL = 120;
export const LIMITE_SOUS_TITRE_VISUEL = 200;
export const LIMITE_CHIFFRE_VISUEL = 20;
export const LIMITE_POINT_VISUEL = 120;
export const DUREE_MAX_SCENE_MIN = 1;
export const DUREE_MAX_SCENE_MAX = 60;

const UUID_MOTIF = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

const texte = { type: "string", maxLength: LIMITE_TEXTE } as const;
const plages = {
  type: "array",
  maxItems: LIMITE_PLAGES,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["debut", "fin"],
    properties: { debut: { type: "integer", minimum: 0 }, fin: { type: "integer", minimum: 0 } },
  },
} as const;

const blocSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "niveau", "texte"],
      properties: { type: { const: "titre" }, niveau: { type: "integer", minimum: 1, maximum: 3 }, texte },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "texte"],
      properties: { type: { const: "paragraphe" }, texte, gras: plages, italique: plages },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "elements"],
      properties: {
        type: { const: "liste" },
        ordonnee: { type: "boolean" },
        elements: { type: "array", maxItems: LIMITE_ELEMENTS_LISTE, items: texte },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "lignes"],
      properties: {
        type: { const: "tableau" },
        entetes: { type: "array", maxItems: LIMITE_COLONNES, items: texte },
        lignes: {
          type: "array",
          maxItems: LIMITE_LIGNES,
          items: { type: "array", maxItems: LIMITE_COLONNES, items: texte },
        },
      },
    },
    { type: "object", additionalProperties: false, required: ["type"], properties: { type: { const: "saut_de_page" } } },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "livrable"],
      properties: { type: { const: "image" }, livrable: { type: "string", pattern: UUID_MOTIF }, legende: texte },
    },
  ],
} as const;

const celluleSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "valeur"],
  properties: {
    type: { enum: [...TYPES_CELLULE] },
    valeur: { type: ["string", "number", "boolean"] },
  },
} as const;

const feuilleSchema = {
  type: "object",
  additionalProperties: false,
  required: ["nom", "lignes"],
  properties: {
    nom: { type: "string", minLength: 1, maxLength: 31 },
    lignes: {
      type: "array",
      maxItems: LIMITE_LIGNES,
      items: { type: "array", maxItems: LIMITE_COLONNES, items: celluleSchema },
    },
  },
} as const;

export const DECLARATION_FABRIQUER_DOCUMENT: PluginToolDeclaration = {
  name: NOM_OUTIL_FABRIQUER_DOCUMENT,
  displayName: "Fabriquer un document",
  description:
    "Dépose une demande de fabrication de document (docx, xlsx, pptx ou pdf) dans la file de la fabrique. Réponse immédiate : un identifiant de travail (UUID) et l'état « en_file ». Suivre l'avancement avec etat_fabrication. Contenu structuré seulement : ni chemin, ni URL, ni lien, ni HTML ; aucune formule dans les feuilles.",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["format", "modele", "titre", "langue"],
    properties: {
      format: { enum: [...FORMATS_DOCUMENT] },
      modele: { enum: [...MODELES_DOCUMENT] },
      titre: { type: "string", minLength: 1, maxLength: LIMITE_TITRE },
      langue: { enum: [...LANGUES_DOCUMENT] },
      blocs: { type: "array", maxItems: LIMITE_BLOCS, items: blocSchema },
      feuilles: { type: "array", maxItems: LIMITE_FEUILLES, items: feuilleSchema },
    },
  },
} as unknown as PluginToolDeclaration;

export const DECLARATION_ETAT_FABRICATION: PluginToolDeclaration = {
  name: NOM_OUTIL_ETAT_FABRICATION,
  displayName: "État d'une fabrication",
  description:
    "Donne l'état (et le résultat, une fois terminé) d'un travail déposé avec fabriquer_document ou fabriquer_video. Seuls les travaux de votre entreprise sont visibles.",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["travail"],
    properties: { travail: { type: "string", pattern: UUID_MOTIF } },
  },
} as unknown as PluginToolDeclaration;

const identifiantVideo = { type: "string", pattern: MOTIF_IDENTIFIANT_VIDEO } as const;

const sceneSchema = {
  type: "object",
  additionalProperties: false,
  required: ["texte_voix", "voix", "visuel"],
  properties: {
    texte_voix: { type: "string", minLength: 1, maxLength: LIMITE_TEXTE_VOIX },
    voix: identifiantVideo,
    visuel: {
      type: "object",
      additionalProperties: false,
      required: ["gabarit", "champs"],
      properties: {
        gabarit: { enum: [...GABARITS_VIDEO] },
        champs: {
          type: "object",
          additionalProperties: false,
          properties: {
            titre: { type: "string", maxLength: LIMITE_TITRE_VISUEL },
            sous_titre: { type: "string", maxLength: LIMITE_SOUS_TITRE_VISUEL },
            chiffre: { type: "string", maxLength: LIMITE_CHIFFRE_VISUEL },
            points: { type: "array", minItems: 3, maxItems: 3, items: { type: "string", maxLength: LIMITE_POINT_VISUEL } },
          },
        },
      },
    },
    duree_max: { type: "number", minimum: DUREE_MAX_SCENE_MIN, maximum: DUREE_MAX_SCENE_MAX },
  },
} as const;

export const DECLARATION_FABRIQUER_VIDEO: PluginToolDeclaration = {
  name: NOM_OUTIL_FABRIQUER_VIDEO,
  displayName: "Fabriquer une vidéo",
  description:
    "Dépose une demande de fabrication de vidéo (scènes avec voix off et visuel à gabarit) dans la file de la fabrique. Réponse immédiate : un identifiant de travail (UUID) et l'état « en_file ». La fabrication est asynchrone : suivre l'avancement avec etat_fabrication (l'état « en_attente_gpu » indique que la vidéo attend la carte graphique, avec sa raison ; ce n'est pas un échec). Seules les voix du registre de la fabrique sont permises (identifiant en minuscules, chiffres et tirets) ; aucun échantillon audio, visage, chemin, URL ni HTML. La mention « contenu généré par IA » et le filigrane sont posés d'office sur toute vidéo : inutile de les demander ou de les écrire dans les scènes. Une vidéo contient de 1 à 30 scènes. Plafond : 10 vidéos par jour et par entreprise.",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["format_sortie", "sous_titres", "scenes"],
    properties: {
      format_sortie: { enum: [...FORMATS_SORTIE_VIDEO] },
      musique: identifiantVideo,
      sous_titres: { type: "boolean" },
      scenes: { type: "array", minItems: 1, maxItems: LIMITE_SCENES, items: sceneSchema },
    },
  },
} as unknown as PluginToolDeclaration;
