// @vitest-environment jsdom
/**
 * Rubrique « Prospects » (lot P11) : liste B2B et B2C, libellé « estimation », filtres qui changent
 * la requête, fiche avec base légale, exclusion, import en trois étapes avec rejet affiché,
 * suppression qui exige la confirmation. Les routes du plugin sont servies par un `fetch` simulé.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROSPECT_B2B, PROSPECT_B2C } from "../../src/contrats/exemples/prospection.js";
import { PageAtelier } from "../../src/ui/index.js";
import { champParLibelle, cliquer, ENTREPRISE, installerPont, parTexte, rendre, saisir, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
let pont: Pont;
let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string; corps: unknown }> = [];
let serveur: (methode: string, url: string, corps: unknown) => { statut: number; corps: unknown };

const B2B = structuredClone(PROSPECT_B2B) as unknown as typeof PROSPECT_B2B;
const B2C = structuredClone(PROSPECT_B2C) as unknown as typeof PROSPECT_B2C;
const page = (...prospects: unknown[]) => ({ total: prospects.length, page: 1, pages: 1, prospects });

beforeEach(() => {
  pont = installerPont();
  appels = [];
  serveur = () => ({ statut: 200, corps: page(B2B, B2C) });
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
  pont.chemin = "/RNO/atelier/prospects";
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  return rendu.conteneur;
}
const requetesListe = () => appels.filter((a) => a.methode === "GET" && a.url.includes("/prospects?"));

describe("liste des prospects", () => {
  it("affiche B2B et B2C avec score, libellé « estimation » et sans coordonnées en clair", async () => {
    const c = await ouvrir();
    expect(requetesListe()[0]!.url).toContain(`/api/plugins/atelier.marketing-ia/api/prospects?companyId=${ENTREPRISE}`);
    const lignes = c.querySelectorAll("tbody tr");
    expect(lignes).toHaveLength(2);
    // Tri par score décroissant : le particulier (70) avant l'entreprise (55).
    expect(lignes[0]!.textContent).toContain("[client-7f3a]");
    expect(lignes[0]!.textContent).toContain("Particulier");
    expect(lignes[1]!.textContent).toContain("55/100");
    expect(lignes[1]!.textContent).toContain("estimation, non étalonnée");
    expect(lignes[0]!.textContent).toContain("70/100");
    expect(lignes[0]!.textContent).not.toContain("non étalonnée");
    expect(c.textContent).not.toMatch(/certain|taux exact/iu);
    expect(c.textContent).not.toMatch(/@/u);
    expect(c.textContent).toContain("Ans");
  });

  it("affiche les motifs d'exclusion en français", async () => {
    const exclu = { ...structuredClone(B2B), statut: "exclu", motifsExclusion: [{ motif: "opposition_client", detail: "Opposition du 02/10.", constateLe: "2026-10-14T10:00:00.000Z" }] };
    serveur = () => ({ statut: 200, corps: page(exclu) });
    const c = await ouvrir();
    expect(c.querySelector("tbody")!.textContent).toContain("Opposition enregistrée");
    expect(c.querySelector("tbody")!.textContent).toContain("Exclu par une règle");
  });

  it("filtre secteur × zone : la requête change", async () => {
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", "Entreprises"));
    await saisir(champParLibelle(c, "Secteur (code NACE)"), "43.910, 66220");
    await saisir(champParLibelle(c, "Zone (commune ou code postal)"), "Liège, 4000");
    await saisir(champParLibelle(c, "Score minimal (0 à 100)"), "60");
    await cliquer(parTexte(c, "button", "Filtrer"));
    const derniere = new URL(requetesListe().at(-1)!.url, "http://x");
    expect(derniere.searchParams.get("nace")).toBe("43.910,66220");
    expect(derniere.searchParams.get("communes")).toBe("Liège");
    expect(derniere.searchParams.get("codesPostaux")).toBe("4000");
    expect(derniere.searchParams.get("cibles")).toBe("entreprise");
    expect(derniere.searchParams.get("scoreMin")).toBe("60");
  });

  it("un code NACE invalide bloque le filtre avec la raison", async () => {
    const c = await ouvrir();
    const avant = requetesListe().length;
    await saisir(champParLibelle(c, "Secteur (code NACE)"), "abc");
    expect(c.textContent).toContain("n'est pas un code NACE valide");
    await cliquer(parTexte(c, "button", "Filtrer"));
    expect(requetesListe()).toHaveLength(avant);
  });

  it("état vide et erreur en phrases claires", async () => {
    serveur = () => ({ statut: 200, corps: page() });
    let c = await ouvrir();
    expect(c.textContent).toContain("Aucun prospect pour le moment.");
    rendu?.demonter();
    serveur = () => ({ statut: 403, corps: { error: "Réservé à un humain." } });
    c = await ouvrir();
    expect(c.querySelector('[role="alert"]')!.textContent).toContain("Réservé à un humain.");
  });
});

describe("fiche d'un prospect", () => {
  it("montre les critères (valeur, source, date) et la base légale par canal", async () => {
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", B2B.denomination!));
    const fiche = c.querySelector(".atl-fiche")!;
    for (const critere of B2B.score!.criteres) {
      expect(fiche.textContent).toContain(critere.libelle);
      expect(fiche.textContent).toContain(critere.source);
    }
    const canaux = [...fiche.querySelectorAll("table")[1]!.querySelectorAll("tbody tr")];
    expect(canaux).toHaveLength(4);
    expect(canaux[0]!.textContent).toContain("Courriel");
    expect(canaux[0]!.textContent).toContain("Permis");
    expect(canaux[0]!.textContent).toContain("adresse impersonnelle");
    const sms = canaux.find((l) => l.textContent?.startsWith("SMS"))!;
    expect(sms.textContent).toContain("Refusé");
    expect(sms.textContent).toMatch(/Aucune base légale|Bases possibles/u);
    expect(fiche.textContent).not.toMatch(/Envoyer|Contacter/u);
  });

  it("« Exclure » exige un motif précisé puis envoie l'exclusion", async () => {
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", B2B.denomination!));
    const bouton = parTexte(c.querySelector(".atl-fiche")!, "button", "Exclure");
    expect(bouton.getAttribute("aria-disabled")).toBe("true");
    await saisir(champParLibelle(c, "Motif") as HTMLSelectElement, "doublon");
    await saisir(champParLibelle(c, "Précision"), "Déjà dans la base du client.");
    await cliquer(bouton);
    const post = appels.find((a) => a.methode === "POST");
    expect(post!.url).toContain(`/prospects/${B2B.id}/exclusion`);
    expect(post!.corps).toEqual({ companyId: ENTREPRISE, prospectId: B2B.id, motif: "doublon", detail: "Déjà dans la base du client." });
  });
});

/** Joue le rôle de `base-clients.apercu` pour un CSV à séparateur « ; » (colonnes, trois lignes, colonnes sensibles). */
function apercuServeur(corps: { contenuBase64: string; nomFichier: string; format: string }) {
  const lignes = Buffer.from(corps.contenuBase64, "base64").toString("utf-8").split(/\r?\n/u).filter(Boolean);
  const colonnes = lignes[0]!.split(";");
  return {
    format: corps.format,
    nomFichier: corps.nomFichier,
    empreinteFichier: "b".repeat(64),
    tailleOctets: 10,
    colonnes,
    apercu: lignes.slice(1, 4).map((l) => l.split(";")),
    lignes: lignes.length - 1,
    colonnesSensiblesRefusees: colonnes.filter((x) => /sinistre/iu.test(x)),
    formulesNeutralisees: 0,
    injectionsSignalees: 0,
  };
}

describe("base clients", () => {
  async function ouvrirBase() {
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", "Base clients et oppositions"));
    return c;
  }
  async function choisirFichier(c: HTMLElement, nom: string, contenu: string) {
    const input = c.querySelector('input[type="file"]') as HTMLInputElement;
    const fichier = new File([contenu], nom, { type: "text/csv" });
    Object.defineProperty(input, "files", { value: [fichier], configurable: true });
    const { act } = await import("react");
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
    });
  }

  it("import en trois étapes : fichier, correspondance avec aperçu, résultat avec rejet et colonne sensible", async () => {
    const compte = {
      id: "c1111111-1111-4111-8111-111111111111",
      companyId: ENTREPRISE,
      nomFichier: "clients.csv",
      format: "csv",
      empreinteFichier: "a".repeat(64),
      lignesLues: 3,
      lignesRetenues: 2,
      lignesRejetees: 1,
      rejets: [{ ligne: 3, motif: "Courriel invalide" }],
      correspondance: [{ colonne: "Courriel", cible: "courriel" }, { colonne: "Sinistre", cible: "ignorer" }],
      colonnesSensiblesRefusees: ["Sinistre"],
      finalite: "Suivi de la clientèle existante",
      dureeConservationMois: 12,
      purgeLe: "2027-10-15T10:00:00.000Z",
      mode: "demonstration",
      importePar: "local-board",
      importeLe: "2026-10-15T10:00:00.000Z",
    };
    serveur = (m, u, corps) => {
      if (m === "POST" && u.endsWith("/base-clients/imports")) return { statut: 201, corps: compte };
      if (m === "POST" && u.endsWith("/base-clients/apercu")) return { statut: 200, corps: apercuServeur(corps as { contenuBase64: string; nomFichier: string; format: string }) };
      return { statut: 200, corps: page() };
    };
    const c = await ouvrirBase();
    await choisirFichier(c, "clients.csv", "Courriel;Sinistre\na@exemple.invalid;oui\nb@exemple.invalid;non\n");
    const continuer = parTexte(c, "button", "Continuer : associer les colonnes");
    expect(continuer.getAttribute("aria-disabled")).toBe("true"); // finalité manquante
    await saisir(champParLibelle(c, "Finalité du traitement"), "Suivi de la clientèle existante");
    await cliquer(continuer);
    // Étape 2 : aperçu, colonne sensible refusée.
    expect(c.textContent).toContain("a@exemple.invalid");
    expect(c.textContent).toContain("Colonne sensible : refusée à l'import.");
    expect(c.querySelector<HTMLSelectElement>('select[aria-label="Contenu de la colonne Courriel"]')!.value).toBe("courriel");
    expect(c.querySelector<HTMLSelectElement>('select[aria-label="Contenu de la colonne Sinistre"]')!.disabled).toBe(true);
    await cliquer(parTexte(c, "button", "Importer la base clients"));
    const post = appels.find((a) => a.methode === "POST" && a.url.endsWith("/base-clients/imports"))!;
    const corps = post.corps as { correspondance: unknown; separateur: string; dureeConservationMois: number };
    expect(corps.correspondance).toEqual([{ colonne: "Courriel", cible: "courriel" }, { colonne: "Sinistre", cible: "ignorer" }]);
    expect(corps.separateur).toBe(";");
    expect(corps.dureeConservationMois).toBe(12);
    // Étape 3.
    expect(c.textContent).toContain("2 lignes importées");
    expect(c.textContent).toContain("1 lignes rejetées");
    expect(c.textContent).toContain("Ligne 3 : Courriel invalide");
    expect(c.textContent).toContain("Colonnes sensibles refusées");
  });

  it("refuse un fichier à macros avec la raison", async () => {
    const c = await ouvrirBase();
    await choisirFichier(c, "clients.xlsm", "x");
    expect(c.querySelector('[role="alert"]')!.textContent).toContain("macros");
  });

  it("la suppression exige la confirmation exacte, puis envoie la demande", async () => {
    serveur = (m, u) => (m === "POST" && u.endsWith("/base-clients/suppression") ? { statut: 200, corps: { supprimee: true } } : { statut: 200, corps: page() });
    const c = await ouvrirBase();
    await cliquer(parTexte(c, "button", "Supprimer la base clients"));
    const final = parTexte(c, "button", "Supprimer définitivement la base clients");
    await saisir(champParLibelle(c, "Motif de la suppression"), "Fin du contrat");
    await saisir(champParLibelle(c, "Confirmation"), "supprimer la base");
    expect(final.getAttribute("aria-disabled")).toBe("true");
    await cliquer(final);
    expect(appels.some((a) => a.methode === "POST")).toBe(false);
    await saisir(champParLibelle(c, "Confirmation"), "SUPPRIMER LA BASE CLIENTS");
    expect(final.getAttribute("aria-disabled")).toBeNull();
    await cliquer(final);
    const post = appels.find((a) => a.methode === "POST")!;
    expect(post.corps).toEqual({ companyId: ENTREPRISE, confirmation: "SUPPRIMER LA BASE CLIENTS", motif: "Fin du contrat" });
    expect(c.textContent).toContain("oppositions ont été conservées");
  });

  it("ajoute une opposition (valeur envoyée une fois, origine humaine)", async () => {
    serveur = (m, u) => (m === "POST" && u.endsWith("/oppositions") ? { statut: 201, corps: {} } : { statut: 200, corps: page() });
    const c = await ouvrirBase();
    await cliquer(parTexte(c, "button", "Ajouter une opposition"));
    await saisir(champParLibelle(c, "Valeur à protéger"), "refus@exemple.invalid");
    await cliquer(parTexte(c, "button", "Enregistrer l'opposition"));
    const post = appels.find((a) => a.methode === "POST")!;
    expect(post.corps).toEqual({ companyId: ENTREPRISE, type: "courriel", valeur: "refus@exemple.invalid", canal: "tous", origine: "humain" });
    expect(c.textContent).toContain("Opposition enregistrée");
  });
  it("aperçu d'un XLSX par la route : colonnes lues par le serveur, sans saisie à la main", async () => {
    const colonnes = ["Courriel client", "Dossier sinistre", "Ville"];
    serveur = (m, u) =>
      m === "POST" && u.endsWith("/base-clients/apercu")
        ? { statut: 200, corps: { format: "xlsx", nomFichier: "clients.xlsx", empreinteFichier: "c".repeat(64), tailleOctets: 4200, colonnes, apercu: [["a", "oui", "Liège"], ["b", "non", "Huy"]], lignes: 40, colonnesSensiblesRefusees: ["Dossier sinistre"], formulesNeutralisees: 2, injectionsSignalees: 1 } }
        : { statut: 200, corps: page() };
    const c = await ouvrirBase();
    await choisirFichier(c, "clients.xlsx", "PK");
    await saisir(champParLibelle(c, "Finalité du traitement"), "Suivi de la clientèle existante");
    await cliquer(parTexte(c, "button", "Continuer : associer les colonnes"));
    const apercu = appels.find((a) => a.url.endsWith("/base-clients/apercu"))!;
    expect(apercu.methode).toBe("POST");
    expect(apercu.corps).toMatchObject({ companyId: ENTREPRISE, nomFichier: "clients.xlsx", format: "xlsx" });
    expect(c.textContent).not.toContain("Noms des colonnes de la première ligne");
    expect(c.textContent).toContain("40 lignes lues");
    expect(c.textContent).toContain("2 formules neutralisées");
    expect(c.textContent).toContain("Liège · Huy");
    expect(c.querySelector<HTMLSelectElement>('select[aria-label="Contenu de la colonne Dossier sinistre"]')!.disabled).toBe(true);
    expect(c.querySelector<HTMLSelectElement>('select[aria-label="Contenu de la colonne Courriel client"]')!.value).toBe("courriel");
    expect(c.textContent).toContain("Un nouvel import remplace la base clients actuelle");
  });

  it("une erreur de l'aperçu reste à l'étape du fichier avec la phrase du serveur", async () => {
    serveur = (m, u) => (m === "POST" && u.endsWith("/base-clients/apercu") ? { statut: 400, corps: { erreur: "Colonnes de santé refusées.", details: { colonnesSensiblesRefusees: ["Sinistre"] } } } : { statut: 200, corps: page() });
    const c = await ouvrirBase();
    await choisirFichier(c, "clients.csv", "Courriel;Sinistre\nx;y\n");
    await saisir(champParLibelle(c, "Finalité du traitement"), "Suivi de la clientèle existante");
    await cliquer(parTexte(c, "button", "Continuer : associer les colonnes"));
    expect(c.textContent).toContain("Colonnes de santé refusées.");
    expect(c.textContent).toContain("Choisir le fichier");
    expect(parTexte(c, "button", "Continuer : associer les colonnes")).toBeTruthy();
  });

  it("affiche l'état de la base en tête et dit qu'un nouvel import la remplace", async () => {
    const etat = { existe: true, clients: 1234, actifs: 1100, importId: "c1111111-1111-4111-8111-111111111111", nomFichier: "base-2026.csv", format: "csv", importeLe: "2026-10-01T10:00:00.000Z", importePar: "local-board", purgeLe: "2027-10-01T10:00:00.000Z", finalite: "Suivi de la clientèle existante", dureeConservationMois: 12, mode: "reel", aPurger: false };
    serveur = (m, u) => (m === "GET" && u.includes("/base-clients?") ? { statut: 200, corps: etat } : { statut: 200, corps: page() });
    const c = await ouvrirBase();
    expect(appels.some((a) => a.methode === "GET" && a.url.includes(`/base-clients?companyId=${ENTREPRISE}`))).toBe(true);
    expect(c.textContent).toContain("Base clients actuelle");
    expect(c.textContent).toContain("1\u202f234");
    expect(c.textContent).toContain("base-2026.csv");
    await choisirFichier(c, "nouveau.csv", "Courriel;Ville\nx;Liège\n");
    await saisir(champParLibelle(c, "Finalité du traitement"), "Suivi de la clientèle existante");
    serveur = (m, u, corps) => (m === "POST" && u.endsWith("/base-clients/apercu") ? { statut: 200, corps: apercuServeur(corps as { contenuBase64: string; nomFichier: string; format: string }) } : { statut: 200, corps: m === "GET" && u.includes("/base-clients?") ? etat : page() });
    await cliquer(parTexte(c, "button", "Continuer : associer les colonnes"));
    expect(c.textContent).toContain("La base actuelle (1\u202f234 clients, fichier base-2026.csv) sera effacée");
  });

  it("sans base chargée, l'état le dit", async () => {
    serveur = (m, u) => (m === "GET" && u.includes("/base-clients?") ? { statut: 200, corps: { existe: false, clients: 0, actifs: 0, importId: null, nomFichier: null, format: null, importeLe: null, importePar: null, purgeLe: null, finalite: null, dureeConservationMois: null, mode: null, aPurger: false } } : { statut: 200, corps: page() });
    const c = await ouvrirBase();
    expect(c.textContent).toContain("Aucune base clients n'est chargée pour l'instant.");
  });

  it("tableau « Ventes croisées » : pseudonyme, produits, canal permis ou motif du refus, sans tiret cadratin", async () => {
    const ventes = {
      mode: "demonstration", origineRegles: "demonstration", clients: 105,
      regles: [{ typeClient: "particulier", detenue: "auto", proposee: "habitation", decidePar: "démonstration" }],
      opportunites: [
        { pseudonyme: "[client-1a2b3c4d]", typeClient: "particulier", detenus: ["auto"], proposes: ["habitation"], codePostal: "4000", commune: "Liège", canauxPermis: ["courriel", "sms"], canaux: [], mode: "demonstration" },
        { pseudonyme: "[client-5e6f7a8b]", typeClient: "entreprise", detenus: ["rc-pro"], proposes: ["multirisque"], codePostal: "4430", commune: "Ans", canauxPermis: [], canaux: [{ canal: "courriel", permis: false, motif: "Motif de refus lisible" }], mode: "demonstration" },
      ],
    };
    serveur = (m, u) => (m === "GET" && u.includes("/ventes-croisees?") ? { statut: 200, corps: ventes } : { statut: 200, corps: page() });
    const c = await ouvrirBase();
    expect(appels.some((a) => a.methode === "GET" && a.url.includes(`/ventes-croisees?companyId=${ENTREPRISE}`))).toBe(true);
    const tableau = c.querySelector("table")!;
    expect(tableau).toBeTruthy();
    expect(tableau.textContent).toContain("[client-1a2b3c4d]");
    expect(tableau.textContent).toContain("Courriel, SMS");
    expect(tableau.textContent).toContain("rc pro");
    expect(tableau.textContent).toContain("Motif de refus lisible");
    expect(c.textContent).toContain("Règles de démonstration : auto sans habitation (particulier).");
    expect(c.textContent).not.toContain("\u2014");
  });
});

describe("export fichier, étalonnage, probabilité mesurée", () => {
  const rapportExport = {
    nomFichier: "prospects-courriel.csv",
    format: "csv",
    typeMime: "text/csv",
    contenuBase64: Buffer.from("denomination\nAns Toitures\n").toString("base64"),
    empreinteFichier: "d".repeat(64),
    mode: "demonstration",
    genereLe: "2026-10-15T10:00:00.000Z",
    rapport: { demandes: 3, inclus: 1, refuses: [{ prospectId: "22222222-2222-4222-8222-222222222222", denomination: "Dupont SRL", motif: "opposition_client" }, { prospectId: "33333333-3333-4333-8333-333333333333", denomination: null, motif: "Aucune base légale pour ce canal." }] },
  };

  it("exporte : télécharge le fichier puis affiche le rapport avec les écartés et leur motif", async () => {
    const cliques: Array<{ nom: string }> = [];
    const creer = vi.fn(() => "blob:test");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: creer, revokeObjectURL: vi.fn() }));
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      cliques.push({ nom: this.download });
    });
    serveur = (m, u) => (m === "POST" && u.endsWith("/prospects/exports-fichier") ? { statut: 201, corps: rapportExport } : { statut: 200, corps: page(B2B, B2C) });
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", "Entreprises"));
    await saisir(champParLibelle(c, "Zone (commune ou code postal)"), "4000");
    await cliquer(parTexte(c, "button", "Filtrer"));
    expect(c.textContent).toContain("Seuls les prospects que vous avez le droit de contacter par ce canal sont exportés");
    await saisir(champParLibelle(c, "Canal de contact") as HTMLSelectElement, "sms");
    await cliquer(parTexte(c, "button", "Exporter"));
    const post = appels.find((a) => a.methode === "POST" && a.url.endsWith("/prospects/exports-fichier"))!;
    expect(post.corps).toEqual({ companyId: ENTREPRISE, canal: "sms", format: "csv", filtres: { cibles: "entreprise", codesPostaux: "4000" } });
    expect(creer).toHaveBeenCalledTimes(1);
    expect((creer.mock.calls[0] as unknown as [Blob])[0].size).toBeGreaterThan(0);
    expect(cliques).toEqual([{ nom: "prospects-courriel.csv" }]);
    expect(c.textContent).toContain("1 inclus");
    expect(c.textContent).toContain("2 écartés");
    expect(c.textContent).toContain("Dupont SRL : Opposition enregistrée");
    expect(c.textContent).toContain("[prospect-33333333]");
    expect(c.textContent).toContain("Aucune base légale pour ce canal.");
    clic.mockRestore();
  });

  it("l'export refusé (403) affiche la phrase du serveur et ne télécharge rien", async () => {
    const creer = vi.fn(() => "blob:test");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: creer, revokeObjectURL: vi.fn() }));
    serveur = (m, u) => (m === "POST" && u.endsWith("/prospects/exports-fichier") ? { statut: 403, corps: { erreur: "Réservé à un humain.", code: "elevation_refusee" } } : { statut: 200, corps: page(B2B) });
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", "Exporter"));
    expect(c.querySelector('[role="alert"]')!.textContent).toContain("Réservé à un humain.");
    expect(creer).not.toHaveBeenCalled();
  });

  async function etalonner(c: HTMLElement, reponse: unknown) {
    serveur = (m, u) => (m === "POST" && u.endsWith("/etalonnages") ? { statut: 201, corps: reponse } : { statut: 200, corps: page(B2B, B2C) });
    const input = c.querySelector('section input[type="file"]') as HTMLInputElement;
    const fichier = new File(["type_cible;issue\nentreprise;gagnee\n"], "historique.csv", { type: "text/csv" });
    Object.defineProperty(input, "files", { value: [fichier], configurable: true });
    const { act } = await import("react");
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
    });
    await cliquer(parTexte(c, "button", "Calculer l'étalonnage"));
  }

  it("étalonnage : probabilité mesurée quand les seuils sont atteints", async () => {
    const c = await ouvrir();
    await etalonner(c, { etalonnage: { statut: "probabilite_mesuree", effectif: 412, conversions: 57, brier: 0.1234, methode: "platt" }, observationsIgnorees: 3, application: { prospects: 20, probabilitesAppliquees: 18, estimations: 2 } });
    const post = appels.find((a) => a.url.endsWith("/etalonnages"))!;
    expect(post.corps).toMatchObject({ companyId: ENTREPRISE, segment: { cible: "entreprise", nace: [] }, historique: { nomFichier: "historique.csv", format: "csv" } });
    expect(c.textContent).toContain("Probabilité mesurée sur 412 prospects dont 57 conversions.");
    expect(c.textContent).toContain("0.123");
    expect(c.textContent).toContain("18 probabilités mesurées");
  });

  it("étalonnage : estimation quand l'historique est insuffisant", async () => {
    const c = await ouvrir();
    await etalonner(c, { etalonnage: { statut: "estimation", effectif: 120, conversions: 9, brier: null, methode: "platt" }, observationsIgnorees: 0, application: { prospects: 20, probabilitesAppliquees: 0, estimations: 20 } });
    expect(c.textContent).toContain("Estimation : pas assez d'historique");
    expect(c.textContent).toContain("120/300 prospects, 9/30 conversions");
    expect(c.textContent).not.toContain("Probabilité mesurée sur");
  });

  it("la liste montre la probabilité mesurée avec ses bornes, jamais pour une estimation", async () => {
    const c = await ouvrir();
    const lignes = [...c.querySelectorAll("tbody tr")];
    const mesuree = lignes.find((l) => l.textContent?.includes("70/100"))!;
    expect(mesuree.textContent).toContain("probabilité mesurée : 18 % (entre 12 % et 26 %)");
    const estimee = lignes.find((l) => l.textContent?.includes("55/100"))!;
    expect(estimee.textContent).not.toContain("probabilité mesurée");
  });
});
