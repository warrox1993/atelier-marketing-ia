/**
 * Styles de la page « Agents » (mode outil : trouver un agent d'un coup d'œil). Une liste dense par
 * département, sans cartes : nom et intitulé à gauche, puis état en texte, modèle et dernier battement. Mêmes jetons
 * `--atl-*` que le reste de l'atelier, trait fin, aucune ombre. L'état n'est jamais porté par la seule couleur.
 */
export const STYLES_AGENTS_TOUS = `
.atl-ag { display: flex; flex-direction: column; gap: 1rem; }
.atl-ag-resume { margin: 0; font-size: 0.875rem; color: var(--atl-attenue-fort); font-variant-numeric: tabular-nums; }
.atl-ag-outils { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem 1rem; }
.atl-ag-onglets { display: inline-flex; flex-wrap: wrap; padding: 0.125rem; gap: 0.125rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface); }
.atl-ag-onglet { min-height: 2.25rem; padding: 0.375rem 0.875rem; border: 0; border-radius: calc(var(--atl-rayon) * 0.75); background: transparent; color: var(--atl-attenue-fort); font: inherit; font-weight: 500; cursor: pointer; transition: background-color 150ms ease-out, color 150ms ease-out; }
.atl-ag-onglet:hover { background: var(--atl-surface-2); color: var(--atl-texte); }
.atl-ag-onglet[aria-pressed="true"] { background: var(--atl-accent); color: var(--atl-accent-texte); }
.atl-ag-onglet:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-ag-champ { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-ag-champ input, .atl-ag-champ select { min-height: 2.25rem; padding: 0.375rem 0.625rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); color: var(--atl-texte); font: inherit; }
.atl-ag-champ input { width: min(100%, 16rem); }
.atl-ag-champ input:focus-visible, .atl-ag-champ select:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-ag-groupe { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.5rem; }
.atl-ag-groupe h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.125rem 0.75rem; margin: 0; padding-bottom: 0.375rem; border-bottom: 1px solid var(--atl-trait); font-size: 1rem; font-weight: 600; }
.atl-ag-compte { font-size: 0.8125rem; font-weight: 400; color: var(--atl-attenue-fort); font-variant-numeric: tabular-nums; }
.atl-ag-liste { margin: 0; padding: 0; list-style: none; }
.atl-ag-ligne { display: grid; grid-template-columns: minmax(0, 2.4fr) 10rem minmax(0, 1.4fr) 8rem; align-items: center; gap: 0.25rem 1rem; min-height: 2.75rem; padding: 0.25rem 0.5rem; border-bottom: 1px solid color-mix(in oklab, var(--atl-trait) 55%, transparent); }
.atl-ag-ligne:hover { background: color-mix(in oklab, var(--atl-surface-2) 55%, var(--atl-fond)); }
.atl-ag-identite { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 0.625rem; min-width: 0; }
.atl-ag-nom { padding-block: 0.375rem; color: var(--atl-texte); font-weight: 500; text-decoration: none; overflow-wrap: anywhere; }
.atl-ag-nom:hover { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
.atl-ag-nom:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-ag-titre { font-size: 0.8125rem; color: var(--atl-attenue-fort); overflow-wrap: anywhere; }
.atl-ag-etat { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8125rem; color: var(--atl-texte); }
.atl-ag-etat::before { content: ""; flex: none; width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--atl-attenue); }
.atl-ag-etat[data-famille="actif"]::before { background: var(--atl-succes, var(--atl-accent)); }
.atl-ag-etat[data-famille="pause"]::before { background: var(--atl-attention); }
.atl-ag-etat[data-famille="erreur"] { color: var(--atl-danger); }
.atl-ag-etat[data-famille="erreur"]::before { background: var(--atl-danger); }
.atl-ag-modele, .atl-ag-battement { font-size: 0.75rem; color: var(--atl-attenue); overflow-wrap: anywhere; }
.atl-ag-vide { margin: 0.25rem 0.5rem; font-size: 0.8125rem; color: var(--atl-attenue); }
.atl-ag-erreur { display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; font-size: 0.8125rem; color: var(--atl-danger); }
.atl-ag-erreur p { margin: 0; }
/* Étroit : nom et intitulé en tête, puis état, modèle et battement sur une seule ligne dessous. */
@media (max-width: 720px) {
  .atl-ag-ligne { grid-template-columns: auto minmax(0, 1fr) auto; }
  .atl-ag-identite { grid-column: 1 / -1; }
  .atl-ag-modele { text-align: center; }
  .atl-ag-battement { text-align: right; }
  .atl-ag-onglet { min-height: 2.75rem; }
}
`;
