/**
 * Règles de rédaction de la porte (LANG-L3, audit du 29/10/2026) : la consigne commune « Langue et style »
 * (organisation/consignes/communes.md) vérifiée sur le livrable. Code, blocs cités, citations « … », liens et balises
 * sont exclus : seule la prose écrite par l'agent est contrôlée. Un écart par règle, avec le nombre d'occurrences.
 */

export type CodeRedaction = "redaction_tiret_cadratin" | "redaction_guillemets_droits";

export interface EcartRedaction {
  code: CodeRedaction;
  occurrences: number;
  /** Ligne (à partir de 1) de la première occurrence. */
  ligne: number;
  extrait: string;
}

const REGLES: ReadonlyArray<{ code: CodeRedaction; motif: RegExp }> = [
  { code: "redaction_tiret_cadratin", motif: /\u2014/gu },
  { code: "redaction_guillemets_droits", motif: /"/gu },
];

/** Prose d'une ligne : sans code en ligne, liens, balises ni citation entre guillemets français. */
function prose(ligne: string): string {
  return ligne
    .replace(/`[^`]*`/gu, " ")
    .replace(/<[^>]*>/gu, " ")
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/«[^»]*»/gu, " ");
}

export function controlerRedaction(texte: string): EcartRedaction[] {
  const ecarts = new Map<CodeRedaction, EcartRedaction>();
  let dansCode = false;
  texte.split("\n").forEach((brute, i) => {
    if (/^\s*(```|~~~)/u.test(brute)) {
      dansCode = !dansCode;
      return;
    }
    if (dansCode || /^\s*>/u.test(brute)) return;
    const p = prose(brute);
    for (const { code, motif } of REGLES) {
      const n = p.match(motif)?.length ?? 0;
      if (n === 0) continue;
      const deja = ecarts.get(code);
      ecarts.set(code, deja ? { ...deja, occurrences: deja.occurrences + n } : { code, occurrences: n, ligne: i + 1, extrait: brute.trim().slice(0, 120) });
    }
  });
  return REGLES.flatMap(({ code }) => ecarts.get(code) ?? []);
}

export const CONSIGNE_REDACTION: Record<CodeRedaction, string> = {
  redaction_tiret_cadratin: "Tiret cadratin hors citation : virgule, deux-points ou parenthèses à la place",
  redaction_guillemets_droits: "Guillemets droits dans le texte : guillemets français « » à la place (code et citations exceptés)",
};
