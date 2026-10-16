/**
 * Résumé du dossier d'une tâche (`GET /taches/:issueId/dossier`).
 *
 * Le dossier complet pèse plus de 100 Ko sur une seule ligne (livrable entier, preuves de chaque verdict,
 * corps des sources, aperçus d'appels) : un agent ne peut ni le lire d'un coup ni le découper. La route
 * renvoie donc par défaut un RÉSUMÉ lisible en un seul `Read` (moins de 40 000 caractères) ; le détail se
 * demande par `?partie=` et le corps d'origine par `?vue=complete`. Même modèle que `contexte-resume.ts`,
 * dont la pagination du livrable est réutilisée. Fonctions pures : aucune lecture de base ici.
 */
import type { DossierRequete } from "../contrats/api.js";
import { erreur } from "./erreurs.js";
import { PAGE_LIVRABLE_MAX, RESUME_MAX, lignesDe, pageDuCorps, sommaireDe } from "./contexte-resume.js";

export { PAGE_LIVRABLE_MAX, RESUME_MAX };

type Dict = Record<string, unknown>;

/** Nombre maximal d'éléments d'une liste dans le résumé (le total est toujours donné ; le reste : `?partie=`). */
export const LISTE_RESUME_MAX = 40;

/** Corps complet de la route (forme historique) : seules les clés utilisées par le résumé sont typées. */
export interface DossierComplet extends Dict {
  companyId: string;
  livrable: { revisionId: string; revisionNumber: number; titre: string | null; corps: string } | null;
  constatsResolus: Dict[];
  constatsRestants: Dict[];
  matrice: Array<Dict & { couverture: (Dict & { preuves?: unknown[] }) | null }>;
  sources: Dict[];
  revues: Array<Dict & { revisionId: string; role: string; verdict: string; constats?: unknown[] }>;
  decisions: Dict[];
  diffusions: Dict[];
  appelsProposes: Array<Dict & { apercu?: { resume?: string } }>;
}

function sans(objet: Dict, cles: readonly string[]): Dict {
  const copie: Dict = { ...objet };
  for (const c of cles) delete copie[c];
  return copie;
}

function pick(objet: Dict, cles: readonly string[]): Dict {
  const copie: Dict = {};
  for (const c of cles) if (c in objet) copie[c] = objet[c];
  return copie;
}

/** Les `LISTE_RESUME_MAX` premiers éléments, avec le total et le drapeau `tronque`. */
function borner<T>(liste: T[]): { total: number; tronque: boolean; elements: T[] } {
  return { total: liste.length, tronque: liste.length > LISTE_RESUME_MAX, elements: liste.slice(0, LISTE_RESUME_MAX) };
}

/** Résumé par défaut de la route. */
export function resumerDossier(d: DossierComplet): Dict {
  const liv = d.livrable;
  const { livrable, matrice, sources, revues, decisions, diffusions, appelsProposes, constatsResolus, constatsRestants, ...reste } = d;
  void livrable;

  const sourcesB = borner(sources);
  const decisionsB = borner(decisions);
  const diffusionsB = borner(diffusions);
  const appelsB = borner(appelsProposes);
  const revuesB = borner(revues);

  return {
    vue: "resume",
    pourAllerPlus:
      "Résumé. Livrable par pages : ?partie=livrable&debut=<ligne>&lignes=<n> (lignes du sommaire) ; " +
      "?partie=matrice, revues, sources, decisions, diffusions ou appelsProposes en entier ; ?vue=complete pour le corps complet.",
    ...sans(reste, ["companyId"]),
    constatsResolus: constatsResolus.map((k) => sans(k, ["companyId", "issueId", "reviewer"])),
    constatsRestants: constatsRestants.map((k) => sans(k, ["companyId", "issueId", "reviewer"])),
    livrable: liv
      ? {
          revisionId: liv.revisionId,
          revisionNumber: liv.revisionNumber,
          titre: liv.titre,
          longueur: liv.corps.length,
          lignes: lignesDe(liv.corps).length,
          sommaire: sommaireDe(liv.corps),
        }
      : null,
    // Matrice : exigence et verdicts par rôle ; la couverture est réduite (le détail des preuves : ?partie=matrice).
    matrice: matrice.map((m) => ({
      ...m,
      exigence: m["exigence"] && typeof m["exigence"] === "object" ? sans(m["exigence"] as Dict, ["companyId", "campagneId"]) : m["exigence"],
      couverture: m.couverture
        ? { ...pick(m.couverture, ["code", "revisionId", "etat", "hypotheses", "question"]), nbPreuves: m.couverture.preuves?.length ?? 0 }
        : null,
    })),
    // Revues : la révision courante en entier sauf les preuves vérifiées et les constats (listés par ailleurs) ;
    // les révisions antérieures réduites à {role, verdict, revisionId}.
    revues: {
      total: revuesB.total,
      tronque: revuesB.tronque,
      elements: revuesB.elements.map((v) => {
        if (!liv || v.revisionId !== liv.revisionId) return pick(v, ["role", "verdict", "revisionId"]);
        return { ...sans(v, ["companyId", "issueId", "preuvesVerifiees", "constats"]), nbConstats: v.constats?.length ?? 0 };
      }),
    },
    sources: {
      total: sourcesB.total,
      tronque: sourcesB.tronque,
      elements: sourcesB.elements.map((s) => sans(s, ["companyId", "extrait"])),
    },
    decisions: {
      total: decisionsB.total,
      tronque: decisionsB.tronque,
      elements: decisionsB.elements.map((x) => sans(x, ["companyId", "issueId", "portee"])),
    },
    diffusions: {
      total: diffusionsB.total,
      tronque: diffusionsB.tronque,
      elements: diffusionsB.elements.map((x) => sans(x, ["companyId", "issueId", "preuveApprobation"])),
    },
    appelsProposes: {
      total: appelsB.total,
      tronque: appelsB.tronque,
      elements: appelsB.elements.map((a) => ({ ...sans(a, ["apercu", "arguments"]), resume: a.apercu?.resume ?? null })),
    },
  };
}

/** Réponse d'une partie demandée (`?partie=`). `d` est le dossier complet. */
export function partieDossier(d: DossierComplet, q: DossierRequete): Dict {
  switch (q.partie) {
    case "livrable":
      return pageDuCorps(d.livrable, q);
    case "matrice":
    case "sources":
    case "revues":
    case "decisions":
    case "diffusions":
    case "appelsProposes":
      return { partie: q.partie, [q.partie]: d[q.partie] };
    default:
      return erreur("entree_invalide", "Partie inconnue.");
  }
}
