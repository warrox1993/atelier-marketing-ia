/**
 * Pastille « à faire » : nombre d'éléments qui attendent la personne, partagé entre l'entrée du
 * menu, la navigation de l'atelier, l'onglet du navigateur et la page d'Accueil.
 *
 * Une seule lecture de `GET /accueil` à la fois (les emplacements de l'hôte sont des racines React
 * séparées dans le même module) ; elle est relancée au rafraîchissement existant de l'atelier
 * (`actualiserTout` du fournisseur de données) et à intervalle régulier, onglet visible seulement.
 * Les rappels « Quand vous pouvez » (urgence basse : base de clients, marque, connexion) ne
 * comptent pas : ils ne bloquent personne et laisseraient la pastille allumée en permanence.
 */
import { useEffect, useSyncExternalStore } from "react";
import { useContexteDonnees } from "./donnees.js";
import { appelRoute } from "./routes-prospection.js";

export const INTERVALLE_COMPTEUR_MS = 60 * 1000;
/** Deux lectures plus proches que ce délai n'en font qu'une (trois emplacements montés ensemble). */
const DELAI_MINI_MS = 5 * 1000;

interface Etat {
  companyId: string | null;
  nombre: number | null;
  lueLe: number;
}

let etat: Etat = { companyId: null, nombre: null, lueLe: 0 };
const abonnes = new Set<() => void>();
const enCours = new Map<string, Promise<void>>();

const notifier = () => {
  for (const fn of abonnes) fn();
};

/** Éléments qui comptent dans la pastille : tout sauf les rappels de basse urgence. */
export function compterAFaire(elements: ReadonlyArray<{ urgence: string }>): number {
  return elements.filter((e) => e.urgence !== "basse").length;
}

/** Publie un nombre déjà connu (la page d'Accueil vient de charger la liste). */
export function publierNombreAFaire(companyId: string, nombre: number): void {
  etat = { companyId, nombre, lueLe: Date.now() };
  notifier();
}

/** Relit le nombre auprès du plugin ; un échec laisse la valeur précédente (la pastille est une aide, jamais bloquante). */
export function actualiserNombreAFaire(companyId: string, force = false): Promise<void> {
  const deja = enCours.get(companyId);
  if (deja) return deja;
  if (!force && etat.companyId === companyId && Date.now() - etat.lueLe < DELAI_MINI_MS) return Promise.resolve();
  const lecture = appelRoute<{ elements?: Array<{ urgence: string }> }>("GET", `/accueil?companyId=${encodeURIComponent(companyId)}`)
    .then((r) => publierNombreAFaire(companyId, compterAFaire(r.elements ?? [])))
    .catch(() => undefined)
    .finally(() => {
      enCours.delete(companyId);
    });
  enCours.set(companyId, lecture);
  return lecture;
}

/** Remet le compteur à zéro (tests). */
export function reinitialiserCompteurAFaire(): void {
  etat = { companyId: null, nombre: null, lueLe: 0 };
  enCours.clear();
  notifier();
}

/** Nombre d'éléments en attente pour l'entreprise, `null` tant qu'il est inconnu. */
export function useNombreAFaire(companyId: string | null | undefined): number | null {
  const { enregistrer } = useContexteDonnees();
  const nombre = useSyncExternalStore(
    (fn) => {
      abonnes.add(fn);
      return () => {
        abonnes.delete(fn);
      };
    },
    () => (companyId && etat.companyId === companyId ? etat.nombre : null),
    () => null,
  );
  useEffect(() => {
    if (!companyId) return;
    void actualiserNombreAFaire(companyId);
    const minuterie = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") void actualiserNombreAFaire(companyId, true);
    }, INTERVALLE_COMPTEUR_MS);
    const desenregistrer = enregistrer(() => void actualiserNombreAFaire(companyId, true));
    return () => {
      clearInterval(minuterie);
      desenregistrer();
    };
  }, [companyId, enregistrer]);
  return nombre;
}

/** Titre de l'onglet du navigateur : « (3) Atelier » quand des éléments attendent. */
export function titreOnglet(nombre: number | null): string {
  return nombre && nombre > 0 ? `(${nombre}) Atelier` : "Atelier";
}

/** Pose le titre de l'onglet tant que la page de l'atelier est montée, puis rend celui de l'hôte. */
export function useTitreOnglet(nombre: number | null): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const avant = document.title;
    document.title = titreOnglet(nombre);
    return () => {
      document.title = avant;
    };
  }, [nombre]);
}
