/**
 * Moteur de missions (#51, tâche 3) : étapes « en code » de WF-01 et export CRM.
 * Les calculs d'avant la porte sont des lectures, donc rejouables ; l'export est la seule écriture externe : un appel unique par lot
 * (la décision humaine « modifier_crm » n'autorise qu'une diffusion), clé par contenu du lot (`demandee`, écriture, `appliquee`)
 * et dédoublonnage avant écriture (présence constatée dans le CRM).
 */
import { createHash } from "node:crypto";
import { CanalContact, CodeReferentiel, IdNatif, ServiceExportCrm, type Empreinte, type Prospect } from "../contrats/index.js";
import type { BaseAtelier } from "../serveur/base.js";
import { dedoublonner, exclusionsProspect, figureDansOppositions, type ContexteProspection } from "../serveur/regles-prospection.js";
import { cleEvenement } from "./executeur.js";

/**
 * Réponse de l'écriture : acceptée, en attente de l'approbation humaine (rien n'est parti), refusée pour certains prospects,
 * préparée (preuve signée valable : l'agent CRM l'exécute) ou bloquée (préparée sans preuve valable).
 */
export type ResultatEcriture =
  | { etat: "acceptee" }
  | { etat: "a_executer"; diffusionId: string; cleDiffusion: string; appelId: string }
  | { etat: "bloquee"; raison: string; motif: string | null }
  | { etat: "en_attente"; appelId: string | null; consigne: string | null }
  | { etat: "refusee"; refuses: Array<{ prospectId: string; motif: string }>; motif: string };

/** CRM vu par le moteur : lecture de présence et écriture d'un lot (jamais d'écriture réelle dans les tests). */
export interface CrmMoteur {
  existe(companyId: string, missionId: string, prospectId: string): Promise<boolean>;
  /** L'écriture est effective (simulée ou confirmée) ; une diffusion seulement préparée ne l'est pas encore. */
  confirme(companyId: string, missionId: string, prospectId: string): Promise<boolean>;
  /** Un export ambigu (issue incertaine) contient ce prospect : jamais de réécriture sur un effet incertain. */
  ambigu?(companyId: string, missionId: string, prospectId: string): Promise<boolean>;
  ecrire(companyId: string, e: { missionId: string; prospectIds: string[]; cle: string }): Promise<ResultatEcriture>;
  /** Une approbation humaine « modifier_crm » plus récente que toute diffusion existe et n'a servi à aucune : la route peut produire une nouvelle diffusion. */
  decisionNouvelle?(companyId: string, missionId: string): Promise<boolean>;
}

export interface DepsExport {
  crm: CrmMoteur;
  base: Pick<BaseAtelier, "enregistrerExecution" | "marquerExecution" | "lireExecution">;
}

export interface ContexteEtapeCode { companyId: string; missionId: string; campagneId: string | null; entrees: Record<string, unknown> }
/** `blocage` : l'étape ne peut rien produire et la mission part en blocage (le motif est journalisé par l'exécuteur). */
export type SortieCode = { sortie: Record<string, unknown> } | { manquantes: string[] } | { blocage: string };

export interface EtapesCode {
  /** Étapes en code d'avant la porte, par `action` du gabarit. */
  avantPorte: Record<string, (c: ContexteEtapeCode) => Promise<SortieCode>>;
  /** Lot à exporter, calculé à l'approbation. */
  lot(c: ContexteEtapeCode): Promise<Array<{ prospectId: string; marqueOpposition: boolean }>>;
  deps: DepsExport;
}

/**
 * Exporte le lot en un appel. Les prospects déjà présents sont réussis d'office ; un refus ne retire que les prospects refusés,
 * le reste repart dans un nouvel appel (autre contenu, donc autre clé) ; en attente d'approbation : ni échec ni essai, la clé se rejoue.
 * `execution` : diffusion préparée à faire exécuter par l'agent CRM ; `blocage` : préparée sans preuve valable ; ni l'un ni l'autre ne marque l'exécution (la clé se rejoue).
 */
export async function exporterLot(
  deps: DepsExport,
  m: { companyId: string; id: string },
  rang: number,
  lot: Array<{ prospectId: string; marqueOpposition: boolean }>,
): Promise<{
  reussis: string[]; echecs: Array<{ prospectId: string; raison: string }>; attente: { appelId: string | null; consigne: string | null; prospects: number } | null;
  execution: { diffusionId: string; cleDiffusion: string; prospectIds: string[]; appelId: string } | null; blocage: { raison: string; motif: string | null } | null;
}> {
  const reussis: string[] = [];
  const echecs: Array<{ prospectId: string; raison: string }> = [];
  let attente: { appelId: string | null; consigne: string | null; prospects: number } | null = null;
  let execution: { diffusionId: string; cleDiffusion: string; prospectIds: string[]; appelId: string } | null = null;
  let blocage: { raison: string; motif: string | null } | null = null;
  const tous = [...new Set(lot.map((l) => l.prospectId))];
  let restants = [...tous];
  try {
    const presents = new Set<string>();
    for (const id of restants) if (await deps.crm.existe(m.companyId, m.id, id)) presents.add(id);
    reussis.push(...restants.filter((id) => presents.has(id)));
    restants = restants.filter((id) => !presents.has(id));
    while (restants.length > 0) {
      const empreinte = createHash("sha256").update([...restants].sort().join(",")).digest("hex").slice(0, 32);
      const cle = `moteur:${cleEvenement(m.id, rang, 1, "export_crm", empreinte)}`;
      if ((await deps.base.lireExecution(m.companyId, cle))?.statut === "appliquee") {
        reussis.push(...restants);
        break;
      }
      await deps.base.enregistrerExecution({ companyId: m.companyId, missionId: m.id, rang, type: "effet_externe", cle, requete: { prospectIds: restants } });
      const r = await deps.crm.ecrire(m.companyId, { missionId: m.id, prospectIds: restants, cle });
      if (r.etat === "acceptee") {
        await deps.base.marquerExecution(m.companyId, cle, "appliquee");
        reussis.push(...restants);
        break;
      }
      if (r.etat === "en_attente") {
        attente = { appelId: r.appelId, consigne: r.consigne, prospects: restants.length };
        break;
      }
      if (r.etat === "a_executer") {
        execution = { diffusionId: r.diffusionId, cleDiffusion: r.cleDiffusion, prospectIds: restants, appelId: r.appelId };
        break;
      }
      if (r.etat === "bloquee") {
        blocage = { raison: r.raison, motif: r.motif };
        break;
      }
      const refuses = new Map(r.refuses.filter((x) => restants.includes(x.prospectId)).map((x) => [x.prospectId, x.motif]));
      if (refuses.size === 0) {
        for (const prospectId of restants) echecs.push({ prospectId, raison: r.motif });
        break;
      }
      for (const [prospectId, raison] of refuses) echecs.push({ prospectId, raison });
      restants = restants.filter((id) => !refuses.has(id));
    }
  } catch (e) {
    const raison = e instanceof Error ? e.message : String(e);
    for (const prospectId of restants) echecs.push({ prospectId, raison });
  }
  return { reussis: tous.filter((id) => reussis.includes(id)), echecs, attente, execution, blocage };
}

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
/** Valeurs d'une sortie d'agent rendues dans une sortie du moteur : seuls des identifiants conformes, uniques, en nombre borné. */
const BORNE_IDS_REJETES = 50;
const conformes = (liste: string[]): string[] => [...new Set(liste)].filter((id) => IdNatif.safeParse(id).success).slice(0, BORNE_IDS_REJETES);

export interface DepsEtapesWf01 {
  /** Sources déposées par la tâche de collecte (rang 2) de la mission : l'origine des prospects que la mission peut traiter. */
  sourcesCollecte(companyId: string, missionId: string): Promise<string[]>;
  lireProspects(companyId: string, ids: string[]): Promise<Prospect[]>;
  contexteExclusions(companyId: string, campagneId: string | null, prospects: Prospect[]): Promise<{ contexte: ContexteProspection; oppositions: Empreinte[] }>;
  deps: DepsExport;
}

/** Règles pures de WF-01 : périmètre, déduplication, exclusions (les oppositions marquent, ne bloquent jamais) et lot. */
export function creerEtapesWf01(d: DepsEtapesWf01): EtapesCode {
  return {
    deps: d.deps,
    avantPorte: {
      async valider_perimetre(c) {
        const objet = (v: unknown) => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
        const crm = objet(c.entrees.exportCrm);
        // Un exportCrm fourni se juge seul : invalide, il n'est jamais remplacé par le fichier.
        if (c.entrees.exportCrm !== undefined) {
          const valide = crm !== null && ServiceExportCrm.safeParse(crm.service).success && CanalContact.safeParse(crm.canal).success && CodeReferentiel.safeParse(crm.entite).success;
          return valide ? { sortie: { perimetreValide: true } } : { manquantes: ["exportCrm"] };
        }
        const fichier = objet(c.entrees.exportFichier);
        return fichier !== null && CanalContact.safeParse(fichier.canal).success ? { sortie: { perimetreValide: true } } : { manquantes: ["exportCrm"] };
      },
      async dedupliquer(c) {
        const demandes = ids(c.entrees.prospectIds);
        const sources = new Set(await d.sourcesCollecte(c.companyId, c.missionId));
        // Origine d'abord : un prospect hors mission ne doit jamais faire écarter comme doublon un prospect de la mission.
        // Seul un dépôt signé collecte : une lecture de page (téléphone) ou un enrichissement (faits BCE, taille BNB) peut viser un prospect de n'importe quelle mission.
        const lus = (await d.lireProspects(c.companyId, demandes)).filter((p) => p.sources.some((s) => s.type === "depot_signe" && !s.faits && !s.taille && s.sourceId !== null && sources.has(s.sourceId)));
        const { gardes, exclus } = dedoublonner(lus, new Date().toISOString());
        const prospectIds = gardes.map((p) => p.id);
        if (prospectIds.length === 0) return { blocage: "collecte_vide" };
        const deLaMission = new Set(lus.map((p) => p.id));
        // Le même identifiant listé deux fois n'est pas un doublon à écarter : il reste le prospect gardé.
        return { sortie: { prospectIds, doublons: exclus.map((x) => x.prospect.id).filter((id) => !prospectIds.includes(id)), dedupliques: prospectIds, horsMission: conformes(demandes.filter((id) => !deLaMission.has(id))) } };
      },
      async controler_exclusions(c) {
        // Une sortie d'agent du rang 5 peut réintroduire un doublon écarté au rang 3.
        const doublons = new Set(ids(c.entrees.doublons));
        // Sortie du rang 3 (jamais d'un agent) : un identifiant absent de `dedupliques` n'a pas été collecté par la mission ; absente, la liste est vide (refus par défaut).
        const dedupliques = new Set(ids(c.entrees.dedupliques));
        const demandes = ids(c.entrees.prospectIds).filter((id) => !doublons.has(id));
        const prospects = await d.lireProspects(c.companyId, demandes.filter((id) => dedupliques.has(id)));
        const { contexte, oppositions } = await d.contexteExclusions(c.companyId, c.campagneId, prospects);
        const retenus: string[] = [];
        const marques: string[] = [];
        const exclus: Array<{ prospectId: string; motifs: string[] }> = [];
        for (const p of prospects) {
          const motifs: string[] = exclusionsProspect(p, contexte).map((x) => x.motif);
          if (p.statut === "exclu") for (const motif of p.motifsExclusion.length > 0 ? p.motifsExclusion.map((x) => x.motif) : ["statut_exclu"]) if (!motifs.includes(motif)) motifs.push(motif);
          if (motifs.length > 0) exclus.push({ prospectId: p.id, motifs });
          else {
            retenus.push(p.id);
            if (figureDansOppositions(p, oppositions)) marques.push(p.id);
          }
        }
        for (const prospectId of conformes(demandes.filter((id) => !dedupliques.has(id)))) exclus.push({ prospectId, motifs: ["hors_mission"] });
        return { sortie: { retenus, marques, exclus } };
      },
    },
    async lot(c) {
      const retenus = new Set(ids(c.entrees.retenus));
      const marques = new Set(ids(c.entrees.marques));
      return ids(c.entrees.prospectIds).filter((id) => retenus.has(id)).map((prospectId) => ({ prospectId, marqueOpposition: marques.has(prospectId) }));
    },
  };
}
