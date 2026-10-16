// Point d'entrée : npm start (après npm run build).
// Réglages par variables d'environnement : PASSERELLE_MODE (demonstration | reel),
// PASSERELLE_HOTE (127.0.0.1 ou ::1 seulement), PASSERELLE_PORT (3190 par défaut),
// PASSERELLE_ETAT (fichier d'état OAuth de démonstration, passerelle/etat/oauth-demo.json par défaut).

import { fileURLToPath } from "node:url";
import { lireReglages, lireServicesReels } from "./config.js";
import { lireMentionIa } from "./mention-ia.js";
import { RegistreFournisseurs } from "./fournisseurs.js";
import { creerServeur } from "./serveur.js";
import { signataireDepuisEnv, type SignataireEnveloppe } from "./signature-enveloppe.js";
import { enregistrerGoogleDemo } from "./demo/google/enregistrer.js";
import { enregistrerSocialCrm } from "./demo/social-crm/enregistrer.js";
import { enregistrerProspectionDemo } from "./demo/prospection/enregistrer.js";
import { enregistrerOsmDemo } from "./demo/prospection/osm.js";
import { enregistrerGoogleReel } from "./reel/google/enregistrer.js";
import { enregistrerSocialCrmReel } from "./reel/social-crm/enregistrer.js";
import { fournisseurLiensReel } from "./reel/liens/verifier-url.js";
import { enregistrerBceReelSeul, enregistrerBnbReelSeul, enregistrerOsmReelSeul, enregistrerProspectionReel } from "./reel/prospection/enregistrer.js";

// Par défaut : passerelle/etat/oauth-demo.json, quel que soit le répertoire de lancement
// (ce fichier compilé vit dans passerelle/dist/src/).
const ETAT_PAR_DEFAUT = fileURLToPath(new URL("../../etat/oauth-demo.json", import.meta.url));

function principal(): void {
  let reglages;
  let signataire: SignataireEnveloppe | null;
  let servicesReels: string[];
  try {
    reglages = lireReglages(process.env);
    servicesReels = lireServicesReels(process.env);
    signataire = signataireDepuisEnv(process.env);
    lireMentionIa(process.env); // article 50 : désactivation sans motif écrit = refus de démarrer
  } catch (erreur) {
    console.error(erreur instanceof Error ? erreur.message : String(erreur));
    process.exit(2);
  }
  // Les fournisseurs des lots L4 (réel), L5 et L7 (démonstration) s'enregistrent ici.
  const registre = new RegistreFournisseurs();
  enregistrerGoogleDemo(registre); // L5 : gsc, ga4, ads, gbp (démonstration)
  enregistrerSocialCrm(registre); // L7 : facebook, instagram, linkedin, crm (HubSpot), pipedrive, odoo, teamleader (démonstration)
  enregistrerProspectionDemo(registre); // P2 : bce, bnb, fsma (démonstration)
  enregistrerOsmDemo(registre); // P3b : osm (démonstration)
  if (reglages.mode === "reel") enregistrerGoogleReel(registre, process.env, { hote: reglages.hote, urlPasserelle: () => `http://${reglages.hote === "::1" ? "[::1]" : reglages.hote}:${reglages.port}`, journal: (m) => console.log(m) }); // L4 : gsc, ga4, ads, gbp (réel)
  if (reglages.mode === "reel") enregistrerProspectionReel(registre, process.env, { journal: (m) => console.log(m) }); // P3 et P3b : bce, osm (réel, index locaux)
  // Mélange : en démonstration, PASSERELLE_SERVICES_REELS=osm,bce,bnb sert `osm`, `bce` et `bnb` en réel (index local) et le reste en démonstration.
  if (reglages.mode === "demonstration" && servicesReels.includes("osm")) enregistrerOsmReelSeul(registre, process.env, { journal: (m) => console.log(m) });
  // Mélange : `bce` (index SQLite local) et `bnb` (API CBSO, clé PASSERELLE_BNB_CLE) de la même façon ; `fsma` et `b2c` restent en démonstration.
  if (reglages.mode === "demonstration" && servicesReels.includes("bce")) enregistrerBceReelSeul(registre, process.env, { journal: (m) => console.log(m) });
  if (reglages.mode === "demonstration" && servicesReels.includes("bnb")) enregistrerBnbReelSeul(registre, process.env, { journal: (m) => console.log(m) });
  // Mélange : `liens` (verifier_url, lecture d'URL protégée, aucun compte) est servi en réel dès qu'il est demandé.
  if (reglages.mode === "demonstration" && servicesReels.includes("liens")) {
    registre.enregistrer(fournisseurLiensReel());
    console.log("liens RÉEL (mélange, passerelle en démonstration) : verifier_url, adresses publiques seulement");
  }
  try {
    if (reglages.mode === "reel") enregistrerSocialCrmReel(registre, process.env, { hote: reglages.hote, urlPasserelle: () => `http://${reglages.hote === "::1" ? "[::1]" : reglages.hote}:${reglages.port}`, journal: (m) => console.log(m), signataire }); // réseaux sociaux et CRM (réel)
  } catch (erreur) {
    // Revue S-8 : même paire de clés pour signer et approuver, ou configuration invalide : refus de démarrer.
    console.error(erreur instanceof Error ? erreur.message : String(erreur));
    process.exit(2);
  }
  if (signataire) console.log(`réponses d'outils signées (clé publique Ed25519 de la passerelle, empreinte ${signataire.empreinteCle}) ; clé publique à donner au plugin : ${signataire.clePubliqueBase64}`);
  else console.log("AVERTISSEMENT : aucune clé de signature (PASSERELLE_SIGNATURE_CLE_PRIVEE) : réponses non signées, le plugin ne doit pas les tenir pour réelles.");
  const serveur = creerServeur({ ...reglages, registre, signataire, servicesReels, fichierEtat: process.env["PASSERELLE_ETAT"] ?? ETAT_PAR_DEFAUT, journal: (m) => console.log(m) });
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
