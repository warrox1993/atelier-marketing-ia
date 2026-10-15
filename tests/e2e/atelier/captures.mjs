// Captures d'écran SANS INTERFACE (chromium headless de Playwright) des vues clés
// de l'atelier : bureau et téléphone, thème clair et sombre.
//
// Usage : node tests/e2e/atelier/captures.mjs <url de base> <préfixe entreprise> <dossier de sortie> [nom=chemin ...]
// Exemple : node tests/e2e/atelier/captures.mjs http://127.0.0.1:3140 SCN docs/captures dossier=/SCN/atelier/contenus/<id>
// Aucune fenêtre visible n'est ouverte ; le Chrome de l'utilisateur n'est jamais utilisé.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const [base, prefixe, sortie, ...supplements] = process.argv.slice(2);
if (!base || !prefixe || !sortie) {
  console.error("Usage : node captures.mjs <url> <préfixe> <sortie> [nom=chemin ...]");
  process.exit(2);
}
mkdirSync(sortie, { recursive: true });

const vues = [
  ["equipe", `/${prefixe}/atelier/equipe`],
  ["campagnes", `/${prefixe}/atelier/campagnes`],
  ["campagne-nouvelle", `/${prefixe}/atelier/campagnes/nouvelle`],
  ["contenus", `/${prefixe}/atelier/contenus`],
  ["calendrier", `/${prefixe}/atelier/calendrier`],
  ["resultats", `/${prefixe}/atelier/resultats`],
  ["marque", `/${prefixe}/atelier/marque`],
  ["parametres", `/${prefixe}/atelier/parametres`],
];
for (const s of supplements) {
  const [nom, chemin] = s.split("=");
  if (nom && chemin) vues.push([nom, chemin]);
}

const formats = [
  ["bureau", { width: 1440, height: 1400 }],
  ["mobile", { width: 390, height: 1600 }],
];

const navigateur = await chromium.launch({ headless: true });
try {
  for (const theme of ["clair", "sombre"]) {
    for (const [format, viewport] of formats) {
      const contexte = await navigateur.newContext({ viewport, deviceScaleFactor: 1, locale: "fr-BE", timezoneId: "Europe/Brussels", colorScheme: theme === "sombre" ? "dark" : "light" });
      await contexte.addInitScript((t) => {
        try {
          window.localStorage.setItem("paperclip.theme", t);
        } catch {
          /* stockage indisponible : thème par défaut */
        }
      }, theme === "sombre" ? "dark" : "light");
      const page = await contexte.newPage();
      for (const [nom, route] of vues) {
        await page.goto(base + route, { waitUntil: "domcontentloaded" });
        await page.locator(".atl-page").first().waitFor({ timeout: 30_000 });
        await page.waitForFunction(() => !document.querySelector(".atl-page [aria-busy='true']"), null, { timeout: 30_000 }).catch(() => undefined);
        await page.waitForTimeout(400);
        const fichier = path.join(sortie, `${nom}-${format}-${theme}.png`);
        await page.screenshot({ path: fichier, fullPage: true });
        console.log(fichier);
      }
      await contexte.close();
    }
  }
} finally {
  await navigateur.close();
}
