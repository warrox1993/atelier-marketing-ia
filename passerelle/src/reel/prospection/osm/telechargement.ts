// Téléchargement de l'extrait OpenStreetMap de la Belgique chez Geofabrik (lot P3b), SANS JAMAIS le lancer par défaut.
//
// `verifierTaille` ne fait qu'une requête HEAD : elle lit la taille annoncée (664 Mo le 15/10/2026 pour belgium-latest.osm.pbf,
// d'après la page https://download.geofabrik.de/europe/belgium.html). `telechargerExtrait` ne télécharge que si l'appelant
// confirme explicitement ET si le disque a la place. Les données sont sous licence ODbL (voir docs/passerelle.md).
// Le service Geofabrik est gratuit et sans compte ; ne pas l'interroger plus d'une fois par jour (le fichier est quotidien).

import { createWriteStream, mkdirSync, renameSync, rmSync, statfsSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const URL_EXTRAIT_BELGIQUE = "https://download.geofabrik.de/europe/belgium-latest.osm.pbf";

export interface TailleExtrait {
  url: string;
  octets: number | null;
  derniereModification: string | null;
}

function verifierHote(url: URL): void {
  const boucle = url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
  if (!boucle && !(url.protocol === "https:" && url.hostname === "download.geofabrik.de")) {
    throw new Error(`Adresse refusée : seul https://download.geofabrik.de (ou la boucle locale, en essai) est permis, reçu ${url.origin}.`);
  }
}

/** Taille annoncée par le serveur (requête HEAD, redirection suivie) : ne télécharge rien. */
export async function verifierTaille(url: string = URL_EXTRAIT_BELGIQUE, appeler: typeof fetch = fetch): Promise<TailleExtrait> {
  verifierHote(new URL(url));
  const r = await appeler(url, { method: "HEAD", redirect: "follow", headers: { "user-agent": "atelier-marketing-ia-passerelle (import OSM)" } });
  if (!r.ok) throw new Error(`Taille de l'extrait illisible : HTTP ${r.status}.`);
  verifierHote(new URL(r.url || url));
  const longueur = r.headers.get("content-length");
  return { url: r.url || url, octets: longueur !== null && /^\d+$/.test(longueur) ? Number(longueur) : null, derniereModification: r.headers.get("last-modified") };
}

export interface OptionsTelechargementOsm {
  url?: string;
  destination: string;
  /** Faux (défaut) : seule la taille est lue. Vrai : télécharge. */
  confirmer?: boolean;
  appeler?: typeof fetch;
  /** Espace libre exigé en plus de la taille de l'extrait, en octets (500 Mo par défaut : marge pour le filtrage osmium). */
  margeOctets?: number;
}

export interface ResultatTelechargementOsm {
  telecharge: boolean;
  taille: TailleExtrait;
}

export async function telechargerExtrait(o: OptionsTelechargementOsm): Promise<ResultatTelechargementOsm> {
  const appeler = o.appeler ?? fetch;
  const taille = await verifierTaille(o.url ?? URL_EXTRAIT_BELGIQUE, appeler);
  if (o.confirmer !== true) return { telecharge: false, taille };
  mkdirSync(dirname(o.destination), { recursive: true, mode: 0o700 });
  const libre = statfsSync(dirname(o.destination));
  const disponible = libre.bavail * libre.bsize;
  const besoin = (taille.octets ?? 0) + (o.margeOctets ?? 500 * 1024 * 1024);
  if (disponible < besoin) throw new Error(`Espace disque insuffisant : ${Math.round(disponible / 1e6)} Mo libres, ${Math.round(besoin / 1e6)} Mo nécessaires.`);
  const reponse = await appeler(taille.url, { headers: { "user-agent": "atelier-marketing-ia-passerelle (import OSM)" } });
  if (!reponse.ok || !reponse.body) throw new Error(`Téléchargement impossible : HTTP ${reponse.status}.`);
  verifierHote(new URL(reponse.url || taille.url)); // une redirection vers un autre site est refusée ici aussi
  const partiel = `${o.destination}.part`;
  try {
    await pipeline(Readable.fromWeb(reponse.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>), createWriteStream(partiel, { mode: 0o600 }));
    const annonce = reponse.headers.get("content-length");
    if (annonce !== null && /^\d+$/.test(annonce) && statSync(partiel).size !== Number(annonce)) throw new Error("Téléchargement incomplet : taille reçue différente de la taille annoncée.");
    renameSync(partiel, o.destination);
  } catch (e) {
    rmSync(partiel, { force: true });
    throw e;
  }
  return { telecharge: true, taille };
}
