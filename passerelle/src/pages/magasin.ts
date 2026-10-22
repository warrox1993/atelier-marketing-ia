// Magasin des pages de destination (SQLite). Partagé par DEUX processus : la passerelle (outils des agents, qui
// créent et lisent) et le serveur de pages (qui sert et enregistre les envois). Mode WAL pour que les deux cohabitent.
// RGPD : le magasin ne garde AUCUNE donnée personnelle (ni nom, ni téléphone, ni e-mail) ; elles partent chiffrées dans
// l'atelier à la réception. Il ne garde que l'identifiant du prospect créé, la date et le statut de l'envoi.

import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { texteConsentement, type ContenuPage, type TypeOffre } from "./contenu.js";

export const PAGES_MAX_PAR_ENTREPRISE = 200;
export const PAGES_MAX_TOTAL = 2000;

export interface PageDestination {
  slug: string;
  entrepriseId: string;
  titre: string;
  accroche: string;
  offreType: TypeOffre;
  offreIntitule: string;
  offreDescription: string;
  responsable: string;
  contactConfidentialite: string;
  /** Texte exact de la case de consentement, figé à la création. */
  texteConsentement: string;
  creeLe: string;
}

export type StatutEnvoi = "recu" | "prospect_cree" | "echec_depot";

export interface Envoi {
  id: string;
  slug: string;
  nonce: string;
  statut: StatutEnvoi;
  prospectId: string | null;
  creeLe: string;
}

interface LignePage {
  slug: string; entreprise_id: string; titre: string; accroche: string; offre_type: string; offre_intitule: string; offre_description: string;
  responsable: string; contact_confidentialite: string; texte_consentement: string; cree_le: string;
}

const MOTIF_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
export const estSlugValide = (s: string): boolean => s.length >= 3 && s.length <= 64 && MOTIF_SLUG.test(s);

/** Slug lisible (titre sans accents, minuscules, tirets) suivi d'un suffixe aléatoire : non devinable, sans collision. */
export function fabriquerSlug(titre: string): string {
  const base = titre
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40)
    .replace(/-+$/u, "");
  return `${base || "page"}-${randomBytes(4).toString("hex")}`;
}

export class MagasinPages {
  private readonly db: Database.Database;

  constructor(chemin: string) {
    if (chemin !== ":memory:") mkdirSync(dirname(chemin), { recursive: true, mode: 0o700 });
    this.db = new Database(chemin);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        slug TEXT PRIMARY KEY,
        entreprise_id TEXT NOT NULL,
        titre TEXT NOT NULL,
        accroche TEXT NOT NULL,
        offre_type TEXT NOT NULL,
        offre_intitule TEXT NOT NULL,
        offre_description TEXT NOT NULL,
        responsable TEXT NOT NULL,
        contact_confidentialite TEXT NOT NULL,
        texte_consentement TEXT NOT NULL,
        cree_le TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS envois (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL REFERENCES pages(slug),
        nonce TEXT NOT NULL UNIQUE,
        statut TEXT NOT NULL,
        prospect_id TEXT,
        cree_le TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS envois_slug ON envois(slug);
    `);
  }

  fermer(): void {
    this.db.close();
  }

  creerPage(c: ContenuPage, maintenant: Date = new Date()): PageDestination {
    const parEntreprise = (this.db.prepare("SELECT COUNT(*) AS n FROM pages WHERE entreprise_id = ?").get(c.entreprise_id) as { n: number }).n;
    if (parEntreprise >= PAGES_MAX_PAR_ENTREPRISE) throw new Error(`Plafond atteint : ${PAGES_MAX_PAR_ENTREPRISE} pages par entreprise.`);
    const total = (this.db.prepare("SELECT COUNT(*) AS n FROM pages").get() as { n: number }).n;
    if (total >= PAGES_MAX_TOTAL) throw new Error(`Plafond atteint : ${PAGES_MAX_TOTAL} pages au total.`);
    const page: PageDestination = {
      slug: fabriquerSlug(c.titre),
      entrepriseId: c.entreprise_id.toLowerCase(),
      titre: c.titre,
      accroche: c.accroche,
      offreType: c.offre_type,
      offreIntitule: c.offre_intitule,
      offreDescription: c.offre_description,
      responsable: c.responsable,
      contactConfidentialite: c.contact_confidentialite,
      texteConsentement: texteConsentement(c),
      creeLe: maintenant.toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO pages (slug, entreprise_id, titre, accroche, offre_type, offre_intitule, offre_description, responsable, contact_confidentialite, texte_consentement, cree_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(page.slug, page.entrepriseId, page.titre, page.accroche, page.offreType, page.offreIntitule, page.offreDescription, page.responsable, page.contactConfidentialite, page.texteConsentement, page.creeLe);
    return page;
  }

  private page(l: LignePage): PageDestination {
    return {
      slug: l.slug, entrepriseId: l.entreprise_id, titre: l.titre, accroche: l.accroche, offreType: l.offre_type as TypeOffre, offreIntitule: l.offre_intitule,
      offreDescription: l.offre_description, responsable: l.responsable, contactConfidentialite: l.contact_confidentialite, texteConsentement: l.texte_consentement, creeLe: l.cree_le,
    };
  }

  lirePage(slug: string): PageDestination | null {
    const l = this.db.prepare("SELECT * FROM pages WHERE slug = ?").get(slug) as LignePage | undefined;
    return l ? this.page(l) : null;
  }

  listerPages(entrepriseId?: string, limite = 100): Array<PageDestination & { envois: number }> {
    const lignes = (entrepriseId
      ? this.db.prepare("SELECT * FROM pages WHERE entreprise_id = ? ORDER BY cree_le DESC LIMIT ?").all(entrepriseId.toLowerCase(), limite)
      : this.db.prepare("SELECT * FROM pages ORDER BY cree_le DESC LIMIT ?").all(limite)) as LignePage[];
    return lignes.map((l) => ({ ...this.page(l), envois: this.compterEnvois(l.slug) }));
  }

  compterEnvois(slug: string, depuis?: string): number {
    const r = (depuis
      ? this.db.prepare("SELECT COUNT(*) AS n FROM envois WHERE slug = ? AND cree_le >= ? AND statut != 'echec_depot'").get(slug, depuis)
      : this.db.prepare("SELECT COUNT(*) AS n FROM envois WHERE slug = ? AND statut != 'echec_depot'").get(slug)) as { n: number };
    return r.n;
  }

  /**
   * Réserve l'envoi d'un jeton : un jeton ne sert qu'une fois (anti double envoi et anti rejeu). Faux si déjà utilisé.
   */
  reserverEnvoi(slug: string, nonce: string, maintenant: Date = new Date()): Envoi | null {
    const envoi: Envoi = { id: randomUUID(), slug, nonce, statut: "recu", prospectId: null, creeLe: maintenant.toISOString() };
    try {
      this.db.prepare("INSERT INTO envois (id, slug, nonce, statut, prospect_id, cree_le) VALUES (?, ?, ?, ?, NULL, ?)").run(envoi.id, slug, nonce, envoi.statut, envoi.creeLe);
    } catch (e) {
      if (e instanceof Error && /UNIQUE/u.test(e.message)) return null;
      throw e;
    }
    return envoi;
  }

  /** Libère un jeton dont le dépôt a échoué (la personne peut réessayer avec le même formulaire). */
  abandonnerEnvoi(id: string): void {
    this.db.prepare("DELETE FROM envois WHERE id = ?").run(id);
  }

  marquerEnvoi(id: string, statut: StatutEnvoi, prospectId: string | null): void {
    this.db.prepare("UPDATE envois SET statut = ?, prospect_id = ? WHERE id = ?").run(statut, prospectId, id);
  }
}
