/**
 * Envoi d'une demande au Coordinateur, partagé par l'accueil et l'encart du tableau de bord :
 * même route, même redirection vers la discussion de la tâche créée.
 */
import { useState } from "react";
import { useHostNavigation } from "@paperclipai/plugin-sdk/ui";
import { classerErreur } from "./format.js";
import { appelRoute } from "./routes-prospection.js";

export interface DemandeEnvoyee {
  identifiant: string | null;
  lien: string;
}

/** Modèles de demande proposés sous la zone de saisie (textes génériques, sans nom de client). */
export const MODELES_DEMANDE: ReadonlyArray<{ libelle: string; texte: string }> = [
  {
    libelle: "Veille concurrentielle hebdomadaire",
    texte:
      "Mets en place une routine de veille concurrentielle chaque lundi à 8 h : nouvelles offres, publicités et pages des principaux concurrents, avec sources datées. Range-la dans le projet Veille (crée-le s'il n'existe pas).",
  },
  {
    libelle: "Campagne Google Ads",
    texte: "Prépare une campagne Google Ads pour <produit> : mots-clés, annonces, négatifs, budget conseillé et plan de mesure. Pose-moi tes questions avant de proposer le plan.",
  },
  {
    libelle: "Prospection d'une zone",
    texte: "Trouve les prospects les plus pertinents pour <segment> autour de <commune> : critères vérifiés, compte rendu par lead et prochaine action conseillée.",
  },
];

export function useEnvoiDemande(companyId: string | null) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoyee, setEnvoyee] = useState<DemandeEnvoyee | null>(null);
  const nav = useHostNavigation();

  /** Renvoie vrai si la demande est partie (l'appelant vide alors sa zone de saisie). */
  const envoyer = async (texte: string): Promise<boolean> => {
    if (!companyId || enCours || texte.trim() === "") return false;
    setEnCours(true);
    setErreur(null);
    setEnvoyee(null);
    try {
      const r = await appelRoute<{ issueId: string; identifiant: string | null; lien: string }>("POST", "/equipe/demande", { companyId, texte: texte.trim() });
      setEnvoyee({ identifiant: r.identifiant, lien: r.lien });
      // On ouvre directement la discussion de la tâche : c'est là que le Coordinateur répond et pose ses questions.
      if (r.lien) nav.navigate(r.lien);
      return true;
    } catch (err) {
      setErreur(classerErreur(err).message);
      return false;
    } finally {
      setEnCours(false);
    }
  };

  return { envoyer, enCours, erreur, envoyee };
}
