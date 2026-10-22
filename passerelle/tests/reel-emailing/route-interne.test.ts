// Route interne du serveur (POST /interne/emailing/envoyer) : seulement POST, JSON, Host/Origin contrôlés, réponse de la route relayée.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demarrer, type PasserelleDeTest } from "../aide.js";

describe("serveur : routes internes", () => {
  let p: PasserelleDeTest;
  const recus: unknown[] = [];
  beforeAll(async () => {
    p = await demarrer({ routesInternes: [{ chemin: "/interne/essai", traiter: async (corps) => { recus.push(corps); return { statut: 202, corps: { recu: true } }; } }] });
  });
  afterAll(async () => { await p.arreter(); });

  const post = (corps: string, entetes: Record<string, string> = {}) =>
    fetch(`${p.url}/interne/essai`, { method: "POST", headers: { "content-type": "application/json", ...entetes }, body: corps });

  it("relaie le corps JSON à la route et renvoie son statut", async () => {
    const r = await post(JSON.stringify({ a: 1 }));
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ recu: true });
    expect(recus).toEqual([{ a: 1 }]);
  });
  it("refuse un JSON illisible, un corps trop gros, un GET et une origine étrangère", async () => {
    const avant = recus.length;
    expect((await post("{pas du json")).status).toBe(400);
    expect((await post(JSON.stringify({ x: "y".repeat(1_100_000) }))).status).toBe(413);
    expect((await fetch(`${p.url}/interne/essai`)).status).toBe(404);
    expect((await post("{}", { origin: "https://exemple.test" })).status).toBe(403);
    expect(recus.length).toBe(avant);
  });
});
