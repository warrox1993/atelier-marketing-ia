/**
 * Moteur de missions (#49, tâche 2) : transitions pures. La table ci-dessous est écrite à part de celle du code,
 * d'après `docs/moteur-missions.md` (section « États et transitions »), lignes marquées * développées.
 */
import { describe, expect, it } from "vitest";
import { STATUT_PROJETE, TransitionInvalide, transitionner, type EtatMission, type EvenementMission } from "../src/moteur/transitions.js";

const PAUSE_ANNULATION: Array<[EvenementMission, EtatMission]> = [["pause_demandee", "pause"], ["annulation", "annulee"]];

const TABLE: Array<[EtatMission, EvenementMission, EtatMission]> = [
  ["prete", "demarrage", "en_cours"], ["prete", "entree_manquante", "attente_information"], ["prete", "contrat_invalide", "blocage"],
  ["en_cours", "sortie_valide_etape", "prete"], ["en_cours", "sortie_valide_sous_porte", "en_revue"], ["en_cours", "sortie_valide_finale", "resultat_confirme"],
  ["en_cours", "sortie_hors_contrat", "en_cours"], ["en_cours", "entree_manquante", "attente_information"], ["en_cours", "contrat_invalide", "blocage"],
  ["en_cours", "plafond_atteint", "blocage"], ["en_cours", "arbitrage_demande", "blocage"], ["en_cours", "echec_declare", "echec"],
  ["en_revue", "changements_demandes", "en_cours"], ["en_revue", "entree_manquante", "attente_information"], ["en_revue", "porte_franchie", "attente_autorisation"], ["en_revue", "plafond_atteint", "blocage"],
  ["attente_autorisation", "approuvee_avec_effet", "en_execution"], ["attente_autorisation", "approuvee_sans_effet", "resultat_confirme"], ["attente_autorisation", "changements_demandes", "en_cours"],
  ["en_execution", "effet_confirme", "resultat_confirme"], ["en_execution", "effet_refuse", "echec"], ["en_execution", "effet_ambigu", "blocage"],
  ["resultat_confirme", "cloture", "cloturee"],
  ["attente_information", "information_recue", "prete"],
  ["blocage", "arbitrage_repris", "prete"], ["blocage", "arbitrage_effet_confirme", "resultat_confirme"], ["blocage", "arbitrage_abandon", "echec"],
  ["pause", "reprise_travail", "prete"], ["pause", "reprise_revue", "en_revue"], ["pause", "reprise_autorisation", "attente_autorisation"],
  ["pause", "reprise_information", "attente_information"], ["pause", "reprise_blocage", "blocage"], ["pause", "annulation", "annulee"],
];
// Lignes marquées * : prete, en_cours, en_revue, attente_autorisation, attente_information, blocage.
for (const etat of ["prete", "en_cours", "en_revue", "attente_autorisation", "attente_information", "blocage"] as const) {
  for (const [ev, suivant] of PAUSE_ANNULATION) TABLE.push([etat, ev, suivant]);
}

const ETATS: EtatMission[] = [
  "prete", "en_cours", "en_revue", "attente_autorisation", "en_execution", "resultat_confirme", "attente_information", "blocage", "pause", "cloturee", "annulee", "echec",
];
const TERMINAUX: EtatMission[] = ["cloturee", "annulee", "echec"];
const EVENEMENTS = [...new Set(TABLE.map(([, e]) => e))];

describe("moteur de missions : transitions", () => {
  it("la table de référence compte 33 paires du tableau plus 12 développées", () => {
    expect(TABLE).toHaveLength(33 + 12);
  });

  it.each(TABLE)("%s + %s -> %s", (etat, evenement, attendu) => {
    expect(transitionner(etat, evenement)).toBe(attendu);
  });

  it("toute paire absente de la table lève TransitionInvalide", () => {
    const valides = new Set(TABLE.map(([a, e]) => `${a}|${e}`));
    let refusees = 0;
    for (const etat of ETATS) {
      for (const ev of EVENEMENTS) {
        if (valides.has(`${etat}|${ev}`)) continue;
        expect(() => transitionner(etat, ev), `${etat} + ${ev}`).toThrow(TransitionInvalide);
        refusees++;
      }
    }
    expect(refusees).toBe(ETATS.length * EVENEMENTS.length - TABLE.length);
  });

  it("aucun événement n'est accepté depuis un état terminal", () => {
    for (const etat of TERMINAUX) for (const ev of EVENEMENTS) expect(() => transitionner(etat, ev)).toThrow(TransitionInvalide);
  });

  it("l'erreur nomme l'état et l'événement", () => {
    expect(() => transitionner("cloturee", "demarrage")).toThrow(/demarrage.*cloturee/u);
  });

  it("statut Paperclip projeté de chaque état", () => {
    expect(STATUT_PROJETE).toEqual({
      prete: "todo", en_cours: "in_progress", en_revue: "in_review", attente_autorisation: "in_review", en_execution: "in_progress",
      resultat_confirme: "in_progress", attente_information: "blocked", blocage: "blocked", pause: "backlog",
      cloturee: "done", annulee: "cancelled", echec: "cancelled",
    });
  });
});
