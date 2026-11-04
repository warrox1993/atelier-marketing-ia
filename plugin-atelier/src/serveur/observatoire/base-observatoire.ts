/**
 * Dépôt SQL de l'Observatoire (tables de la migration 023). Lectures par `db.query`, écritures par `db.execute`,
 * toutes les requêtes paramétrées, `company_id` toujours en premier paramètre ($1).
 */
import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { ResultatCollecte, VersionRelevee } from "./collecte.js";
import type { LimitesSource } from "./regles-porte-obs.js";

type Ligne = Record<string, unknown>;

/** FR-032 : une source passe « en échec » au 5e échec consécutif. */
export const SEUIL_ECHECS_CONSECUTIFS = 5;

export type TypeAlias = "github" | "npm" | "pypi" | "site" | "nom";
export type Projet = { id: string; slug: string; nom: string; editeur: string | null; depotCanonique: string | null; statutEditorial: string };
export type Alias = { id: string; projetId: string; type: TypeAlias; valeur: string };
export type Source = { id: string; urlCanonique: string; type: string; etag: string | null; controleLe: string | null; echecsConsecutifs: number; enEchec: boolean; autorisee: boolean; auteur: string | null } & LimitesSource;

/** O1 : décision de droits de collecte (K4 non fixée) ; seule une autorisation explicite compte, tout le reste est refusé. */
const AUTORISEE = `'{"autorisee": true}'::jsonb`;
const estAutorisee = (politique: unknown): boolean => (politique as { autorisee?: unknown } | null)?.autorisee === true;
/** DROIT-5.1 : plafonds K4 fixés par l'humain dans politique_collecte (entier positif), sinon null (défaut de la porte). */
const entierPositif = (v: unknown): number | null => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : null);
const limites = (politique: unknown): LimitesSource => {
  const p = politique as { extraitMax?: unknown; cumulMax?: unknown } | null;
  return { extraitMax: entierPositif(p?.extraitMax), cumulMax: entierPositif(p?.cumulMax) };
};
/** DROIT-5.2 : auteur de la source fixé par l'humain dans politique_collecte (texte non vide), sinon null. */
const auteurDe = (politique: unknown): string | null => {
  const a = (politique as { auteur?: unknown } | null)?.auteur;
  return typeof a === "string" && a.trim() !== "" ? a : null;
};
/** Source de la base commune (migration 025) : citable par tout article de l'entreprise si elle est active. */
export type EtatSource = "active" | "candidate" | "en_sommeil" | "suspecte";
/** `joignabilite` : l'adresse répondait-elle au recensement (A, B, C) ; jamais une note de fiabilité (LIV-OB-7). */
export type SourceCommuneImportee = { url: string; type: string; joignabilite: "A" | "B" | "C" | null; langue: string | null; pays: string | null; sujets: string[]; auteur: string | null };
export type SourceCommuneProposee = { url: string; type: string; motif: string; langue: string | null; pays: string | null; sujets: string[] };
export type SourceCommune = { id: string; url: string; type: string; joignabilite: string | null; langue: string | null; pays: string | null; sujets: string[]; etat: EtatSource };
export type FiltresSourcesCommunes = { langue?: string; pays?: string; type?: string; sujet?: string; debut: number; limite: number };
export type Instantane = { id: string; sourceId: string; empreinteSha256: string; recupereLe: string; texteNormalise: string; versionDetectee: string | null; injectionsSignalees?: string[] | null };
export type NouvelleAffirmation = { projetId: string; chapitre: string; texte: string; statut: string; confiance: number; confianceMotif: string; versionConcernee: string | null };
export type Affirmation = NouvelleAffirmation & { id: string; remplaceePar: string | null };
export type NouvellePreuve = { affirmationId: string; instantaneId: string | null; essaiId: string | null; extraitExact: string; position: number };
export type Preuve = NouvellePreuve & { id: string };
export type NouvelleRevision = { dossierId: string; langue: "fr" | "en"; numero: number; baseRevisionFr: number | null; contenuMd: string; empreinte: string; statut: string };
export type Revision = NouvelleRevision & { id: string; revisionNativeId: string | null; publieeLe: string | null };
export type NouvellePublication = { cible: "git" | "pdf" | "index"; objet: string; empreinteArtefact: string; commitContenu: string | null; publieeLe: string };

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
const texte = (v: unknown): string | null => (v == null ? null : String(v));

export function baseObservatoire(db: PluginContext["db"], ns: string) {
  const q = (sql: string, params: unknown[]) => db.query<Ligne>(sql, params);
  const x = (sql: string, params: unknown[]) => db.execute(sql, params);
  const t = (nom: string) => `${ns}.${nom}`;

  const versProjet = (r: Ligne): Projet => ({ id: String(r.id), slug: String(r.slug), nom: String(r.nom), editeur: texte(r.editeur), depotCanonique: texte(r.depot_canonique), statutEditorial: String(r.statut_editorial) });

  const versAffirmation = (r: Ligne): Affirmation => ({ id: String(r.id), projetId: String(r.projet_id), chapitre: String(r.chapitre), texte: String(r.texte), statut: String(r.statut), confiance: Number(r.confiance), confianceMotif: String(r.confiance_motif), versionConcernee: texte(r.version_concernee), remplaceePar: texte(r.remplacee_par) });

  async function projetParSlug(companyId: string, slug: string): Promise<Projet | null> {
    const lignes = await q(`select id, slug, nom, editeur, depot_canonique, statut_editorial from ${t("obs_projets")} where company_id = $1 and slug = $2`, [companyId, slug]);
    return lignes[0] ? versProjet(lignes[0]) : null;
  }

  async function creerProjet(companyId: string, p: { slug: string; nom: string; editeur?: string | null; depotCanonique?: string | null; statutEditorial: string }): Promise<string> {
    const id = randomUUID();
    await x(
      `insert into ${t("obs_projets")} (company_id, id, slug, nom, editeur, depot_canonique, statut_editorial) values ($1, $2, $3, $4, $5, $6, $7)`,
      [companyId, id, p.slug, p.nom, p.editeur ?? null, p.depotCanonique ?? null, p.statutEditorial],
    );
    return id;
  }

  /** Renvoie false si l'alias existe déjà pour cette entreprise. */
  async function ajouterAlias(companyId: string, projetId: string, type: TypeAlias, valeur: string): Promise<boolean> {
    const { rowCount } = await x(
      `insert into ${t("obs_alias")} (company_id, id, projet_id, type, valeur) values ($1, $2, $3, $4, $5) on conflict (company_id, type, valeur) do nothing`,
      [companyId, randomUUID(), projetId, type, valeur],
    );
    return rowCount === 1;
  }

  /** Enregistre une source collectable ; renvoie l'id (existant ou nouveau) pour (entreprise, URL canonique). */
  async function enregistrerSource(companyId: string, urlCanonique: string, type: string): Promise<string> {
    await x(
      `insert into ${t("obs_sources")} (company_id, id, url_canonique, type) values ($1, $2, $3, $4) on conflict (company_id, url_canonique) do nothing`,
      [companyId, randomUUID(), urlCanonique, type],
    );
    // Seules les routes humaines déclarent une source de projet : elle est examinée, donc autorisée (O1).
    await x(`update ${t("obs_sources")} set politique_collecte = politique_collecte || ${AUTORISEE} where company_id = $1 and url_canonique = $2`, [companyId, urlCanonique]);
    const lignes = await q(`select id from ${t("obs_sources")} where company_id = $1 and url_canonique = $2`, [companyId, urlCanonique]);
    return String(lignes[0]?.id);
  }

  /** Projet auquel un alias canonique est déjà relié dans l'entreprise ; null s'il est libre. */
  async function projetDeAlias(companyId: string, type: TypeAlias, valeur: string): Promise<string | null> {
    const lignes = await q(`select projet_id from ${t("obs_alias")} where company_id = $1 and type = $2 and valeur = $3`, [companyId, type, valeur]);
    return lignes[0] ? String(lignes[0].projet_id) : null;
  }

  /**
   * Import humain (idempotent) : la source devient commune ; une NOUVELLE entre candidate (listée, non citable) et devient
   * active à sa première lecture réussie (enregistrerCollecte) ; une source existante garde son type et son état (jamais supprimée).
   * shortcut: la colonne garde son nom `fiabilite` (migration 025), lue et écrite comme `joignabilite` ; la renommer par migration si on la refond.
   */
  async function importerSourcesCommunes(companyId: string, liste: SourceCommuneImportee[]): Promise<void> {
    for (const s of liste) {
      await x(
        `insert into ${t("obs_sources")} (company_id, id, url_canonique, type, commune, fiabilite, langue, pays, sujets, etat, ajoutee_par, ajoutee_le, politique_collecte) values ($1, $2, $3, $4, true, $5, $6, $7, $8::jsonb, 'candidate', 'humain', now(), ${AUTORISEE} || jsonb_strip_nulls(jsonb_build_object('auteur', $9::text))) on conflict (company_id, url_canonique) do update set commune = true, politique_collecte = obs_sources.politique_collecte || ${AUTORISEE} || jsonb_strip_nulls(jsonb_build_object('auteur', $9::text)), fiabilite = excluded.fiabilite, langue = excluded.langue, pays = excluded.pays, sujets = excluded.sujets`,
        [companyId, randomUUID(), s.url, s.type, s.joignabilite, s.langue, s.pays, JSON.stringify(s.sujets), s.auteur],
      );
    }
  }

  /** Proposition d'une source NOUVELLE (candidate) ; false si l'URL existe déjà, qui n'est alors pas modifiée. */
  async function proposerSourceCommune(companyId: string, s: SourceCommuneProposee, ajouteePar: string): Promise<boolean> {
    const { rowCount } = await x(
      `insert into ${t("obs_sources")} (company_id, id, url_canonique, type, commune, langue, pays, sujets, etat, motif, ajoutee_par, ajoutee_le) values ($1, $2, $3, $4, true, $5, $6, $7::jsonb, 'candidate', $8, $9, now()) on conflict (company_id, url_canonique) do nothing`,
      [companyId, randomUUID(), s.url, s.type, s.langue, s.pays, JSON.stringify(s.sujets), s.motif, ajouteePar],
    );
    return rowCount === 1;
  }

  /** V2-7 : décision humaine ; la source reste dans la base (listée), n'est plus citable et aucune collecte ne change son état. */
  async function suspecterSources(companyId: string, urls: string[], motif: string): Promise<number> {
    const { rowCount } = await x(
      `update ${t("obs_sources")} set etat = 'suspecte', etat_motif = $3, etat_le = now() where company_id = $1 and commune and url_canonique in (select jsonb_array_elements_text($2::jsonb))`,
      [companyId, JSON.stringify(urls), motif],
    );
    return rowCount ?? 0;
  }

  /** Nombre de sources déjà proposées par un même run (`ajoutee_par`), pour le plafond par run. */
  async function propositionsDuRun(companyId: string, ajouteePar: string): Promise<number> {
    const [r] = await q(`select count(*) as n from ${t("obs_sources")} where company_id = $1 and ajoutee_par = $2`, [companyId, ajouteePar]);
    return Number(r?.n ?? 0);
  }

  /** Une candidate lue avec succès devient active. */
  async function activerSource(companyId: string, url: string): Promise<void> {
    await x(`update ${t("obs_sources")} set etat = 'active', etat_motif = null, etat_le = now() where company_id = $1 and url_canonique = $2 and etat = 'candidate'`, [companyId, url]);
  }

  /** Sources communes citables par la porte : actives seulement (une candidate ou une source en sommeil ne l'est pas). */
  async function sourcesCommunes(companyId: string): Promise<Array<{ id: string; urlCanonique: string; type: string; autorisee: boolean; auteur: string | null } & LimitesSource>> {
    const lignes = await q(`select s.id, s.url_canonique, s.type, s.politique_collecte from ${t("obs_sources")} s where s.company_id = $1 and s.commune and s.etat = 'active'`, [companyId]);
    return lignes.map((r) => ({ id: String(r.id), urlCanonique: String(r.url_canonique), type: String(r.type), autorisee: estAutorisee(r.politique_collecte), auteur: auteurDe(r.politique_collecte), ...limites(r.politique_collecte) }));
  }

  /** Liste paginée de la base commune (toutes les sources, candidates et en sommeil comprises), filtres optionnels. */
  async function listerSourcesCommunes(companyId: string, f: FiltresSourcesCommunes): Promise<{ total: number; sources: SourceCommune[] }> {
    const lignes = await q(
      `select id, url_canonique, type, fiabilite, langue, pays, sujets, etat, count(*) over () as total from ${t("obs_sources")} where company_id = $1 and commune and ($2::text is null or langue = $2) and ($3::text is null or pays = $3) and ($4::text is null or type = $4) and ($5::text is null or sujets @> jsonb_build_array($5::text)) order by url_canonique limit $6 offset $7`,
      [companyId, f.langue ?? null, f.pays ?? null, f.type ?? null, f.sujet ?? null, f.limite, f.debut],
    );
    // shortcut: une page vide au-delà de la fin renvoie total 0 (fenêtre sans ligne) ; suffit à la pagination par `suivant`.
    return {
      total: Number(lignes[0]?.total ?? 0),
      sources: lignes.map((r) => ({ id: String(r.id), url: String(r.url_canonique), type: String(r.type), joignabilite: texte(r.fiabilite), langue: texte(r.langue), pays: texte(r.pays), sujets: Array.isArray(r.sujets) ? r.sujets.map(String) : [], etat: String(r.etat) as EtatSource })),
    };
  }

  async function listerAlias(companyId: string, projetId: string): Promise<Alias[]> {
    const lignes = await q(`select id, projet_id, type, valeur from ${t("obs_alias")} where company_id = $1 and projet_id = $2 order by type, valeur`, [companyId, projetId]);
    return lignes.map((r) => ({ id: String(r.id), projetId: String(r.projet_id), type: r.type as TypeAlias, valeur: String(r.valeur) }));
  }

  /** Les sources d'un projet sont celles dont l'URL canonique est la valeur d'un de ses alias (aucune clé directe dans le schéma). */
  const COLONNES_SOURCE = "s.id, s.url_canonique, s.type, s.etag, s.controle_le, s.echecs_consecutifs, s.en_echec, s.politique_collecte";
  const versSource = (r: Ligne): Source => ({ id: String(r.id), urlCanonique: String(r.url_canonique), type: String(r.type), etag: texte(r.etag), controleLe: iso(r.controle_le), echecsConsecutifs: Number(r.echecs_consecutifs), enEchec: r.en_echec === true, autorisee: estAutorisee(r.politique_collecte), auteur: auteurDe(r.politique_collecte), ...limites(r.politique_collecte) });

  async function sourcesDuProjet(companyId: string, projetId: string): Promise<Source[]> {
    const lignes = await q(
      `select ${COLONNES_SOURCE} from ${t("obs_sources")} s where s.company_id = $1 and s.url_canonique in (select a.valeur from ${t("obs_alias")} a where a.company_id = $1 and a.projet_id = $2) order by s.url_canonique`,
      [companyId, projetId],
    );
    return lignes.map(versSource);
  }

  /** T6 : sources de la base commune désignées par leur URL, pour une collecte ciblée ; une suspecte (décision humaine) n'est jamais relue. */
  async function sourcesCommunesParUrl(companyId: string, urls: string[]): Promise<Source[]> {
    const lignes = await q(
      `select ${COLONNES_SOURCE} from ${t("obs_sources")} s where s.company_id = $1 and s.commune and s.etat <> 'suspecte' and s.url_canonique = any($2::text[]) order by s.url_canonique`,
      [companyId, urls],
    );
    return lignes.map(versSource);
  }

  async function enregistrerCollecte(companyId: string, sourceId: string, r: ResultatCollecte): Promise<void> {
    const table = t("obs_sources");
    // Une lecture réussie réveille une source en sommeil et active une candidate ; une suspecte (décision humaine, V2-7) ne bouge pas.
    const REVEIL = "etat = case when etat = 'suspecte' then etat else 'active' end, etat_motif = case when etat = 'suspecte' then etat_motif end, "
      + "etat_le = case when etat in ('active', 'suspecte') then etat_le else now() end";
    switch (r.etat) {
      case "nouveau": {
        if (!r.texteNormalise || !r.empreinte) throw new Error("Collecte « nouveau » sans texte normalisé ni empreinte");
        await x(
          `insert into ${t("obs_instantanes")} (company_id, id, source_id, empreinte_sha256, recupere_le, texte_normalise, injections_signalees) values ($1, $2, $3, $4, now(), $5, $6::jsonb) on conflict (source_id, empreinte_sha256) do nothing`,
          [companyId, randomUUID(), sourceId, r.empreinte, r.texteNormalise, JSON.stringify(r.injections ?? [])],
        );
        await x(`update ${table} set controle_le = now(), echecs_consecutifs = 0, en_echec = false, ${REVEIL}, etag = coalesce($3, etag) where company_id = $1 and id = $2`, [companyId, sourceId, r.etag ?? null]);
        return;
      }
      case "inchange":
        await x(`update ${table} set controle_le = now(), echecs_consecutifs = 0, en_echec = false, ${REVEIL} where company_id = $1 and id = $2`, [companyId, sourceId]);
        return;
      case "echec":
        await x(
          `update ${table} set controle_le = now(), echecs_consecutifs = echecs_consecutifs + 1, en_echec = (echecs_consecutifs + 1 >= $3), `
          // Base cumulative : une source injoignable passe en sommeil, avec motif et date ; elle n'est jamais supprimée.
          + `etat = case when etat = 'suspecte' then etat when echecs_consecutifs + 1 >= $3 then 'en_sommeil' else etat end, `
          + `etat_motif = case when etat = 'suspecte' then etat_motif when echecs_consecutifs + 1 >= $3 then 'injoignable : ' || (echecs_consecutifs + 1) || ' échecs consécutifs' else etat_motif end, `
          + `etat_le = case when etat = 'suspecte' then etat_le when echecs_consecutifs + 1 >= $3 and etat <> 'en_sommeil' then now() else etat_le end where company_id = $1 and id = $2`,
          [companyId, sourceId, SEUIL_ECHECS_CONSECUTIFS],
        );
        return;
      default: // quota, refuse : pas une panne de la source
        await x(`update ${table} set controle_le = now() where company_id = $1 and id = $2`, [companyId, sourceId]);
    }
  }

  async function enregistrerVersions(companyId: string, projetId: string, versions: VersionRelevee[]): Promise<void> {
    for (const v of versions) {
      await x(
        `insert into ${t("obs_versions")} (company_id, id, projet_id, version, publiee_le, prerelease) values ($1, $2, $3, $4, $5, $6) on conflict (projet_id, version) do nothing`,
        [companyId, randomUUID(), projetId, v.version, v.publieeLe, v.prerelease],
      );
    }
  }

  async function insererAffirmation(companyId: string, a: NouvelleAffirmation): Promise<string> {
    const id = randomUUID();
    await x(
      `insert into ${t("obs_affirmations")} (company_id, id, projet_id, chapitre, texte, statut, confiance, confiance_motif, version_concernee) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [companyId, id, a.projetId, a.chapitre, a.texte, a.statut, a.confiance, a.confianceMotif, a.versionConcernee],
    );
    return id;
  }

  /** LIV-OB-11 : marque une affirmation inexacte remplacée par la nouvelle (jamais effacée) ; false si déjà remplacée ou absente. */
  async function remplacerAffirmation(companyId: string, ancienneId: string, nouvelleId: string): Promise<boolean> {
    const { rowCount } = await x(`update ${t("obs_affirmations")} set remplacee_par = $3 where company_id = $1 and id = $2 and remplacee_par is null`, [companyId, ancienneId, nouvelleId]);
    return rowCount === 1;
  }

  async function listerAffirmations(companyId: string, projetId: string): Promise<Affirmation[]> {
    const lignes = await q(
      `select id, projet_id, chapitre, texte, statut, confiance, confiance_motif, version_concernee, remplacee_par from ${t("obs_affirmations")} where company_id = $1 and projet_id = $2 order by chapitre, cree_le, id`,
      [companyId, projetId],
    );
    return lignes.map(versAffirmation);
  }

  /** Affirmations citées par un livrable : filtrées par entreprise, les identifiants inconnus sont simplement absents (liste en JSON : l'hôte aplatit les tableaux). */
  async function affirmationsParIds(companyId: string, ids: string[]): Promise<Affirmation[]> {
    if (ids.length === 0) return [];
    const lignes = await q(
      `select id, projet_id, chapitre, texte, statut, confiance, confiance_motif, version_concernee, remplacee_par from ${t("obs_affirmations")} where company_id = $1 and id::text in (select jsonb_array_elements_text($2::jsonb)) order by chapitre, cree_le, id`,
      // RE_GUID accepte les majuscules, id::text est toujours en minuscules.
      [companyId, JSON.stringify(ids.map((i) => i.toLowerCase()))],
    );
    return lignes.map(versAffirmation);
  }

  /** Versions connues (obs_versions) des projets donnés. */
  async function versionsConnues(companyId: string, projetIds: string[]): Promise<string[]> {
    if (projetIds.length === 0) return [];
    const lignes = await q(`select version from ${t("obs_versions")} where company_id = $1 and projet_id::text in (select jsonb_array_elements_text($2::jsonb)) order by version`, [companyId, JSON.stringify(projetIds)]);
    return lignes.map((r) => String(r.version));
  }

  async function insererPreuve(companyId: string, p: NouvellePreuve): Promise<string> {
    const id = randomUUID();
    await x(
      `insert into ${t("obs_preuves")} (company_id, id, affirmation_id, instantane_id, essai_id, extrait_exact, position) values ($1, $2, $3, $4, $5, $6, $7)`,
      [companyId, id, p.affirmationId, p.instantaneId, p.essaiId, p.extraitExact, p.position],
    );
    return id;
  }

  const preuveDe = (r: Record<string, unknown>): Preuve => ({ id: String(r.id), affirmationId: String(r.affirmation_id), instantaneId: texte(r.instantane_id), essaiId: texte(r.essai_id), extraitExact: String(r.extrait_exact), position: Number(r.position) });
  const instantaneDe = (r: Record<string, unknown>): Instantane => ({ id: String(r.id), sourceId: String(r.source_id), empreinteSha256: String(r.empreinte_sha256), recupereLe: iso(r.recupere_le) ?? "", texteNormalise: String(r.texte_normalise), versionDetectee: texte(r.version_detectee), injectionsSignalees: Array.isArray(r.injections_signalees) ? r.injections_signalees.filter((x): x is string => typeof x === "string") : null });
  const COLONNES_INSTANTANE = "id, source_id, empreinte_sha256, recupere_le, texte_normalise, version_detectee, injections_signalees";

  async function listerPreuves(companyId: string, affirmationId: string): Promise<Preuve[]> {
    const lignes = await q(`select id, affirmation_id, instantane_id, essai_id, extrait_exact, position from ${t("obs_preuves")} where company_id = $1 and affirmation_id = $2 order by position`, [companyId, affirmationId]);
    return lignes.map(preuveDe);
  }

  /** O9 : preuves de plusieurs affirmations en une requête (tableau passé en JSON : l'hôte étale les tableaux). */
  async function preuvesDe(companyId: string, affirmationIds: string[]): Promise<Preuve[]> {
    if (affirmationIds.length === 0) return [];
    const lignes = await q(
      `select id, affirmation_id, instantane_id, essai_id, extrait_exact, position from ${t("obs_preuves")} where company_id = $1 and affirmation_id::text in (select jsonb_array_elements_text($2::jsonb)) order by affirmation_id, position`,
      [companyId, JSON.stringify(affirmationIds)],
    );
    return lignes.map(preuveDe);
  }

  async function instantane(companyId: string, id: string): Promise<Instantane | null> {
    const lignes = await q(`select ${COLONNES_INSTANTANE} from ${t("obs_instantanes")} where company_id = $1 and id = $2`, [companyId, id]);
    return lignes[0] ? instantaneDe(lignes[0]) : null;
  }

  /** O9 : instantanés désignés par une liste d'identifiants, en une requête. */
  async function instantanesParIds(companyId: string, ids: string[]): Promise<Instantane[]> {
    if (ids.length === 0) return [];
    const lignes = await q(`select ${COLONNES_INSTANTANE} from ${t("obs_instantanes")} where company_id = $1 and id::text in (select jsonb_array_elements_text($2::jsonb))`, [companyId, JSON.stringify(ids)]);
    return lignes.map(instantaneDe);
  }

  /** Dernier instantané d'une source (ou celui d'une empreinte donnée) ; null si la source n'en a aucun. */
  async function dernierInstantaneId(companyId: string, sourceId: string, empreinte?: string): Promise<string | null> {
    const lignes = await q(
      `select id from ${t("obs_instantanes")} where company_id = $1 and source_id = $2 and ($3::text is null or empreinte_sha256 = $3) order by recupere_le desc, id limit 1`,
      [companyId, sourceId, empreinte ?? null],
    );
    return lignes[0] ? String(lignes[0].id) : null;
  }

  async function urlDeSource(companyId: string, sourceId: string): Promise<string | null> {
    const lignes = await q(`select url_canonique from ${t("obs_sources")} where company_id = $1 and id = $2`, [companyId, sourceId]);
    return lignes[0] ? String(lignes[0].url_canonique) : null;
  }

  /** EXP-C6 : null si (dossier, langue, numéro) est déjà copiée (deux exports simultanés) ; une révision copiée n'est jamais modifiée (SKMK-O1). */
  async function insererRevision(companyId: string, r: NouvelleRevision): Promise<string | null> {
    const id = randomUUID();
    const { rowCount } = await x(
      `insert into ${t("obs_revisions")} (company_id, id, dossier_id, langue, numero, base_revision_fr, contenu_md, empreinte, statut) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (dossier_id, langue, numero) do nothing`,
      [companyId, id, r.dossierId, r.langue, r.numero, r.baseRevisionFr, r.contenuMd, r.empreinte, r.statut],
    );
    return rowCount === 1 ? id : null;
  }

  async function projetParId(companyId: string, id: string): Promise<Projet | null> {
    const lignes = await q(`select id, slug, nom, editeur, depot_canonique, statut_editorial from ${t("obs_projets")} where company_id = $1 and id = $2`, [companyId, id]);
    return lignes[0] ? versProjet(lignes[0]) : null;
  }

  async function listerVersions(companyId: string, projetId: string): Promise<VersionRelevee[]> {
    const lignes = await q(`select version, publiee_le, prerelease from ${t("obs_versions")} where company_id = $1 and projet_id = $2 order by version`, [companyId, projetId]);
    return lignes.map((r) => ({ version: String(r.version), publieeLe: iso(r.publiee_le), prerelease: r.prerelease === true }));
  }

  const COLONNES_REVISION = "id, dossier_id, langue, numero, base_revision_fr, contenu_md, empreinte, statut, revision_native_id, publiee_le";
  const versRevision = (r: Ligne): Revision => ({ id: String(r.id), dossierId: String(r.dossier_id), langue: r.langue as "fr" | "en", numero: Number(r.numero), baseRevisionFr: r.base_revision_fr == null ? null : Number(r.base_revision_fr), contenuMd: String(r.contenu_md), empreinte: String(r.empreinte), statut: String(r.statut), revisionNativeId: texte(r.revision_native_id), publieeLe: iso(r.publiee_le) });

  /** Révisions copiées qui n'ont encore aucune publication de cette cible (`objet` = identifiant de la révision). */
  async function revisionsSansPublication(companyId: string, cible: NouvellePublication["cible"]): Promise<Revision[]> {
    const lignes = await q(
      `select ${COLONNES_REVISION} from ${t("obs_revisions")} r where r.company_id = $1 and not exists (select 1 from ${t("obs_publications")} p where p.company_id = $1 and p.cible = $2 and p.objet = r.id::text) order by r.dossier_id, r.langue, r.numero`,
      [companyId, cible],
    );
    return lignes.map(versRevision);
  }

  async function lireRevision(companyId: string, dossierId: string, langue: "fr" | "en", numero: number): Promise<Revision | null> {
    const lignes = await q(
      `select ${COLONNES_REVISION} from ${t("obs_revisions")} where company_id = $1 and dossier_id = $2 and langue = $3 and numero = $4`,
      [companyId, dossierId, langue, numero],
    );
    return lignes[0] ? versRevision(lignes[0]) : null;
  }

  async function insererPublication(companyId: string, p: NouvellePublication): Promise<string> {
    const id = randomUUID();
    await x(
      `insert into ${t("obs_publications")} (company_id, id, cible, objet, empreinte_artefact, commit_contenu, publiee_le) values ($1, $2, $3, $4, $5, $6, $7)`,
      [companyId, id, p.cible, p.objet, p.empreinteArtefact, p.commitContenu, p.publieeLe],
    );
    return id;
  }

  /** INJ-9 : le site a-t-il déjà une publication git ? (la toute première exige une seconde décision humaine) */
  async function publicationGitExiste(companyId: string): Promise<boolean> {
    return (await q(`select 1 from ${t("obs_publications")} where company_id = $1 and cible = 'git' limit 1`, [companyId])).length > 0;
  }

  /** INJ-9 : seconde décision humaine sur une révision (idempotente). */
  async function confirmerPublication(companyId: string, objet: string, par: string): Promise<void> {
    await x(`insert into ${t("obs_confirmations_publication")} (company_id, objet, confirmee_par) values ($1, $2, $3) on conflict (company_id, objet) do nothing`, [companyId, objet, par]);
  }

  async function publicationConfirmee(companyId: string, objet: string): Promise<boolean> {
    return (await q(`select 1 from ${t("obs_confirmations_publication")} where company_id = $1 and objet = $2`, [companyId, objet])).length > 0;
  }

  return { projetParSlug, creerProjet, ajouterAlias, projetDeAlias, importerSourcesCommunes, proposerSourceCommune, suspecterSources, propositionsDuRun, activerSource, sourcesCommunes, listerSourcesCommunes, enregistrerSource, listerAlias, sourcesDuProjet, sourcesCommunesParUrl, enregistrerCollecte, enregistrerVersions, insererAffirmation, remplacerAffirmation, listerAffirmations, affirmationsParIds, versionsConnues, insererPreuve, listerPreuves, preuvesDe, instantane, instantanesParIds, dernierInstantaneId, urlDeSource, insererRevision, lireRevision, insererPublication, publicationGitExiste, confirmerPublication, publicationConfirmee, projetParId, listerVersions, revisionsSansPublication };
}
