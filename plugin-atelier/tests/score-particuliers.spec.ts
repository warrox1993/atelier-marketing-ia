/**
 * Score des particuliers et étalonnage (correctif du 15/10/2026).
 *
 * Cause constatée sur les instances : les particuliers étaient scorés avec les seuls critères B2B
 * (registre, NACE, adresse impersonnelle, téléphone, site), soit 0 ou 15 points, alors que l'historique
 * de démonstration est scoré par `SCORE_DEMO_CANAL` (30 à 70). Les tranches 0-9 et 10-19 n'étant pas
 * observées, `appliquerEtalonnage` refusait : aucun particulier n'obtenait de probabilité mesurée.
 * Ces tests fixent les critères B2C, leur correspondance avec le barème et l'application de l'étalonnage.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { Prospect } from "../src/contrats/index.js";
import { lireFichierBaseClients } from "../src/serveur/base-clients.js";
import { appliquerEtalonnage, etalonner } from "../src/serveur/etalonnage.js";
import { calculerScore } from "../src/serveur/score-prospects.js";
import { coupureParDefaut, observationsHistorique, SCORE_DEMO_CANAL } from "../src/serveur/services-base-clients.js";
import { criteresDuProspect, extraireB2c, zoneDesservie } from "../src/serveur/services-prospection.js";

const RACINE = fileURLToPath(new URL("../../", import.meta.url));
const DOSSIER_DEMO = join(RACINE, "instance", "demo", "base-clients");
const SOC = "11111111-1111-4111-8111-111111111111";
const DATE = "2026-10-15T10:00:00.000Z";

beforeAll(() => {
  if (!existsSync(join(DOSSIER_DEMO, "historique-opportunites.csv"))) {
    const r = spawnSync(process.execPath, [join(RACINE, "scripts", "demo", "generer-base-clients.mjs")], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`Générateur de démonstration en échec : ${r.stderr}`);
  }
}, 120_000);

/** Poids de démonstration lus dans le script qui les écrit (une seule source de vérité). */
function poidsDuScript(): Record<string, number> {
  const script = readFileSync(join(RACINE, "scripts", "demo", "peupler-prospects.py"), "utf8");
  const bloc = script.match(/^POIDS = \{([\s\S]*?)^\}/mu)?.[1] ?? "";
  return Object.fromEntries([...bloc.matchAll(/"([a-z_]+)":\s*(\d+)/gu)].map((m) => [m[1]!, Number(m[2])]));
}
const POIDS = { version: 2, poids: poidsDuScript() };

const BUREAUX = [{ codesPostaux: ["4000"], communes: ["Liège"] }, { codesPostaux: ["4430"], communes: ["Ans"] }];

function particulier(o: { origine: string; codePostal?: string | null; commune?: string | null; consentement?: boolean; retire?: boolean; offres?: string[] }): Prospect {
  return {
    id: "22222222-2222-4222-8222-222222222222", companyId: SOC, campagneId: null, cible: "particulier", identifiant: { type: "empreinte", valeur: "a".repeat(64) }, numeroBce: null,
    referentiel: { version: 1, entite: null, offres: [], segments: [], etablissement: null, cibleProspection: null }, forme: "personne_physique", denomination: null, nomChiffre: null, nace: [],
    zone: { codePostal: o.codePostal === undefined ? "4000" : o.codePostal, commune: o.commune === undefined ? "Liège" : o.commune, province: "Liège", region: "Wallonie", pays: "BE" },
    coordonnees: [{ canal: "telephone", valeur: "chv1.x", empreinte: "b".repeat(64), nature: "inconnue" }], empreintes: [],
    sources: [{ type: "import", sourceId: null, service: null, outil: null, url: null, collecteLe: DATE }], mode: "demonstration", statut: "nouveau", motifsExclusion: [], score: null, basesLegales: [],
    particulier: {
      origine: o.origine, clientId: null, offresDemandees: o.offres ?? ["habitation"], pseudonyme: "[client-aaaaaaaa]",
      consentements: o.consentement === false ? [] : [{ date: DATE, texteAccepte: "J'accepte d'être recontacté au sujet de ma demande.", source: "simulateur", canauxAutorises: ["courriel"], responsableNomme: "Courtier", reference: "dem-1", retireLe: o.retire ? DATE : null }],
    },
    creeLe: DATE, modifieLe: DATE,
  } as Prospect;
}

const scorer = (p: Prospect) => calculerScore({ criteres: criteresDuProspect(p, null, "test", DATE, BUREAUX).filter((c) => POIDS.poids[c.code] !== undefined), poids: POIDS, calculeLe: DATE }).valeur;

describe("critères B2C du score des particuliers", () => {
  it("un particulier n'est plus scoré sur les critères B2B : critères B2C seulement, tous pondérés par le script de démonstration", () => {
    const codes = criteresDuProspect(particulier({ origine: "simulateur_devis" }), null, "test", DATE, BUREAUX).map((c) => c.code);
    expect(codes).toEqual(["origine_demande_personne", "contact_direct", "consentement_actif", "produit_demande", "zone_desservie"]);
    for (const c of codes) expect(POIDS.poids[c], `poids de ${c} dans peupler-prospects.py`).toBeTypeOf("number");
    expect(codes).not.toContain("telephone_present");
  });

  it("même échelle que le barème de l'historique : devis dans la zone = devis_en_ligne, rendez-vous = bureau, hors zone = appel_sortant", () => {
    expect(scorer(particulier({ origine: "simulateur_devis" }))).toBe(SCORE_DEMO_CANAL.devis_en_ligne);
    expect(scorer(particulier({ origine: "devis_abandonne" }))).toBe(SCORE_DEMO_CANAL.devis_en_ligne);
    expect(scorer(particulier({ origine: "prise_rendez_vous" }))).toBe(SCORE_DEMO_CANAL.bureau);
    expect(scorer(particulier({ origine: "simulateur_devis", codePostal: "4050", commune: "Chaudfontaine" }))).toBe(SCORE_DEMO_CANAL.appel_sortant);
  });

  it("consentement retiré, produit inconnu ou origine non sollicitée : critère non rempli", () => {
    const base = scorer(particulier({ origine: "simulateur_devis" }));
    expect(scorer(particulier({ origine: "simulateur_devis", retire: true }))).toBe(base - POIDS.poids.consentement_actif!);
    expect(scorer(particulier({ origine: "simulateur_devis", offres: [] }))).toBe(base - POIDS.poids.produit_demande!);
    expect(scorer(particulier({ origine: "courrier_adresse" }))).toBe(base - POIDS.poids.origine_demande_personne!);
  });

  it("zone desservie : code postal d'un bureau, sinon commune (sans accents ni casse) ; aucune zone : non", () => {
    expect(zoneDesservie({ codePostal: "4430", commune: null, province: null, region: null, pays: "BE" }, BUREAUX)).toBe(true);
    expect(zoneDesservie({ codePostal: null, commune: "LIEGE", province: null, region: null, pays: "BE" }, BUREAUX)).toBe(true);
    expect(zoneDesservie({ codePostal: "4050", commune: "Chaudfontaine", province: null, region: null, pays: "BE" }, BUREAUX)).toBe(false);
    expect(zoneDesservie({ codePostal: "4000", commune: "Liège", province: null, region: null, pays: "BE" }, [])).toBe(false);
  });

  it("le produit d'une demande de devis est lu (code du référentiel, tirets) ; une fiche client n'en porte pas", () => {
    const fiche = (produit: string) => ({
      id: "dem-1", produit, statut: "termine", personne: { nom: "Personne Fictive", courriel: "[REDACTED-EMAIL-0d8ba21b]", telephone: null },
      adresse: { code_postal: "4000", commune: "Liège" },
      consentement_marketing: { date: "2026-09-01", texte: "J'accepte d'être recontacté au sujet de ma demande.", canaux_a_l_origine: { email: true } },
    });
    const r = extraireB2c("b2c_demandes_devis", [{ demandes: [fiche("epargne_pension"), { ...fiche("??"), id: "dem-2" }] }]);
    expect(r.particuliers.map((p) => p.produit)).toEqual(["epargne-pension", null]);
  });
});

describe("étalonnage du segment particulier appliqué aux particuliers", () => {
  const lu = lireFichierBaseClients({ nomFichier: "historique-opportunites.csv", format: "csv", contenu: readFileSync(join(DOSSIER_DEMO, "historique-opportunites.csv")) });
  if (!lu.ok) throw new Error(lu.motif);
  const { observations } = observationsHistorique(lu.colonnes, lu.lignes, "particulier", "demonstration");
  const { etalonnage: et } = etalonner({
    id: "33333333-3333-4333-8333-333333333333", companyId: SOC, segment: { cible: "particulier", nace: [] }, observations, coupure: coupureParDefaut(observations),
    versionPoids: 2, origines: ["import"], calculeLe: DATE, calculePar: "humain:test", mode: "demonstration",
  });

  it("historique de démonstration : probabilité mesurée (1 420 issues, 153 conversions, Platt)", () => {
    expect(et).toMatchObject({ statut: "probabilite_mesuree", methode: "platt", effectif: 1420, conversions: 153 });
  });

  it("cause du défaut : un score de 15 (ancien score B2B d'un particulier avec téléphone) tombe hors des tranches observées", () => {
    expect(appliquerEtalonnage(et, 15)).toMatchObject({ applique: null, motif: "Aucune issue observée dans cette tranche de score" });
  });

  it("correctif : les demandes de devis (50 dans la zone, 40 hors zone) reçoivent une probabilité mesurée et sa marge", () => {
    for (const origine of ["simulateur_devis", "devis_abandonne"]) {
      for (const hors of [false, true]) {
        const p = particulier({ origine, ...(hors ? { codePostal: "4050", commune: "Chaudfontaine" } : {}) });
        const a = appliquerEtalonnage(et, scorer(p));
        expect(a.motif, `${origine}${hors ? " hors zone" : ""} : ${a.motif}`).toBeNull();
        const m = a.applique!.marge;
        expect(m.borneBasse).toBeLessThanOrEqual(m.probabilite);
        expect(m.probabilite).toBeLessThanOrEqual(m.borneHaute);
      }
    }
  });

  it("historique où la conversion dépend du canal (c121563) : un rendez-vous (60) reçoit aussi une probabilité mesurée, dans l'intervalle observé de sa tranche, plus haute qu'un devis (50)", () => {
    const tranche = et.tranches.find((t) => t.scoreMin === 60)!;
    const rdv = appliquerEtalonnage(et, scorer(particulier({ origine: "prise_rendez_vous" })));
    const devis = appliquerEtalonnage(et, scorer(particulier({ origine: "simulateur_devis" })));
    expect(rdv.motif).toBeNull();
    expect(tranche.probabilitePredite).toBeGreaterThanOrEqual(tranche.borneBasse);
    expect(tranche.probabilitePredite).toBeLessThanOrEqual(tranche.borneHaute);
    expect(rdv.applique!.marge.probabilite).toBeGreaterThan(devis.applique!.marge.probabilite);
  });

  it("garde inchangée : une probabilité hors de l'intervalle observé de sa tranche n'est jamais affichée", () => {
    const fausse = { ...et, tranches: et.tranches.map((t) => (t.scoreMin === 60 ? { ...t, borneBasse: 0.9, borneHaute: 0.95 } : t)) };
    expect(appliquerEtalonnage(fausse, scorer(particulier({ origine: "prise_rendez_vous" })))).toMatchObject({ applique: null, motif: "La probabilité du modèle sort de l'intervalle observé dans cette tranche" });
  });
});
