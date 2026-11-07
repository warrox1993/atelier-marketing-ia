/** Porte de diffusion : provenance IA des livrables de la fabrique (lot 11). */
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  controlerLivrablesFabrique,
  controlerTravailFabrique,
  DIGITAL_SOURCE_TYPE_IA,
  travauxFabriqueCites,
} from "../src/serveur/fabrique-provenance.js";

const ENTREPRISE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TRAVAIL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OCTETS = Buffer.from("contenu de video de test");
const MAINTENANT = new Date("2026-10-24T12:00:00Z");

let racine: string;
let cheminRegistre: string;
let dossier: string;
beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), "porte-"));
  dossier = join(racine, "livrables", ENTREPRISE, TRAVAIL);
  mkdirSync(dossier, { recursive: true });
  mkdirSync(join(racine, "voix-autorisees"));
  cheminRegistre = join(racine, "voix-autorisees", "registre.json");
  ecrireRegistre([{ id: "synthese-chatterbox-fr", moteur: "chatterbox", type: "synthese", entreprises: ["*"], expire_le: "2030-12-31" }]);
  livrer();
});
afterEach(() => rmSync(racine, { recursive: true, force: true }));

const sha = (o: Buffer) => createHash("sha256").update(o).digest("hex");
const ecrireRegistre = (voix: unknown[]) => writeFileSync(cheminRegistre, JSON.stringify({ voix }));
const provenanceComplete = () => ({
  travail: TRAVAIL, entreprise: ENTREPRISE, type: "video", fichier: "video.mp4", outils: { ffmpeg: "7" },
  voix: ["synthese-chatterbox-fr"], musique: null, digital_source_type: DIGITAL_SOURCE_TYPE_IA,
  filigrane_perth: { detecte: true, taux: 1 }, sha256: sha(OCTETS),
});

function livrer(provenance: Record<string, unknown> | null = provenanceComplete(), contenu: Buffer = OCTETS) {
  writeFileSync(join(dossier, "etat.json"), JSON.stringify({ travail: TRAVAIL, etat: "termine" }));
  writeFileSync(join(dossier, "video.mp4"), contenu);
  writeFileSync(join(dossier, "resultat.json"), JSON.stringify({ fichiers: [{ fichier: "video.mp4", taille: OCTETS.length, sha256: sha(OCTETS) }] }));
  if (provenance) writeFileSync(join(dossier, "provenance.json"), JSON.stringify(provenance));
}
const controler = () => controlerTravailFabrique({ racine, cheminRegistre, maintenant: () => MAINTENANT }, ENTREPRISE, TRAVAIL);
const motifDuRefus = async () => {
  const v = await controler();
  expect(v.ok).toBe(false);
  return v.ok ? "" : v.motif;
};

describe("porte de diffusion : provenance IA de la fabrique", () => {
  it("accepte un livrable complet", async () => {
    expect(await controler()).toEqual({ ok: true });
  });

  it("refuse un livrable sans provenance", async () => {
    rmSync(join(dossier, "provenance.json"));
    expect(await motifDuRefus()).toMatch(/Provenance IA absente/u);
  });

  it("refuse une provenance sans digital_source_type", async () => {
    livrer({ ...provenanceComplete(), digital_source_type: undefined });
    expect(await motifDuRefus()).toMatch(/digital_source_type/u);
  });

  it("accepte une vidéo sans aucune mention, ancienne provenance comprise", async () => {
    livrer(provenanceComplete());
    expect(await controler()).toEqual({ ok: true });
    // Provenance écrite avant le retrait du champ : il est ignoré, elle reste valide.
    livrer({ ...provenanceComplete(), mention_visible: false });
    expect(await controler()).toEqual({ ok: true });
  });

  it("refuse un filigrane non détecté pour un contenu avec voix", async () => {
    livrer({ ...provenanceComplete(), filigrane_perth: { detecte: false, taux: 0.1 } });
    expect(await motifDuRefus()).toMatch(/filigrane/u);
  });

  it("refuse une voix retirée du registre", async () => {
    ecrireRegistre([]);
    expect(await motifDuRefus()).toMatch(/n'est plus au registre/u);
  });

  it("refuse une voix expirée ou non permise à l'entreprise", async () => {
    ecrireRegistre([{ id: "synthese-chatterbox-fr", entreprises: ["*"], expire_le: "2026-10-24" }]);
    expect(await motifDuRefus()).toMatch(/expirée/u);
    ecrireRegistre([{ id: "synthese-chatterbox-fr", entreprises: ["autre"], expire_le: "2030-12-31" }]);
    expect(await motifDuRefus()).toMatch(/autorisée pour cette entreprise/u);
  });

  it("refuse si le registre est illisible", async () => {
    writeFileSync(cheminRegistre, "pas du json");
    expect(await motifDuRefus()).toMatch(/Registre des voix.*illisible/u);
    rmSync(cheminRegistre);
    expect(await motifDuRefus()).toMatch(/Registre des voix.*illisible/u);
    writeFileSync(cheminRegistre, JSON.stringify({ voix: [] }));
    chmodSync(cheminRegistre, 0o000);
    if (process.getuid && process.getuid() !== 0) expect(await motifDuRefus()).toMatch(/Registre des voix.*illisible/u);
  });

  it("refuse un fichier modifié après la pose de la provenance", async () => {
    writeFileSync(join(dossier, "video.mp4"), Buffer.from("autre contenu"));
    expect(await motifDuRefus()).toMatch(/empreinte différente/u);
  });

  it("refuse un travail non terminé ou introuvable", async () => {
    writeFileSync(join(dossier, "etat.json"), JSON.stringify({ travail: TRAVAIL, etat: "en_cours" }));
    expect(await motifDuRefus()).toMatch(/introuvable ou non terminé/u);
  });

  it("contrôle aussi les documents, sans exiger de voix", async () => {
    const doc = Buffer.from("pdf de test");
    writeFileSync(join(dossier, "offre.pdf"), doc);
    writeFileSync(join(dossier, "resultat.json"), JSON.stringify({ fichiers: [{ fichier: "offre.pdf", taille: doc.length, sha256: sha(doc) }] }));
    expect(await motifDuRefus()).toMatch(/ne vise pas le fichier/u);
    writeFileSync(join(dossier, "provenance.json"), JSON.stringify({
      travail: TRAVAIL, entreprise: ENTREPRISE, type: "document", fichier: "offre.pdf", voix: [],
      digital_source_type: DIGITAL_SOURCE_TYPE_IA, sha256: sha(doc),
    }));
    expect(await controler()).toEqual({ ok: true });
  });

  describe("images (png, jpg)", () => {
    const IMAGE = Buffer.from("octets d'image de test");
    const livrerImage = (nom: string, provenance: Record<string, unknown> | null) => {
      writeFileSync(join(dossier, nom), IMAGE);
      writeFileSync(join(dossier, "resultat.json"), JSON.stringify({ fichiers: [{ fichier: nom, taille: IMAGE.length, sha256: sha(IMAGE) }] }));
      rmSync(join(dossier, "provenance.json"), { force: true });
      if (provenance) writeFileSync(join(dossier, "provenance.json"), JSON.stringify(provenance));
    };
    const provenanceImage = (nom: string, plus: Record<string, unknown> = {}) => ({
      travail: TRAVAIL, entreprise: ENTREPRISE, type: "image", fichier: nom, voix: [], fond_ia: false,
      digital_source_type: DIGITAL_SOURCE_TYPE_IA, sha256: sha(IMAGE), ...plus,
    });

    it.each(["image.png", "image.jpg"])("refuse %s sans provenance", async (nom) => {
      livrerImage(nom, null);
      expect(await motifDuRefus()).toMatch(/Provenance IA absente/u);
    });

    it("accepte une image typographique complète, sans voix", async () => {
      livrerImage("image.png", provenanceImage("image.png"));
      expect(await controler()).toEqual({ ok: true });
    });

    it("accepte une image à fond IA sans aucune mention, ancienne provenance comprise", async () => {
      livrerImage("image.png", provenanceImage("image.png", { fond_ia: true }));
      expect(await controler()).toEqual({ ok: true });
      // Provenance écrite avant le retrait du champ : il est ignoré, elle reste valide.
      livrerImage("image.png", provenanceImage("image.png", { fond_ia: true, mention_visible: false }));
      expect(await controler()).toEqual({ ok: true });
    });

    it("refuse un fond_ia qui n'est pas un booléen", async () => {
      livrerImage("image.png", provenanceImage("image.png", { fond_ia: "non" }));
      expect(await motifDuRefus()).toMatch(/fond_ia/u);
    });

    it("refuse une image modifiée après la pose de sa provenance", async () => {
      livrerImage("image.png", provenanceImage("image.png", { sha256: sha(Buffer.from("autre")) }));
      expect(await motifDuRefus()).toMatch(/empreinte différente/u);
    });
  });

  it("ignore les fichiers non contrôlés (sous-titres)", async () => {
    writeFileSync(join(dossier, "resultat.json"), JSON.stringify({ fichiers: [{ fichier: "sous-titres.srt", taille: 1, sha256: "x" }] }));
    expect(await controler()).toEqual({ ok: true });
  });

  it("contrôle tous les travaux cités et rend le premier refus", async () => {
    rmSync(join(dossier, "provenance.json"));
    const v = await controlerLivrablesFabrique({ racine, cheminRegistre, maintenant: () => MAINTENANT }, ENTREPRISE, [TRAVAIL]);
    expect(v.ok).toBe(false);
  });

  it("refuse plus de 10 travaux cités avant de calculer la moindre empreinte", async () => {
    const travaux = Array.from({ length: 11 }, (_, i) => `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`);
    const v = await controlerLivrablesFabrique({ racine: join(racine, "absente"), cheminRegistre, maintenant: () => MAINTENANT }, ENTREPRISE, travaux);
    expect(v).toEqual({ ok: false, motif: "Trop de travaux de la fabrique cités (11, 10 au plus)." });
  });

  it("relève les travaux cités par lien dans le livrable et déclarés", () => {
    const corps = `Vidéo : [page](/ATELIER/livrables/${TRAVAIL.toUpperCase()}) et une autre /livrables/dddddddd-dddd-4ddd-8ddd-dddddddddddd`;
    expect(travauxFabriqueCites(corps, ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"]).sort()).toEqual([
      TRAVAIL, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    ]);
    expect(travauxFabriqueCites("aucun lien", [])).toEqual([]);
  });
});
