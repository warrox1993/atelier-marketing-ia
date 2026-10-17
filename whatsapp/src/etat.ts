/**
 * État persistant de la passerelle (fichier JSON 0600 hors dépôt, écriture atomique) : identifiants des messages
 * Meta déjà traités (rejeu impossible, même après redémarrage), heure du dernier message de l'opérateur (fenêtre de 24 h),
 * curseurs des alertes et de la discussion. Aucun contenu de message : les textes d'alerte et les réponses du
 * coordinateur en attente d'une fenêtre ouverte restent EN MÉMOIRE SEULEMENT (`file`), jamais écrits dans le fichier ;
 * un redémarrage les perd, l'atelier reste la source (alertes déjà connues non redites, discussion lisible dans l'écran).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

/** Meta réessaie jusqu'à 36 h : les identifiants sont gardés 72 h. */
export const DUREE_MEMOIRE_MESSAGES_MS = 72 * 3600 * 1000;
const MAX_MESSAGES_MEMORISES = 20_000;
const MAX_ALERTES_CONNUES = 5_000;
const MAX_FILE = 200;

export interface DonneesEtat {
  messagesVus: Record<string, number>;
  /** Dernier message reçu de chaque numéro autorisé (ms) : ouvre la fenêtre de 24 h. */
  derniereEntree: Record<string, number>;
  alertesConnues: Record<string, number>;
  curseursJournal: Record<string, number>;
  curseurDiscussion: string | null;
  initialise: boolean;
}

const vide = (): DonneesEtat => ({ messagesVus: {}, derniereEntree: {}, alertesConnues: {}, curseursJournal: {}, curseurDiscussion: null, initialise: false });

export class Etat {
  readonly d: DonneesEtat;
  /** Textes à remettre quand la fenêtre de 24 h s'ouvre : mémoire seulement (voir l'en-tête du fichier). */
  readonly file: string[] = [];
  constructor(private readonly chemin: string | null) {
    this.d = vide();
    if (chemin) {
      try {
        Object.assign(this.d, JSON.parse(readFileSync(chemin, "utf8")) as Partial<DonneesEtat>);
        // Ancien format : la file était écrite dans le fichier ; on l'oublie (la prochaine écriture l'efface).
        delete (this.d as unknown as Record<string, unknown>)["file"];
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`État illisible (${chemin}) : corriger ou supprimer le fichier.`);
      }
    }
  }

  /** Vrai si l'identifiant a déjà été traité (lecture seule : ne le mémorise pas). */
  dejaVu(idMessage: string): boolean {
    return Object.hasOwn(this.d.messagesVus, idMessage);
  }

  /** Vrai si l'identifiant est nouveau (et le mémorise) ; faux si c'est un rejeu. */
  premiereFois(idMessage: string, maintenant = Date.now()): boolean {
    if (Object.hasOwn(this.d.messagesVus, idMessage)) return false;
    this.d.messagesVus[idMessage] = maintenant;
    this.purger(maintenant);
    this.sauver();
    return true;
  }

  private purger(maintenant: number) {
    for (const [k, t] of Object.entries(this.d.messagesVus)) if (maintenant - t > DUREE_MEMOIRE_MESSAGES_MS) delete this.d.messagesVus[k];
    const cles = Object.keys(this.d.messagesVus);
    if (cles.length > MAX_MESSAGES_MEMORISES) {
      // Au-delà de la borne, les plus anciens sortent (bien après la période de réessai de Meta en usage normal).
      cles.sort((a, b) => this.d.messagesVus[a]! - this.d.messagesVus[b]!).slice(0, cles.length - MAX_MESSAGES_MEMORISES).forEach((k) => delete this.d.messagesVus[k]);
    }
    const alertes = Object.keys(this.d.alertesConnues);
    if (alertes.length > MAX_ALERTES_CONNUES) {
      alertes.sort((a, b) => this.d.alertesConnues[a]! - this.d.alertesConnues[b]!).slice(0, alertes.length - MAX_ALERTES_CONNUES).forEach((k) => delete this.d.alertesConnues[k]);
    }
  }

  enfiler(texte: string) {
    this.file.push(texte);
    if (this.file.length > MAX_FILE) this.file.splice(0, this.file.length - MAX_FILE);
  }

  sauver() {
    if (!this.chemin) return;
    mkdirSync(dirname(this.chemin), { recursive: true, mode: 0o700 });
    const tmp = `${this.chemin}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.d), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, this.chemin);
  }
}
