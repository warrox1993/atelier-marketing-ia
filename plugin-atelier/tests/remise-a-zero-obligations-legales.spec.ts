/**
 * Faille M1 : la remise à zéro des données (`atelier.donnees.reinitialiser`) ne doit JAMAIS effacer les
 * oppositions RGPD, les listes « Ne m'appelez plus » (DNCM), les bases légales ni le journal d'audit.
 *
 * La base réelle (`creerBase`) tourne sur une petite base en mémoire qui interprète le SQL émis par la
 * remise à zéro, y compris la cascade de la clé étrangère `bases_legales.prospect_id` (ON DELETE CASCADE),
 * pour prouver le résultat (lignes restantes) et pas seulement la forme des requêtes.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ESPACE_BASE } from "../src/contrats/index.js";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { TABLES_CONSERVEES, TABLES_REMISE_A_ZERO, creerBase } from "../src/serveur/base.js";
import { creerServices } from "../src/serveur/services.js";
import { SOC, creerBanc } from "./outils-base.js";

const AUTRE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const humain: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
type Ligne = Record<string, unknown>;

function baseEnMemoire() {
  const tables = new Map<string, Ligne[]>();
  const lignes = (t: string) => {
    if (!tables.has(t)) tables.set(t, []);
    return tables.get(t)!;
  };
  const ns = ESPACE_BASE;
  const db = {
    namespace: ns,
    async query(sql: string, params: unknown[] = []) {
      const comptes = [...sql.matchAll(/\(select count\(\*\) from \w+\.(\w+) where company_id = \$1[^)]*\) as (\w+)/gu)];
      if (comptes.length === 0) return [];
      const r: Ligne = {};
      for (const [, t, alias] of comptes) {
        const filtreReel = new RegExp(`from \\w+\\.${t} where company_id = \\$1 and mode = 'reel'`, "u").test(sql);
        r[alias!] = String(lignes(t!).filter((l) => l.company_id === params[0] && (!filtreReel || l.mode === "reel")).length);
      }
      return [r];
    },
    async execute(sql: string, params: unknown[] = []) {
      const ins = /^insert into \w+\.(\w+)/u.exec(sql);
      if (ins) {
        lignes(ins[1]!).push({ company_id: params[0], type: params[1] });
        return { rowCount: 1 };
      }
      const del = /^delete from \w+\.(\w+)(?: p)? where (?:p\.)?company_id = \$1(.*)$/su.exec(sql);
      if (!del) throw new Error(`SQL non simulé : ${sql}`);
      const [, table, reste] = del;
      if (reste!.trim() && !/^and not exists \(select 1 from \w+\.bases_legales b where b\.prospect_id = p\.id\)$/u.test(reste!.trim())) {
        throw new Error(`condition non simulée : ${sql}`);
      }
      const gardes = reste!.trim() ? new Set(lignes("bases_legales").map((b) => b.prospect_id)) : new Set();
      const avant = lignes(table!);
      const apres = avant.filter((l) => l.company_id !== params[0] || gardes.has(l.id));
      tables.set(table!, apres);
      if (table === "prospects") {
        // Cascade réelle de la clé étrangère bases_legales.prospect_id → prospects(id) ON DELETE CASCADE.
        const restants = new Set(apres.map((l) => l.id));
        tables.set("bases_legales", lignes("bases_legales").filter((b) => restants.has(b.prospect_id)));
      }
      return { rowCount: avant.length - apres.length };
    },
  };
  return { tables, lignes, base: creerBase(db as unknown as PluginContext["db"]) };
}

function remplir(m: ReturnType<typeof baseEnMemoire>, soc: string) {
  m.lignes("oppositions").push({ company_id: soc, id: `${soc}-o1` }, { company_id: soc, id: `${soc}-o2` });
  m.lignes("listes_dncm").push({ company_id: soc, id: `${soc}-l1` });
  m.lignes("dncm_empreintes").push({ company_id: soc, liste_id: `${soc}-l1` }, { company_id: soc, liste_id: `${soc}-l1` }, { company_id: soc, liste_id: `${soc}-l1` });
  m.lignes("journal").push({ company_id: soc, type: "prospects.deposes" });
  m.lignes("prospects").push({ company_id: soc, id: `${soc}-p1` }, { company_id: soc, id: `${soc}-p2` }, { company_id: soc, id: `${soc}-p3` });
  m.lignes("bases_legales").push({ company_id: soc, id: `${soc}-b1`, prospect_id: `${soc}-p1` });
  m.lignes("prospects_scores").push({ company_id: soc, prospect_id: `${soc}-p2` });
  m.lignes("clients").push({ company_id: soc, id: `${soc}-c1` });
  m.lignes("sources").push({ company_id: soc, id: `${soc}-s1` });
  m.lignes("reglages_entreprise").push({ company_id: soc });
}

const compter = (m: ReturnType<typeof baseEnMemoire>, t: string, soc = SOC) => m.lignes(t).filter((l) => l.company_id === soc).length;

describe("M1 : la remise à zéro conserve les obligations légales", () => {
  it("aucune table légale n'est dans la liste des suppressions", () => {
    for (const t of TABLES_CONSERVEES) expect(TABLES_REMISE_A_ZERO as readonly string[]).not.toContain(t);
  });

  it("oppositions, DNCM, bases légales et journal intacts ; le reste est effacé ; le rapport dit ce qui est conservé", async () => {
    const m = baseEnMemoire();
    remplir(m, SOC);
    remplir(m, AUTRE);
    const services = creerServices(creerBanc().ctx, { base: m.base });
    const r = (await services.actions["atelier.donnees.reinitialiser"]!({ confirmation: "REINITIALISER" }, SOC, humain)) as {
      supprimes: Record<string, number>; conserves: Record<string, number>;
    };

    // Obligations légales : intactes.
    expect(compter(m, "oppositions")).toBe(2);
    expect(compter(m, "listes_dncm")).toBe(1);
    expect(compter(m, "dncm_empreintes")).toBe(3);
    expect(compter(m, "bases_legales")).toBe(1);
    expect(m.lignes("prospects").filter((p) => p.company_id === SOC).map((p) => p.id)).toEqual([`${SOC}-p1`]);
    // Le journal garde l'entrée d'avant et reçoit la trace de la remise à zéro.
    expect(m.lignes("journal").filter((l) => l.company_id === SOC).map((l) => l.type)).toEqual(["prospects.deposes", "donnees.reinitialisees"]);

    // Le reste est bien effacé.
    for (const t of ["prospects_scores", "clients", "sources", "reglages_entreprise"]) expect(compter(m, t)).toBe(0);
    expect(r.supprimes).toMatchObject({ prospects: 2, prospects_scores: 1, clients: 1, sources: 1, reglages_entreprise: 1 });
    for (const t of TABLES_CONSERVEES) expect(r.supprimes).not.toHaveProperty(t);

    // Le rapport dit ce qui a été conservé (compté après les suppressions, avant la trace de la remise à zéro).
    expect(r.conserves).toEqual({ oppositions: 2, listes_dncm: 1, dncm_empreintes: 3, bases_legales: 1, journal: 1, prospects_avec_base_legale: 1 });

    // Une autre entreprise n'est pas touchée.
    for (const t of ["oppositions", "prospects", "clients", "journal", "bases_legales"]) expect(compter(m, t, AUTRE)).toBe(t === "prospects" ? 3 : t === "oppositions" ? 2 : 1);
  });

  it("remises à zéro répétées : les oppositions ne disparaissent jamais", async () => {
    const m = baseEnMemoire();
    remplir(m, SOC);
    await m.base.supprimerDonneesEntreprise(SOC);
    await m.base.supprimerDonneesEntreprise(SOC);
    expect(compter(m, "oppositions")).toBe(2);
    expect(compter(m, "dncm_empreintes")).toBe(3);
    expect(compter(m, "bases_legales")).toBe(1);
  });
});
