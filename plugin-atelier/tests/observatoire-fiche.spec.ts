import { describe, expect, it } from "vitest";
import { assemblerFiche, libelleChamp } from "../src/serveur/observatoire/fiche.js";
import { CHAMPS_FICHE, Fiche, type Affirmation } from "../src/contrats/observatoire.js";
import type { VersionRelevee } from "../src/serveur/observatoire/collecte.js";

const ID_PROJET = "22222222-2222-4222-8222-222222222222";
const idAffirmation = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const affirmation = (n: number, champ: string, texte: string, surcharge: Partial<Affirmation> = {}): Affirmation => ({
  id: idAffirmation(n),
  projetId: ID_PROJET,
  chapitre: `fiche.${champ}`,
  texte,
  statut: "confirme_doc_officielle",
  confiance: { niveau: 2, motif: "Documentation officielle" },
  versionConcernee: null,
  remplaceePar: null,
  preuves: [],
  ...surcharge,
});

const VERSIONS: VersionRelevee[] = [
  { version: "6.8.0", publieeLe: "2026-10-01", prerelease: false },
  { version: "6.9.0-rc.1", publieeLe: "2026-10-20", prerelease: true },
];

describe("assemblerFiche", () => {
  it("champ liste : un texte qui n'est pas une URL est écarté, sans exception", () => {
    const fiche = assemblerFiche({ nom: "REA" }, [affirmation(1, "liensSources", "voir la page du projet"), affirmation(2, "liensSources", "https://exemple.org/doc")], VERSIONS);
    expect(fiche.liensSources.valeur).toEqual(["https://exemple.org/doc"]);
  });

  it("fiche REA : 26 champs, aucun champ rempli sans affirmation", () => {
    const fiche = assemblerFiche({ nom: "REA" }, [], VERSIONS);
    expect(Fiche.safeParse(fiche).success).toBe(true);
    expect(CHAMPS_FICHE).toHaveLength(26);
    for (const champ of CHAMPS_FICHE) {
      expect(fiche[champ]).toEqual({ valeur: null, statut: "non_verifie", affirmationId: null });
    }
  });

  it("une affirmation remplit son champ ; la remplacée est ignorée, la dernière reçue gagne", () => {
    const fiche = assemblerFiche(
      { nom: "REA" },
      [
        affirmation(1, "editeur", "Ancien éditeur", { remplaceePar: idAffirmation(3) }),
        affirmation(2, "editeur", "Morluto"),
        affirmation(3, "editeur", "Morluto SAS"),
        affirmation(4, "avantages", "Une phrase, pas une liste"),
        affirmation(5, "siteOfficiel", "pas une adresse"),
      ],
      VERSIONS,
    );
    expect(Fiche.safeParse(fiche).success).toBe(true);
    expect(fiche.editeur).toEqual({ valeur: "Morluto SAS", statut: "confirme_doc_officielle", affirmationId: idAffirmation(3) });
    // Champ liste : le texte entier devient un élément, jamais découpé. URL invalide : valeur nulle, affirmation référencée.
    expect(fiche.avantages.valeur).toEqual(["Une phrase, pas une liste"]);
    expect(fiche.avantages.affirmationId).toBe(idAffirmation(4));
    expect(fiche.siteOfficiel.affirmationId).toBe(idAffirmation(5));
    expect(fiche.siteOfficiel.valeur).toBeNull();
  });

  it("inconnu et non vérifié distincts", () => {
    const fiche = assemblerFiche(
      { nom: "REA" },
      [
        affirmation(1, "licence", "À confirmer", { statut: "non_verifie" }),
        affirmation(2, "editeur", "Morluto"),
        affirmation(3, "avantages", "Une phrase", { statut: "rapporte_tiers" }),
      ],
      VERSIONS,
    );
    expect(libelleChamp(fiche.categorie)).toBe("inconnu");
    expect(libelleChamp(fiche.licence)).toBe("non vérifié");
    expect(libelleChamp(fiche.editeur)).toBeNull();
    // Affirmation existante mais valeur non extractible, statut autre que non_verifie : rien n'est inventé.
    expect(libelleChamp(fiche.avantages)).toBeNull();
  });

  it("dernière version ignore la préliminaire", () => {
    const stable = assemblerFiche({ nom: "REA" }, [affirmation(1, "derniereVersion", "6.8.0")], VERSIONS);
    expect(stable.derniereVersion).toEqual({ valeur: "6.8.0", statut: "confirme_doc_officielle", affirmationId: idAffirmation(1) });

    const preliminaire = assemblerFiche({ nom: "REA" }, [affirmation(1, "derniereVersion", "6.9.0-rc.1")], VERSIONS);
    expect(preliminaire.derniereVersion).toEqual({ valeur: null, statut: "non_verifie", affirmationId: null });
    expect(libelleChamp(preliminaire.derniereVersion)).toBe("inconnu");

    const sansAffirmation = assemblerFiche({ nom: "REA" }, [], VERSIONS);
    expect(sansAffirmation.derniereVersion.valeur).toBeNull();
  });
  describe("dateDerniereVersion", () => {
    const inconnu = { valeur: null, statut: "non_verifie", affirmationId: null };
    const avecVersion = (date: string) => [affirmation(1, "derniereVersion", "6.8.0"), affirmation(2, "dateDerniereVersion", date)];

    it("retient la date de la dernière stable", () => {
      const fiche = assemblerFiche({ nom: "REA" }, avecVersion("2026-10-01"), VERSIONS);
      expect(fiche.dateDerniereVersion).toEqual({ valeur: "2026-10-01", statut: "confirme_doc_officielle", affirmationId: idAffirmation(2) });
    });

    it("écarte la date d'une préversion", () => {
      const fiche = assemblerFiche({ nom: "REA" }, avecVersion("2026-10-20"), VERSIONS);
      expect(fiche.dateDerniereVersion).toEqual(inconnu);
    });

    it("écarte une date décalée d'un jour", () => {
      expect(assemblerFiche({ nom: "REA" }, avecVersion("2026-10-02"), VERSIONS).dateDerniereVersion).toEqual(inconnu);
      expect(assemblerFiche({ nom: "REA" }, avecVersion("2026-09-30"), VERSIONS).dateDerniereVersion).toEqual(inconnu);
    });

    it("vaut inconnu sans affirmation", () => {
      const fiche = assemblerFiche({ nom: "REA" }, [affirmation(1, "derniereVersion", "6.8.0")], VERSIONS);
      expect(fiche.dateDerniereVersion).toEqual(inconnu);
      expect(libelleChamp(fiche.dateDerniereVersion)).toBe("inconnu");
    });

    it("vaut inconnu si derniereVersion n'est pas retenu, même avec la bonne date", () => {
      const fiche = assemblerFiche({ nom: "REA" }, [affirmation(2, "dateDerniereVersion", "2026-10-01")], VERSIONS);
      expect(fiche.dateDerniereVersion).toEqual(inconnu);
      const preversion = assemblerFiche({ nom: "REA" }, [affirmation(1, "derniereVersion", "6.9.0-rc.1"), affirmation(2, "dateDerniereVersion", "2026-10-01")], VERSIONS);
      expect(preversion.dateDerniereVersion).toEqual(inconnu);
    });
  });
  it("champ liste : un élément par affirmation vérifiée, jamais de texte découpé", () => {
    const fiche = assemblerFiche(
      { nom: "REA" },
      [
        affirmation(10, "plateformes", "Linux"),
        affirmation(11, "plateformes", "macOS, Windows"),
        affirmation(12, "plateformes", "FreeBSD", { statut: "non_verifie" }),
        affirmation(13, "prerequis", "Node 20", { statut: "non_verifie" }),
      ],
      VERSIONS,
    );
    expect(fiche.plateformes).toEqual({ valeur: ["Linux", "macOS, Windows"], statut: "confirme_doc_officielle", affirmationId: idAffirmation(11) });
    expect(fiche.prerequis).toEqual({ valeur: null, statut: "non_verifie", affirmationId: idAffirmation(13) });
    expect(libelleChamp(fiche.prerequis)).toBe("non vérifié");
  });
});
