// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXEMPLES_DONNEES } from "../../src/contrats/exemples/index.js";
import { MENTION_DEMONSTRATION } from "../../src/contrats/identifiants.js";
import { EXPORTS_UI, RUBRIQUES } from "../../src/contrats/ui-constantes.js";
import * as ui from "../../src/ui/index.js";
import { EntreeAtelier, NavigationAtelier, OngletAtelierTache, PageAtelier, WidgetAtelier } from "../../src/ui/index.js";
import { RAISON_PAUSE } from "../../src/ui/vues/campagnes.js";
import { champParLibelle, cliquer, ENTREPRISE, installerPont, parTexte, radio, rendre, saisir, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
const T = "44444444-4444-4444-8444-444444444444";
const C = "33333333-3333-4333-8333-333333333333";

let pont: Pont;
let rendu: Rendu | null = null;
beforeEach(() => {
  pont = installerPont();
});
afterEach(() => {
  // Aucun appel de l'interface ne doit être refusé par les schémas du contrat.
  expect(pont.violations).toEqual([]);
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

async function page(chemin: string) {
  pont.chemin = chemin;
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  return rendu.conteneur;
}

describe("contrat des exports", () => {
  it("exporte exactement les composants attendus par le manifeste", () => {
    const attendus = Object.values(EXPORTS_UI).sort();
    expect(Object.keys(ui).sort()).toEqual(attendus);
  });
});

describe("navigation", () => {
  it("la barre latérale liste les six rubriques et marque la courante", async () => {
    pont.chemin = "/RNO/atelier/calendrier";
    rendu = await rendre(createElement(NavigationAtelier, { context: contexte }));
    const liens = Array.from(rendu.conteneur.querySelectorAll("nav a"));
    for (const r of RUBRIQUES) expect(liens.some((a) => a.textContent?.includes(r.libelle))).toBe(true);
    expect(rendu.conteneur.querySelector('a[aria-current="page"]')?.textContent).toContain("Calendrier éditorial");
    expect(rendu.conteneur.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe("/RNO/atelier/calendrier");
  });
  it("la page porte aussi des onglets (téléphone) et chaque lien passe par la navigation de l'hôte", async () => {
    const c = await page("/RNO/atelier/equipe");
    const onglets = c.querySelector("nav.atl-onglets");
    expect(onglets?.querySelectorAll("a")).toHaveLength(13);
    await cliquer(parTexte(onglets!, "a", "Marque et sources"));
    expect(pont.navigations).toContain("/atelier/marque");
  });
  it("l'entrée de la barre latérale mène à l'atelier", async () => {
    rendu = await rendre(createElement(EntreeAtelier, { context: contexte }));
    expect(rendu.conteneur.querySelector("a")?.getAttribute("href")).toBe("/RNO/atelier/accueil");
  });
});

describe("rubriques", () => {
  it("équipe : agents, connexion, mission, échanges ; sélection d'un agent ouvre ses tâches natives", async () => {
    const c = await page("/RNO/atelier/equipe");
    expect(c.querySelector("h1")?.textContent).toBe("Équipe et coordination");
    expect(c.textContent).toContain("Contenus et création");
    expect(c.textContent).toContain("Démonstration");
    expect(c.textContent).toContain("Correction demandée");
    rendu?.demonter();
    const AP = "66666666-6666-4666-8666-666666666661";
    const c2 = await page(`/RNO/atelier/equipe/${AP}`);
    const liste = c2.querySelector('[data-natif="IssuesList"]');
    expect(JSON.parse(liste?.getAttribute("data-filtres") ?? "{}")).toEqual({ assigneeAgentId: AP });
  });

  it("campagnes : liste et détail ; la pause est désactivée avec la raison du serveur", async () => {
    const c = await page("/RNO/atelier/campagnes");
    expect(c.textContent).toContain("Isolation des toitures, automne 2026");
    rendu?.demonter();
    const d = await page(`/RNO/atelier/campagnes/${C}`);
    const pause = parTexte(d, "button", "Mettre en pause");
    expect(pause.getAttribute("aria-disabled")).toBe("true");
    expect(pause.hasAttribute("disabled")).toBe(false); // reste atteignable au clavier
    const raison = d.querySelector(`#${CSS.escape(pause.getAttribute("aria-describedby") ?? "")}`);
    expect(raison?.textContent).toBe(RAISON_PAUSE);
    await cliquer(pause);
    expect(pont.appelsActions).toHaveLength(0);
    expect(d.textContent).toContain("REQ-001");
    expect(d.textContent).toContain(MENTION_DEMONSTRATION.replace(/^Démonstration\s*:\s*/u, ""));
  });

  it("campagne déclarée en démonstration dans une entreprise réelle : le mode réel appliqué est affiché en clair", async () => {
    const exemple = EXEMPLES_DONNEES["atelier.campagne"] as Record<string, unknown>;
    pont.donnees["atelier.campagne"] = {
      data: { ...exemple, modeEffectif: { mode: "reel", raison: "entreprise en mode réel (la campagne est déclarée en démonstration)" } },
      loading: false,
      error: null,
    };
    const d = await page(`/RNO/atelier/campagnes/${C}`);
    const note = d.querySelector(".atl-note-mode");
    expect(note?.getAttribute("role")).toBe("note");
    expect(note?.textContent).toContain("Mode réel appliqué.");
    expect(note?.textContent).toContain("l'entreprise est réglée en mode réel");
    expect(note?.textContent).toContain("préparée, jamais simulée");
    // La bannière de démonstration n'est plus affichée : elle mentirait sur le mode appliqué.
    expect(d.querySelector(".atl-demo")).toBeNull();
    expect(d.textContent).toContain("Déclaré : démonstration ; appliqué : entreprise en mode réel");
    expect(d.textContent).not.toContain("appliqué : entreprise en mode réel (");
  });

  it("campagnes : création depuis un brief (projet natif puis action du plugin)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "99999999-0000-4000-8000-000000000001", name: "x" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    pont.actions["atelier.campagne.creer"] = async () => ({ id: C });
    const c = await page("/RNO/atelier/campagnes/nouvelle");
    const envoyer = parTexte(c, "button", "Créer la campagne");
    expect(envoyer.getAttribute("aria-disabled")).toBe("true");
    await saisir(champParLibelle(c, "Nom de la campagne"), "Façades printemps");
    await saisir(champParLibelle(c, "Brief"), "Présenter nos deux établissements : Herstal et Seraing.");
    await saisir(champParLibelle(c, "Établissements"), "Herstal\nSeraing");
    await cliquer(radio(c, "Montant maximal (€)"));
    await saisir(champParLibelle(c, "Montant maximal en euros"), "800");
    expect(envoyer.getAttribute("aria-disabled")).toBeNull();
    await cliquer(envoyer);
    expect(fetchMock).toHaveBeenCalledWith(`/api/companies/${ENTREPRISE}/projects`, expect.objectContaining({ method: "POST" }));
    const appel = pont.appelsActions.find((a) => a.cle === "atelier.campagne.creer");
    expect(appel?.params).toMatchObject({ projectId: "99999999-0000-4000-8000-000000000001", nom: "Façades printemps", etablissements: ["Herstal", "Seraing"], plafondPub: { type: "montant", montantCents: 80000 }, mode: "demonstration" });
    expect(appel?.params).not.toHaveProperty("companyId");
    expect(pont.navigations).toContain(`/atelier/campagnes/${C}`);
  });

  it("campagnes : les limites du contrat bloquent l'envoi avec une raison précise", async () => {
    const c = await page("/RNO/atelier/campagnes/nouvelle");
    await saisir(champParLibelle(c, "Nom de la campagne"), "Trop d'objectifs");
    await saisir(champParLibelle(c, "Brief"), "Brief.");
    await saisir(champParLibelle(c, "Objectifs"), Array.from({ length: 21 }, (_, i) => `Objectif ${i + 1}`).join("\n"));
    const envoyer = parTexte(c, "button", "Créer la campagne");
    expect(envoyer.getAttribute("aria-disabled")).toBe("true");
    expect(c.textContent).toContain("Trop d'objectifs : 21 pour 20 au plus.");
    await cliquer(envoyer);
    expect(pont.appelsActions).toHaveLength(0);
  });

  it("contenus : prêts et bloqués séparés", async () => {
    pont.donnees["atelier.contenus-a-valider"] = {
      data: {
        prets: (EXEMPLES_DONNEES["atelier.contenus-a-valider"] as { prets: unknown[] }).prets,
        bloques: [{ ...(EXEMPLES_DONNEES["atelier.contenus-a-valider"] as { prets: Record<string, unknown>[] }).prets[0], issueId: "44444444-4444-4444-8444-444444444449", titre: "Page certifications", statut: "blocked_information", motif: "Certification non confirmée.", decisionPorte: "BLOQUE_INFORMATION" }],
      },
      loading: false,
      error: null,
    };
    const c = await page("/RNO/atelier/contenus");
    const sections = Array.from(c.querySelectorAll("section"));
    const prets = sections.find((s) => s.querySelector("h2")?.textContent?.startsWith("Prêts"));
    const bloques = sections.find((s) => s.querySelector("h2")?.textContent?.startsWith("Bloqués"));
    expect(prets?.textContent).toContain("Page « Nos établissements »");
    expect(prets?.textContent).not.toContain("Page certifications");
    expect(bloques?.textContent).toContain("Certification non confirmée.");
  });

  it("dossier : matrice, preuves par établissement, constats, mention démonstration, chronologie", async () => {
    const c = await page(`/RNO/atelier/contenus/${T}`);
    expect(c.querySelector("h1")?.textContent).toContain("Nos établissements");
    expect(c.textContent).toContain(MENTION_DEMONSTRATION.replace(/^Démonstration\s*:\s*/u, ""));
    expect(c.textContent).toContain("Chaque élément attendu a sa preuve.");
    expect(c.textContent).toContain("L'établissement de Seraing n'est pas présenté.");
    expect(c.textContent).toContain("Porte franchie");
    expect(c.textContent).toContain("Contrôle échoué");
    expect(c.querySelector('[data-natif="MarkdownBlock"]')?.textContent).toContain("#### Seraing");
    expect(c.querySelectorAll("h1")).toHaveLength(1);
  });

  it("dossier : décision humaine enregistrée sur la révision courante, puis transition native", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "done" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const R2 = "55555555-5555-4555-8555-555555555552";
    pont.actions["atelier.decision"] = async (p) => ({ id: "d", ...p });
    const c = await page(`/RNO/atelier/contenus/${T}`);
    const bouton = parTexte(c, "button", "Enregistrer : approuver");
    expect(bouton.getAttribute("aria-disabled")).toBe("true");
    await saisir(champParLibelle(c, "Commentaire"), "Conforme au brief.");
    await saisir(champParLibelle(c, "Action autorisée"), "publier");
    await saisir(champParLibelle(c, "Durée (jours)"), "30");
    await cliquer(bouton);
    const appel = pont.appelsActions.find((a) => a.cle === "atelier.decision");
    expect(appel?.params).toMatchObject({ issueId: T, revisionId: R2, action: "approuver", commentaire: "Conforme au brief.", portee: { revisionId: R2, action: "publier", canal: "site", dureeJours: 30, montantMaxCents: null } });
    expect(fetchMock).toHaveBeenCalledWith(`/api/issues/${T}`, expect.objectContaining({ method: "PATCH" }));
    expect(c.textContent).toContain("Décision enregistrée.");
    expect(c.textContent).toContain("aucune diffusion n'a été déclenchée");
  });

  it("dossier : sans action externe, aucun champ masqué n'est envoyé dans la portée", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "done" }), { status: 200 })));
    const c = await page(`/RNO/atelier/contenus/${T}`);
    await saisir(champParLibelle(c, "Action autorisée"), "publier");
    await saisir(champParLibelle(c, "Montant maximal (euros)"), "abc");
    await saisir(champParLibelle(c, "Action autorisée"), "aucune_action_externe");
    await saisir(champParLibelle(c, "Commentaire"), "Validé sans diffusion.");
    const bouton = parTexte(c, "button", "Enregistrer : approuver");
    expect(bouton.getAttribute("aria-disabled")).toBeNull();
    await cliquer(bouton);
    const appel = pont.appelsActions.find((a) => a.cle === "atelier.decision");
    expect((appel?.params as { portee: unknown }).portee).toEqual({
      revisionId: "55555555-5555-4555-8555-555555555552",
      action: "aucune_action_externe",
      canal: null,
      compte: null,
      audience: null,
      montantMaxCents: null,
      dureeJours: null,
    });
  });

  it("dossier : l'action « Modifier des données du CRM » est proposée et envoyée dans la portée", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "done" }), { status: 200 })));
    const c = await page(`/RNO/atelier/contenus/${T}`);
    const select = champParLibelle(c, "Action autorisée") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => [o.value, o.textContent]);
    expect(options).toContainEqual(["modifier_crm", "Modifier des données du CRM"]);
    await saisir(select, "modifier_crm");
    await saisir(champParLibelle(c, "Commentaire"), "Mise à jour de la fiche contact validée.");
    await cliquer(parTexte(c, "button", "Enregistrer : approuver"));
    const appel = pont.appelsActions.find((a) => a.cle === "atelier.decision");
    expect((appel?.params as { portee: { action: string } }).portee.action).toBe("modifier_crm");
  });

  it("dossier : une décision refusée par le serveur est affichée, sans transition native", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    pont.actions["atelier.decision"] = async () => {
      throw { code: "WORKER_ERROR", message: "[conflit] Approbation impossible : la porte déterministe n'est pas franchie sur cette révision." };
    };
    const c = await page(`/RNO/atelier/contenus/${T}`);
    await saisir(champParLibelle(c, "Commentaire"), "OK");
    await cliquer(parTexte(c, "button", "Enregistrer : approuver"));
    const alerte = c.querySelector('[role="alert"]')?.textContent ?? "";
    expect(alerte).toContain("porte déterministe n'est pas franchie");
    expect(alerte).not.toContain("[conflit]");
    expect(alerte).toContain("Code : conflit");
    // Seule lecture native tolérée : le nom de l'entreprise pour le bandeau (GET, aucune transition).
    const appelsNatifs = (fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>).filter(
      ([url, init]) => !(init?.method === "GET" && /^\/api\/companies\/[^/]+$/u.test(url)),
    );
    expect(appelsNatifs).toEqual([]);
  });

  it("calendrier : date proposée distincte d'une programmation réelle", async () => {
    const c = await page("/RNO/atelier/calendrier");
    expect(c.textContent).toContain("proposée, UTC+2");
    expect(c.textContent).toContain("non programmée");
    expect(c.textContent).toContain("En revue");
  });

  it("résultats : « non mesurable » et coûts IA séparés des dépenses publicitaires", async () => {
    const c = await page("/RNO/atelier/resultats");
    expect(c.textContent).toContain("Non mesurable");
    expect(c.textContent).toContain("Google Search Console");
    const titres = Array.from(c.querySelectorAll("h2")).map((h) => h.textContent);
    expect(titres).toEqual(expect.arrayContaining(["Coûts IA", "Dépenses publicitaires"]));
  });

  it("marque : offre non confirmée et informations manquantes visibles", async () => {
    const c = await page("/RNO/atelier/marque");
    expect(c.textContent).toContain("À confirmer");
    expect(c.textContent).toContain("Gratuité du diagnostic à confirmer");
  });

  it("paramètres : gardes serveur et connecteurs avec leurs états", async () => {
    // Les connecteurs viennent désormais des connexions et agents NATIFS (lot L8) : réponses réelles relevées, voir connexions-natives.spec.tsx.
    const lire = (nom: string) => readFileSync(`${process.cwd()}/tests/ui/fixtures/${nom}`, "utf8");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(url.endsWith("/tools/connections") ? lire("connexions-natives-reelles.json") : url.endsWith("/agents") ? lire("agents-natifs-reels.json") : JSON.stringify({ id: ENTREPRISE, name: "Entreprise" }), { status: 200 })));
    const c = await page("/RNO/atelier/parametres");
    await vi.waitFor(() => expect(c.querySelector('[aria-busy="true"]')).toBeNull());
    expect(c.textContent).toContain("Réel testé");
    expect(c.textContent).toContain("Prêt, pas encore utilisé");
    expect(c.textContent).toContain("Non connecté");
    expect(parTexte(c, "button", "Remettre à zéro").getAttribute("aria-disabled")).toBe("true");
  });

  it("paramètres : tableau « Sources de données réelles » (mode lu sur la passerelle)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: ENTREPRISE, name: "Entreprise" }), { status: 200 })));
    const iso = "2026-10-16T08:00:00.000Z";
    pont.donnees["atelier.sante"] = {
      data: {
        plugin: { id: "atelier", version: "0.1.0" }, espaceBase: "x", migrationsAppliquees: true, connecteurs: [], verifieLe: iso,
        gardeServeur: { p1PolitiqueVerrouillee: "configure_non_verifie", p2PorteDeterministe: "configure_non_verifie", regulateurRuns: "configure_non_verifie" },
        sourcesReelles: { passerelle: "joignable", sources: [
          { cle: "bce", nom: "Banque-Carrefour des Entreprises (BCE)", reelle: false, detail: "Index BCE réel non branché : inscription au portail de la BCE à terminer.", verifieLe: iso },
          { cle: "osm", nom: "OpenStreetMap", reelle: true, detail: "Extrait OpenStreetMap réel servi par la passerelle.", verifieLe: iso },
        ] },
      },
      loading: false, error: null,
    };
    const c = await page("/RNO/atelier/parametres");
    await vi.waitFor(() => expect(c.textContent).toContain("Sources de données réelles"));
    const lignes = [...c.querySelectorAll("table")].find((t) => t.textContent?.includes("OpenStreetMap"))!.querySelectorAll("tbody tr");
    expect(lignes).toHaveLength(2);
    expect(lignes[0]!.textContent).toContain("Démonstration");
    expect(lignes[0]!.textContent).toContain("inscription au portail de la BCE à terminer");
    expect(lignes[1]!.textContent).toContain("Réel");
    expect(c.textContent).toContain("Passerelle joignable.");
  });
});

describe("états", () => {
  it("chargement : zone occupée annoncée", async () => {
    pont.donnees["atelier.equipe"] = { data: null, loading: true, error: null };
    const c = await page("/RNO/atelier/equipe");
    expect(c.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
  it("accès absent : message exploitable, sans détail technique sensible", async () => {
    pont.donnees["atelier.campagnes"] = { data: null, loading: false, error: { code: "WORKER_ERROR", message: "Entreprise non autorisée par l'hôte" } };
    const c = await page("/RNO/atelier/campagnes");
    const alerte = c.querySelector('[role="alert"]');
    expect(alerte?.textContent).toContain("Accès refusé");
    await cliquer(parTexte(alerte!, "button", "Réessayer"));
    expect(pont.rafraichissements).toBeGreaterThan(0);
  });
  it("exécution interrompue : délai dépassé distingué d'une erreur", async () => {
    pont.donnees["atelier.resultats"] = { data: null, loading: false, error: { code: "TIMEOUT", message: "timeout" } };
    const c = await page("/RNO/atelier/resultats");
    expect(c.querySelector('[role="alert"]')?.textContent).toContain("Exécution interrompue");
  });
  it("vide : explication et action de départ", async () => {
    pont.donnees["atelier.campagnes"] = { data: [], loading: false, error: null };
    const c = await page("/RNO/atelier/campagnes");
    expect(c.textContent).toContain("Aucune campagne pour l'instant.");
    expect(parTexte(c, "a", "Créer une campagne depuis un brief").getAttribute("href")).toBe("/RNO/atelier/campagnes/nouvelle");
  });
  it("données périmées : de nouveaux événements du journal sont signalés", async () => {
    let appel = 0;
    pont.donnees["atelier.journal"] = undefined as never;
    const exemples = EXEMPLES_DONNEES["atelier.journal"];
    // Le journal renvoie un premier lot (rattrapage) puis un événement nouveau.
    const original = (globalThis as unknown as { __paperclipPluginBridge__: { sdkUi: Record<string, unknown> } }).__paperclipPluginBridge__.sdkUi.usePluginData as (k: string, p?: Record<string, unknown>) => unknown;
    (globalThis as unknown as { __paperclipPluginBridge__: { sdkUi: Record<string, unknown> } }).__paperclipPluginBridge__.sdkUi.usePluginData = (k: string, p?: Record<string, unknown>) => {
      if (k !== "atelier.journal") return original(k, p);
      appel += 1;
      const apres = Number(p?.afterSeq ?? 0);
      if (apres === 0) return { data: exemples, loading: false, error: null, refresh: () => undefined };
      if (apres === 41) return { data: { evenements: [{ ...(exemples as { evenements: Record<string, unknown>[] }).evenements[0], seq: 42 }], dernierSeq: 42, complet: true }, loading: false, error: null, refresh: () => undefined };
      return { data: { evenements: [], dernierSeq: apres, complet: true }, loading: false, error: null, refresh: () => undefined };
    };
    const c = await page("/RNO/atelier/equipe");
    expect(appel).toBeGreaterThan(1);
    expect(c.querySelector(".atl-fraicheur")?.textContent).toContain("1 nouvel événement depuis : affichage périmé");
  });
});

describe("onglet de tâche et widget", () => {
  it("l'onglet d'une tâche native montre le dossier compact et la décision", async () => {
    rendu = await rendre(createElement(OngletAtelierTache, { context: { ...contexte, entityId: T, entityType: "issue" } }));
    expect(pont.appelsDonnees.some((a) => a.cle === "atelier.dossier" && a.params?.issueId === T)).toBe(true);
    expect(rendu.conteneur.textContent).toContain("Ouvrir le dossier complet");
    expect(rendu.conteneur.textContent).toContain("Décision humaine");
  });
  it("le widget résume les contenus à valider et les runs actifs", async () => {
    rendu = await rendre(createElement(WidgetAtelier, { context: contexte }));
    expect(rendu.conteneur.textContent).toContain("1 à valider");
    expect(rendu.conteneur.textContent).toContain("0 run actif sur 3");
  });
  it("le widget envoie une demande au Coordinateur puis ouvre la tâche créée", async () => {
    const appels: Array<{ methode: string; url: string; corps: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        appels.push({ methode: init?.method ?? "GET", url, corps: init?.body ? JSON.parse(init.body) : null });
        return new Response(JSON.stringify({ issueId: "n1", identifiant: "DEM-9", lien: "/issues/DEM-9" }), { status: 201 });
      }),
    );
    rendu = await rendre(createElement(WidgetAtelier, { context: contexte }));
    const c = rendu.conteneur;
    await cliquer(parTexte(c, "button", "Envoyer"));
    expect(appels).toHaveLength(0);
    const champ = champParLibelle(c, "Demander à l'équipe") as HTMLTextAreaElement;
    await saisir(champ, " Un post sur l'offre ");
    await cliquer(parTexte(c, "button", "Envoyer"));
    const post = appels.find((a) => a.methode === "POST");
    expect(post?.url).toContain("/equipe/demande");
    expect(post?.corps).toMatchObject({ companyId: ENTREPRISE, texte: "Un post sur l'offre" });
    expect(pont.navigations).toContain("/issues/DEM-9");
    expect(champ.value).toBe("");
  });
  it("le widget affiche l'erreur d'envoi en role alert", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "refusé" }), { status: 500 })));
    rendu = await rendre(createElement(WidgetAtelier, { context: contexte }));
    await saisir(champParLibelle(rendu.conteneur, "Demander à l'équipe") as HTMLTextAreaElement, "Bonjour");
    await cliquer(parTexte(rendu.conteneur, "button", "Envoyer"));
    expect(rendu.conteneur.querySelector('[role="alert"]')?.textContent).toBeTruthy();
    expect(pont.navigations).toHaveLength(0);
  });
});

describe("marque : référentiel étendu en lecture", () => {
  it("affiche les entités, segments, cibles de prospection et modules actifs", async () => {
    const donnees = (await import("../../src/contrats/exemples/index.js")).EXEMPLES_DONNEES["atelier.marque"] as unknown as { marque: Record<string, unknown> };
    const { REFERENTIEL_COURTIER } = await import("../../src/contrats/exemples/prospection.js");
    pont.donnees["atelier.marque"] = { data: { ...donnees, marque: { ...REFERENTIEL_COURTIER, companyId: ENTREPRISE } }, loading: false, error: null };
    const c = await page("/RNO/atelier/marque");
    expect(c.textContent).toContain("Entités");
    expect(c.textContent).toContain("Courtage non-vie (démonstration)");
    expect(c.textContent).toContain("marque de Courtage non-vie (démonstration)");
    expect(c.textContent).toContain("Médecins");
    expect(c.textContent).toContain("Cibles de prospection");
    expect(c.textContent).toContain("Intermédiaire d'assurance");
  });
});
