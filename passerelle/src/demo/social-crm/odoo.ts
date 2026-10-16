// Simulateur Odoo : leads et opportunités `crm.lead` par `search_read` (JSON-RPC, service object,
// méthode execute_kw). Un lead par contact ; le devis donne le revenu attendu.
// Les points d'accès /jsonrpc et /xmlrpc sont déclarés obsolètes à partir d'Odoo 19 (retrait annoncé
// en Odoo 20, voir docs/passerelle.md, section L7) : ce simulateur reproduit la forme documentée de
// execute_kw, la seule dont les noms de champs sont vérifiables aujourd'hui.

import * as z from "zod";
import { LIBELLES_METIERS, type ContactCrm } from "../modele/index.js";
import type { FournisseurService } from "../../fournisseurs.js";
import { definitionsOdoo, SchemaClause } from "../../commun/social-crm/odoo.js";
import { SchemaDate } from "../modele/index.js";
import { dossiersPeriode, exigerContact, derniereModification, type DossierCrm } from "./crm-commun.js";
import { formeAu, formePeriode, horodatageEspace, outilLecture, outilMutation } from "./utilitaires.js";

/** Étapes du pipeline CRM d'Odoo livré par défaut (identifiants et noms de l'installation française). */
const ETAPES: Record<"nouveau" | "qualifie" | "proposition" | "gagne", [number, string]> = {
  nouveau: [1, "Nouveau"],
  qualifie: [2, "Qualifié"],
  proposition: [3, "Proposition"],
  gagne: [4, "Gagné"],
};

type Valeur = string | number | boolean | [number, string];
type Enregistrement = Record<string, Valeur>;

function etapeDe(contact: ContactCrm): [number, string] {
  switch (contact.cycleDeVie) {
    case "lead": return ETAPES.nouveau;
    case "salesqualifiedlead": return ETAPES.qualifie;
    case "opportunity": return ETAPES.proposition;
    case "customer": return ETAPES.gagne;
  }
}

/** Odoo renvoie `false` pour un champ vide ; `contact_name` et `partner_name` suivent cette convention. */
function enregistrement({ contact, transaction }: DossierCrm): Enregistrement {
  const perdu = transaction?.etape === "perdu";
  const gagne = transaction?.etape === "gagne";
  const base: Enregistrement = {
    id: Number(contact.id),
    name: transaction?.nom ?? `${LIBELLES_METIERS[contact.metier]} · ${contact.prenom} ${contact.nom}`,
    type: contact.cycleDeVie === "lead" ? "lead" : "opportunity",
    contact_name: `${contact.prenom} ${contact.nom}`,
    partner_name: false,
    email_from: contact.courriel,
    phone: contact.telephone,
    city: contact.localite,
    zip: contact.codePostal,
    stage_id: etapeDe(contact),
    expected_revenue: transaction?.montantEuros ?? 0,
    create_date: horodatageEspace(contact.creeLe),
    write_date: horodatageEspace(derniereModification(contact)),
    date_closed: transaction?.dateCloture && !perdu ? `${transaction.dateCloture} 00:00:00` : false,
    won_status: gagne ? "won" : perdu ? "lost" : "pending",
    active: !perdu,
    user_id: false,
    team_id: false,
    partner_id: false,
    // champs personnalisés de l'atelier (préfixe x_, convention d'Odoo)
    x_etablissement: contact.etablissement ?? false,
    x_metier: contact.metier,
  };
  if (gagne) base["probability"] = 100;
  if (perdu) base["probability"] = 0;
  return base;
}

const CHAMPS_CONNUS = new Set([
  "id", "name", "type", "contact_name", "partner_name", "email_from", "phone", "city", "zip", "stage_id", "expected_revenue",
  "create_date", "write_date", "date_closed", "won_status", "active", "user_id", "team_id", "partner_id", "probability",
  "x_etablissement", "x_metier",
]);

// --- Domaine de recherche : triplets [champ, opérateur, valeur] -------------------------

type Clause = z.output<typeof SchemaClause>;

/** Valeur comparable d'un champ : un champ many2one se compare par son identifiant, comme dans Odoo. */
function comparable(valeur: Valeur): string | number | boolean {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

function satisfait(rec: Enregistrement, [champ, op, attendu]: Clause): boolean {
  if (!CHAMPS_CONNUS.has(champ)) throw new Error(`Champ invalide « ${champ} » pour le modèle crm.lead.`);
  const brut = rec[champ];
  // Un champ absent (probability d'un lead en cours) se comporte comme un champ vide.
  const valeur = brut === undefined ? false : comparable(brut);
  switch (op) {
    case "=": return valeur === attendu;
    case "!=": return valeur !== attendu;
    case ">": return typeof valeur !== "boolean" && !Array.isArray(attendu) && valeur > attendu;
    case ">=": return typeof valeur !== "boolean" && !Array.isArray(attendu) && valeur >= attendu;
    case "<": return typeof valeur !== "boolean" && !Array.isArray(attendu) && valeur < attendu;
    case "<=": return typeof valeur !== "boolean" && !Array.isArray(attendu) && valeur <= attendu;
    case "in": return Array.isArray(attendu) && attendu.includes(valeur);
    case "not in": return Array.isArray(attendu) && !attendu.includes(valeur);
    case "like":
    case "ilike": {
      if (typeof valeur !== "string" || typeof attendu !== "string") return false;
      return op === "like" ? valeur.includes(attendu) : valeur.toLowerCase().includes(attendu.toLowerCase());
    }
  }
}

function trier(liste: Enregistrement[], ordre: string): Enregistrement[] {
  const criteres = ordre.split(",").map((c) => c.trim()).filter(Boolean).map((c) => {
    const [champ, sens] = c.split(/\s+/) as [string, string | undefined];
    if (!CHAMPS_CONNUS.has(champ)) throw new Error(`Champ de tri invalide « ${champ} ».`);
    if (sens !== undefined && !/^(asc|desc)$/i.test(sens)) throw new Error(`Sens de tri invalide « ${sens} » (asc ou desc).`);
    return { champ, desc: sens?.toLowerCase() === "desc" };
  });
  return [...liste].sort((a, b) => {
    for (const { champ, desc } of criteres) {
      const x = a[champ] === undefined ? false : comparable(a[champ]!);
      const y = b[champ] === undefined ? false : comparable(b[champ]!);
      if (x === y) continue;
      return (x < y ? -1 : 1) * (desc ? -1 : 1);
    }
    return 0;
  });
}

const DEFS = definitionsOdoo(SchemaDate);

export function fournisseurOdoo(): FournisseurService {
  const leads = outilLecture(
    {
      nom: "odoo_leads_search_read",
      description:
        "Leads et opportunités Odoo (modèle crm.lead) sur une période, forme de la réponse JSON-RPC execute_kw/search_read : " +
        "{ jsonrpc, id, result: [enregistrements] }. Champs : id, name, type, contact_name, email_from, phone, city, zip, stage_id " +
        "([id, nom]), expected_revenue, create_date, date_closed, won_status, active ; les champs vides valent false. " +
        "Comme dans Odoo, les enregistrements archivés (devis perdus) sont exclus sauf si le domaine filtre `active`.",
      schemaEntree: DEFS.odoo_leads_search_read.schemaEntree,
    },
    ({ debut, fin, au, domain, fields, offset, limit, order, id }) => {
      for (const champ of fields) if (!CHAMPS_CONNUS.has(champ)) throw new Error(`Champ invalide « ${champ} » pour le modèle crm.lead.`);
      const touche = (domain as Clause[]).some(([champ]) => champ === "active");
      let liste = dossiersPeriode(debut, fin, au).map(enregistrement);
      if (!touche) liste = liste.filter((r) => r["active"] === true); // filtre implicite d'Odoo
      liste = trier(liste.filter((r) => (domain as Clause[]).every((clause) => satisfait(r, clause))), order);
      const page = liste.slice(offset, offset + limit).map((r) => {
        if (fields.length === 0) return r;
        const reduit: Enregistrement = { id: r["id"]! };
        for (const champ of fields) if (r[champ] !== undefined) reduit[champ] = r[champ]!;
        return reduit;
      });
      return { jsonrpc: "2.0", id, result: page };
    },
  );

  const ecrire = outilMutation(
    {
      nom: "odoo_ecrire_lead",
      description: "Prépare l'écriture de valeurs sur des leads Odoo (execute_kw, méthode write du modèle crm.lead).",
      schemaEntree: DEFS.odoo_ecrire_lead.schemaEntree,
      destructif: DEFS.odoo_ecrire_lead.destructif,
      requeteReelle: "execute_kw(db, uid, clé, 'crm.lead', 'write', [ids, valeurs])",
      resume: (a) => `écriture de ${Object.keys(a.values).length} champ(s) sur ${a.ids.length} lead(s).`,
    },
    (a) => {
      if (Object.keys(a.values).length === 0) throw new Error("Aucune valeur à écrire.");
      for (const identifiant of a.ids) exigerContact(String(identifiant), "Odoo");
    },
  );

  return { service: "odoo", mode: "demonstration", outils: [leads, ecrire] };
}
