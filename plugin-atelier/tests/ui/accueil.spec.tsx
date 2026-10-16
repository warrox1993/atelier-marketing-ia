// @vitest-environment jsdom
/**
 * Accueil (lot 1) : rendu des trois blocs, envoi d'une demande, état vide. Les routes du plugin
 * sont servies par un `fetch` simulé ; la vue est rendue seule (`VueAccueil`).
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageAtelier } from "../../src/ui/index.js";
import { reinitialiserCompteurAFaire, titreOnglet } from "../../src/ui/compteur-afaire.js";
import { VueAccueil } from "../../src/ui/vues/accueil.js";
import { champParLibelle, cliquer, installerPont, parTexte, rendre, saisir, type Rendu } from "./pont.js";

let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string; corps: unknown }> = [];
let serveur: (methode: string, url: string, corps: unknown) => { statut: number; corps: unknown };

const ELEMENT = { id: "contenu:1", type: "contenu_a_valider", urgence: "haute", titre: "Page toiture", raison: "Le contenu attend votre décision.", lien: "/atelier/contenus/1", action: "Relire et décider" };
const BAS = { id: "manque:marque", type: "information_manquante", urgence: "basse", titre: "Marque non décrite", raison: "Sans description, l'équipe ne connaît pas votre ton.", lien: "/atelier/marque", action: "Décrire la marque" };
const MISSION = { issueId: "m1", identifiant: "DEM-1", titre: "Post de printemps", statut: "in_progress", statutLibelle: "En cours", creeLe: "2026-10-15T10:00:00.000Z", lien: "/issues/DEM-1", projet: { id: "p1", nom: "Campagne de printemps" }, aPlan: true, lienPlan: "/issues/DEM-1#document-plan" };
const etape = (o: Record<string, unknown>) => ({ issueId: "x", identifiant: "DEM-1", titre: "T", statut: "todo", statutLibelle: "À faire", agent: null, profondeur: 0, dernierCommentaire: null, misAJourLe: "2026-10-15T10:00:00.000Z", lien: "/issues/DEM-1", ...o });
const SUIVI = {
  mere: etape({ issueId: "m1", titre: "Post de printemps", statut: "in_progress", statutLibelle: "En cours", agent: { id: "a", nom: "Coordinateur" } }),
  sousTaches: [etape({ issueId: "s1", titre: "Rédiger le texte", profondeur: 1, agent: { id: "b", nom: "Contenus" }, dernierCommentaire: { resume: "Brouillon prêt.", le: "2026-10-15T11:00:00.000Z" } })],
};

let pont: ReturnType<typeof installerPont>;
const T = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  reinitialiserCompteurAFaire();
  pont = installerPont("/RNO/atelier/accueil");
  appels = [];
  serveur = (methode, url) => {
    if (url.includes("/accueil?")) return { statut: 200, corps: { companyId: "c", elements: [ELEMENT, BAS], missions: [MISSION] } };
    if (url.includes("/prospects?")) return { statut: 200, corps: { total: url.includes("qualifiesSeulement=true") ? 7 : 42, page: 1, pages: 42, prospects: [] } };
    if (url.includes("/missions/")) return { statut: 200, corps: SUIVI };
    if (methode === "POST") return { statut: 201, corps: { issueId: "n1", identifiant: "DEM-2", lien: "/issues/DEM-2" } };
    return { statut: 404, corps: {} };
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const corps = init?.body ? JSON.parse(init.body) : null;
      appels.push({ methode: init?.method ?? "GET", url, corps });
      const r = serveur(init?.method ?? "GET", url, corps);
      return new Response(JSON.stringify(r.corps), { status: r.statut });
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

async function ouvrir() {
  rendu = await rendre(createElement(VueAccueil));
  return rendu.conteneur;
}

describe("accueil", () => {
  it("affiche la boîte de demande, la liste À faire triée avec un bouton par ligne, et la frise de mission", async () => {
    const c = await ouvrir();
    expect(c.textContent).toContain("Demander à l'équipe");
    expect(c.textContent).toContain("Le Coordinateur reçoit votre demande et la répartit.");
    const lignes = c.querySelectorAll(".atl-afaire > li");
    expect(lignes).toHaveLength(2);
    expect(lignes[0]!.textContent).toContain("Page toiture");
    expect(lignes[0]!.textContent).toContain("Urgent");
    expect(lignes[0]!.querySelector("a")?.textContent).toBe("Relire et décider");
    expect(lignes[1]!.textContent).toContain("Quand vous pouvez");
    const frise = c.querySelectorAll(".atl-frise > li");
    expect(frise).toHaveLength(2);
    expect(frise[0]!.textContent).toContain("Coordinateur");
    expect(frise[1]!.textContent).toContain("Rédiger le texte");
    expect(frise[1]!.textContent).toContain("Contenus");
    expect(frise[1]!.textContent).toContain("Brouillon prêt.");
    expect(c.textContent).not.toContain("—");
    expect(appels.some((a) => a.url.includes("/accueil?companyId="))).toBe(true);
    expect(appels.some((a) => a.url.includes("/missions/m1?companyId="))).toBe(true);
  });

  it("l'encart Prospection vient en premier, avant « Demander à l'équipe », avec total, qualifiés et deux liens", async () => {
    const c = await ouvrir();
    const titres = Array.from(c.querySelectorAll("h2, h3")).map((h) => h.textContent);
    expect(titres.indexOf("Prospection")).toBeGreaterThanOrEqual(0);
    expect(titres.indexOf("Prospection")).toBeLessThan(titres.indexOf("Demander à l'équipe"));
    const encart = c.querySelector(".atl-prospection")!;
    expect(encart.textContent).toContain("42");
    expect(encart.textContent).toContain("leads au total");
    expect(encart.textContent).toContain("7");
    expect(encart.textContent).toContain("leads qualifiés");
    expect(appels.some((a) => a.url.includes("/prospects?") && a.url.includes("parPage=1") && !a.url.includes("qualifiesSeulement"))).toBe(true);
    expect(appels.some((a) => a.url.includes("/prospects?") && a.url.includes("parPage=1") && a.url.includes("qualifiesSeulement=true"))).toBe(true);
    await cliquer(parTexte(encart, "a", "Voir les prospects"));
    await cliquer(parTexte(encart, "a", "Voir la carte"));
    expect(pont.navigations).toEqual(expect.arrayContaining(["/atelier/prospects", "/atelier/carte"]));
  });

  it("sans lead : message honnête et modèle « Prospection d'une zone » appliqué à la demande", async () => {
    const base = serveur;
    serveur = (m, u, b) => (u.includes("/prospects?") ? { statut: 200, corps: { total: 0, page: 1, pages: 0, prospects: [] } } : base(m, u, b));
    const c = await ouvrir();
    const encart = c.querySelector(".atl-prospection")!;
    expect(encart.textContent).toContain("Aucun lead pour l'instant : demandez une prospection à l'équipe");
    expect(encart.querySelector("a")).toBeNull();
    await cliquer(parTexte(encart, "button", "Utiliser le modèle « Prospection d'une zone »"));
    const champ = champParLibelle(c, "Votre demande") as HTMLTextAreaElement;
    expect(champ.value).toContain("Trouve les prospects les plus pertinents pour <segment>");
  });

  it("erreur de la route prospects : alerte dans l'encart, le reste de l'accueil reste affiché", async () => {
    const base = serveur;
    serveur = (m, u, b) => (u.includes("/prospects?") ? { statut: 500, corps: { error: "boum" } } : base(m, u, b));
    const c = await ouvrir();
    expect(c.querySelector(".atl-prospection [role='alert']")).toBeTruthy();
    expect(c.textContent).toContain("Page toiture");
    expect(c.textContent).toContain("Post de printemps");
  });

  it("une réponse sans total est traitée comme une erreur, pas comme zéro lead", async () => {
    const base = serveur;
    serveur = (m, u, b) => (u.includes("/prospects?") ? { statut: 200, corps: { prospects: [] } } : base(m, u, b));
    const c = await ouvrir();
    expect(c.querySelector(".atl-prospection [role='alert']")).toBeTruthy();
    expect(c.textContent).not.toContain("Aucun lead pour l'instant");
  });

  it("montre le projet, le statut lisible et le lien « Voir le plan » de chaque mission", async () => {
    const c = await ouvrir();
    const entete = c.querySelector('[data-testid="entete-mission"]')!;
    expect(entete.textContent).toContain("Projet : Campagne de printemps");
    expect(entete.textContent).toContain("En cours");
    const lien = [...entete.querySelectorAll("a")].find((a) => a.textContent === "Voir le plan");
    expect(lien).toBeTruthy();
    await cliquer(lien!);
    expect(pont.navigations).toContain("/issues/DEM-1#document-plan");
  });

  it("sans plan ni projet : pas de lien, « Sans projet »", async () => {
    const base = serveur;
    serveur = (m, u, b) =>
      u.includes("/accueil?") ? { statut: 200, corps: { companyId: "c", elements: [], missions: [{ ...MISSION, projet: null, aPlan: false, lienPlan: null }] } } : base(m, u, b);
    const c = await ouvrir();
    const entete = c.querySelector('[data-testid="entete-mission"]')!;
    expect(entete.textContent).toContain("Sans projet");
    expect(entete.textContent).not.toContain("Voir le plan");
  });

  it("un modèle de demande remplit la zone sans rien envoyer, focus et curseur en fin de texte", async () => {
    const c = await ouvrir();
    const posts = () => appels.filter((a) => a.methode === "POST").length;
    expect(c.textContent).toContain("Modèles de demande");
    for (const libelle of ["Veille concurrentielle hebdomadaire", "Campagne Google Ads", "Prospection d'une zone"]) {
      expect(parTexte(c, "button", libelle)).toBeTruthy();
    }
    const champ = champParLibelle(c, "Votre demande") as HTMLTextAreaElement;
    await cliquer(parTexte(c, "button", "Campagne Google Ads"));
    expect(champ.value).toBe("Prépare une campagne Google Ads pour <produit> : mots-clés, annonces, négatifs, budget conseillé et plan de mesure. Pose-moi tes questions avant de proposer le plan.");
    expect(document.activeElement).toBe(champ);
    expect(champ.selectionStart).toBe(champ.value.length);
    expect(champ.selectionEnd).toBe(champ.value.length);
    await cliquer(parTexte(c, "button", "Veille concurrentielle hebdomadaire"));
    expect(champ.value).toContain("chaque lundi à 8 h");
    expect(posts()).toBe(0);
    expect(c.textContent).not.toContain("—");
  });

  it("envoie la demande saisie, vide le champ et confirme", async () => {
    const c = await ouvrir();
    const envoyer = parTexte(c, "button", "Envoyer");
    // Désactivé tant que rien n'est saisi.
    await cliquer(envoyer);
    expect(appels.filter((a) => a.methode === "POST")).toHaveLength(0);
    const champ = champParLibelle(c, "Votre demande") as HTMLTextAreaElement;
    await saisir(champ, "  Un post sur l'offre de printemps ");
    await cliquer(parTexte(c, "button", "Envoyer"));
    const post = appels.find((a) => a.methode === "POST");
    expect(post?.url).toContain("/equipe/demande");
    expect(post?.corps).toMatchObject({ texte: "Un post sur l'offre de printemps" });
    expect(champ.value).toBe("");
    expect(c.querySelector('[role="status"]')?.textContent).toContain("DEM-2");
    // La liste est rechargée après l'envoi.
    expect(appels.filter((a) => a.url.includes("/accueil?")).length).toBeGreaterThanOrEqual(2);
  });

  it("Entrée envoie la demande, Maj+Entrée n'envoie pas", async () => {
    const c = await ouvrir();
    const champ = champParLibelle(c, "Votre demande") as HTMLTextAreaElement;
    await saisir(champ, "Des prospects à Liège");
    const touche = async (shiftKey: boolean) =>
      act(async () => {
        champ.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey, bubbles: true, cancelable: true }));
      });
    await touche(true);
    expect(appels.filter((a) => a.methode === "POST")).toHaveLength(0);
    await touche(false);
    const post = appels.find((a) => a.methode === "POST");
    expect(post?.url).toContain("/equipe/demande");
    expect(post?.corps).toMatchObject({ texte: "Des prospects à Liège" });
    expect(champ.value).toBe("");
    // Après l'envoi, on ouvre la discussion de la tâche créée.
    expect(pont.navigations).toEqual(["/issues/DEM-2"]);
  });

  it("affiche l'erreur du serveur si l'envoi échoue", async () => {
    const base = serveur;
    serveur = (m, u, b) => (m === "POST" ? { statut: 404, corps: { erreur: "Aucun Coordinateur dans cette entreprise." } } : base(m, u, b));
    const c = await ouvrir();
    await saisir(champParLibelle(c, "Votre demande"), "Bonjour");
    await cliquer(parTexte(c, "button", "Envoyer"));
    expect(c.querySelector('[role="alert"]')?.textContent).toContain("Aucun Coordinateur");
  });

  it("état vide : rien à décider et aucune mission", async () => {
    serveur = () => ({ statut: 200, corps: { companyId: "c", elements: [], missions: [] } });
    const c = await ouvrir();
    expect(c.textContent).toContain("Rien n'attend votre décision.");
    expect(c.textContent).toContain("Aucune mission en cours.");
    expect(c.querySelectorAll(".atl-afaire > li")).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Traitement sur place (lot A)                                          */
/* ------------------------------------------------------------------ */

const QUESTIONS = [
  { id: "q1", invite: "Quel ton pour le post ?", aide: null, choix: "single", obligatoire: true, autre: false, options: [
    { id: "chaleureux", libelle: "Chaleureux", description: null, texteLibre: false },
    { id: "sobre", libelle: "Sobre", description: "Phrases courtes", texteLibre: false },
  ] },
  { id: "q2", invite: "Quels canaux ?", aide: null, choix: "multi", obligatoire: false, autre: true, options: [
    { id: "li", libelle: "LinkedIn", description: null, texteLibre: false },
    { id: "fb", libelle: "Facebook", description: null, texteLibre: false },
  ] },
];
const E_QUESTIONS = { id: "question:i1", type: "information_manquante", urgence: "haute", enTete: true, titre: "L'équipe vous pose une question", raison: "Il manque une information.", lien: "/issues/DEM-9", action: "Répondre", issueId: "iss-9",
  interaction: { id: "i1", kind: "ask_user_questions", invite: null, details: null, libelleAccepter: null, libelleRefuser: null, questions: QUESTIONS } };
const E_CONFIRMATION = { id: "question:i2", type: "information_manquante", urgence: "haute", enTete: true, titre: "L'équipe attend votre confirmation", raison: "Une décision vous revient.", lien: "/issues/DEM-8", action: "Confirmer", issueId: "iss-8",
  interaction: { id: "i2", kind: "request_confirmation", invite: "Lancer l'envoi à 120 contacts ?", details: null, libelleAccepter: "Lancer l'envoi", libelleRefuser: null, questions: [] } };
const E_APPROBATION = { id: "approbation:a1", type: "approbation", urgence: "haute", titre: "Approbation en attente", raison: "L'équipe attend votre accord.", lien: "/approvals/a1", action: "Décider", approbationId: "a1" };
const E_ACCES = { id: "approbation:a2", type: "demande_acces", urgence: "moyenne", titre: "Un nouvel agent demande à rejoindre l'équipe", raison: "L'agent attend.", lien: "/approvals/a2", action: "Examiner la demande", approbationId: "a2" };
const E_BLOQUEE = { id: "tache:t1", type: "tache_bloquee", urgence: "haute", titre: "DEM-3 · Rédiger", raison: "Elle attend qu'une autre tâche soit terminée.", lien: "/issues/DEM-3", action: "Voir la tâche", issueId: "t1" };
const E_CONTENU = { ...ELEMENT, issueId: T };

describe("accueil : traitement sur place", () => {
  let elements: unknown[];
  beforeEach(() => {
    elements = [E_CONTENU, E_QUESTIONS, E_CONFIRMATION, E_APPROBATION, E_ACCES, E_BLOQUEE, BAS];
    const base = serveur;
    serveur = (m, u, b) => {
      if (u.includes("/accueil?")) return { statut: 200, corps: { companyId: "c", elements, missions: [] } };
      if (m === "POST" && u.startsWith("/api/") && !u.includes("/plugins/")) {
        // Après l'action, la liste rechargée ne contient plus l'élément traité.
        elements = elements.filter((e) => !(u.includes(`/interactions/${(e as { interaction?: { id: string } }).interaction?.id}/`) || u.includes(`/approvals/${(e as { approbationId?: string }).approbationId}/`)));
        return { statut: 200, corps: {} };
      }
      return base(m, u, b);
    };
  });
  const ligne = (c: HTMLElement, titre: string) => Array.from(c.querySelectorAll<HTMLElement>(".atl-afaire > li")).find((l) => l.textContent?.includes(titre))!;
  const natifs = () => appels.filter((a) => a.methode === "POST" && a.url.startsWith("/api/") && !a.url.includes("/plugins/"));

  it("chaque type traitable propose « Traiter ici » et garde son lien d'ouverture ; les rappels simples n'ont que le lien", async () => {
    const c = await ouvrir();
    for (const t of ["Page toiture", "L'équipe vous pose une question", "L'équipe attend votre confirmation", "Approbation en attente", "Un nouvel agent demande", "DEM-3 · Rédiger"]) {
      const l = ligne(c, t);
      expect(parTexte(l, "button", "Traiter ici").getAttribute("aria-expanded")).toBe("false");
      expect(l.querySelector("a")).toBeTruthy();
    }
    const basse = ligne(c, "Marque non décrite");
    expect(basse.querySelector("button")).toBeNull();
    expect(basse.querySelector("a")?.textContent).toBe("Décrire la marque");
  });

  it("contenu à valider : se déplie avec l'aperçu et la décision partagée, même appel que Contenus", async () => {
    pont.actions["atelier.decision"] = async (p) => ({ id: "d", ...p });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const corps = init?.body ? JSON.parse(init.body) : null;
      appels.push({ methode: init?.method ?? "GET", url, corps });
      if (url.startsWith("/api/issues/") && init?.method === "PATCH") return new Response(JSON.stringify({ status: "done" }), { status: 200 });
      const r = serveur(init?.method ?? "GET", url, corps);
      return new Response(JSON.stringify(r.corps), { status: r.statut });
    }));
    const c = await ouvrir();
    const l = ligne(c, "Page toiture");
    expect(l.querySelector(".atl-surplace")).toBeNull();
    await cliquer(parTexte(l, "button", "Traiter ici"));
    expect(l.querySelector('[data-natif="MarkdownBlock"]')).toBeTruthy();
    expect(pont.appelsDonnees.some((a) => a.cle === "atelier.dossier" && a.params?.issueId === T)).toBe(true);
    await saisir(champParLibelle(l, "Commentaire"), "Conforme au brief.");
    await saisir(champParLibelle(l, "Action autorisée"), "aucune_action_externe");
    elements = elements.filter((e) => e !== E_CONTENU);
    await cliquer(parTexte(l, "button", "Enregistrer : approuver"));
    const appel = pont.appelsActions.find((a) => a.cle === "atelier.decision");
    expect(appel?.params).toMatchObject({ issueId: T, action: "approuver", commentaire: "Conforme au brief." });
    // Message de confirmation, élément disparu, liste rechargée.
    expect(c.querySelector(".atl-afaire-confirmation")?.textContent).toContain("Page toiture : Décision enregistrée.");
    expect(Array.from(c.querySelectorAll(".atl-afaire-titre")).some((t) => t.textContent === "Page toiture")).toBe(false);
    expect(appels.filter((a) => a.url.includes("/accueil?")).length).toBeGreaterThanOrEqual(2);
  });

  it("question de l'équipe : choix, envoi bloqué tant qu'une question obligatoire est vide, puis POST de réponses natif", async () => {
    const c = await ouvrir();
    const l = ligne(c, "L'équipe vous pose une question");
    await cliquer(parTexte(l, "button", "Traiter ici"));
    expect(l.textContent).toContain("Quel ton pour le post ?");
    expect(l.textContent).toContain("Phrases courtes");
    const envoyer = parTexte(l, "button", "Envoyer");
    await cliquer(envoyer);
    expect(natifs()).toHaveLength(0);
    expect(l.textContent).toContain("Répondez d'abord à la question");
    await cliquer(l.querySelector('input[type="radio"][value="sobre"]')!);
    await cliquer(l.querySelector('input[type="checkbox"][value="li"]')!);
    await cliquer(l.querySelector('input[type="checkbox"][value="fb"]')!);
    await saisir(champParLibelle(l, "Autre réponse"), "Newsletter");
    await cliquer(parTexte(l, "button", "Envoyer"));
    expect(natifs()).toHaveLength(1);
    expect(natifs()[0]!.url).toBe("/api/issues/iss-9/interactions/i1/respond");
    expect(natifs()[0]!.corps).toEqual({ answers: [
      { questionId: "q1", optionIds: ["sobre"] },
      { questionId: "q2", optionIds: ["li", "fb"], otherText: "Newsletter" },
    ] });
    expect(c.querySelector(".atl-afaire-confirmation")?.textContent).toContain("Réponse envoyée");
    expect(Array.from(c.querySelectorAll(".atl-afaire-titre")).some((t) => t.textContent === "L'équipe vous pose une question")).toBe(false);
  });

  it("question : une erreur de l'hôte reste affichée, l'élément reste dans la liste", async () => {
    const base = serveur;
    serveur = (m, u, b) => (m === "POST" && u.includes("/respond") ? { statut: 422, corps: { error: "Question q1 requires an answer" } } : base(m, u, b));
    const c = await ouvrir();
    const l = ligne(c, "L'équipe vous pose une question");
    await cliquer(parTexte(l, "button", "Traiter ici"));
    await cliquer(l.querySelector('input[type="radio"][value="sobre"]')!);
    await cliquer(parTexte(l, "button", "Envoyer"));
    expect(l.querySelector('[role="alert"]')?.textContent).toContain("requires an answer");
    expect(c.querySelector(".atl-afaire-confirmation")).toBeNull();
    expect(ligne(c, "L'équipe vous pose une question")).toBeTruthy();
  });

  it("confirmation : Confirmer appelle accept, Refuser appelle reject avec la raison", async () => {
    let c = await ouvrir();
    let l = ligne(c, "L'équipe attend votre confirmation");
    await cliquer(parTexte(l, "button", "Traiter ici"));
    expect(l.textContent).toContain("Lancer l'envoi à 120 contacts ?");
    await cliquer(parTexte(l, "button", "Lancer l'envoi"));
    expect(natifs()[0]!.url).toBe("/api/issues/iss-8/interactions/i2/accept");
    expect(c.querySelector(".atl-afaire-confirmation")?.textContent).toContain("Confirmé");
    rendu?.demonter();
    appels = [];
    elements = [E_CONFIRMATION];
    c = await ouvrir();
    l = ligne(c, "L'équipe attend votre confirmation");
    await cliquer(parTexte(l, "button", "Traiter ici"));
    await saisir(champParLibelle(l, "Raison (facultative, utile si vous refusez)"), "Pas avant lundi.");
    await cliquer(parTexte(l, "button", "Refuser"));
    expect(natifs()[0]!.url).toBe("/api/issues/iss-8/interactions/i2/reject");
    expect(natifs()[0]!.corps).toEqual({ reason: "Pas avant lundi." });
  });

  it("approbation native et demande d'accès : Approuver et Refuser appellent les routes natives", async () => {
    const c = await ouvrir();
    let l = ligne(c, "Approbation en attente");
    await cliquer(parTexte(l, "button", "Traiter ici"));
    await cliquer(parTexte(l, "button", "Approuver"));
    expect(natifs()[0]).toMatchObject({ url: "/api/approvals/a1/approve", corps: {} });
    expect(c.querySelector(".atl-afaire-confirmation")?.textContent).toContain("Approuvé");
    l = ligne(c, "Un nouvel agent demande");
    await cliquer(parTexte(l, "button", "Traiter ici"));
    await saisir(champParLibelle(l, "Note (facultative)"), "Inconnu de l'équipe.");
    await cliquer(parTexte(l, "button", "Refuser"));
    expect(natifs()[1]).toMatchObject({ url: "/api/approvals/a2/reject", corps: { decisionNote: "Inconnu de l'équipe." } });
    expect(c.querySelector(".atl-afaire-confirmation")?.textContent).toContain("Demande refusée");
  });

  it("tâche bloquée : la raison et le lien vers la tâche, rien d'envoyé", async () => {
    const c = await ouvrir();
    const l = ligne(c, "DEM-3 · Rédiger");
    await cliquer(parTexte(l, "button", "Traiter ici"));
    const panneau = l.querySelector(".atl-surplace")!;
    expect(panneau.textContent).toContain("Elle attend qu'une autre tâche soit terminée.");
    await cliquer(parTexte(panneau as HTMLElement, "a", "Ouvrir la tâche"));
    expect(pont.navigations).toContain("/issues/DEM-3");
    expect(natifs()).toHaveLength(0);
    // « Replier » referme le panneau.
    await cliquer(parTexte(l, "button", "Replier"));
    expect(l.querySelector(".atl-surplace")).toBeNull();
  });

  it("aucun tiret cadratin dans les panneaux dépliés", async () => {
    const c = await ouvrir();
    for (const b of Array.from(c.querySelectorAll<HTMLElement>(".atl-afaire > li button")).filter((x) => x.textContent === "Traiter ici")) await cliquer(b);
    expect(c.textContent).not.toContain("—");
  });
});

describe("accueil : pastille du nombre d'éléments en attente", () => {
  it("titre d'onglet : « (3) Atelier », sans nombre quand rien n'attend", () => {
    expect(titreOnglet(3)).toBe("(3) Atelier");
    expect(titreOnglet(0)).toBe("Atelier");
    expect(titreOnglet(null)).toBe("Atelier");
  });

  it("la page pose « (n) Atelier » (rappels de basse urgence exclus), affiche la pastille du menu et rend le titre de l'hôte au démontage", async () => {
    document.title = "Paperclip";
    pont.chemin = "/RNO/atelier/accueil";
    serveur = (m, u, b) => (u.includes("/accueil?") ? { statut: 200, corps: { companyId: "c", elements: [ELEMENT, E_APPROBATION, E_BLOQUEE, BAS], missions: [] } } : u.includes("/prospects?") ? { statut: 200, corps: { total: 0 } } : { statut: 404, corps: {} });
    rendu = await rendre(createElement(PageAtelier, { context: { companyId: "11111111-1111-4111-8111-111111111111", companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "u" } } as never));
    expect(document.title).toBe("(3) Atelier");
    rendu.demonter();
    rendu = null;
    expect(document.title).toBe("Paperclip");
  });

  it("le menu (entrée de l'atelier et rubrique « À faire ») affiche le même nombre", async () => {
    const { EntreeAtelier, NavigationAtelier } = await import("../../src/ui/index.js");
    serveur = (m, u) => (u.includes("/accueil?") ? { statut: 200, corps: { companyId: "c", elements: [ELEMENT, E_APPROBATION, BAS], missions: [] } } : { statut: 404, corps: {} });
    const contexte = { companyId: "11111111-1111-4111-8111-111111111111", companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "u" };
    rendu = await rendre(createElement("div", null, createElement(EntreeAtelier, { context: contexte } as never), createElement(NavigationAtelier, { context: contexte } as never)));
    const pastilles = Array.from(rendu.conteneur.querySelectorAll('[data-testid="pastille-afaire"]'));
    expect(pastilles).toHaveLength(2);
    for (const p of pastilles) expect(p.textContent).toContain("2");
    // Une seule lecture du serveur pour les deux emplacements.
    expect(appels.filter((a) => a.url.includes("/accueil?")).length).toBe(1);
  });
});
