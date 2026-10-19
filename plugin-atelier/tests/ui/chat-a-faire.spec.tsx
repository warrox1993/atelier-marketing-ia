// @vitest-environment jsdom
/**
 * Bloc « À faire » du chat du Coordinateur (ancienne page Accueil, supprimée) : lignes triées avec leur action,
 * traitement sur place de chaque type d'élément, message de confirmation, titre d'onglet et menu. Les routes du plugin
 * sont servies par un `fetch` simulé ; la vue est rendue seule (`VueDiscussion`). Les tests de l'approbation groupée
 * sont dans `decision-groupee.spec.tsx`.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageAtelier } from "../../src/ui/index.js";
import { reinitialiserCompteurAFaire, titreOnglet } from "../../src/ui/compteur-afaire.js";
import { VueDiscussion } from "../../src/ui/vues/discussion.js";
import { champParLibelle, cliquer, installerPont, parTexte, rendre, saisir, type Rendu } from "./pont.js";

let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string; corps: unknown }> = [];
let serveur: (methode: string, url: string, corps: unknown) => { statut: number; corps: unknown };

const ELEMENT = { id: "contenu:1", type: "contenu_a_valider", urgence: "haute", titre: "Page toiture", raison: "Le contenu attend votre décision.", lien: "/atelier/contenus/1", action: "Relire et décider" };
const BAS = { id: "manque:marque", type: "information_manquante", urgence: "basse", titre: "Marque non décrite", raison: "Sans description, l'équipe ne connaît pas votre ton.", lien: "/atelier/marque", action: "Décrire la marque" };

let pont: ReturnType<typeof installerPont>;
const T = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  reinitialiserCompteurAFaire();
  pont = installerPont("/RNO/atelier/discussion");
  appels = [];
  serveur = (methode, url) => {
    if (url.includes("/accueil?")) return { statut: 200, corps: { companyId: "c", elements: [ELEMENT, BAS], missions: [] } };
    if (methode === "GET" && url.includes("/discussion/messages")) return { statut: 200, corps: { messages: [], cartes: [] } };
    if (methode === "GET" && url.includes("/dictee/etat")) return { statut: 200, corps: { disponible: true } };
    if (methode === "GET" && url.endsWith("/tools/connections")) return { statut: 200, corps: { connections: [] } };
    if (methode === "GET") return { statut: 200, corps: { issueId: "n1", identifiant: "DEM-1", messages: [], cartes: [] } };
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

/**
 * Rend le chat et affiche tous les points du message du Coordinateur (« Voir les N autres » quand il y en a plus de trois :
 * ce bouton remplace le dépliage de l'ancienne carte « À faire »).
 */
async function ouvrir() {
  rendu = await rendre(createElement(VueDiscussion));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  const c = rendu.conteneur;
  const voir = Array.from(c.querySelectorAll<HTMLButtonElement>('[data-testid="chat-situation"] button')).find((b) => /^Voir (les \d+ autres|l'autre point)$/u.test(b.textContent ?? ""));
  if (voir) await cliquer(voir);
  return c;
}

describe("chat : points en attente dans le message du Coordinateur", () => {
  it("liste triée par urgence avec un bouton d'action par ligne ; le chat ne lit ni missions ni prospection", async () => {
    const c = await ouvrir();
    const lignes = c.querySelectorAll(".atl-afaire > li");
    expect(lignes).toHaveLength(2);
    expect(lignes[0]!.textContent).toContain("Page toiture");
    expect(lignes[0]!.textContent).toContain("Urgent");
    expect(lignes[0]!.querySelector("a")?.textContent).toBe("Relire et décider");
    expect(lignes[1]!.textContent).toContain("Quand vous pouvez");
    expect(c.textContent).not.toContain("—");
    expect(appels.some((a) => a.url.includes("/accueil?companyId="))).toBe(true);
    expect(appels.some((a) => a.url.includes("/missions/") || a.url.includes("/prospects?"))).toBe(false);
  });

  it("dernier élément traité : le message reste avec sa confirmation (focus dessus), sans liste ni compteur", async () => {
    let elements: unknown[] = [E_APPROBATION];
    const base = serveur;
    serveur = (m, u, b) => (u.includes("/accueil?") ? { statut: 200, corps: { companyId: "c", elements, missions: [] } } : m === "POST" && u.startsWith("/api/") && !u.includes("/plugins/") ? ((elements = []), { statut: 200, corps: {} }) : base(m, u, b));
    const c = await ouvrir();
    const bloc = c.querySelector<HTMLElement>('[data-testid="chat-situation"]')!;
    await cliquer(parTexte(bloc as HTMLElement, "button", "Traiter ici"));
    await cliquer(parTexte(bloc as HTMLElement, "button", "Approuver"));
    expect(c.querySelector('[data-testid="chat-situation"]')).toBe(bloc);
    expect(bloc.querySelector(".atl-afaire-confirmation")?.textContent).toContain("Approuvé");
    expect(document.activeElement).toBe(bloc.querySelector(".atl-afaire-confirmation"));
    expect(bloc.querySelectorAll(".atl-afaire > li")).toHaveLength(0);
    // Plus aucun point : l'annonce « J'ai N points… » a disparu, il ne reste que la confirmation.
    expect(bloc.querySelector('[data-testid="situation-points"]')).toBeNull();
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
  interaction: { id: "i1", kind: "ask_user_questions", invite: null, details: null, libelleAccepter: null, libelleRefuser: null, refusRaisonObligatoire: false, natifSeulement: false, questions: QUESTIONS } };
const E_CONFIRMATION = { id: "question:i2", type: "information_manquante", urgence: "haute", enTete: true, titre: "L'équipe attend votre confirmation", raison: "Une décision vous revient.", lien: "/issues/DEM-8", action: "Confirmer", issueId: "iss-8",
  interaction: { id: "i2", kind: "request_confirmation", invite: "Lancer l'envoi à 120 contacts ?", details: null, libelleAccepter: "Lancer l'envoi", libelleRefuser: null, refusRaisonObligatoire: false, natifSeulement: false, questions: [] } };
const E_CONFIRMATION_OUTIL = { ...E_CONFIRMATION, id: "question:i3", titre: "Envoyer l'e-mail au client ?", issueId: "iss-7", lien: "/issues/DEM-7",
  interaction: { ...E_CONFIRMATION.interaction, id: "i3", natifSeulement: true } };
const E_CONFIRMATION_RAISON = { ...E_CONFIRMATION, id: "question:i4", titre: "Supprimer l'ancienne campagne ?", issueId: "iss-6", lien: "/issues/DEM-6",
  interaction: { ...E_CONFIRMATION.interaction, id: "i4", invite: "Supprimer ?", refusRaisonObligatoire: true } };
const E_APPROBATION = { id: "approbation:a1", type: "approbation", urgence: "haute", titre: "Approbation en attente", raison: "L'équipe attend votre accord.", lien: "/approvals/a1", action: "Décider", approbationId: "a1",
  approbation: { type: "request_board_approval", surPlace: true, demandeur: "Un agent de l'équipe", lignes: [{ libelle: "Résumé", valeur: "Publier la page toiture dès demain" }, { libelle: "Risques", valeur: "Ton trop vendeur" }] } };
const E_ACCES = { id: "approbation:a2", type: "demande_acces", urgence: "moyenne", titre: "Un nouvel agent demande à rejoindre l'équipe", raison: "L'agent attend.", lien: "/approvals/a2", action: "Examiner la demande", approbationId: "a2",
  approbation: { type: "hire_agent", surPlace: false, demandeur: "Un agent de l'équipe", lignes: [{ libelle: "Titre", valeur: "Agent SEO" }] } };
const E_BUDGET = { id: "approbation:a3", type: "approbation", urgence: "haute", titre: "Dépassement de budget à autoriser", raison: "Un agent a atteint son budget.", lien: "/approvals/a3", action: "Décider", approbationId: "a3",
  approbation: { type: "budget_override_required", surPlace: false, demandeur: "Un agent de l'équipe", lignes: [] } };
const E_INCONNU = { id: "approbation:a4", type: "approbation", urgence: "haute", titre: "Approbation d'un type nouveau", raison: "L'équipe attend.", lien: "/approvals/a4", action: "Décider", approbationId: "a4",
  approbation: { type: "type_futur", surPlace: false, demandeur: "Un agent de l'équipe", lignes: [] } };
const E_BLOQUEE = { id: "tache:t1", type: "tache_bloquee", urgence: "haute", titre: "DEM-3 · Rédiger", raison: "Elle attend qu'une autre tâche soit terminée.", lien: "/issues/DEM-3", action: "Voir la tâche", issueId: "t1" };
const E_CONTENU = { ...ELEMENT, issueId: T };

describe("chat : traitement sur place", () => {
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
    for (const t of ["Page toiture", "L'équipe vous pose une question", "L'équipe attend votre confirmation", "Approbation en attente", "DEM-3 · Rédiger"]) {
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

  it("demande entre services : contenu complet affiché avant décision, puis route du plugin liaison.decider", async () => {
    const LIAISON = {
      id: "liaison:L1", type: "liaison_a_approuver", urgence: "haute", titre: "Demande au service juridique : Contrat à relire", raison: "Rien n'est envoyé tant que vous n'avez pas décidé.",
      lien: "/issues/DEM-7", action: "Voir la tâche d'origine", issueId: "iss-7",
      liaison: { liaisonId: "L1", serviceSource: "marketing", serviceCible: "juridique", objet: "Contrat à relire", question: "Le contrat est-il conforme ?", extraits: [{ titre: "Clause 4", texte: "Résiliation sous 30 jours." }] },
    };
    elements = [...elements, LIAISON];
    const base = serveur;
    serveur = (m, u, b) => {
      if (m === "POST" && u.includes("/liaisons/decider")) {
        elements = elements.filter((e) => e !== LIAISON);
        return { statut: 200, corps: {} };
      }
      return base(m, u, b);
    };
    const c = await ouvrir();
    const l = ligne(c, "Contrat à relire");
    await cliquer(parTexte(l, "button", "Traiter ici"));
    for (const attendu of ["Contrat à relire", "Le contrat est-il conforme ?", "Clause 4", "Résiliation sous 30 jours.", "juridique"]) expect(l.textContent).toContain(attendu);
    await cliquer(parTexte(l, "button", "Transmettre"));
    const decision = appels.find((a) => a.url.includes("/liaisons/decider"))!;
    expect(decision.methode).toBe("POST");
    expect(decision.corps).toMatchObject({ liaisonId: "L1", decision: "approuver" });
    expect(natifs()).toHaveLength(0);
    expect(Array.from(c.querySelectorAll(".atl-afaire-titre")).some((t) => t.textContent?.includes("Contrat à relire"))).toBe(false);
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

  it("approbation d'un type sûr : le contenu est affiché avant les boutons, Approuver et Refuser appellent les routes natives", async () => {
    const c = await ouvrir();
    const l = ligne(c, "Approbation en attente");
    await cliquer(parTexte(l, "button", "Traiter ici"));
    const panneau = l.querySelector(".atl-surplace")!;
    expect(panneau.textContent).toContain("Accord demandé à la direction");
    expect(panneau.textContent).toContain("Un agent de l'équipe");
    expect(panneau.textContent).toContain("Publier la page toiture dès demain");
    expect(panneau.textContent).toContain("Ton trop vendeur");
    // Le contenu précède les boutons de décision.
    expect(panneau.innerHTML.indexOf("Publier la page toiture")).toBeLessThan(panneau.innerHTML.indexOf("Approuver"));
    await cliquer(parTexte(l, "button", "Approuver"));
    expect(natifs()[0]).toMatchObject({ url: "/api/approvals/a1/approve", corps: {} });
    expect(c.querySelector(".atl-afaire-confirmation")?.textContent).toContain("Approuvé");
    // Le focus passe sur le message de confirmation (le bouton cliqué a disparu avec son panneau).
    expect(document.activeElement).toBe(c.querySelector(".atl-afaire-confirmation"));
  });

  it("aria-controls du bouton « Traiter ici » : absent tant que le panneau n'est pas rendu, présent et valide ensuite", async () => {
    const c = await ouvrir();
    const l = ligne(c, "L'équipe vous pose une question");
    const bouton = parTexte(l, "button", "Traiter ici");
    expect(bouton.hasAttribute("aria-controls")).toBe(false);
    await cliquer(bouton);
    const id = bouton.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).toBeTruthy();
    await cliquer(parTexte(l, "button", "Replier"));
    expect(parTexte(l, "button", "Traiter ici").hasAttribute("aria-controls")).toBe(false);
  });

  it("approbation : Refuser transmet la note", async () => {
    elements = [E_APPROBATION];
    const c = await ouvrir();
    const l = ligne(c, "Approbation en attente");
    await cliquer(parTexte(l, "button", "Traiter ici"));
    await saisir(champParLibelle(l, "Note (facultative)"), "Pas maintenant.");
    await cliquer(parTexte(l, "button", "Refuser"));
    expect(natifs()[0]).toMatchObject({ url: "/api/approvals/a1/reject", corps: { decisionNote: "Pas maintenant." } });
  });

  it("demande d'accès (hire_agent), dépassement de budget et type inconnu : aucune décision sur place, seulement le lien vers la page native", async () => {
    elements = [E_ACCES, E_BUDGET, E_INCONNU];
    const c = await ouvrir();
    for (const [titre, lien] of [["Un nouvel agent demande", "/approvals/a2"], ["Dépassement de budget", "/approvals/a3"], ["Approbation d'un type nouveau", "/approvals/a4"]] as const) {
      const l = ligne(c, titre);
      expect(l.querySelector("button")).toBeNull();
      expect(l.querySelector(".atl-surplace")).toBeNull();
      expect(l.querySelector("a")?.getAttribute("href")).toContain(lien);
    }
    expect(Array.from(c.querySelectorAll("button")).some((b) => /Approuver|Refuser/.test(b.textContent ?? ""))).toBe(false);
  });

  it("carte qui exécute un outil ou propose un secret : aucune décision sur place, lien vers la tâche seulement", async () => {
    elements = [E_CONFIRMATION_OUTIL];
    const c = await ouvrir();
    const l = ligne(c, "Envoyer l'e-mail au client ?");
    expect(l.querySelector("button")).toBeNull();
    expect(l.querySelector("a")?.getAttribute("href")).toContain("/issues/DEM-7");
    expect(natifs()).toHaveLength(0);
  });

  it("confirmation avec refus motivé obligatoire : le refus reste bloqué tant que la raison est vide", async () => {
    elements = [E_CONFIRMATION_RAISON];
    const c = await ouvrir();
    const l = ligne(c, "Supprimer l'ancienne campagne ?");
    await cliquer(parTexte(l, "button", "Traiter ici"));
    expect(l.textContent).toContain("Raison (obligatoire pour refuser)");
    expect(l.textContent).not.toContain("facultative");
    await cliquer(parTexte(l, "button", "Refuser"));
    expect(natifs()).toHaveLength(0);
    expect(l.textContent).toContain("la raison du refus");
    await saisir(champParLibelle(l, "Raison (obligatoire pour refuser)"), "Encore utile.");
    await cliquer(parTexte(l, "button", "Refuser"));
    expect(natifs()[0]).toMatchObject({ url: "/api/issues/iss-6/interactions/i4/reject", corps: { reason: "Encore utile." } });
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

describe("chat : pastille du nombre d'éléments en attente", () => {
  it("titre d'onglet : « (3) Atelier », sans nombre quand rien n'attend", () => {
    expect(titreOnglet(3)).toBe("(3) Atelier");
    expect(titreOnglet(0)).toBe("Atelier");
    expect(titreOnglet(null)).toBe("Atelier");
  });

  it("la page pose « (n) Atelier » (rappels de basse urgence exclus), affiche la pastille du menu et rend le titre de l'hôte au démontage", async () => {
    document.title = "Paperclip";
    pont.chemin = "/RNO/atelier/discussion";
    serveur = (m, u, b) => (u.includes("/accueil?") ? { statut: 200, corps: { companyId: "c", elements: [ELEMENT, E_APPROBATION, E_BLOQUEE, BAS], missions: [] } } : u.includes("/prospects?") ? { statut: 200, corps: { total: 0 } } : { statut: 404, corps: {} });
    rendu = await rendre(createElement(PageAtelier, { context: { companyId: "11111111-1111-4111-8111-111111111111", companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "u" } } as never));
    expect(document.title).toBe("(3) Atelier");
    rendu.demonter();
    rendu = null;
    expect(document.title).toBe("Paperclip");
  });

  it("le menu n'a plus de pastille « à faire » (plus d'entrée « Atelier » ni de rubrique « Accueil ») et ne lit plus le serveur pour elle", async () => {
    const { EntreeAtelier, NavigationAtelier } = await import("../../src/ui/index.js");
    serveur = (m, u) => (u.includes("/accueil?") ? { statut: 200, corps: { companyId: "c", elements: [ELEMENT, E_APPROBATION, BAS], missions: [] } } : { statut: 404, corps: {} });
    const contexte = { companyId: "11111111-1111-4111-8111-111111111111", companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "u" };
    rendu = await rendre(createElement("div", null, createElement(EntreeAtelier, { context: contexte } as never), createElement(NavigationAtelier, { context: contexte } as never)));
    expect(rendu.conteneur.querySelectorAll('[data-testid="pastille-afaire"]')).toHaveLength(0);
    expect(appels.filter((a) => a.url.includes("/accueil?")).length).toBe(0);
  });
});
