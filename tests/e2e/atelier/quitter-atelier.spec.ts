/**
 * Sortie de l'atelier : parcours humains avec historique (navigation seule,
 * rien n'est créé ni modifié dans l'instance).
 *
 * Bogue visé : sur /<PRÉFIXE>/atelier, le bouton « Retour au menu principal »
 * ne ramène nulle part (l'utilisateur reste bloqué dans l'atelier). Ces essais
 * doivent ÉCHOUER tant que le bogue existe.
 *
 * Lancement (une instance à la fois) :
 *   ATELIER_E2E_URL=http://127.0.0.1:3580 ATELIER_E2E_PREFIXE=RNO \
 *     node tests/e2e/atelier/node_modules/@playwright/test/cli.js test \
 *     --config tests/e2e/atelier/playwright.config.ts quitter-atelier
 *   ATELIER_E2E_URL=http://127.0.0.1:3100 ATELIER_E2E_PREFIXE=COU (idem)
 * Navigateur : chromium sans interface, contexte neuf par essai.
 */
import { expect, test, type Page } from "@playwright/test";

const PREFIXE = process.env.ATELIER_E2E_PREFIXE ?? "RNO";
const DANS_ATELIER = /\/atelier(\/|$|\?|#)/u;
const DELAI_SORTIE = 8_000;

const RETOUR = (page: Page) => page.getByRole("button", { name: /Retour au menu principal \(quitter Atelier\)/u });

async function ouvrirTableauDeBord(page: Page) {
  await page.goto(`/${PREFIXE}/dashboard`);
  await expect(page).toHaveURL(new RegExp(`/${PREFIXE}/dashboard`, "u"));
  await expect(page.getByRole("link", { name: "Réglages de l'atelier" }).first()).toBeVisible({ timeout: 20_000 });
}

async function cliquerRubrique(page: Page, nom: string) {
  const nav = page.getByRole("navigation", { name: "Rubriques de l'atelier" }).first();
  await nav.getByRole("link", { name: nom, exact: true }).click();
}

/** Clic sur le bouton retour puis contrôle de la sortie réelle de l'atelier. */
async function quitterParLeBouton(page: Page, contexte: string) {
  await expect(RETOUR(page), `${contexte} : bouton retour présent`).toBeVisible();
  await RETOUR(page).click();
  await expect
    .poll(() => page.url(), { timeout: DELAI_SORTIE, message: `${contexte} : toujours dans l'atelier, URL finale ${page.url()}` })
    .not.toMatch(DANS_ATELIER);
  // Pas de rebond : l'application ne doit pas renvoyer dans l'atelier après coup.
  await page.waitForTimeout(2_500);
  expect(page.url(), `${contexte} : rebond dans l'atelier après la sortie, URL finale ${page.url()}`).not.toMatch(DANS_ATELIER);
}

/** La barre latérale principale (sélecteur d'entreprise) est visible. */
async function verifierMenuPrincipal(page: Page, contexte: string) {
  await expect(
    page.getByRole("button", { name: /^Ouvrir le sélecteur d/u }).first(),
    `${contexte} : sélecteur d'entreprise visible (URL ${page.url()})`,
  ).toBeVisible({ timeout: DELAI_SORTIE });
}

test.describe("Quitter l'atelier : bureau", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("1. dashboard → atelier → trois rubriques → retour au menu principal", async ({ page }) => {
    await ouvrirTableauDeBord(page);
    await page.getByRole("link", { name: "Réglages de l'atelier" }).first().click();
    await expect(page).toHaveURL(DANS_ATELIER);
    await page.goto(`/${PREFIXE}/atelier/prospects`);
    for (const rubrique of ["Prospects", "Marketing"]) {
      await cliquerRubrique(page, rubrique);
      await expect(page).toHaveURL(DANS_ATELIER);
    }
    await quitterParLeBouton(page, "scénario 1");
    await verifierMenuPrincipal(page, "scénario 1");
  });

  test("2. entrée directe par URL puis rechargement → retour → hors de l'atelier", async ({ page }) => {
    await page.goto(`/${PREFIXE}/atelier/prospects`);
    await expect(RETOUR(page)).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await expect(RETOUR(page)).toBeVisible({ timeout: 20_000 });
    await quitterParLeBouton(page, "scénario 2");
    await verifierMenuPrincipal(page, "scénario 2");
  });

  test("2b. ouverture par la racine de l'instance (redirigée vers le chat) : menu principal déjà là, sortie par son lien", async ({ page }) => {
    await page.goto(`/${PREFIXE}`);
    await expect(page).toHaveURL(DANS_ATELIER, { timeout: 20_000 });
    // Le chat n'a pas de menu secondaire : le menu principal est déjà affiché et il n'y a donc pas de bouton « Retour ».
    await expect(page.getByRole("heading", { name: /^Coordinateur/u, level: 1 })).toBeVisible({ timeout: 30_000 });
    await verifierMenuPrincipal(page, "scénario 2b");
    await expect(RETOUR(page), "le chat n'a pas de menu secondaire, donc pas de bouton retour").toHaveCount(0);
    await page.getByRole("link", { name: "Tableau de bord", exact: true }).first().click();
    await expect.poll(() => page.url(), { timeout: DELAI_SORTIE, message: "sortie du chat par le menu principal" }).not.toMatch(DANS_ATELIER);
    await page.waitForTimeout(2_500);
    expect(page.url(), `rebond dans l'atelier après la sortie, URL finale ${page.url()}`).not.toMatch(DANS_ATELIER);
  });

  test("3. après sortie, goBack puis re-sortie : jamais de boucle", async ({ page }) => {
    await ouvrirTableauDeBord(page);
    await page.getByRole("link", { name: "Réglages de l'atelier" }).first().click();
    await expect(page).toHaveURL(DANS_ATELIER);
    await page.goto(`/${PREFIXE}/atelier/prospects`);
    await cliquerRubrique(page, "Prospects");
    await quitterParLeBouton(page, "scénario 3, première sortie");
    const apresSortie = page.url();
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    // Le retour arrière ramène dans l'atelier ; on en sort de nouveau.
    await expect(RETOUR(page), `retour arrière : bouton retour (URL ${page.url()})`).toBeVisible({ timeout: 20_000 });
    await quitterParLeBouton(page, "scénario 3, seconde sortie");
    expect(page.url(), "la seconde sortie ne retombe pas dans l'atelier").not.toMatch(DANS_ATELIER);
    // Pas de boucle : au plus une page d'historique de plus que la première sortie.
    expect(new URL(page.url()).pathname).toBe(new URL(apresSortie).pathname);
    await verifierMenuPrincipal(page, "scénario 3");
  });

  test("4. depuis l'atelier, le menu principal reste complet (Tâches, Agents) puis sortie", async ({ page }) => {
    await ouvrirTableauDeBord(page);
    await expect(page.getByRole("switch", { name: "Mode expert" })).toHaveCount(0);
    await page.getByRole("link", { name: "Réglages de l'atelier" }).first().click();
    await expect(page).toHaveURL(DANS_ATELIER);
    // La barre de l'atelier s'affiche à côté de la barre principale, jamais à sa place.
    for (const entree of ["Tâches", "Agents", "Routines", "Projets"]) {
      await expect(page.getByRole("link", { name: entree, exact: true }).first(), `${entree} visible depuis l'atelier`).toBeVisible();
    }
    await page.goto(`/${PREFIXE}/atelier/prospects`);
    await cliquerRubrique(page, "Marketing");
    await quitterParLeBouton(page, "scénario 4");
    await verifierMenuPrincipal(page, "scénario 4");
  });
});

test.describe("Quitter l'atelier : téléphone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("5a. sortie par le bouton retour", async ({ page }) => {
    await page.goto(`/${PREFIXE}/dashboard`);
    await page.getByRole("navigation", { name: "Navigation mobile" }).getByRole("link", { name: "Atelier" }).first().tap();
    await expect(page).toHaveURL(DANS_ATELIER);
    // La barre du bas ouvre le chat, qui n'a pas de menu secondaire : pas de bouton retour. Il existe dans une rubrique à menu secondaire.
    await expect(page.getByRole("heading", { name: /^Coordinateur/u, level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(RETOUR(page)).toHaveCount(0);
    await page.goto(`/${PREFIXE}/atelier/prospects`);
    // Sur téléphone, le bouton retour est dans le tiroir du menu principal.
    await page.getByRole("button", { name: /^(Open sidebar|Ouvrir le menu)$/u }).tap();
    await quitterParLeBouton(page, "scénario 5a");
    await expect(page.getByRole("button", { name: /^(Open sidebar|Ouvrir le menu)$/u }), `menu principal accessible (URL ${page.url()})`).toBeVisible({ timeout: DELAI_SORTIE });
  });

  test("5b. sortie par la barre du bas : un élément mène hors de l'atelier", async ({ page }) => {
    await page.goto(`/${PREFIXE}/atelier/prospects`);
    const barre = page.getByRole("navigation", { name: "Navigation mobile" });
    await expect(barre).toBeVisible({ timeout: 20_000 });
    const liens = barre.getByRole("link");
    const hrefs = await liens.evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    const index = hrefs.findIndex((h) => h !== "" && !DANS_ATELIER.test(h));
    expect(index, `aucun lien de la barre du bas ne sort de l'atelier (liens : ${hrefs.join(", ")})`).toBeGreaterThanOrEqual(0);
    await liens.nth(index).tap();
    await expect.poll(() => page.url(), { timeout: DELAI_SORTIE }).not.toMatch(DANS_ATELIER);
  });
});
