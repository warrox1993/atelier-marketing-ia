/**
 * Lot R7 : accès en base des connaissances du client (migration 008), derrière une interface que les
 * tests remplacent par un stock en mémoire.
 *
 * Règles de l'hôte (`plugin-database.ts`) : une instruction par requête, aucune lecture contenant un mot
 * de mutation (insert, update, delete, alter, create, drop, truncate, même comme nom de colonne), toute
 * requête filtrée sur `company_id = $1`. Le vecteur s'écrit par `decode($n, 'base64')` ; une version est
 * activée par un seul UPDATE, après l'écriture de tous ses passages.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { ExecuteurRequetes } from "./connaissances/recherche.js";

type Db = PluginContext["db"];
type Ligne = Record<string, unknown>;

export interface LigneDocument {
  id: string;
  companyId: string;
  titre: string;
  type: string;
  produit: string | null;
  langue: "fr" | "nl";
  mode: "demonstration" | "reel";
  creePar: string;
  creeLe: string;
}

export interface LigneVersion {
  id: string;
  companyId: string;
  documentId: string;
  version: number;
  nomFichier: string;
  format: string;
  tailleOctets: number;
  empreinte: string;
  pages: number | null;
  dateDocument: string;
  valideDu: string;
  valideAu: string | null;
  statut: "en_vigueur" | "a_venir" | "perime" | "retire";
  remplaceVersion: number | null;
  revuePrevueLe: string;
  pseudonymise: boolean;
  pseudonymisation: Record<string, number> | null;
  injectionsSignalees: string[];
  etatIndexation: "en_file" | "en_cours" | "indexe" | "refuse";
  motifRefus: string | null;
  passages: number;
  active: boolean;
  mode: "demonstration" | "reel";
  importePar: string;
  importeLe: string;
}

export interface NouveauPassage {
  id: string;
  companyId: string;
  documentId: string;
  versionId: string;
  version: number;
  ordre: number;
  texte: string;
  texteNormalise: string;
  langue: "fr" | "nl";
  page: number | null;
  section: string | null;
  empreinte: string;
  injectionsSignalees: string[];
  indexId: string | null;
  vecteurBase64: string | null;
}

export interface LigneIndex {
  id: string;
  companyId: string;
  fournisseur: "aucun" | "local" | "voyage";
  modele: string | null;
  revision: string | null;
  empreinteModele: string | null;
  dimension: number | null;
  versionIndex: number;
  actif: boolean;
  passagesIndexes: number;
  creeLe: string;
}

export interface SourceConnaissance {
  id: string;
  companyId: string;
  campagneId: string | null;
  issueId: string;
  titre: string;
  extrait: string;
  empreinte: string;
  injections: string[];
  mode: "demonstration" | "reel";
  documentId: string;
  version: number;
  passageId: string;
  adresse: string;
}

/** Champs d'une version modifiables après l'import (liste fermée). */
export type ChampsVersion = Partial<Pick<LigneVersion, "valideAu" | "statut" | "etatIndexation" | "motifRefus" | "passages" | "injectionsSignalees" | "pseudonymisation">>;

export interface StockConnaissances {
  /** Lecture pour la recherche (`rechercherConnaissances`). */
  executer: ExecuteurRequetes;
  /** Exclut les documents à la corbeille, sauf `{ corbeille: true }` (corbeille et suppression réelle). */
  lireDocument(companyId: string, documentId: string, options?: { corbeille?: boolean }): Promise<LigneDocument | null>;
  listerDocuments(companyId: string): Promise<LigneDocument[]>;
  /** Versions de l'entreprise, d'un document ou de plusieurs. */
  listerVersions(companyId: string, documentIds?: readonly string[]): Promise<LigneVersion[]>;
  insererDocument(d: Omit<LigneDocument, "creeLe">): Promise<void>;
  insererVersion(v: Omit<LigneVersion, "importeLe">): Promise<void>;
  majVersion(companyId: string, versionId: string, champs: ChampsVersion): Promise<void>;
  insererPassage(p: NouveauPassage): Promise<void>;
  /** Désactive l'ancienne version active du document, puis active celle-ci (un seul UPDATE). */
  activerVersion(companyId: string, documentId: string, versionId: string, passages: number): Promise<void>;
  /** Supprime le document : versions, passages, vecteurs et sources qui le citent partent en cascade. */
  supprimerDocument(companyId: string, documentId: string): Promise<number>;
  passagesContenant(companyId: string, texteMinuscule: string): Promise<Array<{ id: string; documentId: string; version: number; texte: string }>>;
  supprimerPassages(companyId: string, ids: readonly string[]): Promise<number>;
  /**
   * Effacement d'une personne (M3) : remplace l'extrait des sources de provenance connaissance des entreprises
   * `companyIds` dont l'extrait contient `texteMinuscule` (même règle que `passagesContenant`). Les sources qui citent
   * un passage supprimé disparaissent déjà par la cascade de `connaissance_passage_id`. Rend les lignes touchées.
   */
  effacerExtraitsSources(companyIds: readonly string[], texteMinuscule: string): Promise<Array<{ companyId: string; issueId: string | null }>>;
  compterPassages(companyId: string): Promise<number>;
  indexActif(companyId: string): Promise<LigneIndex | null>;
  creerIndex(i: Omit<LigneIndex, "creeLe" | "passagesIndexes" | "actif">): Promise<void>;
  ajouterPassagesIndex(companyId: string, indexId: string, nombre: number): Promise<void>;
  insererSource(s: SourceConnaissance): Promise<void>;
  /** Adresses `connaissance://` rendues à une tâche (sources de provenance `connaissance`). */
  adressesRendues(companyId: string, issueId: string): Promise<string[]>;
  /** Tâches dont une source cite ce document (pour périmer leurs évaluations). */
  tachesCitant(companyId: string, documentId: string): Promise<string[]>;
  compterSourcesDocument(companyId: string, documentId: string): Promise<number>;
}

const jour = (v: unknown): string | null => (v === null || v === undefined ? null : String(v).slice(0, 10));

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v ?? "").trim().replace(" ", "T").replace(/([+-]\d{2})$/u, "$1:00"));
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function tableau<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string") {
    try {
      const x = JSON.parse(v);
      return Array.isArray(x) ? (x as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function objet(v: unknown): Record<string, number> | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as Record<string, number>;
    } catch {
      return null;
    }
  }
  return v as Record<string, number>;
}

function document(r: Ligne): LigneDocument {
  return {
    id: String(r.id), companyId: String(r.company_id), titre: String(r.titre), type: String(r.type), produit: (r.produit as string | null) ?? null,
    langue: r.langue === "nl" ? "nl" : "fr", mode: r.mode === "reel" ? "reel" : "demonstration", creePar: String(r.cree_par), creeLe: iso(r.cree_le),
  };
}

function version(r: Ligne): LigneVersion {
  return {
    id: String(r.id), companyId: String(r.company_id), documentId: String(r.document_id), version: Number(r.version), nomFichier: String(r.nom_fichier),
    format: String(r.format), tailleOctets: Number(r.taille_octets), empreinte: String(r.empreinte), pages: r.pages == null ? null : Number(r.pages),
    dateDocument: jour(r.date_document) ?? "", valideDu: jour(r.valide_du) ?? "", valideAu: jour(r.valide_au), statut: r.statut as LigneVersion["statut"],
    remplaceVersion: r.remplace_version == null ? null : Number(r.remplace_version), revuePrevueLe: jour(r.revue_prevue_le) ?? "",
    pseudonymise: r.pseudonymise === true, pseudonymisation: objet(r.pseudonymisation), injectionsSignalees: tableau<string>(r.injections_signalees),
    etatIndexation: r.etat_indexation as LigneVersion["etatIndexation"], motifRefus: (r.motif_refus as string | null) ?? null, passages: Number(r.passages ?? 0),
    active: r.active === true, mode: r.mode === "reel" ? "reel" : "demonstration", importePar: String(r.importe_par), importeLe: iso(r.importe_le),
  };
}

const COLONNES_VERSION =
  "id, company_id, document_id, version, nom_fichier, format, taille_octets, empreinte, pages, to_char(date_document, 'YYYY-MM-DD') as date_document, " +
  "to_char(valide_du, 'YYYY-MM-DD') as valide_du, to_char(valide_au, 'YYYY-MM-DD') as valide_au, statut, remplace_version, " +
  "to_char(revue_prevue_le, 'YYYY-MM-DD') as revue_prevue_le, pseudonymise, pseudonymisation, injections_signalees, etat_indexation, motif_refus, passages, active, mode, importe_par, importe_le";

const COLONNES_MAJ: Record<keyof ChampsVersion, { colonne: string; cast?: string; json?: boolean }> = {
  valideAu: { colonne: "valide_au", cast: "::date" },
  statut: { colonne: "statut" },
  etatIndexation: { colonne: "etat_indexation" },
  motifRefus: { colonne: "motif_refus" },
  passages: { colonne: "passages" },
  injectionsSignalees: { colonne: "injections_signalees", cast: "::jsonb", json: true },
  pseudonymisation: { colonne: "pseudonymisation", cast: "::jsonb", json: true },
};

/** Extrait d'une source après l'effacement d'une personne : aucune donnée, ni recopie du motif. */
export const EXTRAIT_EFFACE = "[extrait effacé : purge d'une personne]";

export function creerStockConnaissances(db: Db): StockConnaissances {
  const ns = db.namespace;
  const q = (sql: string, params: unknown[]) => db.query<Ligne>(sql, params);
  const x = async (sql: string, params: unknown[]) => (await db.execute(sql, params)).rowCount;

  return {
    executer: (sql, params) => q(sql, params),

    async lireDocument(companyId, documentId, options = {}) {
      const filtre = options.corbeille === true ? "" : " and corbeille_le is null";
      const [r] = await q(`select id, company_id, titre, type, produit, langue, mode, cree_par, cree_le from ${ns}.connaissances_documents where company_id = $1 and id = $2${filtre}`, [companyId, documentId]);
      return r ? document(r) : null;
    },
    async listerDocuments(companyId) {
      return (await q(`select id, company_id, titre, type, produit, langue, mode, cree_par, cree_le from ${ns}.connaissances_documents where company_id = $1 and corbeille_le is null order by type asc, titre asc, id asc`, [companyId])).map(document);
    },
    async listerVersions(companyId, documentIds) {
      if (documentIds && documentIds.length === 0) return [];
      const lignes = documentIds
        ? await q(`select ${COLONNES_VERSION} from ${ns}.connaissances_versions where company_id = $1 and document_id in (select (jsonb_array_elements_text($2::jsonb))::uuid) order by document_id asc, version asc`, [companyId, JSON.stringify([...documentIds])])
        : await q(`select ${COLONNES_VERSION} from ${ns}.connaissances_versions where company_id = $1 order by document_id asc, version asc`, [companyId]);
      return lignes.map(version);
    },
    async insererDocument(d) {
      await x(
        `insert into ${ns}.connaissances_documents (id, company_id, titre, type, produit, langue, mode, cree_par) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [d.id, d.companyId, d.titre, d.type, d.produit, d.langue, d.mode, d.creePar],
      );
    },
    async insererVersion(v) {
      await x(
        `insert into ${ns}.connaissances_versions (id, company_id, document_id, version, nom_fichier, format, taille_octets, empreinte, pages, date_document, valide_du, valide_au, statut, remplace_version, revue_prevue_le, pseudonymise, pseudonymisation, injections_signalees, etat_indexation, motif_refus, passages, active, mode, importe_par)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11::date, $12::date, $13, $14, $15::date, $16, $17::jsonb, $18::jsonb, $19, $20, $21, $22, $23, $24)`,
        [v.id, v.companyId, v.documentId, v.version, v.nomFichier, v.format, v.tailleOctets, v.empreinte, v.pages, v.dateDocument, v.valideDu, v.valideAu, v.statut, v.remplaceVersion,
          v.revuePrevueLe, v.pseudonymise, v.pseudonymisation === null ? null : JSON.stringify(v.pseudonymisation), JSON.stringify(v.injectionsSignalees), v.etatIndexation, v.motifRefus,
          v.passages, v.active, v.mode, v.importePar],
      );
    },
    async majVersion(companyId, versionId, champs) {
      const params: unknown[] = [companyId, versionId];
      const sets: string[] = [];
      for (const [cle, valeur] of Object.entries(champs) as Array<[keyof ChampsVersion, unknown]>) {
        if (valeur === undefined) continue;
        const c = COLONNES_MAJ[cle];
        params.push(c.json ? JSON.stringify(valeur) : valeur);
        sets.push(`${c.colonne} = $${params.length}${c.cast ?? ""}`);
      }
      if (sets.length === 0) return;
      await x(`update ${ns}.connaissances_versions set ${sets.join(", ")} where company_id = $1 and id = $2`, params);
    },
    async insererPassage(p) {
      await x(
        `insert into ${ns}.connaissances_passages (id, company_id, document_id, version_id, version, ordre, texte, texte_normalise, langue, page, section, empreinte, injections_signalees, index_id, vecteur)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, decode($15, 'base64'))`,
        [p.id, p.companyId, p.documentId, p.versionId, p.version, p.ordre, p.texte, p.texteNormalise, p.langue, p.page, p.section, p.empreinte, JSON.stringify(p.injectionsSignalees), p.indexId, p.vecteurBase64],
      );
    },
    async activerVersion(companyId, documentId, versionId, passages) {
      await x(`update ${ns}.connaissances_versions set active = false where company_id = $1 and document_id = $2 and active and id <> $3`, [companyId, documentId, versionId]);
      await x(
        `update ${ns}.connaissances_versions set active = true, etat_indexation = 'indexe', motif_refus = null, passages = $4 where company_id = $1 and document_id = $2 and id = $3`,
        [companyId, documentId, versionId, passages],
      );
    },
    async supprimerDocument(companyId, documentId) {
      const n = await x(`delete from ${ns}.connaissances_documents where company_id = $1 and id = $2`, [companyId, documentId]);
      // Le document n'existe plus : sa ligne de corbeille ne doit pas rester (la purge échouerait pour toujours).
      await x(`delete from ${ns}.corbeille where company_id = $1 and type = 'document' and element_id = $2`, [companyId, documentId]);
      return n;
    },
    async passagesContenant(companyId, texteMinuscule) {
      const lignes = await q(
        `select id, document_id, version, texte from ${ns}.connaissances_passages where company_id = $1 and position($2 in lower(texte)) > 0 order by document_id asc, ordre asc limit 200`,
        [companyId, texteMinuscule],
      );
      return lignes.map((r) => ({ id: String(r.id), documentId: String(r.document_id), version: Number(r.version), texte: String(r.texte) }));
    },
    async supprimerPassages(companyId, ids) {
      if (ids.length === 0) return 0;
      return x(`delete from ${ns}.connaissances_passages where company_id = $1 and id in (select (jsonb_array_elements_text($2::jsonb))::uuid)`, [companyId, JSON.stringify([...ids])]);
    },
    async effacerExtraitsSources(companyIds, texteMinuscule) {
      const touchees: Array<{ companyId: string; issueId: string | null }> = [];
      // Une requête par entreprise : la garde « company_id = $1 » de l'hôte reste vraie pour chacune.
      for (const companyId of companyIds) {
        const cond = `company_id = $1 and provenance = 'connaissance' and position($2 in lower(coalesce(extrait, ''))) > 0`;
        const lignes = await q(`select issue_id from ${ns}.sources where ${cond}`, [companyId, texteMinuscule]);
        if (lignes.length === 0) continue;
        await x(`update ${ns}.sources set extrait = $3 where ${cond}`, [companyId, texteMinuscule, EXTRAIT_EFFACE]);
        for (const r of lignes) touchees.push({ companyId, issueId: r.issue_id == null ? null : String(r.issue_id) });
      }
      return touchees;
    },
    async compterPassages(companyId) {
      const [r] = await q(
        `select count(*)::int as n from ${ns}.connaissances_passages p join ${ns}.connaissances_versions v on v.id = p.version_id and v.company_id = p.company_id where p.company_id = $1 and v.active`,
        [companyId],
      );
      return Number(r?.n ?? 0);
    },
    async indexActif(companyId) {
      const [r] = await q(
        `select id, company_id, fournisseur, modele, revision, empreinte_modele, dimension, version_index, actif, passages_indexes, cree_le from ${ns}.connaissances_index where company_id = $1 and actif limit 1`,
        [companyId],
      );
      if (!r) return null;
      return {
        id: String(r.id), companyId: String(r.company_id), fournisseur: r.fournisseur as LigneIndex["fournisseur"], modele: (r.modele as string | null) ?? null,
        revision: (r.revision as string | null) ?? null, empreinteModele: (r.empreinte_modele as string | null) ?? null, dimension: r.dimension == null ? null : Number(r.dimension),
        versionIndex: Number(r.version_index), actif: r.actif === true, passagesIndexes: Number(r.passages_indexes ?? 0), creeLe: iso(r.cree_le),
      };
    },
    async creerIndex(i) {
      await x(
        `insert into ${ns}.connaissances_index (id, company_id, fournisseur, modele, revision, empreinte_modele, dimension, version_index, actif) values ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [i.id, i.companyId, i.fournisseur, i.modele, i.revision, i.empreinteModele, i.dimension, i.versionIndex],
      );
    },
    async ajouterPassagesIndex(companyId, indexId, nombre) {
      await x(`update ${ns}.connaissances_index set passages_indexes = passages_indexes + $3 where company_id = $1 and id = $2`, [companyId, indexId, nombre]);
    },
    async insererSource(s) {
      await x(
        `insert into ${ns}.sources (id, company_id, campagne_id, issue_id, revision_id, url, url_finale, titre, statut_acces, code_http, type_contenu, extrait, empreinte, indices_erreur, injections_signalees, provenance, mode, connaissance_document_id, connaissance_version, connaissance_passage_id, connaissance_adresse)
         values ($1, $2, $3, $4, null, $5, null, $6, 'accessible', null, 'text/plain', $7, $8, '[]'::jsonb, $9::jsonb, 'connaissance', $10, $11, $12, $13, $5)`,
        [s.id, s.companyId, s.campagneId, s.issueId, s.adresse, s.titre, s.extrait, s.empreinte, JSON.stringify(s.injections), s.mode, s.documentId, s.version, s.passageId],
      );
    },
    async adressesRendues(companyId, issueId) {
      const lignes = await q(`select distinct connaissance_adresse from ${ns}.sources where company_id = $1 and issue_id = $2 and provenance = 'connaissance' and connaissance_adresse is not null`, [companyId, issueId]);
      return lignes.map((r) => String(r.connaissance_adresse));
    },
    async tachesCitant(companyId, documentId) {
      const lignes = await q(`select distinct issue_id from ${ns}.sources where company_id = $1 and connaissance_document_id = $2 and issue_id is not null`, [companyId, documentId]);
      return lignes.map((r) => String(r.issue_id));
    },
    async compterSourcesDocument(companyId, documentId) {
      const [r] = await q(`select count(*)::int as n from ${ns}.sources where company_id = $1 and connaissance_document_id = $2`, [companyId, documentId]);
      return Number(r?.n ?? 0);
    },
  };
}
