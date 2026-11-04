/** Dépôt SQL de l'Observatoire : requêtes paramétrées, filtrées par entreprise, règles d'échec des sources (FR-032). */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { baseObservatoire, SEUIL_ECHECS_CONSECUTIFS } from "../src/serveur/observatoire/base-observatoire.js";
import type { ResultatCollecte } from "../src/serveur/observatoire/collecte.js";

const NS = "plugin_atelier_f0322cc62c";
const SOC = "11111111-1111-4111-8111-111111111111";
const SRC = "00000000-0000-4000-8000-0000000000aa";
const PROJET = "00000000-0000-4000-8000-0000000000bb";
type Appel = { sql: string; p: unknown[] };

function fauxDb(rowCount = 1) {
  const lectures: Appel[] = [];
  const ecritures: Appel[] = [];
  const db = {
    namespace: NS,
    // Comme l'hôte réel, qui développe un tableau en ($2, $3) : Postgres le refuse ensuite (« cannot cast type record to uuid[] »).
    query: async (sql: string, p: unknown[]) => { if (p.some(Array.isArray)) throw new Error(`paramètre tableau interdit : ${sql}`); lectures.push({ sql, p }); return []; },
    execute: async (sql: string, p: unknown[]) => { if (p.some(Array.isArray)) throw new Error(`paramètre tableau interdit : ${sql}`); ecritures.push({ sql, p }); return { rowCount }; },
  } as unknown as PluginContext["db"];
  return { base: baseObservatoire(db, NS), lectures, ecritures };
}
const collecte = (etat: ResultatCollecte["etat"], extra: Partial<ResultatCollecte> = {}): ResultatCollecte => ({ url: "https://exemple.org/p", etat, ...extra });

describe("baseObservatoire", () => {
  it("chaque requête est paramétrée et filtrée par company_id = $1", async () => {
    const { base, lectures, ecritures } = fauxDb();
    await base.projetParSlug(SOC, "rea");
    await base.creerProjet(SOC, { slug: "rea", nom: "REA", statutEditorial: "brouillon" });
    await base.ajouterAlias(SOC, PROJET, "npm", "rea");
    await base.listerAlias(SOC, PROJET);
    await base.sourcesDuProjet(SOC, PROJET);
    await base.enregistrerCollecte(SOC, SRC, collecte("nouveau", { texteNormalise: "t", empreinte: "a".repeat(64) }));
    await base.enregistrerVersions(SOC, PROJET, [{ version: "1.0.0", publieeLe: null, prerelease: false }]);
    await base.insererAffirmation(SOC, { projetId: PROJET, chapitre: "c", texte: "t", statut: "non_verifie", confiance: 0, confianceMotif: "m", versionConcernee: null });
    await base.listerAffirmations(SOC, PROJET);
    await base.insererPreuve(SOC, { affirmationId: PROJET, instantaneId: SRC, essaiId: null, extraitExact: "x", position: 0 });
    await base.listerPreuves(SOC, PROJET);
    await base.instantane(SOC, SRC);
    await base.preuvesDe(SOC, [PROJET, SRC]);
    await base.instantanesParIds(SOC, [SRC]);
    await base.insererRevision(SOC, { dossierId: PROJET, langue: "fr", numero: 1, baseRevisionFr: null, contenuMd: "#", empreinte: "b".repeat(64), statut: "brouillon" });
    await base.lireRevision(SOC, PROJET, "fr", 1);
    await base.insererPublication(SOC, { cible: "git", objet: "o", empreinteArtefact: "c".repeat(64), commitContenu: null, publieeLe: "2026-10-27T10:00:00Z" });
    await base.projetParId(SOC, PROJET);
    await base.listerVersions(SOC, PROJET);
    await base.revisionsSansPublication(SOC, "git");
    await base.affirmationsParIds(SOC, [SRC, PROJET]);
    await base.versionsConnues(SOC, [PROJET]);
    const toutes = [...lectures, ...ecritures];
    expect(toutes.length).toBeGreaterThanOrEqual(18);
    for (const { sql, p } of toutes) {
      expect(sql).toMatch(/company_id\s*=\s*\$1|\(\s*id\s*,\s*company_id|\(company_id,|\(id, company_id/u);
      expect(p[0]).toBe(SOC);
    }
    expect(toutes.every(({ sql }) => !sql.includes(SOC))).toBe(true);
  });

  it("enregistrerSource : insertion idempotente sur (company_id, url_canonique), paramétrée", async () => {
    const { base, ecritures, lectures } = fauxDb();
    await base.enregistrerSource(SOC, "https://registry.npmjs.org/rea", "primaire");
    expect(ecritures[0]!.sql).toMatch(/insert into plugin_atelier_f0322cc62c\.obs_sources/u);
    expect(ecritures[0]!.sql).toMatch(/on conflict \(company_id, url_canonique\) do nothing/u);
    expect(ecritures[0]!.p[0]).toBe(SOC);
    expect(lectures[0]!.sql).toMatch(/company_id = \$1 and url_canonique = \$2/u);
  });

  // O1 (audit du 29/10/2026) : une source déclarée ou importée par un humain est examinée, donc autorisée à la collecte.
  it("O1 : déclaration et import humains posent politique_collecte.autorisee ; lectures de la porte la renvoient", async () => {
    const { base, ecritures, lectures } = fauxDb();
    await base.enregistrerSource(SOC, "https://registry.npmjs.org/rea", "primaire");
    expect(ecritures[1]!.sql).toMatch(/update plugin_atelier_f0322cc62c\.obs_sources set politique_collecte = politique_collecte \|\| '\{"autorisee": true\}'::jsonb where company_id = \$1 and url_canonique = \$2/u);
    expect(ecritures[1]!.p).toEqual([SOC, "https://registry.npmjs.org/rea"]);
    await base.importerSourcesCommunes(SOC, [{ url: "https://a.example", type: "secondaire", joignabilite: "A", langue: null, pays: null, sujets: [], auteur: null }]);
    expect(ecritures[2]!.sql).toMatch(/politique_collecte = obs_sources\.politique_collecte \|\| '\{"autorisee": true\}'::jsonb/u);
    await base.proposerSourceCommune(SOC, { url: "https://b.example", type: "secondaire", motif: "m", langue: null, pays: null, sujets: [] }, "agent:a1/run:r1");
    expect(ecritures[3]!.sql).not.toMatch(/autorisee/u);
    await base.sourcesDuProjet(SOC, PROJET);
    await base.sourcesCommunes(SOC);
    for (const l of lectures.slice(-2)) expect(l.sql).toMatch(/s\.politique_collecte/u);
  });

  it("affirmationsParIds trie comme listerAffirmations (chapitre, date de création, id)", async () => {
    const { base, lectures } = fauxDb();
    await base.affirmationsParIds(SOC, [PROJET]);
    expect(lectures[0]!.sql).toMatch(/order by chapitre, cree_le, id/u);
  });

  it("affirmationsParIds envoie les identifiants en minuscules (id::text est en minuscules)", async () => {
    const { base, lectures } = fauxDb();
    await base.affirmationsParIds(SOC, ["AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"]);
    expect(lectures[0]!.p[1]).toBe(JSON.stringify(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]));
  });

  it("listerAffirmations trie par chapitre, date de création puis id", async () => {
    const { base, lectures } = fauxDb();
    await base.listerAffirmations(SOC, PROJET);
    expect(lectures[0]!.sql).toMatch(/order by chapitre, cree_le, id/u);
  });

  it("enregistrerCollecte inchangé n'insère pas d'instantané", async () => {
    const { base, ecritures } = fauxDb();
    await base.enregistrerCollecte(SOC, SRC, collecte("inchange"));
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0]!.sql).not.toMatch(/obs_instantanes/u);
    expect(ecritures[0]!.sql).toMatch(/controle_le/u);
    expect(ecritures[0]!.sql).toMatch(/echecs_consecutifs\s*=\s*0/u);
  });

  it("nouveau insère l'instantané puis remet les échecs à 0", async () => {
    const { base, ecritures } = fauxDb();
    await base.enregistrerCollecte(SOC, SRC, collecte("nouveau", { texteNormalise: "texte", empreinte: "a".repeat(64) }));
    expect(ecritures[0]!.sql).toMatch(/insert into .*obs_instantanes/iu);
    expect(ecritures[0]!.p).toContain("texte");
    expect(ecritures[1]!.sql).toMatch(/echecs_consecutifs\s*=\s*0/u);
  });

  it("nouveau stocke les injections signalées en jsonb ; l'instantané les relit (null si colonne vide)", async () => {
    const { base, ecritures } = fauxDb();
    await base.enregistrerCollecte(SOC, SRC, collecte("nouveau", { texteNormalise: "texte", empreinte: "a".repeat(64), injections: ["ignore previous instructions : « x »"] }));
    expect(ecritures[0]!.sql).toMatch(/injections_signalees/u);
    expect(ecritures[0]!.p).toContain(JSON.stringify(["ignore previous instructions : « x »"]));
    const lu = fauxDb();
    await lu.base.instantane(SOC, SRC);
    expect(lu.lectures[0]!.sql).toMatch(/injections_signalees/u);
  });

  it("5e échec → en_echec", async () => {
    const { base, ecritures } = fauxDb();
    await base.enregistrerCollecte(SOC, SRC, collecte("echec"));
    const { sql, p } = ecritures[0]!;
    expect(sql).toMatch(/echecs_consecutifs\s*=\s*echecs_consecutifs\s*\+\s*1/u);
    expect(sql).toMatch(/en_echec\s*=\s*\(echecs_consecutifs\s*\+\s*1\s*>=\s*\$3\)/u);
    expect(p).toEqual([SOC, SRC, SEUIL_ECHECS_CONSECUTIFS]);
    expect(SEUIL_ECHECS_CONSECUTIFS).toBe(5);
  });

  it("quota n'incrémente pas les échecs", async () => {
    for (const etat of ["quota", "refuse"] as const) {
      const { base, ecritures } = fauxDb();
      await base.enregistrerCollecte(SOC, SRC, collecte(etat));
      expect(ecritures).toHaveLength(1);
      expect(ecritures[0]!.sql).toMatch(/controle_le/u);
      expect(ecritures[0]!.sql).not.toMatch(/echecs_consecutifs/u);
    }
  });
  it("5e échec : la source passe en sommeil avec motif et date, sans être supprimée ; une collecte réussie la réactive", async () => {
    const { base, ecritures } = fauxDb();
    await base.enregistrerCollecte(SOC, SRC, collecte("echec"));
    const { sql } = ecritures[0]!;
    // Une suspecte (V2-7) garde son état ; toute autre source passe en sommeil au seuil.
    expect(sql).toMatch(/etat\s*=\s*case when etat = 'suspecte' then etat when echecs_consecutifs\s*\+\s*1\s*>=\s*\$3 then 'en_sommeil'/u);
    expect(sql).toMatch(/etat_motif\s*=/u);
    expect(sql).toMatch(/etat_le\s*=/u);
    expect(sql).not.toMatch(/\bdelete\b/iu);
    for (const etat of ["nouveau", "inchange"] as const) {
      const ok = fauxDb();
      await ok.base.enregistrerCollecte(SOC, SRC, collecte(etat, { texteNormalise: "t", empreinte: "a".repeat(64) }));
      expect(ok.ecritures.at(-1)!.sql).toMatch(/etat\s*=\s*case when etat = 'suspecte' then etat else 'active' end/u);
    }
  });

  it("LIV-OB-11 : remplacerAffirmation ne marque qu'une affirmation de l'entreprise encore non remplacée", async () => {
    const { base, ecritures } = fauxDb();
    await base.remplacerAffirmation(SOC, "a-ancienne", "a-nouvelle");
    expect(ecritures.at(-1)!.sql).toMatch(/update plugin_atelier_f0322cc62c\.obs_affirmations set remplacee_par = \$3 where company_id = \$1 and id = \$2 and remplacee_par is null/u);
    expect(ecritures.at(-1)!.p).toEqual([SOC, "a-ancienne", "a-nouvelle"]);
  });

  it("EXP-C6 : insererRevision ne copie pas deux fois (dossier, langue, numéro) ; null quand la révision existe déjà", async () => {
    const r = { dossierId: PROJET, langue: "fr" as const, numero: 1, baseRevisionFr: null, contenuMd: "#", empreinte: "b".repeat(64), statut: "valide" };
    const nouvelle = fauxDb(1);
    expect(await nouvelle.base.insererRevision(SOC, r)).toMatch(/^[0-9a-f-]{36}$/u);
    expect(nouvelle.ecritures.at(-1)!.sql).toMatch(/on conflict \(dossier_id, langue, numero\) do nothing$/u);
    expect(await fauxDb(0).base.insererRevision(SOC, r)).toBeNull();
  });

  it("SKMK-O1 : aucune requête du plugin ne modifie une révision copiée (immuable, toute correction crée la suivante)", () => {
    // Pas de déclencheur possible : le socle refuse CREATE TRIGGER et CREATE FUNCTION dans une migration de plugin.
    const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
    const fichiers = [
      ...readdirSync(join(racine, "src"), { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts")).map((f) => join(racine, "src", f)),
      ...readdirSync(join(racine, "migrations")).filter((f) => f.endsWith(".sql")).map((f) => join(racine, "migrations", f)),
    ];
    const fautifs = fichiers.filter((f) => /update\s+(?:\$\{t\("obs_revisions"\)\}|[\w.]*obs_revisions\b)/iu.test(readFileSync(f, "utf8")));
    expect(fautifs).toEqual([]);
  });

  it("base commune : requêtes paramétrées par entreprise, sujets en jsonb, candidates exclues des sources citables", async () => {
    const { base, lectures, ecritures } = fauxDb();
    await base.importerSourcesCommunes(SOC, [{ url: "https://a.example", type: "secondaire", joignabilite: "A", langue: "fr", pays: "BE", sujets: ["ia"], auteur: "Rédaction A" }]);
    await base.proposerSourceCommune(SOC, { url: "https://b.example", type: "secondaire", motif: "m", langue: null, pays: null, sujets: [] }, "agent:a1/run:r1");
    await base.activerSource(SOC, "https://b.example");
    await base.sourcesCommunes(SOC);
    await base.listerSourcesCommunes(SOC, { sujet: "ia", debut: 0, limite: 10 });
    await base.projetDeAlias(SOC, "site", "https://a.example");
    for (const { sql, p } of [...lectures, ...ecritures]) {
      expect(sql).toMatch(/company_id\s*=\s*\$1|\(company_id,/u);
      expect(p[0]).toBe(SOC);
    }
    expect(ecritures[0]!.sql).toMatch(/on conflict \(company_id, url_canonique\) do update set commune = true/u);
    // DROIT-5.2 : l'auteur fixé par l'humain entre dans politique_collecte (absent : l'auteur déjà connu est gardé).
    expect(ecritures[0]!.sql).toMatch(/jsonb_strip_nulls\(jsonb_build_object\('auteur', \$9::text\)\)/u);
    expect(ecritures[0]!.sql.split("do update")[1]).toMatch(/politique_collecte = obs_sources\.politique_collecte \|\| '\{"autorisee": true\}'::jsonb \|\| jsonb_strip_nulls\(jsonb_build_object\('auteur', \$9::text\)\)/u);
    expect(ecritures[0]!.p[8]).toBe("Rédaction A");
    // LIV-OB-7 : l'import humain crée une candidate (active à sa première lecture réussie) ; une source existante garde son état.
    expect(ecritures[0]!.sql).toMatch(/\$8::jsonb, 'candidate', 'humain'/u);
    expect(ecritures[0]!.sql.split("do update")[1]).not.toMatch(/\betat\s*=/u);
    expect(ecritures[0]!.sql).not.toMatch(/type\s*=\s*excluded/u);
    expect(ecritures[0]!.p).toContain(JSON.stringify(["ia"]));
    expect(ecritures[1]!.sql).toMatch(/'candidate'/u);
    expect(ecritures[1]!.sql).toMatch(/on conflict \(company_id, url_canonique\) do nothing/u);
    expect(lectures[0]!.sql).toMatch(/commune\s+and\s+s?\.?etat\s*=\s*'active'/u);
  });

  // V2-7 : une source suspecte (décision humaine) n'est ni réveillée par une lecture réussie ni endormie par des échecs.
  it("suspecte : posée par URL en jsonb, jamais réveillée ni endormie par une collecte, comptage des propositions d'un run", async () => {
    const { base, lectures, ecritures } = fauxDb(2);
    expect(await base.suspecterSources(SOC, ["https://a.example", "https://b.example"], "domaine douteux")).toBe(2);
    expect(ecritures[0]!.sql).toMatch(/set etat = 'suspecte', etat_motif = \$3, etat_le = now\(\)/u);
    expect(ecritures[0]!.sql).toMatch(/url_canonique in \(select jsonb_array_elements_text\(\$2::jsonb\)\)/u);
    expect(ecritures[0]!.p).toEqual([SOC, JSON.stringify(["https://a.example", "https://b.example"]), "domaine douteux"]);
    for (const etat of ["nouveau", "inchange", "echec"] as const) {
      const ok = fauxDb();
      await ok.base.enregistrerCollecte(SOC, SRC, collecte(etat, { texteNormalise: "t", empreinte: "a".repeat(64) }));
      expect(ok.ecritures.at(-1)!.sql, etat).toMatch(/etat = case when etat = 'suspecte' then etat /u);
    }
    await base.propositionsDuRun(SOC, "agent:a1/run:r1");
    expect(lectures.at(-1)!.sql).toMatch(/count\(\*\).*where company_id = \$1 and ajoutee_par = \$2/u);
    expect(lectures.at(-1)!.p).toEqual([SOC, "agent:a1/run:r1"]);
  });

  it("INJ-9 : seconde décision de publication, idempotente et filtrée par entreprise", async () => {
    const { base, lectures, ecritures } = fauxDb();
    await base.confirmerPublication(SOC, "rev-1", "jb");
    expect(ecritures[0]!.sql).toMatch(/insert into plugin_atelier_f0322cc62c\.obs_confirmations_publication \(company_id, objet, confirmee_par\) values \(\$1, \$2, \$3\) on conflict \(company_id, objet\) do nothing/u);
    expect(ecritures[0]!.p).toEqual([SOC, "rev-1", "jb"]);
    expect(await base.publicationConfirmee(SOC, "rev-1")).toBe(false);
    expect(await base.publicationGitExiste(SOC)).toBe(false);
    expect(lectures.map((l) => l.p)).toEqual([[SOC, "rev-1"], [SOC]]);
    expect(lectures[1]!.sql).toMatch(/from plugin_atelier_f0322cc62c\.obs_publications where company_id = \$1 and cible = 'git'/u);
  });
});

