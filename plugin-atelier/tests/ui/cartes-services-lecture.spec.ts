/**
 * Lecture des cartes des services par l'interface : sous-tâches, ordre chronologique, plafonds, concurrence, cloisonnement.
 * Lecteur de l'hôte simulé (aucun réseau).
 */
import { describe, expect, it } from "vitest";
import { lireCartesDesServices, MAX_TACHES_LUES, type LecteurHote } from "../../src/ui/cartes-services-lecture.js";
import { LECTURES_SIMULTANEES } from "../../src/ui/vues/departements.js";

const MKT = "22222222-2222-4222-8222-222222222222";
const JUR = "33333333-3333-4333-8333-333333333333";
const ETR = "99999999-9999-4999-8999-999999999999";
const aSuivre = (companyId: string, tacheId: string, slug: string, nom: string) => ({ companyId, tacheId, slug, nom });
const tache = (id: string, companyId: string, identifier: string, extra: Record<string, unknown> = {}) => ({ id, companyId, identifier, title: `Tâche ${identifier}`, status: "todo", ...extra });
const carte = (id: string, createdAt: string, extra: Record<string, unknown> = {}) => ({ id, kind: "request_confirmation", status: "pending", title: `Carte ${id}`, createdAt, payload: { prompt: "Valider ?" }, ...extra });

interface Hote {
  taches: Array<ReturnType<typeof tache>>;
  cartes: Record<string, unknown[]>;
  pannes?: Set<string>;
}
function lecteur(h: Hote, journal: string[] = []): LecteurHote {
  return async (chemin) => {
    journal.push(chemin);
    const [path, requete = ""] = chemin.split("?");
    const parent = new URLSearchParams(requete).get("descendantOf");
    const inter = /^\/issues\/([^/]+)\/interactions$/.exec(path!);
    const une = /^\/issues\/([^/]+)$/.exec(path!);
    const liste = /^\/companies\/([^/]+)\/issues$/.exec(path!);
    const id = decodeURIComponent((inter ?? une)?.[1] ?? "");
    if (h.pannes?.has(id)) throw { code: "HTTP_500", message: "panne" };
    if (inter) return h.cartes[id] ?? [];
    if (une) return h.taches.find((t) => t.id === id) ?? Promise.reject({ code: "HTTP_404", message: "introuvable" });
    if (liste && parent) {
      const ids = new Set([parent]);
      const res: unknown[] = [];
      for (let n = 0; n < 10; n += 1) {
        const nouvelles = h.taches.filter((t) => t.companyId === liste[1] && (t as { parentId?: string }).parentId && ids.has((t as { parentId?: string }).parentId!) && !ids.has(t.id));
        if (nouvelles.length === 0) break;
        for (const t of nouvelles) {
          ids.add(t.id);
          res.push(t);
        }
      }
      return res;
    }
    throw new Error(`chemin inattendu ${chemin}`);
  };
}

describe("lireCartesDesServices", () => {
  it("lit la tâche reçue, ses sous-tâches à tous les niveaux et leurs cartes en attente, du plus ancien au plus récent, avec le lien de leur entreprise", async () => {
    const h: Hote = {
      taches: [tache("t1", MKT, "MKT-2"), tache("t2", MKT, "MKT-3", { parentId: "t1" }), tache("t3", MKT, "MKT-4", { parentId: "t2" })],
      cartes: { t1: [carte("c1", "2026-10-18T10:09:00Z")], t2: [carte("c2", "2026-10-18T10:01:00Z")], t3: [carte("c3", "2026-10-18T10:05:00Z", { kind: "ask_user_questions" })] },
    };
    const r = await lireCartesDesServices([aSuivre(MKT, "t1", "marketing", "Marketing")], lecteur(h));
    expect(r.indisponible).toBe(false);
    expect(r.cartes.map((c) => [c.element.id, c.tache, c.nom, c.slug, c.companyId])).toEqual([
      ["question:c2", "MKT-3", "Marketing", "marketing", MKT],
      ["question:c3", "MKT-4", "Marketing", "marketing", MKT],
      ["question:c1", "MKT-2", "Marketing", "marketing", MKT],
    ]);
    expect(r.cartes[0]!.element).toMatchObject({ lien: "/MKT/issues/MKT-3", issueId: "t2", interaction: { id: "c2", kind: "request_confirmation" } });
  });

  it("plusieurs services : ordre chronologique commun ; une carte traitée, une tâche terminée ou une autre sorte de carte sont ignorées", async () => {
    const h: Hote = {
      taches: [tache("t1", MKT, "MKT-2"), tache("j1", JUR, "JUR-1"), tache("j2", JUR, "JUR-2", { parentId: "j1", status: "done" })],
      cartes: { t1: [carte("a", "2026-10-18T10:05:00Z"), carte("b", "2026-10-18T10:06:00Z", { status: "answered" }), carte("z", "2026-10-18T10:07:00Z", { kind: "suggest_tasks" })], j1: [carte("c", "2026-10-18T10:02:00Z")], j2: [carte("d", "2026-10-18T10:03:00Z")] },
    };
    const r = await lireCartesDesServices([aSuivre(MKT, "t1", "marketing", "Marketing"), aSuivre(JUR, "j1", "juridique", "Juridique")], lecteur(h));
    expect(r.cartes.map((c) => [c.element.id, c.nom])).toEqual([["question:c", "Juridique"], ["question:a", "Marketing"]]);
  });

  it("rien hors de l'entreprise annoncée : une tâche ou une sous-tâche d'une autre entreprise est ignorée, et aucune autre entreprise n'est interrogée", async () => {
    const h: Hote = {
      taches: [tache("t1", MKT, "MKT-2"), tache("e1", ETR, "ETR-1", { parentId: "t1" }), tache("e2", ETR, "ETR-2")],
      cartes: { t1: [carte("a", "2026-10-18T10:05:00Z")], e1: [carte("x", "2026-10-18T10:00:00Z")], e2: [carte("y", "2026-10-18T10:00:00Z")] },
    };
    const journal: string[] = [];
    // `e2` est annoncée comme appartenant à MKT par erreur : la tâche lue dit qu'elle est dans ETR, elle est écartée.
    const r = await lireCartesDesServices([aSuivre(MKT, "t1", "marketing", "Marketing"), aSuivre(MKT, "e2", "marketing", "Marketing")], lecteur(h, journal));
    expect(r.cartes.map((c) => c.element.id)).toEqual(["question:a"]);
    expect(journal.some((c) => c.includes("e1") || c.includes("e2/interactions") || c.includes(ETR))).toBe(false);
  });

  it("une lecture en échec marque indisponible sans perdre les cartes des autres tâches ; ne lève jamais", async () => {
    const h: Hote = {
      taches: [tache("t1", MKT, "MKT-2"), tache("t2", MKT, "MKT-3", { parentId: "t1" }), tache("j1", JUR, "JUR-1")],
      cartes: { t1: [carte("a", "2026-10-18T10:05:00Z")], t2: [carte("b", "2026-10-18T10:06:00Z")], j1: [carte("c", "2026-10-18T10:07:00Z")] },
      pannes: new Set(["t2", "j1"]),
    };
    const r = await lireCartesDesServices([aSuivre(MKT, "t1", "marketing", "Marketing"), aSuivre(JUR, "j1", "juridique", "Juridique")], lecteur(h));
    expect(r.indisponible).toBe(true);
    expect(r.cartes.map((c) => c.element.id)).toEqual(["question:a"]);
  });

  it("au plus six lectures simultanées et au plus 30 tâches dont on lit les cartes", async () => {
    const taches = [tache("r", MKT, "MKT-1"), ...Array.from({ length: 50 }, (_, i) => tache(`s${i}`, MKT, `MKT-${i + 2}`, { parentId: "r" }))];
    const h: Hote = { taches, cartes: Object.fromEntries(taches.map((t) => [t.id, [carte(`c-${t.id}`, "2026-10-18T10:00:00Z")]])) };
    const base = lecteur(h);
    let enCours = 0;
    let max = 0;
    let interactionsLues = 0;
    const mesure: LecteurHote = async (chemin) => {
      enCours += 1;
      max = Math.max(max, enCours);
      if (chemin.endsWith("/interactions")) interactionsLues += 1;
      await new Promise((r) => setTimeout(r, 2));
      try {
        return await base(chemin);
      } finally {
        enCours -= 1;
      }
    };
    const r = await lireCartesDesServices([aSuivre(MKT, "r", "marketing", "Marketing")], mesure);
    expect(max).toBeLessThanOrEqual(LECTURES_SIMULTANEES);
    expect(max).toBeGreaterThan(1);
    expect(interactionsLues).toBe(MAX_TACHES_LUES);
    expect(r.cartes).toHaveLength(MAX_TACHES_LUES);
  });

  it("rien à suivre : aucune lecture", async () => {
    const journal: string[] = [];
    const r = await lireCartesDesServices([], lecteur({ taches: [], cartes: {} }, journal));
    expect(r).toEqual({ cartes: [], indisponible: false });
    expect(journal).toEqual([]);
  });
});
