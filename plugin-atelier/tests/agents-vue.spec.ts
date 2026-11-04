// @vitest-environment jsdom
/**
 * Page « Agents » (tous les départements) : agents des départements d'un client, regroupés par département dans l'ordre du registre.
 * Les routes du plugin et l'API de l'hôte sont servies par un `fetch` simulé (même méthode que la grille des départements).
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepartementDeclare } from "../src/contrats/departements.js";
import { oublierDepartements } from "../src/ui/departements-sonde.js";
import { PageAtelier } from "../src/ui/index.js";
import { estVueEnsemble, sansMenuSecondaire } from "../src/ui/rubriques.js";
import { lireRoute } from "../src/ui/route.js";
import { LECTURES_SIMULTANEES } from "../src/ui/vues/departements.js";
import { oublierAccesDirection } from "../src/ui/vues/echanges.js";
import { agentsPourListe, ETATS_FILTRE, filtrerAgents, texteResumeAgents } from "../src/ui/agents-tous.js";
import { cliquer, ENTREPRISE, installerPont, parTexte, rendre, saisir, type Rendu } from "./ui/pont.js";

const DIR = "22222222-2222-4222-8222-222222222222";
const JUR = "33333333-3333-4333-8333-333333333333";
const AUTRE = "44444444-4444-4444-8444-444444444444"; // service d'un autre client, jamais déclaré ici
const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };

const declare = (companyId: string, slug: string, nom: string, o: Partial<DepartementDeclare> = {}): DepartementDeclare => ({ companyId, slug, nom, estDirection: false, courant: false, ...o });
// Ordre du registre volontairement non alphabétique : Direction, Juridique, Marketing.
const TROIS = [declare(DIR, "direction", "Direction", { estDirection: true }), declare(JUR, "juridique", "Juridique"), declare(ENTREPRISE, "marketing", "Marketing", { courant: true })];
const ENTREPRISES = [
  { id: ENTREPRISE, name: "Fictive SA · Marketing", issuePrefix: "RNO" },
  { id: DIR, name: "Fictive SA · Direction", issuePrefix: "RNOAB" },
  { id: JUR, name: "Fictive SA · Juridique", issuePrefix: "RNOAC" },
  { id: AUTRE, name: "Autre SPRL · Marketing", issuePrefix: "AUT" },
];
const ag = (id: string, name: string, o: Record<string, unknown> = {}) => ({ id, name, role: "general", title: null, status: "idle", reportsTo: null, adapterType: "claude_local", adapterConfig: { model: "claude-sonnet-5-5" }, lastHeartbeatAt: null, ...o });
const AGENTS: Record<string, unknown[]> = {
  [DIR]: [ag("d1", "Coordinateur général", { role: "ceo", title: "Coordinateur", status: "running" }), ag("d2", "Zélie Archives", { title: "Archiviste" }), ag("d0", "Ancien agent", { status: "terminated" })],
  [JUR]: [ag("j1", "Veille légale", { title: "Juriste de veille", status: "error" }), ag("j2", "Éloïse Contrats", { title: "Rédactrice de contrats", status: "paused" })],
  [ENTREPRISE]: [ag("m1", "Rédacteur de posts", { title: "Rédacteur", status: "active", lastHeartbeatAt: new Date(Date.now() - 3 * 3600_000).toISOString() })],
};

let rendu: Rendu | null = null;
let appels: string[] = [];
let serveur: (url: string) => { statut: number; corps: unknown };

beforeEach(() => {
  oublierDepartements();
  oublierAccesDirection();
  appels = [];
  window.location.hash = "";
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
  window.location.hash = "";
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

const servir = (departements: DepartementDeclare[], agents: Record<string, unknown[] | null> = AGENTS) => (url: string) => {
  const m = /\/api\/companies\/([^/]+)\/agents/u.exec(url);
  if (m) {
    const liste = agents[decodeURIComponent(m[1]!)];
    return liste ? { statut: 200, corps: liste } : { statut: 500, corps: { error: "service injoignable" } };
  }
  if (url.includes("/departements?companyId=")) return { statut: 200, corps: { client: "fictive-sa", departements } };
  if (url.endsWith("/api/companies")) return { statut: 200, corps: ENTREPRISES };
  if (url.includes(`/api/companies/${ENTREPRISE}`)) return { statut: 200, corps: { name: "Fictive SA · Marketing" } };
  return { statut: 404, corps: {} };
};

const laisser = async (n = 6) => {
  for (let i = 0; i < n; i += 1) await cliquer(document.body);
};
const ouvrir = async (departements = TROIS, agents: Record<string, unknown[] | null> = AGENTS) => {
  serveur = servir(departements, agents);
  const pont = installerPont("/RNO/atelier/agents");
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  await laisser();
  return { c: rendu.conteneur, pont };
};
const nomsAgents = (c: HTMLElement) => Array.from(c.querySelectorAll(".atl-ag-ligne .atl-ag-nom")).map((x) => x.textContent);
const groupes = (c: HTMLElement) => Array.from(c.querySelectorAll(".atl-ag-groupe h2")).map((x) => x.textContent?.replace(/\s+/gu, " ").trim());

describe("adresse et menus", () => {
  it("la vue « agents » est une vue d'ensemble sans menu secondaire, reconnue depuis l'adresse", () => {
    expect(lireRoute("/RNO/atelier/agents").vue).toBe("agents");
    expect(estVueEnsemble("agents")).toBe(true);
    expect(sansMenuSecondaire("agents")).toBe(true);
  });
});

describe("logique pure", () => {
  it("ignore les agents supprimés et lit modèle et dernier battement", () => {
    const lignes = agentsPourListe(AGENTS[DIR]);
    expect(lignes.map((a) => a.id)).toEqual(["d1", "d2"]);
    expect(lignes[0]!.model).toBe("claude-sonnet-5-5");
    expect(agentsPourListe({ items: AGENTS[ENTREPRISE] })[0]!.derniereActivite).not.toBeNull();
  });

  it("filtre par état, texte sans accent ni casse, sur le nom et l'intitulé", () => {
    const tous = agentsPourListe([...AGENTS[DIR]!, ...AGENTS[JUR]!]);
    expect(filtrerAgents(tous, "erreur", "").map((a) => a.id)).toEqual(["j1"]);
    expect(filtrerAgents(tous, "pause", "").map((a) => a.id)).toEqual(["j2"]);
    expect(filtrerAgents(tous, "encours", "").map((a) => a.id)).toEqual(["d1"]);
    expect(filtrerAgents(tous, "actifs", "").map((a) => a.id).sort()).toEqual(["d1", "d2"]);
    expect(filtrerAgents(tous, "tous", "ELOISE").map((a) => a.id)).toEqual(["j2"]);
    expect(filtrerAgents(tous, "tous", "juriste").map((a) => a.id)).toEqual(["j1"]);
    expect(ETATS_FILTRE.map((e) => e.libelle)).toEqual(["Tous", "Actifs", "En pause", "En erreur", "En cours"]);
  });

  it("texte de résumé : « 233 agents dans 29 départements · 5 en cours · 2 en erreur »", () => {
    expect(texteResumeAgents({ agents: 233, departements: 29, enCours: 5, enErreur: 2, illisibles: 0, enLecture: 0 })).toBe("233 agents dans 29 départements · 5 en cours · 2 en erreur");
    expect(texteResumeAgents({ agents: 1, departements: 1, enCours: 0, enErreur: 0, illisibles: 1, enLecture: 0 })).toBe("1 agent dans 1 département · 0 en cours · 0 en erreur · 1 département illisible");
  });
});

describe("page « Agents » (tous les départements)", () => {
  it("regroupe par département dans l'ordre du registre, exclut les agents supprimés, compte et résume", async () => {
    const { c } = await ouvrir();
    expect(groupes(c)).toEqual(["Direction 2 agents", "Juridique 2 agents · 1 en erreur", "Marketing 1 agent"]);
    // Coordinateur d'abord, puis ordre alphabétique français (accents ignorés).
    expect(nomsAgents(c)).toEqual(["Coordinateur général", "Zélie Archives", "Éloïse Contrats", "Veille légale", "Rédacteur de posts"]);
    expect(c.textContent).not.toContain("Ancien agent");
    expect(c.querySelector('[data-testid="resume-agents"]')?.textContent).toBe("5 agents dans 3 départements · 1 en cours · 1 en erreur");
    expect(c.textContent).not.toContain("—");
  });

  it("lit les agents de chaque service avec le companyId de SON service, rien d'un autre client", async () => {
    await ouvrir();
    const lus = appels.filter((u) => /\/agents/u.test(u)).map((u) => /companies\/([^/]+)\/agents/u.exec(u)![1]).sort();
    expect(lus).toEqual([DIR, JUR, ENTREPRISE].sort());
    expect(appels.some((u) => u.includes(AUTRE))).toBe(false);
  });

  it("chaque agent a un lien /<préfixe>/agents/<id> vers sa fiche native, son état en texte et son modèle", async () => {
    const { c, pont } = await ouvrir();
    const ligne = parTexte(c, ".atl-ag-ligne", "Veille légale");
    expect(ligne.textContent).toContain("en erreur");
    expect(ligne.textContent).toContain("claude-sonnet-5-5");
    expect(ligne.textContent).toContain("Juriste de veille");
    await cliquer(ligne.querySelector("a")!);
    expect(pont.navigations).toEqual(["/RNOAC/agents/j1"]);
    expect(parTexte(c, ".atl-ag-ligne", "Rédacteur de posts").textContent).toMatch(/il y a 3 heures/u);
  });

  it("filtre par état : un onglet masque les agents et les départements vides, un clic sur « Tous » les rend", async () => {
    const { c } = await ouvrir();
    await cliquer(parTexte(c, "button.atl-ag-onglet", "En erreur"));
    expect(nomsAgents(c)).toEqual(["Veille légale"]);
    expect(groupes(c)).toEqual(["Juridique 1 sur 2 agents · 1 en erreur"]);
    expect(parTexte(c, "button.atl-ag-onglet", "En erreur").getAttribute("aria-pressed")).toBe("true");
    await cliquer(parTexte(c, "button.atl-ag-onglet", "Tous"));
    expect(nomsAgents(c)).toHaveLength(5);
  });

  it("filtre par texte et par département, avec message et remise à zéro quand rien ne correspond", async () => {
    const { c } = await ouvrir();
    const champ = c.querySelector<HTMLInputElement>('input[type="search"]')!;
    await saisir(champ, "eloise");
    expect(nomsAgents(c)).toEqual(["Éloïse Contrats"]);
    await saisir(champ, "");
    const choix = c.querySelector<HTMLSelectElement>("select")!;
    await saisir(choix, "marketing");
    expect(nomsAgents(c)).toEqual(["Rédacteur de posts"]);
    await saisir(champ, "introuvable");
    expect(c.textContent).toContain("Aucun agent ne correspond à ces filtres.");
    await cliquer(parTexte(c, "button", "Tout afficher"));
    expect(nomsAgents(c)).toHaveLength(5);
    expect(champ.value).toBe("");
  });

  it("#service=<slug> pré-filtre un département à l'ouverture", async () => {
    window.location.hash = "#service=juridique";
    const { c } = await ouvrir();
    expect(groupes(c)).toEqual(["Juridique 2 agents · 1 en erreur"]);
    expect(c.querySelector<HTMLSelectElement>("select")!.value).toBe("juridique");
  });

  it("un département en échec n'empêche pas les autres de s'afficher et propose de réessayer", async () => {
    const { c } = await ouvrir(TROIS, { [DIR]: AGENTS[DIR]!, [ENTREPRISE]: AGENTS[ENTREPRISE]! });
    const jur = parTexte(c, ".atl-ag-groupe", "Juridique");
    expect(jur.textContent).toContain("Lecture impossible");
    expect(nomsAgents(c)).toEqual(["Coordinateur général", "Zélie Archives", "Rédacteur de posts"]);
    expect(c.querySelector('[data-testid="resume-agents"]')?.textContent).toContain("1 département illisible");
    serveur = servir(TROIS);
    await cliquer(parTexte(jur, "button", "Réessayer"));
    await laisser();
    expect(parTexte(c, ".atl-ag-groupe", "Juridique").textContent).not.toContain("Lecture impossible");
    expect(nomsAgents(c)).toHaveLength(5);
  });

  it("un département en échec reste visible (avec Réessayer) même sous un filtre d'état", async () => {
    const { c } = await ouvrir(TROIS, { [DIR]: AGENTS[DIR]!, [ENTREPRISE]: AGENTS[ENTREPRISE]! });
    await cliquer(parTexte(c, "button.atl-ag-onglet", "En cours"));
    expect(nomsAgents(c)).toEqual(["Coordinateur général"]);
    expect(parTexte(c, ".atl-ag-groupe", "Juridique").textContent).toContain("Réessayer");
  });

  it("au plus six lectures simultanées, même avec beaucoup de départements", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`);
    const declares = ids.map((id, i) => declare(id, `s${i}`, `Service ${i}`, i === 0 ? { courant: true } : {}));
    const entreprises = ids.map((id, i) => ({ id, name: `Fictive SA · S${i}`, issuePrefix: `S${i}` }));
    let enVol = 0;
    let max = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const reponse = (corps: unknown) => new Response(JSON.stringify(corps), { status: 200 });
        if (url.includes("/departements?companyId=")) return reponse({ client: "fictive-sa", departements: declares });
        if (url.endsWith("/api/companies")) return reponse(entreprises);
        if (/\/agents/u.test(url)) {
          enVol += 1;
          max = Math.max(max, enVol);
          await new Promise((r) => setTimeout(r, 5));
          enVol -= 1;
          return reponse([ag("x", "Agent")]);
        }
        return reponse({ name: "Fictive SA · S0" });
      }),
    );
    installerPont("/RNO/atelier/agents");
    rendu = await rendre(createElement(PageAtelier, { context: { ...contexte, companyId: ids[0]! } }));
    for (let i = 0; i < 12; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
      await laisser(1);
    }
    expect(max).toBeGreaterThan(1);
    expect(max).toBeLessThanOrEqual(LECTURES_SIMULTANEES);
    expect(rendu.conteneur.querySelectorAll(".atl-ag-groupe")).toHaveLength(12);
  });

  it("un client à un seul service : la page liste les agents de ce service", async () => {
    const { c } = await ouvrir([TROIS[2]!]);
    expect(c.textContent).not.toContain("Un seul service pour ce client");
    expect(groupes(c)).toEqual(["Marketing 1 agent"]);
    expect(nomsAgents(c)).toEqual(["Rédacteur de posts"]);
    expect(c.querySelector('[data-testid="resume-agents"]')?.textContent).toBe("1 agent dans 1 département · 0 en cours · 0 en erreur");
  });

  it("aucun service déclaré : message explicite, pas de liste", async () => {
    const { c } = await ouvrir([]);
    expect(c.textContent).toContain("Aucun service déclaré pour ce client");
    expect(c.querySelector(".atl-ag-groupe")).toBeNull();
  });

  it("le titre de la page est « Agents »", async () => {
    const { c } = await ouvrir();
    expect(c.querySelector("h1")?.textContent).toBe("Agents");
  });
});
