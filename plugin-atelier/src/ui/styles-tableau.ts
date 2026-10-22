/**
 * Feuille de style du « Tableau de direction » : rangées à barres sobres, une seule teinte (celle d'information), le
 * mois précédent en simple repère. Les couleurs viennent des jetons de l'atelier (clair et sombre déjà réglés).
 * Aucune information ne repose sur la couleur seule : chaque rangée écrit sa valeur et son état.
 */
export const STYLES_TABLEAU = `
.atl-td-commandes { display: flex; flex-wrap: wrap; align-items: end; gap: 0.75rem 1.25rem; margin-block: 0.5rem 1.25rem; }
.atl-td-commandes label { display: grid; gap: 0.25rem; font-size: 0.875rem; }
.atl-td-commandes select { min-height: 2.25rem; padding: 0 0.5rem; }
.atl-td-lecture { font-size: 0.8125rem; color: var(--atl-attenue-fort); margin: 0 0 1rem; max-width: 70ch; }
.atl-td-lecture i { display: inline-block; vertical-align: middle; }
.atl-td-lecture .atl-td-cle-barre { width: 1.5rem; height: 0.5rem; background: var(--atl-info); border-radius: 0 3px 3px 0; margin-right: 0.25rem; }
.atl-td-lecture .atl-td-cle-repere { width: 2px; height: 0.9rem; background: var(--atl-texte); margin: 0 0.25rem 0 0.75rem; }
.atl-td-grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr)); gap: 0.5rem 2.5rem; align-items: start; }
.atl-td-rangees { list-style: none; margin: 0.25rem 0 0.75rem; padding: 0; display: grid; gap: 0.35rem; }
.atl-td-rangee { display: grid; grid-template-columns: minmax(8rem, 13rem) minmax(4rem, 1fr) minmax(9rem, 14rem); align-items: center; gap: 0.25rem 0.9rem; padding-block: 0.35rem; border-bottom: 1px solid var(--atl-trait); }
.atl-td-nom { font-size: 0.9375rem; overflow-wrap: anywhere; }
.atl-td-piste { position: relative; display: block; height: 0.75rem; border-radius: 0 4px 4px 0; background: color-mix(in oklab, var(--atl-trait) 55%, transparent); }
.atl-td-barre { position: absolute; inset: 0 auto 0 0; display: block; background: var(--atl-info); border-radius: 0 4px 4px 0; min-width: 2px; }
.atl-td-repere { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; background: var(--atl-texte); display: block; }
.atl-td-piste-vide { height: auto; min-height: 1.5rem; display: flex; align-items: center; padding-inline: 0.6rem; border: 1px dashed var(--atl-attenue); border-radius: 4px; background: transparent; font-size: 0.8125rem; font-style: italic; color: var(--atl-attenue-fort); }
.atl-td-chiffre { display: grid; gap: 0.1rem; font-variant-numeric: tabular-nums; }
.atl-td-chiffre strong { font-size: 1.125rem; font-weight: 600; line-height: 1.2; }
.atl-td-sous { font-size: 0.8125rem; color: var(--atl-attenue-fort); font-weight: 400; }
.atl-td-masque { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.atl-td-etat { font-style: italic; font-weight: 400; }
.atl-td-etat[data-etat="connexion_a_faire"] { color: var(--atl-attention); }
.atl-td-vide { font-style: italic; color: var(--atl-attenue-fort); margin-block: 0.25rem 0.75rem; max-width: 60ch; }
.atl-td-table td:nth-child(3) { font-variant-numeric: tabular-nums; }
.atl-td-sources { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.6rem; max-width: 80ch; }
.atl-td-sources li { display: grid; gap: 0.1rem; padding-bottom: 0.6rem; border-bottom: 1px solid var(--atl-trait); }
.atl-td-sources strong { font-weight: 600; }
.atl-td-rangee:focus-within, .atl-td-table tr:hover { background: color-mix(in oklab, var(--atl-trait) 25%, transparent); }
.atl-td-piste-vide:empty { min-height: 0.75rem; height: 0.75rem; padding: 0; }
@media (max-width: 40rem) {
  .atl-td-table, .atl-td-table tbody, .atl-td-table tr, .atl-td-table th, .atl-td-table td { display: block; overflow: visible; width: auto; }
  .atl-td-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .atl-td-table tr { padding-block: 0.5rem; border-bottom: 1px solid var(--atl-trait); }
  .atl-td-table th, .atl-td-table td { border: 0; padding: 0.1rem 0; }
  .atl-td-table .atl-num { text-align: left; font-size: 1.125rem; font-weight: 600; }
  .atl-rapport-table.atl-td-table th:first-child { width: auto; }
  .atl-td-rangee { grid-template-columns: 1fr; gap: 0.3rem; }
  .atl-td-piste-vide { justify-content: flex-start; }
}
@media (forced-colors: active) {
  .atl-td-barre { background: Highlight; forced-color-adjust: none; }
  .atl-td-repere { background: CanvasText; forced-color-adjust: none; }
}
@media print {
  .atl-td-barre { background: #000 !important; print-color-adjust: exact; }
  .atl-td-repere { background: #000 !important; print-color-adjust: exact; }
  .atl-td-piste { background: transparent; border-bottom: 0.5pt solid #000; }
  .atl-td-sous, .atl-td-etat, .atl-td-vide, .atl-td-piste-vide { color: #000 !important; }
}
`;
