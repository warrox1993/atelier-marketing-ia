/**
 * Moteur de missions (#69) : WF-01 en mode RÉEL jusqu'au vrai outil `crm_creer_contact` de la passerelle. Tout le plugin est réel
 * (vraies routes `creerServices`, vraie signature, vraie coordonnée déchiffrée dans l'appel approuvé) ; seuls l'hôte, la base (copies en
 * mémoire) et l'agent sont simulés. L'appel de l'agent part par le serveur MCP de la passerelle (code réel, clé publique d'approbation = celle
 * du plugin), contre le faux HubSpot : le faux serveur doit recevoir le contact avec sa vraie coordonnée.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerCrmProduction } from "../src/moteur/branchement.js";
import type { CrmMoteur } from "../src/moteur/export-crm.js";
import { creerServices } from "../src/serveur/services.js";
import { CAMP, ISSUE, REV1, SOC, creerBanc } from "./outils-base.js";
import { avecClesDonnees, REFS_CLES } from "./outils-cles-donnees.js";
import { paireEd25519, passerelle } from "./outils-passerelle.js";
import { P1, P2, SOC as SOC_WF01, jusquAutorisation } from "./moteur-wf01-doubles.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Montage { faux: { effets: Array<{ type: string; donnees: Record<string, any> }>; appels: unknown[] }; arreter(): Promise<void> }
interface ClientMcp { callTool(a: { name: string; arguments: Record<string, unknown> }): Promise<Record<string, any>>; close(): Promise<void> }
interface Aide {
  monter(o: { signataire: unknown; clePubliqueApprobation: string }): Promise<Montage>;
  connecter(m: Montage, service: string): Promise<{ jetons: { access_token: string } }>;
  clientMcp(m: Montage, service: string, jeton: string): Promise<ClientMcp>;
}

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const P = await passerelle();
const aide = (await import(/* @vite-ignore */ resolve(RACINE, "passerelle/tests/reel-social-crm/aide.ts"))) as Aide;
const PLUGIN = paireEd25519();
const GW = paireEd25519();
const MISSION_WF01 = "mission-wf01";
/** Identifiant du portail du faux HubSpot : le compte que la passerelle vérifie dans la preuve. */
const COMPTE = "1234567";
const AGENT_CRM = "agent-crm-conversion";
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const AGENT: ActeurHote = { type: "agent", id: AGENT_CRM, agentId: AGENT_CRM, userId: null, runId: "run-crm" };
const BASE_LEGALE = {
  cible: "entreprise", forme: "personne_morale", canal: "courriel", base: "personne_morale_adresse_impersonnelle", nature_adresse: "impersonnelle",
  preuve: { type: "source", reference: "Registre public, contact déclaré info@", date: "2026-11-08T10:00:00.000Z" },
  information: { texteArt14: "Nous avons trouvé votre adresse professionnelle dans un registre public.", moyenOpposition: "Lien de désinscription" },
  verifie_le: "2026-11-08T10:00:00.000Z", verifie_par: "systeme",
};

let montage: Montage;
let outil: ClientMcp;
beforeAll(async () => {
  montage = await aide.monter({ signataire: new P.SignataireEnveloppe(GW.privee), clePubliqueApprobation: PLUGIN.publiquePem });
  outil = await aide.clientMcp(montage, "crm", (await aide.connecter(montage, "crm")).jetons.access_token);
});
afterAll(async () => {
  await outil.close();
  await montage.arreter();
});

/** Banc en mode réel (comme moteur-wf01-preuve-reelle.spec.ts) : la tâche `ISSUE` joue la porte, le CRM a pour compte celui du faux HubSpot. */
async function monterReel() {
  const { prospect } = await import("./moteur-wf01-doubles.js");
  const banc = creerBanc({
    mode: "reel", modeEntreprise: "reel", secret: PLUGIN.priveePem,
    config: { approbationClePrivee: { type: "secret_ref", secretId: "11111111-2222-4333-8444-555555555555" }, passerelleClesPubliques: [GW.publiqueBase64], ...REFS_CLES },
  });
  avecClesDonnees(banc.ctx);
  banc.tacheSousPorte({ status: "done", etape: null, corps: "# Prospects\n\nLot du jour." });
  banc.passe();
  banc.t.sources.push({ id: "src-crm", companyId: SOC, campagneId: CAMP, issueId: ISSUE, provenance: "connexion", mode: "reel", url: null, connexion: { service: "crm", outil: "crm_lire", compte: COMPTE, chiffres: [] } });
  const prospects = [1, 2].map(prospect);
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
    prospectDansExportNonRefuse: async (companyId: string, id: string, service: string, mode: string, issueId: string) =>
      exports.some((e) => e.companyId === companyId && e.service === service && e.mode === mode && e.etat !== "refusee" && (etatDiffusion(e) !== "preparee" || e.issueId !== issueId) && (e.prospectIds as string[]).includes(id)),
    prospectExportConfirme: async (companyId: string, id: string, service: string, mode: string) =>
      exports.some((e) => e.companyId === companyId && e.service === service && e.mode === mode && (e.prospectIds as string[]).includes(id) && ["simulee", "confirmee"].includes(String(etatDiffusion(e)))),
    prospectExportAmbigu: async (companyId: string, id: string, service: string, mode: string) =>
      exports.some((e) => e.companyId === companyId && e.service === service && e.mode === mode && (e.prospectIds as string[]).includes(id) && etatDiffusion(e) === "ambigue_a_reconcilier"),
    lireAppelParEmpreinte: async (_c: string, _i: string, rev: string, empreinte: string) => banc.t.appels.find((a) => a.revisionId === rev && a.empreinte === empreinte) ?? null,
  });
  const services = creerServices(banc.ctx, { base: banc.base });
  const crm = creerCrmProduction(banc.base as never, services.routes["tache.prospects.exporter"]!, (c, campagneId) => services.lecturesMoteur!.modeMoteur!(c, campagneId));
  const crmPourExecuteur: CrmMoteur = {
    existe: (c, _m, p) => crm.existe(c, MISSION_WF01, p),
    confirme: (c, _m, p) => crm.confirme(c, MISSION_WF01, p),
    ambigu: (c, _m, p) => crm.ambigu!(c, MISSION_WF01, p),
    ecrire: (c, e) => crm.ecrire(c, { ...e, missionId: MISSION_WF01 }),
  };
  const route = (cle: string, acteur: ActeurHote, corps: unknown, params: Record<string, string> = { issueId: ISSUE }, query: Record<string, string> = {}) =>
    services.routes[cle as "tache.decision"]!({ cle: cle as never, params, query, companyId: SOC, acteur, corps });
  /** Ce que l'agent relit : l'appel proposé par le dossier (arguments en clair, tels que signés). */
  const appelPropose = async () => {
    const dossier = (await route("tache.dossier", AGENT, null, { issueId: ISSUE }, { partie: "appelsProposes" })).corps as { appelsProposes: Array<{ id: string; service: string; outil: string; compte: string; revisionId: string; arguments: Record<string, unknown>; empreinte: string }> };
    return dossier.appelsProposes.at(-1)!;
  };
  const approuver = async () => {
    const a = await appelPropose();
    return route("tache.decision", HUMAIN, {
      revisionId: REV1, action: "approuver", commentaire: "Export du lot approuvé.",
      portee: { revisionId: REV1, action: "modifier_crm", canal: "crm", compte: a.compte, audience: null, montantMaxCents: null, dureeJours: null, appel: { id: a.id, service: a.service, outil: a.outil, compte: a.compte, empreinte: a.empreinte } },
    });
  };
  /** Rejeu de l'agent crm-conversion : la diffusion préparée rend la preuve signée (re-signée à l'identique à chaque passage). */
  const rejouer = async (cle: string) => {
    const a = await appelPropose();
    return route("tache.diffusions", AGENT, { revisionId: a.revisionId, action: "modifier_crm", canal: "crm", compte: a.compte, cleIdempotence: cle, service: a.service, outil: a.outil, arguments: a.arguments });
  };
  const revocations = async () => String(((await route("preuves.revocations", AGENT, null, {})).corps as { liste: string }).liste);
  return { banc, crmPourExecuteur, route, appelPropose, approuver, rejouer, revocations };
}

const hubspotCreations = () => montage.faux.effets.filter((e) => e.type === "hubspot_creation").map((e) => e.donnees);

describe("WF-01 réel : la mission se clôt par le vrai outil crm_creer_contact de la passerelle contre le faux HubSpot", () => {
  it("le faux CRM reçoit les deux contacts avec leur vraie coordonnée, un second passage de l'agent ne crée aucun doublon, la mission est clôturée", async () => {
    const m = await monterReel();
    const t = await jusquAutorisation({ crm: m.crmPourExecuteur, lot: [P1, P2] });
    t.approuver();
    await t.executeur.surDoneNatif(SOC_WF01, t.issue);
    const passes = async (n: number) => { for (let i = 0; i < n; i++) await t.executeur.reprendre(SOC_WF01); };
    await passes(2);
    expect((await m.approuver()).statut).toBe(201);
    await passes(2);
    const tache = t.creations.filter((c) => String(c.originId).includes(":diffusion:"));
    expect(tache).toHaveLength(1);
    const cle = /clé d'idempotence : (\S+)/u.exec(String(tache[0]!.description))![1]!;
    const diffusionId = m.banc.t.diffusions[0]!.id as string;

    // Appel de l'agent par le VRAI outil : arguments relus au dossier (clair exact signé), preuve du rejeu, liste de révocation du plugin.
    const appel = await m.appelPropose();
    expect(appel.outil).toBe("crm_creer_contact");
    const appelerOutil = async () => {
      const rejeu = (await m.rejouer(cle)).corps as { etat: string; preuveApprobation: string | null };
      expect(rejeu.etat).toBe("preparee");
      expect(rejeu.preuveApprobation).toBeTruthy();
      const r = await outil.callTool({ name: appel.outil, arguments: { ...appel.arguments, preuve_approbation: rejeu.preuveApprobation, revocations_approbation: await m.revocations() } });
      return { texte: (r["content"] as Array<{ text: string }>)[0]!.text, structuredContent: r["structuredContent"] as Record<string, any>, erreur: r["isError"] === true };
    };
    const premier = await appelerOutil();
    expect(premier.erreur, premier.texte).toBe(false);
    expect(premier.structuredContent).toMatchObject({ etat: "executee", executee: true, rejeu: false, resultat: { crees: [{ reference: P1 }, { reference: P2 }], existants: [] } });
    // Le faux HubSpot a reçu la VRAIE coordonnée (jamais l'empreinte) et la dénomination.
    expect(hubspotCreations()).toHaveLength(2);
    expect(hubspotCreations()).toEqual([
      expect.objectContaining({ email: "contact1@exemple.invalid", lastname: "Société fictive 1", zip: "4000" }),
      expect.objectContaining({ email: "contact2@exemple.invalid", lastname: "Société fictive 2", zip: "4000" }),
    ]);
    expect(JSON.stringify(premier.structuredContent)).not.toContain("exemple.invalid");

    // L'agent est relancé avant d'avoir déposé la réponse : nouvelle preuve pour la même clé, même effet, aucun doublon dans le CRM.
    const appelsAvant = montage.faux.appels.length;
    const second = await appelerOutil();
    expect(second.structuredContent).toMatchObject({ etat: "executee", rejeu: true });
    expect(hubspotCreations()).toHaveLength(2);
    expect(montage.faux.appels.length).toBe(appelsAvant);

    // L'agent dépose la réponse signée de la passerelle : diffusion confirmée, mission clôturée.
    const depot = await m.route("tache.diffusions.issue", AGENT, { reponse: { texte: premier.texte, structuredContent: premier.structuredContent } }, { issueId: ISSUE, diffusionId });
    expect((depot.corps as { etat: string }).etat).toBe("confirmee");
    await passes(1);
    expect(t.etat()).toBe("cloturee");
    expect(t.etapes.find((e) => e.rang === 9)).toMatchObject({ etat: "terminee", sortie: { reussis: [P1, P2], echecs: [] } });
    expect(hubspotCreations()).toHaveLength(2);
    expect(m.banc.t.diffusions).toHaveLength(1);
  });
});
