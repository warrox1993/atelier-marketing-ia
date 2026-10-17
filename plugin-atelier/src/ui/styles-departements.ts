/**
 * Styles de la grille des départements et du fil « Client › Département ». Une case par service, sur une grille fluide
 * (une colonne sur téléphone, plusieurs sur grand écran) : un client peut avoir une trentaine de services, donc des
 * cases de même gabarit, sobres (trait fin, aucune ombre), où seul ce qui attend quelqu'un ressort.
 * Les nombres nuls s'effacent ; les non nuls prennent la couleur de leur ton.
 */
export const STYLES_DEPARTEMENTS = `
.atl-dep { display: flex; flex-direction: column; gap: 1rem; }
.atl-dep-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); gap: 0.75rem; margin: 0; padding: 0; list-style: none; }
.atl-dep-case { position: relative; display: flex; flex-direction: column; gap: 0.875rem; min-width: 0; padding: 1rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface); }
.atl-dep-case:hover { border-color: var(--atl-attenue); background: color-mix(in oklab, var(--atl-surface-2) 55%, var(--atl-surface)); }
.atl-dep-case[data-courant] { background: var(--atl-surface-2); }
.atl-dep-nom { display: flex; flex-direction: column; gap: 0.375rem; min-width: 0; }
.atl-dep-nom h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.125rem 0.625rem; margin: 0; font-size: 1rem; font-weight: 600; line-height: 1.3; min-width: 0; overflow-wrap: anywhere; }
.atl-dep-lien { color: inherit; text-decoration: none; }
.atl-dep-lien::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
.atl-dep-case:hover .atl-dep-lien { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
.atl-dep-lien:focus-visible { outline: none; }
.atl-dep-lien:focus-visible::after { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-dep-ici { font-size: 0.75rem; font-weight: 400; color: var(--atl-attenue-fort); }
.atl-dep-alertes { display: flex; flex-direction: column; gap: 0.125rem; margin: 0; padding: 0; list-style: none; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-dep-alertes li { position: relative; padding-left: 0.875rem; }
.atl-dep-alertes li::before { content: ""; position: absolute; left: 0.125rem; top: 0.55em; width: 0.375rem; height: 0.375rem; border-radius: 50%; background: var(--atl-attention); }
.atl-dep-alertes li[data-niveau="haute"] { color: var(--atl-texte); }
.atl-dep-alertes li[data-niveau="haute"]::before { background: var(--atl-danger); }
.atl-dep-chiffres { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; margin: 0; padding-top: 0.875rem; border-top: 1px solid var(--atl-trait); }
.atl-dep-chiffre { display: flex; flex-direction: column-reverse; justify-content: flex-end; gap: 0.125rem; min-width: 0; }
.atl-dep-chiffre dt { font-size: 0.75rem; color: var(--atl-attenue); }
.atl-dep-chiffre dd { margin: 0; font-size: 1.375rem; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; }
.atl-dep-chiffre[data-zero] dd { font-weight: 400; color: var(--atl-attenue); }
.atl-dep-chiffre[data-ton="attention"] dd { color: var(--atl-attention); }
.atl-dep-chiffre[data-ton="danger"] dd { color: var(--atl-danger); }
.atl-dep-meta { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; margin-top: auto; font-size: 0.8125rem; }
.atl-dep-agents { margin: 0; color: var(--atl-texte); }
.atl-dep-activite { margin: 0; color: var(--atl-attenue); font-size: 0.75rem; }
.atl-dep-attente, .atl-dep-erreur { min-width: 0; margin-top: auto; }
.atl-dep-erreur { display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; font-size: 0.8125rem; color: var(--atl-danger); }
.atl-dep-erreur p { margin: 0; }
.atl-dep-relire { position: relative; z-index: 1; }

/* Fil « Client › Département » du bandeau */
.atl-fil { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.75rem; min-width: 0; }
.atl-fil ol { display: flex; flex-wrap: nowrap; align-items: baseline; gap: 0.375rem; margin: 0; padding: 0; list-style: none; min-width: 0; }
.atl-fil li { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.atl-fil li + li::before { content: "\\203A"; margin-right: 0.375rem; color: var(--atl-attenue); }
.atl-fil-client { color: var(--atl-attenue-fort); }
.atl-fil-tous { margin-left: auto; font-size: 0.8125rem; }

@media (max-width: 640px) {
  .atl-fil-tous { margin-left: 0; flex-basis: 100%; min-height: 2.75rem; display: inline-flex; align-items: center; }
}
`;
