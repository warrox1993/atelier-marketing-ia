/**
 * Non-régression de la revue de sécurité du 15/10/2026 (M3, partiel) : une adresse n'est
 * impersonnelle que si sa partie locale ENTIÈRE désigne une fonction. Domaines fictifs.
 */
import { describe, expect, it } from "vitest";
import { natureAdresse } from "../src/serveur/regles-prospection.js";

const a = (local: string) => `${local}${String.fromCharCode(64)}acme.example`;

describe("M3 : natureAdresse sur la partie locale entière", () => {
  it("une fonction suivie d'un nom de personne n'est plus impersonnelle", () => {
    for (const l of ["info.jean.dupont", "contact-jean.dupont", "info+jean.dupont"]) {
      expect(natureAdresse(a(l)), l).toBe("inconnue");
    }
    // Forme prénom.nom après une fonction : nominative, jamais impersonnelle.
    expect(natureAdresse(a("info_jeanne"))).toBe("nominative");
  });

  it("les adresses de fonction restent impersonnelles, avec chiffres ou lieu", () => {
    for (const l of ["info", "info2", "contact-liege", "secretariat", "service-client", "info.bxl", "accueil-namur2"]) {
      expect(natureAdresse(a(l)), l).toBe("impersonnelle");
    }
  });

  it("prénom.nom reste nominative", () => {
    expect(natureAdresse(a("jean.dupont"))).toBe("nominative");
  });
});
