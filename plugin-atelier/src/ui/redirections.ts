/**
 * Redirections entre bureaux d'un client à plusieurs services (une entreprise Paperclip par service).
 *
 * - Le chat est UNIQUE : c'est celui de la Direction. Ouvrir `discussion` (ou l'adresse par défaut `…/atelier`, ou
 *   l'ancienne `accueil`) depuis un autre bureau mène au chat de la Direction, au lieu de l'afficher sous le fil
 *   d'Ariane d'un autre service.
 * - Prospects, Carte et les vues Marketing n'existent que dans le bureau Marketing : ouvertes ailleurs (lien « Importer
 *   la base » du chat, ancien signet), elles mènent à la même vue (même identifiant, même requête, même ancre) dans le
 *   bureau Marketing du client.
 * - Un client sans départements, ou à un seul service, ne change pas : aucune redirection.
 *
 * Le préfixe d'un bureau vient de la liste des entreprises de l'hôte (comme la grille des départements) : un bureau
 * auquel l'utilisateur n'a pas accès n'y figure pas, et on ne redirige alors pas.
 */
import { useEffect, useRef, useState } from "react";
import { useHostLocation, useHostNavigation } from "@paperclipai/plugin-sdk/ui";
import type { ReponseDepartements } from "../contrats/departements.js";
import { aPlusieursDepartements } from "./departements-sonde.js";
import { chemin, type CleVue } from "./route.js";
import { SLUG_MARKETING } from "./rubriques.js";
import { useAncre } from "./onglets.js";
import { lireEntreprises, type EntrepriseHote } from "./vues/departements.js";

/** Vues qui n'existent que dans le bureau Marketing du client. */
export const VUES_BUREAU_MARKETING: ReadonlyArray<CleVue> = ["prospects", "carte", "campagnes", "contenus", "calendrier", "resultats", "equipe", "tableau", "rapport"];

/** Bureau (service) où la vue doit s'ouvrir : « direction » pour le chat, « marketing » pour ses vues ; null ailleurs. */
export function bureauAttendu(vue: CleVue): "direction" | "marketing" | null {
  if (vue === "discussion") return "direction";
  return VUES_BUREAU_MARKETING.includes(vue) ? "marketing" : null;
}

/** Vrai si la vue, ouverte dans cette entreprise, demande peut-être une redirection (sans connaître encore les préfixes). */
export function peutRediriger(vue: CleVue, companyId: string, departements: ReponseDepartements | null): boolean {
  const attendu = bureauAttendu(vue);
  if (!attendu || !aPlusieursDepartements(departements)) return false;
  const courant = departements!.departements.find((d) => d.companyId === companyId);
  if (!courant) return false;
  return attendu === "marketing" ? courant.slug !== SLUG_MARKETING : !courant.estDirection;
}

/**
 * Adresse (avec préfixe de l'entreprise visée) où mener la vue, ou null s'il n'y a rien à rediriger : mauvais bureau
 * absent de la déclaration, bureau inaccessible à l'utilisateur, déjà au bon endroit.
 */
export function cibleRedirection(entree: {
  vue: CleVue;
  id: string | null;
  companyId: string;
  departements: ReponseDepartements | null;
  entreprises: ReadonlyArray<Pick<EntrepriseHote, "id" | "issuePrefix">>;
  /** Requête et ancre à reporter telles quelles (« ?a=1#b »). */
  suffixe: string;
}): string | null {
  const { vue, id, companyId, departements, entreprises, suffixe } = entree;
  if (!peutRediriger(vue, companyId, departements)) return null;
  const bureau = bureauAttendu(vue)!;
  const but = departements!.departements.find((d) => (bureau === "direction" ? d.estDirection : d.slug === SLUG_MARKETING));
  if (!but || but.companyId === companyId) return null;
  const prefixe = entreprises.find((e) => e.id === but.companyId)?.issuePrefix;
  if (!prefixe) return null;
  return `/${prefixe}${chemin(vue, id)}${suffixe}`;
}

/**
 * Redirige (en remplaçant l'entrée d'historique, pour que « précédent » ne ramène pas à la boucle) quand la vue est
 * ouverte dans le mauvais bureau. Renvoie l'adresse visée pendant la redirection (la page n'affiche alors pas la vue
 * du mauvais bureau), sinon null.
 */
export function useRedirectionBureau(companyId: string | null | undefined, vue: CleVue, id: string | null, departements: ReponseDepartements | null): string | null {
  const nav = useHostNavigation();
  const navRef = useRef(nav);
  navRef.current = nav;
  const { search } = useHostLocation();
  const ancre = useAncre();
  const suffixe = `${search}${ancre ? `#${ancre}` : ""}`;
  const [cible, setCible] = useState<string | null>(null);
  useEffect(() => {
    setCible(null);
    if (!companyId || !peutRediriger(vue, companyId, departements)) return;
    let annule = false;
    lireEntreprises().then(
      (entreprises) => {
        if (annule) return;
        const but = cibleRedirection({ vue, id, companyId, departements, entreprises, suffixe });
        if (!but) return;
        setCible(but);
        navRef.current.navigate(but, { replace: true });
      },
      () => undefined,
    );
    return () => {
      annule = true;
    };
  }, [companyId, vue, id, departements, suffixe]);
  return cible;
}
