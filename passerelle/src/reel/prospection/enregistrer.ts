// Enregistrement des fournisseurs réels de prospection (lots P3, P3b et P4) : `bce` (index BCE Open Data), `osm` (extrait
// OpenStreetMap) et `bnb` (Centrale des bilans, API distante, clé PASSERELLE_BNB_CLE). Appelé au démarrage (src/demarrer.ts, une ligne) en mode `reel` seulement.
//
// Accès : un JETON PORTEUR STATIQUE (authentification « api_key » de Paperclip) lu dans PASSERELLE_PROSPECTION_JETON ou dans le
// fichier 0600 PASSERELLE_PROSPECTION_JETON_FICHIER. Les données sont locales : il n'y a aucun compte tiers à autoriser, donc
// aucun flux OAuth. Sans jeton, rien n'est servi (le journal le dit, sans jamais citer de valeur).
//
// Index : PASSERELLE_BCE_INDEX et PASSERELLE_OSM_INDEX (par défaut passerelle/etat/bce/bce.sqlite et passerelle/etat/osm/osm.sqlite,
// dossier ignoré par git). Si un index n'existe pas encore, le service est servi quand même et chaque outil répond par une erreur
// claire (« aucun fichier importé ») : on peut donc importer sans redémarrer la passerelle.

import { join } from "node:path";
import type { RegistreFournisseurs } from "../../fournisseurs.js";
import { DOSSIER_ETAT_PAR_DEFAUT, JetonStatique, lireFichierSecret } from "./commun.js";
import { IndexBce } from "./bce/index.js";
import { CentroidesOsm } from "./osm/centroides.js";
import { fournisseurBceReel, PROPRIETE_BCE_REEL } from "./bce/outils.js";
import { fournisseurOsmReel, IndexOsm } from "./osm/outils.js";
import { ClientBnb, configDepuisEnv } from "./bnb/client.js";
import { fournisseurBnbReel, PROPRIETE_BNB_REEL } from "./bnb/outils.js";
import { PROPRIETE_OSM_REEL } from "../../demo/prospection/osm-commun.js";

export const SERVICES_PROSPECTION_REELS = ["bce", "osm", "bnb"] as const;

export interface OptionsProspectionReel {
  journal?: (message: string) => void;
  /** Dossier d'état (essais) ; sinon passerelle/etat/. */
  dossierEtat?: string;
}

export interface ProspectionReelle {
  services: string[];
  indexBce: IndexBce;
  indexOsm: IndexOsm;
  fermer(): void;
}

export function cheminsIndex(env: NodeJS.ProcessEnv, dossierEtat: string = DOSSIER_ETAT_PAR_DEFAUT): { bce: string; osm: string } {
  return {
    bce: env["PASSERELLE_BCE_INDEX"]?.trim() || join(dossierEtat, "bce", "bce.sqlite"),
    osm: env["PASSERELLE_OSM_INDEX"]?.trim() || join(dossierEtat, "osm", "osm.sqlite"),
  };
}

/** Configuration BNB tolérante : clé illisible ou absente = service servi quand même, l'outil répond par une erreur claire. */
function lireConfigBnb(env: NodeJS.ProcessEnv, journal: (message: string) => void): ReturnType<typeof configDepuisEnv> {
  let config;
  try {
    config = configDepuisEnv(env, lireFichierSecret);
  } catch (e) {
    journal(`bnb réel : ${e instanceof Error ? e.message : "clé illisible"}`);
    config = configDepuisEnv({ ...env, PASSERELLE_BNB_CLE: "", PASSERELLE_BNB_CLE_FICHIER: "" }, lireFichierSecret);
  }
  if (!config.cle) journal("bnb réel : clé BNB absente (PASSERELLE_BNB_CLE ou PASSERELLE_BNB_CLE_FICHIER) ; l'outil bnb_comptes répondra par une erreur claire.");
  return config;
}

/** Inscrit `bce` et `osm` en mode réel. Renvoie `null` (rien n'est servi) si le jeton d'accès n'est pas configuré. */
export function enregistrerProspectionReel(registre: RegistreFournisseurs, env: NodeJS.ProcessEnv, options: OptionsProspectionReel = {}): ProspectionReelle | null {
  const journal = options.journal ?? ((): void => undefined);
  let jeton: JetonStatique | null;
  try {
    jeton = JetonStatique.depuisEnv(env);
  } catch (e) {
    journal(`Prospection réelle (bce, osm) non servie : ${e instanceof Error ? e.message : "jeton illisible"}`);
    return null;
  }
  if (!jeton) {
    journal("Prospection réelle (bce, osm) non servie : jeton d'accès absent (PASSERELLE_PROSPECTION_JETON ou PASSERELLE_PROSPECTION_JETON_FICHIER).");
    return null;
  }
  const chemins = cheminsIndex(env, options.dossierEtat);
  const indexBce = new IndexBce(chemins.bce);
  const indexOsm = new IndexOsm(chemins.osm);
  const centroides = new CentroidesOsm(chemins.osm);
  registre.enregistrer(fournisseurBceReel(() => indexBce, (t) => jeton.verifier(t, PROPRIETE_BCE_REEL), () => centroides));
  registre.enregistrer(fournisseurOsmReel(() => indexOsm, (t) => jeton.verifier(t, PROPRIETE_OSM_REEL)));
  // P4 : bnb (API « Query authentic data » de la BNB). Clé absente ou fichier illisible : le service est servi quand même et l'outil répond « clé BNB invalide ou absente ».
  const configBnb = lireConfigBnb(env, journal);
  registre.enregistrer(fournisseurBnbReel(new ClientBnb(configBnb), (t) => jeton.verifier(t, PROPRIETE_BNB_REEL)));
  if (!indexBce.disponible()) journal(`bce réel : aucun index à ${chemins.bce} (importer un fichier complet : voir docs/passerelle.md). Les outils répondent par une erreur claire d'ici là.`);
  if (!indexOsm.disponible()) journal(`osm réel : aucun index à ${chemins.osm} (importer un extrait : voir docs/passerelle.md). Les outils répondent par une erreur claire d'ici là.`);
  return { services: [...SERVICES_PROSPECTION_REELS], indexBce, indexOsm, fermer: () => { indexBce.fermer(); indexOsm.fermer(); } };
}

/**
 * Mélange (PASSERELLE_SERVICES_REELS=osm, passerelle en démonstration) : inscrit SEUL le fournisseur réel `osm`. L'accès est
 * celui de la démonstration (OAuth local, vérifié par le serveur) : aucun jeton statique n'est exigé ici, car les données
 * sont publiques (ODbL) et locales ; la vérification de jeton du fournisseur réel ne sert pas dans ce mode et refuse tout.
 * Sans index importé, le service répond « aucun fichier importé » (erreur claire), jamais de données fictives.
 */
export function enregistrerOsmReelSeul(registre: RegistreFournisseurs, env: NodeJS.ProcessEnv, options: OptionsProspectionReel = {}): IndexOsm {
  const journal = options.journal ?? ((): void => undefined);
  const chemin = cheminsIndex(env, options.dossierEtat).osm;
  const indexOsm = new IndexOsm(chemin);
  registre.enregistrer(fournisseurOsmReel(() => indexOsm, () => null));
  if (indexOsm.disponible()) journal(`osm RÉEL (mélange, passerelle en démonstration) : index ${chemin}`);
  else journal(`osm RÉEL (mélange) : aucun index à ${chemin} (importer un extrait : voir docs/passerelle.md). Les outils répondent par une erreur claire d'ici là.`);
  return indexOsm;
}

/**
 * Mélange (PASSERELLE_SERVICES_REELS=bce, passerelle en démonstration) : inscrit SEUL le fournisseur réel `bce` (index SQLite
 * local, PASSERELLE_BCE_INDEX). Accès par le OAuth local de la démonstration, comme `osm` (données publiques, locales).
 * Index absent ou vide : le démarrage continue et chaque outil répond une erreur claire, jamais de données fictives.
 */
export function enregistrerBceReelSeul(registre: RegistreFournisseurs, env: NodeJS.ProcessEnv, options: OptionsProspectionReel = {}): IndexBce {
  const journal = options.journal ?? ((): void => undefined);
  const chemin = cheminsIndex(env, options.dossierEtat).bce;
  const indexBce = new IndexBce(chemin);
  const centroides = new CentroidesOsm(cheminsIndex(env, options.dossierEtat).osm);
  registre.enregistrer(fournisseurBceReel(() => indexBce, () => null, () => centroides));
  if (indexBce.disponible()) journal(`bce RÉEL (mélange, passerelle en démonstration) : index ${chemin}`);
  else journal(`bce RÉEL (mélange) : index BCE absent à ${chemin} (lancer cli.js bce-telecharger --importer). Les outils répondent par une erreur claire d'ici là.`);
  return indexBce;
}

/**
 * Mélange (PASSERELLE_SERVICES_REELS=bnb, passerelle en démonstration) : inscrit SEUL le fournisseur réel `bnb` (API CBSO de la
 * BNB, clé PASSERELLE_BNB_CLE ou PASSERELLE_BNB_CLE_FICHIER). Aucun appel n'est fait au démarrage. Clé absente : l'outil répond
 * « Clé BNB invalide ou absente », jamais de données fictives.
 */
export function enregistrerBnbReelSeul(registre: RegistreFournisseurs, env: NodeJS.ProcessEnv, options: OptionsProspectionReel = {}): void {
  const journal = options.journal ?? ((): void => undefined);
  const configBnb = lireConfigBnb(env, journal);
  registre.enregistrer(fournisseurBnbReel(new ClientBnb(configBnb), () => null));
  if (configBnb.cle) journal("bnb RÉEL (mélange, passerelle en démonstration) : API de la BNB, clé présente");
}
