/**
 * Lien « Demandez au Coordinateur » des états vides : ouvre le chat avec le texte d'un modèle de demande déjà écrit
 * (le chat le lit dans `?modele=` et ne l'envoie jamais tout seul).
 */
import { cheminDemandeModele } from "../demande.js";
import { LienHote } from "../composants.js";

export function DemanderCoordinateur({ modele }: { modele: string }) {
  return (
    <LienHote vers={cheminDemandeModele(modele)} className="atl-bouton">
      Demandez au Coordinateur
      <span className="atl-sr"> : {modele}</span>
    </LienHote>
  );
}
