/**
 * Import d'une page web publique : conversion HTML vers Markdown, anti-SSRF, humain seulement, et
 * passage par la route `connaissances.importer` (le corps transmis respecte son schéma strict).
 */
import { describe, expect, it } from "vitest";
import { ROUTES_API, ImporterConnaissanceEntree } from "../src/contrats/index.js";
import type { ActeurHote, GestionnaireRoute, RequeteRoute } from "../src/serveur/atelier.js";
import { ErreurAtelier } from "../src/serveur/erreurs.js";
import { htmlVersMarkdown } from "../src/serveur/html-markdown.js";
import type { ReponseBrute, TransportHttp } from "../src/serveur/lecture-url.js";
import { routesImportUrl } from "../src/serveur/services-import-url.js";
import { SOC } from "./outils-base.js";

const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const AGENT: ActeurHote = { type: "agent", id: "a1", agentId: "a1", userId: null, runId: "run-1" };
const MAINTENANT = new Date("2026-10-16T09:00:00.000Z");

const PAGE = `<!doctype html><html lang="fr"><head><title>Assurance auto : nos formules</title>
<style>body{color:red}</style><script>window.secret = "ne pas importer";</script></head>
<body><nav><ul><li><a href="/">Menu principal</a></li><li>Contact nav</li></ul></nav>
<!-- commentaire a ignorer -->
<main><h1>Assurance auto</h1>
<p>Roulez l&apos;esprit tranquille avec nos formules &eacute;volutives.</p>
<h2>Les formules</h2>
<ul><li>RC seule</li><li>Mini-Omnium <strong>conseill&eacute;e</strong></li><li>Omnium compl&egrave;te</li></ul>
<p>Premi&egrave;re ligne<br>Seconde ligne &amp; fin &#233;&#x41;</p>
<script>alert("injection")</script>
<table><tr><th>Formule</th><th>Prix</th></tr><tr><td>RC</td><td>20 &euro;</td></tr></table>
</main><footer><p>Mentions legales footer</p></footer></body></html>`;

describe("htmlVersMarkdown", () => {
  const md = htmlVersMarkdown(PAGE);

  it("garde les titres en Markdown, les listes et le texte", () => {
    expect(md).toContain("# Assurance auto");
    expect(md).toContain("## Les formules");
    expect(md).toContain("- RC seule");
    expect(md).toContain("- Mini-Omnium conseillée");
    expect(md).toContain("Roulez l'esprit tranquille avec nos formules évolutives.");
    expect(md).toContain("Première ligne\nSeconde ligne & fin éA");
    expect(md).toContain("RC | 20 €");
  });

  it("retire script, style, navigation, pied de page, commentaires et balises", () => {
    for (const interdit of ["secret", "alert", "color:red", "Menu principal", "Contact nav", "Mentions legales", "commentaire", "<", ">"]) {
      expect(md, interdit).not.toContain(interdit);
    }
    expect(md).not.toContain("Assurance auto : nos formules");
  });

  it("sans bloc main, convertit toute la page ; titres vides ignorés", () => {
    const sans = htmlVersMarkdown("<body><nav>Menu</nav><h1>  </h1><h2>Bonjour</h2><p>Un texte de la page</p></body>");
    expect(sans).toBe("## Bonjour\n\nUn texte de la page");
  });

  it("ne bloque pas sur une page piégée (balises jamais refermées, milliers de chevrons)", () => {
    const debut = Date.now();
    const piege = `<nav>`.repeat(50_000) + "<a".repeat(100_000) + "<h1>Titre</h1>" + "<script>".repeat(20_000) + "Fin du texte de la page web";
    const res = htmlVersMarkdown(piege);
    expect(Date.now() - debut).toBeLessThan(3000);
    expect(res).toContain("Titre");
  });
});

function banc(o: { reponse?: Partial<ReponseBrute>; transportAppels?: string[] } = {}) {
  const appels: string[] = o.transportAppels ?? [];
  const transport: TransportHttp = {
    nom: "reseau",
    async obtenir(url) {
      appels.push(url.toString());
      return { statut: 200, location: null, typeContenu: "text/html; charset=utf-8", corps: PAGE, tronque: false, ...o.reponse };
    },
  };
  const importes: RequeteRoute[] = [];
  const importer: GestionnaireRoute = async (r) => {
    importes.push(r);
    return { statut: 201, corps: { document: { id: "d1", titre: "x" }, version: { version: 1 } } };
  };
  const routes = routesImportUrl({ importer: () => importer, transport, maintenant: () => MAINTENANT });
  const appeler = (corps: unknown, acteur: ActeurHote = HUMAIN, companyId = SOC) =>
    routes["connaissances.importer-url"]!({ cle: "connaissances.importer-url", params: {}, query: {}, corps, acteur, companyId });
  const refus = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as ErreurAtelier | null;
  return { appeler, refus, importes, appels };
}

const demande = (o: Record<string, unknown> = {}) => ({ companyId: SOC, url: "https://www.exemple-courtier.be/assurance-auto", titre: "Page assurance auto", type: "fiche_produit", langue: "fr", ...o });

describe("connaissances.importer-url", () => {
  it("est déclarée en POST /connaissances/page-web, réservée à l'humain (auth board)", () => {
    expect(ROUTES_API.find((r) => r.cle === "connaissances.importer-url")).toMatchObject({ methode: "POST", chemin: "/connaissances/page-web", auth: "board" });
  });

  it("lit la page, la convertit en Markdown et l'importe par connaissances.importer avec la source et la date en tête", async () => {
    const b = banc();
    const res = await b.appeler(demande({ produit: "Auto" }));
    expect(res.statut).toBe(201);
    expect(b.appels).toEqual(["https://www.exemple-courtier.be/assurance-auto"]);
    expect(b.importes).toHaveLength(1);
    const envoi = b.importes[0]!;
    expect(envoi.cle).toBe("connaissances.importer");
    expect(envoi.acteur).toBe(HUMAIN);
    const corps = envoi.corps as Record<string, unknown>;
    // Le corps respecte le schéma strict de la route d'import ordinaire.
    const valide = ImporterConnaissanceEntree.parse(corps);
    expect(valide).toMatchObject({ format: "markdown", titre: "Page assurance auto", type: "fiche_produit", produit: "Auto", langue: "fr", dateDocument: "2026-10-16", valideDu: "2026-10-16", valideAu: null });
    expect(valide.nomFichier).toBe("www.exemple-courtier.be.md");
    const texte = Buffer.from(valide.contenuBase64, "base64").toString("utf8");
    expect(texte.startsWith("Source : https://www.exemple-courtier.be/assurance-auto\nDate de lecture : 2026-10-16\n\n")).toBe(true);
    expect(texte).toContain("# Assurance auto");
    expect(texte).toContain("- Omnium complète");
    for (const interdit of ["<script", "alert", "Menu principal", "Mentions legales"]) expect(texte).not.toContain(interdit);
    expect(res.corps).toMatchObject({ document: { id: "d1" }, source: { url: "https://www.exemple-courtier.be/assurance-auto", tronque: false } });
  });

  it("importe aussi un texte brut tel quel (text/plain)", async () => {
    const b = banc({ reponse: { typeContenu: "text/plain", corps: "Conditions generales de la formule RC : le texte complet de la page." } });
    await b.appeler(demande());
    const texte = Buffer.from((b.importes[0]!.corps as { contenuBase64: string }).contenuBase64, "base64").toString("utf8");
    expect(texte).toContain("Conditions generales de la formule RC");
    expect(texte).not.toContain("# ");
  });

  it("refuse les adresses privées sans jamais joindre le transport (anti-SSRF)", async () => {
    const b = banc();
    for (const url of ["http://127.0.0.1/admin", "http://localhost:3100/api", "http://192.168.1.10/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "file:///etc/passwd", "ftp://exemple.be/x"]) {
      const e = await b.refus(b.appeler(demande({ url })));
      expect(e, url).toBeInstanceOf(ErreurAtelier);
      expect(e?.code, url).toBe("url_refusee");
      expect(e?.statut, url).toBe(422);
    }
    expect(b.appels).toEqual([]);
    expect(b.importes).toEqual([]);
  });

  it("revalide chaque redirection : un saut vers une adresse privée est refusé", async () => {
    const b = banc({ reponse: { statut: 302, location: "http://10.0.0.5/interne", corps: "" } });
    const e = await b.refus(b.appeler(demande()));
    expect(e?.code).toBe("url_refusee");
    expect(b.appels).toEqual(["https://www.exemple-courtier.be/assurance-auto"]);
    expect(b.importes).toEqual([]);
  });

  it("refuse un agent (403 elevation_refusee) sans lire la page", async () => {
    const b = banc();
    const e = await b.refus(b.appeler(demande(), AGENT));
    expect(e?.statut).toBe(403);
    expect(e?.code).toBe("elevation_refusee");
    expect(b.appels).toEqual([]);
    expect(b.importes).toEqual([]);
  });

  it("refuse une page absente, vide ou d'un type illisible, et une entrée invalide", async () => {
    const absente = banc({ reponse: { statut: 404, corps: "Introuvable" } });
    expect((await absente.refus(absente.appeler(demande())))?.code).toBe("import_refuse");
    const vide = banc({ reponse: { corps: `<html><body><script>var a=1</script><nav>${"Menu de navigation du site ".repeat(6)}</nav><p>Court</p></body></html>` } });
    const eVide = await vide.refus(vide.appeler(demande()));
    expect(eVide?.code).toBe("import_refuse");
    expect(eVide?.message).toContain("pas assez de texte");
    const image = banc({ reponse: { typeContenu: "image/png", corps: "PNG" } });
    expect((await image.refus(image.appeler(demande())))?.code).toBe("import_refuse");
    const b = banc();
    expect((await b.refus(b.appeler(demande({ type: "inconnu" }))))?.statut).toBe(400);
    expect((await b.refus(b.appeler(demande({ force: true }))))?.statut).toBe(400);
    expect((await b.refus(b.appeler(demande({ companyId: "22222222-2222-4222-8222-222222222222" }))))?.statut).toBe(404);
    expect(b.importes).toEqual([]);
  });

  it("signale une page tronquée en tête du document", async () => {
    const b = banc({ reponse: { tronque: true } });
    await b.appeler(demande());
    const texte = Buffer.from((b.importes[0]!.corps as { contenuBase64: string }).contenuBase64, "base64").toString("utf8");
    expect(texte).toContain("Attention : la page était trop longue");
  });

  it("borne la conversion à 512 Ko et le mentionne dans le document", async () => {
    const gros = `<html><body><main><h1>Titre</h1><p>${"mot ".repeat(300 * 1024)}</p></main></body></html>`;
    const b = banc({ reponse: { corps: gros } });
    await b.appeler(demande());
    const texte = Buffer.from((b.importes[0]!.corps as { contenuBase64: string }).contenuBase64, "base64").toString("utf8");
    expect(texte).toContain("[page tronquée à 512 Ko]");
    expect(texte.length).toBeLessThan(530 * 1024);
  });
});

describe("htmlVersMarkdown : pages piégées", () => {
  const MO = 1024 * 1024;
  it("balise au nom interminable traitée en moins de 500 ms", () => {
    const piege = "<a" + "b".repeat(MO);
    const t = performance.now();
    htmlVersMarkdown(piege);
    expect(performance.now() - t).toBeLessThan(500);
  });
  it("suite de chevrons ouvrants traitée en moins de 500 ms", () => {
    const piege = "<".repeat(MO) + ">x";
    const t = performance.now();
    htmlVersMarkdown(piege);
    expect(performance.now() - t).toBeLessThan(500);
  });
  it("une balise restée ouverte en fin de page est retirée", () => {
    expect(htmlVersMarkdown("<p>Un texte assez long pour la page</p> fin <a href=")).toContain("fin");
    expect(htmlVersMarkdown("<p>Texte</p> fin <a href=")).not.toContain("href");
  });
});
