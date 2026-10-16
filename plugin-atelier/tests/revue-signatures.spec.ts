/**
 * Revue de sécurité des signatures (`docs/revue-securite-signatures.md`, 15/10/2026), côté serveur du plugin
 * (contrat v1.6). Les preuves d'exploitation F-A à F-D, qui relèvent du plugin, sont rejouées ici avec le
 * code RÉEL du plugin et de la passerelle : chacune doit désormais ÉCHOUER à exploiter. Plus les garanties
 * S-1 (appel exact approuvé), S-2, S-3, S-4, S-6, S-7 (révocation) et S-8 (clés distinctes).
 * F-E (S-5) relève de la passerelle (journal d'idempotence) : `passerelle/tests/reel-social-crm/revue-signatures.test.ts`.
 */
import { generateKeyPairSync, verify } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { controlerAppel, preparerPreuve, type EntreePreuve } from "../src/serveur/preuve-approbation.js";
import { deduireModeReponse, extraireChiffres } from "../src/serveur/regles-donnees.js";
import { creerServices } from "../src/serveur/services.js";
import { cleIdempotenceSignee, empreinteAppel } from "../src/serveur/signatures.js";
import { ISSUE, REV1, REV2, SOC, PRODUCTEUR, creerBanc } from "./outils-base.js";
import { avecListeFraiche, emballer, paireEd25519, passerelle } from "./outils-passerelle.js";
import { signerRevocations } from "../src/serveur/signatures.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const P = await passerelle();
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PLUGIN = paireEd25519();
const GW = paireEd25519();
const SIGNATAIRE = new P.SignataireEnveloppe(GW.privee);
const VERIFICATEUR = avecListeFraiche(new P.VerificateurPreuves(PLUGIN.publiquePem), PLUGIN.privee, signerRevocations);
const MAINTENANT = new Date("2026-10-16T09:00:00Z");
const S = Math.floor(MAINTENANT.getTime() / 1000);

const humain: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const agent: ActeurHote = { type: "agent", id: PRODUCTEUR, agentId: PRODUCTEUR, userId: null, runId: "run-1" };

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */
/* F-A (S-2) : structure non signée glissée dans le texte              */
/* ------------------------------------------------------------------ */

describe("S-2 : tout contenu porteur de chiffres est couvert par une signature vérifiée", () => {
  const ARGS = { debut: "2026-10-01", fin: "2026-10-14" };
  const verif = { clesPubliques: [GW.publique], service: "ga4", outil: "ga4_rapport", arguments: ARGS as Record<string, unknown>, maintenant: MAINTENANT };
  const vraie = () => emballer(new P.SignataireEnveloppe(GW.privee, () => MAINTENANT.getTime()), "reel", { rows: [{ sessions: 120 }] }, { service: "ga4", outil: "ga4_rapport", compte: "properties/123", args: ARGS });

  it("F-A : JSON inventé sans enveloppe dans `texte`, à côté d'une structure signée : refusé (avant : réel, 1 250 000 retenu)", () => {
    const forge = { rows: [{ sessions: 48211, chiffre_affaires: 1250000 }] };
    const d = deduireModeReponse({ structuredContent: vraie().structuredContent, texte: JSON.stringify(forge) }, verif);
    expect(d.ok).toBe(false);
    expect(d.ok ? "" : d.raison).toMatch(/enveloppe « _atelier » signée/u);
  });

  it("chiffres écrits dans le texte hors du JSON signé : refusés", () => {
    const r = vraie();
    const d = deduireModeReponse({ texte: `Sessions réelles : 48211\n\n${r.texte.slice(r.texte.indexOf("{"))}`, structuredContent: r.structuredContent }, verif);
    expect(d.ok ? "" : d.raison).toMatch(/chiffres hors de la structure signée/u);
  });

  it("texte sans structure (résumé libre) à côté d'une structure signée : refusé ; JSON suivi d'un ajout : refusé", () => {
    const r = vraie();
    expect(deduireModeReponse({ texte: "Résumé : 48211 sessions", structuredContent: r.structuredContent }, verif).ok).toBe(false);
    expect(deduireModeReponse({ texte: `${r.texte}\n{"rows":[{"sessions":9}]}`, structuredContent: r.structuredContent }, verif).ok).toBe(false);
  });

  it("une réponse authentique reste réelle, même si un client réordonne les clés du texte (comparaison canonique)", () => {
    const r = vraie();
    expect(deduireModeReponse(r, verif)).toMatchObject({ ok: true, mode: "reel", compte: "properties/123" });
    const s = r.structuredContent as Record<string, unknown>;
    const reordonne = Object.fromEntries(Object.entries(s).reverse());
    const d = deduireModeReponse({ texte: `Données réelles.\n\n${JSON.stringify(reordonne)}`, structuredContent: s }, verif);
    expect(d).toMatchObject({ ok: true, mode: "reel" });
    expect(d.ok && d.structures).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* F-B (S-3) : réponse « préparée » d'un outil d'écriture               */
/* ------------------------------------------------------------------ */

describe("S-3 : la réponse d'un outil d'écriture n'est jamais une mesure", () => {
  async function reponsePreparee() {
    // Code RÉEL de la passerelle : outil HubSpot d'écriture appelé SANS preuve (chemin « préparée »).
    const { appelerOutil } = await import(/* @vite-ignore */ resolve(RACINE, "passerelle/src/outils.ts"));
    const { fournisseurHubspotReel } = await import(/* @vite-ignore */ resolve(RACINE, "passerelle/src/reel/social-crm/hubspot.ts"));
    const dep: any = {
      config: { adresses: { hubspotApi: "http://127.0.0.1:9" }, delaiAppelMs: 1000 },
      autorisation: { acces: async () => { throw new Error("jamais appelé sur le chemin « préparée »"); } },
      coffre: { mutation: () => undefined, ecrireMutation: () => undefined },
      verificateur: new P.VerificateurPreuves(null),
      attenteQuotaMaxMs: 0,
    };
    const f = fournisseurHubspotReel(dep);
    const outils = new Map(f.outils.map((o: any) => [o.nom, o]));
    const contexte = { service: "crm", mode: "reel", identite: { compte: "portail-42", propriete: null }, jetonPorteur: "jeton" };
    const args = { contact_id: "1", properties: { sessions: "48211", chiffre_affaires: "1250000" } };
    const r: any = await appelerOutil({ outils, descripteurs: [] }, "crm_modifier_contact", args, contexte, new P.SignataireEnveloppe(GW.privee));
    return { r, args };
  }

  it("F-B (règle) : la réponse signée « préparée » de crm_modifier_contact n'est plus tenue pour réelle", async () => {
    const { r, args } = await reponsePreparee();
    expect(r.structuredContent.etat).toBe("preparee");
    const d = deduireModeReponse({ structuredContent: r.structuredContent, texte: r.content[0].text }, { clesPubliques: [GW.publique], service: "crm", outil: "crm_modifier_contact", arguments: args, maintenant: new Date() });
    expect(d.ok).toBe(false);
    expect(d.ok ? "" : d.raison).toMatch(/outil d'écriture/u);
  });

  it("F-B (route) : dépôt refusé, sous le nom d'écriture comme sous un nom de lecture ; rien n'est enregistré", async () => {
    const { r, args } = await reponsePreparee();
    const b = bancReel();
    const deposer = (outil: string, reponse: unknown) =>
      b.services.routes["tache.donnees.deposer"]!({ cle: "tache.donnees.deposer", params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: agent, corps: { service: "crm", outil, reponse, arguments: args } });
    await expect(deposer("crm_modifier_contact", { structuredContent: r.structuredContent })).rejects.toMatchObject({ code: "entree_invalide", message: expect.stringMatching(/outil d'écriture/u) });
    await expect(deposer("crm_contacts", { structuredContent: r.structuredContent })).rejects.toMatchObject({ code: "entree_invalide" });
    expect(b.t.sources).toHaveLength(0);
    expect(b.t.journal.filter((j) => j.type === "donnees.refusees")).toHaveLength(2);
  });

  it("réponse d'écriture non signée (démonstration) sous un nom de lecture : refusée (marques d'écriture)", async () => {
    const b = bancReel();
    const rep = emballer(null, "demonstration", { etat: "preparee", cle_idempotence: "x-12345678", action: { parametres: { sessions: 48211 } } }, { service: "crm", outil: "crm_contacts" });
    await expect(
      b.services.routes["tache.donnees.deposer"]!({ cle: "tache.donnees.deposer", params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: agent, corps: { service: "crm", outil: "crm_contacts", reponse: rep } }),
    ).rejects.toMatchObject({ code: "entree_invalide" });
  });

  it("nom d'outil d'écriture : refusé même pour une réponse sans aucune autre marque d'écriture", async () => {
    const b = bancReel();
    const rep = emballer(null, "demonstration", { rows: [{ sessions: 120 }] }, { service: "facebook", outil: "facebook_publier" });
    await expect(
      b.services.routes["tache.donnees.deposer"]!({ cle: "tache.donnees.deposer", params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: agent, corps: { service: "facebook", outil: "facebook_publier", reponse: rep } }),
    ).rejects.toMatchObject({ code: "entree_invalide", message: expect.stringMatching(/outil d'écriture \(facebook_publier\)/u) });
    // La même réponse sous un nom de lecture est acceptée (démonstration) : seul le nom a causé le refus.
    const ok = await b.services.routes["tache.donnees.deposer"]!({ cle: "tache.donnees.deposer", params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: agent, corps: { service: "facebook", outil: "facebook_publications", reponse: rep } });
    expect(ok.corps).toMatchObject({ mode: "demonstration" });
  });

  it("charge sans nature d'outil (ancienne passerelle) : traitée comme écriture, refusée", () => {
    const ancien = new P.SignataireEnveloppe(GW.privee);
    const structure: Record<string, unknown> = { rows: [{ sessions: 120 }], _atelier: { mode: "reel" } };
    // Signature d'une charge v1 SANS `ecriture` (format d'avant la passerelle v1.6).
    (structure._atelier as Record<string, unknown>).signature = ancien.signer({ mode: "reel", service: "ga4", outil: "ga4_rapport", erreur: false, compte: "p", args: {}, ecriture: undefined as never, structure });
    const d = deduireModeReponse({ structuredContent: structure }, { clesPubliques: [GW.publique], service: "ga4", outil: "ga4_rapport", arguments: {}, maintenant: new Date() });
    expect(d.ok ? "" : d.raison).toMatch(/outil d'écriture/u);
  });
});

/* ------------------------------------------------------------------ */
/* F-C (S-1) : l'appel signé est celui que l'humain a approuvé           */
/* ------------------------------------------------------------------ */

describe("S-1 : seul l'appel EXACT approuvé par l'humain est signé", () => {
  const corpsRevision = [
    "# Relance des devis non signés (révision approuvée)",
    "Cible : Jean Dupont, contact HubSpot 1001, passer hs_lead_status à IN_PROGRESS.",
    "Note interne : ne PAS contacter Marie Lambert (contact 2002), litige en cours ; dernier tarif concédé 30 %.",
    "Post Facebook : « Portes ouvertes samedi de 10 h à 16 h, hors jours fériés. »",
    "Source consultée : https://concurrent-renov.example/promo-ete",
  ].join("\n");
  const approuve = (appel: { service: string; outil: string; compte: string; arguments: Record<string, unknown> }) => ({ id: "aaaaaaaa-0000-4000-8000-000000000009", service: appel.service, outil: appel.outil, compte: appel.compte, empreinte: empreinteAppel(appel) });
  const preuve = (portee: Record<string, unknown>, demande: Record<string, unknown>) =>
    preparerPreuve({
      mode: "reel", diffusionId: "dif-1", entreprise: "ent-1", corpsRevision, clePrivee: PLUGIN.privee, maintenant: MAINTENANT,
      decision: { id: "dec-1", creeLe: MAINTENANT.toISOString(), portee: { revisionId: "rev-1", audience: null, montantMaxCents: null, dureeJours: null, ...portee } as any },
      demande: { cleIdempotence: "cle-agent-0001", ...demande } as EntreePreuve["demande"],
    });

  const crmApprouve = { service: "crm", outil: "crm_modifier_contact", compte: "portail-42", arguments: { contact_id: "1001", properties: { hs_lead_status: "IN_PROGRESS" } } };
  const porteeCrm = { action: "modifier_crm", canal: "hubspot", compte: "portail-42", appel: approuve(crmApprouve) };
  const pubApprouve = { service: "facebook", outil: "facebook_publier", compte: "page-7", arguments: { message: "Portes ouvertes samedi de 10 h à 16 h, hors jours fériés." } };
  const porteePub = { action: "publier", canal: "facebook", compte: "page-7", appel: approuve(pubApprouve) };
  const msgApprouve = { service: "facebook", outil: "facebook_envoyer_message", compte: "page-7", arguments: { destinataire: "PSID-de-jean-dupont", texte: "Portes ouvertes samedi" } };
  const porteeMsg = { action: "envoyer", canal: "facebook", compte: "page-7", audience: "clients ayant écrit cette semaine", appel: approuve(msgApprouve) };

  it("l'appel approuvé lui-même est signé, avec une clé d'idempotence dérivée de la diffusion, et accepté par la passerelle", () => {
    const r = preuve(porteeCrm, { action: "modifier_crm", canal: "hubspot", ...crmApprouve });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.charge.cle).toBe(cleIdempotenceSignee("dif-1"));
    expect(VERIFICATEUR.verifier(r.preuve, { service: "crm", outil: "crm_modifier_contact", args: crmApprouve.arguments, compte: "portail-42", maintenantS: S }).ok).toBe(true);
  });

  const attaques: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ["F-C 1 : autre contact (2002, exclu par la note interne)", porteeCrm, { action: "modifier_crm", canal: "hubspot", ...crmApprouve, arguments: { contact_id: "2002", properties: { hs_lead_status: "IN_PROGRESS" } } }],
    ["F-C 1 bis : autre propriété CRM (nom), même valeur", porteeCrm, { action: "modifier_crm", canal: "hubspot", ...crmApprouve, arguments: { contact_id: "1001", properties: { lifecyclestage: "IN_PROGRESS" } } }],
    ["F-C 2 : fragment de note interne publié avec le lien du concurrent", porteePub, { action: "publier", canal: "facebook", ...pubApprouve, arguments: { message: "dernier tarif concédé 30 %", link: "https://concurrent-renov.example/promo-ete" } }],
    ["F-C 2 bis : texte approuvé + lien ajouté", porteePub, { action: "publier", canal: "facebook", ...pubApprouve, arguments: { ...pubApprouve.arguments, link: "https://concurrent-renov.example/promo-ete" } }],
    ["F-C 3 : message privé à un autre destinataire", porteeMsg, { action: "envoyer", canal: "facebook", ...msgApprouve, arguments: { destinataire: "PSID-de-n-importe-qui", texte: "Portes ouvertes samedi" } }],
    ["F-C 4 : valeur CRM « 1 »", porteeCrm, { action: "modifier_crm", canal: "hubspot", ...crmApprouve, arguments: { contact_id: "1001", properties: { lifecyclestage: "1" } } }],
  ];
  for (const [nom, portee, demande] of attaques) {
    it(`${nom} : rien n'est signé`, () => {
      const r = preuve(portee, demande);
      expect(r.ok).toBe(false);
      expect(r.ok ? "" : r.motif).toMatch(/pas celui que l'humain a approuvé|ne figure pas/u);
    });
  }

  it("approbation sans appel exact : aucune preuve, même pour un appel dont tout le texte figure dans la révision", () => {
    const r = preuve({ ...porteePub, appel: null }, { action: "publier", canal: "facebook", ...pubApprouve });
    expect(r.ok ? "" : r.motif).toMatch(/aucun appel d'outil précis/u);
  });

  it("l'empreinte d'appel lie compte, outil, service et chaque argument ; l'ordre des clés ne compte pas", () => {
    const base = empreinteAppel(crmApprouve);
    expect(empreinteAppel({ ...crmApprouve, compte: "portail-43" })).not.toBe(base);
    expect(empreinteAppel({ ...crmApprouve, outil: "crm_modifier_contact_bis" })).not.toBe(base);
    expect(empreinteAppel({ ...crmApprouve, arguments: { properties: { hs_lead_status: "IN_PROGRESS" }, contact_id: "1001" } })).toBe(base);
  });
});

/* ------------------------------------------------------------------ */
/* Parcours complet : proposition, approbation, diffusion (services)    */
/* ------------------------------------------------------------------ */

const CORPS = "# Publication LinkedIn\n\nNouveau chantier à Seraing : toiture terminée en 3 jours.\n";
const ARGS_LI = { commentary: "Nouveau chantier à Seraing : toiture terminée en 3 jours." };
const COMPTE_LI = "urn:li:organization:42";

function bancReel(o: { config?: Record<string, unknown> } = {}) {
  const b = creerBanc({
    mode: "reel", modeEntreprise: "reel", secret: PLUGIN.priveePem,
    config: o.config ?? { approbationClePrivee: { type: "secret_ref", secretId: "11111111-2222-4333-8444-555555555555" }, passerelleClesPubliques: [GW.publiqueBase64] },
  });
  b.tacheSousPorte({ status: "done", etape: null, corps: CORPS });
  b.passe();
  return { ...b, services: creerServices(b.ctx, { base: b.base }) };
}
type Banc = ReturnType<typeof bancReel>;
const route = (b: Banc, cle: string, acteur: ActeurHote, corps: unknown, params: Record<string, string> = { issueId: ISSUE }) =>
  (b.services.routes as Record<string, any>)[cle]!({ cle, params, query: { companyId: SOC }, companyId: SOC, acteur, corps });

async function proposerEtApprouver(b: Banc, args: Record<string, unknown> = ARGS_LI) {
  const p = await route(b, "tache.appels.proposer", agent, { revisionId: REV1, service: "linkedin", outil: "linkedin_publier", compte: COMPTE_LI, arguments: args });
  const appel = p.corps as any;
  await route(b, "tache.decision", humain, {
    revisionId: REV1, action: "approuver", commentaire: "Appel vu et approuvé.",
    portee: { revisionId: REV1, action: "publier", canal: "linkedin", compte: COMPTE_LI, audience: null, montantMaxCents: null, dureeJours: 30, appel: appel.approbation },
  });
  return appel;
}
const demander = (b: Banc, o: Record<string, unknown> = {}) =>
  route(b, "tache.diffusions", agent, { revisionId: REV1, action: "publier", canal: "linkedin", compte: COMPTE_LI, cleIdempotence: "linkedin-publication-1", service: "linkedin", outil: "linkedin_publier", arguments: ARGS_LI, ...o });

describe("S-1 : parcours complet (l'agent propose, l'humain approuve l'empreinte, l'agent diffuse)", () => {
  it("proposition : aperçu complet (outil, compte, texte) et empreinte ; idempotente ; visible dans le dossier", async () => {
    const b = bancReel();
    const r = await route(b, "tache.appels.proposer", agent, { revisionId: REV1, service: "linkedin", outil: "linkedin_publier", compte: COMPTE_LI, arguments: ARGS_LI });
    expect(r.statut).toBe(201);
    const a = r.corps as any;
    expect(a.empreinte).toBe(empreinteAppel({ service: "linkedin", outil: "linkedin_publier", compte: COMPTE_LI, arguments: ARGS_LI }));
    expect(a.apercu.cibles).toContainEqual({ champ: "compte", libelle: "Compte", valeur: COMPTE_LI });
    expect(a.apercu.textes).toEqual([{ champ: "commentary", libelle: "Texte publié", valeur: ARGS_LI.commentary }]);
    expect(a.approbation).toEqual({ id: a.id, service: "linkedin", outil: "linkedin_publier", compte: COMPTE_LI, empreinte: a.empreinte });
    expect((await route(b, "tache.appels.proposer", agent, { revisionId: REV1, service: "linkedin", outil: "linkedin_publier", compte: COMPTE_LI, arguments: ARGS_LI })).statut).toBe(200);
    expect(b.t.appels).toHaveLength(1);
    const dossier = (await (b.services.donnees as any)["atelier.dossier"]({ issueId: ISSUE }, SOC)) as any;
    expect(dossier.appelsProposes).toHaveLength(1);
    expect(dossier.appelsProposes[0]).toMatchObject({ id: a.id, revisionCourante: true });
  });

  it("proposition refusée : texte absent de la révision, argument inconnu, autre révision, outil de lecture", async () => {
    const b = bancReel();
    const proposer = (o: Record<string, unknown>) => route(b, "tache.appels.proposer", agent, { revisionId: REV1, service: "linkedin", outil: "linkedin_publier", compte: COMPTE_LI, arguments: ARGS_LI, ...o });
    await expect(proposer({ arguments: { commentary: "Promotion -50 % !" } })).rejects.toMatchObject({ code: "entree_invalide" });
    await expect(proposer({ arguments: { ...ARGS_LI, visibility: "PUBLIC" } })).rejects.toMatchObject({ code: "entree_invalide" });
    await expect(proposer({ revisionId: REV2 })).rejects.toMatchObject({ code: "revision_perimee" });
    await expect(proposer({ outil: "linkedin_publications" })).rejects.toMatchObject({ code: "entree_invalide" });
    expect(b.t.appels).toHaveLength(0);
  });

  it("approbation de l'empreinte puis demande du même appel : preuve signée et acceptée par la passerelle", async () => {
    const b = bancReel();
    await proposerEtApprouver(b);
    const r = await demander(b);
    const d = r.corps as any;
    expect(d).toMatchObject({ etat: "preparee", motifRefus: null });
    expect(VERIFICATEUR.verifier(d.preuveApprobation, { service: "linkedin", outil: "linkedin_publier", args: ARGS_LI, compte: COMPTE_LI, maintenantS: Math.floor(Date.now() / 1000) }).ok).toBe(true);
  });

  it("demande d'un autre appel que celui approuvé : préparée SANS preuve", async () => {
    const b = bancReel();
    await proposerEtApprouver(b);
    const r = await demander(b, { arguments: { commentary: "Nouveau chantier à Seraing" } });
    expect(r.corps).toMatchObject({ etat: "preparee", preuveApprobation: null });
    expect((r.corps as any).motifRefus).toMatch(/pas celui que l'humain a approuvé/u);
  });

  it("décision refusée : empreinte qui ne correspond pas à l'appel proposé, appel inconnu, canal d'un autre service", async () => {
    const b = bancReel();
    const p = (await route(b, "tache.appels.proposer", agent, { revisionId: REV1, service: "linkedin", outil: "linkedin_publier", compte: COMPTE_LI, arguments: ARGS_LI })).corps as any;
    const decider = (portee: Record<string, unknown>) =>
      route(b, "tache.decision", humain, { revisionId: REV1, action: "approuver", commentaire: "ok", portee: { revisionId: REV1, action: "publier", canal: "linkedin", compte: COMPTE_LI, audience: null, montantMaxCents: null, dureeJours: 30, ...portee } });
    await expect(decider({ appel: { ...p.approbation, empreinte: "0".repeat(64) } })).rejects.toMatchObject({ code: "entree_invalide" });
    await expect(decider({ appel: { ...p.approbation, id: "bbbbbbbb-0000-4000-8000-000000000000" } })).rejects.toMatchObject({ code: "entree_invalide" });
    await expect(decider({ appel: p.approbation, canal: "facebook" })).rejects.toMatchObject({ code: "entree_invalide" });
    await expect(decider({ appel: p.approbation, compte: "urn:li:organization:7" })).rejects.toMatchObject({ code: "entree_invalide" });
    expect(b.t.decisions).toHaveLength(0);
  });

  it("modifier_crm : ni audience ni montant dans la portée", async () => {
    const b = bancReel();
    await expect(
      route(b, "tache.decision", humain, { revisionId: REV1, action: "approuver", commentaire: "ok", portee: { revisionId: REV1, action: "modifier_crm", canal: "hubspot", compte: "portail-1", audience: "tous", montantMaxCents: null, dureeJours: null } }),
    ).rejects.toMatchObject({ code: "entree_invalide" });
  });

  it("interface en mode réel : « Diffuser » sans appel est refusé (la diffusion part de l'agent)", async () => {
    const b = bancReel();
    await proposerEtApprouver(b);
    await expect((b.services.actions as any)["atelier.diffusion.demander"]({ issueId: ISSUE, revisionId: REV1, action: "publier", canal: "linkedin", compte: COMPTE_LI, cleIdempotence: "ui-cle-000001" }, SOC, humain)).rejects.toMatchObject({ code: "conflit" });
    expect(b.t.diffusions).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* F-D (S-4) : pas de nouvelle expiration au rejeu                      */
/* ------------------------------------------------------------------ */

describe("S-4 : la preuve est figée à la première signature", () => {
  it("F-D (règle) : rejeu 8 jours plus tard avec la charge figée : refus (avant : nouvelle preuve, double exécution)", () => {
    const appel = { service: "facebook", outil: "facebook_publier", compte: "page-7", arguments: { message: "Portes ouvertes samedi de 10 h à 16 h." } };
    const e = (maintenant: Date, chargeFigee?: any): EntreePreuve => ({
      mode: "reel", diffusionId: "dif-9", entreprise: "ent-9", corpsRevision: appel.arguments.message, clePrivee: PLUGIN.privee, maintenant, chargeFigee,
      decision: { id: "dec-9", creeLe: MAINTENANT.toISOString(), portee: { revisionId: "r", action: "publier", canal: "facebook", compte: "page-7", audience: null, montantMaxCents: null, dureeJours: null, appel: { id: "aaaaaaaa-0000-4000-8000-000000000001", ...appel, empreinte: empreinteAppel(appel) } } },
      demande: { action: "publier", canal: "facebook", cleIdempotence: "cle-pub-0009", ...appel },
    });
    const p1 = preparerPreuve(e(MAINTENANT));
    expect(p1.ok).toBe(true);
    if (!p1.ok) return;
    const uneHeure = preparerPreuve(e(new Date(MAINTENANT.getTime() + 3_600_000), p1.charge));
    expect(uneHeure.ok && uneHeure.preuve).toBe(p1.preuve);
    const huitJours = preparerPreuve(e(new Date(MAINTENANT.getTime() + 8 * 86_400_000), p1.charge));
    expect(huitJours.ok ? "" : huitJours.motif).toMatch(/a expiré/u);
    // Charge figée d'un autre appel : rien n'est signé.
    expect(preparerPreuve(e(MAINTENANT, { ...p1.charge, diffusion: "autre" })).ok).toBe(false);
    // Lien à l'entreprise : la charge signée porte l'entreprise ; une charge figée d'une autre entreprise est refusée.
    expect(p1.charge.entreprise).toBe("ent-9");
    const autreEntreprise = preparerPreuve(e(MAINTENANT, { ...p1.charge, entreprise: "ent-autre" }));
    expect(autreEntreprise.ok ? "" : autreEntreprise.motif).toMatch(/autre entreprise/u);
    // Une charge figée antérieure sans entreprise reste re-signée à l'identique.
    const { entreprise: _e, ...sansEntreprise } = p1.charge;
    const ancienne = preparerPreuve(e(MAINTENANT, sansEntreprise));
    expect(ancienne.ok).toBe(true);
  });

  it("F-D (service) : même jeton au rejeu, puis refus après expiration ; l'expiration est exposée", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MAINTENANT);
    const b = bancReel();
    await proposerEtApprouver(b);
    const premiere = (await demander(b)).corps as any;
    expect(premiere.preuveExpire).toBe(S + 7 * 86_400);
    vi.setSystemTime(new Date(MAINTENANT.getTime() + 2 * 86_400_000));
    const rejeu = (await demander(b)).corps as any;
    expect(rejeu.preuveApprobation).toBe(premiere.preuveApprobation);
    expect(rejeu.preuveExpire).toBe(premiere.preuveExpire);
    vi.setSystemTime(new Date(MAINTENANT.getTime() + 8 * 86_400_000));
    const tard = (await demander(b)).corps as any;
    expect(tard.preuveApprobation).toBeNull();
    expect(tard.motifRefus).toMatch(/a expiré/u);
  });
});

/* ------------------------------------------------------------------ */
/* S-6 : arguments obligatoires et compte contrôlé au dépôt              */
/* ------------------------------------------------------------------ */

describe("S-6 : dépôt réel lié à son appel et à son compte", () => {
  const ARGS = { debut: "2026-09-01", fin: "2026-09-30" };
  const rep = (compte: string, clicks = 412) => emballer(SIGNATAIRE, "reel", { siteUrl: compte, rows: [{ keys: ["toiture"], clicks }] }, { service: "gsc", outil: "gsc_requete_performances", compte, args: ARGS });
  const deposer = (b: Banc, corps: Record<string, unknown>) =>
    route(b, "tache.donnees.deposer", agent, { service: "gsc", outil: "gsc_requete_performances", ...corps });

  it("sans arguments : refusé ; compte déclaré différent du compte signé : refusé", async () => {
    const b = bancReel();
    await expect(deposer(b, { reponse: rep("sc-domain:client-reel.be") })).rejects.toMatchObject({ code: "entree_invalide", message: expect.stringMatching(/arguments de l'appel non déclarés/u) });
    await expect(deposer(b, { reponse: rep("sc-domain:client-reel.be"), arguments: ARGS, compte: "sc-domain:autre-client.be" })).rejects.toMatchObject({ code: "entree_invalide" });
    expect(b.t.sources).toHaveLength(0);
  });

  it("une seule propriété par service et par campagne : la propriété d'un autre client est refusée", async () => {
    const b = bancReel();
    const ok = await deposer(b, { reponse: rep("sc-domain:client-reel.be"), arguments: ARGS, compte: "sc-domain:client-reel.be" });
    expect(ok.corps).toMatchObject({ mode: "reel" });
    expect(b.t.sources[0]!.connexion.compte).toBe("sc-domain:client-reel.be");
    await expect(deposer(b, { reponse: rep("sc-domain:autre-client.be", 9999), arguments: ARGS })).rejects.toMatchObject({ code: "entree_invalide", message: expect.stringMatching(/autre propriété/u) });
    expect((await deposer(b, { reponse: rep("sc-domain:client-reel.be", 413), arguments: ARGS })).corps).toMatchObject({ mode: "reel" });
    expect(b.t.sources).toHaveLength(2);
  });

  it("les chiffres retenus d'une réponse authentique sont ceux de la structure signée", () => {
    const d = deduireModeReponse(rep("sc-domain:client-reel.be"), { clesPubliques: [GW.publique], service: "gsc", outil: "gsc_requete_performances", arguments: ARGS, maintenant: new Date() });
    expect(d.ok && extraireChiffres(d.structures).map((c) => c.valeur)).toEqual([412]);
  });
});

/* ------------------------------------------------------------------ */
/* S-7 : révocation d'une preuve remise                                 */
/* ------------------------------------------------------------------ */

describe("S-7 : révocation des preuves remises", () => {
  it("nouvelle décision (demande de correction) : la preuve est révoquée et n'est plus rendue ; liste signée arv1", async () => {
    const b = bancReel();
    await proposerEtApprouver(b);
    const d = (await demander(b)).corps as any;
    await route(b, "tache.decision", humain, { revisionId: REV1, action: "demander_correction", commentaire: "Finalement non.", portee: null });
    expect(b.t.diffusions[0]!.revoqueeLe).toBeTruthy();
    const rejeu = (await demander(b)).corps as any;
    expect(rejeu.preuveApprobation).toBeNull();
    expect(rejeu.revocation).toMatchObject({ motif: expect.stringMatching(/demander_correction/u) });
    const liste = (await route(b, "preuves.revocations", agent, undefined, {})).corps as any;
    expect(liste.revoquees).toBe(1);
    const [prefixe, charge, sig] = String(liste.liste).split(".");
    expect(prefixe).toBe("arv1");
    expect(verify(null, Buffer.from(`${prefixe}.${charge}`, "utf8"), PLUGIN.publique, Buffer.from(sig!, "base64url"))).toBe(true);
    const c = JSON.parse(Buffer.from(charge!, "base64url").toString("utf8"));
    expect(c).toMatchObject({ v: 1, entreprise: SOC, revoquees: [{ diffusion: d.id, cle: cleIdempotenceSignee(d.id), expire: d.preuveExpire }] });
    // Une liste de révocation n'est jamais une preuve (préfixe distinct dans le corps signé).
    expect(VERIFICATEUR.verifier(liste.liste, { service: "linkedin", outil: "linkedin_publier", args: ARGS_LI, compte: COMPTE_LI, maintenantS: Math.floor(Date.now() / 1000) }).ok).toBe(false);
  });

  it("révocation humaine : refusée à un agent ; acceptée pour l'humain, idempotente, tracée", async () => {
    const b = bancReel();
    await proposerEtApprouver(b);
    const d = (await demander(b)).corps as any;
    const revoquer = (acteur: ActeurHote) => route(b, "tache.diffusions.revoquer", acteur, { motif: "texte à revoir" }, { issueId: ISSUE, diffusionId: d.id });
    await expect(revoquer(agent)).rejects.toMatchObject({ code: "elevation_refusee" });
    expect(((await revoquer(humain)).corps as any).revocation).toMatchObject({ motif: expect.stringMatching(/texte à revoir/u) });
    expect(((await revoquer(humain)).corps as any).revocation).toBeTruthy();
    expect(b.t.journal.filter((j) => j.type === "diffusion.preuve_revoquee")).toHaveLength(1);
    // L'approbation reste valide, mais la preuve révoquée n'est plus jamais rendue au rejeu.
    const rejeu = (await demander(b)).corps as any;
    expect(rejeu.preuveApprobation).toBeNull();
    expect(rejeu.motifRefus).toMatch(/preuve révoquée/u);
  });

  it("nouvelle révision du livrable : les preuves de l'ancienne révision sont révoquées", async () => {
    const b = bancReel();
    await proposerEtApprouver(b);
    await demander(b);
    b.documents.set(`${ISSUE}:livrable`, { ...b.documents.get(`${ISSUE}:livrable`), latestRevisionId: REV2, latestRevisionNumber: 2, body: "# Nouvelle version" });
    await b.evenements.get("issue.document.updated")!({ companyId: SOC, entityId: ISSUE, payload: { key: "livrable" } });
    expect(b.t.diffusions[0]!.revocationMotif).toMatch(/nouvelle révision 2/u);
  });
});

/* ------------------------------------------------------------------ */
/* S-8 : clés distinctes                                                */
/* ------------------------------------------------------------------ */

describe("S-8 : la clé d'approbation n'est jamais la clé de la passerelle", () => {
  it("même paire configurée des deux côtés : aucune preuve signée, motif explicite, aucune liste signée", async () => {
    const meme = generateKeyPairSync("ed25519");
    const b = creerBanc({
      mode: "reel", modeEntreprise: "reel", secret: meme.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      config: { approbationClePrivee: { type: "secret_ref", secretId: "x" }, passerelleClesPubliques: [meme.publicKey.export({ type: "spki", format: "der" }).toString("base64")] },
    });
    b.tacheSousPorte({ status: "done", etape: null, corps: CORPS });
    b.passe();
    const banc = { ...b, services: creerServices(b.ctx, { base: b.base }) };
    await proposerEtApprouver(banc);
    const r = (await demander(banc)).corps as any;
    expect(r).toMatchObject({ etat: "preparee", preuveApprobation: null });
    expect(r.motifRefus).toMatch(/même paire/u);
    await expect(route(banc, "preuves.revocations", agent, undefined, {})).rejects.toMatchObject({ code: "conflit" });
  });
});

describe("contrôle d'appel (règle pure)", () => {
  it("cible vide refusée ; outil inconnu refusé ; aperçu des propriétés CRM (noms et valeurs)", () => {
    expect(controlerAppel({ service: "facebook", outil: "facebook_envoyer_message", compte: "page-7", arguments: { destinataire: " ", texte: "Bonjour" } }, "Bonjour").ok).toBe(false);
    expect(controlerAppel({ service: "facebook", outil: "facebook_supprimer", compte: "page-7", arguments: {} }, "").ok).toBe(false);
    const c = controlerAppel({ service: "crm", outil: "crm_modifier_contact", compte: "portail-1", arguments: { contact_id: "1001", properties: { hs_lead_status: "IN_PROGRESS" } } }, "IN_PROGRESS");
    expect(c.ok && c.apercu.proprietes).toEqual([{ champ: "properties.hs_lead_status", libelle: "Propriété « hs_lead_status »", valeur: "IN_PROGRESS" }]);
    expect(c.ok && c.apercu.cibles).toContainEqual({ champ: "contact_id", libelle: "Contact modifié", valeur: "1001" });
  });
});
