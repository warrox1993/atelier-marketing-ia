/**
 * Contrats partagés avec la fabrique Python : mêmes fichiers (`fabrique/contrats-essai/*.json`) que
 * `fabrique/tests/test_contrats.py`, même verdict exigé des deux côtés.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validerDemandeDocument, validerDemandeVideo } from "../src/serveur/fabrique-outils.js";
import { lireRegistreVoix, verifierProvenance } from "../src/serveur/fabrique-provenance.js";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fabrique", "contrats-essai");
const charger = (nom: string): any => JSON.parse(readFileSync(join(DOSSIER, nom), "utf8"));

interface CasDemande { nom: string; demande: unknown; valide: boolean; divergence_connue?: string }

/** Cas ordinaire : verdict exigé. Cas à divergence connue (défaut révélé, non corrigé) : le verdict doit encore être faux, et le test échoue dès que le défaut est corrigé (retirer alors la marque). */
const executer = (c: CasDemande, valider: (d: unknown) => { ok: boolean }) => {
  const corps = () => expect(valider(structuredClone(c.demande)).ok).toBe(c.valide);
  return c.divergence_connue ? it.fails(`${c.nom} [divergence connue : ${c.divergence_connue}]`, corps) : it(c.nom, corps);
};

describe("contrat des demandes document (même verdict que la fabrique Python)", () => {
  const jeu = charger("demandes-document.json").cas as CasDemande[];
  it("le jeu contient des cas valides et invalides", () => {
    expect(jeu.filter((c) => c.valide).length).toBeGreaterThanOrEqual(5);
    expect(jeu.filter((c) => !c.valide).length).toBeGreaterThanOrEqual(20);
  });
  for (const c of jeu) executer(c, validerDemandeDocument);
});

describe("contrat des demandes vidéo (même verdict que la fabrique Python)", () => {
  const jeu = charger("demandes-video.json").cas as CasDemande[];
  it("le jeu contient des cas valides et invalides", () => {
    expect(jeu.filter((c) => c.valide).length).toBeGreaterThanOrEqual(5);
    expect(jeu.filter((c) => !c.valide).length).toBeGreaterThanOrEqual(20);
  });
  for (const c of jeu) executer(c, validerDemandeVideo);
});

describe("contrat de provenance.json (écrit par la fabrique, lu par verifierProvenance)", () => {
  const jeu = charger("provenance.json");
  const shaConforme = createHash("sha256").update(Buffer.from(jeu.contenu_fichier_utf8, "utf8")).digest("hex");

  it("l'empreinte de la base correspond au contenu du jeu", () => {
    expect(jeu.provenance.sha256).toBe(shaConforme);
  });

  it.each((jeu.cas as any[]).map((c) => [c.nom, c] as const))("%s", (_nom, c) => {
    let provenance: any = c.provenance_nulle ? null : { ...jeu.provenance, ...(c.remplacer ?? {}) };
    for (const cle of c.supprimer ?? []) delete provenance[cle];
    const brut = c.registre ? jeu.registres[c.registre] : jeu.registres.ok;
    const registre = lireRegistreVoix(brut);
    const shaReel = c.sha_reel === "conforme" ? shaConforme : c.sha_reel;
    const verdict = verifierProvenance({
      provenance, fichier: c.base_video ? "video.mp4" : jeu.provenance.fichier,
      entreprise: jeu.entreprise, shaReel, registre, maintenant: new Date(jeu.maintenant),
    });
    expect(verdict.ok, JSON.stringify(verdict)).toBe(c.valide);
  });
});
