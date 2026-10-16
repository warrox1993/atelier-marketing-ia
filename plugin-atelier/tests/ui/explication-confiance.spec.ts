/** Explication courte de la confiance : comptes, pluriels, source qui débloque le plus, sans donnée inventée. */
import { describe, expect, it } from "vitest";
import { PROSPECT_B2B } from "../../src/contrats/exemples/prospection.js";
import { ConfianceQualification, type Prospect } from "../../src/contrats/index.js";
import { expliquerConfiance, sourceQuiDebloqueLePlus } from "../../src/ui/vues/explication-confiance.js";

const critere = (code: string, statut: string) => ({ code, libelle: code, statut, poids: 10, sourceId: null, source: "test", detail: "test" });
function avec(valeur: number, criteres: ReturnType<typeof critere>[]): Prospect {
  const plafonnee = criteres.some((c) => c.statut === "contraire");
  return { ...structuredClone(PROSPECT_B2B), confiance: ConfianceQualification.parse({ valeur, qualifie: !plafonnee && valeur >= 90, plafonnee, seuil: 90, calculeLe: "2026-10-15T10:00:00.000Z", criteres }) } as unknown as Prospect;
}

describe("expliquerConfiance", () => {
  it("compte vérifiés, total, contraires et cite la source qui établirait le plus de critères manquants", () => {
    const p = avec(50, [critere("entreprise_active", "verifie"), critere("segment_cible", "non_verifie"), critere("taille_connue", "non_verifie"), critere("emploie_personnel", "non_verifie"), critere("zone_cible", "contraire")]);
    expect(expliquerConfiance(p)).toBe("50 % : 1 critère vérifié sur 5, 1 contraire ; manque surtout : comptes annuels BNB");
  });
  it("pluriels et pas de source quand rien ne manque", () => {
    const p = avec(100, [critere("entreprise_active", "verifie"), critere("segment_cible", "verifie")]);
    expect(expliquerConfiance(p)).toBe("100 % : 2 critères vérifiés sur 2");
    expect(sourceQuiDebloqueLePlus(p)).toBeNull();
  });
  it("critère personnalisé non vérifié : aucune source inventée", () => {
    const p = avec(40, [critere("entreprise_active", "verifie"), critere("critere_maison", "non_verifie")]);
    expect(expliquerConfiance(p)).toBe("40 % : 1 critère vérifié sur 2");
  });
  it("confiance non calculée : rien", () => {
    expect(expliquerConfiance({ ...structuredClone(PROSPECT_B2B), confiance: undefined } as unknown as Prospect)).toBeNull();
  });
  it("jamais de tiret cadratin", () => {
    const p = avec(54, [critere("entreprise_active", "verifie"), critere("taille_connue", "non_verifie")]);
    expect(expliquerConfiance(p)).not.toMatch(/[–—]/u);
  });
});
