// Réglages de la passerelle et garde « boucle locale seulement ».

import type { ModePasserelle } from "./fournisseurs.js";

export const HOTE_PAR_DEFAUT = "127.0.0.1";
export const PORT_PAR_DEFAUT = 3190;

const HOTES_ECOUTE_PERMIS = new Set(["127.0.0.1", "::1"]);

/** Refuse toute adresse d'écoute autre que la boucle locale (0.0.0.0, IP du réseau, nom d'hôte...). */
export function verifierHoteEcoute(hote: string): string {
  if (!HOTES_ECOUTE_PERMIS.has(hote)) {
    throw new Error(
      `Adresse d'écoute refusée : « ${hote} ». La passerelle n'écoute que sur la boucle locale (127.0.0.1 ou ::1).`,
    );
  }
  return hote;
}

export function lireMode(valeur: string | undefined): ModePasserelle {
  if (valeur === undefined || valeur === "" || valeur === "demonstration") return "demonstration";
  if (valeur === "reel") return "reel";
  throw new Error(`Mode inconnu : « ${valeur} » (valeurs permises : demonstration, reel).`);
}

export function lirePort(valeur: string | undefined): number {
  if (valeur === undefined || valeur === "") return PORT_PAR_DEFAUT;
  if (!/^\d{1,5}$/.test(valeur)) throw new Error(`Port invalide : « ${valeur} ».`);
  const port = Number(valeur);
  if (port > 65535) throw new Error(`Port invalide : « ${valeur} ».`);
  return port;
}

export interface ReglagesEnvironnement {
  mode: ModePasserelle;
  hote: string;
  port: number;
}

/** Lit PASSERELLE_MODE, PASSERELLE_HOTE et PASSERELLE_PORT. */
export function lireReglages(env: NodeJS.ProcessEnv): ReglagesEnvironnement {
  return {
    mode: lireMode(env["PASSERELLE_MODE"]),
    hote: verifierHoteEcoute(env["PASSERELLE_HOTE"] ?? HOTE_PAR_DEFAUT),
    port: lirePort(env["PASSERELLE_PORT"]),
  };
}

/**
 * Lit PASSERELLE_SERVICES_REELS : liste de services (séparés par des virgules ou des espaces) servis par leur fournisseur
 * RÉEL alors que la passerelle est en démonstration (mélange). Seuls les services sans compte de tiers
 * (`osm` et `bce` : index locaux ; `bnb` : API de la BNB par simple clé ; `liens` : lecture d'URL protégée) sont permis : les autres fournisseurs réels exigent le mode réel complet (comptes et jetons de tiers).
 */
export const SERVICES_REELS_MELANGEABLES: readonly string[] = ["osm", "liens", "bce", "bnb"];

export function lireServicesReels(env: NodeJS.ProcessEnv): string[] {
  const brut = env["PASSERELLE_SERVICES_REELS"]?.trim() ?? "";
  if (brut === "") return [];
  const noms = [...new Set(brut.split(/[\s,]+/).filter((n) => n !== ""))];
  for (const nom of noms) {
    if (!SERVICES_REELS_MELANGEABLES.includes(nom)) {
      throw new Error(`PASSERELLE_SERVICES_REELS : service « ${nom} » non permis en mélange (permis : ${SERVICES_REELS_MELANGEABLES.join(", ")}).`);
    }
  }
  return noms;
}
