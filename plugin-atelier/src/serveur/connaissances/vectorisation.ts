/**
 * Vectorisation des passages (lot R3, `docs/rag-conception.md` §9 et §13.8).
 *
 * Trois modes derrière la même interface `Vectoriseur` :
 * - `aucun` : plein texte seul, aucun vecteur ;
 * - `local` : `bge-m3` (q8) par ONNX Runtime dans un SOUS-PROCESSUS (`processus-vectoriseur.ts`), arrêté
 *   après une période d'inactivité pour rendre sa mémoire (~1,5 Go) et relancé à la demande ;
 * - `voyage` : API Voyage AI (point d'accès Europe), seulement si le client l'a accepté par écrit
 *   (drapeau `autorise`) ; la clé est un secret natif Paperclip, jamais écrite dans la configuration.
 *
 * Règle d'index : jamais deux modèles dans un même index. Chaque vectoriseur rend une `empreinte`
 * (modèle, révision, quantification, dimension) ; `verifierEmpreinteIndex` refuse tout écart.
 */
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { depuisBase64 } from "../../connaissances/vecteurs.js";
import { MODELE_BGE_M3, verifierModele } from "../../connaissances/vectoriseur-local.js";

export type TypeVectoriseur = "aucun" | "local" | "voyage";
/** Voyage distingue le texte indexé du texte de la requête ; le modèle local les traite pareil. */
export type UsageTexte = "document" | "requete";

export interface Vectoriseur {
  readonly type: TypeVectoriseur;
  /** Identifie le modèle de l'index (`null` pour `aucun`). Deux empreintes différentes = deux index. */
  readonly empreinte: string | null;
  readonly dimension: number;
  vectoriser(textes: string[], usage?: UsageTexte): Promise<Float32Array[]>;
  /** Libère ce qui pèse (sous-processus). Le vectoriseur reste utilisable : il se relance à la demande. */
  arreter(): Promise<void>;
}

/** Un index ne contient les vecteurs que d'un seul modèle : erreur explicite si l'empreinte diffère. */
export function verifierEmpreinteIndex(empreinteIndex: string | null, vectoriseur: Vectoriseur): void {
  if (empreinteIndex === vectoriseur.empreinte) return;
  throw new Error(
    `Modèle de vectorisation différent de celui de l'index : index « ${empreinteIndex ?? "sans vecteurs"} », ` +
      `vectoriseur « ${vectoriseur.empreinte ?? "aucun"} ». Un index ne mélange jamais deux modèles : ` +
      "réindexer entièrement avec le nouveau modèle.",
  );
}

// ---------------------------------------------------------------------------------------------
// Mode « aucun »

export function creerVectoriseurAucun(): Vectoriseur {
  return {
    type: "aucun",
    empreinte: null,
    dimension: 0,
    async vectoriser() {
      throw new Error("Aucune vectorisation configurée : recherche plein texte seulement.");
    },
    async arreter() {},
  };
}

// ---------------------------------------------------------------------------------------------
// Mode « local » : sous-processus

/** Empreinte de l'index pour le modèle local : identifiant, révision et quantification. */
export const EMPREINTE_BGE_M3 = `${MODELE_BGE_M3.id}@${MODELE_BGE_M3.revision}:${MODELE_BGE_M3.dtype}`;

export interface OptionsVectoriseurLocal {
  /** Racine des modèles (contient `Xenova/bge-m3/…`), par exemple `plugin-atelier/.modeles`. */
  dossierModeles: string;
  /** Inactivité avant arrêt du sous-processus. Défaut : 5 minutes. */
  inactiviteMs?: number;
  /** Passages par lot, de 1 à 4 (défaut 4). */
  tailleLot?: number;
  /** Délai maximal du chargement du modèle (défaut 120 s) et d'un lot (défaut 120 s). */
  delaiChargementMs?: number;
  delaiLotMs?: number;
  /** Fils de calcul d'ONNX Runtime (défaut : choix d'ONNX Runtime). */
  threads?: number;
  /** Script du sous-processus (défaut : `processus-vectoriseur.js` à côté du paquet, voir `esbuild.config.mjs`). */
  scriptEnfant?: string;
  /** Vérification des fichiers du modèle avant chaque lancement (défaut : `verifierModele`, SHA-256). */
  verifier?: (dossierModeles: string) => Promise<unknown>;
}

interface Attente {
  resoudre(valeur: Record<string, unknown>): void;
  rejeter(erreur: Error): void;
  minuteur: NodeJS.Timeout;
}

/** Script du sous-processus par défaut, à côté du module courant (`dist/` une fois empaqueté). */
/**
 * Variables d'environnement transmises au sous-processus de vectorisation : le strict nécessaire au
 * démarrage de Node et d'ONNX Runtime. Les secrets du processus parent (clés d'API, jetons, mots de
 * passe de base) ne lui sont jamais transmis.
 */
const VARIABLES_ENFANT = ["PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TZ"] as const;

export function environnementEnfant(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const nom of VARIABLES_ENFANT) if (source[nom] !== undefined) env[nom] = source[nom];
  return env;
}

function scriptEnfantParDefaut(): string {
  const courant = import.meta.url;
  const dansSource = courant.includes("/src/serveur/connaissances/");
  return fileURLToPath(
    new URL(dansSource ? "../../connaissances/processus-vectoriseur.ts" : "./processus-vectoriseur.js", courant),
  );
}

class VectoriseurLocal implements Vectoriseur {
  readonly type = "local" as const;
  readonly empreinte = EMPREINTE_BGE_M3;
  readonly dimension = MODELE_BGE_M3.dimension;

  private enfant: ChildProcess | null = null;
  private demarrage: Promise<ChildProcess> | null = null;
  private attentes = new Map<number, Attente>();
  private compteur = 0;
  private minuteurInactivite: NodeJS.Timeout | null = null;
  private occupe = 0;
  /** Les lots passent un par un : un seul calcul à la fois dans le sous-processus. */
  private file: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: OptionsVectoriseurLocal) {}

  /** PID du sous-processus actif (`null` si arrêté) : pour mesurer sa mémoire ou le tuer proprement. */
  get pidEnfant(): number | null {
    return this.enfant?.pid ?? null;
  }

  private get inactiviteMs(): number {
    return this.options.inactiviteMs ?? 5 * 60_000;
  }

  private envoyer(enfant: ChildProcess, message: Record<string, unknown>, delaiMs: number): Promise<Record<string, unknown>> {
    const id = ++this.compteur;
    return new Promise((resoudre, rejeter) => {
      const minuteur = setTimeout(() => {
        this.attentes.delete(id);
        // Un enfant qui ne répond plus est tué (par PID) : jamais de blocage.
        enfant.kill("SIGKILL");
        rejeter(new Error(`Le sous-processus de vectorisation n'a pas répondu en ${Math.round(delaiMs / 1000)} s : arrêté.`));
      }, delaiMs);
      this.attentes.set(id, { resoudre, rejeter, minuteur });
      enfant.send({ ...message, id }, (e) => {
        if (e) {
          clearTimeout(minuteur);
          this.attentes.delete(id);
          rejeter(new Error(`Envoi au sous-processus de vectorisation impossible : ${e.message}`));
        }
      });
    });
  }

  private lancer(): Promise<ChildProcess> {
    if (this.enfant) return Promise.resolve(this.enfant);
    this.demarrage ??= (async () => {
      await (this.options.verifier ?? verifierModele)(this.options.dossierModeles);
      const enfant = fork(this.options.scriptEnfant ?? scriptEnfantParDefaut(), [], {
        execArgv: [],
        env: environnementEnfant(),
        serialization: "json",
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
      enfant.on("message", (m: Record<string, unknown>) => {
        const attente = typeof m.id === "number" ? this.attentes.get(m.id) : undefined;
        if (!attente) return;
        clearTimeout(attente.minuteur);
        this.attentes.delete(m.id as number);
        if (m.type === "erreur") attente.rejeter(new Error(`Vectorisation : ${String(m.message)}`));
        else attente.resoudre(m);
      });
      const finir = (detail: string) => {
        if (this.enfant === enfant) this.enfant = null;
        for (const [id, a] of this.attentes) {
          clearTimeout(a.minuteur);
          this.attentes.delete(id);
          a.rejeter(new Error(`Le sous-processus de vectorisation s'est arrêté de façon inattendue (${detail}).`));
        }
      };
      enfant.once("exit", (code, signal) => finir(`code ${code ?? "aucun"}, signal ${signal ?? "aucun"}`));
      enfant.once("error", (e) => finir(e.message));
      try {
        await this.envoyer(
          enfant,
          {
            type: "charger",
            dossierModele: `${this.options.dossierModeles}/${MODELE_BGE_M3.id}`,
            fichierModele: "onnx/model_quantized.onnx",
            tailleMax: 512,
            ...(this.options.threads ? { threads: this.options.threads } : {}),
          },
          this.options.delaiChargementMs ?? 120_000,
        );
      } catch (e) {
        enfant.kill("SIGKILL");
        throw e;
      }
      this.enfant = enfant;
      return enfant;
    })().finally(() => {
      this.demarrage = null;
    });
    return this.demarrage;
  }

  private armerInactivite(): void {
    if (this.minuteurInactivite) clearTimeout(this.minuteurInactivite);
    this.minuteurInactivite = setTimeout(() => {
      if (this.occupe === 0) void this.arreter();
    }, this.inactiviteMs);
    this.minuteurInactivite.unref();
  }

  private async lot(textes: string[]): Promise<Float32Array[]> {
    const enfant = await this.lancer();
    const reponse = await this.envoyer(enfant, { type: "vectoriser", textes }, this.options.delaiLotMs ?? 120_000);
    const vecteurs = reponse.vecteurs as string[];
    if (!Array.isArray(vecteurs) || vecteurs.length !== textes.length) throw new Error("Vectorisation : réponse incomplète.");
    return vecteurs.map((v) => depuisBase64(v, this.dimension));
  }

  vectoriser(textes: string[]): Promise<Float32Array[]> {
    const taille = Math.min(4, Math.max(1, Math.floor(this.options.tailleLot ?? 4)));
    const tache = async () => {
      this.occupe += 1;
      if (this.minuteurInactivite) clearTimeout(this.minuteurInactivite);
      try {
        const sortie: Float32Array[] = [];
        for (let i = 0; i < textes.length; i += taille) sortie.push(...(await this.lot(textes.slice(i, i + taille))));
        return sortie;
      } finally {
        this.occupe -= 1;
        if (this.occupe === 0) this.armerInactivite();
      }
    };
    const resultat = this.file.then(tache, tache);
    this.file = resultat.catch(() => undefined);
    return resultat;
  }

  async arreter(): Promise<void> {
    if (this.minuteurInactivite) clearTimeout(this.minuteurInactivite);
    this.minuteurInactivite = null;
    const enfant = this.enfant ?? (await this.demarrage?.catch(() => null)) ?? null;
    if (!enfant || enfant.exitCode !== null || enfant.signalCode !== null) return;
    await new Promise<void>((fini) => {
      const secours = setTimeout(() => enfant.kill("SIGKILL"), 5000);
      enfant.once("exit", () => {
        clearTimeout(secours);
        fini();
      });
      enfant.send({ type: "arreter" }, () => undefined);
    });
    if (this.enfant === enfant) this.enfant = null;
  }
}

export function creerVectoriseurLocal(options: OptionsVectoriseurLocal): Vectoriseur & { readonly pidEnfant: number | null } {
  return new VectoriseurLocal(options);
}

/** Compatibilité avec la sonde de faisabilité R0 (`faisabilite/worker-essai.ts`). */
export async function chargerVectoriseurLocal(
  dossierModeles: string,
  options: { threads?: number } = {},
): Promise<{ empreinteModele: string; dimension: number; vectoriser(t: string[]): Promise<Float32Array[]>; liberer(): Promise<void> }> {
  const v = creerVectoriseurLocal({ dossierModeles, ...options });
  await v.vectoriser(["échauffement"]);
  return {
    empreinteModele: EMPREINTE_BGE_M3,
    dimension: v.dimension,
    vectoriser: (t) => v.vectoriser(t),
    liberer: () => v.arreter(),
  };
}

// ---------------------------------------------------------------------------------------------
// Mode « voyage » : client HTTP

export interface OptionsVoyage {
  /** Le client a accepté par écrit l'envoi de ses textes à Voyage AI. Sans cela, le client refuse de se créer. */
  autorise: boolean;
  /** Clé d'API : secret natif Paperclip, lue à chaque appel (jamais copiée en configuration). */
  cle: () => string | Promise<string>;
  modele: string;
  /** Dimension de sortie (défaut 1024). */
  dimension?: number;
  /** Point d'accès Europe (défaut) ; un faux serveur local en test. */
  urlBase?: string;
  /** Textes par requête (défaut 64). */
  tailleLot?: number;
  delaiMs?: number;
  fetch?: typeof fetch;
}

/** Point d'accès Europe de Voyage AI (MongoDB Atlas, `docs/rag-conception.md` §3.1) ; chemin à confirmer en R11. */
export const URL_VOYAGE_EUROPE = "https://eu.ai.mongodb.com/v1";

/**
 * URL de base admise : `https:` seulement, la clé d'API partant dans l'en-tête `Authorization` ;
 * `http:` toléré pour la seule machine locale (faux serveur de test).
 */
function verifierUrlBase(brute: string): string {
  let url: URL;
  try {
    url = new URL(brute);
  } catch {
    throw new Error("Voyage AI : URL de base invalide (https:// exigé).");
  }
  const locale = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && locale)) {
    throw new Error("Voyage AI : URL de base refusée, https:// exigé (la clé d'API ne part jamais en clair).");
  }
  return brute.replace(/\/+$/u, "");
}

/** Lit le corps d'une réponse sans dépasser `max` octets (une réponse démesurée est refusée en cours de lecture). */
async function lireCorpsBorne(reponse: Response, max: number): Promise<string> {
  if (!reponse.body) return "";
  const lecteur = reponse.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lecteur.cancel().catch(() => undefined);
      throw new Error(`Voyage AI : réponse trop volumineuse (plus de ${max} octets).`);
    }
    morceaux.push(value);
  }
  return Buffer.concat(morceaux).toString("utf8");
}

export function creerVectoriseurVoyage(options: OptionsVoyage): Vectoriseur {
  if (!options.autorise) {
    throw new Error("Voyage AI non autorisé : le client doit l'avoir accepté par écrit (drapeau de configuration).");
  }
  const dimension = options.dimension ?? 1024;
  const urlBase = verifierUrlBase(options.urlBase ?? URL_VOYAGE_EUROPE);
  const appeler = options.fetch ?? fetch;
  return {
    type: "voyage",
    empreinte: `voyage:${options.modele}:${dimension}`,
    dimension,
    async vectoriser(textes, usage = "document") {
      const taille = Math.max(1, options.tailleLot ?? 64);
      const sortie: Float32Array[] = [];
      for (let i = 0; i < textes.length; i += taille) {
        const lot = textes.slice(i, i + taille);
        const cle = await options.cle();
        const reponse = await appeler(`${urlBase}/embeddings`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${cle}` },
          body: JSON.stringify({ input: lot, model: options.modele, input_type: usage === "requete" ? "query" : "document", output_dimension: dimension }),
          signal: AbortSignal.timeout(options.delaiMs ?? 60_000),
        });
        if (!reponse.ok) {
          // Le corps d'erreur n'est pas repris : il peut citer le texte du client (qui finirait dans les
          // journaux). La clé n'y figure jamais : l'en-tête n'est pas relu.
          await reponse.body?.cancel().catch(() => undefined);
          throw new Error(`Voyage AI : HTTP ${reponse.status}`);
        }
        // Environ 20 caractères par composante en JSON : marge large, mais une réponse démesurée est coupée.
        const max = lot.length * dimension * 32 + 65_536;
        let corps: { data?: unknown };
        try {
          corps = JSON.parse(await lireCorpsBorne(reponse, max)) as { data?: unknown };
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("Voyage AI")) throw e;
          throw new Error("Voyage AI : réponse illisible (JSON attendu).");
        }
        const brutes = Array.isArray(corps?.data) ? (corps.data as Array<{ embedding?: unknown; index?: unknown }>) : [];
        if (brutes.length !== lot.length) throw new Error("Voyage AI : nombre de vecteurs différent du nombre de textes.");
        // Chaque index de 0 à n−1 exactement une fois : un doublon remettrait un vecteur au mauvais passage.
        const parIndex: Array<unknown[] | undefined> = new Array(lot.length);
        for (const d of brutes) {
          const index = d?.index;
          if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= lot.length || parIndex[index]) {
            throw new Error("Voyage AI : index de vecteur manquant, en double ou hors limites.");
          }
          if (!Array.isArray(d.embedding)) throw new Error("Voyage AI : vecteur absent.");
          parIndex[index] = d.embedding;
        }
        for (const embedding of parIndex as unknown[][]) {
          if (embedding.length !== dimension) throw new Error(`Voyage AI : dimension ${embedding.length}, ${dimension} attendue.`);
          if (!embedding.every((x) => typeof x === "number" && Number.isFinite(x))) throw new Error("Voyage AI : composante non numérique.");
          sortie.push(Float32Array.from(embedding as number[]));
        }
      }
      return sortie;
    },
    async arreter() {},
  };
}
