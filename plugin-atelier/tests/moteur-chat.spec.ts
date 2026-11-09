/**
 * Chat sans modèle (#50, tâche 2) : questions d'état répondues depuis la base, demande de contenu transformée en brouillon
 * de mission avec une carte de confirmation. Seam : la route `discussion.envoyer` avec un hôte double qui refuse, comme le
 * vrai, toute lecture ou écriture sur une tâche d'une autre entreprise.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { reconnaitreDemandeContenu, reconnaitreQuestionEtat } from "../src/moteur/questions-etat.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { BaseAtelier, Mission } from "../src/serveur/base.js";
import { ORIGINE_DISCUSSION, routesDiscussion } from "../src/serveur/services-discussion.js";
import { SOC } from "./outils-base.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const COORD = id(1);

const mission = (p: Partial<Mission> = {}): Mission => ({
  id: id(700), companyId: SOC, gabaritCle: "wf-c-contenu", gabaritVersion: 1, contratId: "wf-c-contenu", contratVersion: 1, mandat: "Post de lancement LinkedIn",
  etat: "en_cours", etatAvantPause: null, rangCourant: 1, enveloppeCents: 0, campagneId: null, issueRacineId: null, cycleBlocage: 0, creeLe: "2026-11-08T08:00:00.000Z", modifieLe: "2026-11-08T08:00:00.000Z", ...p,
});

interface Options { config?: Ligne | null; missions?: Mission[]; couts?: { totalCents: number; evenements: number }; lectureMissionsEchoue?: boolean }

function faux(o: Options = {}) {
  const trace: string[] = [];
  const issues: Ligne[] = [];
  const commentaires: Ligne[] = [];
  const interactions: Ligne[] = [];
  const missions: Mission[] = [...(o.missions ?? [])];
  const creees: Ligne[] = [];
  const journal: Ligne[] = [];
  let n = 0;
  const dehors = (companyId: string) => {
    if (companyId !== SOC) throw new Error("hôte : tâche d'une autre entreprise");
  };
  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    config: { get: async () => (o.config === undefined ? { moteurMissions: true } : o.config) },
    agents: { list: async () => [{ id: COORD, name: "Coordinateur", role: "ceo", status: "idle" }], get: async () => ({ id: COORD, name: "Coordinateur" }) },
    issues: {
      list: async (f: Ligne) => issues.filter((i) => i.companyId === f.companyId && i.originKind === f.originKind),
      get: async (issueId: string, companyId: string) => issues.find((i) => i.id === issueId && i.companyId === companyId) ?? null,
      create: async (input: Ligne) => {
        const issue = { id: id(100 + issues.length), identifier: `DEM-${issues.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...input };
        issues.push(issue);
        return issue;
      },
      update: async (issueId: string, patch: Ligne) => {
        trace.push(`update:${JSON.stringify(patch)}`);
        Object.assign(issues.find((i) => i.id === issueId)!, patch);
      },
      listInteractions: async (issueId: string, companyId: string) => {
        dehors(companyId);
        return interactions.filter((c) => c.issueId === issueId);
      },
      listComments: async (issueId: string) => commentaires.filter((c) => c.issueId === issueId),
      createComment: async (issueId: string, body: string, companyId: string, opt?: Ligne) => {
        dehors(companyId);
        trace.push("createComment");
        const c = { id: id(500 + n++), issueId, companyId, body, authorType: opt?.authorAgentId ? "agent" : "system", authorAgentId: opt?.authorAgentId ?? null, createdAt: new Date() };
        commentaires.push(c);
        return c;
      },
      requestConfirmation: async (issueId: string, interaction: Ligne, companyId: string) => {
        dehors(companyId);
        trace.push("requestConfirmation");
        const carte = { id: id(800 + interactions.length), issueId, companyId, kind: "request_confirmation", status: "pending", ...interaction };
        interactions.push(carte);
        return carte;
      },
      requestWakeup: async () => {
        trace.push("requestWakeup");
        return { queued: true, runId: "run-1" };
      },
    },
  } as unknown as PluginContext;
  const base = {
    journaliser: async (e: Ligne) => void journal.push(e),
    missionsActives: async () => {
      if (o.lectureMissionsEchoue) throw new Error("base indisponible");
      return missions.filter((m) => !["cloturee", "annulee", "echec"].includes(m.etat));
    },
    lireEtapes: async () => [],
    coutsEntreprise: async () => o.couts ?? { totalCents: 0, evenements: 0 },
    creerMission: async (m: Ligne) => {
      trace.push("creerMission");
      creees.push(m);
      const neuve = mission({ ...m, id: id(900 + creees.length), etat: m.etat ?? "prete", rangCourant: 0 });
      missions.push(neuve);
      return neuve.id;
    },
  } as unknown as BaseAtelier;
  const routes = routesDiscussion({ ctx, base });
  const envoyer = (texte: string) =>
    routes["discussion.envoyer"]!({ cle: "discussion.envoyer", params: {}, query: {}, corps: { companyId: SOC, texte }, acteur: HUMAIN, companyId: SOC } as RequeteRoute);
  const reponses = () => commentaires.filter((c) => c.authorAgentId === COORD).map((c) => c.body as string);
  const statuts = () => trace.filter((t) => t.startsWith("update:") && t.includes('"status"'));
  return { envoyer, trace, issues, commentaires, interactions, creees, journal, reponses, statuts, missions };
}

describe("reconnaitreQuestionEtat", () => {
  it.each([
    ["Où en est la mission ?", "avancement"],
    ["où en est-on ?", "avancement"],
    ["Qu'est-ce qui attend ?", "en_attente"],
    ["Qu’est-ce qui attend ?", "en_attente"],
    ["qu’est-ce qui est en attente", "en_attente"],
    ["Combien ça a coûté ?", "cout"],
    ["combien ça coûte ?", "cout"],
  ])("%s -> %s", (texte, type) => {
    expect(reconnaitreQuestionEtat(texte)).toBe(type);
  });

  it.each([
    "Où en est la mission de Paul avec le client Durand, et peux-tu relancer le contrat ?",
    "Combien de posts as-tu écrits ?",
    "Analyse la concurrence",
    "Qu'est-ce qui attend dans le frigo ?",
    "",
  ])("doute ou autre sujet : %s -> null", (texte) => {
    expect(reconnaitreQuestionEtat(texte)).toBeNull();
  });
});

describe("reconnaitreDemandeContenu", () => {
  it("reconnaît écris, rédige, prépare avec post, article ou newsletter ; déduit seulement ce que le texte nomme", () => {
    expect(reconnaitreDemandeContenu("Écris-moi un post sur LinkedIn")).toEqual({ typeLivrable: "post", canal: "linkedin" });
    expect(reconnaitreDemandeContenu("Rédige un article")).toEqual({ typeLivrable: "article" });
    expect(reconnaitreDemandeContenu("Prépare une newsletter")).toEqual({ typeLivrable: "newsletter" });
  });
  it("laisse passer ce qui n'est pas une demande de contenu nommée", () => {
    expect(reconnaitreDemandeContenu("Analyse la concurrence")).toBeNull();
    expect(reconnaitreDemandeContenu("Écris-moi un courriel")).toBeNull();
    expect(reconnaitreDemandeContenu("As-tu vu mon post ?")).toBeNull();
    expect(reconnaitreDemandeContenu("Écris à Marie que l'article est en ligne")).toBeNull();
    expect(reconnaitreDemandeContenu("Prépare la réunion sur notre dernier post")).toBeNull();
  });
});

describe("discussion.envoyer : questions d'état sans modèle", () => {
  it("où en est la mission : réponse tirée de la base, sans réveil ni changement de statut ; forme et journal gardés", async () => {
    const f = faux({ missions: [mission(), mission({ id: id(701), mandat: "Newsletter de novembre", etat: "attente_information" })] });
    const rendu = await f.envoyer("Où en est la mission ?");
    expect(rendu.corps).toMatchObject({ auteur: "humain", nom: "Vous", texte: "Où en est la mission ?", actions: [], reveilDemande: false });
    const [reponse] = f.reponses();
    expect(reponse).toContain("Post de lancement LinkedIn");
    expect(reponse).toContain("en cours");
    expect(reponse).toContain("Newsletter de novembre");
    expect(reponse).toContain("attend une information");
    expect(f.trace).not.toContain("requestWakeup");
    expect(f.statuts()).toEqual([]);
    expect(f.journal.find((e) => e.type === "discussion.message")).toMatchObject({ donnees: { questionEtat: "avancement", reveil: null } });
  });

  it("qu'est-ce qui attend : seules les missions qui attendent sont listées", async () => {
    const f = faux({ missions: [mission(), mission({ id: id(701), mandat: "Newsletter de novembre", etat: "attente_information" })] });
    await f.envoyer("Qu’est-ce qui attend ?");
    const [reponse] = f.reponses();
    expect(reponse).toContain("Newsletter de novembre");
    expect(reponse).not.toContain("Post de lancement LinkedIn");
    expect(f.trace).not.toContain("requestWakeup");
    expect(f.statuts()).toEqual([]);
  });

  it("combien ça a coûté : montant réel de la base, avec la limite dite", async () => {
    const f = faux({ missions: [mission()], couts: { totalCents: 1234, evenements: 7 } });
    await f.envoyer("Combien ça a coûté ?");
    const [reponse] = f.reponses();
    expect(reponse).toContain("12,34 €");
    expect(reponse).toContain("7");
    expect(reponse).toMatch(/pas (enregistré|rattaché)/);
    expect(f.trace).not.toContain("requestWakeup");
  });

  it("mission absente : réponse honnête, rien d'inventé", async () => {
    const f = faux({ missions: [] });
    await f.envoyer("Où en est la mission ?");
    await f.envoyer("Qu'est-ce qui attend ?");
    const [a, b] = f.reponses();
    expect(a).toContain("Aucune mission");
    expect(b).toContain("Aucune mission");
    expect(f.trace).not.toContain("requestWakeup");
  });

  it("coût sans donnée : la réponse le dit, aucun zéro inventé", async () => {
    const f = faux({ missions: [mission()], couts: { totalCents: 0, evenements: 0 } });
    await f.envoyer("Combien ça a coûté ?");
    const [reponse] = f.reponses();
    expect(reponse).toContain("Aucun coût");
    expect(reponse).not.toMatch(/0[,.]00|\b0 €/);
  });

  it("panne de lecture de la base : retombe sur le modèle (défaut sûr)", async () => {
    const f = faux({ lectureMissionsEchoue: true });
    await f.envoyer("Où en est la mission ?");
    expect(f.trace).toContain("requestWakeup");
    expect(f.reponses()).toEqual([]);
  });
});

describe("discussion.envoyer : demande de contenu, brouillon de mission", () => {
  it("écris-moi un post : un brouillon wf-c-contenu en attente d'information, sans campagne, et une seule carte", async () => {
    const f = faux();
    await f.envoyer("Écris-moi un post sur LinkedIn");
    expect(f.creees).toHaveLength(1);
    expect(f.creees[0]).toMatchObject({ companyId: SOC, gabaritCle: "wf-c-contenu", gabaritVersion: 1, etat: "attente_information", campagneId: null, issueRacineId: f.issues[0]!.id });
    expect(f.creees[0]!.mandat).toContain("Écris-moi un post sur LinkedIn");
    const [reponse] = f.reponses();
    for (const manquant of ["cible", "objectif", "sources"]) expect(reponse).toContain(manquant);
    expect(reponse).toContain("campagne");
    expect(f.interactions).toHaveLength(1);
    expect(f.interactions[0]).toMatchObject({ issueId: f.issues[0]!.id, continuationPolicy: "wake_assignee_on_accept", resolverPolicy: "human_only" });
    expect(f.trace).not.toContain("requestWakeup");
    expect(f.statuts()).toEqual([]);
  });

  it("le type et le canal ne se devinent pas : absents du texte, ils restent manquants", async () => {
    const f = faux();
    await f.envoyer("Rédige un article");
    const [reponse] = f.reponses();
    expect(reponse).toContain("canal");
    expect(reponse).not.toMatch(/canal ?[:=] ?(linkedin|instagram|facebook)/i);
    expect(reponse).not.toContain("typeLivrable");
  });

  it("second envoi identique : ni second brouillon ni seconde carte", async () => {
    const f = faux();
    await f.envoyer("Écris-moi un post sur LinkedIn");
    await f.envoyer("Écris-moi un post sur LinkedIn");
    expect(f.creees).toHaveLength(1);
    expect(f.interactions).toHaveLength(1);
    expect(f.trace.filter((t) => t === "requestWakeup")).toEqual([]);
  });

  it("demande identique après lancement : nouvelle mission et nouvelle carte, brouillon non lancé réutilisé sinon", async () => {
    const f = faux();
    await f.envoyer("Écris-moi un post sur LinkedIn");
    await f.envoyer("Écris-moi un post sur LinkedIn");
    expect(f.creees).toHaveLength(1);
    expect(f.interactions).toHaveLength(1);
    f.missions[0]!.etat = "en_cours";
    await f.envoyer("Écris-moi un post sur LinkedIn");
    expect(f.creees).toHaveLength(2);
    expect(f.interactions).toHaveLength(2);
    expect(f.reponses().at(-1)).toContain("non lancé");
    expect(JSON.stringify(f.interactions[1]!.payload)).toContain(f.missions[1]!.id);
    expect(f.missions[1]!.etat).toBe("attente_information");
  });

  it("brouillon créé mais carte perdue : le renvoi recrée la carte seule", async () => {
    const f = faux();
    await f.envoyer("Écris-moi un post");
    f.interactions.length = 0;
    await f.envoyer("Écris-moi un post");
    expect(f.creees).toHaveLength(1);
    expect(f.interactions).toHaveLength(1);
  });
});

describe("discussion.envoyer : ce qui part vers le modèle", () => {
  it("demande ouverte non reconnue : réveil, comme avant", async () => {
    const f = faux();
    await f.envoyer("Analyse la concurrence de nos trois clients");
    expect(f.trace).toContain("requestWakeup");
    expect(f.creees).toHaveLength(0);
    expect(f.reponses()).toEqual([]);
  });

  it("réglage de repli : question et demande partent toutes deux vers le modèle", async () => {
    const f = faux({ config: { moteurMissions: true, moteurChatVersModele: true } });
    await f.envoyer("Où en est la mission ?");
    await f.envoyer("Écris-moi un post");
    expect(f.trace.filter((t) => t === "requestWakeup")).toHaveLength(2);
    expect(f.creees).toHaveLength(0);
    expect(f.interactions).toHaveLength(0);
    expect(f.reponses()).toEqual([]);
  });

  it("moteur désactivé : comportement d'avant, réveil, aucun brouillon ni réponse locale", async () => {
    for (const config of [{ moteurMissions: false }, {}, null]) {
      const f = faux({ config });
      await f.envoyer("Où en est la mission ?");
      await f.envoyer("Écris-moi un post");
      expect(f.trace.filter((t) => t === "requestWakeup")).toHaveLength(2);
      expect(f.creees).toHaveLength(0);
      expect(f.interactions).toHaveLength(0);
      expect(f.reponses()).toEqual([]);
    }
  });

  it("le fil reste marqué comme discussion", async () => {
    const f = faux();
    await f.envoyer("Où en est la mission ?");
    expect(f.issues[0]).toMatchObject({ originKind: ORIGINE_DISCUSSION });
  });
});
