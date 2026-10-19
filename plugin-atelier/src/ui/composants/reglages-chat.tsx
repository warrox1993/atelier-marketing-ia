/**
 * Réglages du chat du Coordinateur : limités au chat (lecture vocale automatique des réponses, voix, dictée).
 * Préférences gardées dans le navigateur (`localStorage`, toujours sous try/catch : navigation privée, stockage
 * bloqué). Valeurs par défaut = comportement d'avant les réglages : pas de lecture à voix haute, dictée proposée.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LienHote } from "../composants.js";
import { ReglageNotifications } from "./bandeau-decisions.js";
import { IconeReglages } from "./icones-discussion.js";

export interface ReglagesChat {
  /** Lire à voix haute chaque nouvelle réponse du Coordinateur (synthèse vocale du navigateur). */
  lectureAuto: boolean;
  /** `voiceURI` de la voix choisie ; vide : voix par défaut du navigateur. */
  voix: string;
  /** Bouton « Dicter » proposé dans la zone de saisie. */
  dictee: boolean;
}

export const REGLAGES_PAR_DEFAUT: Readonly<ReglagesChat> = { lectureAuto: false, voix: "", dictee: true };
export const CLE_REGLAGES_CHAT = "atelier.chat.reglages";

/** Lit les réglages ; toute valeur absente, illisible ou d'un autre type retombe sur la valeur par défaut. */
export function lireReglagesChat(): ReglagesChat {
  try {
    const brut = JSON.parse(window.localStorage.getItem(CLE_REGLAGES_CHAT) ?? "null") as Partial<Record<keyof ReglagesChat, unknown>> | null;
    return {
      lectureAuto: typeof brut?.lectureAuto === "boolean" ? brut.lectureAuto : REGLAGES_PAR_DEFAUT.lectureAuto,
      voix: typeof brut?.voix === "string" ? brut.voix : REGLAGES_PAR_DEFAUT.voix,
      dictee: typeof brut?.dictee === "boolean" ? brut.dictee : REGLAGES_PAR_DEFAUT.dictee,
    };
  } catch {
    return { ...REGLAGES_PAR_DEFAUT };
  }
}

function ecrireReglagesChat(r: ReglagesChat): void {
  try {
    window.localStorage.setItem(CLE_REGLAGES_CHAT, JSON.stringify(r));
  } catch {
    // Stockage indisponible : le réglage vaut pour la session seulement.
  }
}

export function useReglagesChat(): [ReglagesChat, (changement: Partial<ReglagesChat>) => void] {
  const [reglages, setReglages] = useState<ReglagesChat>(lireReglagesChat);
  const changer = useCallback((changement: Partial<ReglagesChat>) => {
    setReglages((actuels) => {
      const suivant = { ...actuels, ...changement };
      ecrireReglagesChat(suivant);
      return suivant;
    });
  }, []);
  return [reglages, changer];
}

const synthese = (): SpeechSynthesis | null => (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);

/** Voix du navigateur, françaises d'abord ; se met à jour quand le navigateur finit de les charger. */
function useVoixNavigateur(): SpeechSynthesisVoice[] {
  const [voix, setVoix] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const s = synthese();
    if (!s) return;
    const lire = () => setVoix([...s.getVoices()].sort((a, b) => Number(b.lang.toLowerCase().startsWith("fr")) - Number(a.lang.toLowerCase().startsWith("fr")) || a.name.localeCompare(b.name, "fr")));
    lire();
    s.addEventListener?.("voiceschanged", lire);
    return () => s.removeEventListener?.("voiceschanged", lire);
  }, []);
  return voix;
}

/**
 * Lecture à voix haute des NOUVELLES réponses du Coordinateur (celles déjà affichées à l'ouverture ne sont jamais lues ; `pret` : la discussion est chargée).
 * Une réponse à la fois : la précédente est coupée si une autre arrive.
 */
export function useLectureAuto(messages: ReadonlyArray<{ id: string; auteur: "humain" | "agent"; texte: string }>, actif: boolean, voixUri: string, pret: boolean): void {
  const vus = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!pret) return;
    if (vus.current === null) {
      vus.current = new Set(messages.map((m) => m.id));
      return;
    }
    const nouveaux = messages.filter((m) => !vus.current!.has(m.id));
    for (const m of nouveaux) vus.current.add(m.id);
    const s = synthese();
    if (!actif || !s || typeof SpeechSynthesisUtterance === "undefined") return;
    for (const m of nouveaux) {
      if (m.auteur !== "agent" || m.texte.trim() === "") continue;
      const lecture = new SpeechSynthesisUtterance(m.texte);
      lecture.lang = "fr-FR";
      const choisie = voixUri ? s.getVoices().find((v) => v.voiceURI === voixUri) : undefined;
      if (choisie) lecture.voice = choisie;
      s.cancel();
      s.speak(lecture);
    }
  }, [messages, actif, voixUri, pret]);
  // Quitter la discussion coupe la parole.
  useEffect(() => () => synthese()?.cancel(), []);
}

/** Bouton « Réglages du chat » (engrenage) et son petit panneau ; à placer dans `.atl-disc-actions`. */
export function ReglagesDuChat({ reglages, onChange, identifiant }: { reglages: ReglagesChat; onChange(changement: Partial<ReglagesChat>): void; identifiant?: string | null }) {
  const [ouvert, setOuvert] = useState(false);
  const idPanneau = useId();
  const racine = useRef<HTMLDivElement | null>(null);
  const voix = useVoixNavigateur();
  const lectureDisponible = synthese() !== null;

  // Échap referme et rend le focus au bouton ; un clic ailleurs referme.
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOuvert(false);
      racine.current?.querySelector<HTMLElement>("button.atl-disc-reglage")?.focus();
    };
    const surClic = (e: MouseEvent) => {
      if (racine.current && e.target instanceof Node && !racine.current.contains(e.target)) setOuvert(false);
    };
    document.addEventListener("keydown", surTouche);
    document.addEventListener("mousedown", surClic);
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.removeEventListener("mousedown", surClic);
    };
  }, [ouvert]);

  return (
    <div className="atl-disc-reglages" ref={racine}>
      <button type="button" className="atl-disc-reglage" aria-label="Réglages du chat" title="Réglages du chat" aria-expanded={ouvert} aria-controls={ouvert ? idPanneau : undefined} onClick={() => setOuvert((o) => !o)}>
        <IconeReglages />
      </button>
      {ouvert ? (
        <div className="atl-disc-reglages-panneau" id={idPanneau} role="group" aria-label="Réglages du chat">
          <p className="atl-disc-reglages-titre">Réglages du chat</p>
          {identifiant ? (
            <p className="atl-disc-reglages-fil">
              Fil de discussion :{" "}
              <LienHote vers={`/issues/${identifiant}`} className="atl-disc-reglages-lien">
                {identifiant}
              </LienHote>
            </p>
          ) : null}
          <label className="atl-disc-reglages-ligne">
            <input type="checkbox" className="atl-case-tactile" checked={reglages.lectureAuto && lectureDisponible} disabled={!lectureDisponible} onChange={(e) => onChange({ lectureAuto: e.target.checked })} />
            <span>Lire les réponses à voix haute</span>
          </label>
          {!lectureDisponible ? <p className="atl-disc-reglages-aide">Ce navigateur ne propose pas la lecture vocale.</p> : null}
          <label className="atl-disc-reglages-ligne atl-disc-reglages-voix">
            <span>Voix</span>
            <select value={reglages.voix} disabled={!lectureDisponible} onChange={(e) => onChange({ voix: e.target.value })}>
              <option value="">Voix par défaut</option>
              {voix.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
          <label className="atl-disc-reglages-ligne">
            <input type="checkbox" className="atl-case-tactile" checked={reglages.dictee} onChange={(e) => onChange({ dictee: e.target.checked })} />
            <span>Dictée vocale (bouton micro)</span>
          </label>
          <ReglageNotifications />
        </div>
      ) : null}
    </div>
  );
}
