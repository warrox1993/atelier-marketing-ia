// Lot R3 : vectorisation des passages (src/serveur/connaissances/vectorisation.ts).
// Suite normale : faux sous-processus (tests/fixtures) et faux serveur Voyage sur 127.0.0.1, sans modèle.
// Essai réel avec le vrai modèle : séparé, ignoré sauf si ATELIER_ESSAI_MODELE=1.
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  EMPREINTE_BGE_M3,
  creerVectoriseurAucun,
  creerVectoriseurLocal,
  creerVectoriseurVoyage,
  verifierEmpreinteIndex,
  type Vectoriseur,
} from "../src/serveur/connaissances/vectorisation.js";

const ici = path.dirname(fileURLToPath(import.meta.url));
const ENFANT_FACTICE = path.join(ici, "fixtures", "enfant-vectoriseur-factice.mjs");
const ENFANT_PLANTE = path.join(ici, "fixtures", "enfant-vectoriseur-charge-plante.mjs");
const sansVerification = async () => undefined;

function vivant(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function attendreQue(condition: () => boolean, delaiMs = 5000): Promise<void> {
  const fin = Date.now() + delaiMs;
  while (!condition()) {
    if (Date.now() > fin) throw new Error("Condition non atteinte dans le délai");
    await new Promise((r) => setTimeout(r, 20));
  }
}

const aArreter: Vectoriseur[] = [];
function local(options: Partial<Parameters<typeof creerVectoriseurLocal>[0]> = {}) {
  const v = creerVectoriseurLocal({
    dossierModeles: "/inexistant",
    scriptEnfant: ENFANT_FACTICE,
    verifier: sansVerification,
    ...options,
  });
  aArreter.push(v);
  return v;
}
afterEach(async () => {
  await Promise.all(aArreter.splice(0).map((v) => v.arreter()));
});

describe("empreinte d'index : jamais deux modèles", () => {
  it("accepte la même empreinte, y compris « sans vecteurs » avec le mode aucun", () => {
    expect(() => verifierEmpreinteIndex(EMPREINTE_BGE_M3, local())).not.toThrow();
    expect(() => verifierEmpreinteIndex(null, creerVectoriseurAucun())).not.toThrow();
  });

  it("refuse une empreinte différente avec un message explicite", () => {
    const voyage = creerVectoriseurVoyage({ autorise: true, cle: () => "k", modele: "voyage-4" });
    expect(() => verifierEmpreinteIndex(EMPREINTE_BGE_M3, voyage)).toThrow(/jamais deux modèles/u);
    expect(() => verifierEmpreinteIndex(null, local())).toThrow(/sans vecteurs/u);
    expect(() => verifierEmpreinteIndex("voyage:voyage-4:1024", creerVectoriseurAucun())).toThrow(/réindexer/u);
  });

  it("l'empreinte locale porte l'identifiant, la révision et la quantification", () => {
    expect(EMPREINTE_BGE_M3).toBe("Xenova/bge-m3@4de13258303883538bd53b696b452bf8099f0858:q8");
  });
});

describe("mode aucun", () => {
  it("n'a pas d'empreinte et refuse de vectoriser", async () => {
    const v = creerVectoriseurAucun();
    expect(v.type).toBe("aucun");
    expect(v.empreinte).toBeNull();
    await expect(v.vectoriser(["a"])).rejects.toThrow(/plein texte seulement/u);
  });
});

describe("mode local : sous-processus", () => {
  it("rend des vecteurs de dimension 1024 dans l'ordre, par lots de 4 au plus", async () => {
    const v = local();
    const textes = Array.from({ length: 10 }, (_, i) => "x".repeat(i + 1));
    const vecteurs = await v.vectoriser(textes);
    expect(vecteurs).toHaveLength(10);
    expect(vecteurs.every((x) => x.length === 1024)).toBe(true);
    // composante 1 / composante 0 = taille du lot : 4, 4, 2
    expect(vecteurs.map((x) => Math.round(x[1]! / x[0]!))).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 2, 2]);
    // ordre conservé : la composante 2 suit la longueur du texte dans chaque lot
    expect(vecteurs[0]![2]! / vecteurs[0]![0]!).toBeCloseTo(1, 5);
    expect(vecteurs[9]![2]! / vecteurs[9]![0]!).toBeCloseTo(10, 5);
  });

  it("la taille de lot est bornée entre 1 et 4", async () => {
    const v = local({ tailleLot: 99 });
    const a = await v.vectoriser(["a", "b", "c", "d", "e"]);
    expect(Math.round(a[0]![1]! / a[0]![0]!)).toBe(4);
    const w = local({ tailleLot: 0 });
    const b = await w.vectoriser(["a", "b"]);
    expect(Math.round(b[0]![1]! / b[0]![0]!)).toBe(1);
  });

  it("réutilise le même sous-processus d'un appel à l'autre", async () => {
    const v = local();
    await v.vectoriser(["a"]);
    const pid = v.pidEnfant;
    await Promise.all([v.vectoriser(["b"]), v.vectoriser(["c"])]);
    expect(v.pidEnfant).toBe(pid);
  });

  it("s'arrête après inactivité et se relance à la demande", async () => {
    const v = local({ inactiviteMs: 150 });
    await v.vectoriser(["a"]);
    const premier = v.pidEnfant!;
    expect(vivant(premier)).toBe(true);
    await attendreQue(() => !vivant(premier));
    expect(v.pidEnfant).toBeNull();
    const vecteurs = await v.vectoriser(["b"]);
    expect(vecteurs).toHaveLength(1);
    expect(v.pidEnfant).not.toBeNull();
    expect(v.pidEnfant).not.toBe(premier);
  });

  it("ne s'arrête pas pendant qu'un calcul est en cours", async () => {
    const v = local({ inactiviteMs: 100 });
    const gros = await v.vectoriser(Array.from({ length: 400 }, () => "texte"));
    expect(gros).toHaveLength(400);
  });

  it("un plantage de l'enfant donne une erreur claire, puis le suivant repart", async () => {
    const v = local();
    await v.vectoriser(["a"]);
    const avant = v.pidEnfant!;
    await expect(v.vectoriser(["PLANTAGE"])).rejects.toThrow(/s'est arrêté de façon inattendue \(code 42/u);
    expect(vivant(avant)).toBe(false);
    const apres = await v.vectoriser(["b"]);
    expect(apres).toHaveLength(1);
    expect(v.pidEnfant).not.toBe(avant);
  });

  it("un enfant qui ne répond plus est tué, sans blocage, et le suivant repart", async () => {
    const v = local({ delaiLotMs: 300 });
    await v.vectoriser(["a"]);
    const bloque = v.pidEnfant!;
    await expect(v.vectoriser(["BLOQUE"])).rejects.toThrow(/n'a pas répondu/u);
    await attendreQue(() => !vivant(bloque));
    expect(await v.vectoriser(["b"])).toHaveLength(1);
  });

  it("un enfant qui meurt pendant le chargement du modèle donne une erreur claire", async () => {
    const v = local({ scriptEnfant: ENFANT_PLANTE });
    await expect(v.vectoriser(["a"])).rejects.toThrow(/s'est arrêté de façon inattendue \(code 7/u);
    expect(v.pidEnfant).toBeNull();
  });

  it("une vérification de modèle qui échoue empêche tout lancement", async () => {
    const v = local({
      verifier: async () => {
        throw new Error("Empreinte du modèle incorrecte pour tokenizer.json");
      },
    });
    await expect(v.vectoriser(["a"])).rejects.toThrow(/Empreinte du modèle incorrecte/u);
    expect(v.pidEnfant).toBeNull();
  });

  it("arrêter est sans effet quand rien ne tourne, et idempotent", async () => {
    const v = local();
    await v.arreter();
    await v.vectoriser(["a"]);
    await v.arreter();
    await v.arreter();
    expect(v.pidEnfant).toBeNull();
  });
});

describe("mode voyage : client HTTP contre un faux serveur local", () => {
  let serveur: Server | null = null;
  const requetes: { chemin: string; auth: string | undefined; corps: Record<string, unknown> }[] = [];
  let comportement: "ok" | "401" | "dimension" | "incomplet" = "ok";

  async function demarrer(): Promise<string> {
    serveur = createServer((req: IncomingMessage, res) => {
      const morceaux: Buffer[] = [];
      req.on("data", (m: Buffer) => morceaux.push(m));
      req.on("end", () => {
        const corps = JSON.parse(Buffer.concat(morceaux).toString("utf8")) as { input: string[]; output_dimension: number };
        requetes.push({ chemin: req.url ?? "", auth: req.headers.authorization, corps });
        if (comportement === "401") {
          res.writeHead(401, { "content-type": "application/json" });
          return void res.end(JSON.stringify({ detail: "Provided API key is invalid." }));
        }
        const dim = comportement === "dimension" ? corps.output_dimension + 1 : corps.output_dimension;
        let data = corps.input.map((t, index) => ({ index, embedding: Array.from({ length: dim }, (_, k) => (k === 0 ? t.length : 0)) }));
        if (comportement === "incomplet") data = data.slice(1);
        data.reverse(); // l'API peut répondre dans le désordre : le client trie par index
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data, model: "voyage-4", usage: { total_tokens: 1 } }));
      });
    });
    await new Promise<void>((r) => serveur!.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${(serveur!.address() as AddressInfo).port}/v1`;
  }
  afterEach(async () => {
    requetes.length = 0;
    comportement = "ok";
    if (serveur) await new Promise((r) => serveur!.close(r));
    serveur = null;
  });

  it("refuse de se créer sans l'accord écrit du client", () => {
    expect(() => creerVectoriseurVoyage({ autorise: false, cle: () => "k", modele: "voyage-4" })).toThrow(/accepté par écrit/u);
  });

  it("envoie le modèle, le type d'entrée et la clé, et remet les vecteurs dans l'ordre", async () => {
    const urlBase = await demarrer();
    const v = creerVectoriseurVoyage({ autorise: true, cle: async () => "cle-secrete", modele: "voyage-4", dimension: 8, urlBase, tailleLot: 2 });
    expect(v.empreinte).toBe("voyage:voyage-4:8");
    const sortie = await v.vectoriser(["a", "bb", "ccc"], "requete");
    expect(sortie.map((x) => x[0])).toEqual([1, 2, 3]);
    expect(sortie.every((x) => x.length === 8)).toBe(true);
    expect(requetes).toHaveLength(2); // lots de 2
    expect(requetes[0]!.chemin).toBe("/v1/embeddings");
    expect(requetes[0]!.auth).toBe("Bearer cle-secrete");
    expect(requetes[0]!.corps).toMatchObject({ model: "voyage-4", input_type: "query", output_dimension: 8, input: ["a", "bb"] });
    await v.vectoriser(["z"]);
    expect(requetes[2]!.corps.input_type).toBe("document");
  });

  it("l'URL par défaut est le point d'accès Europe", async () => {
    const appels: string[] = [];
    const v = creerVectoriseurVoyage({
      autorise: true,
      cle: () => "k",
      modele: "voyage-4",
      dimension: 2,
      fetch: (async (url: string) => {
        appels.push(url);
        return new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 0] }] }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    await v.vectoriser(["a"]);
    expect(appels).toEqual(["https://eu.ai.mongodb.com/v1/embeddings"]);
  });

  it("une erreur HTTP est claire et ne contient jamais la clé", async () => {
    const urlBase = await demarrer();
    comportement = "401";
    const v = creerVectoriseurVoyage({ autorise: true, cle: () => "cle-secrete", modele: "voyage-4", dimension: 4, urlBase });
    const erreur = await v.vectoriser(["a"]).catch((e: Error) => e);
    expect((erreur as Error).message).toMatch(/Voyage AI : HTTP 401/u);
    expect((erreur as Error).message).not.toContain("cle-secrete");
  });

  it("refuse une dimension ou un nombre de vecteurs inattendus", async () => {
    const urlBase = await demarrer();
    const v = creerVectoriseurVoyage({ autorise: true, cle: () => "k", modele: "voyage-4", dimension: 4, urlBase });
    comportement = "dimension";
    await expect(v.vectoriser(["a"])).rejects.toThrow(/dimension 5, 4 attendue/u);
    comportement = "incomplet";
    await expect(v.vectoriser(["a", "b"])).rejects.toThrow(/nombre de vecteurs/u);
  });
});

// ---------------------------------------------------------------------------------------------
// Essai réel (vrai modèle, 560 Mo) : ATELIER_ESSAI_MODELE=1 npx vitest run tests/connaissances-vectorisation.spec.ts
describe.skipIf(process.env.ATELIER_ESSAI_MODELE !== "1")("essai local réel avec bge-m3 (q8)", () => {
  const dossier = process.env.ATELIER_DOSSIER_MODELES ?? path.join(ici, "..", ".modeles");
  const rssMo = (pid: number) => {
    const m = /VmRSS:\s+(\d+) kB/u.exec(readFileSync(`/proc/${pid}/status`, "utf8"));
    return Math.round(Number(m![1]) / 1024);
  };
  const disponibleMo = () => Math.round(Number(/MemAvailable:\s+(\d+) kB/u.exec(readFileSync("/proc/meminfo", "utf8"))![1]) / 1024);
  const cosinus = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i]!, 0);

  it("mesure : chargement, lot de 4, sens FR/NL, mémoire, retour de la mémoire après inactivité", async () => {
    const v = creerVectoriseurLocal({ dossierModeles: dossier, inactiviteMs: 4000 });
    aArreter.push(v);
    const dispoAvant = disponibleMo();
    const t0 = performance.now();
    const [premier] = await v.vectoriser(["Bonjour"]); // lance l'enfant, vérifie les SHA-256, charge le modèle
    const msChargementEtUnTexte = performance.now() - t0;
    expect(premier).toHaveLength(1024);
    const pid = v.pidEnfant!;

    const fr = "Le client doit déclarer le sinistre dans les huit jours suivant l'accident.";
    const nl = "De klant moet de schade binnen acht dagen na het ongeval aangeven.";
    const autre = "La recette de la crêpe bretonne demande de la farine de blé noir et du beurre salé.";
    const t1 = performance.now();
    const lot = await v.vectoriser([fr, nl, autre, "Quatrième passage de remplissage pour le lot."]);
    const msLot = performance.now() - t1;
    const sim = { frNl: cosinus(lot[0]!, lot[1]!), frAutre: cosinus(lot[0]!, lot[2]!), nlAutre: cosinus(lot[1]!, lot[2]!) };
    const normes = lot.map((x) => Math.sqrt(x.reduce((s, y) => s + y * y, 0)));
    const rss = rssMo(pid);
    const dispoEnMarche = disponibleMo();
    console.log(
      `[essai bge-m3] chargement + 1er texte : ${Math.round(msChargementEtUnTexte)} ms ; lot de 4 : ${Math.round(msLot)} ms ; ` +
        `cosinus FR/NL ${sim.frNl.toFixed(3)} ; FR/sans rapport ${sim.frAutre.toFixed(3)} ; NL/sans rapport ${sim.nlAutre.toFixed(3)} ; ` +
        `normes ${normes.map((n) => n.toFixed(4)).join(",")} ; RSS enfant ${rss} Mo ; MemAvailable ${dispoAvant} -> ${dispoEnMarche} Mo`,
    );
    expect(sim.frNl).toBeGreaterThan(sim.frAutre + 0.15);
    expect(sim.frNl).toBeGreaterThan(sim.nlAutre + 0.15);
    for (const n of normes) expect(n).toBeCloseTo(1, 3);

    // Entrée tronquée à 512 jetons : un texte de plusieurs milliers de mots passe sans erreur.
    const [long] = await v.vectoriser([`${fr} `.repeat(400)]);
    expect(Math.sqrt(long!.reduce((s, y) => s + y * y, 0))).toBeCloseTo(1, 3);

    // Retour de la mémoire : l'enfant s'arrête seul après l'inactivité.
    await attendreQue(() => !vivant(pid), 15000);
    const dispoApres = disponibleMo();
    console.log(`[essai bge-m3] enfant ${pid} arrêté après inactivité ; MemAvailable après arrêt ${dispoApres} Mo (en marche : ${dispoEnMarche} Mo)`);
    expect(v.pidEnfant).toBeNull();
    expect(dispoApres).toBeGreaterThan(dispoEnMarche);
  }, 300_000);
});
