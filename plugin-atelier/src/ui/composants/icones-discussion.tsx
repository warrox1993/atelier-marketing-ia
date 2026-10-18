/**
 * Icônes de la discussion : tracé unique (24 px, trait de 1,75, extrémités arrondies), décoratives
 * (`aria-hidden`) : le nom accessible vient toujours du libellé du bouton qui les contient.
 */
import type { ReactNode } from "react";

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg className="atl-disc-icone-svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** Micro : dictée. */
export const IconeMicro = () => (
  <Icone>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </Icone>
);

/** Barres de son : voix en direct. */
export const IconeOndes = () => (
  <Icone>
    <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
  </Icone>
);

/** Carré plein : arrêter. */
export const IconeArret = () => (
  <Icone>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />
  </Icone>
);

/** Flèche vers le haut : envoyer. */
export const IconeEnvoi = () => (
  <Icone>
    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
  </Icone>
);
