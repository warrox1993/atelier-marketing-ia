// Outils du service « emailing » : consentement exigé, brouillon jamais envoyé, désinscription présente, adresses privées refusées,
// suppression respectée, envoi absent du catalogue. Faux listmonk en mémoire, aucun conteneur.

import { describe, expect, it } from "vitest";
import { construireCatalogue, appelerOutil } from "../../src/outils.js";
import { FICHE_EMAILING } from "../../src/services.js";
import { fournisseurEmailingReel } from "../../src/reel/emailing/outils.js";
import { ClientListmonk } from "../../src/reel/emailing/listmonk.js";
import { creerFauxListmonk } from "./faux-listmonk.js";

const CONSENTEMENT = { date: "2026-09-12", source: "Formulaire du salon, stand 4", texte: "J'accepte de recevoir la lettre d'information." };
const PUBLIC = (ip: string): boolean => ip === "93.184.216.34";
const RESOUDRE = async (h: string): Promise<string[]> => (h === "exemple-prive.test" ? ["10.0.0.5"] : ["93.184.216.34"]);

function montage() {
  const faux = creerFauxListmonk();
  const client = new ClientListmonk({ url: "http://127.0.0.1:19000", jeton: "atelier-gestion:jeton-de-test-0123456789", fetch: faux.fetch });
  const fournisseur = fournisseurEmailingReel({ client, adresseAutorisee: PUBLIC, resoudre: RESOUDRE, maintenant: () => new Date("2026-10-21T10:00:00Z") });
  const catalogue = construireCatalogue(FICHE_EMAILING, "reel", fournisseur);
  const ctx = { service: "emailing", mode: "reel" as const, identite: { compte: "Poste local", propriete: { id: "listmonk/local", libelle: "listmonk" } }, jetonPorteur: null };
  const appeler = async (outil: string, args: unknown) => {
    const r = await appelerOutil(catalogue, outil, args, ctx);
    return { erreur: r.isError === true, s: r.structuredContent as Record<string, unknown> };
  };
  return { faux, catalogue, appeler };
}

describe("catalogue du service emailing", () => {
  it("cinq outils plus atelier_identite, et AUCUN outil d'envoi", () => {
    const { catalogue } = montage();
    const noms = [...catalogue.outils.keys()].sort();
    expect(noms).toEqual(["ajouter_abonnes", "atelier_identite", "creer_campagne_brouillon", "creer_liste", "etat_campagne", "lister_listes"]);
    expect(noms.some((n) => /envoy|send|lancer|demarrer|start/i.test(n))).toBe(false);
  });
  it("lecture seule annoncée pour lister_listes et etat_campagne, écriture pour les trois autres", () => {
    const { catalogue } = montage();
    const lecture = (n: string) => catalogue.outils.get(n)?.annotations?.readOnlyHint;
    expect([lecture("lister_listes"), lecture("etat_campagne")]).toEqual([true, true]);
    expect([lecture("creer_liste"), lecture("ajouter_abonnes"), lecture("creer_campagne_brouillon")]).toEqual([false, false, false]);
  });
});

describe("ajouter_abonnes : preuve du consentement obligatoire", () => {
  it("refuse un abonné sans consentement (schéma) et n'écrit rien", async () => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    const r = await appeler("ajouter_abonnes", { liste_id: 1, abonnes: [{ email: "a@exemple.test" }] });
    expect(r.erreur).toBe(true);
    expect(r.s["erreur"]).toBe("arguments_invalides");
    expect(faux.etat.abonnes).toHaveLength(0);
  });
  it.each([
    ["date manquante", { source: CONSENTEMENT.source, texte: CONSENTEMENT.texte }],
    ["source manquante", { date: CONSENTEMENT.date, texte: CONSENTEMENT.texte }],
    ["texte manquant", { date: CONSENTEMENT.date, source: CONSENTEMENT.source }],
  ])("refuse : %s", async (_nom, consentement) => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    const r = await appeler("ajouter_abonnes", { liste_id: 1, abonnes: [{ email: "a@exemple.test", consentement }] });
    expect(r.s["erreur"]).toBe("arguments_invalides");
    expect(faux.etat.abonnes).toHaveLength(0);
  });
  it("un seul abonné sans preuve valable fait refuser TOUT l'appel (date future)", async () => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    const r = await appeler("ajouter_abonnes", { liste_id: 1, abonnes: [
      { email: "bon@exemple.test", consentement: CONSENTEMENT },
      { email: "futur@exemple.test", consentement: { ...CONSENTEMENT, date: "2027-01-01" } },
    ] });
    expect(r.erreur).toBe(true);
    expect(String(r.s["message"])).toMatch(/futur/);
    expect(faux.etat.abonnes).toHaveLength(0);
  });
  it("refuse un consentement antérieur au RGPD", async () => {
    const { appeler } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    const r = await appeler("ajouter_abonnes", { liste_id: 1, abonnes: [{ email: "a@exemple.test", consentement: { ...CONSENTEMENT, date: "2015-01-01" } }] });
    expect(String(r.s["message"])).toMatch(/RGPD/);
  });
  it("inscrit avec la preuve rangée dans les attributs de l'abonné", async () => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    const r = await appeler("ajouter_abonnes", { liste_id: 1, abonnes: [{ email: "Marie@Exemple.test", nom: "Marie", consentement: CONSENTEMENT }] });
    expect(r.erreur).toBe(false);
    expect((r.s["resultats"] as Array<{ resultat: string }>)[0]?.resultat).toBe("ajoute");
    const a = faux.etat.abonnes[0]!;
    expect(a.email).toBe("marie@exemple.test");
    expect(a.attribs?.["consentement"]).toMatchObject({ date: "2026-09-12", source: CONSENTEMENT.source, texte: CONSENTEMENT.texte, enregistre_par: "passerelle-emailing" });
  });
  it("refuse une source de consentement qui est une adresse privée (SSRF) et une adresse e-mail à retour de ligne", async () => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    for (const source of ["http://127.0.0.1:8080/formulaire", "http://exemple-prive.test/f", "http://169.254.169.254/latest"]) {
      const r = await appeler("ajouter_abonnes", { liste_id: 1, abonnes: [{ email: "a@exemple.test", consentement: { ...CONSENTEMENT, source } }] });
      expect(r.erreur, source).toBe(true);
      expect(String(r.s["message"]), source).toMatch(/refusée/);
    }
    const r2 = await appeler("ajouter_abonnes", { liste_id: 1, abonnes: [{ email: "a@exemple.test\nBcc: x@y.test", consentement: CONSENTEMENT }] });
    expect(r2.erreur).toBe(true);
    expect(faux.etat.abonnes).toHaveLength(0);
  });
  it("accepte une source web publique", async () => {
    const { appeler } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    const r = await appeler("ajouter_abonnes", { liste_id: 1, abonnes: [{ email: "a@exemple.test", consentement: { ...CONSENTEMENT, source: "https://exemple.test/formulaire" } }] });
    expect(r.erreur).toBe(false);
  });
  it("respecte la suppression : un abonné blocklisté ou désinscrit n'est jamais réinscrit", async () => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    await appeler("creer_liste", { nom: "Autre" });
    faux.etat.abonnes.push({ id: 90, email: "bloque@exemple.test", name: "B", status: "blocklisted", lists: [] });
    faux.etat.abonnes.push({ id: 91, email: "parti@exemple.test", name: "P", status: "enabled", lists: [{ id: 1, subscription_status: "unsubscribed" }] });
    faux.etat.abonnes.push({ id: 92, email: "deja@exemple.test", name: "D", status: "enabled", lists: [{ id: 1, subscription_status: "confirmed" }] });
    faux.etat.abonnes.push({ id: 93, email: "ailleurs@exemple.test", name: "A", status: "enabled", lists: [{ id: 2, subscription_status: "confirmed" }] });
    const r = await appeler("ajouter_abonnes", { liste_id: 1, abonnes: ["bloque", "parti", "deja", "ailleurs"].map((n) => ({ email: `${n}@exemple.test`, consentement: CONSENTEMENT })) });
    const res = Object.fromEntries((r.s["resultats"] as Array<{ email: string; resultat: string }>).map((x) => [x.email.split("@")[0], x.resultat]));
    expect(res).toEqual({ bloque: "supprime", parti: "desinscrit", deja: "deja_present", ailleurs: "ajoute" });
    expect(faux.etat.appels.some((a) => a.methode === "POST" && a.chemin === "/api/subscribers")).toBe(false);
  });
});

describe("creer_campagne_brouillon", () => {
  const base = { nom: "Lettre d'octobre", sujet: "Nos nouveautés", liste_ids: [1], contenu_html: "<p>Bonjour {{ .Subscriber.FirstName }}, voici nos nouveautés.</p>", contenu_texte: "Bonjour, voici nos nouveautés." };

  it("crée un BROUILLON, ne démarre jamais la campagne et ajoute la désinscription aux deux versions", async () => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    const r = await appeler("creer_campagne_brouillon", base);
    expect(r.erreur).toBe(false);
    const c = faux.etat.campagnes[0]!;
    expect(c.status).toBe("draft");
    expect(c.body).toContain("{{ UnsubscribeURL }}");
    expect(c.altbody).toContain("{{ UnsubscribeURL }}");
    expect((r.s["campagne"] as { statut: string }).statut).toBe("draft");
    expect(r.s["desinscription_ajoutee"]).toBe(true);
    expect(String(r.s["note"])).toMatch(/envoi de test, rien n'est parti/);
    // aucun appel de changement d'état n'a été fait
    expect(faux.etat.appels.some((a) => a.chemin.endsWith("/status"))).toBe(false);
  });
  it("ne double pas le lien de désinscription quand l'auteur l'a déjà mis", async () => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    const r = await appeler("creer_campagne_brouillon", { ...base, contenu_html: `${base.contenu_html}<a href="{{ UnsubscribeURL }}">Se désinscrire</a>`, contenu_texte: `${base.contenu_texte} Désinscription : {{ UnsubscribeURL }}` });
    expect(r.s["desinscription_ajoutee"]).toBe(false);
    expect(faux.etat.campagnes[0]!.body.match(/UnsubscribeURL/g)).toHaveLength(1);
  });
  it.each([
    ["lien vers une adresse locale", { contenu_html: '<p><a href="http://127.0.0.1:3100/admin">admin</a></p>' }],
    ["lien vers une adresse privée résolue", { contenu_html: '<p><a href="http://exemple-prive.test/page">x</a></p>' }],
    ["image vers les métadonnées cloud", { contenu_html: '<p><img src="http://169.254.169.254/latest/meta-data/"></p>' }],
    ["adresse privée dans la version texte", { contenu_texte: "Voir http://10.0.0.5/secret pour la suite." }],
    ["lien relatif", { contenu_html: '<p><a href="/promo">promo</a></p>' }],
    ["schéma javascript", { contenu_html: '<p><a href="javascript:alert(1)">x</a></p>' }],
    ["script", { contenu_html: "<p>x</p><script>alert(1)</script>" }],
    ["gestionnaire d'événement", { contenu_html: '<p onclick="x()">texte assez long</p>' }],
    ["balise de gabarit non permise", { contenu_html: "<p>{{ .Subscriber.Attribs.consentement }}</p>" }],
    ["fonction de gabarit", { contenu_html: '<p>{{ Date "2006" }}</p>' }],
  ])("refuse : %s", async (_nom, surcharge) => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    const r = await appeler("creer_campagne_brouillon", { ...base, ...surcharge });
    expect(r.erreur).toBe(true);
    expect(faux.etat.campagnes).toHaveLength(0);
  });
  it("accepte un lien public et le vérifie", async () => {
    const { appeler } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    const r = await appeler("creer_campagne_brouillon", { ...base, contenu_html: '<p><a href="https://exemple.test/offre">offre</a></p>' });
    expect(r.erreur).toBe(false);
    expect(r.s["liens_verifies"]).toBeGreaterThan(0);
  });
  it("refuse une liste inconnue", async () => {
    const { appeler } = montage();
    const r = await appeler("creer_campagne_brouillon", { ...base, liste_ids: [42] });
    expect(String(r.s["message"])).toMatch(/introuvable/);
  });
  it("donne l'empreinte du contenu et l'état avec le mode d'envoi de test", async () => {
    const { appeler } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    const cree = await appeler("creer_campagne_brouillon", base);
    const id = (cree.s["campagne"] as { id: number }).id;
    const etat = await appeler("etat_campagne", { campagne_id: id });
    expect(etat.s["mode_envoi"]).toBe("test");
    expect(String(etat.s["avertissement"])).toMatch(/envoi de test, rien n'est parti/);
    expect((etat.s["campagne"] as { empreinte: string }).empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect((etat.s["campagne"] as { empreinte: string }).empreinte).toBe((cree.s["campagne"] as { empreinte: string }).empreinte);
  });
  it("le mode d'envoi passe à « reel » dès qu'un SMTP autre que Mailpit est actif", async () => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    faux.etat.smtp = [{ enabled: true, host: "smtp.exemple.test" }];
    const l = await appeler("lister_listes", {});
    expect(l.s["mode_envoi"]).toBe("reel");
  });
});
