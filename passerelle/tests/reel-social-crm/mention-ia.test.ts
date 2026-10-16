// Mention d'information IA (article 50 du règlement européen sur l'IA) sur les messages envoyés directement à une personne.

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ajouterMention, lireMentionIa, MENTIONS_PAR_DEFAUT, type MentionIa } from "../../src/mention-ia.js";
import { lireConfigSocialCrm } from "../../src/reel/social-crm/config.js";
import { appeler, clientMcp, connecter, listeRevocations, monter, preuve, type Montage } from "./aide.js";

let m: Montage;
let fb: Client;
beforeAll(async () => {
  m = await monter();
  const { jetons } = await connecter(m, "facebook", { choix: 0 });
  fb = await clientMcp(m, "facebook", jetons.access_token);
});
afterAll(async () => {
  await fb.close();
  await m.arreter();
});

const MESSAGE = "facebook_envoyer_message";
const effets = (type: string): Record<string, unknown>[] => m.faux.effets.filter((e) => e.type === type).map((e) => e.donnees as Record<string, unknown>);
const texteEnvoye = (): string => ((effets("facebook_message").at(-1)!["message"] as Record<string, unknown>)["text"] as string);

/** Prépare puis exécute comme le plugin : l'humain signe les paramètres exacts de la réponse « préparée ». */
async function envoyer(args: { destinataire: string; texte: string }): Promise<{ vu: string; executee: Record<string, any> }> {
  const prep = await appeler(fb, MESSAGE, args);
  expect(prep.donnees.etat).toBe("preparee");
  const parametres = prep.donnees["action"]["parametres"] as Record<string, unknown>;
  const p = preuve(m, "facebook", MESSAGE, parametres);
  const r = await appeler(fb, MESSAGE, { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
  return { vu: parametres["texte"] as string, executee: r.donnees };
}

describe("mention par défaut", () => {
  it("est ajoutée à la préparation (visible par l'humain), approuvée, puis envoyée telle quelle", async () => {
    const { vu, executee } = await envoyer({ destinataire: "6942000000000010", texte: "Bonjour, voici votre devis." });
    expect(vu).toBe(`Bonjour, voici votre devis.\n\n${MENTIONS_PAR_DEFAUT.fr}`);
    expect(executee.etat).toBe("executee");
    expect(texteEnvoye()).toBe(vu);
  });

  it("une preuve signée sur le texte SANS mention est refusée : rien n'est envoyé", async () => {
    const args = { destinataire: "6942000000000011", texte: "Texte sans mention approuvé" };
    const avant = effets("facebook_message").length;
    const r = await appeler(fb, MESSAGE, { ...args, preuve_approbation: preuve(m, "facebook", MESSAGE, args), revocations_approbation: listeRevocations(m) });
    expect(r.donnees.etat).toBe("preparee");
    expect(r.donnees.message).toMatch(/contenu demandé diffère/);
    expect(effets("facebook_message")).toHaveLength(avant);
  });

  it("n'est jamais ajoutée deux fois (texte déjà terminé par la mention)", async () => {
    const { vu } = await envoyer({ destinataire: "6942000000000012", texte: `Déjà là.\n\n${MENTIONS_PAR_DEFAUT.fr}` });
    expect(vu.split(MENTIONS_PAR_DEFAUT.fr)).toHaveLength(2);
  });

  it("un message qui dépasserait 2000 caractères avec la mention est refusé clairement", async () => {
    const r = await appeler(fb, MESSAGE, { destinataire: "6942000000000013", texte: "x".repeat(1990) });
    expect(r.erreur).toBe(true);
    expect(r.texte).toMatch(/mention d'information IA/);
  });
});

describe("texte personnalisé et variantes de langue", () => {
  it("PASSERELLE_MENTION_IA remplace le texte, PASSERELLE_MENTION_IA_LANGUE choisit nl ou en", () => {
    expect(lireMentionIa({ PASSERELLE_MENTION_IA: "Écrit avec une IA, relu par un humain." })).toEqual({ texte: "Écrit avec une IA, relu par un humain.", motif: null });
    expect(lireMentionIa({ PASSERELLE_MENTION_IA_LANGUE: "nl" }).texte).toBe(MENTIONS_PAR_DEFAUT.nl);
    expect(lireMentionIa({ PASSERELLE_MENTION_IA_LANGUE: "en" }).texte).toBe(MENTIONS_PAR_DEFAUT.en);
    expect(() => lireMentionIa({ PASSERELLE_MENTION_IA_LANGUE: "de" })).toThrow(/langue/);
  });

  it("le texte personnalisé est celui qui part et qui est signé", async () => {
    const perso: MentionIa = { texte: "Écrit avec une IA, relu par un humain.", motif: null };
    m.config.mentionIa = perso;
    try {
      const { vu, executee } = await envoyer({ destinataire: "6942000000000014", texte: "Bonjour" });
      expect(vu).toBe(`Bonjour\n\n${perso.texte}`);
      expect(executee.etat).toBe("executee");
      expect(texteEnvoye()).toBe(vu);
    } finally {
      delete m.config.mentionIa;
    }
  });
});

describe("désactivation", () => {
  it("sans motif écrit : refus (lecture des réglages et configuration réelle)", () => {
    expect(() => lireMentionIa({ PASSERELLE_MENTION_IA_DESACTIVEE: "oui" })).toThrow(/PASSERELLE_MENTION_IA_MOTIF/);
    expect(() => lireMentionIa({ PASSERELLE_MENTION_IA_DESACTIVEE: "oui", PASSERELLE_MENTION_IA_MOTIF: "   " })).toThrow(/motif/);
    const cle = Buffer.alloc(32, 3).toString("base64");
    const lu = lireConfigSocialCrm({ PASSERELLE_SOCIAL_CLE: cle, PASSERELLE_MENTION_IA_DESACTIVEE: "oui" }, "x");
    expect(lu).toEqual({ ok: false, raison: expect.stringMatching(/PASSERELLE_MENTION_IA_MOTIF/) });
  });

  it("avec motif : le message part sans mention", async () => {
    const mention = lireMentionIa({ PASSERELLE_MENTION_IA_DESACTIVEE: "oui", PASSERELLE_MENTION_IA_MOTIF: "Messages relus et envoyés par un humain, sans assistant." });
    expect(mention).toEqual({ texte: null, motif: "Messages relus et envoyés par un humain, sans assistant." });
    expect(ajouterMention("Bonjour", mention)).toBe("Bonjour");
    m.config.mentionIa = mention;
    try {
      const { vu } = await envoyer({ destinataire: "6942000000000015", texte: "Bonjour sans mention" });
      expect(vu).toBe("Bonjour sans mention");
      expect(texteEnvoye()).toBe("Bonjour sans mention");
    } finally {
      delete m.config.mentionIa;
    }
  });
});

describe("publication de page : non concernée", () => {
  it("facebook_publier n'ajoute aucune mention", async () => {
    const args = { message: "Nouveauté : isolation des toitures" };
    const prep = await appeler(fb, "facebook_publier", args);
    expect(prep.donnees["action"]["parametres"]).toEqual(args);
    const r = await appeler(fb, "facebook_publier", { ...args, preuve_approbation: preuve(m, "facebook", "facebook_publier", args), revocations_approbation: listeRevocations(m) });
    expect(r.donnees.etat).toBe("executee");
    expect(effets("facebook_publication").at(-1)!["message"]).toBe(args.message);
  });
});
