/**
 * Extraction des formats textuels : Markdown, texte brut, HTML (lot R2).
 *
 * Le HTML n'est jamais exécuté ni chargé : c'est un simple parcours de balises. Les commentaires
 * (`<!-- … -->`) sont retirés du texte mais renvoyés à part, car ils servent à cacher des consignes.
 */
import type { BlocTexte } from "./decoupage.js";
import { nettoyerTexte } from "./normalisation.js";

type Element = { type: "titre" | "texte"; texte: string };

export interface TexteStructure {
  blocs: BlocTexte[];
  /** Contenus de commentaires HTML retirés (à passer au détecteur de consignes cachées). */
  commentaires: string[];
}

/** Assemble des éléments en blocs : un nouveau bloc commence à chaque titre. */
export function blocsParTitres(elements: readonly Element[], meta: { page: number | null; feuille: string | null }, titreInitial: string | null = null): BlocTexte[] {
  const blocs: BlocTexte[] = [];
  let titre = titreInitial;
  let lignes: string[] = [];
  const vider = (): void => {
    const texte = lignes.join("\n").trim();
    if (texte) blocs.push({ texte, page: meta.page, feuille: meta.feuille, titre });
    lignes = [];
  };
  for (const e of elements) {
    if (e.type === "titre") {
      vider();
      titre = e.texte;
    }
    lignes.push(e.texte);
  }
  vider();
  return blocs;
}

function retirerCommentaires(texte: string): { texte: string; commentaires: string[] } {
  const commentaires: string[] = [];
  const sans = texte.replace(/<!--([\s\S]*?)-->/gu, (_m, c: string) => {
    const t = c.trim();
    if (t) commentaires.push(t);
    return " ";
  });
  return { texte: sans, commentaires };
}

export function extraireTexteBrut(texte: string): TexteStructure {
  const propre = nettoyerTexte(texte);
  return { blocs: blocsParTitres(propre.split("\n").map((t) => ({ type: "texte" as const, texte: t })), { page: null, feuille: null }), commentaires: [] };
}

export function extraireMarkdown(brut: string): TexteStructure {
  const { texte, commentaires } = retirerCommentaires(brut);
  const elements: Element[] = [];
  let code = false;
  for (const ligne of nettoyerTexte(texte).split("\n")) {
    if (/^\s*(```|~~~)/u.test(ligne)) {
      code = !code;
      continue;
    }
    const titre = code ? null : /^#{1,6}\s+(.+?)\s*#*\s*$/u.exec(ligne);
    const nettoyee = ligne
      .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
      .replace(/(\*{1,3}|`)/gu, "")
      .replace(/^\s*(?:>\s?|[-*+]\s+)/u, "")
      .trim();
    if (titre) elements.push({ type: "titre", texte: (titre[1] as string).replace(/(\*{1,3}|`)/gu, "").trim() });
    else if (nettoyee) elements.push({ type: "texte", texte: nettoyee });
  }
  return { blocs: blocsParTitres(elements, { page: null, feuille: null }), commentaires };
}

const ENTITES: Readonly<Record<string, string>> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", hellip: "…",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç", ocirc: "ô", ucirc: "û",
  icirc: "î", euml: "ë", iuml: "ï", oelig: "œ", euro: "€", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘",
};

function decoderEntites(texte: string): string {
  return texte.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (m, e: string) => {
    if (e.startsWith("#")) {
      const n = e[1]?.toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    }
    return ENTITES[e.toLowerCase()] ?? m;
  });
}

const BALISES_IGNOREES = new Set(["script", "style", "noscript", "template", "svg", "head", "iframe", "object", "embed"]);
const BALISES_BLOC = new Set([
  "p", "div", "li", "tr", "br", "section", "article", "header", "footer", "main", "aside", "nav", "table", "ul", "ol",
  "blockquote", "pre", "hr", "dl", "dt", "dd", "figcaption", "form", "fieldset", "caption",
]);
const BALISES_TITRE = /^h[1-6]$/u;

export function extraireHtml(brut: string): TexteStructure {
  const { texte, commentaires } = retirerCommentaires(brut);
  const elements: Element[] = [];
  let ligne = "";
  let titreEnCours = false;
  let ignore: string | null = null;
  const fermerLigne = (): void => {
    const t = nettoyerTexte(decoderEntites(ligne));
    ligne = "";
    if (!t) return;
    for (const morceau of t.split("\n")) if (morceau.trim()) elements.push({ type: titreEnCours ? "titre" : "texte", texte: morceau.trim() });
  };
  const jetons = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>|<[^>]*>|[^<]+|</gu;
  for (const m of texte.matchAll(jetons)) {
    const [entier, fermante, nomBrut, autoFermante] = m;
    if (nomBrut === undefined) {
      if (!ignore && !entier.startsWith("<")) ligne += entier;
      continue;
    }
    const nom = nomBrut.toLowerCase();
    if (ignore) {
      if (fermante && nom === ignore) ignore = null;
      continue;
    }
    if (!fermante && !autoFermante && BALISES_IGNOREES.has(nom)) {
      ignore = nom;
      continue;
    }
    if (BALISES_TITRE.test(nom)) {
      fermerLigne();
      titreEnCours = !fermante;
    } else if (BALISES_BLOC.has(nom)) {
      fermerLigne();
    } else if (nom === "td" || nom === "th") {
      ligne += " | ";
    }
  }
  fermerLigne();
  return { blocs: blocsParTitres(elements, { page: null, feuille: null }), commentaires };
}
