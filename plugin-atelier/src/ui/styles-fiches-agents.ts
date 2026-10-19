/**
 * Styles de la fiche d'un agent et du parcours d'une demande (onglet Équipe). Sobres : listes et titres, trait fin,
 * aucune carte imbriquée ni ombre ; une colonne sur téléphone.
 */
export const STYLES_FICHES_AGENTS = `
.atl-fiche { display: flex; flex-direction: column; gap: 0.25rem; max-width: 62rem; }
.atl-fiche-role { margin: 0; color: var(--atl-attenue); }
.atl-fiche > .atl-h3 { margin: 1.25rem 0 0.25rem; }
.atl-fiche p { margin: 0; max-width: 68ch; }
.atl-fiche-deux { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 2rem; }
.atl-fiche-deux > div { min-width: 0; }
.atl-fiche ul { margin: 0; padding-left: 1.125rem; display: flex; flex-direction: column; gap: 0.25rem; max-width: 68ch; }
.atl-fiche-comp { display: flex; flex-direction: column; gap: 0.75rem; margin: 0; max-width: 68ch; }
.atl-fiche-comp dt { font-weight: 600; }
.atl-fiche-comp dd { margin: 0.125rem 0 0; }
.atl-fiche-cle { font-weight: 400; margin-left: 0.5rem; }
.atl-fiche-tech { margin-top: 1.25rem; }
.atl-fiche-tech > summary { cursor: pointer; font-weight: 600; font-size: 0.9375rem; min-height: 2.75rem; display: flex; align-items: center; }
.atl-trajet-liste { margin: 0; padding-left: 1.5rem; display: flex; flex-direction: column; gap: 0.875rem; max-width: 68ch; }
.atl-trajet-liste li::marker { color: var(--atl-attenue-fort); font-weight: 600; font-variant-numeric: tabular-nums; }
.atl-trajet-liste p { margin: 0.125rem 0 0; }
.atl-trajet-agents { margin-top: 0.25rem; font-size: 0.8125rem; color: var(--atl-attenue); }
.atl-trajet-agents a { display: inline-block; padding-block: 0.375rem; }
.atl-trajet-cadre { margin-top: 1rem; max-width: 68ch; }
.atl-trajet-cadre > div { display: grid; grid-template-columns: minmax(8rem, 12rem) 1fr; gap: 0.25rem 1rem; }
.atl-trajet-cadre > div + div { margin-top: 0.625rem; }
.atl-trajet-cadre dt { color: var(--atl-attenue); }
.atl-trajet-cadre dd { margin: 0; }
@media (max-width: 640px) {
  .atl-fiche-deux { grid-template-columns: 1fr; }
  .atl-trajet-cadre > div { grid-template-columns: 1fr; }
}
`;
