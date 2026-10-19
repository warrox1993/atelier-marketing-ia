/**
 * Bascule segmentée « Départements | Organigramme » en tête de la page d'ensemble du client. Même trait fin que les
 * autres contrôles (jetons `--atl-*`), cibles de 44 px au moins sur téléphone.
 */
export const STYLES_ENSEMBLE = `
.atl-bascule { display: inline-flex; align-self: flex-start; max-width: 100%; margin: 0 0 1rem; padding: 0.125rem; gap: 0.125rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface); }
.atl-bascule-bouton { min-height: 2.25rem; padding: 0.375rem 0.875rem; border: 0; border-radius: calc(var(--atl-rayon) * 0.75); background: transparent; color: var(--atl-attenue-fort); font: inherit; font-weight: 500; cursor: pointer; transition: background-color 150ms ease-out, color 150ms ease-out; }
.atl-bascule-bouton:hover { background: var(--atl-surface-2); color: var(--atl-texte); }
.atl-bascule-bouton[aria-pressed="true"] { background: var(--atl-accent); color: var(--atl-accent-texte); }
.atl-bascule-bouton:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
@media (max-width: 640px) { .atl-bascule-bouton { min-height: 2.75rem; } }
`;
