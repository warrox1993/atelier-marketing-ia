/**
 * Lot 2 : route `base-clients.importer-demo` (rechargement de la base clients de démonstration),
 * à travers l'aiguillage réel et les services. Base de l'atelier en mémoire (banc `outils-base.ts`,
 * complété des quatre méthodes de la base de clients). Le classeur est celui de
 * `instance/demo/base-clients/base-clients.xlsx`, retrouvé en remontant les dossiers.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { creerAiguillage } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import { creerServices } from "../src/serveur/services.js";
import { CORRESPONDANCE_DEMO } from "../src/serveur/services-demo.js";
import { SOC, creerBanc } from "./outils-base.js";

const AGENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const HUMAIN = "local-board";
type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function banc(o: { modeEntreprise?: "demonstration" | "reel"; dossierBaseClients?: string } = {}) {
  const b = creerBanc({ modeEntreprise: o.modeEntreprise ?? "demonstration" });
  const t = { imports: [] as Ligne[], clients: [] as Ligne[] };
  const copie = <T>(v: T): T => structuredClone(v);
  const ext: Record<string, unknown> = {
    insererImportBaseClients: async (i: Ligne) => void t.imports.push(copie(i)),
    insererClients: async (_c: string, cl: Ligne[]) => void t.clients.push(...copie(cl)),
    supprimerBaseClients: async (c: string) => {
      const avant = { clients: t.clients.length, imports: t.imports.length };
      t.clients = t.clients.filter((x) => x.companyId !== c);
      t.imports = t.imports.filter((x) => x.companyId !== c);
      return { clients: avant.clients - t.clients.length, imports: avant.imports - t.imports.length };
    },
  };
  const base = new Proxy(b.base as unknown as Ligne, { get: (cible, cle) => (cle in ext ? ext[cle as string] : cible[cle as string]) }) as unknown as BaseAtelier;
  const aiguillage = creerAiguillage(b.ctx, creerServices(b.ctx, { base, ...(o.dossierBaseClients ? { demo: { dossierBaseClients: o.dossierBaseClients } } : {}) }));
  async function appeler(corps: unknown, o2: { agent?: boolean } = {}) {
    return aiguillage.traiterRequeteApi({
      routeKey: "base-clients.importer-demo", method: "POST", path: "/base-clients/demonstration", params: {}, query: {}, body: corps,
      actor: o2.agent ? { actorType: "agent", actorId: AGENT, agentId: AGENT, runId: "run-1" } : { actorType: "user", actorId: HUMAIN, userId: HUMAIN, runId: null },
      companyId: SOC, headers: {},
    } as never) as Promise<{ status: number; body: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  return { ...b, t, appeler };
}

describe("base-clients.importer-demo", () => {
  it("la correspondance des 18 colonnes est celle du script d'import (deux colonnes ignorées)", () => {
    expect(CORRESPONDANCE_DEMO).toHaveLength(18);
    expect(CORRESPONDANCE_DEMO.filter((c) => c.cible === "ignorer").map((c) => c.colonne)).toEqual(["bureau", "entite"]);
    expect(CORRESPONDANCE_DEMO.find((c) => c.colonne === "date_debut")?.cible).toBe("debut_contrat");
  });

  it("en démonstration, un humain importe les 105 clients du classeur, et un second appel remplace la base", async () => {
    const f = banc();
    const r = await f.appeler({ companyId: SOC });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ nomFichier: "base-clients.xlsx", format: "xlsx", lignesRetenues: 105, lignesRejetees: 0, mode: "demonstration" });
    expect(f.t.clients).toHaveLength(105);
    const encore = await f.appeler({ companyId: SOC });
    expect(encore.status).toBe(201);
    expect(f.t.clients).toHaveLength(105);
    expect(f.t.imports).toHaveLength(1);
  });

  it("refuse un agent (403), une entreprise en mode réel (409) et une entreprise incohérente (404), sans rien importer", async () => {
    const f = banc();
    expect((await f.appeler({ companyId: SOC }, { agent: true })).status).toBe(403);
    expect((await f.appeler({ companyId: "22222222-2222-4222-8222-222222222222" })).status).toBe(404);
    const reel = banc({ modeEntreprise: "reel" });
    const r = await reel.appeler({ companyId: SOC });
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).toContain("mode réel");
    expect(f.t.clients).toHaveLength(0);
    expect(reel.t.clients).toHaveLength(0);
  });

  it("classeur introuvable : 404 explicite", async () => {
    const vide = mkdtempSync(join(tmpdir(), "demo-vide-"));
    try {
      const r = await banc({ dossierBaseClients: vide }).appeler({ companyId: SOC });
      expect(r.status).toBe(404);
      expect(JSON.stringify(r.body)).toContain("base-clients.xlsx");
    } finally {
      rmSync(vide, { recursive: true, force: true });
    }
  });
});
