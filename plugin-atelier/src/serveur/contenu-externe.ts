/**
 * Analyse du contenu externe (pages lues, imports) : détection de page
 * d'erreur servie en HTTP 200, détection d'instructions injectées, extraction
 * de texte. Le contenu externe reste une DONNÉE non fiable : il est signalé,
 * jamais exécuté (cahier §14). Fonctions pures.
 */
import motifsInjection from "./motifs-injection.json" with { type: "json" };

const MOTIFS_PAGE_ERREUR: ReadonlyArray<[RegExp, string]> = [
  [/\b404\b/iu, "mention 404"],
  [/page (?:introuvable|non trouv[ée]e|inexistante)/iu, "page introuvable"],
  [/cette page n['’]existe (?:pas|plus)/iu, "page inexistante"],
  [/page (?:not found|could not be found)|not found/iu, "not found"],
  [/the page you (?:requested|are looking for)/iu, "page demandée absente"],
  [/pagina (?:niet gevonden|bestaat niet)/iu, "page introuvable (NL)"],
  [/\b(?:500|502|503)\b.{0,40}(?:erreur|error|fout)|(?:erreur|error) (?:interne|du serveur)|internal server error|service (?:indisponible|unavailable)/iu, "erreur serveur"],
  [/acc[eè]s (?:refus[ée]|interdit)|access denied|forbidden/iu, "accès refusé"],
  [/(?:domaine|domain|nom de domaine).{0,30}(?:[àa] vendre|for sale)|parked domain|domain parking/iu, "domaine parqué"],
  [/(?:maintenance en cours|site en maintenance|under maintenance)/iu, "maintenance"],
];

// V2-2 : largeur nulle et espaces invisibles (U+00AD, U+034F, U+180E, U+200B-U+200F, U+2060-U+2064, U+FEFF), contrôles
// bidirectionnels (U+061C, U+202A-U+202E, U+2066-U+2069), balises (U+E0000-U+E007F) : ils cachent une consigne à l'œil humain
// ou coupent un motif d'injection. Même liste que passerelle/src/reel/extraction/contenu-tiers.ts (parité testée).
const INVISIBLES = /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}]/gu;

/** Texte sans caractères invisibles, et nombre de caractères retirés. */
export function retirerInvisibles(texte: string): { texte: string; retires: number } {
  let retires = 0;
  const propre = texte.replace(INVISIBLES, () => { retires++; return ""; });
  return { texte: propre, retires };
}

/** Signalement à joindre aux injections quand des caractères invisibles ont été retirés d'un contenu externe. */
export const signalementInvisibles = (brut: string): string[] => {
  const { retires } = retirerInvisibles(brut);
  return retires ? [`caractères invisibles retirés : ${retires}`] : [];
};

/** Texte visible approximatif d'un HTML (balises retirées, scripts et styles exclus, caractères invisibles retirés). */
export function texteVisible(html: string): string {
  return retirerInvisibles(html).texte
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&quot;/giu, '"')
    .replace(/\s+/gu, " ")
    .trim();
}

export function titreHtml(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu);
  return m?.[1] ? texteVisible(m[1]).slice(0, 300) || null : null;
}

/**
 * Indices de page d'erreur malgré un HTTP 200 : titre ou premier titre de
 * page qui annonce une erreur, texte presque vide, URL finale de type 404.
 * Le corps entier n'est pas utilisé pour éviter les faux positifs d'un
 * article qui parle d'erreurs.
 */
export function indicesPageErreur(entree: { corps: string; typeContenu: string | null; urlFinale: string }): string[] {
  const indices: string[] = [];
  const html = /html|xml/iu.test(entree.typeContenu ?? "") || /<html|<body|<title/iu.test(entree.corps.slice(0, 2000));
  const texte = html ? texteVisible(entree.corps) : entree.corps.trim();
  const titre = html ? titreHtml(entree.corps) ?? "" : "";
  const h1 = html ? texteVisible(entree.corps.match(/<h1[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? "") : "";
  const zone = `${titre} | ${h1} | ${texte.slice(0, 400)}`;
  for (const [motif, libelle] of MOTIFS_PAGE_ERREUR) {
    if (motif.test(titre) || motif.test(h1) || (texte.length < 1500 && motif.test(zone))) indices.push(libelle);
  }
  if (texte.length < 40) indices.push("contenu presque vide");
  try {
    const chemin = new URL(entree.urlFinale).pathname.toLowerCase();
    if (/(?:^|\/)(?:404|not-found|notfound|page-introuvable|erreur)(?:\.html?)?(?:\/|$)/u.test(chemin)) indices.push("URL finale de page d'erreur");
  } catch {
    /* URL déjà validée en amont */
  }
  return [...new Set(indices)];
}

// Source unique : motifs-injection.json, recopié aussi par le générateur (scripts/bootstrap-organisation.py) à côté
// du hook qui contrôle la mémoire des agents (organisation/hooks/garde-memoire.mjs, revue du 18/10/2026, M4) : le même
// détecteur, sans copie à la main. Le motif « faux tour de dialogue » est ancré en début de ligne (drapeau m) avec des
// espaces horizontaux seulement : « \s* » franchissait les sauts de ligne et rendait la recherche quadratique (ReDoS corrigé).
export const MOTIFS_INJECTION: ReadonlyArray<[RegExp, string]> = motifsInjection.motifs.map((m) => [new RegExp(m.source, m.drapeaux), m.libelle]);

/** Instructions suspectes repérées dans un contenu externe (signalées, jamais suivies). */
export function injectionsSignalees(texte: string): string[] {
  const trouvees: string[] = [];
  const propre = retirerInvisibles(texte).texte; // un invisible au milieu d'un motif ne le cache plus
  for (const [motif, libelle] of MOTIFS_INJECTION) {
    const m = propre.match(motif);
    if (m) trouvees.push(`${libelle} : « ${m[0].slice(0, 120)} »`);
  }
  return trouvees;
}
