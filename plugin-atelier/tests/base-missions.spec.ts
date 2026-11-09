/**
 * Moteur de missions (#49, tâche 2) : méthodes de `base.ts`. Faux `db` à état minimal qui rejoue les unicités du SQL
 * (la clé d'idempotence et le compare-and-set de l'état) ; le SQL réel est joué sur un PostgreSQL jetable par `scripts/tests/tester-moteur-sql.py` (hors vitest).
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ESPACE_BASE } from "../src/contrats/index.js";
import { creerBase } from "../src/serveur/base.js";

const SOC = "11111111-1111-4111-8111-111111111111";
const AUTRE = "22222222-2222-4222-8222-222222222222";
const MISSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function fauxDb() {
  const appels: Array<{ sql: string; params: unknown[] }> = [];
  const missions = new Map<string, Record<string, unknown>>();
  const etapes: Array<Record<string, unknown>> = [];
  const cles = new Set<string>();
  const db = {
    namespace: ESPACE_BASE,
    async query(sql: string, params: unknown[] = []) {
      appels.push({ sql, params });
      if (/from \w+\.missions where company_id = \$1 and id = \$2$/u.test(sql)) return [missions.get(String(params[1]))].filter((m) => m?.company_id === params[0]);
      if (/from \w+\.etapes where company_id = \$1 and mission_id = \$2/u.test(sql)) return etapes.filter((e) => e.company_id === params[0] && e.mission_id === params[1]);
      return [];
    },
    async execute(sql: string, params: unknown[] = []) {
      appels.push({ sql, params });
      if (/^insert into \w+\.missions/u.test(sql)) {
        const [id, company_id, gabarit_cle, gabarit_version, contrat_id, contrat_version, mandat, etat, enveloppe_cents, campagne_id, issue_racine_id] = params;
        missions.set(String(id), { id, company_id, gabarit_cle, gabarit_version, contrat_id, contrat_version, mandat, etat, etat_avant_pause: null, rang_courant: 0, enveloppe_cents: String(enveloppe_cents), cycle_blocage: 0, campagne_id, issue_racine_id, cree_le: "2026-10-15 14:23:59.691232+02", modifie_le: "2026-10-15 14:23:59.691232+02" });
        return { rowCount: 1 };
      }
      if (/^update \w+\.missions set etat = \$4/u.test(sql)) {
        const m = missions.get(String(params[1]));
        if (!m || m.company_id !== params[0] || m.etat !== params[2]) return { rowCount: 0 };
        m.etat = params[3];
        if (/cycle_blocage = cycle_blocage \+ 1/u.test(sql)) m.cycle_blocage = Number(m.cycle_blocage) + 1;
        return { rowCount: 1 };
      }
      if (/^insert into \w+\.etapes/u.test(sql)) {
        const [id, company_id, mission_id, rang, role, tentative, etat, entree, delai_le, issue_id] = params;
        if (etapes.some((e) => e.mission_id === mission_id && e.rang === rang && e.tentative === tentative)) throw new Error("duplicate key value violates unique constraint");
        etapes.push({ id, company_id, mission_id, rang, role, tentative, etat, entree: entree === null ? null : JSON.parse(String(entree)), sortie: null, delai_le, issue_id, cree_le: "2026-10-15T12:00:00.000Z", modifie_le: "2026-10-15T12:00:00.000Z" });
        return { rowCount: 1 };
      }
      if (/^insert into \w+\.executions/u.test(sql)) {
        expect(sql).toContain("on conflict (company_id, cle_idempotence) do nothing");
        const k = `${String(params[1])}|${String(params[5])}`;
        if (cles.has(k)) return { rowCount: 0 };
        cles.add(k);
        return { rowCount: 1 };
      }
      if (/^update \w+\.executions set statut = \$3/u.test(sql)) return { rowCount: cles.has(`${String(params[0])}|${String(params[1])}`) ? 1 : 0 };
      if (/^update \w+\.etapes set /u.test(sql)) return { rowCount: etapes.filter((e) => e.company_id === params[0] && e.id === params[1]).length };
      throw new Error(`SQL non prévu : ${sql}`);
    },
  } as unknown as PluginContext["db"];
  return { db, appels, etapes };
}

describe("base : moteur de missions", () => {
  it("une mission créée est relue avec tous ses champs", async () => {
    const { db } = fauxDb();
    const base = creerBase(db);
    const id = await base.creerMission({ companyId: SOC, gabaritCle: "lancement", gabaritVersion: 3, contratId: "contrat-x", contratVersion: 2, mandat: "Lancer la campagne", enveloppeCents: 12500, campagneId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", issueRacineId: null });
    expect(await base.lireMission(SOC, id)).toEqual({
      id, companyId: SOC, gabaritCle: "lancement", gabaritVersion: 3, contratId: "contrat-x", contratVersion: 2, mandat: "Lancer la campagne", etat: "prete",
      etatAvantPause: null, rangCourant: 0, enveloppeCents: 12500, cycleBlocage: 0, campagneId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", issueRacineId: null,
      creeLe: "2026-10-15T12:23:59.691Z", modifieLe: "2026-10-15T12:23:59.691Z",
    });
    expect(await base.lireMission(SOC, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("une autre entreprise ne lit ni ne change la mission ni ses étapes, et ses écritures portent son identifiant", async () => {
    const { db, appels } = fauxDb();
    const base = creerBase(db);
    const id = await base.creerMission({ companyId: SOC, gabaritCle: "g", gabaritVersion: 1, contratId: "c", contratVersion: 1, mandat: "m" });
    await base.creerEtape({ companyId: SOC, missionId: id, rang: 1, role: "r", etat: "prete" });
    expect(await base.lireMission(AUTRE, id)).toBeNull();
    expect(await base.lireEtapes(AUTRE, id)).toEqual([]);
    expect(await base.changerEtatMission(AUTRE, id, "prete", "en_cours")).toBe(false);
    expect((await base.lireMission(SOC, id))!.etat).toBe("prete");
    await base.majEtape(AUTRE, "e-1", { etat: "x" });
    await base.marquerExecution(AUTRE, "cle", "appliquee");
    for (const appel of appels.slice(-2)) {
      expect(appel.sql).toContain("company_id = $1");
      expect(appel.params[0]).toBe(AUTRE);
    }
  });

  it("missionsActives : SELECT borné à l'entreprise qui exclut les états terminaux", async () => {
    const { db, appels } = fauxDb();
    await creerBase(db).missionsActives(SOC);
    const sql = appels[0]!.sql.replace(/\s+/gu, " ");
    expect(appels[0]!.params).toEqual([SOC]);
    expect(sql).toContain("company_id = $1");
    expect(sql).toContain("etat not in ('cloturee', 'annulee', 'echec')");
  });

  it("changerEtatMission : UPDATE ... WHERE id AND etat = ancien ; un mauvais ancien état ne change rien", async () => {
    const { db, appels } = fauxDb();
    const base = creerBase(db);
    const id = await base.creerMission({ companyId: SOC, gabaritCle: "g", gabaritVersion: 1, contratId: "c", contratVersion: 1, mandat: "m" });
    expect(await base.changerEtatMission(SOC, id, "en_cours", "blocage")).toBe(false);
    expect((await base.lireMission(SOC, id))!.etat).toBe("prete");
    expect(await base.changerEtatMission(SOC, id, "prete", "en_cours")).toBe(true);
    expect((await base.lireMission(SOC, id))!.etat).toBe("en_cours");
    expect(await base.changerEtatMission(SOC, id, "prete", "en_cours")).toBe(false);
    const maj = appels.find((a) => /^update \w+\.missions set etat/u.test(a.sql))!;
    expect(maj.sql.replace(/\s+/gu, " ")).toContain("where company_id = $1 and id = $2 and etat = $3");
  });

  it("sortir de blocage vers pause, annulee ou echec n'incrémente pas cycle_blocage (aucune reprise consommée)", async () => {
    for (const cible of ["pause", "annulee", "echec"] as const) {
      const { db, appels } = fauxDb();
      const base = creerBase(db);
      const id = await base.creerMission({ companyId: SOC, gabaritCle: "g", gabaritVersion: 1, contratId: "c", contratVersion: 1, mandat: "m" });
      expect(await base.changerEtatMission(SOC, id, "prete", "blocage")).toBe(true);
      expect(await base.changerEtatMission(SOC, id, "blocage", cible)).toBe(true);
      expect(appels.map((a) => a.sql)).not.toContainEqual(expect.stringContaining("cycle_blocage"));
      expect((await base.lireMission(SOC, id))).toMatchObject({ etat: cible, cycleBlocage: 0 });
    }
  });

  it("sortir de blocage incrémente cycle_blocage dans le même UPDATE, tout autre changement non", async () => {
    const { db, appels } = fauxDb();
    const base = creerBase(db);
    const id = await base.creerMission({ companyId: SOC, gabaritCle: "g", gabaritVersion: 1, contratId: "c", contratVersion: 1, mandat: "m" });
    const majs = () => appels.filter((a) => /^update \w+\.missions set etat/u.test(a.sql));
    expect(await base.changerEtatMission(SOC, id, "prete", "en_cours")).toBe(true);
    expect(await base.changerEtatMission(SOC, id, "en_cours", "blocage")).toBe(true);
    expect(majs().map((a) => a.sql)).not.toContainEqual(expect.stringContaining("cycle_blocage"));
    expect((await base.lireMission(SOC, id))!.cycleBlocage).toBe(0);
    const avant = majs().length;
    expect(await base.changerEtatMission(SOC, id, "blocage", "prete")).toBe(true);
    // Un seul UPDATE : le compteur et l'état changent ensemble ou pas du tout.
    expect(majs()).toHaveLength(avant + 1);
    expect(majs().at(-1)!.sql.replace(/\s+/gu, " ")).toContain("cycle_blocage = cycle_blocage + 1");
    expect((await base.lireMission(SOC, id))).toMatchObject({ etat: "prete", cycleBlocage: 1 });
    expect(await base.changerEtatMission(SOC, id, "blocage", "prete")).toBe(false);
    expect((await base.lireMission(SOC, id))!.cycleBlocage).toBe(1);
  });

  it("une étape est relue ; la même (mission, rang, tentative) est refusée, une autre tentative passe", async () => {
    const { db } = fauxDb();
    const base = creerBase(db);
    const e = { companyId: SOC, missionId: MISSION, rang: 1, role: "redacteur", etat: "prete", entree: { brief: "x" } };
    const id = await base.creerEtape(e);
    expect(await base.lireEtapes(SOC, MISSION)).toEqual([expect.objectContaining({ id, rang: 1, role: "redacteur", tentative: 1, etat: "prete", entree: { brief: "x" }, sortie: null, delaiLe: null, issueId: null })]);
    await expect(base.creerEtape(e)).rejects.toThrow(/unique/u);
    await base.creerEtape({ ...e, tentative: 2 });
    expect(await base.lireEtapes(SOC, MISSION)).toHaveLength(2);
  });

  it("majEtape : ne met à jour que les champs fournis, rien si aucun", async () => {
    const { db, appels } = fauxDb();
    const base = creerBase(db);
    expect(await base.majEtape(SOC, "e-1", {})).toBe(false);
    expect(appels).toHaveLength(0);
    await base.majEtape(SOC, "e-1", { etat: "terminee", sortie: { ok: true } });
    expect(appels[0]!.sql).toContain("set etat = $3, sortie = $4::jsonb, modifie_le = now() where company_id = $1 and id = $2");
    expect(appels[0]!.params).toEqual([SOC, "e-1", "terminee", '{"ok":true}']);
  });

  it("enregistrerExecution : vrai pour une clé neuve, faux au rejeu ; marquerExecution passe la clé à appliquee", async () => {
    const { db, appels } = fauxDb();
    const base = creerBase(db);
    const e = { companyId: SOC, missionId: MISSION, rang: 1, type: "creation_tache" as const, cle: `${MISSION}:1:1:demarrage` };
    expect(await base.enregistrerExecution(e)).toBe(true);
    expect(await base.enregistrerExecution(e)).toBe(false);
    expect(await base.enregistrerExecution({ ...e, companyId: "22222222-2222-4222-8222-222222222222" })).toBe(true);
    expect(await base.marquerExecution(SOC, e.cle, "appliquee")).toBe(true);
    const maj = appels.at(-1)!;
    expect(maj.sql).toContain("set statut = $3");
    expect(maj.params).toEqual([SOC, e.cle, "appliquee"]);
  });
});
