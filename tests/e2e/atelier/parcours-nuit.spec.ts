/**
 * Parcours de bout en bout des nouveautés de la nuit (item 45), contre l'instance d'essai jetable
 * « atelier-e2e » (port 3590, PostgreSQL 54790) : chat d'accueil, pastille de modèle de demande, envoi par
 * Entrée au Coordinateur, puis les vues Corbeille, Carte des prospects, Prospects et
 * Paramètres et diagnostic, sans erreur dans la console.
 *
 * Aucun modèle n'est appelé : l'entreprise est en mode démonstration, sans agent en mode réel
 * (préparation : tests/e2e/atelier/preparer.sh atelier-e2e 3590 54790, avec ATELIER_E2E_URL=http://127.0.0.1:3590).
 */
import { expect, test, type Page } from "@playwright/test";

const NOM_ENTREPRISE = process.env.ATELIER_E2E_ENTREPRISE ?? "Rénovation Liège (démonstration)";

let prefixe = "";
let idEntreprise = "";
/** Vrai si le prospect fictif avec position a été enregistré (alors la carte doit afficher au moins un point). */
let prospectPositionne = false;

const NOM_LEAD = "Marie Exemple (démonstration)";
const NOM_LEAD_POSITIONNE = "Jean Placé (démonstration)";
// Les noms sont pseudonymisés à l'affichage (« [client-xxxxxxxx] ») : on ne s'appuie pas sur eux pour retrouver une ligne.

const consentementFictif = (reference: string) => ({
  date: "2026-10-14T10:00:00+02:00",
  texteAccepte: "J'accepte d'être recontacté par courriel au sujet de ma demande de devis.",
  source: "https://exemple.invalid/devis",
  canauxAutorises: ["courriel"],
  responsableNomme: "Bureau de démonstration",
  reference,
});

/**
 * Le socle (page d'une tâche) interroge toujours le document « plan », absent d'une tâche neuve : 404
 * normal, côté socle et non côté atelier. On l'écarte (avec son écho en console), rien d'autre.
 */
function sansPlanAbsent(erreurs: string[]): string[] {
  const plan = (e: string) => /^réponse 404 : GET \S+\/api\/issues\/[^/]+\/documents\/plan$/u.test(e);
  const nb = erreurs.filter(plan).length;
  let echos = nb;
  return erreurs.filter((e) => {
    if (plan(e)) return false;
    if (echos > 0 && e === "console : Failed to load resource: the server responded with a status of 404 (Not Found)") {
      echos--;
      return false;
    }
    return true;
  });
}

/** Erreurs de console et exceptions de page, relevées pendant tout un test. */
function surveillerConsole(page: Page): string[] {
  const erreurs: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erreurs.push(`console : ${m.text()}`);
  });
  page.on("pageerror", (e) => erreurs.push(`exception : ${e.message}`));
  // L'adresse d'une ressource refusée n'apparaît pas dans le message de console : on la note.
  page.on("response", (r) => {
    if (r.status() >= 400) erreurs.push(`réponse ${r.status()} : ${r.request().method()} ${r.url()}`);
  });
  return erreurs;
}

async function ouvrir(page: Page, chemin: string) {
  await page.goto(`/${prefixe}/atelier${chemin}`);
  await expect(page.locator(".atl-page")).toBeVisible();
  await expect(page.locator(".atl-page [aria-busy='true']")).toHaveCount(0, { timeout: 30_000 });
}

test.beforeAll(async ({ request }) => {
  const rep = await request.get("/api/companies");
  expect(rep.ok()).toBeTruthy();
  const brut = (await rep.json()) as unknown;
  const liste = (Array.isArray(brut) ? brut : ((brut as { items?: unknown[] }).items ?? [])) as Array<{ id: string; name: string; issuePrefix: string }>;
  const e = liste.find((x) => x.name === NOM_ENTREPRISE);
  if (!e) throw new Error(`Entreprise « ${NOM_ENTREPRISE} » absente : lancer tests/e2e/atelier/preparer.sh`);
  prefixe = e.issuePrefix;
  idEntreprise = e.id;

  // Un prospect fictif, pour que le tableau des prospects (colonne « Statut du lead ») ait une ligne à afficher.
  // Idempotent : un deuxième passage retombe sur le même prospect (ou le refuse), sans effet sur le test.
  await request.post("/api/plugins/atelier.marketing-ia/api/prospects/particuliers", {
    data: {
      companyId: idEntreprise,
      referentiel: { version: 1 },
      zone: { codePostal: "4020", commune: "Liège", province: "Liège", region: "Wallonie" },
      coordonnees: { nom: NOM_LEAD, courriel: "marie.exemple@exemple.invalid", telephone: "+32 4 000 99 88", adresse: null },
      origine: "formulaire_entrant",
      consentements: [consentementFictif("soumission-e2e")],
    },
  });

  // Un second prospect fictif, avec une position connue (centre du code postal), pour la carte.
  const placé = await request.post("/api/plugins/atelier.marketing-ia/api/prospects/particuliers", {
    data: {
      companyId: idEntreprise,
      referentiel: { version: 1 },
      zone: { codePostal: "4000", commune: "Liège", province: "Liège", region: "Wallonie", position: { lat: 50.6326, lon: 5.5797, precision: "code_postal" } },
      coordonnees: { nom: NOM_LEAD_POSITIONNE, courriel: "jean.place@exemple.invalid", telephone: "+32 4 000 99 77", adresse: null },
      origine: "formulaire_entrant",
      consentements: [consentementFictif("soumission-e2e-carte")],
    },
  });
  prospectPositionne = placé.ok();
});

test("chat : une pastille de modèle remplit la saisie sans rien envoyer, Entrée envoie la demande au Coordinateur", async ({ page, request }) => {
  const erreurs = surveillerConsole(page);
  const envois: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/discussion/message")) envois.push(r.url());
  });

  // Les pastilles n'existent que dans un fil VIDE (placées dans le fil, sous l'accueil) : le fil de l'entreprise d'essai
  // est déjà rempli par les autres essais, on les vérifie donc dans une entreprise neuve (fil vierge, rien n'y est envoyé).
  const neuve = await request.post("/api/companies", { data: { name: `Chat vierge e2e ${Date.now()}` } });
  expect(neuve.status(), "création de l'entreprise au fil vierge").toBe(201);
  const { issuePrefix: prefixeVierge } = (await neuve.json()) as { issuePrefix: string };
  await page.goto(`/${prefixeVierge}/atelier`);
  await expect(page.getByRole("heading", { name: /^Coordinateur/u, level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".atl-disc-fil .atl-disc-pastilles .atl-disc-suggestion")).toHaveCount(4);
  // Un clic sur une pastille de modèle remplit la saisie du chat, rien n'est envoyé.
  await page.getByRole("button", { name: "Campagne Google Ads" }).click();
  const champVierge = page.getByLabel("Votre message au Coordinateur");
  await expect(champVierge).toHaveValue(/Prépare une campagne Google Ads pour/u);
  await expect(champVierge).toBeFocused();
  await page.waitForTimeout(500);
  expect(envois, "le clic sur un modèle ne doit rien envoyer").toHaveLength(0);
  await expect(page).toHaveURL(new RegExp(`/${prefixeVierge}/atelier/?$`, "u"));

  // Entrée envoie la demande dans l'entreprise d'essai.
  await ouvrir(page, "");
  await expect(page.getByRole("heading", { name: /^Coordinateur/u, level: 1 })).toBeVisible({ timeout: 30_000 });
  const champ = page.getByLabel("Votre message au Coordinateur");

  // Entrée envoie ; la saisie se vide et le message apparaît dans le fil, sans quitter le chat.
  const message = "Prépare une campagne Google Ads pour des fenêtres en PVC à Liège (essai automatique).";
  await champ.fill(message);
  await champ.press("Enter");
  await expect(page.locator(".atl-disc-bulle[data-auteur='humain']", { hasText: "fenêtres en PVC" })).toBeVisible({ timeout: 30_000 });
  await expect(champ).toHaveValue("");
  expect(envois, "une seule demande envoyée").toHaveLength(1);
  await expect(page).toHaveURL(new RegExp(`/${prefixe}/atelier/?$`, "u"));
  expect(erreurs, erreurs.join("\n")).toEqual([]);
});

test("nouvelles vues : Corbeille, Carte des prospects, Prospects, Paramètres et diagnostic", async ({ page }) => {
  const erreurs = surveillerConsole(page);

  await ouvrir(page, "/corbeille");
  await expect(page.locator(".atl-entete h1")).toHaveText("Corbeille");
  await expect(page.locator(".atl-page [role='alert']")).toHaveCount(0);

  await ouvrir(page, "/carte");
  await expect(page.locator(".atl-entete h1")).toHaveText("Carte des prospects");
  await expect(page.locator(".atl-page [role='alert']")).toHaveCount(0);

  await ouvrir(page, "/prospects");
  await expect(page.locator(".atl-entete h1")).toHaveText("Prospects");
  await expect(page.getByRole("columnheader", { name: /confiance/iu })).toBeVisible();
  await expect(page.getByLabel(/Qualifiés \(≥ \d+ %\)/u)).toBeVisible();
  await page.getByLabel(/Qualifiés \(≥ \d+ %\)/u).check();
  await expect(page.locator(".atl-page [aria-busy='true']")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator(".atl-page [role='alert']")).toHaveCount(0);

  await ouvrir(page, "/parametres");
  await expect(page.locator(".atl-entete h1")).toHaveText("Paramètres et diagnostic");
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sources de données réelles" })).toBeVisible();
  await expect(page.locator(".atl-page [role='alert']")).toHaveCount(0);

  expect(erreurs, erreurs.join("\n")).toEqual([]);
});

test("fiche d'un lead : compte rendu, question au Coordinateur, arrivée sur la tâche créée", async ({ page }) => {
  const erreurs = surveillerConsole(page);
  const question = "Quel premier message envoyer à ce lead, et pourquoi ? (essai automatique)";
  const envois: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/question")) envois.push(r.url());
  });

  await ouvrir(page, "/prospects");
  await page.getByRole("button", { name: /Ouvrir la fiche de/u }).first().click();

  const compteRendu = page.getByRole("region", { name: "Compte rendu du lead" });
  await expect(compteRendu).toBeVisible();
  await expect(compteRendu.getByRole("heading", { name: "Pourquoi ce lead" })).toBeVisible({ timeout: 30_000 });
  await expect(compteRendu.getByRole("heading", { name: "Confiance et score" })).toBeVisible();
  await expect(compteRendu.getByText(/Confiance :/u)).toBeVisible();
  await expect(compteRendu.locator("[role='alert']")).toHaveCount(0);

  // Tant que la question est vide, le bouton est inactif ; une fois saisie, il envoie.
  const bouton = compteRendu.getByRole("button", { name: "Poser une question au Coordinateur" });
  await expect(bouton).toBeDisabled();
  await compteRendu.getByLabel("Votre question sur ce lead").fill(question);
  await expect(bouton).toBeEnabled();
  await bouton.click();

  await expect(page).toHaveURL(new RegExp(`/${prefixe}/issues/${prefixe}-\\d+`, "u"), { timeout: 30_000 });
  expect(envois, "une seule question envoyée").toHaveLength(1);
  await expect(page.getByText(question).first()).toBeVisible({ timeout: 30_000 });
  const restantes = sansPlanAbsent(erreurs);
  expect(restantes, restantes.join("\n")).toEqual([]);
});

test("carte des prospects : au moins un point et la légende (sinon état vide honnête)", async ({ page }) => {
  const erreurs = surveillerConsole(page);

  await ouvrir(page, "/carte");
  await expect(page.locator(".atl-entete h1")).toHaveText("Carte des prospects");
  await expect(page.locator(".atl-page [role='alert']")).toHaveCount(0);

  if (prospectPositionne) {
    await expect(page.locator("svg.atl-carte circle.atl-carte-point").first()).toBeVisible({ timeout: 30_000 });
    expect(await page.locator("svg.atl-carte circle.atl-carte-point").count()).toBeGreaterThanOrEqual(1);
    await expect(page.getByRole("list", { name: "Légende de la carte" })).toBeVisible();
    await expect(page.getByRole("link", { name: /\[client-/u }).first()).toBeVisible();
  } else {
    await expect(page.getByText("Aucun prospect n'a de position connue.")).toBeVisible();
  }

  expect(erreurs, erreurs.join("\n")).toEqual([]);
});

test("écrans de l'après-midi : ouverture, menus, chat d'accueil, statut du lead et fiche au clic", async ({ page, request }) => {
  const erreurs = surveillerConsole(page);

  // 1. Ouvrir l'entreprise mène à l'atelier ; dans le menu du socle, « Réglages de l'atelier » remplace l'ancienne entrée « Atelier ».
  await page.goto(`/${prefixe}`);
  await expect(page).toHaveURL(new RegExp(`/${prefixe}/atelier(/|$)`, "u"), { timeout: 30_000 });
  await page.goto(`/${prefixe}/dashboard`);
  const menuSocle = page.locator("aside nav").first();
  // Le menu du socle reçoit l'entrée du plugin après son chargement ; elle porte la pastille « N à faire ».
  await expect(menuSocle.getByRole("link", { name: "Réglages de l'atelier" })).toBeVisible();

  // 2. Menu de l'atelier : les deux rubriques du bureau, puis « Prospects » avec ses deux onglets (Liste, Carte).
  await ouvrir(page, "/prospects");
  const menu = page.locator("nav.atl-nav").first();
  const liens = await menu.getByRole("link").allInnerTexts();
  expect(liens.slice(0, 2).map((t) => t.trim().split("\n")[0])).toEqual(["Prospects", "Marketing"]);
  await menu.getByRole("link", { name: /^Prospects/u }).click();
  const onglets = page.getByRole("tablist", { name: "Prospects : sections" });
  await expect(onglets.getByRole("tab")).toHaveText(["Liste", "Carte"]);
  await ouvrir(page, "");

  // 3. Accueil = le chat : la pastille « Prospection d'une zone » remplace l'ancien encart « Prospection » (les totaux
  // et les accès aux prospects et à la carte sont dans la rubrique Prospects, étape 4 et menu ci-dessus).
  await expect(page.getByRole("heading", { name: /^Coordinateur/u, level: 1 })).toBeVisible({ timeout: 30_000 });
  // Les pastilles n'existent que dans un fil vide : entreprise neuve (fil vierge), la saisie est remplie sans rien envoyer.
  const neuve = await request.post("/api/companies", { data: { name: `Chat vierge e2e ${Date.now()}` } });
  expect(neuve.status(), "création de l'entreprise au fil vierge").toBe(201);
  const { issuePrefix: prefixeVierge } = (await neuve.json()) as { issuePrefix: string };
  await page.goto(`/${prefixeVierge}/atelier`);
  await expect(page.getByRole("heading", { name: /^Coordinateur/u, level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Prospection d'une zone", exact: true }).click();
  await expect(page.getByLabel("Votre message au Coordinateur")).toHaveValue(/Trouve les prospects les plus pertinents pour/u);
  await expect(page.getByRole("heading", { name: "Prospection", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Demander à l'équipe" })).toHaveCount(0);

  // 4. Prospects : colonne « Statut du lead » avec badge, colonne « Étape », clic sur une cellule = fiche.
  await ouvrir(page, "/prospects");
  await expect(page.getByRole("columnheader", { name: /Statut du lead/u })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Étape", exact: true })).toBeVisible();
  await expect(page.locator("td[data-libelle='Statut du lead']").first()).toContainText(/Qualifié|À vérifier|Écarté/u);
  await page.locator("td[data-libelle='Zone']").first().click();
  await expect(page.getByRole("region", { name: "Compte rendu du lead" })).toBeVisible({ timeout: 30_000 });

  expect(erreurs, erreurs.join("\n")).toEqual([]);
});
