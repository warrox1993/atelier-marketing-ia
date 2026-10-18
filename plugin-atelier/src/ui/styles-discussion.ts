/**
 * Styles de la discussion avec le Coordinateur. Mobile d'abord : plein écran utile, saisie collée en
 * bas (`dvh` et zone de sécurité), cibles tactiles d'au moins 44 px, aucune action au survol,
 * aucun défilement horizontal. Jetons `--atl-*` de `styles.ts` : clair et sombre suivent l'hôte.
 */
export const STYLES_DISCUSSION = `
.atl-disc { display: flex; flex-direction: column; height: calc(100dvh - 6.5rem); min-height: 22rem; width: 100%; min-width: 0; }
.atl-disc { --atl-colonne: 48rem; }
.atl-disc-entete { display: flex; align-items: center; gap: 0.625rem; padding: 0 0 0.625rem; border-bottom: 1px solid var(--atl-trait); }
.atl-disc-entete-texte { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.atl-disc-ident { flex: none; font-size: 0.75rem; font-variant-numeric: tabular-nums; color: var(--atl-attenue-fort); }
.atl-disc-avatar { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 1.375rem; height: 1.375rem; border-radius: 50%; background: var(--atl-surface-2); border: 1px solid var(--atl-trait); color: var(--atl-attenue-fort); font-size: 0.6875rem; font-weight: 600; line-height: 1; }
.atl-disc-avatar-grand { width: 2rem; height: 2rem; font-size: 0.875rem; }
.atl-disc-entete h1 { margin: 0; font-size: 1rem; line-height: 1.3; font-weight: 600; }
.atl-disc-entete .atl-attenue { font-size: 0.8125rem; line-height: 1.3; }
.atl-disc-fil { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scroll-behavior: smooth; display: flex; flex-direction: column; gap: 1.25rem; padding: 1rem max(0.25rem, calc((100% - var(--atl-colonne)) / 2)) 1rem; }
.atl-disc-vide { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 1rem 0; max-width: 30rem; text-align: center; }
.atl-disc-vide p { margin: 0; color: var(--atl-texte); font-size: 1.125rem; line-height: 1.45; text-wrap: balance; }
.atl-disc-colonne { width: min(100%, var(--atl-colonne)); margin-inline: auto; box-sizing: border-box; }
.atl-disc-suggestions { flex: none; display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; padding-bottom: 0.75rem; }
/* Téléphone : une rangée de pastilles qui défile au doigt, au lieu de lignes empilées qui mangent le fil. */
@media (max-width: 640px) {
  .atl-disc-suggestions { flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto; scrollbar-width: none; overscroll-behavior-x: contain; padding-inline: 0.125rem; }
  .atl-disc-suggestions::-webkit-scrollbar { display: none; }
  .atl-disc-suggestion { flex: none; white-space: nowrap; }
}
.atl-disc-suggestion { min-height: 2.75rem; padding: 0.5rem 1rem; border: 1px solid var(--atl-trait); border-radius: 999px; background: var(--atl-fond); color: var(--atl-texte); font: inherit; font-size: 0.9375rem; text-align: left; cursor: pointer; transition: background-color 150ms ease-out, border-color 150ms ease-out; }
.atl-disc-suggestion:hover:not(:disabled) { background: var(--atl-surface-2); border-color: var(--atl-attenue); }
.atl-disc-suggestion:disabled { cursor: not-allowed; color: var(--atl-attenue); }
.atl-disc-suggestion:focus-visible, .atl-disc-icone:focus-visible, .atl-disc-envoyer:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-disc-bulle { display: flex; flex-direction: column; gap: 0.25rem; max-width: min(85%, 40rem); min-width: 0; }
.atl-disc-bulle[data-auteur="humain"] { align-self: flex-end; align-items: flex-end; }
.atl-disc-bulle[data-auteur="agent"] { align-self: flex-start; align-items: flex-start; }
.atl-disc-meta { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; line-height: 1.4; color: var(--atl-attenue-fort); padding: 0 0.25rem; }
.atl-disc-nom { font-weight: 600; color: var(--atl-texte); }
.atl-disc-dep { display: inline-block; margin-right: 0.5rem; padding: 0 0.5rem; border: 1px solid var(--atl-trait); border-radius: 999px; background: var(--atl-surface-2); color: var(--atl-texte); font-weight: 600; }
.atl-disc-dep[data-sensible="oui"] { border-color: var(--atl-attention); }
.atl-disc-meta time { font-variant-numeric: tabular-nums; }
.atl-disc-texte { margin: 0; padding: 0.625rem 1rem; border-radius: 1.25rem; background: var(--atl-surface-2); color: var(--atl-texte); white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; font-size: 0.9375rem; line-height: 1.55; }
.atl-disc-bulle[data-auteur="humain"] .atl-disc-texte { border-bottom-right-radius: 0.375rem; }
.atl-disc-bulle[data-auteur="agent"] { max-width: 100%; }
.atl-disc-bulle[data-auteur="agent"] .atl-disc-texte { padding: 0.125rem 0.25rem; border-radius: 0; background: transparent; max-width: 44rem; }
.atl-disc-bulle[data-auteur="agent"] .atl-disc-texte.atl-disc-carte { padding: 0.75rem 1rem; border-radius: 1rem; background: var(--atl-surface-2); }
.atl-disc-texte a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.atl-disc-bulle[data-actions="oui"], .atl-disc-bulle[data-carte="oui"] { max-width: min(100%, 44rem); width: 100%; }
.atl-disc-actions { display: flex; flex-direction: column; gap: 0.5rem; max-width: 100%; min-width: 0; }
.atl-disc-actions-boutons { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; align-items: flex-end; }
.atl-disc-paire { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; min-width: 0; max-width: 100%; }
.atl-disc-paire > .atl-disc-dep { margin-right: 0; }
.atl-disc-actions .atl-bouton { min-height: 2.75rem; white-space: normal; text-align: left; }
.atl-disc-fait { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 0.25rem; color: var(--atl-attenue-fort); font-size: 0.875rem; }
.atl-disc-panneau { padding: 0.75rem; border: 1px solid var(--atl-trait); border-radius: calc(var(--atl-rayon) * 0.8); background: var(--atl-surface-2); min-width: 0; }
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
.atl-disc-attente { align-self: flex-start; margin: 0; padding: 0 0.25rem; color: var(--atl-attenue-fort); font-size: 0.875rem; }
.atl-disc-attente::after { content: ""; display: inline-block; width: 0.375rem; height: 0.375rem; margin-left: 0.5rem; border-radius: 50%; background: currentColor; vertical-align: middle; animation: atl-disc-pouls 1.4s ease-in-out infinite; }
@keyframes atl-disc-pouls { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .atl-disc-attente::after { animation: none; opacity: 0.6; } }
.atl-disc-erreur { margin: 0 auto 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.8125rem; border: 1px solid color-mix(in oklab, var(--atl-danger) 45%, var(--atl-trait)); border-radius: calc(var(--atl-rayon) * 0.8); color: var(--atl-danger); }
.atl-disc-pied { flex: none; position: sticky; bottom: 0; z-index: 1; padding-top: 0.5rem; background: var(--atl-fond); }
.atl-disc-saisie { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; width: min(100%, var(--atl-colonne)); margin: 0 auto 0.75rem; box-sizing: border-box; padding: 0.5rem 0.5rem 0.5rem 0.75rem; border: 1px solid var(--atl-trait); border-radius: 1.5rem; background: var(--atl-surface); transition: border-color 150ms ease-out; }
.atl-disc-saisie:focus-within { border-color: var(--atl-anneau); }
.atl-disc-saisie .atl-disc-erreur, .atl-disc-saisie .atl-voix-confirmation, .atl-disc-saisie .atl-voix-transcription, .atl-disc-saisie .atl-erreur { order: -1; flex: 1 0 100%; box-sizing: border-box; max-width: none; margin: 0 0 0.25rem; }
.atl-disc-saisie textarea { order: -2; flex: 1 0 100%; box-sizing: border-box; min-width: 0; min-height: 2.75rem; max-height: 12rem; resize: none; padding: 0.625rem 0.25rem; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; font-size: 1rem; line-height: 1.5; field-sizing: content; }
.atl-disc-saisie textarea::placeholder { color: var(--atl-attenue-fort); opacity: 1; }
.atl-disc-emplacements, .atl-disc-emplacements > div, .atl-disc-saisie .atl-bouton-groupe, .atl-disc-saisie .atl-voix, .atl-disc-saisie .atl-voix-ligne { display: contents; }
.atl-disc-saisie .atl-disc-icone, .atl-disc-saisie .atl-disc-envoyer { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 2.75rem; height: 2.75rem; min-height: 2.75rem; padding: 0; border: 0; border-radius: 50%; font: inherit; cursor: pointer; transition: background-color 150ms ease-out, color 150ms ease-out; }
.atl-disc-saisie .atl-disc-icone { background: transparent; color: var(--atl-attenue-fort); }
.atl-disc-saisie .atl-disc-icone:hover:not(:disabled) { background: var(--atl-surface-2); color: var(--atl-texte); }
.atl-disc-saisie .atl-disc-icone[aria-pressed="true"] { background: var(--atl-surface-2); color: var(--atl-danger); }
.atl-disc-saisie .atl-disc-icone[data-variante="danger"] { color: var(--atl-danger); border: 0; }
.atl-disc-saisie .atl-disc-icone:disabled { cursor: not-allowed; opacity: 0.55; }
.atl-disc-saisie .atl-disc-envoyer { margin-left: auto; background: var(--atl-accent); color: var(--atl-accent-texte); }
.atl-disc-saisie .atl-disc-envoyer:hover:not([aria-disabled="true"]) { background: color-mix(in oklab, var(--atl-accent) 86%, var(--atl-fond)); }
.atl-disc-saisie .atl-disc-envoyer[aria-disabled="true"] { background: var(--atl-surface-2); color: var(--atl-attenue-fort); cursor: default; }
.atl-disc-raison { margin-left: auto; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-disc-raison + .atl-disc-envoyer { margin-left: 0; }
.atl-voix-ligne { align-items: center; gap: 0.5rem; }
.atl-voix-ligne [role="status"] { font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-voix-ligne [role="status"][data-etat="inactif"] { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.atl-voix-confirmation { margin: 0.75rem 0 0; padding: 0.75rem 0.875rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface); display: flex; flex-direction: column; gap: 0.5rem; max-width: 36rem; }
.atl-voix-confirmation p { margin: 0; }
.atl-voix-proposition { margin: 0; padding: 0.5rem 0.75rem; background: var(--atl-surface-2); border-radius: calc(var(--atl-rayon) * 0.8); white-space: pre-wrap; overflow-wrap: anywhere; }
.atl-voix-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.atl-voix-actions .atl-bouton { min-height: 2.75rem; }
.atl-voix-transcription { list-style: none; padding: 0; margin: 0.75rem 0 0; display: grid; gap: 0.5rem; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
@media (max-width: 768px) {
  /* Barre de navigation fixe de l'hôte Paperclip (MobileBottomNav : h-16 = 4 rem, plus la zone de sécurité) :
     la zone de saisie reste collée AU-DESSUS d'elle au lieu de passer dessous et de cacher « Envoyer ». */
  .atl-disc { --atl-nav-hote-mobile: calc(4rem + env(safe-area-inset-bottom, 0px)); height: calc(100dvh - 5.5rem); max-width: none; }
  .atl-disc-pied { bottom: var(--atl-nav-hote-mobile); }
  .atl-disc-saisie { margin-bottom: 0.5rem; }
  .atl-disc-bulle { max-width: 92%; }
  .atl-disc-bulle[data-actions="oui"], .atl-disc-bulle[data-carte="oui"] { max-width: 100%; }
  .atl-disc-panneau { padding-left: 0.5rem; }
}
`;
