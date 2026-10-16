// Lot P4 : fournisseur réel `bnb` (Centrale des bilans de la BNB, API Query authentic data). Aucun appel réseau : transport injecté,
// réponses au FORMAT officiel (guide technique CBSO v0.94, description jsonxbrl 0.94) pour une entreprise fictive.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ClientBnb, configDepuisEnv, ErreurBnb, ENTETE_CLE, URL_BASE_PRODUCTION, URL_BASE_TEST, type ConfigBnb, type ReponseBnb, type RequeteBnb, type TransportBnb } from "../../src/reel/prospection/bnb/client.js";
import { exercicesRetenus, fournisseurBnbReel, outilComptesReel } from "../../src/reel/prospection/bnb/outils.js";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
import { enregistrerProspectionReel } from "../../src/reel/prospection/enregistrer.js";
import { lireFichierSecret } from "../../src/reel/prospection/commun.js";

const DOSSIER = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures");
const fixture = (nom: string): string => readFileSync(join(DOSSIER, nom), "utf8");
const NUMERO = "0123.456.749"; // entreprise fictive, chiffre de contrôle valide
const CLE = "cle-bnb-SECRETE-0123456789abcdef";

const CONFIG: ConfigBnb = { cle: CLE, urlBase: URL_BASE_TEST, environnement: "test", delaiAppelMs: 5000 };
const ok = (texte: string, entetes: Record<string, string> = {}): ReponseBnb => ({ statut: 200, entetes, texte });
const statut = (s: number, entetes: Record<string, string> = {}): ReponseBnb => ({ statut: s, entetes, texte: "corps d'erreur non documenté" });

/** Transport factice : route par chemin ; garde la trace des requêtes. */
function faux(routes: Record<string, ReponseBnb | (() => ReponseBnb)>): { transport: TransportBnb; requetes: RequeteBnb[] } {
  const requetes: RequeteBnb[] = [];
  const transport: TransportBnb = async (r) => {
    requetes.push(r);
    const chemin = r.url.replace(URL_BASE_TEST, "");
    const route = routes[chemin];
    if (!route) return statut(404);
    return typeof route === "function" ? route() : route;
  };
  return { transport, requetes };
}

const ROUTES_NOMINALES = (): Record<string, ReponseBnb> => ({
  "/authentic/legalEntity/0123456749/references": ok(fixture("references.json")),
  "/authentic/deposit/2025-00000222/accountingData": ok(fixture("compte-2025-00000222.json")),
  "/authentic/deposit/2024-00000333/accountingData": ok(fixture("compte-2024-00000333.json")),
  "/authentic/deposit/2023-00000444/accountingData": ok(fixture("compte-2023-00000444.json")),
});

const appeler = async (transport: TransportBnb, numero: string = NUMERO, config: ConfigBnb = CONFIG): Promise<any> => {
  const outil = outilComptesReel(new ClientBnb(config, transport, Date.now, () => "uuid-de-test"), () => new Date("2026-10-15T10:00:00Z"));
  return outil.executer({ numero }, {} as never);
};

describe("bnb réel : réponses nominales", () => {
  it("trois exercices du plus récent au plus ancien, un dépôt par exercice (la rectification remplace l'initial), effectif et total du bilan", async () => {
    const { transport, requetes } = faux(ROUTES_NOMINALES());
    const r = await appeler(transport);
    expect(r.trouve).toBe(true);
    expect(r.EnterpriseNumber).toBe(NUMERO);
    expect(r.environnement).toBe("test");
    expect(r.references.map((x: any) => x.ReferenceNumber)).toEqual(["2025-00000222", "2024-00000333", "2023-00000444"]);
    const [a, b, c] = r.references;
    expect(a.AccountingData.Rubrics).toEqual([
      { Code: "9087", Libelle: "Effectif moyen du personnel en équivalents temps plein", Period: "N", Value: 12.5 },
      { Code: "20/58", Libelle: "Total de l'actif (total du bilan)", Period: "N", Value: 1850000 },
      { Code: "10/15", Libelle: "Capitaux propres (fonds propres)", Period: "N", Value: 500 },
      { Code: "22", Libelle: "Terrains et constructions", Period: "N", Value: 350000 },
      { Code: "9904", Libelle: "Bénéfice (perte) de l'exercice", Period: "N", Value: 42000 },
    ]);
    expect(a).toMatchObject({ DepositDate: "2026-07-02", ExerciseDates: { startDate: "2025-01-01", endDate: "2025-12-31" }, ModelType: "m02-f", Language: "FR", Currency: "EUR", json_disponible: true });
    // Rubriques absentes du dépôt (10/15, 22) : valeur nulle, jamais devinée ; perte de 2024 lue en négatif (9904)
    expect(b.AccountingData.Rubrics.map((x: any) => x.Value)).toEqual([11, 1700000, null, null, -8000]);
    // Modèle micro sans effectif : valeur nulle, rien de deviné
    expect(c.AccountingData.Rubrics.map((x: any) => x.Value)).toEqual([null, 1500000, null, null, null]);
    expect(c.note).toMatch(/absente/);
    expect(r.taille_deduite).toBe("petite");
    // 1 liste + 3 dépôts (l'initial remplacé par la rectification n'est pas téléchargé)
    expect(requetes).toHaveLength(4);
  });

  it("en-têtes officiels : clé d'abonnement, X-Request-Id, Accept ; clé jamais dans l'URL ; GET sur l'hôte de test", async () => {
    const { transport, requetes } = faux(ROUTES_NOMINALES());
    await appeler(transport);
    expect(requetes[0]!.url).toBe("https://ws.uat2.cbso.nbb.be/authentic/legalEntity/0123456749/references");
    expect(requetes[0]!.entetes).toEqual({ [ENTETE_CLE]: CLE, "X-Request-Id": "uuid-de-test", Accept: "application/json" });
    expect(requetes[1]!.entetes["Accept"]).toMatch(/jsonxbrl/);
    for (const q of requetes) expect(q.url).not.toContain(CLE);
  });

  it("dépôt antérieur au 4 avril 2022 ou sans JSON : annoncé, sans chiffres, et sans appel inutile", async () => {
    const refs = JSON.parse(fixture("references.json")).filter((r: any) => ["2023-00000444", "2021-00000555"].includes(r.ReferenceNumber));
    const { transport, requetes } = faux({
      "/authentic/legalEntity/0123456749/references": ok(JSON.stringify(refs)),
      "/authentic/deposit/2023-00000444/accountingData": statut(404),
    });
    const r = await appeler(transport);
    const [recent, ancien] = r.references;
    expect(recent).toMatchObject({ ReferenceNumber: "2023-00000444", json_disponible: false, AccountingData: { Rubrics: [] } });
    expect(ancien).toMatchObject({ ReferenceNumber: "2021-00000555", json_disponible: false });
    expect(ancien.note).toMatch(/antérieur au 2022-04-04/);
    expect(r.taille_deduite).toBe("inconnue");
    expect(requetes.map((q) => q.url.split("/").slice(-2).join("/"))).toEqual(["0123456749/references", "2023-00000444/accountingData"]); // 2021 jamais interrogé
  });

  it("un contenu non JSON (PDF) pour un dépôt est traité comme « sans JSON », pas comme une erreur ni des chiffres devinés", async () => {
    const { transport } = faux({
      "/authentic/legalEntity/0123456749/references": ok(JSON.stringify([JSON.parse(fixture("references.json"))[0]])),
      "/authentic/deposit/2025-00000111/accountingData": ok("%PDF-1.7 binaire"),
    });
    const r = await appeler(transport);
    expect(r.references[0]).toMatchObject({ json_disponible: false });
  });

  it("aucun dépôt (liste vide ou 404) : trouve=false, liste vide, message clair", async () => {
    for (const reponse of [ok("[]"), statut(404)]) {
      const r = await appeler(faux({ "/authentic/legalEntity/0123456749/references": reponse }).transport);
      expect(r).toMatchObject({ trouve: false, motif: "aucun_depot", references: [] });
      expect(r.message).toMatch(/Aucun compte déposé/);
    }
  });

  it("forme de l'outil : nom, paramètre unique `numero`, lecture seule", () => {
    const reel = outilComptesReel(new ClientBnb(CONFIG, faux({}).transport));
    expect(reel.nom).toBe("bnb_comptes");
    expect(Object.keys(reel.schemaEntree)).toEqual(["numero"]);
    expect(reel.annotations?.readOnlyHint).toBe(true);
  });

  it("exercicesRetenus : ignore les dépôts sans date d'exercice, garde le plus récemment déposé", () => {
    const refs = JSON.parse(fixture("references.json"));
    refs.push({ ReferenceNumber: "X-1", DepositDate: "2027-01-01", ExerciseDates: { startDate: null, endDate: null } });
    const r = exercicesRetenus(refs.map((x: any) => ({ ReferenceNumber: x.ReferenceNumber, DepositDate: x.DepositDate, ExerciseDates: x.ExerciseDates, ModelType: null, DepositType: null, Language: null, Currency: null })));
    expect(r.map((x) => x.ReferenceNumber)).toEqual(["2025-00000222", "2024-00000333", "2023-00000444"]);
  });
});

describe("bnb réel : validation du numéro avant tout appel", () => {
  it("chiffre de contrôle faux, unité d'établissement ou format invalide : erreur, zéro requête", async () => {
    const { transport, requetes } = faux(ROUTES_NOMINALES());
    await expect(appeler(transport, "0123.456.789")).rejects.toThrow(/modulo 97/);
    await expect(appeler(transport, "2.123.456.789")).rejects.toThrow(/unité d'établissement/);
    await expect(appeler(transport, "abc")).rejects.toThrow(/invalide/);
    expect(requetes).toHaveLength(0);
  });
});

describe("bnb réel : erreurs, sans réessai et sans fuite de la clé", () => {
  const cas: [string, ReponseBnb, RegExp][] = [
    ["401", statut(401), /Clé BNB invalide ou absente/],
    ["403", statut(403), /Clé BNB invalide ou absente/],
    ["429 avec Retry-After", statut(429, { "retry-after": "37" }), /429.*réessayer après 37.*Retry-After/],
    ["429 sans Retry-After", statut(429), /Retry-After absent/],
    ["500", statut(500), /indisponible \(HTTP 500\)/],
    ["400", statut(400), /refusée.*HTTP 400/],
  ];
  for (const [nom, reponse, motif] of cas) {
    it(`${nom} : message clair, une seule requête, ni la clé ni le corps d'erreur dans le message`, async () => {
      const { transport, requetes } = faux({ "/authentic/legalEntity/0123456749/references": reponse });
      const e = await appeler(transport).then(() => null, (x: Error) => x);
      expect(e).toBeInstanceOf(Error);
      expect(e!.message).toMatch(motif);
      expect(e!.message).not.toContain(CLE);
      expect(e!.message).not.toContain("corps d'erreur");
      expect(requetes).toHaveLength(1);
    });
  }

  it("404 sur un dépôt n'interrompt pas la consultation ; 429 sur un dépôt l'interrompt sans réessai", async () => {
    const routes = ROUTES_NOMINALES();
    routes["/authentic/deposit/2024-00000333/accountingData"] = statut(429, { "retry-after": "5" });
    const { transport, requetes } = faux(routes);
    await expect(appeler(transport)).rejects.toThrow(/réessayer après 5/);
    expect(requetes.filter((q) => q.url.includes("2024-00000333"))).toHaveLength(1);
  });

  it("clé absente : erreur claire et aucune requête", async () => {
    const { transport, requetes } = faux(ROUTES_NOMINALES());
    await expect(appeler(transport, NUMERO, { ...CONFIG, cle: null })).rejects.toThrow(/Clé BNB invalide ou absente/);
    expect(requetes).toHaveLength(0);
  });

  it("réponse non JSON ou de forme inattendue pour la liste : erreur claire", async () => {
    for (const texte of ["<html>", '{"a":1}']) {
      await expect(appeler(faux({ "/authentic/legalEntity/0123456749/references": ok(texte) }).transport)).rejects.toThrow(/Réponse de la Centrale des bilans/);
    }
  });

  it("une référence au format suspect n'est jamais replacée dans une URL", async () => {
    const piege = [{ ReferenceNumber: "../../admin?x=1", DepositDate: "2025-01-01", ExerciseDates: { startDate: "2024-01-01", endDate: "2024-12-31" } }];
    const { transport, requetes } = faux({ "/authentic/legalEntity/0123456749/references": ok(JSON.stringify(piege)) });
    const r = await appeler(transport);
    expect(r.trouve).toBe(false);
    expect(requetes).toHaveLength(1);
  });

  it("délai : le délai par appel est borné, et le budget total coupe la consultation", async () => {
    const { transport, requetes } = faux(ROUTES_NOMINALES());
    await appeler(transport, NUMERO, { ...CONFIG, delaiAppelMs: 7000 });
    expect(requetes.every((q) => q.delaiMs <= 7000)).toBe(true);
    // Horloge qui saute de 101 s après la liste : budget total dépassé avant le premier dépôt
    let t = 0;
    const sauts = [0, 0, 101_000, 101_000, 101_000, 101_000, 101_000];
    const client = new ClientBnb(CONFIG, faux(ROUTES_NOMINALES()).transport, () => sauts[Math.min(t++, sauts.length - 1)]!, () => "u");
    await expect(outilComptesReel(client).executer({ numero: NUMERO }, {} as never)).rejects.toThrow(/Délai total/);
  });

  it("transport en erreur de délai : l'erreur du transport est propagée telle quelle", async () => {
    const transport: TransportBnb = async () => { throw new ErreurBnb("delai", "pas de réponse"); };
    await expect(appeler(transport)).rejects.toThrow(/\[delai\]/);
  });
});

describe("bnb réel : configuration et enregistrement", () => {
  it("URL de base : test par défaut, production reconnue, délai borné à 120 s, clé depuis variable ou fichier 0600", () => {
    expect(configDepuisEnv({}, lireFichierSecret)).toMatchObject({ cle: null, urlBase: URL_BASE_TEST, environnement: "test", delaiAppelMs: 30_000 });
    expect(configDepuisEnv({ PASSERELLE_BNB_URL_BASE: `${URL_BASE_PRODUCTION}/`, PASSERELLE_BNB_CLE: " k ", PASSERELLE_BNB_DELAI_MS: "999999" }, lireFichierSecret))
      .toMatchObject({ cle: "k", urlBase: URL_BASE_PRODUCTION, environnement: "production", delaiAppelMs: 120_000 });
    expect(configDepuisEnv({ PASSERELLE_BNB_URL_BASE: "http://127.0.0.1:9" }, lireFichierSecret).environnement).toBe("personnalise");
  });

  it("enregistrerProspectionReel inscrit `bnb` en mode réel, derrière le jeton de la passerelle ; sans clé BNB l'outil dit « clé absente »", async () => {
    const registre = new RegistreFournisseurs();
    const journal: string[] = [];
    const jeton = "j".repeat(40);
    const p = enregistrerProspectionReel(registre, { PASSERELLE_PROSPECTION_JETON: jeton }, { journal: (m) => journal.push(m), dossierEtat: "/nonexistent-etat" });
    try {
      expect(p?.services).toContain("bnb");
      const f = registre.obtenir("bnb");
      expect(f?.mode).toBe("reel");
      expect(f?.outils.map((o) => o.nom)).toEqual(["bnb_comptes"]);
      expect(f?.verifierJeton?.(jeton, "bnb")).not.toBeNull();
      expect(f?.verifierJeton?.("faux", "bnb")).toBeNull();
      await expect(f!.outils[0]!.executer({ numero: NUMERO }, {} as never)).rejects.toThrow(/Clé BNB invalide ou absente/);
      expect(journal.join("\n")).toMatch(/clé BNB absente/);
      expect(journal.join("\n")).not.toContain(jeton);
    } finally {
      p?.fermer();
    }
  });
});
