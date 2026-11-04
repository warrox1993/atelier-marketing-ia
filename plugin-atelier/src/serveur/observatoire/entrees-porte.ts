/**
 * Entrées OBS de la porte (tâche 9) : construites depuis le livrable natif et le dépôt de l'Observatoire.
 * Le livrable cite ses affirmations par `[aff:<id>]` (convention de regles-porte-obs.ts).
 * Un identifiant cité introuvable n'est pas dans `affirmations` : OBS-16 le refuse.
 */
import { createHash } from "node:crypto";
import type { Affirmation, PreuveObservatoire } from "../../contrats/observatoire.js";
import type { baseObservatoire } from "./base-observatoire.js";
import type { EntreesPorteObs } from "./regles-porte-obs.js";

type BaseObs = ReturnType<typeof baseObservatoire>;

const RE_CITATION = /\[aff:([^\]\s]+)\]/gu;
const RE_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Identifiants `[aff:<id>]` du corps, sans doublon, dans l'ordre d'apparition. */
export function idsAffirmationsCitees(corps: string): string[] {
  return [...new Set([...corps.matchAll(RE_CITATION)].map((m) => m[1] as string))];
}

/** Révision française courante d'un même slug, telle que lue dans les documents de la tâche. */
export type RevisionFrancaise = { revisionId: string; corps: string };

export const RE_BASE_FR = /^base_revision_fr:[ \t]*(\S+)[ \t]*$/mu;

/**
 * Base française d'une révision anglaise (OBS-08, OBS-09). La révision anglaise déclare la révision française dont elle
 * dérive par une ligne `base_revision_fr: <id de révision>` (même nom que l'en-tête de la fiche exportée).
 * Sans révision française : `null` (OBS-08 refuse, côté sûr). Sans déclaration : base « inconnue », donc périmée.
 */
export function baseRevisionFrancaise(corpsEn: string, fr: RevisionFrancaise | null) {
  if (!fr) return null;
  return {
    id: fr.revisionId,
    empreinteActuelle: fr.revisionId,
    empreinteTraduite: RE_BASE_FR.exec(corpsEn)?.[1] ?? "inconnue",
    texte: fr.corps,
  };
}

export const empreinteTexte = (corps: string): string => createHash("sha256").update(corps).digest("hex");

/**
 * OBS-15 (O1) : toute source citée sans `politique_collecte.autorisee` explicite est refusée, y compris une source hors des
 * listes (aucune décision connue). shortcut: autorisation booléenne posée par les routes humaines, en attendant la
 * décision de droits K4 (longueur d'extrait par source) ; `essais` vide : essais en P1.
 */
export async function entreesObservatoire(
  base: Pick<BaseObs, "affirmationsParIds" | "sourcesDuProjet" | "sourcesCommunes" | "versionsConnues" | "preuvesDe" | "instantanesParIds" | "listerAlias">,
  companyId: string,
  revision: { id: string; corps: string; langue?: "fr" | "en"; baseRevisionFr?: EntreesPorteObs["revision"]["baseRevisionFr"] },
): Promise<EntreesPorteObs> {
  // Un identifiant qui n'est pas un GUID ne peut pas exister en base : on ne l'envoie pas à la requête.
  const ids = idsAffirmationsCitees(revision.corps).filter((i) => RE_GUID.test(i));
  const brutes = await base.affirmationsParIds(companyId, ids);
  const projetIds = [...new Set(brutes.map((a) => a.projetId))];

  // O9 : une requête pour toutes les preuves, une pour leurs instantanés distincts.
  const preuvesParAff = new Map<string, PreuveObservatoire[]>(brutes.map((a) => [a.id, []]));
  const preuves = await base.preuvesDe(companyId, brutes.map((a) => a.id));
  for (const p of preuves) preuvesParAff.get(p.affirmationId)?.push({ instantaneId: p.instantaneId, essaiId: p.essaiId, extraitExact: p.extraitExact, position: p.position });
  const idsInstantanes = [...new Set(preuves.flatMap((p) => (p.instantaneId ? [p.instantaneId] : [])))];
  const instantanes = new Map<string, { texteNormalise: string; sourceId: string }>();
  for (const inst of await base.instantanesParIds(companyId, idsInstantanes)) instantanes.set(inst.id, { texteNormalise: inst.texteNormalise, sourceId: inst.sourceId });

  // Une source se cite par son identifiant (preuve) ou par son URL canonique (lien dans le texte).
  const sources = new Set<string>();
  const sourcesPrimaires = new Set<string>();
  const autorisees = new Set<string>();
  const limitesSources = new Map<string, { extraitMax: number | null; cumulMax: number | null }>();
  const sourcesSansAuteur = new Set<string>();
  // Sources des projets cités, puis base commune de l'entreprise (actives seulement), citable par tout article.
  // T6 : l'URL d'une source commune n'est citable dans le texte que si une preuve de la révision s'appuie sur un de ses instantanés.
  const prouvees = new Set([...instantanes.values()].map((i) => i.sourceId));
  const parProjet = await Promise.all(projetIds.map((p) => base.sourcesDuProjet(companyId, p)));
  const duProjet = parProjet.flat();
  // SPEC-E6 : la primaire d'un projet ne vaut que pour ses affirmations ; celles de la base commune valent pour toutes.
  // shortcut: une source commune n'est rattachée à aucun éditeur, sa primauté reste globale ; champ éditeur sur la source si un faux cas apparaît.
  const sourcesPrimairesParProjet = new Map(projetIds.map((p, i) => [p, new Set(parProjet[i]!.filter((s) => s.type === "primaire").map((s) => s.id))]));
  const communes = await base.sourcesCommunes(companyId);
  for (const s of [...duProjet, ...communes]) {
    sources.add(s.id);
    if (duProjet.some((x) => x.id === s.id) || prouvees.has(s.id)) sources.add(s.urlCanonique);
    if (s.type === "primaire" && communes.includes(s)) sourcesPrimaires.add(s.id);
    if (s.autorisee) autorisees.add(s.id);
    limitesSources.set(s.id, { extraitMax: s.extraitMax ?? null, cumulMax: s.cumulMax ?? null });
    if (!s.auteur) sourcesSansAuteur.add(s.id);
  }

  const affirmations = brutes.map((a): Affirmation => ({
    id: a.id,
    projetId: a.projetId,
    chapitre: a.chapitre,
    texte: a.texte,
    statut: a.statut as Affirmation["statut"],
    confiance: { niveau: a.confiance, motif: a.confianceMotif },
    versionConcernee: a.versionConcernee,
    remplaceePar: a.remplaceePar,
    preuves: preuvesParAff.get(a.id) ?? [],
  }));

  // SPEC-E4 (OBS-09) : glossaire protégé = alias « nom » des projets cités (noms de produit, jamais traduits), pris avec
  // la casse de leur occurrence dans le français (l'alias est en minuscules) ; le nom du projet n'en fait pas partie,
  // celui d'un article est son titre français.
  const fr = revision.baseRevisionFr ?? null;
  const frMinuscules = fr?.texte?.toLowerCase() ?? "";
  const noms = fr?.texte ? (await Promise.all(projetIds.map((p) => base.listerAlias(companyId, p)))).flat().filter((a) => a.type === "nom") : [];
  const glossaireProtege = [...new Set(noms.flatMap((a) => {
    const i = frMinuscules.indexOf(a.valeur);
    return i < 0 ? [] : [fr!.texte!.slice(i, i + a.valeur.length)];
  }))];

  return {
    revision: { id: revision.id, langue: revision.langue ?? "fr", empreinte: empreinteTexte(revision.corps), baseRevisionFr: fr && { ...fr, glossaireProtege }, texte: revision.corps },
    affirmations,
    preuves: [],
    instantanes,
    sources,
    sourcesPrimaires,
    sourcesPrimairesParProjet,
    versionsConnues: new Set(await base.versionsConnues(companyId, projetIds)),
    essais: new Map(),
    limitesSources,
    sourcesSansAuteur,
    sourcesRefusees: new Set([...instantanes.values()].map((i) => i.sourceId).filter((id) => !autorisees.has(id))),
  };
}
