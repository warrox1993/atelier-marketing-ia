/**
 * Lot P5 : règles pures de la prospection (§3.2 matrice canal × cible, §5.4 exclusions).
 * Toutes les personnes et entreprises sont fictives ; numéros BCE calculés pour le test.
 */
import { describe, expect, it } from "vitest";
import {
  BaseLegaleContact as BaseLegaleContactSchema,
  DNCM_VALIDITE_JOURS,
  MotifExclusion,
  Prospect as ProspectSchema,
  type BaseLegale,
  type BaseLegaleContact,
  type CanalContact,
  type Empreinte,
  type Prospect,
} from "../src/contrats/index.js";
import {
  bceValide,
  contactPermis,
  courrielValide,
  dedoublonner,
  exclusionsProspect,
  natureAdresse,
  telephoneBelgeE164,
  verificationDncmFraiche,
  type ContexteContact,
} from "../src/serveur/regles-prospection.js";

/* ------------------------------------------------------------------ */
/* Fabriques                                                           */
/* ------------------------------------------------------------------ */

const MAINTENANT = "2026-10-15T10:00:00+02:00";
const HIER = "2026-10-14T09:00:00+02:00";
const h = (n: number) => n.toString(16).padStart(64, "0");
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const CHIFFRE = "chv1.0123456789abcdef.AAAAAAAAAAAAAAAA.Q2hpZmZyZQ.AAAAAAAAAAAAAAAAAAAAAA";

/** Empreintes fictives des coordonnées de chaque prospect. */
const E = { courriel: h(1), tel: h(2), sms: h(3), nomCp: h(4), client: h(5) };

const TEXTE_ART14 = "Vos données viennent de la source citée ; vous pouvez vous opposer à tout moment.";

function consentement(canaux: CanalContact[], retireLe: string | null = null) {
  return {
    date: "2026-09-01T12:00:00+02:00",
    texteAccepte: "J'accepte d'être recontacté au sujet de ma demande de devis.",
    source: "formulaire du site",
    canauxAutorises: canaux,
    responsableNomme: "Courtier fictif",
    reference: "soumission-0001",
    retireLe,
  };
}

type Situation = "entreprise_impersonnelle" | "salarie_nomme" | "partenaire_personne_physique" | "particulier_prospect" | "client_existant";

/** Prospect fictif d'une situation de la matrice §3.2, avec une coordonnée par canal. */
function prospect(situation: Situation, modifs: Partial<Prospect> = {}): Prospect {
  const nature = situation === "entreprise_impersonnelle" ? "impersonnelle" : "nominative";
  const cible = situation === "partenaire_personne_physique" ? "partenaire" : situation.startsWith("particulier") || situation === "client_existant" ? "particulier" : "entreprise";
  const forme = cible === "entreprise" ? "personne_morale" : "personne_physique";
  const estParticulier = cible === "particulier";
  const base: Prospect = {
    id: id(1),
    companyId: id(99),
    campagneId: null,
    cible,
    identifiant: { type: "empreinte", valeur: h(100) },
    numeroBce: cible === "entreprise" ? "0123.456.749" : null,
    referentiel: { version: 1, entite: null, offres: [], segments: [], etablissement: null, cibleProspection: null },
    forme,
    denomination: cible === "entreprise" ? "Toitures Fictives SRL" : null,
    nomChiffre: estParticulier || forme === "personne_physique" ? CHIFFRE : null,
    nace: [],
    zone: { codePostal: "4000", commune: "Liège", province: "Liège", region: "Wallonie", pays: "BE" },
    coordonnees: [
      { canal: "courriel", valeur: CHIFFRE, empreinte: E.courriel, nature },
      { canal: "sms", valeur: CHIFFRE, empreinte: E.sms, nature },
      { canal: "telephone", valeur: CHIFFRE, empreinte: E.tel, nature: "inconnue" },
      { canal: "courrier", valeur: CHIFFRE, empreinte: E.nomCp, nature: "inconnue" },
    ],
    empreintes: [{ type: "nom_code_postal", valeur: E.nomCp }],
    sources: [{ type: "import", sourceId: null, service: null, outil: null, url: null, collecteLe: HIER }],
    mode: "reel",
    statut: "nouveau",
    motifsExclusion: [],
    score: null,
    basesLegales: [],
    particulier: !estParticulier
      ? null
      : situation === "client_existant"
        ? { origine: "client_existant", consentements: [], offresDemandees: [], clientId: id(50), pseudonyme: "[client-7f3a]" }
        : { origine: "formulaire_entrant", consentements: [consentement(["courriel", "sms", "telephone"])], offresDemandees: [], clientId: null, pseudonyme: "[client-0b1c]" },
    creeLe: HIER,
    modifieLe: HIER,
  };
  return { ...base, ...modifs };
}

const PREUVE_PAR_BASE: Record<BaseLegale, BaseLegaleContact["preuve"]["type"]> = {
  consentement: "consentement",
  interet_legitime: "source",
  client_existant_produits_analogues: "relation_client",
  personne_morale_adresse_impersonnelle: "source",
};

/** Base légale enregistrée pour le prospect et le canal ; `preuve` et `natureAdresse` ajustables. */
function baseLegale(p: Prospect, canal: CanalContact, base: BaseLegale, modifs: Partial<BaseLegaleContact> & { preuveType?: BaseLegaleContact["preuve"]["type"] } = {}): BaseLegaleContact {
  const { preuveType, ...reste } = modifs;
  const electronique = canal === "courriel" || canal === "sms";
  return {
    prospectId: p.id,
    cible: p.cible,
    forme: p.forme,
    canal,
    base,
    natureAdresse: electronique ? (p.coordonnees.find((c) => c.canal === canal)?.nature ?? "inconnue") : "inconnue",
    preuve: { type: preuveType ?? PREUVE_PAR_BASE[base], reference: "ref-preuve-001", date: HIER },
    information: { texteArt14: TEXTE_ART14, moyenOpposition: "lien de désinscription" },
    dncmVerifieLe: canal === "telephone" ? HIER : null,
    verifieLe: HIER,
    verifiePar: "humain",
    ...reste,
  };
}

function contexte(modifs: Partial<ContexteContact> = {}): ContexteContact {
  return {
    maintenant: MAINTENANT,
    modeCampagne: "reel",
    canaux: ["courriel", "sms", "telephone", "courrier"],
    zone: null,
    oppositions: [],
    dncm: { empreintes: [], verifieeLe: HIER },
    clientsActuels: [],
    ...modifs,
  };
}

/* ------------------------------------------------------------------ */
/* Contrôles de forme                                                  */
/* ------------------------------------------------------------------ */

describe("bceValide (modulo 97)", () => {
  it("accepte un numéro commençant par 0 ou par 1, avec ou sans points, avec préfixe BE", () => {
    expect(bceValide("0123.456.749")).toBe(true);
    expect(bceValide("0234567873")).toBe(true);
    expect(bceValide("1000.000.120")).toBe(true);
    expect(bceValide("BE 1987.654.318")).toBe(true);
  });
  it("refuse une clé fausse (dont le format de démonstration 0123.456.789), un premier chiffre 2 et une longueur fausse", () => {
    expect(bceValide("0123.456.789")).toBe(false);
    expect(bceValide("1000.000.121")).toBe(false);
    expect(bceValide("2000.000.120")).toBe(false);
    expect(bceValide("0123.456.74")).toBe(false);
    expect(bceValide("abcd.efg.hij")).toBe(false);
  });
  it("accepte la clé 97 quand les 8 premiers chiffres sont un multiple de 97", () => {
    expect(bceValide("0000.000.097")).toBe(true);
    expect(bceValide("0000.000.000")).toBe(false);
  });
});

describe("telephoneBelgeE164", () => {
  it("normalise +32, 0032 et le format national 04…", () => {
    expect(telephoneBelgeE164("+32 470 12 34 56")).toBe("+32470123456");
    expect(telephoneBelgeE164("0470/12.34.56")).toBe("+32470123456");
    expect(telephoneBelgeE164("0032 470 12 34 56")).toBe("+32470123456");
    expect(telephoneBelgeE164("04 123 45 67")).toBe("+3241234567");
    expect(telephoneBelgeE164("(02) 123-45-67")).toBe("+3221234567");
  });
  it("refuse un numéro étranger, trop court, trop long ou non numérique", () => {
    expect(telephoneBelgeE164("+33 6 12 34 56 78")).toBeNull();
    expect(telephoneBelgeE164("0470 12 34")).toBeNull();
    expect(telephoneBelgeE164("+32 470 12 34 56 7")).toBeNull();
    expect(telephoneBelgeE164("appelez-moi")).toBeNull();
    expect(telephoneBelgeE164("00 470 12 34 56")).toBeNull();
  });
});

describe("courrielValide et natureAdresse", () => {
  it("valide la syntaxe", () => {
    expect(courrielValide("info@toitures-fictives.example")).toBe(true);
    expect(courrielValide("a.b+tag@exemple.invalid")).toBe(true);
    expect(courrielValide("sans-arobase.example")).toBe(false);
    expect(courrielValide("a..b@example.com")).toBe(false);
    expect(courrielValide("a@example")).toBe(false);
    expect(courrielValide(`${"x".repeat(65)}@example.com`)).toBe(false);
  });
  it("classe impersonnelle, nominative ou inconnue", () => {
    for (const a of ["info@x.example", "Contact@x.example", "bureau@x.example", "secretariat@x.example", "admin@x.example", "hello@x.example", "info-liege@x.example", "info2@x.example", "SECRETARIAT@x.example"]) {
      expect(natureAdresse(a), a).toBe("impersonnelle");
    }
    expect(natureAdresse("jeanne.fictive@x.example")).toBe("nominative");
    expect(natureAdresse("j.fictive@x.example")).toBe("nominative");
    expect(natureAdresse("jfictive@x.example")).toBe("inconnue");
    expect(natureAdresse("pas-une-adresse")).toBe("inconnue");
  });
});

/* ------------------------------------------------------------------ */
/* Fixtures conformes aux contrats                                     */
/* ------------------------------------------------------------------ */

describe("fabriques", () => {
  it.each<Situation>(["entreprise_impersonnelle", "salarie_nomme", "partenaire_personne_physique", "particulier_prospect", "client_existant"])(
    "le prospect « %s » respecte le contrat Prospect",
    (s) => {
      expect(ProspectSchema.safeParse(prospect(s)).success).toBe(true);
    },
  );
  it("les bases légales des cas permis respectent le contrat BaseLegaleContact", () => {
    const p = prospect("entreprise_impersonnelle");
    expect(BaseLegaleContactSchema.safeParse(baseLegale(p, "courriel", "personne_morale_adresse_impersonnelle")).success).toBe(true);
    expect(BaseLegaleContactSchema.safeParse(baseLegale(p, "telephone", "interet_legitime", { preuveType: "mise_en_balance" })).success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Matrice canal × cible (§3.2) : 5 situations × 4 canaux             */
/* ------------------------------------------------------------------ */

interface CasMatrice {
  situation: Situation;
  canal: CanalContact;
  /** Fabrique le prospect, la base et le contexte. */
  cas: () => { p: Prospect; b: BaseLegaleContact | null; ctx: ContexteContact };
  /** Fragment attendu dans le motif d'un refus. */
  refus?: string;
}

const simple = (s: Situation, canal: CanalContact, base: BaseLegale, opts: Parameters<typeof baseLegale>[3] = {}, ctx: Partial<ContexteContact> = {}, pm: Partial<Prospect> = {}) => () => {
  const p = prospect(s, pm);
  return { p, b: baseLegale(p, canal, base, opts), ctx: contexte(ctx) };
};

const PERMIS: CasMatrice[] = [
  { situation: "entreprise_impersonnelle", canal: "courriel", cas: simple("entreprise_impersonnelle", "courriel", "personne_morale_adresse_impersonnelle") },
  { situation: "entreprise_impersonnelle", canal: "sms", cas: simple("entreprise_impersonnelle", "sms", "personne_morale_adresse_impersonnelle") },
  { situation: "entreprise_impersonnelle", canal: "telephone", cas: simple("entreprise_impersonnelle", "telephone", "interet_legitime", { preuveType: "mise_en_balance" }) },
  { situation: "entreprise_impersonnelle", canal: "courrier", cas: simple("entreprise_impersonnelle", "courrier", "interet_legitime") },
  { situation: "salarie_nomme", canal: "courriel", cas: simple("salarie_nomme", "courriel", "consentement") },
  { situation: "salarie_nomme", canal: "sms", cas: simple("salarie_nomme", "sms", "consentement") },
  { situation: "salarie_nomme", canal: "telephone", cas: simple("salarie_nomme", "telephone", "interet_legitime", { preuveType: "mise_en_balance" }) },
  { situation: "salarie_nomme", canal: "courrier", cas: simple("salarie_nomme", "courrier", "interet_legitime") },
  { situation: "partenaire_personne_physique", canal: "courriel", cas: simple("partenaire_personne_physique", "courriel", "consentement") },
  { situation: "partenaire_personne_physique", canal: "sms", cas: simple("partenaire_personne_physique", "sms", "consentement") },
  { situation: "partenaire_personne_physique", canal: "telephone", cas: simple("partenaire_personne_physique", "telephone", "interet_legitime", { preuveType: "mise_en_balance" }) },
  { situation: "partenaire_personne_physique", canal: "courrier", cas: simple("partenaire_personne_physique", "courrier", "interet_legitime") },
  { situation: "particulier_prospect", canal: "courriel", cas: simple("particulier_prospect", "courriel", "consentement") },
  { situation: "particulier_prospect", canal: "sms", cas: simple("particulier_prospect", "sms", "consentement") },
  { situation: "particulier_prospect", canal: "telephone", cas: simple("particulier_prospect", "telephone", "consentement") },
  { situation: "particulier_prospect", canal: "courrier", cas: simple("particulier_prospect", "courrier", "interet_legitime", { preuveType: "source" }) },
  { situation: "client_existant", canal: "courriel", cas: simple("client_existant", "courriel", "client_existant_produits_analogues", {}, { produitsAnalogues: true }) },
  { situation: "client_existant", canal: "sms", cas: simple("client_existant", "sms", "client_existant_produits_analogues", {}, { produitsAnalogues: true }) },
  { situation: "client_existant", canal: "telephone", cas: simple("client_existant", "telephone", "interet_legitime", { preuveType: "mise_en_balance" }) },
  { situation: "client_existant", canal: "courrier", cas: simple("client_existant", "courrier", "interet_legitime", { preuveType: "source" }) },
];

const REFUS: CasMatrice[] = [
  { situation: "entreprise_impersonnelle", canal: "courriel", cas: simple("entreprise_impersonnelle", "courriel", "interet_legitime"), refus: "non permise" },
  { situation: "entreprise_impersonnelle", canal: "sms", cas: simple("entreprise_impersonnelle", "sms", "client_existant_produits_analogues", {}, { produitsAnalogues: true }), refus: "Pas client existant" },
  { situation: "entreprise_impersonnelle", canal: "telephone", cas: simple("entreprise_impersonnelle", "telephone", "interet_legitime", { preuveType: "mise_en_balance" }, { dncm: null }), refus: "non consultée" },
  { situation: "entreprise_impersonnelle", canal: "courrier", cas: () => ({ p: prospect("entreprise_impersonnelle"), b: null, ctx: contexte() }), refus: "Aucune base légale" },
  { situation: "salarie_nomme", canal: "courriel", cas: simple("salarie_nomme", "courriel", "personne_morale_adresse_impersonnelle"), refus: "consentement préalable obligatoire" },
  { situation: "salarie_nomme", canal: "sms", cas: simple("salarie_nomme", "sms", "personne_morale_adresse_impersonnelle", { natureAdresse: "impersonnelle" }), refus: "consentement préalable obligatoire" },
  {
    situation: "salarie_nomme",
    canal: "telephone",
    cas: simple("salarie_nomme", "telephone", "interet_legitime", { preuveType: "mise_en_balance" }, { dncm: { empreintes: [{ type: "telephone", valeur: E.tel }], verifieeLe: HIER } }),
    refus: "liste_dncm",
  },
  { situation: "salarie_nomme", canal: "courrier", cas: simple("salarie_nomme", "courrier", "interet_legitime", {}, { oppositions: [{ type: "nom_code_postal", valeur: E.nomCp }] }), refus: "opposition_client" },
  { situation: "partenaire_personne_physique", canal: "courriel", cas: simple("partenaire_personne_physique", "courriel", "personne_morale_adresse_impersonnelle", { natureAdresse: "impersonnelle" }), refus: "personne morale seulement" },
  { situation: "partenaire_personne_physique", canal: "sms", cas: simple("partenaire_personne_physique", "sms", "client_existant_produits_analogues", {}, { produitsAnalogues: true }), refus: "Pas client existant" },
  { situation: "partenaire_personne_physique", canal: "telephone", cas: simple("partenaire_personne_physique", "telephone", "interet_legitime", { preuveType: "source" }), refus: "mise en balance" },
  {
    situation: "partenaire_personne_physique",
    canal: "courrier",
    cas: () => {
      const p = prospect("partenaire_personne_physique");
      return { p, b: baseLegale(p, "telephone", "interet_legitime", { preuveType: "mise_en_balance" }), ctx: contexte() };
    },
    refus: "vise le canal telephone",
  },
  {
    situation: "particulier_prospect",
    canal: "courriel",
    cas: simple("particulier_prospect", "courriel", "consentement", {}, {}, {
      particulier: { origine: "formulaire_entrant", consentements: [consentement(["courriel", "sms", "telephone"], "2026-10-01T12:00:00+02:00")], offresDemandees: [], clientId: null, pseudonyme: "[client-0b1c]" },
    }),
    refus: "aucun consentement prouvé, non retiré",
  },
  {
    situation: "particulier_prospect",
    canal: "sms",
    cas: simple("particulier_prospect", "sms", "consentement", {}, {}, {
      particulier: { origine: "formulaire_entrant", consentements: [consentement(["courriel"])], offresDemandees: [], clientId: null, pseudonyme: "[client-0b1c]" },
    }),
    refus: "couvrant le canal sms",
  },
  { situation: "particulier_prospect", canal: "telephone", cas: simple("particulier_prospect", "telephone", "consentement", { dncmVerifieLe: "2026-09-10T10:00:00+02:00" }), refus: "périmée" },
  { situation: "particulier_prospect", canal: "courrier", cas: simple("particulier_prospect", "courrier", "interet_legitime", { preuveType: "mise_en_balance" }), refus: "source licite" },
  { situation: "client_existant", canal: "courriel", cas: simple("client_existant", "courriel", "client_existant_produits_analogues", {}, { produitsAnalogues: false }), refus: "non analogues" },
  { situation: "client_existant", canal: "sms", cas: simple("client_existant", "sms", "interet_legitime"), refus: "non permise" },
  { situation: "client_existant", canal: "telephone", cas: simple("client_existant", "telephone", "client_existant_produits_analogues", {}, { produitsAnalogues: true }), refus: "non permise" },
  { situation: "client_existant", canal: "courrier", cas: simple("client_existant", "courrier", "interet_legitime", { preuveType: "source" }, {}, { mode: "demonstration" }), refus: "donnee_demonstration_campagne_reelle" },
];

describe("contactPermis : matrice canal × cible (§3.2)", () => {
  it("couvre les 5 situations × 4 canaux, en permis et en refus", () => {
    const cles = (l: CasMatrice[]) => new Set(l.map((c) => `${c.situation}/${c.canal}`)).size;
    expect(cles(PERMIS)).toBe(20);
    expect(cles(REFUS)).toBe(20);
  });

  it.each(PERMIS.map((c) => [c.situation, c.canal, c] as const))("permis : %s par %s", (_s, _c, c) => {
    const { p, b, ctx } = c.cas();
    const d = contactPermis(p, c.canal, b, ctx);
    expect(d, d.motif).toMatchObject({ permis: true });
    expect(d.motif).toContain("Permis");
  });

  it.each(REFUS.map((c) => [c.situation, c.canal, c] as const))("refus : %s par %s", (_s, _c, c) => {
    const { p, b, ctx } = c.cas();
    const d = contactPermis(p, c.canal, b, ctx);
    expect(d.permis).toBe(false);
    expect(d.motif).toContain(c.refus!);
  });

  it("refuse une base qui vise un autre prospect, ou une autre forme", () => {
    const p = prospect("salarie_nomme");
    expect(contactPermis(p, "courriel", { ...baseLegale(p, "courriel", "consentement"), prospectId: id(2) }, contexte()).motif).toContain("autre prospect");
    expect(contactPermis(p, "courriel", { ...baseLegale(p, "courriel", "consentement"), forme: "personne_physique" }, contexte()).motif).toContain("cible et la forme");
  });

  it("refuse un canal sans coordonnée", () => {
    const p = prospect("salarie_nomme", { coordonnees: [] });
    expect(contactPermis(p, "courrier", baseLegale(p, "courrier", "interet_legitime"), contexte()).motif).toContain("Aucune coordonnée");
  });

  it("refuse l'exception « client existant » à une entreprise déjà cliente : exclue comme client actuel", () => {
    const p = prospect("entreprise_impersonnelle");
    const d = contactPermis(p, "courriel", baseLegale(p, "courriel", "client_existant_produits_analogues"), contexte({ clientsActuels: [{ type: "courriel", valeur: E.courriel }], produitsAnalogues: true }));
    expect(d).toMatchObject({ permis: false });
    expect(d.motif).toContain("client_actuel");
  });

  it("téléphone : liste DNCM consultée il y a DNCM_VALIDITE_JOURS jours ou plus = refus", () => {
    const p = prospect("entreprise_impersonnelle");
    const b = baseLegale(p, "telephone", "interet_legitime", { preuveType: "mise_en_balance" });
    const d = contactPermis(p, "telephone", b, contexte({ dncm: { empreintes: [], verifieeLe: "2026-09-15T10:00:00+02:00" } }));
    expect(d.permis).toBe(false);
    expect(d.motif).toContain("Version de la liste");
  });
});

/* ------------------------------------------------------------------ */
/* Fraîcheur DNCM                                                      */
/* ------------------------------------------------------------------ */

describe("verificationDncmFraiche", () => {
  it(`vaut moins de ${DNCM_VALIDITE_JOURS} jours : J-29 frais, J-30 périmé, futur et absent refusés`, () => {
    expect(verificationDncmFraiche("2026-10-15T08:00:00+02:00", MAINTENANT)).toBe(true);
    expect(verificationDncmFraiche("2026-09-16T10:00:00+02:00", MAINTENANT)).toBe(true);
    expect(verificationDncmFraiche("2026-09-15T10:00:00+02:00", MAINTENANT)).toBe(false);
    expect(verificationDncmFraiche("2026-10-20T10:00:00+02:00", MAINTENANT)).toBe(false);
    expect(verificationDncmFraiche(null, MAINTENANT)).toBe(false);
    expect(verificationDncmFraiche("pas une date", MAINTENANT)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Exclusions (§5.4) : un cas par motif                                */
/* ------------------------------------------------------------------ */

const motifs = (p: Prospect, ctx: Partial<ContexteContact> = {}) => exclusionsProspect(p, contexte(ctx)).map((m) => m.motif);

describe("exclusionsProspect : un cas par motif", () => {
  it("aucun motif sur un prospect propre", () => {
    expect(motifs(prospect("entreprise_impersonnelle"))).toEqual([]);
    expect(motifs(prospect("particulier_prospect"))).toEqual([]);
  });

  it("doublon : empreinte déjà en base", () => {
    expect(motifs(prospect("entreprise_impersonnelle"), { empreintesExistantes: [{ type: "telephone", valeur: E.tel }] })).toEqual(["doublon"]);
    // Même valeur mais autre type d'empreinte : pas un doublon.
    expect(motifs(prospect("entreprise_impersonnelle"), { empreintesExistantes: [{ type: "courriel", valeur: E.tel }] })).toEqual([]);
  });

  it("numero_bce_invalide : contrôle modulo 97 en échec", () => {
    expect(motifs(prospect("entreprise_impersonnelle", { numeroBce: "0123.456.789" }))).toEqual(["numero_bce_invalide"]);
  });

  it("ignorerControleBce (P9b) : levé seulement pour un prospect de démonstration dans une campagne de démonstration", () => {
    const demo = prospect("entreprise_impersonnelle", { numeroBce: "0123.456.789", mode: "demonstration" });
    expect(motifs(demo, { modeCampagne: "demonstration", ignorerControleBce: true })).toEqual([]);
    expect(motifs(demo, { modeCampagne: "demonstration" })).toEqual(["numero_bce_invalide"]);
    // En réel la règle reste, même si l'option est passée.
    expect(motifs(prospect("entreprise_impersonnelle", { numeroBce: "0123.456.789" }), { ignorerControleBce: true })).toEqual(["numero_bce_invalide"]);
    expect(motifs(demo, { modeCampagne: "reel", ignorerControleBce: true })).toContain("numero_bce_invalide");
  });

  it("entreprise_inactive : numéro valide absent du fichier actif (seulement si le fichier est chargé)", () => {
    const p = prospect("entreprise_impersonnelle", { numeroBce: "1000.000.120" });
    expect(motifs(p, { numerosBceActifs: new Set(["0123456749"]) })).toEqual(["entreprise_inactive"]);
    expect(motifs(p, { numerosBceActifs: new Set(["1000000120"]) })).toEqual([]);
    expect(motifs(p)).toEqual([]);
  });

  it("personne_physique_bce : entité BCE personne physique", () => {
    const p = prospect("partenaire_personne_physique", { numeroBce: "0234.567.873" });
    expect(motifs(p, { canaux: ["courrier"] })).toEqual(["personne_physique_bce"]);
  });

  it("hors_zone : hors des codes postaux, communes, provinces ou régions choisies ; zone inconnue = hors zone", () => {
    const p = prospect("entreprise_impersonnelle");
    expect(motifs(p, { zone: { codesPostaux: ["1000"] } })).toEqual(["hors_zone"]);
    expect(motifs(p, { zone: { codesPostaux: ["1000"], communes: ["liege"] } })).toEqual([]);
    expect(motifs(p, { zone: { provinces: ["Namur"], regions: ["Flandre"] } })).toEqual(["hors_zone"]);
    expect(motifs(p, { zone: { regions: ["Wallonie"] } })).toEqual([]);
    const inconnu = prospect("entreprise_impersonnelle", { zone: { codePostal: null, commune: null, province: null, region: null, pays: "BE" } });
    expect(motifs(inconnu, { zone: { regions: ["Wallonie"] } })).toEqual(["hors_zone"]);
  });

  it("courriel_invalide : syntaxe de l'adresse déchiffrée", () => {
    const enClair = { nom: "Toitures Fictives SRL", courriel: "info@@toitures", telephone: null, adresse: null };
    expect(motifs(prospect("entreprise_impersonnelle"), { coordonneesEnClair: enClair })).toContain("courriel_invalide");
  });

  it("courriel_nominatif_sans_consentement : adresse nominative ou inconnue, campagne par courriel", () => {
    expect(motifs(prospect("salarie_nomme"))).toEqual(["courriel_nominatif_sans_consentement"]);
    // Campagne sans courriel : pas de constat.
    expect(motifs(prospect("salarie_nomme"), { canaux: ["courrier"] })).toEqual([]);
    // Adresse stockée impersonnelle mais déchiffrée nominative : prudence.
    const enClair = { nom: "Toitures Fictives SRL", courriel: "jeanne.fictive@toitures.example", telephone: null, adresse: null };
    expect(motifs(prospect("entreprise_impersonnelle"), { coordonneesEnClair: enClair })).toEqual(["courriel_nominatif_sans_consentement"]);
    // Consentement enregistré pour le courriel : pas de constat.
    const p = prospect("salarie_nomme");
    const avec = { ...p, basesLegales: [baseLegale(p, "courriel", "consentement")] };
    expect(motifs(avec)).toEqual([]);
  });

  it("courriel_nominatif_sans_consentement : particulier au consentement retiré, ou ne couvrant pas le courriel", () => {
    const retire = prospect("particulier_prospect", {
      particulier: { origine: "formulaire_entrant", consentements: [consentement(["courriel"], "2026-10-01T12:00:00+02:00")], offresDemandees: [], clientId: null, pseudonyme: "[client-0b1c]" },
    });
    expect(motifs(retire)).toEqual(["courriel_nominatif_sans_consentement"]);
    const smsSeul = prospect("particulier_prospect", {
      particulier: { origine: "formulaire_entrant", consentements: [consentement(["sms"])], offresDemandees: [], clientId: null, pseudonyme: "[client-0b1c]" },
    });
    expect(motifs(smsSeul)).toEqual(["courriel_nominatif_sans_consentement"]);
  });

  it("telephone_invalide : numéro déchiffré non E.164 belge", () => {
    const enClair = { nom: "Toitures Fictives SRL", courriel: null, telephone: "+33 6 12 34 56 78", adresse: null };
    expect(motifs(prospect("entreprise_impersonnelle"), { coordonneesEnClair: enClair })).toEqual(["telephone_invalide"]);
    expect(motifs(prospect("entreprise_impersonnelle"), { coordonneesEnClair: { ...enClair, telephone: "04 123 45 67" } })).toEqual([]);
  });

  it("opposition_client : empreinte inscrite à la liste d'opposition du client", () => {
    expect(motifs(prospect("entreprise_impersonnelle"), { oppositions: [{ type: "courriel", valeur: E.courriel }] })).toEqual(["opposition_client"]);
  });

  it("liste_dncm : téléphone inscrit, seulement pour une campagne qui appelle", () => {
    const dncm = { empreintes: [{ type: "telephone", valeur: E.tel } as Empreinte], verifieeLe: HIER };
    expect(motifs(prospect("entreprise_impersonnelle"), { dncm })).toEqual(["liste_dncm"]);
    expect(motifs(prospect("entreprise_impersonnelle"), { dncm, canaux: ["courrier"] })).toEqual([]);
  });

  it("client_actuel : déjà client (hors vente croisée d'un client existant)", () => {
    const clientsActuels: Empreinte[] = [{ type: "identifiant_client", valeur: E.client }];
    const p = prospect("entreprise_impersonnelle", { empreintes: [{ type: "identifiant_client", valeur: E.client }] });
    expect(motifs(p, { clientsActuels })).toEqual(["client_actuel"]);
    const vc = prospect("client_existant", { empreintes: [{ type: "identifiant_client", valeur: E.client }] });
    expect(motifs(vc, { clientsActuels, canaux: ["courrier"] })).toEqual([]);
  });

  it("donnee_demonstration_campagne_reelle : mode, mention, domaine, téléphone ou URL de démonstration", () => {
    expect(motifs(prospect("entreprise_impersonnelle", { mode: "demonstration" }))).toEqual(["donnee_demonstration_campagne_reelle"]);
    expect(motifs(prospect("entreprise_impersonnelle", { denomination: "Toitures Fictives (démonstration)" }))).toEqual(["donnee_demonstration_campagne_reelle"]);
    const url = prospect("entreprise_impersonnelle", { sources: [{ type: "lecture_url", sourceId: null, service: null, outil: null, url: "https://demo-prospection.example/fiche", collecteLe: HIER }] });
    expect(motifs(url)).toEqual(["donnee_demonstration_campagne_reelle"]);
    const enClair = { nom: "Personne fictive", courriel: null, telephone: "+32 4 000 12 34 5", adresse: null };
    expect(motifs(prospect("entreprise_impersonnelle"), { coordonneesEnClair: enClair })).toEqual(["donnee_demonstration_campagne_reelle"]);
    // Campagne de démonstration : la donnée de démonstration y est attendue.
    expect(motifs(prospect("entreprise_impersonnelle", { mode: "demonstration" }), { modeCampagne: "demonstration" })).toEqual([]);
  });

  it("chaque motif du contrat est couvert par un test ci-dessus", () => {
    expect(MotifExclusion.options).toHaveLength(12);
  });

  it("horodate chaque constat avec l'instant fourni", () => {
    const [m] = exclusionsProspect(prospect("entreprise_impersonnelle", { numeroBce: "0123.456.789" }), contexte());
    expect(m!.constateLe).toBe(MAINTENANT);
    expect(m!.detail).toContain("modulo 97");
  });
});

/* ------------------------------------------------------------------ */
/* Dédoublonnage                                                       */
/* ------------------------------------------------------------------ */

describe("dedoublonner", () => {
  const P = (n: number, empreintes: Empreinte[], numeroBce: string | null = null) =>
    prospect("entreprise_impersonnelle", { id: id(n), identifiant: { type: "empreinte", valeur: h(1000 + n) }, numeroBce, empreintes, coordonnees: [] });

  it("garde le premier et exclut les suivants avec le motif doublon", () => {
    const a = P(1, [{ type: "courriel", valeur: h(7) }]);
    const b = P(2, [{ type: "courriel", valeur: h(7) }]);
    const c = P(3, [{ type: "courriel", valeur: h(8) }]);
    const r = dedoublonner([a, b, c], MAINTENANT);
    expect(r.gardes.map((p) => p.id)).toEqual([id(1), id(3)]);
    expect(r.exclus).toHaveLength(1);
    expect(r.exclus[0]!.prospect.id).toBe(id(2));
    expect(r.exclus[0]!.exclusion).toEqual({ motif: "doublon", detail: `Doublon du prospect ${id(1)}`, constateLe: MAINTENANT });
  });

  it("transitivité : A~B et B~C, C est un doublon de A", () => {
    const a = P(1, [{ type: "courriel", valeur: h(7) }]);
    const b = P(2, [{ type: "courriel", valeur: h(7) }, { type: "telephone", valeur: h(9) }]);
    const c = P(3, [{ type: "telephone", valeur: h(9) }]);
    const r = dedoublonner([a, b, c], MAINTENANT);
    expect(r.gardes.map((p) => p.id)).toEqual([id(1)]);
    expect(r.exclus.map((e) => e.exclusion.detail)).toEqual([`Doublon du prospect ${id(1)}`, `Doublon du prospect ${id(1)}`]);
  });

  it("dédoublonne aussi par numéro BCE (points ignorés) et par empreinte de coordonnée", () => {
    const a = P(1, [], "0123.456.749");
    const b = P(2, [], "0123.456.749");
    expect(dedoublonner([a, b], MAINTENANT).gardes).toHaveLength(1);
    const x = prospect("salarie_nomme", { id: id(5), identifiant: { type: "empreinte", valeur: h(2005) } });
    const y = prospect("salarie_nomme", { id: id(6), identifiant: { type: "empreinte", valeur: h(2006) }, empreintes: [] });
    expect(dedoublonner([x, y], MAINTENANT).exclus.map((e) => e.prospect.id)).toEqual([id(6)]);
  });

  it("ne confond pas deux empreintes de même valeur et de types différents", () => {
    const a = P(1, [{ type: "courriel", valeur: h(7) }]);
    const b = P(2, [{ type: "telephone", valeur: h(7) }]);
    expect(dedoublonner([a, b], MAINTENANT).gardes).toHaveLength(2);
  });
});
