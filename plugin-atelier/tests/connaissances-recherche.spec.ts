/**
 * Lot R4 : recherche hybride (fonctions pures + requêtes contre un faux exécuteur).
 *
 * Le faux exécuteur n'applique un filtre QUE si le SQL généré le contient (fragment reconnu) : un filtre
 * oublié dans la requête laisse donc passer les lignes interdites et fait échouer les tests.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { CONSIGNE_PASSAGE, ResultatRechercheConnaissances } from "../src/contrats/connaissances.js";
import { normaliser, sansAccents, versBase64 } from "../src/connaissances/vecteurs.js";
import {
  CacheVecteurs,
  MOTIF_AUCUNE_SOURCE,
  appliquerSeuil,
  construireCitation,
  fusionRrf,
  rechercherConnaissances,
  requeteMotsCles,
  seuilTermes,
  termesSignificatifs,
  type ContexteRecherche,
  type DependancesRecherche,
  type LignePassage,
} from "../src/serveur/connaissances/recherche.js";
import type { Vectoriseur } from "../src/serveur/connaissances/vectorisation.js";

/* ------------------------------------------------------------------ */
/* Faux monde                                                          */
/* ------------------------------------------------------------------ */

const ENT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ENT_B = "bbbbbbbb-0000-4000-8000-000000000002";
const EMPREINTE_MODELE = "e".repeat(64);
const DIM = 4;
let compteur = 0;
const uuid = (prefixe: string) => `${prefixe}-0000-4000-8000-${String(++compteur).padStart(12, "0")}`;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

interface PassageFaux {
  id: string;
  company_id: string;
  document_id: string;
  version_id: string;
  version: number;
  texte: string;
  texte_normalise: string;
  langue: "fr" | "nl";
  page: number | null;
  section: string | null;
  empreinte: string;
  injections_signalees: unknown;
  index_id: string | null;
  vecteur: Float32Array | null;
  // version et document joints
  v_active: boolean;
  v_statut: "en_vigueur" | "a_venir" | "perime" | "retire";
  v_valide_du: string;
  v_valide_au: string | null;
  v_date_document: string;
  v_mode: "demonstration" | "reel";
  d_titre: string;
  d_type: string;
  d_produit: string | null;
  d_mode: "demonstration" | "reel";
}

interface IndexFaux {
  id: string;
  company_id: string;
  fournisseur: "aucun" | "local" | "voyage";
  modele: string | null;
  empreinte_modele: string | null;
  dimension: number | null;
  version_index: number;
  actif: boolean;
}

function passage(company: string, indexId: string | null, texte: string, vecteur: number[] | null, plus: Partial<PassageFaux> = {}): PassageFaux {
  return {
    id: uuid("cccccccc"),
    company_id: company,
    document_id: uuid("dddddddd"),
    version_id: uuid("eeeeeeee"),
    version: 1,
    texte,
    texte_normalise: sansAccents(texte),
    langue: "fr",
    page: 1,
    section: null,
    empreinte: sha(texte),
    injections_signalees: [],
    index_id: vecteur ? indexId : null,
    vecteur: vecteur ? normaliser(Float32Array.from(vecteur)) : null,
    v_active: true,
    v_statut: "en_vigueur",
    v_valide_du: "2026-01-01",
    v_valide_au: null,
    v_date_document: "2025-12-15",
    v_mode: "demonstration",
    d_titre: "Conditions générales auto",
    d_type: "conditions_generales",
    d_produit: "auto",
    d_mode: "demonstration",
    ...plus,
  };
}

function index(company: string, plus: Partial<IndexFaux> = {}): IndexFaux {
  return {
    id: uuid("ffffffff"),
    company_id: company,
    fournisseur: "local",
    modele: "Xenova/bge-m3",
    empreinte_modele: EMPREINTE_MODELE,
    dimension: DIM,
    version_index: 1,
    actif: true,
    ...plus,
  };
}

const MOTIF_INTERDIT = /\b(insert|update|delete|alter|create|drop|truncate)\b/;

/** Faux `ctx.db.query` : interprète les fragments SQL produits par le module. */
function fauxExecuteur(monde: { passages: PassageFaux[]; index: IndexFaux[] }) {
  const journal: { sql: string; params: unknown[] }[] = [];
  const executer = async (sql: string, params: unknown[]) => {
    journal.push({ sql, params });
    const n = sql.replace(/\s+/g, " ");
    const p = (i: number) => params[i - 1];

    if (n.includes(".connaissances_index i")) {
      return monde.index
        .filter((i) => (!n.includes("i.company_id = $1") || i.company_id === p(1)) && (!n.includes("i.actif") || i.actif))
        .slice(0, 1)
        .map((i) => ({ ...i }));
    }

    if (n.includes("encode(p.vecteur, 'base64')")) {
      return monde.passages
        .filter((x) => !n.includes("p.company_id = $1") || x.company_id === p(1))
        .filter((x) => x.vecteur && x.index_id === p(2))
        .filter((x) => !n.includes("p.id > $4") || x.id > String(p(4)))
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .slice(0, Number(p(3)))
        .map((x) => ({ id: x.id, vecteur: versBase64(x.vecteur!) }));
    }

    // Requêtes filtrées (mots-clés, identifiants retenus, détails).
    let lignes = monde.passages.filter((x) => {
      if (n.includes("p.company_id = $1") && x.company_id !== p(1)) return false;
      if (n.includes("v.company_id = $1") && x.company_id !== p(1)) return false;
      if (n.includes("d.company_id = $1") && x.company_id !== p(1)) return false;
      if (/\bv\.active\b/.test(n) && !x.v_active) return false;
      if (n.includes("d.mode = $2") && x.d_mode !== p(2)) return false;
      if (n.includes("v.mode = $2") && x.v_mode !== p(2)) return false;
      const ref = String(p(3));
      const valide = x.v_valide_du <= ref && (x.v_valide_au === null || x.v_valide_au > ref);
      if (n.includes("v.statut = 'en_vigueur' AND (v.valide_du <= $3::date") && !(x.v_statut === "en_vigueur" && valide)) return false;
      if (n.includes("(v.statut <> 'en_vigueur' OR (v.valide_du <= $3::date") && !(x.v_statut !== "en_vigueur" || valide)) return false;
      for (const m of n.matchAll(/\b([pd])\.(\w+) IN \(SELECT \(jsonb_array_elements_text\(\$(\d+)::jsonb\)\)::\w+\)/g)) {
        const champ = m[1] === "p" ? m[2]! : `d_${m[2]}`;
        const valeur = (x as unknown as Record<string, unknown>)[champ];
        if (!(JSON.parse(String(p(Number(m[3])))) as unknown[]).includes(valeur)) return false;
      }
      const idx = /p\.index_id = \$(\d+)/.exec(n);
      if (idx && x.index_id !== p(Number(idx[1]))) return false;
      if (n.includes("p.vecteur IS NOT NULL") && !x.vecteur) return false;
      return true;
    });

    if (n.includes("websearch_to_tsquery")) {
      // Reproduit la requête tolérante : termes en JSON, seuil, limite = trois derniers paramètres.
      const termes = JSON.parse(String(params[params.length - 3])) as string[];
      const seuil = Number(params[params.length - 2]);
      const lim = Number(params[params.length - 1]);
      return lignes
        .map((x) => ({ x, mots: x.texte_normalise.split(/[^\p{L}\p{N}]+/u) }))
        .map(({ x, mots: ms }) => ({
          x,
          nb: termes.filter((m) => ms.includes(m)).length,
          score: termes.reduce((s, m) => s + ms.filter((y) => y === m).length, 0),
        }))
        .filter(({ nb }) => nb > 0 && nb >= seuil)
        .map(({ x, nb, score }) => ({ id: x.id, nb, score }))
        .sort((a, b) => b.nb - a.nb || b.score - a.score || (a.id < b.id ? -1 : 1))
        .slice(0, lim)
        .map(({ id, score }) => ({ id, score }));
    }
    if (n.startsWith("SELECT p.id FROM")) return lignes.map((x) => ({ id: x.id }));
    if (n.includes("to_char(v.date_document")) {
      lignes = lignes.filter((x) => (JSON.parse(String(p(params.length))) as string[]).includes(x.id));
      return lignes.map((x) => ({
        id: x.id,
        document_id: x.document_id,
        version: x.version,
        titre: x.d_titre,
        type: x.d_type,
        date_document: x.v_date_document,
        valide_du: x.v_valide_du,
        valide_au: x.v_valide_au,
        statut: x.v_statut,
        page: x.page,
        section: x.section,
        empreinte: x.empreinte,
        texte: x.texte,
        injections_signalees: x.injections_signalees,
      }));
    }
    throw new Error(`Requête inattendue : ${n}`);
  };
  return { executer, journal };
}

function fauxVectoriseur(versVecteur: (q: string) => number[], type: "local" | "aucun" = "local") {
  const appels: string[] = [];
  const v: Vectoriseur = {
    type,
    empreinte: type === "aucun" ? null : EMPREINTE_MODELE,
    dimension: type === "aucun" ? 0 : DIM,
    async vectoriser(textes) {
      if (type === "aucun") throw new Error("Aucune vectorisation configurée");
      appels.push(...textes);
      return textes.map((t) => Float32Array.from(versVecteur(t)));
    },
    async arreter() {},
  };
  return { v, appels };
}

function deps(executer: DependancesRecherche["executer"], vectoriseur: Vectoriseur, cache = new CacheVecteurs()): DependancesRecherche {
  return { executer, vectoriseur, cache, maintenant: () => new Date("2026-10-15T10:00:00Z") };
}

const CTX_A: ContexteRecherche = { companyId: ENT_A, mode: "demonstration" };
const CTX_B: ContexteRecherche = { companyId: ENT_B, mode: "demonstration" };

/** Le résultat complété (sources fictives) doit respecter le contrat. */
function valider(r: Awaited<ReturnType<typeof rechercherConnaissances>>) {
  const complet = { ...r, sourceIds: r.passages.map((_, i) => `99999999-0000-4000-8000-${String(i).padStart(12, "0")}`) };
  expect(() => ResultatRechercheConnaissances.parse(complet)).not.toThrow();
}

/* ------------------------------------------------------------------ */
/* Fonctions pures                                                     */
/* ------------------------------------------------------------------ */

describe("fusion RRF (calculs à la main, k = 60)", () => {
  it("cas 1 : présences croisées", () => {
    // A : 1/61 + 1/62 ; C : 1/63 + 1/61 ; B : 1/62.
    const f = fusionRrf(["A", "B", "C"], ["C", "A"]);
    expect(f.map((e) => e.id)).toEqual(["A", "C", "B"]);
    expect(f[0]!.rrf).toBeCloseTo(1 / 61 + 1 / 62, 15);
    expect(f[1]!.rrf).toBeCloseTo(1 / 61 + 1 / 63, 15);
    expect(f[2]!.rrf).toBeCloseTo(1 / 62, 15);
    expect(f[0]).toMatchObject({ rangTexte: 1, rangSens: 2 });
    expect(f[2]).toMatchObject({ rangTexte: 2, rangSens: null });
  });

  it("cas 2 : égalité exacte entre listes, le mot-clé passe devant, puis l'identifiant", () => {
    // texte [A], sens [B] : 1/61 chacun ; même meilleur rang ; A vient de la liste mots-clés.
    expect(fusionRrf(["A"], ["B"]).map((e) => [e.id, e.rrf])).toEqual([
      ["A", 1 / 61],
      ["B", 1 / 61],
    ]);
    // texte [Y, X], sens [X, Y] : 1/61 + 1/62 chacun ; tout égal ⇒ ordre des identifiants.
    const f = fusionRrf(["Y", "X"], ["X", "Y"]);
    expect(f.map((e) => e.id)).toEqual(["X", "Y"]);
    expect(f[0]!.rrf).toBe(f[1]!.rrf);
  });

  it("cas 3 : 1/61 + 1/63 > 2/62 et égalité symétrique P = R", () => {
    // P : 1/61 + 1/63 ≈ 0,0322662 ; R : idem ; Q : 2/62 ≈ 0,0322581.
    const f = fusionRrf(["P", "Q", "R"], ["R", "Q", "P"]);
    expect(f.map((e) => e.id)).toEqual(["P", "R", "Q"]);
    expect(f[2]!.rrf).toBeCloseTo(2 / 62, 15);
    expect(f[0]!.rrf - f[2]!.rrf).toBeCloseTo(1 / 61 + 1 / 63 - 2 / 62, 15);
  });

  it("cas 4 : un identifiant répété garde son premier rang ; listes vides", () => {
    const f = fusionRrf(["A", "A", "B"], []);
    expect(f.map((e) => [e.id, e.rangTexte])).toEqual([
      ["A", 1],
      ["B", 2],
    ]);
    expect(fusionRrf([], [])).toEqual([]);
  });

  it("seuil et nombre", () => {
    const f = fusionRrf(["A", "B", "C"], []);
    expect(appliquerSeuil(f, 1 / 62, 8).map((e) => e.id)).toEqual(["A", "B"]);
    expect(appliquerSeuil(f, 0, 2).map((e) => e.id)).toEqual(["A", "B"]);
    expect(appliquerSeuil(f, 1, 8)).toEqual([]);
  });

  it("citation : adresse connaissance:// et « périmé » ⇔ hors vigueur", () => {
    const ligne: LignePassage = {
      id: "C1C1C1C1-0000-4000-8000-000000000001",
      document_id: "D1D1D1D1-0000-4000-8000-000000000001",
      version: 3,
      titre: "Tarif",
      type: "tarif",
      date_document: "2025-01-01",
      valide_du: "2025-01-01",
      valide_au: "2026-01-01",
      statut: "perime",
      page: null,
      section: "Art. 2",
      empreinte: "a".repeat(64),
      texte: "x",
      injections_signalees: [],
    };
    const c = construireCitation(ligne);
    expect(c.adresse).toBe("connaissance://d1d1d1d1-0000-4000-8000-000000000001/v3#c1c1c1c1-0000-4000-8000-000000000001");
    expect(c.perime).toBe(true);
    expect(construireCitation({ ...ligne, statut: "en_vigueur" }).perime).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Recherche contre le faux exécuteur                                  */
/* ------------------------------------------------------------------ */

describe("recherche plein texte tolérante : termes significatifs et seuil", () => {
  it("retire les mots vides français, les lettres isolées et les doublons ; garde l'ordre", () => {
    expect(termesSignificatifs(sansAccents("garanties de l'assurance habitation Courtier Direct pour un propriétaire"))).toEqual([
      "garanties", "assurance", "habitation", "courtier", "direct", "proprietaire",
    ]);
    expect(termesSignificatifs("assurance assurance habitation")).toEqual(["assurance", "habitation"]);
    // Question faite seulement de mots courants : on garde les mots d'au moins deux caractères.
    expect(termesSignificatifs("pour les")).toEqual(["pour", "les"]);
    expect(termesSignificatifs("a !")).toEqual([]);
  });

  it("seuil : la moitié arrondie au supérieur, au moins 1", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(seuilTermes)).toEqual([1, 1, 1, 2, 2, 3, 3, 4]);
  });

  it("la question longue naturelle trouve les passages de « assurance habitation propriétaire » ; la question sans rapport ne trouve rien", async () => {
    const idx = index(ENT_A);
    const cible = passage(ENT_A, idx.id, "Garanties de l'assurance habitation du propriétaire : incendie, dégâts des eaux", null);
    const cible2 = passage(ENT_A, idx.id, "Assurance habitation propriétaire non occupant : conditions", null);
    const partiel = passage(ENT_A, idx.id, "Assurance auto : franchise et bonus", null); // 1 terme sur 6 : sous le seuil (3)
    const { executer } = fauxExecuteur({ passages: [cible, cible2, partiel], index: [index(ENT_A, { fournisseur: "aucun", modele: null, empreinte_modele: null, dimension: null })] });
    const { v } = fauxVectoriseur(() => [1, 0, 0, 0], "aucun");

    const longue = await rechercherConnaissances(deps(executer, v), CTX_A, {
      question: "garanties de l'assurance habitation Courtier Direct pour un propriétaire",
    });
    expect(longue.aucuneSource).toBe(false);
    expect(longue.passages.map((p) => p.texte).sort()).toEqual([cible.texte, cible2.texte].sort());
    // Classement : le passage qui contient le plus de termes passe devant.
    expect(longue.passages[0]!.texte).toBe(cible.texte);
    valider(longue);

    // La formulation courte d'origine donne toujours les mêmes passages.
    const courte = await rechercherConnaissances(deps(executer, v), CTX_A, { question: "assurance habitation propriétaire" });
    expect(courte.passages.map((p) => p.texte).sort()).toEqual([cible.texte, cible2.texte].sort());

    const horsSujet = await rechercherConnaissances(deps(executer, v), CTX_A, { question: "recette de tarte aux pommes" });
    expect(horsSujet.passages).toEqual([]);
    expect(horsSujet.aucuneSource).toBe(true);
    expect(horsSujet.motifAucuneSource).toBe(MOTIF_AUCUNE_SOURCE);

    // Une question faite uniquement de mots vides ne plante pas et ne rend rien de farfelu.
    const vide = await rechercherConnaissances(deps(executer, v), CTX_A, { question: "de la pour" });
    expect(vide.aucuneSource).toBe(true);
  });

  it("la requête SQL porte les termes en JSON, le seuil et la limite, sans tableau JS", () => {
    const { sql, params } = requeteMotsCles(
      { companyId: ENT_A, mode: "demonstration" },
      { dateReference: "2026-10-15", inclurePerimes: false },
      ["garanties", "assurance", "habitation", "proprietaire"],
      50,
    );
    expect(params.slice(-3)).toEqual([JSON.stringify(["garanties", "assurance", "habitation", "proprietaire"]), 2, 50]);
    expect(sql).toContain("c.nb >= $5::int");
    expect(sql).toContain("ORDER BY c.nb DESC");
  });
});

describe("recherche hybride", () => {
  it("rend des passages cités, non fiables, avec la consigne ; 8 par défaut, 20 au plus", async () => {
    const idx = index(ENT_A);
    const passages = Array.from({ length: 25 }, (_, i) => passage(ENT_A, idx.id, `franchise indexee clause ${i}`, [1, 0, 0, i / 100]));
    const { executer } = fauxExecuteur({ passages, index: [idx] });
    const { v } = fauxVectoriseur(() => [1, 0, 0, 0]);
    const r = await rechercherConnaissances(deps(executer, v), CTX_A, { question: "Franchise indexée" });
    expect(r.passages).toHaveLength(8);
    expect(r.aucuneSource).toBe(false);
    for (const p of r.passages) {
      expect(p.nonFiable).toBe(true);
      expect(p.consigne).toBe(CONSIGNE_PASSAGE);
      expect(p.citation.adresse.startsWith("connaissance://")).toBe(true);
      expect(p.classement.rangTexte).not.toBeNull();
    }
    valider(r);
    const r20 = await rechercherConnaissances(deps(executer, v), CTX_A, { question: "Franchise indexée", nombre: 20 });
    expect(r20.passages).toHaveLength(20);
    await expect(rechercherConnaissances(deps(executer, v), CTX_A, { question: "franchise", nombre: 21 })).rejects.toThrow();
  });

  it("filtres appliqués avant : un passage hors filtre n'est jamais rendu, même premier par le sens", async () => {
    const idx = index(ENT_A);
    const horsFiltre = passage(ENT_A, idx.id, "franchise indexee assurance habitation", [1, 0, 0, 0], { d_type: "faq" });
    const dansFiltre = passage(ENT_A, idx.id, "franchise indexee tarif auto", [0.6, 0.8, 0, 0], { d_type: "tarif" });
    const { executer, journal } = fauxExecuteur({ passages: [horsFiltre, dansFiltre], index: [idx] });
    const { v } = fauxVectoriseur(() => [1, 0, 0, 0]);
    const r = await rechercherConnaissances(deps(executer, v), CTX_A, { question: "franchise indexee", filtres: { types: ["tarif"] } });
    expect(r.passages.map((p) => p.citation.empreintePassage)).toEqual([dansFiltre.empreinte]);
    expect(r.passages[0]!.classement).toMatchObject({ rangTexte: 1, rangSens: 1 });
    // Le filtre figure dans le WHERE des deux recherches (mots-clés et identifiants pour le sens).
    const filtrees = journal.filter((j) => j.sql.includes("websearch_to_tsquery") || j.sql.startsWith("SELECT p.id FROM"));
    expect(filtrees).toHaveLength(2);
    for (const j of filtrees) expect(j.sql).toContain("d.type IN (SELECT (jsonb_array_elements_text($");
  });

  it("filtres produit, langue, document et mode", async () => {
    const idx = index(ENT_A);
    const auto = passage(ENT_A, idx.id, "garantie vol", [1, 0, 0, 0], { d_produit: "auto" });
    const moto = passage(ENT_A, idx.id, "garantie vol", [1, 0, 0, 0], { d_produit: "moto" });
    const nl = passage(ENT_A, idx.id, "garantie vol", [1, 0, 0, 0], { langue: "nl" });
    const reel = passage(ENT_A, idx.id, "garantie vol", [1, 0, 0, 0], { d_mode: "reel", v_mode: "reel" });
    const { executer } = fauxExecuteur({ passages: [auto, moto, nl, reel], index: [idx] });
    const { v } = fauxVectoriseur(() => [1, 0, 0, 0]);
    const ids = async (filtres: object, ctx = CTX_A) =>
      (await rechercherConnaissances(deps(executer, v), ctx, { question: "garantie vol", filtres })).passages.map((p) => p.citation.empreintePassage).length;
    expect(await ids({ produits: ["moto"] })).toBe(1);
    expect(await ids({ langues: ["nl"] })).toBe(1);
    expect(await ids({ documentIds: [auto.document_id] })).toBe(1);
    expect(await ids({})).toBe(3); // le passage du mode réel est exclu en démonstration
    expect(await ids({}, { companyId: ENT_A, mode: "reel" })).toBe(1);
  });

  it("périmé exclu par défaut, rendu et marqué sur demande ; validité contrôlée à la date de référence", async () => {
    const idx = index(ENT_A);
    const actuel = passage(ENT_A, idx.id, "tarif auto 2026", [1, 0, 0, 0]);
    const perime = passage(ENT_A, idx.id, "tarif auto 2024", [1, 0, 0, 0], { v_statut: "perime", v_valide_au: "2025-01-01" });
    const expire = passage(ENT_A, idx.id, "tarif auto 2025", [1, 0, 0, 0], { v_valide_au: "2026-06-01" });
    const futur = passage(ENT_A, idx.id, "tarif auto 2027", [1, 0, 0, 0], { v_valide_du: "2027-01-01" });
    const { executer } = fauxExecuteur({ passages: [actuel, perime, expire, futur], index: [idx] });
    const { v } = fauxVectoriseur(() => [1, 0, 0, 0]);

    const defaut = await rechercherConnaissances(deps(executer, v), CTX_A, { question: "tarif auto" });
    expect(defaut.passages.map((p) => p.citation.empreintePassage)).toEqual([actuel.empreinte]);
    expect(defaut.passages[0]!.citation.perime).toBe(false);

    const avec = await rechercherConnaissances(deps(executer, v), CTX_A, { question: "tarif auto", filtres: { inclurePerimes: true } });
    const parEmpreinte = new Map(avec.passages.map((p) => [p.citation.empreintePassage, p.citation]));
    expect(parEmpreinte.get(perime.empreinte)?.perime).toBe(true);
    expect(parEmpreinte.get(perime.empreinte)?.statut).toBe("perime");
    expect(parEmpreinte.get(actuel.empreinte)?.perime).toBe(false);
    // Une version « en vigueur » hors de sa période n'est jamais rendue comme valide.
    expect(parEmpreinte.has(expire.empreinte)).toBe(false);
    expect(parEmpreinte.has(futur.empreinte)).toBe(false);
    valider(avec);

    const passe = await rechercherConnaissances(deps(executer, v), CTX_A, { question: "tarif auto", filtres: { dateReference: "2026-03-01" } });
    expect(new Set(passe.passages.map((p) => p.citation.empreintePassage))).toEqual(new Set([actuel.empreinte, expire.empreinte]));
  });

  it("mode « aucun » : plein texte seul, aucun appel de vectorisation ni lecture de vecteurs", async () => {
    const idx = index(ENT_A, { fournisseur: "aucun", modele: null, empreinte_modele: null, dimension: null });
    const p1 = passage(ENT_A, null, "reclamation mediation delai", null);
    const { executer, journal } = fauxExecuteur({ passages: [p1], index: [idx] });
    const { v } = fauxVectoriseur(() => [1, 0, 0, 0], "aucun");
    const r = await rechercherConnaissances(deps(executer, v), CTX_A, { question: "Réclamation médiation" });
    expect(r.passages).toHaveLength(1);
    expect(r.passages[0]!.classement).toMatchObject({ rangTexte: 1, rangSens: null });
    expect(r.index).toMatchObject({ fournisseur: "aucun", modele: null });
    expect(journal.some((j) => j.sql.includes("encode("))).toBe(false);
    // La question est normalisée par le code (accents retirés) avant l'envoi.
    expect(journal.find((j) => j.sql.includes("websearch_to_tsquery"))!.params).toContain(JSON.stringify(["reclamation", "mediation"]));
    valider(r);

    // Index vectorisé mais vectoriseur « aucun » : plein texte seul aussi.
    const idx2 = index(ENT_A);
    const w = fauxExecuteur({ passages: [passage(ENT_A, idx2.id, "reclamation mediation", [1, 0, 0, 0])], index: [idx2] });
    const r2 = await rechercherConnaissances(deps(w.executer, v), CTX_A, { question: "reclamation mediation" });
    expect(r2.passages[0]!.classement.rangSens).toBeNull();
    expect(w.journal.some((j) => j.sql.includes("encode("))).toBe(false);
  });

  it("seuil non atteint : « aucune source trouvée »", async () => {
    const idx = index(ENT_A);
    const p1 = passage(ENT_A, idx.id, "garantie vol vehicule", [1, 0, 0, 0]);
    const { executer } = fauxExecuteur({ passages: [p1], index: [idx] });
    // Question orthogonale : aucun mot commun, similarité 0 sous le plancher.
    const { v } = fauxVectoriseur(() => [0, 1, 0, 0]);
    const r = await rechercherConnaissances(deps(executer, v), CTX_A, { question: "fietsen gestolen" });
    expect(r).toMatchObject({ passages: [], aucuneSource: true, motifAucuneSource: MOTIF_AUCUNE_SOURCE });
    valider(r);
    // Même passage, seuil RRF relevé au-dessus de 1/61 : aucune source non plus.
    const r2 = await rechercherConnaissances({ ...deps(executer, v), seuils: { rrfMin: 0.02, similariteMin: 0.3 } }, CTX_A, {
      question: "garantie vol",
    });
    expect(r2.aucuneSource).toBe(true);
    // Le sens seul suffit quand la similarité dépasse le plancher.
    const proche = fauxVectoriseur(() => [0.9, 0.1, 0, 0]);
    const r3 = await rechercherConnaissances(deps(executer, proche.v), CTX_A, { question: "fietsen gestolen" });
    expect(r3.passages[0]!.classement).toMatchObject({ rangTexte: null, rangSens: 1 });
  });

  it("refuse une entrée qui tente de choisir l'entreprise ou le mode", async () => {
    const { executer } = fauxExecuteur({ passages: [], index: [] });
    const { v } = fauxVectoriseur(() => [1, 0, 0, 0]);
    await expect(rechercherConnaissances(deps(executer, v), CTX_A, { question: "tarif auto", companyId: ENT_B })).rejects.toThrow();
    await expect(rechercherConnaissances(deps(executer, v), CTX_A, { question: "tarif auto", mode: "reel" })).rejects.toThrow();
    await expect(rechercherConnaissances(deps(executer, v), { companyId: "pas-un-uuid", mode: "demonstration" }, { question: "tarif" })).rejects.toThrow();
  });

  it("modèle différent de l'index : erreur explicite, pas de mélange", async () => {
    const idx = index(ENT_A, { empreinte_modele: "f".repeat(64) });
    const { executer } = fauxExecuteur({ passages: [passage(ENT_A, idx.id, "tarif", [1, 0, 0, 0])], index: [idx] });
    const { v } = fauxVectoriseur(() => [1, 0, 0, 0]);
    await expect(rechercherConnaissances(deps(executer, v), CTX_A, { question: "tarif auto" })).rejects.toThrow(/Modèle de vectorisation différent/);
  });
});

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

describe("cache des vecteurs par entreprise", () => {
  it("chargé une fois, rechargé quand la version de l'index change, invalidable ; pagination", async () => {
    const idx = index(ENT_A);
    const passages = Array.from({ length: 5001 }, (_, i) => passage(ENT_A, idx.id, `clause ${i}`, [1, i % 7, 0, 0]));
    const monde = { passages, index: [idx] };
    const { executer, journal } = fauxExecuteur(monde);
    const { v } = fauxVectoriseur(() => [1, 0, 0, 0]);
    const cache = new CacheVecteurs();
    const d = deps(executer, v, cache);
    const pages = () => journal.filter((j) => j.sql.includes("encode(")).length;

    await rechercherConnaissances(d, CTX_A, { question: "clause" });
    expect(pages()).toBe(2); // 5 000 + 1
    expect(cache.obtenir(ENT_A, `${idx.id}|1|${EMPREINTE_MODELE}`)?.ids).toHaveLength(5001);
    await rechercherConnaissances(d, CTX_A, { question: "clause" });
    expect(pages()).toBe(2);

    idx.version_index = 2;
    await rechercherConnaissances(d, CTX_A, { question: "clause" });
    expect(pages()).toBe(4);

    cache.invalider(ENT_A);
    expect(cache.entreprises()).toEqual([]);
    await rechercherConnaissances(d, CTX_A, { question: "clause" });
    expect(pages()).toBe(6);
  });
});

/* ------------------------------------------------------------------ */
/* Accès croisé                                                        */
/* ------------------------------------------------------------------ */

describe("accès croisé : deux entreprises, documents quasi identiques, un mot témoin chacune", () => {
  function deuxEntreprises() {
    const idxA = index(ENT_A);
    const idxB = index(ENT_B);
    const pA = passage(ENT_A, idxA.id, "franchise indexee vehicule zephyrin", [1, 0, 0, 0.01]);
    const pB = passage(ENT_B, idxB.id, "franchise indexee vehicule quolibet", [1, 0, 0, 0]);
    // Même document « logique », même type, même produit, même mode : seule l'entreprise diffère.
    const monde = { passages: [pA, pB], index: [idxA, idxB] };
    return { monde, pA, pB, idxA, idxB };
  }

  it("aucune requête de A ne rend un passage de B (mots-clés, sens, compteurs, cache)", async () => {
    const { monde, pA, pB } = deuxEntreprises();
    const { executer, journal } = fauxExecuteur(monde);
    // Le vecteur de la question est exactement celui du passage de B.
    const { v } = fauxVectoriseur(() => [1, 0, 0, 0]);
    const cache = new CacheVecteurs();
    const d = deps(executer, v, cache);

    // B cherche d'abord : le cache de B est chargé.
    const rB = await rechercherConnaissances(d, CTX_B, { question: "quolibet" });
    expect(rB.passages.map((p) => p.citation.empreintePassage)).toEqual([pB.empreinte]);

    // A cherche le mot témoin de B : rien par les mots-clés ; par le sens, seul le passage de A.
    const rA = await rechercherConnaissances(d, CTX_A, { question: "quolibet" });
    expect(rA.passages.map((p) => p.citation.empreintePassage)).toEqual([pA.empreinte]);
    expect(rA.passages[0]!.classement.rangTexte).toBeNull();

    // Requête commune aux deux : A ne voit que A, et « 1 passage » (aucun compteur ne trahit B).
    const rCommun = await rechercherConnaissances(d, CTX_A, { question: "franchise indexee vehicule", nombre: 20 });
    expect(rCommun.passages).toHaveLength(1);
    expect(rCommun.passages[0]!.citation.documentId).toBe(pA.document_id);

    // Le cache est cloisonné : l'entrée de A ne contient aucun identifiant de B, et inversement.
    const entreeA = cache.obtenir(ENT_A, `${monde.index[0]!.id}|1|${EMPREINTE_MODELE}`)!;
    const entreeB = cache.obtenir(ENT_B, `${monde.index[1]!.id}|1|${EMPREINTE_MODELE}`)!;
    expect(entreeA.ids).toEqual([pA.id]);
    expect(entreeB.ids).toEqual([pB.id]);
    // Une clé d'index de B demandée pour A ne rend rien.
    expect(cache.obtenir(ENT_A, `${monde.index[1]!.id}|1|${EMPREINTE_MODELE}`)).toBeUndefined();

    // Rien de B dans la sortie de A, sous aucune forme.
    for (const r of [rA, rCommun]) {
      // La question elle-même (posée par A) est écartée : on cherche B dans ce que le module rend.
      const texte = JSON.stringify({ ...r, question: "" });
      expect(texte).not.toContain("quolibet");
      expect(texte).not.toContain(pB.id);
      expect(texte).not.toContain(pB.document_id);
      expect(texte).not.toContain(ENT_B);
    }

    // Chaque requête de A est bornée à A par son premier paramètre.
    const requetesA = journal.filter((j) => j.params[0] === ENT_A);
    expect(requetesA.length).toBeGreaterThan(0);
    for (const j of journal) expect([ENT_A, ENT_B]).toContain(j.params[0]);
  });

  it("viser un document de B depuis A : même réponse qu'un document inexistant (aucune fuite par le message)", async () => {
    const { monde, pB } = deuxEntreprises();
    const { executer } = fauxExecuteur(monde);
    const { v } = fauxVectoriseur(() => [0, 1, 0, 0]);
    const d = deps(executer, v);
    const versB = await rechercherConnaissances(d, CTX_A, { question: "franchise quolibet", filtres: { documentIds: [pB.document_id] } });
    const inexistant = await rechercherConnaissances(d, CTX_A, {
      question: "franchise quolibet",
      filtres: { documentIds: ["12345678-0000-4000-8000-000000000000"] },
    });
    const sansDuree = (r: typeof versB) => ({ ...r, dureeMs: 0 });
    expect(sansDuree(versB)).toEqual(sansDuree(inexistant));
    expect(versB.aucuneSource).toBe(true);
    expect(JSON.stringify(versB)).not.toContain(pB.document_id);
  });

  it("le module n'emploie jamais un cache d'une autre entreprise, même empoisonné", async () => {
    const { monde, pB, idxA } = deuxEntreprises();
    const { executer } = fauxExecuteur(monde);
    const { v } = fauxVectoriseur(() => [1, 0, 0, 0]);
    const cache = new CacheVecteurs();
    // Entrée de A empoisonnée avec l'identifiant et le vecteur de B.
    const matrice = { dimension: DIM, lignes: 1, donnees: Float32Array.from([1, 0, 0, 0]) };
    cache.ranger({ companyId: ENT_A, cle: `${idxA.id}|1|${EMPREINTE_MODELE}`, ids: [pB.id], positions: new Map([[pB.id, 0]]), matrice });
    const r = await rechercherConnaissances(deps(executer, v, cache), CTX_A, { question: "quolibet" });
    // Les identifiants retenus par les filtres (company_id = $1) excluent B : rien n'est rendu.
    expect(r.passages).toEqual([]);
    expect(r.aucuneSource).toBe(true);
  });

  it("chaque SQL généré contient company_id = $1, aucun mot interdit, une seule instruction, l'espace du plugin", async () => {
    const { monde } = deuxEntreprises();
    const { executer, journal } = fauxExecuteur(monde);
    const { v } = fauxVectoriseur(() => [1, 0, 0, 0]);
    await rechercherConnaissances(deps(executer, v), CTX_A, {
      question: "franchise indexée",
      filtres: { types: ["tarif", "conditions_generales"], produits: ["auto"], langues: ["fr"], inclurePerimes: true },
    });
    await rechercherConnaissances(deps(executer, v), CTX_A, { question: "franchise indexee vehicule" });
    const sortes = new Set(journal.map((j) => j.sql.slice(0, 40)));
    expect(sortes.size).toBeGreaterThanOrEqual(4); // index, mots-clés, cache, identifiants filtrés, détails
    for (const { sql, params } of journal) {
      const n = sql.replace(/\s+/g, " ").toLowerCase();
      expect(n).toMatch(/\bcompany_id = \$1\b/);
      expect(n).not.toMatch(MOTIF_INTERDIT);
      expect(n).not.toContain(";");
      expect(n.startsWith("select ") || n.startsWith("with ")).toBe(true);
      for (const m of n.matchAll(/\b(?:from|join)\s+"?([a-z_][a-z0-9_]*)"?\./g)) expect(m[1]).toBe("plugin_atelier_f0322cc62c");
      expect(params[0]).toBe(ENT_A);
      // Requêtes paramétrées : la question n'apparaît jamais dans le texte SQL.
      expect(n).not.toContain("franchise");
    }
  });
});

describe("cache des vecteurs borné (revue du 16/10, m6)", () => {
  const entree = (companyId: string, lignes: number) => ({
    companyId,
    cle: "index|1|modele",
    ids: Array.from({ length: lignes }, (_, i) => `p${i}`),
    positions: new Map<string, number>(),
    matrice: { dimension: 4, lignes, donnees: new Float32Array(lignes * 4) },
  });

  it("au-delà du nombre d'entreprises admis, la moins récemment lue est retirée", () => {
    const cache = new CacheVecteurs({ entreprisesMax: 2 });
    cache.ranger(entree("a", 1));
    cache.ranger(entree("b", 1));
    expect(cache.obtenir("a", "index|1|modele")).toBeDefined(); // « a » relue : « b » devient la plus ancienne
    cache.ranger(entree("c", 1));
    expect(cache.entreprises().sort()).toEqual(["a", "c"]);
  });

  it("au-delà de la taille totale admise, les entrées les plus anciennes sont retirées", () => {
    const cache = new CacheVecteurs({ octetsMax: 100 * 16 });
    cache.ranger(entree("a", 60)); // 60 lignes × 4 composantes × 4 octets = 960 octets
    cache.ranger(entree("b", 60));
    expect(cache.entreprises()).toEqual(["b"]);
    cache.ranger(entree("c", 500)); // plus grosse que le plafond à elle seule : jamais gardée
    expect(cache.obtenir("c", "index|1|modele")).toBeUndefined();
    expect(cache.entreprises()).toEqual(["b"]);
  });

  it("par défaut, le cache est borné", () => {
    const cache = new CacheVecteurs();
    for (let i = 0; i < 100; i++) cache.ranger(entree(`e${i}`, 1));
    expect(cache.entreprises().length).toBeLessThan(100);
  });
});
