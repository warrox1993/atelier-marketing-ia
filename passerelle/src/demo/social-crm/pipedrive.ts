// Simulateur Pipedrive (API v1) : personnes (persons) et affaires (deals).
// Formes : GET /v1/persons et /v1/deals (success, data[], additional_data.pagination).
// La v2 (curseur) existe ; elle n'est pas simulée (voir docs/passerelle.md, section L7).

import * as z from "zod";
import type { ContactCrm, TransactionCrm } from "../modele/index.js";
import type { FournisseurService } from "../../fournisseurs.js";
import { contactsPeriode, derniereModification, exigerContact, STATUT_PAR_ETAPE, transactionsPeriode } from "./crm-commun.js";
import { formeAu, formePeriode, horodatageEspace, outilLecture, outilMutation, trancher } from "./utilitaires.js";

/** Étape « devis envoyé » du pipeline par défaut (choix de configuration de la démonstration). */
const PIPELINE_ID = 1;
const ETAPE_DEVIS_ID = 4;

const formePagination = {
  start: z.number().int().min(0).max(1_000_000).default(0).describe("Index du premier élément (0 par défaut)."),
  limit: z.number().int().min(1).max(500).default(100).describe("Éléments par page (100 par défaut, 500 au plus)."),
};

function personne(c: ContactCrm) {
  return {
    id: Number(c.id),
    name: `${c.prenom} ${c.nom}`,
    first_name: c.prenom,
    last_name: c.nom,
    email: [{ value: c.courriel, primary: true, label: "work" }],
    phone: [{ value: c.telephone, primary: true, label: "work" }],
    add_time: horodatageEspace(c.creeLe),
    update_time: horodatageEspace(derniereModification(c)),
    // champs personnalisés de l'atelier, avec des clés lisibles (Pipedrive utilise des clés hachées)
    etablissement: c.etablissement,
    metier: c.metier,
    localite: c.localite,
    code_postal: c.codePostal,
  };
}

function affaire(t: TransactionCrm) {
  const creation = `${t.creeLe} 00:00:00`;
  const cloture = t.dateCloture ? `${t.dateCloture} 00:00:00` : null;
  return {
    id: Number(t.id),
    title: t.nom,
    value: t.montantEuros,
    currency: "EUR",
    status: STATUT_PAR_ETAPE[t.etape],
    pipeline_id: PIPELINE_ID,
    stage_id: ETAPE_DEVIS_ID,
    person_id: Number(t.contactId),
    add_time: creation,
    update_time: cloture ?? creation,
    close_time: cloture,
    won_time: t.etape === "gagne" ? cloture : null,
    lost_time: t.etape === "perdu" ? cloture : null,
    etablissement: t.etablissement,
    metier: t.metier,
  };
}

function enveloppe<T>(liste: readonly T[], start: number, limit: number) {
  const tranche = trancher(liste, start, limit);
  return {
    success: true,
    data: tranche.elements,
    additional_data: {
      pagination: {
        start,
        limit,
        more_items_in_collection: tranche.suivant !== null,
        ...(tranche.suivant !== null ? { next_start: tranche.suivant } : {}),
      },
    },
  };
}

export function fournisseurPipedrive(): FournisseurService {
  const personnes = outilLecture(
    {
      nom: "pipedrive_personnes",
      description:
        "Personnes Pipedrive créées sur une période, forme de GET /v1/persons : success, data[] (id, name, first_name, last_name, " +
        "email[], phone[], add_time, update_time) et additional_data.pagination (start, limit, more_items_in_collection, next_start).",
      schemaEntree: { ...formePeriode, ...formeAu, ...formePagination },
    },
    ({ debut, fin, au, start, limit }) => enveloppe(contactsPeriode(debut, fin, au).map(personne), start, limit),
  );

  const affaires = outilLecture(
    {
      nom: "pipedrive_affaires",
      description:
        "Affaires Pipedrive (devis) créées sur une période, forme de GET /v1/deals : success, data[] (id, title, value, currency, " +
        "status open|won|lost, stage_id, person_id, add_time, update_time, close_time, won_time, lost_time) et additional_data.pagination.",
      schemaEntree: { ...formePeriode, ...formeAu, ...formePagination },
    },
    ({ debut, fin, au, start, limit }) => enveloppe(transactionsPeriode(debut, fin, au).map(affaire), start, limit),
  );

  const modifier = outilMutation(
    {
      nom: "pipedrive_modifier_personne",
      description: "Prépare la modification d'une personne Pipedrive (nom, e-mail, téléphone...).",
      schemaEntree: {
        id: z.number().int().positive().describe("Identifiant de la personne (champ `id` de pipedrive_personnes)."),
        champs: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), z.union([z.string().max(500), z.number(), z.boolean()])).describe("Champs à modifier (PUT /v1/persons/{id})."),
      },
      destructif: false,
      requeteReelle: "PUT /v1/persons/{id}",
      resume: (a) => `modification de ${Object.keys(a.champs).length} champ(s) de la personne ${a.id}.`,
    },
    (a) => {
      if (Object.keys(a.champs).length === 0) throw new Error("Aucun champ à modifier.");
      exigerContact(String(a.id), "Pipedrive");
    },
  );

  return { service: "pipedrive", mode: "demonstration", outils: [personnes, affaires, modifier] };
}
