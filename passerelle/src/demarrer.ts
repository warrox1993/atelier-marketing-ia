// Point d'entrée : npm start (après npm run build).
// Il n'y a plus de mode démonstration : seuls les fournisseurs réels sont enregistrés, et un service sans
// fournisseur configuré répond « non_connecte ».
// Réglages par variables d'environnement : PASSERELLE_HOTE (127.0.0.1 ou ::1 seulement),
// PASSERELLE_PORT (3190 par défaut), PASSERELLE_SERVICES_REELS (services locaux à brancher : osm, bce, bnb, liens, extraction, audit, emailing, captation),
// PASSERELLE_ETAT (fichier d'état de l'autorisation locale, passerelle/etat/oauth-demo.json par défaut : nom
// d'origine conservé pour ne pas perdre les connexions existantes).

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lireReglages, lireServicesLocaux } from "./config.js";
import { lireMentionIa } from "./mention-ia.js";
import { RegistreFournisseurs } from "./fournisseurs.js";
import { creerServeur, type RouteInterne } from "./serveur.js";
import { signataireDepuisEnv, type SignataireEnveloppe } from "./signature-enveloppe.js";
import { enregistrerGoogleReel } from "./reel/google/enregistrer.js";
import { enregistrerSocialCrmReel } from "./reel/social-crm/enregistrer.js";
import { fournisseurLiensReel } from "./reel/liens/verifier-url.js";
import { fournisseurAuditReel } from "./reel/audit/auditer-page.js";
import { fournisseurExtractionReel, optionsExtractionDepuisEnv } from "./reel/extraction/extraire-site.js";
import { fournisseurEmailingReel, optionsEmailingDepuisEnv } from "./reel/emailing/outils.js";
import { fournisseurCaptationReel, optionsCaptationDepuisEnv } from "./reel/captation/outils.js";
import { enregistrerStatbelReel } from "./reel/statbel/outils.js";
import { cheminIndexStatbel, IndexStatbel } from "./reel/statbel/index.js";
import { creerEnvoyeur, creerLecteurCampagne, CHEMIN_LECTURE } from "./reel/emailing/envoi.js";
import { ClientListmonk, lireJetonListmonk } from "./reel/emailing/listmonk.js";
import { VerificateurPreuves } from "./reel/social-crm/approbation.js";
import { lireSecret, normaliserClePubliqueApprobation } from "./reel/social-crm/config.js";
import { enregistrerBceReelSeul, enregistrerBnbReelSeul, enregistrerOsmReelSeul, enregistrerProspectionReel } from "./reel/prospection/enregistrer.js";

// Par défaut : passerelle/etat/oauth-demo.json (état de l'autorisation locale), quel que soit le répertoire de lancement
// (ce fichier compilé vit dans passerelle/dist/src/).
const ETAT_PAR_DEFAUT = fileURLToPath(new URL("../../etat/oauth-demo.json", import.meta.url));

function principal(): void {
  let reglages;
  let signataire: SignataireEnveloppe | null;
  let servicesLocaux: string[];
  try {
    reglages = lireReglages(process.env);
    servicesLocaux = lireServicesLocaux(process.env);
    signataire = signataireDepuisEnv(process.env);
    lireMentionIa(process.env); // article 50 : désactivation sans motif écrit = refus de démarrer
  } catch (erreur) {
    console.error(erreur instanceof Error ? erreur.message : String(erreur));
    process.exit(2);
  }
  // Seuls les fournisseurs réels sont enregistrés. Un service sans configuration réelle reste sans fournisseur :
  // la passerelle y répond « non_connecte » (HTTP 503) et /sante le liste parmi les services non connectés.
  const registre = new RegistreFournisseurs();
  const urlPasserelle = (): string => `http://${reglages.hote === "::1" ? "[::1]" : reglages.hote}:${reglages.port}`;
  const journal = (m: string): void => console.log(m);
  enregistrerGoogleReel(registre, process.env, { hote: reglages.hote, urlPasserelle, journal }); // gsc, ga4, ads, gbp : seulement si la configuration Google est complète
  // Prospection avec jeton statique (bce, osm, bnb) : seulement si PASSERELLE_PROSPECTION_JETON est configuré ; les services
  // locaux ci-dessous, enregistrés ensuite, remplacent alors ceux du même nom.
  enregistrerProspectionReel(registre, process.env, { journal });
  // Services locaux (PASSERELLE_SERVICES_REELS=osm,bce,bnb,liens) : fournisseur réel, accès par l'autorisation locale.
  if (servicesLocaux.includes("osm")) enregistrerOsmReelSeul(registre, process.env, { journal });
  if (servicesLocaux.includes("bce")) enregistrerBceReelSeul(registre, process.env, { journal });
  if (servicesLocaux.includes("bnb")) enregistrerBnbReelSeul(registre, process.env, { journal });
  if (servicesLocaux.includes("liens")) {
    registre.enregistrer(fournisseurLiensReel());
    console.log("liens branché : verifier_url, adresses publiques seulement");
  }
  if (servicesLocaux.includes("audit")) {
    registre.enregistrer(fournisseurAuditReel({ journal }));
    console.log("audit branché : auditer_page (Lighthouse), adresses publiques seulement");
  }
  if (servicesLocaux.includes("extraction")) {
    try {
      registre.enregistrer(fournisseurExtractionReel({ ...optionsExtractionDepuisEnv(process.env), journal }));
      console.log("extraction branchée : extraire_site (Crawl4AI local), adresses publiques seulement");
    } catch (erreur) {
      // Jeton ou adresse du conteneur invalide : le service n'est pas servi (il répond « non_connecte »), le reste démarre.
      journal(`extraction non servie : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }
  const routesInternes: RouteInterne[] = [];
  if (servicesLocaux.includes("emailing")) {
    try {
      registre.enregistrer(fournisseurEmailingReel({ ...optionsEmailingDepuisEnv(process.env), journal }));
      console.log("emailing branché : listes, abonnés avec consentement, brouillons (listmonk local) ; l'envoi n'est pas un outil d'agent");
      // Route d'envoi réservée au plugin (décision humaine + preuve signée) : seulement si le jeton d'envoi ET la clé d'approbation existent.
      const fichierEnvoi = process.env["PASSERELLE_LISTMONK_JETON_ENVOI_FICHIER"]?.trim();
      const brute = lireSecret(process.env, "PASSERELLE_APPROBATION_CLE_PUBLIQUE");
      if (fichierEnvoi && brute) {
        const url = process.env["PASSERELLE_LISTMONK_URL"]?.trim();
        const clientEnvoi = new ClientListmonk({ ...(url ? { url } : {}), jeton: lireJetonListmonk(fichierEnvoi, "PASSERELLE_LISTMONK_JETON_ENVOI_FICHIER") });
        const fichierPreuves = process.env["PASSERELLE_EMAILING_PREUVES"]?.trim() || join(dirname(process.env["PASSERELLE_ETAT"] ?? ETAT_PAR_DEFAUT), "preuves-emailing.log");
        const envoyer = creerEnvoyeur({ client: clientEnvoi, verificateur: new VerificateurPreuves(normaliserClePubliqueApprobation(brute)), journal, fichierPreuves });
        const lire = creerLecteurCampagne({ client: clientEnvoi, journal });
        routesInternes.push({ chemin: CHEMIN_LECTURE, traiter: async (corps) => { const r = await lire(corps); return { statut: r.statut, corps: r.corps }; } });
        routesInternes.push({ chemin: "/interne/emailing/envoyer", traiter: async (corps) => { const r = await envoyer(corps); return { statut: r.statut, corps: r.corps }; } });
        console.log("emailing : route d'envoi humaine active (POST /interne/emailing/envoyer, preuve d'approbation signée exigée)");
      } else {
        journal("emailing : route d'envoi inactive (PASSERELLE_LISTMONK_JETON_ENVOI_FICHIER ou clé d'approbation absente) : aucune campagne ne peut partir.");
      }
    } catch (erreur) {
      journal(`emailing non servi : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }
  if (servicesLocaux.includes("captation")) {
    try {
      registre.enregistrer(fournisseurCaptationReel({ ...optionsCaptationDepuisEnv(process.env), journal }));
      console.log("captation branchée : pages de destination (création, liste, statistiques) ; servies par le serveur de pages, jamais publiées par un outil");
    } catch (erreur) {
      journal(`captation non servie : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }
  if (servicesLocaux.includes("statbel")) {
    const indexStatbel = new IndexStatbel(cheminIndexStatbel(process.env));
    enregistrerStatbelReel(registre, () => indexStatbel, { journal });
    if (!indexStatbel.disponible()) journal("statbel : index absent ou vide, les outils répondent par une erreur claire tant que scripts/statbel-mise-a-jour.sh n'a pas été lancé.");
  }
  try {
    enregistrerSocialCrmReel(registre, process.env, { hote: reglages.hote, urlPasserelle, journal, signataire }); // réseaux sociaux et CRM : seulement si configurés
  } catch (erreur) {
    // Revue S-8 : même paire de clés pour signer et approuver, ou configuration invalide : refus de démarrer.
    console.error(erreur instanceof Error ? erreur.message : String(erreur));
    process.exit(2);
  }
  if (signataire) console.log(`réponses d'outils signées (clé publique Ed25519 de la passerelle, empreinte ${signataire.empreinteCle}) ; clé publique à donner au plugin : ${signataire.clePubliqueBase64}`);
  else console.log("AVERTISSEMENT : aucune clé de signature (PASSERELLE_SIGNATURE_CLE_PRIVEE) : réponses non signées, le plugin ne doit pas les tenir pour réelles.");
  const nonConnectes = registre.fiches().map((f) => f.id).filter((id) => registre.obtenir(id) === undefined);
  console.log(`services connectés : ${registre.fiches().map((f) => f.id).filter((id) => registre.obtenir(id) !== undefined).join(", ") || "aucun"} ; non connectés (répondent « non_connecte ») : ${nonConnectes.join(", ") || "aucun"}`);
  const serveur = creerServeur({ ...reglages, registre, signataire, routesInternes, fichierEtat: process.env["PASSERELLE_ETAT"] ?? ETAT_PAR_DEFAUT, journal: (m) => console.log(m) });
  serveur.ecouter().catch((erreur: unknown) => {
    console.error(`Démarrage impossible : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    process.exit(1);
  });
  const arret = (): void => {
    serveur.arreter().finally(() => process.exit(0));
  };
  process.on("SIGTERM", arret);
  process.on("SIGINT", arret);
}

principal();
