/**
 * Import contrôlé de documents texte, Markdown et CSV (cahier §13) :
 * validation de taille, d'extension, d'encodage et de structure, détection
 * des formules CSV (injection de tableur) et des instructions injectées.
 * Fonction pure : le stockage est fait par le service.
 */
import { createHash } from "node:crypto";
import type { TypeImport } from "../contrats/index.js";
import { LIMITES } from "../contrats/index.js";
import { injectionsSignalees } from "./contenu-externe.js";

const EXTENSIONS: Record<TypeImport, readonly string[]> = {
  texte: [".txt", ".text"],
  markdown: [".md", ".markdown"],
  csv: [".csv"],
};

export interface ResultatImport {
  ok: true;
  tailleOctets: number;
  empreinte: string;
  lignes: number | null;
  colonnes: string[] | null;
  apercu: string;
  injectionsSignalees: string[];
  /** Cellules CSV commençant par =, +, -, @ (formules) neutralisées dans l'aperçu. */
  formulesNeutralisees: number;
}

export interface RefusImport {
  ok: false;
  motif: string;
}

/** Analyse CSV (RFC 4180, guillemets doublés), séparateur `,` ou `;` détecté sur l'en-tête. */
export function analyserCsv(contenu: string): { lignes: string[][]; separateur: string } | { erreur: string } {
  const premiere = contenu.split(/\r?\n/u, 1)[0] ?? "";
  const separateur = (premiere.match(/;/gu)?.length ?? 0) > (premiere.match(/,/gu)?.length ?? 0) ? ";" : ",";
  const lignes: string[][] = [];
  let champ = "";
  let ligne: string[] = [];
  let guillemets = false;
  for (let i = 0; i < contenu.length; i += 1) {
    const c = contenu[i]!;
    if (guillemets) {
      if (c === '"') {
        if (contenu[i + 1] === '"') {
          champ += '"';
          i += 1;
        } else guillemets = false;
      } else champ += c;
      continue;
    }
    if (c === '"' && champ === "") guillemets = true;
    else if (c === separateur) {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && contenu[i + 1] === "\n") i += 1;
      ligne.push(champ);
      champ = "";
      if (!(ligne.length === 1 && ligne[0] === "")) lignes.push(ligne);
      ligne = [];
      if (lignes.length > LIMITES.importLignesCsvMax + 1) return { erreur: `Plus de ${LIMITES.importLignesCsvMax} lignes.` };
    } else champ += c;
  }
  if (guillemets) return { erreur: "Guillemet non fermé." };
  if (champ !== "" || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return { lignes, separateur };
}

export function analyserImport(entree: { nomFichier: string; type: TypeImport; contenu: string }): ResultatImport | RefusImport {
  const nom = entree.nomFichier.trim();
  if (!nom || /[/\\\0]/u.test(nom) || nom.startsWith(".")) return { ok: false, motif: "Nom de fichier invalide." };
  const extension = nom.slice(nom.lastIndexOf(".")).toLowerCase();
  if (!EXTENSIONS[entree.type].includes(extension)) {
    return { ok: false, motif: `Extension ${extension} incompatible avec le type ${entree.type} (${EXTENSIONS[entree.type].join(", ")}).` };
  }
  const tailleOctets = Buffer.byteLength(entree.contenu, "utf8");
  if (tailleOctets === 0) return { ok: false, motif: "Fichier vide." };
  if (tailleOctets > LIMITES.importTailleMaxOctets) return { ok: false, motif: `Fichier trop volumineux (${tailleOctets} octets, maximum ${LIMITES.importTailleMaxOctets}).` };
  if (entree.contenu.includes("\0") || entree.contenu.includes("�")) return { ok: false, motif: "Contenu binaire ou encodage non UTF-8." };
  const controles = (entree.contenu.match(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/gu) ?? []).length;
  if (controles > 0) return { ok: false, motif: "Caractères de contrôle interdits dans un document texte." };

  const empreinte = createHash("sha256").update(entree.contenu, "utf8").digest("hex");
  const injections = injectionsSignalees(entree.contenu);

  if (entree.type !== "csv") {
    return {
      ok: true,
      tailleOctets,
      empreinte,
      lignes: entree.contenu.split(/\r?\n/u).length,
      colonnes: null,
      apercu: entree.contenu.slice(0, 2000),
      injectionsSignalees: injections,
      formulesNeutralisees: 0,
    };
  }

  const analyse = analyserCsv(entree.contenu);
  if ("erreur" in analyse) return { ok: false, motif: `CSV invalide : ${analyse.erreur}` };
  const [entete, ...donnees] = analyse.lignes;
  if (!entete || entete.length === 0) return { ok: false, motif: "CSV sans en-tête." };
  if (entete.length > LIMITES.importColonnesCsvMax) return { ok: false, motif: `Plus de ${LIMITES.importColonnesCsvMax} colonnes.` };
  const colonnes = entete.map((c) => c.trim());
  if (colonnes.some((c) => c === "")) return { ok: false, motif: "En-tête CSV avec une colonne sans nom." };
  if (new Set(colonnes.map((c) => c.toLowerCase())).size !== colonnes.length) return { ok: false, motif: "En-tête CSV avec des colonnes en double." };
  const irreguliere = donnees.findIndex((l) => l.length !== colonnes.length);
  if (irreguliere >= 0) return { ok: false, motif: `Ligne ${irreguliere + 2} : ${donnees[irreguliere]!.length} colonnes au lieu de ${colonnes.length}.` };

  let formules = 0;
  const neutraliser = (cellule: string) => {
    if (/^[=+\-@\t\r]/u.test(cellule)) {
      formules += 1;
      return `'${cellule}`;
    }
    return cellule;
  };
  const apercu = [colonnes, ...donnees.slice(0, 20)].map((l) => l.map(neutraliser).join(analyse.separateur)).join("\n");
  return {
    ok: true,
    tailleOctets,
    empreinte,
    lignes: donnees.length,
    colonnes,
    apercu,
    injectionsSignalees: injections,
    formulesNeutralisees: formules,
  };
}
