/**
 * Faux hôte des tests d'interface pour les décisions des autres services : sert, dans un `fetch` simulé, la route du
 * plugin (tâches reçues à suivre) ET les lectures natives que l'interface fait elle-même (tâche, sous-tâches, cartes).
 */
export interface TacheFictive {
  id: string;
  companyId: string;
  identifier: string;
  title: string;
  status?: string;
  parentId?: string | null;
}

export interface CarteFictive {
  id: string;
  kind: "ask_user_questions" | "request_confirmation";
  status?: string;
  title: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface ScenarioHote {
  taches: TacheFictive[];
  /** Tâches reçues à suivre rendues par la route du plugin. */
  aSuivre: Array<{ companyId: string; tacheId: string; slug: string; nom: string }>;
  /** Cartes natives par identifiant de tâche. */
  cartes: Record<string, CarteFictive[]>;
  /** Identifiants de tâches dont la lecture échoue (HTTP 500). */
  enPanne?: Set<string>;
  indisponible?: boolean;
}

const json = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut });

const descendantsDe = (s: ScenarioHote, racine: string, companyId: string): TacheFictive[] => {
  const ids = new Set([racine]);
  const trouvees: TacheFictive[] = [];
  for (let passe = 0; passe < 10; passe += 1) {
    const nouvelles = s.taches.filter((t) => t.companyId === companyId && t.parentId && ids.has(t.parentId) && !ids.has(t.id));
    if (nouvelles.length === 0) break;
    for (const t of nouvelles) {
      ids.add(t.id);
      trouvees.push(t);
    }
  }
  return trouvees;
};

/** Réponse à un GET qui concerne les cartes des services, ou `null` si l'adresse n'est pas de cette famille. */
export function servirHote(url: string, s: ScenarioHote): Response | null {
  const u = new URL(url, "http://x");
  if (u.pathname.endsWith("/discussion/cartes-services")) return json({ taches: s.aSuivre, indisponible: s.indisponible === true });
  const interactions = /^\/api\/issues\/([^/]+)\/interactions$/.exec(u.pathname);
  if (interactions) {
    const id = decodeURIComponent(interactions[1]!);
    if (s.enPanne?.has(id)) return json({ error: "panne" }, 500);
    return json((s.cartes[id] ?? []).map((c) => ({ status: "pending", ...c })));
  }
  const tache = /^\/api\/issues\/([^/]+)$/.exec(u.pathname);
  if (tache) {
    const id = decodeURIComponent(tache[1]!);
    if (s.enPanne?.has(id)) return json({ error: "panne" }, 500);
    const t = s.taches.find((x) => x.id === id);
    return t ? json({ status: "todo", parentId: null, ...t }) : json({ error: "Issue not found" }, 404);
  }
  const sous = /^\/api\/companies\/([^/]+)\/issues$/.exec(u.pathname);
  const parent = u.searchParams.get("descendantOf");
  if (sous && parent) return json(descendantsDe(s, parent, decodeURIComponent(sous[1]!)).map((t) => ({ status: "todo", parentId: null, ...t })));
  return null;
}
