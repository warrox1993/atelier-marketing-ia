/**
 * Plafonds de dépenses publicitaires (décision de l'opérateur du 15/10/2026) : contrats,
 * cumul des montants engagés, refus d'une approbation ou d'une diffusion au-delà
 * de la limite, « aucune limite » qui exige quand même l'approbation, et garde des
 * agents (un agent ne modifie jamais ces réglages).
 */
import { describe, expect, it } from "vitest";
import { ACTIONS_UI, CreerCampagneEntree, EnregistrerPlafondCampagneEntree, EnregistrerReglagesEntree, PlafondEntree, PlafondPub } from "../src/contrats/index.js";
import { creerAiguillage, type Services } from "../src/serveur/atelier.js";
import { verifierDiffusion } from "../src/serveur/regles-diffusion.js";
import {
  calculerEngagements,
  cumuler,
  engagementsAvecApprobation,
  engagementsAvecDiffusion,
  peutModifierPlafond,
  verifierPlafonds,
  type DecisionPourEngagement,
  type DiffusionPourEngagement,
} from "../src/serveur/regles-plafonds.js";

const H = "2026-10-15T10:00:00.000Z";
const C1 = "campagne-1";
const C2 = "campagne-2";
const plafond = (montantCents: number): PlafondPub => ({ type: "montant", montantCents, decidePar: "local-board", decideLe: H });
const sansLimite: PlafondPub = { type: "aucune_limite", decidePar: "local-board", decideLe: H };

let compteur = 0;
function approbation(o: Partial<DecisionPourEngagement> & { montant: number }): DecisionPourEngagement {
  compteur += 1;
  return {
    id: o.id ?? `dec-${compteur}`, issueId: o.issueId ?? `tache-${compteur}`, revisionId: o.revisionId ?? "rev-1", campagneId: o.campagneId ?? C1,
    action: o.action ?? "approuver", invalidee: o.invalidee ?? false, creeLe: o.creeLe ?? `2026-10-15T10:00:0${compteur % 10}.000Z`,
    portee: o.portee === undefined ? { action: "activer_campagne_payante", montantMaxCents: o.montant } : o.portee,
  };
}
function diffusion(o: Partial<DiffusionPourEngagement> & { montant: number }): DiffusionPourEngagement {
  compteur += 1;
  return { id: o.id ?? `dif-${compteur}`, issueId: o.issueId ?? "tache-1", campagneId: o.campagneId ?? C1, decisionId: o.decisionId ?? null, action: o.action ?? "activer_campagne_payante", etat: o.etat ?? "simulee", montantCents: o.montant };
}

describe("contrats des plafonds", () => {
  it("accepte un montant positif ou « aucune limite », refuse 0, un négatif, un type inconnu", () => {
    expect(PlafondEntree.safeParse({ type: "montant", montantCents: 150000 }).success).toBe(true);
    expect(PlafondEntree.safeParse({ type: "aucune_limite" }).success).toBe(true);
    // 0 serait confondu avec « illimité » côté natif : refusé.
    expect(PlafondEntree.safeParse({ type: "montant", montantCents: 0 }).success).toBe(false);
    expect(PlafondEntree.safeParse({ type: "montant", montantCents: -5 }).success).toBe(false);
    expect(PlafondEntree.safeParse({ type: "montant", montantCents: 1.5 }).success).toBe(false);
    expect(PlafondEntree.safeParse({ type: "illimite" }).success).toBe(false);
    expect(PlafondEntree.safeParse({ type: "montant" }).success).toBe(false);
  });
  it("le choix enregistré porte sa trace (qui, quand)", () => {
    expect(PlafondPub.safeParse(plafond(1000)).success).toBe(true);
    expect(PlafondPub.safeParse(sansLimite).success).toBe(true);
    expect(PlafondPub.safeParse({ type: "aucune_limite" }).success).toBe(false);
  });
  it("campagne : plafondPub optionnel, null par défaut (aucun choix)", () => {
    const base = { companyId: "11111111-1111-4111-8111-111111111111", projectId: "22222222-2222-4222-8222-222222222222", nom: "N", brief: "B" };
    expect(CreerCampagneEntree.parse(base).plafondPub).toBeNull();
    expect(CreerCampagneEntree.parse({ ...base, plafondPub: { type: "aucune_limite" } }).plafondPub).toEqual({ type: "aucune_limite" });
  });
  it("réglages et plafond de campagne : le choix peut être retiré (null) ou laissé absent", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(EnregistrerReglagesEntree.parse({ companyId: id }).plafondPub).toBeUndefined();
    expect(EnregistrerReglagesEntree.parse({ companyId: id, plafondPub: null }).plafondPub).toBeNull();
    expect(EnregistrerPlafondCampagneEntree.safeParse({ companyId: id, plafondPub: { type: "montant", montantCents: 0 } }).success).toBe(false);
  });
  it("les actions de plafond sont réservées à l'humain", () => {
    expect(ACTIONS_UI["atelier.campagne.plafond"].humainSeulement).toBe(true);
    expect(ACTIONS_UI["atelier.reglages.enregistrer"].humainSeulement).toBe(true);
    expect(ACTIONS_UI["atelier.budget-ia.tracer"].humainSeulement).toBe(true);
    expect(ACTIONS_UI["atelier.campagne.creer"].humainSeulement).toBe(true);
  });
});

describe("cumul des montants engagés", () => {
  it("compte le réservé d'une approbation valide non consommée", () => {
    const e = calculerEngagements([approbation({ montant: 40000 })], []);
    expect(cumuler(e, C1)).toEqual({ engageCents: 40000, diffuseCents: 0, reserveCents: 40000 });
  });
  it("une diffusion consomme la réserve sans doubler le total", () => {
    const d = approbation({ id: "d1", montant: 40000 });
    const e = calculerEngagements([d], [diffusion({ montant: 15000, decisionId: "d1" })]);
    expect(cumuler(e, C1)).toEqual({ engageCents: 40000, diffuseCents: 15000, reserveCents: 25000 });
  });
  it("une diffusion refusée ne compte pas", () => {
    const e = calculerEngagements([approbation({ id: "d1", montant: 40000 })], [diffusion({ montant: 40000, decisionId: "d1", etat: "refusee" })]);
    expect(cumuler(e, C1).diffuseCents).toBe(0);
  });
  it("une approbation invalidée libère sa réserve mais l'argent déjà diffusé reste engagé", () => {
    const d = approbation({ id: "d1", montant: 40000, invalidee: true });
    const e = calculerEngagements([d], [diffusion({ montant: 10000, decisionId: "d1" })]);
    expect(cumuler(e, C1)).toEqual({ engageCents: 10000, diffuseCents: 10000, reserveCents: 0 });
  });
  it("une nouvelle décision sur la même version remplace la précédente (pas de double réserve)", () => {
    const ancienne = approbation({ id: "d1", issueId: "t", revisionId: "r", montant: 40000, creeLe: "2026-10-15T10:00:01.000Z" });
    const recente = approbation({ id: "d2", issueId: "t", revisionId: "r", montant: 30000, creeLe: "2026-10-15T10:00:02.000Z" });
    expect(cumuler(calculerEngagements([ancienne, recente], []), C1).engageCents).toBe(30000);
    const correction = approbation({ id: "d3", issueId: "t", revisionId: "r", montant: 0, action: "demander_correction", portee: null, creeLe: "2026-10-15T10:00:03.000Z" });
    expect(cumuler(calculerEngagements([ancienne, recente, correction], []), C1).engageCents).toBe(0);
  });
  it("sépare les campagnes et additionne l'entreprise", () => {
    const e = calculerEngagements([approbation({ montant: 40000, campagneId: C1 }), approbation({ montant: 25000, campagneId: C2 })], []);
    expect(cumuler(e, C1).engageCents).toBe(40000);
    expect(cumuler(e, C2).engageCents).toBe(25000);
    expect(cumuler(e).engageCents).toBe(65000);
  });
  it("ignore les approbations non payantes et les actions non payantes", () => {
    const publier = approbation({ montant: 0, portee: { action: "publier", montantMaxCents: null } });
    const e = calculerEngagements([publier], [diffusion({ montant: 500, action: "publier" })]);
    expect(cumuler(e).engageCents).toBe(0);
  });
});

describe("plafonds : refus au-delà de la limite", () => {
  const verifierApprobation = (o: { decisions?: DecisionPourEngagement[]; diffusions?: DiffusionPourEngagement[]; montant: number; plafondCampagne: PlafondPub | null; plafondEntreprise: PlafondPub | null }) => {
    const nouvelle = approbation({ id: "nouvelle", montant: o.montant });
    const apres = engagementsAvecApprobation(o.decisions ?? [], o.diffusions ?? [], nouvelle);
    return verifierPlafonds({ montantCents: o.montant, plafondCampagne: o.plafondCampagne, plafondEntreprise: o.plafondEntreprise, engageCampagneApres: cumuler(apres, C1).engageCents, engageEntrepriseApres: cumuler(apres).engageCents });
  };

  it("approbation à la limite acceptée, un centime au-dessus refusée (campagne)", () => {
    expect(verifierApprobation({ montant: 150000, plafondCampagne: plafond(150000), plafondEntreprise: null }).ok).toBe(true);
    const v = verifierApprobation({ montant: 150001, plafondCampagne: plafond(150000), plafondEntreprise: null });
    expect(v.ok).toBe(false);
    expect(v.ok ? "" : v.code).toBe("plafond_campagne");
  });
  it("tient compte des montants déjà engagés (réservés ou diffusés)", () => {
    const deja = [approbation({ id: "d1", montant: 100000 })];
    const diffusions = [diffusion({ montant: 20000, decisionId: "d1" })];
    expect(verifierApprobation({ decisions: deja, diffusions, montant: 50000, plafondCampagne: plafond(150000), plafondEntreprise: null }).ok).toBe(true);
    expect(verifierApprobation({ decisions: deja, diffusions, montant: 50001, plafondCampagne: plafond(150000), plafondEntreprise: null }).ok).toBe(false);
  });
  it("plafond d'entreprise : cumul de toutes les campagnes", () => {
    const autre = [approbation({ montant: 90000, campagneId: C2 })];
    const v = verifierApprobation({ decisions: autre, montant: 20000, plafondCampagne: plafond(500000), plafondEntreprise: plafond(100000) });
    expect(v.ok).toBe(false);
    expect(v.ok ? "" : v.code).toBe("plafond_entreprise");
    expect(verifierApprobation({ decisions: autre, montant: 10000, plafondCampagne: plafond(500000), plafondEntreprise: plafond(100000) }).ok).toBe(true);
  });
  it("le plafond de campagne est vérifié avant celui de l'entreprise", () => {
    const v = verifierApprobation({ montant: 60000, plafondCampagne: plafond(50000), plafondEntreprise: plafond(50000) });
    expect(v.ok ? "" : v.code).toBe("plafond_campagne");
  });
  it("« aucune limite » sur la campagne n'écarte pas un plafond d'entreprise", () => {
    expect(verifierApprobation({ montant: 60000, plafondCampagne: sansLimite, plafondEntreprise: plafond(50000) }).ok).toBe(false);
    expect(verifierApprobation({ montant: 60000, plafondCampagne: plafond(500000), plafondEntreprise: sansLimite }).ok).toBe(true);
  });
  it("aucun choix à aucun niveau : toute dépense est refusée ; une opération sans dépense n'est pas concernée", () => {
    const v = verifierApprobation({ montant: 100, plafondCampagne: null, plafondEntreprise: null });
    expect(v.ok).toBe(false);
    expect(v.ok ? "" : v.code).toBe("aucun_choix");
    expect(verifierPlafonds({ montantCents: 0, plafondCampagne: null, plafondEntreprise: null, engageCampagneApres: 0, engageEntrepriseApres: 0 }).ok).toBe(true);
  });
  it("un choix au seul niveau de la campagne ou de l'entreprise suffit", () => {
    expect(verifierApprobation({ montant: 100, plafondCampagne: sansLimite, plafondEntreprise: null }).ok).toBe(true);
    expect(verifierApprobation({ montant: 100, plafondCampagne: null, plafondEntreprise: sansLimite }).ok).toBe(true);
    expect(verifierApprobation({ montant: 100, plafondCampagne: null, plafondEntreprise: plafond(100) }).ok).toBe(true);
  });
  it("diffusion : refusée si un plafond a été abaissé sous le montant engagé ; acceptée sinon sans changer le total", () => {
    const d = approbation({ id: "d1", montant: 50000 });
    const nouvelle = diffusion({ montant: 30000, decisionId: "d1" });
    const apres = engagementsAvecDiffusion([d], [], nouvelle);
    // La diffusion consomme la réserve de son approbation : le total engagé reste 50 000.
    expect(cumuler(apres, C1).engageCents).toBe(50000);
    const ok = verifierPlafonds({ montantCents: 30000, plafondCampagne: plafond(50000), plafondEntreprise: null, engageCampagneApres: cumuler(apres, C1).engageCents, engageEntrepriseApres: cumuler(apres).engageCents });
    expect(ok.ok).toBe(true);
    const abaisse = verifierPlafonds({ montantCents: 30000, plafondCampagne: plafond(40000), plafondEntreprise: null, engageCampagneApres: cumuler(apres, C1).engageCents, engageEntrepriseApres: cumuler(apres).engageCents });
    expect(abaisse.ok).toBe(false);
  });
});

describe("« aucune limite » exige quand même l'approbation (règles combinées)", () => {
  const portee = { revisionId: "r2", action: "activer_campagne_payante", canal: "facebook", compte: null, audience: null, montantMaxCents: 10000, dureeJours: 30 };
  const decision = (p: object | null) => ({ id: "d1", revisionId: "r2", action: "approuver" as const, portee: p as never, invalidee: false, creeLe: "2026-10-15T10:00:00.000Z" });
  const demande = { revisionId: "r2", action: "activer_campagne_payante" as const, canal: "facebook", compte: null, audience: null, montantCents: 8000 };
  const commun = { revisionCourante: "r2", porteFranchie: true, statutNatif: "done", maintenant: new Date("2026-10-16T00:00:00Z"), diffusionsAnterieures: [] };

  it("sans plafond, une diffusion payante sans approbation est refusée", () => {
    expect(verifierDiffusion({ ...commun, demande, decisions: [] }).ok).toBe(false);
    // Les plafonds « aucune limite » ne changent rien à ce refus : ils ne sont même pas consultés.
    expect(verifierPlafonds({ montantCents: 8000, plafondCampagne: sansLimite, plafondEntreprise: sansLimite, engageCampagneApres: 8000, engageEntrepriseApres: 8000 }).ok).toBe(true);
  });
  it("sans plafond, un montant supérieur à l'approuvé est refusé", () => {
    expect(verifierDiffusion({ ...commun, demande: { ...demande, montantCents: 10001 }, decisions: [decision(portee)] }).ok).toBe(false);
  });
  it("sans plafond, l'approbation d'un article ne couvre pas une campagne payante", () => {
    const article = { ...portee, action: "publier", montantMaxCents: null, dureeJours: null };
    expect(verifierDiffusion({ ...commun, demande, decisions: [decision(article)] }).ok).toBe(false);
  });
  it("avec approbation à portée précise, la diffusion passe", () => {
    expect(verifierDiffusion({ ...commun, demande, decisions: [decision(portee)] }).ok).toBe(true);
  });
});

describe("garde des agents : jamais de modification des plafonds", () => {
  it("un agent, le système ou un humain sans identité ne peuvent pas", () => {
    expect(peutModifierPlafond({ type: "agent", userId: null })).toBe(false);
    expect(peutModifierPlafond({ type: "agent", userId: "intrus" })).toBe(false);
    expect(peutModifierPlafond({ type: "systeme", userId: null })).toBe(false);
    expect(peutModifierPlafond({ type: "humain", userId: null })).toBe(false);
    expect(peutModifierPlafond({ type: "humain", userId: "" })).toBe(false);
    expect(peutModifierPlafond({ type: "humain", userId: "local-board" })).toBe(true);
  });

  /** Aiguillage réel (`atelier.ts`) avec de faux services : prouve le refus avant tout service. */
  function aiguillageAvecEspions() {
    const appels: string[] = [];
    const gestionnaires: Record<string, (p: unknown, c: unknown) => Promise<unknown>> = {};
    const ctx = {
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      data: { register() {} },
      actions: { register(cle: string, fn: (p: unknown, c: unknown) => Promise<unknown>) { gestionnaires[cle] = fn; } },
    } as never;
    const services = { routes: {}, donnees: {}, actions: Object.fromEntries(Object.keys(ACTIONS_UI).map((k) => [k, async () => { appels.push(k); return {}; }])) } as unknown as Services;
    const a = creerAiguillage(ctx, services);
    a.enregistrer();
    return { appels, gestionnaires };
  }
  const contexteAgent = { companyId: "11111111-1111-4111-8111-111111111111", actor: { type: "agent", agentId: "agent-x", runId: "run-1" } };
  const contexteHumain = { companyId: "11111111-1111-4111-8111-111111111111", actor: { type: "user", userId: "local-board" } };
  const idC = "22222222-2222-4222-8222-222222222222";

  it.each([
    ["atelier.reglages.enregistrer", { plafondPub: { type: "aucune_limite" } }],
    ["atelier.campagne.plafond", { campagneId: idC, plafondPub: { type: "aucune_limite" } }],
    ["atelier.campagne.creer", { projectId: idC, nom: "N", brief: "B", plafondPub: { type: "aucune_limite" } }],
    ["atelier.budget-ia.tracer", { portee: "entreprise" }],
  ])("%s : refusée à un agent, service jamais appelé", async (cle, params) => {
    const { appels, gestionnaires } = aiguillageAvecEspions();
    await expect(gestionnaires[cle]!(params, contexteAgent)).rejects.toThrow(/elevation_refusee/u);
    expect(appels).toEqual([]);
  });
  it("la même action passe pour un humain authentifié", async () => {
    const { appels, gestionnaires } = aiguillageAvecEspions();
    await gestionnaires["atelier.campagne.plafond"]!({ campagneId: idC, plafondPub: { type: "montant", montantCents: 5000 } }, contexteHumain);
    expect(appels).toEqual(["atelier.campagne.plafond"]);
  });
});
