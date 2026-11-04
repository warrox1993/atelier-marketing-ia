// LinkedIn, profil personnel (service linkedinprofil) : seconde application LinkedIn (Share on LinkedIn + OpenID
// Connect), auteur urn:li:person tiré de /v2/userinfo, publication seulement après approbation humaine signée, rejeu
// idempotent, réconciliation impossible (lecture des publications d'un membre réservée) donc jamais de second envoi.

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appeler, clientMcp, connecter, listeRevocations, monter, preuve, type Montage } from "./aide.js";
import { IDENTIFIANTS } from "./faux-plateformes.js";

let m: Montage;
let c: Client;
const POSTS = "POST /linkedin-api/rest/posts";
const effets = (): number => m.faux.effets.filter((e) => e.type === "linkedin_profil_publication").length;

beforeAll(async () => {
  m = await monter();
  const { jetons } = await connecter(m, "linkedinprofil");
  c = await clientMcp(m, "linkedinprofil", jetons.access_token);
});
afterAll(async () => {
  await c.close();
  await m.arreter();
});

describe("connexion du profil", () => {
  it("demande exactement openid, profile et w_member_social à la seconde application, retour sur /oauth/retour/linkedinprofil", () => {
    const aut = m.faux.appelsVers("GET /linkedin-www/oauth/v2/authorization").find((a) => a.requete.get("client_id") === IDENTIFIANTS.linkedinProfil.clientId)!;
    expect(aut, "aucune autorisation demandée avec l'application du profil").toBeDefined();
    expect(aut.requete.get("scope")!.split(" ").sort()).toEqual(["openid", "profile", "w_member_social"]);
    expect(aut.requete.get("redirect_uri")).toBe(m.social.autorisation.retourUri("linkedinprofil"));
    expect(aut.requete.get("redirect_uri")).toMatch(/\/oauth\/retour\/linkedinprofil$/);
  });

  it("refuse une portée de page (w_organization_social) : invalid_scope, sans appel à LinkedIn", async () => {
    const avant = m.faux.appels.length;
    const { retour } = await connecter(m, "linkedinprofil", { scope: "w_member_social w_organization_social" });
    expect(retour.get("error")).toBe("invalid_scope");
    expect(retour.get("error_description")).toMatch(/w_organization_social/);
    expect(m.faux.appels.length).toBe(avant);
  });

  it("le compte est la personne lue dans userinfo (urn:li:person:<sub>)", async () => {
    const r = await appeler(c, "atelier_identite", {});
    expect(JSON.stringify(r.donnees)).toContain("urn:li:person:782bbtaQ");
  });
});

describe("linkedin_profil_publier", () => {
  const args = { commentary: "Retour d'expérience : trois chantiers de toiture cet automne." };

  it("sans preuve : préparée, non exécutée, aucun appel à LinkedIn", async () => {
    const avant = m.faux.appelsVers(POSTS).length;
    const r = await appeler(c, "linkedin_profil_publier", args);
    expect(r.donnees, r.texte).toMatchObject({ etat: "preparee", executee: false, approbation_humaine_requise: true, action: { service: "linkedinprofil", outil: "linkedin_profil_publier", parametres: args } });
    expect(m.faux.appelsVers(POSTS).length).toBe(avant);
  });

  it("preuve sans compte (« tout compte ») refusée comme pour les autres réseaux sociaux", async () => {
    const avant = m.faux.appelsVers(POSTS).length;
    const r = await appeler(c, "linkedin_profil_publier", { ...args, preuve_approbation: preuve(m, "linkedinprofil", "linkedin_profil_publier", args, { compte: null }), revocations_approbation: listeRevocations(m) });
    expect(r.donnees.etat).toBe("preparee");
    expect(m.faux.appelsVers(POSTS).length).toBe(avant);
  });

  it("avec preuve : POST /rest/posts au nom de la personne, puis un rejeu ne publie rien de plus", async () => {
    const p = preuve(m, "linkedinprofil", "linkedin_profil_publier", args);
    const r = await appeler(c, "linkedin_profil_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(r.donnees, r.texte).toMatchObject({ etat: "executee", executee: true, resultat: { id: expect.stringMatching(/^urn:li:share:/) } });
    const envoi = m.faux.effets.at(-1)!;
    expect(envoi.donnees).toMatchObject({ author: "urn:li:person:782bbtaQ", commentary: args.commentary, lifecycleState: "PUBLISHED", visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED" } });
    expect(envoi.donnees["content"]).toBeUndefined();
    const appel = m.faux.appelsVers(POSTS).at(-1)!;
    expect(appel.entetes["linkedin-version"]).toBe("202610");
    expect(appel.entetes["x-restli-protocol-version"]).toBe("2.0.0");

    const n = effets();
    const rejeu = await appeler(c, "linkedin_profil_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(rejeu.donnees).toMatchObject({ etat: "executee", rejeu: true, resultat: { id: r.donnees.resultat.id } });
    expect(effets()).toBe(n);
  });

  it("lien facultatif : publié comme article (source et titre), jamais sans titre", async () => {
    const avecLien = { commentary: "Notre guide de l'isolation.", lien: "https://exemple.invalid/guide", titre_lien: "Guide de l'isolation" };
    const r = await appeler(c, "linkedin_profil_publier", { ...avecLien, preuve_approbation: preuve(m, "linkedinprofil", "linkedin_profil_publier", avecLien), revocations_approbation: listeRevocations(m) });
    expect(r.donnees, r.texte).toMatchObject({ etat: "executee" });
    expect(m.faux.effets.at(-1)!.donnees["content"]).toEqual({ article: { source: avecLien.lien, title: avecLien.titre_lien } });

    const avant = m.faux.appelsVers(POSTS).length;
    const sansTitre = { commentary: "Lien sans titre", lien: "https://exemple.invalid/x" };
    const refus = await appeler(c, "linkedin_profil_publier", { ...sansTitre, preuve_approbation: preuve(m, "linkedinprofil", "linkedin_profil_publier", sansTitre), revocations_approbation: listeRevocations(m) });
    expect(refus.erreur).toBe(true);
    expect(refus.texte).toMatch(/titre_lien/);
    expect(m.faux.appelsVers(POSTS).length).toBe(avant);
  });

  it("bornes : texte de 3000 caractères au plus, lien en https seulement (refus avant tout appel)", async () => {
    const avant = m.faux.appels.length;
    expect((await appeler(c, "linkedin_profil_publier", { commentary: "x".repeat(3001) })).erreur).toBe(true);
    expect((await appeler(c, "linkedin_profil_publier", { commentary: "ok", lien: "http://exemple.invalid/", titre_lien: "t" })).erreur).toBe(true);
    expect((await appeler(c, "linkedin_profil_publier", { commentary: "ok", lien: "https://exemple.invalid/", titre_lien: "t".repeat(400) })).erreur).toBe(true);
    expect(m.faux.appels.length).toBe(avant);
  });

  it("issue ambiguë : la relecture étant impossible, rien n'est renvoyé à LinkedIn au rejeu", async () => {
    const amb = { commentary: "Publication à l'issue incertaine" };
    const p = preuve(m, "linkedinprofil", "linkedin_profil_publier", amb);
    m.faux.injecter(POSTS, "coupure_apres_effet");
    const r1 = await appeler(c, "linkedin_profil_publier", { ...amb, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(r1.donnees.etat).toBe("ambigue_a_reconcilier");
    const avant = m.faux.appelsVers(POSTS).length;
    const r2 = await appeler(c, "linkedin_profil_publier", { ...amb, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(r2.donnees.etat).toBe("ambigue_a_reconcilier");
    expect(r2.donnees.message).toMatch(/Vérifier à la main/);
    expect(m.faux.appelsVers(POSTS).length).toBe(avant);
  });
});
