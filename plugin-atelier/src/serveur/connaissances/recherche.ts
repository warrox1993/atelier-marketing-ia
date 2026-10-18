/**
 * Recherche hybride dans les connaissances d'un client (lot R4, `docs/rag-conception.md` §4.2, §5.1, §5.4).
 *
 * Ordre des opérations :
 * 1. filtres structurés dans le `WHERE` des deux recherches (`company_id` imposé par l'appelant, version
 *    active, statut `en_vigueur` par défaut, validité à la date de référence, type, produit, langue, mode) ;
 * 2. mots-clés : un `websearch_to_tsquery` par terme significatif (mots vides ignorés), en `french` ET en `dutch`,
 *    passage retenu s'il contient au moins la moitié des termes (arrondie au supérieur, minimum 1), classé par
 *    nombre de termes puis `ts_rank_cd` ;
 * 3. sens : vecteur de la question contre le cache des vecteurs de l'entreprise, restreint aux identifiants
 *    retenus par les filtres (produit scalaire exact) ;
 * 4. fusion RRF (k = 60) ; 5. seuil « aucune source » ; 6. passages rendus avec citation et consigne.
 *
 * Deux couches : (a) fonctions pures (fusion, seuil, citation, filtrage du cache), (b) `rechercherConnaissances`
 * qui reçoit un exécuteur de requêtes injecté `(sql, params) => Promise<lignes>` (en production : `ctx.db.query`).
 * Aucune route ici : le branchement est le lot R7.
 *
 * Contraintes de l'hôte respectées par chaque requête : une seule instruction `SELECT`/`WITH`, tables qualifiées
 * par l'espace du plugin, aucun des mots `insert`, `update`, `delete`, `alter`, `create`, `drop`, `truncate`
 * (même comme nom de colonne), vecteurs lus par `encode(vecteur, 'base64')`, dates lues en texte.
 */
import {
  CONSIGNE_PASSAGE,
  LIMITES_CONNAISSANCES,
  RechercherConnaissancesEntree,
  adresseConnaissance,
  type CitationConnaissance,
  type FournisseurVectorisation,
  type PassageRendu,
  type ResultatRechercheConnaissances,
  type StatutVersionConnaissance,
  type TypeDocumentConnaissance,
} from "../../contrats/connaissances.js";
import { IdNatif, type ModeExecution } from "../../contrats/communs.js";
import { ESPACE_BASE } from "../../contrats/identifiants.js";
import { creerMatrice, depuisBase64, normaliser, rechercheExacte, sansAccents, type Matrice } from "../../connaissances/vecteurs.js";
import { verifierEmpreinteIndex, type Vectoriseur } from "./vectorisation.js";

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

/** Constante de la fusion par rang réciproque (Cormack, Clarke et Büttcher, SIGIR 2009). */
export const K_RRF = 60 as const;

/** Candidats retenus par chacune des deux listes avant la fusion. */
export const CANDIDATS_PAR_LISTE = 50 as const;

/**
 * Seuils « aucune source ». VALEURS PROVISOIRES, à étalonner au lot R10 (§4.2 point 5) :
 * - `rrfMin` = 1/(60 + 20) : un passage doit figurer dans les 20 premiers d'au moins une liste ;
 * - `similariteMin` = 0,30 : produit scalaire minimal (cosinus, vecteurs normalisés) pour qu'un passage entre
 *   dans la liste « sens ». Sans ce plancher, la liste « sens » rendrait toujours ses voisins les plus proches,
 *   même hors sujet, et le seuil ne pourrait jamais conclure « aucune source ». La liste « mots-clés » n'a pas
 *   besoin de plancher : elle ne contient que des passages qui correspondent à la requête (`@@`).
 */
export const SEUILS_PROVISOIRES: SeuilsRecherche = Object.freeze({ rrfMin: 1 / (K_RRF + 20), similariteMin: 0.3 });

export const MOTIF_AUCUNE_SOURCE =
  "Aucune source trouvée dans les connaissances du client pour cette question : signaler l'information manquante, ne pas l'inventer.";

const TOLERANCE_EGALITE = 1e-12;
const MOTIF_INTERDIT = /\b(insert|update|delete|alter|create|drop|truncate)\b/;
const T_PASSAGES = `${ESPACE_BASE}.connaissances_passages`;
const T_VERSIONS = `${ESPACE_BASE}.connaissances_versions`;
const T_DOCUMENTS = `${ESPACE_BASE}.connaissances_documents`;
const T_INDEX = `${ESPACE_BASE}.connaissances_index`;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface SeuilsRecherche {
  rrfMin: number;
  similariteMin: number;
}

/** Exécuteur injecté : en production `ctx.db.query`, en test un faux. Requêtes paramétrées seulement. */
export type ExecuteurRequetes = (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

/** Ce que l'appelant impose (résolu par la route depuis la tâche) ; jamais lu dans l'entrée de l'agent. */
export interface ContexteRecherche {
  companyId: string;
  mode: ModeExecution;
}

export interface ElementClasse {
  id: string;
  score: number;
}

export interface ElementFusionne {
  id: string;
  rrf: number;
  rangTexte: number | null;
  rangSens: number | null;
}

/** Ligne de détail d'un passage, telle que lue par `requeteDetails`. */
export interface LignePassage {
  id: string;
  document_id: string;
  version: number;
  titre: string;
  type: TypeDocumentConnaissance;
  date_document: string;
  valide_du: string;
  valide_au: string | null;
  statut: StatutVersionConnaissance;
  page: number | null;
  section: string | null;
  empreinte: string;
  texte: string;
  injections_signalees: unknown;
}

export interface IndexActif {
  id: string;
  fournisseur: FournisseurVectorisation;
  modele: string | null;
  empreinteModele: string | null;
  dimension: number | null;
  versionIndex: number;
}

export type ResultatRecherche = Omit<ResultatRechercheConnaissances, "sourceIds">;

/* ------------------------------------------------------------------ */
/* (a) Fonctions pures                                                 */
/* ------------------------------------------------------------------ */

/**
 * Fusion RRF : score = Σ 1/(k + rang) sur les listes où le passage figure, rang à partir de 1. Les listes
 * sont supposées déjà triées (meilleur d'abord) ; un identifiant répété garde son premier rang.
 * Ordre de sortie : score décroissant ; à égalité (à 1e-12 près), meilleur rang le plus petit, puis présence
 * dans la liste mots-clés, puis identifiant croissant (ordre reproductible).
 */
export function fusionRrf(listeTexte: readonly string[], listeSens: readonly string[], k: number = K_RRF): ElementFusionne[] {
  const elements = new Map<string, ElementFusionne>();
  const ajouter = (liste: readonly string[], champ: "rangTexte" | "rangSens") => {
    let rang = 0;
    const vus = new Set<string>();
    for (const id of liste) {
      if (vus.has(id)) continue;
      vus.add(id);
      rang += 1;
      const e = elements.get(id) ?? { id, rrf: 0, rangTexte: null, rangSens: null };
      e[champ] = rang;
      e.rrf += 1 / (k + rang);
      elements.set(id, e);
    }
  };
  ajouter(listeTexte, "rangTexte");
  ajouter(listeSens, "rangSens");
  const meilleurRang = (e: ElementFusionne) => Math.min(e.rangTexte ?? Infinity, e.rangSens ?? Infinity);
  return [...elements.values()].sort((a, b) => {
    if (Math.abs(a.rrf - b.rrf) > TOLERANCE_EGALITE) return b.rrf - a.rrf;
    const ra = meilleurRang(a);
    const rb = meilleurRang(b);
    if (ra !== rb) return ra - rb;
    const ta = a.rangTexte === null ? 1 : 0;
    const tb = b.rangTexte === null ? 1 : 0;
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Garde les passages dont le score RRF atteint le seuil, dans la limite de `nombre`. */
export function appliquerSeuil(fusion: readonly ElementFusionne[], rrfMin: number, nombre: number): ElementFusionne[] {
  return fusion.filter((e) => e.rrf + TOLERANCE_EGALITE >= rrfMin).slice(0, nombre);
}

/** Construit la citation obligatoire d'un passage (§5.2) ; « périmé » ⇔ version hors vigueur. */
export function construireCitation(ligne: LignePassage): CitationConnaissance {
  return {
    adresse: adresseConnaissance(ligne.document_id, ligne.version, ligne.id),
    documentId: ligne.document_id,
    titre: ligne.titre,
    type: ligne.type,
    version: ligne.version,
    dateDocument: ligne.date_document,
    valideDu: ligne.valide_du,
    valideAu: ligne.valide_au,
    statut: ligne.statut,
    perime: ligne.statut !== "en_vigueur",
    page: ligne.page,
    section: ligne.section,
    empreintePassage: ligne.empreinte,
  };
}

/** Passage remis à un agent : donnée non fiable, consigne fixe, citation et classement. */
export function construirePassageRendu(ligne: LignePassage, classement: ElementFusionne): PassageRendu {
  const injections = Array.isArray(ligne.injections_signalees)
    ? ligne.injections_signalees.filter((x): x is string => typeof x === "string").slice(0, 20).map((x) => x.slice(0, 300))
    : [];
  return {
    nonFiable: true,
    consigne: CONSIGNE_PASSAGE,
    injectionsSignalees: injections,
    texte: ligne.texte.slice(0, LIMITES_CONNAISSANCES.passageTexteMax),
    citation: construireCitation(ligne),
    classement: { rrf: classement.rrf, rangTexte: classement.rangTexte, rangSens: classement.rangSens },
  };
}

/** Cache des vecteurs d'une entreprise pour un index donné. */
export interface EntreeCache {
  companyId: string;
  cle: string;
  ids: string[];
  positions: Map<string, number>;
  matrice: Matrice;
}

/**
 * Lignes du cache autorisées par les filtres : seuls les identifiants retenus par la requête filtrée
 * (déjà limitée à `company_id = $1`) et présents dans le cache. Ordre croissant des lignes.
 */
export function filtrerCache(entree: EntreeCache, idsRetenus: Iterable<string>): number[] {
  const lignes: number[] = [];
  for (const id of idsRetenus) {
    const ligne = entree.positions.get(id);
    if (ligne !== undefined) lignes.push(ligne);
  }
  return lignes.sort((a, b) => a - b);
}

/** Date du jour à Bruxelles (AAAA-MM-JJ). */
export function dateDuJourBruxelles(maintenant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    maintenant,
  );
}

/** Contrôle qu'une requête respecte la garde de l'hôte (`plugin-database.ts`) ; lève sinon. */
export function verifierRequeteLecture(sql: string): void {
  const n = sql.replace(/\s+/g, " ").trim().toLowerCase();
  if (!n.startsWith("select ") && !n.startsWith("with ")) throw new Error("Requête de lecture attendue (SELECT ou WITH)");
  if (n.includes(";")) throw new Error("Une seule instruction par requête");
  if (MOTIF_INTERDIT.test(n)) throw new Error("Mot réservé interdit dans une requête de lecture");
  if (!/\bcompany_id = \$1\b/.test(n)) throw new Error("Toute requête de connaissances filtre sur company_id = $1");
}

/* ------------------------------------------------------------------ */
/* Construction des requêtes                                           */
/* ------------------------------------------------------------------ */

export interface FiltresResolus {
  dateReference: string;
  inclurePerimes: boolean;
  types?: readonly string[];
  produits?: readonly string[];
  langues?: readonly string[];
  documentIds?: readonly string[];
}

/**
 * Jointures et `WHERE` communs. Paramètres fixes : $1 = entreprise, $2 = mode, $3 = date de référence ;
 * les filtres facultatifs suivent. Rend aussi le tableau de paramètres à compléter.
 */
export function construireFiltres(contexte: ContexteRecherche, filtres: FiltresResolus): { from: string; where: string; params: unknown[] } {
  const params: unknown[] = [contexte.companyId, contexte.mode, filtres.dateReference];
  const conditions = [
    "p.company_id = $1",
    "v.company_id = $1",
    "d.company_id = $1",
    "v.active",
    "d.mode = $2",
    "v.mode = $2",
  ];
  const enVigueur = "(v.valide_du <= $3::date AND (v.valide_au IS NULL OR v.valide_au > $3::date))";
  conditions.push(
    filtres.inclurePerimes ? `(v.statut <> 'en_vigueur' OR ${enVigueur})` : `v.statut = 'en_vigueur' AND ${enVigueur}`,
  );
  const liste = (valeurs: readonly string[] | undefined, colonne: string, typeSql: string) => {
    if (!valeurs || valeurs.length === 0) return;
    // L'hôte Paperclip étale un tableau JS en liste de paramètres : on passe donc du JSON.
    params.push(JSON.stringify([...valeurs]));
    conditions.push(`${colonne} IN (SELECT (jsonb_array_elements_text($${params.length}::jsonb))::${typeSql})`);
  };
  liste(filtres.types, "d.type", "text");
  liste(filtres.produits, "d.produit", "text");
  liste(filtres.langues, "p.langue", "text");
  liste(filtres.documentIds, "p.document_id", "uuid");
  const from =
    `${T_PASSAGES} p ` +
    `JOIN ${T_VERSIONS} v ON v.id = p.version_id AND v.company_id = p.company_id ` +
    `JOIN ${T_DOCUMENTS} d ON d.id = p.document_id AND d.company_id = p.company_id AND v.document_id = d.id AND d.corbeille_le IS NULL`;
  return { from, where: conditions.join(" AND "), params };
}

/** Index actif de l'entreprise (au plus un). */
export function requeteIndexActif(companyId: string): { sql: string; params: unknown[] } {
  return {
    sql:
      `SELECT i.id, i.fournisseur, i.modele, i.empreinte_modele, i.dimension, i.version_index ` +
      `FROM ${T_INDEX} i WHERE i.company_id = $1 AND i.actif LIMIT 1`,
    params: [companyId],
  };
}

/** Mots vides français ignorés dans la question (comparés sans accents, en minuscules). */
export const MOTS_VIDES_FRANCAIS: ReadonlySet<string> = new Set(
  ("a au aux avec ce ces cet cette ceux celle celles dans de des du elle elles en es est et eux il ils je la le les leur leurs lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous " +
    "y quel quelle quels quelles quoi dont comment combien quand pourquoi si sont suis sera etre ete avoir ai as avons avez ont fait faire peut peuvent doit doivent plus moins tres aussi entre chez sans sous vers d l s n c j m t")
    .split(/\s+/u),
);

/**
 * Termes significatifs d'une question : minuscules sans accents, découpée sur tout ce qui n'est ni lettre ni
 * chiffre, sans doublon, mots vides français et lettres isolées retirés. Si tout est retiré, on garde les mots
 * d'au moins deux caractères (la question n'est alors faite que de mots courants).
 */
export function termesSignificatifs(questionNormalisee: string): string[] {
  const mots = [...new Set(questionNormalisee.split(/[^\p{L}\p{N}]+/u).filter((m) => m.length > 0))];
  const utiles = mots.filter((m) => m.length >= 2 && !MOTS_VIDES_FRANCAIS.has(m));
  return utiles.length > 0 ? utiles : mots.filter((m) => m.length >= 2);
}

/** Seuil de correspondance : au moins la moitié des termes significatifs, arrondie au supérieur, et au moins 1. */
export function seuilTermes(nombreTermes: number): number {
  return Math.max(1, Math.ceil(nombreTermes / 2));
}

/**
 * Mots-clés, tolérants : chaque terme significatif devient une requête en français ET en néerlandais (réunion
 * des deux) ; un passage est retenu s'il en contient au moins `seuil`, classé par nombre de termes trouvés puis
 * par somme des `ts_rank_cd`, puis par identifiant. Les termes passent en JSON (l'hôte étale les tableaux).
 */
export function requeteMotsCles(
  contexte: ContexteRecherche,
  filtres: FiltresResolus,
  termes: readonly string[],
  limite: number,
): { sql: string; params: unknown[] } {
  const { from, where, params } = construireFiltres(contexte, filtres);
  params.push(JSON.stringify([...termes]));
  const q = params.length;
  params.push(seuilTermes(termes.length));
  const s = params.length;
  params.push(limite);
  const l = params.length;
  return {
    sql:
      `WITH t AS (SELECT websearch_to_tsquery('french', m.mot) || websearch_to_tsquery('dutch', m.mot) AS tsq ` +
      `FROM jsonb_array_elements_text($${q}::jsonb) AS m(mot)) ` +
      `SELECT p.id, c.nb AS nb, c.rang AS score FROM ${from} ` +
      `CROSS JOIN LATERAL (SELECT count(*) FILTER (WHERE p.tsv @@ t.tsq) AS nb, ` +
      `COALESCE(sum(ts_rank_cd(p.tsv, t.tsq)) FILTER (WHERE p.tsv @@ t.tsq), 0) AS rang FROM t) c ` +
      `WHERE ${where} AND c.nb >= $${s}::int ORDER BY c.nb DESC, score DESC, p.id ASC LIMIT $${l}`,
    params,
  };
}

/** Identifiants retenus par les filtres et vectorisés dans l'index actif (restriction de la recherche par le sens). */
export function requeteIdsFiltres(contexte: ContexteRecherche, filtres: FiltresResolus, indexId: string): { sql: string; params: unknown[] } {
  const { from, where, params } = construireFiltres(contexte, filtres);
  params.push(indexId);
  return {
    sql: `SELECT p.id FROM ${from} WHERE ${where} AND p.vecteur IS NOT NULL AND p.index_id = $${params.length}::uuid`,
    params,
  };
}

/** Page du cache des vecteurs (pagination par clé, `p.id` croissant). */
export function requetePageCache(companyId: string, indexId: string, apres: string | null, taille: number): { sql: string; params: unknown[] } {
  const params: unknown[] = [companyId, indexId, taille];
  let suite = "";
  if (apres !== null) {
    params.push(apres);
    suite = ` AND p.id > $4::uuid`;
  }
  return {
    sql:
      `SELECT p.id, encode(p.vecteur, 'base64') AS vecteur FROM ${T_PASSAGES} p ` +
      `WHERE p.company_id = $1 AND p.index_id = $2::uuid AND p.vecteur IS NOT NULL${suite} ORDER BY p.id ASC LIMIT $3`,
    params,
  };
}

/** Détails des passages choisis ; les filtres sont réappliqués (défense en profondeur). */
export function requeteDetails(contexte: ContexteRecherche, filtres: FiltresResolus, ids: readonly string[]): { sql: string; params: unknown[] } {
  const { from, where, params } = construireFiltres(contexte, filtres);
  params.push(JSON.stringify([...ids]));
  return {
    sql:
      `SELECT p.id, p.document_id, p.version, d.titre, d.type, ` +
      `to_char(v.date_document, 'YYYY-MM-DD') AS date_document, to_char(v.valide_du, 'YYYY-MM-DD') AS valide_du, ` +
      `to_char(v.valide_au, 'YYYY-MM-DD') AS valide_au, v.statut, p.page, p.section, p.empreinte, p.texte, p.injections_signalees ` +
      `FROM ${from} WHERE ${where} AND p.id IN (SELECT (jsonb_array_elements_text($${params.length}::jsonb))::uuid)`,
    params,
  };
}

/* ------------------------------------------------------------------ */
/* Cache des vecteurs, par entreprise                                  */
/* ------------------------------------------------------------------ */

/** Limites du cache des vecteurs (nombre d'entreprises et octets de vecteurs gardés en mémoire). */
export interface LimitesCacheVecteurs {
  entreprisesMax: number;
  octetsMax: number;
}

export const LIMITES_CACHE_VECTEURS: Readonly<LimitesCacheVecteurs> = Object.freeze({
  entreprisesMax: 32,
  octetsMax: 512 * 1024 * 1024,
});

/**
 * Cache en mémoire des vecteurs, indexé par entreprise ; la clé interne (index, version de l'index,
 * empreinte du modèle) le recharge dès qu'elle change. Une recherche ne lit que l'entrée de son entreprise.
 *
 * Borné : au-delà de `entreprisesMax` entrées ou de `octetsMax` octets de vecteurs, les entrées les
 * moins récemment lues sont retirées (elles seront rechargées depuis la base à la recherche suivante).
 * Une entrée plus grosse que `octetsMax` à elle seule n'est pas gardée.
 */
export class CacheVecteurs {
  /** Ordre d'insertion de la `Map` = ordre d'usage : la première entrée est la moins récemment lue. */
  private readonly entrees = new Map<string, EntreeCache>();
  private octets = 0;
  private readonly limites: LimitesCacheVecteurs;

  constructor(limites: Partial<LimitesCacheVecteurs> = {}) {
    this.limites = { ...LIMITES_CACHE_VECTEURS, ...limites };
  }

  obtenir(companyId: string, cle: string): EntreeCache | undefined {
    const e = this.entrees.get(companyId);
    if (!e || e.cle !== cle || e.companyId !== companyId) return undefined;
    this.entrees.delete(companyId);
    this.entrees.set(companyId, e);
    return e;
  }

  ranger(entree: EntreeCache): void {
    this.invalider(entree.companyId);
    const taille = entree.matrice.donnees.byteLength;
    if (taille > this.limites.octetsMax) return;
    while (this.entrees.size > 0 && (this.entrees.size >= this.limites.entreprisesMax || this.octets + taille > this.limites.octetsMax)) {
      this.invalider(this.entrees.keys().next().value as string);
    }
    this.entrees.set(entree.companyId, entree);
    this.octets += taille;
  }

  invalider(companyId: string): void {
    const e = this.entrees.get(companyId);
    if (!e) return;
    this.octets -= e.matrice.donnees.byteLength;
    this.entrees.delete(companyId);
  }

  vider(): void {
    this.entrees.clear();
    this.octets = 0;
  }

  entreprises(): string[] {
    return [...this.entrees.keys()];
  }
}

function cleCache(index: IndexActif, vectoriseur: Vectoriseur): string {
  return `${index.id}|${index.versionIndex}|${vectoriseur.empreinte ?? "aucun"}`;
}

async function chargerCache(
  executer: ExecuteurRequetes,
  companyId: string,
  index: IndexActif,
  dimension: number,
  cle: string,
): Promise<EntreeCache> {
  const ids: string[] = [];
  const vecteurs: Float32Array[] = [];
  let apres: string | null = null;
  for (;;) {
    const { sql, params } = requetePageCache(companyId, index.id, apres, LIMITES_CONNAISSANCES.pageCacheMax);
    verifierRequeteLecture(sql);
    const lignes = await executer(sql, params);
    for (const l of lignes) {
      ids.push(String(l.id));
      vecteurs.push(depuisBase64(String(l.vecteur), dimension));
    }
    if (lignes.length < LIMITES_CONNAISSANCES.pageCacheMax) break;
    apres = ids[ids.length - 1]!;
  }
  const matrice = creerMatrice(dimension, ids.length);
  vecteurs.forEach((v, i) => matrice.donnees.set(v, i * dimension));
  return { companyId, cle, ids, positions: new Map(ids.map((id, i) => [id, i])), matrice };
}

/**
 * Empreinte attendue du vectoriseur pour un index : l'empreinte des fichiers pour `local`,
 * `voyage:<modèle>:<dimension>` pour `voyage` (forme rendue par `creerVectoriseurVoyage`).
 */
export function empreinteAttendue(index: IndexActif): string | null {
  if (index.fournisseur === "aucun") return null;
  if (index.fournisseur === "local") return index.empreinteModele;
  return `voyage:${index.modele}:${index.dimension}`;
}

/* ------------------------------------------------------------------ */
/* (b) Recherche                                                       */
/* ------------------------------------------------------------------ */

export interface DependancesRecherche {
  executer: ExecuteurRequetes;
  vectoriseur: Vectoriseur;
  cache: CacheVecteurs;
  seuils?: SeuilsRecherche;
  maintenant?: () => Date;
}

function lireIndex(ligne: Record<string, unknown> | undefined): IndexActif | null {
  if (!ligne) return null;
  return {
    id: String(ligne.id),
    fournisseur: ligne.fournisseur as FournisseurVectorisation,
    modele: (ligne.modele as string | null) ?? null,
    empreinteModele: (ligne.empreinte_modele as string | null) ?? null,
    dimension: ligne.dimension === null || ligne.dimension === undefined ? null : Number(ligne.dimension),
    versionIndex: Number(ligne.version_index),
  };
}

/** Listes de candidats d'UNE base, avant la fusion (chaque liste déjà triée, meilleur d'abord). */
interface CandidatsBase {
  companyId: string;
  index: IndexActif | null;
  /** Mots-clés : nombre de termes trouvés puis somme des `ts_rank_cd` (même ordre que le SQL). */
  texte: Array<{ id: string; nb: number; score: number }>;
  /** Sens : produit scalaire (cosinus, vecteurs normalisés), au-dessus de `similariteMin`. */
  sens: Array<{ id: string; score: number }>;
}

/** Options de la recherche, résolues par la route (jamais par l'entrée de l'agent). */
export interface OptionsRecherche {
  /**
   * Base commune du groupe (décision du 18/10/2026) : l'entreprise Direction du même client, résolue côté
   * serveur depuis `services_entreprises`. Absente, nulle ou égale à l'entreprise de la tâche : une seule base.
   */
  baseCommune?: string | null;
}

/**
 * Candidats d'une base : index actif, liste mots-clés, liste sens. Toutes les requêtes sont bornées à
 * `ctx.companyId` (`company_id = $1`). `strict` : un modèle d'index différent du vectoriseur lève (base du
 * service, comportement d'origine) ; sinon la base est cherchée en plein texte seulement (base commune : son
 * index a pu être construit avec un autre modèle, et la configuration de la Direction n'est pas lisible pendant
 * une invocation portée par le service).
 */
async function candidatsDeBase(
  deps: DependancesRecherche,
  executer: ExecuteurRequetes,
  ctx: ContexteRecherche,
  filtres: FiltresResolus,
  termes: readonly string[],
  vecteurQuestion: () => Promise<Float32Array>,
  similariteMin: number,
  strict: boolean,
): Promise<CandidatsBase> {
  const ri = requeteIndexActif(ctx.companyId);
  const index = lireIndex((await executer(ri.sql, ri.params))[0]);

  let texte: CandidatsBase["texte"] = [];
  if (termes.length > 0) {
    const rm = requeteMotsCles(ctx, filtres, termes, CANDIDATS_PAR_LISTE);
    texte = (await executer(rm.sql, rm.params)).map((l) => ({ id: String(l.id), nb: Number(l.nb ?? 0) || 0, score: Number(l.score ?? 0) || 0 }));
  }

  let sens: CandidatsBase["sens"] = [];
  if (index && index.fournisseur !== "aucun" && deps.vectoriseur.type !== "aucun" && index.dimension) {
    let compatible = true;
    if (strict) verifierEmpreinteIndex(empreinteAttendue(index), deps.vectoriseur);
    else compatible = empreinteAttendue(index) === deps.vectoriseur.empreinte;
    if (compatible) {
      const cle = cleCache(index, deps.vectoriseur);
      let entreeCache = deps.cache.obtenir(ctx.companyId, cle);
      if (!entreeCache) {
        entreeCache = await chargerCache(executer, ctx.companyId, index, index.dimension, cle);
        deps.cache.ranger(entreeCache);
      }
      const rf = requeteIdsFiltres(ctx, filtres, index.id);
      const idsRetenus = (await executer(rf.sql, rf.params)).map((l) => String(l.id));
      const autorisees = filtrerCache(entreeCache, idsRetenus);
      if (autorisees.length > 0) {
        const requete = await vecteurQuestion();
        if (requete.length !== index.dimension) throw new Error("Vecteur de la question de dimension incorrecte");
        const ids = entreeCache.ids;
        sens = rechercheExacte(entreeCache.matrice, requete, CANDIDATS_PAR_LISTE, autorisees)
          .filter((r) => r.score >= similariteMin)
          .map((r) => ({ id: ids[r.ligne]!, score: r.score }));
      }
    }
  }
  return { companyId: ctx.companyId, index, texte, sens };
}

/**
 * Réunit les listes de plusieurs bases en UNE liste par méthode, triée par le score propre à la méthode, puis
 * une seule fusion RRF (`fusionRrf`, inchangée). Justification : un rang RRF n'a de sens que dans une liste ;
 * fusionner deux résultats RRF déjà calculés donnerait deux « premiers » ex aequo quelle que soit leur
 * pertinence. Les scores, eux, sont comparables d'une base à l'autre : le nombre de termes et `ts_rank_cd` ne
 * dépendent que du passage et de la requête (aucune statistique du corpus), le cosinus ne dépend que des deux
 * vecteurs (même vectoriseur, base commune sans vecteurs si son modèle diffère). Le classement obtenu est donc
 * celui d'une base unique qui contiendrait les deux corpus. Avec une seule base, les listes restent telles que le
 * SQL et la recherche exacte les rendent (comportement d'origine).
 */
function reunirListes(bases: readonly CandidatsBase[]): { listeTexte: string[]; listeSens: string[] } {
  if (bases.length === 1) return { listeTexte: bases[0]!.texte.map((x) => x.id), listeSens: bases[0]!.sens.map((x) => x.id) };
  const parId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const texte = bases.flatMap((b) => b.texte).sort((a, b) => b.nb - a.nb || b.score - a.score || parId(a, b));
  const sens = bases.flatMap((b) => b.sens).sort((a, b) => b.score - a.score || parId(a, b));
  return { listeTexte: texte.slice(0, CANDIDATS_PAR_LISTE).map((x) => x.id), listeSens: sens.slice(0, CANDIDATS_PAR_LISTE).map((x) => x.id) };
}

/**
 * Recherche hybride. `contexte` (entreprise, mode) vient de l'appelant, jamais de l'entrée ; l'entrée est
 * revalidée par `RechercherConnaissancesEntree` (strict : aucun champ en trop). Le résultat n'a pas encore
 * de `sourceIds` : la route (R7) enregistre les passages comme sources de la tâche puis les ajoute.
 *
 * `options.baseCommune` (résolue par la route) ajoute la base de la Direction du client : mêmes filtres, même
 * mode, chaque requête bornée à SON entreprise ; chaque passage porte alors sa `portee`. L'index rendu reste
 * celui de l'entreprise de la tâche.
 */
export async function rechercherConnaissances(
  deps: DependancesRecherche,
  contexte: ContexteRecherche,
  entreeBrute: unknown,
  options: OptionsRecherche = {},
): Promise<ResultatRecherche> {
  const debut = Date.now();
  const companyId = IdNatif.parse(contexte.companyId).toLowerCase();
  const ctx: ContexteRecherche = { companyId, mode: contexte.mode };
  const commune = options.baseCommune ? IdNatif.parse(options.baseCommune).toLowerCase() : null;
  const ctxCommun: ContexteRecherche | null = commune && commune !== companyId ? { companyId: commune, mode: contexte.mode } : null;
  const entree = RechercherConnaissancesEntree.parse(entreeBrute);
  const seuils = deps.seuils ?? SEUILS_PROVISOIRES;
  const filtres: FiltresResolus = {
    dateReference: entree.filtres.dateReference ?? dateDuJourBruxelles(deps.maintenant?.() ?? new Date()),
    inclurePerimes: entree.filtres.inclurePerimes,
    types: entree.filtres.types,
    produits: entree.filtres.produits,
    langues: entree.filtres.langues,
    documentIds: entree.filtres.documentIds,
  };
  const executer: ExecuteurRequetes = (sql, params) => {
    verifierRequeteLecture(sql);
    return deps.executer(sql, params);
  };
  // Vecteur de la question : calculé une fois, au premier besoin, partagé entre les bases.
  let vecteur: Promise<Float32Array> | null = null;
  const vecteurQuestion = () =>
    (vecteur ??= deps.vectoriseur.vectoriser([entree.question], "requete").then(([brut]) => {
      if (!brut) throw new Error("Vecteur de la question de dimension incorrecte");
      return normaliser(brut);
    }));

  const termes = termesSignificatifs(sansAccents(entree.question));
  const bases = [await candidatsDeBase(deps, executer, ctx, filtres, termes, vecteurQuestion, seuils.similariteMin, true)];
  if (ctxCommun) bases.push(await candidatsDeBase(deps, executer, ctxCommun, filtres, termes, vecteurQuestion, seuils.similariteMin, false));
  const index = bases[0]!.index;

  const { listeTexte, listeSens } = reunirListes(bases);
  const retenus = appliquerSeuil(fusionRrf(listeTexte, listeSens), seuils.rrfMin, entree.nombre);
  let passages: PassageRendu[] = [];
  if (retenus.length > 0) {
    // Détails lus base par base, chacun borné à son entreprise (filtres réappliqués) ; un identifiant n'est
    // cherché que dans la base qui l'a proposé.
    const details = new Map<string, { ligne: LignePassage; companyId: string }>();
    for (const b of bases) {
      const siens = new Set([...b.texte.map((x) => x.id), ...b.sens.map((x) => x.id)]);
      const ids = retenus.map((e) => e.id).filter((id) => siens.has(id));
      if (ids.length === 0) continue;
      const rd = requeteDetails({ companyId: b.companyId, mode: ctx.mode }, filtres, ids);
      for (const l of await executer(rd.sql, rd.params)) {
        if (!details.has(String(l.id))) details.set(String(l.id), { ligne: l as unknown as LignePassage, companyId: b.companyId });
      }
    }
    passages = retenus.flatMap((e) => {
      const d = details.get(e.id);
      if (!d) return [];
      const rendu = construirePassageRendu(d.ligne, e);
      return [ctxCommun ? { ...rendu, portee: d.companyId === companyId ? ("service" as const) : ("commune" as const) } : rendu];
    });
  }

  const indexRendu =
    index === null ? null : { id: index.id, fournisseur: index.fournisseur, modele: index.modele, versionIndex: index.versionIndex };
  return {
    question: entree.question,
    passages,
    aucuneSource: passages.length === 0,
    motifAucuneSource: passages.length === 0 ? MOTIF_AUCUNE_SOURCE : null,
    index: indexRendu,
    dureeMs: Math.max(0, Date.now() - debut),
  };
}
