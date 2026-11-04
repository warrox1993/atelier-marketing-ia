/** Identités de projets (K3) : alias canoniques et résolution vers un projet (FR-009). */

export type Alias = { type: "github" | "npm" | "pypi" | "site" | "nom"; valeur: string };

/** URL déclarée d'un site, complète (chemin et requête gardés), sans fragment ; lève si elle est illisible. */
export function urlSiteDeclaree(valeur: string): string {
  const brut = valeur.trim();
  const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(brut) ? brut : `https://${brut}`);
  u.hash = "";
  return u.pathname === "/" && !u.search ? u.origin : u.href;
}

function canoniserSite(valeur: string): string {
  const brut = valeur.trim();
  try {
    return new URL(urlSiteDeclaree(brut)).origin;
  } catch {
    return brut.toLowerCase().replace(/\/+$/, "");
  }
}

function canoniserGithub(valeur: string): string {
  return valeur
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .toLowerCase();
}

export function canoniserAlias(a: Alias): Alias {
  switch (a.type) {
    case "github":
      return { type: "github", valeur: canoniserGithub(a.valeur) };
    case "npm":
      return { type: "npm", valeur: a.valeur.trim().toLowerCase() };
    case "pypi":
      return { type: "pypi", valeur: a.valeur.trim().toLowerCase() };
    case "site":
      return { type: "site", valeur: canoniserSite(a.valeur) };
    case "nom":
      return {
        type: "nom",
        valeur: a.valeur.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC").trim().toLowerCase().replace(/\s+/g, " "),
      };
  }
}

const cle = (a: Alias): string => {
  const c = canoniserAlias(a);
  return `${c.type}:${c.valeur}`;
};

/** Conflit si les alias connus désignent au moins deux projets différents. */
export function resoudreProjet(
  alias: Alias[],
  existants: ReadonlyArray<{ projetId: string; alias: Alias }>,
): { projetId: string | null; conflit: boolean } {
  const recherches = new Set(alias.map(cle));
  const projets = new Set(existants.filter((e) => recherches.has(cle(e.alias))).map((e) => e.projetId));
  if (projets.size > 1) return { projetId: null, conflit: true };
  return { projetId: projets.values().next().value ?? null, conflit: false };
}
