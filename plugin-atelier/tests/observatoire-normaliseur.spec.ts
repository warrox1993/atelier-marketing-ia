import { describe, expect, it } from "vitest";
import {
  VERSION_NORMALISATION,
  empreinte,
  extraitPresent,
  normaliserTexte,
} from "../src/serveur/observatoire/normaliseur.js";

describe("normaliseur K2", () => {
  const instantane = normaliserTexte("Version 6.8.0 publiée le 12 octobre.\nCorrectif de sécurité inclus.", "texte");

  it("expose la version de normalisation", () => {
    expect(VERSION_NORMALISATION).toBe(2);
  });

  it("retire les caractères invisibles : un extrait recopié sans eux est retrouvé (V2-2)", () => {
    const cache = normaliserTexte("Correctif de s\u200Bécurité\u202E inclus\u{E0041}", "texte");
    expect(cache).toBe("Correctif de sécurité inclus");
    expect(extraitPresent("Correctif de sécurité inclus", cache)).toBe(true);
  });

  it("accepte un extrait avec espaces insécables", () => {
    expect(extraitPresent("Version 6.8.0 publiée le 12 octobre.", instantane)).toBe(true);
  });

  it("accepte un extrait avec fins de ligne \\r\\n", () => {
    expect(extraitPresent("octobre.\r\nCorrectif de sécurité", instantane)).toBe(true);
  });

  it("accepte un extrait en composition NFD", () => {
    expect(extraitPresent("publiée le 12 octobre.".normalize("NFD"), instantane)).toBe(true);
  });

  it("accepte un instantané lui-même en NFD ou \\r\\n", () => {
    const autre = normaliserTexte("Correctif de sécurité\r\ninclus", "texte");
    expect(extraitPresent("Correctif de sécurité", autre)).toBe(true);
  });

  it("refuse un extrait de 1 caractère", () => {
    expect(extraitPresent("V", instantane)).toBe(false);
  });

  it("refuse un extrait de 19 caractères et accepte celui de 20 caractères", () => {
    expect(extraitPresent("Version 6.8.0 publi", instantane)).toBe(false);
    expect(extraitPresent("Version 6.8.0 publié", instantane)).toBe(true);
  });

  it("vérifie la position déclarée dans le texte normalisé", () => {
    const extrait = "Correctif de sécurité";
    const position = normaliserTexte(instantane, "texte").indexOf(extrait);
    expect(position).toBeGreaterThan(0);
    expect(extraitPresent(extrait, instantane, position)).toBe(true);
    expect(extraitPresent(extrait, instantane, 0)).toBe(false);
    expect(extraitPresent(extrait, instantane, position + 1)).toBe(false);
  });

  it("refuse un extrait paraphrasé", () => {
    expect(extraitPresent("La version 6.8.0 est sortie en octobre", instantane)).toBe(false);
  });

  it("donne la même empreinte pour le même texte", () => {
    const a = empreinte(normaliserTexte("Bonjour  le   monde\r\n", "texte"));
    const b = empreinte(normaliserTexte("Bonjour le monde", "texte"));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/u);
    expect(empreinte("autre")).not.toBe(a);
  });

  it("réduit les lignes vides multiples à une seule", () => {
    expect(normaliserTexte("a\n\n\n\nb", "texte")).toBe("a\n\nb");
  });

  it("réduit le html au texte visible", () => {
    const sortie = normaliserTexte("<html><body><script>alert(1)</script><p>Texte <b>visible</b></p></body></html>", "html");
    expect(sortie).toContain("Texte");
    expect(sortie).toContain("visible");
    expect(sortie).not.toContain("<");
    expect(sortie).not.toContain("alert");
  });

  it("garde le json tel quel puis réduit les blancs", () => {
    expect(normaliserTexte('{"a":   1}\r\n', "json")).toBe('{"a": 1}');
  });
});
