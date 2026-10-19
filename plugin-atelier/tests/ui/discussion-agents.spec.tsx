// @vitest-environment jsdom
/**
 * Actions `agents` et `ouvrir` étendu du Coordinateur dans la Discussion.
 * Point de sécurité critique : AUCUNE écriture (POST pause/resume) avant le clic sur « Confirmer », ni au montage ni
 * après une relecture ; au clic, relecture puis écriture seulement sur les agents qui changent vraiment d'état.
 */
import { useState } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionDiscussion } from "../../src/serveur/discussion-actions.js";
import type { DepartementDeclare } from "../../src/contrats/departements.js";
import { GererLesAgents } from "../../src/ui/composants/agents-en-service.js";
import { ActionsMessage, cheminOuvrir, cleAction, usePrefixesServices } from "../../src/ui/discussion-telecommande.js";
import { oublierDepartements } from "../../src/ui/departements-sonde.js";
import { cliquer, installerPont, parTexte, rendre, type Pont, type Rendu } from "./pont.js";

const DIR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LOG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const MKT = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SERVICES: DepartementDeclare[] = [
  { companyId: DIR, slug: "direction", nom: "Direction", estDirection: true, courant: true },
  { companyId: LOG, slug: "logistique", nom: "Logistique", estDirection: false, courant: false },
  { companyId: MKT, slug: "marketing", nom: "Marketing", estDirection: false, courant: false },
];
const PREFIXES = new Map([[DIR, "DIR"], [LOG, "LOG"], [MKT, "MKT"]]);

const ag = (id: string, name: string, status: string, role = "general") => ({ id, name, status, role, title: null, reportsTo: null, adapterType: "claude_local" });
const AGENTS_PAR_DEFAUT = () => ({
  [DIR]: [ag("jarvis", "Jarvis", "idle", "ceo"), ag("d1", "Veille Direction", "idle")],
  [LOG]: [ag("l1", "Alice Stock", "idle"), ag("l2", "Bruno Transport", "running"), ag("l3", "Chloé Douane", "paused"), ag("l4", "Coord Logistique", "idle", "ceo")],
  [MKT]: [ag("m1", "Marie Contenu", "paused"), ag("m2", "Marc Social", "paused")],
});

let pont: Pont;
let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string }> = [];
let agents: Record<string, Array<Record<string, unknown>>> = {};
let refus: Record<string, { statut: number; message: string }> = {};
/** Nombre de lectures d'agents à faire échouer avant de répondre normalement. */
let lecturesEnEchec = 0;
/** Appelé à chaque lecture d'agents (permet de changer l'état entre l'affichage et le clic). */
let surLecture: (() => void) | null = null;

const posts = () => appels.filter((a) => a.methode === "POST").map((a) => a.url.replace("/api", ""));
const lectures = () => appels.filter((a) => a.methode === "GET" && /\/agents$/.test(a.url)).length;

beforeEach(() => {
  pont = installerPont("/DIR/atelier/discussion");
  oublierDepartements();
  appels = [];
  agents = AGENTS_PAR_DEFAUT();
  refus = {};
  lecturesEnEchec = 0;
  surLecture = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      const methode = init?.method ?? "GET";
      appels.push({ methode, url });
      if (methode === "GET" && url === "/api/companies") return new Response(JSON.stringify([{ id: DIR, name: "C · Direction", issuePrefix: "DIR" }, { id: LOG, name: "C · Logistique", issuePrefix: "LOG" }, { id: MKT, name: "C · Marketing", issuePrefix: "MKT" }]), { status: 200 });
      if (methode === "GET" && url.includes("/departements?")) return new Response(JSON.stringify({ client: "C", departements: SERVICES }), { status: 200 });
      const lecture = /^\/api\/companies\/([^/]+)\/agents$/.exec(url);
      if (methode === "GET" && lecture) {
        surLecture?.();
        if (lecturesEnEchec > 0) {
          lecturesEnEchec--;
          return new Response(JSON.stringify({ error: "hôte indisponible" }), { status: 503 });
        }
        return new Response(JSON.stringify(agents[lecture[1]!] ?? []), { status: 200 });
      }
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

type Agents = Extract<ActionDiscussion, { type: "agents" }>;
const couper = (service: string, noms?: string[]): Agents => ({ type: "agents", operation: "couper", service, ...(noms ? { agents: noms } : {}) });
const allumer = (service: string, noms?: string[]): Agents => ({ type: "agents", operation: "allumer", service, ...(noms ? { agents: noms } : {}) });

/** Hôte minimal : garde `faits` comme la Discussion (clé `idMessage:cleAction`). */
function Hote({ actions, services = SERVICES, prefixes = PREFIXES }: { actions: ActionDiscussion[]; services?: DepartementDeclare[] | null; prefixes?: ReadonlyMap<string, string> }) {
  const [faits, setFaits] = useState<Record<string, string>>({});
  return <ActionsMessage idMessage="m1" actions={actions} elements={new Map()} faits={faits} onFait={(cle, m) => setFaits((f) => ({ ...f, [cle]: m }))} services={services} prefixes={prefixes} />;
}
async function monter(actions: ActionDiscussion[], o: { services?: DepartementDeclare[] | null; prefixes?: ReadonlyMap<string, string> } = {}) {
  rendu = await rendre(<Hote actions={actions} {...o} />);
  await act(async () => {});
  return rendu.conteneur;
}
const confirmer = (c: ParentNode) => parTexte(c, "button", "Confirmer") as HTMLButtonElement;

describe("carte agents : aucune écriture avant le clic", () => {
  it("monter la carte ne fait que des lectures (aucun POST), couper comme allumer, service précis comme « tous »", async () => {
    for (const action of [couper("logistique"), allumer("logistique"), couper("tous"), allumer("tous", ["Marie Contenu"])]) {
      appels = [];
      const c = await monter([action]);
      expect(lectures()).toBeGreaterThan(0);
      expect(posts()).toEqual([]);
      expect(c.textContent).toMatch(/Couper|Allumer/);
      rendu!.demonter();
      rendu = null;
    }
  });

  it("une lecture en échec puis « Réessayer » (relecture) ne fait toujours aucun POST", async () => {
    lecturesEnEchec = 1;
    const c = await monter([couper("logistique")]);
    expect(c.textContent).toContain("Lecture des agents impossible");
    expect(c.textContent).toContain("hôte indisponible");
    expect(posts()).toEqual([]);
    await cliquer(parTexte(c, "button", "Réessayer"));
    await act(async () => {});
    expect(c.textContent).toContain("Couper 3 agents de Logistique");
    expect(posts()).toEqual([]);
  });

  it("le remontage de la carte (relecture complète) ne fait aucun POST non plus", async () => {
    await monter([couper("logistique")]);
    rendu!.demonter();
    rendu = null;
    await monter([couper("logistique")]);
    expect(posts()).toEqual([]);
  });
});

describe("carte agents : effet calculé et confirmation", () => {
  it("affiche l'effet calculé (agents qui changent d'état) avec leurs noms et un seul bouton Confirmer", async () => {
    const c = await monter([couper("logistique")]);
    // Chloé est déjà en pause : seuls Alice, Bruno et le coordinateur du service sont coupés.
    expect(c.textContent).toContain("Couper 3 agents de Logistique");
    expect(c.textContent).toContain("Alice Stock, Bruno Transport, Coord Logistique");
    expect(c.textContent).not.toContain("Chloé Douane");
    expect(c.querySelectorAll("button")).toHaveLength(1);
    expect(confirmer(c).getAttribute("data-variante")).toBe("danger");
  });

  it("au clic : relecture puis POST pause seulement vers les bons agents (pas ceux déjà en pause)", async () => {
    const c = await monter([couper("logistique")]);
    const avant = lectures();
    await cliquer(confirmer(c));
    await act(async () => {});
    expect(lectures()).toBeGreaterThan(avant);
    expect(posts().sort()).toEqual(["/agents/l1/pause", "/agents/l2/pause", "/agents/l4/pause"]);
    expect(c.textContent).toContain("3 coupés");
    expect(parTexte(c, "[role=status]", "3 coupés")).not.toBeNull();
    expect(c.textContent).not.toContain("Confirmer");
  });

  it("l'effet est recalculé à la relecture du clic : un agent déjà coupé entre-temps n'est pas retouché", async () => {
    const c = await monter([couper("logistique", ["Alice Stock", "Bruno Transport"])]);
    expect(c.textContent).toContain("Couper 2 agents de Logistique");
    // Entre l'affichage et le clic, quelqu'un met Alice en pause.
    (agents[LOG]!.find((a) => a.id === "l1") as { status: string }).status = "paused";
    await cliquer(confirmer(c));
    await act(async () => {});
    expect(posts()).toEqual(["/agents/l2/pause"]);
    expect(c.textContent).toContain("1 coupé");
  });

  it("allumer : bouton sobre (pas de style d'alerte) et POST resume seulement vers les agents en pause", async () => {
    const c = await monter([allumer("logistique")]);
    expect(c.textContent).toContain("Allumer 1 agent de Logistique");
    expect(confirmer(c).getAttribute("data-variante")).toBeNull();
    await cliquer(confirmer(c));
    await act(async () => {});
    expect(posts()).toEqual(["/agents/l3/resume"]);
    expect(c.textContent).toContain("1 allumé");
  });

  it("rapproche les noms sans casse et affiche les introuvables", async () => {
    const c = await monter([couper("logistique", ["alice STOCK", "  bruno transport ", "Zoé Fantôme"])]);
    expect(c.textContent).toContain("Couper 2 agents de Logistique");
    expect(c.textContent).toContain("1 nom introuvable");
    expect(c.querySelector("details")!.textContent).toContain("Zoé Fantôme");
    await cliquer(confirmer(c));
    await act(async () => {});
    expect(posts().sort()).toEqual(["/agents/l1/pause", "/agents/l2/pause"]);
  });

  it("aucun agent concerné : message clair et pas de bouton", async () => {
    const c = await monter([couper("marketing")]);
    expect(c.textContent).toContain("Rien à couper de Marketing");
    expect(c.querySelector("button")).toBeNull();
    expect(posts()).toEqual([]);
  });

  it("service inconnu : « service introuvable », aucun bouton, aucune lecture d'agents", async () => {
    const c = await monter([couper("compta")]);
    expect(c.textContent).toContain("Service introuvable");
    expect(c.querySelector("button")).toBeNull();
    expect(lectures()).toBe(0);
    expect(posts()).toEqual([]);
  });

  it("client sans services déclarés : service introuvable", async () => {
    const c = await monter([couper("logistique")], { services: null });
    expect(c.textContent).toContain("Service introuvable");
    expect(lectures()).toBe(0);
  });

  it("« tous » : tous les services, mais jamais le ceo de la Direction (le Coordinateur général)", async () => {
    const c = await monter([couper("tous")]);
    expect(c.textContent).toContain("de tous les services");
    expect(c.textContent).not.toContain("Jarvis");
    await cliquer(confirmer(c));
    await act(async () => {});
    // Veille Direction + 3 de Logistique (dont le ceo du SERVICE Logistique) ; Marketing déjà en pause ; pas Jarvis.
    expect(posts().sort()).toEqual(["/agents/d1/pause", "/agents/l1/pause", "/agents/l2/pause", "/agents/l4/pause"]);
    expect(posts()).not.toContain("/agents/jarvis/pause");
  });

  it("« direction » : le service Direction est coupé, jamais son ceo (le chat ne se coupe pas lui-même)", async () => {
    const c = await monter([couper("direction")]);
    expect(c.textContent).not.toContain("Jarvis");
    await cliquer(confirmer(c));
    await act(async () => {});
    expect(posts()).toEqual(["/agents/d1/pause"]);
  });

  it("« tous » avec un nom : Jarvis nommé n'est pas coupé (introuvable parmi les agents visés)", async () => {
    const c = await monter([couper("tous", ["Jarvis"])]);
    expect(c.textContent).toContain("1 nom introuvable");
    expect(c.querySelector("button")).toBeNull();
    expect(posts()).toEqual([]);
  });

  it("un refus de l'API est affiché avec son message, les autres agents sont traités", async () => {
    refus = { l2: { statut: 403, message: "Droits insuffisants sur Bruno" } };
    const c = await monter([couper("logistique")]);
    await cliquer(confirmer(c));
    await act(async () => {});
    expect(posts()).toHaveLength(3);
    expect(c.textContent).toContain("2 coupés, 1 refusé");
    expect(c.textContent).toContain("Bruno Transport : Droits insuffisants sur Bruno");
  });

  it("carte « faite » : clé cleAction, plus de bouton, message de bilan conservé après relecture du parent", async () => {
    const action = couper("logistique");
    expect(cleAction(action)).toBe("agents:couper:logistique:");
    const c = await monter([action]);
    await cliquer(confirmer(c));
    await act(async () => {});
    expect(c.querySelector("button")).toBeNull();
    expect(c.textContent).toContain("3 coupés");
    expect(posts()).toHaveLength(3);
  });

  it("le clic ne part qu'une fois (bouton désactivé pendant l'envoi)", async () => {
    const c = await monter([couper("logistique")]);
    const b = confirmer(c);
    await act(async () => {
      b.click();
      b.click();
    });
    await act(async () => {});
    expect(posts()).toHaveLength(3);
  });
});

describe("carte agents : le clic n'agit jamais sur un agent non affiché", () => {
  it("agrandissement entre l'affichage et le clic : aucun POST, affichage mis à jour, nouvelle confirmation demandée", async () => {
    const c = await monter([allumer("logistique")]);
    expect(c.textContent).toContain("Allumer 1 agent de Logistique");
    expect(c.textContent).toContain("Chloé Douane");
    // Deux autres agents passent en pause (mise en pause à la main) hors de la vue de l'humain.
    for (const a of agents[LOG]!) if (a.id === "l1" || a.id === "l2") Object.assign(a, { status: "paused", pauseReason: "manual" });
    await cliquer(confirmer(c));
    await act(async () => {});
    expect(posts()).toEqual([]);
    expect(c.textContent).toContain("La situation a changé, vérifiez et confirmez à nouveau");
    expect(c.textContent).toContain("Allumer 3 agents de Logistique");
    expect(c.textContent).toContain("Alice Stock");
    // Après affichage des nouvelles cibles, la confirmation suivante agit sur elles.
    await cliquer(confirmer(c));
    await act(async () => {});
    expect(posts().sort()).toEqual(["/agents/l1/resume", "/agents/l2/resume", "/agents/l3/resume"]);
  });

  it("allumer : une pause pour budget ou entreprise archivée n'est pas rallumée, le motif des autres est affiché", async () => {
    Object.assign(agents[LOG]!.find((a) => a.id === "l3")!, { pauseReason: "manual" });
    Object.assign(agents[MKT]!.find((a) => a.id === "m1")!, { pauseReason: "budget" });
    Object.assign(agents[MKT]!.find((a) => a.id === "m2")!, { pauseReason: "company_archived" });
    const c = await monter([allumer("tous")]);
    expect(c.textContent).toContain("Allumer 1 agent de tous les services");
    expect(c.textContent).toContain("Chloé Douane (mise en pause à la main)");
    expect(c.textContent).toContain("2 agents non rallumés : budget atteint, entreprise archivée");
    await cliquer(confirmer(c));
    await act(async () => {});
    expect(posts()).toEqual(["/agents/l3/resume"]);
  });

  it("noms groupés par service : deux homonymes de services différents restent distinguables", async () => {
    agents[LOG]!.push(ag("l9", "Marie Contenu", "paused"));
    const c = await monter([allumer("tous", ["Marie Contenu"])]);
    expect(c.textContent).toContain("Logistique : Marie Contenu");
    expect(c.textContent).toContain("Marketing : Marie Contenu");
  });

  it("ancienne carte (message précédent) : aucune lecture, aucun bouton, aucun POST", async () => {
    function HoteAncien() {
      const [faits, setFaits] = useState<Record<string, string>>({});
      return <ActionsMessage idMessage="m0" actions={[couper("tous")]} elements={new Map()} faits={faits} onFait={(cle, m) => setFaits((f) => ({ ...f, [cle]: m }))} services={SERVICES} prefixes={PREFIXES} actionnable={false} />;
    }
    rendu = await rendre(<HoteAncien />);
    await act(async () => {});
    const c = rendu.conteneur;
    expect(c.textContent).toContain("Action d'un message précédent");
    expect(c.querySelector("button")).toBeNull();
    expect(lectures()).toBe(0);
    expect(posts()).toEqual([]);
  });

  it("services filtrés comme le tiroir : un service d'un autre client de l'instance n'est jamais visé", async () => {
    const AUTRE = "99999999-9999-4999-8999-999999999999";
    const services = [...SERVICES, { companyId: AUTRE, slug: "compta", nom: "Compta", estDirection: false, courant: false }];
    agents[AUTRE] = [ag("x1", "Intrus", "idle")];
    const entreprises = [{ id: DIR, name: "C · Direction", issuePrefix: "DIR" }, { id: LOG, name: "C · Logistique", issuePrefix: "LOG" }, { id: MKT, name: "C · Marketing", issuePrefix: "MKT" }, { id: AUTRE, name: "Autre · Compta", issuePrefix: "AUT" }];
    const reel = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string }) => (url === "/api/companies" && (init?.method ?? "GET") === "GET" ? new Response(JSON.stringify(entreprises), { status: 200 }) : reel(url, init as RequestInit))));
    const c = await monter([couper("tous")], { services });
    expect(c.textContent).not.toContain("Intrus");
    await cliquer(confirmer(c));
    await act(async () => {});
    expect(posts()).not.toContain("/agents/x1/pause");
    expect(posts().length).toBeGreaterThan(0);
  });
});

describe("ouvrir : service, section et tiroir des agents", () => {
  it("organigramme + service mène à l'ancre #service=", async () => {
    const c = await monter([{ type: "ouvrir", cible: "organigramme", service: "logistique" }]);
    await cliquer(parTexte(c, "a", "Voir l'organigramme"));
    expect(pont.navigations).toEqual(["/atelier/organigramme#service=logistique"]);
  });

  it("prospects + service ouvre l'écran dans l'entreprise du service (préfixe du service), filtre conservé", async () => {
    const c = await monter([{ type: "ouvrir", cible: "prospects", service: "marketing", filtre: { statut: "qualifie" } }]);
    await cliquer(parTexte(c, "a", "Voir les prospects"));
    expect(pont.navigations).toHaveLength(1);
    expect(pont.navigations[0]).toMatch(/^\/MKT\/atelier\/prospects\?/);
    expect(pont.navigations[0]).toContain("qualifie");
  });

  it("autre cible + service (rapport) : préfixe du service ; service inconnu ou préfixe encore inconnu : pas de bouton", async () => {
    let c = await monter([{ type: "ouvrir", cible: "rapport", service: "logistique" }]);
    await cliquer(parTexte(c, "a", "Voir le rapport du mois"));
    expect(pont.navigations).toEqual(["/LOG/atelier/rapport"]);
    rendu!.demonter();
    c = await monter([{ type: "ouvrir", cible: "rapport", service: "compta" }]);
    expect(c.querySelector("a")).toBeNull();
    rendu!.demonter();
    c = await monter([{ type: "ouvrir", cible: "rapport", service: "logistique" }], { prefixes: new Map() });
    expect(c.querySelector("a")).toBeNull();
  });

  it("parametres + section mène à l'ancre #param-", async () => {
    const c = await monter([{ type: "ouvrir", cible: "parametres", section: "depenses" }]);
    await cliquer(parTexte(c, "a", "Voir les paramètres"));
    expect(pont.navigations).toEqual(["/atelier/parametres#param-depenses"]);
  });

  it("nouvelles cibles sans service : chemins directs ; la clé d'action distingue service et section", () => {
    expect(cheminOuvrir({ type: "ouvrir", cible: "departements" })).toBe("/atelier/departements");
    expect(cheminOuvrir({ type: "ouvrir", cible: "echanges" })).toBe("/atelier/echanges");
    expect(cleAction({ type: "ouvrir", cible: "rapport", service: "a" })).not.toBe(cleAction({ type: "ouvrir", cible: "rapport", service: "b" }));
    expect(cleAction({ type: "ouvrir", cible: "parametres", section: "sources" })).not.toBe(cleAction({ type: "ouvrir", cible: "parametres", section: "modeles" }));
  });

  it("la cible agents ouvre le tiroir « Agents en service »", async () => {
    rendu = await rendre(
      <>
        <GererLesAgents companyId={DIR} />
        <Hote actions={[{ type: "ouvrir", cible: "agents" }]} />
      </>,
    );
    expect(rendu.conteneur.querySelector('[role="dialog"]')).toBeNull();
    await cliquer(parTexte(rendu.conteneur, "button", "Voir les agents en service"));
    await act(async () => {});
    const dialogue = rendu.conteneur.querySelector('[role="dialog"]');
    expect(dialogue).not.toBeNull();
    expect(dialogue!.textContent).toContain("Agents en service");
    expect(posts()).toEqual([]);
  });

  it("les préfixes des services ne sont lus que si une action le demande", async () => {
    function Sonde({ actions }: { actions: ActionDiscussion[] }) {
      usePrefixesServices(SERVICES, [{ actions }]);
      return null;
    }
    const lecturesEntreprises = () => appels.filter((a) => a.url === "/api/companies").length;
    rendu = await rendre(<Sonde actions={[{ type: "ouvrir", cible: "prospects" }, { type: "ouvrir", cible: "organigramme", service: "logistique" }]} />);
    await act(async () => {});
    expect(lecturesEntreprises()).toBe(0);
    rendu.demonter();
    rendu = await rendre(<Sonde actions={[{ type: "ouvrir", cible: "rapport", service: "logistique" }]} />);
    await act(async () => {});
    expect(lecturesEntreprises()).toBe(1);
  });
});
