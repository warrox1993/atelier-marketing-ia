// Captures d'écran de secours (plan B) pour la présentation, en LECTURE SEULE, SANS fenêtre visible
// (chromium headless de Playwright ; le Chrome de l'utilisateur n'est jamais utilisé).
// Aucun clic sur Exporter, Importer, Supprimer, Approuver : seulement des onglets, filtres, fiches et une recherche.
//
// Usage : node scripts/demo/captures-presentation.mjs [url de base] [préfixe entreprise] [dossier de sortie]
// Défauts : http://127.0.0.1:3580  COUA  docs/captures/presentation
// Variable facultative CAPTURES_FILTRE : expression régulière sur le nom de fichier (refaire quelques vues seulement).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Playwright est installé dans le dossier des tests de bout en bout.
const require = createRequire(path.join(racine, "tests/e2e/atelier/package.json"));
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://127.0.0.1:3580";
const prefixe = process.argv[3] ?? "COUA";
const sortie = path.resolve(process.argv[4] ?? path.join(racine, "docs/captures/presentation"));
const filtre = process.env.CAPTURES_FILTRE ? new RegExp(process.env.CAPTURES_FILTRE, "u") : null;
const TACHE_RECHERCHE = "Prospection habitation Liège (démonstration)";
const QUESTION_RECHERCHE = "franchise dégâts des eaux habitation";
mkdirSync(sortie, { recursive: true });

const navigateur = await chromium.launch({ headless: true });
const contexte = await navigateur.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
  locale: "fr-BE",
  timezoneId: "Europe/Brussels",
});
const page = await contexte.newPage();
let echecs = 0;

async function aller(route, texteAttendu) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(base + route, { waitUntil: "domcontentloaded" });
  await page.getByText(texteAttendu).first().waitFor({ timeout: 30_000 });
  await page.waitForFunction(
    () => !/Chargement|Lecture des (budgets|connexions|agents)|Loading/u.test(document.querySelector("main")?.innerText ?? ""),
    null,
    { timeout: 30_000 },
  ).catch(() => undefined);
  await page.waitForTimeout(800);
}

async function prendre(nom, hauteur, preparer) {
  if (filtre && !filtre.test(nom)) return;
  try {
    await preparer();
    if (hauteur) await page.setViewportSize({ width: 1600, height: hauteur });
    await page.waitForTimeout(500);
    const fichier = path.join(sortie, `${nom}.png`);
    await page.screenshot({ path: fichier });
    console.log(fichier);
  } catch (e) {
    echecs++;
    console.error(`ÉCHEC ${nom} : ${e.message.split("\n")[0]}`);
  }
}

const aucunFaitModifie = async (locator) => locator.scrollIntoViewIfNeeded();

try {
  // 1. Agents de l'entreprise
  await prendre("01-agents-liste", 1000, async () => {
    await aller(`/${prefixe}/agents/all`, "Coordinateur");
  });

  // 2. Atelier marketing : équipe et coordination
  await prendre("02-atelier-equipe-coordination", 1400, async () => {
    await aller(`/${prefixe}/atelier/equipe`, "13 agents");
  });

  // 3. Galerie de connexions (cartes de l'atelier : filtre sur « démonstration »)
  await prendre("03-galerie-connexions-atelier", 1700, async () => {
    await aller(`/${prefixe}/apps`, "Connectors");
    await page.getByRole("button", { name: "All", exact: true }).click().catch(() => undefined);
    await page.getByPlaceholder(/Search connectors/iu).fill("démonstration");
    await page.getByText("Google Ads (démonstration)").first().waitFor({ timeout: 15_000 });
  });

  // 4 et 5. Prospects : liste filtrée entreprises, puis particuliers
  await prendre("04-prospects-entreprises", 1250, async () => {
    await aller(`/${prefixe}/atelier/prospects`, "prospects");
    await page.getByRole("button", { name: "Entreprises", exact: true }).click();
    await page.getByRole("button", { name: "Filtrer", exact: true }).click();
    await page.getByText("Isolation Outremeuse Plus").first().waitFor({ timeout: 15_000 });
  });
  await prendre("05-prospects-particuliers", 1250, async () => {
    await aller(`/${prefixe}/atelier/prospects`, "prospects");
    await page.getByRole("button", { name: "Particuliers", exact: true }).click();
    await page.getByRole("button", { name: "Filtrer", exact: true }).click();
    await page.locator("tbody button", { hasText: "[client-" }).first().waitFor({ timeout: 15_000 });
    await page.waitForFunction(() => !/Isolation Outremeuse/u.test(document.querySelector("main")?.innerText ?? ""), null, { timeout: 15_000 });
  });

  // 6. Fiche d'une entreprise OpenStreetMap réelle (score expliqué, base légale par canal), puis d'une exclue pour doublon
  const fiche = async (libelle) => {
    await aller(`/${prefixe}/atelier/prospects`, "prospects");
    await page.getByRole("button", { name: "Entreprises", exact: true }).click();
    await page.locator("button", { hasText: libelle }).first().click();
    const fermer = page.getByRole("button", { name: "Fermer la fiche" });
    await fermer.waitFor({ timeout: 15_000 });
    await page.getByText("Base légale par canal").waitFor({ timeout: 15_000 });
    await fermer.evaluate((el) => el.scrollIntoView({ block: "start" }));
  };
  await prendre("06-prospect-fiche-score-base-legale", 1250, () => fiche("Ninja ramen"));
  await prendre("06b-prospect-fiche-exclu-doublon", 1000, () => fiche("Hôtel Sauvenière"));

  // 7. Base clients et oppositions, puis panneau d'export (sans exporter)
  await prendre("07-base-clients", 1250, async () => {
    await aller(`/${prefixe}/atelier/prospects`, "prospects");
    await page.getByRole("button", { name: "Base clients et oppositions" }).click();
    await page.getByText("Base clients actuelle").waitFor({ timeout: 15_000 });
  });
  await prendre("07b-export-fichier-sans-exporter", 1000, async () => {
    await aller(`/${prefixe}/atelier/prospects`, "prospects");
    await aucunFaitModifie(page.getByText("Exporter un fichier").first());
  });

  // 8. Connaissances : liste des documents (un périmé, un retiré, un à venir)
  await prendre("08-connaissances-documents", 2000, async () => {
    await aller(`/${prefixe}/atelier/connaissances`, "17 documents");
    await page.getByText("Documents du client").first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  });
  await prendre("08b-connaissances-recherche-citation", 1400, async () => {
    await aller(`/${prefixe}/atelier/connaissances`, "17 documents");
    const tache = await (async () => {
      const r = await page.request.get(`${base}/api/companies`);
      const societe = (await r.json()).find((c) => c.issuePrefix === prefixe);
      const t = await page.request.get(`${base}/api/companies/${societe.id}/issues`);
      const liste = await t.json();
      return (Array.isArray(liste) ? liste : liste.issues).find((i) => i.title === TACHE_RECHERCHE);
    })();
    if (!tache) throw new Error(`tâche introuvable : ${TACHE_RECHERCHE}`);
    const champs = page.locator("main input:not([type=file])");
    await champs.nth(await champs.count() - 2).fill(tache.id);
    await champs.nth(await champs.count() - 1).fill(QUESTION_RECHERCHE);
    await page.getByRole("button", { name: "Chercher" }).click();
    await page.getByText(/275/u).first().waitFor({ timeout: 30_000 });
    await page.getByText("Essayer une recherche").first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  });

  // 9. Marque et sources
  await prendre("09-marque-et-sources", 2600, async () => {
    await aller(`/${prefixe}/atelier/marque`, "Marque et sources");
    await page.getByText("Offres", { exact: true }).first().waitFor({ timeout: 15_000 });
  });

  // 10. Approbations (Paperclip) et Contenus à valider (atelier)
  await prendre("10-approbations", 1000, async () => {
    await aller(`/${prefixe}/approvals/all`, "Gardien des connexions");
  });
  await prendre("10b-contenus-a-valider", 1000, async () => {
    await aller(`/${prefixe}/atelier/contenus`, "Contenus à valider");
  });
} finally {
  await navigateur.close();
}
process.exit(echecs ? 1 : 0);
