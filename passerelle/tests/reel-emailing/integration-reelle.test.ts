// Intégration RÉELLE sur la pile locale (listmonk, PostgreSQL, Mailpit en Podman) : liste, abonné de test avec consentement,
// brouillon, envoi par la route humaine (preuve signée comme le ferait le plugin), puis lecture de l'API de Mailpit : le message
// est arrivé et contient le lien de désinscription. Ne tourne que si la pile et les jetons de ~/.config/atelier existent
// (sinon ignoré).

import { existsSync, readFileSync } from "node:fs";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { construireCatalogue, appelerOutil } from "../../src/outils.js";
import { FICHE_EMAILING } from "../../src/services.js";
import { VerificateurPreuves, empreinteArguments, signerPreuve, signerRevocations } from "../../src/reel/social-crm/approbation.js";
import { ClientListmonk, lireJetonListmonk, modeEnvoi } from "../../src/reel/emailing/listmonk.js";
import { creerLecteurCampagne, COMPTE_ENVOI, OUTIL_ENVOI, SERVICE_ENVOI, argumentsEnvoi, creerEnvoyeur } from "../../src/reel/emailing/envoi.js";
import { fournisseurEmailingReel } from "../../src/reel/emailing/outils.js";

const DOSSIER = join(homedir(), ".config", "atelier");
const FICHIER_GESTION = join(DOSSIER, "emailing-passerelle.jeton");
const FICHIER_ENVOI = join(DOSSIER, "emailing-envoi.jeton");
const MAILPIT = "http://127.0.0.1:18025";
const FICHIER_MAILPIT = join(DOSSIER, "emailing-mailpit.jeton");
// L'API de Mailpit exige un mot de passe (généré par l'installeur, « utilisateur:mot de passe »).
const AUTH_MAILPIT = (): Record<string, string> => ({ authorization: `Basic ${Buffer.from(readFileSync(FICHIER_MAILPIT, "utf8").trim()).toString("base64")}` });
const lireMailpit = (chemin: string, init: RequestInit = {}): Promise<Response> => fetch(`${MAILPIT}${chemin}`, { ...init, headers: { ...AUTH_MAILPIT(), ...((init.headers as Record<string, string> | undefined) ?? {}) } });
const LISTMONK = "http://127.0.0.1:19000";

// Ignoré seulement si l'installeur n'est jamais passé (jetons absents). Si les jetons existent, la pile DOIT répondre : sinon le test échoue.
const disponible = existsSync(FICHIER_GESTION) && existsSync(FICHIER_ENVOI);
if (!disponible) console.warn("integration-reelle : jetons de ~/.config/atelier absents (installeur emailing jamais lancé), test ignoré.");

interface MessageMailpit { ID: string; Subject: string; To: Array<{ Address: string }> }

describe.skipIf(!disponible)("pile réelle : du brouillon au message reçu dans Mailpit", () => {
  it("liste, abonné, brouillon, envoi humain simulé, message arrivé avec lien de désinscription", async () => {
    for (const [nom, appel] of [["Mailpit", () => lireMailpit("/api/v1/info", { signal: AbortSignal.timeout(15_000) })], ["listmonk", () => fetch(`${LISTMONK}/api/health`, { signal: AbortSignal.timeout(15_000) })]] as const) {
      const r = await appel().catch(() => null);
      expect(r !== null && (r.ok || r.status === 403), `${nom} ne répond pas (systemctl --user status atelier-mailpit atelier-listmonk)`).toBe(true);
    }
    const suffixe = randomBytes(4).toString("hex");
    const adresse = `essai-${suffixe}@exemple.test`;
    const sujet = `Essai d'intégration ${suffixe}`;
    const gestion = new ClientListmonk({ jeton: lireJetonListmonk(FICHIER_GESTION, "gestion") });
    const envoi = new ClientListmonk({ jeton: lireJetonListmonk(FICHIER_ENVOI, "envoi") });
    expect(await modeEnvoi(gestion)).toBe("test");

    // Outils d'agent (jeton « gestion », sans droit d'envoi), par le vrai catalogue MCP du service.
    const catalogue = construireCatalogue(FICHE_EMAILING, "reel", fournisseurEmailingReel({ client: gestion }));
    const ctx = { service: "emailing", mode: "reel" as const, identite: { compte: "Poste local", propriete: { id: "listmonk/local", libelle: "listmonk" } }, jetonPorteur: null };
    const appeler = async (outil: string, args: unknown) => {
      const r = await appelerOutil(catalogue, outil, args, ctx);
      expect(r.isError, JSON.stringify(r.structuredContent)).not.toBe(true);
      return r.structuredContent as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    expect([...catalogue.outils.keys()]).not.toContain("envoyer_campagne");

    const liste = (await appeler("creer_liste", { nom: `Essai ${suffixe}`, description: "Liste de test d'intégration" }))["liste"] as { id: number };
    const ajout = await appeler("ajouter_abonnes", {
      liste_id: liste.id,
      abonnes: [{ email: adresse, nom: "Essai Intégration", consentement: { date: "2026-10-01", source: "Test d'intégration de la passerelle", texte: "J'accepte de recevoir la lettre d'essai." } }],
    });
    expect(ajout["resultats"][0].resultat).toBe("ajoute");

    const brouillon = await appeler("creer_campagne_brouillon", {
      nom: `Campagne ${suffixe}`, sujet, liste_ids: [liste.id],
      contenu_html: "<p>Bonjour {{ .Subscriber.FirstName }}, ceci est un envoi de test.</p>", contenu_texte: "Bonjour, ceci est un envoi de test.",
    });
    const campagne = brouillon["campagne"] as { id: number; statut: string; empreinte: string };
    expect(campagne.statut).toBe("draft");
    // Le brouillon ne part jamais tout seul : on attend un instant et on vérifie que Mailpit n'a rien reçu pour ce sujet.
    await new Promise((ok) => setTimeout(ok, 1500));
    const avant = (await (await lireMailpit(`/api/v1/messages`)).json()) as { messages: MessageMailpit[] };
    expect(avant.messages.some((x) => x.Subject === sujet)).toBe(false);

    // Route humaine : preuve signée par la « clé du plugin » (paire de test), vérifiée par la clé publique de la passerelle.
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const envoyer = creerEnvoyeur({ client: envoi, verificateur: new VerificateurPreuves(publicKey.export({ type: "spki", format: "pem" }).toString()) });
    const lecture = (await creerLecteurCampagne({ client: envoi })({ campagne_id: campagne.id })).corps as { destinataires: number; empreinte_abonnes: string };
    expect(lecture.destinataires).toBe(1);
    const args = argumentsEnvoi(campagne.id, campagne.empreinte, lecture.destinataires, lecture.empreinte_abonnes);
    const s = Math.floor(Date.now() / 1000);
    const preuve = signerPreuve(privateKey, {
      v: 1, cle: `atelier-diffusion-${suffixe}-00`, service: SERVICE_ENVOI, outil: OUTIL_ENVOI, empreinte: empreinteArguments(args), compte: COMPTE_ENVOI,
      diffusion: `d-${suffixe}`, decision: `dec-${suffixe}`, emis: s, expire: s + 600, entreprise: "entreprise-essai",
    });
    const revocations = signerRevocations(privateKey, { v: 1, entreprise: "entreprise-essai", emis: s, revoquees: [] });
    const rep = await envoyer({ campagne_id: campagne.id, empreinte: campagne.empreinte, destinataires: lecture.destinataires, empreinte_abonnes: lecture.empreinte_abonnes, preuve_approbation: preuve, revocations_approbation: revocations });
    expect(rep.statut, JSON.stringify(rep.corps)).toBe(200);
    expect(String(rep.corps["message"])).toMatch(/envoi de test, rien n'est parti/);

    // Lecture de l'API de Mailpit : le message est arrivé.
    let recu: MessageMailpit | undefined;
    for (let i = 0; i < 40 && !recu; i++) {
      const l = (await (await lireMailpit(`/api/v1/messages`)).json()) as { messages: MessageMailpit[] };
      recu = l.messages.find((x) => x.Subject === sujet);
      if (!recu) await new Promise((ok) => setTimeout(ok, 500));
    }
    expect(recu, "le message n'est pas arrivé dans Mailpit").toBeDefined();
    expect(recu!.To.map((t) => t.Address)).toEqual([adresse]);
    const complet = (await (await lireMailpit(`/api/v1/message/${recu!.ID}`)).json()) as { HTML: string; Text: string };
    expect(complet.HTML).toMatch(/href="http[^"]*\/subscription\/[^"]+"[^>]*>\s*Se désinscrire/);
    expect(complet.Text).toMatch(/désinscrivez-vous : http\S*\/subscription\//);
    const entetes = (await (await lireMailpit(`/api/v1/message/${recu!.ID}/headers`)).json()) as Record<string, string[]>;
    expect((entetes["List-Unsubscribe"] ?? [""])[0]).toMatch(/subscription/);
    expect(complet.HTML).not.toContain("{{");

    // État final lu par l'outil d'agent.
    const etat = await appeler("etat_campagne", { campagne_id: campagne.id });
    expect(etat["mode_envoi"]).toBe("test");

    // Ménage : le message de test est retiré de Mailpit, puis campagne, abonné et liste de test de listmonk.
    await lireMailpit(`/api/v1/messages`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ IDs: [recu!.ID] }) });
    const abonne = await gestion.chercherAbonne(adresse);
    await gestion.appeler("DELETE", `/api/campaigns/${campagne.id}`).catch(() => undefined);
    if (abonne) await gestion.appeler("DELETE", `/api/subscribers/${abonne.id}`).catch(() => undefined);
    await gestion.appeler("DELETE", `/api/lists/${liste.id}`).catch(() => undefined);
  }, 60_000);
});
