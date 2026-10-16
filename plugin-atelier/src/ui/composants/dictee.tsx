/**
 * Bouton « Dicter » : enregistre la voix (MediaRecorder), l'envoie à `POST /dictee/transcrire` (serveur
 * local whisper.cpp) et rend le texte à l'appelant, qui le place dans le champ de saisie : modifiable,
 * jamais envoyé automatiquement. Grisé quand `GET /dictee/etat` répond `disponible: false`.
 */
import { useEffect, useRef, useState } from "react";
import { classerErreur } from "../format.js";
import { appelRoute } from "../routes-prospection.js";

const TYPES_PREFERES = ["audio/webm", "audio/ogg", "audio/mp4"];
/** Taille décodée maximale que le serveur accepte (l'hôte limite le corps à 1 000 000 d'octets, base64 compris). */
export const TAILLE_MAX_AUDIO_OCTETS = 700_000;
/** On arrête l'enregistrement avant cette taille cumulée, pour garder de la marge sur le dernier morceau. */
export const SEUIL_ARRET_OCTETS = 600_000;

function enBase64(octets: Uint8Array): string {
  let s = "";
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}

export function BoutonDicter({ companyId, onTexte }: { companyId: string | null; onTexte: (texte: string) => void }) {
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [etat, setEtat] = useState<"repos" | "enregistre" | "transcrit">("repos");
  const [erreur, setErreur] = useState<string | null>(null);
  const enregistreur = useRef<MediaRecorder | null>(null);
  const flux = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    appelRoute<{ disponible: boolean }>("GET", `/dictee/etat?companyId=${encodeURIComponent(companyId)}`)
      .then((r) => !annule && setDisponible(r.disponible === true))
      .catch(() => !annule && setDisponible(false));
    return () => {
      annule = true;
      flux.current?.getTracks().forEach((t) => t.stop());
    };
  }, [companyId]);

  async function demarrer() {
    setErreur(null);
    try {
      const micro = await navigator.mediaDevices.getUserMedia({ audio: true });
      flux.current = micro;
      const type = TYPES_PREFERES.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t));
      const r = new MediaRecorder(micro, type ? { mimeType: type } : undefined);
      const morceaux: Blob[] = [];
      let cumule = 0;
      r.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        morceaux.push(e.data);
        cumule += e.data.size;
        if (cumule >= SEUIL_ARRET_OCTETS && r.state === "recording") {
          setErreur("Dictée arrêtée : la durée maximale est atteinte (enregistrement trop long pour être transcrit en une fois).");
          r.stop();
        }
      };
      r.onstop = () => {
        micro.getTracks().forEach((t) => t.stop());
        void transcrire(new Blob(morceaux, { type: r.mimeType || type || "audio/webm" }));
      };
      enregistreur.current = r;
      r.start(1000); // un morceau par seconde : la taille cumulée est contrôlée au fil de l'eau
      setEtat("enregistre");
    } catch (e) {
      const nom = (e as { name?: string } | null)?.name;
      setErreur(
        nom === "NotAllowedError" || nom === "SecurityError"
          ? "Accès au micro refusé."
          : nom === "NotSupportedError" || nom === "TypeError" || typeof MediaRecorder === "undefined"
            ? "Ce navigateur ne permet pas la dictée (micro ou enregistrement indisponible)."
            : "Le micro n'est pas accessible : autorisez-le dans le navigateur.",
      );
      setEtat("repos");
    }
  }

  async function transcrire(blob: Blob) {
    if (!companyId) return;
    if (blob.size > TAILLE_MAX_AUDIO_OCTETS) {
      setErreur("Enregistrement trop long pour être transcrit : dictez en plusieurs fois.");
      setEtat("repos");
      return;
    }
    setEtat("transcrit");
    try {
      const audioBase64 = enBase64(new Uint8Array(await blob.arrayBuffer()));
      const r = await appelRoute<{ texte: string }>("POST", "/dictee/transcrire", { companyId, audioBase64, type: blob.type || "audio/webm" });
      if (r.texte?.trim()) onTexte(r.texte.trim());
    } catch (e) {
      setErreur(classerErreur(e).message);
    } finally {
      setEtat("repos");
    }
  }

  const arreter = () => enregistreur.current?.state === "recording" && enregistreur.current.stop();
  const indisponible = disponible !== true;
  return (
    <span className="atl-bouton-groupe">
      <button
        type="button"
        className="atl-bouton"
        aria-pressed={etat === "enregistre"}
        aria-disabled={indisponible || etat === "transcrit" ? "true" : undefined}
        disabled={indisponible || etat === "transcrit"}
        title={disponible === false ? "La dictée vocale locale n'est pas disponible." : undefined}
        onClick={() => (etat === "enregistre" ? arreter() : void demarrer())}
      >
        {etat === "enregistre" ? "Arrêter la dictée" : etat === "transcrit" ? "Transcription…" : "Dicter"}
      </button>
      {erreur ? (
        <span role="alert" className="atl-disc-erreur">
          {erreur}
        </span>
      ) : null}
    </span>
  );
}
