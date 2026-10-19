/**
 * Historique de navigation de l'atelier (navigation seule : rien n'est créé ni
 * modifié dans l'instance).
 *
 * Garanties vérifiées :
 *  1. chaque « Précédent » du navigateur remonte d'UNE seule adresse, dans
 *     l'ordre exact des rubriques visitées, jusqu'au tableau de bord ;
 *  2. un onglet de Réglages est une adresse à part entière : il ajoute UNE entrée,
 *     le premier « Précédent » revient à l'onglet d'avant, le second sort de Réglages ;
 *  3. les anciennes adresses d'écrans gardent l'adresse demandée et ne
 *     boucle pas dans l'historique (history.length stable sur 1,5 s).
 *
 * Lancement (une instance à la fois, préfixe : GET /api/companies, champ issuePrefix) :
 *   ATELIER_E2E_URL=http://127.0.0.1:3580 ATELIER_E2E_PREFIXE=<préfixe> \
 *     node tests/e2e/atelier/node_modules/@playwright/test/cli.js test \
 *     --config tests/e2e/atelier/playwright.config.ts historique-atelier
 * Navigateur : chromium sans interface, contexte neuf par essai.
 */
import { expect, test, type Page } from "@playwright/test";

const PREFIXE = process.env.ATELIER_E2E_PREFIXE ?? "RNO";
const DANS_ATELIER = /\/atelier(\/|$|\?|#)/u;

async function ouvrirTableauDeBord(page: Page) {
  await page.goto(`/${PREFIXE}/dashboard`);
  await expect(page).toHaveURL(new RegExp(`/${PREFIXE}/dashboard`, "u"));
  await expect(page.getByRole("link", { name: "Réglages de l'atelier" }).first()).toBeVisible({ timeout: 20_000 });
}

async function entrerDansAtelier(page: Page) {
  await page.getByRole("link", { name: "Réglages de l'atelier" }).first().click();
  await expect(page).toHaveURL(DANS_ATELIER);
  await expect(page.locator(".atl-page")).toBeVisible({ timeout: 30_000 });
}

async function cliquerRubrique(page: Page, nom: string) {
  const nav = page.getByRole("navigation", { name: "Rubriques de l'atelier" }).first();
  await nav.getByRole("link", { name: new RegExp(`^${nom}`, "u") }).click();
}

const longueurHistorique = (page: Page) => page.evaluate(() => window.history.length);

test.describe("Historique de l'atelier : bureau", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("1. rubriques du bureau visitées : chaque Précédent remonte d'une seule adresse, jusqu'au tableau de bord", async ({ page }) => {
    await ouvrirTableauDeBord(page);
    const adresses: string[] = [page.url()];
    await entrerDansAtelier(page);
    adresses.push(page.url());
    // L'entrée du menu principal ouvre les Réglages (sans menu secondaire) : on passe au bureau par son adresse.
    await page.goto(`/${PREFIXE}/atelier/prospects`);
    adresses.push(page.url());
    for (const rubrique of ["Marketing", "Prospects"]) {
      const avant = page.url();
      await cliquerRubrique(page, rubrique);
      await expect.poll(() => page.url(), { message: `${rubrique} : l'adresse doit changer` }).not.toBe(avant);
      adresses.push(page.url());
    }
    // Chaque visite est une adresse distincte de la précédente (aucune entrée parasite).
    for (let i = 1; i < adresses.length; i++) expect(adresses[i], `adresse ${i}`).not.toBe(adresses[i - 1]);

    for (let i = adresses.length - 2; i >= 0; i--) {
      await page.goBack();
      await expect.poll(() => page.url(), { message: `Précédent attendu vers ${adresses[i]}` }).toBe(adresses[i]);
    }
    await expect(page).toHaveURL(new RegExp(`/${PREFIXE}/dashboard`, "u"));
    expect(page.url()).not.toMatch(DANS_ATELIER);
  });

  test("2. onglet de Réglages : une seule entrée d'historique, Précédent revient à l'onglet puis sort de Réglages", async ({ page }) => {
    await ouvrirTableauDeBord(page);
    // Réglages : entrée du menu principal (plus de rubrique du menu secondaire) ; entrerDansAtelier clique déjà dessus
    // et arrive sur Réglages. Un second clic ajouterait une entrée d'historique en double : on ne le refait pas.
    await entrerDansAtelier(page);
    const liste = page.getByRole("tablist", { name: "Réglages : sections" });
    await expect(liste).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 30_000 });
    const urlReglages = page.url();
    const avant = await longueurHistorique(page);

    await liste.getByRole("tab", { name: "Paramètres", exact: true }).click();
    await expect(liste.getByRole("tab", { selected: true })).toHaveText("Paramètres");
    await expect.poll(() => page.url()).toContain("/parametres");
    expect(await longueurHistorique(page), "l'onglet ajoute exactement une entrée").toBe(avant + 1);

    await page.goBack();
    await expect.poll(() => page.url(), { message: "le premier Précédent revient à l'onglet d'avant" }).toBe(urlReglages);
    await page.goBack();
    await expect.poll(() => page.url(), { message: "le second Précédent sort de Réglages" }).not.toBe(urlReglages);
    await expect(page.getByRole("tablist", { name: "Réglages : sections" })).toHaveCount(0);
  });

  test("3. anciennes adresses d'écrans : adresse conservée, aucune boucle d'historique", async ({ page }) => {
    const anciennes = ["equipe", "campagnes", "contenus", "calendrier", "resultats", "marque", "carte", "connaissances", "mise-en-place", "corbeille"];
    for (const nom of anciennes) {
      const chemin = `/${PREFIXE}/atelier/${nom}`;
      await page.goto(chemin);
      await expect(page.locator(".atl-page"), nom).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("[aria-busy='true']"), nom).toHaveCount(0, { timeout: 30_000 });
      const avant = await longueurHistorique(page);
      await page.waitForTimeout(1_500);
      expect(await longueurHistorique(page), `${nom} : history.length stable`).toBe(avant);
      expect(new URL(page.url()).pathname, `${nom} : l'adresse reste celle demandée`).toBe(chemin);
    }
  });
});
