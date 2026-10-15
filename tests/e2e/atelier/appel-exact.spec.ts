/**
 * Contrat v1.6 (revue des signatures), parcours réels de l'interface contre l'instance d'essai :
 *  1. « l'humain approuve l'appel exact proposé » : aperçu complet de l'appel, choix de l'appel, `portee.appel`
 *     recopié tel quel (vérifié dans le backend), puis plus de bouton « Diffuser » en réel (l'agent diffuse) ;
 *  2. « révocation » : une diffusion réelle préparée avec preuve signée, motif obligatoire, « Révoquer la preuve »,
 *     état revoqué relu dans le backend et après rechargement.
 *
 * Données : `preparer_appel.py` (campagne RÉELLE, agents de démonstration, aucun appel de modèle, clés de signature
 * de l'entreprise) ; modes « propose » et « diffusee ». Chaque parcours consomme son dossier : relancer le script.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

const PLUGIN = "atelier.marketing-ia";
const NOM_PROPOSE = process.env.ATELIER_E2E_APPEL_PROPOSE ?? "Dossier e2e appel propose (démonstration)";
const NOM_DIFFUSEE = process.env.ATELIER_E2E_APPEL_DIFFUSEE ?? "Dossier e2e appel diffusee (démonstration)";

interface Cible {
  id: string;
  prefixe: string;
}

async function entreprisesNommees(request: APIRequestContext, nom: string): Promise<Cible[]> {
  const brut = (await (await request.get("/api/companies")).json()) as unknown;
  const liste = (Array.isArray(brut) ? brut : ((brut as { items?: unknown[] }).items ?? [])) as Array<{ id: string; name: string; issuePrefix: string }>;
  // Un nouveau passage du script ajoute une entreprise du même nom : on les essaie toutes (celles déjà consommées sont ignorées).
  return liste.filter((x) => x.name === nom).map((x) => ({ id: x.id, prefixe: x.issuePrefix }));
}

async function donnees<T>(request: APIRequestContext, cle: string, companyId: string, params: Record<string, unknown> = {}): Promise<T> {
  const rep = await request.post(`/api/plugins/${PLUGIN}/data/${cle}`, { data: { companyId, params } });
  expect(rep.ok(), `${cle} : HTTP ${rep.status()}`).toBeTruthy();
  return ((await rep.json()) as { data: T }).data;
}

interface DossierApi {
  issueId: string;
  mode: string;
  decisions: Array<{ action: string; portee: { appel: Record<string, string> | null; canal: string | null; compte: string | null; audience: string | null; montantMaxCents: number | null } | null }>;
  diffusions: Array<{ id: string; etat: string; preuveExpire?: number | null; revocation?: { le: string; motif: string } | null }>;
  appelsProposes: Array<{ id: string; empreinte: string; approbation: Record<string, string>; arguments: { message: string }; compte: string }>;
}

test("l'humain approuve l'appel exact proposé par l'agent", async ({ page, request }) => {
  const candidates = await entreprisesNommees(request, NOM_PROPOSE);
  let e: Cible | null = null;
  let issueId = "";
  for (const c of candidates) {
    const prets = await donnees<{ prets: Array<{ issueId: string }> }>(request, "atelier.contenus-a-valider", c.id);
    if (prets.prets[0]) {
      e = c;
      issueId = prets.prets[0].issueId;
      break;
    }
  }
  test.skip(!e, `Aucun dossier prêt « ${NOM_PROPOSE} » (absent ou déjà consommé) : lancer tests/e2e/atelier/preparer_appel.py <URL_API> propose.`);
  const avant = await donnees<DossierApi>(request, "atelier.dossier", e!.id, { issueId });
  expect(avant.mode).toBe("reel");
  expect(avant.appelsProposes).toHaveLength(1);
  const appel = avant.appelsProposes[0]!;

  await page.goto(`/${e!.prefixe}/atelier/contenus/${issueId}`);
  await expect(page.locator(".atl-entete h1")).toBeVisible();

  // 1. Aperçu complet de l'appel : texte entier et empreinte entière, rien de tronqué.
  const section = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Appels proposés" }) });
  await expect(section).toBeVisible();
  await expect(section.locator(".atl-apercu-valeur", { hasText: appel.arguments.message }).first()).toBeVisible();
  await expect(section.locator(`[data-empreinte="${appel.empreinte}"]`)).toHaveText(appel.empreinte);
  await expect(section).toContainText(appel.compte);

  // 2. Décision : choisir l'appel exact ; sans choix, l'approbation reste désactivée avec sa raison.
  const bouton = page.getByRole("button", { name: /Enregistrer : approuver/u });
  await page.getByLabel("Commentaire").fill("Texte relu mot à mot : j'approuve cet appel exact.");
  await page.getByLabel("Action autorisée").selectOption("publier");
  await expect(bouton).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator(".atl-decision")).toContainText("Choisissez l'appel exact à approuver");
  await page.getByRole("radio", { name: new RegExp(appel.empreinte, "u") }).check();
  await expect(page.locator("[data-portee-appel]")).toContainText("imposés par l'appel choisi");
  await expect(bouton).not.toHaveAttribute("aria-disabled", "true");
  await bouton.click();
  await expect(page.locator(".atl-succes").first()).toContainText("Décision enregistrée.", { timeout: 20_000 });

  // 3. Backend : `portee.appel` est EXACTEMENT l'approbation de l'appel proposé, portée cohérente.
  const apres = await donnees<DossierApi>(request, "atelier.dossier", e!.id, { issueId });
  const decision = apres.decisions.find((d) => d.action === "approuver");
  expect(decision?.portee?.appel).toEqual(appel.approbation);
  expect(decision?.portee).toMatchObject({ canal: "facebook", compte: appel.compte, audience: null, montantMaxCents: null });
  const tache = (await (await request.get(`/api/issues/${issueId}`)).json()) as { status: string };
  expect(tache.status).toBe("done");

  // 4. En réel, canal de la passerelle : pas de « Diffuser », l'agent diffuse avec la preuve.
  await page.reload();
  const diffusion = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Diffusion", exact: true }) });
  await expect(diffusion).toContainText("l'agent qui diffuse");
  await expect(diffusion.getByRole("button", { name: "Diffuser", exact: true })).toHaveCount(0);
});

test("révocation de la preuve d'approbation par l'humain, avec motif obligatoire", async ({ page, request }) => {
  let e: Cible | null = null;
  let issueId: string | null = null;
  for (const ent of await entreprisesNommees(request, NOM_DIFFUSEE)) {
    for (const c of await donnees<Array<{ id: string }>>(request, "atelier.campagnes", ent.id)) {
      const d = await donnees<{ campagne: { briefIssueId: string | null }; taches: Array<{ issueId: string }> }>(request, "atelier.campagne", ent.id, { campagneId: c.id });
      for (const t of d.taches.filter((x) => x.issueId !== d.campagne.briefIssueId)) {
        const dos = await donnees<DossierApi>(request, "atelier.dossier", ent.id, { issueId: t.issueId });
        if (dos.diffusions.some((f) => f.etat === "preparee" && f.preuveExpire && !f.revocation)) {
          e = ent;
          issueId = t.issueId;
        }
      }
    }
  }
  test.skip(!issueId, `Aucune diffusion préparée avec preuve « ${NOM_DIFFUSEE} » (absente ou déjà révoquée) : lancer preparer_appel.py <URL_API> diffusee.`);
  const avant = await donnees<DossierApi>(request, "atelier.dossier", e!.id, { issueId: issueId! });
  const f = avant.diffusions.find((x) => x.etat === "preparee" && x.preuveExpire && !x.revocation)!;

  await page.goto(`/${e!.prefixe}/atelier/contenus/${issueId}`);
  const diffusion = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "Diffusion", exact: true }) });
  await expect(diffusion).toContainText("Preuve émise");
  await expect(diffusion).toContainText("Preuve valable jusqu'au");
  const revoquer = diffusion.getByRole("button", { name: "Révoquer la preuve" });
  await expect(revoquer).toHaveAttribute("aria-disabled", "true");
  await expect(diffusion).toContainText("Motif obligatoire");
  // Sans motif, le bouton est inerte (Playwright ne clique pas un contrôle désactivé) : la preuve reste valide dans le backend.
  expect((await donnees<DossierApi>(request, "atelier.dossier", e!.id, { issueId: issueId! })).diffusions.find((x) => x.id === f.id)?.revocation ?? null).toBeNull();

  const motif = "Le client a changé le texte : cette preuve ne doit plus servir.";
  await diffusion.getByLabel("Motif de la révocation (obligatoire)").fill(motif);
  await expect(revoquer).not.toHaveAttribute("aria-disabled", "true");
  await revoquer.click();
  await expect(diffusion.locator(".atl-succes")).toContainText("Preuve révoquée.", { timeout: 20_000 });

  const apres = (await donnees<DossierApi>(request, "atelier.dossier", e!.id, { issueId: issueId! })).diffusions.find((x) => x.id === f.id);
  expect(apres?.etat).toBe("preparee");
  expect(apres?.revocation?.motif).toContain(motif);

  // Après rechargement : état révoqué, date et motif affichés, plus de bouton.
  await page.reload();
  await expect(diffusion).toContainText("Preuve révoquée");
  await expect(diffusion.locator('[data-revocation="true"]')).toContainText(motif);
  await expect(diffusion.getByRole("button", { name: "Révoquer la preuve" })).toHaveCount(0);
});
