/**
 * Décisions humaines qui attendent dans les AUTRES services du client (cartes `ask_user_questions` et
 * `request_confirmation` posées sur les tâches reçues par une liaison née du chat du Coordinateur général).
 *
 * UNE seule lecture partagée pour tous les emplacements de l'interface : la route du plugin
 * (`GET /discussion/cartes-services`, entreprise Direction) rend les tâches reçues à suivre, puis l'interface lit les
 * cartes dans l'hôte, avec la session de la personne (`cartes-services-lecture.ts`) ; la route ne peut pas lire les
 * autres entreprises (portée de l'hôte). Elle sert : le fil du chat, le message d'ouverture, la pastille du menu, le titre de l'onglet, le bandeau et la
 * notification du navigateur. Relue toutes les 15 s tant qu'un emplacement est monté, onglet visible seulement (onglet
 * caché : seulement si la personne a demandé les notifications du navigateur). Aucune écriture, jamais.
 *
 * Le nombre est aussi publié pour le menu du socle (`window.__atelierDecisions` et l'événement `atelier:decisions`),
 * qui n'a pas accès aux données du plugin.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { CarteService, TacheASuivre } from "../contrats/carte-decision.js";
import type { MissionLue } from "./avancement-missions.js";
import { lireCartesDesServices } from "./cartes-services-lecture.js";
import { MINIMUM_DEPARTEMENTS, useDepartements } from "./departements-sonde.js";
import { appelRoute } from "./routes-prospection.js";

export type { CarteService };

/** Réponse de la route du plugin : les tâches reçues à suivre dans les autres services. */
interface ReponseTaches {
  taches: TacheASuivre[];
  indisponible: boolean;
}
export const INTERVALLE_CARTES_SERVICES_MS = 15_000;
/** Deux lectures plus proches que ce délai n'en font qu'une (plusieurs emplacements montés ensemble). */
const DELAI_MINI_MS = 3_000;
export const EVENEMENT_DECISIONS = "atelier:decisions";
export const CLE_NOTIFICATIONS = "atelier.notifications";

interface Etat {
  directionId: string | null;
  cartes: readonly CarteService[];
  missions: readonly MissionLue[];
  indisponible: boolean;
  /** Au moins une lecture a abouti pour cette entreprise. */
  lue: boolean;
  lueLe: number;
}
const VIDE: Etat = {
  directionId: null,
  cartes: [],
  missions: [],
  indisponible: false,
  lue: false,
  lueLe: 0,
};
let etat: Etat = VIDE;
const abonnes = new Set<() => void>();
const consommateurs = new Map<string, number>();
let minuteur: ReturnType<typeof setInterval> | null = null;
let enCours: Promise<void> | null = null;
/** Cartes déjà vues (pour ne notifier que les nouvelles) ; `null` avant la première lecture. */
let vues: Set<string> | null = null;

function publier(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __atelierDecisions?: number };
  const n = etat.cartes.length;
  w.__atelierDecisions = n;
  window.dispatchEvent(
    new CustomEvent(EVENEMENT_DECISIONS, { detail: { nombre: n } }),
  );
}

function changer(suivant: Etat): void {
  etat = suivant;
  for (const fn of abonnes) fn();
  publier();
}

/** Le navigateur peut-il prévenir (autorisé ET demandé par la personne dans les réglages du chat) ? */
export function notificationsActives(): boolean {
  try {
    return (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      window.localStorage.getItem(CLE_NOTIFICATIONS) === "1"
    );
  } catch {
    return false;
  }
}

/** Phrase unique du bandeau et des notifications. */
export function phraseDecisions(cartes: readonly CarteService[]): string {
  if (cartes.length === 0) return "";
  const services = [...new Set(cartes.map((c) => c.nom))];
  if (services.length === 1) {
    const nom = services[0]!;
    if (cartes.length > 1)
      return `Le service ${nom} attend ${cartes.length} décisions de votre part.`;
    return cartes[0]!.element.interaction?.kind === "ask_user_questions"
      ? `Le service ${nom} vous pose une question.`
      : `Le service ${nom} attend votre accord.`;
  }
  const liste = `${services.slice(0, -1).join(", ")} et ${services.at(-1)}`;
  return `${cartes.length} décisions vous attendent, dans les services ${liste}.`;
}

function prevenir(nouvelles: readonly CarteService[]): void {
  if (nouvelles.length === 0 || !notificationsActives()) return;
  try {
    new Notification("Atelier : une décision vous attend", {
      body: phraseDecisions(nouvelles),
      tag: "atelier-decisions",
    });
  } catch {
    // Notification refusée par le navigateur (contexte non sécurisé…) : le bandeau et la pastille restent.
  }
}

/** Relit les cartes auprès du plugin ; un échec garde les cartes connues et le signale (`indisponible`). */
export function actualiserCartesServices(
  directionId: string,
  force = false,
): Promise<void> {
  if (enCours) return enCours;
  if (
    !force &&
    etat.directionId === directionId &&
    etat.lue &&
    Date.now() - etat.lueLe < DELAI_MINI_MS
  )
    return Promise.resolve();
  const lecture = appelRoute<Partial<ReponseTaches>>(
    "GET",
    `/discussion/cartes-services?companyId=${encodeURIComponent(directionId)}${force ? "&frais=1" : ""}`,
  )
    .then(async (r) => {
      const taches = Array.isArray(r?.taches) ? r.taches : [];
      const lues = await lireCartesDesServices(taches);
      const cartes = lues.cartes;
      if (vues === null || etat.directionId !== directionId)
        vues = new Set(cartes.map((c) => c.element.id));
      else {
        const nouvelles = cartes.filter((c) => !vues!.has(c.element.id));
        for (const c of nouvelles) vues.add(c.element.id);
        prevenir(nouvelles);
      }
      changer({
        directionId,
        cartes,
        missions: lues.missions,
        indisponible: r?.indisponible === true || lues.indisponible,
        lue: true,
        lueLe: Date.now(),
      });
    })
    .catch(() => {
      if (etat.directionId === directionId)
        changer({ ...etat, indisponible: true });
    })
    .finally(() => {
      enCours = null;
    });
  enCours = lecture;
  return lecture;
}

/** Remet l'état à zéro (tests). */
export function reinitialiserCartesServices(): void {
  if (minuteur !== null) clearInterval(minuteur);
  minuteur = null;
  consommateurs.clear();
  enCours = null;
  vues = null;
  changer(VIDE);
}

function demarrer(): void {
  if (minuteur !== null) return;
  minuteur = setInterval(() => {
    const directionId = consommateurs.keys().next().value;
    if (!directionId) return;
    const visible =
      typeof document === "undefined" || document.visibilityState !== "hidden";
    if (visible || notificationsActives())
      void actualiserCartesServices(directionId, true);
  }, INTERVALLE_CARTES_SERVICES_MS);
}

/** Entreprise Direction du client de l'entreprise courante (client à plusieurs services seulement), sinon `null`. */
export function useDirectionId(
  courante: string | null | undefined,
): string | null {
  const r = useDepartements(courante);
  if (!r || r.departements.length < MINIMUM_DEPARTEMENTS) return null;
  return r.departements.find((d) => d.estDirection)?.companyId ?? null;
}

export interface CartesServices {
  cartes: readonly CarteService[];
  indisponible: boolean;
  /** Relecture immédiate (après une réponse : la carte traitée quitte la liste). */
  rafraichir(): void;
}

const SANS_CARTES: readonly CarteService[] = [];
const SANS_MISSIONS: readonly MissionLue[] = [];

/** Missions suivies (lues avec les cartes, même minuteur : aucune lecture en double). L'abonnement vient de `useCartesServices`. */
export function useMissionsServices(directionId: string | null): readonly MissionLue[] {
  return useSyncExternalStore(
    (fn) => {
      abonnes.add(fn);
      return () => void abonnes.delete(fn);
    },
    () => (directionId && etat.directionId === directionId ? etat.missions : SANS_MISSIONS),
    () => SANS_MISSIONS,
  );
}

/**
 * Cartes des services pour la Direction `directionId` (`null` : rien à lire, liste vide). Tous les emplacements montés
 * partagent la même lecture et le même minuteur.
 */
export function useCartesServices(directionId: string | null): CartesServices {
  const cartes = useSyncExternalStore(
    (fn) => {
      abonnes.add(fn);
      return () => void abonnes.delete(fn);
    },
    () =>
      directionId && etat.directionId === directionId
        ? etat.cartes
        : SANS_CARTES,
    () => SANS_CARTES,
  );
  const indisponible = useSyncExternalStore(
    (fn) => {
      abonnes.add(fn);
      return () => void abonnes.delete(fn);
    },
    () =>
      Boolean(
        directionId && etat.directionId === directionId && etat.indisponible,
      ),
    () => false,
  );
  useEffect(() => {
    if (!directionId) {
      if (etat.directionId !== null && consommateurs.size === 0) changer(VIDE);
      return;
    }
    consommateurs.set(directionId, (consommateurs.get(directionId) ?? 0) + 1);
    void actualiserCartesServices(directionId);
    demarrer();
    const surVisibilite = () => {
      if (document.visibilityState === "visible")
        void actualiserCartesServices(directionId);
    };
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      document.removeEventListener("visibilitychange", surVisibilite);
      const reste = (consommateurs.get(directionId) ?? 1) - 1;
      if (reste <= 0) consommateurs.delete(directionId);
      else consommateurs.set(directionId, reste);
      if (consommateurs.size === 0 && minuteur !== null) {
        clearInterval(minuteur);
        minuteur = null;
      }
    };
  }, [directionId]);
  return {
    cartes,
    indisponible,
    rafraichir: () =>
      directionId && void actualiserCartesServices(directionId, true),
  };
}
