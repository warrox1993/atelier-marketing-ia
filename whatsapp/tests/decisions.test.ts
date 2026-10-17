import { afterEach, describe, expect, it } from "vitest";
import { CodesConfirmation, VALIDITE_CODE_MS } from "../src/codes.js";
import { banc, type Banc } from "./aide.js";
import { REV2, SERVICE_SEO, TACHE } from "./faux.js";

let b: Banc | null = null;
afterEach(async () => {
  await b?.fermer();
  b = null;
});

/** Toute action du faux atelier qui change un état (décision, liaison, approbation, pause, statut). */
const mutations = (x: Banc) => x.atelier.decisions.length + x.atelier.autresActions.length;

describe("codes de confirmation (unité)", () => {
  it("6 chiffres, usage unique, expiration, liaison au numéro, 3 essais", () => {
    let t = 0;
    const c = new CodesConfirmation<string>(() => t, () => 42);
    const code = c.emettre("A", { cle: "k", version: "v", entete: "e", objet: "o", resume: "r", charge: "x" });
    expect(code).toBe("000042");
    expect(c.verifier("B", code)).toEqual({ ok: false, raison: "aucune" });
    expect(c.verifier("A", code).ok).toBe(true);
    expect(c.verifier("A", code)).toEqual({ ok: false, raison: "aucune" });
    c.emettre("A", { cle: "k", version: "v", entete: "e", objet: "o", resume: "r", charge: "x" });
    t += VALIDITE_CODE_MS + 1;
    expect(c.verifier("A", "000042")).toEqual({ ok: false, raison: "expire" });
    c.emettre("A", { cle: "k", version: "v", entete: "e", objet: "o", resume: "r", charge: "x" });
    expect(c.verifier("A", "000001").ok).toBe(false);
    expect(c.verifier("A", "abcdef").ok).toBe(false);
    expect(c.verifier("A", "000002")).toEqual({ ok: false, raison: "trop_essais" });
    expect(c.verifier("A", "000042")).toEqual({ ok: false, raison: "aucune" });
  });
});

describe("décision sur un contenu à valider", () => {
  it("aucune décision sans code : approuver, refuser et corriger n'écrivent rien", async () => {
    b = await banc();
    await b.envoyer("attente");
    expect(b.dernierTexte()).toContain("Post LinkedIn d'octobre");
    await b.envoyer("approuver 1");
    expect(b.dernierTexte()).toContain("123456");
    await b.envoyer("refuser 1 trop long");
    await b.envoyer("corriger 1 changer le titre");
    await b.envoyer("approuver 2");
    await b.envoyer("reprendre service 1");
    expect(mutations(b)).toBe(0);
  });

  it("bon code : décision enregistrée comme décision HUMAINE de l'opérateur, origine whatsapp, même chemin que l'écran", async () => {
    b = await banc();
    await b.envoyer("attente");
    await b.envoyer("approuver 1 Parfait, merci");
    await b.envoyer("123456");
    expect(b.atelier.decisions).toHaveLength(1);
    const d = b.atelier.decisions[0]!;
    expect(d).toMatchObject({ issueId: TACHE, action: "approuver", userId: "local-board", acteurType: "humain" });
    expect(d.commentaire).toContain("origine : whatsapp");
    expect(d.commentaire).toContain("Parfait, merci");
    expect(d.portee).toMatchObject({ action: "aucune_action_externe", canal: null, compte: null, montantMaxCents: null });
    // Route du plugin (tache.decision), sans en-tête d'agent.
    const req = b.atelier.requetes.find((r) => r.chemin.endsWith(`/taches/${TACHE}/decisions`))!;
    expect(req.entetes["x-paperclip-run-id"]).toBeUndefined();
    expect(req.entetes.authorization).toBeUndefined();
    // Même transition native que l'écran après une approbation.
    expect(b.atelier.autresActions.some((r) => r.methode === "PATCH" && r.chemin === `/api/issues/${TACHE}` && (r.corps as { status: string }).status === "done")).toBe(true);
    expect(b.dernierTexte()).toContain("Décision enregistrée");
    expect(b.registre.map((e) => e.type)).toEqual(["demande", "confirmee", "executee"]);
  });

  it("code faux : refusé, aucune décision ; trois codes faux annulent la décision", async () => {
    b = await banc();
    await b.envoyer("attente");
    await b.envoyer("approuver 1");
    await b.envoyer("999999");
    expect(b.dernierTexte()).toBe("Code incorrect.");
    await b.envoyer("999998");
    await b.envoyer("999997");
    expect(b.dernierTexte()).toContain("Trois codes incorrects");
    await b.envoyer("123456");
    expect(b.dernierTexte()).toBe("Aucune décision n'attend de code.");
    expect(mutations(b)).toBe(0);
  });

  it("code expiré : refusé, aucune décision", async () => {
    b = await banc();
    await b.envoyer("attente");
    await b.envoyer("approuver 1");
    b.horloge.t += VALIDITE_CODE_MS + 1000;
    await b.envoyer("123456");
    expect(b.dernierTexte()).toContain("Code expiré");
    expect(mutations(b)).toBe(0);
  });

  it("code réutilisé : la seconde fois ne décide rien", async () => {
    b = await banc();
    await b.envoyer("attente");
    await b.envoyer("approuver 1");
    await b.envoyer("123456");
    await b.envoyer("123456");
    expect(b.atelier.decisions).toHaveLength(1);
    expect(b.dernierTexte()).toBe("Aucune décision n'attend de code.");
  });

  it("code d'une autre décision : ne confirme pas la décision suivante", async () => {
    b = await banc();
    await b.envoyer("attente");
    await b.envoyer("approuver 1"); // code 123456 pour le contenu
    await b.envoyer("refuser 2 pas maintenant"); // code 654321 pour la liaison : 123456 est annulé
    await b.envoyer("123456");
    expect(b.dernierTexte()).toBe("Code incorrect.");
    expect(mutations(b)).toBe(0);
    await b.envoyer("654321");
    expect(b.atelier.decisions).toHaveLength(0);
    const liaison = b.atelier.autresActions.filter((r) => r.chemin.endsWith("/liaisons/decider"));
    expect(liaison).toHaveLength(1);
    expect(liaison[0]!.corps).toMatchObject({ companyId: SERVICE_SEO, decision: "refuser", raison: "pas maintenant" });
  });

  it("nouvelle révision entre le code et la confirmation : refus, aucune décision", async () => {
    b = await banc();
    await b.envoyer("attente");
    await b.envoyer("approuver 1");
    b.atelier.revisionCourante = REV2;
    await b.envoyer("123456");
    expect(b.dernierTexte()).toContain("a changé");
    expect(b.atelier.decisions).toHaveLength(0);
    expect(b.registre.some((e) => e.type === "echec")).toBe(true);
  });

  it("refus avec motif : rejet enregistré, motif obligatoire", async () => {
    b = await banc();
    await b.envoyer("attente");
    await b.envoyer("refuser 1");
    expect(b.dernierTexte()).toContain("Motif obligatoire");
    await b.envoyer("refuser 1 Ton trop commercial");
    expect(b.dernierTexte()).toContain("REJETER");
    await b.envoyer("123456");
    expect(b.atelier.decisions[0]).toMatchObject({ action: "rejeter", portee: null, acteurType: "humain" });
    expect(b.atelier.decisions[0]!.commentaire).toContain("Ton trop commercial");
  });

  it("approbation d'un appel proposé : portée exacte de l'appel (publication)", async () => {
    b = await banc();
    const empreinte = "a".repeat(64);
    b.atelier.appels = [{
      id: "77777777-7777-4777-8777-777777777777", issueId: TACHE, revisionId: b.atelier.revisionCourante, service: "linkedin", outil: "linkedin_publier", action: "publier",
      compte: "page:42", arguments: {}, empreinte, apercu: { resume: "Publier le post sur la page" }, revisionCourante: true, proposePar: "agent", creeLe: "2026-10-17T10:00:00.000Z",
      approbation: { id: "77777777-7777-4777-8777-777777777777", service: "linkedin", outil: "linkedin_publier", compte: "page:42", empreinte },
    }];
    await b.envoyer("attente");
    await b.envoyer("voir 1");
    expect(b.dernierTexte()).toContain("appel 1 : publier via linkedin");
    await b.envoyer("approuver 1 appel 1 ok pour publier");
    expect(b.dernierTexte()).toContain("AUTORISER : publier via linkedin");
    await b.envoyer("123456");
    expect(b.atelier.decisions[0]!.portee).toMatchObject({ action: "publier", canal: "linkedin", compte: "page:42", appel: { empreinte } });
    expect(b.atelier.decisions[0]!.commentaire).toContain("ok pour publier");
  });

  it("annuler : la décision en attente est abandonnée", async () => {
    b = await banc();
    await b.envoyer("attente");
    await b.envoyer("approuver 1");
    await b.envoyer("annuler");
    await b.envoyer("123456");
    expect(mutations(b)).toBe(0);
  });
});

describe("agents et services", () => {
  it("pause sans code (frein d'urgence), reprise avec code", async () => {
    b = await banc();
    await b.envoyer("agents");
    expect(b.dernierTexte()).toContain("Coordinateur général");
    await b.envoyer("pause agent 1");
    expect(b.atelier.agents[0]!.status).toBe("paused");
    await b.envoyer("reprendre agent 2");
    expect(b.atelier.agents[1]!.status).toBe("paused");
    await b.envoyer("555555");
    expect(b.atelier.agents[1]!.status).toBe("paused");
    await b.envoyer("reprendre agent 2");
    await b.envoyer(String(b.codes[1]));
    expect(b.atelier.agents[1]!.status).toBe("idle");
  });

  it("service : pause directe, reprise avec code", async () => {
    b = await banc();
    await b.envoyer("services");
    expect(b.dernierTexte()).toContain("SEO : paused");
    await b.envoyer("pause service 1");
    expect(b.atelier.entreprises[Object.keys(b.atelier.entreprises)[0]!]!.status).toBe("paused");
    await b.envoyer("reprendre service 2");
    expect(b.atelier.entreprises[SERVICE_SEO]!.status).toBe("paused");
    await b.envoyer("123456");
    expect(b.atelier.entreprises[SERVICE_SEO]!.status).toBe("active");
  });
});
