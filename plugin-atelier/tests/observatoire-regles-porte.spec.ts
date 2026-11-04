import { describe, expect, it } from "vitest";
import { CodeMotifPorte } from "../src/contrats/porte.js";
import { type EntreesPorteObs, reglesObservatoire } from "../src/serveur/observatoire/regles-porte-obs.js";
import { corpusPiege } from "./fixtures/observatoire/corpus-piege.js";
import { affirmation, corpusPropre, EXTRAIT_DEMARRAGE, EXTRAIT_VERSION, ID, preuve, URL_DOC, URL_TIERS } from "./fixtures/observatoire/corpus-propre.js";

const codes = (e: EntreesPorteObs): string[] => reglesObservatoire(e).map((m) => m.code);

/** Ajoute une ligne à la suite de la documentation, dans le premier chapitre. */
function avecLigne(e: EntreesPorteObs, ligne: string): EntreesPorteObs {
  e.revision.texte = e.revision.texte.replace(`Documentation : ${URL_DOC}`, `Documentation : ${URL_DOC}\n${ligne}`);
  return e;
}

/** Ajoute une affirmation (dans les deux listes) et, au besoin, la cite. */
function avecAffirmation(e: EntreesPorteObs, a: ReturnType<typeof affirmation>, citation?: string): EntreesPorteObs {
  e.affirmations.push(a);
  e.preuves.push(...a.preuves);
  return citation === undefined ? e : avecLigne(e, citation);
}

function traduction(base: string, en: string): EntreesPorteObs {
  const e = corpusPropre();
  e.revision = {
    ...e.revision,
    langue: "en",
    texte: `## Section\nÉtat : information manquante\n${en}`,
    baseRevisionFr: { id: "rev-fr-1", empreinteActuelle: "a".repeat(64), empreinteTraduite: "a".repeat(64), texte: `## Section\n${base}` },
  };
  e.affirmations = [];
  e.preuves = [];
  return e;
}

describe("Observatoire : corpus (SC-002)", () => {
  it("corpus propre → aucun motif", () => {
    expect(reglesObservatoire(corpusPropre())).toEqual([]);
  });

  it("corpus piégé → 18 codes distincts", () => {
    const attendus = CodeMotifPorte.options.filter((c) => c.startsWith("obs_")).sort();
    expect(attendus).toHaveLength(18);
    const motifs = reglesObservatoire(corpusPiege());
    expect([...new Set(motifs.map((m) => m.code))].sort()).toEqual(attendus);
    expect(motifs.every((m) => m.message.length > 0)).toBe(true);
  });
});

describe("OBS-01 obs_affirmation_sans_preuve", () => {
  it("OBS-01 refuse une affirmation rapportée par l'éditeur sans preuve", () => {
    const e = avecAffirmation(corpusPropre(), affirmation(ID.a3, "ch06", "rapporte_editeur", "Fonction annoncée.", []), `Fonction annoncée [aff:${ID.a3}].`);
    expect(codes(e)).toEqual(["obs_affirmation_sans_preuve"]);
  });
  // V2-3 (décision recommandée du 30/10) : une affirmation non vérifiée exige une preuve, même affichée comme telle.
  it("OBS-01 refuse une affirmation non vérifiée sans preuve, même affichée comme telle", () => {
    const e = avecAffirmation(corpusPropre(), affirmation(ID.a3, "ch06", "non_verifie", "Fonction annoncée.", []), `Fonction annoncée, non vérifiée [aff:${ID.a3}].`);
    expect(codes(e)).toEqual(["obs_affirmation_sans_preuve"]);
  });
  it("OBS-01 accepte une affirmation non vérifiée qui porte une preuve", () => {
    const e = avecAffirmation(corpusPropre(), affirmation(ID.a3, "ch06", "non_verifie", "Démarrage annoncé.", [preuve(ID.inst1, EXTRAIT_DEMARRAGE)]), `Démarrage annoncé, non vérifié [aff:${ID.a3}].`);
    expect(codes(e)).toEqual([]);
  });
});

// shortcut: preuves par essai refusées, à rouvrir avec K8
describe("preuves par essai (K8 non branché)", () => {
  const parEssai = () => [preuve(null, "Résultat de l'essai", ID.essai1)];
  it("OBS-01 ne compte pas une preuve par essai", () => {
    const a = affirmation(ID.a3, "ch06", "rapporte_editeur", "Fonction annoncée.", parEssai());
    expect(codes(avecAffirmation(corpusPropre(), a, `Fonction annoncée [aff:${ID.a3}].`))).toEqual(["obs_affirmation_sans_preuve"]);
  });
  it("OBS-11 ne compte pas une preuve par essai", () => {
    const a = affirmation(ID.a3, "ch06", "contredit", "Fonction contredite.", parEssai());
    expect(codes(avecAffirmation(corpusPropre(), a))).toEqual(["obs_contredit_sans_preuve_contraire"]);
  });
  it("OBS-12 ne compte pas une affirmation de départ prouvée seulement par essai", () => {
    const depart = affirmation(ID.a4, "ch06", "rapporte_editeur", "Départ.", parEssai());
    const texte = `Il suit que la fonction existe. Raisonnement : [aff:${ID.a4}] l'établit.`;
    const e = avecAffirmation(avecAffirmation(corpusPropre(), depart), affirmation(ID.a3, "ch06", "infere", texte, []));
    expect(codes(e)).toEqual(["obs_infere_sans_raisonnement"]);
  });
});

describe("OBS-02 obs_extrait_absent_instantane", () => {
  it("OBS-02 refuse un extrait paraphrasé", () => {
    const e = corpusPropre();
    e.preuves[1]!.extraitExact = "Le démarrage dure 120 millisecondes";
    expect(codes(e)).toEqual(["obs_extrait_absent_instantane"]);
  });
  it("OBS-02 refuse un extrait d'un seul caractère présent dans l'instantané", () => {
    const e = corpusPropre();
    e.preuves[1]!.extraitExact = "D";
    expect(codes(e)).toEqual(["obs_extrait_absent_instantane"]);
  });
  it("OBS-02 refuse un extrait présent mais à une autre position que celle déclarée", () => {
    const e = corpusPropre();
    e.preuves[1]!.position += 1;
    expect(codes(e)).toEqual(["obs_extrait_absent_instantane"]);
  });
  it("OBS-02 accepte un extrait de 20 caractères à sa position", () => {
    const e = corpusPropre();
    e.preuves[0]!.extraitExact = "Exemple 1.2.0 est pu";
    expect(codes(e)).toEqual([]);
  });
  it("OBS-02 accepte un extrait identique aux blancs près", () => {
    const e = corpusPropre();
    e.preuves[1]!.extraitExact = "Démarrage  en\t120 ms selon l'éditeur";
    expect(codes(e)).toEqual([]);
  });
  // O5 (audit du 29/10/2026) : une cause exacte par refus, au lieu du même message pour trois causes.
  it("OBS-02 nomme la cause : extrait trop court, présent à une autre position, ou absent", () => {
    const message = (alterer: (e: EntreesPorteObs) => void) => {
      const e = corpusPropre();
      alterer(e);
      return reglesObservatoire(e).map((m) => m.message).join(" | ");
    };
    expect(message((e) => (e.preuves[1]!.extraitExact = "D"))).toMatch(/1 caractère.*20/u);
    const position = corpusPropre().preuves[1]!.position;
    expect(message((e) => (e.preuves[1]!.position += 1))).toContain(`position ${position} et non à la position ${position + 1}`);
    expect(message((e) => (e.preuves[1]!.extraitExact = "Le démarrage dure 120 millisecondes"))).toContain("ne figure pas dans l'instantané");
  });
});

describe("OBS-03 obs_source_non_enregistree", () => {
  it("OBS-03 refuse une preuve vers une adresse jamais lue", () => {
    const e = corpusPropre();
    e.sources.delete(URL_DOC);
    expect(codes(e)).toContain("obs_source_non_enregistree");
  });
  it("OBS-03 refuse une adresse citée dans le texte sans source enregistrée", () => {
    expect(codes(avecLigne(corpusPropre(), "Voir https://inconnu.test/page."))).toEqual(["obs_source_non_enregistree"]);
  });
  it("OBS-03 accepte une preuve vers une source enregistrée", () => {
    expect(codes(avecLigne(corpusPropre(), `Voir ${URL_DOC}.`))).toEqual([]);
  });
  // O2 (audit du 29/10/2026) : l'adresse citée est comparée après canonicalisation, comme url_canonique.
  it("OBS-03 accepte la source enregistrée avec une barre oblique finale ou un fragment", () => {
    expect(codes(avecLigne(corpusPropre(), `Voir ${URL_DOC}/ et ${URL_DOC}#installation.`))).toEqual([]);
  });
  it("OBS-03 cite la source enregistrée la plus proche du même domaine", () => {
    const motifs = reglesObservatoire(avecLigne(corpusPropre(), "Voir https://exemple.test/docs/guide."));
    expect(motifs.map((m) => m.code)).toEqual(["obs_source_non_enregistree"]);
    expect(motifs[0]!.message).toContain(`la plus proche : ${URL_DOC}`);
  });
  it("OBS-03 voit une adresse en majuscules et une adresse sans schéma (image ou lien //hôte) (V2-1)", () => {
    expect(codes(avecLigne(corpusPropre(), "Voir HTTPS://inconnu.test/page."))).toEqual(["obs_source_non_enregistree"]);
    expect(codes(avecLigne(corpusPropre(), "![schéma](//inconnu.test/p.png)"))).toEqual(["obs_source_non_enregistree"]);
    expect(codes(avecLigne(corpusPropre(), "Lien <//inconnu.test/a> ici."))).toEqual(["obs_source_non_enregistree"]);
  });
  // SPEC-E10 (décision recommandée) : le code en ligne n'est exempté que sans URL ni chiffre avec unité.
  it("OBS-03 refuse une URL en code en ligne", () => {
    expect(codes(avecLigne(corpusPropre(), "Voir `https://inconnu.test/page`."))).toEqual(["obs_source_non_enregistree"]);
  });
  it("un nom versionné en code en ligne reste exempté", () => {
    expect(codes(avecLigne(corpusPropre(), "Le paquet exemple-v9.9.9 est publié."))).toEqual(["obs_version_inconnue"]);
    expect(codes(avecLigne(corpusPropre(), "Le paquet `exemple-v9.9.9` est publié."))).toEqual([]);
  });
  it("OBS-03 ne prend pas un commentaire « // » pour une adresse", () => {
    expect(codes(avecLigne(corpusPropre(), "// note : voir plus bas"))).toEqual([]);
    expect(codes(avecLigne(corpusPropre(), "Chemin a//b sans hôte."))).toEqual([]);
  });
  // O8 (audit du 29/10/2026) : un bloc ~~~ est un bloc de code, comme pour l'exporteur.
  it("un bloc de code ~~~ est exclu des contrôles de prose comme un bloc ```", () => {
    expect(codes(avecLigne(corpusPropre(), "~~~bash\nnpm install outil@v9.9.9\n~~~"))).toEqual([]);
    expect(codes(avecLigne(corpusPropre(), "~~~~\n```\nnpm install outil@v9.9.9\n```\n~~~~"))).toEqual([]);
    expect(codes(avecLigne(corpusPropre(), "~~~\nnpm install outil@v1.0.0\n~~~\nPuis la v9.9.9."))).toEqual(["obs_version_inconnue"]);
  });
});

describe("OBS-04 obs_verifie_sans_essai", () => {
  const verifiee = (version = "1.2.0") =>
    affirmation(ID.a3, "ch06", "verifie_experimentalement", "Fonction vérifiée.", [preuve(null, "Résultat", ID.essai1)], { versionConcernee: version });
  const essai = (version: string) => ({ executeParService: true, termine: true, succes: true, version });

  it("OBS-04 refuse un statut vérifié sans essai", () => {
    expect(codes(avecAffirmation(corpusPropre(), verifiee()))).toEqual(["obs_verifie_sans_essai"]);
  });
  it("OBS-04 refuse un essai sur une autre version", () => {
    const e = avecAffirmation(corpusPropre(), verifiee());
    e.essais.set(ID.essai1, essai("1.1.0"));
    expect(codes(e)).toEqual(["obs_verifie_sans_essai"]);
  });
  it("OBS-04 refuse un essai non terminé avec succès", () => {
    const e = avecAffirmation(corpusPropre(), verifiee());
    e.essais.set(ID.essai1, { ...essai("1.2.0"), succes: false });
    expect(codes(e)).toEqual(["obs_verifie_sans_essai"]);
  });
  it("OBS-04 accepte un essai réussi sur la même version", () => {
    const e = avecAffirmation(corpusPropre(), verifiee());
    e.essais.set(ID.essai1, essai("1.2.0"));
    expect(codes(e)).toEqual([]);
  });
});

describe("OBS-05 obs_version_inconnue", () => {
  it("OBS-05 refuse une version inventée", () => {
    expect(codes(avecLigne(corpusPropre(), "Disponible en version 9.9.9."))).toEqual(["obs_version_inconnue"]);
  });
  it("OBS-05 refuse une affirmation sur une version inconnue", () => {
    const e = avecAffirmation(corpusPropre(), affirmation(ID.a3, "ch06", "rapporte_editeur", "Fonction.", [preuve(ID.inst1, "Exemple 1.2.0 est publié")], { versionConcernee: "7.0.0" }));
    expect(codes(e)).toEqual(["obs_version_inconnue"]);
  });
  it("OBS-05 accepte une version relevée sur la page de publication", () => {
    const e = avecLigne(corpusPropre(), "Disponible en version 1.3.0.");
    e.versionsConnues.add("1.3.0");
    expect(codes(e)).toEqual([]);
  });
});

describe("OBS-05 version d'un autre logiciel prouvée par un extrait", () => {
  const phrase = (id: string) => `PostgreSQL v19.0 est cité [aff:${id}].`;
  const avecPreuve = (extrait: string) =>
    avecAffirmation(corpusPropre(), affirmation(ID.a3, "ch06", "rapporte_editeur", "PostgreSQL v19.0 est sorti.", [preuve(ID.inst1, extrait)]), phrase(ID.a3));
  it("OBS-05 accepte une version présente dans l'extrait d'une preuve citée", () => {
    expect(codes(avecPreuve("PostgreSQL v19.0 disponible"))).not.toContain("obs_version_inconnue");
  });
  it("OBS-05 refuse la même version sans preuve qui la contienne", () => {
    expect(codes(avecPreuve("Exemple 1.2.0 est publié"))).toContain("obs_version_inconnue");
  });
  it("OBS-05 refuse une version qui n'est qu'un préfixe de celle de l'extrait", () => {
    const e = avecLigne(corpusPropre(), "Cité en v19.0 ici.");
    e.preuves.push(preuve(ID.inst1, "PostgreSQL v19.0.1 disponible"));
    expect(codes(e)).toContain("obs_version_inconnue");
  });
});

describe("OBS-06 obs_performance_sans_essai_ni_source_primaire", () => {
  it("OBS-06 refuse un gain chiffré tiré d'une vidéo", () => {
    const e = avecAffirmation(corpusPropre(), affirmation(ID.a3, "ch20", "rapporte_tiers", "Gain de 40 % selon une vidéo.", [preuve(ID.inst2, "Un blog affirme que Exemple")]));
    expect(codes(e)).toEqual(["obs_performance_sans_essai_ni_source_primaire"]);
  });
  it("OBS-06 refuse un chiffre nu dans le texte", () => {
    expect(codes(avecLigne(corpusPropre(), "Le démarrage prend 35 ms."))).toEqual(["obs_performance_sans_essai_ni_source_primaire"]);
  });
  it("OBS-06 refuse un chiffre avec unité en code en ligne (SPEC-E10)", () => {
    expect(codes(avecLigne(corpusPropre(), "Le démarrage prend `200 ms`."))).toEqual(["obs_performance_sans_essai_ni_source_primaire"]);
  });
  // O3 (audit du 29/10/2026) : un pourcentage sans mot de performance et « 2026 s'ouvre » ne sont pas des performances.
  it("OBS-06 ne lit pas « 40 % des contributeurs » ni « 2026 s'ouvre » comme des performances", () => {
    expect(codes(avecLigne(corpusPropre(), "Environ 40 % des contributeurs sont bénévoles."))).toEqual([]);
    expect(codes(avecLigne(corpusPropre(), "En 2026 s'ouvre une nouvelle étape."))).toEqual([]);
    expect(codes(avecAffirmation(corpusPropre(), affirmation(ID.a3, "ch06", "rapporte_tiers", "40 % des contributeurs sont bénévoles.", [preuve(ID.inst2, "Un blog affirme que Exemple")])))).toEqual([]);
  });
  it("OBS-06 refuse toujours un pourcentage de gain ou de vitesse", () => {
    expect(codes(avecLigne(corpusPropre(), "Un gain de 40 % au démarrage."))).toEqual(["obs_performance_sans_essai_ni_source_primaire"]);
    expect(codes(avecLigne(corpusPropre(), "It is 30 % faster."))).toEqual(["obs_performance_sans_essai_ni_source_primaire"]);
    expect(codes(avecLigne(corpusPropre(), "Démarrage en 3 s."))).toEqual(["obs_performance_sans_essai_ni_source_primaire"]);
    const e = corpusPropre();
    e.revision.texte = e.revision.texte.replace("L'éditeur annonce un démarrage", "Environ 40 % des contributeurs sont bénévoles.\nL'éditeur annonce un démarrage");
    expect(codes(e)).toEqual(["obs_performance_sans_essai_ni_source_primaire"]);
  });
  // SPEC-E11 : au plus 20 motifs par règle (MOTIFS_MAX_PAR_REGLE), comme les règles des livrables.
  it("OBS-06 plafonne ses motifs à 20 (25 chiffres nus)", () => {
    const e = avecLigne(corpusPropre(), Array.from({ length: 25 }, (_, i) => `Étape ${i} : 10 ms.`).join(" "));
    expect(codes(e)).toEqual(Array(20).fill("obs_performance_sans_essai_ni_source_primaire"));
  });
  // SPEC-O6 : un chiffre rapporte_editeur n'est accepté qu'affiché comme annonce de l'éditeur (regles-porte.md, OBS-06).
  it("OBS-06 refuse un chiffre rapporte_editeur présenté comme un fait", () => {
    const a = () => affirmation(ID.a3, "ch20", "rapporte_editeur", "Démarrage annoncé à 120 ms.", [preuve(ID.inst1, EXTRAIT_DEMARRAGE)]);
    expect(codes(avecAffirmation(corpusPropre(), a(), `Le démarrage prend 120 ms [aff:${ID.a3}].`))).toEqual(["obs_performance_sans_essai_ni_source_primaire"]);
    expect(codes(avecAffirmation(corpusPropre(), a(), `L'éditeur annonce un démarrage en 120 ms [aff:${ID.a3}].`))).toEqual([]);
    expect(codes(avecAffirmation(corpusPropre(), a(), `Startup takes 120 ms, according to the vendor [aff:${ID.a3}].`))).toEqual([]);
    expect(codes(avecAffirmation(corpusPropre(), a(), `Démarrage en 120 ms selon Mistral [aff:${ID.a3}].`))).toEqual([]);
    expect(codes(avecAffirmation(corpusPropre(), a(), `Démarrage en 120 ms, mesuré par l'éditeur [aff:${ID.a3}].`))).toEqual([]);
  });
  it("OBS-06 accepte un chiffre de la documentation officielle affiché comme annonce de l'éditeur", () => {
    const e = avecAffirmation(
      corpusPropre(),
      affirmation(ID.a3, "ch20", "confirme_doc_officielle", "Démarrage annoncé à 120 ms.", [preuve(ID.inst1, EXTRAIT_DEMARRAGE)]),
      `L'éditeur annonce 120 ms [aff:${ID.a3}].`,
    );
    expect(codes(e)).toEqual([]);
  });
});

describe("OBS-07 obs_chapitre_complet_sans_affirmation", () => {
  it("OBS-07 refuse un chapitre complet vide d'affirmations", () => {
    const e = corpusPropre();
    e.revision.texte += "\n## Fonctionnalités détaillées\nÉtat : complet\nTexte sans affirmation.\n";
    expect(codes(e)).toEqual(["obs_chapitre_complet_sans_affirmation"]);
  });
  // O4 (audit du 29/10/2026) : l'état écrit en gras ou en italique se lit aussi.
  it("OBS-07 lit l'état écrit en gras ou en italique", () => {
    for (const etat of ["**État** : complet", "**État :** complet", "_État_ : **complet**"]) {
      const e = corpusPropre();
      e.revision.texte += `\n## Fonctionnalités détaillées\n${etat}\nTexte sans affirmation.\n`;
      expect(codes(e), etat).toEqual(["obs_chapitre_complet_sans_affirmation"]);
    }
  });
  it("OBS-07 accepte un chapitre « information manquante » sans affirmation", () => {
    const e = corpusPropre();
    e.revision.texte += "\n## Fonctionnalités détaillées\nÉtat : information manquante\nTexte sans affirmation.\n";
    expect(codes(e)).toEqual([]);
  });
});

describe("OBS-08 obs_traduction_base_perimee", () => {
  const anglaise = (traduite: string) => {
    const e = traduction("", "");
    e.revision.baseRevisionFr = { id: "rev-fr-2", empreinteActuelle: "a".repeat(64), empreinteTraduite: traduite };
    return e;
  };
  it("OBS-08 refuse une traduction d'une ancienne base", () => {
    expect(codes(anglaise("b".repeat(64)))).toEqual(["obs_traduction_base_perimee"]);
  });
  it("OBS-08 accepte une traduction de la base courante", () => {
    expect(codes(anglaise("a".repeat(64)))).toEqual([]);
  });
});

describe("OBS-09 obs_code_modifie_traduction", () => {
  const bloc = (c: string) => "```bash\n" + c + "\n```\n";
  it("OBS-09 refuse une commande traduite", () => {
    expect(codes(traduction(bloc("exemple lancer"), bloc("example launch")))).toEqual(["obs_code_modifie_traduction"]);
  });
  it("OBS-09 refuse un drapeau de commande modifié", () => {
    expect(codes(traduction("Lancez `exemple --rapide`.\n", "Run `exemple --fast`.\n"))).toEqual(["obs_code_modifie_traduction"]);
  });
  it("OBS-09 refuse un terme du glossaire protégé modifié", () => {
    const e = traduction("Le MCP serveur démarre.\n", "The server starts.\n");
    e.revision.baseRevisionFr!.glossaireProtege = ["MCP"];
    expect(codes(e)).toEqual(["obs_code_modifie_traduction"]);
  });
  it("OBS-09 accepte un commentaire traduit hors des blocs de code", () => {
    expect(codes(traduction("Lancez ceci :\n" + bloc("exemple --rapide"), "Run this:\n" + bloc("exemple --rapide")))).toEqual([]);
  });
});

describe("OBS-10 obs_citation_affirmation_remplacee", () => {
  const nouvelle = () => affirmation(ID.a4, "ch06", "rapporte_editeur", "Fonction à jour.", [preuve(ID.inst1, "Exemple 1.2.0 est publié")]);
  it("OBS-10 refuse une affirmation remplacée", () => {
    const e = avecAffirmation(corpusPropre(), nouvelle());
    const ancienne = affirmation(ID.a3, "ch06", "rapporte_editeur", "Ancienne fonction.", [preuve(ID.inst1, "Exemple 1.2.0 est publié")], { remplaceePar: ID.a4 });
    expect(codes(avecAffirmation(e, ancienne, `Ancienne fonction [aff:${ID.a3}].`))).toEqual(["obs_citation_affirmation_remplacee"]);
  });
  it("OBS-10 accepte l'affirmation qui la remplace", () => {
    expect(codes(avecAffirmation(corpusPropre(), nouvelle(), `Fonction à jour [aff:${ID.a4}].`))).toEqual([]);
  });
});

describe("OBS-11 obs_contredit_sans_preuve_contraire", () => {
  it("OBS-11 refuse une contradiction non prouvée", () => {
    expect(codes(avecAffirmation(corpusPropre(), affirmation(ID.a3, "ch06", "contredit", "Fonction contredite.", [])))).toEqual(["obs_contredit_sans_preuve_contraire"]);
  });
  it("OBS-11 accepte une contradiction prouvée", () => {
    const a = affirmation(ID.a3, "ch06", "contredit", "Fonction contredite.", [preuve(ID.inst2, "Un blog affirme que Exemple")]);
    expect(codes(avecAffirmation(corpusPropre(), a))).toEqual([]);
  });
});

describe("OBS-12 obs_infere_sans_raisonnement", () => {
  it("OBS-12 refuse une inférence sans raisonnement", () => {
    expect(codes(avecAffirmation(corpusPropre(), affirmation(ID.a3, "ch06", "infere", "Il suit que la fonction existe.", [])))).toEqual(["obs_infere_sans_raisonnement"]);
  });
  it("OBS-12 accepte une inférence qui part de deux affirmations prouvées", () => {
    const texte = `Il suit que la fonction existe. Raisonnement : [aff:${ID.a1}] et [aff:${ID.a2}] établissent la version et le démarrage.`;
    expect(codes(avecAffirmation(corpusPropre(), affirmation(ID.a3, "ch06", "infere", texte, [])))).toEqual([]);
  });
});

describe("OBS-13 obs_confiance_sans_motif", () => {
  it("OBS-13 refuse une confiance sans motif", () => {
    const e = corpusPropre();
    e.affirmations[0]!.confiance = { niveau: 2, motif: "  " };
    expect(codes(e)).toEqual(["obs_confiance_sans_motif"]);
  });
  it("OBS-13 refuse une confiance hors de 0 à 3", () => {
    const e = corpusPropre();
    e.affirmations[0]!.confiance = { niveau: 4, motif: "Source relue" };
    expect(codes(e)).toEqual(["obs_confiance_sans_motif"]);
  });
  it("OBS-13 accepte une confiance de 0 à 3 avec motif", () => {
    const e = corpusPropre();
    e.affirmations[0]!.confiance = { niveau: 3, motif: "Source relue" };
    expect(codes(e)).toEqual([]);
  });
});

describe("OBS-14 obs_doc_officielle_non_primaire", () => {
  it("OBS-14 refuse un blog tiers présenté comme documentation officielle", () => {
    const a = affirmation(ID.a3, "ch06", "confirme_doc_officielle", "Fonction.", [preuve(ID.inst2, "Exemple 1.2.0 est publié")]);
    expect(codes(avecAffirmation(corpusPropre(), a))).toEqual(["obs_doc_officielle_non_primaire"]);
  });
  // SPEC-E6 : la source primaire d'un projet ne vaut que pour les affirmations de ce projet (« pour cet éditeur »).
  it("OBS-14 refuse la source primaire d'un autre projet cité", () => {
    const e = corpusPropre();
    e.sourcesPrimaires = new Set();
    e.sourcesPrimairesParProjet = new Map([[ID.projet, new Set([URL_DOC])]]);
    expect(codes(e)).toEqual([]);
    const autre = affirmation(ID.a3, "ch06", "confirme_doc_officielle", "Fonction.", [preuve(ID.inst1, EXTRAIT_DEMARRAGE)], { projetId: "00000000-0000-4000-8000-0000000000ff" });
    expect(codes(avecAffirmation(e, autre))).toEqual(["obs_doc_officielle_non_primaire"]);
  });
  it("OBS-14 accepte une preuve de la source primaire de l'éditeur", () => {
    expect(codes(corpusPropre())).toEqual([]); // A1 est confirmée par la documentation officielle (URL_DOC, primaire)
    expect(URL_TIERS).not.toBe(URL_DOC);
  });
});

describe("OBS-15 obs_source_collecte_refusee", () => {
  it("OBS-15 refuse une source sans décision de droits (refusée)", () => {
    const e = corpusPropre();
    e.sourcesRefusees.add(URL_DOC);
    expect(codes(e)).toEqual(["obs_source_collecte_refusee", "obs_source_collecte_refusee"]);
  });
  // O6 (audit du 29/10/2026) : la cause exacte, et la longueur dépassée.
  it("OBS-15 donne un message distinct pour une source non autorisée et pour un extrait trop long", () => {
    const refusee = corpusPropre();
    refusee.sourcesRefusees.add(URL_DOC);
    expect(reglesObservatoire(refusee)[0]!.message).toContain("n'est pas autorisée à la collecte");
    expect(reglesObservatoire(refusee)[0]!.message).not.toContain("trop long");
    const longue = corpusPropre();
    longue.longueurMaxExtrait = 10;
    const message = reglesObservatoire(longue)[0]!.message;
    expect(message).toContain(`${longue.preuves[0]!.extraitExact.length} caractères, au-delà des 10 permis`);
    expect(message).not.toContain("autorisée");
  });
  it("OBS-15 refuse un extrait trop long", () => {
    const e = corpusPropre();
    e.longueurMaxExtrait = 10;
    expect(codes(e)).toEqual(["obs_source_collecte_refusee", "obs_source_collecte_refusee"]);
  });
  it("DROIT-5.1 : OBS-15 applique le plafond d'extrait fixé par la décision K4 de la source, avant le plafond par défaut", () => {
    const e = corpusPropre();
    e.limitesSources = new Map([[URL_DOC, { extraitMax: 10, cumulMax: null }]]);
    expect(codes(e)).toEqual(["obs_source_collecte_refusee", "obs_source_collecte_refusee"]);
    e.limitesSources = new Map([[URL_DOC, { extraitMax: 5000, cumulMax: null }]]);
    e.longueurMaxExtrait = 10;
    expect(codes(e)).toEqual([]);
  });
  it("DROIT-5.1 : OBS-15 refuse le cumul des extraits d'une même source dans l'article au-delà du plafond K4", () => {
    const e = corpusPropre();
    e.limitesSources = new Map([[URL_DOC, { extraitMax: null, cumulMax: 10 }]]);
    expect(codes(e)).toEqual(["obs_source_collecte_refusee"]);
    e.limitesSources = new Map([[URL_DOC, { extraitMax: null, cumulMax: 100000 }]]);
    expect(codes(e)).toEqual([]);
  });
  it("DROIT-5.2 : OBS-15 refuse une preuve dont la source n'a pas d'auteur enregistré (CDE XI.189)", () => {
    const e = corpusPropre();
    e.sourcesSansAuteur = new Set([URL_DOC]);
    expect(codes(e)).toEqual(["obs_source_collecte_refusee", "obs_source_collecte_refusee"]);
    expect(reglesObservatoire(e)[0]!.message).toContain("aucun auteur enregistré");
    e.sourcesSansAuteur = new Set();
    expect(codes(e)).toEqual([]);
  });
  it("OBS-15 accepte une source autorisée et un extrait court", () => {
    const e = corpusPropre();
    e.sourcesRefusees.add("https://autre.test/");
    e.longueurMaxExtrait = 500;
    expect(codes(e)).toEqual([]);
  });
});

describe("OBS-16 obs_affirmation_inconnue", () => {
  it("OBS-16 refuse un renvoi inventé", () => {
    expect(codes(avecLigne(corpusPropre(), `Fait inventé [aff:${ID.inconnu}].`))).toEqual(["obs_affirmation_inconnue"]);
  });
  // O7 (audit du 29/10/2026) : un seul motif par affirmation inconnue, comme OBS-01 et OBS-10.
  it("OBS-16 ne répète pas le motif d'une même affirmation inconnue citée trois fois", () => {
    const fois = `Fait inventé [aff:${ID.inconnu}].`;
    expect(codes(avecLigne(corpusPropre(), `${fois} ${fois} ${fois}`))).toEqual(["obs_affirmation_inconnue"]);
  });
  it("OBS-16 accepte un renvoi vers une affirmation existante", () => {
    expect(codes(avecLigne(corpusPropre(), `Rappel [aff:${ID.a1}].`))).toEqual([]);
  });
});

// LIV-OB-3 (audit du 29/10/2026) : une heure absente de l'affirmation citée a passé trois revues.
describe("OBS-17 obs_nombre_absent_affirmation", () => {
  const lu = affirmation(ID.a3, "ch01", "confirme_doc_officielle", "Le registre date la publication, lu le 27/10/2026.", [preuve(ID.inst1, EXTRAIT_VERSION)]);
  it("OBS-17 refuse une heure de la phrase citée absente du texte de l'affirmation", () => {
    const e = avecAffirmation(corpusPropre(), lu, `Le registre date la publication, lu le 27 octobre 2026 à 04:50 UTC [aff:${ID.a3}].`);
    expect(codes(e)).toEqual(["obs_nombre_absent_affirmation"]);
  });
  it("OBS-17 accepte une date reformulée dont chaque nombre figure dans l'affirmation", () => {
    const e = avecAffirmation(corpusPropre(), lu, `Le registre date la publication, lu le 27 octobre 2026 [aff:${ID.a3}].`);
    expect(codes(e)).toEqual([]);
  });
  it("OBS-17 ne lit pas les nombres d'une phrase voisine sans citation", () => {
    const e = avecAffirmation(corpusPropre(), lu, `Voir plus bas les 3 cas. Le registre date la publication, lu le 27/10/2026 [aff:${ID.a3}].`);
    expect(codes(e)).toEqual([]);
  });
});

// LIV-OB-4 (audit du 29/10/2026) : une affirmation nommait une version absente de ses extraits.
describe("OBS-18 obs_version_hors_extrait", () => {
  it("OBS-18 refuse un numéro de version de l'affirmation absent de tous ses extraits", () => {
    const a = affirmation(ID.a3, "ch01", "confirme_doc_officielle", "La 1.2.0 est publiée ; l'étiquette stable désigne la 1.1.9.", [preuve(ID.inst1, EXTRAIT_VERSION)]);
    expect(codes(avecAffirmation(corpusPropre(), a))).toEqual(["obs_version_hors_extrait"]);
  });
  it("OBS-18 accepte une affirmation dont chaque version figure dans un extrait", () => {
    const a = affirmation(ID.a3, "ch01", "confirme_doc_officielle", "La 1.2.0 est publiée.", [preuve(ID.inst1, EXTRAIT_VERSION)]);
    expect(codes(avecAffirmation(corpusPropre(), a))).toEqual([]);
  });
});
