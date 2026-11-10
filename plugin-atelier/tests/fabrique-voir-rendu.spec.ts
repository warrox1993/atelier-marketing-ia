/**
 * Outil `voir_rendu` (lot 3 de la qualité des visuels) : le relecteur désigné de la tâche voit le rendu d'une image ou
 * d'une vidéo fabriquée. Entrée fermée (l'identifiant du travail seulement), liste blanche de deux noms, fichier
 * régulier, PNG, 8 Mio au plus, empreinte égale à celle de resultat.json, copie dans le dossier propre à l'agent.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerOutilsFabrique, type DependancesFabrique } from "../src/serveur/fabrique-outils.js";
import { DECLARATION_VOIR_RENDU } from "../src/contrats/fabrique-outils-schemas.js";
import manifest from "../src/manifest.js";

const ENTREPRISE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENTREPRISE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RELECTEUR = "11111111-1111-4111-8111-111111111111";
const AUTRE_AGENT = "22222222-2222-4222-8222-222222222222";
const PRODUCTEUR = "77777777-7777-4777-8777-777777777777";
const RUN = "55555555-5555-4555-8555-555555555555";
const TACHE = "33333333-3333-4333-8333-333333333333";
const T = "44444444-4444-4444-8444-444444444444";
const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const empreinte = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("voir_rendu", () => {
  let racine: string;
  let rendus: string;
  let config: Record<string, unknown>;
  let rendusProducteur: string;
  let relecteurs: string[];
  let inconnus: string[];
  let appelsPorte: Array<[string, string]>;
  const png = Buffer.concat([SIGNATURE_PNG, Buffer.from("contenu de l'image")]);

  const fabrique = () => {
    const deps: DependancesFabrique = {
      agentConnu: async (agent) => !inconnus.includes(agent),
      config: async () => config,
      etatLire: async () => null,
      etatEcrire: async () => undefined,
      relecteursDeTache: async (tache, entreprise) => {
        appelsPorte.push([tache, entreprise]);
        return relecteurs;
      },
    };
    return creerOutilsFabrique(deps);
  };
  const run = (companyId = ENTREPRISE_A, agentId = RELECTEUR) => ({ agentId, runId: RUN, companyId });
  const dossierTravail = (entreprise = ENTREPRISE_A) => join(racine, "livrables", entreprise, T);
  const poser = (nom: string, contenu: Buffer | string, entreprise = ENTREPRISE_A) => {
    mkdirSync(dossierTravail(entreprise), { recursive: true });
    writeFileSync(join(dossierTravail(entreprise), nom), contenu);
  };
  const livrer = (revue: unknown, etat: Record<string, unknown> = { etat: "termine", tache: TACHE }) => {
    poser("etat.json", JSON.stringify(etat));
    poser("resultat.json", JSON.stringify({ fichiers: ["image.png"], ...(revue === undefined ? {} : { revue }) }));
  };
  const livrerImage = (contenu = png) => {
    poser("image.png", contenu);
    livrer({ fichier: "image.png", sha256: empreinte(contenu) });
  };

  beforeEach(() => {
    racine = mkdtempSync(join(tmpdir(), "voir-rendu-"));
    rendus = join(racine, "claude-config", "rendus");
    mkdirSync(join(racine, "claude-config"));
    mkdirSync(rendus);
    rendusProducteur = join(racine, "claude-config", "rendus-producteur");
    mkdirSync(rendusProducteur);
    config = {
      fabriqueDossierFile: racine,
      fabriqueDossiersRendus: { [RELECTEUR]: rendus, [PRODUCTEUR]: rendusProducteur },
      fabriqueAgentsImage: [PRODUCTEUR],
      fabriqueAgentsVideo: [PRODUCTEUR],
    };
    relecteurs = [RELECTEUR];
    inconnus = [];
    appelsPorte = [];
  });
  afterEach(() => rmSync(racine, { recursive: true, force: true }));

  it("copie le rendu dans le dossier de l'agent et rend le chemin à ouvrir avec Read", async () => {
    livrerImage();
    const r = await fabrique().voirRendu({ travail: T }, run());
    expect(r.error).toBeUndefined();
    const chemin = (r.data as { chemin: string }).chemin;
    expect(chemin).toBe(join(rendus, `${T}.png`));
    expect(readFileSync(chemin)).toEqual(png);
    expect((r.data as { sha256: string }).sha256).toBe(empreinte(png));
    expect(appelsPorte).toEqual([[TACHE, ENTREPRISE_A]]);
    expect(readdirSync(rendus)).toEqual([`${T}.png`]);
  });
  it("accepte planche.png pour une vidéo", async () => {
    poser("planche.png", png);
    livrer({ fichier: "planche.png", sha256: empreinte(png) });
    expect((await fabrique().voirRendu({ travail: T }, run())).error).toBeUndefined();
  });
  it("entrée fermée : identifiant UUID seulement, aucun chemin ni champ en plus", async () => {
    livrerImage();
    for (const mauvais of ["../x", "", 5, undefined]) expect((await fabrique().voirRendu({ travail: mauvais }, run())).error).toContain("UUID");
    expect((await fabrique().voirRendu({ travail: T, fichier: "image.png" }, run())).error).toContain("Demande refusée");
    expect((await fabrique().voirRendu({ travail: T, chemin: "/etc/passwd" }, run())).error).toContain("Demande refusée");
    expect(readdirSync(rendus)).toEqual([]);
  });
  it("refuse un agent qui n'est pas relecteur désigné de la tâche du travail", async () => {
    livrerImage();
    relecteurs = [AUTRE_AGENT];
    const r = await fabrique().voirRendu({ travail: T }, run());
    expect(r.error).toContain("Refusé");
    expect(r.data).toBeUndefined();
    expect(readdirSync(rendus)).toEqual([]);
  });
  it("refuse un travail sans tâche, ou une tâche sans porte", async () => {
    livrer({ fichier: "image.png", sha256: empreinte(png) }, { etat: "termine" });
    poser("image.png", png);
    expect((await fabrique().voirRendu({ travail: T }, run())).error).toContain("Refusé");
    livrer({ fichier: "image.png", sha256: empreinte(png) });
    relecteurs = [];
    expect((await fabrique().voirRendu({ travail: T }, run())).error).toContain("Refusé");
  });
  it("refuse sans dépendance de lecture des relecteurs (garde fermée)", async () => {
    livrerImage();
    const sans = creerOutilsFabrique({ agentConnu: async () => true, config: async () => config, etatLire: async () => null, etatEcrire: async () => undefined });
    expect((await sans.voirRendu({ travail: T }, run())).error).toContain("Refusé");
  });
  it("travail d'une autre entreprise : même message qu'un travail inexistant", async () => {
    livrerImage();
    const autre = await fabrique().voirRendu({ travail: T }, run(ENTREPRISE_B));
    const inexistant = await fabrique().voirRendu({ travail: "66666666-6666-4666-8666-666666666666" }, run(ENTREPRISE_A));
    expect(autre.error).toBe("Travail introuvable.");
    expect(inexistant.error).toBe(autre.error);
    expect(readdirSync(rendus)).toEqual([]);
  });
  it("refuse si revue est absente, mal formée ou nomme un fichier hors liste", async () => {
    poser("image.png", png);
    poser("secret.png", png);
    const bonne = empreinte(png);
    for (const revue of [undefined, null, "image.png", {}, { fichier: "image.png" }, { fichier: "secret.png", sha256: bonne }, { fichier: "../image.png", sha256: bonne },
      { fichier: "image.png", sha256: "abc" }, { fichier: "image.png", sha256: bonne.toUpperCase() }, { fichier: "image.png", sha256: bonne, extra: 1 }]) {
      livrer(revue);
      expect((await fabrique().voirRendu({ travail: T }, run())).error, JSON.stringify(revue)).toBeDefined();
    }
    expect(readdirSync(rendus)).toEqual([]);
  });
  it("refuse une empreinte différente de celle de resultat.json", async () => {
    poser("image.png", png);
    livrer({ fichier: "image.png", sha256: "0".repeat(64) });
    expect((await fabrique().voirRendu({ travail: T }, run())).error).toContain("empreinte");
    expect(readdirSync(rendus)).toEqual([]);
  });
  it("refuse un fichier qui n'est pas un PNG par sa signature", async () => {
    const faux = Buffer.from("<html>pas un png</html>");
    livrerImage(faux);
    expect((await fabrique().voirRendu({ travail: T }, run())).error).toContain("PNG");
  });
  it("refuse un fichier de plus de 8 Mio", async () => {
    livrerImage(Buffer.concat([SIGNATURE_PNG, Buffer.alloc(8 * 1024 * 1024)]));
    expect((await fabrique().voirRendu({ travail: T }, run())).error).toContain("illisible");
  });
  it("refuse un lien symbolique, même vers un PNG valide", async () => {
    const cible = join(racine, "ailleurs.png");
    writeFileSync(cible, png);
    mkdirSync(dossierTravail(), { recursive: true });
    symlinkSync(cible, join(dossierTravail(), "image.png"));
    livrer({ fichier: "image.png", sha256: empreinte(png) });
    expect((await fabrique().voirRendu({ travail: T }, run())).error).toContain("illisible");
    expect(readdirSync(rendus)).toEqual([]);
  });
  it("refuse si le dossier de rendus de l'agent n'est pas configuré, relatif, absent ou lien symbolique", async () => {
    livrerImage();
    const cas: unknown[] = [undefined, {}, { [RELECTEUR]: "rendus" }, { [RELECTEUR]: join(racine, "absent", "rendus") }, { [RELECTEUR]: 5 }];
    for (const c of cas) {
      config = { fabriqueDossierFile: racine, ...(c === undefined ? {} : { fabriqueDossiersRendus: c }) };
      expect((await fabrique().voirRendu({ travail: T }, run())).error, JSON.stringify(c)).toContain("rendus");
    }
    const lien = join(racine, "lien");
    symlinkSync(rendus, lien);
    config = { fabriqueDossierFile: racine, fabriqueDossiersRendus: { [RELECTEUR]: lien } };
    expect((await fabrique().voirRendu({ travail: T }, run())).error).toContain("rendus");
  });
  it("un second appel remplace la copie sans laisser de fichier temporaire", async () => {
    livrerImage();
    await fabrique().voirRendu({ travail: T }, run());
    await fabrique().voirRendu({ travail: T }, run());
    expect(readdirSync(rendus)).toEqual([`${T}.png`]);
    expect(statSync(join(rendus, `${T}.png`)).isFile()).toBe(true);
  });
  it("le dossier de rendus est créé s'il manque seul (son parent existe)", async () => {
    rmSync(rendus, { recursive: true });
    livrerImage();
    expect(existsSync(rendus)).toBe(false);
    expect((await fabrique().voirRendu({ travail: T }, run())).error).toBeUndefined();
    expect(readdirSync(rendus)).toEqual([`${T}.png`]);
  });
  describe("auteur du travail (image ou vidéo)", () => {
    const etatAuteur = (extra: Record<string, unknown> = {}) => ({ etat: "termine", tache: TACHE, type: "image", agent: PRODUCTEUR, ...extra });
    const livrerPour = (etat: Record<string, unknown>) => {
      poser("image.png", png);
      livrer({ fichier: "image.png", sha256: empreinte(png) }, etat);
    };
    const refuse = async (agent = PRODUCTEUR, entreprise = ENTREPRISE_A) => {
      const r = await fabrique().voirRendu({ travail: T }, run(entreprise, agent));
      expect(r.error).toContain("Refusé");
      expect(r.data).toBeUndefined();
      expect(readdirSync(rendusProducteur)).toEqual([]);
      expect(readdirSync(rendus)).toEqual([]);
    };

    it("l'auteur d'une image la voit sans être relecteur : copie dans son dossier de rendus", async () => {
      livrerPour(etatAuteur());
      const r = await fabrique().voirRendu({ travail: T }, run(ENTREPRISE_A, PRODUCTEUR));
      expect(r.error).toBeUndefined();
      expect((r.data as { chemin: string }).chemin).toBe(join(rendusProducteur, `${T}.png`));
      expect(readFileSync(join(rendusProducteur, `${T}.png`))).toEqual(png);
      expect(readdirSync(rendus)).toEqual([]);
    });
    it("l'auteur d'une vidéo voit sa planche", async () => {
      poser("planche.png", png);
      livrer({ fichier: "planche.png", sha256: empreinte(png) }, etatAuteur({ type: "video" }));
      const r = await fabrique().voirRendu({ travail: T }, run(ENTREPRISE_A, PRODUCTEUR));
      expect(r.error).toBeUndefined();
      expect(readdirSync(rendusProducteur)).toEqual([`${T}.png`]);
    });
    it("refuse l'auteur quand etat.json ne nomme pas d'agent (travail d'avant le déploiement)", async () => {
      livrerPour({ etat: "termine", tache: TACHE, type: "image" });
      await refuse();
    });
    it("refuse un autre producteur retenu qui n'est pas l'auteur du travail", async () => {
      config = { ...config, fabriqueAgentsImage: [PRODUCTEUR, AUTRE_AGENT] };
      livrerPour(etatAuteur());
      await refuse(AUTRE_AGENT);
    });
    it("refuse l'auteur d'un document : le droit de l'auteur ne vaut que pour une image ou une vidéo", async () => {
      livrerPour(etatAuteur({ type: "document" }));
      await refuse();
    });
    it("refuse l'auteur absent de fabriqueAgentsImage (rôle non retenu), même avec un dossier de rendus", async () => {
      config = { ...config, fabriqueAgentsImage: [], fabriqueAgentsVideo: [] };
      livrerPour(etatAuteur());
      await refuse();
    });
    it("refuse l'auteur que agentConnu ne connaît pas dans l'entreprise", async () => {
      inconnus = [PRODUCTEUR];
      livrerPour(etatAuteur());
      await refuse();
    });
    it("travail d'une autre entreprise : l'auteur reçoit le même message qu'un travail inexistant", async () => {
      livrerPour(etatAuteur());
      const autre = await fabrique().voirRendu({ travail: T }, run(ENTREPRISE_B, PRODUCTEUR));
      const inexistant = await fabrique().voirRendu({ travail: "66666666-6666-4666-8666-666666666666" }, run(ENTREPRISE_A, PRODUCTEUR));
      expect(autre.error).toBe("Travail introuvable.");
      expect(inexistant.error).toBe(autre.error);
      expect(readdirSync(rendusProducteur)).toEqual([]);
    });
  });
  it("outil déclaré au manifeste avec un schéma fermé", () => {
    expect((manifest.tools ?? []).map((o) => o.name)).toContain("voir_rendu");
    expect(DECLARATION_VOIR_RENDU.parametersSchema).toMatchObject({ additionalProperties: false, required: ["travail"] });
    expect(Object.keys((DECLARATION_VOIR_RENDU.parametersSchema as { properties: object }).properties)).toEqual(["travail"]);
  });
});
