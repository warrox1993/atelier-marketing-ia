// Route d'envoi humaine : preuve signée exigée, contenu identique à celui approuvé, désinscription présente, usage unique, mode de test.
// Faux listmonk en mémoire, aucun conteneur.

import { generateKeyPairSync, randomBytes, type KeyObject } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { VerificateurPreuves, empreinteArguments, signerPreuve, signerRevocations } from "../../src/reel/social-crm/approbation.js";
import { ClientListmonk } from "../../src/reel/emailing/listmonk.js";
import { COMPTE_ENVOI, OUTIL_ENVOI, SERVICE_ENVOI, abonnesCibles, argumentsEnvoi, creerEnvoyeur, creerLecteurCampagne } from "../../src/reel/emailing/envoi.js";
import { empreinteCampagne } from "../../src/reel/emailing/outils.js";
import { creerFauxListmonk } from "./faux-listmonk.js";

const MAINTENANT = new Date("2026-10-21T10:00:00Z");
const S = Math.floor(MAINTENANT.getTime() / 1000);
const CORPS = "<p>Bonjour</p>\n<hr><a href=\"{{ UnsubscribeURL }}\">Se désinscrire</a>";
const TEXTE = "Bonjour\n{{ UnsubscribeURL }}";

const dossier = mkdtempSync(join(tmpdir(), "preuves-emailing-"));
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

async function montage(options: { smtp?: string; abonnes?: number; sansDesinscription?: boolean; fichierPreuves?: string } = {}) {
  const faux = creerFauxListmonk(["gestion", "envoi"]);
  faux.etat.smtp = [{ enabled: true, host: options.smtp ?? "atelier-mailpit" }];
  // Le compteur `subscriber_count` est volontairement faux (0) : l'envoi doit compter les vrais abonnés confirmés, pas ce compteur en cache.
  faux.etat.listes.push({ id: 1, name: "Salon", type: "private", optin: "single", subscriber_count: 0 });
  for (let i = 0; i < (options.abonnes ?? 2); i++) faux.etat.abonnes.push({ id: 100 + i, email: `a${i}@exemple.test`, name: `A${i}`, status: "enabled", lists: [{ id: 1, subscription_status: "confirmed" }] });
  faux.etat.campagnes.push({
    id: 5, name: "Lettre", subject: "Nouveautés", status: "draft", body: options.sansDesinscription ? "<p>Bonjour</p>" : CORPS, altbody: options.sansDesinscription ? "Bonjour" : TEXTE,
    content_type: "html", template_id: 7, lists: [{ id: 1, name: "Salon" }], to_send: 0, sent: 0, started_at: null, updated_at: null,
  });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const client = new ClientListmonk({ jeton: "atelier-envoi:jeton-de-test-0123456789", fetch: faux.fetch });
  const envoyer = creerEnvoyeur({ client, verificateur: new VerificateurPreuves(pem), maintenant: () => MAINTENANT, ...(options.fichierPreuves ? { fichierPreuves: options.fichierPreuves } : {}) });
  const cibles = await abonnesCibles(client, faux.etat.campagnes[0]!);
  const lire = creerLecteurCampagne({ client });
  const pemPublic = pem;
  return { faux, envoyer, privateKey, pemPublic, client, lire, empreinte: empreinteCampagne(faux.etat.campagnes[0]!), cibles };
}

function demande(cle: KeyObject, empreinte: string, cibles: { destinataires: number; empreinte: string }, extra: { campagne?: number; expire?: number; compte?: string; outil?: string; cleProuve?: string } = {}) {
  const args = argumentsEnvoi(extra.campagne ?? 5, empreinte, cibles.destinataires, cibles.empreinte);
  const preuve = signerPreuve(cle, {
    v: 1, cle: extra.cleProuve ?? `atelier-diffusion-${randomBytes(6).toString("hex")}`, service: SERVICE_ENVOI, outil: extra.outil ?? OUTIL_ENVOI, empreinte: empreinteArguments(args),
    compte: extra.compte ?? COMPTE_ENVOI, diffusion: "d-1", decision: "dec-1", emis: S, expire: extra.expire ?? S + 3600, entreprise: "entreprise-essai",
  });
  const revocations = signerRevocations(cle, { v: 1, entreprise: "entreprise-essai", emis: S, revoquees: [] });
  return { campagne_id: extra.campagne ?? 5, empreinte, destinataires: cibles.destinataires, empreinte_abonnes: cibles.empreinte, preuve_approbation: preuve, revocations_approbation: revocations };
}

describe("envoi humain d'une campagne", () => {
  let m: Awaited<ReturnType<typeof montage>>;
  beforeEach(async () => { m = await montage(); });

  it("preuve valide : la campagne démarre, vers Mailpit, avec le message de test", async () => {
    const r = await m.envoyer(demande(m.privateKey, m.empreinte, m.cibles));
    expect(r.statut).toBe(200);
    expect(r.corps["envoye"]).toBe(true);
    expect(r.corps["mode_envoi"]).toBe("test");
    expect(String(r.corps["message"])).toMatch(/envoi de test, rien n'est parti/);
    expect(m.faux.etat.campagnes[0]!.status).toBe("running");
  });

  it("sans preuve, ou avec une preuve signée par une autre clé : rien ne part", async () => {
    const d = demande(m.privateKey, m.empreinte, m.cibles);
    expect((await m.envoyer({ ...d, preuve_approbation: "x".repeat(30) })).statut).toBe(403);
    const autre = generateKeyPairSync("ed25519").privateKey;
    expect((await m.envoyer(demande(autre, m.empreinte, m.cibles))).statut).toBe(403);
    expect((await m.envoyer({ campagne_id: 5, empreinte: m.empreinte })).statut).toBe(400);
    // L'ancienne forme (sans nombre de destinataires ni empreinte des abonnés) est refusée.
    expect((await m.envoyer({ campagne_id: 5, empreinte: m.empreinte, preuve_approbation: d.preuve_approbation, revocations_approbation: d.revocations_approbation })).statut).toBe(400);
    expect(m.faux.etat.campagnes[0]!.status).toBe("draft");
  });

  it("preuve expirée ou visant un autre outil, un autre compte ou une autre campagne : refus", async () => {
    expect((await m.envoyer(demande(m.privateKey, m.empreinte, m.cibles, { expire: S - 10 }))).statut).toBe(403);
    expect((await m.envoyer(demande(m.privateKey, m.empreinte, m.cibles, { outil: "autre_outil" }))).statut).toBe(403);
    expect((await m.envoyer(demande(m.privateKey, m.empreinte, m.cibles, { compte: "autre-compte" }))).statut).toBe(403);
    const d = demande(m.privateKey, m.empreinte, m.cibles);
    expect((await m.envoyer({ ...d, campagne_id: 6 })).statut).toBe(403);
    expect(m.faux.etat.campagnes[0]!.status).toBe("draft");
  });

  it("contenu modifié depuis l'approbation : refus (empreinte)", async () => {
    const d = demande(m.privateKey, m.empreinte, m.cibles);
    m.faux.etat.campagnes[0]!.subject = "Sujet modifié après coup";
    const r = await m.envoyer(d);
    expect(r.statut).toBe(409);
    expect(r.corps["erreur"]).toBe("contenu_modifie");
    expect(m.faux.etat.campagnes[0]!.status).toBe("draft");
  });

  it("lien de désinscription absent : refus", async () => {
    const x = await montage({ sansDesinscription: true });
    const r = await x.envoyer(demande(x.privateKey, x.empreinte, x.cibles));
    expect(r.statut).toBe(422);
    expect(r.corps["erreur"]).toBe("desinscription_absente");
    expect(x.faux.etat.campagnes[0]!.status).toBe("draft");
  });

  it("une preuve ne sert qu'une fois", async () => {
    const d = demande(m.privateKey, m.empreinte, m.cibles, { cleProuve: "atelier-diffusion-une-seule-fois" });
    expect((await m.envoyer(d)).statut).toBe(200);
    m.faux.etat.campagnes[0]!.status = "draft"; // même si listmonk la rendait de nouveau envoyable
    const r = await m.envoyer(d);
    expect(r.statut).toBe(409);
    expect(r.corps["erreur"]).toBe("preuve_deja_utilisee");
    expect(m.faux.etat.campagnes[0]!.status).toBe("draft");
  });

  it("campagne déjà lancée : refus", async () => {
    m.faux.etat.campagnes[0]!.status = "running";
    const d = demande(m.privateKey, m.empreinte, m.cibles);
    expect((await m.envoyer(d)).corps["erreur"]).toBe("pas_un_brouillon");
  });

  it("liste vide, ou SMTP réel : refus", async () => {
    const vide = await montage({ abonnes: 0 });
    expect((await vide.envoyer(demande(vide.privateKey, vide.empreinte, vide.cibles))).corps["erreur"]).toBe("aucun_destinataire");
    const reel = await montage({ smtp: "smtp.exemple-reel.test" });
    const r = await reel.envoyer(demande(reel.privateKey, reel.empreinte, reel.cibles));
    expect(r.corps["erreur"]).toBe("smtp_reel_non_valide");
    expect(reel.faux.etat.campagnes[0]!.status).toBe("draft");
  });

  it("ATTAQUE : abonnés ajoutés APRÈS l'accord (même nombre déclaré, autres personnes ou plus nombreux) : refus, rien ne part", async () => {
    const d = demande(m.privateKey, m.empreinte, m.cibles);
    m.faux.etat.abonnes.push({ id: 900, email: "intrus@exemple.test", name: "Intrus", status: "enabled", lists: [{ id: 1, subscription_status: "confirmed" }] });
    const r = await m.envoyer(d);
    expect(r.statut).toBe(409);
    expect(r.corps["erreur"]).toBe("liste_modifiee");
    expect(String(r.corps["message"])).toMatch(/la liste a changé depuis l'accord : redemander la confirmation/);
    expect(m.faux.etat.campagnes[0]!.status).toBe("draft");
  });

  it("ATTAQUE : un abonné remplacé par un autre (même effectif) change l'empreinte des abonnés : refus", async () => {
    const d = demande(m.privateKey, m.empreinte, m.cibles);
    m.faux.etat.abonnes[0]!.id = 777;
    const r = await m.envoyer(d);
    expect(r.corps["erreur"]).toBe("liste_modifiee");
    expect(m.faux.etat.campagnes[0]!.status).toBe("draft");
  });

  it("ATTAQUE : nombre de destinataires falsifié dans le corps (preuve signée pour un autre nombre) : refus de la preuve", async () => {
    const d = demande(m.privateKey, m.empreinte, m.cibles);
    expect((await m.envoyer({ ...d, destinataires: 1 })).statut).toBe(403);
    expect((await m.envoyer({ ...d, empreinte_abonnes: "0".repeat(64) })).statut).toBe(403);
    expect(m.faux.etat.campagnes[0]!.status).toBe("draft");
  });

  it("cas légitime : les abonnés n'ont pas changé, l'envoi part", async () => {
    const r = await m.envoyer(demande(m.privateKey, m.empreinte, m.cibles));
    expect(r.statut).toBe(200);
    expect((r.corps["campagne"] as { destinataires_prevus: number }).destinataires_prevus).toBe(2);
  });

  it("COURSE : deux envois simultanés avec la même preuve, un seul passe", async () => {
    const d = demande(m.privateKey, m.empreinte, m.cibles, { cleProuve: "atelier-diffusion-course" });
    const [a, b] = await Promise.all([m.envoyer(d), m.envoyer(d)]);
    expect([a.statut, b.statut].sort()).toEqual([200, 409]);
    const refuse = a.statut === 409 ? a : b;
    expect(refuse.corps["erreur"]).toBe("preuve_deja_utilisee");
    expect(m.faux.etat.appels.filter((x) => x.methode === "PUT" && x.chemin.endsWith("/status"))).toHaveLength(1);
  });

  it("refus AVANT démarrage : la preuve est libérée ; après un démarrage demandé, elle reste consommée", async () => {
    const d = demande(m.privateKey, m.empreinte, m.cibles, { cleProuve: "atelier-diffusion-liberee" });
    m.faux.etat.campagnes[0]!.subject = "Modifié";
    expect((await m.envoyer(d)).corps["erreur"]).toBe("contenu_modifie");
    m.faux.etat.campagnes[0]!.subject = "Nouveautés";
    expect((await m.envoyer(d)).statut).toBe(200);
    m.faux.etat.campagnes[0]!.status = "draft";
    expect((await m.envoyer(d)).corps["erreur"]).toBe("preuve_deja_utilisee");
  });

  it("les preuves réservées survivent à un redémarrage (fichier 0600)", async () => {
    const fichier = join(dossier, "preuves-a.log");
    const a = await montage({ fichierPreuves: fichier });
    const d = demande(a.privateKey, a.empreinte, a.cibles, { cleProuve: "atelier-diffusion-persistante" });
    expect((await a.envoyer(d)).statut).toBe(200);
    expect(existsSync(fichier)).toBe(true);
    expect(statSync(fichier).mode & 0o777).toBe(0o600);
    // « Redémarrage » : un nouvel envoyeur lit le même fichier, sur une campagne de nouveau en brouillon.
    a.faux.etat.campagnes[0]!.status = "draft";
    const apres = creerEnvoyeur({ client: a.client, verificateur: new VerificateurPreuves(a.pemPublic), maintenant: () => MAINTENANT, fichierPreuves: fichier });
    const r = await apres(d);
    expect(r.statut).toBe(409);
    expect(r.corps["erreur"]).toBe("preuve_deja_utilisee");
    expect(a.faux.etat.campagnes[0]!.status).toBe("draft");
  });
});

describe("lecture interne d'une campagne (carte de confirmation)", () => {
  it("rend le sujet, les listes, le nombre réel d'abonnés confirmés et les empreintes, lus chez listmonk", async () => {
    const m = await montage({ abonnes: 3 });
    const r = await m.lire({ campagne_id: 5 });
    expect(r.statut).toBe(200);
    expect(r.corps).toMatchObject({ campagne_id: 5, sujet: "Nouveautés", statut: "draft", listes: [{ id: 1, nom: "Salon" }], destinataires: 3, empreinte: m.empreinte, empreinte_abonnes: m.cibles.empreinte });
    expect(String(r.corps["extrait"]).length).toBeLessThanOrEqual(400);
    expect(m.faux.etat.appels.every((a) => a.methode === "GET")).toBe(true);
  });

  it("l'empreinte des abonnés change quand un abonné est ajouté ; l'extrait est borné", async () => {
    const m = await montage();
    m.faux.etat.campagnes[0]!.altbody = "x".repeat(5000);
    const avant = (await m.lire({ campagne_id: 5 })).corps;
    m.faux.etat.abonnes.push({ id: 901, email: "n@exemple.test", name: "N", status: "enabled", lists: [{ id: 1, subscription_status: "confirmed" }] });
    const apres = (await m.lire({ campagne_id: 5 })).corps;
    expect(apres["empreinte_abonnes"]).not.toBe(avant["empreinte_abonnes"]);
    expect(apres["destinataires"]).toBe(3);
    expect(String(apres["extrait"]).length).toBe(400);
  });

  it("campagne inconnue : 502 ; corps invalide : 400", async () => {
    const m = await montage();
    expect((await m.lire({ campagne_id: 99 })).statut).toBe(502);
    expect((await m.lire({ campagne_id: 0 })).statut).toBe(400);
    expect((await m.lire({ campagne_id: 5, en_plus: 1 })).statut).toBe(400);
  });
});
