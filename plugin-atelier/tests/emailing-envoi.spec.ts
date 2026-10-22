/**
 * Envoi d'une campagne e-mail après décision humaine : la carte est créée par le PLUGIN (texte serveur) ; refus d'une carte rédigée par un
 * agent (marqueur caché en Markdown), d'une carte non enregistrée, altérée, déjà utilisée ou résolue par un agent, agent hors tâche, puis
 * envoi avec une preuve signée vérifiable.
 */
import { createHash, generateKeyPairSync, verify, type KeyObject } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ROUTES_API } from "../src/contrats/index.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import { ErreurAtelier } from "../src/serveur/erreurs.js";
import { empreinteArguments } from "../src/serveur/signatures.js";
import { CLE_ETAT_CARTES_ENVOI, COMPTE_EMAILING, OUTIL_ENVOI_EMAILING, SERVICE_EMAILING, neutraliserMarkdown, routesEmailing, texteCarteEnvoi } from "../src/serveur/services-emailing.js";
import { SOC } from "./outils-base.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const AGENT: ActeurHote = { type: "agent", id: "00000000-0000-4000-8000-000000000900", agentId: "00000000-0000-4000-8000-000000000900", userId: null, runId: "run-1" };
const AUTRE_AGENT: ActeurHote = { ...AGENT, id: "00000000-0000-4000-8000-000000000901", agentId: "00000000-0000-4000-8000-000000000901" };
const TACHE = "00000000-0000-4000-8000-0000000000aa";
const EMPREINTE = "a".repeat(64);
const ABONNES = "c".repeat(64);
/** Ce que la passerelle rend pour la campagne 5 (route interne de lecture) : la SEULE source de ce que montre la carte. */
const LECTURE = { campagne_id: 5, sujet: "Nouveautés d'octobre", statut: "draft", listes: [{ id: 1, nom: "Clients" }], destinataires: 2, empreinte: EMPREINTE, empreinte_abonnes: ABONNES, extrait: "Bonjour à toutes et à tous" };

const TEXTE = texteCarteEnvoi({ campagneId: 5, empreinte: EMPREINTE, sujet: LECTURE.sujet, listes: LECTURE.listes, destinataires: 2, empreinteAbonnes: ABONNES, extrait: LECTURE.extrait });
const SIGNATURE = createHash("sha256").update(`${TEXTE.prompt}\n${TEXTE.detailsMarkdown}`).digest("hex");

/** Carte telle que le plugin la crée (texte serveur), acceptée par un humain, et son entrée dans le registre. */
function carte(extra: Ligne = {}): Ligne {
  return {
    id: "carte-1", kind: "request_confirmation", status: "accepted", resolvedByUserId: "local-board", resolvedByAgentId: null,
    payload: { version: 1, ...TEXTE }, ...extra,
  };
}
const REGISTRE = { "carte-1": { version: 2, campagneId: 5, empreinte: EMPREINTE, texte: SIGNATURE, utilisee: null, destinataires: 2, empreinteAbonnes: ABONNES } };

type Lecture = Ligne | ((campagneId: number) => Ligne) | "panne";

function montage(options: { cartes?: Ligne[]; registre?: Ligne; cle?: KeyObject | null; reponse?: { statut: number; corps: unknown } | "panne" | "delai"; lecture?: Lecture; lenteur?: boolean } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const appels: Array<{ url: string; corps: Ligne }> = [];
  const lectures: Ligne[] = [];
  /** Lenteur simulée des écritures : sans verrou, deux écritures parallèles du registre s'écraseraient. */
  const pause = () => (options.lenteur ? new Promise((ok) => setTimeout(ok, 5)) : Promise.resolve());
  const journal: Ligne[] = [];
  const etat = new Map<string, unknown>([[CLE_ETAT_CARTES_ENVOI, options.registre ?? structuredClone(REGISTRE)]]);
  const creees: Array<{ issueId: string; payload: Ligne }> = [];
  const cartes = options.cartes ?? [carte()];
  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    state: {
      get: async (k: { stateKey: string }) => { const v = structuredClone(etat.get(k.stateKey) ?? null); await pause(); return v; },
      set: async (k: { stateKey: string }, v: unknown) => { await pause(); etat.set(k.stateKey, structuredClone(v)); },
    },
    issues: {
      get: async (id: string, companyId: string) => (id === TACHE ? { id: TACHE, companyId, assigneeAgentId: AGENT.agentId } : null),
      listInteractions: async () => cartes,
      requestConfirmation: async (issueId: string, interaction: Ligne) => {
        await pause();
        const payload = interaction.payload as Ligne;
        const c = { id: `carte-neuve-${creees.length + 1}`, kind: "request_confirmation", status: "pending", resolvedByUserId: null, resolvedByAgentId: null, payload: { ...payload } };
        creees.push({ issueId, payload }); cartes.push(c);
        return c;
      },
    },
  } as unknown as PluginContext;
  const base = { journaliser: async (e: Ligne) => void journal.push(e) } as unknown as BaseAtelier;
  const reponse = options.reponse ?? { statut: 200, corps: { envoye: true, mode_envoi: "test", message: "envoi de test, rien n'est parti : …", campagne: { id: 5, statut: "running" } } };
  const routes = routesEmailing({
    ctx, base,
    cleApprobation: async () => (options.cle === null ? { cle: null, motif: "aucune clé" } : { cle: options.cle ?? privateKey }),
    revocations: async () => "arv1.liste.signature",
    adressePasserelle: async () => new URL("http://127.0.0.1:3190"),
    fetchLocal: async (url, init) => {
      if (url.endsWith("/interne/emailing/lire-campagne")) {
        const corps = JSON.parse(String(init.body)) as Ligne;
        lectures.push(corps);
        if (options.lecture === "panne") throw new Error("connexion refusée");
        const lue = typeof options.lecture === "function" ? options.lecture(corps.campagne_id as number) : (options.lecture ?? LECTURE);
        return new Response(JSON.stringify(lue), { status: 200 });
      }
      appels.push({ url, corps: JSON.parse(String(init.body)) });
      if (reponse === "panne") throw new Error("connexion refusée");
      if (reponse === "delai") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      return new Response(JSON.stringify(reponse.corps), { status: reponse.statut });
    },
    maintenant: () => new Date("2026-10-21T10:00:00Z"),
  });
  const appeler = (corps: Ligne = {}, acteur: ActeurHote = HUMAIN) =>
    routes["emailing.envoyer"]!({ cle: "emailing.envoyer", params: {}, query: {}, corps: { companyId: SOC, issueId: TACHE, campagneId: 5, empreinte: EMPREINTE, ...corps }, acteur, companyId: SOC } as RequeteRoute);
  const demander = (corps: Ligne = {}, acteur: ActeurHote = AGENT) =>
    routes["emailing.demander_envoi"]!({ cle: "emailing.demander_envoi", params: {}, query: {}, corps: { companyId: SOC, issueId: TACHE, campagneId: 5, empreinte: EMPREINTE, ...corps }, acteur, companyId: SOC } as RequeteRoute);
  const refus = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as ErreurAtelier | null);
  return { appeler, demander, refus, appels, lectures, journal, publicKey, etat, creees, cartes };
}

describe("emailing.envoyer : route déclarée", () => {
  it("POST /emailing/demander-envoi, humain ou agent de la tâche", () => {
    expect(ROUTES_API.find((r) => r.cle === "emailing.demander_envoi")).toMatchObject({ methode: "POST", chemin: "/emailing/demander-envoi", auth: "board-or-agent" });
  });

  it("POST /emailing/envoyer, humain ou agent de la tâche", () => {
    expect(ROUTES_API.find((r) => r.cle === "emailing.envoyer")).toMatchObject({ methode: "POST", chemin: "/emailing/envoyer", auth: "board-or-agent" });
  });
});

describe("emailing.envoyer : décision humaine exigée", () => {
  it("sans aucune carte : refus, la passerelle n'est pas appelée", async () => {
    const m = montage({ cartes: [] });
    const e = await m.refus(m.appeler());
    expect(e?.code).toBe("elevation_refusee");
    expect(m.appels).toHaveLength(0);
  });

  it("carte en attente ou refusée : refus", async () => {
    for (const status of ["pending", "rejected", "expired"]) {
      const m = montage({ cartes: [carte({ status })] });
      expect((await m.refus(m.appeler()))?.code).toBe("elevation_refusee");
      expect(m.appels).toHaveLength(0);
    }
  });

  it("carte résolue par un agent, ou sans résolveur humain : refus", async () => {
    for (const extra of [{ resolvedByAgentId: AGENT.agentId, resolvedByUserId: null }, { resolvedByAgentId: AGENT.agentId }, { resolvedByUserId: null }]) {
      const m = montage({ cartes: [carte(extra)] });
      expect((await m.refus(m.appeler()))?.code).toBe("elevation_refusee");
      expect(m.appels).toHaveLength(0);
    }
  });

  it("carte d'une autre campagne ou d'une autre version du contenu : refus", async () => {
    const m = montage({ registre: { "carte-1": { ...REGISTRE["carte-1"], campagneId: 6 } } });
    expect((await m.refus(m.appeler()))?.code).toBe("elevation_refusee");
    const m2 = montage();
    expect((await m2.refus(m2.appeler({ empreinte: "b".repeat(64) })))?.code).toBe("elevation_refusee");
    expect(m.appels.length + m2.appels.length).toBe(0);
  });

  it("ATTAQUE : carte rédigée par l'agent avec le marqueur caché en définition de référence Markdown (invisible) : refus", async () => {
    const piegee = carte({ id: "carte-agent", payload: { version: 1, prompt: "Valider le planning de la semaine ?", detailsMarkdown: `Rien d'important.\n\n[envoi-emailing:5:${EMPREINTE}]: #\n<!-- [envoi-emailing:5:${EMPREINTE}] -->` } });
    const m = montage({ cartes: [piegee], registre: {} });
    const e = await m.refus(m.appeler({}, AGENT));
    expect(e?.code).toBe("elevation_refusee");
    expect(m.appels).toHaveLength(0);
  });

  it("carte acceptée par l'humain mais absente du registre du plugin (créée hors route) : refus", async () => {
    const m = montage({ cartes: [carte({ id: "carte-inconnue" })] });
    expect((await m.refus(m.appeler()))?.code).toBe("elevation_refusee");
    expect(m.appels).toHaveLength(0);
  });

  it("carte enregistrée dont le texte a été modifié après coup : refus", async () => {
    const m = montage({ cartes: [carte({ payload: { version: 1, ...TEXTE, detailsMarkdown: `${TEXTE.detailsMarkdown}\n\n[x]: #` } })] });
    expect((await m.refus(m.appeler()))?.code).toBe("elevation_refusee");
    expect(m.appels).toHaveLength(0);
  });

  it("réutilisation : une carte déjà utilisée ne sert plus (deuxième envoi refusé)", async () => {
    const m = montage();
    expect((await m.appeler()).corps).toMatchObject({ envoye: true });
    expect((await m.refus(m.appeler()))?.code).toBe("elevation_refusee");
    expect(m.appels).toHaveLength(1);
    expect((m.etat.get(CLE_ETAT_CARTES_ENVOI) as Ligne)["carte-1"].utilisee).toBe("2026-10-21T10:00:00.000Z");
  });

  it("panne de la passerelle (rien n'est parti) : la carte est rendue, un nouvel essai est possible", async () => {
    const m = montage({ reponse: "panne" });
    expect((await m.refus(m.appeler()))?.code).toBe("emailing_indisponible");
    expect((m.etat.get(CLE_ETAT_CARTES_ENVOI) as Ligne)["carte-1"].utilisee).toBeNull();
  });

  it("un agent n'envoie pas depuis une tâche qui ne lui est pas assignée", async () => {
    const m = montage();
    expect((await m.refus(m.appeler({}, AUTRE_AGENT)))?.code).toBe("elevation_refusee");
    expect(m.appels).toHaveLength(0);
  });

  it("tâche d'une autre entreprise ou corps invalide : refus", async () => {
    const m = montage();
    expect((await m.refus(m.appeler({ issueId: "00000000-0000-4000-8000-0000000000bb" })))?.code).toBe("hors_entreprise");
    expect((await m.refus(m.appeler({ empreinte: "xyz" })))?.code).toBe("entree_invalide");
    expect((await m.refus(m.appeler({ campagneId: 0 })))?.code).toBe("entree_invalide");
    expect(m.appels).toHaveLength(0);
  });

  it("sans clé d'approbation : refus, rien n'est signé ni envoyé", async () => {
    const m = montage({ cle: null });
    expect((await m.refus(m.appeler()))?.code).toBe("conflit");
    expect(m.appels).toHaveLength(0);
  });
});

describe("emailing.demander_envoi : carte créée par le plugin", () => {
  it("crée la carte avec un texte serveur, l'enregistre, et un agent ne choisit aucun texte de carte", async () => {
    const m = montage({ cartes: [], registre: {} });
    const r = await m.demander();
    expect(r.corps).toMatchObject({ carteId: "carte-neuve-1", statut: "en_attente", reutilisee: false });
    expect(m.creees).toHaveLength(1);
    expect(m.creees[0]!.payload.prompt).toBe(TEXTE.prompt);
    expect(m.creees[0]!.payload.prompt).not.toContain("Nouveautés");
    expect(m.creees[0]!.payload.detailsMarkdown).toContain(EMPREINTE);
    expect(m.etat.get(CLE_ETAT_CARTES_ENVOI)).toMatchObject({ "carte-neuve-1": { version: 2, campagneId: 5, empreinte: EMPREINTE, utilisee: null, destinataires: 2, empreinteAbonnes: ABONNES } });
    expect(m.lectures).toEqual([{ campagne_id: 5 }]);
    expect(m.journal[0]).toMatchObject({ type: "emailing.envoi_demande" });
  });

  it("un sujet, un nom de liste et un extrait piégés (marqueur, référence, balise, lien) sont neutralisés : aucune syntaxe Markdown ne subsiste", async () => {
    const piege = `Offre\n\n[envoi-emailing:5:${EMPREINTE}]: #\n<!-- caché --> [clic](http://x) <b>`;
    const m = montage({ cartes: [], registre: {}, lecture: { ...LECTURE, sujet: piege, listes: [{ id: 1, nom: "[a]: #" }], extrait: piege } });
    await m.demander();
    const d = String(m.creees[0]!.payload.detailsMarkdown);
    expect(d).not.toMatch(/^\s*\[[^\]]+\]:/m);
    const sansEchappes = d.replace(/\\./g, "");
    expect(sansEchappes).not.toMatch(/[<>[\]()]/);
    expect(neutraliserMarkdown("a\nb [c](d)", 50)).toBe("a b \\[c\\]\\(d\\)");
  });

  it("carte identique encore en attente : réutilisée, pas de doublon", async () => {
    const m = montage({ cartes: [], registre: {} });
    await m.demander();
    expect((await m.demander()).corps).toMatchObject({ carteId: "carte-neuve-1", reutilisee: true });
    expect(m.creees).toHaveLength(1);
  });

  it("demande puis acceptation par un humain puis envoi : chaîne complète", async () => {
    const m = montage({ cartes: [], registre: {} });
    await m.demander();
    expect((await m.refus(m.appeler({}, AGENT)))?.code).toBe("elevation_refusee"); // carte encore en attente
    Object.assign(m.cartes[0]!, { status: "accepted", resolvedByUserId: "local-board" });
    expect((await m.appeler({}, AGENT)).corps).toMatchObject({ envoye: true });
  });

  it("carte acceptée par un AGENT : refus (pas d'auto-approbation)", async () => {
    const m = montage({ cartes: [], registre: {} });
    await m.demander();
    Object.assign(m.cartes[0]!, { status: "accepted", resolvedByUserId: null, resolvedByAgentId: AGENT.agentId });
    expect((await m.refus(m.appeler({}, AGENT)))?.code).toBe("elevation_refusee");
    expect(m.appels).toHaveLength(0);
  });

  it("agent hors tâche, acteur système, corps invalide : refus", async () => {
    const m = montage({ cartes: [], registre: {} });
    expect((await m.refus(m.demander({}, AUTRE_AGENT)))?.code).toBe("elevation_refusee");
    expect((await m.refus(m.demander({}, { ...HUMAIN, type: "systeme" })))?.code).toBe("elevation_refusee");
    // Les anciens champs déclaratifs ne sont plus acceptés : l'agent ne déclare rien de la campagne.
    expect((await m.refus(m.demander({ destinataires: 2 })))?.code).toBe("entree_invalide");
    expect((await m.refus(m.demander({ sujet: "Test interne" })))?.code).toBe("entree_invalide");
    expect((await m.refus(m.demander({ empreinte: "xyz" })))?.code).toBe("entree_invalide");
    expect(m.creees).toHaveLength(0);
  });
});

describe("emailing.envoyer : carte acceptée", () => {
  it("signe une preuve vérifiable (service, outil, compte, empreinte des arguments, usage unique) et relaie la réponse de test", async () => {
    const m = montage();
    const r = await m.appeler();
    expect(r.corps).toMatchObject({ envoye: true, modeEnvoi: "test" });
    expect(String((r.corps as Ligne).message)).toMatch(/envoi de test, rien n'est parti/);
    expect(m.appels).toHaveLength(1);
    const envoi = m.appels[0]!;
    expect(envoi.url).toBe("http://127.0.0.1:3190/interne/emailing/envoyer");
    expect(envoi.corps).toMatchObject({ campagne_id: 5, empreinte: EMPREINTE, destinataires: 2, empreinte_abonnes: ABONNES, revocations_approbation: "arv1.liste.signature" });
    const [prefixe, charge64, signature] = String(envoi.corps.preuve_approbation).split(".") as [string, string, string];
    expect(prefixe).toBe("apv1");
    expect(verify(null, Buffer.from(`${prefixe}.${charge64}`), m.publicKey, Buffer.from(signature, "base64url"))).toBe(true);
    const charge = JSON.parse(Buffer.from(charge64, "base64url").toString("utf8")) as Ligne;
    expect(charge).toMatchObject({ v: 1, service: SERVICE_EMAILING, outil: OUTIL_ENVOI_EMAILING, compte: COMPTE_EMAILING, decision: "carte-1", entreprise: SOC, cle: "atelier-envoi-carte-1" });
    expect(charge.empreinte).toBe(empreinteArguments({ campagne_id: 5, empreinte: EMPREINTE, destinataires: 2, empreinte_abonnes: ABONNES }));
    // Le nombre de destinataires et l'empreinte des abonnés acceptés entrent dans ce qui est signé : en changer un change l'empreinte.
    expect(charge.empreinte).not.toBe(empreinteArguments({ campagne_id: 5, empreinte: EMPREINTE, destinataires: 3, empreinte_abonnes: ABONNES }));
    expect(charge.empreinte).not.toBe(empreinteArguments({ campagne_id: 5, empreinte: EMPREINTE, destinataires: 2, empreinte_abonnes: "d".repeat(64) }));
    expect(charge.expire - charge.emis).toBeLessThanOrEqual(600);
    expect(m.journal[0]).toMatchObject({ type: "emailing.envoi_lance", entite: "campagne_emailing", entiteId: "5" });
    expect(JSON.stringify(m.journal)).not.toContain("apv1");
  });

  it("un agent de la tâche peut déclencher l'envoi d'une campagne confirmée par un humain", async () => {
    const m = montage();
    expect((await m.appeler({}, AGENT)).corps).toMatchObject({ envoye: true });
  });

  it("refus de la passerelle (preuve refusée, contenu modifié) : erreur claire, journal du refus", async () => {
    const m = montage({ reponse: { statut: 409, corps: { envoye: false, erreur: "contenu_modifie", message: "Envoi refusé : le contenu de la campagne n'est plus celui que l'humain a approuvé." } } });
    const e = await m.refus(m.appeler());
    expect(e?.code).toBe("conflit");
    expect(e?.message).toMatch(/n'est plus celui que l'humain a approuvé/);
    expect(m.journal[0]).toMatchObject({ type: "emailing.envoi_refuse", donnees: expect.objectContaining({ code: "contenu_modifie" }) });
    const m2 = montage({ reponse: { statut: 403, corps: { envoye: false, erreur: "preuve_refusee", message: "Envoi refusé : signature invalide." } } });
    expect((await m2.refus(m2.appeler()))?.code).toBe("diffusion_refusee");
  });

  it("passerelle injoignable : 503, rien n'est annoncé comme envoyé", async () => {
    const m = montage({ reponse: "panne" });
    expect((await m.refus(m.appeler()))?.code).toBe("emailing_indisponible");
  });
});

describe("emailing.demander_envoi : la carte montre la VRAIE campagne (constat E1)", () => {
  it("ATTAQUE rejouée : « Test interne, 2 destinataires » déclaré pour une campagne de 480 abonnés : déclaration refusée, carte construite avec les valeurs lues", async () => {
    const m = montage({ cartes: [], registre: {}, lecture: { ...LECTURE, sujet: "Offre promotionnelle", destinataires: 480, listes: [{ id: 1, nom: "Tous les clients" }] } });
    expect((await m.refus(m.demander({ sujet: "Test interne", destinataires: 2, listes: ["Équipe"] })))?.code).toBe("entree_invalide");
    expect(m.creees).toHaveLength(0);
    await m.demander();
    expect(m.creees[0]!.payload.prompt).toBe("Envoyer la campagne numéro 5 à 480 destinataires ?");
    const details = String(m.creees[0]!.payload.detailsMarkdown);
    expect(details).toContain("Offre promotionnelle");
    expect(details).toContain("liste 1 « Tous les clients »");
    expect(details).not.toContain("Test interne");
    expect(m.etat.get(CLE_ETAT_CARTES_ENVOI)).toMatchObject({ "carte-neuve-1": { destinataires: 480, empreinteAbonnes: ABONNES } });
  });

  it("empreinte du contenu qui ne correspond pas à la campagne lue, ou campagne qui n'est plus un brouillon : refus, aucune carte", async () => {
    const m = montage({ cartes: [], registre: {} });
    expect((await m.refus(m.demander({ empreinte: "b".repeat(64) })))?.code).toBe("conflit");
    const m2 = montage({ cartes: [], registre: {}, lecture: { ...LECTURE, statut: "running" } });
    expect((await m2.refus(m2.demander()))?.code).toBe("conflit");
    expect(m.creees.length + m2.creees.length).toBe(0);
  });

  it("passerelle injoignable ou réponse illisible pour la lecture : refus, aucune carte", async () => {
    const m = montage({ cartes: [], registre: {}, lecture: "panne" });
    expect((await m.refus(m.demander()))?.code).toBe("emailing_indisponible");
    const m2 = montage({ cartes: [], registre: {}, lecture: { campagne_id: 5, sujet: 12 } });
    expect((await m2.refus(m2.demander()))?.code).toBe("emailing_indisponible");
    expect(m.creees.length + m2.creees.length).toBe(0);
  });

  it("la liste d'abonnés a changé (autre empreinte) : une nouvelle carte est créée, l'ancienne en attente n'est pas réutilisée", async () => {
    let lecture: Ligne = LECTURE;
    const m = montage({ cartes: [], registre: {}, lecture: () => lecture });
    await m.demander();
    lecture = { ...LECTURE, empreinte_abonnes: "d".repeat(64) };
    expect((await m.demander()).corps).toMatchObject({ reutilisee: false });
    expect(m.creees).toHaveLength(2);
  });

  it("carte de version 1 (sans version 2, sans destinataires) : refusée par envoyer", async () => {
    const m = montage({ registre: { "carte-1": { campagneId: 5, empreinte: EMPREINTE, texte: SIGNATURE, utilisee: null } } });
    expect((await m.refus(m.appeler()))?.code).toBe("elevation_refusee");
    const m2 = montage({ registre: { "carte-1": { ...REGISTRE["carte-1"], version: 1 } } });
    expect((await m2.refus(m2.appeler()))?.code).toBe("elevation_refusee");
    expect(m.appels.length + m2.appels.length).toBe(0);
  });
});

describe("registre des cartes : écritures sérialisées par tâche (F1)", () => {
  it("deux demandes simultanées pour deux campagnes de la même tâche : les deux cartes sont enregistrées (aucune écriture perdue)", async () => {
    const m = montage({ cartes: [], registre: {}, lenteur: true, lecture: (id) => ({ ...LECTURE, campagne_id: id, empreinte: String(id).repeat(64).slice(0, 64).replace(/[^0-9a-f]/g, "e") }) });
    const e6 = "6".repeat(64);
    const e7 = "7".repeat(64);
    await Promise.all([
      m.demander({ campagneId: 6, empreinte: e6 }),
      m.demander({ campagneId: 7, empreinte: e7 }),
    ]);
    const reg = m.etat.get(CLE_ETAT_CARTES_ENVOI) as Ligne;
    expect(Object.keys(reg).sort()).toEqual(["carte-neuve-1", "carte-neuve-2"]);
    expect(Object.values(reg).map((e: Ligne) => e.campagneId).sort()).toEqual([6, 7]);
  });

  it("COURSE : deux envoyer simultanés sur la même carte, un seul appel part vers la passerelle", async () => {
    const m = montage({ lenteur: true });
    const resultats = await Promise.allSettled([m.appeler(), m.appeler()]);
    expect(resultats.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const echec = resultats.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect((echec.reason as ErreurAtelier).code).toBe("elevation_refusee");
    expect(m.appels).toHaveLength(1);
  });

  it("la carte rendue après une panne l'est sur un registre frais : une autre écriture faite pendant l'appel n'est pas perdue", async () => {
    const m = montage({ reponse: "panne", lenteur: true });
    const [r1] = await Promise.allSettled([m.appeler(), m.demander({ campagneId: 9, empreinte: "9".repeat(64) })]);
    expect(r1.status).toBe("rejected");
    const reg = m.etat.get(CLE_ETAT_CARTES_ENVOI) as Ligne;
    expect(reg["carte-1"].utilisee).toBeNull();
  });
});

describe("emailing.envoyer : issue inconnue (F2)", () => {
  it("délai dépassé : la carte reste CONSOMMÉE, envoi_incertain journalisé, « issue inconnue », pas de nouvel envoi possible", async () => {
    const m = montage({ reponse: "delai" });
    const e = await m.refus(m.appeler());
    expect(e?.code).toBe("emailing_indisponible");
    expect(e?.message).toMatch(/issue inconnue/i);
    expect(e?.message).toMatch(/etat_campagne/);
    expect(e?.message).not.toMatch(/rien n'a été envoyé/);
    expect((m.etat.get(CLE_ETAT_CARTES_ENVOI) as Ligne)["carte-1"].utilisee).not.toBeNull();
    expect(m.journal.map((j) => j.type)).toContain("emailing.envoi_incertain");
    expect((await m.refus(m.appeler()))?.code).toBe("elevation_refusee");
    expect(m.appels).toHaveLength(1);
  });

  it("la passerelle dit « incertain » (démarrage demandé, résultat inconnu) : même traitement, carte consommée", async () => {
    const m = montage({ reponse: { statut: 502, corps: { envoye: false, erreur: "listmonk", incertain: true, message: "Issue inconnue : …" } } });
    const e = await m.refus(m.appeler());
    expect(e?.message).toMatch(/issue inconnue/i);
    expect((m.etat.get(CLE_ETAT_CARTES_ENVOI) as Ligne)["carte-1"].utilisee).not.toBeNull();
    expect(m.journal.map((j) => j.type)).toContain("emailing.envoi_incertain");
  });
});
