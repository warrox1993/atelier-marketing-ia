/**
 * Appels aux routes HTTP du plugin (prospection) depuis l'interface : même origine, session de
 * l'utilisateur. Les droits (humain seulement pour l'import, la suppression, les oppositions) sont
 * contrôlés par le serveur ; l'interface ne fait qu'expliquer le refus.
 */
import { PLUGIN_ID } from "../contrats/identifiants.js";
import { appelHote } from "./hote.js";

export function appelRoute<T>(methode: "GET" | "POST", chemin: string, corps?: unknown): Promise<T> {
  return appelHote<T>(methode, `/plugins/${PLUGIN_ID}/api${chemin}`, corps);
}

/** Remet au navigateur un fichier reçu en base64 (Blob et lien `download`), sans rien écrire côté serveur. */
export function telechargerBase64(nomFichier: string, typeMime: string, contenuBase64: string): void {
  const binaire = atob(contenuBase64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([octets], { type: typeMime }));
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  lien.rel = "noopener";
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}
