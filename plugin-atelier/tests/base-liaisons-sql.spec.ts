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
});
