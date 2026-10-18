// @vitest-environment jsdom
/**
 * Discussion d'un client à plusieurs services : le « À faire » de TOUS les départements est agrégé dans le fil.
 * Une lecture `/accueil` par service avec le companyId de SON service, chaque élément affiche son service, les
 * décisions partent vers l'entreprise d'origine, repli sur le comportement historique si la liste des services échoue.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VueDiscussion } from "../../src/ui/vues/discussion.js";
import { oublierDepartements } from "../../src/ui/departements-sonde.js";
import { cliquer, ENTREPRISE, installerPont, parTexte, rendre, type Rendu } from "./pont.js";

const DIRECTION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MARKETING = ENTREPRISE;
const JURIDIQUE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const CONFIRMATION = {
  id: "question:k2", type: "information_manquante", urgence: "haute", enTete: true, titre: "Mettre l'agent Veille en pause ?", raison: "Une décision vous revient.", lien: "/issues/MKT-6", action: "Confirmer", issueId: "iss-6",
  interaction: { id: "k2", kind: "request_confirmation", invite: "Mettre l'agent Veille en pause ?", details: null, libelleAccepter: "Confirmer", libelleRefuser: "Annuler", questions: [] },
};
const LIAISON = {
  id: "liaison:l1", type: "liaison_a_approuver", urgence: "haute", titre: "Demande du marketing au juridique", raison: "À transmettre.", lien: "/issues/JUR-3", action: "Examiner", issueId: "t1",
  liaison: { liaisonId: "l1", serviceSource: "marketing", serviceCible: "juridique", objet: "Mentions légales", question: "Peut-on citer ce client ?", extraits: [] },
};
const CONTENU_JURIDIQUE = { id: "contenu:iss-9", type: "contenu_a_valider", urgence: "haute", titre: "Page conditions", raison: "Attend votre décision.", lien: "/atelier/contenus/iss-9", action: "Relire et décider", issueId: "iss-9" };

const SERVICES = [
  { companyId: DIRECTION, slug: "direction", nom: "Direction", estDirection: true, courant: false },
  { companyId: MARKETING, slug: "marketing", nom: "Marketing", estDirection: false, courant: true },
  { companyId: JURIDIQUE, slug: "juridique", nom: "Juridique", estDirection: false, courant: false },
];

let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string; corps: unknown }> = [];
let departements: { statut: number; corps: unknown } = { statut: 200, corps: { client: "fictive-sa", departements: SERVICES } };
let aFaire: Record<string, unknown[]> = {};
let accueilEnPanne: string | null = null;

beforeEach(() => {
  installerPont("/MKT/atelier/discussion");
  oublierDepartements();
  appels = [];
  departements = { statut: 200, corps: { client: "fictive-sa", departements: SERVICES } };
  aFaire = { [DIRECTION]: [], [MARKETING]: [CONFIRMATION], [JURIDIQUE]: [LIAISON, CONTENU_JURIDIQUE] };
  accueilEnPanne = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const methode = init?.method ?? "GET";
      appels.push({ methode, url, corps: init?.body ? JSON.parse(init.body) : null });
      const id = new URL(url, "http://x").searchParams.get("companyId") ?? "";
      if (methode === "GET" && url.includes("/departements?")) return new Response(JSON.stringify(departements.corps), { status: departements.statut });
      if (methode === "GET" && url.endsWith("/api/companies")) {
        return new Response(JSON.stringify([{ id: DIRECTION, name: "Fictive · Direction", issuePrefix: "DIR" }, { id: MARKETING, name: "Fictive · Marketing", issuePrefix: "MKT" }, { id: JURIDIQUE, name: "Fictive · Juridique", issuePrefix: "JUR" }]), { status: 200 });
      }
      if (methode === "GET" && url.includes("/accueil?")) {
        if (id === accueilEnPanne) return new Response("{}", { status: 500 });
        return new Response(JSON.stringify({ companyId: id, elements: aFaire[id] ?? [], missions: [] }), { status: 200 });
      }
      if (methode === "GET" && url.includes("/discussion/messages")) return new Response(JSON.stringify({ messages: [], cartes: [] }), { status: 200 });
      if (methode === "GET") return new Response(JSON.stringify({ issueId: "i1", identifiant: "DEM-1", messages: [], cartes: [] }), { status: 200 });
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
  rendu = await rendre(createElement(VueDiscussion));
  return rendu.conteneur;
}
const accueilsLus = () => appels.filter((a) => a.methode === "GET" && a.url.includes("/accueil?")).map((a) => new URL(a.url, "http://x").searchParams.get("companyId"));

describe("discussion : « À faire » de tous les départements", () => {
  it("agrège les 3 services : une lecture par entreprise avec son propre companyId, chaque élément porte son service", async () => {
    const c = await ouvrir();
    expect(new Set(accueilsLus())).toEqual(new Set([DIRECTION, MARKETING, JURIDIQUE]));
    const cartes = Array.from(c.querySelectorAll('.atl-disc-bulle[data-carte="oui"]'));
    expect(cartes.map((b) => b.getAttribute("data-service"))).toEqual(["Marketing", "Juridique", "Juridique"]);
    expect(cartes[0]!.querySelector(".atl-disc-dep")!.textContent).toBe("Marketing");
    // Teinte de l'étiquette : accent par défaut, couleur d'attention pour un service sensible (juridique).
    expect(cartes[0]!.querySelector(".atl-disc-dep")!.hasAttribute("data-sensible")).toBe(false);
    expect(cartes[1]!.querySelector(".atl-disc-dep")!.getAttribute("data-sensible")).toBe("oui");
    expect(cartes[0]!.textContent).toContain("Mettre l'agent Veille en pause ?");
    expect(cartes[1]!.textContent).toContain("Demande du marketing au juridique");
    expect(c.querySelector('[role="alert"]')).toBeNull();
  });

  it("décision prise dans l'entreprise d'origine : confirmation par la route native de la tâche, demande de liaison avec le companyId du service", async () => {
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", "Confirmer"));
    expect(appels.some((a) => a.methode === "POST" && a.url === "/api/issues/iss-6/interactions/k2/accept")).toBe(true);
    expect(c.textContent).not.toContain("Mettre l'agent Veille en pause ?");
    await cliquer(parTexte(c, "button", "Transmettre"));
    const decision = appels.find((a) => a.url.includes("/liaisons/decider"))!;
    expect(decision.corps).toMatchObject({ companyId: JURIDIQUE, liaisonId: "l1", decision: "approuver" });
  });

  it("contenu d'un autre service : jamais décidé ici (le pont vise l'entreprise de la page), lien préfixé vers sa page", async () => {
    const c = await ouvrir();
    const carte = Array.from(c.querySelectorAll('.atl-disc-bulle[data-carte="oui"]')).find((b) => b.textContent!.includes("Page conditions"))!;
    expect(carte.querySelector("button")).toBeNull();
    expect(carte.querySelector("a")!.getAttribute("href")).toBe("/RNO/JUR/atelier/contenus/iss-9");
  });

  it("une action « traiter » visant un élément d'un département affiche ce département", async () => {
    const messages = [{ id: "m1", auteur: "agent", nom: "Coordinateur", texte: "À vous.", date: "2026-10-16T10:00:00.000Z", actions: [{ type: "traiter", element: "question:k2" }] }];
    const base = (fetch as unknown as ReturnType<typeof vi.fn>).getMockImplementation() as (u: string, i?: unknown) => Promise<Response>;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if ((init?.method ?? "GET") === "GET" && url.includes("/discussion") && !url.includes("/messages")) return new Response(JSON.stringify({ issueId: "i1", identifiant: "DEM-1", messages, cartes: [] }), { status: 200 });
      return base(url, init);
    });
    const c = await ouvrir();
    const actions = c.querySelector(".atl-disc-actions")!;
    expect(actions.querySelector(".atl-disc-dep")!.textContent).toBe("Marketing");
    // Étiquette et bouton forment une paire groupée (étiquette au-dessus de son bouton).
    const paire = actions.querySelector(".atl-disc-paire")!;
    expect(paire.firstElementChild!.classList.contains("atl-disc-dep")).toBe(true);
    expect(paire.querySelector("button")).toBeTruthy();
    expect(parTexte(actions as HTMLElement, "button", "Répondre à la demande de confirmation")).toBeTruthy();
  });

  it("un département illisible est signalé sans masquer les autres", async () => {
    accueilEnPanne = JURIDIQUE;
    const c = await ouvrir();
    expect(c.querySelector('[role="alert"]')?.textContent).toContain("Actions indisponibles");
    expect(Array.from(c.querySelectorAll('.atl-disc-bulle[data-carte="oui"]')).map((b) => b.getAttribute("data-service"))).toEqual(["Marketing"]);
    accueilEnPanne = null;
    await cliquer(parTexte(c, "button", "Réessayer"));
    expect(c.querySelector('[role="alert"]')).toBeNull();
    expect(c.querySelectorAll('.atl-disc-bulle[data-carte="oui"]')).toHaveLength(3);
  });

  it("repli : liste des services en échec, la discussion garde son comportement actuel (aucune lecture du « À faire »)", async () => {
    departements = { statut: 500, corps: { erreur: { code: "interne", message: "panne" } } };
    const c = await ouvrir();
    expect(accueilsLus()).toEqual([]);
    expect(c.querySelector('.atl-disc-bulle[data-carte="oui"]')).toBeNull();
  });

  it("repli : un seul service, aucune agrégation", async () => {
    departements = { statut: 200, corps: { client: "fictive-sa", departements: [SERVICES[1]] } };
    const c = await ouvrir();
    expect(accueilsLus()).toEqual([]);
    expect(c.querySelector('.atl-disc-bulle[data-carte="oui"]')).toBeNull();
    expect(c.textContent).not.toContain("Coordinateur général");
  });
});

describe("discussion : étiquette « Coordinateur général » (B4)", () => {
  it("s'affiche aussi quand l'entreprise courante est la Direction elle-même", async () => {
    departements = { statut: 200, corps: { client: "fictive-sa", departements: [{ ...SERVICES[0], companyId: MARKETING, courant: true }, SERVICES[2]] } };
    const c = await ouvrir();
    expect(parTexte(c, "span", "Coordinateur général (Direction) : il transmet aux départements")).toBeTruthy();
  });

  it("s'affiche depuis un département (comportement conservé)", async () => {
    const c = await ouvrir();
    expect(parTexte(c, "span", "Coordinateur général (Direction) : il transmet aux départements")).toBeTruthy();
  });
});
