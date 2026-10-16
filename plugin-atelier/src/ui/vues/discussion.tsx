/**
 * Discussion avec le Coordinateur : un fil de bulles pour piloter l'atelier en langage libre.
 *
 * Le fil est celui d'une issue native unique (routes `discussion.*`). L'écran se met à jour par
 * interrogation toutes les 4 s quand l'onglet est visible, jamais en arrière-plan. Le texte est rendu
 * sans HTML (aucun `dangerouslySetInnerHTML`) ; seuls les identifiants de tâche (`ABC-12`) deviennent
 * des liens vers la tâche.
 */
import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import { BoutonDicter } from "../composants/dictee.js";
import { VoixEnDirect } from "../composants/voix-en-direct.js";
import { Bouton, Chargement, EtatErreur, LienHote } from "../composants.js";
import { dateHeure, classerErreur } from "../format.js";
import { appelRoute } from "../routes-prospection.js";
import { STYLES_DISCUSSION } from "../styles-discussion.js";

export interface MessageFil {
  id: string;
  auteur: "humain" | "agent";
  nom: string;
  texte: string;
  date: string;
}
interface Ouverture {
  issueId: string;
  identifiant: string | null;
  messages: MessageFil[];
}

export const INTERVALLE_MS = 4000;
/** Au-delà, l'indicateur « réfléchit » s'efface : le Coordinateur n'a peut-être pas pu répondre. */
export const DELAI_ATTENTE_MS = 180_000;
const MAX_TEXTE = 4000;
export const SUGGESTIONS = ["Où en sont les missions ?", "Qu'est-ce qui est bloqué ?", "Résume les nouveaux leads", "Lance une prospection sur une zone"] as const;

const MOTIF_TACHE = /\b[A-Z]{2,5}-\d+\b/gu;

/** Texte sûr : retours à la ligne conservés par le style, identifiants de tâche en liens. */
export function TexteSur({ texte }: { texte: string }) {
  const morceaux: ReactNode[] = [];
  let dernier = 0;
  for (const m of texte.matchAll(MOTIF_TACHE)) {
    const debut = m.index ?? 0;
    if (debut > dernier) morceaux.push(texte.slice(dernier, debut));
    morceaux.push(
      <LienHote key={`${debut}-${m[0]}`} vers={`/issues/${m[0]}`} className="">
        {m[0]}
      </LienHote>,
    );
    dernier = debut + m[0].length;
  }
  if (dernier < texte.length) morceaux.push(texte.slice(dernier));
  return (
    <>
      {morceaux.map((x, i) => (
        <Fragment key={i}>{x}</Fragment>
      ))}
    </>
  );
}

/** Fusionne sans doublon (identifiant) et trie du plus ancien au plus récent. */
function fusionner(actuels: MessageFil[], nouveaux: MessageFil[]): MessageFil[] {
  if (nouveaux.length === 0) return actuels;
  const connus = new Set(actuels.map((m) => m.id));
  const ajouts = nouveaux.filter((m) => !connus.has(m.id));
  if (ajouts.length === 0) return actuels;
  return [...actuels, ...ajouts].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function VueDiscussion() {
  const { companyId } = useHostContext();
  const [etat, setEtat] = useState<{ ouverture: Ouverture | null; erreur: unknown; chargement: boolean }>({ ouverture: null, erreur: null, chargement: true });
  const [messages, setMessages] = useState<MessageFil[]>([]);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  /** Instant (ms) du dernier envoi sans réponse reçue ; `null` si le Coordinateur a répondu. */
  const [attenteDepuis, setAttenteDepuis] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const fil = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<MessageFil[]>([]);
  messagesRef.current = messages;
  const enVol = useRef(false);

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    appelRoute<Ouverture>("GET", `/discussion?companyId=${encodeURIComponent(companyId)}`)
      .then((o) => {
        if (annule) return;
        setEtat({ ouverture: o, erreur: null, chargement: false });
        setMessages((actuels) => fusionner(actuels, o.messages));
      })
      .catch((erreur: unknown) => !annule && setEtat({ ouverture: null, erreur, chargement: false }));
    return () => {
      annule = true;
    };
  }, [companyId, version]);

  const interroger = useCallback(async () => {
    if (!companyId || enVol.current) return;
    enVol.current = true;
    try {
      const derniere = messagesRef.current.at(-1)?.date;
      const r = await appelRoute<{ messages: MessageFil[] }>("GET", `/discussion/messages?companyId=${encodeURIComponent(companyId)}${derniere ? `&depuis=${encodeURIComponent(derniere)}` : ""}`);
      if (r.messages.length > 0) {
        setMessages((actuels) => fusionner(actuels, r.messages));
        if (r.messages.some((m) => m.auteur === "agent")) setAttenteDepuis(null);
      }
      setAttenteDepuis((depuis) => (depuis !== null && Date.now() - depuis > DELAI_ATTENTE_MS ? null : depuis));
    } catch {
      // Une interrogation ratée ne casse rien : la suivante réessaie.
    } finally {
      enVol.current = false;
    }
  }, [companyId]);

  // Interrogation toutes les 4 s, en pause quand l'onglet est caché, reprise immédiate au retour.
  const pret = etat.ouverture !== null;
  useEffect(() => {
    if (!pret) return;
    let minuteur: ReturnType<typeof setInterval> | null = null;
    const demarrer = () => {
      if (minuteur === null) minuteur = setInterval(() => void interroger(), INTERVALLE_MS);
    };
    const arreter = () => {
      if (minuteur !== null) clearInterval(minuteur);
      minuteur = null;
    };
    const surVisibilite = () => {
      if (document.visibilityState === "visible") {
        void interroger();
        demarrer();
      } else arreter();
    };
    if (document.visibilityState === "visible") demarrer();
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      document.removeEventListener("visibilitychange", surVisibilite);
      arreter();
    };
  }, [pret, interroger]);

  // Le fil reste calé en bas quand un message arrive.
  useEffect(() => {
    const el = fil.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, attenteDepuis]);

  const envoyer = useCallback(
    async (brut: string) => {
      const propre = brut.trim();
      if (!companyId || propre === "" || envoi) return;
      setEnvoi(true);
      setErreurEnvoi(null);
      try {
        const m = await appelRoute<MessageFil & { reveilDemande?: boolean }>("POST", "/discussion/message", { companyId, texte: propre });
        setMessages((actuels) => fusionner(actuels, [{ id: m.id, auteur: "humain", nom: m.nom || "Vous", texte: propre, date: m.date }]));
        setAttenteDepuis(Date.now());
        setTexte("");
      } catch (e) {
        setErreurEnvoi(classerErreur(e).message);
      } finally {
        setEnvoi(false);
      }
    },
    [companyId, envoi],
  );

  const surTouche = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void envoyer(texte);
    }
  };

  if (etat.erreur) return <EtatErreur erreur={etat.erreur} onReessayer={() => setVersion((v) => v + 1)} contexte="la discussion" />;
  if (etat.chargement && !etat.ouverture) return <Chargement libelle="Ouverture de la discussion" lignes={3} />;

  return (
    <section className="atl-disc" aria-label="Discussion avec le Coordinateur">
      <style>{STYLES_DISCUSSION}</style>
      <div className="atl-disc-entete">
        <h1>Discussion avec le Coordinateur</h1>
        {etat.ouverture?.identifiant ? <span className="atl-attenue">{etat.ouverture.identifiant}</span> : null}
      </div>
      <div ref={fil} className="atl-disc-fil" role="log" aria-live="polite" aria-label="Messages de la discussion">
        {messages.length === 0 ? (
          <div className="atl-disc-vide">
            <p>Demandez ce que vous voulez à l'équipe : état des missions, blocages, nouveaux leads, nouvelle prospection.</p>
            <div className="atl-disc-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="atl-disc-suggestion" disabled={envoi} onClick={() => void envoyer(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="atl-disc-bulle" data-auteur={m.auteur}>
              <span className="atl-disc-meta">
                {m.nom} · <time dateTime={m.date}>{dateHeure(m.date)}</time>
              </span>
              <p className="atl-disc-texte">
                <TexteSur texte={m.texte} />
              </p>
            </div>
          ))
        )}
        {attenteDepuis !== null ? (
          <p className="atl-disc-attente" role="status">
            Le Coordinateur réfléchit…
          </p>
        ) : null}
      </div>
      {erreurEnvoi ? (
        <p className="atl-disc-erreur" role="alert">
          {erreurEnvoi}
        </p>
      ) : null}
      <form
        className="atl-disc-saisie"
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer(texte);
        }}
      >
        <div className="atl-disc-emplacements">
          <div data-emplacement="dicter">
            <BoutonDicter companyId={companyId ?? null} onTexte={(t) => setTexte((actuel) => (actuel.trim() === "" ? t : `${actuel.trimEnd()} ${t}`))} />
          </div>
          <div data-emplacement="parler-en-direct">
            <VoixEnDirect companyId={companyId ?? null} />
          </div>
        </div>
        <textarea
          aria-label="Votre message au Coordinateur"
          placeholder="Écrivez au Coordinateur"
          rows={1}
          maxLength={MAX_TEXTE}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={surTouche}
        />
        <Bouton type="submit" variante="principal" enCours={envoi} raisonDesactive={texte.trim() === "" ? "Écrivez d'abord votre message." : null}>
          Envoyer
        </Bouton>
      </form>
    </section>
  );
}
