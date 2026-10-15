// Teamleader Focus en mode réel : API https://api.focus.teamleader.eu (POST /<ressource>.<action>, JSON).
//
// Champs relevés le 15/10/2026 dans la spécification OpenAPI embarquée dans https://developer.focus.teamleader.eu/
// (pages contacts.list, deals.list, contacts.update, contacts.info, décodées), ce qui lève la limite 1 de L7 :
//   contacts.list  filter { email, ids, company_id, term, updated_since, tags, status, marketing_mails_consent },
//                  page { size, number }, sort [{ field: added_at|name|updated_at, order }] ; réponse data[] avec
//                  id, first_name, last_name, emails[], telephones[], added_at, updated_at...
//   deals.list     filter { ids, term, customer, phase_id, updated_since, created_before, status[open|won|lost]... },
//                  sort [{ field: created_at|weighted_value }] ; réponse data[] avec status new|open|won|lost, lead,
//                  estimated_value { amount, currency }, current_phase, closed_at, created_at, updated_at...
//   contacts.update { id, first_name, last_name, emails[{type: primary, email}], telephones[{type: phone|mobile|fax, number}]... } → 204
// Limite de débit : 200 requêtes par minute glissante, HTTP 429 et x-ratelimit-reset (page « General Principles »).
// Aucun filtre sur la date de création : la période est reconstituée par updated_since et un tri croissant.

import type { FournisseurService, OutilPasserelle } from "../../fournisseurs.js";
import { fournisseurTeamleader } from "../../demo/social-crm/teamleader.js";
import type { AccesPlateforme } from "./autorisation.js";
import { gabarit, liste, MAX_PAGES_PARCOURUES, objet, texte, tropDeResultats, verifierAu, verifierPeriode } from "./commun.js";
import { lire, mutationReelle, type Reconciliation } from "./execution.js";
import { envoyer, ErreurFournisseur, verifierReponse } from "./http.js";
import type { DependancesOutils } from "./meta.js";

const TAILLE_PAGE = 100;

async function appelTeamleader(dep: DependancesOutils, acces: AccesPlateforme, action: string, corps: unknown, cible: string) {
  const jeton = acces.secrets.acces;
  if (!jeton) throw new ErreurFournisseur("jeton_expire", "Aucun jeton pour cette connexion : reconnectez le service dans Paperclip (Apps).");
  const reponse = await envoyer({ methode: "POST", url: `${dep.config.adresses.teamleaderApi}/${action}`, auth: { type: "bearer", jeton }, corps }, "teamleader", dep.config.delaiAppelMs);
  verifierReponse(reponse, "teamleader", cible);
  return objet(reponse.json);
}

function contact(c: Record<string, unknown>) {
  return {
    id: texte(c["id"]),
    first_name: texte(c["first_name"]),
    last_name: texte(c["last_name"]),
    emails: liste(c["emails"]).map(objet).map((e) => ({ type: texte(e["type"]), email: texte(e["email"]) })),
    telephones: liste(c["telephones"]).map(objet).map((t) => ({ type: texte(t["type"]), number: texte(t["number"]) })),
    added_at: texte(c["added_at"]),
    updated_at: texte(c["updated_at"]),
  };
}

function affaire(d: Record<string, unknown>) {
  const statut = texte(d["status"]);
  const valeur = objet(d["estimated_value"]);
  const phase = objet(d["current_phase"]);
  return {
    id: texte(d["id"]),
    title: texte(d["title"]),
    // « new » (affaire jamais travaillée) est une affaire ouverte dans la forme L7 (open|won|lost).
    status: statut === "new" ? "open" : statut,
    lead: d["lead"] ?? null,
    estimated_value: { amount: typeof valeur["amount"] === "number" ? valeur["amount"] : 0, currency: texte(valeur["currency"]) || "EUR" },
    current_phase: Object.keys(phase).length > 0 ? { type: texte(phase["type"]) || "dealPhase", id: texte(phase["id"]) } : null,
    closed_at: typeof d["closed_at"] === "string" ? d["closed_at"] : null,
    created_at: texte(d["created_at"]),
    updated_at: texte(d["updated_at"]),
  };
}

export function fournisseurTeamleaderReel(dep: DependancesOutils): FournisseurService {
  const demo = fournisseurTeamleader();

  async function creesDansPeriode(acces: AccesPlateforme, action: "contacts.list" | "deals.list", champDate: "added_at" | "created_at", debut: string, fin: string) {
    const retenus: Record<string, unknown>[] = [];
    for (let numero = 1; numero <= MAX_PAGES_PARCOURUES; numero++) {
      const r = await appelTeamleader(dep, acces, action, { filter: { updated_since: `${debut}T00:00:00+00:00` }, sort: [{ field: champDate, order: "asc" }], page: { size: TAILLE_PAGE, number: numero } }, action === "contacts.list" ? "les contacts" : "les affaires");
      const donnees = liste(r["data"]).map(objet);
      for (const e of donnees) {
        const jour = texte(e[champDate]).slice(0, 10);
        if (jour > fin) return retenus;
        if (jour >= debut) retenus.push(e);
      }
      if (donnees.length < TAILLE_PAGE) return retenus;
    }
    throw tropDeResultats("Teamleader");
  }

  const g1 = gabarit(demo, "teamleader_contacts", "Contacts Teamleader créés sur une période (POST /contacts.list) : { data: [{ id, first_name, last_name, emails[], telephones[], added_at, updated_at }] }. Pagination par page.size et page.number. État actuel du CRM.");
  const contacts: OutilPasserelle = {
    ...g1,
    executer: (brut, contexte) =>
      lire(dep, contexte, async (acces) => {
        const a = brut as { debut: string; fin: string; au?: string; page: { size: number; number: number } };
        verifierPeriode(a.debut, a.fin);
        verifierAu(a.au);
        const tous = await creesDansPeriode(acces, "contacts.list", "added_at", a.debut, a.fin);
        const depart = (a.page.number - 1) * a.page.size;
        return { data: tous.slice(depart, depart + a.page.size).map(contact) };
      }),
  };

  const g2 = gabarit(demo, "teamleader_deals", "Affaires Teamleader créées sur une période (POST /deals.list) : { data: [{ id, title, status open|won|lost, lead, estimated_value{amount, currency}, current_phase, closed_at, created_at, updated_at }] }. État actuel du CRM.");
  const deals: OutilPasserelle = {
    ...g2,
    executer: (brut, contexte) =>
      lire(dep, contexte, async (acces) => {
        const a = brut as { debut: string; fin: string; au?: string; page: { size: number; number: number } };
        verifierPeriode(a.debut, a.fin);
        verifierAu(a.au);
        const tous = await creesDansPeriode(acces, "deals.list", "created_at", a.debut, a.fin);
        const depart = (a.page.number - 1) * a.page.size;
        return { data: tous.slice(depart, depart + a.page.size).map(affaire) };
      }),
  };

  type ArgsModifier = { id: string; modifications: Record<string, string | number | boolean> };
  /** Champs « à plat » des simulateurs → corps de contacts.update : email et telephone remplacent les listes. */
  const corpsMaj = (a: ArgsModifier): Record<string, unknown> => {
    const corps: Record<string, unknown> = { id: a.id };
    for (const [cle, valeur] of Object.entries(a.modifications)) {
      if (cle === "email") corps["emails"] = [{ type: "primary", email: String(valeur) }];
      else if (cle === "telephone") corps["telephones"] = [{ type: "phone", number: String(valeur) }];
      else corps[cle] = valeur;
    }
    return corps;
  };
  const modifier = mutationReelle<ArgsModifier>(dep, {
    outil: { ...gabarit(demo, "teamleader_modifier_contact", "Modifie un contact Teamleader (POST /contacts.update ; « email » et « telephone » remplacent les listes d'adresses et de numéros)."), executer: () => undefined },
    requeteReelle: "POST /contacts.update",
    resume: (a) => `modification de ${Object.keys(a.modifications).length} champ(s) du contact ${a.id}.`,
    verifier: (a) => {
      if (Object.keys(a.modifications).length === 0) throw new Error("Aucune modification demandée.");
    },
    executer: async (acces, a) => {
      await appelTeamleader(dep, acces, "contacts.update", corpsMaj(a), `le contact ${a.id}`);
      return { id: a.id };
    },
    reconcilier: async (acces, a): Promise<Reconciliation> => {
      const c = objet((await appelTeamleader(dep, acces, "contacts.info", { id: a.id }, `le contact ${a.id}`))["data"]);
      const conforme = Object.entries(a.modifications).every(([cle, valeur]) => {
        if (cle === "email") return liste(c["emails"]).map(objet).some((e) => e["email"] === String(valeur));
        if (cle === "telephone") return liste(c["telephones"]).map(objet).some((t) => t["number"] === String(valeur));
        return c[cle] === valeur;
      });
      return conforme ? { etat: "trouve", resultat: { id: a.id } } : { etat: "absent" };
    },
  });

  return { service: "teamleader", mode: "reel", outils: [contacts, deals, modifier] };
}
