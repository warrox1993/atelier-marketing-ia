/**
 * Historique des discussions avec le Coordinateur (colonne de gauche de la vue Discussion) : bouton « Nouvelle
 * discussion », puis les discussions de la plus récente à la plus ancienne ; un clic reprend la discussion choisie.
 * Fenêtre étroite : la colonne se replie, le bouton « Discussions » de l'en-tête (voir `BasculeHistorique`) la rouvre.
 * Lecture seule côté serveur (`discussion.lister`), relue après chaque envoi, chaque nouvelle discussion et toutes les 30 s.
 * Chaque discussion a un bouton « Supprimer » (corbeille) ; la confirmation « Supprimer ? Oui / Annuler » se fait dans la liste.
 */
import { useEffect, useState } from "react";
import { dateSeule, enDate, ilYA } from "../format.js";
import { appelRoute } from "../routes-prospection.js";

export interface ResumeDiscussion {
  issueId: string;
  identifiant: string | null;
  titre: string;
  majLe: string;
  statut: string;
}

export const INTERVALLE_HISTORIQUE_MS = 30_000;
const SEPT_JOURS_MS = 7 * 86_400_000;

/** « il y a 3 heures » pendant une semaine, puis la date. */
export function dateDiscussion(iso: string, maintenant: Date = new Date()): string {
  const d = enDate(iso);
  if (!d) return "";
  return maintenant.getTime() - d.getTime() < SEPT_JOURS_MS ? ilYA(d, maintenant) : dateSeule(iso);
}

/** Lit l'historique de l'entreprise ; `rafraichir` (compteur) force une relecture. Une panne n'empêche jamais de discuter. */
export function useHistoriqueDiscussions(companyId: string | null, rafraichir: number) {
  const [discussions, setDiscussions] = useState<ResumeDiscussion[]>([]);
  const [indisponible, setIndisponible] = useState(false);
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    const lire = () =>
      appelRoute<{ discussions?: ResumeDiscussion[] }>("GET", `/discussion/liste?companyId=${encodeURIComponent(companyId)}`)
        .then((r) => {
          if (annule) return;
          setDiscussions(r.discussions ?? []);
          setIndisponible(false);
        })
        .catch(() => !annule && setIndisponible(true));
    void lire();
    const minuteur = setInterval(() => {
      if (document.visibilityState === "visible") void lire();
    }, INTERVALLE_HISTORIQUE_MS);
    return () => {
      annule = true;
      clearInterval(minuteur);
    };
  }, [companyId, rafraichir, essai]);
  return { discussions, indisponible, reessayer: () => setEssai((n) => n + 1) };
}

export const ID_HISTORIQUE = "atl-disc-historique";

/** Bouton de l'en-tête qui ouvre ou replie la colonne (visible seulement en fenêtre étroite, par le style). */
export function BasculeHistorique({ ouvert, onBasculer }: { ouvert: boolean; onBasculer: () => void }) {
  return (
    <button type="button" className="atl-bouton atl-disc-bascule" data-variante="discret" aria-expanded={ouvert} aria-controls={ID_HISTORIQUE} onClick={onBasculer}>
      Discussions
    </button>
  );
}

/** Corbeille sobre (trait fin, couleur du texte) ; décorative, le bouton porte son libellé. */
function IconeCorbeille() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9h6.8L12 4M6.5 6.5v4.5M9.5 6.5v4.5" />
    </svg>
  );
}

export function HistoriqueDiscussions(p: {
  discussions: ResumeDiscussion[];
  /** Discussion ouverte (null tant qu'aucune n'existe). */
  courante: string | null;
  ouvert: boolean;
  occupe: boolean;
  indisponible: boolean;
  onChoisir: (issueId: string) => void;
  onNouvelle: () => void;
  onReessayer: () => void;
  onSupprimer: (issueId: string) => void | Promise<void>;
}) {
  /** Discussion dont la suppression attend « Oui » (confirmation en ligne, jamais `window.confirm`). */
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  return (
    <aside id={ID_HISTORIQUE} className="atl-disc-historique" data-ouvert={p.ouvert ? "oui" : undefined} aria-label="Historique des discussions">
      <button type="button" className="atl-bouton atl-disc-nouvelle" title="Nouvelle discussion (ou tapez /clear)" disabled={p.occupe} onClick={p.onNouvelle}>
        Nouvelle discussion
      </button>
      {p.indisponible ? (
        <p className="atl-disc-historique-note" role="status">
          Historique indisponible.{" "}
          <button type="button" className="atl-bouton" data-variante="discret" onClick={p.onReessayer}>
            Réessayer
          </button>
        </p>
      ) : p.discussions.length === 0 ? (
        <p className="atl-disc-historique-note">Aucune discussion pour le moment.</p>
      ) : (
        <ul className="atl-disc-liste">
          {p.discussions.map((d) => (
            <li key={d.issueId} className="atl-disc-ligne">
              {aConfirmer === d.issueId ? (
                <div className="atl-disc-confirmation" role="group" aria-label={`Supprimer la discussion ${d.titre} ?`}>
                  <span>Supprimer ?</span>
                  <button
                    type="button"
                    className="atl-bouton"
                    onClick={() => {
                      setAConfirmer(null);
                      void p.onSupprimer(d.issueId);
                    }}
                  >
                    Oui
                  </button>
                  <button type="button" className="atl-bouton" data-variante="discret" onClick={() => setAConfirmer(null)}>
                    Annuler
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" className="atl-disc-item" aria-current={d.issueId === p.courante ? "true" : undefined} onClick={() => p.onChoisir(d.issueId)}>
                    <span className="atl-disc-item-titre">{d.titre}</span>
                    <time className="atl-disc-item-date" dateTime={d.majLe}>
                      {dateDiscussion(d.majLe)}
                    </time>
                  </button>
                  <button type="button" className="atl-disc-supprimer" aria-label={`Supprimer la discussion ${d.titre}`} title="Supprimer" onClick={() => setAConfirmer(d.issueId)}>
                    <IconeCorbeille />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
