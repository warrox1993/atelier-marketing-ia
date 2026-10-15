// Appels vers une adresse SAISIE par un client (instance Odoo) : garde contre la falsification de requêtes côté
// serveur (SSRF). Revue de sécurité du 15/10/2026, constat S4 (docs/revue-securite-passerelle.md).
//
// Règles :
//   1. HTTPS seulement (la boucle locale en HTTP n'est permise qu'en essai, faux serveurs des tests) ;
//   2. le nom d'hôte est résolu UNE fois par appel ; si UNE des adresses obtenues n'est pas publique, l'appel
//      est refusé (pas de choix « au hasard » parmi des adresses mêlées) ;
//   3. la connexion TCP est ouverte vers l'adresse vérifiée, jamais vers une nouvelle résolution : un nom dont le
//      DNS change entre la vérification et la connexion (rebond DNS) ne peut plus viser le réseau local. Le nom
//      reste utilisé pour TLS (SNI et contrôle du certificat) et pour l'en-tête Host ;
//   4. aucune redirection n'est suivie ; la réponse est bornée en taille.
// « Publique » : IPv4 hors des plages spéciales de l'IANA ; IPv6 dans 2000::/3 (unicast global) hors des blocs
// spéciaux. Les formes IPv6 qui embarquent une IPv4 (::ffff:0:0/96, 64:ff9b::/96, 2002::/16, Teredo) sont donc
// refusées, ce qui ferme le contournement « https://[::ffff:7f00:1]/ » vers 127.0.0.1.

import { lookup } from "node:dns/promises";
import { request as requeteHttp, type IncomingMessage, type RequestOptions } from "node:http";
import { request as requeteHttps } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

/** Plages IPv4 non publiques (registre IANA des adresses à usage spécial, RFC 6890 et suivantes). */
const SPECIALES_IPV4: [string, number][] = [
  ["0.0.0.0", 8], // « ce réseau »
  ["10.0.0.0", 8], // privé
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // boucle locale
  ["169.254.0.0", 16], // lien local (dont 169.254.169.254, métadonnées de nuage)
  ["172.16.0.0", 12], // privé
  ["192.0.0.0", 24], // affectations IETF
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // relais 6to4
  ["192.168.0.0", 16], // privé
  ["198.18.0.0", 15], // bancs d'essai
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multidiffusion
  ["240.0.0.0", 4], // réservé, dont 255.255.255.255
];

/** Blocs spéciaux à l'intérieur de 2000::/3. */
const SPECIALES_IPV6: [string, number][] = [
  ["2001::", 23], // affectations IETF (Teredo 2001::/32, bancs d'essai, ORCHID…)
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (embarque une IPv4)
  ["3fff::", 20], // documentation (RFC 9637)
];

const ipv4Speciales = new BlockList();
for (const [a, p] of SPECIALES_IPV4) ipv4Speciales.addSubnet(a, p, "ipv4");
const ipv6Globales = new BlockList();
ipv6Globales.addSubnet("2000::", 3, "ipv6");
const ipv6Speciales = new BlockList();
for (const [a, p] of SPECIALES_IPV6) ipv6Speciales.addSubnet(a, p, "ipv6");

/** Vrai si l'adresse IP n'est pas une adresse publique joignable sans risque (ou si ce n'est pas une IP). */
export function adresseInterdite(ip: string): boolean {
  const famille = isIP(ip);
  if (famille === 4) return ipv4Speciales.check(ip, "ipv4");
  if (famille === 6) return !ipv6Globales.check(ip, "ipv6") || ipv6Speciales.check(ip, "ipv6");
  return true;
}

export type Resolveur = (hote: string) => Promise<Array<{ address: string; family: number }>>;

const resoudreParDefaut: Resolveur = (hote) => lookup(hote, { all: true, verbatim: true });

export interface Destination {
  adresse: string;
  famille: 4 | 6;
}

/** Erreur de destination : message clair, sans aucune valeur secrète. */
export class DestinationRefusee extends Error {
  constructor(
    readonly motif: "refusee" | "introuvable",
    message: string,
  ) {
    super(message);
  }
}

const boucle = new BlockList();
boucle.addSubnet("127.0.0.0", 8, "ipv4");
boucle.addAddress("::1", "ipv6");
const estBoucle = (ip: string): boolean => {
  const f = isIP(ip);
  return f === 4 ? boucle.check(ip, "ipv4") : f === 6 ? boucle.check(ip, "ipv6") : false;
};

/**
 * Résout une fois et vérifie la destination d'une adresse saisie. `essai` (faux serveurs des tests, jamais en
 * service réel) : HTTP permis, mais seulement si TOUTES les adresses obtenues sont de la boucle locale.
 */
export async function resoudreDestination(url: URL, essai: boolean, resoudre: Resolveur = resoudreParDefaut): Promise<Destination> {
  const hote = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" && !(essai && url.protocol === "http:")) throw new DestinationRefusee("refusee", "L'adresse doit être servie en HTTPS.");
  if (url.username || url.password) throw new DestinationRefusee("refusee", "L'adresse ne doit contenir aucun identifiant.");
  const litterale = isIP(hote);
  let adresses: Array<{ address: string; family: number }>;
  if (litterale !== 0) adresses = [{ address: hote, family: litterale }];
  else if (essai && hote === "localhost") adresses = [{ address: "127.0.0.1", family: 4 }];
  else {
    try {
      adresses = await resoudre(hote);
    } catch {
      adresses = [];
    }
  }
  if (adresses.length === 0) throw new DestinationRefusee("introuvable", `Hôte introuvable : ${url.hostname}.`);
  if (url.protocol === "http:") {
    if (!adresses.every((a) => estBoucle(a.address))) throw new DestinationRefusee("refusee", "L'adresse doit être servie en HTTPS (HTTP : boucle locale des essais seulement).");
    const premiere = adresses[0]!;
    return { adresse: premiere.address, famille: premiere.family === 6 ? 6 : 4 };
  }
  if (adresses.some((a) => adresseInterdite(a.address))) {
    throw new DestinationRefusee("refusee", "Adresse refusée : réseau privé, local ou réservé.");
  }
  const premiere = adresses[0]!;
  return { adresse: premiere.address, famille: premiere.family === 6 ? 6 : 4 };
}

export interface RequeteEpinglee {
  methode: string;
  url: string;
  entetes: Record<string, string>;
  corps?: string;
  delaiMs: number;
  /** Taille maximale de la réponse, en octets. */
  maxOctets?: number;
}

export interface ReponseBrute {
  statut: number;
  entetes: Headers;
  texte: string;
}

/** Erreur de transport (réseau, délai, redirection, réponse trop grande) : l'effet d'une écriture est incertain. */
export class EchecTransport extends Error {}

const MAX_OCTETS_PAR_DEFAUT = 20 * 1024 * 1024;

/** Envoie la requête vers l'adresse IP déjà vérifiée (aucune nouvelle résolution DNS), sans suivre de redirection. */
export function envoyerVersDestination(requete: RequeteEpinglee, destination: Destination): Promise<ReponseBrute> {
  const url = new URL(requete.url);
  const hote = url.hostname.replace(/^\[|\]$/g, "");
  // Toute résolution demandée par la pile réseau rend l'adresse vérifiée, quel que soit le nom demandé.
  const epingle = ((_nom: string, options: { all?: boolean }, rappel: (...a: unknown[]) => void) => {
    if (options?.all) rappel(null, [{ address: destination.adresse, family: destination.famille }]);
    else rappel(null, destination.adresse, destination.famille);
  }) as unknown as LookupFunction;
  const corps = requete.corps !== undefined ? Buffer.from(requete.corps, "utf8") : undefined;
  const options: RequestOptions = {
    method: requete.methode,
    host: isIP(hote) !== 0 ? destination.adresse : hote,
    port: url.port || (url.protocol === "https:" ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    headers: { ...requete.entetes, host: url.host, ...(corps ? { "content-length": String(corps.length) } : {}) },
    lookup: epingle,
    signal: AbortSignal.timeout(requete.delaiMs),
  };
  const envoyer = url.protocol === "https:" ? requeteHttps : requeteHttp;
  const maximum = requete.maxOctets ?? MAX_OCTETS_PAR_DEFAUT;
  return new Promise<ReponseBrute>((resolve, reject) => {
    const req = envoyer(options, (res: IncomingMessage) => {
      const statut = res.statusCode ?? 0;
      if (statut >= 300 && statut < 400) {
        res.destroy();
        reject(new EchecTransport("redirection refusée"));
        return;
      }
      const morceaux: Buffer[] = [];
      let total = 0;
      res.on("data", (m: Buffer) => {
        total += m.length;
        if (total > maximum) {
          res.destroy();
          reject(new EchecTransport("réponse trop volumineuse"));
          return;
        }
        morceaux.push(m);
      });
      res.on("error", () => reject(new EchecTransport("réponse interrompue")));
      res.on("end", () => {
        const entetes = new Headers();
        for (const [nom, valeur] of Object.entries(res.headers)) {
          if (Array.isArray(valeur)) for (const v of valeur) entetes.append(nom, v);
          else if (valeur !== undefined) entetes.set(nom, valeur);
        }
        resolve({ statut, entetes, texte: Buffer.concat(morceaux).toString("utf8") });
      });
    });
    req.on("error", () => reject(new EchecTransport("réseau ou délai dépassé")));
    if (corps) req.write(corps);
    req.end();
  });
}
