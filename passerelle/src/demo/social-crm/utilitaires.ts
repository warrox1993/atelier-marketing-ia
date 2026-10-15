// Outils communs des simulateurs réseaux sociaux et CRM (lot L7) : paramètres de
// période, curseurs de pagination, dates au format de chaque API et enveloppe des
// outils de mutation. Aucun chiffre n'est produit ici : tout vient de `modeleDemo`.

import * as z from "zod";
import { SchemaDate } from "../modele/index.js";
import type { AnnotationsOutil, ContexteAppel, OutilPasserelle } from "../../fournisseurs.js";

// --- Paramètres communs -------------------------------------------------------------

/** Période du modèle de démonstration : les deux dates sont obligatoires (aucune horloge cachée). */
export const formePeriode = {
  debut: SchemaDate.describe("Premier jour de la période, AAAA-MM-JJ (modèle de démonstration : 2025-01-01 à 2027-12-31)."),
  fin: SchemaDate.describe("Dernier jour de la période, AAAA-MM-JJ, inclus."),
};

/** Date d'observation du CRM (par défaut la fin de période) : état des étapes à ce jour. */
export const formeAu = {
  au: SchemaDate.optional().describe("Date à laquelle on observe l'état du CRM (par défaut : la fin de période)."),
};

export function verifierPeriode(debut: string, fin: string): void {
  if (debut > fin) throw new Error("La date de début doit précéder ou égaler la date de fin.");
}

// --- Dates --------------------------------------------------------------------------

const MS_PAR_JOUR = 86_400_000;

export function msDepuisDate(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

export function dateDepuisMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function ajouterJours(date: string, jours: number): string {
  return dateDepuisMs(msDepuisDate(date) + jours * MS_PAR_JOUR);
}

/** Borne le jour à la fin du modèle (les décalages de recherche ne sortent pas de la période couverte). */
export function bornerFin(date: string, plafond: string): string {
  return date > plafond ? plafond : date;
}

/** Heure de publication unique et fixe : le modèle fournit des jours, pas des heures. */
export const HEURE_PUBLICATION = "08:00:00";

/** « 2026-09-22T08:00:00+0000 » : horodatage de l'API Graph de Meta. */
export const horodatageMeta = (date: string, heure = HEURE_PUBLICATION): string => `${date}T${heure}+0000`;

/** « 2026-09-22 08:00:00 » : horodatage des API Pipedrive et Odoo (UTC, sans fuseau affiché). */
export const horodatageEspace = (iso: string): string => iso.slice(0, 19).replace("T", " ");

/** « 2026-09-22 » → « 2026-09-22T00:00:00.000Z ». */
export const minuitIso = (date: string): string => `${date}T00:00:00.000Z`;

// --- Pagination par curseur ---------------------------------------------------------

/** Curseur opaque (Meta) : décalage encodé, jamais interprété par l'agent. */
export function encoderCurseur(decalage: number): string {
  return Buffer.from(`d:${decalage}`, "utf8").toString("base64url");
}

export function decoderCurseur(curseur: string | undefined): number {
  if (curseur === undefined || curseur === "") return 0;
  const texte = Buffer.from(curseur, "base64url").toString("utf8");
  const trouve = /^d:(\d{1,9})$/.exec(texte);
  if (!trouve) throw new Error("Curseur de pagination invalide.");
  return Number(trouve[1]);
}

/** Décalage numérique transmis tel quel (HubSpot : `after`, Odoo : `offset`...). */
export function decoderDecalage(valeur: string | undefined): number {
  if (valeur === undefined || valeur === "") return 0;
  if (!/^\d{1,9}$/.test(valeur)) throw new Error("Valeur « after » invalide.");
  return Number(valeur);
}

export interface Tranche<T> {
  elements: T[];
  decalage: number;
  suivant: number | null;
}

/** Découpe une liste complète : `suivant` vaut `null` quand il n'y a plus rien après. */
export function trancher<T>(liste: readonly T[], decalage: number, limite: number): Tranche<T> {
  const elements = liste.slice(decalage, decalage + limite);
  const suivant = decalage + limite < liste.length ? decalage + limite : null;
  return { elements, decalage, suivant };
}

// --- Identifiants -------------------------------------------------------------------

/** « urn:li:organization:900000001 » → « 900000001 » (propriété de la connexion). */
export function dernierSegment(identifiant: string | undefined, secours: string): string {
  if (!identifiant) return secours;
  const morceaux = identifiant.split(/[/:]/);
  return morceaux[morceaux.length - 1] || secours;
}

// --- Annotations et outils ----------------------------------------------------------

export const ANNOTATIONS_LECTURE: AnnotationsOutil = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };

/** Écriture : l'agent la présente à l'approbation humaine du plugin avant tout effet réel. */
export function annotationsMutation(destructive: boolean): AnnotationsOutil {
  return { readOnlyHint: false, destructiveHint: destructive, idempotentHint: false, openWorldHint: true };
}

export function outilLecture<S extends z.ZodRawShape>(
  definition: { nom: string; description: string; schemaEntree: S },
  executer: (args: z.output<z.ZodObject<S>>, contexte: ContexteAppel) => unknown,
): OutilPasserelle {
  return {
    nom: definition.nom,
    description: `LECTURE. ${definition.description}`,
    schemaEntree: definition.schemaEntree,
    annotations: ANNOTATIONS_LECTURE,
    executer: (args, contexte) => executer(args as z.output<z.ZodObject<S>>, contexte),
  };
}

/** Résultat commun des outils de mutation en démonstration : l'action est PRÉPARÉE, jamais exécutée. */
export interface ActionPreparee {
  etat: "preparee";
  executee: false;
  message: string;
  approbation_humaine_requise: true;
  action: {
    service: string;
    outil: string;
    /** Requête que le fournisseur réel enverrait (informatif). */
    requete_reelle_visee: string;
    parametres: Record<string, unknown>;
  };
}

export function outilMutation<S extends z.ZodRawShape>(
  definition: { nom: string; description: string; schemaEntree: S; destructif: boolean; requeteReelle: string; resume: (args: z.output<z.ZodObject<S>>) => string },
  verifier?: (args: z.output<z.ZodObject<S>>) => void,
): OutilPasserelle {
  return {
    nom: definition.nom,
    description:
      `MUTATION (préparée seulement en démonstration). ${definition.description} ` +
      "Rien n'est envoyé ni modifié : la réponse indique « préparée, non exécutée » et toute action réelle passe par l'approbation humaine.",
    schemaEntree: definition.schemaEntree,
    annotations: annotationsMutation(definition.destructif),
    executer(args, contexte): ActionPreparee {
      const valeurs = args as z.output<z.ZodObject<S>>;
      verifier?.(valeurs);
      return {
        etat: "preparee",
        executee: false,
        message: `Action préparée, non exécutée : ${definition.resume(valeurs)}`,
        approbation_humaine_requise: true,
        action: {
          service: contexte.service,
          outil: definition.nom,
          requete_reelle_visee: definition.requeteReelle,
          parametres: { ...(valeurs as Record<string, unknown>) },
        },
      };
    },
  };
}
