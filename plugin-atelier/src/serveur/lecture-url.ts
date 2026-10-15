/**
 * Lecture d'URL et vérification de liens, protégées contre la SSRF.
 *
 * - Chaque saut (redirection comprise) est revalidé : schéma, port, hôte.
 * - Transport réel : la résolution DNS est contrôlée AU MOMENT DE LA
 *   CONNEXION (option `lookup` de node:http) : pas de fenêtre entre contrôle
 *   et connexion (rebinding DNS), et une seule adresse interdite suffit à
 *   refuser.
 * - Taille lue bornée, délai borné, nombre de redirections borné.
 * - Mode démonstration : transport de fixtures déterministe, jamais de réseau.
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { StatutAccesSource } from "../contrats/index.js";
import { LIMITES } from "../contrats/index.js";
import { indicesPageErreur, titreHtml } from "./contenu-externe.js";
import { adressesResoluesAutorisees, validerUrl } from "./ssrf.js";

export interface ReponseBrute {
  statut: number;
  location: string | null;
  typeContenu: string | null;
  corps: string;
  tronque: boolean;
}

export interface TransportHttp {
  readonly nom: "reseau" | "demonstration";
  /** Un seul saut, sans suivre les redirections. */
  obtenir(url: URL, options: { delaiMs: number; tailleMax: number }): Promise<ReponseBrute>;
}

export class RefusSsrf extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefusSsrf";
  }
}

/** Résolution DNS contrôlée, utilisable comme option `lookup` de node:http. */
export function lookupControle(
  hote: string,
  options: { all?: boolean; family?: number } | number | undefined,
  rappel: (err: NodeJS.ErrnoException | null, adresse?: string | LookupAddress[], famille?: number) => void,
): void {
  const toutes = typeof options === "object" && options?.all === true;
  dnsLookup(hote, { all: true }, (err, adresses) => {
    if (err) return rappel(err);
    const verdict = adressesResoluesAutorisees(adresses);
    if (!verdict.ok) {
      const refus = new RefusSsrf(`Résolution de ${hote} refusée : adresse interdite (${verdict.interdites.join(", ") || "aucune adresse"}).`) as NodeJS.ErrnoException;
      refus.code = "ATELIER_SSRF";
      return rappel(refus);
    }
    if (toutes) return rappel(null, adresses);
    const premiere = adresses[0]!;
    return rappel(null, premiere.address, premiere.family);
  });
}

/** Transport réseau réel (mode réel). */
export const transportReseau: TransportHttp = {
  nom: "reseau",
  obtenir(url, { delaiMs, tailleMax }) {
    return new Promise<ReponseBrute>((resolve, reject) => {
      const module = url.protocol === "https:" ? https : http;
      const requete = module.request(
        url,
        {
          method: "GET",
          lookup: lookupControle as unknown as http.RequestOptions["lookup"],
          headers: {
            "user-agent": "AtelierMarketingIA/0.1 (verification de liens; local)",
            accept: "text/html,application/xhtml+xml,text/plain,text/markdown,text/csv,application/json;q=0.8,*/*;q=0.1",
          },
          timeout: delaiMs,
        },
        (reponse) => {
          const morceaux: Buffer[] = [];
          let taille = 0;
          let tronque = false;
          reponse.on("data", (morceau: Buffer) => {
            if (tronque) return;
            taille += morceau.length;
            if (taille > tailleMax) {
              tronque = true;
              morceaux.push(morceau.subarray(0, Math.max(0, morceau.length - (taille - tailleMax))));
              reponse.destroy();
              return;
            }
            morceaux.push(morceau);
          });
          const fin = () =>
            resolve({
              statut: reponse.statusCode ?? 0,
              location: typeof reponse.headers.location === "string" ? reponse.headers.location : null,
              typeContenu: typeof reponse.headers["content-type"] === "string" ? reponse.headers["content-type"] : null,
              corps: Buffer.concat(morceaux).toString("utf8"),
              tronque,
            });
          reponse.on("end", fin);
          reponse.on("close", fin);
          reponse.on("error", (err) => (tronque ? fin() : reject(err)));
        },
      );
      requete.on("timeout", () => requete.destroy(Object.assign(new Error("Délai dépassé"), { code: "ATELIER_DELAI" })));
      requete.on("error", reject);
      requete.end();
    });
  },
};

/** Transport de démonstration : réponses figées, aucune connexion réseau. */
export function transportFixtures(fixtures: ReadonlyMap<string, { statut: number; typeContenu?: string; corps?: string; location?: string }>): TransportHttp {
  return {
    nom: "demonstration",
    async obtenir(url, { tailleMax }) {
      const f = fixtures.get(url.toString()) ?? fixtures.get(url.toString().replace(/\/$/u, ""));
      if (!f) return { statut: 404, location: null, typeContenu: "text/html", corps: "<title>404</title>Introuvable (corpus de démonstration)", tronque: false };
      const corps = f.corps ?? "";
      return {
        statut: f.statut,
        location: f.location ?? null,
        typeContenu: f.typeContenu ?? "text/html; charset=utf-8",
        corps: corps.slice(0, tailleMax),
        tronque: corps.length > tailleMax,
      };
    },
  };
}

export interface ResultatLecture {
  urlDemandee: string;
  urlFinale: string | null;
  statut: StatutAccesSource;
  codeHttp: number | null;
  typeContenu: string | null;
  titre: string | null;
  corps: string | null;
  tronque: boolean;
  redirections: string[];
  indicesErreur: string[];
  message: string;
  transport: TransportHttp["nom"];
}

const TYPES_LISIBLES = /^(?:text\/(?:html|plain|markdown|csv|xml)|application\/(?:xhtml\+xml|json|xml))/iu;

export async function lireUrl(
  brute: string,
  transport: TransportHttp,
  options: { pourLecture: boolean; delaiMs?: number; tailleMax?: number; maxRedirections?: number } = { pourLecture: true },
): Promise<ResultatLecture> {
  const delaiMs = options.delaiMs ?? LIMITES.lectureUrlDelaiMs;
  const tailleMax = options.tailleMax ?? LIMITES.lectureUrlTailleMaxOctets;
  const maxRedirections = options.maxRedirections ?? LIMITES.lectureUrlRedirectionsMax;
  const redirections: string[] = [];
  const base = (partiel: Partial<ResultatLecture>): ResultatLecture => ({
    urlDemandee: brute,
    urlFinale: null,
    statut: "erreur",
    codeHttp: null,
    typeContenu: null,
    titre: null,
    corps: null,
    tronque: false,
    redirections,
    indicesErreur: [],
    message: "",
    transport: transport.nom,
    ...partiel,
  });

  let courante = brute;
  for (let saut = 0; saut <= maxRedirections; saut += 1) {
    const validation = validerUrl(courante);
    if (!validation.ok) return base({ statut: "bloquee_ssrf", message: validation.message, urlFinale: courante });
    let reponse: ReponseBrute;
    try {
      reponse = await transport.obtenir(validation.valeur.url, { delaiMs, tailleMax });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (err instanceof RefusSsrf || code === "ATELIER_SSRF") return base({ statut: "bloquee_ssrf", message: (err as Error).message, urlFinale: courante });
      if (code === "ATELIER_DELAI") return base({ statut: "delai_depasse", message: `Délai de ${delaiMs} ms dépassé.`, urlFinale: courante });
      return base({ statut: "inaccessible", message: `Connexion impossible (${code ?? "erreur réseau"}).`, urlFinale: courante });
    }
    if (reponse.statut >= 300 && reponse.statut < 400 && reponse.location) {
      let suivante: string;
      try {
        suivante = new URL(reponse.location, validation.valeur.url).toString();
      } catch {
        return base({ statut: "inaccessible", codeHttp: reponse.statut, message: "Redirection invalide.", urlFinale: courante });
      }
      redirections.push(suivante);
      courante = suivante;
      continue;
    }
    const indices = reponse.statut >= 200 && reponse.statut < 300 ? indicesPageErreur({ corps: reponse.corps, typeContenu: reponse.typeContenu, urlFinale: courante }) : [];
    const lisible = !reponse.typeContenu || TYPES_LISIBLES.test(reponse.typeContenu);
    let statut: StatutAccesSource;
    let message: string;
    if (reponse.statut >= 200 && reponse.statut < 300) {
      if (indices.length > 0) {
        statut = "page_erreur";
        message = `HTTP ${reponse.statut} mais page d'erreur détectée (${indices.join(", ")}).`;
      } else if (options.pourLecture && !lisible) {
        statut = "type_refuse";
        message = `Type de contenu non lisible : ${reponse.typeContenu}.`;
      } else {
        statut = "accessible";
        message = `HTTP ${reponse.statut}.`;
      }
    } else {
      statut = "inaccessible";
      message = `HTTP ${reponse.statut}.`;
    }
    return base({
      urlFinale: courante,
      statut,
      codeHttp: reponse.statut,
      typeContenu: reponse.typeContenu,
      titre: /html/iu.test(reponse.typeContenu ?? "") ? titreHtml(reponse.corps) : null,
      corps: options.pourLecture && lisible ? reponse.corps : null,
      tronque: reponse.tronque,
      indicesErreur: indices,
      message,
    });
  }
  return base({ statut: "inaccessible", message: `Plus de ${maxRedirections} redirections.`, urlFinale: courante });
}
