/**
 * Sonde du tableau des départements : services du client de l'entreprise courante (`GET /departements`). Partagée par
 * la navigation (rubrique « Départements »), le fil « Client › Département » du bandeau et la vue elle-même : une
 * seule lecture par entreprise, mémorisée ; une panne n'est pas mémorisée et masque simplement la rubrique.
 */
import { useEffect, useState } from "react";
import type { ReponseDepartements } from "../contrats/departements.js";
import { appelRoute } from "./routes-prospection.js";

/** Un client n'a un tableau des départements qu'à partir de deux services. */
export const MINIMUM_DEPARTEMENTS = 2;

const parEntreprise = new Map<string, Promise<ReponseDepartements | null>>();

/** Pour les tests : oublie les réponses mémorisées. */
export function oublierDepartements(): void {
  parEntreprise.clear();
}

export function lireDepartements(companyId: string): Promise<ReponseDepartements | null> {
  const connu = parEntreprise.get(companyId);
  if (connu) return connu;
  const p = appelRoute<Partial<ReponseDepartements> | null>("GET", `/departements?companyId=${encodeURIComponent(companyId)}`).then(
    (r) => (r && Array.isArray(r.departements) ? { client: typeof r.client === "string" ? r.client : null, departements: r.departements } : null),
    () => {
      parEntreprise.delete(companyId);
      return null;
    },
  );
  parEntreprise.set(companyId, p);
  return p;
}

/** Réponse de la sonde (null tant qu'elle est inconnue ou en cas de panne). */
export function useDepartements(companyId: string | null | undefined): ReponseDepartements | null {
  const [reponse, setReponse] = useState<ReponseDepartements | null>(null);
  useEffect(() => {
    setReponse(null);
    if (!companyId) return;
    let annule = false;
    void lireDepartements(companyId).then((r) => !annule && setReponse(r));
    return () => {
      annule = true;
    };
  }, [companyId]);
  return reponse;
}

/** Vrai si le client de l'entreprise courante a au moins deux services déclarés. */
export function aPlusieursDepartements(r: ReponseDepartements | null): boolean {
  return (r?.departements.length ?? 0) >= MINIMUM_DEPARTEMENTS;
}

/**
 * Nom du client à partir des noms des entreprises (« Client · Service ») : préfixe commun avant « · », sinon le
 * marqueur. Même règle que le sélecteur d'organisations du socle (paperclip/ui/src/lib/company-groups.ts).
 */
export function nomClient(noms: ReadonlyArray<string>, marqueur: string | null): string {
  const prefixes = noms.map((n) => {
    const i = n.indexOf(" · ");
    return i > 0 ? n.slice(0, i).trim() : null;
  });
  const premier = prefixes[0];
  if (premier && prefixes.every((p) => p === premier)) return premier;
  return prefixes.find((p): p is string => Boolean(p)) ?? marqueur ?? "Client";
}

/** Slug du service de l'entreprise courante ; null si le client n'a pas de départements (ou si elle n'y figure pas). */
export function slugDuService(r: ReponseDepartements | null, companyId: string | null | undefined): string | null {
  return r?.departements.find((d) => d.companyId === companyId)?.slug ?? null;
}
