/**
 * Revue de sécurité de la passerelle, §6 (preuve d'approbation signée par le plugin) et §6 bis
 * (signature `_atelier` vérifiée au dépôt). Interopérabilité prouvée avec le code RÉEL de la
 * passerelle : `VerificateurPreuves` vérifie les preuves du plugin, `SignataireEnveloppe` signe
 * les réponses que le plugin vérifie (mêmes paires de clés).
 */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { preparerPreuve, type EntreePreuve } from "../src/serveur/preuve-approbation.js";
import { deduireModeReponse } from "../src/serveur/regles-donnees.js";
import { creerServices } from "../src/serveur/services.js";
import { cleIdempotenceSignee, empreinteAppel, empreinteArguments, lireClePrivee, verifierEnveloppe } from "../src/serveur/signatures.js";
import { ISSUE, PRODUCTEUR, REV1, SOC, creerBanc } from "./outils-base.js";
import { avecListeFraiche, emballer, paireEd25519, passerelle } from "./outils-passerelle.js";
import { signerRevocations } from "../src/serveur/signatures.js";

const P = await passerelle();
const PLUGIN = paireEd25519(); // clé d'approbation du plugin (privée : secret natif)
const GW = paireEd25519(); // clé de signature de la passerelle (publique : configuration du plugin)
const SIGNATAIRE = new P.SignataireEnveloppe(GW.privee);
const VERIFICATEUR = avecListeFraiche(new P.VerificateurPreuves(PLUGIN.publiquePem), PLUGIN.privee, signerRevocations);
const MAINTENANT = new Date("2026-10-16T09:00:00Z");
const S = Math.floor(MAINTENANT.getTime() / 1000);

const CORPS = "# Publication LinkedIn\n\nNouveau chantier à Seraing : toiture terminée en 3 jours.\n";
const PORTEE = { revisionId: REV1, action: "publier" as const, canal: "linkedin", compte: "urn:li:organization:42", audience: null, montantMaxCents: null, dureeJours: 30 };
const ARGS = { commentary: "Nouveau chantier à Seraing : toiture terminée en 3 jours." };

type Surcharge = Omit<Partial<EntreePreuve>, "demande"> & { demande?: Partial<EntreePreuve["demande"]>; portee?: { [K in keyof typeof PORTEE]?: unknown } & { appel?: unknown } };

/** v1.6 (S-1) : appel approuvé par l'humain = empreinte de l'appel demandé (sauf surcharge explicite). */
function appelApprouve(d: EntreePreuve["demande"]) {
  if (!d.service || !d.outil || !d.arguments || !d.compte) return null;
  return { id: "aaaaaaaa-0000-4000-8000-000000000001", service: d.service, outil: d.outil, compte: d.compte, empreinte: empreinteAppel({ service: d.service, outil: d.outil, compte: d.compte, arguments: d.arguments }) };
}

function entree(o: Surcharge = {}): EntreePreuve {
  const demande = { action: "publier", canal: "linkedin", compte: "urn:li:organization:42", cleIdempotence: "diff-cle-0001", service: "linkedin", outil: "linkedin_publier", arguments: ARGS, ...o.demande } as EntreePreuve["demande"];
  return {
    mode: "reel",
    demande,
    decision: { id: "dec-1", creeLe: "2026-10-15T10:00:00.000Z", portee: { ...PORTEE, appel: appelApprouve(demande), ...o.portee } },
    diffusionId: "diffusion-1",
    corpsRevision: CORPS,
    clePrivee: PLUGIN.privee,
    maintenant: MAINTENANT,
    ...Object.fromEntries(Object.entries(o).filter(([k]) => !["demande", "portee"].includes(k))),
  } as EntreePreuve;
}

describe("§6 : preuve d'approbation signée par le plugin", () => {
  it("le JSON canonique et l'empreinte des arguments sont ceux de la passerelle", () => {
    const args = { b: [1, { z: true, a: null }], a: "é", preuve_approbation: "ignorée" };
    expect(empreinteArguments(args)).toBe(P.empreinteArguments(args));
  });

  it("preuve acceptée par le VerificateurPreuves de la passerelle (service, outil, arguments, compte, expiration)", () => {
    const r = preparerPreuve(entree());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // v1.6 (S-5) : la clé d'idempotence signée dérive de la diffusion, jamais de la valeur de l'agent.
    expect(r.charge).toMatchObject({ v: 1, cle: cleIdempotenceSignee("diffusion-1"), service: "linkedin", outil: "linkedin_publier", compte: "urn:li:organization:42", diffusion: "diffusion-1", decision: "dec-1", emis: S });
    expect(r.charge.expire).toBe(S + 7 * 86400);
    const v = VERIFICATEUR.verifier(r.preuve, { service: "linkedin", outil: "linkedin_publier", args: ARGS, compte: "urn:li:organization:42", maintenantS: S });
    expect(v.ok).toBe(true);
    // Autres arguments, autre compte : la passerelle refuse la même preuve.
    expect(VERIFICATEUR.verifier(r.preuve, { service: "linkedin", outil: "linkedin_publier", args: { commentary: "Autre texte" }, compte: "urn:li:organization:42", maintenantS: S }).ok).toBe(false);
    expect(VERIFICATEUR.verifier(r.preuve, { service: "linkedin", outil: "linkedin_publier", args: ARGS, compte: "urn:li:organization:7", maintenantS: S }).ok).toBe(false);
    // Une clé qui n'est pas celle du plugin ne produit pas de preuve valide.
    const autre = preparerPreuve(entree({ clePrivee: paireEd25519().privee }));
    expect(autre.ok && VERIFICATEUR.verifier(autre.preuve, { service: "linkedin", outil: "linkedin_publier", args: ARGS, compte: "urn:li:organization:42", maintenantS: S }).ok).toBe(false);
  });

  it("l'expiration ne dépasse ni 7 jours ni la durée de l'approbation", () => {
    const r = preparerPreuve(entree({ portee: { dureeJours: 2 } }));
    expect(r.ok && r.charge.expire).toBe(Math.floor(new Date("2026-10-15T10:00:00.000Z").getTime() / 1000) + 2 * 86400);
  });

  const refus: Array<[string, Parameters<typeof entree>[0], RegExp]> = [
    ["démonstration", { mode: "demonstration" }, /démonstration/u],
    ["campagne payante", { demande: { action: "activer_campagne_payante" } }, /payante/u],
    ["appel non précisé", { demande: { outil: undefined } }, /appel d'outil non précisé/u],
    ["outil inconnu", { demande: { outil: "linkedin_supprimer" } }, /outil d'écriture connu/u],
    ["outil d'un autre service", { demande: { service: "facebook" } }, /n'appartient pas au service/u],
    ["outil d'une autre action", { demande: { action: "envoyer" } }, /ne correspond pas à l'action/u],
    ["canal approuvé d'un autre service", { portee: { canal: "facebook" } }, /canal approuvé/u],
    ["compte null sur un réseau", { portee: { compte: null }, demande: { compte: null } }, /compte non lié/u],
    ["argument en trop", { demande: { arguments: { ...ARGS, visibility: "PUBLIC" } } }, /arguments inconnus/u],
    ["argument obligatoire absent", { demande: { arguments: {} } }, /obligatoires absents/u],
    ["texte absent de la révision approuvée", { demande: { arguments: { commentary: "Promotion : -50 % aujourd'hui !" } } }, /ne figure pas tel quel/u],
    ["aucune clé", { clePrivee: null, motifCle: "aucune clé d'approbation configurée" }, /aucune clé/u],
  ];
  for (const [nom, o, motif] of refus) {
    it(`jamais signée : ${nom}`, () => {
      const r = preparerPreuve(entree(o));
      expect(r.ok).toBe(false);
      expect(r.ok ? "" : r.motif).toMatch(motif);
    });
  }

  it("modification de CRM : chaque valeur écrite figure telle quelle dans la révision approuvée", () => {
    const base = { demande: { action: "modifier_crm", service: "crm", outil: "crm_modifier_contact", canal: "hubspot", compte: "portail-1" }, portee: { action: "modifier_crm" as never, canal: "hubspot", compte: "portail-1" } };
    const ok = preparerPreuve(entree({ ...base, corpsRevision: "Passer le contact en lifecyclestage customer.", demande: { ...base.demande, arguments: { contact_id: "123", properties: { lifecyclestage: "customer" } } } }));
    expect(ok.ok).toBe(true);
    const ko = preparerPreuve(entree({ ...base, corpsRevision: "Passer le contact en client.", demande: { ...base.demande, arguments: { contact_id: "123", properties: { lifecyclestage: "customer" } } } }));
    expect(ko.ok ? "" : ko.motif).toMatch(/properties\.lifecyclestage/u);
  });
});

describe("§6 bis : signature `_atelier` vérifiée au dépôt", () => {
  const ARGS_GSC = { debut: "2026-09-01", fin: "2026-09-30" };
  // v1.6 (S-6) : une réponse réelle se dépose toujours avec les arguments exacts de son appel.
  const verif = { clesPubliques: [GW.publique], service: "gsc", outil: "gsc_requete_performances", arguments: ARGS_GSC as Record<string, unknown>, maintenant: MAINTENANT };
  const signer = (o: { mode?: "demonstration" | "reel"; outil?: string; erreur?: boolean; maintenant?: number; signataire?: InstanceType<typeof P.SignataireEnveloppe> | null } = {}) => {
    const signataire = o.signataire === null ? null : o.signataire ?? (o.maintenant ? new P.SignataireEnveloppe(GW.privee, () => o.maintenant!) : new P.SignataireEnveloppe(GW.privee, () => MAINTENANT.getTime()));
    return emballer(signataire, o.mode ?? "reel", { siteUrl: "sc-domain:client-reel.be", rows: [{ keys: ["toiture"], clicks: 412 }] }, { service: "gsc", outil: o.outil ?? "gsc_requete_performances", compte: "sc-domain:client-reel.be", args: ARGS_GSC, erreur: o.erreur ?? false }) as { texte: string; structuredContent: Record<string, unknown> & { _atelier: Record<string, unknown> } };
  };

  it("réponse signée par la passerelle : réelle (structure et texte seul)", () => {
    const r = signer();
    expect(deduireModeReponse(r, verif)).toMatchObject({ ok: true, mode: "reel" });
    expect(deduireModeReponse({ texte: r.texte }, verif)).toMatchObject({ ok: true, mode: "reel" });
    expect(deduireModeReponse(r, { ...verif, arguments: ARGS_GSC })).toMatchObject({ ok: true, mode: "reel" });
    expect(verifierEnveloppe(r.structuredContent, [GW.publique]).ok).toBe(true);
    expect(P.verifierEnveloppe(r.structuredContent, GW.publiqueBase64).ok).toBe(true);
  });

  const refusees: Array<[string, () => { texte?: string; structuredContent?: Record<string, unknown> }, Partial<typeof verif> & { arguments?: Record<string, unknown> }]> = [
    ["arguments non déclarés (v1.6, S-6)", () => signer(), { arguments: undefined }],
    ["mode passé de démonstration à réel", () => {
      const r = signer({ mode: "demonstration" });
      return { structuredContent: { ...r.structuredContent, siteUrl: "sc-domain:client-reel.be", _atelier: { ...r.structuredContent._atelier, mode: "reel", mention: undefined } } };
    }, {}],
    ["chiffre modifié", () => {
      const r = signer();
      return { structuredContent: { ...r.structuredContent, rows: [{ keys: ["toiture"], clicks: 4120 }] } };
    }, {}],
    ["signature retirée", () => {
      const r = signer();
      const { signature: _s, ...atelier } = r.structuredContent._atelier;
      return { structuredContent: { ...r.structuredContent, _atelier: atelier } };
    }, {}],
    ["autre clé", () => signer({ signataire: new P.SignataireEnveloppe(paireEd25519().privee, () => MAINTENANT.getTime()) }), {}],
    ["autre outil", () => signer({ outil: "gsc_sitemaps" }), {}],
    ["autre service déclaré", () => signer(), { service: "ga4" }],
    ["erreur de l'outil", () => signer({ erreur: true }), {}],
    ["émise dans le futur", () => signer({ maintenant: MAINTENANT.getTime() + 600_000 }), {}],
    ["trop ancienne (rejeu)", () => signer({ maintenant: MAINTENANT.getTime() - 8 * 86_400_000 }), {}],
    ["autres arguments déclarés (rejeu)", () => signer(), { arguments: { debut: "2025-01-01", fin: "2025-01-31" } }],
    ["aucune clé configurée", () => signer(), { clesPubliques: [] }],
  ];
  for (const [nom, reponse, surcharge] of refusees) {
    it(`jamais réelle : ${nom}`, () => {
      const d = deduireModeReponse(reponse(), { ...verif, ...surcharge } as typeof verif);
      expect(d.ok).toBe(false);
      expect(d.ok ? "" : d.raison).toMatch(/non signée par la passerelle/u);
    });
  }

  it("rotation : la clé ancienne et la nouvelle sont acceptées tant qu'elles sont configurées", () => {
    expect(deduireModeReponse(signer(), { ...verif, clesPubliques: [paireEd25519().publique, GW.publique] })).toMatchObject({ ok: true, mode: "reel" });
  });

  it("une réponse de démonstration non signée reste acceptée comme démonstration", () => {
    expect(deduireModeReponse(signer({ mode: "demonstration", signataire: null }), verif)).toMatchObject({ ok: true, mode: "demonstration" });
  });
});

describe("§6 : diffusion réelle, preuve, rejeu et issue (service complet)", () => {
  const humain: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
  const producteur: ActeurHote = { type: "agent", id: PRODUCTEUR, agentId: PRODUCTEUR, userId: null, runId: "run-1" };
  const APPEL = { id: "aaaaaaaa-0000-4000-8000-000000000001", service: "linkedin", outil: "linkedin_publier", compte: "urn:li:organization:42", empreinte: empreinteAppel({ service: "linkedin", outil: "linkedin_publier", compte: "urn:li:organization:42", arguments: ARGS }) };
  const demande = (o: Record<string, unknown> = {}) => ({
    revisionId: REV1, action: "publier", canal: "linkedin", compte: "urn:li:organization:42", cleIdempotence: "linkedin-publication-1",
    service: "linkedin", outil: "linkedin_publier", arguments: ARGS, ...o,
  });
  function banc(o: { secret?: string | null } = {}) {
    const b = creerBanc({
      mode: "reel", modeEntreprise: "reel", secret: o.secret === undefined ? PLUGIN.priveePem : o.secret,
      config: { approbationClePrivee: { type: "secret_ref", secretId: "11111111-2222-4333-8444-555555555555" }, passerelleClesPubliques: [GW.publiqueBase64] },
    });
    b.tacheSousPorte({ status: "done", etape: null, corps: CORPS });
    b.passe();
    b.decision({ portee: { ...PORTEE, appel: APPEL }, mode: "reel" });
    return { ...b, services: creerServices(b.ctx, { base: b.base }) };
  }
  const appeler = (b: ReturnType<typeof banc>, cle: string, acteur: ActeurHote, corps: unknown, params: Record<string, string> = { issueId: ISSUE }) =>
    b.services.routes[cle as "tache.diffusions"]!({ cle: cle as never, params, query: {}, companyId: SOC, acteur, corps });

  it("diffusion acceptée : « préparée » avec une preuve vérifiable par la passerelle ; la preuve n'est ni stockée ni journalisée", async () => {
    const b = banc();
    const r = await appeler(b, "tache.diffusions", producteur, demande());
    const corps = r.corps as { etat: string; preuveApprobation: string; id: string; motifRefus: string | null };
    expect(r.statut).toBe(201);
    expect(corps.etat).toBe("preparee");
    expect(corps.motifRefus).toBeNull();
    expect(VERIFICATEUR.verifier(corps.preuveApprobation, { service: "linkedin", outil: "linkedin_publier", args: ARGS, compte: "urn:li:organization:42", maintenantS: Math.floor(Date.now() / 1000) }).ok).toBe(true);
    const tout = JSON.stringify({ t: b.t, logs: b.journauxLogger, activite: b.activite });
    expect(tout).not.toContain(corps.preuveApprobation.split(".")[2]);
    expect(tout).not.toContain(PLUGIN.priveePem.split("\n")[1]);
    expect(b.t.journal.map((j) => j.type)).toEqual(["diffusion.preuve_signee", "diffusion.preparee"]);
    expect(b.t.diffusions[0]).toMatchObject({ service: "linkedin", outil: "linkedin_publier", empreinteArguments: empreinteArguments(ARGS) });
    // v1.6 (S-4) : la CHARGE est figée sur la diffusion (pas le jeton).
    expect(b.t.diffusions[0]!.preuveCharge).toMatchObject({ cle: cleIdempotenceSignee(corps.id), expire: expect.any(Number) });
  });

  it("rejeu de la même demande : preuve re-signée pour la même charge ; d'autres arguments avec la même clé : refus", async () => {
    const b = banc();
    const premiere = (await appeler(b, "tache.diffusions", producteur, demande())).corps as { id: string; preuveApprobation: string };
    const rejeu = await appeler(b, "tache.diffusions", producteur, demande());
    const preuve = (rejeu.corps as { preuveApprobation: string; id: string }).preuveApprobation;
    expect(rejeu.statut).toBe(200);
    // v1.6 (S-4) : même charge figée, même jeton (Ed25519 déterministe), jamais une nouvelle expiration.
    expect(preuve).toBe(premiere.preuveApprobation);
    expect((rejeu.corps as { id: string }).id).toBe(premiere.id);
    expect(VERIFICATEUR.verifier(preuve, { service: "linkedin", outil: "linkedin_publier", args: ARGS, compte: "urn:li:organization:42", maintenantS: Math.floor(Date.now() / 1000) }).ok).toBe(true);
    await expect(appeler(b, "tache.diffusions", producteur, demande({ arguments: { commentary: "Nouveau chantier à Seraing" } }))).rejects.toMatchObject({ code: "conflit" });
    expect(b.t.diffusions).toHaveLength(1);
  });

  it("clé absente ou secret illisible : « préparée » sans preuve, avec le motif", async () => {
    for (const secret of [null, "pas une clé"]) {
      const b = banc({ secret });
      const r = await appeler(b, "tache.diffusions", producteur, demande());
      expect(r.corps).toMatchObject({ etat: "preparee", preuveApprobation: null });
      expect(String((r.corps as { motifRefus: string }).motifRefus)).toMatch(/^Préparée seulement : clé d'approbation indisponible/u);
      expect(JSON.stringify(b.journauxLogger)).not.toContain("pas une clé");
    }
  });

  it("démonstration : jamais de preuve", async () => {
    const b = creerBanc({ mode: "demonstration", modeEntreprise: "demonstration", secret: PLUGIN.priveePem, config: { approbationClePrivee: { type: "secret_ref", secretId: "x" } } });
    b.tacheSousPorte({ status: "done", etape: null, corps: CORPS });
    b.passe();
    b.decision({ portee: PORTEE });
    const r = await creerServices(b.ctx, { base: b.base }).routes["tache.diffusions"]!({ cle: "tache.diffusions", params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: producteur, corps: demande() });
    expect(r.corps).toMatchObject({ etat: "simulee", preuveApprobation: null });
  });

  it("issue rapportée : réponse « executee » signée et liée → confirmée ; transition à sens unique", async () => {
    const b = banc();
    const d = (await appeler(b, "tache.diffusions", producteur, demande())).corps as { id: string };
    // v1.6 : la passerelle exécute sous la clé SIGNÉE de la preuve (dérivée de la diffusion) et signe la nature de l'outil.
    const reponse = (etat: string, o: { outil?: string; args?: unknown; cle?: string; signataire?: InstanceType<typeof P.SignataireEnveloppe>; executee?: boolean; ecriture?: boolean } = {}) =>
      emballer(o.signataire ?? SIGNATAIRE, "reel", { etat, executee: o.executee ?? etat === "executee", message: `Action ${etat}`, cle_idempotence: o.cle ?? cleIdempotenceSignee(d.id), action: { service: "linkedin", outil: "linkedin_publier", parametres: ARGS } },
        { service: "linkedin", outil: o.outil ?? "linkedin_publier", compte: "urn:li:organization:42", args: o.args ?? ARGS, ecriture: o.ecriture ?? true });
    const rapporter = (rep: unknown) => appeler(b, "tache.diffusions.issue", producteur, { reponse: rep }, { issueId: ISSUE, diffusionId: d.id });
    // Réponses non liées à cette diffusion : refusées, état inchangé.
    for (const mauvaise of [
      reponse("executee", { outil: "facebook_publier" }),
      reponse("executee", { args: { commentary: "autre" } }),
      reponse("executee", { cle: "autre-cle-0001" }),
      reponse("executee", { cle: "linkedin-publication-1" }), // clé de l'agent : n'est plus la clé signée (v1.6)
      reponse("executee", { executee: false }), // « executee » non attesté par la signature (v1.6)
      reponse("executee", { ecriture: false }), // réponse d'un outil de lecture (v1.6)
      reponse("executee", { signataire: new P.SignataireEnveloppe(paireEd25519().privee) }),
      emballer(null, "reel", { etat: "executee", cle_idempotence: "linkedin-publication-1" }, { service: "linkedin", outil: "linkedin_publier" }),
    ]) {
      await expect(rapporter(mauvaise)).rejects.toMatchObject({ code: "entree_invalide" });
    }
    expect(b.t.diffusions[0]!.etat).toBe("preparee");
    expect((await rapporter(reponse("ambigue_a_reconcilier"))).corps).toMatchObject({ etat: "ambigue_a_reconcilier" });
    expect((await rapporter(reponse("executee"))).corps).toMatchObject({ etat: "confirmee" });
    await expect(rapporter(reponse("executee"))).rejects.toMatchObject({ code: "conflit" });
    expect(b.t.journal.map((j) => j.type)).toContain("diffusion.confirmee");
  });

  it("la clé privée lue du secret est bien une Ed25519 (format PEM PKCS#8)", () => {
    expect(lireClePrivee(PLUGIN.priveePem).asymmetricKeyType).toBe("ed25519");
    expect(() => lireClePrivee("-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----")).toThrow(/^clé privée illisible/u);
  });
});
