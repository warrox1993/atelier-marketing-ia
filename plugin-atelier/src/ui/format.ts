/**
 * Mise en forme et libellés de l'interface de l'atelier (fonctions pures, testées).
 *
 * Règles : dates stockées en UTC, affichées à l'heure de Bruxelles ; montants
 * en euros à partir de centimes ; aucun libellé anglais visible.
 */
import type { StatutFonctionnel } from "../contrats/statuts.js";
import type { EtatConnexion, RoleRevue } from "../contrats/communs.js";

export const FUSEAU = "Europe/Brussels" as const;
const LOCALE = "fr-BE";

export type Ton = "neutre" | "info" | "succes" | "attention" | "danger" | "demo";

const formatDateHeure = new Intl.DateTimeFormat(LOCALE, { timeZone: FUSEAU, dateStyle: "medium", timeStyle: "short" });
const formatDate = new Intl.DateTimeFormat(LOCALE, { timeZone: FUSEAU, dateStyle: "medium" });
const formatHeure = new Intl.DateTimeFormat(LOCALE, { timeZone: FUSEAU, timeStyle: "short" });
const formatDecalage = new Intl.DateTimeFormat(LOCALE, { timeZone: FUSEAU, timeZoneName: "shortOffset" });
const formatEuros = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR" });
const formatNombre = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const relatif = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

/**
 * Lit un horodatage ISO. Tolère aussi la forme texte de PostgreSQL
 * (« 2026-10-15 14:23:59.69+02 ») que certaines lectures renvoient encore
 * (docs/besoins-lot-c.md, B-8) : sans cela, la date serait affichée absente.
 */
export function enDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  let d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2})(:?\d{2})?$/u.exec(iso.trim());
    if (m) d = new Date(`${m[1]}T${m[2]}${(m[3] ?? "").slice(0, 4)}${m[4]}:${(m[5] ?? "00").replace(":", "")}`);
  }
  return Number.isNaN(d.getTime()) ? null : d;
}

/** « 20 oct. 2026, 10:00 » à l'heure de Bruxelles ; « non renseignée » si absente ou invalide. */
export function dateHeure(iso: string | null | undefined): string {
  const d = enDate(iso);
  return d ? formatDateHeure.format(d) : "non renseignée";
}

export function dateSeule(iso: string | null | undefined): string {
  const d = enDate(iso);
  return d ? formatDate.format(d) : "non renseignée";
}

export function heureSeule(d: Date): string {
  return formatHeure.format(d);
}

/** Décalage de Bruxelles à cette date précise (« UTC+2 » l'été, « UTC+1 » l'hiver). */
export function decalageBruxelles(iso: string | Date): string {
  const d = iso instanceof Date ? iso : enDate(iso);
  if (!d) return "";
  return formatDecalage.formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "";
}

/** ISO UTC vers la valeur d'un champ datetime-local à l'heure de Bruxelles (« 2026-10-20T10:00 »). */
export function isoVersBruxelles(iso: string | null | undefined): string {
  const d = enDate(iso);
  if (!d) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * Heure de Bruxelles saisie (« 2026-10-20T10:00 ») vers ISO UTC, changement d'heure
 * compris. Null si la saisie est invalide.
 */
export function bruxellesVersIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(local);
  if (!m) return null;
  const naif = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  let instant = naif;
  for (let i = 0; i < 2; i += 1) {
    const decalage = /UTC([+-]\d+)(?::(\d+))?/u.exec(decalageBruxelles(new Date(instant)));
    const minutes = decalage ? Number(decalage[1]) * 60 + Math.sign(Number(decalage[1])) * Number(decalage[2] ?? 0) : 0;
    instant = naif - minutes * 60_000;
  }
  const iso = new Date(instant).toISOString();
  return isoVersBruxelles(iso) === local ? iso : null;
}

/** Montant en euros à partir de centimes entiers ; null = « non renseigné ». */
export function euros(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "non renseigné";
  return formatEuros.format(cents / 100);
}

/** Convertit « 1 500,50 » ou « 1500.5 » (euros) en centimes ; null si vide ; NaN si invalide. */
export function centimesDepuisSaisie(saisie: string): number | null {
  const s = saisie.replace(/[\s  €]/gu, "").replace(",", ".");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/u.test(s)) return Number.NaN;
  return Math.round(Number(s) * 100);
}

export function nombre(n: number): string {
  return formatNombre.format(n);
}

/** « il y a 3 minutes », « à l'instant »… par rapport à `maintenant`. */
export function ilYA(depuis: Date, maintenant: Date = new Date()): string {
  const secondes = Math.round((depuis.getTime() - maintenant.getTime()) / 1000);
  const abs = Math.abs(secondes);
  if (abs < 45) return "à l'instant";
  if (abs < 3600) return relatif.format(Math.round(secondes / 60), "minute");
  if (abs < 86400) return relatif.format(Math.round(secondes / 3600), "hour");
  return relatif.format(Math.round(secondes / 86400), "day");
}

/** Raccourci lisible d'un identifiant natif (8 premiers caractères). */
export function idCourt(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "inconnu";
}

/* ------------------------------------------------------------------ */
/* États de connexion (cahier §3 : six états toujours distingués)       */
/* ------------------------------------------------------------------ */

export const ETATS_CONNEXION: Record<EtatConnexion, { libelle: string; aide: string; ton: Ton }> = {
  demonstration: { libelle: "Démonstration", aide: "Fixtures déterministes : aucune IA réelle, aucun appel externe.", ton: "demo" },
  reel_teste: { libelle: "Réel testé", aide: "Fonctionnement réel vérifié par un appel effectif.", ton: "succes" },
  configure_non_verifie: { libelle: "Configuré, non vérifié", aide: "Une configuration existe, mais aucun appel réel ne l'a encore prouvée.", ton: "attention" },
  non_connecte: { libelle: "Non connecté", aide: "Aucune connexion configurée.", ton: "neutre" },
  indisponible: { libelle: "Indisponible", aide: "Le service ne répond pas ou n'est pas disponible dans cette version.", ton: "attention" },
  erreur: { libelle: "Erreur", aide: "Le dernier essai a échoué.", ton: "danger" },
};

/* ------------------------------------------------------------------ */
/* Statuts fonctionnels (calculés par le serveur depuis l'état natif)  */
/* ------------------------------------------------------------------ */

export const TON_STATUT: Record<StatutFonctionnel, Ton> = {
  queued: "neutre",
  ready: "neutre",
  running: "info",
  awaiting_review: "info",
  changes_requested: "attention",
  blocked_information: "attention",
  blocked_dependency: "attention",
  blocked_budget: "danger",
  ready_for_human: "succes",
  approved: "succes",
  completed: "neutre",
  failed: "danger",
  cancelled: "neutre",
};

/**
 * Copie des libellés de `contrats/statuts.ts` : l'importer à l'exécution
 * embarquerait Zod dans l'interface (700 Kio). L'égalité stricte avec la
 * source est vérifiée par `tests/ui/format.spec.ts`.
 */
export const LIBELLES_STATUT_UI: Record<StatutFonctionnel, string> = {
  queued: "En file",
  ready: "Prête",
  running: "En cours d'exécution",
  awaiting_review: "En revue",
  changes_requested: "Corrections demandées",
  blocked_information: "Décision humaine requise",
  blocked_dependency: "Bloquée par une dépendance",
  blocked_budget: "Bloquée par le budget",
  ready_for_human: "Prête pour validation humaine",
  approved: "Approuvée par l'humain",
  completed: "Terminée",
  failed: "Échec",
  cancelled: "Annulée",
};

export function libelleStatut(statut: StatutFonctionnel): string {
  return LIBELLES_STATUT_UI[statut] ?? statut;
}

/* ------------------------------------------------------------------ */
/* Revues, couverture, porte                                            */
/* ------------------------------------------------------------------ */

export const ROLES_REVUE: Record<RoleRevue, string> = {
  exigences: "Contrôleur des exigences",
  metier: "Relecteur métier et factuel",
  technique: "Vérificateur technique",
};

export const VERDICTS: Record<string, { libelle: string; ton: Ton }> = {
  PASS: { libelle: "Réussi", ton: "succes" },
  CHANGES_REQUESTED: { libelle: "Corrections demandées", ton: "attention" },
  BLOCKED_INFORMATION: { libelle: "Information manquante", ton: "attention" },
  NOT_APPLICABLE_JUSTIFIED: { libelle: "Sans objet (justifié)", ton: "neutre" },
  absent: { libelle: "Non relu", ton: "neutre" },
};

export const COUVERTURES: Record<string, { libelle: string; ton: Ton }> = {
  non_traite: { libelle: "Non traitée", ton: "danger" },
  partiel: { libelle: "Partielle", ton: "attention" },
  couvert: { libelle: "Couverte", ton: "succes" },
  bloque: { libelle: "Bloquée", ton: "attention" },
  na_justifie: { libelle: "Sans objet (justifié)", ton: "neutre" },
};

export const DECISIONS_PORTE: Record<string, { libelle: string; ton: Ton }> = {
  PASS: { libelle: "Porte franchie", ton: "succes" },
  REFUS: { libelle: "Porte refusée", ton: "danger" },
  BLOQUE_INFORMATION: { libelle: "Bloquée : information manquante", ton: "attention" },
};

export const GRAVITES: Record<string, { libelle: string; ton: Ton }> = {
  critique: { libelle: "Critique", ton: "danger" },
  majeure: { libelle: "Majeure", ton: "danger" },
  mineure: { libelle: "Mineure", ton: "attention" },
  info: { libelle: "Information", ton: "neutre" },
};

export const CATEGORIES_CONSTAT: Record<string, string> = {
  exigence_manquante: "Exigence manquante",
  preuve_absente: "Preuve absente",
  affirmation_non_sourcee: "Affirmation non sourcée",
  offre_non_confirmee: "Offre non confirmée",
  promesse_excessive: "Promesse excessive",
  lien_defectueux: "Lien défectueux",
  page_erreur: "Page d'erreur",
  incoherence_canaux: "Incohérence entre canaux",
  marque: "Marque",
  technique: "Technique",
  juridique_a_verifier: "Point juridique à vérifier",
  autre: "Autre",
};

export const RESOLUTIONS: Record<string, string> = {
  ouvert: "Ouvert",
  resolu: "Résolu",
  rejete: "Rejeté",
  accepte_par_humain: "Accepté par l'humain",
};

/* ------------------------------------------------------------------ */
/* Décisions humaines, diffusions, calendrier                          */
/* ------------------------------------------------------------------ */

export const ACTIONS_HUMAINES: Record<string, string> = {
  approuver: "Approuver",
  demander_correction: "Demander une correction",
  rejeter: "Rejeter",
};

export const ACTIONS_EXTERNES: Record<string, string> = {
  aucune_action_externe: "Aucune action externe",
  publier: "Publier",
  envoyer: "Envoyer",
  programmer: "Programmer",
  activer_campagne_payante: "Activer une campagne payante",
};

export const ETATS_DIFFUSION: Record<string, { libelle: string; ton: Ton }> = {
  refusee: { libelle: "Refusée par le serveur", ton: "danger" },
  simulee: { libelle: "Simulée (démonstration)", ton: "demo" },
  preparee: { libelle: "Préparée, non diffusée", ton: "info" },
  confirmee: { libelle: "Diffusée (confirmée)", ton: "succes" },
  ambigue_a_reconcilier: { libelle: "Ambiguë : à réconcilier", ton: "attention" },
};

export const ETATS_CALENDRIER: Record<string, { libelle: string; ton: Ton }> = {
  brouillon: { libelle: "Brouillon", ton: "neutre" },
  en_revue: { libelle: "En revue", ton: "info" },
  approuve: { libelle: "Approuvé", ton: "succes" },
  planifie: { libelle: "Planifié", ton: "info" },
  publie: { libelle: "Publié", ton: "succes" },
};

export const ORDRE_CALENDRIER = ["brouillon", "en_revue", "approuve", "planifie", "publie"] as const;

export const NIVEAUX_INTEGRATION: Record<string, string> = {
  implemente_teste: "Implémenté et testé",
  implemente_non_teste: "Implémenté, non testé",
  contrat_seulement: "Contrat seulement",
  non_implemente: "Non implémenté",
};

export const TYPES_MESSAGE: Record<string, string> = {
  demande_information: "Demande d'information",
  reponse: "Réponse",
  contrat_propose: "Contrat proposé",
  contrat_accepte: "Contrat accepté",
  dependance_modifiee: "Dépendance modifiée",
  constat_revue: "Constat de revue",
  correction_demandee: "Correction demandée",
  blocage: "Blocage",
  decision: "Décision",
  resultat: "Résultat",
};

export const ETATS_MESSAGE: Record<string, string> = {
  recu: "Reçu",
  lu: "Lu",
  traite: "Traité",
  rejete: "Rejeté",
};

export const ETAPES_CHRONOLOGIE: Record<string, string> = {
  tache_lancee: "Tâche lancée",
  outil_appele: "Outil appelé",
  message_envoye: "Message envoyé",
  livrable_cree: "Livrable créé",
  controle_echoue: "Contrôle échoué",
  controle_reussi: "Contrôle réussi",
  correction: "Correction",
  validation: "Validation",
  decision_humaine: "Décision humaine",
  refus_serveur: "Refus du serveur",
  autre: "Autre événement",
};

/** Libellés des événements du journal : source unique dans le contrat (sans Zod). */
export { libelleEvenement } from "../contrats/ui-constantes.js";

const STATUTS_RUN: Record<string, string> = {
  queued: "en file",
  running: "en cours",
  succeeded: "réussi",
  failed: "échoué",
  cancelled: "annulé",
  timed_out: "délai dépassé",
};

/** « Run succeeded (agent x) » renvoyé par le serveur devient « Run réussi (agent x) ». */
export function libelleRun(libelle: string): string {
  return libelle.replace(/^Run ([a-z_]+)/u, (tout, statut: string) => (STATUTS_RUN[statut] ? `Run ${STATUTS_RUN[statut]}` : tout));
}

export const SOURCES_CHRONOLOGIE: Record<string, string> = {
  run_natif: "run Paperclip",
  activite_native: "activité Paperclip",
  journal_atelier: "journal de l'atelier",
};

export const STATUTS_ACCES_SOURCE: Record<string, { libelle: string; ton: Ton }> = {
  accessible: { libelle: "Accessible", ton: "succes" },
  page_erreur: { libelle: "Page d'erreur détectée", ton: "danger" },
  inaccessible: { libelle: "Inaccessible", ton: "danger" },
  bloquee_ssrf: { libelle: "Bloquée (adresse interdite)", ton: "danger" },
  type_refuse: { libelle: "Type refusé", ton: "attention" },
  trop_volumineuse: { libelle: "Trop volumineuse", ton: "attention" },
  delai_depasse: { libelle: "Délai dépassé", ton: "attention" },
  erreur: { libelle: "Erreur", ton: "danger" },
};

/* ------------------------------------------------------------------ */
/* Messages typés : résumé lisible sans interpréter le contenu         */
/* ------------------------------------------------------------------ */

export function resumeMessage(contenu: { type: string } & Record<string, unknown>): string {
  const t = (cle: string) => (typeof contenu[cle] === "string" ? (contenu[cle] as string) : "");
  switch (contenu.type) {
    case "demande_information":
      return t("question");
    case "reponse":
    case "correction_demandee":
      return t("texte");
    case "contrat_propose": {
      const sorties = Array.isArray(contenu.sorties) ? (contenu.sorties as string[]) : [];
      return sorties.length ? `Sorties attendues : ${sorties.join(", ")}` : "Contrat proposé";
    }
    case "contrat_accepte":
      return t("remarques") || "Contrat accepté";
    case "dependance_modifiee":
      return t("changement");
    case "constat_revue":
    case "resultat":
      return t("resume");
    case "blocage":
      return `${t("raison")} Information manquante : ${t("informationManquante")}`.trim();
    case "decision":
      return `${t("sujet")} : ${t("decision")}`;
    default:
      return "";
  }
}

/* ------------------------------------------------------------------ */
/* Erreurs du pont : catégorie exploitable, jamais de secret            */
/* ------------------------------------------------------------------ */

export type CategorieErreur = "acces" | "indisponible" | "interrompu" | "introuvable" | "invalide" | "erreur";

export interface ErreurClassee {
  categorie: CategorieErreur;
  titre: string;
  message: string;
  /** Code technique affiché en petit pour le diagnostic. */
  code: string;
}

/**
 * Classe une erreur du pont Paperclip. L'hôte ne transmet que le message de
 * l'erreur du worker (code « WORKER_ERROR ») : la catégorie fine est déduite des
 * messages stables de l'atelier (voir docs/besoins-lot-c.md, besoin B-1).
 */
const CATEGORIES_CODES: Record<string, CategorieErreur> = {
  acces_refuse: "acces",
  elevation_refusee: "acces",
  role_non_autorise: "acces",
  producteur_ne_peut_pas_relire: "acces",
  hors_entreprise: "acces",
  hors_projet: "acces",
  diffusion_refusee: "acces",
  non_implemente: "indisponible",
  introuvable: "introuvable",
  entree_invalide: "invalide",
  url_refusee: "invalide",
  import_refuse: "invalide",
};

const TITRES: Record<CategorieErreur, string> = {
  acces: "Accès refusé",
  indisponible: "Fonction indisponible",
  interrompu: "Exécution interrompue",
  introuvable: "Élément introuvable",
  invalide: "Entrée refusée",
  erreur: "Erreur",
};

export function classerErreur(err: unknown): ErreurClassee {
  const brut = (err ?? {}) as { code?: unknown; message?: unknown };
  let code = typeof brut.code === "string" ? brut.code : "UNKNOWN";
  let message = typeof brut.message === "string" && brut.message.trim() ? brut.message.trim() : "Erreur sans message.";
  // Le worker place son code stable en tête : « [code] message » (contrat, besoin B-1).
  const prefixe = /^\[([a-z_]+)\]\s*/u.exec(message);
  if (prefixe?.[1]) {
    code = prefixe[1];
    message = message.slice(prefixe[0].length) || "Erreur sans message.";
    const categorie = CATEGORIES_CODES[code] ?? "erreur";
    return { categorie, titre: TITRES[categorie], message, code };
  }
  const bas = message.toLowerCase();

  if (code === "CAPABILITY_DENIED" || code === "INVOCATION_SCOPE_DENIED" || /non autoris|réservée à un humain|accès refusé|forbidden/u.test(bas)) {
    return { categorie: "acces", titre: "Accès refusé", message, code };
  }
  if (code === "TIMEOUT") {
    return { categorie: "interrompu", titre: "Exécution interrompue", message: "Le worker de l'atelier n'a pas répondu à temps. Rien n'a été perdu : réessayez.", code };
  }
  if (code === "WORKER_UNAVAILABLE") {
    return { categorie: "indisponible", titre: "Atelier indisponible", message: "Le worker de l'atelier n'est pas prêt (redémarrage ou plugin arrêté). Réessayez dans un instant.", code };
  }
  if (/non implément|non disponible/u.test(bas)) {
    return { categorie: "indisponible", titre: "Fonction indisponible", message, code };
  }
  if (/introuvable/u.test(bas)) {
    return { categorie: "introuvable", titre: "Élément introuvable", message, code };
  }
  if (/invalide/u.test(bas)) {
    return { categorie: "invalide", titre: "Entrée refusée", message, code };
  }
  return { categorie: "erreur", titre: "Erreur", message, code };
}
