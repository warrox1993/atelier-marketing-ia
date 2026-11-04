/**
 * Routes du module Observatoire (tâche 10). Chaque gestionnaire appelle d'abord `exigerObservatoire` (FR-035) :
 * une entreprise d'un autre service reçoit `acces_refuse` avant toute lecture. Toute requête passe par `baseObservatoire`
 * et porte le `companyId` de la requête : une entreprise ne voit jamais les projets d'une autre.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CibleAffirmation, Confiance, PreuveObservatoire, StatutVerification, type Affirmation } from "../../contrats/observatoire.js";
import { CONSIGNE_PASSAGE } from "../../contrats/connaissances.js";
import { IdNatif } from "../../contrats/communs.js";
import { LIMITES } from "../../contrats/identifiants.js";
import { UrlLue } from "../../contrats/sources.js";
import type { CleRouteApi } from "../../contrats/index.js";
import { RevueRequise } from "../../contrats/porte.js";
import type { GestionnaireRoute, RequeteRoute } from "../atelier.js";
import { injectionsSignalees } from "../contenu-externe.js";
import { erreur, erreurValidation } from "../erreurs.js";
import type { StockLiaisons } from "../liaisons/base-liaisons.js";
import { exigerHumainLecture } from "../liaisons/lire.js";
import { validerAffirmation, validerPreuve } from "./affirmations.js";
import type { baseObservatoire } from "./base-observatoire.js";
import { collecterSource, robotsAutorise, versionsGithub, versionsNpm, versionsPypi, type LireUrl, type VersionRelevee } from "./collecte.js";
import { canoniserAlias, urlSiteDeclaree } from "./identites.js";
import { lireCleObservatoire, RE_ARTICLE } from "./cles.js";
import { empreinteTexte, idsAffirmationsCitees, RE_BASE_FR } from "./entrees-porte.js";
import { RE_URL } from "./regles-porte-obs.js";
import { assemblerFiche } from "./fiche.js";
import { exigerObservatoire } from "./garde.js";

const RE_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type BaseObs = ReturnType<typeof baseObservatoire>;

/** Révision de livrable approuvée par un humain : clé du document de tâche (`fiche-<slug>-<langue>`), numéro de révision et corps. */
/** `revisionId` : révision native du document ; `approuveeLe` : date ISO de la décision humaine qui l'approuve. */
export type RevisionApprouvee = { cle: string; numero: number; corps: string; revisionId: string; approuveeLe: string };

export interface DependancesObservatoire {
  stock: Pick<StockLiaisons, "serviceDeEntreprise">;
  base: Pick<BaseObs, "sourcesCommunesParUrl" | "projetParSlug" | "projetParId" | "creerProjet" | "ajouterAlias" | "projetDeAlias" | "importerSourcesCommunes" | "proposerSourceCommune" | "suspecterSources" | "propositionsDuRun" | "activerSource" | "listerSourcesCommunes" | "enregistrerSource" | "sourcesDuProjet" | "enregistrerCollecte" | "enregistrerVersions" | "listerVersions" | "insererAffirmation" | "remplacerAffirmation" | "listerAffirmations" | "affirmationsParIds" | "insererPreuve" | "listerPreuves" | "instantane" | "dernierInstantaneId" | "urlDeSource" | "lireRevision" | "insererRevision" | "revisionsSansPublication" | "sourcesCommunes" | "insererPublication" | "publicationGitExiste" | "confirmerPublication" | "publicationConfirmee">;
  /** Lecture protégée d'une URL (transport réel du plugin ; transport de fixtures en test). */
  lire: LireUrl;
  /** N2 : refuse un agent non assigné à la tâche en cours ou d'un rôle qui ne documente pas la route (`exigerLecteurWeb`). */
  lecteurWeb(r: RequeteRoute, cle: "tache.obs.collecter" | "tache.obs.sources.proposer"): Promise<void>;
  /** Livrables `fiche-*` et `article-*` des tâches dont l'approbation humaine est valide sur la révision courante (`approbationValide`). */
  approuvees(companyId: string): Promise<RevisionApprouvee[]>;
  /** Primitives de l'hôte pour la mise sous porte d'un article (tâche, projet natif, campagne, exigence, porte). */
  porte: {
    /** Tâche native de l'entreprise ; `introuvable` si elle n'y est pas. */
    tache(companyId: string, issueId: string): Promise<{ projectId: string | null }>;
    projet(companyId: string, projectId: string): Promise<{ name: string } | null>;
    campagneDuProjet(companyId: string, projectId: string): Promise<{ id: string } | null>;
    creerCampagne(companyId: string, projectId: string, nom: string): Promise<string>;
    creerExigenceSiAbsente(e: { companyId: string; campagneId: string; code: string; texteOriginal: string; interpretation: string; obligatoire: boolean; criteres: string[]; dependances: string[]; elementsAttendus: string[] }): Promise<boolean>;
    /** `portes.creer` : valide les étapes de revue et d'approbation humaine de la tâche. */
    creerPorte: GestionnaireRoute;
  };
}

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u, "Slug en minuscules, chiffres et tirets");
const Langue = z.enum(["fr", "en"]);
// L'hôte lit `companyId` dans le corps pour résoudre l'entreprise d'une route board ; il doit être celui de la requête.
const CompanyIdCorps = IdNatif.optional();
const AliasDeclare = z.object({ type: z.enum(["github", "npm", "pypi", "site", "nom"]), valeur: z.string().trim().min(1).max(500) }).strict();
const DeclarerProjet = z.object({
  companyId: CompanyIdCorps,
  slug: Slug,
  nom: z.string().trim().min(1).max(200),
  alias: z.array(AliasDeclare).max(50),
}).strict();
const AjouterAlias = z.object({ companyId: CompanyIdCorps, slug: Slug, alias: z.array(AliasDeclare).min(1).max(50) }).strict();
/** URL http(s) d'une source, canonisée comme un alias site déclaré (chemin gardé, sans fragment). */
const UrlSource = z.string().trim().min(1).max(500).transform((v, ctx) => {
  try {
    const u = urlSiteDeclaree(v);
    if (/^https?:\/\//u.test(u)) return u;
  } catch { /* illisible : refusée ci-dessous */ }
  ctx.addIssue({ code: "custom", message: "URL http(s) attendue" });
  return z.NEVER;
});
const MetaSource = {
  langue: z.string().trim().min(2).max(16).nullable().optional(),
  pays: z.string().trim().min(2).max(16).nullable().optional(),
  sujets: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
};
/** Types permis par la contrainte de la migration 023 ; `primaire` est réservé aux éditeurs et institutions officielles (choix humain). */
const TypeSource = z.enum(["primaire", "secondaire", "communautaire"]);
export const IMPORT_MAX = 200;
export const PROPOSITION_MAX = 50;
/** V2-7 : sources proposées par un même run, au plus (comptées sur `ajoutee_par`). */
export const PROPOSITIONS_PAR_RUN_MAX = 100;
const ImporterBase = z.object({
  companyId: CompanyIdCorps,
  // DROIT-5.2 : auteur (personne ou organisation) nommé avec toute citation publiée de la source (CDE XI.189).
  sources: z.array(z.object({ url: UrlSource, type: TypeSource, joignabilite: z.enum(["A", "B", "C"]).nullable(), auteur: z.string().trim().min(1).max(200).optional(), ...MetaSource }).strict()).min(1).max(IMPORT_MAX),
}).strict();
// Un agent ne déclare pas de source primaire : ce rang (OBS-14) reste une décision humaine, par obs.base.importer.
export const ProposerSources = z.object({
  sources: z.array(z.object({ url: UrlSource.pipe(UrlLue), type: z.enum(["secondaire", "communautaire"]), motif: z.string().trim().min(1).max(500), ...MetaSource }).strict()).min(1).max(PROPOSITION_MAX),
}).strict();
const Suspecter = z.object({
  companyId: CompanyIdCorps,
  urls: z.array(UrlSource).min(1).max(IMPORT_MAX),
  motif: z.string().trim().min(1).max(500),
}).strict();
const ListerCommunes = z.object({
  langue: z.string().max(16).optional(), pays: z.string().max(16).optional(), type: TypeSource.optional(), sujet: z.string().max(100).optional(),
  debut: z.coerce.number().int().min(0).default(0), limite: z.coerce.number().int().min(1).max(IMPORT_MAX).default(IMPORT_MAX),
}).strict();
/** APP-11 : liste des affirmations d'un projet, sans preuves (elles se lisent par l'identifiant). */
const ListerAffirmations = z.object({
  slug: Slug, statut: StatutVerification.optional(),
  debut: z.coerce.number().int().min(0).default(0), limite: z.coerce.number().int().min(1).max(IMPORT_MAX).default(IMPORT_MAX),
}).strict();
const MettreSousPorte = z.object({
  companyId: CompanyIdCorps,
  issueId: IdNatif,
  cleLivrable: z.string().regex(RE_ARTICLE, "Clé attendue : article-<numéro>-<slug>-<fr|en>").max(64),
  revuesRequises: z.array(RevueRequise).min(1).max(3),
}).strict();
/** Exigence générique de tout article : la conformité aux règles de l'Observatoire. */
const EXIGENCE_ARTICLE = {
  code: "REQ-001", texteOriginal: "Article conforme aux règles de l'Observatoire",
  interpretation: "Le texte respecte les règles éditoriales de l'Observatoire : chaque fait est sourcé par une affirmation vérifiée, aucun fait n'est inventé.",
  obligatoire: true, criteres: [], dependances: [], elementsAttendus: [],
};
/** `communes` (T6) : URL de la base commune à collecter avec le projet, pour adosser une preuve à leur instantané. */
export const Collecter = z.object({ slug: Slug, communes: z.array(z.string().trim().min(1).max(2048)).max(20).optional() }).strict();
/** Corps de `tache.obs.affirmer` : l'identifiant et `remplaceePar` sont attribués par le serveur ; le contrat complet est revalidé ensuite. */
export const Affirmer = z.object({
  affirmation: z.object({
    projetId: IdNatif,
    chapitre: CibleAffirmation.describe("`ch01` à `ch24` ou `fiche.<champ>`"),
    texte: z.string().max(4000),
    statut: StatutVerification,
    confiance: Confiance.extend({ motif: z.string().trim().min(1).max(1000) }),
    versionConcernee: z.string().max(64).nullable(),
  }).strict(),
  // 500 : aligné sur OBS-15 (LONGUEUR_MAX_EXTRAIT_DEFAUT), refusé ici plutôt qu'à la porte.
  preuves: z.array(PreuveObservatoire.refine((p) => p.extraitExact.length <= 500, { message: "Extrait de 500 caractères au plus", path: ["extraitExact"] })).max(50),
  // LIV-OB-11 : affirmation inexacte du même projet que celle-ci remplace (jamais effacée).
  remplace: IdNatif.optional(),
}).strict();
/** Rangs (unités UTF-16, comme `position` d'une preuve) des occurrences de `extrait`, POSITIONS_MAX au plus. */
function positionsDe(texte: string, extrait: string): number[] {
  const positions: number[] = [];
  for (let i = texte.indexOf(extrait); i !== -1 && positions.length < POSITIONS_MAX; i = texte.indexOf(extrait, i + 1)) positions.push(i);
  return positions;
}
/** Taille d'une page de texte d'instantané renvoyée à l'agent (~5 k jetons) ; au-delà, `debut` pagine. */
export const TEXTE_MAX_CARACTERES = 20_000;
/** T15 : `chercher` rend les positions d'un extrait dans le texte entier, pour lire la bonne page au lieu de la deviner. */
export const POSITIONS_MAX = 20;
const LireInstantane = z.object({ debut: z.coerce.number().int().min(0).default(0), chercher: z.string().min(3).max(200).optional() }).strict();
export const DemanderFiche = z.object({ slug: Slug, langue: Langue }).strict();
const Confirmer = z.object({ companyId: CompanyIdCorps, objet: z.string().trim().min(1).max(200) }).strict();
/** INJ-9 : lien absolu (même règle que la porte, OBS-03) ou adresse « www. » qu'un rendu Markdown change en lien. */
const RE_LIEN_EXTERNE = new RegExp(`${RE_URL.source}|\\bwww\\.[a-z0-9-]+\\.[a-z]`, "iu");
const Marquer = z.object({
  companyId: CompanyIdCorps,
  objet: z.string().trim().min(1).max(200),
  empreinteArtefact: z.string().regex(/^[0-9a-f]{64}$/iu, "Empreinte SHA-256 (64 caractères hexadécimaux)"),
  commitContenu: z.string().regex(/^[0-9a-f]{7,64}$/iu, "Identifiant de commit hexadécimal"),
}).strict();

function exigerMemeEntreprise(duCorps: string | undefined, companyId: string): void {
  if (duCorps !== undefined && duCorps.toLowerCase() !== companyId.toLowerCase()) erreur("hors_entreprise", "Entreprise incohérente.");
}

function lire<T>(schema: z.ZodType<T>, valeur: unknown, quoi: string): T {
  const r = schema.safeParse(valeur);
  if (!r.success) erreurValidation(quoi, r.error.issues);
  return r.data;
}

const RE_GITHUB = /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/releases/u;
const RE_NPM = /^https:\/\/registry\.npmjs\.org\//u;
const RE_PYPI = /^https:\/\/pypi\.org\/pypi\//u;
const RE_DEPOT_GITHUB = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/u;
const RE_PAQUET_NPM = /^(@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/u;
/** Nom de projet PyPI (PEP 508), déjà mis en minuscules par canoniserAlias. */
const RE_PAQUET_PYPI = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

/** URL de collecte d'un alias canonique (releases GitHub, fiche du registre npm, API JSON de PyPI, URL déclarée du site, chemin gardé, sans fragment) ; null si l'alias n'en a pas. */
function urlDeCollecte(a: { type: string; valeur: string }, declaree: string): string | null {
  if (a.type === "github" && RE_DEPOT_GITHUB.test(a.valeur)) return `https://api.github.com/repos/${a.valeur}/releases`;
  if (a.type === "npm" && RE_PAQUET_NPM.test(a.valeur)) return `https://registry.npmjs.org/${a.valeur.replace("/", "%2f")}`;
  if (a.type === "pypi" && RE_PAQUET_PYPI.test(a.valeur)) return `https://pypi.org/pypi/${a.valeur}/json`;
  if (a.type === "site" && /^https?:\/\//u.test(a.valeur)) return urlSiteDeclaree(declaree);
  return null;
}

/**
 * SPEC-E3 (ADR-009, droits-collecte.md § 1, points 1 et 2) : décision de droits exigée ; une page (ni API GitHub ni registre
 * npm) n'est lue que si son robots.txt la permet. robots.txt absent (4xx) : permise ; injoignable : différée (RFC 9309, § 2.3.1).
 */
async function politiqueDeCollecte(s: { urlCanonique: string; autorisee: boolean }, lireUrl: LireUrl): Promise<{ autorisee: boolean; motif?: string }> {
  if (!s.autorisee) return { autorisee: false, motif: "aucune décision de droits de collecte pour cette source (politique_collecte.autorisee)" };
  if (RE_GITHUB.test(s.urlCanonique) || RE_NPM.test(s.urlCanonique)) return { autorisee: true };
  const l = await lireUrl(new URL("/robots.txt", s.urlCanonique).href).catch(() => null);
  if (l?.codeHttp != null && l.codeHttp >= 400 && l.codeHttp < 500) return { autorisee: true };
  if (!l || l.statut !== "accessible" || l.corps === null) return { autorisee: false, motif: `robots.txt injoignable (${l?.codeHttp ?? l?.statut ?? "erreur"}) : lecture différée` };
  return robotsAutorise(l.corps, s.urlCanonique) ? { autorisee: true } : { autorisee: false, motif: "robots.txt interdit la lecture de cette page" };
}

/** Versions relevées dans le corps JSON d'une source GitHub (releases), npm ou PyPI ; autre source ou JSON illisible : rien. */
function versionsDe(url: string, corps: string): VersionRelevee[] {
  try {
    if (RE_GITHUB.test(url)) return versionsGithub(JSON.parse(corps));
    if (RE_NPM.test(url)) return versionsNpm(JSON.parse(corps));
    if (RE_PYPI.test(url)) return versionsPypi(JSON.parse(corps));
  } catch { /* JSON illisible : pas de version, l'instantané reste enregistré */ }
  return [];
}

export function routesObservatoire(d: DependancesObservatoire): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { stock, base } = d;
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  const projetOuIntrouvable = async (companyId: string, slug: string) =>
    (await base.projetParSlug(companyId, slug)) ?? erreur("introuvable", `Projet « ${slug} » introuvable.`);

  /** Relie des alias canoniques à un projet et enregistre leur source de collecte ; idempotent (alias déjà relié au même projet : rien à signaler). */
  async function relierAlias(c: string, projetId: string, canoniques: Array<{ a: ReturnType<typeof canoniserAlias>; declaree: string }>) {
    const aliasIgnores: string[] = [];
    for (const { a, declaree } of canoniques) {
      if (!(await base.ajouterAlias(c, projetId, a.type, a.valeur)) && (await base.projetDeAlias(c, a.type, a.valeur)) !== projetId) aliasIgnores.push(a.valeur);
      const url = urlDeCollecte(a, declaree);
      if (url) {
        // Choix : l'URL de collecte est aussi enregistrée comme alias « site », la jointure de sourcesDuProjet reste inchangée.
        await base.enregistrerSource(c, url, "primaire");
        await base.ajouterAlias(c, projetId, "site", url);
      }
    }
    const avertissement = aliasIgnores.map((a) => `L'alias ${a} appartient déjà à un autre projet et n'a pas été relié à celui-ci : aucune source de collecte ne lui correspond.`).join(" ");
    return { aliasIgnores, ...(avertissement ? { avertissement } : {}) };
  }

  routes["obs.projet.declarer"] = async (r) => {
    const c = await exigerObservatoire(stock, r.companyId);
    exigerHumainLecture(r.acteur, "La déclaration d'un projet");
    const e = lire(DeclarerProjet, r.corps, "Projet");
    exigerMemeEntreprise(e.companyId, c);
    if (await base.projetParSlug(c, e.slug)) erreur("conflit", `Le projet « ${e.slug} » existe déjà.`);
    // Tous les alias sont canonisés avant de créer le projet : un alias illisible ne laisse pas de projet orphelin.
    const canoniques = e.alias.map((brut) => ({ a: canoniserAlias(brut), declaree: brut.valeur }));
    const projetId = await base.creerProjet(c, { slug: e.slug, nom: e.nom, statutEditorial: "brouillon" });
    // shortcut: pas de campagne technique R1 (création native lourde : projet natif, brief, coordinateur) ; à brancher avec la tâche qui la fixe.
    return { statut: 201, corps: { projetId, slug: e.slug, campagneId: null, ...(await relierAlias(c, projetId, canoniques)) } };
  };

  routes["obs.projet.ajouter-alias"] = async (r) => {
    const c = await exigerObservatoire(stock, r.companyId);
    exigerHumainLecture(r.acteur, "L'ajout d'alias à un projet");
    const e = lire(AjouterAlias, r.corps, "Alias");
    exigerMemeEntreprise(e.companyId, c);
    const canoniques = e.alias.map((brut) => ({ a: canoniserAlias(brut), declaree: brut.valeur }));
    const projet = await projetOuIntrouvable(c, e.slug);
    return { statut: 200, corps: { projetId: projet.id, slug: e.slug, ...(await relierAlias(c, projet.id, canoniques)) } };
  };

  routes["obs.base.importer"] = async (r) => {
    const c = await exigerObservatoire(stock, r.companyId);
    exigerHumainLecture(r.acteur, "L'import de la base commune des sources");
    const e = lire(ImporterBase, r.corps, "Base de sources");
    exigerMemeEntreprise(e.companyId, c);
    await base.importerSourcesCommunes(c, e.sources.map((s) => ({ url: s.url, type: s.type, joignabilite: s.joignabilite, langue: s.langue ?? null, pays: s.pays ?? null, sujets: s.sujets ?? [], auteur: s.auteur ?? null })));
    return { statut: 200, corps: { importees: e.sources.length } };
  };

  routes["obs.base.suspecter"] = async (r) => {
    const c = await exigerObservatoire(stock, r.companyId);
    exigerHumainLecture(r.acteur, "La mise à l'écart d'une source");
    const e = lire(Suspecter, r.corps, "Sources suspectes");
    exigerMemeEntreprise(e.companyId, c);
    const urls = [...new Set(e.urls)];
    const suspectees = await base.suspecterSources(c, urls, e.motif);
    return { statut: 200, corps: { suspectees, inconnues: urls.length - suspectees } };
  };

  routes["tache.obs.sources.communes"] = async (r) => {
    const c = await exigerObservatoire(stock, r.companyId);
    const { companyId: _c, ...brut } = r.query;
    const f = lire(ListerCommunes, brut, "Liste des sources communes");
    const { total, sources } = await base.listerSourcesCommunes(c, f);
    const fin = f.debut + sources.length;
    return { statut: 200, corps: { total, debut: f.debut, sources, suivant: sources.length && fin < total ? fin : null } };
  };

  routes["tache.obs.sources.proposer"] = async (r) => {
    const c = await exigerObservatoire(stock, r.companyId);
    await d.lecteurWeb(r, "tache.obs.sources.proposer");
    const e = lire(ProposerSources, r.corps, "Proposition de sources");
    const a = r.acteur;
    const ajouteePar = a.type === "agent" ? `agent:${a.agentId ?? a.id}/run:${a.runId ?? "aucun"}` : `${a.type}:${a.userId ?? a.id}`;
    // shortcut: compté avant l'ajout, deux appels simultanés du même run peuvent dépasser de 50 au plus ; verrou par run si besoin.
    const deja = await base.propositionsDuRun(c, ajouteePar);
    if (deja + e.sources.length > PROPOSITIONS_PAR_RUN_MAX) {
      erreur("entree_invalide", `Au plus ${PROPOSITIONS_PAR_RUN_MAX} sources proposées par run (${deja} déjà proposées) : signalez les autres dans votre livrable.`);
    }
    const ajoutees: Array<{ url: string; etat: "active" | "candidate" }> = [];
    const ignorees: string[] = [];
    for (const s of e.sources) {
      if (!(await base.proposerSourceCommune(c, { url: s.url, type: s.type, motif: s.motif, langue: s.langue ?? null, pays: s.pays ?? null, sujets: s.sujets ?? [] }, ajouteePar))) {
        ignorees.push(s.url);
        continue;
      }
      // Lecture protégée existante : une source lue avec succès devient citable ; sinon elle reste candidate, listée.
      const lu = (await d.lire(s.url)).statut === "accessible";
      if (lu) await base.activerSource(c, s.url);
      ajoutees.push({ url: s.url, etat: lu ? "active" : "candidate" });
    }
    const avertissement = ignorees.length ? `${ignorees.length} source(s) déjà dans la base commune, ignorée(s) et non modifiée(s) : ${ignorees.join(", ")}.` : "";
    return { statut: 201, corps: { ajoutees, ignorees, ...(avertissement ? { avertissement } : {}) } };
  };

  routes["obs.article.mettre-sous-porte"] = async (r) => {
    const c = await exigerObservatoire(stock, r.companyId);
    exigerHumainLecture(r.acteur, "La mise sous porte d'un article");
    const { companyId, ...e } = lire(MettreSousPorte, r.corps, "Mise sous porte");
    exigerMemeEntreprise(companyId, c);
    const { projectId } = await d.porte.tache(c, e.issueId);
    if (!projectId) erreur("entree_invalide", "La tâche n'a pas de projet natif : la campagne de l'article s'y rattache, créez d'abord le projet de l'article.");
    const projet = (await d.porte.projet(c, projectId)) ?? erreur("hors_entreprise", "Projet natif introuvable dans cette entreprise.");
    // shortcut: course entre deux premiers appels simultanés réglée par l'index unique (un des deux échoue en conflit) ; à relancer.
    const campagneId = (await d.porte.campagneDuProjet(c, projectId))?.id ?? await d.porte.creerCampagne(c, projectId, `Observatoire : ${projet.name}`);
    await d.porte.creerExigenceSiAbsente({ companyId: c, campagneId, ...EXIGENCE_ARTICLE });
    // SKMK-O6 : 3 cycles, puis retour à l'humain (politique-versions.md §1) ; seule une relance humaine les relève.
    return d.porte.creerPorte({ ...r, cle: "portes.creer", corps: { companyId: c, campagneId, exigencesCiblees: [EXIGENCE_ARTICLE.code], ...e, maxCycles: LIMITES.maxCyclesCorrectionParDefaut } });
  };

  routes["tache.obs.collecter"] = async (r) => {
    const c = await exigerObservatoire(stock, r.companyId);
    await d.lecteurWeb(r, "tache.obs.collecter");
    const { slug, communes = [] } = lire(Collecter, r.corps, "Collecte");
    const projet = await projetOuIntrouvable(c, slug);
    const corpsParUrl = new Map<string, string>();
    const transport: LireUrl = async (url) => {
      const l = await d.lire(url);
      if (l.corps !== null) corpsParUrl.set(url, l.corps);
      return l;
    };
    const resultats: Array<{ url: string; etat: string; motif?: string; sourceId: string; instantaneId: string | null; injections?: string[] }> = [];
    const versions = new Map<string, VersionRelevee>();
    // T6 : les sources de la base commune se collectent à la demande (communes), une à une par leur URL ; une URL inconnue ou suspecte est refusée.
    const demandees = communes.length ? await base.sourcesCommunesParUrl(c, communes) : [];
    const inconnue = communes.find((u) => !demandees.some((s) => s.urlCanonique === u));
    if (inconnue !== undefined) erreur("introuvable", `Source absente de la base commune, ou suspecte : ${inconnue.slice(0, 200)}. Proposez-la d'abord (POST …/obs/sources/proposer).`);
    const duProjet = await base.sourcesDuProjet(c, projet.id);
    const sources = [...duProjet, ...demandees.filter((s) => !duProjet.some((p) => p.id === s.id))];
    if (!sources.length) erreur("obs_projet_sans_source", "Ce projet n'a aucune source de collecte : déclarez-en une (alias github, npm, pypi ou site) ou demandez-la à l'opérateur.");
    for (const s of sources) {
      // shortcut: dernière empreinte inconnue du dépôt, donc « nouveau » à chaque passage ; l'insertion ignore le doublon (source_id, empreinte).
      const res = await collecterSource({ url: s.urlCanonique, etag: s.etag, derniereEmpreinte: null, politique: await politiqueDeCollecte(s, d.lire) }, transport);
      await base.enregistrerCollecte(c, s.id, res);
      const corps = corpsParUrl.get(s.urlCanonique);
      if (corps) for (const v of versionsDe(s.urlCanonique, corps)) versions.set(v.version, v);
      // Un « nouveau » vise son empreinte (même si le contenu revient à un état ancien) ; « inchange » garde le dernier connu ; un échec n'a pas d'instantané.
      const instantaneId = res.etat === "echec" ? null : await base.dernierInstantaneId(c, s.id, res.etat === "nouveau" ? res.empreinte : undefined);
      resultats.push({ url: res.url, etat: res.etat, ...(res.motif ? { motif: res.motif } : {}), sourceId: s.id, instantaneId, ...(res.injections?.length ? { injections: res.injections } : {}) });
    }
    await base.enregistrerVersions(c, projet.id, [...versions.values()]);
    return { statut: 200, corps: { slug, projetId: projet.id, sources: resultats, versions: versions.size } };
  };

  routes["tache.obs.affirmer"] = async (r) => {
    const c = await exigerObservatoire(stock, r.companyId);
    const e = lire(Affirmer, r.corps, "Affirmation");
    const a: Affirmation = validerAffirmation({ ...e.affirmation, id: randomUUID(), remplaceePar: null, preuves: e.preuves });
    if (!(await base.projetParId(c, a.projetId))) erreur("introuvable", "Projet introuvable dans cette entreprise.");
    // shortcut: preuves par essai refusées, à rouvrir avec K8 (validerPreuve les rejette en entree_invalide)
    for (const p of a.preuves) validerPreuve(p, p.instantaneId ? await base.instantane(c, p.instantaneId) : null);
    if (e.remplace) {
      const [ancienne] = await base.affirmationsParIds(c, [e.remplace]);
      if (!ancienne || ancienne.projetId !== a.projetId || ancienne.remplaceePar !== null) {
        erreur("entree_invalide", "remplace : affirmation introuvable, d'un autre projet ou déjà remplacée.");
      }
    }
    const id = await base.insererAffirmation(c, {
      projetId: a.projetId, chapitre: a.chapitre, texte: a.texte, statut: a.statut,
      confiance: a.confiance.niveau, confianceMotif: a.confiance.motif, versionConcernee: a.versionConcernee,
    });
    for (const p of a.preuves) await base.insererPreuve(c, { affirmationId: id, instantaneId: p.instantaneId, essaiId: p.essaiId, extraitExact: p.extraitExact, position: p.position });
    // shortcut: deux remplacements simultanés de la même affirmation laissent la seconde nouvelle sans lien ; verrou si cela arrive.
    if (e.remplace) await base.remplacerAffirmation(c, e.remplace, id);
    return { statut: 201, corps: { id, citation: `[aff:${id}]` } };
  };

  routes["tache.obs.fiche"] = async (r) => {
    const c = await exigerObservatoire(stock, r.companyId);
    const { slug, langue } = lire(DemanderFiche, r.corps, "Fiche");
    const projet = await projetOuIntrouvable(c, slug);
    const brutes = await base.listerAffirmations(c, projet.id);
    const affirmations = await Promise.all(brutes.map((a) => enContrat(c, a)));
    const fiche = assemblerFiche(projet, affirmations, await base.listerVersions(c, projet.id));
    // shortcut: le document de tâche natif n'est pas écrit (capacité issue.documents.write absente du manifeste) ; la fiche est renvoyée.
    return { statut: 200, corps: { slug, projetId: projet.id, langue, cleDocument: `fiche-${slug}-${langue}`, documentEcrit: false, fiche, ...lectureNonFiable(affirmations) } };
  };

  routes["tache.obs.instantane"] = async (r) => {
    const c = await exigerObservatoire(stock, r.companyId);
    const { debut, chercher } = lire(LireInstantane, { debut: r.query.debut, chercher: r.query.chercher }, "Lecture d'instantané");
    const id = lire(IdNatif, r.params.id, "Identifiant d'instantané");
    const inst = (await base.instantane(c, id)) ?? erreur("introuvable", "Instantané introuvable dans cette entreprise.");
    const fin = debut + TEXTE_MAX_CARACTERES;
    return {
      statut: 200,
      corps: {
        id: inst.id, sourceUrl: await base.urlDeSource(c, inst.sourceId), recupereLe: inst.recupereLe,
        texteNormalise: inst.texteNormalise.slice(debut, fin), debut, totalCaracteres: inst.texteNormalise.length,
        suivant: fin < inst.texteNormalise.length ? fin : null,
        ...(chercher === undefined ? {} : { positions: positionsDe(inst.texteNormalise, chercher) }),
        // Texte d'une page externe : donnée à citer, jamais à suivre (même marquage que les passages de connaissances).
        nonFiable: true, consigne: CONSIGNE_PASSAGE, injectionsSignalees: (inst.injectionsSignalees ?? []).slice(0, 20).map((x) => x.slice(0, 300)),
      },
    };
  };

  routes["tache.obs.affirmation"] = async (r) => {
    const c = await exigerObservatoire(stock, r.companyId);
    const id = lire(IdNatif, r.params.id, "Identifiant d'affirmation");
    const [brute] = await base.affirmationsParIds(c, [id]);
    if (!brute) erreur("introuvable", "Affirmation introuvable dans cette entreprise.");
    const a = await enContrat(c, brute);
    return { statut: 200, corps: { ...a, ...lectureNonFiable([a]) } };
  };

  routes["tache.obs.affirmations"] = async (r) => {
    const c = await exigerObservatoire(stock, r.companyId);
    const { companyId: _c, ...brut } = r.query;
    const f = lire(ListerAffirmations, brut, "Liste des affirmations");
    const projet = await projetOuIntrouvable(c, f.slug);
    // shortcut: filtre et pagination en mémoire (quelques centaines d'affirmations par projet) ; requête paginée si un projet en compte des milliers.
    const toutes = (await base.listerAffirmations(c, projet.id)).filter((a) => !f.statut || a.statut === f.statut);
    const page = toutes.slice(f.debut, f.debut + f.limite);
    const fin = f.debut + page.length;
    const affirmations = page.map((a) => ({ id: a.id, chapitre: a.chapitre, texte: a.texte, statut: a.statut, confiance: { niveau: a.confiance, motif: a.confianceMotif }, versionConcernee: a.versionConcernee, remplaceePar: a.remplaceePar }));
    return { statut: 200, corps: { slug: f.slug, projetId: projet.id, total: toutes.length, debut: f.debut, affirmations, suivant: page.length && fin < toutes.length ? fin : null, ...lectureNonFiable(affirmations) } };
  };

  /**
   * V2-3 : texte et motif d'une affirmation viennent d'un agent qui a lu le web. Ils se rendent comme l'instantané
   * (données à citer, jamais à suivre) ; un motif d'injection est signalé, jamais refusé (l'Observatoire écrit sur l'injection).
   */
  const lectureNonFiable = (as: Array<Pick<Affirmation, "texte" | "confiance">>) => ({
    nonFiable: true, consigne: CONSIGNE_PASSAGE,
    injectionsSignalees: as.flatMap((a) => injectionsSignalees(`${a.texte}\n${a.confiance.motif}`)).slice(0, 20),
  });

  /** Affirmation de la base convertie vers le contrat (confiance et preuves incluses), pour `assemblerFiche`. */
  async function enContrat(c: string, a: Awaited<ReturnType<typeof base.listerAffirmations>>[number]): Promise<Affirmation> {
    const preuves = (await base.listerPreuves(c, a.id)).map((p) => ({ instantaneId: p.instantaneId, essaiId: p.essaiId, extraitExact: p.extraitExact, position: p.position }));
    return { id: a.id, projetId: a.projetId, chapitre: a.chapitre, texte: a.texte, statut: a.statut as Affirmation["statut"], confiance: { niveau: a.confiance, motif: a.confianceMotif }, versionConcernee: a.versionConcernee, remplaceePar: a.remplaceePar, preuves };
  }

  /**
   * Affirmations `[aff:<id>]` du corps lues en base (même entreprise) et sources qu'une preuve cite, parmi celles que la porte
   * accepte (sources du projet et base commune active, X1) : seules données publiées avec le corps.
   */
  async function donneesCitees(c: string, corps: string) {
    const ids = idsAffirmationsCitees(corps).filter((i) => RE_GUID.test(i));
    const brutes = await base.affirmationsParIds(c, ids);
    // DROIT-5.2 : chaque source publiée porte son auteur, à nommer avec la citation (CDE XI.189).
    type Publiee = { url: string; auteur: string | null };
    const enPubliee = (s: { id: string; urlCanonique: string; auteur?: string | null }): [string, Publiee] => [s.id, { url: s.urlCanonique, auteur: s.auteur ?? null }];
    const communes = (await base.sourcesCommunes(c)).map(enPubliee);
    const sources = new Map<string, { id: string } & Publiee>();
    const sourcesParAffirmation = new Map<string, Set<string>>();
    for (const a of brutes) {
      const duProjet = new Map([...communes, ...(await base.sourcesDuProjet(c, a.projetId)).map(enPubliee)]);
      for (const p of await base.listerPreuves(c, a.id)) {
        const inst = p.instantaneId ? await base.instantane(c, p.instantaneId) : null;
        const publiee = inst ? duProjet.get(inst.sourceId) : undefined;
        if (!inst || !publiee) continue;
        sources.set(inst.sourceId, { id: inst.sourceId, ...publiee });
        sourcesParAffirmation.set(a.id, (sourcesParAffirmation.get(a.id) ?? new Set()).add(inst.sourceId));
      }
    }
    const liste = [...sources.values()];
    const affirmations = brutes.map((a) => ({ id: a.id, texte: a.texte, statut: a.statut, chapitre: a.chapitre, sourceIds: liste.filter((s) => sourcesParAffirmation.get(a.id)?.has(s.id)).map((s) => s.id) }));
    return { brutes, affirmations, sources: liste };
  }

  routes["obs.publications.aexporter"] = async (r) => {
    const c = await exigerObservatoire(stock, r.companyId);
    exigerHumainLecture(r.acteur, "L'export des publications");
    let copiees = 0;
    // Approbations ACTUELLES (dossier, langue, numéro, empreinte) : une révision copiée dont l'approbation est tombée n'est plus publiable.
    const actuelles = new Map<string, string>(); // clé de révision → date d'approbation (X4 : verifieLe)
    // T7 : français d'abord, pour qu'une révision anglaise se rattache à la révision française approuvée qu'elle déclare.
    const enDernier = (r: RevisionApprouvee) => Number(lireCleObservatoire(r.cle)?.langue === "en");
    const numerosFr = new Map<string, number>(); // `<dossier>|<révision native française>` → numéro
    for (const rev of [...await d.approuvees(c)].sort((a, b) => enDernier(a) - enDernier(b))) {
      const k = lireCleObservatoire(rev.cle);
      // shortcut: un article a pour dossier un projet de slug `article-<numero>-<slug>` (déclaré comme une fiche) ; à remplacer si le magazine a sa propre table.
      const projet = k ? await base.projetParSlug(c, k.type === "article" ? `article-${k.numero}-${k.slug}` : k.slug) : null;
      if (!k || !projet) continue;
      const langue = k.langue;
      const empreinte = empreinteTexte(rev.corps);
      if (langue === "fr") numerosFr.set(`${projet.id}|${rev.revisionId}`, rev.numero);
      const baseFr = langue === "en" ? numerosFr.get(`${projet.id}|${RE_BASE_FR.exec(rev.corps)?.[1]}`) : null;
      // Révision anglaise d'une révision française autre que l'approuvée : filiation inconnue, ni copiée ni publiée.
      if (baseFr === undefined) continue;
      actuelles.set(`${projet.id}|${langue}|${rev.numero}|${empreinte}`, rev.approuveeLe);
      if (await base.lireRevision(c, projet.id, langue, rev.numero)) continue;
      if (await base.insererRevision(c, { dossierId: projet.id, langue, numero: rev.numero, baseRevisionFr: baseFr, contenuMd: rev.corps, empreinte, statut: "valide" })) copiees += 1;
    }
    const aPublier = [];
    for (const v of await base.revisionsSansPublication(c, "git")) {
      const approuveeLe = actuelles.get(`${v.dossierId}|${v.langue}|${v.numero}|${v.empreinte}`);
      if (approuveeLe === undefined) continue;
      // Jour de l'approbation humaine, stable d'un export à l'autre (X4) ; filiation : id de la révision française publiée (T7).
      const verifieLe = approuveeLe.slice(0, 10);
      const baseRevisionFr = v.langue === "en" && v.baseRevisionFr != null ? (await base.lireRevision(c, v.dossierId, "fr", v.baseRevisionFr))?.id ?? null : null;
      // Le slug (et le numéro d'article) viennent du serveur : le script d'export en construit le chemin, pas le fichier de l'appelant.
      const projet = await base.projetParId(c, v.dossierId);
      const art = projet ? /^article-(0|[1-9]\d*)-(.+)$/u.exec(projet.slug) : null;
      const { brutes, affirmations, sources } = await donneesCitees(c, v.contenuMd);
      // Une fiche (pas un article) porte la fiche structurée des seules affirmations citées par son corps approuvé.
      const fiche = projet && !art ? { fiche: assemblerFiche(projet, await Promise.all(brutes.filter((a) => a.projetId === projet.id).map((a) => enContrat(c, a))), await base.listerVersions(c, projet.id)) } : {};
      aPublier.push({ ...fiche, secondeDecision: await secondeDecision(c, v, Boolean(art)), id: v.id, dossierId: v.dossierId, slug: art ? art[2] : projet?.slug ?? null, articleNumero: art ? Number(art[1]) : null, langue: v.langue, numero: v.numero, empreinte: v.empreinte, contenuMd: v.contenuMd, affirmations, sources, verifieLe, baseRevisionFr });
    }
    return { statut: 200, corps: { copiees, aPublier } };
  };

  routes["obs.publications.marquer"] = async (r: RequeteRoute) => {
    const c = await exigerObservatoire(stock, r.companyId);
    exigerHumainLecture(r.acteur, "L'enregistrement d'une publication");
    const e = lire(Marquer, r.corps, "Publication");
    exigerMemeEntreprise(e.companyId, c);
    const v = (await base.revisionsSansPublication(c, "git")).find((x) => x.id === e.objet) ?? erreur("conflit", "Révision inconnue dans cette entreprise ou déjà publiée.");
    const projet = await base.projetParId(c, v.dossierId);
    const decision = await secondeDecision(c, v, Boolean(projet && /^article-(0|[1-9]\d*)-/u.test(projet.slug)));
    if (decision.requise && !decision.confirmee) {
      erreur("conflit", `Seconde décision humaine requise (${decision.motifs.join(", ")}) : confirmez la révision par POST /obs/publications/confirmer, puis enregistrez la publication.`);
    }
    const id = await base.insererPublication(c, { cible: "git", objet: e.objet, empreinteArtefact: e.empreinteArtefact, commitContenu: e.commitContenu, publieeLe: new Date().toISOString() });
    return { statut: 201, corps: { id } };
  };

  routes["obs.publications.confirmer"] = async (r: RequeteRoute) => {
    const c = await exigerObservatoire(stock, r.companyId);
    exigerHumainLecture(r.acteur, "La seconde décision de publication");
    const e = lire(Confirmer, r.corps, "Seconde décision de publication");
    exigerMemeEntreprise(e.companyId, c);
    if (!(await base.revisionsSansPublication(c, "git")).some((v) => v.id === e.objet)) erreur("conflit", "Révision inconnue dans cette entreprise ou déjà publiée.");
    await base.confirmerPublication(c, e.objet, r.acteur.userId ?? r.acteur.id);
    return { statut: 201, corps: { objet: e.objet, confirmee: true } };
  };

  /** INJ-9 : la première publication du site et tout article à lien externe exigent une seconde décision humaine. */
  async function secondeDecision(c: string, v: { id: string; contenuMd: string }, article: boolean) {
    const motifs = [
      ...((await base.publicationGitExiste(c)) ? [] : ["première publication du site"]),
      ...(article && RE_LIEN_EXTERNE.test(v.contenuMd) ? ["article avec lien externe"] : []),
    ];
    return { requise: motifs.length > 0, motifs, confirmee: await base.publicationConfirmee(c, v.id) };
  }

  return routes;
}
