// Base clients de démonstration (lot P8) : déterminisme, cohérence avec b2c_clients, ventes croisées, fictivité,
// seuils d'étalonnage et pièges de la variante.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  COLONNES_CLIENTS, COLONNES_HISTORIQUE, COLONNES_PIEGES, NOMBRE_ENTREPRISES_CLIENTES, NOMBRE_REMARQUES_SINISTRE, SEUIL_CONVERSIONS, SEUIL_PROSPECTS,
  construireBaseClients, construireHistorique, csvBaseClients, etalonnage, opportunitesVenteCroisee, tableauPieges, telephoneEnNombre, versCsv,
} from "../../src/demo/prospection/base-clients.js";
import { jeuParticuliers } from "../../src/demo/prospection/particuliers.js";
import { jeuProspection } from "../../src/demo/prospection/jeu.js";

const sha = (t: string): string => createHash("sha256").update(t).digest("hex");
const base = construireBaseClients();
const particuliers = base.filter((l) => l.type === "particulier");
const entreprises = base.filter((l) => l.type === "entreprise");

describe("base clients : déterminisme", () => {
  it("deux générations donnent le même SHA-256 pour les trois CSV", () => {
    const a = csvBaseClients();
    const b = csvBaseClients();
    for (const nom of Object.keys(a) as (keyof typeof a)[]) expect(sha(a[nom])).toBe(sha(b[nom]));
  });

  it("CSV : séparateur « ; », en-têtes en français, une ligne par client", () => {
    const csv = csvBaseClients()["base-clients"];
    const lignes = csv.trimEnd().split("\n");
    expect(lignes[0]).toBe(COLONNES_CLIENTS.join(";"));
    expect(lignes).toHaveLength(base.length + 1);
    expect(lignes.every((l) => l.split(";").length === COLONNES_CLIENTS.length)).toBe(true);
  });

  it("les cellules contenant « ; » ou des guillemets sont protégées", () => {
    expect(versCsv({ colonnes: ["a", "b"], lignes: [["x;y", 'dit "oui"']] })).toBe('a;b\n"x;y";"dit ""oui"""\n');
  });
});

describe("base clients : cohérence avec le simulateur B2C et la prospection", () => {
  const clients = jeuParticuliers().clients;

  it("les particuliers sont exactement les clients de b2c_clients (mêmes identifiants)", () => {
    expect(particuliers.map((l) => l.identifiant_client)).toEqual(clients.map((c) => c.id));
  });

  it("les produits détenus correspondent aux contrats actifs de chaque client", () => {
    for (const c of clients) {
      const l = particuliers.find((x) => x.identifiant_client === c.id)!;
      expect(l.produits_detenus).toBe(c.contrats.filter((x) => x.statut === "actif").map((x) => x.produit).join("|"));
      expect(l.statut).toBe(c.contrats.some((x) => x.statut === "actif") ? "actif" : "ancien");
      expect(l.entite).toBe(c.entite);
      expect(l.date_debut).toBe(c.depuis);
    }
  });

  it("une trentaine d'entreprises clientes avec un numéro BCE du jeu de prospection", () => {
    expect(entreprises).toHaveLength(NOMBRE_ENTREPRISES_CLIENTES);
    const numeros = new Set(jeuProspection().entreprises.map((e) => e.numero));
    for (const e of entreprises) {
      expect(numeros.has(e.numero_bce)).toBe(true);
      expect(e.entreprise).toMatch(/\(démonstration\)$/);
    }
    expect(new Set(entreprises.map((e) => e.identifiant_client)).size).toBe(entreprises.length);
    expect(entreprises.some((e) => e.statut === "ancien")).toBe(true);
  });

  it("identifiants uniques sur toute la base", () => {
    expect(new Set(base.map((l) => l.identifiant_client)).size).toBe(base.length);
  });
});

describe("base clients : opportunités de vente croisée", () => {
  const opps = opportunitesVenteCroisee(base);

  it("au moins une opportunité « auto sans habitation » chez un particulier actif", () => {
    const o = opps.filter((x) => x.regle === "auto_sans_habitation");
    expect(o.length).toBeGreaterThanOrEqual(1);
    for (const x of o) {
      const l = base.find((b) => b.identifiant_client === x.identifiant_client)!;
      expect(l.type).toBe("particulier");
      expect(l.produits_detenus.split("|")).toContain("auto");
      expect(l.produits_detenus.split("|")).not.toContain("habitation");
    }
  });

  it("au moins une entreprise « RC pro sans multirisque »", () => {
    const o = opps.filter((x) => x.regle === "rc_pro_sans_multirisque");
    expect(o.length).toBeGreaterThanOrEqual(1);
    for (const x of o) {
      const l = base.find((b) => b.identifiant_client === x.identifiant_client)!;
      expect(l.type).toBe("entreprise");
      expect(l.statut).toBe("actif");
      expect(l.produits_detenus.split("|")).toContain("rc_pro");
      expect(l.produits_detenus.split("|")).not.toContain("multirisque");
    }
  });
});

describe("base clients : coordonnées entièrement fictives", () => {
  it("noms « (démonstration) », courriels @exemple.invalid, téléphones +32 4 000 …", () => {
    for (const l of base) {
      if (l.type === "particulier") expect(l.nom).toMatch(/\(démonstration\)$/);
      if (l.courriel !== "") expect(l.courriel).toMatch(/^[^@\s]+@exemple\.invalid$/);
      if (l.telephone !== "") expect(l.telephone).toMatch(/^\+32 4 000 0\d \d{2}$/);
    }
  });

  it("aucune marque ni nom d'assureur réel dans les fichiers", () => {
    const tout = Object.values(csvBaseClients()).join("\n");
    expect(tout).not.toMatch(new RegExp(String.fromCharCode(82, 71, 70), "i")); // nom du client, jamais écrit en clair
    expect(tout).not.toMatch(/@(gmail|hotmail|outlook|skynet|proximus)\./i);
  });
});

describe("historique d'opportunités et étalonnage", () => {
  const historique = construireHistorique();
  const e = etalonnage(historique);

  it("issues gagnées ET perdues, datées sur 2025-2026 (clôture après création)", () => {
    expect(historique.some((h) => h.issue === "gagnee")).toBe(true);
    expect(historique.some((h) => h.issue === "perdue")).toBe(true);
    for (const h of historique) {
      expect(h.date_creation >= "2025-01-01" && h.date_cloture <= "2026-09-30").toBe(true);
      expect(h.date_cloture >= h.date_creation).toBe(true);
      expect(h.motif_perte !== "").toBe(h.issue === "perdue");
    }
    expect(Object.keys(historique[0]!)).toEqual([...COLONNES_HISTORIQUE]);
  });

  it("un segment dépasse 300 prospects et 30 conversions, un autre reste sous le seuil", () => {
    const etalonnes = e.filter((s) => s.etalonne);
    const insuffisants = e.filter((s) => !s.etalonne);
    expect(etalonnes.length).toBeGreaterThanOrEqual(1);
    expect(insuffisants.length).toBeGreaterThanOrEqual(1);
    for (const s of etalonnes) { expect(s.prospects).toBeGreaterThanOrEqual(SEUIL_PROSPECTS); expect(s.conversions).toBeGreaterThanOrEqual(SEUIL_CONVERSIONS); }
    for (const s of insuffisants) expect(s.prospects < SEUIL_PROSPECTS || s.conversions < SEUIL_CONVERSIONS).toBe(true);
    expect(e.find((s) => s.segment === "particulier_auto")?.etalonne).toBe(true);
    expect(e.find((s) => s.segment === "entreprise_rc_pro")?.etalonne).toBe(false);
  });

  it("effectifs exacts par segment inchangés (auto 480 / 62, habitation 340 / 41, rc_pro 110 / 16)", () => {
    const par = (nom: string) => e.find((s) => s.segment === nom);
    expect([par("particulier_auto")?.prospects, par("particulier_auto")?.conversions]).toEqual([480, 62]);
    expect([par("particulier_habitation")?.prospects, par("particulier_habitation")?.conversions]).toEqual([340, 41]);
    expect([par("entreprise_rc_pro")?.prospects, par("entreprise_rc_pro")?.conversions]).toEqual([110, 16]);
    expect(historique).toHaveLength(1_705);
  });

  it("le taux de conversion dépend du canal : bureau > devis en ligne > prospection par courriel", () => {
    const taux = (canal: string): number => {
      const l = historique.filter((h) => h.canal_origine === canal);
      return l.filter((h) => h.issue === "gagnee").length / l.length;
    };
    expect(taux("bureau")).toBeGreaterThan(taux("devis_en_ligne"));
    expect(taux("devis_en_ligne")).toBeGreaterThan(taux("prospection_courriel"));
    // Ordre complet, croissant avec le score de démonstration du canal.
    const ordre = ["prospection_courriel", "appel_sortant", "devis_en_ligne", "bureau", "recommandation"];
    for (let i = 1; i < ordre.length; i++) expect(taux(ordre[i]!)).toBeGreaterThan(taux(ordre[i - 1]!));
  });

  it("déterminisme : deux constructions donnent exactement le même historique", () => {
    expect(JSON.stringify(construireHistorique())).toBe(JSON.stringify(historique));
  });
});

describe("variante « pièges »", () => {
  const t = tableauPieges(base);
  const iSinistre = COLONNES_PIEGES.indexOf("remarque_sinistre");
  const iTel = COLONNES_PIEGES.indexOf("telephone");

  it("contient la colonne remarque_sinistre, renseignée sur quelques lignes", () => {
    expect(t.colonnes).toContain("remarque_sinistre");
    expect(t.colonnes.slice(0, COLONNES_CLIENTS.length)).toEqual([...COLONNES_CLIENTS]);
    expect(t.lignes.filter((l) => l[iSinistre] !== "")).toHaveLength(NOMBRE_REMARQUES_SINISTRE);
  });

  it("une ligne a un téléphone saisi comme nombre (0 perdu)", () => {
    const nombres = t.lignes.filter((l) => typeof l[iTel] === "number");
    expect(nombres).toHaveLength(1);
    expect(nombres[0]![iTel]).toBe(40000110);
    expect(telephoneEnNombre("+32 4 000 01 10")).toBe(40000110);
    expect(versCsv(t).split("\n").some((l) => l.split(";")[iTel] === "40000110")).toBe(true);
  });

  it("la base importable, elle, ne contient ni remarque_sinistre ni nombre", () => {
    expect(csvBaseClients()["base-clients"]).not.toContain("remarque_sinistre");
    expect(base.every((l) => typeof l.telephone === "string")).toBe(true);
  });
});
