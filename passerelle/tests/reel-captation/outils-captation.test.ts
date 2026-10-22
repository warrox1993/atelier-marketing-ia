// Outils du service « captation » : catalogue, création d'une page à partir de simples textes (injection = texte), lecture,
// statistiques Umami et repli sans Umami. Magasin SQLite en mémoire, faux Umami.

import { describe, expect, it } from "vitest";
import { appelerOutil, construireCatalogue } from "../../src/outils.js";
import { FICHE_CAPTATION } from "../../src/services.js";
import { fournisseurCaptationReel } from "../../src/reel/captation/outils.js";
import { MagasinPages } from "../../src/pages/magasin.js";
import { ClientUmami } from "../../src/pages/umami.js";
import { rendrePage } from "../../src/pages/gabarit.js";

const ENTREPRISE = "123e4567-e89b-42d3-a456-426614174000";
const PAGE = {
  entreprise_id: ENTREPRISE, titre: "Isolation de toiture", accroche: "Réduisez votre facture de chauffage.", offre_type: "rappel_conseiller", offre_intitule: "Diagnostic gratuit",
  offre_description: "Un conseiller vous rappelle pour étudier votre toiture.", responsable: "Toitures Exemple SRL", contact_confidentialite: "vie-privee@exemple.test",
};

function fauxUmami(panne = false): ClientUmami {
  const f = (async (url: string | URL | Request): Promise<Response> => {
    const u = String(url);
    if (panne) return new Response("{}", { status: 500 });
    if (u.endsWith("/api/auth/login")) return new Response(JSON.stringify({ token: "t" }), { status: 200 });
    if (u.includes("/api/websites?")) return new Response(JSON.stringify({ data: [{ id: "site-1", name: "Pages de destination de l'atelier" }] }), { status: 200 });
    if (u.includes("/stats?")) {
      const merci = decodeURIComponent(u).includes("/merci");
      return new Response(JSON.stringify(merci ? { pageviews: 2, visitors: 2, visits: 2 } : { pageviews: 40, visitors: 20, visits: 25 }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return new ClientUmami({ url: "http://127.0.0.1:3196", utilisateur: "u", motDePasse: "m" }, f);
}

function montage(umami: ClientUmami | null) {
  const magasin = new MagasinPages(":memory:");
  const fournisseur = fournisseurCaptationReel({ magasin, umami, urlPages: "http://127.0.0.1:3195", maintenant: () => new Date("2026-10-22T10:00:00Z") });
  const catalogue = construireCatalogue(FICHE_CAPTATION, "reel", fournisseur);
  const ctx = { service: "captation", mode: "reel" as const, identite: { compte: "Poste local", propriete: { id: "pages/local", libelle: "Pages locales" } }, jetonPorteur: null };
  const appeler = async (outil: string, args: unknown) => {
    const r = await appelerOutil(catalogue, outil, args, ctx);
    return { erreur: r.isError === true, s: r.structuredContent as Record<string, unknown> };
  };
  return { magasin, catalogue, appeler };
}

describe("catalogue", () => {
  it("trois outils plus atelier_identite ; création en écriture, liste et statistiques en lecture seule", () => {
    const { catalogue } = montage(null);
    expect([...catalogue.outils.keys()].sort()).toEqual(["atelier_identite", "creer_page_destination", "lister_pages", "statistiques_page"]);
    const ro = (n: string) => catalogue.outils.get(n)?.annotations?.readOnlyHint;
    expect([ro("creer_page_destination"), ro("lister_pages"), ro("statistiques_page")]).toEqual([false, true, true]);
  });
  it("le schéma de création n'offre aucun champ HTML, ni consentement, ni lien", () => {
    const { catalogue } = montage(null);
    const champs = Object.keys(catalogue.outils.get("creer_page_destination")!.schemaEntree);
    expect(champs.sort()).toEqual(["accroche", "contact_confidentialite", "entreprise_id", "offre_description", "offre_intitule", "offre_type", "responsable", "titre"]);
  });
});

describe("creer_page_destination", () => {
  it("crée la page, rend l'adresse locale, le texte exact du consentement et dit qu'elle n'est pas publiée", async () => {
    const { appeler, magasin } = montage(null);
    const r = await appeler("creer_page_destination", PAGE);
    expect(r.erreur).toBe(false);
    const page = r.s["page"] as { slug: string; adresse_locale: string };
    expect(page.adresse_locale).toBe(`http://127.0.0.1:3195/p/${page.slug}`);
    expect(r.s["publiee"]).toBe(false);
    expect(String(r.s["texte_consentement"])).toContain("J'accepte que Toitures Exemple SRL");
    expect(magasin.lirePage(page.slug)?.texteConsentement).toBe(r.s["texte_consentement"]);
  });
  it("du HTML ou un script fourni par l'agent reste du texte à l'affichage", async () => {
    const { appeler, magasin } = montage(null);
    const r = await appeler("creer_page_destination", { ...PAGE, titre: "<script>alert(1)</script> Offre", offre_description: "<img src=x onerror=alert(1)> Un conseiller vous rappelle." });
    expect(r.erreur).toBe(false);
    const p = magasin.lirePage((r.s["page"] as { slug: string }).slug)!;
    const html = rendrePage(p, { jeton: "j", siteUmami: null, indexable: false });
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
  it("refuse des arguments invalides (entreprise non UUID, titre trop court)", async () => {
    const { appeler, magasin } = montage(null);
    expect((await appeler("creer_page_destination", { ...PAGE, entreprise_id: "x" })).s["erreur"]).toBe("arguments_invalides");
    expect((await appeler("creer_page_destination", { ...PAGE, titre: "ab" })).s["erreur"]).toBe("arguments_invalides");
    expect(magasin.listerPages()).toHaveLength(0);
  });
});

describe("lister_pages et statistiques_page", () => {
  it("liste les pages avec leur nombre d'envois, filtrable par entreprise", async () => {
    const { appeler, magasin } = montage(null);
    const cree = await appeler("creer_page_destination", PAGE);
    const slug = (cree.s["page"] as { slug: string }).slug;
    magasin.reserverEnvoi(slug, "nonce-1", new Date("2026-10-21T10:00:00Z"));
    const tout = await appeler("lister_pages", {});
    expect((tout.s["pages"] as Array<{ envois: number }>)[0]!.envois).toBe(1);
    expect((await appeler("lister_pages", { entreprise_id: "223e4567-e89b-42d3-a456-426614174000" })).s["total"]).toBe(0);
    expect(JSON.stringify(tout.s)).not.toMatch(/telephone|courriel|nom_visiteur/u);
  });
  it("donne vues, visiteurs, envois et taux depuis Umami", async () => {
    const { appeler, magasin } = montage(fauxUmami());
    const slug = ((await appeler("creer_page_destination", PAGE)).s["page"] as { slug: string }).slug;
    for (let i = 0; i < 2; i++) magasin.reserverEnvoi(slug, `n${i}`, new Date("2026-10-21T10:00:00Z"));
    const r = await appeler("statistiques_page", { slug, jours: 30 });
    expect(r.erreur).toBe(false);
    expect(r.s["visites"]).toEqual({ vues: 40, visiteurs: 20, visites: 25, vues_page_merci: 2 });
    expect(r.s["envois"]).toBe(2);
    expect(r.s["taux_envoi_pour_cent"]).toBe(10);
  });
  it("sans Umami ou si Umami est en panne : seulement les envois, avec un avertissement, aucun chiffre inventé", async () => {
    for (const umami of [null, fauxUmami(true)]) {
      const { appeler } = montage(umami);
      const slug = ((await appeler("creer_page_destination", PAGE)).s["page"] as { slug: string }).slug;
      const r = await appeler("statistiques_page", { slug });
      expect(r.s["visites"]).toBeNull();
      expect(String(r.s["avertissement"])).toContain("Umami");
    }
  });
  it("refuse une page inconnue ou un slug invalide", async () => {
    const { appeler } = montage(null);
    expect((await appeler("statistiques_page", { slug: "inconnue-abcdef12" })).erreur).toBe(true);
    expect((await appeler("statistiques_page", { slug: "../etc/passwd" })).erreur).toBe(true);
  });
});
