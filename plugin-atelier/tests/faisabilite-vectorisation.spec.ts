// Lot R0 : fonctions pures du prototype de vecteurs (src/connaissances/vecteurs.ts).
// Les mesures dans le worker se font sur une instance d'essai (docs/rag-conception.md, « Résultats R0 »).
import { describe, expect, it } from "vitest";
import {
  creerMatrice,
  depuisBase64,
  normaliser,
  rechercheExacte,
  sansAccents,
  versBase64,
  versLitteralReel,
} from "../src/connaissances/vecteurs.js";
import { MODELE_BGE_M3, urlFichierModele } from "../src/connaissances/vectoriseur-local.js";

describe("encodage des vecteurs", () => {
  it("base64 aller-retour identique au bit près, y compris sur une vue décalée", () => {
    const grand = Float32Array.from({ length: 2048 }, (_, i) => Math.sin(i) * 1e-3);
    const vue = grand.subarray(1024, 2048);
    const retour = depuisBase64(versBase64(vue), 1024);
    expect(Buffer.from(retour.buffer).equals(Buffer.from(vue.buffer, vue.byteOffset, vue.byteLength))).toBe(true);
    expect(versBase64(vue)).toHaveLength(Math.ceil((1024 * 4) / 3) * 4);
  });

  it("refuse une dimension incorrecte", () => {
    expect(() => depuisBase64(versBase64(new Float32Array(3)), 4)).toThrow(/12 octets, 16 attendus/u);
  });

  it("littéral real[] relu sans perte", () => {
    const v = Float32Array.from([0.1, -0.25, 1e-7, 3.4028234663852886e38]);
    const relu = Float32Array.from(versLitteralReel(v).slice(1, -1).split(",").map(Number));
    expect(Array.from(relu)).toEqual(Array.from(v));
  });
});

describe("recherche exacte", () => {
  const m = creerMatrice(3, 5);
  m.donnees.set([1, 0, 0, 0, 1, 0, 0.6, 0.8, 0, 0, 0, 1, 1, 0, 0]);

  it("classe par produit scalaire décroissant, ex aequo par ligne croissante", () => {
    const r = rechercheExacte(m, Float32Array.from([1, 0, 0]), 3);
    expect(r.map((x) => x.ligne)).toEqual([0, 4, 2]);
    expect(r[2]!.score).toBeCloseTo(0.6, 6);
  });

  it("ex aequo à la frontière de k : garde les plus petites lignes, quel que soit l'ordre d'arrivée", () => {
    const egaux = creerMatrice(3, 3);
    egaux.donnees.set([1, 0, 0, 1, 0, 0, 1, 0, 0]);
    expect(rechercheExacte(egaux, Float32Array.from([1, 0, 0]), 2, [2, 1, 0]).map((x) => x.ligne)).toEqual([0, 1]);
  });

  it("restreint aux lignes autorisées (filtres appliqués avant)", () => {
    const r = rechercheExacte(m, Float32Array.from([1, 0, 0]), 2, [1, 2, 3]);
    expect(r.map((x) => x.ligne)).toEqual([2, 1]);
  });

  it("concorde avec un tri complet sur des données aléatoires", () => {
    const n = 500;
    const d = 16;
    const mm = creerMatrice(d, n);
    let graine = 7;
    const alea = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
    for (let i = 0; i < n * d; i += 1) mm.donnees[i] = alea();
    const q = normaliser(Float32Array.from({ length: d }, alea));
    const attendu = Array.from({ length: n }, (_, l) => {
      let s = 0;
      for (let j = 0; j < d; j += 1) s += mm.donnees[l * d + j]! * q[j]!;
      return { ligne: l, score: s };
    })
      .sort((a, b) => b.score - a.score || a.ligne - b.ligne)
      .slice(0, 10)
      .map((x) => x.ligne);
    expect(rechercheExacte(mm, q, 10).map((x) => x.ligne)).toEqual(attendu);
  });

  it("refuse une requête de mauvaise dimension et une ligne hors matrice", () => {
    expect(() => rechercheExacte(m, new Float32Array(2), 1)).toThrow(/Dimension/u);
    expect(() => rechercheExacte(m, new Float32Array(3), 1, [9])).toThrow(/hors matrice/u);
  });
});

describe("normalisation du texte et modèle épinglé", () => {
  it("retire les accents français et néerlandais", () => {
    expect(sansAccents("Réclamation indexée, geïndexeerd, één")).toBe("reclamation indexee, geindexeerd, een");
  });

  it("télécharge à une révision fixe, jamais main", () => {
    expect(urlFichierModele("tokenizer.json")).toBe(
      `https://huggingface.co/Xenova/bge-m3/resolve/${MODELE_BGE_M3.revision}/tokenizer.json`,
    );
    expect(MODELE_BGE_M3.revision).toMatch(/^[0-9a-f]{40}$/u);
    for (const empreinte of Object.values(MODELE_BGE_M3.fichiers)) expect(empreinte).toMatch(/^[0-9a-f]{64}$/u);
  });
});
