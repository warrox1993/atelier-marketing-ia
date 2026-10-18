// @vitest-environment jsdom
/**
 * Grille des départements, interface : rubrique « Départements » en tête seulement pour un client à plusieurs
 * services, cases lues une par une avec le companyId de leur service (six à la fois au plus), filtrage par les
 * entreprises que l'utilisateur voit, lien vers l'atelier du service, erreur par case, fil « Client › Département ».
 * Les routes du plugin et l'API de l'hôte sont servies par un `fetch` simulé.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepartementDeclare, EtatDepartement } from "../../src/contrats/departements.js";
import { NavigationAtelier, PageAtelier } from "../../src/ui/index.js";
import { rubriquesVisibles } from "../../src/ui/rubriques.js";
import { oublierDepartements } from "../../src/ui/departements-sonde.js";
import { enParallele, LECTURES_SIMULTANEES } from "../../src/ui/vues/departements.js";
import { oublierAccesDirection } from "../../src/ui/vues/echanges.js";
import { cliquer, ENTREPRISE, installerPont, parTexte, rendre, type Pont, type Rendu } from "./pont.js";

const DIR = "22222222-2222-4222-8222-222222222222";
const JUR = "33333333-3333-4333-8333-333333333333";
const AUTRE = "44444444-4444-4444-8444-444444444444"; // service d'un autre client, jamais déclaré ici
const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };

const declare = (companyId: string, slug: string, nom: string, o: Partial<DepartementDeclare> = {}): DepartementDeclare => ({ companyId, slug, nom, estDirection: false, courant: false, ...o });
const TROIS = [declare(DIR, "direction", "Direction", { estDirection: true }), declare(JUR, "juridique", "Juridique"), declare(ENTREPRISE, "marketing", "Marketing", { courant: true })];
const ENTREPRISES = [
  { id: ENTREPRISE, name: "Fictive SA · Marketing", issuePrefix: "RNO" },
  { id: DIR, name: "Fictive SA · Direction", issuePrefix: "RNOAB" },
  { id: JUR, name: "Fictive SA · Juridique", issuePrefix: "RNOAC" },
  { id: AUTRE, name: "Autre SPRL · Marketing", issuePrefix: "AUT" },
];
const etat = (companyId: string, o: Partial<EtatDepartement> = {}): EtatDepartement => ({
  companyId, slug: "x", nom: "X", enPause: false, motifPause: null, agents: { actifs: 3, enPause: 0, enErreur: 0 }, taches: { enCours: 2, bloquees: 0 }, tachesTronquees: false,
  validations: { total: 0, parType: {} }, derniereActivite: null, alertes: [], ...o,
});

let rendu: Rendu | null = null;
let appels: string[] = [];
let serveur: (url: string) => { statut: number; corps: unknown };

beforeEach(() => {
  oublierDepartements();
  oublierAccesDirection();
  appels = [];
  serveur = () => ({ statut: 404, corps: {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      appels.push(url);
      const r = serveur(url);
      return new Response(JSON.stringify(r.corps), { status: r.statut });
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

/** Serveur d'un client à plusieurs services ; `etats` donne la réponse de chaque case (500 si absente). */
const servir = (departements: DepartementDeclare[], etats: Record<string, EtatDepartement | null> = {}) => (url: string) => {
  if (url.includes("/departements/etat?companyId=")) {
    const c = decodeURIComponent(url.split("companyId=")[1]!);
    const e = etats[c];
    return e ? { statut: 200, corps: e } : { statut: 500, corps: { error: "service injoignable" } };
  }
  if (url.includes("/departements?companyId=")) return { statut: 200, corps: { client: "fictive-sa", departements } };
  if (url.endsWith("/api/companies")) return { statut: 200, corps: ENTREPRISES };
  if (url.includes(`/api/companies/${ENTREPRISE}`)) return { statut: 200, corps: { name: "Fictive SA · Marketing" } };
  return { statut: 404, corps: {} };
};

const laisser = async (n = 4) => {
  for (let i = 0; i < n; i += 1) await cliquer(document.body);
};
const liens = (c: HTMLElement) => Array.from(c.querySelectorAll("nav a")).map((a) => a.textContent?.trim());

describe("navigation et vues d'ensemble", () => {
  const navigation = async (chemin = "/RNO/atelier/accueil") => {
    installerPont(chemin);
    rendu = await rendre(createElement(NavigationAtelier, { context: contexte }));
    await laisser();
    return rendu.conteneur;
  };

  it("la deuxième colonne ne propose ni « Départements » ni « Organigramme », même à plusieurs services", async () => {
    serveur = servir(TROIS);
    const textes = liens(await navigation());
    expect(textes).not.toContain("Départements");
    expect(textes).not.toContain("Organigramme");
    expect(textes.map((t) => t?.replace(/\d+ à valider$/u, ""))).toEqual(["Accueil", "Discussion", "Prospects", "Marketing", "Réglages"]);
  });

  it("la rubrique de l'échange entre services s'appelle « Registre des échanges », pas « Direction »", () => {
    const libelles = rubriquesVisibles(true).map((r) => r.libelle);
    expect(libelles).toContain("Registre des échanges");
    expect(libelles).not.toContain("Direction");
    expect(rubriquesVisibles(false).map((r) => r.libelle)).not.toContain("Registre des échanges");
  });

  it("sur Départements et Organigramme, la deuxième colonne ne rend rien", async () => {
    serveur = servir(TROIS);
    for (const vue of ["departements", "organigramme"]) {
      const c = await navigation(`/RNO/atelier/${vue}`);
      expect(c.querySelector("nav.atl-nav")).toBeNull();
      expect(c.textContent).toBe("");
      rendu?.demonter();
      rendu = null;
    }
  });
});

describe("vue « Départements »", () => {
  const ouvrir = async (chemin = "/RNO/atelier/departements"): Promise<{ c: HTMLElement; pont: Pont }> => {
    const pont = installerPont(chemin);
    rendu = await rendre(createElement(PageAtelier, { context: contexte }));
    await laisser(6);
    return { c: rendu.conteneur, pont };
  };

  it("une case par service visible, lue avec le companyId de SON service, et un lien vers son atelier", async () => {
    serveur = servir(TROIS, {
      [DIR]: etat(DIR, { validations: { total: 2, parType: { approbation: 2 } }, alertes: [{ niveau: "moyenne", texte: "1 tâche bloquée." }], taches: { enCours: 1, bloquees: 1 } }),
      [JUR]: etat(JUR, { agents: { actifs: 1, enPause: 1, enErreur: 1 }, alertes: [{ niveau: "haute", texte: "1 agent en erreur." }] }),
      [ENTREPRISE]: etat(ENTREPRISE),
    });
    const { c, pont } = await ouvrir();
    const cases = Array.from(c.querySelectorAll<HTMLElement>(".atl-dep-case"));
    expect(cases.map((x) => x.querySelector(".atl-dep-lien")?.textContent)).toEqual(["Direction", "Juridique", "Marketing"]);
    expect(c.querySelector(".atl-entete")?.textContent).toContain("Fictive SA");
    const dir = cases[0]!;
    expect(dir.textContent).toContain("À valider");
    // Plus d'en-tête de tableau : chaque case porte ses propres libellés (À valider, En cours, Bloquées).
    expect(c.querySelector(".atl-dep-entetes")).toBeNull();
    expect(Array.from(dir.querySelectorAll(".atl-dep-chiffre dt")).map((t) => t.textContent)).toEqual(["À valider", "En cours", "Bloquées"]);
    expect(c.querySelectorAll("ul.atl-dep-grille > li.atl-dep-case")).toHaveLength(3);
    expect(dir.querySelector('[data-ton="attention"] dd')?.textContent).toBe("2");
    expect(dir.dataset["alerte"]).toBe("moyenne");
    expect(cases[1]!.textContent).toContain("1 en erreur");
    expect(cases[1]!.dataset["alerte"]).toBe("haute");
    expect(cases[2]!.textContent).toContain("Vous êtes ici");
    // Chaque case a été lue par un appel portant son propre companyId, et rien d'autre.
    const lus = appels.filter((u) => u.includes("/departements/etat")).map((u) => decodeURIComponent(u.split("companyId=")[1]!)).sort();
    expect(lus).toEqual([DIR, JUR, ENTREPRISE].sort());
    expect(appels.some((u) => u.includes(AUTRE))).toBe(false);
    await cliquer(parTexte(c, ".atl-dep-lien", "Juridique"));
    expect(pont.navigations).toContain("/RNOAC/atelier");
    expect(c.textContent).not.toContain("—");
  });

  it("ligne de résumé calculée, cases triées par urgence (Direction n'est plus forcée en premier) et repère « À traiter »", async () => {
    serveur = servir(TROIS, {
      [DIR]: etat(DIR, { agents: { actifs: 3, enPause: 1, enErreur: 0 } }),
      [JUR]: etat(JUR, { validations: { total: 4, parType: {} }, taches: { enCours: 1, bloquees: 2 } }),
      [ENTREPRISE]: etat(ENTREPRISE, { taches: { enCours: 5, bloquees: 0 } }),
    });
    const { c } = await ouvrir();
    expect(c.querySelector('[data-testid="resume-departements"]')?.textContent).toBe("3 services · 4 à valider · 8 en cours · 2 bloquées · 9 agents actifs sur 10");
    const cases = Array.from(c.querySelectorAll<HTMLElement>(".atl-dep-case"));
    expect(cases.map((x) => x.querySelector(".atl-dep-lien")?.textContent)).toEqual(["Juridique", "Marketing", "Direction"]);
    expect(cases[0]!.querySelector(".atl-dep-traiter")?.textContent).toBe("À traiter");
    expect(c.querySelectorAll(".atl-dep-traiter")).toHaveLength(1);
    expect(cases[2]!.querySelector(".atl-dep-chiffre[data-zero] dd")?.textContent).toBe("0");
  });

  it("n'affiche pas un service déclaré auquel l'utilisateur n'a pas accès, et ne le lit pas", async () => {
    const invisible = "55555555-5555-4555-8555-555555555555";
    serveur = servir([...TROIS, declare(invisible, "achats", "Achats")], { [DIR]: etat(DIR), [JUR]: etat(JUR), [ENTREPRISE]: etat(ENTREPRISE) });
    const { c } = await ouvrir();
    expect(c.textContent).not.toContain("Achats");
    expect(appels.some((u) => u.includes(invisible))).toBe(false);
  });

  it("une case en erreur n'empêche pas les autres et propose de réessayer", async () => {
    serveur = servir(TROIS, { [DIR]: etat(DIR), [ENTREPRISE]: etat(ENTREPRISE) });
    const { c } = await ouvrir();
    const jur = parTexte(c, ".atl-dep-case", "Juridique");
    expect(jur.textContent).toContain("Lecture impossible");
    expect(parTexte(c, ".atl-dep-case", "Direction").textContent).toContain("En cours");
    serveur = servir(TROIS, { [DIR]: etat(DIR), [JUR]: etat(JUR), [ENTREPRISE]: etat(ENTREPRISE) });
    await cliquer(parTexte(jur, "button", "Réessayer"));
    await laisser();
    expect(parTexte(c, ".atl-dep-case", "Juridique").textContent).toContain("En cours");
  });

  it("fil « Client › Département » sans lien « Tous les départements » (le menu principal suffit)", async () => {
    serveur = servir(TROIS);
    const { c, pont } = await ouvrir("/RNO/atelier/accueil");
    const fil = c.querySelector<HTMLElement>('nav[aria-label="Fil d\'Ariane"]');
    expect(fil).not.toBeNull();
    expect(Array.from(fil!.querySelectorAll("li")).map((l) => l.textContent)).toEqual(["Fictive SA", "Marketing"]);
    expect(fil!.querySelector("a")).toBeNull();
    expect(fil!.textContent).not.toContain("Tous les départements");
    expect(pont.navigations).toEqual([]);
  });

  it("un client à un seul service garde le bandeau habituel", async () => {
    serveur = servir([TROIS[2]!]);
    const { c } = await ouvrir("/RNO/atelier/accueil");
    expect(c.querySelector('nav[aria-label="Fil d\'Ariane"]')).toBeNull();
    expect(c.querySelector(".atl-bandeau-entreprise")?.textContent).toContain("Entreprise :");
  });
});

describe("lectures en parallèle", () => {
  it(`au plus ${LECTURES_SIMULTANEES} à la fois, toutes faites`, async () => {
    let enVol = 0;
    let maximum = 0;
    const faits: number[] = [];
    await enParallele(Array.from({ length: 20 }, (_, i) => i), LECTURES_SIMULTANEES, async (i) => {
      enVol += 1;
      maximum = Math.max(maximum, enVol);
      await new Promise((r) => setTimeout(r, 1));
      enVol -= 1;
      faits.push(i);
    });
    expect(maximum).toBe(LECTURES_SIMULTANEES);
    expect(faits.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
});
