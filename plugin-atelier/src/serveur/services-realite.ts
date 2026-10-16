/**
 * « Passage au réel » (humain seulement, lecture seule) : visibilité sur ce qui manque pour brancher l'entreprise
 * sur la réalité.
 *
 * Route `realite.etat` : pour chaque branchement que le serveur sait lire (registre BCE, Banque nationale,
 * OpenStreetMap, base clients, bases légales, bureaux et segments, clé de la voix, moniteur belge, liste
 * « Ne m'appelez plus »), l'état, ce qu'il débloque, qui doit agir et le nombre de leads concernés ; plus la
 * synthèse par critère de qualification. Rien n'est codé en dur à « réel » : l'état vient du diagnostic des
 * sources réelles (mode lu sur la passerelle), de l'import de la base clients, de la fiche du client et de la
 * configuration. Les connecteurs Google et de diffusion sont lus par l'interface (connexions natives).
 *
 * Un seul parcours des leads, par pages de 200, sur le modèle de `reglages-leads` : le contexte de qualification
 * (cibles, base clients, réglages, corrections) est lu une fois, la confiance de chaque lead est calculée par
 * `calculerConfiance`, aucune requête par lead. L'entreprise vient de la résolution de route de l'hôte.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import {
  BaseLegaleContact,
  Prospect,
  type ActeurBranchement,
  type Branchement,
  type CleBranchement,
  type CleRouteApi,
  type CodeCritereQualification,
  type EtatBranchement,
  type PreuveBranchement,
  type RealiteEtat,
  type SourcesReelles,
  type SyntheseCritere,
} from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { erreur } from "./erreurs.js";
import { calculerConfiance, libelleCritere, type ContexteQualification } from "./qualification-prospects.js";
import { lireQualification, type StockReglagesLeads } from "./services-reglages-leads.js";

/** Pages de 200 leads lues au plus : au-delà, les nombres sont des minimums (`leads.tronque`). */
export const PAGES_MAX = 25;
const PAR_PAGE = 200;

export interface DependancesRealite {
  ctx: PluginContext;
  base: BaseAtelier;
  stock: StockReglagesLeads;
  /** Diagnostic des sources réelles (mode lu sur la passerelle), le même que celui de `atelier.sante`. */
  sourcesReelles: (companyId: string) => Promise<SourcesReelles>;
  maintenant?: () => Date;
}

const exigerHumain = (acteur: ActeurHote) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", "Le passage au réel est réservé à un humain.");
};

/** Branchement qui établirait chaque critère codé (`null` : rien à brancher, la fiche du client suffit). */
const BRANCHEMENT_DU_CRITERE: Readonly<Record<CodeCritereQualification, CleBranchement | null>> = {
  entreprise_active: "bce",
  segment_cible: "bce",
  zone_cible: "bce",
  taille_connue: "bnb",
  joignable_legalement: "consentement",
  pas_deja_client: "base_clients",
  sources_concordantes: "osm",
  assurance_obligatoire_metier: "bce",
  installation_recente: "bce",
  evenement_recent: "bce",
  besoin_offre_active: null,
  pas_concurrent: "bce",
  emploie_personnel: "bnb",
  flotte_probable: "bnb",
  proprietaire_locaux: "bnb",
  sante_financiere: "bnb",
  bureau_specialise_proche: "bureaux_segments",
  contact_public_permis: "ne_m_appelez_plus",
};

/** Ce que le lead attend, pour la phrase de synthèse (« N leads attendent … pour … »). */
const BUT_DU_CRITERE: Readonly<Record<CodeCritereQualification, string>> = {
  entreprise_active: "confirmer qu'ils sont actifs",
  segment_cible: "établir leur segment (codes NACE)",
  zone_cible: "situer leur adresse dans votre zone",
  taille_connue: "connaître leur taille (effectif, chiffre d'affaires)",
  joignable_legalement: "établir qu'on peut les contacter légalement",
  pas_deja_client: "vérifier qu'ils ne sont pas déjà clients",
  sources_concordantes: "recouper leurs informations avec une seconde source",
  assurance_obligatoire_metier: "savoir si leur métier impose une assurance",
  installation_recente: "dater le début de leur activité",
  evenement_recent: "repérer un changement récent (déménagement, nouvel établissement)",
  besoin_offre_active: "vérifier qu'une offre active couvre leur besoin",
  pas_concurrent: "exclure les concurrents (assureurs, courtiers)",
  emploie_personnel: "savoir s'ils emploient du personnel (effectif)",
  flotte_probable: "estimer s'ils roulent avec une flotte de véhicules",
  proprietaire_locaux: "savoir s'ils sont propriétaires de leurs locaux",
  sante_financiere: "juger leur santé financière (fonds propres, résultats)",
  bureau_specialise_proche: "trouver un bureau spécialisé à proximité",
  contact_public_permis: "établir qu'un contact professionnel publié est permis",
};

/** Ce que le branchement doit fournir (« le registre BCE réel »), pour la phrase de synthèse. */
const ATTENDU: Readonly<Record<CleBranchement, string>> = {
  bce: "le registre BCE réel",
  bnb: "les comptes réels de la Banque nationale",
  osm: "OpenStreetMap réel",
  base_clients: "la base clients du courtier",
  consentement: "les bases légales de contact",
  bureaux_segments: "les segments suivis par bureau",
  google: "les comptes Google",
  diffusion: "la diffusion réelle",
  voix: "la clé OpenAI de la voix",
  moniteur_belge: "le Moniteur belge",
  ne_m_appelez_plus: "la liste « Ne m'appelez plus »",
};

const NOMS: Readonly<Record<CleBranchement, string>> = {
  bce: "Registre BCE (Banque-Carrefour des Entreprises)",
  bnb: "Comptes de la Banque nationale de Belgique",
  osm: "OpenStreetMap",
  base_clients: "Base clients du courtier",
  consentement: "Règles de consentement et de contact (bases légales)",
  bureaux_segments: "Quel bureau suit quel segment",
  google: "Comptes Google",
  diffusion: "Diffusion réelle",
  voix: "Clé OpenAI pour la voix",
  moniteur_belge: "Moniteur belge",
  ne_m_appelez_plus: "Liste « Ne m'appelez plus »",
};

/** Fonctions débloquées (hors critères de leads). */
const FONCTIONS: Readonly<Partial<Record<CleBranchement, readonly string[]>>> = {
  bce: ["Fiches d'entreprise réelles : statut, activité (NACE), adresse du siège, date de début d'activité", "Détection des changements récents"],
  bnb: ["Taille réelle des entreprises : effectif et chiffre d'affaires des comptes annuels"],
  osm: ["Commerces et établissements réels sur la carte", "Recoupement d'une adresse avec la carte"],
  base_clients: ["Exclusion des clients actuels de la prospection", "Ventes croisées sur la vraie base du courtier"],
  consentement: ["Contact des leads par courriel, SMS ou téléphone dans le cadre légal", "Export vers le CRM des seuls leads joignables"],
  bureaux_segments: ["Répartition des leads par bureau selon les segments qu'il suit", "Carte et distance au bureau le plus proche"],
  voix: ["Conversation vocale en direct avec le Coordinateur"],
  moniteur_belge: ["Actes de sociétés publiés : constitutions, changements de siège, événements récents"],
  ne_m_appelez_plus: ["Exclusion des numéros inscrits sur la liste d'opposition nationale avant tout appel"],
};

/** Critères que le branchement établit EN PLUS de ceux de la table principale (sources encore à brancher ; le contact publié dépend de la liste d'opposition pour le téléphone). */
const CRITERES_SUPPLEMENTAIRES: Readonly<Partial<Record<CleBranchement, readonly CodeCritereQualification[]>>> = {
  moniteur_belge: ["evenement_recent", "installation_recente"],
  ne_m_appelez_plus: ["joignable_legalement"],
};

/** Branchements dont le nombre de leads concernés se calcule (les autres ne se rattachent à aucun critère de lead mesuré). */
const LEADS_CALCULABLES: ReadonlySet<CleBranchement> = new Set(["bce", "bnb", "osm", "base_clients", "consentement"]);

const ACTEURS: Readonly<Record<CleBranchement, ActeurBranchement>> = {
  bce: "acces_officiel",
  bnb: "acces_officiel",
  osm: "nous",
  base_clients: "client",
  consentement: "client",
  bureaux_segments: "client",
  google: "client",
  diffusion: "client",
  voix: "nous",
  moniteur_belge: "nous",
  ne_m_appelez_plus: "acces_officiel",
};

/** Vrai pour un critère codé (et non un critère personnalisé du client, dont le code est libre). */
const estCodee = (code: string): code is CodeCritereQualification => Object.hasOwn(BRANCHEMENT_DU_CRITERE, code);

function criteresDe(cle: CleBranchement): Array<{ code: string; libelle: string }> {
  const codes = new Set<CodeCritereQualification>([
    ...(Object.keys(BRANCHEMENT_DU_CRITERE) as CodeCritereQualification[]).filter((c) => BRANCHEMENT_DU_CRITERE[c] === cle),
    ...(CRITERES_SUPPLEMENTAIRES[cle] ?? []),
  ]);
  return [...codes].map((code) => ({ code, libelle: libelleCritere(code) }));
}

/** Phrase du consentement quand des bases légales vérifiées appartiennent à des leads de démonstration (jamais « réel »). */
function phraseDemo(analyses: number, demo: number): string {
  const sujet = analyses === 1 ? "Le lead analysé a une base légale vérifiée" : `Les ${analyses} leads analysés ont une base légale vérifiée`;
  const quoi = demo === analyses ? (analyses === 1 ? "c'est un lead de démonstration" : "ce sont tous des leads de démonstration") : `${demo} d'entre eux ${demo === 1 ? "est un lead de démonstration" : "sont des leads de démonstration"}`;
  return `${sujet}, mais ${quoi} : ce n'est pas une base légale réelle.`;
}

/** Lead relu comme l'affichage d'une page de prospects (mêmes champs, validé par le contrat) ; `null` si non conforme. */
export function assemblerProspect(l: Awaited<ReturnType<BaseAtelier["listerProspects"]>>["lignes"][number], det: Awaited<ReturnType<BaseAtelier["detailsProspects"]>>): Prospect | null {
  const basesLegales = (det.bases.get(l.id) ?? []).map((b) => ({
    prospectId: l.id, cible: b.cible, forme: b.forme, canal: b.canal, base: b.base, natureAdresse: b.nature_adresse,
    preuve: typeof b.preuve === "string" ? JSON.parse(b.preuve) : b.preuve, information: typeof b.information === "string" ? JSON.parse(b.information) : b.information,
    dncmVerifieLe: b.dncm_verifie_le == null ? null : new Date(String(b.dncm_verifie_le)).toISOString(), verifieLe: new Date(String(b.verifie_le)).toISOString(), verifiePar: b.verifie_par,
  }));
  const parsees = basesLegales.map((b) => BaseLegaleContact.safeParse(b));
  if (parsees.some((x) => !x.success)) return null;
  const r = Prospect.safeParse({ ...l, empreintes: (det.empreintes.get(l.id) ?? []).slice(0, 20), score: null, basesLegales: parsees.map((x) => (x as { data: unknown }).data) });
  return r.success ? r.data : null;
}

/** Contexte de qualification d'une entreprise, lu une fois (cibles, base clients, réglages, corrections). */
export async function contexteQualification(base: BaseAtelier, stock: StockReglagesLeads, companyId: string, maintenant: Date): Promise<ContexteQualification> {
  const [marque] = await base.marques(companyId);
  const etat = await base.etatBaseClients(companyId);
  const q = await lireQualification(stock, companyId);
  return {
    ...q,
    cibles: (marque?.ciblesProspection ?? []) as ContexteQualification["cibles"],
    segments: (marque?.segments ?? []) as ContexteQualification["segments"],
    etablissements: (marque?.etablissements ?? []) as ContexteQualification["etablissements"],
    offres: (marque?.offres ?? []) as NonNullable<ContexteQualification["offres"]>,
    baseClientsImportee: etat.clients > 0,
    maintenant: maintenant.toISOString(),
  };
}

export function routesRealite(d: DependancesRealite): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, base, stock } = d;
  const maintenant = () => (d.maintenant ? d.maintenant() : new Date());
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  /** Un seul parcours : pour chaque critère, leads « non vérifiés » ; pour chaque branchement, leads distincts concernés. */
  async function parcourir(companyId: string) {
    const ctxQualif = await contexteQualification(base, stock, companyId, maintenant());
    const parCritere = new Map<string, { libelle: string; n: number }>();
    const parBranchement = new Map<CleBranchement, number>();
    let demonstration = 0;
    let analyses = 0;
    let illisibles = 0;
    let tronque = false;
    for (let page = 1; ; page++) {
      if (page > PAGES_MAX) {
        tronque = true;
        break;
      }
      const { lignes } = await base.listerProspects(companyId, { page, parPage: PAR_PAGE });
      if (lignes.length > 0) {
        const det = await base.detailsProspects(companyId, lignes.map((l) => l.id));
        for (const l of lignes) {
          const p = assemblerProspect(l, det);
          if (p === null) {
            illisibles++;
            continue;
          }
          if (p.statut === "exclu" || p.statut === "refuse") continue;
          analyses++;
          if (p.mode === "demonstration") demonstration++;
          const cles = new Set<CleBranchement>();
          for (const c of calculerConfiance(p, ctxQualif).criteres) {
            if (c.statut !== "non_verifie") continue;
            const e = parCritere.get(c.code) ?? { libelle: c.libelle, n: 0 };
            e.n++;
            parCritere.set(c.code, e);
            const cle = estCodee(c.code) ? BRANCHEMENT_DU_CRITERE[c.code] : null;
            if (cle) cles.add(cle);
          }
          for (const cle of cles) parBranchement.set(cle, (parBranchement.get(cle) ?? 0) + 1);
        }
      }
      if (lignes.length < PAR_PAGE) break;
    }
    return { parCritere, parBranchement, analyses, illisibles, tronque, demonstration, joignableActif: ctxQualif.reglages?.criteres.joignable_legalement.actif ?? true };
  }

  async function etat(companyId: string): Promise<RealiteEtat> {
    const date = maintenant().toISOString();
    const [sources, baseClients, [marque], leads, config] = await Promise.all([
      d.sourcesReelles(companyId),
      base.etatBaseClients(companyId),
      base.marques(companyId),
      parcourir(companyId),
      (async () => {
        try {
          return ((await ctx.config.get(companyId)) ?? {}) as Record<string, unknown>;
        } catch {
          return null;
        }
      })(),
    ]);

    const fabrique = (cle: CleBranchement, etatB: EtatBranchement, preuve: PreuveBranchement, detail: string, verifieLe = date, mesurable = true): Branchement => ({
      cle, nom: NOMS[cle], etat: etatB, preuve, detail, acteur: ACTEURS[cle],
      debloque: { criteres: criteresDe(cle), fonctions: [...(FONCTIONS[cle] ?? [])] },
      leadsConcernes: mesurable && LEADS_CALCULABLES.has(cle) ? leads.parBranchement.get(cle) ?? 0 : null,
      verifieLe,
    });

    // Sources lues sur la passerelle : réel, démonstration, ou en attente d'un accès officiel (BCE, BNB) ; passerelle muette : non branché.
    const source = (cle: "bce" | "bnb" | "osm"): Branchement => {
      const s = sources.sources.find((x) => x.cle === cle);
      if (!s) return fabrique(cle, "non_branche", "aucune", "Source absente du diagnostic de la passerelle.");
      if (sources.passerelle !== "joignable") return fabrique(cle, "non_branche", "aucune", s.detail, s.verifieLe);
      if (s.reelle) return fabrique(cle, "reel", "mesure", s.detail, s.verifieLe);
      return fabrique(cle, cle === "osm" ? "demonstration" : "en_attente_acces", "mesure", s.detail, s.verifieLe);
    };

    const importBase = baseClients.dernierImport;
    const brClients =
      importBase === null
        ? fabrique("base_clients", "a_fournir_client", "mesure", "Aucune base clients importée : le client doit fournir son fichier (CSV ou Excel).")
        : importBase.mode === "reel"
          ? fabrique("base_clients", "reel", "mesure", `Base réelle importée le ${importBase.importeLe.slice(0, 10)} (${baseClients.clients} clients).`, importBase.importeLe)
          : importBase.mode === "demonstration"
            ? fabrique("base_clients", "demonstration", "mesure", `Base de démonstration importée le ${importBase.importeLe.slice(0, 10)} (${baseClients.clients} clients) : le client doit fournir la sienne.`, importBase.importeLe)
            : fabrique("base_clients", "non_branche", "mesure", `Import dont le mode (« ${importBase.mode} ») n'est ni réel ni démonstration.`, importBase.importeLe);

    const nonVerifJoignable = leads.parCritere.get("joignable_legalement")?.n ?? 0;
    const brConsent =
      leads.analyses === 0
        ? fabrique("consentement", "non_branche", "mesure", "Aucun lead à qualifier : rien à vérifier pour l'instant.")
        : !leads.joignableActif
          ? fabrique("consentement", "non_branche", "aucune", "Non mesurable : le critère « Joignable légalement » est désactivé dans les réglages de qualification, aucune base légale n'est comptée.", date, false)
          : nonVerifJoignable > 0
            ? fabrique("consentement", "a_fournir_client", "mesure", `${nonVerifJoignable} lead(s) sans base légale de contact vérifiée : le client doit enregistrer le consentement ou l'intérêt légitime B2B.`)
            : leads.demonstration > 0
              ? fabrique("consentement", "demonstration", "mesure", `${phraseDemo(leads.analyses, leads.demonstration)}`)
              : fabrique("consentement", "reel", "mesure", "Tous les leads analysés ont une base légale de contact vérifiée (ou une décision humaine).");

    const etabs = (marque?.etablissements ?? []) as Array<{ segmentsSuivis?: readonly string[] }>;
    const avecSegments = etabs.filter((e) => (e.segmentsSuivis ?? []).length > 0).length;
    const brBureaux =
      marque === undefined
        ? fabrique("bureaux_segments", "a_fournir_client", "mesure", "Fiche du client non enregistrée : bureaux et segments à décrire.")
        : etabs.length === 0
          ? fabrique("bureaux_segments", "a_fournir_client", "mesure", "Aucun bureau dans la fiche du client.")
          : avecSegments === etabs.length
            ? fabrique("bureaux_segments", "reel", "mesure", `Les ${etabs.length} bureau(x) de la fiche indiquent leurs segments suivis.`)
            : fabrique("bureaux_segments", "a_fournir_client", "mesure", `${avecSegments} bureau(x) sur ${etabs.length} indiquent les segments qu'ils suivent : le client doit compléter sa fiche.`);

    const refVoix = config?.openaiSecretRef;
    const brVoix =
      config === null
        ? fabrique("voix", "non_branche", "aucune", "Configuration illisible : clé non vérifiable.")
        : refVoix && typeof refVoix === "object"
          ? fabrique("voix", "configure_non_verifie", "declare", "Clé OpenAI déclarée dans la configuration (valeur jamais lue, non vérifiée auprès d'OpenAI).")
          : fabrique("voix", "non_branche", "mesure", "Aucune clé OpenAI : la voix en direct répondrait « voix_non_configuree » (503).");

    const branchements: Branchement[] = [
      source("bce"),
      source("bnb"),
      source("osm"),
      brClients,
      brConsent,
      brBureaux,
      brVoix,
      fabrique("moniteur_belge", "non_branche", "aucune", "Source à brancher : aucun connecteur du Moniteur belge n'existe encore."),
      fabrique("ne_m_appelez_plus", "non_branche", "aucune", "Source à brancher : la liste d'opposition nationale n'est pas encore consultée (accès officiel à obtenir)."),
    ];
    const etatDe = new Map(branchements.map((b) => [b.cle, b.etat]));

    const synthese: SyntheseCritere[] = [...leads.parCritere.entries()]
      .map(([code, { libelle, n }]) => {
        const cle = estCodee(code) ? BRANCHEMENT_DU_CRITERE[code] : null;
        const but = estCodee(code) ? BUT_DU_CRITERE[code] : "être évalués";
        const etatB = cle ? etatDe.get(cle) ?? null : null;
        const lead = n === 1 ? "lead" : "leads";
        const phrase =
          cle === null
            ? estCodee(code)
              ? `${n} ${lead} attendent la fiche du client (offres confirmées) pour ${but}.`
              : `${n} ${lead} attendent l'évaluation de l'agent Prospection pour « ${libelle} ».`
            : cle === "bureaux_segments" && etatB === "reel"
              ? `${n} ${lead} ${n === 1 ? "reste non vérifié" : "restent non vérifiés"} pour ${but} : les segments suivis sont renseignés, mais ${n === 1 ? "ce lead n'a pas pu être rapproché d'un bureau" : "ces leads n'ont pas pu être rapprochés d'un bureau"} (segment, position ou distance non établis).`
              : etatB === "reel"
              ? `${n} ${lead} ${n === 1 ? "reste non vérifié" : "restent non vérifiés"} pour ${but} : la source est branchée (${ATTENDU[cle]}), la vérification reste à lancer.`
              : `${n} ${lead} ${n === 1 ? "attend" : "attendent"} ${ATTENDU[cle]} pour ${but}.`;
        return { code, libelle, leadsNonVerifies: n, branchement: cle, etatBranchement: etatB, phrase };
      })
      .sort((a, b) => b.leadsNonVerifies - a.leadsNonVerifies || a.code.localeCompare(b.code));

    return { companyId, branchements, synthese, leads: { analyses: leads.analyses, tronque: leads.tronque, illisibles: leads.illisibles }, verifieLe: date };
  }

  routes["realite.etat"] = async (r) => {
    exigerHumain(r.acteur);
    return { corps: await etat(r.companyId) };
  };

  return routes;
}
