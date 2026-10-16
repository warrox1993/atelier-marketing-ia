// Mutations réelles : jamais sans preuve d'approbation, une seule fois avec preuve (même en cas de réessai),
// réconciliation avant tout nouvel essai après un résultat ambigu.

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appeler, clientMcp, connecter, monter, preuve, type Montage, listeRevocations } from "./aide.js";
import { ajouterMention, MENTION_IA_PAR_DEFAUT } from "../../src/mention-ia.js";
import { CLE_API_ODOO } from "./faux-plateformes.js";

let m: Montage;
const clients = new Map<string, Client>();
beforeAll(async () => {
  m = await monter();
  for (const [service, options] of [
    ["facebook", { choix: 0 }],
    ["instagram", {}],
    ["linkedin", {}],
    ["crm", {}],
    ["pipedrive", { oauthDepuisPage: true }],
    ["odoo", { formulaire: { instance: m.odoo19.base, cle: CLE_API_ODOO, base: "", identifiant: "" } }],
    ["teamleader", {}],
  ] as const) {
    const { jetons } = await connecter(m, service, options);
    clients.set(service, await clientMcp(m, service, jetons.access_token));
  }
});
afterAll(async () => {
  for (const c of clients.values()) await c.close();
  await m.arreter();
});

const fb = (): Client => clients.get("facebook")!;
const PUBLIER = "POST /meta-graph/v26.0/100000000000001/feed";
const effets = (type: string): number => m.faux.effets.filter((e) => e.type === type).length;

describe("sans preuve : préparée, non exécutée", () => {
  it("aucun appel à la plateforme, réponse de même forme qu'en démonstration", async () => {
    const avant = m.faux.appels.length;
    const args = { message: "Nouveauté : isolation des toitures" };
    const r = await appeler(fb(), "facebook_publier", args);
    expect(r.erreur).toBe(false);
    expect(r.donnees).toEqual({
      etat: "preparee",
      executee: false,
      message: expect.stringMatching(/^Action préparée, non exécutée : .*aucune preuve d'approbation/),
      approbation_humaine_requise: true,
      action: { service: "facebook", outil: "facebook_publier", requete_reelle_visee: "POST /{page-id}/feed", parametres: args },
    });
    expect(m.faux.appels.length).toBe(avant);
  });

  it("preuve pour un autre contenu, un autre outil ou un autre compte : préparée, rien n'est envoyé", async () => {
    const args = { message: "Texte approuvé" };
    const avant = m.faux.appelsVers(PUBLIER).length;
    const cas: [Record<string, unknown>, string, RegExp][] = [
      [{ message: "Texte modifié après l'approbation" }, preuve(m, "facebook", "facebook_publier", args), /contenu demandé diffère/],
      [args, preuve(m, "facebook", "facebook_envoyer_message", args), /outil facebook_envoyer_message/],
      [args, preuve(m, "facebook", "facebook_publier", args, { compte: "100000000000002" }), /compte 100000000000002/],
      [args, preuve(m, "facebook", "facebook_publier", args, { expire: Math.floor(Date.now() / 1000) - 5 }), /expirée/],
    ];
    for (const [a, p, motif] of cas) {
      const r = await appeler(fb(), "facebook_publier", { ...a, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
      expect(r.donnees.etat).toBe("preparee");
      expect(r.donnees.message).toMatch(motif);
    }
    expect(m.faux.appelsVers(PUBLIER).length).toBe(avant);
  });
});

describe("avec preuve : exécutée une seule fois", () => {
  it("publie, puis un réessai avec la même preuve renvoie le même résultat sans republier", async () => {
    const args = { message: "Printemps : diagnostic toiture offert", link: "https://exemple.invalid/printemps" };
    const p = preuve(m, "facebook", "facebook_publier", args, { compte: "100000000000001" });
    const avant = effets("facebook_publication");
    const r1 = await appeler(fb(), "facebook_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(r1.erreur, r1.texte).toBe(false);
    expect(r1.donnees).toMatchObject({ etat: "executee", executee: true, rejeu: false, resultat: { id: expect.stringMatching(/^100000000000001_/) } });
    const r2 = await appeler(fb(), "facebook_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(r2.donnees).toMatchObject({ etat: "executee", rejeu: true, resultat: r1.donnees.resultat });
    expect(effets("facebook_publication")).toBe(avant + 1);
    const envoye = m.faux.effets.at(-1)!.donnees;
    expect(envoye).toMatchObject({ message: args.message, link: args.link });
  });

  it("la même clé d'approbation ne sert pas à une autre action", async () => {
    const p1 = preuve(m, "facebook", "facebook_publier", { message: "Un" }, { cle: "diffusion-cle-unique" });
    const p2 = preuve(m, "facebook", "facebook_publier", { message: "Deux" }, { cle: "diffusion-cle-unique" });
    expect((await appeler(fb(), "facebook_publier", { message: "Un", preuve_approbation: p1, revocations_approbation: listeRevocations(m) })).donnees.etat).toBe("executee");
    const r = await appeler(fb(), "facebook_publier", { message: "Deux", preuve_approbation: p2, revocations_approbation: listeRevocations(m) });
    expect(r.donnees.etat).toBe("preparee");
    expect(r.donnees.message).toMatch(/déjà servi pour une autre action/);
  });

  it("deux appels simultanés avec la même preuve : un seul effet", async () => {
    const args = { message: "Appels simultanés" };
    const p = preuve(m, "facebook", "facebook_publier", args);
    const avant = effets("facebook_publication");
    const [a, b] = await Promise.all([appeler(fb(), "facebook_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) }), appeler(fb(), "facebook_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) })]);
    expect(effets("facebook_publication")).toBe(avant + 1);
    const etats = [a, b].map((r) => (r.erreur ? "en_cours" : r.donnees.etat));
    expect(etats).toContain("executee");
  });

  it("refus certain de la plateforme (permission) : erreur claire, aucun effet, nouvel essai permis", async () => {
    const args = { message: "Permission manquante" };
    const p = preuve(m, "facebook", "facebook_publier", args);
    m.faux.injecter(PUBLIER, { statut: 403, corps: { error: { message: "(#200) The user hasn't authorized the application to perform this action", type: "OAuthException", code: 200, fbtrace_id: "P1" } } });
    const r = await appeler(fb(), "facebook_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(r.erreur).toBe(true);
    expect(r.texte).toMatch(/permission_manquante.*App Review/s);
    const r2 = await appeler(fb(), "facebook_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(r2.donnees).toMatchObject({ etat: "executee", rejeu: false });
  });
});

describe("résultat ambigu : réconciliation avant tout nouvel essai", () => {
  it("effet produit puis connexion perdue : ambigu, puis le réessai constate l'effet sans republier", async () => {
    const args = { message: "Coupure après publication" };
    const p = preuve(m, "facebook", "facebook_publier", args);
    m.faux.injecter(PUBLIER, "coupure_apres_effet");
    const avant = effets("facebook_publication");
    const r1 = await appeler(fb(), "facebook_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(r1.donnees.etat).toBe("ambigue_a_reconcilier");
    expect(effets("facebook_publication")).toBe(avant + 1);
    const postsAvant = m.faux.appelsVers(PUBLIER).length;
    const r2 = await appeler(fb(), "facebook_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(r2.donnees).toMatchObject({ etat: "executee", rejeu: true });
    expect(m.faux.appelsVers(PUBLIER).length).toBe(postsAvant); // aucun nouvel envoi
    expect(effets("facebook_publication")).toBe(avant + 1);
  });

  it("connexion perdue sans effet : le réessai prouve l'absence puis publie une fois", async () => {
    const args = { message: "Coupure avant publication" };
    const p = preuve(m, "facebook", "facebook_publier", args);
    m.faux.injecter(PUBLIER, "coupure");
    const avant = effets("facebook_publication");
    expect((await appeler(fb(), "facebook_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) })).donnees.etat).toBe("ambigue_a_reconcilier");
    expect(effets("facebook_publication")).toBe(avant);
    const r2 = await appeler(fb(), "facebook_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(r2.donnees).toMatchObject({ etat: "executee", rejeu: false });
    expect(effets("facebook_publication")).toBe(avant + 1);
  });

  it("message privé ambigu : jamais renvoyé automatiquement (non relisible)", async () => {
    const args = { destinataire: "6942000000000001", texte: "Bonjour, voici votre devis." };
    // L'humain approuve le texte AVEC la mention d'information IA (article 50), ajoutée à la préparation.
    const p = preuve(m, "facebook", "facebook_envoyer_message", { ...args, texte: ajouterMention(args.texte, MENTION_IA_PAR_DEFAUT) });
    m.faux.injecter("POST /meta-graph/v26.0/100000000000001/messages", "coupure_apres_effet");
    expect((await appeler(fb(), "facebook_envoyer_message", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) })).donnees.etat).toBe("ambigue_a_reconcilier");
    const r2 = await appeler(fb(), "facebook_envoyer_message", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(r2.donnees.etat).toBe("ambigue_a_reconcilier");
    expect(r2.donnees.message).toMatch(/Vérifier à la main/);
    expect(m.faux.appelsVers("POST /meta-graph/v26.0/100000000000001/messages")).toHaveLength(1);
    expect(effets("facebook_message")).toBe(1);
  });

  it("HubSpot : modification ambiguë réconciliée par relecture du contact", async () => {
    const args = { contact_id: "102", properties: { lifecyclestage: "salesqualifiedlead" } };
    const p = preuve(m, "crm", "crm_modifier_contact", args);
    m.faux.injecter("PATCH /hubspot-api/crm/v3/objects/contacts/102", "coupure_apres_effet");
    expect((await appeler(clients.get("crm")!, "crm_modifier_contact", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) })).donnees.etat).toBe("ambigue_a_reconcilier");
    const r2 = await appeler(clients.get("crm")!, "crm_modifier_contact", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(r2.donnees).toMatchObject({ etat: "executee", rejeu: true, resultat: { id: "102" } });
    expect(m.faux.appelsVers("PATCH /hubspot-api/crm/v3/objects/contacts/102")).toHaveLength(1);
  });
});

describe("chaque plateforme exécute sa mutation une seule fois", () => {
  it("Instagram : conteneur, statut FINISHED, puis media_publish", async () => {
    const args = { caption: "Chantier terminé à Ans", image_url: "https://exemple.invalid/photo.jpg" };
    const p = preuve(m, "instagram", "instagram_publier", args);
    const r = await appeler(clients.get("instagram")!, "instagram_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(r.donnees, r.texte).toMatchObject({ etat: "executee", resultat: { id: expect.any(String), conteneur: expect.stringMatching(/^cont_/) } });
    await appeler(clients.get("instagram")!, "instagram_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(effets("instagram_publication")).toBe(1);
  });

  it("LinkedIn : POST /rest/posts au nom de l'organisation, identifiant lu dans x-restli-id", async () => {
    const args = { commentary: "Nous recrutons un couvreur à Liège." };
    const r = await appeler(clients.get("linkedin")!, "linkedin_publier", { ...args, preuve_approbation: preuve(m, "linkedin", "linkedin_publier", args, { compte: "urn:li:organization:2414183" }), revocations_approbation: listeRevocations(m) });
    expect(r.donnees, r.texte).toMatchObject({ etat: "executee", resultat: { id: expect.stringMatching(/^urn:li:share:/) } });
    expect(m.faux.effets.at(-1)!.donnees).toMatchObject({ author: "urn:li:organization:2414183", commentary: args.commentary, lifecycleState: "PUBLISHED", visibility: "PUBLIC" });
  });

  it("HubSpot : propriété en lecture seule refusée même avec une preuve, sans appel", async () => {
    const args = { contact_id: "101", properties: { hs_object_id: "999" } };
    const avant = m.faux.appels.length;
    const r = await appeler(clients.get("crm")!, "crm_modifier_contact", { ...args, preuve_approbation: preuve(m, "crm", "crm_modifier_contact", args), revocations_approbation: listeRevocations(m) });
    expect(r.erreur).toBe(true);
    expect(r.texte).toMatch(/lecture seule/);
    expect(m.faux.appels.length).toBe(avant);
  });

  it("Pipedrive : PATCH v2, « email » devient emails[]", async () => {
    const args = { id: 2, champs: { email: "alice.nouvelle@exemple.invalid", name: "Alice Dupont-Leroy" } };
    const r = await appeler(clients.get("pipedrive")!, "pipedrive_modifier_personne", { ...args, preuve_approbation: preuve(m, "pipedrive", "pipedrive_modifier_personne", args), revocations_approbation: listeRevocations(m) });
    expect(r.donnees, r.texte).toMatchObject({ etat: "executee", resultat: { id: 2 } });
    expect(m.faux.effets.at(-1)!.donnees).toEqual({ id: 2, emails: [{ value: "alice.nouvelle@exemple.invalid", primary: true, label: "work" }], name: "Alice Dupont-Leroy" });
  });

  it("Odoo 19 : write { ids, vals } en JSON-2", async () => {
    const args = { ids: [26], values: { stage_id: 2 } };
    const r = await appeler(clients.get("odoo")!, "odoo_ecrire_lead", { ...args, preuve_approbation: preuve(m, "odoo", "odoo_ecrire_lead", args), revocations_approbation: listeRevocations(m) });
    expect(r.donnees, r.texte).toMatchObject({ etat: "executee", resultat: { ids: [26] } });
    expect(m.odoo19.effets.at(-1)).toEqual({ ids: [26], vals: { stage_id: 2 } });
  });

  it("Teamleader : contacts.update, « telephone » devient telephones[] (réponse 204)", async () => {
    const args = { id: "cb8da52a-ce89-4bf6-8f7e-8ee6cb85e3b1", modifications: { telephone: "+32 4 000 99 99" } };
    const r = await appeler(clients.get("teamleader")!, "teamleader_modifier_contact", { ...args, preuve_approbation: preuve(m, "teamleader", "teamleader_modifier_contact", args), revocations_approbation: listeRevocations(m) });
    expect(r.donnees, r.texte).toMatchObject({ etat: "executee" });
    expect(m.faux.effets.at(-1)!.donnees).toEqual({ id: args.id, telephones: [{ type: "phone", number: "+32 4 000 99 99" }] });
  });
});

describe("sans clé de vérification configurée", () => {
  it("une preuve, même bien signée, ne fait rien exécuter", async () => {
    const m2 = await monter({ sansClePublique: true });
    try {
      const { jetons } = await connecter(m2, "linkedin");
      const c = await clientMcp(m2, "linkedin", jetons.access_token);
      const args = { commentary: "Ne doit pas partir" };
      const r = await appeler(c, "linkedin_publier", { ...args, preuve_approbation: preuve(m2, "linkedin", "linkedin_publier", args), revocations_approbation: listeRevocations(m2) });
      expect(r.donnees.etat).toBe("preparee");
      expect(r.donnees.message).toMatch(/PASSERELLE_APPROBATION_CLE_PUBLIQUE/);
      expect(m2.faux.appelsVers("POST /linkedin-api/rest/posts")).toHaveLength(0);
      await c.close();
    } finally {
      await m2.arreter();
    }
  });
});
