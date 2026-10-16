// Point d'entrée : npm start (après npm run build).
// Il n'y a plus de mode démonstration : seuls les fournisseurs réels sont enregistrés, et un service sans
// fournisseur configuré répond « non_connecte ».
// Réglages par variables d'environnement : PASSERELLE_HOTE (127.0.0.1 ou ::1 seulement),
// PASSERELLE_PORT (3190 par défaut), PASSERELLE_SERVICES_REELS (services locaux à brancher : osm, bce, bnb, liens),
// PASSERELLE_ETAT (fichier d'état de l'autorisation locale, passerelle/etat/oauth-demo.json par défaut : nom
// d'origine conservé pour ne pas perdre les connexions existantes).

import { fileURLToPath } from "node:url";
import { lireReglages, lireServicesLocaux } from "./config.js";
import { lireMentionIa } from "./mention-ia.js";
import { RegistreFournisseurs } from "./fournisseurs.js";
import { creerServeur } from "./serveur.js";
import { signataireDepuisEnv, type SignataireEnveloppe } from "./signature-enveloppe.js";
import { enregistrerGoogleReel } from "./reel/google/enregistrer.js";
import { enregistrerSocialCrmReel } from "./reel/social-crm/enregistrer.js";
import { fournisseurLiensReel } from "./reel/liens/verifier-url.js";
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
  const serveur = creerServeur({ ...reglages, registre, signataire, fichierEtat: process.env["PASSERELLE_ETAT"] ?? ETAT_PAR_DEFAUT, journal: (m) => console.log(m) });
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
