/**
 * Accès aux données de l'atelier par le pont natif de Paperclip.
 *
 * - `useDonnees` enveloppe `usePluginData` : heure du dernier chargement,
 *   enregistrement auprès du contexte pour l'actualisation groupée. L'hôte garde
 *   les données affichées pendant une actualisation, mais les efface si elle
 *   échoue (`paperclip/ui/src/plugins/bridge.ts`) : l'erreur s'affiche alors.
 * - `VeilleJournal` suit le journal de l'atelier (`afterSeq`, rattrapage après
 *   reconnexion) : de nouveaux événements rendent l'affichage « périmé », jamais
 *   animé sans événement réel. Les événements produits par une action de
 *   l'humain lui-même (`useAction`) ne comptent pas : l'action actualise les
 *   données, l'affichage n'est donc pas périmé (constat de la revue du lot C).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePluginAction, usePluginData, type PluginBridgeError } from "@paperclipai/plugin-sdk/ui";
import type { CleActionUi, CleDonneesUi } from "../contrats/ui.js";
import type { PageJournal } from "../contrats/campagnes.js";

/** Délai au-delà duquel un affichage est signalé comme ancien. */
export const DELAI_PERIME_MS = 10 * 60 * 1000;
/** Intervalle de lecture du journal (une requête légère, onglet visible seulement). */
export const INTERVALLE_JOURNAL_MS = 20 * 1000;
/** Marge après une action propre : ses événements, horodatés par le serveur, ne sont pas comptés. */
export const MARGE_ACTION_PROPRE_MS = 2000;

/**
 * Nombre d'événements à compter comme « nouveaux » : ceux postérieurs à la
 * dernière action propre de l'humain (plus une marge), seulement.
 */
export function compterNouveaux(evenements: ReadonlyArray<{ creeLe: string }>, ignorerJusqua: number): number {
  return evenements.filter((e) => {
    const t = Date.parse(e.creeLe);
    return Number.isNaN(t) || t > ignorerJusqua;
  }).length;
}

interface ContexteDonnees {
  enregistrer(fn: () => void): () => void;
  actualiserTout(): void;
  /** Après une action de l'humain : actualise tout et n'en compte pas les événements. */
  apresActionPropre(): void;
  nouveauxEvenements: number;
  journalDisponible: boolean;
}

const Contexte = createContext<ContexteDonnees | null>(null);

export function FournisseurDonnees({ children, veille = true }: { children: ReactNode; veille?: boolean }) {
  const fonctions = useRef(new Set<() => void>());
  const [nouveaux, setNouveaux] = useState(0);
  const [journalDisponible, setJournalDisponible] = useState(true);
  const ignorerJusqua = useRef(0);

  const enregistrer = useCallback((fn: () => void) => {
    fonctions.current.add(fn);
    return () => {
      fonctions.current.delete(fn);
    };
  }, []);
  const actualiserTout = useCallback(() => {
    setNouveaux(0);
    for (const fn of fonctions.current) fn();
  }, []);

  const apresActionPropre = useCallback(() => {
    ignorerJusqua.current = Date.now() + MARGE_ACTION_PROPRE_MS;
    actualiserTout();
  }, [actualiserTout]);

  const valeur = useMemo(
    () => ({ enregistrer, actualiserTout, apresActionPropre, nouveauxEvenements: nouveaux, journalDisponible }),
    [enregistrer, actualiserTout, apresActionPropre, nouveaux, journalDisponible],
  );
  return (
    <Contexte.Provider value={valeur}>
      {veille ? <VeilleJournal ignorerJusqua={ignorerJusqua} onNouveaux={(n) => setNouveaux((x) => x + n)} onDisponible={setJournalDisponible} /> : null}
      {children}
    </Contexte.Provider>
  );
}

export function useContexteDonnees(): ContexteDonnees {
  const c = useContext(Contexte);
  return c ?? { enregistrer: () => () => undefined, actualiserTout: () => undefined, apresActionPropre: () => undefined, nouveauxEvenements: 0, journalDisponible: false };
}

export interface ResultatDonnees<T> {
  data: T | null;
  loading: boolean;
  error: PluginBridgeError | null;
  refresh(): void;
  /** Heure du dernier chargement réussi. */
  chargeLe: Date | null;
}

export function useDonnees<T>(cle: CleDonneesUi, params?: Record<string, unknown>): ResultatDonnees<T> {
  const r = usePluginData<T>(cle, params);
  const [chargeLe, setChargeLe] = useState<Date | null>(null);
  const { enregistrer } = useContexteDonnees();
  const refresh = r.refresh;
  useEffect(() => enregistrer(refresh), [enregistrer, refresh]);
  useEffect(() => {
    if (!r.loading && r.data !== null && !r.error) setChargeLe(new Date());
  }, [r.loading, r.data, r.error]);
  return { data: r.data, loading: r.loading, error: r.error, refresh, chargeLe };
}

/** Action typée : renvoie une fonction qui lève l'erreur du pont telle quelle. */
export function useAction<T = unknown>(cle: CleActionUi): (params: Record<string, unknown>) => Promise<T> {
  const action = usePluginAction(cle);
  const { apresActionPropre } = useContexteDonnees();
  return useCallback(
    async (params: Record<string, unknown>) => {
      const resultat = (await action(params)) as T;
      apresActionPropre();
      return resultat;
    },
    [action, apresActionPropre],
  );
}

/**
 * Lit le journal par pages (`afterSeq`) jusqu'au dernier événement, puis relit
 * périodiquement : chaque événement postérieur au chargement est compté.
 */
function VeilleJournal({
  ignorerJusqua,
  onNouveaux,
  onDisponible,
}: {
  ignorerJusqua: { current: number };
  onNouveaux(n: number): void;
  onDisponible(ok: boolean): void;
}) {
  const [curseur, setCurseur] = useState(0);
  const rattrape = useRef(false);
  const { data, error, refresh, loading } = usePluginData<PageJournal>("atelier.journal", { afterSeq: curseur });

  useEffect(() => {
    onDisponible(!error);
  }, [error, onDisponible]);

  useEffect(() => {
    if (loading || !data) return;
    const n = data.evenements.length;
    if (n > 0 && data.dernierSeq > curseur) {
      if (rattrape.current) {
        const comptes = compterNouveaux(data.evenements, ignorerJusqua.current);
        if (comptes > 0) onNouveaux(comptes);
      }
      setCurseur(data.dernierSeq);
    }
    if (data.complet || n === 0) rattrape.current = true;
  }, [data, loading, curseur, onNouveaux, ignorerJusqua]);

  useEffect(() => {
    const minuterie = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") refresh();
    }, INTERVALLE_JOURNAL_MS);
    return () => clearInterval(minuterie);
  }, [refresh]);

  return null;
}
