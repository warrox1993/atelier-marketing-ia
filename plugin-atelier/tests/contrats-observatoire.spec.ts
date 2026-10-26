import { describe, expect, it } from "vitest";
import {
  Affirmation,
  Chapitre,
  CLES_CHAPITRES,
  Dossier,
  Edition,
  Fiche,
  CHAMPS_FICHE,
  PreuveObservatoire,
  Revision,
  STATUTS_VERIFICATION,
  StatutVerification,
  VERSION_SCHEMA_DOSSIER,
} from "../src/contrats/index.js";

const A = "11111111-1111-4111-8111-111111111111";
const P = "21111111-1111-4111-8111-111111111112";
const I = "31111111-1111-4111-8111-111111111113";
const ES = "41111111-1111-4111-8111-111111111114";
const HEX = "a".repeat(64);

const preuveInstantane = { instantaneId: I, essaiId: null, extraitExact: "MIT License", position: 12 };
const preuveEssai = { instantaneId: null, essaiId: ES, extraitExact: "exit 0", position: 0 };

const affirmation = (surcharge: Record<string, unknown> = {}) => ({
  id: A,
  projetId: P,
  chapitre: "ch06",
  texte: "L'outil exporte en JSON.",
  statut: "confirme_doc_officielle",
  confiance: { niveau: 2, motif: "Documentation officielle de l'éditeur" },
  versionConcernee: "1.2.0",
  remplaceePar: null,
  preuves: [preuveInstantane],
  ...surcharge,
});

const champ = (valeur: unknown = null) => ({ valeur, statut: "non_verifie", affirmationId: null });
const fiche = () => {
  const f: Record<string, unknown> = {};
  for (const c of CHAMPS_FICHE) f[c] = champ();
  return f;
};

const chapitreIncomplet = (cle: string) => ({
  cle, etat: "incomplet", motif: "Source non encore collectée", affirmationIds: [], sousChapitres: [], annexes: [],
});
const dossier = () => ({
  schema: VERSION_SCHEMA_DOSSIER,
  projetId: P,
  chapitres: Object.fromEntries(CLES_CHAPITRES.map((c) => [c, chapitreIncomplet(c)])),
});

describe("statuts de vérification", () => {
  it("compte exactement 8 valeurs et refuse une valeur inconnue", () => {
    expect(STATUTS_VERIFICATION).toHaveLength(8);
    expect(StatutVerification.safeParse("verifie_experimentalement").success).toBe(true);
    expect(StatutVerification.safeParse("sûr").success).toBe(false);
  });
});

describe("preuve", () => {
  it("accepte un lien vers un instantané ou vers un essai", () => {
    expect(PreuveObservatoire.safeParse(preuveInstantane).success).toBe(true);
    expect(PreuveObservatoire.safeParse(preuveEssai).success).toBe(true);
  });
  it("refuse deux liens à la fois", () => {
    expect(PreuveObservatoire.safeParse({ ...preuveInstantane, essaiId: ES }).success).toBe(false);
  });
  it("refuse l'absence de lien", () => {
    expect(PreuveObservatoire.safeParse({ ...preuveInstantane, instantaneId: null }).success).toBe(false);
  });
});

describe("affirmation", () => {
  it("accepte une affirmation documentée", () => {
    expect(Affirmation.safeParse(affirmation()).success).toBe(true);
  });
  it("refuse une confiance hors de 0 à 3 ou sans motif", () => {
    expect(Affirmation.safeParse(affirmation({ confiance: { niveau: 4, motif: "x" } })).success).toBe(false);
    expect(Affirmation.safeParse(affirmation({ confiance: { niveau: 1, motif: "" } })).success).toBe(false);
  });
  it("refuse « vérifié expérimentalement » sans preuve de type essai", () => {
    const sansEssai = affirmation({ statut: "verifie_experimentalement", preuves: [preuveInstantane] });
    const r = Affirmation.safeParse(sansEssai);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("essai");
    expect(Affirmation.safeParse(affirmation({ statut: "verifie_experimentalement", preuves: [] })).success).toBe(false);
  });
  it("accepte « vérifié expérimentalement » avec un essai", () => {
    expect(Affirmation.safeParse(affirmation({ statut: "verifie_experimentalement", preuves: [preuveEssai] })).success).toBe(true);
  });
  it("refuse un champ inconnu (strict)", () => {
    expect(Affirmation.safeParse(affirmation({ extra: 1 })).success).toBe(false);
  });
});

describe("fiche", () => {
  it("compte 25 champs et accepte une fiche entièrement à null", () => {
    expect(CHAMPS_FICHE).toHaveLength(25);
    expect(Fiche.safeParse(fiche()).success).toBe(true);
  });
  it("accepte une valeur inventée remplacée par null, avec son statut", () => {
    const f = { ...fiche(), licence: { valeur: null, statut: "non_verifie", affirmationId: null } };
    expect(Fiche.safeParse(f).success).toBe(true);
  });
  it("accepte une valeur renseignée liée à une affirmation", () => {
    const f = { ...fiche(), licence: { valeur: "MIT", statut: "confirme_doc_officielle", affirmationId: A } };
    expect(Fiche.safeParse(f).success).toBe(true);
  });
  it("refuse une valeur renseignée sans affirmation (valeur inventée)", () => {
    const f = { ...fiche(), licence: { valeur: "MIT", statut: "non_verifie", affirmationId: null } };
    const r = Fiche.safeParse(f);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("affirmationId");
  });
  it("refuse une fiche à laquelle il manque un champ", () => {
    const { nom: _nom, ...sansNom } = fiche();
    expect(Fiche.safeParse(sansNom).success).toBe(false);
  });
  it("refuse un champ sans valeur (pas de valeur par défaut)", () => {
    const f = { ...fiche(), nom: { statut: "non_verifie", affirmationId: null } };
    expect(Fiche.safeParse(f).success).toBe(false);
  });
  it("refuse un champ supplémentaire", () => {
    expect(Fiche.safeParse({ ...fiche(), bonus: champ() }).success).toBe(false);
  });
});

describe("chapitre", () => {
  const complet = { cle: "ch02", etat: "complet", motif: null, affirmationIds: [A], sousChapitres: [], annexes: [] };
  it("accepte un chapitre complet avec une affirmation", () => {
    expect(Chapitre.safeParse(complet).success).toBe(true);
  });
  it("refuse un chapitre complet sans affirmation", () => {
    expect(Chapitre.safeParse({ ...complet, affirmationIds: [] }).success).toBe(false);
  });
  it("exige un motif pour incomplet et non_applicable", () => {
    expect(Chapitre.safeParse({ ...complet, etat: "incomplet", motif: null }).success).toBe(false);
    expect(Chapitre.safeParse({ ...complet, etat: "non_applicable", motif: " " }).success).toBe(false);
    expect(Chapitre.safeParse({ ...complet, etat: "non_applicable", motif: "Pas de benchmark pertinent" }).success).toBe(true);
  });
  it("accepte des sous-chapitres typés et des annexes en nombre illimité", () => {
    const sous = Array.from({ length: 30 }, (_, i) => ({ type: "exemple", titre: `Exemple ${i}`, contenuMd: "x" }));
    const annexes = Array.from({ length: 30 }, (_, i) => ({ titre: `Annexe ${i}`, contenuMd: "y" }));
    expect(Chapitre.safeParse({ ...complet, sousChapitres: sous, annexes }).success).toBe(true);
  });
  it("refuse un type de sous-chapitre inconnu", () => {
    const sousChapitres = [{ type: "blabla", titre: "t", contenuMd: "x" }];
    expect(Chapitre.safeParse({ ...complet, sousChapitres }).success).toBe(false);
  });
});

describe("dossier", () => {
  it("accepte 24 chapitres sous le schéma dossier-observatoire/v1", () => {
    expect(VERSION_SCHEMA_DOSSIER).toBe("dossier-observatoire/v1");
    expect(Dossier.safeParse(dossier()).success).toBe(true);
  });
  it("refuse un dossier à 23 chapitres", () => {
    const d = dossier();
    delete (d.chapitres as Record<string, unknown>).ch24;
    expect(Dossier.safeParse(d).success).toBe(false);
  });
  it("refuse un 25e chapitre et une autre version de schéma", () => {
    const d = dossier();
    expect(Dossier.safeParse({ ...d, chapitres: { ...d.chapitres, ch25: chapitreIncomplet("ch24") } }).success).toBe(false);
    expect(Dossier.safeParse({ ...d, schema: "dossier-observatoire/v2" }).success).toBe(false);
  });
  it("refuse un chapitre rangé sous la mauvaise clé", () => {
    const d = dossier();
    (d.chapitres as Record<string, unknown>).ch01 = chapitreIncomplet("ch02");
    expect(Dossier.safeParse(d).success).toBe(false);
  });
});

describe("révision", () => {
  const rev = (s: Record<string, unknown> = {}) => ({
    dossierId: P, langue: "fr", numero: 1, baseRevisionFr: null, contenuMd: "# Dossier", empreinte: HEX, statut: "brouillon", ...s,
  });
  it("accepte une révision française sans base", () => {
    expect(Revision.safeParse(rev()).success).toBe(true);
  });
  it("refuse une révision anglaise sans base FR", () => {
    expect(Revision.safeParse(rev({ langue: "en" })).success).toBe(false);
  });
  it("accepte une révision anglaise avec base FR", () => {
    expect(Revision.safeParse(rev({ langue: "en", baseRevisionFr: 3 })).success).toBe(true);
  });
  it("refuse une langue inconnue", () => {
    expect(Revision.safeParse(rev({ langue: "nl" })).success).toBe(false);
  });
});

describe("édition", () => {
  const ed = {
    numero: 4, periodeDebut: "2026-10-01", periodeFin: "2026-10-31", langue: "fr", version: "2026.10", statut: "brouillon",
    corrections: ["Licence corrigée"],
  };
  it("accepte une édition valide", () => {
    expect(Edition.safeParse(ed).success).toBe(true);
  });
  it("refuse une période inversée", () => {
    expect(Edition.safeParse({ ...ed, periodeFin: "2026-09-01" }).success).toBe(false);
  });
});
