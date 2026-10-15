// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXEMPLES_DONNEES } from "../../src/contrats/exemples/index.js";
import { AppelPropose, DossierHumain, Diffusion } from "../../src/contrats/dossier.js";
import { PageAtelier } from "../../src/ui/index.js";
import { canalDePasserelle, etatDiffusionReelle, porteeDepuisAppel, raisonRevocation, revocable } from "../../src/ui/vues/appels.js";
import { diffusionParAgent } from "../../src/ui/vues/contenus.js";
import { champParLibelle, cliquer, ENTREPRISE, installerPont, parTexte, radio, rendre, saisir, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
const T = "44444444-4444-4444-8444-444444444444";
const R2 = "55555555-5555-4555-8555-555555555552";
const R1 = "55555555-5555-4555-8555-555555555551";
const EMP_FB = "a".repeat(32) + "0123456789abcdef".repeat(2);
const EMP_CRM = "b".repeat(32) + "fedcba9876543210".repeat(2);
const EMP_OLD = "c".repeat(64);
const LONG_TEXTE = `Toitures avant l'hiver : ${"un texte très long qui doit rester entier jusqu'au dernier mot. ".repeat(12)}FIN-DU-TEXTE`;
const LIEN = "https://exemple.be/nos-etablissements?utm_source=facebook&utm_campaign=toitures-avant-l-hiver&ref=0123456789abcdef";

const base = DossierHumain.parse(EXEMPLES_DONNEES["atelier.dossier"]);

function appel(extra: Partial<AppelPropose> & { id: string; empreinte: string }): AppelPropose {
  return AppelPropose.parse({
    issueId: T,
    revisionId: R2,
    service: "facebook",
    outil: "facebook_publier",
    action: "publier",
    compte: "Page Rénovations Meuse",
    arguments: { message: LONG_TEXTE, link: LIEN },
    apercu: {
      resume: "Publier sur la page Facebook « Rénovations Meuse »",
      cibles: [{ champ: "compte", libelle: "Compte", valeur: "Page Rénovations Meuse" }],
      textes: [
        { champ: "message", libelle: "Texte publié", valeur: LONG_TEXTE },
        { champ: "link", libelle: "Lien publié", valeur: LIEN },
      ],
      proprietes: [],
    },
    approbation: { id: extra.id, service: extra.service ?? "facebook", outil: extra.outil ?? "facebook_publier", compte: extra.compte ?? "Page Rénovations Meuse", empreinte: extra.empreinte },
    revisionCourante: true,
    proposePar: "Agent contenus",
    creeLe: "2026-10-15T10:00:00.000Z",
    ...extra,
  });
}

const A_FB = appel({ id: "88888888-8888-4888-8888-888888888881", empreinte: EMP_FB });
const A_CRM = appel({
  id: "88888888-8888-4888-8888-888888888882",
  empreinte: EMP_CRM,
  service: "crm",
  outil: "crm_modifier_contact",
  action: "modifier_crm",
  compte: "Portail HubSpot",
  arguments: { contact_id: "501", properties: { hs_lead_status: "OPEN_DEAL", lifecyclestage: "customer" } },
  apercu: {
    resume: "Modifier la fiche contact 501",
    cibles: [{ champ: "contact_id", libelle: "Contact modifié", valeur: "501" }],
    textes: [],
    proprietes: [
      { champ: "properties.hs_lead_status", libelle: "Propriété", valeur: "OPEN_DEAL" },
      { champ: "properties.lifecyclestage", libelle: "Propriété", valeur: "customer" },
    ],
  },
});
const A_ANCIEN = appel({ id: "88888888-8888-4888-8888-888888888883", empreinte: EMP_OLD, revisionId: R1, revisionCourante: false });

function avecAppels(...appels: AppelPropose[]): DossierHumain {
  return { ...base, appelsProposes: appels };
}

function diffusion(extra: Partial<Diffusion> = {}): Diffusion {
  return Diffusion.parse({
    id: "99999999-9999-4999-8999-999999999991", companyId: base.companyId, issueId: T, revisionId: R2, decisionId: null, action: "publier", canal: "facebook", compte: "Page Rénovations Meuse",
    montantCents: null, etat: "preparee", cleIdempotence: "agent-cle-0001", motifRefus: null, mode: "reel", creeLe: "2026-10-15T10:00:00.000Z", service: "facebook", outil: "facebook_publier", ...extra,
  });
}
const APPROBATION_REELLE = {
  id: "77777777-7777-4777-8777-777777777777", companyId: base.companyId, issueId: T, revisionId: R2, action: "approuver" as const, commentaire: "OK", userId: "local-board",
  portee: { revisionId: R2, action: "publier" as const, canal: "facebook", compte: "Page Rénovations Meuse", audience: null, montantMaxCents: null, dureeJours: null, appel: A_FB.approbation },
  invalidee: false, mode: "reel" as const, creeLe: "2026-10-15T10:00:00.000Z",
};
const reel = (diffusions: Diffusion[] = []): DossierHumain => ({ ...base, mode: "reel", connecteurPublication: true, decisions: [APPROBATION_REELLE], diffusions });

describe("appels : règles pures", () => {
  it("la portée vient de l'appel : action, compte et appel recopiés, canal du service", () => {
    const p = porteeDepuisAppel(A_FB, { canal: "site", audience: " Public ", duree: "30" });
    expect(p).toEqual({ revisionId: R2, action: "publier", canal: "facebook", compte: "Page Rénovations Meuse", audience: "Public", montantMaxCents: null, dureeJours: 30, appel: A_FB.approbation });
  });
  it("modification du CRM : ni audience ni montant, canal crm ou hubspot", () => {
    const p = porteeDepuisAppel(A_CRM, { canal: "hubspot", audience: "ignorée", duree: "" });
    expect(p).toMatchObject({ action: "modifier_crm", canal: "hubspot", audience: null, montantMaxCents: null, dureeJours: null });
    expect(porteeDepuisAppel(A_CRM, { canal: "site", audience: "", duree: "" }).canal).toBe("crm");
  });
  it("canaux de la passerelle reconnus, site et autres exclus", () => {
    expect(["facebook", "HubSpot", "odoo"].every(canalDePasserelle)).toBe(true);
    expect(canalDePasserelle("site")).toBe(false);
    expect(canalDePasserelle(null)).toBe(false);
  });
  it("états d'une diffusion réelle : préparée, preuve émise, confirmée, ambiguë, expirée, révoquée", () => {
    const now = Date.parse("2026-10-15T12:00:00.000Z");
    const futur = Math.floor(now / 1000) + 3600;
    expect(etatDiffusionReelle(diffusion(), now).libelle).toBe("Préparée");
    expect(etatDiffusionReelle(diffusion({ preuveExpire: futur }), now).libelle).toBe("Preuve émise");
    expect(etatDiffusionReelle(diffusion({ preuveExpire: futur - 7200 }), now).libelle).toBe("Preuve expirée");
    expect(etatDiffusionReelle(diffusion({ preuveExpire: futur, revocation: { le: "2026-10-15T11:00:00.000Z", motif: "x" } }), now).libelle).toBe("Preuve révoquée");
    expect(etatDiffusionReelle(diffusion({ etat: "confirmee" }), now).libelle).toBe("Confirmée");
    expect(etatDiffusionReelle(diffusion({ etat: "ambigue_a_reconcilier" }), now).libelle).toBe("Ambiguë");
  });
  it("révocation : seulement une preuve remise, non révoquée, d'une diffusion réelle préparée ; motif de 3 à 500", () => {
    expect(revocable(diffusion({ preuveExpire: 1 }))).toBe(true);
    expect(revocable(diffusion())).toBe(false);
    expect(revocable(diffusion({ preuveExpire: 1, revocation: { le: "2026-10-15T11:00:00.000Z", motif: "x" } }))).toBe(false);
    expect(revocable(diffusion({ preuveExpire: 1, etat: "confirmee" }))).toBe(false);
    expect(revocable(diffusion({ preuveExpire: 1, mode: "demonstration" }))).toBe(false);
    expect(raisonRevocation("  ab ")).not.toBeNull();
    expect(raisonRevocation("abc")).toBeNull();
    expect(raisonRevocation("x".repeat(501))).not.toBeNull();
  });
  it("diffusion par l'agent : réel et canal de la passerelle seulement", () => {
    expect(diffusionParAgent(reel())).toBe(true);
    expect(diffusionParAgent({ ...reel(), mode: "demonstration" })).toBe(false);
    expect(diffusionParAgent({ ...reel(), decisions: [{ ...APPROBATION_REELLE, portee: { ...APPROBATION_REELLE.portee, canal: "site", appel: null } }] })).toBe(false);
  });
});

let pont: Pont;
let rendu: Rendu | null = null;
beforeEach(() => {
  pont = installerPont();
});
afterEach(() => {
  expect(pont.violations).toEqual([]);
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

async function dossier(d: DossierHumain) {
  pont.donnees["atelier.dossier"] = { data: d, loading: false, error: null };
  pont.chemin = `/RNO/atelier/contenus/${T}`;
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  return rendu.conteneur;
}

describe("dossier : appels proposés affichés sans troncature", () => {
  it("texte, lien, cibles, propriétés (noms et valeurs) et empreinte complète", async () => {
    const c = await dossier(avecAppels(A_FB, A_CRM));
    const section = parTexte(c, "section", "Appels proposés");
    expect(section.textContent).toContain(LONG_TEXTE);
    expect(section.textContent).toContain(LIEN);
    expect(section.textContent).toContain("Page Rénovations Meuse");
    expect(section.querySelector(`[data-empreinte="${EMP_FB}"]`)?.textContent).toBe(EMP_FB);
    expect(section.textContent).toContain("properties.hs_lead_status");
    expect(section.textContent).toContain("OPEN_DEAL");
    expect(section.textContent).toContain("lifecyclestage");
    expect(section.textContent).toContain("customer");
    expect(section.textContent).toContain("Contact modifié");
    expect(section.textContent).not.toContain("…");
    // Le lien n'est jamais cliquable : l'adresse complète est lue, pas suivie.
    expect(section.querySelector("a")).toBeNull();
  });
  it("un appel d'une ancienne révision est grisé et non approuvable", async () => {
    const c = await dossier(avecAppels(A_FB, A_ANCIEN));
    const cartes = Array.from(c.querySelectorAll(".atl-appel"));
    expect(cartes).toHaveLength(2);
    const ancien = cartes.find((x) => x.querySelector(`[data-empreinte="${EMP_OLD}"]`))!;
    expect(ancien.getAttribute("data-ancien")).toBe("true");
    expect(ancien.textContent).toContain("Ancienne révision : non approuvable");
    await saisir(champParLibelle(c, "Action autorisée"), "publier");
    const choix = parTexte(c, "fieldset", "Appel exact à approuver");
    expect(choix.textContent).toContain(EMP_FB);
    expect(choix.textContent).not.toContain(EMP_OLD);
  });
  it("sans appel proposé : le dossier le dit", async () => {
    const c = await dossier(base);
    expect(parTexte(c, "section", "Appels proposés").textContent).toContain("aucune preuve ne pourra être signée");
    await saisir(champParLibelle(c, "Action autorisée"), "publier");
    expect(c.querySelector('[data-sans-appel="true"]')?.textContent).toContain("L'agent doit d'abord proposer l'appel exact");
  });
});

describe("décision : l'humain approuve l'appel exact", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "done" }), { status: 200 })));
  });

  it("l'approbation recopie appel.approbation dans portee.appel, avec une portée cohérente", async () => {
    pont.actions["atelier.decision"] = async (p) => ({ id: "d", ...p });
    const c = await dossier(avecAppels(A_FB, A_CRM));
    await saisir(champParLibelle(c, "Commentaire"), "Texte relu mot à mot.");
    await saisir(champParLibelle(c, "Action autorisée"), "publier");
    const bouton = parTexte(c, "button", "Enregistrer : approuver");
    // Choisir l'appel est obligatoire : sans choix, le bouton reste désactivé avec sa raison.
    expect(bouton.getAttribute("aria-disabled")).toBe("true");
    expect(c.textContent).toContain("Choisissez l'appel exact à approuver");
    await cliquer(radio(c, "Publier sur la page Facebook"));
    expect(bouton.getAttribute("aria-disabled")).toBeNull();
    await cliquer(bouton);
    const a = pont.appelsActions.find((x) => x.cle === "atelier.decision");
    expect(a?.params).toMatchObject({ issueId: T, revisionId: R2, action: "approuver", portee: { revisionId: R2, action: "publier", canal: "facebook", compte: "Page Rénovations Meuse", audience: null, montantMaxCents: null, appel: A_FB.approbation } });
    expect((a?.params as { portee: { appel: unknown } }).portee.appel).toEqual({ id: A_FB.id, service: "facebook", outil: "facebook_publier", compte: "Page Rénovations Meuse", empreinte: EMP_FB });
  });

  it("modification du CRM : ni audience ni montant proposés ni envoyés", async () => {
    const c = await dossier(avecAppels(A_FB, A_CRM));
    await saisir(champParLibelle(c, "Commentaire"), "Fiche contrôlée.");
    await saisir(champParLibelle(c, "Action autorisée"), "modifier_crm");
    // Seul l'appel CRM est proposé pour cette action.
    expect(parTexte(c, "fieldset", "Appel exact à approuver").textContent).not.toContain("Publier sur la page Facebook");
    await cliquer(radio(c, "Modifier la fiche contact 501"));
    const portee = c.querySelector('[data-portee-appel="true"]')!;
    expect(portee.textContent).not.toContain("Audience");
    expect(portee.textContent).not.toContain("Montant");
    await saisir(champParLibelle(c, "Canal"), "hubspot");
    await cliquer(parTexte(c, "button", "Enregistrer : approuver"));
    const a = pont.appelsActions.find((x) => x.cle === "atelier.decision");
    expect((a?.params as { portee: unknown }).portee).toMatchObject({ action: "modifier_crm", canal: "hubspot", compte: "Portail HubSpot", audience: null, montantMaxCents: null, appel: A_CRM.approbation });
  });

  it("« sans appel » est un choix explicite et garde l'ancienne portée, sans appel", async () => {
    const c = await dossier(avecAppels(A_FB));
    await saisir(champParLibelle(c, "Commentaire"), "Sans preuve.");
    await saisir(champParLibelle(c, "Action autorisée"), "publier");
    await cliquer(radio(c, "Sans appel"));
    await cliquer(parTexte(c, "button", "Enregistrer : approuver"));
    const a = pont.appelsActions.find((x) => x.cle === "atelier.decision");
    expect((a?.params as { portee: Record<string, unknown> }).portee.appel).toBeUndefined();
  });
});

describe("diffusion : en réel, c'est l'agent qui diffuse", () => {
  it("aucun bouton « Diffuser » pour un canal de la passerelle, état affiché à la place", async () => {
    const c = await dossier(reel([diffusion({ preuveExpire: Math.floor(Date.now() / 1000) + 3600 })]));
    const section = parTexte(c, "section", "Diffusion");
    expect(Array.from(section.querySelectorAll("button")).some((b) => b.textContent === "Diffuser")).toBe(false);
    expect(section.textContent).toContain("l'agent qui diffuse");
    expect(section.textContent).toContain("Preuve émise");
    expect(section.textContent).toContain("Preuve valable jusqu'au");
    expect(pont.appelsActions).toEqual([]);
  });
  it("aucune diffusion demandée : l'agent n'a pas encore agi", async () => {
    const c = await dossier(reel());
    expect(parTexte(c, "section", "Diffusion").textContent).toContain("Aucune diffusion demandée pour l'instant");
  });
  it("démonstration : le bouton « Diffuser » est inchangé", async () => {
    const c = await dossier({ ...base, decisions: [{ ...APPROBATION_REELLE, mode: "demonstration", portee: { ...APPROBATION_REELLE.portee, canal: "site", appel: null } }] });
    const bouton = parTexte(c, "button", "Diffuser");
    expect(bouton.getAttribute("aria-disabled")).toBeNull();
  });
});

describe("preuve : expiration, révocation et bouton « Révoquer la preuve »", () => {
  it("révocation avec motif obligatoire : atelier.diffusion.revoquer { issueId, diffusionId, motif }", async () => {
    pont.actions["atelier.diffusion.revoquer"] = async () => diffusion();
    const f = diffusion({ preuveExpire: Math.floor(Date.now() / 1000) + 3600 });
    const c = await dossier(reel([f]));
    const bouton = parTexte(c, "button", "Révoquer la preuve");
    expect(bouton.getAttribute("aria-disabled")).toBe("true");
    expect(c.textContent).toContain("Motif obligatoire");
    await cliquer(bouton);
    expect(pont.appelsActions).toEqual([]);
    await saisir(champParLibelle(c, "Motif de la révocation (obligatoire)"), "  Le texte a changé côté client.  ");
    expect(bouton.getAttribute("aria-disabled")).toBeNull();
    await cliquer(bouton);
    expect(pont.appelsActions).toEqual([{ cle: "atelier.diffusion.revoquer", params: { issueId: T, diffusionId: f.id, motif: "Le texte a changé côté client." } }]);
    expect(c.textContent).toContain("Preuve révoquée.");
  });
  it("preuve révoquée : date et motif affichés, plus de bouton", async () => {
    const f = diffusion({ preuveExpire: Math.floor(Date.now() / 1000) + 3600, revocation: { le: "2026-10-15T11:00:00.000Z", motif: "Nouvelle révision du livrable" } });
    const c = await dossier(reel([f]));
    const section = parTexte(c, "section", "Diffusion");
    expect(section.textContent).toContain("Preuve révoquée");
    expect(section.querySelector('[data-revocation="true"]')?.textContent).toContain("Nouvelle révision du livrable");
    expect(Array.from(section.querySelectorAll("button")).some((b) => b.textContent === "Révoquer la preuve")).toBe(false);
  });
  it("sans preuve remise : pas de bouton de révocation", async () => {
    const c = await dossier(reel([diffusion()]));
    expect(Array.from(c.querySelectorAll("button")).some((b) => b.textContent === "Révoquer la preuve")).toBe(false);
  });
});
