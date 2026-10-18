/**
 * Styles de la vue « Organigramme » : barre de filtre, panneau des flux et toile dessinée (cartes positionnées sur un plan
 * zoomable, traits fins neutres en SVG). Mêmes jetons --atl-* que les départements, donc clair et sombre de l'hôte :
 * trait fin, aucune ombre ni dégradé ; l'état (statut, relié, choisi, trouvé) est toujours écrit ou souligné, jamais
 * seulement une couleur.
 */
export const STYLES_ORGANIGRAMME = `
.atl-org { display: flex; flex-direction: column; gap: 1rem; }
.atl-org-barre { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem 1rem; }
.atl-org-filtre { display: flex; flex-direction: column; gap: 0.25rem; flex: 1 1 16rem; min-width: 0; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-org-filtre input { min-height: 2.25rem; padding: 0 0.75rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); color: var(--atl-texte); font: inherit; }
.atl-org-filtre input:focus-visible, .atl-org-flux-service:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-org-etat { flex-basis: 100%; margin: 0; min-height: 1.2em; font-size: 0.8125rem; color: var(--atl-attenue-fort); }

.atl-org-legende { margin: 0; font-size: 0.8125rem; color: var(--atl-attenue-fort); max-width: 70ch; }
.atl-org-vide { margin: 0; font-size: 0.8125rem; color: var(--atl-attenue); }

.atl-org-toile { position: relative; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface-2); overflow: hidden; }
.atl-org-vue { position: relative; height: calc(100vh - 9rem); min-height: 22rem; overflow: hidden; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
.atl-org-vue[data-deplace] { cursor: grabbing; }
.atl-org-vue:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: -2px; }
.atl-org-plan { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.atl-org-traits { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.atl-org-traits path { fill: none; stroke: var(--atl-attenue); stroke-width: 1; stroke-linecap: square; vector-effect: non-scaling-stroke; opacity: 0.7; }
.atl-org-zoom { position: absolute; top: 0.5rem; right: 0.5rem; display: flex; gap: 0.375rem; }
.atl-org-zoom .atl-bouton { min-width: 2.25rem; padding: 0 0.625rem; }

.atl-org-cadre { position: absolute; box-sizing: border-box; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: color-mix(in oklab, var(--atl-surface) 35%, transparent); pointer-events: none; }
.atl-org-carte { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; gap: 0.125rem; min-width: 0; padding: 0.375rem 0.625rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); color: var(--atl-texte); font-size: 0.8125rem; line-height: 1.3; overflow: hidden; }
.atl-org-carte-general { padding: 0.5rem 0.75rem; border-color: var(--atl-texte); }
.atl-org-carte-service { justify-content: space-between; padding: 0.5rem 0.625rem; gap: 0.25rem; }
.atl-org-carte[data-relie] { border-color: var(--atl-texte); background: var(--atl-surface-2); }
.atl-org-carte[data-selection] { border: 2px solid var(--atl-texte); padding: calc(0.5rem - 1px) calc(0.625rem - 1px); background: var(--atl-surface-2); }
.atl-org-carte[data-trouve] { border-color: var(--atl-attention); outline: 1px solid var(--atl-attention); outline-offset: -2px; }
.atl-org-carte[data-trouve] .atl-org-agent-lien, .atl-org-carte[data-trouve] .atl-org-nom { background: color-mix(in oklab, var(--atl-attention) 25%, transparent); }
.atl-org-carte[data-estompe] { opacity: 0.4; }
.atl-org-etiquette { font-size: 0.75rem; color: var(--atl-attenue-fort); }
.atl-org-nom { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9375rem; font-weight: 600; }
.atl-org-ligne { display: flex; align-items: baseline; gap: 0.5rem; min-width: 0; }
.atl-org-agent-lien { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--atl-texte); font-weight: 500; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
.atl-org-agent-lien:focus-visible, .atl-org-flux-service:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; border-radius: 2px; }
.atl-org-statut { flex: none; margin-left: auto; font-size: 0.75rem; color: var(--atl-attenue-fort); white-space: nowrap; }
.atl-org-statut[data-famille="erreur"] { color: var(--atl-danger); font-weight: 600; }
.atl-org-statut[data-famille="pause"] { color: var(--atl-attention); }
.atl-org-titre { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; color: var(--atl-attenue); }
.atl-org-compteur { font-size: 0.8125rem; font-variant-numeric: tabular-nums; color: var(--atl-attenue-fort); white-space: nowrap; }
.atl-org-flux-bloc .atl-org-compteur { margin-left: 0.25rem; }
.atl-org-liens { align-self: flex-start; min-height: 1.75rem; padding: 0.25rem 0.625rem; font-size: 0.8125rem; }
.atl-org-erreur { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-size: 0.8125rem; color: var(--atl-danger); }
.atl-org-erreur .atl-bouton { min-height: 1.75rem; padding: 0.25rem 0.625rem; font-size: 0.8125rem; }

.atl-org-panneau { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; border: 1px solid var(--atl-texte); border-radius: var(--atl-rayon); background: var(--atl-surface); }
.atl-org-panneau-tete { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
.atl-org-panneau-tete h2 { margin: 0; font-size: 1.0625rem; font-weight: 600; }
.atl-org-panneau-texte { margin: 0; font-size: 0.875rem; color: var(--atl-attenue-fort); }
.atl-org-flux-grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: 1rem; }
.atl-org-flux-bloc h3 { margin: 0 0 0.5rem; font-size: 0.9375rem; font-weight: 600; }
.atl-org-flux { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--atl-trait); }
.atl-org-flux li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.125rem 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid var(--atl-trait); font-size: 0.8125rem; min-width: 0; }
.atl-org-flux-sens { color: var(--atl-attenue-fort); }
.atl-org-flux-service { padding: 0.125rem 0; border: 0; background: none; color: var(--atl-texte); font: inherit; font-weight: 600; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; cursor: pointer; }
.atl-org-flux-objet { flex: 1 1 12rem; min-width: 0; overflow-wrap: anywhere; }
.atl-org-approbation { padding: 0 0.5rem; border: 1px solid var(--atl-attention); border-radius: 999px; font-size: 0.75rem; color: var(--atl-texte); white-space: nowrap; }


/* Liste accordéon (téléphone) */
.atl-orgl { display: flex; flex-direction: column; gap: 0.5rem; }
.atl-orgl-general, .atl-orgl-service { border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface); }
.atl-orgl-general { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.75rem; border-color: var(--atl-texte); }
.atl-orgl-titre { font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-orgl-service > summary { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; min-height: 2.75rem; padding: 0 0.75rem; cursor: pointer; list-style: none; }
.atl-orgl-service > summary::-webkit-details-marker { display: none; }
.atl-orgl-service > summary:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; border-radius: var(--atl-rayon); }
.atl-orgl-service[open] > summary { border-bottom: 1px solid var(--atl-trait); }
.atl-orgl-nom { min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
.atl-orgl-corps { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.25rem 0.75rem 0.75rem; }
.atl-orgl-agents { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.atl-orgl-agents li { display: flex; flex-direction: column; justify-content: center; min-height: 2.75rem; border-top: 1px solid var(--atl-trait); }
.atl-orgl-agent { display: flex; align-items: baseline; gap: 0.5rem; min-width: 0; min-height: 2.75rem; align-items: center; }
.atl-orgl-agents li .atl-orgl-agent { min-height: 2rem; }
.atl-orgl-lien { display: inline-flex; align-items: center; min-height: 2.75rem; min-width: 0; color: var(--atl-texte); font-weight: 500; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; overflow-wrap: anywhere; }
.atl-orgl-agent[data-trouve], .atl-orgl-service[data-trouve] > summary { background: color-mix(in oklab, var(--atl-attention) 25%, transparent); }
.atl-orgl-liens { align-self: flex-start; min-height: 2.75rem; margin-top: 0.5rem; }

@media (max-width: 640px) {
  .atl-org-vue { height: 70vh; }
  .atl-org-zoom .atl-bouton { min-height: 2.75rem; min-width: 2.75rem; }
  .atl-org-flux-service { min-height: 2.75rem; }
}
`;
