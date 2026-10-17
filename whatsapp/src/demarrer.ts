/**
 * Point d'entrée : lit la configuration (refus de démarrer si elle est douteuse), vérifie les droits du fichier de
 * secrets s'il est désigné par WHATSAPP_FICHIER_ENV, écoute sur la boucle locale seulement.
 */
import { creerApplication } from "./application.js";
import { ErreurConfig, lireConfig, verifierDroitsFichier } from "./config.js";
import { journalTechnique } from "./journal.js";

try {
  const fichier = process.env["WHATSAPP_FICHIER_ENV"]?.trim();
  if (fichier) verifierDroitsFichier(fichier);
  const config = lireConfig();
  const app = creerApplication({ config });
  app.serveur.listen(config.port, config.hote, () => {
    journalTechnique("demarrage", { hote: config.hote, port: config.port, numerosAutorises: config.numerosAutorises.length, modeleHorsFenetre: config.modeleHorsFenetre });
    app.demarrerVeille();
  });
  const arret = () => {
    journalTechnique("arret");
    app.arreter();
    void app.attendre().finally(() => process.exit(0));
  };
  process.on("SIGTERM", arret);
  process.on("SIGINT", arret);
} catch (e) {
  journalTechnique("refus_demarrage", { erreur: e instanceof ErreurConfig ? e.message : e instanceof Error ? e.message : "inconnue" });
  process.exit(2);
}
