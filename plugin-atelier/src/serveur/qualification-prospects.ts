/**
 * Confiance de qualification des prospects (0 à 100 %).
 *
 * À ne JAMAIS confondre avec le score de conversion (`score-prospects.ts`, `ScoreProspect`), qui estime
 * la chance de signer : la confiance dit à quel point il est établi que le prospect correspond à la
 * cible du client. Elle ne monte qu'avec des critères VÉRIFIÉS par des sources déposées (BCE, FSMA,
 * OSM, B2C, base légale, base de clients), jamais par hypothèse : un fait inconnu reste « non vérifié »
 * et ne rapporte rien.
 *
 * Calcul : moyenne pondérée des critères applicables (poids normalisés sur la somme des poids ACTIFS et
 * APPLICABLES : un critère désactivé, non applicable au type de prospect ou sans objet pour ce prospect sort du calcul) ; un critère « contraire » plafonne la confiance à
 * 50 % et rend le prospect non qualifié. `qualifie` = confiance au moins égale au seuil (90 % par défaut).
 * Le client règle, par entreprise, quels critères comptent, leur poids, le seuil, et ajoute des critères
 * personnalisés qui ne se vérifient qu'à la main ; une décision humaine sur un critère d'un lead remplace
 * le statut calculé de ce critère (source « humain »).
 * Fonctions pures : le contexte (cibles du client, base de clients, réglages, corrections) est lu par l'appelant.
 */
import { naceDeduitOsm } from "./categories-osm-nace.js";
import { provinceDuCodePostal, regionDeLaProvince, distanceKm } from "./geo.js";
import {
  LIBELLE_BESOIN,
  metierRcParNace,
  metierRcParOsm,
  naceConcurrent,
  naceFlotte,
  EFFECTIF_MIN_FLOTTE,
  offresActivesPourBesoin,
  type BesoinCourtier,
} from "./regles-criteres-courtier.js";
import {
  SEUIL_QUALIFICATION,
  type CibleProspection,
  type CodeCritereQualification,
  type ConfianceQualification,
  type CorrectionCritere,
  type EvaluationCritere,
  type CriterePersonnalise,
  type CriteresManquants,
  type CritereQualification,
  type EtablissementReferentiel,
  type FaitBce,
  type OffreReferentiel,
  type OrigineParticulier,
  type Prospect,
  type SegmentReferentiel,
  type SourceProspect,
  type StatutCritereQualification,
  type TailleBnb,
} from "../contrats/index.js";

/**
 * Poids par défaut des critères. Un critère non applicable au prospect sort du calcul : la confiance est la somme des
 * poids vérifiés divisée par la somme des poids actifs et applicables, donc toujours ramenée à 100 %. Les sept critères
 * d'origine pèsent 100 ; les critères « courtier » (entreprises seulement) ajoutent 36, les critères « courtier » fondés sur les comptes BNB (lot 2) 20 de plus, et ceux du lot 3 (bureau spécialisé proche, contact public permis) 12 de plus. `pas_concurrent` est un critère
 * contraire : poids 0, il n'ajoute rien mais plafonne à 50 % quand il est contraire.
 */
export const POIDS_QUALIFICATION_DEFAUT: Readonly<Record<CodeCritereQualification, number>> = {
  entreprise_active: 20,
  segment_cible: 20,
  zone_cible: 15,
  joignable_legalement: 15,
  pas_deja_client: 10,
  taille_connue: 10,
  sources_concordantes: 10,
  assurance_obligatoire_metier: 10,
  installation_recente: 8,
  evenement_recent: 8,
  besoin_offre_active: 10,
  pas_concurrent: 0,
  emploie_personnel: 6,
  flotte_probable: 4,
  proprietaire_locaux: 4,
  sante_financiere: 6,
  bureau_specialise_proche: 6,
  contact_public_permis: 6,
};

/** Plafond de la confiance quand un critère est contraire. */
export const PLAFOND_CONTRAIRE = 50;

/** Réglages de qualification d'une entreprise (table `reglages_leads`, migration 010). */
export interface ReglagesQualification {
  readonly criteres: Readonly<Record<CodeCritereQualification, { readonly actif: boolean; readonly poids: number }>>;
  readonly seuil: number;
  readonly personnalises: readonly CriterePersonnalise[];
}

/** Réglages par défaut : exactement le comportement d'origine (sept critères actifs, poids d'origine, seuil 90). */
export const REGLAGES_QUALIFICATION_DEFAUT: ReglagesQualification = {
  criteres: Object.fromEntries(Object.entries(POIDS_QUALIFICATION_DEFAUT).map(([code, poids]) => [code, { actif: true, poids }])) as ReglagesQualification["criteres"],
  seuil: SEUIL_QUALIFICATION,
  personnalises: [],
};

/** Correction humaine d'un critère, sans l'identifiant du prospect (rangée par prospect dans le contexte). */
export type CorrectionLue = Omit<CorrectionCritere, "prospectId">;

/** Évaluation de l'agent Prospection d'un critère personnalisé, sans l'identifiant du prospect. */
export type EvaluationLue = Omit<EvaluationCritere, "prospectId">;

/** Ce que le calcul sait du client : ses cibles de prospection et l'état de sa base de clients. */
export interface ContexteQualification {
  readonly cibles: readonly CibleProspection[];
  readonly segments: readonly SegmentReferentiel[];
  readonly etablissements: readonly EtablissementReferentiel[];
  /** Vrai si une base de clients a été importée : sans elle, « pas déjà client » ne peut pas être établi. */
  readonly baseClientsImportee: boolean;
  /** Horodatage du calcul. */
  readonly maintenant: string;
  /** Offres de la fiche du client (critère « besoin couvert par une offre active ») ; absentes : aucune offre connue. */
  readonly offres?: readonly Pick<OffreReferentiel, "nom" | "confirmee" | "code">[];
  /** Réglages de l'entreprise ; absents : réglages par défaut. */
  readonly reglages?: ReglagesQualification;
  /** Corrections humaines par identifiant de prospect (lues une fois par parcours). */
  readonly corrections?: ReadonlyMap<string, readonly CorrectionLue[]>;
  /** Évaluations de l'agent (critères personnalisés) par identifiant de prospect. */
  readonly evaluations?: ReadonlyMap<string, readonly EvaluationLue[]>;
}

/** Origines où la personne a demandé un devis ou un rendez-vous, ou est déjà cliente du courtier. */
const ORIGINES_DEMANDE_OU_CLIENT: readonly OrigineParticulier[] = ["formulaire_entrant", "simulateur_devis", "devis_abandonne", "prise_rendez_vous", "point_de_vente", "client_existant"];

const sansAccents = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const nace = (c: string) => c.replace(/\./gu, "");

const sourceSignee = (p: Prospect, service: SourceProspect["service"]) => p.sources.find((s) => s.service === service && s.sourceId !== null) ?? p.sources.find((s) => s.service === service) ?? null;
const etiquette = (s: SourceProspect) => (s.service ? `${s.service.toUpperCase()}${s.outil ? ` · ${s.outil}` : ""}` : s.type);
const aMotif = (p: Prospect, ...motifs: string[]) => p.motifsExclusion.some((m) => motifs.includes(m.motif));

/** Cibles du client qui visent ce type de prospect (restreintes à la cible désignée par le prospect, si elle existe). */
function ciblesApplicables(p: Prospect, ctx: ContexteQualification): CibleProspection[] {
  const voulues = p.cible === "particulier" ? ["b2c", "les_deux"] : ["b2b", "les_deux"];
  const parType = ctx.cibles.filter((c) => voulues.includes(c.cible));
  const designee = p.referentiel.cibleProspection;
  return designee === null ? parType : parType.filter((c) => c.code === designee);
}

type Resultat = Pick<CritereQualification, "statut" | "sourceId" | "source" | "detail"> & {
  /** Vrai : le critère n'a pas d'objet pour CE prospect (ex. aucun besoin détecté) ; il sort du calcul, sauf décision humaine. */
  readonly sansObjet?: true;
};
const resultat = (statut: StatutCritereQualification, source: SourceProspect | null, detail: string, libelleSource?: string): Resultat => ({
  statut,
  sourceId: source?.sourceId ?? null,
  source: libelleSource ?? (source ? etiquette(source) : "aucune source"),
  detail,
});

function critereActif(p: Prospect): Resultat {
  if (p.cible === "particulier") {
    const o = p.particulier?.origine;
    if (o !== undefined && ORIGINES_DEMANDE_OU_CLIENT.includes(o)) {
      const s = p.sources[0] ?? null;
      return resultat("verifie", s, o === "client_existant" ? "Client du courtier" : "Demande de devis ou de rendez-vous", s ? etiquette(s) : "origine du particulier");
    }
    return resultat("non_verifie", null, "Ni demande de devis ni client connu");
  }
  const s = sourceSignee(p, p.cible === "partenaire" ? "fsma" : "bce");
  if (aMotif(p, "entreprise_inactive")) return resultat("contraire", s, "Absente du fichier des entreprises actives");
  if (s !== null) return resultat("verifie", s, p.cible === "partenaire" ? "Inscription au registre FSMA déposée" : "Entreprise du registre BCE, non signalée inactive");
  return resultat("non_verifie", null, "Aucun dépôt du registre officiel");
}

function critereSegment(p: Prospect, ctx: ContexteQualification): Resultat {
  const cibles = ciblesApplicables(p, ctx);
  const codes = new Set(cibles.flatMap((c) => c.segments));
  const segments = ctx.segments.filter((s) => codes.has(s.code));
  if (segments.length === 0) return resultat("non_verifie", null, "Aucune cible de prospection ne vise ce type de prospect");
  if (p.cible === "particulier") {
    const type = segments.filter((s) => s.type === "type_particulier" && p.referentiel.segments.includes(s.code));
    return type.length > 0
      ? resultat("verifie", p.sources[0] ?? null, `Segment du particulier : ${type[0]!.libelle}`)
      : resultat("non_verifie", null, "Segment du particulier non établi");
  }
  const attendus = segments.flatMap((s) => s.nace).map(nace);
  if (attendus.length === 0) return resultat("non_verifie", null, "Les segments visés n'ont pas de code NACE à comparer");
  if (p.nace.length === 0) {
    // Lieu OpenStreetMap sans NACE : on déduit les NACE de sa catégorie, quand la correspondance est établie.
    const deduit = naceDeduitOsm(p);
    if (deduit === null) return resultat("non_verifie", null, "Aucun code NACE connu pour ce prospect");
    const so = p.sources.find((x) => x.service === "osm" && x.categorieOsm !== undefined) ?? null;
    if (deduit.horsCible === true) return resultat("contraire", so, `Catégorie OpenStreetMap « ${deduit.libelle} » : hors des professions visées`);
    const trouve = segments.find((seg) => seg.nace.map(nace).some((a) => deduit.nace.map(nace).some((n) => n.startsWith(a))));
    const liste = deduit.nace.join(", ");
    return trouve
      ? resultat("verifie", so, `Catégorie OpenStreetMap « ${deduit.libelle} » : NACE ${liste} (segment ${trouve.libelle})`)
      : resultat("contraire", so, `Catégorie OpenStreetMap « ${deduit.libelle} » : NACE ${liste} hors des segments de la cible`);
  }
  const ok = p.nace.map(nace).some((n) => attendus.some((a) => n.startsWith(a)));
  const s = sourceSignee(p, "bce");
  return ok ? resultat("verifie", s, "NACE dans un segment de la cible") : resultat("contraire", s, "NACE hors des segments de la cible");
}

/** Rayon (km) autour d'un établissement de la cible quand le contrat de la cible n'en porte pas. */
export const RAYON_ZONE_DEFAUT_KM = 10;

const formatKm = (d: number) => (Math.round(d * 10) / 10).toString().replace(".", ",");

function critereZone(p: Prospect, ctx: ContexteQualification): Resultat {
  const z = p.zone;
  const cibles = ciblesApplicables(p, ctx).filter((c) => c.zones.etablissements.length + c.zones.communes.length + c.zones.codesPostaux.length + c.zones.provinces.length + c.zones.regions.length > 0);
  if (cibles.length === 0) return resultat("non_verifie", null, "Aucune zone de cible définie pour ce type de prospect");
  const position = z.position ?? null;
  if (z.codePostal === null && z.commune === null && z.province === null && z.region === null && position === null) return resultat("non_verifie", null, "Zone du prospect inconnue");
  const s = p.sources.find((x) => x.sourceId !== null) ?? p.sources[0] ?? null;
  const etabsDe = (c: CibleProspection) => ctx.etablissements.filter((e) => e.code !== undefined && c.zones.etablissements.includes(e.code));
  const commune = z.commune === null ? null : sansAccents(z.commune);

  // 1. Code postal ou commune de la cible (ou d'un établissement cité), province ou région explicites.
  const dedans = cibles.some((c) => {
    const etabs = etabsDe(c);
    const communes = [...c.zones.communes, ...etabs.flatMap((e) => e.communes ?? [])].map(sansAccents);
    const postaux = [...c.zones.codesPostaux, ...etabs.flatMap((e) => e.codesPostaux ?? [])];
    return (
      (z.codePostal !== null && postaux.includes(z.codePostal)) ||
      (commune !== null && communes.includes(commune)) ||
      (z.province !== null && c.zones.provinces.map(sansAccents).includes(sansAccents(z.province))) ||
      (z.region !== null && c.zones.regions.includes(z.region))
    );
  });
  if (dedans) return resultat("verifie", s, "Zone du prospect dans une zone de la cible");

  // 2. Distance au plus proche établissement de la cible (positions connues des deux côtés).
  if (position !== null) {
    const mesures = cibles
      .flatMap((c) => etabsDe(c).map((e) => ({ e, c })))
      .filter((x) => x.e.position !== null && x.e.position !== undefined)
      .map((x) => ({ nom: x.e.nom, d: distanceKm({ latitude: position.lat, longitude: position.lon }, { latitude: x.e.position!.lat, longitude: x.e.position!.lon }) }))
      .sort((a, b) => a.d - b.d);
    const proche = mesures[0];
    if (proche !== undefined) {
      const rayon = RAYON_ZONE_DEFAUT_KM;
      return proche.d <= rayon
        ? resultat("verifie", s, `À ${formatKm(proche.d)} km du bureau ${proche.nom} (rayon de ${rayon} km)`)
        : resultat("contraire", s, `À ${formatKm(proche.d)} km du bureau ${proche.nom} : au-delà du rayon de ${rayon} km`);
    }
  }

  // 3. Province (ou région) déduite du code postal, comparée à celles de la cible.
  const province = z.province ?? provinceDuCodePostal(z.codePostal);
  const region = z.region ?? (province !== null ? regionDeLaProvince(province) : null);
  const provincesCible = new Set<string>();
  const regionsCible = new Set<string>();
  for (const c of cibles) {
    for (const x of c.zones.provinces) provincesCible.add(sansAccents(x));
    for (const x of c.zones.regions) regionsCible.add(x);
    for (const cp of [...c.zones.codesPostaux, ...etabsDe(c).flatMap((e) => e.codesPostaux ?? [])]) {
      const pr = provinceDuCodePostal(cp);
      if (pr !== null) provincesCible.add(sansAccents(pr));
    }
  }
  if (province !== null && provincesCible.has(sansAccents(province))) return resultat("verifie", s, `Province du prospect (${province}) dans la cible`);
  if (region !== null && regionsCible.has(region)) return resultat("verifie", s, `Région du prospect (${region}) dans la cible`);
  const comparable = (province !== null && provincesCible.size > 0) || (region !== null && regionsCible.size > 0);
  if (comparable) return resultat("contraire", s, `Province ou région du prospect (${province ?? region}) hors des zones de la cible`);

  // 4. Information manquante : on ne conclut pas.
  return resultat("non_verifie", s, "Zone du prospect non comparable aux zones de la cible (position ou province inconnue)");
}

function critereTaille(p: Prospect): Resultat {
  const s = sourceSignee(p, "bnb");
  return s !== null ? resultat("verifie", s, "Comptes annuels BNB déposés") : resultat("non_verifie", null, "Ni comptes BNB ni taille déclarée");
}

function critereJoignable(p: Prospect): Resultat {
  const pose = "base légale du contact";
  if (aMotif(p, "opposition_client")) return resultat("contraire", null, "Opposition enregistrée", pose);
  if (aMotif(p, "liste_dncm")) return resultat("contraire", null, "Inscrit sur la liste « Ne m'appelez plus »", pose);
  if (p.basesLegales.length > 0) return resultat("verifie", null, `Base légale : ${[...new Set(p.basesLegales.map((b) => b.canal))].join(", ")} ; aucune opposition`, pose);
  return resultat("non_verifie", null, "Aucune base légale enregistrée pour un canal", pose);
}

function criterePasClient(p: Prospect, ctx: ContexteQualification): Resultat {
  const base = "base de clients";
  if (aMotif(p, "client_actuel") || p.particulier?.origine === "client_existant") return resultat("contraire", null, "Déjà client du courtier", base);
  return ctx.baseClientsImportee
    ? resultat("verifie", null, "Absent de la base de clients importée", base)
    : resultat("non_verifie", null, "Aucune base de clients importée pour croiser", base);
}

function critereConcordance(p: Prospect): Resultat {
  const cles = new Set(p.sources.map((s) => s.service ?? s.type));
  return cles.size >= 2
    ? resultat("verifie", p.sources.find((s) => s.sourceId !== null) ?? null, `Sources concordantes : ${[...cles].join(", ")}`, [...cles].join(" + "))
    : resultat("non_verifie", null, "Une seule source");
}


/* ------------------------------------------------------------------ */
/* Critères spécialisés « courtier » (lot 1) : entreprises seulement    */
/* ------------------------------------------------------------------ */

/** Fenêtres de récence (mois) : installation, puis événement. */
export const MOIS_INSTALLATION_RECENTE = 24;
export const MOIS_EVENEMENT_RECENT = 12;

const sansObjet = (detail: string, source: SourceProspect | null = null): Resultat => ({ ...resultat("non_verifie", source, detail), sansObjet: true });

/** Date limite (AAAA-MM-JJ) d'une fenêtre de `mois` mois avant `maintenant`. */
function limiteRecence(maintenant: string, mois: number): string {
  const d = new Date(maintenant);
  d.setUTCMonth(d.getUTCMonth() - mois);
  return d.toISOString().slice(0, 10);
}
const dateFr = (jour: string) => `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}`;

/** Faits BCE datés du prospect, avec la source qui les porte. `null` : aucune source n'a rapporté de faits (rien à comparer). */
function faitsBce(p: Prospect): { fait: FaitBce; source: SourceProspect }[] | null {
  const avecFaits = p.sources.filter((s) => s.faits !== undefined);
  return avecFaits.length === 0 ? null : avecFaits.flatMap((s) => s.faits!.map((fait) => ({ fait, source: s })));
}

interface ResultatBesoins {
  readonly r: Resultat;
  readonly besoins: BesoinCourtier[];
}

/** A1 : le métier impose une RC professionnelle (NACE de la BCE, sinon catégorie OpenStreetMap). */
function critereAssuranceObligatoire(p: Prospect): ResultatBesoins {
  const bce = sourceSignee(p, "bce");
  const parNace = p.nace.map((n) => ({ n, m: metierRcParNace(n) })).find((x) => x.m !== null);
  if (parNace?.m) return { r: resultat("verifie", bce, `NACE ${parNace.n} : ${parNace.m.libelle}. ${parNace.m.raison}`), besoins: ["rc_pro_obligatoire"] };
  const osm = p.sources.find((x) => x.service === "osm" && x.categorieOsm !== undefined) ?? null;
  const parOsm = osm?.categorieOsm ? metierRcParOsm(osm.categorieOsm.cle, osm.categorieOsm.valeur) : null;
  if (osm && parOsm) return { r: resultat("verifie", osm, `Catégorie OpenStreetMap « ${osm.categorieOsm!.cle}=${osm.categorieOsm!.valeur} » : ${parOsm.libelle}. ${parOsm.raison}`), besoins: ["rc_pro_obligatoire"] };
  const deduit = p.nace.length === 0 ? naceDeduitOsm(p) : null;
  const parDeduit = deduit?.nace.map((n) => ({ n, m: metierRcParNace(n) })).find((x) => x.m !== null);
  if (deduit && parDeduit?.m && osm) return { r: resultat("verifie", osm, `Catégorie OpenStreetMap « ${deduit.libelle} » : NACE ${parDeduit.n}, ${parDeduit.m.libelle}. ${parDeduit.m.raison}`), besoins: ["rc_pro_obligatoire"] };
  if (p.nace.length > 0) return { r: sansObjet(`NACE ${p.nace.join(", ")} : aucun métier à RC professionnelle obligatoire`, bce), besoins: [] };
  if (osm && deduit) return { r: sansObjet(`Catégorie OpenStreetMap « ${deduit.libelle} » : aucun métier à RC professionnelle obligatoire`, osm), besoins: [] };
  return { r: resultat("non_verifie", null, "Ni code NACE ni catégorie OpenStreetMap connus"), besoins: [] };
}

/** A2 : début d'activité de la BCE à moins de 24 mois. */
function critereInstallationRecente(p: Prospect, ctx: ContexteQualification): ResultatBesoins {
  const faits = faitsBce(p);
  const debuts = (faits ?? []).filter((x) => x.fait.code === "debut_entreprise" || x.fait.code === "creation").sort((a, b) => (a.fait.date < b.fait.date ? 1 : -1));
  const d = debuts[0];
  if (d === undefined) return { r: resultat("non_verifie", null, faits === null ? "Aucune date de début BCE déposée" : "Date de début d'activité absente de la BCE"), besoins: [] };
  const limite = limiteRecence(ctx.maintenant, MOIS_INSTALLATION_RECENTE);
  const trace = `début d'activité le ${dateFr(d.fait.date)} (BCE, relevé du ${dateCourte(d.source.collecteLe)})`;
  if (d.fait.date > ctx.maintenant.slice(0, 10)) return { r: resultat("non_verifie", d.source, `Date de début postérieure au calcul (${dateFr(d.fait.date)}) : non retenue`), besoins: [] };
  return d.fait.date >= limite
    ? { r: resultat("verifie", d.source, `Installation de moins de ${MOIS_INSTALLATION_RECENTE} mois : ${trace}`), besoins: ["installation_recente"] }
    : { r: sansObjet(`Installation de plus de ${MOIS_INSTALLATION_RECENTE} mois : ${trace}`, d.source), besoins: [] };
}

const BESOIN_PAR_FAIT: Readonly<Partial<Record<FaitBce["code"], { besoin: BesoinCourtier; libelle: string }>>> = {
  changement_forme: { besoin: "evenement_changement_forme", libelle: "changement de forme juridique" },
  nouvel_etablissement: { besoin: "evenement_nouvel_etablissement", libelle: "nouvel établissement" },
  changement_adresse: { besoin: "evenement_changement_adresse", libelle: "changement d'adresse" },
};

/**
 * A3 : événement BCE à moins de 12 mois. Changement d'activité : non porté par les faits BCE actuels (voir
 * `FaitBce`), donc jamais deviné ici.
 */
function critereEvenementRecent(p: Prospect, ctx: ContexteQualification): ResultatBesoins {
  const faits = faitsBce(p);
  if (faits === null) return { r: resultat("non_verifie", null, "Aucun changement BCE déposé"), besoins: [] };
  const limite = limiteRecence(ctx.maintenant, MOIS_EVENEMENT_RECENT);
  const aujourdhui = ctx.maintenant.slice(0, 10);
  const recents = faits
    .filter((x) => BESOIN_PAR_FAIT[x.fait.code] !== undefined && x.fait.date >= limite && x.fait.date <= aujourdhui)
    .sort((a, b) => (a.fait.date < b.fait.date ? 1 : -1));
  const premier = recents[0];
  if (premier === undefined) return { r: sansObjet(`Aucun événement BCE depuis moins de ${MOIS_EVENEMENT_RECENT} mois`, faits[0]!.source), besoins: [] };
  const trace = recents.map((x) => `${BESOIN_PAR_FAIT[x.fait.code]!.libelle} le ${dateFr(x.fait.date)}`).join(", ");
  const besoins = [...new Set(recents.map((x) => BESOIN_PAR_FAIT[x.fait.code]!.besoin))];
  return { r: resultat("verifie", premier.source, `Événement de moins de ${MOIS_EVENEMENT_RECENT} mois : ${trace} (BCE, relevé du ${dateCourte(premier.source.collecteLe)})`), besoins };
}

/** A7 : un besoin détecté (A1, A2, A3) correspond à une offre confirmée de la fiche du client. */
function critereBesoinOffre(besoins: readonly BesoinCourtier[], ctx: ContexteQualification): Resultat {
  if (besoins.length === 0) return sansObjet("Aucun besoin détecté : rien à rapprocher des offres");
  const offres = ctx.offres ?? [];
  for (const b of besoins) {
    const trouvees = offresActivesPourBesoin(b, offres);
    if (trouvees.length > 0) return resultat("verifie", null, `Besoin « ${LIBELLE_BESOIN[b]} » couvert par l'offre active ${trouvees.map((o) => o.nom).join(", ")} (fiche du client)`, "fiche du client");
  }
  return resultat("non_verifie", null, `Besoins détectés (${besoins.map((b) => LIBELLE_BESOIN[b]).join(", ")}) sans offre active correspondante dans la fiche du client`, "fiche du client");
}

/* ------------------------------------------------------------------ */
/* Critères « courtier » du lot 2 : comptes annuels BNB                  */
/* ------------------------------------------------------------------ */

const euros = (v: number) => `${Math.round(v).toLocaleString("fr-BE").replace(/[\u202f\u00a0]/gu, " ")} €`;
const pasDeBnb = "Aucun compte annuel BNB déposé pour ce prospect";

/** Dernière source BNB qui porte une taille (les dépôts s'ajoutent dans l'ordre : le plus récent est le dernier). */
function comptesBnb(p: Prospect): { source: SourceProspect; taille: TailleBnb } | null {
  const s = p.sources.filter((x) => x.service === "bnb" && x.taille !== undefined).at(-1);
  return s?.taille === undefined ? null : { source: s, taille: s.taille };
}

/** A4 : l'entreprise emploie du personnel (effectif ETP > 0 au dernier exercice) : accidents du travail obligatoire, assurance de groupe. */
function critereEmploiePersonnel(p: Prospect): Resultat {
  const c = comptesBnb(p);
  if (c === null) return resultat("non_verifie", null, pasDeBnb);
  const etp = c.taille.effectifEtp;
  if (etp === null) return resultat("non_verifie", c.source, "Effectif absent des comptes annuels BNB : rien de deviné");
  const exercice = c.taille.exercice === null ? "" : ` (exercice ${c.taille.exercice})`;
  if (etp > 0) return resultat("verifie", c.source, `Effectif de ${String(etp).replace(".", ",")} équivalents temps plein${exercice} (BNB, rubrique 9087) : assurance accidents du travail obligatoire, assurance de groupe possible`);
  return sansObjet(`Effectif nul${exercice} (BNB, rubrique 9087) : pas de personnel salarié`, c.source);
}

/** A5 : flotte probable (activité qui roule, estimée) : NACE de construction, transport, livraison ou soins à domicile ET effectif d'au moins 5. */
function critereFlotteProbable(p: Prospect): Resultat {
  const bce = sourceSignee(p, "bce");
  if (p.nace.length === 0) return resultat("non_verifie", null, "Aucun code NACE connu : activité non établie");
  const roulant = p.nace.find(naceFlotte);
  if (roulant === undefined) return sansObjet(`NACE ${p.nace.join(", ")} : activité sans flotte probable (construction, transport, livraison, soins à domicile)`, bce);
  const c = comptesBnb(p);
  const etp = c?.taille.effectifEtp ?? null;
  if (c === null || etp === null) return resultat("non_verifie", c?.source ?? bce, `NACE ${roulant} (activité qui roule) mais effectif inconnu : estimation impossible`);
  if (etp < EFFECTIF_MIN_FLOTTE) return sansObjet(`NACE ${roulant} mais effectif de ${String(etp).replace(".", ",")} ETP, sous ${EFFECTIF_MIN_FLOTTE} : flotte peu probable`, c.source);
  return resultat("verifie", c.source, `Estimation, non vérifiée : NACE ${roulant} (construction, transport, livraison ou soins à domicile) et ${String(etp).replace(".", ",")} ETP (BNB) rendent une flotte de véhicules probable`);
}

/** A6 : propriétaire de ses locaux (terrains et constructions, rubrique 22, positifs au dernier exercice). */
function critereProprietaireLocaux(p: Prospect): Resultat {
  const c = comptesBnb(p);
  if (c === null) return resultat("non_verifie", null, pasDeBnb);
  const v = c.taille.terrainsConstructions;
  if (v === undefined || v === null) return resultat("non_verifie", c.source, "Terrains et constructions (rubrique 22) absents des comptes annuels BNB : rien de deviné");
  if (v > 0) return resultat("verifie", c.source, `Terrains et constructions à l'actif : ${euros(v)} (BNB, rubrique 22, dernier exercice déposé) : propriétaire probable de ses locaux, besoin incendie et bâtiment`);
  return sansObjet("Aucun terrain ni construction à l'actif (BNB, rubrique 22) : pas propriétaire de ses locaux", c.source);
}

/** B8 : santé financière : fonds propres positifs et aucune perte sur les deux derniers exercices ; fonds propres nuls ou négatifs : contraire. */
function critereSanteFinanciere(p: Prospect): Resultat {
  const c = comptesBnb(p);
  if (c === null) return resultat("non_verifie", null, pasDeBnb);
  const fp = c.taille.fondsPropres;
  if (fp === undefined || fp === null) return resultat("non_verifie", c.source, "Fonds propres (rubrique 10/15) absents des comptes annuels BNB : rien de deviné");
  if (fp <= 0) return resultat("contraire", c.source, `Fonds propres de ${euros(fp)} (BNB, rubrique 10/15, dernier exercice déposé) : nuls ou négatifs`);
  const r = c.taille.resultats ?? [];
  if (r.length < 2 || r.some((x) => x.resultat === null) || r[0]!.exercice - r[1]!.exercice !== 1) {
    return resultat("non_verifie", c.source, `Fonds propres positifs (${euros(fp)}) mais résultat des deux derniers exercices non établi par la BNB (rubrique 9904) : rien de deviné`);
  }
  const pertes = r.filter((x) => x.resultat! < 0);
  const trace = r.map((x) => `${x.exercice} : ${euros(x.resultat!)}`).join(", ");
  if (pertes.length > 0) return resultat("non_verifie", c.source, `Fonds propres positifs (${euros(fp)}) mais perte sur ${pertes.map((x) => x.exercice).join(" et ")} (BNB, rubrique 9904 : ${trace}) : santé non établie`);
  return resultat("verifie", c.source, `Fonds propres positifs (${euros(fp)}, BNB rubrique 10/15) et aucune perte sur les deux derniers exercices (rubrique 9904 : ${trace})`);
}

/* ------------------------------------------------------------------ */
/* Critères « courtier » du lot 3 : bureau spécialisé, contact publié   */
/* ------------------------------------------------------------------ */

/**
 * B11 : un bureau du client qui suit le segment du prospect est à moins de RAYON_ZONE_DEFAUT_KM. Il faut que la fiche
 * dise quels segments chaque bureau suit (`segmentsSuivis`) : sinon rien n'est deviné. Jamais contraire : l'absence d'un
 * bureau spécialisé à portée ne prouve rien contre le prospect.
 */
function critereBureauSpecialise(p: Prospect, ctx: ContexteQualification): Resultat {
  const s = p.sources.find((x) => x.sourceId !== null) ?? p.sources[0] ?? null;
  const renseignes = ctx.etablissements.filter((e) => (e.segmentsSuivis ?? []).length > 0);
  if (renseignes.length === 0) return resultat("non_verifie", null, "La fiche du client n'indique pas quel bureau suit quel segment", "fiche du client");
  // Segments du prospect : ceux que son renvoi désigne, plus ceux dont le NACE (ou la catégorie OpenStreetMap) correspond.
  const naces = (p.nace.length > 0 ? p.nace : (naceDeduitOsm(p)?.nace ?? [])).map(nace);
  const parNace = ctx.segments.filter((seg) => seg.nace.map(nace).some((a) => naces.some((n) => n.startsWith(a)))).map((seg) => seg.code);
  const segments = new Set([...p.referentiel.segments, ...parNace]);
  if (segments.size === 0) return resultat("non_verifie", s, "Segment du prospect inconnu : impossible de chercher un bureau spécialisé");
  const position = p.zone.position ?? null;
  if (position === null) return resultat("non_verifie", s, "Position du prospect inconnue : distance aux bureaux impossible à mesurer");
  const specialises = renseignes.filter((e) => (e.segmentsSuivis ?? []).some((c) => segments.has(c)));
  if (specialises.length === 0) return resultat("non_verifie", s, "Aucun bureau de la fiche du client ne suit le segment de ce prospect");
  const mesures = specialises
    .filter((e) => e.position !== null && e.position !== undefined)
    .map((e) => ({ nom: e.nom, d: distanceKm({ latitude: position.lat, longitude: position.lon }, { latitude: e.position!.lat, longitude: e.position!.lon }) }))
    .sort((a, b) => a.d - b.d);
  const proche = mesures[0];
  if (proche === undefined) return resultat("non_verifie", s, "Les bureaux qui suivent ce segment n'ont pas de position connue dans la fiche du client");
  return proche.d <= RAYON_ZONE_DEFAUT_KM
    ? resultat("verifie", s, `Le bureau ${proche.nom}, qui suit le segment du prospect, est à ${formatKm(proche.d)} km (rayon de ${RAYON_ZONE_DEFAUT_KM} km)`)
    : resultat("non_verifie", s, `Le bureau spécialisé le plus proche (${proche.nom}) est à ${formatKm(proche.d)} km : au-delà du rayon de ${RAYON_ZONE_DEFAUT_KM} km`);
}

/**
 * C12 : contact professionnel PUBLIÉ et permis. Entreprise : site lu ou adresse impersonnelle (info@, contact@) déjà présents
 * dans les sources du prospect, ou téléphone SI la liste « Ne m'appelez plus » a été consultée à une date connue (`dncmVerifieLe` de la
 * base légale du canal téléphone ; sans cette date, le numéro seul ne vaut rien) ; opposition ou liste « Ne m'appelez plus » : contraire. Particulier : seulement
 * avec un consentement documenté. Aucune coordonnée n'est lue ni recopiée : on ne regarde que le canal et la nature.
 */
function critereContactPublicPermis(p: Prospect): Resultat {
  const pose = "coordonnées publiées et base légale";
  const opposition = aMotif(p, "opposition_client");
  const dncm = aMotif(p, "liste_dncm");
  if (p.cible === "particulier") {
    if (opposition || dncm) return resultat("non_verifie", null, `${opposition ? "Opposition enregistrée" : "Inscrit sur la liste « Ne m'appelez plus »"} : aucun consentement ne vaut`, pose);
    const consenti = p.particulier?.consentements.filter((c) => c.retireLe === null) ?? [];
    if (consenti.length > 0) return resultat("verifie", null, `Consentement documenté, non retiré : ${[...new Set(consenti.flatMap((c) => c.canauxAutorises))].join(", ")}`, pose);
    return resultat("non_verifie", null, "Aucun consentement documenté pour ce particulier", pose);
  }
  if (opposition) return resultat("contraire", null, "Opposition enregistrée", pose);
  if (dncm) return resultat("contraire", null, "Inscrit sur la liste « Ne m'appelez plus »", pose);
  // Téléphone : la liste nationale « Ne m'appelez plus » doit avoir été consultée à une date connue (`dncmVerifieLe` d'une base
  // légale du canal téléphone). Un numéro dans les sources ne prouve rien là-dessus. L'écrit (site lu, adresse impersonnelle) n'en dépend pas.
  const aTelephone = p.coordonnees.some((c) => c.canal === "telephone");
  const verifDncm = p.basesLegales.filter((b) => b.canal === "telephone" && b.dncmVerifieLe !== null).map((b) => b.dncmVerifieLe as string).sort().at(-1) ?? null;
  const telephoneRetenu = aTelephone && verifDncm !== null;
  const publies = [
    ...(telephoneRetenu ? ["téléphone"] : []),
    ...(p.coordonnees.some((c) => c.canal === "courriel" && c.nature === "impersonnelle") ? ["adresse électronique impersonnelle"] : []),
    ...(p.sources.some((x) => x.type === "lecture_url" && x.service === null && x.url !== null) ? ["site web"] : []),
  ];
  const s = p.sources.find((x) => x.sourceId !== null) ?? p.sources[0] ?? null;
  const reserveTel = aTelephone && !telephoneRetenu ? " ; téléphone non retenu : la liste « Ne m'appelez plus » n'a pas été consultée" : "";
  if (publies.length > 0) {
    const liste = telephoneRetenu && verifDncm !== null ? ` ; liste « Ne m'appelez plus » consultée le ${dateCourte(verifDncm)}` : "";
    return resultat("verifie", s, `Contact professionnel publié dans les sources : ${publies.join(", ")} ; aucune opposition enregistrée${liste}${reserveTel}`, pose);
  }
  if (aTelephone) return resultat("non_verifie", s, "Téléphone publié, mais la liste « Ne m'appelez plus » n'a pas été consultée (aucune vérification datée) : contact par téléphone non établi", pose);
  return resultat("non_verifie", s, "Aucun contact professionnel publié (téléphone, site ou adresse impersonnelle) dans les sources du prospect", pose);
}

/** B10 : contraire quand le prospect est un courtier, un assureur ou un agent (FSMA, NACE 65 et 66). */
function criterePasConcurrent(p: Prospect): Resultat {
  const fsma = sourceSignee(p, "fsma");
  if (fsma !== null) return resultat("contraire", fsma, "Inscrit au registre FSMA : intermédiaire ou entreprise d'assurance, donc concurrent");
  const bce = sourceSignee(p, "bce");
  const concurrent = p.nace.find(naceConcurrent);
  if (concurrent !== undefined) return resultat("contraire", bce, `NACE ${concurrent} : assurance ou activité auxiliaire d'assurance (courtier, agent), donc concurrent`);
  if (p.nace.length > 0) return resultat("verifie", bce, `NACE ${p.nace.join(", ")} : hors assurance (65 et 66) ; aucune inscription FSMA parmi les sources`);
  return resultat("non_verifie", null, "Ni code NACE ni inscription FSMA connus : concurrence non vérifiable");
}

const LIBELLES: Readonly<Record<CodeCritereQualification, string>> = {
  entreprise_active: "Active (entreprise) ou demande / client (particulier)",
  segment_cible: "Dans un segment de la cible",
  zone_cible: "Dans une zone de la cible",
  taille_connue: "Taille connue",
  joignable_legalement: "Joignable légalement",
  pas_deja_client: "Pas déjà client",
  sources_concordantes: "Au moins deux sources concordantes",
  assurance_obligatoire_metier: "Assurance obligatoire pour son métier",
  installation_recente: "Installation de moins de 24 mois",
  evenement_recent: "Événement de moins de 12 mois",
  besoin_offre_active: "Besoin couvert par une offre active du courtier",
  pas_concurrent: "Pas un concurrent (courtier, assureur ou agent)",
  emploie_personnel: "Emploie du personnel",
  flotte_probable: "Flotte de véhicules probable",
  proprietaire_locaux: "Propriétaire de ses locaux",
  sante_financiere: "Bonne santé financière",
  bureau_specialise_proche: "Bureau spécialisé à proximité",
  contact_public_permis: "Contact professionnel publié et permis",
};

/** Critères « courtier » : ne valent que pour une entreprise (pas pour un particulier ni un partenaire). */
const CRITERES_COURTIER: readonly CodeCritereQualification[] = ["assurance_obligatoire_metier", "installation_recente", "evenement_recent", "besoin_offre_active", "pas_concurrent", "emploie_personnel", "flotte_probable", "proprietaire_locaux", "sante_financiere", "bureau_specialise_proche"];

/** Critères applicables : la taille et les critères « courtier » n'ont de sens que pour une entreprise. */
function applicables(p: Prospect): CodeCritereQualification[] {
  const tous = Object.keys(POIDS_QUALIFICATION_DEFAUT) as CodeCritereQualification[];
  if (p.cible === "partenaire") return tous.filter((c) => c !== "taille_connue" && c !== "contact_public_permis" && !CRITERES_COURTIER.includes(c));
  // Particulier : ni taille ni critères « courtier » ; le contact publié et permis, lui, vaut pour les deux formes de personne.
  return p.cible === "entreprise" ? tous : tous.filter((c) => c !== "taille_connue" && !CRITERES_COURTIER.includes(c));
}

/** Date JJ/MM/AAAA (UTC) d'un horodatage. */
function dateCourte(horodatage: string): string {
  const d = new Date(horodatage);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** Le détail affiché d'une décision humaine. */
export function detailDecisionHumaine(c: Pick<CorrectionLue, "auteur" | "date" | "justification">): string {
  return `Décision humaine de ${c.auteur} le ${dateCourte(c.date)} : ${c.justification}`;
}

/** Le détail affiché d'une évaluation de l'agent (sources comprises, dans la limite du contrat). */
export function detailEvaluationAgent(e: Pick<EvaluationLue, "date" | "justification" | "sources">): string {
  const sources = e.sources.length > 0 ? ` (sources : ${e.sources.join(", ")})` : "";
  return `Évalué par l'agent le ${dateCourte(e.date)} : ${e.justification}${sources}`.slice(0, 800);
}

/** Critère personnalisé : décision humaine, puis évaluation de l'agent, puis non vérifié. */
function resultatPersonnalise(correction: CorrectionLue | undefined, evaluation: EvaluationLue | undefined): Resultat {
  if (correction) return avecCorrection(resultat("non_verifie", null, "", ""), correction);
  if (evaluation) return { statut: evaluation.statut, sourceId: null, source: "agent", detail: detailEvaluationAgent(evaluation) };
  return resultat("non_verifie", null, "Critère personnalisé : pas encore évalué par l'agent Prospection", "aucune source");
}

/** Résultat calculé d'un critère, remplacé par la décision humaine s'il y en a une. */
function avecCorrection(r: Resultat, correction: CorrectionLue | undefined): Resultat {
  return correction ? { statut: correction.statut, sourceId: null, source: "humain", detail: detailDecisionHumaine(correction) } : r;
}

/**
 * Évalue les critères d'un prospect (statut, source, détail) : critères codés actifs et applicables, puis
 * critères personnalisés ; une correction humaine remplace le statut calculé. `poids` (facultatif) force
 * les poids des critères codés ; sinon ceux des réglages du contexte, sinon ceux par défaut.
 */
export function evaluerCriteres(p: Prospect, ctx: ContexteQualification, poids?: Readonly<Record<CodeCritereQualification, number>>): CritereQualification[] {
  const reglages = ctx.reglages ?? REGLAGES_QUALIFICATION_DEFAUT;
  const corrections = new Map((ctx.corrections?.get(p.id) ?? []).map((c) => [c.code, c]));
  // Les besoins détectés par A1 à A3 (avant toute décision humaine) servent à A7.
  const a1 = p.cible === "entreprise" ? critereAssuranceObligatoire(p) : null;
  const a2 = p.cible === "entreprise" ? critereInstallationRecente(p, ctx) : null;
  const a3 = p.cible === "entreprise" ? critereEvenementRecent(p, ctx) : null;
  const besoins = [...new Set([a1, a2, a3].flatMap((x) => x?.besoins ?? []))];
  const eval_: Record<CodeCritereQualification, () => Resultat> = {
    entreprise_active: () => critereActif(p),
    segment_cible: () => critereSegment(p, ctx),
    zone_cible: () => critereZone(p, ctx),
    taille_connue: () => critereTaille(p),
    joignable_legalement: () => critereJoignable(p),
    pas_deja_client: () => criterePasClient(p, ctx),
    sources_concordantes: () => critereConcordance(p),
    assurance_obligatoire_metier: () => a1!.r,
    installation_recente: () => a2!.r,
    evenement_recent: () => a3!.r,
    besoin_offre_active: () => critereBesoinOffre(besoins, ctx),
    pas_concurrent: () => criterePasConcurrent(p),
    emploie_personnel: () => critereEmploiePersonnel(p),
    flotte_probable: () => critereFlotteProbable(p),
    proprietaire_locaux: () => critereProprietaireLocaux(p),
    sante_financiere: () => critereSanteFinanciere(p),
    bureau_specialise_proche: () => critereBureauSpecialise(p, ctx),
    contact_public_permis: () => critereContactPublicPermis(p),
  };
  const codes = applicables(p).filter((code) => reglages.criteres[code].actif);
  const calcules: CritereQualification[] = codes.flatMap((code) => {
    const brut = eval_[code]();
    // Un critère sans objet pour ce prospect sort du calcul, sauf si un humain l'a tranché.
    if (brut.sansObjet === true && !corrections.has(code)) return [];
    const { sansObjet: _sansObjet, ...r } = brut;
    return [{ code, libelle: LIBELLES[code], poids: poids?.[code] ?? reglages.criteres[code].poids, ...avecCorrection(r, corrections.get(code)) }];
  });
  const evaluations = new Map((ctx.evaluations?.get(p.id) ?? []).map((e) => [e.code, e]));
  const perso: CritereQualification[] = reglages.personnalises.map((c) => ({
    code: c.code, libelle: c.libelle, poids: c.poids, ...resultatPersonnalise(corrections.get(c.code), evaluations.get(c.code)),
  }));
  return [...calcules, ...perso];
}

/** Libellé d'un critère codé. */
export function libelleCritere(code: CodeCritereQualification): string {
  return LIBELLES[code];
}

/**
 * Confiance de qualification : somme des poids des critères vérifiés sur la somme des poids applicables,
 * arrondie ; plafonnée à 50 % par un critère contraire. Tous vérifiés : 100.
 */
export function calculerConfiance(p: Prospect, ctx: ContexteQualification, poids?: Readonly<Record<CodeCritereQualification, number>>): ConfianceQualification {
  const seuil = (ctx.reglages ?? REGLAGES_QUALIFICATION_DEFAUT).seuil;
  const criteres = evaluerCriteres(p, ctx, poids);
  const total = criteres.reduce((t, c) => t + c.poids, 0);
  const acquis = criteres.filter((c) => c.statut === "verifie").reduce((t, c) => t + c.poids, 0);
  const brute = total === 0 ? 0 : Math.round((acquis / total) * 100);
  const plafonnee = criteres.some((c) => c.statut === "contraire");
  const valeur = plafonnee ? Math.min(brute, PLAFOND_CONTRAIRE) : brute;
  return { valeur, qualifie: !plafonnee && valeur >= seuil, plafonnee, seuil, criteres, calculeLe: ctx.maintenant };
}

/** Outils de la passerelle qui peuvent établir un critère encore non vérifié (aucun pour un critère personnalisé : l'agent l'évalue lui-même). */
function verificateurs(codeBrut: string, p: Prospect, personnalises: readonly CriterePersonnalise[]): { verifiePar: CriteresManquants["manquants"][number]["verifiePar"]; action: string | null } {
  if (!(codeBrut in POIDS_QUALIFICATION_DEFAUT)) {
    const description = personnalises.find((c) => c.code === codeBrut)?.description.trim();
    const base = "Critère personnalisé : l'agent Prospection l'évalue à partir de sa description (route prospects.critere.evaluer, avec sources ; ne rien conclure sans source)";
    return { verifiePar: [], action: description ? `${base} : ${description}` : `${base}.` };
  }
  return verificateursCodes(codeBrut as CodeCritereQualification, p);
}

function verificateursCodes(code: CodeCritereQualification, p: Prospect): { verifiePar: CriteresManquants["manquants"][number]["verifiePar"]; action: string | null } {
  const b2c = p.cible === "particulier";
  const aDeja = (s: SourceProspect["service"]) => p.sources.some((x) => x.service === s);
  switch (code) {
    case "entreprise_active":
      if (b2c) return { verifiePar: [{ service: "b2c", outil: "b2c_demandes_devis", pourquoi: "Établit la demande de devis du particulier" }], action: null };
      return p.cible === "partenaire"
        ? { verifiePar: [{ service: "fsma", outil: "fsma_rechercher", pourquoi: "Confirme l'inscription de l'intermédiaire au registre FSMA" }], action: null }
        : { verifiePar: [{ service: "bce", outil: "bce_entreprise", pourquoi: "Confirme que l'entreprise est active à la BCE" }], action: null };
    case "segment_cible":
      return b2c
        ? { verifiePar: [{ service: "b2c", outil: "b2c_demandes_devis", pourquoi: "Le produit demandé situe le segment du particulier" }], action: null }
        : { verifiePar: [{ service: "bce", outil: "bce_entreprise", pourquoi: "Donne les codes NACE de l'entreprise" }], action: null };
    case "zone_cible":
      return b2c
        ? { verifiePar: [{ service: "b2c", outil: "b2c_demandes_devis", pourquoi: "Donne l'adresse du particulier" }], action: null }
        : {
            verifiePar: [
              { service: "bce", outil: "bce_entreprise", pourquoi: "Donne l'adresse du siège" },
              { service: "osm", outil: "osm_commerces", pourquoi: "Situe l'établissement sur la carte" },
            ],
            action: null,
          };
    case "taille_connue":
      return { verifiePar: [{ service: "bnb", outil: "bnb_comptes", pourquoi: "Comptes annuels : effectif et chiffre d'affaires" }], action: null };
    case "joignable_legalement":
      return { verifiePar: [], action: "Enregistrer la base légale du canal (consentement ou intérêt légitime B2B) et vérifier les listes d'opposition." };
    case "pas_deja_client":
      return { verifiePar: [], action: "Importer la base de clients (base-clients.importer) pour croiser le prospect avec les clients actuels." };
    case "assurance_obligatoire_metier":
      return { verifiePar: [{ service: "bce", outil: "bce_entreprise", pourquoi: "Donne les codes NACE qui disent si le métier impose une RC professionnelle" }, { service: "osm", outil: "osm_commerces", pourquoi: "À défaut de NACE, la catégorie du lieu situe le métier" }], action: null };
    case "installation_recente":
      return { verifiePar: [{ service: "bce", outil: "bce_entreprise", pourquoi: "Donne la date de début d'activité" }], action: null };
    case "evenement_recent":
      return { verifiePar: [{ service: "bce", outil: "bce_changements", pourquoi: "Liste les changements récents : déménagement, nouvel établissement, forme juridique" }], action: null };
    case "besoin_offre_active":
      return { verifiePar: [], action: "Vérifier que la fiche du client porte une offre confirmée qui couvre le besoin détecté (RC pro, revenu garanti, pension, incendie)." };
    case "emploie_personnel":
    case "proprietaire_locaux":
    case "sante_financiere":
      return { verifiePar: [{ service: "bnb", outil: "bnb_comptes", pourquoi: code === "emploie_personnel" ? "Comptes annuels : effectif en équivalents temps plein (rubrique 9087)" : code === "proprietaire_locaux" ? "Comptes annuels : terrains et constructions (rubrique 22)" : "Comptes annuels : fonds propres (rubrique 10/15) et résultat de l'exercice (rubrique 9904) sur deux exercices" }], action: null };
    case "bureau_specialise_proche":
      return { verifiePar: [], action: "Renseigner dans la fiche du client les segments que suit chaque bureau (segmentsSuivis) et la position des bureaux ; situer le prospect (adresse ou carte)." };
    case "contact_public_permis":
      return b2c
        ? { verifiePar: [], action: "Documenter le consentement du particulier (canal, date, preuve) avant tout contact." }
        : { verifiePar: [{ service: "osm", outil: "osm_commerces", pourquoi: "Les lieux OpenStreetMap publient souvent téléphone et site" }, { service: "bce", outil: "bce_entreprise", pourquoi: "Le registre BCE publie parfois téléphone, site et adresse électronique de l'entreprise" }], action: null };
    case "flotte_probable":
      return { verifiePar: [{ service: "bce", outil: "bce_entreprise", pourquoi: "Donne les codes NACE (construction, transport, livraison, soins à domicile)" }, { service: "bnb", outil: "bnb_comptes", pourquoi: "Comptes annuels : effectif en équivalents temps plein (rubrique 9087)" }], action: null };
    case "pas_concurrent":
      return { verifiePar: [{ service: "fsma", outil: "fsma_rechercher", pourquoi: "Dit si l'entreprise est inscrite au registre FSMA (courtier, agent, assureur)" }, { service: "bce", outil: "bce_entreprise", pourquoi: "Donne les codes NACE (65 et 66 : assurance)" }], action: null };
    case "sources_concordantes": {
      const autres: CriteresManquants["manquants"][number]["verifiePar"] = [];
      if (!aDeja("bce") && !b2c) autres.push({ service: "bce", outil: "bce_entreprise", pourquoi: "Recoupe le prospect avec le registre officiel" });
      if (!aDeja("osm") && !b2c) autres.push({ service: "osm", outil: "osm_commerces", pourquoi: "Recoupe l'adresse ou la commune avec la carte" });
      if (!aDeja("fsma") && p.cible === "partenaire") autres.push({ service: "fsma", outil: "fsma_rechercher", pourquoi: "Recoupe avec le registre FSMA" });
      return { verifiePar: autres, action: autres.length === 0 ? "Ajouter une seconde source indépendante (dépôt ou saisie vérifiée)." : null };
    }
  }
}

/** Critères encore `non_verifie` d'un prospect, avec les outils de la passerelle qui pourraient les établir. */
export function criteresManquants(p: Prospect, confiance: ConfianceQualification, personnalises: readonly CriterePersonnalise[] = []): CriteresManquants {
  return {
    prospectId: p.id,
    confiance: confiance.valeur,
    qualifie: confiance.qualifie,
    seuil: confiance.seuil,
    manquants: confiance.criteres
      .filter((c) => c.statut === "non_verifie")
      .map((c) => ({ code: c.code, libelle: c.libelle, poids: c.poids, ...verificateurs(c.code, p, personnalises) })),
    contraires: confiance.criteres.filter((c) => c.statut === "contraire").map((c) => c.code),
  };
}
