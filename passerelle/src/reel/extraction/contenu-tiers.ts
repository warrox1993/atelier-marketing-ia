// Traitement du texte tiers relayé par `extraire_site` (revue de sécurité M4) :
//   - retrait des caractères invisibles (largeur nulle, contrôles bidirectionnels, balises U+E0000 à U+E007F) qui servent à
//     cacher une consigne à l'œil humain ou à brouiller la détection ;
//   - détection des motifs d'injection du plugin (copie de plugin-atelier/src/serveur/motifs-injection.json, source unique ;
//     le test `contenu-tiers.test.ts` vérifie que la copie reste identique). Le texte est signalé, jamais suivi.
import motifsInjection from "./motifs-injection.json" with { type: "json" };

export const MARQUE_SOURCE_TIERCE = "contenu tiers non fiable";
export const SIGNALEMENTS_MAX = 20;

const MOTIFS: ReadonlyArray<[RegExp, string]> = motifsInjection.motifs.map((m) => [new RegExp(m.source, m.drapeaux), m.libelle]);

// Largeur nulle et espaces invisibles (U+200B-U+200F, U+2060-U+2064, U+FEFF, U+00AD, U+180E, U+034F), contrôles bidirectionnels
// (U+061C, U+202A-U+202E, U+2066-U+2069), balises (U+E0000-U+E007F).
const INVISIBLES = /[­͏؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿\u{E0000}-\u{E007F}]/gu;

/** Texte sans caractères invisibles, et nombre de caractères retirés. */
export function retirerInvisibles(texte: string): { texte: string; retires: number } {
  let retires = 0;
  const propre = texte.replace(INVISIBLES, () => { retires++; return ""; });
  return { texte: propre, retires };
}

/** Instructions suspectes repérées dans un texte (même forme que `injectionsSignalees` du plugin). */
export function signalerInjections(texte: string): string[] {
  const trouvees: string[] = [];
  for (const [motif, libelle] of MOTIFS) {
    const m = texte.match(motif);
    if (m) trouvees.push(`${libelle} : « ${m[0].slice(0, 120)} »`);
  }
  return trouvees.slice(0, SIGNALEMENTS_MAX);
}

/** Limiteur de simultanéité : `max` exécutions à la fois, `fileMax` en attente au plus, attente bornée ; au-delà, « occupé ». */
export class LimiteurOccupe extends Error {}

export interface Limiteur { executer<T>(tache: () => Promise<T>): Promise<T> }

export function creerLimiteur(max: number, fileMax: number, attenteMaxMs: number): Limiteur {
  let actifs = 0;
  const file: Array<{ lancer: () => void; abandon: () => void }> = [];
  const occupe = (): LimiteurOccupe => new LimiteurOccupe("Extraction occupée (trop de lectures simultanées) : réessayer dans un instant.");
  return {
    async executer<T>(tache: () => Promise<T>): Promise<T> {
      if (actifs >= max) {
        if (file.length >= fileMax) throw occupe();
        // La place est transmise directement au suivant (actifs n'est pas décrémenté), sans fenêtre où un autre appel passerait devant.
        await new Promise<void>((resolve, reject) => {
          const entree = { lancer: () => { clearTimeout(minuteur); resolve(); }, abandon: () => reject(occupe()) };
          const minuteur = setTimeout(() => { const i = file.indexOf(entree); if (i >= 0) { file.splice(i, 1); entree.abandon(); } }, attenteMaxMs);
          file.push(entree);
        });
      } else {
        actifs++;
      }
      try { return await tache(); } finally {
        const n = file.shift();
        if (n) n.lancer(); else actifs--;
      }
    },
  };
}
