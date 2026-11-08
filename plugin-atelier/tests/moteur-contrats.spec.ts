/**
 * Moteur de missions (#49, tâche 4) : contrats de tâche validés par schéma. Les entrées, sorties et critères
 * viennent du registre des agents (jamais recopiés dans le contrat) ; le contrat n'ajoute que ce que le registre n'a pas.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import registre from "../../organisation/registre/agents.json" with { type: "json" };
import wfC from "../../organisation/contrats/wf-c-contenu.json" with { type: "json" };
import wf01 from "../../organisation/contrats/wf-01-prospection.json" with { type: "json" };
import { Contrat, chargerContrat, verifierEntrees, verifierSortie } from "../src/moteur/contrats.js";
import { Gabarit, chargerGabarit } from "../src/moteur/gabarits.js";

const agent = (slug: string) => registre.agents.find((a) => a.slug === slug)!;
const brut = (): Record<string, unknown> => structuredClone(wfC) as Record<string, unknown>;

describe("schéma et chargement des contrats", () => {
  it("charge les contrats de WF-C et de WF-01, entrées, sorties et critères lus dans le registre", () => {
    const c = chargerContrat("wf-c-contenu", 1);
    expect(c.roleResponsable).toBe("contenus");
    expect(c.criteres.map((x) => x.libelle)).toEqual(agent("contenus").criteresReussite);
    expect(c.sortie.libelles).toEqual(agent("contenus").sorties);
    expect(c.entreesRequises.map((e) => e.libelle)).toEqual(wfC.entreesRequises.map((e) => agent("contenus").entrees[e.indexRegistre]));
    const p = chargerContrat("wf-01-prospection", 1);
    expect(p.criteres.map((x) => x.libelle)).toEqual(agent("prospection").criteresReussite);
    expect(["M0", "M1", "M2", "M3", "M4", "M5"]).toContain(p.maturite);
  });

  it("ne recopie ni entrée, ni sortie, ni critère du registre dans les fichiers de contrat", () => {
    for (const fichier of ["wf-c-contenu", "wf-01-prospection"]) {
      const texte = readFileSync(new URL(`../../organisation/contrats/${fichier}.json`, import.meta.url), "utf8");
      const a = agent(fichier === "wf-c-contenu" ? "contenus" : "prospection");
      for (const phrase of [...a.entrees, ...a.sorties, ...a.criteresReussite]) expect(texte).not.toContain(phrase);
    }
  });

  it.each(["id", "version", "tache", "roleResponsable", "entreesRequises", "sortie", "controleurs", "competences", "plafondTours", "plafondJetons", "effetExterne", "conduiteEchec", "mesureReussite", "maturite"])(
    "refuse un contrat sans le champ obligatoire %s", (champ) => {
      const c = brut(); delete c[champ];
      expect(Contrat.safeParse(c).success).toBe(false);
    });

  it("refuse une maturité hors de M0 à M5", () => {
    expect(Contrat.safeParse({ ...brut(), maturite: "M6" }).success).toBe(false);
  });

  it("refuse un contrôleur par critère qui ne suit pas le registre (un critère sans contrôleur)", () => {
    expect(Contrat.safeParse({ ...brut(), controleurs: ["code"] }).success).toBe(false);
  });

  it("refuse un rôle absent du registre et un plafond de tours au-dessus de celui de l'agent", () => {
    expect(Contrat.safeParse({ ...brut(), roleResponsable: "agent-fantome" }).success).toBe(false);
    expect(Contrat.safeParse({ ...brut(), plafondTours: agent("contenus").maxToursParExecution + 1 }).success).toBe(false);
  });

  it("refuse une entrée requise qui ne désigne aucune entrée du registre", () => {
    expect(Contrat.safeParse({ ...brut(), entreesRequises: [{ cle: "brief", indexRegistre: 99 }] }).success).toBe(false);
  });

  it("refuse un contrat inconnu et, à la reprise, un contrat d'une version différente de celle de la mission", () => {
    expect(() => chargerContrat("inexistant", 1)).toThrow(/inconnu/u);
    expect(() => chargerContrat("wf-c-contenu", 2)).toThrow(/version/u);
  });
});

describe("contrat de chaque étape d'un gabarit", () => {
  it("les gabarits fournis portent un contrat valide par étape, de leur rôle", () => {
    for (const cle of ["contenu-reseau-social", "document-interne"]) {
      for (const e of chargerGabarit(cle).etapes) expect(chargerContrat(e.contratId, e.contratVersion).roleResponsable).toBe(e.role);
    }
  });

  const etape = (extra: object) => ({
    cle: "essai", version: 1, description: "Essai.", typeLivrable: "public", revues: ["exigences"], conformiteSiModuleActif: false, porte: true, approbationRequise: true,
    etapes: [{ rang: 1, role: "contenus", competences: [], contratId: "wf-c-contenu", contratVersion: 1, ...extra }],
  });

  it("refuse une étape sans contrat, avec un contrat inconnu, d'une autre version ou d'un autre rôle", () => {
    expect(Gabarit.safeParse(etape({})).success).toBe(true);
    expect(Gabarit.safeParse(etape({ contratId: undefined })).success).toBe(false);
    expect(Gabarit.safeParse(etape({ contratId: "inexistant" })).success).toBe(false);
    expect(Gabarit.safeParse(etape({ contratVersion: 2 })).success).toBe(false);
    expect(Gabarit.safeParse(etape({ role: "prospection" })).success).toBe(false);
  });
});

describe("verifierEntrees", () => {
  const c = chargerContrat("wf-c-contenu", 1);
  const cles = c.entreesRequises.map((e) => e.cle);

  it("liste les entrées manquantes, vides ou nulles", () => {
    expect(verifierEntrees(c, {})).toEqual({ manquantes: cles });
    const pleines = Object.fromEntries(cles.map((k) => [k, "ok"]));
    expect(verifierEntrees(c, pleines)).toEqual({ manquantes: [] });
    expect(verifierEntrees(c, { ...pleines, [cles[0]!]: "  ", [cles[1]!]: null, [cles[2]!]: [] }).manquantes).toEqual(cles.slice(0, 3));
  });
});

describe("verifierSortie", () => {
  const c = chargerContrat("wf-c-contenu", 1);
  const valide = { textes: ["Un post."], briefsVisuels: [], sources: ["https://exemple.be/source"] };

  it("accepte une sortie conforme", () => {
    expect(verifierSortie(c, valide)).toEqual({ ok: true, erreurs: [] });
  });

  it("refuse une sortie hors schéma avec la liste des erreurs", () => {
    const r = verifierSortie(c, { textes: "pas une liste", sources: [3], inattendu: true });
    expect(r.ok).toBe(false);
    expect(r.erreurs).toEqual(expect.arrayContaining([expect.stringContaining("textes"), expect.stringContaining("briefsVisuels"), expect.stringContaining("sources"), expect.stringContaining("inattendu")]));
    expect(verifierSortie(c, "texte libre").ok).toBe(false);
    expect(verifierSortie(c, null).ok).toBe(false);
  });

  it("WF-01 marque les personnes opposées dans la sortie, sans les écarter", () => {
    const p = chargerContrat("wf-01-prospection", 1);
    expect(Object.keys(p.sortie.champs)).toContain("personnesOpposeesMarquees");
    expect(verifierSortie(p, { reponsesBrutesSignees: ["r1"], qualification: "Estimation.", personnesOpposeesMarquees: ["fiche-7"], limites: [] }).ok).toBe(true);
  });
});

describe("gabarit document-interne : contrat léger", () => {
  const contrat = () => {
    const e = chargerGabarit("document-interne").etapes[0]!;
    return chargerContrat(e.contratId, e.contratVersion);
  };

  it("n'exige que le brief, pas de charte ni de sources", () => {
    expect(verifierEntrees(contrat(), { brief: "Note de cadrage" }).manquantes).toEqual([]);
    expect(verifierEntrees(contrat(), {}).manquantes).toEqual(["brief"]);
  });

  it("attend un document, sans brief de visuel", () => {
    expect(verifierSortie(contrat(), { document: "Texte", sources: [] }).ok).toBe(true);
    expect(verifierSortie(contrat(), { document: "Texte", sources: [], briefsVisuels: [] }).ok).toBe(false);
    expect(verifierSortie(contrat(), { sources: [] }).ok).toBe(false);
  });
});
