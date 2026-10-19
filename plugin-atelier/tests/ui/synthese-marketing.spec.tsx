// @vitest-environment jsdom
/**
 * Synthèse en tête de Campagnes : chiffres lus (rapport du mois, contenus à valider, connexions), « non mesuré » si la
 * source échoue, liens vers les écrans, prochaine action ; états vides qui mènent au chat ; le chat lit `?modele=`.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChiffreRapport, RapportMensuel } from "../../src/contrats/index.js";
import { PageAtelier } from "../../src/ui/index.js";
import { MODELES_DEMANDE } from "../../src/ui/demande.js";
import { ENTREPRISE, installerPont, parTexte, rendre, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
const P = { debut: "2026-10-01T00:00:00.000Z", fin: "2026-10-31T23:59:59.999Z" };
const ch = (cle: string, libelle: string, valeur: number | null): ChiffreRapport => ({ cle, libelle, valeur, mesure: valeur !== null, source: `table_${cle}`, periode: P, mode: null, note: null });
const RAPPORT: RapportMensuel = {
  companyId: ENTREPRISE, entreprise: "Cabinet fictif", mois: "2026-10", periode: P, genereLe: "2026-10-19T08:00:00.000Z",
  campagnes: [ch("campagnes_actives", "Campagnes actives", 2)],
  contenus: [],
  prospects: { chiffres: [ch("prospects_trouves_reel", "Prospects trouvés", 12)], badges: [ch("prospects_qualifies", "Qualifiés", 5)], tronque: false, plafond: 5000 },
  resultats: { chiffres: [], mesures: [] },
  coutsIa: {
    lignes: [{ agent: "Contenus", modele: "claude-sonnet", facturation: "api", jetonsEntree: 1000, jetonsEntreeCache: 0, jetonsSortie: 200, coutCentimes: 1250 }],
    total: { jetonsEntree: 1000, jetonsEntreeCache: 0, jetonsSortie: 200, coutCentimes: 1250 }, source: "cost_events", periode: P, note: "",
  },
  enAttenteClient: { points: [], source: "accueil", note: "" },
};
const br = (cle: string, etat: string) => ({ cle, nom: `Nom ${cle}`, etat, preuve: "mesure", detail: "d", acteur: "nous", debloque: { criteres: [], fonctions: [] }, leadsConcernes: null, verifieLe: P.debut });
const REALITE = { companyId: ENTREPRISE, branchements: [br("bce", "en_attente_acces"), br("osm", "demonstration"), br("base_clients", "reel")], synthese: [], leads: { analyses: 0, tronque: false, illisibles: 0 }, verifieLe: P.debut };

let pont: Pont;
let rendu: Rendu | null = null;
type Reponse = { statut?: number; corps: unknown };
function stubReseau(o: { rapport?: Reponse; realite?: Reponse } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const r: Reponse = url.includes("/rapport/mensuel?")
        ? (o.rapport ?? { corps: RAPPORT })
        : url.includes("/realite?")
          ? (o.realite ?? { corps: REALITE })
          : url.endsWith("/tools/connections")
            ? { corps: { connections: [] } }
            : url.includes("/accueil?")
              ? { corps: { companyId: ENTREPRISE, elements: [], missions: [] } }
              : url.includes("/prospects?")
                ? { corps: { total: 0, page: 1, pages: 1, prospects: [] } }
                : url.includes("/discussion")
                  ? { corps: { issueId: "i1", identifiant: "DEM-1", messages: [], cartes: [] } }
                  : { corps: {} };
      return new Response(JSON.stringify(r.corps), { status: r.statut ?? 200 });
    }),
  );
}
async function ouvrir(chemin: string, recherche = "") {
  pont.chemin = chemin;
  pont.recherche = recherche;
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  await vi.waitFor(() => expect(rendu!.conteneur.querySelector(".atl-synthese-valeur[aria-busy]")).toBeNull(), { timeout: 2000 });
  return rendu.conteneur;
}
const synthese = (c: HTMLElement) => c.querySelector(".atl-synthese")!;
const lien = (c: HTMLElement, libelle: string) => parTexte(synthese(c), "a", libelle);

beforeEach(() => {
  pont = installerPont("/RNO/atelier/campagnes");
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  stubReseau();
});
afterEach(() => {
  expect(pont.violations).toEqual([]);
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

describe("synthèse en tête de Campagnes", () => {
  it("affiche les chiffres lus et chaque chiffre est un lien vers son écran", async () => {
    const c = await ouvrir("/RNO/atelier/campagnes");
    expect(lien(c, "prospects trouvés ce mois").textContent).toContain("12");
    expect(lien(c, "prospects trouvés ce mois").textContent).toContain("dont 5 qualifiés");
    expect(lien(c, "prospects trouvés ce mois").getAttribute("href")).toBe("/RNO/atelier/prospects");
    expect(lien(c, "contenus à valider").textContent).toContain("1"); // exemple du contrat : un contenu prêt
    expect(lien(c, "contenus à valider").getAttribute("href")).toBe("/RNO/atelier/contenus");
    expect(lien(c, "campagnes actives").textContent).toContain("2");
    expect(lien(c, "campagnes actives").getAttribute("href")).toBe("/RNO/atelier/campagnes");
    expect(lien(c, "coût de l'IA ce mois").textContent).toMatch(/12,50/u);
    expect(lien(c, "coût de l'IA ce mois").getAttribute("href")).toBe("/RNO/atelier/rapport");
    expect(lien(c, "connexions manquantes").textContent).toContain("4"); // BCE et OSM du serveur + les deux lignes de la passerelle (sans connexion) ; la base clients est réelle
    expect(lien(c, "connexions manquantes").getAttribute("href")).toContain("/RNO/atelier/parametres");
  });

  it("source illisible : « non mesuré », jamais un zéro", async () => {
    stubReseau({ rapport: { statut: 500, corps: { error: "panne" } }, realite: { statut: 500, corps: { error: "panne" } } });
    const c = await ouvrir("/RNO/atelier/campagnes");
    for (const l of ["prospects trouvés ce mois", "campagnes actives", "coût de l'IA ce mois", "connexions manquantes"]) {
      expect(lien(c, l).textContent).toContain("non mesuré");
    }
    expect(lien(c, "contenus à valider").textContent).not.toContain("non mesuré"); // lu par un autre chemin, resté lisible
  });

  it("coût sans aucune ligne : non mesuré", async () => {
    stubReseau({ rapport: { corps: { ...RAPPORT, coutsIa: { ...RAPPORT.coutsIa, lignes: [] } } } });
    const c = await ouvrir("/RNO/atelier/campagnes");
    expect(lien(c, "coût de l'IA ce mois").textContent).toContain("non mesuré");
  });

  it("prochaine action : contenu à valider d'abord", async () => {
    const c = await ouvrir("/RNO/atelier/campagnes");
    const action = c.querySelector(".atl-synthese-action a")!;
    expect(action.textContent).toContain("Valider 1 contenu");
    expect(action.getAttribute("href")).toBe("/RNO/atelier/contenus");
  });

  it("prochaine action : sans contenu à valider, la connexion manquante", async () => {
    pont.donnees["atelier.contenus-a-valider"] = { data: { prets: [], bloques: [] }, loading: false, error: null };
    const c = await ouvrir("/RNO/atelier/campagnes");
    const action = c.querySelector(".atl-synthese-action a")!;
    expect(action.textContent).toContain("Brancher 4 connexions manquantes");
    expect(action.getAttribute("href")).toContain("/RNO/atelier/parametres");
  });

  it("prochaine action : rien d'urgent connu (connexions illisibles), lancer une campagne par le chat", async () => {
    pont.donnees["atelier.contenus-a-valider"] = { data: { prets: [], bloques: [] }, loading: false, error: null };
    stubReseau({ realite: { statut: 500, corps: { error: "panne" } } });
    const c = await ouvrir("/RNO/atelier/campagnes");
    const action = c.querySelector(".atl-synthese-action a")!;
    expect(action.textContent).toContain("Lancer une nouvelle campagne");
    expect(action.getAttribute("href")).toBe("/RNO/atelier/discussion?modele=Campagne%20Google%20Ads");
  });

  it("n'apparaît pas sur le détail d'une campagne ni sur les autres onglets", async () => {
    const c = await ouvrir("/RNO/atelier/contenus");
    expect(c.querySelector(".atl-synthese")).toBeNull();
  });
});

describe("états vides guidés vers le chat", () => {
  it("Campagnes : « Demandez au Coordinateur » mène au chat avec le modèle Campagne Google Ads", async () => {
    pont.donnees["atelier.campagnes"] = { data: [], loading: false, error: null };
    const c = await ouvrir("/RNO/atelier/campagnes");
    const vide = c.querySelector(".atl-vide")!;
    expect(parTexte(vide, "a", "Demandez au Coordinateur").getAttribute("href")).toBe("/RNO/atelier/discussion?modele=Campagne%20Google%20Ads");
    expect(parTexte(vide, "a", "Créer une campagne depuis un brief")).toBeTruthy();
  });
});

describe("le chat lit ?modele=", () => {
  const texte = (libelle: string) => MODELES_DEMANDE.find((m) => m.libelle === libelle)!.texte;
  async function saisieDuChat(recherche: string) {
    const c = await ouvrir("/RNO/atelier/discussion", recherche);
    await vi.waitFor(() => expect(c.querySelector("textarea")).not.toBeNull());
    return c;
  }

  it("préremplit la saisie sans rien envoyer", async () => {
    const c = await saisieDuChat("?modele=Prospection%20d'une%20zone");
    await vi.waitFor(() => expect((c.querySelector("textarea") as HTMLTextAreaElement).value).toBe(texte("Prospection d'une zone")));
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.some((a) => String(a[1]?.method ?? "GET") === "POST")).toBe(false);
  });

  it("un modèle inconnu ne remplit rien", async () => {
    const c = await saisieDuChat("?modele=Inconnu");
    expect((c.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
  });
});
