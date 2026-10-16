/** Styles des échanges entre services (fiche d'une tâche et registre de la Direction). Sobres : traits fins, aucune carte imbriquée. */
export const STYLES_ECHANGES = `
.atl-ech-liste { display: flex; flex-direction: column; gap: 0; margin: 0; padding: 0; list-style: none; }
.atl-ech-liste > li { padding: 1.25rem 0; border-top: 1px solid var(--atl-trait); }
.atl-ech-liste > li:first-child { border-top: 0; padding-top: 0.25rem; }
.atl-ech-tete { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; }
.atl-ech-tete h3 { margin: 0; font-size: 1rem; font-weight: 600; }
.atl-ech-sens { margin: 0.125rem 0 0; color: var(--atl-attenue-fort); }
.atl-ech-dates { display: flex; flex-wrap: wrap; gap: 0.25rem 1.5rem; margin: 0.75rem 0 0; }
.atl-ech-dates div { display: flex; gap: 0.375rem; }
.atl-ech-dates dt { color: var(--atl-attenue); }
.atl-ech-dates dd { margin: 0; font-variant-numeric: tabular-nums; }
.atl-ech-bloc { margin-top: 1rem; }
.atl-ech-bloc h4 { margin: 0 0 0.25rem; font-size: 0.8125rem; font-weight: 600; color: var(--atl-attenue-fort); }
.atl-ech-texte { margin: 0; max-width: 70ch; white-space: pre-wrap; overflow-wrap: anywhere; }
.atl-ech-extraits { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.25rem; }
.atl-ech-extraits summary { display: flex; align-items: center; min-height: 2.75rem; cursor: pointer; font-weight: 500; }
.atl-ech-extraits details > .atl-ech-texte { padding: 0 0 0.75rem; }
.atl-ech-reponse { padding: 0.75rem 0.875rem; background: var(--atl-surface-2); border-radius: var(--atl-rayon); }
.atl-ech-filtres { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.75rem 1rem; align-items: end; margin-bottom: 1rem; }
.atl-ech-barre { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; margin-top: 0.75rem; }
.atl-ech-pages { display: flex; align-items: center; gap: 0.5rem; }
.atl-ech-filtres .atl-champ select, .atl-ech-filtres .atl-champ input { min-height: 2.75rem; }
.atl-ech .atl-bouton { min-height: 2.75rem; }
.atl-ech .atl-table td, .atl-ech .atl-table th { overflow-wrap: anywhere; }
`;
