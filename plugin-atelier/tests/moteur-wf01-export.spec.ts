/**
 * Chaîne WF-01 (#51, tâche 3) : étapes en code du moteur et export CRM, avec un double de CRM.
 * Seam : hôte Paperclip double, base en mémoire qui rejoue les unicités du SQL, vrai `creerEtapesWf01`, aucun appel réseau (doubles dans moteur-wf01-doubles.ts).
 */
import { describe, expect, it } from "vitest";
import type { Prospect } from "../src/contrats/index.js";
import { creerEtapesWf01, exporterLot, type CrmMoteur } from "../src/moteur/export-crm.js";
import { rangPorte } from "../src/moteur/gabarits.js";
import { ENTREES, EXPORT_CRM, GABARIT, LIMITES, approbationNative, P1, P2, P3, P4, SOC, SOURCE_COLLECTE, T, h, jusquAutorisation, monter, prospect } from "./moteur-wf01-doubles.js";

describe("rang de la porte", () => {
  it("est la dernière étape qui n'est pas en code (7 pour WF-01) ; une étape unique garde le rang 1", () => {
    expect(rangPorte(GABARIT)).toBe(7);
    expect(rangPorte({ ...GABARIT, etapes: [GABARIT.etapes[1]!] })).toBe(2);
  });
});

describe("étapes en code avant la porte", () => {
  it("une étape en code ne crée aucune tâche ni réveil ; la chaîne de blocage saute les étapes en code", async () => {
    const t = await jusquAutorisation();
    const enCode = t.etapes.filter((e) => GABARIT.etapes.find((g) => g.rang === e.rang)!.nature === "code");
    expect(enCode.map((e) => e.rang)).toEqual([1, 3, 6, 8, 9, 10]);
    expect(enCode.every((e) => e.issueId === null)).toBe(true);
    expect(t.creations.map((c) => c.originId)).toEqual([2, 4, 5, 7].map((r) => `mission:${t.missionId}:${r}`));
    expect(t.creations.map((c) => c.blockedByIssueIds)).toEqual([[], [t.issueDuRang(2)], [t.issueDuRang(4)], [t.issueDuRang(5)]]);
    expect(t.reveils).toEqual([2, 4, 5, 7].map(t.issueDuRang));
    expect(t.etat()).toBe("attente_autorisation");
    expect(t.etapes.find((e) => e.rang === 3)!.sortie).toEqual({ prospectIds: [P1, P2, P3], doublons: [], dedupliques: [P1, P2, P3], horsMission: [] });
    expect(t.etapes.find((e) => e.rang === 6)!.sortie).toEqual({ retenus: [P1, P2, P3], marques: [], exclus: [] });
  });

  it("exportCrm absent : la mission passe en attente_information, sans aucun réveil", async () => {
    const t = await monter({ entrees: { brief: "brief", cibles: "cibles" } });
    await t.executeur.demarrerMission(SOC, t.missionId);
    expect(t.missions.get(t.missionId)!.etat).toBe("attente_information");
    expect(t.reveils).toEqual([]);
    expect(t.journal.find((j) => j.type === "moteur.entree_manquante")?.donnees).toMatchObject({ rang: 1, manquantes: ["exportCrm"] });
  });

  it("exportCrm sans canal ou avec un service vide : même refus", async () => {
    for (const exportCrm of [{ service: "crm", entite: "e" }, { service: " ", canal: "c", entite: "e" }, ["crm"]]) {
      const t = await monter({ entrees: { ...ENTREES, exportCrm } });
      await t.executeur.demarrerMission(SOC, t.missionId);
      expect(t.missions.get(t.missionId)!.etat).toBe("attente_information");
    }
  });

  it("gabarit à étape en code sans les étapes branchées : blocage contrat_invalide", async () => {
    const t = await monter({ sansEtapesCode: true });
    await t.executeur.demarrerMission(SOC, t.missionId);
    expect(t.missions.get(t.missionId)!.etat).toBe("blocage");
    expect(t.reveils).toEqual([]);
  });
});

describe("approbation native et export CRM", () => {
  it("à l'approbation, l'export part sans aucun réveil de modèle et la mission finit cloturee", async () => {
    const t = await jusquAutorisation({ oppositions: [{ type: "courriel", valeur: h(2) }] });
    const reveils = t.reveils.length;
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.etat()).toBe("cloturee");
    expect(t.reveils).toHaveLength(reveils);
    expect(t.crm.ecritures.map((e) => e.prospectId)).toEqual([P1, P2, P3]);
    expect(t.journal.find((j) => j.type === "moteur.export_marque_opposition")?.donnees).toMatchObject({ ids: [P2] });
    expect(t.etapes.find((e) => e.rang === 8)!.sortie).toEqual({ approuvee: true });
    expect(t.etapes.find((e) => e.rang === 9)).toMatchObject({ etat: "terminee", sortie: { reussis: [P1, P2, P3], echecs: [], essais: 1 } });
    expect(t.etapes.find((e) => e.rang === 10)).toMatchObject({ etat: "terminee", sortie: { verifies: 3 } });
  });

  it("un prospect déjà présent dans le CRM n'est pas réécrit", async () => {
    const t = await jusquAutorisation();
    t.crm.deja([P2]);
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.etat()).toBe("cloturee");
    expect(t.crm.ecritures.map((e) => e.prospectId)).toEqual([P1, P3]);
  });

  it("export rejoué : aucun doublon (clé appliquée, ou présence constatée après un arrêt entre l'écriture et la marque)", async () => {
    const t = await jusquAutorisation();
    const marque = t.base.marquerExecution;
    let panne = true;
    t.base.marquerExecution = async (c: string, cle: string, statut: string) => {
      if (panne && cle.includes(":export_crm:")) {
        panne = false;
        throw new Error("arrêt simulé entre l'écriture et la marque");
      }
      return marque(c, cle, statut);
    };
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.etat()).toBe("en_execution");
    await t.executeur.reprendre(SOC);
    expect(t.etat()).toBe("cloturee");
    expect(t.crm.ecritures.map((e) => e.prospectId).sort()).toEqual([P1, P2, P3].sort());
    const avant = t.crm.ecritures.length;
    const lot = [P1, P2, P3].map((prospectId) => ({ prospectId, marqueOpposition: false }));
    expect((await exporterLot({ crm: t.crm, base: t.base as never }, { companyId: SOC, id: t.missionId }, 9, lot)).reussis).toEqual([P1, P2, P3]);
    expect(t.crm.ecritures).toHaveLength(avant);
  });

  it("échec sur deux prospects : listes exactes, la reprise n'écrit que ces deux-là puis la mission clôt", async () => {
    const t = await jusquAutorisation();
    t.crm.refuserSur([P1, P3]);
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.etat()).toBe("en_execution");
    expect(t.crm.ecritures.map((e) => e.prospectId)).toEqual([P2]);
    const partiel = t.journal.find((j) => j.type === "moteur.export_partiel")!.donnees!;
    expect(partiel).toMatchObject({ reussis: [P2], echecs: [{ prospectId: P1, raison: `CRM indisponible pour ${P1}` }, { prospectId: P3, raison: `CRM indisponible pour ${P3}` }] });
    expect(t.etapes.find((e) => e.rang === 9)).toMatchObject({ etat: "en_cours", sortie: { reussis: [P2], essais: 1 } });
    t.crm.reparer();
    await t.executeur.reprendre(SOC);
    expect(t.etat()).toBe("cloturee");
    expect(t.crm.ecritures.map((e) => e.prospectId)).toEqual([P2, P1, P3]);
  });

  it("export seulement préparé, pas encore écrit : la vérification ne le confirme pas, la mission part en blocage et ne se clôt pas", async () => {
    const t = await jusquAutorisation();
    t.crm.nonConfirmes([P2]);
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.etat()).toBe("blocage");
    expect(t.etapes.find((e) => e.rang === 10)!.etat).not.toBe("terminee");
    expect(t.journal.find((j) => j.type === "moteur.blocage")!.donnees).toMatchObject({ raison: "absents_du_crm", absents: [P2] });
  });

  it("trois essais partiels : la mission part en blocage, le coordinateur est signalé", async () => {
    const t = await jusquAutorisation();
    t.crm.refuserSur([P1]);
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
    await t.executeur.reprendre(SOC);
    expect(t.etat()).toBe("en_execution");
    await t.executeur.reprendre(SOC);
    expect(t.etat()).toBe("blocage");
    expect(t.journal.filter((j) => j.type === "moteur.export_partiel")).toHaveLength(3);
    expect(t.journal.some((j) => j.type === "moteur.blocage" && j.donnees?.evenement === "effet_ambigu")).toBe(true);
    expect(t.etapes.find((e) => e.rang === 9)!.sortie).toMatchObject({ essais: 3 });
  });

  it("un done sans approbation ne déclenche aucun export", async () => {
    const t = await jusquAutorisation();
    t.natif({ status: "done", executionPolicy: { stages: [{ id: "approbation", type: "approval" }] }, executionState: { completedStageIds: [] } });
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.etat()).toBe("attente_autorisation");
    expect(t.crm.ecritures).toEqual([]);
    expect(t.issues.get(t.issue)!.status).toBe("in_review");
  });

  it("approuvée sur une autre révision que celle relue : aucun export", async () => {
    const t = await jusquAutorisation();
    t.docs.set(t.issue, "rev-2");
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.etat()).toBe("attente_autorisation");
    expect(t.crm.ecritures).toEqual([]);
    expect(t.journal.some((j) => j.type === "moteur.revision_changee")).toBe(true);
  });

  it("un identifiant ajouté par l'agent au lot et non retenu n'est jamais exporté, et le journal le dit", async () => {
    const t = await jusquAutorisation({ lot: [P1, P2, P3, P4] });
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.etat()).toBe("cloturee");
    expect(t.crm.ecritures.map((e) => e.prospectId)).toEqual([P1, P2, P3]);
    expect(t.journal.find((j) => j.type === "moteur.export_ids_ecartes")?.donnees).toMatchObject({ ids: [P4] });
  });

  it("la reprise d'une mission en_execution sans passe intermédiaire termine l'export et clôt, sans réveil", async () => {
    const t = await jusquAutorisation();
    const reveils = t.reveils.length;
    t.approuver();
    t.missions.get(t.missionId)!.etat = "en_execution";
    t.missions.get(t.missionId)!.rangCourant = 7;
    await t.executeur.reprendre(SOC);
    expect(t.etat()).toBe("cloturee");
    expect(t.reveils).toHaveLength(reveils);
  });
});

describe("export CRM : appel unique, attente, reprise", () => {
  it("sans approbation : aucun essai consommé sur 5 passes, aucun échec, un seul journal d'attente, puis l'export part quand l'accord arrive", async () => {
    const t = await jusquAutorisation();
    t.crm.enAttente(true);
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
    for (let i = 0; i < 5; i++) await t.executeur.reprendre(SOC);
    expect(t.etat()).toBe("en_execution");
    expect(t.etapes.find((e) => e.rang === 9)).toMatchObject({ etat: "en_cours", sortie: { reussis: [], echecs: [], essais: 0, enAttente: true } });
    expect(t.journal.filter((j) => j.type === "moteur.export_en_attente")).toHaveLength(1);
    expect(t.journal.find((j) => j.type === "moteur.export_en_attente")!.donnees).toMatchObject({ appelId: "appel-1", consigne: "Un humain doit approuver." });
    expect(t.journal.some((j) => j.type === "moteur.export_partiel")).toBe(false);
    expect(t.crm.ecritures).toEqual([]);
    t.crm.enAttente(false);
    await t.executeur.reprendre(SOC);
    expect(t.etat()).toBe("cloturee");
    expect(t.crm.appels).toEqual([[P1, P2, P3]]);
  });

  it("lot vide (tous les prospects écartés) : la mission part en blocage, rien n'est exporté", async () => {
    const t = await jusquAutorisation({ zone: { codesPostaux: ["9999"] } });
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.etat()).toBe("blocage");
    expect(t.journal.find((j) => j.type === "moteur.blocage")!.donnees).toMatchObject({ evenement: "effet_ambigu", raison: "lot_vide" });
    expect(t.crm.ecritures).toEqual([]);
  });

  it("arrêt une fois entre la vérification et la clôture (effet_confirme) : la reprise clôture, sans nouvelle écriture", async () => {
    const t = await jusquAutorisation();
    const enregistrer = t.base.enregistrerExecution;
    let panne = true;
    t.base.enregistrerExecution = async (e: { cle: string; companyId: string }) => {
      if (panne && e.cle.includes(":effet_confirme")) {
        panne = false;
        throw new Error("arrêt simulé avant effet_confirme");
      }
      return enregistrer(e as never);
    };
    t.approuver();
    await expect(t.executeur.surDoneNatif(SOC, t.issue)).rejects.toThrow("arrêt simulé");
    expect(t.etat()).toBe("en_execution");
    expect(t.etapes.find((e) => e.rang === 10)!.etat).toBe("terminee");
    await t.executeur.reprendre(SOC);
    expect(t.etat()).toBe("cloturee");
    expect(t.crm.appels).toEqual([[P1, P2, P3]]);
  });

  it("rejeu du done natif pendant un export partiel : aucun essai de plus, aucune écriture de plus", async () => {
    const t = await jusquAutorisation();
    t.crm.refuserSur([P1]);
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.etapes.find((e) => e.rang === 9)!.sortie).toMatchObject({ reussis: [P2, P3], essais: 1 });
    const ecritures = t.crm.ecritures.length;
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.etapes.find((e) => e.rang === 9)!.sortie).toMatchObject({ essais: 1 });
    expect(t.journal.filter((j) => j.type === "moteur.export_partiel")).toHaveLength(1);
    expect(t.crm.ecritures).toHaveLength(ecritures);
  });

  it("le journal des identifiants écartés ne garde que des identifiants conformes, au plus 50, avec le total", async () => {
    const t = await jusquAutorisation({ lot: [P1, P2, P3, "pas-un-identifiant", ...Array.from({ length: 60 }, (_, i) => `00000000-0000-4000-8000-${String(i + 100).padStart(12, "0")}`)] });
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
    const d = t.journal.find((j) => j.type === "moteur.export_ids_ecartes")!.donnees as { ids: string[]; total: number };
    expect(d.total).toBe(61);
    expect(d.ids).toHaveLength(50);
    expect(d.ids).not.toContain("pas-un-identifiant");
  });
});

describe("étapes en code : périmètre, doublons, exclusions", () => {
  it("périmètre hors schéma (service, canal ou entité inconnus) : refusé au rang 1", async () => {
    for (const exportCrm of [{ service: "inconnu", canal: "courriel", entite: "entite-1" }, { service: "crm", canal: "fax", entite: "entite-1" }, { service: "crm", canal: "courriel", entite: "Entité 1" }]) {
      const t = await monter({ entrees: { ...ENTREES, exportCrm } });
      await t.executeur.demarrerMission(SOC, t.missionId);
      expect(t.missions.get(t.missionId)!.etat).toBe("attente_information");
    }
  });

  const etapes = (prospects: Prospect[]) =>
    creerEtapesWf01({ lireProspects: async (_c, ids) => ids.flatMap((id) => prospects.filter((p) => p.id === id)), sourcesCollecte: async () => [SOURCE_COLLECTE], contexteExclusions: async () => ({ contexte: { maintenant: T, modeCampagne: "reel", canaux: [], zone: null, clientsActuels: [] }, oppositions: [] }), deps: {} as never });
  const ctx = (entrees: Record<string, unknown>) => ({ companyId: SOC, missionId: "m", campagneId: null, entrees });

  it("deux fiches au même numéro BCE : la seconde est dédoublonnée", async () => {
    const a = { ...prospect(1), numeroBce: "0123456789" };
    const b = { ...prospect(2), numeroBce: "0123.456.789" };
    const r = await etapes([a, b, prospect(3)]).avantPorte.dedupliquer!(ctx({ prospectIds: [a.id, b.id, prospect(3).id] }));
    expect(r).toEqual({ sortie: { prospectIds: [a.id, prospect(3).id], doublons: [b.id], dedupliques: [a.id, prospect(3).id], horsMission: [] } });
  });

  it("un doublon réintroduit par la sortie de l'agent du rang 5 est écarté", async () => {
    const r = await etapes([prospect(1), prospect(2)]).avantPorte.controler_exclusions!(ctx({ prospectIds: [P1, P2], doublons: [P2], dedupliques: [P1] }));
    expect(r).toEqual({ sortie: { retenus: [P1], marques: [], exclus: [] } });
  });

  it("un prospect au statut exclu est écarté avec ses motifs, ou avec « statut_exclu » si la liste est vide", async () => {
    const motif = { motif: "entreprise_inactive" as const, detail: "inactive", constateLe: T };
    const exclu = { ...prospect(1), statut: "exclu" as const, motifsExclusion: [motif] };
    const sansMotif = { ...prospect(2), statut: "exclu" as const, motifsExclusion: [] };
    const r = await etapes([exclu, sansMotif, prospect(3)]).avantPorte.controler_exclusions!(ctx({ prospectIds: [P1, P2, P3], dedupliques: [P1, P2, P3] }));
    expect(r).toEqual({ sortie: { retenus: [P3], marques: [], exclus: [{ prospectId: P1, motifs: ["entreprise_inactive"] }, { prospectId: P2, motifs: ["statut_exclu"] }] } });
  });
});

describe("étapes en code : origine des prospects (#58)", () => {
  const etapes = (prospects: Prospect[], sources: string[]) =>
    creerEtapesWf01({ lireProspects: async (_c, ids) => ids.flatMap((id) => prospects.filter((p) => p.id === id)), sourcesCollecte: async () => sources, contexteExclusions: async () => ({ contexte: { maintenant: T, modeCampagne: "reel", canaux: [], zone: null, clientsActuels: [] }, oppositions: [] }), deps: {} as never });
  const ctx = (entrees: Record<string, unknown>) => ({ companyId: SOC, missionId: "m", campagneId: null, entrees });
  const INCONNUS = Array.from({ length: 60 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1000).padStart(12, "0")}`);

  it("rang 6 sans dedupliques : refus par défaut, tout identifiant va dans exclus avec hors_mission", async () => {
    const r = await etapes([prospect(1), prospect(2)], [SOURCE_COLLECTE]).avantPorte.controler_exclusions!(ctx({ prospectIds: [P1, P2] }));
    expect(r).toEqual({ sortie: { retenus: [], marques: [], exclus: [{ prospectId: P1, motifs: ["hors_mission"] }, { prospectId: P2, motifs: ["hors_mission"] }] } });
  });

  it("rang 6 : un doublon réintroduit reste retiré en silence (pas hors_mission) ; un identifiant ajouté est exclu", async () => {
    const r = await etapes([prospect(1), prospect(2), prospect(3)], [SOURCE_COLLECTE]).avantPorte.controler_exclusions!(ctx({ prospectIds: [P1, P2, P3], doublons: [P2], dedupliques: [P1] }));
    expect(r).toEqual({ sortie: { retenus: [P1], marques: [], exclus: [{ prospectId: P3, motifs: ["hors_mission"] }] } });
  });

  it("rang 6 : seuls des identifiants conformes, au plus 50, entrent dans exclus", async () => {
    const r = await etapes([prospect(1)], [SOURCE_COLLECTE]).avantPorte.controler_exclusions!(ctx({ prospectIds: [P1, "<b>x</b>", ...INCONNUS], dedupliques: [P1] }));
    const sortie = (r as { sortie: { retenus: string[]; exclus: Array<{ prospectId: string }> } }).sortie;
    expect(sortie.retenus).toEqual([P1]);
    expect(sortie.exclus.map((x) => x.prospectId)).toEqual(INCONNUS.slice(0, 50));
  });

  it("rang 3 : liste de sources vide ou aucun prospect de la mission : blocage collecte_vide, sans sortie", async () => {
    expect(await etapes([prospect(1)], []).avantPorte.dedupliquer!(ctx({ prospectIds: [P1] }))).toEqual({ blocage: "collecte_vide" });
    expect(await etapes([prospect(1)], [SOURCE_COLLECTE]).avantPorte.dedupliquer!(ctx({ prospectIds: [] }))).toEqual({ blocage: "collecte_vide" });
  });

  it("rang 3 : la lecture des sources qui échoue lève l'erreur, sans sortie ni collecte vide", async () => {
    const e = creerEtapesWf01({ lireProspects: async () => [prospect(1)], sourcesCollecte: async () => { throw new Error("base indisponible"); }, contexteExclusions: async () => { throw new Error("hors sujet"); }, deps: {} as never });
    await expect(e.avantPorte.dedupliquer!(ctx({ prospectIds: [P1] }))).rejects.toThrow("base indisponible");
  });
});

describe("sans CRM : lot rendu en fichier (#60)", () => {
  const ENTREES_FICHIER = { brief: "brief", cibles: "cibles", exportFichier: { canal: "courriel" } };
  /** CRM qui lève s'il est touché : le chemin fichier ne l'appelle jamais. */
  const crmInterdit: CrmMoteur = {
    async existe() { throw new Error("CRM appelé sur le chemin fichier (existe)"); },
    async confirme() { throw new Error("CRM appelé sur le chemin fichier (confirme)"); },
    async ecrire() { throw new Error("CRM appelé sur le chemin fichier (ecrire)"); },
  };
  const RACINE = "racine-1";
  /** Donne à la mission une tâche racine existante dans l'hôte double, pour le commentaire. */
  const avecRacine = <T extends { missions: Map<string, { issueRacineId: string | null }>; missionId: string; issues: Map<string, Record<string, unknown>> }>(t: T) => {
    t.issues.set(RACINE, { id: RACINE, companyId: SOC });
    t.missions.get(t.missionId)!.issueRacineId = RACINE;
    return t;
  };
  const clore = async (t: Awaited<ReturnType<typeof jusquAutorisation>>) => {
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
  };

  it("sans CRM : exportFichier seul va jusqu'à la clôture, 0 appel CRM, 0 réveil aux rangs 9 et 10", async () => {
    const t = avecRacine(await jusquAutorisation({ entrees: ENTREES_FICHIER, crm: crmInterdit }));
    const reveils = t.reveils.length;
    await clore(t);
    expect(t.etat()).toBe("cloturee");
    expect(t.reveils).toHaveLength(reveils);
    expect(t.crm.ecritures).toEqual([]);
    expect(t.etapes.find((e) => e.rang === 9)).toMatchObject({ etat: "terminee", sortie: { reussis: [], echecs: [], essais: 0, fichier: { canal: "courriel", prospectIds: [P1, P2, P3] } } });
    expect(t.etapes.find((e) => e.rang === 10)).toMatchObject({ etat: "terminee", sortie: { verifies: 0 } });
    expect(t.journal.find((j) => j.type === "moteur.fichier_pret")?.donnees).toMatchObject({ canal: "courriel", prospects: 3 });
    expect(t.commentaires).toHaveLength(1);
    expect(t.commentaires[0]).toMatchObject({ issueId: RACINE });
    expect(t.commentaires[0]!.body).toContain("Fichiers de mission");
  });

  it("exportCrm invalide avec exportFichier : refus", async () => {
    for (const exportCrm of [{ service: "crm", entite: "e" }, { service: "inconnu", canal: "courriel", entite: "entite-1" }, ["crm"], "crm"]) {
      const t = await monter({ entrees: { ...ENTREES_FICHIER, exportCrm }, crm: crmInterdit });
      await t.executeur.demarrerMission(SOC, t.missionId);
      expect(t.missions.get(t.missionId)!.etat).toBe("attente_information");
      expect(t.reveils).toEqual([]);
      expect(t.journal.find((j) => j.type === "moteur.entree_manquante")?.donnees).toMatchObject({ rang: 1, manquantes: ["exportCrm"] });
    }
  });

  it("exportFichier invalide : refus", async () => {
    for (const exportFichier of [{}, { canal: "fax" }, { canal: 3 }, ["courriel"], "courriel", null]) {
      const t = await monter({ entrees: { brief: "brief", cibles: "cibles", exportFichier }, crm: crmInterdit });
      await t.executeur.demarrerMission(SOC, t.missionId);
      expect(t.missions.get(t.missionId)!.etat).toBe("attente_information");
      expect(t.reveils).toEqual([]);
    }
  });

  it("sans CRM : une sortie d'agent qui injecte exportCrm ou fichier ne change ni le choix ni la liste", async () => {
    const injection = { exportCrm: EXPORT_CRM, exportFichier: { canal: "sms" }, fichier: { canal: "sms", prospectIds: [P4] } };
    // Le contrat de sortie refuse déjà ces champs à l'agent.
    const refus = avecRacine(await monter({ entrees: ENTREES_FICHIER, crm: crmInterdit }));
    await refus.executeur.demarrerMission(SOC, refus.missionId);
    expect((await refus.deposer(2, { reponsesBrutesSignees: ["rep-1"], prospectIds: [P1], limites: LIMITES, ...injection })).statut).toBe("refuse");
    // Même si de telles valeurs atteignaient les sorties des rangs précédents, le choix reste celui du rang 1 et la liste celle du lot.
    const t = avecRacine(await jusquAutorisation({ entrees: ENTREES_FICHIER, crm: crmInterdit }));
    for (const rang of [2, 4, 5, 7]) Object.assign(t.etapes.find((e) => e.rang === rang)!.sortie as object, injection);
    await clore(t);
    expect(t.etat()).toBe("cloturee");
    expect(t.etapes.find((e) => e.rang === 9)!.sortie).toMatchObject({ reussis: [], fichier: { canal: "courriel", prospectIds: [P1, P2, P3] } });
  });

  it("sans CRM : arrêt entre le commentaire et sa marque, puis reprise : un seul commentaire, un seul journal", async () => {
    const t = avecRacine(await jusquAutorisation({ entrees: ENTREES_FICHIER, crm: crmInterdit }));
    const marquer = t.base.marquerExecution;
    let panne = true;
    t.base.marquerExecution = async (c: string, cle: string, statut: string) => {
      if (panne && cle.includes(":fichier_commentaire")) {
        panne = false;
        throw new Error("arrêt simulé après le commentaire");
      }
      return marquer(c, cle, statut);
    };
    t.approuver();
    await expect(t.executeur.surDoneNatif(SOC, t.issue)).rejects.toThrow("arrêt simulé");
    expect(t.commentaires).toHaveLength(1);
    await t.executeur.reprendre(SOC);
    expect(t.etat()).toBe("cloturee");
    expect(t.commentaires).toHaveLength(1);
    expect(t.journal.filter((j) => j.type === "moteur.fichier_pret")).toHaveLength(1);
  });

  it("sans CRM : arrêt entre les rangs 9 et 10 puis reprise, pas de doublon de journal ni de commentaire", async () => {
    const t = avecRacine(await jusquAutorisation({ entrees: ENTREES_FICHIER, crm: crmInterdit }));
    const changer = t.base.changerRangMission;
    let panne = true;
    t.base.changerRangMission = async (c: string, id: string, ancien: number, nouveau: number) => {
      if (panne && nouveau === 10) {
        panne = false;
        throw new Error("arrêt simulé entre les rangs 9 et 10");
      }
      return changer(c, id, ancien, nouveau);
    };
    t.approuver();
    await expect(t.executeur.surDoneNatif(SOC, t.issue)).rejects.toThrow("arrêt simulé");
    expect(t.etapes.find((e) => e.rang === 9)!.etat).toBe("terminee");
    await t.executeur.reprendre(SOC);
    expect(t.etat()).toBe("cloturee");
    expect(t.commentaires).toHaveLength(1);
    expect(t.journal.filter((j) => j.type === "moteur.fichier_pret")).toHaveLength(1);
  });

  it("sans CRM : aucune coordonnée au journal ni au commentaire", async () => {
    const t = avecRacine(await jusquAutorisation({ entrees: ENTREES_FICHIER, crm: crmInterdit }));
    await clore(t);
    const trace = JSON.stringify([t.journal, t.commentaires]);
    expect(trace).not.toContain("chv1.");
    for (const n of [1, 2, 3]) expect(trace).not.toContain(h(n));
    expect(trace).not.toContain("Société fictive");
  });

  it("un prospect marqué d'opposition reste dans fichier.prospectIds, avec sa marque", async () => {
    const t = avecRacine(await jusquAutorisation({ entrees: ENTREES_FICHIER, crm: crmInterdit, oppositions: [{ type: "courriel", valeur: h(2) }] }));
    await clore(t);
    expect(t.etat()).toBe("cloturee");
    expect(t.etapes.find((e) => e.rang === 9)!.sortie).toMatchObject({ fichier: { canal: "courriel", prospectIds: [P1, P2, P3] } });
    expect(t.journal.find((j) => j.type === "moteur.export_marque_opposition")?.donnees).toMatchObject({ ids: [P2] });
  });

  it("un prospect en double dans le lot ne sort qu'une fois dans le fichier", async () => {
    const t = avecRacine(await jusquAutorisation({ entrees: ENTREES_FICHIER, crm: crmInterdit, lot: [P1, P1, P2] }));
    await clore(t);
    expect(t.etat()).toBe("cloturee");
    expect((t.etapes.find((e) => e.rang === 9)!.sortie as { fichier: { prospectIds: string[] } }).fichier.prospectIds).toEqual([P1, P2]);
    expect(t.journal.find((j) => j.type === "moteur.fichier_pret")?.donnees).toMatchObject({ prospects: 2 });
  });

  it("entrée du rang 1 sans choix au moment du rang 9 : blocage, jamais de clôture sans fichier", async () => {
    const t = avecRacine(await jusquAutorisation({ entrees: ENTREES_FICHIER, crm: crmInterdit }));
    t.etapes.find((e) => e.rang === 1)!.entree = { brief: "brief", cibles: "cibles" };
    await clore(t);
    expect(t.etat()).not.toBe("cloturee");
    expect(t.journal.find((j) => j.type === "moteur.blocage")!.donnees).toMatchObject({ evenement: "effet_ambigu", raison: "canal_fichier_absent" });
    expect(t.journal.some((j) => j.type === "moteur.fichier_pret")).toBe(false);
  });
});
