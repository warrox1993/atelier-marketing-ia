/**
 * Faux Meta (API Graph) et faux atelier (instance Paperclip + plugin) pour les tests, sur la boucle locale.
 *
 * Le faux atelier reproduit les règles d'identité vérifiées dans le code réel :
 * - Paperclip en local_trusted : requête sans jeton porteur = board « local-board » ; en-tête `x-paperclip-run-id`
 *   ou jeton porteur = agent (paperclip/server/src/middleware/auth.ts, actorMiddleware) ;
 * - plugin : `decider` refuse tout acteur non humain ou sans userId (plugin-atelier/src/serveur/services.ts,
 *   deciderSansVerrou) et exige la révision courante ; la discussion exige un humain (services-discussion.ts).
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface RequeteRecue {
  methode: string;
  chemin: string;
  entetes: IncomingMessage["headers"];
  corps: unknown;
}

const lire = (req: IncomingMessage) =>
  new Promise<unknown>((resolve) => {
    const m: Buffer[] = [];
    req.on("data", (c: Buffer) => m.push(c));
    req.on("end", () => {
      const t = Buffer.concat(m).toString("utf8");
      try {
        resolve(t ? JSON.parse(t) : null);
      } catch {
        resolve(t);
      }
    });
  });

async function ecouter(s: Server): Promise<number> {
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return (s.address() as AddressInfo).port;
}

/* ------------------------------------------------------------------ */

export interface FauxMeta {
  url: string;
  envois: RequeteRecue[];
  textes(): string[];
  fermer(): Promise<void>;
  echouer: boolean;
}

export async function fauxMeta(jeton: string): Promise<FauxMeta> {
  const f: FauxMeta = {
    url: "",
    envois: [],
    echouer: false,
    textes: () => f.envois.map((e) => (e.corps as { text?: { body?: string } }).text?.body ?? "").filter(Boolean),
    fermer: () => new Promise((r) => s.close(() => r())),
  };
  const s = createServer(async (req, res) => {
    const corps = await lire(req);
    if (req.headers.authorization !== `Bearer ${jeton}`) {
      res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: { code: 190 } }));
      return;
    }
    if (f.echouer) {
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: { code: 131047 } }));
      return;
    }
    f.envois.push({ methode: req.method ?? "", chemin: req.url ?? "", entetes: req.headers, corps });
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ messages: [{ id: "wamid.sortant" }] }));
  });
  f.url = `http://127.0.0.1:${await ecouter(s)}`;
  return f;
}

/* ------------------------------------------------------------------ */

export const DIRECTION = "11111111-1111-4111-8111-111111111111";
export const SERVICE_SEO = "22222222-2222-4222-8222-222222222222";
export const TACHE = "33333333-3333-4333-8333-333333333333";
export const REV1 = "44444444-4444-4444-8444-444444444444";
export const REV2 = "55555555-5555-4555-8555-555555555555";

export interface Decision {
  issueId: string;
  revisionId: string;
  action: string;
  commentaire: string;
  userId: string;
  acteurType: "humain" | "agent";
  portee: unknown;
}

export interface FauxAtelier {
  url: string;
  requetes: RequeteRecue[];
  decisions: Decision[];
  discussion: Array<{ id: string; auteur: "humain" | "agent"; nom: string; texte: string; date: string }>;
  elements: Record<string, Array<Record<string, unknown>>>;
  revisionCourante: string;
  statutLivrable: string;
  appels: Array<Record<string, unknown>>;
  journal: Record<string, Array<{ seq: number; type: string; issueId: string | null; donnees: Record<string, unknown> }>>;
  agents: Array<{ id: string; name: string; role: string; status: string; companyId: string }>;
  entreprises: Record<string, { id: string; name: string; status: string }>;
  autresActions: RequeteRecue[];
  /** Services déclarés (modifiable : un test peut donner au service SEO un identifiant sensible). */
  departements: Array<{ companyId: string; slug: string; nom: string; estDirection: boolean; courant: boolean }>;
  fermer(): Promise<void>;
}

export function elementContenu(): Record<string, unknown> {
  return { id: `contenu:${TACHE}`, type: "contenu_a_valider", urgence: "haute", titre: "Post LinkedIn d'octobre", raison: "Prêt pour votre validation.", lien: "/taches/x", action: "Valider", issueId: TACHE };
}

export function elementLiaison(): Record<string, unknown> {
  return {
    id: "liaison:L1", type: "liaison_a_approuver", urgence: "moyenne", titre: "Demande de SEO vers Direction", raison: "Transmission à approuver.", lien: "/echanges", action: "Décider",
    liaison: { liaisonId: "66666666-6666-4666-8666-666666666666", serviceSource: "seo", serviceCible: "direction", objet: "Chiffres", question: "Peut-on transmettre ?", extraits: [] },
  };
}

export async function fauxAtelier(): Promise<FauxAtelier> {
  const f: FauxAtelier = {
    url: "",
    requetes: [],
    decisions: [],
    discussion: [],
    elements: { [DIRECTION]: [elementContenu()], [SERVICE_SEO]: [elementLiaison()] },
    revisionCourante: REV1,
    statutLivrable: "ready_for_human",
    appels: [],
    journal: { [DIRECTION]: [], [SERVICE_SEO]: [] },
    agents: [
      { id: "a1", name: "Coordinateur général", role: "ceo", status: "idle", companyId: DIRECTION },
      { id: "a2", name: "Rédacteur SEO", role: "general", status: "paused", companyId: SERVICE_SEO },
    ],
    entreprises: { [DIRECTION]: { id: DIRECTION, name: "Direction", status: "active" }, [SERVICE_SEO]: { id: SERVICE_SEO, name: "SEO", status: "paused" } },
    autresActions: [],
    departements: [
      { companyId: DIRECTION, slug: "direction", nom: "Direction", estDirection: true, courant: true },
      { companyId: SERVICE_SEO, slug: "seo", nom: "SEO", estDirection: false, courant: false },
    ],
    fermer: () => new Promise((r) => s.close(() => r())),
  };
  const P = "/api/plugins/atelier.marketing-ia/api";
  const s = createServer(async (req, res) => {
    const corps = await lire(req);
    const u = new URL(req.url ?? "/", "http://x");
    const r: RequeteRecue = { methode: req.method ?? "", chemin: u.pathname + u.search, entetes: req.headers, corps };
    f.requetes.push(r);
    // Identité Paperclip (local_trusted) puis plugin (acteurDepuisRequete).
    const agent = Boolean(req.headers["x-paperclip-run-id"]) || /^bearer/i.test(req.headers.authorization ?? "");
    const acteur = agent ? { type: "agent" as const, userId: null } : { type: "humain" as const, userId: "local-board" };
    const json = (statut: number, v: unknown) => res.writeHead(statut, { "content-type": "application/json" }).end(JSON.stringify(v));
    const p = u.pathname;
    const b = (corps ?? {}) as Record<string, unknown>;

    if (p === `${P}/discussion/message` && req.method === "POST") {
      if (acteur.type !== "humain") return json(403, { error: "La discussion avec le Coordinateur est réservée à un humain." });
      if (String(b["companyId"]) !== DIRECTION) return json(403, { error: "hors entreprise" });
      const m = { id: `c${f.discussion.length + 1}`, auteur: "humain" as const, nom: "Vous", texte: String(b["texte"]), date: new Date().toISOString() };
      f.discussion.push(m);
      return json(201, { ...m, reveilDemande: true });
    }
    if (p === `${P}/discussion/messages`) {
      const depuis = u.searchParams.get("depuis");
      return json(200, { messages: f.discussion.filter((m) => !depuis || m.date > depuis) });
    }
    if (p === `${P}/departements`) {
      return json(200, { client: "c", departements: f.departements });
    }
    if (p === `${P}/accueil`) {
      if (acteur.type !== "humain") return json(403, { error: "humain seulement" });
      return json(200, { companyId: u.searchParams.get("companyId"), elements: f.elements[u.searchParams.get("companyId") ?? ""] ?? [], missions: [] });
    }
    if (p === `${P}/journal`) {
      const c = u.searchParams.get("companyId") ?? "";
      const apres = Number(u.searchParams.get("afterSeq") ?? 0);
      const ev = (f.journal[c] ?? []).filter((e) => e.seq > apres);
      return json(200, { evenements: ev, dernierSeq: ev.length ? ev[ev.length - 1]!.seq : apres, complet: true });
    }
    const mDossier = /^\/api\/plugins\/atelier\.marketing-ia\/api\/taches\/([^/]+)\/dossier$/.exec(p);
    if (mDossier) {
      return json(200, {
        issueId: mDossier[1], companyId: DIRECTION, titre: "Post", mode: "demonstration", statut: { statut: f.statutLivrable, motif: "porte franchie" },
        livrable: { revisionId: f.revisionCourante, revisionNumber: f.revisionCourante === REV1 ? 1 : 2, titre: "Post", corps: "Texte du post." },
        evaluationPorte: { decision: "PASS", perimee: false, revisionId: f.revisionCourante },
        appelsProposes: f.appels,
      });
    }
    const mDec = /^\/api\/plugins\/atelier\.marketing-ia\/api\/taches\/([^/]+)\/decisions$/.exec(p);
    if (mDec && req.method === "POST") {
      // Garde `decider` du plugin.
      if (acteur.type !== "humain" || !acteur.userId) return json(403, { error: "Seul un humain authentifié enregistre une décision." });
      if (b["revisionId"] !== f.revisionCourante) return json(409, { error: "La décision doit viser la révision courante du livrable." });
      if (typeof b["commentaire"] !== "string" || !b["commentaire"]) return json(400, { error: "commentaire" });
      const d: Decision = { issueId: mDec[1]!, revisionId: String(b["revisionId"]), action: String(b["action"]), commentaire: String(b["commentaire"]), userId: acteur.userId, acteurType: acteur.type, portee: b["portee"] };
      f.decisions.push(d);
      return json(201, { id: `dec${f.decisions.length}`, ...d });
    }
    if (p === `${P}/liaisons/decider` && req.method === "POST") {
      if (acteur.type !== "humain") return json(403, { error: "humain seulement" });
      f.autresActions.push(r);
      f.elements[SERVICE_SEO] = [];
      return json(200, { ok: true });
    }
    const mAgent = /^\/api\/agents\/([^/]+)(\/(pause|resume))?$/.exec(p);
    if (mAgent) {
      const a = f.agents.find((x) => x.id === mAgent[1]);
      if (!a) return json(404, { error: "Agent not found" });
      if (mAgent[3]) {
        if (acteur.type !== "humain") return json(403, { error: "board" });
        a.status = mAgent[3] === "pause" ? "paused" : "idle";
        f.autresActions.push(r);
      }
      return json(200, a);
    }
    const mAgents = /^\/api\/companies\/([^/]+)\/agents$/.exec(p);
    if (mAgents) return json(200, f.agents.filter((a) => a.companyId === mAgents[1]));
    const mEnt = /^\/api\/companies\/([^/]+)$/.exec(p);
    if (mEnt) {
      const e = f.entreprises[mEnt[1]!];
      if (!e) return json(404, { error: "Company not found" });
      if (req.method === "PATCH") {
        e.status = String(b["status"]);
        f.autresActions.push(r);
      }
      return json(200, e);
    }
    if (/^\/api\/issues\/[^/]+$/.test(p) && req.method === "PATCH") {
      f.autresActions.push(r);
      return json(200, { status: b["status"] });
    }
    if (/^\/api\/(approvals|issues)\//.test(p) && req.method === "POST") {
      f.autresActions.push(r);
      return json(200, {});
    }
    return json(404, { error: "route inconnue du faux atelier" });
  });
  f.url = `http://127.0.0.1:${await ecouter(s)}`;
  return f;
}
