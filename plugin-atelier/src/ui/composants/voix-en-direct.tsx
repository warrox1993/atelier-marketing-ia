/**
 * Voix en direct : « Parler en direct » / « Arrêter », conversation vocale avec le modèle Realtime d'OpenAI
 * (WebRTC), transcription affichée des deux côtés. Brique autonome pour le futur chat de pilotage.
 *
 * Le navigateur reçoit du plugin un secret ÉPHÉMÈRE (route `voix.session`) ; la clé API reste côté serveur.
 * Les outils du modèle sont exécutés ici par les routes existantes du plugin, en LECTURE seule ; la seule
 * « action » possible est de transmettre une demande au Coordinateur (`equipe.demander`), et uniquement après un
 * clic humain sur « Transmettre » dans l'encart de confirmation : le texte proposé par le modèle n'est jamais
 * envoyé de lui-même (il peut avoir été influencé par du texte libre lu dans les outils de lecture).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { classerErreur } from "../format.js";
import { appelRoute } from "../routes-prospection.js";
import { IconeArret, IconeOndes } from "./icones-discussion.js";

export const URL_APPELS_REALTIME = "https://api.openai.com/v1/realtime/calls";

export type EtatVoix = "inactif" | "connexion" | "ecoute" | "reflechit" | "parle";
export interface LigneVoix {
  id: string;
  role: "utilisateur" | "assistant";
  texte: string;
}

const LIBELLES_ETAT: Record<EtatVoix, string> = {
  inactif: "Micro arrêté",
  connexion: "Connexion…",
  ecoute: "Je vous écoute",
  reflechit: "Je réfléchis",
  parle: "Je parle",
};

type Json = Record<string, unknown>;

/** Préfixe qui marque l'origine d'une demande transmise depuis la voix en direct. */
export const PREFIXE_DEMANDE_VOIX = "[Demande dictée en direct]";

/** Résultat d'outil renvoyé au modèle quand l'humain refuse la demande proposée. */
export const REFUS_UTILISATEUR = JSON.stringify({ erreur: "refusé par l'utilisateur", transmise: false });

/** Demande extraite des arguments de l'outil de transmission ("" si illisible ou vide). */
export function demandeProposee(argumentsBrutes: string): string {
  try {
    return String((JSON.parse(argumentsBrutes) as Json).demande ?? "").trim();
  } catch {
    return "";
  }
}

/** Exécute un outil du modèle par les routes du plugin ; renvoie le texte JSON rendu au modèle. */
export async function executerOutil(nom: string, argumentsBrutes: string, companyId: string, transmissionConfirmee = false): Promise<string> {
  const c = encodeURIComponent(companyId);
  try {
    switch (nom) {
      case "etat_missions": {
        const r = await appelRoute<{ missions?: unknown }>("GET", `/accueil?companyId=${c}`);
        return JSON.stringify({ missions: r.missions ?? [] });
      }
      case "taches_bloquees": {
        const r = await appelRoute<{ elements?: Array<Json> }>("GET", `/accueil?companyId=${c}`);
        return JSON.stringify({ taches: (r.elements ?? []).filter((e) => e.type === "tache_bloquee").map((e) => ({ titre: e.titre, raison: e.raison, urgence: e.urgence })) });
      }
      case "resume_prospects": {
        const [tous, qualifies] = await Promise.all([
          appelRoute<{ total?: number }>("GET", `/prospects?companyId=${c}&parPage=1&vue=complete`),
          appelRoute<{ total?: number }>("GET", `/prospects?companyId=${c}&parPage=1&vue=complete&qualifiesSeulement=true`),
        ]);
        return JSON.stringify({ total: tous.total ?? 0, qualifies: qualifies.total ?? 0 });
      }
      case "transmettre_au_coordinateur": {
        const demande = demandeProposee(argumentsBrutes);
        if (demande === "") return JSON.stringify({ erreur: "demande vide" });
        // Garde-fou : sans clic humain sur « Transmettre », aucun appel.
        if (!transmissionConfirmee) return JSON.stringify({ erreur: "confirmation humaine requise : demande non transmise" });
        const r = await appelRoute<{ identifiant?: string | null }>("POST", "/equipe/demande", { companyId, texte: `${PREFIXE_DEMANDE_VOIX} ${demande}` });
        return JSON.stringify({ transmise: true, tache: r.identifiant ?? null });
      }
      default:
        return JSON.stringify({ erreur: `outil inconnu : ${nom}` });
    }
  } catch (err) {
    return JSON.stringify({ erreur: classerErreur(err).message });
  }
}

export const MSG_VOIX_NON_SUPPORTEE = "Ce navigateur ne permet pas la voix en direct (micro ou WebRTC indisponible).";
export const MSG_VOIX_MICRO_REFUSE = "Accès au micro refusé.";
export const MSG_VOIX_GENERIQUE = "La voix en direct n'a pas pu démarrer.";

/** Message lisible pour une erreur de démarrage : jamais de texte brut du navigateur (souvent en anglais). */
export function messageDemarrage(err: unknown): string {
  const e = err as { name?: string; code?: string; message?: string } | null;
  if (e?.name === "NotAllowedError" || e?.name === "SecurityError") return MSG_VOIX_MICRO_REFUSE;
  if (e?.name === "NotSupportedError") return MSG_VOIX_NON_SUPPORTEE;
  if (e?.name === "NotFoundError") return "Aucun micro détecté sur cet appareil.";
  // Erreurs du plugin lui-même (déjà en français) : appel OpenAI refusé, route du plugin.
  if (e?.code === "VOIX") return String(e.message ?? MSG_VOIX_GENERIQUE);
  if (err && typeof err === "object" && "code" in err) return classerErreur(err).message;
  return MSG_VOIX_GENERIQUE;
}

export function VoixEnDirect({ companyId }: { companyId: string | null }) {
  const [etat, setEtat] = useState<EtatVoix>("inactif");
  const [lignes, setLignes] = useState<LigneVoix[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const flux = useRef<MediaStream | null>(null);
  const canal = useRef<RTCDataChannel | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const actif = useRef(false);
  /** Demande proposée par le modèle, en attente du clic humain ; `decider` résout l'appel d'outil en suspens. */
  const [proposition, setProposition] = useState<string | null>(null);
  const decision = useRef<((transmettre: boolean) => void) | null>(null);

  const decider = useCallback((transmettre: boolean) => {
    const d = decision.current;
    decision.current = null;
    setProposition(null);
    d?.(transmettre);
  }, []);

  const fermer = useCallback(() => {
    actif.current = false;
    decider(false);
    canal.current?.close();
    pc.current?.close();
    flux.current?.getTracks().forEach((t) => t.stop());
    if (audio.current) audio.current.srcObject = null;
    canal.current = null;
    pc.current = null;
    flux.current = null;
    audio.current = null;
    setEtat("inactif");
  }, [decider]);
  useEffect(() => fermer, [fermer]);

  const majLigne = (id: string, role: LigneVoix["role"], fn: (ancien: string) => string) =>
    setLignes((ls) => {
      const i = ls.findIndex((l) => l.id === id && l.role === role);
      if (i < 0) return [...ls, { id, role, texte: fn("") }];
      return ls.map((l, k) => (k === i ? { ...l, texte: fn(l.texte) } : l));
    });

  const envoyer = (evenement: Json) => {
    if (canal.current?.readyState === "open") canal.current.send(JSON.stringify(evenement));
  };

  const traiter = async (e: Json, societe: string) => {
    switch (e.type) {
      case "input_audio_buffer.speech_started":
        setEtat("ecoute");
        break;
      case "input_audio_buffer.speech_stopped":
      case "response.created":
        setEtat("reflechit");
        break;
      case "output_audio_buffer.started":
        setEtat("parle");
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        setEtat("ecoute");
        break;
      case "conversation.item.input_audio_transcription.delta":
        majLigne(String(e.item_id), "utilisateur", (a) => a + String(e.delta ?? ""));
        break;
      case "conversation.item.input_audio_transcription.completed":
        majLigne(String(e.item_id), "utilisateur", () => String(e.transcript ?? "").trim());
        break;
      case "response.output_audio_transcript.delta":
        setEtat("parle");
        majLigne(String(e.item_id), "assistant", (a) => a + String(e.delta ?? ""));
        break;
      case "response.output_audio_transcript.done":
        majLigne(String(e.item_id), "assistant", () => String(e.transcript ?? "").trim());
        break;
      case "response.function_call_arguments.done": {
        setEtat("reflechit");
        let sortie: string;
        if (e.name === "transmettre_au_coordinateur") {
          const demande = demandeProposee(String(e.arguments ?? ""));
          if (demande === "") {
            sortie = JSON.stringify({ erreur: "demande vide" });
          } else {
            // Une proposition à la fois : une nouvelle remplace (et refuse) la précédente.
            decision.current?.(false);
            setProposition(demande);
            const accepte = await new Promise<boolean>((fin) => {
              decision.current = fin;
            });
            sortie = accepte ? await executerOutil("transmettre_au_coordinateur", String(e.arguments ?? ""), societe, true) : REFUS_UTILISATEUR;
          }
        } else {
          sortie = await executerOutil(String(e.name), String(e.arguments ?? ""), societe);
        }
        envoyer({ type: "conversation.item.create", item: { type: "function_call_output", call_id: e.call_id, output: sortie } });
        envoyer({ type: "response.create" });
        break;
      }
      case "error": {
        const msg = (e.error as Json | undefined)?.message;
        setErreur(typeof msg === "string" && msg ? `Erreur de la voix : ${msg}` : "Erreur de la voix en direct.");
        break;
      }
      default:
    }
  };

  const demarrer = async () => {
    if (!companyId || actif.current) return;
    setErreur(null);
    setLignes([]);
    if (!window.isSecureContext) {
      setErreur("La voix en direct demande une connexion sécurisée (HTTPS) ou l'adresse localhost : le navigateur refuse le micro sinon.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setErreur(MSG_VOIX_NON_SUPPORTEE);
      return;
    }
    actif.current = true;
    setEtat("connexion");
    try {
      const micro = await navigator.mediaDevices.getUserMedia({ audio: true });
      flux.current = micro;
      const session = await appelRoute<{ clientSecret: string }>("POST", "/voix/session", { companyId });
      if (!actif.current) return;
      const connexion = new RTCPeerConnection();
      pc.current = connexion;
      const lecteur = document.createElement("audio");
      lecteur.autoplay = true;
      audio.current = lecteur;
      connexion.ontrack = (ev) => {
        lecteur.srcObject = ev.streams[0] ?? null;
      };
      micro.getTracks().forEach((t) => connexion.addTrack(t, micro));
      const dc = connexion.createDataChannel("oai-events");
      canal.current = dc;
      dc.onmessage = (m) => {
        try {
          void traiter(JSON.parse(String(m.data)) as Json, companyId);
        } catch {
          /* événement illisible : ignoré */
        }
      };
      dc.onopen = () => setEtat("ecoute");
      connexion.onconnectionstatechange = () => {
        if (connexion.connectionState === "failed" || connexion.connectionState === "disconnected") {
          setErreur("La connexion vocale a été coupée.");
          fermer();
        }
      };
      const offre = await connexion.createOffer();
      await connexion.setLocalDescription(offre);
      const rep = await fetch(URL_APPELS_REALTIME, {
        method: "POST",
        body: offre.sdp,
        headers: { Authorization: `Bearer ${session.clientSecret}`, "Content-Type": "application/sdp" },
      });
      if (!rep.ok) throw { code: "VOIX", message: `OpenAI a refusé l'appel vocal (HTTP ${rep.status}).` };
      await connexion.setRemoteDescription({ type: "answer", sdp: await rep.text() });
    } catch (err) {
      setErreur(messageDemarrage(err));
      fermer();
    }
  };

  const enMarche = etat !== "inactif";
  return (
    <section className="atl-voix" aria-label="Voix en direct">
      <div className="atl-voix-ligne">
        <button
          type="button"
          className="atl-bouton atl-disc-icone"
          data-variante={enMarche ? "danger" : undefined}
          style={{ minHeight: "2.75rem", minWidth: "2.75rem" }}
          title={enMarche ? "Arrêter la voix en direct" : "Parler en direct"}
          onClick={enMarche ? fermer : () => void demarrer()}
          disabled={!companyId}
        >
          {enMarche ? <IconeArret /> : <IconeOndes />}
          <span className="atl-sr">{enMarche ? "Arrêter" : "Parler en direct"}</span>
        </button>
        <span role="status" aria-live="polite" data-etat={etat}>
          {LIBELLES_ETAT[etat]}
        </span>
      </div>
      {proposition !== null ? (
        <div role="group" aria-label="Demande à confirmer" className="atl-voix-confirmation">
          <p>
            <strong>L'assistant propose de transmettre cette demande au Coordinateur :</strong>
          </p>
          <blockquote className="atl-voix-proposition">{proposition}</blockquote>
          <div className="atl-voix-actions">
            <button type="button" className="atl-bouton" data-variante="principal" onClick={() => decider(true)}>
              Transmettre
            </button>
            <button type="button" className="atl-bouton" onClick={() => decider(false)}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}
      {erreur ? (
        <p role="alert" className="atl-erreur">
          {erreur}
        </p>
      ) : null}
      {lignes.length > 0 ? (
        <ol className="atl-voix-transcription" aria-label="Transcription">
          {lignes.map((l) => (
            <li key={`${l.role}:${l.id}`} data-role={l.role}>
              <strong>{l.role === "utilisateur" ? "Vous" : "Assistant"} : </strong>
              {l.texte}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
