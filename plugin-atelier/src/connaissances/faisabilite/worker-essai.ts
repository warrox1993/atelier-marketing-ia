/**
 * Worker d'ESSAI du lot R0 : le vrai worker de l'atelier, plus une sonde de faisabilité lancée en
 * tâche de fond après `setup()` (jamais dans `setup()`, que l'hôte borne à 15 s).
 *
 * Construit seulement dans une copie du plugin (`construire-copie-r0.mjs`), jamais dans
 * `plugin-atelier/dist`. La sonde écrit ses mesures en JSON dans `<copie>/resultats/` et lit le
 * modèle dans `<copie>/modeles/` : deux chemins relatifs au paquet installé, hors dépôt git.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";
import { creerAtelier } from "../../serveur/atelier.js";
import { genererCorpus, phraseSujet, QUESTIONS } from "./corpus.js";
import { chargerVectoriseurLocal } from "../../serveur/connaissances/vectorisation.js";
import {
  creerMatrice,
  depuisBase64,
  normaliser,
  rechercheExacte,
  sansAccents,
  versBase64,
  versLitteralReel,
} from "../vecteurs.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER_MODELES = path.join(RACINE, "modeles");
const DOSSIER_RESULTATS = path.join(RACINE, "resultats");

type Mesures = Record<string, unknown>;

function memoire(): Record<string, number> {
  const m = process.memoryUsage();
  const statut = readFileSync("/proc/self/status", "utf8");
  const ko = (cle: string) => Number(new RegExp(`^${cle}:\\s+(\\d+) kB`, "m").exec(statut)?.[1] ?? 0);
  const mo = (octets: number) => Math.round(octets / 1048576);
  return {
    rssMo: mo(m.rss),
    picRssMo: Math.round(ko("VmHWM") / 1024),
    tasMo: mo(m.heapUsed),
    externeMo: mo(m.external),
    arrayBuffersMo: mo(m.arrayBuffers),
  };
}

function stats(valeurs: number[]): { mediane: number; p95: number; max: number } {
  const t = [...valeurs].sort((a, b) => a - b);
  const q = (p: number) => t[Math.min(t.length - 1, Math.ceil(p * t.length) - 1)]!;
  const r = (x: number) => Math.round(x * 100) / 100;
  return { mediane: r(q(0.5)), p95: r(q(0.95)), max: r(t[t.length - 1]!) };
}

async function chrono<T>(f: () => Promise<T> | T): Promise<[T, number]> {
  const debut = performance.now();
  const r = await f();
  return [r, performance.now() - debut];
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function aleatoire(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function sonde(ctx: PluginContext): Promise<Mesures> {
  const ns = ctx.db.namespace;
  const table = `${ns}.essai_r0_passages`;
  const m: Mesures = {
    debut: new Date().toISOString(),
    processus: {
      pid: process.pid,
      ppid: process.ppid,
      node: process.versions.node,
      abiModules: process.versions.modules,
      execArgv: process.execArgv,
      variablesEnvironnement: Object.keys(process.env).sort(),
      connecteIpc: typeof process.send === "function",
      cpus: (await import("node:os")).cpus().length,
    },
    memoireDepart: memoire(),
  };

  // 1. Extension unaccent côté base, vue depuis le plugin.
  const extensions = await ctx.db.query<{ extname: string }>("SELECT extname FROM pg_extension ORDER BY extname");
  m.extensionsInstallees = extensions.map((e) => e.extname);
  try {
    const r = await ctx.db.query<{ r: string }>("SELECT public.unaccent('Réclamation geïndexeerd') AS r");
    m.unaccentDepuisPlugin = { ok: true, resultat: r[0]?.r };
  } catch (e) {
    m.unaccentDepuisPlugin = { ok: false, erreur: (e as Error).message.slice(0, 300) };
  }

  // 2. Chargement du modèle (empreintes vérifiées, module natif, session ONNX).
  const [vectoriseur, msChargement] = await chrono(() => chargerVectoriseurLocal(DOSSIER_MODELES));
  m.chargement = { ms: Math.round(msChargement), empreinteModele: vectoriseur.empreinteModele, memoire: memoire() };

  // 3. Vectorisation de 1 000 passages, lots de 16.
  const corpus = genererCorpus(1000);
  const matrice = creerMatrice(vectoriseur.dimension, corpus.length);
  const tempsLots: number[] = [];
  const debutIndexation = performance.now();
  for (let i = 0; i < corpus.length; i += 16) {
    const lot = corpus.slice(i, i + 16);
    const [vecteurs, ms] = await chrono(() => vectoriser(lot.map((p) => p.texte)));
    tempsLots.push(ms);
    vecteurs.forEach((v, j) => matrice.donnees.set(v, (i + j) * vectoriseur.dimension));
  }
  const msIndexation = performance.now() - debutIndexation;
  m.indexation = {
    passages: corpus.length,
    ms: Math.round(msIndexation),
    passagesParSeconde: Math.round((corpus.length / msIndexation) * 10000) / 10,
    lotDe16Ms: stats(tempsLots),
    memoire: memoire(),
  };
  async function vectoriser(textes: string[]) {
    return vectoriseur.vectoriser(textes);
  }

  // 4. Questions : latence de la requête et bon passage en tête.
  const latences: number[] = [];
  const questions: unknown[] = [];
  let enTete = 0;
  for (const q of QUESTIONS) {
    const [[v], ms] = await chrono(() => vectoriser([q.texte]));
    latences.push(ms);
    const top = rechercheExacte(matrice, v!, 5);
    const attendu = phraseSujet(q.langue, q.sujet);
    const ok = corpus[top[0]!.ligne]!.texte.includes(attendu);
    if (ok) enTete += 1;
    questions.push({ question: q.texte, ok, score: Math.round(top[0]!.score * 1000) / 1000, passage: corpus[top[0]!.ligne]!.texte.slice(0, 160) });
  }
  m.requetes = { latenceVectorisationMs: stats(latences), bonPassageEnTete: `${enTete}/${QUESTIONS.length}`, questions };

  // 5. Stockage : bytea (base64) contre real[] (texte), à travers ctx.db.
  await ctx.db.execute(`DELETE FROM ${table} WHERE id >= $1`, [0]);
  const valeurs = (n: number, colonne: "b" | "r") =>
    Array.from({ length: n }, (_, k) => {
      const p = 5 * k;
      const conv = colonne === "b" ? `decode($${p + 5}, 'base64')` : `$${p + 5}::real[]`;
      return `($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, ${conv})`;
    }).join(", ");
  const parametres = (debut: number, n: number, colonne: "b" | "r") =>
    corpus.slice(debut, debut + n).flatMap((p) => {
      const v = matrice.donnees.subarray(p.numero * 1024, (p.numero + 1) * 1024);
      return [p.numero, p.langue, p.texte, sansAccents(p.texte), colonne === "b" ? versBase64(v) : versLitteralReel(v)];
    });
  const inserer = async (colonne: "b" | "r", parLot: number) => {
    const nomColonne = colonne === "b" ? "vecteur_bytea" : "vecteur_reel";
    let octetsJson = 0;
    const [, ms] = await chrono(async () => {
      for (let i = 0; i < corpus.length; i += parLot) {
        const n = Math.min(parLot, corpus.length - i);
        const params = parametres(i, n, colonne);
        octetsJson += JSON.stringify(params).length;
        await ctx.db.execute(
          `INSERT INTO ${table} (id, langue, texte, texte_normalise, ${nomColonne}) VALUES ${valeurs(n, colonne)}`,
          params,
        );
      }
    });
    return { ms: Math.round(ms), parLot, octetsJsonEnvoyes: octetsJson };
  };
  const stockage: Mesures = {};
  stockage.insertionRealUneInstruction = await inserer("r", 1000).catch((e: Error) => ({ erreur: e.message.slice(0, 300) }));
  const [lectureReel, msReel] = await chrono(() =>
    ctx.db.query<{ id: number; v: unknown }>(`SELECT id, vecteur_reel AS v FROM ${table} ORDER BY id`),
  );
  let ecartMaxReel = 0;
  for (const ligne of lectureReel) {
    const v = ligne.v as number[];
    const ref = matrice.donnees.subarray(ligne.id * 1024, (ligne.id + 1) * 1024);
    for (let j = 0; j < 1024; j += 1) ecartMaxReel = Math.max(ecartMaxReel, Math.abs(v[j]! - ref[j]!));
  }
  stockage.lectureReel = {
    ms: Math.round(msReel),
    lignes: lectureReel.length,
    typeRecu: Array.isArray(lectureReel[0]?.v) ? `tableau de ${typeof (lectureReel[0]!.v as unknown[])[0]}` : typeof lectureReel[0]?.v,
    octetsJsonRecus: JSON.stringify(lectureReel).length,
    ecartMax: ecartMaxReel,
  };
  const [tailleReel] = await ctx.db.query<Record<string, unknown>>(
    `SELECT avg(pg_column_size(vecteur_reel))::int AS colonne, pg_total_relation_size('${table}') AS table_octets FROM ${table}`,
  );
  stockage.tailleReel = tailleReel;
  await ctx.db.execute(`DELETE FROM ${table} WHERE id >= $1`, [0]);

  stockage.insertionByteaUneInstruction = await inserer("b", 1000).catch((e: Error) => ({ erreur: e.message.slice(0, 300) }));
  await ctx.db.execute(`DELETE FROM ${table} WHERE id >= $1`, [0]);
  stockage.insertionByteaLotsDe100 = await inserer("b", 100).catch((e: Error) => ({ erreur: e.message.slice(0, 300) }));
  const [lectureB64, msB64] = await chrono(() =>
    ctx.db.query<{ id: number; v: string }>(`SELECT id, encode(vecteur_bytea, 'base64') AS v FROM ${table} ORDER BY id`),
  );
  let identiques = 0;
  const [, msDecodage] = await chrono(() => {
    for (const ligne of lectureB64) {
      const v = depuisBase64(ligne.v, 1024);
      const ref = matrice.donnees.subarray(ligne.id * 1024, (ligne.id + 1) * 1024);
      if (Buffer.compare(Buffer.from(v.buffer), Buffer.from(ref.buffer, ref.byteOffset, ref.byteLength)) === 0) identiques += 1;
    }
  });
  stockage.lectureByteaBase64 = {
    ms: Math.round(msB64),
    decodageMs: Math.round(msDecodage),
    lignes: lectureB64.length,
    identiquesAuBitPres: identiques,
    octetsJsonRecus: JSON.stringify(lectureB64).length,
  };
  const [lectureBrute, msBrut] = await chrono(() =>
    ctx.db.query<{ id: number; v: unknown }>(`SELECT id, vecteur_bytea AS v FROM ${table} ORDER BY id LIMIT 100`),
  );
  const brut = lectureBrute[0]?.v;
  stockage.lectureByteaBrute100 = {
    ms: Math.round(msBrut),
    typeRecu: brut === null ? "null" : Array.isArray(brut) ? "tableau" : typeof brut,
    apercu: JSON.stringify(brut)?.slice(0, 80),
    octetsJsonRecus: JSON.stringify(lectureBrute).length,
  };
  const [tailleBytea] = await ctx.db.query<Record<string, unknown>>(
    `SELECT avg(pg_column_size(vecteur_bytea))::int AS colonne, pg_total_relation_size('${table}') AS table_octets FROM ${table}`,
  );
  stockage.tailleBytea = tailleBytea;
  m.stockage = stockage;

  // 6. Plein texte french et dutch, avec et sans accents (colonne normalisée par le code).
  const pleinTexte: unknown[] = [];
  const cas = [
    { config: "french", q: "réclamation médiation" },
    { config: "french", q: "reclamation mediation" },
    { config: "french", q: "franchise indexée" },
    { config: "french", q: "franchise indexee" },
    { config: "french", q: "délai de carence" },
    { config: "french", q: "delai de carence" },
    { config: "french", q: "\"bris de vitre\" -franchise" },
    { config: "dutch", q: "geïndexeerd eigen risico" },
    { config: "dutch", q: "geindexeerd eigen risico" },
    { config: "dutch", q: "ombudsdienst klacht" },
    { config: "dutch", q: "fietsen gestolen" },
  ];
  for (const c of cas) {
    const [normalise, msN] = await chrono(() =>
      ctx.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE tsv @@ websearch_to_tsquery('${c.config}'::regconfig, $1)`,
        [sansAccents(c.q)],
      ),
    );
    const [accents] = await ctx.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${table} WHERE tsv_accents @@ websearch_to_tsquery('${c.config}'::regconfig, $1)`,
      [c.q],
    );
    const [top, msTop] = await chrono(() =>
      ctx.db.query<{ id: number }>(
        `SELECT id, ts_rank_cd(tsv, q) AS rang FROM ${table}, websearch_to_tsquery('${c.config}'::regconfig, $1) AS q WHERE tsv @@ q ORDER BY rang DESC, id LIMIT 20`,
        [sansAccents(c.q)],
      ),
    );
    pleinTexte.push({ ...c, resultatsNormalise: normalise[0]?.n, resultatsAvecAccents: accents?.n, msComptage: Math.round(msN), msTop20: Math.round(msTop), top20: top.length });
  }
  const [trigramme, msTri] = await chrono(() =>
    ctx.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE texte_normalise LIKE $1`, ["%article 12 %"]),
  );
  m.pleinTexte = { cas: pleinTexte, trigrammeLike: { n: trigramme[0]?.n, ms: Math.round(msTri) } };
  const [lexemes] = await ctx.db.query<Record<string, string>>(
    "SELECT to_tsvector('french'::regconfig, $1)::text AS fr, to_tsvector('dutch'::regconfig, $2)::text AS nl",
    [sansAccents("Les réclamations indexées"), sansAccents("De geïndexeerde verzekeringen")],
  );
  m.lexemes = lexemes;

  await vectoriseur.liberer();
  m.memoireApresLiberation = memoire();

  // 7. Recherche exacte en mémoire à 10 000 et 100 000 passages (vecteurs synthétiques normalisés).
  const echelles: unknown[] = [];
  for (const lignes of [10_000, 100_000]) {
    const alea = aleatoire(lignes);
    const [mat, msCreation] = await chrono(() => {
      const mm = creerMatrice(1024, lignes);
      for (let i = 0; i < mm.donnees.length; i += 1) mm.donnees[i] = alea() * 2 - 1;
      for (let l = 0; l < lignes; l += 1) normaliser(mm.donnees.subarray(l * 1024, (l + 1) * 1024));
      return mm;
    });
    const memoireMatrice = memoire();
    const tempsTotal: number[] = [];
    const tempsFiltre: number[] = [];
    const autorisees = Array.from({ length: Math.floor(lignes / 10) }, (_, i) => i * 10);
    for (let r = 0; r < 20; r += 1) {
      const q = normaliser(Float32Array.from({ length: 1024 }, () => alea() * 2 - 1));
      tempsTotal.push((await chrono(() => rechercheExacte(mat, q, 20)))[1]);
      tempsFiltre.push((await chrono(() => rechercheExacte(mat, q, 20, autorisees)))[1]);
    }
    let msDecodage10k: number | undefined;
    if (lignes === 10_000) {
      const textes = Array.from({ length: lignes }, (_, l) => versBase64(mat.donnees.subarray(l * 1024, (l + 1) * 1024)));
      msDecodage10k = Math.round(
        (await chrono(() => {
          const cible = creerMatrice(1024, lignes);
          textes.forEach((t, l) => cible.donnees.set(depuisBase64(t, 1024), l * 1024));
        }))[1],
      );
    }
    echelles.push({
      lignes,
      octetsMatriceMo: Math.round(mat.donnees.byteLength / 1048576),
      creationMs: Math.round(msCreation),
      memoire: memoireMatrice,
      recherche20Ms: stats(tempsTotal),
      rechercheFiltree10pcMs: stats(tempsFiltre),
      ...(msDecodage10k === undefined ? {} : { decodageBase64Ms: msDecodage10k }),
    });
  }
  m.rechercheMemoire = echelles;
  m.fin = new Date().toISOString();
  m.memoireFin = memoire();
  return m;
}

let atelier: ReturnType<typeof creerAtelier> | null = null;

const plugin = definePlugin({
  async setup(ctx) {
    atelier = creerAtelier(ctx);
    atelier.enregistrer();
    ctx.logger.info("Atelier (copie R0) prêt", { espaceBase: ctx.db.namespace });
    setTimeout(() => {
      mkdirSync(DOSSIER_RESULTATS, { recursive: true });
      const fichier = path.join(DOSSIER_RESULTATS, `r0-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      sonde(ctx)
        .then((mesures) => {
          writeFileSync(fichier, JSON.stringify(mesures, null, 2));
          ctx.logger.info("Sonde R0 terminée", { fichier });
        })
        .catch((e: Error) => {
          writeFileSync(fichier, JSON.stringify({ erreur: e.message, pile: e.stack }, null, 2));
          ctx.logger.error("Sonde R0 en échec", { erreur: e.message });
        });
    }, 1000);
  },

  async onApiRequest(input) {
    if (!atelier) return { status: 503, body: { erreur: "Atelier non initialisé", code: "erreur_interne" } };
    return atelier.traiterRequeteApi(input);
  },

  async onHealth() {
    return { status: "ok", message: "Worker de l'atelier actif (copie R0)" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
