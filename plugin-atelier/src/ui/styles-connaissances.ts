/**
 * Styles propres à la rubrique « Connaissances » : ils complètent `styles.ts` (jetons `--atl-*`
 * déjà définis) sans le modifier.
 */
export const STYLES_CONNAISSANCES = `
.atl-depot { display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; padding: 1.25rem 1rem; border: 1px dashed var(--atl-attenue); border-radius: var(--atl-rayon); background: var(--atl-surface); }
.atl-depot[data-survol="true"] { border-style: solid; border-color: var(--atl-accent); background: var(--atl-surface-2); }
.atl-depot-titre { font-weight: 600; }
.atl-depot input[type="file"] { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.atl-grille-doc { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.875rem 1rem; }
.atl-case { flex-direction: row; align-items: flex-start; gap: 0.5rem; }
.atl-passage { margin: 0; padding: 0.75rem 1rem; border-left: 2px solid var(--atl-trait); background: var(--atl-surface-2); border-radius: 0 var(--atl-rayon) var(--atl-rayon) 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.atl-passage[data-perime="true"] { border-left-color: var(--atl-attention); }
.atl-cite { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; align-items: center; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-cite code { font-size: 0.75rem; overflow-wrap: anywhere; }
.atl-resultat { display: flex; flex-direction: column; gap: 0.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--atl-trait); }
.atl-resultat:last-child { border-bottom: 0; }
.atl-confirmation { max-width: 40rem; }
@media (max-width: 40rem) {
  .atl-depot { padding: 1rem 0.75rem; }
}
`;
