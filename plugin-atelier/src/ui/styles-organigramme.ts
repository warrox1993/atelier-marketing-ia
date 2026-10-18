/**
 * Styles de la vue « Organigramme » (page, recherche, onglets) et de la carte des services (nœuds HTML sur un plan SVG,
 * panneau des liaisons, liste téléphone). Mêmes jetons --atl-* que le reste de l'atelier, donc clair et sombre de
 * l'hôte : trait fin, aucune ombre ni dégradé ; l'état (choisi, relié, à traiter, sens des flèches) est toujours écrit
 * ou porté par un motif (plein, pointillé), jamais par la seule couleur.
 */
export const STYLES_ORGANIGRAMME = `
.atl-org { display: flex; flex-direction: column; gap: 1rem; }
.atl-org-barre { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem 1rem; }
.atl-org-recherche { position: relative; display: flex; flex-direction: column; gap: 0.25rem; flex: 1 1 18rem; max-width: 34rem; min-width: 0; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-org-recherche input { min-height: 2.5rem; padding: 0 0.75rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); color: var(--atl-texte); font: inherit; font-size: 0.875rem; }
.atl-org-recherche input:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-org-resultats { position: absolute; top: 100%; left: 0; right: 0; z-index: 5; margin: 0.25rem 0 0; padding: 0.25rem; list-style: none; border: 1px solid var(--atl-texte); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); max-height: 22rem; overflow-y: auto; }
.atl-org-resultat { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.125rem 0.625rem; min-height: 2.75rem; padding: 0.375rem 0.625rem; border-radius: calc(var(--atl-rayon) * 0.6); color: var(--atl-texte); font-size: 0.875rem; cursor: pointer; }
.atl-org-resultat[aria-selected="true"], .atl-org-resultat:hover { background: var(--atl-surface-2); outline: 1px solid var(--atl-texte); outline-offset: -1px; }
.atl-org-resultat-nom { font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.atl-org-resultat-suite { color: var(--atl-attenue-fort); font-size: 0.8125rem; }
.atl-org-resultat-vide { padding: 0.5rem 0.625rem; color: var(--atl-attenue-fort); font-size: 0.8125rem; }
.atl-org-etat { margin: 0; min-height: 1.2em; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-org-erreur { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-size: 0.8125rem; color: var(--atl-danger); }
.atl-org-erreur .atl-bouton { min-height: 2.25rem; padding: 0.25rem 0.75rem; font-size: 0.8125rem; }
.atl-org-vue-onglet[hidden] { display: none; }

/* Carte des services */
.atl-car { display: flex; flex-direction: column; gap: 0.75rem; }
.atl-car-corps { display: grid; grid-template-columns: minmax(0, 1fr) 22rem; gap: 1rem; align-items: start; }
.atl-car-zone { position: relative; height: calc(100vh - 17rem); min-height: 34rem; overflow: auto; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface-2); }
.atl-car-scene { position: relative; min-width: 100%; min-height: 100%; }
.atl-car-traits { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.atl-car-hierarchie { stroke: var(--atl-attenue); stroke-width: 1; opacity: 0.4; }
.atl-car-apercu { fill: none; stroke: var(--atl-attenue-fort); stroke-width: 1.25; opacity: 0.7; }
.atl-car-courbe { fill: none; stroke-linecap: round; }
.atl-car-courbe[data-sens="sortant"] { stroke: var(--atl-info); }
.atl-car-courbe[data-sens="entrant"] { stroke: var(--atl-attention); stroke-dasharray: 7 5; }
.atl-car-tete[data-sens="sortant"] { fill: var(--atl-info); }
.atl-car-tete[data-sens="entrant"] { fill: var(--atl-attention); }

.atl-car-general { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.125rem; padding: 0.375rem 0.625rem; border: 2px solid var(--atl-texte); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); text-align: center; font-size: 0.8125rem; }
.atl-car-general strong { font-size: 0.9375rem; font-weight: 600; }
.atl-car-general span { color: var(--atl-attenue-fort); }
.atl-car-noeud { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: stretch; gap: 0.25rem; min-width: 0; padding: 0.375rem 0.625rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); color: var(--atl-texte); font: inherit; text-align: left; cursor: pointer; transition: opacity 150ms ease-out, border-color 150ms ease-out; }
.atl-car-noeud:hover { border-color: var(--atl-texte); }
.atl-car-noeud:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-car-noeud[data-relie] { border-color: var(--atl-texte); background: var(--atl-surface); }
.atl-car-noeud[data-selection] { border: 2px solid var(--atl-texte); padding: calc(0.375rem - 1px) calc(0.625rem - 1px); }
.atl-car-noeud[data-estompe] { opacity: 0.62; }
.atl-car-nom { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.875rem; font-weight: 600; line-height: 1.25; }
.atl-car-meta { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-width: 0; font-size: 0.75rem; color: var(--atl-attenue-fort); white-space: nowrap; }
.atl-car-agents { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.atl-car-traiter { flex: none; padding: 0 0.375rem; border: 1px solid var(--atl-attention); border-radius: 999px; color: var(--atl-texte); font-size: 0.6875rem; font-weight: 600; }

.atl-car-panneau { display: flex; flex-direction: column; gap: 0.75rem; max-height: calc(100vh - 17rem); min-height: 12rem; overflow-y: auto; padding: 1rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface); }
.atl-car-panneau-tete { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
.atl-car-panneau-tete h2 { font-size: 1.0625rem; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.atl-car-panneau-resume, .atl-car-aide, .atl-car-vide, .atl-car-mention { font-size: 0.8125rem; color: var(--atl-attenue-fort); max-width: 62ch; }
.atl-car-ouvrir { align-self: flex-start; }
.atl-car-partenaires { display: flex; flex-direction: column; border-top: 1px solid var(--atl-trait); }
.atl-car-partenaire { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.625rem 0; border-bottom: 1px solid var(--atl-trait); font-size: 0.8125rem; }
.atl-car-nom-partenaire { align-self: flex-start; min-height: 1.75rem; padding: 0.125rem 0; border: 0; background: none; color: var(--atl-texte); font: inherit; font-size: 0.875rem; font-weight: 600; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; cursor: pointer; text-align: left; }
.atl-car-sens { display: flex; align-items: baseline; gap: 0.5rem; margin: 0; }
.atl-car-sens-texte { min-width: 0; overflow-wrap: anywhere; }
.atl-car-echantillon { flex: none; align-self: center; width: 1.5rem; border-top: 2px solid var(--atl-info); }
.atl-car-sens[data-sens="entrant"] .atl-car-echantillon { border-top: 2px dashed var(--atl-attention); }
.atl-car-approbation { display: inline-block; margin-left: 0.5rem; padding: 0 0.5rem; border: 1px solid var(--atl-attention); border-radius: 999px; font-size: 0.75rem; white-space: nowrap; }

.atl-car-legende { display: flex; flex-direction: column; gap: 0.375rem; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-car-legende ul { display: flex; flex-wrap: wrap; gap: 0.25rem 1.5rem; }
.atl-car-legende li { display: flex; align-items: center; gap: 0.5rem; }
.atl-car-trait { flex: none; width: 1.75rem; border-top: 2px solid var(--atl-info); }
.atl-car-trait[data-sens="entrant"] { border-top: 2px dashed var(--atl-attention); }
.atl-car-trait[data-sens="hierarchie"] { border-top: 1px solid var(--atl-attenue); }
.atl-car-legende p { max-width: 70ch; }

/* Liste (téléphone) */
.atl-car-liste { display: flex; flex-direction: column; gap: 0.5rem; }
.atl-car-ligne { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface); }
.atl-car-ligne[data-selection] { border-color: var(--atl-texte); }
.atl-car-ligne-tete { display: flex; flex-direction: column; gap: 0.125rem; }
.atl-car-ligne .atl-car-nom { white-space: normal; font-size: 0.9375rem; }
.atl-car-ligne-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.atl-car-ligne .atl-bouton { min-height: 2.75rem; }

@media (max-width: 900px) {
  .atl-car-corps { grid-template-columns: minmax(0, 1fr); }
  .atl-car-panneau { max-height: none; }
}
@media (max-width: 640px) {
  .atl-car-nom-partenaire { min-height: 2.75rem; }
  .atl-org-recherche input { min-height: 2.75rem; }
}
`;
