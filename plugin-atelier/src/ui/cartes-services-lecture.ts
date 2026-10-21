/**
 * Lecture, par l'INTERFACE, des cartes de décision humaine en attente dans les autres services du client.
 *
 * Le plugin ne peut pas lire une autre entreprise que celle de l'appel (portée de l'hôte) : sa route
 * `discussion.cartes-services` ne rend que la liste des tâches reçues à suivre. Ici, avec la session de la personne
 * (qui a le droit de lire les entreprises de son client, comme `agents-en-service.tsx`), on lit pour chaque tâche :
 * la tâche (`GET /api/issues/{id}`), ses sous-tâches à tous les niveaux (`GET /api/companies/{cid}/issues?descendantOf=`,
 * plafonnées), puis ses cartes (`GET /api/issues/{id}/interactions`, statut `pending`). Pour chaque entreprise de service,
 * ses tâches ouvertes SANS parent les plus récentes (hors descendance de la tâche reçue) sont lues en plus. Un plafond GLOBAL
 * (`MAX_INTERACTIONS_LUES`) borne les lectures d'interactions d'une interrogation, toutes entreprises confondues. Six
 * lectures simultanées au plus. Lecture seule : aucune écriture.
 *
 * La construction de l'élément « À faire » est celle du serveur (`contrats/carte-decision.ts`), sans copie.
 */
import { elementDepuisCarte, type CarteNative, type CarteService, type TacheASuivre } from "../contrats/carte-decision.js";
import { appelHote } from "./hote.js";
import { enParallele, LECTURES_SIMULTANEES } from "./vues/departements.js";

/** Tâches dont on lit les cartes et sous-tâches lues au plus par entreprise (mêmes plafonds que l'ancienne route). */
export const MAX_TACHES_LUES = 30;
export const SOUS_TACHES_LUES = 200;
/** Tâches ouvertes sans parent du service lues EN PLUS de la tâche reçue (les plus récentes), par entreprise. */
export const TACHES_OUVERTES_LUES = 40;
/** Plafond GLOBAL de lectures d'interactions par interrogation, toutes entreprises confondues. */
export const MAX_INTERACTIONS_LUES = 60;
const STATUTS_OUVERTS = ["todo", "in_progress", "in_review", "blocked"] as const;

/** Lecteur de l'API hôte (GET) ; remplaçable dans les tests. */
export type LecteurHote = (chemin: string) => Promise<unknown>;
const lecteurParDefaut: LecteurHote = (chemin) => appelHote<unknown>("GET", chemin);

interface TacheHote {
  id: string;
  companyId: string;
  identifier: string | null;
  title: string;
  status: string;
  parentId: string | null;
}

const texte = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);
const memeId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const ferme = (t: Pick<TacheHote, "status">) => t.status === "done" || t.status === "cancelled";

function tacheDepuisHote(brut: unknown): TacheHote | null {
  const o = (brut ?? {}) as Record<string, unknown>;
  const id = texte(o["id"]);
  const companyId = texte(o["companyId"]);
  const title = texte(o["title"]);
  if (!id || !companyId || !title) return null;
  return { id, companyId, identifier: texte(o["identifier"]), title, status: texte(o["status"]) ?? "", parentId: texte(o["parentId"]) };
}

function liste(brut: unknown): unknown[] {
  return Array.isArray(brut) ? brut : ((brut as { items?: unknown[] } | null)?.items ?? []);
}

function carteDepuisHote(brut: unknown): (CarteNative & { createdAt: string }) | null {
  const o = (brut ?? {}) as Record<string, unknown>;
  const id = texte(o["id"]);
  const kind = texte(o["kind"]);
  const status = texte(o["status"]);
  if (!id || !kind || !status) return null;
  return { id, kind, status, title: texte(o["title"]), payload: o["payload"], createdAt: texte(o["createdAt"]) ?? new Date(0).toISOString() };
}

export interface LectureCartes {
  cartes: CarteService[];
  /** Une lecture a échoué (tâche ou service illisible) : les cartes lues sont gardées, l'interface propose de réessayer. */
  indisponible: boolean;
}

/** Cartes en attente des tâches à suivre, du plus ancien au plus récent. Ne lève jamais : un échec marque `indisponible`. */
export async function lireCartesDesServices(aSuivre: readonly TacheASuivre[], lire: LecteurHote = lecteurParDefaut): Promise<LectureCartes> {
  let indisponible = false;
  const echec = () => {
    indisponible = true;
  };

  // 1) Pour chaque tâche reçue : la tâche elle-même puis ses sous-tâches.
  const parTache = new Map<string, { tache: TacheHote; service: TacheASuivre }>();
  const groupes = new Array<Array<{ tache: TacheHote; service: TacheASuivre }>>(aSuivre.length).fill([]);
  await enParallele(aSuivre.map((s, i) => ({ s, i })), LECTURES_SIMULTANEES, async ({ s, i }) => {
    try {
      const racine = tacheDepuisHote(await lire(`/issues/${encodeURIComponent(s.tacheId)}`));
      // Rien hors de l'entreprise annoncée par le plugin (service confirmé du client).
      if (!racine || !memeId(racine.companyId, s.companyId)) return;
      const trouvees = [racine];
      const filles = liste(await lire(`/companies/${encodeURIComponent(s.companyId)}/issues?descendantOf=${encodeURIComponent(racine.id)}&limit=${SOUS_TACHES_LUES}`));
      for (const f of filles) {
        const t = tacheDepuisHote(f);
        if (t && memeId(t.companyId, s.companyId)) trouvees.push(t);
      }
      groupes[i] = trouvees.map((tache) => ({ tache, service: s }));
    } catch {
      echec();
    }
  });
  for (const g of groupes)
    for (const e of g) {
      const cle = e.tache.id.toLowerCase();
      if (!parTache.has(cle) && !ferme(e.tache)) parTache.set(cle, e);
    }

  // 2) Cartes en attente de chaque tâche ouverte.
  const aLire = [...parTache.values()].slice(0, MAX_TACHES_LUES);

  // 1 bis) Tâches ouvertes SANS parent du service, hors descendance de la tâche reçue (ex. une tâche créée par son
  // coordinateur) : leurs cartes attendent aussi l'humain. Filtre de statut refait côté client, plafond par entreprise.
  const services = new Map<string, TacheASuivre>();
  for (const s of aSuivre) if (!services.has(s.companyId.toLowerCase())) services.set(s.companyId.toLowerCase(), s);
  const vues = new Set(aLire.map((e) => e.tache.id.toLowerCase()));
  const supplements = new Array<Array<{ tache: TacheHote; service: TacheASuivre }>>(services.size).fill([]);
  await enParallele([...services.values()].map((s, i) => ({ s, i })), LECTURES_SIMULTANEES, async ({ s, i }) => {
    try {
      const brutes = liste(await lire(`/companies/${encodeURIComponent(s.companyId)}/issues?status=${STATUTS_OUVERTS.join(",")}&limit=${SOUS_TACHES_LUES}`));
      const ouvertes = brutes
        .map((b) => ({ tache: tacheDepuisHote(b), date: texte((b as Record<string, unknown> | null)?.["updatedAt"]) ?? texte((b as Record<string, unknown> | null)?.["createdAt"]) ?? "" }))
        .filter((e): e is { tache: TacheHote; date: string } => !!e.tache && memeId(e.tache.companyId, s.companyId) && (STATUTS_OUVERTS as readonly string[]).includes(e.tache.status) && e.tache.parentId == null)
        .sort((a, b) => b.date.localeCompare(a.date));
      supplements[i] = ouvertes.slice(0, TACHES_OUVERTES_LUES).map((e) => ({ tache: e.tache, service: s }));
    } catch {
      echec();
    }
  });
  for (const g of supplements)
    for (const e of g) {
      const cle = e.tache.id.toLowerCase();
      if (vues.has(cle)) continue;
      vues.add(cle);
      aLire.push(e);
    }
  // Plafond global : la descendance (déjà bornée) passe d'abord, puis les tâches sans parent les plus récentes.
  aLire.splice(MAX_INTERACTIONS_LUES);
  const cartes: CarteService[] = [];
  await enParallele(aLire, LECTURES_SIMULTANEES, async ({ tache, service }) => {
    try {
      for (const brut of liste(await lire(`/issues/${encodeURIComponent(tache.id)}/interactions`))) {
        const carte = carteDepuisHote(brut);
        const e = carte ? elementDepuisCarte(tache, carte) : null;
        if (!carte || !e) continue;
        // Lien relatif à l'entreprise du service (son préfixe est celui de l'identifiant de la tâche).
        const prefixe = tache.identifier?.split("-")[0];
        const element = prefixe && tache.identifier ? { ...e, lien: `/${prefixe}/issues/${tache.identifier}` } : e;
        cartes.push({ element, date: carte.createdAt, companyId: service.companyId, slug: service.slug, nom: service.nom, tache: tache.identifier ?? tache.id });
      }
    } catch {
      echec();
    }
  });
  cartes.sort((a, b) => a.date.localeCompare(b.date) || a.element.id.localeCompare(b.element.id));
  return { cartes, indisponible };
}
