/**
 * Dossier d'une tâche (`tache.dossier`) : résumé par défaut lisible en un seul `Read` (< 40 000
 * caractères), détail par `?partie=`, corps historique par `?vue=complete`. Même banc que
 * `contexte-resume.spec.ts`.
 */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { PAGE_LIVRABLE_MAX, RESUME_MAX } from "../src/serveur/dossier-resume.js";
import { ISSUE, PRODUCTEUR, REV1, REV2, RELECTEUR, SOC, creerBanc } from "./outils-base.js";

const humain: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const agent: ActeurHote = { type: "agent", id: PRODUCTEUR, agentId: PRODUCTEUR, userId: null, runId: "run-1" };
const AUTRE_SOC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function lire(banc: ReturnType<typeof creerBanc>, query: Record<string, string> = {}, companyId = SOC, acteur: ActeurHote = agent) {
  const services = creerServices(banc.ctx, { base: banc.base });
  try {
    return await services.routes["tache.dossier"]!({ cle: "tache.dossier", params: { issueId: ISSUE }, query, companyId, acteur, corps: null });
  } catch (err) {
    return { statut: 0, corps: err as { code?: string; message?: string } };
  }
}

function corpsLong(): string {
  const section = (n: number, taille: number) => `## Section ${n}\n\n${"Texte de la section avec des mots utiles. ".repeat(Math.ceil(taille / 41)).slice(0, taille)}\n`;
  return `# Page de test\n\n${section(1, 6000)}\n\`\`\`\n# faux titre dans un bloc de code\n\`\`\`\n\n${section(2, 36000)}\n${section(3, 18000)}`;
}

/** Dossier réaliste : livrable de 60 000 caractères, 6 verdicts à grosses preuves, 8 constats, 40 sources à gros extrait. */
function remplir(banc: ReturnType<typeof creerBanc>, corps = corpsLong()) {
  banc.tacheSousPorte({ status: "in_review", revuesRequises: [{ role: "metier", agentId: RELECTEUR }], corps });
  const gros = "preuve très détaillée ".repeat(150);
  const preuve = { revisionId: REV1, emplacement: "Section 1", element: "adresse", extrait: gros };
  const verdict = (revisionId: string, role: string, verdictNom: string, i: number) => ({
    id: `vd-${i}`, companyId: SOC, issueId: ISSUE, revisionId, role, verdict: verdictNom, exigencesExaminees: ["REQ-001"],
    preuvesVerifiees: [preuve, preuve, preuve], constats: [], constatsResolus: [], limites: [], controlesNonExecutes: [], justification: null,
    relecteurType: "agent", relecteurId: RELECTEUR, runId: "r",
  });
  banc.t.verdicts.push(verdict(REV2, "metier", "CHANGES_REQUESTED", 1), verdict(REV2, "exigences", "PASS", 2), verdict(REV2, "technique", "PASS", 3));
  banc.t.verdicts.push(verdict(REV1, "metier", "PASS", 4), verdict(REV1, "exigences", "PASS", 5), verdict(REV1, "technique", "PASS", 6));
  for (let i = 0; i < 8; i++) {
    banc.t.constats.push({
      id: `ct-${i}`, findingId: `f-${i}`, companyId: SOC, issueId: ISSUE, revisionId: REV2, verdictId: "vd-1", reviewer: { type: "agent", id: RELECTEUR, runId: "r" },
      categorie: "autre", gravite: "majeure", emplacement: `Section ${i}`, description: `Constat numéro ${i}`, preuve: "404", correctionAttendue: "Corriger", statutResolution: "ouvert",
    });
  }
  banc.t.couvertures.push({ id: "cv-1", companyId: SOC, issueId: ISSUE, revisionId: REV2, code: "REQ-001", etat: "couverte", preuves: [preuve, preuve], hypotheses: [], question: null, declareePar: PRODUCTEUR });
  for (let i = 0; i < 40; i++) {
    banc.t.sources.push({ id: `s-${i}`, companyId: SOC, issueId: ISSUE, provenance: "connexion", url: `https://exemple.test/${i}`, titre: `Source ${i}`, extrait: "contenu externe volumineux ".repeat(200), mode: "demonstration", dateCollecte: "2026-10-16T10:00:00.000Z", connexion: { service: "ga4", outil: "rapport", modeCampagne: "demonstration" } });
  }
  const doc = banc.documents.get(`${ISSUE}:livrable`)!;
  banc.documents.set(`${ISSUE}:livrable`, { ...doc, latestRevisionId: REV2, latestRevisionNumber: 2 });
  return corps;
}

const taille = (x: unknown) => JSON.stringify(x).length;
type Corps = any; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("dossier de tâche : résumé par défaut", () => {
  it("1. dossier de plus de 100 000 caractères : résumé de moins de 40 000, sans corps du livrable ni preuves ni extraits", async () => {
    const banc = creerBanc();
    const corps = remplir(banc);
    expect(corps.length).toBeGreaterThan(60_000);
    const complet = await lire(banc, { vue: "complete" });
    const r = await lire(banc);
    const json = JSON.stringify(r.corps);
    process.stderr.write(`taille dossier complet = ${taille(complet.corps)} ; taille résumé = ${json.length}\n`);
    expect(taille(complet.corps)).toBeGreaterThan(100_000);
    expect(json.length).toBeLessThan(RESUME_MAX);
    expect(json).not.toContain('"corps"');
    expect(json).not.toContain("preuvesVerifiees");
    expect(json).not.toContain("contenu externe volumineux");
    expect(json).not.toContain(SOC);
    const c = r.corps as Corps;
    expect(c.vue).toBe("resume");
    // Contenu indispensable : statut, mention, périmètre, constats restants complets, matrice, limites.
    expect(c.statut.statut).toBeDefined();
    expect(c.constatsRestants).toHaveLength(8);
    expect(c.constatsRestants[3]).toMatchObject({ findingId: "f-3", description: "Constat numéro 3", correctionAttendue: "Corriger" });
    expect(JSON.stringify(c.constatsRestants)).not.toMatch(/"(companyId|issueId|reviewer)"/u);
    for (const cle of ["issueId", "titre", "mode", "perimetre", "matrice", "limites", "questionsRestantes", "cycles", "usage", "pourAllerPlus"]) expect(c).toHaveProperty(cle);
    expect(c.revues.total).toBe(6);
    expect(c.revues.elements.filter((v: Corps) => v.revisionId === REV2)).toHaveLength(3);
    expect(c.revues.elements.filter((v: Corps) => v.revisionId === REV1)[0]).toEqual({ role: "metier", verdict: "PASS", revisionId: REV1 });
    expect(c.revues.elements.find((v: Corps) => v.id === "vd-1").nbConstats).toBe(8);
    expect(c.sources.total).toBe(40);
    expect(c.sources.elements[0]).toMatchObject({ id: "s-0", url: "https://exemple.test/0" });
  });

  it("2. le sommaire donne les bons numéros de ligne ; les pages du livrable recollées reproduisent exactement le corps", async () => {
    const banc = creerBanc();
    const corps = remplir(banc);
    const c = (await lire(banc)).corps as Corps;
    const lignes = corps.split("\n");
    expect(c.livrable).toMatchObject({ revisionId: REV2, revisionNumber: 2, longueur: corps.length, lignes: lignes.length });
    expect(c.livrable.sommaire.map((s: Corps) => s.titre)).toEqual(["Page de test", "Section 1", "Section 2", "Section 3"]);
    for (const s of c.livrable.sommaire) expect(lignes[s.ligne - 1]!.replace(/^#+\s+/u, "")).toBe(s.titre);
    const p1 = (await lire(banc, { partie: "livrable", debut: String(c.livrable.sommaire[1].ligne), lignes: "3" })).corps as Corps;
    expect(p1.texte.startsWith("## Section 1\n")).toBe(true);
    let recolle = "";
    let debut = 1;
    let decalage = 0;
    let pages = 0;
    for (;;) {
      const p = (await lire(banc, { partie: "livrable", debut: String(debut), decalage: String(decalage) })).corps as Corps;
      expect(p.texte.length).toBeLessThanOrEqual(PAGE_LIVRABLE_MAX);
      recolle += p.texte;
      pages++;
      if (!p.suivant) break;
      ({ debut, decalage } = p.suivant);
      expect(pages).toBeLessThan(50);
    }
    expect(pages).toBeGreaterThan(3);
    expect(recolle).toBe(corps);
  });

  it("3. vue=complete : corps identique à l'ancien (livrable, preuves, extraits, identifiants conservés)", async () => {
    const banc = creerBanc();
    const corps = remplir(banc);
    const c = (await lire(banc, { vue: "complete" }, SOC, humain)).corps as Corps;
    expect(c.livrable).toEqual({ revisionId: REV2, revisionNumber: 2, titre: "Page", corps });
    expect(c.companyId).toBe(SOC);
    expect(c.revues).toHaveLength(6);
    expect(c.revues[0].preuvesVerifiees).toHaveLength(3);
    expect(c.sources).toHaveLength(40);
    expect(c.sources[0].extrait).toContain("contenu externe volumineux");
    expect(c).not.toHaveProperty("vue");
    // Le même appel sans paramètre (humain ou agent) ne rend plus le corps complet.
    expect(((await lire(banc, {}, SOC, humain)).corps as Corps).vue).toBe("resume");
  });

  it("4. les parties entières rendent le détail, identique au corps complet ; partie inconnue refusée", async () => {
    const banc = creerBanc();
    remplir(banc);
    const complet = (await lire(banc, { vue: "complete" })).corps as Corps;
    for (const nom of ["matrice", "sources", "revues", "decisions", "diffusions", "appelsProposes"]) {
      const p = (await lire(banc, { partie: nom })).corps as Corps;
      expect(p.partie).toBe(nom);
      expect(p[nom]).toEqual(complet[nom]);
    }
    expect(((await lire(banc, { partie: "revues" })).corps as Corps).revues[0].preuvesVerifiees).toHaveLength(3);
    expect(((await lire(banc, { partie: "sources" })).corps as Corps).sources[0].extrait).toContain("contenu externe volumineux");
    expect((await lire(banc, { partie: "secrets" })).corps).toMatchObject({ code: "entree_invalide" });
    expect((await lire(banc, { partie: "livrable", debut: "999999" })).corps).toMatchObject({ code: "entree_invalide" });
  });

  it("5. isolement entre entreprises pour le résumé, la vue complète et chaque partie", async () => {
    const banc = creerBanc();
    remplir(banc);
    for (const q of [{} as Record<string, string>, { vue: "complete" }, { partie: "livrable" }, { partie: "revues" }, { partie: "matrice" }, { partie: "sources" }, { partie: "diffusions" }]) {
      const r = await lire(banc, q, AUTRE_SOC);
      expect(r.corps, JSON.stringify(q)).toMatchObject({ code: "introuvable" });
      expect(JSON.stringify(r.corps)).not.toContain("Constat numéro");
    }
  });
});
