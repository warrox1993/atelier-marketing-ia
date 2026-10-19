/**
 * Styles du tiroir « Agents en service » du chat du Coordinateur. Mobile d'abord : plein écran jusqu'à 640 px,
 * cibles d'au moins 44 px, aucune action au survol seulement. Jetons `--atl-*` de `styles.ts` : clair et sombre
 * suivent l'hôte.
 */
import { STYLES_CASE_TACTILE } from "./styles-case-tactile.js";

export const STYLES_AGENTS_EN_SERVICE = `
${STYLES_CASE_TACTILE}
.atl-aes-ouvrir { display: inline-flex; align-items: center; justify-content: center; gap: 0.375rem; min-height: 2.75rem; min-width: 2.75rem; padding: 0 0.75rem; border: 0; border-radius: calc(var(--atl-rayon) * 0.8); background: transparent; color: var(--atl-attenue-fort); font: inherit; font-size: 0.875rem; cursor: pointer; transition: background-color 150ms ease-out, color 150ms ease-out; }
.atl-aes-ouvrir:hover, .atl-aes-ouvrir[aria-expanded="true"] { background: var(--atl-surface-2); color: var(--atl-texte); }
.atl-aes-ouvrir:focus-visible, .atl-aes button:focus-visible, .atl-aes input:focus-visible, .atl-aes summary:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-aes-fond { position: fixed; inset: 0; z-index: 60; background: color-mix(in oklab, var(--atl-texte) 38%, transparent); }
.atl-aes { position: fixed; top: 0; right: 0; bottom: 0; z-index: 61; display: flex; flex-direction: column; width: min(32rem, 100vw); height: 100dvh; box-sizing: border-box; background: var(--atl-fond); color: var(--atl-texte); border-left: 1px solid var(--atl-trait); box-shadow: -8px 0 28px color-mix(in oklab, var(--atl-texte) 16%, transparent); animation: atl-aes-entree 180ms cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes atl-aes-entree { from { transform: translateX(1.5rem); opacity: 0; } to { transform: none; opacity: 1; } }
.atl-aes-entete { flex: none; display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.5rem 0.5rem 1rem; border-bottom: 1px solid var(--atl-trait); }
.atl-aes-entete h2 { flex: 1; margin: 0; font-size: 1.0625rem; font-weight: 600; }
.atl-aes-fermer { min-height: 2.75rem; min-width: 2.75rem; padding: 0 0.875rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); color: var(--atl-texte); font: inherit; cursor: pointer; }
.atl-aes-fermer:hover { background: var(--atl-surface-2); }
.atl-aes-outils { flex: none; display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--atl-trait); }
.atl-aes-outils input[type="search"] { box-sizing: border-box; width: 100%; height: 2.75rem; min-height: 2.75rem; padding: 0 0.75rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); color: var(--atl-texte); font: inherit; }
.atl-aes-filtre { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; padding: 0; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); overflow: hidden; }
.atl-aes-filtre legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.atl-aes-filtre label { position: relative; display: block; min-width: 0; }
.atl-aes-filtre label + label { border-left: 1px solid var(--atl-trait); }
.atl-aes-filtre input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.atl-aes-filtre span { display: flex; align-items: center; justify-content: center; box-sizing: border-box; min-height: 2.75rem; padding: 0 0.5rem; font-size: 0.875rem; text-align: center; white-space: nowrap; cursor: pointer; transition: background-color 150ms ease-out; }
.atl-aes-filtre input:checked + span { background: var(--atl-accent); color: var(--atl-accent-texte); }
.atl-aes-filtre input:focus-visible + span { outline: 2px solid var(--atl-anneau); outline-offset: -3px; }
.atl-aes-tout { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
.atl-aes-case { display: flex; align-items: center; gap: 0.125rem; min-height: 2.75rem; cursor: pointer; font-size: 0.9375rem; }
.atl-aes-compteur { font-size: 0.875rem; color: var(--atl-attenue-fort); font-variant-numeric: tabular-nums; }
.atl-aes-actions { display: flex; gap: 0.5rem; }
.atl-aes-actions .atl-bouton { flex: 1; min-height: 2.75rem; }
.atl-aes-actions .atl-bouton[disabled] { opacity: 0.5; cursor: not-allowed; }
.atl-aes-confirmation { padding: 0.75rem; border: 1px solid color-mix(in oklab, var(--atl-attention) 50%, var(--atl-trait)); border-radius: var(--atl-rayon); background: var(--atl-surface-2); }
.atl-aes-confirmation p { margin: 0 0 0.625rem; font-size: 0.9375rem; line-height: 1.4; }
.atl-aes-bilan { padding: 0.75rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface-2); font-size: 0.9375rem; }
.atl-aes-bilan p { margin: 0; font-weight: 500; }
.atl-aes-bilan ul { margin: 0.5rem 0 0; padding-left: 1.125rem; font-size: 0.875rem; color: var(--atl-attenue-fort); max-height: 8rem; overflow-y: auto; }
.atl-aes-liste { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0.5rem 1rem 1.5rem; overscroll-behavior: contain; }
.atl-aes-groupe { border-bottom: 1px solid var(--atl-trait); }
.atl-aes-groupe > summary { display: flex; align-items: center; gap: 0.5rem; min-height: 2.75rem; padding-left: 0.125rem; cursor: pointer; font-weight: 600; list-style: none; }
.atl-aes-groupe > summary::-webkit-details-marker { display: none; }
.atl-aes-groupe > summary::before { content: ""; flex: none; width: 0.5rem; height: 0.5rem; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); transition: transform 150ms ease-out; }
.atl-aes-groupe[open] > summary::before { transform: rotate(45deg); }
.atl-aes-groupe-nom { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.atl-aes-groupe-nb { font-weight: 400; font-size: 0.8125rem; color: var(--atl-attenue-fort); font-variant-numeric: tabular-nums; }
.atl-aes-groupe-case { padding-left: 0.25rem; font-weight: 400; font-size: 0.875rem; color: var(--atl-attenue-fort); }
.atl-aes-ligne { display: flex; align-items: center; gap: 0.125rem; min-height: 2.75rem; padding-left: 0.25rem; cursor: pointer; }
.atl-aes-ligne-texte { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.atl-aes-ligne-nom { overflow-wrap: anywhere; font-size: 0.9375rem; }
.atl-aes-ligne-role { font-size: 0.8125rem; color: var(--atl-attenue-fort); overflow-wrap: anywhere; }
.atl-aes-statut { flex: none; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-aes-statut[data-ton="pause"] { color: var(--atl-attention); }
.atl-aes-statut[data-ton="erreur"] { color: var(--atl-danger); }
.atl-aes-statut[data-ton="actif"] { color: var(--atl-succes); }
.atl-aes-etat { padding: 0.5rem 0 0.5rem 1.25rem; font-size: 0.875rem; color: var(--atl-attenue-fort); }
.atl-aes-texte-court { display: none; }
@media (min-width: 641px) { .atl-aes-texte-court { display: inline; } }
@media (max-width: 640px) { .atl-aes { width: 100vw; border-left: 0; } }
@media (prefers-reduced-motion: reduce) { .atl-aes { animation: none; } .atl-aes-groupe > summary::before { transition: none; } }
`;
