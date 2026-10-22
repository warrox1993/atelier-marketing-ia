/**
 * Le manifeste du plugin doit passer le schéma du socle (`pluginManifestV1Schema` de @paperclipai/shared),
 * celui que le chargeur applique à l'activation. Leçon du 22/10/2026 : une clé de route avec une majuscule
 * (`emailing.demanderEnvoi`) passait tous les tests du plugin mais mettait le plugin en erreur au démarrage.
 */
import { pluginManifestV1Schema } from "@paperclipai/shared";
import { describe, expect, it } from "vitest";
import manifest from "../src/manifest.js";

describe("manifeste : schéma du socle", () => {
  it("est accepté tel quel par pluginManifestV1Schema", () => {
    const r = pluginManifestV1Schema.safeParse(manifest);
    expect(r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`)).toEqual([]);
  });
  it("chaque clé de route respecte la forme exigée par le socle (minuscules, chiffres, . : _ -)", () => {
    const fautives = (manifest.apiRoutes ?? []).map((r) => r.routeKey).filter((k) => !/^[a-z0-9][a-z0-9._:-]*$/u.test(k));
    expect(fautives).toEqual([]);
  });
});
