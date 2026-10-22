// Lecture de l'index Statbel local, en LECTURE SEULE, avec des requêtes paramétrées uniquement.
// Si l'importation remplace le fichier (renommage), la requête suivante rouvre l'index.

import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { normaliser } from "../../commun/prospection/commun.js";

export interface Commune {
  refnis: string;
  nom_fr: string;
  nom_nl: string;
  arrondissement: string;
  province: string;
  region: string;
}

export type ResolutionCommune =
  | { statut: "trouvee"; commune: Commune }
  | { statut: "ambigue"; candidates: Commune[]; raison: string }
  | { statut: "introuvable"; raison: string };

export interface Meta {
  importe_le: string;
  annee_population: number;
  annee_revenus: number;
  annee_tva: number;
}

export const MAX_CANDIDATES = 10;

/** Racine du dépôt : premier dossier parent qui contient `scripts/statbel-mise-a-jour.sh` (marche depuis src/ et depuis dist/). */
export function racineDepot(depuis: string = dirname(fileURLToPath(import.meta.url))): string | null {
  let d = resolve(depuis);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(d, "scripts", "statbel-mise-a-jour.sh"))) return d;
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
  }
  return null;
}

/** Chemin de l'index : PASSERELLE_STATBEL_INDEX, sinon `instance/donnees/statbel/statbel.sqlite` à la racine du dépôt. */
export function cheminIndexStatbel(env: NodeJS.ProcessEnv): string {
  const fixe = env["PASSERELLE_STATBEL_INDEX"]?.trim();
  if (fixe) return fixe;
  return join(racineDepot() ?? process.cwd(), "instance", "donnees", "statbel", "statbel.sqlite");
}

export class IndexStatbel {
  private db: Database.Database | null = null;
  private signature = "";

  constructor(private readonly chemin: string) {}

  private ouvrir(): Database.Database | null {
    if (!existsSync(this.chemin)) { this.fermer(); return null; }
    const s = statSync(this.chemin);
    const signature = `${s.mtimeMs}:${s.size}`;
    if (this.db === null || signature !== this.signature) {
      this.fermer();
      this.db = new Database(this.chemin, { readonly: true, fileMustExist: true });
      this.signature = signature;
    }
    return this.db;
  }

  fermer(): void {
    this.db?.close();
    this.db = null;
  }

  disponible(): boolean {
    try {
      const db = this.ouvrir();
      return db !== null && (db.prepare("SELECT COUNT(*) AS n FROM communes").get() as { n: number }).n > 0;
    } catch {
      return false;
    }
  }

  private base(): Database.Database {
    const db = this.ouvrir();
    if (db === null) throw new Error("Index Statbel absent : lancer scripts/statbel-mise-a-jour.sh (voir docs/passerelle.md, « Service statbel »).");
    return db;
  }

  meta(): Meta {
    const lignes = this.base().prepare("SELECT cle, valeur FROM meta").all() as { cle: string; valeur: string }[];
    const m = Object.fromEntries(lignes.map((l) => [l.cle, l.valeur]));
    return { importe_le: m["importe_le"] ?? "", annee_population: Number(m["annee_population"]), annee_revenus: Number(m["annee_revenus"]), annee_tva: Number(m["annee_tva"]) };
  }

  /** Résout une référence : code INS (5 chiffres), code postal (4 chiffres) ou nom de commune (français ou néerlandais). */
  resoudre(ref: string): ResolutionCommune {
    const db = this.base();
    const texte = ref.trim();
    const colonnes = "refnis, nom_fr, nom_nl, arrondissement, province, region";
    if (/^\d{5}$/u.test(texte)) {
      const c = db.prepare(`SELECT ${colonnes} FROM communes WHERE refnis = ?`).get(texte) as Commune | undefined;
      return c ? { statut: "trouvee", commune: c } : { statut: "introuvable", raison: `Code INS ${texte} inconnu (commune fusionnée ou code erroné).` };
    }
    if (/^\d{4}$/u.test(texte)) {
      const cs = db.prepare(`SELECT ${colonnes} FROM communes WHERE refnis IN (SELECT refnis FROM codes_postaux WHERE code_postal = ?) ORDER BY nom_fr LIMIT ?`).all(texte, MAX_CANDIDATES + 1) as Commune[];
      if (cs.length === 1) return { statut: "trouvee", commune: cs[0]! };
      if (cs.length > 1) return { statut: "ambigue", candidates: cs.slice(0, MAX_CANDIDATES), raison: `Le code postal ${texte} couvre plusieurs communes : choisir par code INS.` };
      return { statut: "introuvable", raison: `Code postal ${texte} sans commune connue (table bpost de 2021 : une commune fusionnée depuis peut manquer) : chercher par nom ou code INS.` };
    }
    const n = normaliser(texte);
    if (n === "") return { statut: "introuvable", raison: "Référence vide." };
    const exactes = db.prepare(`SELECT ${colonnes} FROM communes WHERE nom_fr_norm = ? OR nom_nl_norm = ? ORDER BY nom_fr LIMIT ?`).all(n, n, MAX_CANDIDATES + 1) as Commune[];
    if (exactes.length === 1) return { statut: "trouvee", commune: exactes[0]! };
    if (exactes.length > 1) return { statut: "ambigue", candidates: exactes.slice(0, MAX_CANDIDATES), raison: `Plusieurs communes portent le nom « ${texte} » : choisir par code INS.` };
    const echappe = n.replace(/[\\%_]/gu, "\\$&");
    const debut = db.prepare(`SELECT ${colonnes} FROM communes WHERE nom_fr_norm LIKE ? ESCAPE '\\' OR nom_nl_norm LIKE ? ESCAPE '\\' ORDER BY nom_fr LIMIT ?`).all(`${echappe}%`, `${echappe}%`, MAX_CANDIDATES + 1) as Commune[];
    if (debut.length === 1) return { statut: "trouvee", commune: debut[0]! };
    if (debut.length > 1) return { statut: "ambigue", candidates: debut.slice(0, MAX_CANDIDATES), raison: `Plusieurs communes commencent par « ${texte} » : préciser le nom ou donner le code INS.` };
    return { statut: "introuvable", raison: `Aucune commune ne correspond à « ${texte} ».` };
  }

  population(refnis: string): { hommes: number; femmes: number; belges: number; etrangers: number; age5: Map<number, number> } {
    const db = this.base();
    const age5 = new Map<number, number>();
    let hommes = 0;
    let femmes = 0;
    for (const r of db.prepare("SELECT sexe, age5, effectif FROM pop_age WHERE refnis = ?").all(refnis) as { sexe: string; age5: number; effectif: number }[]) {
      age5.set(r.age5, (age5.get(r.age5) ?? 0) + r.effectif);
      if (r.sexe === "M") hommes += r.effectif; else femmes += r.effectif;
    }
    const nat = Object.fromEntries((db.prepare("SELECT nationalite, effectif FROM pop_nat WHERE refnis = ?").all(refnis) as { nationalite: string; effectif: number }[]).map((r) => [r.nationalite, r.effectif]));
    return { hommes, femmes, belges: nat["belge"] ?? 0, etrangers: nat["etranger"] ?? 0, age5 };
  }

  revenus(refnis: string): { annee: number; declarations: number; declarations_nulles: number; revenu_imposable: number; revenu_net: number; habitants: number } | null {
    const annee = this.meta().annee_revenus;
    return (this.base().prepare("SELECT annee, declarations, declarations_nulles, revenu_imposable, revenu_net, habitants FROM revenus WHERE refnis = ? AND annee = ?").get(refnis, annee) as ReturnType<IndexStatbel["revenus"]> | undefined) ?? null;
  }

  tva(refnis: string): { section: string; libelle: string; assujettis: number }[] {
    return this.base().prepare("SELECT section, libelle, assujettis FROM tva WHERE refnis = ? ORDER BY assujettis DESC, section").all(refnis) as { section: string; libelle: string; assujettis: number }[];
  }
}
