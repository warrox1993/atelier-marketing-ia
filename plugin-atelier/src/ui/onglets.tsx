/**
 * Onglets accessibles (rôles `tablist`, `tab`, `tabpanel`), au clavier, à activation manuelle : les
 * flèches gauche et droite, Début et Fin déplacent seulement le focus ; Entrée ou Espace activent
 * l'onglet focalisé (Entrée et Espace sont natifs pour un bouton, Espace est ajouté pour un lien) ; un
 * seul onglet dans l'ordre de tabulation (tabindex itinérant). Lisibles sur
 * téléphone : la liste défile horizontalement, chaque onglet fait au moins 44 px de haut.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useHostLocation, useHostNavigation } from "@paperclipai/plugin-sdk/ui";

/** Ancre courante de l'adresse (sans « # »), suivie quand elle change. */
export function useAncre(): string {
  const { hash } = useHostLocation();
  const lire = () => (hash || (typeof window !== "undefined" ? window.location.hash : "")).replace(/^#/u, "");
  const [, forcer] = useState(0);
  useEffect(() => {
    const surChangement = () => forcer((n) => n + 1);
    window.addEventListener("hashchange", surChangement);
    window.addEventListener("popstate", surChangement);
    return () => {
      window.removeEventListener("hashchange", surChangement);
      window.removeEventListener("popstate", surChangement);
    };
  }, []);
  return lire();
}

export const idOnglet = (base: string, cle: string) => `${base}-onglet-${cle}`;
export const idPanneau = (base: string, cle: string) => `${base}-panneau-${cle}`;

export interface OngletListe {
  cle: string;
  libelle: string;
  /** Adresse relative d'un onglet-lien (navigation de l'hôte) ; absente : onglet-bouton. */
  vers?: string;
  /** Pastille ou compteur à la suite du libellé. */
  suite?: ReactNode;
}

interface PropsListe {
  etiquette: string;
  base: string;
  onglets: ReadonlyArray<OngletListe>;
  actif: string;
  /** Appelé pour un onglet-bouton (sans `vers`). */
  choisir?: (cle: string) => void;
  secondaire?: boolean;
}

export function ListeOnglets({ etiquette, base, onglets, actif, choisir, secondaire }: PropsListe) {
  const nav = useHostNavigation();
  const liste = useRef<HTMLDivElement>(null);
  // L'onglet actif est amené dans la vue (défilement horizontal sur téléphone).
  useEffect(() => {
    const el = liste.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [actif]);
  const surTouche = (e: KeyboardEvent<HTMLDivElement>) => {
    const touches = Array.from(liste.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
    const i = touches.findIndex((t) => t === document.activeElement);
    if (i < 0) return;
    if (e.key === " " && touches[i]!.tagName === "A") {
      e.preventDefault();
      touches[i]!.click();
      return;
    }
    const cible = e.key === "ArrowRight" ? (i + 1) % touches.length : e.key === "ArrowLeft" ? (i - 1 + touches.length) % touches.length : e.key === "Home" ? 0 : e.key === "End" ? touches.length - 1 : -1;
    if (cible < 0) return;
    e.preventDefault();
    touches[cible]!.focus(); // activation manuelle : l'onglet n'est affiché qu'après Entrée, Espace ou un clic
  };
  return (
    <div className={`atl-onglets-rub${secondaire ? " atl-onglets-rub-2" : ""}`}>
      <div role="tablist" aria-label={etiquette} ref={liste} onKeyDown={surTouche}>
        {onglets.map((o) => {
          const selectionne = o.cle === actif;
          const commun = {
            role: "tab" as const,
            id: idOnglet(base, o.cle),
            "aria-selected": selectionne,
            "aria-controls": selectionne ? idPanneau(base, o.cle) : undefined,
            tabIndex: selectionne ? 0 : -1,
          };
          return o.vers !== undefined ? (
            <a key={o.cle} {...nav.linkProps(o.vers)} {...commun}>
              {o.libelle}
              {o.suite}
            </a>
          ) : (
            <button key={o.cle} type="button" {...commun} onClick={() => choisir?.(o.cle)}>
              {o.libelle}
              {o.suite}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Panneau d'un onglet : visible seulement quand l'onglet est actif (`hidden` sinon, contenu conservé). */
export function PanneauOnglet({ base, cle, actif, children }: { base: string; cle: string; actif: boolean; children: ReactNode }) {
  return (
    <div role="tabpanel" id={idPanneau(base, cle)} aria-labelledby={idOnglet(base, cle)} hidden={!actif} tabIndex={0} className="atl-panneau">
      {children}
    </div>
  );
}
