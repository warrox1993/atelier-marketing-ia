/**
 * Toile de l'organigramme : les cartes HTML positionnées et les traits en SVG sur un plan unique, dans une vue qui se
 * zoome et se déplace. La disposition vient de organigramme-disposition.ts et n'est jamais recalculée à un geste : seule
 * la transformation CSS du plan change, appliquée directement sur l'élément (aucun rendu React pendant un glissement).
 *
 * Gestes : glisser pour se déplacer (souris ou doigt), Ctrl + molette ou pincement pour zoomer, boutons « + », « − » et
 * « Ajuster à l'écran » ; au clavier, flèches pour se déplacer, + et − pour zoomer, 0 pour ajuster.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent as ToucheClavier, type PointerEvent as EvenementPointeur } from "react";
import { nombre } from "./format.js";
import { LienHote } from "./composants.js";
import { familleStatut, libelleStatutAgent, type AgentHote } from "./organigramme-arbre.js";
import {
  cartesCorrespondantes, disposerOrganigramme, premiereCorrespondance, transformationAjustee, transformationCentree, transformationOuverture, zoomerAutour,
  type CarteDisposee, type Disposition, type ServiceADisposer, type Transformation,
} from "./organigramme-disposition.js";

export const LEGENDE_ORGANIGRAMME = "Chaque service est relié au Coordinateur général par les échanges entre services.";

const pluriel = (n: number, un: string, plusieurs: string) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;
/** Seuil en pixels avant qu'un appui devienne un glissement (un simple clic reste un clic). */
const SEUIL_GLISSEMENT = 4;
const PAS_CLAVIER = 80;
const FACTEUR_ZOOM = 1.25;

function Statut({ statut }: { statut: string }) {
  return (
    <span className="atl-org-statut" data-famille={familleStatut(statut)}>
      {libelleStatutAgent(statut)}
    </span>
  );
}

function LienAgent({ agent, prefixe }: { agent: AgentHote; prefixe: string }) {
  return (
    <LienHote vers={`/${prefixe}/agents/${encodeURIComponent(agent.id)}`} className="atl-org-agent-lien">
      {agent.name}
    </LienHote>
  );
}

interface PropsPlan {
  dispo: Disposition;
  prefixes: Readonly<Record<string, string>>;
  prefixeGeneral: string;
  trouvees: ReadonlySet<string>;
  filtreActif: boolean;
  selection: string | null;
  voisins: ReadonlySet<string>;
  selectionActive: boolean;
  choisir: (slug: string) => void;
  relire: (slug: string) => void;
}

function CarteGeneral({ k, prefixe }: { k: CarteDisposee; prefixe: string }) {
  return (
    <>
      <span className="atl-org-etiquette">Coordinateur général</span>
      {k.agent ? (
        <span className="atl-org-ligne">
          <LienAgent agent={k.agent} prefixe={prefixe} />
          <Statut statut={k.agent.status} />
        </span>
      ) : (
        <span className="atl-org-titre">{k.etat === "erreur" ? "Lecture impossible" : "Lecture en cours"}</span>
      )}
    </>
  );
}

function CarteService({ k, prefixe, selectionne, choisir, relire }: { k: CarteDisposee; prefixe: string; selectionne: boolean; choisir: () => void; relire: () => void }) {
  return (
    <>
      <span className="atl-org-nom" title={k.nom}>
        {k.nom}
      </span>
      {k.etat === "pret" ? (
        <>
          {k.coordinateur ? (
            <span className="atl-org-coord atl-org-ligne">
              <LienAgent agent={k.coordinateur} prefixe={prefixe} />
              <Statut statut={k.coordinateur.status} />
            </span>
          ) : null}
          <span className="atl-org-compteur">{pluriel(k.nbAgents, "agent", "agents")}</span>
        </>
      ) : k.etat === "erreur" ? (
        <span className="atl-org-erreur" role="alert">
          Lecture impossible
          <button type="button" className="atl-bouton" onClick={relire}>
            Réessayer
          </button>
        </span>
      ) : (
        <span className="atl-org-titre">Lecture en cours</span>
      )}
      <button type="button" className="atl-bouton atl-org-liens" aria-pressed={selectionne} onClick={choisir}>
        {selectionne ? "Masquer les liens" : "Voir les liens"}
      </button>
    </>
  );
}

/** Cartes et traits : mémorisé, donc non redessiné par un zoom ou un déplacement. */
const Plan = memo(function Plan({ dispo, prefixes, prefixeGeneral, trouvees, filtreActif, selection, voisins, selectionActive, choisir, relire }: PropsPlan) {
  const trace = useMemo(() => dispo.segments.map((g) => `M${g.x1} ${g.y1}L${g.x2} ${g.y2}`).join(""), [dispo]);
  return (
    <>
      <svg className="atl-org-traits" width={dispo.largeur} height={dispo.hauteur} viewBox={`0 0 ${dispo.largeur} ${dispo.hauteur}`} aria-hidden="true" focusable="false">
        <path d={trace} />
      </svg>
      {dispo.cadres.map((c) => (
        <div key={c.id} className="atl-org-cadre" data-cadre={c.id} aria-hidden="true" style={{ left: c.x, top: c.y, width: c.largeur, height: c.hauteur }} />
      ))}
      {dispo.cartes.map((k) => {
        const relie = k.genre === "service" && voisins.has(k.slug ?? "");
        const choisi = k.genre === "service" && selection === k.slug;
        const estompe = filtreActif ? !trouvees.has(k.id) : selectionActive && k.genre === "service" && !choisi && !relie;
        return (
          <div
            key={k.id}
            data-carte={k.id}
            className={`atl-org-carte atl-org-carte-${k.genre}${k.genre === "service" ? " atl-org-service" : ""}`}
            data-trouve={trouvees.has(k.id) || undefined}
            data-selection={choisi || undefined}
            data-relie={relie || undefined}
            data-estompe={estompe || undefined}
            style={{ left: k.x, top: k.y, width: k.largeur, height: k.hauteur }}
          >
            {k.genre === "general" ? (
              <CarteGeneral k={k} prefixe={prefixeGeneral} />
            ) : k.genre === "service" ? (
              <CarteService k={k} prefixe={prefixes[k.slug ?? ""] ?? ""} selectionne={choisi} choisir={() => choisir(k.slug ?? "")} relire={() => relire(k.slug ?? "")} />
            ) : (
              <>
                <span className="atl-org-ligne">
                  <LienAgent agent={k.agent!} prefixe={prefixes[k.slug ?? ""] ?? ""} />
                  <Statut statut={k.agent!.status} />
                </span>
                {k.agent!.title ? (
                  <span className="atl-org-titre" title={k.agent!.title}>
                    {k.agent!.title}
                  </span>
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </>
  );
});

export interface PropsToile {
  services: readonly ServiceADisposer[];
  prefixes: Readonly<Record<string, string>>;
  filtre: string;
  selection: string | null;
  voisins: ReadonlySet<string>;
  selectionActive: boolean;
  choisir: (slug: string) => void;
  relire: (slug: string) => void;
}

export function ToileOrganigramme({ services, prefixes, filtre, selection, voisins, selectionActive, choisir, relire }: PropsToile) {
  const dispo = useMemo(() => disposerOrganigramme(services), [services]);
  const filtreActif = filtre.trim() !== "";
  const trouvees = useMemo(() => cartesCorrespondantes(dispo, services, filtre), [dispo, services, filtre]);
  const premiere = useMemo(() => premiereCorrespondance(dispo, trouvees), [dispo, trouvees]);
  const direction = services.find((s) => s.estDirection);
  const prefixeGeneral = (direction && prefixes[direction.slug]) || "";

  const vue = useRef<HTMLDivElement>(null);
  const plan = useRef<HTMLDivElement>(null);
  const t = useRef<Transformation>({ echelle: 1, x: 0, y: 0 });
  const interagi = useRef(false);
  /** Dernier choix de l'utilisateur sans geste ensuite : « Ajuster à l'écran » garde le plan ajusté quand des services arrivent. */
  const ajusteVoulu = useRef(false);
  const geste = useRef<{ pointeurs: Map<number, { x: number; y: number }>; depart: { x: number; y: number; t: Transformation } | null; glisse: boolean; pincement: { distance: number; t: Transformation } | null }>({
    pointeurs: new Map(), depart: null, glisse: false, pincement: null,
  });
  const ignorerClic = useRef(false);

  const taille = useCallback(() => ({ l: vue.current?.clientWidth || 1000, h: vue.current?.clientHeight || 600 }), []);
  const appliquer = useCallback((n: Transformation) => {
    t.current = n;
    if (plan.current) plan.current.style.transform = `translate(${n.x}px, ${n.y}px) scale(${n.echelle})`;
  }, []);
  const ajuster = useCallback(() => {
    const { l, h } = taille();
    appliquer(transformationAjustee(dispo, l, h));
  }, [appliquer, dispo, taille]);
  // Ouverture : zoom lisible sur le général et la première rangée, pas « tout faire tenir ».
  const ouvrir = useCallback(() => {
    const { l, h } = taille();
    appliquer(transformationOuverture(dispo, l, h));
  }, [appliquer, dispo, taille]);
  const centrer = useCallback(
    (k: CarteDisposee) => {
      const { l, h } = taille();
      appliquer(transformationCentree(k, l, h, 0.8, t.current.echelle));
    },
    [appliquer, taille],
  );
  const zoomer = useCallback(
    (facteur: number, px?: number, py?: number) => {
      const { l, h } = taille();
      interagi.current = true;
      appliquer(zoomerAutour(t.current, facteur, px ?? l / 2, py ?? h / 2));
    },
    [appliquer, taille],
  );
  const ajusterOuCentrer = useCallback(() => {
    if (filtreActif && premiere) {
      interagi.current = true;
      centrer(premiere);
    } else {
      interagi.current = false;
      ajusteVoulu.current = true;
      ajuster();
    }
  }, [ajuster, centrer, filtreActif, premiere]);

  // Tant que l'utilisateur n'a rien touché, le plan reste à l'ouverture (lisible) quand les services arrivent.
  useLayoutEffect(() => {
    if (!interagi.current) (ajusteVoulu.current ? ajuster() : ouvrir());
  }, [ajuster, ouvrir]);
  // Une saisie dans le filtre centre la première correspondance.
  const idPremiere = premiere?.id ?? null;
  useEffect(() => {
    if (idPremiere && premiere) {
      interagi.current = true;
      centrer(premiere);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seul un changement de première correspondance déclenche le centrage
  }, [idPremiere]);

  // Ctrl + molette (et pincement du pavé tactile) : zoom autour du pointeur ; sans Ctrl, la page défile normalement.
  useEffect(() => {
    const el = vue.current;
    if (!el) return;
    const surMolette = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomer(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", surMolette, { passive: false });
    return () => el.removeEventListener("wheel", surMolette);
  }, [zoomer]);

  const g = geste.current;
  const relatif = (e: { clientX: number; clientY: number }) => {
    const r = vue.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const distance = () => {
    const [a, b] = [...g.pointeurs.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const surAppui = (e: EvenementPointeur<HTMLDivElement>) => {
    ignorerClic.current = false;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    g.pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointeurs.size === 1) g.depart = { x: e.clientX, y: e.clientY, t: t.current };
    else if (g.pointeurs.size === 2) {
      g.pincement = { distance: distance() || 1, t: t.current };
      g.depart = null;
      g.glisse = true;
    }
  };
  const surMouvement = (e: EvenementPointeur<HTMLDivElement>) => {
    if (!g.pointeurs.has(e.pointerId)) return;
    g.pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointeurs.size >= 2 && g.pincement) {
      const [a, b] = [...g.pointeurs.values()];
      const milieu = relatif({ clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 });
      interagi.current = true;
      appliquer(zoomerAutour(g.pincement.t, distance() / g.pincement.distance, milieu.x, milieu.y));
      return;
    }
    const d = g.depart;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!g.glisse && Math.hypot(dx, dy) < SEUIL_GLISSEMENT) return;
    if (!g.glisse) {
      g.glisse = true;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // Capture impossible (pointeur déjà relâché) : le glissement continue sans.
      }
      e.currentTarget.dataset["deplace"] = "true";
    }
    interagi.current = true;
    appliquer({ ...d.t, x: d.t.x + dx, y: d.t.y + dy });
  };
  const surRelache = (e: EvenementPointeur<HTMLDivElement>) => {
    if (!g.pointeurs.delete(e.pointerId)) return;
    if (g.pointeurs.size < 2) g.pincement = null;
    if (g.pointeurs.size === 0) {
      if (g.glisse) {
        // Le clic qui suit un glissement ne doit pas activer le lien ou le bouton sous le doigt.
        // Sans minuterie : le drapeau est consommé par ce clic, ou effacé au prochain appui (pas de course sous charge).
        ignorerClic.current = true;
      }
      g.glisse = false;
      g.depart = null;
      delete e.currentTarget.dataset["deplace"];
    } else if (g.pointeurs.size === 1) {
      const [reste] = [...g.pointeurs.values()];
      g.depart = reste ? { x: reste.x, y: reste.y, t: t.current } : null;
    }
  };
  const surClavier = (e: ToucheClavier<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.altKey || e.metaKey) return;
    const pas: Record<string, [number, number]> = { ArrowLeft: [PAS_CLAVIER, 0], ArrowRight: [-PAS_CLAVIER, 0], ArrowUp: [0, PAS_CLAVIER], ArrowDown: [0, -PAS_CLAVIER] };
    const p = pas[e.key];
    if (p) {
      e.preventDefault();
      interagi.current = true;
      appliquer({ ...t.current, x: t.current.x + p[0], y: t.current.y + p[1] });
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomer(FACTEUR_ZOOM);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomer(1 / FACTEUR_ZOOM);
    } else if (e.key === "0") {
      e.preventDefault();
      ajusterOuCentrer();
    }
  };
  // Un lien qui prend le focus hors de la vue ramène sa carte au centre (le navigateur ferait défiler le conteneur).
  const surFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const el = vue.current;
    if (!el) return;
    el.scrollLeft = 0;
    el.scrollTop = 0;
    const idCarte = (e.target as HTMLElement).closest<HTMLElement>("[data-carte]")?.dataset["carte"];
    const k = idCarte ? dispo.cartes.find((c) => c.id === idCarte) : undefined;
    if (!k) return;
    const { l, h } = taille();
    const x = k.x * t.current.echelle + t.current.x;
    const y = k.y * t.current.echelle + t.current.y;
    const dedans = x >= 0 && y >= 0 && x + k.largeur * t.current.echelle <= l && y + k.hauteur * t.current.echelle <= h;
    if (!dedans) {
      interagi.current = true;
      centrer(k);
    }
  };

  return (
    <div className="atl-org-toile">
      <div
        ref={vue}
        className="atl-org-vue"
        role="group"
        tabIndex={0}
        aria-label="Organigramme dessiné. Flèches pour déplacer, plus et moins pour zoomer, zéro pour ajuster à l'écran."
        onPointerDown={surAppui}
        onPointerMove={surMouvement}
        onPointerUp={surRelache}
        onPointerCancel={surRelache}
        onKeyDown={surClavier}
        onFocusCapture={surFocus}
        onClickCapture={(e) => {
          // Le relâché d'un glissement est toujours suivi d'un clic sur l'élément capturé : le drapeau est consommé ici.
          if (ignorerClic.current) {
            e.preventDefault();
            e.stopPropagation();
          }
          ignorerClic.current = false;
        }}
      >
        <div ref={plan} className="atl-org-plan" style={{ width: dispo.largeur, height: dispo.hauteur }}>
          <Plan
            dispo={dispo}
            prefixes={prefixes}
            prefixeGeneral={prefixeGeneral}
            trouvees={trouvees}
            filtreActif={filtreActif}
            selection={selection}
            voisins={voisins}
            selectionActive={selectionActive}
            choisir={choisir}
            relire={relire}
          />
        </div>
      </div>
      <div className="atl-org-zoom" role="group" aria-label="Zoom de l'organigramme">
        <button type="button" className="atl-bouton" aria-label="Zoom avant" onClick={() => zoomer(FACTEUR_ZOOM)}>
          +
        </button>
        <button type="button" className="atl-bouton" aria-label="Zoom arrière" onClick={() => zoomer(1 / FACTEUR_ZOOM)}>
          −
        </button>
        <button type="button" className="atl-bouton" aria-label="Ajuster à l'écran" onClick={ajusterOuCentrer}>
          Ajuster
        </button>
      </div>
    </div>
  );
}
