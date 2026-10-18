/**
 * Logique pure de la vue « Organigramme » : arbre selon `reportsTo`, statuts en texte, flux et voisins d'un service, filtre.
 */
import { describe, expect, it } from "vitest";
import type { FluxServiceLu } from "../src/contrats/departements.js";
import { agentsDepuisHote, compterStatuts, construireArbre, coordinateurDe, filtrerService, libelleStatutAgent, liensDuService, normaliser, type AgentHote, type NoeudAgent } from "../src/ui/organigramme-arbre.js";

const agent = (id: string, name: string, o: Partial<AgentHote> = {}): AgentHote => ({ id, name, role: "general", title: null, status: "idle", reportsTo: null, adapterType: "claude_local", ...o });
const noms = (n: NoeudAgent[]): unknown[] => n.map((x) => (x.enfants.length ? [x.agent.name, noms(x.enfants)] : x.agent.name));

describe("construireArbre", () => {
  it("range les agents selon reportsTo, coordinateur en tête, puis ordre alphabétique", () => {
    const a = [
      agent("z", "Zoé", { reportsTo: "c" }),
      agent("a", "Alice", { reportsTo: "c" }),
      agent("s", "Sous-Alice", { reportsTo: "a" }),
      agent("c", "Coordinateur SAV", { role: "ceo" }),
    ];
    expect(noms(construireArbre(a))).toEqual([["Coordinateur SAV", [["Alice", ["Sous-Alice"]], "Zoé"]]]);
  });

  it("un supérieur absent du service fait de l'agent une racine, sans le perdre", () => {
    const arbre = construireArbre([agent("a", "Alice", { reportsTo: "ailleurs" }), agent("b", "Bruno")]);
    expect(noms(arbre)).toEqual(["Alice", "Bruno"]);
  });

  it("un cycle de reportsTo ne boucle pas et garde chaque agent une seule fois", () => {
    const arbre = construireArbre([agent("a", "Alice", { reportsTo: "b" }), agent("b", "Bruno", { reportsTo: "a" }), agent("c", "Cécile", { reportsTo: "c" })]);
    const tous: string[] = [];
    const parcourir = (n: NoeudAgent[]) => n.forEach((x) => (tous.push(x.agent.id), parcourir(x.enfants)));
    parcourir(arbre);
    expect(tous.sort()).toEqual(["a", "b", "c"]);
  });

  it("service vide : arbre vide", () => {
    expect(construireArbre([])).toEqual([]);
  });
});

describe("coordinateurDe", () => {
  it("prend l'agent de rôle ceo, sinon la première racine, sinon rien", () => {
    expect(coordinateurDe([agent("a", "Alice"), agent("c", "Chef", { role: "ceo" })])?.name).toBe("Chef");
    expect(coordinateurDe([agent("b", "Bruno"), agent("a", "Alice")])?.name).toBe("Alice");
    expect(coordinateurDe([])).toBeNull();
  });
});

describe("agentsDepuisHote", () => {
  it("lit un tableau ou {items}, ignore les entrées sans nom et les agents supprimés", () => {
    const brut = [{ id: "a", name: "Alice", role: "ceo", title: "T", status: "paused", reportsTo: null, adapterType: "claude_local" }, { id: "b" }, { id: "c", name: "Mort", status: "terminated" }, null];
    expect(agentsDepuisHote(brut)).toEqual([{ id: "a", name: "Alice", role: "ceo", title: "T", status: "paused", reportsTo: null, adapterType: "claude_local" }]);
    expect(agentsDepuisHote({ items: brut })).toHaveLength(1);
    expect(agentsDepuisHote(null)).toEqual([]);
  });
});

describe("statuts", () => {
  it("dit chaque statut en toutes lettres", () => {
    expect(["active", "idle", "running", "paused", "error", "pending_approval", "autre_chose"].map(libelleStatutAgent)).toEqual(["actif", "actif", "actif", "en pause", "en erreur", "en attente d'approbation", "autre chose"]);
  });
  it("compte actifs, en pause et en erreur", () => {
    expect(compterStatuts([agent("1", "a"), agent("2", "b", { status: "running" }), agent("3", "c", { status: "paused" }), agent("4", "d", { status: "error" })])).toEqual({ total: 4, actifs: 2, enPause: 1, enErreur: 1 });
  });
});

describe("liensDuService", () => {
  const f = (source: string, cible: string, objet = "o", approbationHumaine = false): FluxServiceLu => ({ source, cible, objet, approbationHumaine });
  const flux = [f("sav", "juridique", "Avis"), f("juridique", "sav", "Réponse", true), f("sav", "direction"), f("achats", "direction"), f("sav", "sav", "boucle")];

  it("sépare sortants et entrants, liste les voisins, ignore un flux d'un service vers lui-même", () => {
    const l = liensDuService(flux, "sav");
    expect(l.sortants.map((x) => x.cible)).toEqual(["direction", "juridique"]);
    expect(l.entrants.map((x) => [x.source, x.approbationHumaine])).toEqual([["juridique", true]]);
    expect([...l.voisins].sort()).toEqual(["direction", "juridique"]);
  });

  it("un service sans flux n'a aucun voisin", () => {
    const l = liensDuService(flux, "inconnu");
    expect(l.sortants).toEqual([]);
    expect(l.voisins.size).toBe(0);
  });
});

describe("filtrerService", () => {
  const agents = [agent("1", "Sinistres entreprises", { title: "SAV · Suivi" }), agent("2", "FAQ")];
  it("filtre vide : tout reste, aucun agent surligné", () => {
    expect(filtrerService("  ", "SAV", agents)).toEqual({ service: true, agents: new Set() });
  });
  it("le nom du service garde tout le service, sans accents ni casse", () => {
    expect(filtrerService("après-VENTE", "Service après-vente", agents)).toEqual({ service: true, agents: new Set() });
    expect(filtrerService("apres", "Service après-vente", agents)?.service).toBe(true);
  });
  it("un nom d'agent garde le service et surligne l'agent", () => {
    expect(filtrerService("sinistrés", "SAV", agents)).toEqual({ service: false, agents: new Set(["1"]) });
    expect(filtrerService("SINISTRES", "SAV", agents)).toEqual({ service: false, agents: new Set(["1"]) });
  });
  it("rien ne correspond : le service disparaît", () => {
    expect(filtrerService("zzz", "SAV", agents)).toBeNull();
  });
  it("normaliser retire les accents", () => {
    expect(normaliser("  Éléphant ")).toBe("elephant");
  });
});
