/**
 * Moteur de missions (#49) : états, événements et transitions, purs (aucune entrée-sortie).
 * Source : `docs/moteur-missions.md`, section « États et transitions ».
 */
export type EtatMission =
  | "prete" | "en_cours" | "en_revue" | "attente_autorisation" | "en_execution" | "resultat_confirme"
  | "attente_information" | "blocage" | "pause" | "cloturee" | "annulee" | "echec";

export type EvenementMission =
  | "demarrage" | "entree_manquante" | "contrat_invalide"
  | "sortie_valide_etape" | "sortie_valide_sous_porte" | "sortie_valide_finale" | "sortie_hors_contrat"
  | "plafond_atteint" | "arbitrage_demande" | "echec_declare"
  | "changements_demandes" | "porte_franchie"
  | "approuvee_avec_effet" | "approuvee_sans_effet"
  | "effet_confirme" | "effet_refuse" | "effet_ambigu"
  | "cloture" | "information_recue"
  | "arbitrage_repris" | "arbitrage_effet_confirme" | "arbitrage_abandon"
  | "pause_demandee" | "annulation"
  | "reprise_travail" | "reprise_revue" | "reprise_autorisation" | "reprise_information" | "reprise_blocage";

export type StatutPaperclip = "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "done" | "cancelled";

/** Statut Paperclip qui projette chaque état du moteur. */
export const STATUT_PROJETE: Readonly<Record<EtatMission, StatutPaperclip>> = {
  prete: "todo", en_cours: "in_progress", en_revue: "in_review", attente_autorisation: "in_review", en_execution: "in_progress",
  resultat_confirme: "in_progress", attente_information: "blocked", blocage: "blocked", pause: "backlog",
  cloturee: "done", annulee: "cancelled", echec: "cancelled",
};

type Suites = Partial<Record<EvenementMission, EtatMission>>;

/** Pause et annulation, permises dans les états de travail (lignes marquées * du tableau). */
const PAUSE_ANNULATION: Suites = { pause_demandee: "pause", annulation: "annulee" };

const TRANSITIONS: Readonly<Partial<Record<EtatMission, Suites>>> = {
  prete: { demarrage: "en_cours", entree_manquante: "attente_information", contrat_invalide: "blocage", ...PAUSE_ANNULATION },
  en_cours: {
    sortie_valide_etape: "prete", sortie_valide_sous_porte: "en_revue", sortie_valide_finale: "resultat_confirme", sortie_hors_contrat: "en_cours",
    entree_manquante: "attente_information", contrat_invalide: "blocage", plafond_atteint: "blocage", arbitrage_demande: "blocage", echec_declare: "echec",
    ...PAUSE_ANNULATION,
  },
  en_revue: { changements_demandes: "en_cours", entree_manquante: "attente_information", porte_franchie: "attente_autorisation", plafond_atteint: "blocage", ...PAUSE_ANNULATION },
  attente_autorisation: { approuvee_avec_effet: "en_execution", approuvee_sans_effet: "resultat_confirme", changements_demandes: "en_cours", ...PAUSE_ANNULATION },
  en_execution: { effet_confirme: "resultat_confirme", effet_refuse: "echec", effet_ambigu: "blocage" },
  resultat_confirme: { cloture: "cloturee" },
  attente_information: { information_recue: "prete", ...PAUSE_ANNULATION },
  blocage: { arbitrage_repris: "prete", arbitrage_effet_confirme: "resultat_confirme", arbitrage_abandon: "echec", ...PAUSE_ANNULATION },
  pause: {
    reprise_travail: "prete", reprise_revue: "en_revue", reprise_autorisation: "attente_autorisation", reprise_information: "attente_information",
    reprise_blocage: "blocage", annulation: "annulee",
  },
};

export class TransitionInvalide extends Error {
  constructor(readonly etat: EtatMission, readonly evenement: EvenementMission) {
    super(`Transition invalide : l'événement « ${evenement} » n'est pas permis depuis l'état « ${etat} ».`);
    this.name = "TransitionInvalide";
  }
}

/** État suivant ; lève `TransitionInvalide` hors tableau (états terminaux compris). */
export function transitionner(etat: EtatMission, evenement: EvenementMission): EtatMission {
  const suivant = TRANSITIONS[etat]?.[evenement];
  if (suivant === undefined) throw new TransitionInvalide(etat, evenement);
  return suivant;
}
