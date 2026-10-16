import { describe, expect, it } from "vitest";
import { LIBELLES_STATUT, StatutFonctionnel } from "../../src/contrats/statuts.js";
import { RUBRIQUES } from "../../src/contrats/ui-constantes.js";
import { EXEMPLES_DONNEES } from "../../src/contrats/exemples/index.js";
import type { DossierHumain } from "../../src/contrats/dossier.js";
import type { EntreeCalendrier } from "../../src/contrats/ui.js";
import { bruxellesVersIso, isoVersBruxelles, classerErreur, libelleEvenement, libelleRun, dateHeure, decalageBruxelles, ETATS_CONNEXION, euros, ilYA, LIBELLES_STATUT_UI, resumeMessage, TON_STATUT } from "../../src/ui/format.js";
import { chemin, lireRoute, VUES } from "../../src/ui/route.js";
import { centimesDepuisSaisie } from "../../src/ui/vues/campagnes.js";
import { trierCalendrier } from "../../src/ui/vues/calendrier.js";
import { abaisserTitres, raisonDecision } from "../../src/ui/vues/contenus.js";

const espaces = (s: string) => s.replace(/[  ]/gu, " ");

describe("libellés et tons", () => {
  it("la copie des libellés de statut est identique au contrat", () => {
    expect(LIBELLES_STATUT_UI).toEqual(LIBELLES_STATUT);
  });
  it("chaque statut fonctionnel a un ton", () => {
    for (const s of StatutFonctionnel.options) expect(TON_STATUT[s]).toBeDefined();
  });
  it("les six états de connexion ont un libellé distinct", () => {
    const libelles = Object.values(ETATS_CONNEXION).map((e) => e.libelle);
    expect(libelles).toHaveLength(6);
    expect(new Set(libelles).size).toBe(6);
  });
  it("« Prêt, pas encore utilisé » est neutre (ni orange ni alarmant) et dit pourquoi", () => {
    const e = ETATS_CONNEXION.configure_non_verifie;
    expect(e.libelle).toBe("Prêt, pas encore utilisé");
    expect(e.ton).toBe("neutre");
    expect(e.aide).toContain("aucun appel réel ne l'a encore utilisée");
  });
});

describe("dates à l'heure de Bruxelles", () => {
  it("affiche l'heure locale (UTC+2 en été, UTC+1 en hiver)", () => {
    expect(dateHeure("2026-10-20T08:00:00.000Z")).toContain("10:00");
    expect(decalageBruxelles("2026-10-20T08:00:00.000Z")).toBe("UTC+2");
    expect(dateHeure("2026-10-30T08:00:00.000Z")).toContain("09:00");
    expect(decalageBruxelles("2026-10-30T08:00:00.000Z")).toBe("UTC+1");
  });
  it("lit aussi la forme texte de PostgreSQL", () => {
    expect(dateHeure("2026-10-15 14:23:59.691232+02")).toContain("14:23");
  });
  it("convertit l'heure de Bruxelles saisie en UTC, été comme hiver", () => {
    expect(bruxellesVersIso("2026-10-20T10:00")).toBe("2026-10-20T08:00:00.000Z");
    expect(bruxellesVersIso("2026-10-30T10:00")).toBe("2026-10-30T09:00:00.000Z");
    expect(isoVersBruxelles("2026-10-20T08:00:00.000Z")).toBe("2026-10-20T10:00");
    expect(bruxellesVersIso("2026-03-29T02:30")).toBeNull(); // heure qui n'existe pas (passage à l'heure d'été)
    expect(bruxellesVersIso("pas une date")).toBeNull();
  });
  it("signale une date absente ou invalide au lieu de l'inventer", () => {
    expect(dateHeure(null)).toBe("non renseignée");
    expect(dateHeure("pas une date")).toBe("non renseignée");
  });
  it("formule l'ancienneté", () => {
    const m = new Date("2026-10-15T12:00:00Z");
    expect(ilYA(new Date("2026-10-15T11:57:00Z"), m)).toBe("il y a 3 minutes");
    expect(ilYA(new Date("2026-10-15T11:59:50Z"), m)).toBe("à l'instant");
  });
});

describe("montants", () => {
  it("convertit des centimes en euros, et l'absence reste explicite", () => {
    expect(espaces(euros(150000))).toBe("1 500,00 €");
    expect(euros(null)).toBe("non renseigné");
  });
  it("lit une saisie d'euros en centimes", () => {
    expect(centimesDepuisSaisie("1500")).toBe(150000);
    expect(centimesDepuisSaisie("1 500,50 €")).toBe(150050);
    expect(centimesDepuisSaisie("")).toBeNull();
    expect(centimesDepuisSaisie("12,345")).toBeNaN();
    expect(centimesDepuisSaisie("-3")).toBeNaN();
  });
});

describe("erreurs du pont", () => {
  it("distingue accès absent, indisponible, interrompu et erreur", () => {
    expect(classerErreur({ code: "WORKER_ERROR", message: "L'action atelier.decision est réservée à un humain" }).categorie).toBe("acces");
    expect(classerErreur({ code: "CAPABILITY_DENIED", message: "x" }).categorie).toBe("acces");
    expect(classerErreur({ code: "WORKER_UNAVAILABLE", message: "x" }).categorie).toBe("indisponible");
    expect(classerErreur({ code: "WORKER_ERROR", message: "Pause de campagne non disponible : …" }).categorie).toBe("indisponible");
    expect(classerErreur({ code: "TIMEOUT", message: "x" }).categorie).toBe("interrompu");
    expect(classerErreur({ code: "WORKER_ERROR", message: "Campagne introuvable dans cette entreprise." }).categorie).toBe("introuvable");
    expect(classerErreur({ code: "WORKER_ERROR", message: "Approbation impossible : la porte n'est pas franchie." }).categorie).toBe("erreur");
    expect(classerErreur(undefined).message).toBe("Erreur sans message.");
  });
  it("lit le code stable placé en tête du message par le worker", () => {
    const e = classerErreur({ code: "WORKER_ERROR", message: "[revision_perimee] La décision doit viser la révision courante du livrable." });
    expect(e).toMatchObject({ code: "revision_perimee", categorie: "erreur", message: "La décision doit viser la révision courante du livrable." });
    expect(classerErreur({ code: "WORKER_ERROR", message: "[elevation_refusee] Action réservée" }).categorie).toBe("acces");
    expect(classerErreur({ code: "WORKER_ERROR", message: "[non_implemente] Pause non disponible" }).titre).toBe("Fonction indisponible");
    expect(classerErreur({ code: "WORKER_ERROR", message: "[entree_invalide] Paramètres invalides" }).categorie).toBe("invalide");
  });
});

describe("messages typés", () => {
  it("résume chaque type sans interpréter le contenu", () => {
    expect(resumeMessage({ type: "correction_demandee", texte: "Ajouter Seraing", findingIds: ["F-1"] })).toBe("Ajouter Seraing");
    expect(resumeMessage({ type: "blocage", raison: "Certification inconnue.", informationManquante: "Numéro d'agrément" })).toContain("Numéro d'agrément");
    expect(resumeMessage({ type: "inconnu" })).toBe("");
  });
});

describe("chronologie", () => {
  it("traduit les statuts de run et les événements connus, garde les inconnus", () => {
    expect(libelleRun("Run succeeded (agent 8ff2e754)")).toBe("Passage réussi (agent 8ff2e754)");
    expect(libelleRun("Run inconnu_x")).toBe("Run inconnu_x");
    expect(libelleRun("Passage succeeded (agent 8ff2e754)")).toBe("Passage réussi (agent 8ff2e754)");
    expect(libelleEvenement("porte.refusee")).toBe("Contrôle automatique refusé");
    expect(libelleEvenement("type.nouveau")).toBe("type.nouveau");
  });
});

describe("routes de la page", () => {
  it("couvre la discussion, l'accueil, la prospection (prospects et carte, juste après), les six rubriques, la mise en place et les paramètres", () => {
    expect(VUES.map((v) => v.cle)).toEqual(["discussion", "accueil", "prospects", "carte", ...RUBRIQUES.map((r) => r.cle), "connaissances", "mise-en-place", "parametres", "corbeille", "rapport"]);
  });
  it("lit la rubrique et l'identifiant depuis le chemin de l'hôte", () => {
    expect(lireRoute("/RNO/atelier")).toEqual({ vue: "accueil", id: null });
    expect(lireRoute("/RNO/atelier/contenus/abc")).toEqual({ vue: "contenus", id: "abc" });
    expect(lireRoute("/RNO/atelier/inconnue")).toEqual({ vue: "accueil", id: null });
    expect(chemin("campagnes", "nouvelle")).toBe("/atelier/campagnes/nouvelle");
  });
});

describe("calendrier", () => {
  it("trie par date effective, les contenus sans date en dernier", () => {
    const base = (EXEMPLES_DONNEES["atelier.calendrier"] as EntreeCalendrier[])[0]!;
    const a = { ...base, titre: "A", dateProposee: "2026-10-22T08:00:00.000Z" };
    const b = { ...base, titre: "B", dateProposee: "2026-10-30T08:00:00.000Z", publicationProgrammee: "2026-10-21T08:00:00.000Z" };
    const c = { ...base, titre: "C", dateProposee: null };
    expect(trierCalendrier([c, a, b]).map((x) => x.titre)).toEqual(["B", "A", "C"]);
    // Décalages différents : on compare des instants, pas du texte.
    const d1 = { ...base, titre: "09h00Z", dateProposee: "2026-10-20T09:00:00.000Z" };
    const d2 = { ...base, titre: "08h00Z", dateProposee: "2026-10-20T10:00:00+02:00" };
    expect(trierCalendrier([d1, d2]).map((x) => x.titre)).toEqual(["08h00Z", "09h00Z"]);
  });
});

describe("décision humaine", () => {
  const dossier = EXEMPLES_DONNEES["atelier.dossier"] as DossierHumain;
  it("autorise l'approbation seulement contrôle automatique réussi sur la révision courante, avec commentaire", () => {
    expect(raisonDecision(dossier, "approuver", "OK pour publication")).toBeNull();
    expect(raisonDecision(dossier, "approuver", "  ")).toMatch(/commentaire/u);
    expect(raisonDecision({ ...dossier, statut: { statut: "awaiting_review", motif: "" } }, "rejeter", "x")).toMatch(/prêt pour validation/u);
    const perimee = { ...dossier, evaluationPorte: { ...dossier.evaluationPorte!, perimee: true } };
    expect(raisonDecision(perimee, "approuver", "x")).toMatch(/contrôle automatique/u);
    expect(raisonDecision(perimee, "demander_correction", "Revoir le titre")).toBeNull();
    expect(raisonDecision({ ...dossier, livrable: null }, "approuver", "x")).toMatch(/Aucun livrable/u);
  });
});

describe("livrable affiché", () => {
  it("abaisse les titres Markdown de deux niveaux, sauf dans les blocs de code", () => {
    expect(abaisserTitres("# Titre\n## Seraing\ntexte #1\n```\n# pas un titre\n```\n###### fin")).toBe(
      "### Titre\n#### Seraing\ntexte #1\n```\n# pas un titre\n```\n###### fin",
    );
  });
});
