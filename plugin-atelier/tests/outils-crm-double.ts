// Double du CRM du moteur : aucune écriture réelle. Garde la trace des écritures, refuse ou tombe en panne sur des prospects précis,
// peut répondre « en attente d'approbation » et connaître d'avance des prospects (déjà présents dans le CRM avant l'export).
// Modèle de la vraie route : la réponse est mémorisée par clé (un rejeu rend la même réponse, une écriture acceptée n'écrit rien de plus).
import type { CrmMoteur, ResultatEcriture } from "../src/moteur/export-crm.js";

/** Une entrée par prospect écrit. */
export interface EcritureCrm { missionId: string; cle: string; prospectId: string }

export type CrmDouble = CrmMoteur & {
  ecritures: EcritureCrm[];
  /** Un élément par appel accepté : les prospects qu'il contenait. */
  appels: string[][];
  refuserSur(ids: string[]): void;
  pannesSur(ids: string[]): void;
  enAttente(oui: boolean): void;
  deja(ids: string[]): void;
  /** Vide les refus et les pannes pour les clés neuves ; les réponses déjà mémorisées restent. */
  reparer(): void;
  nonConfirmes(ids: string[]): void;
};

export function creerCrmDouble(): CrmDouble {
  const presents = new Set<string>();
  const refuses = new Set<string>();
  const enPanne = new Set<string>();
  const prepares = new Set<string>();
  const memorisees = new Map<string, ResultatEcriture>();
  const ecritures: EcritureCrm[] = [];
  const appels: string[][] = [];
  let attente = false;
  return {
    ecritures,
    appels,
    async existe(_companyId, _missionId, prospectId) {
      return presents.has(prospectId);
    },
    async confirme(_companyId, _missionId, prospectId) {
      return presents.has(prospectId) && !prepares.has(prospectId);
    },
    async ecrire(_companyId, e) {
      const deja = memorisees.get(e.cle);
      if (deja) return deja;
      if (attente) return { etat: "en_attente", appelId: "appel-1", consigne: "Un humain doit approuver." };
      const panne = e.prospectIds.find((id) => enPanne.has(id));
      if (panne) throw new Error(`CRM indisponible pour ${panne}`);
      const refus = e.prospectIds.filter((id) => refuses.has(id));
      const reponse: ResultatEcriture = refus.length > 0
        ? { etat: "refusee", refuses: refus.map((prospectId) => ({ prospectId, motif: `CRM indisponible pour ${prospectId}` })), motif: `${refus.length} prospect(s) refusé(s)` }
        : { etat: "acceptee" };
      memorisees.set(e.cle, reponse);
      if (reponse.etat === "acceptee") {
        appels.push([...e.prospectIds]);
        for (const prospectId of e.prospectIds) {
          ecritures.push({ missionId: e.missionId, cle: e.cle, prospectId });
          presents.add(prospectId);
        }
      }
      return reponse;
    },
    refuserSur(ids) {
      for (const id of ids) refuses.add(id);
    },
    pannesSur(ids) {
      for (const id of ids) enPanne.add(id);
    },
    enAttente(oui) {
      attente = oui;
    },
    deja(ids) {
      for (const id of ids) presents.add(id);
    },
    nonConfirmes(ids) {
      for (const id of ids) prepares.add(id);
    },
    reparer() {
      refuses.clear();
      enPanne.clear();
    },
  };
}
