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
import { CompteRenduProspect, ConfianceQualification } from "../../src/contrats/prospection.js";
import { adresseDepuisFiltres, EXPLICATION_STATUT_LEAD, familleMetier, filtresDepuisAdresse, FILTRES_VIDES, filtresExport, filtresMemorises, libelleScore, statutLead } from "../../src/ui/vues/prospects.js";
import { act } from "react";
import { champParLibelle, cliquer, ENTREPRISE, installerPont, parTexte, rendre, saisir, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
let pont: Pont;
let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string; corps: unknown }> = [];
let serveur: (methode: string, url: string, corps: unknown) => { statut: number; corps: unknown };

const B2B = structuredClone(PROSPECT_B2B) as unknown as typeof PROSPECT_B2B;
const B2C = structuredClone(PROSPECT_B2C) as unknown as typeof PROSPECT_B2C;
const page = (...prospects: unknown[]) => ({ total: prospects.length, page: 1, pages: 1, prospects });

const COMPTE_RENDU: CompteRenduProspect = {
  prospectId: B2B.id,
  nom: B2B.denomination!,
  genereLe: "2026-10-16T10:00:00.000Z",
  pourquoi: {
    verifies: [{ code: "entreprise_active", libelle: "Active (entreprise) ou demande / client (particulier)", detail: "Entreprise du registre BCE, non signalée inactive", source: "BCE · bce_rechercher", service: "bce", date: "2026-10-15T09:00:00.000Z" }],
    nonVerifies: [{ code: "taille_connue", libelle: "Taille connue", detail: "Ni comptes BNB ni taille déclarée" }],
    contraires: [{ code: "zone_cible", libelle: "Dans une zone de la cible", detail: "Zone du prospect hors des zones de la cible" }],
  },
  confiance: { valeur: 40, qualifie: false, plafonnee: true, seuil: 90 },
  score: { valeur: 55, nature: "estimation", libelle: "Score 55/100, estimation (pas assez d'historique pour le mesurer)" },
  differenceConfianceScore: "La confiance (40 %) dit à quel point il est établi que ce lead correspond à votre cible ; le score (55/100, estimation) estime sa chance de signer. L'un ne remplace pas l'autre.",
  signaux: [],
  offreRecommandee: { code: "rc-pro", nom: "Responsabilité civile professionnelle", description: "Offre fictive.", raison: "Offre confirmée par le client pour le segment « Médecins »." },
  raisonSansOffre: null,
  etablissementProche: { code: "bureau-liege", nom: "Bureau de Liège (démonstration)", adresse: "Rue de la Démonstration 10, 4000 Liège", distanceKm: null, raison: "meme_code_postal" },
  prochaineAction: { libelle: "Enrichir : bnb_comptes.", canal: null, outils: ["bnb_comptes"] },
  limites: ["RGPD : aucun contact sans validation humaine.", "Données de démonstration : ce lead est fictif."],
  markdown: "## Compte rendu du lead : Cabinet",
};

beforeEach(() => {
  window.localStorage.clear();
  pont = installerPont();
  appels = [];
  serveur = (methode, url) => (methode === "GET" && url.includes("/compte-rendu") ? { statut: 200, corps: COMPTE_RENDU } : { statut: 200, corps: page(B2B, B2C) });
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
    expect(lignes[1]!.textContent).toContain("Priorité 55/100 (estimation)");
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

  it("filtres bureau et segment : la requête porte la zone du bureau et le segment, sans filtre de source", async () => {
    serveur = (methode, url) =>
      methode === "GET" && url.includes("/marque")
        ? { statut: 200, corps: { marque: { etablissements: [{ nom: "Bureau de Liège", adresse: "Rue X 1, 4000 Liège", confirme: true }], segments: [{ code: "medecins", libelle: "Médecins", type: "profession", nace: [] }] } } }
        : { statut: 200, corps: page(B2B, B2C) };
    const c = await ouvrir();
    await saisir(champParLibelle(c, "Bureau") as HTMLSelectElement, "Bureau de Liège");
    await saisir(champParLibelle(c, "Segment") as HTMLSelectElement, "medecins");
    expect(() => champParLibelle(c, "Source")).toThrow();
    await cliquer(parTexte(c, "button", "Filtrer"));
    const derniere = new URL(requetesListe().at(-1)!.url, "http://x");
    expect(derniere.searchParams.get("zonesBureau")).toBe("4000,Liège");
    expect(derniere.searchParams.get("segments")).toBe("medecins");
    expect(derniere.searchParams.get("source")).toBeNull();
    expect(derniere.searchParams.get("avecClientsActuels")).toBeNull();
  });

  it("filtre « Mission » : menu des campagnes, « Toutes les missions » par défaut, campagneId envoyé à la liste et à l'export", async () => {
    const M1 = "11111111-1111-4111-8111-111111111111";
    pont.donnees["atelier.campagnes"] = { data: [{ id: M1, nom: "Professions médicales" }, { id: "22222222-2222-4222-8222-222222222222", nom: "Restauration" }], loading: false, error: null };
    const c = await ouvrir();
    const menu = champParLibelle(c, "Mission") as HTMLSelectElement;
    expect(menu.value).toBe("");
    expect([...menu.options].map((o) => o.textContent)).toEqual(["Toutes les missions", "Professions médicales", "Restauration"]);
    expect(new URL(requetesListe()[0]!.url, "http://x").searchParams.get("campagneId")).toBeNull();
    await saisir(menu, M1);
    await cliquer(parTexte(c, "button", "Filtrer"));
    expect(new URL(requetesListe().at(-1)!.url, "http://x").searchParams.get("campagneId")).toBe(M1);
    expect(filtresExport({ ...FILTRES_VIDES, campagneId: M1 })).toEqual({ campagneId: M1 });
  });

  it("tri « Par famille de métier » : médecins, dentistes, kinés, pharmacies, autres, d'après le NACE ou la catégorie OpenStreetMap", async () => {
    const avec = (nom: string, nace: string[], osm?: { cle: string; valeur: string }) => {
      const p = structuredClone(B2B);
      p.id = `${nom}-id`;
      p.denomination = nom;
      p.nace = nace;
      p.score = { ...p.score!, valeur: 50 };
      p.sources = (osm ? [{ ...p.sources[0]!, service: "osm", categorieOsm: osm }] : p.sources) as typeof p.sources;
      return p;
    };
    serveur = () => ({
      statut: 200,
      corps: page(
        avec("Ninja ramen", ["56.101"]),
        avec("Pharmacie du Pont", [], { cle: "amenity", valeur: "pharmacy" }),
        avec("Cabinet kiné", ["86.906"]),
        avec("Dr Martin", ["86.210"]),
        avec("Cabinet dentaire", [], { cle: "amenity", valeur: "dentist" }),
      ),
    });
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", "Par famille de métier"));
    const noms = [...c.querySelectorAll("tbody tr th button")].map((b) => b.textContent);
    expect(noms).toEqual(["Dr Martin", "Cabinet dentaire", "Cabinet kiné", "Pharmacie du Pont", "Ninja ramen"]);
    expect(familleMetier({ nace: ["86.210"], sources: [] })).toBe("medecins");
    expect(familleMetier({ nace: [], sources: [] })).toBe("autres");
  });

  it("clients actuels masqués par défaut ; la case les réaffiche et l'effacement la retire", async () => {
    const c = await ouvrir();
    expect(new URL(requetesListe()[0]!.url, "http://x").searchParams.get("avecClientsActuels")).toBeNull();
    await cliquer([...c.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((i) => i.parentElement?.textContent?.includes("Afficher aussi les clients actuels"))!);
    await cliquer(parTexte(c, "button", "Filtrer"));
    expect(new URL(requetesListe().at(-1)!.url, "http://x").searchParams.get("avecClientsActuels")).toBe("true");
    await cliquer(parTexte(c, "button", "Réinitialiser les filtres"));
    expect(new URL(requetesListe().at(-1)!.url, "http://x").searchParams.get("avecClientsActuels")).toBeNull();
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
    expect(c.textContent).toContain("Demandez une recherche au Coordinateur");
    expect(parTexte(c, "a", "Demander une recherche au Coordinateur")).toBeTruthy();
    rendu?.demonter();
    serveur = () => ({ statut: 403, corps: { error: "Réservé à un humain." } });
    c = await ouvrir();
    expect(c.querySelector('[role="alert"]')!.textContent).toContain("Réservé à un humain.");
  });
});

describe("filtres portés par l'adresse", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("adresse → filtres appliqués : la liste est demandée déjà filtrée et la barre affiche les filtres actifs", async () => {
    window.history.replaceState(null, "", "/RNO/atelier/prospects?statut=qualifie&segment=medecins&zone=Li%C3%A8ge&source=reelle&score=60");
    const c = await ouvrir();
    const q = new URL(requetesListe()[0]!.url, "http://x").searchParams;
    expect(q.get("statuts")).toBe("qualifie");
    expect(q.get("segments")).toBe("medecins");
    expect(q.get("communes")).toBe("Liège");
    // Le sélecteur Source n'existe plus : `?source=` est ignoré, il ne filtre pas et ne compte pas.
    expect(q.get("source")).toBeNull();
    expect(q.get("scoreMin")).toBe("60");
    expect(c.textContent).toContain("Filtres (4 actifs)");
  });

  it("valeurs invalides ignorées : statut inconnu, score hors bornes, balise, champ inconnu, valeur trop longue", () => {
    expect(filtresDepuisAdresse("?source=reelle")).toEqual(FILTRES_VIDES);
    expect(filtresDepuisAdresse("?statut=pirate&score=101&segment=%3Cscript%3E&zone=" + "a".repeat(81) + "&secteur=abc&source=autre&qualifies=1&x=1")).toEqual(FILTRES_VIDES);
    expect(filtresDepuisAdresse("?statut=qualifie&score=abc&campagne=c-1")).toEqual({ ...FILTRES_VIDES, statut: "qualifie", campagneId: "c-1" });
    expect(filtresDepuisAdresse("")).toEqual(FILTRES_VIDES);
  });

  it("filtre invalide dans l'adresse : la liste n'est pas filtrée", async () => {
    window.history.replaceState(null, "", "/RNO/atelier/prospects?statut=pirate&score=999");
    await ouvrir();
    const q = new URL(requetesListe()[0]!.url, "http://x").searchParams;
    expect(q.get("statuts")).toBeNull();
    expect(q.get("scoreMin")).toBeNull();
  });

  it("changer un filtre met l'adresse à jour sans recharger, l'effacement la vide, les autres paramètres restent", async () => {
    window.history.replaceState(null, "", "/RNO/atelier/prospects?autre=1#ancre");
    const c = await ouvrir();
    await saisir(champParLibelle(c, "Étape") as HTMLSelectElement, "qualifie");
    await saisir(champParLibelle(c, "Zone (commune ou code postal)"), "Liège, 4000");
    await cliquer(parTexte(c, "button", "Filtrer"));
    const u = new URL(window.location.href);
    expect(u.pathname).toBe("/RNO/atelier/prospects");
    expect(u.searchParams.get("statut")).toBe("qualifie");
    expect(u.searchParams.get("zone")).toBe("Liège, 4000");
    expect(u.searchParams.get("autre")).toBe("1");
    expect(u.hash).toBe("#ancre");
    await cliquer(parTexte(c, "button", "Réinitialiser les filtres"));
    expect(window.location.search).toBe("?autre=1");
  });

  it("aller-retour : les filtres écrits dans l'adresse se relisent à l'identique", () => {
    const f = { ...FILTRES_VIDES, statut: "qualifie" as const, segment: "medecins", zone: "Liège, 4000", scoreMin: "60", qualifies: true };
    expect(filtresDepuisAdresse(adresseDepuisFiltres(f))).toEqual(f);
    expect(adresseDepuisFiltres(FILTRES_VIDES)).toBe("");
  });
});

describe("moins de clics : cibles, filtres mémorisés, taille de page", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));
  const cle = `atelier.prospects.filtres.${ENTREPRISE}`;

  it("« Tout » coche les trois cibles, « Aucun » les décoche", async () => {
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", "Tout"));
    await cliquer(parTexte(c, "button", "Filtrer"));
    expect(new URL(requetesListe().at(-1)!.url, "http://x").searchParams.get("cibles")).toBe("entreprise,particulier,partenaire");
    await cliquer(parTexte(c, "button", "Aucun"));
    await cliquer(parTexte(c, "button", "Filtrer"));
    expect(new URL(requetesListe().at(-1)!.url, "http://x").searchParams.get("cibles")).toBeNull();
  });

  it("les derniers filtres sont mémorisés, restaurés à l'ouverture et oubliés par la réinitialisation", async () => {
    let c = await ouvrir();
    await saisir(champParLibelle(c, "Zone (commune ou code postal)"), "Liège");
    await cliquer(parTexte(c, "button", "Filtrer"));
    expect(JSON.parse(window.localStorage.getItem(cle)!).zone).toBe("Liège");
    rendu?.demonter();
    window.history.replaceState(null, "", "/");
    c = await ouvrir();
    expect(new URL(requetesListe().at(-1)!.url, "http://x").searchParams.get("communes")).toBe("Liège");
    expect(window.location.search).toBe("?zone=Li%C3%A8ge");
    await cliquer(parTexte(c, "button", "Réinitialiser les filtres"));
    expect(window.localStorage.getItem(cle)).toBeNull();
  });

  it("l'adresse prime sur la mémoire", async () => {
    window.localStorage.setItem(cle, JSON.stringify({ ...FILTRES_VIDES, zone: "Namur" }));
    window.history.replaceState(null, "", "/RNO/atelier/prospects?zone=Mons");
    await ouvrir();
    expect(new URL(requetesListe()[0]!.url, "http://x").searchParams.get("communes")).toBe("Mons");
  });

  it("une source mémorisée avant le retrait du sélecteur est ignorée : pas de filtre invisible, ni dans la requête ni dans l'adresse", async () => {
    window.localStorage.setItem(cle, JSON.stringify({ ...FILTRES_VIDES, zone: "Namur", source: "demonstration" }));
    const c = await ouvrir();
    const q = new URL(requetesListe()[0]!.url, "http://x").searchParams;
    expect(q.get("source")).toBeNull();
    expect(q.get("communes")).toBe("Namur");
    expect(window.location.search).not.toContain("source");
    expect(c.textContent).toContain("Filtres (1 actif");
    expect(filtresMemorises(ENTREPRISE).source).toBe("");
    expect(adresseDepuisFiltres({ ...FILTRES_VIDES, source: "reelle" })).toBe("");
  });

  it("sans stockage ou avec une mémoire corrompue, la page marche et ignore les valeurs inattendues", async () => {
    window.localStorage.setItem(cle, JSON.stringify({ zone: "Namur", statut: "pirate", scoreMin: "999", cibles: ["x"] }));
    await ouvrir();
    const q = new URL(requetesListe()[0]!.url, "http://x").searchParams;
    expect(q.get("communes")).toBe("Namur");
    expect(q.get("statuts")).toBeNull();
    expect(q.get("scoreMin")).toBeNull();
    expect(q.get("cibles")).toBeNull();
    rendu?.demonter();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("stockage refusé");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("stockage refusé");
    });
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", "Filtrer"));
    expect(requetesListe().length).toBeGreaterThan(1);
    vi.restoreAllMocks();
  });

  it("la taille de page 25 / 50 / 100 est envoyée au serveur (50 est le défaut, non envoyé)", async () => {
    serveur = () => ({ statut: 200, corps: { total: 120, page: 1, pages: 3, prospects: [B2B, B2C] } });
    const c = await ouvrir();
    expect(new URL(requetesListe()[0]!.url, "http://x").searchParams.get("parPage")).toBeNull();
    await saisir(c.querySelector<HTMLSelectElement>('select[aria-label="Prospects par page"]')!, "100");
    expect(new URL(requetesListe().at(-1)!.url, "http://x").searchParams.get("parPage")).toBe("100");
    await saisir(c.querySelector<HTMLSelectElement>('select[aria-label="Prospects par page"]')!, "25");
    expect(new URL(requetesListe().at(-1)!.url, "http://x").searchParams.get("parPage")).toBe("25");
  });
});

describe("fiche d'un prospect", () => {
  it("un clic n'importe où sur la ligne ouvre la fiche (pas seulement sur le nom)", async () => {
    const c = await ouvrir();
    expect(c.querySelector(".atl-fiche")).toBeNull();
    const ligne = parTexte(c, "button", B2B.denomination!).closest("tr")!;
    await cliquer(ligne.querySelector("td")!);
    const fiche = c.querySelector(".atl-fiche");
    expect(fiche?.getAttribute("aria-label")).toBe(`Fiche de ${B2B.denomination}`);
  });

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

describe("corbeille d'un prospect", () => {
  it("« Mettre à la corbeille » demande une confirmation, appelle la route, ferme la fiche et recharge la liste", async () => {
    const c = await ouvrir();
    const avant = requetesListe().length;
    await cliquer(parTexte(c, "button", B2B.denomination!));
    const fiche = c.querySelector(".atl-fiche")!;
    expect(fiche.textContent).toContain("Récupérable 30 jours dans la Corbeille");
    await cliquer(parTexte(fiche, "button", "Mettre à la corbeille"));
    expect(appels.find((a) => a.methode === "POST")).toBeUndefined();
    await cliquer(parTexte(c.querySelector(".atl-fiche")!, "button", "Confirmer"));
    const post = appels.find((a) => a.methode === "POST");
    expect(post!.url).toContain("/corbeille/suppression");
    expect(post!.corps).toEqual({ companyId: ENTREPRISE, type: "prospect", id: B2B.id });
    expect(c.querySelector(".atl-fiche")).toBeNull();
    expect(requetesListe().length).toBeGreaterThan(avant);
  });

  it("« Annuler » ne supprime rien", async () => {
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", B2B.denomination!));
    await cliquer(parTexte(c.querySelector(".atl-fiche")!, "button", "Mettre à la corbeille"));
    await cliquer(parTexte(c.querySelector(".atl-fiche")!, "button", "Annuler"));
    expect(appels.find((a) => a.methode === "POST")).toBeUndefined();
    expect(c.querySelector(".atl-fiche")).not.toBeNull();
  });
});

describe("compte rendu du lead et question au Coordinateur", () => {
  async function ouvrirFiche() {
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", B2B.denomination!));
    return c.querySelector(".atl-fiche")!;
  }

  it("charge le compte rendu à l'ouverture de la fiche et l'affiche sans jargon, confiance et score séparés", async () => {
    const fiche = await ouvrirFiche();
    const lecture = appels.find((a) => a.url.includes("/compte-rendu"))!;
    expect(lecture.methode).toBe("GET");
    expect(lecture.url).toContain(`/prospects/${B2B.id}/compte-rendu?companyId=${ENTREPRISE}`);
    const cr = fiche.querySelector("[aria-label='Compte rendu du lead']")!;
    expect(cr.textContent).toContain("Vérifié : Active (entreprise)");
    expect(cr.textContent).toContain("Source : BCE · bce_rechercher, 15/10/2026");
    expect(cr.textContent).toContain("Pas encore vérifié : Taille connue");
    expect(cr.textContent).toContain("Contraire : Dans une zone de la cible");
    expect(cr.textContent).toContain("Confiance : 40 % (non qualifié, critère contraire)");
    expect(cr.textContent).toContain("Score : Score 55/100, estimation");
    expect(cr.textContent).toContain("L'un ne remplace pas l'autre.");
    expect(cr.textContent).toContain("Aucun signal de moment établi par les sources.");
    expect(cr.textContent).toContain("Responsabilité civile professionnelle. Offre confirmée par le client");
    expect(cr.textContent).toContain("Bureau de Liège (démonstration), Rue de la Démonstration 10, 4000 Liège (même code postal)");
    expect(cr.textContent).toContain("Enrichir : bnb_comptes.");
    expect(cr.textContent).toContain("Données de démonstration");
    expect(cr.textContent).not.toMatch(/[\u2014\u2013]/u);
  });

  it("affiche les signaux de moment avec libellé, date JJ/MM/AAAA et source", async () => {
    const signaux = [
      { code: "creation_recente", libelle: "Entreprise créée récemment", date: "2026-09-03T00:00:00.000Z", source: "BCE" },
      { code: "demenagement", libelle: "Déménagement signalé", date: null, source: "OpenStreetMap" },
    ];
    serveur = (m, url) => (m === "GET" && url.includes("/compte-rendu") ? { statut: 200, corps: { ...COMPTE_RENDU, signaux } } : { statut: 200, corps: page(B2B, B2C) });
    const fiche = await ouvrirFiche();
    const items = Array.from(fiche.querySelectorAll("[aria-label='Compte rendu du lead'] li")).map((li) => li.textContent ?? "");
    expect(fiche.textContent).toContain("Signaux de moment");
    expect(items.some((t) => t.includes("Entreprise créée récemment") && t.includes("BCE") && t.includes("03/09/2026"))).toBe(true);
    expect(items.some((t) => t.includes("Déménagement signalé") && t.includes("OpenStreetMap") && t.includes("date inconnue"))).toBe(true);
    expect(fiche.textContent).not.toContain("Aucun signal de moment établi par les sources.");
  });

  it("sans offre, la raison est affichée", async () => {
    serveur = (m, url) => (m === "GET" && url.includes("/compte-rendu") ? { statut: 200, corps: { ...COMPTE_RENDU, offreRecommandee: null, raisonSansOffre: "Aucune offre de la fiche ne vise le segment de ce prospect." } } : { statut: 200, corps: page(B2B, B2C) });
    const fiche = await ouvrirFiche();
    expect(fiche.textContent).toContain("Aucune offre recommandée : Aucune offre de la fiche ne vise le segment de ce prospect.");
  });

  it("une erreur de lecture est annoncée en role=alert avec un bouton Réessayer", async () => {
    serveur = (m, url) => (m === "GET" && url.includes("/compte-rendu") ? { statut: 500, corps: { code: "erreur_interne", message: "Prospect non conforme au contrat." } } : { statut: 200, corps: page(B2B, B2C) });
    const fiche = await ouvrirFiche();
    const alerte = fiche.querySelector("[aria-label='Compte rendu du lead'] [role='alert']")!;
    expect(alerte.textContent).toContain("compte rendu du lead");
    expect(alerte.textContent).toContain("Réessayer");
  });

  it("« Poser une question » exige une question, appelle la route puis ouvre la discussion de la tâche", async () => {
    serveur = (m, url, corps) =>
      m === "POST" && url.includes("/question")
        ? { statut: 201, corps: { issueId: "i-1", identifiant: "DEM-9", lien: "/issues/DEM-9", ...(corps as object) } }
        : m === "GET" && url.includes("/compte-rendu")
          ? { statut: 200, corps: COMPTE_RENDU }
          : { statut: 200, corps: page(B2B, B2C) };
    const fiche = await ouvrirFiche();
    const bouton = parTexte(fiche, "button", "Poser une question au Coordinateur");
    expect(bouton.getAttribute("aria-disabled")).toBe("true");
    await saisir(champParLibelle(fiche, "Votre question sur ce lead"), "Pourquoi ce lead est-il à 40 % ?");
    await cliquer(bouton);
    const post = appels.find((a) => a.methode === "POST" && a.url.includes("/question"))!;
    expect(post.url).toContain(`/prospects/${B2B.id}/question`);
    expect(post.corps).toEqual({ companyId: ENTREPRISE, question: "Pourquoi ce lead est-il à 40 % ?" });
    expect(pont.navigations).toContain("/issues/DEM-9");
  });

  it("un refus du serveur à la question s'affiche en role=alert et n'ouvre aucune discussion", async () => {
    serveur = (m, url) =>
      m === "POST" && url.includes("/question")
        ? { statut: 403, corps: { code: "elevation_refusee", message: "Une question au Coordinateur sur un lead est réservé à un humain." } }
        : m === "GET" && url.includes("/compte-rendu")
          ? { statut: 200, corps: COMPTE_RENDU }
          : { statut: 200, corps: page(B2B, B2C) };
    const fiche = await ouvrirFiche();
    await saisir(champParLibelle(fiche, "Votre question sur ce lead"), "Une question ?");
    await cliquer(parTexte(fiche, "button", "Poser une question au Coordinateur"));
    expect(fiche.querySelector("[role='alert']")!.textContent).toContain("question au Coordinateur");
    expect(pont.navigations).toEqual([]);
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

  it("sans base clients, aucun bouton de suppression n'est proposé", async () => {
    serveur = (m, u) => (m === "GET" && u.includes("/base-clients?") ? { statut: 200, corps: { existe: false, clients: 0, actifs: 0, importId: null, nomFichier: null, format: null, importeLe: null, importePar: null, purgeLe: null, finalite: null, dureeConservationMois: null, mode: null, aPurger: false } } : { statut: 200, corps: page() });
    const c = await ouvrirBase();
    expect(Array.from(c.querySelectorAll("button")).some((b) => b.textContent?.includes("Supprimer la base clients"))).toBe(false);
  });

  it("la suppression exige la confirmation exacte, puis envoie la demande", async () => {
    const baseExistante = { existe: true, clients: 1234, actifs: 1100, importId: "c1111111-1111-4111-8111-111111111111", nomFichier: "base-2026.csv", format: "csv", importeLe: "2026-10-01T10:00:00.000Z", importePar: "local-board", purgeLe: "2027-10-01T10:00:00.000Z", finalite: "Suivi de la clientèle existante", dureeConservationMois: 12, mode: "reel", aPurger: false };
    serveur = (m, u) => (m === "POST" && u.endsWith("/base-clients/suppression") ? { statut: 200, corps: { supprimee: true } } : m === "GET" && u.includes("/base-clients?") ? { statut: 200, corps: baseExistante } : { statut: 200, corps: page() });
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
    expect(c.textContent).toContain("Aucune base clients");
    expect(c.textContent).toContain("Importez un fichier CSV ou Excel pour exclure vos clients actuels et repérer les ventes croisées.");
    expect(parTexte(c, "button", "Importer un fichier")).toBeTruthy();
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
    expect(c.textContent).toContain("Règles : auto sans habitation (particulier).");
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

  it("libellé de score : chance mesurée avec fourchette et effectif séparé par milliers, ou estimation annoncée", () => {
    const mesure = structuredClone(PROSPECT_B2C.score!) as Parameters<typeof libelleScore>[0];
    mesure.etalonnage!.effectif = 1420;
    expect(libelleScore(mesure)).toBe("18 % de chances (entre 12 et 26 %), mesuré sur 1\u00a0420 dossiers");
    const estimation = { ...mesure, valeur: 72, nature: "estimation" as const, etalonnage: null };
    expect(libelleScore(estimation)).toBe("Score 72/100, estimation (pas assez d'historique)");
  });

  it("la liste montre la probabilité mesurée avec ses bornes, jamais pour une estimation", async () => {
    const c = await ouvrir();
    const lignes = [...c.querySelectorAll("tbody tr")];
    const mesuree = lignes.find((l) => l.textContent?.includes("70/100"))!;
    expect(mesuree.textContent).toContain("18 % de chances (entre 12 et 26 %), mesuré sur 412 dossiers");
    const estimee = lignes.find((l) => l.textContent?.includes("55/100"))!;
    expect(estimee.textContent).not.toContain("probabilité mesurée");
  });
});

describe("confiance de qualification", () => {
  const H = "2026-10-15T10:00:00.000Z";
  const critere = (code: string, statut: string, poids: number) => ({ code, libelle: code, statut, poids, sourceId: null, source: "test", detail: "test" });
  const confiance = (valeur: number, manquants: number, o: Record<string, unknown> = {}) =>
    ConfianceQualification.parse({ valeur, qualifie: valeur >= 90, plafonnee: false, seuil: 90, calculeLe: H, criteres: [critere("entreprise_active", "verifie", 20), ...Array.from({ length: manquants }, (_, i) => critere(["taille_connue", "zone_cible", "segment_cible"][i]!, "non_verifie", 10))], ...o });
  const qualifie = { ...structuredClone(B2B), confiance: confiance(92, 0) };
  const aEnrichir = { ...structuredClone(B2C), confiance: confiance(64, 2) };

  it("colonne « Statut du lead » : badge « Qualifié » et « À vérifier », avec les deux chiffres dessous", async () => {
    serveur = () => ({ statut: 200, corps: page(qualifie, aEnrichir) });
    const c = await ouvrir();
    const entetes = [...c.querySelectorAll("thead th")].map((th) => th.textContent);
    expect(entetes.some((t) => t?.startsWith("Statut du lead"))).toBe(true);
    const lignes = c.querySelectorAll("tbody tr");
    const ligneB2B = [...lignes].find((l) => l.textContent?.includes("55/100"))!;
    const ligneB2C = [...lignes].find((l) => l.textContent?.includes("70/100"))!;
    const celluleB2B = ligneB2B.querySelector('td[data-libelle="Statut du lead"]')!.textContent!;
    const celluleB2C = ligneB2C.querySelector('td[data-libelle="Statut du lead"]')!.textContent!;
    expect(celluleB2B).toContain("Qualifié");
    expect(celluleB2B).toContain("Cible prouvée à 92 %");
    expect(celluleB2C).toContain("À vérifier");
    expect(celluleB2C).toContain("il manque 2 critères");
    expect(celluleB2C).toContain("Cible prouvée à 64 %");
    // La priorité (ex-score) reste affichée, inchangée.
    expect(celluleB2B).toContain("Priorité 55/100 (estimation)");
    expect(celluleB2C).toContain("Priorité 70/100 (mesurée)");
    // Bulle d'aide : la différence entre cible prouvée et chance de signer.
    expect(c.querySelector('[title*="Ce n\'est pas sa chance de signer"]')).toBeTruthy();
  });

  it("colonne « Étape » : un lead à l'étape « qualifie » mais à vérifier affiche « Retenu » et « À vérifier », jamais deux « Qualifié »", async () => {
    const retenuAVerifier = { ...structuredClone(B2C), statut: "qualifie", confiance: confiance(64, 2) };
    serveur = () => ({ statut: 200, corps: page(retenuAVerifier) });
    const c = await ouvrir();
    const entetes = [...c.querySelectorAll("thead th")].map((th) => th.textContent);
    expect(entetes).toContain("Étape");
    expect(entetes).not.toContain("Statut");
    const ligne = c.querySelector("tbody tr")!;
    expect(ligne.querySelector('td[data-libelle="Étape"]')!.textContent).toBe("Retenu");
    expect(ligne.querySelector('td[data-libelle="Statut du lead"]')!.textContent).toContain("À vérifier");
    expect(ligne.textContent).not.toContain("Qualifié");
  });

  it("explication de la confiance à côté du chiffre : critères vérifiés sur total, contraires, source qui manque surtout", async () => {
    const contraire = { ...structuredClone(B2B), confiance: confiance(50, 0, { plafonnee: true, criteres: [critere("entreprise_active", "verifie", 20), critere("zone_cible", "contraire", 15), critere("taille_connue", "non_verifie", 10)] }) };
    serveur = () => ({ statut: 200, corps: page(qualifie, aEnrichir, { ...contraire, id: "b2222222-2222-4222-8222-222222222222" }) });
    const c = await ouvrir();
    const textes = [...c.querySelectorAll(".atl-confiance-explication")].map((e) => e.textContent);
    expect(textes).toContain("92 % : 1 critère vérifié sur 1");
    expect(textes).toContain("64 % : 1 critère vérifié sur 3 ; manque surtout : comptes annuels BNB");
    expect(textes).toContain("50 % : 1 critère vérifié sur 3, 1 contraire ; manque surtout : comptes annuels BNB");
    expect(textes.join(" ")).not.toContain("\u2014");
  });

  it("un critère contraire est annoncé : non qualifié, pas « à enrichir »", async () => {
    const contraire = { ...structuredClone(B2B), confiance: confiance(50, 0, { plafonnee: true, criteres: [critere("entreprise_active", "verifie", 20), critere("zone_cible", "contraire", 15)] }) };
    serveur = () => ({ statut: 200, corps: page(contraire) });
    const c = await ouvrir();
    const cellule = c.querySelector('td[data-libelle="Statut du lead"]')!.textContent!;
    expect(cellule).toContain("Écarté");
    expect(cellule).toContain("zone_cible");
    expect(cellule).toContain("Cible prouvée à 50 %");
    expect(cellule).not.toContain("À vérifier");
  });

  it("tri par confiance : le plus haut d'abord, puis inversé", async () => {
    serveur = () => ({ statut: 200, corps: page(aEnrichir, qualifie) });
    const c = await ouvrir();
    await cliquer(parTexte(c, "th button", "Confiance"));
    const ordre = () => [...c.querySelectorAll('tbody td[data-libelle="Statut du lead"]')].map((td) => td.textContent);
    expect(ordre()[0]).toContain("Cible prouvée à 92 %");
    await cliquer(parTexte(c, "th button", "Confiance"));
    expect(ordre()[0]).toContain("Cible prouvée à 64 %");
  });

  it("statutLead : Qualifié, Écarté (exclu, refusé ou critère contraire) et À vérifier", () => {
    expect(statutLead(qualifie as never)).toEqual({ cle: "qualifie", libelle: "Qualifié", detail: null });
    expect(statutLead(aEnrichir as never)).toEqual({ cle: "a_verifier", libelle: "À vérifier", detail: "il manque 2 critères" });
    const unSeul = { ...structuredClone(B2C), confiance: confiance(70, 1) };
    expect(statutLead(unSeul as never).detail).toBe("il manque 1 critère");
    const sansConfiance = { ...structuredClone(B2C), confiance: undefined };
    expect(statutLead(sansConfiance as never)).toEqual({ cle: "a_verifier", libelle: "À vérifier", detail: null });
    const contraire = { ...structuredClone(B2B), confiance: confiance(50, 0, { plafonnee: true, criteres: [critere("zone_cible", "contraire", 15)] }) };
    expect(statutLead(contraire as never)).toEqual({ cle: "ecarte", libelle: "Écarté", detail: "zone_cible" });
    const exclu = { ...structuredClone(qualifie), statut: "exclu", motifsExclusion: [{ motif: "doublon", detail: "déjà en base" }] };
    expect(statutLead(exclu as never)).toMatchObject({ cle: "ecarte", libelle: "Écarté" });
    expect(statutLead(exclu as never).detail).toBeTruthy();
    const refuse = { ...structuredClone(qualifie), statut: "refuse" };
    expect(statutLead(refuse as never)).toEqual({ cle: "ecarte", libelle: "Écarté", detail: "écarté par un humain" });
  });

  it("la fiche montre le badge en grand, les deux chiffres et la phrase d'explication", async () => {
    serveur = (methode, url) => (methode === "GET" && url.includes("/compte-rendu") ? { statut: 200, corps: COMPTE_RENDU } : { statut: 200, corps: page(qualifie) });
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", B2B.denomination!));
    const bloc = c.querySelector("[aria-label='Statut du lead']")!;
    expect(bloc.querySelector(".atl-statut-lead-grand")!.textContent).toContain("Qualifié");
    expect(bloc.textContent).toContain("Priorité 55/100 (estimation)");
    expect(bloc.textContent).toContain("Cible prouvée à 92 %");
    expect(bloc.textContent).toContain(EXPLICATION_STATUT_LEAD);
    expect(EXPLICATION_STATUT_LEAD).toBe("La cible prouvée dit si ce lead correspond à votre cible, sources à l'appui (qualifié à 90 % et plus). La priorité dit par qui commencer. On ne contacte jamais un lead qui n'est pas qualifié.");
  });

  it("filtre « Qualifiés (≥ 90 %) » : la requête porte qualifiesSeulement, l'effacement le retire", async () => {
    const c = await ouvrir();
    expect(new URL(requetesListe().at(-1)!.url, "http://x").searchParams.get("qualifiesSeulement")).toBeNull();
    const case_ = [...c.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((i) => i.parentElement?.textContent?.includes("Qualifiés (≥ 90 %)"))!;
    await cliquer(case_);
    await cliquer(parTexte(c, "button", "Filtrer"));
    expect(new URL(requetesListe().at(-1)!.url, "http://x").searchParams.get("qualifiesSeulement")).toBe("true");
    await cliquer(parTexte(c, "button", "Réinitialiser les filtres"));
    expect(new URL(requetesListe().at(-1)!.url, "http://x").searchParams.get("qualifiesSeulement")).toBeNull();
  });
});

describe("fiche : décision humaine sur un critère de qualification", () => {
  const H = "2026-10-15T10:00:00.000Z";
  const critere = (code: string, libelle: string, statut: string, source = "BCE · bce_rechercher", detail = "Registre") => ({ code, libelle, statut, poids: 20, sourceId: null, source, detail });
  const avecConfiance = (criteres: Array<{ statut: string }>) => ({
    ...structuredClone(B2B),
    confiance: ConfianceQualification.parse({ valeur: 40, qualifie: false, plafonnee: criteres.some((x) => x.statut === "contraire"), seuil: 90, calculeLe: H, criteres }),
  });
  const calcule = avecConfiance([critere("entreprise_active", "Entreprise active", "verifie"), critere("certifie_qualite", "Certifié qualité (personnalisé)", "non_verifie", "agent", "Évalué par l'agent le 16/10/2026 : à confirmer")]);
  const humain = avecConfiance([critere("entreprise_active", "Entreprise active", "contraire", "humain", "Décision humaine de Jean-Baptiste le 16/10/2026 : fermée selon le client")]);

  async function ouvrirFiche(prospect: unknown) {
    serveur = (methode, url) => (methode === "GET" && url.includes("/compte-rendu") ? { statut: 200, corps: COMPTE_RENDU } : { statut: 200, corps: page(prospect) });
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", B2B.denomination!));
    return c.querySelector(".atl-fiche")!;
  }
  const ligneCritere = (fiche: Element, code: string) => fiche.querySelector(`.atl-critere[data-code="${code}"]`)!;

  it("« Modifier » ouvre le formulaire, focus sur le premier champ, Échap le ferme ; les critères personnalisés y figurent", async () => {
    const fiche = await ouvrirFiche(calcule);
    const ligne = ligneCritere(fiche, "certifie_qualite");
    expect(ligne.textContent).toContain("Certifié qualité (personnalisé)");
    expect(ligne.textContent).toContain("Source : agent");
    expect(fiche.querySelector("form")).toBeNull();
    await cliquer(parTexte(ligne, "button", "Modifier"));
    const form = ligne.querySelector("form")!;
    expect(form).not.toBeNull();
    expect(document.activeElement).toBe(champParLibelle(form, "Statut du critère"));
    await act(async () => {
      form.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(fiche.querySelector("form")).toBeNull();
  });

  it("enregistrer envoie le PATCH attendu puis recharge le lead", async () => {
    const fiche = await ouvrirFiche(calcule);
    const listesAvant = requetesListe().length;
    await cliquer(parTexte(ligneCritere(fiche, "certifie_qualite"), "button", "Modifier"));
    const form = fiche.querySelector("form")!;
    await saisir(champParLibelle(form, "Statut du critère"), "verifie");
    await saisir(champParLibelle(form, "Justification"), "  Certificat vu au cabinet  ");
    await cliquer(parTexte(form, "button", "Enregistrer la décision"));
    const patch = appels.find((a) => a.methode === "PATCH")!;
    expect(patch.url).toContain(`/prospects/${B2B.id}/criteres/certifie_qualite`);
    expect(patch.corps).toEqual({ companyId: ENTREPRISE, statut: "verifie", justification: "Certificat vu au cabinet" });
    expect(requetesListe().length).toBe(listesAvant + 1);
    expect(fiche.querySelector("form")).toBeNull();
  });

  it("une justification vide ou trop courte est refusée côté interface : aucun appel", async () => {
    const fiche = await ouvrirFiche(calcule);
    await cliquer(parTexte(ligneCritere(fiche, "certifie_qualite"), "button", "Modifier"));
    const form = fiche.querySelector("form")!;
    const bouton = parTexte(form, "button", "Enregistrer la décision") as HTMLButtonElement;
    expect(bouton.getAttribute("aria-disabled")).toBe("true");
    await saisir(champParLibelle(form, "Justification"), " a ");
    expect(bouton.getAttribute("aria-disabled")).toBe("true");
    await cliquer(bouton);
    expect(appels.some((a) => a.methode === "PATCH")).toBe(false);
  });

  it("« Revenir au calcul automatique » n'existe que sur une décision humaine et envoie le DELETE", async () => {
    const fiche = await ouvrirFiche(humain);
    expect(ligneCritere(fiche, "entreprise_active").textContent).toContain("Source : humain");
    const listesAvant = requetesListe().length;
    await cliquer(parTexte(ligneCritere(fiche, "entreprise_active"), "button", "Revenir au calcul automatique"));
    const suppression = appels.find((a) => a.methode === "DELETE")!;
    expect(suppression.url).toContain(`/prospects/${B2B.id}/criteres/entreprise_active?companyId=${ENTREPRISE}`);
    expect(requetesListe().length).toBe(listesAvant + 1);
  });

  it("pas de retour au calcul sur un critère calculé", async () => {
    const fiche = await ouvrirFiche(calcule);
    expect(fiche.textContent).not.toContain("Revenir au calcul automatique");
  });

  it("une erreur du serveur est affichée sans planter, le formulaire reste ouvert", async () => {
    const fiche = await ouvrirFiche(calcule);
    const base = serveur;
    serveur = (methode, url, corps) => (methode === "PATCH" ? { statut: 422, corps: { erreur: "Ce critère est désactivé dans les réglages." } } : base(methode, url, corps));
    await cliquer(parTexte(ligneCritere(fiche, "entreprise_active"), "button", "Modifier"));
    const form = fiche.querySelector("form")!;
    await saisir(champParLibelle(form, "Justification"), "Essai refusé");
    await cliquer(parTexte(form, "button", "Enregistrer la décision"));
    expect(fiche.querySelector("form [role='alert']")!.textContent).toContain("Ce critère est désactivé dans les réglages.");
  });

  it("l'erreur d'un retour au calcul est affichée", async () => {
    const fiche = await ouvrirFiche(humain);
    const base = serveur;
    serveur = (methode, url, corps) => (methode === "DELETE" ? { statut: 403, corps: { erreur: "Réservé aux humains." } } : base(methode, url, corps));
    await cliquer(parTexte(ligneCritere(fiche, "entreprise_active"), "button", "Revenir au calcul automatique"));
    expect(ligneCritere(fiche, "entreprise_active").querySelector("[role='alert']")!.textContent).toContain("Réservé aux humains.");
  });

  it("un changement de lead alors qu'une fiche est ouverte ramène la nouvelle fiche à l'écran (scrollIntoView rappelé)", async () => {
    const defilement = vi.fn();
    Element.prototype.scrollIntoView = defilement;
    try {
      const c = await ouvrir();
      await cliquer(parTexte(c, "button", B2B.denomination!));
      const apresPremiere = defilement.mock.calls.length;
      expect(apresPremiere).toBeGreaterThan(0);
      expect(defilement.mock.contexts.at(-1)).toBe(c.querySelector(".atl-fiche"));
      await cliquer(parTexte(c, "button", /\[client-7f3a\]/u));
      expect(c.querySelector(".atl-fiche")!.getAttribute("aria-label")).toContain("[client-7f3a]");
      expect(defilement.mock.calls.length).toBeGreaterThan(apresPremiere);
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});
