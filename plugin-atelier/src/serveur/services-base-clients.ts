/**
 * Lot P9b : routes de la BASE DE CLIENTS, de l'ÉTALONNAGE et des EXPORTS de prospects
 * (docs/prospection-conception.md §4, §5.3, §6.3, §6.5).
 *
 * - `base-clients.apercu` / `base-clients.importer` / `base-clients.etat` / `base-clients.supprimer` :
 *   lecture et import d'un fichier CSV ou XLSX par `lireFichierBaseClients` et `preparerImportBaseClients`
 *   (lot P7, appelés tels quels) ; identifiants chiffrés, empreintes HMAC ; le fichier n'est pas conservé.
 *   Un nouvel import REMPLACE la base précédente. La suppression garde les oppositions.
 * - `etalonnage.calculer` : `etalonner` (lot P6) sur les issues commerciales enregistrées ou sur un
 *   historique d'opportunités importé, puis `appliquerEtalonnage` aux derniers scores de la cible.
 * - `tache.prospects.exporter` : base légale vérifiée par prospect (`contactPermis`), puis appel exact
 *   proposé à l'humain ; une fois l'appel approuvé, diffusion ordinaire (`demanderDiffusionSansVerrou` :
 *   simulée en démonstration, préparée sous preuve signée en réel). Rien ne part sans approbation.
 * - `prospects.exporter-fichier` : fichier CSV ou XLSX des seuls prospects contactables pour un canal
 *   (humain seulement), coordonnées déchiffrées, valeurs neutralisées contre l'injection de formule.
 */
import { createHash, randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import {
  ApercuBaseClientsEntree,
  CalculerEtalonnageEntree,
  DemanderExportCrmEntree,
  ExportCrm,
  ExporterFichierProspectsEntree,
  ImporterBaseClientsEntree,
  LIMITES_PROSPECTION,
  ListerProspectsEntree,
  SupprimerBaseClientsEntree,
  type CanalContact,
  type CleRouteApi,
  type ModeExecution,
  type Prospect,
  type RenvoiReferentiel,
  type VerificationExport,
} from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { aPurger, colonnesSensibles, lireFichierBaseClients, preparerImportBaseClients } from "./base-clients.js";
import { dechiffrer } from "./chiffrement-donnees.js";
import { erreur, erreurValidation } from "./erreurs.js";
import { appliquerEtalonnage, etalonner, type ObservationEtalonnage } from "./etalonnage.js";
import { controlerAppel } from "./preuve-approbation.js";
import { contactPermis, type ContexteProspection } from "./regles-prospection.js";
import type { ClesDonnees, DependancesProspection } from "./services-prospection.js";

type Campagne = { id: string; mode: "demonstration" | "reel"; canaux: string[]; perimetre: { zones: string[] } };

/** Fonctions internes de `routesProspection` partagées avec ces routes. */
export interface OutilsProspection {
  clesDonnees(companyId: string, reel: boolean): Promise<ClesDonnees>;
  relire(companyId: string, id: string): Promise<Prospect>;
  assemblerLignes(companyId: string, lignes: Awaited<ReturnType<BaseAtelier["listerProspects"]>>["lignes"]): Promise<Prospect[]>;
  contexteExclusions(companyId: string, campagne: Campagne | null, modeCampagne: ModeExecution, prospects: readonly Prospect[], date: string): Promise<{ contexte: ContexteProspection }>;
  referentielPour(companyId: string, campagneId: string | null): Promise<RenvoiReferentiel>;
}

type Schema<T> = { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> } } };
function analyser<T>(schema: Schema<T>, valeur: unknown, quoi: string): T {
  const r = schema.safeParse(valeur);
  if (!r.success) erreurValidation(quoi, r.error.issues);
  return r.data;
}

function exigerHumain(acteur: ActeurHote, quoi: string) {
  if (acteur.type !== "humain") erreur("elevation_refusee", `${quoi} est réservé à un humain.`);
}

function memeEntreprise(corps: { companyId: string }, companyId: string) {
  if (corps.companyId !== companyId) erreur("hors_entreprise", "Entreprise incohérente : seule l'entreprise résolue par l'hôte est servie.");
}

/* ------------------------------------------------------------------ */
/* Fonctions pures (exportées pour les tests)                          */
/* ------------------------------------------------------------------ */

/** Neutralise une valeur de tableur contre l'injection de formule (préfixe « ' »). */
export function neutraliserCellule(v: string): string {
  return /^[=+\-@\t\r]/u.test(v) ? `'${v}` : v;
}

/** Ligne CSV (séparateur « ; », guillemets doublés), valeurs neutralisées. */
function ligneCsv(valeurs: readonly string[]): string {
  return valeurs.map((v) => {
    const n = neutraliserCellule(v);
    return /[";\r\n]/u.test(n) ? `"${n.replace(/"/gu, '""')}"` : n;
  }).join(";");
}

/**
 * Score de DÉMONSTRATION d'une opportunité de l'historique quand il n'a pas de colonne `score` : le
 * générateur de démonstration ne fournit que le canal d'origine. Barème fixe, jamais ajusté sur les issues.
 */
export const SCORE_DEMO_CANAL: Readonly<Record<string, number>> = {
  recommandation: 70, bureau: 60, devis_en_ligne: 50, appel_sortant: 40, prospection_courriel: 30,
};

/** Observations tirées d'un historique d'opportunités lu (en-tête + lignes) pour une cible. */
export function observationsHistorique(colonnes: readonly string[], lignes: readonly string[][], cible: string, mode: ModeExecution): { observations: ObservationEtalonnage[]; ignorees: number } {
  const idx = (nom: string) => colonnes.findIndex((c) => c.trim().toLowerCase() === nom);
  const [iCible, iDate, iIssue, iCanal, iScore] = [idx("type_cible"), idx("date_cloture"), idx("issue"), idx("canal_origine"), idx("score")];
  if (iCible < 0 || iDate < 0 || iIssue < 0) erreur("entree_invalide", "Historique : colonnes « type_cible », « date_cloture » et « issue » obligatoires.");
  if (iScore < 0 && mode === "reel") erreur("entree_invalide", "Historique réel : la colonne « score » (score attribué au contact) est obligatoire.");
  if (iScore < 0 && iCanal < 0) erreur("entree_invalide", "Historique : colonne « score » ou « canal_origine » attendue.");
  const observations: ObservationEtalonnage[] = [];
  let ignorees = 0;
  for (const l of lignes) {
    if ((l[iCible] ?? "").trim() !== cible) continue;
    const issue = (l[iIssue] ?? "").trim().toLowerCase();
    const date = (l[iDate] ?? "").trim();
    const score = iScore >= 0 ? Number((l[iScore] ?? "").replace(",", ".")) : SCORE_DEMO_CANAL[(l[iCanal] ?? "").trim()];
    if (!["gagnee", "gagne", "perdue", "perdu"].includes(issue) || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || score === undefined || !Number.isFinite(score) || score < 0 || score > 100) {
      ignorees++;
      continue;
    }
    observations.push({ score, converti: issue.startsWith("gagn"), date });
  }
  return { observations, ignorees };
}

/** Coupure par défaut : 70 % des issues les plus anciennes servent à l'ajustement. */
export function coupureParDefaut(observations: readonly ObservationEtalonnage[]): string {
  const dates = observations.map((o) => o.date).sort();
  return dates[Math.min(dates.length - 1, Math.floor(dates.length * 0.7))] ?? "1970-01-01";
}

const OUTIL_EXPORT: Readonly<Record<string, string>> = {
  crm: "crm_creer_contact", pipedrive: "pipedrive_creer_personne", teamleader: "teamleader_creer_contact", odoo: "odoo_creer_lead",
};

const prefixeNace = (codes: readonly string[], prefixes: readonly string[]) =>
  prefixes.length === 0 || codes.some((c) => prefixes.some((p) => c.replace(/\./gu, "").startsWith(p.replace(/\./gu, ""))));

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export function routesBaseClients(d: DependancesProspection, o: OutilsProspection): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { base, ctx } = d;
  const maintenant = () => (d.maintenant ? d.maintenant() : new Date());
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};
  const par = (a: ActeurHote) => `${a.type}:${a.id}`;

  /** Contexte de `contactPermis` pour un prospect (option démonstration des numéros BCE fictifs). */
  const ignorerBce = (p: Prospect) => p.mode === "demonstration" && p.sources.some((s) => s.type === "depot_signe");
  function verifier(p: Prospect, canal: CanalContact, contexte: ContexteProspection): string | null {
    if (p.statut === "exclu") return `Prospect exclu : ${p.motifsExclusion.map((m) => m.motif).join(", ") || "motif non précisé"}`;
    const baseLegale = p.basesLegales.find((b) => b.canal === canal) ?? null;
    const decision = contactPermis(p, canal, baseLegale, { ...contexte, ignorerControleBce: ignorerBce(p) });
    return decision.permis ? null : decision.motif;
  }

  /* ---------------- base de clients ---------------- */

  routes["base-clients.apercu"] = async (r) => {
    exigerHumain(r.acteur, "La lecture d'une base de clients");
    const entree = analyser(ApercuBaseClientsEntree, r.corps, "Aperçu de base de clients");
    memeEntreprise(entree, r.companyId);
    const lu = lireFichierBaseClients({ nomFichier: entree.nomFichier, format: entree.format, contenu: Buffer.from(entree.contenuBase64, "base64"), ...(entree.separateur ? { separateur: entree.separateur } : {}) });
    if (!lu.ok) erreur("entree_invalide", lu.motif, { colonnesSensiblesRefusees: lu.colonnesSensiblesRefusees });
    return {
      corps: {
        format: lu.format, nomFichier: entree.nomFichier, empreinteFichier: lu.empreinteFichier, tailleOctets: lu.tailleOctets, colonnes: lu.colonnes, apercu: lu.apercu,
        lignes: lu.lignes.length, colonnesSensiblesRefusees: colonnesSensibles(lu.colonnes), formulesNeutralisees: lu.formulesNeutralisees, injectionsSignalees: lu.injectionsSignalees,
      },
    };
  };

  routes["base-clients.importer"] = async (r) =>
    d.exclusif(r.companyId, async () => {
      exigerHumain(r.acteur, "L'import d'une base de clients");
      const entree = analyser(ImporterBaseClientsEntree, r.corps, "Import de base de clients");
      memeEntreprise(entree, r.companyId);
      const effectif = await d.modeEffectif(r.companyId, null);
      const cles = await o.clesDonnees(r.companyId, effectif.mode === "reel");
      const res = preparerImportBaseClients(
        {
          nomFichier: entree.nomFichier, format: entree.format, contenu: Buffer.from(entree.contenuBase64, "base64"), correspondance: entree.correspondance,
          finalite: entree.finalite, dureeConservationMois: entree.dureeConservationMois, ...(entree.separateur ? { separateur: entree.separateur } : {}),
        },
        { chiffrement: cles.chiffrement, hmac: cles.hmac },
        { companyId: r.companyId, importePar: par(r.acteur), maintenant: maintenant().toISOString(), mode: effectif.mode },
      );
      if (!res.ok) {
        await base.journaliser({ companyId: r.companyId, type: "base_clients.refusee", entite: "base_clients", entiteId: r.companyId, acteur: r.acteur.id, donnees: { motif: res.motif, colonnesSensiblesRefusees: res.colonnesSensiblesRefusees } });
        erreur("entree_invalide", res.motif, { colonnesSensiblesRefusees: res.colonnesSensiblesRefusees });
      }
      // Un nouvel import remplace la base précédente (les oppositions restent).
      const remplaces = await base.supprimerBaseClients(r.companyId);
      await base.insererImportBaseClients(res.import);
      await base.insererClients(r.companyId, res.clients as unknown as Array<Record<string, unknown>>);
      await base.journaliser({
        companyId: r.companyId, type: "base_clients.importee", entite: "base_clients", entiteId: res.import.id, acteur: r.acteur.id,
        donnees: { lignesLues: res.import.lignesLues, lignesRetenues: res.import.lignesRetenues, lignesRejetees: res.import.lignesRejetees, colonnesSensiblesRefusees: res.import.colonnesSensiblesRefusees, purgeLe: res.import.purgeLe, mode: res.import.mode, cles: cles.origine, clientsRemplaces: remplaces.clients },
      });
      return { statut: 201, corps: res.import };
    });

  routes["base-clients.etat"] = async (r) => {
    const e = await base.etatBaseClients(r.companyId);
    const i = e.dernierImport;
    return {
      corps: {
        existe: i !== null, clients: e.clients, actifs: e.actifs, importId: i?.id ?? null, nomFichier: i?.nomFichier ?? null, format: i?.format ?? null, importeLe: i?.importeLe ?? null,
        importePar: i?.importePar ?? null, purgeLe: i?.purgeLe ?? null, finalite: i?.finalite ?? null, dureeConservationMois: i?.dureeConservationMois ?? null, mode: i?.mode ?? null,
        aPurger: i ? aPurger({ importeLe: i.importeLe, dureeConservationMois: i.dureeConservationMois }, maintenant().toISOString()) : false,
      },
    };
  };

  routes["base-clients.supprimer"] = async (r) =>
    d.exclusif(r.companyId, async () => {
      exigerHumain(r.acteur, "La suppression de la base de clients");
      const entree = analyser(SupprimerBaseClientsEntree, r.corps, "Suppression de la base de clients");
      memeEntreprise(entree, r.companyId);
      const res = await base.supprimerBaseClients(r.companyId);
      await base.journaliser({ companyId: r.companyId, type: "base_clients.supprimee", entite: "base_clients", entiteId: r.companyId, acteur: r.acteur.id, donnees: { motif: entree.motif, ...res, oppositionsGardees: true } });
      return { corps: { clientsSupprimes: res.clients, importsSupprimes: res.imports, oppositionsGardees: true } };
    });

  /* ---------------- étalonnage ---------------- */

  routes["etalonnage.calculer"] = async (r) =>
    d.exclusif(r.companyId, async () => {
      exigerHumain(r.acteur, "L'étalonnage du score");
      const entree = analyser(CalculerEtalonnageEntree, r.corps, "Étalonnage");
      memeEntreprise(entree, r.companyId);
      const mode = (await d.modeEffectif(r.companyId, null)).mode;
      let observations: ObservationEtalonnage[];
      let origines: Array<"crm" | "usine" | "import">;
      let ignorees = 0;
      if (entree.historique) {
        if (entree.segment.nace.length > 0) erreur("entree_invalide", "L'historique d'opportunités ne porte pas de code NACE : étalonner la cible entière (nace vide).");
        const lu = lireFichierBaseClients({ nomFichier: entree.historique.nomFichier, format: entree.historique.format, contenu: Buffer.from(entree.historique.contenuBase64, "base64") });
        if (!lu.ok) erreur("entree_invalide", `Historique illisible : ${lu.motif}`);
        ({ observations, ignorees } = observationsHistorique(lu.colonnes, lu.lignes, entree.segment.cible, mode));
        origines = ["import"];
      } else {
        const issues = (await base.issuesPourEtalonnage(r.companyId, entree.segment.cible, mode)).filter((i) => i.score !== null && prefixeNace(i.nace, entree.segment.nace));
        observations = issues.map((i) => ({ score: i.score!, converti: i.issue === "gagne", date: i.date }));
        origines = [...new Set(issues.map((i) => i.origine as "crm" | "usine" | "import"))];
      }
      if (observations.length === 0) erreur("entree_invalide", "Aucune issue observée pour ce segment : rien à étalonner.");
      const calculeLe = maintenant().toISOString();
      let resultat: ReturnType<typeof etalonner>;
      try {
        resultat = etalonner({
          id: randomUUID(), companyId: r.companyId, segment: entree.segment, observations, coupure: entree.coupure ?? coupureParDefaut(observations), horizonJours: entree.horizonJours,
          versionPoids: (await base.poidsScoreCourant(r.companyId))?.version ?? 1, origines, calculeLe, calculePar: par(r.acteur), mode,
        });
      } catch (e) {
        return erreur("entree_invalide", e instanceof Error ? e.message : "Étalonnage impossible.");
      }
      const et = resultat.etalonnage;
      await base.insererEtalonnage(et);
      // Application aux derniers scores de la cible : probabilité seulement si les données la soutiennent.
      let appliquees = 0;
      const scores = (await base.scoresCourantsCible(r.companyId, entree.segment.cible)).filter((s) => prefixeNace(s.nace, entree.segment.nace));
      for (const s of scores) {
        const a = appliquerEtalonnage(et, s.valeur);
        if (!a.applique) continue;
        await base.insererScoreMesure({
          id: randomUUID(), companyId: r.companyId, prospectId: s.prospectId, valeur: s.valeur, criteres: s.criteres, versionPoids: s.versionPoids, etalonnageId: et.id,
          probabilite: a.applique.marge.probabilite, borneBasse: a.applique.marge.borneBasse, borneHaute: a.applique.marge.borneHaute, calculeLe,
        });
        appliquees++;
      }
      await base.journaliser({
        companyId: r.companyId, type: "etalonnage.calcule", entite: "etalonnage", entiteId: et.id, acteur: r.acteur.id,
        donnees: { segment: et.segment, methode: et.methode, statut: et.statut, effectif: et.effectif, conversions: et.conversions, brier: et.brier, origines, ignorees, prospects: scores.length, probabilitesAppliquees: appliquees },
      });
      return { statut: 201, corps: { etalonnage: et, observationsIgnorees: ignorees, application: { prospects: scores.length, probabilitesAppliquees: appliquees, estimations: scores.length - appliquees } } };
    });

  /* ---------------- export vers le CRM ---------------- */

  routes["tache.prospects.exporter"] = async (r) =>
    d.exclusif(r.companyId, async () => {
      const entree = analyser(DemanderExportCrmEntree, r.corps, "Export vers le CRM");
      const issue = await d.tache(r.companyId, r.params.issueId ?? "");
      const deja = await base.lireExportCrmParCle(r.companyId, entree.cleIdempotence);
      if (deja) {
        if (deja.issueId !== issue.id) erreur("conflit", "Clé d'idempotence déjà utilisée pour une autre tâche.");
        return { statut: deja.etat === "refusee" ? 403 : 200, corps: { etat: deja.etat, export: ExportCrm.parse(deja), verifications: deja.verifications, appel: null, diffusion: null, rejoue: true } };
      }
      const campagne = await d.campagneDeTache(r.companyId, issue);
      const effectif = await d.modeEffectif(r.companyId, campagne);
      const date = maintenant().toISOString();
      const prospects: Prospect[] = [];
      const verifications: VerificationExport[] = [];
      for (const id of entree.prospectIds) {
        try {
          prospects.push(await o.relire(r.companyId, id));
        } catch {
          verifications.push({ prospectId: id, ok: false, motif: "Prospect introuvable dans cette entreprise" });
        }
      }
      const { contexte } = await o.contexteExclusions(r.companyId, campagne, effectif.mode, prospects, date);
      for (const p of prospects) {
        const motif = verifier(p, entree.canal, contexte);
        verifications.push({ prospectId: p.id, ok: motif === null, motif });
      }
      const referentiel = await o.referentielPour(r.companyId, campagne?.id ?? null);
      const enregistrer = async (etat: string, diffusionId: string | null, motifRefus: string | null) => {
        const ex = ExportCrm.parse({
          id: randomUUID(), companyId: r.companyId, issueId: issue.id, diffusionId, entite: entree.entite, referentielVersion: referentiel.version, service: entree.service, canal: entree.canal,
          prospectIds: entree.prospectIds, verifications, etat, motifRefus, cleIdempotence: entree.cleIdempotence, mode: effectif.mode, demandePar: par(r.acteur), creeLe: date,
        });
        await base.insererExportCrm(ex);
        await base.journaliser({
          companyId: r.companyId, type: `prospects.export_${etat}`, entite: "export_crm", entiteId: ex.id, issueId: issue.id, runId: r.acteur.runId, acteur: r.acteur.id,
          donnees: { service: ex.service, canal: ex.canal, prospects: ex.prospectIds.length, refuses: verifications.filter((v) => !v.ok).length, diffusionId, motif: motifRefus },
        });
        return ex;
      };
      const refuses = verifications.filter((v) => !v.ok);
      if (refuses.length > 0) {
        const motif = `${refuses.length} prospect(s) sans contact permis sur le canal ${entree.canal} : ${refuses.slice(0, 5).map((v) => v.motif).join(" ; ")}`.slice(0, 1000);
        const ex = await enregistrer("refusee", null, motif);
        return { statut: 403, corps: { etat: "refusee", export: ex, verifications, appel: null, diffusion: null } };
      }

      // Appel exact proposé à l'humain (S-1) : sur la révision courante du livrable de la tâche.
      const liv = await d.livrableCourant(r.companyId, issue.id);
      if (!liv) erreur("porte_absente", "Tâche hors porte ou sans livrable : un export vers le CRM s'appuie sur un livrable approuvé.");
      let compte: string;
      if (effectif.mode === "demonstration") compte = `${entree.service}/demonstration`;
      else {
        const comptes = await base.comptesConnexion(r.companyId, campagne?.id ?? null, issue.id, entree.service);
        if (comptes.length !== 1) erreur("conflit", `Compte ${entree.service} non déterminé (${comptes.length} compte(s) connu(s) par les dépôts réels de la campagne) : l'export vise un compte exact.`);
        compte = comptes[0]!;
      }
      const outil = OUTIL_EXPORT[entree.service]!;
      const args = {
        contacts: prospects.map((p) => ({
          reference: p.id, denomination: p.denomination, numero_bce: p.numeroBce, code_postal: p.zone.codePostal ?? null, commune: p.zone.commune ?? null, canal: entree.canal,
          coordonnee: p.coordonnees.find((c) => c.canal === entree.canal)?.empreinte ?? null, entite: entree.entite,
        })),
      };
      const controle = controlerAppel({ service: entree.service, outil, compte, arguments: args }, liv.corps);
      if (!controle.ok) erreur("entree_invalide", `Appel refusé : ${controle.motif}.`);
      let appel = await base.lireAppelParEmpreinte(r.companyId, issue.id, liv.revisionId, controle.empreinte);
      if (!appel) {
        await base.insererAppel({
          id: randomUUID(), companyId: r.companyId, issueId: issue.id, revisionId: liv.revisionId, service: entree.service, outil, action: controle.action, compte,
          arguments: args, empreinte: controle.empreinte, empreinteArguments: controle.empreinteArguments, par: par(r.acteur),
        });
        appel = await base.lireAppelParEmpreinte(r.companyId, issue.id, liv.revisionId, controle.empreinte);
      }
      if (!appel) erreur("erreur_interne", "Appel proposé non relu.");
      const vueAppel = {
        id: appel.id, service: entree.service, outil, compte, empreinte: controle.empreinte, apercu: controle.apercu,
        approbation: { id: appel.id, service: entree.service, outil, compte, empreinte: controle.empreinte },
      };

      // Sans approbation humaine de cette révision pour « modifier_crm » sur ce CRM : en attente, rien ne part.
      const decision = (await base.listerDecisions(r.companyId, issue.id))
        .filter((x) => x.revisionId === liv.revisionId && !x.invalidee)
        .sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1))[0];
      const portee = decision?.action === "approuver" ? (decision.portee as { action?: string; canal?: string | null } | null) : null;
      if (!portee || portee.action !== "modifier_crm" || portee.canal !== entree.service) {
        await base.journaliser({
          companyId: r.companyId, type: "prospects.export_en_attente", entite: "tache", entiteId: issue.id, issueId: issue.id, runId: r.acteur.runId, acteur: r.acteur.id,
          donnees: { service: entree.service, canal: entree.canal, prospects: prospects.length, appelId: appel.id, empreinte: controle.empreinte },
        });
        return {
          statut: 202,
          corps: {
            etat: "en_attente_approbation", export: null, verifications, appel: vueAppel, diffusion: null,
            consigne: `Bases légales vérifiées. Un humain doit approuver la révision courante avec la portée « modifier_crm » sur « ${entree.service} » (et l'appel ${appel.id} pour une diffusion réelle) ; puis rejouer cette demande avec la même clé d'idempotence.`,
          },
        };
      }

      const res = await d.demanderDiffusionSansVerrou(r.companyId, issue.id, {
        revisionId: liv.revisionId, action: "modifier_crm", canal: entree.service, compte, cleIdempotence: `export:${entree.cleIdempotence}`.slice(0, 200), service: entree.service, outil, arguments: args,
      }, r.acteur);
      const diffusion = res.corps as { id: string; etat: string; motifRefus: string | null } | null;
      if (!diffusion) erreur("erreur_interne", "Diffusion non relue après la demande d'export.");
      const ex = await enregistrer(diffusion.etat, diffusion.id, diffusion.etat === "refusee" ? diffusion.motifRefus ?? "Diffusion refusée." : null);
      return { statut: res.statut, corps: { etat: ex.etat, export: ex, verifications, appel: vueAppel, diffusion } };
    });

  /* ---------------- export fichier ---------------- */

  routes["prospects.exporter-fichier"] = async (r) => {
    exigerHumain(r.acteur, "L'export d'un fichier de prospects");
    const entree = analyser(ExporterFichierProspectsEntree, r.corps, "Export fichier de prospects");
    memeEntreprise(entree, r.companyId);
    const effectif = await d.modeEffectif(r.companyId, null);
    const date = maintenant().toISOString();
    const prospects: Prospect[] = [];
    const refuses: Array<{ prospectId: string; denomination: string | null; motif: string }> = [];
    if (entree.prospectIds) {
      for (const id of entree.prospectIds) {
        try {
          prospects.push(await o.relire(r.companyId, id));
        } catch {
          refuses.push({ prospectId: id, denomination: null, motif: "Prospect introuvable dans cette entreprise" });
        }
      }
    } else {
      for (let page = 1; prospects.length < 5000; page++) {
        const f = analyser(ListerProspectsEntree, { ...entree.filtres, companyId: r.companyId, page, parPage: LIMITES_PROSPECTION.pageMax }, "Filtres de l'export");
        const { lignes } = await base.listerProspects(r.companyId, f);
        prospects.push(...(await o.assemblerLignes(r.companyId, lignes)));
        if (lignes.length < f.parPage) break;
      }
    }
    const demandes = prospects.length + refuses.length;
    const { contexte } = await o.contexteExclusions(r.companyId, null, effectif.mode, prospects, date);
    const retenus: Prospect[] = [];
    for (const p of prospects) {
      const motif = verifier(p, entree.canal, contexte);
      if (motif === null) retenus.push(p);
      else refuses.push({ prospectId: p.id, denomination: p.denomination, motif });
    }
    const cles = await o.clesDonnees(r.companyId, effectif.mode === "reel" || retenus.some((p) => p.mode === "reel"));
    const clair = (v: string | null | undefined) => {
      if (!v) return "";
      try {
        return dechiffrer(v, cles.chiffrement);
      } catch {
        return "[indéchiffrable]";
      }
    };
    const enTete = ["identifiant", "cible", "nom_ou_entreprise", "numero_bce", "courriel", "telephone", "code_postal", "commune", "score", "libelle_score", "base_legale", "source", "date_source"];
    const lignes = retenus.map((p) => {
      const s = p.score;
      const libelle = !s
        ? "aucun score"
        : s.nature === "probabilite_mesuree" && s.etalonnage
          ? `probabilité mesurée ${Math.round(s.etalonnage.marge.probabilite * 100)} % (de ${Math.round(s.etalonnage.marge.borneBasse * 100)} à ${Math.round(s.etalonnage.marge.borneHaute * 100)} %, ${s.etalonnage.effectif} issues)`
          : "estimation (score de priorité, pas une probabilité)";
      const source = p.sources[p.sources.length - 1];
      return [
        p.id, p.cible, p.denomination ?? clair(p.nomChiffre), p.numeroBce ?? "", clair(p.coordonnees.find((c) => c.canal === "courriel")?.valeur), clair(p.coordonnees.find((c) => c.canal === "telephone")?.valeur),
        p.zone.codePostal ?? "", p.zone.commune ?? "", s ? String(s.valeur) : "", libelle, p.basesLegales.find((b) => b.canal === entree.canal)?.base ?? "",
        source ? [source.type, source.service, source.outil].filter(Boolean).join(" · ") : "", source?.collecteLe ?? "",
      ];
    });
    let contenu: Buffer;
    if (entree.format === "csv") contenu = Buffer.from(`﻿${[enTete, ...lignes].map(ligneCsv).join("\r\n")}\r\n`, "utf8");
    else {
      const feuille = XLSX.utils.aoa_to_sheet([enTete, ...lignes].map((l) => l.map(neutraliserCellule)));
      const classeur = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(classeur, feuille, "Prospects");
      contenu = XLSX.write(classeur, { type: "buffer", bookType: "xlsx" }) as Buffer;
    }
    const demo = effectif.mode === "demonstration";
    const nomFichier = `prospects-${entree.canal}-${date.slice(0, 10)}${demo ? " (démonstration)" : ""}.${entree.format}`;
    const empreinteFichier = createHash("sha256").update(contenu).digest("hex");
    await base.journaliser({
      companyId: r.companyId, type: "prospects.export_fichier", entite: "prospects", entiteId: r.companyId, acteur: r.acteur.id,
      donnees: { par: par(r.acteur), canal: entree.canal, format: entree.format, inclus: retenus.length, refuses: refuses.length, empreinteFichier, mode: effectif.mode, cles: cles.origine },
    });
    ctx.logger.info("Export fichier de prospects", { companyId: r.companyId, inclus: retenus.length, refuses: refuses.length });
    return {
      statut: 201,
      corps: {
        nomFichier, format: entree.format, typeMime: entree.format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        contenuBase64: contenu.toString("base64"), empreinteFichier, mode: effectif.mode, genereLe: date,
        rapport: { demandes, inclus: retenus.length, refuses },
      },
    };
  };

  return routes;
}
