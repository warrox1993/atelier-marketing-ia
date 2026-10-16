// Tests unitaires et de parcours du serveur d'autorisation local :
// PKCE, enregistrement dynamique (DCR), page de consentement, code, jeton, rotation.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RegistreFournisseurs } from "../src/fournisseurs.js";
import {
  calculerChallengeS256,
  schemaEnregistrementClient,
  uriRedirectionAcceptable,
  verifierPkceS256,
} from "../src/oauth-local.js";
import {
  REDIRECTION_TEST,
  decider,
  demarrer,
  echangerCode,
  enregistrerClient,
  fournisseurFactice,
  nouveauPkce,
  obtenirJetons,
  ouvrirConsentement,
  rpc,
  urlAutorisation,
  type PasserelleDeTest,
} from "./aide.js";

describe("PKCE S256 (RFC 7636)", () => {
  // Vecteur de test de l'annexe B de la RFC 7636.
  const verificateurRfc = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challengeRfc = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("calcule le challenge du vecteur de la RFC", () => {
    expect(calculerChallengeS256(verificateurRfc)).toBe(challengeRfc);
  });

  it("accepte le bon vérificateur", () => {
    expect(verifierPkceS256(verificateurRfc, challengeRfc)).toBe(true);
  });

  it("refuse un autre vérificateur, un vérificateur trop court et un challenge mal formé", () => {
    expect(verifierPkceS256(`${verificateurRfc.slice(0, -1)}A`, challengeRfc)).toBe(false);
    expect(verifierPkceS256("court", challengeRfc)).toBe(false);
    expect(verifierPkceS256(verificateurRfc, "pas-un-challenge")).toBe(false);
    expect(verifierPkceS256(verificateurRfc, "")).toBe(false);
  });
});

describe("enregistrement dynamique de client (RFC 7591), schéma", () => {
  it("accepte la demande que fait Paperclip", () => {
    const r = schemaEnregistrementClient.safeParse({
      client_name: "Paperclip (127.0.0.1:3200)",
      redirect_uris: [REDIRECTION_TEST],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "web",
    });
    expect(r.success).toBe(true);
  });

  it.each([
    ["sans redirect_uris", {}],
    ["redirect_uris vide", { redirect_uris: [] }],
    ["http hors boucle locale", { redirect_uris: ["http://exemple.org/cb"] }],
    ["schéma javascript", { redirect_uris: ["javascript:alert(1)"] }],
    ["fragment", { redirect_uris: ["https://exemple.org/cb#x"] }],
    ["authentification par secret", { redirect_uris: [REDIRECTION_TEST], token_endpoint_auth_method: "client_secret_basic" }],
    ["type de réponse inconnu", { redirect_uris: [REDIRECTION_TEST], response_types: ["token"] }],
  ])("refuse : %s", (_nom, corps) => {
    expect(schemaEnregistrementClient.safeParse(corps).success).toBe(false);
  });

  it("n'accepte http que vers la boucle locale", () => {
    expect(uriRedirectionAcceptable("http://127.0.0.1:3100/cb")).toBe(true);
    expect(uriRedirectionAcceptable("http://localhost/cb")).toBe(true);
    expect(uriRedirectionAcceptable("https://exemple.org/cb")).toBe(true);
    expect(uriRedirectionAcceptable("http://192.168.1.10/cb")).toBe(false);
    expect(uriRedirectionAcceptable("pas une url")).toBe(false);
  });
});

describe("parcours OAuth local", () => {
  let p: PasserelleDeTest;
  beforeAll(async () => {
    p = await demarrer();
  });
  afterAll(async () => {
    await p.arreter();
  });

  it("publie les métadonnées du serveur d'autorisation et de la ressource", async () => {
    const serveur = await (await fetch(`${p.url}/.well-known/oauth-authorization-server`)).json();
    expect(serveur).toMatchObject({
      issuer: p.url,
      authorization_endpoint: `${p.url}/oauth/authorize`,
      token_endpoint: `${p.url}/oauth/token`,
      registration_endpoint: `${p.url}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      authorization_response_iss_parameter_supported: true,
    });
    const ressource = await (await fetch(`${p.url}/.well-known/oauth-protected-resource/mcp/gsc`)).json();
    expect(ressource).toMatchObject({ resource: `${p.url}/mcp/gsc`, authorization_servers: [p.url] });
  });

  it("enregistre un client : 201, client_id, méthode d'authentification none", async () => {
    const rep = await fetch(`${p.url}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: [REDIRECTION_TEST], token_endpoint_auth_method: "none" }),
    });
    expect(rep.status).toBe(201);
    const corps = (await rep.json()) as Record<string, unknown>;
    expect(corps["client_id"]).toMatch(/^local-/);
    expect(corps["token_endpoint_auth_method"]).toBe("none");
    expect(corps["redirect_uris"]).toEqual([REDIRECTION_TEST]);
    expect(corps["client_secret"]).toBeUndefined();
  });

  it("refuse un enregistrement invalide avec l'erreur RFC 7591", async () => {
    const rep = await fetch(`${p.url}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["http://exemple.org/cb"] }),
    });
    expect(rep.status).toBe(400);
    expect(((await rep.json()) as Record<string, unknown>)["error"]).toBe("invalid_redirect_uri");
    const corpsInvalide = await fetch(`${p.url}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: "{pas du json" });
    expect(corpsInvalide.status).toBe(400);
    expect(((await corpsInvalide.json()) as Record<string, unknown>)["error"]).toBe("invalid_client_metadata");
  });

  it("parcours complet : consentement, code avec state et iss, jeton, appel d'outil", async () => {
    const client = await enregistrerClient(p.url);
    const pkce = nouveauPkce();
    const { transaction, html } = await ouvrirConsentement(urlAutorisation(p.url, client, pkce, "gsc"));
    expect(html).toContain("Poste local de la passerelle");
    expect(html).not.toMatch(/démonstration/i);
    expect(html).toContain("aucun compte de tiers");

    const rep = await decider(p.url, transaction, "autoriser", "https://www.essai.example/");
    expect(rep.status).toBe(302);
    const retour = new URL(rep.headers.get("location")!);
    expect(`${retour.origin}${retour.pathname}`).toBe(REDIRECTION_TEST);
    expect(retour.searchParams.get("state")).toBe("etat-test");
    expect(retour.searchParams.get("iss")).toBe(p.url);
    const code = retour.searchParams.get("code")!;

    const jeton = await echangerCode(p.url, client, code, pkce.verificateur, { resource: `${p.url}/mcp/gsc` });
    expect(jeton.status).toBe(200);
    expect(jeton.headers.get("cache-control")).toBe("no-store");
    const corps = (await jeton.json()) as Record<string, any>;
    expect(corps.token_type).toBe("Bearer");
    expect(corps.expires_in).toBe(3600);

    const identite = await rpc(p.url, "gsc", "tools/call", { name: "atelier_identite", arguments: {} }, corps.access_token);
    expect(identite.statut).toBe(200);
    expect(identite.corps.result.structuredContent.propriete.id).toBe("https://www.essai.example/");
  });

  it("refus de l'utilisateur : redirection access_denied avec state et iss", async () => {
    const client = await enregistrerClient(p.url);
    const { transaction } = await ouvrirConsentement(urlAutorisation(p.url, client, nouveauPkce(), "gsc"));
    const rep = await decider(p.url, transaction, "refuser");
    expect(rep.status).toBe(302);
    const retour = new URL(rep.headers.get("location")!);
    expect(retour.searchParams.get("error")).toBe("access_denied");
    expect(retour.searchParams.get("state")).toBe("etat-test");
    expect(retour.searchParams.get("code")).toBeNull();
  });

  it("ne redirige jamais vers une URI non enregistrée ni pour un client inconnu", async () => {
    const client = await enregistrerClient(p.url);
    const pkce = nouveauPkce();
    const mauvaiseUri = await fetch(
      urlAutorisation(p.url, client, pkce, "gsc", { redirect_uri: "http://127.0.0.1:9/pirate" }),
      { redirect: "manual" },
    );
    expect(mauvaiseUri.status).toBe(400);
    expect(mauvaiseUri.headers.get("location")).toBeNull();
    const inconnu = await fetch(urlAutorisation(p.url, { ...client, clientId: "local-inconnu" }, pkce, "gsc"), { redirect: "manual" });
    expect(inconnu.status).toBe(400);
    expect(inconnu.headers.get("location")).toBeNull();
  });

  it("exige PKCE S256 et une ressource connue (erreurs renvoyées au client enregistré)", async () => {
    const client = await enregistrerClient(p.url);
    const sansPkce = await fetch(urlAutorisation(p.url, client, nouveauPkce(), "gsc", { code_challenge_method: "plain" }), { redirect: "manual" });
    expect(sansPkce.status).toBe(302);
    expect(new URL(sansPkce.headers.get("location")!).searchParams.get("error")).toBe("invalid_request");
    const mauvaiseRessource = await fetch(urlAutorisation(p.url, client, nouveauPkce(), "gsc", { resource: `${p.url}/mcp/inconnu` }), { redirect: "manual" });
    expect(new URL(mauvaiseRessource.headers.get("location")!).searchParams.get("error")).toBe("invalid_target");
    const mauvaisePortee = await fetch(urlAutorisation(p.url, client, nouveauPkce(), "gsc", { scope: "admin" }), { redirect: "manual" });
    expect(new URL(mauvaisePortee.headers.get("location")!).searchParams.get("error")).toBe("invalid_scope");
  });

  it("refuse l'échange si le vérificateur PKCE est faux ; le code est alors consommé", async () => {
    const client = await enregistrerClient(p.url);
    const pkce = nouveauPkce();
    const { transaction } = await ouvrirConsentement(urlAutorisation(p.url, client, pkce, "gsc"));
    const code = new URL((await decider(p.url, transaction, "autoriser", "sc-domain:essai.example")).headers.get("location")!).searchParams.get("code")!;
    const faux = await echangerCode(p.url, client, code, nouveauPkce().verificateur);
    expect(faux.status).toBe(400);
    expect(((await faux.json()) as Record<string, unknown>)["error"]).toBe("invalid_grant");
    const bon = await echangerCode(p.url, client, code, pkce.verificateur);
    expect(bon.status).toBe(400);
  });

  it("rejeu d'un code : refusé, et les jetons déjà émis par ce code sont révoqués", async () => {
    const client = await enregistrerClient(p.url);
    const pkce = nouveauPkce();
    const { transaction } = await ouvrirConsentement(urlAutorisation(p.url, client, pkce, "gsc"));
    const code = new URL((await decider(p.url, transaction, "autoriser", "sc-domain:essai.example")).headers.get("location")!).searchParams.get("code")!;
    const premier = await echangerCode(p.url, client, code, pkce.verificateur);
    const { access_token } = (await premier.json()) as { access_token: string };
    expect((await rpc(p.url, "gsc", "tools/list", {}, access_token)).statut).toBe(200);
    const rejeu = await echangerCode(p.url, client, code, pkce.verificateur);
    expect(rejeu.status).toBe(400);
    expect((await rpc(p.url, "gsc", "tools/list", {}, access_token)).statut).toBe(401);
  });

  it("refuse une redirect_uri ou une ressource différentes à l'échange du code", async () => {
    const client = await enregistrerClient(p.url);
    const pkce = nouveauPkce();
    const ouvrir = async () => {
      const { transaction } = await ouvrirConsentement(urlAutorisation(p.url, client, pkce, "gsc"));
      return new URL((await decider(p.url, transaction, "autoriser", "sc-domain:essai.example")).headers.get("location")!).searchParams.get("code")!;
    };
    const autreRedirection = await echangerCode(p.url, client, await ouvrir(), pkce.verificateur, { redirect_uri: "http://127.0.0.1:9/autre" });
    expect(autreRedirection.status).toBe(400);
    const autreRessource = await echangerCode(p.url, client, await ouvrir(), pkce.verificateur, { resource: `${p.url}/mcp/ga4` });
    expect(autreRessource.status).toBe(400);
    expect(((await autreRessource.json()) as Record<string, unknown>)["error"]).toBe("invalid_target");
  });

  it("la transaction de consentement est à usage unique et le formulaire exige l'origine de la passerelle", async () => {
    const client = await enregistrerClient(p.url);
    const { transaction } = await ouvrirConsentement(urlAutorisation(p.url, client, nouveauPkce(), "gsc"));
    const etrangere = await fetch(`${p.url}/oauth/authorize`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://pirate.example" },
      body: new URLSearchParams({ transaction, decision: "autoriser" }),
      redirect: "manual",
    });
    expect(etrangere.status).toBe(403);
    expect((await decider(p.url, transaction, "autoriser", "sc-domain:essai.example")).status).toBe(302);
    expect((await decider(p.url, transaction, "autoriser", "sc-domain:essai.example")).status).toBe(400);
  });

  it("refuse une propriété qui n'appartient pas au service", async () => {
    const client = await enregistrerClient(p.url);
    const { transaction } = await ouvrirConsentement(urlAutorisation(p.url, client, nouveauPkce(), "gsc"));
    expect((await decider(p.url, transaction, "autoriser", "locations/9000000001")).status).toBe(400);
  });

  it("rafraîchissement : nouveau couple de jetons, ancien refresh_token inutilisable (rotation)", async () => {
    const j = await obtenirJetons(p.url, "gsc", "sc-domain:essai.example");
    const demande = (refresh: string, extra: Record<string, string> = {}) =>
      fetch(`${p.url}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: j.client.clientId, ...extra }),
      });
    const suite = await demande(j.refresh_token);
    expect(suite.status).toBe(200);
    const nouveau = (await suite.json()) as { access_token: string; refresh_token: string };
    expect(nouveau.access_token).not.toBe(j.access_token);
    expect(nouveau.refresh_token).not.toBe(j.refresh_token);
    expect((await rpc(p.url, "gsc", "tools/list", {}, nouveau.access_token)).statut).toBe(200);
    expect((await demande(j.refresh_token)).status).toBe(400);
    // Un autre client ne peut pas utiliser ce jeton de rafraîchissement.
    const autre = await enregistrerClient(p.url);
    const vole = await fetch(`${p.url}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: nouveau.refresh_token, client_id: autre.clientId }),
    });
    expect(vole.status).toBe(400);
  });

  it("refuse un type d'octroi inconnu et un client inconnu à l'endpoint jeton", async () => {
    const client = await enregistrerClient(p.url);
    const octroi = await fetch(`${p.url}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: client.clientId }),
    });
    expect(octroi.status).toBe(400);
    expect(((await octroi.json()) as Record<string, unknown>)["error"]).toBe("unsupported_grant_type");
    const inconnu = await fetch(`${p.url}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: "local-inconnu" }),
    });
    expect(inconnu.status).toBe(401);
  });

  it("un jeton émis pour un service n'ouvre pas un autre service (audience, RFC 8707)", async () => {
    const autreService = { ...fournisseurFactice(), service: "ga4", fiche: { id: "ga4", libelle: "Google Analytics 4", portees: [], proprietes: [{ id: "properties/essai", libelle: "Propriété d'essai" }] }, outils: [] };
    const deux = await demarrer({ registre: new RegistreFournisseurs().enregistrer(fournisseurFactice()).enregistrer(autreService) });
    try {
      const j = await obtenirJetons(deux.url, "gsc", "sc-domain:essai.example");
      expect((await rpc(deux.url, "gsc", "tools/list", {}, j.access_token)).statut).toBe(200);
      const autre = await rpc(deux.url, "ga4", "tools/list", {}, j.access_token);
      expect(autre.statut).toBe(401);
      expect(autre.entetes.get("www-authenticate")).toContain(`resource_metadata="${deux.url}/.well-known/oauth-protected-resource/mcp/ga4"`);
    } finally {
      await deux.arreter();
    }
  });

});

describe("état OAuth persistant (redémarrage de la passerelle)", () => {
  it("clients et jetons survivent à un redémarrage ; le fichier est en 0600 et ne contient aucun jeton en clair", async () => {
    const { mkdtempSync, readFileSync, statSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dossier = mkdtempSync(join(tmpdir(), "passerelle-etat-"));
    const fichier = join(dossier, "oauth-local.json");
    try {
      const premiere = await demarrer({ fichierEtat: fichier });
      const j = await obtenirJetons(premiere.url, "gsc", "sc-domain:essai.example");
      const port = Number(new URL(premiere.url).port);
      await premiere.arreter();
      // Laisse le client HTTP du test écarter ses connexions persistantes vers l'ancien serveur.
      await new Promise((r) => setTimeout(r, 100));

      expect((statSync(fichier).mode & 0o777).toString(8)).toBe("600");
      const contenu = readFileSync(fichier, "utf8");
      expect(contenu).not.toContain(j.access_token);
      expect(contenu).not.toContain(j.refresh_token);

      // Même port (l'URL de ressource est liée au port), même fichier.
      const seconde = await demarrer({ fichierEtat: fichier, port });
      try {
        expect((await rpc(seconde.url, "gsc", "tools/list", {}, j.access_token)).statut).toBe(200);
        const suite = await fetch(`${seconde.url}/oauth/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: j.refresh_token, client_id: j.client.clientId }),
        });
        expect(suite.status).toBe(200);
      } finally {
        await seconde.arreter();
      }
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it("un fichier d'état corrompu est ignoré sans empêcher le démarrage", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dossier = mkdtempSync(join(tmpdir(), "passerelle-etat-"));
    const fichier = join(dossier, "oauth-local.json");
    writeFileSync(fichier, "{pas du json");
    try {
      const p = await demarrer({ fichierEtat: fichier });
      try {
        expect((await rpc(p.url, "gsc", "tools/list", {}, "x")).statut).toBe(401);
      } finally {
        await p.arreter();
      }
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});
