/**
 * Styles de la discussion avec le Coordinateur. Mobile d'abord : plein écran utile, saisie collée en
 * bas (`dvh` et zone de sécurité), cibles tactiles d'au moins 44 px, aucune action au survol,
 * aucun défilement horizontal. Jetons `--atl-*` de `styles.ts` : clair et sombre suivent l'hôte.
 */
export const STYLES_DISCUSSION = `
.atl-disc { display: flex; flex-direction: column; height: calc(100dvh - 6.5rem); min-height: 22rem; width: 100%; min-width: 0; }
.atl-disc-entete { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.75rem; padding-bottom: 0.75rem; margin-bottom: 0.25rem; border-bottom: 1px solid var(--atl-trait); }
.atl-disc-entete h1 { margin: 0; font-size: 1.5rem; line-height: 1.25; font-weight: 600; letter-spacing: -0.01em; text-wrap: balance; }
.atl-disc-entete .atl-attenue { font-size: 0.8125rem; }
.atl-disc-fil { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 1rem; padding: 0.75rem 0.125rem 1rem; }
.atl-disc-vide { margin: auto 0; display: flex; flex-direction: column; gap: 1rem; padding: 1rem 0; max-width: 34rem; }
.atl-disc-vide p { margin: 0; color: var(--atl-attenue-fort); font-size: 1rem; line-height: 1.5; text-wrap: pretty; }
.atl-disc-suggestions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.atl-disc-suggestion { min-height: 2.75rem; padding: 0.5rem 0.875rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface); color: var(--atl-texte); font: inherit; text-align: left; cursor: pointer; transition: background-color 150ms ease-out, border-color 150ms ease-out; }
.atl-disc-suggestion:hover:not(:disabled) { background: var(--atl-surface-2); border-color: var(--atl-attenue); }
.atl-disc-suggestion:disabled { cursor: not-allowed; color: var(--atl-attenue); }
.atl-disc-suggestion:focus-visible, .atl-disc-saisie textarea:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-disc-saisie textarea:focus-visible { border-color: var(--atl-anneau); }
.atl-disc-bulle { display: flex; flex-direction: column; gap: 0.25rem; max-width: min(85%, 40rem); min-width: 0; }
.atl-disc-bulle[data-auteur="humain"] { align-self: flex-end; align-items: flex-end; }
.atl-disc-bulle[data-auteur="agent"] { align-self: flex-start; align-items: flex-start; }
.atl-disc-meta { font-size: 0.75rem; line-height: 1.4; color: var(--atl-attenue-fort); padding: 0 0.25rem; }
.atl-disc-dep { display: inline-block; margin-right: 0.5rem; padding: 0 0.5rem; border-left: 3px solid var(--atl-accent); border-radius: 0 0.25rem 0.25rem 0; background: var(--atl-surface-2); color: var(--atl-texte); font-weight: 600; }
.atl-disc-dep[data-sensible="oui"] { border-left-color: var(--atl-attention); }
.atl-disc-meta time { font-variant-numeric: tabular-nums; }
.atl-disc-texte { margin: 0; padding: 0.625rem 0.875rem; border-radius: 1rem; border: 1px solid var(--atl-trait); background: var(--atl-surface-2); color: var(--atl-texte); white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; font-size: 0.9375rem; line-height: 1.5; }
.atl-disc-bulle[data-auteur="humain"] .atl-disc-texte { background: var(--atl-accent); color: var(--atl-accent-texte); border-color: var(--atl-accent); border-bottom-right-radius: 0.25rem; }
.atl-disc-bulle[data-auteur="agent"] .atl-disc-texte { border-bottom-left-radius: 0.25rem; }
.atl-disc-texte a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.atl-disc-bulle[data-actions="oui"], .atl-disc-bulle[data-carte="oui"] { max-width: min(100%, 44rem); width: 100%; }
.atl-disc-actions { display: flex; flex-direction: column; gap: 0.5rem; max-width: 100%; min-width: 0; }
.atl-disc-actions-boutons { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; align-items: flex-end; }
.atl-disc-paire { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; min-width: 0; max-width: 100%; }
.atl-disc-paire > .atl-disc-dep { margin-right: 0; }
.atl-disc-actions .atl-bouton { min-height: 2.75rem; white-space: normal; text-align: left; }
.atl-disc-fait { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 0.25rem; color: var(--atl-attenue-fort); font-size: 0.875rem; }
.atl-disc-panneau { padding: 0.75rem; border-left: 3px solid var(--atl-accent); border-radius: 0 calc(var(--atl-rayon) * 0.8) calc(var(--atl-rayon) * 0.8) 0; background: var(--atl-surface-2); min-width: 0; }
.atl-disc-carte { display: flex; flex-direction: column; gap: 0.5rem; white-space: normal; width: 100%; }
.atl-disc-carte-titre { margin: 0; font-weight: 600; }
.atl-disc .atl-surplace { display: flex; flex-direction: column; gap: 0.75rem; max-width: 46rem; }
.atl-disc .atl-surplace-apercu { max-height: 18rem; overflow: auto; padding: 0.625rem 0.75rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-fond); }
.atl-disc .atl-surplace-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.atl-disc .atl-question { margin: 0; }
.atl-disc .atl-surplace .atl-bouton, .atl-disc .atl-surplace .atl-lien { min-height: 2.75rem; }
.atl-disc .atl-surplace .atl-lien { display: inline-flex; align-items: center; }
.atl-disc .atl-surplace input[type="radio"], .atl-disc .atl-surplace input[type="checkbox"] { width: 1.25rem; height: 1.25rem; }
.atl-disc-actions .atl-bouton:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-disc-attente { align-self: flex-start; margin: 0; padding: 0 0.25rem; color: var(--atl-attenue-fort); font-size: 0.8125rem; }
.atl-disc-attente::after { content: ""; display: inline-block; width: 0.375rem; height: 0.375rem; margin-left: 0.5rem; border-radius: 50%; background: currentColor; vertical-align: middle; animation: atl-disc-pouls 1.4s ease-in-out infinite; }
@keyframes atl-disc-pouls { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .atl-disc-attente::after { animation: none; opacity: 0.6; } }
.atl-disc-erreur { margin: 0 0 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.8125rem; border: 1px solid color-mix(in oklab, var(--atl-danger) 45%, var(--atl-trait)); border-radius: calc(var(--atl-rayon) * 0.8); color: var(--atl-danger); }
.atl-disc-saisie { flex: none; flex-wrap: wrap; position: sticky; bottom: 0; display: flex; align-items: flex-end; gap: 0.5rem; padding: 0.75rem 0 calc(0.75rem + env(safe-area-inset-bottom, 0px)); background: var(--atl-fond); border-top: 1px solid var(--atl-trait); }
.atl-disc-saisie textarea { flex: 1 1 14rem; min-width: 0; min-height: 2.75rem; max-height: 9rem; resize: none; padding: 0.625rem 0.75rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-fond); color: inherit; font: inherit; font-size: 1rem; line-height: 1.4; field-sizing: content; }
.atl-disc-saisie textarea::placeholder { color: var(--atl-attenue-fort); opacity: 1; }
.atl-disc-saisie .atl-bouton { min-height: 2.75rem; min-width: 2.75rem; border-radius: calc(var(--atl-rayon) * 0.8); padding: 0 1.25rem; }
.atl-disc-emplacements { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0.5rem; flex: 1 1 100%; min-width: 0; }
.atl-disc-emplacements .atl-bouton { min-height: 2.75rem; }
.atl-voix-ligne { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.atl-voix-ligne [role="status"] { font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-voix-confirmation { margin: 0.75rem 0 0; padding: 0.75rem 0.875rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface); display: flex; flex-direction: column; gap: 0.5rem; max-width: 36rem; }
.atl-voix-confirmation p { margin: 0; }
.atl-voix-proposition { margin: 0; padding: 0.5rem 0.75rem; background: var(--atl-surface-2); border-radius: calc(var(--atl-rayon) * 0.8); white-space: pre-wrap; overflow-wrap: anywhere; }
.atl-voix-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.atl-voix-actions .atl-bouton { min-height: 2.75rem; }
.atl-voix-transcription { list-style: none; padding: 0; margin: 0.75rem 0 0; display: grid; gap: 0.5rem; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-disc-emplacements:empty, .atl-disc-emplacements > div:empty { display: none; }
@media (max-width: 768px) {
  /* Barre de navigation fixe de l'hôte Paperclip (MobileBottomNav : h-16 = 4 rem, plus la zone de sécurité) :
     la zone de saisie reste collée AU-DESSUS d'elle au lieu de passer dessous et de cacher « Envoyer ». */
  .atl-disc { --atl-nav-hote-mobile: calc(4rem + env(safe-area-inset-bottom, 0px)); height: calc(100dvh - 5.5rem); max-width: none; }
  .atl-disc-saisie { bottom: var(--atl-nav-hote-mobile); padding-bottom: 0.75rem; }
  .atl-disc-bulle { max-width: 92%; }
  .atl-disc-bulle[data-actions="oui"], .atl-disc-bulle[data-carte="oui"] { max-width: 100%; }
  .atl-disc-panneau { padding-left: 0.5rem; }
}
`;
