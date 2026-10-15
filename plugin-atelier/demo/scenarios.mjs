// Fixtures des scénarios de DÉMONSTRATION (entreprise fictive de rénovation à
// Liège). Aucune donnée réelle. Utilisées par agent-demo.mjs (agents) et par
// scripts/scenarios/atelier_scenarios.py (mise en place, côté humain).

export const DOMAINE = "https://renovations-meuse-ourthe.example";
export const MENTION = "Démonstration : contenu produit par des fixtures déterministes, aucune IA réelle.";

const ETABLISSEMENTS = {
  "Liège-Guillemins": "rue de la Démonstration 1, 4000 Liège ; du lundi au vendredi, 8 h à 17 h",
  Herstal: "place de l'Exemple 2, 4040 Herstal ; du lundi au samedi, 8 h à 16 h",
  Seraing: "quai du Test 3, 4100 Seraing ; du mardi au samedi, 9 h à 17 h",
};

function pageEtablissements(noms) {
  const sections = noms.map((n) => `## ${n}\n\nÉtablissement de ${n} : ${ETABLISSEMENTS[n]}.`).join("\n\n");
  return `# Nos établissements\n\n_${MENTION}_\n\n${sections}\n\n## Demander un diagnostic\n\nDemandez un diagnostic de toiture via notre page contact : ${DOMAINE}/contact\n`;
}

export const SCENARIOS = {
  B: {
    titre: "Page « Nos établissements »",
    brief:
      "Campagne « Toitures avant l'hiver » pour Rénovations Meuse et Ourthe (entreprise fictive). " +
      "Créer une page « Nos établissements » qui présente nos trois établissements : Liège-Guillemins, Herstal et Seraing, avec adresse et horaires, " +
      "et qui invite à demander un diagnostic via la page contact.",
    etablissements: Object.keys(ETABLISSEMENTS),
    exigences: [
      {
        code: "REQ-001",
        texteOriginal: "présente nos trois établissements : Liège-Guillemins, Herstal et Seraing, avec adresse et horaires",
        interpretation: "Une section par établissement, avec adresse et horaires.",
        obligatoire: true,
        criteres: ["Chaque établissement a sa section", "Adresse et horaires présents"],
        elementsAttendus: ["Liège-Guillemins", "Herstal", "Seraing"],
      },
      {
        code: "REQ-002",
        texteOriginal: "invite à demander un diagnostic via la page contact",
        interpretation: "Un appel à l'action renvoie vers la page contact.",
        obligatoire: true,
        criteres: ["Lien vers la page contact"],
        elementsAttendus: ["contact"],
      },
    ],
    revues: ["exigences", "metier"],
    // v1 oublie Seraing (omission du scénario B) ; la correction ajoute les éléments manquants signalés.
    livrable(version, manquants) {
      if (version === 1) return pageEtablissements(["Liège-Guillemins", "Herstal"]);
      return pageEtablissements([...new Set(["Liège-Guillemins", "Herstal", ...manquants, "Seraing"])]);
    },
  },
  C: {
    titre: "Page « Diagnostic de toiture »",
    brief:
      "Campagne « Toitures avant l'hiver » (entreprise fictive). Créer une page « Diagnostic de toiture » qui décrit la visite technique " +
      "et renvoie vers la page de l'offre de diagnostic du site.",
    etablissements: [],
    exigences: [
      { code: "REQ-001", texteOriginal: "décrit la visite technique", interpretation: "La page décrit la visite et le rapport.", obligatoire: true, criteres: ["Visite et rapport décrits"], elementsAttendus: ["visite technique"] },
      { code: "REQ-002", texteOriginal: "renvoie vers la page de l'offre de diagnostic du site", interpretation: "Un lien valide vers la page de l'offre.", obligatoire: true, criteres: ["Lien vers l'offre, page accessible"], elementsAttendus: ["diagnostic"] },
    ],
    revues: ["exigences", "metier", "technique"],
    // v1 : affirmation commerciale non sourcée + lien vers une page d'erreur servie en 200.
    livrable(version) {
      const v1 = version === 1;
      return (
        `# Diagnostic de toiture\n\n_${MENTION}_\n\n` +
        `La visite technique dure environ une heure et donne lieu à un rapport écrit.\n\n` +
        (v1 ? "Notre diagnostic est gratuit et garanti à vie.\n\n" : "Le tarif est communiqué sur devis.\n\n") +
        `Voir l'offre de diagnostic : ${DOMAINE}/${v1 ? "diagnostic-gratuit" : "diagnostic"}\n`
      );
    },
  },
  D: {
    titre: "Encart « Nos certifications »",
    brief:
      "Campagne « Toitures avant l'hiver » (entreprise fictive). Ajouter un encart qui mentionne la certification « Rénovation Qualité Liège » " +
      "de l'entreprise et la liste exacte des services couverts.",
    etablissements: [],
    exigences: [
      {
        code: "REQ-001",
        texteOriginal: "mentionne la certification « Rénovation Qualité Liège » de l'entreprise et la liste exacte des services couverts",
        interpretation: "Citer la certification avec sa référence et les services exacts, uniquement si confirmés.",
        obligatoire: true,
        criteres: ["Certification confirmée par une source", "Services exacts confirmés"],
        elementsAttendus: ["Rénovation Qualité Liège"],
      },
    ],
    revues: ["exigences", "metier"],
    sourceAVerifier: `${DOMAINE}/certifications`,
    question:
      "La certification « Rénovation Qualité Liège » est-elle détenue ? Merci de fournir la référence, la date de validité et la liste exacte des services couverts : aucune source publique ne la confirme.",
    livrable() {
      return `# Nos certifications\n\n_${MENTION}_\n\nEncart en attente : la certification demandée n'est confirmée par aucune source.\n`;
    },
  },
  E: null, // scénario E : reprend B (voir le lanceur), avec un producteur ralenti.
};
SCENARIOS.E = { ...SCENARIOS.B, titre: "Page « Nos établissements » (reprise après arrêt)" };
SCENARIOS.F = { ...SCENARIOS.B, titre: "Page « Nos établissements » (budget et permissions)" };
SCENARIOS.H = { ...SCENARIOS.B, titre: "Page « Nos établissements » (plafonds de dépenses)" };
// Scénario G : le producteur n'a pas les données de Seraing ; chaque correction échoue
// jusqu'à l'épuisement des cycles. Seule une relance humaine (information ou consigne)
// lui permet d'ajouter l'établissement ; la version suivante repasse tous les contrôles.
SCENARIOS.G = {
  ...SCENARIOS.B,
  titre: "Page « Nos établissements » (relance humaine)",
  livrable(version, _manquants, relances = []) {
    const apport = relances.some((r) => `${r.consigne ?? ""} ${r.information?.reponse ?? ""}`.includes("Seraing"));
    const noms = apport ? ["Liège-Guillemins", "Herstal", "Seraing"] : ["Liège-Guillemins", "Herstal"];
    return pageEtablissements(noms) + `\nMise à jour : version ${version}.\n`;
  },
};

/** Affirmations commerciales qui exigent une source (relecture métier déterministe). */
export const AFFIRMATIONS_A_SOURCER = [/\bgratuit\b/iu, /\bgaranti(?:e|s)?\b/iu, /\bcertifi[ée]e?s?\b/iu, /\bn°\s?1\b/iu, /\ble moins cher\b/iu, /\bmeilleur(?:e|s)?\b/iu];

// Scénario K (lot L9) : données d'une connexion de DÉMONSTRATION (passerelle marketing).
// Réponse calquée octet pour octet sur `emballer` de la passerelle (passerelle/src/outils.ts) :
// texte commençant par la mention, puis le JSON avec `_atelier`. Les chiffres sont fictifs.
export const MENTION_PASSERELLE = "Données de démonstration : aucune activité réelle";
const LIGNES_GSC = [
  { requete: "toiture liège", page: "https://www.renovation-liege.example/toiture", clics: 412, impressions: 9870 },
  { requete: "diagnostic toiture", page: "https://www.renovation-liege.example/diagnostic", clics: 280, impressions: 5120 },
  { requete: "châssis ans", page: "https://www.renovation-liege.example/chassis", clics: 542, impressions: 12003 },
];
export function reponsePasserelleGsc(mode = "demonstration") {
  const structure = {
    // En « reel » (contre-épreuve du scénario), domaine neutre : aucun identifiant fictif connu.
    rows: LIGNES_GSC.map((l, i) => ({ keys: [l.requete, mode === "demonstration" ? l.page : l.page.replace("renovation-liege.example", "client-reel.be")], clicks: l.clics, impressions: l.impressions, ctr: Number((l.clics / l.impressions).toFixed(4)), position: [3.42, 4.1, 6.75][i] })),
    responseAggregationType: "byPage",
    _atelier: mode === "demonstration" ? { mode, mention: MENTION_PASSERELLE } : { mode },
  };
  const debut = mode === "demonstration" ? `${MENTION_PASSERELLE}\n\n` : "";
  return { texte: `${debut}${JSON.stringify(structure, null, 2)}`, structuredContent: structure };
}
const fr = (n) => n.toLocaleString("fr-BE").replace(/ | /gu, " ");

SCENARIOS.K = {
  titre: "Bilan Search Console de septembre",
  brief:
    "Campagne « Toitures avant l'hiver » (entreprise fictive). Rédiger un bilan des clics et des impressions de la Search Console de septembre, " +
    "requête par requête, avec le total.",
  etablissements: [],
  exigences: [
    {
      code: "REQ-001",
      texteOriginal: "un bilan des clics et des impressions de la Search Console de septembre, requête par requête, avec le total",
      interpretation: "Clics et impressions par requête, puis le total, tirés de la connexion Search Console.",
      obligatoire: true,
      criteres: ["Clics et impressions présents", "Total présent"],
      elementsAttendus: ["clics", "impressions"],
    },
  ],
  revues: ["exigences", "metier"],
  donneesConnexion: { service: "gsc", outil: "gsc_requete_performances", reponse: reponsePasserelleGsc("demonstration") },
  // v1 : chiffres repris SANS la mention « démonstration » (seule la bannière générale est présente) ;
  // version étiquetée : le titre du document couvre toutes les sections.
  livrable(version, _manquants, _relances, etiquete = version >= 2) {
    const total = LIGNES_GSC.reduce((a, l) => ({ clics: a.clics + l.clics, impressions: a.impressions + l.impressions }), { clics: 0, impressions: 0 });
    return (
      `# Bilan Search Console de septembre${etiquete ? " (données de démonstration)" : ""}\n\n_${MENTION}_\n\n## Requêtes\n\n` +
      LIGNES_GSC.map((l) => `- « ${l.requete} » : ${fr(l.clics)} clics pour ${fr(l.impressions)} impressions.`).join("\n") +
      `\n\n## Total\n\nAu total, ${fr(total.clics)} clics et ${fr(total.impressions)} impressions sur la période.\n`
    );
  },
};

// Scénario A (parcours complet, intégration des connecteurs) : un brief, quatre exigences, trois
// livrables en PARALLÈLE confiés à deux producteurs, sous porte avec revues, planifiés au calendrier.
// Le bilan reprend une réponse RÉELLE de la passerelle de démonstration, obtenue par une connexion
// créée par la carte de galerie native et déposée telle quelle par l'agent (`donneesConnexion`) :
// aucun chiffre de cette tâche n'est écrit dans ce fichier.
const fr0 = (n) => Number(n).toLocaleString("fr-BE").replace(/\u{202f}|\u{a0}/gu, " ");
const lignesDepuisReponse = (donnees) => (donnees?.reponse?.structuredContent?.rows ?? []).map((r) => ({ requete: r.keys?.[0] ?? "?", clics: r.clicks, impressions: r.impressions }));

SCENARIOS.A = {
  titre: "Campagne de printemps 2027 (parcours complet)",
  brief:
    "Campagne « Printemps 2027 » pour Rénovation Liège (entreprise fictive). Créer une page « Nos établissements » qui présente nos trois établissements : " +
    "Liège-Guillemins, Herstal et Seraing, avec adresse et horaires, et qui invite à demander un diagnostic via la page contact ; rédiger un bilan des clics et " +
    "des impressions de la Search Console de septembre, requête par requête ; préparer une publication Facebook qui annonce le diagnostic de toiture du printemps.",
  etablissements: SCENARIOS.B.etablissements,
  exigences: [
    ...SCENARIOS.B.exigences,
    {
      code: "REQ-003",
      texteOriginal: "un bilan des clics et des impressions de la Search Console de septembre, requête par requête",
      interpretation: "Clics et impressions par requête, tirés de la connexion Search Console déposée sur la tâche.",
      obligatoire: true,
      criteres: ["Clics et impressions présents", "Chaque chiffre vient de la réponse déposée"],
      elementsAttendus: ["clics", "impressions"],
    },
    {
      code: "REQ-004",
      texteOriginal: "une publication Facebook qui annonce le diagnostic de toiture du printemps",
      interpretation: "Un texte court pour la page Facebook, avec l'appel à demander un diagnostic.",
      obligatoire: true,
      criteres: ["Texte de publication", "Appel au diagnostic"],
      elementsAttendus: ["diagnostic de toiture"],
    },
  ],
  revues: ["exigences", "metier"],
  taches: [
    {
      titre: "Page « Nos établissements » (printemps)",
      producteur: "Contenus et création",
      canal: "site",
      dateProposee: "2027-03-02T08:00:00.000Z",
      exigences: ["REQ-001", "REQ-002"],
      revues: ["exigences", "metier"],
      // v1 oublie Seraing : revue en échec, correction, puis porte franchie (comme B).
      livrable: (version, manquants) => SCENARIOS.B.livrable(version, manquants),
    },
    {
      titre: "Bilan Search Console de septembre (printemps)",
      producteur: "SEO local GEO",
      canal: "rapport",
      dateProposee: "2027-03-03T08:00:00.000Z",
      exigences: ["REQ-003"],
      revues: ["exigences", "metier"],
      connexion: { service: "gsc", outil: "gsc_requete_performances" },
      // Chaque chiffre vient de la réponse déposée ; le titre du document porte la mention.
      livrable(_version, _manquants, _relances, donnees) {
        const lignes = lignesDepuisReponse(donnees);
        if (lignes.length === 0) return `# Bilan Search Console de septembre\n\n_${MENTION}_\n\nNon mesurable : aucune réponse de la connexion Search Console n'a été déposée.\n`;
        return (
          `# Bilan Search Console de septembre (données de démonstration)\n\n_${MENTION}_\n\n## Requêtes\n\n` +
          lignes.map((l) => `- « ${l.requete} » : ${fr0(l.clics)} clics pour ${fr0(l.impressions)} impressions.`).join("\n") +
          `\n\n## Source\n\nConnexion Search Console de la passerelle marketing, période du 1er au 30 septembre 2026.\n`
        );
      },
    },
    {
      titre: "Publication Facebook « Diagnostic de toiture »",
      producteur: "Contenus et création",
      canal: "facebook",
      dateProposee: "2027-03-04T08:00:00.000Z",
      exigences: ["REQ-004"],
      revues: ["exigences", "metier"],
      livrable: () =>
        `# Publication Facebook\n\n_${MENTION}_\n\n## Texte\n\nLe printemps arrive : c'est le bon moment pour un diagnostic de toiture. ` +
        `Nos équipes de Liège-Guillemins, Herstal et Seraing passent chez vous sur rendez-vous. Prenez contact : ${DOMAINE}/contact\n`,
    },
  ],
};
