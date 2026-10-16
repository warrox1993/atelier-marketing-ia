// Captures d'écran de secours (plan B) pour la présentation, en LECTURE SEULE, SANS fenêtre visible
// (chromium headless de Playwright ; le Chrome de l'utilisateur n'est jamais utilisé).
// Aucun clic sur Exporter, Importer, Supprimer, Corbeille, Approuver, Envoyer, Valider : seulement des onglets, filtres, fiches et une recherche.
//
// Usage : node scripts/demo/captures-presentation.mjs [url de base] [préfixe entreprise] [dossier de sortie]
// Défauts : http://127.0.0.1:3580  COUA  docs/captures/presentation
// Captures 11 à 19 : écrans ajoutés (accueil, confiance, compte rendu du lead, carte, corbeille, connaissances,
// diagnostic, mise en place, tâche native) en pleine page. Le mode sombre n'est pas géré par ce script.
// Variable facultative CAPTURES_FILTRE : expression régulière sur le nom de fichier (refaire quelques vues seulement).
// Variables facultatives CAPTURES_TACHE et CAPTURES_QUESTION : tâche et question de la capture 08b (repli : première tâche, titre du premier document).
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
// Variables facultatives : CAPTURES_TACHE (titre, identifiant ou id de la tâche de recherche) et CAPTURES_QUESTION.
// Sans elles : première tâche de l'entreprise, et le titre du premier document comme question.
const TACHE_RECHERCHE = process.env.CAPTURES_TACHE ?? null;
const QUESTION_RECHERCHE = process.env.CAPTURES_QUESTION ?? null;
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

/** Saut volontaire d'une capture (donnée absente chez ce client) : message clair, code de sortie inchangé. */
class Saut extends Error {}

/**
 * Lit les lignes du tableau de prospects affiché et en choisit une, sans viser un nom précis.
 * Retourne l'index de la ligne choisie, ou -1. « qualifie90 » : prospect qualifié (au moins 90 %) de plus forte
 * confiance, sinon la plus haute confiance ; « score » : la plus haute confiance parmi les lignes qui ont un score.
 */
async function choisirLigne(mode) {
  return page.evaluate((m) => {
    const lignes = [...document.querySelectorAll("tbody tr")].map((tr, i) => {
      const conf = tr.querySelector('td[data-libelle="Confiance"]')?.textContent ?? "";
      const score = tr.querySelector('td[data-libelle="Score"]')?.textContent ?? "";
      const valeur = Number(/(\d+)\s*%/u.exec(conf)?.[1] ?? -1);
      return { i, valeur, qualifie: /qualifié/u.test(conf) && !/non qualifié/u.test(conf), aScore: !/pas de score/u.test(score) && score.trim() !== "" };
    });
    const meilleur = (l) => l.reduce((a, b) => (b.valeur > a.valeur ? b : a), l[0]);
    let candidats = m === "score" ? lignes.filter((l) => l.aScore) : lignes;
    if (m === "qualifie90") {
      const q = lignes.filter((l) => l.qualifie && l.valeur >= 90);
      if (q.length) candidats = q;
    }
    if (!candidats.length) candidats = lignes;
    return candidats.length ? meilleur(candidats).i : -1;
  }, mode);
}

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

// Pleine page : le contenu défile dans un conteneur interne, donc « fullPage » ne suffit pas.
// On mesure le plus grand défilement interne et on agrandit la fenêtre d'autant (plafond 7000 px).
async function agrandirJusquAuBas() {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(300);
  const plus = await page.evaluate(() => {
    let max = 0;
    for (const el of document.querySelectorAll("*")) {
      const o = getComputedStyle(el).overflowY;
      if ((o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight) max = Math.max(max, el.scrollHeight - el.clientHeight);
    }
    return Math.max(max, document.documentElement.scrollHeight - window.innerHeight);
  });
  await page.setViewportSize({ width: 1600, height: Math.min(7000, 1000 + Math.max(0, plus)) });
  await page.waitForTimeout(600);
}

async function allerTache(route) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(base + route, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /Campagne Google Ads/u.test(document.body.innerText), null, { timeout: 30_000 });
  await page.waitForTimeout(2500);
}

async function prendre(nom, hauteur, preparer, pleinePage = false) {
  if (filtre && !filtre.test(nom)) return;
  try {
    await preparer();
    if (pleinePage) await agrandirJusquAuBas();
    else if (hauteur) await page.setViewportSize({ width: 1600, height: hauteur });
    await page.waitForTimeout(500);
    const fichier = path.join(sortie, `${nom}.png`);
    await page.screenshot({ path: fichier });
    console.log(fichier);
  } catch (e) {
    if (e instanceof Saut) {
      console.log(`SAUT ${nom} : ${e.message}`);
      return;
    }
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

  // 6. Fiche d'une entreprise (score expliqué, base légale par canal), puis d'une exclue par une règle.
  // Aucun nom en dur : on prend la ligne de plus forte confiance qui a un score, et la première ligne exclue.
  const ouvrirFiche = async (index) => {
    await page.locator("tbody tr").nth(index).getByRole("button", { name: /Ouvrir la fiche de/u }).click();
    const fermer = page.getByRole("button", { name: "Fermer la fiche" });
    await fermer.waitFor({ timeout: 15_000 });
    await page.getByText("Base légale par canal").waitFor({ timeout: 15_000 });
    await fermer.evaluate((el) => el.scrollIntoView({ block: "start" }));
  };
  const listeEntreprises = async () => {
    await aller(`/${prefixe}/atelier/prospects`, "prospects");
    await page.getByRole("button", { name: "Entreprises", exact: true }).click();
    await page.locator("tbody tr").first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  };
  await prendre("06-prospect-fiche-score-base-legale", 1250, async () => {
    await listeEntreprises();
    const index = await choisirLigne("score");
    if (index < 0) throw new Saut("aucun prospect entreprise dans la liste");
    await ouvrirFiche(index);
  });
  await prendre("06b-prospect-fiche-exclu-doublon", 1000, async () => {
    await listeEntreprises();
    const exclues = page.locator("tbody tr").filter({ has: page.locator('td[data-libelle="Statut"]', { hasText: "Exclu par une règle" }) });
    if ((await exclues.count()) === 0) throw new Saut("aucun prospect exclu par une règle dans la liste affichée");
    await exclues.first().getByRole("button", { name: /Ouvrir la fiche de/u }).click();
    const fermer = page.getByRole("button", { name: "Fermer la fiche" });
    await fermer.waitFor({ timeout: 15_000 });
    await page.getByText("Base légale par canal").waitFor({ timeout: 15_000 });
    await fermer.evaluate((el) => el.scrollIntoView({ block: "start" }));
  });

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

  // 8. Connaissances : liste des documents (on attend le tableau chargé, pas un nombre précis)
  const documentsCharges = async () => {
    await aller(`/${prefixe}/atelier/connaissances`, "Documents du client");
    await page.locator("main table tbody tr").first().or(page.getByText("Aucun document pour le moment")).first().waitFor({ timeout: 30_000 });
  };
  await prendre("08-connaissances-documents", 2000, async () => {
    await documentsCharges();
    await page.getByText("Documents du client").first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  });
  await prendre("08b-connaissances-recherche-citation", 1400, async () => {
    await documentsCharges();
    const r = await page.request.get(`${base}/api/companies`);
    const societe = (await r.json()).find((c) => c.issuePrefix === prefixe);
    if (!societe) throw new Error(`entreprise introuvable : ${prefixe}`);
    const t = await page.request.get(`${base}/api/companies/${societe.id}/issues`);
    const liste = await t.json();
    const taches = Array.isArray(liste) ? liste : liste.issues;
    const tache = TACHE_RECHERCHE
      ? taches.find((i) => [i.title, i.identifier, i.id].includes(TACHE_RECHERCHE))
      : taches[0];
    if (!tache) throw new Saut(TACHE_RECHERCHE ? `tâche introuvable (CAPTURES_TACHE=${TACHE_RECHERCHE})` : "aucune tâche dans l'entreprise (ou fixer CAPTURES_TACHE)");
    const premierDocument = (await page.locator("main table tbody tr").first().locator("th, td").first().innerText().catch(() => "")).trim();
    const question = QUESTION_RECHERCHE ?? premierDocument;
    if (!question) throw new Saut("aucune question possible : aucun document et CAPTURES_QUESTION non fixée");
    const champs = page.locator("main input:not([type=file])");
    await champs.nth(await champs.count() - 2).fill(tache.id);
    await champs.nth(await champs.count() - 1).fill(question);
    await page.getByRole("button", { name: "Chercher" }).click();
    await page.getByRole("list", { name: "Passages trouvés" }).or(page.getByText("Aucune source trouvée")).first().waitFor({ timeout: 30_000 });
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

  // 11 à 19 : écrans ajoutés, en pleine page, mode clair (lecture seule : navigation, case à cocher de filtre, fiche ouverte)
  await prendre("11-accueil-a-faire", 1000, async () => {
    await aller(`/${prefixe}/atelier`, "Modèles de demande");
    await page.getByText("Missions en cours").first().waitFor({ timeout: 15_000 });
  }, true);

  await prendre("12-prospects-confiance-qualifies", 1000, async () => {
    await aller(`/${prefixe}/atelier/prospects`, "prospects");
    await page.getByLabel(/Qualifiés/u).check();
    await page.getByRole("button", { name: "Filtrer", exact: true }).click();
    await page.getByText("Confiance", { exact: false }).first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1200);
  }, true);

  await prendre("13-prospect-compte-rendu-lead", 1700, async () => {
    await aller(`/${prefixe}/atelier/prospects`, "prospects");
    await page.getByRole("button", { name: "Filtrer", exact: true }).click();
    await page.locator("tbody tr").first().waitFor({ timeout: 15_000 });
    const index = await choisirLigne("qualifie90");
    if (index < 0) throw new Saut("aucun prospect dans la liste");
    await page.locator("tbody tr").nth(index).getByRole("button", { name: /Ouvrir la fiche de/u }).click();
    await page.getByRole("heading", { name: "Compte rendu du lead" }).waitFor({ timeout: 20_000 });
    await page.getByText("Poser une question au Coordinateur").first().waitFor({ timeout: 20_000 });
    await page.getByRole("heading", { name: "Compte rendu du lead" }).evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(1000);
  });

  await prendre("14-carte-des-prospects", 1000, async () => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`${base}/${prefixe}/atelier/carte`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => /Carte des prospects/u.test(document.body.innerText) && !/Chargement de la carte/u.test(document.body.innerText), null, { timeout: 30_000 });
    await page.waitForTimeout(1500);
  }, true);

  await prendre("15-corbeille", 1000, async () => {
    await aller(`/${prefixe}/atelier/corbeille`, "Éléments supprimés");
  }, true);

  await prendre("16-connaissances-importer-page-web", 1000, async () => {
    await aller(`/${prefixe}/atelier/connaissances`, "Importer une page web");
  }, true);

  await prendre("17-parametres-sources-reelles", 1000, async () => {
    await aller(`/${prefixe}/atelier/parametres`, "Sources de données réelles");
  }, true);

  await prendre("18-mise-en-place-client", 1000, async () => {
    await aller(`/${prefixe}/atelier/mise-en-place`, "Sept étapes");
  }, true);

  // 19. Tâche native de mission : plan de mission et sous-tâches, puis le document « plan »
  await prendre("19-tache-native-plan-mission", 1000, async () => {
    await allerTache(`/${prefixe}/issues/${prefixe}-4`);
  }, true);
  await prendre("19b-tache-native-document-plan", 1000, async () => {
    await allerTache(`/${prefixe}/issues/${prefixe}-4#document-plan`);
  }, true);
} finally {
  await navigateur.close();
}
process.exit(echecs ? 1 : 0);
