/**
 * Conversion d'une page HTML en Markdown simple, pour importer une page web publique dans les
 * connaissances : titres en `#`, listes en `-`, paragraphes séparés, texte seul pour le reste.
 *
 * - Les blocs `script`, `style`, `noscript`, `template`, `svg`, `iframe`, `head`, `nav` et `footer`
 *   sont retirés avec leur contenu ; les commentaires aussi.
 * - Si la page a un bloc `main`, seul celui-ci est gardé.
 * - Parcours sans retour arrière exponentiel : la regex de balise est non ambiguë (le nom doit être suivi
 *   d'un blanc, d'un `/` ou de `>`) et la balise ouverte finale est cherchée par `lastIndexOf`. Le coût
 *   reste borné ; l'appelant limite en plus la taille convertie (512 Ko) pour une page volontairement piégée.
 * - Le résultat reste une DONNÉE à citer : aucune balise ne survit, rien n'est exécuté.
 */

const BLOCS_RETIRES = ["script", "style", "noscript", "template", "svg", "iframe", "head", "nav", "footer"] as const;

const ENTITES: Readonly<Record<string, string>> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', laquo: "«", raquo: "»",
  hellip: "...", ndash: "-", mdash: "-", euro: "€", eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", agrave: "à", acirc: "â", ccedil: "ç",
  icirc: "î", iuml: "ï", ocirc: "ô", ugrave: "ù", ucirc: "û", uuml: "ü", Eacute: "É", Egrave: "È", Agrave: "À", Ccedil: "Ç", deg: "°", copy: "©",
  middot: "·", bull: "•", times: "×", oelig: "œ",
};

/** Décode les entités nommées courantes et numériques ; une entité inconnue reste telle quelle. */
export function decoderEntites(texte: string): string {
  return texte.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,9});/giu, (tout, nom: string) => {
    if (nom.startsWith("#")) {
      const code = nom[1] === "x" || nom[1] === "X" ? Number.parseInt(nom.slice(2), 16) : Number.parseInt(nom.slice(1), 10);
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return " ";
      return String.fromCodePoint(code);
    }
    return ENTITES[nom] ?? tout;
  });
}

/** Minuscules ASCII seulement : la longueur ne change jamais, les positions restent alignées sur l'original. */
const basAscii = (s: string) => s.replace(/[A-Z]/gu, (c) => c.toLowerCase());

/** Retire les blocs `<balise>…</balise>` en un seul passage ; une balise jamais refermée n'enlève que son ouverture. */
function retirerBloc(html: string, bas: string, balise: string): { html: string; bas: string } {
  let sortie = "";
  let position = 0;
  let curseur = 0;
  let sansFermeture = false;
  const ouverture = `<${balise}`;
  for (;;) {
    const debut = bas.indexOf(ouverture, curseur);
    if (debut < 0) break;
    const suivant = bas[debut + ouverture.length] ?? ">";
    if (!/[\s>/]/u.test(suivant)) {
      curseur = debut + ouverture.length;
      continue;
    }
    const finOuverture = bas.indexOf(">", debut);
    const fermeture = sansFermeture ? -1 : bas.indexOf(`</${balise}`, debut);
    if (fermeture < 0) {
      sansFermeture = true;
      sortie += html.slice(position, debut);
      position = finOuverture < 0 ? html.length : finOuverture + 1;
      curseur = position;
      continue;
    }
    const finFermeture = bas.indexOf(">", fermeture);
    sortie += html.slice(position, debut) + " ";
    position = finFermeture < 0 ? html.length : finFermeture + 1;
    curseur = position;
  }
  sortie += html.slice(position);
  return { html: sortie, bas: basAscii(sortie) };
}

function contenuPrincipal(html: string, bas: string): string {
  const debut = bas.search(/<main[\s>]/u);
  if (debut < 0) return html;
  const fin = bas.indexOf("</main", debut);
  const extrait = html.slice(debut, fin < 0 ? undefined : fin);
  // Un `main` quasi vide (page mal construite) ne remplace pas la page entière.
  return extrait.replace(/<[^<>]*>/gu, " ").trim().length >= 80 ? extrait : html;
}

const BLOCS_A_LIGNE = new Set(["p", "div", "section", "article", "ul", "ol", "table", "tr", "blockquote", "pre", "dl", "dt", "dd", "header", "figure", "figcaption", "aside", "form", "fieldset", "address", "main"]);

/** Retire une balise restée ouverte en fin de texte (dernier `<` sans `>` après), sans expression régulière. */
function retirerBaliseOuverte(reste: string): string {
  const i = reste.lastIndexOf("<");
  return i >= 0 && reste.indexOf(">", i) < 0 ? reste.slice(0, i) : reste;
}

export function htmlVersMarkdown(brut: string): string {
  let html = brut.replace(/<!--[\s\S]*?(?:-->|$)/gu, " ");
  let bas = basAscii(html);
  for (const balise of BLOCS_RETIRES) ({ html, bas } = retirerBloc(html, bas, balise));
  html = contenuPrincipal(html, bas);

  const balise = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?=[\s/>])([^<>]*)>/gu;
  let sortie = "";
  let dernier = 0;
  for (let m = balise.exec(html); m !== null; m = balise.exec(html)) {
    const texte = html.slice(dernier, m.index).replace(/\s+/gu, " ");
    sortie += decoderEntites(texte);
    dernier = m.index + m[0].length;
    const ferme = m[1] === "/";
    const nom = (m[2] ?? "").toLowerCase();
    const titre = /^h([1-6])$/u.exec(nom);
    if (titre) sortie += ferme ? "\n\n" : `\n\n${"#".repeat(Number(titre[1]))} `;
    else if (nom === "br") sortie += "\n";
    else if (nom === "li") sortie += ferme ? "\n" : "\n- ";
    else if (nom === "td" || nom === "th") sortie += ferme ? " | " : "";
    else if (BLOCS_A_LIGNE.has(nom)) sortie += "\n";
  }
  sortie += decoderEntites(retirerBaliseOuverte(html.slice(dernier)).replace(/\s+/gu, " "));

  return sortie
    .split("\n")
    .map((l) => l.replace(/[ \t]+/gu, " ").replace(/\s*\|\s*$/u, "").trim())
    .filter((l, i, tout) => l !== "" || (i > 0 && tout[i - 1] !== ""))
    .join("\n")
    .replace(/^#{1,6}\s*$/gmu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}
