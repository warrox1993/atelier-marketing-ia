/**
 * Détection du téléphone (640 px et moins), partagée par les vues de l'organigramme. Module à part pour éviter l'import
 * circulaire entre la vue principale et les composants qu'elle assemble.
 */
import { useEffect, useState } from "react";

/** Largeur à partir de laquelle l'organigramme dessiné laisse la place à la liste (téléphone). */
const REQUETE_TELEPHONE = "(max-width: 640px)";

/** Vrai sur un téléphone (640 px et moins) ; faux si le navigateur ne sait pas mesurer (tests, anciens navigateurs). */
export function useTelephone(): boolean {
  const lire = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(REQUETE_TELEPHONE).matches : false);
  const [telephone, setTelephone] = useState(lire);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const requete = window.matchMedia(REQUETE_TELEPHONE);
    const maj = () => setTelephone(requete.matches);
    maj();
    requete.addEventListener("change", maj);
    return () => requete.removeEventListener("change", maj);
  }, []);
  return telephone;
}
