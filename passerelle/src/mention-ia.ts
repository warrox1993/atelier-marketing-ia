// Mention d'information « message rédigé avec l'aide d'une IA » (article 50 du règlement européen sur l'IA,
// applicable depuis le 02/08/2026) : ajoutée à tout message envoyé DIRECTEMENT à une personne.
//
// Réglages (variables d'environnement) :
//   PASSERELLE_MENTION_IA                 texte personnalisé (toutes langues) ;
//   PASSERELLE_MENTION_IA_LANGUE          fr (défaut), nl ou en : variante du texte par défaut ;
//   PASSERELLE_MENTION_IA_DESACTIVEE=oui  désactive la mention, mais EXIGE PASSERELLE_MENTION_IA_MOTIF (motif écrit) ;
//                                         sans motif, la passerelle refuse de démarrer.

export type LangueMention = "fr" | "nl" | "en";

export const MENTIONS_PAR_DEFAUT: Record<LangueMention, string> = {
  fr: "Message rédigé avec l'aide d'un assistant IA.",
  nl: "Bericht opgesteld met de hulp van een AI-assistent.",
  en: "Message written with the help of an AI assistant.",
};

/** Mention active (`texte`) ou désactivée par décision écrite (`texte` nul, `motif` renseigné). */
export type MentionIa = { texte: string; motif: null } | { texte: null; motif: string };

export const MENTION_IA_PAR_DEFAUT: MentionIa = { texte: MENTIONS_PAR_DEFAUT.fr, motif: null };

export function lireMentionIa(env: NodeJS.ProcessEnv): MentionIa {
  const desactivee = (env["PASSERELLE_MENTION_IA_DESACTIVEE"] ?? "").trim().toLowerCase();
  if (desactivee !== "" && desactivee !== "oui" && desactivee !== "non") {
    throw new Error(`PASSERELLE_MENTION_IA_DESACTIVEE : valeur « ${desactivee} » inconnue (permises : oui, non).`);
  }
  if (desactivee === "oui") {
    const motif = (env["PASSERELLE_MENTION_IA_MOTIF"] ?? "").trim();
    if (motif === "") {
      throw new Error(
        "Démarrage refusé : désactiver la mention d'information IA (article 50 du règlement européen sur l'IA) exige un motif écrit dans PASSERELLE_MENTION_IA_MOTIF.",
      );
    }
    return { texte: null, motif };
  }
  const langue = (env["PASSERELLE_MENTION_IA_LANGUE"] ?? "fr").trim().toLowerCase();
  if (langue !== "fr" && langue !== "nl" && langue !== "en") {
    throw new Error(`PASSERELLE_MENTION_IA_LANGUE : langue « ${langue} » inconnue (permises : fr, nl, en).`);
  }
  const perso = (env["PASSERELLE_MENTION_IA"] ?? "").trim();
  return { texte: perso !== "" ? perso : MENTIONS_PAR_DEFAUT[langue], motif: null };
}

/** Ajoute la mention sur une ligne séparée en fin de message ; inchangé si elle y est déjà (idempotent) ou si elle est désactivée. */
export function ajouterMention(message: string, mention: MentionIa): string {
  if (mention.texte === null) return message;
  const corps = message.trimEnd();
  if (corps.endsWith(mention.texte)) return message;
  return `${corps}\n\n${mention.texte}`;
}
