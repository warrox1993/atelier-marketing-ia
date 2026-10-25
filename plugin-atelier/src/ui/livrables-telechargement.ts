/**
 * Téléchargement d'un livrable de la fabrique par morceaux (route `GET /livrables/:travail/:fichier?morceau=N`).
 * Les morceaux sont décodés directement à leur place dans un tampon unique de la taille du fichier, l'empreinte
 * SHA-256 de l'ensemble est vérifiée avec `crypto.subtle.digest`, puis le navigateur reçoit le fichier par un lien
 * `download` sur un Blob (révoqué aussitôt). Rien n'est enregistré si l'empreinte diffère.
 */
import { appelRoute } from "./routes-prospection.js";

export interface MorceauRecu {
  fichier: string;
  typeMime: string;
  taille: number;
  sha256: string;
  morceau: number;
  morceaux: number;
  contenuBase64: string;
}

export interface ProgressionTelechargement {
  /** Morceaux déjà reçus. */
  recus: number;
  morceaux: number;
}

/** Erreur dont le message est affichable tel quel. */
export class ErreurTelechargement extends Error {
  constructor(
    message: string,
    readonly code: "empreinte" | "reponse" | "navigateur",
  ) {
    super(message);
    this.name = "ErreurTelechargement";
  }
}

export const MESSAGE_EMPREINTE =
  "L'empreinte (SHA-256) du fichier reçu ne correspond pas à celle du service : le fichier est peut-être incomplet ou altéré, il n'a pas été enregistré. Réessayez ; si le problème persiste, prévenez l'équipe.";

/** Taille d'un morceau côté service (doit rester égale à `TAILLE_MORCEAU` de fabrique-remise.ts). */
export const TAILLE_MORCEAU = 8 * 1024 * 1024;

function decoderDans(base64: string, cible: Uint8Array, decalage: number): number {
  const binaire = atob(base64);
  for (let i = 0; i < binaire.length; i += 1) cible[decalage + i] = binaire.charCodeAt(i);
  return binaire.length;
}

export const hexa = (tampon: ArrayBuffer): string => Array.from(new Uint8Array(tampon), (o) => o.toString(16).padStart(2, "0")).join("");

/** Récupère tous les morceaux à la suite, vérifie l'empreinte et rend le Blob. */
export async function recupererLivrable(
  companyId: string,
  travail: string,
  fichier: string,
  surProgression: (p: ProgressionTelechargement) => void = () => undefined,
): Promise<{ blob: Blob; nom: string }> {
  const sujet = globalThis.crypto?.subtle;
  if (!sujet) throw new ErreurTelechargement("Ce navigateur ne permet pas de vérifier l'empreinte du fichier (connexion non sécurisée) : téléchargement refusé.", "navigateur");
  const url = (n: number) => `/livrables/${encodeURIComponent(travail)}/${encodeURIComponent(fichier)}?companyId=${encodeURIComponent(companyId)}&morceau=${n}`;
  const premier = await appelRoute<MorceauRecu>("GET", url(0));
  if (!Number.isSafeInteger(premier.taille) || premier.taille < 0 || !Number.isSafeInteger(premier.morceaux) || premier.morceaux < 1 || typeof premier.sha256 !== "string") {
    throw new ErreurTelechargement("Réponse du service incomplète : téléchargement abandonné.", "reponse");
  }
  const tout = new Uint8Array(premier.taille);
  let recu = premier;
  for (let n = 0; n < premier.morceaux; n += 1) {
    if (n > 0) recu = await appelRoute<MorceauRecu>("GET", url(n));
    if (recu.morceau !== n || recu.morceaux !== premier.morceaux || recu.taille !== premier.taille || recu.sha256 !== premier.sha256) {
      throw new ErreurTelechargement("Le service a changé le fichier pendant le téléchargement : réessayez.", "reponse");
    }
    const debut = n * TAILLE_MORCEAU;
    const attendu = Math.min(TAILLE_MORCEAU, premier.taille - debut);
    if (attendu < 0 || decoderDans(recu.contenuBase64, tout, debut) !== attendu) {
      throw new ErreurTelechargement("Un morceau reçu n'a pas la taille attendue : téléchargement abandonné.", "reponse");
    }
    surProgression({ recus: n + 1, morceaux: premier.morceaux });
  }
  const empreinte = hexa(await sujet.digest("SHA-256", tout));
  if (empreinte !== premier.sha256.toLowerCase()) throw new ErreurTelechargement(MESSAGE_EMPREINTE, "empreinte");
  return { blob: new Blob([tout], { type: premier.typeMime }), nom: premier.fichier };
}

/** Remet le Blob au navigateur (lien `download`, URL révoquée ensuite). */
export function remettreAuNavigateur(blob: Blob, nom: string): void {
  const adresse = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = adresse;
  lien.download = nom;
  lien.rel = "noopener";
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(adresse);
}
