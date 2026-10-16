/**
 * Référentiel du client (contrats v1.7) : ce que CHAQUE client de l'usine saisit pour son marketing.
 *
 * L'usine sert plusieurs clients de secteurs différents : offres, cibles, entités, segments
 * (professions, secteurs, types de particuliers), points de vente et zones sont des PARAMÈTRES, jamais
 * des listes codées en dur. Les prospects, campagnes, exports et scores s'y réfèrent par des CODES
 * stables (`CodeReferentiel`), avec la version du référentiel utilisée.
 *
 * Le référentiel ÉTEND la marque existante (rubrique « Marque et sources », `Marque` de `ui.ts`, table
 * `marques`) au lieu de la dupliquer : même version, mêmes offres et établissements (champs ajoutés,
 * facultatifs pour les versions déjà enregistrées), plus des listes nouvelles (entités, segments,
 * cibles de prospection, modules de conformité) gardées dans des colonnes ajoutées par la migration 007.
 *
 * Les règles d'un secteur réglementé (pour l'instant : intermédiaire d'assurance) sont des MODULES DE CONFORMITÉ que le client
 * active ; aucun n'est actif par défaut.
 */
import { z } from "zod";
import { Horodatage } from "./communs.js";
import { Marque, PositionEtablissement } from "./marque.js";

/** Code stable d'un élément du référentiel (minuscules, chiffres, tirets), garde son sens d'une version à l'autre. */
export const CodeReferentiel = z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/u, "Code attendu : minuscules, chiffres et tirets (ex. offre-toiture)");
export type CodeReferentiel = z.infer<typeof CodeReferentiel>;

/** Statut d'une affirmation du client : validée par lui, ou non confirmée (jamais présentée comme acquise). */
export const StatutValidation = z.enum(["validee", "non_confirmee"]);
export type StatutValidation = z.infer<typeof StatutValidation>;

/* ------------------------------------------------------------------ */
/* Entités                                                             */
/* ------------------------------------------------------------------ */

/** Identifiant réglementaire d'une entité (champ libre typé). */
export const IdentifiantReglementaire = z
  .object({
    type: z.enum(["bce", "fsma", "tva", "autre"]),
    /** Libellé lisible pour `autre` (ex. « agrément régional ») ; facultatif sinon. */
    libelle: z.string().max(120).nullable().default(null),
    valeur: z.string().min(2).max(60),
  })
  .strict()
  .refine((i) => i.type !== "autre" || (i.libelle !== null && i.libelle.length > 0), { message: "Un identifiant « autre » porte son libellé", path: ["libelle"] });
export type IdentifiantReglementaire = z.infer<typeof IdentifiantReglementaire>;

/** Entité juridique ou marque du client (une seule pour la plupart des clients). */
export const EntiteReferentiel = z
  .object({
    code: CodeReferentiel,
    nom: z.string().min(1).max(200),
    type: z.enum(["entite_juridique", "marque"]),
    /** Entité juridique qui porte la marque ; null pour une entité juridique. */
    porteePar: CodeReferentiel.nullable(),
    identifiants: z.array(IdentifiantReglementaire).max(10),
    /** Mentions légales reprises dans les contenus et les exports au nom de cette entité. */
    mentionsLegales: z.string().max(4000),
  })
  .strict()
  .refine((e) => (e.type === "marque") === (e.porteePar !== null), {
    message: "Une marque désigne l'entité juridique qui la porte, et seulement elle",
    path: ["porteePar"],
  });
export type EntiteReferentiel = z.infer<typeof EntiteReferentiel>;

/* ------------------------------------------------------------------ */
/* Segments et offres                                                  */
/* ------------------------------------------------------------------ */

/**
 * Segment visé, défini par le client : une profession (« médecins », « artisans couvreurs »), un
 * secteur (codes NACE), ou un type de particulier (« propriétaires », « jeunes conducteurs »).
 */
export const SegmentReferentiel = z
  .object({
    code: CodeReferentiel,
    libelle: z.string().min(1).max(200),
    type: z.enum(["profession", "secteur", "type_particulier"]),
    /** Codes NACE-BEL du segment (2 à 5 chiffres, point facultatif) ; vide pour un type de particulier. */
    nace: z.array(z.string().regex(/^\d{2}(?:\.?\d{1,3})?$/u)).max(50).default([]),
  })
  .strict()
  .refine((s) => s.type !== "type_particulier" || s.nace.length === 0, { message: "Un type de particulier n'a pas de code NACE", path: ["nace"] });
export type SegmentReferentiel = z.infer<typeof SegmentReferentiel>;

export const CibleOffre = z.enum(["b2c", "b2b", "les_deux"]);
export type CibleOffre = z.infer<typeof CibleOffre>;

/**
 * Offre : SUR-ENSEMBLE compatible de l'offre de la marque (`nom`, `description`, `confirmee`). Les
 * champs ajoutés sont facultatifs pour relire les versions déjà enregistrées ; `statut` reprend
 * `confirmee` (validée ou non confirmée).
 */
export const OffreReferentiel = z
  .object({
    nom: z.string(),
    description: z.string(),
    confirmee: z.boolean(),
    code: CodeReferentiel.optional(),
    cible: CibleOffre.optional(),
    /** Segments visés (codes de `segments`). */
    segments: z.array(CodeReferentiel).max(50).optional(),
    /** Besoins couverts, dans les mots du client. */
    besoinsCouverts: z.array(z.string().min(1).max(200)).max(30).optional(),
    /** Arguments validés par le client (seuls utilisables tels quels dans un contenu). */
    argumentsValides: z.array(z.string().min(1).max(500)).max(30).optional(),
    conditions: z.string().max(4000).nullable().optional(),
    /** Entité qui porte l'offre (code de `entites`). */
    entite: CodeReferentiel.nullable().optional(),
    /** Fournisseur ou partenaire qui porte le produit (assureur, fabricant, prêteur), si le client le précise. */
    fournisseur: z.string().max(200).nullable().optional(),
  })
  .strict();
export type OffreReferentiel = z.infer<typeof OffreReferentiel>;

/** Statut lisible d'une offre (dérivé de `confirmee`). */
export function statutOffre(o: Pick<OffreReferentiel, "confirmee">): StatutValidation {
  return o.confirmee ? "validee" : "non_confirmee";
}

/**
 * Établissement, bureau ou point de vente : SUR-ENSEMBLE compatible de l'établissement de la marque
 * (`nom`, `adresse`, `confirme`), avec sa zone (communes et codes postaux couverts).
 */
export const EtablissementReferentiel = z
  .object({
    nom: z.string(),
    adresse: z.string().nullable(),
    confirme: z.boolean(),
    /** Position saisie par un humain ; absente = inconnue (jamais déduite des prospects). */
    position: PositionEtablissement.nullable().optional(),
    code: CodeReferentiel.optional(),
    communes: z.array(z.string().min(1).max(120)).max(200).optional(),
    codesPostaux: z.array(z.string().regex(/^\d{4}$/u)).max(500).optional(),
    entites: z.array(CodeReferentiel).max(20).optional(),
  })
  .strict();
export type EtablissementReferentiel = z.infer<typeof EtablissementReferentiel>;

/** Cible de prospection : ce que le client veut viser (secteurs, professions, zones, tailles). */
export const CibleProspection = z
  .object({
    code: CodeReferentiel,
    libelle: z.string().min(1).max(200),
    cible: CibleOffre,
    segments: z.array(CodeReferentiel).max(50),
    /** Zones : codes d'établissement, communes, codes postaux, provinces ou régions. */
    zones: z
      .object({
        etablissements: z.array(CodeReferentiel).max(50).default([]),
        communes: z.array(z.string().min(1).max(120)).max(200).default([]),
        codesPostaux: z.array(z.string().regex(/^\d{4}$/u)).max(500).default([]),
        provinces: z.array(z.string().min(1).max(80)).max(20).default([]),
        regions: z.array(z.enum(["Wallonie", "Bruxelles-Capitale", "Flandre"])).max(3).default([]),
      })
      .strict(),
    /** Tailles d'entreprise (effectif BNB) ; vide pour une cible B2C. */
    tailles: z.array(z.enum(["micro", "petite", "moyenne", "grande", "inconnue"])).max(5).default([]),
    offres: z.array(CodeReferentiel).max(50).default([]),
    entite: CodeReferentiel.nullable().default(null),
  })
  .strict()
  .refine((c) => c.cible !== "b2c" || c.tailles.length === 0, { message: "Une cible B2C n'a pas de taille d'entreprise", path: ["tailles"] });
export type CibleProspection = z.infer<typeof CibleProspection>;

/* ------------------------------------------------------------------ */
/* Modules de conformité activables                                    */
/* ------------------------------------------------------------------ */

/**
 * Modules de conformité d'un secteur réglementé, activés par la configuration du client, jamais par
 * défaut. Chaque module décrit des exigences que la porte, les règles de prospection et les consignes
 * des agents appliqueront (lots P5, P9, R7). Textes à faire confirmer par le juriste du client.
 */
export const CodeModuleConformite = z.enum(["intermediaire_assurance"]);
export type CodeModuleConformite = z.infer<typeof CodeModuleConformite>;

export const CATALOGUE_MODULES_CONFORMITE: Readonly<Record<CodeModuleConformite, { libelle: string; exigences: readonly string[]; references: readonly string[] }>> = {
  intermediaire_assurance: {
    libelle: "Intermédiaire d'assurance",
    exigences: [
      "Mentions de l'entité (dénomination, numéro FSMA) dans chaque contenu marketing et chaque export au nom de l'entité.",
      "Aucun conseil personnalisé ni comparaison de garanties pour une personne donnée dans un contenu marketing ; l'usine fournit des données et des contenus, l'intermédiaire conseille.",
      "Publicité : avantages jamais mis en avant sans les risques et conditions, dans une police au moins aussi lisible.",
    ],
    references: ["Directive (UE) 2016/97, art. 2 et 17 à 20", "Loi du 4 avril 2014 relative aux assurances", "Arrêté royal du 25 avril 2014 (publicité)"],
  },
};

export const ModuleConformiteActive = z
  .object({
    code: CodeModuleConformite,
    /** Entités concernées (codes) ; vide = toutes les entités. */
    entites: z.array(CodeReferentiel).max(20).default([]),
    /** Mots ou formules supplémentaires interdits dans les contenus, propres au client. */
    motsInterdits: z.array(z.string().min(2).max(120)).max(100).default([]),
    activeLe: Horodatage,
    activePar: z.string().min(1),
  })
  .strict();
export type ModuleConformiteActive = z.infer<typeof ModuleConformiteActive>;

/* ------------------------------------------------------------------ */
/* Référentiel = marque étendue                                        */
/* ------------------------------------------------------------------ */

function codesUniques(l: ReadonlyArray<{ code?: string | undefined }>): boolean {
  const codes = l.map((x) => x.code).filter((c): c is string => c !== undefined);
  return new Set(codes).size === codes.length;
}

const ajoutsReferentiel = {
  offres: z.array(OffreReferentiel),
  etablissements: z.array(EtablissementReferentiel),
  entites: z.array(EntiteReferentiel).max(20).default([]),
  segments: z.array(SegmentReferentiel).max(200).default([]),
  ciblesProspection: z.array(CibleProspection).max(50).default([]),
  modulesConformite: z.array(ModuleConformiteActive).max(10).default([]),
};

type Brut = {
  offres: OffreReferentiel[];
  etablissements: EtablissementReferentiel[];
  entites: EntiteReferentiel[];
  segments: SegmentReferentiel[];
  ciblesProspection: CibleProspection[];
  modulesConformite: ModuleConformiteActive[];
};

/** Cohérence des références internes : chaque code cité existe dans sa liste. */
function verifierReferences(r: Brut, ctx: z.RefinementCtx): void {
  const entites = new Set(r.entites.map((e) => e.code));
  const segments = new Set(r.segments.map((s) => s.code));
  const offres = new Set(r.offres.map((o) => o.code).filter(Boolean));
  const etabs = new Set(r.etablissements.map((e) => e.code).filter(Boolean));
  const manque = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  for (const [nom, liste] of [["offres", r.offres], ["etablissements", r.etablissements], ["entites", r.entites], ["segments", r.segments], ["ciblesProspection", r.ciblesProspection]] as const) {
    if (!codesUniques(liste)) manque([nom], "Code en double");
  }
  r.entites.forEach((e, i) => {
    if (e.porteePar !== null && !entites.has(e.porteePar)) manque(["entites", i, "porteePar"], `Entité inconnue : ${e.porteePar}`);
  });
  r.offres.forEach((o, i) => {
    if (o.entite && !entites.has(o.entite)) manque(["offres", i, "entite"], `Entité inconnue : ${o.entite}`);
    (o.segments ?? []).forEach((s) => segments.has(s) || manque(["offres", i, "segments"], `Segment inconnu : ${s}`));
  });
  r.etablissements.forEach((e, i) => (e.entites ?? []).forEach((c) => entites.has(c) || manque(["etablissements", i, "entites"], `Entité inconnue : ${c}`)));
  r.ciblesProspection.forEach((c, i) => {
    c.segments.forEach((s) => segments.has(s) || manque(["ciblesProspection", i, "segments"], `Segment inconnu : ${s}`));
    c.offres.forEach((o) => offres.has(o) || manque(["ciblesProspection", i, "offres"], `Offre inconnue : ${o}`));
    c.zones.etablissements.forEach((e) => etabs.has(e) || manque(["ciblesProspection", i, "zones"], `Établissement inconnu : ${e}`));
    if (c.entite !== null && !entites.has(c.entite)) manque(["ciblesProspection", i, "entite"], `Entité inconnue : ${c.entite}`);
  });
  r.modulesConformite.forEach((m, i) => m.entites.forEach((c) => entites.has(c) || manque(["modulesConformite", i, "entites"], `Entité inconnue : ${c}`)));
  if (new Set(r.modulesConformite.map((m) => m.code)).size !== r.modulesConformite.length) manque(["modulesConformite"], "Module activé deux fois");
}

/**
 * Référentiel du client = version de la marque étendue. Une version ancienne (sans les listes
 * ajoutées) se relit telle quelle : listes vides, aucun module actif.
 */
export const ReferentielClient = Marque.extend(ajoutsReferentiel).superRefine(verifierReferences);
export type ReferentielClient = z.infer<typeof ReferentielClient>;

/** Saisie humaine d'une nouvelle version du référentiel (même forme que `MarqueSaisie`, étendue). */
export const ReferentielSaisie = Marque.omit({ id: true, companyId: true, version: true, creeLe: true }).extend(ajoutsReferentiel).superRefine(verifierReferences);
export type ReferentielSaisie = z.infer<typeof ReferentielSaisie>;

/**
 * Renvoi d'un objet (prospect, campagne, export, score) vers le référentiel : version de la marque
 * utilisée et codes retenus. Aucun de ces codes n'est une liste fixe de l'usine.
 */
export const RenvoiReferentiel = z
  .object({
    version: z.number().int().positive(),
    entite: CodeReferentiel.nullable().default(null),
    offres: z.array(CodeReferentiel).max(50).default([]),
    segments: z.array(CodeReferentiel).max(50).default([]),
    etablissement: CodeReferentiel.nullable().default(null),
    cibleProspection: CodeReferentiel.nullable().default(null),
  })
  .strict();
export type RenvoiReferentiel = z.infer<typeof RenvoiReferentiel>;

/** Vérifie qu'un renvoi ne cite que des codes présents dans le référentiel de même version. */
export function renvoiValide(r: RenvoiReferentiel, ref: Pick<ReferentielClient, "version" | "entites" | "offres" | "segments" | "etablissements" | "ciblesProspection">): string[] {
  const erreurs: string[] = [];
  if (r.version !== ref.version) erreurs.push(`Version du référentiel ${r.version} au lieu de ${ref.version}`);
  if (r.entite !== null && !ref.entites.some((e) => e.code === r.entite)) erreurs.push(`Entité inconnue : ${r.entite}`);
  for (const o of r.offres) if (!ref.offres.some((x) => x.code === o)) erreurs.push(`Offre inconnue : ${o}`);
  for (const s of r.segments) if (!ref.segments.some((x) => x.code === s)) erreurs.push(`Segment inconnu : ${s}`);
  if (r.etablissement !== null && !ref.etablissements.some((x) => x.code === r.etablissement)) erreurs.push(`Établissement inconnu : ${r.etablissement}`);
  if (r.cibleProspection !== null && !ref.ciblesProspection.some((x) => x.code === r.cibleProspection)) erreurs.push(`Cible de prospection inconnue : ${r.cibleProspection}`);
  return erreurs;
}

/** Identifiant d'un module activé pour une entité donnée (vide = toutes les entités). */
export function moduleActif(ref: Pick<ReferentielClient, "modulesConformite">, code: CodeModuleConformite, entite: string | null): boolean {
  return ref.modulesConformite.some((m) => m.code === code && (m.entites.length === 0 || (entite !== null && m.entites.includes(entite))));
}

