/**
 * Lot L9 : garde des données simulées. Règles pures (déduction du mode, chiffres, livrable,
 * porte, diffusion) et branchement dans `evaluerPorte`.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DeposerDonneesConnexionEntree, MENTION_DONNEES_DEMONSTRATION, MotifPorte } from "../src/contrats/index.js";
import { evaluerPorte, type EntreesPorte } from "../src/serveur/porte.js";
import {
  calculerModeEffectif,
  blocsDuLivrable,
  deduireModeReponse,
  extraireChiffres,
  jetonCorrespond,
  nombresDuTexte,
  verifierDiffusionDonneesDemo,
  verifierDonneesDemo,
  type EntreesDonneesDemo,
  type SourcePourGarde,
} from "../src/serveur/regles-donnees-demo.js";
import { emballer, paireEd25519, passerelle } from "./outils-passerelle.js";

// Revue de sécurité §6 bis : une réponse réelle n'est réelle que signée par la passerelle (vraie clé,
// vrai signataire de la passerelle), et liée au service et à l'outil déclarés par le dépôt.
const P = await passerelle();
const CLES = paireEd25519();
const SIGNATAIRE = new P.SignataireEnveloppe(CLES.privee);
// v1.6 (S-6) : une réponse réelle se dépose toujours avec les arguments exacts de son appel.
const VERIF = { clesPubliques: [CLES.publique], service: "gsc", outil: "gsc_requete_performances", arguments: { debut: "2026-09-01", fin: "2026-09-30" }, maintenant: new Date() };

/** Réponse GSC telle que la passerelle l'emballe (`passerelle/src/outils.ts`, `emballer`), signée en mode réel. */
function reponseGsc(mode: "demonstration" | "reel", siteUrl = mode === "demonstration" ? "sc-domain:renovation-liege.example" : "sc-domain:client-reel.be", signer = mode === "reel") {
  const donnees = {
    siteUrl,
    rows: [
      { keys: ["toiture liège", "https://x/toiture"], clicks: 412, impressions: 9870, ctr: 0.0417, position: 3.42 },
      { keys: ["diagnostic toiture", "https://x/diagnostic"], clicks: 280, impressions: 5120, ctr: 0.0547, position: 4.1 },
      { keys: ["châssis ans", "https://x/chassis"], clicks: 542, impressions: 12003, ctr: 0.0452, position: 6.75 },
    ],
    responseAggregationType: "byPage",
  };
  return emballer(signer ? SIGNATAIRE : null, mode, donnees, { service: "gsc", outil: "gsc_requete_performances", compte: siteUrl, args: { debut: "2026-09-01", fin: "2026-09-30" } }) as {
    texte: string;
    structuredContent: Record<string, unknown> & { _atelier: Record<string, unknown> };
  };
}

function sourceDe(mode: "demonstration" | "reel", o: Partial<SourcePourGarde> = {}): SourcePourGarde {
  const d = deduireModeReponse(reponseGsc(mode), VERIF);
  if (!d.ok) throw new Error(d.raison);
  return { id: o.id ?? `src-${mode}`, mode: o.mode ?? d.mode, provenance: o.provenance ?? "connexion", url: o.url ?? "connexion://gsc/gsc_requete_performances", service: "gsc", outil: "gsc_requete_performances", chiffres: o.chiffres ?? extraireChiffres(d.structures) };
}

const R = "rev-courante";
function entrees(corps: string, o: Partial<EntreesDonneesDemo> = {}): EntreesDonneesDemo {
  return { modeEffectif: "demonstration", raisonMode: "campagne en démonstration", livrable: { revisionId: R, corps }, sources: [sourceDe("demonstration")], preuves: [], ...o };
}

describe("déduction du mode d'une réponse de connexion (jamais déclaré par l'agent)", () => {
  it("réponse de démonstration de la passerelle : mode démonstration, indices tracés", () => {
    const d = deduireModeReponse(reponseGsc("demonstration"));
    expect(d.ok && d.mode).toBe("demonstration");
    if (!d.ok) return;
    expect(d.indices).toContain("_atelier.mode = demonstration");
    expect(d.indices).toContain("texte commençant par la mention de démonstration");
    expect(d.indices.some((i) => i.includes("renovation-liege.example"))).toBe(true);
  });
  it("le texte seul suffit (le JSON après la mention est relu)", () => {
    const { texte } = reponseGsc("demonstration");
    const d = deduireModeReponse({ texte });
    expect(d.ok && d.mode).toBe("demonstration");
    expect(d.ok && extraireChiffres(d.structures).length).toBeGreaterThan(10);
  });
  it("réponse réelle signée par la passerelle, sans aucun indice de démonstration : mode réel", () => {
    const d = deduireModeReponse(reponseGsc("reel"), VERIF);
    expect(d.ok && d.mode).toBe("reel");
    expect(d.ok && d.indices.join(" ")).toMatch(/signature de la passerelle vérifiée/u);
  });
  it("enveloppe falsifiée en « reel » sur des données de démonstration : refusée (non signée), jamais réelle", () => {
    const r = reponseGsc("demonstration");
    const falsifiee = { ...r.structuredContent, _atelier: { mode: "reel" } };
    const d = deduireModeReponse({ structuredContent: falsifiee }, VERIF);
    expect(d.ok).toBe(false);
    expect(!d.ok && d.raison).toMatch(/non signée/u);
  });
  it("mention retirée mais enveloppe de démonstration conservée : démonstration", () => {
    const r = reponseGsc("demonstration", "sc-domain:autre.be");
    const d = deduireModeReponse({ structuredContent: r.structuredContent });
    expect(d.ok && d.mode).toBe("demonstration");
  });
  it("texte et données structurées en désaccord : jamais réel (la partie non signée fait refuser le dépôt)", () => {
    const demo = reponseGsc("demonstration", "sc-domain:autre.be");
    const reel = reponseGsc("reel");
    const d = deduireModeReponse({ texte: demo.texte, structuredContent: reel.structuredContent }, VERIF);
    expect(d.ok).toBe(false);
  });
  it("sans enveloppe « _atelier » (réponse retouchée ou inventée) : refus, provenance inconnue", () => {
    const { _atelier: _a, ...nue } = reponseGsc("reel").structuredContent;
    const d = deduireModeReponse({ structuredContent: nue });
    expect(d.ok).toBe(false);
    expect(!d.ok && d.raison).toMatch(/Provenance inconnue/u);
    expect(deduireModeReponse({ texte: "412 clics, 9 870 impressions" }).ok).toBe(false);
  });
  it("enveloppe au mode inconnu : refus", () => {
    expect(deduireModeReponse({ structuredContent: { rows: [], _atelier: { mode: "test" } } }).ok).toBe(false);
  });
  it("le contrat de dépôt refuse tout champ « mode » déclaré par l'agent", () => {
    const base = { service: "gsc", outil: "gsc_requete_performances", reponse: { texte: "x" } };
    expect(DeposerDonneesConnexionEntree.safeParse(base).success).toBe(true);
    expect(DeposerDonneesConnexionEntree.safeParse({ ...base, mode: "reel" }).success).toBe(false);
    expect(DeposerDonneesConnexionEntree.safeParse({ ...base, reponse: { texte: "x", mode: "reel" } }).success).toBe(false);
    expect(DeposerDonneesConnexionEntree.safeParse({ ...base, reponse: {} }).success).toBe(false);
    expect(DeposerDonneesConnexionEntree.safeParse({ ...base, service: "GSC/../x" }).success).toBe(false);
  });
});

describe("chiffres retenus d'une réponse", () => {
  it("valeurs, sommes et moyennes de colonnes ; identifiants et dates ignorés", () => {
    const d = deduireModeReponse(reponseGsc("demonstration"));
    if (!d.ok) throw new Error("déduction");
    const valeurs = extraireChiffres(d.structures).map((c) => c.valeur);
    expect(valeurs).toEqual(expect.arrayContaining([412, 280, 542, 9870, 0.0417, 3.42, 1234, 26993]));
    const avecIds = extraireChiffres([{ campaign: { id: "123456789", resourceName: "customers/1/campaigns/123456789" }, metrics: { costMicros: "45670000", clicks: "321" }, segments: { date: "2026-09-01" } }]);
    expect(avecIds.map((c) => c.valeur)).toEqual(expect.arrayContaining([45670000, 45.67, 321]));
    expect(avecIds.map((c) => c.valeur)).not.toContain(123456789);
  });
  it("les valeurs GA4 (chaînes) comptent, pas les dimensions (dates AAAAMMJJ)", () => {
    const ga4 = { rows: [{ dimensionValues: [{ value: "20260901" }], metricValues: [{ value: "118" }] }, { dimensionValues: [{ value: "20260902" }], metricValues: [{ value: "97" }] }] };
    const v = extraireChiffres([ga4]).map((c) => c.valeur);
    expect(v).toEqual(expect.arrayContaining([118, 97, 215]));
    expect(v).not.toContain(20260901);
  });
});

describe("lecture du livrable", () => {
  it("blocs, lignes et titres de section", () => {
    const b = blocsDuLivrable("# Bilan\n\nPremier paragraphe\nsuite\n\n## Détail\n\n- un\n- deux\n");
    expect(b.map((x) => [x.ligne, x.titres.join(" > ")])).toEqual([[3, "Bilan"], [8, "Bilan > Détail"]]);
  });
  it("nombres en écriture française et anglaise, pourcentages", () => {
    const j = nombresDuTexte("1 234 clics, 9 870 impressions, taux 4,2 %, position 3.4, rue 12/3, 2026-10-15");
    expect(j.map((x) => x.brut)).toEqual(["1 234", "9 870", "4,2 %", "3.4"]);
    expect(jetonCorrespond(j[0]!, 1234)).toBe(true);
    expect(jetonCorrespond(j[2]!, 0.0417)).toBe(true);
    expect(jetonCorrespond(j[3]!, 3.42)).toBe(true);
    // Un entier écrit n'est pas attribué à une valeur décimale arrondie, ni un petit entier à quoi que ce soit.
    expect(jetonCorrespond(nombresDuTexte("12 visites")[0]!, 12.4)).toBe(false);
    expect(jetonCorrespond(nombresDuTexte("3 établissements")[0]!, 3)).toBe(false);
  });
});

describe("porte : campagne de démonstration", () => {
  it("chiffre de démonstration sans mention : REFUS localisé (section, ligne, chiffre, source)", () => {
    const corps = `# Bilan de septembre\n\n_Démonstration : contenu produit par des fixtures._\n\n## Search Console\n\nLa requête « toiture liège » a généré 412 clics.\n`;
    const m = verifierDonneesDemo(entrees(corps));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ code: "donnee_demo_sans_mention", element: "412", sourceId: "src-demonstration", emplacement: "section « Search Console », ligne 7" });
    expect(MotifPorte.safeParse(m[0]).success).toBe(true);
  });
  it("mention dans le paragraphe, ou dans un titre qui le couvre : aucun motif", () => {
    expect(verifierDonneesDemo(entrees("# Bilan\n\nLa requête a généré 412 clics (données de démonstration).\n"))).toEqual([]);
    expect(verifierDonneesDemo(entrees("# Bilan (données de démonstration)\n\n## GSC\n\n412 clics et 9 870 impressions.\n"))).toEqual([]);
    expect(verifierDonneesDemo(entrees("| Requête | Clics |\n| --- | --- |\n| toiture | 412 |\n| Total (démonstration) | 1 234 |\n"))).toEqual([]);
  });
  it("une somme calculée par l'agent est reconnue (1 234 = 412 + 280 + 542)", () => {
    const m = verifierDonneesDemo(entrees("# Bilan\n\nAu total, 1 234 clics.\n"));
    expect(m.map((x) => x.element)).toEqual(["1 234"]);
  });
  it("la source citée par son adresse sans mention : REFUS", () => {
    const m = verifierDonneesDemo(entrees("# Bilan\n\nSource : connexion://gsc/gsc_requete_performances\n"));
    expect(m[0]).toMatchObject({ code: "donnee_demo_sans_mention", element: "connexion://gsc/gsc_requete_performances" });
  });
  it("une preuve qui cite une source de démonstration exige la mention dans le passage", () => {
    const corps = "# Bilan\n\nNotre page phare est la page diagnostic.\n";
    const preuves = [{ revisionId: R, emplacement: "## Bilan", extrait: "Notre page phare est la page diagnostic.", sourceIds: ["src-demonstration"] }];
    expect(verifierDonneesDemo(entrees(corps, { preuves }))[0]).toMatchObject({ code: "donnee_demo_sans_mention", emplacement: "section « Bilan », ligne 3" });
    expect(verifierDonneesDemo(entrees("# Bilan\n\nNotre page phare est la page diagnostic (démonstration).\n", { preuves: [{ ...preuves[0]!, extrait: "Notre page phare est la page diagnostic (démonstration)." }] }))).toEqual([]);
  });
  it("filet : aucun chiffre reconnu mais aucune mention nulle part : REFUS sur le livrable entier", () => {
    const m = verifierDonneesDemo(entrees("# Bilan\n\nLe taux de clic moyen dépasse nettement la moyenne du secteur.\n"));
    expect(m[0]).toMatchObject({ code: "donnee_demo_sans_mention", emplacement: "livrable entier" });
  });
  it("sans donnée de connexion de démonstration, la règle ne s'applique pas (corpus de démonstration, source réelle)", () => {
    const corpus = sourceDe("demonstration", { provenance: "corpus_demonstration", url: "https://exemple/avis" });
    expect(verifierDonneesDemo(entrees("# Bilan\n\n412 clics.\n", { sources: [corpus] }))).toEqual([]);
    expect(verifierDonneesDemo(entrees("# Bilan\n\n412 clics.\n", { sources: [sourceDe("reel")] }))).toEqual([]);
    expect(verifierDonneesDemo(entrees("# Bilan\n\n412 clics.\n", { sources: [] }))).toEqual([]);
  });
});

describe("porte : campagne réelle", () => {
  const reel = { modeEffectif: "reel" as const, raisonMode: "campagne en mode réel" };
  it("toute donnée de démonstration rattachée à la tâche est refusée, même non citée", () => {
    const m = verifierDonneesDemo(entrees("# Bilan\n\nAucun chiffre ici.\n", reel));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ code: "donnee_demo_campagne_reelle", sourceId: "src-demonstration", emplacement: "sources de la tâche" });
  });
  it("même étiquetée « démonstration », une donnée reprise est refusée et localisée", () => {
    const m = verifierDonneesDemo(entrees("# Bilan\n\n## GSC\n\n412 clics (démonstration).\n", reel));
    expect(m.map((x) => [x.code, x.emplacement])).toEqual([
      ["donnee_demo_campagne_reelle", "sources de la tâche"],
      ["donnee_demo_campagne_reelle", "section « GSC », ligne 5"],
    ]);
  });
  it("une lecture d'URL de démonstration (corpus) est aussi interdite en réel", () => {
    const corpus = sourceDe("demonstration", { id: "corpus", provenance: "corpus_demonstration", url: "https://exemple/avis" });
    expect(verifierDonneesDemo(entrees("x", { ...reel, sources: [corpus] }))[0]?.sourceId).toBe("corpus");
  });
  it("une donnée réelle passe", () => {
    expect(verifierDonneesDemo(entrees("# Bilan\n\n412 clics.\n", { ...reel, sources: [sourceDe("reel")] }))).toEqual([]);
  });
});

describe("branchement dans la porte déterministe", () => {
  function porteBase(corps: string, donnees?: Partial<EntreesDonneesDemo>): EntreesPorte {
    const extrait = "Bilan GSC";
    const preuve = { revisionId: R, emplacement: "# Bilan GSC", element: "Bilan GSC", extrait };
    return {
      porte: { exigencesCiblees: ["REQ-001"], revuesRequises: [{ role: "exigences", agentId: "ctrl" }], maxCycles: 3 },
      exigences: [{ code: "REQ-001", obligatoire: true, elementsAttendus: ["Bilan GSC"], exclusionEtat: "aucune", version: 1 }],
      livrable: { revisionId: R },
      couvertures: [{ id: "c", revisionId: R, code: "REQ-001", etat: "couvert", preuves: [preuve], question: null, creeLe: "1" }],
      verdicts: [{ id: "v", revisionId: R, role: "exigences", relecteurId: "ctrl", verdict: "PASS", exigencesExaminees: ["REQ-001"], preuvesVerifiees: [preuve], justification: null, creeLe: "2" }],
      constats: [],
      revisionsDejaRefusees: [],
      ...(donnees ? { donneesDemo: entrees(corps, donnees) } : {}),
    };
  }
  it("chiffre sans mention : REFUS et cycle consommé ; avec mention : PASS", () => {
    const refus = evaluerPorte(porteBase("# Bilan GSC\n\n412 clics.\n", {}));
    expect(refus.decision).toBe("REFUS");
    expect(refus.motifs.map((m) => m.code)).toEqual(["donnee_demo_sans_mention"]);
    expect(refus.cyclesApres).toBe(1);
    expect(evaluerPorte(porteBase("# Bilan GSC\n\n412 clics (démonstration).\n", {})).decision).toBe("PASS");
  });
  it("campagne réelle : REFUS même avec la mention", () => {
    const r = evaluerPorte(porteBase("# Bilan GSC\n\n412 clics (démonstration).\n", { modeEffectif: "reel", raisonMode: "entreprise en mode réel" }));
    expect(r.decision).toBe("REFUS");
    expect(new Set(r.motifs.map((m) => m.code))).toEqual(new Set(["donnee_demo_campagne_reelle"]));
    expect(r.motifs[0]!.message).toContain("entreprise en mode réel");
  });
  it("empreinte : inchangée sans source (compatibilité), différente dès qu'une source compte", () => {
    const sans = evaluerPorte(porteBase("x"));
    const vide = evaluerPorte(porteBase("x", { sources: [] }));
    const avec = evaluerPorte(porteBase("# Bilan GSC\n\n412 clics (démonstration).\n", {}));
    expect(vide.empreinte).toBe(sans.empreinte);
    expect(avec.empreinte).not.toBe(sans.empreinte);
  });
});

describe("diffusion réelle", () => {
  it("refusée si la tâche porte une donnée de démonstration ; simulée (démonstration) : non concernée", () => {
    const corps = "# Bilan\n\n412 clics (démonstration).\n";
    const refus = verifierDiffusionDonneesDemo({ modeDiffusion: "reel", livrable: { revisionId: R, corps }, sources: [sourceDe("demonstration")] });
    expect(refus.ok).toBe(false);
    expect(!refus.ok && refus.motif).toMatch(/^Données de démonstration interdites dans une diffusion réelle/u);
    expect(verifierDiffusionDonneesDemo({ modeDiffusion: "demonstration", livrable: { revisionId: R, corps }, sources: [sourceDe("demonstration")] }).ok).toBe(true);
    expect(verifierDiffusionDonneesDemo({ modeDiffusion: "reel", livrable: { revisionId: R, corps }, sources: [sourceDe("reel")] }).ok).toBe(true);
  });
});

describe("mode effectif (règle prudente du lot L9, affichée dans la campagne)", () => {
  const reglages = (mode: "demonstration" | "reel", existe = true) => ({ existe, modeParDefaut: mode });
  it("réel si la campagne est réelle, quelle que soit l'entreprise", () => {
    expect(calculerModeEffectif({ mode: "reel" }, reglages("demonstration"))).toEqual({ mode: "reel", raison: "campagne en mode réel" });
  });
  it("réel si l'entreprise est réelle, même pour une campagne déclarée en démonstration (raison dite)", () => {
    const r = calculerModeEffectif({ mode: "demonstration" }, reglages("reel"));
    expect(r.mode).toBe("reel");
    expect(r.raison).toContain("entreprise en mode réel");
    expect(r.raison).toContain("déclarée en démonstration");
  });
  it("démonstration seulement si les deux le sont ; des réglages absents ne rendent pas réel", () => {
    expect(calculerModeEffectif({ mode: "demonstration" }, reglages("demonstration")).mode).toBe("demonstration");
    expect(calculerModeEffectif(null, reglages("reel", false)).mode).toBe("demonstration");
    expect(calculerModeEffectif(null, reglages("reel")).mode).toBe("reel");
  });
});

describe("référentiel de l'entreprise de démonstration « Courtier » (scripts/demo/regler-courtier.py)", () => {
  // Le script n'agit sur aucune instance à l'import : on lit seulement le référentiel qu'il produit.
  const script = resolve(import.meta.dirname, "../../scripts/demo/regler-courtier.py");
  const lu = spawnSync("python3", ["-I", "-c", `import importlib.util as u, json, sys; s = u.spec_from_file_location("rc", ${JSON.stringify(script)}); m = u.module_from_spec(s); s.loader.exec_module(m); json.dump(m.referentiel(), sys.stdout)`], { encoding: "utf-8" });

  it("produit un référentiel valide où chaque bureau a une position dans la province de Liège", async () => {
    expect(lu.status, lu.stderr).toBe(0);
    const { ReferentielSaisie } = await import("../src/contrats/index.js");
    const ref = JSON.parse(lu.stdout);
    const saisie = ReferentielSaisie.parse(ref);
    expect(saisie.etablissements).toHaveLength(12);
    for (const e of saisie.etablissements) {
      expect(e.position, e.nom).toBeTruthy();
      expect(e.position!.lat).toBeGreaterThan(50.4);
      expect(e.position!.lat).toBeLessThan(50.8);
      expect(e.position!.lon).toBeGreaterThan(5.2);
      expect(e.position!.lon).toBeLessThan(6.1);
    }
  });

  it("prend la position de chaque bureau dans le référentiel des codes postaux (aucune coordonnée inventée)", async () => {
    const { CODES_POSTAUX_BE } = await import("../src/serveur/codes-postaux-be.js");
    const ref = JSON.parse(lu.stdout) as { etablissements: Array<{ nom: string; codesPostaux: string[]; position: { lat: number; lon: number } }> };
    for (const e of ref.etablissements) {
      const ligne = CODES_POSTAUX_BE.find((l) => l[0] === e.codesPostaux[0]);
      expect(ligne, e.nom).toBeTruthy();
      expect(e.position, e.nom).toEqual({ lat: ligne![1], lon: ligne![2] });
    }
  });
});
