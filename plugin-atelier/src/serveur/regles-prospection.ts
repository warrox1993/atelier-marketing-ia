/**
 * Lot P5 : règles pures de la prospection (docs/prospection-conception.md, §3.2 et §5.4).
 *
 * Aucune entrée-sortie, aucune date système implicite : l'instant de référence (« maintenant ») est
 * toujours passé en paramètre. Les listes (oppositions, « Ne m'appelez plus », clients actuels) sont
 * des listes d'EMPREINTES HMAC : les règles comparent des empreintes, jamais des valeurs en clair.
 * Les coordonnées en clair ne servent qu'aux contrôles de syntaxe, quand l'appelant les a déchiffrées.
 *
 * Contenu :
 * - contrôles de forme : `bceValide`, `telephoneBelgeE164`, `courrielValide`, `natureAdresse` ;
 * - faux leads : `dedoublonner`, `exclusionsProspect` (motifs du contrat `MotifExclusion`) ;
 * - matrice canal × cible : `contactPermis` (bases légales du §3.2, consentements des particuliers,
 *   fraîcheur de la vérification « Ne m'appelez plus »).
 */
import {
  basePermise,
  DNCM_VALIDITE_JOURS,
  EMPREINTES_PROSPECTION_DEMONSTRATION,
  DEMONSTRATION_COORDONNEES,
  type BaseLegaleContact,
  type CanalContact,
  type CoordonneesEnClair,
  type Empreinte,
  type ExclusionConstatee,
  type ModeExecution,
  type MotifExclusion,
  type NatureAdresse,
  type Prospect,
  type TypeEmpreinte,
} from "../contrats/index.js";

/* ------------------------------------------------------------------ */
/* Contrôles de forme                                                  */
/* ------------------------------------------------------------------ */

/**
 * Vrai si le numéro d'entreprise BCE est valide : 10 chiffres commençant par 0 ou 1 (points,
 * espaces et préfixe « BE » tolérés), dont les 2 derniers valent 97 − (8 premiers mod 97).
 */
export function bceValide(numero: string): boolean {
  const brut = numero.trim().toUpperCase().replace(/^BE/u, "").replace(/[\s.]/gu, "");
  if (!/^[01]\d{9}$/u.test(brut)) return false;
  const base = Number(brut.slice(0, 8));
  const controle = Number(brut.slice(8));
  return controle === 97 - (base % 97);
}

/**
 * Normalise un numéro belge au format E.164 (`+32…`) ou rend null s'il n'en est pas un.
 * Accepte `+32`, `0032` et le format national `0…` ; espaces, points, tirets, barres obliques et
 * parenthèses sont ignorés. Après `+32` : 9 chiffres commençant par 4 (mobile) ou 8 chiffres (fixe,
 * numéros spéciaux 0800/090x compris).
 */
export function telephoneBelgeE164(texte: string): string | null {
  let n = texte.trim().replace(/[\s.\-/()]/gu, "");
  if (n.startsWith("0032")) n = `+32${n.slice(4)}`;
  else if (/^0[1-9]/u.test(n)) n = `+32${n.slice(1)}`;
  return /^\+32(?:4\d{8}|[1-9]\d{7})$/u.test(n) ? n : null;
}

/** Vrai si l'adresse électronique a une syntaxe acceptable (partie locale usuelle, domaine avec extension). */
export function courrielValide(courriel: string): boolean {
  const c = courriel.trim();
  if (c.length > 254) return false;
  const m = /^([A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*)@((?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63})$/u.exec(c);
  return m !== null && m[1]!.length <= 64;
}

/** Premiers segments de partie locale qui désignent une fonction ou un service, pas une personne. */
const LOCAUX_IMPERSONNELS: ReadonlySet<string> = new Set([
  "info", "infos", "information", "contact", "contacts", "bureau", "secretariat", "secretariaat", "admin",
  "administration", "hello", "bonjour", "accueil", "reception", "office", "sales", "vente", "ventes",
  "commercial", "comptabilite", "compta", "facturation", "factures", "invoice", "invoices", "support",
  "service", "serviceclient", "direction", "rh", "jobs", "emploi", "recrutement", "noreply", "webmaster",
  "marketing", "communication", "devis", "commande", "commandes", "boutique", "shop", "mail", "team",
  "equipe", "general", "kantoor", "onthaal", "welkom", "postmaster",
]);

/**
 * Nature d'une adresse électronique d'après sa partie locale (heuristique du §3.2) :
 * - `impersonnelle` si le premier segment (séparé par `.`, `_` ou `-`, chiffres finaux ignorés)
 *   désigne une fonction (`info@`, `contact-liege@`, `secretariat@`…) ;
 * - `nominative` pour une forme `prenom.nom@` (ou `p.nom@`) ;
 * - `inconnue` sinon, y compris pour une adresse invalide ; l'appelant la traite comme nominative.
 */
export function natureAdresse(courriel: string): NatureAdresse {
  if (!courrielValide(courriel)) return "inconnue";
  const local = courriel
    .trim()
    .split("@")[0]!
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\+.*$/u, "");
  const premier = (local.split(/[._-]/u)[0] ?? "").replace(/\d+$/u, "");
  if (LOCAUX_IMPERSONNELS.has(premier) || LOCAUX_IMPERSONNELS.has(local.replace(/[._-]/gu, ""))) return "impersonnelle";
  if (/^[a-z]+[._-][a-z]{2,}$/u.test(local)) return "nominative";
  return "inconnue";
}

/* ------------------------------------------------------------------ */
/* Outils internes                                                     */
/* ------------------------------------------------------------------ */

const MS_JOUR = 86_400_000;

/** Nombre de jours calendaires (UTC) écoulés entre deux instants ISO ; négatif si `depuis` est dans le futur. */
function joursEcoules(depuis: string, maintenant: string): number {
  return Math.floor(Date.parse(maintenant) / MS_JOUR) - Math.floor(Date.parse(depuis) / MS_JOUR);
}

/** Vrai si une vérification datée reste valable : ni dans le futur, ni âgée de DNCM_VALIDITE_JOURS jours ou plus. */
export function verificationDncmFraiche(verifieeLe: string | null, maintenant: string): boolean {
  if (verifieeLe === null || Number.isNaN(Date.parse(verifieeLe))) return false;
  const age = joursEcoules(verifieeLe, maintenant);
  return age >= 0 && age < DNCM_VALIDITE_JOURS;
}

function cleEmpreinte(e: Empreinte): string {
  return `${e.type}:${e.valeur}`;
}

function typeEmpreinteDuCanal(canal: CanalContact): TypeEmpreinte {
  return canal === "courriel" ? "courriel" : canal === "courrier" ? "nom_code_postal" : "telephone";
}

/**
 * Toutes les empreintes d'un prospect : celles qu'il porte, celles de ses coordonnées (courriel ;
 * téléphone pour le téléphone et le SMS) et son numéro BCE éventuel. Sans doublon.
 */
export function empreintesDuProspect(p: Pick<Prospect, "empreintes" | "coordonnees">): Empreinte[] {
  const vues = new Map<string, Empreinte>();
  const ajouter = (e: Empreinte) => vues.set(cleEmpreinte(e), e);
  p.empreintes.forEach(ajouter);
  for (const c of p.coordonnees) if (c.canal !== "courrier") ajouter({ type: typeEmpreinteDuCanal(c.canal), valeur: c.empreinte });
  return [...vues.values()];
}

/** Clés de dédoublonnage : empreintes, identifiant de dédoublonnage, numéro BCE normalisé. */
function clesDedoublonnage(p: Prospect): string[] {
  const cles = empreintesDuProspect(p).map(cleEmpreinte);
  cles.push(`identifiant:${p.identifiant.type}:${p.identifiant.valeur}`);
  if (p.numeroBce !== null) cles.push(`bce:${p.numeroBce.replace(/\D/gu, "")}`);
  return cles;
}

function contient(liste: readonly Empreinte[], empreintes: readonly Empreinte[]): boolean {
  const cles = new Set(liste.map(cleEmpreinte));
  return empreintes.some((e) => cles.has(cleEmpreinte(e)));
}

function sansAccents(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function exclusion(motif: MotifExclusion, detail: string, constateLe: string): ExclusionConstatee {
  return { motif, detail: detail.slice(0, 500), constateLe };
}

/* ------------------------------------------------------------------ */
/* Dédoublonnage                                                       */
/* ------------------------------------------------------------------ */

export interface ResultatDedoublonnage {
  /** Prospects gardés, dans l'ordre d'arrivée. */
  gardes: Prospect[];
  /** Prospects écartés, avec le motif `doublon` et l'identifiant du prospect gardé. */
  exclus: { prospect: Prospect; exclusion: ExclusionConstatee }[];
}

/**
 * Dédoublonne une liste de prospects par empreintes HMAC (et identifiant, numéro BCE) : le premier
 * rencontré est gardé, les suivants qui partagent au moins une clé sont exclus avec le motif
 * `doublon`. Les clés des exclus restent rattachées au prospect gardé (A~B et B~C : C est un doublon de A).
 */
export function dedoublonner(prospects: readonly Prospect[], maintenant: string): ResultatDedoublonnage {
  const representant = new Map<string, Prospect>();
  const resultat: ResultatDedoublonnage = { gardes: [], exclus: [] };
  for (const p of prospects) {
    const cles = clesDedoublonnage(p);
    const deja = cles.map((c) => representant.get(c)).find((r) => r !== undefined);
    const garde = deja ?? p;
    for (const c of cles) if (!representant.has(c)) representant.set(c, garde);
    if (deja === undefined) resultat.gardes.push(p);
    else resultat.exclus.push({ prospect: p, exclusion: exclusion("doublon", `Doublon du prospect ${deja.id}`, maintenant) });
  }
  return resultat;
}

/* ------------------------------------------------------------------ */
/* Exclusions d'un prospect                                            */
/* ------------------------------------------------------------------ */

/** Zone choisie pour la campagne : un prospect est dans la zone s'il correspond à l'un des critères donnés. */
export interface ZoneChoisie {
  codesPostaux?: readonly string[];
  communes?: readonly string[];
  provinces?: readonly string[];
  regions?: readonly ("Wallonie" | "Bruxelles-Capitale" | "Flandre")[];
}

export interface ContexteProspection {
  /** Instant de référence (date du jour), ISO 8601 avec décalage ; jamais lu sur l'horloge système. */
  maintenant: string;
  /** Mode de la campagne (une donnée de démonstration n'entre jamais dans une campagne réelle). */
  modeCampagne: ModeExecution;
  /** Canaux visés par la campagne : le contrôle nominatif ne vaut que pour le courriel, la liste DNCM que pour le téléphone. */
  canaux: readonly CanalContact[];
  /** Zone choisie ; null = aucune restriction géographique. */
  zone: ZoneChoisie | null;
  /** Liste d'opposition propre au client (empreintes). */
  oppositions: readonly Empreinte[];
  /** Liste « Ne m'appelez plus » consultée (empreintes de téléphones) et date de la version consultée ; null = non consultée. */
  dncm: { empreintes: readonly Empreinte[]; verifieeLe: string } | null;
  /** Clients actuels du client (empreintes, ex. `identifiant_client`, courriel, téléphone). */
  clientsActuels: readonly Empreinte[];
  /** Numéros BCE du fichier actif (normalisés en 10 chiffres) ; absent = fichier non chargé, pas de constat. */
  numerosBceActifs?: ReadonlySet<string>;
  /** Empreintes de prospects déjà en base (doublon avec l'existant) ; absent = aucune. */
  empreintesExistantes?: readonly Empreinte[];
  /** Coordonnées déchiffrées du prospect, pour les contrôles de syntaxe ; absent = contrôles non faits. */
  coordonneesEnClair?: CoordonneesEnClair | null;
  /**
   * Lot P9b : DÉMONSTRATION SEULEMENT. Les numéros BCE du jeu de démonstration ont volontairement un
   * contrôle modulo 97 faux (jamais une vraie entreprise) : pour un prospect venu d'une réponse signée de
   * la passerelle en démonstration, le motif `numero_bce_invalide` n'est pas appliqué. Jamais en réel.
   */
  ignorerControleBce?: boolean;
}

/** Vrai si le prospect est un client existant au titre de la vente croisée (volet particulier lié à la base clients). */
function venteCroisee(p: Prospect): boolean {
  return p.particulier !== null && p.particulier.origine === "client_existant" && p.particulier.clientId !== null;
}

/** Consentement prouvé, non retiré, couvrant le canal (volet particulier ou base légale enregistrée). */
export function consentementValable(p: Prospect, canal: CanalContact): boolean {
  if (p.particulier !== null) {
    return p.particulier.consentements.some((c) => c.retireLe === null && c.canauxAutorises.includes(canal));
  }
  return p.basesLegales.some((b) => b.canal === canal && b.base === "consentement" && b.preuve.type === "consentement");
}

function dansZone(p: Prospect, zone: ZoneChoisie): boolean {
  const z = p.zone;
  const criteres = [
    zone.codesPostaux?.length ? z.codePostal !== null && zone.codesPostaux.includes(z.codePostal) : null,
    zone.communes?.length ? z.commune !== null && zone.communes.some((c) => sansAccents(c) === sansAccents(z.commune!)) : null,
    zone.provinces?.length ? z.province !== null && zone.provinces.some((c) => sansAccents(c) === sansAccents(z.province!)) : null,
    zone.regions?.length ? z.region !== null && zone.regions.includes(z.region) : null,
  ].filter((c): c is boolean => c !== null);
  return criteres.length === 0 || criteres.some(Boolean);
}

/** Vrai si un texte porte un marqueur de démonstration (mention, domaine, téléphone ou rue fictifs). */
function porteMarqueurDemo(texte: string | null | undefined): boolean {
  if (texte === null || texte === undefined) return false;
  const t = texte.toLowerCase();
  if (EMPREINTES_PROSPECTION_DEMONSTRATION.some((m) => t.includes(m.toLowerCase()))) return true;
  if (texte.includes(DEMONSTRATION_COORDONNEES.rue)) return true;
  return texte.replace(/\s+/gu, "").startsWith(DEMONSTRATION_COORDONNEES.prefixeTelephone);
}

/** Vrai si le prospect est une donnée de démonstration : mode déduit, ou marqueur dans ses champs ou sources. */
export function estDonneeDemonstration(p: Prospect, enClair?: CoordonneesEnClair | null): boolean {
  if (p.mode === "demonstration") return true;
  if (porteMarqueurDemo(p.denomination)) return true;
  if (p.sources.some((s) => porteMarqueurDemo(s.url) || porteMarqueurDemo(s.outil))) return true;
  if (enClair) return [enClair.nom, enClair.courriel, enClair.telephone, enClair.adresse].some(porteMarqueurDemo);
  return false;
}

/**
 * Motifs d'exclusion automatique d'un prospect (§5.4), dans l'ordre du contrat `MotifExclusion`.
 * Liste vide : aucun motif constaté. Le doublon interne à un lot se traite par `dedoublonner` ; ici,
 * seul le doublon avec des empreintes déjà en base (`empreintesExistantes`) est constaté.
 */
export function exclusionsProspect(p: Prospect, ctx: ContexteProspection): ExclusionConstatee[] {
  const t = ctx.maintenant;
  const motifs: ExclusionConstatee[] = [];
  const empreintes = empreintesDuProspect(p);

  if (ctx.empreintesExistantes && contient(ctx.empreintesExistantes, empreintes)) {
    motifs.push(exclusion("doublon", "Empreinte déjà présente parmi les prospects en base", t));
  }

  if (p.numeroBce !== null) {
    if (!bceValide(p.numeroBce)) {
      if (!(ctx.ignorerControleBce === true && ctx.modeCampagne === "demonstration" && p.mode === "demonstration")) motifs.push(exclusion("numero_bce_invalide", `Numéro BCE ${p.numeroBce} : contrôle modulo 97 en échec`, t));
    } else if (ctx.numerosBceActifs && !ctx.numerosBceActifs.has(p.numeroBce.replace(/\D/gu, ""))) {
      motifs.push(exclusion("entreprise_inactive", `Numéro BCE ${p.numeroBce} absent du fichier des entreprises actives`, t));
    }
  }

  if (p.cible !== "particulier" && p.forme === "personne_physique" && (p.numeroBce !== null || p.sources.some((s) => s.service === "bce"))) {
    motifs.push(exclusion("personne_physique_bce", "Entité BCE personne physique : jamais de marketing direct sur ces données", t));
  }

  if (ctx.zone !== null && !dansZone(p, ctx.zone)) {
    motifs.push(exclusion("hors_zone", "Prospect hors de la zone choisie (ou zone inconnue)", t));
  }

  const enClair = ctx.coordonneesEnClair ?? null;
  if (enClair?.courriel != null && !courrielValide(enClair.courriel)) {
    motifs.push(exclusion("courriel_invalide", "Adresse électronique de syntaxe invalide", t));
  }

  if (ctx.canaux.includes("courriel")) {
    const adresses = p.coordonnees.filter((c) => c.canal === "courriel");
    const natureClair = enClair?.courriel != null ? natureAdresse(enClair.courriel) : null;
    const nominative = adresses.some((c) => c.nature !== "impersonnelle") || (natureClair !== null && natureClair !== "impersonnelle");
    if (nominative && !consentementValable(p, "courriel") && !venteCroisee(p)) {
      motifs.push(exclusion("courriel_nominatif_sans_consentement", "Adresse nominative (ou de nature inconnue) sans consentement prouvé pour le courriel", t));
    }
  }

  if (enClair?.telephone != null && telephoneBelgeE164(enClair.telephone) === null) {
    motifs.push(exclusion("telephone_invalide", "Téléphone non convertible en E.164 belge (+32…)", t));
  }

  if (contient(ctx.oppositions, empreintes)) {
    motifs.push(exclusion("opposition_client", "Inscrit à la liste d'opposition du client", t));
  }

  if (ctx.canaux.includes("telephone") && ctx.dncm !== null && contient(ctx.dncm.empreintes, empreintes.filter((e) => e.type === "telephone"))) {
    motifs.push(exclusion("liste_dncm", "Téléphone inscrit à la liste « Ne m'appelez plus »", t));
  }

  if (contient(ctx.clientsActuels, empreintes) && !venteCroisee(p)) {
    motifs.push(exclusion("client_actuel", "Déjà client : relève de la vente croisée, pas de la prospection", t));
  }

  if (ctx.modeCampagne === "reel" && estDonneeDemonstration(p, enClair)) {
    motifs.push(exclusion("donnee_demonstration_campagne_reelle", "Donnée de démonstration dans une campagne réelle", t));
  }

  return motifs;
}

/* ------------------------------------------------------------------ */
/* Matrice canal × cible                                               */
/* ------------------------------------------------------------------ */

export interface ContexteContact extends ContexteProspection {
  /**
   * Vrai si les offres visées sont analogues à celles que le client existant détient déjà chez le même
   * prestataire (règle de vente croisée, décidée en amont) ; absent = faux.
   */
  produitsAnalogues?: boolean;
}

export interface DecisionContact {
  permis: boolean;
  motif: string;
}

function refus(motif: string): DecisionContact {
  return { permis: false, motif };
}

/**
 * Applique la matrice canal × cible du §3.2 à un prospect, pour un canal et la base légale
 * enregistrée pour ce canal (null si aucune). Contrôles, dans l'ordre :
 * 1. une base légale est enregistrée, pour ce prospect et ce canal, avec sa preuve (source) ;
 * 2. elle est permise par `MATRICE_BASES_LEGALES` ;
 * 3. une coordonnée existe pour ce canal ;
 * 4. conditions propres à la base : consentement prouvé, non retiré et couvrant le canal (particulier) ;
 *    adresse impersonnelle d'une personne morale ; client existant et produits analogues ; intérêt
 *    légitime documenté (mise en balance) au téléphone, par prudence pour toute cible (le §3.2 l'exige
 *    pour les personnes nommées et les particuliers, que la forme seule ne distingue pas) ; source
 *    licite de l'adresse pour un courrier à un particulier ;
 * 5. aucune exclusion (§5.4) n'est constatée sur le prospect pour ce canal, la base examinée comptant
 *    comme enregistrée ;
 * 6. téléphone : liste « Ne m'appelez plus » consultée, et vérification de la base datant de moins de
 *    DNCM_VALIDITE_JOURS jours.
 */
export function contactPermis(p: Prospect, canal: CanalContact, base: BaseLegaleContact | null, ctx: ContexteContact): DecisionContact {
  if (base === null) return refus(`Aucune base légale enregistrée pour le canal ${canal}`);
  if (base.canal !== canal) return refus(`La base légale fournie vise le canal ${base.canal}, pas ${canal}`);
  if (base.prospectId !== p.id) return refus("La base légale fournie vise un autre prospect");
  if (base.cible !== p.cible || base.forme !== p.forme) return refus("La base légale n'a pas été vérifiée pour la cible et la forme de ce prospect");
  if (base.preuve.reference.trim().length < 3) return refus("Base légale sans référence de preuve (source de la donnée)");
  if (!basePermise(p.cible, canal, base.base)) return refus(`Base « ${base.base} » non permise pour la cible ${p.cible} et le canal ${canal} (matrice §3.2)`);

  const coordonnees = p.coordonnees.filter((c) => c.canal === canal);
  if (coordonnees.length === 0) return refus(`Aucune coordonnée pour le canal ${canal}`);

  const electronique = canal === "courriel" || canal === "sms";
  const clientExistant = venteCroisee(p) || contient(ctx.clientsActuels, empreintesDuProspect(p));

  switch (base.base) {
    case "consentement":
      if (base.preuve.type !== "consentement") return refus("Consentement invoqué sans référence de consentement");
      if (p.particulier !== null && !consentementValable(p, canal)) {
        return refus(`Particulier : aucun consentement prouvé, non retiré et couvrant le canal ${canal}`);
      }
      break;
    case "personne_morale_adresse_impersonnelle":
      if (p.cible === "particulier" || p.forme !== "personne_morale") return refus("Adresse impersonnelle sans consentement : personne morale seulement");
      if (base.natureAdresse !== "impersonnelle" || !coordonnees.every((c) => c.nature === "impersonnelle")) {
        return refus("Adresse nominative ou de nature inconnue : consentement préalable obligatoire");
      }
      break;
    case "client_existant_produits_analogues":
      if (!electronique) return refus("L'exception « client existant » ne vaut que pour le courriel et le SMS");
      if (!clientExistant) return refus("Pas client existant : consentement préalable obligatoire");
      if (ctx.produitsAnalogues !== true) return refus("Produits non analogues à ceux détenus : consentement préalable obligatoire");
      break;
    case "interet_legitime":
      if (electronique) return refus("Courriel et SMS : l'intérêt légitime ne suffit pas");
      if (canal === "telephone" && base.preuve.type !== "mise_en_balance") {
        return refus("Téléphone : intérêt légitime à documenter par une mise en balance");
      }
      if (canal === "courrier" && p.cible === "particulier" && base.preuve.type !== "source") {
        return refus("Courrier à un particulier : source licite de l'adresse exigée");
      }
      break;
  }

  // Exclusions (§5.4) constatées avec la base examinée tenue pour enregistrée sur ce canal.
  const avecBase: Prospect = { ...p, basesLegales: [...p.basesLegales.filter((b) => b.canal !== canal), base] };
  const motifs = exclusionsProspect(avecBase, { ...ctx, canaux: [canal] });
  if (motifs.length > 0) return refus(`Prospect exclu : ${motifs.map((m) => m.motif).join(", ")}`);

  if (canal === "telephone") {
    if (ctx.dncm === null) return refus("Liste « Ne m'appelez plus » non consultée");
    if (!verificationDncmFraiche(ctx.dncm.verifieeLe, ctx.maintenant)) {
      return refus(`Version de la liste « Ne m'appelez plus » périmée (${DNCM_VALIDITE_JOURS} jours au plus)`);
    }
    if (!verificationDncmFraiche(base.dncmVerifieLe, ctx.maintenant)) {
      return refus(`Vérification « Ne m'appelez plus » absente ou périmée (${DNCM_VALIDITE_JOURS} jours au plus)`);
    }
  }

  return { permis: true, motif: `Permis : base « ${base.base} » pour la cible ${p.cible} par ${canal}, opposition offerte à chaque message` };
}
