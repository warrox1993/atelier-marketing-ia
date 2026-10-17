import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Etat } from "../src/etat.js";
import { signatureValide, signer } from "../src/signature.js";
import { banc, ID_NUMERO, INCONNU, JB, SECRET, VERIF, type Banc } from "./aide.js";
import { DIRECTION } from "./faux.js";

let b: Banc | null = null;
afterEach(async () => {
  await b?.fermer();
  b = null;
});

const discussionPostee = (x: Banc) => x.atelier.requetes.filter((r) => r.chemin.endsWith("/discussion/message"));

describe("poignée de main hub.verify_token", () => {
  it("rend hub.challenge avec le bon jeton, 403 sinon", async () => {
    b = await banc();
    const ok = await fetch(`${b.url}/webhook?hub.mode=subscribe&hub.verify_token=${VERIF}&hub.challenge=1158201444`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("1158201444");
    const faux = await fetch(`${b.url}/webhook?hub.mode=subscribe&hub.verify_token=autre&hub.challenge=1`);
    expect(faux.status).toBe(403);
    const mode = await fetch(`${b.url}/webhook?hub.mode=unsubscribe&hub.verify_token=${VERIF}&hub.challenge=1`);
    expect(mode.status).toBe(403);
    const sansJeton = await fetch(`${b.url}/webhook?hub.mode=subscribe&hub.challenge=1`);
    expect(sansJeton.status).toBe(403);
  });

  it("refuse tout autre chemin ou méthode", async () => {
    b = await banc();
    expect((await fetch(`${b.url}/`)).status).toBe(404);
    expect((await fetch(`${b.url}/sante`)).status).toBe(404);
    expect((await fetch(`${b.url}/webhook`, { method: "PUT" })).status).toBe(405);
  });
});

describe("signature X-Hub-Signature-256", () => {
  it("fonction : accepte la bonne signature, refuse tout écart", () => {
    const corps = Buffer.from('{"a":"\\u00e9"}');
    const sig = signer(corps, SECRET);
    expect(signatureValide(corps, sig, SECRET)).toBe(true);
    expect(signatureValide(corps, sig.toUpperCase().replace("SHA256=", "sha256="), SECRET)).toBe(true);
    expect(signatureValide(Buffer.from('{"a":"é"}'), sig, SECRET)).toBe(false); // corps re-sérialisé : refusé
    expect(signatureValide(corps, signer(corps, "autre-secret"), SECRET)).toBe(false);
    expect(signatureValide(corps, sig.replace("sha256=", "sha1="), SECRET)).toBe(false);
    expect(signatureValide(corps, sig.slice(0, -2), SECRET)).toBe(false);
    expect(signatureValide(corps, undefined, SECRET)).toBe(false);
    expect(signatureValide(corps, [sig], SECRET)).toBe(false);
    expect(signatureValide(corps, sig, "")).toBe(false);
  });

  it("signature valide : le message de l'opérateur part au coordinateur général", async () => {
    b = await banc();
    const r = await b.envoyer("Où en est la campagne d'octobre ?");
    expect(r.status).toBe(200);
    const posts = discussionPostee(b);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.corps).toEqual({ companyId: DIRECTION, texte: "Où en est la campagne d'octobre ?" });
    // Jamais d'en-tête d'agent : Paperclip attribue la requête au board humain.
    expect(posts[0]!.entetes["x-paperclip-run-id"]).toBeUndefined();
    expect(posts[0]!.entetes.authorization).toBeUndefined();
    expect(b.dernierTexte()).toBe("Transmis au coordinateur général.");
    expect(b.meta.envois[0]!.corps).toMatchObject({ messaging_product: "whatsapp", to: JB, type: "text" });
    expect(b.meta.envois[0]!.chemin).toBe(`/v26.0/${ID_NUMERO}/messages`);
  });

  it("signature invalide, absente ou d'un autre secret : 401 et rien n'est traité", async () => {
    b = await banc();
    expect((await b.envoyer("pirate", { signature: "sha256=" + "0".repeat(64) })).status).toBe(401);
    expect((await b.envoyer("pirate", { signature: null })).status).toBe(401);
    const corps = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [] }));
    expect((await b.envoyer("pirate", { corpsBrut: corps, signature: signer(corps, "mauvais") })).status).toBe(401);
    // Signature d'un autre corps.
    expect((await b.envoyer("pirate", { signature: signer(Buffer.from("{}"), SECRET) })).status).toBe(401);
    expect(discussionPostee(b)).toHaveLength(0);
    expect(b.meta.envois).toHaveLength(0);
    expect(b.journal.filter((j) => j.evenement === "signature_refusee")).toHaveLength(4);
  });

  it("corps trop grand : 413 sans traitement", async () => {
    b = await banc();
    const r = await b.envoyer("x", { corpsBrut: Buffer.alloc(300 * 1024, 0x20) });
    expect(r.status).toBe(413);
    expect(b.meta.envois).toHaveLength(0);
  });
});

describe("liste blanche, rejeu, débit, journaux", () => {
  it("numéro inconnu : ignoré, journalisé sans contenu ni numéro", async () => {
    b = await banc();
    const r = await b.envoyer("approuver 1 contenu-secret-xyz", { de: INCONNU });
    expect(r.status).toBe(200);
    expect(discussionPostee(b)).toHaveLength(0);
    expect(b.meta.envois).toHaveLength(0);
    const j = b.journal.find((x) => x.evenement === "expediteur_inconnu_ignore");
    expect(j).toBeDefined();
    const tout = JSON.stringify(b.journal);
    expect(tout).not.toContain("contenu-secret-xyz");
    expect(tout).not.toContain(INCONNU);
  });

  it("autre numéro WhatsApp Business (phone_number_id) : ignoré", async () => {
    b = await banc();
    await b.envoyer("bonjour", { numeroId: "999" });
    expect(discussionPostee(b)).toHaveLength(0);
    expect(b.journal.some((j) => j.evenement === "autre_numero_ignore")).toBe(true);
  });

  it("rejeu du même identifiant Meta : traité une seule fois, même après redémarrage", async () => {
    const dossier = mkdtempSync(join(tmpdir(), "wa-etat-"));
    const chemin = join(dossier, "etat.json");
    b = await banc({}, new Etat(chemin));
    await b.envoyer("premier", { id: "wamid.REJEU" });
    await b.envoyer("premier", { id: "wamid.REJEU" });
    expect(discussionPostee(b)).toHaveLength(1);
    expect(b.journal.some((j) => j.evenement === "rejeu_ignore")).toBe(true);
    expect(statSync(chemin).mode & 0o777).toBe(0o600);
    await b.fermer();
    b = await banc({}, new Etat(chemin));
    await b.envoyer("premier", { id: "wamid.REJEU" });
    expect(discussionPostee(b)).toHaveLength(0);
  });

  it("débit : au-delà de la limite par minute, les messages sont ignorés", async () => {
    b = await banc({ WHATSAPP_DEBIT_PAR_MINUTE: "3" });
    for (let i = 0; i < 5; i++) await b.envoyer(`message ${i}`);
    expect(discussionPostee(b)).toHaveLength(3);
    expect(b.journal.filter((j) => j.evenement === "debit_expediteur_depasse")).toHaveLength(2);
    expect(b.meta.textes().filter((t) => t.startsWith("Trop de messages"))).toHaveLength(1);
    b.horloge.t += 61_000;
    await b.envoyer("après une minute");
    expect(discussionPostee(b)).toHaveLength(4);
  });

  it("message non texte : réponse d'aide, rien n'est relayé", async () => {
    b = await banc();
    await b.envoyer(null);
    expect(discussionPostee(b)).toHaveLength(0);
    expect(b.dernierTexte()).toContain("Seuls les messages texte");
  });

  it("aucun contenu de message dans le journal technique", async () => {
    b = await banc();
    await b.envoyer("phrase-très-confidentielle-42");
    await b.envoyer("attente");
    await b.envoyer("approuver 1 motif-confidentiel-77");
    await b.envoyer("123456");
    const tout = JSON.stringify(b.journal) + JSON.stringify(b.registre);
    expect(tout).not.toContain("phrase-très-confidentielle-42");
    expect(tout).not.toContain("motif-confidentiel-77");
    expect(tout).not.toContain("123456");
  });
});
