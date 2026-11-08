/**
 * Moteur de missions (#49, tâche 3) : gabarits par type de livrable, revues imposées par le type, porte posée d'office.
 * Les gabarits sont lus depuis `organisation/gabarits/*.json` (importés, jamais lus sur disque à l'exécution).
 */
import { describe, expect, it } from "vitest";
import { GABARIT_LIVRABLE_PUBLIC } from "../src/contrats/index.js";
import { Gabarit, chargerGabarit, poserPorteMission, revuesImposees, type DepsPorteMission } from "../src/moteur/gabarits.js";

const SOC = "11111111-1111-4111-8111-111111111111";
const ISSUE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAMPAGNE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const valide = () => structuredClone({
  cle: "essai", version: 1, description: "Gabarit d'essai.", typeLivrable: "public",
  etapes: [{ rang: 1, role: "contenus", competences: ["charte-marque"], contratId: "wf-c-contenu", contratVersion: 1 }],
  revues: ["exigences", "metier", "technique"], conformiteSiModuleActif: true, porte: true, approbationRequise: true,
});

function doubles(conformite = false, porteNeuve = true) {
  const appels: { creerPorte: unknown[]; majPolitique: unknown[] } = { creerPorte: [], majPolitique: [] };
  const deps: DepsPorteMission = {
    creerPorte: async (p) => { appels.creerPorte.push(p); return porteNeuve; },
    majPolitique: async (issueId, companyId, politique) => { appels.majPolitique.push({ issueId, companyId, politique }); },
    resoudre: (v) => JSON.parse(JSON.stringify(v).replace(/\{\{(agent|humain):([a-z0-9-]+)\}\}/gu, (_m, g: string, n: string) => `${g}-${n}`)),
    conformiteImposee: async () => conformite,
  };
  return { deps, appels };
}

describe("chargement et schéma des gabarits", () => {
  it("charge un gabarit valide, dernière version par défaut", () => {
    const g = chargerGabarit("contenu-reseau-social");
    expect(g.typeLivrable).toBe("public");
    expect(g.etapes.length).toBeGreaterThan(0);
    expect(chargerGabarit("contenu-reseau-social", g.version)).toEqual(g);
  });

  it("refuse un gabarit inconnu ou d'une autre version", () => {
    expect(() => chargerGabarit("inexistant")).toThrow(/inconnu/u);
    expect(() => chargerGabarit("contenu-reseau-social", 999)).toThrow(/version/u);
  });

  it("accepte la forme de référence du test", () => {
    expect(Gabarit.safeParse(valide()).success).toBe(true);
  });

  it("refuse une étape sans rôle, ou dont le rôle est absent du registre", () => {
    const sansRole = valide(); delete (sansRole.etapes[0] as Partial<{ role: string }>).role;
    expect(Gabarit.safeParse(sansRole).success).toBe(false);
    const inconnu = valide(); inconnu.etapes[0]!.role = "agent-fantome";
    expect(Gabarit.safeParse(inconnu).success).toBe(false);
  });

  it("refuse une compétence que le rôle ne porte pas", () => {
    const g = valide(); g.etapes[0]!.competences = ["competence-inventee"];
    expect(Gabarit.safeParse(g).success).toBe(false);
  });

  it("refuse une revue inconnue", () => {
    const g = valide(); g.revues = ["exigences", "astrologie"];
    expect(Gabarit.safeParse(g).success).toBe(false);
  });
});

describe("revues imposées par le type", () => {
  it("livrable public : les trois revues du gabarit public, tirées de GABARIT_LIVRABLE_PUBLIC", () => {
    expect(revuesImposees(chargerGabarit("contenu-reseau-social"))).toEqual(GABARIT_LIVRABLE_PUBLIC.revuesRequises);
  });

  it("livrable public avec module de conformité actif : la revue conformite s'ajoute", () => {
    const revues = revuesImposees(chargerGabarit("contenu-reseau-social"), { conformite: true });
    expect(revues.map((r) => r.role)).toEqual(["exigences", "metier", "technique", "conformite"]);
    expect(revues[3]!.agentId).toBe("{{agent:conformite-publicitaire}}");
  });

  it("livrable interne léger : deux revues, jamais la conformité", () => {
    const revues = revuesImposees(chargerGabarit("document-interne"), { conformite: true });
    expect(revues.map((r) => r.role)).toEqual(["exigences", "metier"]);
  });
});

describe("porte posée d'office", () => {
  it("pose la porte avec les revues du type et la politique native, sans passer par le modèle", async () => {
    const { deps, appels } = doubles(true);
    const r = await poserPorteMission(deps, { companyId: SOC, issueId: ISSUE, campagneId: CAMPAGNE, gabarit: chargerGabarit("contenu-reseau-social"), exigencesCiblees: ["REQ-001"] });
    expect(r).toEqual({ posee: true });
    expect(appels.creerPorte).toEqual([{
      issueId: ISSUE, companyId: SOC, campagneId: CAMPAGNE, cleLivrable: "livrable", exigencesCiblees: ["REQ-001"], maxCycles: 3,
      revuesRequises: [
        { role: "exigences", agentId: "agent-exigences" }, { role: "metier", agentId: "agent-relecteur" },
        { role: "technique", agentId: "agent-tests-techniques" }, { role: "conformite", agentId: "agent-conformite-publicitaire" },
      ],
    }]);
    expect(appels.majPolitique).toEqual([{ issueId: ISSUE, companyId: SOC, politique: expect.objectContaining({ stages: [
      { type: "review", participants: [{ type: "agent", agentId: "agent-porte" }] },
      { type: "approval", participants: [{ type: "user", userId: "humain-responsable" }] },
    ] }) }]);
  });

  it("refuse une mission d'un type public sans campagne, sans rien écrire ni inventer de campagne", async () => {
    const { deps, appels } = doubles();
    await expect(poserPorteMission(deps, { companyId: SOC, issueId: ISSUE, campagneId: null, gabarit: chargerGabarit("contenu-reseau-social"), exigencesCiblees: ["REQ-001"] })).rejects.toThrow(/campagne/u);
    expect(appels.creerPorte).toEqual([]);
    expect(appels.majPolitique).toEqual([]);
  });

  it("signale qu'une porte existait déjà sur la tâche, sans erreur (rejeu)", async () => {
    const { deps, appels } = doubles(false, false);
    const r = await poserPorteMission(deps, { companyId: SOC, issueId: ISSUE, campagneId: CAMPAGNE, gabarit: chargerGabarit("contenu-reseau-social"), exigencesCiblees: ["REQ-001"] });
    expect(r).toEqual({ posee: false });
    expect(appels.creerPorte).toHaveLength(1);
  });

  it("un gabarit sans porte n'appelle rien", async () => {
    const { deps, appels } = doubles();
    const g = Gabarit.parse({ ...valide(), porte: false });
    expect(await poserPorteMission(deps, { companyId: SOC, issueId: ISSUE, campagneId: null, gabarit: g, exigencesCiblees: [] })).toEqual({ posee: false });
    expect(appels.creerPorte).toEqual([]);
  });
});
