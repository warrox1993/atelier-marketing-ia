// Dépôt dans l'atelier : le corps envoyé à la route EXISTANTE du plugin (prospects.particuliers.enregistrer) porte la preuve de
// consentement complète, la tâche « rappeler sous 24 h » est créée pour la Prospection, et un échec de la tâche ne perd pas le
// prospect. La validation par le VRAI schéma et la VRAIE route du plugin est faite dans plugin-atelier/tests/captation-formulaire.spec.ts.

import { describe, expect, it } from "vitest";
import { DepotAtelier, ErreurDepot, type EnvoiVisiteur } from "../../src/pages/depot-atelier.js";
import type { PageDestination } from "../../src/pages/magasin.js";

const ENTREPRISE = "123e4567-e89b-42d3-a456-426614174000";
const page: PageDestination = {
  slug: "isolation-toiture-aaaa1111", entrepriseId: ENTREPRISE, titre: "Isolation de toiture", accroche: "Une accroche valable.", offreType: "rappel_conseiller",
  offreIntitule: "Diagnostic gratuit", offreDescription: "Description.", responsable: "Toitures Exemple SRL", contactConfidentialite: "vie-privee@exemple.test",
  texteConsentement: "J'accepte que Toitures Exemple SRL utilise mon nom et mon numéro de téléphone pour me recontacter.", creeLe: "2026-10-22T10:00:00.000Z",
};
const envoi: EnvoiVisiteur = {
  nom: "Camille Dupont", telephone: "+32470123456", courriel: null, creneau: "matin", libelleCreneau: "Matin (9 h à 12 h)", envoiId: "envoi-1",
  ipTronquee: "203.0.113.0", recuLe: new Date("2026-10-22T10:05:00Z"),
};
const R = { api: "http://127.0.0.1:3100/api", plugin: "atelier.marketing-ia", cleBoard: null, urlPages: "http://127.0.0.1:3195" };

function faux(opts: { tacheEchoue?: boolean; prospectStatut?: number } = {}) {
  const appels: Array<{ methode: string; url: string; corps: unknown }> = [];
  const f = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = String(url);
    const corps = init?.body ? JSON.parse(String(init.body)) : undefined;
    appels.push({ methode: init?.method ?? "GET", url: u, corps });
    if (u.endsWith("/prospects/particuliers")) return new Response(JSON.stringify({ id: "prospect-42" }), { status: opts.prospectStatut ?? 201 });
    if (u.endsWith("/agents")) return new Response(JSON.stringify([{ id: "agent-9", name: "Prospection", status: "idle" }, { id: "agent-8", name: "Prospection", status: "terminated" }]), { status: 200 });
    if (u.endsWith("/issues")) return opts.tacheEchoue ? new Response(JSON.stringify({ message: "boum" }), { status: 500 }) : new Response(JSON.stringify({ id: "tache-7" }), { status: 201 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { appels, f };
}

describe("corps du prospect", () => {
  it("porte l'origine formulaire_entrant et une preuve complète", () => {
    const d = new DepotAtelier(R, faux().f);
    const corps = d.corpsProspect(page, envoi);
    expect(corps["companyId"]).toBe(ENTREPRISE);
    expect(Object.keys(corps).sort()).toEqual(["companyId", "consentements", "coordonnees", "origine", "referentiel", "zone"]);
    const c = (corps["consentements"] as Array<Record<string, unknown>>)[0]!;
    expect(corps["origine"]).toBe("formulaire_entrant");
    expect(c["texteAccepte"]).toBe(page.texteConsentement);
    expect(c["date"]).toBe("2026-10-22T10:05:00.000Z");
    expect(c["source"]).toBe("http://127.0.0.1:3195/p/isolation-toiture-aaaa1111");
    expect(String(c["reference"])).toContain("IP 203.0.113.0");
    expect(String(c["reference"])).toContain("numéro de téléphone donné par la personne");
    expect(c["canauxAutorises"]).toEqual(["telephone"]);
    expect(c["retireLe"]).toBeNull();
    expect(c["pageCaptation"]).toBe("http://127.0.0.1:3195/p/isolation-toiture-aaaa1111");
    expect(c["adresseIpTronquee"]).toBe("203.0.113.0");
  });
  it("n'envoie pas d'adresse tronquée quand l'adresse est inconnue (le registre affiche « non conservée »)", () => {
    const d = new DepotAtelier(R, faux().f);
    const c = (d.corpsProspect(page, { ...envoi, ipTronquee: "inconnue" })["consentements"] as Array<Record<string, unknown>>)[0]!;
    expect(c).not.toHaveProperty("adresseIpTronquee");
    expect(c["pageCaptation"]).toBe("http://127.0.0.1:3195/p/isolation-toiture-aaaa1111");
  });
  it("autorise le canal courriel seulement si l'adresse a été donnée", () => {
    const d = new DepotAtelier(R, faux().f);
    const c = (d.corpsProspect(page, { ...envoi, courriel: "[REDACTED-EMAIL-0e1a1773]" })["consentements"] as Array<{ canauxAutorises: string[] }>)[0]!;
    expect(c.canauxAutorises).toEqual(["telephone", "courriel"]);
  });
});

describe("dépôt", () => {
  it("crée le prospect puis la tâche assignée à la Prospection (agent non terminé), échéance 24 h, sans coordonnées dans la tâche", async () => {
    const { appels, f } = faux();
    const r = await new DepotAtelier(R, f).deposer(page, envoi);
    expect(r).toEqual({ prospectId: "prospect-42", nouveau: true, tacheId: "tache-7", tacheErreur: null });
    const tache = appels.find((a) => a.url.endsWith("/issues"))!.corps as { title: string; description: string; assigneeAgentId: string };
    expect(tache.assigneeAgentId).toBe("agent-9");
    expect(tache.title).toContain("Rappeler sous 24 h");
    expect(tache.description).toContain("2026-10-23T10:05:00.000Z");
    expect(tache.description).not.toContain("Camille");
    expect(tache.description).not.toContain("+32470123456");
  });
  it("un échec de la tâche ne perd pas le prospect et est signalé", async () => {
    const r = await new DepotAtelier(R, faux({ tacheEchoue: true }).f).deposer(page, envoi);
    expect(r.prospectId).toBe("prospect-42");
    expect(r.tacheId).toBeNull();
    expect(r.tacheErreur).toContain("HTTP 500");
  });
  it("un refus de la route prospect lève une erreur (le serveur de pages libère alors le jeton)", async () => {
    const f = (async () => new Response(JSON.stringify({ message: "refusé" }), { status: 422 })) as unknown as typeof fetch;
    await expect(new DepotAtelier(R, f).deposer(page, envoi)).rejects.toBeInstanceOf(ErreurDepot);
  });
});
