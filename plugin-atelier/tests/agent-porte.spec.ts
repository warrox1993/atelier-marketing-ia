import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { patchDecisionPorte } from "../agents/decision-porte.mjs";
import { patchDecisionPorte as viaAncienChemin } from "../demo/decision-porte.mjs";

const PLUGIN = resolve(import.meta.dirname, "..");

describe("agent porte (agents/porte.mjs)", () => {
  it("échoue proprement, avec un message clair, sans variables d'environnement Paperclip", () => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([nom]) => !nom.startsWith("PAPERCLIP_")));
    const r = spawnSync("node", ["agents/porte.mjs"], { cwd: PLUGIN, env, encoding: "utf8", timeout: 20_000 });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("variable(s) d'environnement Paperclip manquante(s)");
    expect(r.stderr).toContain("PAPERCLIP_API_KEY");
  });

  it("l'ancien chemin demo/decision-porte.mjs ré-exporte le module déplacé", () => {
    expect(viaAncienChemin).toBe(patchDecisionPorte);
  });
});
