import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BaseLegaleContact,
  ClientBase,
  CorrespondanceColonnes,
  DemanderExportCrmEntree,
  DeposerProspectsEntree,
  ESPACE_BASE,
  EnregistrerParticulierEntree,
  Etalonnage,
  ExportCrm,
  FichePersonneDechiffree,
  ImporterBaseClientsEntree,
  MATRICE_BASES_LEGALES,
  Prospect,
  ROUTES_API,
  ROUTES_CONNAISSANCES_PREVUES,
  ROUTES_PROSPECTION_PREVUES,
  ReferentielClient,
  ScoreProspect,
  moduleActif,
  renvoiValide,
} from "../src/contrats/index.js";
import { CLIENT_B2C, EXPORT_CRM, FICHE_B2C, PROSPECT_B2B, PROSPECT_B2C, REFERENTIEL_COURTIER, REFERENTIEL_RENOVATION } from "../src/contrats/exemples/prospection.js";

const ok = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: unknown[] } } }, v: unknown) => {
  const r = schema.safeParse(v);
  if (!r.success) throw new Error(JSON.stringify(r.error?.issues.slice(0, 5), null, 1));
  return true;
};
const ko = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => schema.safeParse(v).success === false;
const copie = <T>(v: T): T => structuredClone(v);

describe("référentiel du client (marque étendue)", () => {
  it("les deux jeux de démonstration sont valides", () => {
    expect(ok(ReferentielClient, REFERENTIEL_RENOVATION)).toBe(true);
    expect(ok(ReferentielClient, REFERENTIEL_COURTIER)).toBe(true);
  });
  it("une version de marque antérieure (sans listes nouvelles) se relit, sans module actif", () => {
    const { entites, segments, ciblesProspection, modulesConformite, ...ancienne } = copie(REFERENTIEL_RENOVATION);
    void entites; void segments; void ciblesProspection; void modulesConformite;
    ancienne.offres = [{ nom: "x", description: "y", confirmee: true }] as never;
    ancienne.etablissements = [{ nom: "x", adresse: null, confirme: false }] as never;
    const r = ReferentielClient.parse(ancienne);
    expect(r.modulesConformite).toEqual([]);
    expect(moduleActif(r, "intermediaire_assurance", null)).toBe(false);
  });
  it("refuse un code cité qui n'existe pas", () => {
    const r = copie(REFERENTIEL_COURTIER);
    r.offres[0]!.segments = ["inconnu"];
    expect(ko(ReferentielClient, r)).toBe(true);
    const r2 = copie(REFERENTIEL_COURTIER);
    r2.ciblesProspection[0]!.zones.etablissements = ["bureau-absent"];
    expect(ko(ReferentielClient, r2)).toBe(true);
  });
  it("refuse une marque sans entité porteuse et un code en double", () => {
    const r = copie(REFERENTIEL_COURTIER);
    r.entites[2]!.porteePar = null as never;
    expect(ko(ReferentielClient, r)).toBe(true);
    const r2 = copie(REFERENTIEL_COURTIER);
    r2.segments.push({ ...r2.segments[0]! });
    expect(ko(ReferentielClient, r2)).toBe(true);
  });
  it("le module « intermédiaire d'assurance » n'est actif que s'il est activé", () => {
    const r = ReferentielClient.parse(REFERENTIEL_COURTIER);
    expect(moduleActif(r, "intermediaire_assurance", "non-vie")).toBe(true);
    expect(moduleActif(ReferentielClient.parse(REFERENTIEL_RENOVATION), "intermediaire_assurance", "renovation")).toBe(false);
  });
  it("un renvoi ne cite que des codes du référentiel de même version", () => {
    const r = ReferentielClient.parse(REFERENTIEL_COURTIER);
    expect(renvoiValide(PROSPECT_B2C.referentiel as never, r)).toEqual([]);
    expect(renvoiValide({ ...PROSPECT_B2C.referentiel, offres: ["toiture"] } as never, r)).toEqual(["Offre inconnue : toiture"]);
    expect(renvoiValide({ ...PROSPECT_B2C.referentiel, version: 2 } as never, r)).toHaveLength(1);
  });
});

describe("prospects B2B et B2C", () => {
  it("les exemples B2B et B2C sont valides", () => {
    expect(ok(Prospect, PROSPECT_B2B)).toBe(true);
    expect(ok(Prospect, PROSPECT_B2C)).toBe(true);
  });
  it("refuse un champ hors contrat (mode déclaré en entrée de dépôt, champ inconnu)", () => {
    const depot = { service: "bce", outil: "bce_rechercher", reponse: { texte: "x" } };
    expect(ok(DeposerProspectsEntree, depot)).toBe(true);
    expect(ko(DeposerProspectsEntree, { ...depot, mode: "reel" })).toBe(true);
    expect(ko(DeposerProspectsEntree, { ...depot, service: "facebook" })).toBe(true);
    expect(ko(Prospect, { ...PROSPECT_B2B, inconnu: 1 })).toBe(true);
  });
  it("un particulier porte son volet, est une personne physique et n'a pas de BCE", () => {
    expect(ko(Prospect, { ...PROSPECT_B2C, particulier: null })).toBe(true);
    expect(ko(Prospect, { ...PROSPECT_B2B, particulier: PROSPECT_B2C.particulier })).toBe(true);
    expect(ko(Prospect, { ...PROSPECT_B2C, numeroBce: "0123.456.722" })).toBe(true);
    expect(ko(Prospect, { ...PROSPECT_B2C, forme: "personne_morale" })).toBe(true);
  });
  it("un consentement invoqué doit être prouvé, non retiré et couvrir le canal", () => {
    const p = copie(PROSPECT_B2C);
    p.particulier.consentements[0]!.canauxAutorises = ["telephone"];
    expect(ko(Prospect, p)).toBe(true);
    const p2 = copie(PROSPECT_B2C);
    p2.particulier.consentements[0]!.retireLe = "2026-10-15T10:00:00.000Z" as never;
    expect(ko(Prospect, p2)).toBe(true);
  });
  it("une origine qui exige un consentement en porte un ; un client existant désigne sa fiche", () => {
    const p = copie(PROSPECT_B2C);
    p.particulier.consentements = [];
    p.basesLegales = [];
    expect(ko(Prospect, p)).toBe(true);
    const p2 = copie(PROSPECT_B2C);
    p2.particulier.origine = "client_existant";
    expect(ko(Prospect, p2)).toBe(true);
  });
  it("exclu ⇔ au moins un motif", () => {
    expect(ko(Prospect, { ...PROSPECT_B2B, statut: "exclu" })).toBe(true);
    expect(ok(Prospect, { ...PROSPECT_B2B, statut: "exclu", motifsExclusion: [{ motif: "client_actuel", detail: "Déjà client", constateLe: PROSPECT_B2B.creeLe }] })).toBe(true);
  });
  it("une personne physique professionnelle ne vient jamais de la BCE", () => {
    expect(ko(Prospect, { ...PROSPECT_B2B, forme: "personne_physique", basesLegales: [] })).toBe(true);
  });
  it("enregistrement d'un particulier : origine, consentement, aucun mode", () => {
    const e = {
      companyId: PROSPECT_B2C.companyId,
      referentiel: PROSPECT_B2C.referentiel,
      coordonnees: FICHE_B2C.coordonnees,
      zone: PROSPECT_B2C.zone,
      origine: "simulateur_devis",
      consentements: PROSPECT_B2C.particulier.consentements,
    };
    expect(ok(EnregistrerParticulierEntree, e)).toBe(true);
    expect(ko(EnregistrerParticulierEntree, { ...e, consentements: [] })).toBe(true);
    expect(ko(EnregistrerParticulierEntree, { ...e, mode: "reel" })).toBe(true);
  });
});

describe("matrice canal × cible", () => {
  const base = PROSPECT_B2C.basesLegales[0]!;
  it("particulier : courriel et SMS seulement avec consentement ou client existant", () => {
    expect(MATRICE_BASES_LEGALES.particulier.courriel).toEqual(["consentement", "client_existant_produits_analogues"]);
    for (const b of ["interet_legitime", "personne_morale_adresse_impersonnelle"]) {
      expect(ko(BaseLegaleContact, { ...base, base: b, preuve: { ...base.preuve, type: "source" } })).toBe(true);
      expect(ko(BaseLegaleContact, { ...base, canal: "sms", base: b, preuve: { ...base.preuve, type: "source" } })).toBe(true);
    }
  });
  it("téléphone : vérification « Ne m'appelez plus » obligatoire, pour toutes les cibles", () => {
    const tel = PROSPECT_B2C.basesLegales[1]!;
    expect(ok(BaseLegaleContact, tel)).toBe(true);
    expect(ko(BaseLegaleContact, { ...tel, dncmVerifieLe: null })).toBe(true);
    expect(ko(BaseLegaleContact, { ...PROSPECT_B2B.basesLegales[0]!, canal: "telephone", base: "interet_legitime", natureAdresse: "inconnue", dncmVerifieLe: null })).toBe(true);
  });
  it("B2B : adresse impersonnelle d'une personne morale seulement ; nominative = consentement", () => {
    const b2b = PROSPECT_B2B.basesLegales[0]!;
    expect(ok(BaseLegaleContact, b2b)).toBe(true);
    expect(ko(BaseLegaleContact, { ...b2b, forme: "personne_physique" })).toBe(true);
    expect(ko(BaseLegaleContact, { ...b2b, natureAdresse: "nominative" })).toBe(true);
    expect(ko(BaseLegaleContact, { ...b2b, base: "interet_legitime" })).toBe(true);
  });
});

describe("score et étalonnage (les deux cibles)", () => {
  it("valeur = somme des points bornée ; estimation sans étalonnage", () => {
    expect(ok(ScoreProspect, PROSPECT_B2B.score)).toBe(true);
    expect(ko(ScoreProspect, { ...PROSPECT_B2B.score, valeur: 56 })).toBe(true);
    expect(ko(ScoreProspect, { ...PROSPECT_B2B.score, nature: "probabilite_mesuree" })).toBe(true);
    expect(ko(ScoreProspect, { ...PROSPECT_B2B.score, nature: "certitude" })).toBe(true);
  });
  it("probabilité mesurée seulement au-dessus des seuils, avec une marge cohérente", () => {
    const s = PROSPECT_B2C.score;
    expect(ok(ScoreProspect, s)).toBe(true);
    expect(ko(ScoreProspect, { ...s, etalonnage: { ...s.etalonnage, effectif: 299 } })).toBe(true);
    expect(ko(ScoreProspect, { ...s, etalonnage: { ...s.etalonnage, conversions: 29 } })).toBe(true);
    expect(ko(ScoreProspect, { ...s, etalonnage: { ...s.etalonnage, marge: { ...s.etalonnage.marge, borneBasse: 0.2 } } })).toBe(true);
  });
  it("étalonnage : seuils, Platt avec paramètres, isotonique au-delà de 1 000", () => {
    const e = {
      id: "e1111111-1111-4111-8111-111111111111", companyId: PROSPECT_B2C.companyId,
      segment: { cible: "particulier", nace: [] }, methode: "platt", parametres: { a: -0.05, b: 2.1 },
      separation: "decoupage_temporel", horizonJours: 90, effectif: 412, conversions: 61, brier: 0.12,
      tranches: [{ scoreMin: 60, scoreMax: 79, effectif: 120, conversions: 22, tauxObserve: 0.18, probabilitePredite: 0.19, borneBasse: 0.12, borneHaute: 0.26 }],
      statut: "probabilite_mesuree", versionPoids: 1,
      donnees: { debut: "2025-10-01", fin: "2026-09-30", origines: ["crm"] },
      calculeLe: PROSPECT_B2C.creeLe, calculePar: "local-board", mode: "demonstration",
    };
    expect(ok(Etalonnage, e)).toBe(true);
    expect(ok(Etalonnage, { ...e, segment: { cible: "entreprise", nace: ["86"] } })).toBe(true);
    expect(ko(Etalonnage, { ...e, effectif: 200 })).toBe(true);
    expect(ko(Etalonnage, { ...e, methode: "isotonique" })).toBe(true);
    expect(ko(Etalonnage, { ...e, parametres: null })).toBe(true);
  });
});

describe("base de clients", () => {
  it("client particulier valide ; aucun BCE pour un particulier ; chiffrement exigé", () => {
    expect(ok(ClientBase, CLIENT_B2C)).toBe(true);
    expect(ko(ClientBase, { ...CLIENT_B2C, numeroBce: "0123.456.722" })).toBe(true);
    expect(ko(ClientBase, { ...CLIENT_B2C, donneesChiffrees: { nom: "Camille Exemple" } })).toBe(true);
    expect(ko(ClientBase, { ...CLIENT_B2C, pseudonyme: "Camille" })).toBe(true);
  });
  it("import : correspondance avec un identifiant, extension cohérente, macros refusées", () => {
    const correspondance = [{ colonne: "Courriel", cible: "courriel" }, { colonne: "CP", cible: "code_postal" }];
    const e = { companyId: CLIENT_B2C.companyId, nomFichier: "clients.csv", format: "csv", contenuBase64: "YQ==", correspondance, finalite: "Ventes croisées et exclusion des clients actuels" };
    expect(ok(ImporterBaseClientsEntree, e)).toBe(true);
    expect(ko(ImporterBaseClientsEntree, { ...e, nomFichier: "clients.xlsm", format: "xlsx" })).toBe(true);
    expect(ko(ImporterBaseClientsEntree, { ...e, nomFichier: "clients.xlsx" })).toBe(true);
    expect(ko(CorrespondanceColonnes, [{ colonne: "CP", cible: "code_postal" }])).toBe(true);
  });
  it("fiche déchiffrée de démonstration : coordonnées manifestement fictives", () => {
    expect(ok(FichePersonneDechiffree, FICHE_B2C)).toBe(true);
    expect(ko(FichePersonneDechiffree, { ...FICHE_B2C, coordonnees: { ...FICHE_B2C.coordonnees, courriel: "camille@courrier-reel.be" } })).toBe(true);
    expect(ko(FichePersonneDechiffree, { ...FICHE_B2C, coordonnees: { ...FICHE_B2C.coordonnees, nom: "Camille Exemple" } })).toBe(true);
  });
});

describe("export vers le CRM sous preuve", () => {
  it("exemple simulé valide ; préparé ou confirmé exige une diffusion ; démo jamais confirmée", () => {
    expect(ok(ExportCrm, EXPORT_CRM)).toBe(true);
    expect(ko(ExportCrm, { ...EXPORT_CRM, etat: "preparee" })).toBe(true);
    expect(ko(ExportCrm, { ...EXPORT_CRM, etat: "confirmee", diffusionId: "f1111111-1111-4111-8111-111111111112" })).toBe(true);
    expect(ko(ExportCrm, { ...EXPORT_CRM, etat: "refusee" })).toBe(true);
  });
  it("la demande n'accepte ni preuve ni mode, et exige l'entité", () => {
    const d = { prospectIds: EXPORT_CRM.prospectIds, canal: "courriel", service: "crm", entite: "non-vie", cleIdempotence: "export-demo-0001" };
    expect(ok(DemanderExportCrmEntree, d)).toBe(true);
    expect(ko(DemanderExportCrmEntree, { ...d, preuveApprobation: "apv1.x" })).toBe(true);
    expect(ko(DemanderExportCrmEntree, { ...d, mode: "reel" })).toBe(true);
    const { entite, ...sansEntite } = d;
    void entite;
    expect(ko(DemanderExportCrmEntree, sansEntite)).toBe(true);
  });
});

describe("marqueurs de démonstration et routes prévues", () => {
  it("les routes prévues ne recouvrent ni entre elles ni les routes déjà servies", () => {
    const toutes = [...ROUTES_API, ...ROUTES_PROSPECTION_PREVUES, ...ROUTES_CONNAISSANCES_PREVUES];
    expect(new Set(toutes.map((r) => r.cle)).size).toBe(toutes.length);
    expect(new Set(toutes.map((r) => `${r.methode} ${r.chemin}`)).size).toBe(toutes.length);
  });
});

describe("migrations 007 et 008 (règles statiques du validateur de l'hôte)", () => {
  const dossier = new URL("../migrations/", import.meta.url);
  const fichiers = readdirSync(dossier).filter((f) => f.endsWith(".sql"));
  for (const f of fichiers.filter((x) => x >= "007")) {
    const sql = readFileSync(new URL(f, dossier), "utf8");
    it(`${f} : aucun commentaire avec une apostrophe droite`, () => {
      expect(sql.split("\n").filter((l) => l.trimStart().startsWith("--") && l.includes("'"))).toEqual([]);
    });
    it(`${f} : aucune instruction interdite ni schéma étranger`, () => {
      const sansChaines = sql.replace(/'([^']|'')*'/gu, "''").replace(/--.*$/gmu, "").toLowerCase();
      for (const motif of [/\bcreate\s+extension\b/u, /\bcreate\s+(or\s+replace\s+)?function\b/u, /\btrigger\b/u, /\bgrant\b/u, /\bcopy\b/u, /\bdelete\s+from\b/u, /^\s*drop\s+table\b/mu]) {
        expect(motif.test(sansChaines)).toBe(false);
      }
      const schemas = new Set([...sansChaines.matchAll(/\b(?:table|on|references|exists)\s+([a-z_][a-z0-9_]*)\.[a-z_]/gu)].map((m) => m[1]));
      for (const s of schemas) expect([ESPACE_BASE, "public"]).toContain(s);
    });
  }
});
