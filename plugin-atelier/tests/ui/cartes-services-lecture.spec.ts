/**
 * Lecture des cartes des services par l'interface : sous-tâches, ordre chronologique, plafonds, concurrence, cloisonnement.
 * Lecteur de l'hôte simulé (aucun réseau).
 */
import { describe, expect, it } from "vitest";
import { lireCartesDesServices, MAX_INTERACTIONS_LUES, MAX_TACHES_LUES, TACHES_OUVERTES_LUES, type LecteurHote } from "../../src/ui/cartes-services-lecture.js";
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
    if (liste && !parent) {
      const statuts = (new URLSearchParams(requete).get("status") ?? "").split(",");
      return h.taches.filter((t) => t.companyId === liste[1] && (statuts[0] === "" || statuts.includes(t.status)));
    }
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

  it("au plus six lectures simultanées ; 30 tâches de la descendance au plus ; les tâches avec parent ne sont pas relues en supplément", async () => {
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
    // Seule la racine n'a pas de parent et elle est déjà lue : 30 lectures, jamais les 20 sous-tâches au-delà du plafond.
    expect(interactionsLues).toBe(MAX_TACHES_LUES);
    expect(r.cartes).toHaveLength(MAX_TACHES_LUES);
  });

  it("rien à suivre : aucune lecture", async () => {
    const journal: string[] = [];
    const r = await lireCartesDesServices([], lecteur({ taches: [], cartes: {} }, journal));
    expect(r).toEqual({ cartes: [], indisponible: false });
    expect(journal).toEqual([]);
  });

  it("une carte sur une tâche ouverte SANS parent du service (hors descendance de la tâche reçue) apparaît, sans doublon avec les tâches déjà lues", async () => {
    const h: Hote = {
      taches: [tache("t1", MKT, "MKT-9"), tache("t2", MKT, "MKT-10", { parentId: "t1" }), tache("o1", MKT, "MKT-8"), tache("f1", MKT, "MKT-7", { status: "done" }), tache("e1", ETR, "ETR-1")],
      cartes: { t1: [carte("a", "2026-10-18T10:05:00Z")], t2: [carte("b", "2026-10-18T10:06:00Z")], o1: [carte("c", "2026-10-18T10:07:00Z", { title: "Valider la liste ABC-8" })], f1: [carte("d", "2026-10-18T10:08:00Z")], e1: [carte("x", "2026-10-18T10:09:00Z")] },
    };
    const journal: string[] = [];
    const r = await lireCartesDesServices([aSuivre(MKT, "t1", "marketing", "Marketing"), aSuivre(MKT, "t1", "marketing", "Marketing")], lecteur(h, journal));
    expect(r.cartes.map((c) => c.element.id).sort()).toEqual(["question:a", "question:b", "question:c"]);
    expect(r.cartes.find((c) => c.element.id === "question:c")!.tache).toBe("MKT-8");
    // Chaque tâche n'est lue qu'une fois (pas de doublon) et l'autre entreprise n'est jamais interrogée.
    expect(journal.filter((c) => c.endsWith("/interactions")).sort()).toEqual(["/issues/o1/interactions", "/issues/t1/interactions", "/issues/t2/interactions"]);
    expect(journal.filter((c) => c.includes("status=")).length).toBe(1);
    expect(journal.some((c) => c.includes(ETR) || c.includes("e1"))).toBe(false);
  });

  it("plafond : au plus 40 tâches ouvertes lues en plus par entreprise, les plus récentes d'abord", async () => {
    const taches = [tache("r", MKT, "MKT-1"), ...Array.from({ length: 60 }, (_, i) => tache(`o${i}`, MKT, `MKT-${i + 2}`, { updatedAt: `2026-10-18T10:${String(i).padStart(2, "0")}:00Z` }))];
    const h: Hote = { taches, cartes: Object.fromEntries(taches.map((t) => [t.id, [carte(`c-${t.id}`, "2026-10-18T10:00:00Z")]])) };
    const journal: string[] = [];
    const r = await lireCartesDesServices([aSuivre(MKT, "r", "marketing", "Marketing")], lecteur(h, journal));
    const lues = journal.filter((c) => c.endsWith("/interactions"));
    expect(lues).toHaveLength(1 + TACHES_OUVERTES_LUES);
    expect(lues).toContain("/issues/o59/interactions");
    expect(lues).not.toContain("/issues/o0/interactions");
    expect(r.cartes).toHaveLength(1 + TACHES_OUVERTES_LUES);
  });

  it("seules les tâches sans parent sont lues en supplément : une sous-tâche d'une autre racine est ignorée", async () => {
    const h: Hote = {
      taches: [tache("r", MKT, "MKT-1"), tache("a", MKT, "MKT-2"), tache("b", MKT, "MKT-3", { parentId: "a" })],
      cartes: { r: [carte("cr", "2026-10-18T10:00:00Z")], a: [carte("ca", "2026-10-18T10:01:00Z")], b: [carte("cb", "2026-10-18T10:02:00Z")] },
    };
    const journal: string[] = [];
    await lireCartesDesServices([aSuivre(MKT, "r", "marketing", "Marketing")], lecteur(h, journal));
    const lues = journal.filter((c) => c.endsWith("/interactions")).sort();
    expect(lues).toEqual(["/issues/a/interactions", "/issues/r/interactions"]);
  });

  it("plafond GLOBAL : au plus 60 lectures d'interactions par interrogation, toutes entreprises confondues", async () => {
    const taches = [
      tache("r1", MKT, "MKT-1"),
      tache("r2", JUR, "JUR-1"),
      ...Array.from({ length: 40 }, (_, i) => tache(`m${i}`, MKT, `MKT-${i + 2}`, { updatedAt: `2026-10-18T10:${String(i).padStart(2, "0")}:00Z` })),
      ...Array.from({ length: 40 }, (_, i) => tache(`j${i}`, JUR, `JUR-${i + 2}`, { updatedAt: `2026-10-18T10:${String(i).padStart(2, "0")}:00Z` })),
    ];
    const h: Hote = { taches, cartes: Object.fromEntries(taches.map((t) => [t.id, [carte(`c-${t.id}`, "2026-10-18T10:00:00Z")]])) };
    const journal: string[] = [];
    const r = await lireCartesDesServices([aSuivre(MKT, "r1", "marketing", "Marketing"), aSuivre(JUR, "r2", "juridique", "Juridique")], lecteur(h, journal));
    const lues = journal.filter((c) => c.endsWith("/interactions"));
    // Sans plafond global : 2 racines + 40 + 40 = 82 lectures.
    expect(lues).toHaveLength(MAX_INTERACTIONS_LUES);
    expect(r.cartes).toHaveLength(MAX_INTERACTIONS_LUES);
  });
});
