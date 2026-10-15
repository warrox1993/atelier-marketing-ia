// Enregistrement des fournisseurs Google réels (lot L4) et démarrage du serveur d'autorisation de la passerelle.
// Appelé au démarrage (src/demarrer.ts, une ligne) en mode `reel` seulement. Sans configuration Google
// complète, rien n'est enregistré : les services Google ne sont alors pas servis en réel (journal explicite).

import { fileURLToPath } from "node:url";
import type { FournisseurService, RegistreFournisseurs } from "../../fournisseurs.js";
import { AutorisationGoogle } from "./autorisation.js";
import { lireConfigGoogle, type ConfigGoogleReel } from "./config.js";
import { outilsGoogleReels } from "./outils.js";

const ETAT_PAR_DEFAUT = fileURLToPath(new URL("../../../../etat/google-reel.json", import.meta.url));
const SERVICES = ["gsc", "ga4", "ads", "gbp"] as const;

export interface GoogleReel {
  autorisation: AutorisationGoogle;
  config: ConfigGoogleReel;
  services: string[];
  /** Démarre le serveur d'autorisation (boucle locale) ; renvoie son URL. */
  ecouter(): Promise<string>;
  arreter(): Promise<void>;
}

export interface OptionsGoogleReel {
  /** Hôte d'écoute de la passerelle (127.0.0.1 ou ::1) : le serveur d'autorisation écoute au même endroit. */
  hote: string;
  /** URL de base de la passerelle MCP, connue après son démarrage. */
  urlPasserelle: () => string;
  journal?: (message: string) => void;
  /** Configuration déjà lue (tests) ; sinon lue dans `env`. */
  config?: ConfigGoogleReel;
  attendre?: (ms: number) => Promise<void>;
  /** Bornes de l'enregistrement dynamique (tests). */
  limites?: { maxClients?: number; enregistrementsParMinute?: number };
}

/** Construit et enregistre les fournisseurs réels gsc, ga4, ads et gbp. */
export function construireGoogleReel(registre: RegistreFournisseurs, env: NodeJS.ProcessEnv, options: OptionsGoogleReel): GoogleReel | null {
  const journal = options.journal ?? ((): void => undefined);
  let config = options.config;
  if (!config) {
    const lu = lireConfigGoogle(env, ETAT_PAR_DEFAUT);
    if (!lu.ok) {
      journal(`Google réel non servi : ${lu.raison}.`);
      return null;
    }
    config = lu.config;
  }
  if (config.essai) journal("AVERTISSEMENT : Google réel branché sur un FAUX Google local (PASSERELLE_GOOGLE_FAUX_URL), essais seulement.");
  const services = [...SERVICES];

  const portees = new Map<string, readonly string[]>();
  for (const s of services) {
    const fiche = registre.fiche(s);
    if (!fiche) throw new Error(`Fiche absente pour le service ${s}.`);
    portees.set(s, fiche.portees);
  }
  const autorisation = new AutorisationGoogle({ config, urlPasserelle: options.urlPasserelle, porteesParService: portees, journal, ...(options.limites ? { limites: options.limites } : {}) });
  const outils = outilsGoogleReels({
    config,
    jetonGoogle: (jeton, service, forcer) => autorisation.jetonGoogle(jeton, service, forcer),
    ...(options.attendre ? { attendre: options.attendre } : {}),
  });
  // L'URL du serveur d'autorisation n'est connue qu'après son démarrage : le tableau est rempli à ce moment.
  const serveursAutorisation: string[] = [];
  for (const s of services) {
    const fournisseur: FournisseurService = {
      service: s,
      mode: "reel",
      outils: outils[s],
      serveursAutorisation,
      // Toute requête MCP (initialize, tools/list, tools/call) est refusée en 401 sans jeton valide pour CE service.
      verifierJeton: (jeton, service) => autorisation.identiteDuJeton(jeton, service),
    };
    registre.enregistrer(fournisseur);
  }
  return {
    autorisation,
    config,
    services: [...services],
    ecouter: async () => {
      const url = await autorisation.ecouter(options.hote);
      serveursAutorisation.splice(0, serveursAutorisation.length, url);
      journal(`autorisation Google réelle à l'écoute sur ${url} (adresse de retour à déclarer chez Google : ${autorisation.retourGoogleUri()})`);
      return url;
    },
    arreter: () => autorisation.arreter(),
  };
}

/** Une ligne au démarrage : en mode réel, enregistre Google et démarre son serveur d'autorisation (arrêt du processus si impossible). */
export function enregistrerGoogleReel(registre: RegistreFournisseurs, env: NodeJS.ProcessEnv, options: OptionsGoogleReel): GoogleReel | null {
  const google = construireGoogleReel(registre, env, options);
  google?.ecouter().catch((e: unknown) => {
    console.error(`Serveur d'autorisation Google impossible à démarrer : ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
  return google;
}
