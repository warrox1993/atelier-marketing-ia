/**
 * Observatoire : contrats documentaires (phase 1, lot C).
 *
 * Spécification : plan « Avenue de l'Observatoire », F.1 (statuts), F.2 (modèle de données),
 * F.3 (fiche et dossier). Modèle de données indicatif : `docs/observatoire/modele-donnees.md`.
 *
 * Principes encodés ici :
 * - une affirmation porte un statut de vérification ; « vérifié expérimentalement » exige une
 *   preuve de type essai (jamais un simple instantané de source) ;
 * - une preuve pointe vers exactement un objet : un instantané OU un essai ;
 * - un champ de fiche vaut `null` quand rien n'est vérifié : jamais de valeur par défaut inventée ;
 * - un chapitre « complet » liste au moins une affirmation ; sinon il est « incomplet » ou
 *   « non_applicable », avec un motif ;
 * - tous les objets sont stricts : un champ inconnu est refusé.
 *
 * `Preuve` existe déjà dans `exigences.ts` (preuves de porte) : celle-ci s'appelle donc
 * `PreuveObservatoire`.
 */
import { z } from "zod";
import { Horodatage, IdNatif } from "./communs.js";
import { DateJour, EmpreinteSha256 } from "./prospection.js";

/* ------------------------------------------------------------------ */
/* F.1 Statuts, confiance, affirmations, preuves                       */
/* ------------------------------------------------------------------ */

export const STATUTS_VERIFICATION = [
  "verifie_experimentalement",
  "confirme_doc_officielle",
  "rapporte_editeur",
  "rapporte_tiers",
  "infere",
  "non_verifie",
  "contredit",
  "obsolete",
] as const;
export const StatutVerification = z.enum(STATUTS_VERIFICATION);
export type StatutVerification = z.infer<typeof StatutVerification>;

/** Confiance de 0 à 3, toujours accompagnée de son motif. */
export const Confiance = z
  .object({
    niveau: z.number().int().min(0).max(3),
    motif: z.string().trim().min(1, "Le motif de la confiance est obligatoire"),
  })
  .strict();
export type Confiance = z.infer<typeof Confiance>;

/** Preuve : extrait exact d'un instantané de source OU résultat d'un essai, jamais les deux. */
export const PreuveObservatoire = z
  .object({
    instantaneId: IdNatif.nullable(),
    essaiId: IdNatif.nullable(),
    extraitExact: z.string().min(1),
    position: z.number().int().min(0),
  })
  .strict()
  .refine((p) => (p.instantaneId === null) !== (p.essaiId === null), {
    message: "Une preuve doit pointer vers exactement un lien : un instantané ou un essai",
    path: ["instantaneId"],
  });
export type PreuveObservatoire = z.infer<typeof PreuveObservatoire>;

/** Chapitre cible d'une affirmation : `ch01` à `ch24` ou `fiche.<champ>`. */
export const CibleAffirmation = z.string().regex(/^(ch(0[1-9]|1\d|2[0-4])|fiche\.[a-zA-Z]+)$/u, "Chapitre ou champ de fiche attendu");

export const Affirmation = z
  .object({
    id: IdNatif,
    projetId: IdNatif,
    chapitre: CibleAffirmation,
    texte: z.string().trim().min(1),
    statut: StatutVerification,
    confiance: Confiance,
    versionConcernee: z.string().min(1).nullable(),
    remplaceePar: IdNatif.nullable(),
    preuves: z.array(PreuveObservatoire),
  })
  .strict()
  .refine((a) => a.statut !== "verifie_experimentalement" || a.preuves.some((p) => p.essaiId !== null), {
    message: "Une affirmation « vérifiée expérimentalement » exige une preuve de type essai",
    path: ["preuves"],
  });
export type Affirmation = z.infer<typeof Affirmation>;

/* ------------------------------------------------------------------ */
/* F.3 Fiche (niveau 1)                                                */
/* ------------------------------------------------------------------ */

/** Champ de fiche : `valeur` peut être `null` (inconnu), jamais absente, jamais remplie par défaut. */
export const ChampFiche = <T extends z.ZodType>(valeur: T) =>
  z
    .object({
      valeur: valeur.nullable(),
      statut: StatutVerification,
      affirmationId: IdNatif.nullable(),
    })
    .strict()
    // Jamais de valeur inventée : toute valeur renseignée vient d'une affirmation sourcée.
    .refine((c) => (c as unknown as { valeur: unknown }).valeur === null || c.affirmationId !== null, {
      message: "Une valeur renseignée doit être liée à une affirmation (affirmationId)",
      path: ["affirmationId"],
    });
export type ChampFiche<T> = { valeur: T | null; statut: StatutVerification; affirmationId: string | null };

const Texte = z.string().trim().min(1);
const ListeTextes = z.array(Texte);

/** Catégories (tiroirs) de l'encyclopédie, liste fermée. Source de vérité côté site : `categories` de src/data/encyclopedie.ts ; copie en Python dans scripts/exporter-observatoire.py. */
export const CATEGORIES_OBS = ["modeles", "agents", "outils-de-code", "mcp-et-plugins", "retro-ingenierie", "image-et-video", "voix", "reglementation"] as const;
export type CategorieObs = (typeof CATEGORIES_OBS)[number];

/** Les 25 champs de la fiche, dans l'ordre du cahier. */
const formeFiche = {
  nom: ChampFiche(Texte),
  logo: ChampFiche(Texte),
  descriptionCourte: ChampFiche(Texte),
  categorie: ChampFiche(z.enum(CATEGORIES_OBS)),
  objectifPrincipal: ChampFiche(Texte),
  problemeResolu: ChampFiche(Texte),
  editeur: ChampFiche(Texte),
  siteOfficiel: ChampFiche(z.url()),
  depotSource: ChampFiche(z.url()),
  licence: ChampFiche(Texte),
  derniereVersion: ChampFiche(Texte),
  dateDerniereVersion: ChampFiche(DateJour),
  dateVerification: ChampFiche(DateJour),
  plateformes: ChampFiche(ListeTextes),
  compatibiliteClaudeMcp: ChampFiche(Texte),
  prerequis: ChampFiche(ListeTextes),
  niveauDifficulte: ChampFiche(Texte),
  coutsLicenceCommerciale: ChampFiche(Texte),
  avantages: ChampFiche(ListeTextes),
  limitations: ChampFiche(ListeTextes),
  risquesNotables: ChampFiche(ListeTextes),
  casUsage: ChampFiche(ListeTextes),
  alternatives: ChampFiche(ListeTextes),
  tutorielDemarrage: ChampFiche(Texte),
  liensSources: ChampFiche(z.array(z.url())),
  accesDossierComplet: ChampFiche(Texte),
};
export const CHAMPS_FICHE = Object.keys(formeFiche) as (keyof typeof formeFiche)[];
export const Fiche = z.object(formeFiche).strict();
export type Fiche = z.infer<typeof Fiche>;

/* ------------------------------------------------------------------ */
/* F.3 Dossier (niveau 2)                                              */
/* ------------------------------------------------------------------ */

export const VERSION_SCHEMA_DOSSIER = "dossier-observatoire/v1" as const;

/** Les 24 chapitres du cahier, avec leurs intitulés. */
export const INTITULES_CHAPITRES = {
  ch01: "Identité et présentation",
  ch02: "Synthèse exécutive",
  ch03: "Origines et problèmes résolus",
  ch04: "Concepts fondamentaux et glossaire",
  ch05: "Public cible et positionnement",
  ch06: "Fonctionnalités détaillées",
  ch07: "Architecture globale",
  ch08: "Fonctionnement interne",
  ch09: "Technologies et dépendances",
  ch10: "Compatibilité et environnement",
  ch11: "Licence, gouvernance et propriété",
  ch12: "Installation rapide",
  ch13: "Installation avancée",
  ch14: "Configuration et personnalisation",
  ch15: "Utilisation fondamentale",
  ch16: "Utilisation avancée",
  ch17: "Intégrations Claude, MCP et agents",
  ch18: "Intégrations à d'autres environnements",
  ch19: "Cas d'usage et projets pratiques",
  ch20: "Performances et benchmarks",
  ch21: "Sécurité",
  ch22: "Confidentialité et conformité",
  ch23: "Coûts, exploitation et maintenance",
  ch24: "Comparaisons et évolution",
} as const;
export type CleChapitre = keyof typeof INTITULES_CHAPITRES;
export const CLES_CHAPITRES = Object.keys(INTITULES_CHAPITRES) as CleChapitre[];
export const CleChapitre = z.enum(CLES_CHAPITRES as [CleChapitre, ...CleChapitre[]]);

export const TYPES_SOUS_CHAPITRE = [
  "debutant", "intermediaire", "expert", "exemple", "procedure", "diagramme",
  "preuve", "resultat_essai", "limites", "problemes_connus", "sources",
] as const;
export const SousChapitre = z
  .object({ type: z.enum(TYPES_SOUS_CHAPITRE), titre: Texte, contenuMd: z.string() })
  .strict();
export type SousChapitre = z.infer<typeof SousChapitre>;

export const Annexe = z.object({ titre: Texte, contenuMd: z.string() }).strict();
export type Annexe = z.infer<typeof Annexe>;

export const ETATS_CHAPITRE = ["complet", "incomplet", "non_applicable"] as const;

export const Chapitre = z
  .object({
    cle: CleChapitre,
    etat: z.enum(ETATS_CHAPITRE),
    motif: z.string().trim().min(1).nullable(),
    affirmationIds: z.array(IdNatif),
    sousChapitres: z.array(SousChapitre),
    annexes: z.array(Annexe),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.etat !== "complet" && c.motif === null) {
      ctx.addIssue({ code: "custom", path: ["motif"], message: "Un chapitre incomplet ou non applicable exige un motif" });
    }
    if (c.etat === "complet" && c.affirmationIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["affirmationIds"], message: "Un chapitre complet doit lister au moins une affirmation" });
    }
  });
export type Chapitre = z.infer<typeof Chapitre>;

/** Exactement les 24 clés `ch01` à `ch24`, chacune portant un chapitre de même clé. */
const formeChapitres = Object.fromEntries(CLES_CHAPITRES.map((k) => [k, Chapitre])) as Record<CleChapitre, typeof Chapitre>;

export const Dossier = z
  .object({
    schema: z.literal(VERSION_SCHEMA_DOSSIER),
    projetId: IdNatif,
    chapitres: z.object(formeChapitres).strict(),
  })
  .strict()
  .superRefine((d, ctx) => {
    for (const k of CLES_CHAPITRES) {
      if (d.chapitres[k].cle !== k) {
        ctx.addIssue({ code: "custom", path: ["chapitres", k, "cle"], message: `Le chapitre rangé sous ${k} porte la clé ${d.chapitres[k].cle}` });
      }
    }
  });
export type Dossier = z.infer<typeof Dossier>;

/* ------------------------------------------------------------------ */
/* Révisions et éditions                                               */
/* ------------------------------------------------------------------ */

export const LANGUES_OBSERVATOIRE = ["fr", "en"] as const;
export const LangueObservatoire = z.enum(LANGUES_OBSERVATOIRE);

/** Sous-ensemble du workflow éditorial du cahier (F.5) porté par une révision. */
export const STATUTS_REVISION = ["brouillon", "a_verifier", "a_corriger", "valide", "programme", "publie", "a_actualiser", "archive"] as const;

export const Revision = z
  .object({
    dossierId: IdNatif,
    langue: LangueObservatoire,
    numero: z.number().int().min(1),
    /** Numéro de la révision française dont dérive une révision anglaise. */
    baseRevisionFr: z.number().int().min(1).nullable(),
    contenuMd: z.string(),
    empreinte: EmpreinteSha256,
    statut: z.enum(STATUTS_REVISION),
    publieeLe: Horodatage.nullable().optional(),
  })
  .strict()
  .refine((r) => r.langue !== "en" || r.baseRevisionFr !== null, {
    message: "Une révision anglaise exige la révision française dont elle dérive (baseRevisionFr)",
    path: ["baseRevisionFr"],
  });
export type Revision = z.infer<typeof Revision>;

export const STATUTS_EDITION = ["brouillon", "programmee", "publiee"] as const;

export const Edition = z
  .object({
    numero: z.number().int().min(1),
    periodeDebut: DateJour,
    periodeFin: DateJour,
    langue: LangueObservatoire,
    version: Texte,
    statut: z.enum(STATUTS_EDITION),
    corrections: ListeTextes,
  })
  .strict()
  .refine((e) => e.periodeDebut <= e.periodeFin, {
    message: "La fin de période ne peut pas précéder le début",
    path: ["periodeFin"],
  });
export type Edition = z.infer<typeof Edition>;
