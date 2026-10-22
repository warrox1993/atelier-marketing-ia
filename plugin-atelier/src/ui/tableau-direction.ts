/**
 * Calculs du tableau de direction du bureau Marketing (logique pure : ni interface, ni réseau, ni horloge).
 *
 * Entrées : le rapport mensuel (`rapport.mensuel`) et les données du tableau (`tableau.direction`) d'un mois, et
 * les mêmes pour le mois précédent. Sortie : les indicateurs, chacun avec sa valeur, sa source, son état et sa
 * variation. Règle de la maison : une source absente ou illisible donne « non mesuré » (valeur `null`), jamais 0 ;
 * un service qui doit encore être branché (vues, soumissions, envois) donne « connexion à faire ».
 */
import type { DonneesDirection, RapportMensuel } from "../contrats/index.js";
import { classerTache, PHASES, type AgentMission, type IdPhase } from "./avancement-missions.js";

/** `euros` : la valeur est en CENTIMES (comme le socle), à convertir à l'affichage. */
export type Unite = "nombre" | "euros" | "heures" | "pourcent";
/** `mesure` : la source a répondu ; `non_mesure` : source absente, illisible ou sans donnée ; `connexion_a_faire` : service à brancher. */
export type EtatIndicateur = "mesure" | "non_mesure" | "connexion_a_faire";

export interface Variation {
  precedent: number;
  ecart: number;
  /** Écart relatif en %, `null` quand le mois précédent vaut 0. */
  pourcent: number | null;
  sens: "hausse" | "baisse" | "stable";
}

export interface Indicateur {
  cle: string;
  libelle: string;
  valeur: number | null;
  unite: Unite;
  etat: EtatIndicateur;
  /** Table, route ou service d'où vient le chiffre. */
  source: string;
  note: string | null;
  variation: Variation | null;
}

/** Les deux sources d'un mois ; `null` : lecture impossible (« non mesuré »). */
export interface EntreesMois {
  rapport: RapportMensuel | null;
  direction: DonneesDirection | null;
}

export interface EtapeEntonnoir extends Indicateur {
  /** Part de l'étape précédente mesurée qui passe à celle-ci, en %, `null` si l'une des deux manque ou vaut 0. */
  passage: number | null;
}

export interface LigneAgent {
  agent: string;
  coutCentimes: number;
  jetons: number;
}

export interface PhaseDelai {
  id: IdPhase;
  libelle: string;
  /** Délai moyen en heures (première sous-tâche créée, dernière terminée), `null` sans phase terminée. */
  heures: number | null;
  /** Nombre de missions dont la phase est terminée. */
  effectif: number;
}

export interface SourceManquante {
  cle: string;
  libelle: string;
  /** Pourquoi la valeur manque. */
  raison: string;
  /** Ce qu'il faut connecter ou importer pour la mesurer. */
  aConnecter: string;
}

export interface TableauDirection {
  mois: string;
  moisPrecedent: string;
  entonnoir: EtapeEntonnoir[];
  couts: {
    total: Indicateur;
    jetons: Indicateur;
    parProspectQualifie: Indicateur;
    parAgent: LigneAgent[];
    parMission: Array<{ libelle: string; coutCentimes: number; jetons: number }>;
    sansMissionCentimes: number | null;
  };
  missions: { enCours: Indicateur; terminees: Indicateur; dureeMoyenne: Indicateur; phases: PhaseDelai[]; phasesMesurees: boolean; tronque: boolean };
  decisions: { enAttente: Indicateur; delaiMoyen: Indicateur; delaiMedian: Indicateur };
  contenus: Indicateur[];
  captation: Indicateur[];
  sources: SourceManquante[];
}

/* ------------------------------------------------------------------ */
/* Briques                                                              */
/* ------------------------------------------------------------------ */

/** « 2026-10 » → « 2026-09 ». */
export function moisPrecedent(mois: string): string {
  const [a, m] = mois.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function variation(valeur: number | null, precedent: number | null): Variation | null {
  if (valeur === null || precedent === null) return null;
  const ecart = valeur - precedent;
  return { precedent, ecart, pourcent: precedent === 0 ? null : (ecart / Math.abs(precedent)) * 100, sens: ecart === 0 ? "stable" : ecart > 0 ? "hausse" : "baisse" };
}

/** Pourcentage de `a` sur `b`, `null` si l'un manque ou si `b` vaut 0. */
export function part(a: number | null, b: number | null): number | null {
  return a === null || b === null || b === 0 ? null : (a / b) * 100;
}

export function moyenne(valeurs: readonly number[]): number | null {
  return valeurs.length === 0 ? null : valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
}

export function mediane(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null;
  const t = [...valeurs].sort((x, y) => x - y);
  const m = Math.floor(t.length / 2);
  return t.length % 2 === 1 ? t[m]! : (t[m - 1]! + t[m]!) / 2;
}

/** Durée lisible : « 40 min », « 5,5 h », « 3,2 j ». `null` : « non mesuré » (à la charge de l'appelant). */
export function libelleDuree(heures: number): string {
  const fr = (n: number) => new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 1 }).format(n);
  if (heures < 1) return `${Math.max(1, Math.round(heures * 60))} min`;
  if (heures < 48) return `${fr(heures)} h`;
  return `${fr(heures / 24)} j`;
}

const chiffreDe = (liste: ReadonlyArray<{ cle: string; valeur: number | null }> | undefined, cle: string): number | null => liste?.find((c) => c.cle === cle)?.valeur ?? null;

function indicateur(cle: string, libelle: string, unite: Unite, valeur: number | null, source: string, o: { note?: string | null; absent?: EtatIndicateur } = {}): Indicateur {
  return { cle, libelle, valeur, unite, etat: valeur === null ? (o.absent ?? "non_mesure") : "mesure", source, note: o.note ?? null, variation: null };
}

/** Rattache la variation à l'indicateur du même nom dans le mois précédent. */
function comparer<T extends Indicateur>(courant: T, precedent: Indicateur | undefined): T {
  return { ...courant, variation: variation(courant.valeur, precedent?.valeur ?? null) };
}

/* ------------------------------------------------------------------ */
/* Un mois, sans comparaison                                            */
/* ------------------------------------------------------------------ */

interface MoisCalcule {
  entonnoir: EtapeEntonnoir[];
  couts: TableauDirection["couts"];
  missions: TableauDirection["missions"];
  decisions: TableauDirection["decisions"];
  contenus: Indicateur[];
  captation: Indicateur[];
}

const MESURES_ABSENTES = "Aucune mesure importée ce mois : source non connectée ou rien à compter.";
const SOURCE_MESURES = "mesures importées";

function entonnoir(e: EntreesMois): EtapeEntonnoir[] {
  const r = e.rapport;
  const d = e.direction;
  const illisibleR = r === null ? "Rapport du mois illisible." : null;
  const trouves = r ? chiffreDe(r.prospects.chiffres, "prospects_trouves_reel") : null;
  const fiables = r ? chiffreDe(r.prospects.badges, "prospects_qualifies") : null;
  const mes = d?.etapes ?? null;
  const etapeMesuree = (v: number | null | undefined) => (mes ? (v ?? null) : null);
  const etapes: Indicateur[] = [
    indicateur("trouves", "Prospects trouvés", "nombre", trouves, "prospects", { note: illisibleR ?? (r?.prospects.tronque ? "Parcours plafonné : nombre minimum." : null) }),
    indicateur("avec_numero", "Avec un numéro de téléphone", "nombre", d?.prospects?.avecNumero ?? null, "prospects", { note: d?.prospects ? null : "Source illisible." }),
    indicateur("fiables", "Fiables (qualifiés)", "nombre", fiables, "prospects, qualification automatique", { note: illisibleR }),
    indicateur("contactes", "Contactés", "nombre", etapeMesuree(mes?.contactes), SOURCE_MESURES, { note: MESURES_ABSENTES, absent: "connexion_a_faire" }),
    indicateur("rendez_vous", "Rendez-vous obtenus", "nombre", etapeMesuree(mes?.rendezVous), SOURCE_MESURES, { note: MESURES_ABSENTES, absent: "connexion_a_faire" }),
    indicateur("clients_gagnes", "Clients gagnés", "nombre", etapeMesuree(mes?.clientsGagnes), SOURCE_MESURES, { note: MESURES_ABSENTES, absent: "connexion_a_faire" }),
  ];
  let precedent: number | null = null;
  return etapes.map((x) => {
    const passage = part(x.valeur, precedent);
    if (x.valeur !== null) precedent = x.valeur;
    return { ...x, passage };
  });
}

function couts(e: EntreesMois, qualifies: number | null): TableauDirection["couts"] {
  const c = e.rapport?.coutsIa ?? null;
  const total = c && c.lignes.length > 0 ? c.total : null;
  const jetonsTotal = total ? total.jetonsEntree + total.jetonsSortie : null;
  const abonnement = total !== null && total.coutCentimes === 0 && (jetonsTotal ?? 0) > 0;
  const absent = e.rapport === null ? "Rapport du mois illisible." : "Aucun coût déclaré ce mois.";
  const parAgentMap = new Map<string, LigneAgent>();
  for (const l of c?.lignes ?? []) {
    const a = parAgentMap.get(l.agent) ?? { agent: l.agent, coutCentimes: 0, jetons: 0 };
    a.coutCentimes += l.coutCentimes;
    a.jetons += l.jetonsEntree + l.jetonsSortie;
    parAgentMap.set(l.agent, a);
  }
  const parAgent = [...parAgentMap.values()].sort((x, y) => y.coutCentimes - x.coutCentimes || y.jetons - x.jetons || x.agent.localeCompare(y.agent, "fr"));
  let parQualifie: Indicateur;
  if (total === null) parQualifie = indicateur("cout_par_qualifie", "Coût par prospect qualifié", "euros", null, "relevé des exécutions et prospects", { note: absent });
  else if (qualifies === null) parQualifie = indicateur("cout_par_qualifie", "Coût par prospect qualifié", "euros", null, "relevé des exécutions et prospects", { note: "Nombre de prospects qualifiés non mesuré." });
  else if (qualifies === 0) parQualifie = indicateur("cout_par_qualifie", "Coût par prospect qualifié", "euros", null, "relevé des exécutions et prospects", { note: "Aucun prospect qualifié ce mois : pas de coût par qualifié." });
  else if (abonnement) {
    parQualifie = indicateur("cout_par_qualifie", "Coût par prospect qualifié", "euros", null, "relevé des exécutions et prospects", { note: "Agents sous abonnement : pas de coût en euros, seuls les jetons comptent." });
  } else parQualifie = indicateur("cout_par_qualifie", "Coût par prospect qualifié", "euros", total.coutCentimes / qualifies, "relevé des exécutions et prospects");
  const m = e.direction?.coutParMission ?? null;
  return {
    total: indicateur("cout_total", "Coût IA du mois", "euros", total ? total.coutCentimes : null, "relevé des exécutions", { note: total === null ? absent : abonnement ? "Agents sous abonnement : coût en euros nul, seuls les jetons comptent." : null }),
    jetons: indicateur("jetons", "Jetons consommés", "nombre", jetonsTotal, "relevé des exécutions", { note: total === null ? absent : null }),
    parProspectQualifie: parQualifie,
    parAgent,
    parMission: (m?.lignes ?? []).map((l) => ({ libelle: titreCourt(l.identifiant ? `${l.identifiant} ${l.titre}` : l.titre), coutCentimes: l.coutCentimes, jetons: l.jetons })),
    sansMissionCentimes: m ? m.coutSansMissionCentimes : null,
  };
}

/** Titre d'une tâche ramené à 72 caractères au plus (les titres de missions sont des phrases entières). */
export function titreCourt(titre: string, max = 72): string {
  const t = titre.replace(/\s+/gu, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}\u2026`;
}

const heures = (de: string, a: string) => (Date.parse(a) - Date.parse(de)) / 3_600_000;

/** Délai moyen par phase : de la première sous-tâche créée à la dernière terminée, pour les missions dont la phase est faite. */
export function delaisParPhase(m: NonNullable<DonneesDirection["missions"]>): PhaseDelai[] {
  const parMission = new Map<string, typeof m.taches>();
  for (const t of m.taches) parMission.set(t.missionId, [...(parMission.get(t.missionId) ?? []), t]);
  const cumul = new Map<IdPhase, number[]>(PHASES.map((p) => [p.id, []]));
  for (const taches of parMission.values()) {
    const agents = new Map<string, AgentMission>();
    for (const t of taches) if (t.agentNom) agents.set(t.agentNom, { id: t.agentNom, nom: t.agentNom, cle: t.agentCle, role: null });
    const groupes = new Map<IdPhase, typeof taches>();
    for (const t of taches) {
      const p = classerTache({ title: t.titre, agentId: t.agentNom }, agents);
      groupes.set(p, [...(groupes.get(p) ?? []), t]);
    }
    for (const [p, ts] of groupes) {
      const faites = ts.every((t) => t.statut === "done" || t.statut === "cancelled") && ts.some((t) => t.statut === "done" && t.termineLe);
      if (!faites) continue;
      const debut = ts.map((t) => t.creeLe).sort()[0]!;
      const fin = ts.flatMap((t) => (t.statut === "done" && t.termineLe ? [t.termineLe] : [])).sort().at(-1)!;
      const h = heures(debut, fin);
      if (h >= 0) cumul.get(p)!.push(h);
    }
  }
  return PHASES.filter((p) => p.id !== "reponse").map((p) => ({ id: p.id, libelle: p.libelle, heures: moyenne(cumul.get(p.id)!), effectif: cumul.get(p.id)!.length }));
}

function missions(e: EntreesMois): TableauDirection["missions"] {
  const m = e.direction?.missions ?? null;
  const absent = "Missions illisibles.";
  if (!m) {
    return {
      enCours: indicateur("missions_en_cours", "Missions en cours", "nombre", null, "tâches du bureau", { note: absent }),
      terminees: indicateur("missions_terminees", "Missions terminées", "nombre", null, "tâches du bureau", { note: absent }),
      dureeMoyenne: indicateur("duree_mission", "Durée moyenne d'une mission terminée", "heures", null, "tâches du bureau", { note: absent }),
      phases: delaisParPhase({ lignes: [], taches: [], plafond: 0 }),
      phasesMesurees: false,
      tronque: false,
    };
  }
  const debut = e.direction!.periode.debut;
  const ouvertes = m.lignes.filter((l) => l.statut !== "done" && l.statut !== "cancelled");
  const finies = m.lignes.filter((l) => l.statut === "done" && l.termineLe !== null && l.termineLe >= debut);
  const phases = delaisParPhase(m);
  return {
    enCours: indicateur("missions_en_cours", "Missions en cours", "nombre", ouvertes.length, "tâches du bureau", { note: m.lignes.length >= m.plafond ? `Au plus ${m.plafond} missions lues : nombre minimum.` : null }),
    terminees: indicateur("missions_terminees", "Missions terminées", "nombre", finies.length, "tâches du bureau"),
    dureeMoyenne: indicateur("duree_mission", "Durée moyenne d'une mission terminée", "heures", moyenne(finies.map((l) => heures(l.creeLe, l.termineLe!))), "tâches du bureau", { note: finies.length === 0 ? "Aucune mission terminée ce mois." : null }),
    phases,
    phasesMesurees: phases.some((p) => p.heures !== null),
    tronque: m.lignes.length >= m.plafond,
  };
}

function decisions(e: EntreesMois): TableauDirection["decisions"] {
  const r = e.rapport;
  const h = (e.direction?.delaiDecision?.heures ?? []).filter((x) => Number.isFinite(x) && x >= 0);
  const lisible = e.direction?.delaiDecision != null;
  const note = !lisible ? "Source illisible." : "Aucune décision humaine prise ce mois.";
  return {
    enAttente: indicateur("decisions_en_attente", "Points en attente de votre décision", "nombre", r ? r.enAttenteClient.points.length : null, "accueil, liste « À faire »", { note: r ? "État au jour de la consultation." : "Rapport du mois illisible." }),
    delaiMoyen: indicateur("delai_moyen", "Délai moyen de réponse", "heures", moyenne(h), "décisions humaines", { note: h.length === 0 ? note : `${h.length} décision${h.length > 1 ? "s" : ""}.` }),
    delaiMedian: indicateur("delai_median", "Délai médian de réponse", "heures", mediane(h), "décisions humaines", { note: h.length === 0 ? note : null }),
  };
}

function contenus(e: EntreesMois): Indicateur[] {
  const r = e.rapport;
  const note = r ? null : "Rapport du mois illisible.";
  const v = (cle: string) => (r ? chiffreDe(r.contenus, cle) : null);
  return [
    indicateur("contenus_produits", "Contenus produits", "nombre", v("contenus_produits_reel"), "contenus produits", { note }),
    indicateur("contenus_valides", "Contenus validés", "nombre", v("contenus_valides_reel"), "validations humaines", { note }),
    indicateur("contenus_publies", "Contenus publiés", "nombre", v("contenus_publies_reel"), "publications confirmées", { note }),
  ];
}

function captation(e: EntreesMois): Indicateur[] {
  const d = e.direction;
  const note = d ? "Connexion à faire : ce service n'envoie encore aucune mesure." : "Source illisible.";
  const absent = d ? "connexion_a_faire" : "non_mesure";
  return [
    indicateur("vues", "Vues des pages de captation", "nombre", d?.captation?.vues ?? null, "Umami (pages de captation)", { note, absent }),
    indicateur("soumissions", "Soumissions du formulaire", "nombre", d?.captation?.soumissions ?? null, "pages de captation", { note, absent }),
    indicateur("envois", "Envois d'e-mails", "nombre", d?.emailing?.envois ?? null, "e-mailing", { note, absent }),
  ];
}

function calculerMois(e: EntreesMois): MoisCalcule {
  const ent = entonnoir(e);
  const qualifies = ent.find((x) => x.cle === "fiables")?.valeur ?? null;
  return { entonnoir: ent, couts: couts(e, qualifies), missions: missions(e), decisions: decisions(e), contenus: contenus(e), captation: captation(e) };
}

/* ------------------------------------------------------------------ */
/* Sources à connecter                                                  */
/* ------------------------------------------------------------------ */

const A_CONNECTER: Record<string, string> = {
  avec_numero: "Relire les fiches de prospects (la base du plugin doit répondre).",
  trouves: "Rapport du mois : la route du rapport doit répondre.",
  fiables: "Rapport du mois : la route du rapport doit répondre.",
  contactes: "Importer les contacts réalisés (téléphone, courriel) ou connecter le CRM du client.",
  rendez_vous: "Importer les rendez-vous obtenus ou connecter l'agenda ou le CRM du client.",
  clients_gagnes: "Importer les clients gagnés ou connecter le CRM du client.",
  vues: "Brancher Umami sur les pages de captation.",
  soumissions: "Publier une page de captation et importer ses soumissions.",
  envois: "Brancher le service d'e-mailing et importer ses envois.",
  cout_total: "Relevé des coûts IA : la route du rapport doit répondre.",
  jetons: "Relevé des coûts IA : la route du rapport doit répondre.",
  missions_en_cours: "Lecture des tâches du bureau : la base du plugin doit répondre.",
  delai_moyen: "Rien à connecter : le délai se mesure dès la première décision humaine du mois.",
  decisions_en_attente: "Rapport du mois : la route du rapport doit répondre.",
};

export function sourcesManquantes(m: MoisCalcule): SourceManquante[] {
  const tous: Indicateur[] = [
    ...m.entonnoir,
    m.couts.total,
    m.missions.enCours,
    m.missions.dureeMoyenne,
    m.decisions.enAttente,
    m.decisions.delaiMoyen,
    ...m.contenus,
    ...m.captation,
  ];
  const sorties: SourceManquante[] = [];
  for (const i of tous) {
    if (i.etat === "mesure") continue;
    // Une durée moyenne sans mission terminée n'est pas une source manquante : rien à compter.
    if (i.cle === "duree_mission" && i.note === "Aucune mission terminée ce mois.") continue;
    sorties.push({
      cle: i.cle,
      libelle: i.libelle,
      raison: i.etat === "connexion_a_faire" ? "Connexion à faire" : (i.note ?? "Non mesuré"),
      aConnecter: A_CONNECTER[i.cle] ?? A_CONNECTER["missions_en_cours"]!,
    });
  }
  return sorties;
}

/* ------------------------------------------------------------------ */
/* Tableau complet                                                      */
/* ------------------------------------------------------------------ */

/** Le tableau du mois `mois`, comparé au mois précédent (`precedent` : ses entrées, ou `null` s'il est illisible). */
export function tableauDirection(mois: string, courant: EntreesMois, precedent: EntreesMois | null): TableauDirection {
  const c = calculerMois(courant);
  const p = precedent ? calculerMois(precedent) : null;
  const trouve = (liste: Indicateur[] | undefined, cle: string) => liste?.find((x) => x.cle === cle);
  return {
    mois,
    moisPrecedent: moisPrecedent(mois),
    entonnoir: c.entonnoir.map((x) => comparer(x, trouve(p?.entonnoir, x.cle))),
    couts: {
      ...c.couts,
      total: comparer(c.couts.total, p?.couts.total),
      jetons: comparer(c.couts.jetons, p?.couts.jetons),
      parProspectQualifie: comparer(c.couts.parProspectQualifie, p?.couts.parProspectQualifie),
    },
    missions: {
      ...c.missions,
      enCours: comparer(c.missions.enCours, p?.missions.enCours),
      terminees: comparer(c.missions.terminees, p?.missions.terminees),
      dureeMoyenne: comparer(c.missions.dureeMoyenne, p?.missions.dureeMoyenne),
    },
    decisions: {
      enAttente: comparer(c.decisions.enAttente, p?.decisions.enAttente),
      delaiMoyen: comparer(c.decisions.delaiMoyen, p?.decisions.delaiMoyen),
      delaiMedian: comparer(c.decisions.delaiMedian, p?.decisions.delaiMedian),
    },
    contenus: c.contenus.map((x) => comparer(x, trouve(p?.contenus, x.cle))),
    captation: c.captation.map((x) => comparer(x, trouve(p?.captation, x.cle))),
    sources: sourcesManquantes(c),
  };
}
