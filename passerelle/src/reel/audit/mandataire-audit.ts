// Mandataire local du navigateur d'audit (anti-SSRF au moment de la connexion). Chrome est lancé avec
// --proxy-server=http://127.0.0.1:<port> : toutes ses requêtes, y compris celles des redirections, des sous-ressources et
// des scripts de la page, passent ici. Pour chacune, le mandataire :
//   1. résout le nom UNE seule fois (jamais une seconde résolution : pas de « DNS rebinding ») ;
//   2. refuse toute adresse non publique (même filtre que la lecture d'URL : adresseAutorisee, « unicast globale seulement ») ;
//   3. se connecte à l'adresse résolue et vérifiée, jamais au nom.
// Il gère CONNECT (HTTPS : tunnel d'octets, le chiffrement reste de bout en bout) et les requêtes HTTP simples. Il n'écoute que
// sur 127.0.0.1, sur un port éphémère, et seulement le temps d'un audit (demarrerMandataire / arreter).

import http from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";
import { adresseAutorisee as filtreProduction, adresseVerifiee, resolveurSysteme, type OptionsVerification } from "../liens/verifier-url.js";

export const DELAI_CONNEXION_MS = 15_000;
export const DELAI_INACTIVITE_MS = 60_000;

export interface OptionsMandataire extends Pick<OptionsVerification, "adresseAutorisee" | "resoudre"> {
  /** Délai de connexion à l'amont. */
  delaiConnexionMs?: number;
  /** Journal des refus (hôte et motif seulement). */
  journal?: (message: string) => void;
}

export interface Mandataire {
  /** Port éphémère d'écoute (127.0.0.1). */
  port: number;
  /** Nombre de refus depuis le démarrage (pour les essais et le journal). */
  refus: () => number;
  /** Arrête l'écoute et coupe toutes les connexions encore ouvertes. */
  arreter: () => Promise<void>;
}

// En-têtes propres à la liaison client-mandataire : jamais retransmis à l'amont.
const SAUTS_PAR_SAUT = ["proxy-connection", "proxy-authorization", "proxy-authenticate", "connection", "keep-alive", "te", "trailer", "upgrade", "transfer-encoding"];

function reponseRefus(socket: Duplex, motif: string): void {
  const corps = `Accès refusé par la passerelle : ${motif}\n`;
  if (socket.writable) socket.write(`HTTP/1.1 403 Forbidden\r\ncontent-type: text/plain; charset=utf-8\r\ncontent-length: ${Buffer.byteLength(corps)}\r\nconnection: close\r\n\r\n${corps}`);
  socket.end();
}

export async function demarrerMandataire(options: OptionsMandataire = {}): Promise<Mandataire> {
  const opts = { adresseAutorisee: options.adresseAutorisee ?? filtreProduction, resoudre: options.resoudre ?? resolveurSysteme };
  const delaiConnexion = options.delaiConnexionMs ?? DELAI_CONNEXION_MS;
  const journal = options.journal ?? ((): void => undefined);
  let nbRefus = 0;
  const sockets = new Set<net.Socket>();
  const suivre = (s: net.Socket): void => { sockets.add(s); s.once("close", () => sockets.delete(s)); };

  const refuser = (hote: string, motif: string): string => {
    nbRefus++;
    journal(`mandataire audit : refus de « ${hote.slice(0, 120)} » (${motif.slice(0, 160)})`);
    return motif;
  };

  /** Une seule résolution, tous les résultats vérifiés ; rend l'adresse sur laquelle se connecter. */
  const adresseSure = async (hote: string, port: string): Promise<string> => {
    const numeroPort = Number(port);
    if (!Number.isInteger(numeroPort) || numeroPort < 1 || numeroPort > 65535) throw new Error("port invalide.");
    return adresseVerifiee(new URL(`http://${hote}`), opts);
  };

  const serveur = http.createServer((req, res) => {
    void (async (): Promise<void> => {
      let cible: URL;
      try { cible = new URL(req.url ?? ""); } catch { res.writeHead(400).end("Requête mandataire invalide.\n"); return; }
      if (cible.protocol !== "http:") { res.writeHead(400).end("Seul http est relayé ici (https passe par CONNECT).\n"); return; }
      let ip: string;
      try { ip = await adresseSure(cible.host, cible.port === "" ? "80" : cible.port); } catch (e) {
        const m = refuser(cible.hostname, e instanceof Error ? e.message : String(e));
        const corps = `Accès refusé par la passerelle : ${m}\n`;
        res.writeHead(403, { "content-type": "text/plain; charset=utf-8", "content-length": Buffer.byteLength(corps), connection: "close" }).end(corps);
        return;
      }
      const entetes = { ...req.headers };
      for (const h of SAUTS_PAR_SAUT) delete entetes[h];
      const amont = http.request({
        host: ip, port: cible.port === "" ? 80 : Number(cible.port), method: req.method, path: `${cible.pathname}${cible.search}`,
        headers: { ...entetes, host: cible.host, connection: "close" }, agent: false, timeout: DELAI_INACTIVITE_MS,
      }, (rep) => {
        const sortie = { ...rep.headers };
        for (const h of SAUTS_PAR_SAUT) delete sortie[h];
        res.writeHead(rep.statusCode ?? 502, sortie);
        rep.pipe(res);
        rep.on("error", () => res.destroy());
      });
      amont.on("socket", suivre);
      amont.on("timeout", () => amont.destroy(new Error("Délai dépassé.")));
      amont.on("error", () => { if (!res.headersSent) res.writeHead(502).end("Échec de la connexion à l'amont.\n"); else res.destroy(); });
      req.on("aborted", () => amont.destroy());
      req.pipe(amont);
    })();
  });
  serveur.on("connection", suivre);

  serveur.on("connect", (req, client: Duplex, tete: Buffer) => {
    void (async (): Promise<void> => {
      client.on("error", () => client.destroy());
      const m = /^(\[[0-9a-f:.]+\]|[^:\s]+):(\d{1,5})$/i.exec(req.url ?? "");
      if (!m) { reponseRefus(client, "cible CONNECT invalide."); return; }
      const [, hote, port] = m as unknown as [string, string, string];
      let ip: string;
      try { ip = await adresseSure(hote, port); } catch (e) { reponseRefus(client, refuser(hote, e instanceof Error ? e.message : String(e))); return; }
      // Connexion à l'adresse déjà vérifiée : aucune seconde résolution possible.
      const amont = net.connect({ host: ip, port: Number(port) });
      suivre(amont);
      amont.setTimeout(delaiConnexion, () => amont.destroy());
      amont.once("connect", () => {
        amont.setTimeout(DELAI_INACTIVITE_MS, () => amont.destroy());
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (tete.length > 0) amont.write(tete);
        amont.pipe(client);
        client.pipe(amont);
      });
      let ouvert = false;
      amont.once("connect", () => { ouvert = true; });
      amont.on("error", () => {
        if (!ouvert && client.writable) client.write("HTTP/1.1 502 Bad Gateway\r\nconnection: close\r\ncontent-length: 0\r\n\r\n");
        client.destroy();
      });
      amont.on("close", () => client.destroy());
      client.on("close", () => amont.destroy());
    })();
  });

  await new Promise<void>((resolve, rejeter) => {
    serveur.once("error", rejeter);
    serveur.listen(0, "127.0.0.1", () => { serveur.off("error", rejeter); resolve(); });
  });
  const adresse = serveur.address();
  if (adresse === null || typeof adresse === "string") throw new Error("Mandataire d'audit : port d'écoute introuvable.");
  return {
    port: adresse.port,
    refus: () => nbRefus,
    arreter: async () => {
      await new Promise<void>((resolve) => {
        serveur.close(() => resolve());
        serveur.closeAllConnections();
        for (const s of sockets) s.destroy();
      });
    },
  };
}
