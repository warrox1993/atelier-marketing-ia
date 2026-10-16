// Simulateur `bce` (lot P2) : BCE Open Data, entités actives. Les champs reprennent les noms des fichiers CSV de
// la BCE (enterprise, denomination, address, activity, contact, establishment) d'après les dépôts publics ;
// niveau de preuve « probable », à confirmer sur le guide officiel au lot P3 (docs/prospection-conception.md §2.1).
//
// Comme le fichier réel : AUCUNE personne physique, AUCUN effectif ni chiffre financier, AUCUN historique (une
// entité radiée disparaît du fichier ; seules les mises à jour la signalent). Dates au format du fichier (JJ-MM-AAAA).

import * as z from "zod";
import type { FournisseurService, OutilPasserelle } from "../../fournisseurs.js";
import {
  adresseDansZone, codesNaceCorrespondent, formeNace, formePage, formeZone, outilLecture, paginer, pointNace, verifierDateIso, zoneDonnee, type FiltreZone,
} from "./commun.js";
import { dateBce, jeuProspection, tailleDe, type AdresseDemo, type EntrepriseDemo, type EtablissementDemo } from "./jeu.js";
import { analyserNumero } from "./numeros.js";
import { libelleForme, libelleNace, nomAssureurDemo } from "./referentiel.js";

export const SOURCE_BCE = "BCE Open Data (simulateur de démonstration : entreprises entièrement fictives)";
const NOTE_NUMEROS = "Numéros à chiffre de contrôle volontairement faux (modulo 97) : aucune entreprise réelle ne peut y correspondre.";

/** Phrase ajoutée aux descriptions des outils qui renvoient `position_approx` (identique en démonstration et en réel). */
export const PHRASE_POSITION_APPROX =
  "Chaque entité et chaque unité d'établissement porte `position_approx` (lat, lon, précision code_postal ou commune, source osm, ou null) : position approximative déduite du code postal ou de la commune, jamais l'adresse exacte.";

/** Position fictive déterministe d'une adresse de démonstration (même code postal, même point), située en Belgique. */
function positionApproxDemo(a: AdresseDemo): Record<string, unknown> | null {
  const n = Number.parseInt(a.codePostal, 10);
  if (!Number.isFinite(n)) return null;
  return { lat: 49.6 + ((n * 37) % 1000) / 1000 * 1.4, lon: 2.6 + ((n * 91) % 1000) / 1000 * 3.2, precision: "code_postal", source: "osm" };
}

const adresseBce = (type: "REGO" | "BAET", a: AdresseDemo): Record<string, string> => ({
  TypeOfAddress: type,
  CountryFR: "Belgique",
  Zipcode: a.codePostal,
  MunicipalityFR: a.commune,
  StreetFR: a.rue,
  HouseNumber: a.numero,
  Box: a.boite,
});

const activitesBce = (codes: readonly string[]): Record<string, string>[] =>
  codes.flatMap((code, i) => ["2008", "2025"].map((version) => ({ ActivityGroup: "003", NaceVersion: version, NaceCode: code, Classification: i === 0 ? "MAIN" : "SECO", Libelle: libelleNace(code) })));

function etablissementBce(e: EtablissementDemo, entreprise: EntrepriseDemo): Record<string, unknown> {
  return { EstablishmentNumber: e.numero, StartDate: dateBce(e.debut), EnterpriseNumber: entreprise.numero, adresses: [adresseBce("BAET", e.adresse)], position_approx: positionApproxDemo(e.adresse), activites: activitesBce(entreprise.nace) };
}

/** Une entité complète, à la forme des fichiers de la BCE. */
export function entiteBce(e: EntrepriseDemo): Record<string, unknown> {
  const contacts: Record<string, string>[] = [];
  if (e.telephone) contacts.push({ EntityContact: "ENT", ContactType: "TEL", Value: e.telephone });
  if (e.courriel) contacts.push({ EntityContact: "ENT", ContactType: "EMAIL", Value: e.courriel });
  if (e.site) contacts.push({ EntityContact: "ENT", ContactType: "WEB", Value: e.site });
  return {
    EnterpriseNumber: e.numero,
    Status: "AC",
    JuridicalSituation: "000",
    TypeOfEnterprise: "2",
    JuridicalForm: e.forme,
    JuridicalFormLibelle: libelleForme(e.forme),
    StartDate: dateBce(e.debut),
    denominations: [{ Language: "1", TypeOfDenomination: "001", Denomination: e.denomination }],
    adresses: [adresseBce("REGO", e.siege)],
    position_approx: positionApproxDemo(e.siege),
    activites: activitesBce(e.nace),
    contacts,
    etablissements: e.etablissements.map((x) => etablissementBce(x, e)),
  };
}

const adressesDe = (e: EntrepriseDemo): AdresseDemo[] => [e.siege, ...e.etablissements.map((x) => x.adresse)];

/** Contexte de démonstration rappelé dans chaque réponse (le nom vient de l'environnement local, pas du dépôt). */
const contexte = (): Record<string, string> => ({ source: SOURCE_BCE, client_demonstration: nomAssureurDemo(), note: NOTE_NUMEROS });

export const outilRechercher: OutilPasserelle = outilLecture(
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
    const depuis = args.creees_depuis === undefined ? null : verifierDateIso(args.creees_depuis, "creees_depuis");
    const zone: FiltreZone = args;
    const trouvees = jeuProspection().entreprises.filter(
      (e) =>
        codesNaceCorrespondent(e.nace, args.nace) &&
        (!zoneDonnee(zone) || adressesDe(e).some((a) => adresseDansZone(a, zone))) &&
        (args.formes === undefined || args.formes.length === 0 || args.formes.includes(e.forme)) &&
        (depuis === null || e.debut >= depuis) &&
        (args.taille === undefined || args.taille.length === 0 || args.taille.includes(tailleDe(e.comptes))),
    );
    const { elements, ...pagination } = paginer(trouvees, args.page);
    return { ...contexte(), ...pagination, entreprises: elements.map(entiteBce) };
  },
);

export const outilEntreprise: OutilPasserelle = outilLecture(
  {
    nom: "bce_entreprise",
    description:
      "Fiche complète d'une entité du fichier BCE actif, par numéro (0123.456.789) ou numéro d'unité d'établissement (2.123.456.789). " +
      "Absent du fichier actif : entreprise radiée, cessée ou numéro inconnu (le fichier ne garde aucun historique). " +
      "Un numéro au contrôle modulo 97 valide est refusé : il pourrait être réel. " + PHRASE_POSITION_APPROX,
    schemaEntree: { numero: z.string().min(1).max(30).describe("Numéro BCE, avec ou sans points ni préfixe BE.") },
  },
  (args) => {
    const n = analyserNumero(args.numero);
    if (n.controleValide) {
      return {
        ...contexte(), trouve: false, numero: n.formate, motif: "numero_non_fictif",
        message: "Ce numéro a un chiffre de contrôle valide : il pourrait désigner une vraie entreprise. Le simulateur ne sert que des numéros fictifs et ne répond pas.",
      };
    }
    const jeu = jeuProspection();
    if (n.type === "entreprise") {
      const e = jeu.entreprises.find((x) => x.numero === n.formate);
      if (e) return { ...contexte(), trouve: true, entreprise: entiteBce(e) };
    } else {
      for (const e of jeu.entreprises) {
        const etab = e.etablissements.find((x) => x.numero === n.formate);
        if (etab) return { ...contexte(), trouve: true, etablissement: etablissementBce(etab, e) };
      }
    }
    return { ...contexte(), trouve: false, numero: n.formate, motif: "absent_du_fichier_actif", message: "Absent du fichier des entités actives : entreprise radiée, cessée, ou numéro inconnu." };
  },
);

export const outilChangements: OutilPasserelle = outilLecture(
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
    const depuis = verifierDateIso(args.depuis, "depuis");
    const zone: FiltreZone = args;
    const jeu = jeuProspection();
    const par = new Map(jeu.entreprises.map((e) => [e.numero, e]));
    const retenus = jeu.evenements.filter((ev) => {
      if (ev.date < depuis) return false;
      if (ev.type === "radiation") return true;
      const e = par.get(ev.numero);
      return !!e && codesNaceCorrespondent(e.nace, args.nace) && (!zoneDonnee(zone) || adressesDe(e).some((a) => adresseDansZone(a, zone)));
    });
    const { elements, ...pagination } = paginer(retenus, args.page);
    return {
      ...contexte(), depuis, ...pagination,
      changements: elements.map((ev) => ({
        date: ev.date, type: ev.type, EnterpriseNumber: ev.numero, ...ev.detail,
        ...(ev.type === "creation" || ev.type === "nouvel_etablissement" || ev.type === "changement_adresse" || ev.type === "changement_forme" ? { nace: par.get(ev.numero)?.nace.map(pointNace) } : {}),
      })),
    };
  },
);

export function fournisseurBce(): FournisseurService {
  return {
    service: "bce",
    mode: "demonstration",
    fiche: { id: "bce", libelle: "BCE Open Data (entreprises belges)", portees: ["bce:lecture"], proprietesDemo: [{ id: "registre/demo-bce", libelle: "Fichier BCE de démonstration (entreprises fictives)" }] },
    outils: [outilRechercher, outilEntreprise, outilChangements],
  };
}
