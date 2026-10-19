// @vitest-environment jsdom
/** Onglet Équipe pour un client : « Comment travaille l'équipe » en tête, fiche lisible d'un agent à son ouverture. */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentVue, VueEquipe } from "../../src/contrats/ui.js";
import { FICHES_AGENTS_MARKETING } from "../../src/contrats/fiches-agents-marketing.js";
import { PageAtelier } from "../../src/ui/index.js";
import { ENTREPRISE, installerPont, rendre, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
let n = 0;
const agentDe = (slug: string): AgentVue => {
  const f = FICHES_AGENTS_MARKETING.find((x) => x.slug === slug)!;
  return {
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, nom: f.nom, role: "general", titre: f.pole ? `Pôle ${f.pole} · ${f.role}` : f.role,
    statutNatif: "paused", pauseRaison: "import", adaptateur: "claude_local", etatConnexion: "configure_non_verifie", mode: "demonstration", rapporteA: null,
    tacheEnCours: null, runActifId: null, competences: [{ cle: "x", empreinte: null, source: "configuration" }], blocages: [],
  };
};
const AGENTS = FICHES_AGENTS_MARKETING.map((f) => agentDe(f.slug));
const equipe = (agents: AgentVue[]): VueEquipe => ({ agents, runsActifs: 0, plafondRunsActifs: 3, echangesRecents: [], dependances: [] });

let pont: Pont;
let rendu: Rendu | null = null;
beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});
async function ouvrir(agents: AgentVue[], agentId: string | null = null) {
  pont = installerPont(agentId ? `/RNO/atelier/equipe/${agentId}` : "/RNO/atelier/equipe");
  pont.donnees["atelier.equipe"] = { data: equipe(agents), loading: false, error: null };
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  return rendu.conteneur;
}

describe("Comment travaille l'équipe", () => {
  it("liste numérotée de 6 étapes au plus, avant la liste des agents, avec des liens vers les fiches", async () => {
    const c = await ouvrir(AGENTS);
    const titres = Array.from(c.querySelectorAll("h2")).map((h) => h.textContent);
    expect(titres.indexOf("Comment travaille l'équipe")).toBeGreaterThanOrEqual(0);
    expect(titres.indexOf("Comment travaille l'équipe")).toBeLessThan(titres.indexOf("Agents"));
    const etapes = c.querySelectorAll("ol.atl-trajet-liste > li");
    expect(etapes.length).toBeGreaterThan(0);
    expect(etapes.length).toBeLessThanOrEqual(6);
    const liens = Array.from(c.querySelectorAll("ol.atl-trajet-liste a")).map((a) => a.textContent);
    expect(liens).toEqual(expect.arrayContaining(["Coordinateur", "Conformité publicitaire", "Relecteur", "Porte"]));
    const lienCoord = Array.from(c.querySelectorAll("ol.atl-trajet-liste a")).find((a) => a.textContent === "Coordinateur")!;
    expect(lienCoord.getAttribute("href")).toContain(`/equipe/${AGENTS[0]!.id}`);
  });

  it("« Ce qui reste toujours humain » et « Conformité » reprennent les listes du registre", async () => {
    const c = await ouvrir(AGENTS);
    const texte = c.textContent!;
    expect(texte).toContain("Ce qui reste toujours humain");
    expect(texte).toContain("Publication réelle sur un canal externe");
    expect(texte).toContain("Budget publicitaire engagé");
    expect(texte).toContain("Conformité");
    expect(texte).toContain("RGPD");
    expect(texte).toContain("livre XII");
    expect(texte).toContain("FSMA");
  });

  it("absent quand aucun agent marketing n'est reconnu", async () => {
    const autre = { ...agentDe("veille"), nom: "Agent inconnu" };
    const c = await ouvrir([autre]);
    expect(c.textContent).not.toContain("Comment travaille l'équipe");
  });
});

describe("fiche d'un agent", () => {
  it("le Coordinateur : mission, reçoit, livre, compétences nommées et expliquées, interdits, pourquoi", async () => {
    const coord = AGENTS[0]!;
    const c = await ouvrir(AGENTS, coord.id);
    const fiche = c.querySelector(".atl-fiche")!;
    expect(fiche).not.toBeNull();
    const titres = Array.from(fiche.querySelectorAll("h3")).map((h) => h.textContent);
    expect(titres).toEqual(["Son rôle et sa mission", "Ce qu'il reçoit", "Ce qu'il livre", "Ses compétences", "Ce qu'il n'a pas le droit de faire", "Pourquoi cet agent"]);
    const f = FICHES_AGENTS_MARKETING[0]!;
    expect(fiche.textContent).toContain(f.mission);
    expect(fiche.textContent).toContain("brief structuré");
    expect(fiche.textContent).toContain("dossier de validation humaine");
    const dt = Array.from(fiche.querySelectorAll(".atl-fiche-comp dt")).map((e) => e.textContent);
    expect(dt.length).toBe(f.competences.length);
    expect(dt.some((t) => t!.startsWith("Cadrage et extraction des exigences"))).toBe(true);
    const dd = fiche.querySelector(".atl-fiche-comp dd")!.textContent!;
    expect(dd).toContain("Transforme une demande marketing en brief structuré");
    expect(fiche.textContent).toContain("Aucune publication, aucun envoi, aucune dépense");
    expect(fiche.textContent).toContain("Toujours réservé à l'humain");
    expect(fiche.textContent).toContain(f.pourquoi);
    // Le détail technique reste disponible, replié.
    const tech = fiche.querySelector("details.atl-fiche-tech") as HTMLDetailsElement;
    expect(tech.open).toBe(false);
    expect(tech.textContent).toContain("Adaptateur");
  });

  it("la Porte n'a aucune compétence : le dit en clair ; un agent sans interdit propre le dit aussi", async () => {
    const porte = AGENTS.find((a) => a.nom === "Porte")!;
    const c = await ouvrir(AGENTS, porte.id);
    expect(c.querySelector(".atl-fiche")!.textContent).toContain("Aucune : cet agent est un programme de contrôle");
    const mesure = AGENTS.find((a) => a.nom === "Mesure")!;
    rendu!.demonter();
    const c2 = await ouvrir(AGENTS, mesure.id);
    expect(c2.querySelector(".atl-fiche")!.textContent).toContain("Ses consignes ne fixent pas d'interdit qui lui soit propre");
  });

  it("un agent sans fiche garde le détail d'avant (Rôle, Rattaché à, Compétences)", async () => {
    const inconnu = { ...agentDe("veille"), nom: "Agent inconnu", titre: "Autre" };
    const c = await ouvrir([inconnu], inconnu.id);
    expect(c.querySelector(".atl-fiche")).toBeNull();
    expect(c.textContent).toContain("Rattaché à");
    expect(c.textContent).toContain("Adaptateur");
  });
});
