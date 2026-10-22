/**
 * Registre des consentements (humain seulement, lecture seule) : route `consentements.registre`.
 *
 * Pour chaque prospect particulier dont une coordonnée repose sur un consentement, une ligne par preuve : date, source,
 * texte accepté, page de captation, adresse IP tronquée (quand la captation la transmet), campagne, puis l'origine des
 * coordonnées (première source du prospect) et la base légale par canal. Rien n'est écrit : le registre relit
 * `prospects.particulier.consentements` et `bases_legales`, toujours filtrés sur l'entreprise de la requête.
 *
 * Coordonnées : chiffrées en base (AES-256-GCM), déchiffrées ici puis MASQUÉES par défaut (`+32 4•• •• •• 12`,
 * `j•••@exemple.be`). `complet=1` les rend en clair ; l'accès (vue ou fichier) est alors journalisé, sans aucune valeur
 * personnelle dans le journal. Jamais accessible à un agent. `format=csv` rend le même contenu en fichier CSV
 * (séparateur « ; », en-têtes français, protégé contre l'injection de formule).
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import {
  FiltreConsentements,
  LIMITES_REGISTRE_CONSENTEMENTS,
  type CleRouteApi,
  type LigneConsentement,
  type ReponseExportConsentements,
  type ReponseRegistreConsentements,
} from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { iso } from "./base.js";
import { dechiffrer } from "./chiffrement-donnees.js";
import { erreur, erreurValidation } from "./erreurs.js";

type Ligne = Record<string, unknown>;

/** Ligne lue en base, avant déchiffrement et masquage. */
export interface ConsentementLu {
  prospectId: string;
  pseudonyme: string;
  nomChiffre: string | null;
  coordonnees: Array<{ canal: string; valeur: string }>;
  origine: string;
  campagneId: string | null;
  campagne: string | null;
  mode: "demonstration" | "reel";
  source: { type: string; collecteLe: string; url: string | null } | null;
  basesLegales: Array<{ canal: string; base: string }>;
  preuve: {
    date: string; texteAccepte: string; source: string; canauxAutorises: string[]; responsableNomme: string; reference: string;
    retireLe: string | null; pageCaptation: string | null; adresseIpTronquee: string | null;
  };
}

export interface CritereConsentements {
  du?: string;
  au?: string;
  campagneId?: string;
}

export interface LecturesConsentements {
  /** Preuves de l'entreprise (jamais d'une autre), de la plus récente à la plus ancienne, avec le total. */
  registre(companyId: string, critere: CritereConsentements, limite: number, decalage: number): Promise<{ lignes: ConsentementLu[]; total: number }>;
}

export interface DependancesConsentements {
  lectures: LecturesConsentements;
  /** Clé de chiffrement des données de l'entreprise (secret natif) ; refuse si elle est indisponible. */
  cles(companyId: string): Promise<{ chiffrement: Uint8Array }>;
  journaliser: BaseAtelier["journaliser"];
  maintenant?: () => Date;
}

/* ------------------------------------------------------------------ */
/* Masquage et CSV (fonctions pures, exportées pour les tests)         */
/* ------------------------------------------------------------------ */

const PUCE = "•";

/** Téléphone : trois premiers et deux derniers chiffres gardés, séparateurs conservés (`+32 4•• •• •• 12`). */
export function masquerTelephone(valeur: string): string {
  const n = (valeur.match(/\d/gu) ?? []).length;
  const debut = n >= 7 ? 3 : 0;
  const fin = n >= 5 ? 2 : 0;
  let i = 0;
  return valeur.replace(/\d/gu, (c) => {
    const garde = i < debut || i >= n - fin;
    i += 1;
    return garde ? c : PUCE;
  });
}

/** Courriel : première lettre du nom gardée, trois puces fixes (la longueur ne fuit pas), domaine conservé (`j•••@exemple.be`). */
export function masquerCourriel(valeur: string): string {
  const a = valeur.lastIndexOf("@");
  if (a < 1) return PUCE.repeat(3);
  return `${valeur.slice(0, 1)}${PUCE.repeat(3)}${valeur.slice(a)}`;
}

/** Nom : initiale de chaque mot gardée, puces ensuite (`J••• D•••`). */
export function masquerNom(valeur: string): string {
  return valeur.split(/\s+/u).filter(Boolean).map((m) => `${m.slice(0, 1)}${PUCE.repeat(3)}`).join(" ");
}

/** Adresse postale : seule la dernière partie (code postal et commune) est gardée. */
/** « https://exemple.be/… » : le domaine seul ; une valeur qui n'est pas une URL devient « adresse masquée ». */
export function masquerUrl(valeur: string): string {
  try {
    const u = new URL(valeur);
    return `${u.protocol}//${u.host}/…`;
  } catch {
    return "adresse masquée";
  }
}

export function masquerAdresse(valeur: string): string {
  const parties = valeur.split(",").map((p) => p.trim()).filter(Boolean);
  if (parties.length < 2) return PUCE.repeat(4);
  return `${PUCE.repeat(4)}, ${parties[parties.length - 1]}`;
}

/** Cellule CSV entre guillemets ; une valeur qui commencerait par un caractère de formule reçoit une apostrophe (injection de formule). */
export function celluleCsv(valeur: string): string {
  const sure = /^[=+\-@\t\r]/u.test(valeur) ? `'${valeur}` : valeur;
  return `"${sure.replace(/"/gu, '""')}"`;
}

export const ENTETES_CSV_CONSENTEMENTS = [
  "Date du consentement", "Prospect", "Nom", "Courriel", "Téléphone", "Adresse", "Canaux autorisés", "Source du consentement", "Page de captation",
  "Adresse IP (tronquée)", "Texte accepté", "Référence", "Responsable nommé", "Retrait du consentement", "Campagne", "Origine du prospect",
  "Source des coordonnées", "Date de collecte des coordonnées", "Base légale",
] as const;

export function csvConsentements(lignes: readonly LigneConsentement[]): string {
  const corps = lignes.map((l) =>
    [
      l.consentementLe, l.pseudonyme, l.nom ?? "", l.courriel ?? "", l.telephone ?? "", l.adresse ?? "", l.canauxAutorises.join(", "), l.source, l.pageCaptation ?? "",
      l.adresseIpTronquee ?? "", l.texteAccepte, l.reference, l.responsableNomme, l.retireLe ?? "", l.campagne ?? "", l.origine,
      l.origineCoordonnees ? [l.origineCoordonnees.type, l.origineCoordonnees.url].filter(Boolean).join(" · ") : "", l.origineCoordonnees?.collecteLe ?? "",
      l.basesLegales.map((b) => `${b.canal} : ${b.base}`).join(", "),
    ].map(celluleCsv).join(";"),
  );
  // BOM pour qu'Excel lise l'UTF-8 ; séparateur « ; » et fins de ligne CRLF (usage belge).
  return "﻿" + [ENTETES_CSV_CONSENTEMENTS.map(celluleCsv).join(";"), ...corps].join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------ */
/* Lecture SQL                                                         */
/* ------------------------------------------------------------------ */

const tableau = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const texteOuNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function lecturesConsentementsSql(db: PluginContext["db"]): LecturesConsentements {
  // Une ligne par preuve de consentement d'un prospect particulier réel ou de démonstration, hors corbeille et hors fiche à réimporter.
  const depuis = (ns: string) => `
    from ${ns}.prospects p
    cross join lateral jsonb_array_elements(case when jsonb_typeof(p.particulier->'consentements') = 'array' then p.particulier->'consentements' else '[]'::jsonb end) with ordinality as e(preuve, ordre)
    left join ${ns}.campagnes ca on ca.id = p.campagne_id and ca.company_id = p.company_id`;
  const conditions = (critere: CritereConsentements) => {
    const params: unknown[] = [];
    const p = (v: unknown) => `$${params.push(v) + 1}`;
    const ou = [
      "p.company_id = $1",
      "p.cible = 'particulier'",
      "p.corbeille_le is null",
      "p.cle_a_reimporter = false",
      ...(critere.du ? [`(e.preuve->>'date')::timestamptz >= ${p(critere.du)}::date`] : []),
      ...(critere.au ? [`(e.preuve->>'date')::timestamptz < (${p(critere.au)}::date + 1)`] : []),
      ...(critere.campagneId ? [`p.campagne_id = ${p(critere.campagneId)}::uuid`] : []),
    ].join(" and ");
    return { ou, params };
  };
  return {
    async registre(companyId, critere, limite, decalage) {
      const ns = db.namespace;
      const { ou, params } = conditions(critere);
      const [c] = await db.query<Ligne>(`select count(*) as total ${depuis(ns)} where ${ou}`, [companyId, ...params]);
      const rows = await db.query<Ligne>(
        `select p.id, p.particulier->>'pseudonyme' as pseudonyme, p.nom_chiffre, p.coordonnees, p.origine_particulier, p.campagne_id, ca.nom as campagne, p.mode,
                p.sources->0 as source, e.preuve,
                coalesce((select jsonb_agg(jsonb_build_object('canal', b.canal, 'base', b.base) order by b.canal) from ${ns}.bases_legales b where b.prospect_id = p.id and b.company_id = p.company_id), '[]'::jsonb) as bases
         ${depuis(ns)} where ${ou}
         order by (e.preuve->>'date')::timestamptz desc, p.id, e.ordre
         limit ${limite} offset ${decalage}`,
        [companyId, ...params],
      );
      const lignes: ConsentementLu[] = rows.map((r) => {
        const pr = (r["preuve"] ?? {}) as Ligne;
        const s = (r["source"] ?? null) as Ligne | null;
        return {
          prospectId: String(r["id"]),
          pseudonyme: String(r["pseudonyme"] ?? ""),
          nomChiffre: texteOuNull(r["nom_chiffre"]),
          coordonnees: tableau<Ligne>(r["coordonnees"]).map((x) => ({ canal: String(x["canal"]), valeur: String(x["valeur"]) })),
          origine: String(r["origine_particulier"] ?? ""),
          campagneId: texteOuNull(r["campagne_id"]),
          campagne: texteOuNull(r["campagne"]),
          mode: r["mode"] === "reel" ? "reel" : "demonstration",
          source: s ? { type: String(s["type"] ?? ""), collecteLe: String(s["collecteLe"] ?? ""), url: texteOuNull(s["url"]) } : null,
          basesLegales: tableau<Ligne>(r["bases"]).map((b) => ({ canal: String(b["canal"]), base: String(b["base"]) })),
          preuve: {
            date: iso(pr["date"] as string), texteAccepte: String(pr["texteAccepte"] ?? ""), source: String(pr["source"] ?? ""),
            canauxAutorises: tableau<string>(pr["canauxAutorises"]), responsableNomme: String(pr["responsableNomme"] ?? ""), reference: String(pr["reference"] ?? ""),
            retireLe: texteOuNull(pr["retireLe"]), pageCaptation: texteOuNull(pr["pageCaptation"]), adresseIpTronquee: texteOuNull(pr["adresseIpTronquee"]),
          },
        };
      });
      return { lignes, total: Number(c?.["total"] ?? 0) };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Route                                                               */
/* ------------------------------------------------------------------ */

const exigerHumain = (acteur: ActeurHote) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", "Le registre des consentements est réservé à un humain.");
};

export function routesConsentements(d: DependancesConsentements): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const maintenant = () => (d.maintenant ? d.maintenant() : new Date());
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  /** Déchiffre puis masque (ou non) les coordonnées d'une preuve ; une valeur illisible vaut `[illisible]`, jamais une erreur. */
  const enLigne = (l: ConsentementLu, cle: Uint8Array, complet: boolean): LigneConsentement => {
    const lire = (v: string | null | undefined): string | null => {
      if (!v) return null;
      try {
        return dechiffrer(v, cle);
      } catch {
        return "[illisible]";
      }
    };
    const garder = (v: string | null, masquer: (x: string) => string) => (v === null || v === "[illisible]" || complet ? v : masquer(v));
    const coordonnee = (canal: string) => lire(l.coordonnees.find((c) => c.canal === canal)?.valeur);
    return {
      prospectId: l.prospectId,
      pseudonyme: l.pseudonyme,
      nom: garder(lire(l.nomChiffre), masquerNom),
      courriel: garder(coordonnee("courriel"), masquerCourriel),
      telephone: garder(coordonnee("telephone"), masquerTelephone),
      adresse: garder(coordonnee("courrier"), masquerAdresse),
      canauxAutorises: l.preuve.canauxAutorises,
      consentementLe: l.preuve.date,
      retireLe: l.preuve.retireLe,
      source: l.preuve.source,
      reference: l.preuve.reference,
      texteAccepte: l.preuve.texteAccepte,
      responsableNomme: l.preuve.responsableNomme,
      pageCaptation: l.preuve.pageCaptation,
      adresseIpTronquee: l.preuve.adresseIpTronquee,
      campagneId: l.campagneId,
      campagne: l.campagne,
      origine: l.origine,
      // En mode masqué, l'adresse d'origine se réduit à son domaine : un chemin peut identifier la personne.
      origineCoordonnees: l.source && !complet ? { ...l.source, url: l.source.url === null ? null : masquerUrl(l.source.url) } : l.source,
      basesLegales: l.basesLegales,
      mode: l.mode,
    };
  };

  routes["consentements.registre"] = async (r) => {
    exigerHumain(r.acteur);
    // Les paramètres de requête arrivent en texte (ou en liste) ; `companyId` est celui de l'hôte, jamais un filtre.
    const brut: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.query)) {
      if (k === "companyId") continue;
      const x = Array.isArray(v) ? v[0] : v;
      if (typeof x === "string" && x.trim() !== "") brut[k] = x.trim();
    }
    const lu = FiltreConsentements.safeParse(brut);
    if (!lu.success) erreurValidation("Filtres du registre des consentements", lu.error.issues);
    const f = lu.data!;
    if (f.du && f.au && f.du > f.au) erreur("entree_invalide", "La date de début doit précéder la date de fin.");
    const critere: CritereConsentements = { ...(f.du ? { du: f.du } : {}), ...(f.au ? { au: f.au } : {}), ...(f.campagneId ? { campagneId: f.campagneId } : {}) };
    const complet = f.complet === "1";
    const cle = (await d.cles(r.companyId)).chiffrement;
    const csv = f.format === "csv";

    let lignes: LigneConsentement[];
    let total: number;
    if (csv) {
      lignes = [];
      total = 0;
      const lot = 500;
      for (let decalage = 0; decalage < LIMITES_REGISTRE_CONSENTEMENTS.exportMax; decalage += lot) {
        const page = await d.lectures.registre(r.companyId, critere, Math.min(lot, LIMITES_REGISTRE_CONSENTEMENTS.exportMax - decalage), decalage);
        total = page.total;
        lignes.push(...page.lignes.map((x) => enLigne(x, cle, complet)));
        if (page.lignes.length === 0 || lignes.length >= total) break;
      }
    } else {
      const page = await d.lectures.registre(r.companyId, critere, f.taille, (f.page - 1) * f.taille);
      total = page.total;
      lignes = page.lignes.map((x) => enLigne(x, cle, complet));
    }

    // Accès en clair, et tout fichier exporté : tracés. Jamais une valeur personnelle dans le journal.
    if (complet || csv) {
      await d.journaliser({
        companyId: r.companyId, type: complet ? "consentements.registre_complet" : "consentements.export", entite: "consentements", entiteId: r.companyId,
        runId: r.acteur.runId, acteur: r.acteur.id,
        donnees: { par: `${r.acteur.type}:${r.acteur.id}`, complet, format: f.format, lignes: lignes.length, page: csv ? null : f.page, filtres: critere },
      });
    }

    if (csv) {
      const jour = maintenant().toISOString().slice(0, 10);
      const corps: ReponseExportConsentements = {
        companyId: r.companyId, complet,
        fichier: { nom: `registre-des-consentements-${jour}${complet ? "-complet" : ""}.csv`, typeMime: "text/csv;charset=utf-8", contenuBase64: Buffer.from(csvConsentements(lignes), "utf8").toString("base64") },
        lignes: lignes.length,
        tronque: total > lignes.length,
      };
      return { statut: 200, corps };
    }
    const corps: ReponseRegistreConsentements = { companyId: r.companyId, complet, lignes, total, page: f.page, taille: f.taille, pages: Math.max(1, Math.ceil(total / f.taille)) };
    return { statut: 200, corps };
  };
  return routes;
}
