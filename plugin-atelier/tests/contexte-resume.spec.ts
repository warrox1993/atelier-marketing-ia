/**
 * Contexte d'une tâche (`tache.contexte`) : résumé par défaut lisible en un seul `Read` (< 40 000
 * caractères), détail par `?partie=`, corps historique par `?vue=complete`. Banc en mémoire des
 * services, sur le modèle de `revue-independante.spec.ts`.
 */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { PAGE_LIVRABLE_MAX, RESUME_MAX, sommaireDe } from "../src/serveur/contexte-resume.js";
import { CAMP, COORD, ISSUE, PRODUCTEUR, REV1, REV2, RELECTEUR, SOC, creerBanc } from "./outils-base.js";

const producteur: ActeurHote = { type: "agent", id: PRODUCTEUR, agentId: PRODUCTEUR, userId: null, runId: "run-1" };
const AUTRE_SOC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function lire(banc: ReturnType<typeof creerBanc>, query: Record<string, string> = {}, companyId = SOC) {
  const services = creerServices(banc.ctx, { base: banc.base });
  try {
    return await services.routes["tache.contexte"]!({ cle: "tache.contexte", params: { issueId: ISSUE }, query, companyId, acteur: producteur, corps: null });
  } catch (err) {
    return { statut: 0, corps: err as { code?: string; message?: string } };
  }
}

/** Livrable de plusieurs sections, dont une de 36 000 caractères, avec un bloc de code contenant un faux titre. */
function corpsLong(): string {
  const section = (n: number, taille: number) => `## Section ${n}\n\n${"Texte de la section avec des mots utiles. ".repeat(Math.ceil(taille / 41)).slice(0, taille)}\n`;
  return `# Page de test\n\n${section(1, 6000)}\n\`\`\`\n# faux titre dans un bloc de code\n\`\`\`\n\n${section(2, 36000)}\n${section(3, 18000)}`;
}

function remplir(banc: ReturnType<typeof creerBanc>, corps = corpsLong()) {
  banc.tacheSousPorte({ status: "in_review", revuesRequises: [{ role: "metier", agentId: RELECTEUR }], corps });
  banc.issues.set("revue-metier", { id: "revue-metier", companyId: SOC, originKind: "plugin:atelier.marketing-ia:revue", originId: `${ISSUE}:${REV2}:metier`, status: "todo" });
  const gros = "preuve très détaillée ".repeat(150); // ~3 Ko par verdict
  const preuve = { revisionId: REV1, emplacement: "Section 1", element: "adresse", extrait: gros };
  const verdict = (revisionId: string, role: string, verdictNom: string, i: number) => ({
    id: `vd-${i}`, companyId: SOC, issueId: ISSUE, revisionId, role, verdict: verdictNom, exigencesExaminees: ["REQ-001"],
    preuvesVerifiees: [preuve, preuve, preuve], constats: [], constatsResolus: [], limites: [], controlesNonExecutes: [], justification: null,
    relecteurType: "agent", relecteurId: RELECTEUR, runId: "r",
  });
  banc.t.verdicts.push(verdict(REV2, "metier", "CHANGES_REQUESTED", 1), verdict(REV2, "exigences", "CHANGES_REQUESTED", 2), verdict(REV2, "technique", "PASS", 3));
  banc.t.verdicts.push(verdict(REV1, "metier", "PASS", 4), verdict(REV1, "exigences", "PASS", 5), verdict(REV1, "technique", "PASS", 6));
  for (let i = 0; i < 8; i++) {
    banc.t.constats.push({
      id: `ct-${i}`, findingId: `f-${i}`, companyId: SOC, issueId: ISSUE, revisionId: REV2, reviewer: { type: "agent", id: RELECTEUR, runId: "r" },
      categorie: "autre", gravite: "majeure", emplacement: `Section ${i}`, description: `Constat numéro ${i}`, preuve: "404", correctionAttendue: "Corriger", statutResolution: "ouvert",
    });
  }
  banc.t.couvertures.push({ id: "cv-1", companyId: SOC, issueId: ISSUE, revisionId: REV2, code: "REQ-001", etat: "couverte", preuves: [preuve, preuve], hypotheses: [], question: null, declareePar: PRODUCTEUR });
  banc.t.couvertures.push({ id: "cv-0", companyId: SOC, issueId: ISSUE, revisionId: REV1, code: "REQ-001", etat: "couverte", preuves: [preuve], hypotheses: [], question: null, declareePar: PRODUCTEUR });
  for (let i = 0; i < 6; i++) {
    banc.t.sources.push({ id: `s-${i}`, issueId: ISSUE, provenance: "connexion", url: `https://exemple.test/${i}`, mode: "demonstration", dateCollecte: "2026-10-16T10:00:00.000Z", connexion: { service: i < 4 ? "ga4" : "gsc", outil: "rapport", modeCampagne: "demonstration" } });
  }
  // Révision courante = REV2 (nouvelle révision du livrable).
  const doc = banc.documents.get(`${ISSUE}:livrable`)!;
  banc.documents.set(`${ISSUE}:livrable`, { ...doc, latestRevisionId: REV2, latestRevisionNumber: 2 });
  return corps;
}

const taille = (x: unknown) => JSON.stringify(x).length;

describe("contexte de tâche : résumé par défaut", () => {
  it("1. livrable de 60 000 caractères, 3 verdicts antérieurs, 8 constats : moins de 40 000 caractères, sans corps ni preuvesVerifiees", async () => {
    const banc = creerBanc();
    const corps = remplir(banc);
    expect(corps.length).toBeGreaterThan(60_000);
    const complet = await lire(banc, { vue: "complete" });
    const r = await lire(banc);
    const json = JSON.stringify(r.corps);
    process.stderr.write(`taille complet = ${taille(complet.corps)} ; taille résumé = ${json.length}\n`);
    expect(taille(complet.corps)).toBeGreaterThan(100_000);
    expect(json.length).toBeLessThan(RESUME_MAX);
    expect(json).not.toContain('"corps"');
    expect(json).not.toContain("preuvesVerifiees");
    expect(json).not.toContain(SOC);
    const c = r.corps as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    // Verdicts : révision courante sans preuves ; antérieurs réduits à {role, verdict, revisionId}.
    expect(c.verdicts.filter((v: any) => v.revisionId === REV2)).toHaveLength(3); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(c.verdicts.filter((v: any) => v.revisionId === REV1)).toEqual([ // eslint-disable-line @typescript-eslint/no-explicit-any
      { role: "metier", verdict: "PASS", revisionId: REV1 }, { role: "exigences", verdict: "PASS", revisionId: REV1 }, { role: "technique", verdict: "PASS", revisionId: REV1 },
    ]);
    // Couvertures de la révision courante, réduites.
    expect(c.couvertures).toEqual([{ code: "REQ-001", etat: "couverte", nbPreuves: 2, hypotheses: [], question: null }]);
    // Données de connexion : comptes par service, outil et mode.
    expect(c.donneesConnexion).toEqual(expect.arrayContaining([{ service: "ga4", outil: "rapport", mode: "demonstration", nombre: 4 }, { service: "gsc", outil: "rapport", mode: "demonstration", nombre: 2 }]));
    expect(c.donneesConnexion).toHaveLength(2);
    expect(c.vue).toBe("resume");
  });

  it("2. constats ouverts complets (sans companyId, issueId, reviewer) et clés de suivi présentes", async () => {
    const banc = creerBanc();
    remplir(banc);
    const c = (await lire(banc)).corps as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(c.constatsOuverts).toHaveLength(8);
    expect(c.constatsOuverts[3]).toMatchObject({ findingId: "f-3", description: "Constat numéro 3", correctionAttendue: "Corriger", gravite: "majeure" });
    for (const k of c.constatsOuverts) expect(Object.keys(k)).not.toEqual(expect.arrayContaining(["companyId"]));
    expect(JSON.stringify(c.constatsOuverts)).not.toMatch(/"(companyId|issueId|reviewer)"/u);
    for (const cle of ["revuesRevisionCourante", "cyclesConsommes", "cyclesMaximum", "relances", "boiteReception", "mode", "regleDonneesDemo", "rappelSecurite"]) expect(c).toHaveProperty(cle);
    expect(c.revuesRevisionCourante.map((x: any) => x.role)).toEqual(["metier"]); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it("3. le sommaire donne les bons numéros de ligne ; les pages recollées reproduisent exactement le corps ; aucune page ne dépasse 15 000 caractères", async () => {
    const banc = creerBanc();
    const corps = remplir(banc);
    const c = (await lire(banc)).corps as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const lignes = corps.split("\n");
    expect(c.livrable).toMatchObject({ revisionId: REV2, revisionNumber: 2, titre: "Page", longueur: corps.length, lignes: lignes.length });
    expect(c.livrable.sommaire.length).toBe(4); // le faux titre du bloc de code est ignoré
    for (const s of c.livrable.sommaire) expect(lignes[s.ligne - 1]).toMatch(/^#{1,6} /u), expect(lignes[s.ligne - 1]!.replace(/^#+\s+/u, "")).toBe(s.titre);
    expect(c.livrable.sommaire.map((s: any) => s.titre)).toEqual(["Page de test", "Section 1", "Section 2", "Section 3"]); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Une page à partir d'une ligne du sommaire commence bien par ce titre.
    const s1 = c.livrable.sommaire[1];
    const p1 = (await lire(banc, { partie: "livrable", debut: String(s1.ligne), lignes: "3" })).corps as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(p1.texte.startsWith("## Section 1\n")).toBe(true);
    expect(p1.lignesServies).toBe(3);
    // La section de 36 000 caractères ne tient pas en une page : la page s'arrête avant la ligne trop longue.
    const s2 = c.livrable.sommaire[2];
    const p2 = (await lire(banc, { partie: "livrable", debut: String(s2.ligne), lignes: "3" })).corps as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(p2.texte.startsWith("## Section 2\n")).toBe(true);
    expect(p2.texte.length).toBeLessThanOrEqual(PAGE_LIVRABLE_MAX);

    // Pages recollées : exactement le corps.
    let recolle = "";
    let debut = 1;
    let decalage = 0;
    let pages = 0;
    for (;;) {
      const p = (await lire(banc, { partie: "livrable", debut: String(debut), decalage: String(decalage) })).corps as any; // eslint-disable-line @typescript-eslint/no-explicit-any
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

  it("3 bis. une ligne plus longue qu'une page est servie par morceaux et se recolle exactement", async () => {
    const banc = creerBanc();
    const corps = `# Long\n${"x".repeat(40_000)}\nfin`;
    remplir(banc, corps);
    let recolle = "";
    let debut = 1;
    let decalage = 0;
    for (let i = 0; i < 20; i++) {
      const p = (await lire(banc, { partie: "livrable", debut: String(debut), decalage: String(decalage) })).corps as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(p.texte.length).toBeLessThanOrEqual(PAGE_LIVRABLE_MAX);
      recolle += p.texte;
      if (!p.suivant) break;
      ({ debut, decalage } = p.suivant);
    }
    expect(recolle).toBe(corps);
  });

  it("4. vue=complete : corps en égalité profonde avec l'ancien (corps, preuvesVerifiees, identifiants conservés)", async () => {
    const banc = creerBanc();
    const corps = remplir(banc);
    const r = await lire(banc, { vue: "complete" });
    const c = r.corps as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(c.livrable).toEqual({ revisionId: REV2, revisionNumber: 2, titre: "Page", corps });
    expect(c.verdicts).toHaveLength(6);
    expect(c.verdicts[0].preuvesVerifiees).toHaveLength(3);
    expect(c.verdicts[0].companyId).toBe(SOC);
    expect(c.couvertures[0].preuves).toHaveLength(2);
    expect(c.donneesConnexion).toHaveLength(6);
    expect(c.constatsOuverts[0].reviewer).toBeDefined();
    expect(c).not.toHaveProperty("vue");
    expect(c.tache.companyId).toBeUndefined(); // la tâche n'a jamais porté companyId dans le corps historique
    // Même clés qu'avant : aucune clé ajoutée ni perdue.
    expect(Object.keys(c).sort()).toEqual(["boiteReception", "brief", "campagne", "couvertures", "cyclesConsommes", "cyclesMaximum", "donneesConnexion", "exigences", "constatsOuverts", "livrable", "mentionDemonstration", "mode", "porte", "regleDonneesDemo", "relances", "revuesRevisionCourante", "rappelSecurite", "tache", "verdicts"].sort());
  });

  it("5. partie inconnue refusée ; les parties entières renvoient le détail ; isolement entre entreprises pour chaque partie", async () => {
    const banc = creerBanc();
    remplir(banc);
    const inconnue = await lire(banc, { partie: "secrets" });
    expect(inconnue.corps).toMatchObject({ code: "entree_invalide" });
    const v = (await lire(banc, { partie: "verdicts" })).corps as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(v.verdicts).toHaveLength(6);
    expect(v.verdicts[0].preuvesVerifiees).toHaveLength(3);
    expect(((await lire(banc, { partie: "couvertures" })).corps as any).couvertures[0].preuves).toHaveLength(2); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(((await lire(banc, { partie: "donneesConnexion" })).corps as any).donneesConnexion).toHaveLength(6); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const q of [{} as Record<string, string>, { vue: "complete" }, { partie: "livrable" }, { partie: "verdicts" }, { partie: "couvertures" }, { partie: "donneesConnexion" }]) {
      const r = await lire(banc, q, AUTRE_SOC);
      expect(r.corps, JSON.stringify(q)).toMatchObject({ code: "introuvable" });
      expect(JSON.stringify(r.corps)).not.toContain("Constat numéro");
    }
    // Un debut hors livrable est refusé proprement.
    expect((await lire(banc, { partie: "livrable", debut: "999999" })).corps).toMatchObject({ code: "entree_invalide" });
  });
});

void CAMP;
void COORD;

describe("sommaire du livrable : titres et temps borné (revue de sécurité C1)", () => {
  it("garde les titres attendus, retire les # finaux et ignore les blocs de code", () => {
    const corps = ["# Titre ##", "texte", "## C#", "```", "# pas un titre", "```", "### Fin   "].join("\n");
    expect(sommaireDe(corps)).toEqual([{ ligne: 1, titre: "Titre" }, { ligne: 3, titre: "C" }, { ligne: 7, titre: "Fin" }]);
  });
  it("une ligne de titre suivie de 20 000 espaces se traite en moins de 100 ms", () => {
    const corps = "# Titre" + " ".repeat(20_000) + "x\n## Suite";
    const debut = performance.now();
    const s = sommaireDe(corps);
    expect(performance.now() - debut).toBeLessThan(100);
    expect(s).toEqual([{ ligne: 2, titre: "Suite" }]);
  });
});
