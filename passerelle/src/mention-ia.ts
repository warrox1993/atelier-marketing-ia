// Mention d'information IA : ABSENTE par défaut, sur tous les canaux (décision de l'opérateur du 06/11/2026). Elle se réactive sans
// toucher au code : PASSERELLE_MENTION_IA contient le texte à ajouter aux messages directs et au pied des campagnes e-mail.
// Le marquage lisible par machine (métadonnées, provenance.json, filigrane des voix) est posé par la fabrique et ne dépend pas
// de ce réglage. L'article 50 du règlement (UE) 2024/1689 reste à apprécier cas par cas par un juriste.

/** Texte de la mention, ou null quand aucune mention n'est demandée. */
export type MentionIa = string | null;

export function lireMentionIa(env: NodeJS.ProcessEnv): MentionIa {
  return env["PASSERELLE_MENTION_IA"]?.trim() || null;
}

/** Ajoute la mention sur une ligne séparée en fin de message ; inchangé si elle y est déjà (idempotent) ou s'il n'y en a pas. */
export function ajouterMention(message: string, mention: MentionIa | undefined): string {
  if (!mention) return message;
  const corps = message.trimEnd();
  if (corps.endsWith(mention)) return message;
  return `${corps}\n\n${mention}`;
}

const ECHAPPEMENTS: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Version HTML (courriels) : paragraphe discret en fin de corps, texte échappé ; inchangé si déjà présent ou s'il n'y en a pas. */
export function ajouterMentionHtml(html: string, mention: MentionIa | undefined): string {
  if (!mention) return html;
  const echappee = mention.replace(/[&<>"']/gu, (c) => ECHAPPEMENTS[c] ?? c);
  if (html.includes(echappee) || html.includes(mention)) return html;
  return `${html.trimEnd()}\n<p style="font-size:12px;color:#666">${echappee}</p>`;
}
