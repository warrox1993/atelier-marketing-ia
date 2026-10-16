// Outils du service `bce` en mode réel (lot P3) : MÊMES noms, MÊMES schémas d'entrée et MÊMES formes de réponse que le
// simulateur (src/demo/prospection/bce.ts, docs/passerelle.md « Simulateurs prospection (P2) »). Lecture seule.
//
// Différences voulues avec le simulateur :
//   - aucun refus de numéro « non fictif » : les numéros réels sont l'objet même du service (un numéro absent au contrôle faux
//     est seulement signalé comme faute de frappe probable) ;
//   - `taille` : la jointure avec la Centrale des bilans (BNB, lot P4) n'existe pas encore. SANS données BNB, toute
//     entreprise a la taille « inconnue » et chaque réponse de recherche le dit (`taille_note`) ;
//   - pas de `client_demonstration` ni de note sur les numéros ; `source`, `date_extraction` et `conditions` à la place.

import * as z from "zod";
import type { FournisseurService, OutilPasserelle } from "../../../fournisseurs.js";
import { formeNace, formePage, formeZone, outilLecture, verifierDateIso } from "../../../commun/prospection/commun.js";
import { PHRASE_POSITION_APPROX } from "../../../commun/prospection/commun.js";
import { analyserNumero } from "../../../commun/prospection/numeros.js";
import type { CentroidesOsm, PositionApprox } from "../osm/centroides.js";
import { IndexBce, TAILLE_PAGE } from "./index.js";

// La fiche est déclarée dans services.ts (fiches livrées par défaut) ; ré-exportée ici pour les importations existantes.
import { FICHE_BCE } from "../../../services.js";
export { FICHE_BCE };

export const PROPRIETE_BCE_REEL = { id: "registre/bce-local", libelle: "Index BCE local (BCE Open Data)" } as const;

const CONDITIONS =
  "BCE Open Data, SPF Économie : les entités personnes physiques ne sont jamais chargées (interdiction de marketing direct sur leurs données). " +
  "Réutilisation soumise aux conditions acceptées à l'inscription.";
export const NOTE_TAILLE =
  "La taille d'une entreprise vient des comptes annuels de la BNB (lot P4, pas encore branché) : sans ces données, toute taille vaut « inconnue ».";

export type AccesIndex = () => IndexBce;
/** Centroïdes OSM (facultatifs) : sans eux, `position_approx` vaut `null` partout. */
export type AccesCentroides = () => CentroidesOsm | null;

type Fiche = Record<string, unknown>;

function positionDe(adresses: unknown, centroides: CentroidesOsm | null): PositionApprox | null {
  if (!centroides || !Array.isArray(adresses) || adresses.length === 0) return null;
  const liste = adresses as Record<string, string | null>[];
  const a = liste.find((x) => x["TypeOfAddress"] === "REGO") ?? liste[0]!;
  return centroides.position(a["Zipcode"], a["MunicipalityFR"]);
}

/** Ajoute `position_approx` à une entité (adresse du siège) et à chacune de ses unités d'établissement, ou à une unité seule. */
function avecPositions(fiche: Fiche, centroides: CentroidesOsm | null): Fiche {
  const etabs = fiche["etablissements"];
  return {
    ...fiche,
    position_approx: positionDe(fiche["adresses"], centroides),
    ...(Array.isArray(etabs) ? { etablissements: (etabs as Fiche[]).map((s) => avecPositions(s, centroides)) } : {}),
  };
}

function contexte(index: IndexBce): Record<string, string> {
  return { source: `BCE Open Data (index local, extraction du ${index.dateExtractionBce()})`, date_extraction: index.meta()["SnapshotDate"] ?? "", conditions: CONDITIONS };
}

/** Index présent et rempli, sinon erreur d'outil claire (jamais de réponse vide trompeuse). */
function indexPret(acces: AccesIndex): IndexBce {
  const index = acces();
  if (!index.disponible()) throw new Error("Index BCE indisponible : index BCE absent ou vide, aucun fichier complet importé : lancer cli.js bce-telecharger --importer (voir docs/passerelle.md, « Fournisseur BCE réel »).");
  return index;
}

export function outilsBce(acces: AccesIndex, centroides: AccesCentroides = () => null): OutilPasserelle[] {
  const rechercher = outilLecture(
    {
      nom: "bce_rechercher",
      description:
        "Recherche d'entreprises actives de la BCE par secteur (NACE), zone (commune, code postal, province, région, pays) et forme juridique, " +
        "avec filtres d'atelier facultatifs : creees_depuis (date de début) et taille (jointure avec les comptes annuels : micro < 10, petite < 50, moyenne < 250, grande ≥ 250 équivalents temps plein ; " +
        "« inconnue » = aucun compte déposé). Une entreprise correspond si son siège OU l'une de ses unités d'établissement est dans la zone. Personnes physiques jamais incluses. " + PHRASE_POSITION_APPROX,
      schemaEntree: {
        ...formeNace,
        ...formeZone,
        formes: z.array(z.string().regex(/^\d{3}$/)).max(10).optional().describe("Codes de forme juridique de la BCE (610 = SRL, 014 = SA)."),
        creees_depuis: z.string().optional().describe("Date AAAA-MM-JJ : entreprises dont la date de début est postérieure ou égale."),
        taille: z.array(z.enum(["micro", "petite", "moyenne", "grande", "inconnue"])).max(5).optional().describe("Extension d'atelier : taille d'après l'effectif des derniers comptes annuels."),
        ...formePage,
      },
    },
    (args) => {
      const index = indexPret(acces);
      const depuis = args.creees_depuis === undefined ? null : verifierDateIso(args.creees_depuis, "creees_depuis");
      // Sans BNB, toute taille vaut « inconnue » : un filtre qui n'inclut pas « inconnue » ne peut rien retenir.
      const tailleExclut = args.taille !== undefined && args.taille.length > 0 && !args.taille.includes("inconnue");
      const base = contexte(index);
      if (tailleExclut) {
        return { ...base, total: 0, page: args.page ?? 1, taille_page: TAILLE_PAGE, pages: 1, taille_note: NOTE_TAILLE, entreprises: [] };
      }
      const { elements, filtres_zone: _fz, ...pagination } = index.rechercher({ ...args, creees_depuis: depuis });
      return { ...base, ...pagination, taille_note: NOTE_TAILLE, entreprises: elements.map((e) => avecPositions(e, centroides())) };
    },
  );

  const entreprise = outilLecture(
    {
      nom: "bce_entreprise",
      description:
        "Fiche complète d'une entité du fichier BCE actif, par numéro (0123.456.789) ou numéro d'unité d'établissement (2.123.456.789). " +
        "Absent du fichier actif : entreprise radiée, cessée ou numéro inconnu (le fichier ne garde aucun historique). " +
        "Un numéro absent dont le chiffre de contrôle (modulo 97) est faux est signalé (motif numero_invalide). " + PHRASE_POSITION_APPROX,
      schemaEntree: { numero: z.string().min(1).max(30).describe("Numéro BCE, avec ou sans points ni préfixe BE.") },
    },
    (args) => {
      const index = indexPret(acces);
      const n = analyserNumero(args.numero);
      const base = contexte(index);
      if (n.type === "entreprise") {
        const e = index.entite(n.formate);
        if (e) return { ...base, trouve: true, entreprise: avecPositions(e, centroides()) };
      } else {
        const s = index.etablissement(n.formate);
        if (s) return { ...base, trouve: true, etablissement: avecPositions(s, centroides()) };
      }
      // Absent : un chiffre de contrôle faux (modulo 97) fait penser à une faute de frappe, sinon l'entité n'est pas dans le fichier actif.
      if (!n.controleValide) {
        return { ...base, trouve: false, numero: n.formate, motif: "numero_invalide", message: "Absent de l'index, et le chiffre de contrôle (modulo 97) de ce numéro est faux : faute de frappe probable." };
      }
      return { ...base, trouve: false, numero: n.formate, motif: "absent_du_fichier_actif", message: "Absent du fichier des entités actives : entreprise radiée, cessée, personne physique (jamais chargée) ou numéro inconnu." };
    },
  );

  const changements = outilLecture(
    {
      nom: "bce_changements",
      description:
        "Mises à jour de la BCE depuis une date : créations, nouvelles unités d'établissement, changements d'adresse et de forme juridique, radiations. " +
        "Les filtres secteur et zone s'appliquent aux créations et modifications ; une radiation ne porte que le numéro (comme le fichier de suppressions) et reste toujours listée.",
      schemaEntree: {
        depuis: z.string().describe("Date AAAA-MM-JJ (incluse) à partir de laquelle lister les changements."),
        ...formeNace,
        ...formeZone,
        ...formePage,
      },
    },
    (args) => {
      const index = indexPret(acces);
      const depuis = verifierDateIso(args.depuis, "depuis");
      const { elements, journal_depuis, ...pagination } = index.changements({ ...args, depuis });
      return {
        ...contexte(index), depuis, ...pagination,
        couverture: {
          journal_depuis,
          note: "Le fichier de la BCE ne garde aucun historique : le journal est construit par l'atelier à partir des mises à jour appliquées. Il ne remonte pas avant « journal_depuis ».",
        },
        changements: elements,
      };
    },
  );

  return [rechercher, entreprise, changements];
}

/** Fournisseur du service `bce` en mode réel, servi derrière le jeton porteur statique de la passerelle. */
export function fournisseurBceReel(acces: AccesIndex, verifier: (jeton: string) => ReturnType<NonNullable<FournisseurService["verifierJeton"]>>, centroides: AccesCentroides = () => null): FournisseurService {
  return { service: "bce", mode: "reel", fiche: FICHE_BCE, outils: outilsBce(acces, centroides), verifierJeton: (jeton) => verifier(jeton) };
}
