import { describe, expect, it, afterEach } from "vitest";
import { ErreurConfig, lireConfig } from "../src/config.js";
import { decouper } from "../src/meta.js";
import { banc, JB, type Banc } from "./aide.js";
import { DIRECTION, SERVICE_SEO } from "./faux.js";

let b: Banc | null = null;
afterEach(async () => {
  await b?.fermer();
  b = null;
});

const HEURE = 3600 * 1000;

describe("réponses du coordinateur et alertes", () => {
  it("réponse du coordinateur relayée dans la fenêtre de 24 h", async () => {
    b = await banc();
    await b.app.veille.discussion(); // pose le curseur
    await b.envoyer("Bonjour"); // ouvre la fenêtre
    b.atelier.discussion.push({ id: "r1", auteur: "agent", nom: "Coordinateur général", texte: "Tout avance bien.", date: new Date(b.horloge.t + 1000).toISOString() });
    await b.app.veille.discussion();
    expect(b.dernierTexte()).toBe("Coordinateur général : Tout avance bien.");
  });

  it("premier passage silencieux, puis nouvel élément et cycles épuisés alertés", async () => {
    b = await banc();
    await b.envoyer("bonjour");
    const avant = b.meta.envois.length;
    await b.app.veille.alertes();
    expect(b.meta.envois.length).toBe(avant);
    b.atelier.elements[DIRECTION]!.push({ id: "tache_bloquee:T9", type: "tache_bloquee", urgence: "haute", titre: "Article SEO", raison: "Bloquée depuis 2 h.", lien: "/t", action: "Ouvrir", issueId: "T9" });
    b.atelier.journal[SERVICE_SEO]!.push({ seq: 5, type: "cycles.epuises", issueId: "88888888-8888-4888-8888-888888888888", donnees: {} });
    await b.app.veille.alertes();
    const t = b.dernierTexte();
    expect(t).toContain("2 nouveauté(s)");
    expect(t).toContain("[Direction] Article SEO");
    expect(t).toContain("[SEO] cycles de production épuisés");
    await b.app.veille.alertes();
    expect(b.meta.envois.length).toBe(avant + 1);
  });

  it("hors fenêtre, sans accord de payer : rien n'est envoyé, l'alerte attend le prochain message de l'opérateur", async () => {
    b = await banc();
    await b.app.veille.alertes();
    b.atelier.elements[DIRECTION]!.push({ id: "x:1", type: "approbation", urgence: "haute", titre: "Embauche", raison: "À approuver.", lien: "/a", action: "Ouvrir" });
    await b.app.veille.alertes();
    expect(b.meta.envois).toHaveLength(0);
    await b.envoyer("aide");
    const textes = b.meta.textes();
    expect(textes.some((x) => x.startsWith("Pendant votre absence") && x.includes("Embauche"))).toBe(true);
  });

  it("hors fenêtre avec WHATSAPP_MODELE_HORS_FENETRE=oui : modèle utilitaire, jamais de texte libre, espacé de 4 h", async () => {
    b = await banc({ WHATSAPP_MODELE_HORS_FENETRE: "oui" });
    await b.envoyer("bonjour");
    b.horloge.t += 25 * HEURE; // fenêtre fermée
    await b.app.veille.alertes();
    b.atelier.elements[DIRECTION]!.push({ id: "x:2", type: "approbation", urgence: "haute", titre: "Budget", raison: "À approuver.", lien: "/a", action: "Ouvrir" });
    const avant = b.meta.envois.length;
    await b.app.veille.alertes();
    const nouveaux = b.meta.envois.slice(avant);
    expect(nouveaux).toHaveLength(1);
    expect(nouveaux[0]!.corps).toEqual({
      messaging_product: "whatsapp", to: JB, type: "template",
      template: { name: "alerte_atelier", language: { code: "fr" }, components: [{ type: "body", parameters: [{ type: "text", text: "1" }] }] },
    });
    b.atelier.elements[DIRECTION]!.push({ id: "x:3", type: "approbation", urgence: "haute", titre: "Budget 2", raison: "À approuver.", lien: "/a", action: "Ouvrir" });
    await b.app.veille.alertes();
    expect(b.meta.envois.length).toBe(avant + 1);
  });
});

describe("configuration", () => {
  const base = {
    WHATSAPP_JETON_ACCES: "j", WHATSAPP_SECRET_APPLICATION: "s", WHATSAPP_JETON_VERIFICATION: "v", WHATSAPP_ID_NUMERO: "12345",
    WHATSAPP_NUMEROS_AUTORISES: "32470000001", ATELIER_ENTREPRISE: DIRECTION,
  };
  it("valeurs par défaut sûres", () => {
    const c = lireConfig(base);
    expect(c.hote).toBe("127.0.0.1");
    expect(c.port).toBe(3195);
    expect(c.atelierApi).toBe("http://127.0.0.1:3100/api");
    expect(c.graphUrl).toBe("https://graph.facebook.com");
    expect(c.modeleHorsFenetre).toBe(false);
  });
  it("refuse une écoute publique, une instance distante, un Graph non chiffré, un secret manquant", () => {
    expect(() => lireConfig({ ...base, WHATSAPP_HOTE: "0.0.0.0" })).toThrow(ErreurConfig);
    expect(() => lireConfig({ ...base, ATELIER_API: "http://exemple.be:3100/api" })).toThrow(ErreurConfig);
    expect(() => lireConfig({ ...base, WHATSAPP_GRAPH_URL: "http://graph.facebook.com" })).toThrow(ErreurConfig);
    expect(() => lireConfig({ ...base, WHATSAPP_SECRET_APPLICATION: "" })).toThrow(ErreurConfig);
    expect(() => lireConfig({ ...base, WHATSAPP_NUMEROS_AUTORISES: "abc" })).toThrow(ErreurConfig);
    expect(() => lireConfig({ ...base, WHATSAPP_MODELE_HORS_FENETRE: "oui" })).toThrow(ErreurConfig);
  });
  it("découpe des longs textes sous la limite de Meta", () => {
    const morceaux = decouper("ligne\n".repeat(2000));
    expect(morceaux.length).toBeGreaterThan(1);
    expect(morceaux.every((m) => m.length <= 4096)).toBe(true);
  });
});
