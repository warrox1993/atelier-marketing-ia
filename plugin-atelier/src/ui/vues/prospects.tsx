/**
 * Rubrique « Prospects » (lot P11) : liste filtrée, fiche avec score expliqué et base légale par
 * canal, exclusion humaine, puis base de clients. Les coordonnées n'arrivent jamais en clair ici,
 * et l'usine ne contacte personne : aucune action d'envoi.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useHostContext, useHostLocation, useHostNavigation } from "@paperclipai/plugin-sdk/ui";
import {
  CanalContact,
  CodeNace,
  CompteRenduProspect,
  MATRICE_BASES_LEGALES,
  MotifExclusion,
  SEUILS_ETALONNAGE,
  SEUIL_QUALIFICATION,
  StatutCritereQualification,
  StatutProspect,
  type BaseLegale,
  type CibleProspect,
  type CritereQualification,
  type PageProspects,
  type Prospect,
} from "../../contrats/prospection.js";
import type { Campagne } from "../../contrats/campagnes.js";
import { CLES_FILTRE_PROSPECTS, filtreDepuisAdresse, parametresDepuisFiltre, type FiltreProspects } from "../../contrats/filtre-prospects.js";
import { naceDeduitOsm } from "../../serveur/categories-osm-nace.js";
import { expliquerConfiance } from "./explication-confiance.js";
import { useDonnees } from "../donnees.js";
import { BaseClients, ChoixFichier, lireBase64 } from "../base-clients.js";
import { DemanderCoordinateur } from "../composants/demander-coordinateur.js";
import { Bouton, Champ, Chargement, ecranEtroit, EnTete, EtatErreur, Horodatage, LienHote, Pastille, Section, Vide } from "../composants.js";
import { idCourt, nombre, type Ton } from "../format.js";
import { chemin } from "../route.js";
import { appelRoute, telechargerBase64 } from "../routes-prospection.js";
import { RegistreConsentements } from "../registre-consentements.js";

const LIBELLES_CIBLES: Readonly<Record<CibleProspect, string>> = { entreprise: "Entreprises", particulier: "Particuliers", partenaire: "Partenaires" };
const LIBELLE_CIBLE_UNIQUE: Readonly<Record<CibleProspect, string>> = { entreprise: "Entreprise", particulier: "Particulier", partenaire: "Partenaire" };

const LIBELLES_STATUTS: Readonly<Record<StatutProspect, string>> = {
  nouveau: "Nouveau",
  exclu: "Exclu par une règle",
  qualifie: "Retenu",
  exporte: "Exporté",
  refuse: "Refusé par un humain",
};
const TONS_STATUTS: Readonly<Record<StatutProspect, Ton>> = { nouveau: "info", exclu: "attention", qualifie: "succes", exporte: "neutre", refuse: "neutre" };

export const LIBELLES_MOTIFS: Readonly<Record<MotifExclusion, string>> = {
  doublon: "Doublon d'un prospect déjà connu",
  numero_bce_invalide: "Numéro BCE invalide",
  entreprise_inactive: "Entreprise inactive",
  personne_physique_bce: "Personne physique : les données BCE ne servent pas au marketing direct",
  hors_zone: "Hors de la zone visée",
  courriel_invalide: "Courriel invalide",
  courriel_nominatif_sans_consentement: "Courriel nominatif sans consentement",
  telephone_invalide: "Téléphone invalide",
  opposition_client: "Opposition enregistrée",
  liste_dncm: "Inscrit sur la liste « Ne m'appelez plus »",
  client_actuel: "Déjà client",
  donnee_demonstration_campagne_reelle: "Donnée non réelle dans une campagne",
};

const LIBELLES_CANAUX: Readonly<Record<CanalContact, string>> = { courriel: "Courriel", sms: "SMS", telephone: "Téléphone", courrier: "Courrier postal" };

const LIBELLES_BASES: Readonly<Record<BaseLegale, string>> = {
  consentement: "consentement",
  interet_legitime: "intérêt légitime documenté",
  client_existant_produits_analogues: "client existant, produits analogues",
  personne_morale_adresse_impersonnelle: "personne morale, adresse impersonnelle",
};

/** Nom affiché : dénomination, pseudonyme d'un particulier, sinon identifiant court (le nom d'une personne reste chiffré). */
export function nomProspect(p: Prospect): string {
  return p.denomination ?? p.particulier?.pseudonyme ?? `[prospect-${idCourt(p.id)}]`;
}

export function libelleZone(z: Prospect["zone"]): string {
  const parties = [z.codePostal, z.commune].filter(Boolean).join(" ");
  return parties || z.province || z.region || "Zone inconnue";
}


const entier = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/gu, "\u00a0");

const EXPLICATION_MESUREE =
  "Part de prospects semblables qui sont devenus clients, mesurée sur vos propres résultats. La fourchette est la marge d'incertitude à 95 %.";
const EXPLICATION_ESTIMATION =
  "Note de 0 à 100 calculée avec des règles simples. Elle classe les prospects entre eux mais ne dit pas leur chance réelle de signer : il manque encore assez de dossiers conclus pour la mesurer.";

/** Texte lisible d'un score : une chance mesurée, ou une estimation clairement annoncée comme telle. */
export function libelleScore(score: NonNullable<Prospect["score"]>): string {
  if (score.nature === "probabilite_mesuree") {
    const marge = score.etalonnage?.marge;
    if (marge) {
      const dossiers = score.etalonnage ? `, mesuré sur ${entier(score.etalonnage.effectif)} dossiers` : "";
      return `${Math.round(marge.probabilite * 100)} % de chances (entre ${Math.round(marge.borneBasse * 100)} et ${Math.round(marge.borneHaute * 100)} %)${dossiers}`;
    }
    return `Score ${score.valeur}/100, mesuré sur vos résultats avec marge d'incertitude`;
  }
  return `Score ${score.valeur}/100, estimation (pas assez d'historique)`;
}

/** Le chiffre et sa nature exacte : une estimation n'est jamais présentée comme une probabilité. */
export function ScoreAffiche({ p }: { p: Prospect }) {
  if (!p.score) return <span className="atl-attenue">pas de score</span>;
  const mesuree = p.score.nature === "probabilite_mesuree";
  return (
    <span className="atl-score" title={mesuree ? EXPLICATION_MESUREE : EXPLICATION_ESTIMATION}>
      <strong>{libelleScore(p.score)}</strong>
      {mesuree ? <span className="atl-sous">Score {p.score.valeur}/100</span> : null}
    </span>
  );
}

/** Bulle d'aide : la confiance n'est pas la chance de signer, qui est le score voisin. */
const EXPLICATION_CONFIANCE =
  "Confiance : à quel point on a vérifié, avec des sources déposées, que ce prospect correspond à votre cible. Ce n'est pas sa chance de signer, que mesure le score à côté.";

/** Texte lisible de la confiance : « 92 % qualifié » ou « 64 % à enrichir ». */
export function libelleConfiance(c: NonNullable<Prospect["confiance"]>): string {
  if (c.qualifie) return `${c.valeur} % qualifié`;
  return c.plafonnee ? `${c.valeur} % non qualifié (critère contraire)` : `${c.valeur} % à enrichir`;
}

export function ConfianceAffichee({ p }: { p: Prospect }) {
  if (!p.confiance) return <span className="atl-attenue">non calculée</span>;
  const manquants = p.confiance.criteres.filter((c) => c.statut === "non_verifie").length;
  return (
    <span className="atl-score" title={EXPLICATION_CONFIANCE}>
      <strong>{libelleConfiance(p.confiance)}</strong>
      {!p.confiance.qualifie && manquants > 0 ? <span className="atl-sous">{manquants} critère{manquants > 1 ? "s" : ""} à vérifier</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Statut du lead : un seul badge à la place de deux chiffres          */
/* ------------------------------------------------------------------ */

export type StatutLead = { cle: "qualifie" | "ecarte" | "a_verifier"; libelle: string; detail: string | null };

/**
 * Le badge unique d'un lead. « Qualifié » : cible prouvée et lead non exclu. « Écarté » : exclu ou refusé,
 * ou critère contraire. « À vérifier » : tout le reste (le détail dit combien de critères manquent).
 * On ne contacte jamais un lead qui n'est pas qualifié.
 */
export function statutLead(p: Prospect): StatutLead {
  const exclu = p.statut === "exclu" || p.statut === "refuse" || p.motifsExclusion.length > 0;
  if (exclu || p.confiance?.plafonnee) {
    const motif = p.motifsExclusion[0];
    const contraire = p.confiance?.criteres.find((c) => c.statut === "contraire");
    const detail = motif ? LIBELLES_MOTIFS[motif.motif] : p.statut === "refuse" ? "écarté par un humain" : contraire ? contraire.libelle : "critère contraire";
    return { cle: "ecarte", libelle: "Écarté", detail };
  }
  if (p.confiance?.qualifie) return { cle: "qualifie", libelle: "Qualifié", detail: null };
  const manquants = p.confiance ? p.confiance.criteres.filter((c) => c.statut === "non_verifie").length : 0;
  return { cle: "a_verifier", libelle: "À vérifier", detail: manquants > 0 ? `il manque ${manquants} critère${manquants > 1 ? "s" : ""}` : null };
}

const TONS_STATUT_LEAD: Readonly<Record<StatutLead["cle"], Ton>> = { qualifie: "succes", ecarte: "neutre", a_verifier: "attention" };

/** La phrase fixe qui explique les deux chiffres, affichée dans la fiche. */
export const EXPLICATION_STATUT_LEAD =
  "La cible prouvée dit si ce lead correspond à votre cible, sources à l'appui (qualifié à 90 % et plus). La priorité dit par qui commencer. On ne contacte jamais un lead qui n'est pas qualifié.";

/** Les deux chiffres, en petit : priorité de contact (estimation ou mesure) et cible prouvée. */
function ChiffresLead({ p }: { p: Prospect }) {
  const mesuree = p.score?.nature === "probabilite_mesuree";
  const priorite = p.score
    ? `Priorité ${p.score.valeur}/100 ${mesuree ? "(mesurée)" : "(estimation)"}${mesuree && p.score.etalonnage?.marge ? ` : ${libelleScore(p.score)}` : ""}`
    : "Priorité non calculée";
  const cible = p.confiance ? `Cible prouvée à ${p.confiance.valeur} %` : "Cible non calculée";
  const explication = expliquerConfiance(p);
  return (
    <>
      <span className="atl-sous atl-statut-chiffres">{priorite} · {cible}</span>
      {explication ? <span className="atl-sous atl-confiance-explication">{explication}</span> : null}
    </>
  );
}

export function BadgeStatutLead({ p, grand }: { p: Prospect; grand?: boolean }) {
  const s = statutLead(p);
  return (
    <span className={grand ? "atl-statut-lead atl-statut-lead-grand" : "atl-statut-lead"} data-statut-lead={s.cle}>
      <Pastille ton={TONS_STATUT_LEAD[s.cle]}>{s.libelle}</Pastille>
      {s.detail ? <span className="atl-sous">{s.detail}</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Filtres                                                             */
/* ------------------------------------------------------------------ */

interface Filtres {
  /** Mission (campagne) choisie : identifiant, ou « » pour toutes les missions. */
  campagneId: string;
  cibles: CibleProspect[];
  secteur: string;
  zone: string;
  statut: StatutProspect | "";
  scoreMin: string;
  qualifies: boolean;
  /** Bureau choisi (établissement de la fiche) et zones qu'il couvre (codes postaux ou communes). */
  bureau: { nom: string; zones: string[] } | null;
  /** Code de segment du référentiel. */
  segment: string;
  source: "" | "reelle" | "demonstration";
  /** Réaffiche les prospects déjà clients, masqués par défaut. */
  avecClients: boolean;
}
export const FILTRES_VIDES: Filtres = { campagneId: "", cibles: [], secteur: "", zone: "", statut: "", scoreMin: "", qualifies: false, bureau: null, segment: "", source: "", avecClients: false };

/** Bureaux et segments de la fiche du client (lecture de `GET /marque`), tolérante à une fiche incomplète. */
interface OptionsFiltres {
  /** Missions (campagnes) de l'entreprise. */
  missions: Array<{ id: string; nom: string }>;
  bureaux: Array<{ nom: string; zones: string[] }>;
  segments: Array<{ code: string; libelle: string }>;
}
const OPTIONS_VIDES: OptionsFiltres = { missions: [], bureaux: [], segments: [] };

/** Zones d'un bureau : communes et codes postaux du référentiel, sinon code postal et commune de l'adresse. */
export function zonesDuBureau(e: { adresse?: string | null; communes?: string[]; codesPostaux?: string[] }): string[] {
  const zones = [...(e.codesPostaux ?? []), ...(e.communes ?? [])];
  if (zones.length) return zones;
  const m = /(\d{4})\s+([^,\d]+?)\s*$/u.exec(e.adresse ?? "");
  return m ? [m[1]!, m[2]!.trim()] : [];
}

export function optionsDepuisMarque(donnees: unknown): OptionsFiltres {
  const marque = (donnees as { marque?: { etablissements?: unknown; segments?: unknown } | null } | null)?.marque;
  if (!marque) return OPTIONS_VIDES;
  const bureaux = (Array.isArray(marque.etablissements) ? marque.etablissements : [])
    .map((e: { nom?: string; adresse?: string | null; communes?: string[]; codesPostaux?: string[] }) => ({ nom: String(e.nom ?? ""), zones: zonesDuBureau(e) }))
    .filter((b) => b.nom && b.zones.length > 0);
  const segments = (Array.isArray(marque.segments) ? marque.segments : [])
    .map((s: { code?: string; libelle?: string }) => ({ code: String(s.code ?? ""), libelle: String(s.libelle ?? s.code ?? "") }))
    .filter((s) => s.code);
  return { missions: [], bureaux, segments };
}

function jetons(texte: string): string[] {
  return texte.split(",").map((x) => x.trim()).filter(Boolean);
}

/** Raison pour laquelle les filtres saisis sont invalides, ou null. */
export function raisonFiltres(f: Filtres): string | null {
  const faux = jetons(f.secteur).find((c) => !CodeNace.safeParse(c).success);
  if (faux) return `Secteur : « ${faux} » n'est pas un code NACE valide (exemple : 43.910 ou 66220).`;
  if (f.scoreMin !== "") {
    const n = Number(f.scoreMin);
    if (!Number.isInteger(n) || n < 0 || n > 100) return "Score minimal : un nombre entier de 0 à 100.";
  }
  return null;
}

/** Tailles de page proposées ; 50 est la valeur par défaut du serveur (maximum 100). */
export const TAILLES_PAGE = [25, 50, 100] as const;
const PAR_PAGE_DEFAUT = 50;

/** Chemin de la requête `GET /prospects` : codes postaux et communes sont séparés selon la forme saisie. */
export function requeteProspects(companyId: string, f: Filtres, page: number, parPage: number = PAR_PAGE_DEFAUT): string {
  const q = new URLSearchParams({ companyId });
  if (f.campagneId) q.set("campagneId", f.campagneId);
  if (f.cibles.length) q.set("cibles", f.cibles.join(","));
  const nace = jetons(f.secteur);
  if (nace.length) q.set("nace", nace.join(","));
  const zone = jetons(f.zone);
  const cp = zone.filter((z) => /^\d{4}$/u.test(z));
  const communes = zone.filter((z) => !/^\d{4}$/u.test(z));
  if (cp.length) q.set("codesPostaux", cp.join(","));
  if (communes.length) q.set("communes", communes.join(","));
  if (f.statut) q.set("statuts", f.statut);
  if (f.scoreMin !== "") q.set("scoreMin", f.scoreMin);
  if (f.qualifies) q.set("qualifiesSeulement", "true");
  if (f.bureau) q.set("zonesBureau", f.bureau.zones.join(","));
  if (f.segment) q.set("segments", f.segment);
  if (f.source) q.set("source", f.source);
  if (f.avecClients) q.set("avecClientsActuels", "true");
  if (page > 1) q.set("page", String(page));
  if (parPage !== PAR_PAGE_DEFAUT) q.set("parPage", String(parPage));
  return `/prospects?${q.toString()}`;
}

/** Filtres initiaux lus dans l'adresse (`?statut=qualifie&segment=medecins`) : valeur invalide ou inconnue ignorée. */
export function filtresDepuisAdresse(recherche: string): Filtres {
  const a = filtreDepuisAdresse(recherche);
  return {
    ...FILTRES_VIDES,
    ...(a.statut ? { statut: a.statut } : {}),
    ...(a.segment ? { segment: a.segment } : {}),
    ...(a.campagne ? { campagneId: a.campagne } : {}),
    ...(a.zone ? { zone: a.zone } : {}),
    ...(a.secteur ? { secteur: a.secteur } : {}),
    ...(a.score ? { scoreMin: a.score } : {}),
    ...(a.qualifies ? { qualifies: true } : {}),
  };
}

/** Clé de la mémoire locale des derniers filtres, par entreprise. */
const cleMemoireFiltres = (companyId: string) => `atelier.prospects.filtres.${companyId}`;

/** Mémorise les filtres (ou les oublie s'ils sont vides). Sans stockage disponible, la page marche quand même. */
export function memoriserFiltres(companyId: string, f: Filtres): void {
  try {
    if (JSON.stringify(f) === JSON.stringify(FILTRES_VIDES)) window.localStorage.removeItem(cleMemoireFiltres(companyId));
    else window.localStorage.setItem(cleMemoireFiltres(companyId), JSON.stringify(f));
  } catch {
    // stockage absent ou refusé : rien n'est mémorisé
  }
}

/** Derniers filtres mémorisés pour cette entreprise ; toute valeur illisible ou inattendue est ignorée champ par champ. */
export function filtresMemorises(companyId: string | null): Filtres {
  if (!companyId) return FILTRES_VIDES;
  try {
    const brut: unknown = JSON.parse(window.localStorage.getItem(cleMemoireFiltres(companyId)) ?? "null");
    if (typeof brut !== "object" || brut === null) return FILTRES_VIDES;
    const m = brut as Record<string, unknown>;
    const texte = (v: unknown, max = 80) => (typeof v === "string" && v.length <= max ? v : "");
    const statut = texte(m["statut"]);
    const bureau = m["bureau"] as { nom?: unknown; zones?: unknown } | null | undefined;
    const cibles = Array.isArray(m["cibles"]) ? (m["cibles"] as unknown[]).filter((c): c is CibleProspect => typeof c === "string" && c in LIBELLES_CIBLES) : [];
    const score = texte(m["scoreMin"], 3);
    return {
      campagneId: texte(m["campagneId"], 80),
      cibles,
      secteur: texte(m["secteur"]),
      zone: texte(m["zone"]),
      statut: (StatutProspect.options as readonly string[]).includes(statut) ? (statut as Filtres["statut"]) : "",
      scoreMin: /^\d{1,3}$/u.test(score) && Number(score) <= 100 ? score : "",
      qualifies: m["qualifies"] === true,
      bureau: bureau && typeof bureau.nom === "string" && Array.isArray(bureau.zones) && bureau.zones.every((z) => typeof z === "string") ? { nom: bureau.nom, zones: bureau.zones as string[] } : null,
      segment: texte(m["segment"]),
      // Le sélecteur Source n'existe plus : une ancienne valeur mémorisée ne doit pas filtrer sans contrôle visible.
      source: "",
      avecClients: m["avecClients"] === true,
    };
  } catch {
    return FILTRES_VIDES;
  }
}

/** Chaîne de recherche d'adresse (`?…`, ou vide) : les filtres exprimables dans l'adresse, les autres paramètres de `base` conservés. */
export function adresseDepuisFiltres(f: Filtres, base = ""): string {
  const filtre: FiltreProspects = {
    ...(f.statut ? { statut: f.statut } : {}),
    ...(f.segment ? { segment: f.segment } : {}),
    ...(f.campagneId ? { campagne: f.campagneId } : {}),
    ...(f.zone.trim() ? { zone: f.zone.trim() } : {}),
    ...(f.secteur.trim() ? { secteur: f.secteur.trim() } : {}),
    ...(f.scoreMin.trim() ? { score: f.scoreMin.trim() } : {}),
    ...(f.qualifies ? { qualifies: "oui" as const } : {}),
  };
  const q = new URLSearchParams(base);
  for (const cle of CLES_FILTRE_PROSPECTS) q.delete(cle);
  for (const [cle, valeur] of parametresDepuisFiltre(filtre)) q.set(cle, valeur);
  const texte = q.toString();
  return texte ? `?${texte}` : "";
}

/** Filtres appliqués, sous la forme attendue par l'export (mêmes noms que la liste, sans pagination). */
export function filtresExport(f: Filtres): Record<string, string> {
  const q = new URL(requeteProspects("x", f, 1), "http://x").searchParams;
  q.delete("companyId");
  return Object.fromEntries(q.entries());
}

/** Familles de métier de la santé, dans l'ordre d'affichage du tri « Par famille de métier ». */
const FAMILLES_METIER = ["medecins", "dentistes", "kines", "pharmacies", "autres"] as const;
type FamilleMetier = (typeof FAMILLES_METIER)[number];
const LIBELLES_FAMILLES: Readonly<Record<FamilleMetier, string>> = { medecins: "Médecins", dentistes: "Dentistes", kines: "Kinésithérapeutes", pharmacies: "Pharmacies", autres: "Autres" };

function familleDeNace(codes: readonly string[]): FamilleMetier | null {
  for (const brut of codes) {
    const c = brut.replace(/\./gu, "");
    if (c.startsWith("8621") || c.startsWith("8622")) return "medecins";
    if (c.startsWith("8623")) return "dentistes";
    if (c.startsWith("8690")) return "kines";
    if (c.startsWith("4773")) return "pharmacies";
  }
  return null;
}

/** Famille de métier d'un prospect : son NACE, sinon le NACE déduit de la catégorie OpenStreetMap de sa source ; « autres » à défaut. */
export function familleMetier(p: Pick<Prospect, "nace" | "sources">): FamilleMetier {
  return familleDeNace(p.nace) ?? familleDeNace(naceDeduitOsm(p)?.nace ?? []) ?? "autres";
}

/** Nombre de filtres appliqués (la cible compte pour un, quel que soit le nombre de cibles cochées). */
export function nombreFiltresActifs(f: Filtres): number {
  const actifs = [f.campagneId !== "", f.cibles.length > 0, f.secteur.trim() !== "", f.zone.trim() !== "", f.statut !== "", f.scoreMin.trim() !== "", f.qualifies, f.bureau !== null, f.segment !== "", f.source !== "", f.avecClients];
  return actifs.filter(Boolean).length;
}

function BarreFiltres({ valeur, options, onAppliquer }: { valeur: Filtres; options: OptionsFiltres; onAppliquer(f: Filtres): void }) {
  const [saisie, setSaisie] = useState<Filtres>(valeur);
  const raison = raisonFiltres(saisie);
  const [ouvert, setOuvert] = useState(() => !ecranEtroit());
  const actifs = nombreFiltresActifs(valeur);
  const basculer = (c: CibleProspect) => setSaisie({ ...saisie, cibles: saisie.cibles.includes(c) ? saisie.cibles.filter((x) => x !== c) : [...saisie.cibles, c] });
  function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!raison) onAppliquer(saisie);
  }
  return (
    <form className="atl-formulaire atl-filtres-prospects" onSubmit={envoyer} aria-label="Filtres des prospects">
      <details className="atl-filtres-volet" open={ouvert} onToggle={(e) => setOuvert(e.currentTarget.open)}>
        <summary className="atl-filtres-resume">{`Filtres (${actifs} ${actifs > 1 ? "actifs" : "actif"})`}</summary>
        <div className="atl-formulaire atl-filtres-corps">
        <div className="atl-segments" role="group" aria-label="Cible">
          {(Object.keys(LIBELLES_CIBLES) as CibleProspect[]).map((c) => (
            <button key={c} type="button" className="atl-segment" aria-pressed={saisie.cibles.includes(c)} onClick={() => basculer(c)}>
              {LIBELLES_CIBLES[c]}
            </button>
          ))}
          <button type="button" className="atl-segment" onClick={() => setSaisie({ ...saisie, cibles: Object.keys(LIBELLES_CIBLES) as CibleProspect[] })}>
            Tout
          </button>
          <button type="button" className="atl-segment" onClick={() => setSaisie({ ...saisie, cibles: [] })}>
            Aucun
          </button>
        </div>
        <div className="atl-grille-champs">
          <Champ libelle="Mission" aide="Ne montre que les prospects trouvés par cette mission.">
            <select value={saisie.campagneId} onChange={(e) => setSaisie({ ...saisie, campagneId: e.target.value })}>
              <option value="">Toutes les missions</option>
              {options.missions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nom}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Secteur (code NACE)" aide="Plusieurs codes séparés par des virgules.">
            <input value={saisie.secteur} onChange={(e) => setSaisie({ ...saisie, secteur: e.target.value })} placeholder="43.910, 66220" autoComplete="off" />
          </Champ>
          <Champ libelle="Zone (commune ou code postal)" aide="Plusieurs valeurs séparées par des virgules.">
            <input value={saisie.zone} onChange={(e) => setSaisie({ ...saisie, zone: e.target.value })} placeholder="Liège, 4000" autoComplete="off" />
          </Champ>
          <Champ libelle="Étape">
            <select value={saisie.statut} onChange={(e) => setSaisie({ ...saisie, statut: e.target.value as Filtres["statut"] })}>
              <option value="">Toutes les étapes</option>
              {StatutProspect.options.map((s) => (
                <option key={s} value={s}>
                  {LIBELLES_STATUTS[s]}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Bureau" aide="Prospects de la même commune ou du même code postal que le bureau.">
            <select value={saisie.bureau?.nom ?? ""} onChange={(e) => setSaisie({ ...saisie, bureau: options.bureaux.find((b) => b.nom === e.target.value) ?? null })}>
              <option value="">Tous les bureaux</option>
              {options.bureaux.map((b) => (
                <option key={b.nom} value={b.nom}>
                  {b.nom}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Segment">
            <select value={saisie.segment} onChange={(e) => setSaisie({ ...saisie, segment: e.target.value })}>
              <option value="">Tous les segments</option>
              {options.segments.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.libelle}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Score minimal (0 à 100)" className="atl-champ-etroit">
            <input value={saisie.scoreMin} onChange={(e) => setSaisie({ ...saisie, scoreMin: e.target.value })} inputMode="numeric" autoComplete="off" aria-invalid={raison?.startsWith("Score") ? true : undefined} />
          </Champ>
        </div>
        <label className="atl-sous" title={EXPLICATION_CONFIANCE}>
          <input type="checkbox" checked={saisie.qualifies} onChange={(e) => setSaisie({ ...saisie, qualifies: e.target.checked })} />
          Qualifiés (≥ {SEUIL_QUALIFICATION} %)
        </label>
        <label className="atl-sous">
          <input type="checkbox" checked={saisie.avecClients} onChange={(e) => setSaisie({ ...saisie, avecClients: e.target.checked })} />
          Afficher aussi les clients actuels
        </label>
        {raison ? (
          <p className="atl-texte-danger" role="alert">
            {raison}
          </p>
        ) : null}
        <div className="atl-actions">
          <Bouton type="submit" variante="principal" raisonDesactive={raison ? "Corrigez les filtres." : null}>
            Filtrer
          </Bouton>
          <Bouton
            onClick={() => {
              setSaisie(FILTRES_VIDES);
              onAppliquer(FILTRES_VIDES);
            }}
          >
            Réinitialiser les filtres
          </Bouton>
        </div>
        </div>
      </details>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Fiche                                                               */
/* ------------------------------------------------------------------ */

/** Pourquoi un canal n'est pas permis pour ce prospect, en une phrase. */
export function motifRefusCanal(p: Prospect, canal: CanalContact): string {
  if (p.statut === "exclu") return `Prospect exclu : ${p.motifsExclusion.map((m) => LIBELLES_MOTIFS[m.motif].toLowerCase()).join(" ; ")}.`;
  if (p.statut === "refuse") return "Prospect écarté par un humain.";
  const permises = MATRICE_BASES_LEGALES[p.cible][canal];
  if (permises.length === 0) return `Aucune base légale ne permet ce canal pour cette cible.`;
  return `Aucune base légale vérifiée. Bases possibles : ${permises.map((b) => LIBELLES_BASES[b]).join(" ; ")}.`;
}

/* ------------------------------------------------------------------ */
/* Compte rendu du lead et question au Coordinateur                    */
/* ------------------------------------------------------------------ */

const jourCourt = (iso: string | null) => (iso === null ? "date inconnue" : iso.slice(0, 10).split("-").reverse().join("/"));

/**
 * Compte rendu déterministe (chargé à l'ouverture de la fiche, aucune IA) puis question à poser au
 * Coordinateur : la route crée une tâche qui lui est assignée, et on ouvre sa discussion.
 */
function CompteRenduLead({ p, companyId, version = 0 }: { p: Prospect; companyId: string; version?: number }) {
  const nav = useHostNavigation();
  const [cr, setCr] = useState<CompteRenduProspect | null>(null);
  const [erreurLecture, setErreurLecture] = useState<unknown>(null);
  const [question, setQuestion] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);

  const charger = useCallback(async () => {
    setCr(null);
    setErreurLecture(null);
    try {
      const brut = await appelRoute<unknown>("GET", `/prospects/${encodeURIComponent(p.id)}/compte-rendu?companyId=${encodeURIComponent(companyId)}`);
      const lu = CompteRenduProspect.safeParse(brut);
      if (!lu.success) throw new Error("Le compte rendu reçu n'a pas la forme attendue.");
      setCr(lu.data);
    } catch (e) {
      setErreurLecture(e);
    }
  }, [p.id, companyId, version]);
  useEffect(() => {
    void charger();
  }, [charger]);

  const raison = question.trim().length < 3 ? "Écrivez votre question (3 caractères au moins)." : null;
  async function poser() {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await appelRoute<{ issueId: string; identifiant: string | null; lien: string }>("POST", `/prospects/${encodeURIComponent(p.id)}/question`, { companyId, question: question.trim() });
      setQuestion("");
      // La réponse du Coordinateur arrive dans la discussion de la tâche créée.
      if (r.lien) nav.navigate(r.lien);
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="atl-compte-rendu" aria-label="Compte rendu du lead">
      <h3 className="atl-h3">Compte rendu du lead</h3>
      {erreurLecture ? <EtatErreur erreur={erreurLecture} contexte="compte rendu du lead" onReessayer={() => void charger()} /> : null}
      {!cr && !erreurLecture ? <Chargement libelle="Lecture du compte rendu" lignes={4} /> : null}
      {cr ? (
        <>
          <p className="atl-sous">Établi à partir des données enregistrées, sans intelligence artificielle : rien n'est supposé.</p>
          <h4 className="atl-h3">Pourquoi ce lead</h4>
          <ul className="atl-liste-compacte">
            {cr.pourquoi.verifies.map((v) => (
              <li key={v.code}>
                <strong>Vérifié :</strong> {v.libelle}. {v.detail}.{" "}
                <span className="atl-attenue">
                  Source : {v.source}, {jourCourt(v.date)}.
                </span>
              </li>
            ))}
            {cr.pourquoi.verifies.length === 0 ? <li className="atl-attenue">Aucun critère n'est encore vérifié.</li> : null}
            {cr.pourquoi.nonVerifies.map((n) => (
              <li key={n.code}>
                <strong>Pas encore vérifié :</strong> {n.libelle}. <span className="atl-attenue">{n.detail}.</span>
              </li>
            ))}
            {cr.pourquoi.contraires.map((x) => (
              <li key={x.code}>
                <strong>Contraire :</strong> {x.libelle}. {x.detail}.
              </li>
            ))}
          </ul>
          <h4 className="atl-h3">Confiance et score</h4>
          <ul className="atl-liste-compacte">
            <li>
              <strong>Confiance :</strong> {cr.confiance.valeur} % ({cr.confiance.qualifie ? "qualifié" : cr.confiance.plafonnee ? "non qualifié, critère contraire" : `à enrichir, seuil ${cr.confiance.seuil} %`})
            </li>
            <li>
              <strong>Score :</strong> {cr.score ? cr.score.libelle : "pas encore calculé"}
            </li>
          </ul>
          <p className="atl-sous">{cr.differenceConfianceScore}</p>
          <h4 className="atl-h3">Signaux de moment</h4>
          {cr.signaux.length > 0 ? (
            <ul className="atl-liste-compacte">
              {cr.signaux.map((s) => (
                <li key={s.code}>
                  {s.libelle}. <span className="atl-attenue">{s.source}, {jourCourt(s.date)}.</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="atl-attenue">Aucun signal de moment établi par les sources.</p>
          )}
          <h4 className="atl-h3">Offre recommandée</h4>
          {cr.offreRecommandee ? (
            <p>
              <strong>{cr.offreRecommandee.nom}.</strong> {cr.offreRecommandee.raison}
            </p>
          ) : (
            <p className="atl-attenue">Aucune offre recommandée : {cr.raisonSansOffre}</p>
          )}
          <h4 className="atl-h3">Établissement proche</h4>
          {cr.etablissementProche ? (
            <p>
              <strong>{cr.etablissementProche.nom}</strong>
              {cr.etablissementProche.adresse ? `, ${cr.etablissementProche.adresse}` : ""}{" "}
              <span className="atl-attenue">
                ({cr.etablissementProche.raison === "distance" ? `à ${cr.etablissementProche.distanceKm} km` : cr.etablissementProche.raison === "meme_code_postal" ? "même code postal" : "même commune"})
              </span>
            </p>
          ) : (
            <p className="atl-attenue">Aucun établissement de la fiche ne correspond à la zone connue du lead.</p>
          )}
          <h4 className="atl-h3">Prochaine action</h4>
          <p>{cr.prochaineAction.libelle}</p>
          <h4 className="atl-h3">Limites</h4>
          <ul className="atl-liste-compacte">
            {cr.limites.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="atl-formulaire">
        <Champ libelle="Votre question sur ce lead" aide="Le Coordinateur répond dans la discussion de la tâche créée, avec ce compte rendu en contexte.">
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={4000} />
        </Champ>
        {erreur ? <EtatErreur erreur={erreur} contexte="question au Coordinateur" /> : null}
        <div className="atl-actions">
          <Bouton variante="principal" raisonDesactive={raison} enCours={enCours} onClick={() => void poser()}>
            Poser une question au Coordinateur
          </Bouton>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Critères de qualification : décision humaine par critère            */
/* ------------------------------------------------------------------ */

const LIBELLES_STATUTS_CRITERE: Readonly<Record<StatutCritereQualification, string>> = { verifie: "Vérifié", contraire: "Contraire", non_verifie: "Non vérifié" };
const TONS_STATUTS_CRITERE: Readonly<Record<StatutCritereQualification, Ton>> = { verifie: "succes", contraire: "danger", non_verifie: "neutre" };
/** Ordre de présentation des statuts dans le formulaire. */
const ORDRE_STATUTS_CRITERE: readonly StatutCritereQualification[] = ["verifie", "contraire", "non_verifie"];

/** Formulaire en ligne sous un critère : statut, justification obligatoire (3 à 500 caractères). Échap le ferme. */
function FormulaireCritere({ c, p, companyId, onFerme, onEnregistre }: { c: CritereQualification; p: Prospect; companyId: string; onFerme(): void; onEnregistre(): void }) {
  const [statut, setStatut] = useState<StatutCritereQualification>(c.statut);
  const [justification, setJustification] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const premier = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    premier.current?.focus();
  }, []);
  const raison = justification.trim().length < 3 ? "Justifiez votre décision (3 caractères au moins)." : null;

  async function enregistrer() {
    if (raison) return;
    setEnCours(true);
    setErreur(null);
    try {
      await appelRoute("PATCH", `/prospects/${encodeURIComponent(p.id)}/criteres/${encodeURIComponent(c.code)}`, { companyId, statut, justification: justification.trim() });
      onEnregistre();
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form
      className="atl-formulaire atl-critere-formulaire"
      aria-label={`Décision humaine sur le critère « ${c.libelle} »`}
      onSubmit={(e) => {
        e.preventDefault();
        void enregistrer();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onFerme();
        }
      }}
    >
      <Champ libelle="Statut du critère">
        <select ref={premier} value={statut} onChange={(e) => setStatut(e.target.value as StatutCritereQualification)}>
          {ORDRE_STATUTS_CRITERE.map((s) => (
            <option key={s} value={s}>
              {LIBELLES_STATUTS_CRITERE[s]}
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="Justification" aide="Obligatoire, 3 à 500 caractères. Elle est journalisée avec votre nom.">
        <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={2} maxLength={500} />
      </Champ>
      {erreur ? <EtatErreur erreur={erreur} contexte="décision sur le critère" /> : null}
      <div className="atl-actions">
        <Bouton type="submit" variante="principal" raisonDesactive={raison} enCours={enCours}>
          Enregistrer la décision
        </Bouton>
        <Bouton variante="discret" onClick={onFerme}>
          Annuler
        </Bouton>
      </div>
    </form>
  );
}

/**
 * Critères de qualification d'un lead (codés et personnalisés actifs), avec leur statut et leur source.
 * Un humain peut décider à la main d'un critère (« Modifier ») ou revenir au calcul automatique.
 * Après chaque changement, `onChange` recharge le lead : confiance et badge sont recalculés par le serveur.
 */
function CriteresQualification({ p, companyId, onChange }: { p: Prospect; companyId: string; onChange(): void }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [retraitEnCours, setRetraitEnCours] = useState<string | null>(null);
  const [erreurRetrait, setErreurRetrait] = useState<{ code: string; erreur: unknown } | null>(null);
  const criteres = p.confiance?.criteres ?? [];
  if (criteres.length === 0) return null;

  async function revenirAuCalcul(code: string) {
    setRetraitEnCours(code);
    setErreurRetrait(null);
    try {
      await appelRoute("DELETE", `/prospects/${encodeURIComponent(p.id)}/criteres/${encodeURIComponent(code)}?companyId=${encodeURIComponent(companyId)}`);
      setOuvert(null);
      onChange();
    } catch (e) {
      setErreurRetrait({ code, erreur: e });
    } finally {
      setRetraitEnCours(null);
    }
  }

  return (
    <section aria-label="Critères de qualification">
      <h3 className="atl-h3">Critères de qualification</h3>
      <p className="atl-sous">Vous pouvez décider à la main d'un critère : votre décision, prioritaire sur le calcul et sur l'agent, remplace le calcul automatique et reste journalisée.</p>
      <ul className="atl-liste-compacte">
        {criteres.map((c) => {
          const humain = c.source === "humain";
          return (
            <li key={c.code} className="atl-critere" data-code={c.code}>
              <div>
                <strong>{c.libelle}</strong> <Pastille ton={TONS_STATUTS_CRITERE[c.statut]}>{LIBELLES_STATUTS_CRITERE[c.statut]}</Pastille>{" "}
                <span className="atl-attenue">
                  Source : {c.source}
                  {c.detail ? `. ${c.detail}` : ""}
                </span>
              </div>
              {ouvert === c.code ? (
                <FormulaireCritere c={c} p={p} companyId={companyId} onFerme={() => setOuvert(null)} onEnregistre={() => { setOuvert(null); onChange(); }} />
              ) : (
                <div className="atl-actions">
                  <Bouton variante="discret" onClick={() => setOuvert(c.code)}>
                    Modifier
                  </Bouton>
                  {humain ? (
                    <Bouton variante="discret" enCours={retraitEnCours === c.code} onClick={() => void revenirAuCalcul(c.code)}>
                      Revenir au calcul automatique
                    </Bouton>
                  ) : null}
                </div>
              )}
              {erreurRetrait?.code === c.code ? <EtatErreur erreur={erreurRetrait.erreur} contexte="retour au calcul automatique" /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Fiche({ p, companyId, onFermer, onExclu, onCorbeille, onRecharger }: { p: Prospect; companyId: string; onFermer(): void; onExclu(): void; onCorbeille(): void; onRecharger(): void }) {
  const [motif, setMotif] = useState<MotifExclusion>("doublon");
  const [detail, setDetail] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const raison = detail.trim().length < 3 ? "Expliquez le motif (3 caractères au moins)." : null;
  const [versionCompteRendu, setVersionCompteRendu] = useState(0);
  const [confirmationCorbeille, setConfirmationCorbeille] = useState(false);
  const [corbeilleEnCours, setCorbeilleEnCours] = useState(false);
  const [erreurCorbeille, setErreurCorbeille] = useState<unknown>(null);
  // La fiche s'affiche sous la liste : on l'amène à l'écran et on y place le focus à l'ouverture.
  const racine = useRef<HTMLElement>(null);
  useEffect(() => {
    racine.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    racine.current?.focus({ preventScroll: true });
    // Dépend de l'id : choisir un autre lead alors qu'une fiche est ouverte ramène aussi la fiche à l'écran.
    // scrollIntoView fait défiler tous les ancêtres qui défilent, y compris le conteneur interne du socle.
  }, [p.id]);

  async function mettreALaCorbeille() {
    setCorbeilleEnCours(true);
    setErreurCorbeille(null);
    try {
      await appelRoute("POST", "/corbeille/suppression", { companyId, type: "prospect", id: p.id });
      onCorbeille();
    } catch (e) {
      setErreurCorbeille(e);
    } finally {
      setCorbeilleEnCours(false);
    }
  }

  async function exclure() {
    setEnCours(true);
    setErreur(null);
    try {
      await appelRoute("POST", `/prospects/${encodeURIComponent(p.id)}/exclusion`, { companyId, prospectId: p.id, motif, detail: detail.trim() });
      onExclu();
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section ref={racine} tabIndex={-1} className="atl-section atl-fiche" aria-label={`Fiche de ${nomProspect(p)}`}>
      <div className="atl-section-tete">
        <h2>{nomProspect(p)}</h2>
        <div className="atl-section-actions">
          <Bouton variante="discret" onClick={onFermer}>
            Fermer la fiche
          </Bouton>
        </div>
      </div>
      <div className="atl-statut-lead-bloc" aria-label="Statut du lead">
        <BadgeStatutLead p={p} grand />
        <ChiffresLead p={p} />
        <p className="atl-sous">{EXPLICATION_STATUT_LEAD}</p>
      </div>
      <dl className="atl-champs atl-champs-grille">
        <div>
          <dt>Cible</dt>
          <dd>{LIBELLE_CIBLE_UNIQUE[p.cible]}</dd>
        </div>
        <div>
          <dt>Zone</dt>
          <dd>{libelleZone(p.zone)}</dd>
        </div>
        <div>
          <dt>Étape</dt>
          <dd>{LIBELLES_STATUTS[p.statut]}</dd>
        </div>
        {p.nace.length ? (
          <div>
            <dt>Secteur</dt>
            <dd>{p.nace.join(", ")}</dd>
          </div>
        ) : null}
        <div>
          <dt>Score</dt>
          <dd>
            <ScoreAffiche p={p} />
          </dd>
        </div>
      </dl>
      {p.motifsExclusion.length > 0 ? (
        <div className="atl-encart" data-ton="attention">
          <p className="atl-encart-titre">Motifs d'exclusion</p>
          <ul className="atl-liste-compacte">
            {p.motifsExclusion.map((m) => (
              <li key={m.motif}>
                {LIBELLES_MOTIFS[m.motif]}. <span className="atl-attenue">{m.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <CompteRenduLead p={p} companyId={companyId} version={versionCompteRendu} />

      <CriteresQualification
        p={p}
        companyId={companyId}
        onChange={() => {
          setVersionCompteRendu((v) => v + 1);
          onRecharger();
        }}
      />

      <h3 className="atl-h3">Critères du score</h3>
      {p.score ? (
        <div className="atl-table-cadre">
          <table className="atl-table">
            <thead>
              <tr>
                <th scope="col">Critère</th>
                <th scope="col">Valeur</th>
                <th scope="col" className="atl-num">Points</th>
                <th scope="col">Source</th>
                <th scope="col">Date de la source</th>
              </tr>
            </thead>
            <tbody>
              {p.score.criteres.map((c) => (
                <tr key={c.code}>
                  <th scope="row">{c.libelle}</th>
                  <td data-libelle="Valeur">{c.valeur === null ? <span className="atl-attenue">non renseignée</span> : typeof c.valeur === "boolean" ? (c.valeur ? "oui" : "non") : String(c.valeur)}</td>
                  <td data-libelle="Points" className="atl-num">{c.points > 0 ? `+${c.points}` : c.points}</td>
                  <td data-libelle="Source">{c.source}</td>
                  <td data-libelle="Date"><Horodatage iso={c.dateSource} seulementDate /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="atl-attenue">Ce prospect n'a pas encore de score.</p>
      )}
      <p className="atl-sous">Le score sert à trier et à prioriser. Il ne fixe jamais un prix, une éligibilité ni une condition.</p>

      <h3 className="atl-h3">Base légale par canal</h3>
      <div className="atl-table-cadre">
        <table className="atl-table">
          <thead>
            <tr>
              <th scope="col">Canal</th>
              <th scope="col">Contact</th>
              <th scope="col">Pourquoi</th>
            </tr>
          </thead>
          <tbody>
            {CanalContact.options.map((canal) => {
              const b = p.basesLegales.find((x) => x.canal === canal);
              return (
                <tr key={canal}>
                  <th scope="row">{LIBELLES_CANAUX[canal]}</th>
                  <td data-libelle="Contact">
                    <Pastille ton={b ? "succes" : "danger"}>{b ? "Permis" : "Refusé"}</Pastille>
                  </td>
                  <td data-libelle="Pourquoi">
                    {b ? (
                      <>
                        {LIBELLES_BASES[b.base][0]!.toUpperCase() + LIBELLES_BASES[b.base].slice(1)}
                        <span className="atl-sous">
                          Preuve : {b.preuve.reference}, le <Horodatage iso={b.preuve.date} seulementDate />
                        </span>
                      </>
                    ) : (
                      motifRefusCanal(p, canal)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="atl-sous">L'atelier ne contacte personne : cette fiche indique seulement ce que la loi permettrait à votre équipe.</p>

      {p.statut !== "exclu" && p.statut !== "refuse" ? (
        <div className="atl-formulaire">
          <h3 className="atl-h3">Exclure ce prospect</h3>
          <Champ libelle="Motif">
            <select value={motif} onChange={(e) => setMotif(e.target.value as MotifExclusion)}>
              {MotifExclusion.options.map((m) => (
                <option key={m} value={m}>
                  {LIBELLES_MOTIFS[m]}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Précision" aide="Une phrase pour le journal.">
            <input value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={500} autoComplete="off" />
          </Champ>
          {erreur ? <EtatErreur erreur={erreur} contexte="exclusion du prospect" /> : null}
          <div className="atl-actions">
            <Bouton variante="danger" raisonDesactive={raison} enCours={enCours} onClick={() => void exclure()}>
              Exclure
            </Bouton>
          </div>
        </div>
      ) : null}

      <div className="atl-formulaire">
        <h3 className="atl-h3">Corbeille</h3>
        <div className="atl-actions">
          {confirmationCorbeille ? (
            <span className="atl-actions" role="group" aria-label={`Confirmation de la mise à la corbeille de ${nomProspect(p)}`}>
              <Bouton variante="danger" enCours={corbeilleEnCours} onClick={() => void mettreALaCorbeille()}>
                Confirmer
              </Bouton>
              <Bouton variante="discret" onClick={() => setConfirmationCorbeille(false)}>
                Annuler
              </Bouton>
            </span>
          ) : (
            <Bouton
              variante="discret"
              onClick={() => {
                setErreurCorbeille(null);
                setConfirmationCorbeille(true);
              }}
            >
              Mettre à la corbeille
            </Bouton>
          )}
          <span className="atl-sous">Récupérable 30 jours dans la Corbeille</span>
        </div>
        {erreurCorbeille ? <EtatErreur erreur={erreurCorbeille} contexte="mise à la corbeille du prospect" /> : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Export fichier                                                      */
/* ------------------------------------------------------------------ */

interface RapportExport {
  nomFichier: string;
  format: "csv" | "xlsx";
  typeMime: string;
  contenuBase64: string;
  mode?: "demonstration" | "reel";
  rapport: { demandes: number; inclus: number; refuses: Array<{ prospectId: string; denomination?: string | null; motif: string }> };
}

function ExportProspects({ companyId, filtres }: { companyId: string; filtres: Filtres }) {
  const [canal, setCanal] = useState<CanalContact>("courriel");
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [resultat, setResultat] = useState<RapportExport | null>(null);
  const raison = raisonFiltres(filtres);

  async function exporter() {
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const f = filtresExport(filtres);
      const r = await appelRoute<RapportExport>("POST", "/prospects/exports-fichier", { companyId, canal, format, ...(Object.keys(f).length ? { filtres: f } : {}) });
      telechargerBase64(r.nomFichier, r.typeMime, r.contenuBase64);
      setResultat(r);
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="atl-formulaire atl-export-prospects" aria-label="Exporter les prospects">
      <h3 className="atl-h3">Exporter un fichier</h3>
      <p className="atl-sous">Seuls les prospects que vous avez le droit de contacter par ce canal sont exportés. Les autres sont écartés et listés avec leur motif. L'atelier ne contacte personne : le fichier est pour votre équipe.</p>
      <div className="atl-barre-export">
        <Champ libelle="Canal de contact">
          <select value={canal} onChange={(e) => setCanal(e.target.value as CanalContact)}>
            {CanalContact.options.map((c) => (
              <option key={c} value={c}>
                {LIBELLES_CANAUX[c]}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Format du fichier">
          <select value={format} onChange={(e) => setFormat(e.target.value as "csv" | "xlsx")}>
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (.xlsx)</option>
          </select>
        </Champ>
        <Bouton variante="principal" raisonDesactive={raison ? "Corrigez les filtres." : null} enCours={enCours} onClick={() => void exporter()}>
          Exporter
        </Bouton>
      </div>
      {erreur ? <EtatErreur erreur={erreur} contexte="export des prospects" /> : null}
      {resultat ? (
        <div role="status" className="atl-formulaire">
         
          <p className="atl-resume">
            <span>
              <strong>{nombre(resultat.rapport.inclus)}</strong> inclus
            </span>
            <span>
              <strong>{nombre(resultat.rapport.refuses.length)}</strong> écartés
            </span>
            <span>{nombre(resultat.rapport.demandes)} demandés</span>
          </p>
          <p className="atl-sous">Fichier téléchargé : {resultat.nomFichier}.</p>
          {resultat.rapport.refuses.length > 0 ? (
            <ul className="atl-liste" aria-label="Prospects écartés de l'export">
              {resultat.rapport.refuses.map((x) => (
                <li key={x.prospectId}>
                  {x.denomination || `[prospect-${idCourt(x.prospectId)}]`} : {LIBELLES_MOTIFS[x.motif as MotifExclusion] ?? x.motif}
                </li>
              ))}
            </ul>
          ) : (
            <p className="atl-succes">Aucun prospect écarté pour ce canal.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Étalonnage du score                                                 */
/* ------------------------------------------------------------------ */

interface ResultatEtalonnage {
  etalonnage: { statut: "probabilite_mesuree" | "estimation"; effectif: number; conversions: number; brier?: number | null; methode?: string };
  observationsIgnorees?: number;
  application?: { prospects: number; probabilitesAppliquees: number; estimations: number };
}

function EtalonnerScore({ companyId, onTermine }: { companyId: string; onTermine(): void }) {
  const [cible, setCible] = useState<CibleProspect>("entreprise");
  const [historique, setHistorique] = useState<{ nomFichier: string; format: "csv" | "xlsx"; contenuBase64: string } | null>(null);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [resultat, setResultat] = useState<ResultatEtalonnage | null>(null);

  async function choisir(f: File | undefined) {
    setErreurFichier(null);
    setHistorique(null);
    if (!f) return;
    const format = /\.csv$/iu.test(f.name) ? "csv" : /\.xlsx$/iu.test(f.name) ? "xlsx" : null;
    if (!format) return setErreurFichier("Format non pris en charge : choisissez un fichier .csv ou .xlsx.");
    try {
      setHistorique({ nomFichier: f.name, format, contenuBase64: await lireBase64(f) });
    } catch {
      setErreurFichier("Le fichier n'a pas pu être lu par le navigateur. Réessayez avec un autre fichier.");
    }
  }

  async function calculer() {
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const r = await appelRoute<ResultatEtalonnage>("POST", "/etalonnages", { companyId, segment: { cible, nace: [] }, ...(historique ? { historique } : {}) });
      setResultat(r);
      onTermine();
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  const e = resultat?.etalonnage;
  return (
    <Section titre="Étalonner le score" aide="Compare le score aux résultats réels (gagné ou perdu) pour le transformer en probabilité mesurée. Sans assez d'historique, il reste une estimation.">
      <div className="atl-formulaire">
        <div className="atl-barre-export">
          <Champ libelle="Cible à étalonner">
            <select value={cible} onChange={(ev) => setCible(ev.target.value as CibleProspect)}>
              {(Object.keys(LIBELLE_CIBLE_UNIQUE) as CibleProspect[]).map((c) => (
                <option key={c} value={c}>
                  {LIBELLES_CIBLES[c]}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Historique des résultats (.csv ou .xlsx), facultatif">
            <ChoixFichier accept=".csv,.xlsx" nom={historique?.nomFichier ?? null} onChoisir={(f) => void choisir(f)} />
          </Champ>
          <Bouton variante="principal" enCours={enCours} raisonDesactive={erreurFichier ? "Corrigez le fichier." : null} onClick={() => void calculer()}>
            Calculer l'étalonnage
          </Bouton>
        </div>
        <p className="atl-aide">Sans fichier, les résultats déjà enregistrés sont utilisés.</p>
        {erreurFichier ? (
          <p className="atl-texte-danger" role="alert">
            {erreurFichier}
          </p>
        ) : null}
        {erreur ? <EtatErreur erreur={erreur} contexte="étalonnage du score" /> : null}
        {e ? (
          <div role="status" className="atl-formulaire">
            {e.statut === "probabilite_mesuree" ? (
              <p className="atl-succes">
                Probabilité mesurée sur {nombre(e.effectif)} prospects dont {nombre(e.conversions)} conversions.
              </p>
            ) : (
              <div className="atl-encart" data-ton="attention">
                <p className="atl-encart-titre">Estimation : pas assez d'historique</p>
                <p>
                  {nombre(e.effectif)}/{SEUILS_ETALONNAGE.prospectsMin} prospects, {nombre(e.conversions)}/{SEUILS_ETALONNAGE.conversionsMin} conversions. Les scores restent des estimations non étalonnées.
                </p>
              </div>
            )}
            {typeof e.brier === "number" ? <p className="atl-sous">Écart moyen entre prévision et réalité (Brier) : {e.brier.toFixed(3)}. Plus il est bas, mieux le score prévoit.</p> : null}
            {resultat?.application ? (
              <p className="atl-sous">
                Appliqué à {nombre(resultat.application.prospects)} prospects : {nombre(resultat.application.probabilitesAppliquees)} probabilités mesurées, {nombre(resultat.application.estimations)} estimations.
              </p>
            ) : null}
            {resultat?.observationsIgnorees ? <p className="atl-sous">{nombre(resultat.observationsIgnorees)} lignes de l'historique ignorées (hors cible ou incomplètes).</p> : null}
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Liste                                                               */
/* ------------------------------------------------------------------ */

/** Reflète les filtres dans l'adresse sans recharger ni ajouter d'entrée à l'historique. */
function majAdresse(f: Filtres) {
  if (typeof window === "undefined") return;
  try {
    const { pathname, search, hash } = window.location;
    const suivante = adresseDepuisFiltres(f, search);
    if (suivante !== search) window.history.replaceState(window.history.state, "", `${pathname}${suivante}${hash}`);
  } catch {
    // adresse non modifiable (contexte isolé) : les filtres restent appliqués à l'écran
  }
}

function ListeProspects() {
  const { companyId } = useHostContext();
  const { search } = useHostLocation();
  const [filtres, setFiltres] = useState<Filtres>(() => {
    const adresse = filtresDepuisAdresse(search || (typeof window !== "undefined" ? window.location.search : ""));
    // L'adresse garde la priorité ; sans filtre dans l'adresse, on reprend les derniers filtres mémorisés.
    return adresseDepuisFiltres(adresse) !== "" ? adresse : filtresMemorises(companyId);
  });
  const [page, setPage] = useState(1);
  const [parPage, setParPage] = useState<number>(PAR_PAGE_DEFAUT);
  const [versionCharge, setVersionCharge] = useState(0);
  const [etat, setEtat] = useState<{ data: PageProspects | null; erreur: unknown; chargement: boolean }>({ data: null, erreur: null, chargement: true });
  const [choisi, setChoisi] = useState<string | null>(null);
  const [ordreAsc, setOrdreAsc] = useState(false);
  const [tri, setTri] = useState<"score" | "confiance" | "famille">("score");
  const [optionsMarque, setOptions] = useState<OptionsFiltres>(OPTIONS_VIDES);
  const campagnes = useDonnees<Campagne[]>("atelier.campagnes");
  const options = { ...optionsMarque, missions: (campagnes.data ?? []).map((c) => ({ id: c.id, nom: c.nom })) };

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    appelRoute<unknown>("GET", `/marque?companyId=${encodeURIComponent(companyId)}`)
      .then((d) => !annule && setOptions(optionsDepuisMarque(d)))
      .catch(() => undefined); // sans fiche lisible, les filtres bureau et segment restent vides
    return () => {
      annule = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    appelRoute<PageProspects>("GET", `${requeteProspects(companyId, filtres, page, parPage)}&vue=complete`) // prospects entiers : le résumé est pour les agents
      .then((data) => !annule && setEtat({ data, erreur: null, chargement: false }))
      .catch((erreur: unknown) => !annule && setEtat({ data: null, erreur, chargement: false }));
    return () => {
      annule = true;
    };
  }, [companyId, filtres, page, parPage, versionCharge]);

  // Filtres repris de la mémoire : l'adresse les reflète aussi (remplacement, sans entrée d'historique).
  useEffect(() => {
    majAdresse(filtres);
    // une seule fois à l'ouverture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appliquer = useCallback(
    (f: Filtres) => {
      setFiltres(f);
      majAdresse(f);
      if (companyId) memoriserFiltres(companyId, f);
      setPage(1);
      setChoisi(null);
    },
    [companyId],
  );

  const cleTri = (p: Prospect) => (tri === "famille" ? FAMILLES_METIER.indexOf(familleMetier(p)) : tri === "confiance" ? p.confiance?.valeur : p.score?.valeur) ?? -1;
  // Par famille, à égalité : le meilleur score d'abord.
  const lignes = [...(etat.data?.prospects ?? [])].sort((a, b) => (ordreAsc ? 1 : -1) * (cleTri(a) - cleTri(b)) || (b.score?.valeur ?? -1) - (a.score?.valeur ?? -1));
  const trier = (cle: "score" | "confiance" | "famille") => {
    if (cle === tri) setOrdreAsc(!ordreAsc);
    else {
      setTri(cle);
      setOrdreAsc(cle === "famille"); // médecins d'abord
    }
  };
  const fiche = lignes.find((p) => p.id === choisi) ?? null;
  const filtre = JSON.stringify(filtres) !== JSON.stringify(FILTRES_VIDES);

  return (
    <>
      <BarreFiltres valeur={filtres} options={options} onAppliquer={appliquer} />
      {companyId ? <ExportProspects companyId={companyId} filtres={filtres} /> : null}
      {etat.erreur ? <EtatErreur erreur={etat.erreur} onReessayer={() => setVersionCharge((v) => v + 1)} contexte="prospects" /> : null}
      {etat.chargement && !etat.data ? <Chargement libelle="Chargement des prospects" /> : null}
      {etat.data && lignes.length === 0 ? (
        <Vide
          titre={filtre ? "Aucun prospect ne correspond à ces filtres." : "Aucun prospect pour le moment."}
          action={filtre ? undefined : <DemanderCoordinateur modele="Prospection d'une zone" />}
        >
          {filtre ? "Élargissez la zone ou baissez le score minimal, ou effacez les filtres." : "Demandez une recherche au Coordinateur : les prospects arrivent quand une campagne de prospection a collecté des données publiques ou qu'un particulier est enregistré."}
        </Vide>
      ) : null}
      {etat.data && lignes.length > 0 ? (
        <>
          <p className="atl-resume">
            <span>
              <strong>{nombre(etat.data.total)}</strong> prospect{etat.data.total > 1 ? "s" : ""}
            </span>
            <span>
              page {etat.data.page} sur {Math.max(etat.data.pages, 1)}
            </span>
          </p>
          <div className="atl-table-cadre">
            <table className="atl-table">
              <thead>
                <tr>
                  <th scope="col">Prospect</th>
                  <th scope="col">Cible</th>
                  <th scope="col" aria-sort={tri === "famille" ? (ordreAsc ? "ascending" : "descending") : undefined}>
                    <button type="button" className="atl-lien" onClick={() => trier("famille")} aria-label={tri === "famille" ? `Famille de métier, ${ordreAsc ? "médecins en premier" : "autres en premier"} ; inverser` : "Trier par famille de métier"}>
                      Par famille de métier
                    </button>
                  </th>
                  <th scope="col">Zone</th>
                  <th scope="col" aria-sort={tri === "score" ? (ordreAsc ? "ascending" : "descending") : tri === "confiance" ? (ordreAsc ? "ascending" : "descending") : undefined}>
                    Statut du lead
                    <span className="atl-statut-tris">
                      <button type="button" className="atl-lien" onClick={() => trier("score")} aria-label={tri === "score" ? `Score, trié ${ordreAsc ? "du plus bas au plus haut" : "du plus haut au plus bas"} ; inverser` : "Trier par score"}>
                        {tri === "score" ? `Score (${ordreAsc ? "croissant" : "décroissant"})` : "Score"}
                      </button>
                      <button type="button" className="atl-lien" title={EXPLICATION_CONFIANCE} onClick={() => trier("confiance")} aria-label={tri === "confiance" ? `Confiance, triée ${ordreAsc ? "du plus bas au plus haut" : "du plus haut au plus bas"} ; inverser` : "Trier par confiance"}>
                        {tri === "confiance" ? `Confiance (${ordreAsc ? "croissante" : "décroissante"})` : "Confiance"}
                      </button>
                    </span>
                  </th>
                  <th scope="col">Étape</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((p) => (
                  <tr key={p.id} data-choisi={p.id === choisi || undefined} className="atl-ligne-cliquable" onClick={() => setChoisi(p.id)}>
                    <th scope="row">
                      <button type="button" className="atl-lien" onClick={() => setChoisi(p.id)} aria-label={`Ouvrir la fiche de ${nomProspect(p)}`}>
                        {nomProspect(p)}
                      </button>
                    </th>
                    <td data-libelle="Cible">{LIBELLE_CIBLE_UNIQUE[p.cible]}</td>
                    <td data-libelle="Famille de métier">{LIBELLES_FAMILLES[familleMetier(p)]}</td>
                    <td data-libelle="Zone">{libelleZone(p.zone)}</td>
                    <td data-libelle="Statut du lead">
                      <BadgeStatutLead p={p} />
                      <ChiffresLead p={p} />
                    </td>
                    <td data-libelle="Étape">
                      <Pastille ton={TONS_STATUTS[p.statut]}>{LIBELLES_STATUTS[p.statut]}</Pastille>
                      {p.motifsExclusion.length > 0 ? <span className="atl-sous">{p.motifsExclusion.map((m) => LIBELLES_MOTIFS[m.motif]).join(" ; ")}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="atl-sous">Tri sur la page affichée. La priorité dit par qui commencer ; la cible prouvée dit si le lead correspond à votre cible.</p>
          {etat.data.pages > 1 || etat.data.total > TAILLES_PAGE[0] ? (
            <div className="atl-actions">
              {etat.data.pages > 1 ? (
                <>
                  <Bouton raisonDesactive={page <= 1 ? "Première page." : null} onClick={() => setPage(page - 1)}>
                    Page précédente
                  </Bouton>
                  <Bouton raisonDesactive={page >= etat.data.pages ? "Dernière page." : null} onClick={() => setPage(page + 1)}>
                    Page suivante
                  </Bouton>
                </>
              ) : null}
              <label className="atl-sous">
                Prospects par page{" "}
                <select
                  aria-label="Prospects par page"
                  value={parPage}
                  onChange={(e) => {
                    setParPage(Number(e.target.value));
                    setPage(1);
                    setChoisi(null);
                  }}
                >
                  {TAILLES_PAGE.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </>
      ) : null}
      {companyId ? <EtalonnerScore companyId={companyId} onTermine={() => setVersionCharge((v) => v + 1)} /> : null}
      {fiche && companyId ? (
        <Fiche
          key={fiche.id}
          p={fiche}
          companyId={companyId}
          onFermer={() => setChoisi(null)}
          onRecharger={() => setVersionCharge((v) => v + 1)}
          onExclu={() => {
            setChoisi(null);
            setVersionCharge((v) => v + 1);
          }}
          onCorbeille={() => {
            setChoisi(null);
            setVersionCharge((v) => v + 1);
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Rubrique                                                            */
/* ------------------------------------------------------------------ */

export function VueProspects() {
  const [onglet, setOnglet] = useState<"prospects" | "base" | "consentements">("prospects");
  return (
    <>
      <EnTete
        titre="Prospects"
        description="Les entreprises et les particuliers que l'atelier a repérés, avec la raison de chaque score et ce que la loi permet pour chaque canal. L'atelier ne contacte personne."
      />
      <div className="atl-segments" role="group" aria-label="Rubrique des prospects">
        <button type="button" className="atl-segment" aria-pressed={onglet === "prospects"} onClick={() => setOnglet("prospects")}>
          Prospects
        </button>
        <button type="button" className="atl-segment" aria-pressed={onglet === "base"} onClick={() => setOnglet("base")}>
          Base clients et oppositions
        </button>
        <button type="button" className="atl-segment" aria-pressed={onglet === "consentements"} onClick={() => setOnglet("consentements")}>
          Registre des consentements
        </button>
      </div>
      {onglet === "prospects" ? <ListeProspects /> : onglet === "base" ? <BaseClients /> : <RegistreConsentements />}
    </>
  );
}
