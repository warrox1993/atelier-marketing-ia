/**
 * Outils d'agent de la fabrique (lot 2) : validation fermée, rôle, quota, dépôt atomique, étanchéité entre entreprises.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  creerOutilsFabrique,
  QUOTA_TRAVAUX_PAR_JOUR,
  QUOTA_IMAGES_PAR_JOUR,
  QUOTA_VIDEOS_PAR_JOUR,
  validerDemandeDocument,
  validerDemandeImage,
  validerDemandeVideo,
  validerDemandeVideoPublicitaire,
  type DependancesFabrique,
} from "../src/serveur/fabrique-outils.js";
import { creerRechercheDossierSujet, REFUS_AUCUN_DOSSIER, type ResultatDossierSujet } from "../src/serveur/dossier-sujet.js";
import manifest from "../src/manifest.js";

const ENTREPRISE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENTREPRISE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AGENT = "11111111-1111-4111-8111-111111111111";
/** Autre agent de la même entreprise, de même rôle Paperclip mais non retenu. */
const AUTRE_AGENT = "22222222-2222-4222-8222-222222222222";
const RUN = "22222222-2222-4222-8222-222222222222";
const TACHE = "33333333-3333-4333-8333-333333333333";
const REVISION_DOSSIER = "44444444-4444-4444-8444-444444444444";
const DOSSIER_OK: ResultatDossierSujet = { ok: true, issueId: TACHE, revisionId: REVISION_DOSSIER, rubriques: ["Sujet"], avertissements: [] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const valide = (): Record<string, any> => ({
  format: "docx",
  modele: "sobre",
  titre: "Offre",
  langue: "fr-BE",
  blocs: [
    { type: "titre", niveau: 1, texte: "Bonjour" },
    { type: "paragraphe", texte: "Un texte", gras: [{ debut: 0, fin: 2 }] },
    { type: "liste", elements: ["a", "b"] },
    { type: "tableau", entetes: ["x"], lignes: [["1"]] },
    { type: "saut_de_page" },
  ],
});

describe("validation de fabriquer_document", () => {
  it("accepte une demande valide", () => {
    expect(validerDemandeDocument(valide()).ok).toBe(true);
  });
  it("refuse un champ inconnu, dont un chemin de sortie", () => {
    const r = validerDemandeDocument({ ...valide(), sortie: "../../x" });
    expect(r).toMatchObject({ ok: false });
    expect((r as { erreur: string }).erreur).toContain("sortie");
  });
  it("refuse un champ inconnu dans un bloc", () => {
    const d = valide();
    (d.blocs[1] as Record<string, unknown>).html = "<b>x</b>";
    expect(validerDemandeDocument(d).ok).toBe(false);
  });
  it("refuse un texte trop long", () => {
    const d = valide();
    d.blocs[1] = { type: "paragraphe", texte: "x".repeat(20001) };
    expect(validerDemandeDocument(d).ok).toBe(false);
    expect(validerDemandeDocument({ ...valide(), titre: "t".repeat(201) }).ok).toBe(false);
  });
  it("refuse un format, un modèle ou une langue inconnus", () => {
    expect(validerDemandeDocument({ ...valide(), format: "exe" }).ok).toBe(false);
    expect(validerDemandeDocument({ ...valide(), modele: "../autre" }).ok).toBe(false);
    expect(validerDemandeDocument({ ...valide(), langue: "de" }).ok).toBe(false);
  });
  it("refuse plus de 2000 blocs, 51 colonnes, 2001 lignes", () => {
    expect(validerDemandeDocument({ ...valide(), blocs: Array.from({ length: 2001 }, () => ({ type: "saut_de_page" })) }).ok).toBe(false);
    const colonnes = { ...valide(), blocs: [{ type: "tableau", lignes: [Array.from({ length: 51 }, () => "a")] }] };
    expect(validerDemandeDocument(colonnes).ok).toBe(false);
    const lignes = { ...valide(), blocs: [{ type: "tableau", lignes: Array.from({ length: 2001 }, () => ["a"]) }] };
    expect(validerDemandeDocument(lignes).ok).toBe(false);
  });
  it("refuse une taille totale supérieure à 256 Kio", () => {
    const gros = { ...valide(), blocs: Array.from({ length: 20 }, () => ({ type: "paragraphe", texte: "é".repeat(8000) })) };
    const r = validerDemandeDocument(gros);
    expect(r).toMatchObject({ ok: false });
    expect((r as { erreur: string }).erreur).toContain("256 Kio");
  });
  it("retire les caractères de contrôle sauf tabulation et saut de ligne", () => {
    const d = { ...valide(), blocs: [{ type: "paragraphe", texte: "a\u0000b\tc\nd\u001Be\r" }] };
    const r = validerDemandeDocument(d);
    expect(r.ok && (r.demande.blocs as Array<{ texte: string }>)[0]!.texte).toBe("ab\tc\nde");
  });
  it("refuse un UTF-8 invalide (demi-paire de substitution isolée)", () => {
    expect(validerDemandeDocument({ ...valide(), titre: "ab\uD800" }).ok).toBe(false);
  });
  it("l'image exige un UUID de livrable, jamais un chemin", () => {
    const base = valide();
    expect(validerDemandeDocument({ ...base, blocs: [{ type: "image", livrable: "/etc/passwd" }] }).ok).toBe(false);
    expect(validerDemandeDocument({ ...base, blocs: [{ type: "image", livrable: ENTREPRISE_A }] }).ok).toBe(true);
  });
  it("xlsx : feuilles typées, formule refusée, texte légitime gardé, nombre non fini refusé", () => {
    const x = {
      format: "xlsx", modele: "sobre", titre: "Chiffres", langue: "en",
      feuilles: [{ nom: "F1", lignes: [[{ type: "texte", valeur: "+32 470 12 34 56" }, { type: "nombre", valeur: 3 }, { type: "date", valeur: "2026-10-24" }, { type: "booleen", valeur: true }]] }],
    };
    const r = validerDemandeDocument(x);
    expect(r.ok && JSON.stringify(r.demande.feuilles)).toContain("+32 470 12 34 56");
    const formule = { ...x, feuilles: [{ nom: "F1", lignes: [[{ type: "texte", valeur: "=SOMME(A1)" }]] }] };
    const refus = validerDemandeDocument(formule);
    expect(!refus.ok && refus.erreur).toContain("texte qui ressemble à une formule : calculer le résultat et déposer le nombre ; la fabrique n'écrit aucune formule");
    const infini = { ...x, feuilles: [{ nom: "F1", lignes: [[{ type: "nombre", valeur: Infinity }]] }] };
    expect(validerDemandeDocument(infini).ok).toBe(false);
    const typeFaux = { ...x, feuilles: [{ nom: "F1", lignes: [[{ type: "formule", valeur: "=1" }]] }] };
    expect(validerDemandeDocument(typeFaux).ok).toBe(false);
  });
  it("feuilles réservées à xlsx ; xlsx sans feuilles refusé", () => {
    expect(validerDemandeDocument({ ...valide(), feuilles: [] }).ok).toBe(false);
    expect(validerDemandeDocument({ format: "xlsx", modele: "sobre", titre: "t", langue: "en" }).ok).toBe(false);
  });
  it("le manifeste déclare les cinq outils de la fabrique, les six du moteur et la capacité", () => {
    expect(manifest.capabilities).toContain("agent.tools.register");
    expect((manifest.tools ?? []).map((t) => t.name).sort()).toEqual(["arbitrage_deposer", "decision_demander", "etat_fabrication", "fabriquer_document", "fabriquer_image", "fabriquer_video", "livrable_deposer", "mission_etat", "sources_lister", "verdict_deposer", "voir_rendu"]);
  });
});

const video = (): Record<string, any> => ({
  format_sortie: "1080x1920",
  musique: "calme-1",
  sous_titres: true,
  scenes: [
    { texte_voix: "Bonjour", voix: "voix-fr-1", visuel: { gabarit: "titre_plein_ecran", champs: { titre: "Salut", sous_titre: "Suite" } }, duree_max: 12.5 },
    { texte_voix: "Un chiffre", voix: "voix-fr-1", visuel: { gabarit: "chiffre_cle", champs: { chiffre: "42 %", titre: "Croissance" } } },
    { texte_voix: "Trois points", voix: "voix-fr-1", visuel: { gabarit: "liste_3_points", champs: { titre: "Trois idées", points: ["a", "b", "c"] } } },
  ],
});

describe("validation de fabriquer_video", () => {
  it("accepte une demande valide", () => {
    expect(validerDemandeVideo(video()).ok).toBe(true);
  });
  it("refuse un champ inconnu, dont echantillon et entreprise glissée", () => {
    for (const cle of ["echantillon", "entreprise", "chemin", "url", "html"]) {
      const r = validerDemandeVideo({ ...video(), [cle]: "x" });
      expect(r).toMatchObject({ ok: false });
      expect((r as { erreur: string }).erreur).toContain(cle);
    }
  });
  it("refuse un champ inconnu dans une scène, un visuel ou des champs", () => {
    const a = video(); a.scenes[0].echantillon = "x"; expect(validerDemandeVideo(a).ok).toBe(false);
    const b = video(); b.scenes[0].visuel.visage = "x"; expect(validerDemandeVideo(b).ok).toBe(false);
    const c = video(); c.scenes[0].visuel.champs.html = "<b>"; expect(validerDemandeVideo(c).ok).toBe(false);
  });
  it("illustration de scène : facultative, transmise telle quelle, bornée à 20..2500 caractères", () => {
    const sans = validerDemandeVideo(video());
    expect(sans.ok && "illustration" in (sans.demande.scenes as Record<string, unknown>[])[0]!).toBe(false);
    const texte = "Un renard roux sous la neige, forêt calme, lumière douce du soir, zone dégagée à gauche.";
    const a = video(); a.scenes[0].illustration = texte;
    const r = validerDemandeVideo(a);
    expect(r.ok && (r.demande.scenes as Record<string, unknown>[])[0]!.illustration).toBe(texte);
    for (const n of [20, 2500]) { const b = video(); b.scenes[0].illustration = "x".repeat(n); expect(validerDemandeVideo(b).ok).toBe(true); }
    for (const mauvais of ["x".repeat(19), "x".repeat(2501), "", 7, null]) {
      const c = video(); c.scenes[0].illustration = mauvais; expect(validerDemandeVideo(c).ok).toBe(false);
    }
    const d = video(); d.scenes[0].illustration = "ab\uD800" + "x".repeat(30); expect(validerDemandeVideo(d).ok).toBe(false);
    expect(validerDemandeVideo({ ...video(), illustration: texte }).ok).toBe(false); // le champ est par scène, pas au niveau de la demande
  });
  it("refuse un gabarit ou un format de sortie hors liste", () => {
    const a = video(); a.scenes[0].visuel.gabarit = "libre"; expect(validerDemandeVideo(a).ok).toBe(false);
    expect(validerDemandeVideo({ ...video(), format_sortie: "640x480" }).ok).toBe(false);
  });
  it("refuse 0 scène et 31 scènes, accepte 30", () => {
    const une = video().scenes[0];
    expect(validerDemandeVideo({ ...video(), scenes: [] }).ok).toBe(false);
    expect(validerDemandeVideo({ ...video(), scenes: Array.from({ length: 31 }, () => une) }).ok).toBe(false);
    expect(validerDemandeVideo({ ...video(), scenes: Array.from({ length: 30 }, () => une) }).ok).toBe(true);
  });
  it("refuse un texte de voix trop long ou vide, accepte 1500", () => {
    const a = video(); a.scenes[0].texte_voix = "x".repeat(1501); expect(validerDemandeVideo(a).ok).toBe(false);
    const b = video(); b.scenes[0].texte_voix = ""; expect(validerDemandeVideo(b).ok).toBe(false);
    const c = video(); c.scenes[0].texte_voix = "x".repeat(1500); expect(validerDemandeVideo(c).ok).toBe(true);
  });
  it("champs selon le gabarit : obligatoire manquant ou champ d'un autre gabarit refusés", () => {
    const a = video(); delete a.scenes[2].visuel.champs.points; expect(validerDemandeVideo(a).ok).toBe(false);
    const b = video(); delete b.scenes[1].visuel.champs.titre; expect(validerDemandeVideo(b).ok).toBe(false);
    const c = video(); c.scenes[0].visuel.champs.chiffre = "3"; expect(validerDemandeVideo(c).ok).toBe(false);
    const d = video(); d.scenes[2].visuel.champs.sous_titre = "x"; expect(validerDemandeVideo(d).ok).toBe(false);
  });
  it("points : exactement 3 (2 et 4 refusés)", () => {
    const a = video(); a.scenes[2].visuel.champs.points = ["a", "b"]; expect(validerDemandeVideo(a).ok).toBe(false);
    const b = video(); b.scenes[2].visuel.champs.points = ["a", "b", "c", "d"]; expect(validerDemandeVideo(b).ok).toBe(false);
  });
  it("limites des champs visuels (titre 120, sous-titre 200, chiffre 20, point 120)", () => {
    const cas: Array<[string, string, number]> = [["titre", "t", 120], ["sous_titre", "s", 200], ["chiffre", "c", 20]];
    for (const [champ, c, max] of cas) {
      // Scène 1 = chiffre_cle, seul gabarit qui porte les trois champs (titre et chiffre obligatoires, sous-titre facultatif).
      const ok = video(); ok.scenes[1].visuel.champs = { titre: "t", chiffre: "1", [champ]: c.repeat(max) }; expect(validerDemandeVideo(ok).ok).toBe(true);
      const ko = video(); ko.scenes[1].visuel.champs = { titre: "t", chiffre: "1", [champ]: c.repeat(max + 1) }; expect(validerDemandeVideo(ko).ok).toBe(false);
    }
    const p = video(); p.scenes[2].visuel.champs.points = ["a", "b", "c".repeat(121)]; expect(validerDemandeVideo(p).ok).toBe(false);
  });
  it("identifiants de voix et de musique : [a-z0-9-]{1,64} seulement", () => {
    for (const mauvais of ["Voix", "../x", "a b", "", "a".repeat(65), "voix_fr"]) {
      const a = video(); a.scenes[0].voix = mauvais; expect(validerDemandeVideo(a).ok).toBe(false);
      expect(validerDemandeVideo({ ...video(), musique: mauvais }).ok).toBe(false);
    }
  });
  it("durée max : 1 à 60 seulement, sous_titres booléen obligatoire", () => {
    for (const d of [0, 0.5, 61, "10", NaN]) { const a = video(); a.scenes[0].duree_max = d; expect(validerDemandeVideo(a).ok).toBe(false); }
    for (const d of [1, 60]) { const a = video(); a.scenes[0].duree_max = d; expect(validerDemandeVideo(a).ok).toBe(true); }
    const { sous_titres: _s, ...sans } = video();
    expect(validerDemandeVideo(sans).ok).toBe(false);
    expect(validerDemandeVideo({ ...video(), sous_titres: "oui" }).ok).toBe(false);
  });
  it("vidéo publicitaire : sous_titres à false refusé avec un message clair, sans toucher au contrat de format", () => {
    const r = validerDemandeVideoPublicitaire({ ...video(), sous_titres: false });
    expect(r).toMatchObject({ ok: false });
    expect((r as { erreur: string }).erreur).toContain("sous-titres sont obligatoires");
    expect(validerDemandeVideoPublicitaire({ ...video(), sous_titres: true }).ok).toBe(true);
    expect(validerDemandeVideoPublicitaire({ ...video(), sous_titres: "oui" }).ok).toBe(false);
    expect(validerDemandeVideo({ ...video(), sous_titres: false }).ok).toBe(true); // contrat partagé avec la fabrique Python
  });
  it("retire les caractères de contrôle, refuse l'UTF-8 invalide et plus de 256 Kio", () => {
    const a = video(); a.scenes[0].texte_voix = "a\u0000b\nc"; 
    const r = validerDemandeVideo(a);
    expect(r.ok && (r.demande.scenes as Array<{ texte_voix: string }>)[0]!.texte_voix).toBe("ab\nc");
    const b = video(); b.scenes[0].texte_voix = "ab\uD800"; expect(validerDemandeVideo(b).ok).toBe(false);
    const gros = Array.from({ length: 30 }, () => ({ texte_voix: "é".repeat(1500), voix: "v", visuel: { gabarit: "chiffre_cle", champs: { chiffre: "1", titre: "é".repeat(120), sous_titre: "é".repeat(200) } } }));
    expect(validerDemandeVideo({ ...video(), scenes: gros }).ok).toBe(true); // 30 x ~3,6 Kio : sous la limite
  });
  it("le manifeste déclare les cinq outils de la fabrique (et ceux du moteur) et les clés fabriqueAgentsDocuments, fabriqueAgentsVideo et fabriqueAgentsImage", () => {
    expect((manifest.tools ?? []).map((t) => t.name).sort()).toEqual(["arbitrage_deposer", "decision_demander", "etat_fabrication", "fabriquer_document", "fabriquer_image", "fabriquer_video", "livrable_deposer", "mission_etat", "sources_lister", "verdict_deposer", "voir_rendu"]);
    expect(Object.keys((manifest.instanceConfigSchema as any).properties)).toEqual(expect.arrayContaining(["fabriqueAgentsDocuments", "fabriqueAgentsVideo", "fabriqueAgentsImage"]));
  });
});

const image = (): Record<string, any> => ({
  format: "1080x1350",
  gabarit: "accroche",
  champs: { titre: "Un titre", sous_titre: "Une suite" },
  charte: "charte-principale",
});

describe("validation de fabriquer_image", () => {
  it("accepte une demande valide, pour chaque format et chaque gabarit", () => {
    expect(validerDemandeImage(image()).ok).toBe(true);
    for (const format of ["1080x1080", "1080x1350", "1440x1800", "1080x1920", "1200x628"]) expect(validerDemandeImage({ ...image(), format }).ok).toBe(true);
    const parGabarit: Record<string, Record<string, unknown>> = {
      accroche: { titre: "t", sous_titre: "s", appel_action: "a", mentions_legales: "m" },
      chiffre_cle: { chiffre: "42 %", titre: "t", sous_titre: "s", mentions_legales: "m" },
      liste_3_points: { titre: "t", points: ["a", "b", "c"], appel_action: "a", mentions_legales: "m" },
      offre: { titre: "t", appel_action: "a", chiffre: "-20 %", sous_titre: "s", mentions_legales: "m" },
    };
    for (const [gabarit, champs] of Object.entries(parGabarit)) expect(validerDemandeImage({ ...image(), gabarit, champs }).ok).toBe(true);
  });
  it("refuse un champ en trop à chaque niveau, dont fond_ia (I2 coupé) et toute couleur, police, fichier ou URL", () => {
    for (const cle of ["fond_ia", "couleur", "police", "logo", "url", "fichier", "html"]) {
      const r = validerDemandeImage({ ...image(), [cle]: "x" });
      expect(r).toMatchObject({ ok: false });
      expect((r as { erreur: string }).erreur).toContain(cle);
    }
    expect(validerDemandeImage({ ...image(), fond_ia: true }).ok).toBe(false);
    for (const cle of ["couleur", "police", "logo", "url", "html"]) {
      const a = image(); a.champs[cle] = "x"; expect(validerDemandeImage(a).ok).toBe(false);
    }
    const b = image(); b.champs.titre = "#ff0000"; b.champs.sous_titre = "https://exemple.be/a.png"; expect(validerDemandeImage(b).ok).toBe(true); // du texte, rendu échappé par la fabrique
  });
  it("refuse un gabarit, un format ou une charte inconnus ; 1200x627 refusé", () => {
    expect(validerDemandeImage({ ...image(), gabarit: "libre" }).ok).toBe(false);
    expect(validerDemandeImage({ ...image(), format: "640x480" }).ok).toBe(false);
    expect(validerDemandeImage({ ...image(), format: "1200x627" }).ok).toBe(false);
    for (const charte of ["", "Charte", "../charte", "a/b", "x".repeat(65), 7]) expect(validerDemandeImage({ ...image(), charte }).ok).toBe(false);
    expect(validerDemandeImage({ ...image(), charte: "x".repeat(64) }).ok).toBe(true);
  });
  it("refuse un champ obligatoire manquant ou une des quatre clés de la demande absente", () => {
    for (const cle of ["format", "gabarit", "champs", "charte"]) {
      const a = image(); delete a[cle]; expect(validerDemandeImage(a).ok).toBe(false);
    }
    const b = image(); delete b.champs.titre; expect(validerDemandeImage(b).ok).toBe(false);
    const c = { ...image(), gabarit: "chiffre_cle", champs: { titre: "t" } }; expect(validerDemandeImage(c).ok).toBe(false);
    const d = { ...image(), gabarit: "offre", champs: { titre: "t" } }; expect(validerDemandeImage(d).ok).toBe(false);
    const e = { ...image(), gabarit: "liste_3_points", champs: { titre: "t" } }; expect(validerDemandeImage(e).ok).toBe(false);
  });
  it("refuse le champ d'un autre gabarit", () => {
    const a = image(); a.champs.chiffre = "3"; expect(validerDemandeImage(a).ok).toBe(false); // accroche n'a pas de chiffre
    const b = { ...image(), gabarit: "chiffre_cle", champs: { chiffre: "3", titre: "t", appel_action: "a" } }; expect(validerDemandeImage(b).ok).toBe(false);
    const c = { ...image(), gabarit: "offre", champs: { titre: "t", appel_action: "a", points: ["a", "b", "c"] } }; expect(validerDemandeImage(c).ok).toBe(false);
    const d = { ...image(), gabarit: "liste_3_points", champs: { titre: "t", points: ["a", "b", "c"], sous_titre: "s" } }; expect(validerDemandeImage(d).ok).toBe(false);
  });
  it("plafonds : le maximum passe, le maximum + 1 est refusé", () => {
    const plafonds = { titre: 90, sous_titre: 160, appel_action: 30, mentions_legales: 200 };
    for (const [champ, max] of Object.entries(plafonds)) {
      const ok = image(); ok.champs = { titre: "t", [champ]: "x".repeat(max) }; expect(validerDemandeImage(ok).ok).toBe(true);
      const ko = image(); ko.champs = { titre: "t", [champ]: "x".repeat(max + 1) }; expect(validerDemandeImage(ko).ok).toBe(false);
    }
    const chiffre = (n: number) => ({ ...image(), gabarit: "chiffre_cle", champs: { chiffre: "9".repeat(n), titre: "t" } });
    expect(validerDemandeImage(chiffre(20)).ok).toBe(true);
    expect(validerDemandeImage(chiffre(21)).ok).toBe(false);
    const points = (p: string[]) => ({ ...image(), gabarit: "liste_3_points", champs: { titre: "t", points: p } });
    expect(validerDemandeImage(points(["a", "b", "c".repeat(80)])).ok).toBe(true);
    expect(validerDemandeImage(points(["a", "b", "c".repeat(81)])).ok).toBe(false);
  });
  it("points : exactement 3 textes", () => {
    const points = (p: unknown) => ({ ...image(), gabarit: "liste_3_points", champs: { titre: "t", points: p } });
    expect(validerDemandeImage(points(["a", "b"])).ok).toBe(false);
    expect(validerDemandeImage(points(["a", "b", "c", "d"])).ok).toBe(false);
    expect(validerDemandeImage(points("abc")).ok).toBe(false);
    expect(validerDemandeImage(points(["a", "b", 3])).ok).toBe(false);
  });
  it("illustration : facultative, transmise telle quelle, bornée à 20..2500 caractères", () => {
    const sans = validerDemandeImage(image());
    expect(sans.ok && "illustration" in sans.demande).toBe(false);
    const texte = "Un renard roux sous la neige, forêt calme, lumière douce du soir, zone dégagée à gauche.";
    const r = validerDemandeImage({ ...image(), illustration: texte });
    expect(r.ok && r.demande.illustration).toBe(texte);
    for (const n of [20, 2500]) expect(validerDemandeImage({ ...image(), illustration: "x".repeat(n) }).ok).toBe(true);
    for (const mauvais of ["x".repeat(19), "x".repeat(2501), "", 7, null]) expect(validerDemandeImage({ ...image(), illustration: mauvais }).ok).toBe(false);
    expect(validerDemandeImage({ ...image(), illustration: "ab\uD800" + "x".repeat(30) }).ok).toBe(false);
    const paragraphes = validerDemandeImage({ ...image(), illustration: "Premier paragraphe de la scène.\n\n\tSecond\r\nparagraphe, même scène." });
    expect(paragraphes.ok && paragraphes.demande.illustration).toBe("Premier paragraphe de la scène. Second paragraphe, même scène.");
    expect(validerDemandeImage({ ...image(), illustration: "x".repeat(30) + "\x07" }).ok).toBe(false);
    expect(validerDemandeImage({ ...image(), illustration: "x".repeat(2490) + "\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n" }).ok).toBe(true); // la suite de sauts compte pour une seule espace
  });
  it("les schémas déclarent illustration (image et chaque scène) sans promettre l'absence de fond IA", async () => {
    const { DECLARATION_FABRIQUER_IMAGE: di, DECLARATION_FABRIQUER_VIDEO: dv } = await import("../src/contrats/fabrique-outils-schemas.js");
    const attendu = { type: "string", minLength: 20, maxLength: 2500 };
    const pi = (di.parametersSchema as any).properties;
    expect(pi.illustration).toEqual(attendu);
    expect((di.parametersSchema as any).required).not.toContain("illustration");
    const ps = (dv.parametersSchema as any).properties.scenes.items;
    expect(ps.properties.illustration).toEqual(attendu);
    expect(ps.required).not.toContain("illustration");
    expect(di.description).not.toContain("fond généré par l'IA");
    expect(di.description).toContain("illustration");
    expect(dv.description).toContain("illustration");
  });
  it("types : texte attendu, objet attendu, UTF-8 valide, contrôles retirés", () => {
    for (const mauvais of [null, "x", [], 3]) expect(validerDemandeImage(mauvais).ok).toBe(false);
    expect(validerDemandeImage({ ...image(), champs: "x" }).ok).toBe(false);
    const a = image(); a.champs.titre = 3; expect(validerDemandeImage(a).ok).toBe(false);
    const b = image(); b.champs.titre = "ab\uD800"; expect(validerDemandeImage(b).ok).toBe(false);
    const c = image(); c.champs.titre = "a\u0000b"; const r = validerDemandeImage(c);
    expect(r.ok && (r.demande.champs as { titre: string }).titre).toBe("ab");
    const d = image(); d.champs.titre = ""; expect(validerDemandeImage(d).ok).toBe(false); // obligatoire vide
  });
});

describe("outils : agent, quota, dépôt, étanchéité", () => {
  let dossier: string;
  let etat: Map<string, unknown>;
  let config: Record<string, unknown>;
  let connus: Set<string>;
  let avertissements: string[];
  let jour: string;
  let suivi: unknown;
  let suiviEchec: boolean;
  let tacheRun: string | null;
  let dossierRendu: ResultatDossierSujet;
  let appelsDossier: Array<[string, string]>;
  let sansLecteur: boolean;
  let lecteurReel: DependancesFabrique["dossierSujet"] | null;

  const fabrique = () => {
    const deps: DependancesFabrique = {
      agentConnu: async (agentId) => connus.has(agentId),
      avertir: (m) => void avertissements.push(m),
      config: async () => config,
      etatLire: async (cle, entreprise) => etat.get(`${entreprise}/${cle}`) ?? null,
      etatEcrire: async (cle, entreprise, v) => void etat.set(`${entreprise}/${cle}`, v),
      suiviLire: async () => suivi,
      suiviEcrire: async (v) => {
        if (suiviEchec) throw new Error("disque plein");
        suivi = v;
      },
      tacheDuRun: async () => tacheRun,
      dossierSujet: sansLecteur
        ? undefined
        : (lecteurReel ??
          (async (tache, entreprise) => {
            appelsDossier.push([tache, entreprise]);
            return dossierRendu;
          })),
      maintenant: () => new Date(`${jour}T10:00:00Z`),
    };
    return creerOutilsFabrique(deps);
  };
  const run = (companyId = ENTREPRISE_A) => ({ agentId: AGENT, runId: RUN, companyId });

  beforeEach(() => {
    dossier = mkdtempSync(join(tmpdir(), "fabrique-"));
    etat = new Map();
    config = { fabriqueDossierFile: dossier, fabriqueAgentsDocuments: [AGENT] };
    connus = new Set([AGENT, AUTRE_AGENT]);
    avertissements = [];
    jour = "2026-10-24";
    suivi = [];
    suiviEchec = false;
    tacheRun = TACHE;
    dossierRendu = DOSSIER_OK;
    appelsDossier = [];
    sansLecteur = false;
    lecteurReel = null;
  });
  afterEach(() => rmSync(dossier, { recursive: true, force: true }));

  it("liste d'agents vide par défaut : tout est refusé", async () => {
    config = { fabriqueDossierFile: dossier };
    const r = await fabrique().fabriquerDocument(valide(), run());
    expect(r.error).toContain("Refusé");
    expect(() => readdirSync(join(dossier, "entrant"))).toThrow();
  });
  it("agent hors liste (même rôle Paperclip qu'un agent retenu) ou agent inconnu : refusé", async () => {
    expect((await fabrique().fabriquerDocument(valide(), { ...run(), agentId: AUTRE_AGENT })).error).toContain("Refusé");
    connus = new Set();
    expect((await fabrique().fabriquerDocument(valide(), run())).error).toContain("Refusé");
  });
  it("anciennes clés fabriqueRoles* seules : tout est refusé (pas de repli sur le rôle) et un seul avertissement", async () => {
    config = { fabriqueDossierFile: dossier, fabriqueRolesDocuments: ["designer"], fabriqueRolesVideo: ["designer"] };
    const f = fabrique();
    expect((await f.fabriquerDocument(valide(), run())).error).toContain("Refusé");
    expect((await f.fabriquerVideo(video(), run())).error).toContain("Refusé");
    expect(avertissements).toHaveLength(1);
    expect(() => readdirSync(join(dossier, "entrant"))).toThrow();
  });
  it("demande invalide : refusée sans dépôt ni quota consommé", async () => {
    const r = await fabrique().fabriquerDocument({ ...valide(), sortie: "../../x" }, run());
    expect(r.error).toContain("Demande refusée");
    expect(etat.size).toBe(0);
  });
  it("dépôt atomique : fichier final seul, mode 0640, contenu attendu, réponse en_file", async () => {
    const r = await fabrique().fabriquerDocument(valide(), run());
    const { travail, etat: e } = r.data as { travail: string; etat: string };
    expect(e).toBe("en_file");
    expect(travail).toMatch(UUID);
    const fichiers = readdirSync(join(dossier, "entrant"));
    expect(fichiers).toEqual([`${travail}.json`]);
    const chemin = join(dossier, "entrant", fichiers[0]!);
    expect(statSync(chemin).mode & 0o777).toBe(0o640);
    const contenu = JSON.parse(readFileSync(chemin, "utf8"));
    expect(Object.keys(contenu).sort()).toEqual(["agent", "cree_le", "demande", "entreprise", "run", "tache", "travail", "type"]);
    expect(contenu).toMatchObject({ travail, entreprise: ENTREPRISE_A, agent: AGENT, run: RUN, type: "document", cree_le: "2026-10-24T10:00:00.000Z" });
    expect(contenu.demande.titre).toBe("Offre");
  });
  it("échec du dépôt : message neutre et quota rendu", async () => {
    writeFileSync(join(dossier, "entrant"), "je suis un fichier"); // le dossier de dépôt ne peut pas être créé
    const r = await fabrique().fabriquerDocument(valide(), run());
    expect(r.error).toContain("Dépôt impossible");
    expect((etat.get(`${ENTREPRISE_A}/fabrique-quota`) as { n: number }).n).toBe(0);
  });
  it("quota : 50 travaux par jour et par entreprise, remis à zéro le lendemain", async () => {
    const f = fabrique();
    for (let i = 0; i < QUOTA_TRAVAUX_PAR_JOUR; i++) expect((await f.fabriquerDocument(valide(), run())).error).toBeUndefined();
    expect((await f.fabriquerDocument(valide(), run())).error).toContain("Quota");
    expect((await f.fabriquerDocument(valide(), run(ENTREPRISE_B))).error).toBeUndefined();
    jour = "2026-10-25";
    expect((await fabrique().fabriquerDocument(valide(), run())).error).toBeUndefined();
  });
  it("quota : appels simultanés, jamais plus de 50 acceptés", async () => {
    const f = fabrique();
    const rs = await Promise.all(Array.from({ length: 60 }, () => f.fabriquerDocument(valide(), run())));
    expect(rs.filter((r) => !r.error)).toHaveLength(QUOTA_TRAVAUX_PAR_JOUR);
  });

  const poser = (entreprise: string, travail: string, nom: string, v: unknown) => {
    const d = join(dossier, "livrables", entreprise, travail);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, nom), JSON.stringify(v));
  };
  const T = "33333333-3333-4333-8333-333333333333";

  it("etat_fabrication : lit etat.json puis resultat.json s'il existe", async () => {
    poser(ENTREPRISE_A, T, "etat.json", { etat: "en_cours" });
    expect((await fabrique().etatFabrication({ travail: T }, run())).data).toEqual({ travail: T, etat: { etat: "en_cours" } });
    poser(ENTREPRISE_A, T, "resultat.json", { livrable: "x" });
    expect((await fabrique().etatFabrication({ travail: T }, run())).data).toEqual({ travail: T, etat: { etat: "en_cours" }, resultat: { livrable: "x" } });
  });
  it("etat_fabrication : l'entreprise A ne voit pas le travail de B, même message qu'un travail inexistant", async () => {
    poser(ENTREPRISE_B, T, "etat.json", { etat: "termine" });
    const autre = await fabrique().etatFabrication({ travail: T }, run(ENTREPRISE_A));
    const inexistant = await fabrique().etatFabrication({ travail: "44444444-4444-4444-8444-444444444444" }, run(ENTREPRISE_A));
    expect(autre.error).toBe("Travail introuvable.");
    expect(inexistant.error).toBe(autre.error);
    expect((await fabrique().etatFabrication({ travail: T }, run(ENTREPRISE_B))).error).toBeUndefined();
  });
  it("etat_fabrication : un agent hors liste et non déposant est refusé, sans aucun contenu", async () => {
    poser(ENTREPRISE_A, T, "etat.json", { etat: "termine" });
    poser(ENTREPRISE_A, T, "apercu.txt", "secret");
    const r = await fabrique().etatFabrication({ travail: T }, { ...run(), agentId: AUTRE_AGENT });
    expect(r.error).toContain("Refusé");
    expect(r.data).toBeUndefined();
    expect(r.content).toBeUndefined();
  });
  it("etat_fabrication : l'agent déposant reste admis même retiré des listes autorisées", async () => {
    poser(ENTREPRISE_A, T, "etat.json", { etat: "en_cours" });
    suivi = [{ entreprise: ENTREPRISE_A, travail: T, agent: AUTRE_AGENT, run: RUN, tache: null, cree: "2026-10-24T10:00:00.000Z", essais: 0 }];
    expect((await fabrique().etatFabrication({ travail: T }, { ...run(), agentId: AUTRE_AGENT })).error).toBeUndefined();
  });
  it("etat_fabrication : un agent autorisé à fabriquer des vidéos seulement est admis", async () => {
    config = { fabriqueDossierFile: dossier, fabriqueAgentsVideo: [AUTRE_AGENT] };
    poser(ENTREPRISE_A, T, "etat.json", { etat: "en_cours" });
    expect((await fabrique().etatFabrication({ travail: T }, { ...run(), agentId: AUTRE_AGENT })).error).toBeUndefined();
  });
  it("échec de l'écriture du suivi : le dépôt réussit et l'échec est journalisé avec le travail", async () => {
    suiviEchec = true;
    const r = await fabrique().fabriquerDocument(valide(), run());
    const { travail } = r.data as { travail: string };
    expect(r.error).toBeUndefined();
    expect(avertissements.some((m) => m.includes(travail))).toBe(true);
  });
  it("etat_fabrication : un identifiant non UUID est refusé", async () => {
    for (const mauvais of ["../../etc/passwd", "abc", "", 42, ENTREPRISE_A + "/.."]) {
      expect((await fabrique().etatFabrication({ travail: mauvais }, run())).error).toContain("UUID");
    }
    expect((await fabrique().etatFabrication({ travail: T, extra: 1 }, run())).error).toContain("Demande refusée");
  });

  describe("fabriquer_video", () => {
    beforeEach(() => {
      config = { fabriqueDossierFile: dossier, fabriqueAgentsDocuments: [AGENT], fabriqueAgentsVideo: [AGENT] };
    });
    it("liste d'agents vidéo vide par défaut : tout est refusé, même pour un agent autorisé aux documents", async () => {
      config = { fabriqueDossierFile: dossier, fabriqueAgentsDocuments: [AGENT] };
      expect((await fabrique().fabriquerVideo(video(), run())).error).toContain("Refusé");
      expect(() => readdirSync(join(dossier, "entrant"))).toThrow();
    });
    it("agent hors liste ou inconnu : refusé ; retenu pour les documents seulement : vidéo refusée ; vidéo seulement : documents refusés", async () => {
      expect((await fabrique().fabriquerVideo(video(), { ...run(), agentId: AUTRE_AGENT })).error).toContain("Refusé");
      config = { fabriqueDossierFile: dossier, fabriqueAgentsDocuments: [AGENT, AUTRE_AGENT], fabriqueAgentsVideo: [AGENT] };
      expect((await fabrique().fabriquerVideo(video(), { ...run(), agentId: AUTRE_AGENT })).error).toContain("Refusé");
      connus = new Set();
      expect((await fabrique().fabriquerVideo(video(), run())).error).toContain("Refusé");
      connus = new Set([AGENT]);
      config = { fabriqueDossierFile: dossier, fabriqueAgentsVideo: [AGENT] };
      expect((await fabrique().fabriquerDocument(valide(), run())).error).toContain("Refusé");
    });
    it("demande invalide : refusée sans dépôt ni quota consommé", async () => {
      const r = await fabrique().fabriquerVideo({ ...video(), echantillon: "x" }, run());
      expect(r.error).toContain("Demande refusée");
      expect(etat.size).toBe(0);
    });
    it("sous_titres à false : l'outil refuse la vidéo, sans dépôt ni quota consommé", async () => {
      const r = await fabrique().fabriquerVideo({ ...video(), sous_titres: false }, run());
      expect(r.error).toContain("Demande refusée");
      expect(r.error).toContain("sous-titres sont obligatoires");
      expect(etat.size).toBe(0);
      expect(existsSync(join(dossier, "entrant"))).toBe(false);
    });
    it("dépôt atomique de type video : fichier final seul, mode 0640, en-tête identique aux documents", async () => {
      const r = await fabrique().fabriquerVideo(video(), run());
      const { travail, etat: e } = r.data as { travail: string; etat: string };
      expect(e).toBe("en_file");
      expect(travail).toMatch(UUID);
      const fichiers = readdirSync(join(dossier, "entrant"));
      expect(fichiers).toEqual([`${travail}.json`]);
      const chemin = join(dossier, "entrant", fichiers[0]!);
      expect(statSync(chemin).mode & 0o777).toBe(0o640);
      const contenu = JSON.parse(readFileSync(chemin, "utf8"));
      expect(Object.keys(contenu).sort()).toEqual(["agent", "cree_le", "demande", "dossierSujet", "entreprise", "run", "tache", "travail", "type"]);
      expect(contenu.dossierSujet).toEqual({ issueId: TACHE, revisionId: REVISION_DOSSIER });
      expect(contenu).toMatchObject({ travail, entreprise: ENTREPRISE_A, agent: AGENT, run: RUN, type: "video", cree_le: "2026-10-24T10:00:00.000Z" });
      expect(contenu.demande.scenes).toHaveLength(3);
    });
    it("échec du dépôt : message neutre, quota total et quota vidéo rendus", async () => {
      writeFileSync(join(dossier, "entrant"), "je suis un fichier");
      const r = await fabrique().fabriquerVideo(video(), run());
      expect(r.error).toContain("Dépôt impossible");
      expect((etat.get(`${ENTREPRISE_A}/fabrique-quota`) as { n: number }).n).toBe(0);
      expect((etat.get(`${ENTREPRISE_A}/fabrique-quota-video`) as { n: number }).n).toBe(0);
    });
    it("plafond de 10 vidéos par jour et par entreprise, les documents restent possibles, remise à zéro le lendemain", async () => {
      const f = fabrique();
      for (let i = 0; i < QUOTA_VIDEOS_PAR_JOUR; i++) expect((await f.fabriquerVideo(video(), run())).error).toBeUndefined();
      expect((await f.fabriquerVideo(video(), run())).error).toContain("10 vidéos");
      expect((etat.get(`${ENTREPRISE_A}/fabrique-quota`) as { n: number }).n).toBe(QUOTA_VIDEOS_PAR_JOUR); // le refus ne consomme rien
      expect((await f.fabriquerDocument(valide(), run())).error).toBeUndefined();
      expect((await f.fabriquerVideo(video(), run(ENTREPRISE_B))).error).toBeUndefined();
      jour = "2026-10-25";
      expect((await fabrique().fabriquerVideo(video(), run())).error).toBeUndefined();
    });
    it("quota total partagé : 45 documents + 10 vidéos = 5 vidéos seulement, puis « Quota atteint : 50 travaux »", async () => {
      const f = fabrique();
      for (let i = 0; i < 45; i++) expect((await f.fabriquerDocument(valide(), run())).error).toBeUndefined();
      for (let i = 0; i < 5; i++) expect((await f.fabriquerVideo(video(), run())).error).toBeUndefined();
      expect((await f.fabriquerVideo(video(), run())).error).toContain("50 travaux");
      expect((etat.get(`${ENTREPRISE_A}/fabrique-quota-video`) as { n: number }).n).toBe(5);
    });
    it("appels simultanés : jamais plus de 10 vidéos acceptées", async () => {
      const f = fabrique();
      const rs = await Promise.all(Array.from({ length: 25 }, () => f.fabriquerVideo(video(), run())));
      expect(rs.filter((r) => !r.error)).toHaveLength(QUOTA_VIDEOS_PAR_JOUR);
    });
    it("étanchéité : le compteur vidéo d'une entreprise n'affecte pas l'autre", async () => {
      const f = fabrique();
      for (let i = 0; i < QUOTA_VIDEOS_PAR_JOUR; i++) await f.fabriquerVideo(video(), run());
      expect(etat.get(`${ENTREPRISE_B}/fabrique-quota-video`)).toBeUndefined();
      const r = await f.fabriquerVideo(video(), run(ENTREPRISE_B));
      const contenu = JSON.parse(readFileSync(join(dossier, "entrant", `${(r.data as { travail: string }).travail}.json`), "utf8"));
      expect(contenu.entreprise).toBe(ENTREPRISE_B);
    });
    it("etat_fabrication : un travail vidéo en_attente_gpu montre son état et sa raison ; B ne le voit pas", async () => {
      const d = join(dossier, "livrables", ENTREPRISE_A, T);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "etat.json"), JSON.stringify({ etat: "en_attente_gpu", type: "video", raison: "GPU occupé par un jeu" }));
      const r = await fabrique().etatFabrication({ travail: T }, run());
      expect(r.data).toEqual({ travail: T, etat: { etat: "en_attente_gpu", type: "video", raison: "GPU occupé par un jeu" } });
      expect((await fabrique().etatFabrication({ travail: T }, run(ENTREPRISE_B))).error).toBe("Travail introuvable.");
    });
  });
  describe("fabriquer_image", () => {
    beforeEach(() => {
      config = { fabriqueDossierFile: dossier, fabriqueAgentsDocuments: [AGENT], fabriqueAgentsImage: [AGENT] };
    });
    it("liste d'agents image vide par défaut : tout est refusé, même pour un agent autorisé aux documents", async () => {
      config = { fabriqueDossierFile: dossier, fabriqueAgentsDocuments: [AGENT], fabriqueAgentsVideo: [AGENT] };
      expect((await fabrique().fabriquerImage(image(), run())).error).toContain("Refusé");
      expect(() => readdirSync(join(dossier, "entrant"))).toThrow();
    });
    it("agent hors liste ou inconnu : refusé ; retenu pour l'image seulement : documents refusés", async () => {
      expect((await fabrique().fabriquerImage(image(), { ...run(), agentId: AUTRE_AGENT })).error).toContain("Refusé");
      connus = new Set();
      expect((await fabrique().fabriquerImage(image(), run())).error).toContain("Refusé");
      connus = new Set([AGENT]);
      config = { fabriqueDossierFile: dossier, fabriqueAgentsImage: [AGENT] };
      expect((await fabrique().fabriquerDocument(valide(), run())).error).toContain("Refusé");
    });
    it("demande invalide (fond_ia, couleur) : refusée sans dépôt ni quota consommé", async () => {
      for (const extra of [{ fond_ia: true }, { couleur: "#ff0000" }]) {
        expect((await fabrique().fabriquerImage({ ...image(), ...extra }, run())).error).toContain("Demande refusée");
      }
      expect(etat.size).toBe(0);
    });
    it("dépôt atomique de type image : fichier final seul, mode 0640, en-tête identique aux autres types", async () => {
      const r = await fabrique().fabriquerImage(image(), run());
      const { travail, etat: e } = r.data as { travail: string; etat: string };
      expect(e).toBe("en_file");
      const fichiers = readdirSync(join(dossier, "entrant"));
      expect(fichiers).toEqual([`${travail}.json`]);
      const chemin = join(dossier, "entrant", fichiers[0]!);
      expect(statSync(chemin).mode & 0o777).toBe(0o640);
      const contenu = JSON.parse(readFileSync(chemin, "utf8"));
      expect(Object.keys(contenu).sort()).toEqual(["agent", "cree_le", "demande", "dossierSujet", "entreprise", "run", "tache", "travail", "type"]);
      expect(contenu.dossierSujet).toEqual({ issueId: TACHE, revisionId: REVISION_DOSSIER });
      expect(contenu).toMatchObject({ travail, entreprise: ENTREPRISE_A, agent: AGENT, run: RUN, type: "image" });
      expect(Object.keys(contenu.demande).sort()).toEqual(["champs", "charte", "format", "gabarit"]);
    });
    it("échec du dépôt : message neutre, quota total et quota image rendus", async () => {
      writeFileSync(join(dossier, "entrant"), "je suis un fichier");
      const r = await fabrique().fabriquerImage(image(), run());
      expect(r.error).toContain("Dépôt impossible");
      expect((etat.get(`${ENTREPRISE_A}/fabrique-quota`) as { n: number }).n).toBe(0);
      expect((etat.get(`${ENTREPRISE_A}/fabrique-quota-image`) as { n: number }).n).toBe(0);
    });
    it("plafond de 30 images par jour et par entreprise, les documents restent possibles, remise à zéro le lendemain", async () => {
      expect(QUOTA_IMAGES_PAR_JOUR).toBe(30);
      const f = fabrique();
      for (let i = 0; i < QUOTA_IMAGES_PAR_JOUR; i++) expect((await f.fabriquerImage(image(), run())).error).toBeUndefined();
      expect((await f.fabriquerImage(image(), run())).error).toContain("30 images");
      expect((etat.get(`${ENTREPRISE_A}/fabrique-quota`) as { n: number }).n).toBe(QUOTA_IMAGES_PAR_JOUR); // le refus ne consomme rien
      expect((await f.fabriquerDocument(valide(), run())).error).toBeUndefined();
      expect((await f.fabriquerImage(image(), run(ENTREPRISE_B))).error).toBeUndefined();
      jour = "2026-10-25";
      expect((await fabrique().fabriquerImage(image(), run())).error).toBeUndefined();
    });
    it("etat_fabrication : l'agent retenu pour l'image seulement suit ses travaux ; un autre agent non", async () => {
      const d = join(dossier, "livrables", ENTREPRISE_A, T);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "etat.json"), JSON.stringify({ etat: "echec", type: "image", erreur: "charte refusée : inconnue" }));
      config = { fabriqueDossierFile: dossier, fabriqueAgentsImage: [AGENT] };
      const r = await fabrique().etatFabrication({ travail: T }, run());
      expect(r.data).toEqual({ travail: T, etat: { etat: "echec", type: "image", erreur: "charte refusée : inconnue" } });
      expect((await fabrique().etatFabrication({ travail: T }, { ...run(), agentId: AUTRE_AGENT })).error).toContain("Refusé");
    });
  });
  describe("fabriquer_image avec illustration (texte envoyé tel quel à la fabrique)", () => {
    const DESCRIPTION = "Un mage de Kirin Tor en robe violette lance un sort arcanique dans une taverne animée";
    const entrant = () => {
      try {
        return readdirSync(join(dossier, "entrant")).filter((n) => n.endsWith(".json"));
      } catch {
        return [];
      }
    };
    const deposee = (travail: string) => JSON.parse(readFileSync(join(dossier, "entrant", `${travail}.json`), "utf8")).demande;

    beforeEach(() => {
      config = { fabriqueDossierFile: dossier, fabriqueAgentsImage: [AGENT] };
    });

    it("illustration déposée telle quelle, seul ce champ ajouté, réponse en_file", async () => {
      const longue = `${DESCRIPTION} ${"x".repeat(1500)}`;
      const r = await fabrique().fabriquerImage({ ...image(), illustration: longue }, run());
      const { travail, etat: e } = r.data as { travail: string; etat: string };
      expect(e).toBe("en_file");
      expect(entrant()).toEqual([`${travail}.json`]);
      const demande = deposee(travail);
      expect(Object.keys(demande).sort()).toEqual(["champs", "charte", "format", "gabarit", "illustration"]);
      expect(demande.illustration).toBe(longue);
    });

    it("description en paragraphes : sauts de ligne et tabulations remplacés par une espace, aucun saut de ligne déposé", async () => {
      const r = await fabrique().fabriquerImage({ ...image(), illustration: `${DESCRIPTION}.\n\nLumière chaude,\r\n\tfond sombre.` }, run());
      const { travail, etat: e } = r.data as { travail: string; etat: string };
      expect(e).toBe("en_file");
      const { illustration } = deposee(travail);
      expect(illustration).toBe(`${DESCRIPTION}. Lumière chaude, fond sombre.`);
      expect(illustration).not.toMatch(/[\n\r\t]/);
    });

    it("autre caractère de contrôle (\\x07) : refusé, rien déposé", async () => {
      const r = await fabrique().fabriquerImage({ ...image(), illustration: `${DESCRIPTION}\x07` }, run());
      expect(r.error).toContain("illustration");
      expect(entrant()).toEqual([]);
    });

    it("sans illustration : dépôt immédiat inchangé", async () => {
      const r = await fabrique().fabriquerImage(image(), run());
      expect((r.data as { etat: string }).etat).toBe("en_file");
      expect(entrant()).toHaveLength(1);
    });
  });
  describe("garde du dossier du sujet (image et vidéo)", () => {
    type Fabrique = ReturnType<typeof fabrique>;
    const outils: Array<[string, (f: Fabrique) => ReturnType<Fabrique["fabriquerImage"]>, string]> = [
      ["image", (f) => f.fabriquerImage(image(), run()), "fabrique-quota-image"],
      ["vidéo", (f) => f.fabriquerVideo(video(), run()), "fabrique-quota-video"],
    ];
    beforeEach(() => {
      config = { fabriqueDossierFile: dossier, fabriqueAgentsDocuments: [AGENT], fabriqueAgentsVideo: [AGENT], fabriqueAgentsImage: [AGENT] };
    });
    const entrant = () => {
      try {
        return readdirSync(join(dossier, "entrant"));
      } catch {
        return [];
      }
    };
    const compteurs = (cleQuota: string) => JSON.stringify([etat.get(`${ENTREPRISE_A}/fabrique-quota`), etat.get(`${ENTREPRISE_A}/${cleQuota}`)]);

    describe.each(outils)("%s", (_nom, fabriquer, cleQuota) => {
      it("tâche du run introuvable : refus, rien déposé, aucun quota consommé", async () => {
        tacheRun = null;
        const r = await fabriquer(fabrique());
        expect(r.error).toContain("tâche");
        expect(appelsDossier).toEqual([]);
        expect(entrant()).toEqual([]);
        expect(etat.size).toBe(0);
      });
      it("aucun dossier : refus avec le message exact, rien déposé, aucun quota consommé", async () => {
        dossierRendu = { ok: false, refus: REFUS_AUCUN_DOSSIER };
        const r = await fabriquer(fabrique());
        expect(r.error).toBe("Aucun dossier du sujet : demander au coordinateur la sous-tâche Dossier du sujet (veille)");
        expect(appelsDossier).toEqual([[TACHE, ENTREPRISE_A]]);
        expect(entrant()).toEqual([]);
        expect(etat.size).toBe(0);
      });
      it("dossier invalide : refus avec la liste des défauts, rien déposé, aucun quota consommé", async () => {
        dossierRendu = { ok: false, refus: "Dossier du sujet invalide (tâche x) : Rubrique « Ton » absente. Rubrique « Droits » vide." };
        const r = await fabriquer(fabrique());
        expect(r.error).toContain("Rubrique « Ton » absente. Rubrique « Droits » vide.");
        expect(entrant()).toEqual([]);
        expect(etat.size).toBe(0);
      });
      it("garde fermée : sans dépendance de lecture du dossier, tout est refusé", async () => {
        sansLecteur = true;
        const r = await fabriquer(fabrique());
        expect(r.error).toContain("dossier du sujet");
        expect(entrant()).toEqual([]);
        expect(etat.size).toBe(0);
      });
      it("dossier valide : référence {issueId, revisionId} dans le fichier du travail et dans la réponse, avertissements inclus et journalisés", async () => {
        dossierRendu = { ...DOSSIER_OK, avertissements: ["Fait 2 : extrait « abc » non retrouvé"] };
        const r = await fabriquer(fabrique());
        const { travail } = r.data as { travail: string };
        expect(r.data).toMatchObject({ etat: "en_file", dossierSujet: { issueId: TACHE, revisionId: REVISION_DOSSIER }, avertissements: ["Fait 2 : extrait « abc » non retrouvé"] });
        const contenu = JSON.parse(readFileSync(join(dossier, "entrant", `${travail}.json`), "utf8"));
        expect(contenu.dossierSujet).toEqual({ issueId: TACHE, revisionId: REVISION_DOSSIER });
        expect(contenu.tache).toBe(TACHE);
        expect(avertissements.some((a) => a.includes(travail) && a.includes("extrait « abc »"))).toBe(true);
      });
      it("sans avertissement : la réponse n'en porte pas", async () => {
        const r = await fabriquer(fabrique());
        expect(r.data).not.toHaveProperty("avertissements");
      });
      it("un refus laisse les compteurs inchangés après un dépôt réussi", async () => {
        const f = fabrique();
        expect((await fabriquer(f)).error).toBeUndefined();
        const avant = compteurs(cleQuota);
        dossierRendu = { ok: false, refus: REFUS_AUCUN_DOSSIER };
        expect((await fabriquer(f)).error).toContain("Aucun dossier");
        expect(compteurs(cleQuota)).toBe(avant);
        expect(entrant()).toHaveLength(1);
      });
    });

    it("une demande invalide est refusée avant la lecture du dossier", async () => {
      const r = await fabrique().fabriquerImage({ ...image(), couleur: "#fff" }, run());
      expect(r.error).toContain("Demande refusée");
      expect(appelsDossier).toEqual([]);
    });

    it("fabriquer_document inchangé : ni tâche ni dossier exigés, aucune référence dans le fichier", async () => {
      tacheRun = null;
      dossierRendu = { ok: false, refus: REFUS_AUCUN_DOSSIER };
      const r = await fabrique().fabriquerDocument(valide(), run());
      expect(r.error).toBeUndefined();
      expect(appelsDossier).toEqual([]);
      const contenu = JSON.parse(readFileSync(join(dossier, "entrant", entrant()[0]!), "utf8"));
      expect(contenu).not.toHaveProperty("dossierSujet");
    });

    const CORPS = [
      "## Sujet\nUn jeu.",
      "## Faits vérifiés\n| Fait | Source | Extrait |\n| --- | --- | --- |\n" +
        ["a", "b", "c"].map((x) => `| ${x} | connaissance://${x} | Une phrase exacte d'au moins vingt caractères ${x} |`).join("\n"),
      "## Vocabulaire et références du public\nTermes.",
      "## Ton\nDrôle.",
      "## À ne pas dire\nRien.",
      "## Droits\nÀ confirmer.",
    ].join("\n\n");
    describe.each([
      ["la tâche du run", TACHE],
      ["une tâche bloquante", "bloquante"],
      ["la tâche parente", "parente"],
      ["une tâche sœur", "soeur"],
    ])("recherche réelle du dossier sur %s", (_nom, porteuse) => {
      it("accepte l'image et la vidéo", async () => {
        lecteurReel = creerRechercheDossierSujet({
          parente: async () => "parente",
          bloquantes: async () => ["bloquante"],
          soeurs: async () => ["soeur"],
          document: async (id) => (id === porteuse ? { body: CORPS, revisionId: REVISION_DOSSIER } : null),
          sources: async () => [],
          mode: async () => "reel",
        });
        const f = fabrique();
        for (const r of [await f.fabriquerImage(image(), run()), await f.fabriquerVideo(video(), run())]) {
          expect(r.error).toBeUndefined();
          expect(r.data).toMatchObject({ dossierSujet: { issueId: porteuse, revisionId: REVISION_DOSSIER } });
        }
      });
    });
  });
});

describe("etat_fabrication : travail refusé par la fabrique (#74)", () => {
  let dossier: string;
  const T = "33333333-3333-4333-8333-333333333333";
  const outils = () =>
    creerOutilsFabrique({
      agentConnu: async () => true,
      config: async () => ({ fabriqueDossierFile: dossier, fabriqueAgentsDocuments: [AGENT] }),
      etatLire: async () => null,
      etatEcrire: async () => undefined,
    });
  const poserAvis = (travail: string, avis: Record<string, unknown>) => {
    mkdirSync(join(dossier, "livrables", ".refus"), { recursive: true });
    writeFileSync(join(dossier, "livrables", ".refus", `${travail}.json`), JSON.stringify(avis));
  };
  const run = (companyId: string) => ({ agentId: AGENT, runId: RUN, companyId });

  beforeEach(() => {
    dossier = mkdtempSync(join(tmpdir(), "fabrique-refus-"));
  });
  afterEach(() => rmSync(dossier, { recursive: true, force: true }));

  it("etat_fabrication : un travail refusé rend son état echec et son motif", async () => {
    const avis = { travail: T, entreprise: ENTREPRISE_A, etat: "echec", fin: "2026-11-09T10:00:00+00:00", message: "refusé par la fabrique : entreprise non inscrite" };
    poserAvis(T, avis);
    const r = await outils().etatFabrication({ travail: T }, run(ENTREPRISE_A));
    expect(r.error).toBeUndefined();
    expect(r.data).toEqual({ travail: T, etat: avis });
  });
  it("etat_fabrication : l'avis de refus de B donne Travail introuvable. pour A", async () => {
    poserAvis(T, { travail: T, entreprise: ENTREPRISE_B, etat: "echec", fin: "2026-11-09T10:00:00+00:00", message: "refusé par la fabrique : quota" });
    const r = await outils().etatFabrication({ travail: T }, run(ENTREPRISE_A));
    expect(r.error).toBe("Travail introuvable.");
  });
});
