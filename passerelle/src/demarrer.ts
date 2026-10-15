// Point d'entrée : npm start (après npm run build).
// Réglages par variables d'environnement : PASSERELLE_MODE (demonstration | reel),
// PASSERELLE_HOTE (127.0.0.1 ou ::1 seulement), PASSERELLE_PORT (3190 par défaut),
// PASSERELLE_ETAT (fichier d'état OAuth de démonstration, passerelle/etat/oauth-demo.json par défaut).

import { fileURLToPath } from "node:url";
import { lireReglages } from "./config.js";
import { RegistreFournisseurs } from "./fournisseurs.js";
import { creerServeur } from "./serveur.js";
import { signataireDepuisEnv, type SignataireEnveloppe } from "./signature-enveloppe.js";
import { enregistrerGoogleDemo } from "./demo/google/enregistrer.js";
import { enregistrerSocialCrm } from "./demo/social-crm/enregistrer.js";
import { enregistrerGoogleReel } from "./reel/google/enregistrer.js";
import { enregistrerSocialCrmReel } from "./reel/social-crm/enregistrer.js";

// Par défaut : passerelle/etat/oauth-demo.json, quel que soit le répertoire de lancement
// (ce fichier compilé vit dans passerelle/dist/src/).
const ETAT_PAR_DEFAUT = fileURLToPath(new URL("../../etat/oauth-demo.json", import.meta.url));

function principal(): void {
  let reglages;
  let signataire: SignataireEnveloppe | null;
  try {
    reglages = lireReglages(process.env);
    signataire = signataireDepuisEnv(process.env);
  } catch (erreur) {
    console.error(erreur instanceof Error ? erreur.message : String(erreur));
    process.exit(2);
  }
  // Les fournisseurs des lots L4 (réel), L5 et L7 (démonstration) s'enregistrent ici.
  const registre = new RegistreFournisseurs();
  enregistrerGoogleDemo(registre); // L5 : gsc, ga4, ads, gbp (démonstration)
  enregistrerSocialCrm(registre); // L7 : facebook, instagram, linkedin, crm (HubSpot), pipedrive, odoo, teamleader (démonstration)
  if (reglages.mode === "reel") enregistrerGoogleReel(registre, process.env, { hote: reglages.hote, urlPasserelle: () => `http://${reglages.hote === "::1" ? "[::1]" : reglages.hote}:${reglages.port}`, journal: (m) => console.log(m) }); // L4 : gsc, ga4, ads, gbp (réel)
  if (reglages.mode === "reel") enregistrerSocialCrmReel(registre, process.env, { hote: reglages.hote, urlPasserelle: () => `http://${reglages.hote === "::1" ? "[::1]" : reglages.hote}:${reglages.port}`, journal: (m) => console.log(m) }); // réseaux sociaux et CRM (réel)
  if (signataire) console.log(`réponses d'outils signées (clé publique Ed25519 de la passerelle, empreinte ${signataire.empreinteCle}) ; clé publique à donner au plugin : ${signataire.clePubliqueBase64}`);
  else console.log("AVERTISSEMENT : aucune clé de signature (PASSERELLE_SIGNATURE_CLE_PRIVEE) : réponses non signées, le plugin ne doit pas les tenir pour réelles.");
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
