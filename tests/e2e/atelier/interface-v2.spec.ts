/**
 * Nouvelle interface de l'atelier dans un vrai navigateur (chromium sans interface), contre l'instance d'essai
 * jetable « atelier-e2e » (HTTP 3590, PostgreSQL 54790) : mode simple / mode expert du menu du socle, cinq
 * rubriques à onglets (clavier compris), anciennes adresses, Accueil « À faire » traité sur place, Discussion
 * avec boutons d'action, bandeau d'entreprise, aucune erreur de console. Bureau 1440x900 ET téléphone 390x844.
 *
 * Préparation : tests/e2e/atelier/preparer.sh atelier-e2e 3590 54790 avec ATELIER_COPIE=<copie du plugin construit>,
 * l'interface du socle construite par `vite build` et servie depuis paperclip/server/ui-dist (voir README).
 * Les données d'essai (une campagne jetable et sa carte de confirmation, un message du Coordinateur avec des
 * actions) sont créées par les routes de l'instance puis, pour le message d'un agent, directement dans la base
 * PostgreSQL de l'instance jetable (psql, port ATELIER_E2E_PG_PORT, défaut 54790) : AUCUNE route n'écrit au nom d'un agent.
 * Captures : dossier ATELIER_E2E_CAPTURES (défaut instance/e2e-atelier-resultats/interface-v2).
 */
import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const NOM_ENTREPRISE = process.env.ATELIER_E2E_ENTREPRISE ?? "Rénovation Liège (démonstration)";
const PORT_PG = process.env.ATELIER_E2E_PG_PORT ?? "54790";
const DOSSIER_CAPTURES = process.env.ATELIER_E2E_CAPTURES ?? join(process.cwd(), "instance", "e2e-atelier-resultats", "interface-v2");
const PLUGIN = "atelier.marketing-ia";
const NOM_CAMPAGNE = "Essai e2e interface";

let prefixe = "";
let companyId = "";
let briefCampagne = "";

function surveillerConsole(page: Page): string[] {
  const erreurs: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erreurs.push(`console : ${m.text()}`);
  });
  page.on("pageerror", (e) => erreurs.push(`exception : ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) erreurs.push(`réponse ${r.status()} : ${r.request().method()} ${r.url()}`);
  });
  return erreurs;
}

async function capturer(page: Page, nom: string) {
  mkdirSync(DOSSIER_CAPTURES, { recursive: true });
  await page.screenshot({ path: join(DOSSIER_CAPTURES, `${nom}.png`) });
}

async function sansDebordement(page: Page) {
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, largeur: window.innerWidth, corps: document.body.scrollWidth }));
  expect(m.scroll, `scrollWidth ${m.scroll} ≠ innerWidth ${m.largeur}`).toBe(m.largeur);
  expect(m.corps, `body.scrollWidth ${m.corps} > innerWidth ${m.largeur}`).toBeLessThanOrEqual(m.largeur);
}

/** Ouvre une adresse de l'atelier et attend la fin des chargements. */
async function ouvrir(page: Page, chemin: string) {
  await page.goto(`/${prefixe}/atelier${chemin}`);
  await expect(page.locator(".atl-page, .atl-disc").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 30_000 });
}

async function json<T>(r: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  expect(r.ok(), `HTTP ${r.status()} ${r.url()}`).toBeTruthy();
  return (await r.json()) as T;
}

function sql(requete: string): string {
  return execFileSync("psql", ["-h", "127.0.0.1", "-p", PORT_PG, "-U", "paperclip", "-d", "paperclip", "-At", "-c", requete], {
    env: { ...process.env, PGPASSWORD: "paperclip" },
    encoding: "utf8",
  }).trim();
}

/** Liste d'une route de l'API de l'hôte, tolérante aux deux formes de réponse (tableau ou {items}). */
async function lister<T>(request: APIRequestContext, url: string): Promise<T[]> {
  const brut = await json<unknown>(await request.get(url));
  return (Array.isArray(brut) ? brut : ((brut as { items?: unknown[] }).items ?? [])) as T[];
}

test.beforeAll(async ({ request }) => {
  const e = (await lister<{ id: string; name: string; issuePrefix: string }>(request, "/api/companies")).find((x) => x.name === NOM_ENTREPRISE);
  if (!e) throw new Error(`Entreprise « ${NOM_ENTREPRISE} » absente : lancer tests/e2e/atelier/preparer.sh`);
  prefixe = e.issuePrefix;
  companyId = e.id;

  // Campagne jetable (créée une fois) : sa tâche de brief porte une carte de confirmation, élément « À faire » traitable.
  const campagnes = await json<Array<{ nom: string; briefIssueId: string }>>(await request.get(`/api/plugins/${PLUGIN}/api/campagnes?companyId=${companyId}`));
  let brief = campagnes.find((c) => c.nom === NOM_CAMPAGNE)?.briefIssueId;
  if (!brief) {
    const projet = await json<{ id: string }>(await request.post(`/api/companies/${companyId}/projects`, { data: { name: NOM_CAMPAGNE } }));
    const c = await json<{ briefIssueId: string }>(
      await request.post(`/api/plugins/${PLUGIN}/api/campagnes`, { data: { companyId, projectId: projet.id, nom: NOM_CAMPAGNE, brief: "Brief d'essai automatique." } }),
    );
    brief = c.briefIssueId;
  }
  briefCampagne = brief;
  // Message du Coordinateur avec deux actions, dans l'issue de discussion (écrit en base : aucune route ne le permet).
  const agents = await lister<{ id: string; name: string; role: string }>(request, `/api/companies/${companyId}/agents`);
  const coordinateur = agents.find((a) => a.role === "ceo") ?? agents.find((a) => a.name.startsWith("Coordinateur"));
  expect(coordinateur, "agent Coordinateur").toBeTruthy();
  const discussion = sql(`select id from issues where company_id='${companyId}' and title like 'Discussion avec le Coordinateur%' order by created_at limit 1`);
  expect(discussion, "issue de discussion").toMatch(/^[0-9a-f-]{36}$/u);
  const corps = 'Voici deux raccourcis (essai e2e).\n\n```atelier-actions\n[{"type":"ouvrir","cible":"prospects"},{"type":"traiter","element":"question:00000000-0000-4000-8000-000000000000"}]\n```';
  const existe = sql(`select count(*) from issue_comments where issue_id='${discussion}' and body like 'Voici deux raccourcis (essai e2e)%'`);
  if (existe === "0") {
    sql(`insert into issue_comments (company_id, issue_id, author_agent_id, author_type, body) values ('${companyId}','${discussion}','${coordinateur!.id}','agent', $b$${corps}$b$)`);
  }
});

/** Pose une carte de confirmation neuve (traiter une carte la consomme) et rend son titre, unique. */
async function poserCarte(request: APIRequestContext): Promise<string> {
  const titre = `Valider le plan e2e ${Date.now()}`;
  await json(
    await request.post(`/api/issues/${briefCampagne}/interactions`, {
      data: { kind: "request_confirmation", title: titre, continuationPolicy: "none", payload: { version: 1, prompt: "Confirmez-vous le plan d'essai ?", acceptLabel: "Confirmer", rejectLabel: "Refuser" } },
    }),
  );
  return titre;
}

type Format = { nom: string; largeur: number; hauteur: number; mobile: boolean };
const FORMATS: Format[] = [
  { nom: "bureau", largeur: 1440, hauteur: 900, mobile: false },
  { nom: "mobile", largeur: 390, hauteur: 844, mobile: true },
];

for (const f of FORMATS) {
  test.describe(`${f.nom} ${f.largeur}x${f.hauteur}`, () => {
    test.use({ viewport: { width: f.largeur, height: f.hauteur }, isMobile: f.mobile, hasTouch: f.mobile });

    /** Sur téléphone, le menu du socle est un tiroir : on l'ouvre avant de chercher l'interrupteur. */
    async function menuSocle(page: Page) {
      if (f.mobile) {
        await page.getByRole("button", { name: /^(Open sidebar|Ouvrir le menu)$/iu }).first().tap();
      }
      return page.getByRole("navigation").filter({ hasText: "Atelier marketing" }).first();
    }

    test("menu du socle : mode simple à l'arrivée, bascule en mode expert et retour", async ({ page }) => {
      const erreurs = surveillerConsole(page);
      await page.goto(`/${prefixe}/dashboard`);
      await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("atelier.mode-expert.")).forEach((k) => localStorage.removeItem(k)));
      await page.reload();
      const menu = await menuSocle(page);
      await expect(menu.getByRole("link", { name: /Atelier marketing/u })).toBeVisible({ timeout: 30_000 });
      const interrupteur = page.getByRole("switch", { name: "Mode expert" });
      await expect(interrupteur).toBeVisible();
      await expect(interrupteur).toHaveAttribute("aria-checked", "false");
      // Menu réduit : l'atelier, « Nouvelle tâche » et l'interrupteur ; pas les entrées d'origine du socle.
      const liensSimple = await menu.getByRole("link").count();
      expect(liensSimple, "entrées du menu en mode simple").toBeLessThanOrEqual(2);
      await capturer(page, `${f.nom}-1-menu-simple`);

      await interrupteur.click();
      await expect(interrupteur).toHaveAttribute("aria-checked", "true");
      await expect.poll(async () => page.getByRole("navigation").first().getByRole("link").count(), { timeout: 10_000 }).toBeGreaterThan(liensSimple + 3);
      await capturer(page, `${f.nom}-2-menu-expert`);

      // La préférence survit au rechargement, puis le retour au mode simple est possible.
      await page.reload();
      if (f.mobile) await page.getByRole("button", { name: /^(Open sidebar|Ouvrir le menu)$/iu }).first().tap();
      await expect(page.getByRole("switch", { name: "Mode expert" })).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
      await page.getByRole("switch", { name: "Mode expert" }).click();
      await expect(page.getByRole("switch", { name: "Mode expert" })).toHaveAttribute("aria-checked", "false");
      await expect.poll(async () => page.getByRole("navigation").first().getByRole("link").count(), { timeout: 10_000 }).toBeLessThanOrEqual(2);
      await sansDebordement(page);

      expect(erreurs, erreurs.join("\n")).toEqual([]);
    });

    if (f.mobile) {
      test("barre du bas en mode simple : Atelier, Nouvelle tâche, À faire", async ({ page }) => {
        const erreurs = surveillerConsole(page);
        await page.goto(`/${prefixe}/dashboard`);
        const barre = page.getByRole("navigation", { name: "Navigation mobile" });
        await expect(barre).toBeVisible({ timeout: 30_000 });
        const textes = (await barre.locator("a, button").allInnerTexts()).map((t) => t.replace(/\s+/gu, " ").trim());
        expect(textes.length, `éléments de la barre : ${textes.join(" | ")}`).toBe(3);
        expect(textes[0]).toContain("Atelier");
        expect(textes[1]).toContain("Nouvelle tâche");
        expect(textes[2]).toContain("À faire");
        await capturer(page, "mobile-3-barre-du-bas");
        for (const lien of [/Atelier/u, /À faire/u]) {
          await page.goto(`/${prefixe}/dashboard`);
          await barre.getByRole("link", { name: lien }).tap();
          await expect(page).toHaveURL(new RegExp(`/${prefixe}/atelier$`, "u"), { timeout: 30_000 });
          await expect(page.getByText("Organization not found")).toHaveCount(0);
          await expect(page.getByRole("heading", { name: "Accueil", level: 1 })).toBeVisible({ timeout: 30_000 });
        }
        expect(erreurs, erreurs.join("\n")).toEqual([]);
      });
    }

    test("« Nouvelle tâche » du menu du socle ouvre la Discussion de l'atelier", async ({ page }) => {
      const erreurs = surveillerConsole(page);
      await page.goto(`/${prefixe}/dashboard`);
      if (f.mobile) await page.getByRole("navigation", { name: "Navigation mobile" }).getByRole("button", { name: /Nouvelle tâche/u }).tap();
      else await page.getByRole("button", { name: /Discuter avec le Coordinateur|Nouvelle tâche/u }).first().click();
      await expect(page).toHaveURL(new RegExp(`/${prefixe}/atelier/discussion`, "u"), { timeout: 30_000 });
      await expect(page.getByRole("heading", { name: "Discussion avec le Coordinateur", level: 1 })).toBeVisible({ timeout: 30_000 });
      expect(erreurs, erreurs.join("\n")).toEqual([]);
    });

    test("cinq rubriques, onglets et clavier, bandeau d'entreprise", async ({ page }) => {
      const erreurs = surveillerConsole(page);
      await ouvrir(page, "");
      const dedans = f.mobile ? page.locator("nav.atl-onglets") : page.locator("nav.atl-nav");
      for (const nom of ["Accueil", "Discussion", "Prospects", "Marketing", "Réglages"]) {
        await expect(dedans.getByRole("link", { name: new RegExp(`^${nom}`, "u") })).toBeVisible();
      }
      expect(await dedans.getByRole("link").count(), "cinq rubriques exactement").toBe(5);

      // Bandeau d'entreprise visible, avec le nom complet.
      await expect(page.locator(".atl-bandeau-entreprise")).toContainText(NOM_ENTREPRISE);
      await capturer(page, `${f.nom}-4-accueil`);

      const parcours: Array<[string, string, string[]]> = [
        ["Prospects", "Prospects : sections", ["Liste", "Carte"]],
        ["Marketing", "Marketing : sections", ["Campagnes", "Contenus", "Calendrier", "Résultats", "Équipe"]],
        ["Réglages", "Réglages : sections", ["Mise en place", "Marque et sources", "Connaissances", "Passage au réel", "Paramètres", "Corbeille"]],
      ];
      for (const [rubrique, etiquette, onglets] of parcours) {
        await dedans.getByRole("link", { name: new RegExp(`^${rubrique}`, "u") }).click();
        const liste = page.getByRole("tablist", { name: etiquette });
        await expect(liste).toBeVisible({ timeout: 30_000 });
        await expect(liste.getByRole("tab")).toHaveText(onglets);
        await expect(liste.getByRole("tab", { selected: true })).toHaveCount(1);
        await expect(liste.getByRole("tab", { selected: true })).toHaveText(onglets[0]!);
        await expect(page.getByRole("tabpanel").first()).toBeVisible();
        await expect(page.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 30_000 });
        await capturer(page, `${f.nom}-5-${rubrique.toLowerCase()}`);

        // Clavier : flèche droite active l'onglet suivant, Fin le dernier, Début le premier, flèche gauche boucle.
        await liste.getByRole("tab", { selected: true }).focus();
        await page.keyboard.press("ArrowRight");
        await expect(liste.getByRole("tab", { selected: true })).toHaveText(onglets[1]!);
        await expect(liste.getByRole("tab", { selected: true })).toBeFocused();
        await page.keyboard.press("End");
        await expect(liste.getByRole("tab", { selected: true })).toHaveText(onglets[onglets.length - 1]!);
        await page.keyboard.press("Home");
        await expect(liste.getByRole("tab", { selected: true })).toHaveText(onglets[0]!);
        await page.keyboard.press("ArrowLeft");
        await expect(liste.getByRole("tab", { selected: true })).toHaveText(onglets[onglets.length - 1]!);
        // Un seul onglet dans l'ordre de tabulation (tabindex itinérant).
        await expect(liste.locator("[role='tab'][tabindex='0']")).toHaveCount(1);
        await expect(page.locator(".atl-bandeau-entreprise")).toBeVisible();
        await sansDebordement(page);
      }

      // Discussion : rubrique sans onglets multiples.
      await dedans.getByRole("link", { name: /^Discussion/u }).click();
      await expect(page.getByRole("heading", { name: "Discussion avec le Coordinateur", level: 1 })).toBeVisible({ timeout: 30_000 });
      expect(erreurs, erreurs.join("\n")).toEqual([]);
    });

    test("anciennes adresses : la bonne rubrique et le bon onglet", async ({ page }) => {
      const erreurs = surveillerConsole(page);
      const cas: Array<[string, string, string]> = [
        ["/carte", "Prospects : sections", "Carte"],
        ["/prospects", "Prospects : sections", "Liste"],
        ["/parametres#param-reel", "Réglages : sections", "Passage au réel"],
        ["/parametres", "Réglages : sections", "Paramètres"],
        ["/marque", "Réglages : sections", "Marque et sources"],
        ["/corbeille", "Réglages : sections", "Corbeille"],
        ["/equipe", "Marketing : sections", "Équipe"],
        ["/campagnes", "Marketing : sections", "Campagnes"],
        ["/resultats", "Marketing : sections", "Résultats"],
      ];
      for (const [chemin, etiquette, onglet] of cas) {
        await page.goto(`/${prefixe}/atelier${chemin}`);
        const liste = page.getByRole("tablist", { name: etiquette });
        await expect(liste, chemin).toBeVisible({ timeout: 30_000 });
        await expect(liste.getByRole("tab", { selected: true }), chemin).toHaveText(onglet);
      }
      await capturer(page, `${f.nom}-6-ancienne-adresse-reel`);
      expect(erreurs, erreurs.join("\n")).toEqual([]);
    });

    test("accueil : un élément « À faire » se déplie et se traite sur place, la pastille baisse", async ({ page, request }) => {
      const TITRE_CARTE = await poserCarte(request);
      const erreurs = surveillerConsole(page);
      await ouvrir(page, "");
      const ligne = page.locator("ul.atl-afaire li", { hasText: TITRE_CARTE });
      await expect(ligne).toBeVisible({ timeout: 30_000 });
      const avant = await page.locator("ul.atl-afaire li").count();
      await capturer(page, `${f.nom}-7-afaire`);

      const bouton = ligne.getByRole("button", { name: "Traiter ici" });
      await bouton.click();
      await expect(ligne.getByRole("button", { name: "Replier" })).toHaveAttribute("aria-expanded", "true");
      const panneau = ligne.locator(".atl-afaire-detail");
      await expect(panneau).toBeVisible();
      await expect(panneau.getByRole("button", { name: "Confirmer" })).toBeVisible();
      await sansDebordement(page);
      await capturer(page, `${f.nom}-8-afaire-deplie`);
      // Replier puis rouvrir.
      await ligne.getByRole("button", { name: "Replier" }).click();
      await expect(panneau).toHaveCount(0);
      await ligne.getByRole("button", { name: "Traiter ici" }).click();

      await ligne.locator(".atl-afaire-detail").getByRole("button", { name: "Confirmer" }).click();
      await expect(page.locator(".atl-afaire-confirmation")).toContainText(TITRE_CARTE, { timeout: 30_000 });
      await expect(page.locator("ul.atl-afaire li", { hasText: TITRE_CARTE })).toHaveCount(0);
      await expect(page.locator("ul.atl-afaire li")).toHaveCount(avant - 1, { timeout: 30_000 });
      await capturer(page, `${f.nom}-9-afaire-traite`);
      expect(erreurs, erreurs.join("\n")).toEqual([]);
    });

    test("discussion : un message du Coordinateur avec action affiche un bouton qui ouvre la bonne vue", async ({ page }) => {
      const erreurs = surveillerConsole(page);
      await ouvrir(page, "/discussion");
      const bulle = page.locator(".atl-disc-bulle[data-auteur='agent']", { hasText: "Voici deux raccourcis (essai e2e)" }).last();
      await expect(bulle).toBeVisible({ timeout: 30_000 });
      // Le bloc technique n'est jamais affiché.
      await expect(bulle).not.toContainText("atelier-actions");
      const bouton = bulle.getByRole("link", { name: "Voir les prospects" });
      await expect(bouton).toBeVisible();
      await sansDebordement(page);
      await capturer(page, `${f.nom}-10-discussion-actions`);
      await bouton.click();
      await expect(page).toHaveURL(new RegExp(`/${prefixe}/atelier/prospects`, "u"));
      await expect(page.getByRole("tablist", { name: "Prospects : sections" }).getByRole("tab", { selected: true })).toHaveText("Liste", { timeout: 30_000 });
      await capturer(page, `${f.nom}-11-discussion-vers-prospects`);
      expect(erreurs, erreurs.join("\n")).toEqual([]);
    });
  });
}
