/**
 * Feuille de style de l'atelier, limitée à `.atl` (aucune fuite vers l'hôte).
 * Elle hérite des jetons de Paperclip (fond, texte, bordures, accent, police) :
 * le thème clair ou sombre de l'hôte s'applique tel quel, classe `.dark` sur
 * <html>. Seuls les tons d'état sont définis ici, en deux variantes.
 */
export const STYLES_ATELIER = `
.atl {
  --atl-fond: var(--background, #fff);
  --atl-texte: var(--foreground, #1a1a1a);
  --atl-attenue: var(--muted-foreground, #6b6b6b);
  /* Texte secondaire posé sur la surface grisée : contraste AA garanti. */
  --atl-attenue-fort: color-mix(in oklab, var(--atl-attenue) 62%, var(--atl-texte));
  --atl-trait: var(--border, #e4e4e4);
  --atl-surface: var(--card, #fff);
  --atl-surface-2: var(--muted, #f5f5f5);
  --atl-accent: var(--primary, #222);
  --atl-accent-texte: var(--primary-foreground, #fafafa);
  --atl-anneau: var(--ring, #999);
  --atl-rayon: var(--radius, 0.5rem);
  --atl-succes: oklch(0.46 0.11 152);
  --atl-attention: oklch(0.5 0.12 65);
  --atl-info: oklch(0.47 0.11 250);
  --atl-danger: oklch(0.5 0.19 27);
  --atl-demo: oklch(0.45 0.09 300);
  color: var(--atl-texte);
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  font-size: 0.875rem;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}
.dark .atl {
  --atl-succes: oklch(0.78 0.12 152);
  --atl-attention: oklch(0.82 0.12 75);
  --atl-info: oklch(0.78 0.1 250);
  --atl-danger: oklch(0.74 0.15 25);
  --atl-demo: oklch(0.8 0.09 300);
}
.atl *, .atl *::before, .atl *::after { box-sizing: border-box; }
.atl ::selection { background: color-mix(in oklab, var(--atl-info) 28%, transparent); }
.atl :focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; border-radius: 3px; }
.atl h1, .atl h2, .atl h3, .atl p, .atl dl, .atl dd, .atl ul, .atl ol, .atl blockquote, .atl fieldset { margin: 0; }
.atl ul, .atl ol { padding: 0; list-style: none; }
.atl code { font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8125rem; }
.atl-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Page et en-tête */
.atl-page { max-width: 76rem; margin: 0 auto; padding: 1.5rem 1.5rem 4rem; display: flex; flex-direction: column; gap: 1.25rem; }
.atl-entete { display: flex; flex-direction: column; gap: 0.375rem; }
.atl-entete-ligne { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }
.atl-entete h1 { font-size: 1.5rem; line-height: 1.25; font-weight: 600; letter-spacing: -0.01em; text-wrap: balance; }
.atl-entete-description { color: var(--atl-attenue); max-width: 62ch; }
.atl-entete-actions, .atl-section-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-start; }
.atl-retour { font-size: 0.8125rem; }
.atl-retour .atl-lien::before { content: "\\2190\\00a0"; }

/* Sections */
.atl-section { display: flex; flex-direction: column; gap: 0.75rem; padding-top: 1.25rem; border-top: 1px solid var(--atl-trait); }
.atl-section-tete { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
.atl-sommaire ul { display: flex; flex-wrap: wrap; gap: 0.25rem 0.5rem; list-style: none; margin: 0; padding: 0; }
.atl-sommaire a { display: inline-flex; align-items: center; min-height: 2rem; padding: 0 0.625rem; border: 1px solid var(--atl-trait); border-radius: 999px; font-size: 0.8125rem; color: var(--atl-attenue-fort); text-decoration: none; }
.atl-sommaire a:hover { background: var(--atl-surface-2); color: var(--atl-texte); }
.atl-section-repliable > details > .atl-section-corps { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.75rem; }
.atl-section-resume, .atl-filtres-resume { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; cursor: pointer; list-style: none; }
.atl-section-resume::-webkit-details-marker, .atl-filtres-resume::-webkit-details-marker { display: none; }
.atl-section-resume::after, .atl-filtres-resume::after { content: ""; flex: none; width: 0.5rem; height: 0.5rem; margin-right: 0.25rem; border-right: 1.5px solid var(--atl-attenue); border-bottom: 1.5px solid var(--atl-attenue); transform: rotate(45deg); transition: transform 0.15s; }
details[open] > .atl-section-resume::after, details[open] > .atl-filtres-resume::after { transform: rotate(-135deg); }
.atl-section-repliable { scroll-margin-top: 1rem; }
.atl-section-resume:hover h2 { color: var(--atl-attenue-fort); }
@media (prefers-reduced-motion: reduce) {
  .atl-section-resume::after, .atl-filtres-resume::after { transition: none; }
}
.atl-section-resume:focus-visible, .atl-filtres-resume:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; border-radius: var(--atl-rayon); }
.atl-filtres-resume { display: none; }
.atl-section h2 { font-size: 1.125rem; line-height: 1.3; font-weight: 600; letter-spacing: -0.005em; }
.atl-barre-titre { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
.atl-h3 { font-size: 0.9375rem; font-weight: 600; margin-top: 0.75rem; }
.atl-section-aide { color: var(--atl-attenue); font-size: 0.8125rem; max-width: 62ch; margin-top: -0.375rem; }
.atl-deux-colonnes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: 0 2rem; }

/* Texte */
.atl-attenue { color: var(--atl-attenue); }
.atl-sous { display: block; color: var(--atl-attenue); font-size: 0.75rem; line-height: 1.4; font-weight: 400; margin-top: 0.125rem; }
.atl-barre-export { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: flex-end; }
.atl-export-prospects { padding-top: 0.5rem; }
.atl-texte-danger { color: var(--atl-danger); }
.atl-lien { color: inherit; text-decoration: underline; text-decoration-color: color-mix(in oklab, currentColor 35%, transparent); text-underline-offset: 3px; }
.atl-lien:hover { text-decoration-color: currentColor; }
.atl-lien[aria-current="page"] { font-weight: 600; text-decoration-color: currentColor; }
.atl-url { overflow-wrap: anywhere; }
.atl-citation { padding: 0.75rem 1rem; background: var(--atl-surface-2); border-radius: var(--atl-rayon); white-space: pre-wrap; max-width: 80ch; }
.atl-resume { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; color: var(--atl-attenue); }
.atl-resume strong { color: var(--atl-texte); font-weight: 600; }
.atl-montant { font-size: 1.25rem; font-weight: 600; }
.atl-pile { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; }
.atl-pile-ligne { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.375rem 0.625rem; }
.atl-marge-g { margin-left: 0.375rem; }
.atl-num { text-align: right; }

/* Pastilles d'état : texte + teinte légère, jamais la couleur seule */
.atl-pastille { --ton: var(--atl-attenue); display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.0625rem 0.5rem; border-radius: 999px; font-size: 0.75rem; line-height: 1.25rem; font-weight: 500; white-space: nowrap; color: var(--ton); background: color-mix(in oklab, var(--ton) 11%, transparent); }
.atl-pastille::before { content: ""; width: 0.375rem; height: 0.375rem; border-radius: 50%; background: currentColor; flex: none; }
.atl-pastille[data-ton="succes"] { --ton: var(--atl-succes); }
.atl-pastille[data-ton="attention"] { --ton: var(--atl-attention); }
.atl-pastille[data-ton="info"] { --ton: var(--atl-info); }
.atl-pastille[data-ton="danger"] { --ton: var(--atl-danger); }
.atl-pastille[data-ton="demo"] { --ton: var(--atl-demo); background: transparent; box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ton) 55%, transparent); }
.atl-pastille[data-ton="demo"]::before { border-radius: 1px; transform: rotate(45deg); }

/* Bandeau de l'entreprise courante */
.atl-bandeau-entreprise { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.625rem; padding-bottom: 0.625rem; border-bottom: 1px solid var(--atl-trait); font-size: 0.875rem; }
.atl-bandeau-etiquette { color: var(--atl-attenue); font-size: 0.75rem; }
.atl-bandeau-nom { font-weight: 600; }

/* Écrans vides avec invitation */
.atl-vide-action { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; margin-top: 0.25rem; }

/* Mise en place du client */
.atl-etapes { display: flex; flex-direction: column; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); }
.atl-etape { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0.25rem 1rem; padding: 0.75rem 1rem; }
.atl-etape + .atl-etape { border-top: 1px solid var(--atl-trait); }
.atl-etape-titre { font-weight: 600; }
.atl-etape-detail { grid-column: 1; color: var(--atl-attenue); font-size: 0.8125rem; max-width: 62ch; }
.atl-etape-etat { grid-column: 2; grid-row: 1 / span 2; display: flex; align-items: center; gap: 0.75rem; }

/* Mention de démonstration, bandeau */
.atl-demo { padding: 0.5rem 0.75rem; border-radius: var(--atl-rayon); color: var(--atl-texte); background: color-mix(in oklab, var(--atl-demo) 6%, var(--atl-fond)); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--atl-demo) 40%, transparent); }
.atl-demo strong { color: var(--atl-demo); font-weight: 600; }
.atl-note-mode { padding: 0.5rem 0.75rem; border-radius: var(--atl-rayon); color: var(--atl-texte); background: color-mix(in oklab, var(--atl-info) 6%, var(--atl-fond)); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--atl-info) 40%, transparent); }
.atl-note-mode strong { color: var(--atl-info); font-weight: 600; }

/* Encarts (erreur, confirmation, information manquante) */
.atl-encart { --ton: var(--atl-attenue); display: flex; flex-direction: column; gap: 0.375rem; padding: 0.875rem 1rem; border-radius: var(--atl-rayon); background: color-mix(in oklab, var(--ton) 7%, var(--atl-fond)); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ton) 30%, transparent); }
.atl-encart[data-ton="danger"] { --ton: var(--atl-danger); }
.atl-encart[data-ton="attention"] { --ton: var(--atl-attention); }
.atl-encart-titre { font-weight: 600; color: var(--atl-texte); }
.atl-code { font-size: 0.75rem; color: var(--atl-attenue); }
.atl-encart .atl-bouton { align-self: flex-start; }
.atl-succes { color: var(--atl-succes); font-weight: 500; }

/* Vide et chargement */
.atl-vide { padding: 1.75rem 1rem; text-align: center; border: 1px dashed var(--atl-trait); border-radius: var(--atl-rayon); display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
.atl-vide-titre { font-weight: 600; }
.atl-vide-texte { color: var(--atl-attenue); max-width: 60ch; }
.atl-chargement { display: flex; flex-direction: column; gap: 0.625rem; padding: 0.5rem 0; }
.atl-squelette { display: block; height: 0.875rem; border-radius: 4px; background: var(--atl-surface-2); }
@media (prefers-reduced-motion: no-preference) {
  .atl-squelette { animation: atl-respire 1.4s ease-in-out infinite; }
  .atl-point-actif { animation: atl-respire 1.6s ease-in-out infinite; }
}
@keyframes atl-respire { 50% { opacity: 0.45; } }

/* Fraîcheur des données */
.atl-fraicheur { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; font-size: 0.8125rem; color: var(--atl-attenue); padding: 0.375rem 0; }
.atl-fraicheur[data-perime] { color: var(--atl-attention); }

/* Boutons */
.atl-bouton-groupe { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; max-width: 100%; }
.atl-bouton { display: inline-flex; align-items: center; justify-content: center; gap: 0.375rem; min-height: 2.25rem; padding: 0 0.875rem; border-radius: calc(var(--atl-rayon) * 0.8); border: 1px solid var(--atl-trait); background: var(--atl-surface); color: var(--atl-texte); font: inherit; font-weight: 500; cursor: pointer; text-decoration: none; white-space: nowrap; transition: background-color 150ms ease-out, border-color 150ms ease-out; }
.atl-bouton:hover { background: var(--atl-surface-2); }
.atl-bouton[data-variante="principal"] { background: var(--atl-accent); color: var(--atl-accent-texte); border-color: var(--atl-accent); }
.atl-bouton[data-variante="principal"]:hover { background: color-mix(in oklab, var(--atl-accent) 86%, var(--atl-fond)); }
.atl-bouton[data-variante="danger"] { color: var(--atl-danger); border-color: color-mix(in oklab, var(--atl-danger) 45%, var(--atl-trait)); }
.atl-bouton[data-variante="danger"]:hover { background: color-mix(in oklab, var(--atl-danger) 8%, var(--atl-fond)); }
.atl-bouton[data-variante="discret"] { border-color: transparent; background: transparent; padding: 0 0.5rem; }
.atl-bouton[data-variante="discret"]:hover { background: var(--atl-surface-2); }
.atl-bouton[aria-disabled="true"], .atl-bouton:disabled { cursor: not-allowed; color: var(--atl-attenue); background: var(--atl-surface-2); border-color: var(--atl-trait); }
.atl-raison { font-size: 0.75rem; color: var(--atl-attenue); max-width: 34ch; white-space: normal; }
.atl-actions, .atl-barre-actions { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0.75rem; }
.atl-barre-actions > .atl-encart, .atl-barre-actions > .atl-succes { flex-basis: 100%; }

/* Tableaux : défilement horizontal maîtrisé, puis empilement sur téléphone */
.atl-table-cadre { overflow-x: auto; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); }
.atl-table { width: 100%; border-collapse: collapse; }
.atl-table th, .atl-table td { padding: 0.625rem 0.75rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--atl-trait); }
.atl-table tbody tr:last-child > * { border-bottom: 0; }
.atl-table thead th { font-size: 0.75rem; font-weight: 500; color: var(--atl-attenue-fort); background: var(--atl-surface-2); white-space: nowrap; }
.atl-table tbody th { font-weight: 500; }
.atl-table tbody tr[data-choisi="true"] { background: color-mix(in oklab, var(--atl-info) 6%, transparent); }
.atl-table tbody tr.atl-ligne-cliquable { cursor: pointer; }
.atl-table tbody tr.atl-ligne-cliquable:hover { background: color-mix(in oklab, var(--atl-info) 4%, transparent); }
.atl-fiche:focus { outline: none; }
.atl-table .atl-num { text-align: right; }
.atl-table-realite tbody th { min-width: 11rem; }
.atl-table-realite .atl-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.atl-table-matrice tbody th { min-width: 14rem; }
.atl-table-matrice td { min-width: 7rem; }

/* Champs et listes de définitions */
.atl-champs { display: flex; flex-direction: column; gap: 0.75rem; }
.atl-champs > div { display: grid; grid-template-columns: minmax(8rem, 12rem) 1fr; gap: 0.25rem 1rem; }
.atl-champs dt { color: var(--atl-attenue); }
.atl-champs-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); gap: 1rem 2rem; }
.atl-champs-grille > div { display: flex; flex-direction: column; gap: 0.125rem; }
.atl-champs-compacts > div { grid-template-columns: minmax(7rem, 9rem) 1fr; }
.atl-chiffres { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); gap: 0.75rem 1.5rem; }
.atl-chiffres > div { display: flex; flex-direction: column; gap: 0.25rem; }
.atl-chiffres dt { font-size: 0.75rem; color: var(--atl-attenue); }
.atl-chiffres dd { display: flex; flex-wrap: wrap; gap: 0.375rem; font-weight: 600; }
.atl-liste { display: flex; flex-direction: column; gap: 0.5rem; }
.atl-liste > li { padding-left: 0.875rem; position: relative; }
.atl-liste > li::before { content: ""; position: absolute; left: 0; top: 0.6rem; width: 0.3125rem; height: 1px; background: var(--atl-attenue); }
.atl-liste-compacte { display: flex; flex-direction: column; gap: 0.25rem; }
.atl-connecteur, .atl-source { display: flex; flex-direction: column; gap: 0.125rem; }

/* Fils (échanges, revues, décisions) et chronologie */
.atl-fil { display: flex; flex-direction: column; }
.atl-fil > li { padding: 0.625rem 0; border-bottom: 1px solid var(--atl-trait); display: flex; flex-direction: column; gap: 0.25rem; }
.atl-fil > li:last-child { border-bottom: 0; }
.atl-fil-tete { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem 0.625rem; }
.atl-fil-texte { max-width: 75ch; }
.atl-fil-pied { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; font-size: 0.75rem; color: var(--atl-attenue); }
.atl-chrono { display: flex; flex-direction: column; position: relative; }
.atl-chrono > li { display: grid; grid-template-columns: 9.5rem 1fr; gap: 0.125rem 1rem; padding: 0.5rem 0 0.5rem 1.25rem; position: relative; }
.atl-chrono > li::before { content: ""; position: absolute; left: 0.25rem; top: 0; bottom: 0; width: 1px; background: var(--atl-trait); }
.atl-chrono > li::after { content: ""; position: absolute; left: 0; top: 0.875rem; width: 0.5625rem; height: 0.5625rem; border-radius: 50%; background: var(--atl-fond); box-shadow: inset 0 0 0 1.5px var(--atl-attenue); }
.atl-chrono > li[data-type="controle_echoue"]::after, .atl-chrono > li[data-type="refus_serveur"]::after { box-shadow: inset 0 0 0 5px var(--atl-danger); }
.atl-chrono > li[data-type="controle_reussi"]::after, .atl-chrono > li[data-type="validation"]::after { box-shadow: inset 0 0 0 5px var(--atl-succes); }
.atl-chrono > li[data-type="decision_humaine"]::after { box-shadow: inset 0 0 0 5px var(--atl-texte); }
.atl-chrono-type { font-weight: 500; }
.atl-chrono-meta { grid-column: 2; font-size: 0.75rem; color: var(--atl-attenue); }

/* Exigences, constats */
.atl-exigences { display: flex; flex-direction: column; gap: 1rem; }
.atl-exigence { display: flex; flex-direction: column; gap: 0.25rem; max-width: 80ch; }
.atl-exigence-tete { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.atl-constats { display: flex; flex-direction: column; gap: 1rem; }
.atl-constat { display: flex; flex-direction: column; gap: 0.375rem; padding-bottom: 1rem; border-bottom: 1px solid var(--atl-trait); }
.atl-constat:last-child { border-bottom: 0; padding-bottom: 0; }

/* Dossier : contenu + colonne de décision */
.atl-dossier { display: grid; grid-template-columns: minmax(0, 1fr) minmax(17rem, 22rem); gap: 0 2.5rem; align-items: start; }
.atl-dossier-principal { display: flex; flex-direction: column; gap: 1.25rem; min-width: 0; }
.atl-dossier-cote { display: flex; flex-direction: column; gap: 1.25rem; position: sticky; top: 1rem; }
.atl-dossier-cote .atl-champs > div { grid-template-columns: 1fr; }
.atl-livrable { padding: 1rem 1.25rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); max-width: 80ch; overflow-wrap: anywhere; }
.atl-livrable-titre { font-weight: 600; margin-bottom: 0.5rem; }
.atl-natif { border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); overflow: hidden; }

/* Formulaires */
.atl-critere { display: flex; flex-direction: column; gap: 0.5rem; padding-block: 0.5rem; border-bottom: 1px solid var(--atl-trait); }
.atl-critere:last-child { border-bottom: 0; }
.atl-critere > div:first-child { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.5rem; }
.atl-critere > div:first-child .atl-attenue { font-size: 0.8125rem; flex-basis: 100%; }
.atl-critere-formulaire { padding: 0.75rem 1rem; background: var(--atl-surface-2); border-radius: var(--atl-rayon); max-width: 36rem; }
.atl-critere-formulaire .atl-actions { gap: 0.5rem; }
/* Critères des leads (Paramètres) : poids étroits, titres de groupe, rythme du formulaire */
.atl-criteres-leads { gap: 1.25rem; }
.atl-criteres-leads h3 { font-size: 0.9375rem; font-weight: 600; margin-top: 0.5rem; }
.atl-criteres-leads .atl-table input:not([type="checkbox"]) { width: 5rem; text-align: right; }
.atl-criteres-leads .atl-table tbody td:nth-child(n+2) { white-space: nowrap; }
.atl-criteres-leads fieldset.atl-champ { gap: 0.75rem; padding-top: 1rem; border-top: 1px solid var(--atl-trait); align-items: flex-start; }
.atl-criteres-leads fieldset.atl-champ .atl-grille-champs { width: 100%; }
.atl-criteres-leads .atl-succes { margin: 0; }
.atl-formulaire { display: flex; flex-direction: column; gap: 1rem; max-width: 60rem; }
.atl-champ { display: flex; flex-direction: column; gap: 0.3125rem; min-width: 0; border: 0; padding: 0; }
.atl-champ > label, .atl-champ > span:first-child, .atl-champ > legend { font-weight: 500; }
.atl-champ legend { padding: 0; margin-bottom: 0.375rem; }
.atl-champ-ligne { flex-direction: row; align-items: center; gap: 0.5rem; }
.atl-champ-etroit { max-width: 20rem; }
.atl-aide { font-size: 0.75rem; color: var(--atl-attenue); font-weight: 400; }
/* L'aide passe sous le champ : les champs d'une même rangée restent alignés. */
.atl-champ > .atl-aide { order: 3; }
.atl input:not([type="radio"]):not([type="checkbox"]):not([type="file"]), .atl textarea, .atl select { font: inherit; color: var(--atl-texte); background: var(--atl-fond); border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); padding: 0.4375rem 0.625rem; min-height: 2.25rem; width: 100%; }
.atl textarea { resize: vertical; line-height: 1.5; }
.atl input[aria-invalid="true"] { border-color: var(--atl-danger); }
.atl input[type="radio"], .atl input[type="checkbox"] { accent-color: var(--atl-accent); width: 1rem; height: 1rem; margin: 0 0.375rem 0 0; vertical-align: -0.1875rem; }
.atl-grille-champs { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); gap: 1rem; }
.atl-choix { gap: 0.5rem; }
.atl-choix label { display: block; }
.atl-choix label .atl-aide { display: block; margin-left: 1.375rem; }
.atl-plafond > .atl-champ-etroit, .atl-plafond > .atl-encart { margin-left: 1.375rem; }
.atl-budget-ia { gap: 0; border-bottom: 1px solid var(--atl-trait); }
.atl-budget-ia:last-child { border-bottom: 0; }
.atl-budget-detail > summary { padding: 0.5rem 0; min-height: 2.25rem; }
.atl-budget-detail > summary::marker { color: var(--atl-attenue); }
.atl-budget-nom { font-weight: 500; }
.atl-budget-valeur { color: var(--atl-attenue-fort); font-weight: 400; }
.atl-budget-detail[open] { padding-bottom: 1rem; }
.atl-budget-detail[open] > summary { margin-bottom: 0.25rem; }
.atl-budget-detail > :not(summary) { margin-top: 0.75rem; }
.atl-budget-detail > .atl-bouton-groupe { display: flex; }
.atl-leviers { gap: 0.25rem; }
.atl-levier { display: flex; flex-direction: column; gap: 0.125rem; }
.atl-levier-champs { display: flex; flex-direction: column; gap: 0.75rem; margin: 0.25rem 0 0.75rem 1.375rem; padding-left: 0.875rem; border-left: 1px solid var(--atl-trait); }
.atl .atl-levier-aide { margin-left: 1.375rem; }
.atl-portee { padding: 0.875rem 1rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); gap: 0.75rem; }
.atl-portee legend { padding: 0 0.25rem; }
.atl-repeteur { display: grid; grid-template-columns: minmax(8rem, 1fr) minmax(10rem, 2fr) auto auto; gap: 0.5rem 0.75rem; align-items: end; padding-bottom: 0.75rem; }
.atl-case { display: inline-flex; align-items: center; min-height: 2.25rem; }
.atl-details > summary { cursor: pointer; font-weight: 500; padding: 0.25rem 0; }
.atl-details[open] > summary { margin-bottom: 0.75rem; }
.atl-decision .atl-bouton-groupe { width: 100%; }
.atl-decision-fermee { color: var(--atl-attenue); padding: 0.75rem 1rem; border: 1px dashed var(--atl-trait); border-radius: var(--atl-rayon); }
.atl-decision .atl-bouton { width: 100%; }
/* Bouton unique d'une colonne latérale (Diffusion) : même gabarit que la décision. */
.atl-bouton-plein .atl-bouton-groupe, .atl-bouton-plein .atl-bouton { width: 100%; }

/* Filtres */
.atl-filtres { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1.5rem; }
.atl-filtres select { width: auto; min-width: 12rem; }
.atl-segments { display: inline-flex; flex-wrap: wrap; gap: 0.25rem; }
.atl-segment { font: inherit; font-size: 0.8125rem; border: 1px solid var(--atl-trait); background: transparent; color: var(--atl-texte); border-radius: 999px; padding: 0.25rem 0.75rem; min-height: 2rem; cursor: pointer; }
.atl-segment[aria-pressed="true"] { background: var(--atl-accent); color: var(--atl-accent-texte); border-color: var(--atl-accent); }
.atl-compte { opacity: 0.7; margin-left: 0.125rem; }

/* Activité réelle (run en cours) */
.atl-actif { display: inline-flex; align-items: center; gap: 0.375rem; color: var(--atl-info); font-weight: 500; }
.atl-point-actif { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: currentColor; }

/* Navigation : barre latérale de la route et onglets sur téléphone */
.atl-nav { display: flex; flex-direction: column; height: 100%; padding: 0.75rem 0.5rem; gap: 0.25rem; }
.atl-nav a { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.4375rem 0.75rem; border-radius: calc(var(--atl-rayon) * 0.8); color: var(--atl-texte); text-decoration: none; font-size: 0.8125rem; font-weight: 500; }
.atl-nav a:hover { background: var(--atl-surface-2); }
.atl-nav a[aria-current="page"] { background: var(--atl-surface-2); box-shadow: inset 0 0 0 1px var(--atl-trait); }
.atl-nav-pied { margin-top: auto; padding-top: 0.5rem; border-top: 1px solid var(--atl-trait); }
.atl-nav-compte { font-size: 0.6875rem; min-width: 1.25rem; text-align: center; padding: 0 0.375rem; border-radius: 999px; background: var(--atl-accent); color: var(--atl-accent-texte); }
.atl-onglets-cadre, .atl-onglets { display: none; }
.atl-entree { display: flex; align-items: center; gap: 0.625rem; padding: 0.5rem 0.75rem; font-size: 0.8125rem; font-weight: 500; color: inherit; text-decoration: none; border-radius: calc(var(--atl-rayon) * 0.8); }
.atl-entree:hover { background: var(--atl-surface-2); }
.atl-entree svg { flex: none; }

/* Widget du tableau de bord */
.atl-widget { display: flex; flex-direction: column; gap: 0.75rem; }
.atl-widget-ligne { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; }
.atl-widget-demande { display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; }
.atl-widget-demande textarea { width: 100%; min-height: 3.5rem; resize: vertical; padding: 0.5rem 0.625rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-fond); color: inherit; font: inherit; line-height: 1.5; }
.atl-widget-demande textarea:focus-visible { outline-offset: 0; border-color: var(--atl-anneau); }
.atl-widget-erreur { color: var(--atl-danger); margin: 0; }
.atl-widget-ligne strong { font-size: 1.125rem; font-weight: 600; }

/* Appels proposés (contrat v1.6) : tout ce qui partira, sans troncature */
.atl-appels { display: flex; flex-direction: column; gap: 1rem; }
.atl-appel { display: flex; flex-direction: column; gap: 0.625rem; padding: 0.875rem 1rem; border-radius: var(--atl-rayon); box-shadow: inset 0 0 0 1px var(--atl-trait); background: var(--atl-surface); }
.atl-appel[data-ancien="true"] { opacity: 0.62; background: var(--atl-surface-2); }
.atl-apercu-groupe { display: flex; flex-direction: column; gap: 0.25rem; }
.atl-apercu-titre { margin: 0; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; color: var(--atl-attenue-fort); }
.atl-apercu-liste { display: flex; flex-direction: column; gap: 0.375rem; }
.atl-apercu-ligne { display: grid; grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr); gap: 0.125rem 0.75rem; align-items: baseline; }
.atl-apercu-ligne dt { font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-apercu-champ { font-size: 0.6875rem; color: var(--atl-attenue); }
.atl-apercu-valeur { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; padding: 0.375rem 0.625rem; background: var(--atl-surface-2); border-radius: calc(var(--atl-rayon) - 2px); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8125rem; }
.atl-empreinte { margin: 0; overflow-wrap: anywhere; word-break: break-all; }
.atl-choix-appel { display: flex; flex-direction: column; gap: 0.5rem; }
.atl-choix-appel-ligne { display: flex; align-items: flex-start; gap: 0.5rem; }
.atl-choix-appel-ligne code { overflow-wrap: anywhere; word-break: break-all; font-size: 0.6875rem; }
.atl-suivi { display: flex; flex-direction: column; }
.atl-suivi-ligne { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.625rem 0; border-bottom: 1px solid var(--atl-trait); }
.atl-suivi-ligne:last-child { border-bottom: 0; }
.atl-revocation { display: flex; flex-direction: column; gap: 0.375rem; align-items: flex-start; margin-top: 0.375rem; }
.atl-revocation textarea { width: 100%; }

.atl-etapes { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; list-style: none; margin: 0 0 1rem; padding: 0; color: var(--atl-attenue-fort); }
.atl-etapes li[aria-current="step"] { color: var(--atl-texte); font-weight: 600; }
.atl-etape-num { display: inline-block; min-width: 1.25rem; text-align: center; border: 1px solid currentColor; border-radius: 999px; font-size: 0.75rem; line-height: 1.125rem; }
.atl-etapes li[data-fait] .atl-etape-num { background: var(--atl-trait); }
.atl-score { display: inline-flex; flex-direction: column; }
.atl-filtres-prospects { max-width: none; }
.atl-fiche { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--atl-trait); }
.atl-table button.atl-lien { background: none; border: 0; padding: 0; font: inherit; font-weight: 500; cursor: pointer; text-align: left; }
@media (max-width: 960px) {
  .atl-dossier { grid-template-columns: 1fr; }
  .atl-dossier-cote { position: static; order: -1; }
}
@media (max-width: 768px) {
  .atl-page { padding: 1rem 1rem 3rem; }
  .atl-onglets-cadre { display: block; position: relative; }
  .atl-onglets-cadre::after { content: ""; position: absolute; top: 0; right: -1rem; bottom: 1px; width: 2.5rem; pointer-events: none; opacity: 0; background: linear-gradient(to right, transparent, var(--atl-fond) 85%); }
  .atl-onglets-cadre[data-suite="oui"]::after { opacity: 1; }
  .atl-onglets { display: flex; gap: 0.25rem; overflow-x: auto; scrollbar-width: none; margin: -0.25rem -1rem 0; padding: 0.25rem 1rem; border-bottom: 1px solid var(--atl-trait); }
  .atl-onglets a { flex: none; white-space: nowrap; padding: 0.5rem 0.75rem; font-size: 0.8125rem; font-weight: 500; color: var(--atl-attenue); text-decoration: none; border-bottom: 2px solid transparent; }
  .atl-onglets a[aria-current="page"] { color: var(--atl-texte); border-bottom-color: var(--atl-texte); }
  .atl-repeteur { grid-template-columns: 1fr; }
  .atl-champs > div { grid-template-columns: 1fr; }
  .atl-chrono > li { grid-template-columns: 1fr; }
  .atl-chrono-meta { grid-column: 1; }
  .atl-apercu-ligne { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .atl-table-cadre { border: 0; overflow: visible; }
  .atl-table thead { display: none; }
  .atl-table, .atl-table tbody, .atl-table tr, .atl-table th, .atl-table td { display: block; width: 100%; }
  .atl-table tr { border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); padding: 0.375rem 0; margin-bottom: 0.75rem; }
  .atl-table tbody th, .atl-table td { border-bottom: 0; padding: 0.3125rem 0.75rem; }
  .atl-table td[data-libelle] { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr); gap: 0 0.75rem; align-items: baseline; }
  .atl-table td[data-libelle]::before { content: attr(data-libelle); grid-row: 1 / span 4; font-size: 0.75rem; color: var(--atl-attenue); }
  .atl-table td[data-libelle] > * { grid-column: 2; }
  .atl-table .atl-num { text-align: left; }
  .atl-table tbody th { font-size: 0.9375rem; }
}

/* Mobile : volet des filtres des prospects et résumés des sections, cibles de 44 px */
@media (max-width: 640px) {
  .atl-section-resume { min-height: 2.75rem; }
  .atl-filtres-resume { display: flex; min-height: 2.75rem; padding: 0 0.75rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface); font-size: 0.875rem; font-weight: 500; }
  .atl-filtres-volet[open] > .atl-filtres-resume { margin-bottom: 1rem; }
  .atl-sommaire a { min-height: 2.75rem; }
}

/* Mobile (audit M2) : cibles tactiles de 44 px, champs en 16 px (pas de zoom automatique de iOS) */
@media (max-width: 640px) {
  .atl-bouton, .atl-segment, .atl-table button.atl-lien { min-height: 2.75rem; }
  .atl-mission-titre { display: inline-flex; align-items: center; min-height: 2.75rem; }
  .atl input:not([type="radio"]):not([type="checkbox"]):not([type="file"]), .atl textarea, .atl select { min-height: 2.75rem; font-size: 1rem; }
  .atl input[type="radio"], .atl input[type="checkbox"] { width: 1.375rem; height: 1.375rem; }
  .atl label:has(> input[type="radio"]), .atl label:has(> input[type="checkbox"]) { display: inline-flex; align-items: center; min-height: 2.75rem; }
}

/* Statut du lead : un badge, deux chiffres en petit */
.atl-statut-lead { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 0.125rem; }
.atl-statut-lead-grand { font-size: 1.125rem; }
.atl-statut-chiffres { margin-top: 0.25rem; }
.atl-statut-lead-bloc { display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; margin: 0 0 1rem; max-width: 46rem; }
.atl-statut-tris { display: flex; gap: 0.75rem; font-weight: 400; margin-top: 0.125rem; }
.atl-nav-groupe { display: flex; flex-direction: column; gap: 0.125rem; margin: 0.25rem 0; padding: 0.25rem 0 0.375rem 0.375rem; border-left: 3px solid var(--atl-accent); background: color-mix(in srgb, var(--atl-accent) 6%, transparent); border-radius: 0 calc(var(--atl-rayon) * 0.8) calc(var(--atl-rayon) * 0.8) 0; }
.atl-nav-intertitre { padding: 0.25rem 0.75rem 0.125rem; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--atl-attenue-fort); }
.atl-nav-groupe a:hover { background: var(--atl-surface); }
`;
