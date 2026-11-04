/**
 * Corpus piégé de l'Observatoire : une Revision anglaise qui déclenche chacun des 18 codes `obs_*`.
 */
import type { EntreesPorteObs } from "../../../src/serveur/observatoire/regles-porte-obs.js";
import { affirmation, corpusPropre, ID, preuve } from "./corpus-propre.js";

const URL_REFUSEE = "https://refuse.test/page";

export function corpusPiege(): EntreesPorteObs {
  const base = corpusPropre();
  // A1 : preuve dont l'extrait est absent (02), source non enregistrée (03), refusée (15), non primaire (14), version inconnue (05).
  const p1 = preuve(ID.inst2, "Un extrait qui ne figure nulle part");
  const pEssai = preuve(null, "Résultat d'essai", ID.essai1);
  const a1 = affirmation(ID.a1, "ch01", "confirme_doc_officielle", "Exemple est publié.", [p1], { versionConcernee: "9.9.9" });
  const a3 = affirmation(ID.a3, "ch20", "rapporte_tiers", "Gain de 40 % selon une vidéo.", []); // 01, 06
  const a4 = affirmation(ID.a4, "ch06", "rapporte_editeur", "Ancienne fonction.", [], { remplaceePar: ID.a5 }); // 10
  const a5 = affirmation(ID.a5, "ch06", "verifie_experimentalement", "Fonction vérifiée.", [pEssai]); // 04
  const a6 = affirmation("66666666-6666-4666-8666-666666666666", "ch06", "contredit", "Fonction contredite.", []); // 11
  const a7 = affirmation("77777777-7777-4777-8777-777777777777", "ch06", "infere", "Fonction supposée.", []); // 12
  const a8 = affirmation("88888888-8888-4888-8888-888888888888", "ch06", "rapporte_editeur", "Fonction annoncée en 2.0.", [], {
    confiance: { niveau: 2, motif: "" },
  }); // 13, 18 (version sans extrait)
  return {
    ...base,
    revision: {
      id: "rev-en-1",
      langue: "en",
      empreinte: "f".repeat(64),
      baseRevisionFr: {
        id: "rev-fr-2",
        empreinteActuelle: "a".repeat(64),
        empreinteTraduite: "b".repeat(64), // 08
        texte: "## Identité\n```bash\nexemple lancer\n```\n",
      },
      texte: [
        "## Identity",
        "État : complet",
        `Published in version 9.9.9 [aff:${ID.a1}]. See https://inconnu.test/page.`, // 05, 03, 17 (9.9.9 absent du texte de A1)
        "Startup takes 35 ms.", // 06
        `Unproven fact [aff:${ID.a3}].`, // 01
        `Replaced fact [aff:${ID.a4}].`, // 10
        `Invented reference [aff:${ID.inconnu}].`, // 16
        "```bash",
        "example launch", // 09
        "```",
        "",
        "## Features",
        "État : complet", // 07
        "Nothing cited here.",
        "",
      ].join("\n"),
    },
    affirmations: [a1, a3, a4, a5, a6, a7, a8],
    preuves: [p1, pEssai],
    instantanes: new Map([[ID.inst2, { texteNormalise: "Un blog affirme autre chose.", sourceId: URL_REFUSEE }]]),
    sources: new Set(),
    sourcesRefusees: new Set([URL_REFUSEE]),
  };
}
