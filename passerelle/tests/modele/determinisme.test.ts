// Lot L3 : le modèle de démonstration est déterministe. Mêmes paramètres = mêmes
// octets, d'une instance à l'autre, quel que soit l'ordre des appels, et d'un
// processus à l'autre (empreinte de référence figée).

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { alea, graine, MARQUEUR_ENTREPRISE } from "../../src/demo/modele/alea.js";
import { creerModeleDemo, DEBUT_MODELE, FIN_MODELE, type ModeleDemo } from "../../src/demo/modele/index.js";

function exporter(modele: ModeleDemo, debut: string, fin: string): string {
  return JSON.stringify({
    gsc: modele.gsc({ debut, fin, dimensions: ["date", "requete", "page", "etablissement"] }),
    ga4: modele.ga4({ debut, fin }),
    ads: modele.ads({ debut, fin }),
    fiche: modele.fiche({ debut, fin }),
    publications: modele.publications({ debut, fin }),
    contacts: modele.contacts({ debut, fin }),
    transactions: modele.transactions({ debut, fin }),
    avis: modele.avis({ debut, fin }),
    pieges: modele.pieges(),
  });
}

const empreinte = (texte: string): string => createHash("sha256").update(texte, "utf8").digest("hex");

describe("graine SHA-256", () => {
  it("dérive du marqueur de l'entreprise et des clés, sans état caché", () => {
    expect(MARQUEUR_ENTREPRISE).toBe("atelier-demo:renovation-liege");
    const attendu = createHash("sha256").update("atelier-demo:renovation-liege|gsc|2026-04-01").digest();
    expect(graine("gsc", "2026-04-01").equals(attendu)).toBe(true);
    expect(alea("gsc", "2026-04-01", "x")).toBe(alea("gsc", "2026-04-01", "x"));
    expect(alea("gsc", "2026-04-01", "x")).not.toBe(alea("gsc", "2026-04-02", "x"));
    const tirage = alea("ga4", "2026-04-01");
    expect(tirage).toBeGreaterThanOrEqual(0);
    expect(tirage).toBeLessThan(1);
  });
});

describe("déterminisme du modèle", () => {
  it("deux modèles neufs donnent les mêmes octets sur toute la période", () => {
    const a = exporter(creerModeleDemo(), DEBUT_MODELE, FIN_MODELE);
    const b = exporter(creerModeleDemo(), DEBUT_MODELE, FIN_MODELE);
    expect(a.length).toBeGreaterThan(1_000_000);
    expect(empreinte(a)).toBe(empreinte(b));
  });

  it("l'ordre des appels et le cache ne changent rien", () => {
    const premier = creerModeleDemo();
    premier.ga4({ debut: "2027-01-01", fin: "2027-06-30" });
    premier.contacts({ debut: "2025-03-01", fin: "2025-03-31" });
    const apres = exporter(premier, "2026-03-01", "2026-05-31");
    const direct = exporter(creerModeleDemo(), "2026-03-01", "2026-05-31");
    expect(apres).toBe(direct);
  });

  it("une période découpée en deux donne les mêmes lignes quotidiennes que la période entière", () => {
    const modele = creerModeleDemo();
    const entier = modele.ga4({ debut: "2026-01-01", fin: "2026-12-31" });
    const morceaux = [...modele.ga4({ debut: "2026-01-01", fin: "2026-06-30" }), ...modele.ga4({ debut: "2026-07-01", fin: "2026-12-31" })];
    expect(morceaux).toEqual(entier);
  });

  it("empreinte de référence de l'année 2026 (même résultat d'un processus à l'autre)", () => {
    // Valeur figée au premier calcul. Elle ne doit changer que par une modification
    // voulue du modèle, à justifier dans le commit (les scénarios rejoués en dépendent).
    expect(empreinte(exporter(creerModeleDemo(), "2026-01-01", "2026-12-31"))).toBe("05cd7b530fedb2da3f9f6bba810c40f4ff591eb7759e8ee4947c9c68601da70c");
  });
});
