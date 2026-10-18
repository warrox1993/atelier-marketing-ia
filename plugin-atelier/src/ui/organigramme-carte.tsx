/**
 * Carte des services de l'organigramme : le Coordinateur général au centre, un nœud par service sur un anneau
 * elliptique adapté à la zone (un second anneau intérieur au-delà de 32 services ou dans une zone étroite), aucun agent
 * dessiné. Disposition, courbes et rayons viennent de organigramme-flux.ts, zoom et déplacement de organigramme-vue.ts.
 *
 * - La carte occupe tout l'écran disponible, du haut réel de la zone au bas de la fenêtre, sans défilement : c'est la
 *   toile qui se déplace (glisser, pincement, flèches) et se zoome (molette, boutons, + et -, 0 pour tout voir).
 * - Au repos : l'ellipse en trait très fin. Survol, focus ou clic sur le Coordinateur général : ses rayons vers chaque
 *   service. Le réseau générique des coordinateurs n'est jamais tracé (une mention fixe le rappelle).
 * - Survol ou focus d'un nœud : aperçu de ses liaisons métier en traits légers.
 * - Clic ou Entrée : sélection persistante, flèches vers chaque partenaire (sortant : trait plein, teinte info ; entrant :
 *   pointillé, teinte attention ; aller et retour décalés ; épaisseur selon le volume), partenaires en pleine intensité,
 *   autres nœuds atténués, tiroir des liaisons posé par-dessus la carte à droite, vue décalée pour que le service et ses
 *   partenaires restent visibles hors du tiroir. Double-clic ou bouton : ouvrir le service. Échap ou Fermer : désélectionner.
 * - Téléphone (640 px et moins) : liste des services, chacun avec un bouton « Voir les liens » qui déplie ses partenaires.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ToucheClavier, type PointerEvent as EvenementPointeur } from "react";
import { nombre } from "./format.js";
import {
  courbeLiaison, dispositionAnneau, fluxMetier, ID_GENERAL, liaisonsDe, objetsDuFlux, ordonnerServices, rayonsGeneral, volumeDuFlux,
  type Dimensions, type FluxBrut, type LiaisonPartenaire, type NoeudAnneau, type RectReserve, type ServiceCarte,
} from "./organigramme-flux.js";
import { boiteDes, limiter, transformationAjustee, transformationPourVoir, zoomerAutour, type Transformation } from "./organigramme-vue.js";
import { useTelephone } from "./telephone.js";

/** Service tel que la carte l'affiche : nom, direction, nombre d'agents (null tant qu'on ne l'a pas lu) et validations en attente. */
export interface ServiceAffiche extends ServiceCarte {
  agents: number | null;
  aValider: number;
  etat: "chargement" | "pret" | "erreur";
}

export interface PropsCarteServices {
  services: ServiceAffiche[];
  flux: FluxBrut[];
  selection: string | null;
  choisir: (slug: string | null) => void;
  ouvrirService: (slug: string) => void;
}

export const MENTION_COORDINATEURS = "Tous les coordinateurs peuvent aussi se parler entre eux et avec le Coordinateur général.";

/** Taille supposée de la zone quand on ne peut pas la mesurer (rendu sans mise en page). */
const TAILLE_REPLI: Dimensions = { largeur: 1100, hauteur: 640 };
const DECALAGE_ALLER_RETOUR = 14;
const pluriel = (n: number, un: string, plusieurs: string) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;

/** Texte « N agents » d'un service, selon l'état de sa lecture. */
export function texteAgents(s: Pick<ServiceAffiche, "agents" | "etat">): string {
  if (s.etat === "erreur") return "Agents indisponibles";
  if (s.agents === null) return "Chargement";
  return pluriel(s.agents, "agent", "agents");
}

// ---------------------------------------------------------------------------------------------------------------
// Liste des partenaires d'un service (panneau latéral et téléphone)
// ---------------------------------------------------------------------------------------------------------------

function lignesObjets(flux: readonly FluxBrut[]): string {
  return flux.flatMap((f) => objetsDuFlux(f)).join(" ; ");
}

export function ListePartenaires({ liaisons, nomDe, choisir }: { liaisons: Array<LiaisonPartenaire>; nomDe: (slug: string) => string; choisir: (slug: string) => void }) {
  if (liaisons.length === 0) return <p className="atl-car-vide">Ce service n'a aucune liaison métier avec un autre service.</p>;
  return (
    <ul className="atl-car-partenaires">
      {liaisons.map((l) => (
        <li key={l.partenaire} className="atl-car-partenaire">
          <button type="button" className="atl-car-nom-partenaire" onClick={() => choisir(l.partenaire)}>
            {nomDe(l.partenaire)}
          </button>
          {l.sortants.length > 0 ? (
            <p className="atl-car-sens" data-sens="sortant">
              <span className="atl-car-echantillon" aria-hidden="true" />
              <span className="atl-car-sens-texte">
                <strong>Vers</strong> {lignesObjets(l.sortants)}
                {l.sortants.some((f) => f.approbationHumaine) ? <span className="atl-car-approbation">approbation humaine</span> : null}
              </span>
            </p>
          ) : null}
          {l.entrants.length > 0 ? (
            <p className="atl-car-sens" data-sens="entrant">
              <span className="atl-car-echantillon" aria-hidden="true" />
              <span className="atl-car-sens-texte">
                <strong>Depuis</strong> {lignesObjets(l.entrants)}
                {l.entrants.some((f) => f.approbationHumaine) ? <span className="atl-car-approbation">approbation humaine</span> : null}
              </span>
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Traits
// ---------------------------------------------------------------------------------------------------------------

interface Fleche {
  cle: string;
  sens: "sortant" | "entrant";
  chemin: string;
  tete: { x: number; y: number; angle: number };
  epaisseur: number;
}

const epaisseurSelonVolume = (volume: number) => 1.5 + Math.min(3, (Math.max(1, volume) - 1) * 0.75);

function fleches(selection: string, liaisons: readonly LiaisonPartenaire[], parId: ReadonlyMap<string, NoeudAnneau>, noeuds: readonly NoeudAnneau[]): Fleche[] {
  const a = parId.get(selection);
  if (!a) return [];
  const sortie: Fleche[] = [];
  for (const l of liaisons) {
    const b = parId.get(l.partenaire);
    if (!b) continue;
    const aller = l.sortants.length > 0;
    const retour = l.entrants.length > 0;
    const decalage = aller && retour ? DECALAGE_ALLER_RETOUR : 0;
    if (aller) {
      const c = courbeLiaison(a, b, noeuds, decalage);
      sortie.push({ cle: `${selection}>${l.partenaire}`, sens: "sortant", chemin: c.chemin, tete: c.fleche, epaisseur: epaisseurSelonVolume(l.sortants.reduce((n, f) => n + volumeDuFlux(f), 0)) });
    }
    if (retour) {
      const c = courbeLiaison(b, a, noeuds, decalage);
      sortie.push({ cle: `${l.partenaire}>${selection}`, sens: "entrant", chemin: c.chemin, tete: c.fleche, epaisseur: epaisseurSelonVolume(l.entrants.reduce((n, f) => n + volumeDuFlux(f), 0)) });
    }
  }
  return sortie;
}

/** Tête de flèche : triangle plein de 12 px posé sur la pointe, orienté selon l'angle de la courbe. */
function Tete({ x, y, angle, sens }: { x: number; y: number; angle: number; sens: "sortant" | "entrant" }) {
  return <path className="atl-car-tete" data-sens={sens} d="M0 0 L-12 -6 L-12 6 Z" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((angle * 180) / Math.PI).toFixed(1)})`} />;
}

// ---------------------------------------------------------------------------------------------------------------
// Carte (bureau)
// ---------------------------------------------------------------------------------------------------------------

/** Marge laissée sous la carte, au bas de la fenêtre. */
const MARGE_BAS = 16;
const HAUTEUR_MIN_ZONE = 320;
const PAS_CLAVIER = 80;
const FACTEUR_ZOOM = 1.25;
/** Seuil en pixels avant qu'un appui devienne un glissement (un simple clic reste un clic). */
const SEUIL_GLISSEMENT = 4;
/** Largeur du tiroir des liaisons : 22 rem (352 px), jamais plus de 40 % de la carte. */
const LARGEUR_TIROIR = 352;
const ECART_TIROIR = 12;

/** Retrait des surimpressions par rapport au bord de la zone (0,75 rem) et marge de sécurité autour d'elles, en px. */
const RETRAIT_SURIMPRESSION = 12;
const MARGE_SURIMPRESSION = 8;

/** Plus proche ancêtre qui défile (la colonne de l'hôte) : c'est son bas qui borne la carte. */
function ancetreDefilant(el: HTMLElement): HTMLElement | null {
  for (let a = el.parentElement; a; a = a.parentElement) {
    const o = getComputedStyle(a).overflowY;
    if (o === "auto" || o === "scroll") return a;
  }
  return null;
}

/** Rectangles occupés au repos par la légende (en haut à gauche), les commandes (en haut à droite) et l'aide (en bas à gauche). */
function mesurerReserves(zone: HTMLElement): RectReserve[] {
  const l = zone.clientWidth;
  const h = zone.clientHeight;
  const r = RETRAIT_SURIMPRESSION;
  const m = MARGE_SURIMPRESSION;
  const arrondi = (v: number) => Math.ceil(v / 8) * 8;
  const taille = (s: string) => {
    const e = zone.querySelector<HTMLElement>(s);
    return e ? { w: e.offsetWidth, h: e.offsetHeight } : { w: 0, h: 0 };
  };
  const legende = taille(".atl-car-legende");
  const commandes = taille(".atl-car-commandes");
  const note = taille(".atl-car-note");
  return [
    legende.w > 0 ? { x0: 0, y0: 0, x1: arrondi(r + legende.w + m), y1: arrondi(r + legende.h + m) } : null,
    commandes.w > 0 ? { x0: l - arrondi(r + commandes.w + m), y0: 0, x1: l, y1: arrondi(r + commandes.h + m) } : null,
    note.w > 0 ? { x0: 0, y0: h - arrondi(r + note.h + m), x1: arrondi(r + note.w + m), y1: h } : null,
  ].filter((q): q is RectReserve => q !== null);
}

/**
 * Zone de la carte : sa hauteur va de son haut réel jusqu'au bas de la colonne qui défile dans l'hôte (ou de la fenêtre),
 * mesurée, remesurée au redimensionnement et quand la page au-dessus change de hauteur ; sa largeur est celle de la
 * colonne. `reelle` sert aux gestes ; `pourDisposition` est arrondie à 8 px près pour qu'un changement infime ne redispose
 * pas toute la carte ; `reserves` sont les places des surimpressions, où la disposition ne met aucun nœud.
 */
function useZoneCarte(ref: React.RefObject<HTMLElement | null>): { reelle: Dimensions; pourDisposition: Dimensions; reserves: RectReserve[] } {
  const [reelle, setReelle] = useState<Dimensions>(TAILLE_REPLI);
  const [reserves, setReserves] = useState<RectReserve[]>([]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const lire = () => {
      const haut = el.getBoundingClientRect().top;
      // Bas utile : bas de la colonne qui défile moins son retrait intérieur (la marge basse de l'hôte), sinon de la fenêtre moins 1 rem.
      const colonne = ancetreDefilant(el);
      const bas = colonne ? colonne.getBoundingClientRect().bottom - parseFloat(getComputedStyle(colonne).paddingBottom || "0") : (window.innerHeight || 800) - MARGE_BAS;
      // La hauteur de la zone est posée par le style ; clientHeight y retire les deux bordures.
      const hauteur = Math.max(HAUTEUR_MIN_ZONE, Math.floor(bas - haut)) - 2;
      const largeur = el.clientWidth > 0 ? el.clientWidth : TAILLE_REPLI.largeur;
      setReelle((p) => (p.largeur === largeur && p.hauteur === hauteur ? p : { largeur, hauteur }));
      const mesurees = mesurerReserves(el);
      setReserves((p) => (JSON.stringify(p) === JSON.stringify(mesurees) ? p : mesurees));
    };
    lire();
    window.addEventListener("resize", lire);
    if (typeof ResizeObserver === "undefined") return () => window.removeEventListener("resize", lire);
    // La page au-dessus (en-tête, message d'erreur) peut changer de hauteur : on observe la section entière.
    const observateur = new ResizeObserver(lire);
    observateur.observe(el);
    const section = el.closest(".atl-org");
    if (section) observateur.observe(section);
    return () => {
      window.removeEventListener("resize", lire);
      observateur.disconnect();
    };
  }, [ref]);
  const pourDisposition = useMemo<Dimensions>(() => ({ largeur: Math.floor(reelle.largeur / 8) * 8, hauteur: Math.floor(reelle.hauteur / 8) * 8 }), [reelle]);
  return { reelle, pourDisposition, reserves };
}

function Legende() {
  return (
    <div className="atl-car-legende" role="group" aria-label="Légende des traits">
      <p>
        <span className="atl-car-trait" data-sens="sortant" aria-hidden="true" />
        Plein : demandes envoyées
      </p>
      <p>
        <span className="atl-car-trait" data-sens="entrant" aria-hidden="true" />
        Pointillé : demandes reçues
      </p>
      <p>
        <span className="atl-car-approbation">approbation humaine</span> exigée
      </p>
    </div>
  );
}

function IconeAjuster() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PanneauLiaisons({ service, liaisons, nomDe, choisir, ouvrirService, fermer }: { service: ServiceAffiche; liaisons: LiaisonPartenaire[]; nomDe: (slug: string) => string; choisir: (slug: string) => void; ouvrirService: (slug: string) => void; fermer: () => void }) {
  return (
    <>
      <div className="atl-car-panneau-tete">
        <h2 id="atl-car-panneau-titre">{service.nom}</h2>
        <button type="button" className="atl-bouton" onClick={fermer}>
          Fermer
        </button>
      </div>
      <p className="atl-car-panneau-resume">
        {texteAgents(service)}
        {service.aValider > 0 ? ` · ${pluriel(service.aValider, "validation", "validations")} à traiter` : ""}
        {` · ${pluriel(liaisons.length, "service relié", "services reliés")}`}
      </p>
      <button type="button" className="atl-bouton atl-car-ouvrir" onClick={() => ouvrirService(service.slug)}>
        Ouvrir le service
      </button>
      <ListePartenaires liaisons={liaisons} nomDe={nomDe} choisir={choisir} />
      <p className="atl-car-mention">{MENTION_COORDINATEURS}</p>
    </>
  );
}

function CarteBureau({ services, flux, selection, choisir, ouvrirService }: PropsCarteServices) {
  const zone = useRef<HTMLDivElement | null>(null);
  const vue = useRef<HTMLDivElement | null>(null);
  const plan = useRef<HTMLDivElement | null>(null);
  const tiroir = useRef<HTMLElement | null>(null);
  const lecture = useRef<HTMLSpanElement | null>(null);
  const { reelle, pourDisposition, reserves } = useZoneCarte(zone);
  const [survol, setSurvol] = useState<string | null>(null);
  const [survolGeneral, setSurvolGeneral] = useState(false);
  const [rayonsEpingles, setRayonsEpingles] = useState(false);
  const metier = useMemo(() => fluxMetier(flux), [flux]);
  const cleServices = services.map((s) => `${s.slug}|${s.estDirection ? 1 : 0}`).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ordonnes = useMemo(() => ordonnerServices(services), [cleServices]);
  const disposition = useMemo(() => dispositionAnneau(ordonnes, pourDisposition, { reserves }), [ordonnes, pourDisposition, reserves]);
  const scene = useMemo<Dimensions>(() => ({ largeur: disposition.largeur, hauteur: disposition.hauteur }), [disposition]);
  const parId = useMemo(() => new Map(disposition.noeuds.map((n) => [n.id, n])), [disposition]);
  const parSlug = useMemo(() => new Map(services.map((s) => [s.slug, s])), [services]);
  const nomDe = (slug: string) => parSlug.get(slug)?.nom ?? slug;
  const choisi = selection ? parSlug.get(selection) ?? null : null;
  const liaisons = useMemo(() => (choisi ? liaisonsDe(choisi.slug, metier) : []), [choisi, metier]);
  const partenaires = useMemo(() => new Set(liaisons.map((l) => l.partenaire)), [liaisons]);
  const flechesChoisies = useMemo(() => (choisi ? fleches(choisi.slug, liaisons, parId, disposition.noeuds) : []), [choisi, liaisons, parId, disposition]);
  const apercu = useMemo(() => {
    if (choisi || !survol) return [];
    const a = parId.get(survol);
    if (!a) return [];
    return liaisonsDe(survol, metier).flatMap((l) => {
      const b = parId.get(l.partenaire);
      return b ? [{ cle: `${survol}~${l.partenaire}`, chemin: courbeLiaison(a, b, disposition.noeuds, 0).chemin }] : [];
    });
  }, [choisi, survol, parId, metier, disposition]);
  const general = parId.get(ID_GENERAL);
  const rayonsVisibles = survolGeneral || rayonsEpingles;
  const rayons = useMemo(() => (rayonsVisibles ? rayonsGeneral(disposition.noeuds) : []), [rayonsVisibles, disposition]);
  const compact = disposition.compact;

  // --- Vue : transformation CSS appliquée directement sur le plan (aucun rendu React pendant un geste) -------------
  const t = useRef<Transformation>({ echelle: 1, x: 0, y: 0 });
  const interagi = useRef(false);
  const ignorerClic = useRef(false);
  const geste = useRef<{ pointeurs: Map<number, { x: number; y: number }>; depart: { x: number; y: number; t: Transformation } | null; glisse: boolean; pincement: { distance: number; t: Transformation } | null }>({
    pointeurs: new Map(), depart: null, glisse: false, pincement: null,
  });
  const reduire = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const appliquer = useCallback((n: Transformation, anime = false) => {
    t.current = n;
    const el = plan.current;
    if (!el) return;
    el.style.transition = anime && !reduire() ? "transform 260ms cubic-bezier(0.16, 1, 0.3, 1)" : "none";
    el.style.transform = `translate(${n.x}px, ${n.y}px) scale(${n.echelle})`;
    if (lecture.current) lecture.current.textContent = `${Math.round(n.echelle * 100)} %`;
  }, []);
  /** Place prise par le tiroir (px), 0 quand aucun service n'est choisi. */
  const choisiPresent = useRef(false);
  choisiPresent.current = choisi !== null;
  const reserve = useCallback(() => (choisiPresent.current ? (tiroir.current?.offsetWidth || Math.min(LARGEUR_TIROIR, 0.4 * reelle.largeur)) + ECART_TIROIR : 0), [reelle.largeur]);
  const ajuster = useCallback((anime = false) => appliquer(transformationAjustee(scene, reelle, reserve()), anime), [appliquer, scene, reelle, reserve]);
  const zoomer = useCallback(
    (facteur: number, px?: number, py?: number, anime = false) => {
      interagi.current = true;
      const r = reserve();
      appliquer(limiter(zoomerAutour(t.current, facteur, px ?? (reelle.largeur - r) / 2, py ?? reelle.hauteur / 2), scene, reelle), anime);
    },
    [appliquer, reelle, reserve, scene],
  );

  // Tant que l'utilisateur n'a rien touché, la carte reste ajustée à l'écran (ouverture, redimensionnement, services lus).
  useLayoutEffect(() => {
    if (!interagi.current) ajuster();
  }, [ajuster]);
  // Choix d'un service : le tiroir s'ouvre, la vue se décale pour que le service et ses partenaires restent visibles hors
  // du tiroir. Fermeture : retour à l'ajustement si l'utilisateur n'a pas pris la main.
  const slugChoisi = choisi?.slug ?? null;
  const cleLiaisons = liaisons.map((l) => l.partenaire).join(",");
  useLayoutEffect(() => {
    if (!slugChoisi) {
      if (!interagi.current) ajuster(true);
      return;
    }
    const boite = boiteDes([slugChoisi, ...(cleLiaisons ? cleLiaisons.split(",") : [])].flatMap((id) => parId.get(id) ?? []));
    if (!boite) return;
    const place = reserve();
    let n = transformationPourVoir(t.current, boite, reelle, place);
    // Si le service et ses partenaires occupent presque tout l'anneau, autant montrer l'anneau entier (aucun nœud coupé).
    const entiere = transformationAjustee(scene, reelle, place);
    if (n.echelle < entiere.echelle * 1.12) n = entiere;
    appliquer(limiter(n, scene, reelle), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seul un changement de service choisi ou de partenaires déplace la vue
  }, [slugChoisi, cleLiaisons, parId]);

  // Molette : zoom autour du pointeur (écouteur non passif pour retenir le défilement de la page).
  useEffect(() => {
    const el = vue.current;
    if (!el) return;
    const surMolette = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomer(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", surMolette, { passive: false });
    return () => el.removeEventListener("wheel", surMolette);
  }, [zoomer]);

  // Échap : désélection, d'où qu'on soit dans la page (sauf dans un champ de saisie, qui gère sa propre touche).
  useEffect(() => {
    if (!choisi) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA")) return;
      choisir(null);
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [choisi, choisir]);

  // --- Gestes : glisser, pincement, clavier, focus ----------------------------------------------------------------
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
      appliquer(limiter(zoomerAutour(g.pincement.t, distance() / g.pincement.distance, milieu.x, milieu.y), scene, reelle));
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
    appliquer(limiter({ ...d.t, x: d.t.x + dx, y: d.t.y + dy }, scene, reelle));
  };
  const surRelache = (e: EvenementPointeur<HTMLDivElement>) => {
    if (!g.pointeurs.delete(e.pointerId)) return;
    if (g.pointeurs.size < 2) g.pincement = null;
    if (g.pointeurs.size === 0) {
      // Le clic qui suit un glissement ne doit pas activer le nœud sous le doigt. Sans minuterie : le drapeau est
      // consommé par ce clic, ou effacé au prochain appui (aucune course sous charge).
      if (g.glisse) ignorerClic.current = true;
      g.glisse = false;
      g.depart = null;
      delete e.currentTarget.dataset["deplace"];
    } else if (g.pointeurs.size === 1) {
      const [reste] = [...g.pointeurs.values()];
      g.depart = reste ? { x: reste.x, y: reste.y, t: t.current } : null;
    }
  };
  const surClavier = (e: ToucheClavier<HTMLDivElement>) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const cible = e.target as HTMLElement;
    if (cible !== e.currentTarget && !cible.classList.contains("atl-car-noeud") && !cible.classList.contains("atl-car-general")) return;
    const pas: Record<string, [number, number]> = { ArrowLeft: [PAS_CLAVIER, 0], ArrowRight: [-PAS_CLAVIER, 0], ArrowUp: [0, PAS_CLAVIER], ArrowDown: [0, -PAS_CLAVIER] };
    const p = pas[e.key];
    if (p) {
      e.preventDefault();
      interagi.current = true;
      appliquer(limiter({ ...t.current, x: t.current.x + p[0], y: t.current.y + p[1] }, scene, reelle), true);
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomer(FACTEUR_ZOOM, undefined, undefined, true);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomer(1 / FACTEUR_ZOOM, undefined, undefined, true);
    } else if (e.key === "0") {
      e.preventDefault();
      interagi.current = false;
      ajuster(true);
    }
  };
  // Un nœud qui prend le focus hors de la vue (Tab) est ramené dans la zone visible ; le navigateur, lui, ferait défiler
  // le conteneur, d'où la remise à zéro.
  const surFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const el = zone.current;
    if (el) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
    const slug = (e.target as HTMLElement).closest<HTMLElement>("[data-service]")?.dataset["service"];
    const n = slug ? parId.get(slug) : undefined;
    const boite = n ? boiteDes([n]) : null;
    if (!boite) return;
    const avant = t.current;
    const apres = limiter(transformationPourVoir(avant, boite, reelle, reserve(), 16), scene, reelle);
    if (apres.x !== avant.x || apres.y !== avant.y || apres.echelle !== avant.echelle) {
      interagi.current = true;
      appliquer(apres, true);
    }
  };

  const visibles = disposition.noeuds.filter((n) => n.genre === "service");
  return (
    <div className="atl-car">
      <div className="atl-car-zone" ref={zone} style={{ height: reelle.hauteur + 2 }} data-tiroir={choisi ? "ouvert" : undefined} data-compact={compact || undefined}>
        <div
          ref={vue}
          className="atl-car-vue"
          role="group"
          tabIndex={0}
          aria-label="Carte des services. Molette ou boutons pour zoomer, glisser ou flèches pour déplacer, zéro pour tout voir."
          onPointerDown={surAppui}
          onPointerMove={surMouvement}
          onPointerUp={surRelache}
          onPointerCancel={surRelache}
          onKeyDown={surClavier}
          onFocusCapture={surFocus}
          onClickCapture={(e) => {
            // Le relâché d'un glissement est toujours suivi d'un clic : le drapeau est consommé ici.
            if (ignorerClic.current) {
              e.preventDefault();
              e.stopPropagation();
            }
            ignorerClic.current = false;
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget || e.target === plan.current) choisir(null);
          }}
        >
          <div className="atl-car-plan" ref={plan} style={{ width: scene.largeur, height: scene.hauteur }}>
            <svg className="atl-car-traits" width={scene.largeur} height={scene.hauteur} aria-hidden="true" focusable="false">
              {disposition.anneaux.map((a, i) => (
                <ellipse key={i} className="atl-car-anneau" cx={disposition.centre.x} cy={disposition.centre.y} rx={a.rx} ry={a.ry} />
              ))}
              {rayons.map((r) => (
                <path key={r.id} className="atl-car-hierarchie" d={r.chemin} />
              ))}
              {apercu.map((p) => (
                <path key={p.cle} className="atl-car-apercu" d={p.chemin} />
              ))}
              {flechesChoisies.map((f) => (
                <g key={f.cle} className="atl-car-fleche" data-sens={f.sens}>
                  <path className="atl-car-courbe" d={f.chemin} data-sens={f.sens} style={{ strokeWidth: f.epaisseur }} />
                  <Tete x={f.tete.x} y={f.tete.y} angle={f.tete.angle} sens={f.sens} />
                </g>
              ))}
            </svg>
            {general ? (
              <button
                type="button"
                className="atl-car-general"
                style={{ left: general.x - general.largeur / 2, top: general.y - general.hauteur / 2, width: general.largeur, height: general.hauteur }}
                aria-pressed={rayonsEpingles}
                title="Afficher ou masquer les rattachements de tous les services"
                onClick={() => setRayonsEpingles((v) => !v)}
                onMouseEnter={() => setSurvolGeneral(true)}
                onMouseLeave={() => setSurvolGeneral(false)}
                onFocus={() => setSurvolGeneral(true)}
                onBlur={() => setSurvolGeneral(false)}
              >
                <strong>Coordinateur général</strong>
                <span>{pluriel(services.length, "service", "services")}</span>
              </button>
            ) : null}
            {general && !choisi ? (
              <p className="atl-car-mention-centre" style={{ left: general.x - 150, top: general.y + general.hauteur / 2 + 14, width: 300 }}>
                {MENTION_COORDINATEURS}
              </p>
            ) : null}
            {visibles.map((n) => {
              const s = parSlug.get(n.id);
              if (!s) return null;
              const estChoisi = choisi?.slug === s.slug;
              const estPartenaire = choisi !== null && partenaires.has(s.slug);
              return (
                <button
                  key={s.slug}
                  type="button"
                  className="atl-car-noeud"
                  style={{ left: n.x - n.largeur / 2, top: n.y - n.hauteur / 2, width: n.largeur, height: n.hauteur }}
                  data-service={s.slug}
                  data-selection={estChoisi || undefined}
                  data-relie={estPartenaire || undefined}
                  data-estompe={(choisi !== null && !estChoisi && !estPartenaire) || undefined}
                  aria-pressed={estChoisi}
                  title={`${s.nom} : ${texteAgents(s)}`}
                  onClick={() => choisir(estChoisi ? null : s.slug)}
                  onDoubleClick={() => ouvrirService(s.slug)}
                  onMouseEnter={() => setSurvol(s.slug)}
                  onMouseLeave={() => setSurvol((v) => (v === s.slug ? null : v))}
                  onFocus={() => setSurvol(s.slug)}
                  onBlur={() => setSurvol((v) => (v === s.slug ? null : v))}
                >
                  <span className="atl-car-nom">{s.nom}</span>
                  {compact && s.aValider === 0 ? null : (
                    <span className="atl-car-meta">
                      {compact ? null : <span className="atl-car-agents">{texteAgents(s)}</span>}
                      {s.aValider > 0 ? <span className="atl-car-traiter">À traiter</span> : null}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <Legende />
        {/* Toujours présente (masquée une fois un service choisi) : la place qu'elle occupe reste réservée à la disposition. */}
        <p className="atl-car-note" data-masque={choisi ? "oui" : undefined} aria-hidden={choisi ? "true" : undefined}>
          Cliquez un service pour voir ses échanges ; double-cliquez pour l'ouvrir.
        </p>
        <div className="atl-car-commandes" role="group" aria-label="Zoom de la carte" data-commande>
          <span className="atl-car-echelle" ref={lecture} aria-hidden="true">
            100 %
          </span>
          <button type="button" className="atl-car-commande" aria-label="Zoom avant" onClick={() => zoomer(FACTEUR_ZOOM, undefined, undefined, true)}>
            +
          </button>
          <button type="button" className="atl-car-commande" aria-label="Zoom arrière" onClick={() => zoomer(1 / FACTEUR_ZOOM, undefined, undefined, true)}>
            −
          </button>
          <button
            type="button"
            className="atl-car-commande"
            aria-label="Ajuster à l'écran"
            onClick={() => {
              interagi.current = false;
              ajuster(true);
            }}
          >
            <IconeAjuster />
          </button>
        </div>
        {choisi ? (
          <aside className="atl-car-panneau atl-car-tiroir" ref={tiroir} aria-labelledby="atl-car-panneau-titre">
            <PanneauLiaisons service={choisi} liaisons={liaisons} nomDe={nomDe} choisir={choisir} ouvrirService={ouvrirService} fermer={() => choisir(null)} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Liste (téléphone)
// ---------------------------------------------------------------------------------------------------------------

function ListeTelephone({ services, flux, selection, choisir, ouvrirService }: PropsCarteServices) {
  const metier = useMemo(() => fluxMetier(flux), [flux]);
  const ordonnes = useMemo(() => ordonnerServices(services), [services]);
  const nomDe = (slug: string) => services.find((s) => s.slug === slug)?.nom ?? slug;
  return (
    <div className="atl-car">
      <ul className="atl-car-liste">
        {ordonnes.map((s) => {
          const ouvert = selection === s.slug;
          return (
            <li key={s.slug} className="atl-car-ligne" data-service={s.slug} data-selection={ouvert || undefined}>
              <div className="atl-car-ligne-tete">
                <span className="atl-car-nom">{s.nom}</span>
                <span className="atl-car-meta">
                  <span className="atl-car-agents">{texteAgents(s)}</span>
                  {s.aValider > 0 ? <span className="atl-car-traiter">À traiter</span> : null}
                </span>
              </div>
              <div className="atl-car-ligne-actions">
                <button type="button" className="atl-bouton" aria-expanded={ouvert} onClick={() => choisir(ouvert ? null : s.slug)}>
                  {ouvert ? "Masquer les liens" : "Voir les liens"}
                </button>
                <button type="button" className="atl-bouton" onClick={() => ouvrirService(s.slug)}>
                  Ouvrir le service
                </button>
              </div>
              {ouvert ? <ListePartenaires liaisons={liaisonsDe(s.slug, metier)} nomDe={nomDe} choisir={(slug) => choisir(slug)} /> : null}
            </li>
          );
        })}
      </ul>
      <p className="atl-car-mention">{MENTION_COORDINATEURS}</p>
    </div>
  );
}

export function CarteServices(props: PropsCarteServices) {
  const telephone = useTelephone();
  return telephone ? <ListeTelephone {...props} /> : <CarteBureau {...props} />;
}
