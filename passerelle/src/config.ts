// Réglages de la passerelle et garde « boucle locale seulement ».

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

/**
 * PASSERELLE_MODE n'existe plus : la passerelle n'a plus de mode démonstration, tout est réel. Une ancienne
 * valeur « demonstration » est refusée avec un message clair (au lieu d'être ignorée en silence) ; « reel » et
 * l'absence de valeur sont acceptées (ancien réglage devenu sans objet).
 */
export function verifierAncienMode(valeur: string | undefined): void {
  if (valeur === undefined || valeur === "" || valeur === "reel") return;
  if (valeur === "demonstration") {
    throw new Error("PASSERELLE_MODE=demonstration : le mode démonstration a été retiré. Supprimer ce réglage ; un service sans fournisseur réel configuré répond « non_connecte ».");
  }
  throw new Error(`PASSERELLE_MODE : « ${valeur} » n'est plus un réglage reconnu (le mode a été supprimé). Supprimer ce réglage.`);
}

export function lirePort(valeur: string | undefined): number {
  if (valeur === undefined || valeur === "") return PORT_PAR_DEFAUT;
  if (!/^\d{1,5}$/.test(valeur)) throw new Error(`Port invalide : « ${valeur} ».`);
  const port = Number(valeur);
  if (port > 65535) throw new Error(`Port invalide : « ${valeur} ».`);
  return port;
}

export interface ReglagesEnvironnement {
  hote: string;
  port: number;
}

/** Lit PASSERELLE_HOTE et PASSERELLE_PORT (et refuse l'ancien PASSERELLE_MODE=demonstration). */
export function lireReglages(env: NodeJS.ProcessEnv): ReglagesEnvironnement {
  verifierAncienMode(env["PASSERELLE_MODE"]);
  return {
    hote: verifierHoteEcoute(env["PASSERELLE_HOTE"] ?? HOTE_PAR_DEFAUT),
    port: lirePort(env["PASSERELLE_PORT"]),
  };
}

/**
 * Lit PASSERELLE_SERVICES_REELS : liste de services LOCAUX (séparés par des virgules ou des espaces) à brancher sur leur
 * fournisseur réel. Seuls les services sans compte de tiers sont permis : `osm` et `bce` (index locaux), `bnb` (API de la
 * BNB par simple clé) et `liens` (lecture d'URL protégée) ; l'accès y est accordé par le serveur d'autorisation local.
 * Les autres services (Google, réseaux sociaux, CRM) se branchent par leurs propres réglages (comptes et jetons de tiers).
 * Un service non listé et non configuré répond « non_connecte ».
 */
export const SERVICES_LOCAUX: readonly string[] = ["osm", "liens", "bce", "bnb"];

export function lireServicesLocaux(env: NodeJS.ProcessEnv): string[] {
  const brut = env["PASSERELLE_SERVICES_REELS"]?.trim() ?? "";
  if (brut === "") return [];
  const noms = [...new Set(brut.split(/[\s,]+/).filter((n) => n !== ""))];
  for (const nom of noms) {
    if (!SERVICES_LOCAUX.includes(nom)) {
      throw new Error(`PASSERELLE_SERVICES_REELS : service « ${nom} » non permis (services locaux permis : ${SERVICES_LOCAUX.join(", ")}).`);
    }
  }
  return noms;
}
