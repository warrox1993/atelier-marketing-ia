/**
 * Lecture des deux routes du tableau de direction (`rapport.mensuel` et `tableau.direction`) pour un mois et le mois
 * précédent, puis calcul par le module pur `tableau-direction.ts`. Une route qui ne répond pas ou répond dans une forme
 * inconnue (worker pas à jour) donne `null` : les indicateurs qui en dépendent s'écrivent « non mesuré ».
 * L'écran n'est en erreur que si le mois courant n'a rendu AUCUNE de ses deux sources.
 */
import { useCallback, useEffect, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import { DonneesDirection, RapportMensuel } from "../contrats/index.js";
import { appelRoute } from "./routes-prospection.js";
import { moisPrecedent, tableauDirection, type EntreesMois, type TableauDirection } from "./tableau-direction.js";

export type LectureTableau = { etat: "chargement" } | { etat: "erreur"; erreur: unknown } | { etat: "pret"; tableau: TableauDirection };

async function lire<T>(chemin: string, companyId: string, mois: string, forme: { safeParse(x: unknown): { success: true; data: T } | { success: false } }): Promise<{ valeur: T | null; erreur: unknown }> {
  try {
    const brut = await appelRoute<unknown>("GET", `${chemin}?companyId=${encodeURIComponent(companyId)}&mois=${encodeURIComponent(mois)}`);
    const lu = forme.safeParse(brut);
    return lu.success ? { valeur: lu.data, erreur: null } : { valeur: null, erreur: { code: "FORME_INCONNUE", message: `Réponse inattendue de ${chemin} : le worker du plugin n'est peut-être pas à jour.` } };
  } catch (erreur) {
    return { valeur: null, erreur };
  }
}

export async function lireEntrees(companyId: string, mois: string): Promise<{ entrees: EntreesMois; erreur: unknown }> {
  const [r, d] = await Promise.all([lire("/rapport/mensuel", companyId, mois, RapportMensuel), lire("/tableau/direction", companyId, mois, DonneesDirection)]);
  return { entrees: { rapport: r.valeur, direction: d.valeur }, erreur: r.erreur ?? d.erreur };
}

export function useTableauDirection(mois: string): { lecture: LectureTableau; recharger: () => void } {
  const { companyId } = useHostContext();
  const [lecture, setLecture] = useState<LectureTableau>({ etat: "chargement" });
  const [n, setN] = useState(0);
  const recharger = useCallback(() => setN((x) => x + 1), []);
  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setLecture({ etat: "chargement" });
    void (async () => {
      const [courant, precedent] = await Promise.all([lireEntrees(companyId, mois), lireEntrees(companyId, moisPrecedent(mois))]);
      if (annule) return;
      if (courant.entrees.rapport === null && courant.entrees.direction === null) setLecture({ etat: "erreur", erreur: courant.erreur });
      else setLecture({ etat: "pret", tableau: tableauDirection(mois, courant.entrees, precedent.entrees) });
    })();
    return () => {
      annule = true;
    };
  }, [companyId, mois, n]);
  return { lecture, recharger };
}
