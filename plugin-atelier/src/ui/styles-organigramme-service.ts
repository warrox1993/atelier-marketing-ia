/**
 * Styles de la vue d'un service de l'organigramme (arbre des agents, satellites, flèches, panneau des échanges).
 * Jetons --atl-* seulement (clair et sombre de l'hôte), traits fins, aucun dégradé ni ombre portée. Le sens d'une
 * liaison est toujours doublé : sortant = teinte « info » et trait plein, entrant = teinte « attention » et pointillé,
 * et le texte l'écrit (« Vers », « Depuis »). Les cibles font 44 px au moins sur téléphone.
 */
export const STYLES_ORGANIGRAMME_SERVICE = `
.atl-orgs { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
.atl-orgs-entete { display: flex; flex-direction: column; gap: 0.375rem; }
.atl-orgs-fil { display: flex; align-items: center; gap: 0.375rem; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-orgs-retour { min-height: 2.25rem; padding: 0 0.5rem; border: 0; border-radius: 3px; background: none; color: var(--atl-texte); font: inherit; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; cursor: pointer; }
.atl-orgs-retour:hover { background: var(--atl-surface-2); }
.atl-orgs-courant { font-weight: 600; color: var(--atl-texte); }
.atl-orgs-titre-service { margin: 0; font-size: 1.125rem; font-weight: 600; }
.atl-orgs-resume { display: flex; flex-wrap: wrap; gap: 0.25rem 1.25rem; margin: 0; font-size: 0.8125rem; color: var(--atl-attenue-fort); font-variant-numeric: tabular-nums; }
.atl-orgs-resume strong { color: var(--atl-texte); font-weight: 600; }
.atl-orgs-sous-titre { margin: 0; font-size: 0.9375rem; font-weight: 600; }
.atl-orgs-vide { margin: 0; font-size: 0.8125rem; color: var(--atl-attenue-fort); }

.atl-orgs-legende { display: flex; flex-wrap: wrap; gap: 0.25rem 1.5rem; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-orgs-legende-item { display: inline-flex; align-items: center; gap: 0.5rem; }

.atl-orgs-figure-defile { overflow-x: auto; }
.atl-orgs-figure { display: grid; align-items: stretch; min-width: 36rem; }
.atl-orgs-colonne { position: relative; }
.atl-orgs-gouttiere { display: block; overflow: visible; }
.atl-orgs-fleche line { stroke-linecap: butt; }
.atl-orgs-fleche[data-sens="sortant"] line { stroke: var(--atl-info); }
.atl-orgs-fleche[data-sens="sortant"] .atl-orgs-pointe { fill: var(--atl-info); }
.atl-orgs-fleche[data-sens="entrant"] line { stroke: var(--atl-attention); stroke-dasharray: 6 4; }
.atl-orgs-fleche[data-sens="entrant"] .atl-orgs-pointe { fill: var(--atl-attention); }
.atl-orgs-fleche-nombre { font-size: 11px; font-variant-numeric: tabular-nums; fill: var(--atl-texte); paint-order: stroke; stroke: var(--atl-fond); stroke-width: 3px; }
.atl-orgs-echantillon { stroke-width: 2; }
.atl-orgs-echantillon[data-sens="sortant"] { stroke: var(--atl-info); }
.atl-orgs-echantillon[data-sens="entrant"] { stroke: var(--atl-attention); stroke-dasharray: 6 4; }

.atl-orgs-satellite { position: absolute; left: 0; right: 0; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; gap: 0.125rem; min-width: 0; padding: 0.375rem 0.625rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); color: var(--atl-texte); font: inherit; text-align: left; cursor: pointer; transition: background-color 150ms ease-out, border-color 150ms ease-out; }
.atl-orgs-satellite:hover { background: var(--atl-surface-2); border-color: var(--atl-attenue-fort); }
.atl-orgs-satellite:focus-visible, .atl-orgs-satellite-ligne:focus-visible, .atl-orgs-lien-service:focus-visible, .atl-orgs-groupe:focus-visible, .atl-orgs-groupe-ligne:focus-visible, .atl-orgs-retour:focus-visible, .atl-orgs-defilant:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-orgs-satellite-nom { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.875rem; font-weight: 600; }
.atl-orgs-satellite-detail { font-size: 0.75rem; color: var(--atl-attenue-fort); }

.atl-orgs-bloc { min-width: 0; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface-2); overflow: hidden; }
.atl-orgs-defilant { height: 100%; max-height: 80vh; overflow: auto; }
.atl-orgs-plan { position: relative; }
.atl-orgs-traits { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.atl-orgs-traits path { fill: none; stroke: var(--atl-attenue); stroke-width: 1; stroke-linecap: square; }
.atl-orgs-carte { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; gap: 0.0625rem; min-width: 0; padding: 0.3125rem 0.625rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); color: var(--atl-texte); font-size: 0.8125rem; line-height: 1.3; overflow: hidden; }
.atl-orgs-carte[data-mis-en-evidence] { border: 2px solid var(--atl-texte); padding: calc(0.3125rem - 1px) calc(0.625rem - 1px); background: var(--atl-surface-2); }
.atl-orgs-carte[data-mis-en-evidence] .atl-orgs-lien { background: color-mix(in oklab, var(--atl-attention) 25%, transparent); }
.atl-orgs-lien { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--atl-texte); font-weight: 600; font-size: 0.875rem; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
.atl-orgs-lien:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; border-radius: 2px; }
.atl-orgs-titre { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; color: var(--atl-attenue-fort); }
.atl-orgs-statut { font-size: 0.75rem; color: var(--atl-attenue-fort); white-space: nowrap; }
.atl-orgs-statut[data-famille="erreur"] { color: var(--atl-danger); font-weight: 600; }
.atl-orgs-statut[data-famille="pause"] { color: var(--atl-attention); }
.atl-orgs-groupe { align-items: center; justify-content: center; border-style: dashed; border-color: var(--atl-attenue-fort); font: inherit; font-weight: 600; cursor: pointer; }
.atl-orgs-groupe:hover { background: var(--atl-surface-2); }

.atl-orgs-panneau { display: flex; flex-direction: column; gap: 0.625rem; padding-top: 1rem; border-top: 1px solid var(--atl-trait); }
.atl-orgs-echanges { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 0.75rem 1.25rem; }
.atl-orgs-partenaire { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
.atl-orgs-partenaire-titre { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.625rem; margin: 0; font-size: 0.9375rem; }
.atl-orgs-lien-service { padding: 0; border: 0; background: none; color: var(--atl-texte); font: inherit; font-weight: 600; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; cursor: pointer; }
.atl-orgs-compteur { font-size: 0.8125rem; font-variant-numeric: tabular-nums; color: var(--atl-attenue-fort); font-weight: 400; }
.atl-orgs-etiquette { font-size: 0.75rem; color: var(--atl-texte); font-weight: 500; padding: 0 0.375rem; border: 1px solid var(--atl-attenue-fort); border-radius: 3px; }
.atl-orgs-objets { display: flex; flex-direction: column; gap: 0.1875rem; margin: 0; padding: 0; list-style: none; font-size: 0.8125rem; }
.atl-orgs-sens { font-weight: 600; }
.atl-orgs-sens[data-sens="sortant"] { text-decoration: underline; text-decoration-color: var(--atl-info); text-decoration-thickness: 2px; text-underline-offset: 3px; }
.atl-orgs-sens[data-sens="entrant"] { text-decoration: underline dashed; text-decoration-color: var(--atl-attention); text-decoration-thickness: 2px; text-underline-offset: 3px; }

.atl-orgs-liste-bloc { display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; }
.atl-orgs-liste { align-self: stretch; margin: 0; padding: 0; list-style: none; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); }
.atl-orgs-ligne { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 2.75rem; padding: 0.375rem 0.75rem; font-size: 0.875rem; }
.atl-orgs-ligne + .atl-orgs-ligne { border-top: 1px solid var(--atl-trait); }
.atl-orgs-ligne[data-mis-en-evidence] { background: var(--atl-surface-2); outline: 2px solid var(--atl-texte); outline-offset: -2px; }
.atl-orgs-groupe-ligne { min-height: 2.75rem; padding: 0 0.5rem; border: 1px dashed var(--atl-attenue-fort); border-radius: 3px; background: none; color: var(--atl-texte); font: inherit; font-weight: 600; cursor: pointer; }
.atl-orgs-partenaires-liste { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); }
.atl-orgs-partenaires-liste li + li { border-top: 1px solid var(--atl-trait); }
.atl-orgs-satellite-ligne { display: flex; flex-direction: column; align-items: flex-start; gap: 0.125rem; width: 100%; min-height: 2.75rem; padding: 0.5rem 0.75rem; border: 0; background: none; color: var(--atl-texte); font: inherit; text-align: left; cursor: pointer; }
.atl-orgs-satellite-ligne .atl-orgs-satellite-nom { font-size: 0.9375rem; }

@media (prefers-reduced-motion: reduce) { .atl-orgs-satellite { transition: none; } }
`;
