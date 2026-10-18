// @vitest-environment jsdom
/**
 * « Connexions » : la section en tête des Paramètres (états, ce que chaque branchement débloque, qui agit,
 * leads concernés, synthèse), l'encart de l'accueil et son lien, le rendu en cartes sur téléphone, les erreurs.
 * La route `realite.etat` et les connexions natives sont servies par un `fetch` simulé.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Branchement, RealiteEtat } from "../../src/contrats/index.js";
import { PageAtelier } from "../../src/ui/index.js";
import { fusionnerBranchements, branchementsManquants, LIEN_PASSAGE_AU_REEL } from "../../src/ui/realite.js";
import { lignesServices, analyserConnexion, type ConnexionNative } from "../../src/ui/connexions-natives.js";
import { cliquer, ENTREPRISE, installerPont, parTexte, rendre, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
const H = "2026-10-16T08:00:00.000Z";
let pont: Pont;
let rendu: Rendu | null = null;

const br = (cle: Branchement["cle"], o: Partial<Branchement> = {}): Branchement => ({
  cle, nom: `Nom ${cle}`, etat: "non_branche", preuve: "mesure", detail: `Détail ${cle}.`, acteur: "nous",
  debloque: { criteres: [], fonctions: [`Fonction ${cle}`] }, leadsConcernes: null, verifieLe: H, ...o,
});
/** Réponse du serveur : neuf branchements aux états variés et une synthèse. */
const REALITE: RealiteEtat = {
  companyId: ENTREPRISE,
  branchements: [
    br("bce", { nom: "Registre BCE", etat: "en_attente_acces", acteur: "acces_officiel", leadsConcernes: 219, debloque: { criteres: [{ code: "entreprise_active", libelle: "Entreprise active" }], fonctions: ["Fiches d'entreprise réelles"] } }),
    br("bnb", { nom: "Banque nationale", etat: "en_attente_acces", acteur: "acces_officiel", leadsConcernes: 240 }),
    br("osm", { nom: "OpenStreetMap", etat: "demonstration", leadsConcernes: 12 }),
    br("base_clients", { nom: "Base clients", etat: "a_fournir_client", acteur: "client", leadsConcernes: 240 }),
    br("consentement", { nom: "Bases légales", etat: "a_fournir_client", acteur: "client", leadsConcernes: 31 }),
    br("bureaux_segments", { nom: "Bureaux et segments", etat: "reel", acteur: "client" }),
    br("voix", { nom: "Clé OpenAI pour la voix", etat: "configure_non_verifie", preuve: "declare" }),
    br("moniteur_belge", { nom: "Moniteur belge", preuve: "aucune" }),
    br("ne_m_appelez_plus", { nom: "Ne m'appelez plus", preuve: "aucune", acteur: "acces_officiel" }),
  ],
  synthese: [
    { code: "entreprise_active", libelle: "Entreprise active", leadsNonVerifies: 219, branchement: "bce", etatBranchement: "en_attente_acces", phrase: "219 leads attendent le registre BCE réel pour confirmer qu'ils sont actifs." },
    { code: "taille_connue", libelle: "Taille connue", leadsNonVerifies: 1, branchement: "bnb", etatBranchement: "en_attente_acces", phrase: "1 lead attend les comptes réels de la Banque nationale pour connaître sa taille." },
  ],
  leads: { analyses: 240, tronque: false, illisibles: 0 },
  verifieLe: H,
};

const connexion = (nom: string, slug: string, o: Record<string, unknown> = {}) => ({
  id: `c-${slug}`, name: nom, status: "active", enabled: true, healthStatus: "ok", healthCheckedAt: H, config: { sourceTemplateKey: slug }, ...o,
});
const CONNEXIONS_GOOGLE = [
  connexion("Google Search Console (démonstration)", "atelier-google-search-console"),
  connexion("Google Analytics 4 (démonstration)", "atelier-google-analytics"),
];

type Reponse = { statut?: number; corps: unknown };
function stubReseau(opts: { realite?: Reponse; connexions?: Reponse } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const r: Reponse = url.includes("/realite?") ? opts.realite ?? { corps: REALITE } : url.endsWith("/tools/connections") ? opts.connexions ?? { corps: { connections: CONNEXIONS_GOOGLE } } : url.includes("/accueil?") ? { corps: { companyId: ENTREPRISE, elements: [], missions: [] } } : url.includes("/prospects?") ? { corps: { total: 0, page: 1, pages: 1, prospects: [] } } : { corps: {} };
      return new Response(JSON.stringify(r.corps), { status: r.statut ?? 200 });
    }),
  );
}
function simulerEcran(etroit: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: etroit && q.includes("640"), media: q, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  window.location.hash = "";
  simulerEcran(false);
  stubReseau();
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
  window.location.hash = "";
});

async function ouvrir(chemin: string) {
  pont = installerPont(chemin);
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return rendu.conteneur;
}
const ligne = (c: HTMLElement, cle: string) => c.querySelector<HTMLElement>(`tr[data-branchement="${cle}"]`)!;

describe("Paramètres : section « Connexions »", () => {
  it("est la section de l'onglet « Connexions » des Réglages", async () => {
    const c = await ouvrir("/RNO/atelier/parametres");
    expect(c.querySelector("section#param-reel h2")?.textContent).toBe("Connexions");
    expect(c.querySelector('[role="tablist"][aria-label="Réglages : sections"] [role="tab"]:nth-child(4)')?.textContent).toBe("Connexions");
    expect(pont.violations).toEqual([]);
  });

  it("affiche onze branchements : neuf du serveur et les deux lignes lues dans les connexions natives", async () => {
    const c = await ouvrir("/RNO/atelier/parametres");
    const lignes = Array.from(c.querySelectorAll<HTMLElement>("tr[data-branchement]"));
    expect(lignes.map((l) => l.dataset.branchement)).toEqual(["bce", "bnb", "osm", "base_clients", "consentement", "bureaux_segments", "google", "diffusion", "voix", "moniteur_belge", "ne_m_appelez_plus"]);
  });

  it("dit l'état de chacun, ce qu'il débloque, qui agit et le nombre de leads", async () => {
    const c = await ouvrir("/RNO/atelier/parametres");
    const bce = ligne(c, "bce");
    expect(bce.querySelector(".atl-pastille")?.textContent).toBe("En attente d'accès");
    expect(bce.textContent).toContain("Fiches d'entreprise réelles");
    expect(bce.textContent).toContain("Critères des leads : Entreprise active");
    expect(bce.querySelector('td[data-libelle="Qui agit"]')?.textContent).toBe("Un accès officiel à obtenir");
    expect(bce.querySelector('td[data-libelle="Leads"]')?.textContent).toBe("219");
    expect(ligne(c, "osm").querySelector(".atl-pastille")?.textContent).toBe("Non connecté");
    expect(ligne(c, "base_clients").querySelector(".atl-pastille")?.textContent).toBe("À fournir par le client");
    expect(ligne(c, "base_clients").querySelector('td[data-libelle="Qui agit"]')?.textContent).toBe("Le client");
    expect(ligne(c, "bureaux_segments").querySelector(".atl-pastille")?.textContent).toBe("Connecté");
    expect(ligne(c, "moniteur_belge").querySelector(".atl-pastille")?.textContent).toBe("Non connecté");
    expect(ligne(c, "moniteur_belge").querySelector('td[data-libelle="Qui agit"]')?.textContent).toBe("Nous");
    // Leads non calculables : un tiret lisible par un lecteur d'écran, jamais un zéro.
    expect(ligne(c, "moniteur_belge").querySelector('td[data-libelle="Leads"] [aria-label="non calculable"]')).not.toBeNull();
  });

  it("une clé seulement configurée est « Configuré, non vérifié » (pastille neutre), jamais « Connecté »", async () => {
    const c = await ouvrir("/RNO/atelier/parametres");
    const voix = ligne(c, "voix");
    expect(voix.querySelector(".atl-pastille")?.textContent).toBe("Configuré, non vérifié");
    expect(voix.querySelector(".atl-pastille")?.getAttribute("data-ton")).toBe("neutre");
    expect(voix.textContent).not.toContain("Connecté");
    expect(ligne(c, "bureaux_segments").querySelector(".atl-pastille")?.textContent).toBe("Connecté");
  });

  it("Google reprend l'état le plus faible des services du tableau des connecteurs, service par service", async () => {
    const c = await ouvrir("/RNO/atelier/parametres");
    const g = ligne(c, "google");
    // Search Console et GA4 sans accès réel, Ads et fiche d'établissement sans connexion : « Non connecté ».
    expect(g.querySelector(".atl-pastille")?.textContent).toBe("Non connecté");
    expect(g.textContent).toContain("Non connecté : Google Search Console, Google Analytics 4, Google Ads, Fiche d'établissement Google");
    // Aucune connexion de diffusion.
    expect(ligne(c, "diffusion").querySelector(".atl-pastille")?.textContent).toBe("Non connecté");
  });

  it("annonce le nombre de branchements qui manquent et la synthèse des leads", async () => {
    const c = await ouvrir("/RNO/atelier/parametres");
    // 11 branchements, un seul en réel (la voix n'est que configurée, non vérifiée) : 10 manquent.
    expect(c.querySelector("section#param-reel [role=status]")?.textContent).toBe("Connexions à établir : 10 sur 11.");
    const phrases = Array.from(c.querySelectorAll("section#param-reel ul.atl-liste li")).map((l) => l.textContent);
    expect(phrases).toEqual(REALITE.synthese.map((s) => s.phrase));
    expect(phrases[0]).toBe("219 leads attendent le registre BCE réel pour confirmer qu'ils sont actifs.");
    expect(c.querySelector("section#param-reel")?.textContent).toContain("240 leads analysés.");
  });

  it("route inconnue du worker : l'erreur est dite, aucune table vide", async () => {
    stubReseau({ realite: { corps: {} } });
    const c = await ouvrir("/RNO/atelier/parametres");
    const alerte = c.querySelector("section#param-reel [role=alert]");
    expect(alerte?.textContent).toContain("les connexions");
    expect(c.querySelector("tr[data-branchement]")).toBeNull();
  });

  it("échec du serveur : l'erreur est dite avec un bouton pour réessayer", async () => {
    stubReseau({ realite: { statut: 403, corps: { error: "Réservé à un humain." } } });
    const c = await ouvrir("/RNO/atelier/parametres");
    expect(c.querySelector("section#param-reel [role=alert]")?.textContent).toContain("Réservé à un humain");
  });

  it("connexions natives illisibles : le serveur reste affiché, Google et la diffusion passent « Non connecté » avec la cause", async () => {
    stubReseau({ connexions: { statut: 403, corps: {} } });
    const c = await ouvrir("/RNO/atelier/parametres");
    expect(ligne(c, "bce")).not.toBeNull();
    for (const cle of ["google", "diffusion"]) {
      expect(ligne(c, cle).querySelector(".atl-pastille")?.textContent, cle).toBe("Non connecté");
      expect(ligne(c, cle).textContent, cle).toContain("Connexions de l'entreprise illisibles");
    }
  });
});

describe("Paramètres : actualisation", () => {
  it("le bouton « Actualiser les connexions » relit l'état du serveur", async () => {
    const c = await ouvrir("/RNO/atelier/parametres");
    const nb = () => (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((a) => String(a[0]).includes("/realite?")).length;
    const avant = nb();
    await cliquer(parTexte(c, "button", "Actualiser les connexions"));
    await vi.waitFor(() => expect(nb()).toBe(avant + 1));
  });
});

describe("Paramètres : rendu mobile", () => {
  it("chaque cellule porte son libellé : le tableau devient une liste de cartes sous 640 px", async () => {
    const c = await ouvrir("/RNO/atelier/parametres");
    for (const l of Array.from(c.querySelectorAll<HTMLElement>("tr[data-branchement]"))) {
      const cellules = Array.from(l.querySelectorAll("td"));
      expect(cellules.length, l.dataset.branchement).toBe(4);
      for (const td of cellules) expect(td.dataset.libelle, l.dataset.branchement).toBeTruthy();
      // Le nom reste l'en-tête de ligne (devient le titre de la carte).
      expect(l.querySelector("th[scope=row]")).not.toBeNull();
    }
  });

  it("sur téléphone les sections sont repliées, sauf quand l'adresse les vise ; la vue Connexions seule n'a plus de pli", async () => {
    simulerEcran(true);
    let c = await ouvrir("/RNO/atelier/parametres");
    expect(c.querySelector<HTMLDetailsElement>("section#param-sources details")?.open).toBe(false);
    expect(c.querySelector("section#param-reel details")).toBeNull();
    rendu?.demonter();
    window.location.hash = "#param-sources";
    c = await ouvrir("/RNO/atelier/parametres");
    expect(c.querySelector<HTMLDetailsElement>("section#param-sources details")?.open).toBe(true);
  });
});

describe("Accueil : encart « Connexions »", () => {
  it("annonce le nombre de branchements qui manquent et nomme les premiers", async () => {
    const c = await ouvrir("/RNO/atelier/accueil");
    const encart = c.querySelector("section[aria-labelledby=accueil-reel]")!;
    expect(encart.textContent).toContain("Connexions à établir : 10");
    expect(encart.textContent).toContain("Registre BCE ; Banque nationale ; OpenStreetMap ; Base clients ; et 6 autres.");
  });

  it("le lien mène à la section de Paramètres", async () => {
    const c = await ouvrir("/RNO/atelier/accueil");
    const lien = parTexte(c.querySelector("section[aria-labelledby=accueil-reel]")!, "a", "Voir les connexions");
    expect(lien.getAttribute("href")).toBe(`/RNO${LIEN_PASSAGE_AU_REEL}`);
    await cliquer(lien);
    expect(pont.navigations).toContain("/atelier/parametres#param-reel");
    expect(LIEN_PASSAGE_AU_REEL).toBe("/atelier/parametres#param-reel");
  });

  it("tout en réel : le dit, sans compter de manque", async () => {
    stubReseau({ realite: { corps: { ...REALITE, branchements: REALITE.branchements.map((b) => ({ ...b, etat: "reel" })) } }, connexions: { corps: { connections: [] } } });
    const c = await ouvrir("/RNO/atelier/accueil");
    // Les deux lignes de l'interface (sans connexion) manquent encore : l'encart compte AUSSI ce que seule l'interface lit.
    expect(c.querySelector("section[aria-labelledby=accueil-reel]")?.textContent).toContain("Connexions à établir : 2");
  });

  it("route illisible : une phrase et le lien, sans casser l'accueil", async () => {
    stubReseau({ realite: { statut: 500, corps: {} } });
    const c = await ouvrir("/RNO/atelier/accueil");
    expect(c.querySelector("section[aria-labelledby=accueil-reel]")?.textContent).toContain("n'a pas pu être lu");
    expect(c.textContent).toContain("Demander à l'équipe");
  });
});

describe("fusion des branchements (fonctions pures)", () => {
  const serveur = REALITE.branchements;
  const connexions = (liste: Array<Record<string, unknown>>): ConnexionNative[] => liste.map((x) => analyserConnexion(x)!).filter(Boolean);

  it("garde l'ordre des clés et ajoute exactement google et diffusion", () => {
    const f = fusionnerBranchements(serveur, lignesServices([]), null, H);
    expect(f.map((b) => b.cle)).toEqual(["bce", "bnb", "osm", "base_clients", "consentement", "bureaux_segments", "google", "diffusion", "voix", "moniteur_belge", "ne_m_appelez_plus"]);
  });

  it("un service réel prouvé par un appel d'outil est « réel » mesuré ; sans appel il n'est que « déclaré »", () => {
    const quatre = ["gsc:atelier-google-search-console", "ga4:atelier-google-analytics", "ads:atelier-google-ads", "gbp:atelier-google-business-profile"].map((x) => x.split(":")[1]!);
    const sans = connexions(quatre.map((s) => connexion(`Compte ${s}`, s, { config: { sourceTemplateKey: s, oauth: { scopes: ["https://www.googleapis.com/auth/x"] } } })));
    const g1 = fusionnerBranchements(serveur, lignesServices(sans), null, H).find((b) => b.cle === "google")!;
    expect(g1).toMatchObject({ etat: "configure_non_verifie", preuve: "declare" });
    const avec = connexions(quatre.map((s) => connexion(`Compte ${s}`, s, { lastUsedAt: H, config: { sourceTemplateKey: s, oauth: { scopes: ["https://www.googleapis.com/auth/x"] } } })));
    const g2 = fusionnerBranchements(serveur, lignesServices(avec), null, H).find((b) => b.cle === "google")!;
    expect(g2).toMatchObject({ etat: "reel", preuve: "mesure" });
  });

  it("une connexion en erreur compte comme non branchée", () => {
    const c = connexions([connexion("Google Ads", "atelier-google-ads", { healthStatus: "failed", healthMessage: "jeton expiré" })]);
    const g = fusionnerBranchements(serveur, lignesServices(c), null, H).find((b) => b.cle === "google")!;
    expect(g.etat).toBe("non_branche");
    expect(g.detail).toContain("Google Ads");
  });

  it("branchementsManquants ne garde que ce qui n'est pas en réel", () => {
    const f = fusionnerBranchements(serveur, lignesServices([]), null, H);
    expect(branchementsManquants(f).map((b) => b.cle)).not.toContain("bureaux_segments");
    expect(branchementsManquants(f).map((b) => b.cle)).toContain("voix");
    expect(branchementsManquants(f)).toHaveLength(10);
  });
});
