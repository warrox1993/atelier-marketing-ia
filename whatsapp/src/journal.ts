/**
 * Deux journaux, aucun contenu de message dans l'un ni dans l'autre :
 * - journal technique (sortie standard, lue par journald) : événements, statuts, compteurs ;
 * - registre des décisions (JSONL 0600) : chaque décision demandée, confirmée, refusée ou exécutée par WhatsApp,
 *   avec l'origine « whatsapp », la clé de l'objet, sa version et le résultat (jamais le motif ni le texte).
 */
import { appendFileSync, chmodSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

export type Journaliseur = (evenement: string, champs?: Record<string, string | number | boolean | null>) => void;

export const journalTechnique: Journaliseur = (evenement, champs = {}) => {
  process.stdout.write(`${JSON.stringify({ date: new Date().toISOString(), evenement, ...champs })}\n`);
};

/** Empreinte courte d'un numéro : permet de reconnaître un expéditeur récurrent sans écrire son numéro. */
export const empreinteNumero = (numero: string) => createHash("sha256").update(`whatsapp:${numero}`).digest("hex").slice(0, 12);

export interface EntreeRegistre {
  type: "demande" | "confirmee" | "refusee" | "executee" | "echec";
  cle: string;
  version: string | null;
  detail?: string;
  resultatId?: string | null;
}

export type Registre = (e: EntreeRegistre) => void;

export function registreFichier(chemin: string | null): Registre {
  return (e) => {
    if (!chemin) return;
    mkdirSync(dirname(chemin), { recursive: true, mode: 0o700 });
    appendFileSync(chemin, `${JSON.stringify({ date: new Date().toISOString(), origine: "whatsapp", ...e })}\n`, { mode: 0o600 });
    chmodSync(chemin, 0o600);
  };
}
