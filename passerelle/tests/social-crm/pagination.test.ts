// Pagination : chaque outil rend, page après page, exactement la liste complète, sans doublon ni trou,
// et n'annonce « page suivante » que s'il en reste une.

import { describe, expect, it } from "vitest";
import { appeler, donnees, SEPTEMBRE, toutesLesPages } from "./aide.js";

const sansDoublon = (ids: readonly unknown[]): void => expect(new Set(ids).size).toBe(ids.length);

describe("Meta : curseurs paging.cursors.after et paging.next", () => {
  it.each([
    ["facebook", "facebook_publications"],
    ["instagram", "instagram_medias"],
  ])("%s : pages de 2 = une page de 100", async (service, outil) => {
    const tout = await donnees(service, outil, { ...SEPTEMBRE, limit: 100 });
    expect(tout.paging.next).toBeUndefined();
    expect(tout.data.length).toBeGreaterThan(4);
    let consomme = 0;
    const { elements, pages } = await toutesLesPages<any>(async (after) => {
      const r = await donnees(service, outil, { ...SEPTEMBRE, limit: 2, ...(after ? { after } : {}) });
      consomme += r.data.length;
      expect(Boolean(r.paging.next)).toBe(consomme < tout.data.length); // `next` seulement s'il reste des éléments
      return { elements: r.data, suite: r.paging.next ? r.paging.cursors.after : null };
    });
    expect(elements.map((e) => e.id)).toEqual(tout.data.map((e: any) => e.id));
    sansDoublon(elements.map((e) => e.id));
    expect(pages).toBe(Math.ceil(tout.data.length / 2));
  });

  it("la page suivante porte `previous` ; `next` contient le curseur `after` de la page", async () => {
    const p1 = await donnees("facebook", "facebook_publications", { ...SEPTEMBRE, limit: 2 });
    expect(p1.paging.previous).toBeUndefined();
    expect(p1.paging.next).toContain(`after=${p1.paging.cursors.after}`);
    const p2 = await donnees("facebook", "facebook_publications", { ...SEPTEMBRE, limit: 2, after: p1.paging.cursors.after });
    expect(p2.paging.previous).toBeDefined();
  });

  it("un curseur inventé est refusé", async () => {
    const res = await appeler("facebook", "facebook_publications", { ...SEPTEMBRE, after: "n'importe-quoi" });
    expect(res.isError).toBe(true);
  });

  it("une limite pile égale au nombre d'éléments n'annonce pas de page suivante", async () => {
    const tout = await donnees("facebook", "facebook_publications", { ...SEPTEMBRE, limit: 100 });
    const exact = await donnees("facebook", "facebook_publications", { ...SEPTEMBRE, limit: tout.data.length });
    expect(exact.paging.next).toBeUndefined();
    const moins = await donnees("facebook", "facebook_publications", { ...SEPTEMBRE, limit: tout.data.length - 1 });
    expect(moins.paging.next).toBeDefined();
  });
});

describe("LinkedIn : start, count et paging.links", () => {
  it("pages de 2 = une page de 100 ; le lien `next` pointe sur start suivant", async () => {
    const tout = await donnees("linkedin", "linkedin_publications", { ...SEPTEMBRE, count: 100 });
    expect(tout.paging.links).toEqual([]);
    const { elements } = await toutesLesPages<any>(async (start) => {
      const s = (start as number | undefined) ?? 0;
      const r = await donnees("linkedin", "linkedin_publications", { ...SEPTEMBRE, count: 2, start: s });
      const lien = r.paging.links[0];
      if (lien) expect(lien.href).toContain(`start=${s + 2}`);
      return { elements: r.elements, suite: lien ? s + 2 : null };
    });
    expect(elements.map((e) => e.id)).toEqual(tout.elements.map((e: any) => e.id));
    sansDoublon(elements.map((e) => e.id));
  });
});

describe("HubSpot : paging.next.after", () => {
  it.each(["crm_contacts", "crm_transactions"])("%s : pages de 7 = une page de 100", async (outil) => {
    const tout = await donnees("crm", outil, { ...SEPTEMBRE, limit: 100 });
    expect(tout.paging).toBeUndefined();
    expect(tout.results.length).toBeGreaterThan(14);
    const { elements } = await toutesLesPages<any>(async (after) => {
      const r = await donnees("crm", outil, { ...SEPTEMBRE, limit: 7, ...(after ? { after } : {}) });
      return { elements: r.results, suite: r.paging?.next.after ?? null };
    });
    expect(elements.map((e) => e.id)).toEqual(tout.results.map((e: any) => e.id));
    sansDoublon(elements.map((e) => e.id));
  });

  it("limite par défaut de 10 et maximum de 100", async () => {
    expect((await donnees("crm", "crm_contacts", { ...SEPTEMBRE })).results).toHaveLength(10);
    expect((await appeler("crm", "crm_contacts", { ...SEPTEMBRE, limit: 101 })).isError).toBe(true);
    expect((await appeler("crm", "crm_contacts", { ...SEPTEMBRE, after: "abc" })).isError).toBe(true);
  });
});

describe("Pipedrive : start, limit, more_items_in_collection, next_start", () => {
  it.each([["pipedrive_personnes"], ["pipedrive_affaires"]])("%s : pages de 6 = une page de 500", async (outil) => {
    const tout = await donnees("pipedrive", outil, { ...SEPTEMBRE, limit: 500 });
    expect(tout.additional_data.pagination).toEqual({ start: 0, limit: 500, more_items_in_collection: false });
    const { elements } = await toutesLesPages<any>(async (start) => {
      const r = await donnees("pipedrive", outil, { ...SEPTEMBRE, limit: 6, start: (start as number | undefined) ?? 0 });
      const p = r.additional_data.pagination;
      expect(p.more_items_in_collection).toBe(p.next_start !== undefined);
      return { elements: r.data, suite: p.next_start ?? null };
    });
    expect(elements.map((e) => e.id)).toEqual(tout.data.map((e: any) => e.id));
    sansDoublon(elements.map((e) => e.id));
  });
});

describe("Odoo : offset et limit", () => {
  it("pages de 9 = une page de 500, avec un tri stable", async () => {
    const base = { ...SEPTEMBRE, order: "create_date asc, id asc" };
    const tout = (await donnees("odoo", "odoo_leads_search_read", { ...base, limit: 500 })).result;
    expect(tout.length).toBeGreaterThan(18);
    const { elements } = await toutesLesPages<any>(async (offset) => {
      const o = (offset as number | undefined) ?? 0;
      const r = (await donnees("odoo", "odoo_leads_search_read", { ...base, limit: 9, offset: o })).result;
      return { elements: r, suite: r.length === 9 ? o + 9 : null };
    });
    expect(elements.map((e) => e.id)).toEqual(tout.map((e: any) => e.id));
    sansDoublon(elements.map((e) => e.id));
  });
});

describe("Teamleader : page.size et page.number", () => {
  it.each([["teamleader_contacts"], ["teamleader_deals"]])("%s : pages de 8 = une page de 100", async (outil) => {
    const tout = (await donnees("teamleader", outil, { ...SEPTEMBRE, page: { size: 100, number: 1 } })).data;
    expect(tout.length).toBeGreaterThan(16);
    const { elements } = await toutesLesPages<any>(async (n) => {
      const numero = (n as number | undefined) ?? 1;
      const r = (await donnees("teamleader", outil, { ...SEPTEMBRE, page: { size: 8, number: numero } })).data;
      return { elements: r, suite: r.length === 8 ? numero + 1 : null };
    });
    expect(elements.map((e) => e.id)).toEqual(tout.map((e: any) => e.id));
    sansDoublon(elements.map((e) => e.id));
  });

  it("une page au-delà de la fin est vide", async () => {
    expect((await donnees("teamleader", "teamleader_contacts", { ...SEPTEMBRE, page: { size: 100, number: 50 } })).data).toEqual([]);
  });
});
