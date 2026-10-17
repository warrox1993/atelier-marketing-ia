/**
 * Codes de confirmation à usage unique : 6 chiffres tirés par `crypto.randomInt`, valables 5 minutes, liés à UNE
 * décision précise (clé) et à sa version (empreinte du contenu montré à l'opérateur). Une seule décision en attente par
 * numéro : en demander une autre annule le code précédent. Trois codes faux annulent la décision en attente.
 * Le code n'est gardé qu'en mémoire, sous forme d'empreinte : un redémarrage annule les décisions en attente.
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const VALIDITE_CODE_MS = 5 * 60 * 1000;
export const ESSAIS_MAX = 3;

export interface DecisionEnAttente<T> {
  /** Identifiant stable de l'objet décidé (ex. `contenu:<issueId>:approuver`). */
  cle: string;
  /** Empreinte de la version montrée à l'opérateur : revérifiée sur une lecture fraîche avant d'exécuter. */
  version: string;
  /** Première ligne de la demande de code : l'action exacte, en mots fixes (jamais du texte libre d'un agent). */
  entete: string;
  /** Ce que la décision vise (titre nettoyé et nom du service), sur sa propre ligne, après l'action. */
  objet: string;
  /** Résumé d'une ligne rappelé dans la réponse après exécution. */
  resume: string;
  charge: T;
}

interface Entree<T> {
  decision: DecisionEnAttente<T>;
  empreinte: Buffer;
  expire: number;
  essais: number;
}

const hacher = (code: string) => createHash("sha256").update(code).digest();

export type ResultatCode<T> =
  | { ok: true; decision: DecisionEnAttente<T> }
  | { ok: false; raison: "aucune" | "expire" | "faux" | "trop_essais" };

export class CodesConfirmation<T> {
  private readonly attente = new Map<string, Entree<T>>();
  constructor(private readonly horloge: () => number = Date.now, private readonly tirage: () => number = () => randomInt(0, 1_000_000)) {}

  /** Émet un code pour cette décision ; tout code précédent du même numéro est annulé. */
  emettre(numero: string, decision: DecisionEnAttente<T>): string {
    const code = String(this.tirage()).padStart(6, "0");
    this.attente.set(numero, { decision, empreinte: hacher(code), expire: this.horloge() + VALIDITE_CODE_MS, essais: 0 });
    return code;
  }

  annuler(numero: string): boolean {
    return this.attente.delete(numero);
  }

  enAttente(numero: string): DecisionEnAttente<T> | null {
    const e = this.attente.get(numero);
    if (!e || this.horloge() > e.expire) return null;
    return e.decision;
  }

  /** Consomme le code : bon code et non expiré → la décision, et le code est détruit (usage unique). */
  verifier(numero: string, code: string): ResultatCode<T> {
    const e = this.attente.get(numero);
    if (!e) return { ok: false, raison: "aucune" };
    if (this.horloge() > e.expire) {
      this.attente.delete(numero);
      return { ok: false, raison: "expire" };
    }
    if (!/^\d{6}$/.test(code) || !timingSafeEqual(hacher(code), e.empreinte)) {
      e.essais += 1;
      if (e.essais >= ESSAIS_MAX) {
        this.attente.delete(numero);
        return { ok: false, raison: "trop_essais" };
      }
      return { ok: false, raison: "faux" };
    }
    this.attente.delete(numero);
    return { ok: true, decision: e.decision };
  }
}
