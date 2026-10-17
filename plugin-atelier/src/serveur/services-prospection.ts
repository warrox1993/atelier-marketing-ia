/**
 * Lot P9a : routes de PROSPECTION du plugin (docs/prospection-conception.md §5.4, §6.3, §6.5).
 *
 * - `tache.prospects.deposer` : dépôt de la réponse BRUTE et SIGNÉE d'un outil bce, bnb, fsma ou osm.
 *   Même mécanisme que `tache.donnees.deposer` (`deduireModeReponse`, clés publiques de la passerelle
 *   fixées par l'humain), plus strict : la signature de la passerelle est exigée dans LES DEUX modes
 *   (non signé ou signé par une autre clé : refus). Le mode est déduit de la réponse signée (au moindre
 *   indice : démonstration) ; celui de la campagne et de l'entreprise décide des exclusions et des clés.
 * - `prospects.lister`, `prospects.particuliers.enregistrer`, `prospects.exclure`, `oppositions.ajouter`.
 *
 * Données personnelles : coordonnées chiffrées à la réception (AES-256-GCM, `chiffrer`), empreintes HMAC
 * (`empreinte`) ; la réponse brute n'est PAS conservée (seule son empreinte SHA-256). L'entreprise vient
 * toujours de la résolution de route par l'hôte, jamais du corps (un corps qui en désigne une autre est
 * refusé). Les règles (`regles-prospection.ts`, `score-prospects.ts`) sont appelées telles quelles.
 */
import { createHash, randomUUID, type KeyObject } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import {
  AjouterOppositionEntree,
  BaseLegaleContact,
  CodeNace,
  CodeReferentiel,
  DeposerProspectsEntree,
  EnregistrerParticulierEntree,
  ExclureProspectEntree,
  FusionnerDoublonsEntree,
  LIMITES,
  ListerProspectsEntree,
  NumeroBce,
  FaitBce,
  TailleBnb,
  ORIGINES_AVEC_CONSENTEMENT,
  Opposition,
  PositionProspect,
  PreuveConsentement,
  Prospect,
  QuestionProspectEntree,
  RenvoiReferentiel,
  coordonneesManifestementFictives,
  type CanalContact,
  type CleRouteApi,
  type CoordonneesEnClair,
  type Empreinte,
  type ExclusionConstatee,
  type ModeExecution,
  type OrigineParticulier,
  type ScoreProspect,
  SourceProspect,
  type TypeEmpreinte,
  type ZoneProspect,
} from "../contrats/index.js";
import { VueProspectsRequete } from "../contrats/api.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import { resumerProspects, type PageProspectsComplete } from "./prospects-resume.js";
import type { BaseAtelier } from "./base.js";
import { normaliserPourEmpreinte } from "./base-clients.js";
import { chiffrer, empreinte, memeCle, TAILLE_CLE_CHIFFREMENT, TAILLE_CLE_HMAC_MIN } from "./chiffrement-donnees.js";
import { erreur, erreurValidation } from "./erreurs.js";
import { estOutilEcriture } from "./preuve-approbation.js";
import { AGE_MAX_REPONSE_S, deduireModeReponse, reponseEcriture, type ModeEffectif } from "./regles-donnees.js";
import { construireCompteRendu, nomDuProspect, type FicheClientCompteRendu } from "./compte-rendu-prospect.js";
import { ORIGINE_DEMANDE, titreDepuisTexte } from "./services-accueil.js";
import { calculerConfiance, criteresManquants, type ContexteQualification } from "./qualification-prospects.js";
import { fusionnerProspects, trouverPairesDoublons } from "./rapprochement-prospects.js";
import { dedoublonner, empreintesDuProspect, exclusionsProspect, natureAdresse, type ContexteProspection, type ZoneChoisie } from "./regles-prospection.js";
import { calculerScore, type CritereEvalue } from "./score-prospects.js";
import { routesBaseClients } from "./services-base-clients.js";
import { DERIVE_HORLOGE_S, chargeEcriture, empreinteArgumentsAppel, verifierEnveloppe } from "./signatures.js";

type Issue = NonNullable<Awaited<ReturnType<PluginContext["issues"]["get"]>>>;
type Campagne = { id: string; mode: "demonstration" | "reel"; canaux: string[]; perimetre: { zones: string[] } };

/** Services de la prospection exposés aux autres routes (renseignés par `routesProspection`). */
export interface ServicesProspection {
  /** Prospects qualifiés du filtre en un seul parcours, pour l'entreprise donnée, jusqu'à `plafond` (à une page près). */
  listerQualifies?: (companyId: string, query: Record<string, string | string[]>, plafond: number) => Promise<Prospect[]>;
}

export interface DependancesProspection {
  /** Objet que `routesProspection` remplit avec ses services réutilisables. */
  services?: ServicesProspection;
  ctx: PluginContext;
  base: BaseAtelier;
  tache(companyId: string, issueId: string): Promise<Issue>;
  campagneDeTache(companyId: string, issue: Issue): Promise<Campagne | null>;
  modeEffectif(companyId: string, campagne: { mode: "demonstration" | "reel" } | null): Promise<ModeEffectif>;
  clesPasserelle(companyId: string): Promise<KeyObject[]>;
  configEntreprise(companyId: string): Promise<Record<string, unknown>>;
  exclusif<T>(companyId: string, travail: () => Promise<T>): Promise<T>;
  /** Une nouvelle source rattachée à une tâche sous porte périme ses évaluations (comme `tache.donnees.deposer`). */
  apresEntreeTache(companyId: string, issueId: string): Promise<void>;
  /** Lot P9b : révision courante du livrable d'une tâche sous porte (null : hors porte ou sans livrable). */
  livrableCourant(companyId: string, issueId: string): Promise<{ revisionId: string; corps: string } | null>;
  /** Lot P9b : demande de diffusion ordinaire de `services.ts` (sans verrou : l'appelant le tient déjà). */
  demanderDiffusionSansVerrou(companyId: string, issueId: string, corps: unknown, acteur: ActeurHote): Promise<{ statut: number; corps: unknown }>;
  maintenant?: () => Date;
  /** Réglages des leads et décisions humaines de l'entreprise (migration 010), lus une fois par parcours. */
  lectureQualification?(companyId: string): Promise<Pick<ContexteQualification, "reglages" | "corrections" | "evaluations">>;
}

type Schema<T> = { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> } } };
/** Valeur d'un paramètre de requête (le premier s'il est répété), `undefined` s'il est absent. */
const pur = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function analyser<T>(schema: Schema<T>, valeur: unknown, quoi: string): T {
  const r = schema.safeParse(valeur);
  if (!r.success) erreurValidation(quoi, r.error.issues);
  return r.data;
}

/* ------------------------------------------------------------------ */
/* Fonctions pures (exportées pour les tests)                          */
/* ------------------------------------------------------------------ */

const sansAccents = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Valeur normalisée avant empreinte. Reprend `normaliserPourEmpreinte` (§4.2, base de clients) ; quand
 * elle refuse la valeur (courriel mal formé, numéro BCE au contrôle faux comme ceux de démonstration),
 * une forme brute stable est gardée pour que dépôt, opposition et dédoublonnage restent comparables.
 */
export function valeurPourEmpreinte(type: TypeEmpreinte, brut: string): string | null {
  const v = brut.trim();
  if (v === "") return null;
  const n = normaliserPourEmpreinte(type, v);
  if (n !== null) return n;
  switch (type) {
    case "courriel":
      return v.toLowerCase().replace(/\s+/gu, "");
    case "telephone": {
      const t = v.replace(/[^\d+]/gu, "");
      return t === "" ? null : t;
    }
    case "numero_bce": {
      const d = v.replace(/\D/gu, "");
      return d === "" ? null : d;
    }
    case "nom_code_postal":
      return sansAccents(v).replace(/\s+/gu, " ").trim();
    case "identifiant_client":
      return v;
  }
}

/** Région belge d'après le code postal (découpage de bpost : 1000-1299 Bruxelles, 1300-1499 et 4000-7999 Wallonie, sinon Flandre). */
export function regionDuCodePostal(cp: string | null): ZoneProspect["region"] {
  if (cp === null || !/^\d{4}$/u.test(cp)) return null;
  const n = Number(cp);
  if (n >= 1000 && n <= 1299) return "Bruxelles-Capitale";
  if ((n >= 1300 && n <= 1499) || (n >= 4000 && n <= 7999)) return "Wallonie";
  return "Flandre";
}

const REGIONS = new Set(["Wallonie", "Bruxelles-Capitale", "Flandre"]);
const texte = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null);

/** Position lue dans une réponse (`{ lat, lon }`), avec la précision que la source annonce ; null si absente ou invalide. */
function positionDe(v: unknown, precision: "exacte" | "code_postal" | "commune"): PositionProspect | null {
  const o = objetOuNull(v);
  if (o === null || typeof o.lat !== "number" || typeof o.lon !== "number") return null;
  const r = PositionProspect.safeParse({ lat: o.lat, lon: o.lon, precision });
  return r.success ? r.data : null;
}

/** Précision annoncée par la passerelle pour `position_approx` (BCE) : `code_postal` ou `commune`, sinon rejet. */
function positionApprox(v: unknown): PositionProspect | null {
  const o = objetOuNull(v);
  return o !== null && (o.precision === "code_postal" || o.precision === "commune") ? positionDe(o, o.precision) : null;
}

function zoneDe(cp: unknown, commune: unknown, province?: unknown, region?: unknown, position: PositionProspect | null = null): ZoneProspect {
  const codePostal = typeof cp === "string" && /^\d{4}$/u.test(cp.trim()) ? cp.trim() : null;
  const r = typeof region === "string" && REGIONS.has(region) ? (region as ZoneProspect["region"]) : regionDuCodePostal(codePostal);
  return { codePostal, commune: texte(commune, 120), province: texte(province, 80), region: r, pays: "BE", ...(position ? { position } : {}) };
}

/** Prospect tel que lu dans une réponse d'outil, avant chiffrement. Les coordonnées sont EN CLAIR : jamais stockées ainsi. */
export interface ProspectBrut {
  cible: "entreprise" | "partenaire";
  forme: "personne_morale" | "personne_physique" | "inconnue";
  numeroBce: string | null;
  identifiantReglementaire: string | null;
  cleOsm: string | null;
  denomination: string | null;
  nace: string[];
  zone: ZoneProspect;
  courriels: string[];
  telephones: string[];
  site: string | null;
  /** Faits datés de la BCE (date de début de l'entreprise) ; vide pour les autres services. */
  faits: FaitBce[];
  /** Étiquette OpenStreetMap (clé, valeur) du lieu ; null hors OSM. */
  categorieOsm?: { cle: string; valeur: string } | null;
}

/** Date d'un fait BCE (`JJ-MM-AAAA` du fichier BCE ou `AAAA-MM-JJ`) ramenée à `AAAA-MM-JJ` ; null si absente ou invalide. */
function dateFaitBce(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  const m = /^(\d{2})-(\d{2})-(\d{4})$/u.exec(t);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}/u.test(t) ? t.slice(0, 10) : null;
  return iso !== null && !Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? iso : null;
}

const CODES_CHANGEMENT: Readonly<Record<string, FaitBce["code"]>> = {
  creation: "creation", nouvel_etablissement: "nouvel_etablissement", changement_adresse: "changement_adresse", changement_forme: "changement_forme",
};

/**
 * Changements d'une réponse `bce_changements`, par numéro d'entreprise : créations, nouvelles unités
 * d'établissement, changements d'adresse et de forme (les radiations ne donnent aucun fait). Ne crée aucun prospect.
 */
export function extraireChangementsBce(structures: readonly Record<string, unknown>[]): Map<string, FaitBce[]> {
  const parNumero = new Map<string, FaitBce[]>();
  for (const s of structures) {
    for (const c of objets(s.changements)) {
      const numero = typeof c.EnterpriseNumber === "string" ? c.EnterpriseNumber.trim() : "";
      const code = typeof c.type === "string" ? CODES_CHANGEMENT[c.type] : undefined;
      const date = dateFaitBce(c.date);
      if (code === undefined || date === null || !NumeroBce.safeParse(numero).success) continue;
      const faits = parNumero.get(numero) ?? [];
      if (!faits.some((f) => f.code === code && f.date === date)) faits.push({ code, date });
      parNumero.set(numero, faits.slice(0, 20));
    }
  }
  return parNumero;
}

/**
 * Taille d'une réponse `bnb_comptes`, par numéro d'entreprise : exercice et effectif (rubrique 9087, ETP) du dépôt le plus
 * récent qui a des données, catégorie déduite par la passerelle ; fonds propres, terrains et résultats (lot 2) lus dans les dépôts les plus récents, jamais devinés. Réponse « non trouvée » ou sans exercice daté : rien.
 * Ne crée aucun prospect.
 */
export function extraireComptesBnb(structures: readonly Record<string, unknown>[]): Map<string, TailleBnb> {
  const parNumero = new Map<string, TailleBnb>();
  for (const s of structures) {
    const numero = typeof s.EnterpriseNumber === "string" ? s.EnterpriseNumber.trim() : "";
    if (s.trouve !== true || !NumeroBce.safeParse(numero).success) continue;
    const lignes = objets(s.references).map((r) => {
      const fin = dateFaitBce(objetOuNull(r.ExerciseDates)?.endDate);
      const rubriques = objets(objetOuNull(r.AccountingData)?.Rubrics);
      const nombre = (code: string): number | null => {
        const v = rubriques.find((x) => x.Code === code && x.Period === "N")?.Value;
        return typeof v === "number" && Number.isFinite(v) ? v : null;
      };
      const etp = nombre("9087");
      // Rubriques du lot 2 (codes à confirmer sur la documentation BNB) : 10/15 fonds propres, 22 terrains et constructions, 9904 résultat de l'exercice.
      return { exercice: fin === null ? null : Number(fin.slice(0, 4)), etp: etp !== null && etp >= 0 ? etp : null, fondsPropres: nombre("10/15"), terrains: nombre("22"), resultat: nombre("9904") };
    }).filter((l) => l.exercice !== null);
    // Un seul exercice pour tout : le plus récent ayant au moins une donnée structurée (exercice affiché, effectif, fonds propres, terrains).
    const recentes = [...lignes].sort((a, b) => (b.exercice as number) - (a.exercice as number));
    const retenue = recentes.find((l) => l.etp !== null || l.fondsPropres !== null || l.terrains !== null || l.resultat !== null) ?? recentes[0];
    if (retenue === undefined) continue;
    const categorie = ["micro", "petite", "moyenne", "grande"].find((c) => c === s.taille_deduite);
    // Bilan : dernier exercice déposé seulement ; résultats : les deux derniers exercices (nul si la rubrique manque, pour ne rien deviner).
    const dernier = retenue;
    const resultats = recentes.slice(0, 2).map((l) => ({ exercice: l.exercice as number, resultat: l.resultat }));
    const taille = TailleBnb.safeParse({
      exercice: retenue.exercice, effectifEtp: retenue.etp, categorie: retenue.etp === null ? null : (categorie ?? null),
      ...(dernier.fondsPropres !== null ? { fondsPropres: dernier.fondsPropres } : {}),
      ...(dernier.terrains !== null ? { terrainsConstructions: dernier.terrains } : {}),
      ...(resultats.some((x) => x.resultat !== null) ? { resultats } : {}),
    });
    if (taille.success) parNumero.set(numero, taille.data);
  }
  return parNumero;
}

const objets = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x)) : []);
const objetOuNull = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function depuisBce(e: Record<string, unknown>): ProspectBrut | null {
  const numero = typeof e.EnterpriseNumber === "string" ? e.EnterpriseNumber.trim() : "";
  if (!NumeroBce.safeParse(numero).success) return null;
  const adresses = objets(e.adresses);
  const siege = adresses.find((a) => a.TypeOfAddress === "REGO") ?? adresses[0] ?? {};
  const contacts = objets(e.contacts);
  const valeurs = (type: string) => contacts.filter((c) => c.ContactType === type && typeof c.Value === "string").map((c) => String(c.Value));
  return {
    cible: "entreprise",
    forme: e.TypeOfEnterprise === "1" ? "personne_physique" : e.TypeOfEnterprise === "2" ? "personne_morale" : "inconnue",
    numeroBce: numero,
    identifiantReglementaire: null,
    cleOsm: null,
    denomination: texte(objets(e.denominations)[0]?.Denomination, 300),
    nace: [...new Set(objets(e.activites).map((a) => String(a.NaceCode ?? "")).filter((c) => CodeNace.safeParse(c).success))].slice(0, 20),
    zone: zoneDe(siege.Zipcode, siege.MunicipalityFR, undefined, undefined, positionApprox(e.position_approx)),
    courriels: valeurs("EMAIL"),
    telephones: valeurs("TEL"),
    site: valeurs("WEB")[0] ?? null,
    faits: ((d) => (d === null ? [] : [{ code: "debut_entreprise" as const, date: d }]))(dateFaitBce(e.StartDate)),
  };
}

function depuisFsma(f: Record<string, unknown>): ProspectBrut | null {
  const inscription = texte(f.numero_inscription, 50);
  if (inscription === null) return null;
  const bce = typeof f.numero_bce === "string" && NumeroBce.safeParse(f.numero_bce.trim()).success ? f.numero_bce.trim() : null;
  const a = objetOuNull(f.adresse) ?? {};
  return {
    cible: "partenaire",
    // Un intermédiaire peut être une personne physique : forme inconnue tant que la BCE ne l'a pas établie.
    forme: "inconnue",
    numeroBce: bce,
    identifiantReglementaire: `fsma:${inscription}`,
    cleOsm: null,
    denomination: texte(f.denomination, 300),
    nace: [],
    zone: zoneDe(a.code_postal, a.commune, a.province, a.region),
    courriels: [],
    telephones: [],
    site: null,
    faits: [],
  };
}

function depuisOsm(c: Record<string, unknown>): ProspectBrut | null {
  const nom = texte(c.nom, 300);
  const cle = texte(c.id, 40);
  if (nom === null || cle === null) return null;
  const a = objetOuNull(c.adresse) ?? {};
  return {
    cible: "entreprise",
    forme: "inconnue",
    numeroBce: null,
    identifiantReglementaire: null,
    cleOsm: cle,
    denomination: nom,
    nace: [],
    zone: zoneDe(a.code_postal, a.commune, undefined, undefined, positionDe(c.position, "exacte")),
    courriels: [],
    telephones: typeof c.telephone === "string" ? [c.telephone] : [],
    site: texte(c.site, 300),
    faits: [],
    categorieOsm: ((cle, valeur) => (cle !== null && valeur !== null ? { cle, valeur } : null))(texte(c.cle, 40), texte(c.valeur, 80)),
  };
}

/**
 * Prospects lus dans les structures signées d'une réponse. `bce_rechercher` et `bce_entreprise`
 * (entités), `fsma_rechercher` et `fsma_intermediaire`, `osm_commerces` ; `bnb_comptes`,
 * `bce_changements` et `osm_repartition` n'apportent aucun prospect (comptes, mises à jour, comptages).
 */
export function extraireProspects(service: string, outil: string, structures: readonly Record<string, unknown>[]): { prospects: ProspectBrut[]; ignores: number } {
  const prospects: ProspectBrut[] = [];
  let ignores = 0;
  const ajouter = (p: ProspectBrut | null) => (p === null ? ignores++ : prospects.push(p));
  for (const s of structures) {
    if (service === "bce" && (outil === "bce_rechercher" || outil === "bce_entreprise")) {
      for (const e of [...objets(s.entreprises), ...(objetOuNull(s.entreprise) ? [s.entreprise as Record<string, unknown>] : [])]) ajouter(depuisBce(e));
    } else if (service === "fsma" && (outil === "fsma_rechercher" || outil === "fsma_intermediaire")) {
      for (const f of objets(s.intermediaires)) ajouter(depuisFsma(f));
    } else if (service === "osm" && outil === "osm_commerces") {
      for (const c of objets(s.commerces)) ajouter(depuisOsm(c));
    }
  }
  return { prospects, ignores };
}

/** Particulier lu dans une réponse `b2c`, avant chiffrement (coordonnées EN CLAIR : jamais stockées ainsi). */
export interface ParticulierBrut {
  reference: string;
  coordonnees: CoordonneesEnClair;
  zone: ZoneProspect;
  origine: OrigineParticulier;
  consentements: PreuveConsentement[];
  /** Identifiant du client chez le client (fiche `b2c_clients`), à rapprocher de la base de clients ; null sinon. */
  clientRef: string | null;
  /** Produit demandé (fiche `b2c_demandes_devis`), en code du référentiel (tirets) ; null si absent ou invalide. */
  produit: string | null;
}

/** Code de produit d'une demande B2C ramené à la forme d'un code du référentiel (`epargne_pension` → `epargne-pension`). */
function codeProduitB2c(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const r = CodeReferentiel.safeParse(v.trim().toLowerCase().replace(/_/gu, "-"));
  return r.success ? r.data : null;
}

export interface OppositionBrute {
  courriel: string | null;
  telephone: string | null;
  canaux: Array<CanalContact | "tous">;
  inscritLe: string | null;
}

const CANAL_B2C: Readonly<Record<string, CanalContact>> = { email: "courriel", courriel: "courriel", telephone: "telephone", sms: "sms", courrier: "courrier" };

function horodatageB2c(v: unknown): string | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/u.test(v) ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Consentement marketing d'une fiche `b2c` en preuve du contrat : date, texte accepté, canaux cochés À
 * L'ORIGINE, retrait éventuel (qui l'invalide pour tous les canaux). Aucun accord recueilli : aucune preuve.
 */
function consentementsB2c(brut: unknown, reference: string, source: string, responsable: string): PreuveConsentement[] {
  const c = objetOuNull(brut);
  const date = horodatageB2c(c?.date);
  if (c === null || date === null) return [];
  const origine = objetOuNull(c.canaux_a_l_origine) ?? objetOuNull(c.canaux) ?? {};
  const canaux = [...new Set(Object.entries(origine).filter(([, v]) => v === true).map(([k]) => CANAL_B2C[k]).filter((x): x is CanalContact => x !== undefined))];
  const r = PreuveConsentement.safeParse({
    date, texteAccepte: c.texte, source, canauxAutorises: canaux, responsableNomme: responsable, reference, retireLe: horodatageB2c(c.retire_le),
  });
  return r.success ? [r.data] : [];
}

function adresseB2c(brut: unknown): { zone: ZoneProspect; texte: string | null } {
  const a = objetOuNull(brut) ?? {};
  const rue = [texte(a.rue, 200), texte(a.numero, 20)].filter(Boolean).join(" ");
  const boite = texte(a.boite, 20);
  const ville = [texte(a.code_postal, 10), texte(a.commune, 120)].filter(Boolean).join(" ");
  const t = [rue + (boite ? ` bte ${boite}` : ""), ville].filter((x) => x.trim() !== "").join(", ");
  return { zone: zoneDe(a.code_postal, a.commune, a.province, a.region), texte: t === "" ? null : t.slice(0, 500) };
}

/**
 * Service `b2c` : `b2c_demandes_devis` (origine selon le statut de la demande : abandonnée →
 * `devis_abandonne`, rendez-vous pris → `prise_rendez_vous`, sinon `simulateur_devis`), `b2c_clients`
 * (origine `client_existant`), `b2c_oppositions` (oppositions, aucun prospect). Une fiche dont l'origine
 * exige un consentement et qui n'en porte aucun n'est pas retenue (ignorée).
 */
export function extraireB2c(outil: string, structures: readonly Record<string, unknown>[]): { particuliers: ParticulierBrut[]; oppositions: OppositionBrute[]; ignores: number } {
  const particuliers: ParticulierBrut[] = [];
  const oppositions: OppositionBrute[] = [];
  let ignores = 0;
  for (const s of structures) {
    const responsable = texte(s.client_demonstration, 300) ?? texte(s.client, 300) ?? "Client de l'atelier";
    const fiches = outil === "b2c_demandes_devis" ? objets(s.demandes) : outil === "b2c_clients" ? objets(s.clients) : outil === "b2c_oppositions" ? objets(s.oppositions) : [];
    for (const f of fiches) {
      const id = texte(f.id, 60);
      const personne = objetOuNull(f.personne);
      const nom = texte(personne?.nom, 200);
      const courriel = texte(personne?.courriel, 320);
      const telephone = texte(personne?.telephone, 40);
      if (id === null || personne === null) {
        ignores++;
        continue;
      }
      if (outil === "b2c_oppositions") {
        const canaux = [...new Set((Array.isArray(f.canaux_opposes) ? f.canaux_opposes : []).map((c) => CANAL_B2C[String(c)]).filter((x): x is CanalContact => x !== undefined))];
        if (courriel === null && telephone === null) ignores++;
        else oppositions.push({ courriel, telephone, canaux: canaux.length > 0 ? canaux : ["tous"], inscritLe: horodatageB2c(f.inscrit_le) });
        continue;
      }
      const { zone, texte: adresse } = adresseB2c(f.adresse);
      if (nom === null) {
        ignores++;
        continue;
      }
      const origine: OrigineParticulier =
        outil === "b2c_clients" ? "client_existant" : f.statut === "abandonne" ? "devis_abandonne" : f.statut === "rendez_vous_pris" ? "prise_rendez_vous" : "simulateur_devis";
      const consentements = consentementsB2c(f.consentement_marketing, `${outil}:${id}`, `b2c · ${outil}`, responsable);
      if (ORIGINES_AVEC_CONSENTEMENT.includes(origine) && consentements.length === 0) {
        ignores++;
        continue;
      }
      particuliers.push({
        reference: id, coordonnees: { nom, courriel, telephone, adresse }, zone, origine, consentements, clientRef: outil === "b2c_clients" ? id : null,
        produit: outil === "b2c_demandes_devis" ? codeProduitB2c(f.produit) : null,
      });
    }
  }
  return { particuliers, oppositions, ignores };
}

/** Zone choisie par la campagne (périmètre texte) : 4 chiffres = code postal, région connue, sinon commune ou province. */
export function zoneDeCampagne(zones: readonly string[]): ZoneChoisie | null {
  if (zones.length === 0) return null;
  const codesPostaux: string[] = [];
  const communes: string[] = [];
  const regions: Array<"Wallonie" | "Bruxelles-Capitale" | "Flandre"> = [];
  for (const brute of zones) {
    const v = brute.trim();
    if (/^\d{4}$/u.test(v)) codesPostaux.push(v);
    else if (REGIONS.has(v)) regions.push(v as "Wallonie");
    else if (v) communes.push(v);
  }
  // Un nom libre peut désigner une commune ou une province (« Liège ») : les deux critères sont posés (l'un OU l'autre suffit).
  return { codesPostaux, communes, provinces: communes, regions };
}

/** Canaux de contact visés par la campagne (ses canaux texte qui sont des canaux de contact). */
export function canauxDeCampagne(canaux: readonly string[]): CanalContact[] {
  const connus: readonly CanalContact[] = ["courriel", "sms", "telephone", "courrier"];
  return connus.filter((c) => canaux.some((x) => sansAccents(x).trim() === c || (c === "courriel" && /^e-?mail$/iu.test(x.trim()))));
}

/** Zone d'un établissement du référentiel (codes postaux et communes couverts). */
export interface ZoneEtablissement {
  codesPostaux?: readonly string[] | undefined;
  communes?: readonly string[] | undefined;
}

/** Origines où la personne s'est adressée elle-même au client, ou est déjà sa cliente (aucune n'est « ciblée »). */
const ORIGINES_SOLLICITEES: readonly OrigineParticulier[] = ["formulaire_entrant", "simulateur_devis", "devis_abandonne", "prise_rendez_vous", "point_de_vente", "client_existant"];
/** Origines de contact direct : rendez-vous pris, visite au bureau ou client existant. */
const ORIGINES_CONTACT_DIRECT: readonly OrigineParticulier[] = ["prise_rendez_vous", "point_de_vente", "client_existant"];

/** Vrai si la zone du prospect est couverte par au moins un établissement (code postal, sinon commune). */
export function zoneDesservie(zone: ZoneProspect, etablissements: readonly ZoneEtablissement[]): boolean {
  const commune = zone.commune === null ? null : sansAccents(zone.commune).trim();
  return etablissements.some((e) =>
    (zone.codePostal !== null && (e.codesPostaux ?? []).includes(zone.codePostal)) ||
    (commune !== null && (e.communes ?? []).some((c) => sansAccents(c).trim() === commune)));
}

/**
 * Critères du score expliqué tirés des faits du dépôt ; seuls ceux qui ont un poids chez le client comptent.
 *
 * Entreprise : registre officiel, NACE, adresse impersonnelle, téléphone, site. Particulier (B2C) : ces
 * critères B2B n'ont pas de sens pour une personne (ni BCE, ni NACE, ni site, adresse toujours nominative),
 * ils sont remplacés par des critères B2C tirés de la seule base légale du contact, jamais d'une donnée
 * sensible ni d'un profilage :
 * - `origine_demande_personne` : la personne a demandé un devis ou un rendez-vous, rempli un formulaire,
 *   visité un bureau, ou est déjà cliente (origine consentie) ;
 * - `contact_direct` : rendez-vous pris, visite au bureau ou client existant ;
 * - `consentement_actif` : consentement prouvé, non retiré, pour au moins un canal ;
 * - `produit_demande` : au moins une offre demandée connue ;
 * - `zone_desservie` : code postal ou commune couverts par un établissement du référentiel.
 * Avec les poids d'étalonnage du barème (`SCORE_DEMO_CANAL`), ces critères reproduisent le
 * barème `SCORE_DEMO_CANAL` qui score l'historique d'opportunités (même échelle, donc étalonnage applicable) :
 * un devis en ligne dans la zone vaut 50 (= `devis_en_ligne`), un rendez-vous 60 (= `bureau`).
 */
export function criteresDuProspect(p: Prospect, site: string | null, source: string, date: string, etablissements: readonly ZoneEtablissement[] = []): CritereEvalue[] {
  if (p.cible === "particulier" && p.particulier !== null) {
    const v = p.particulier;
    const sollicitee = ORIGINES_SOLLICITEES.includes(v.origine);
    const direct = ORIGINES_CONTACT_DIRECT.includes(v.origine);
    const consentement = v.consentements.some((c) => c.retireLe === null && c.canauxAutorises.length > 0);
    const desservie = zoneDesservie(p.zone, etablissements);
    return [
      { code: "origine_demande_personne", libelle: "Origine consentie : demande de devis ou de rendez-vous, ou client existant", valeur: v.origine, source, dateSource: date, satisfait: sollicitee },
      { code: "contact_direct", libelle: "Contact direct : rendez-vous, visite au bureau ou client existant", valeur: direct, source, dateSource: date, satisfait: direct },
      { code: "consentement_actif", libelle: "Consentement actif pour au moins un canal", valeur: consentement, source, dateSource: date, satisfait: consentement },
      { code: "produit_demande", libelle: "Produit demandé connu", valeur: v.offresDemandees.join(", ") || null, source, dateSource: date, satisfait: v.offresDemandees.length > 0 },
      { code: "zone_desservie", libelle: "Zone desservie par un bureau", valeur: p.zone.codePostal ?? p.zone.commune, source, dateSource: date, satisfait: desservie },
    ];
  }
  const courriels = p.coordonnees.filter((c) => c.canal === "courriel");
  return [
    { code: "source_registre_officiel", libelle: "Source : registre officiel (BCE, FSMA)", valeur: p.sources.some((s) => s.service === "bce" || s.service === "fsma"), source, dateSource: date, satisfait: p.sources.some((s) => s.service === "bce" || s.service === "fsma") },
    { code: "activite_nace_connue", libelle: "Activité NACE connue", valeur: p.nace.join(", ") || null, source, dateSource: date, satisfait: p.nace.length > 0 },
    { code: "courriel_impersonnel", libelle: "Adresse électronique impersonnelle", valeur: courriels.some((c) => c.nature === "impersonnelle"), source, dateSource: date, satisfait: courriels.some((c) => c.nature === "impersonnelle") },
    { code: "telephone_present", libelle: "Téléphone publié", valeur: p.coordonnees.some((c) => c.canal === "telephone"), source, dateSource: date, satisfait: p.coordonnees.some((c) => c.canal === "telephone") },
    { code: "site_present", libelle: "Site web publié", valeur: site !== null, source, dateSource: date, satisfait: site !== null },
  ];
}

/* ------------------------------------------------------------------ */
/* Clés de chiffrement et d'empreinte                                  */
/* ------------------------------------------------------------------ */

/**
 * Clés des données personnelles : TOUJOURS lues dans le coffre de secrets de l'hôte. Il n'existe aucune
 * clé dérivée ni de repli (faille E1 : l'ancienne clé de démonstration était calculable par quiconque
 * connaissait l'identifiant de l'entreprise).
 */
export interface ClesDonnees {
  chiffrement: Buffer;
  hmac: Buffer;
  origine: "coffre";
}

/** Clé lue dans un secret : hexadécimal (au moins 64 caractères) ou base64 / base64url. */
function decoderCle(valeur: string): Buffer {
  const v = valeur.trim();
  if (/^[0-9a-fA-F]+$/u.test(v) && v.length % 2 === 0 && v.length >= 64) return Buffer.from(v, "hex");
  return Buffer.from(v.replace(/-/gu, "+").replace(/_/gu, "/"), "base64");
}

const estRefSecret = (r: unknown) => typeof r === "object" && r !== null && (r as { type?: unknown }).type === "secret_ref";

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

/**
 * Appel tel que la couverture le relit : arguments de l'appel (déjà comparés à l'empreinte signée par la
 * passerelle ; absents = aucune zone prouvée), total, page et nombre de pages de la réponse signée.
 */
export function appelPourCouverture(outil: string, args: Record<string, unknown> | undefined, structures: readonly Record<string, unknown>[]) {
  // RGPD : seuls osm_commerces et bce_rechercher alimentent la couverture ; les arguments des autres outils
  // (téléphone, courriel…) ne sont jamais journalisés.
  if (outil !== "osm_commerces" && outil !== "bce_rechercher") return undefined;
  const nombre = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const s = structures[0] ?? {};
  const argumentsGardes = args === undefined ? null : Object.fromEntries(Object.entries(args).filter(([k]) => CLES_APPEL_JOURNALISEES.includes(k)));
  // Taille de page et nombre d'éléments renvoyés : prouvent la dernière page quand `pages` manque.
  const liste = ["entreprises", "commerces", "elements"].map((k) => s[k]).find(Array.isArray) as unknown[] | undefined;
  return {
    arguments: argumentsGardes, total: nombre(s["total"]), page: nombre(s["page"]), pages: nombre(s["pages"]),
    taillePage: nombre(s["taille_page"]), renvoyes: liste === undefined ? null : liste.length,
  };
}

// Zone, page et filtres de secteur (non personnels) : deux requêtes qui ne diffèrent que par le secteur
// (dentistes puis médecins) restent distinctes pour la couverture et le recomptage des totaux. Jamais
// `nom` (recherche par nom, qui peut viser un indépendant) ni un autre argument.
const CLES_APPEL_JOURNALISEES = ["codes_postaux", "communes", "provinces", "regions", "pays", "page", "nace", "categories", "formes", "creees_depuis", "taille"];

/** Égalité profonde indépendante de l'ordre des clés (valeurs relues d'une colonne jsonb). */
export function egalProfond(a: unknown, b: unknown): boolean {
  const trier = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(trier) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([k, x]) => [k, trier(x)])) : v;
  return JSON.stringify(trier(a)) === JSON.stringify(trier(b));
}

export function routesProspection(d: DependancesProspection): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, base } = d;
  const maintenant = () => (d.maintenant ? d.maintenant() : new Date());

  /**
   * Clés des données personnelles, résolues depuis le coffre natif (comme `approbationClePrivee`),
   * gardées 60 s en mémoire au plus ; jamais journalisées ni renvoyées. Quel que soit le mode, aucune
   * donnée personnelle n'est chiffrée ni empreinte sans les deux secrets : pas de clé de repli.
   */
  // L'hôte limite le débit des résolutions de secrets (« Rate limit exceeded for secret resolution ») :
  // un agent qui dépose plusieurs pages d'affilée les épuise. Les clés résolues restent donc en mémoire
  // 60 s au plus, par entreprise et par couple de secrets (jamais écrites, journalisées ni renvoyées).
  const cacheCles = new Map<string, { cles: ClesDonnees; expire: number }>();
  async function clesDonnees(companyId: string): Promise<ClesDonnees> {
    const config = await d.configEntreprise(companyId);
    const refC = config.donneesCleChiffrement;
    const refH = config.donneesCleHmac;
    if (estRefSecret(refC) && estRefSecret(refH)) {
      const cleCache = `${companyId}:${JSON.stringify(refC)}:${JSON.stringify(refH)}`;
      const enCache = cacheCles.get(cleCache);
      if (enCache && enCache.expire > Date.now()) return enCache.cles;
      const lire = async (ref: unknown, chemin: string) => {
        try {
          return decoderCle(await ctx.secrets.resolve(ref as never, { companyId, configPath: chemin } as never));
        } catch {
          ctx.logger.warn("Clé des données de prospection indisponible", { companyId, chemin });
          return erreur("acces_refuse", `Clé « ${chemin} » indisponible (secret introuvable ou inaccessible) : aucune donnée personnelle n'est enregistrée.`);
        }
      };
      const chiffrement = await lire(refC, "donneesCleChiffrement");
      const hmac = await lire(refH, "donneesCleHmac");
      if (chiffrement.byteLength !== TAILLE_CLE_CHIFFREMENT) erreur("acces_refuse", `Clé « donneesCleChiffrement » invalide : ${TAILLE_CLE_CHIFFREMENT} octets attendus.`);
      if (hmac.byteLength < TAILLE_CLE_HMAC_MIN) erreur("acces_refuse", `Clé « donneesCleHmac » invalide : au moins ${TAILLE_CLE_HMAC_MIN} octets attendus.`);
      if (memeCle(chiffrement, hmac)) erreur("acces_refuse", "Clés « donneesCleChiffrement » et « donneesCleHmac » identiques : deux secrets distincts sont obligatoires.");
      const cles: ClesDonnees = { chiffrement, hmac, origine: "coffre" };
      cacheCles.set(cleCache, { cles, expire: Date.now() + 60_000 });
      return cles;
    }
    if (estRefSecret(refC) || estRefSecret(refH)) {
      erreur("acces_refuse", "Configuration incomplète : « donneesCleChiffrement » et « donneesCleHmac » vont ensemble (deux secrets natifs distincts).");
    }
    return erreur("acces_refuse", "Aucune clé de chiffrement des données configurée (secrets natifs « donneesCleChiffrement » et « donneesCleHmac » du plugin). Aucune donnée personnelle n'est enregistrée ni recherchée sans elles.");
  }

  const hacher = (cles: ClesDonnees, type: TypeEmpreinte, brut: string): string | null => {
    const v = valeurPourEmpreinte(type, brut);
    return v === null ? null : empreinte(type, v, cles.hmac);
  };

  /* ---------------- construction d'un prospect ---------------- */

  /** Coordonnées chiffrées et empreintes d'un prospect brut ; les valeurs en clair restent en mémoire. */
  function construireDepuisBrut(b: ProspectBrut, o: { cles: ClesDonnees; companyId: string; campagneId: string | null; referentiel: RenvoiReferentiel; mode: ModeExecution; source: SourceProspect; date: string }): Prospect | null {
    const coordonnees: Prospect["coordonnees"] = [];
    const vues = new Set<string>();
    for (const c of b.courriels.slice(0, 5)) {
      const h = hacher(o.cles, "courriel", c);
      if (h === null || vues.has(`courriel:${h}`)) continue;
      vues.add(`courriel:${h}`);
      coordonnees.push({ canal: "courriel", valeur: chiffrer(c.trim(), o.cles.chiffrement), empreinte: h, nature: natureAdresse(c.trim()) });
    }
    for (const t of b.telephones.slice(0, 5)) {
      const h = hacher(o.cles, "telephone", t);
      if (h === null || vues.has(`telephone:${h}`)) continue;
      vues.add(`telephone:${h}`);
      coordonnees.push({ canal: "telephone", valeur: chiffrer(t.trim(), o.cles.chiffrement), empreinte: h, nature: "inconnue" });
    }
    const empreintes: Empreinte[] = [];
    const bce = b.numeroBce ? hacher(o.cles, "numero_bce", b.numeroBce) : null;
    if (bce) empreintes.push({ type: "numero_bce", valeur: bce });
    const nomCp = b.denomination && b.zone.codePostal ? hacher(o.cles, "nom_code_postal", `${b.denomination}|${b.zone.codePostal}`) : null;
    if (nomCp) empreintes.push({ type: "nom_code_postal", valeur: nomCp });
    let identifiant: Prospect["identifiant"];
    if (b.numeroBce) identifiant = { type: "numero_bce", valeur: b.numeroBce };
    else if (b.identifiantReglementaire) identifiant = { type: "identifiant_reglementaire", valeur: b.identifiantReglementaire.slice(0, 64) };
    else {
      const h = nomCp ?? (b.cleOsm ? hacher(o.cles, "nom_code_postal", `osm|${b.cleOsm}`) : null);
      if (h === null) return null;
      identifiant = { type: "empreinte", valeur: h };
    }
    const p = {
      id: randomUUID(), companyId: o.companyId, campagneId: o.campagneId, cible: b.cible, identifiant, numeroBce: b.numeroBce, referentiel: o.referentiel,
      forme: b.forme, denomination: b.denomination, nomChiffre: null, nace: b.nace, zone: b.zone, coordonnees, empreintes: [] as Empreinte[], sources: [{ ...o.source, ...(b.faits.length > 0 ? { faits: b.faits } : {}), ...(b.categorieOsm ? { categorieOsm: b.categorieOsm } : {}) }],
      mode: o.mode, statut: "nouveau" as const, motifsExclusion: [] as ExclusionConstatee[], score: null, basesLegales: [], particulier: null, creeLe: o.date, modifieLe: o.date,
    } satisfies Prospect;
    p.empreintes = empreintesDuProspect({ empreintes, coordonnees }).slice(0, 20);
    return p;
  }

  /** Prospect particulier : nom et coordonnées chiffrés, identifiant = empreinte (courriel, sinon téléphone, nom + code postal, adresse). */
  function construireParticulier(o: {
    cles: ClesDonnees; companyId: string; campagneId: string | null; referentiel: RenvoiReferentiel; mode: ModeExecution; enClair: CoordonneesEnClair; zone: ZoneProspect;
    origine: OrigineParticulier; consentements: PreuveConsentement[]; clientId: string | null; source: SourceProspect; date: string;
    /** Produits demandés par la personne, utilisés quand le renvoi au référentiel ne nomme aucune offre. */
    produitsDemandes?: readonly string[];
  }): Prospect | null {
    const c = o.enClair;
    const coordonnees: Prospect["coordonnees"] = [];
    const courriel = c.courriel ? hacher(o.cles, "courriel", c.courriel) : null;
    if (c.courriel && courriel) coordonnees.push({ canal: "courriel", valeur: chiffrer(c.courriel, o.cles.chiffrement), empreinte: courriel, nature: natureAdresse(c.courriel) });
    const telephone = c.telephone ? hacher(o.cles, "telephone", c.telephone) : null;
    if (c.telephone && telephone) coordonnees.push({ canal: "telephone", valeur: chiffrer(c.telephone, o.cles.chiffrement), empreinte: telephone, nature: "inconnue" });
    const adresse = c.adresse ? hacher(o.cles, "nom_code_postal", `adresse|${c.adresse}`) : null;
    if (c.adresse && adresse) coordonnees.push({ canal: "courrier", valeur: chiffrer(c.adresse, o.cles.chiffrement), empreinte: adresse, nature: "inconnue" });
    const nomCp = o.zone.codePostal ? hacher(o.cles, "nom_code_postal", `${c.nom}|${o.zone.codePostal}`) : null;
    const cleIdentite = courriel ?? telephone ?? nomCp ?? adresse;
    if (cleIdentite === null) return null;
    const empreintes: Empreinte[] = nomCp ? [{ type: "nom_code_postal", valeur: nomCp }] : [];
    return Prospect.parse({
      id: randomUUID(), companyId: o.companyId, campagneId: o.campagneId, cible: "particulier", identifiant: { type: "empreinte", valeur: cleIdentite }, numeroBce: null,
      referentiel: o.referentiel, forme: "personne_physique", denomination: null, nomChiffre: chiffrer(c.nom, o.cles.chiffrement), nace: [], zone: o.zone,
      coordonnees, empreintes: empreintesDuProspect({ empreintes, coordonnees }).slice(0, 20), sources: [o.source],
      mode: o.mode, statut: "nouveau", motifsExclusion: [], score: null, basesLegales: [],
      particulier: { origine: o.origine, consentements: o.consentements, offresDemandees: o.referentiel.offres.length > 0 ? o.referentiel.offres : [...new Set(o.produitsDemandes ?? [])], clientId: o.clientId, pseudonyme: `[client-${cleIdentite.slice(0, 8)}]` },
      creeLe: o.date, modifieLe: o.date,
    });
  }

  /**
   * Opposition (art. 21.3) : empreinte seule, jamais la valeur ; les prospects déjà connus qui portent
   * cette empreinte sont exclus sans attendre un nouveau dépôt.
   */
  async function enregistrerOpposition(companyId: string, cles: ClesDonnees, o: { type: "courriel" | "telephone" | "numero_bce"; valeur: string; canal: CanalContact | "tous"; origine: Opposition["origine"]; par: string; recueillieLe: string | null }) {
    const h = hacher(cles, o.type, o.valeur);
    if (h === null) return null;
    const nouvelle = (await base.insererOpposition({ id: randomUUID(), companyId, type: o.type, empreinte: h, canal: o.canal, origine: o.origine, par: o.par, recueillieLe: o.recueillieLe })) === 1;
    const date = maintenant().toISOString();
    let exclus = 0;
    for (const id of await base.prospectsAvecEmpreinte(companyId, o.type, h)) {
      // Une opposition s'applique aussi aux prospects à la corbeille : une restauration ne doit pas les remettre contactables.
      const l = await base.lireProspect(companyId, id, { corbeille: true });
      if (!l || (l.motifsExclusion as ExclusionConstatee[]).some((m) => m.motif === "opposition_client")) continue;
      await base.exclureProspect(companyId, id, fusionnerMotifs(l.motifsExclusion as ExclusionConstatee[], [{ motif: "opposition_client", detail: "Inscrit à la liste d'opposition du client", constateLe: date }]));
      exclus++;
    }
    return { empreinte: h, nouvelle, exclus };
  }

  async function referentielPour(companyId: string, campagneId: string | null): Promise<RenvoiReferentiel> {
    const r = await base.referentielProspection(companyId, campagneId);
    const renvoi = r.renvoi === null ? null : RenvoiReferentiel.safeParse(r.renvoi);
    if (renvoi?.success) return renvoi.data;
    // Sans renvoi enregistré sur la campagne : dernière version de la marque, sans entité ni segment.
    return RenvoiReferentiel.parse({ version: r.versionMarque ?? 1 });
  }

  /** Contexte des règles d'exclusion pour un lot de prospects (listes d'empreintes de l'entreprise). */
  async function contexteExclusions(companyId: string, campagne: Campagne | null, modeCampagne: ModeExecution, prospects: readonly Prospect[], date: string): Promise<{ contexte: ContexteProspection; enBase: Array<{ prospectId: string; type: string; valeur: string }> }> {
    const valeurs = [...new Set(prospects.flatMap((p) => empreintesDuProspect(p).map((e) => e.valeur)))];
    const [enBase, oppositions, clients, dncm] = await Promise.all([
      base.empreintesProspectsEnBase(companyId, valeurs),
      base.oppositionsPour(companyId, valeurs),
      base.clientsActuelsPour(companyId, valeurs),
      base.dncmPour(companyId, valeurs),
    ]);
    return {
      contexte: {
        maintenant: date,
        modeCampagne,
        canaux: canauxDeCampagne(campagne?.canaux ?? []),
        zone: zoneDeCampagne(campagne?.perimetre.zones ?? []),
        oppositions: oppositions.map((o) => ({ type: o.type as TypeEmpreinte, valeur: o.valeur })),
        dncm,
        clientsActuels: clients.map((c) => ({ type: c.type as TypeEmpreinte, valeur: c.valeur })),
      },
      enBase,
    };
  }

  /** Empreintes déjà en base portées par d'AUTRES prospects que `idExistant` (doublon avec l'existant). */
  function autresEmpreintes(enBase: Array<{ prospectId: string; type: string; valeur: string }>, idExistant: string | null): Empreinte[] {
    return enBase.filter((e) => e.prospectId !== idExistant).map((e) => ({ type: e.type as TypeEmpreinte, valeur: e.valeur }));
  }

  function fusionnerMotifs(anciens: readonly ExclusionConstatee[], nouveaux: readonly ExclusionConstatee[]): ExclusionConstatee[] {
    const vus = new Set(anciens.map((m) => m.motif));
    return [...anciens, ...nouveaux.filter((m) => !vus.has(m.motif) && (vus.add(m.motif), true))].slice(0, 20);
  }

  type LigneProspect = NonNullable<Awaited<ReturnType<BaseAtelier["lireProspect"]>>>;

  /**
   * Enregistre un prospect validé (nouveau) ou le fusionne avec celui de même identifiant : sources et
   * coordonnées ajoutées, motifs d'exclusion jamais retirés automatiquement, statut `exclu` dès qu'un
   * motif existe. Le contrat `Prospect` est vérifié AVANT toute écriture.
   */
  async function enregistrer(p: Prospect, existant: LigneProspect | null, motifs: ExclusionConstatee[]): Promise<{ prospect: Prospect; cree: boolean }> {
    if (existant === null) {
      const final = Prospect.parse({ ...p, motifsExclusion: motifs.slice(0, 20), statut: motifs.length > 0 ? "exclu" : "nouveau" });
      await base.insererProspect({ ...final });
      await base.ajouterEmpreintesProspect(final.companyId, final.id, final.empreintes);
      return { prospect: final, cree: true };
    }
    if (existant.cleAReimporter) {
      // Fiche chiffrée avec l'ancienne clé devinable : illisible, jamais fusionnée. Le nouveau dépôt la remplace (clé du coffre).
      const final = Prospect.parse({ ...p, id: existant.id, motifsExclusion: motifs.slice(0, 20), statut: motifs.length > 0 ? "exclu" : "nouveau" });
      await base.remplacerProspectAReimporter(final.companyId, final.id, {
        nomChiffre: final.nomChiffre, nace: final.nace, zone: final.zone, coordonnees: final.coordonnees, sources: final.sources, statut: final.statut, motifsExclusion: final.motifsExclusion, particulier: final.particulier,
      });
      await base.ajouterEmpreintesProspect(final.companyId, final.id, final.empreintes);
      return { prospect: final, cree: false };
    }
    const anciennesCoord = existant.coordonnees as Prospect["coordonnees"];
    const coordonnees = [...anciennesCoord, ...p.coordonnees.filter((c) => !anciennesCoord.some((a) => a.canal === c.canal && a.empreinte === c.empreinte))].slice(0, 20);
    const anciennesSources = existant.sources as SourceProspect[];
    // Un lieu OSM déjà connu dont la source n'a pas de catégorie la reçoit du nouveau dépôt (même dépôt rejoué), sans doublon.
    const completees = anciennesSources.map((a) => {
      const n = a.categorieOsm === undefined && a.sourceId !== null ? p.sources.find((s) => s.sourceId === a.sourceId && s.categorieOsm !== undefined) : undefined;
      return n ? { ...a, categorieOsm: n.categorieOsm } : a;
    });
    const sources = [...completees, ...p.sources.filter((s) => !anciennesSources.some((a) => a.sourceId !== null && a.sourceId === s.sourceId))].slice(-50);
    const fusion = fusionnerMotifs(existant.motifsExclusion as ExclusionConstatee[], motifs);
    const statut = fusion.length > 0 ? "exclu" : existant.statut;
    let particulier = existant.particulier as Prospect["particulier"];
    if (particulier && p.particulier) {
      const refs = new Set(particulier.consentements.map((c) => c.reference));
      particulier = {
        ...particulier,
        consentements: [...particulier.consentements, ...p.particulier.consentements.filter((c) => !refs.has(c.reference))].slice(0, 10),
        // Une nouvelle demande peut nommer un produit : il s'ajoute aux offres déjà demandées.
        offresDemandees: [...new Set([...particulier.offresDemandees, ...p.particulier.offresDemandees])].slice(0, 50),
      };
    }
    // La marque `cleAReimporter` est une donnée de stockage, hors du contrat strict `Prospect` (ici toujours false).
    const { cleAReimporter: _marque, ...ligneExistante } = existant;
    const final = Prospect.parse({
      ...ligneExistante, coordonnees, sources, statut, motifsExclusion: fusion, particulier,
      nace: existant.nace.length > 0 ? existant.nace : p.nace,
      zone: existant.zone,
      empreintes: empreintesDuProspect({ empreintes: p.empreintes, coordonnees }).slice(0, 20),
      score: null, basesLegales: [], modifieLe: p.modifieLe,
    });
    await base.majProspect(final.companyId, final.id, { nace: final.nace, zone: final.zone, coordonnees: final.coordonnees, sources: final.sources, statut: final.statut, motifsExclusion: final.motifsExclusion, particulier: final.particulier });
    await base.ajouterEmpreintesProspect(final.companyId, final.id, final.empreintes);
    return { prospect: final, cree: false };
  }

  /** Score expliqué (si le client a choisi des poids couvrant au moins un critère) ; enregistré dans son historique. */
  async function scorer(p: Prospect, criteres: CritereEvalue[], poids: { version: number; poids: Record<string, number> } | null, date: string): Promise<ScoreProspect | null> {
    if (poids === null) return null;
    const retenus = criteres.filter((c) => poids.poids[c.code] !== undefined);
    if (retenus.length === 0) return null;
    const score = calculerScore({ criteres: retenus, poids, calculeLe: date });
    await base.insererScoreProspect({ id: randomUUID(), companyId: p.companyId, prospectId: p.id, valeur: score.valeur, criteres: score.criteres, versionPoids: score.versionPoids, calculeLe: score.calculeLe });
    return score;
  }

  /** Prospect relu (ligne + empreintes, dernier score, bases légales), validé par le contrat. */
  function assembler(l: LigneProspect, det: Awaited<ReturnType<BaseAtelier["detailsProspects"]>>): Prospect {
    const s = det.scores.get(l.id);
    // P9b : probabilité mesurée quand un étalonnage a été appliqué (marge de Wilson), estimation sinon.
    const e = s?.nature === "probabilite_mesuree" ? s.etalonnage ?? null : null;
    const etalonnage = e
      ? { etalonnageId: e.etalonnageId, marge: { probabilite: e.probabilite, borneBasse: e.borneBasse, borneHaute: e.borneHaute, niveauConfiance: 0.95, methode: "wilson" }, effectif: e.effectif, conversions: e.conversions, methode: e.methode, date: e.date }
      : null;
    const score = s ? { valeur: s.valeur, criteres: s.criteres, versionPoids: s.versionPoids, nature: etalonnage ? "probabilite_mesuree" : "estimation", etalonnage, calculeLe: s.calculeLe } : null;
    const basesLegales = (det.bases.get(l.id) ?? []).map((b) => ({
      prospectId: l.id, cible: b.cible, forme: b.forme, canal: b.canal, base: b.base, natureAdresse: b.nature_adresse,
      preuve: typeof b.preuve === "string" ? JSON.parse(b.preuve) : b.preuve, information: typeof b.information === "string" ? JSON.parse(b.information) : b.information,
      dncmVerifieLe: b.dncm_verifie_le == null ? null : new Date(String(b.dncm_verifie_le)).toISOString(), verifieLe: new Date(String(b.verifie_le)).toISOString(), verifiePar: b.verifie_par,
    }));
    // `cleAReimporter` (marque de stockage) n'appartient pas au contrat strict `Prospect` : retirée avant validation.
    const { cleAReimporter: _marque, ...ligne } = l;
    const r = Prospect.safeParse({ ...ligne, empreintes: (det.empreintes.get(l.id) ?? []).slice(0, 20), score, basesLegales: basesLegales.map((b) => BaseLegaleContact.parse(b)) });
    if (!r.success) {
      ctx.logger.error("Prospect en base non conforme au contrat", { companyId: l.companyId, prospectId: l.id, chemins: r.error.issues.slice(0, 5).map((i) => i.path.join(".")) });
      erreur("erreur_interne", `Prospect ${l.id} non conforme au contrat (voir le journal du plugin).`);
    }
    return r.data;
  }

  /** Cibles du client (dernière version de la marque) et état de sa base de clients, pour la confiance de qualification. */
  async function contexteQualification(companyId: string): Promise<ContexteQualification> {
    const [marque] = await base.marques(companyId);
    const etat = await base.etatBaseClients(companyId);
    const reglages = d.lectureQualification ? await d.lectureQualification(companyId) : {};
    return {
      ...reglages,
      cibles: (marque?.ciblesProspection ?? []) as ContexteQualification["cibles"],
      segments: (marque?.segments ?? []) as ContexteQualification["segments"],
      etablissements: (marque?.etablissements ?? []) as ContexteQualification["etablissements"],
      offres: (marque?.offres ?? []) as NonNullable<ContexteQualification["offres"]>,
      baseClientsImportee: etat.clients > 0,
      maintenant: maintenant().toISOString(),
    };
  }

  /** Ajoute la confiance de qualification (recalculée à chaque lecture, donc à jour après chaque dépôt). */
  async function avecConfiance(companyId: string, prospects: Prospect[]): Promise<Prospect[]> {
    if (prospects.length === 0) return prospects;
    const ctx = await contexteQualification(companyId);
    return prospects.map((p) => ({ ...p, confiance: calculerConfiance(p, ctx) }));
  }

  async function relire(companyId: string, id: string): Promise<Prospect> {
    const l = await base.lireProspect(companyId, id);
    if (!l) erreur("introuvable", "Prospect introuvable dans cette entreprise.");
    return (await avecConfiance(companyId, [assembler(l, await base.detailsProspects(companyId, [id]))]))[0]!;
  }

  /** Enregistre un lot : dédoublonnage interne, exclusions §5.4, fusion avec l'existant, score. */
  async function enregistrerLot(companyId: string, lot: Array<{ prospect: Prospect; enClair: CoordonneesEnClair | null; site: string | null; libelleSource: string }>, campagne: Campagne | null, modeCampagne: ModeExecution, date: string, ignorerControleBce = false) {
    // Même identifiant deux fois dans la réponse : la première occurrence suffit.
    const parIdentifiant = new Map<string, (typeof lot)[number]>();
    let fusionnes = 0;
    for (const x of lot) {
      const cle = `${x.prospect.identifiant.type}:${x.prospect.identifiant.valeur}`;
      if (parIdentifiant.has(cle)) fusionnes++;
      else parIdentifiant.set(cle, x);
    }
    const uniques = [...parIdentifiant.values()];
    const doublons = new Map(dedoublonner(uniques.map((x) => x.prospect), date).exclus.map((e) => [e.prospect.id, e.exclusion]));
    const existants = new Map((await base.prospectsParIdentifiants(companyId, uniques.map((x) => x.prospect.identifiant))).map((l) => [`${l.identifiant.type}:${l.identifiant.valeur}`, l]));
    const { contexte, enBase } = await contexteExclusions(companyId, campagne, modeCampagne, uniques.map((x) => x.prospect), date);
    const poids = await base.poidsScoreCourant(companyId);
    // Zones des établissements (critère B2C « zone desservie ») : dernière version du référentiel.
    const etablissements = (await base.referentielProspection(companyId, campagne?.id ?? null)).etablissements ?? [];
    const resultats: Array<{ prospect: Prospect; cree: boolean }> = [];
    for (const x of uniques) {
      const existant = existants.get(`${x.prospect.identifiant.type}:${x.prospect.identifiant.valeur}`) ?? null;
      const p = existant ? { ...x.prospect, id: existant.id } : x.prospect;
      const motifsBruts = exclusionsProspect(p, { ...contexte, empreintesExistantes: autresEmpreintes(enBase, existant?.id ?? null), coordonneesEnClair: x.enClair, ignorerControleBce });
      // Un prospect déjà en base ne devient pas le doublon d'un prospect arrivé APRÈS lui : le doublon,
      // c'est le nouveau venu (sinon un simple nouveau dépôt exclurait la fiche d'origine).
      const motifs = existant ? motifsBruts.filter((m) => m.motif !== "doublon") : motifsBruts;
      const doublon = doublons.get(x.prospect.id);
      const r = await enregistrer(p, existant, doublon ? fusionnerMotifs([doublon], motifs) : motifs);
      const score = await scorer(r.prospect, criteresDuProspect(r.prospect, x.site, x.libelleSource, date, etablissements), poids, date);
      resultats.push({ prospect: score ? { ...r.prospect, score } : r.prospect, cree: r.cree });
    }
    // La confiance se recalcule à chaque dépôt : les sources fusionnées comptent tout de suite.
    const avecC = await avecConfiance(companyId, resultats.map((x) => x.prospect));
    return { resultats: resultats.map((x, i) => ({ ...x, prospect: avecC[i]! })), fusionnes };
  }

  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  /* ---------------- dépôt signé ---------------- */

  routes["tache.prospects.deposer"] = async (r) =>
    d.exclusif(r.companyId, async () => {
      const entree = analyser(DeposerProspectsEntree, r.corps, "Dépôt de prospects");
      const taille = Buffer.byteLength(JSON.stringify(entree.reponse), "utf8");
      if (taille > LIMITES.depotConnexionMaxOctets) erreur("entree_invalide", `Réponse trop volumineuse (${taille} octets, maximum ${LIMITES.depotConnexionMaxOctets}).`);
      const issue = await d.tache(r.companyId, r.params.issueId ?? "");
      const refuser = async (raison: string): Promise<never> => {
        await base.journaliser({
          companyId: r.companyId, type: "prospects.refuses", entite: "tache", entiteId: issue.id, issueId: issue.id, runId: r.acteur.runId, acteur: r.acteur.id,
          donnees: { service: entree.service, outil: entree.outil, raison },
        });
        return erreur("entree_invalide", raison);
      };
      if (estOutilEcriture(entree.outil)) await refuser(`Réponse d'un outil d'écriture (${entree.outil}) : elle ne fournit pas de prospects.`);
      const cles = await d.clesPasserelle(r.companyId);
      if (cles.length === 0) await refuser("Aucune clé publique de la passerelle configurée dans le plugin : un dépôt de prospects doit être signé par la passerelle, il est refusé sans vérification possible.");
      const instant = maintenant();
      const deduction = deduireModeReponse(entree.reponse, {
        clesPubliques: cles, service: entree.service, outil: entree.outil, arguments: entree.arguments,
        ...(entree.compte !== undefined ? { compte: entree.compte } : {}), maintenant: instant,
      });
      if (!deduction.ok) return refuser(deduction.raison);
      if (reponseEcriture(deduction.structures)) await refuser("Réponse d'un outil d'écriture (état « préparée » ou exécutée) : elle ne fournit pas de prospects.");
      // §6.5 (lot P9a) : la signature de la passerelle est exigée aussi en démonstration (`deduireModeReponse`
      // ne la vérifie que pour une réponse réelle). Mêmes contrôles que pour une réponse réelle, compte facultatif.
      const instantS = Math.floor(instant.getTime() / 1000);
      for (const s of deduction.structures) {
        const v = verifierEnveloppe(s, cles);
        const motif = !v.ok
          ? v.motif
          : v.charge.service !== entree.service || v.charge.outil !== entree.outil
            ? `réponse signée pour ${v.charge.service} · ${v.charge.outil}, déposée comme ${entree.service} · ${entree.outil}`
            : v.charge.erreur !== false
              ? "réponse d'erreur de l'outil"
              : chargeEcriture(v.charge)
                ? "réponse d'un outil d'écriture"
                : v.charge.emis > instantS + DERIVE_HORLOGE_S
                  ? "réponse signée dans le futur"
                  : instantS - v.charge.emis > AGE_MAX_REPONSE_S
                    ? "réponse trop ancienne : refaire l'appel"
                    : entree.arguments !== undefined && v.charge.arguments !== empreinteArgumentsAppel(entree.arguments)
                      ? "arguments déclarés différents de ceux de l'appel signé"
                      : null;
        if (motif !== null) await refuser(`Réponse non signée par la passerelle (ou modifiée) : ${motif}. Déposer la réponse brute de l'outil, sans la modifier.`);
      }

      const campagne = await d.campagneDeTache(r.companyId, issue);
      const effectif = await d.modeEffectif(r.companyId, campagne);
      const clesDonneesLot = await clesDonnees(r.companyId);
      const { prospects: bruts, ignores: ignoresEntreprises } = extraireProspects(entree.service, entree.outil, deduction.structures);
      const b2c = entree.service === "b2c" ? extraireB2c(entree.outil, deduction.structures) : { particuliers: [], oppositions: [], ignores: 0 };
      let ignores = ignoresEntreprises + b2c.ignores;
      // Conditions de la BCE : les données d'une personne physique ne servent jamais au marketing direct (non enregistrées).
      const changementsBce = entree.service === "bce" && entree.outil === "bce_changements" ? extraireChangementsBce(deduction.structures) : new Map<string, FaitBce[]>();
      const comptesBnb = entree.service === "bnb" && entree.outil === "bnb_comptes" ? extraireComptesBnb(deduction.structures) : new Map<string, TailleBnb>();
      const retenus = bruts.filter((b) => !(b.forme === "personne_physique" && b.numeroBce !== null));
      const personnesPhysiques = bruts.length - retenus.length;

      // Source de la tâche : réponse brute NON conservée (coordonnées en clair), seulement son empreinte.
      const sourceId = randomUUID();
      const date = instant.toISOString();
      await base.insererSource({
        id: sourceId, companyId: r.companyId, campagneId: campagne?.id ?? null, issueId: issue.id, revisionId: null,
        url: `connexion://${entree.service}/${entree.outil}`, urlFinale: null, titre: `${entree.service} · ${entree.outil}`, statutAcces: "accessible", codeHttp: null,
        typeContenu: "application/json", extrait: `${retenus.length + b2c.particuliers.length} prospect(s), ${b2c.oppositions.length} opposition(s) ${changementsBce.size} numéro(s) BCE avec changements et ${comptesBnb.size} numéro(s) avec comptes annuels extrait(s) ; coordonnées chiffrées à la réception, réponse brute non conservée.`,
        empreinte: createHash("sha256").update(JSON.stringify(entree.reponse)).digest("hex"), indicesErreur: [], injections: [], provenance: "connexion", mode: deduction.mode,
        connexion: { service: entree.service, outil: entree.outil, indicesMode: deduction.indices, chiffres: [], modeCampagne: effectif.mode, compte: deduction.compte },
      });
      const source: SourceProspect = { type: "depot_signe", sourceId, service: entree.service, outil: entree.outil, url: null, collecteLe: date };
      // Un dépôt n'enrichit que les prospects de SON mode (démonstration ou réel) et hors corbeille.
      const aEnrichir = async <T extends { id: string; mode: string }>(lignes: T[]): Promise<T[]> => {
        const gardees: T[] = [];
        for (const l of lignes) {
          if (l.mode !== deduction.mode) continue;
          if ((await base.lireProspect(r.companyId, l.id)) === null) continue;
          gardees.push(l);
        }
        return gardees;
      };
      // Changements BCE : ils enrichissent les prospects EXISTANTS de même numéro BCE (jamais de nouveau prospect).
      let enrichisParChangements = 0;
      if (changementsBce.size > 0) {
        const existants = await base.prospectsParIdentifiants(r.companyId, [...changementsBce.keys()].map((valeur) => ({ type: "numero_bce", valeur })));
        for (const l of await aEnrichir(existants)) {
          const faits = changementsBce.get(String(l.numeroBce ?? l.identifiant.valeur)) ?? [];
          const anciennes = l.sources as SourceProspect[];
          const connus = anciennes.flatMap((x) => x.faits ?? []);
          const nouveaux = faits.filter((f) => !connus.some((k) => k.code === f.code && k.date === f.date));
          if (nouveaux.length === 0) continue;
          const sources = [...anciennes, SourceProspect.parse({ ...source, faits: nouveaux })].slice(-50);
          await base.majProspect(r.companyId, l.id, { nace: l.nace, zone: l.zone, coordonnees: l.coordonnees, sources, statut: l.statut, motifsExclusion: l.motifsExclusion, particulier: l.particulier });
          enrichisParChangements++;
        }
      }
      // Comptes annuels BNB : ils enrichissent les prospects EXISTANTS de même numéro BCE (jamais de nouveau prospect).
      let enrichisParComptes = 0;
      if (comptesBnb.size > 0) {
        const existants = await base.prospectsParIdentifiants(r.companyId, [...comptesBnb.keys()].map((valeur) => ({ type: "numero_bce", valeur })));
        for (const l of await aEnrichir(existants)) {
          const taille = comptesBnb.get(String(l.numeroBce ?? l.identifiant.valeur));
          if (taille === undefined) continue;
          const anciennes = l.sources as SourceProspect[];
          if (anciennes.some((x) => x.service === "bnb" && x.outil === "bnb_comptes" && egalProfond(x.taille, taille))) continue;
          const sources = [...anciennes, SourceProspect.parse({ ...source, taille })].slice(-50);
          await base.majProspect(r.companyId, l.id, { nace: l.nace, zone: l.zone, coordonnees: l.coordonnees, sources, statut: l.statut, motifsExclusion: l.motifsExclusion, particulier: l.particulier });
          enrichisParComptes++;
        }
      }
      const referentiel = await referentielPour(r.companyId, campagne?.id ?? null);
      const lot: Array<{ prospect: Prospect; enClair: CoordonneesEnClair | null; site: string | null; libelleSource: string }> = retenus.flatMap((b) => {
        const p = construireDepuisBrut(b, { cles: clesDonneesLot, companyId: r.companyId, campagneId: campagne?.id ?? null, referentiel, mode: deduction.mode, source, date });
        if (p === null) ignores++;
        return p === null ? [] : [{ prospect: p, enClair: { nom: b.denomination ?? "?", courriel: b.courriels[0] ?? null, telephone: b.telephones[0] ?? null, adresse: null }, site: b.site, libelleSource: `${entree.service} · ${entree.outil}` }];
      });
      // Particuliers (b2c) : origine légale et consentements tirés de la réponse signée ; un client existant
      // n'est retenu que s'il est rapproché d'une fiche de la base de clients (empreinte `identifiant_client`).
      let clientsHorsBase = 0;
      for (const pb of b2c.particuliers) {
        let clientId: string | null = null;
        if (pb.clientRef !== null) {
          const h = hacher(clesDonneesLot, "identifiant_client", pb.clientRef);
          clientId = h === null ? null : await base.clientParEmpreinte(r.companyId, "identifiant_client", h);
          if (clientId === null) {
            clientsHorsBase++;
            continue;
          }
        }
        const p = construireParticulier({
          cles: clesDonneesLot, companyId: r.companyId, campagneId: campagne?.id ?? null, referentiel, mode: deduction.mode, enClair: pb.coordonnees, zone: pb.zone,
          origine: pb.origine, consentements: pb.consentements, clientId, source, date, produitsDemandes: pb.produit === null ? [] : [pb.produit],
        });
        if (p === null) ignores++;
        else lot.push({ prospect: p, enClair: pb.coordonnees, site: null, libelleSource: `${entree.service} · ${entree.outil}` });
      }
      // Oppositions (b2c_oppositions) : empreintes seules, origine « import » (liste signée du client).
      let oppositionsAjoutees = 0;
      let exclusParOpposition = 0;
      for (const o of b2c.oppositions) {
        for (const canal of o.canaux) {
          for (const [type, valeur] of [["courriel", o.courriel], ["telephone", o.telephone]] as const) {
            if (valeur === null) continue;
            const res = await enregistrerOpposition(r.companyId, clesDonneesLot, { type, valeur, canal, origine: "import", par: `${r.acteur.type}:${r.acteur.id}`, recueillieLe: o.inscritLe });
            if (res?.nouvelle) oppositionsAjoutees++;
            exclusParOpposition += res?.exclus ?? 0;
          }
        }
      }
      // P9b : numéros BCE de démonstration (modulo 97 volontairement faux) admis pour une réponse signée en démonstration.
      const { resultats, fusionnes } = await enregistrerLot(r.companyId, lot, campagne, effectif.mode, date, deduction.mode === "demonstration");
      if (await base.lirePorte(r.companyId, issue.id)) await d.apresEntreeTache(r.companyId, issue.id);
      const exclus = resultats.filter((x) => x.prospect.statut === "exclu").length;
      await base.journaliser({
        companyId: r.companyId, type: "prospects.deposes", entite: "source", entiteId: sourceId, issueId: issue.id, runId: r.acteur.runId, acteur: r.acteur.id,
        donnees: {
          service: entree.service, outil: entree.outil, mode: deduction.mode, modeCampagne: effectif.mode, cles: clesDonneesLot.origine,
          // Couverture calculée (couverture-prospection.ts) : campagne, arguments vérifiés contre la signature, pagination.
          campagneId: campagne?.id ?? null, ...(appelPourCouverture(entree.outil, entree.arguments, deduction.structures) !== undefined ? { appel: appelPourCouverture(entree.outil, entree.arguments, deduction.structures) } : {}),
          crees: resultats.filter((x) => x.cree).length, misAJour: resultats.filter((x) => !x.cree).length, exclus, ignores: ignores + bruts.length - retenus.length, fusionnes, enrichisParChangements, enrichisParComptes, clientsHorsBase, oppositionsAjoutees, exclusParOpposition,
        },
      });
      return {
        statut: 201,
        corps: {
          sourceId,
          mode: deduction.mode,
          modeCampagne: effectif.mode,
          indices: deduction.indices,
          crees: resultats.filter((x) => x.cree).length,
          misAJour: resultats.filter((x) => !x.cree).length,
          exclus,
          ignores,
          personnesPhysiquesEcartees: personnesPhysiques,
          enrichisParChangements,
          enrichisParComptes,
          clientsHorsBase,
          oppositionsAjoutees,
          exclusParOpposition,
          prospects: resultats.map((x) => x.prospect),
          consigne:
            deduction.mode === "demonstration"
              ? "Prospects de démonstration : entreprises et personnes fictives ; chaque reprise dans un livrable porte la mention « démonstration »."
              : null,
        },
      };
    });

  /* ---------------- liste ---------------- */

  const CHAMPS_LISTES = ["cibles", "nace", "codesPostaux", "communes", "provinces", "regions", "statuts", "entites", "etablissements", "segments", "offres", "origines", "zonesBureau"] as const;
  const CHAMPS_NOMBRES = ["scoreMin", "page", "parPage"] as const;
  const CHAMPS_BOOLEENS = ["qualifiesSeulement", "avecClientsActuels"] as const;

  /** Filtres de liste lus dans la requête (listes séparées par des virgules, nombres, booléens), validés par le contrat. */
  function filtresDeRequete(companyId: string, query: Record<string, string | string[]>) {
    const brute: Record<string, unknown> = { companyId };
    for (const [cle, v] of Object.entries(query)) {
      if (cle === "companyId") continue;
      if ((CHAMPS_LISTES as readonly string[]).includes(cle)) brute[cle] = (Array.isArray(v) ? v : [v]).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);
      else if ((CHAMPS_NOMBRES as readonly string[]).includes(cle)) brute[cle] = Number(Array.isArray(v) ? v[0] : v);
      else if ((CHAMPS_BOOLEENS as readonly string[]).includes(cle)) brute[cle] = (Array.isArray(v) ? v[0] : v) === "true";
      else brute[cle] = Array.isArray(v) ? v[0] : v;
    }
    return analyser(ListerProspectsEntree, brute, "Liste des prospects");
  }

  /**
   * Parcourt les prospects du filtre par pages de 200 et ne garde que les qualifiés (la confiance se calcule à la
   * lecture). Le contexte de qualification n'est lu qu'une fois par parcours. S'arrête dès que `plafond` est atteint
   * (le résultat peut alors dépasser `plafond` de moins d'une page : l'appelant tranche).
   */
  async function parcourirQualifies(companyId: string, f: ReturnType<typeof filtresDeRequete>, plafond: number): Promise<Prospect[]> {
    const qualifies: Prospect[] = [];
    let ctx: ContexteQualification | null = null;
    for (let page = 1; qualifies.length < plafond; page++) {
      const { lignes } = await base.listerProspects(companyId, { ...f, page, parPage: 200 });
      if (lignes.length > 0) {
        const det = await base.detailsProspects(companyId, lignes.map((l) => l.id));
        ctx ??= await contexteQualification(companyId);
        const c = ctx;
        for (const l of lignes) {
          const p = assembler(l, det);
          const confiance = calculerConfiance(p, c);
          if (confiance.qualifie) qualifies.push({ ...p, confiance });
        }
      }
      if (lignes.length < 200) break;
    }
    return qualifies;
  }

  if (d.services) {
    d.services.listerQualifies = (companyId, query, plafond) => parcourirQualifies(companyId, filtresDeRequete(companyId, query), plafond);
  }

  /** Page entière (forme historique) : les filtres de la requête, sans les paramètres de vue. */
  async function pageComplete(companyId: string, query: Record<string, string | string[]>): Promise<PageProspectsComplete> {
    const f = filtresDeRequete(companyId, query);
    if (f.qualifiesSeulement) {
      // La confiance se calcule à la lecture : on parcourt les prospects du filtre, puis on pagine les qualifiés.
      const qualifies = await parcourirQualifies(companyId, f, 5000);
      const debut = (f.page - 1) * f.parPage;
      const { aReimporter } = await base.listerProspects(companyId, { ...f, page: 1, parPage: 1 });
      return { total: qualifies.length, page: f.page, pages: Math.ceil(qualifies.length / f.parPage), prospects: qualifies.slice(debut, debut + f.parPage), ...((aReimporter ?? 0) > 0 ? { aReimporter } : {}) };
    }
    const { total, lignes, aReimporter } = await base.listerProspects(companyId, f);
    const det = await base.detailsProspects(companyId, lignes.map((l) => l.id));
    return { total, page: f.page, pages: Math.ceil(total / f.parPage), prospects: await avecConfiance(companyId, lignes.map((l) => assembler(l, det))), ...((aReimporter ?? 0) > 0 ? { aReimporter } : {}) };
  }

  /**
   * Résumé par défaut (fiches courtes) ; `?partie=detail&prospectId=` rend un prospect entier ; `?vue=complete`
   * rend la page entière comme avant. Les paramètres de vue sont retirés avant la validation stricte des filtres.
   */
  routes["prospects.lister"] = async (r) => {
    const { vue: _vue, partie: _partie, prospectId: _id, ...filtres } = r.query;
    void _vue, _partie, _id;
    const v = analyser(VueProspectsRequete, { vue: pur(r.query["vue"]), partie: pur(r.query["partie"]), prospectId: pur(r.query["prospectId"]) }, "Vue des prospects");
    if (v.partie === "detail") {
      if (!v.prospectId) erreur("entree_invalide", "partie=detail demande prospectId.");
      return { corps: await relire(r.companyId, v.prospectId) };
    }
    const page = await pageComplete(r.companyId, filtres);
    return { corps: v.vue === "complete" ? page : resumerProspects(page) };
  };

  /** Critères de confiance encore non vérifiés d'un prospect, avec l'outil de la passerelle qui pourrait les établir. */
  routes["prospects.criteres-manquants"] = async (r) => {
    const p = await relire(r.companyId, r.params.prospectId ?? "");
    const reglages = d.lectureQualification ? (await d.lectureQualification(r.companyId)).reglages : undefined;
    return { corps: criteresManquants(p, p.confiance!, reglages?.personnalises ?? []) };
  };

  /** Fiche du client (dernière version de la marque) telle que le compte rendu la lit. */
  async function ficheClient(companyId: string): Promise<FicheClientCompteRendu> {
    const [marque] = await base.marques(companyId);
    return {
      offres: (marque?.offres ?? []) as FicheClientCompteRendu["offres"],
      segments: (marque?.segments ?? []) as FicheClientCompteRendu["segments"],
      etablissements: (marque?.etablissements ?? []) as FicheClientCompteRendu["etablissements"],
    };
  }

  async function compteRendu(companyId: string, prospectId: string) {
    const p = await relire(companyId, prospectId);
    return { p, cr: construireCompteRendu(p, await ficheClient(companyId), maintenant()) };
  }

  /** Compte rendu déterministe d'un lead : lecture des données stockées, aucune IA. */
  routes["prospects.compte-rendu"] = async (r) => ({ corps: (await compteRendu(r.companyId, r.params.prospectId ?? "")).cr });

  /** Question d'un humain au Coordinateur sur un lead : tâche native assignée, avec le compte rendu en contexte. */
  routes["prospects.question"] = async (r) => {
    exigerHumain(r.acteur, "Une question au Coordinateur sur un lead");
    const entree = analyser(QuestionProspectEntree, r.corps, "Question sur un lead");
    if (entree.companyId.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Entreprise incohérente : seule l'entreprise résolue par l'hôte est servie.");
    const { p, cr } = await compteRendu(r.companyId, r.params.prospectId ?? "");
    const agents = (await d.ctx.agents.list({ companyId: r.companyId, limit: 200 })).filter((a) => a.status !== "terminated");
    const coord = agents.find((a) => a.role === "ceo") ?? agents.find((a) => a.name.startsWith("Coordinateur")) ?? null;
    if (!coord) erreur("introuvable", "Aucun Coordinateur dans cette entreprise : la question ne peut pas être transmise.");
    const titre = `Lead : ${nomDuProspect(p)} : ${titreDepuisTexte(entree.question)}`;
    const description = [
      entree.question,
      "",
      "Réponds dans la discussion de cette tâche, en t'appuyant sur les sources citées dans le compte rendu ci-dessous et sur la fiche du client. Ne contacte personne et n'invente aucune donnée : ce qui manque, dis-le.",
      "",
      cr.markdown,
    ].join("\n");
    const tache = await d.ctx.issues.create({
      companyId: r.companyId, title: titre, description, status: "todo", priority: "medium", assigneeAgentId: coord.id,
      originKind: ORIGINE_DEMANDE as never, originId: `question-lead:${randomUUID()}`,
      ...(r.acteur.userId ? { actor: { actorUserId: r.acteur.userId } } : {}),
    });
    await base.journaliser({
      companyId: r.companyId, type: "prospect.question", entite: "prospect", entiteId: p.id, issueId: tache.id, acteur: r.acteur.id,
      donnees: { coordinateurId: coord.id, titre, tailleQuestion: entree.question.length },
    });
    return { statut: 201, corps: { issueId: tache.id, identifiant: tache.identifier ?? null, lien: `/issues/${tache.identifier ?? tache.id}` } };
  };

  /* ---------------- particuliers ---------------- */

  const TYPE_SOURCE_ORIGINE: Partial<Record<OrigineParticulier, SourceProspect["type"]>> = {
    formulaire_entrant: "formulaire", publicite_ciblee: "formulaire", simulateur_devis: "formulaire", devis_abandonne: "formulaire", prise_rendez_vous: "formulaire",
    partenaire_consentement: "partenaire", lead_achete_consentement: "partenaire",
  };

  routes["prospects.particuliers.enregistrer"] = async (r) =>
    d.exclusif(r.companyId, async () => {
      exigerHumain(r.acteur, "L'enregistrement d'un particulier");
      const entree = analyser(EnregistrerParticulierEntree, r.corps, "Prospect particulier");
      if (entree.companyId !== r.companyId) erreur("hors_entreprise", "Entreprise incohérente : seule l'entreprise résolue par l'hôte est servie.");
      const campagne = entree.campagneId ? await base.lireCampagne(r.companyId, entree.campagneId) : null;
      if (entree.campagneId && !campagne) erreur("hors_entreprise", "Campagne introuvable dans cette entreprise.");
      if (entree.clientId && !(await base.clientExiste(r.companyId, entree.clientId))) erreur("hors_entreprise", "Client introuvable dans la base de clients de cette entreprise.");
      const effectif = await d.modeEffectif(r.companyId, campagne);
      const fictif = coordonneesManifestementFictives(entree.coordonnees);
      if (effectif.mode === "demonstration" && !fictif) {
        erreur("entree_invalide", "En démonstration, seules des personnes manifestement fictives sont admises (nom suffixé « (démonstration) », courriel en @exemple.invalid, téléphone +32 4 000…, « Rue de la Démonstration »).");
      }
      // Mode déduit de l'entreprise (et de la campagne) et des coordonnées, jamais déclaré.
      const mode: ModeExecution = effectif.mode === "reel" && !fictif ? "reel" : "demonstration";
      const cles = await clesDonnees(r.companyId);
      const c = entree.coordonnees;
      const date = maintenant().toISOString();
      const p = construireParticulier({
        cles, companyId: r.companyId, campagneId: campagne?.id ?? null, referentiel: entree.referentiel, mode, enClair: c, zone: entree.zone, origine: entree.origine,
        consentements: entree.consentements, clientId: entree.clientId ?? null,
        source: { type: TYPE_SOURCE_ORIGINE[entree.origine] ?? "saisie_humaine", sourceId: null, service: null, outil: null, url: null, collecteLe: date }, date,
      });
      if (p === null) erreur("entree_invalide", "Coordonnées inexploitables : aucun courriel, téléphone ou adresse ne permet d'identifier la personne.");
      const { resultats } = await enregistrerLot(r.companyId, [{ prospect: p, enClair: c, site: null, libelleSource: `saisie · ${entree.origine}` }], campagne, effectif.mode, date);
      const [res] = resultats;
      await base.journaliser({
        companyId: r.companyId, type: "prospect.particulier", entite: "prospect", entiteId: res!.prospect.id, acteur: r.acteur.id,
        donnees: { origine: entree.origine, consentements: entree.consentements.length, mode, cree: res!.cree, statut: res!.prospect.statut, cles: cles.origine },
      });
      return { statut: res!.cree ? 201 : 200, corps: res!.prospect };
    });

  /* ---------------- exclusion manuelle ---------------- */

  routes["prospects.exclure"] = async (r) =>
    d.exclusif(r.companyId, async () => {
      const entree = analyser(ExclureProspectEntree, r.corps, "Exclusion de prospect");
      if (entree.companyId !== r.companyId) erreur("hors_entreprise", "Entreprise incohérente : seule l'entreprise résolue par l'hôte est servie.");
      if (entree.prospectId !== r.params.prospectId) erreur("entree_invalide", "Le prospect du corps diffère de celui de l'adresse.");
      const l = await base.lireProspect(r.companyId, entree.prospectId);
      if (!l) erreur("introuvable", "Prospect introuvable dans cette entreprise.");
      const anciens = l.motifsExclusion as ExclusionConstatee[];
      const deja = anciens.some((m) => m.motif === entree.motif);
      const motifs = deja ? anciens : fusionnerMotifs(anciens, [{ motif: entree.motif, detail: entree.detail, constateLe: maintenant().toISOString() }]);
      if (!deja || l.statut !== "exclu") await base.exclureProspect(r.companyId, l.id, motifs);
      await base.journaliser({
        companyId: r.companyId, type: "prospect.exclu", entite: "prospect", entiteId: l.id, runId: r.acteur.runId, acteur: r.acteur.id,
        donnees: { motif: entree.motif, detail: entree.detail, acteurType: r.acteur.type, deja },
      });
      return { corps: await relire(r.companyId, l.id) };
    });

  /* ---------------- rattrapage des doublons ---------------- */

  /**
   * Fiches qui désignent la même entreprise (BCE identique, ou nom sans forme juridique et code postal identiques).
   * À blanc par défaut : rien n'est écrit. Fusion : sources et coordonnées réunies dans la fiche gardée, fiche
   * absorbée écartée avec le motif `doublon` (jamais supprimée).
   */
  routes["prospects.fusionner-doublons"] = async (r) =>
    d.exclusif(r.companyId, async () => {
      exigerHumain(r.acteur, "La fusion des doublons de prospects");
      const entree = analyser(FusionnerDoublonsEntree, r.corps, "Fusion des doublons");
      if (entree.companyId !== r.companyId) erreur("hors_entreprise", "Entreprise incohérente : seule l'entreprise résolue par l'hôte est servie.");
      const tous: Prospect[] = [];
      for (let page = 1; ; page++) {
        const { lignes } = await base.listerProspects(r.companyId, { page, parPage: 200, avecClientsActuels: true });
        const det = await base.detailsProspects(r.companyId, lignes.map((l) => l.id));
        tous.push(...lignes.map((l) => assembler(l, det)));
        if (lignes.length < 200) break;
      }
      const paires = trouverPairesDoublons(tous);
      const date = maintenant().toISOString();
      if (!entree.aBlanc) {
        // Une fiche gardée reçoit une fiche après l'autre : on repart de l'état déjà fusionné.
        const etat = new Map(tous.map((p) => [p.id, p]));
        for (const { garde, absorbe } of paires) {
          const g = etat.get(garde.id)!;
          const a = etat.get(absorbe.id)!;
          const fusion = fusionnerProspects(g, a, egalProfond);
          const motifs = fusionnerMotifs(g.motifsExclusion, a.motifsExclusion.filter((m) => m.motif !== "doublon"));
          const statut = motifs.length > 0 ? "exclu" : g.statut;
          await base.majProspect(r.companyId, g.id, { nace: fusion.nace, zone: g.zone, coordonnees: fusion.coordonnees, sources: fusion.sources, statut, motifsExclusion: motifs, particulier: g.particulier });
          await base.ajouterEmpreintesProspect(r.companyId, g.id, fusion.empreintes);
          await base.exclureProspect(r.companyId, a.id, fusionnerMotifs(a.motifsExclusion, [{ motif: "doublon", detail: `Fusionné dans ${g.id}`, constateLe: date }]));
          etat.set(g.id, { ...g, ...fusion, statut, motifsExclusion: motifs });
        }
        await base.journaliser({
          companyId: r.companyId, type: "prospects.doublons-fusionnes", entite: "prospect", entiteId: r.companyId, runId: r.acteur.runId, acteur: r.acteur.id,
          donnees: { fusionnes: paires.length, paires: paires.map((p) => ({ garde: p.garde.id, absorbe: p.absorbe.id, raison: p.raison })).slice(0, 200) },
        });
      }
      return {
        corps: {
          companyId: r.companyId,
          aBlanc: entree.aBlanc,
          examines: tous.length,
          fusionnes: entree.aBlanc ? 0 : paires.length,
          paires: paires.map((p) => ({ gardeId: p.garde.id, absorbeId: p.absorbe.id, gardee: p.garde.denomination, absorbee: p.absorbe.denomination, raison: p.raison })),
        },
      };
    });

  /* ---------------- opposition ---------------- */

  routes["oppositions.ajouter"] = async (r) =>
    d.exclusif(r.companyId, async () => {
      exigerHumain(r.acteur, "L'enregistrement d'une opposition");
      const entree = analyser(AjouterOppositionEntree, r.corps, "Opposition");
      if (entree.companyId !== r.companyId) erreur("hors_entreprise", "Entreprise incohérente : seule l'entreprise résolue par l'hôte est servie.");
      const effectif = await d.modeEffectif(r.companyId, null);
      const cles = await clesDonnees(r.companyId);
      // La valeur en clair ne sort pas de cette fonction : ni stockée, ni journalisée, ni renvoyée.
      const res = await enregistrerOpposition(r.companyId, cles, { type: entree.type, valeur: entree.valeur, canal: entree.canal, origine: entree.origine, par: `${r.acteur.type}:${r.acteur.id}`, recueillieLe: entree.recueillieLe ?? null });
      if (res === null) erreur("entree_invalide", "Valeur d'opposition inexploitable.");
      const { nouvelle, exclus } = res;
      const opposition = await base.lireOpposition(r.companyId, entree.type, res.empreinte, entree.canal);
      if (!opposition) erreur("erreur_interne", "Opposition introuvable après son enregistrement.");
      await base.journaliser({
        companyId: r.companyId, type: "opposition.ajoutee", entite: "opposition", entiteId: opposition.id, acteur: r.acteur.id,
        donnees: { type: entree.type, canal: entree.canal, origine: entree.origine, nouvelle, prospectsExclus: exclus, cles: cles.origine },
      });
      return { statut: nouvelle ? 201 : 200, corps: Opposition.parse(opposition) };
    });

  // Lot P9b : base de clients, étalonnage, exports (services-base-clients.ts).
  Object.assign(routes, routesBaseClients(d, {
    clesDonnees, relire, referentielPour, contexteExclusions,
    assemblerLignes: async (companyId, lignes) => {
      const det = await base.detailsProspects(companyId, lignes.map((l) => l.id));
      return avecConfiance(companyId, lignes.map((l) => assembler(l, det)));
    },
  }));

  return routes;
}

function exigerHumain(acteur: ActeurHote, quoi: string) {
  if (acteur.type !== "humain") erreur("elevation_refusee", `${quoi} est réservé à un humain.`);
}
