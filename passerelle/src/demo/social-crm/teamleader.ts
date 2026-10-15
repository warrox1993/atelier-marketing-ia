// Simulateur Teamleader Focus : contacts.list et deals.list (POST, réponse { data: [...] }).
// Seuls les champs confirmés dans la documentation du 15/10/2026 sont servis (voir
// docs/passerelle.md, section L7) : aucune adresse, aucun champ personnalisé.

import * as z from "zod";
import type { ContactCrm, TransactionCrm } from "../modele/index.js";
import type { FournisseurService } from "../../fournisseurs.js";
import {
  contactsPeriode, derniereModification, exigerContact, horodatageTeamleader, numeroDepuisUuid, STATUT_PAR_ETAPE,
  transactionsPeriode, uuidDepuis,
} from "./crm-commun.js";
import { formeAu, formePeriode, minuitIso, outilLecture, outilMutation } from "./utilitaires.js";

const formePage = {
  page: z.object({
    size: z.number().int().min(1).max(100).default(20).describe("Éléments par page (20 par défaut, 100 au plus)."),
    number: z.number().int().min(1).max(100_000).default(1).describe("Numéro de page, à partir de 1."),
  }).default({ size: 20, number: 1 }).describe("Pagination : page.size et page.number."),
};

function contact(c: ContactCrm) {
  return {
    id: uuidDepuis("contact", c.id),
    first_name: c.prenom,
    last_name: c.nom,
    emails: [{ type: "primary", email: c.courriel }],
    telephones: [{ type: "phone", number: c.telephone }],
    added_at: horodatageTeamleader(c.creeLe),
    updated_at: horodatageTeamleader(derniereModification(c)),
  };
}

function affaire(t: TransactionCrm) {
  const creation = horodatageTeamleader(minuitIso(t.creeLe));
  const cloture = t.dateCloture ? horodatageTeamleader(minuitIso(t.dateCloture)) : null;
  return {
    id: uuidDepuis("affaire", t.id),
    title: t.nom,
    status: STATUT_PAR_ETAPE[t.etape],
    lead: { customer: { type: "contact", id: uuidDepuis("contact", t.contactId) }, contact_person: null },
    estimated_value: { amount: t.montantEuros, currency: "EUR" },
    current_phase: { type: "dealPhase", id: uuidDepuis("phase", { devis_envoye: 1, gagne: 2, perdu: 3 }[t.etape]) },
    closed_at: cloture,
    created_at: creation,
    updated_at: cloture ?? creation,
  };
}

export function fournisseurTeamleader(): FournisseurService {
  const contacts = outilLecture(
    {
      nom: "teamleader_contacts",
      description:
        "Contacts Teamleader créés sur une période, forme de POST /contacts.list : { data: [{ id, first_name, last_name, emails[], " +
        "telephones[], added_at, updated_at }] }. Pagination par page.size et page.number.",
      schemaEntree: { ...formePeriode, ...formeAu, ...formePage },
    },
    ({ debut, fin, au, page }) => {
      const liste = contactsPeriode(debut, fin, au);
      const depart = (page.number - 1) * page.size;
      return { data: liste.slice(depart, depart + page.size).map(contact) };
    },
  );

  const deals = outilLecture(
    {
      nom: "teamleader_deals",
      description:
        "Affaires Teamleader (devis) créées sur une période, forme de POST /deals.list : { data: [{ id, title, status open|won|lost, " +
        "lead, estimated_value{amount, currency}, current_phase, closed_at, created_at, updated_at }] }.",
      schemaEntree: { ...formePeriode, ...formeAu, ...formePage },
    },
    ({ debut, fin, au, page }) => {
      const liste = transactionsPeriode(debut, fin, au);
      const depart = (page.number - 1) * page.size;
      return { data: liste.slice(depart, depart + page.size).map(affaire) };
    },
  );

  const modifier = outilMutation(
    {
      nom: "teamleader_modifier_contact",
      description: "Prépare la modification d'un contact Teamleader (prénom, nom, e-mails, téléphones).",
      schemaEntree: {
        id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "UUID attendu").describe("Identifiant du contact (champ `id` de teamleader_contacts)."),
        modifications: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), z.union([z.string().max(500), z.number(), z.boolean()])).describe("Champs à modifier (POST /contacts.update)."),
      },
      destructif: false,
      requeteReelle: "POST /contacts.update",
      resume: (a) => `modification de ${Object.keys(a.modifications).length} champ(s) du contact ${a.id}.`,
    },
    (a) => {
      if (Object.keys(a.modifications).length === 0) throw new Error("Aucune modification demandée.");
      const numero = numeroDepuisUuid("contact", a.id);
      if (!numero) throw new Error(`Contact introuvable : ${a.id} (Teamleader, identifiant inconnu).`);
      exigerContact(numero, "Teamleader");
    },
  );

  return { service: "teamleader", mode: "demonstration", outils: [contacts, deals, modifier] };
}
