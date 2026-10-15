// Parcours complet avec le client MCP officiel du SDK sur une vraie passerelle lancée en test :
// OAuth de démonstration, liste des outils, appels de lecture et de mutation, mention sur chaque réponse.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MENTION_DEMONSTRATION } from "../../src/services.js";
import { demarrer, obtenirJetons, type PasserelleDeTest } from "../aide.js";
import { registreSocialCrm, SEPTEMBRE } from "./aide.js";

const OUTILS_ATTENDUS: Record<string, string[]> = {
  facebook: ["facebook_publications", "facebook_insights_page", "facebook_publier", "facebook_envoyer_message"],
  instagram: ["instagram_medias", "instagram_insights_media", "instagram_publier"],
  linkedin: ["linkedin_publications", "linkedin_statistiques", "linkedin_publier"],
  crm: ["crm_contacts", "crm_transactions", "crm_modifier_contact"],
  pipedrive: ["pipedrive_personnes", "pipedrive_affaires", "pipedrive_modifier_personne"],
  odoo: ["odoo_leads_search_read", "odoo_ecrire_lead"],
  teamleader: ["teamleader_contacts", "teamleader_deals", "teamleader_modifier_contact"],
};

/** Premier appel de lecture de chaque service, et le champ qui doit contenir des données. */
const LECTURES: Record<string, [outil: string, args: Record<string, unknown>, extraire: (s: any) => unknown[]]> = {
  facebook: ["facebook_publications", { ...SEPTEMBRE, limit: 3 }, (s) => s.data],
  instagram: ["instagram_medias", { ...SEPTEMBRE, limit: 3 }, (s) => s.data],
  linkedin: ["linkedin_publications", { ...SEPTEMBRE, count: 3 }, (s) => s.elements],
  crm: ["crm_contacts", { ...SEPTEMBRE, limit: 3 }, (s) => s.results],
  pipedrive: ["pipedrive_personnes", { ...SEPTEMBRE, limit: 3 }, (s) => s.data],
  odoo: ["odoo_leads_search_read", { ...SEPTEMBRE, limit: 3 }, (s) => s.result],
  teamleader: ["teamleader_contacts", { ...SEPTEMBRE, page: { size: 3, number: 1 } }, (s) => s.data],
};

describe("client MCP officiel sur la passerelle (sept services)", () => {
  let p: PasserelleDeTest;
  beforeAll(async () => {
    p = await demarrer({ registre: registreSocialCrm() });
  });
  afterAll(async () => {
    await p.arreter();
  });

  async function connecter(service: string): Promise<Client> {
    const propriete = registreSocialCrm().fiche(service)!.proprietesDemo[0]!.id;
    const jetons = await obtenirJetons(p.url, service, propriete);
    const client = new Client({ name: "test-l7", version: "0.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${p.url}/mcp/${service}`), { requestInit: { headers: { authorization: `Bearer ${jetons.access_token}` } } }));
    return client;
  }

  it("/sante annonce les sept services", async () => {
    const sante = (await (await fetch(`${p.url}/sante`)).json()) as { services: string[] };
    for (const service of Object.keys(OUTILS_ATTENDUS)) expect(sante.services).toContain(service);
  });

  it.each(Object.keys(OUTILS_ATTENDUS).map((s) => [s]))("%s : catalogue, lecture, mutation, mention", async (service) => {
    const client = await connecter(service);
    try {
      const { tools } = await client.listTools();
      const noms = tools.map((t) => t.name).sort();
      expect(noms).toEqual(["atelier_identite", ...OUTILS_ATTENDUS[service]!].sort());
      // les annotations traversent le protocole : lecture seule d'un côté, écriture de l'autre
      for (const t of tools.filter((t) => t.name !== "atelier_identite")) {
        const mutation = /_(publier|envoyer_message|modifier_\w+|ecrire_lead)$/.test(t.name);
        expect(t.annotations?.readOnlyHint, t.name).toBe(!mutation);
        expect(t.description?.startsWith(mutation ? "MUTATION" : "LECTURE"), t.name).toBe(true);
      }

      const identite = await client.callTool({ name: "atelier_identite", arguments: {} });
      expect((identite.structuredContent as any).mode).toBe("demonstration");

      const [outil, args, extraire] = LECTURES[service]!;
      const lecture = await client.callTool({ name: outil, arguments: args });
      expect(lecture.isError).toBeFalsy();
      expect((lecture.content as Array<{ text: string }>)[0]!.text.startsWith(MENTION_DEMONSTRATION)).toBe(true);
      expect((lecture.structuredContent as any)._atelier).toEqual({ mode: "demonstration", mention: MENTION_DEMONSTRATION });
      expect(extraire(lecture.structuredContent).length).toBe(3);

      const nomMutation = OUTILS_ATTENDUS[service]!.find((n) => /_(publier|envoyer_message|modifier_\w+|ecrire_lead)$/.test(n))!;
      const argsMutation = await argumentsMutation(client, service, nomMutation);
      const mutation = await client.callTool({ name: nomMutation, arguments: argsMutation });
      expect(mutation.isError, JSON.stringify(mutation.structuredContent)).toBeFalsy();
      expect(mutation.structuredContent).toMatchObject({ etat: "preparee", executee: false });
      expect((mutation.content as Array<{ text: string }>)[0]!.text.startsWith(MENTION_DEMONSTRATION)).toBe(true);

      // erreur d'outil : la mention est aussi présente, et le serveur reste utilisable ensuite
      const erreur = await client.callTool({ name: outil, arguments: { debut: "2026-10-01", fin: "2026-09-01" } });
      expect(erreur.isError).toBe(true);
      expect((erreur.content as Array<{ text: string }>)[0]!.text.startsWith(MENTION_DEMONSTRATION)).toBe(true);
      expect((await client.callTool({ name: outil, arguments: args })).isError).toBeFalsy();
    } finally {
      await client.close();
    }
  });

  /** Arguments valides d'une mutation, en relisant un vrai identifiant par le même client. */
  async function argumentsMutation(client: Client, service: string, outil: string): Promise<Record<string, unknown>> {
    const [nomLecture, argsLecture] = LECTURES[service]!;
    const lu = (await client.callTool({ name: nomLecture, arguments: { ...argsLecture } })).structuredContent as any;
    switch (outil) {
      case "facebook_publier": return { message: "Publication de test" };
      case "facebook_envoyer_message": return { destinataire: "1234567890", texte: "Bonjour" };
      case "instagram_publier": return { caption: "Légende", image_url: "https://renovation-liege.example/image.jpg" };
      case "linkedin_publier": return { commentary: "Publication de test" };
      case "crm_modifier_contact": return { contact_id: lu.results[0].id, properties: { lifecyclestage: "customer" } };
      case "pipedrive_modifier_personne": return { id: lu.data[0].id, champs: { name: "Autre Nom" } };
      case "odoo_ecrire_lead": return { ids: [lu.result[0].id], values: { name: "Autre" } };
      case "teamleader_modifier_contact": return { id: lu.data[0].id, modifications: { last_name: "Autre" } };
      default: throw new Error(`mutation inconnue : ${outil}`);
    }
  }
});
