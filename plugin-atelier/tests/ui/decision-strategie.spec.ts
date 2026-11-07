import { describe, expect, it } from "vitest";
import { EXEMPLES_DONNEES } from "../../src/contrats/exemples/index.js";
import type { DossierHumain } from "../../src/contrats/dossier.js";
import { textePublicationStrategie } from "../../src/ui/decision-livrable.js";

const dossier = EXEMPLES_DONNEES["atelier.dossier"] as DossierHumain;

describe("carte de décision d'une révision de stratégie (F4)", () => {
  it("dit que l'approbation publie la stratégie en connaissance du client", () => {
    const texte = textePublicationStrategie({ ...dossier, cleLivrable: "strategie" });
    expect(texte).toContain("l'approbation la publie en connaissance du client");
  });

  it("ne dit rien pour un autre document", () => {
    expect(textePublicationStrategie({ ...dossier, cleLivrable: "contenu" })).toBeNull();
    expect(textePublicationStrategie({ ...dossier, cleLivrable: null })).toBeNull();
  });
});
