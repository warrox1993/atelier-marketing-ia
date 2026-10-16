// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXEMPLES_DONNEES } from "../../src/contrats/exemples/index.js";
import { DossierHumain, RelancerCorrectionEntree } from "../../src/contrats/index.js";
import { PageAtelier } from "../../src/ui/index.js";
import { compterNouveaux, MARGE_ACTION_PROPRE_MS } from "../../src/ui/donnees.js";
import { cleIdempotenceProjet } from "../../src/ui/vues/campagnes.js";
import { approbationDiffusable, corpsReprise, parametresRelance, raisonDiffusion, raisonRelance, relanceOuverte, type SaisieRelance } from "../../src/ui/vues/contenus.js";
import { champParLibelle, cliquer, ENTREPRISE, installerPont, parTexte, rendre, saisir, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
const T = "44444444-4444-4444-8444-444444444444";
const R2 = "55555555-5555-4555-8555-555555555552";
const AP = "66666666-6666-4666-8666-666666666661";

const base = DossierHumain.parse(EXEMPLES_DONNEES["atelier.dossier"]);
function epuise(extra: Partial<DossierHumain> = {}): DossierHumain {
  return {
    ...base,
    statut: { statut: "blocked_information", motif: "Escalade : cycles de correction épuisés." },
    evaluationPorte: null,
    cycles: { consommes: 3, maximum: 3, epuises: true, relances: 0 },
    ...extra,
  };
}
const saisieVide: SaisieRelance = { commentaire: "", information: false, question: "", reponse: "", consigne: false, texteConsigne: "", escalade: false, version: false, corps: "" };

describe("relance : règles de l'interface", () => {
  it("fermée tant que les cycles ne sont pas épuisés, ou après approbation", () => {
    expect(relanceOuverte(base)).toBe(false);
    expect(relanceOuverte(epuise())).toBe(true);
    expect(relanceOuverte(epuise({ statut: { statut: "approved", motif: "" } }))).toBe(false);
  });
  it("commentaire et au moins un levier obligatoires", () => {
    expect(raisonRelance(epuise(), saisieVide)).toBe("Un commentaire est obligatoire.");
    expect(raisonRelance(epuise(), { ...saisieVide, commentaire: "x" })).toBe("Choisissez au moins un levier.");
    expect(raisonRelance(epuise(), { ...saisieVide, commentaire: "x", consigne: true, texteConsigne: "Ajouter Seraing." })).toBeNull();
  });
  it("montée impossible pour un agent de démonstration : raison du serveur affichée", () => {
    expect(raisonRelance(epuise(), { ...saisieVide, commentaire: "x", escalade: true })).toContain("Agent de démonstration");
  });
  it("une version corrigée identique à la révision courante est refusée", () => {
    expect(raisonRelance(epuise(), { ...saisieVide, commentaire: "x", version: true, corps: base.livrable!.corps })).toContain("identique");
  });
  it("les paramètres envoyés respectent le schéma strict du contrat", () => {
    const d = epuise({
      producteur: { agentId: AP, nom: "Contenus", adaptateur: "claude_local", modele: "claude-sonnet-5-5", effort: "medium", palierSuivant: { modele: "claude-sonnet-5-5", effort: "high" }, raisonSansPalier: null },
    });
    const s: SaisieRelance = { commentaire: " Il manque Seraing. ", information: true, question: "Adresse ?", reponse: "quai du Test 3", consigne: true, texteConsigne: "Ajouter Seraing.", escalade: true, version: true, corps: "# Nouvelle version" };
    const p = parametresRelance(d, s, "99999999-9999-4999-8999-999999999999");
    expect(p.versionCorrigee).toEqual({ revisionId: "99999999-9999-4999-8999-999999999999" });
    expect(RelancerCorrectionEntree.safeParse(p).success).toBe(true);
    expect(p).toMatchObject({ commentaire: "Il manque Seraing.", escalade: { agentId: AP, avant: { modele: "claude-sonnet-5-5", effort: "medium" }, apres: { effort: "high" } } });
    expect(RelancerCorrectionEntree.safeParse(parametresRelance(d, { ...saisieVide, commentaire: "x", consigne: true, texteConsigne: "y" })).success).toBe(true);
  });
});

describe("diffusion : règles de l'interface", () => {
  const approbation = {
    id: "77777777-7777-4777-8777-777777777777", companyId: base.companyId, issueId: T, revisionId: R2, action: "approuver" as const, commentaire: "OK", userId: "local-board",
    portee: { revisionId: R2, action: "publier" as const, canal: "site", compte: null, audience: null, montantMaxCents: null, dureeJours: 30 }, invalidee: false, mode: "demonstration" as const, creeLe: "2026-10-15T10:00:00.000Z",
  };
  it("désactivée sans approbation humaine", () => {
    expect(raisonDiffusion(base)).toContain("après une approbation humaine");
  });
  it("en réel : visible mais désactivée, aucun connecteur de publication", () => {
    expect(raisonDiffusion({ ...base, mode: "reel", decisions: [{ ...approbation, mode: "reel" }] })).toBe("Aucun connecteur de publication : rien ne peut être diffusé.");
  });
  it("en démonstration : possible après approbation d'une action externe sur la révision courante", () => {
    expect(raisonDiffusion({ ...base, decisions: [approbation] })).toBeNull();
    expect(approbationDiffusable({ ...base, decisions: [{ ...approbation, invalidee: true }] })).toBeNull();
    expect(approbationDiffusable({ ...base, decisions: [{ ...approbation, portee: { ...approbation.portee, action: "aucune_action_externe" } }] })).toBeNull();
  });
});

describe("fraîcheur et idempotence", () => {
  it("les événements d'une action propre ne rendent pas l'affichage périmé", () => {
    const action = Date.parse("2026-10-15T10:00:00.000Z");
    const evts = [{ creeLe: "2026-10-15T10:00:00.500Z" }, { creeLe: "2026-10-15T10:00:05.000Z" }];
    expect(compterNouveaux(evts, action + MARGE_ACTION_PROPRE_MS)).toBe(1);
    expect(compterNouveaux(evts, 0)).toBe(2);
  });
  it("clé d'idempotence du projet : stable pour un même formulaire et un même nom", () => {
    expect(cleIdempotenceProjet("f1", "Toitures")).toBe(cleIdempotenceProjet("f1", "Toitures"));
    expect(cleIdempotenceProjet("f1", "Toitures")).not.toBe(cleIdempotenceProjet("f1", "Façades"));
    expect(cleIdempotenceProjet("f1", "Toitures").length).toBeLessThanOrEqual(255);
  });
});

let pont: Pont;
let rendu: Rendu | null = null;
beforeEach(() => {
  pont = installerPont();
});
afterEach(() => {
  expect(pont.violations).toEqual([]);
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

async function dossier(d: DossierHumain) {
  pont.donnees["atelier.dossier"] = { data: d, loading: false, error: null };
  pont.chemin = `/RNO/atelier/contenus/${T}`;
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  return rendu.conteneur;
}

describe("dossier : relance, rejet et diffusion", () => {
  it("cycles épuisés : relance avec consigne, sans aucune option d'acceptation", async () => {
    pont.actions["atelier.correction.relancer"] = async (p) => ({ id: "r", ...p, maximumAvant: 3, maximumApres: 6 });
    const c = await dossier(epuise());
    const section = parTexte(c, "section", "Relancer la correction");
    // Aucune commande (bouton, case, choix) ne permet d'accepter le livrable en l'état.
    const commandes = Array.from(section.querySelectorAll("button, label")).map((e) => e.textContent ?? "");
    expect(commandes.length).toBeGreaterThan(4);
    for (const texte of commandes) expect(texte).not.toMatch(/accept|malgré|forcer/iu);
    expect(c.textContent).toContain("Décision possible seulement quand le livrable est prêt");
    const bouton = parTexte(section, "button", "Relancer la correction");
    expect(bouton.getAttribute("aria-disabled")).toBe("true");
    await saisir(champParLibelle(section, "Commentaire (obligatoire)"), "Le producteur n'a pas l'adresse.");
    await cliquer(parTexte(section, "label", "Donner une consigne de correction").querySelector("input")!);
    await saisir(champParLibelle(section, "Consigne"), "Ajouter la section Seraing.");
    expect(bouton.getAttribute("aria-disabled")).toBeNull();
    await cliquer(bouton);
    const appel = pont.appelsActions.find((a) => a.cle === "atelier.correction.relancer");
    expect(appel?.params).toMatchObject({ issueId: T, commentaire: "Le producteur n'a pas l'adresse.", consigne: "Ajouter la section Seraing.", escalade: null, versionCorrigee: null, information: null });
    expect(c.textContent).toContain("maximum de cycles porté de 3 à 6");
  });

  it("montée d'un cran : palier appliqué par l'API native AVANT l'action", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: AP }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    pont.actions["atelier.correction.relancer"] = async () => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      return { maximumAvant: 3, maximumApres: 6 };
    };
    const c = await dossier(
      epuise({ producteur: { agentId: AP, nom: "Contenus", adaptateur: "claude_local", modele: "claude-sonnet-5-5", effort: "high", palierSuivant: { modele: "claude-sonnet-5-5", effort: "xhigh" }, raisonSansPalier: null } }),
    );
    const section = parTexte(c, "section", "Relancer la correction");
    expect(section.textContent).toContain("claude-sonnet-5-5 effort high → claude-sonnet-5-5 effort xhigh");
    await saisir(champParLibelle(section, "Commentaire (obligatoire)"), "Monter d'un cran.");
    await cliquer(parTexte(section, "label", "Monter le producteur d'un cran").querySelector("input")!);
    await cliquer(parTexte(section, "button", "Relancer la correction"));
    expect(fetchMock).toHaveBeenCalledWith(`/api/agents/${AP}`, expect.objectContaining({ method: "PATCH", body: JSON.stringify({ adapterConfig: { model: "claude-sonnet-5-5", effort: "xhigh" } }) }));
    expect(pont.appelsActions.some((a) => a.cle === "atelier.correction.relancer")).toBe(true);
  });

  it("rejeter : une seule opération côté worker, aucune transition native depuis le navigateur", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    pont.actions["atelier.decision"] = async (p) => ({ id: "d", ...p });
    const c = await dossier(base);
    await cliquer(c.querySelector('input[name="decision"][value="rejeter"]')!);
    await saisir(champParLibelle(c, "Commentaire"), "Hors sujet.");
    await cliquer(parTexte(c, "button", "Enregistrer : rejeter"));
    expect(pont.appelsActions.find((a) => a.cle === "atelier.decision")?.params).toMatchObject({ action: "rejeter" });
    // Lectures tolérées (GET, aucune transition) : le nom de l'entreprise pour le bandeau et le nombre
    // d'éléments « à faire » de la pastille (route de lecture du plugin).
    const appelsNatifs = (fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>).filter(
      ([url, init]) => !(init?.method === "GET" && (/^\/api\/companies\/[^/]+$/u.test(url) || /^\/api\/plugins\/[^/]+\/api\/accueil\?companyId=[^&]+$/u.test(url))),
    );
    expect(appelsNatifs).toEqual([]);
    expect(c.textContent).toContain("annulée dans la même opération");
  });

  it("diffuser : visible et désactivé sans approbation ; simulé après approbation en démonstration", async () => {
    const c1 = await dossier(base);
    const b1 = parTexte(c1, "button", "Diffuser");
    expect(b1.getAttribute("aria-disabled")).toBe("true");
    rendu?.demonter();
    const approbation = {
      id: "77777777-7777-4777-8777-777777777777", companyId: base.companyId, issueId: T, revisionId: R2, action: "approuver" as const, commentaire: "OK", userId: "local-board",
      portee: { revisionId: R2, action: "publier" as const, canal: "site", compte: null, audience: null, montantMaxCents: null, dureeJours: 30 }, invalidee: false, mode: "demonstration" as const, creeLe: "2026-10-15T10:00:00.000Z",
    };
    pont.actions["atelier.diffusion.demander"] = async () => ({ etat: "simulee" });
    const c2 = await dossier({ ...base, statut: { statut: "approved", motif: "" }, decisions: [approbation] });
    await cliquer(parTexte(c2, "button", "Diffuser"));
    expect(pont.appelsActions.find((a) => a.cle === "atelier.diffusion.demander")?.params).toMatchObject({ issueId: T, revisionId: R2, action: "publier", canal: "site", cleIdempotence: `interface-${approbation.id}` });
    expect(c2.textContent).toContain("Diffusion simulée (démonstration) : rien n'a été envoyé.");
  });

  it("diffusion déjà préparée : action CRM en français, service et outil visés affichés sobrement", async () => {
    const diffusion = {
      id: "99999999-9999-4999-8999-999999999991", companyId: base.companyId, issueId: T, revisionId: R2, decisionId: null, action: "modifier_crm" as const, canal: "crm", compte: "contact-12", montantCents: null,
      etat: "preparee" as const, cleIdempotence: "interface-crm-0001", motifRefus: null, mode: "reel" as const, creeLe: "2026-10-15T10:00:00.000Z", service: "pipedrive", outil: "pipedrive_modifier_personne",
    };
    const c = await dossier({ ...base, mode: "reel", mentionDemonstration: null, diffusions: [diffusion] });
    expect(c.textContent).toContain("Modifier des données du CRM sur crm");
    expect(c.textContent).toContain("Appel visé : service pipedrive, outil pipedrive_modifier_personne");
  });

  it("diffuser en réel : désactivé, raison « aucun connecteur de publication »", async () => {
    const c = await dossier({ ...base, mode: "reel", mentionDemonstration: null });
    const b = parTexte(c, "button", "Diffuser");
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(c.textContent).toContain("Aucun connecteur de publication : rien ne peut être diffusé.");
  });
});

describe("reprise après interruption", () => {
  const RUN = "88888888-8888-4888-8888-888888888888";
  const bloque = (): DossierHumain => ({ ...base, statut: { statut: "blocked_information", motif: "" }, interruption: { runId: RUN, revisionsLivrable: 1, couverturesDeclarees: 0, diffusions: 0 } });
  it("corps de la réconciliation native : effets constatés, run, note", () => {
    expect(corpsReprise(base, "x", null)).toBeNull();
    expect(corpsReprise(bloque(), " Vérifié : une révision, aucun effet externe. ", "a1")).toMatchObject({
      actionId: "a1", outcome: "restored", sourceIssueStatus: "todo", resolutionNote: "Vérifié : une révision, aucun effet externe.",
      executionReconciliation: { runId: RUN, providerStopped: true, actionOutcome: "mixed" },
    });
  });
  it("le bouton Reprendre appelle la réconciliation native de la tâche", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(url.endsWith("/activity") ? [{ action: "issue.execution_recovery_settled", details: { recoveryActionId: "a1" } }] : { issue: { status: "todo" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const c = await dossier(bloque());
    const section = parTexte(c, "section", "Reprendre après interruption");
    await saisir(champParLibelle(section, "Ce que vous avez vérifié"), "Révision 1 présente, rien envoyé.");
    await cliquer(parTexte(section, "button", "Reprendre"));
    const appel = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/recovery-actions/resolve"));
    expect(appel).toBeDefined();
    expect(JSON.parse(String(appel![1]?.body))).toMatchObject({ actionId: "a1", executionReconciliation: { runId: RUN } });
    expect(c.textContent).toContain("Reprise enregistrée");
  });
});
