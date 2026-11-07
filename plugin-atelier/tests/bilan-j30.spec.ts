/**
 * Bilan J+30 créé en code à la diffusion réellement confirmée (route `tache.diffusions.issue`) : une tâche, pas de doublon,
 * rien pour une diffusion simulée, préparée, à réconcilier ou refusée.
 */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { ORIGINE_BILAN, dateBilan, mesureAttendue } from "../src/serveur/bilan-j30.js";
import { creerServices } from "../src/serveur/services.js";
import { cleIdempotenceSignee, empreinteAppel } from "../src/serveur/signatures.js";
import { ISSUE, PORTE_AGENT, PRODUCTEUR, PROJET, REV1, SOC, creerBanc } from "./outils-base.js";
import { emballer, paireEd25519, passerelle } from "./outils-passerelle.js";

const P = await passerelle();
const PLUGIN = paireEd25519();
const GW = paireEd25519();
const SIGNATAIRE = new P.SignataireEnveloppe(GW.privee);
const CORPS = "# Publication LinkedIn\n\nNouveau chantier à Seraing : toiture terminée en 3 jours.\n";
const ARGS = { commentary: "Nouveau chantier à Seraing : toiture terminée en 3 jours." };
const PORTEE = { revisionId: REV1, action: "publier" as const, canal: "linkedin", compte: "urn:li:organization:42", audience: null, montantMaxCents: null, dureeJours: 30 };
const APPEL = { id: "aaaaaaaa-0000-4000-8000-000000000001", service: "linkedin", outil: "linkedin_publier", compte: "urn:li:organization:42", empreinte: empreinteAppel({ service: "linkedin", outil: "linkedin_publier", compte: "urn:li:organization:42", arguments: ARGS }) };
const producteur: ActeurHote = { type: "agent", id: PRODUCTEUR, agentId: PRODUCTEUR, userId: null, runId: "run-1" };

function banc(o: { mesure?: boolean } = {}) {
  const b = creerBanc({
    mode: "reel", modeEntreprise: "reel", secret: PLUGIN.priveePem,
    config: { approbationClePrivee: { type: "secret_ref", secretId: "11111111-2222-4333-8444-555555555555" }, passerelleClesPubliques: [GW.publiqueBase64], ...(o.mesure === false ? {} : { rolesAgents: { mesure: PORTE_AGENT } }) },
  });
  b.tacheSousPorte({ status: "done", etape: null, corps: CORPS });
  b.passe();
  b.decision({ portee: { ...PORTEE, appel: APPEL }, mode: "reel" });
  b.issues.get(ISSUE)!.identifier = "ABC-5";
  return { ...b, services: creerServices(b.ctx, { base: b.base }) };
}
type Banc = ReturnType<typeof banc>;
const appeler = (b: Banc, cle: string, corps: unknown, params: Record<string, string> = { issueId: ISSUE }) =>
  b.services.routes[cle as "tache.diffusions"]!({ cle: cle as never, params, query: {}, companyId: SOC, acteur: producteur, corps });
const demande = { revisionId: REV1, action: "publier", canal: "linkedin", compte: "urn:li:organization:42", cleIdempotence: "linkedin-publication-1", service: "linkedin", outil: "linkedin_publier", arguments: ARGS };
const diffuser = async (b: Banc) => ((await appeler(b, "tache.diffusions", demande)).corps as { id: string });
const reponse = (id: string, etat: string) =>
  emballer(SIGNATAIRE, "reel", { etat, executee: etat === "executee", message: `Action ${etat}`, cle_idempotence: cleIdempotenceSignee(id), action: { service: "linkedin", outil: "linkedin_publier", parametres: ARGS } },
    { service: "linkedin", outil: "linkedin_publier", compte: "urn:li:organization:42", args: ARGS, ecriture: true });
const rapporter = (b: Banc, id: string, etat: string) => appeler(b, "tache.diffusions.issue", { reponse: reponse(id, etat) }, { issueId: ISSUE, diffusionId: id });
const bilans = (b: Banc) => [...b.issues.values()].filter((i) => i.originKind === ORIGINE_BILAN);

describe("mesure attendue : donnée déclarée, bornée", () => {
  it("coupe à 300 caractères et ajoute « … » ; court : intact ; vide : non précisée", () => {
    expect(mesureAttendue(["x".repeat(500)])).toBe(`${"x".repeat(300)}…`);
    expect(mesureAttendue(["a", "b"])).toBe("a ; b");
    expect(mesureAttendue([])).toBe("non précisée");
  });
});

describe("bilan J+30 à la diffusion confirmée", () => {
  it("approbation et diffusion préparée, sans confirmation : aucun bilan", async () => {
    const b = banc();
    await diffuser(b);
    expect(bilans(b)).toHaveLength(0);
  });

  it("diffusion confirmée : une tâche pour l'agent Mesure, en backlog, racine, titre et description au format attendu", async () => {
    const b = banc();
    const d = await diffuser(b);
    const avant = Date.now();
    await rapporter(b, d.id, "executee");
    const [bilan] = bilans(b);
    expect(bilans(b)).toHaveLength(1);
    const date = dateBilan(new Date(avant));
    expect(bilan).toMatchObject({ companyId: SOC, projectId: PROJET, status: "backlog", assigneeAgentId: PORTE_AGENT, originId: `bilan-j30:${d.id}` });
    expect(bilan!.parentId).toBeUndefined();
    expect(bilan!.title).toMatch(/^Bilan J\+30 de .+ \(à partir du \d{4}-\d{2}-\d{2}\)$/u);
    expect(bilan!.title).toContain(`(à partir du ${date})`);
    expect(bilan!.description).toBe(`Tâche de la campagne : ABC-5. Canal : linkedin. Diffusion : ${d.id}. Mesure attendue (donnée déclarée) : non précisée.`);
  });

  it("rejeu de la confirmation : pas de doublon", async () => {
    const b = banc();
    const d = await diffuser(b);
    await rapporter(b, d.id, "executee");
    await expect(rapporter(b, d.id, "executee")).rejects.toMatchObject({ code: "conflit" });
    expect(bilans(b)).toHaveLength(1);
  });

  it("à réconcilier : rien ; puis confirmée : un bilan", async () => {
    const b = banc();
    const d = await diffuser(b);
    await rapporter(b, d.id, "ambigue_a_reconcilier");
    expect(bilans(b)).toHaveLength(0);
    await rapporter(b, d.id, "executee");
    expect(bilans(b)).toHaveLength(1);
  });

  it("sans agent Mesure : aucune tâche, trace dans le journal, la confirmation aboutit", async () => {
    const b = banc({ mesure: false });
    const d = await diffuser(b);
    expect((await rapporter(b, d.id, "executee")).corps).toMatchObject({ etat: "confirmee" });
    expect(bilans(b)).toHaveLength(0);
    expect(b.t.journal.map((j) => j.type)).toContain("diffusion.bilan_sans_mesure");
  });

  it("dateBilan : confirmation + 30 jours", () => {
    expect(dateBilan(new Date("2026-11-07T10:00:00Z"))).toBe("2026-12-07");
    expect(dateBilan(new Date("2026-12-15T23:59:00Z"))).toBe("2027-01-14");
  });
});
