/** Revue du 25/10 (M1) : la provenance de la fabrique est contrôlée sur les travaux enregistrés, déclarés, cités dans le livrable ET dans les arguments. */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { DIGITAL_SOURCE_TYPE_IA, travauxFabriqueCites } from "../src/serveur/fabrique-provenance.js";
import { creerServices } from "../src/serveur/services.js";
import { empreinteAppel } from "../src/serveur/signatures.js";
import { ISSUE, PRODUCTEUR, REV1, SOC, creerBanc } from "./outils-base.js";
import { paireEd25519 } from "./outils-passerelle.js";

const PLUGIN = paireEd25519();
const GW = paireEd25519();
const TRAVAIL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const AUTRE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OCTETS = Buffer.from("contenu de video de test");
const CORPS = "# Publication LinkedIn\n\nNouveau chantier à Seraing : toiture terminée en 3 jours.\n";
const PORTEE = { revisionId: REV1, action: "publier" as const, canal: "linkedin", compte: "urn:li:organization:42", audience: null, montantMaxCents: null, dureeJours: 30 };
const ARGS = { commentary: "Nouveau chantier à Seraing : toiture terminée en 3 jours." };
const humain: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const producteur: ActeurHote = { type: "agent", id: PRODUCTEUR, agentId: PRODUCTEUR, userId: null, runId: "run-1" };

let racine: string;
beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), "rejeu-"));
  mkdirSync(join(racine, "voix-autorisees"));
  ecrireRegistre(true);
});
afterEach(() => rmSync(racine, { recursive: true, force: true }));

const ecrireRegistre = (avecVoix: boolean) =>
  writeFileSync(join(racine, "voix-autorisees", "registre.json"), JSON.stringify({ voix: avecVoix ? [{ id: "synthese-chatterbox-fr", moteur: "chatterbox", type: "synthese", entreprises: ["*"], expire_le: "2030-12-31" }] : [] }));

/** Travail terminé de la fabrique, avec ou sans provenance complète. */
function livrer(travail: string, avecProvenance = true) {
  const dossier = join(racine, "livrables", SOC, travail);
  mkdirSync(dossier, { recursive: true });
  const sha = createHash("sha256").update(OCTETS).digest("hex");
  writeFileSync(join(dossier, "etat.json"), JSON.stringify({ travail, etat: "termine" }));
  writeFileSync(join(dossier, "video.mp4"), OCTETS);
  writeFileSync(join(dossier, "resultat.json"), JSON.stringify({ fichiers: [{ fichier: "video.mp4", taille: OCTETS.length, sha256: sha }] }));
  if (avecProvenance) {
    writeFileSync(join(dossier, "provenance.json"), JSON.stringify({
      travail, entreprise: SOC, type: "video", fichier: "video.mp4", outils: { ffmpeg: "7" }, voix: ["synthese-chatterbox-fr"], musique: null,
      digital_source_type: DIGITAL_SOURCE_TYPE_IA, filigrane_perth: { detecte: true, taux: 1 }, sha256: sha,
    }));
  }
}

function banc() {
  const appel = { id: "aaaaaaaa-0000-4000-8000-000000000001", service: "linkedin", outil: "linkedin_publier", compte: "urn:li:organization:42", empreinte: empreinteAppel({ service: "linkedin", outil: "linkedin_publier", compte: "urn:li:organization:42", arguments: ARGS }) };
  const b = creerBanc({
    mode: "reel", modeEntreprise: "reel", secret: PLUGIN.priveePem,
    config: { approbationClePrivee: { type: "secret_ref", secretId: "11111111-2222-4333-8444-555555555555" }, passerelleClesPubliques: [GW.publiqueBase64], fabriqueDossierFile: racine },
  });
  b.tacheSousPorte({ status: "done", etape: null, corps: CORPS });
  b.passe();
  b.decision({ portee: { ...PORTEE, appel }, mode: "reel" });
  return { ...b, services: creerServices(b.ctx, { base: b.base }) };
}
const demande = (o: Record<string, unknown> = {}) => ({
  revisionId: REV1, action: "publier", canal: "linkedin", compte: "urn:li:organization:42", cleIdempotence: "linkedin-publication-1",
  service: "linkedin", outil: "linkedin_publier", arguments: ARGS, ...o,
});
const appeler = (b: ReturnType<typeof banc>, corps: unknown) =>
  b.services.routes["tache.diffusions"]!({ cle: "tache.diffusions", params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: producteur, corps });
void humain;

describe("M1 : provenance de la fabrique à la diffusion et au rejeu", () => {
  it("rejeu sans travauxFabrique après retrait de la voix : aucune preuve n'est signée", async () => {
    livrer(TRAVAIL);
    const b = banc();
    const premiere = await appeler(b, demande({ travauxFabrique: [TRAVAIL] }));
    expect((premiere.corps as { preuveApprobation: string | null }).preuveApprobation).toEqual(expect.any(String));
    ecrireRegistre(false);
    const rejeu = await appeler(b, demande());
    expect(rejeu.statut).toBe(200);
    expect(rejeu.corps).toMatchObject({ preuveApprobation: null });
    expect(String((rejeu.corps as { motifRefus: string }).motifRefus)).toMatch(/^Préparée seulement : /u);
  });

  it("un travail cité seulement dans les arguments est contrôlé", async () => {
    livrer(AUTRE, false);
    const b = banc();
    const r = await appeler(b, demande({ cleIdempotence: "linkedin-publication-2", arguments: { ...ARGS, media: `https://exemple.be/livrables/${AUTRE}` } }));
    expect(r.statut).toBe(403);
    expect(String((r.corps as { motifRefus: string }).motifRefus)).toMatch(/Provenance IA absente/u);
  });

  it("une ancienne diffusion sans le champ se rejoue normalement si la provenance est bonne", async () => {
    livrer(TRAVAIL);
    const b = banc();
    const premiere = await appeler(b, demande({ travauxFabrique: [TRAVAIL] }));
    delete b.t.diffusions[0]!.travauxFabrique;
    const rejeu = await appeler(b, demande({ travauxFabrique: [TRAVAIL] }));
    expect(rejeu.statut).toBe(200);
    expect((rejeu.corps as { preuveApprobation: string }).preuveApprobation).toBe((premiere.corps as { preuveApprobation: string }).preuveApprobation);
  });

  it("travauxFabriqueCites trouve aussi les travaux des arguments, normalisés et triés", () => {
    expect(travauxFabriqueCites("", [AUTRE.toUpperCase()], { m: [`/livrables/${TRAVAIL}`, `/livrables/${AUTRE}`] })).toEqual([TRAVAIL, AUTRE]);
  });
});
