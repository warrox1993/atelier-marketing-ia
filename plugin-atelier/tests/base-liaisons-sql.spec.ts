/**
 * Stock du bureau de liaison : les écritures passent par `ctx.db.execute`, jamais par `ctx.db.query`.
 * L'hôte refuse tout ce qui n'est pas un SELECT dans `query` (« ctx.db.query only allows SELECT statements »,
 * constaté sur une vraie instance le 16/10/2026 : `liaison.decider` rendait une erreur 500) ; le faux hôte ci-dessous
 * applique les mêmes règles que paperclip/server/src/services/plugin-database.ts.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ESPACE_BASE } from "../src/contrats/index.js";
import { creerStockLiaisons } from "../src/serveur/liaisons/base-liaisons.js";

function fauxHote(lignesTouchees: number) {
  const execute: string[] = [];
  const parametres: unknown[][] = [];
  const lectures: string[] = [];
  const db = {
    namespace: ESPACE_BASE,
    query: async (sql: string, params: unknown[] = []) => {
      if (!/^\s*(select|with)\s/iu.test(sql)) throw new Error("ctx.db.query only allows SELECT statements");
      if (params.some((p) => Array.isArray(p))) throw new Error("l'hôte aplatit les paramètres tableau : passer une chaîne JSON");
      lectures.push(sql);
      return [];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      if (params.some((p) => Array.isArray(p))) throw new Error("l'hôte aplatit les paramètres tableau : passer une chaîne JSON");
      parametres.push(params);
      if (!/^\s*(insert\s+into|update|delete\s+from)\b/iu.test(sql)) throw new Error("ctx.db.execute only allows INSERT, UPDATE, or DELETE");
      execute.push(sql);
      return { rowCount: lignesTouchees };
    },
  } as unknown as PluginContext["db"];
  return { db, execute, parametres, lectures };
}

describe("stock des liaisons : règles SQL de l'hôte", () => {
  it("transiter écrit par execute et rend vrai quand une ligne a changé", async () => {
    const { db, execute, parametres } = fauxHote(1);
    const gagne = await creerStockLiaisons(db).transiter("c", "l", ["en_attente_approbation"], { statut: "ouverte" });
    expect(gagne).toBe(true);
    expect(execute).toHaveLength(1);
    expect(parametres[0]![2]).toBe('["en_attente_approbation"]');
    expect(execute[0]).not.toMatch(/any\(/u);
  });

  it("transiter rend faux quand aucune ligne n'a changé (déjà décidée)", async () => {
    const { db } = fauxHote(0);
    expect(await creerStockLiaisons(db).transiter("c", "l", ["en_attente_approbation"], { statut: "refusee", repondu: true })).toBe(false);
  });
});

describe("file de sortie du facteur : règles SQL de l'hôte", () => {
  it("les réservations, notes d'erreur, notifications et relances écrivent par execute, sans paramètre tableau", async () => {
    const { db, execute } = fauxHote(1);
    const stock = creerStockLiaisons(db);
    expect(await stock.reserverEssai("c", "l", 15_000, 8)).toBe(true);
    await stock.noterErreurFacteur("c", "l", "x".repeat(900));
    expect(await stock.marquerNotifiee("c", "l")).toBe(true);
    await stock.relancerFacteur("c", "l");
    await stock.attacher("c", "l", { tacheCible: "00000000-0000-4000-8000-000000000001" });
    expect(execute).toHaveLength(5);
    expect(execute[0]).toMatch(/facteur_essais < \$4/u);
    expect(execute[2]).toMatch(/source_notifiee_le is null/u);
  });

  it("la réservation et la notification rendent faux quand aucune ligne n'a changé (déjà prises)", async () => {
    const { db } = fauxHote(0);
    const stock = creerStockLiaisons(db);
    expect(await stock.reserverEssai("c", "l", 15_000, 8)).toBe(false);
    expect(await stock.marquerNotifiee("c", "l")).toBe(false);
  });

  it("les files se lisent par query (SELECT) avec le plafond d'essais et l'échéance", async () => {
    const { db, lectures } = fauxHote(0);
    const stock = creerStockLiaisons(db);
    expect(await stock.listerATransmettre(20, 8)).toEqual([]);
    expect(await stock.listerANotifier(20, 8)).toEqual([]);
    expect(lectures[0]).toMatch(/statut = 'ouverte' and tache_cible_id is null and facteur_essais < \$2/u);
    expect(lectures[1]).toMatch(/statut in \('repondue', 'annulee'\) and source_notifiee_le is null/u);
  });
});

describe("chaîne et teinte (migration 017) : règles SQL de l'hôte", () => {
  it("liaisonsEntrantes et retourTeinte lisent par query, la liste des tâches en JSON (jamais un paramètre tableau)", async () => {
    const { db, lectures } = fauxHote(0);
    const stock = creerStockLiaisons(db);
    expect(await stock.liaisonsEntrantes("c", ["AAAAAAAA-0000-4000-8000-000000000001"])).toEqual([]);
    expect(await stock.retourTeinte("c", ["AAAAAAAA-0000-4000-8000-000000000001"])).toBe(false);
    expect(lectures[0]).toMatch(/entreprise_cible_id = \$1 and tache_cible_id::text in \(select jsonb_array_elements_text\(\$2::jsonb\)\)/u);
    expect(lectures[1]).toMatch(/company_id = \$1 and teinte_retour = true and tache_origine_id::text in/u);
    // Aucune tâche : aucune requête.
    expect(await stock.liaisonsEntrantes("c", [])).toEqual([]);
    expect(lectures).toHaveLength(2);
  });

  it("prudence (revue de f525e9b) : liaisons reçues ouvertes et transmises, réponses teintées récentes d'abord, sans paramètre tableau", async () => {
    const { db, lectures } = fauxHote(0);
    const stock = creerStockLiaisons(db);
    expect(await stock.liaisonsEntrantesOuvertes("c")).toEqual([]);
    expect(await stock.retoursTeintesDe("c", 7, 200)).toEqual([]);
    expect(lectures[0]).toMatch(/where entreprise_cible_id = \$1 and statut = 'ouverte' and tache_cible_id is not null/u);
    expect(lectures[1]).toMatch(/coalesce\(repondu_le > now\(\) - make_interval\(days => \$2::int\), true\) as recente/u);
    expect(lectures[1]).toMatch(/company_id = \$1 and teinte_retour = true order by repondu_le desc nulls first limit \$3/u);
  });

  it("transiter marque la teinte sans jamais la retirer ; inserer écrit chaîne, profondeur et approbation", async () => {
    const { db, execute, parametres } = fauxHote(1);
    const stock = creerStockLiaisons(db);
    await stock.transiter("c", "l", ["ouverte"], { statut: "repondue", reponse: "r", repondu: true, teinte: true });
    expect(execute[0]).toMatch(/teinte_retour = teinte_retour or \$7::boolean/u);
    expect(parametres[0]![6]).toBe(true);
    await stock.transiter("c", "l", ["ouverte"], { statut: "annulee", repondu: true });
    expect(parametres[1]![6]).toBe(false);
    await stock.inserer({
      id: "l", entrepriseSource: "c", entrepriseCible: "d", tacheOrigine: "t", tacheCible: null, statut: "ouverte", objet: "o", extraits: [], creeLe: "", reponduLe: null,
      serviceSource: "marketing", serviceCible: "direction", question: "q", cleIdempotence: "k", interactionId: null, demandePar: "a",
      chaine: ["marketing", "direction"], profondeur: 1, approbationRequise: false,
    });
    expect(execute[2]).toMatch(/chaine, profondeur, approbation_requise\)/u);
    expect(parametres[2]!.slice(14)).toEqual(['["marketing","direction"]', 1, false]);
  });

  it("declarer écrit l'origine des flux (fournie, sinon déduite de l'objet) et fluxDuClient la relit", async () => {
    const { db, execute, parametres } = fauxHote(1);
    const stock = creerStockLiaisons(db);
    await stock.declarer({
      clientMarqueur: "c", entreprises: [], par: "t",
      flux: [
        { source: "a", cible: "b", objet: "Relecture", approbationHumaine: false },
        { source: "b", cible: "a", objet: "Liaison entre coordinateurs (compétence protocole-inter-coordinateurs) : x", approbationHumaine: false },
        { source: "a", cible: "c", objet: "Relecture", approbationHumaine: false, origine: "coordinateurs" },
      ],
    });
    const ecritures = execute.map((sql, i) => ({ sql, p: parametres[i]! })).filter((x) => /into [\w.]+flux_services/u.test(x.sql));
    expect(ecritures).toHaveLength(3);
    for (const e of ecritures) expect(e.sql).toMatch(/\(client_marqueur, source_slug, cible_slug, objet, approbation_humaine, origine\)/u);
    expect(ecritures.map((e) => e.p[5])).toEqual(["metier", "coordinateurs", "coordinateurs"]);
  });
});

describe("déclaration des services en deux temps (revue du 19/10/2026, E1) : règles SQL", () => {
  it("tous les lecteurs du stock ignorent les lignes non confirmées", async () => {
    const { db, lectures } = fauxHote(0);
    const stock = creerStockLiaisons(db);
    await stock.serviceDeEntreprise("c");
    await stock.clientExiste("m");
    await stock.servicesParSlug("marketing");
    await stock.servicesDuClient("m");
    expect(lectures).toHaveLength(4);
    for (const sql of lectures) expect(sql).toMatch(/services_entreprises where .*confirme_le is not null/u);
  });

  it("le registre des échanges ne retient que les entreprises confirmées du client", async () => {
    const { db, lectures } = fauxHote(0);
    const { creerLectureLiaisons } = await import("../src/serveur/liaisons/lecture-liaisons.js");
    await creerLectureLiaisons(db).registre("m", {}, 20, 0);
    expect(lectures[0]).toMatch(/services_entreprises where client_marqueur = \$1 and confirme_le is not null/u);
  });

  it("declarer : seule une ligne du même client ou non confirmée est reprise, une ligne confirmée du même client le reste", async () => {
    const { db, execute, parametres } = fauxHote(1);
    await creerStockLiaisons(db).declarer({
      clientMarqueur: "m", par: "u", flux: [],
      entreprises: [{ companyId: "a", serviceSlug: "direction", estDirection: true, confirmee: true }, { companyId: "b", serviceSlug: "marketing", estDirection: false, confirmee: false }],
    });
    const insertions = execute.filter((s) => /insert into \S+\.services_entreprises/u.test(s));
    expect(insertions).toHaveLength(2);
    expect(insertions[0]).toMatch(/where \S+\.services_entreprises\.client_marqueur = excluded\.client_marqueur or \S+\.services_entreprises\.confirme_le is null/u);
    expect(insertions[0]).toMatch(/confirme_le = case when \S+\.client_marqueur = excluded\.client_marqueur and \S+\.confirme_le is not null\s+then \S+\.confirme_le else excluded\.confirme_le end/u);
    expect(parametres[0]![5]).toBe(true);
    expect(parametres[1]![5]).toBe(false);
  });

  it("confirmer écrit par execute, ne touche que les lignes non confirmées et rend vrai si une ligne a changé", async () => {
    const a = fauxHote(1);
    expect(await creerStockLiaisons(a.db).confirmer("c")).toBe(true);
    expect(a.execute[0]).toMatch(/update \S+\.services_entreprises set confirme_le = now\(\) where company_id = \$1 and confirme_le is null/u);
    expect(await creerStockLiaisons(fauxHote(0).db).confirmer("c")).toBe(false);
  });

  it("M5 : la sélection des liaisons à relayer est faite en SQL (tâche cible in_review) avec un curseur, sans paramètre tableau", async () => {
    const { db, lectures } = fauxHote(0);
    const stock = creerStockLiaisons(db);
    await stock.listerOuvertesTransmises(50, "liaison-9");
    await stock.listerOuvertesTransmises(50);
    expect(lectures).toHaveLength(2);
    expect(lectures[0]).toContain("t.status = 'in_review'");
    expect(lectures[0]).toContain("join public.issues t on t.id = l.tache_cible_id and t.company_id = l.entreprise_cible_id");
    expect(lectures[0]).toContain("l.id::text > $2::text");
    expect(lectures[0]).toContain("order by l.id::text limit $1");
  });
});

