// Outils du service « emailing » : consentement exigé, brouillon jamais envoyé, désinscription présente, adresses privées refusées,
// suppression respectée, envoi absent du catalogue. Faux listmonk en mémoire, aucun conteneur.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { construireCatalogue, appelerOutil } from "../../src/outils.js";
import { FICHE_EMAILING } from "../../src/services.js";
import { fournisseurEmailingReel, optionsEmailingDepuisEnv } from "../../src/reel/emailing/outils.js";
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
  // E1 (audit du 29/10/2026) : un abonné existant inscrit à une NOUVELLE liste garde la trace de ce consentement-là.
  it("abonné existant et nouvelle liste : le consentement est enregistré par liste AVANT l'inscription, l'historique est gardé", async () => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    await appeler("creer_liste", { nom: "Autre" });
    await appeler("ajouter_abonnes", { liste_id: 1, abonnes: [{ email: "marie@exemple.test", consentement: CONSENTEMENT }] });
    const nouveau = { date: "2026-10-01", source: "Formulaire du site, page devis", texte: "J'accepte de recevoir les offres de la liste Autre." };
    const r = await appeler("ajouter_abonnes", { liste_id: 2, abonnes: [{ email: "marie@exemple.test", consentement: nouveau }] });
    expect((r.s["resultats"] as Array<{ resultat: string }>)[0]?.resultat).toBe("ajoute");
    const a = faux.etat.abonnes[0]!;
    const historique = a.attribs?.["consentements"] as Record<string, Record<string, string>>;
    expect(historique["1"]).toMatchObject({ date: "2026-09-12", texte: CONSENTEMENT.texte });
    expect(historique["2"]).toMatchObject({ date: "2026-10-01", source: nouveau.source, texte: nouveau.texte, enregistre_par: "passerelle-emailing", enregistre_le: "2026-10-21T10:00:00.000Z" });
    expect(a.attribs?.["consentement"]).toMatchObject({ date: "2026-09-12" });
    const iPatch = faux.etat.appels.findIndex((x) => x.methode === "PATCH" && x.chemin === `/api/subscribers/${a.id}`);
    const iListe = faux.etat.appels.findIndex((x) => x.methode === "PUT" && x.chemin === "/api/subscribers/lists");
    expect(iPatch).toBeGreaterThan(-1);
    expect(iPatch).toBeLessThan(iListe);
    expect(faux.etat.appels[iPatch]!.corps).not.toHaveProperty("lists");
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

describe("ajouter_abonnes : abonné existant que la recherche peut manquer (E2)", () => {
  it("le retrouve parmi plus de 20 adresses voisines", async () => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    for (let i = 0; i < 25; i++) faux.etat.abonnes.push({ id: 100 + i, email: `a${i}.jean@exemple.test`, name: "V", status: "enabled", lists: [] });
    faux.etat.abonnes.push({ id: 200, email: "jean@exemple.test", name: "J", status: "enabled", lists: [{ id: 1, subscription_status: "confirmed" }] });
    const r = await appeler("ajouter_abonnes", { liste_id: 1, abonnes: [{ email: "jean@exemple.test", consentement: CONSENTEMENT }] });
    expect((r.s["resultats"] as Array<{ resultat: string }>)[0]!.resultat).toBe("deja_present");
    expect(faux.etat.appels.some((a) => a.methode === "POST" && a.chemin === "/api/subscribers")).toBe(false);
  });
  it("409 : relit l'abonné et l'inscrit à la liste au lieu de le dire déjà présent", async () => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    faux.etat.abonnes.push({ id: 300, email: "marie@exemple.test", name: "M", status: "enabled", lists: [] });
    faux.etat.masques.set("marie@exemple.test", 1);
    const r = await appeler("ajouter_abonnes", { liste_id: 1, abonnes: [{ email: "marie@exemple.test", consentement: CONSENTEMENT }] });
    expect((r.s["resultats"] as Array<{ resultat: string }>)[0]!.resultat).toBe("ajoute");
    expect(faux.etat.abonnes.find((a) => a.id === 300)!.lists).toEqual([{ id: 1, subscription_status: "confirmed" }]);
    expect((faux.etat.abonnes.find((a) => a.id === 300)!.attribs?.["consentements"] as Record<string, unknown>)["1"]).toMatchObject({ date: CONSENTEMENT.date });
  });
  it("409 sans abonné relisible : refusé, jamais « déjà présent »", async () => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    faux.etat.abonnes.push({ id: 301, email: "paul@exemple.test", name: "P", status: "enabled", lists: [] });
    faux.etat.masques.set("paul@exemple.test", Infinity);
    const r = await appeler("ajouter_abonnes", { liste_id: 1, abonnes: [{ email: "paul@exemple.test", consentement: CONSENTEMENT }] });
    const res = (r.s["resultats"] as Array<{ resultat: string; motif?: string }>)[0]!;
    expect(res.resultat).toBe("refuse");
    expect(res.motif).toMatch(/pas inscrite/);
    expect(faux.etat.abonnes.find((a) => a.id === 301)!.lists).toEqual([]);
  });
});

describe("creer_campagne_brouillon", () => {
  const base = { nom: "Lettre d'octobre", sujet: "Nos nouveautés", liste_ids: [1], contenu_html: "<p>Bonjour {{ .Subscriber.FirstName }}, voici nos nouveautés.</p>", contenu_texte: "Bonjour, voici nos nouveautés." };

  it("par défaut, aucune mention d'information IA dans le pied des campagnes", async () => {
    const { appeler, faux } = montage();
    await appeler("creer_liste", { nom: "Salon" });
    const r = await appeler("creer_campagne_brouillon", base);
    expect(r.erreur).toBe(false);
    const c = faux.etat.campagnes[0]!;
    expect(c.body).not.toMatch(/assistant IA/);
    expect(c.altbody).not.toMatch(/assistant IA/);
    expect(c.body).toContain("{{ UnsubscribeURL }}");
  });

  it("mention réactivée : présente une seule fois, avant le pied de désinscription, échappée dans le HTML", async () => {
    const faux = creerFauxListmonk();
    const client = new ClientListmonk({ url: "http://127.0.0.1:19000", jeton: "atelier-gestion:jeton-de-test-0123456789", fetch: faux.fetch });
    const sans = fournisseurEmailingReel({ client, adresseAutorisee: PUBLIC, resoudre: RESOUDRE, mentionIa: null });
    const perso = fournisseurEmailingReel({ client, adresseAutorisee: PUBLIC, resoudre: RESOUDRE, mentionIa: "Rédigé avec <IA> & relu" });
    const ctx = { service: "emailing", mode: "reel" as const, identite: { compte: "Poste local", propriete: { id: "listmonk/local", libelle: "listmonk" } }, jetonPorteur: null };
    await appelerOutil(construireCatalogue(FICHE_EMAILING, "reel", sans), "creer_liste", { nom: "Salon" }, ctx);
    await appelerOutil(construireCatalogue(FICHE_EMAILING, "reel", sans), "creer_campagne_brouillon", base, ctx);
    await appelerOutil(construireCatalogue(FICHE_EMAILING, "reel", perso), "creer_campagne_brouillon", base, ctx);
    await appelerOutil(construireCatalogue(FICHE_EMAILING, "reel", perso), "creer_campagne_brouillon", { ...base, contenu_texte: `${base.contenu_texte}\n\nRédigé avec <IA> & relu` }, ctx);
    expect(faux.etat.campagnes[0]!.altbody).not.toMatch(/IA/);
    const avec = faux.etat.campagnes[1]!;
    expect(avec.body).toContain("Rédigé avec &lt;IA&gt; &amp; relu");
    expect(avec.altbody).toContain("Rédigé avec <IA> & relu");
    expect(avec.body.indexOf("Rédigé avec")).toBeLessThan(avec.body.indexOf("{{ UnsubscribeURL }}"));
    expect(faux.etat.campagnes[2]!.altbody!.split("Rédigé avec <IA> & relu")).toHaveLength(2);
  });

  it("la variable PASSERELLE_MENTION_IA suffit à remettre la mention au pied des campagnes ; sans elle, aucune", async () => {
    const dossier = mkdtempSync(join(tmpdir(), "emailing-jeton-"));
    try {
      const fichier = join(dossier, "jeton");
      writeFileSync(fichier, "atelier-gestion:jeton-de-test-0123456789", { mode: 0o600 });
      const env = { PASSERELLE_LISTMONK_JETON_FICHIER: fichier };
      const faux = creerFauxListmonk();
      const client = new ClientListmonk({ url: "http://127.0.0.1:19000", jeton: "atelier-gestion:jeton-de-test-0123456789", fetch: faux.fetch });
      const ctx = { service: "emailing", mode: "reel" as const, identite: { compte: "Poste local", propriete: { id: "listmonk/local", libelle: "listmonk" } }, jetonPorteur: null };
      const catalogue = (variables: NodeJS.ProcessEnv) =>
        construireCatalogue(FICHE_EMAILING, "reel", fournisseurEmailingReel({ ...optionsEmailingDepuisEnv(variables), client, adresseAutorisee: PUBLIC, resoudre: RESOUDRE }));
      await appelerOutil(catalogue(env), "creer_liste", { nom: "Salon" }, ctx);
      await appelerOutil(catalogue(env), "creer_campagne_brouillon", base, ctx);
      await appelerOutil(catalogue({ ...env, PASSERELLE_MENTION_IA: "Rédigé avec une IA." }), "creer_campagne_brouillon", base, ctx);
      const [sans, avec] = faux.etat.campagnes;
      expect(sans!.body).not.toContain("Rédigé avec une IA.");
      expect(sans!.altbody).not.toContain("Rédigé avec une IA.");
      expect(avec!.body).toContain("Rédigé avec une IA.");
      expect(avec!.altbody).toContain("Rédigé avec une IA.");
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

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
