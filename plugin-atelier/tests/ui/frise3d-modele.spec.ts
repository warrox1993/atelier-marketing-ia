/** Modèle Blender de la frise : le GLB exporté est valide, léger, et contient les six stations nommées. */
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IDS_STATIONS, lirePieces } from "../../src/ui/frise3d/pieces.js";

const chemin = new URL("../../src/ui/assets/frise-stations.glb", import.meta.url);

describe("frise-stations.glb", () => {
  const octets = readFileSync(chemin);

  it("est un glTF binaire valide (en-tête « glTF », version 2, longueur cohérente)", () => {
    expect(octets.subarray(0, 4).toString("latin1")).toBe("glTF");
    expect(octets.readUInt32LE(4)).toBe(2);
    expect(octets.readUInt32LE(8)).toBe(octets.length);
  });

  it("pèse 200 Ko au plus", () => expect(statSync(chemin).size).toBeLessThanOrEqual(200 * 1024));

  it("contient les six stations nommées, la piste, le volume et l'anneau", () => {
    const longueurJson = octets.readUInt32LE(12);
    const json = JSON.parse(octets.subarray(20, 20 + longueurJson).toString("utf8")) as { nodes: Array<{ name?: string }> };
    const noms = json.nodes.map((n) => n.name);
    for (const id of IDS_STATIONS) expect(noms).toContain(`Station_${id}`);
    expect(IDS_STATIONS).toHaveLength(6);
    for (const nom of ["Piste", "Volume", "Anneau"]) expect(noms).toContain(nom);
  });

  it("est lu par le GLTFLoader de three.js : mailles non vides, socle posé sur y = 0", async () => {
    const p = await lirePieces(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer);
    for (const g of [p.station, p.piste.geometrie, p.volume, p.anneau]) expect(g.getAttribute("position").count).toBeGreaterThan(0);
    p.station.computeBoundingBox();
    expect(p.station.boundingBox!.min.y).toBeCloseTo(0, 3);
    expect(p.station.boundingBox!.max.y).toBeCloseTo(0.34, 3);
  });
});
