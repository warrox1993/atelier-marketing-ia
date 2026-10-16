/**
 * Confiance de qualification des prospects (0 à 100 %).
 *
 * À ne JAMAIS confondre avec le score de conversion (`score-prospects.ts`, `ScoreProspect`), qui estime
 * la chance de signer : la confiance dit à quel point il est établi que le prospect correspond à la
 * cible du client. Elle ne monte qu'avec des critères VÉRIFIÉS par des sources déposées (BCE, FSMA,
 * OSM, B2C, base légale, base de clients), jamais par hypothèse : un fait inconnu reste « non vérifié »
 * et ne rapporte rien.
 *
 * Calcul : moyenne pondérée des critères applicables ; un critère « contraire » plafonne la confiance à
 * 50 % et rend le prospect non qualifié. `qualifie` = confiance au moins égale à 90 %.
 * Fonctions pures : le contexte (cibles du client, base de clients) est lu par l'appelant.
 */
import { naceDeduitOsm } from "./categories-osm-nace.js";
import { provinceDuCodePostal, regionDeLaProvince, distanceKm } from "./geo.js";
import {
  SEUIL_QUALIFICATION,
  type CibleProspection,
  type CodeCritereQualification,
  type ConfianceQualification,
  type CriteresManquants,
  type CritereQualification,
  type EtablissementReferentiel,
  type OrigineParticulier,
  type Prospect,
  type SegmentReferentiel,
  type SourceProspect,
  type StatutCritereQualification,
} from "../contrats/index.js";

/** Poids par défaut des critères (somme : 100). Un critère non applicable au prospect sort du calcul. */
export const POIDS_QUALIFICATION_DEFAUT: Readonly<Record<CodeCritereQualification, number>> = {
  entreprise_active: 20,
  segment_cible: 20,
  zone_cible: 15,
  joignable_legalement: 15,
  pas_deja_client: 10,
  taille_connue: 10,
  sources_concordantes: 10,
};

/** Plafond de la confiance quand un critère est contraire. */
export const PLAFOND_CONTRAIRE = 50;

/** Ce que le calcul sait du client : ses cibles de prospection et l'état de sa base de clients. */
export interface ContexteQualification {
  readonly cibles: readonly CibleProspection[];
  readonly segments: readonly SegmentReferentiel[];
  readonly etablissements: readonly EtablissementReferentiel[];
  /** Vrai si une base de clients a été importée : sans elle, « pas déjà client » ne peut pas être établi. */
  readonly baseClientsImportee: boolean;
  /** Horodatage du calcul. */
  readonly maintenant: string;
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

type Resultat = Pick<CritereQualification, "statut" | "sourceId" | "source" | "detail">;
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
    const trouve = segments.find((seg) => seg.nace.map(nace).some((a) => deduit.nace.map(nace).some((n) => n.startsWith(a) || a.startsWith(n))));
    const liste = deduit.nace.join(", ");
    return trouve
      ? resultat("verifie", so, `Catégorie OpenStreetMap « ${deduit.libelle} » : NACE ${liste} (segment ${trouve.libelle})`)
      : resultat("contraire", so, `Catégorie OpenStreetMap « ${deduit.libelle} » : NACE ${liste} hors des segments de la cible`);
  }
  const ok = p.nace.map(nace).some((n) => attendus.some((a) => n.startsWith(a) || a.startsWith(n)));
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

const LIBELLES: Readonly<Record<CodeCritereQualification, string>> = {
  entreprise_active: "Active (entreprise) ou demande / client (particulier)",
  segment_cible: "Dans un segment de la cible",
  zone_cible: "Dans une zone de la cible",
  taille_connue: "Taille connue",
  joignable_legalement: "Joignable légalement",
  pas_deja_client: "Pas déjà client",
  sources_concordantes: "Au moins deux sources concordantes",
};

/** Critères applicables : la taille n'a de sens que pour une entreprise. */
function applicables(p: Prospect): CodeCritereQualification[] {
  const tous = Object.keys(POIDS_QUALIFICATION_DEFAUT) as CodeCritereQualification[];
  return p.cible === "entreprise" ? tous : tous.filter((c) => c !== "taille_connue");
}

/** Évalue les critères d'un prospect (statut, source, détail), sans les pondérer. */
export function evaluerCriteres(p: Prospect, ctx: ContexteQualification, poids: Readonly<Record<CodeCritereQualification, number>> = POIDS_QUALIFICATION_DEFAUT): CritereQualification[] {
  const eval_: Record<CodeCritereQualification, () => Resultat> = {
    entreprise_active: () => critereActif(p),
    segment_cible: () => critereSegment(p, ctx),
    zone_cible: () => critereZone(p, ctx),
    taille_connue: () => critereTaille(p),
    joignable_legalement: () => critereJoignable(p),
    pas_deja_client: () => criterePasClient(p, ctx),
    sources_concordantes: () => critereConcordance(p),
  };
  return applicables(p).map((code) => ({ code, libelle: LIBELLES[code], poids: poids[code], ...eval_[code]() }));
}

/**
 * Confiance de qualification : somme des poids des critères vérifiés sur la somme des poids applicables,
 * arrondie ; plafonnée à 50 % par un critère contraire. Tous vérifiés : 100.
 */
export function calculerConfiance(p: Prospect, ctx: ContexteQualification, poids: Readonly<Record<CodeCritereQualification, number>> = POIDS_QUALIFICATION_DEFAUT): ConfianceQualification {
  const criteres = evaluerCriteres(p, ctx, poids);
  const total = criteres.reduce((t, c) => t + c.poids, 0);
  const acquis = criteres.filter((c) => c.statut === "verifie").reduce((t, c) => t + c.poids, 0);
  const brute = total === 0 ? 0 : Math.round((acquis / total) * 100);
  const plafonnee = criteres.some((c) => c.statut === "contraire");
  const valeur = plafonnee ? Math.min(brute, PLAFOND_CONTRAIRE) : brute;
  return { valeur, qualifie: !plafonnee && valeur >= SEUIL_QUALIFICATION, plafonnee, seuil: SEUIL_QUALIFICATION, criteres, calculeLe: ctx.maintenant };
}

/** Outils de la passerelle qui peuvent établir un critère encore non vérifié. */
function verificateurs(code: CodeCritereQualification, p: Prospect): { verifiePar: CriteresManquants["manquants"][number]["verifiePar"]; action: string | null } {
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
export function criteresManquants(p: Prospect, confiance: ConfianceQualification): CriteresManquants {
  return {
    prospectId: p.id,
    confiance: confiance.valeur,
    qualifie: confiance.qualifie,
    seuil: SEUIL_QUALIFICATION,
    manquants: confiance.criteres
      .filter((c) => c.statut === "non_verifie")
      .map((c) => ({ code: c.code, libelle: c.libelle, poids: c.poids, ...verificateurs(c.code, p) })),
    contraires: confiance.criteres.filter((c) => c.statut === "contraire").map((c) => c.code),
  };
}
