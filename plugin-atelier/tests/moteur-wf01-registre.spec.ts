// Chaîne de prospection WF-01 : le registre ne promet à l'agent `prospection` que des services de prospection
// que la passerelle enregistre réellement (passerelle/src/reel/prospection/enregistrer.ts).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SERVICES_DE_PROSPECTION = ["bce", "bnb", "fsma", "osm", "b2c"];

function fournisseursEnregistres(): string[] {
  const source = readFileSync(resolve(RACINE, "passerelle/src/reel/prospection/enregistrer.ts"), "utf8");
  const bloc = /SERVICES_PROSPECTION_REELS\s*=\s*\[([^\]]*)\]/.exec(source);
  if (!bloc) throw new Error("SERVICES_PROSPECTION_REELS introuvable dans enregistrer.ts");
  return [...bloc[1]!.matchAll(/"([a-z0-9]+)"/g)].map((m) => m[1]!);
}

describe("registre WF-01 : connexions de l'agent prospection", () => {
  const registre = JSON.parse(readFileSync(resolve(RACINE, "organisation/registre/agents.json"), "utf8")) as {
    agents: Array<{ slug: string; connexions: Record<string, string> }>;
  };
  const prospection = registre.agents.find((a) => a.slug === "prospection");

  it("l'agent prospection existe", () => {
    expect(prospection).toBeDefined();
  });

  it("chaque service de prospection promis correspond à un fournisseur enregistré par la passerelle", () => {
    const promis = Object.keys(prospection!.connexions).filter((c) => SERVICES_DE_PROSPECTION.includes(c));
    const enregistres = fournisseursEnregistres();
    expect(enregistres).toEqual(expect.arrayContaining(["bce", "osm", "bnb"]));
    expect(promis.filter((c) => !enregistres.includes(c))).toEqual([]);
  });
});
