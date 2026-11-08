/**
 * Contrôles SQL réels du moteur de missions (#49), joués sur un PostgreSQL jetable démarré par `tester-moteur-sql.py`
 * (connexion par PGHOST, PGPORT, PGUSER, PGDATABASE). Le script applique la VRAIE migration 035, instruction par
 * instruction, derrière le VRAI validateur de migrations de Paperclip, puis fait tourner le VRAI `creerBase` derrière
 * les VRAIS validateurs de requêtes d'exécution de Paperclip. Sortie : une ligne « OK » ou « ECHEC » par contrôle.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePluginMigrationStatement, validatePluginRuntimeExecute, validatePluginRuntimeQuery } from "../../paperclip/server/src/services/plugin-database.ts";
import { ESPACE_BASE } from "../../plugin-atelier/src/contrats/index.ts";
import { creerBase } from "../../plugin-atelier/src/serveur/base.ts";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// `pg` n'est pas une dépendance du plugin : on prend celle du socle Paperclip, déjà installée.
const pg = createRequire(join(RACINE, "paperclip", "node_modules", ".pnpm", "node_modules", "_.js"))("pg") as typeof import("pg");
// L'hôte rend les dates en texte (voir `iso` de base.ts) : on le reproduit pour garder la microseconde.
pg.types.setTypeParser(1184, (v: string) => v);

const SOC = "11111111-1111-4111-8111-111111111111";
const AUTRE = "22222222-2222-4222-8222-222222222222";
const ISSUE_A = "a1000000-0000-4000-8000-000000000001";
const ISSUE_B = "a1000000-0000-4000-8000-000000000002";
const CAMPAGNE = "c1000000-0000-4000-8000-000000000001";

const client = new pg.Client();
await client.connect();
const brut = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as Array<Record<string, unknown>>;

/** Faux `ctx.db` : même contrat que l'hôte (une instruction, validateurs de Paperclip), exécuté sur le PostgreSQL jetable. */
const db = {
  namespace: ESPACE_BASE,
  async query(sql: string, params: unknown[] = []) {
    validatePluginRuntimeQuery(sql, ESPACE_BASE, []);
    return (await client.query(sql, params)).rows;
  },
  async execute(sql: string, params: unknown[] = []) {
    validatePluginRuntimeExecute(sql, ESPACE_BASE);
    return { rowCount: (await client.query(sql, params)).rowCount ?? 0 };
  },
} as unknown as Parameters<typeof creerBase>[0];

let echecs = 0;
async function controle(nom: string, corps: () => Promise<void>) {
  try {
    await corps();
    console.log(`OK    ${nom}`);
  } catch (e) {
    echecs += 1;
    console.log(`ECHEC ${nom} : ${e instanceof Error ? e.message.split("\n").slice(0, 6).join(" | ") : String(e)}`);
  }
}

// --- Schéma minimal dont dépend la 035 (clés étrangères) puis application de la vraie migration ---
await client.query(`
  CREATE TABLE public.companies (id uuid PRIMARY KEY);
  CREATE TABLE public.issues (id uuid PRIMARY KEY);
  CREATE SCHEMA ${ESPACE_BASE};
  CREATE TABLE ${ESPACE_BASE}.campagnes (id uuid PRIMARY KEY);
  CREATE TABLE ${ESPACE_BASE}.diffusions (id uuid PRIMARY KEY);
  INSERT INTO public.companies VALUES ('${SOC}'), ('${AUTRE}');
  INSERT INTO public.issues VALUES ('${ISSUE_A}'), ('${ISSUE_B}');
  INSERT INTO ${ESPACE_BASE}.campagnes VALUES ('${CAMPAGNE}');
`);

const contenu = readFileSync(join(RACINE, "plugin-atelier", "migrations", "035_moteur_missions.sql"), "utf8");
// Même découpage que l'hôte (`splitSqlStatements`) : les commentaires de ligne sont retirés, `;` hors chaînes sépare.
const instructions = contenu.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n").split(";").map((s) => s.trim()).filter(Boolean);

await controle("migration 035 : chaque instruction passe le validateur de Paperclip puis s'exécute", async () => {
  assert.ok(instructions.length >= 4, `instructions trouvées : ${instructions.length}`);
  for (const i of instructions) {
    validatePluginMigrationStatement(i, ESPACE_BASE, ["companies", "issues"] as never);
    await client.query(i);
  }
});

await controle("migration 035 : rejouable sans effet (IF NOT EXISTS)", async () => {
  for (const i of instructions) await client.query(i);
});

await controle("migration 035 : index etapes_tache_idx sur (issue_id, tentative)", async () => {
  const [r] = await brut(`SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = 'etapes_tache_idx'`, [ESPACE_BASE]);
  assert.ok(r, "index absent");
  assert.match(String(r.indexdef), /\(issue_id, tentative\)/u);
});

const base = creerBase(db);
const nouvelleMission = (companyId = SOC, extra: Record<string, unknown> = {}) =>
  base.creerMission({ companyId, gabaritCle: "lancement", gabaritVersion: 3, contratId: "contrat-x", contratVersion: 2, mandat: "Lancer la campagne", ...extra });

await controle("relecture typée d'une mission (enveloppe bigint, dates ISO, nulls)", async () => {
  const id = await nouvelleMission(SOC, { enveloppeCents: 12500, campagneId: CAMPAGNE, issueRacineId: ISSUE_A });
  const m = await base.lireMission(SOC, id);
  assert.ok(m);
  assert.equal(m.enveloppeCents, 12500);
  assert.equal(typeof m.enveloppeCents, "number");
  assert.equal(m.rangCourant, 0);
  assert.equal(m.etat, "prete");
  assert.equal(m.etatAvantPause, null);
  assert.equal(m.campagneId, CAMPAGNE);
  assert.equal(m.issueRacineId, ISSUE_A);
  assert.equal(m.gabaritVersion, 3);
  assert.match(m.creeLe, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  assert.notEqual(m.creeLe, new Date(0).toISOString());
  assert.equal(await base.lireMission(SOC, "00000000-0000-4000-8000-000000000000"), null);
});

await controle("relecture typée d'une étape (jsonb entrée et sortie, dates, issue)", async () => {
  const mission = await nouvelleMission();
  const entree = { brief: "x", liste: [1, 2], imbrique: { ok: true } };
  const id = await base.creerEtape({ companyId: SOC, missionId: mission, rang: 1, role: "redacteur", etat: "prete", entree, delaiLe: "2026-12-01T10:00:00.123456Z", issueId: ISSUE_A });
  assert.equal(await base.majEtape(SOC, id, { etat: "terminee", sortie: { resultat: [true, null] } }), true);
  const [e] = await base.lireEtapes(SOC, mission);
  assert.ok(e);
  assert.equal(e.id, id);
  assert.deepEqual(e.entree, entree);
  assert.deepEqual(e.sortie, { resultat: [true, null] });
  assert.equal(e.etat, "terminee");
  assert.equal(e.tentative, 1);
  assert.equal(e.delaiLe, "2026-12-01T10:00:00.123Z");
  assert.equal(e.issueId, ISSUE_A);
  assert.match(e.creeLe, /Z$/u);
  const [sans] = await base.lireEtapes(SOC, await (async () => {
    const m = await nouvelleMission();
    await base.creerEtape({ companyId: SOC, missionId: m, rang: 1, role: "r", etat: "prete" });
    return m;
  })());
  assert.equal(sans!.entree, null);
  assert.equal(sans!.sortie, null);
  assert.equal(sans!.delaiLe, null);
  assert.equal(sans!.issueId, null);
});

await controle("majEtape : champs partiels, null explicite efface le délai et la tâche", async () => {
  const mission = await nouvelleMission();
  const id = await base.creerEtape({ companyId: SOC, missionId: mission, rang: 1, role: "r", etat: "prete", delaiLe: "2026-12-01T10:00:00Z", issueId: ISSUE_A });
  assert.equal(await base.majEtape(SOC, id, { delaiLe: null, issueId: null }), true);
  const [e] = await base.lireEtapes(SOC, mission);
  assert.equal(e!.delaiLe, null);
  assert.equal(e!.issueId, null);
  assert.equal(e!.etat, "prete");
  assert.equal(await base.majEtape(SOC, id, {}), false);
});

await controle("rejeu d'une clé d'exécution : enregistrerExecution vrai puis faux", async () => {
  const mission = await nouvelleMission();
  const e = { companyId: SOC, missionId: mission, rang: 1, type: "creation_tache" as const, cle: `${mission}:1:1:demarrage`, requete: { titre: "t" } };
  assert.equal(await base.enregistrerExecution(e), true);
  assert.equal(await base.enregistrerExecution(e), false);
  assert.equal((await brut(`SELECT count(*)::int AS n FROM ${ESPACE_BASE}.executions WHERE cle_idempotence = $1`, [e.cle]))[0]!.n, 1);
});

await controle("la même clé dans une autre entreprise reste une exécution distincte (unicité par entreprise)", async () => {
  const m1 = await nouvelleMission(SOC);
  const m2 = await nouvelleMission(AUTRE);
  const cle = "cle-partagee-entre-entreprises";
  assert.equal(await base.enregistrerExecution({ companyId: SOC, missionId: m1, rang: 1, type: "evenement", cle }), true);
  assert.equal(await base.enregistrerExecution({ companyId: AUTRE, missionId: m2, rang: 1, type: "evenement", cle }), true);
});

await controle("marquerExecution puis lireExecution rend appliquee ; null pour une autre entreprise", async () => {
  const mission = await nouvelleMission();
  const cle = `${mission}:2:1:marquage`;
  assert.deepEqual(await base.lireExecution(SOC, cle), null);
  await base.enregistrerExecution({ companyId: SOC, missionId: mission, rang: 2, type: "reveil", cle });
  assert.deepEqual(await base.lireExecution(SOC, cle), { statut: "demandee" });
  assert.equal(await base.marquerExecution(SOC, cle, "appliquee"), true);
  assert.deepEqual(await base.lireExecution(SOC, cle), { statut: "appliquee" });
  assert.equal(await base.lireExecution(AUTRE, cle), null);
  assert.equal(await base.marquerExecution(AUTRE, cle, "refusee"), false);
  assert.deepEqual(await base.lireExecution(SOC, cle), { statut: "appliquee" });
  assert.equal(await base.marquerExecution(SOC, "cle-inconnue", "appliquee"), false);
});

await controle("compare-and-set de l'état : changerEtatMission vrai une fois, faux ensuite ou avec un mauvais ancien état", async () => {
  const id = await nouvelleMission();
  assert.equal(await base.changerEtatMission(SOC, id, "en_cours", "blocage"), false);
  assert.equal((await base.lireMission(SOC, id))!.etat, "prete");
  assert.equal(await base.changerEtatMission(SOC, id, "prete", "en_cours"), true);
  assert.equal(await base.changerEtatMission(SOC, id, "prete", "en_cours"), false);
  assert.equal((await base.lireMission(SOC, id))!.etat, "en_cours");
  assert.equal(await base.changerEtatMission(AUTRE, id, "en_cours", "blocage"), false);
  assert.equal((await base.lireMission(SOC, id))!.etat, "en_cours");
});

await controle("l'état hors de la liste du CHECK est refusé par la base", async () => {
  const id = await nouvelleMission();
  await assert.rejects(base.changerEtatMission(SOC, id, "prete", "inconnu" as never), /check|etat/iu);
  assert.equal((await base.lireMission(SOC, id))!.etat, "prete");
});

await controle("compare-and-set du rang : changerRangMission, y compris k vers k qui rend vrai", async () => {
  const id = await nouvelleMission();
  assert.equal(await base.changerRangMission(SOC, id, 1, 2), false);
  assert.equal(await base.changerRangMission(SOC, id, 0, 1), true);
  assert.equal(await base.changerRangMission(SOC, id, 0, 1), false);
  assert.equal(await base.changerRangMission(SOC, id, 1, 1), true);
  assert.equal(await base.changerRangMission(AUTRE, id, 1, 5), false);
  assert.equal((await base.lireMission(SOC, id))!.rangCourant, 1);
});

await controle("refus d'un doublon (mission, rang, tentative) ; une autre tentative passe", async () => {
  const mission = await nouvelleMission();
  const e = { companyId: SOC, missionId: mission, rang: 1, role: "redacteur", etat: "prete" };
  await base.creerEtape(e);
  await assert.rejects(base.creerEtape(e), /unique|duplicate/iu);
  await base.creerEtape({ ...e, tentative: 2 });
  await base.creerEtape({ ...e, rang: 2 });
  assert.equal((await base.lireEtapes(SOC, mission)).length, 3);
});

await controle("isolation entre entreprises : lireMission, lireEtapes, etapeParIssue, missionsActives", async () => {
  const id = await nouvelleMission(SOC);
  await base.creerEtape({ companyId: SOC, missionId: id, rang: 1, role: "r", etat: "prete", issueId: ISSUE_B });
  assert.equal(await base.lireMission(AUTRE, id), null);
  assert.deepEqual(await base.lireEtapes(AUTRE, id), []);
  assert.equal(await base.etapeParIssue(AUTRE, ISSUE_B), null);
  assert.ok(await base.etapeParIssue(SOC, ISSUE_B));
  assert.equal((await base.missionsActives(AUTRE)).some((m) => m.id === id), false);
  assert.equal((await base.missionsActives(SOC)).some((m) => m.id === id), true);
});

await controle("etapeParIssue rend la dernière tentative", async () => {
  const mission = await nouvelleMission();
  const issue = "a1000000-0000-4000-8000-0000000000f1";
  await client.query(`INSERT INTO public.issues VALUES ($1)`, [issue]);
  await base.creerEtape({ companyId: SOC, missionId: mission, rang: 1, role: "r", etat: "terminee", tentative: 1, issueId: issue });
  const derniere = await base.creerEtape({ companyId: SOC, missionId: mission, rang: 1, role: "r", etat: "prete", tentative: 3, issueId: issue });
  await base.creerEtape({ companyId: SOC, missionId: mission, rang: 1, role: "r", etat: "prete", tentative: 2, issueId: issue });
  const e = await base.etapeParIssue(SOC, issue);
  assert.equal(e!.id, derniere);
  assert.equal(e!.tentative, 3);
});

await controle("missionsActives exclut cloturee, annulee et echec, garde les autres états", async () => {
  const societe = "33333333-3333-4333-8333-333333333333";
  await client.query(`INSERT INTO public.companies VALUES ($1)`, [societe]);
  const etats = ["prete", "en_cours", "en_revue", "attente_autorisation", "en_execution", "resultat_confirme", "attente_information", "blocage", "pause", "cloturee", "annulee", "echec"] as const;
  const ids = new Map<string, string>();
  for (const etat of etats) ids.set(etat, await nouvelleMission(societe, { etat }));
  const actives = new Set((await base.missionsActives(societe)).map((m) => m.etat));
  assert.deepEqual([...actives].sort(), etats.filter((e) => !["cloturee", "annulee", "echec"].includes(e)).sort());
});

await controle("CASCADE : supprimer une mission supprime ses étapes et ses exécutions, pas celles d'une autre", async () => {
  const mission = await nouvelleMission();
  const autre = await nouvelleMission();
  await base.creerEtape({ companyId: SOC, missionId: mission, rang: 1, role: "r", etat: "prete" });
  await base.creerEtape({ companyId: SOC, missionId: autre, rang: 1, role: "r", etat: "prete" });
  await base.enregistrerExecution({ companyId: SOC, missionId: mission, rang: 1, type: "evenement", cle: `${mission}:cascade` });
  await client.query(`DELETE FROM ${ESPACE_BASE}.missions WHERE id = $1`, [mission]);
  assert.equal((await brut(`SELECT count(*)::int AS n FROM ${ESPACE_BASE}.etapes WHERE mission_id = $1`, [mission]))[0]!.n, 0);
  assert.equal((await brut(`SELECT count(*)::int AS n FROM ${ESPACE_BASE}.executions WHERE mission_id = $1`, [mission]))[0]!.n, 0);
  assert.equal((await base.lireEtapes(SOC, autre)).length, 1);
});

await client.end();
if (echecs > 0) {
  console.log(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("tous les contrôles SQL sont passés");
