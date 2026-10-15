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

/**
 * Retire les commentaires `<!-- … -->` par balayage linéaire (`indexOf`), sans expression régulière
 * à retour arrière. Un commentaire jamais fermé court jusqu'à la fin du texte, comme dans un
 * navigateur : son contenu est retiré du texte et renvoyé comme commentaire.
 */
function retirerCommentaires(texte: string): { texte: string; commentaires: string[] } {
  const commentaires: string[] = [];
  const morceaux: string[] = [];
  let i = 0;
  for (;;) {
    const debut = texte.indexOf("<!--", i);
    if (debut < 0) {
      morceaux.push(texte.slice(i));
      break;
    }
    morceaux.push(texte.slice(i, debut), " ");
    const fin = texte.indexOf("-->", debut + 4);
    const contenu = (fin < 0 ? texte.slice(debut + 4) : texte.slice(debut + 4, fin)).trim();
    if (contenu) commentaires.push(contenu);
    if (fin < 0) break;
    i = fin + 3;
  }
  return { texte: morceaux.join(""), commentaires };
}

/** Titre Markdown sans les `#` de fermeture, par opérations sur la chaîne (aucun motif ambigu). */
function titreMarkdown(ligne: string): string | null {
  const m = /^#{1,6}[ \t]+(.*)$/u.exec(ligne);
  if (!m) return null;
  const brut = (m[1] as string).trim();
  let fin = brut.length;
  while (fin > 0 && (brut[fin - 1] === "#" || brut[fin - 1] === " " || brut[fin - 1] === "\t")) fin -= 1;
  const titre = brut.slice(0, fin);
  return titre || brut || null;
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
    const titre = code ? null : titreMarkdown(ligne);
    // Quantificateurs bornés et sans saut de ligne : temps linéaire même sur « [[[[… » (ReDoS corrigé).
    const nettoyee = ligne
      .replace(/!\[([^\]\n]{0,500})\]\([^)\n]{0,2000}\)/gu, "$1")
      .replace(/\[([^\]\n]{1,500})\]\([^)\n]{0,2000}\)/gu, "$1")
      .replace(/(\*{1,3}|`)/gu, "")
      .replace(/^\s*(?:>\s?|[-*+]\s+)/u, "")
      .trim();
    if (titre) elements.push({ type: "titre", texte: titre.replace(/(\*{1,3}|`)/gu, "").trim() });
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
  return texte.replace(/&(#x[0-9a-f]{1,8}|#\d{1,8}|[a-z]{1,32});/giu, (m, e: string) => {
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
  const texteBrut = (t: string): void => {
    if (!ignore) ligne += t;
  };
  const balise = (fermante: boolean, nomBrut: string, autoFermante: boolean): void => {
    const nom = nomBrut.toLowerCase();
    if (ignore) {
      if (fermante && nom === ignore) ignore = null;
      return;
    }
    if (!fermante && !autoFermante && BALISES_IGNOREES.has(nom)) {
      ignore = nom;
      return;
    }
    if (BALISES_TITRE.test(nom)) {
      fermerLigne();
      titreEnCours = !fermante;
    } else if (BALISES_BLOC.has(nom)) {
      fermerLigne();
    } else if (nom === "td" || nom === "th") {
      ligne += " | ";
    }
  };
  // Balayage linéaire : chaque balise va du « < » au premier « > » (comme l'ancien motif), sans retour
  // arrière ; sans « > » plus loin, le reste est du texte (les « < » isolés sont ignorés).
  let i = 0;
  while (i < texte.length) {
    const lt = texte.indexOf("<", i);
    if (lt < 0) {
      texteBrut(texte.slice(i));
      break;
    }
    if (lt > i) texteBrut(texte.slice(i, lt));
    const gt = texte.indexOf(">", lt + 1);
    if (gt < 0) {
      texteBrut(texte.slice(lt + 1).split("<").join(""));
      break;
    }
    const interieur = texte.slice(lt + 1, gt);
    const m = /^(\/?)([a-zA-Z][a-zA-Z0-9]*)(?![\w])/u.exec(interieur);
    if (m) balise(m[1] === "/", m[2] as string, interieur.endsWith("/"));
    i = gt + 1;
  }
  fermerLigne();
  return { blocs: blocsParTitres(elements, { page: null, feuille: null }), commentaires };
}
