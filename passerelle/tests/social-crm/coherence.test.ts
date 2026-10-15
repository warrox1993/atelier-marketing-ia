// Cohérence avec le modèle de démonstration : les simulateurs ne font que rhabiller les lignes de
// `modeleDemo` (contacts = demandes, transactions = devis, publications = réseaux sociaux).

import { describe, expect, it } from "vitest";
import { modeleDemo, type ContactCrm, type TransactionCrm } from "../../src/demo/modele/index.js";
import { numeroDepuisUuid } from "../../src/demo/social-crm/crm-commun.js";
import { ANNEE, appeler, donnees, SEPTEMBRE, toutesLesPages } from "./aide.js";

const contactsModele = (p: { debut: string; fin: string }): ContactCrm[] =>
  modeleDemo.contacts(p).sort((a, b) => a.creeLe.localeCompare(b.creeLe) || a.id.localeCompare(b.id));
const somme = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);

async function hubspotContacts(periode: { debut: string; fin: string }) {
  return toutesLesPages<any>(async (after) => {
    const r = await donnees("crm", "crm_contacts", { ...periode, limit: 100, ...(after ? { after } : {}) });
    return { elements: r.results, suite: r.paging?.next.after ?? null };
  });
}
async function hubspotDeals(periode: { debut: string; fin: string }) {
  return toutesLesPages<any>(async (after) => {
    const r = await donnees("crm", "crm_transactions", { ...periode, limit: 100, ...(after ? { after } : {}) });
    return { elements: r.results, suite: r.paging?.next.after ?? null };
  });
}

describe("HubSpot = modèle", () => {
  it("un contact HubSpot par contact du modèle, dans le même ordre, avec le même cycle de vie", async () => {
    const { elements } = await hubspotContacts(SEPTEMBRE);
    const attendus = contactsModele(SEPTEMBRE);
    expect(attendus.length).toBeGreaterThan(30);
    expect(elements.map((e) => e.id)).toEqual(attendus.map((c) => c.id));
    elements.forEach((e, i) => {
      const c = attendus[i]!;
      expect(e.properties).toMatchObject({
        email: c.courriel, firstname: c.prenom, lastname: c.nom, phone: c.telephone, city: c.localite, zip: c.codePostal,
        lifecyclestage: c.cycleDeVie, hs_analytics_source: c.sourceCrm, createdate: c.creeLe, etablissement: c.etablissement, metier: c.metier,
      });
    });
  });

  it("l'état du CRM dépend de la date d'observation `au` (étapes franchies après `au` invisibles)", async () => {
    const tot = await hubspotContacts({ ...SEPTEMBRE });
    const tard = await donnees("crm", "crm_contacts", { ...SEPTEMBRE, au: "2026-12-31", limit: 100 });
    const attendu = modeleDemo.contacts({ ...SEPTEMBRE, au: "2026-12-31" }).sort((a, b) => a.creeLe.localeCompare(b.creeLe) || a.id.localeCompare(b.id)).slice(0, 100);
    expect(tard.results.map((r: any) => r.properties.lifecyclestage)).toEqual(attendu.map((c) => c.cycleDeVie));
    expect(tot.elements.length).toBe(contactsModele(SEPTEMBRE).length);
  });

  it("une affaire HubSpot par transaction du modèle : montant, étape, contact associé", async () => {
    const { elements } = await hubspotDeals(SEPTEMBRE);
    const attendues: TransactionCrm[] = modeleDemo.transactions(SEPTEMBRE);
    expect(attendues.length).toBeGreaterThan(10);
    expect(elements.map((e) => e.id)).toEqual(attendues.map((t) => t.id));
    elements.forEach((e, i) => {
      const t = attendues[i]!;
      expect(e.properties.amount).toBe(String(t.montantEuros));
      expect(e.properties.dealstage).toBe({ devis_envoye: "contractsent", gagne: "closedwon", perdu: "closedlost" }[t.etape]);
      expect(e.associations.contacts.results[0].id).toBe(t.contactId);
      expect(Boolean(e.properties.closedate)).toBe(t.dateCloture !== null);
    });
  });

  it("une affaire gagnée correspond à un contact au stade customer (même date d'observation)", async () => {
    const contacts = new Map((await hubspotContacts({ debut: "2026-05-01", fin: "2026-05-31" })).elements.map((c) => [c.id, c]));
    const deals = (await hubspotDeals({ debut: "2026-05-01", fin: "2026-05-31" })).elements;
    expect(deals.length).toBeGreaterThan(5);
    for (const d of deals) {
      const contact = contacts.get(d.associations.contacts.results[0].id);
      if (contact && d.properties.dealstage === "closedwon") expect(contact.properties.lifecyclestage).toBe("customer");
    }
  });
});

describe("Les quatre CRM racontent la même histoire", () => {
  it("même nombre de contacts, mêmes personnes, mêmes devis (HubSpot, Pipedrive, Odoo, Teamleader)", async () => {
    const hub = (await hubspotContacts(SEPTEMBRE)).elements;
    const pipe = (await toutesLesPages<any>(async (s) => {
      const r = await donnees("pipedrive", "pipedrive_personnes", { ...SEPTEMBRE, limit: 500, start: (s as number) ?? 0 });
      return { elements: r.data, suite: r.additional_data.pagination.next_start ?? null };
    })).elements;
    const tl = (await toutesLesPages<any>(async (n) => {
      const r = await donnees("teamleader", "teamleader_contacts", { ...SEPTEMBRE, page: { size: 100, number: (n as number) ?? 1 } });
      return { elements: r.data, suite: r.data.length === 100 ? ((n as number) ?? 1) + 1 : null };
    })).elements;
    const odoo = (await donnees("odoo", "odoo_leads_search_read", { ...SEPTEMBRE, limit: 500, domain: [["active", "in", [true, false]]], order: "create_date asc, id asc" })).result;

    expect(pipe.length).toBe(hub.length);
    expect(tl.length).toBe(hub.length);
    expect(odoo.length).toBe(hub.length);
    expect(pipe.map((p: any) => String(p.id))).toEqual(hub.map((h) => h.id));
    expect(tl.map((t: any) => numeroDepuisUuid("contact", t.id))).toEqual(hub.map((h) => h.id));
    expect(odoo.map((o: any) => String(o.id))).toEqual(hub.map((h) => h.id));
    expect(pipe.map((p: any) => p.email[0].value)).toEqual(hub.map((h) => h.properties.email));
    expect(tl.map((t: any) => t.emails[0].email)).toEqual(hub.map((h) => h.properties.email));
    expect(odoo.map((o: any) => o.email_from)).toEqual(hub.map((h) => h.properties.email));
  });

  it("le total des devis est identique dans les quatre CRM", async () => {
    const attendu = somme(modeleDemo.transactions(SEPTEMBRE).map((t) => t.montantEuros));
    expect(attendu).toBeGreaterThan(0);
    const hub = somme((await hubspotDeals(SEPTEMBRE)).elements.map((d) => Number(d.properties.amount)));
    const pipe = somme((await donnees("pipedrive", "pipedrive_affaires", { ...SEPTEMBRE, limit: 500 })).data.map((d: any) => d.value));
    const tl = somme((await donnees("teamleader", "teamleader_deals", { ...SEPTEMBRE, page: { size: 100, number: 1 } })).data.map((d: any) => d.estimated_value.amount));
    expect([hub, pipe, tl]).toEqual([attendu, attendu, attendu]);
  });

  it("statuts : open/won/lost de Pipedrive et Teamleader suivent les étapes du modèle", async () => {
    const attendus = modeleDemo.transactions(SEPTEMBRE).map((t) => ({ devis_envoye: "open", gagne: "won", perdu: "lost" })[t.etape]);
    const pipe = (await donnees("pipedrive", "pipedrive_affaires", { ...SEPTEMBRE, limit: 500 })).data.map((d: any) => d.status);
    const tl = (await donnees("teamleader", "teamleader_deals", { ...SEPTEMBRE, page: { size: 100, number: 1 } })).data.map((d: any) => d.status);
    expect(pipe).toEqual(attendus);
    expect(tl).toEqual(attendus);
  });

  it("Odoo : le revenu attendu d'un lead est le montant de son devis ; gagné = stage Gagné ; perdu = archivé", async () => {
    // même date d'observation que l'outil (au = fin de période = 31/05) : un devis clos en juin est encore en attente
    const devis = new Map(modeleDemo.transactions({ debut: "2026-05-01", fin: "2026-06-30", au: "2026-05-31" }).map((t) => [t.contactId, t]));
    const tous = (await donnees("odoo", "odoo_leads_search_read", { debut: "2026-05-01", fin: "2026-05-31", limit: 500, domain: [["active", "in", [true, false]]] })).result;
    let verifies = 0;
    for (const lead of tous) {
      const t = devis.get(String(lead.id));
      if (!t) {
        expect(lead.expected_revenue).toBe(0);
        continue;
      }
      verifies++;
      expect(lead.expected_revenue).toBe(t.montantEuros);
      expect(lead.type).toBe("opportunity"); // un devis n'existe que pour une opportunité
      expect(lead.won_status).toBe({ devis_envoye: "pending", gagne: "won", perdu: "lost" }[t.etape]);
      expect(lead.active).toBe(t.etape !== "perdu");
      if (t.etape === "gagne") expect(lead.stage_id).toEqual([4, "Gagné"]);
    }
    expect(verifies).toBeGreaterThan(5);
  });
});

describe("Piège : contacts hors zone (Herstal) restés en lead", () => {
  it("HubSpot : établissement null, stade lead, aucune affaire ; idem dans les autres CRM", async () => {
    const horsZone = contactsModele(ANNEE).filter((c) => c.horsZone);
    expect(horsZone.length).toBeGreaterThan(0);
    const ids = new Set(horsZone.map((c) => c.id));

    const hub = (await hubspotContacts(ANNEE)).elements.filter((c) => ids.has(c.id));
    expect(hub.length).toBe(horsZone.length);
    for (const c of hub) {
      expect(c.properties).toMatchObject({ etablissement: null, lifecyclestage: "lead", city: "Herstal", zip: "4040" });
    }
    const affaires = (await hubspotDeals(ANNEE)).elements;
    expect(affaires.filter((d) => ids.has(d.associations.contacts.results[0].id))).toEqual([]);

    const pipeAffaires = (await donnees("pipedrive", "pipedrive_affaires", { ...ANNEE, limit: 500 })).data;
    expect(pipeAffaires.filter((d: any) => ids.has(String(d.person_id)))).toEqual([]);
    const odoo = (await donnees("odoo", "odoo_leads_search_read", { ...ANNEE, limit: 500, domain: [["zip", "=", "4040"]] })).result;
    expect(odoo.length).toBe(horsZone.length);
    for (const l of odoo) expect(l).toMatchObject({ type: "lead", stage_id: [1, "Nouveau"], expected_revenue: 0, x_etablissement: false });
  });
});

describe("Réseaux sociaux = modèle", () => {
  it("Facebook : texte, date, réactions, commentaires, partages viennent des publications du modèle", async () => {
    const attendues = modeleDemo.publications({ ...SEPTEMBRE, reseau: "facebook" }).sort((a, b) => b.date.localeCompare(a.date));
    const r = await donnees("facebook", "facebook_publications", { ...SEPTEMBRE, limit: 100 });
    expect(r.data.length).toBe(attendues.length);
    r.data.forEach((p: any, i: number) => {
      const m = attendues[i]!;
      expect(p).toMatchObject({ id: m.id, message: m.texte, link: m.lien });
      expect(p.created_time.startsWith(m.date)).toBe(true);
      expect(p.reactions.summary.total_count).toBe(m.reactions);
      expect(p.comments.summary.total_count).toBe(m.commentaires);
      expect(p.shares.count).toBe(m.partages);
    });
  });

  it("Facebook : page_media_view de la période = impressions des publications ; personnes distinctes = portée", async () => {
    const modele = modeleDemo.publications({ ...SEPTEMBRE, reseau: "facebook" });
    const r = await donnees("facebook", "facebook_insights_page", { ...SEPTEMBRE });
    const total = (nom: string): number => somme(r.data.find((d: any) => d.name === nom).values.map((v: any) => v.value));
    expect(total("page_media_view")).toBe(somme(modele.map((p) => p.impressions)));
    expect(total("page_total_media_view_unique")).toBe(somme(modele.map((p) => p.portee)));
  });

  it("Instagram : vues, portée, J'aime, enregistrements d'un média = champs du modèle ; total_interactions = somme", async () => {
    const modele = modeleDemo.publications({ ...SEPTEMBRE, reseau: "instagram" });
    expect(modele.length).toBeGreaterThan(3);
    const liste = await donnees("instagram", "instagram_medias", { ...SEPTEMBRE, limit: 100 });
    expect(liste.data.length).toBe(modele.length);
    for (const m of modele.slice(0, 4)) {
      const ligne = liste.data.find((d: any) => d.id === m.id);
      expect(ligne).toMatchObject({ caption: m.texte, like_count: m.reactions, comments_count: m.commentaires });
      const i = await donnees("instagram", "instagram_insights_media", { media_id: m.id });
      const v = Object.fromEntries(i.data.map((d: any) => [d.name, d.values[0].value]));
      expect(v).toEqual({
        reach: m.portee, views: m.impressions, likes: m.reactions, comments: m.commentaires, shares: m.partages, saved: m.enregistrements,
        total_interactions: m.reactions + m.commentaires + m.partages + m.enregistrements,
      });
    }
  });

  it("Instagram : un média inconnu est une erreur d'outil, pas une donnée inventée", async () => {
    const res = await appeler("instagram", "instagram_insights_media", { media_id: "123456789012345" });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.structuredContent)).toContain("introuvable");
  });

  it("LinkedIn : le total de la période, la somme par jour et la somme par mois coïncident avec le modèle", async () => {
    const modele = modeleDemo.publications({ ...SEPTEMBRE, reseau: "linkedin" });
    expect(modele.length).toBeGreaterThan(2);
    const attendu = {
      impressionCount: somme(modele.map((p) => p.impressions)), clickCount: somme(modele.map((p) => p.clics)),
      likeCount: somme(modele.map((p) => p.reactions)), commentCount: somme(modele.map((p) => p.commentaires)),
      shareCount: somme(modele.map((p) => p.partages)), uniqueImpressionsCount: somme(modele.map((p) => p.portee)),
    };
    const total = (await donnees("linkedin", "linkedin_statistiques", { ...SEPTEMBRE })).elements[0].totalShareStatistics;
    expect(total).toMatchObject(attendu);
    expect(total.engagement).toBeCloseTo((attendu.clickCount + attendu.likeCount + attendu.commentCount + attendu.shareCount) / attendu.impressionCount, 12);
    const jours = (await donnees("linkedin", "linkedin_statistiques", { ...SEPTEMBRE, granularite: "DAY" })).elements;
    expect(somme(jours.map((e: any) => e.totalShareStatistics.impressionCount))).toBe(attendu.impressionCount);
    const mois = (await donnees("linkedin", "linkedin_statistiques", { debut: "2026-08-15", fin: "2026-10-14", granularite: "MONTH" })).elements;
    expect(mois.length).toBe(3);
    const toutes = modeleDemo.publications({ debut: "2026-08-15", fin: "2026-10-14", reseau: "linkedin" });
    expect(somme(mois.map((e: any) => e.totalShareStatistics.impressionCount))).toBe(somme(toutes.map((p) => p.impressions)));
    // bornes : la 1re ligne commence au 15/08, la dernière finit après le 14/10 (fin exclue)
    expect(mois[0].timeRange.start).toBe(Date.parse("2026-08-15T00:00:00Z"));
    expect(mois[2].timeRange.end).toBe(Date.parse("2026-10-15T00:00:00Z"));
  });

  it("LinkedIn : statistiques d'une publication = ses chiffres du modèle", async () => {
    const m = modeleDemo.publications({ ...SEPTEMBRE, reseau: "linkedin" })[0]!;
    const r = await donnees("linkedin", "linkedin_statistiques", { ...SEPTEMBRE, partages: [m.id] });
    expect(r.elements).toHaveLength(1);
    expect(r.elements[0]).toMatchObject({ share: m.id, totalShareStatistics: { impressionCount: m.impressions, likeCount: m.reactions, clickCount: m.clics, shareCount: m.partages } });
  });
});

describe("Odoo : domaine, champs et tri", () => {
  it("le filtre implicite d'Odoo exclut les archivés (devis perdus) ; filtrer `active` les montre", async () => {
    const contacts = new Set(modeleDemo.contacts(SEPTEMBRE).map((c) => c.id));
    const perdus = modeleDemo.transactions({ debut: "2026-09-01", fin: "2026-10-30", au: "2026-09-30" })
      .filter((t) => contacts.has(t.contactId) && t.etape === "perdu").length;
    const tous = (await donnees("odoo", "odoo_leads_search_read", { ...SEPTEMBRE, limit: 500, domain: [["active", "in", [true, false]]] })).result;
    const actifs = (await donnees("odoo", "odoo_leads_search_read", { ...SEPTEMBRE, limit: 500 })).result;
    expect(tous.length).toBe(contacts.size);
    expect(tous.length - actifs.length).toBe(perdus);
    expect(tous.filter((l: any) => !l.active).length).toBe(perdus);
    expect(actifs.every((l: any) => l.active)).toBe(true);
  });

  it("domain type = lead ne garde que les leads ; order create_date asc trie", async () => {
    const leads = (await donnees("odoo", "odoo_leads_search_read", { ...SEPTEMBRE, limit: 500, domain: [["type", "=", "lead"]], order: "create_date asc" })).result;
    expect(leads.length).toBeGreaterThan(0);
    expect(leads.every((l: any) => l.type === "lead")).toBe(true);
    const dates = leads.map((l: any) => l.create_date);
    expect(dates).toEqual([...dates].sort());
  });

  it("champ ou opérateur invalide : erreur d'outil", async () => {
    expect((await appeler("odoo", "odoo_leads_search_read", { ...SEPTEMBRE, domain: [["champ_inconnu", "=", 1]] })).isError).toBe(true);
    expect((await appeler("odoo", "odoo_leads_search_read", { ...SEPTEMBRE, domain: [["type", "~~", "lead"]] })).isError).toBe(true);
    expect((await appeler("odoo", "odoo_leads_search_read", { ...SEPTEMBRE, fields: ["nimporte"] })).isError).toBe(true);
    expect((await appeler("odoo", "odoo_leads_search_read", { ...SEPTEMBRE, order: "name sideways" })).isError).toBe(true);
  });
});
