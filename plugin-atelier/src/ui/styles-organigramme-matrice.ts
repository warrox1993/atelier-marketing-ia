/**
 * Styles de la matrice des échanges (organigramme) : tableau services x services à en-têtes collants, une seule teinte
 * (--atl-info) en cinq paliers d'intensité, liste « service → partenaires » sur téléphone. Mêmes jetons --atl-* que le reste
 * de l'atelier, donc clair et sombre de l'hôte. Aucun dégradé, aucune ombre portée : le repère « A » et la bordure épaisse de la
 * case choisie disent l'état en toutes lettres, jamais par la couleur seule.
 */
export const STYLES_ORGANIGRAMME_MATRICE = `
.atl-mx { display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }
.atl-mx-legende { display: flex; flex-direction: column; gap: 0.25rem; margin: 0; max-width: 70ch; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-mx-legende p { margin: 0; }
.atl-mx-option { display: inline-flex; align-items: center; align-self: flex-start; gap: 0.5rem; min-height: 1.5rem; font-size: 0.8125rem; color: var(--atl-texte); cursor: pointer; }
.atl-mx-option input { flex: none; width: 1rem; height: 1rem; margin: 0; accent-color: var(--atl-texte); cursor: pointer; }
.atl-mx-option input:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-mx-repere { display: inline-block; min-width: 1rem; padding: 0 0.125rem; border: 1px solid var(--atl-attenue-fort); border-radius: 2px; font-size: 0.6875rem; font-weight: 700; line-height: 1.1rem; text-align: center; color: var(--atl-texte); }

.atl-mx-defile { max-height: min(72vh, 44rem); overflow: auto; padding: 0.5rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface); overscroll-behavior: contain; }
.atl-mx-defile:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-mx-table { border-collapse: separate; border-spacing: 0; font-size: 0.8125rem; font-variant-numeric: tabular-nums; }
.atl-mx-table caption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.atl-mx-table th, .atl-mx-table td { padding: 0; border-right: 1px solid var(--atl-trait); border-bottom: 1px solid var(--atl-trait); background: var(--atl-surface); text-align: center; font-weight: 400; }
.atl-mx-table thead th { position: sticky; top: 0; z-index: 2; height: 11rem; min-width: 2.75rem; width: 2.75rem; vertical-align: bottom; }
.atl-mx-table tbody th { position: sticky; left: 0; z-index: 1; min-width: 9rem; max-width: 12rem; text-align: left; }
.atl-mx-table thead th.atl-mx-coin { left: 0; z-index: 3; min-width: 9rem; max-width: 12rem; padding: 0.5rem; text-align: left; vertical-align: bottom; font-size: 0.75rem; color: var(--atl-attenue-fort); }
.atl-mx-table tfoot th { position: sticky; left: 0; z-index: 1; padding: 0 0.5rem; text-align: left; border-top: 1px solid var(--atl-texte); }
.atl-mx-table tfoot td { border-top: 1px solid var(--atl-texte); }

.atl-mx-nom { display: block; max-width: 100%; margin: 0; padding: 0.375rem 0.5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 0; background: transparent; color: var(--atl-texte); font: inherit; font-weight: 500; text-align: left; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; cursor: pointer; }
/* Nom de colonne : écrit à la verticale, sur deux lignes au besoin (jamais coupé par des points de suspension), le nom complet reste dans l’attribut title. */
.atl-mx-nom-colonne { writing-mode: vertical-rl; transform: rotate(180deg); max-height: 10.75rem; width: 100%; padding: 0.5rem 0.25rem; overflow: hidden; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; font-size: 0.75rem; line-height: 1.2; text-align: left; }
.atl-mx-nom:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: -2px; border-radius: 2px; }
.atl-mx-total-tete { display: block; writing-mode: vertical-rl; transform: rotate(180deg); max-height: 10.75rem; padding: 0.5rem 0.375rem; color: var(--atl-attenue-fort); font-weight: 600; white-space: nowrap; }
.atl-mx-total { min-width: 2.5rem; padding: 0 0.375rem; color: var(--atl-attenue-fort); font-weight: 600; }

.atl-mx-case { width: 2.75rem; height: 2rem; }
.atl-mx-case[data-diagonale] { background: var(--atl-surface-2); }
.atl-mx-bouton { position: relative; display: flex; align-items: center; justify-content: center; gap: 1px; width: 100%; height: 100%; min-height: 2rem; margin: 0; padding: 0; border: 0; background: transparent; color: var(--atl-texte); font: inherit; font-weight: 600; cursor: pointer; }
.atl-mx-bouton:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: -2px; }
.atl-mx-bouton[aria-pressed="true"] { outline: 2px solid var(--atl-texte); outline-offset: -2px; font-weight: 800; }
.atl-mx-bouton[aria-pressed="true"]:focus-visible { outline-style: double; outline-width: 3px; }
.atl-mx-case[data-palier="1"] { background: color-mix(in oklab, var(--atl-info) 13%, var(--atl-surface)); }
.atl-mx-case[data-palier="2"] { background: color-mix(in oklab, var(--atl-info) 24%, var(--atl-surface)); }
.atl-mx-case[data-palier="3"] { background: color-mix(in oklab, var(--atl-info) 36%, var(--atl-surface)); }
.atl-mx-case[data-palier="4"] { background: color-mix(in oklab, var(--atl-info) 48%, var(--atl-surface)); }
.atl-mx-a { font-size: 0.625rem; font-weight: 700; line-height: 1; padding: 1px 2px; border: 1px solid currentColor; border-radius: 2px; }
.atl-mx-bouton .atl-mx-a { position: absolute; top: 1px; right: 1px; }
.atl-mx-table td[data-croise] { box-shadow: inset 0 0 0 100vmax color-mix(in oklab, var(--atl-texte) 8%, transparent); }
.atl-mx-table th[data-croise] .atl-mx-nom { font-weight: 800; text-decoration-thickness: 2px; }

.atl-mx-detail { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.875rem 1rem; border: 1px solid var(--atl-texte); border-radius: var(--atl-rayon); background: var(--atl-surface); }
.atl-mx-detail h3 { margin: 0; font-size: 0.9375rem; font-weight: 600; }
.atl-mx-detail-aide { margin: 0; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-mx-echanges { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--atl-trait); }
.atl-mx-echanges li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.125rem 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid var(--atl-trait); font-size: 0.8125rem; }
.atl-mx-echange-sens, .atl-mx-echange-approbation { color: var(--atl-attenue-fort); }

.atl-mx-tel { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--atl-trait); }
.atl-mx-service { border-bottom: 1px solid var(--atl-trait); }
.atl-mx-service > summary { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; min-height: 2.75rem; padding: 0.5rem 0.25rem; cursor: pointer; list-style: none; font-weight: 600; }
.atl-mx-service > summary::-webkit-details-marker { display: none; }
.atl-mx-service > summary:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: -2px; }
.atl-mx-service > summary::after { content: ""; flex: none; width: 0.5rem; height: 0.5rem; margin-right: 0.25rem; border-right: 1.5px solid var(--atl-attenue); border-bottom: 1.5px solid var(--atl-attenue); transform: rotate(45deg); }
.atl-mx-service[open] > summary::after { transform: rotate(-135deg); }
.atl-mx-service-totaux { margin-left: auto; font-size: 0.75rem; font-weight: 400; color: var(--atl-attenue-fort); font-variant-numeric: tabular-nums; white-space: nowrap; }
.atl-mx-service-corps { display: flex; flex-direction: column; gap: 0.75rem; padding: 0 0.25rem 0.75rem; }
.atl-mx-service-corps h3 { margin: 0 0 0.25rem; font-size: 0.8125rem; font-weight: 600; color: var(--atl-attenue-fort); }
.atl-mx-partenaires { display: flex; flex-direction: column; gap: 0.25rem; margin: 0; padding: 0; list-style: none; }
.atl-mx-partenaire { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; width: 100%; min-height: 2.75rem; padding: 0.5rem 0.75rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); color: var(--atl-texte); font: inherit; text-align: left; cursor: pointer; }
.atl-mx-partenaire[data-palier="1"] { background: color-mix(in oklab, var(--atl-info) 13%, var(--atl-surface)); }
.atl-mx-partenaire[data-palier="2"] { background: color-mix(in oklab, var(--atl-info) 24%, var(--atl-surface)); }
.atl-mx-partenaire[data-palier="3"] { background: color-mix(in oklab, var(--atl-info) 36%, var(--atl-surface)); }
.atl-mx-partenaire[data-palier="4"] { background: color-mix(in oklab, var(--atl-info) 48%, var(--atl-surface)); }
.atl-mx-partenaire[aria-pressed="true"] { border: 2px solid var(--atl-texte); font-weight: 700; }
.atl-mx-partenaire:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-mx-partenaire-compte { display: inline-flex; align-items: center; gap: 0.375rem; flex: none; font-variant-numeric: tabular-nums; white-space: nowrap; }
.atl-mx-ouvrir { align-self: flex-start; min-height: 2.75rem; }
@media (max-width: 640px) { .atl-mx-option { min-height: 2.75rem; } .atl-mx-option input { width: 1.5rem; height: 1.5rem; } }
.atl-mx-rien { margin: 0; font-size: 0.8125rem; color: var(--atl-attenue); }
`;
