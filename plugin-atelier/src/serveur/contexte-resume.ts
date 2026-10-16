/**
 * Résumé du contexte d'une tâche (`GET /taches/:issueId/contexte`).
 *
 * Le contexte complet pèse 48 à 112 Ko sur une seule ligne : un agent qui n'a que `curl` ne peut ni le
 * lire d'un coup ni le découper. La route renvoie donc par défaut un RÉSUMÉ lisible en un seul `Read`
 * (moins de 40 000 caractères) ; le détail se demande par `?partie=` et le corps d'origine par
 * `?vue=complete`. Fonctions pures : aucune lecture de base ici.
 */
import { erreur } from "./erreurs.js";
import type { ContexteRequete } from "../contrats/api.js";

/** Taille maximale d'une page de livrable, en caractères. */
export const PAGE_LIVRABLE_MAX = 15_000;
/** Plafond de caractères du résumé (vérifié par les tests). */
export const RESUME_MAX = 40_000;

type Dict = Record<string, unknown>;
type Requete = ContexteRequete;

/** Corps complet de la route (forme historique). */
export interface ContexteComplet extends Dict {
  tache: Dict;
  campagne: Dict | null;
  brief: Dict | null;
  exigences: Dict[];
  porte: Dict | null;
  livrable: { revisionId: string; revisionNumber: number | null; titre: string | null; corps: string } | null;
  couvertures: Array<Dict & { code: string; etat: string; preuves: unknown[]; hypotheses: unknown; question: unknown }>;
  verdicts: Array<Dict & { role: string; verdict: string; revisionId: string }>;
  constatsOuverts: Dict[];
  donneesConnexion: Array<Dict & { service: string | null; outil: string | null; mode: string }>;
}

/** Copie sans les identifiants répétés sur chaque objet (l'entreprise, la campagne et la tâche sont déjà connues). */
function sansIdentifiants<T extends Dict>(objet: T, cles: readonly string[]): Dict {
  const copie: Dict = { ...objet };
  for (const c of cles) delete copie[c];
  return copie;
}

export const lignesDe = (corps: string): string[] => corps.split("\n");

/** Titres Markdown (`#` à `######`) hors blocs de code, avec leur numéro de ligne (à partir de 1). */
export function sommaireDe(corps: string): Array<{ ligne: number; titre: string }> {
  const sommaire: Array<{ ligne: number; titre: string }> = [];
  let dansCode = false;
  lignesDe(corps).forEach((texte, i) => {
    if (/^\s*(```|~~~)/u.test(texte)) {
      dansCode = !dansCode;
      return;
    }
    if (dansCode) return;
    // Motif linéaire et ligne bornée : l'ancien motif `(.+?)\s*#*\s*$` reculait en n³ sur un titre suivi
    // de milliers d'espaces et gelait le worker (revue de sécurité du 16/10, C1).
    if (texte.length > 500) return;
    const m = /^#{1,6}[ \t]+(.*)$/u.exec(texte);
    if (!m) return;
    const titre = m[1]!.trimEnd().replace(/#+$/u, "").trimEnd();
    if (titre) sommaire.push({ ligne: i + 1, titre });
  });
  return sommaire;
}

/** Résumé par défaut de la route. */
export function resumer(c: ContexteComplet): Dict {
  const liv = c.livrable;
  const { tache, campagne, brief, exigences, porte, livrable, couvertures, verdicts, constatsOuverts, donneesConnexion, ...reste } = c;
  void livrable;

  const courants = liv ? verdicts.filter((v) => v.revisionId === liv.revisionId) : [];
  const anterieurs = liv ? verdicts.filter((v) => v.revisionId !== liv.revisionId) : verdicts;

  const parClef = new Map<string, number>();
  for (const d of donneesConnexion) {
    const cle = JSON.stringify([d.service, d.outil, d.mode]);
    parClef.set(cle, (parClef.get(cle) ?? 0) + 1);
  }

  return {
    vue: "resume",
    pourAllerPlus:
      "Résumé. Livrable par pages : ?partie=livrable&debut=<ligne>&lignes=<n> (lignes du sommaire) ; " +
      "?partie=verdicts, ?partie=couvertures ou ?partie=donneesConnexion en entier ; ?vue=complete pour le corps complet.",
    tache: sansIdentifiants(tache, ["companyId"]),
    campagne: campagne ? sansIdentifiants(campagne, ["companyId"]) : null,
    brief: brief ? sansIdentifiants(brief, ["companyId", "campagneId", "issueId"]) : null,
    porte: porte ? sansIdentifiants(porte, ["companyId", "issueId"]) : null,
    exigences: exigences.map((e) => sansIdentifiants(e, ["companyId", "campagneId"])),
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
    couvertures: couvertures.map((x) => ({ code: x.code, etat: x.etat, nbPreuves: x.preuves.length, hypotheses: x.hypotheses, question: x.question })),
    verdicts: [
      ...courants.map((v) => sansIdentifiants(v, ["companyId", "issueId", "preuvesVerifiees"])),
      ...anterieurs.map((v) => ({ role: v.role, verdict: v.verdict, revisionId: v.revisionId })),
    ],
    constatsOuverts: constatsOuverts.map((k) => sansIdentifiants(k, ["companyId", "issueId", "reviewer"])),
    donneesConnexion: [...parClef.entries()].map(([cle, nombre]) => {
      const [service, outil, mode] = JSON.parse(cle) as [string | null, string | null, string];
      return { service, outil, mode, nombre };
    }),
    ...reste,
  };
}

/** Réponse d'une partie demandée (`?partie=`). `entree` est le contexte complet. */
export function partie(c: ContexteComplet, q: Requete): Dict {
  switch (q.partie) {
    case "verdicts":
      return { partie: "verdicts", verdicts: c.verdicts };
    case "couvertures":
      return { partie: "couvertures", couvertures: c.couvertures };
    case "donneesConnexion":
      return { partie: "donneesConnexion", donneesConnexion: c.donneesConnexion };
    case "livrable":
      return pageLivrable(c, q);
    default:
      return erreur("entree_invalide", "Partie inconnue.");
  }
}

/** Paramètres de pagination d'un livrable (communs au contexte et au dossier de la tâche). */
export type PaginationLivrable = Pick<ContexteRequete, "debut" | "lignes" | "decalage">;

function pageLivrable(c: ContexteComplet, q: Requete): Dict {
  return pageDuCorps(c.livrable, q);
}

/**
 * Page du livrable : à partir de la ligne `debut` (1 = première), au plus `lignes` lignes et
 * {@link PAGE_LIVRABLE_MAX} caractères. Une ligne plus longue que la page est servie par morceaux
 * (`decalage` = position dans la ligne). Les pages recollées reproduisent exactement le corps.
 * Partagée par le contexte et le dossier de la tâche.
 */
export function pageDuCorps(liv: { revisionId: string; revisionNumber: number | null; corps: string } | null, q: PaginationLivrable): Dict {
  if (!liv) return erreur("introuvable", "Aucun livrable sur cette tâche.");
  const toutes = lignesDe(liv.corps);
  const total = toutes.length;
  const debut = q.debut;
  if (debut > total) return erreur("entree_invalide", `debut=${debut} dépasse le nombre de lignes (${total}).`);
  const maxLignes = q.lignes ?? Number.POSITIVE_INFINITY;

  let texte = "";
  let ligne = debut; // ligne en cours (à partir de 1)
  let decalage = q.decalage;
  let servies = 0;
  while (ligne <= total && servies < maxLignes) {
    const brute = toutes[ligne - 1]!;
    if (decalage > brute.length) return erreur("entree_invalide", `decalage=${decalage} dépasse la ligne ${ligne}.`);
    const avecFin = ligne < total ? `${brute.slice(decalage)}\n` : brute.slice(decalage);
    const place = PAGE_LIVRABLE_MAX - texte.length;
    if (avecFin.length <= place) {
      texte += avecFin;
      servies += 1;
      ligne += 1;
      decalage = 0;
      continue;
    }
    // La ligne ne tient pas : si la page est vide, en servir un morceau ; sinon s'arrêter avant.
    if (texte.length === 0) {
      texte = avecFin.slice(0, PAGE_LIVRABLE_MAX);
      decalage += PAGE_LIVRABLE_MAX;
    }
    break;
  }
  const fini = ligne > total;
  return {
    partie: "livrable",
    revisionId: liv.revisionId,
    revisionNumber: liv.revisionNumber,
    debut,
    decalage: q.decalage,
    lignesServies: servies,
    totalLignes: total,
    longueur: texte.length,
    suivant: fini ? null : { debut: ligne, decalage },
    texte,
  };
}
