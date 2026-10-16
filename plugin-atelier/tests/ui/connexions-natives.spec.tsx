// @vitest-environment jsdom
/**
 * Lot L8 : le tableau « Connecteurs » reflète les connexions natives de Paperclip.
 * Les fixtures `tests/ui/fixtures/*.json` sont des réponses RÉELLES relevées le
 * 15/10/2026 sur une instance d'essai (atelier-lot8) : liste vide ; deux services
 * de la passerelle en démonstration connectés (GSC, GA4) et un brouillon (Facebook) ;
 * agents claude_local avec et sans jeton. Les variantes « échec », « désactivée » et
 * « réelle » en dérivent par modification d'un champ, signalée dans chaque test.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageAtelier } from "../../src/ui/index.js";
import {
  analyserAgentClaude,
  analyserConnexion,
  etatClaude,
  etatDepuisConnexion,
  etatRechercheWeb,
  lignesServices,
  modeDepuisAutorisation,
  modeDepuisConnexion,
  serviceDepuisCarte,
  serviceDepuisUrl,
  SERVICES_PASSERELLE,
  type ConnexionNative,
} from "../../src/ui/connexions-natives.js";
import { cliquer, ENTREPRISE, installerPont, parTexte, rendre, type Pont, type Rendu } from "./pont.js";

const fixture = (nom: string) => JSON.parse(readFileSync(`${process.cwd()}/tests/ui/fixtures/${nom}`, "utf8")) as Record<string, unknown> & unknown;
const CONNEXIONS = fixture("connexions-natives-reelles.json") as { connections: Array<Record<string, unknown>> };
const VIDE = fixture("connexions-natives-vide.json");
// Relevée le 15/10/2026 sur l'instance d'essai atelier-lotz (scénario A) : connexions créées par les
// CARTES de galerie (patch socle 0004) en démonstration : aucune portée demandée (scopes vides), portée
// « demonstration » rendue par le jeton (oauth.scope), nom suffixé « (démonstration) ».
const CARTES = fixture("connexions-cartes-reelles.json") as { connections: Array<Record<string, unknown>> };
const AGENTS = fixture("agents-natifs-reels.json") as unknown as Array<Record<string, unknown>>;
const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };

let pont: Pont;
let rendu: Rendu | null = null;
let appels: string[] = [];

type Reponse = { statut?: number; corps: unknown } | "attente";
function stubReseau(opts: { connexions?: Reponse; agents?: Reponse }) {
  appels = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      appels.push(url);
      const choix = url.endsWith("/tools/connections") ? opts.connexions : url.endsWith("/agents") ? opts.agents : { corps: { id: ENTREPRISE, name: "Entreprise" } };
      if (choix === "attente") return new Promise<Response>(() => undefined);
      const r = choix ?? { corps: [] };
      return new Response(JSON.stringify(r.corps), { status: r.statut ?? 200 });
    }),
  );
}

beforeEach(() => {
  pont = installerPont();
});
afterEach(() => {
  expect(pont.violations).toEqual([]);
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

async function pageParametres() {
  pont.chemin = "/RNO/atelier/parametres";
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  // Laisse les lectures natives se terminer.
  await vi.waitFor(() => expect(rendu!.conteneur.querySelector('[aria-busy="true"]')).toBeNull());
  return rendu.conteneur;
}

/** Tableaux de la zone connexions (légendes « Services marketing… » et « Autres connecteurs… »), indépendamment des autres tableaux de la page. */
function tableauxConnexions(c: HTMLElement): HTMLTableElement[] {
  return Array.from(c.querySelectorAll<HTMLTableElement>("table")).filter((t) =>
    /^(Services marketing de la passerelle|Autres connecteurs)/.test(t.querySelector("caption")?.textContent ?? ""));
}

function ligne(c: HTMLElement, nom: string): HTMLElement {
  const th = Array.from(c.querySelectorAll<HTMLElement>("tbody th")).find((t) => t.textContent?.startsWith(nom));
  if (!th) throw new Error(`Ligne introuvable : ${nom}`);
  return th.closest("tr")!;
}

describe("module connexions-natives : analyse des formes réelles", () => {
  it("reconnaît les services de la passerelle par l'URL de boucle locale et refuse le reste", () => {
    expect(serviceDepuisUrl("http://127.0.0.1:3290/mcp/gsc")).toBe("gsc");
    expect(serviceDepuisUrl("http://localhost:3190/mcp/crm/")).toBe("crm");
    expect(serviceDepuisUrl("https://mcp.hubspot.com/mcp/gsc")).toBeNull();
    expect(serviceDepuisUrl("http://127.0.0.1:3290/mcp/inconnu")).toBeNull();
    expect(serviceDepuisUrl("pas une url")).toBeNull();
    expect(serviceDepuisUrl(undefined)).toBeNull();
  });
  it("le mode vient de la portée d'autorisation", () => {
    expect(modeDepuisAutorisation(["demonstration"])).toBe("demonstration");
    expect(modeDepuisAutorisation(["https://www.googleapis.com/auth/webmasters.readonly"])).toBe("reel");
  });
  it("réduit une connexion réelle sans conserver de secret", () => {
    const gsc = CONNEXIONS.connections.find((c) => String(c.name).startsWith("Search Console"))!;
    const c = analyserConnexion(gsc)!;
    expect(c).toMatchObject({ service: "gsc", mode: "demonstration", statut: "active", activee: true, sante: "ok" });
    expect(c.verifieLe).toMatch(/^2026-10-15T/u);
    expect(JSON.stringify(c)).not.toMatch(/secretId|oauth|clientId|token/iu);
  });
  it("jette une entrée illisible au lieu d'échouer", () => {
    expect(analyserConnexion({ pas: "une connexion" })).toBeNull();
    expect(analyserConnexion(null)).toBeNull();
  });
  it("agents : jeton présent par secret_ref, ou valeur masquée par l'hôte, jamais lu", () => {
    const [coordinateur, veille] = [AGENTS.find((a) => a.name === "Coordinateur"), AGENTS.find((a) => a.name === "Veille")];
    expect(analyserAgentClaude(veille)).toMatchObject({ nom: "Veille", jetonPresent: true, rechercheWeb: true });
    expect(analyserAgentClaude(coordinateur)).toMatchObject({ nom: "Coordinateur", jetonPresent: false, rechercheWeb: false });
    const masque = { id: "a", name: "A", adapterType: "claude_local", adapterConfig: { env: { ANTHROPIC_API_KEY: { type: "plain", value: "***REDACTED***" } } } };
    expect(analyserAgentClaude(masque)?.jetonPresent).toBe(true);
    expect(analyserAgentClaude({ ...masque, adapterType: "process" })).toBeNull();
    expect(analyserAgentClaude({ ...masque, status: "terminated" })).toBeNull();
  });
  it("WebSearch à la fois permis et interdit reste interdit", () => {
    const a = { id: "a", name: "A", adapterType: "claude_local", adapterConfig: { extraArgs: ["--allowedTools", "WebSearch", "--disallowedTools", "WebSearch"] } };
    expect(analyserAgentClaude(a)?.rechercheWeb).toBe(false);
  });
});

describe("connexions créées par les cartes de galerie natives", () => {
  it("chaque service a sa carte native (HubSpot servi par /mcp/crm) et la correspondance est réciproque", () => {
    expect(SERVICES_PASSERELLE.map((x) => [x.cle, x.slug])).toEqual([
      ["gsc", "atelier-google-search-console"], ["ga4", "atelier-google-analytics"], ["ads", "atelier-google-ads"],
      ["gbp", "atelier-google-business-profile"], ["facebook", "atelier-facebook"], ["instagram", "atelier-instagram"],
      ["linkedin", "atelier-linkedin"], ["crm", "atelier-hubspot"], ["pipedrive", "atelier-pipedrive"],
      ["odoo", "atelier-odoo"], ["teamleader", "atelier-teamleader"],
    ]);
    for (const x of SERVICES_PASSERELLE) expect(serviceDepuisCarte(x.slug)).toBe(x.cle);
    expect(serviceDepuisCarte("notion")).toBeNull();
    expect(serviceDepuisCarte(null)).toBeNull();
  });
  it("mode : le suffixe « (démonstration) » l'emporte sur des portées absentes ou réelles", () => {
    expect(modeDepuisConnexion("Google Search Console (démonstration)", [])).toBe("demonstration");
    expect(modeDepuisConnexion("Search Console", ["demonstration"])).toBe("demonstration");
    expect(modeDepuisConnexion("Google Search Console", [])).toBe("reel");
    expect(modeDepuisConnexion("Google Search Console", ["webmasters.readonly"])).toBe("reel");
  });
  it("fixture réelle : connexions des cartes reconnues (carte, service, démonstration)", () => {
    const lues = CARTES.connections.map(analyserConnexion);
    expect(lues.map((x) => [x?.nom, x?.service, x?.carte, x?.mode, x?.statut])).toEqual([
      ["Google Search Console (démonstration)", "gsc", true, "demonstration", "active"],
      ["Facebook (pages) (démonstration)", "facebook", true, "demonstration", "active"],
    ]);
    // Variante : sans aucune portée enregistrée, le suffixe « (démonstration) » suffit.
    const cfg0 = CARTES.connections[0]!.config as { oauth: Record<string, unknown> };
    const sansPortee = { ...CARTES.connections[0], config: { ...cfg0, oauth: { ...cfg0.oauth, scope: undefined, scopes: [] } } };
    expect(analyserConnexion(sansPortee)?.mode).toBe("demonstration");
    // Reconnaissance par la carte même si l'adresse n'est pas une boucle locale (passerelle déplacée en HTTPS).
    const ailleurs = { ...CARTES.connections[0], config: { ...(CARTES.connections[0]!.config as object), url: "https://passerelle.example/mcp/gsc" } };
    expect(analyserConnexion(ailleurs)?.service).toBe("gsc");
    const lignes = lignesServices(lues.filter((x): x is ConnexionNative => x !== null));
    expect(lignes.find((l) => l.cle === "gsc")).toMatchObject({ etat: "non_connecte", mode: "demonstration", connexionId: CARTES.connections[0]!.id });
  });
});

describe("module connexions-natives : correspondance avec les six états", () => {
  const base: ConnexionNative = { id: "x", nom: "x", statut: "active", activee: true, sante: "ok", messageSante: null, verifieLe: "2026-10-15T14:00:00.000Z", dernierUsage: null, service: "gsc", carte: false, mode: "demonstration" };
  it("sans accès réel : non connecté, jamais un état simulé", () => {
    expect(etatDepuisConnexion(base).etat).toBe("non_connecte");
    expect(etatDepuisConnexion(base).detail).not.toMatch(/démo|simul/i);
  });
  it("réel : testé seulement après un appel d'outil enregistré, sinon configuré non vérifié", () => {
    expect(etatDepuisConnexion({ ...base, mode: "reel" }).etat).toBe("configure_non_verifie");
    expect(etatDepuisConnexion({ ...base, mode: "reel", dernierUsage: "2026-10-15T15:00:00.000Z" }).etat).toBe("reel_teste");
    expect(etatDepuisConnexion({ ...base, mode: "reel", dernierUsage: "2026-10-15T15:00:00.000Z", sante: "unchecked" }).etat).toBe("configure_non_verifie");
  });
  it("brouillon : non connecté ; désactivée ou archivée : indisponible ; santé en échec : erreur", () => {
    expect(etatDepuisConnexion({ ...base, statut: "draft", activee: false, sante: "error" }).etat).toBe("non_connecte");
    expect(etatDepuisConnexion({ ...base, statut: "disabled", activee: false }).etat).toBe("indisponible");
    expect(etatDepuisConnexion({ ...base, statut: "archived" }).etat).toBe("indisponible");
    for (const sante of ["failed", "error", "missing_secret"] as const) expect(etatDepuisConnexion({ ...base, sante }).etat).toBe("erreur");
  });
  it("onze services, toujours dans le même ordre ; la meilleure connexion l'emporte", () => {
    const lignes = lignesServices([{ ...base, id: "vieille", statut: "draft", activee: false, sante: "error" }, { ...base, id: "bonne" }]);
    expect(lignes.map((l) => l.cle)).toEqual(["gsc", "ga4", "ads", "gbp", "facebook", "instagram", "linkedin", "crm", "pipedrive", "odoo", "teamleader"]);
    expect(lignes[0]).toMatchObject({ etat: "non_connecte", connexionId: "bonne" });
    expect(lignes[1]).toMatchObject({ etat: "non_connecte", connexionId: null });
  });
  it("recherche Web : disponible en mode réel, non vérifié ; jamais « non implémenté »", () => {
    const veille = analyserAgentClaude(AGENTS.find((a) => a.name === "Veille"))!;
    const r = etatRechercheWeb([veille]);
    expect(r.etat).toBe("configure_non_verifie");
    expect(r.detail).toContain("Disponible en mode réel (outil natif de l'agent), non vérifié");
    expect(etatRechercheWeb([]).etat).toBe("non_connecte");
  });
  it("adaptateur Claude Code : aucun agent, sans jeton, jeton partiel, jeton présent", () => {
    const veille = analyserAgentClaude(AGENTS.find((a) => a.name === "Veille"))!;
    const coord = analyserAgentClaude(AGENTS.find((a) => a.name === "Coordinateur"))!;
    expect(etatClaude([]).etat).toBe("non_connecte");
    expect(etatClaude([coord])).toMatchObject({ etat: "non_connecte" });
    expect(etatClaude([veille, coord]).detail).toContain("absent pour : Coordinateur");
    expect(etatClaude([veille])).toMatchObject({ etat: "configure_non_verifie" });
  });
});

describe("page Paramètres : tableau des connexions natives", () => {
  it("aucune connexion : message clair et onze lignes « Non connecté » ; Connecter ouvre la carte native du service", async () => {
    stubReseau({ connexions: { corps: VIDE }, agents: { corps: [] } });
    const c = await pageParametres();
    expect(appels).toContain(`/api/companies/${ENTREPRISE}/tools/connections`);
    expect(c.textContent).toContain("Aucun service marketing n'est connecté");
    const lignes = Array.from(c.querySelectorAll("table")[0]!.querySelectorAll("tbody tr"));
    expect(lignes).toHaveLength(11);
    for (const l of lignes) expect(l.textContent).toContain("Non connecté");
    const connecter = parTexte(ligne(c, "Google Search Console"), "a", "Connecter");
    // Carte de galerie native (patch socle 0004), plus jamais la connexion générique « byo ».
    expect(connecter.getAttribute("href")).toBe("/RNO/apps/connect?source=atelier-google-search-console");
    expect(parTexte(ligne(c, "CRM (HubSpot)"), "a", "Connecter").getAttribute("href")).toBe("/RNO/apps/connect?source=atelier-hubspot");
    expect(c.innerHTML).not.toContain("apps/byo");
    await cliquer(connecter);
    expect(pont.navigations).toContain("/apps/connect?source=atelier-google-search-console");
  });

  it("connexions de l'instance : sans accès réel, brouillon et services absents distingués", async () => {
    stubReseau({ connexions: { corps: CONNEXIONS }, agents: { corps: AGENTS } });
    const c = await pageParametres();
    const gsc = ligne(c, "Google Search Console");
    expect(gsc.textContent).toContain("Non connecté");
    expect(gsc.textContent).not.toMatch(/démo/i);
    expect(gsc.textContent).toContain("Santé : Bonne");
    expect(gsc.querySelector("time")?.getAttribute("datetime")).toMatch(/^2026-10-15T/u);
    const idGsc = String(CONNEXIONS.connections.find((x) => String(x.name).startsWith("Search Console"))!.id);
    expect(parTexte(gsc, "a", "Connecter").getAttribute("href")).toBe(`/RNO/apps/connect?source=atelier-google-search-console&resume=${idGsc}`);
    expect(ligne(c, "Google Analytics 4").textContent).toContain("Non connecté");
    const fb = ligne(c, "Facebook");
    expect(fb.textContent).toContain("Non connecté");
    expect(fb.textContent).toContain("autorisation non terminée");
    expect(fb.textContent).not.toContain("Santé");
    // Brouillon : la carte reprend CETTE connexion au lieu d'en créer une seconde.
    const idFb = String(CONNEXIONS.connections.find((x) => String(x.name).startsWith("Facebook"))!.id);
    expect(parTexte(fb, "a", "Connecter").getAttribute("href")).toBe(`/RNO/apps/connect?source=atelier-facebook&resume=${idFb}`);
    expect(c.textContent).not.toContain("Aucun service marketing n'est connecté");
  });

  it("santé en échec (variante d'une connexion réelle, santé « failed ») : état Erreur avec le message de l'hôte", async () => {
    const variante = { connections: CONNEXIONS.connections.map((x) => (String(x.name).startsWith("Search Console") ? { ...x, healthStatus: "failed", healthMessage: "connect ECONNREFUSED" } : x)) };
    stubReseau({ connexions: { corps: variante }, agents: { corps: AGENTS } });
    const c = await pageParametres();
    const gsc = ligne(c, "Google Search Console");
    expect(gsc.textContent).toContain("Erreur");
    expect(gsc.textContent).toContain("connect ECONNREFUSED");
    expect(gsc.textContent).toContain("Santé : En échec");
  });

  it("connexion désactivée (variante, status « disabled ») : Indisponible", async () => {
    const variante = { connections: CONNEXIONS.connections.map((x) => (String(x.name).startsWith("Analytics") ? { ...x, status: "disabled", enabled: false } : x)) };
    stubReseau({ connexions: { corps: variante }, agents: { corps: AGENTS } });
    const c = await pageParametres();
    expect(ligne(c, "Google Analytics 4").textContent).toContain("Indisponible");
  });

  it("passerelle réelle (variante : portée Google) sans appel d'outil : Prêt, pas encore utilisé, mode Réel", async () => {
    const variante = {
      connections: CONNEXIONS.connections.map((x) => {
        if (!String(x.name).startsWith("Search Console")) return x;
        const cfg = x.config as { oauth: Record<string, unknown> };
        // Une connexion réelle ne porte pas le suffixe « (démonstration) » (patch socle 0004).
        return { ...x, name: "Search Console", config: { ...cfg, oauth: { ...cfg.oauth, scope: "webmasters.readonly", scopes: ["webmasters.readonly"] } } };
      }),
    };
    stubReseau({ connexions: { corps: variante }, agents: { corps: AGENTS } });
    const c = await pageParametres();
    const gsc = ligne(c, "Google Search Console");
    expect(gsc.textContent).toContain("Prêt, pas encore utilisé");
    expect(gsc.textContent).not.toContain("Passerelle :");
  });

  it("recherche Web : disponible en mode réel (outil natif de l'agent), non vérifié ; jamais « non implémenté »", async () => {
    stubReseau({ connexions: { corps: CONNEXIONS }, agents: { corps: AGENTS } });
    const c = await pageParametres();
    const web = ligne(c, "Recherche Web");
    expect(web.textContent).toContain("Disponible en mode réel (outil natif de l'agent), non vérifié");
    expect(web.textContent).toContain("Veille");
    expect(web.textContent).toContain("Outil natif de l'agent");
    expect(web.textContent).not.toContain("Non implémenté");
  });

  it("adaptateur Claude Code : jeton présent ou non, sans jamais exposer le jeton ni son identifiant", async () => {
    stubReseau({ connexions: { corps: CONNEXIONS }, agents: { corps: AGENTS } });
    const c = await pageParametres();
    const claude = ligne(c, "Adaptateur Claude Code");
    expect(claude.textContent).toContain("Prêt, pas encore utilisé");
    expect(claude.textContent).toContain("absent pour : Coordinateur");
    const secretId = (AGENTS.find((a) => a.name === "Veille")!.adapterConfig as { env: { CLAUDE_CODE_OAUTH_TOKEN: { secretId: string } } }).env.CLAUDE_CODE_OAUTH_TOKEN.secretId;
    expect(c.textContent).not.toContain(secretId);
    expect(c.textContent).not.toContain("valeur-factice");
  });

  it("lecture d'URL et diffusion restent celles du diagnostic, sans les anciennes lignes figées", async () => {
    stubReseau({ connexions: { corps: CONNEXIONS }, agents: { corps: AGENTS } });
    const c = await pageParametres();
    expect(ligne(c, "Lecture d'URL protégée").textContent).toContain("Implémenté et testé");
    expect(ligne(c, "Lecture d'URL protégée").textContent).toContain("Non connecté");
    // L'exemple de diagnostic ne contient pas « diffusion » : rien n'est inventé par l'interface.
    expect(Array.from(c.querySelectorAll("tbody th")).some((t) => t.textContent?.startsWith("Diffusion"))).toBe(false);
  });

  it("chargement : zone occupée annoncée, sans état inventé", async () => {
    stubReseau({ connexions: "attente", agents: "attente" });
    pont.chemin = "/RNO/atelier/parametres";
    rendu = await rendre(createElement(PageAtelier, { context: contexte }));
    expect(rendu.conteneur.textContent).toContain("Lecture des connexions natives…");
    expect(rendu.conteneur.querySelector('[role="status"][aria-busy="true"]')).not.toBeNull();
    expect(rendu.conteneur.textContent).toContain("Lecture des agents natifs en cours…");
  });

  it("accès refusé (HTTP 403) : message d'accès, Réessayer relit", async () => {
    stubReseau({ connexions: { statut: 403, corps: { error: "Forbidden" } }, agents: { corps: AGENTS } });
    const c = await pageParametres();
    const alerte = parTexte(c, '[role="alert"]', "connexions natives illisibles");
    expect(alerte.textContent).toContain("Accès refusé");
    const avant = appels.filter((u) => u.endsWith("/tools/connections")).length;
    await cliquer(parTexte(alerte, "button", "Réessayer"));
    await vi.waitFor(() => expect(appels.filter((u) => u.endsWith("/tools/connections")).length).toBe(avant + 1));
  });

  it("erreur serveur (HTTP 500) : alerte explicite, pas de tableau trompeur", async () => {
    stubReseau({ connexions: { statut: 500, corps: { error: "Boom" } }, agents: { corps: AGENTS } });
    const c = await pageParametres();
    expect(parTexte(c, '[role="alert"]', "connexions natives illisibles").textContent).toContain("Boom");
    // Cible les tableaux de connexions par leur légende (la page Paramètres porte d'autres tableaux, ex. budgets IA).
    const legendes = tableauxConnexions(c).map((t) => t.querySelector("caption")?.textContent ?? "");
    expect(legendes).toHaveLength(1);
    expect(legendes[0]).toContain("Autres connecteurs");
  });

  it("forme native inconnue : Fonction indisponible, et état Indisponible pour les lignes d'agents", async () => {
    stubReseau({ connexions: { corps: { autre: [] } }, agents: { corps: { inattendu: true } } });
    const c = await pageParametres();
    const alertes = Array.from(c.querySelectorAll('[role="alert"]')).map((a) => a.textContent ?? "");
    expect(alertes.filter((a) => a.includes("Fonction indisponible")).length).toBe(2);
    expect(ligne(c, "Recherche Web").textContent).toContain("Indisponible");
  });

  it("hôte injoignable : erreur réseau signalée", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fail"))));
    pont.chemin = "/RNO/atelier/parametres";
    rendu = await rendre(createElement(PageAtelier, { context: contexte }));
    await vi.waitFor(() => expect(rendu!.conteneur.textContent).toContain("Serveur Paperclip injoignable"));
  });

  it("« Relire les connexions » relit les connexions (et au retour sur l'onglet)", async () => {
    stubReseau({ connexions: { corps: VIDE }, agents: { corps: [] } });
    const c = await pageParametres();
    const avant = appels.filter((u) => u.endsWith("/tools/connections")).length;
    await cliquer(parTexte(c, "button", "Relire les connexions"));
    await vi.waitFor(() => expect(appels.filter((u) => u.endsWith("/tools/connections")).length).toBe(avant + 1));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(appels.filter((u) => u.endsWith("/tools/connections")).length).toBe(avant + 2));
  });

  it("accessibilité : tableaux légendés, en-têtes de colonne, boutons nommés par le service", async () => {
    stubReseau({ connexions: { corps: VIDE }, agents: { corps: [] } });
    const c = await pageParametres();
    const tableaux = tableauxConnexions(c);
    expect(tableaux).toHaveLength(2);
    for (const t of tableaux) {
      expect(t.querySelector("caption")?.textContent).toBeTruthy();
      expect(t.querySelectorAll('thead th[scope="col"]').length).toBeGreaterThan(3);
    }
    expect(ligne(c, "Facebook").querySelector("a")?.textContent).toBe("Connecter Facebook");
  });
});
