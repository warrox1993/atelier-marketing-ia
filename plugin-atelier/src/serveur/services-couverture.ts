/**
 * Route `prospection.couverture` (GET `/prospection/couverture?companyId=&campagneId=`, lecture seule, agents
 * et humains) et entrées de la porte pour la règle de couverture (`couverture-prospection.ts`).
 *
 * Bureaux : établissements POSITIONNÉS de la fiche du client (dernière version de la marque), restreints à
 * ceux que nomme le périmètre de la campagne s'il en nomme. Rayon : `RAYON_ZONE_DEFAUT_KM` (10 km), le même
 * que le critère de zone de la qualification. Dépôts : journal `prospects.deposes` de la campagne.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { CleRouteApi } from "../contrats/index.js";
import type { GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { calculerCouverture, normaliserNom, OUTILS_COUVERTURE, type BureauCouverture, type ResultatCouverture } from "./couverture-prospection.js";
import { erreur } from "./erreurs.js";
import { RAYON_ZONE_DEFAUT_KM } from "./qualification-prospects.js";

export interface DependancesCouverture {
  ctx: PluginContext;
  base: BaseAtelier;
  tache(companyId: string, issueId: string): Promise<{ id: string; assigneeAgentId?: string | null; executionState?: unknown }>;
}

/** Bureaux positionnés de la fiche, restreints au périmètre de la campagne quand il en nomme. */
async function bureauxDeCampagne(d: DependancesCouverture, companyId: string, perimetre: readonly string[]): Promise<BureauCouverture[]> {
  const etabs = ((await d.base.marques(companyId))[0]?.etablissements ?? []) as ReadonlyArray<{ nom: string; code?: string | undefined; position?: { lat: number; lon: number } | null | undefined }>;
  const positionnes = etabs.filter((e) => e.position !== null && e.position !== undefined).map((e) => ({ nom: e.nom, code: e.code ?? null, lat: e.position!.lat, lon: e.position!.lon }));
  const voulus = new Set(perimetre.map(normaliserNom));
  const dansPerimetre = positionnes.filter((b) => voulus.has(normaliserNom(b.nom)) || (b.code !== null && voulus.has(normaliserNom(b.code))));
  return dansPerimetre.length > 0 ? dansPerimetre : positionnes;
}

/** Couverture d'une campagne de l'entreprise ; null si la campagne n'existe pas dans cette entreprise. */
export async function couvertureCampagne(d: DependancesCouverture, companyId: string, campagneId: string): Promise<ResultatCouverture | null> {
  const campagne = await d.base.lireCampagne(companyId, campagneId);
  if (!campagne) return null;
  const [bureaux, depots] = await Promise.all([bureauxDeCampagne(d, companyId, campagne.perimetre.etablissements), d.base.depotsProspectionCampagne(companyId, campagneId)]);
  return calculerCouverture({ bureaux, rayonKm: RAYON_ZONE_DEFAUT_KM, depots });
}

export function routesCouverture(d: DependancesCouverture): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};
  routes["prospection.couverture"] = async (r) => {
    const campagneId = typeof r.query["campagneId"] === "string" ? r.query["campagneId"] : "";
    if (!/^[0-9a-f-]{36}$/iu.test(campagneId)) erreur("entree_invalide", "Paramètre campagneId (identifiant de la campagne) obligatoire.");
    const c = await couvertureCampagne(d, r.companyId, campagneId);
    if (!c) return erreur("hors_entreprise", "Campagne introuvable dans cette entreprise.");
    return {
      corps: {
        ...c,
        consigne:
          c.bureaux.length === 0
            ? "Aucun bureau positionné dans la fiche du client : la couverture ne peut pas être calculée. Demande au coordinateur de faire saisir la position des bureaux ; ne choisis pas les zones toi-même."
            : "Interroge CHAQUE code postal de `zones` (champ `codes_postaux` des outils osm_commerces et bce_rechercher), dépose chaque page avec ses `arguments`, puis relis cette route : `complete` doit valoir true. Cite les `phrases` telles quelles ; n'écris jamais un total à la main.",
      },
    };
  };
  return routes;
}

/** Nom normalisé « prospection » : l'agent de prospection de l'organisation. */
const estAgentProspection = (nom: unknown) => typeof nom === "string" && normaliserNom(nom) === "prospection";

/**
 * Entrées de la porte : null si la tâche n'est pas une tâche de prospection (aucun dépôt osm_commerces ou
 * bce_rechercher, producteur qui n'est pas l'agent Prospection). Bureaux sans position : couverture null.
 */
export async function entreesCouverturePorte(d: DependancesCouverture, companyId: string, issueId: string, campagneId: string): Promise<{ couverture: ResultatCouverture | null } | null> {
  const sources = await d.base.sourcesPourGarde(companyId, issueId);
  let prospection = sources.some((s) => (OUTILS_COUVERTURE as readonly string[]).includes(String(s.outil ?? "")));
  if (!prospection) {
    const issue = await d.tache(companyId, issueId);
    const retour = (issue.executionState as { returnAssignee?: { type?: string; agentId?: string | null } } | null | undefined)?.returnAssignee;
    for (const id of new Set([issue.assigneeAgentId ?? null, retour?.type === "agent" ? retour.agentId ?? null : null])) {
      if (id && estAgentProspection((await d.ctx.agents.get(id, companyId))?.name)) prospection = true;
    }
  }
  if (!prospection) return null;
  const couverture = await couvertureCampagne(d, companyId, campagneId);
  return { couverture: couverture && couverture.bureaux.length > 0 ? couverture : null };
}
