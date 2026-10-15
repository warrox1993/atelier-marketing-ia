// Simulateur HubSpot CRM v3 (service « crm ») : contacts et affaires (deals).
// Formes : GET /crm/v3/objects/contacts et /deals (results[], paging.next.after).
// Documentation consultée le 15/10/2026 (URL dans docs/passerelle.md, section L7).

import * as z from "zod";
import type { ContactCrm, TransactionCrm } from "../modele/index.js";
import type { FournisseurService } from "../../fournisseurs.js";
import { contactsPeriode, derniereModification, exigerContact, transactionsPeriode } from "./crm-commun.js";
import { decoderDecalage, formeAu, formePeriode, minuitIso, outilLecture, outilMutation, trancher } from "./utilitaires.js";

const LIMITE_DEFAUT = 10;
const LIMITE_MAX = 100;

const formePagination = {
  limit: z.number().int().min(1).max(LIMITE_MAX).default(LIMITE_DEFAUT).describe("Résultats par page (10 par défaut, 100 au plus)."),
  after: z.string().max(20).optional().describe("Curseur `paging.next.after` de la page précédente."),
};

/** Statut de prospect HubSpot déduit de l'étape du cycle de vie (hs_lead_status, valeurs internes par défaut). */
const STATUT_PROSPECT: Record<ContactCrm["cycleDeVie"], string | null> = {
  lead: "NEW",
  salesqualifiedlead: "IN_PROGRESS",
  opportunity: "OPEN_DEAL",
  customer: null,
};

/** Étapes du pipeline de ventes par défaut de HubSpot (identifiants internes). */
const ETAPE_AFFAIRE: Record<TransactionCrm["etape"], string> = { devis_envoye: "contractsent", gagne: "closedwon", perdu: "closedlost" };

function objetContact(c: ContactCrm) {
  const modifie = derniereModification(c);
  return {
    id: c.id,
    properties: {
      createdate: c.creeLe,
      email: c.courriel,
      firstname: c.prenom,
      lastname: c.nom,
      phone: c.telephone,
      city: c.localite,
      zip: c.codePostal,
      lifecyclestage: c.cycleDeVie,
      hs_lead_status: STATUT_PROSPECT[c.cycleDeVie],
      hs_analytics_source: c.sourceCrm,
      hs_object_id: c.id,
      lastmodifieddate: modifie,
      // propriétés personnalisées de l'atelier : établissement de rattachement (null = hors zone) et métier
      etablissement: c.etablissement,
      metier: c.metier,
    },
    createdAt: c.creeLe,
    updatedAt: modifie,
    archived: false,
  };
}

function objetAffaire(t: TransactionCrm) {
  const modifie = minuitIso(t.dateCloture ?? t.creeLe);
  return {
    id: t.id,
    properties: {
      dealname: t.nom,
      amount: String(t.montantEuros),
      dealstage: ETAPE_AFFAIRE[t.etape],
      pipeline: "default",
      createdate: minuitIso(t.creeLe),
      closedate: t.dateCloture ? minuitIso(t.dateCloture) : null,
      hs_lastmodifieddate: modifie,
      hs_object_id: t.id,
      etablissement: t.etablissement,
      metier: t.metier,
    },
    createdAt: minuitIso(t.creeLe),
    updatedAt: modifie,
    archived: false,
    associations: { contacts: { results: [{ id: t.contactId, type: "deal_to_contact" }] } },
  };
}

function pagination(chemin: string, suivant: number | null, limite: number): { paging?: { next: { after: string; link: string } } } {
  if (suivant === null) return {};
  return { paging: { next: { after: String(suivant), link: `https://api.hubapi.com/crm/v3/objects/${chemin}?limit=${limite}&after=${suivant}` } } };
}

export function fournisseurHubspot(): FournisseurService {
  const contacts = outilLecture(
    {
      nom: "crm_contacts",
      description:
        "Contacts HubSpot créés sur une période, forme de GET /crm/v3/objects/contacts : results[] (id, properties dont " +
        "lifecyclestage, hs_lead_status, hs_analytics_source, createdAt, updatedAt, archived) et paging.next.after. " +
        "Chaque contact est une demande de diagnostic ; les contacts hors zone (Herstal) restent au stade lead.",
      schemaEntree: { ...formePeriode, ...formeAu, ...formePagination },
    },
    ({ debut, fin, au, limit, after }) => {
      const tranche = trancher(contactsPeriode(debut, fin, au), decoderDecalage(after), limit);
      return { results: tranche.elements.map(objetContact), ...pagination("contacts", tranche.suivant, limit) };
    },
  );

  const transactions = outilLecture(
    {
      nom: "crm_transactions",
      description:
        "Affaires HubSpot (devis) créées sur une période, forme de GET /crm/v3/objects/deals : results[] (id, properties dont " +
        "dealname, amount, dealstage, pipeline, createdate, closedate ; associations.contacts) et paging.next.after. " +
        "Étapes : contractsent (devis envoyé), closedwon, closedlost.",
      schemaEntree: { ...formePeriode, ...formeAu, ...formePagination },
    },
    ({ debut, fin, au, limit, after }) => {
      const tranche = trancher(transactionsPeriode(debut, fin, au), decoderDecalage(after), limit);
      return { results: tranche.elements.map(objetAffaire), ...pagination("deals", tranche.suivant, limit) };
    },
  );

  const PROPRIETES_LECTURE_SEULE = new Set(["hs_object_id", "createdate", "lastmodifieddate", "hs_analytics_source"]);
  const modifier = outilMutation(
    {
      nom: "crm_modifier_contact",
      description: "Prépare la modification de propriétés d'un contact HubSpot (par exemple lifecyclestage ou hs_lead_status).",
      schemaEntree: {
        contact_id: z.string().regex(/^\d{1,20}$/, "identifiant numérique attendu").describe("Identifiant du contact (champ `id` de crm_contacts)."),
        properties: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), z.string().max(500)).describe("Propriétés à modifier, valeurs en texte (comme PATCH /crm/v3/objects/contacts/{id})."),
      },
      destructif: false,
      requeteReelle: "PATCH /crm/v3/objects/contacts/{contactId}",
      resume: (a) => `modification de ${Object.keys(a.properties).length} propriété(s) du contact ${a.contact_id}.`,
    },
    (a) => {
      if (Object.keys(a.properties).length === 0) throw new Error("Aucune propriété à modifier.");
      const interdites = Object.keys(a.properties).filter((cle) => PROPRIETES_LECTURE_SEULE.has(cle));
      if (interdites.length > 0) throw new Error(`Propriétés en lecture seule : ${interdites.join(", ")}.`);
      exigerContact(a.contact_id, "HubSpot");
    },
  );

  return { service: "crm", mode: "demonstration", outils: [contacts, transactions, modifier] };
}
