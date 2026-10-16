import { describe, expect, it } from "vitest";
import { lirePort, lireReglages, lireServicesLocaux, verifierAncienMode, verifierHoteEcoute } from "../src/config.js";
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
    expect(() => creerServeur({ hote: "0.0.0.0", port: 0 })).toThrow(/boucle locale/);
    expect(() => creerServeur({ hote: "192.168.1.10", port: 0 })).toThrow(/boucle locale/);
  });

  it("lireReglages refuse PASSERELLE_HOTE hors boucle locale", () => {
    expect(() => lireReglages({ PASSERELLE_HOTE: "0.0.0.0" })).toThrow(/boucle locale/);
  });
});

describe("réglages par l'environnement", () => {
  it("valeurs par défaut : 127.0.0.1, 3190 (il n'y a plus de mode)", () => {
    expect(lireReglages({})).toEqual({ hote: "127.0.0.1", port: 3190 });
  });

  it("le mode démonstration est retiré : PASSERELLE_MODE=demonstration est refusé avec un message clair", () => {
    expect(() => lireReglages({ PASSERELLE_MODE: "demonstration" })).toThrow(/mode démonstration a été retiré.*non_connecte/);
    expect(() => verifierAncienMode("test")).toThrow(/n'est plus un réglage reconnu/);
  });

  it("ancien réglage PASSERELLE_MODE=reel (ou absent) : accepté et sans effet", () => {
    expect(lireReglages({ PASSERELLE_MODE: "reel" })).toEqual({ hote: "127.0.0.1", port: 3190 });
    expect(() => verifierAncienMode("")).not.toThrow();
    expect(() => verifierAncienMode(undefined)).not.toThrow();
  });

  it("port : entier de 0 à 65535", () => {
    expect(lirePort("3190")).toBe(3190);
    expect(() => lirePort("abc")).toThrow();
    expect(() => lirePort("70000")).toThrow();
    expect(() => lirePort("-1")).toThrow();
  });
});

describe("services locaux : liens", () => {
  it("liens est permis, sans compte de tiers, seul ou avec osm", () => {
    expect(lireServicesLocaux({ PASSERELLE_SERVICES_REELS: "liens" })).toEqual(["liens"]);
    expect(lireServicesLocaux({ PASSERELLE_SERVICES_REELS: "osm liens" })).toEqual(["osm", "liens"]);
    expect(() => lireServicesLocaux({ PASSERELLE_SERVICES_REELS: "liens,gsc" })).toThrow(/gsc.*non permis/);
  });
});

describe("services locaux : bce et bnb", () => {
  it("bce et bnb sont permis avec osm et liens", () => {
    expect(lireServicesLocaux({ PASSERELLE_SERVICES_REELS: "osm,liens,bce,bnb" })).toEqual(["osm", "liens", "bce", "bnb"]);
  });
  it("un service inconnu ou de tiers reste refusé", () => {
    expect(() => lireServicesLocaux({ PASSERELLE_SERVICES_REELS: "bce,inconnu" })).toThrow(/inconnu.*non permis/);
    expect(() => lireServicesLocaux({ PASSERELLE_SERVICES_REELS: "fsma" })).toThrow(/fsma.*non permis/);
  });
});
