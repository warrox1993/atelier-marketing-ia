/**
 * Lot P7 : transformation d'un fichier de base clients (CSV ou XLSX) en enregistrements prêts à
 * stocker, chiffrés (§4.1 à §4.3). Fonctions pures : aucune route, aucune écriture en base (lot P9).
 *
 * Deux temps, comme l'écran d'import :
 *   1. `lireFichierBaseClients` : contrôles du fichier, colonnes, aperçu de 20 lignes, refus des
 *      colonnes sensibles. Le contenu lu est transitoire, jamais à stocker.
 *   2. `preparerImportBaseClients` : correspondance de colonnes, rejet ligne par ligne, chiffrement
 *      des identifiants directs, empreintes HMAC. Sortie : `ImportBaseClients` et `ClientBase[]`.
 * Puis `opportunitesVenteCroisee` (règle pure) et `aPurger` (conservation).
 *
 * Le fichier n'est pas conservé : seuls son empreinte SHA-256 et ses comptes figurent dans la sortie.
 */
import { createHash, randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import {
  ClientBase,
  CorrespondanceColonnes,
  ImportBaseClients,
  LIMITES_PROSPECTION,
  MOTS_COLONNES_SENSIBLES,
  NumeroBce,
  OpportuniteVenteCroisee,
  type ColonneCible,
  type ContratDetenu,
  type Empreinte,
  type FormatBaseClients,
  type ModeExecution,
  type RegleVenteCroisee,
  type TypeEmpreinte,
} from "../contrats/index.js";
import { tailleDecompressee } from "../connaissances/extraction/bureautique.js";
import { sansAccents } from "../connaissances/vecteurs.js";
import { injectionsSignalees } from "./contenu-externe.js";
import { chiffrer, empreinte, ErreurChiffrement, memeCle, TAILLE_CLE_CHIFFREMENT, TAILLE_CLE_HMAC_MIN } from "./chiffrement-donnees.js";
import { bceValide, courrielValide, telephoneBelgeE164 } from "./regles-prospection.js";

/** Taille décompressée maximale d'un classeur XLSX (protection contre les bombes de décompression). */
const XLSX_DECOMPRESSE_MAX_OCTETS = 60 * 1024 * 1024;
const APERCU_LIGNES = 20;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface RefusBaseClients {
  ok: false;
  motif: string;
  /** Noms des colonnes refusées parce qu'elles ressemblent à une donnée sensible (même non associées). */
  colonnesSensiblesRefusees: string[];
}

export interface FichierLu {
  ok: true;
  format: FormatBaseClients;
  empreinteFichier: string;
  tailleOctets: number;
  colonnes: string[];
  /** Lignes de données (sans l'en-tête). TRANSITOIRE : ne jamais stocker. */
  lignes: string[][];
  /** 20 premières lignes pour l'écran de correspondance, formules neutralisées. TRANSITOIRE. */
  apercu: string[][];
  formulesNeutralisees: number;
  injectionsSignalees: string[];
}

export interface EntreeLecture {
  nomFichier: string;
  format: FormatBaseClients;
  contenu: Uint8Array;
  /** CSV : séparateur attendu ; refus s'il diffère du séparateur détecté sur l'en-tête (`;` ou `,`). */
  separateur?: ";" | "," | "\t";
}

export interface EntreePreparation extends EntreeLecture {
  correspondance: CorrespondanceColonnes;
  finalite: string;
  dureeConservationMois?: number;
}

export interface ClesImport {
  /** Clé AES-256 (32 octets). */
  chiffrement: Uint8Array;
  /** Clé HMAC distincte (au moins 32 octets). */
  hmac: Uint8Array;
}

export interface ContexteImport {
  companyId: string;
  importePar: string;
  /** Horodatage ISO 8601 avec décalage. */
  maintenant: string;
  mode: ModeExecution;
  importId?: string;
  /** Générateur d'identifiants (GUID) ; `randomUUID` par défaut, injectable pour les tests. */
  genererId?: () => string;
}

export interface ImportPrepare {
  ok: true;
  import: ImportBaseClients;
  clients: ClientBase[];
}

/* ------------------------------------------------------------------ */
/* Colonnes sensibles                                                  */
/* ------------------------------------------------------------------ */

/**
 * Noms de colonnes qui ressemblent à une donnée de santé, de sinistre ou bancaire (§4.3). Comparaison
 * sans accents ni casse, par mots entiers (singulier ou pluriel) : « public » ne contient pas « bic ».
 */
export function colonnesSensibles(colonnes: readonly string[]): string[] {
  return colonnes.filter((c) => {
    const texte = ` ${sansAccents(c).split(/[^a-z0-9]+/u).filter(Boolean).join(" ")} `;
    return MOTS_COLONNES_SENSIBLES.some((mot) => texte.includes(` ${mot} `) || texte.includes(` ${mot}s `));
  });
}

/* ------------------------------------------------------------------ */
/* Lecture du fichier                                                  */
/* ------------------------------------------------------------------ */

const refus = (motif: string, colonnesSensiblesRefusees: string[] = []): RefusBaseClients => ({ ok: false, motif, colonnesSensiblesRefusees });

/**
 * Analyse CSV (RFC 4180, guillemets doublés). Écrite ici et non réutilisée depuis `imports.ts` : cette
 * dernière plafonne à 5 000 lignes (importLignesCsvMax) alors que la base de clients va à 50 000.
 */
function lireCsv(contenu: string): { lignes: string[][]; separateur: string } | { erreur: string } {
  const premiere = contenu.split(/\r?\n/u, 1)[0] ?? "";
  const separateur = (premiere.match(/;/gu)?.length ?? 0) > (premiere.match(/,/gu)?.length ?? 0) ? ";" : (premiere.includes("\t") && !premiere.includes(",") ? "\t" : ",");
  const lignes: string[][] = [];
  let champ = "";
  let ligne: string[] = [];
  let guillemets = false;
  const fermerLigne = () => {
    ligne.push(champ);
    champ = "";
    if (!(ligne.length === 1 && ligne[0] === "")) lignes.push(ligne);
    ligne = [];
  };
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
      fermerLigne();
      if (lignes.length > LIMITES_PROSPECTION.baseClientsLignesMax + 1) return { erreur: `Plus de ${LIMITES_PROSPECTION.baseClientsLignesMax} lignes.` };
    } else champ += c;
  }
  if (guillemets) return { erreur: "Guillemet non fermé." };
  if (champ !== "" || ligne.length > 0) fermerLigne();
  if (lignes.length > LIMITES_PROSPECTION.baseClientsLignesMax + 1) return { erreur: `Plus de ${LIMITES_PROSPECTION.baseClientsLignesMax} lignes.` };
  return { lignes, separateur };
}

function matriceXlsx(octets: Uint8Array): string[][] | { erreur: string } {
  const tampon = Buffer.from(octets.buffer, octets.byteOffset, octets.byteLength);
  if (tampon.length < 4 || tampon.readUInt32LE(0) !== 0x04034b50) return { erreur: "Ce n'est pas un classeur XLSX (archive attendue)." };
  if (tampon.includes("vbaProject")) return { erreur: "Classeur à macros refusé (vbaProject)." };
  const decompresse = tailleDecompressee(octets);
  if (decompresse === null) return { erreur: "Classeur illisible ou corrompu." };
  if (decompresse > XLSX_DECOMPRESSE_MAX_OCTETS) return { erreur: "Classeur trop volumineux une fois décompressé." };
  let classeur: XLSX.WorkBook;
  try {
    classeur = XLSX.read(octets, {
      type: "array",
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      cellNF: false,
      bookVBA: false,
      cellDates: true,
      sheetRows: LIMITES_PROSPECTION.baseClientsLignesMax + 2,
    });
  } catch {
    return { erreur: "Classeur illisible ou corrompu." };
  }
  const nom = classeur.SheetNames[0];
  const feuille = nom === undefined ? undefined : classeur.Sheets[nom];
  if (!feuille) return { erreur: "Classeur sans feuille." };
  const brut = XLSX.utils.sheet_to_json<unknown[]>(feuille, { header: 1, raw: true, blankrows: false, defval: "" });
  if (brut.length > LIMITES_PROSPECTION.baseClientsLignesMax + 1) return { erreur: `Plus de ${LIMITES_PROSPECTION.baseClientsLignesMax} lignes.` };
  return brut.map((l) => l.map(celluleEnTexte));
}

/**
 * Un tableur qui lit « 0471 23 45 67 » comme un nombre perd le 0 initial (471234567) ou le « + »
 * (32471234567). On ne restaure que ces deux formes exactes : 8 ou 9 chiffres sans 0 initial,
 * ou 32 suivi de 8 ou 9 chiffres ; tout le reste passe tel quel au contrôle E.164.
 */
export function zeroInitialRestaure(brut: string): string {
  const t = brut.trim();
  if (/^[1-9]\d{7,8}$/u.test(t)) return `0${t}`;
  if (/^32[1-9]\d{7,8}$/u.test(t)) return `+${t}`;
  return t;
}

function celluleEnTexte(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  return String(v);
}

/** Contrôle le fichier, extrait colonnes et lignes, refuse les colonnes sensibles. Rien n'est conservé. */
export function lireFichierBaseClients(entree: EntreeLecture): FichierLu | RefusBaseClients {
  const nom = entree.nomFichier.trim();
  if (!nom || /[/\\\0]/u.test(nom) || nom.startsWith(".")) return refus("Nom de fichier invalide.");
  if (/\.xls[mb]$/iu.test(nom)) return refus("Fichier à macros ou binaire refusé (.xlsm, .xlsb).");
  if (!nom.toLowerCase().endsWith(`.${entree.format}`)) return refus("L'extension du fichier doit correspondre au format.");
  const tailleOctets = entree.contenu.byteLength;
  if (tailleOctets === 0) return refus("Fichier vide.");
  if (tailleOctets > LIMITES_PROSPECTION.baseClientsTailleMaxOctets) {
    return refus(`Fichier trop volumineux (${tailleOctets} octets, maximum ${LIMITES_PROSPECTION.baseClientsTailleMaxOctets}).`);
  }
  const empreinteFichier = createHash("sha256").update(entree.contenu).digest("hex");

  let matrice: string[][];
  let texteComplet: string;
  if (entree.format === "csv") {
    let texte: string;
    try {
      texte = new TextDecoder("utf-8", { fatal: true }).decode(entree.contenu);
    } catch {
      return refus("Contenu binaire ou encodage non UTF-8.");
    }
    if (texte.charCodeAt(0) === 0xfeff) texte = texte.slice(1);
    if (texte.includes("\0")) return refus("Contenu binaire ou encodage non UTF-8.");
    if (/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/u.test(texte)) return refus("Caractères de contrôle interdits dans un fichier CSV.");
    const analyse = lireCsv(texte);
    if ("erreur" in analyse) return refus(`CSV invalide : ${analyse.erreur}`);
    if (entree.separateur !== undefined && entree.separateur !== analyse.separateur) {
      return refus(`Séparateur détecté « ${analyse.separateur === "\t" ? "tabulation" : analyse.separateur} » différent du séparateur demandé.`);
    }
    matrice = analyse.lignes;
    texteComplet = texte;
  } else {
    const m = matriceXlsx(entree.contenu);
    if ("erreur" in m) return refus(m.erreur);
    matrice = m;
    texteComplet = m.map((l) => l.join(" ")).join("\n");
  }

  const [entete, ...lignes] = matrice;
  if (!entete || entete.length === 0) return refus("Fichier sans en-tête.");
  if (entete.length > LIMITES_PROSPECTION.baseClientsColonnesMax) return refus(`Plus de ${LIMITES_PROSPECTION.baseClientsColonnesMax} colonnes.`);
  const colonnes = entete.map((c) => c.trim());
  if (colonnes.some((c) => c === "")) return refus("En-tête avec une colonne sans nom.");
  if (new Set(colonnes.map((c) => c.toLowerCase())).size !== colonnes.length) return refus("En-tête avec des colonnes en double.");

  const sensibles = colonnesSensibles(colonnes);
  if (sensibles.length > 0) {
    return refus(`Colonnes refusées (donnée de santé, de sinistre ou bancaire) : ${sensibles.join(", ")}. Retirez-les du fichier.`, sensibles);
  }

  let formules = 0;
  const neutraliser = (cellule: string) => {
    if (/^[=+\-@\t\r]/u.test(cellule)) {
      formules += 1;
      return `'${cellule}`;
    }
    return cellule;
  };
  for (const l of lignes) for (const c of l) if (/^[=+\-@\t\r]/u.test(c)) formules += 1;
  const total = formules;
  formules = 0;
  const apercu = lignes.slice(0, APERCU_LIGNES).map((l) => l.map(neutraliser));
  return {
    ok: true,
    format: entree.format,
    empreinteFichier,
    tailleOctets,
    colonnes,
    lignes,
    apercu,
    formulesNeutralisees: total,
    injectionsSignalees: injectionsSignalees(texteComplet),
  };
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Valeur normalisée d'un identifiant avant empreinte (§4.2) : courriel en minuscules sans espaces,
 * téléphone E.164, nom + code postal sans accents ni casse, numéro BCE en 10 chiffres, identifiant
 * client sans espaces autour. Rend null si la valeur n'est pas exploitable.
 */
export function normaliserPourEmpreinte(type: TypeEmpreinte, brut: string): string | null {
  const v = brut.trim();
  if (v === "") return null;
  switch (type) {
    case "courriel":
      return courrielValide(v) ? v.toLowerCase() : null;
    case "telephone":
      return telephoneBelgeE164(v);
    case "numero_bce":
      return bceValide(v) ? v.toUpperCase().replace(/^BE/u, "").replace(/[\s.]/gu, "") : null;
    case "identifiant_client":
      return v;
    case "nom_code_postal": {
      const [nom = "", cp = ""] = v.split("|");
      const n = sansAccents(nom).replace(/\s+/gu, " ").trim();
      return n && /^\d{4}$/u.test(cp.trim()) ? `${n}|${cp.trim()}` : null;
    }
  }
}

function formaterBce(normalise: string): string {
  return `${normalise.slice(0, 4)}.${normalise.slice(4, 7)}.${normalise.slice(7)}`;
}

function lireDate(texte: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/u.exec(texte) ?? /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/u.exec(texte);
  if (!m) return null;
  const [a, b, c] = [m[1]!, m[2]!, m[3]!];
  const [annee, mois, jour] = a.length === 4 ? [a, b, c] : [c, b, a];
  const iso = `${annee}-${mois.padStart(2, "0")}-${jour.padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

function lireBooleen(texte: string): boolean | null | undefined {
  const t = sansAccents(texte).trim();
  if (t === "") return null;
  if (["oui", "o", "yes", "y", "true", "vrai", "1", "ja"].includes(t)) return true;
  if (["non", "n", "no", "false", "faux", "0", "nee"].includes(t)) return false;
  return undefined;
}

/** Code d'offre proposé pour un libellé de produit (minuscules, tirets) ; null s'il n'est pas un code valide. */
function codeOffre(produit: string): string | null {
  const code = sansAccents(produit).replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  return /^[a-z0-9][a-z0-9-]{1,39}$/u.test(code) ? code : null;
}

/* ------------------------------------------------------------------ */
/* Préparation des clients                                             */
/* ------------------------------------------------------------------ */

class RejetLigne extends Error {}
const rejeter = (motif: string): never => {
  throw new RejetLigne(motif);
};

function ajouterMois(iso: string, mois: number): string {
  const d = new Date(iso);
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + mois);
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernier));
  return d.toISOString();
}

/** Date de purge : date d'import + durée de conservation en mois. */
export function calculerPurge(importeLe: string, dureeConservationMois: number): string {
  return ajouterMois(importeLe, dureeConservationMois);
}

/** Vrai si la base importée doit être purgée à `maintenant` (durée de conservation écoulée). */
export function aPurger(imp: Pick<ImportBaseClients, "importeLe" | "dureeConservationMois">, maintenant: string): boolean {
  return Date.parse(maintenant) >= Date.parse(calculerPurge(imp.importeLe, imp.dureeConservationMois));
}

function construireClient(
  valeurs: Partial<Record<ColonneCible, string>>,
  cles: ClesImport,
  ctx: ContexteImport,
  importId: string,
  id: string,
): ClientBase {
  const v = (c: ColonneCible) => (valeurs[c] ?? "").trim();
  for (const [cible, texte] of Object.entries(valeurs)) {
    if (/^[=@]/u.test(texte.trim())) rejeter(`Colonne « ${cible} » : cellule commençant par = ou @ (formule de tableur).`);
  }

  const bceBrut = v("numero_bce");
  // En démonstration, les numéros BCE fictifs ont volontairement un contrôle modulo 97 faux (jamais une
  // vraie entreprise) : on n'exige alors que la forme (10 chiffres). En réel, le contrôle reste entier.
  const bceForme = bceBrut ? bceBrut.toUpperCase().replace(/^BE/u, "").replace(/[\s.]/gu, "") : "";
  const bce = bceBrut
    ? (normaliserPourEmpreinte("numero_bce", bceBrut) ?? (ctx.mode === "demonstration" && /^[01]\d{9}$/u.test(bceForme) ? bceForme : null))
    : null;
  if (bceBrut && bce === null) rejeter("Numéro BCE invalide (10 chiffres, contrôle modulo 97).");
  const entreprise = v("entreprise") || null;
  if (entreprise !== null && entreprise.length > 300) rejeter("Dénomination d'entreprise trop longue (300 caractères maximum).");

  const typeBrut = sansAccents(v("type_client"));
  let typeClient: "particulier" | "entreprise";
  if (typeBrut === "") typeClient = bce !== null || entreprise !== null ? "entreprise" : "particulier";
  else if (/^(particulier|b2c|personne)/u.test(typeBrut)) typeClient = "particulier";
  else if (/^(entreprise|b2b|societe|professionnel)/u.test(typeBrut)) typeClient = "entreprise";
  else return rejeter("Type de client inconnu (particulier ou entreprise attendu).");
  if (typeClient === "particulier" && (bce !== null || entreprise !== null)) rejeter("Un particulier n'a ni numéro BCE ni entreprise.");

  const courrielBrut = v("courriel");
  if (courrielBrut && !courrielValide(courrielBrut)) rejeter("Adresse électronique invalide.");
  const telBrut = v("telephone");
  const tel = telBrut ? telephoneBelgeE164(zeroInitialRestaure(telBrut)) : null;
  if (telBrut && tel === null) rejeter("Numéro de téléphone belge invalide.");
  const cp = v("code_postal") || null;
  if (cp !== null && !/^\d{4}$/u.test(cp)) rejeter("Code postal belge à 4 chiffres attendu.");
  const commune = v("commune") || null;
  if (commune !== null && commune.length > 120) rejeter("Commune trop longue (120 caractères maximum).");

  const debutBrut = v("debut_contrat");
  const debut = debutBrut ? lireDate(debutBrut) : null;
  if (debutBrut && debut === null) rejeter("Date de début de contrat invalide (AAAA-MM-JJ ou JJ/MM/AAAA).");

  const statutBrut = sansAccents(v("statut_client"));
  let statut: "actif" | "ancien";
  if (statutBrut === "" || /^(actif|active|en cours|client)/u.test(statutBrut)) statut = "actif";
  else if (/^(ancien|ancienne|resili|termine|inactif|perdu|ex)/u.test(statutBrut)) statut = "ancien";
  else return rejeter("Statut inconnu (actif ou ancien attendu).");

  const consentements = { courriel: null as boolean | null, sms: null as boolean | null, telephone: null as boolean | null };
  for (const canal of ["courriel", "sms", "telephone"] as const) {
    const b = lireBooleen(v(`consentement_${canal}` as ColonneCible));
    if (b === undefined) rejeter(`Consentement ${canal} : oui, non ou vide attendu.`);
    else consentements[canal] = b;
  }

  const produitsDetenus = [...new Set(v("produits_detenus").split(/[;|,]/u).map((p) => p.trim()).filter(Boolean))];
  if (produitsDetenus.length > 50) rejeter("Plus de 50 produits détenus.");
  if (produitsDetenus.some((p) => p.length > 120)) rejeter("Libellé de produit trop long (120 caractères maximum).");

  // Empreintes (valeurs normalisées).
  const empreintes: Empreinte[] = [];
  const ajouter = (type: TypeEmpreinte, normalise: string | null) => {
    if (normalise !== null) empreintes.push({ type, valeur: empreinte(type, normalise, cles.hmac) });
  };
  ajouter("identifiant_client", normaliserPourEmpreinte("identifiant_client", v("identifiant_client")));
  ajouter("numero_bce", bce);
  ajouter("courriel", courrielBrut ? normaliserPourEmpreinte("courriel", courrielBrut) : null);
  ajouter("telephone", tel);
  const nomComplet = [v("prenom"), v("nom")].filter(Boolean).join(" ") || entreprise || "";
  if (cp !== null && nomComplet) ajouter("nom_code_postal", normaliserPourEmpreinte("nom_code_postal", `${nomComplet}|${cp}`));
  if (empreintes.length === 0) rejeter("Aucun identifiant exploitable (identifiant client, BCE, courriel, téléphone, ou nom et code postal).");

  // Identifiants directs chiffrés (valeur d'origine nettoyée).
  const donneesChiffrees: Partial<Record<"identifiant_client" | "nom" | "prenom" | "courriel" | "telephone" | "adresse", string>> = {};
  for (const colonne of ["identifiant_client", "nom", "prenom", "courriel", "telephone", "adresse"] as const) {
    const brut = v(colonne);
    if (brut === "") continue;
    if (brut.length > 1000) rejeter(`Colonne « ${colonne} » : valeur trop longue (1000 caractères maximum).`);
    donneesChiffrees[colonne] = chiffrer(brut, cles.chiffrement);
  }

  const contrats: ContratDetenu[] = produitsDetenus.map((produit) => ({
    entite: null,
    offre: codeOffre(produit),
    produit,
    fournisseur: null,
    debut,
    fin: null,
  }));

  const candidat = {
    id,
    companyId: ctx.companyId,
    importId,
    typeClient,
    etablissement: null,
    entites: [],
    segments: [],
    pseudonyme: `[client-${empreintes[0]!.valeur.slice(0, 8)}]`,
    contrats,
    donneesChiffrees,
    empreintes,
    entreprise: typeClient === "entreprise" ? entreprise : null,
    numeroBce: bce === null ? null : formaterBce(bce),
    codePostal: cp,
    commune,
    produitsDetenus,
    debutContrat: debut,
    statut,
    consentements,
    mode: ctx.mode,
    creeLe: ctx.maintenant,
  };
  const valide = ClientBase.safeParse(candidat);
  if (!valide.success) return rejeter(`Ligne non conforme : ${valide.error.issues[0]?.message ?? "invalide"}`.slice(0, 300));
  return valide.data;
}

/**
 * Prépare un import complet : lecture, correspondance, rejet ligne par ligne (compte exact, détail
 * limité à 200), chiffrement et empreintes. Ne lit ni n'écrit rien d'autre.
 */
export function preparerImportBaseClients(entree: EntreePreparation, cles: ClesImport, ctx: ContexteImport): ImportPrepare | RefusBaseClients {
  if (cles.chiffrement.byteLength !== TAILLE_CLE_CHIFFREMENT) throw new ErreurChiffrement("cle_invalide", "Clé de chiffrement de 32 octets attendue.");
  if (cles.hmac.byteLength < TAILLE_CLE_HMAC_MIN) throw new ErreurChiffrement("cle_invalide", "Clé HMAC d'au moins 32 octets attendue.");
  if (memeCle(cles.chiffrement, cles.hmac)) throw new ErreurChiffrement("cle_invalide", "La clé HMAC doit être distincte de la clé de chiffrement.");

  const correspondance = CorrespondanceColonnes.safeParse(entree.correspondance);
  if (!correspondance.success) return refus(`Correspondance de colonnes invalide : ${correspondance.error.issues[0]?.message ?? "invalide"}`);
  const duree = entree.dureeConservationMois ?? LIMITES_PROSPECTION.conservationMoisDefaut;
  if (!Number.isInteger(duree) || duree < 1 || duree > LIMITES_PROSPECTION.conservationMoisMax) {
    return refus(`Durée de conservation de 1 à ${LIMITES_PROSPECTION.conservationMoisMax} mois attendue.`);
  }
  const finalite = entree.finalite.trim();
  if (finalite.length < 10 || finalite.length > 500) return refus("Finalité de 10 à 500 caractères attendue.");

  const fichier = lireFichierBaseClients(entree);
  if (!fichier.ok) return fichier;

  const indexColonne = new Map(fichier.colonnes.map((c, i) => [c, i]));
  const absentes = correspondance.data.filter((c) => !indexColonne.has(c.colonne)).map((c) => c.colonne);
  if (absentes.length > 0) return refus(`Colonnes absentes du fichier : ${absentes.join(", ")}.`);
  const colonnesRetenues = correspondance.data.filter((c) => c.cible !== "ignorer");

  const genererId = ctx.genererId ?? randomUUID;
  const importId = ctx.importId ?? genererId();
  const clients: ClientBase[] = [];
  const rejets: { ligne: number; motif: string }[] = [];
  let rejetees = 0;

  fichier.lignes.forEach((cellules, i) => {
    const numeroLigne = i + 2;
    const rejet = (motif: string) => {
      rejetees += 1;
      if (rejets.length < LIMITES_PROSPECTION.rejetsDetaillesMax) rejets.push({ ligne: numeroLigne, motif: motif.slice(0, 300) });
    };
    if (cellules.length !== fichier.colonnes.length) {
      rejet(`${cellules.length} colonnes au lieu de ${fichier.colonnes.length}.`);
      return;
    }
    const valeurs: Partial<Record<ColonneCible, string>> = {};
    for (const c of colonnesRetenues) valeurs[c.cible] = cellules[indexColonne.get(c.colonne)!] ?? "";
    try {
      clients.push(construireClient(valeurs, cles, ctx, importId, genererId()));
    } catch (e) {
      if (e instanceof RejetLigne) rejet(e.message);
      else throw e;
    }
  });

  const compte = ImportBaseClients.parse({
    id: importId,
    companyId: ctx.companyId,
    nomFichier: entree.nomFichier.trim(),
    format: fichier.format,
    empreinteFichier: fichier.empreinteFichier,
    lignesLues: fichier.lignes.length,
    lignesRetenues: clients.length,
    lignesRejetees: rejetees,
    rejets,
    correspondance: correspondance.data,
    colonnesSensiblesRefusees: [],
    finalite,
    dureeConservationMois: duree,
    purgeLe: calculerPurge(ctx.maintenant, duree),
    mode: ctx.mode,
    importePar: ctx.importePar,
    importeLe: ctx.maintenant,
  });
  return { ok: true, import: compte, clients };
}

/* ------------------------------------------------------------------ */
/* Ventes croisées                                                     */
/* ------------------------------------------------------------------ */

/**
 * Offres détenues par un client à une date : celles de ses contrats non terminés. Un client « ancien »
 * ne détient rien (contrat résilié), et un contrat dont la fin est passée ne compte pas.
 */
function offresDetenues(client: ClientBase, aujourdhui: string): Set<string> {
  const detenues = new Set<string>();
  if (client.statut !== "actif") return detenues;
  for (const c of client.contrats) {
    if (c.offre === null) continue;
    if (c.fin !== null && c.fin < aujourdhui) continue;
    detenues.add(c.offre);
  }
  return detenues;
}

/**
 * Règle pure : pour chaque client actif, les offres à proposer. Une règle s'applique si le client
 * détient `detenue`, ne détient pas `proposee`, est du bon type et de la même entreprise. Les clients
 * anciens (contrats résiliés) ne génèrent aucune opportunité. Résultat trié, sans valeur en clair.
 */
export function opportunitesVenteCroisee(
  clients: readonly ClientBase[],
  regles: readonly RegleVenteCroisee[],
  maintenant: string = new Date().toISOString(),
): OpportuniteVenteCroisee[] {
  const aujourdhui = maintenant.slice(0, 10);
  const sortie: OpportuniteVenteCroisee[] = [];
  for (const client of clients) {
    const detenues = offresDetenues(client, aujourdhui);
    const declencheurs = new Set<string>();
    const proposees = new Set<string>();
    for (const r of regles) {
      if (r.companyId !== client.companyId || r.typeClient !== client.typeClient) continue;
      if (detenues.has(r.detenue) && !detenues.has(r.proposee)) {
        declencheurs.add(r.detenue);
        proposees.add(r.proposee);
      }
    }
    if (proposees.size === 0) continue;
    sortie.push(
      OpportuniteVenteCroisee.parse({
        clientId: client.id,
        pseudonyme: client.pseudonyme,
        typeClient: client.typeClient,
        detenus: [...declencheurs].sort(),
        proposes: [...proposees].sort(),
        zone: { codePostal: client.codePostal, commune: client.commune, province: null, region: null, pays: "BE" },
        mode: client.mode,
      }),
    );
  }
  return sortie;
}
