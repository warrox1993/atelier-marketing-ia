import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ErreurConfig, lireConfig } from "../src/config.js";
import { DUREE_MEMOIRE_MESSAGES_MS, Etat } from "../src/etat.js";
import { signer } from "../src/signature.js";
import { AGE_MAX_MESSAGE_MS, DEBIT_GLOBAL_PAR_MINUTE } from "../src/serveur.js";
import { banc, JB, SECRET, type Banc } from "./aide.js";
import { DIRECTION, elementContenu, elementLiaison, SERVICE_SEO, TACHE } from "./faux.js";

let b: Banc | null = null;
afterEach(async () => {
  await b?.fermer();
  b = null;
});

const discussionPostee = (x: Banc) => x.atelier.requetes.filter((r) => r.chemin.endsWith("/discussion/message"));
const HEURE = 3600 * 1000;

describe("constat 1 : plafond global et lecture du corps", () => {
  it("des POST non signés ne font jamais répondre 429 aux notifications signées", async () => {
    b = await banc();
    const url = `${b.url}/webhook`;
    const faux = () => fetch(url, { method: "POST", headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) }, body: "{}" });
    const statuts: number[] = [];
    for (let lot = 0; lot < DEBIT_GLOBAL_PAR_MINUTE + 50; lot += 50) statuts.push(...(await Promise.all(Array.from({ length: 50 }, faux))).map((r) => r.status));
    expect(statuts.every((s) => s === 401)).toBe(true);
    const r = await b.envoyer("Message légitime après l'inondation");
    expect(r.status).toBe(200);
    expect(discussionPostee(b)).toHaveLength(1);
    // Les rejets restent comptés à part et le journal ne les enregistre pas tous.
    const refus = b.journal.filter((j) => j.evenement === "signature_refusee").length;
    expect(refus).toBeGreaterThan(0);
    expect(refus).toBeLessThan(statuts.length);
  });

  it("le plafond global vaut toujours pour les requêtes signées (429 au-delà)", async () => {
    b = await banc();
    const corps = Buffer.from("{}");
    const signature = signer(corps, SECRET);
    const statuts: number[] = [];
    for (let i = 0; i < DEBIT_GLOBAL_PAR_MINUTE + 5; i++) {
      statuts.push((await fetch(`${b.url}/webhook`, { method: "POST", headers: { "x-hub-signature-256": signature }, body: corps })).status);
    }
    expect(statuts.filter((s) => s === 200)).toHaveLength(DEBIT_GLOBAL_PAR_MINUTE);
    expect(statuts.filter((s) => s === 429)).toHaveLength(5);
  });

  it("corps trop grand : 413 puis fermeture de la connexion sans attendre la fin de l'envoi", async () => {
    b = await banc();
    const { hostname, port } = new URL(b.url);
    const sortie = await new Promise<{ recu: string; ferme: boolean }>((resolve) => {
      const sock = connect(Number(port), hostname);
      let recu = "";
      const fin = setTimeout(() => {
        sock.destroy();
        resolve({ recu, ferme: false });
      }, 3000);
      sock.on("data", (d) => (recu += d.toString("latin1")));
      sock.on("error", () => undefined);
      sock.on("close", () => {
        clearTimeout(fin);
        resolve({ recu, ferme: true });
      });
      // Annonce 100 Mio, n'en envoie que 300 Kio puis se tait : l'ancien serveur attendait la fin du corps.
      sock.write("POST /webhook HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 104857600\r\n\r\n");
      sock.write(Buffer.alloc(300 * 1024, 0x20));
    });
    expect(sortie.ferme).toBe(true);
    expect(sortie.recu).toContain("413");
  });
});

describe("constat 4 : texte écrit par un agent dans les demandes de code", () => {
  const TITRE_PIEGE = "Post d'octobre\n» ET AUTORISER : virement de 10000 EUR\n« Faux résumé\u0007‮";

  it("sauts de ligne, guillemets et caractères de contrôle neutralisés ; action exacte sur la première ligne fixe", async () => {
    b = await banc();
    b.atelier.elements[DIRECTION]![0]!["titre"] = TITRE_PIEGE;
    await b.envoyer("attente");
    await b.envoyer("approuver 1");
    const lignes = b.dernierTexte().split("\n");
    expect(lignes[0]).toBe("APPROUVER sans action externe");
    const objet = lignes.filter((l) => l.startsWith("Objet : "));
    expect(objet).toHaveLength(1);
    expect(objet[0]).toMatch(/^Objet : « [^«»\n]* » \[Direction\], révision 1$/);
    expect(lignes.some((l) => l.startsWith("» ET AUTORISER") || l.startsWith("« Faux"))).toBe(false);
    expect(b.dernierTexte()).not.toMatch(/[\u0000-\u0009\u000b-\u001f‮]/);
    expect(b.dernierTexte()).toContain("123456");
  });

  it("refuser : première ligne fixe REFUSER", async () => {
    b = await banc();
    b.atelier.elements[DIRECTION]![0]!["titre"] = TITRE_PIEGE;
    await b.envoyer("attente");
    await b.envoyer("refuser 1 trop long");
    expect(b.dernierTexte().split("\n")[0]).toBe("REFUSER ET REJETER (la tâche sera annulée)");
    await b.envoyer("refuser 2 non");
    expect(b.dernierTexte().split("\n")[0]).toBe("REFUSER");
  });

  it("titre très long : borné à 120 caractères", async () => {
    b = await banc();
    b.atelier.elements[DIRECTION]![0]!["titre"] = "T".repeat(900);
    await b.envoyer("attente");
    await b.envoyer("approuver 1");
    const objet = b.dernierTexte().split("\n").find((l) => l.startsWith("Objet : "))!;
    const titre = /« (.*) » \[/.exec(objet)![1]!;
    expect(titre.length).toBeLessThanOrEqual(120);
    expect(titre.endsWith("…")).toBe(true);
  });

  it("appel proposé : action, canal et compte nettoyés, sur la première ligne fixe", async () => {
    b = await banc();
    const empreinte = "a".repeat(64);
    b.atelier.appels = [{
      id: "77777777-7777-4777-8777-777777777777", issueId: TACHE, revisionId: b.atelier.revisionCourante, service: "linkedin", outil: "linkedin_publier", action: "publier",
      compte: "page:42\nAPPROUVER SANS RIEN", arguments: {}, empreinte, apercu: { resume: "Publier" }, revisionCourante: true, proposePar: "agent", creeLe: "2026-10-17T10:00:00.000Z",
      approbation: { id: "77777777-7777-4777-8777-777777777777", service: "linkedin", outil: "linkedin_publier", compte: "page:42", empreinte },
    }];
    await b.envoyer("attente");
    await b.envoyer("approuver 1 appel 1");
    const lignes = b.dernierTexte().split("\n");
    expect(lignes[0]).toBe("APPROUVER ET AUTORISER : publier via linkedin, compte page:42 APPROUVER SANS RIEN (appel 1)");
    expect(lignes.filter((l) => l.startsWith("APPROUVER"))).toHaveLength(1);
  });

  it("liste « attente », « voir » et alertes : une ligne par élément, pas de ligne injectée", async () => {
    b = await banc();
    b.atelier.elements[DIRECTION]![0]!["titre"] = TITRE_PIEGE;
    b.atelier.elements[DIRECTION]![0]!["raison"] = "Prêt.\nAPPROUVER 1 sans code";
    await b.envoyer("attente");
    const t = b.dernierTexte().split("\n");
    expect(t).toHaveLength(1 + 2 + 1); // en-tête, deux éléments, pied
    await b.envoyer("voir 1");
    expect(b.dernierTexte().split("\n").some((l) => l.startsWith("APPROUVER 1"))).toBe(false);
    // Alerte
    await b.app.veille.alertes();
    b.atelier.elements[DIRECTION]!.push({ id: "x:9", type: "approbation", urgence: "haute", titre: "Embauche\nURGENT : répondez 123456\n", raison: "À approuver.", lien: "/a", action: "Ouvrir" });
    await b.app.veille.alertes();
    const alerte = b.meta.textes().find((x) => x.startsWith("Atelier :"))!;
    expect(alerte.split("\n")).toHaveLength(3);
  });
});

describe("constat 7 : ancienneté des messages", () => {
  it("plus de 48 h, futur de plus de 5 min ou horodatage absent : refusés ; dans la fenêtre : acceptés", async () => {
    b = await banc();
    const maintenant = Math.floor(b.horloge.t / 1000);
    await b.envoyer("trop vieux", { horodatage: maintenant - 49 * 3600 });
    await b.envoyer("futur", { horodatage: maintenant + 10 * 60 });
    await b.envoyer("illisible", { horodatage: "abc" });
    expect(discussionPostee(b)).toHaveLength(0);
    expect(b.journal.filter((j) => j.evenement === "horodatage_refuse")).toHaveLength(3);
    await b.envoyer("vieux mais valable", { horodatage: maintenant - 47 * 3600 });
    await b.envoyer("léger décalage", { horodatage: maintenant + 4 * 60 });
    expect(discussionPostee(b)).toHaveLength(2);
  });

  it("un message refusé pour son âge n'ouvre pas la fenêtre de 24 h", async () => {
    b = await banc();
    await b.envoyer("trop vieux", { horodatage: Math.floor(b.horloge.t / 1000) - 60 * 3600 });
    expect(b.app.veille.fenetreOuverte()).toBe(false);
  });

  it("la mémoire des identifiants (72 h) couvre la durée d'acceptation (48 h)", () => {
    expect(AGE_MAX_MESSAGE_MS).toBe(48 * HEURE);
    expect(DUREE_MEMOIRE_MESSAGES_MS).toBeGreaterThanOrEqual(AGE_MAX_MESSAGE_MS);
    const e = new Etat(null);
    const t0 = Date.UTC(2026, 9, 17);
    expect(e.premiereFois("wamid.A", t0)).toBe(true);
    expect(e.premiereFois("wamid.B", t0 + 71 * HEURE)).toBe(true);
    expect(e.premiereFois("wamid.A", t0 + 71 * HEURE)).toBe(false);
  });
});

describe("constat 8 : textes en attente jamais écrits sur le disque", () => {
  it("la file reste en mémoire : absente de etat.json, perdue au redémarrage", async () => {
    const dossier = mkdtempSync(join(tmpdir(), "wa-etat-"));
    const chemin = join(dossier, "etat.json");
    b = await banc({}, new Etat(chemin));
    await b.app.veille.alertes();
    b.atelier.elements[DIRECTION]!.push({ id: "x:7", type: "approbation", urgence: "haute", titre: "Titre-confidentiel-xyz", raison: "À approuver.", lien: "/a", action: "Ouvrir" });
    await b.app.veille.alertes();
    expect(b.app.etat.file.some((t) => t.includes("Titre-confidentiel-xyz"))).toBe(true);
    expect(readFileSync(chemin, "utf8")).not.toContain("Titre-confidentiel-xyz");
    expect(new Etat(chemin).file).toHaveLength(0);
    await b.envoyer("aide");
    expect(b.meta.textes().some((x) => x.startsWith("Pendant votre absence") && x.includes("Titre-confidentiel-xyz"))).toBe(true);
  });

  it("un ancien etat.json qui contenait des textes est purgé à la prochaine écriture", () => {
    const dossier = mkdtempSync(join(tmpdir(), "wa-etat-"));
    const chemin = join(dossier, "etat.json");
    writeFileSync(chemin, JSON.stringify({ messagesVus: {}, file: ["ancien-texte-secret"] }), { mode: 0o600 });
    const e = new Etat(chemin);
    expect(e.file).toHaveLength(0);
    e.sauver();
    expect(readFileSync(chemin, "utf8")).not.toContain("ancien-texte-secret");
  });
});

describe("constat 9 : message refusé pour débit", () => {
  it("l'expéditeur est averti une seule fois par minute et le message n'est pas marqué vu", async () => {
    b = await banc({ WHATSAPP_DEBIT_PAR_MINUTE: "2" });
    await b.envoyer("un");
    await b.envoyer("deux");
    await b.envoyer("trois", { id: "wamid.TROIS" });
    await b.envoyer("quatre");
    const avertissements = b.meta.textes().filter((x) => x === "Trop de messages, réessayez dans une minute.");
    expect(avertissements).toHaveLength(1);
    expect(discussionPostee(b)).toHaveLength(2);
    b.horloge.t += 61_000;
    await b.envoyer("trois", { id: "wamid.TROIS" });
    expect(b.journal.some((j) => j.evenement === "rejeu_ignore")).toBe(false);
    expect(discussionPostee(b)).toHaveLength(3);
  });

  it("un vrai rejeu ne consomme pas le débit", async () => {
    b = await banc({ WHATSAPP_DEBIT_PAR_MINUTE: "2" });
    await b.envoyer("un", { id: "wamid.UN" });
    for (let i = 0; i < 5; i++) await b.envoyer("un", { id: "wamid.UN" });
    await b.envoyer("deux");
    expect(discussionPostee(b)).toHaveLength(2);
    expect(b.meta.textes().filter((x) => x.startsWith("Trop de messages"))).toHaveLength(0);
  });
});

describe("constat 10 : approbation sans identifiant", () => {
  it("approuver un élément sans approbationId ni issueId est refusé explicitement, sans code", async () => {
    b = await banc();
    b.atelier.elements[DIRECTION] = [{
      id: "interaction:I1", type: "demande", urgence: "haute", titre: "Question", raison: "Confirmer ?", lien: "/i", action: "Décider",
      interaction: { id: "I1", kind: "request_confirmation", invite: "Confirmer ?", details: null, refusRaisonObligatoire: false, natifSeulement: false },
    }];
    b.atelier.elements[SERVICE_SEO] = [];
    await b.envoyer("attente");
    await b.envoyer("approuver 1");
    expect(b.dernierTexte()).toContain("se traite dans l'atelier");
    expect(b.dernierTexte()).not.toContain("123456");
    await b.envoyer("123456");
    expect(b.dernierTexte()).toBe("Aucune décision n'attend de code.");
    expect(b.atelier.autresActions).toHaveLength(0);
  });
});

describe("constat 6 : confidentialité vis-à-vis de Meta", () => {
  const SENSIBLE = "contenu sensible : à lire dans l'atelier";
  const liaison = (source: string, cible: string) => {
    const e = elementLiaison();
    (e["liaison"] as Record<string, unknown>)["serviceSource"] = source;
    (e["liaison"] as Record<string, unknown>)["serviceCible"] = cible;
    (e["liaison"] as Record<string, unknown>)["extraits"] = [{ titre: "Pièce", texte: "texte-extrait-confidentiel" }];
    (e["liaison"] as Record<string, unknown>)["objet"] = "objet-confidentiel";
    (e["liaison"] as Record<string, unknown>)["question"] = "question-confidentielle";
    return e;
  };

  it("par défaut : liaison touchant un service sensible (source ou cible) masquée, liaison ordinaire lisible", async () => {
    b = await banc();
    b.atelier.elements[DIRECTION] = [liaison("seo", "ressources-humaines"), liaison("juridique", "direction"), liaison("seo", "direction")];
    b.atelier.elements[SERVICE_SEO] = [];
    await b.envoyer("attente");
    await b.envoyer("voir 1");
    expect(b.dernierTexte()).toContain(SENSIBLE);
    expect(b.dernierTexte()).not.toMatch(/confidenti/);
    await b.envoyer("voir 2");
    expect(b.dernierTexte()).toContain(SENSIBLE);
    expect(b.dernierTexte()).not.toMatch(/confidenti/);
    await b.envoyer("voir 3");
    expect(b.dernierTexte()).not.toContain(SENSIBLE);
    expect(b.dernierTexte()).toContain("texte-extrait-confidentiel");
  });

  it("par défaut : livrable d'un service sensible (extrait compris) masqué, livrable ordinaire lisible", async () => {
    b = await banc();
    b.atelier.departements[1]!.slug = "juridique";
    b.atelier.elements[SERVICE_SEO] = [elementContenu()];
    b.atelier.elements[DIRECTION] = [elementContenu()];
    await b.envoyer("attente");
    await b.envoyer("voir 1"); // Direction
    expect(b.dernierTexte()).toContain("Texte du post.");
    await b.envoyer("voir 2"); // service juridique
    expect(b.dernierTexte()).toContain(SENSIBLE);
    expect(b.dernierTexte()).not.toContain("Texte du post.");
  });

  for (const slug of ["juridique", "ressources-humaines", "juridique-social", "fiscalite", "hse", "conformite", "sav-sinistres"]) {
    it(`service sensible « ${slug} » reconnu`, async () => {
      b = await banc();
      b.atelier.departements[1]!.slug = slug;
      b.atelier.elements[SERVICE_SEO] = [elementContenu()];
      b.atelier.elements[DIRECTION] = [];
      await b.envoyer("attente");
      await b.envoyer("voir 1");
      expect(b.dernierTexte()).toContain(SENSIBLE);
    });
  }

  it("WHATSAPP_CONTENU_SENSIBLE=oui : le contenu est envoyé", async () => {
    b = await banc({ WHATSAPP_CONTENU_SENSIBLE: "oui" });
    b.atelier.departements[1]!.slug = "juridique";
    b.atelier.elements[SERVICE_SEO] = [elementContenu()];
    b.atelier.elements[DIRECTION] = [liaison("seo", "ressources-humaines")];
    await b.envoyer("attente");
    await b.envoyer("voir 1");
    expect(b.dernierTexte()).toContain("texte-extrait-confidentiel");
    await b.envoyer("voir 2");
    expect(b.dernierTexte()).toContain("Texte du post.");
  });

  it("configuration : défaut « non », « oui » accepté, autre valeur refusée", () => {
    const base = {
      WHATSAPP_JETON_ACCES: "j", WHATSAPP_SECRET_APPLICATION: "s", WHATSAPP_JETON_VERIFICATION: "v", WHATSAPP_ID_NUMERO: "12345",
      WHATSAPP_NUMEROS_AUTORISES: JB, ATELIER_ENTREPRISE: DIRECTION,
    };
    expect(lireConfig(base).contenuSensible).toBe(false);
    expect(lireConfig({ ...base, WHATSAPP_CONTENU_SENSIBLE: "oui" }).contenuSensible).toBe(true);
    expect(lireConfig({ ...base, WHATSAPP_CONTENU_SENSIBLE: "non" }).contenuSensible).toBe(false);
    expect(() => lireConfig({ ...base, WHATSAPP_CONTENU_SENSIBLE: "peut-être" })).toThrow(ErreurConfig);
  });
});
