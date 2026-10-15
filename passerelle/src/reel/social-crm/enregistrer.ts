// Enregistrement des fournisseurs réels réseaux sociaux et CRM et démarrage de leur serveur d'autorisation.
// Appelé au démarrage (src/demarrer.ts, une ligne) en mode `reel` seulement. Sans clé de chiffrement, rien
// n'est enregistré ; sans application OAuth configurée pour une plateforme, son service n'est pas servi en
// réel (Odoo et Pipedrive par jeton d'API le sont toujours). Le journal dit pourquoi, sans jamais citer de valeur.

import { fileURLToPath } from "node:url";
import type { FournisseurService, RegistreFournisseurs } from "../../fournisseurs.js";
import { VerificateurPreuves } from "./approbation.js";
import { AutorisationSocialCrm } from "./autorisation.js";
import { Coffre } from "./coffre.js";
import { lireConfigSocialCrm, SERVICES_SOCIAL_CRM_REELS, servicesServis, type ConfigSocialCrmReel, type ServiceSocialCrm } from "./config.js";
import { construireConnecteurs } from "./connecteurs.js";
import { fournisseurHubspotReel } from "./hubspot.js";
import { fournisseurLinkedinReel } from "./linkedin.js";
import { fournisseurFacebookReel, fournisseurInstagramReel, type DependancesOutils } from "./meta.js";
import { fournisseurOdooReel } from "./odoo.js";
import { fournisseurPipedriveReel } from "./pipedrive.js";
import { fournisseurTeamleaderReel } from "./teamleader.js";

const ETAT_PAR_DEFAUT = fileURLToPath(new URL("../../../../etat/social-crm-reel.json", import.meta.url));

export interface SocialCrmReel {
  autorisation: AutorisationSocialCrm;
  config: ConfigSocialCrmReel;
  services: ServiceSocialCrm[];
  ecouter(): Promise<string>;
  arreter(): Promise<void>;
}

export interface OptionsSocialCrmReel {
  hote: string;
  urlPasserelle: () => string;
  journal?: (message: string) => void;
  /** Configuration déjà lue (tests) ; sinon lue dans `env`. */
  config?: ConfigSocialCrmReel;
  attendre?: (ms: number) => Promise<void>;
  maintenant?: () => number;
  /** Bornes de l'enregistrement dynamique (tests). */
  limites?: { maxClients?: number; enregistrementsParMinute?: number };
}

const FABRIQUES: Record<ServiceSocialCrm, (dep: DependancesOutils) => FournisseurService> = {
  facebook: fournisseurFacebookReel,
  instagram: fournisseurInstagramReel,
  linkedin: fournisseurLinkedinReel,
  crm: fournisseurHubspotReel,
  pipedrive: fournisseurPipedriveReel,
  odoo: fournisseurOdooReel,
  teamleader: fournisseurTeamleaderReel,
};

export function construireSocialCrmReel(registre: RegistreFournisseurs, env: NodeJS.ProcessEnv, options: OptionsSocialCrmReel): SocialCrmReel | null {
  const journal = options.journal ?? ((): void => undefined);
  let config = options.config;
  if (!config) {
    const lu = lireConfigSocialCrm(env, ETAT_PAR_DEFAUT);
    if (!lu.ok) {
      journal(`Réseaux sociaux et CRM réels non servis : ${lu.raison}.`);
      return null;
    }
    config = lu.config;
  }
  if (config.essai) journal("AVERTISSEMENT : réseaux sociaux et CRM réels branchés sur un FAUX serveur local (PASSERELLE_SOCIAL_FAUX_URL), essais seulement.");
  const services = servicesServis(config);
  for (const s of SERVICES_SOCIAL_CRM_REELS) if (!services.includes(s)) journal(`Service ${s} non servi en réel : application OAuth non configurée.`);
  const verificateur = new VerificateurPreuves(config.clePubliqueApprobation);
  if (!verificateur.configure) journal("Aucune clé de vérification des approbations (PASSERELLE_APPROBATION_CLE_PUBLIQUE) : les mutations réelles resteront « préparées, non exécutées ».");

  const coffre = new Coffre(config.fichierEtat, config.cle, undefined, options.maintenant);
  const connecteurs = construireConnecteurs(config);
  const autorisation = new AutorisationSocialCrm({ config, coffre, connecteurs, urlPasserelle: options.urlPasserelle, journal, ...(options.maintenant ? { maintenant: options.maintenant } : {}), ...(options.limites ? { limites: options.limites } : {}) });
  const dep: DependancesOutils = {
    config,
    autorisation,
    coffre,
    verificateur,
    attenteQuotaMaxMs: config.attenteQuotaMaxMs,
    ...(options.attendre ? { attendre: options.attendre } : {}),
    ...(options.maintenant ? { maintenant: options.maintenant } : {}),
  };
  // L'adresse du serveur d'autorisation n'est connue qu'après son démarrage : le tableau est rempli à ce moment.
  const serveursAutorisation: string[] = [];
  for (const s of services) {
    registre.enregistrer({
      ...FABRIQUES[s](dep),
      serveursAutorisation,
      // Toute requête MCP (initialize, tools/list, tools/call) est refusée en 401 sans jeton valide pour CE service.
      verifierJeton: (jeton, service) => autorisation.identiteDuJeton(jeton, service),
    });
  }
  return {
    autorisation,
    config,
    services,
    ecouter: async () => {
      const url = await autorisation.ecouter(options.hote);
      serveursAutorisation.splice(0, serveursAutorisation.length, url);
      journal(`autorisation réseaux sociaux et CRM à l'écoute sur ${url} ; adresses de retour à déclarer : ${services.filter((s) => s !== "odoo").map((s) => autorisation.retourUri(s)).join(", ")}`);
      return url;
    },
    arreter: () => autorisation.arreter(),
  };
}

/** Une ligne au démarrage : en mode réel, enregistre les services et démarre leur serveur d'autorisation. */
export function enregistrerSocialCrmReel(registre: RegistreFournisseurs, env: NodeJS.ProcessEnv, options: OptionsSocialCrmReel): SocialCrmReel | null {
  const social = construireSocialCrmReel(registre, env, options);
  social?.ecouter().catch((e: unknown) => {
    console.error(`Serveur d'autorisation réseaux sociaux et CRM impossible à démarrer : ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
  return social;
}
