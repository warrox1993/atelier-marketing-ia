/**
 * Moteur de missions (#55) : WF-01 en mode RÉEL. La route `tache.prospects.exporter` rend une diffusion « préparée » avec une preuve signée
 * que le moteur ne détient jamais : l'agent `crm-conversion` la rejoue (`tache.diffusions`), la passerelle exécute, l'agent dépose la réponse
 * signée (`tache.diffusions.issue`). Tout passe par les VRAIES routes (`creerServices`) en mode réel, avec la vraie signature ; seuls l'hôte,
 * la base (copies en mémoire qui refusent ce que le SQL refuse) et l'agent sont simulés.
 */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerCrmProduction } from "../src/moteur/branchement.js";
import { exporterLot, type CrmMoteur } from "../src/moteur/export-crm.js";
import { creerServices } from "../src/serveur/services.js";
import { cleIdempotenceSignee, signerRevocations } from "../src/serveur/signatures.js";
import { CAMP, ISSUE, REV1, SOC, creerBanc } from "./outils-base.js";
import { avecListeFraiche, emballer, paireEd25519, passerelle } from "./outils-passerelle.js";
import { P1, P2, P4, SOC as SOC_WF01, h, jusquAutorisation, prospect } from "./moteur-wf01-doubles.js";

const P = await passerelle();
const PLUGIN = paireEd25519();
const GW = paireEd25519();
const SIGNATAIRE = new P.SignataireEnveloppe(GW.privee);
const VERIFICATEUR = avecListeFraiche(new P.VerificateurPreuves(PLUGIN.publiquePem), PLUGIN.privee, signerRevocations);
const MISSION_WF01 = "mission-wf01";
const COMPTE = "crm/compte-1";
const AGENT_CRM = "agent-crm-conversion";
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const AGENT: ActeurHote = { type: "agent", id: AGENT_CRM, agentId: AGENT_CRM, userId: null, runId: "run-crm" };
const BASE_LEGALE = {
  cible: "entreprise", forme: "personne_morale", canal: "courriel", base: "personne_morale_adresse_impersonnelle", nature_adresse: "impersonnelle",
  preuve: { type: "source", reference: "Registre public, contact déclaré info@", date: "2026-11-08T10:00:00.000Z" },
  information: { texteArt14: "Nous avons trouvé votre adresse professionnelle dans un registre public.", moyenOpposition: "Lien de désinscription" },
  verifie_le: "2026-11-08T10:00:00.000Z", verifie_par: "systeme",
};

/** Banc en mode réel : la tâche `ISSUE` joue la porte (done, contrôle réussi), le CRM a un compte connu, la clé d'approbation est lisible sauf `secret: null`. */
function monterReel(o: { secret?: string | null } = {}) {
  const banc = creerBanc({
    mode: "reel", modeEntreprise: "reel", secret: o.secret === undefined ? PLUGIN.priveePem : o.secret,
    config: { approbationClePrivee: { type: "secret_ref", secretId: "11111111-2222-4333-8444-555555555555" }, passerelleClesPubliques: [GW.publiqueBase64] },
  });
  banc.tacheSousPorte({ status: "done", etape: null, corps: "# Prospects\n\nLot du jour." });
  banc.passe();
  banc.t.sources.push({ id: "src-crm", companyId: SOC, campagneId: CAMP, issueId: ISSUE, provenance: "connexion", mode: "reel", url: null, connexion: { service: "crm", outil: "crm_lire", compte: COMPTE, chiffres: [] } });
  const prospects = [1, 2, 3, 4].map(prospect);
  const exports: Array<Record<string, unknown>> = [];
  const etatDiffusion = (e: Record<string, unknown>) => banc.t.diffusions.find((d) => d.id === e.diffusionId)?.etat;
  Object.assign(banc.base, {
    lireMission: async (companyId: string, id: string) => (companyId === SOC && id === MISSION_WF01 ? { id, companyId: SOC, gabaritCle: "wf-01-prospection", gabaritVersion: 1, campagneId: null } : null),
    lireEtapes: async () => [
      { rang: 1, tentative: 1, role: "prospection", issueId: null, entree: { exportCrm: { service: "crm", canal: "courriel", entite: "entite-1" } } },
      { rang: 7, tentative: 1, role: "prospection", issueId: ISSUE, entree: null },
    ],
    compterAReimporter: async () => ({ prospects: 0, clients: 0, imports: 0, oppositions: 0 }),
    lireProspect: async (companyId: string, id: string) => { const p = prospects.find((x) => x.companyId === companyId && x.id === id); return p ? { ...p, empreintes: undefined, score: null, basesLegales: undefined } : null; },
    detailsProspects: async (_c: string, ids: string[]) => ({ empreintes: new Map(ids.map((id) => [id, prospects.find((p) => p.id === id)!.empreintes])), scores: new Map(), bases: new Map(ids.map((id) => [id, [BASE_LEGALE]])) }),
    oppositionsPour: async () => [],
    referentielProspection: async () => ({ renvoi: null, versionMarque: 1 }),
    empreintesProspectsEnBase: async () => [],
    clientsActuelsPour: async () => [],
    lireExportCrmParCle: async (companyId: string, c: string) => exports.find((e) => e.companyId === companyId && e.cleIdempotence === c) ?? null,
    insererExportCrm: async (e: Record<string, unknown>) => void exports.push(e),
    // Comme le SQL : l'état réel est sur la diffusion liée ; une diffusion seulement préparée ne compte pas, une ambiguë compte.
    prospectDansExportNonRefuse: async (companyId: string, id: string, service: string, mode: string, issueId: string) =>
      exports.some((e) => e.companyId === companyId && e.service === service && e.mode === mode && e.etat !== "refusee" && (etatDiffusion(e) !== "preparee" || e.issueId !== issueId) && (e.prospectIds as string[]).includes(id)),
    prospectExportConfirme: async (companyId: string, id: string, service: string, mode: string) =>
      exports.some((e) => e.companyId === companyId && e.service === service && e.mode === mode && (e.prospectIds as string[]).includes(id) && ["simulee", "confirmee"].includes(String(etatDiffusion(e)))),
    prospectExportAmbigu: async (companyId: string, id: string, service: string, mode: string) =>
      exports.some((e) => e.companyId === companyId && e.service === service && e.mode === mode && (e.prospectIds as string[]).includes(id) && etatDiffusion(e) === "ambigue_a_reconcilier"),
    lireAppelParEmpreinte: async (_c: string, _i: string, rev: string, empreinte: string) => banc.t.appels.find((a) => a.revisionId === rev && a.empreinte === empreinte) ?? null,
  });
  const services = creerServices(banc.ctx, { base: banc.base });
  // Espion de la route : ce que le moteur reçoit réellement (la preuve y figure), pour prouver qu'il ne la garde jamais.
  const recus: unknown[] = [];
  const exporter: typeof services.routes["tache.prospects.exporter"] = async (r) => {
    const rep = await services.routes["tache.prospects.exporter"]!(r);
    recus.push(rep.corps);
    return rep;
  };
  const crm = creerCrmProduction(banc.base as never, exporter!, (c, campagneId) => services.lecturesMoteur!.modeMoteur!(c, campagneId));
  const crmPourExecuteur: CrmMoteur = {
    existe: (c, _m, p) => crm.existe(c, MISSION_WF01, p),
    confirme: (c, _m, p) => crm.confirme(c, MISSION_WF01, p),
    ambigu: (c, _m, p) => crm.ambigu!(c, MISSION_WF01, p),
    ecrire: (c, e) => crm.ecrire(c, { ...e, missionId: MISSION_WF01 }),
  };
  const appelDe = (i = -1) => banc.t.appels.at(i)! as { id: string; service: string; outil: string; compte: string; empreinte: string; arguments: unknown };
  const route = (cle: string, acteur: ActeurHote, corps: unknown, params: Record<string, string> = { issueId: ISSUE }, query: Record<string, string> = {}) =>
    services.routes[cle as "tache.decision"]!({ cle: cle as never, params, query, companyId: SOC, acteur, corps });
  /** Décision humaine par la VRAIE route, sur l'appel proposé (le dernier, ou celui de rang `i`). */
  const approuver = async (i = -1) => {
    const a = appelDe(i);
    return route("tache.decision", HUMAIN, {
      revisionId: REV1, action: "approuver", commentaire: "Export du lot approuvé.",
      portee: { revisionId: REV1, action: "modifier_crm", canal: "crm", compte: a.compte, audience: null, montantMaxCents: null, dureeJours: null, appel: { id: a.id, service: a.service, outil: a.outil, compte: a.compte, empreinte: a.empreinte } },
    });
  };
  /** Ce que fait l'agent `crm-conversion` : relit l'appel désigné par la tâche dans la vraie route du dossier, puis rejoue la diffusion avec la clé donnée. */
  const rejouer = async (cle: string, appelId: string) => {
    const dossier = (await route("tache.dossier", AGENT, null, { issueId: ISSUE }, { partie: "appelsProposes" })).corps as { appelsProposes: Array<{ id: string; service: string; outil: string; compte: string; arguments: unknown; revisionId: string }> };
    const a = dossier.appelsProposes.find((x) => x.id === appelId)!;
    return route("tache.diffusions", AGENT, { revisionId: a.revisionId, action: "modifier_crm", canal: "crm", compte: a.compte, cleIdempotence: cle, service: a.service, outil: a.outil, arguments: a.arguments });
  };
  const deposer = (diffusionId: string, etat: "executee" | "ambigue_a_reconcilier") => {
    const a = appelDe();
    const reponse = emballer(
      SIGNATAIRE, "reel",
      { etat, executee: etat === "executee", message: `Action ${etat}`, cle_idempotence: cleIdempotenceSignee(diffusionId), action: { service: a.service, outil: a.outil, parametres: a.arguments } },
      { service: a.service, outil: a.outil, compte: a.compte, args: a.arguments, ecriture: true },
    );
    return route("tache.diffusions.issue", AGENT, { reponse }, { issueId: ISSUE, diffusionId });
  };
  return { banc, services, exports, recus, crm, crmPourExecuteur, appelDe, approuver, rejouer, deposer, route };
}

type Monte = ReturnType<typeof monterReel>;
/** Identifiant de l'appel à relire, donné par la description de la tâche d'exécution. */
const appelDeDescription = (c: { description?: unknown }) => /Appel à relire : (\S+)/u.exec(String(c.description))?.[1] ?? "";
const SECRET_DEMO = "Société fictive";

/** Mission WF-01 menée jusqu'à l'export réel (lot P1, P2 sauf précision), l'approbation de la porte donnée. */
async function missionReelle(m: Monte, lot = [P1, P2]) {
  const t = await jusquAutorisation({ crm: m.crmPourExecuteur, lot });
  t.approuver();
  await t.executeur.surDoneNatif(SOC_WF01, t.issue);
  const passes = async (n = 5) => { for (let i = 0; i < n; i++) await t.executeur.reprendre(SOC_WF01); };
  const porte = t.issueDuRang(7);
  const commentairesPorte = () => t.commentaires.filter((c) => c.issueId === porte).map((c) => c.body);
  const tachesExecution = () => t.creations.filter((c) => String(c.originId).includes(":diffusion:"));
  const blocage = () => t.journal.filter((j) => j.type === "moteur.blocage").at(-1)?.donnees;
  return { ...t, passes, porte, commentairesPorte, tachesExecution, blocage };
}

describe("export CRM réel de WF-01 : l'agent crm-conversion exécute la preuve signée", () => {
  it("sans décision : un seul commentaire sur la porte après cinq passes, aucun essai consommé, ni dénomination ni coordonnée", async () => {
    const m = monterReel();
    const t = await missionReelle(m);
    await t.passes(5);
    const commentaires = t.commentairesPorte();
    expect(commentaires).toHaveLength(1);
    expect(commentaires[0]).toContain("crm");
    expect(commentaires[0]).toContain(m.appelDe().id);
    expect(commentaires[0]).toMatch(/2 prospects/u);
    expect(commentaires[0]).toContain("à approuver dans la décision de cette tâche");
    expect(commentaires[0]).not.toContain(SECRET_DEMO);
    for (const p of [1, 2]) expect(commentaires[0]).not.toContain(h(p));
    expect(t.etapes.find((e) => e.rang === 9)).toMatchObject({ etat: "en_cours", sortie: { essais: 0, enAttente: true } });
    expect(t.etat()).toBe("en_execution");
  });

  it("avec la décision humaine (vraie route) : une seule tâche pour crm-conversion, un seul réveil, la mission reste en exécution, jamais absents_du_crm", async () => {
    const m = monterReel();
    const t = await missionReelle(m);
    await t.passes(2);
    expect((await m.approuver()).statut).toBe(201);
    await t.passes(5);
    const taches = t.tachesExecution();
    expect(taches).toHaveLength(1);
    expect(taches[0]).toMatchObject({ status: "todo", assigneeAgentId: AGENT_CRM });
    const tacheId = [...t.issues.values()].find((i) => i.originId === taches[0]!.originId)!.id as string;
    expect(t.reveils.filter((r) => r === tacheId)).toHaveLength(1);
    expect(t.etat()).toBe("en_execution");
    expect(t.journal.some((j) => j.type === "moteur.blocage")).toBe(false);
    expect(JSON.stringify(t.journal)).not.toContain("absents_du_crm");
    expect(m.banc.t.diffusions).toHaveLength(1);
    expect(m.banc.t.diffusions[0]).toMatchObject({ action: "modifier_crm", etat: "preparee" });
    expect(String(taches[0]!.description)).toContain(t.porte);
    expect(String(taches[0]!.description)).not.toContain(SECRET_DEMO);
  });

  it("bout en bout : l'agent rejoue, dépose la réponse signée executee, la diffusion est confirmée, la mission se clôt (rangs 9 et 10 terminés)", async () => {
    const m = monterReel();
    const t = await missionReelle(m);
    await t.passes(2);
    await m.approuver();
    await t.passes(2);
    const cle = /clé d'idempotence : (\S+)/u.exec(String(t.tachesExecution()[0]!.description))![1]!;
    const diffusionId = m.banc.t.diffusions[0]!.id as string;
    const reponseRejeu = await m.rejouer(cle, appelDeDescription(t.tachesExecution()[0]!));
    expect(reponseRejeu.statut).toBe(200);
    const rejeu = reponseRejeu.corps as { etat: string; preuveApprobation: string };
    expect(rejeu.etat).toBe("preparee");
    expect(rejeu.preuveApprobation).toBeTruthy();
    expect(VERIFICATEUR.verifier(rejeu.preuveApprobation, { service: "crm", outil: m.appelDe().outil, args: m.appelDe().arguments as Record<string, unknown>, compte: m.appelDe().compte, maintenantS: Math.floor(Date.now() / 1000) }).ok).toBe(true);
    expect(((await m.deposer(diffusionId, "executee")).corps as { etat: string }).etat).toBe("confirmee");
    await t.passes(1);
    expect(t.etat()).toBe("cloturee");
    expect(t.etapes.find((e) => e.rang === 9)).toMatchObject({ etat: "terminee", sortie: { reussis: [P1, P2], echecs: [] } });
    expect(t.etapes.find((e) => e.rang === 10)).toMatchObject({ etat: "terminee", sortie: { verifies: 2 } });
    expect(m.banc.t.diffusions).toHaveLength(1);
    expect(t.tachesExecution()).toHaveLength(1);
  });

  it("la preuve (rejeu de l'agent et réponse reçue par le moteur) n'est ni dans les étapes, ni dans le journal, ni dans les commentaires, ni dans les tâches", async () => {
    const m = monterReel();
    const t = await missionReelle(m);
    await t.passes(1);
    await m.approuver();
    await t.passes(3);
    const cle = /clé d'idempotence : (\S+)/u.exec(String(t.tachesExecution()[0]!.description))![1]!;
    const jetons = [((await m.rejouer(cle, appelDeDescription(t.tachesExecution()[0]!))).corps as { preuveApprobation: string }).preuveApprobation];
    for (const r of m.recus) { const d = (r as { diffusion?: { preuveApprobation?: string | null } }).diffusion; if (d?.preuveApprobation) jetons.push(d.preuveApprobation); }
    // Le moteur a bien reçu une preuve non vide de la route, qu'il a jetée.
    expect(jetons.length).toBeGreaterThanOrEqual(2);
    for (const jeton of jetons) {
      expect(jeton.length).toBeGreaterThan(20);
      const tout = JSON.stringify({ etapes: t.etapes, journal: t.journal, commentaires: t.commentaires, taches: [...t.issues.values()], banc: m.banc.t.journal });
      expect(tout).not.toContain(jeton);
      expect(tout).not.toContain(jeton.split(".").at(-1)!);
    }
  });

  it("réponse ambigue_a_reconcilier : blocage export_a_reconcilier, aucun nouvel export, aucune nouvelle diffusion, aucune seconde tâche", async () => {
    const m = monterReel();
    const t = await missionReelle(m);
    await t.passes(1);
    await m.approuver();
    await t.passes(2);
    const diffusionId = m.banc.t.diffusions[0]!.id as string;
    expect(((await m.deposer(diffusionId, "ambigue_a_reconcilier")).corps as { etat: string }).etat).toBe("ambigue_a_reconcilier");
    await t.passes(4);
    expect(t.etat()).toBe("blocage");
    expect(t.blocage()).toMatchObject({ raison: "export_a_reconcilier" });
    expect(m.exports.filter((e) => e.etat !== "refusee")).toHaveLength(1);
    expect(m.banc.t.diffusions).toHaveLength(1);
    expect(t.tachesExecution()).toHaveLength(1);
  });

  it("clé d'approbation absente : préparée sans preuve, blocage preuve_non_signee avec le motif, aucune tâche d'exécution", async () => {
    const m = monterReel({ secret: null });
    const t = await missionReelle(m);
    await t.passes(1);
    await m.approuver();
    await t.passes(3);
    expect(t.etat()).toBe("blocage");
    expect(t.blocage()).toMatchObject({ raison: "preuve_non_signee", motif: expect.stringMatching(/clé d'approbation indisponible/u) });
    expect(t.tachesExecution()).toHaveLength(0);
  });

  it("diffusion révoquée : blocage preuve_revoquee ; charge expirée : blocage preuve_expiree", async () => {
    for (const [cas, raison] of [["revoquee", "preuve_revoquee"], ["expiree", "preuve_expiree"]] as const) {
      const m = monterReel();
      const t = await missionReelle(m);
      await t.passes(1);
      await m.approuver();
      await t.passes(2);
      expect(t.tachesExecution()).toHaveLength(1);
      const d = m.banc.t.diffusions[0]!;
      if (cas === "revoquee") Object.assign(d, { revoqueeLe: m.banc.horloge(), revocationMotif: "Décision remplacée" });
      else (d.preuveCharge as { expire: number }).expire = 1;
      await t.passes(3);
      expect(t.etat()).toBe("blocage");
      expect(t.blocage()).toMatchObject({ raison });
    }
  });

  it("agent crm-conversion absent : blocage agent_crm_absent, aucune tâche", async () => {
    const m = monterReel();
    const t = await missionReelle(m);
    const resoudre = t.hote.resoudreAgent;
    t.hote.resoudreAgent = async (c: string, role: string) => (role === "crm-conversion" ? (null as never) : resoudre(c, role));
    await t.passes(1);
    await m.approuver();
    await t.passes(3);
    expect(t.etat()).toBe("blocage");
    expect(t.blocage()).toMatchObject({ raison: "agent_crm_absent" });
    expect(t.tachesExecution()).toHaveLength(0);
  });

  it("décision consommée : un nouveau lot rend 202 sans diffusion refusée et un nouveau commentaire ; une nouvelle décision le fait partir", async () => {
    const m = monterReel();
    const t = await missionReelle(m);
    await t.passes(1);
    await m.approuver();
    await t.passes(2);
    expect(m.banc.t.diffusions).toHaveLength(1);
    expect(t.commentairesPorte()).toHaveLength(1);
    // Nouveau lot (autre contenu, donc autre clé et autre appel) sous la même décision, déjà utilisée.
    t.etapesCode.lot = async () => [P1, P2, P4].map((prospectId) => ({ prospectId, marqueOpposition: false }));
    await t.passes(3);
    expect(m.banc.t.diffusions).toHaveLength(1);
    expect(m.banc.t.diffusions.filter((d) => d.etat === "refusee")).toHaveLength(0);
    expect(m.exports.filter((e) => e.etat === "refusee")).toHaveLength(0);
    expect(t.commentairesPorte()).toHaveLength(2);
    expect(t.commentairesPorte()[1]).toContain(m.appelDe().id);
    expect(t.etat()).toBe("en_execution");
    await m.approuver();
    await t.passes(2);
    expect(m.banc.t.diffusions).toHaveLength(2);
    expect(t.tachesExecution()).toHaveLength(2);
  });

  it("décision consommée (route seule) : réponse 202 en_attente_approbation, rien d'inséré, consigne qui dit que l'approbation a déjà servi", async () => {
    const m = monterReel();
    const exporterBrut = (ids: string[], cle: string) => m.services.routes["tache.prospects.exporter"]!({
      cle: "tache.prospects.exporter", params: { issueId: ISSUE }, query: {}, companyId: SOC,
      acteur: { type: "systeme", id: "moteur-missions", agentId: null, userId: null, runId: null }, corps: { prospectIds: ids, service: "crm", canal: "courriel", entite: "entite-1", cleIdempotence: cle },
    });
    await exporterBrut([P1, P2], "moteur:lot-a");
    await m.approuver();
    expect((await exporterBrut([P1, P2], "moteur:lot-a")).statut).toBe(201);
    const avant = m.exports.length;
    const r = await exporterBrut([P1, P4], "moteur:lot-b");
    expect(r.statut).toBe(202);
    expect(r.corps).toMatchObject({ etat: "en_attente_approbation", consigne: expect.stringMatching(/déjà servi/u) });
    expect(m.exports).toHaveLength(avant);
    expect(m.banc.t.diffusions).toHaveLength(1);
    // Une nouvelle décision, sur le nouvel appel, débloque ce lot.
    await m.approuver();
    expect((await exporterBrut([P1, P4], "moteur:lot-b")).statut).toBe(201);
    expect(m.banc.t.diffusions).toHaveLength(2);
  });

  it("décision humaine de refus : la route rend 202 avec decisionRefusee, le moteur bloque en decision_refusee avec la consigne, sans tâche d'exécution", async () => {
    const m = monterReel();
    const t = await missionReelle(m);
    await t.passes(1);
    expect(t.etat()).toBe("en_execution");
    await m.route("tache.decision", HUMAIN, { revisionId: REV1, action: "demander_correction", commentaire: "Revoir le lot.", portee: null });
    await t.passes(3);
    expect(t.etat()).toBe("blocage");
    expect(t.blocage()).toMatchObject({ raison: "decision_refusee", motif: expect.stringMatching(/approuver/u) });
    expect(t.tachesExecution()).toHaveLength(0);
  });

  it("decisionRefusee seulement pour un refus : ni sans décision, ni pour une approbation d'une autre portée", async () => {
    const m = monterReel();
    const exporterBrut = () => m.services.routes["tache.prospects.exporter"]!({
      cle: "tache.prospects.exporter", params: { issueId: ISSUE }, query: {}, companyId: SOC,
      acteur: { type: "systeme", id: "moteur-missions", agentId: null, userId: null, runId: null }, corps: { prospectIds: [P1, P2], service: "crm", canal: "courriel", entite: "entite-1", cleIdempotence: "moteur:lot-a" },
    });
    const sans = await exporterBrut();
    expect(sans.statut).toBe(202);
    expect((sans.corps as Record<string, unknown>).decisionRefusee).toBeUndefined();
    await m.route("tache.decision", HUMAIN, { revisionId: REV1, action: "approuver", commentaire: "Contenu approuvé.", portee: { revisionId: REV1, action: "aucune_action_externe", canal: null, compte: null, audience: null, montantMaxCents: null, dureeJours: null } });
    const autre = await exporterBrut();
    expect(autre.statut).toBe(202);
    expect((autre.corps as Record<string, unknown>).decisionRefusee).toBeUndefined();
    await m.route("tache.decision", HUMAIN, { revisionId: REV1, action: "demander_correction", commentaire: "Revoir le lot.", portee: null });
    const refus = await exporterBrut();
    expect(refus.statut).toBe(202);
    expect(refus.corps).toMatchObject({ etat: "en_attente_approbation", decisionRefusee: true });
  });

  it("tâche d'exécution terminée ou annulée alors que la diffusion reste préparée : blocage execution_crm_sans_issue, ni nouveau réveil ni nouvelle tâche", async () => {
    for (const statut of ["done", "cancelled"]) {
      const m = monterReel();
      const t = await missionReelle(m);
      await t.passes(1);
      await m.approuver();
      await t.passes(2);
      const tache = [...t.issues.values()].find((i) => i.originId === t.tachesExecution()[0]!.originId)!;
      const reveilsAvant = t.reveils.filter((r) => r === tache.id).length;
      tache.status = statut;
      await t.passes(4);
      expect(t.etat()).toBe("blocage");
      expect(t.blocage()).toMatchObject({ raison: "execution_crm_sans_issue", tacheId: tache.id });
      expect(t.reveils.filter((r) => r === tache.id)).toHaveLength(reveilsAvant);
      expect(t.tachesExecution()).toHaveLength(1);
    }
  });

  it("arrêt entre l'insertion de la diffusion et celle de l'export : le rejeu de la même clé retrouve la diffusion (200), sans seconde diffusion", async () => {
    const m = monterReel();
    const exp = () => m.services.routes["tache.prospects.exporter"]!({
      cle: "tache.prospects.exporter", params: { issueId: ISSUE }, query: {}, companyId: SOC,
      acteur: { type: "systeme", id: "moteur-missions", agentId: null, userId: null, runId: null }, corps: { prospectIds: [P1, P2], service: "crm", canal: "courriel", entite: "entite-1", cleIdempotence: "moteur:lot-a" },
    });
    await exp();
    await m.approuver();
    const base = m.banc.base as unknown as { insererExportCrm: (e: unknown) => Promise<void> };
    const vrai = base.insererExportCrm;
    base.insererExportCrm = async () => { throw new Error("arrêt simulé"); };
    await expect(exp()).rejects.toThrow("arrêt simulé");
    base.insererExportCrm = vrai;
    const r = await exp();
    expect(r.statut).toBe(200);
    expect(r.corps).toMatchObject({ etat: "preparee" });
    expect(m.banc.t.diffusions).toHaveLength(1);
    expect(m.exports).toHaveLength(1);
  });

  it("deux lots successifs : chaque tâche d'exécution est réveillée une fois (le réveil est distinct par diffusion)", async () => {
    const m = monterReel();
    const t = await missionReelle(m);
    await t.passes(1);
    await m.approuver();
    await t.passes(2);
    t.etapesCode.lot = async () => [P1, P2, P4].map((prospectId) => ({ prospectId, marqueOpposition: false }));
    await t.passes(3);
    await m.approuver();
    await t.passes(2);
    const taches = t.tachesExecution().map((c) => [...t.issues.values()].find((i) => i.originId === c.originId)!.id as string);
    expect(taches).toHaveLength(2);
    for (const id of taches) expect(t.reveils.filter((r) => r === id)).toHaveLength(1);
  });

  it("la tâche d'exécution désigne l'appel exact à relire dans sa description", async () => {
    const m = monterReel();
    const t = await missionReelle(m);
    await t.passes(1);
    await m.approuver();
    await t.passes(2);
    expect(t.tachesExecution()).toHaveLength(1);
    expect(String(t.tachesExecution()[0]!.description)).toContain(`Appel à relire : ${m.appelDe().id}`);
  });

  it("l'appel à relire est retrouvé au rejeu de la clé (la route ne le rend plus) ; introuvable : blocage appel_introuvable, aucune exécution", async () => {
    const m = monterReel();
    const lot = [P1, P2].map((prospectId) => ({ prospectId, marqueOpposition: false }));
    const passe = () => exporterLot({ crm: m.crm, base: baseExec() as never }, { companyId: SOC, id: MISSION_WF01 }, 9, lot);
    await passe();
    await m.approuver();
    const premier = await passe();
    expect(premier.execution).toMatchObject({ appelId: m.appelDe().id });
    expect(await passe()).toMatchObject({ execution: { appelId: m.appelDe().id } });
    m.banc.t.appels.length = 0;
    expect(await passe()).toMatchObject({ execution: null, blocage: { raison: "appel_introuvable" } });
  });

  it("le commentaire de l'appel compte les prospects restants à exporter, pas le lot entier", async () => {
    const lot = [P1, P2, P4].map((prospectId) => ({ prospectId, marqueOpposition: false }));
    const crm: CrmMoteur = {
      existe: async (_c, _m, p) => p === P1,
      confirme: async () => false,
      ecrire: async () => ({ etat: "en_attente", appelId: "appel-1", consigne: null }),
    };
    const r = await exporterLot({ crm, base: baseExec() as never }, { companyId: SOC, id: MISSION_WF01 }, 9, lot);
    expect(r.attente).toEqual({ appelId: "appel-1", consigne: null, prospects: 2 });
  });

  it("exporterLot : une diffusion préparée rend « execution » (clé et prospects) sans marquer l'exécution appliquée ni écrire de nouveau au rejeu", async () => {
    const m = monterReel();
    await exporterLot({ crm: m.crm, base: baseExec() as never }, { companyId: SOC, id: MISSION_WF01 }, 9, [P1, P2].map((prospectId) => ({ prospectId, marqueOpposition: false }))).then((r) => expect(r.attente).not.toBeNull());
    await m.approuver();
    const base = baseExec();
    const lot = [P1, P2].map((prospectId) => ({ prospectId, marqueOpposition: false }));
    const un = await exporterLot({ crm: m.crm, base: base as never }, { companyId: SOC, id: MISSION_WF01 }, 9, lot);
    expect(un.execution?.appelId).toBe(m.appelDe().id);
    expect(un).toMatchObject({ reussis: [], echecs: [], attente: null, blocage: null, execution: { prospectIds: [P1, P2], cleDiffusion: expect.stringMatching(/^export:moteur:/u) } });
    const deux = await exporterLot({ crm: m.crm, base: base as never }, { companyId: SOC, id: MISSION_WF01 }, 9, lot);
    expect(deux.execution).toEqual(un.execution);
    expect(m.banc.t.diffusions).toHaveLength(1);
    expect(m.exports).toHaveLength(1);
  });
});

/** Exécutions du moteur (clés d'effets externes), en mémoire. */
function baseExec() {
  const executions = new Map<string, { statut: string }>();
  return {
    lireExecution: async (_c: string, k: string) => executions.get(k) ?? null,
    enregistrerExecution: async (e: { cle: string }) => (executions.has(e.cle) ? false : (executions.set(e.cle, { statut: "demandee" }), true)),
    marquerExecution: async (_c: string, k: string, statut: string) => { const x = executions.get(k); if (x) x.statut = statut; return Boolean(x); },
  };
}
