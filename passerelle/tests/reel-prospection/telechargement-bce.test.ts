// Lot P3 : téléchargement BCE (identifiants dans un fichier 0600, portail, plan de téléchargement) et commandes d'exploitation,
// contre un FAUX portail local. Le vrai portail n'est JAMAIS contacté : il exige l'inscription de l'opérateur.

import { chmodSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executer } from "../../src/reel/prospection/cli.js";
import {
  adressePortail, analyserNomArchive, ClientPortailBce, extraireArchives, lireIdentifiantsBce, planifier, telechargerNouveautes, type FichierPortail,
} from "../../src/reel/prospection/bce/telechargement.js";
import { IndexBce } from "../../src/reel/prospection/bce/index.js";
import { N, dossierTemporaire, fichierComplet, creerZip, miseAJour134, miseAJour135 } from "./aide-bce.js";
import { FauxPortailBce, type OptionsFauxPortail } from "./faux-portail-bce.js";

const MOT_DE_PASSE = "mot-de-passe-secret-de-test";
const ZIPS = {
  "KboOpenData_0133_2026_10_Full.zip": creerZip(fichierComplet()),
  "KboOpenData_0134_2026_10_Update.zip": creerZip(miseAJour134()),
  "KboOpenData_0135_2026_10_Update.zip": creerZip(miseAJour135()),
};
const IDENTIFIANTS = { identifiant: "operateur-test", motDePasse: MOT_DE_PASSE };

const fichier = (nom: string): FichierPortail => ({ ...analyserNomArchive(nom)!, url: `http://x/${nom}` });

describe("identifiants et adresse du portail", () => {
  it("lit identifiant et mot de passe dans un fichier 0600, refuse un fichier trop ouvert, sans jamais citer le secret", () => {
    const d = dossierTemporaire();
    const f = join(d, "bce.env");
    writeFileSync(f, `# identifiants de test\nidentifiant=operateur-test\nmot_de_passe="${MOT_DE_PASSE}"\n`, { mode: 0o600 });
    chmodSync(f, 0o600);
    expect(lireIdentifiantsBce({ PASSERELLE_BCE_IDENTIFIANTS_FICHIER: f })).toEqual(IDENTIFIANTS);
    chmodSync(f, 0o644);
    expect(() => lireIdentifiantsBce({ PASSERELLE_BCE_IDENTIFIANTS_FICHIER: f })).toThrow(/chmod 600/);
    chmodSync(f, 0o600);
    writeFileSync(f, "identifiant=seul\n");
    expect(() => lireIdentifiantsBce({ PASSERELLE_BCE_IDENTIFIANTS_FICHIER: f })).toThrow(/obligatoires/);
    expect(() => lireIdentifiantsBce({})).toThrow(/PASSERELLE_BCE_IDENTIFIANTS_FICHIER absent/);
    expect(() => lireIdentifiantsBce({ PASSERELLE_BCE_IDENTIFIANTS_FICHIER: join(d, "absent") })).toThrow(/introuvable/);
    for (const env of [{ PASSERELLE_BCE_IDENTIFIANTS_FICHIER: f }, {}]) {
      try {
        lireIdentifiantsBce(env);
      } catch (e) {
        expect(String(e)).not.toContain(MOT_DE_PASSE);
      }
    }
  });

  it("portail : le vrai par défaut ; un faux seulement sur la boucle locale", () => {
    expect(adressePortail({}).origin).toBe("https://kbopub.economie.fgov.be");
    expect(adressePortail({ PASSERELLE_BCE_PORTAIL_URL: "http://127.0.0.1:9999" }).origin).toBe("http://127.0.0.1:9999");
    expect(() => adressePortail({ PASSERELLE_BCE_PORTAIL_URL: "http://exemple.org" })).toThrow(/boucle locale/);
    expect(() => adressePortail({ PASSERELLE_BCE_PORTAIL_URL: "https://127.0.0.1" })).toThrow(/boucle locale/);
  });
});

describe("plan de téléchargement", () => {
  const tous = ["KboOpenData_0133_2026_10_Full.zip", "KboOpenData_0134_2026_10_Update.zip", "KboOpenData_0135_2026_10_Update.zip"].map(fichier);
  const noms = (p: { telecharger: FichierPortail[] }): string[] => p.telecharger.map((f) => f.nom);

  it("analyse des noms d'archives", () => {
    expect(analyserNomArchive("KboOpenData_0133_2025_03_Full.zip")).toEqual({ nom: "KboOpenData_0133_2025_03_Full.zip", type: "complet", numero: 133, annee: 2025, mois: 3 });
    expect(analyserNomArchive("kboopendata_0052_2018_05_update.zip")?.type).toBe("mise_a_jour");
    expect(analyserNomArchive("autre.zip")).toBeNull();
  });
  it("sans index : le dernier fichier complet puis les mises à jour suivantes", () => {
    expect(noms(planifier(tous, null))).toEqual(["KboOpenData_0133_2026_10_Full.zip", "KboOpenData_0134_2026_10_Update.zip", "KboOpenData_0135_2026_10_Update.zip"]);
  });
  it("avec index : seulement les mises à jour de numéro supérieur, dans l'ordre", () => {
    expect(noms(planifier(tous, 133))).toEqual(["KboOpenData_0134_2026_10_Update.zip", "KboOpenData_0135_2026_10_Update.zip"]);
    expect(noms(planifier(tous, 134))).toEqual(["KboOpenData_0135_2026_10_Update.zip"]);
    expect(planifier(tous, 135)).toEqual({ telecharger: [], trou: false });
  });
  it("trou : les mises à jour disponibles sautent des numéros → repartir du dernier fichier complet", () => {
    const p = planifier(tous, 130);
    expect(p.trou).toBe(true);
    expect(noms(p)).toEqual(["KboOpenData_0133_2026_10_Full.zip", "KboOpenData_0134_2026_10_Update.zip", "KboOpenData_0135_2026_10_Update.zip"]);
  });
  it("extraction des liens : adresses relatives résolues, autre site ignoré", () => {
    const html = '<a href="/kbo-open-data/files/KboOpenData_0133_2026_10_Full.zip">x</a><a href="https://autre.example/KboOpenData_0140_2026_10_Full.zip">y</a><a href="/a.pdf">z</a>';
    const l = extraireArchives(html, new URL("http://127.0.0.1:1/kbo-open-data/"));
    expect(l.map((f) => f.url)).toEqual(["http://127.0.0.1:1/kbo-open-data/files/KboOpenData_0133_2026_10_Full.zip"]);
  });
});

describe("client du portail (faux portail local)", () => {
  let faux: FauxPortailBce | null = null;
  afterEach(async () => {
    await faux?.arreter();
    faux = null;
  });
  const demarrer = async (o: Partial<OptionsFauxPortail> = {}): Promise<ClientPortailBce> => {
    faux = new FauxPortailBce({ identifiant: IDENTIFIANTS.identifiant, motDePasse: MOT_DE_PASSE, fichiers: ZIPS, ...o });
    return new ClientPortailBce(new URL(await faux.demarrer()));
  };

  it("connexion (cookies de session), liste et téléchargement des archives manquantes", async () => {
    const client = await demarrer();
    const dossier = join(dossierTemporaire(), "dl");
    const r = await telechargerNouveautes(client, IDENTIFIANTS, dossier, 133);
    expect(r.plan).toMatchObject({ trou: false });
    expect(r.fichiers.map((f) => f.split("/").pop())).toEqual(["KboOpenData_0134_2026_10_Update.zip", "KboOpenData_0135_2026_10_Update.zip"]);
    expect(readdirSync(dossier).sort()).toEqual(["KboOpenData_0134_2026_10_Update.zip", "KboOpenData_0135_2026_10_Update.zip"]);
    // Le formulaire a bien été envoyé en POST avec les champs du vrai portail ; le mot de passe n'est jamais dans une adresse.
    expect(faux!.corps).toHaveLength(1);
    expect(new URLSearchParams(faux!.corps[0]).get("j_username")).toBe(IDENTIFIANTS.identifiant);
    for (const r2 of faux!.requetes) expect(r2.chemin).not.toContain(MOT_DE_PASSE);
    expect(faux!.requetes[0]).toEqual({ methode: "GET", chemin: "/kbo-open-data/login?lang=fr" });
  });

  it("liste sur une page secondaire (« affiliation »)", async () => {
    const client = await demarrer({ listeSurAccueil: false });
    await client.connecter(IDENTIFIANTS);
    expect((await client.lister()).map((f) => f.numero)).toEqual([133, 134, 135]);
  });

  it("identifiants refusés : erreur claire, sans le mot de passe", async () => {
    const client = await demarrer();
    const e = await client.connecter({ identifiant: "operateur-test", motDePasse: "mauvais-mot-de-passe-xyz" }).catch((x: Error) => x);
    expect(String(e)).toMatch(/refusée/);
    expect(String(e)).not.toContain("mauvais-mot-de-passe-xyz");
  });

  it("aucune archive trouvée : erreur claire plutôt qu'une supposition", async () => {
    const client = await demarrer({ vide: true });
    await client.connecter(IDENTIFIANTS);
    await expect(client.lister()).rejects.toThrow(/structure du portail/);
  });

  it("redirection vers un autre site refusée", async () => {
    // Après l'authentification, la page d'accueil renvoie vers un autre site : la connexion suit la redirection à la main et la refuse.
    const client = await demarrer({ redirectionExterne: "http://exemple.org/pirate" });
    await expect(client.connecter(IDENTIFIANTS)).rejects.toThrow(/Redirection hors du portail refusée/);
    expect(faux!.requetes.every((r) => !r.chemin.includes("pirate"))).toBe(true);
  });

  it("page web reçue à la place de l'archive : refus, aucun fichier partiel laissé", async () => {
    const client = await demarrer({ htmlAuLieuDuZip: true });
    const dossier = join(dossierTemporaire(), "dl");
    await client.connecter(IDENTIFIANTS);
    const [premier] = await client.lister();
    await expect(client.telecharger(premier!, dossier)).rejects.toThrow(/page web/);
    expect(existsSync(dossier) ? readdirSync(dossier) : []).toEqual([]);
  });
});

describe("commandes d'exploitation (cli)", () => {
  let faux: FauxPortailBce | null = null;
  afterEach(async () => {
    await faux?.arreter();
    faux = null;
  });

  it("bce-telecharger --importer : du faux portail à un index interrogeable, puis reprise sans rien refaire", async () => {
    faux = new FauxPortailBce({ identifiant: IDENTIFIANTS.identifiant, motDePasse: MOT_DE_PASSE, fichiers: ZIPS });
    const url = await faux.demarrer();
    const d = dossierTemporaire();
    const f = join(d, "bce.env");
    writeFileSync(f, `identifiant=${IDENTIFIANTS.identifiant}\nmot_de_passe=${MOT_DE_PASSE}\n`, { mode: 0o600 });
    const env = { PASSERELLE_BCE_PORTAIL_URL: url, PASSERELLE_BCE_IDENTIFIANTS_FICHIER: f, PASSERELLE_BCE_INDEX: join(d, "bce.sqlite") };
    const r = (await executer(["bce-telecharger", "--importer", "--dossier", join(d, "dl")], env)) as { fichiers: string[]; importes: { type: string; statut: string }[] };
    expect(r.fichiers).toHaveLength(3);
    expect(r.importes.map((i) => `${i.type}:${i.statut}`)).toEqual(["complet:applique", "mise_a_jour:applique", "mise_a_jour:applique"]);
    const idx = new IndexBce(join(d, "bce.sqlite"));
    expect(idx.meta()["ExtractNumber"]).toBe("135");
    expect(idx.entite(N.nouvelle)).not.toBeNull();
    expect(idx.entite(N.couvreurNamur)).toBeNull(); // devenue personne physique à la mise à jour 135
    idx.fermer();
    // Deuxième passage : l'index est à jour, rien à télécharger.
    const r2 = (await executer(["bce-telecharger", "--importer", "--dossier", join(d, "dl")], env)) as { fichiers: string[] };
    expect(r2.fichiers).toEqual([]);
  });

  it("bce-importer détecte le type d'archive ; erreurs d'usage claires", async () => {
    const d = dossierTemporaire();
    writeFileSync(join(d, "c.zip"), ZIPS["KboOpenData_0133_2026_10_Full.zip"]);
    writeFileSync(join(d, "u.zip"), ZIPS["KboOpenData_0134_2026_10_Update.zip"]);
    const env = { PASSERELLE_BCE_INDEX: join(d, "i.sqlite") };
    expect(await executer(["bce-importer", join(d, "c.zip")], env)).toMatchObject({ type: "complet", statut: "applique" });
    expect(await executer(["bce-importer", join(d, "u.zip")], env)).toMatchObject({ type: "mise_a_jour", statut: "applique", evenements: 5 });
    expect(await executer(["bce-importer", join(d, "u.zip")], env)).toMatchObject({ statut: "deja_appliquee" });
    expect(await executer(["bce-importer", join(d, "u.zip"), "--forcer"], env)).toMatchObject({ statut: "applique", evenements: 0 });
    await expect(executer(["bce-importer"], env)).rejects.toThrow(/un seul fichier/);
    await expect(executer(["inconnue"], env)).rejects.toThrow(/Commande inconnue/);
    await expect(executer([], env)).rejects.toThrow(/Commande manquante/);
    await expect(executer(["bce-importer", join(d, "u.zip"), "--conservation-jours", "x"], env)).rejects.toThrow(/nombre entier/);
  });

  it("osm-importer : importe l'extrait fictif", async () => {
    const d = dossierTemporaire();
    const r = (await executer(["osm-importer", new URL("./fixtures/extrait-osm.geojsonseq", import.meta.url).pathname, "--date", "2026-10-14"], { PASSERELLE_OSM_INDEX: join(d, "o.sqlite") })) as { compteurs: { retenues: number } };
    expect(r.compteurs.retenues).toBe(15);
  });
});
