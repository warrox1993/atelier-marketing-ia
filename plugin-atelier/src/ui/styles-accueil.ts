/**
 * Styles propres à l'accueil : ils complètent `styles.ts` (jetons `--atl-*` déjà définis) sans le
 * modifier. Aucune animation : la page reste immobile.
 */
export const STYLES_ACCUEIL = `
.atl-demande { display: flex; flex-direction: column; gap: 0.75rem; max-width: 46rem; }
.atl-demande textarea { width: 100%; min-height: 6rem; resize: vertical; padding: 0.625rem 0.75rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-fond); color: inherit; font: inherit; line-height: 1.5; }
.atl-demande textarea:focus-visible { outline-offset: 0; border-color: var(--atl-anneau); }
.atl-demande-modeles { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.atl-demande-modeles > .atl-demande-aide { flex: 1 0 100%; }
.atl-demande-pied { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; }
.atl-demande-aide { color: var(--atl-attenue-fort); }
.atl-demande-retour { color: var(--atl-succes); }
.atl-demande-erreur { color: var(--atl-danger); }
.atl-afaire { display: flex; flex-direction: column; }
.atl-afaire > li { display: grid; grid-template-columns: 8.5rem minmax(0, 1fr) auto; align-items: start; gap: 0.25rem 1rem; padding: 0.75rem 0; border-top: 1px solid var(--atl-trait); }
.atl-afaire > li:first-child { border-top: 0; padding-top: 0.25rem; }
.atl-afaire-texte { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; }
.atl-afaire-titre { font-weight: 600; overflow-wrap: anywhere; }
.atl-afaire-raison { color: var(--atl-attenue-fort); max-width: 65ch; }
.atl-afaire .atl-bouton { align-self: start; }
.atl-afaire .atl-bouton { text-decoration: none; }
.atl-mission { display: flex; flex-direction: column; gap: 0.5rem; padding-bottom: 1.25rem; }
.atl-mission-titre { font-weight: 600; }
.atl-frise { display: flex; flex-direction: column; margin-left: 0.375rem; border-left: 1px solid var(--atl-trait); }
.atl-frise > li { position: relative; display: flex; flex-direction: column; gap: 0.125rem; padding: 0.375rem 0 0.5rem 1rem; }
.atl-frise > li::before { content: ""; position: absolute; left: -0.25rem; top: 0.9rem; width: 0.4375rem; height: 0.4375rem; border-radius: 50%; background: var(--atl-attenue); }
.atl-frise > li[data-profondeur="0"]::before { background: var(--atl-accent); }
.atl-frise > li[data-profondeur="2"], .atl-frise > li[data-profondeur="3"] { margin-left: 1rem; }
.atl-frise-ligne { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.625rem; }
.atl-frise-agent { color: var(--atl-attenue-fort); }
.atl-frise-commentaire { color: var(--atl-attenue-fort); max-width: 70ch; overflow-wrap: anywhere; }
.atl-afaire-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
.atl-afaire-detail { grid-column: 1 / -1; margin-top: 0.25rem; padding: 0.75rem; border-left: 3px solid var(--atl-accent); border-radius: 0 calc(var(--atl-rayon) * 0.8) calc(var(--atl-rayon) * 0.8) 0; background: var(--atl-surface-2); }
.atl-afaire-confirmation { margin-bottom: 0.75rem; }
.atl-surplace { display: flex; flex-direction: column; gap: 0.75rem; max-width: 46rem; }
.atl-surplace-apercu { max-height: 18rem; overflow: auto; padding: 0.625rem 0.75rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-fond); }
.atl-surplace-texte { margin: 0; padding: 0.625rem 0.75rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-fond); white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
.atl-surplace-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.atl-question { margin: 0; }
.atl-decision-integre { display: flex; flex-direction: column; gap: 0.75rem; }
@media (max-width: 40rem) {
  .atl-afaire > li { grid-template-columns: minmax(0, 1fr); }
  .atl-afaire-actions { justify-content: flex-start; }
  .atl-afaire .atl-bouton, .atl-surplace .atl-bouton, .atl-surplace .atl-lien { min-height: 2.75rem; }
  .atl-surplace .atl-lien { display: inline-flex; align-items: center; }
  .atl-surplace input[type="radio"], .atl-surplace input[type="checkbox"] { width: 1.25rem; height: 1.25rem; }
}
.atl-prospection { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.75rem 1rem; border: 1px solid var(--atl-trait); border-left: 3px solid var(--atl-accent); border-radius: var(--atl-rayon); background: var(--atl-surface); }
.atl-prospection-actions .atl-bouton { max-width: 100%; white-space: normal; text-align: left; }
.atl-prospection-chiffres { display: flex; flex-wrap: wrap; gap: 0.5rem 2rem; }
.atl-prospection-chiffre { display: flex; flex-direction: column; }
.atl-prospection-valeur { font-size: 1.75rem; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; }
.atl-prospection-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.atl-prospection-actions .atl-bouton { text-decoration: none; }
`;
