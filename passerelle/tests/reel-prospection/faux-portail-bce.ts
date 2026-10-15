// Faux portail BCE Open Data (boucle locale) pour tester le téléchargement SANS jamais toucher au vrai portail.
// Il reproduit la partie VÉRIFIÉE du vrai portail (formulaire `j_spring_security_check`, champs `j_username` et `j_password`,
// cookies de session) ; la page de liste des fichiers est une HYPOTHÈSE (voir src/reel/prospection/bce/telechargement.ts).

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface OptionsFauxPortail {
  identifiant: string;
  motDePasse: string;
  /** Archives proposées : nom → contenu. */
  fichiers: Record<string, Buffer>;
  /** Liens sur la page d'accueil (sinon sur la page « affiliation »). */
  listeSurAccueil?: boolean;
  /** Renvoie une page web à la place de l'archive (session expirée). */
  htmlAuLieuDuZip?: boolean;
  /** Redirige la page d'accueil vers un autre site. */
  redirectionExterne?: string;
  /** Aucune archive listée. */
  vide?: boolean;
}

export class FauxPortailBce {
  readonly requetes: { methode: string; chemin: string }[] = [];
  readonly corps: string[] = [];
  private serveur: Server | null = null;
  url = "";

  constructor(readonly options: OptionsFauxPortail) {}

  private authentifie(req: IncomingMessage): boolean {
    return /KSESSIONID-KBOPUB-OPENDATA=session-ok/.test(req.headers.cookie ?? "");
  }

  private async lireCorps(req: IncomingMessage): Promise<string> {
    const morceaux: Buffer[] = [];
    for await (const m of req) morceaux.push(m as Buffer);
    return Buffer.concat(morceaux).toString("utf8");
  }

  private liens(): string {
    return this.options.vide ? "" : Object.keys(this.options.fichiers).map((n) => `<li><a href="/kbo-open-data/files/${n}">${n}</a></li>`).join("\n");
  }

  private async traiter(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://faux");
    this.requetes.push({ methode: req.method ?? "?", chemin: url.pathname + url.search });
    const o = this.options;
    if (url.pathname === "/kbo-open-data/login" && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/html", "set-cookie": ["JSESSIONID=abc123; Path=/kbo-open-data; HttpOnly", "locale=fr; Path=/"] });
      res.end('<form name="f" method="POST" action="/kbo-open-data/static/j_spring_security_check"><input name="j_username"/><input type="password" name="j_password"/></form>');
      return;
    }
    if (url.pathname === "/kbo-open-data/static/j_spring_security_check" && req.method === "POST") {
      const corps = await this.lireCorps(req);
      this.corps.push(corps);
      const p = new URLSearchParams(corps);
      if (p.get("j_username") === o.identifiant && p.get("j_password") === o.motDePasse && /JSESSIONID=abc123/.test(req.headers.cookie ?? "")) {
        res.writeHead(302, { location: "/kbo-open-data/", "set-cookie": "KSESSIONID-KBOPUB-OPENDATA=session-ok; Path=/" });
      } else {
        res.writeHead(302, { location: "/kbo-open-data/login?error=true" });
      }
      res.end();
      return;
    }
    if (url.pathname === "/kbo-open-data/" && req.method === "GET") {
      if (!this.authentifie(req)) {
        res.writeHead(302, { location: "/kbo-open-data/login" });
        res.end();
        return;
      }
      if (o.redirectionExterne) {
        res.writeHead(302, { location: o.redirectionExterne });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end(o.listeSurAccueil === false ? '<a href="/kbo-open-data/affiliation/1">Mes fichiers</a>' : `<ul>${this.liens()}</ul>`);
      return;
    }
    if (url.pathname === "/kbo-open-data/affiliation/1" && this.authentifie(req)) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<ul>${this.liens()}</ul>`);
      return;
    }
    const m = /^\/kbo-open-data\/files\/(KboOpenData_[^/]+\.zip)$/.exec(url.pathname);
    if (m && this.authentifie(req) && o.fichiers[m[1]!]) {
      if (o.htmlAuLieuDuZip) {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html>Veuillez vous reconnecter</html>");
        return;
      }
      res.writeHead(200, { "content-type": "application/zip", "content-length": String(o.fichiers[m[1]!]!.length) });
      res.end(o.fichiers[m[1]!]);
      return;
    }
    res.writeHead(404);
    res.end();
  }

  async demarrer(): Promise<string> {
    this.serveur = createServer((req, res) => void this.traiter(req, res));
    await new Promise<void>((ok) => this.serveur!.listen(0, "127.0.0.1", ok));
    this.url = `http://127.0.0.1:${(this.serveur.address() as AddressInfo).port}`;
    return this.url;
  }

  async arreter(): Promise<void> {
    await new Promise<void>((ok) => (this.serveur ? this.serveur.close(() => ok()) : ok()));
  }
}
