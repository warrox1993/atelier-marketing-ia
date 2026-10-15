/**
 * Exemples des contrats v1.7 (prospection, référentiel, connaissances), validés par
 * `tests/contrats-prospection.spec.ts` et `tests/contrats-connaissances.spec.ts`.
 *
 * Tout est FICTIF : deux jeux de paramètres de démonstration, « Rénovation Liège (démonstration) » et un
 * courtier fictif multi-entités (B2C et B2B). Numéros BCE à chiffre de contrôle volontairement faux,
 * courriels `@exemple.invalid`, téléphones `+32 4 000 …`, noms suffixés « (démonstration) ».
 */
const H = "2026-10-15T09:00:00.000Z";
const E_RENO = "11111111-1111-4111-8111-111111111111";
const E_COURTIER = "11111111-1111-4111-8111-111111111112";
const CHIFFRE = (n: string) => `chv1.0123456789abcdef.AAAAAAAAAAAAAAAA.${n}.AAAAAAAAAAAAAAAAAAAAAA`;
const HEX = (c: string) => c.repeat(64);

/** Référentiel de « Rénovation Liège (démonstration) » : la marque existante, sans liste nouvelle remplie. */
export const REFERENTIEL_RENOVATION = {
  id: "a1111111-1111-4111-8111-111111111111",
  companyId: E_RENO,
  version: 3,
  identite: "Rénovation Liège (démonstration), entreprise fictive de rénovation de toitures et façades.",
  ton: "Direct, concret, sans jargon.",
  offres: [
    { nom: "Diagnostic de toiture", description: "Visite et rapport écrit.", confirmee: true, code: "diagnostic-toiture", cible: "b2c", segments: ["proprietaires"], besoinsCouverts: ["Savoir si la toiture fuit"], argumentsValides: ["Rapport écrit remis après la visite"], conditions: null, entite: "renovation", fournisseur: null },
    { nom: "Isolation de toiture", description: "Pose d'isolant.", confirmee: false },
  ],
  zones: ["Liège", "Herstal", "Seraing"],
  etablissements: [
    { nom: "Liège-Guillemins", adresse: "Rue de la Démonstration 1, 4000 Liège", confirme: true, code: "liege", communes: ["Liège"], codesPostaux: ["4000", "4020"], entites: ["renovation"] },
    { nom: "Herstal", adresse: null, confirme: false },
  ],
  affirmationsAutorisees: [],
  informationsManquantes: ["Prix du diagnostic"],
  creeLe: H,
  entites: [{ code: "renovation", nom: "Rénovation Liège (démonstration)", type: "entite_juridique", porteePar: null, identifiants: [{ type: "bce", libelle: null, valeur: "0123.456.700" }], mentionsLegales: "Rénovation Liège (démonstration), entreprise fictive." }],
  segments: [{ code: "proprietaires", libelle: "Propriétaires de maison", type: "type_particulier", nace: [] }],
  ciblesProspection: [],
  modulesConformite: [],
};

/** Référentiel d'un courtier FICTIF multi-entités, B2C et B2B, avec le module « intermédiaire d'assurance ». */
export const REFERENTIEL_COURTIER = {
  id: "a1111111-1111-4111-8111-111111111112",
  companyId: E_COURTIER,
  version: 1,
  identite: "Courtier fictif (démonstration) : plusieurs entités, bureaux en province de Liège.",
  ton: "Rassurant, clair, jamais de promesse de prix.",
  offres: [
    { nom: "Assurance auto", description: "Offre fictive.", confirmee: true, code: "auto", cible: "b2c", segments: ["jeunes-conducteurs", "proprietaires"], besoinsCouverts: ["Rouler assuré"], argumentsValides: ["Devis en ligne"], conditions: "Selon acceptation de la compagnie partenaire.", entite: "non-vie", fournisseur: "Compagnie partenaire A (démonstration)" },
    { nom: "Assurance habitation", description: "Offre fictive.", confirmee: true, code: "habitation", cible: "b2c", segments: ["proprietaires"], entite: "non-vie" },
    { nom: "Hospitalisation", description: "Offre fictive.", confirmee: false, code: "hospitalisation", cible: "b2c", segments: [], entite: "non-vie" },
    { nom: "Responsabilité civile professionnelle", description: "Offre fictive.", confirmee: true, code: "rc-pro", cible: "b2b", segments: ["medecins", "avocats"], entite: "non-vie" },
    { nom: "Pension complémentaire", description: "Offre fictive.", confirmee: true, code: "pension-complementaire", cible: "b2b", segments: ["medecins", "independants", "dirigeants-pme"], entite: "vie" },
  ],
  zones: ["Liège", "Ans", "Seraing"],
  etablissements: [
    { nom: "Bureau de Liège (démonstration)", adresse: "Rue de la Démonstration 10, 4000 Liège", confirme: true, code: "bureau-liege", communes: ["Liège"], codesPostaux: ["4000", "4020", "4030"], entites: ["non-vie", "vie"] },
    { nom: "Bureau d'Ans (démonstration)", adresse: "Rue de la Démonstration 20, 4430 Ans", confirme: true, code: "bureau-ans", communes: ["Ans"], codesPostaux: ["4430"], entites: ["non-vie"] },
  ],
  affirmationsAutorisees: [],
  informationsManquantes: [],
  creeLe: H,
  entites: [
    { code: "non-vie", nom: "Courtage non-vie (démonstration)", type: "entite_juridique", porteePar: null, identifiants: [{ type: "fsma", libelle: null, valeur: "DEMO-0001" }, { type: "bce", libelle: null, valeur: "0123.456.711" }], mentionsLegales: "Courtage non-vie (démonstration), intermédiaire fictif, FSMA DEMO-0001." },
    { code: "vie", nom: "Courtage vie (démonstration)", type: "entite_juridique", porteePar: null, identifiants: [{ type: "fsma", libelle: null, valeur: "DEMO-0002" }], mentionsLegales: "Courtage vie (démonstration), intermédiaire fictif, FSMA DEMO-0002." },
    { code: "devis-en-ligne", nom: "Devis en ligne (démonstration)", type: "marque", porteePar: "non-vie", identifiants: [], mentionsLegales: "Marque fictive de Courtage non-vie (démonstration)." },
  ],
  segments: [
    { code: "medecins", libelle: "Médecins", type: "profession", nace: ["86.210", "86.220"] },
    { code: "avocats", libelle: "Avocats", type: "profession", nace: ["69.101"] },
    { code: "independants", libelle: "Indépendants", type: "profession", nace: [] },
    { code: "dirigeants-pme", libelle: "Dirigeants de PME", type: "secteur", nace: [] },
    { code: "proprietaires", libelle: "Propriétaires", type: "type_particulier", nace: [] },
    { code: "jeunes-conducteurs", libelle: "Jeunes conducteurs", type: "type_particulier", nace: [] },
  ],
  ciblesProspection: [
    { code: "medecins-liege", libelle: "Médecins de Liège", cible: "b2b", segments: ["medecins"], zones: { etablissements: ["bureau-liege"], communes: [], codesPostaux: [], provinces: [], regions: [] }, tailles: [], offres: ["rc-pro", "pension-complementaire"], entite: "non-vie" },
    { code: "proprietaires-ans", libelle: "Propriétaires d'Ans", cible: "b2c", segments: ["proprietaires"], zones: { etablissements: ["bureau-ans"], communes: [], codesPostaux: [], provinces: [], regions: [] }, tailles: [], offres: ["habitation"], entite: "non-vie" },
  ],
  modulesConformite: [{ code: "intermediaire_assurance", entites: [], motsInterdits: ["meilleure couverture pour vous"], activeLe: H, activePar: "local-board" }],
};

const P_B2B = "b1111111-1111-4111-8111-111111111111";
const P_B2C = "b1111111-1111-4111-8111-111111111112";

const scoreEstimation = {
  valeur: 55,
  criteres: [
    { code: "segment_cible", libelle: "Segment visé : médecins", valeur: "medecins", points: 30, source: "Référentiel du client, version 1", dateSource: H },
    { code: "zone_bureau", libelle: "Dans la zone du bureau de Liège", valeur: "4000", points: 25, source: "BCE (démonstration)", dateSource: H },
  ],
  versionPoids: 1,
  nature: "estimation",
  etalonnage: null,
  calculeLe: H,
};

/** Prospect B2B : cabinet médical fictif, personne morale, courriel impersonnel. */
export const PROSPECT_B2B = {
  id: P_B2B,
  companyId: E_COURTIER,
  campagneId: null,
  cible: "entreprise",
  identifiant: { type: "numero_bce", valeur: "0123.456.722" },
  numeroBce: "0123.456.722",
  referentiel: { version: 1, entite: "non-vie", offres: ["rc-pro"], segments: ["medecins"], etablissement: "bureau-liege", cibleProspection: "medecins-liege" },
  forme: "personne_morale",
  denomination: "Cabinet médical des Coteaux SRL (démonstration)",
  nomChiffre: null,
  nace: ["86.210"],
  zone: { codePostal: "4000", commune: "Liège", province: "Liège", region: "Wallonie", pays: "BE" },
  coordonnees: [{ canal: "courriel", valeur: CHIFFRE("aW5mbw"), empreinte: HEX("a"), nature: "impersonnelle" }],
  empreintes: [{ type: "numero_bce", valeur: HEX("b") }],
  sources: [{ type: "depot_signe", sourceId: "c1111111-1111-4111-8111-111111111111", service: "bce", outil: "bce_rechercher", url: null, collecteLe: H }],
  mode: "demonstration",
  statut: "qualifie",
  motifsExclusion: [],
  score: scoreEstimation,
  basesLegales: [
    {
      prospectId: P_B2B,
      cible: "entreprise",
      forme: "personne_morale",
      canal: "courriel",
      base: "personne_morale_adresse_impersonnelle",
      natureAdresse: "impersonnelle",
      preuve: { type: "source", reference: "BCE (démonstration), contact déclaré info@", date: H },
      information: { texteArt14: "Nous avons trouvé votre adresse professionnelle dans la Banque-Carrefour des Entreprises (démonstration).", moyenOpposition: "Lien de désinscription" },
      dncmVerifieLe: null,
      verifieLe: H,
      verifiePar: "systeme",
    },
  ],
  particulier: null,
  creeLe: H,
  modifieLe: H,
};

/** Prospect B2C : particulier fictif venu du simulateur de devis, consentement courriel prouvé. */
export const PROSPECT_B2C = {
  id: P_B2C,
  companyId: E_COURTIER,
  campagneId: null,
  cible: "particulier",
  identifiant: { type: "empreinte", valeur: HEX("c") },
  numeroBce: null,
  referentiel: { version: 1, entite: "devis-en-ligne", offres: ["auto", "habitation"], segments: ["proprietaires"], etablissement: "bureau-ans", cibleProspection: "proprietaires-ans" },
  forme: "personne_physique",
  denomination: null,
  nomChiffre: CHIFFRE("bm9t"),
  nace: [],
  zone: { codePostal: "4430", commune: "Ans", province: "Liège", region: "Wallonie", pays: "BE" },
  coordonnees: [
    { canal: "courriel", valeur: CHIFFRE("Y291cnJpZWw"), empreinte: HEX("d"), nature: "nominative" },
    { canal: "telephone", valeur: CHIFFRE("dGVs"), empreinte: HEX("e"), nature: "inconnue" },
  ],
  empreintes: [{ type: "courriel", valeur: HEX("d") }, { type: "telephone", valeur: HEX("e") }],
  sources: [{ type: "formulaire", sourceId: null, service: null, outil: null, url: "https://devis.demo-prospection.example/auto", collecteLe: H }],
  mode: "demonstration",
  statut: "qualifie",
  motifsExclusion: [],
  score: {
    valeur: 70,
    criteres: [
      { code: "devis_abandonne", libelle: "Devis auto commencé il y a 2 jours", valeur: true, points: 40, source: "Simulateur (démonstration)", dateSource: H },
      { code: "zone_bureau", libelle: "Dans la zone du bureau d'Ans", valeur: "4430", points: 30, source: "Code postal déclaré", dateSource: H },
    ],
    versionPoids: 1,
    nature: "probabilite_mesuree",
    etalonnage: {
      etalonnageId: "e1111111-1111-4111-8111-111111111111",
      marge: { probabilite: 0.18, borneBasse: 0.12, borneHaute: 0.26, niveauConfiance: 0.95, methode: "wilson" },
      effectif: 412,
      conversions: 61,
      methode: "platt",
      date: H,
    },
    calculeLe: H,
  },
  basesLegales: [
    {
      prospectId: P_B2C,
      cible: "particulier",
      forme: "personne_physique",
      canal: "courriel",
      base: "consentement",
      natureAdresse: "nominative",
      preuve: { type: "consentement", reference: "soumission-demo-0001", date: H },
      information: { texteArt14: "Vous avez demandé un devis auto sur notre simulateur (démonstration) et accepté d'être recontacté.", moyenOpposition: "Lien de désinscription" },
      dncmVerifieLe: null,
      verifieLe: H,
      verifiePar: "systeme",
    },
    {
      prospectId: P_B2C,
      cible: "particulier",
      forme: "personne_physique",
      canal: "telephone",
      base: "consentement",
      natureAdresse: "inconnue",
      preuve: { type: "consentement", reference: "soumission-demo-0001", date: H },
      information: { texteArt14: "Vous avez demandé un devis auto sur notre simulateur (démonstration) et accepté un rappel.", moyenOpposition: "Dites-le pendant l'appel" },
      dncmVerifieLe: H,
      verifieLe: H,
      verifiePar: "systeme",
    },
  ],
  particulier: {
    origine: "devis_abandonne",
    consentements: [
      {
        date: H,
        texteAccepte: "J'accepte d'être recontacté par courriel et par téléphone au sujet de ma demande de devis (démonstration).",
        source: "https://devis.demo-prospection.example/auto",
        canauxAutorises: ["courriel", "telephone"],
        responsableNomme: "Courtage non-vie (démonstration)",
        reference: "soumission-demo-0001",
        retireLe: null,
      },
    ],
    offresDemandees: ["auto"],
    clientId: null,
    pseudonyme: "[client-7f3a]",
  },
  creeLe: H,
  modifieLe: H,
};

/** Fiche déchiffrée du particulier fictif (montrée à l'humain seulement). */
export const FICHE_B2C = {
  prospectId: P_B2C,
  clientId: null,
  mode: "demonstration",
  coordonnees: { nom: "Camille Exemple (démonstration)", courriel: "camille.exemple@exemple.invalid", telephone: "+32 4 000 00 42", adresse: "Rue de la Démonstration 7, 4430 Ans" },
};

/** Client particulier fictif de la base (vente croisée auto sans habitation). */
export const CLIENT_B2C = {
  id: "d1111111-1111-4111-8111-111111111111",
  companyId: E_COURTIER,
  importId: null,
  typeClient: "particulier",
  etablissement: "bureau-ans",
  entites: ["non-vie"],
  segments: ["proprietaires"],
  pseudonyme: "[client-9c21]",
  contrats: [{ entite: "non-vie", offre: "auto", produit: "Auto (démonstration)", fournisseur: "Compagnie partenaire A (démonstration)", debut: "2024-03-01", fin: null }],
  donneesChiffrees: { nom: CHIFFRE("bm9t"), courriel: CHIFFRE("Y291cnJpZWw") },
  empreintes: [{ type: "courriel", valeur: HEX("f") }],
  entreprise: null,
  numeroBce: null,
  codePostal: "4430",
  commune: "Ans",
  produitsDetenus: ["auto"],
  debutContrat: "2024-03-01",
  statut: "actif",
  consentements: { courriel: true, sms: null, telephone: false },
  mode: "demonstration",
  creeLe: H,
};

export const EXPORT_CRM = {
  id: "f1111111-1111-4111-8111-111111111111",
  companyId: E_COURTIER,
  issueId: "44444444-4444-4444-8444-444444444444",
  diffusionId: null,
  entite: "non-vie",
  referentielVersion: 1,
  service: "crm",
  canal: "courriel",
  prospectIds: [P_B2B, P_B2C],
  verifications: [
    { prospectId: P_B2B, ok: true, motif: null },
    { prospectId: P_B2C, ok: true, motif: null },
  ],
  etat: "simulee",
  motifRefus: null,
  cleIdempotence: "export-demo-0001",
  mode: "demonstration",
  demandePar: "agent-prospection",
  creeLe: H,
};
