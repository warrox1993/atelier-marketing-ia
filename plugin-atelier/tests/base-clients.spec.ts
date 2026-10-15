/**
 * Lot P7 : base de clients (lecture CSV/XLSX, correspondance, chiffrement, empreintes, ventes croisées, purge).
 * Données fictives : domaines `.invalid`, mentions « (démonstration) », numéros BCE calculés pour le test.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { ClientBase, ImportBaseClients, type CorrespondanceColonnes, type RegleVenteCroisee } from "../src/contrats/index.js";
import { chiffrer, dechiffrer, empreinte, ErreurChiffrement, identifiantCle } from "../src/serveur/chiffrement-donnees.js";
import {
  aPurger,
  calculerPurge,
  colonnesSensibles,
  lireFichierBaseClients,
  normaliserPourEmpreinte,
  opportunitesVenteCroisee,
  preparerImportBaseClients,
  type ClesImport,
  type ContexteImport,
  type EntreePreparation,
  zeroInitialRestaure,
} from "../src/serveur/base-clients.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const AUTRE_COMPANY = "22222222-2222-4222-8222-222222222222";
const MAINTENANT = "2026-10-15T10:00:00+02:00";

/** Numéro BCE valide : 8 chiffres + 2 chiffres de contrôle (97 − base mod 97). */
function bce(base8: number): string {
  const controle = 97 - (base8 % 97);
  return `${String(base8).padStart(8, "0")}${String(controle).padStart(2, "0")}`;
}
const BCE_1 = bce(12345678);
const BCE_1_FORMATE = `${BCE_1.slice(0, 4)}.${BCE_1.slice(4, 7)}.${BCE_1.slice(7)}`;

const nouvellesCles = (): ClesImport => ({ chiffrement: randomBytes(32), hmac: randomBytes(32) });
const ctx = (extra: Partial<ContexteImport> = {}): ContexteImport => ({
  companyId: COMPANY,
  importePar: "jb (démonstration)",
  maintenant: MAINTENANT,
  mode: "demonstration",
  ...extra,
});

const COLONNES = ["Réf", "Nom", "Prénom", "Société", "TVA", "Mail", "GSM", "Rue", "CP", "Ville", "Produits", "Début", "Statut", "Accord mail"];
const CORRESPONDANCE: CorrespondanceColonnes = [
  { colonne: "Réf", cible: "identifiant_client" },
  { colonne: "Nom", cible: "nom" },
  { colonne: "Prénom", cible: "prenom" },
  { colonne: "Société", cible: "entreprise" },
  { colonne: "TVA", cible: "numero_bce" },
  { colonne: "Mail", cible: "courriel" },
  { colonne: "GSM", cible: "telephone" },
  { colonne: "Rue", cible: "adresse" },
  { colonne: "CP", cible: "code_postal" },
  { colonne: "Ville", cible: "commune" },
  { colonne: "Produits", cible: "produits_detenus" },
  { colonne: "Début", cible: "debut_contrat" },
  { colonne: "Statut", cible: "statut_client" },
  { colonne: "Accord mail", cible: "consentement_courriel" },
];

const LIGNES: string[][] = [
  ["C-001", "Dupuis (démonstration)", "Alice", "", "", "Alice.Dupuis@exemple.invalid", "0470 12 34 56", "1 rue Fictive", "4000", "Liège", "auto;habitation", "2024-03-15", "actif", "oui"],
  ["C-002", "Martin (démonstration)", "Bruno", "Atelier Martin (démonstration)", BCE_1, "bruno@exemple.invalid", "+32 4 222 33 44", "2 rue Inventée", "5000", "Namur", "auto", "15/06/2023", "actif", "non"],
  ["C-003", "Ancien (démonstration)", "Claire", "", "", "claire@exemple.invalid", "", "", "1000", "Bruxelles", "auto", "2020-01-01", "ancien", ""],
  ["C-004", "Rejet (démonstration)", "Denis", "", "", "pas-un-courriel", "", "", "4000", "Liège", "auto", "2022-02-02", "actif", ""],
];

function csv(colonnes: string[], lignes: string[][], sep = ";"): Uint8Array {
  const cellule = (c: string) => (/[;,"\n]/u.test(c) ? `"${c.replaceAll('"', '""')}"` : c);
  return Buffer.from([colonnes, ...lignes].map((l) => l.map(cellule).join(sep)).join("\n"), "utf8");
}

function xlsx(colonnes: string[], lignes: string[][]): Uint8Array {
  const feuille = XLSX.utils.aoa_to_sheet([colonnes, ...lignes]);
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, "Clients");
  XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet([["Ignorée"], ["seconde feuille"]]), "Autre");
  return new Uint8Array(XLSX.write(classeur, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

function entree(format: "csv" | "xlsx", contenu: Uint8Array, extra: Partial<EntreePreparation> = {}): EntreePreparation {
  return {
    nomFichier: `clients.${format}`,
    format,
    contenu,
    correspondance: CORRESPONDANCE,
    finalite: "Suivi de la clientèle (démonstration)",
    ...extra,
  };
}

function ids() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

describe("chiffrement-donnees", () => {
  it("chiffre et déchiffre à l'aller-retour, au format chv1 avec l'identifiant de clé", () => {
    const cle = randomBytes(32);
    const c = chiffrer("Alice Dupuis (démonstration)", cle);
    expect(c).toMatch(/^chv1\.[0-9a-f]{16}\./u);
    expect(c.split(".")[1]).toBe(identifiantCle(cle));
    expect(c).not.toContain("Alice");
    expect(dechiffrer(c, cle)).toBe("Alice Dupuis (démonstration)");
    expect(chiffrer("Alice", cle)).not.toBe(chiffrer("Alice", cle));
  });

  it("refuse explicitement une clé différente", () => {
    const c = chiffrer("secret (démonstration)", randomBytes(32));
    expect(() => dechiffrer(c, randomBytes(32))).toThrowError(ErreurChiffrement);
    try {
      dechiffrer(c, randomBytes(32));
    } catch (e) {
      expect((e as ErreurChiffrement).motif).toBe("cle_differente");
    }
  });

  it("refuse un tag ou un contenu altéré, un format inconnu et des clés de mauvaise taille", () => {
    const cle = randomBytes(32);
    const parts = chiffrer("secret (démonstration)", cle).split(".");
    const tag = parts[4]!;
    parts[4] = (tag[0] === "A" ? "B" : "A") + tag.slice(1);
    expect(() => dechiffrer(parts.join("."), cle)).toThrowError(/Tag d'authentification invalide/u);
    expect(() => dechiffrer("pas-chiffre", cle)).toThrowError(/chv1/u);
    expect(() => chiffrer("x", randomBytes(16))).toThrowError(ErreurChiffrement);
    expect(() => chiffrer("", cle)).toThrowError(/vide/u);
    expect(() => empreinte("courriel", "a@exemple.invalid", randomBytes(8))).toThrowError(ErreurChiffrement);
  });

  it("calcule des empreintes stables, dépendantes du type et de la clé HMAC", () => {
    const k = randomBytes(32);
    const a = empreinte("courriel", "a@exemple.invalid", k);
    expect(a).toMatch(/^[0-9a-f]{64}$/u);
    expect(empreinte("courriel", "a@exemple.invalid", k)).toBe(a);
    expect(empreinte("identifiant_client", "a@exemple.invalid", k)).not.toBe(a);
    expect(empreinte("courriel", "a@exemple.invalid", randomBytes(32))).not.toBe(a);
  });
});

describe("colonnes sensibles", () => {
  it("repère santé, sinistre et bancaire sans accents ni casse, sans faux positif sur « public »", () => {
    expect(colonnesSensibles(["Nom", "Santé", "IBAN client", "Sinistres 2024", "Compte Bancaire", "Public cible", "Bicyclette", "N° NISS"])).toEqual([
      "Santé",
      "IBAN client",
      "Sinistres 2024",
      "Compte Bancaire",
      "N° NISS",
    ]);
  });
});

describe("lecture du fichier", () => {
  it("lit un CSV : colonnes, aperçu limité à 20 lignes, formules neutralisées dans l'aperçu", () => {
    const lignes = Array.from({ length: 30 }, (_, i) => [`C-${i}`, i === 0 ? "=SOMME(A1)" : "Nom", "x", "", "", `m${i}@exemple.invalid`, "", "", "4000", "Liège", "auto", "", "actif", ""]);
    const r = lireFichierBaseClients({ nomFichier: "a.csv", format: "csv", contenu: csv(COLONNES, lignes) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.colonnes).toEqual(COLONNES);
    expect(r.lignes).toHaveLength(30);
    expect(r.apercu).toHaveLength(20);
    expect(r.apercu[0]![1]).toBe("'=SOMME(A1)");
    expect(r.formulesNeutralisees).toBe(1);
    expect(r.empreinteFichier).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("lit la première feuille d'un XLSX seulement", () => {
    const r = lireFichierBaseClients({ nomFichier: "a.xlsx", format: "xlsx", contenu: xlsx(COLONNES, LIGNES) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.colonnes).toEqual(COLONNES);
    expect(r.lignes).toHaveLength(LIGNES.length);
    expect(JSON.stringify(r)).not.toContain("seconde feuille");
  });

  it("refuse une colonne sensible même non associée, et ne produit aucun client", () => {
    const contenu = csv([...COLONNES, "Santé"], LIGNES.map((l) => [...l, "ok"]));
    const r = preparerImportBaseClients(entree("csv", contenu), nouvellesCles(), ctx());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.colonnesSensiblesRefusees).toEqual(["Santé"]);
    expect(r.motif).toContain("Santé");
  });

  it("refuse .xlsm, classeur à macros, fichier non XLSX, vide, trop gros, binaire, séparateur divergent", () => {
    const base = { format: "xlsx" as const, contenu: xlsx(COLONNES, LIGNES) };
    expect(lireFichierBaseClients({ ...base, nomFichier: "a.xlsm" })).toMatchObject({ ok: false });
    const macros = Buffer.concat([Buffer.from(base.contenu), Buffer.from("xl/vbaProject.bin")]);
    expect(lireFichierBaseClients({ ...base, nomFichier: "a.xlsx", contenu: macros })).toMatchObject({ ok: false, motif: expect.stringContaining("macros") });
    expect(lireFichierBaseClients({ ...base, nomFichier: "a.xlsx", contenu: Buffer.from("pas un zip") })).toMatchObject({ ok: false });
    expect(lireFichierBaseClients({ nomFichier: "a.csv", format: "csv", contenu: new Uint8Array() })).toMatchObject({ ok: false, motif: "Fichier vide." });
    expect(lireFichierBaseClients({ nomFichier: "a.csv", format: "csv", contenu: new Uint8Array(6 * 1024 * 1024 + 1) })).toMatchObject({ ok: false });
    expect(lireFichierBaseClients({ nomFichier: "a.csv", format: "csv", contenu: Buffer.from([0x41, 0xff, 0xfe, 0x0a]) })).toMatchObject({ ok: false });
    expect(lireFichierBaseClients({ nomFichier: "a.csv", format: "csv", contenu: csv(COLONNES, LIGNES), separateur: "," })).toMatchObject({ ok: false });
    expect(lireFichierBaseClients({ nomFichier: "a.txt", format: "csv", contenu: csv(COLONNES, LIGNES) })).toMatchObject({ ok: false });
  });
});

describe("préparation de l'import", () => {
  for (const format of ["csv", "xlsx"] as const) {
    it(`${format} : correspondance, rejet expliqué, comptes exacts, clients conformes à ClientBase`, () => {
      const contenu = format === "csv" ? csv(COLONNES, LIGNES) : xlsx(COLONNES, LIGNES);
      const r = preparerImportBaseClients(entree(format, contenu), nouvellesCles(), ctx({ genererId: ids() }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(ImportBaseClients.safeParse(r.import).success).toBe(true);
      r.clients.forEach((c) => expect(ClientBase.safeParse(c).success).toBe(true));
      expect(r.import).toMatchObject({ lignesLues: 4, lignesRetenues: 3, lignesRejetees: 1, format, dureeConservationMois: 12 });
      expect(r.import.rejets).toEqual([{ ligne: 5, motif: "Adresse électronique invalide." }]);
      expect(r.import.purgeLe).toBe(calculerPurge(MAINTENANT, 12));
      const [particulier, entreprise, ancien] = r.clients;
      expect(particulier).toMatchObject({ typeClient: "particulier", entreprise: null, numeroBce: null, codePostal: "4000", statut: "actif", debutContrat: "2024-03-15" });
      expect(particulier!.consentements).toEqual({ courriel: true, sms: null, telephone: null });
      expect(particulier!.produitsDetenus).toEqual(["auto", "habitation"]);
      expect(entreprise).toMatchObject({ typeClient: "entreprise", numeroBce: BCE_1_FORMATE, entreprise: "Atelier Martin (démonstration)", debutContrat: "2023-06-15" });
      expect(entreprise!.consentements.courriel).toBe(false);
      expect(ancien!.statut).toBe("ancien");
      expect(Object.keys(particulier!.donneesChiffrees).sort()).toEqual(["adresse", "courriel", "identifiant_client", "nom", "prenom", "telephone"]);
      expect(particulier!.pseudonyme).toMatch(/^\[client-[0-9a-f]{8}\]$/u);
    });
  }

  it("compte exactement les rejets et n'en détaille que 200", () => {
    const lignes = Array.from({ length: 250 }, (_, i) => [`C-${i}`, "N", "P", "", "", "invalide", "", "", "4000", "Liège", "auto", "", "actif", ""]);
    const r = preparerImportBaseClients(entree("csv", csv(COLONNES, lignes)), nouvellesCles(), ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.import).toMatchObject({ lignesLues: 250, lignesRetenues: 0, lignesRejetees: 250 });
    expect(r.import.rejets).toHaveLength(200);
    expect(r.import.rejets[199]!.ligne).toBe(201);
  });

  it("rejette ligne par ligne avec la raison, sans citer la valeur", () => {
    const mauvaises = [
      ["C-1", "N", "P", "", "0123.456.789", "a@exemple.invalid", "", "", "4000", "Liège", "", "", "actif", ""],
      ["C-2", "N", "P", "", "", "a@exemple.invalid", "123", "", "4000", "Liège", "", "", "actif", ""],
      ["C-3", "N", "P", "", "", "a@exemple.invalid", "", "", "40", "Liège", "", "", "actif", ""],
      ["C-4", "N", "P", "", "", "a@exemple.invalid", "", "", "4000", "Liège", "", "31/02/2024", "actif", ""],
      ["C-5", "N", "P", "", "", "a@exemple.invalid", "", "", "4000", "Liège", "", "", "bizarre", ""],
      ["C-6", "N", "P", "", "", "a@exemple.invalid", "", "", "4000", "Liège", "", "", "actif", "peut-être"],
      ["C-7", "=CMD()", "P", "", "", "a@exemple.invalid", "", "", "4000", "Liège", "", "", "actif", ""],
      ["C-8", "N", "P", "Société (démonstration)", "", "a@exemple.invalid", "", "", "4000", "Liège", "", "", "actif", ""],
      ["", "", "", "", "", "", "", "", "", "", "", "", "actif", ""],
    ];
    // Mode réel : le contrôle modulo 97 du numéro BCE est entier (en démonstration, voir le test suivant).
    const r = preparerImportBaseClients(entree("csv", csv(COLONNES, mauvaises)), nouvellesCles(), ctx({ mode: "reel" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.import.lignesRejetees).toBe(mauvaises.length - 1);
    expect(r.import.lignesRetenues).toBe(1);
    const motifs = r.import.rejets.map((x) => x.motif).join("\n");
    expect(motifs).toContain("BCE");
    expect(motifs).toContain("téléphone");
    expect(motifs).toContain("Code postal");
    expect(motifs).toContain("début de contrat");
    expect(motifs).toContain("Statut");
    expect(motifs).toContain("Consentement");
    expect(motifs).toContain("formule");
    expect(motifs).toContain("Aucun identifiant");
    expect(motifs).not.toContain("0123.456.789");
  });

  it("refuse une correspondance invalide ou une colonne absente du fichier", () => {
    const contenu = csv(COLONNES, LIGNES);
    expect(preparerImportBaseClients(entree("csv", contenu, { correspondance: [{ colonne: "Nom", cible: "nom" }] }), nouvellesCles(), ctx())).toMatchObject({ ok: false });
    const inconnue = [...CORRESPONDANCE, { colonne: "Inexistante", cible: "ignorer" as const }];
    expect(preparerImportBaseClients(entree("csv", contenu, { correspondance: inconnue }), nouvellesCles(), ctx())).toMatchObject({ ok: false, motif: expect.stringContaining("Inexistante") });
    expect(preparerImportBaseClients(entree("csv", contenu, { dureeConservationMois: 121 }), nouvellesCles(), ctx())).toMatchObject({ ok: false });
    const memes = randomBytes(32);
    expect(() => preparerImportBaseClients(entree("csv", contenu), { chiffrement: memes, hmac: memes }, ctx())).toThrowError(/distincte/u);
  });

  it("n'écrit aucune valeur en clair dans la sortie sérialisée, et ne garde pas le fichier", () => {
    const r = preparerImportBaseClients(entree("csv", csv(COLONNES, LIGNES)), nouvellesCles(), ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Les valeurs chiffrées (chv1.…) et les empreintes (64 hex) sont aléatoires : « 0470 » peut y apparaître
    // par hasard (environ 1 fois sur 70). On les retire avant de chercher une fuite EN CLAIR.
    const json = JSON.stringify(r).replace(/chv1\.[A-Za-z0-9_.-]+/gu, "«chiffré»").replace(/[0-9a-f]{64}/gu, "«empreinte»");
    for (const secret of ["Dupuis", "Alice", "Alice.Dupuis@exemple.invalid", "alice.dupuis", "0470", "+32470", "rue Fictive", "C-001", "Bruno", "bruno@exemple", "222 33 44", "Inventée", "Claire", "pas-un-courriel"]) {
      expect(json, `fuite de « ${secret} »`).not.toContain(secret);
    }
    // Seuls l'empreinte du fichier et les comptes subsistent.
    expect(Object.keys(r.import)).not.toContain("contenu");
    expect(r.import.empreinteFichier).toMatch(/^[0-9a-f]{64}$/u);
    // Le nom d'une entreprise et la commune restent lisibles (ce ne sont pas des identifiants directs, §4.3).
    expect(json).toContain("Atelier Martin (démonstration)");
  });

  it("déchiffre les identifiants directs avec la bonne clé", () => {
    const cles = nouvellesCles();
    const r = preparerImportBaseClients(entree("csv", csv(COLONNES, LIGNES)), cles, ctx());
    if (!r.ok) throw new Error("import attendu");
    const c = r.clients[0]!.donneesChiffrees;
    expect(dechiffrer(c.nom!, cles.chiffrement)).toBe("Dupuis (démonstration)");
    expect(dechiffrer(c.courriel!, cles.chiffrement)).toBe("Alice.Dupuis@exemple.invalid");
    expect(dechiffrer(c.identifiant_client!, cles.chiffrement)).toBe("C-001");
  });

  it("isole deux entreprises : clés différentes, aucun déchiffrement croisé, empreintes sans rapport", () => {
    const clesA = nouvellesCles();
    const clesB = nouvellesCles();
    const contenu = csv(COLONNES, LIGNES);
    const a = preparerImportBaseClients(entree("csv", contenu), clesA, ctx());
    const b = preparerImportBaseClients(entree("csv", contenu), clesB, ctx({ companyId: AUTRE_COMPANY }));
    if (!a.ok || !b.ok) throw new Error("imports attendus");
    expect(() => dechiffrer(a.clients[0]!.donneesChiffrees.nom!, clesB.chiffrement)).toThrowError(/autre clé/u);
    expect(() => dechiffrer(b.clients[0]!.donneesChiffrees.nom!, clesA.chiffrement)).toThrowError(/autre clé/u);
    const valeursA = new Set(a.clients.flatMap((c) => c.empreintes.map((e) => e.valeur)));
    expect(b.clients.flatMap((c) => c.empreintes.map((e) => e.valeur)).some((v) => valeursA.has(v))).toBe(false);
  });

  it("donne la même empreinte à deux écritures du même courriel, du même téléphone et du même nom", () => {
    const cles = nouvellesCles();
    const ligne = (courriel: string, tel: string, nom: string, cp: string) => ["", nom, "", "", "", courriel, tel, "", cp, "", "", "", "", ""];
    const r = preparerImportBaseClients(
      entree("csv", csv(COLONNES, [ligne("  ALICE@Exemple.Invalid ", "0470/12.34.56", "DUPUIS Élodie", "4000"), ligne("alice@exemple.invalid", "+32470123456", "dupuis élodie", "4000")])),
      cles,
      ctx(),
    );
    if (!r.ok) throw new Error("import attendu");
    expect(r.import.lignesRetenues).toBe(2);
    const [a, b] = r.clients as [ClientBase, ClientBase];
    expect(a.empreintes).toEqual(b.empreintes);
    expect(a.pseudonyme).toBe(b.pseudonyme);
    expect(normaliserPourEmpreinte("courriel", " ALICE@Exemple.Invalid ")).toBe("alice@exemple.invalid");
    expect(normaliserPourEmpreinte("nom_code_postal", "DUPUIS Élodie|4000")).toBe("dupuis elodie|4000");
    expect(normaliserPourEmpreinte("numero_bce", `BE ${BCE_1_FORMATE}`)).toBe(BCE_1);
    // Une empreinte se retrouve à partir de la valeur normalisée et de la clé HMAC (opposition, dédoublonnage).
    expect(a.empreintes.some((e) => e.type === "courriel" && e.valeur === empreinte("courriel", "alice@exemple.invalid", cles.hmac))).toBe(true);
  });
});

describe("ventes croisées", () => {
  const regle = (detenue: string, proposee: string, extra: Partial<RegleVenteCroisee> = {}): RegleVenteCroisee => ({
    companyId: COMPANY,
    detenue,
    proposee,
    typeClient: "particulier",
    decidePar: "jb (démonstration)",
    decideLe: MAINTENANT,
    ...extra,
  });

  function clients(): ClientBase[] {
    const r = preparerImportBaseClients(
      entree("csv", csv(COLONNES, [
        ["C-1", "A", "A", "", "", "a@exemple.invalid", "", "", "4000", "Liège", "auto", "2024-01-01", "actif", ""],
        ["C-2", "B", "B", "", "", "b@exemple.invalid", "", "", "4000", "Liège", "auto;habitation", "2024-01-01", "actif", ""],
        ["C-3", "C", "C", "", "", "c@exemple.invalid", "", "", "4000", "Liège", "auto", "2024-01-01", "ancien", ""],
        ["C-4", "D", "D", "Société D (démonstration)", "", "d@exemple.invalid", "", "", "4000", "Liège", "auto", "2024-01-01", "actif", ""],
      ])),
      nouvellesCles(),
      ctx({ genererId: ids() }),
    );
    if (!r.ok) throw new Error("import attendu");
    return r.clients;
  }

  it("propose l'offre manquante : détient auto, pas habitation", () => {
    const sortie = opportunitesVenteCroisee(clients(), [regle("auto", "habitation")], MAINTENANT);
    expect(sortie).toHaveLength(1);
    expect(sortie[0]).toMatchObject({ detenus: ["auto"], proposes: ["habitation"], typeClient: "particulier", mode: "demonstration" });
    expect(sortie[0]!.zone).toMatchObject({ codePostal: "4000", commune: "Liège" });
    expect(JSON.stringify(sortie)).not.toContain("exemple.invalid");
  });

  it("ne compte pas un contrat résilié (client ancien ou fin passée) comme détenu", () => {
    const cs = clients();
    expect(opportunitesVenteCroisee(cs, [regle("auto", "habitation")], MAINTENANT).map((o) => o.clientId)).not.toContain(cs[2]!.id);
    const terminé: ClientBase = { ...cs[0]!, contrats: cs[0]!.contrats.map((c) => ({ ...c, fin: "2025-01-01" })) };
    expect(opportunitesVenteCroisee([terminé], [regle("auto", "habitation")], MAINTENANT)).toEqual([]);
    const futur: ClientBase = { ...cs[0]!, contrats: cs[0]!.contrats.map((c) => ({ ...c, fin: "2027-01-01" })) };
    expect(opportunitesVenteCroisee([futur], [regle("auto", "habitation")], MAINTENANT)).toHaveLength(1);
  });

  it("respecte le type de client et l'entreprise de la règle", () => {
    const cs = clients();
    const pourEntreprise = opportunitesVenteCroisee(cs, [regle("auto", "flotte", { typeClient: "entreprise" })], MAINTENANT);
    expect(pourEntreprise.map((o) => o.clientId)).toEqual([cs[3]!.id]);
    expect(opportunitesVenteCroisee(cs, [regle("auto", "habitation", { companyId: AUTRE_COMPANY })], MAINTENANT)).toEqual([]);
  });
});

describe("purge", () => {
  const imp = { importeLe: "2026-01-31T10:00:00+01:00", dureeConservationMois: 12 };
  it("purge une fois la durée de conservation écoulée, pas avant", () => {
    expect(aPurger(imp, "2027-01-30T09:59:59+01:00")).toBe(false);
    expect(aPurger(imp, "2027-01-31T10:00:00+01:00")).toBe(true);
    expect(aPurger({ importeLe: "2026-01-31T10:00:00+01:00", dureeConservationMois: 1 }, "2026-02-27T10:00:00+01:00")).toBe(false);
    expect(aPurger({ importeLe: "2026-01-31T10:00:00+01:00", dureeConservationMois: 1 }, "2026-02-28T12:00:00+01:00")).toBe(true);
    expect(aPurger({ ...imp, dureeConservationMois: 120 }, "2030-01-01T00:00:00+01:00")).toBe(false);
  });
});

describe("téléphone lu comme un nombre par le tableur", () => {
  it("restaure le 0 ou le + perdus, et seulement ces formes", () => {
    expect(zeroInitialRestaure("471000101")).toBe("0471000101");
    expect(zeroInitialRestaure("42000101")).toBe("042000101");
    expect(zeroInitialRestaure("32471000101")).toBe("+32471000101");
    expect(zeroInitialRestaure("0471000101")).toBe("0471000101");
    expect(zeroInitialRestaure("1234567")).toBe("1234567");
    expect(zeroInitialRestaure("4710001011")).toBe("4710001011");
  });
});

describe("numéros BCE fictifs de démonstration", () => {
  const ligne = (numero: string) => [["C-1", "N", "P", "Société (démonstration)", numero, "", "", "", "4000", "Liège", "", "", "actif", ""]];
  it("démonstration : forme exigée (10 chiffres), contrôle modulo 97 non exigé ; réel : refusé", () => {
    const demo = preparerImportBaseClients(entree("csv", csv(COLONNES, ligne("0999.000.001"))), nouvellesCles(), ctx());
    expect(demo.ok && demo.import.lignesRetenues).toBe(1);
    const forme = preparerImportBaseClients(entree("csv", csv(COLONNES, ligne("0999.000"))), nouvellesCles(), ctx());
    expect(forme.ok && forme.import.lignesRejetees).toBe(1);
    const reel = preparerImportBaseClients(entree("csv", csv(COLONNES, ligne("0999.000.001"))), nouvellesCles(), ctx({ mode: "reel" }));
    expect(reel.ok && reel.import.lignesRejetees).toBe(1);
    expect(reel.ok && reel.import.rejets[0]?.motif).toContain("BCE");
  });
});
