/**
 * Refus serveur d'une action externe non approuvée (cahier §9) : une
 * approbation vise une version précise et une portée (action, canal, compte,
 * audience, montant, durée). L'approbation d'un article n'autorise pas une
 * campagne payante ; une nouvelle révision invalide l'approbation. Fonction pure.
 */
import type { ApprobationPortee } from "../contrats/index.js";

export interface DemandeDiffusion {
  revisionId: string;
  action: "publier" | "envoyer" | "programmer" | "activer_campagne_payante" | "modifier_crm";
  canal: string;
  compte: string | null;
  audience: string | null;
  montantCents: number | null;
}

/** Diffusion déjà enregistrée sur la tâche (toutes révisions), pour les règles de non-répétition et de cumul. */
export interface DiffusionConnue {
  id: string;
  revisionId: string;
  decisionId: string | null;
  action: string;
  canal: string;
  compte: string | null;
  etat: string;
  montantCents: number | null;
}

export interface DecisionConnue {
  id: string;
  revisionId: string;
  action: "approuver" | "demander_correction" | "rejeter";
  portee: ApprobationPortee | null;
  invalidee: boolean;
  creeLe: string;
}

export function verifierDiffusion(e: {
  demande: DemandeDiffusion;
  revisionCourante: string | null;
  porteFranchie: boolean;
  statutNatif: string;
  decisions: DecisionConnue[];
  maintenant: Date;
  /**
   * Diffusions déjà enregistrées sur la tâche. OBLIGATOIRE : sans cet historique, la règle ne peut
   * pas garantir qu'une publication ne part qu'une fois (M1) ni le total payant par révision (B3) ;
   * elle refuse alors (prudence).
   */
  diffusionsAnterieures: readonly DiffusionConnue[];
}): { ok: true; decisionId: string; portee: ApprobationPortee; decisionCreeLe: string } | { ok: false; motif: string } {
  const d = e.demande;
  if (!Array.isArray(e.diffusionsAnterieures)) {
    return { ok: false, motif: "Historique des diffusions de la tâche indisponible : refus par prudence." };
  }
  if (!e.revisionCourante || d.revisionId !== e.revisionCourante) {
    return { ok: false, motif: "La version demandée n'est pas la version courante du livrable." };
  }
  if (!e.porteFranchie) return { ok: false, motif: "La porte déterministe n'est pas franchie sur cette version." };
  if (e.statutNatif !== "done") return { ok: false, motif: "La tâche n'est pas approuvée nativement (étape humaine non terminée)." };
  const decision = [...e.decisions]
    .filter((x) => x.revisionId === d.revisionId && !x.invalidee)
    .sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1))[0];
  if (!decision || decision.action !== "approuver") return { ok: false, motif: "Aucune décision humaine d'approbation valide pour cette version." };
  const p = decision.portee;
  if (!p) return { ok: false, motif: "L'approbation n'a pas de portée : aucune action externe n'est autorisée." };
  if (p.revisionId !== d.revisionId) return { ok: false, motif: "La portée approuvée vise une autre version." };
  if (p.action !== d.action) return { ok: false, motif: `L'approbation couvre « ${p.action} », pas « ${d.action} ».` };
  if (!p.canal || p.canal !== d.canal) return { ok: false, motif: `Canal non approuvé : ${d.canal}.` };
  if (p.compte !== null && p.compte !== d.compte) return { ok: false, motif: "Compte non approuvé." };
  if (p.audience !== null && p.audience !== d.audience) return { ok: false, motif: "Audience non approuvée." };
  if (d.action === "activer_campagne_payante") {
    // Même sans plafond (« aucune limite »), une dépense exige une approbation humaine
    // qui vise un montant, un canal et une durée précis.
    if (p.montantMaxCents === null || d.montantCents === null) return { ok: false, motif: "Une dépense exige un montant approuvé explicite." };
    if (p.dureeJours === null) return { ok: false, motif: "Une dépense exige une durée d'approbation explicite." };
    if (d.montantCents <= 0) return { ok: false, motif: "Une dépense exige un montant strictement positif." };
    if (d.montantCents > p.montantMaxCents) return { ok: false, motif: `Montant ${d.montantCents} c au-delà de l'approuvé (${p.montantMaxCents} c).` };
    // B3 (décision de l'opérateur du 15/10/2026) : le montant approuvé est un TOTAL PAR RÉVISION. Une nouvelle
    // approbation de la même révision ne remet pas le cumul à zéro : tout ce qui a déjà été diffusé
    // (non refusé) sur cette révision, sous n'importe quelle décision, compte.
    const deja = e.diffusionsAnterieures
      .filter((x) => x.revisionId === d.revisionId && x.action === "activer_campagne_payante" && x.etat !== "refusee")
      .reduce((s, x) => s + (x.montantCents ?? 0), 0);
    if (deja + d.montantCents > p.montantMaxCents) {
      return { ok: false, motif: `Montant cumulé ${deja + d.montantCents} c (dont ${deja} c déjà diffusés sur cette révision) au-delà de l'approuvé (${p.montantMaxCents} c).` };
    }
  } else if (d.montantCents !== null && d.montantCents > 0) {
    return { ok: false, motif: "Une dépense n'est pas couverte par une approbation sans montant." };
  } else {
    // M1 : une même publication (même décision, action, canal, compte) ne part qu'une fois. La clé
    // d'idempotence ne sert qu'à rejouer la réponse d'une même demande, jamais à en créer une seconde.
    const doublon = e.diffusionsAnterieures.find(
      (x) => x.etat !== "refusee" && x.decisionId === decision.id && x.action === d.action && x.canal === d.canal && (x.compte ?? null) === (d.compte ?? null),
    );
    if (doublon) {
      return { ok: false, motif: `Déjà diffusée sous cette approbation (diffusion ${doublon.id}, état ${doublon.etat}) : une même publication ne part qu'une fois ; rejouer la demande d'origine avec sa clé d'idempotence.` };
    }
  }
  if (p.dureeJours !== null) {
    const fin = new Date(decision.creeLe).getTime() + p.dureeJours * 86_400_000;
    if (e.maintenant.getTime() > fin) return { ok: false, motif: "L'approbation a expiré." };
  }
  return { ok: true, decisionId: decision.id, portee: p, decisionCreeLe: decision.creeLe };
}
