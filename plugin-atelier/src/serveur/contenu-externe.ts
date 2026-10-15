/**
 * Analyse du contenu externe (pages lues, imports) : détection de page
 * d'erreur servie en HTTP 200, détection d'instructions injectées, extraction
 * de texte. Le contenu externe reste une DONNÉE non fiable : il est signalé,
 * jamais exécuté (cahier §14). Fonctions pures.
 */

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

/** Texte visible approximatif d'un HTML (balises retirées, scripts et styles exclus). */
export function texteVisible(html: string): string {
  return html
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

const MOTIFS_INJECTION: ReadonlyArray<[RegExp, string]> = [
  [/ignore[sz]?\s+(?:all\s+|the\s+|any\s+)?(?:previous|prior|above|earlier)\s+instructions/iu, "ignore previous instructions"],
  [/ignore[rz]?\s+(?:toutes\s+)?(?:les|tes|vos)\s+(?:instructions|consignes|r[eè]gles)/iu, "ignore les instructions"],
  [/oublie[rz]?\s+(?:toutes\s+)?(?:les|tes|vos)\s+(?:instructions|consignes)/iu, "oublie les instructions"],
  [/negeer\s+(?:alle\s+)?(?:vorige\s+)?instructies/iu, "negeer instructies"],
  [/\b(?:system prompt|prompt syst[eè]me|instructions? syst[eè]me)\b/iu, "référence au prompt système"],
  [/\byou are now\b|\btu es maintenant\b|\bd[ée]sormais tu\b/iu, "réaffectation de rôle"],
  [/\bpublie[rz]?\b.{0,40}\b(?:ceci|cela|imm[ée]diatement|maintenant|sans validation)\b|\bpublish (?:this|now|immediately)\b/iu, "ordre de publication"],
  [/\b(?:approuve|valide)[rz]?\b.{0,30}\b(?:toi-m[eê]me|automatiquement|sans relecture)\b/iu, "auto-approbation demandée"],
  [/\b(?:curl|wget)\s+https?:\/\/|\brm\s+-rf\b|\bsudo\b|\bchmod\s+\d{3}\b/iu, "commande système"],
  [/<\s*script\b/iu, "balise script"],
  // Début de ligne (drapeau m) et espaces horizontaux seulement : « \s* » franchissait les sauts de
  // ligne et rendait la recherche quadratique sur une suite de lignes vides (ReDoS corrigé).
  [/^[ \t]*(?:assistant|system)[ \t]*:/imu, "faux tour de dialogue"],
];

/** Instructions suspectes repérées dans un contenu externe (signalées, jamais suivies). */
export function injectionsSignalees(texte: string): string[] {
  const trouvees: string[] = [];
  for (const [motif, libelle] of MOTIFS_INJECTION) {
    const m = texte.match(motif);
    if (m) trouvees.push(`${libelle} : « ${m[0].slice(0, 120)} »`);
  }
  return trouvees;
}
