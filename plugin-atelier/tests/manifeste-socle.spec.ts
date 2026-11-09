/**
 * Le manifeste du plugin doit passer le schéma du socle (`pluginManifestV1Schema` de @paperclipai/shared),
 * celui que le chargeur applique à l'activation. Leçon du 22/10/2026 : une clé de route avec une majuscule
 * (`emailing.demanderEnvoi`) passait tous les tests du plugin mais mettait le plugin en erreur au démarrage.
 * Le chargeur est le socle PATCHÉ : le serveur lit @paperclipai/shared dans paperclip/packages/shared/src (exports
 * vers src) ; le paquet npm 2026.1023.0 du plugin ignore les patches (0124 : issue_thread_interactions, HUM-C4).
 */
import { beforeAll, describe, expect, it } from "vitest";
import manifest from "../src/manifest.js";

const SCHEMA_DU_SOCLE = new URL("../../paperclip/packages/shared/src/index.ts", import.meta.url).href;
let pluginManifestV1Schema: (typeof import("@paperclipai/shared"))["pluginManifestV1Schema"];
beforeAll(async () => {
  ({ pluginManifestV1Schema } = (await import(SCHEMA_DU_SOCLE)) as typeof import("@paperclipai/shared"));
});

describe("manifeste : schéma du socle", () => {
  it("est accepté tel quel par pluginManifestV1Schema", () => {
    const r = pluginManifestV1Schema.safeParse(manifest);
    expect(r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`)).toEqual([]);
  });
  it("chaque clé de route respecte la forme exigée par le socle (minuscules, chiffres, . : _ -)", () => {
    const fautives = (manifest.apiRoutes ?? []).map((r) => r.routeKey).filter((k) => !/^[a-z0-9][a-z0-9._:-]*$/u.test(k));
    expect(fautives).toEqual([]);
  });
  it("déclare la capacité agent.tools.register et les cinq outils de la fabrique et les six du moteur (le socle l'exige dès qu'un outil est déclaré)", () => {
    expect(manifest.capabilities).toContain("agent.tools.register");
    expect((manifest.tools ?? []).map((t) => t.name).sort()).toEqual(["arbitrage_deposer", "decision_demander", "etat_fabrication", "fabriquer_document", "fabriquer_image", "fabriquer_video", "livrable_deposer", "mission_etat", "sources_lister", "verdict_deposer", "voir_rendu"]);
    const sansCapacite = { ...manifest, capabilities: manifest.capabilities.filter((c) => c !== "agent.tools.register") };
    expect(pluginManifestV1Schema.safeParse(sansCapacite).success).toBe(false);
  });
});
