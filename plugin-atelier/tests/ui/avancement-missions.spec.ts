/** Avancement des missions : classement des sous-tâches par agent puis par titre, états des phases, ordre des missions. */
import { describe, expect, it } from "vitest";
import {
  annoncePhase,
  avancementMission,
  avancements,
  classerTache,
  etatDesTaches,
  phaseDepuisAgent,
  phaseDepuisTitre,
  type AgentMission,
  type MissionLue,
  type TacheMission,
} from "../../src/ui/avancement-missions.js";

const ag = (id: string, nom: string, cle: string, role = "general"): AgentMission => ({ id, nom, cle, role });
const AGENTS: AgentMission[] = [
  ag("a-strat", "Stratège", "stratege"),
  ag("a-pro", "Prospection", "prospection"),
  ag("a-cont", "Contenus", "contenus"),
  ag("a-veil", "Veille", "veille"),
  ag("a-seo", "SEO local GEO", "seo-local-geo"),
  ag("a-sea", "SEA", "sea"),
  ag("a-rs", "Réseaux sociaux", "r-seaux-sociaux"),
  ag("a-crm", "CRM conversion", "crm-conversion"),
  ag("a-coo", "Enrichissement coordonnées", "enrichissement-coordonn-es"),
  ag("a-rel", "Relecteur", "relecteur"),
  ag("a-conf", "Conformité publicitaire", "conformit-publicitaire"),
  ag("a-test", "Tests techniques", "tests-techniques"),
  ag("a-porte", "Porte", "porte"),
  ag("a-ceo", "Coordinateur", "coordinateur", "ceo"),
];
const t = (n: number, status: string, titre: string, agentId: string | null, maj: string | null = null): TacheMission => ({ id: `t${n}`, identifier: `SVC-${n}`, title: titre, status, agentId, maj });
const mission = (racine: TacheMission, filles: TacheMission[], agents = AGENTS): MissionLue => ({ companyId: "c1", slug: "service", nom: "Service", racine, filles, agents });

describe("classement par agent", () => {
  it.each([
    ["Stratège", "stratege", "strategie"],
    ["Prospection", "prospection", "production"],
    ["Contenus", "contenus", "production"],
    ["Veille", "veille", "production"],
    ["SEO local GEO", "seo-local-geo", "production"],
    ["SEA", "sea", "production"],
    ["Réseaux sociaux", "r-seaux-sociaux", "production"],
    ["CRM conversion", "crm-conversion", "production"],
    ["Enrichissement coordonnées", "enrichissement-coordonn-es", "coordonnees"],
    ["Relecteur", "relecteur", "revue"],
    ["Conformité publicitaire", "conformit-publicitaire", "revue"],
    ["Tests techniques", "tests-techniques", "controles"],
    ["Porte", "porte", "controles"],
  ] as const)("%s -> %s", (nom, cle, phase) => {
    expect(phaseDepuisAgent({ nom, cle })).toBe(phase);
    expect(phaseDepuisAgent({ nom: "Inconnu", cle })).toBe(phase);
  });
  it("agent inconnu ou absent : null", () => {
    expect(phaseDepuisAgent({ nom: "Gardien des connexions", cle: "gardien-des-connexions" })).toBeNull();
    expect(phaseDepuisAgent(null)).toBeNull();
    expect(phaseDepuisAgent({ nom: "Seaborg", cle: null })).toBeNull();
  });
});

describe("repli sur le titre", () => {
  it.each([
    ["Prospection réelle : praticiens", "production"],
    ["Revue indépendante du livrable", "revue"],
    ["Contrôle des URL sources du livrable", "controles"],
    ["Coordonnées : numéros professionnels", "coordonnees"],
    ["Revue finale : liste complétée", "revue"],
    ["Contrôle final des URL", "controles"],
    ["Définir la stratégie du trimestre", "strategie"],
  ] as const)("%s -> %s", (titre, phase) => expect(phaseDepuisTitre(titre)).toBe(phase));
  it("rien de reconnu : null, et classerTache retombe sur Production", () => {
    expect(phaseDepuisTitre("Divers")).toBeNull();
    expect(classerTache({ title: "Divers", agentId: null }, new Map())).toBe("production");
  });
  it("l'agent reconnu l'emporte sur le titre", () => {
    expect(classerTache({ title: "Contrôle de quelque chose", agentId: "a-rel" }, new Map(AGENTS.map((a) => [a.id, a])))).toBe("revue");
  });
});

describe("états", () => {
  it("faite, en cours, attend, à venir", () => {
    expect(etatDesTaches([], false)).toBe("a_venir");
    expect(etatDesTaches([{ status: "done" }, { status: "cancelled" }], false)).toBe("faite");
    for (const s of ["in_progress", "todo", "in_review"]) expect(etatDesTaches([{ status: "done" }, { status: s }], false)).toBe("en_cours");
    expect(etatDesTaches([{ status: "done" }, { status: "in_progress" }], true)).toBe("attend_decision");
  });
  it("une carte en attente sur une tâche déjà terminée ne bloque pas la phase", () => {
    expect(etatDesTaches([{ status: "done" }], true)).toBe("faite");
  });
});

describe("avancementMission : le cas réel (six sous-tâches)", () => {
  const racine = t(9, "in_progress", "Mission : relecture du livrable", "a-ceo");
  const filles = [
    t(10, "done", "Prospection réelle : praticiens", "a-pro", "2026-10-21T10:00:00Z"),
    t(11, "done", "Revue indépendante du livrable", "a-rel", "2026-10-21T11:00:00Z"),
    t(12, "done", "Contrôle des URL sources du livrable", "a-test", "2026-10-21T11:30:00Z"),
    t(13, "in_progress", "Coordonnées : numéros professionnels", "a-coo", "2026-10-21T12:00:00Z"),
    t(14, "todo", "Revue finale : liste complétée", "a-rel", "2026-10-21T12:10:00Z"),
    t(15, "todo", "Contrôle final des URL", "a-porte", "2026-10-21T12:20:00Z"),
  ];
  const av = avancementMission(mission(racine, filles));
  const etats = Object.fromEntries(av.phases.map((p) => [p.id, p.etat]));
  it("classe les tâches et calcule chaque phase", () => {
    expect(av.phases.map((p) => p.id)).toEqual(["strategie", "production", "coordonnees", "revue", "controles", "reponse"]);
    expect(etats).toEqual({ strategie: "non_prevue", production: "faite", coordonnees: "en_cours", revue: "en_cours", controles: "en_cours", reponse: "a_venir" });
    expect(av.phases.map((p) => p.taches.length)).toEqual([0, 1, 1, 2, 2, 0]);
  });
  it("dernière activité par phase et lien de chaque tâche", () => {
    expect(av.phases.find((p) => p.id === "revue")!.derniere).toBe("2026-10-21T12:10:00Z");
    expect(av.phases.find((p) => p.id === "revue")!.taches[0]).toMatchObject({ agentNom: "Relecteur", lien: "/SVC/issues/SVC-11" });
  });
  it("annonce lue : « Revue : en cours, 2 tâches »", () => {
    expect(annoncePhase(av.phases.find((p) => p.id === "revue")!)).toBe("Revue : en cours, 2 tâches");
    expect(annoncePhase(av.phases[5]!)).toBe("Réponse : à venir");
    expect(av.phases[5]!.derniere).toBeNull();
  });
  it("une carte en attente sur une tâche de la phase la fait passer à « attend votre décision »", () => {
    const a = avancementMission(mission(racine, filles), new Set(["SVC-14"]));
    expect(a.phases.find((p) => p.id === "revue")!.etat).toBe("attend_decision");
    expect(a.phases.find((p) => p.id === "controles")!.etat).toBe("en_cours");
  });
});

describe("Réponse et fin de mission", () => {
  it("mission terminée : Réponse faite, phases vides non prévues", () => {
    const a = avancementMission(mission(t(1, "done", "Mission", "a-ceo"), [t(2, "done", "Prospection", "a-pro")]));
    expect(a.terminee).toBe(true);
    expect(a.phases.map((p) => p.etat)).toEqual(["non_prevue", "faite", "non_prevue", "non_prevue", "non_prevue", "faite"]);
  });
  it("tout le travail fait mais mission pas close : la Réponse est en cours", () => {
    const a = avancementMission(mission(t(1, "in_progress", "Mission", "a-ceo"), [t(2, "done", "Prospection", "a-pro"), t(3, "cancelled", "Revue", "a-rel")]));
    expect(a.phases.find((p) => p.id === "reponse")!.etat).toBe("en_cours");
  });
  it("carte en attente sur la mission : la Réponse attend votre décision", () => {
    const a = avancementMission(mission(t(1, "in_review", "Mission", "a-ceo"), [t(2, "done", "Prospection", "a-pro")]), new Set(["SVC-1"]));
    expect(a.phases.find((p) => p.id === "reponse")!.etat).toBe("attend_decision");
  });
  it("sans sous-tâche : tout est à venir, rien n'est inventé", () => {
    const a = avancementMission(mission(t(1, "todo", "Mission", "a-ceo"), []));
    expect(a.phases.map((p) => p.etat)).toEqual(["a_venir", "a_venir", "a_venir", "a_venir", "a_venir", "a_venir"]);
  });
  it("sans la liste des agents, le titre sert de repli", () => {
    const a = avancementMission(mission(t(1, "todo", "Mission", null), [t(2, "todo", "Revue finale", "inconnu")], []));
    expect(a.phases.find((p) => p.id === "revue")!.taches).toHaveLength(1);
  });
});

describe("avancements", () => {
  it("sépare en cours et terminées, la plus récemment active d'abord ; une mission annulée n'est pas en cours", () => {
    const ancienne = mission({ ...t(1, "in_progress", "A", null), maj: "2026-10-20T00:00:00Z" }, []);
    const recente = mission({ ...t(5, "in_progress", "B", null), maj: "2026-10-21T00:00:00Z" }, []);
    const close = mission(t(7, "done", "C", null), []);
    const annulee = mission(t(8, "cancelled", "D", null), []);
    const r = avancements([ancienne, recente, close, annulee]);
    expect(r.enCours.map((m) => m.racine.title)).toEqual(["B", "A"]);
    expect(r.terminees.map((m) => m.racine.title)).toEqual(["C"]);
  });
});
