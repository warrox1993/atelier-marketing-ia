#!/usr/bin/env node
// Téléchargement du modèle `bge-m3` (q8) à la révision épinglée, avec vérification SHA-256.
//
// Usage : node scripts/telecharger-modele.mjs [dossier]
//   dossier : racine des modèles (défaut : plugin-atelier/.modeles, ignoré par git).
//             Les fichiers vont dans <dossier>/Xenova/bge-m3/…, là où `verifierModele` les cherche.
//
// Les URL pointent la révision (jamais `main`). Un fichier déjà présent et conforme n'est pas retéléchargé ;
// un fichier non conforme est supprimé et le script s'arrête en erreur (code 1).
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { MODELE_BGE_M3, urlFichierModele } from "../src/connaissances/vectoriseur-local.ts";

const racinePlugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dossierModeles = path.resolve(process.argv[2] ?? path.join(racinePlugin, ".modeles"));

function sha256(chemin) {
  return new Promise((resoudre, rejeter) => {
    const h = createHash("sha256");
    createReadStream(chemin)
      .on("data", (m) => h.update(m))
      .on("error", rejeter)
      .on("end", () => resoudre(h.digest("hex")));
  });
}

async function existe(chemin) {
  try {
    await stat(chemin);
    return true;
  } catch {
    return false;
  }
}

let echec = false;
for (const [fichier, attendu] of Object.entries(MODELE_BGE_M3.fichiers)) {
  const cible = path.join(dossierModeles, MODELE_BGE_M3.id, fichier);
  if ((await existe(cible)) && (await sha256(cible)) === attendu) {
    console.log(`déjà présent et conforme : ${fichier}`);
    continue;
  }
  await mkdir(path.dirname(cible), { recursive: true });
  const partiel = `${cible}.partiel`;
  const debut = Date.now();
  console.log(`téléchargement : ${fichier}`);
  try {
    const reponse = await fetch(urlFichierModele(fichier), { redirect: "follow" });
    if (!reponse.ok || !reponse.body) throw new Error(`HTTP ${reponse.status}`);
    await pipeline(Readable.fromWeb(reponse.body), createWriteStream(partiel));
    const obtenu = await sha256(partiel);
    if (obtenu !== attendu) throw new Error(`empreinte incorrecte (obtenu ${obtenu}, attendu ${attendu})`);
    await rename(partiel, cible);
    console.log(`  ok en ${((Date.now() - debut) / 1000).toFixed(1)} s, SHA-256 conforme`);
  } catch (e) {
    await rm(partiel, { force: true });
    console.error(`  ÉCHEC ${fichier} : ${e instanceof Error ? e.message : e}`);
    echec = true;
  }
}
if (echec) {
  console.error("Modèle incomplet ou non conforme.");
  process.exit(1);
}
console.log(`Modèle conforme dans ${path.join(dossierModeles, MODELE_BGE_M3.id)}`);
