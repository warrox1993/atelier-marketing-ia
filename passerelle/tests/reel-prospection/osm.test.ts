// Lot P3b : importation de l'extrait OpenStreetMap (fichier GeoJSON-seq produit par osmium, voir fixtures/) et outils `osm_*`
// réels. Le fichier d'essai est FICTIF : il a été fabriqué à la main (fixtures/extrait-osm.osm) puis converti par
//   osmium cat → osmium tags-filter nwr/shop nwr/craft nwr/office nwr/amenity nwr/tourism nwr/healthcare
//   → osmium export -f geojsonseq --add-unique-id=type_id            (osmium-tool 1.19.0, 15/10/2026)
// ce qui prouve que l'importateur lit le VRAI format de sortie d'osmium.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OutilPasserelle } from "../../src/fournisseurs.js";
import { ATTRIBUTION_OSM, LICENCE_OSM, typeEtUrlOsm } from "../../src/commun/prospection/osm-commun.js";
import { classer } from "../../src/reel/prospection/osm/categories.js";
import { identifiantOsm, importerOsm, positionDe } from "../../src/reel/prospection/osm/importer.js";
import { IndexOsm, outilsOsm } from "../../src/reel/prospection/osm/outils.js";
import { telechargerExtrait, verifierTaille } from "../../src/reel/prospection/osm/telechargement.js";
import { appeler, dossierTemporaire } from "./aide-bce.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/extrait-osm.geojsonseq", import.meta.url));

describe("classement des étiquettes OSM", () => {
  it("catégories par clé, valeurs ignorées, objets sans intérêt", () => {
    expect(classer({ shop: "bakery" })).toEqual({ categorie: "commerce", cle: "shop", valeur: "bakery" });
    expect(classer({ shop: "car_repair" })?.categorie).toBe("automobile");
    expect(classer({ shop: "vacant" })).toBeNull();
    expect(classer({ craft: "roofer" })?.categorie).toBe("artisanat");
    expect(classer({ office: "insurance" })?.categorie).toBe("finance_assurance");
    expect(classer({ office: "lawyer" })?.categorie).toBe("bureau");
    expect(classer({ amenity: "restaurant" })?.categorie).toBe("restauration");
    expect(classer({ amenity: "fuel" })?.categorie).toBe("automobile");
    expect(classer({ amenity: "bank" })?.categorie).toBe("finance_assurance");
    expect(classer({ amenity: "bench" })).toBeNull();
    expect(classer({ tourism: "hotel" })?.categorie).toBe("hebergement");
    expect(classer({ tourism: "viewpoint" })).toBeNull();
    expect(classer({ healthcare: "physiotherapist" })?.categorie).toBe("sante");
    expect(classer({ building: "yes" })).toBeNull();
  });
});

describe("géométries et identifiants", () => {
  it("position : point, moyenne des sommets d'une ligne ou d'une surface, géométrie inutilisable", () => {
    expect(positionDe({ type: "Point", coordinates: [5.5797, 50.6326] })).toEqual({ lat: 50.6326, lon: 5.5797 });
    expect(positionDe({ type: "LineString", coordinates: [[5, 50], [6, 51]] })).toEqual({ lat: 50.5, lon: 5.5 });
    expect(positionDe({ type: "MultiPolygon", coordinates: [[[[5, 50], [7, 50], [7, 52], [5, 52]]]] })).toEqual({ lat: 51, lon: 6 });
    expect(positionDe({ type: "Point", coordinates: [5, 500] })).toBeNull();
    expect(positionDe({ type: "Inconnu", coordinates: [] })).toBeNull();
    expect(positionDe(null)).toBeNull();
  });
  it("identifiants osmium : surface ramenée au chemin ou à la relation, adresse OSM correcte", () => {
    expect(identifiantOsm("a40")).toBe("w20");
    expect(identifiantOsm("a41")).toBe("r20");
    expect(identifiantOsm("n7")).toBe("n7");
    expect(typeEtUrlOsm("n7")).toEqual({ type: "node", url: "https://www.openstreetmap.org/node/7" });
    expect(typeEtUrlOsm("w20")).toEqual({ type: "way", url: "https://www.openstreetmap.org/way/20" });
    expect(typeEtUrlOsm("demo/n0001")).toEqual({ type: "node", url: null });
  });
});

describe("importation et outils osm réels (extrait fictif au format osmium)", () => {
  let dossier: string;
  let index: IndexOsm;
  let outils: OutilPasserelle[];
  let chemin: string;

  beforeAll(async () => {
    dossier = dossierTemporaire("passerelle-p3b-");
    chemin = join(dossier, "osm.sqlite");
    const rapport = await importerOsm(FIXTURE, chemin, { date: "2026-10-14" });
    expect(rapport.date_extraction).toBe("2026-10-14");
    index = new IndexOsm(chemin);
    outils = outilsOsm(() => index);
  });
  afterAll(() => index.fermer());

  it("rapport chiffré : lues, retenues, hors catégorie, sans nom, doublon de surface fusionné", async () => {
    const r = await importerOsm(FIXTURE, join(dossier, "autre.sqlite"), { date: "2026-10-14" });
    expect(r.compteurs).toEqual({ lues: 18, retenues: 15, sans_nom: 1, hors_categorie: 2, sans_position: 0, invalides: 0 });
    // 15 lignes retenues, mais le café (w20 + a40) ne compte qu'une fois dans l'index.
    const n = (await appeler(outils, "osm_repartition", {}))["repartition"].reduce((s: number, l: any) => s + l.nombre, 0);
    expect(n).toBe(14);
  });

  it("minimisation : ni courriel ni mobile dans l'index, ni dans le fichier SQLite", () => {
    const octets = readFileSync(chemin).toString("latin1");
    expect(octets).not.toContain("contact@exemple.invalid");
    expect(octets).not.toContain("+32 470 00 00 00");
    expect(octets).toContain("Boulangerie Fictive");
  });

  it("osm_commerces : filtres catégorie, zone (commune sans accent, code postal, province, région) et nom", async () => {
    const noms = async (args: Record<string, unknown>): Promise<string[]> => ((await appeler(outils, "osm_commerces", args))["commerces"] as any[]).map((c) => c.nom).sort();
    expect(await noms({ categories: ["restauration"] })).toEqual(["Table Fictive", "Café Fictif Polygone"].sort());
    expect(await noms({ communes: ["liege"], categories: ["commerce"] })).toEqual(['Boulangerie "Guillemets" & <Cie>', "Boulangerie Fictive"].sort());
    expect(await noms({ codes_postaux: ["4430"] })).toEqual(["Couvreur Fictif"]);
    expect(await noms({ provinces: ["Namur"] })).toEqual(["Hôtel Fictif"]);
    expect(await noms({ regions: ["Flandre"] })).toEqual(["Fleuriste Gantois"]);
    expect(await noms({ nom: "garage" })).toEqual(["Garage Fictif"]);
    expect(await noms({ nom: "CAFE fictif" })).toEqual(["Café Fictif Polygone"]);
    expect(await noms({ nom: "100%_" })).toEqual([]); // jokers LIKE échappés
    expect(await noms({ categories: ["automobile", "sante"] })).toEqual(["Garage Fictif", "Kine Fictif", "Pharmacie Fictive"].sort());
    expect(await noms({ categories: ["artisanat"], regions: ["Flandre"] })).toEqual([]);
  });

  it("osm_commerces : forme d'un établissement, attribution et licence ODbL dans CHAQUE réponse", async () => {
    const r = await appeler(outils, "osm_commerces", { nom: "Boulangerie Fictive" });
    expect(r).toMatchObject({ attribution: ATTRIBUTION_OSM, licence: LICENCE_OSM, date_extraction: "2026-10-14", total: 1, page: 1, taille_page: 10, pages: 1 });
    expect(r["source"]).toContain("Geofabrik");
    expect(r["commerces"][0]).toEqual({
      id: "n1", type: "node", nom: "Boulangerie Fictive", categorie: "commerce", cle: "shop", valeur: "bakery",
      adresse: { rue: "Rue Imaginaire", numero: "5", code_postal: "4000", commune: "Liège" },
      telephone: "+32 4 000 00 21", site: null, horaires: "Mo-Sa 07:00-18:00", marque: "Pain Fictif",
      position: { lat: 50.6326, lon: 5.5797 }, url_osm: "https://www.openstreetmap.org/node/1",
    });
    expect((await appeler(outils, "osm_repartition", {}))).toMatchObject({ attribution: ATTRIBUTION_OSM, licence: LICENCE_OSM });
    // Chemin fermé exporté deux fois par osmium (ligne et surface) : un seul établissement, adresse OSM du chemin.
    const cafe = (await appeler(outils, "osm_commerces", { nom: "Polygone" }))["commerces"];
    expect(cafe).toHaveLength(1);
    expect(cafe[0]).toMatchObject({ id: "w20", type: "way", url_osm: "https://www.openstreetmap.org/way/20" });
  });

  it("établissement sans adresse : champs nuls, jamais inventés ; sans nom : jamais retenu", async () => {
    const sans = (await appeler(outils, "osm_commerces", { nom: "Sans Adresse" }))["commerces"][0];
    expect(sans.adresse).toEqual({ rue: null, numero: null, code_postal: null, commune: null });
    expect((await appeler(outils, "osm_commerces", { nom: "Banc" }))["total"]).toBe(0);
    expect((await appeler(outils, "osm_commerces", { nom: "Local Vide" }))["total"]).toBe(0);
  });

  it("osm_repartition : nombre par commune et catégorie, trié, commune inconnue nommée", async () => {
    const r = await appeler(outils, "osm_repartition", { regions: ["Wallonie"] });
    expect(r["repartition"][0]).toEqual({ commune: "Liège", categorie: "commerce", nombre: 2 });
    expect(r["lignes"]).toBe(r["repartition"].length);
    const toutes = await appeler(outils, "osm_repartition", {});
    expect(toutes["repartition"].some((l: any) => l.commune === "(commune inconnue)")).toBe(true);
  });

  it("zone dérivée du code postal : Gand en Flandre orientale, Namur en Wallonie", async () => {
    const f = (await appeler(outils, "osm_commerces", { provinces: ["Flandre orientale"] }))["commerces"];
    expect(f.map((c: any) => c.nom)).toEqual(["Fleuriste Gantois"]);
  });

  it("index absent : erreur claire", async () => {
    const vide = new IndexOsm(join(dossier, "absent.sqlite"));
    await expect(appeler(outilsOsm(() => vide), "osm_commerces", {})).rejects.toThrow(/Index OpenStreetMap indisponible/);
  });

  it("fichiers invalides : lignes ignorées et comptées, date refusée, fichier absent", async () => {
    const f = join(dossier, "mauvais.geojsonseq");
    writeFileSync(f, ['\u001e{"type":"Feature","id":"n1","geometry":{"type":"Point","coordinates":[5,50]},"properties":{"shop":"bakery","name":"A"}}', "pas du json", '{"type":"Feature","geometry":{"type":"Point","coordinates":[5,50]},"properties":{"shop":"bakery","name":"B"}}', '{"type":"Feature","id":"n3","geometry":{"type":"Point","coordinates":[5,500]},"properties":{"shop":"bakery","name":"C"}}', ""].join("\n"));
    const r = await importerOsm(f, join(dossier, "m.sqlite"), { date: "2026-01-01" });
    expect(r.compteurs).toMatchObject({ lues: 4, retenues: 1, invalides: 2, sans_position: 1 });
    await expect(importerOsm(f, join(dossier, "m2.sqlite"), { date: "hier" })).rejects.toThrow(/Date d'extraction invalide/);
    await expect(importerOsm(join(dossier, "absent.geojsonseq"), join(dossier, "m3.sqlite"))).rejects.toThrow(/introuvable/);
  });

  it("remplacement de l'index : la lecture suit le nouveau fichier", async () => {
    const copie = join(dossier, "remplace.sqlite");
    await importerOsm(FIXTURE, copie, { date: "2026-10-01" });
    const idx = new IndexOsm(copie);
    expect(idx.meta()["ExtractDate"]).toBe("2026-10-01");
    await importerOsm(FIXTURE, copie, { date: "2026-10-02" });
    expect(idx.meta()["ExtractDate"]).toBe("2026-10-02");
    idx.fermer();
  });
});

describe("téléchargement de l'extrait : la taille se lit sans rien télécharger", () => {
  const faux = (octets: number | null, compteur: { get: number; head: number }): typeof fetch =>
    (async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "HEAD") compteur.head++;
      else compteur.get++;
      return new Response(init?.method === "HEAD" ? null : "x".repeat(10), { status: 200, headers: octets === null ? {} : { "content-length": String(octets) } });
    }) as typeof fetch;

  it("verifierTaille : une requête HEAD seulement, taille annoncée lue", async () => {
    const c = { get: 0, head: 0 };
    const t = await verifierTaille("http://127.0.0.1:1/belgium-latest.osm.pbf", faux(664 * 1024 * 1024, c));
    expect(t.octets).toBe(664 * 1024 * 1024);
    expect(c).toEqual({ get: 0, head: 1 });
  });

  it("sans confirmation : aucun octet téléchargé", async () => {
    const c = { get: 0, head: 0 };
    const r = await telechargerExtrait({ url: "http://127.0.0.1:1/b.pbf", destination: join(dossierTemporaire(), "b.pbf"), appeler: faux(100, c) });
    expect(r.telecharge).toBe(false);
    expect(c.get).toBe(0);
  });

  it("avec confirmation : télécharge dans un fichier .part puis renomme ; espace disque insuffisant refusé", async () => {
    const c = { get: 0, head: 0 };
    const dest = join(dossierTemporaire(), "b.pbf");
    const r = await telechargerExtrait({ url: "http://127.0.0.1:1/b.pbf", destination: dest, confirmer: true, appeler: faux(10, c), margeOctets: 0 });
    expect(r.telecharge).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe("x".repeat(10));
    await expect(telechargerExtrait({ url: "http://127.0.0.1:1/b.pbf", destination: join(dossierTemporaire(), "c.pbf"), confirmer: true, appeler: faux(10 ** 18, c) })).rejects.toThrow(/Espace disque insuffisant/);
  });

  it("refuse tout hôte autre que download.geofabrik.de (ou la boucle locale en essai)", async () => {
    await expect(verifierTaille("https://exemple.org/b.pbf", faux(1, { get: 0, head: 0 }))).rejects.toThrow(/Adresse refusée/);
    await expect(verifierTaille("http://exemple.org/b.pbf", faux(1, { get: 0, head: 0 }))).rejects.toThrow(/Adresse refusée/);
  });
});
