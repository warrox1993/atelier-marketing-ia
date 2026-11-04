/**
 * Dossier du sujet (option B, 30/10/2026) : garde déterministe « pas de fabrication d'image ni de vidéo sans
 * dossier du sujet sourcé ». `controlerDossierSujet` est PURE : le texte du dossier est une donnée, aucune
 * instruction qu'il contient ne change le résultat. `creerRechercheDossierSujet` retrouve le document
 * `dossier-sujet` (tâche du run, puis tâches qui la bloquent, puis tâche parente, puis ses sœurs) et le contrôle.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";

export const CLE_DOCUMENT_DOSSIER_SUJET = "dossier-sujet" as const;
export const RUBRIQUES_DOSSIER = ["Sujet", "Faits vérifiés", "Vocabulaire et références du public", "Ton", "À ne pas dire", "Droits"] as const;
export const TAILLE_MAX_DOSSIER_OCTETS = 100 * 1024;
export const LIGNES_FAITS_MAX = 200;
export const FAITS_MIN = 3;
export const EXTRAIT_MIN_CARACTERES = 20;
export const REFUS_AUCUN_DOSSIER = "Aucun dossier du sujet : demander au coordinateur la sous-tâche Dossier du sujet (veille)";

const ENTETE_FAITS = ["fait", "source", "extrait"];
const PREFIXE_CONNAISSANCE = "connaissance://";
const SEPARATEUR_TABLEAU = /^:?-{3,}:?$/u;
const GUILLEMETS = /^["'«»“”‘’\s]+|["'«»“”‘’\s]+$/gu;

export type ModeDossier = "demonstration" | "reel";

/** Source de la tâche qui porte le dossier (champs de `base.listerSources`). */
export interface SourceDossier {
  url: string;
  statutAcces: string;
  mode: ModeDossier;
  extrait: string | null;
}

export interface ControleDossier {
  ok: boolean;
  defauts: string[];
  avertissements: string[];
  /** Rubriques `##` exactes présentes et non vides. */
  rubriques: string[];
}

const espaces = (s: string) => s.replace(/\s+/gu, " ").trim();
const cellules = (ligne: string) =>
  ligne
    .trim()
    .replace(/^\|/u, "")
    .replace(/(?<!\\)\|$/u, "")
    .split(/(?<!\\)\|/u)
    .map((c) => c.replace(/\\\|/gu, "|").trim());

/** Rubriques `##` (hors blocs de code) : nom -> lignes du contenu. Un nom en double est signalé. */
function decouper(corps: string): { rubriques: Map<string, string[]>; doubles: string[] } {
  const rubriques = new Map<string, string[]>();
  const doubles: string[] = [];
  let courante: string[] | null = null;
  let cloture = false;
  for (const ligne of corps.split(/\r?\n/u)) {
    if (/^\s*(```|~~~)/u.test(ligne)) cloture = !cloture;
    const titre = cloture ? null : /^##[ \t]+(.+?)[ \t]*$/u.exec(ligne);
    if (titre) {
      const nom = titre[1]!;
      if (rubriques.has(nom)) doubles.push(nom);
      courante = rubriques.get(nom) ?? [];
      rubriques.set(nom, courante);
    } else courante?.push(ligne);
  }
  return { rubriques, doubles };
}

/** Lignes de données du tableau `| Fait | Source | Extrait |` (en-tête et séparateur exclus). */
function lignesDuTableau(contenu: string[]): { entete: boolean; lignes: string[] } {
  const tableau = contenu.filter((l) => l.trim().startsWith("|"));
  const entete = tableau.length > 0 && cellules(tableau[0]!).map((c) => c.toLowerCase()).join("|") === ENTETE_FAITS.join("|");
  const donnees = tableau.slice(entete ? 1 : 0).filter((l) => !cellules(l).every((c) => SEPARATEUR_TABLEAU.test(c)));
  return { entete, lignes: donnees };
}

function controlerFait(ligne: string, numero: number, sources: readonly SourceDossier[], mode: ModeDossier, defauts: string[], avertissements: string[]): void {
  const c = cellules(ligne);
  const nom = `Fait ${numero}`;
  if (c.length !== 3) return void defauts.push(`${nom} : la ligne du tableau doit avoir 3 cellules (Fait, Source, Extrait).`);
  const [fait, src, extraitBrut] = c as [string, string, string];
  if (!fait) defauts.push(`${nom} : fait vide.`);
  const extrait = extraitBrut.replace(GUILLEMETS, "");
  if (extrait.length < EXTRAIT_MIN_CARACTERES) defauts.push(`${nom} : extrait de moins de ${EXTRAIT_MIN_CARACTERES} caractères.`);
  if (!src) return void defauts.push(`${nom} : source absente.`);
  if (src.startsWith(PREFIXE_CONNAISSANCE) && src.length > PREFIXE_CONNAISSANCE.length) return;
  const trouvee = sources.find((s) => s.url === src);
  if (!trouvee) return void defauts.push(`${nom} : source « ${src.slice(0, 200)} » non lue sur la tâche du dossier (POST /taches/:issueId/sources).`);
  if (trouvee.statutAcces !== "accessible") return void defauts.push(`${nom} : source « ${src.slice(0, 200)} » de statut ${trouvee.statutAcces} (accessible exigé).`);
  if (mode === "reel" && trouvee.mode !== "reel") return void defauts.push(`${nom} : source de démonstration interdite en mode réel (${src.slice(0, 200)}).`);
  if (extrait.length >= EXTRAIT_MIN_CARACTERES && !espaces(trouvee.extrait ?? "").includes(espaces(extrait))) {
    avertissements.push(`${nom} : extrait « ${extrait.slice(0, 80)} » non retrouvé dans l'extrait stocké de la source (stocké tronqué : à vérifier à la relecture).`);
  }
}

/** Rubriques `##` exactes présentes et non vides (sans contrôler les faits). */
export function rubriquesDuDossier(corps: string): string[] {
  const { rubriques } = decouper(corps);
  return RUBRIQUES_DOSSIER.filter((nom) => (rubriques.get(nom) ?? []).join("").trim() !== "");
}

export function controlerDossierSujet(corps: string, sources: readonly SourceDossier[], mode: ModeDossier): ControleDossier {
  const refus = (defaut: string): ControleDossier => ({ ok: false, defauts: [defaut], avertissements: [], rubriques: [] });
  if (Buffer.byteLength(corps, "utf8") > TAILLE_MAX_DOSSIER_OCTETS) return refus(`Dossier trop gros (maximum ${TAILLE_MAX_DOSSIER_OCTETS / 1024} Kio).`);
  const { rubriques, doubles } = decouper(corps);
  const defauts: string[] = doubles.map((n) => `Rubrique « ${n} » en double.`);
  const presentes: string[] = [];
  for (const nom of RUBRIQUES_DOSSIER) {
    const contenu = rubriques.get(nom);
    if (!contenu) defauts.push(`Rubrique « ${nom} » absente.`);
    else if (contenu.join("").trim() === "") defauts.push(`Rubrique « ${nom} » vide.`);
    else presentes.push(nom);
  }
  const avertissements: string[] = [];
  const faits = rubriques.get("Faits vérifiés");
  if (faits && presentes.includes("Faits vérifiés")) {
    const { entete, lignes } = lignesDuTableau(faits);
    if (!entete) defauts.push("Faits vérifiés : tableau « | Fait | Source | Extrait | » absent.");
    else if (lignes.length > LIGNES_FAITS_MAX) defauts.push(`Faits vérifiés : plus de ${LIGNES_FAITS_MAX} lignes de faits.`);
    else {
      if (lignes.length < FAITS_MIN) defauts.push(`Faits vérifiés : au moins ${FAITS_MIN} faits exigés (${lignes.length} trouvé${lignes.length > 1 ? "s" : ""}).`);
      lignes.forEach((l, i) => controlerFait(l, i + 1, sources, mode, defauts, avertissements));
    }
  }
  return { ok: defauts.length === 0, defauts, avertissements, rubriques: presentes };
}

/** Accès aux tâches : où se trouve le dossier (tâche, bloquantes, parente) et son document natif. */
export interface LiensDossierSujet {
  /** Tâche parente (null si aucune). */
  parente(issueId: string, companyId: string): Promise<string | null>;
  /** Tâches qui bloquent `issueId` (relations `blocks`), bornées à l'entreprise. */
  bloquantes(companyId: string, issueId: string): Promise<string[]>;
  /** Autres tâches de la même parente, bornées à l'entreprise (le lien `blocks` disparaît parfois une fois le dossier terminé). */
  soeurs(companyId: string, parentId: string, sauf: string): Promise<string[]>;
  /** Document natif `dossier-sujet` de la tâche, null s'il n'existe pas. */
  document(issueId: string, companyId: string): Promise<{ body: string; revisionId: string } | null>;
}

/** Branche les liens sur l'hôte : `ctx.issues` (tâche parente, documents natifs) et la requête `tachesBloquantes`. */
export function liensDossierSujet(
  issues: Pick<PluginContext["issues"], "get" | "documents">,
  base: { tachesBloquantes(companyId: string, issueId: string): Promise<string[]>; tachesSoeurs(companyId: string, parentId: string, sauf: string): Promise<string[]> },
): LiensDossierSujet {
  return {
    parente: async (issueId, companyId) => (await issues.get(issueId, companyId))?.parentId ?? null,
    bloquantes: (companyId, issueId) => base.tachesBloquantes(companyId, issueId),
    soeurs: (companyId, parentId, sauf) => base.tachesSoeurs(companyId, parentId, sauf),
    document: async (issueId, companyId) => {
      const doc = await issues.documents.get(issueId, CLE_DOCUMENT_DOSSIER_SUJET, companyId);
      return doc?.latestRevisionId ? { body: String(doc.body ?? ""), revisionId: doc.latestRevisionId } : null;
    },
  };
}

/** Premier document `dossier-sujet` trouvé : tâche du run, puis tâches qui la bloquent, puis tâche parente, puis ses autres enfants. */
export async function trouverDossierSujet(d: LiensDossierSujet, tacheId: string, companyId: string): Promise<{ issueId: string; revisionId: string; body: string } | null> {
  const parente = await d.parente(tacheId, companyId);
  const candidates = [tacheId, ...(await d.bloquantes(companyId, tacheId)), ...(parente ? [parente, ...(await d.soeurs(companyId, parente, tacheId))] : [])];
  for (const issueId of new Set(candidates)) {
    const doc = await d.document(issueId, companyId);
    if (doc) return { issueId, revisionId: doc.revisionId, body: doc.body };
  }
  return null;
}

export interface DependancesDossierSujet extends LiensDossierSujet {
  /** Sources enregistrées sur la tâche qui porte le dossier. */
  sources(companyId: string, issueId: string): Promise<SourceDossier[]>;
  /** Mode effectif de la tâche du run (réel si la campagne ou l'entreprise l'est). */
  mode(companyId: string, issueId: string): Promise<ModeDossier>;
}

export type ResultatDossierSujet =
  | { ok: true; issueId: string; revisionId: string; rubriques: string[]; avertissements: string[] }
  | { ok: false; refus: string };

/** Retrouve puis contrôle le dossier d'une tâche : la sienne, puis ses bloquantes, puis sa parente. */
export function creerRechercheDossierSujet(d: DependancesDossierSujet) {
  return async (tacheId: string, companyId: string): Promise<ResultatDossierSujet> => {
    const doc = await trouverDossierSujet(d, tacheId, companyId);
    if (!doc) return { ok: false, refus: REFUS_AUCUN_DOSSIER };
    const controle = controlerDossierSujet(doc.body, await d.sources(companyId, doc.issueId), await d.mode(companyId, tacheId));
    if (!controle.ok) return { ok: false, refus: `Dossier du sujet invalide (tâche ${doc.issueId}) : ${controle.defauts.join(" ")}` };
    return { ok: true, issueId: doc.issueId, revisionId: doc.revisionId, rubriques: controle.rubriques, avertissements: controle.avertissements };
  };
}
