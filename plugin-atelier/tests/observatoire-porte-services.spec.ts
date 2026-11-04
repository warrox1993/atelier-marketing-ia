/**
 * Branchement porte / services de l'Observatoire (`services.ts`), à travers l'aiguillage réel et le banc de services.
 * Invariant : une entreprise marketing voit sa porte exactement comme sans Observatoire.
 * Défaut #4 : la langue de la révision se déduit de la clé du livrable (`fiche-<slug>-<fr|en>`).
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { creerAiguillage } from "../src/serveur/atelier.js";
import type { ServiceEntreprise } from "../src/serveur/liaisons/base-liaisons.js";
import { stockLiaisonsParesseux, type StockLiaisons } from "../src/serveur/liaisons/index.js";
import { creerServices } from "../src/serveur/services.js";
import { ISSUE, PORTE_AGENT, SOC, creerBanc } from "./outils-base.js";

const HUMAIN = "local-board";
const FR_COURANT = "rev-fr-2";
const FR_ANCIEN = "rev-fr-1";
const CODE_FR = "Lancer :\n\n```sh\nrea ouvrir binaire\n```\n";
const CORPS_FR = `## Fonctionnement\n${CODE_FR}`;
/** Citation d'une affirmation absente de la base : une entreprise observatoire la refuse (OBS-16). */
const CITATION_INCONNUE = "Texte. [aff:00000000-0000-4000-8000-0000000000ff]\n";

const service = (serviceSlug: string): ServiceEntreprise => ({ companyId: SOC, clientMarqueur: "client-un", serviceSlug, estDirection: false });

/** Service déclaré en mémoire ; tout le reste du bureau de liaison est le stock d'origine. */
function liaisons(ctx: PluginContext, s: ServiceEntreprise): StockLiaisons {
  const origine = stockLiaisonsParesseux(ctx);
  const lues = { serviceDeEntreprise: async () => structuredClone(s), servicesDuClient: async () => [structuredClone(s)] };
  return new Proxy(origine, { get: (cible, cle) => (cle in lues ? lues[cle as keyof typeof lues] : cible[cle as keyof StockLiaisons]) });
}

/** `slug` absent : aucun service déclaré ni base Observatoire (état d'avant l'Observatoire). */
function banc(slug?: string) {
  const b = creerBanc();
  // Base Observatoire vide : aucune affirmation, aucune source.
  if (slug) (b.ctx as unknown as { db: unknown }).db = { namespace: "ns", query: async () => [], execute: async () => 0 };
  const services = creerServices(b.ctx, slug ? { base: b.base, stockLiaisons: liaisons(b.ctx, service(slug)) } : { base: b.base });
  const aiguillage = creerAiguillage(b.ctx, services);
  const livrable = (cle: string, revisionId: string, corps: string) =>
    b.documents.set(`${ISSUE}:${cle}`, { latestRevisionId: revisionId, latestRevisionNumber: 1, title: "Fiche", body: corps, updatedByAgentId: "p", createdByAgentId: "p" });
  const evaluer = async () => {
    const r = (await aiguillage.traiterRequeteApi({
      routeKey: "tache.porte.evaluer", method: "POST", path: "/x", params: { issueId: ISSUE }, query: {}, body: undefined,
      actor: { actorType: "user", actorId: HUMAIN, userId: HUMAIN, runId: null }, companyId: SOC, headers: {},
    } as never)) as { status: number; body: { decision: string; empreinte: string; motifs: Array<{ code: string }> } };
    expect(r.status).toBe(201);
    return { ...r.body, codes: r.body.motifs.map((m) => m.code) };
  };
  /** Pose le livrable sous la clé donnée ; `fr` = révision française courante du même slug (absente si `undefined`). */
  function poser(cle: string, corps: string, fr?: { revisionId: string; corps: string }, cleFr = "fiche-rea-fr") {
    b.tacheSousPorte();
    const porte = b.t.portes[0];
    if (porte) porte.cleLivrable = cle;
    b.documents.delete(`${ISSUE}:livrable`);
    livrable(cle, "rev-courante", corps);
    if (fr) livrable(cleFr, fr.revisionId, fr.corps);
  }
  return { ...b, services, evaluer, poser, aiguillage, AGENT: PORTE_AGENT };
}

describe("entreprise marketing : la porte ne change pas", () => {
  it("mêmes motifs et même empreinte que sans Observatoire, même pour une clé de fiche", async () => {
    const sans = banc();
    sans.poser("fiche-rea-en", `## Operation\n${CITATION_INCONNUE}${CODE_FR}`, { revisionId: FR_COURANT, corps: CORPS_FR });
    const avant = await sans.evaluer();

    const marketing = banc("marketing");
    marketing.poser("fiche-rea-en", `## Operation\n${CITATION_INCONNUE}${CODE_FR}`, { revisionId: FR_COURANT, corps: CORPS_FR });
    const apres = await marketing.evaluer();

    expect(apres.codes).toEqual(avant.codes);
    expect(apres.empreinte).toBe(avant.empreinte);
    expect(apres.codes.filter((c) => c.startsWith("obs_"))).toEqual([]);
  });
});

describe("entreprise observatoire : motifs obs_* et routes", () => {
  it("présente les motifs obs_* (livrable sans citation valide) et enregistre les routes obs.*", async () => {
    const b = banc("observatoire");
    b.poser("fiche-rea-fr", `${CORPS_FR}${CITATION_INCONNUE}`);
    const r = await b.evaluer();
    expect(r.codes.filter((c) => c.startsWith("obs_")).length).toBeGreaterThan(0);
    expect(Object.keys(b.services.routes)).toContain("obs.projet.declarer");
  });

  it("révision française : pas de motif de traduction", async () => {
    const b = banc("observatoire");
    b.poser("fiche-rea-fr", CORPS_FR, { revisionId: FR_COURANT, corps: CORPS_FR });
    const r = await b.evaluer();
    expect(r.codes).not.toContain("obs_traduction_base_perimee");
    expect(r.codes).not.toContain("obs_code_modifie_traduction");
  });

  it("OBS-08 : la base française a changé depuis la traduction", async () => {
    const b = banc("observatoire");
    b.poser("fiche-rea-en", `base_revision_fr: ${FR_ANCIEN}\n\n## Operation\n${CODE_FR}`, { revisionId: FR_COURANT, corps: CORPS_FR });
    expect((await b.evaluer()).codes).toContain("obs_traduction_base_perimee");
  });

  it("OBS-08 : traduction de la base française courante, pas de motif", async () => {
    const b = banc("observatoire");
    b.poser("fiche-rea-en", `base_revision_fr: ${FR_COURANT}\n\n## Operation\n${CODE_FR}`, { revisionId: FR_COURANT, corps: CORPS_FR });
    expect((await b.evaluer()).codes).not.toContain("obs_traduction_base_perimee");
  });

  it("OBS-08 refuse (côté sûr) quand aucune révision française n'existe", async () => {
    const b = banc("observatoire");
    b.poser("fiche-rea-en", `base_revision_fr: ${FR_COURANT}\n\n## Operation\n${CODE_FR}`);
    expect((await b.evaluer()).codes).toContain("obs_traduction_base_perimee");
  });

  it("OBS-09 : une commande traduite est refusée", async () => {
    const b = banc("observatoire");
    b.poser("fiche-rea-en", `base_revision_fr: ${FR_COURANT}\n\n## Operation\n\`\`\`sh\nrea open binary\n\`\`\`\n`, { revisionId: FR_COURANT, corps: CORPS_FR });
    expect((await b.evaluer()).codes).toContain("obs_code_modifie_traduction");
  });

  it("OBS-09 : commande inchangée, pas de motif", async () => {
    const b = banc("observatoire");
    b.poser("fiche-rea-en", `base_revision_fr: ${FR_COURANT}\n\n## Operation\n${CODE_FR}`, { revisionId: FR_COURANT, corps: CORPS_FR });
    expect((await b.evaluer()).codes).not.toContain("obs_code_modifie_traduction");
  });

  it("article FR : les motifs obs_* s'appliquent comme pour une fiche", async () => {
    const b = banc("observatoire");
    b.poser("article-0-rea-fr", `${CORPS_FR}${CITATION_INCONNUE}`);
    expect((await b.evaluer()).codes.filter((c) => c.startsWith("obs_")).length).toBeGreaterThan(0);
  });

  it("article EN sans base française : OBS-08 refuse", async () => {
    const b = banc("observatoire");
    b.poser("article-0-rea-en", `base_revision_fr: ${FR_COURANT}\n\n## Operation\n${CODE_FR}`);
    expect((await b.evaluer()).codes).toContain("obs_traduction_base_perimee");
  });

  it("article EN : la base se lit dans l'article français, pas dans la fiche", async () => {
    const b = banc("observatoire");
    b.poser("article-0-rea-en", `base_revision_fr: ${FR_COURANT}\n\n## Operation\n${CODE_FR}`, { revisionId: FR_COURANT, corps: CORPS_FR }, "article-0-rea-fr");
    expect((await b.evaluer()).codes).not.toContain("obs_traduction_base_perimee");
  });
});

describe("traduction en sous-tâche de la tâche française (une porte par tâche, une langue par porte)", () => {
  const PARENT = "66666666-6666-4666-8666-666666666666";

  /** Tâche courante = sous-tâche `fiche-rea-en` ; la fiche française vit dans la tâche parente. */
  function sousTache(corpsEn: string) {
    const b = banc("observatoire");
    b.poser("fiche-rea-en", corpsEn);
    b.issues.set(PARENT, { id: PARENT, companyId: SOC, projectId: b.issues.get(ISSUE)!.projectId, status: "done", title: "Fiche FR", identifier: "DEM-0" });
    b.issues.get(ISSUE)!.parentId = PARENT;
    b.documents.set(`${PARENT}:fiche-rea-fr`, { latestRevisionId: FR_COURANT, latestRevisionNumber: 2, title: "Fiche", body: CORPS_FR, updatedByAgentId: "p", createdByAgentId: "p" });
    return b;
  }

  it("OBS-08 : la base française se lit dans la tâche parente (base courante, pas de motif)", async () => {
    const b = sousTache(`base_revision_fr: ${FR_COURANT}\n\n## Operation\n${CODE_FR}`);
    expect((await b.evaluer()).codes).not.toContain("obs_traduction_base_perimee");
  });

  it("OBS-08 : la base française de la tâche parente a changé, motif levé", async () => {
    const b = sousTache(`base_revision_fr: ${FR_ANCIEN}\n\n## Operation\n${CODE_FR}`);
    expect((await b.evaluer()).codes).toContain("obs_traduction_base_perimee");
  });

  it("approuvees liste les deux langues : tâche française et sous-tâche anglaise approuvées", async () => {
    const b = sousTache(`base_revision_fr: ${FR_COURANT}\n\n## Operation\n${CODE_FR}`);
    // Base Observatoire factice : le projet « rea » existe, aucune révision n'est encore copiée.
    (b.ctx as unknown as { db: unknown }).db = {
      namespace: "ns", execute: async () => ({ rowCount: 1 }),
      query: async (sql: string) => (sql.includes("obs_projets") ? [{ id: "p1", slug: "rea", nom: "REA", statut_editorial: "brouillon" }] : []),
    };
    for (const [id, cle, rev] of [[PARENT, "fiche-rea-fr", FR_COURANT], [ISSUE, "fiche-rea-en", "rev-courante"]] as const) {
      b.issues.get(id)!.status = "done";
      b.t.portes.push(...(id === PARENT ? [{ ...b.t.portes[0]!, issueId: PARENT, cleLivrable: cle }] : []));
      b.t.decisions.push({ id: `dec-${id}`, companyId: SOC, issueId: id, revisionId: rev, action: "approuver", commentaire: "ok", userId: HUMAIN, portee: null, mode: "demonstration", invalidee: false, creeLe: b.horloge() });
    }
    const r = await b.aiguillage.traiterRequeteApi({
      routeKey: "obs.publications.aexporter", method: "POST", path: "/x", params: {}, query: {}, body: { companyId: SOC },
      actor: { actorType: "user", actorId: HUMAIN, userId: HUMAIN, runId: null }, companyId: SOC, headers: {},
    } as never) as { status: number; body: { copiees: number } };
    expect(r.status).toBe(200);
    expect(r.body.copiees).toBe(2);
  });
});

describe("approuvees : le livrable copié est celui dont l'approbation a été contrôlée", () => {
  it("une révision remplacée entre le contrôle et la lecture n'est jamais copiée", async () => {
    const b = banc("observatoire");
    b.poser("fiche-rea-fr", "# Contrôlée");
    b.issues.get(ISSUE)!.status = "done";
    b.t.decisions.push({ id: "dec-1", companyId: SOC, issueId: ISSUE, revisionId: "rev-courante", action: "approuver", commentaire: "ok", userId: HUMAIN, portee: null, mode: "demonstration", invalidee: false, creeLe: b.horloge() });
    const ecrits: string[] = [];
    (b.ctx as unknown as { db: unknown }).db = {
      namespace: "ns", execute: async (_sql: string, params: unknown[]) => { ecrits.push(JSON.stringify(params)); return { rowCount: 1 }; },
      query: async (sql: string) => (sql.includes("obs_projets") ? [{ id: "p1", slug: "rea", nom: "REA", statut_editorial: "brouillon" }] : []),
    };
    // Première lecture du document : la révision contrôlée ; toutes les suivantes : une révision plus récente, non approuvée.
    const lire = b.ctx.issues.documents.get.bind(b.ctx.issues.documents);
    let lectures = 0;
    (b.ctx.issues.documents as unknown as { get: unknown }).get = async (...a: Parameters<typeof lire>) => {
      const doc = await lire(...a);
      return ++lectures === 1 || !doc ? doc : { ...doc, latestRevisionId: "rev-pirate", latestRevisionNumber: 2, body: "# Pirate" };
    };
    const r = await b.aiguillage.traiterRequeteApi({
      routeKey: "obs.publications.aexporter", method: "POST", path: "/x", params: {}, query: {}, body: { companyId: SOC },
      actor: { actorType: "user", actorId: HUMAIN, userId: HUMAIN, runId: null }, companyId: SOC, headers: {},
    } as never) as { status: number };
    expect(r.status).toBe(200);
    expect(ecrits.some((e) => e.includes("# Pirate"))).toBe(false);
    expect(ecrits.some((e) => e.includes("# Contrôlée"))).toBe(true);
  });
});
