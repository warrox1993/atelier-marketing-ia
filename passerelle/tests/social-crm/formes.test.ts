// Forme des réponses : chaque outil de lecture renvoie la structure de l'API qu'il imite
// (noms de champs relevés dans la documentation officielle du 15/10/2026, voir docs/passerelle.md).

import { describe, expect, it } from "vitest";
import * as z from "zod";
import { donnees, SEPTEMBRE } from "./aide.js";

const chaine = z.string().min(1);
const entier = z.number().int().nonnegative();
const pagingGraph = z.object({
  cursors: z.object({ before: chaine, after: chaine }),
  next: z.string().url().optional(),
  previous: z.string().url().optional(),
});
const periodeFb = { ...SEPTEMBRE, limit: 5 };

describe("Facebook : forme Graph API", () => {
  it("facebook_publications : data[] et paging", async () => {
    const r = await donnees("facebook", "facebook_publications", periodeFb);
    const schema = z.strictObject({
      data: z.array(z.strictObject({
        id: z.string().regex(/^\d+_\d+$/),
        message: chaine,
        created_time: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+0000$/),
        link: z.string().url(),
        reactions: z.strictObject({ data: z.array(z.never()), summary: z.strictObject({ total_count: entier, viewer_reaction: z.literal("NONE") }) }),
        comments: z.strictObject({ data: z.array(z.never()), summary: z.strictObject({ order: z.string(), total_count: entier, can_comment: z.boolean() }) }),
        shares: z.strictObject({ count: entier }),
      })).length(5),
      paging: pagingGraph.extend({ next: z.string().url() }),
    });
    schema.parse(r);
  });

  it("facebook_insights_page : name, period, values[{value, end_time}], title, description, id", async () => {
    const r = await donnees("facebook", "facebook_insights_page", { ...SEPTEMBRE });
    z.strictObject({
      data: z.array(z.strictObject({
        name: z.enum(["page_media_view", "page_total_media_view_unique"]),
        period: z.literal("day"),
        values: z.array(z.strictObject({ value: entier, end_time: z.string().regex(/^\d{4}-\d{2}-\d{2}T00:00:00\+0000$/) })).length(30),
        title: chaine,
        description: chaine,
        id: z.string().regex(/^100000000000001\/insights\/page_(media_view|total_media_view_unique)\/day$/),
      })).length(2),
    }).parse(r);
  });

  it("page_impressions (métrique retirée) est refusée", async () => {
    const { appeler } = await import("./aide.js");
    const res = await appeler("facebook", "facebook_insights_page", { ...SEPTEMBRE, metric: ["page_impressions"] });
    expect(res.isError).toBe(true);
  });
});

describe("Instagram : forme Graph API", () => {
  it("instagram_medias et instagram_insights_media", async () => {
    const m = await donnees("instagram", "instagram_medias", { ...SEPTEMBRE, limit: 3 });
    z.strictObject({
      data: z.array(z.strictObject({ id: z.string().regex(/^\d+$/), caption: chaine, timestamp: chaine, like_count: entier, comments_count: entier })).length(3),
      paging: pagingGraph.extend({ next: z.string().url() }),
    }).parse(m);
    const i = await donnees("instagram", "instagram_insights_media", { media_id: m.data[0].id });
    z.strictObject({
      data: z.array(z.strictObject({
        name: z.enum(["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"]),
        period: z.literal("lifetime"),
        values: z.array(z.strictObject({ value: entier })).length(1),
        title: chaine,
        description: chaine,
        id: z.string().startsWith(`${m.data[0].id}/insights/`),
      })).length(7),
    }).parse(i);
  });
});

describe("LinkedIn : forme Posts API et statistiques de partage", () => {
  it("linkedin_publications : elements[] et paging {start, count, links}", async () => {
    const r = await donnees("linkedin", "linkedin_publications", { ...SEPTEMBRE, count: 2 });
    z.strictObject({
      paging: z.strictObject({ start: z.literal(0), count: z.literal(2), links: z.array(z.strictObject({ type: z.string(), rel: z.literal("next"), href: z.string() })).length(1) }),
      elements: z.array(z.strictObject({
        lifecycleState: z.literal("PUBLISHED"),
        lastModifiedAt: z.number().int(),
        visibility: z.literal("PUBLIC"),
        publishedAt: z.number().int(),
        author: z.string().startsWith("urn:li:organization:"),
        distribution: z.strictObject({ feedDistribution: z.literal("MAIN_FEED"), targetEntities: z.array(z.never()), thirdPartyDistributionChannels: z.array(z.never()) }),
        content: z.strictObject({}),
        lifecycleStateInfo: z.strictObject({ isEditedByAuthor: z.literal(false) }),
        isReshareDisabledByAuthor: z.literal(false),
        createdAt: z.number().int(),
        id: z.string().startsWith("urn:li:share:"),
        commentary: chaine,
      })).length(2),
    }).parse(r);
  });

  it("linkedin_statistiques : total, jour, mois, publication", async () => {
    const stats = z.strictObject({
      clickCount: entier, commentCount: entier, engagement: z.number().min(0).max(1), impressionCount: entier,
      likeCount: entier, shareCount: entier, uniqueImpressionsCount: entier,
    });
    const total = await donnees("linkedin", "linkedin_statistiques", { ...SEPTEMBRE });
    z.strictObject({
      paging: z.strictObject({ count: z.number(), start: z.number() }),
      elements: z.array(z.strictObject({ totalShareStatistics: stats, organizationalEntity: z.string().startsWith("urn:li:organization:") })).length(1),
    }).parse(total);

    const jours = await donnees("linkedin", "linkedin_statistiques", { ...SEPTEMBRE, granularite: "DAY" });
    z.strictObject({
      paging: z.strictObject({ count: z.number(), start: z.number() }),
      elements: z.array(z.strictObject({ timeRange: z.strictObject({ start: z.number(), end: z.number() }), totalShareStatistics: stats, organizationalEntity: z.string() })).length(30),
    }).parse(jours);

    const posts = await donnees("linkedin", "linkedin_publications", { ...SEPTEMBRE });
    const parPartage = await donnees("linkedin", "linkedin_statistiques", { ...SEPTEMBRE, partages: [posts.elements[0].id] });
    z.strictObject({
      paging: z.strictObject({ count: z.number(), start: z.number(), links: z.array(z.never()) }),
      elements: z.array(z.strictObject({ organizationalEntity: z.string(), share: z.string(), totalShareStatistics: stats })).length(1),
    }).parse(parPartage);
  });
});

describe("CRM : formes HubSpot, Pipedrive, Odoo, Teamleader", () => {
  it("HubSpot : results[] {id, properties, createdAt, updatedAt, archived} et paging.next.after", async () => {
    const c = await donnees("crm", "crm_contacts", { ...SEPTEMBRE, limit: 3 });
    z.strictObject({
      results: z.array(z.strictObject({
        id: z.string().regex(/^\d+$/),
        properties: z.strictObject({
          createdate: z.string(), email: z.string().includes("@"), firstname: chaine, lastname: chaine, phone: chaine, city: chaine, zip: chaine,
          lifecyclestage: z.enum(["lead", "salesqualifiedlead", "opportunity", "customer"]),
          hs_lead_status: z.string().nullable(), hs_analytics_source: chaine, hs_object_id: chaine, lastmodifieddate: z.string(),
          etablissement: z.string().nullable(), metier: chaine,
        }),
        createdAt: z.string(), updatedAt: z.string(), archived: z.literal(false),
      })).length(3),
      paging: z.strictObject({ next: z.strictObject({ after: z.string(), link: z.string().url() }) }),
    }).parse(c);

    const d = await donnees("crm", "crm_transactions", { ...SEPTEMBRE, limit: 3 });
    z.strictObject({
      results: z.array(z.strictObject({
        id: z.string(),
        properties: z.strictObject({
          dealname: chaine, amount: z.string().regex(/^\d+$/), dealstage: z.enum(["contractsent", "closedwon", "closedlost"]), pipeline: z.literal("default"),
          createdate: z.string(), closedate: z.string().nullable(), hs_lastmodifieddate: z.string(), hs_object_id: z.string(), etablissement: chaine, metier: chaine,
        }),
        createdAt: z.string(), updatedAt: z.string(), archived: z.literal(false),
        associations: z.strictObject({ contacts: z.strictObject({ results: z.array(z.strictObject({ id: z.string(), type: z.literal("deal_to_contact") })).length(1) }) }),
      })).length(3),
      paging: z.object({ next: z.object({ after: z.string(), link: z.string() }) }),
    }).parse(d);
  });

  it("Pipedrive : success, data[], additional_data.pagination", async () => {
    const pagination = z.strictObject({ start: z.number(), limit: z.number(), more_items_in_collection: z.boolean(), next_start: z.number().optional() });
    const p = await donnees("pipedrive", "pipedrive_personnes", { ...SEPTEMBRE, limit: 2 });
    z.strictObject({
      success: z.literal(true),
      data: z.array(z.strictObject({
        id: z.number(), name: chaine, first_name: chaine, last_name: chaine,
        email: z.array(z.strictObject({ value: z.string(), primary: z.boolean(), label: z.string() })),
        phone: z.array(z.strictObject({ value: z.string(), primary: z.boolean(), label: z.string() })),
        add_time: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/), update_time: z.string(),
        etablissement: z.string().nullable(), metier: chaine, localite: chaine, code_postal: chaine,
      })).length(2),
      additional_data: z.strictObject({ pagination: pagination.extend({ more_items_in_collection: z.literal(true), next_start: z.literal(2) }) }),
    }).parse(p);

    const d = await donnees("pipedrive", "pipedrive_affaires", { ...SEPTEMBRE, limit: 2 });
    z.strictObject({
      success: z.literal(true),
      data: z.array(z.strictObject({
        id: z.number(), title: chaine, value: z.number(), currency: z.literal("EUR"), status: z.enum(["open", "won", "lost"]),
        pipeline_id: z.number(), stage_id: z.number(), person_id: z.number(), add_time: z.string(), update_time: z.string(),
        close_time: z.string().nullable(), won_time: z.string().nullable(), lost_time: z.string().nullable(), etablissement: chaine, metier: chaine,
      })).length(2),
      additional_data: z.strictObject({ pagination }),
    }).parse(d);
  });

  it("Odoo : enveloppe JSON-RPC {jsonrpc, id, result[]} avec many2one [id, nom] et false pour le vide", async () => {
    const o = await donnees("odoo", "odoo_leads_search_read", { ...SEPTEMBRE, limit: 4, id: 7 });
    z.strictObject({
      jsonrpc: z.literal("2.0"),
      id: z.literal(7),
      result: z.array(z.looseObject({
        id: z.number(), name: chaine, type: z.enum(["lead", "opportunity"]), contact_name: chaine, partner_name: z.literal(false),
        email_from: z.string(), phone: z.string(), city: z.string(), zip: z.string(),
        stage_id: z.tuple([z.number(), z.string()]), expected_revenue: z.number(),
        create_date: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/), date_closed: z.union([z.literal(false), z.string()]),
        won_status: z.enum(["pending", "won", "lost"]), active: z.literal(true), user_id: z.literal(false), team_id: z.literal(false), partner_id: z.literal(false),
      })).length(4),
    }).parse(o);
  });

  it("Odoo : fields réduit la réponse à `id` et aux champs demandés", async () => {
    const o = await donnees("odoo", "odoo_leads_search_read", { ...SEPTEMBRE, limit: 2, fields: ["name", "stage_id"] });
    for (const r of o.result) expect(Object.keys(r).sort()).toEqual(["id", "name", "stage_id"]);
  });

  it("Teamleader : { data: [...] } avec les champs documentés", async () => {
    const c = await donnees("teamleader", "teamleader_contacts", { ...SEPTEMBRE, page: { size: 3, number: 1 } });
    const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    z.strictObject({
      data: z.array(z.strictObject({
        id: uuid, first_name: chaine, last_name: chaine,
        emails: z.array(z.strictObject({ type: z.literal("primary"), email: z.string() })).length(1),
        telephones: z.array(z.strictObject({ type: z.literal("phone"), number: z.string() })).length(1),
        added_at: z.string().regex(/\+00:00$/), updated_at: z.string().regex(/\+00:00$/),
      })).length(3),
    }).parse(c);
    const d = await donnees("teamleader", "teamleader_deals", { ...SEPTEMBRE, page: { size: 3, number: 1 } });
    z.strictObject({
      data: z.array(z.strictObject({
        id: uuid, title: chaine, status: z.enum(["open", "won", "lost"]),
        lead: z.strictObject({ customer: z.strictObject({ type: z.literal("contact"), id: uuid }), contact_person: z.null() }),
        estimated_value: z.strictObject({ amount: z.number(), currency: z.literal("EUR") }),
        current_phase: z.strictObject({ type: z.literal("dealPhase"), id: uuid }),
        closed_at: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
      })).length(3),
    }).parse(d);
  });
});
