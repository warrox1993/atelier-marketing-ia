/**
 * Styles de la vue « Organigramme » (en-tête compact, recherche, commutateur Carte / Matrice) et de la carte des services
 * (toile qui se zoome et se déplace, légende et commandes en surimpression, tiroir des liaisons, liste téléphone). Mêmes
 * jetons --atl-* que le reste de l'atelier, donc clair et sombre de l'hôte : trait fin, aucun dégradé ; seul le tiroir a
 * une ombre (décalée et floue). L'état (choisi, relié, à traiter, sens des flèches) est toujours écrit ou porté par un
 * motif (plein, pointillé), jamais par la seule couleur.
 */
export const STYLES_ORGANIGRAMME = `
.atl-org { display: flex; flex-direction: column; gap: 0.75rem; }
.atl-org-tete { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1.5rem; }
.atl-org-titrage { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.125rem 0.875rem; min-width: 0; }
.atl-org-titrage h1 { font-size: 1.25rem; line-height: 1.3; font-weight: 600; letter-spacing: -0.01em; }
.atl-org-compte { color: var(--atl-attenue-fort); font-size: 0.875rem; white-space: nowrap; }
.atl-org-outils { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem 0.75rem; min-width: 0; }
.atl-org-recherche { position: relative; display: flex; flex: 0 1 20rem; width: 20rem; max-width: 100%; min-width: 0; }
.atl-org-recherche input { width: 100%; min-height: 2.5rem; padding: 0 0.75rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); color: var(--atl-texte); font: inherit; font-size: 0.875rem; }
.atl-org-recherche input:focus-visible { outline: 2px solid var(--atl-texte); outline-offset: 2px; }
/* Commutateur segmenté Carte / Matrice (mêmes onglets accessibles que le reste de l'atelier) */
.atl-org-outils .atl-onglets-rub { margin: 0; padding: 2px; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface-2); }
.atl-org-outils .atl-onglets-rub [role="tablist"] { gap: 2px; overflow: visible; }
.atl-org-outils .atl-onglets-rub [role="tab"] { min-height: 2.125rem; margin: 0; padding: 0 0.875rem; border: 1px solid transparent; border-radius: calc(var(--atl-rayon) * 0.6); }
.atl-org-outils .atl-onglets-rub [role="tab"][aria-selected="true"] { border-color: var(--atl-trait); background: var(--atl-surface); font-weight: 600; }
.atl-org-outils .atl-onglets-rub [role="tab"]:focus-visible { outline-offset: 1px; border-radius: calc(var(--atl-rayon) * 0.6); }
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

/* La carte prend la hauteur qui reste dans la fenêtre : pas de marge basse de page, un seul défilement (aucun). */
.atl-page:has(.atl-car-zone) { padding-top: 0.75rem; padding-bottom: 0; }

/* Carte des services : une toile (plan transformé en CSS) et des surimpressions */
.atl-car { display: block; --atl-car-bord: color-mix(in oklab, var(--atl-texte) 48%, var(--atl-surface-2)); }
/* Focus clavier de la carte : la couleur du texte (3:1 au moins sur le fond, en clair comme en sombre). */
.atl .atl-car :focus-visible { outline: 2px solid var(--atl-texte); }
.atl-car-zone { position: relative; overflow: hidden; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface-2); }
.atl-car-vue { position: absolute; inset: 0; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab; }
.atl-car-vue[data-deplace] { cursor: grabbing; }
.atl-car-vue:focus-visible { outline-offset: -2px; border-radius: var(--atl-rayon); }
.atl-car-plan { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.atl-car-traits { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.atl-car-anneau { fill: none; stroke: var(--atl-attenue); stroke-width: 1; opacity: 0.4; }
.atl-car-hierarchie { fill: none; stroke: var(--atl-attenue-fort); stroke-width: 1.25; opacity: 0.85; }
.atl-car-apercu { fill: none; stroke: var(--atl-attenue-fort); stroke-width: 1.25; opacity: 0.7; }
.atl-car-courbe { fill: none; stroke-linecap: round; }
.atl-car-courbe[data-sens="sortant"] { stroke: var(--atl-info); }
.atl-car-courbe[data-sens="entrant"] { stroke: var(--atl-attention); stroke-dasharray: 7 5; }
.atl-car-tete[data-sens="sortant"] { fill: var(--atl-info); }
.atl-car-tete[data-sens="entrant"] { fill: var(--atl-attention); }

.atl-car-general { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.125rem; padding: 0.375rem 0.625rem; border: 2px solid var(--atl-texte); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); color: var(--atl-texte); font: inherit; text-align: center; font-size: 0.8125rem; cursor: pointer; }
.atl-car-general[aria-pressed="true"] { box-shadow: 0 0 0 3px var(--atl-surface-2), 0 0 0 4px var(--atl-texte); }
.atl-car-general:focus-visible { outline-offset: 4px; }
.atl-car-general strong { font-size: 0.9375rem; font-weight: 600; }
.atl-car-general span { color: var(--atl-attenue-fort); }
.atl-car-noeud { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: stretch; gap: 0.125rem; min-width: 0; padding: 0.3125rem 0.4375rem; overflow: hidden; border: 1px solid var(--atl-car-bord); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); color: var(--atl-texte); font: inherit; text-align: left; cursor: pointer; transition: background-color 150ms ease-out, border-color 150ms ease-out; }
.atl-car-noeud:hover { border-color: var(--atl-texte); }
.atl-car-noeud:focus-visible { outline-offset: 2px; }
.atl-car-noeud[data-relie] { border-color: var(--atl-texte); }
.atl-car-noeud[data-selection] { border: 2px solid var(--atl-texte); padding: calc(0.3125rem - 1px) calc(0.4375rem - 1px); }
/* Nœud non lié à la sélection : texte et trait à 35 %, fond plein (l'ellipse ne transparaît pas derrière le nom). */
.atl-car-noeud[data-estompe] { background: color-mix(in oklab, var(--atl-surface) 35%, var(--atl-surface-2)); border-color: color-mix(in oklab, var(--atl-car-bord) 35%, var(--atl-surface-2)); }
.atl-car-noeud[data-estompe] > * { opacity: 0.35; transition: opacity 150ms ease-out; }
.atl-car-noeud[data-estompe]:hover > *, .atl-car-noeud[data-estompe]:focus-visible > * { opacity: 1; }
.atl-car-noeud[data-estompe]:hover { background: var(--atl-surface); }
.atl-car-nom { min-width: 0; font-size: 0.8125rem; font-weight: 600; line-height: 1.15; overflow-wrap: break-word; }
.atl-car-zone[data-compact] .atl-car-nom { font-size: 0.75rem; }
.atl-car-meta { display: flex; align-items: center; justify-content: space-between; gap: 0.375rem; min-width: 0; font-size: 0.6875rem; line-height: 1.2; color: var(--atl-attenue-fort); white-space: nowrap; }
.atl-car-agents { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.atl-car-traiter { flex: none; padding: 0 0.375rem; border: 1px solid var(--atl-attention); border-radius: 999px; color: var(--atl-texte); font-size: 0.6875rem; font-weight: 600; }

/* Surimpressions : légende en haut à gauche, phrase d'aide en bas à gauche, commandes en haut à droite */
.atl-car-legende { position: absolute; left: 0.75rem; top: 0.75rem; display: flex; flex-direction: column; gap: 0.25rem; padding: 0.5rem 0.75rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); font-size: 0.8125rem; line-height: 1.3; color: var(--atl-attenue-fort); pointer-events: none; }
.atl-car-legende p { display: flex; align-items: center; gap: 0.5rem; }
.atl-car-trait { flex: none; width: 1.75rem; border-top: 2px solid var(--atl-info); }
.atl-car-trait[data-sens="entrant"] { border-top: 2px dashed var(--atl-attention); }
.atl-car-note { position: absolute; left: 0.75rem; bottom: 0.75rem; max-width: 15rem; padding: 0.25rem 0.5rem; border-radius: calc(var(--atl-rayon) * 0.6); background: var(--atl-surface-2); font-size: 0.8125rem; line-height: 1.35; color: var(--atl-attenue-fort); pointer-events: none; }
.atl-car-note[data-masque] { visibility: hidden; }
.atl-car-mention-centre { position: absolute; text-align: center; font-size: 0.8125rem; line-height: 1.35; color: var(--atl-attenue-fort); pointer-events: none; }
.atl-car-commandes { position: absolute; right: 0.75rem; top: 0.75rem; display: flex; align-items: center; gap: 0.125rem; padding: 0.1875rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface); }
.atl-car-zone[data-tiroir] .atl-car-commandes { right: calc(min(22rem, 40%) + 1.5rem); }
.atl-car-echelle { min-width: 3.25rem; padding: 0 0.5rem; text-align: center; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-car-commande { display: inline-grid; place-items: center; width: 2.75rem; height: 2.75rem; border: 1px solid transparent; border-radius: calc(var(--atl-rayon) * 0.6); background: none; color: var(--atl-texte); font: inherit; font-size: 1.375rem; line-height: 1; cursor: pointer; transition: background-color 150ms ease-out, border-color 150ms ease-out; }
.atl-car-commande:hover { background: var(--atl-surface-2); border-color: var(--atl-trait); }

/* Tiroir des liaisons : posé par-dessus la carte, à droite, seulement quand un service est choisi */
.atl-car-panneau { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; overflow-y: auto; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface); }
.atl-car-tiroir { position: absolute; right: 0.75rem; top: 0.75rem; width: min(22rem, 40%); max-height: calc(100% - 1.5rem); box-shadow: 0 12px 28px -10px color-mix(in oklab, var(--atl-texte) 34%, transparent), 0 2px 6px -2px color-mix(in oklab, var(--atl-texte) 20%, transparent); }
@media (prefers-reduced-motion: no-preference) {
  .atl-car-tiroir { animation: atl-car-tiroir-entree 220ms cubic-bezier(0.16, 1, 0.3, 1); }
}
@keyframes atl-car-tiroir-entree { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
.atl-car-panneau-tete { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
.atl-car-panneau-tete h2 { font-size: 1.0625rem; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.atl-car-panneau-resume, .atl-car-vide, .atl-car-mention { font-size: 0.8125rem; color: var(--atl-attenue-fort); max-width: 62ch; }
.atl-car-ouvrir { align-self: flex-start; }
.atl-car-partenaires { display: flex; flex-direction: column; border-top: 1px solid var(--atl-trait); }
.atl-car-partenaire { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.625rem 0; border-bottom: 1px solid var(--atl-trait); font-size: 0.8125rem; }
.atl-car-nom-partenaire { align-self: flex-start; min-height: 1.75rem; padding: 0.125rem 0; border: 0; background: none; color: var(--atl-texte); font: inherit; font-size: 0.875rem; font-weight: 600; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; cursor: pointer; text-align: left; }
.atl-car-sens { display: flex; align-items: baseline; gap: 0.5rem; margin: 0; }
.atl-car-sens-texte { min-width: 0; overflow-wrap: anywhere; }
.atl-car-echantillon { flex: none; align-self: center; width: 1.5rem; border-top: 2px solid var(--atl-info); }
.atl-car-sens[data-sens="entrant"] .atl-car-echantillon { border-top: 2px dashed var(--atl-attention); }
.atl-car-approbation { display: inline-block; margin-left: 0.5rem; padding: 0 0.5rem; border: 1px solid var(--atl-attention); border-radius: 999px; font-size: 0.75rem; white-space: nowrap; }
.atl-car-legende .atl-car-approbation { margin-left: 0; }

/* Liste (téléphone) */
.atl-car-liste { display: flex; flex-direction: column; gap: 0.5rem; }
.atl-car-ligne { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface); }
.atl-car-ligne[data-selection] { border-color: var(--atl-texte); }
.atl-car-ligne-tete { display: flex; flex-direction: column; gap: 0.125rem; }
.atl-car-ligne .atl-car-nom { font-size: 0.9375rem; }
.atl-car-ligne-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.atl-car-ligne .atl-bouton { min-height: 2.75rem; }

@media (max-width: 640px) {
  .atl-car-nom-partenaire { min-height: 2.75rem; }
  .atl-org-recherche input { min-height: 2.75rem; }
}
`;
