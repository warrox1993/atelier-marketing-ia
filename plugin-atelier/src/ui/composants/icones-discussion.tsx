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

/** Engrenage : réglages du chat (huit dents, moyeu au centre). */
export const IconeReglages = () => (
  <Icone>
    <path d="M19.26 9.75 L21.86 10.31 L21.86 13.69 L19.26 14.25 L18.72 15.55 L20.17 17.77 L17.77 20.17 L15.55 18.72 L14.25 19.26 L13.69 21.86 L10.31 21.86 L9.75 19.26 L8.45 18.72 L6.23 20.17 L3.83 17.77 L5.28 15.55 L4.74 14.25 L2.14 13.69 L2.14 10.31 L4.74 9.75 L5.28 8.45 L3.83 6.23 L6.23 3.83 L8.45 5.28 L9.75 4.74 L10.31 2.14 L13.69 2.14 L14.25 4.74 L15.55 5.28 L17.77 3.83 L20.17 6.23 L18.72 8.45 Z" />
    <circle cx="12" cy="12" r="3" />
  </Icone>
);
