// @vitest-environment jsdom
/**
 * Cartes traitées sur place (`SurPlace`) : avis quand l'agent destinataire de la réponse est en pause (HUM-C2). Le socle
 * rejoue la réponse à la reprise de l'agent ; la personne le sait avant de répondre. Lectures natives servies par un
 * `fetch` simulé.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SurPlace } from "../../src/ui/accueil-sur-place.js";
import { memoriserTache } from "../../src/ui/hote.js";
import { installerPont, rendre, type Rendu } from "./pont.js";

const AVIS = "Le destinataire est en pause, votre réponse sera traitée à sa reprise.";
const INTERACTION = { invite: "Lancer l'envoi ?", details: null, libelleAccepter: null, libelleRefuser: null, refusRaisonObligatoire: false, natifSeulement: false };
const E_QUESTIONS = { id: "question:i1", type: "information_manquante", urgence: "haute", titre: "Question", raison: "Il manque une information.", lien: "/issues/DEM-9", action: "Répondre", issueId: "iss-9",
  interaction: { ...INTERACTION, id: "i1", kind: "ask_user_questions", questions: [] } };
const E_CONFIRMATION = { ...E_QUESTIONS, id: "question:i2", interaction: { ...INTERACTION, id: "i2", kind: "request_confirmation", questions: [] } };

let rendu: Rendu | null = null;
let statutAgent: string;

beforeEach(() => {
  installerPont("/RNO/atelier/discussion");
  statutAgent = "paused";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/issues/iss-9") return new Response(JSON.stringify({ id: "iss-9", assigneeAgentId: "ag-1" }), { status: 200 });
      if (url === "/api/issues/iss-10") return new Response(JSON.stringify({ id: "iss-10", assigneeAgentId: null }), { status: 200 });
      if (url === "/api/agents/ag-1") return new Response(JSON.stringify({ id: "ag-1", status: statutAgent }), { status: 200 });
      return new Response("{}", { status: 404 });
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

async function afficher(element: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rendu = await rendre(createElement(SurPlace, { element: element as any, onFait: () => undefined }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return rendu.conteneur.textContent ?? "";
}

describe("carte sur place : destinataire en pause (HUM-C2)", () => {
  it("questions : l'avis s'affiche avant la réponse quand l'agent assigné est en pause", async () => {
    const texte = await afficher(E_QUESTIONS);
    expect(texte).toContain(AVIS);
    expect(rendu!.conteneur.querySelector('[role="status"]')?.textContent).toBe(AVIS);
  });

  it("confirmation : même avis", async () => {
    expect(await afficher(E_CONFIRMATION)).toContain(AVIS);
  });

  it("agent actif ou tâche sans agent assigné : aucun avis", async () => {
    statutAgent = "idle";
    expect(await afficher(E_CONFIRMATION)).not.toContain(AVIS);
    rendu?.demonter();
    expect(await afficher({ ...E_QUESTIONS, issueId: "iss-10" })).not.toContain(AVIS);
  });

  it("la tâche lue par un autre emplacement il y a moins de 15 s n'est pas relue", async () => {
    memoriserTache("/issues/iss-11", { id: "iss-11", assigneeAgentId: "ag-1" });
    expect(await afficher({ ...E_CONFIRMATION, issueId: "iss-11" })).toContain(AVIS);
    expect(vi.mocked(fetch).mock.calls.map((c) => c[0])).toEqual(["/api/agents/ag-1"]);
  });
});
