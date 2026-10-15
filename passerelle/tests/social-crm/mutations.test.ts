// Outils de mutation : en démonstration ils PRÉPARENT l'action (« préparée, non exécutée »), ne changent
// rien, et sont nettement séparés des outils de lecture (annotations MCP et préfixe de description).

import { describe, expect, it } from "vitest";
import { SERVICES_SOCIAL_CRM } from "../../src/demo/social-crm/enregistrer.js";
import { MENTION_DEMONSTRATION } from "../../src/services.js";
import { appeler, catalogueDe, donnees, SEPTEMBRE } from "./aide.js";

const CONTACT = (await donnees("crm", "crm_contacts", { ...SEPTEMBRE, limit: 1 })).results[0];
const ID = CONTACT.id as string;
const UUID_CONTACT = (await donnees("teamleader", "teamleader_contacts", { ...SEPTEMBRE, page: { size: 1, number: 1 } })).data[0].id as string;

/** Un appel de mutation valide par outil. */
const MUTATIONS: ReadonlyArray<[service: string, outil: string, args: Record<string, unknown>, destructif: boolean]> = [
  ["facebook", "facebook_publier", { message: "Test de publication" }, true],
  ["facebook", "facebook_envoyer_message", { destinataire: "1234567890", texte: "Bonjour" }, true],
  ["instagram", "instagram_publier", { caption: "Légende", image_url: "https://renovation-liege.example/image.jpg" }, true],
  ["linkedin", "linkedin_publier", { commentary: "Publication de test" }, true],
  ["crm", "crm_modifier_contact", { contact_id: ID, properties: { lifecyclestage: "customer" } }, false],
  ["pipedrive", "pipedrive_modifier_personne", { id: Number(ID), champs: { name: "Autre Nom" } }, false],
  ["odoo", "odoo_ecrire_lead", { ids: [Number(ID)], values: { stage_id: 4 } }, false],
  ["teamleader", "teamleader_modifier_contact", { id: UUID_CONTACT, modifications: { last_name: "Autre" } }, false],
];

/** Lecture complète de chaque service avant et après les mutations. */
async function instantane() {
  return {
    hubspot: await donnees("crm", "crm_contacts", { ...SEPTEMBRE, limit: 100 }),
    deals: await donnees("crm", "crm_transactions", { ...SEPTEMBRE, limit: 100 }),
    pipedrive: await donnees("pipedrive", "pipedrive_personnes", { ...SEPTEMBRE, limit: 500 }),
    odoo: await donnees("odoo", "odoo_leads_search_read", { ...SEPTEMBRE, limit: 500 }),
    teamleader: await donnees("teamleader", "teamleader_contacts", { ...SEPTEMBRE, page: { size: 100, number: 1 } }),
    facebook: await donnees("facebook", "facebook_publications", { ...SEPTEMBRE, limit: 100 }),
    instagram: await donnees("instagram", "instagram_medias", { ...SEPTEMBRE, limit: 100 }),
    linkedin: await donnees("linkedin", "linkedin_publications", { ...SEPTEMBRE, count: 100 }),
  };
}

describe("mutations préparées, jamais exécutées", () => {
  it.each(MUTATIONS)("%s / %s : état « preparee », executee false, mention présente", async (service, outil, args) => {
    const res = await appeler(service, outil, args);
    expect(res.isError, JSON.stringify(res.structuredContent)).toBeFalsy();
    const texte = (res.content[0] as { text: string }).text;
    expect(texte.startsWith(MENTION_DEMONSTRATION)).toBe(true);
    expect(res.structuredContent).toMatchObject({
      etat: "preparee",
      executee: false,
      approbation_humaine_requise: true,
      action: { service, outil, parametres: args },
      _atelier: { mode: "demonstration", mention: MENTION_DEMONSTRATION },
    });
    expect((res.structuredContent as any).message).toMatch(/^Action préparée, non exécutée : /);
    expect((res.structuredContent as any).action.requete_reelle_visee).toBeTruthy();
  });

  it("aucun outil de mutation ne change quoi que ce soit : toutes les lectures sont identiques avant et après", async () => {
    const avant = await instantane();
    for (const [service, outil, args] of MUTATIONS) await appeler(service, outil, args);
    for (const [service, outil, args] of MUTATIONS) await appeler(service, outil, args); // idempotent aussi
    expect(await instantane()).toEqual(avant);
  });

  it("les mutations visant un objet inexistant ou une propriété en lecture seule échouent, sans rien préparer", async () => {
    const echecs: Array<[string, string, Record<string, unknown>]> = [
      ["crm", "crm_modifier_contact", { contact_id: "99999999999999", properties: { lifecyclestage: "customer" } }],
      ["crm", "crm_modifier_contact", { contact_id: ID, properties: { hs_object_id: "1" } }],
      ["crm", "crm_modifier_contact", { contact_id: ID, properties: {} }],
      ["pipedrive", "pipedrive_modifier_personne", { id: 5, champs: { name: "X" } }],
      ["odoo", "odoo_ecrire_lead", { ids: [Number(ID), 7], values: { name: "X" } }],
      ["teamleader", "teamleader_modifier_contact", { id: "11111111-1111-4111-8111-111111111111", modifications: { first_name: "X" } }],
    ];
    for (const [service, outil, args] of echecs) {
      const res = await appeler(service, outil, args);
      expect(res.isError, `${outil} ${JSON.stringify(args)}`).toBe(true);
      expect(res.structuredContent).not.toHaveProperty("etat");
      expect((res.content[0] as { text: string }).text.startsWith(MENTION_DEMONSTRATION)).toBe(true);
    }
  });

  it("les arguments invalides sont refusés (message vide, URL mal formée)", async () => {
    expect((await appeler("facebook", "facebook_publier", { message: "" })).isError).toBe(true);
    expect((await appeler("instagram", "instagram_publier", { caption: "x", image_url: "pas une url" })).isError).toBe(true);
    expect((await appeler("linkedin", "linkedin_publier", { commentary: "x".repeat(3001) })).isError).toBe(true);
  });
});

describe("séparation lecture / mutation", () => {
  const MUTATIONS_ATTENDUES = new Set(MUTATIONS.map(([, outil]) => outil));

  it.each(SERVICES_SOCIAL_CRM.map((s) => [s]))("%s : chaque outil est soit une lecture, soit une mutation, jamais les deux", (service) => {
    const outils = [...catalogueDe(service).outils.values()].filter((o) => o.nom !== "atelier_identite");
    expect(outils.length).toBeGreaterThanOrEqual(2);
    for (const outil of outils) {
      if (MUTATIONS_ATTENDUES.has(outil.nom)) {
        expect(outil.description.startsWith("MUTATION")).toBe(true);
        expect(outil.annotations?.readOnlyHint).toBe(false);
        expect(outil.annotations?.openWorldHint).toBe(true);
      } else {
        expect(outil.description.startsWith("LECTURE")).toBe(true);
        expect(outil.annotations?.readOnlyHint).toBe(true);
        expect(outil.annotations?.destructiveHint).toBeUndefined();
      }
    }
  });

  it("les publications et messages sont destructifs ; les modifications de contact ne le sont pas ; chaque service a au moins une mutation", () => {
    for (const [service, outil, , destructif] of MUTATIONS) {
      expect(catalogueDe(service).outils.get(outil)!.annotations?.destructiveHint, outil).toBe(destructif);
    }
    for (const service of SERVICES_SOCIAL_CRM) {
      expect([...catalogueDe(service).outils.keys()].some((nom) => MUTATIONS_ATTENDUES.has(nom)), service).toBe(true);
    }
  });
});
