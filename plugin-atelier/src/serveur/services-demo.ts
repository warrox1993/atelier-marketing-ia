/**
 * Lot 2 : rechargement de la démonstration.
 * - `base-clients.importer-demo` : importe d'un geste le classeur `instance/demo/base-clients/base-clients.xlsx`
 *   avec la correspondance des 18 colonnes (celle de `scripts/demo/importer-base-clients.py`).
 *   Humain seulement ; refusé pour une entreprise en mode réel. L'import lui-même est celui de
 *   `base-clients.importer` (mêmes contrôles, mêmes chiffrements, même journal).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CleRouteApi } from "../contrats/index.js";
import type { GestionnaireRoute, RequeteRoute } from "./atelier.js";
import { erreur } from "./erreurs.js";
import type { ModeEffectif } from "./regles-donnees-demo.js";

export const FICHIER_BASE_CLIENTS_DEMO = "base-clients.xlsx";
export const FINALITE_DEMO = "Prospection de clients existants et de prospects ressemblants (démonstration)";

/** Colonnes du classeur -> colonnes cibles du plugin (bureau et entité ne sont pas importés). */
export const CORRESPONDANCE_DEMO: ReadonlyArray<{ colonne: string; cible: string }> = [
  ["identifiant_client", "identifiant_client"], ["type", "type_client"], ["prenom", "prenom"], ["nom", "nom"],
  ["entreprise", "entreprise"], ["numero_bce", "numero_bce"], ["courriel", "courriel"], ["telephone", "telephone"],
  ["code_postal", "code_postal"], ["commune", "commune"], ["produits_detenus", "produits_detenus"],
  ["date_debut", "debut_contrat"], ["statut", "statut_client"], ["consentement_courriel", "consentement_courriel"],
  ["consentement_sms", "consentement_sms"], ["consentement_telephone", "consentement_telephone"],
  ["bureau", "ignorer"], ["entite", "ignorer"],
].map(([colonne, cible]) => ({ colonne: colonne!, cible: cible! }));

export interface DependancesDemo {
  modeEffectif(companyId: string, campagne: null): Promise<ModeEffectif>;
  /** Route ordinaire d'import de la base clients (lue au moment de l'appel). */
  importerBaseClients(): GestionnaireRoute | undefined;
  /** Tests : dossier contenant `base-clients.xlsx`. */
  dossierBaseClients?: string;
}

/** Cherche `instance/demo/base-clients/` en remontant les dossiers (comme `dossierDemo()` des connaissances). */
function trouverDossier(d: DependancesDemo): string | null {
  if (d.dossierBaseClients) return existsSync(path.join(d.dossierBaseClients, FICHIER_BASE_CLIENTS_DEMO)) ? d.dossierBaseClients : null;
  for (const depart of [process.cwd(), path.dirname(fileURLToPath(import.meta.url))]) {
    let dossier = depart;
    for (let i = 0; i < 8; i++) {
      const candidat = path.join(dossier, "instance", "demo", "base-clients");
      if (existsSync(path.join(candidat, FICHIER_BASE_CLIENTS_DEMO)) && statSync(candidat).isDirectory()) return candidat;
      const parent = path.dirname(dossier);
      if (parent === dossier) break;
      dossier = parent;
    }
  }
  return null;
}

export function routesDemo(d: DependancesDemo): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  routes["base-clients.importer-demo"] = async (r: RequeteRoute) => {
    if (r.acteur.type !== "humain") erreur("elevation_refusee", "Le rechargement de la base clients de démonstration est réservé à un humain.");
    const corps = r.corps as { companyId?: string } | null;
    if (!corps || corps.companyId !== r.companyId) erreur("hors_entreprise", "Entreprise incohérente : seule l'entreprise résolue par l'hôte est servie.");
    if ((await d.modeEffectif(r.companyId, null)).mode === "reel") {
      erreur("conflit", "Entreprise en mode réel : la base clients de démonstration n'y est jamais importée.");
    }
    const dossier = trouverDossier(d);
    if (!dossier) erreur("introuvable", "Base clients de démonstration introuvable (instance/demo/base-clients/base-clients.xlsx).");
    const importer = d.importerBaseClients();
    if (!importer) erreur("erreur_interne", "Route d'import de la base clients indisponible.");
    const contenu = readFileSync(path.join(dossier, FICHIER_BASE_CLIENTS_DEMO));
    return importer({
      ...r,
      cle: "base-clients.importer",
      corps: {
        companyId: r.companyId, nomFichier: FICHIER_BASE_CLIENTS_DEMO, format: "xlsx", contenuBase64: contenu.toString("base64"),
        correspondance: CORRESPONDANCE_DEMO, finalite: FINALITE_DEMO, dureeConservationMois: 12,
      },
    });
  };

  return routes;
}
