// Pipedrive en mode réel : API v2 (stable ; GET /v1/persons et GET /v1/deals ne figurent plus dans la
// spécification OpenAPI v1 publiée, https://developers.pipedrive.com/docs/api/v1/openapi.yaml, lue le 15/10/2026),
// réponses rendues à la forme v1 des simulateurs L7 (success, data[], additional_data.pagination).
//
// Requêtes (https://developers.pipedrive.com/docs/api/v1/openapi-v2.yaml) :
//   pipedrive_personnes          GET   {base}/api/v2/persons?updated_since=…&sort_by=add_time&sort_direction=asc&limit=500&cursor=…
//   pipedrive_affaires           GET   {base}/api/v2/deals?updated_since=…&sort_by=add_time&sort_direction=asc&limit=500&cursor=…
//   pipedrive_modifier_personne  PATCH {base}/api/v2/persons/{id}
// Pagination v2 : curseur additional_data.next_cursor. Aucun filtre sur la date de création : la période est
// reconstituée (toute personne créée dans la période a été modifiée depuis son début), au plus 20 pages de 500.
// Authentification : jeton OAuth (Authorization: Bearer, base = api_domain de la société) ou jeton d'API
// personnel (en-tête x-api-token, base = https://{societe}.pipedrive.com).

import type { FournisseurService, OutilPasserelle } from "../../fournisseurs.js";
import { fournisseurPipedrive } from "../../demo/social-crm/pipedrive.js";
import type { AccesPlateforme } from "./autorisation.js";
import { gabarit, liste, MAX_PAGES_PARCOURUES, nombre, objet, texte, tropDeResultats, verifierAu, verifierPeriode } from "./commun.js";
import { lire, mutationReelle, type Reconciliation } from "./execution.js";
import { envoyer, ErreurFournisseur, verifierReponse } from "./http.js";
import type { DependancesOutils } from "./meta.js";

async function appelPipedrive(dep: DependancesOutils, acces: AccesPlateforme, methode: "GET" | "PATCH", chemin: string, cible: string, corps?: unknown) {
  const base = texte(acces.details["base"]);
  const auth = acces.secrets.cleApi
    ? ({ type: "pipedrive_api", jeton: acces.secrets.cleApi } as const)
    : acces.secrets.acces
      ? ({ type: "bearer", jeton: acces.secrets.acces } as const)
      : null;
  if (!base || !auth) throw new ErreurFournisseur("jeton_expire", "Connexion Pipedrive incomplète : reconnectez le service dans Paperclip (Apps).");
  const reponse = await envoyer({ methode, url: `${base}${chemin}`, auth, ...(corps !== undefined ? { corps } : {}) }, "pipedrive", dep.config.delaiAppelMs);
  verifierReponse(reponse, "pipedrive", cible);
  return objet(reponse.json);
}

/** « 2026-09-22T08:00:00Z » → « 2026-09-22 08:00:00 » (format v1 des simulateurs L7). */
const horodatageV1 = (iso: unknown): string | null => (typeof iso === "string" && iso !== "" ? iso.replace("T", " ").replace(/(\.\d+)?Z$/, "").slice(0, 19) : null);

function personne(p: Record<string, unknown>) {
  const adresse = objet(p["postal_address"]);
  const coordonnees = (v: unknown) => liste(v).map(objet).map((e) => ({ value: texte(e["value"]), primary: e["primary"] === true, label: texte(e["label"]) || "work" }));
  return {
    id: nombre(p["id"]),
    name: texte(p["name"]),
    first_name: texte(p["first_name"]),
    last_name: texte(p["last_name"]),
    email: coordonnees(p["emails"]),
    phone: coordonnees(p["phones"]),
    add_time: horodatageV1(p["add_time"]),
    update_time: horodatageV1(p["update_time"]),
    // Champs propres à l'atelier : Pipedrive les range sous des clés hachées (custom_fields) ; aucune
    // correspondance n'est devinée. Localité et code postal viennent de l'adresse quand elle existe.
    etablissement: null,
    metier: null,
    localite: typeof adresse["locality"] === "string" ? adresse["locality"] : null,
    code_postal: typeof adresse["postal_code"] === "string" ? adresse["postal_code"] : null,
  };
}

function affaire(d: Record<string, unknown>) {
  return {
    id: nombre(d["id"]),
    title: texte(d["title"]),
    value: nombre(d["value"]),
    currency: texte(d["currency"]),
    status: texte(d["status"]),
    pipeline_id: nombre(d["pipeline_id"]),
    stage_id: nombre(d["stage_id"]),
    person_id: d["person_id"] === null || d["person_id"] === undefined ? null : nombre(d["person_id"]),
    add_time: horodatageV1(d["add_time"]),
    update_time: horodatageV1(d["update_time"]),
    close_time: horodatageV1(d["close_time"]),
    won_time: horodatageV1(d["won_time"]),
    lost_time: horodatageV1(d["lost_time"]),
    etablissement: null,
    metier: null,
  };
}

export function fournisseurPipedriveReel(dep: DependancesOutils): FournisseurService {
  const demo = fournisseurPipedrive();

  /** Éléments créés dans la période, triés par date de création croissante. */
  async function creesDansPeriode(acces: AccesPlateforme, objetCrm: "persons" | "deals", debut: string, fin: string): Promise<Record<string, unknown>[]> {
    const retenus: Record<string, unknown>[] = [];
    let curseur: string | null = null;
    for (let page = 0; page < MAX_PAGES_PARCOURUES; page++) {
      const q = new URLSearchParams({ updated_since: `${debut}T00:00:00Z`, sort_by: "add_time", sort_direction: "asc", limit: "500" });
      if (curseur) q.set("cursor", curseur);
      const r = await appelPipedrive(dep, acces, "GET", `/api/v2/${objetCrm}?${q.toString()}`, objetCrm === "persons" ? "les personnes" : "les affaires");
      for (const e of liste(r["data"]).map(objet)) {
        const jour = texte(e["add_time"]).slice(0, 10);
        if (jour > fin) return retenus;
        if (jour >= debut) retenus.push(e);
      }
      curseur = texte(objet(r["additional_data"])["next_cursor"]) || null;
      if (!curseur) return retenus;
    }
    throw tropDeResultats("Pipedrive");
  }

  function enveloppe<T>(elements: T[], start: number, limit: number) {
    const page = elements.slice(start, start + limit);
    const suivant = start + limit < elements.length ? start + limit : null;
    return { success: true, data: page, additional_data: { pagination: { start, limit, more_items_in_collection: suivant !== null, ...(suivant !== null ? { next_start: suivant } : {}) } } };
  }

  const g1 = gabarit(demo, "pipedrive_personnes", "Personnes Pipedrive créées sur une période (API v2 GET /api/v2/persons, rendue à la forme v1) : success, data[] (id, name, first_name, last_name, email[], phone[], add_time, update_time) et additional_data.pagination (start, limit, more_items_in_collection, next_start). État actuel du CRM.");
  const personnes: OutilPasserelle = {
    ...g1,
    executer: (brut, contexte) =>
      lire(dep, contexte, async (acces) => {
        const a = brut as { debut: string; fin: string; au?: string; start: number; limit: number };
        verifierPeriode(a.debut, a.fin);
        verifierAu(a.au);
        return enveloppe((await creesDansPeriode(acces, "persons", a.debut, a.fin)).map(personne), a.start, a.limit);
      }),
  };

  const g2 = gabarit(demo, "pipedrive_affaires", "Affaires Pipedrive créées sur une période (API v2 GET /api/v2/deals, rendue à la forme v1) : success, data[] (id, title, value, currency, status open|won|lost, stage_id, person_id, add_time, update_time, close_time, won_time, lost_time) et additional_data.pagination. État actuel du CRM.");
  const affaires: OutilPasserelle = {
    ...g2,
    executer: (brut, contexte) =>
      lire(dep, contexte, async (acces) => {
        const a = brut as { debut: string; fin: string; au?: string; start: number; limit: number };
        verifierPeriode(a.debut, a.fin);
        verifierAu(a.au);
        return enveloppe((await creesDansPeriode(acces, "deals", a.debut, a.fin)).map(affaire), a.start, a.limit);
      }),
  };

  type ArgsModifier = { id: number; champs: Record<string, string | number | boolean> };
  /** Champs v1 « à plat » des simulateurs → corps v2 : email et phone deviennent emails[] et phones[]. */
  const corpsV2 = (champs: ArgsModifier["champs"]): Record<string, unknown> => {
    const corps: Record<string, unknown> = {};
    for (const [cle, valeur] of Object.entries(champs)) {
      if (cle === "email") corps["emails"] = [{ value: String(valeur), primary: true, label: "work" }];
      else if (cle === "phone") corps["phones"] = [{ value: String(valeur), primary: true, label: "work" }];
      else corps[cle] = valeur;
    }
    return corps;
  };
  const modifier = mutationReelle<ArgsModifier>(dep, {
    outil: { ...gabarit(demo, "pipedrive_modifier_personne", "Modifie une personne Pipedrive (PATCH /api/v2/persons/{id} ; « email » et « phone » remplacent l'adresse et le numéro principaux)."), executer: () => undefined },
    requeteReelle: "PATCH /api/v2/persons/{id}",
    resume: (a) => `modification de ${Object.keys(a.champs).length} champ(s) de la personne ${a.id}.`,
    verifier: (a) => {
      if (Object.keys(a.champs).length === 0) throw new Error("Aucun champ à modifier.");
    },
    executer: async (acces, a) => {
      const r = await appelPipedrive(dep, acces, "PATCH", `/api/v2/persons/${a.id}`, `la personne ${a.id}`, corpsV2(a.champs));
      return { id: nombre(objet(r["data"])["id"], a.id) };
    },
    reconcilier: async (acces, a): Promise<Reconciliation> => {
      const p = objet((await appelPipedrive(dep, acces, "GET", `/api/v2/persons/${a.id}`, `la personne ${a.id}`))["data"]);
      const conforme = Object.entries(a.champs).every(([cle, valeur]) => {
        if (cle === "email" || cle === "phone") return liste(p[cle === "email" ? "emails" : "phones"]).map(objet).some((e) => e["primary"] === true && e["value"] === String(valeur));
        return p[cle] === valeur;
      });
      return conforme ? { etat: "trouve", resultat: { id: a.id } } : { etat: "absent" };
    },
  });

  return { service: "pipedrive", mode: "reel", outils: [personnes, affaires, modifier] };
}
