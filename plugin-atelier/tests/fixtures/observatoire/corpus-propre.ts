/**
 * Corpus propre de l'Observatoire : une Revision française sans aucun défaut.
 * `reglesObservatoire(corpusPropre())` rend [] (SC-002) ; chaque test d'acceptation en part.
 */
import type { Affirmation, PreuveObservatoire, StatutVerification } from "../../../src/contrats/observatoire.js";
import type { EntreesPorteObs } from "../../../src/serveur/observatoire/regles-porte-obs.js";

export const ID = {
  a1: "11111111-1111-4111-8111-111111111111",
  a2: "22222222-2222-4222-8222-222222222222",
  a3: "33333333-3333-4333-8333-333333333333",
  a4: "44444444-4444-4444-8444-444444444444",
  a5: "55555555-5555-4555-8555-555555555555",
  projet: "99999999-9999-4999-8999-999999999999",
  inst1: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  inst2: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  essai1: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  inconnu: "00000000-0000-4000-8000-000000000000",
} as const;

export const URL_DOC = "https://exemple.test/doc";
export const URL_TIERS = "https://blog-tiers.test/post";

export const EXTRAIT_VERSION = "Exemple 1.2.0 est publié";
export const EXTRAIT_DEMARRAGE = "Démarrage en 120 ms selon l'éditeur";

/** Textes normalisés des instantanés du corpus ; sert aussi à calculer la position d'un extrait. */
const TEXTES_INSTANTANES = new Map<string, string>([
  [ID.inst1, "Exemple 1.2.0 est publié. Démarrage en 120 ms selon l'éditeur."],
  [ID.inst2, "Un blog affirme que Exemple 1.2.0 est publié."],
]);

/** La position est l'indice de l'extrait dans le texte normalisé de l'instantané (0 s'il est inconnu ou absent). */
export function preuve(instantaneId: string | null, extraitExact: string, essaiId: string | null = null): PreuveObservatoire {
  const texte = instantaneId === null ? undefined : TEXTES_INSTANTANES.get(instantaneId);
  return { instantaneId, essaiId, extraitExact, position: Math.max(0, texte?.indexOf(extraitExact) ?? 0) };
}

export function affirmation(id: string, chapitre: string, statut: StatutVerification, texte: string, preuves: PreuveObservatoire[], extra: Partial<Affirmation> = {}): Affirmation {
  return {
    id,
    projetId: ID.projet,
    chapitre,
    texte,
    statut,
    confiance: { niveau: 2, motif: "Source relue" },
    versionConcernee: "1.2.0",
    remplaceePar: null,
    preuves,
    ...extra,
  };
}

/** Texte français propre : deux chapitres complets (affirmations citées) et un chapitre « information manquante ». */
export const TEXTE_PROPRE = [
  "# Dossier Exemple",
  "",
  "## Identité et présentation",
  "État : complet",
  "L'outil Exemple est publié en version 1.2.0 [aff:" + ID.a1 + "].",
  "Documentation : " + URL_DOC,
  "",
  "## Performances et benchmarks",
  "État : complet",
  "L'éditeur annonce un démarrage en 120 ms [aff:" + ID.a2 + "].",
  "",
  "## Limites",
  "État : information manquante",
  "Aucune donnée n'est disponible pour l'instant.",
  "",
].join("\n");

/** Chaque appel rend un corpus neuf : les tests peuvent le modifier librement. */
export function corpusPropre(): EntreesPorteObs {
  const p1 = preuve(ID.inst1, EXTRAIT_VERSION);
  const p2 = preuve(ID.inst1, EXTRAIT_DEMARRAGE);
  return {
    revision: { id: "rev-fr-1", langue: "fr", empreinte: "e".repeat(64), baseRevisionFr: null, texte: TEXTE_PROPRE },
    affirmations: [
      affirmation(ID.a1, "ch01", "confirme_doc_officielle", "Exemple est publié en version 1.2.0.", [p1]),
      affirmation(ID.a2, "ch20", "rapporte_editeur", "Démarrage annoncé à 120 ms.", [p2]),
    ],
    preuves: [p1, p2],
    instantanes: new Map([
      [ID.inst1, { texteNormalise: TEXTES_INSTANTANES.get(ID.inst1)!, sourceId: URL_DOC }],
      [ID.inst2, { texteNormalise: TEXTES_INSTANTANES.get(ID.inst2)!, sourceId: URL_TIERS }],
    ]),
    sources: new Set([URL_DOC, URL_TIERS]),
    versionsConnues: new Set(["1.2.0"]),
    essais: new Map(),
    sourcesRefusees: new Set(),
    sourcesPrimaires: new Set([URL_DOC]),
  };
}
