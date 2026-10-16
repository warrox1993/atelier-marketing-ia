// HubSpot CRM en mode réel (service « crm ») : API REST CRM v3 (et v4 pour les associations).
//
// Choix : appel direct de l'API REST plutôt que relais vers le serveur MCP distant officiel de HubSpot
// (https://mcp.hubspot.com, https://developers.hubspot.com/docs/build-with-ai/remote-mcp-server). Raisons :
//   1. les outils du MCP HubSpot ont leurs propres noms et formes, définis et changés par HubSpot ; les
//      outils de l'atelier (crm_contacts, crm_transactions, crm_modifier_contact) doivent garder EXACTEMENT
//      les formes CRM v3 de L7, ce que l'API REST versionnée garantit et qu'un relais devrait retraduire ;
//   2. la garde des mutations (preuve d'approbation, idempotence, réconciliation) exige de savoir exactement
//      quelle requête part : impossible à garantir à travers un agent-outil tiers ;
//   3. un relais MCP dans MCP ajouterait un second client OAuth (une « MCP auth app » HubSpot) pour le même compte.
// Le serveur MCP officiel reste utilisable À CÔTÉ, comme connexion native distincte (lot L1).
//
// Requêtes (documentation consultée le 15/10/2026) :
//   crm_contacts / crm_transactions  POST /crm/v3/objects/{contacts|deals}/search, filtre createdate BETWEEN
//       (millisecondes), tri createdate croissant, limit ≤ 200, curseur after, 10 000 résultats au plus, 5 requêtes/s
//       https://developers.hubspot.com/docs/api-reference/search/guide
//   associations des affaires        POST /crm/v4/associations/deals/contacts/batch/read
//   crm_modifier_contact             PATCH /crm/v3/objects/contacts/{id} { properties }
//       https://developers.hubspot.com/docs/api-reference/crm-contacts-v3/guide

import type { FournisseurService, OutilPasserelle } from "../../fournisseurs.js";
import { definitionsHubspot } from "../../commun/social-crm/hubspot.js";
import type { AccesPlateforme } from "./autorisation.js";
import { DateReelle, gabarit, lendemain, liste, msDate, objet, texte, verifierAu, verifierPeriode } from "./commun.js";
import { lire, mutationReelle, type Reconciliation } from "./execution.js";
import { envoyer, ErreurFournisseur, verifierReponse } from "./http.js";
import type { DependancesOutils } from "./meta.js";

const PROPRIETES_CONTACT = ["createdate", "email", "firstname", "lastname", "phone", "city", "zip", "lifecyclestage", "hs_lead_status", "hs_analytics_source", "hs_object_id", "lastmodifieddate", "etablissement", "metier"] as const;
const PROPRIETES_AFFAIRE = ["dealname", "amount", "dealstage", "pipeline", "createdate", "closedate", "hs_lastmodifieddate", "hs_object_id", "etablissement", "metier"] as const;
const PROPRIETES_LECTURE_SEULE = new Set(["hs_object_id", "createdate", "lastmodifieddate", "hs_analytics_source"]);

async function appelHubspot(dep: DependancesOutils, acces: AccesPlateforme, methode: "GET" | "POST" | "PATCH", chemin: string, cible: string, corps?: unknown) {
  const jeton = acces.secrets.acces;
  if (!jeton) throw new ErreurFournisseur("jeton_expire", "Aucun jeton pour cette connexion : reconnectez le service dans Paperclip (Apps).");
  const reponse = await envoyer({ methode, url: `${dep.config.adresses.hubspotApi}${chemin}`, auth: { type: "bearer", jeton }, ...(corps !== undefined ? { corps } : {}) }, "hubspot", dep.config.delaiAppelMs);
  verifierReponse(reponse, "hubspot", cible);
  return objet(reponse.json);
}

/** Propriétés à la forme L7 : toutes les clés présentes, null quand HubSpot n'a pas de valeur (ou pas la propriété). */
function proprietes(brut: unknown, cles: readonly string[]): Record<string, string | null> {
  const p = objet(brut);
  const sortie: Record<string, string | null> = {};
  for (const c of cles) sortie[c] = typeof p[c] === "string" ? (p[c] as string) : null;
  return sortie;
}

function recherche(debut: string, fin: string, cles: readonly string[], limit: number, after?: string) {
  return {
    filterGroups: [{ filters: [{ propertyName: "createdate", operator: "BETWEEN", value: String(msDate(debut)), highValue: String(msDate(lendemain(fin)) - 1) }] }],
    sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
    properties: [...cles],
    limit,
    ...(after ? { after } : {}),
  };
}

const DEFS = definitionsHubspot(DateReelle);

export function fournisseurHubspotReel(dep: DependancesOutils): FournisseurService {
  const pagination = (objetCrm: string, r: Record<string, unknown>, limit: number) => {
    const after = texte(objet(objet(r["paging"])["next"])["after"]);
    if (!after) return {};
    return { paging: { next: { after, link: `${dep.config.adresses.hubspotApi}/crm/v3/objects/${objetCrm}?limit=${limit}&after=${after}` } } };
  };

  const g1 = gabarit(DEFS.crm_contacts, "Contacts HubSpot créés sur une période (POST /crm/v3/objects/contacts/search, filtre createdate) : results[] (id, properties dont lifecyclestage, hs_lead_status, hs_analytics_source, createdAt, updatedAt, archived) et paging.next.after. État actuel du CRM.");
  const contacts: OutilPasserelle = {
    ...g1,
    executer: (brut, contexte) =>
      lire(dep, contexte, async (acces) => {
        const a = brut as { debut: string; fin: string; au?: string; limit: number; after?: string };
        verifierPeriode(a.debut, a.fin);
        verifierAu(a.au);
        const r = await appelHubspot(dep, acces, "POST", "/crm/v3/objects/contacts/search", "les contacts", recherche(a.debut, a.fin, PROPRIETES_CONTACT, a.limit, a.after));
        const results = liste(r["results"]).map(objet).map((c) => ({
          id: texte(c["id"]),
          properties: proprietes(c["properties"], PROPRIETES_CONTACT),
          createdAt: texte(c["createdAt"]),
          updatedAt: texte(c["updatedAt"]),
          archived: c["archived"] === true,
        }));
        return { results, ...pagination("contacts", r, a.limit) };
      }),
  };

  const g2 = gabarit(DEFS.crm_transactions, "Affaires HubSpot créées sur une période (POST /crm/v3/objects/deals/search, filtre createdate) : results[] (id, properties dont dealname, amount, dealstage, pipeline, createdate, closedate ; associations.contacts) et paging.next.after. État actuel du CRM.");
  const transactions: OutilPasserelle = {
    ...g2,
    executer: (brut, contexte) =>
      lire(dep, contexte, async (acces) => {
        const a = brut as { debut: string; fin: string; au?: string; limit: number; after?: string };
        verifierPeriode(a.debut, a.fin);
        verifierAu(a.au);
        const r = await appelHubspot(dep, acces, "POST", "/crm/v3/objects/deals/search", "les affaires", recherche(a.debut, a.fin, PROPRIETES_AFFAIRE, a.limit, a.after));
        const affaires = liste(r["results"]).map(objet);
        const parAffaire = new Map<string, { id: string; type: string }[]>();
        if (affaires.length > 0) {
          const assoc = await appelHubspot(dep, acces, "POST", "/crm/v4/associations/deals/contacts/batch/read", "les associations des affaires", { inputs: affaires.map((d) => ({ id: texte(d["id"]) })) });
          for (const ligne of liste(assoc["results"]).map(objet)) {
            const de = texte(objet(ligne["from"])["id"]);
            parAffaire.set(de, liste(ligne["to"]).map(objet).map((t) => ({ id: texte(t["toObjectId"]), type: "deal_to_contact" })));
          }
        }
        const results = affaires.map((d) => ({
          id: texte(d["id"]),
          properties: proprietes(d["properties"], PROPRIETES_AFFAIRE),
          createdAt: texte(d["createdAt"]),
          updatedAt: texte(d["updatedAt"]),
          archived: d["archived"] === true,
          associations: { contacts: { results: parAffaire.get(texte(d["id"])) ?? [] } },
        }));
        return { results, ...pagination("deals", r, a.limit) };
      }),
  };

  type ArgsModifier = { contact_id: string; properties: Record<string, string> };
  const modifier = mutationReelle<ArgsModifier>(dep, {
    outil: { ...gabarit(DEFS.crm_modifier_contact, "Modifie des propriétés d'un contact HubSpot (PATCH /crm/v3/objects/contacts/{id})."), executer: () => undefined },
    requeteReelle: "PATCH /crm/v3/objects/contacts/{contactId}",
    resume: (a) => `modification de ${Object.keys(a.properties).length} propriété(s) du contact ${a.contact_id}.`,
    verifier: (a) => {
      if (Object.keys(a.properties).length === 0) throw new Error("Aucune propriété à modifier.");
      const interdites = Object.keys(a.properties).filter((c) => PROPRIETES_LECTURE_SEULE.has(c));
      if (interdites.length > 0) throw new Error(`Propriétés en lecture seule : ${interdites.join(", ")}.`);
    },
    executer: async (acces, a) => {
      const r = await appelHubspot(dep, acces, "PATCH", `/crm/v3/objects/contacts/${encodeURIComponent(a.contact_id)}`, `le contact ${a.contact_id}`, { properties: a.properties });
      return { id: texte(r["id"]) || a.contact_id };
    },
    // Modification idempotente : on relit le contact ; valeurs déjà en place = effet constaté.
    reconcilier: async (acces, a): Promise<Reconciliation> => {
      const cles = Object.keys(a.properties);
      const r = await appelHubspot(dep, acces, "GET", `/crm/v3/objects/contacts/${encodeURIComponent(a.contact_id)}?properties=${cles.map(encodeURIComponent).join(",")}`, `le contact ${a.contact_id}`);
      const p = objet(r["properties"]);
      return cles.every((c) => p[c] === a.properties[c]) ? { etat: "trouve", resultat: { id: a.contact_id } } : { etat: "absent" };
    },
  });

  return { service: "crm", mode: "reel", outils: [contacts, transactions, modifier] };
}
