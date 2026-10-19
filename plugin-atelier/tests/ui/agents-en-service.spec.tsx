// @vitest-environment jsdom
/**
 * Tiroir « Agents en service » : groupement par service, sélection par service et globale, filtre et recherche,
 * confirmation dans le tiroir, appels pause/resume seulement sur les bons agents, bilan avec refus, Échap.
 */
import { act, createElement, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ciblesAction, cheminAction, gardesDuClientCourant, GererLesAgents } from "../../src/ui/composants/agents-en-service.js";
import { oublierDepartements } from "../../src/ui/departements-sonde.js";
import { STYLES_AGENTS_EN_SERVICE } from "../../src/ui/styles-agents-en-service.js";
import { cliquer, ENTREPRISE, installerPont, parTexte, rendre, saisir, type Rendu } from "./pont.js";

const MARKETING = "22222222-2222-4222-8222-222222222222";
const ag = (id: string, name: string, status: string, company: string) => ({ id, name, status, role: "general", title: `Poste ${name}`, reportsTo: null, adapterType: "claude_local", companyId: company });

let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string }> = [];
let agents: Record<string, Array<Record<string, unknown>>> = {};
let refus: Record<string, { statut: number; message: string }> = {};
let departements: unknown = null;
const ENTREPRISES_PAR_DEFAUT = [{ id: ENTREPRISE, name: "Client · Direction", issuePrefix: "RNO" }, { id: MARKETING, name: "Client · Marketing", issuePrefix: "RNM" }];
let entreprisesHote: Array<{ id: string; name: string; issuePrefix: string }> = ENTREPRISES_PAR_DEFAUT;

beforeEach(() => {
  installerPont("/RNO/atelier/discussion");
  oublierDepartements();
  appels = [];
  refus = {};
  entreprisesHote = ENTREPRISES_PAR_DEFAUT;
  agents = {
    [ENTREPRISE]: [ag("a1", "Alice Direction", "idle", ENTREPRISE), ag("a2", "Bruno Direction", "paused", ENTREPRISE)],
    [MARKETING]: [ag("b1", "Claire Marketing", "running", MARKETING), ag("b2", "David Marketing", "paused", MARKETING), ag("b3", "Eva Marketing", "error", MARKETING), ag("b4", "Fin Marketing", "terminated", MARKETING)],
  };
  departements = {
    client: "Client",
    departements: [
      { companyId: ENTREPRISE, slug: "direction", nom: "Direction", estDirection: true, courant: true },
      { companyId: MARKETING, slug: "marketing", nom: "Marketing", estDirection: false, courant: false },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      const methode = init?.method ?? "GET";
      appels.push({ methode, url });
      if (methode === "GET" && url.includes("/departements?")) return new Response(JSON.stringify(departements), { status: 200 });
      if (methode === "GET" && url === "/api/companies")
        return new Response(JSON.stringify(entreprisesHote), { status: 200 });
      const lecture = /^\/api\/companies\/([^/]+)\/agents$/.exec(url);
      if (methode === "GET" && lecture) return new Response(JSON.stringify(agents[lecture[1]!] ?? []), { status: 200 });
      const action = /^\/api\/agents\/([^/]+)\/(pause|resume)$/.exec(url);
      if (methode === "POST" && action) {
        const r = refus[action[1]!];
        if (r) return new Response(JSON.stringify({ error: r.message }), { status: r.statut });
        for (const liste of Object.values(agents)) {
          const a = liste.find((x) => x.id === action[1]);
          if (a) a.status = action[2] === "pause" ? "paused" : "idle";
        }
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

async function ouvrir() {
  rendu = await rendre(createElement(GererLesAgents, { companyId: ENTREPRISE }));
  await cliquer(rendu.conteneur.querySelector('button[aria-label="Gérer les agents"]')!);
  await act(async () => {});
  return rendu.conteneur;
}
const case_ = (c: ParentNode, nom: string) => c.querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="${nom}"]`)!;
const posts = () => appels.filter((a) => a.methode === "POST").map((a) => a.url.replace("/api", ""));
const bouton = (c: ParentNode, texte: string) => parTexte(c, "button", texte) as HTMLButtonElement;

describe("Tiroir Agents en service", () => {
  it("regroupe les agents par service et ignore les agents supprimés", async () => {
    const c = await ouvrir();
    expect(c.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    const groupes = [...c.querySelectorAll(".atl-aes-groupe-nom")].map((e) => e.textContent);
    expect(groupes).toEqual(["Direction", "Marketing"]);
    expect(case_(c, "Alice Direction")).not.toBeNull();
    expect(case_(c, "Eva Marketing")).not.toBeNull();
    expect(c.textContent).not.toContain("Fin Marketing");
    expect(c.textContent).toContain("0 sélectionné");
  });

  it("sélectionne par service (état indéterminé si partiel) puis globalement", async () => {
    const c = await ouvrir();
    await cliquer(case_(c, "Claire Marketing"));
    expect(case_(c, "Tout sélectionner dans Marketing").indeterminate).toBe(true);
    expect(case_(c, "Tout sélectionner").indeterminate).toBe(true);
    expect(c.textContent).toContain("1 sélectionné");
    await cliquer(case_(c, "Tout sélectionner dans Marketing"));
    expect(case_(c, "Tout sélectionner dans Marketing").checked).toBe(true);
    expect(c.textContent).toContain("3 sélectionnés");
    await cliquer(case_(c, "Tout sélectionner"));
    expect(c.textContent).toContain("5 sélectionnés");
    expect(case_(c, "Tout sélectionner").checked).toBe(true);
    await cliquer(case_(c, "Tout sélectionner"));
    expect(c.textContent).toContain("0 sélectionné");
  });

  it("filtre En pause et cherche par nom ; la sélection ne compte que ce qui est visible", async () => {
    const c = await ouvrir();
    await cliquer(case_(c, "Tout sélectionner"));
    await cliquer(parTexte(c, "label", "En pause").querySelector("input")!);
    expect(case_(c, "Bruno Direction")).not.toBeNull();
    expect(case_(c, "Alice Direction")).toBeNull();
    expect(c.textContent).toContain("2 sélectionnés");
    await cliquer(parTexte(c, "label", "En service").querySelector("input")!);
    expect(case_(c, "Bruno Direction")).toBeNull();
    expect(c.textContent).toContain("3 sélectionnés");
    await cliquer(parTexte(c, "label", "Tous").querySelector("input")!);
    await saisir(c.querySelector('input[type="search"]')!, "claire");
    expect(case_(c, "Claire Marketing")).not.toBeNull();
    expect(case_(c, "Alice Direction")).toBeNull();
    expect(c.textContent).toContain("1 sélectionné");
  });

  it("demande confirmation dans le tiroir avant de couper, puis ne coupe que les agents qui ne sont pas en pause", async () => {
    const c = await ouvrir();
    const confirmer = vi.spyOn(window, "confirm");
    await cliquer(case_(c, "Tout sélectionner"));
    await cliquer(bouton(c, "Couper la sélection"));
    expect(c.textContent).toContain("Couper 3 agents ? Leurs tâches en cours s'arrêtent.");
    expect(posts()).toEqual([]);
    await cliquer(bouton(c, "Annuler"));
    expect(posts()).toEqual([]);
    await cliquer(bouton(c, "Couper la sélection"));
    await cliquer(parTexte(c, ".atl-aes-confirmation button", /^Couper$/));
    await act(async () => {});
    expect(posts().sort()).toEqual(["/agents/a1/pause", "/agents/b1/pause", "/agents/b3/pause"]);
    expect(confirmer).not.toHaveBeenCalled();
    expect(c.querySelector(".atl-aes-bilan")?.textContent).toContain("3 coupés");
    // Relecture des statuts après l'action.
    expect(appels.filter((a) => a.methode === "GET" && /\/agents$/.test(a.url)).length).toBeGreaterThanOrEqual(4);
    expect(c.textContent).toContain("En pause");
  });

  it("n'allume que les agents en pause et rend le bilan avec la raison de chaque refus", async () => {
    agents[MARKETING]!.push(ag("b5", "Gaelle Marketing", "paused", MARKETING));
    refus["b5"] = { statut: 409, message: "Chaîne hiérarchique à réparer" };
    const c = await ouvrir();
    await cliquer(case_(c, "Tout sélectionner"));
    await cliquer(bouton(c, "Allumer la sélection"));
    expect(c.textContent).toContain("Allumer 3 agents ?");
    await cliquer(parTexte(c, ".atl-aes-confirmation button", /^Allumer$/));
    await act(async () => {});
    expect(posts().sort()).toEqual(["/agents/a2/resume", "/agents/b2/resume", "/agents/b5/resume"]);
    const bilan = c.querySelector(".atl-aes-bilan")!.textContent!;
    expect(bilan).toContain("2 allumés, 1 refusé");
    expect(bilan).toContain("Gaelle Marketing : Chaîne hiérarchique à réparer");
  });

  it("désactive les actions sans agent concerné", async () => {
    const c = await ouvrir();
    await cliquer(case_(c, "Alice Direction"));
    expect(bouton(c, "Allumer la sélection").disabled).toBe(true);
    expect(bouton(c, "Couper la sélection").disabled).toBe(false);
  });

  it("ne liste que les entreprises du client courant : une entreprise d'un autre client de l'instance n'a ni groupe ni lecture d'agents", async () => {
    const AUTRE = "99999999-9999-4999-8999-999999999999";
    agents[AUTRE] = [ag("z1", "Zoé Autre client", "idle", AUTRE)];
    departements = {
      client: "Client",
      departements: [
        { companyId: ENTREPRISE, slug: "direction", nom: "Direction", estDirection: true, courant: true },
        { companyId: MARKETING, slug: "marketing", nom: "Marketing", estDirection: false, courant: false },
        { companyId: AUTRE, slug: "finance", nom: "Finance", estDirection: false, courant: false },
      ],
    };
    entreprisesHote = [
      { id: ENTREPRISE, name: "Client · Direction", issuePrefix: "RNO" },
      { id: MARKETING, name: "Client · Marketing", issuePrefix: "RNM" },
      { id: AUTRE, name: "Autre client · Finance", issuePrefix: "AUT" },
    ];
    const c = await ouvrir();
    expect([...c.querySelectorAll(".atl-aes-groupe-nom")].map((e) => e.textContent)).toEqual(["Direction", "Marketing"]);
    expect(c.textContent).not.toContain("Zoé Autre client");
    expect(appels.some((a) => a.url.includes(AUTRE))).toBe(false);
  });

  it("gardesDuClientCourant : préfixe commun gardé, courante toujours gardée, nom simple = déclaration telle quelle", () => {
    const v = (companyId: string, nomEntreprise: string) => ({ companyId, nomEntreprise });
    expect(gardesDuClientCourant([v("a", "X · Direction"), v("b", "X · RH"), v("c", "Y · RH")], "a").map((d) => d.companyId)).toEqual(["a", "b"]);
    expect(gardesDuClientCourant([v("a", "Simple"), v("b", "Y · RH")], "a").map((d) => d.companyId)).toEqual(["a", "b"]);
    expect(gardesDuClientCourant([v("b", "X · RH")], "a").map((d) => d.companyId)).toEqual(["b"]);
  });

  it("n'affiche qu'un groupe quand le client n'a pas de services déclarés", async () => {
    departements = { client: null, departements: [] };
    const c = await ouvrir();
    expect([...c.querySelectorAll(".atl-aes-groupe-nom")].map((e) => e.textContent)).toEqual(["Agents"]);
    expect(case_(c, "Alice Direction")).not.toBeNull();
  });

  it("garde l'erreur d'un service à ce service et propose de réessayer", async () => {
    const lecture = fetch as unknown as ReturnType<typeof vi.fn>;
    const base = lecture.getMockImplementation()! as (url: string, init?: { method?: string }) => Promise<Response>;
    let panne = true;
    lecture.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (panne && url === `/api/companies/${MARKETING}/agents`) return new Response(JSON.stringify({ error: "Accès refusé" }), { status: 403 });
      return base(url, init);
    });
    const c = await ouvrir();
    expect(c.querySelector('[role="alert"]')?.textContent).toContain("Accès refusé");
    expect(case_(c, "Alice Direction")).not.toBeNull();
    panne = false;
    await cliquer(bouton(c, "Réessayer"));
    expect(case_(c, "Claire Marketing")).not.toBeNull();
  });

  it("se ferme avec Échap, rend le focus au bouton d'origine et pose le focus dans le tiroir à l'ouverture", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const c = await ouvrir();
      const dialogue = c.querySelector<HTMLElement>('[role="dialog"]')!;
      expect(dialogue.contains(document.activeElement)).toBe(true);
      await act(async () => {
        dialogue.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      await act(async () => {
        vi.runAllTimers();
      });
      expect(c.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(c.querySelector('button[aria-label="Gérer les agents"]'));
    } finally {
      vi.useRealTimers();
    }
  });

  it("garde le focus dans le tiroir avec Tab (piège)", async () => {
    const c = await ouvrir();
    const dialogue = c.querySelector<HTMLElement>('[role="dialog"]')!;
    const dernier = [...dialogue.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), summary')].pop()!;
    dernier.focus();
    await act(async () => {
      dialogue.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(dialogue.querySelector("button.atl-aes-fermer"));
  });

  it("monté sous <StrictMode> (double montage de l'hôte) : les agents s'affichent, aucun groupe ne reste sur « lecture… »", async () => {
    rendu = await rendre(createElement(StrictMode, null, createElement(GererLesAgents, { companyId: ENTREPRISE })));
    const c = rendu.conteneur;
    await cliquer(c.querySelector('button[aria-label="Gérer les agents"]')!);
    await act(async () => {});
    const lecturesAgents = appels.filter((a) => a.methode === "GET" && /\/companies\/[^/]+\/agents$/.test(a.url));
    expect(lecturesAgents.length).toBeGreaterThanOrEqual(2);
    expect(c.textContent).not.toContain("lecture…");
    expect([...c.querySelectorAll(".atl-aes-groupe-nb")].map((e) => e.textContent)).toEqual(["2 agents, 1 en pause", "3 agents, 1 en pause"]);
    expect(case_(c, "Alice Direction")).not.toBeNull();
    expect(case_(c, "Eva Marketing")).not.toBeNull();
  });

  it("cibles tactiles : cases de 2,75 rem, recherche de 2,75 rem, filtre en contrôle segmenté dont chaque radio couvre son étiquette", async () => {
    const c = await ouvrir();
    for (const nom of ["Tout sélectionner", "Tout sélectionner dans Marketing", "Alice Direction"]) expect(case_(c, nom).classList.contains("atl-case-tactile")).toBe(true);
    expect(STYLES_AGENTS_EN_SERVICE).toMatch(/\.atl-case-tactile \{[^}]*width: 2\.75rem; height: 2\.75rem/u);
    expect(STYLES_AGENTS_EN_SERVICE).toMatch(/input\[type="search"\] \{[^}]*height: 2\.75rem/u);
    expect(STYLES_AGENTS_EN_SERVICE).toMatch(/\.atl-aes-filtre \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
    expect(STYLES_AGENTS_EN_SERVICE).toMatch(/\.atl-aes-filtre input \{ position: absolute; inset: 0; width: 100%; height: 100%/u);
  });

  it("tiroir ouvert : le reste de la page est inerte (sauf le tiroir et son fond), puis redevient actif à la fermeture", async () => {
    const c = await ouvrir();
    const dialogue = c.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialogue.closest("[inert]")).toBeNull();
    expect(c.querySelector(".atl-aes-fond")!.closest("[inert]")).toBeNull();
    expect(c.querySelector('button[aria-label="Gérer les agents"]')!.hasAttribute("inert")).toBe(true);
    await cliquer(bouton(c, "Fermer"));
    expect(c.querySelector("[inert]")).toBeNull();
  });

  it("fournit des fonctions pures cohérentes", () => {
    expect(cheminAction("couper", "x y")).toBe("/agents/x%20y/pause");
    expect(cheminAction("allumer", "x")).toBe("/agents/x/resume");
    const a = [{ id: "1", status: "paused" }, { id: "2", status: "idle" }] as never[];
    expect(ciblesAction("allumer", a).map((x: { id: string }) => x.id)).toEqual(["1"]);
    expect(ciblesAction("couper", a).map((x: { id: string }) => x.id)).toEqual(["2"]);
  });
});
