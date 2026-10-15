import { describe, expect, it } from "vitest";
import { lireMode, lirePort, lireReglages, verifierHoteEcoute } from "../src/config.js";
import { creerServeur } from "../src/serveur.js";

describe("garde « boucle locale seulement »", () => {
  it("accepte 127.0.0.1 et ::1", () => {
    expect(verifierHoteEcoute("127.0.0.1")).toBe("127.0.0.1");
    expect(verifierHoteEcoute("::1")).toBe("::1");
  });

  it.each(["0.0.0.0", "::", "192.168.1.10", "10.0.0.5", "localhost", "poste-dev.local", "", "127.0.0.1 "])(
    "refuse l'adresse d'écoute « %s »",
    (hote) => {
      expect(() => verifierHoteEcoute(hote)).toThrow(/boucle locale/);
    },
  );

  it("le serveur refuse de se construire sur une adresse non locale", () => {
    expect(() => creerServeur({ mode: "demonstration", hote: "0.0.0.0", port: 0 })).toThrow(/boucle locale/);
    expect(() => creerServeur({ mode: "demonstration", hote: "192.168.1.10", port: 0 })).toThrow(/boucle locale/);
  });

  it("lireReglages refuse PASSERELLE_HOTE hors boucle locale", () => {
    expect(() => lireReglages({ PASSERELLE_HOTE: "0.0.0.0" })).toThrow(/boucle locale/);
  });
});

describe("réglages par l'environnement", () => {
  it("valeurs par défaut : démonstration, 127.0.0.1, 3190", () => {
    expect(lireReglages({})).toEqual({ mode: "demonstration", hote: "127.0.0.1", port: 3190 });
  });

  it("mode : demonstration ou reel seulement", () => {
    expect(lireMode("reel")).toBe("reel");
    expect(() => lireMode("test")).toThrow(/Mode inconnu/);
  });

  it("port : entier de 0 à 65535", () => {
    expect(lirePort("3190")).toBe(3190);
    expect(() => lirePort("abc")).toThrow();
    expect(() => lirePort("70000")).toThrow();
    expect(() => lirePort("-1")).toThrow();
  });
});
