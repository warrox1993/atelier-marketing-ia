/**
 * Clés de livrable de l'Observatoire : `fiche-<slug>-<fr|en>` et `article-<numero>-<slug>-<fr|en>` (magazine).
 * Source unique : `routes-observatoire.ts` et `services.ts` les importent d'ici.
 */
export const RE_FICHE = /^fiche-([a-z0-9][a-z0-9-]*)-(fr|en)$/u;
export const RE_ARTICLE = /^article-(0|[1-9]\d*)-([a-z0-9][a-z0-9-]*)-(fr|en)$/u;

type Langue = "fr" | "en";
export type CleFiche = { slug: string; langue: Langue };
export type CleArticle = { numero: number; slug: string; langue: Langue };

/** Découpe une clé de fiche ; `null` si la clé n'a pas cette forme. */
export function lireCleFiche(cle: string): CleFiche | null {
  const m = RE_FICHE.exec(cle);
  return m ? { slug: m[1] as string, langue: m[2] as Langue } : null;
}

/** Découpe une clé d'article ; `null` si la clé n'a pas cette forme. */
export function lireCleArticle(cle: string): CleArticle | null {
  const m = RE_ARTICLE.exec(cle);
  return m ? { numero: Number(m[1]), slug: m[2] as string, langue: m[3] as Langue } : null;
}

/** Fiche ou article ; `null` pour tout autre livrable. */
export function lireCleObservatoire(cle: string): ({ type: "fiche" } & CleFiche | { type: "article" } & CleArticle) | null {
  const f = lireCleFiche(cle);
  if (f) return { type: "fiche", ...f };
  const a = lireCleArticle(cle);
  return a ? { type: "article", ...a } : null;
}

export const cleFiche = (slug: string, langue: Langue): string => `fiche-${slug}-${langue}`;
export const cleArticle = (numero: number, slug: string, langue: Langue): string => `article-${numero}-${slug}-${langue}`;
