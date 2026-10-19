/**
 * Parcours réels de l'interface de l'atelier (cahier §17) : navigation dans les
 * six rubriques, sélection d'un agent, création et annulation d'une campagne,
 * décision humaine, affichage smartphone, clavier, thème sombre.
 *
 * Contre l'instance d'essai réelle (backend, base et moteur Paperclip réels,
 * plugin installé). Aucun modèle n'est appelé : l'entreprise est en mode
 * démonstration. Les cas qui dépendent de données absentes sont marqués
 * « ignoré » avec la raison, jamais réussis par défaut.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const NOM_ENTREPRISE = process.env.ATELIER_E2E_ENTREPRISE ?? "Rénovation Liège (démonstration)";
const PLUGIN = "atelier.marketing-ia";

interface Entreprise {
  id: string;
  prefixe: string;
}

let entreprise: Entreprise;

async function trouverEntreprise(request: APIRequestContext): Promise<Entreprise> {
  const rep = await request.get("/api/companies");
  expect(rep.ok()).toBeTruthy();
  const brut = (await rep.json()) as unknown;
  const liste = (Array.isArray(brut) ? brut : ((brut as { items?: unknown[] }).items ?? [])) as Array<{ id: string; name: string; issuePrefix: string }>;
  const e = liste.find((x) => x.name === NOM_ENTREPRISE);
  if (!e) throw new Error(`Entreprise « ${NOM_ENTREPRISE} » absente : lancer tests/e2e/atelier/preparer.sh atelier-e2e 3590 54790`);
  return { id: e.id, prefixe: e.issuePrefix };
}

async function donnees<T>(request: APIRequestContext, cle: string, companyId: string, params: Record<string, unknown> = {}): Promise<T> {
  const rep = await request.post(`/api/plugins/${PLUGIN}/data/${cle}`, { data: { companyId, params } });
  expect(rep.ok(), `${cle} : HTTP ${rep.status()}`).toBeTruthy();
  return ((await rep.json()) as { data: T }).data;
}

async function ouvrir(page: Page, chemin: string) {
  await page.goto(`/${entreprise.prefixe}/atelier${chemin}`);
  await expect(page.locator(".atl-page")).toBeVisible();
  await expect(page.locator(".atl-page [aria-busy='true']")).toHaveCount(0, { timeout: 30_000 });
}

test.beforeAll(async ({ request }) => {
  entreprise = await trouverEntreprise(request);
});

// Le menu secondaire du bureau marketing ne garde que Prospects et Marketing (chat et Réglages : menu principal).
const RUBRIQUES_MENU = ["Prospects", "Marketing"] as const;
const ONGLETS_MARKETING = [
  ["Campagnes", "/campagnes"],
  ["Contenus", "/contenus"],
  ["Calendrier", "/calendrier"],
  ["Résultats", "/resultats"],
  ["Équipe", "/equipe"],
  ["Rapport du mois", "/rapport"],
] as const;

test("navigation réelle dans les deux rubriques du menu de l'atelier, puis les onglets de Marketing et de Réglages", async ({ page }) => {
  await ouvrir(page, "/equipe");
  const nav = page.locator("nav.atl-nav");
  for (const nom of RUBRIQUES_MENU) {
    const lien = nav.getByRole("link", { name: new RegExp(`^${nom}`, "u") });
    await lien.click();
    await expect(lien).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".atl-page")).toBeVisible();
    await expect(page.locator(".atl-page [role='alert']")).toHaveCount(0);
  }
  await nav.getByRole("link", { name: /^Marketing/u }).click();
  const marketing = page.getByRole("tablist", { name: "Marketing : sections" });
  await expect(marketing).toBeVisible();
  for (const [libelle, chemin] of ONGLETS_MARKETING) {
    await marketing.getByRole("tab", { name: libelle, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/atelier${chemin}$`, "u"));
    await expect(marketing.getByRole("tab", { name: libelle, exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".atl-page [role='alert']")).toHaveCount(0);
  }
  // Réglages : plus de rubrique du menu secondaire, on y va par son adresse (le menu principal propose « Réglages de l'atelier »).
  await ouvrir(page, "/mise-en-place");
  await expect(page.locator("nav.atl-nav")).toHaveCount(0);
  const reglages = page.getByRole("tablist", { name: "Réglages : sections" });
  await reglages.getByRole("tab", { name: "Paramètres", exact: true }).click();
  await expect(page.locator(".atl-entete h1")).toHaveText("Paramètres et diagnostic");
  // « Connexions » (ancien « Passage au réel ») : ce qui est branché et ce qui ne l'est pas.
  await reglages.getByRole("tab", { name: "Connexions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connexions" }).first()).toBeVisible();
  await expect(page.locator(".atl-page [role='alert']")).toHaveCount(0);
});

test("sélection d'un agent : ses tâches natives s'ouvrent", async ({ page, request }) => {
  const equipe = await donnees<{ agents: Array<{ id: string; nom: string }> }>(request, "atelier.equipe", entreprise.id);
  test.skip(equipe.agents.length === 0, "Aucun agent dans l'entreprise de démonstration.");
  const agent = equipe.agents[0]!;
  await ouvrir(page, "/equipe");
  await page.locator(".atl-table").getByRole("link", { name: agent.nom, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/atelier/equipe/${agent.id}$`, "u"));
  const detail = page.locator("section", { has: page.getByRole("heading", { level: 2, name: agent.nom }) });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Tâches et résultats de l'agent" })).toBeVisible();
  await expect(detail.getByRole("link", { name: "Fiche dans le tableau de bord" })).toHaveAttribute("href", `/${entreprise.prefixe}/agents/${agent.id}`);
  await expect(page.locator(".atl-table tr[data-choisi='true']")).toHaveCount(1);
  await expect(page.locator(".atl-table").getByRole("link", { name: agent.nom, exact: true })).toHaveAttribute("aria-current", "page");
});

test("création d'une campagne depuis un brief, puis annulation, vérifiées dans le backend", async ({ page, request }) => {
  const nom = `Façades E2E ${Date.now()}`;
  await ouvrir(page, "/campagnes");
  await page.getByRole("link", { name: "Nouvelle campagne" }).click();
  await expect(page.locator(".atl-entete h1")).toHaveText("Nouvelle campagne");
  const creer = page.getByRole("button", { name: "Créer la campagne" });
  await expect(creer).toHaveAttribute("aria-disabled", "true");
  await page.getByLabel("Nom de la campagne").fill(nom);
  await page.getByLabel("Brief", { exact: true }).fill("Présenter nos deux établissements de démonstration : Herstal et Seraing, avec horaires.");
  await page.getByLabel("Établissements").fill("Herstal\nSeraing");
  await page.getByLabel("Canaux").fill("site, facebook");
  // Plafond publicitaire (lot des plafonds) : montant maximal choisi par le client.
  await page.getByRole("radio", { name: "Montant maximal (€)" }).check();
  await page.getByLabel("Montant maximal en euros").fill("800");
  await expect(creer).not.toHaveAttribute("aria-disabled", "true");
  await creer.click();
  await expect(page).toHaveURL(/\/atelier\/campagnes\/[0-9a-f-]{36}$/u, { timeout: 30_000 });
  await expect(page.locator(".atl-entete h1")).toHaveText(nom);
  const campagneId = page.url().split("/").pop()!;

  // Vérification dans le backend réel : campagne liée à un projet natif et à une tâche de brief.
  const detail = await donnees<{ campagne: { projectId: string; briefIssueId: string; budgetMaxCents: number; perimetre: { etablissements: string[] }; mode: string } }>(request, "atelier.campagne", entreprise.id, { campagneId });
  expect(detail.campagne.budgetMaxCents).toBe(80000);
  expect(detail.campagne.perimetre.etablissements).toEqual(["Herstal", "Seraing"]);
  expect(detail.campagne.mode).toBe("reel");
  const projet = await request.get(`/api/projects/${detail.campagne.projectId}`);
  expect(projet.ok()).toBeTruthy();
  const brief = await request.get(`/api/issues/${detail.campagne.briefIssueId}`);
  expect(((await brief.json()) as { title: string }).title).toBe(`Brief : ${nom}`);

  // Pause : désactivée avec la raison donnée par le serveur.
  const pause = page.getByRole("button", { name: "Mettre en pause" });
  await expect(pause).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator(".atl-barre-actions")).toContainText("ne met un projet en pause que par budget");

  // Annulation réelle : la tâche de brief passe à « cancelled » dans Paperclip.
  await page.getByRole("button", { name: "Annuler la campagne" }).click();
  await page.getByLabel("Motif (obligatoire)").fill("Essai de bout en bout : campagne de test.");
  await page.getByRole("button", { name: "Confirmer l'annulation" }).click();
  await expect(page.locator(".atl-succes")).toContainText("Annulation enregistrée");
  await expect
    .poll(async () => ((await (await request.get(`/api/issues/${detail.campagne.briefIssueId}`)).json()) as { status: string }).status, { timeout: 15_000 })
    .toBe("cancelled");
});

test("décision humaine sur un dossier prêt (porte franchie)", async ({ page, request }) => {
  // Les dossiers prêts viennent du scénario B joué par le vrai moteur (agents de démonstration).
  const entreprises = (await (await request.get("/api/companies")).json()) as Array<{ id: string; issuePrefix: string; name: string }>;
  let cible: { prefixe: string; issueId: string } | null = null;
  for (const e of Array.isArray(entreprises) ? entreprises : []) {
    // Les dossiers « appel exact » (campagne réelle, appels proposés) ont leur propre parcours : appel-exact.spec.ts.
    if (e.name.startsWith("Dossier e2e appel")) continue;
    const v = await donnees<{ prets: Array<{ issueId: string }> }>(request, "atelier.contenus-a-valider", e.id);
    if (v.prets[0]) {
      cible = { prefixe: e.issuePrefix, issueId: v.prets[0].issueId };
      break;
    }
  }
  test.skip(!cible, "Aucun dossier « prêt pour validation humaine » dans l'instance : lancer tests/e2e/atelier/preparer_dossier.py avant ce test.");
  await page.goto(`/${cible!.prefixe}/atelier/contenus/${cible!.issueId}`);
  await expect(page.locator(".atl-entete h1")).toBeVisible();
  const bouton = page.getByRole("button", { name: /Enregistrer : approuver/u });
  await expect(bouton).toHaveAttribute("aria-disabled", "true");
  await page.getByLabel("Commentaire").fill("Approuvé lors du test de bout en bout (démonstration).");
  await page.getByLabel("Action autorisée").selectOption("publier");
  await bouton.click();
  await expect(page.locator(".atl-succes")).toContainText("Décision enregistrée.", { timeout: 20_000 });
  const issue = (await (await request.get(`/api/issues/${cible!.issueId}`)).json()) as { status: string };
  expect(issue.status).toBe("done");
});

test("dossier non prêt : pas de formulaire de décision, la raison est donnée", async ({ page, request }) => {
  const entreprises = (await (await request.get("/api/companies")).json()) as Array<{ id: string; issuePrefix: string }>;
  let cible: { prefixe: string; issueId: string } | null = null;
  for (const e of Array.isArray(entreprises) ? entreprises : []) {
    for (const c of await donnees<Array<{ id: string }>>(request, "atelier.campagnes", e.id)) {
      const d = await donnees<{ campagne: { briefIssueId: string | null }; taches: Array<{ issueId: string; statut: string }> }>(request, "atelier.campagne", e.id, { campagneId: c.id });
      // Une tâche de production (pas le brief) qui n'est pas à l'étape humaine.
      const t = d.taches.find((x) => x.issueId !== d.campagne.briefIssueId && !["ready_for_human", "approved", "completed", "cancelled"].includes(x.statut));
      if (t) {
        cible = { prefixe: e.issuePrefix, issueId: t.issueId };
        break;
      }
    }
    if (cible) break;
  }
  test.skip(!cible, "Aucune tâche de production non prête dans l'instance.");
  await page.goto(`/${cible!.prefixe}/atelier/contenus/${cible!.issueId}`);
  await expect(page.locator(".atl-entete h1")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Matrice de couverture" })).toBeVisible();
  // Hors de l'étape humaine : aucun formulaire, seulement la raison donnée par les règles de la porte.
  await expect(page.locator(".atl-decision")).toContainText(/Aucun livrable|Décision possible seulement/u);
  await expect(page.getByRole("button", { name: /Enregistrer :/u })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Chronologie de l'exécution" })).toBeVisible();
});

test("calendrier : l'humain propose une date à l'heure de Bruxelles, enregistrée en UTC", async ({ page, request }) => {
  const entreprises = (await (await request.get("/api/companies")).json()) as Array<{ id: string; issuePrefix: string }>;
  let cible: { prefixe: string; id: string; issueId: string; canal: string } | null = null;
  for (const e of Array.isArray(entreprises) ? entreprises : []) {
    const lignes = await donnees<Array<{ issueId: string; canal: string; etat: string }>>(request, "atelier.calendrier", e.id);
    const l = lignes.find((x) => x.etat !== "publie");
    if (l) {
      cible = { prefixe: e.issuePrefix, id: e.id, issueId: l.issueId, canal: l.canal };
      break;
    }
  }
  test.skip(!cible, "Aucun contenu au calendrier dans l'instance.");
  await page.goto(`/${cible!.prefixe}/atelier/calendrier`);
  await expect(page.locator(".atl-entete h1")).toHaveText("Calendrier éditorial");
  const ligne = page.locator("tr", { has: page.locator(`a[href$="/atelier/contenus/${cible!.issueId}"]`) }).first();
  await ligne.locator("summary").click();
  await ligne.getByLabel("Date proposée (heure de Bruxelles)").fill("2026-11-03T09:30");
  await ligne.getByRole("button", { name: "Enregistrer la proposition" }).click();
  // 09:30 à Bruxelles le 3 novembre (heure d'hiver, UTC+1) = 08:30 UTC.
  await expect
    .poll(async () => (await donnees<Array<{ issueId: string; canal: string; dateProposee: string | null }>>(request, "atelier.calendrier", cible!.id)).find((x) => x.issueId === cible!.issueId && x.canal === cible!.canal)?.dateProposee, { timeout: 15_000 })
    .toBe("2026-11-03T08:30:00.000Z");
  await expect(ligne).toContainText("proposée, UTC+1");
});

test.describe("smartphone (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("onglets de rubriques, tableaux empilés, aucun débordement horizontal", async ({ page }) => {
    await ouvrir(page, "/equipe");
    const onglets = page.locator("nav.atl-onglets");
    await expect(onglets).toBeVisible();
    await onglets.getByRole("link", { name: /^Marketing/u }).click();
    const marketing = page.getByRole("tablist", { name: "Marketing : sections" });
    await marketing.getByRole("tab", { name: "Campagnes", exact: true }).click();
    await expect(page).toHaveURL(/\/atelier\/campagnes$/u);
    await marketing.getByRole("tab", { name: "Équipe", exact: true }).click();
    await expect(page).toHaveURL(/\/atelier\/equipe$/u);
    await expect(page.locator(".atl-table thead").first()).toBeHidden();
    const deborde = await page.locator(".atl-page").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(deborde).toBeLessThanOrEqual(1);
  });
});

test("clavier : atteindre une rubrique et une action désactivée avec sa raison", async ({ page }) => {
  await ouvrir(page, "/equipe");
  const lien = page.locator("nav.atl-nav").getByRole("link", { name: /^Marketing/u });
  await lien.focus();
  await expect(lien).toBeFocused();
  const contour = await lien.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(contour).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tablist", { name: "Marketing : sections" })).toBeVisible();
  await page.goto(`/${entreprise.prefixe}/atelier/campagnes/nouvelle`);
  const champ = page.getByLabel("Nom de la campagne");
  await champ.focus();
  await page.keyboard.type("Essai clavier");
  // Tab parcourt le formulaire jusqu'au bouton, toujours focalisable même désactivé.
  let atteint = false;
  for (let i = 0; i < 25 && !atteint; i += 1) {
    await page.keyboard.press("Tab");
    atteint = await page.getByRole("button", { name: "Créer la campagne" }).evaluate((el) => el === document.activeElement);
  }
  expect(atteint).toBe(true);
  const bouton = page.getByRole("button", { name: "Créer la campagne" });
  await expect(bouton).toHaveAttribute("aria-disabled", "true");
  await expect(bouton).toHaveAccessibleDescription(/brief/u);
});

test("thème sombre de Paperclip suivi par l'atelier", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("paperclip.theme", "dark"));
  await ouvrir(page, "/equipe");
  await expect(page.locator("html")).toHaveClass(/dark/u);
  const [fond, texte] = await page.locator(".atl-entete h1").evaluate((el) => [getComputedStyle(document.body).backgroundColor, getComputedStyle(el).color]);
  // Texte clair sur fond sombre : le titre hérite des jetons de l'hôte.
  const lum = (c: string) => {
    const n = c.match(/[\d.]+/gu)?.map(Number) ?? [0, 0, 0];
    return (n[0]! + n[1]! + n[2]!) / 3;
  };
  expect(lum(texte)).toBeGreaterThan(lum(fond));
});

/* ------------------------------------------------------------------ */
/* Parcours ajoutés à l'intégration des connecteurs (15/10/2026)        */
/* ------------------------------------------------------------------ */

interface DossierMin {
  issueId: string;
  mode: "demonstration" | "reel";
  cycles: { epuises: boolean } | null;
  statut: { statut: string };
  interruption: unknown;
  connecteurPublication: boolean;
  livrable: { revisionId: string } | null;
  decisions: Array<{ id: string; action: string; invalidee: boolean; revisionId: string; portee: { action: string; canal?: string | null; appel?: unknown } | null }>;
  diffusions: Array<{ etat: string }>;
}

/** Premier dossier (toutes entreprises de l'instance) qui satisfait `filtre`. */
async function chercherDossier(request: APIRequestContext, filtre: (d: DossierMin) => boolean): Promise<{ prefixe: string; companyId: string; dossier: DossierMin } | null> {
  const entreprises = (await (await request.get("/api/companies")).json()) as Array<{ id: string; issuePrefix: string }>;
  for (const e of Array.isArray(entreprises) ? entreprises : []) {
    for (const c of await donnees<Array<{ id: string }>>(request, "atelier.campagnes", e.id)) {
      const detail = await donnees<{ campagne: { briefIssueId: string | null }; taches: Array<{ issueId: string }> }>(request, "atelier.campagne", e.id, { campagneId: c.id });
      for (const t of detail.taches) {
        if (t.issueId === detail.campagne.briefIssueId) continue;
        const rep = await request.post(`/api/plugins/${PLUGIN}/data/atelier.dossier`, { data: { companyId: e.id, params: { issueId: t.issueId } } });
        if (!rep.ok()) continue;
        const d = ((await rep.json()) as { data: DossierMin }).data;
        if (d && filtre(d)) return { prefixe: e.issuePrefix, companyId: e.id, dossier: d };
      }
    }
  }
  return null;
}

const CANAUX_PASSERELLE = ["facebook", "instagram", "linkedin", "crm", "hubspot", "pipedrive", "odoo", "teamleader"];
/** v1.6 : en réel, sur un canal de la passerelle, l'agent diffuse (l'interface n'affiche pas « Diffuser »). */
const diffusionParAgent = (d: DossierMin) =>
  d.mode === "reel" && d.decisions.some((x) => x.action === "approuver" && !x.invalidee && x.revisionId === d.livrable?.revisionId && x.portee && (x.portee.appel || CANAUX_PASSERELLE.includes((x.portee.canal ?? "").toLowerCase())));

const approbationDiffusable = (d: DossierMin) =>
  d.decisions.some((x) => x.action === "approuver" && !x.invalidee && x.revisionId === d.livrable?.revisionId && x.portee && x.portee.action !== "aucune_action_externe");

test("relancer la correction après des cycles épuisés : consigne envoyée, de nouveaux cycles accordés", async ({ page, request }) => {
  const cible = await chercherDossier(request, (d) => Boolean(d.cycles?.epuises) && !["approved", "completed", "cancelled"].includes(d.statut.statut));
  test.skip(!cible, "Aucun dossier aux cycles épuisés : lancer tests/e2e/atelier/preparer_dossier.py <API> epuise.");
  await page.goto(`/${cible!.prefixe}/atelier/contenus/${cible!.dossier.issueId}`);
  const section = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Relancer la correction" }) });
  await expect(section).toBeVisible();
  const bouton = section.getByRole("button", { name: "Relancer la correction" });
  await expect(bouton).toHaveAttribute("aria-disabled", "true");
  await section.getByLabel("Commentaire (obligatoire)").fill("Seraing manque : je donne l'information (test de bout en bout).");
  await section.getByRole("checkbox", { name: "Donner une consigne de correction" }).check();
  await section.getByLabel("Consigne", { exact: true }).fill("Ajouter l'établissement de Seraing : quai du Test 3, 4100 Seraing.");
  await expect(bouton).not.toHaveAttribute("aria-disabled", "true");
  await bouton.click();
  await expect(section.locator(".atl-succes")).toContainText("Correction relancée", { timeout: 20_000 });
  const apres = await donnees<{ cycles: { epuises: boolean; maximum: number } | null }>(request, "atelier.dossier", cible!.companyId, { issueId: cible!.dossier.issueId });
  expect(apres.cycles?.epuises).toBe(false);
});

test("Diffuser est grisé en mode réel, avec la raison (aucun connecteur de publication)", async ({ page, request }) => {
  const cible = await chercherDossier(request, (d) => d.mode === "reel" && !d.connecteurPublication && d.livrable !== null && !diffusionParAgent(d));
  test.skip(!cible, "Aucun dossier en mode réel : jouer le scénario A (l'entreprise passe en mode réel à la fin).");
  await page.goto(`/${cible!.prefixe}/atelier/contenus/${cible!.dossier.issueId}`);
  const bouton = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Diffusion", exact: true }) }).getByRole("button", { name: "Diffuser" });
  await expect(bouton).toHaveAttribute("aria-disabled", "true");
  await expect(bouton).toHaveAccessibleDescription("Aucun connecteur de publication : rien ne peut être diffusé.");
  const avant = cible!.dossier.diffusions.length;
  // Toujours atteignable au clavier : Entrée sur le bouton grisé ne déclenche rien.
  await bouton.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  const apres = await donnees<DossierMin>(request, "atelier.dossier", cible!.companyId, { issueId: cible!.dossier.issueId });
  expect(apres.diffusions.length).toBe(avant);
});

test("reprendre une tâche interrompue par l'arrêt du serveur, après vérification humaine", async ({ page, request }) => {
  const cible = await chercherDossier(request, (d) => Boolean(d.interruption));
  test.skip(!cible, "Aucune tâche interrompue : lancer ATELIER_INSTANCE_ESSAI=… tests/e2e/atelier/preparer_dossier.py <API> interruption.");
  await page.goto(`/${cible!.prefixe}/atelier/contenus/${cible!.dossier.issueId}`);
  const section = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Reprendre après interruption" }) });
  await expect(section).toContainText("interrompu");
  const bouton = section.getByRole("button", { name: "Reprendre" });
  await expect(bouton).toHaveAttribute("aria-disabled", "true");
  await section.getByLabel("Ce que vous avez vérifié").fill("Révision 1 écrite, aucune couverture ni diffusion : rien à défaire (test de bout en bout).");
  await bouton.click();
  await expect(section.locator(".atl-succes")).toContainText("Reprise enregistrée", { timeout: 20_000 });
  await expect
    .poll(async () => ((await (await request.get(`/api/issues/${cible!.dossier.issueId}`)).json()) as { status: string }).status, { timeout: 15_000 })
    .not.toBe("blocked");
});

test("plafond « aucune limite » : avertissement affiché, choix enregistré et tracé", async ({ page, request }) => {
  const campagnes = await donnees<Array<{ id: string; nom: string }>>(request, "atelier.campagnes", entreprise.id);
  test.skip(campagnes.length === 0, "Aucune campagne dans l'entreprise de démonstration.");
  await ouvrir(page, `/campagnes/${campagnes[0]!.id}`);
  const section = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Plafond des dépenses publicitaires" }) });
  const aucune = section.getByRole("radio", { name: "Aucune limite" });
  await aucune.check();
  const avertissement = section.locator(".atl-encart[role='note']");
  await expect(avertissement).toContainText("Plus de garde-fou global sur les dépenses publicitaires");
  await expect(avertissement).toContainText("approbation humaine");
  await expect(aucune).toHaveAttribute("aria-describedby", (await avertissement.getAttribute("id"))!);
  await section.getByRole("button", { name: "Enregistrer le plafond" }).click();
  await expect(section.locator(".atl-succes")).toContainText("Plafond enregistré.", { timeout: 20_000 });
  const detail = await donnees<{ campagne: { plafondPub: { type: string; decidePar: string } | null } }>(request, "atelier.campagne", entreprise.id, { campagneId: campagnes[0]!.id });
  expect(detail.campagne.plafondPub?.type).toBe("aucune_limite");
  expect(detail.campagne.plafondPub?.decidePar).toBeTruthy();
});

test("tableau des connecteurs : « Connecter » ouvre la carte native du service, « Gérer » sa page", async ({ page, request }) => {
  const connexions = ((await (await request.get(`/api/companies/${entreprise.id}/tools/connections`)).json()) as { connections: Array<{ id: string; name: string; status: string; config: { sourceTemplateKey?: string } }> }).connections;
  const connectee = connexions.find((c) => c.config.sourceTemplateKey === "atelier-google-search-console" && c.status === "active");
  const libre = !connexions.some((c) => c.config.sourceTemplateKey === "atelier-google-analytics");
  test.skip(!connectee || !libre, "Préparation : une connexion Search Console par la carte (scripts/scenarios/cartes.py), aucune pour Analytics 4.");
  await ouvrir(page, "/parametres");
  const ligne = (nom: string) => page.locator("tr", { has: page.getByRole("rowheader", { name: new RegExp(`^${nom}`, "u") }) });
  const gsc = ligne("Google Search Console");
  await expect(gsc).toContainText("Démonstration");
  await expect(gsc.getByRole("link", { name: "Gérer Google Search Console" })).toHaveAttribute("href", `/${entreprise.prefixe}/apps/${connectee!.id}/permissions`);
  const connecter = ligne("Google Analytics 4").getByRole("link", { name: "Connecter Google Analytics 4" });
  await expect(connecter).toHaveAttribute("href", `/${entreprise.prefixe}/apps/connect?source=atelier-google-analytics`);
  await connecter.click();
  await expect(page).toHaveURL(new RegExp(`/${entreprise.prefixe}/apps/connect\\?source=atelier-google-analytics$`, "u"));
  await expect(page.getByText("Google Analytics 4 (démonstration)").first()).toBeVisible({ timeout: 30_000 });
  expect(page.url()).not.toContain("byo");
});
