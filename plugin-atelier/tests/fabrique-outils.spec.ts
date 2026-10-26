/**
 * Outils d'agent de la fabrique (lot 2) : validation fermée, rôle, quota, dépôt atomique, étanchéité entre entreprises.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  creerOutilsFabrique,
  QUOTA_TRAVAUX_PAR_JOUR,
  QUOTA_VIDEOS_PAR_JOUR,
  validerDemandeDocument,
  validerDemandeVideo,
  type DependancesFabrique,
} from "../src/serveur/fabrique-outils.js";
import manifest from "../src/manifest.js";

const ENTREPRISE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENTREPRISE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AGENT = "11111111-1111-4111-8111-111111111111";
/** Autre agent de la même entreprise, de même rôle Paperclip mais non retenu. */
const AUTRE_AGENT = "22222222-2222-4222-8222-222222222222";
const RUN = "22222222-2222-4222-8222-222222222222";
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
  it("xlsx : feuilles typées, formule laissée en texte, nombre non fini refusé", () => {
    const x = {
      format: "xlsx", modele: "sobre", titre: "Chiffres", langue: "en",
      feuilles: [{ nom: "F1", lignes: [[{ type: "texte", valeur: "=SOMME(A1)" }, { type: "nombre", valeur: 3 }, { type: "date", valeur: "2026-10-24" }, { type: "booleen", valeur: true }]] }],
    };
    const r = validerDemandeDocument(x);
    expect(r.ok && JSON.stringify(r.demande.feuilles)).toContain("=SOMME(A1)");
    const infini = { ...x, feuilles: [{ nom: "F1", lignes: [[{ type: "nombre", valeur: Infinity }]] }] };
    expect(validerDemandeDocument(infini).ok).toBe(false);
    const typeFaux = { ...x, feuilles: [{ nom: "F1", lignes: [[{ type: "formule", valeur: "=1" }]] }] };
    expect(validerDemandeDocument(typeFaux).ok).toBe(false);
  });
  it("feuilles réservées à xlsx ; xlsx sans feuilles refusé", () => {
    expect(validerDemandeDocument({ ...valide(), feuilles: [] }).ok).toBe(false);
    expect(validerDemandeDocument({ format: "xlsx", modele: "sobre", titre: "t", langue: "en" }).ok).toBe(false);
  });
  it("le manifeste déclare les trois outils et la capacité", () => {
    expect(manifest.capabilities).toContain("agent.tools.register");
    expect((manifest.tools ?? []).map((t) => t.name).sort()).toEqual(["etat_fabrication", "fabriquer_document", "fabriquer_video"]);
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
  it("retire les caractères de contrôle, refuse l'UTF-8 invalide et plus de 256 Kio", () => {
    const a = video(); a.scenes[0].texte_voix = "a\u0000b\nc"; 
    const r = validerDemandeVideo(a);
    expect(r.ok && (r.demande.scenes as Array<{ texte_voix: string }>)[0]!.texte_voix).toBe("ab\nc");
    const b = video(); b.scenes[0].texte_voix = "ab\uD800"; expect(validerDemandeVideo(b).ok).toBe(false);
    const gros = Array.from({ length: 30 }, () => ({ texte_voix: "é".repeat(1500), voix: "v", visuel: { gabarit: "chiffre_cle", champs: { chiffre: "1", titre: "é".repeat(120), sous_titre: "é".repeat(200) } } }));
    expect(validerDemandeVideo({ ...video(), scenes: gros }).ok).toBe(true); // 30 x ~3,6 Kio : sous la limite
  });
  it("le manifeste déclare trois outils et les clés fabriqueAgentsDocuments et fabriqueAgentsVideo", () => {
    expect((manifest.tools ?? []).map((t) => t.name).sort()).toEqual(["etat_fabrication", "fabriquer_document", "fabriquer_video"]);
    expect(Object.keys((manifest.instanceConfigSchema as any).properties)).toEqual(expect.arrayContaining(["fabriqueAgentsDocuments", "fabriqueAgentsVideo"]));
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
    expect(Object.keys(contenu).sort()).toEqual(["agent", "cree_le", "demande", "entreprise", "run", "travail", "type"]);
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
      expect(Object.keys(contenu).sort()).toEqual(["agent", "cree_le", "demande", "entreprise", "run", "travail", "type"]);
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
});
