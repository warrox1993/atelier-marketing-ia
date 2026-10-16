/**
 * Feuille de style du « Rapport du mois » : lecture à l'écran sobre et mise en page imprimable.
 * À l'impression (`@media print`), seule la page du rapport reste visible : ni menus, ni onglets, ni commandes,
 * noir sur blanc, tableaux à filets, lisible en noir et blanc (aucune information portée par la seule couleur).
 */
export const STYLES_RAPPORT = `
.atl-rapport-commandes { display: flex; flex-wrap: wrap; align-items: end; gap: 0.75rem 1rem; margin-block: 0.5rem 1.25rem; }
.atl-rapport-commandes label { display: grid; gap: 0.25rem; font-size: 0.875rem; }
.atl-rapport-commandes select { min-height: 2.25rem; padding: 0 0.5rem; }
.atl-rapport-titre { margin: 0 0 0.25rem; font-size: 1.5rem; line-height: 1.2; }
.atl-rapport-periode { margin: 0 0 1.5rem; color: var(--atl-attenue-fort); }
.atl-rapport-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.atl-rapport-table th, .atl-rapport-table td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--atl-trait); text-align: left; vertical-align: top; }
.atl-rapport-table thead th { font-size: 0.8125rem; font-weight: 600; border-bottom: 2px solid var(--atl-texte); }
.atl-rapport-table .atl-num { text-align: right; white-space: nowrap; }
.atl-rapport-table tr { break-inside: avoid; }
.atl-rapport-note { display: block; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-rapport-non-mesure { font-style: italic; }
.atl-rapport-liste { margin: 0; padding-left: 1.25rem; }
.atl-rapport-liste li { margin-block: 0.35rem; }
.atl-rapport-pied { margin-top: 1.5rem; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
@media (max-width: 40rem) {
  .atl-rapport-table { display: block; overflow-x: auto; }
}
@media print {
  body * { visibility: hidden !important; }
  .atl-rapport, .atl-rapport * { visibility: visible !important; }
  .atl-rapport { position: absolute; inset: 0 auto auto 0; width: 100%; margin: 0; padding: 0; color: #000; background: #fff; font-size: 11pt; }
  .atl-rapport-commandes, .atl-rapport-non-imprimable { display: none !important; }
  .atl-rapport-table { display: table; overflow: visible; }
  .atl-rapport-table th, .atl-rapport-table td { border-bottom: 0.5pt solid #000; color: #000; }
  .atl-rapport-note, .atl-rapport-periode, .atl-rapport-pied { color: #000; }
  .atl-rapport section { break-inside: avoid-page; margin-bottom: 1.2rem; }
  .atl-rapport h2 { border-bottom: 1pt solid #000; padding-bottom: 0.15rem; }
  @page { margin: 18mm; }
}
`;
