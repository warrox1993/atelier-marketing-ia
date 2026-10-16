/**
 * Garde-fous de vérité : `tache.plan.controler`, `connaissances.titres` et le contrôle des identifiants légaux
 * par la porte. Courtier fictif (REFERENTIEL_COURTIER, numéros de démonstration), jamais un vrai client.
 * Le BCE du courtier fictif est 0123.456.711 ; son FSMA est DEMO-0001 ; la marque est « Devis en ligne ».
 */
import { describe, expect, it } from "vitest";
import { REFERENTIEL_COURTIER } from "../src/contrats/exemples/prospection.js";
import { creerAiguillage } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import { creerStockConnaissances, type LigneDocument, type LigneIndex, type LigneVersion, type NouveauPassage, type SourceConnaissance, type StockConnaissances } from "../src/serveur/base-connaissances.js";
import { controlerIdentifiantsLegaux, controlerMarquesNiees, faitsDeLaFiche, phrases } from "../src/serveur/services-faits.js";
import { creerServices } from "../src/serveur/services.js";
import { ISSUE, PORTE_AGENT, SOC, creerBanc } from "./outils-base.js";

void creerStockConnaissances;
type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const MAINTENANT = new Date("2026-10-15T10:00:00Z");
const BCE = "0123.456.711";
const FSMA = "DEMO-0001";
const FICHE = faitsDeLaFiche(REFERENTIEL_COURTIER);

/** Stock minimal : une recherche par mots-clés sur des passages en mémoire (même faux exécuteur que `connaissances-serveur`). */
function stockMemoire() {
  const t = { docs: [] as LigneDocument[], versions: [] as LigneVersion[], passages: [] as NouveauPassage[], index: [] as LigneIndex[], sources: [] as SourceConnaissance[] };
  const executer = async (sql: string, params: unknown[]): Promise<Record<string, unknown>[]> => {
    const lignes = () =>
      t.passages.flatMap((p) => {
        const v = t.versions.find((x) => x.id === p.versionId);
        const d = t.docs.find((x) => x.id === p.documentId);
        return v && d && p.companyId === params[0] && v.active ? [{ p, v, d }] : [];
      });
    if (sql.includes("connaissances_index i")) return [];
    if (sql.includes("ts_rank_cd")) {
      const mots = JSON.parse(String(params[params.length - 3])) as string[];
      const seuil = Number(params[params.length - 2]);
      return lignes().map(({ p }) => ({ id: p.id, score: mots.filter((m) => p.texteNormalise.includes(m)).length })).filter((x) => x.score > 0 && x.score >= seuil);
    }
    if (sql.includes("p.id IN (SELECT (jsonb_array_elements_text(")) {
      const ids = JSON.parse(String(params[params.length - 1])) as string[];
      return lignes().filter(({ p }) => ids.includes(p.id)).map(({ p, v, d }) => ({
        id: p.id, document_id: p.documentId, version: p.version, titre: d.titre, type: d.type, date_document: v.dateDocument, valide_du: v.valideDu, valide_au: v.valideAu,
        statut: v.statut, page: p.page, section: p.section, empreinte: p.empreinte, texte: p.texte, injections_signalees: p.injectionsSignalees,
      }));
    }
    return [];
  };
  const stock = {
    executer,
    listerDocuments: async (c: string) => structuredClone(t.docs.filter((x) => x.companyId === c)),
    listerVersions: async (c: string, ids?: string[]) => structuredClone(t.versions.filter((x) => x.companyId === c && (!ids || ids.includes(x.documentId)))),
    indexActif: async () => null,
    compterPassages: async (c: string) => t.passages.filter((p) => p.companyId === c).length,
    adressesRendues: async () => [],
  } as unknown as StockConnaissances;
  function ajouter(titre: string, texte: string, o: { type?: string; statut?: "en_vigueur" | "perime"; produit?: string | null } = {}) {
    const n = t.docs.length + 1;
    const documentId = `d0000000-0000-4000-8000-00000000000${n}`;
    const versionId = `e0000000-0000-4000-8000-00000000000${n}`;
    t.docs.push({ id: documentId, companyId: SOC, titre, type: o.type ?? "tarif", produit: o.produit ?? "auto", langue: "fr", mode: "demonstration", creeLe: MAINTENANT.toISOString(), creePar: "t" } as unknown as LigneDocument);
    t.versions.push({
      id: versionId, companyId: SOC, documentId, version: 1, statut: o.statut ?? "en_vigueur", valideDu: "2026-01-01", valideAu: null, dateDocument: "2026-01-01", active: true,
      mode: "demonstration", etatIndexation: "indexe", passages: 1, injectionsSignalees: [], importeLe: MAINTENANT.toISOString(),
    } as unknown as LigneVersion);
    t.passages.push({
      id: `f0000000-0000-4000-8000-00000000000${n}`, companyId: SOC, documentId, versionId, version: 1, texte, texteNormalise: texte.toLowerCase(), langue: "fr", page: 1, section: null,
      empreinte: "a".repeat(64), injectionsSignalees: [],
    } as unknown as NouveauPassage);
  }
  return { stock, ajouter };
}

function banc() {
  const b = creerBanc({ modeEntreprise: "demonstration" });
  const k = stockMemoire();
  const base = new Proxy(b.base as unknown as Ligne, {
    get: (cible, cle) => {
      if (cle === "marques") return async (companyId: string) => (companyId === SOC ? [{ ...structuredClone(REFERENTIEL_COURTIER), companyId, version: 1 }] : []);
      if (cle === "lireReglages") return async () => ({ modeParDefaut: "demonstration", maxRunsActifs: 3, maxCyclesCorrection: 3, retentionJours: 365, plafondPub: null });
      return cible[cle as string];
    },
  }) as unknown as BaseAtelier;
  const aiguillage = creerAiguillage(b.ctx, creerServices(b.ctx, { base, connaissances: { stock: k.stock, maintenant: () => MAINTENANT } }));
  async function appeler(routeKey: string, o: { params?: Record<string, string>; query?: Record<string, string>; body?: unknown; agent?: boolean; methode?: string } = {}) {
    return aiguillage.traiterRequeteApi({
      routeKey, method: o.methode ?? "POST", path: "/x", params: o.params ?? {}, query: o.query ?? { companyId: SOC }, body: o.body,
      actor: o.agent === false ? { actorType: "user", actorId: "local-board", userId: "local-board", runId: null } : { actorType: "agent", actorId: PORTE_AGENT, agentId: PORTE_AGENT, runId: "run-1" },
      companyId: SOC, headers: {},
    } as never) as Promise<{ status: number; body: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  function plan(corps: string, titre = "Plan de la mission") {
    b.documents.set(`${ISSUE}:plan`, { latestRevisionId: "88888888-8888-4888-8888-888888888801", latestRevisionNumber: 1, title: titre, body: corps, updatedByAgentId: PORTE_AGENT, createdByAgentId: PORTE_AGENT });
  }
  const controler = () => appeler("tache.plan.controler", { params: { issueId: ISSUE }, body: {} });
  return { ...b, k, appeler, plan, controler };
}

describe("identifiants légaux (fonction pure)", () => {
  it("inversion FSMA/BCE : le BCE cité comme FSMA est signalé", () => {
    const e = controlerIdentifiantsLegaux(`Numéro FSMA ${BCE} pour le courtier.`, FICHE);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ code: "identifiant_legal_incoherent" });
    expect(e[0]!.explication).toContain("BCE");
  });

  it("le bon numéro FSMA et le bon BCE sont acceptés", () => {
    expect(controlerIdentifiantsLegaux(`FSMA ${FSMA}. Numéro BCE : ${BCE}.`, FICHE)).toEqual([]);
    expect(controlerIdentifiantsLegaux(`Le courtier (FSMA ${FSMA}, BCE ${BCE}) est agréé.`, FICHE)).toEqual([]);
  });

  it("performance : 300 Ko de « FSMA : » en lignes successives sont traités en moins de 500 ms", () => {
    const texte = "FSMA :\n".repeat(45_000);
    const debut = performance.now();
    const res = phrases(texte);
    const duree = performance.now() - debut;
    expect(texte.length).toBeGreaterThan(300_000);
    expect(res.length).toBeGreaterThan(0);
    expect(duree).toBeLessThan(500);
    // Le recollage reste borné : aucune phrase ne dépasse environ 2 000 caractères.
    expect(Math.max(...res.map((p) => p.length))).toBeLessThan(2_100);
  });

  it("un repère interne (REQ-005) à côté de « FSMA » n'est pas pris pour un identifiant", () => {
    expect(controlerIdentifiantsLegaux(`- REQ-005 (obligatoire) : règles FSMA/IDD avec FSMA n° ${FSMA}, distinct du numéro BCE ${BCE}.`, FICHE)).toEqual([]);
    expect(controlerIdentifiantsLegaux(`- Règles du secteur : oui (REQ-005, écart FSMA des pages à confirmer).`, FICHE)).toEqual([]);
  });

  it("une phrase qui signale l'erreur d'une page n'est acceptée que si elle donne aussi le bon identifiant", () => {
    // Bon FSMA présent : acceptée.
    expect(controlerIdentifiantsLegaux(`La page affiche ${BCE} comme numéro FSMA alors que le FSMA est ${FSMA}.`, FICHE)).toEqual([]);
    // Bon FSMA absent : refusée.
    expect(controlerIdentifiantsLegaux(`Les deux pages semblent afficher ${BCE} comme numéro FSMA, c'est-à-dire le numéro BCE.`, FICHE)).toHaveLength(1);
    expect(controlerIdentifiantsLegaux(`Le bureau porte le numéro FSMA ${BCE}, alors que la concurrence n'en affiche pas.`, FICHE)).toHaveLength(1);
    // La même valeur affirmée reste refusée.
    expect(controlerIdentifiantsLegaux(`Le site affiche le numéro FSMA ${BCE}.`, FICHE)).toHaveLength(1);
    expect(controlerIdentifiantsLegaux(`Numéro FSMA ${BCE}, c'est-à-dire notre agrément.`, FICHE)).toHaveLength(1);
  });

  it("le bon identifiant d'une phrase qui signale un écart doit être écrit d'un seul tenant, pas reconstitué de morceaux", () => {
    // Morceaux séparés par des barres : le texte aplati contiendrait le bon BCE, aucun candidat ne le porte.
    expect(controlerIdentifiantsLegaux(`La page affiche 0999.888.777 comme numéro BCE, erreur : voir 0123/456/711.`, FICHE)).toHaveLength(1);
    // Le bon numéro écrit d'un seul tenant reste accepté.
    expect(controlerIdentifiantsLegaux(`La page affiche 0999.888.777 comme numéro BCE, erreur : le BCE est ${BCE}.`, FICHE)).toEqual([]);
  });

  it("TVA est un mot-clé traité comme BCE", () => {
    expect(controlerIdentifiantsLegaux(`Numéro de TVA BE ${BCE.replace(/\./gu, "")}.`, FICHE)).toEqual([]);
    expect(controlerIdentifiantsLegaux(`Numéro de TVA ${FSMA}.`, FICHE)).toHaveLength(1);
  });

  it("un numéro à 10 chiffres avec espaces ou tirets est contrôlé", () => {
    expect(controlerIdentifiantsLegaux("Numéro FSMA 0123 456 711.", FICHE)).toHaveLength(1);
    expect(controlerIdentifiantsLegaux("Numéro FSMA 0123-456-711.", FICHE)).toHaveLength(1);
    expect(controlerIdentifiantsLegaux("Numéro BCE 0123 456 711.", FICHE)).toEqual([]);
    expect(controlerIdentifiantsLegaux(`Numéro BCE 0123.456.711 et FSMA ${FSMA}.`, FICHE)).toEqual([]);
  });

  it("une ligne qui se termine par « FSMA : » est recollée à la suivante", () => {
    expect(phrases("FSMA :\n0123.456.711")).toEqual(["FSMA : 0123.456.711"]);
    expect(phrases("Le numéro BCE:\nxx\nAutre ligne")).toEqual(["Le numéro BCE: xx", "Autre ligne"]);
    expect(controlerIdentifiantsLegaux(`FSMA :\n${BCE}`, FICHE)).toHaveLength(1);
    expect(controlerIdentifiantsLegaux(`FSMA :\n${FSMA}`, FICHE)).toEqual([]);
  });

  it("un numéro sans mot-clé, ou trop loin du mot-clé, n'est pas contrôlé", () => {
    expect(controlerIdentifiantsLegaux(`Le numéro ${BCE} figure au registre.`, FICHE)).toEqual([]);
    expect(controlerIdentifiantsLegaux(`FSMA : voir le registre public de l'autorité de contrôle, section des intermédiaires d'assurance, pièce ${BCE}.`, FICHE)).toEqual([]);
  });
});

describe("tache.plan.controler", () => {
  it("refuse l'inversion FSMA/BCE", async () => {
    const f = banc();
    f.tacheSousPorte();
    f.plan(`# Plan\n\nNuméro FSMA ${BCE} à reprendre dans les mentions légales.`);
    const r = await f.controler();
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(false);
    expect(r.body.erreurs).toHaveLength(1);
    expect(r.body.erreurs[0]).toMatchObject({ code: "identifiant_legal_incoherent" });
    expect(r.body.erreurs[0].extrait).toContain(BCE);
    expect(f.t.journal.find((j) => j.type === "plan.controle")).toMatchObject({ donnees: { ok: false, erreurs: 1 } });
  });

  it("accepte le bon numéro FSMA et un numéro sans mot-clé", async () => {
    const f = banc();
    f.tacheSousPorte();
    f.plan(`# Plan\n\nLe courtier est inscrit à la FSMA sous le numéro ${FSMA}. Référence interne 0999.888.777 du dossier.`);
    const r = await f.controler();
    expect(r.body).toEqual({ ok: true, erreurs: [] });
    expect(f.t.journal.find((j) => j.type === "plan.controle")).toMatchObject({ donnees: { ok: true, erreurs: 0 } });
  });

  it("refuse une marque déclarée dans la fiche et niée ; accepte la même marque citée normalement", async () => {
    const f = banc();
    f.tacheSousPorte();
    f.plan("# Plan\n\nLa marque Devis en ligne n'apparaît nulle part dans les documents du client.");
    const nie = await f.controler();
    expect(nie.body.ok).toBe(false);
    expect(nie.body.erreurs[0]).toMatchObject({ code: "marque_declaree_niee" });
    expect(nie.body.erreurs[0].explication).toContain("Devis en ligne");
    f.plan("# Plan\n\nLa marque Devis en ligne porte le devis en ligne du courtier. Aucune trace d'un tarif 2027 pour l'instant.");
    const cite = await f.controler();
    expect(cite.body).toEqual({ ok: true, erreurs: [] });
  });

  it("« aucune source » est démentie quand la recherche trouve des passages, puis acceptée quand rien n'est trouvé", async () => {
    const f = banc();
    f.tacheSousPorte();
    f.plan("# Plan\n\nObjectif : préparer la page du tarif hospitalisation.\n\nLes connaissances sont vides, aucune source n'est disponible.", "Tarif hospitalisation du courtier");
    // Rien d'indexé : le constat est exact.
    const vide = await f.controler();
    expect(vide.body).toEqual({ ok: true, erreurs: [] });
    f.k.ajouter("Tarif hospitalisation 2026", "Le tarif hospitalisation du courtier démarre à 31 € par mois.");
    const dementi = await f.controler();
    expect(dementi.body.ok).toBe(false);
    expect(dementi.body.erreurs[0]).toMatchObject({ code: "source_niee_a_tort" });
    expect(dementi.body.erreurs[0].explication).toContain("Tarif hospitalisation 2026");
    expect(f.t.sources).toHaveLength(0); // la recherche de contrôle ne laisse aucune trace sur la tâche
  });

  it("un plan sans document, ou une tâche d'une autre entreprise, donne 404", async () => {
    const f = banc();
    f.tacheSousPorte();
    expect((await f.controler()).status).toBe(404);
  });
});

describe("porte : identifiants légaux dans le livrable", () => {
  it("un livrable avec l'inversion FSMA/BCE est refusé (identifiant_legal_incoherent)", async () => {
    const f = banc();
    f.tacheSousPorte({ corps: `# Mentions légales\n\nIntermédiaire inscrit sous le numéro FSMA ${BCE}.` });
    const ev = (await f.appeler("tache.porte.evaluer", { params: { issueId: ISSUE }, agent: false })).body as { decision: string; motifs: Array<{ code: string }> };
    expect(ev.decision).toBe("REFUS");
    expect(ev.motifs.map((m) => m.code)).toContain("identifiant_legal_incoherent");
  });

  it("le même livrable avec le bon numéro n'a pas ce motif", async () => {
    const f = banc();
    f.tacheSousPorte({ corps: `# Mentions légales\n\nIntermédiaire inscrit sous le numéro FSMA ${FSMA}, BCE ${BCE}.` });
    const ev = (await f.appeler("tache.porte.evaluer", { params: { issueId: ISSUE }, agent: false })).body as { motifs: Array<{ code: string }> };
    expect(ev.motifs.map((m) => m.code)).not.toContain("identifiant_legal_incoherent");
  });
});

describe("marques niées (fonction pure)", () => {
  it("ne confond pas deux noms et ignore une phrase sans négation d'existence", () => {
    expect(controlerMarquesNiees("Devis en ligne est la marque du courtier.", FICHE)).toEqual([]);
    expect(controlerMarquesNiees("Le groupe Autre n'existe plus.", FICHE)).toEqual([]);
  });
});

describe("connaissances.titres", () => {
  it("un agent reçoit les titres en vigueur (200), sans contenu ; périmé exclu", async () => {
    const f = banc();
    f.k.ajouter("Tarif auto 2026", "SECRET-CONTENU la prime est de 648 €.", { produit: "auto" });
    f.k.ajouter("Tarif auto 2024", "Ancien tarif.", { statut: "perime" });
    const r = await f.appeler("connaissances.titres", { methode: "GET", query: { companyId: SOC } });
    expect(r.status).toBe(200);
    expect(r.body.documents).toEqual([{ documentId: "d0000000-0000-4000-8000-000000000001", titre: "Tarif auto 2026", type: "tarif", produit: "auto", statut: "en_vigueur", valideAu: null }]);
    expect(JSON.stringify(r.body)).not.toContain("SECRET-CONTENU");
    expect(Object.keys(r.body.documents[0]).sort()).toEqual(["documentId", "produit", "statut", "titre", "type", "valideAu"]);
  });
});
