// Simulateur B2C du courtier : trois outils (fonctions directes, schéma Zod appliqué), déterminisme, données 100 %
// fictives, pièges (doublon, consentement retiré, hors zone, client déjà équipé), vente croisée, oppositions.

import { describe, expect, it } from "vitest";
import { FOURNISSEURS_PROSPECTION_DEMO } from "../../src/demo/prospection/enregistrer.js";
import {
  BUREAUX, canauxUtilisables, construireJeuParticuliers, jeuParticuliers, outilClients, outilDemandesDevis, outilOppositions, piegesParticuliers,
} from "../../src/demo/prospection/particuliers.js";
import { NOM_ASSUREUR_PAR_DEFAUT } from "../../src/demo/prospection/referentiel.js";
import { appeler, toutesLesPages } from "./aide.js";

const jeu = jeuParticuliers();

describe("jeu B2C : déterminisme et fictivité", () => {
  it("deux constructions donnent exactement les mêmes données", () => {
    expect(JSON.stringify(construireJeuParticuliers())).toBe(JSON.stringify(jeu));
  });

  it("personnes fictives : suffixe (démonstration), courriels @exemple.invalid, téléphones +32 4 000 0X YY, rue des Exemples", () => {
    const personnes = [...jeu.demandes, ...jeu.clients, ...jeu.oppositions].map((x) => x.personne);
    expect(personnes.length).toBeGreaterThan(100);
    for (const p of personnes) {
      expect(p.nom).toMatch(/ \(démonstration\)$/);
      if (p.courriel !== null) expect(p.courriel).toMatch(/^[a-z]+\.[a-z]+\.\d{3}@exemple\.invalid$/);
      if (p.telephone !== null) expect(p.telephone).toMatch(/^\+32 4 000 0[1-9] \d{2}$/);
      expect(p.adresse.rue).toBe("Rue des Exemples");
    }
  });

  it("téléphones disjoints de ceux des entreprises (+32 4 000 00 NN)", () => {
    const tels = [...jeu.demandes, ...jeu.clients, ...jeu.oppositions].map((x) => x.personne.telephone).filter((t): t is string => t !== null);
    for (const t of tels) expect(t.startsWith("+32 4 000 00 ")).toBe(false);
  });

  it("aucun nom de personne ne sort deux fois pour des personnes distinctes (hors doublons voulus)", () => {
    const parNom = new Map<string, Set<string>>();
    for (const x of [...jeu.demandes, ...jeu.clients, ...jeu.oppositions]) {
      const cle = `${x.personne.courriel ?? ""}|${x.personne.telephone ?? ""}|${x.personne.adresse.codePostal}`;
      parNom.set(x.personne.nom, (parNom.get(x.personne.nom) ?? new Set()).add(cle));
    }
    for (const [nom, cles] of parNom) expect(cles.size, nom).toBe(1);
  });

  it("une douzaine de bureaux, tous dans la province de Liège", () => {
    expect(BUREAUX).toHaveLength(12);
    for (const b of BUREAUX) expect(b.adresse.province).toBe("Liège");
  });
});

describe("b2c_demandes_devis", () => {
  it("sans filtre : toutes les demandes, 10 par page, client de démonstration nommé, forme attendue", async () => {
    const p1 = await appeler(outilDemandesDevis);
    expect(p1["total"]).toBe(jeu.demandes.length);
    expect(p1["demandes"]).toHaveLength(10);
    expect(p1["client_demonstration"]).toBe(NOM_ASSUREUR_PAR_DEFAUT);
    const d = p1["demandes"][0];
    expect(d.marque).toBe("Devis en ligne (démonstration)");
    expect(["abandonne", "complete", "rendez_vous_pris"]).toContain(d.statut);
    expect(d.demande_le).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(d.consentement_marketing.canaux).sort()).toEqual(["email", "sms", "telephone"]);
    expect(await toutesLesPages(outilDemandesDevis, "demandes")).toHaveLength(jeu.demandes.length);
  });

  it("couvre les huit produits et les trois statuts", async () => {
    const toutes = await toutesLesPages(outilDemandesDevis, "demandes");
    expect(new Set(toutes.map((d) => d.produit)).size).toBe(8);
    expect(new Set(toutes.map((d) => d.statut)).size).toBe(3);
  });

  it("filtres produit, statut et dates se cumulent", async () => {
    const autos = await toutesLesPages(outilDemandesDevis, "demandes", { produits: ["auto"], statuts: ["complete"], depuis: "2026-07-01", jusqu_au: "2026-08-31" });
    expect(autos.length).toBeGreaterThan(0);
    for (const d of autos) {
      expect(d.produit).toBe("auto");
      expect(d.statut).toBe("complete");
      expect(d.demande_le >= "2026-07-01" && d.demande_le <= "2026-08-31").toBe(true);
    }
    expect((await appeler(outilDemandesDevis, { produits: ["auto", "credit"] }))["total"]).toBe(jeu.demandes.filter((d) => d.produit === "auto" || d.produit === "credit").length);
  });

  it("une date invalide est refusée en français", async () => {
    await expect(appeler(outilDemandesDevis, { depuis: "2026-02-30" })).rejects.toThrow(/depuis invalide/);
  });

  it("consentement : actif, retiré, aucun ; le canal ne compte que si l'accord est actif", async () => {
    const actifs = await toutesLesPages(outilDemandesDevis, "demandes", { consentement: "actif" });
    for (const d of actifs) expect(d.consentement_marketing).toMatchObject({ actif: true, retire_le: null });
    const retires = await toutesLesPages(outilDemandesDevis, "demandes", { consentement: "retire" });
    expect(retires.length).toBeGreaterThanOrEqual(2);
    for (const d of retires) {
      expect(d.consentement_marketing.actif).toBe(false);
      expect(d.consentement_marketing.canaux).toEqual({ email: false, telephone: false, sms: false });
      expect(Object.values(d.consentement_marketing.canaux_a_l_origine).some(Boolean)).toBe(true);
    }
    const aucun = await toutesLesPages(outilDemandesDevis, "demandes", { consentement: "aucun" });
    for (const d of aucun) expect(d.consentement_marketing).toMatchObject({ date: null, texte: null, actif: false });
    const tel = await toutesLesPages(outilDemandesDevis, "demandes", { canal: "telephone" });
    for (const d of tel) expect(d.consentement_marketing.canaux.telephone && d.consentement_marketing.actif).toBe(true);
    const ids = new Set(retires.map((d) => d.id));
    for (const d of tel) expect(ids.has(d.id)).toBe(false);
  });

  it("bureau le plus proche : celui de la commune quand il y en a un ; null hors zone", async () => {
    const liege = (await toutesLesPages(outilDemandesDevis, "demandes", { communes: ["Liège"] }))[0];
    expect(liege.bureau_plus_proche.id).toBe("bureau-liege");
    expect(liege.bureau_plus_proche.distance_km).toBeLessThan(5);
    const hors = await toutesLesPages(outilDemandesDevis, "demandes", { dans_zone: false });
    expect(hors.length).toBeGreaterThanOrEqual(2);
    for (const d of hors) {
      expect(d.bureau_plus_proche).toBeNull();
      expect(d.dans_zone).toBe(false);
    }
    const duBureau = await toutesLesPages(outilDemandesDevis, "demandes", { bureau: "bureau-verviers" });
    for (const d of duBureau) expect(d.bureau_plus_proche.id).toBe("bureau-verviers");
    for (const d of await toutesLesPages(outilDemandesDevis, "demandes", { dans_zone: true })) expect(d.bureau_plus_proche).not.toBeNull();
  });

  it("piège doublon : même personne, même produit, même jour, deux identifiants", async () => {
    const [a, b] = jeu.demandes.filter((d) => d.piege === "doublon");
    expect(a!.id).not.toBe(b!.id);
    expect(a!.personne).toEqual(b!.personne);
    expect([a!.produit, a!.demandeLe]).toEqual([b!.produit, b!.demandeLe]);
  });

  it("piège déjà équipé : la demande vise un produit que le client détient en contrat actif", async () => {
    const toutes = await toutesLesPages(outilDemandesDevis, "demandes");
    const equipees = toutes.filter((d) => d.deja_equipe);
    expect(equipees.length).toBe(2);
    for (const d of equipees) {
      const client = jeu.clients.find((c) => c.id === d.client_existant)!;
      expect(client.contrats.some((c) => c.produit === d.produit && c.statut === "actif")).toBe(true);
      expect(client.personne.courriel).toBe(d.personne.courriel);
    }
    expect(toutes.filter((d) => !d.deja_equipe).every((d) => d.client_existant === null)).toBe(true);
  });
});

describe("b2c_clients", () => {
  it("sans filtre : tous les clients, forme attendue, ancienneté cohérente", async () => {
    const p1 = await appeler(outilClients);
    expect(p1["total"]).toBe(jeu.clients.length);
    const c = p1["clients"][0];
    expect(c.client_depuis).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.anciennete_annees).toBeGreaterThanOrEqual(0);
    expect(c.contrats.length).toBeGreaterThan(0);
    for (const x of c.contrats) expect(["actif", "resilie"]).toContain(x.statut);
    expect(["non-vie", "vie", "credits"]).toContain(c.entite);
    expect(await toutesLesPages(outilClients, "clients")).toHaveLength(jeu.clients.length);
  });

  it("vente croisée « auto sans habitation » : seuls les contrats actifs comptent (habitation résilié = sans habitation)", async () => {
    const cibles = await toutesLesPages(outilClients, "clients", { detient: ["auto"], ne_detient_pas: ["habitation"] });
    expect(cibles.length).toBeGreaterThan(3);
    for (const c of cibles) {
      expect(c.produits_actifs).toContain("auto");
      expect(c.produits_actifs).not.toContain("habitation");
    }
    const resilie = cibles.find((c) => c.id === "cl905");
    expect(resilie).toBeDefined();
    expect(resilie.contrats.find((x: any) => x.produit === "habitation").statut).toBe("resilie");
    // « Détient auto ET habitation » exclut le même client.
    const equipes = await toutesLesPages(outilClients, "clients", { detient: ["auto", "habitation"] });
    expect(equipes.map((c) => c.id)).not.toContain("cl905");
    expect(equipes.length + cibles.length).toBe((await toutesLesPages(outilClients, "clients", { detient: ["auto"] })).length);
  });

  it("filtres ancienneté, entité, zone et canal", async () => {
    const anciens = await toutesLesPages(outilClients, "clients", { anciennete_min: 10 });
    expect(anciens.length).toBeGreaterThan(0);
    for (const c of anciens) expect(c.anciennete_annees).toBeGreaterThanOrEqual(10);
    const tranche = await toutesLesPages(outilClients, "clients", { anciennete_min: 3, anciennete_max: 5 });
    for (const c of tranche) expect(c.anciennete_annees >= 3 && c.anciennete_annees <= 5).toBe(true);
    for (const c of await toutesLesPages(outilClients, "clients", { entite: "vie" })) expect(c.entite).toBe("vie");
    for (const c of await toutesLesPages(outilClients, "clients", { communes: ["Seraing"] })) expect(c.adresse.commune).toBe("Seraing");
    for (const c of await toutesLesPages(outilClients, "clients", { canal: "email" })) expect(c.consentement_marketing.canaux.email).toBe(true);
  });

  it("piège hors zone : un client de Namur, sans bureau proche, écarté par dans_zone=true", async () => {
    const hors = await toutesLesPages(outilClients, "clients", { dans_zone: false });
    expect(hors.map((c) => c.id)).toContain("cl904");
    for (const c of hors) expect(c.bureau_plus_proche).toBeNull();
    expect((await toutesLesPages(outilClients, "clients", { dans_zone: true })).map((c) => c.id)).not.toContain("cl904");
  });

  it("piège consentement retiré : aucun canal utilisable", async () => {
    const c = (await toutesLesPages(outilClients, "clients", { communes: ["Seraing"] })).find((x) => x.id === "cl903")!;
    expect(c.consentement_marketing).toMatchObject({ actif: false, canaux: { email: false, telephone: false, sms: false } });
    expect(c.consentement_marketing.retire_le).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.consentement_marketing.retire_le >= c.consentement_marketing.date).toBe(true);
    const parCanal = await toutesLesPages(outilClients, "clients", { canal: "email" });
    expect(parCanal.map((x) => x.id)).not.toContain("cl903");
  });

  it("piège doublon : la même personne figure dans deux fiches (entités non-vie et vie)", async () => {
    const doublons = (await toutesLesPages(outilClients, "clients")).filter((c) => ["cl901", "cl902"].includes(c.id));
    expect(doublons).toHaveLength(2);
    expect(doublons[0].personne).toEqual(doublons[1].personne);
    expect(doublons.map((c) => c.entite).sort()).toEqual(["non-vie", "vie"]);
  });
});

describe("b2c_oppositions", () => {
  it("sans filtre : toutes les oppositions, forme attendue", async () => {
    const p1 = await appeler(outilOppositions);
    expect(p1["total"]).toBe(jeu.oppositions.length);
    const o = p1["oppositions"][0];
    expect(o.inscrit_le).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(o.canaux_opposes.length).toBeGreaterThan(0);
    expect(o.source_libelle.length).toBeGreaterThan(0);
    expect(await toutesLesPages(outilOppositions, "oppositions")).toHaveLength(jeu.oppositions.length);
  });

  it("la liste « Ne m'appelez plus » n'oppose que le téléphone et porte un numéro", async () => {
    const registre = await toutesLesPages(outilOppositions, "oppositions", { sources: ["registre_ne_m_appelez_plus"] });
    expect(registre.length).toBeGreaterThan(5);
    for (const o of registre) {
      expect(o.canaux_opposes).toEqual(["telephone"]);
      expect(o.personne.telephone).not.toBeNull();
    }
    for (const o of await toutesLesPages(outilOppositions, "oppositions", { canal: "email" })) expect(o.canaux_opposes).toContain("email");
  });

  it("vérification d'un contact : par téléphone ou par courriel, correspondances avec demandes et clients", async () => {
    const op = jeu.oppositions.find((o) => o.id === "op901")!;
    const parTel = await appeler(outilOppositions, { telephone: op.personne.telephone!.replace(/ /g, "") });
    expect(parTel["total"]).toBe(1);
    expect(parTel["oppositions"][0].correspond_a.demandes.length).toBe(1);
    const op2 = jeu.oppositions.find((o) => o.id === "op902")!;
    const parMail = await appeler(outilOppositions, { courriel: op2.personne.courriel!.toUpperCase() });
    expect(parMail["oppositions"][0].correspond_a.clients.length).toBe(1);
    expect((await appeler(outilOppositions, { telephone: "+32 4 000 09 99" }))["total"]).toBe(0);
  });

  it("une opposition postérieure à l'accord : la demande et le client la portent, et le téléphone reste coché à l'origine", async () => {
    const demandes = await toutesLesPages(outilDemandesDevis, "demandes", { consentement: "actif", canal: "telephone" });
    const conflit = demandes.filter((d) => d.opposition_canaux.includes("telephone"));
    expect(conflit.length).toBeGreaterThanOrEqual(1);
    const clients = await toutesLesPages(outilClients, "clients", { canal: "telephone" });
    expect(clients.filter((c) => c.opposition_canaux.includes("telephone")).length).toBeGreaterThanOrEqual(1);
    const op = jeu.oppositions.find((o) => o.id === "op901")!;
    const d = jeu.demandes.find((x) => x.personne === op.personne)!;
    expect(op.inscritLe > d.consentement.date!).toBe(true);
  });

  it("zone et date de début", async () => {
    for (const o of await toutesLesPages(outilOppositions, "oppositions", { depuis: "2026-01-01" })) expect(o.inscrit_le >= "2026-01-01").toBe(true);
    for (const o of await toutesLesPages(outilOppositions, "oppositions", { communes: ["Liège"] })) expect(o.adresse.commune).toBe("Liège");
  });
});

describe("pièges, outils et fournisseur", () => {
  it("les quatre pièges demandés existent", () => {
    const ids = new Set(piegesParticuliers().map((p) => p.id));
    for (const id of ["doublon", "consentement_retire", "hors_zone", "deja_equipe"] as const) expect(ids.has(id), id).toBe(true);
  });

  it("canauxUtilisables : vides sans accord ou après retrait", () => {
    const sans = jeu.demandes.find((d) => d.consentement.date === null)!;
    expect(Object.values(canauxUtilisables(sans.consentement)).some(Boolean)).toBe(false);
    const retire = jeu.clients.find((c) => c.piege === "consentement_retire")!;
    expect(Object.values(canauxUtilisables(retire.consentement)).some(Boolean)).toBe(false);
  });

  it("trois outils en lecture seule, signés comme les autres, enregistrés dans le service b2c", () => {
    const f = FOURNISSEURS_PROSPECTION_DEMO().find((x) => x.service === "b2c")!;
    expect(f.mode).toBe("demonstration");
    expect(f.outils.map((o) => o.nom)).toEqual(["b2c_demandes_devis", "b2c_clients", "b2c_oppositions"]);
    for (const o of f.outils) {
      expect(o.annotations?.readOnlyHint).toBe(true);
      expect(o.annotations?.destructiveHint).toBe(false);
      expect(o.description.startsWith("LECTURE.")).toBe(true);
    }
  });

  it("aucune réponse ne contient de vrai nom ni de domaine réel de courriel", async () => {
    const tout = JSON.stringify([await toutesLesPages(outilDemandesDevis, "demandes"), await toutesLesPages(outilClients, "clients"), await toutesLesPages(outilOppositions, "oppositions")]);
    const courriels = tout.match(/[\w.+-]+@[\w.-]+/g) ?? [];
    expect(courriels.length).toBeGreaterThan(50);
    for (const c of courriels) expect(c.endsWith("@exemple.invalid")).toBe(true);
  });
});
