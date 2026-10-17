/**
 * Texte écrit par un agent (titre d'un livrable, raison d'une alerte, compte ou action d'un appel proposé) : il est
 * inséré dans les messages que l'opérateur lit avant de taper un code. Il ne doit jamais pouvoir ajouter une ligne, refermer
 * un guillemet ou se faire passer pour l'action demandée : on retire les caractères de contrôle (sauts de ligne
 * compris), les caractères de mise en forme invisibles (sens d'écriture, largeur nulle), les guillemets français et
 * droits, on réduit les espaces et on borne la longueur.
 */
export const LONGUEUR_TITRE_MAX = 120;
export const LONGUEUR_RAISON_MAX = 200;

export function nettoyerTexteAgent(texte: unknown, max = LONGUEUR_TITRE_MAX): string {
  if (typeof texte !== "string") return "";
  const net = texte
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, " ")
    .replace(/[«»“”"]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return net.length > max ? `${net.slice(0, max - 1).trimEnd()}…` : net;
}

/** Services dont le contenu n'est pas confié à l'API Cloud hébergée par Meta sans décision explicite du client. */
export const SERVICES_SENSIBLES: ReadonlySet<string> = new Set(["juridique", "ressources-humaines", "juridique-social", "fiscalite", "hse", "conformite", "sav-sinistres"]);

export const estServiceSensible = (slug: string | null | undefined): boolean => typeof slug === "string" && SERVICES_SENSIBLES.has(slug.trim().toLowerCase());

export const TEXTE_CONTENU_SENSIBLE = "contenu sensible : à lire dans l'atelier";
