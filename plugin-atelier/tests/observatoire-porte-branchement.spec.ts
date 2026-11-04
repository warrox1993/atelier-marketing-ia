/** Tâche 9 : branchement de la porte par service. Entrées OBS construites depuis le livrable et le dépôt (faux db). */
import { describe, expect, it } from "vitest";
import { entreesObservatoire, idsAffirmationsCitees } from "../src/serveur/observatoire/entrees-porte.js";
import { evaluerPorte, refusDeFond, type EntreesPorte } from "../src/serveur/porte.js";

const SOC = "11111111-1111-4111-8111-111111111111";
const PROJET = "00000000-0000-4000-8000-0000000000bb";
const AFF = "00000000-0000-4000-8000-0000000000a1";
const INCONNUE = "00000000-0000-4000-8000-0000000000ff";
const SRC = "00000000-0000-4000-8000-0000000000cc";
const INST = "00000000-0000-4000-8000-0000000000dd";
const REV = "r1";

function fauxBase(sourceEnregistree: boolean, typeSource = "primaire", communes: Array<{ id: string; urlCanonique: string; type: string; autorisee: boolean; extraitMax?: number | null; cumulMax?: number | null; auteur?: string | null }> = [], autorisee = true) {
  const appels: Array<{ methode: string; args: unknown[] }> = [];
  const note = <T>(methode: string, valeur: T) => async (...args: unknown[]) => { appels.push({ methode, args }); return valeur; };
  const aff = { id: AFF, projetId: PROJET, chapitre: "ch01", texte: "REA lit des binaires.", statut: "confirme_doc_officielle", confiance: 2, confianceMotif: "doc", versionConcernee: "1.0.0", remplaceePar: null };
  return {
    appels,
    base: {
      affirmationsParIds: async (c: string, ids: string[]) => { appels.push({ methode: "affirmationsParIds", args: [c, ids] }); return ids.includes(AFF) ? [aff] : []; },
      sourcesDuProjet: note("sourcesDuProjet", sourceEnregistree ? [{ id: SRC, urlCanonique: "https://exemple.org/doc", type: typeSource, etag: null, controleLe: null, echecsConsecutifs: 0, enEchec: false, autorisee, extraitMax: null, cumulMax: null, auteur: "Exemple SA" }] : []),
      sourcesCommunes: note("sourcesCommunes", communes.map((x) => ({ ...x, extraitMax: x.extraitMax ?? null, cumulMax: x.cumulMax ?? null, auteur: x.auteur === undefined ? "Exemple SA" : x.auteur }))),
      versionsConnues: note("versionsConnues", ["1.0.0"]),
      listerAlias: note("listerAlias", [{ id: "al1", projetId: PROJET, type: "nom" as const, valeur: "rea" }, { id: "al3", projetId: PROJET, type: "nom" as const, valeur: "absent du texte" }, { id: "al2", projetId: PROJET, type: "npm" as const, valeur: "rea-agents" }]),
      preuvesDe: async (c: string, ids: string[]) => { appels.push({ methode: "preuvesDe", args: [c, ids] }); return ids.includes(AFF) ? [{ id: "p", affirmationId: AFF, instantaneId: INST, essaiId: null, extraitExact: "lit des binaires", position: 0 }] : []; },
      instantanesParIds: async (c: string, ids: string[]) => {
        appels.push({ methode: "instantanesParIds", args: [c, ids] });
        return ids.includes(INST) ? [{ id: INST, sourceId: SRC, empreinteSha256: "a".repeat(64), recupereLe: "", texteNormalise: "REA lit des binaires natifs", versionDetectee: null, injectionsSignalees: null }] : [];
      },
    },
  };
}

const corps = `## Fonctionnement\nÉtat : complet\nREA lit des binaires. [aff:${AFF}]\n`;

function entreesPorte(): EntreesPorte {
  return {
    porte: { exigencesCiblees: [], revuesRequises: [], maxCycles: 3 },
    exigences: [], livrable: { revisionId: REV }, couvertures: [], verdicts: [], constats: [], revisionsDejaRefusees: [],
  };
}

describe("extraction des citations", () => {
  it("extrait les [aff:<id>] sans doublon et ignore les autres formes", () => {
    expect(idsAffirmationsCitees(`a [aff:${AFF}] b [aff:${AFF}] c [aff:${INCONNUE}] #a-${AFF} [aff:]`)).toEqual([AFF, INCONNUE]);
  });
});

describe("entreesObservatoire", () => {
  it("lit tout par entreprise : affirmations, preuves, instantanés, sources, versions", async () => {
    const { base, appels } = fauxBase(true);
    const e = await entreesObservatoire(base, SOC, { id: REV, corps });
    expect(e.affirmations.map((a) => a.id)).toEqual([AFF]);
    expect(e.affirmations[0]?.preuves).toHaveLength(1);
    expect(e.instantanes.get(INST)?.sourceId).toBe(SRC);
    expect(e.sources.has(SRC) && e.sources.has("https://exemple.org/doc")).toBe(true);
    expect(e.versionsConnues.has("1.0.0")).toBe(true);
    expect(e.essais.size).toBe(0);
    expect(e.revision).toMatchObject({ id: REV, langue: "fr", baseRevisionFr: null, texte: corps });
    expect(e.revision.empreinte).toMatch(/^[0-9a-f]{64}$/u);
    expect(appels.every((a) => a.args[0] === SOC)).toBe(true);
  });

  it("O9 : 40 affirmations citées = une requête de preuves et une d'instantanés, preuves rangées par affirmation", async () => {
    const { base, appels } = fauxBase(true);
    const ids = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const affs = ids.map((id) => ({ id, projetId: PROJET, chapitre: "ch01", texte: "t", statut: "confirme_doc_officielle", confiance: 2, confianceMotif: "doc", versionConcernee: null, remplaceePar: null }));
    const lot = {
      ...base,
      affirmationsParIds: async () => affs,
      preuvesDe: async (c: string, demandes: string[]) => {
        appels.push({ methode: "preuvesDe", args: [c, demandes] });
        return demandes.flatMap((a, i) => [{ id: `p${i}`, affirmationId: a, instantaneId: INST, essaiId: null, extraitExact: `extrait ${i}`, position: i }]);
      },
    };
    const e = await entreesObservatoire(lot, SOC, { id: REV, corps: ids.map((i) => `[aff:${i}]`).join(" ") });
    expect(appels.filter((a) => a.methode === "preuvesDe")).toHaveLength(1);
    expect(appels.filter((a) => a.methode === "instantanesParIds").map((a) => a.args[1])).toEqual([[INST]]);
    expect(e.affirmations).toHaveLength(40);
    expect(e.affirmations.map((a) => a.preuves.map((p) => p.extraitExact))).toEqual(ids.map((_, i) => [`extrait ${i}`]));
    expect(e.instantanes.get(INST)?.sourceId).toBe(SRC);
    expect(appels.every((a) => a.args[0] === SOC)).toBe(true);
  });

  it("un identifiant cité introuvable (ou non GUID) n'est pas dans affirmations", async () => {
    const { base, appels } = fauxBase(true);
    const e = await entreesObservatoire(base, SOC, { id: REV, corps: `x [aff:${INCONNUE}] y [aff:pas-un-guid]` });
    expect(e.affirmations).toEqual([]);
    expect(appels.find((a) => a.methode === "affirmationsParIds")?.args[1]).toEqual([INCONNUE]);
  });
});

describe("entreprise observatoire : porte", () => {
  it("OBS-03 refuse quand la source de la preuve n'est pas enregistrée", async () => {
    const { base } = fauxBase(false);
    const observatoire = await entreesObservatoire(base, SOC, { id: REV, corps });
    const r = evaluerPorte({ ...entreesPorte(), observatoire });
    expect(r.decision).toBe("REFUS");
    expect(r.motifs.map((m) => m.code)).toContain("obs_source_non_enregistree");
  });

  it("source enregistrée : plus de motif OBS-03 ; l'empreinte dépend des entrées OBS", async () => {
    const ok = await entreesObservatoire(fauxBase(true).base, SOC, { id: REV, corps });
    const ko = await entreesObservatoire(fauxBase(false).base, SOC, { id: REV, corps });
    const r = evaluerPorte({ ...entreesPorte(), observatoire: ok });
    expect(r.motifs.map((m) => m.code)).not.toContain("obs_source_non_enregistree");
    expect(r.empreinte).not.toBe(evaluerPorte({ ...entreesPorte(), observatoire: ko }).empreinte);
    expect(r.empreinte).not.toBe(evaluerPorte(entreesPorte()).empreinte);
  });

  it("OBS-14 accepte confirme_doc_officielle prouvé par une source primaire du projet", async () => {
    const observatoire = await entreesObservatoire(fauxBase(true, "primaire").base, SOC, { id: REV, corps });
    // SPEC-E6 : primaire pour son projet seulement, pas pour les affirmations d'un autre projet cité.
    expect(observatoire.sourcesPrimairesParProjet?.get(PROJET)?.has(SRC)).toBe(true);
    expect(observatoire.sourcesPrimaires?.has(SRC)).toBe(false);
    const r = evaluerPorte({ ...entreesPorte(), observatoire });
    expect(r.motifs.map((m) => m.code)).not.toContain("obs_doc_officielle_non_primaire");
  });

  it("OBS-14 refuse confirme_doc_officielle prouvé par une source non primaire", async () => {
    const observatoire = await entreesObservatoire(fauxBase(true, "secondaire").base, SOC, { id: REV, corps });
    expect(observatoire.sourcesPrimaires?.has(SRC)).toBe(false);
    expect(observatoire.sourcesPrimairesParProjet?.get(PROJET)?.has(SRC)).toBe(false);
    const r = evaluerPorte({ ...entreesPorte(), observatoire });
    expect(r.motifs.map((m) => m.code)).toContain("obs_doc_officielle_non_primaire");
  });

  it("une source de la base commune (hors projet) est citable ; primaire seulement si son type l'est", async () => {
    const commune = { id: SRC, urlCanonique: "https://exemple.org/doc", type: "primaire", autorisee: true };
    const observatoire = await entreesObservatoire(fauxBase(false, "primaire", [commune]).base, SOC, { id: REV, corps });
    expect(observatoire.sources.has(SRC) && observatoire.sources.has("https://exemple.org/doc")).toBe(true);
    expect(observatoire.sourcesPrimaires?.has(SRC)).toBe(true);
    expect(evaluerPorte({ ...entreesPorte(), observatoire }).motifs.map((m) => m.code)).not.toContain("obs_source_non_enregistree");
    const secondaire = await entreesObservatoire(fauxBase(false, "primaire", [{ ...commune, type: "secondaire" }]).base, SOC, { id: REV, corps });
    expect(secondaire.sources.has(SRC)).toBe(true);
    expect(secondaire.sourcesPrimaires?.has(SRC)).toBe(false);
  });

  // O1 (audit du 29/10/2026) : chemin réel, une source citée sans autorisation explicite est refusée par OBS-15.
  it("OBS-15 refuse une source citée dont politique_collecte n'est pas explicitement autorisée", async () => {
    const refusee = await entreesObservatoire(fauxBase(true, "primaire", [], false).base, SOC, { id: REV, corps });
    expect(refusee.sourcesRefusees.has(SRC)).toBe(true);
    expect(evaluerPorte({ ...entreesPorte(), observatoire: refusee }).motifs.map((m) => m.code)).toContain("obs_source_collecte_refusee");
    const autorisee = await entreesObservatoire(fauxBase(true).base, SOC, { id: REV, corps });
    expect(autorisee.sourcesRefusees.size).toBe(0);
    expect(evaluerPorte({ ...entreesPorte(), observatoire: autorisee }).motifs.map((m) => m.code)).not.toContain("obs_source_collecte_refusee");
  });

  it("T6 : une URL de la base commune n'est citable dans le texte qu'avec un instantané derrière une preuve de la révision", async () => {
    const sansInstantane = { id: "src-commune", urlCanonique: "https://commune.example/page", type: "secondaire", autorisee: true };
    const texte = `${corps}Voir https://commune.example/page pour le détail.\n`;
    const nue = await entreesObservatoire(fauxBase(true, "primaire", [sansInstantane]).base, SOC, { id: REV, corps: texte });
    expect(nue.sources.has("https://commune.example/page")).toBe(false);
    expect(evaluerPorte({ ...entreesPorte(), observatoire: nue }).motifs.map((m) => m.code)).toContain("obs_source_non_enregistree");
    const prouvee = { ...sansInstantane, id: SRC, urlCanonique: "https://commune.example/page" };
    const avec = await entreesObservatoire(fauxBase(false, "primaire", [prouvee]).base, SOC, { id: REV, corps: texte });
    expect(avec.sources.has("https://commune.example/page")).toBe(true);
  });

  it("DROIT-5.1 : les plafonds K4 de chaque source (extrait, cumul par article) passent à la porte", async () => {
    const commune = { id: SRC, urlCanonique: "https://exemple.org/doc", type: "primaire", autorisee: true, extraitMax: 5, cumulMax: 40 };
    const observatoire = await entreesObservatoire(fauxBase(false, "primaire", [commune]).base, SOC, { id: REV, corps });
    expect(observatoire.limitesSources?.get(SRC)).toEqual({ extraitMax: 5, cumulMax: 40 });
    expect(evaluerPorte({ ...entreesPorte(), observatoire }).motifs.map((m) => m.code)).toContain("obs_source_collecte_refusee");
  });

  it("SPEC-E4 : le glossaire protégé d'une version anglaise = alias « nom » des projets cités, avec la casse du texte français ; un nom perdu est refusé (OBS-09)", async () => {
    const baseFr = { id: "fr1", empreinteActuelle: "fr1", empreinteTraduite: "fr1", texte: corps };
    const fr = await entreesObservatoire(fauxBase(true).base, SOC, { id: REV, corps });
    expect(fr.revision.baseRevisionFr).toBeNull();
    const enCorps = `## How it works\nÉtat : complet\nThe tool reads binaries. [aff:${AFF}]\n`;
    const en = await entreesObservatoire(fauxBase(true).base, SOC, { id: REV, corps: enCorps, langue: "en", baseRevisionFr: baseFr });
    expect(en.revision.baseRevisionFr?.glossaireProtege).toEqual(["REA"]);
    expect(evaluerPorte({ ...entreesPorte(), observatoire: en }).motifs.map((m) => m.code)).toContain("obs_code_modifie_traduction");
    const garde = await entreesObservatoire(fauxBase(true).base, SOC, { id: REV, corps: enCorps.replace("The tool", "REA"), langue: "en", baseRevisionFr: baseFr });
    expect(evaluerPorte({ ...entreesPorte(), observatoire: garde }).motifs.map((m) => m.code)).not.toContain("obs_code_modifie_traduction");
  });

  it("DROIT-5.2 : une source sans auteur enregistré passe à la porte dans sourcesSansAuteur, qui la refuse", async () => {
    const commune = { id: SRC, urlCanonique: "https://exemple.org/doc", type: "primaire", autorisee: true, auteur: null };
    const sans = await entreesObservatoire(fauxBase(false, "primaire", [commune]).base, SOC, { id: REV, corps });
    expect(sans.sourcesSansAuteur?.has(SRC)).toBe(true);
    expect(evaluerPorte({ ...entreesPorte(), observatoire: sans }).motifs.map((m) => m.code)).toContain("obs_source_collecte_refusee");
    const avec = await entreesObservatoire(fauxBase(false, "primaire", [{ ...commune, auteur: "Exemple SA" }]).base, SOC, { id: REV, corps });
    expect(avec.sourcesSansAuteur?.has(SRC)).toBe(false);
  });

  it("OBS-15 refuse une source citée absente des listes (aucune décision connue) et une commune non autorisée", async () => {
    const absente = await entreesObservatoire(fauxBase(false).base, SOC, { id: REV, corps });
    expect(absente.sourcesRefusees.has(SRC)).toBe(true);
    const commune = { id: SRC, urlCanonique: "https://exemple.org/doc", type: "primaire", autorisee: false };
    const nonAutorisee = await entreesObservatoire(fauxBase(false, "primaire", [commune]).base, SOC, { id: REV, corps });
    expect(nonAutorisee.sourcesRefusees.has(SRC)).toBe(true);
    const autorisee = await entreesObservatoire(fauxBase(false, "primaire", [{ ...commune, autorisee: true }]).base, SOC, { id: REV, corps });
    expect(autorisee.sourcesRefusees.has(SRC)).toBe(false);
  });

  it("OBS-08 ne consomme pas de cycle", () => {
    expect(refusDeFond([{ code: "obs_traduction_base_perimee" }])).toBe(false);
    expect(refusDeFond([{ code: "obs_traduction_base_perimee" }, { code: "obs_source_non_enregistree" }])).toBe(true);
  });
});
