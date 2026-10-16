/**
 * Import d'une page web publique dans les connaissances (humain seulement).
 *
 * `connaissances.importer-url` lit la page par la lecture d'URL protégée du plugin (`lireUrl` : schéma,
 * port et hôte revalidés à chaque saut, résolution DNS contrôlée à la connexion, taille et délai
 * bornés, redirections bornées). Le transport est toujours le transport RÉEL en lecture seule, même
 * en mode démonstration (le transport de démonstration ne renvoie que des données fictives). La page
 * est convertie en Markdown (`htmlVersMarkdown`) puis importée par la route `connaissances.importer`
 * elle-même : mêmes contrôles (santé, pseudonymisation, injections, version, indexation), avec la
 * source et la date de lecture en tête du document.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { IdNatif, LangueConnaissance, LIMITES_CONNAISSANCES, TypeDocumentConnaissance, type CleRouteApi } from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import { dateDuJourBruxelles } from "./connaissances/recherche.js";
import { erreur, erreurValidation } from "./erreurs.js";
import { htmlVersMarkdown } from "./html-markdown.js";
import { lireUrl, type TransportHttp } from "./lecture-url.js";

export interface DependancesImportUrl {
  /** Route `connaissances.importer` (résolue au moment de l'appel). */
  importer(): GestionnaireRoute | undefined;
  /** Transport RÉEL (lecture seule). */
  transport: TransportHttp;
  maintenant?: () => Date;
}

const ImporterUrlEntree = z
  .object({
    companyId: IdNatif,
    url: z.string().trim().min(1).max(2048),
    titre: z.string().trim().min(1).max(LIMITES_CONNAISSANCES.titreMax),
    type: TypeDocumentConnaissance,
    produit: z.string().trim().min(1).max(120).nullable().optional(),
    langue: LangueConnaissance,
  })
  .strict();

const exigerHumain = (acteur: ActeurHote, quoi: string) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", `${quoi} est réservé à un humain.`);
};

/** Nom de fichier sans chemin déduit de l'hôte de la page. */
function nomFichier(url: string): string {
  let hote = "page";
  try {
    hote = new URL(url).hostname;
  } catch {
    /* l'adresse a déjà été validée par lireUrl */
  }
  return `${hote.replace(/[^a-z0-9.-]/giu, "-").slice(0, 120) || "page"}.md`;
}

export function routesImportUrl(d: DependancesImportUrl): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  routes["connaissances.importer-url"] = async (r) => {
    exigerHumain(r.acteur, "L'import d'une page web");
    const brut = r.corps as { companyId?: unknown } | null;
    if (typeof brut?.companyId === "string" && brut.companyId.toLowerCase() !== r.companyId.toLowerCase()) {
      erreur("hors_entreprise", "Le corps désigne une autre entreprise que celle de la route.");
    }
    const p = ImporterUrlEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Import d'une page web", p.error.issues);
    const e = p.data;
    const importer = d.importer();
    if (!importer) erreur("erreur_interne", "Import de connaissances indisponible.");

    const lecture = await lireUrl(e.url, d.transport, { pourLecture: true });
    if (lecture.statut === "bloquee_ssrf") erreur("url_refusee", lecture.message || "Adresse refusée : seules les pages publiques sont lisibles.");
    if (lecture.statut !== "accessible" || lecture.corps === null) {
      erreur("import_refuse", `Page non importable : ${lecture.message || "lecture impossible"}`);
    }
    const html = /html|xml/iu.test(lecture.typeContenu ?? "") || /<html|<body|<title/iu.test(lecture.corps.slice(0, 2000));
    const LIMITE_CONVERSION = 512 * 1024;
    const tropLong = lecture.corps.length > LIMITE_CONVERSION;
    const source = tropLong ? lecture.corps.slice(0, LIMITE_CONVERSION) : lecture.corps;
    const converti = html ? htmlVersMarkdown(source) : source.trim();
    const texte = tropLong ? `${converti}\n\n[page tronquée à 512 Ko]` : converti;
    if (texte.length < 40) erreur("import_refuse", "La page ne contient pas assez de texte exploitable (page vide, ou contenu chargé par script).");

    const aujourdhui = dateDuJourBruxelles(d.maintenant ? d.maintenant() : new Date());
    const adresse = lecture.urlFinale ?? e.url;
    const markdown = [
      `Source : ${adresse}`,
      `Date de lecture : ${aujourdhui}`,
      ...(lecture.tronque ? ["Attention : la page était trop longue, seul le début a été lu."] : []),
      "",
      texte,
      "",
    ].join("\n");
    const octets = Buffer.from(markdown, "utf8");

    const res = await importer({
      cle: "connaissances.importer", params: {}, query: {}, acteur: r.acteur, companyId: r.companyId,
      corps: {
        companyId: r.companyId, nomFichier: nomFichier(adresse), format: "markdown", contenuBase64: octets.toString("base64"), titre: e.titre, type: e.type,
        produit: e.produit ?? null, langue: e.langue, dateDocument: aujourdhui, valideDu: aujourdhui, valideAu: null,
      },
    });
    return {
      statut: res.statut ?? 201,
      corps: {
        ...(res.corps as Record<string, unknown>),
        source: { url: e.url, urlFinale: adresse, titrePage: lecture.titre, tronque: lecture.tronque, caracteres: texte.length, empreinte: createHash("sha256").update(octets).digest("hex") },
      },
    };
  };

  return routes;
}
