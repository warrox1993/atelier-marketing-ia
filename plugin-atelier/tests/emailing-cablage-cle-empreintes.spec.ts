/**
 * Câblage réel (creerServices) de l'avertissement de clé des empreintes dans la demande d'envoi e-mailing : le contrôle des
 * destinataires lit les clés du plugin, compare le témoin et ajoute l'avertissement à la réponse et au journal, sans rien refuser.
 */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import { empreinte } from "../src/serveur/chiffrement-donnees.js";
import { creerServices } from "../src/serveur/services.js";
import { BRIEF, SOC, creerBanc } from "./outils-base.js";
import { avecClesDonnees, CLES_TEST, REFS_CLES } from "./outils-cles-donnees.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const TACHE = BRIEF;
const AGENT: ActeurHote = { type: "agent", id: "00000000-0000-4000-8000-000000000900", agentId: "00000000-0000-4000-8000-000000000900", userId: null, runId: "run-1" };
const ADRESSE = "contact@exemple.test";
const LECTURE = { campagne_id: 5, sujet: "Nouveautés", statut: "draft", listes: [{ id: 1, nom: "Clients" }], destinataires: 1, empreinte: "a".repeat(64), empreinte_abonnes: "c".repeat(64), extrait: "Bonjour", courriels: [ADRESSE] };

function montage(o: { oppositions: boolean }) {
  const b = creerBanc({ modeEntreprise: "reel", config: { passerelleUrl: "http://127.0.0.1:3190", ...REFS_CLES } });
  avecClesDonnees(b.ctx);
  const ctx = b.ctx as unknown as Ligne;
  const etat = new Map<string, unknown>();
  const cartes: Ligne[] = [];
  ctx.state = { get: async (k: { stateKey: string }) => structuredClone(etat.get(k.stateKey) ?? null), set: async (k: { stateKey: string }, v: unknown) => void etat.set(k.stateKey, structuredClone(v)) };
  ctx.issues.get = async (id: string, companyId: string) => (id === TACHE ? { id, companyId, assigneeAgentId: AGENT.agentId } : null);
  ctx.issues.listInteractions = async () => cartes;
  ctx.issues.requestConfirmation = async (_i: string, interaction: Ligne) => {
    const c = { id: `carte-${cartes.length + 1}`, kind: "request_confirmation", status: "pending", resolvedByUserId: null, resolvedByAgentId: null, payload: { ...(interaction.payload as Ligne) } };
    cartes.push(c);
    return c;
  };
  const h = empreinte("courriel", ADRESSE, CLES_TEST.hmac);
  const ext: Ligne = {
    entrepriseAOppositions: async () => o.oppositions,
    oppositionsPour: async () => [],
    empreintesProspectsEnBase: async (_c: string, v: string[]) => (v.includes(h) ? [{ prospectId: "p1", type: "courriel", valeur: h }] : []),
    detailsProspects: async () => ({ empreintes: new Map(), scores: new Map(), bases: new Map([["p1", [{ canal: "courriel", base: "consentement" }]]]) }),
  };
  const base = new Proxy(b.base as unknown as Ligne, { get: (cible, cle) => (cle in ext ? ext[cle as string] : cible[cle as string]) }) as unknown as BaseAtelier;
  const services = creerServices(b.ctx, { base, fetchBoucleLocale: async () => new Response(JSON.stringify(LECTURE), { status: 200 }) });
  const demander = () => services.routes["emailing.demander_envoi"]!({ cle: "emailing.demander_envoi", params: {}, query: {}, corps: { companyId: SOC, issueId: TACHE, campagneId: 5, empreinte: LECTURE.empreinte }, acteur: AGENT, companyId: SOC } as never);
  return { b, demander, cartes };
}

describe("emailing.demander_envoi : avertissement de clé câblé par creerServices", () => {
  it("témoin différent et oppositions enregistrées : la carte est créée, la réponse et le journal portent l'avertissement", async () => {
    const m = montage({ oppositions: true });
    m.b.t.temoinsCle.set(SOC, "0123456789abcdef");
    const r = await m.demander();
    expect(m.cartes).toHaveLength(1);
    expect((r.corps as Ligne).avertissement).toContain("La clé des empreintes a changé");
    expect(m.b.t.journal.find((j) => j.type === "emailing.envoi_demande" || j.donnees?.avertissementCle)?.donnees).toMatchObject({ avertissementCle: expect.stringContaining("La clé des empreintes a changé") });
  });

  it("même clé que le témoin : aucun avertissement", async () => {
    const m = montage({ oppositions: true });
    const r = await m.demander();
    expect(m.cartes).toHaveLength(1);
    expect(r.corps as Ligne).not.toHaveProperty("avertissement");
  });
});
