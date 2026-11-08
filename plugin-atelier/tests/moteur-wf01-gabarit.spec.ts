// Chaîne de prospection WF-01 : gabarit en dix étapes, et contrôle des exclusions sans blocage par opposition
// (décision de l'opérateur : les oppositions sont facultatives et ne bloquent jamais ; elles marquent seulement le prospect).
import { describe, expect, it } from "vitest";
import { ExclureProspectEntree, MotifExclusion, type Empreinte, type Prospect } from "../src/contrats/index.js";
import { chargerGabarit } from "../src/moteur/gabarits.js";
import { exclusionsProspect, figureDansOppositions, type ContexteProspection } from "../src/serveur/regles-prospection.js";

const CHAINE = [
  ["valider_perimetre", "code"],
  ["collecter", "agent"],
  ["dedupliquer", "code"],
  ["qualifier", "agent"],
  ["enrichir", "agent"],
  ["controler_exclusions", "code"],
  ["produire_lot", "agent"],
  ["carte_groupee", "code"],
  ["export_crm", "code"],
  ["verifier", "code"],
] as const;

describe("gabarit wf-01-prospection", () => {
  const g = chargerGabarit("wf-01-prospection");

  it("se charge avec ses dix étapes, dans l'ordre", () => {
    expect(g.etapes.map((e) => e.rang)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(g.etapes.map((e) => [e.action, e.nature ?? "agent"])).toEqual(CHAINE);
  });

  it("chaque étape porte un rôle et un contrat ; le dépôt n'est jamais public sans porte", () => {
    for (const e of g.etapes) {
      expect(e.role.length).toBeGreaterThan(0);
      expect(e.contratId.length).toBeGreaterThan(0);
    }
    expect(g.typeLivrable).toBe("interne");
  });
});

/* ------------------------------------------------------------------ */
/* Exclusions : l'opposition ne bloque pas                              */
/* ------------------------------------------------------------------ */

const T = "2026-10-15T10:00:00+02:00";
const h = (n: number) => n.toString(16).padStart(64, "0");
const CHIFFRE = "chv1.0123456789abcdef.AAAAAAAAAAAAAAAA.Q2hpZmZyZQ.AAAAAAAAAAAAAAAAAAAAAA";
const EMPREINTE_COURRIEL = h(1);

function prospect(zone: Prospect["zone"]): Prospect {
  return {
    id: "00000000-0000-4000-8000-000000000001", companyId: "00000000-0000-4000-8000-000000000099", campagneId: null,
    cible: "entreprise", identifiant: { type: "empreinte", valeur: h(100) }, numeroBce: "0123.456.749",
    referentiel: { version: 1, entite: null, offres: [], segments: [], etablissement: null, cibleProspection: null },
    forme: "personne_morale", denomination: "Toitures Fictives SRL", nomChiffre: null, nace: [], zone,
    coordonnees: [{ canal: "courriel", valeur: CHIFFRE, empreinte: EMPREINTE_COURRIEL, nature: "impersonnelle" }],
    empreintes: [{ type: "nom_code_postal", valeur: h(4) }],
    sources: [{ type: "import", sourceId: null, service: null, outil: null, url: null, collecteLe: T }],
    mode: "reel", statut: "nouveau", motifsExclusion: [], score: null, basesLegales: [], particulier: null, creeLe: T, modifieLe: T,
  };
}

const contexte = (zone: ContexteProspection["zone"]): ContexteProspection => ({ maintenant: T, modeCampagne: "reel", canaux: [], zone, clientsActuels: [] });
const LIEGE: Prospect["zone"] = { codePostal: "4000", commune: "Liège", province: "Liège", region: "Wallonie", pays: "BE" };
const motifs = (p: Prospect, zone: ContexteProspection["zone"]) => exclusionsProspect(p, contexte(zone)).map((m) => m.motif);

describe("contrôle des exclusions de la chaîne WF-01", () => {
  const OPPOSITIONS: Empreinte[] = [{ type: "courriel", valeur: EMPREINTE_COURRIEL }];

  it("l'ancien motif opposition_client (gardé pour les fiches anciennes) ne peut plus être posé", () => {
    const entree = { companyId: "00000000-0000-4000-8000-000000000099", prospectId: "00000000-0000-4000-8000-000000000001", motif: "opposition_client", detail: "Opposition du client." };
    expect(MotifExclusion.safeParse("opposition_client").success).toBe(true);
    expect(ExclureProspectEntree.safeParse(entree).success).toBe(false);
  });

  it("un prospect hors zone est écarté", () => {
    expect(motifs(prospect(LIEGE), { regions: ["Flandre"] })).toEqual(["hors_zone"]);
  });

  it("un prospect dont une coordonnée figure dans la liste d'opposition n'est pas écarté, il est seulement marqué", () => {
    const p = prospect(LIEGE);
    expect(motifs(p, { regions: ["Wallonie"] })).toEqual([]);
    expect(figureDansOppositions(p, OPPOSITIONS)).toBe(true);
    expect(figureDansOppositions(p, [])).toBe(false);
  });
});
