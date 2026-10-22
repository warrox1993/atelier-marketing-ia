// Faux listmonk en mémoire (fonction fetch injectable) : mêmes routes et mêmes refus que l'API v6.2.0 pour ce que l'atelier utilise.

import type { AbonneListmonk, CampagneListmonk, ListeListmonk } from "../../src/reel/emailing/listmonk.js";

export interface EtatFaux {
  listes: ListeListmonk[];
  abonnes: Array<AbonneListmonk & { attribs?: Record<string, unknown> }>;
  campagnes: CampagneListmonk[];
  smtp: Array<{ enabled: boolean; host: string }>;
  appels: Array<{ methode: string; chemin: string; corps?: unknown; autorisation: string | null }>;
  droits: Set<string>;
}

export function creerFauxListmonk(droits: string[] = ["gestion"]): { fetch: typeof fetch; etat: EtatFaux } {
  const etat: EtatFaux = {
    listes: [], abonnes: [], campagnes: [], smtp: [{ enabled: true, host: "atelier-mailpit" }], appels: [], droits: new Set(droits),
  };
  let prochain = 1;
  const json = (statut: number, data: unknown): Response => new Response(JSON.stringify(statut >= 400 ? { message: String(data) } : { data }), { status: statut, headers: { "content-type": "application/json" } });
  const f = (async (entree: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(entree));
    const methode = (init?.method ?? "GET").toUpperCase();
    const corps = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    const aut = (init?.headers as Record<string, string> | undefined)?.["authorization"] ?? null;
    etat.appels.push({ methode, chemin: url.pathname + url.search, corps, autorisation: aut });
    const p = url.pathname;
    if (p === "/api/lists" && methode === "GET") return json(200, { results: etat.listes });
    if (p === "/api/lists" && methode === "POST") {
      const l: ListeListmonk = { id: prochain++, name: String(corps?.["name"]), type: "private", optin: "single", subscriber_count: 0, description: String(corps?.["description"] ?? "") };
      etat.listes.push(l);
      return json(200, l);
    }
    if (p === "/api/subscribers" && methode === "GET") {
      const q = (url.searchParams.get("search") ?? "").toLowerCase();
      const liste = url.searchParams.get("list_id");
      if (liste !== null) {
        // Comptage des destinataires d'une liste : abonnés réellement inscrits, indépendamment du compteur `subscriber_count`.
        const inscrits = etat.abonnes.filter((a) => a.lists?.some((l) => l.id === Number(liste) && l.subscription_status === (url.searchParams.get("subscription_status") ?? l.subscription_status)));
        return json(200, { results: url.searchParams.get("per_page") === "all" ? inscrits : inscrits.slice(0, 1), total: inscrits.length });
      }
      return json(200, { results: etat.abonnes.filter((a) => a.email.includes(q)) });
    }
    if (p === "/api/subscribers" && methode === "POST") {
      const email = String(corps?.["email"]);
      if (etat.abonnes.some((a) => a.email === email)) return json(409, "E-mail already exists.");
      const listeIds = (corps?.["lists"] as number[]) ?? [];
      const a = { id: prochain++, email, name: String(corps?.["name"]), status: String(corps?.["status"]), lists: listeIds.map((id) => ({ id, subscription_status: "confirmed" })), attribs: corps?.["attribs"] as Record<string, unknown> };
      etat.abonnes.push(a);
      for (const id of listeIds) { const l = etat.listes.find((x) => x.id === id); if (l) l.subscriber_count++; }
      return json(200, a);
    }
    if (p === "/api/subscribers/lists" && methode === "PUT") {
      for (const id of (corps?.["ids"] as number[]) ?? []) {
        const a = etat.abonnes.find((x) => x.id === id);
        for (const lid of (corps?.["target_list_ids"] as number[]) ?? []) {
          a?.lists?.push({ id: lid, subscription_status: "confirmed" });
          const l = etat.listes.find((x) => x.id === lid); if (l) l.subscriber_count++;
        }
      }
      return json(200, true);
    }
    if (p === "/api/templates") return json(200, [{ id: 7, name: "atelier-corps" }]);
    if (p === "/api/campaigns" && methode === "POST") {
      const ids = (corps?.["lists"] as number[]) ?? [];
      const c: CampagneListmonk = {
        id: prochain++, name: String(corps?.["name"]), subject: String(corps?.["subject"]), status: "draft", body: String(corps?.["body"]), altbody: String(corps?.["altbody"] ?? ""),
        content_type: String(corps?.["content_type"]), template_id: Number(corps?.["template_id"]),
        lists: ids.map((id) => ({ id, name: etat.listes.find((l) => l.id === id)?.name ?? "?" })), to_send: 0, sent: 0, started_at: null, updated_at: null,
      };
      etat.campagnes.push(c);
      return json(200, c);
    }
    const m = /^\/api\/campaigns\/(\d+)(\/status)?$/.exec(p);
    if (m) {
      const c = etat.campagnes.find((x) => x.id === Number(m[1]));
      if (!c) return json(400, "campaign not found");
      if (m[2] && methode === "PUT") {
        if (!etat.droits.has("envoi")) return json(403, "permission denied: campaigns:send");
        c.status = String(corps?.["status"]);
        return json(200, c);
      }
      return json(200, c);
    }
    if (p === "/api/settings") return json(200, { smtp: etat.smtp });
    return json(404, `route inconnue ${methode} ${p}`);
  }) as typeof fetch;
  return { fetch: f, etat };
}
