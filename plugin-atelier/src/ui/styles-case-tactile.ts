/**
 * Case à cocher dont la zone tactile mesure 44 px (2,75 rem) : le contrôle lui-même est la cible, pas seulement son
 * étiquette. Le carré dessiné garde 1,25 rem, centré dans la cible. Partagée par les réglages du chat et le tiroir
 * « Agents en service » (états coché, partiel `:indeterminate`, désactivé, focus clavier). Jetons `--atl-*`.
 */
export const STYLES_CASE_TACTILE = `
.atl-case-tactile { appearance: none; -webkit-appearance: none; flex: none; display: grid; place-content: center; width: 2.75rem; height: 2.75rem; margin: 0; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; }
.atl-case-tactile::before, .atl-case-tactile::after { content: ""; grid-area: 1 / 1; }
.atl-case-tactile::before { width: 1.25rem; height: 1.25rem; box-sizing: border-box; border: 2px solid var(--atl-attenue-fort); border-radius: 0.3125rem; background: var(--atl-fond); transition: background-color 150ms ease-out, border-color 150ms ease-out; }
.atl-case-tactile::after { width: 0.3125rem; height: 0.625rem; border: solid var(--atl-accent-texte); border-width: 0 2px 2px 0; transform: translateY(-1px) rotate(45deg) scale(0); transition: transform 150ms ease-out; }
.atl-case-tactile:hover:not(:disabled)::before { border-color: var(--atl-texte); }
.atl-case-tactile:checked::before, .atl-case-tactile:indeterminate::before { background: var(--atl-accent); border-color: var(--atl-accent); }
.atl-case-tactile:checked::after { transform: translateY(-1px) rotate(45deg) scale(1); }
.atl-case-tactile:indeterminate::after { width: 0.5625rem; height: 0; border-width: 0 0 2px 0; transform: none; }
.atl-case-tactile:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: -2px; border-radius: 0.5rem; }
.atl-case-tactile:disabled { cursor: not-allowed; opacity: 0.55; }
@media (prefers-reduced-motion: reduce) { .atl-case-tactile::before, .atl-case-tactile::after { transition: none; } }
`;
