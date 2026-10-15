// Socle commun des quatre simulateurs CRM (HubSpot, Pipedrive, Odoo, Teamleader).
// Les contacts et les devis viennent de `modeleDemo.contacts` et `modeleDemo.transactions` :
// un contact = une demande de diagnostic, une transaction = un devis (§6.4 de la conception).
// Chaque CRM habille ensuite les mêmes lignes aux formes de son API.

import { FIN_MODELE, modeleDemo, type ContactCrm, type TransactionCrm } from "../modele/index.js";
import { ajouterJours, bornerFin, verifierPeriode } from "./utilitaires.js";

export const MAX_JOURS_TRANSACTION = 30; // un devis naît au plus 25 jours après son contact (modèle)

export interface DossierCrm {
  contact: ContactCrm;
  transaction: TransactionCrm | null;
}

const parCreation = (a: ContactCrm, b: ContactCrm): number => a.creeLe.localeCompare(b.creeLe) || a.id.localeCompare(b.id);

/** Contacts créés pendant la période, triés par date de création, avec leur devis éventuel (état à la date `au`). */
export function contactsPeriode(debut: string, fin: string, au?: string): ContactCrm[] {
  verifierPeriode(debut, fin);
  return modeleDemo.contacts({ debut, fin, ...(au ? { au } : {}) }).sort(parCreation);
}

/** Devis créés pendant la période, triés par date de création (état à la date `au`). */
export function transactionsPeriode(debut: string, fin: string, au?: string): TransactionCrm[] {
  verifierPeriode(debut, fin);
  return modeleDemo.transactions({ debut, fin, ...(au ? { au } : {}) });
}

/** Un dossier par contact créé dans la période, avec le devis qui lui correspond (même créé après `fin`). */
export function dossiersPeriode(debut: string, fin: string, au?: string): DossierCrm[] {
  const contacts = contactsPeriode(debut, fin, au);
  const finDevis = bornerFin(ajouterJours(fin, MAX_JOURS_TRANSACTION), FIN_MODELE);
  // La date d'observation reste celle de l'appelant (fin de période par défaut), pas la borne élargie des devis.
  const parContact = new Map(modeleDemo.transactions({ debut, fin: finDevis, au: au ?? fin }).map((t) => [t.contactId, t]));
  return contacts.map((contact) => ({ contact, transaction: parContact.get(contact.id) ?? null }));
}

// --- Identifiants -------------------------------------------------------------------

const MOTIF_ID_CONTACT = /^1(\d{4})(\d{2})(\d{2})\d{5}$/;

/** Date de création d'un contact, lue dans son identifiant (« 1 » + AAAAMMJJ + 5 chiffres), ou `null`. */
export function dateDuContact(id: string): string | null {
  const trouve = MOTIF_ID_CONTACT.exec(id);
  return trouve ? `${trouve[1]}-${trouve[2]}-${trouve[3]}` : null;
}

/** Retrouve un contact du modèle par son identifiant (aucune écriture : lecture seule). */
export function trouverContact(id: string): ContactCrm | null {
  const date = dateDuContact(id);
  if (!date) return null;
  try {
    return modeleDemo.contacts({ debut: date, fin: date }).find((c) => c.id === id) ?? null;
  } catch {
    return null; // date hors période du modèle
  }
}

export function exigerContact(id: string, nomApi: string): ContactCrm {
  const contact = trouverContact(id);
  if (!contact) throw new Error(`Contact introuvable : ${id} (${nomApi}, objet inexistant).`);
  return contact;
}

/** Les UUID de Teamleader encodent l'identifiant du modèle dans leur dernier groupe : réversibles, sans table. */
const DEBUTS_UUID = { contact: "00000000-0000-4000-8000-", affaire: "00000000-0000-4000-8001-", phase: "00000000-0000-4000-8002-" } as const;

export function uuidDepuis(genre: keyof typeof DEBUTS_UUID, numero: string | number): string {
  return `${DEBUTS_UUID[genre]}${BigInt(numero).toString(16).padStart(12, "0")}`;
}

export function numeroDepuisUuid(genre: keyof typeof DEBUTS_UUID, uuid: string): string | null {
  if (!uuid.startsWith(DEBUTS_UUID[genre])) return null;
  const reste = uuid.slice(DEBUTS_UUID[genre].length);
  return /^[0-9a-f]{12}$/.test(reste) ? BigInt(`0x${reste}`).toString(10) : null;
}

// --- Correspondances d'étapes -------------------------------------------------------

export type EtapeTransaction = TransactionCrm["etape"];
export type StatutAffaire = "open" | "won" | "lost";

export const STATUT_PAR_ETAPE: Record<EtapeTransaction, StatutAffaire> = { devis_envoye: "open", gagne: "won", perdu: "lost" };

/** `2026-09-21T20:02:22.000Z` → `2026-09-21T20:02:22+00:00` (horodatage de Teamleader). */
export const horodatageTeamleader = (iso: string): string => iso.replace(/\.\d{3}Z$/, "+00:00");

/** Dernière modification d'un contact : son étape la plus récente, sans jamais précéder la création. */
export function derniereModification(contact: ContactCrm): string {
  const derniere = contact.etapes[contact.etapes.length - 1]!.date;
  const jour = `${derniere}T00:00:00.000Z`;
  return jour > contact.creeLe ? jour : contact.creeLe;
}
