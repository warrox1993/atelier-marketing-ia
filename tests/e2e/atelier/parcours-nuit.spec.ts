/**
 * Parcours de bout en bout des nouveautés de la nuit (item 45), contre l'instance d'essai jetable
 * « atelier-e2e » (port 3590, PostgreSQL 54790) : accueil « À faire », modèle de demande, envoi par
 * Entrée, redirection vers la tâche créée, puis les vues Corbeille, Carte des prospects, Prospects et
 * Paramètres et diagnostic, sans erreur dans la console.
 *
 * Aucun modèle n'est appelé : l'entreprise est en mode démonstration, sans agent en mode réel
 * (préparation : tests/e2e/atelier/preparer.sh atelier-e2e 3590 54790, avec ATELIER_E2E_URL=http://127.0.0.1:3590).
 */
import { expect, test, type Page } from "@playwright/test";

const NOM_ENTREPRISE = process.env.ATELIER_E2E_ENTREPRISE ?? "Rénovation Liège (démonstration)";

let prefixe = "";
let idEntreprise = "";

/** Erreurs de console et exceptions de page, relevées pendant tout un test. */
function surveillerConsole(page: Page): string[] {
  const erreurs: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erreurs.push(`console : ${m.text()}`);
  });
  page.on("pageerror", (e) => erreurs.push(`exception : ${e.message}`));
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

  // Un prospect fictif, pour que le tableau des prospects (colonne « Confiance ») ait une ligne à afficher.
  // Idempotent : un deuxième passage retombe sur le même prospect (ou le refuse), sans effet sur le test.
  await request.post("/api/plugins/atelier.marketing-ia/api/prospects/particuliers", {
    data: {
      companyId: idEntreprise,
      referentiel: { version: 1 },
      zone: { codePostal: "4020", commune: "Liège", province: "Liège", region: "Wallonie" },
      coordonnees: { nom: "Marie Exemple (démonstration)", courriel: "marie.exemple@exemple.invalid", telephone: "+32 4 000 99 88", adresse: null },
      origine: "formulaire_entrant",
      consentements: [
        {
          date: "2026-10-14T10:00:00+02:00",
          texteAccepte: "J'accepte d'être recontacté par courriel au sujet de ma demande de devis.",
          source: "https://exemple.invalid/devis",
          canauxAutorises: ["courriel"],
          responsableNomme: "Bureau de démonstration",
          reference: "soumission-e2e",
        },
      ],
    },
  });
});

test("accueil : un modèle remplit le champ sans rien envoyer, Entrée envoie et ouvre la tâche créée", async ({ page }) => {
  const erreurs = surveillerConsole(page);
  const envois: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/equipe/demande")) envois.push(r.url());
  });

  await ouvrir(page, "");
  await expect(page.getByRole("heading", { name: "À faire", exact: true })).toBeVisible();

  // Un clic sur un modèle remplit le champ, rien n'est envoyé.
  await page.getByRole("button", { name: "Campagne Google Ads" }).click();
  const champ = page.getByLabel("Votre demande");
  await expect(champ).toHaveValue(/Prépare une campagne Google Ads pour/u);
  await expect(champ).toBeFocused();
  await page.waitForTimeout(500);
  expect(envois, "le clic sur un modèle ne doit rien envoyer").toHaveLength(0);
  await expect(page).toHaveURL(new RegExp(`/${prefixe}/atelier/?$`, "u"));

  // Entrée envoie ; l'adresse devient celle de la tâche créée.
  await champ.fill("Prépare une campagne Google Ads pour des fenêtres en PVC à Liège (essai automatique).");
  await champ.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/${prefixe}/issues/${prefixe}-\\d+`, "u"), { timeout: 30_000 });
  expect(envois, "une seule demande envoyée").toHaveLength(1);
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
  await expect(page.getByRole("heading", { name: "Sources de données réelles" })).toBeVisible();
  await expect(page.locator(".atl-page [role='alert']")).toHaveCount(0);

  expect(erreurs, erreurs.join("\n")).toEqual([]);
});
