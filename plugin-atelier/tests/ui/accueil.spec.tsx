// @vitest-environment jsdom
/**
 * Accueil (lot 1) : rendu des trois blocs, envoi d'une demande, état vide. Les routes du plugin
 * sont servies par un `fetch` simulé ; la vue est rendue seule (`VueAccueil`).
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  pont = installerPont("/RNO/atelier/accueil");
  appels = [];
  serveur = (methode, url) => {
    if (url.includes("/accueil?")) return { statut: 200, corps: { companyId: "c", elements: [ELEMENT, BAS], missions: [MISSION] } };
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
