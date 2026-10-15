/**
 * Preuve d'approbation humaine des diffusions RÉELLES (revue de sécurité, §6).
 *
 * Règle pure : `preparerPreuve` ne signe que si TOUT est vrai, sinon la diffusion reste
 * « préparée » avec le motif. La passerelle refuse toute mutation réelle sans preuve valide ;
 * le plugin est le seul détenteur de la clé privée (secret natif de Paperclip). Jamais de
 * signature en démonstration, ni pour une campagne payante (aucun outil de la passerelle).
 */
import type { KeyObject } from "node:crypto";
import type { ApprobationPortee } from "../contrats/index.js";
import { DUREE_MAX_PREUVE_S, empreinteArguments, signerPreuve, type ChargePreuve } from "./signatures.js";

/** Forme d'un outil d'écriture de la passerelle (schémas de `passerelle/src/demo/social-crm/*.ts`). */
interface OutilEcriture {
  service: string;
  action: "publier" | "envoyer" | "modifier_crm";
  requises: readonly string[];
  facultatives: readonly string[];
  /** Champs texte publiés : chacun doit figurer TEL QUEL dans la révision approuvée. */
  textes: readonly string[];
  /** Champ objet dont chaque valeur scalaire doit figurer telle quelle dans la révision approuvée (CRM). */
  valeurs?: string;
}

export const OUTILS_ECRITURE: Readonly<Record<string, OutilEcriture>> = {
  facebook_publier: { service: "facebook", action: "publier", requises: ["message"], facultatives: ["link"], textes: ["message", "link"] },
  instagram_publier: { service: "instagram", action: "publier", requises: ["caption", "image_url"], facultatives: [], textes: ["caption", "image_url"] },
  linkedin_publier: { service: "linkedin", action: "publier", requises: ["commentary"], facultatives: [], textes: ["commentary"] },
  facebook_envoyer_message: { service: "facebook", action: "envoyer", requises: ["destinataire", "texte"], facultatives: [], textes: ["texte"] },
  crm_modifier_contact: { service: "crm", action: "modifier_crm", requises: ["contact_id", "properties"], facultatives: [], textes: [], valeurs: "properties" },
  pipedrive_modifier_personne: { service: "pipedrive", action: "modifier_crm", requises: ["id", "champs"], facultatives: [], textes: [], valeurs: "champs" },
  odoo_ecrire_lead: { service: "odoo", action: "modifier_crm", requises: ["ids", "values"], facultatives: [], textes: [], valeurs: "values" },
  teamleader_modifier_contact: { service: "teamleader", action: "modifier_crm", requises: ["id", "modifications"], facultatives: [], textes: [], valeurs: "modifications" },
};

/** Canal approuvé → service de la passerelle (table explicite, aucune comparaison approximative). */
export const SERVICE_DU_CANAL: Readonly<Record<string, string>> = {
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  crm: "crm",
  hubspot: "crm",
  pipedrive: "pipedrive",
  odoo: "odoo",
  teamleader: "teamleader",
};

const SERVICES_RESEAUX = new Set(["facebook", "instagram", "linkedin"]);

/** Comparaison « tel quel » : seules la forme Unicode et les fins de ligne sont normalisées. */
function normaliser(t: string): string {
  return t.normalize("NFC").replace(/\r\n?/gu, "\n");
}

export interface EntreePreuve {
  mode: "demonstration" | "reel";
  demande: {
    action: string;
    canal: string;
    compte: string | null;
    cleIdempotence: string;
    service?: string;
    outil?: string;
    arguments?: Record<string, unknown>;
  };
  decision: { id: string; creeLe: string; portee: ApprobationPortee };
  diffusionId: string;
  /** Corps de la révision APPROUVÉE (révision courante, vérifiée par la règle de diffusion). */
  corpsRevision: string;
  /** Clé privée résolue depuis le secret natif ; null si absente ou illisible (motif fourni). */
  clePrivee: KeyObject | null;
  motifCle?: string;
  maintenant: Date;
}

export type ResultatPreuve = { ok: true; preuve: string; charge: ChargePreuve } | { ok: false; motif: string };

export function preparerPreuve(e: EntreePreuve): ResultatPreuve {
  if (e.mode !== "reel") return { ok: false, motif: "démonstration : aucune preuve n'est jamais signée" };
  const d = e.demande;
  if (d.action === "activer_campagne_payante") return { ok: false, motif: "aucun outil de la passerelle n'active une campagne payante : rien n'est signé" };
  if (!d.service || !d.outil || !d.arguments) {
    return { ok: false, motif: "appel d'outil non précisé : indiquer service, outil et arguments EXACTS de l'appel à la passerelle" };
  }
  const outil = OUTILS_ECRITURE[d.outil];
  if (!outil) return { ok: false, motif: `outil « ${d.outil} » : ce n'est pas un outil d'écriture connu de la passerelle` };
  if (outil.service !== d.service) return { ok: false, motif: `l'outil « ${d.outil} » n'appartient pas au service « ${d.service} »` };
  if (outil.action !== d.action) return { ok: false, motif: `l'outil « ${d.outil} » ne correspond pas à l'action « ${d.action} »` };

  const p = e.decision.portee;
  const canal = (p.canal ?? "").trim().toLowerCase();
  if (SERVICE_DU_CANAL[canal] !== d.service) return { ok: false, motif: `le canal approuvé « ${p.canal ?? "aucun"} » ne correspond pas au service « ${d.service} »` };
  if (p.compte === null || d.compte === null || p.compte !== d.compte) {
    return { ok: false, motif: SERVICES_RESEAUX.has(d.service) ? "compte non lié : une publication sur un réseau exige le compte approuvé (jamais « tout compte »)" : "compte non lié : l'approbation doit viser le compte exact" };
  }

  // Arguments : exactement les clés du schéma de l'outil (la passerelle signe après validation Zod :
  // un argument en trop ferait échouer la preuve), sans valeur indéfinie, sans preuve.
  const cles = Object.keys(d.arguments);
  const permises = new Set([...outil.requises, ...outil.facultatives]);
  const inconnues = cles.filter((k) => !permises.has(k));
  if (inconnues.length > 0) return { ok: false, motif: `arguments inconnus de l'outil : ${inconnues.join(", ")}` };
  const manquantes = outil.requises.filter((k) => d.arguments![k] === undefined || d.arguments![k] === null);
  if (manquantes.length > 0) return { ok: false, motif: `arguments obligatoires absents : ${manquantes.join(", ")}` };
  if (cles.some((k) => d.arguments![k] === undefined)) return { ok: false, motif: "argument sans valeur" };

  // Le contenu publié figure TEL QUEL dans la révision approuvée.
  const corps = normaliser(e.corpsRevision);
  for (const champ of outil.textes) {
    const v = d.arguments[champ];
    if (v === undefined) continue;
    if (typeof v !== "string" || v.trim() === "") return { ok: false, motif: `« ${champ} » doit être un texte non vide` };
    if (!corps.includes(normaliser(v))) return { ok: false, motif: `« ${champ} » ne figure pas tel quel dans la révision approuvée du livrable` };
  }
  if (outil.valeurs) {
    const objet = d.arguments[outil.valeurs];
    if (!objet || typeof objet !== "object" || Array.isArray(objet) || Object.keys(objet).length === 0) {
      return { ok: false, motif: `« ${outil.valeurs} » doit lister au moins une modification` };
    }
    for (const [cle, v] of Object.entries(objet as Record<string, unknown>)) {
      if (!["string", "number", "boolean"].includes(typeof v)) return { ok: false, motif: `« ${outil.valeurs}.${cle} » : valeur non scalaire` };
      if (!corps.includes(normaliser(String(v)))) return { ok: false, motif: `« ${outil.valeurs}.${cle} » : la valeur ne figure pas telle quelle dans la révision approuvée` };
    }
  }

  if (!e.clePrivee) return { ok: false, motif: e.motifCle ?? "aucune clé d'approbation configurée" };

  let empreinte: string;
  try {
    empreinte = empreinteArguments(d.arguments);
  } catch {
    return { ok: false, motif: "arguments non représentables en JSON canonique" };
  }
  const emis = Math.floor(e.maintenant.getTime() / 1000);
  const finDecision = p.dureeJours !== null ? Math.floor(new Date(e.decision.creeLe).getTime() / 1000) + p.dureeJours * 86_400 : Number.POSITIVE_INFINITY;
  const expire = Math.min(emis + DUREE_MAX_PREUVE_S, finDecision);
  if (expire <= emis) return { ok: false, motif: "l'approbation a expiré" };
  const charge: ChargePreuve = {
    v: 1, cle: d.cleIdempotence, service: d.service, outil: d.outil, empreinte, compte: p.compte,
    diffusion: e.diffusionId, decision: e.decision.id, emis, expire,
  };
  return { ok: true, preuve: signerPreuve(e.clePrivee, charge), charge };
}
