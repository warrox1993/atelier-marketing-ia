// @vitest-environment jsdom
/**
 * Décisions groupées : cases à cocher et « Autoriser / Refuser la sélection » sur les demandes
 * d'exclusion (Campagnes), « Approuver tout ce qui a passé le contrôle automatique » (Contenus et
 * Accueil). Vérifie la sélection, la confirmation unique avec récapitulatif, le filtre « contrôle
 * réussi » et l'échec partiel (les autres continuent, bilan des échecs).
 */
import { act, createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXEMPLES_DONNEES } from "../../src/contrats/exemples/index.js";
import { PageAtelier } from "../../src/ui/index.js";
import { VueAccueil } from "../../src/ui/vues/accueil.js";
import { champParLibelle, cliquer, ENTREPRISE, installerPont, parTexte, rendre, saisir, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
const A = "44444444-4444-4444-8444-4444444444a1";
const B = "44444444-4444-4444-8444-4444444444b2";
const C = "44444444-4444-4444-8444-4444444444c3";
const D = "44444444-4444-4444-8444-4444444444d4";
const R = (n: string) => `55555555-5555-4555-8555-5555555555${n}`;

type Dossier = Record<string, unknown> & { evaluationPorte: Record<string, unknown>; livrable: Record<string, unknown> };
const base = EXEMPLES_DONNEES["atelier.dossier"] as unknown as Dossier;
const dossierDe = (issueId: string, rev: string, decision = "PASS"): Dossier => ({
  ...base,
  issueId,
  livrable: { ...base.livrable, revisionId: rev },
  evaluationPorte: { ...base.evaluationPorte, revisionId: rev, decision },
});
const DOSSIERS: Record<string, Dossier> = {
  [A]: dossierDe(A, R("a1")),
  [B]: dossierDe(B, R("b2")),
  [C]: dossierDe(C, R("c3"), "REFUS"),
  // Le résumé annonce PASS mais le dossier réel est refusé : la garde du dossier doit l'écarter.
  [D]: dossierDe(D, R("d4"), "REFUS"),
};

let pont: Pont;
let rendu: Rendu | null = null;

/** Sert un dossier différent selon `issueId` (le pont simulé sert la même réponse à toutes les clés). */
function servirDossiersParIdentifiant() {
  const sdk = (globalThis as unknown as { __paperclipPluginBridge__: { sdkUi: { usePluginData: (cle: string, params?: Record<string, unknown>) => unknown } } }).__paperclipPluginBridge__.sdkUi;
  const original = sdk.usePluginData;
  sdk.usePluginData = (cle, params) => {
    if (cle === "atelier.dossier") {
      pont.appelsDonnees.push({ cle, params });
      return { data: DOSSIERS[String(params?.issueId)] ?? null, loading: false, error: null, refresh: () => undefined };
    }
    return original(cle, params);
  };
}

beforeEach(() => {
  pont = installerPont();
  servirDossiersParIdentifiant();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "done" }), { status: 200 })));
});
afterEach(() => {
  expect(pont.violations).toEqual([]);
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

async function page(chemin: string) {
  pont.chemin = chemin;
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  return rendu.conteneur;
}

const ligne = (issueId: string, titre: string, decisionPorte: string) => ({
  ...(EXEMPLES_DONNEES["atelier.contenus-a-valider"] as { prets: Record<string, unknown>[] }).prets[0],
  issueId,
  titre,
  decisionPorte,
});
const decisions = () => pont.appelsActions.filter((a) => a.cle === "atelier.decision");

describe("Contenus : approuver tout ce qui a passé le contrôle automatique", () => {
  beforeEach(() => {
    pont.donnees["atelier.contenus-a-valider"] = {
      data: { prets: [ligne(A, "Page Liège", "PASS"), ligne(B, "Page Herstal", "PASS"), ligne(C, "Page Seraing", "REFUS"), ligne(D, "Page Huy", "PASS")], bloques: [] },
      loading: false,
      error: null,
    };
  });

  it("ne prend que les contrôles réussis, demande un récapitulatif puis une seule confirmation", async () => {
    const c = await page("/RNO/atelier/contenus");
    // A et B passent ; C (REFUS dans le résumé) et D (REFUS dans le dossier réel) sont écartés.
    const ouvrir = parTexte(c, "button", "Approuver tout ce qui a passé le contrôle automatique (2)");
    expect(c.textContent).toContain("Les 1 autres restent à traiter un par un.");
    await cliquer(ouvrir);
    expect(decisions()).toHaveLength(0);
    const recap = c.querySelector('[aria-label="Confirmation de la décision groupée"]') as HTMLElement;
    expect(recap.textContent).toContain("Page Liège");
    expect(recap.textContent).toContain("Page Herstal");
    expect(recap.textContent).not.toContain("Page Seraing");
    expect(recap.textContent).not.toContain("Page Huy");
    expect(recap.textContent).toContain("Aucune publication, aucun envoi et aucune dépense");
    // Commentaire commun obligatoire.
    const confirmer = parTexte(recap, "button", "Confirmer l'approbation (2)");
    expect(confirmer.getAttribute("aria-disabled")).toBe("true");
    await cliquer(confirmer);
    expect(decisions()).toHaveLength(0);
    await saisir(champParLibelle(recap, "Commentaire commun (enregistré avec chaque approbation)"), "Conformes au brief.");
    await cliquer(parTexte(recap, "button", "Confirmer l'approbation (2)"));
    expect(decisions().map((d) => d.params)).toEqual([
      expect.objectContaining({ issueId: A, revisionId: R("a1"), action: "approuver", commentaire: "Conformes au brief.", portee: expect.objectContaining({ action: "aucune_action_externe", canal: null, montantMaxCents: null }) }),
      expect.objectContaining({ issueId: B, revisionId: R("b2"), action: "approuver", commentaire: "Conformes au brief." }),
    ]);
    expect(c.textContent).toContain("2 décisions enregistrées.");
    expect(pont.rafraichissements).toBeGreaterThan(0);
  });

  it("échec partiel : les autres continuent et le bilan nomme l'échec", async () => {
    pont.actions["atelier.decision"] = async (p) => {
      if (p?.issueId === A) throw { code: "WORKER_ERROR", message: "[conflit] La révision a changé." };
      return { id: "d", ...p };
    };
    const c = await page("/RNO/atelier/contenus");
    await cliquer(parTexte(c, "button", "Approuver tout ce qui a passé le contrôle automatique (2)"));
    await saisir(champParLibelle(c, "Commentaire commun (enregistré avec chaque approbation)"), "Conformes.");
    await cliquer(parTexte(c, "button", "Confirmer l'approbation (2)"));
    // Les deux sont tentés : A échoue, B continue.
    expect(decisions().map((d) => d.params?.issueId)).toEqual([A, B]);
    const bilan = c.querySelector('[aria-label="Bilan de la décision groupée"]') as HTMLElement;
    expect(bilan.textContent).toContain("1 sur 2 éléments enregistré ; 1 échec.");
    expect(bilan.textContent).toContain("Page Liège : La révision a changé.");
    expect(bilan.textContent).not.toContain("Page Herstal :");
  });

  it("annuler ne décide rien", async () => {
    const c = await page("/RNO/atelier/contenus");
    await cliquer(parTexte(c, "button", "Approuver tout ce qui a passé le contrôle automatique (2)"));
    await cliquer(parTexte(c, "button", "Annuler"));
    expect(decisions()).toHaveLength(0);
    expect(c.querySelector('[aria-label="Confirmation de la décision groupée"]')).toBeNull();
  });
});

describe("Accueil : approuver tout ce qui a passé le contrôle automatique", () => {
  it("ne propose que les contenus dont le contrôle est réussi", async () => {
    const elem = (id: string, issueId: string, titre: string) => ({ id: `contenu:${id}`, type: "contenu_a_valider", urgence: "haute", titre, raison: "Attend votre décision.", lien: `/atelier/contenus/${issueId}`, action: "Relire et décider", issueId });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/accueil?")) return new Response(JSON.stringify({ companyId: "c", elements: [elem("a", A, "Page Liège"), elem("c", C, "Page Seraing"), { id: "manque:marque", type: "information_manquante", urgence: "basse", titre: "Marque", raison: "x", lien: "/atelier/marque", action: "Décrire" }], missions: [] }), { status: 200 });
        if (url.includes("/prospects?")) return new Response(JSON.stringify({ total: 0, page: 1, pages: 1, prospects: [] }), { status: 200 });
        return new Response(JSON.stringify({ status: "done" }), { status: 200 });
      }),
    );
    pont.actions["atelier.decision"] = async (p) => ({ id: "d", ...p });
    rendu = await rendre(createElement(VueAccueil));
    const c = rendu.conteneur;
    await cliquer(parTexte(c, "button", "Approuver tout ce qui a passé le contrôle automatique (1)"));
    const recap = c.querySelector('[aria-label="Confirmation de la décision groupée"]') as HTMLElement;
    expect(recap.textContent).toContain("Page Liège");
    expect(recap.textContent).not.toContain("Page Seraing");
    await saisir(champParLibelle(recap, "Commentaire commun (enregistré avec chaque approbation)"), "Ok.");
    await cliquer(parTexte(recap, "button", "Confirmer l'approbation (1)"));
    expect(decisions()).toHaveLength(1);
    expect(decisions()[0]?.params).toMatchObject({ issueId: A, action: "approuver" });
  });
});

describe("Accueil : le bilan de l'approbation groupée survit à la liste vide", () => {
  it("le rechargement de la liste échoue : le bilan reste jusqu'à « Fermer »", async () => {
    const elem = { id: "contenu:a", type: "contenu_a_valider", urgence: "haute", titre: "Page Liège", raison: "Attend votre décision.", lien: `/atelier/contenus/${A}`, action: "Relire et décider", issueId: A };
    let accueils = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/accueil?")) {
          accueils += 1;
          // Premier relevé : un contenu ; rechargement après le lot : le serveur répond en erreur.
          if (accueils > 1) return new Response(JSON.stringify({ error: "indisponible" }), { status: 500 });
          return new Response(JSON.stringify({ companyId: "c", elements: [elem], missions: [] }), { status: 200 });
        }
        if (url.includes("/prospects?")) return new Response(JSON.stringify({ total: 0, page: 1, pages: 1, prospects: [] }), { status: 200 });
        return new Response(JSON.stringify({ status: "done" }), { status: 200 });
      }),
    );
    pont.actions["atelier.decision"] = async (p) => ({ id: "d", ...p });
    rendu = await rendre(createElement(VueAccueil));
    const c = rendu.conteneur;
    await cliquer(parTexte(c, "button", "Approuver tout ce qui a passé le contrôle automatique (1)"));
    const recap = c.querySelector('[aria-label="Confirmation de la décision groupée"]') as HTMLElement;
    await saisir(champParLibelle(recap, "Commentaire commun (enregistré avec chaque approbation)"), "Ok.");
    await cliquer(parTexte(recap, "button", "Confirmer l'approbation (1)"));
    await vi.waitFor(() => expect(accueils).toBeGreaterThanOrEqual(2));
    const bilan = c.querySelector('[aria-label="Bilan de la décision groupée"]') as HTMLElement;
    expect(bilan.textContent).toContain("1 décision enregistrée.");
    await cliquer(parTexte(bilan, "button", "Fermer"));
    expect(c.querySelector('[aria-label="Bilan de la décision groupée"]')).toBeNull();
  });
});

describe("Campagnes : décision groupée sur les demandes d'exclusion", () => {
  const exigence = (n: string, etat: string) => ({
    ...(EXEMPLES_DONNEES["atelier.campagne"] as { exigences: Record<string, unknown>[] }).exigences[0],
    id: `66666666-6666-4666-8666-66666666666${n}`,
    code: `REQ-00${n}`,
    interpretation: `Exigence ${n}`,
    exclusion: { etat, justification: etat === "demandee" ? "Hors périmètre." : null, demandeePar: null, decideePar: null, decideeLe: null },
  });
  const ID = (n: string) => `66666666-6666-4666-8666-66666666666${n}`;
  beforeEach(() => {
    const d = EXEMPLES_DONNEES["atelier.campagne"] as Record<string, unknown>;
    pont.donnees["atelier.campagne"] = { data: { ...d, exigences: [exigence("1", "demandee"), exigence("2", "demandee"), exigence("3", "aucune"), exigence("4", "demandee")] }, loading: false, error: null };
  });
  const campagneId = (EXEMPLES_DONNEES["atelier.campagne"] as { campagne: { id: string } }).campagne.id;

  it("coche, récapitule, confirme une fois ; seules les demandes en attente sont cochables", async () => {
    pont.actions["atelier.exigence.exclusion"] = async (p) => ({ ...p });
    const c = await page(`/RNO/atelier/campagnes/${campagneId}`);
    expect(c.querySelectorAll('input[type="checkbox"][aria-label^="Sélectionner l\'exigence"]')).toHaveLength(3);
    const autoriser = parTexte(c, "button", "Autoriser la sélection (0)");
    expect(autoriser.getAttribute("aria-disabled")).toBe("true");
    await cliquer(c.querySelector('input[aria-label="Sélectionner l\'exigence : Exigence 1"]') as HTMLElement);
    await cliquer(c.querySelector('input[aria-label="Sélectionner l\'exigence : Exigence 4"]') as HTMLElement);
    await cliquer(parTexte(c, "button", "Autoriser la sélection (2)"));
    expect(pont.appelsActions).toHaveLength(0);
    const recap = c.querySelector('[aria-label="Confirmation de la décision groupée"]') as HTMLElement;
    expect(recap.textContent).toContain("Exigence 1");
    expect(recap.textContent).toContain("Exigence 4");
    expect(recap.textContent).not.toContain("Exigence 2");
    const confirmer = parTexte(recap, "button", "Confirmer l'autorisation (2)");
    expect(confirmer.getAttribute("aria-disabled")).toBe("true");
    await saisir(champParLibelle(recap, "Votre justification commune"), "Court");
    expect(parTexte(recap, "button", "Confirmer l'autorisation (2)").getAttribute("aria-disabled")).toBe("true");
    await saisir(champParLibelle(recap, "Votre justification commune"), "Hors périmètre de la campagne.");
    await cliquer(parTexte(recap, "button", "Confirmer l'autorisation (2)"));
    expect(pont.appelsActions.map((a) => a.params)).toEqual([
      { exigenceId: ID("1"), decision: "autoriser", justification: "Hors périmètre de la campagne." },
      { exigenceId: ID("4"), decision: "autoriser", justification: "Hors périmètre de la campagne." },
    ]);
    expect(c.textContent).toContain("2 décisions enregistrées.");
  });

  it("après un lot réussi, le bilan reste jusqu'à « Fermer » et une nouvelle demande se traite normalement", async () => {
    // Recharge réelle simulée : « refresh » relit pont.donnees et refait le rendu de la page.
    const sdk = (globalThis as unknown as { __paperclipPluginBridge__: { sdkUi: { usePluginData: (cle: string, params?: Record<string, unknown>) => Record<string, unknown> } } }).__paperclipPluginBridge__.sdkUi;
    const original = sdk.usePluginData;
    let relire = () => {};
    sdk.usePluginData = (cle, params) => {
      const [, setN] = useState(0);
      relire = () => setN((n) => n + 1);
      return { ...original(cle, params), refresh: () => setN((n) => n + 1) };
    };
    const d = EXEMPLES_DONNEES["atelier.campagne"] as Record<string, unknown>;
    const donnees = (exigences: unknown[]) => ({ data: { ...d, exigences }, loading: false, error: null });
    pont.actions["atelier.exigence.exclusion"] = async (p) => {
      // Les trois demandes sont traitées : plus aucune n'est en attente.
      pont.donnees["atelier.campagne"] = donnees([exigence("1", "aucune"), exigence("2", "aucune"), exigence("3", "aucune"), exigence("4", "aucune")]);
      return { ...p };
    };
    const c = await page(`/RNO/atelier/campagnes/${campagneId}`);
    await cliquer(parTexte(c, "label", "Toutes les demandes d'exclusion (3)").querySelector("input") as HTMLElement);
    await cliquer(parTexte(c, "button", "Autoriser la sélection (3)"));
    const recap = c.querySelector('[aria-label="Confirmation de la décision groupée"]') as HTMLElement;
    await saisir(champParLibelle(recap, "Votre justification commune"), "Hors périmètre de la campagne.");
    await cliquer(parTexte(recap, "button", "Confirmer l'autorisation (3)"));
    const bilan = c.querySelector('[aria-label="Bilan de la décision groupée"]') as HTMLElement;
    expect(bilan.textContent).toContain("3 décisions enregistrées.");
    // Le bilan survit au rechargement : plus aucune demande en attente, le bloc de sélection a disparu.
    expect(c.querySelector('[aria-label="Décision groupée sur les demandes d\'exclusion"]')).toBeNull();
    expect(c.querySelector('[aria-label="Bilan de la décision groupée"]')).not.toBeNull();
    await cliquer(parTexte(bilan, "button", "Fermer"));
    expect(c.querySelector('[aria-label="Bilan de la décision groupée"]')).toBeNull();
    // Une nouvelle demande arrive : aucune confirmation fantôme, boutons utilisables.
    pont.donnees["atelier.campagne"] = donnees([exigence("1", "aucune"), exigence("2", "aucune"), exigence("3", "aucune"), exigence("4", "aucune"), exigence("5", "demandee")]);
    await act(async () => relire());
    expect(c.querySelector('[aria-label="Confirmation de la décision groupée"]')).toBeNull();
    await cliquer(c.querySelector('input[aria-label="Sélectionner l\'exigence : Exigence 5"]') as HTMLElement);
    const refuser = parTexte(c, "button", "Refuser la sélection (1)");
    expect(refuser.getAttribute("aria-disabled")).not.toBe("true");
    await cliquer(refuser);
    const recap2 = c.querySelector('[aria-label="Confirmation de la décision groupée"]') as HTMLElement;
    expect(recap2.textContent).toContain("Exigence 5");
    expect(recap2.textContent).not.toContain("Exigence 1");
    await saisir(champParLibelle(recap2, "Votre justification commune"), "Exigence maintenue pour la qualité.");
    await cliquer(parTexte(recap2, "button", "Confirmer le refus (1)"));
    expect(pont.appelsActions.at(-1)?.params).toEqual({ exigenceId: ID("5"), decision: "refuser", justification: "Exigence maintenue pour la qualité." });
    sdk.usePluginData = original;
  });

  it("refus groupé avec échec partiel : la suite continue et l'échec est listé", async () => {
    pont.actions["atelier.exigence.exclusion"] = async (p) => {
      if (p?.exigenceId === ID("1")) throw { code: "WORKER_ERROR", message: "[conflit] Déjà décidée." };
      return { ...p };
    };
    const c = await page(`/RNO/atelier/campagnes/${campagneId}`);
    await cliquer(parTexte(c, "label", "Toutes les demandes d'exclusion (3)").querySelector("input") as HTMLElement);
    await cliquer(parTexte(c, "button", "Refuser la sélection (3)"));
    const recap = c.querySelector('[aria-label="Confirmation de la décision groupée"]') as HTMLElement;
    await saisir(champParLibelle(recap, "Votre justification commune"), "Exigence maintenue pour la qualité.");
    await cliquer(parTexte(recap, "button", "Confirmer le refus (3)"));
    expect(pont.appelsActions.map((a) => (a.params as { exigenceId: string }).exigenceId)).toEqual([ID("1"), ID("2"), ID("4")]);
    const bilan = c.querySelector('[aria-label="Bilan de la décision groupée"]') as HTMLElement;
    expect(bilan.textContent).toContain("2 sur 3 éléments enregistrés ; 1 échec.");
    expect(bilan.textContent).toContain("Exigence 1 : Déjà décidée.");
  });
});
