// Odoo en mode réel : leads et opportunités `crm.lead`.
//
// Choix (documentation https://www.odoo.com/documentation/19.0/developer/reference/external_api.html, lue le
// 15/10/2026) : l'API recommandée est JSON-2 (« New in version 19.0 ») : POST /json/2/<modèle>/<méthode>,
// clé d'API en « Authorization: bearer », en-tête X-Odoo-Database facultatif, arguments tous nommés, réponse =
// valeur de retour de la méthode (200) ou objet d'erreur { name, message, arguments } (4xx/5xx). Les points
// /xmlrpc, /xmlrpc/2 et /jsonrpc sont « scheduled for removal in Odoo 22 (fall 2028) / Odoo Online 21.1
// (winter 2027) » : ils ne servent qu'en REPLI pour une instance antérieure à la 19 (version lue sur /web/version
// à la connexion), avec execute_kw(base, uid, clé, modèle, méthode, args, kw).
// Attention (même page) : l'accès à l'API externe n'existe que sur les formules Odoo « Custom », pas sur
// « One App Free » ni « Standard ».
//
//   odoo_leads_search_read  search_read sur crm.lead, domaine de période ajouté (create_date), champs du
//                           simulateur L7 limités à ceux que l'instance possède (fields_get)
//   odoo_ecrire_lead        write(ids, vals) ; réconciliation par read

import type { FournisseurService, OutilPasserelle } from "../../fournisseurs.js";
import { definitionsOdoo } from "../../commun/social-crm/odoo.js";
import type { AccesPlateforme } from "./autorisation.js";
import { DateReelle, gabarit, lendemain, liste, objet, texte, verifierAu, verifierPeriode } from "./commun.js";
import { lire, mutationReelle, type Reconciliation } from "./execution.js";
import { envoyer, ErreurFournisseur, verifierReponse } from "./http.js";
import type { DependancesOutils } from "./meta.js";

const CHAMPS_L7 = [
  "id", "name", "type", "contact_name", "partner_name", "email_from", "phone", "city", "zip", "stage_id", "expected_revenue",
  "create_date", "write_date", "date_closed", "won_status", "active", "user_id", "team_id", "partner_id", "probability",
  "x_etablissement", "x_metier",
];

/** Appel d'une méthode de modèle, en JSON-2 ou en JSON-RPC selon l'instance. `positionnels` sert au repli JSON-RPC. */
async function appelOdoo(
  dep: DependancesOutils,
  acces: AccesPlateforme,
  modele: string,
  methode: string,
  nommes: Record<string, unknown>,
  positionnels: unknown[],
  kw: Record<string, unknown>,
  cible: string,
): Promise<unknown> {
  const base = texte(acces.details["base"]);
  const cle = acces.secrets.cleApi;
  if (!base || !cle) throw new ErreurFournisseur("jeton_expire", "Connexion Odoo incomplète : reconnectez le service dans Paperclip (Apps).");
  const bd = texte(acces.details["bd"]);
  if (acces.details["protocole"] === "json2") {
    const reponse = await envoyer(
      { methode: "POST", url: `${base}/json/2/${modele}/${methode}`, corps: nommes, auth: { type: "bearer", jeton: cle }, adresseSaisie: { essai: dep.config.essai }, ...(bd ? { entetes: { "X-Odoo-Database": bd } } : {}) },
      "odoo",
      dep.config.delaiAppelMs,
    );
    verifierReponse(reponse, "odoo", cible);
    return reponse.json;
  }
  const uid = Number(acces.details["uid"]);
  const reponse = await envoyer(
    { methode: "POST", url: `${base}/jsonrpc`, corps: { jsonrpc: "2.0", method: "call", id: 1, params: { service: "object", method: "execute_kw", args: [bd, uid, cle, modele, methode, positionnels, kw] } }, adresseSaisie: { essai: dep.config.essai } },
    "odoo",
    dep.config.delaiAppelMs,
  );
  verifierReponse(reponse, "odoo", cible);
  return objet(reponse.json)["result"];
}

/** Champs de crm.lead présents sur l'instance (gardés en mémoire par octroi). */
const champsParOctroi = new Map<string, Set<string>>();

async function champsInstance(dep: DependancesOutils, acces: AccesPlateforme): Promise<Set<string>> {
  const connu = champsParOctroi.get(acces.octroi);
  if (connu) return connu;
  const r = objet(await appelOdoo(dep, acces, "crm.lead", "fields_get", { attributes: ["type"] }, [], { attributes: ["type"] }, "les champs de crm.lead"));
  const champs = new Set(Object.keys(r));
  champs.add("id");
  champsParOctroi.set(acces.octroi, champs);
  return champs;
}

const DEFS = definitionsOdoo(DateReelle);

export function fournisseurOdooReel(dep: DependancesOutils): FournisseurService {

  const g1 = gabarit(DEFS.odoo_leads_search_read, "Leads et opportunités Odoo (crm.lead) créés sur une période, par search_read (API JSON-2 d'Odoo 19, repli JSON-RPC pour les versions antérieures), rendus à la forme { jsonrpc, id, result: [enregistrements] }. Les champs vides valent false, stage_id vaut [id, nom] ; les enregistrements archivés sont exclus sauf si le domaine filtre `active`. État actuel du CRM.");
  const leads: OutilPasserelle = {
    ...g1,
    executer: (brut, contexte) =>
      lire(dep, contexte, async (acces) => {
        const a = brut as { debut: string; fin: string; au?: string; domain: unknown[]; fields: string[]; offset: number; limit: number; order: string; id: number };
        verifierPeriode(a.debut, a.fin);
        verifierAu(a.au);
        const domaine = [["create_date", ">=", `${a.debut} 00:00:00`], ["create_date", "<", `${lendemain(a.fin)} 00:00:00`], ...a.domain];
        const disponibles = await champsInstance(dep, acces);
        const champs = a.fields.length > 0 ? a.fields : CHAMPS_L7.filter((c) => disponibles.has(c));
        const absents = a.fields.filter((c) => !disponibles.has(c));
        if (absents.length > 0) throw new Error(`[requete_invalide] Champ invalide « ${absents.join(", ")} » pour le modèle crm.lead de cette instance.`);
        const result = await appelOdoo(dep, acces, "crm.lead", "search_read", { domain: domaine, fields: champs, offset: a.offset, limit: a.limit, order: a.order }, [domaine], { fields: champs, offset: a.offset, limit: a.limit, order: a.order }, "les leads");
        return { jsonrpc: "2.0", id: a.id, result: liste(result) };
      }),
  };

  type ArgsEcrire = { ids: number[]; values: Record<string, string | number | boolean> };
  const ecrire = mutationReelle<ArgsEcrire>(dep, {
    outil: { ...gabarit(DEFS.odoo_ecrire_lead, "Écrit des valeurs sur des leads Odoo (méthode write du modèle crm.lead)."), executer: () => undefined },
    requeteReelle: "POST /json/2/crm.lead/write { ids, vals } (repli : execute_kw(..., 'crm.lead', 'write', [ids, vals]))",
    resume: (a) => `écriture de ${Object.keys(a.values).length} champ(s) sur ${a.ids.length} lead(s).`,
    verifier: (a) => {
      if (Object.keys(a.values).length === 0) throw new Error("Aucune valeur à écrire.");
    },
    executer: async (acces, a) => {
      const r = await appelOdoo(dep, acces, "crm.lead", "write", { ids: a.ids, vals: a.values }, [a.ids, a.values], {}, `les leads ${a.ids.join(", ")}`);
      if (r !== true) throw new ErreurFournisseur("requete_invalide", "Odoo n'a pas confirmé l'écriture.");
      return { ids: a.ids };
    },
    reconcilier: async (acces, a): Promise<Reconciliation> => {
      const cles = Object.keys(a.values);
      const lus = liste(await appelOdoo(dep, acces, "crm.lead", "read", { ids: a.ids, fields: cles }, [a.ids, cles], {}, `les leads ${a.ids.join(", ")}`)).map(objet);
      const valeur = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
      const conforme = lus.length === a.ids.length && lus.every((l) => cles.every((c) => valeur(l[c]) === a.values[c]));
      return conforme ? { etat: "trouve", resultat: { ids: a.ids } } : { etat: "absent" };
    },
  });

  return { service: "odoo", mode: "reel", outils: [leads, ecrire] };
}
