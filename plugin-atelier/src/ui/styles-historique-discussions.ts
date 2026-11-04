/**
 * Styles de la colonne d'historique des discussions (voir `composants/historique-discussions.tsx`). Même hauteur que la
 * section de la discussion (`--atl-hote-haut`, voir `styles-discussion.ts`) : la colonne défile seule, le fil aussi.
 * Mobile : la colonne se replie derrière le bouton « Discussions » de l'en-tête et s'ouvre par-dessus le fil.
 * La discussion ouverte se lit à son fond et à son graissage (jamais à la couleur seule) ; cibles de 44 px ; aucun
 * mouvement hors un fondu de survol de 150 ms.
 */
export const STYLES_HISTORIQUE = `
.atl-disc-cadre { --atl-hote-haut: 11.5rem; position: relative; display: grid; grid-template-columns: 15.5rem minmax(0, 1fr); gap: 1rem; height: calc(100dvh - var(--atl-hote-haut)); min-height: 22rem; width: 100%; min-width: 0; }
.atl-page:has(> .atl-disc-cadre) { padding-bottom: 0; }
.atl-disc-cadre > .atl-disc { height: 100%; min-height: 0; }
.atl-disc-historique { display: flex; flex-direction: column; gap: 0.75rem; min-height: 0; padding-right: 0.75rem; border-right: 1px solid var(--atl-trait); overflow-y: auto; overscroll-behavior: contain; }
.atl-disc-nouvelle { width: 100%; min-height: 2.75rem; }
.atl-disc-liste { display: flex; flex-direction: column; gap: 0.125rem; margin: 0; padding: 0; list-style: none; }
.atl-disc-ligne { position: relative; display: flex; align-items: center; gap: 0.125rem; }
.atl-disc-ligne > .atl-disc-item { flex: 1; min-width: 0; }
.atl-disc-supprimer { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 2.75rem; height: 2.75rem; padding: 0; border: 0; border-radius: calc(var(--atl-rayon) * 0.8); background: transparent; color: var(--atl-attenue-fort); cursor: pointer; opacity: 0; transition: background-color 150ms ease-out, opacity 150ms ease-out; }
.atl-disc-ligne:hover > .atl-disc-supprimer, .atl-disc-ligne:focus-within > .atl-disc-supprimer, .atl-disc-supprimer:focus-visible { opacity: 1; }
.atl-disc-supprimer:hover { background: var(--atl-surface-2); color: var(--atl-texte); }
.atl-disc-supprimer:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-disc-confirmation { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; width: 100%; min-height: 2.75rem; box-sizing: border-box; padding: 0.25rem 0.625rem; border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface-2); font-size: 0.9375rem; }
@media (hover: none) { .atl-disc-supprimer { opacity: 1; } }
.atl-disc-item { display: flex; flex-direction: column; align-items: flex-start; gap: 0.125rem; width: 100%; min-height: 2.75rem; box-sizing: border-box; padding: 0.5rem 0.625rem; border: 0; border-radius: calc(var(--atl-rayon) * 0.8); background: transparent; color: var(--atl-texte); font: inherit; text-align: left; cursor: pointer; transition: background-color 150ms ease-out; }
.atl-disc-item:hover, .atl-disc-item[aria-current="true"] { background: var(--atl-surface-2); }
.atl-disc-item:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-disc-item-titre { width: 100%; font-size: 0.9375rem; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.atl-disc-item[aria-current="true"] .atl-disc-item-titre { font-weight: 600; }
.atl-disc-item-date { font-size: 0.75rem; line-height: 1.3; color: var(--atl-attenue-fort); font-variant-numeric: tabular-nums; }
.atl-disc-historique-note { margin: 0; font-size: 0.875rem; line-height: 1.45; color: var(--atl-attenue-fort); }
.atl-disc-bascule { display: none; }
@media (max-width: 767px) {
  .atl-disc-cadre { --atl-hote-haut: calc(14.25rem + env(safe-area-inset-top, 0px) + env(safe-area-inset-bottom, 0px)); grid-template-columns: minmax(0, 1fr); }
  .atl-disc-bascule { display: inline-flex; flex: none; min-height: 2.75rem; }
  .atl-disc-historique { display: none; }
  .atl-disc-historique[data-ouvert="oui"] { display: flex; position: absolute; inset: 0 0 auto 0; z-index: 4; max-height: 100%; padding: 0.75rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-fond); box-shadow: 0 6px 20px color-mix(in oklab, var(--atl-texte) 14%, transparent); }
}
@media (prefers-reduced-motion: reduce) { .atl-disc-item, .atl-disc-supprimer { transition: none; } }
`;
