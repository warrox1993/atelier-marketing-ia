// @vitest-environment jsdom
/**
 * « À traiter » d'un service dans l'organigramme (UI-2) : la pastille du tableau des départements mène à la vue du
 * service, qui liste ses cartes en attente puis ses tâches bloquées, chacune avec le lien vers sa tâche.
 */
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CarteService } from "../../src/contrats/carte-decision.js";
import { ATraiterService, elementsATraiter } from "../../src/ui/organigramme-a-traiter.js";
import { cliquer, installerPont, rendre, type Rendu } from "./pont.js";

const OBS = "44444444-4444-4444-8444-444444444444";
const tache = (id: string, identifier: string, o: Record<string, unknown> = {}) => ({ id, identifier, title: `Tâche ${identifier}`, status: "blocked", companyId: OBS, ...o });
const carte = (issueId: string, companyId = OBS) =>
  ({ element: { id: `question:${issueId}`, issueId, titre: "Valider la décision", lien: "/OBS/issues/OBS-1" }, date: "", companyId, slug: "observatoire", nom: "Observatoire", tache: "OBS-1" }) as unknown as CarteService;

let rendu: Rendu | null = null;
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

describe("elementsATraiter", () => {
  it("cartes du service d'abord, puis tâches bloquées sans carte ; rien d'un autre service ni d'un autre statut", () => {
    const e = elementsATraiter(
      [tache("t1", "OBS-1"), tache("t2", "OBS-2"), tache("t3", "OBS-3", { status: "todo" }), tache("t4", "AUT-1", { companyId: "autre" })],
      [carte("t1"), carte("x", "autre")],
      OBS,
      "OBS",
    );
    expect(e.map((x) => [x.titre, x.detail, x.lien])).toEqual([
      ["Valider la décision", "Décision attendue · OBS-1", "/OBS/issues/OBS-1"],
      ["Tâche OBS-2", "Bloquée · OBS-2", "/OBS/issues/OBS-2"],
    ]);
  });

  it("réponse illisible : aucune tâche, pas d'erreur", () => {
    expect(elementsATraiter(null, [], OBS, "OBS")).toEqual([]);
    expect(elementsATraiter({ items: [tache("t2", "OBS-2")] }, [], OBS, "OBS").map((x) => x.lien)).toEqual(["/OBS/issues/OBS-2"]);
  });
});

describe("ATraiterService", () => {
  const ouvrir = async (corps: unknown, statut = 200) => {
    const appels: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (appels.push(url), new Response(JSON.stringify(corps), { status: statut }))));
    installerPont("/RNO/atelier/organigramme");
    rendu = await rendre(createElement(ATraiterService, { companyId: OBS, prefixe: "OBS" }));
    await cliquer(document.body);
    return { c: rendu.conteneur, appels };
  };

  it("lit les tâches bloquées du service et les montre en liens", async () => {
    const { c, appels } = await ouvrir([tache("t2", "OBS-2")]);
    expect(appels).toContain(`/api/companies/${OBS}/issues?status=blocked&limit=20`);
    expect(c.querySelector("h3")?.textContent).toBe("À traiter");
    // Le pont de test préfixe tout lien par l'entreprise courante ; l'hôte réel reconnaît le préfixe OBS.
    expect(Array.from(c.querySelectorAll("li a")).map((a) => [a.textContent, a.getAttribute("href")?.endsWith("/OBS/issues/OBS-2")])).toEqual([["Tâche OBS-2", true]]);
    expect(c.textContent).not.toContain("—");
  });

  it("rien à traiter ou lecture en échec : rien n'est affiché", async () => {
    expect((await ouvrir([])).c.innerHTML).toBe("");
    rendu?.demonter();
    expect((await ouvrir({ error: "x" }, 500)).c.innerHTML).toBe("");
  });
});
