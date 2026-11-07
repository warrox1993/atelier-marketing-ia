// Mention d'information IA : absente par défaut, réactivable par PASSERELLE_MENTION_IA (voir src/mention-ia.ts).

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ajouterMention, ajouterMentionHtml, lireMentionIa } from "../../src/mention-ia.js";
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
const MENTION = "Écrit avec une IA, relu par un humain.";
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

/** Exécute `corps` avec la mention réactivée, puis revient au défaut. */
async function avecMention(corps: () => Promise<void>): Promise<void> {
  m.config.mentionIa = MENTION;
  try {
    await corps();
  } finally {
    delete m.config.mentionIa;
  }
}

describe("par défaut : aucune mention", () => {
  it("sans variable, ou variable vide, aucune mention n'est lue", () => {
    expect(lireMentionIa({})).toBeNull();
    expect(lireMentionIa({ PASSERELLE_MENTION_IA: "   " })).toBeNull();
    expect(ajouterMention("Bonjour", null)).toBe("Bonjour");
    expect(ajouterMentionHtml("<p>Bonjour</p>", null)).toBe("<p>Bonjour</p>");
  });

  it("le message direct part exactement comme l'humain l'a approuvé, sans mention", async () => {
    const { vu, executee } = await envoyer({ destinataire: "6942000000000010", texte: "Bonjour, voici votre devis." });
    expect(vu).toBe("Bonjour, voici votre devis.");
    expect(executee.etat).toBe("executee");
    expect(texteEnvoye()).toBe("Bonjour, voici votre devis.");
  });

  it("les anciennes variables de désactivation n'empêchent plus le démarrage", () => {
    const cle = Buffer.alloc(32, 3).toString("base64");
    expect(lireMentionIa({ PASSERELLE_MENTION_IA_DESACTIVEE: "oui" })).toBeNull();
    const lu = lireConfigSocialCrm({ PASSERELLE_SOCIAL_CLE: cle, PASSERELLE_MENTION_IA_DESACTIVEE: "oui" }, "x");
    expect(lu).toMatchObject({ ok: true, config: { mentionIa: null } });
  });
});

describe("réactivation par PASSERELLE_MENTION_IA", () => {
  it("le texte de la variable est lu, par la lecture des réglages et par la configuration réelle", () => {
    expect(lireMentionIa({ PASSERELLE_MENTION_IA: `  ${MENTION} ` })).toBe(MENTION);
    const cle = Buffer.alloc(32, 3).toString("base64");
    const lu = lireConfigSocialCrm({ PASSERELLE_SOCIAL_CLE: cle, PASSERELLE_MENTION_IA: MENTION }, "x");
    expect(lu).toMatchObject({ ok: true, config: { mentionIa: MENTION } });
  });

  it("est ajoutée à la préparation (visible par l'humain), approuvée, puis envoyée telle quelle", () =>
    avecMention(async () => {
      const { vu, executee } = await envoyer({ destinataire: "6942000000000014", texte: "Bonjour" });
      expect(vu).toBe(`Bonjour\n\n${MENTION}`);
      expect(executee.etat).toBe("executee");
      expect(texteEnvoye()).toBe(vu);
    }));

  it("une preuve signée sur le texte SANS mention est refusée : rien n'est envoyé", () =>
    avecMention(async () => {
      const args = { destinataire: "6942000000000011", texte: "Texte sans mention approuvé" };
      const avant = effets("facebook_message").length;
      const r = await appeler(fb, MESSAGE, { ...args, preuve_approbation: preuve(m, "facebook", MESSAGE, args), revocations_approbation: listeRevocations(m) });
      expect(r.donnees.etat).toBe("preparee");
      expect(r.donnees.message).toMatch(/contenu demandé diffère/);
      expect(effets("facebook_message")).toHaveLength(avant);
    }));

  it("n'est jamais ajoutée deux fois (texte déjà terminé par la mention)", () =>
    avecMention(async () => {
      const { vu } = await envoyer({ destinataire: "6942000000000012", texte: `Déjà là.\n\n${MENTION}` });
      expect(vu.split(MENTION)).toHaveLength(2);
    }));

  it("un message qui dépasserait 2000 caractères avec la mention est refusé clairement", () =>
    avecMention(async () => {
      const r = await appeler(fb, MESSAGE, { destinataire: "6942000000000013", texte: "x".repeat(1990) });
      expect(r.erreur).toBe(true);
      expect(r.texte).toMatch(/mention d'information IA/);
    }));
});

describe("publication de page : non concernée", () => {
  it("facebook_publier n'ajoute aucune mention", () =>
    avecMention(async () => {
      const args = { message: "Nouveauté : isolation des toitures" };
      const prep = await appeler(fb, "facebook_publier", args);
      expect(prep.donnees["action"]["parametres"]).toEqual(args);
      const r = await appeler(fb, "facebook_publier", { ...args, preuve_approbation: preuve(m, "facebook", "facebook_publier", args), revocations_approbation: listeRevocations(m) });
      expect(r.donnees.etat).toBe("executee");
      expect(effets("facebook_publication").at(-1)!["message"]).toBe(args.message);
    }));
});
