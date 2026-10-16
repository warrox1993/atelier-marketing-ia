/**
 * Compte rendu d'un lead : lecture DÉTERMINISTE des données stockées (aucune IA, rien d'inventé).
 *
 * Fonction pure : l'appelant lit le prospect (avec sa confiance de qualification), la fiche du client
 * (offres, segments, établissements) et l'heure. Chaque phrase vient d'un fait stocké ; ce qui manque
 * est dit comme manquant (signaux vides, offre ou établissement `null` avec la raison).
 */
import { naceDeduitOsm } from "./categories-osm-nace.js";
import {
  type CanalContact,
  type CompteRenduProspect,
  type EtablissementReferentiel,
  type FaitBce,
  type TailleBnb,
  type OffreReferentiel,
  type PositionProspect,
  type Prospect,
  type SegmentReferentiel,
} from "../contrats/index.js";
import { criteresManquants } from "./qualification-prospects.js";
import { distanceKm } from "./geo.js";

/** Ce que le compte rendu sait de la fiche du client. */
export interface FicheClientCompteRendu {
  readonly offres: readonly OffreReferentiel[];
  readonly segments: readonly SegmentReferentiel[];
  readonly etablissements: readonly EtablissementReferentiel[];
}

const sansAccents = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const nace = (c: string) => c.replace(/\./gu, "");
const JOUR_MS = 86_400_000;
/** Une demande de devis ou de rendez-vous de moins de 90 jours est un signal de moment. */
const FENETRE_SIGNAL_JOURS = 90;

export { distanceKm };

/**
 * Coordonnées portées par un objet : `position: { lat, lon }` (schéma actuel du prospect et de
 * l'établissement), sinon `latitude` et `longitude` (forme plus ancienne, lue défensivement).
 */
function coordonnees(x: unknown): { latitude: number; longitude: number } | null {
  const o = x as { position?: { lat?: unknown; lon?: unknown } | null; latitude?: unknown; longitude?: unknown } | null;
  const ok = (a: unknown, b: unknown): a is number => typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b);
  if (o?.position && ok(o.position.lat, o.position.lon)) return { latitude: o.position.lat, longitude: o.position.lon as number };
  return o && ok(o.latitude, o.longitude) ? { latitude: o.latitude, longitude: o.longitude as number } : null;
}

const TERMES_ETABLISSEMENT = new Set([
  "pharmacie", "cabinet", "centre", "clinique", "maison", "sprl", "srl", "sa", "sc", "asbl", "scrl", "scomm", "hopital", "laboratoire",
  "groupe", "societe", "association", "institut", "residence", "polyclinique", "service", "pole", "ecole", "mutualite", "croix", "rouge",
]);
const MOT_CAPITALISE = /^\p{Lu}[\p{Ll}'’]+(?:-\p{Lu}[\p{Ll}'’]+)*$/u;
const sansAccent = (m: string): string => m.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Vrai si la dénomination ressemble à un nom de personne (cabinet exercé en nom propre) : « Dr » ou « Docteur » suivi
 * d'un ou plusieurs noms, ou deux à trois mots capitalisés sans terme d'établissement. Heuristique prudente, jamais une preuve.
 */
export function estNomDePersonneProbable(denomination: string | null | undefined): boolean {
  const mots = (denomination ?? "").trim().split(/\s+/u).filter((m) => m !== "");
  if (mots.length === 0) return false;
  if (mots.some((m) => TERMES_ETABLISSEMENT.has(sansAccent(m).replace(/[.,;]/gu, "")))) return false;
  const titre = /^(?:dr|docteur)\.?$/iu.test(mots[0]!);
  if (titre) return mots.length >= 2 && mots.length <= 5 && mots.slice(1).every((m) => MOT_CAPITALISE.test(m));
  return mots.length >= 2 && mots.length <= 3 && mots.every((m) => MOT_CAPITALISE.test(m));
}

/** Nom affiché : dénomination, pseudonyme d'un particulier, sinon identifiant court (le nom d'une personne reste chiffré). */
export function nomDuProspect(p: Prospect): string {
  return p.denomination ?? p.particulier?.pseudonyme ?? `[prospect-${p.id.slice(0, 8)}]`;
}

const LIBELLES_CANAUX: Readonly<Record<CanalContact, string>> = { courriel: "courriel", sms: "SMS", telephone: "téléphone", courrier: "courrier postal" };
/** Ordre de préférence quand plusieurs canaux sont permis : le moins intrusif d'abord. */
const ORDRE_CANAUX: readonly CanalContact[] = ["courriel", "courrier", "telephone", "sms"];

function libelleScore(score: NonNullable<Prospect["score"]>): string {
  const m = score.etalonnage?.marge;
  if (score.nature === "probabilite_mesuree" && m) {
    return `${Math.round(m.probabilite * 100)} % de chances (entre ${Math.round(m.borneBasse * 100)} et ${Math.round(m.borneHaute * 100)} %), mesuré sur ${score.etalonnage!.effectif} dossiers`;
  }
  return `Score ${score.valeur}/100, estimation (pas assez d'historique pour le mesurer)`;
}

const MOIS_MS = JOUR_MS * 30.4375;
/** Une société créée il y a moins de 24 mois est un signal de moment. */
const FENETRE_CREATION_MOIS = 24;
/** Un nouvel établissement, un déménagement ou un changement de forme de moins de 12 mois sont des signaux de moment. */
const FENETRE_CHANGEMENT_MOIS = 12;

const jjmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Durée écoulée en clair : « il y a moins d'un mois », « il y a 8 mois ». */
const ilYa = (mois: number) => (mois < 1 ? "il y a moins d'un mois" : `il y a ${Math.floor(mois)} mois`);

/**
 * Signaux de moment tirés des faits datés de la BCE portés par les sources du prospect. Un fait sans date
 * valide, ou daté du futur, ne donne aucun signal ; pour un même signal, le fait le plus récent est retenu.
 */
function signauxBce(p: Prospect, maintenant: Date): CompteRenduProspect["signaux"] {
  const regles: ReadonlyArray<{ code: string; faits: ReadonlyArray<FaitBce["code"]>; fenetre: number; libelle: string }> = [
    { code: "creation_recente", faits: ["creation", "debut_entreprise"], fenetre: FENETRE_CREATION_MOIS, libelle: "Société créée" },
    { code: "nouvel_etablissement", faits: ["nouvel_etablissement"], fenetre: FENETRE_CHANGEMENT_MOIS, libelle: "Nouvelle unité d'établissement ouverte" },
    { code: "demenagement", faits: ["changement_adresse"], fenetre: FENETRE_CHANGEMENT_MOIS, libelle: "Adresse changée" },
    { code: "changement_forme", faits: ["changement_forme"], fenetre: FENETRE_CHANGEMENT_MOIS, libelle: "Forme juridique changée" },
  ];
  const signaux: CompteRenduProspect["signaux"] = [];
  for (const r of regles) {
    let meilleur: { date: string; collecteLe: string } | null = null;
    for (const s of p.sources) {
      if (s.service !== "bce") continue;
      for (const f of s.faits ?? []) {
        // Un fait daté du futur (ou sans date valide) est écarté AVANT le choix du plus récent.
        const mf = (maintenant.getTime() - new Date(`${f.date}T00:00:00Z`).getTime()) / MOIS_MS;
        if (Number.isNaN(mf) || mf < 0) continue;
        if (r.faits.includes(f.code) && (meilleur === null || f.date > meilleur.date)) meilleur = { date: f.date, collecteLe: s.collecteLe };
      }
    }
    if (meilleur === null) continue;
    const t = new Date(`${meilleur.date}T00:00:00Z`).getTime();
    const mois = (maintenant.getTime() - t) / MOIS_MS;
    if (Number.isNaN(t) || mois < 0 || mois > r.fenetre) continue;
    signaux.push({ code: r.code, libelle: `${r.libelle} ${ilYa(mois)}`, date: `${meilleur.date}T00:00:00.000Z`, source: `BCE, dépôt du ${jjmmaaaa(meilleur.collecteLe)}` });
  }
  return signaux;
}

function signauxDuProspect(p: Prospect, maintenant: Date): CompteRenduProspect["signaux"] {
  const signaux: CompteRenduProspect["signaux"] = [];
  const origine = p.particulier?.origine;
  if (origine && ["formulaire_entrant", "simulateur_devis", "devis_abandonne", "prise_rendez_vous"].includes(origine)) {
    const s = p.sources[0]!;
    const age = (maintenant.getTime() - new Date(s.collecteLe).getTime()) / JOUR_MS;
    if (age >= 0 && age <= FENETRE_SIGNAL_JOURS) {
      const quoi = origine === "prise_rendez_vous" ? "Rendez-vous demandé" : origine === "devis_abandonne" ? "Devis commencé puis abandonné" : "Demande de devis ou de contact reçue";
      signaux.push({ code: "demande_recente", libelle: `${quoi} il y a moins de ${FENETRE_SIGNAL_JOURS} jours`, date: s.collecteLe, source: s.service ? s.service.toUpperCase() : s.type });
    }
  }
  return [...signaux, ...signauxBce(p, maintenant)];
}

function offreRecommandee(p: Prospect, fiche: FicheClientCompteRendu): Pick<CompteRenduProspect, "offreRecommandee" | "raisonSansOffre"> {
  if (fiche.offres.length === 0) return { offreRecommandee: null, raisonSansOffre: "Aucune offre n'est enregistrée dans la fiche du client." };
  // Segments du prospect : ceux que son renvoi désigne, plus ceux dont un code NACE couvre son activité.
  const codes = new Set(p.referentiel.segments);
  // Lieu OpenStreetMap sans NACE : les NACE déduits de sa catégorie (même table que le critère segment).
  const deduit = p.nace.length === 0 ? naceDeduitOsm(p) : null;
  const naceProspect = (deduit?.nace ?? p.nace).map(nace);
  const parNace = new Map<string, string>();
  for (const s of fiche.segments) {
    if (s.nace.map(nace).some((a) => naceProspect.some((n) => n.startsWith(a) || a.startsWith(n)))) {
      codes.add(s.code);
      parNace.set(s.code, deduit ? `catégorie OpenStreetMap « ${deduit.libelle} », NACE ${deduit.nace.join(", ")}` : `activité NACE ${p.nace.join(", ")}`);
    }
  }
  const demandees = new Set(p.particulier?.offresDemandees ?? []);
  const cibleOk = (o: OffreReferentiel) => o.cible === undefined || o.cible === "les_deux" || o.cible === (p.cible === "particulier" ? "b2c" : "b2b");
  const correspond = (o: OffreReferentiel) => cibleOk(o) && ((o.code !== undefined && demandees.has(o.code)) || (o.segments ?? []).some((c) => codes.has(c)));
  const candidates = fiche.offres.filter(correspond);
  if (candidates.length === 0) {
    return { offreRecommandee: null, raisonSansOffre: codes.size === 0 && demandees.size === 0 ? "Le segment du prospect n'est pas établi : aucune offre ne peut lui être rattachée." : "Aucune offre de la fiche ne vise le segment de ce prospect." };
  }
  const confirmees = candidates.filter((o) => o.confirmee);
  if (confirmees.length === 0) return { offreRecommandee: null, raisonSansOffre: `Seules des offres non confirmées par le client correspondent (${candidates.map((o) => o.nom).join(", ")}) : elles ne sont pas recommandées.` };
  // Une offre explicitement demandée passe avant une offre trouvée par le segment.
  const choisie = confirmees.find((o) => o.code !== undefined && demandees.has(o.code)) ?? confirmees[0]!;
  const segment = (choisie.segments ?? []).find((c) => codes.has(c));
  const libSegment = segment ? (fiche.segments.find((s) => s.code === segment)?.libelle ?? segment) : null;
  const raison =
    choisie.code !== undefined && demandees.has(choisie.code)
      ? "Offre demandée par le prospect."
      : `Offre confirmée par le client pour le segment « ${libSegment} »${segment && parNace.has(segment) ? ` (${parNace.get(segment)})` : ""}.`;
  return { offreRecommandee: { code: choisie.code ?? null, nom: choisie.nom, description: choisie.description, raison }, raisonSansOffre: null };
}

function etablissementProche(p: Prospect, fiche: FicheClientCompteRendu): CompteRenduProspect["etablissementProche"] {
  const etabs = fiche.etablissements.filter((e) => e.confirme);
  if (etabs.length === 0) return null;
  const sortie = (e: EtablissementReferentiel, raison: "distance" | "meme_code_postal" | "meme_commune", d: number | null, precisionPosition: PositionProspect["precision"] | null = null) => ({ code: e.code ?? null, nom: e.nom, adresse: e.adresse, distanceKm: d, raison, precisionPosition });
  // 1. Positions des deux côtés : l'établissement le plus proche à vol d'oiseau, avec la précision de la position du prospect.
  //    Sans position d'un côté ou de l'autre, on retombe sur le code postal puis la commune.
  const cp = coordonnees(p.zone);
  if (cp) {
    const avec = etabs.map((e) => ({ e, c: coordonnees(e) })).filter((x): x is { e: EtablissementReferentiel; c: NonNullable<ReturnType<typeof coordonnees>> } => x.c !== null);
    if (avec.length > 0) {
      const [meilleur] = avec.map((x) => ({ e: x.e, d: distanceKm(cp, x.c) })).sort((a, b) => a.d - b.d);
      return sortie(meilleur!.e, "distance", Math.round(meilleur!.d * 10) / 10, p.zone.position?.precision ?? null);
    }
  }
  // 2. Même code postal, puis même commune.
  if (p.zone.codePostal !== null) {
    const e = etabs.find((x) => (x.codesPostaux ?? []).includes(p.zone.codePostal!));
    if (e) return sortie(e, "meme_code_postal", null);
  }
  if (p.zone.commune !== null) {
    const commune = sansAccents(p.zone.commune);
    const e = etabs.find((x) => (x.communes ?? []).some((c) => sansAccents(c) === commune));
    if (e) return sortie(e, "meme_commune", null);
  }
  return null;
}

/** Compte rendu d'un prospect dont la confiance de qualification est calculée (`p.confiance`). */
const LIBELLES_TAILLE: Readonly<Record<NonNullable<TailleBnb["categorie"]>, string>> = {
  micro: "Micro-entreprise", petite: "Petite entreprise", moyenne: "Moyenne entreprise", grande: "Grande entreprise",
};

/** « Petite entreprise : 6 personnes, comptes 2025 (Banque nationale) » : seulement ce que la source BNB porte, rien d'inventé. */
function detailTaille(p: Prospect): string | null {
  const t = p.sources.filter((s) => s.service === "bnb" && s.taille !== undefined).at(-1)?.taille;
  if (t === undefined) return null;
  const parties: string[] = [];
  if (t.effectifEtp !== null) parties.push(`${String(t.effectifEtp).replace(".", ",")} ${t.effectifEtp > 1 ? "personnes" : "personne"}`);
  if (t.exercice !== null) parties.push(`comptes ${t.exercice} (Banque nationale)`);
  else parties.push("comptes de la Banque nationale");
  const debut = t.categorie === null ? null : LIBELLES_TAILLE[t.categorie];
  return debut === null ? parties.join(", ") : `${debut} : ${parties.join(", ")}`;
}

export function construireCompteRendu(p: Prospect, fiche: FicheClientCompteRendu, maintenant: Date): CompteRenduProspect {
  const conf = p.confiance;
  if (!conf) throw new Error("Compte rendu : la confiance de qualification doit être calculée avant.");
  const nom = nomDuProspect(p);
  const datePar = (sourceId: string | null) => (sourceId === null ? null : (p.sources.find((s) => s.sourceId === sourceId)?.collecteLe ?? null));
  const derniereBase = p.basesLegales.map((b) => b.verifieLe).sort().at(-1) ?? null;
  const verifies = conf.criteres
    .filter((c) => c.statut === "verifie")
    .map((c) => {
      const s = c.sourceId === null ? null : (p.sources.find((x) => x.sourceId === c.sourceId) ?? null);
      return { code: c.code, libelle: c.libelle, detail: c.code === "taille_connue" ? detailTaille(p) ?? c.detail : c.detail, source: c.source, service: s?.service ?? null, date: datePar(c.sourceId) ?? (c.code === "joignable_legalement" ? derniereBase : null) };
    });
  const nonVerifies = conf.criteres.filter((c) => c.statut === "non_verifie").map((c) => ({ code: c.code, libelle: c.libelle, detail: c.detail }));
  const contraires = conf.criteres.filter((c) => c.statut === "contraire").map((c) => ({ code: c.code, libelle: c.libelle, detail: c.detail }));
  const score = p.score ? { valeur: p.score.valeur, nature: p.score.nature, libelle: libelleScore(p.score) } : null;
  const differenceConfianceScore = score
    ? `La confiance (${conf.valeur} %) dit à quel point il est établi, sources à l'appui, que ce lead correspond à votre cible ; le score (${score.valeur}/100, ${score.nature === "estimation" ? "estimation" : "probabilité mesurée"}) estime sa chance de signer. L'un ne remplace pas l'autre.`
    : `La confiance (${conf.valeur} %) dit à quel point il est établi, sources à l'appui, que ce lead correspond à votre cible ; le score, qui estimerait sa chance de signer, n'est pas encore calculé.`;
  const signaux = signauxDuProspect(p, maintenant);
  const { offreRecommandee: offre, raisonSansOffre } = offreRecommandee(p, fiche);
  const etab = etablissementProche(p, fiche);

  // Prochaine action : règle simple, jamais d'envoi automatique.
  const canaux = ORDRE_CANAUX.filter((c) => p.basesLegales.some((b) => b.canal === c));
  const manquants = criteresManquants(p, conf);
  let prochaineAction: CompteRenduProspect["prochaineAction"];
  if (p.statut === "exclu" || p.statut === "refuse") {
    prochaineAction = { libelle: p.statut === "exclu" ? `Ne pas contacter : prospect exclu (${p.motifsExclusion.map((m) => m.motif.replace(/_/gu, " ")).join(", ")}).` : "Ne pas contacter : prospect écarté par un humain.", canal: null, outils: [] };
  } else if (conf.qualifie && canaux.length > 0) {
    prochaineAction = { libelle: `Proposer un premier contact par ${LIBELLES_CANAUX[canaux[0]!]} après validation humaine.`, canal: canaux[0]!, outils: [] };
  } else if (contraires.length > 0 && manquants.manquants.length === 0) {
    prochaineAction = { libelle: `Vérifier avec un humain avant tout contact : ${contraires.map((c) => c.libelle.toLowerCase()).join(" ; ")} (critère contraire).`, canal: null, outils: [] };
  } else {
    const outils = [...new Set(manquants.manquants.flatMap((m) => m.verifiePar.map((v) => v.outil)))];
    const gestes = manquants.manquants.filter((m) => m.verifiePar.length === 0 && m.action).map((m) => m.action!);
    const parties = [...(outils.length ? [outils.join(", ")] : []), ...gestes];
    prochaineAction = { libelle: `Enrichir : ${parties.length ? parties.join(" ; ") : "aucun outil ne peut établir les critères restants, un humain doit les confirmer"}.`, canal: null, outils };
  }

  const nomPropre = p.denomination !== null && p.denomination !== undefined && estNomDePersonneProbable(p.denomination);
  if (nomPropre && p.statut !== "exclu" && p.statut !== "refuse") {
    prochaineAction = { ...prochaineAction, libelle: `${prochaineAction.libelle} Praticien en nom propre probable : contact seulement à l'adresse professionnelle.` };
  }
  const limites = [
    ...(nomPropre ? ["Praticien en nom propre probable : données d'une personne physique ; contact seulement à l'adresse professionnelle, après validation humaine (RGPD)"] : []),
    p.basesLegales.length > 0
      ? `RGPD : le contact repose sur une base légale vérifiée par canal (${p.basesLegales.map((b) => `${LIBELLES_CANAUX[b.canal]} : ${b.base.replace(/_/gu, " ")}`).join(" ; ")}). La personne peut s'opposer à tout moment (art. 21) et doit être informée dès le premier message (art. 14). Aucun contact sans validation humaine.`
      : "RGPD : aucune base légale vérifiée pour un canal, donc aucun contact possible pour l'instant. La personne peut s'opposer à tout moment (art. 21). Aucun contact sans validation humaine.",
    ...(p.mode === "demonstration" ? ["Données de démonstration : ce lead est fictif, aucune vraie personne ni entreprise n'est concernée."] : []),
    ...(p.score?.nature === "estimation" ? ["Le score est une estimation par règles simples : il classe les leads entre eux sans mesurer leur chance réelle de signer."] : []),
  ];

  const base = { prospectId: p.id, nom, genereLe: maintenant.toISOString(), pourquoi: { verifies, nonVerifies, contraires }, confiance: { valeur: conf.valeur, qualifie: conf.qualifie, plafonnee: conf.plafonnee, seuil: conf.seuil }, score, differenceConfianceScore, signaux, offreRecommandee: offre, raisonSansOffre, etablissementProche: etab, prochaineAction, limites };
  return { ...base, markdown: enMarkdown(base) };
}

const jour = (iso: string | null) => (iso === null ? "date inconnue" : iso.slice(0, 10));

function enMarkdown(c: Omit<CompteRenduProspect, "markdown">): string {
  const l: string[] = [];
  l.push(`## Compte rendu du lead : ${c.nom}`, "");
  l.push(`Identifiant : ${c.prospectId}. Établi le ${jour(c.genereLe)} à partir des données stockées, sans IA.`, "");
  l.push("### Pourquoi ce lead", "");
  if (c.pourquoi.verifies.length) for (const v of c.pourquoi.verifies) l.push(`- Vérifié : ${v.libelle}. ${v.detail}. Source : ${v.source}${v.service ? ` (${v.service})` : ""}, ${jour(v.date)}.`);
  else l.push("- Aucun critère n'est encore vérifié.");
  for (const n of c.pourquoi.nonVerifies) l.push(`- Non vérifié : ${n.libelle}. ${n.detail}.`);
  for (const x of c.pourquoi.contraires) l.push(`- Contraire : ${x.libelle}. ${x.detail}.`);
  l.push("", "### Confiance et score", "");
  l.push(`- Confiance de qualification : ${c.confiance.valeur} % (${c.confiance.qualifie ? "qualifié" : c.confiance.plafonnee ? "non qualifié, critère contraire" : `à enrichir, seuil ${c.confiance.seuil} %`}).`);
  l.push(`- Score de conversion : ${c.score ? c.score.libelle : "pas encore calculé"}.`);
  l.push(`- ${c.differenceConfianceScore}`);
  l.push("", "### Signaux de moment", "");
  if (c.signaux.length) {
    for (const s of c.signaux) {
      // Un signal BCE se lit « Société créée il y a 8 mois (BCE) », puis la date du fait et celle du dépôt.
      if (s.source.startsWith("BCE, ")) l.push(`- ${s.libelle} (BCE). Fait du ${s.date === null ? "date inconnue" : jjmmaaaa(s.date)}, ${s.source.slice(5)}.`);
      else l.push(`- ${s.libelle} (${s.source}, ${jour(s.date)}).`);
    }
  }
  else l.push("- Aucun signal de moment établi par les sources.");
  l.push("", "### Offre recommandée", "");
  l.push(c.offreRecommandee ? `- ${c.offreRecommandee.nom} : ${c.offreRecommandee.raison}` : `- Aucune : ${c.raisonSansOffre}`);
  l.push("", "### Établissement proche", "");
  if (c.etablissementProche) {
    const e = c.etablissementProche;
    l.push(`- ${e.nom}${e.adresse ? `, ${e.adresse}` : ""} (${e.raison === "distance" ? `à ${e.distanceKm} km à vol d'oiseau${e.precisionPosition === "exacte" ? "" : e.precisionPosition === "code_postal" ? ", position approximative (centre du code postal)" : e.precisionPosition === "commune" ? ", position approximative (centre de la commune)" : ""}` : e.raison === "meme_code_postal" ? "même code postal" : "même commune"}).`);
  } else l.push("- Aucun établissement de la fiche ne correspond à la zone connue du lead.");
  l.push("", "### Prochaine action", "", `- ${c.prochaineAction.libelle}`);
  l.push("", "### Limites", "");
  for (const x of c.limites) l.push(`- ${x}`);
  return l.join("\n");
}
