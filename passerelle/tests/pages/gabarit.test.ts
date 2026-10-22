// Gabarit et contenu : tout texte venu d'un agent ou d'un visiteur reste du texte (aucun HTML libre).

import { describe, expect, it } from "vitest";
import { nettoyerTexte, SchemaContenuPage, texteConsentement } from "../../src/pages/contenu.js";
import { echapper, rendreErreur, rendreMerci, rendrePage } from "../../src/pages/gabarit.js";
import type { PageDestination } from "../../src/pages/magasin.js";
import { fabriquerSlug, estSlugValide } from "../../src/pages/magasin.js";

const CHARGE = `"><script>alert(1)</script><img src=x onerror=alert(2)>&'\``;
const page: PageDestination = {
  slug: "page-test-aaaa1111", entrepriseId: "123e4567-e89b-42d3-a456-426614174000", titre: `Titre ${CHARGE}`, accroche: `Accroche ${CHARGE}`, offreType: "rappel_conseiller",
  offreIntitule: `Offre ${CHARGE}`, offreDescription: `Ligne 1 ${CHARGE}\n\nLigne 2 <b>gras</b>`, responsable: `Resp ${CHARGE}`, contactConfidentialite: `contact ${CHARGE}`,
  texteConsentement: `Consentement ${CHARGE}`, creeLe: "2026-10-22T10:00:00.000Z",
};

describe("échappement", () => {
  it("remplace les six caractères sensibles", () => {
    expect(echapper(`<a href="x" onclick='y'>&\``)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&#96;");
  });
});

describe("rendu des pages", () => {
  const sortie = [rendrePage(page, { jeton: CHARGE, siteUmami: null, indexable: false, valeurs: { nom: CHARGE, telephone: CHARGE, courriel: CHARGE }, erreurs: { nom: CHARGE, formulaire: CHARGE } }), rendreMerci(page, { siteUmami: null, indexable: false }), rendreErreur(CHARGE, CHARGE)];
  it.each(sortie.map((s, i) => [["page", "merci", "erreur"][i], s] as const))("%s : injection HTML et script restent du texte", (_nom, html) => {
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    // Aucune BALISE réelle ne porte de gestionnaire d'événement (le texte « onerror=... » échappé reste du texte).
    const balises = html.match(/<[a-z!/][^>]*>/giu) ?? [];
    expect(balises.some((b) => /\son[a-z]+\s*=/iu.test(b.replace(/"[^"]*"/gu, '""')))).toBe(false);
    expect(balises.some((b) => /^<(?:script|img|iframe|object|embed|svg|style)\b(?![^>]*\bsrc="\/_s\/script\.js")/iu.test(b))).toBe(false);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
  it("aucun script en ligne quand Umami n'est pas branché ; script relayé du même serveur sinon", () => {
    expect(rendrePage(page, { jeton: "j", siteUmami: null, indexable: false })).not.toContain("<script");
    const avec = rendrePage(page, { jeton: "j", siteUmami: "id-site-1", indexable: false });
    expect(avec).toContain('<script defer src="/_s/script.js" data-website-id="id-site-1" data-do-not-track="true"></script>');
  });
  it("noindex par défaut, indexable seulement sur réglage explicite", () => {
    expect(rendrePage(page, { jeton: "j", siteUmami: null, indexable: false })).toContain('name="robots" content="noindex, nofollow"');
    expect(rendrePage(page, { jeton: "j", siteUmami: null, indexable: true })).not.toContain("noindex");
  });
  it("la case de consentement n'est jamais pré-cochée, même après une erreur", () => {
    for (const e of [undefined, { consentement: "Cochez la case." }]) {
      const html = rendrePage(page, { jeton: "j", siteUmami: null, indexable: false, ...(e ? { erreurs: e } : {}) });
      expect(/<input id="consentement"[^>]*checked/iu.test(html)).toBe(false);
    }
  });
});

describe("contenu fourni par un agent", () => {
  const base = {
    entreprise_id: "123e4567-e89b-42d3-a456-426614174000", titre: "Titre valable", accroche: "Une accroche suffisamment longue.", offre_type: "rappel_conseiller",
    offre_intitule: "Offre valable", offre_description: "Description de l'offre valable.", responsable: "Société Exemple", contact_confidentialite: "vie-privee@exemple.test",
  };
  it("retire les caractères invisibles et de direction, normalise les espaces", () => {
    expect(nettoyerTexte("a‮b​c\u0000  d\n\te")).toBe("abc d e");
    expect(nettoyerTexte("l1 \r\n\r\n\r\n\r\nl2", true)).toBe("l1\n\nl2");
  });
  it("borne les longueurs et refuse un identifiant d'entreprise non UUID ou une offre inconnue", () => {
    expect(SchemaContenuPage.safeParse(base).success).toBe(true);
    expect(SchemaContenuPage.safeParse({ ...base, titre: "x".repeat(121) }).success).toBe(false);
    expect(SchemaContenuPage.safeParse({ ...base, entreprise_id: "pas-un-uuid" }).success).toBe(false);
    expect(SchemaContenuPage.safeParse({ ...base, offre_type: "vente" }).success).toBe(false);
  });
  it("ne laisse passer aucun champ supplémentaire de type HTML (champs inconnus ignorés par le schéma, jamais rendus)", () => {
    const r = SchemaContenuPage.parse({ ...base, html: "<script>x</script>", consentement: "J'accepte tout" });
    expect(Object.keys(r)).not.toContain("html");
    expect(Object.keys(r)).not.toContain("consentement");
  });
  it("le texte du consentement est construit par le serveur et nomme le responsable, l'objet et le moyen de retrait", () => {
    const t = texteConsentement(SchemaContenuPage.parse(base));
    expect(t).toContain("Société Exemple");
    expect(t).toContain("« Offre valable »");
    expect(t).toContain("vie-privee@exemple.test");
    expect(t).toContain("retirer mon consentement");
  });
});

describe("identifiants de page", () => {
  it("slug lisible non devinable, sans caractère spécial", () => {
    const s = fabriquerSlug("Été: Isolation <script> & plus !");
    expect(estSlugValide(s)).toBe(true);
    expect(s).toMatch(/^ete-isolation-script-plus-[0-9a-f]{8}$/u);
    expect(fabriquerSlug("!!!")).toMatch(/^page-[0-9a-f]{8}$/u);
    expect(estSlugValide("../x")).toBe(false);
  });
});
