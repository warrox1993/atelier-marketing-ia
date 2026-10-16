/**
 * Lot R7 : routes des CONNAISSANCES du client (RAG), docs/rag-conception.md §5.1-5.2 et §6.2.
 *
 * - `connaissances.importer` (humain) : base64 ≤ 7 Mo, refus des données de santé, pseudonymisation
 *   proposée par défaut (notes de rendez-vous, retours de partenaires, réclamations), extraction, passages,
 *   vectorisation ; nouvelle version d'un document = `remplacerVersion`. Le fichier n'est jamais conservé
 *   (empreinte seulement). Sans vectorisation, l'indexation est immédiate ; avec un modèle, elle passe en
 *   tâche de fond (`en_file` → `indexe`).
 * - `tache.connaissances.rechercher` (agent ou humain) : entreprise de la ROUTE, jamais du corps ; chaque
 *   passage rendu devient une source de la tâche (provenance `connaissance`, mode déduit), ce qui le fait
 *   entrer dans la fraîcheur et la porte. Passages marqués non fiables (`marquerPassages`).
 * - `connaissances.lister`, `connaissances.statut`, `connaissances.supprimer` (humain, journalisé).
 * - `connaissances.importer-demo` (humain, démonstration seulement) : importe d'un geste le corpus
 *   `organisation/demo/connaissances/`.
 * - `entreesPorte` : ce que la porte passe à `controlerCitationsConnaissances`.
 *
 * Les briques (extraction, vectorisation, recherche, règles) sont appelées telles quelles.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import {
  DocumentConnaissance,
  ImporterConnaissanceEntree,
  LIMITES_CONNAISSANCES,
  ListerConnaissancesEntree,
  ResultatRechercheConnaissances,
  StatutConnaissances,
  SupprimerConnaissanceEntree,
  TypeDocumentConnaissance,
  VersionConnaissance,
  lireAdresseConnaissance,
  pseudonymisationDemandee,
  type CleRouteApi,
  type FormatDocumentConnaissance,
  type RapportPseudonymisation,
} from "../contrats/index.js";
import { normaliser, versBase64 } from "../connaissances/vecteurs.js";
import { extraireDocument, texteNormalise, type Passage } from "../connaissances/extraction/index.js";
import { MODELE_BGE_M3, verifierModele } from "../connaissances/vectoriseur-local.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { creerStockConnaissances, type LigneDocument, type LigneIndex, type LigneVersion, type StockConnaissances } from "./base-connaissances.js";
import { CacheVecteurs, dateDuJourBruxelles, empreinteAttendue, rechercherConnaissances } from "./connaissances/recherche.js";
import { creerVectoriseurAucun, creerVectoriseurLocal, creerVectoriseurVoyage, type Vectoriseur } from "./connaissances/vectorisation.js";
import { erreur, erreurValidation } from "./erreurs.js";
import type { ModeEffectif } from "./regles-donnees-demo.js";
import { aRevoir, dateRevue, marquerPassages, pseudonymiser, refusDonneesSante, remplacerVersion, statutEffectif, type VersionPourValidite } from "./regles-connaissances.js";

type Issue = NonNullable<Awaited<ReturnType<PluginContext["issues"]["get"]>>>;

export interface DependancesConnaissances {
  ctx: PluginContext;
  base: BaseAtelier;
  /** Tests : stock en mémoire ; par défaut, la base du plugin (`ctx.db`). */
  stock?: StockConnaissances;
  tache(companyId: string, issueId: string): Promise<Issue>;
  campagneDeTache(companyId: string, issue: Issue): Promise<{ id: string; mode: "demonstration" | "reel" } | null>;
  modeEffectif(companyId: string, campagne: { mode: "demonstration" | "reel" } | null): Promise<ModeEffectif>;
  configEntreprise(companyId: string): Promise<Record<string, unknown>>;
  /** Une nouvelle source rattachée à une tâche périme ses évaluations (comme `tache.donnees.deposer`). */
  apresEntreeTache(companyId: string, issueId: string): Promise<void>;
  /** Tests : vectoriseur imposé (sinon : configuration `connaissancesVectorisation`). */
  vectoriseur?: (companyId: string) => Promise<Vectoriseur>;
  /** Tests : dossier du corpus de démonstration. */
  dossierDemo?: string;
  maintenant?: () => Date;
}

/** Entrées de la porte pour les connaissances (lot R7) ; absentes, la règle ne s'applique pas. */
export interface EntreesConnaissancesPorte {
  livrable: string;
  passagesRendus: string[];
  versions: VersionPourValidite[];
  date: string;
}

export interface ServicesConnaissances {
  routes: Partial<Record<CleRouteApi, GestionnaireRoute>>;
  entreesPorte(companyId: string, issueId: string, livrable: { corps: string } | null): Promise<EntreesConnaissancesPorte | undefined>;
  /** Garde-fous de vérité : titres (sans doublon) des documents dont un passage répond à la question, sans aucune trace. */
  rechercherTitres(companyId: string, mode: "demonstration" | "reel", question: string): Promise<string[]>;
  /** Garde-fous de vérité : documents en vigueur, sans contenu. */
  titresEnVigueur(companyId: string): Promise<Array<{ documentId: string; titre: string; type: string; produit: string | null; statut: string; valideAu: string | null }>>;
}

/** Métadonnées d'un fichier à importer (après validation de l'entrée). */
interface Meta {
  nomFichier: string;
  format: FormatDocumentConnaissance;
  titre: string;
  type: TypeDocumentConnaissance;
  produit: string | null;
  langue: "fr" | "nl";
  dateDocument: string;
  valideDu: string;
  valideAu: string | null;
  documentId?: string;
  pseudonymiser: boolean;
  /** Démonstration : statut définitif de l'en-tête (`retire`, `perime`). */
  statutForce?: "retire" | "perime";
}

const RAPPORT_VIDE: RapportPseudonymisation = { courriels: 0, telephones: 0, iban: 0, registreNational: 0, numerosPolice: 0 };
const NOM_EXTRACTION: Record<FormatDocumentConnaissance, string> = {
  pdf: "document.pdf", docx: "document.docx", xlsx: "document.xlsx", markdown: "document.md", texte: "document.txt", html: "document.html",
  // L'extraction ne connaît pas le CSV : il est lu comme du texte (une ligne par enregistrement).
  csv: "document.txt",
};

/**
 * Stock de la base du plugin, créé au premier usage. Sans `ctx.db` (bancs de test des autres lots, qui
 * ne déclarent pas de base), la base de connaissances est VIDE : aucune lecture ne rend rien, toute
 * écriture échoue explicitement. En production, l'hôte fournit toujours `ctx.db`.
 */
function stockParDefaut(ctx: PluginContext): StockConnaissances {
  let reel: StockConnaissances | null = null;
  const vide: StockConnaissances = {
    executer: async () => [],
    lireDocument: async () => null, listerDocuments: async () => [], listerVersions: async () => [], passagesContenant: async () => [],
    compterPassages: async () => 0, indexActif: async () => null, adressesRendues: async () => [], tachesCitant: async () => [], compterSourcesDocument: async () => 0,
    supprimerDocument: async () => 0, supprimerPassages: async () => 0,
    insererDocument: indisponible, insererVersion: indisponible, majVersion: indisponible, insererPassage: indisponible, activerVersion: indisponible,
    creerIndex: indisponible, ajouterPassagesIndex: indisponible, insererSource: indisponible,
  };
  async function indisponible(): Promise<never> {
    erreur("erreur_interne", "Base du plugin indisponible : connaissances non enregistrables.");
  }
  return new Proxy(vide, {
    get(cible, cle) {
      if (!(ctx as { db?: unknown }).db) return cible[cle as keyof StockConnaissances];
      reel ??= creerStockConnaissances(ctx.db);
      return reel[cle as keyof StockConnaissances];
    },
  });
}

export function creerConnaissances(d: DependancesConnaissances): ServicesConnaissances {
  const { ctx, base } = d;
  const stock = d.stock ?? stockParDefaut(ctx);
  const cache = new CacheVecteurs();
  const maintenant = () => (d.maintenant ? d.maintenant() : new Date());
  const aujourdhui = () => dateDuJourBruxelles(maintenant());
  const files = new Map<string, Promise<unknown>>();
  let vectoriseurLocal: { dossier: string; v: Vectoriseur } | null = null;
  /** Entreprises pour lesquelles « local » a été lu au moins une fois (avertir d'un repli ultérieur). */
  const localDemande = new Set<string>();

  /** Indexations d'une entreprise l'une après l'autre (tâche de fond). */
  function enFile(companyId: string, travail: () => Promise<void>): Promise<void> {
    const suite = (files.get(companyId) ?? Promise.resolve()).catch(() => undefined).then(travail);
    files.set(companyId, suite.catch(() => undefined));
    return suite;
  }

  /* ---------------- vectorisation (configuration de l'instance) ---------------- */

  async function vectoriseurPour(companyId: string): Promise<Vectoriseur> {
    if (d.vectoriseur) return d.vectoriseur(companyId);
    const config = await d.configEntreprise(companyId);
    const choix = config.connaissancesVectorisation;
    if (choix === "local") {
      localDemande.add(companyId);
      // Modèle épinglé dans `plugin-atelier/.modeles` (le worker est `plugin-atelier/dist/worker.js`).
      const dossier = fileURLToPath(new URL("../.modeles", import.meta.url));
      if (vectoriseurLocal?.dossier !== dossier) {
        // L'index enregistre l'empreinte GLOBALE des fichiers du modèle (64 hexadécimaux, contrainte de la
        // migration 008) ; le vectoriseur local s'identifie par « modèle@révision:q8 ». On l'aligne ici sur
        // l'empreinte vérifiée des fichiers, pour que `verifierEmpreinteIndex` compare la même chose.
        const empreinte = await verifierModele(dossier);
        const brut = creerVectoriseurLocal({ dossierModeles: dossier });
        vectoriseurLocal = {
          dossier,
          v: { type: "local", empreinte, dimension: brut.dimension, vectoriser: (t, u) => brut.vectoriser(t, u), arreter: () => brut.arreter() },
        };
      }
      return vectoriseurLocal.v;
    }
    if (choix === "voyage") {
      if (config.connaissancesVoyageAccord !== true) {
        ctx.logger.warn("Voyage AI choisi sans l'accord écrit du client coché : recherche plein texte seulement", { companyId });
        return creerVectoriseurAucun();
      }
      const ref = config.connaissancesVoyageCle;
      const modele = "voyage-4";
      // La clé est résolue ICI, pendant la requête : l'indexation de fond tourne après la réponse 202, quand
      // `secrets.resolve` est refusé par l'hôte (portée d'invocation expirée). Un échec est gardé et relancé
      // au moment de vectoriser (même message qu'avant quand la clé manque), jamais remplacé par un repli.
      const resolue: { valeur: string } | { erreur: unknown } = await (async () => {
        try {
          if (!ref || typeof ref !== "object") throw new Error("Clé Voyage AI absente de la configuration (secret natif « connaissancesVoyageCle »).");
          return { valeur: await ctx.secrets.resolve(ref as never, { companyId, configPath: "connaissancesVoyageCle" } as never) };
        } catch (erreur) {
          return { erreur };
        }
      })();
      return creerVectoriseurVoyage({
        autorise: true,
        modele,
        cle: async () => {
          if ("erreur" in resolue) throw resolue.erreur;
          return resolue.valeur;
        },
      });
    }
    // Jamais de repli silencieux : une valeur inconnue, ou « local » déjà vu puis une configuration
    // illisible (lecture refusée par l'hôte, rendue vide par `configEntreprise`), est signalée.
    if (choix !== undefined && choix !== null && choix !== "aucun") {
      ctx.logger.warn("Valeur de connaissancesVectorisation inconnue : vectorisation désactivée (recherche plein texte seulement)", { companyId, valeur: String(choix).slice(0, 40) });
    } else if (choix === undefined && localDemande.has(companyId)) {
      ctx.logger.warn("Vectorisation « local » demandée, mais la configuration de l'entreprise est illisible ou vide : repli sur « aucun » (recherche plein texte seulement)", { companyId });
    }
    return creerVectoriseurAucun();
  }

  /** Index actif compatible avec le vectoriseur, créé au premier besoin ; null : pas de vecteurs. */
  async function indexPour(companyId: string, v: Vectoriseur): Promise<LigneIndex | null> {
    if (v.type === "aucun") return null;
    const actuel = await stock.indexActif(companyId);
    if (actuel) {
      const attendu = empreinteAttendue({ id: actuel.id, fournisseur: actuel.fournisseur, modele: actuel.modele, empreinteModele: actuel.empreinteModele, dimension: actuel.dimension, versionIndex: actuel.versionIndex });
      if (attendu === v.empreinte) return actuel;
      ctx.logger.warn("Modèle de vectorisation différent de l'index actif : passages indexés en plein texte seulement (réindexation à prévoir)", { companyId });
      return null;
    }
    const nouvel = {
      id: randomUUID(), companyId, fournisseur: v.type, versionIndex: 1, dimension: v.dimension,
      modele: v.type === "local" ? MODELE_BGE_M3.id : (v.empreinte ?? "voyage").split(":")[1] ?? "voyage",
      revision: v.type === "local" ? MODELE_BGE_M3.revision : null,
      empreinteModele: v.type === "local" ? v.empreinte : null,
    };
    await stock.creerIndex(nouvel);
    return { ...nouvel, actif: true, passagesIndexes: 0, creeLe: maintenant().toISOString() };
  }

  /* ---------------- pseudonymisation ---------------- */

  async function clePseudonymes(companyId: string, reel: boolean): Promise<string> {
    const ref = (await d.configEntreprise(companyId)).donneesCleHmac;
    if (ref && typeof ref === "object" && (ref as { type?: unknown }).type === "secret_ref") {
      try {
        const valeur = await ctx.secrets.resolve(ref as never, { companyId, configPath: "donneesCleHmac" } as never);
        if (typeof valeur === "string" && valeur.length >= 16) return valeur;
      } catch {
        // Message sans valeur secrète : traité ci-dessous.
      }
    }
    if (reel) erreur("import_refuse", "Pseudonymisation impossible : la clé des empreintes (secret « donneesCleHmac » de la configuration du plugin) est absente ou illisible.");
    return createHash("sha256").update(`atelier-demonstration-pseudonymes:${companyId.toLowerCase()}`).digest("hex");
  }

  /* ---------------- vues ---------------- */

  function vueVersion(v: LigneVersion): VersionConnaissance {
    return VersionConnaissance.parse({
      id: v.id, companyId: v.companyId, documentId: v.documentId, version: v.version, nomFichier: v.nomFichier, format: v.format, tailleOctets: v.tailleOctets,
      empreinte: v.empreinte, pages: v.pages, dateDocument: v.dateDocument, valideDu: v.valideDu, valideAu: v.valideAu, statut: statutEffectif(v, aujourdhui()),
      remplaceVersion: v.remplaceVersion, revuePrevueLe: v.revuePrevueLe, pseudonymise: v.pseudonymise, pseudonymisation: v.pseudonymise ? { ...RAPPORT_VIDE, ...(v.pseudonymisation ?? {}) } : null,
      injectionsSignalees: v.injectionsSignalees.slice(0, 20).map((s) => s.slice(0, 300)), etatIndexation: v.etatIndexation, motifRefus: v.motifRefus, passages: v.passages,
      active: v.active, mode: v.mode, importePar: v.importePar, importeLe: v.importeLe,
    });
  }

  function vueDocument(doc: LigneDocument, versions: readonly LigneVersion[]): DocumentConnaissance {
    return DocumentConnaissance.parse({
      id: doc.id, companyId: doc.companyId, titre: doc.titre, type: doc.type, produit: doc.produit, langue: doc.langue,
      versionActive: versions.find((v) => v.active)?.version ?? null, mode: doc.mode, creeLe: doc.creeLe, creePar: doc.creePar,
    });
  }

  /* ---------------- import ---------------- */

  /**
   * Ce qui demande l'hôte (configuration, secrets), résolu PENDANT la requête : l'indexation de fond
   * tourne après la réponse 202, quand la portée d'invocation de l'hôte a expiré (`config.get` et
   * `secrets.resolve` y sont refusés : « missing, expired, or unknown invocation scope »).
   */
  interface Preparation {
    v: Vectoriseur;
    cle: { valeur: string } | { erreur: unknown } | null;
  }

  /** Extraction, pseudonymisation, passages, vecteurs, activation ; la version passe à `indexe` ou `refuse`. */
  async function indexer(companyId: string, doc: LigneDocument, version: LigneVersion, octets: Uint8Array, meta: Meta, ancienne: LigneVersion | null, prep: Preparation): Promise<LigneVersion> {
    try {
      await stock.majVersion(companyId, version.id, { etatIndexation: "en_cours" });
      const extrait = await extraireDocument({ nom: NOM_EXTRACTION[meta.format], contenu: octets }, { limites: { octetsMax: LIMITES_CONNAISSANCES.importTailleMaxOctets } });
      let passages: Passage[] = extrait.passages.filter((p) => p.texte.trim() !== "");
      if (passages.length === 0) throw new Error("Aucun passage exploitable dans le document.");
      let rapport: RapportPseudonymisation | null = null;
      if (meta.pseudonymiser) {
        if (!prep.cle) throw new Error("Clé de pseudonymisation non préparée.");
        if ("erreur" in prep.cle) throw prep.cle.erreur;
        const cle = prep.cle.valeur;
        rapport = { ...RAPPORT_VIDE };
        passages = passages.map((p) => {
          const r = pseudonymiser(p.texte, { cle });
          for (const k of Object.keys(rapport!) as Array<keyof RapportPseudonymisation>) rapport![k] += r.rapport[k];
          return { ...p, texte: r.texte, texte_normalise: texteNormalise(r.texte) };
        });
      }
      const v = prep.v;
      const index = await indexPour(companyId, v);
      let vecteurs: Array<string | null> = passages.map(() => null);
      if (index) {
        const bruts = await v.vectoriser(passages.map((p) => p.texte), "document");
        vecteurs = bruts.map((b) => versBase64(normaliser(b)));
      }
      const injections = new Set(extrait.signalements);
      for (const [i, p] of passages.entries()) {
        for (const s of p.consignes_cachees) injections.add(s);
        const section = [doc.titre, p.titre_section].filter((x): x is string => typeof x === "string" && x.trim() !== "").join(" › ").slice(0, 500);
        await stock.insererPassage({
          id: randomUUID(), companyId, documentId: doc.id, versionId: version.id, version: version.version, ordre: i,
          texte: p.texte.slice(0, LIMITES_CONNAISSANCES.passageTexteMax), texteNormalise: (p.texte_normalise || texteNormalise(p.texte)).slice(0, LIMITES_CONNAISSANCES.passageTexteMax),
          langue: p.langue === "nl" ? "nl" : p.langue === "fr" ? "fr" : doc.langue, page: p.page !== null && p.page > 0 ? p.page : null, section: section || null,
          empreinte: createHash("sha256").update(p.texte).digest("hex"), injectionsSignalees: p.consignes_cachees.slice(0, 20).map((s) => s.slice(0, 300)),
          indexId: index && vecteurs[i] ? index.id : null, vecteurBase64: index ? vecteurs[i] ?? null : null,
        });
      }
      if (index) await stock.ajouterPassagesIndex(companyId, index.id, passages.length);
      await stock.majVersion(companyId, version.id, { injectionsSignalees: [...injections].slice(0, 20).map((s) => s.slice(0, 300)), ...(rapport ? { pseudonymisation: rapport } : {}) });
      // Remplacement : l'ancienne version voit sa validité close au début de la nouvelle (§5.4).
      if (ancienne) {
        const r = remplacerVersion(ancienne, { documentId: doc.id, version: version.version, statut: version.statut, valideDu: version.valideDu, valideAu: version.valideAu, remplaceVersion: ancienne.version }, aujourdhui());
        await stock.majVersion(companyId, ancienne.id, { valideAu: r.valideAu, statut: r.statut });
      }
      await stock.activerVersion(companyId, doc.id, version.id, passages.length);
      cache.invalider(companyId);
      await base.journaliser({
        companyId, type: "connaissance.indexee", entite: "connaissance", entiteId: doc.id, acteur: version.importePar,
        donnees: { version: version.version, passages: passages.length, vecteurs: index !== null, injections: injections.size, pseudonymise: meta.pseudonymiser },
      });
      return { ...version, etatIndexation: "indexe", passages: passages.length, active: true, injectionsSignalees: [...injections], pseudonymisation: rapport ?? version.pseudonymisation };
    } catch (err) {
      const motif = (err instanceof Error ? err.message : "Indexation impossible.").slice(0, 500);
      await stock.majVersion(companyId, version.id, { etatIndexation: "refuse", motifRefus: motif });
      await base.journaliser({ companyId, type: "connaissance.refusee", entite: "connaissance", entiteId: doc.id, acteur: version.importePar, donnees: { version: version.version, motif } });
      return { ...version, etatIndexation: "refuse", motifRefus: motif };
    }
  }

  async function importer(companyId: string, acteur: ActeurHote, meta: Meta, octets: Uint8Array): Promise<{ statut: number; corps: unknown }> {
    if (octets.byteLength === 0) erreur("import_refuse", "Fichier vide.");
    if (octets.byteLength > LIMITES_CONNAISSANCES.importTailleMaxOctets) erreur("import_refuse", `Fichier de ${(octets.byteLength / 1_048_576).toFixed(1)} Mo : la limite est de 7 Mo.`);
    const sante = refusDonneesSante({ type: meta.type, titre: meta.titre });
    if (sante.refus) {
      await base.journaliser({ companyId, type: "connaissance.refusee", entite: "connaissance", entiteId: meta.documentId ?? "nouveau", acteur: acteur.id, donnees: { motif: sante.motif, titre: meta.titre } });
      erreur("import_refuse", sante.motif ?? "Données de santé : import refusé.");
    }
    const mode = (await d.modeEffectif(companyId, null)).mode;
    let doc: LigneDocument;
    let precedentes: LigneVersion[] = [];
    if (meta.documentId) {
      const existant = await stock.lireDocument(companyId, meta.documentId);
      if (!existant) erreur("introuvable", "Document introuvable dans cette entreprise.");
      if (existant.type !== meta.type) erreur("entree_invalide", `Une nouvelle version garde le type du document (« ${existant.type} »).`);
      doc = existant;
      precedentes = await stock.listerVersions(companyId, [doc.id]);
    } else {
      doc = { id: randomUUID(), companyId, titre: meta.titre, type: meta.type, produit: meta.produit, langue: meta.langue, mode, creePar: acteur.id, creeLe: maintenant().toISOString() };
      await stock.insererDocument(doc);
    }
    const ancienne = precedentes.find((v) => v.active) ?? null;
    const numero = precedentes.reduce((m, v) => Math.max(m, v.version), 0) + 1;
    const statutDates = statutEffectif({ statut: "en_vigueur", valideDu: meta.valideDu, valideAu: meta.valideAu }, aujourdhui());
    const version: LigneVersion = {
      id: randomUUID(), companyId, documentId: doc.id, version: numero, nomFichier: meta.nomFichier, format: meta.format, tailleOctets: octets.byteLength,
      empreinte: createHash("sha256").update(octets).digest("hex"), pages: null, dateDocument: meta.dateDocument, valideDu: meta.valideDu, valideAu: meta.valideAu,
      statut: meta.statutForce ?? statutDates, remplaceVersion: ancienne ? ancienne.version : null,
      revuePrevueLe: dateRevue({ dateDocument: meta.dateDocument }, meta.type), pseudonymise: false, pseudonymisation: null, injectionsSignalees: [],
      etatIndexation: "en_file", motifRefus: null, passages: 0, active: false, mode, importePar: acteur.id, importeLe: maintenant().toISOString(),
    };
    // Le rapport de pseudonymisation n'est connu qu'après l'extraction : la version est écrite marquée
    // « pseudonymisée » d'emblée (contrainte de la migration : rapport ⇔ drapeau), compteurs complétés ensuite.
    if (meta.pseudonymiser) Object.assign(version, { pseudonymise: true, pseudonymisation: { ...RAPPORT_VIDE } });
    await stock.insererVersion(version);
    await base.journaliser({
      companyId, type: "connaissance.importee", entite: "connaissance", entiteId: doc.id, acteur: acteur.id,
      donnees: { version: numero, format: meta.format, taille: octets.byteLength, empreinte: version.empreinte, pseudonymiser: meta.pseudonymiser },
    });

    const v = await vectoriseurPour(doc.companyId);
    const prep: Preparation = {
      v,
      cle: meta.pseudonymiser
        ? await clePseudonymes(companyId, mode === "reel").then((valeur) => ({ valeur }), (erreur: unknown) => ({ erreur }))
        : null,
    };
    if (v.type !== "aucun") {
      // Avec un modèle : indexation en tâche de fond, état visible (« en file », puis « indexé » ou « refusé »).
      void enFile(companyId, async () => {
        await indexer(companyId, doc, version, octets, meta, ancienne, prep);
      });
      return { statut: 202, corps: { document: vueDocument(doc, precedentes), version: vueVersion(version), pseudonymisation: null } };
    }
    let finale: LigneVersion = version;
    await enFile(companyId, async () => {
      finale = await indexer(companyId, doc, version, octets, meta, ancienne, prep);
    });
    const pseudo = finale.pseudonymise ? (finale.pseudonymisation as RapportPseudonymisation | null) : null;
    const versions = await stock.listerVersions(companyId, [doc.id]);
    const relue = versions.find((x) => x.id === version.id) ?? finale;
    return {
      statut: finale.etatIndexation === "refuse" ? 422 : 201,
      corps: { document: vueDocument(doc, versions), version: vueVersion({ ...relue, pseudonymisation: pseudo ?? relue.pseudonymisation }), pseudonymisation: pseudo },
    };
  }

  /* ---------------- porte ---------------- */

  /**
   * Tâches dont les recherches valent pour le livrable : la tâche elle-même, sa tâche mère (cadrage, brief) et ses
   * sous-tâches directes (revues). Un passage repris d'un verdict de relecture a donc bien été rendu par une
   * recherche de la mission ; un passage jamais rendu reste refusé. Lecture en échec : la tâche seule.
   */
  async function tachesDeLaMission(companyId: string, issueId: string): Promise<string[]> {
    const ids = new Set<string>([issueId]);
    try {
      const tache = await d.ctx.issues.get(issueId, companyId);
      if (tache?.parentId) ids.add(tache.parentId);
      const toutes = await d.ctx.issues.list({ companyId, includePluginOperations: true, limit: 500 } as never);
      for (const i of toutes) if (i.parentId === issueId) ids.add(i.id);
    } catch {
      /* la tâche seule */
    }
    return [...ids];
  }

  async function entreesPorte(companyId: string, issueId: string, livrable: { corps: string } | null): Promise<EntreesConnaissancesPorte | undefined> {
    if (!livrable) return undefined;
    const adresses = [...new Set((await Promise.all((await tachesDeLaMission(companyId, issueId)).map((id) => stock.adressesRendues(companyId, id)))).flat())];
    // La règle s'applique dès que la tâche a reçu des passages, que le livrable cite une adresse
    // `connaissance://`, ou que l'entreprise a des connaissances indexées (chiffres d'offre à sourcer).
    const actif = adresses.length > 0 || /connaissance:\/\//iu.test(livrable.corps) || (await stock.compterPassages(companyId)) > 0;
    if (!actif) return undefined;
    const ids = [...new Set(adresses.map((a) => lireAdresseConnaissance(a)?.documentId).filter((x): x is string => typeof x === "string"))];
    const versions = (await stock.listerVersions(companyId, ids)).map((v) => ({ documentId: v.documentId, version: v.version, statut: v.statut, valideDu: v.valideDu, valideAu: v.valideAu }));
    return { livrable: livrable.corps, passagesRendus: adresses, versions, date: aujourdhui() };
  }

  /* ---------------- corpus de démonstration ---------------- */

  function dossierDemo(): string | null {
    if (d.dossierDemo) return d.dossierDemo;
    const departs = [process.cwd(), path.dirname(fileURLToPath(import.meta.url))];
    for (const depart of departs) {
      let dossier = depart;
      for (let i = 0; i < 8; i++) {
        const candidat = path.join(dossier, "organisation", "demo", "connaissances");
        if (existsSync(candidat) && statSync(candidat).isDirectory()) return candidat;
        const parent = path.dirname(dossier);
        if (parent === dossier) break;
        dossier = parent;
      }
    }
    return null;
  }

  /** En-tête YAML simple (`clé: valeur`) d'un fichier Markdown du corpus ; rend aussi le corps sans l'en-tête. */
  function enTete(texte: string): { champs: Record<string, string>; corps: string } {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u.exec(texte);
    if (!m) return { champs: {}, corps: texte };
    const champs: Record<string, string> = {};
    for (const ligne of m[1]!.split(/\r?\n/u)) {
      const c = /^([a-z_]+):\s*(.*)$/u.exec(ligne.trim());
      if (c) champs[c[1]!] = c[2]!.trim().replace(/^"(.*)"$/u, "$1");
    }
    return { champs, corps: texte.slice(m[0].length) };
  }

  /** Les .csv du corpus n'ont pas d'en-tête : métadonnées du LISEZ-MOI. */
  const META_CSV: Record<string, { titre: string; produit: string | null }> = {
    "grille-franchises-plafonds-2026.csv": { titre: "Grille des franchises et plafonds 2026 (démonstration)", produit: null },
    "remises-flotte-2026.csv": { titre: "Remises de flotte 2026 (démonstration)", produit: "flotte_automobile" },
  };

  function metaDemo(fichier: string, texte: string): { meta: Meta; octets: Uint8Array } {
    const jourValide = (v: string | undefined, defaut: string) => (v && /^\d{4}-\d{2}-\d{2}$/u.test(v) ? v : defaut);
    if (fichier.endsWith(".csv")) {
      const c = META_CSV[fichier] ?? { titre: `${fichier} (démonstration)`, produit: null };
      return {
        meta: { nomFichier: fichier, format: "csv", titre: c.titre, type: "tarif", produit: c.produit, langue: "fr", dateDocument: "2026-01-01", valideDu: "2026-01-01", valideAu: null, pseudonymiser: false },
        octets: new TextEncoder().encode(texte),
      };
    }
    const { champs, corps } = enTete(texte);
    const type = TypeDocumentConnaissance.safeParse(champs.type).success ? (champs.type as TypeDocumentConnaissance) : "autre";
    const dateDocument = jourValide(champs.date_document, "2026-01-01");
    const valideDu = jourValide(champs.valide_du, dateDocument);
    const valideAu = champs.valide_au && /^\d{4}-\d{2}-\d{2}$/u.test(champs.valide_au) && champs.valide_au > valideDu ? champs.valide_au : null;
    const statut = champs.statut === "retire" || champs.statut === "perime" ? champs.statut : undefined;
    return {
      meta: {
        nomFichier: fichier, format: "markdown", titre: (champs.titre || fichier).slice(0, LIMITES_CONNAISSANCES.titreMax), type,
        produit: champs.produit ? champs.produit.slice(0, 120) : null, langue: champs.langue === "nl" ? "nl" : "fr",
        dateDocument, valideDu, valideAu, pseudonymiser: pseudonymisationDemandee({ type }), ...(statut ? { statutForce: statut } : {}),
      },
      octets: new TextEncoder().encode(corps),
    };
  }

  /* ---------------- routes ---------------- */

  function exigerHumain(acteur: ActeurHote, quoi: string) {
    if (acteur.type !== "humain") erreur("elevation_refusee", `${quoi} est réservé à un humain.`);
  }

  function memeEntreprise(corps: unknown, companyId: string) {
    const c = (corps as { companyId?: unknown } | null)?.companyId;
    if (typeof c === "string" && c.toLowerCase() !== companyId.toLowerCase()) erreur("hors_entreprise", "Le corps désigne une autre entreprise que celle de la route.");
  }

  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  routes["connaissances.importer"] = async (r) => {
    exigerHumain(r.acteur, "L'import de connaissances");
    memeEntreprise(r.corps, r.companyId);
    const p = ImporterConnaissanceEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Import de connaissance", p.error.issues);
    const e = p.data;
    const octets = Buffer.from(e.contenuBase64, "base64");
    return importer(r.companyId, r.acteur, {
      nomFichier: e.nomFichier, format: e.format, titre: e.titre, type: e.type, produit: e.produit, langue: e.langue, dateDocument: e.dateDocument,
      valideDu: e.valideDu, valideAu: e.valideAu, ...(e.documentId ? { documentId: e.documentId } : {}), pseudonymiser: pseudonymisationDemandee(e),
    }, new Uint8Array(octets));
  };

  routes["connaissances.importer-demo"] = async (r) => {
    exigerHumain(r.acteur, "L'import du corpus de démonstration");
    memeEntreprise(r.corps, r.companyId);
    if ((await d.modeEffectif(r.companyId, null)).mode === "reel") erreur("conflit", "Entreprise en mode réel : le corpus de démonstration n'y est jamais importé.");
    const dossier = dossierDemo();
    if (!dossier) erreur("introuvable", "Corpus de démonstration introuvable (organisation/demo/connaissances/).");
    const deja = new Set((await stock.listerVersions(r.companyId)).map((v) => v.empreinte));
    const importes: Array<{ fichier: string; documentId: string; version: number; passages: number; etat: string; statut: string }> = [];
    const refuses: Array<{ fichier: string; motif: string }> = [];
    const dejaImportes: string[] = [];
    const fichiers = readdirSync(dossier).filter((f) => /\.(md|csv)$/u.test(f) && f !== "LISEZ-MOI.md").sort();
    for (const fichier of fichiers) {
      const { meta, octets } = metaDemo(fichier, readFileSync(path.join(dossier, fichier), "utf8"));
      if (deja.has(createHash("sha256").update(octets).digest("hex"))) {
        dejaImportes.push(fichier);
        continue;
      }
      try {
        const res = await importer(r.companyId, r.acteur, meta, octets);
        const c = res.corps as { document: DocumentConnaissance; version: VersionConnaissance };
        if (c.version.etatIndexation === "refuse") refuses.push({ fichier, motif: c.version.motifRefus ?? "refusé" });
        else importes.push({ fichier, documentId: c.document.id, version: c.version.version, passages: c.version.passages, etat: c.version.etatIndexation, statut: c.version.statut });
      } catch (err) {
        refuses.push({ fichier, motif: err instanceof Error ? err.message : "refusé" });
      }
    }
    return { statut: 200, corps: { dossier: path.basename(dossier), importes, refuses, dejaImportes } };
  };

  routes["connaissances.lister"] = async (r) => {
    exigerHumain(r.acteur, "La liste des connaissances");
    const liste = (v: string | string[] | undefined) => (v === undefined ? undefined : (Array.isArray(v) ? v : v.split(",")).map((x) => x.trim()).filter(Boolean));
    const brut = {
      companyId: r.companyId,
      ...(r.query.types !== undefined ? { types: liste(r.query.types) } : {}),
      ...(r.query.statuts !== undefined ? { statuts: liste(r.query.statuts) } : {}),
      ...(r.query.aRevoir !== undefined ? { aRevoir: String(r.query.aRevoir) === "true" } : {}),
      ...(r.query.page !== undefined ? { page: Number(r.query.page) } : {}),
      ...(r.query.parPage !== undefined ? { parPage: Number(r.query.parPage) } : {}),
    };
    const p = ListerConnaissancesEntree.safeParse(brut);
    if (!p.success) erreurValidation("Liste des connaissances", p.error.issues);
    const f = p.data;
    const [docs, versions] = await Promise.all([stock.listerDocuments(r.companyId), stock.listerVersions(r.companyId)]);
    const date = aujourdhui();
    const lignes = docs
      .filter((doc) => !f.types || f.types.includes(doc.type as TypeDocumentConnaissance))
      .map((doc) => {
        const siennes = versions.filter((v) => v.documentId === doc.id);
        const derniere = siennes.reduce<LigneVersion | null>((m, v) => (m === null || v.version > m.version ? v : m), null);
        return { document: vueDocument(doc, siennes), derniereVersion: derniere ? vueVersion(derniere) : null, versions: siennes.length, aRevoir: derniere ? aRevoir(derniere, date) : false };
      })
      .filter((l) => !f.statuts || (l.derniereVersion !== null && f.statuts.includes(l.derniereVersion.statut)))
      .filter((l) => f.aRevoir === undefined || l.aRevoir === f.aRevoir);
    return { corps: { total: lignes.length, page: f.page, parPage: f.parPage, lignes: lignes.slice((f.page - 1) * f.parPage, f.page * f.parPage) } };
  };

  routes["connaissances.statut"] = async (r) => {
    exigerHumain(r.acteur, "L'état des connaissances");
    const [index, docs, versions, passages] = await Promise.all([stock.indexActif(r.companyId), stock.listerDocuments(r.companyId), stock.listerVersions(r.companyId), stock.compterPassages(r.companyId)]);
    const date = aujourdhui();
    const dernieres = docs.map((doc) => versions.filter((v) => v.documentId === doc.id).reduce<LigneVersion | null>((m, v) => (m === null || v.version > m.version ? v : m), null));
    return {
      corps: StatutConnaissances.parse({
        companyId: r.companyId, index, documents: docs.length, passages,
        enFile: versions.filter((v) => v.etatIndexation === "en_file" || v.etatIndexation === "en_cours").length,
        refuses: versions.filter((v) => v.etatIndexation === "refuse").length,
        aRevoir: dernieres.filter((v): v is LigneVersion => v !== null && aRevoir(v, date)).length,
      }),
    };
  };

  routes["connaissances.supprimer"] = async (r) => {
    exigerHumain(r.acteur, "La suppression de connaissances");
    memeEntreprise(r.corps, r.companyId);
    const p = SupprimerConnaissanceEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Suppression de connaissances", p.error.issues);
    const e = p.data;
    if (e.portee.type === "document") {
      // Suppression réelle : atteint aussi un document à la corbeille (purge, ou suppression directe).
      const doc = await stock.lireDocument(r.companyId, e.portee.documentId, { corbeille: true });
      if (!doc) erreur("introuvable", "Document introuvable dans cette entreprise.");
      const [versions, sources, taches] = await Promise.all([
        stock.listerVersions(r.companyId, [doc.id]), stock.compterSourcesDocument(r.companyId, doc.id), stock.tachesCitant(r.companyId, doc.id),
      ]);
      await stock.supprimerDocument(r.companyId, doc.id);
      cache.invalider(r.companyId);
      for (const issueId of taches) await d.apresEntreeTache(r.companyId, issueId);
      const supprime = { documentId: doc.id, titre: doc.titre, versions: versions.length, passages: versions.reduce((s, v) => s + v.passages, 0), sources };
      await base.journaliser({ companyId: r.companyId, type: "connaissance.supprimee", entite: "connaissance", entiteId: doc.id, acteur: r.acteur.id, donnees: { ...supprime, motif: e.motif } });
      return { corps: { portee: "document", supprime } };
    }
    const cible = e.portee.identifiant.toLowerCase();
    const trouves = await stock.passagesContenant(r.companyId, cible);
    const empreinteCible = createHash("sha256").update(cible).digest("hex");
    if (!e.portee.confirmer) {
      return { corps: { portee: "personne", confirme: false, passages: trouves.map((t) => ({ id: t.id, documentId: t.documentId, version: t.version, extrait: t.texte.slice(0, 200) })) } };
    }
    const n = await stock.supprimerPassages(r.companyId, trouves.map((t) => t.id));
    cache.invalider(r.companyId);
    await base.journaliser({
      companyId: r.companyId, type: "connaissance.personne.purgee", entite: "connaissance", entiteId: empreinteCible.slice(0, 16), acteur: r.acteur.id,
      donnees: { passages: n, documents: [...new Set(trouves.map((t) => t.documentId))], motif: e.motif, empreinte: empreinteCible },
    });
    return { corps: { portee: "personne", confirme: true, passagesSupprimes: n } };
  };

  routes["tache.connaissances.rechercher"] = async (r) => {
    const issue = await d.tache(r.companyId, r.params.issueId ?? "");
    const campagne = await d.campagneDeTache(r.companyId, issue);
    const mode = (await d.modeEffectif(r.companyId, campagne)).mode;
    let resultat;
    try {
      resultat = await rechercherConnaissances({ executer: stock.executer, vectoriseur: await vectoriseurPour(r.companyId), cache, maintenant }, { companyId: r.companyId, mode }, r.corps);
    } catch (err) {
      if (err && typeof err === "object" && "issues" in err && Array.isArray((err as { issues: unknown }).issues)) {
        erreurValidation("Recherche de connaissances", (err as { issues: Array<{ path: PropertyKey[]; message: string }> }).issues);
      }
      throw err;
    }
    const sourceIds: string[] = [];
    for (const p of resultat.passages) {
      const adresse = lireAdresseConnaissance(p.citation.adresse);
      if (!adresse) continue;
      const id = randomUUID();
      await stock.insererSource({
        id, companyId: r.companyId, campagneId: campagne?.id ?? null, issueId: issue.id, titre: `${p.citation.titre} (v${p.citation.version})`,
        extrait: p.texte.slice(0, 500), empreinte: p.citation.empreintePassage, injections: p.injectionsSignalees, mode,
        documentId: adresse.documentId, version: adresse.version, passageId: adresse.passageId, adresse: p.citation.adresse,
      });
      sourceIds.push(id);
    }
    if (sourceIds.length > 0) await d.apresEntreeTache(r.companyId, issue.id);
    await base.journaliser({
      companyId: r.companyId, type: "connaissances.recherche", entite: "tache", entiteId: issue.id, issueId: issue.id, runId: r.acteur.runId, acteur: r.acteur.id,
      donnees: { passages: resultat.passages.length, aucuneSource: resultat.aucuneSource, adresses: resultat.passages.map((p) => p.citation.adresse) },
    });
    const valide = ResultatRechercheConnaissances.parse({ ...resultat, sourceIds });
    const marques = marquerPassages(valide.passages);
    return {
      corps: {
        ...valide,
        consigne: marques.consigne,
        passages: marques.passages.map((p, i) => ({ ...p, injectionsSignalees: [...new Set([...valide.passages[i]!.injectionsSignalees, ...p.injectionsSignalees])].slice(0, 20) })),
      },
    };
  };

  async function rechercherTitres(companyId: string, mode: "demonstration" | "reel", question: string): Promise<string[]> {
    const resultat = await rechercherConnaissances({ executer: stock.executer, vectoriseur: await vectoriseurPour(companyId), cache, maintenant }, { companyId, mode }, { question });
    return [...new Set(resultat.passages.map((p) => p.citation.titre))];
  }

  async function titresEnVigueur(companyId: string) {
    const [docs, versions] = await Promise.all([stock.listerDocuments(companyId), stock.listerVersions(companyId)]);
    const date = aujourdhui();
    return docs.flatMap((doc) => {
      const active = versions.find((v) => v.documentId === doc.id && v.active);
      if (!active) return [];
      const statut = statutEffectif(active, date);
      if (statut !== "en_vigueur") return [];
      return [{ documentId: doc.id, titre: doc.titre, type: doc.type, produit: doc.produit, statut, valideAu: active.valideAu }];
    });
  }

  return { routes, entreesPorte, rechercherTitres, titresEnVigueur };
}
