/**
 * Bande d'avancement épinglée sous l'en-tête du chat (au-dessus du fil, hors de la zone `role="log"`) : montre la
 * mission en cours la plus récente en six stations. « Voir les N missions » déplie le panneau complet (la frise 2D de
 * chaque mission, avec ses tâches).
 *
 * Rendu 3D (three.js, chargé à la demande) quand tout s'y prête ; sinon repli 2D : sans WebGL, avec
 * `prefers-reduced-motion: reduce`, sous 600 px de large, ou si le chargement échoue. La scène est `aria-hidden` ; les
 * étiquettes (nom, état) sont des boutons HTML, présents dans tous les modes : c'est la liste que lisent les lecteurs
 * d'écran. Un clic sur une station (étiquette ou scène) déplie ses tâches.
 */
import { useCallback, useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from "react";
import { annoncePhase, LIBELLES_ETAT, type AvancementMission, type IdPhase } from "../avancement-missions.js";
import { chargerScene as chargerSceneParDefaut, type ModuleScene } from "../frise3d/chargeur.js";
import { lireCouleurs } from "../frise3d/couleurs.js";
import { choisirRendu, webglDisponible, LARGEUR_MIN_3D } from "../frise3d/logique.js";
import type { SceneFrise } from "../frise3d/scene.js";
import { derniere, FrisesMissions, Marqueur, PanneauTaches } from "./frise-mission.js";

export interface PropsBandeauMissions {
  enCours: readonly AvancementMission[];
  terminees: readonly AvancementMission[];
  /** Chargeur du module de scène (remplacé dans les tests). */
  chargerScene?: () => Promise<ModuleScene>;
}

const REQUETE_MOUVEMENT = "(prefers-reduced-motion: reduce)";

function mouvementReduit(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REQUETE_MOUVEMENT).matches;
}

/** Largeur de la bande (observée), préférence de mouvement et sonde WebGL : les trois entrées du choix 3D ou 2D. */
function useConditions(bande: React.RefObject<HTMLElement | null>) {
  // Largeur inconnue tant que la bande n'est pas mesurée : on reste en 2D (jamais de chargement de la scène « pour rien » sur téléphone).
  const [largeur, setLargeur] = useState<number | null>(null);
  const [reduit, setReduit] = useState(mouvementReduit);
  useLayoutEffect(() => {
    const el = bande.current;
    if (!el) return;
    const lire = () => {
      const l = el.getBoundingClientRect().width;
      if (l > 0) setLargeur(Math.round(l));
    };
    lire();
    const obs = typeof ResizeObserver !== "undefined" ? new ResizeObserver(lire) : null;
    obs?.observe(el);
    return () => obs?.disconnect();
  }, [bande]);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(REQUETE_MOUVEMENT);
    const surChangement = () => setReduit(mq.matches);
    mq.addEventListener?.("change", surChangement);
    return () => mq.removeEventListener?.("change", surChangement);
  }, []);
  return { largeur, reduit };
}

export function BandeauMissions({ enCours, terminees, chargerScene = chargerSceneParDefaut }: PropsBandeauMissions) {
  const base = useId();
  const bande = useRef<HTMLElement | null>(null);
  const hote = useRef<HTMLDivElement | null>(null);
  const scene = useRef<SceneFrise | null>(null);
  const [echec, setEchec] = useState(false);
  const [depliee, setDepliee] = useState(false);
  const [ouverte, setOuverte] = useState<IdPhase | null>(null);
  const { largeur, reduit } = useConditions(bande);

  const mission = enCours[0] ?? null;
  const total = enCours.length + terminees.length;
  const mode = choisirRendu({ webgl: webglDisponible(), mouvementReduit: reduit, largeur: largeur ?? 0, echec });
  const etroit = largeur !== null && largeur < LARGEUR_MIN_3D;
  const phasesScene = useMemo(() => (mission ? mission.phases.map((p) => ({ id: p.id, etat: p.etat })) : []), [mission]);
  const cle = phasesScene.map((p) => `${p.id}:${p.etat}`).join("|");
  const phasesRef = useRef(phasesScene);
  phasesRef.current = phasesScene;
  const present = mission !== null;

  // Création et nettoyage complet de la scène : seulement en mode 3D, et jamais deux fois.
  useEffect(() => {
    if (mode !== "3d" || !present) return;
    let annule = false;
    let creee: SceneFrise | null = null;
    chargerScene()
      .then((module) => {
        const conteneur = hote.current;
        if (annule || !conteneur) return;
        creee = module.creerScene({
          conteneur,
          phases: phasesRef.current,
          couleurs: lireCouleurs(bande.current ?? conteneur),
          surPerte: () => setEchec(true),
        });
        scene.current = creee;
      })
      .catch(() => {
        if (!annule) setEchec(true);
      });
    // Le thème (clair ou sombre) change hors de React : on recolore la scène quand l'hôte bascule.
    const recolorer = () => {
      if (scene.current && bande.current) scene.current.recolorer(lireCouleurs(bande.current));
    };
    const racine = typeof document !== "undefined" ? document.documentElement : null;
    const obs = racine && typeof MutationObserver !== "undefined" ? new MutationObserver(recolorer) : null;
    obs?.observe(racine!, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    const mq = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    mq?.addEventListener?.("change", recolorer);
    return () => {
      annule = true;
      obs?.disconnect();
      mq?.removeEventListener?.("change", recolorer);
      creee?.detruire();
      scene.current = null;
    };
  }, [mode, present, chargerScene]);

  // Nouvel état des phases : la scène s'anime brièvement puis s'arrête.
  useEffect(() => {
    scene.current?.mettre(phasesRef.current);
  }, [cle]);

  const surScene = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!mission) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width <= 0) return;
      const i = Math.min(mission.phases.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * mission.phases.length)));
      const p = mission.phases[i];
      if (p && p.taches.length > 0) setOuverte((o) => (o === p.id ? null : p.id));
    },
    [mission],
  );

  if (total === 0) return null;

  const courante = mission ? (mission.phases.find((p) => p.etat === "attend_decision") ?? mission.phases.find((p) => p.etat === "en_cours")) : undefined;
  const resume = !mission
    ? "Aucune mission en cours"
    : courante
      ? courante.etat === "attend_decision"
        ? `${courante.libelle} : vous devez décider`
        : `En cours : ${courante.libelle}`
      : "Mission en préparation";
  const phaseOuverte = mission?.phases.find((p) => p.id === ouverte && p.taches.length > 0);
  const libelleVoir = total === 1 ? "Voir le détail" : `Voir les ${total} missions`;

  return (
    <div className="atl-bande-zone" data-testid="bandeau-missions">
      <section
        ref={bande}
        className="atl-bande"
        data-mode={mode}
        data-etroit={etroit ? "oui" : "non"}
        aria-label={mission ? `Avancement de la mission ${mission.racine.identifier ?? ""} du service ${mission.nom}`.replace(/\s+/g, " ") : "Avancement des missions"}
      >
        <div className="atl-bande-haut">
          <p className="atl-bande-titre" title={mission?.racine.title}>
            {mission ? <span className="atl-bande-service">{mission.nom}</span> : null}
            {mission ? <span className="atl-bande-mission">{mission.racine.title}</span> : null}
            <span className="atl-bande-resume" data-attend={courante?.etat === "attend_decision" ? "oui" : "non"}>
              {resume}
            </span>
          </p>
          <button type="button" className="atl-bande-voir" aria-expanded={depliee} aria-controls={depliee ? `${base}-panneau` : undefined} onClick={() => setDepliee((d) => !d)}>
            {depliee ? "Replier" : libelleVoir}
          </button>
        </div>
        {mission ? (
          <>
            {mode === "3d" ? <div ref={hote} className="atl-bande-scene" aria-hidden="true" data-testid="bande-scene" onClick={surScene} /> : null}
            <ol className="atl-bande-pas" role="list">
              {mission.phases.map((p) => {
                const quand = derniere(p);
                const n = p.taches.length;
                const corps = (
                  <>
                    <Marqueur etat={p.etat} />
                    <span className="atl-bande-texte">
                      <span className="atl-bande-nom">{p.libelle}</span>
                      <span className="atl-bande-etat">{LIBELLES_ETAT[p.etat]}</span>
                    </span>
                  </>
                );
                return (
                  <li key={p.id} className="atl-bande-phase" data-etat={p.etat} data-phase={p.id} aria-current={p === courante ? "step" : undefined}>
                    {n > 0 ? (
                      <button
                        type="button"
                        className="atl-bande-bouton"
                        aria-expanded={ouverte === p.id}
                        aria-controls={`${base}-${p.id}`}
                        aria-label={`${annoncePhase(p)}${quand ? `, dernière activité ${quand}` : ""}`}
                        onClick={() => setOuverte((o) => (o === p.id ? null : p.id))}
                      >
                        {corps}
                      </button>
                    ) : (
                      <div className="atl-bande-bouton" role="group" aria-label={annoncePhase(p)}>
                        {corps}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {phaseOuverte ? (
              <div className="atl-bande-taches">
                <PanneauTaches phase={phaseOuverte} id={`${base}-${phaseOuverte.id}`} />
              </div>
            ) : null}
          </>
        ) : null}
      </section>
      {depliee ? (
        <div id={`${base}-panneau`} className="atl-bande-panneau">
          <FrisesMissions enCours={enCours} terminees={terminees} />
        </div>
      ) : null}
    </div>
  );
}
