/**
 * Discussion avec le Coordinateur, Paramètres et Prospects sur ordinateur puis sur téléphone, dans un vrai
 * navigateur (chromium sans interface), contre l'instance d'essai jetable « atelier-e2e » (port 3590,
 * PostgreSQL 54790). Préparation : tests/e2e/atelier/preparer.sh atelier-e2e 3590 54790, avec
 * ATELIER_E2E_URL=http://127.0.0.1:3590 et ATELIER_COPIE=<dossier du plugin construit>.
 *
 * Le Coordinateur d'une instance d'essai est un agent de démonstration : on n'attend JAMAIS sa réponse.
 * Captures : dossier ATELIER_E2E_CAPTURES (défaut instance/e2e-atelier-resultats/discussion).
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const NOM_ENTREPRISE = process.env.ATELIER_E2E_ENTREPRISE ?? "Rénovation Liège (démonstration)";
const DOSSIER_CAPTURES = process.env.ATELIER_E2E_CAPTURES ?? join(process.cwd(), "instance", "e2e-atelier-resultats", "discussion");

let prefixe = "";
/** Message unique à chaque passage : le fil est persistant, un ancien message ne doit pas valider le test. */
const MESSAGE = `Essai automatique du ${new Date().toISOString()} : où en sont les missions ?`;

/** Erreurs de console, exceptions de page et réponses HTTP >= 400, relevées pendant tout un test. */
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

/** L'en-tête n'est jamais recouvert, le pied (pastilles + saisie) reste sous 35 % de la fenêtre, la section tient dans la fenêtre. */
async function mesurerDisposition(page: Page) {
  const m = await page.evaluate(() => {
    const boite = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { haut: r.top, bas: r.bottom, hauteur: r.height };
    };
    return { fenetre: window.innerHeight, section: boite(".atl-disc"), entete: boite(".atl-disc-entete"), titre: boite(".atl-disc-entete h1"), fil: boite(".atl-disc-fil"), pied: boite(".atl-disc-pied") };
  });
  expect(m.entete && m.titre && m.fil && m.pied && m.section, "boîtes du chat").toBeTruthy();
  expect(m.pied!.hauteur, "le pied ne dépasse pas 35 % de la fenêtre").toBeLessThanOrEqual(m.fenetre * 0.35 + 1);
  expect(m.titre!.bas, "le nom du Coordinateur est au-dessus du fil").toBeLessThanOrEqual(m.fil!.haut + 1);
  expect(m.fil!.bas, "le fil finit où le pied commence").toBeLessThanOrEqual(m.pied!.haut + 1);
  expect(m.entete!.hauteur, "en-tête sur une seule ligne").toBeLessThanOrEqual(80);
}

async function ouvrir(page: Page, chemin: string) {
  await page.goto(`/${prefixe}/atelier${chemin}`);
  await expect(page.locator(".atl-page, .atl-disc").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 30_000 });
}

/** Ni défilement horizontal de la page, ni débordement du document. */
async function sansDebordement(page: Page) {
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, largeur: window.innerWidth, corps: document.body.scrollWidth }));
  expect(m.scroll, `scrollWidth ${m.scroll} ≠ innerWidth ${m.largeur}`).toBe(m.largeur);
  expect(m.corps, `body.scrollWidth ${m.corps} > innerWidth ${m.largeur}`).toBeLessThanOrEqual(m.largeur);
}

test.beforeAll(async ({ request }) => {
  const rep = await request.get("/api/companies");
  expect(rep.ok()).toBeTruthy();
  const brut = (await rep.json()) as unknown;
  const liste = (Array.isArray(brut) ? brut : ((brut as { items?: unknown[] }).items ?? [])) as Array<{ id: string; name: string; issuePrefix: string }>;
  const e = liste.find((x) => x.name === NOM_ENTREPRISE);
  if (!e) throw new Error(`Entreprise « ${NOM_ENTREPRISE} » absente : lancer tests/e2e/atelier/preparer.sh`);
  prefixe = e.issuePrefix;
});

test.describe("ordinateur 1440x900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("discussion : éléments, envoi, indicateur « réfléchit », fil persistant après rechargement", async ({ page }) => {
    const erreurs = surveillerConsole(page);
    await ouvrir(page, "/discussion");

    await expect(page.getByRole("heading", { name: /^Coordinateur/u, level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dicter", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Parler en direct", exact: true })).toBeVisible();
    const champ = page.getByLabel("Votre message au Coordinateur");
    await expect(champ).toBeVisible();
    // Les pastilles n'existent que tant que le fil est vide : on ne les exige que dans ce cas. Toutes REMPLISSENT la saisie, aucune n'envoie.
    const vide = await page.locator(".atl-disc-suggestion").count();
    if (vide > 0) {
      await expect(page.locator(".atl-disc-suggestion")).toHaveCount(4);
      await page.getByRole("button", { name: "Où en sont les missions ?", exact: true }).click();
      await expect(champ).toHaveValue("Où en sont les missions ?");
      await expect(page.locator(".atl-disc-bulle[data-auteur='humain']", { hasText: /^Où en sont les missions \?$/u })).toHaveCount(0);
    }
    await mesurerDisposition(page);
    await capturer(page, "bureau-1-ouverture");

    await champ.fill(MESSAGE);
    await champ.press("Enter");

    const bulle = page.locator(".atl-disc-bulle[data-auteur='humain']", { hasText: MESSAGE });
    await expect(bulle).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Le Coordinateur réfléchit…")).toBeVisible();
    // La bulle de l'humain est du côté droit du fil.
    const fil = await page.locator(".atl-disc-fil").boundingBox();
    const b = await bulle.boundingBox();
    expect(fil && b, "dimensions du fil et de la bulle").toBeTruthy();
    expect(b!.x + b!.width / 2, "la bulle de l'humain est dans la moitié droite du fil").toBeGreaterThan(fil!.x + fil!.width / 2);
    await capturer(page, "bureau-2-message-envoye");

    // Le fil est persistant : après rechargement, le message est toujours là.
    await page.reload();
    await expect(page.getByRole("heading", { name: /^Coordinateur/u, level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".atl-disc-bulle", { hasText: MESSAGE })).toBeVisible({ timeout: 30_000 });
    await capturer(page, "bureau-3-apres-rechargement");

    expect(erreurs, erreurs.join("\n")).toEqual([]);
  });
});

test.describe("téléphone 390x844", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("discussion : « Envoyer » visible, non recouvert par la barre de l'hôte, sans débordement horizontal", async ({ page }) => {
    const erreurs = surveillerConsole(page);
    await ouvrir(page, "/discussion");
    await expect(page.getByRole("heading", { name: /^Coordinateur/u, level: 1 })).toBeVisible();

    // « Envoyer » est inactif tant que le champ est vide : on saisit d'abord.
    await page.getByLabel("Votre message au Coordinateur").fill("Bonjour (essai mobile)");
    const envoyer = page.getByRole("button", { name: "Envoyer", exact: true });
    await expect(envoyer).toBeVisible();
    await expect(envoyer).toBeEnabled();

    const boite = await envoyer.boundingBox();
    expect(boite, "boîte du bouton Envoyer").toBeTruthy();
    const haut = await envoyer.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const touche = document.elementFromPoint(x, y);
      return { x, y, dedans: !!touche && (touche === el || el.contains(touche)), touche: touche ? `${touche.tagName}.${touche.className}` : null, hauteur: window.innerHeight };
    });
    expect(haut.dedans, `élément au centre du bouton : ${haut.touche} (point ${Math.round(haut.x)},${Math.round(haut.y)}, fenêtre ${haut.hauteur})`).toBe(true);
    expect(haut.y, "le centre du bouton est dans la fenêtre").toBeLessThan(haut.hauteur);

    await sansDebordement(page);
    await mesurerDisposition(page);
    await capturer(page, "mobile-1-discussion-saisie");

    // Cliquable pour de vrai (le clic tactile atteint le bouton) : le message part et la saisie se vide.
    const envois: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/discussion/message")) envois.push(r.url());
    });
    await envoyer.tap();
    await expect(page.getByLabel("Votre message au Coordinateur")).toHaveValue("", { timeout: 30_000 });
    expect(envois, "un seul envoi").toHaveLength(1);
    // Le fil est persistant : une bulle identique d'un essai précédent peut exister, la dernière est la nôtre.
    await expect(page.locator(".atl-disc-bulle", { hasText: "Bonjour (essai mobile)" }).last()).toBeVisible();
    await sansDebordement(page);
    await capturer(page, "mobile-2-discussion-apres-envoi");

    expect(erreurs, erreurs.join("\n")).toEqual([]);
  });

  test("paramètres : un lien du sommaire ouvre sa section", async ({ page }) => {
    const erreurs = surveillerConsole(page);
    await ouvrir(page, "/parametres");
    await expect(page.locator(".atl-entete h1")).toHaveText("Paramètres et diagnostic");
    const sommaire = page.getByRole("tablist", { name: "Sections des paramètres" });
    await expect(sommaire).toBeVisible();
    await sansDebordement(page);
    await capturer(page, "mobile-3-parametres-sommaire");

    const lien = sommaire.getByRole("tab", { name: "Avancé", exact: true });
    await expect(lien).toBeVisible();
    await lien.tap();
    await expect(lien).toHaveAttribute("aria-selected", "true");
    const section = page.locator("#param-reglages")  // première section du panneau « Avancé », celle que l'adresse désigne;
    await expect(section).toBeVisible();
    // Sur téléphone, la section est repliable : le clic sur le sommaire doit l'avoir ouverte.
    await expect(section.locator("details").first()).toHaveAttribute("open", "", { timeout: 10_000 });
    await expect(section).toBeInViewport();
    await sansDebordement(page);
    await capturer(page, "mobile-4-parametres-section");

    expect(erreurs, erreurs.join("\n")).toEqual([]);
  });

  test("prospects : le volet « Filtres » s'ouvre", async ({ page }) => {
    const erreurs = surveillerConsole(page);
    await ouvrir(page, "/prospects");
    await expect(page.locator(".atl-entete h1")).toHaveText("Prospects");

    const volet = page.locator("details.atl-filtres-volet");
    const resume = volet.locator("summary");
    await expect(resume).toContainText(/Filtres \(\d+ actifs?\)/u);
    // Replié d'emblée sur téléphone.
    await expect(volet).not.toHaveAttribute("open", "");
    await capturer(page, "mobile-5-prospects-replie");

    await resume.tap();
    await expect(volet).toHaveAttribute("open", "", { timeout: 10_000 });
    await expect(volet.getByRole("group", { name: "Cible" })).toBeVisible();
    await expect(volet.getByRole("button", { name: "Filtrer", exact: true })).toBeVisible();
    await sansDebordement(page);
    await capturer(page, "mobile-6-prospects-filtres-ouverts");

    expect(erreurs, erreurs.join("\n")).toEqual([]);
  });
});
