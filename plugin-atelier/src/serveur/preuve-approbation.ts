/**
 * Preuve d'approbation humaine des diffusions RÉELLES (revue de sécurité, §6).
 *
 * Règle pure : `preparerPreuve` ne signe que si TOUT est vrai, sinon la diffusion reste
 * « préparée » avec le motif. v1.6 (revue des signatures S-1) : l'humain approuve l'APPEL EXACT
 * (empreinte canonique de service, outil, compte et arguments complets, `portee.appel`) ; le plugin ne
 * signe que cet appel. Le contrôle « figure tel quel » reste un garde-fou supplémentaire, jamais la
 * garantie. S-4 : la charge de la première preuve est figée, un rejeu la re-signe à l'identique. La passerelle refuse toute mutation réelle sans preuve valide ;
 * le plugin est le seul détenteur de la clé privée (secret natif de Paperclip). Jamais de
 * signature en démonstration, ni pour une campagne payante (aucun outil de la passerelle).
 */
import type { KeyObject } from "node:crypto";
import type { ApprobationPortee } from "../contrats/index.js";
import { DUREE_MAX_PREUVE_S, cleIdempotenceSignee, empreinteAppel, empreinteArguments, signerPreuve, type ChargePreuve } from "./signatures.js";

/** Forme d'un outil d'écriture de la passerelle (schémas de `passerelle/src/demo/social-crm/*.ts`). */
interface OutilEcriture {
  service: string;
  action: "publier" | "envoyer" | "modifier_crm";
  requises: readonly string[];
  facultatives: readonly string[];
  /** Champs texte publiés : chacun doit figurer TEL QUEL dans la révision approuvée (garde-fou supplémentaire). */
  textes: readonly string[];
  /** Champs qui désignent la cible (destinataire, contact, fiche) : montrés à l'humain, liés par l'empreinte. */
  cibles: readonly string[];
  /** Champ objet dont chaque valeur scalaire doit figurer telle quelle dans la révision approuvée (CRM). */
  valeurs?: string;
}

export const OUTILS_ECRITURE: Readonly<Record<string, OutilEcriture>> = {
  facebook_publier: { service: "facebook", action: "publier", requises: ["message"], facultatives: ["link"], cibles: [], textes: ["message", "link"] },
  instagram_publier: { service: "instagram", action: "publier", requises: ["caption", "image_url"], facultatives: [], cibles: [], textes: ["caption", "image_url"] },
  linkedin_publier: { service: "linkedin", action: "publier", requises: ["commentary"], facultatives: [], cibles: [], textes: ["commentary"] },
  facebook_envoyer_message: { service: "facebook", action: "envoyer", requises: ["destinataire", "texte"], facultatives: [], cibles: ["destinataire"], textes: ["texte"] },
  crm_modifier_contact: { service: "crm", action: "modifier_crm", requises: ["contact_id", "properties"], facultatives: [], cibles: ["contact_id"], textes: [], valeurs: "properties" },
  pipedrive_modifier_personne: { service: "pipedrive", action: "modifier_crm", requises: ["id", "champs"], facultatives: [], cibles: ["id"], textes: [], valeurs: "champs" },
  odoo_ecrire_lead: { service: "odoo", action: "modifier_crm", requises: ["ids", "values"], facultatives: [], cibles: ["ids"], textes: [], valeurs: "values" },
  teamleader_modifier_contact: { service: "teamleader", action: "modifier_crm", requises: ["id", "modifications"], facultatives: [], cibles: ["id"], textes: [], valeurs: "modifications" },
  // Lot P9b : export de prospects vers le CRM du client (création de contacts ; outils de la passerelle au lot P14).
  // `contacts` : liste des prospects exportés (référence, dénomination, BCE, zone, canal) ; liée par l'empreinte approuvée.
  crm_creer_contact: { service: "crm", action: "modifier_crm", requises: ["contacts"], facultatives: [], cibles: ["contacts"], textes: [] },
  pipedrive_creer_personne: { service: "pipedrive", action: "modifier_crm", requises: ["contacts"], facultatives: [], cibles: ["contacts"], textes: [] },
  teamleader_creer_contact: { service: "teamleader", action: "modifier_crm", requises: ["contacts"], facultatives: [], cibles: ["contacts"], textes: [] },
  odoo_creer_lead: { service: "odoo", action: "modifier_crm", requises: ["contacts"], facultatives: [], cibles: ["contacts"], textes: [] },
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

/** Libellés montrés à l'humain pour les champs d'un appel. */
const LIBELLES: Readonly<Record<string, string>> = {
  message: "Texte publié", link: "Lien publié", caption: "Légende publiée", image_url: "Image publiée", commentary: "Texte publié",
  texte: "Message envoyé", destinataire: "Destinataire", contact_id: "Contact modifié", id: "Fiche modifiée", ids: "Fiches modifiées", contacts: "Contacts créés",
};

/** Est-ce un outil d'écriture (liste connue, ou nom d'action d'écriture) ? Utilisé au dépôt (S-3). */
export function estOutilEcriture(outil: string): boolean {
  return Object.hasOwn(OUTILS_ECRITURE, outil) || /(?:^|_)(?:publier|envoyer|modifier|ecrire|creer|supprimer|programmer)(?:_|$)/u.test(outil);
}

const enTexte = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

export interface ApercuAppel {
  resume: string;
  cibles: Array<{ champ: string; libelle: string; valeur: string }>;
  textes: Array<{ champ: string; libelle: string; valeur: string }>;
  proprietes: Array<{ champ: string; libelle: string; valeur: string }>;
}

export type ResultatControleAppel =
  | { ok: true; action: OutilEcriture["action"]; empreinte: string; empreinteArguments: string; apercu: ApercuAppel }
  | { ok: false; motif: string };

/**
 * Contrôle d'un appel d'outil d'écriture contre le schéma de l'outil et la révision du livrable, et
 * aperçu à montrer à l'humain. Sert à la proposition (avant l'approbation) et à la signature.
 */
export function controlerAppel(a: { service: string; outil: string; compte: string | null; arguments: Record<string, unknown> }, corpsRevision: string): ResultatControleAppel {
  const outil = Object.hasOwn(OUTILS_ECRITURE, a.outil) ? OUTILS_ECRITURE[a.outil] : undefined;
  if (!outil) return { ok: false, motif: `outil « ${a.outil} » : ce n'est pas un outil d'écriture connu de la passerelle` };
  if (outil.service !== a.service) return { ok: false, motif: `l'outil « ${a.outil} » n'appartient pas au service « ${a.service} »` };
  if (a.compte === null || a.compte.trim() === "") return { ok: false, motif: "compte non lié : l'appel doit viser un compte exact (jamais « tout compte »)" };

  // Arguments : exactement les clés du schéma de l'outil (la passerelle signe après validation Zod :
  // un argument en trop ferait échouer la preuve), sans valeur indéfinie, sans preuve.
  const args = a.arguments;
  const cles = Object.keys(args);
  const permises = new Set([...outil.requises, ...outil.facultatives]);
  const inconnues = cles.filter((k) => !permises.has(k));
  if (inconnues.length > 0) return { ok: false, motif: `arguments inconnus de l'outil : ${inconnues.join(", ")}` };
  const manquantes = outil.requises.filter((k) => args[k] === undefined || args[k] === null);
  if (manquantes.length > 0) return { ok: false, motif: `arguments obligatoires absents : ${manquantes.join(", ")}` };
  if (cles.some((k) => args[k] === undefined)) return { ok: false, motif: "argument sans valeur" };

  // Garde-fou supplémentaire (jamais la garantie, qui est l'empreinte approuvée) : le contenu publié
  // figure TEL QUEL dans la révision qui a passé la porte.
  const corps = normaliser(corpsRevision);
  for (const champ of outil.textes) {
    const v = args[champ];
    if (v === undefined) continue;
    if (typeof v !== "string" || v.trim() === "") return { ok: false, motif: `« ${champ} » doit être un texte non vide` };
    if (!corps.includes(normaliser(v))) return { ok: false, motif: `« ${champ} » ne figure pas tel quel dans la révision approuvée du livrable` };
  }
  if (outil.valeurs) {
    const objet = args[outil.valeurs];
    if (!objet || typeof objet !== "object" || Array.isArray(objet) || Object.keys(objet).length === 0) {
      return { ok: false, motif: `« ${outil.valeurs} » doit lister au moins une modification` };
    }
    for (const [cle, v] of Object.entries(objet as Record<string, unknown>)) {
      if (!["string", "number", "boolean"].includes(typeof v)) return { ok: false, motif: `« ${outil.valeurs}.${cle} » : valeur non scalaire` };
      if (!corps.includes(normaliser(String(v)))) return { ok: false, motif: `« ${outil.valeurs}.${cle} » : la valeur ne figure pas telle quelle dans la révision approuvée` };
    }
  }
  for (const champ of outil.cibles) {
    const v = args[champ];
    if (typeof v === "string" ? v.trim() === "" : Array.isArray(v) ? v.length === 0 : typeof v !== "number") {
      return { ok: false, motif: `« ${champ} » : cible vide ou illisible` };
    }
  }

  let empreinte: string;
  let empreinteArgs: string;
  try {
    empreinte = empreinteAppel({ service: a.service, outil: a.outil, compte: a.compte, arguments: args });
    empreinteArgs = empreinteArguments(args);
  } catch {
    return { ok: false, motif: "arguments non représentables en JSON canonique" };
  }
  return { ok: true, action: outil.action, empreinte, empreinteArguments: empreinteArgs, apercu: apercuAppel({ service: a.service, outil: a.outil, compte: a.compte, arguments: args }) };
}

/** Aperçu d'un appel (sans contrôle) : ce que l'humain doit voir avant d'approuver. */
export function apercuAppel(a: { service: string; outil: string; compte: string; arguments: Record<string, unknown> }): ApercuAppel {
  const outil = Object.hasOwn(OUTILS_ECRITURE, a.outil) ? OUTILS_ECRITURE[a.outil] : undefined;
  const libelle = (champ: string) => LIBELLES[champ] ?? champ;
  const args = a.arguments;
  const cibles = [{ champ: "compte", libelle: "Compte", valeur: a.compte }, ...(outil?.cibles ?? []).map((c) => ({ champ: c, libelle: libelle(c), valeur: enTexte(args[c]) }))];
  const textes = (outil?.textes ?? []).filter((c) => args[c] !== undefined).map((c) => ({ champ: c, libelle: libelle(c), valeur: enTexte(args[c]) }));
  const objet = outil?.valeurs ? args[outil.valeurs] : undefined;
  const proprietes = objet && typeof objet === "object" && !Array.isArray(objet)
    ? Object.entries(objet as Record<string, unknown>).map(([cle, v]) => ({ champ: `${outil!.valeurs}.${cle}`, libelle: `Propriété « ${cle} »`, valeur: enTexte(v) }))
    : [];
  const verbe = outil?.action === "publier" ? "Publier" : outil?.action === "envoyer" ? "Envoyer un message privé" : "Modifier le CRM";
  return { resume: `${verbe} sur ${a.service} (${a.outil}), compte ${a.compte}`, cibles, textes, proprietes };
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
  /** Identifiant de l'entreprise Paperclip (companyId) qui a approuvé. */
  entreprise: string;
  /** Corps de la révision APPROUVÉE (révision courante, vérifiée par la règle de diffusion). */
  corpsRevision: string;
  /** Clé privée résolue depuis le secret natif ; null si absente ou illisible (motif fourni). */
  clePrivee: KeyObject | null;
  motifCle?: string;
  maintenant: Date;
  /**
   * v1.6 (S-4) : charge de la PREMIÈRE preuve de cette diffusion (rejeu). Elle est re-signée à
   * l'identique (même émission, même expiration), jamais prolongée ; expirée : refus.
   */
  chargeFigee?: ChargePreuve | null;
  /** v1.6 (S-7) : preuve révoquée : plus rien n'est signé pour cette diffusion. */
  revoquee?: { motif: string } | null;
}

export type ResultatPreuve = { ok: true; preuve: string; charge: ChargePreuve } | { ok: false; motif: string };

export function preparerPreuve(e: EntreePreuve): ResultatPreuve {
  if (e.mode !== "reel") return { ok: false, motif: "démonstration : aucune preuve n'est jamais signée" };
  const d = e.demande;
  if (d.action === "activer_campagne_payante") return { ok: false, motif: "aucun outil de la passerelle n'active une campagne payante : rien n'est signé" };
  if (!d.service || !d.outil || !d.arguments) {
    return { ok: false, motif: "appel d'outil non précisé : indiquer service, outil et arguments EXACTS de l'appel à la passerelle" };
  }
  if (e.revoquee) return { ok: false, motif: `preuve révoquée (${e.revoquee.motif}) : une nouvelle approbation est nécessaire` };
  const outil = Object.hasOwn(OUTILS_ECRITURE, d.outil) ? OUTILS_ECRITURE[d.outil] : undefined;
  if (!outil) return { ok: false, motif: `outil « ${d.outil} » : ce n'est pas un outil d'écriture connu de la passerelle` };
  if (outil.service !== d.service) return { ok: false, motif: `l'outil « ${d.outil} » n'appartient pas au service « ${d.service} »` };
  if (outil.action !== d.action) return { ok: false, motif: `l'outil « ${d.outil} » ne correspond pas à l'action « ${d.action} »` };

  const p = e.decision.portee;
  const canal = (p.canal ?? "").trim().toLowerCase();
  if (SERVICE_DU_CANAL[canal] !== d.service) return { ok: false, motif: `le canal approuvé « ${p.canal ?? "aucun"} » ne correspond pas au service « ${d.service} »` };
  if (p.compte === null || d.compte === null || p.compte !== d.compte) {
    return { ok: false, motif: SERVICES_RESEAUX.has(d.service) ? "compte non lié : une publication sur un réseau exige le compte approuvé (jamais « tout compte »)" : "compte non lié : l'approbation doit viser le compte exact" };
  }

  // S-1 : l'humain a approuvé un appel EXACT ; seul celui-là est signé.
  if (!p.appel) return { ok: false, motif: "l'approbation ne vise aucun appel d'outil précis (outil, cible et contenu montrés à l'humain) : rien n'est signé" };
  const controle = controlerAppel({ service: d.service, outil: d.outil, compte: d.compte, arguments: d.arguments }, e.corpsRevision);
  if (!controle.ok) return controle;
  if (p.appel.service !== d.service || p.appel.outil !== d.outil || p.appel.compte !== d.compte || p.appel.empreinte !== controle.empreinte) {
    return { ok: false, motif: "l'appel demandé n'est pas celui que l'humain a approuvé (outil, cible, compte ou contenu différents)" };
  }

  if (!e.clePrivee) return { ok: false, motif: e.motifCle ?? "aucune clé d'approbation configurée" };

  const maintenantS = Math.floor(e.maintenant.getTime() / 1000);
  if (e.chargeFigee) {
    // S-4 : même charge, même expiration ; jamais une nouvelle signature avec une nouvelle date.
    const c = e.chargeFigee;
    if (c.cle !== cleIdempotenceSignee(e.diffusionId) || c.service !== d.service || c.outil !== d.outil || c.empreinte !== controle.empreinteArguments || c.compte !== p.compte || c.diffusion !== e.diffusionId || c.decision !== e.decision.id) {
      return { ok: false, motif: "la preuve déjà émise pour cette diffusion vise un autre appel : rien n'est signé" };
    }
    if (c.entreprise !== undefined && c.entreprise !== e.entreprise) return { ok: false, motif: "la preuve déjà émise vise une autre entreprise : rien n'est signé" };
    if (c.expire <= maintenantS) return { ok: false, motif: "la preuve de cette diffusion a expiré : une nouvelle approbation est nécessaire" };
    return { ok: true, preuve: signerPreuve(e.clePrivee, c), charge: c };
  }
  const finDecision = p.dureeJours !== null ? Math.floor(new Date(e.decision.creeLe).getTime() / 1000) + p.dureeJours * 86_400 : Number.POSITIVE_INFINITY;
  const expire = Math.min(maintenantS + DUREE_MAX_PREUVE_S, finDecision);
  if (!(expire > maintenantS)) return { ok: false, motif: "l'approbation a expiré" };
  const charge: ChargePreuve = {
    // S-5 : la clé signée (celle du journal d'idempotence de la passerelle) dérive de la diffusion, pas de l'agent.
    v: 1, cle: cleIdempotenceSignee(e.diffusionId), service: d.service, outil: d.outil, empreinte: controle.empreinteArguments, compte: p.compte,
    diffusion: e.diffusionId, decision: e.decision.id, emis: maintenantS, expire, entreprise: e.entreprise,
  };
  return { ok: true, preuve: signerPreuve(e.clePrivee, charge), charge };
}
