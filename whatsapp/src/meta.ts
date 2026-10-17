/**
 * Client minimal de l'API Graph (WhatsApp Cloud API) : message texte de session et modèle utilitaire.
 * POST https://graph.facebook.com/<version>/<phone_number_id>/messages, jeton porteur.
 * Un message texte ne part que dans la fenêtre de service client de 24 h ouverte par le dernier message de l'opérateur
 * (gratuit) ; hors fenêtre, seul un modèle préapprouvé est accepté par Meta (facturé pour un modèle utilitaire).
 */
import type { Config } from "./config.js";

/** Limite de Meta pour le corps d'un message texte. */
export const MAX_TEXTE_WHATSAPP = 4096;

export class ErreurMeta extends Error {
  constructor(message: string, readonly statut: number) {
    super(message);
  }
}

export interface ClientMeta {
  envoyerTexte(destinataire: string, texte: string): Promise<void>;
  envoyerModele(destinataire: string, parametres: string[]): Promise<void>;
}

/** Découpe un long texte en morceaux acceptés par Meta, de préférence aux sauts de ligne. */
export function decouper(texte: string, max = MAX_TEXTE_WHATSAPP - 20): string[] {
  const morceaux: string[] = [];
  let reste = texte;
  while (reste.length > max) {
    let coupe = reste.lastIndexOf("\n", max);
    if (coupe < max / 2) coupe = max;
    morceaux.push(reste.slice(0, coupe));
    reste = reste.slice(coupe).replace(/^\n/, "");
  }
  if (reste.length > 0 || morceaux.length === 0) morceaux.push(reste);
  return morceaux.length > 1 ? morceaux.map((m, i) => `(${i + 1}/${morceaux.length})\n${m}`) : morceaux;
}

export function clientMeta(config: Config, f: typeof fetch = fetch): ClientMeta {
  const url = `${config.graphUrl}/${config.graphVersion}/${config.idNumero}/messages`;
  async function poster(corps: unknown): Promise<void> {
    const r = await f(url, {
      method: "POST",
      headers: { authorization: `Bearer ${config.jetonAcces}`, "content-type": "application/json" },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!r.ok) {
      // Seuls le statut et le code d'erreur de Meta sont gardés : jamais le contenu du message.
      let code = "";
      try {
        const j = (await r.json()) as { error?: { code?: number; error_subcode?: number } };
        code = j.error?.code != null ? ` (code Meta ${j.error.code}${j.error.error_subcode != null ? `/${j.error.error_subcode}` : ""})` : "";
      } catch {
        /* corps illisible */
      }
      throw new ErreurMeta(`Envoi refusé par Meta : HTTP ${r.status}${code}.`, r.status);
    }
  }
  return {
    async envoyerTexte(destinataire, texte) {
      for (const morceau of decouper(texte)) {
        await poster({ messaging_product: "whatsapp", recipient_type: "individual", to: destinataire, type: "text", text: { preview_url: false, body: morceau } });
      }
    },
    async envoyerModele(destinataire, parametres) {
      if (!config.modeleNom) throw new ErreurMeta("Aucun modèle configuré.", 0);
      await poster({
        messaging_product: "whatsapp",
        to: destinataire,
        type: "template",
        template: {
          name: config.modeleNom,
          language: { code: config.modeleLangue },
          components: [{ type: "body", parameters: parametres.map((text) => ({ type: "text", text })) }],
        },
      });
    },
  };
}
