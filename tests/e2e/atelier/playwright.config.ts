/**
 * Tests de bout en bout de l'interface de l'atelier (cahier §17) contre une
 * instance Paperclip RÉELLE déjà lancée (aucune substitution du backend).
 *
 * Préparation : voir tests/e2e/atelier/README.md (instance d'essai sur le
 * port 3590, organisation de démonstration, plugin installé).
 * Lancement : paperclip/node_modules/.bin/playwright test --config tests/e2e/atelier/playwright.config.ts
 * Navigateur : chromium SANS INTERFACE uniquement.
 */
import { defineConfig } from "@playwright/test";

const BASE = process.env.ATELIER_E2E_URL ?? "http://127.0.0.1:3590";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 90_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "../../../instance/e2e-atelier-resultats",
  use: {
    baseURL: BASE,
    headless: true,
    locale: "fr-BE",
    timezoneId: "Europe/Brussels",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "bureau", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
  ],
});
