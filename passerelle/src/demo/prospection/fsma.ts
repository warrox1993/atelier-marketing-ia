// Simulateur `fsma` (lot P2) : registre public des intermédiaires d'assurance de la FSMA. Le format d'export réel
// et les conditions de réutilisation sont INCONNUS (docs/prospection-conception.md §2.3, lot P15) : la forme
// ci-dessous est une hypothèse de travail (recherche par nom ou numéro BCE ; catégorie, statut, numéro BCE, adresse).
// Tous les intermédiaires sont des sociétés fictives : aucune personne physique.

import * as z from "zod";
import type { FournisseurService, OutilPasserelle } from "../../fournisseurs.js";
import { adresseDansZone, formePage, formeZone, normaliser, outilLecture, paginer, type FiltreZone } from "./commun.js";
import { CATEGORIES_FSMA, jeuProspection, type InscriptionFsma } from "./jeu.js";
import { nomAssureurDemo } from "./referentiel.js";

export const SOURCE_FSMA = "Registre FSMA des intermédiaires d'assurance (simulateur de démonstration : intermédiaires entièrement fictifs ; forme hypothétique)";

const fiche = (f: InscriptionFsma): Record<string, unknown> => ({
  numero_inscription: f.numeroInscription,
  denomination: f.denomination,
  numero_bce: f.numeroBce,
  categorie: f.categorie,
  statut: f.statut,
  inscrit_le: f.inscritLe,
  radie_le: f.radieLe,
  adresse: { rue: f.adresse.rue, numero: f.adresse.numero, boite: f.adresse.boite, code_postal: f.adresse.codePostal, commune: f.adresse.commune, province: f.adresse.province, region: f.adresse.region, pays: f.adresse.pays },
});

const base = (): Record<string, string> => ({ source: SOURCE_FSMA, client_demonstration: nomAssureurDemo(), note: "Numéros BCE à chiffre de contrôle volontairement faux (ou mal formés par piège) : aucune entreprise réelle ne peut y correspondre." });

export const outilIntermediaire: OutilPasserelle = outilLecture(
  {
    nom: "fsma_intermediaire",
    description: "Cherche un intermédiaire d'assurance dans le registre par numéro BCE (exact, points facultatifs) ou par nom (fragment, sans tenir compte des accents). Au moins un des deux.",
    schemaEntree: {
      numero: z.string().min(1).max(30).optional().describe("Numéro BCE tel que publié."),
      nom: z.string().min(2).max(100).optional().describe("Fragment de la dénomination."),
    },
  },
  (args) => {
    if (args.numero === undefined && args.nom === undefined) throw new Error("Indiquer un numéro BCE ou un nom.");
    const chiffres = args.numero?.replace(/^BE\s*/i, "").replace(/[\s.]/g, "");
    const trouves = jeuProspection().fsma.filter(
      (f) => (chiffres === undefined || f.numeroBce.replace(/[\s.]/g, "") === chiffres) && (args.nom === undefined || normaliser(f.denomination).includes(normaliser(args.nom))),
    );
    return { ...base(), total: trouves.length, intermediaires: trouves.map(fiche) };
  },
);

export const outilRechercherFsma: OutilPasserelle = outilLecture(
  {
    nom: "fsma_rechercher",
    description: "Liste les intermédiaires d'assurance du registre par catégorie, statut et zone (adresse publiée : commune, code postal, province, région, pays).",
    schemaEntree: {
      categorie: z.enum(CATEGORIES_FSMA).optional().describe("Catégorie d'intermédiaire."),
      statut: z.enum(["Inscrit", "Radié"]).optional().describe("Statut d'inscription (défaut : tous)."),
      ...formeZone,
      ...formePage,
    },
  },
  (args) => {
    const zone: FiltreZone = args;
    const trouves = jeuProspection().fsma.filter((f) => (args.categorie === undefined || f.categorie === args.categorie) && (args.statut === undefined || f.statut === args.statut) && adresseDansZone(f.adresse, zone));
    const { elements, ...pagination } = paginer(trouves, args.page);
    return { ...base(), ...pagination, intermediaires: elements.map(fiche) };
  },
);

export function fournisseurFsma(): FournisseurService {
  return {
    service: "fsma",
    mode: "demonstration",
    fiche: { id: "fsma", libelle: "Registre FSMA des intermédiaires", portees: ["fsma:lecture"], proprietesDemo: [{ id: "registre/demo-fsma", libelle: "Registre FSMA de démonstration (intermédiaires fictifs)" }] },
    outils: [outilIntermediaire, outilRechercherFsma],
  };
}
