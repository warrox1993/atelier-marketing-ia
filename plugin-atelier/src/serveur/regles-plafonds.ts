/**
 * Plafonds de dépenses publicitaires : règles pures, appliquées côté serveur
 * (décision de l'opérateur du 15/10/2026).
 *
 * - Le client choisit, par entreprise et par campagne, un montant maximal ou
 *   « aucune limite ». Seul un humain authentifié modifie ce choix.
 * - « Aucune limite » ne supprime JAMAIS l'approbation : toute dépense reste
 *   couverte par une approbation humaine à portée précise (voir
 *   `regles-diffusion.ts`). Il supprime seulement le garde-fou global.
 * - Le montant engagé d'une campagne ou de l'entreprise est le DÉPENSÉ (diffusions
 *   non refusées) plus le RÉSERVÉ (approbations valides, part non encore diffusée).
 *   Une approbation ou une diffusion qui ferait dépasser un plafond est refusée.
 * - Aucun choix à aucun niveau : toute dépense publicitaire est refusée (le choix
 *   du client ne se présume pas).
 */
import type { PlafondPub } from "../contrats/index.js";

/** Acteur tel que le worker le connaît (voir `atelier.ts`). */
export interface ActeurPlafond {
  type: "agent" | "humain" | "systeme";
  userId: string | null;
}

/** Seul un humain authentifié (utilisateur du board) peut choisir ou modifier un plafond. */
export function peutModifierPlafond(acteur: ActeurPlafond): boolean {
  return acteur.type === "humain" && typeof acteur.userId === "string" && acteur.userId.length > 0;
}

/** Décision de l'humain, avec la portée d'approbation lue dans la base. */
export interface DecisionPourEngagement {
  id: string;
  issueId: string;
  revisionId: string;
  campagneId: string | null;
  action: "approuver" | "demander_correction" | "rejeter";
  invalidee: boolean;
  creeLe: string;
  portee: { action: string; montantMaxCents: number | null } | null;
}

/** Diffusion payante connue (les refusées sont exclues par l'appelant ou ici). */
export interface DiffusionPourEngagement {
  id: string;
  issueId: string;
  /** Révision diffusée (B3 : le montant approuvé est un total par révision). Absente : rattachée à sa décision seulement. */
  revisionId?: string | null;
  campagneId: string | null;
  decisionId: string | null;
  action: string;
  etat: string;
  montantCents: number | null;
}

/** Une ligne par décision d'approbation payante, plus une ligne « orpheline » par diffusion sans décision. */
export interface Engagement {
  campagneId: string | null;
  decisionId: string | null;
  /** Montant maximal approuvé (0 pour une ligne orpheline). */
  approuveCents: number;
  /** Vrai si l'approbation est valide : la plus récente non invalidée de sa révision, et c'est une approbation. */
  valide: boolean;
  /** Part déjà diffusée sous cette décision (diffusions non refusées). */
  diffuseCents: number;
  /** B3 : part déjà diffusée sur la révision de cette décision, toutes décisions confondues. */
  diffuseRevisionCents?: number;
}

const estPayante = (action: string | undefined | null) => action === "activer_campagne_payante";

/**
 * Construit les engagements. Une décision d'approbation payante est « valide » quand
 * elle est la plus récente non invalidée de sa révision (même règle que
 * `verifierDiffusion`) ET que c'est une approbation.
 */
export function calculerEngagements(decisions: DecisionPourEngagement[], diffusions: DiffusionPourEngagement[]): Engagement[] {
  const payantes = diffusions.filter((d) => estPayante(d.action) && d.etat !== "refusee" && (d.montantCents ?? 0) > 0);
  const derniereParRevision = new Map<string, DecisionPourEngagement>();
  for (const d of decisions) {
    if (d.invalidee) continue;
    const cle = `${d.issueId}:${d.revisionId}`;
    const actuelle = derniereParRevision.get(cle);
    if (!actuelle || actuelle.creeLe < d.creeLe) derniereParRevision.set(cle, d);
  }
  const lignes: Engagement[] = [];
  const connues = new Set<string>();
  const revisionDe = new Map(decisions.map((d) => [d.id, `${d.issueId}:${d.revisionId}`]));
  // B3 : diffusé par révision (toutes décisions de cette révision confondues).
  const diffuseParRevision = new Map<string, number>();
  for (const x of payantes) {
    const cle = x.revisionId ? `${x.issueId}:${x.revisionId}` : x.decisionId ? revisionDe.get(x.decisionId) : undefined;
    if (cle) diffuseParRevision.set(cle, (diffuseParRevision.get(cle) ?? 0) + (x.montantCents ?? 0));
  }
  for (const d of decisions) {
    if (d.action !== "approuver" || !d.portee || !estPayante(d.portee.action)) continue;
    connues.add(d.id);
    const diffuse = payantes.filter((x) => x.decisionId === d.id).reduce((s, x) => s + (x.montantCents ?? 0), 0);
    lignes.push({
      campagneId: d.campagneId,
      decisionId: d.id,
      approuveCents: d.portee.montantMaxCents ?? 0,
      valide: derniereParRevision.get(`${d.issueId}:${d.revisionId}`)?.id === d.id,
      diffuseCents: diffuse,
      diffuseRevisionCents: diffuseParRevision.get(`${d.issueId}:${d.revisionId}`) ?? diffuse,
    });
  }
  for (const x of payantes) {
    if (x.decisionId !== null && connues.has(x.decisionId)) continue;
    lignes.push({ campagneId: x.campagneId, decisionId: x.decisionId, approuveCents: 0, valide: false, diffuseCents: x.montantCents ?? 0 });
  }
  return lignes;
}

export interface Cumul {
  /** Dépensé + réservé. */
  engageCents: number;
  diffuseCents: number;
  reserveCents: number;
}

/** Cumul pour une campagne, ou pour toute l'entreprise si `campagneId` est omis. */
export function cumuler(engagements: Engagement[], campagneId?: string): Cumul {
  let diffuse = 0;
  let reserve = 0;
  for (const e of engagements) {
    if (campagneId !== undefined && e.campagneId !== campagneId) continue;
    diffuse += e.diffuseCents;
    // B3 : la réserve d'une approbation valide est le total approuvé moins ce que SA RÉVISION a déjà diffusé.
    if (e.valide) reserve += Math.max(0, e.approuveCents - (e.diffuseRevisionCents ?? e.diffuseCents));
  }
  return { engageCents: diffuse + reserve, diffuseCents: diffuse, reserveCents: reserve };
}

/** Limite en centimes d'un plafond ; `null` si « aucune limite » ou aucun choix. */
export function limiteDe(plafond: PlafondPub | null): number | null {
  return plafond !== null && plafond.type === "montant" ? plafond.montantCents : null;
}

export type VerdictPlafond = { ok: true } | { ok: false; code: "aucun_choix" | "plafond_campagne" | "plafond_entreprise"; motif: string };

const euros = (cents: number) => `${(cents / 100).toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/**
 * Vérifie une approbation ou une diffusion payante. `engageCampagneApres` et
 * `engageEntrepriseApres` sont les montants engagés APRÈS l'opération (calculés avec
 * l'approbation ou la diffusion ajoutée). Une opération sans dépense n'est jamais concernée.
 */
export function verifierPlafonds(e: {
  montantCents: number;
  plafondCampagne: PlafondPub | null;
  plafondEntreprise: PlafondPub | null;
  engageCampagneApres: number;
  engageEntrepriseApres: number;
}): VerdictPlafond {
  if (e.montantCents <= 0) return { ok: true };
  if (e.plafondCampagne === null && e.plafondEntreprise === null) {
    return {
      ok: false,
      code: "aucun_choix",
      motif: "Aucun plafond publicitaire choisi : le client doit indiquer un montant maximal ou « aucune limite » (pour la campagne ou pour l'entreprise) avant toute dépense.",
    };
  }
  const limiteCampagne = limiteDe(e.plafondCampagne);
  if (limiteCampagne !== null && e.engageCampagneApres > limiteCampagne) {
    return {
      ok: false,
      code: "plafond_campagne",
      motif: `Plafond de la campagne dépassé : ${euros(e.engageCampagneApres)} engagés avec cette opération pour une limite de ${euros(limiteCampagne)}.`,
    };
  }
  const limiteEntreprise = limiteDe(e.plafondEntreprise);
  if (limiteEntreprise !== null && e.engageEntrepriseApres > limiteEntreprise) {
    return {
      ok: false,
      code: "plafond_entreprise",
      motif: `Plafond de l'entreprise dépassé : ${euros(e.engageEntrepriseApres)} engagés avec cette opération pour une limite de ${euros(limiteEntreprise)}.`,
    };
  }
  return { ok: true };
}

/** Une approbation hypothétique, ajoutée aux décisions existantes pour mesurer l'engagement qu'elle créerait. */
export function engagementsAvecApprobation(
  decisions: DecisionPourEngagement[],
  diffusions: DiffusionPourEngagement[],
  nouvelle: DecisionPourEngagement,
): Engagement[] {
  return calculerEngagements([...decisions, nouvelle], diffusions);
}

/** Une diffusion hypothétique, ajoutée aux diffusions existantes. */
export function engagementsAvecDiffusion(
  decisions: DecisionPourEngagement[],
  diffusions: DiffusionPourEngagement[],
  nouvelle: DiffusionPourEngagement,
): Engagement[] {
  return calculerEngagements(decisions, [...diffusions, nouvelle]);
}
