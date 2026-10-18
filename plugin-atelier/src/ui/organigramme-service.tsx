/**
 * Vue d'UN service de l'organigramme : l'arbre de ses agents (selon `reportsTo`) au centre, dessiné comme l'organigramme
 * du socle (cartes reliées par des traits orthogonaux fins), et ses services PARTENAIRES (liaisons métier seulement) en
 * nœuds satellites à gauche (entrants) et à droite (sortants), reliés par des flèches. Le composant est autonome : il ne
 * charge rien, tout lui est donné (agents, flux, services) ; le parent branche `ouvrirService` et `retour`.
 *
 * Tenue à l'échelle (un service peut compter 10 000 agents) :
 * - au-delà de 12 enfants directs sous un même responsable, ses enfants passent en colonne empilée (« pendue ») ;
 * - au-delà de 40 enfants, seuls les 40 premiers sont dessinés, suivis d'un groupe repliable « +N agents » ;
 * - au-delà de 200 cartes, seules les cartes (et traits) visibles dans le conteneur défilant sont rendues.
 * La disposition (`disposerArbreAgents`) et celle des satellites (`disposerSatellites`) sont des fonctions PURES.
 * Limite connue : la disposition est récursive, une chaîne de plusieurs milliers de niveaux n'est pas prévue.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LienHote } from "./composants.js";
import { nombre } from "./format.js";
import { compterStatuts, familleStatut, libelleStatutAgent, type AgentHote } from "./organigramme-arbre.js";
import { fluxMetier, liaisonsDe, objetsDuFlux, volumeDuFlux, type FluxBrut, type LiaisonPartenaire, type ServiceCarte } from "./organigramme-flux.js";
import { STYLES_ORGANIGRAMME_SERVICE } from "./styles-organigramme-service.js";
import { useTelephone } from "./telephone.js";

// ---------------------------------------------------------------------------------------------------------------
// Disposition de l'arbre des agents (pure)
// ---------------------------------------------------------------------------------------------------------------

export const CARTE_AGENT: { largeur: number; hauteur: number } = { largeur: 188, hauteur: 60 };
/** Au-delà de ce nombre d'enfants directs, les enfants passent en colonne empilée. */
export const ENFANTS_EN_RANGEE_MAX = 12;
/** Au-delà de ce nombre d'enfants directs, les suivants sont regroupés sous « +N agents ». */
export const ENFANTS_AVANT_GROUPE = 40;
/** Au-delà de ce nombre de cartes, seules les cartes visibles sont rendues. */
export const CARTES_AVANT_VIRTUALISATION = 200;

const ECART_H = 16;
const ECART_V = 40;
const ECART_PENDU = 10;
const RETRAIT = 28;
const MARGE = 16;
const RACINES = "__racines__";

export interface CarteArbre {
  /** Identifiant de l'agent, ou `groupe:<id du responsable>` pour le groupe « +N agents » / « Replier ». */
  id: string;
  genre: "agent" | "groupe";
  agent: AgentHote | null;
  /** Coin haut gauche. */
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  profondeur: number;
  /** Groupe seulement : responsable concerné, nombre d'agents cachés (replié) et état. */
  responsable?: string;
  restants?: number;
  deplie?: boolean;
}

export interface TraitArbre {
  id: string;
  /** Chemin SVG (segments orthogonaux). */
  d: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface DispositionArbre {
  largeur: number;
  hauteur: number;
  /** Dans l'ordre de lecture (parcours en profondeur). */
  cartes: CarteArbre[];
  traits: TraitArbre[];
}

const collateur = new Intl.Collator("fr");
const comparerAgents = (a: AgentHote, b: AgentHote): number => {
  const ca = a.role === "ceo";
  const cb = b.role === "ceo";
  if (ca !== cb) return ca ? -1 : 1;
  return collateur.compare(a.name, b.name);
};

/** Enfants retenus de chaque agent (sans boucle) et racines ; un cycle de `reportsTo` ne fait jamais boucler. */
function structure(agents: readonly AgentHote[]): { enfants: Map<string, AgentHote[]>; racines: AgentHote[] } {
  const parId = new Map<string, AgentHote>();
  for (const a of agents) parId.set(a.id, a);
  const candidats = new Map<string, AgentHote[]>();
  const racines: AgentHote[] = [];
  for (const a of agents) {
    if (a.reportsTo && a.reportsTo !== a.id && parId.has(a.reportsTo)) {
      const l = candidats.get(a.reportsTo);
      if (l) l.push(a);
      else candidats.set(a.reportsTo, [a]);
    } else racines.push(a);
  }
  for (const l of candidats.values()) if (l.length > 1) l.sort(comparerAgents);
  racines.sort(comparerAgents);
  const enfants = new Map<string, AgentHote[]>();
  const vus = new Set<string>();
  const explorer = (racine: AgentHote) => {
    const pile = [racine];
    vus.add(racine.id);
    while (pile.length > 0) {
      const a = pile.pop() as AgentHote;
      const retenus: AgentHote[] = [];
      for (const e of candidats.get(a.id) ?? []) {
        if (vus.has(e.id)) continue;
        vus.add(e.id);
        retenus.push(e);
        pile.push(e);
      }
      if (retenus.length > 0) enfants.set(a.id, retenus);
    }
  };
  for (const r of racines) explorer(r);
  // Cycle : personne n'y est racine, on prend le premier non atteint de chaque boucle.
  for (const a of [...agents].sort(comparerAgents)) {
    if (!vus.has(a.id)) {
      racines.push(a);
      explorer(a);
    }
  }
  return { enfants, racines };
}

/** Responsables dont la liste d'enfants dépasse le seuil du groupe, parmi les ancêtres de `agentId` (à déplier pour le montrer). */
export function ancetresDe(agents: readonly AgentHote[], agentId: string): string[] {
  const parId = new Map<string, AgentHote>();
  for (const a of agents) parId.set(a.id, a);
  const res: string[] = [];
  let courant = parId.get(agentId);
  for (let i = 0; courant && i <= agents.length; i++) {
    const pere: string | null = courant.reportsTo;
    if (!pere || pere === courant.id) {
      res.push(RACINES);
      break;
    }
    res.push(pere);
    courant = parId.get(pere);
  }
  return res;
}

interface Visible {
  id: string;
  agent: AgentHote | null;
  groupe?: { responsable: string; restants: number; deplie: boolean };
}

/**
 * Dispose l'arbre : racine en haut, enfants dessous en rangée (12 au plus), sinon en colonne empilée ; au-delà de 40
 * enfants, groupe « +N agents » sauf si le responsable est dans `depliees`. Aucune carte ne chevauche une autre.
 */
export function disposerArbreAgents(agents: readonly AgentHote[], depliees: ReadonlySet<string> = new Set()): DispositionArbre {
  const { enfants, racines } = structure(agents);
  const L = CARTE_AGENT.largeur;
  const H = CARTE_AGENT.hauteur;
  const cartes: CarteArbre[] = [];
  const traits: TraitArbre[] = [];
  let maxX = 0;
  let maxY = 0;

  const visibles = (id: string): Visible[] => {
    const liste = id === RACINES ? racines : (enfants.get(id) ?? []);
    if (liste.length <= ENFANTS_AVANT_GROUPE) return liste.map((a) => ({ id: a.id, agent: a }));
    const deplie = depliees.has(id);
    const montres: Visible[] = (deplie ? liste : liste.slice(0, ENFANTS_AVANT_GROUPE)).map((a) => ({ id: a.id, agent: a }));
    montres.push({ id: `groupe:${id}`, agent: null, groupe: { responsable: id, restants: liste.length - ENFANTS_AVANT_GROUPE, deplie } });
    return montres;
  };

  const largeurs = new Map<string, number>();
  const kidsCache = new Map<string, Visible[]>();
  const enfantsDe = (id: string): Visible[] => {
    let k = kidsCache.get(id);
    if (!k) kidsCache.set(id, (k = visibles(id)));
    return k;
  };
  const pendu = (n: number) => n > ENFANTS_EN_RANGEE_MAX;

  // Largeur d'un sous-arbre : en rangée, la somme de ses enfants ; en colonne, retrait + le plus large des enfants.
  const mesurer = (v: Visible, forcePendu: boolean): number => {
    const connue = largeurs.get(v.id);
    if (connue !== undefined) return connue;
    const k = v.agent ? enfantsDe(v.id) : [];
    let w = L;
    if (k.length > 0) {
      if (forcePendu || pendu(k.length)) {
        let m = 0;
        for (const e of k) m = Math.max(m, mesurer(e, true));
        w = Math.max(L, RETRAIT + m);
      } else {
        let s = ECART_H * (k.length - 1);
        for (const e of k) s += mesurer(e, false);
        w = Math.max(L, s);
      }
    }
    largeurs.set(v.id, w);
    return w;
  };

  const ajouterCarte = (v: Visible, x: number, y: number, profondeur: number): CarteArbre => {
    const c: CarteArbre = { id: v.id, genre: v.groupe ? "groupe" : "agent", agent: v.agent, x, y, largeur: L, hauteur: H, profondeur };
    if (v.groupe) {
      c.responsable = v.groupe.responsable;
      c.restants = v.groupe.restants;
      c.deplie = v.groupe.deplie;
    }
    cartes.push(c);
    maxX = Math.max(maxX, x + L);
    maxY = Math.max(maxY, y + H);
    return c;
  };
  const ajouterTrait = (id: string, d: string, x0: number, y0: number, x1: number, y1: number) =>
    traits.push({ id, d, x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) });

  /** Colonne empilée : `v` en (x, y), ses descendants dessous, retraits successifs. Rend le bas libre (y). */
  const placerPendu = (v: Visible, x: number, y: number, profondeur: number, parent: CarteArbre | null, precedentMilieu: number | null): number => {
    const c = ajouterCarte(v, x, y, profondeur);
    if (parent) {
      const tronc = parent.x + RETRAIT / 2;
      const milieu = y + H / 2;
      const depart = precedentMilieu ?? parent.y + H;
      ajouterTrait(v.id, `M${tronc} ${depart}V${milieu}H${x}`, tronc, depart, x, milieu);
    }
    let curseur = y + H + ECART_PENDU;
    let milieuPrecedent: number | null = null;
    for (const e of v.agent ? enfantsDe(v.id) : []) {
      const haut = curseur;
      curseur = placerPendu(e, x + RETRAIT, haut, profondeur + 1, c, milieuPrecedent) + ECART_PENDU;
      milieuPrecedent = haut + H / 2;
    }
    return Math.max(curseur - ECART_PENDU, y + H);
  };

  /** Rangée : `v` centré dans la tranche [x0, x0 + largeur], ses enfants côte à côte dessous. */
  const placerRangee = (v: Visible, x0: number, y: number, profondeur: number, parent: CarteArbre | null): void => {
    const w = mesurer(v, false);
    const k = v.agent ? enfantsDe(v.id) : [];
    const colonne = pendu(k.length);
    const x = colonne ? x0 : x0 + (w - L) / 2;
    const c = ajouterCarte(v, x, y, profondeur);
    if (parent) {
      const px = parent.x + L / 2;
      const bus = parent.y + H + ECART_V / 2;
      const cx = x + L / 2;
      ajouterTrait(v.id, `M${px} ${bus}H${cx}V${y}`, px, bus, cx, y);
    }
    if (k.length === 0) return;
    if (colonne) {
      let curseur = y + H + ECART_PENDU;
      let milieuPrecedent: number | null = null;
      for (const e of k) {
        const haut = curseur;
        curseur = placerPendu(e, x + RETRAIT, haut, profondeur + 1, c, milieuPrecedent) + ECART_PENDU;
        milieuPrecedent = haut + H / 2;
      }
      return;
    }
    const px = x + L / 2;
    ajouterTrait(`tige:${v.id}`, `M${px} ${y + H}V${y + H + ECART_V / 2}`, px, y + H, px, y + H + ECART_V / 2);
    let total = ECART_H * (k.length - 1);
    for (const e of k) total += mesurer(e, false);
    let cx = x0 + (w - total) / 2;
    for (const e of k) {
      placerRangee(e, cx, y + H + ECART_V, profondeur + 1, c);
      cx += mesurer(e, false) + ECART_H;
    }
  };

  const tete = enfantsDe(RACINES);
  if (tete.length === 1 && tete[0]) placerRangee(tete[0], MARGE, MARGE, 0, null);
  else if (tete.length > 0) {
    // Plusieurs racines (pas de coordinateur unique) : côte à côte, ou en colonne au-delà de 12, sans trait de liaison.
    if (pendu(tete.length)) {
      let curseur = MARGE;
      for (const r of tete) curseur = placerPendu(r, MARGE, curseur, 0, null, null) + ECART_PENDU;
    } else {
      let cx = MARGE;
      for (const r of tete) {
        placerRangee(r, cx, MARGE, 0, null);
        cx += mesurer(r, false) + ECART_H;
      }
    }
  }
  return { largeur: Math.max(maxX + MARGE, 2 * MARGE), hauteur: Math.max(maxY + MARGE, 2 * MARGE), cartes, traits };
}

export interface Fenetre {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

/** Cartes et traits à rendre : tout jusqu'à 200 cartes, sinon ceux qui touchent la fenêtre (avec `marge` px autour). */
export function elementsVisibles(dispo: DispositionArbre, fenetre: Fenetre, marge = 240, toujours: string | null = null): { cartes: CarteArbre[]; traits: TraitArbre[] } {
  if (dispo.cartes.length <= CARTES_AVANT_VIRTUALISATION) return { cartes: dispo.cartes, traits: dispo.traits };
  const x0 = fenetre.x - marge;
  const y0 = fenetre.y - marge;
  const x1 = fenetre.x + fenetre.largeur + marge;
  const y1 = fenetre.y + fenetre.hauteur + marge;
  return {
    cartes: dispo.cartes.filter((c) => c.id === toujours || (c.x < x1 && c.x + c.largeur > x0 && c.y < y1 && c.y + c.hauteur > y0)),
    traits: dispo.traits.filter((t) => t.x0 <= x1 && t.x1 >= x0 && t.y0 <= y1 && t.y1 >= y0),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Disposition des satellites (pure)
// ---------------------------------------------------------------------------------------------------------------

export const SATELLITE = { largeur: 156, hauteur: 64, ecart: 12 } as const;
export const GOUTTIERE = 84;
export const HAUTEUR_MIN_FIGURE = 420;

export interface Satellite {
  slug: string;
  nom: string;
  cote: "gauche" | "droite";
  /** Centre vertical, dans le repère de la figure. */
  y: number;
  liaison: LiaisonPartenaire;
  /** Nombre d'échanges (objets) que le service peut demander au partenaire, et que le partenaire peut lui demander. */
  sortants: number;
  entrants: number;
}

export interface DispositionSatellites {
  hauteur: number;
  gauche: Satellite[];
  droite: Satellite[];
}

const volumeDe = (l: readonly FluxBrut[]) => l.reduce((s, f) => s + volumeDuFlux(f), 0);

/**
 * Entrants (le partenaire demande au service) à gauche, sortants à droite ; un partenaire dans les deux sens va du côté
 * de son plus fort volume (à égalité : à droite). Hauteur de la figure : de quoi loger la colonne la plus chargée.
 */
export function disposerSatellites(liaisons: readonly LiaisonPartenaire[], nomDe: (slug: string) => string): DispositionSatellites {
  const items = liaisons.map((l) => {
    const sortants = volumeDe(l.sortants);
    const entrants = volumeDe(l.entrants);
    return { l, sortants, entrants, cote: (entrants > sortants ? "gauche" : "droite") as "gauche" | "droite" };
  });
  const pas = SATELLITE.hauteur + SATELLITE.ecart;
  const nG = items.filter((i) => i.cote === "gauche").length;
  const nD = items.length - nG;
  const hauteur = Math.max(HAUTEUR_MIN_FIGURE, nG * pas, nD * pas);
  const colonne = (cote: "gauche" | "droite"): Satellite[] => {
    const col = items.filter((i) => i.cote === cote);
    return col.map((i, rang) => ({
      slug: i.l.partenaire,
      nom: nomDe(i.l.partenaire),
      cote,
      y: ((rang + 0.5) * hauteur) / col.length,
      liaison: i.l,
      sortants: i.sortants,
      entrants: i.entrants,
    }));
  };
  return { hauteur, gauche: colonne("gauche"), droite: colonne("droite") };
}

/** Épaisseur du trait selon le nombre d'échanges (1 à 5 px). */
export const epaisseurPourVolume = (v: number): number => Math.min(5, Math.max(1, 1 + Math.log2(Math.max(v, 1))));

// ---------------------------------------------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------------------------------------------

export interface PropsVueServiceOrganigramme {
  service: { slug: string; nom: string; companyId: string; prefixe: string; estDirection?: boolean };
  agents: AgentHote[];
  flux: FluxBrut[];
  services: ServiceCarte[];
  agentMisEnEvidence?: string | null;
  ouvrirService: (slug: string) => void;
  retour: () => void;
}

const pluriel = (n: number, un: string, plusieurs: string) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;
const echanges = (n: number) => pluriel(n, "échange", "échanges");
const FENETRE_REPLI: Fenetre = { x: 0, y: 0, largeur: 1100, hauteur: 700 };
const PAGE_TELEPHONE = 200;

function titreCourt(a: AgentHote): string {
  if (a.title) return a.title;
  return a.role === "ceo" ? "Coordinateur" : "";
}

function CarteAgent({ c, prefixe, misEnEvidence, basculer }: { c: CarteArbre; prefixe: string; misEnEvidence: boolean; basculer: (id: string) => void }) {
  const style = { left: c.x, top: c.y, width: c.largeur, height: c.hauteur };
  if (c.genre === "groupe") {
    const responsable = c.responsable ?? "";
    return (
      <button type="button" className="atl-orgs-carte atl-orgs-groupe" style={style} aria-expanded={c.deplie === true} onClick={() => basculer(responsable)}>
        {c.deplie ? "Replier le groupe" : `+${nombre(c.restants ?? 0)} agents`}
      </button>
    );
  }
  const a = c.agent as AgentHote;
  const t = titreCourt(a);
  return (
    <div className="atl-orgs-carte" style={style} data-famille={familleStatut(a.status)} data-agent={a.id} data-mis-en-evidence={misEnEvidence || undefined}>
      <LienHote vers={`/${prefixe}/agents/${encodeURIComponent(a.id)}`} className="atl-orgs-lien">
        {a.name}
      </LienHote>
      {t ? <span className="atl-orgs-titre">{t}</span> : null}
      <span className="atl-orgs-statut" data-famille={familleStatut(a.status)}>
        {libelleStatutAgent(a.status)}
      </span>
    </div>
  );
}

function Fleches({ sats, cote, largeur }: { sats: Satellite[]; cote: "gauche" | "droite"; largeur: number }) {
  // Gouttière entre un satellite et le bloc : à gauche le satellite est en x = 0, à droite c'est le bloc.
  const xSat = cote === "gauche" ? 0 : largeur;
  const xBloc = cote === "gauche" ? largeur : 0;
  return (
    <>
      {sats.map((s) => {
        const deux = s.sortants > 0 && s.entrants > 0;
        const tracer = (sens: "sortant" | "entrant", volume: number, decalage: number) => {
          const y = s.y + decalage;
          // Sortant : du bloc vers le satellite ; entrant : du satellite vers le bloc.
          const depart = sens === "sortant" ? xBloc : xSat;
          const arrivee = sens === "sortant" ? xSat : xBloc;
          const dir = arrivee > depart ? 1 : -1;
          const pointe = arrivee - dir * 1;
          const milieu = (xSat + xBloc) / 2;
          const titre = sens === "sortant" ? `Demandes de ce service vers ${s.nom} : ${echanges(volume)}` : `Demandes de ${s.nom} vers ce service : ${echanges(volume)}`;
          return (
            <g key={sens} className="atl-orgs-fleche" data-sens={sens}>
              <title>{titre}</title>
              <line x1={depart} y1={y} x2={arrivee - dir * 8} y2={y} strokeWidth={epaisseurPourVolume(volume)} />
              <path d={`M${pointe} ${y}l${-dir * 9} -5l0 10z`} className="atl-orgs-pointe" />
              <text x={milieu} y={deux && sens === "entrant" ? y + 17 : y - 6} textAnchor="middle" className="atl-orgs-fleche-nombre">
                {nombre(volume)}
              </text>
            </g>
          );
        };
        return (
          <g key={s.slug}>
            {s.sortants > 0 ? tracer("sortant", s.sortants, deux ? -9 : 0) : null}
            {s.entrants > 0 ? tracer("entrant", s.entrants, deux ? 9 : 0) : null}
          </g>
        );
      })}
    </>
  );
}

function NoeudSatellite({ s, ouvrir }: { s: Satellite; ouvrir: (slug: string) => void }) {
  const sens = s.sortants > 0 && s.entrants > 0 ? "dans les deux sens" : s.sortants > 0 ? "vers ce partenaire" : "depuis ce partenaire";
  return (
    <button
      type="button"
      className="atl-orgs-satellite"
      data-cote={s.cote}
      style={{ top: s.y - SATELLITE.hauteur / 2, height: SATELLITE.hauteur }}
      onClick={() => ouvrir(s.slug)}
      aria-label={`Ouvrir le service ${s.nom} (${echanges(s.sortants + s.entrants)}, ${sens}${s.liaison.approbation ? ", approbation humaine" : ""})`}
    >
      <span className="atl-orgs-satellite-nom">{s.nom}</span>
      <span className="atl-orgs-satellite-detail">{echanges(s.sortants + s.entrants)}</span>
      {s.liaison.approbation ? <span className="atl-orgs-satellite-detail">approbation</span> : null}
    </button>
  );
}

function PanneauEchanges({ liaisons, nomDe, ouvrir }: { liaisons: readonly LiaisonPartenaire[]; nomDe: (slug: string) => string; ouvrir: (slug: string) => void }) {
  if (liaisons.length === 0) return <p className="atl-orgs-vide">Ce service n'a pas d'échange métier avec d'autres services.</p>;
  return (
    <div className="atl-orgs-echanges">
      {liaisons.map((l) => (
        <section key={l.partenaire} className="atl-orgs-partenaire" aria-label={`Échanges avec ${nomDe(l.partenaire)}`}>
          <h4 className="atl-orgs-partenaire-titre">
            <button type="button" className="atl-orgs-lien-service" onClick={() => ouvrir(l.partenaire)}>
              {nomDe(l.partenaire)}
            </button>
            <span className="atl-orgs-compteur">{echanges(l.volume)}</span>
            {l.approbation ? <span className="atl-orgs-etiquette">approbation humaine</span> : null}
          </h4>
          <ul className="atl-orgs-objets">
            {l.sortants.flatMap((f) =>
              objetsDuFlux(f).map((o) => (
                <li key={`s-${f.source}-${f.cible}-${o}`}>
                  <span className="atl-orgs-sens" data-sens="sortant">Vers {nomDe(l.partenaire)}</span> {o}
                  {f.approbationHumaine ? " (approbation humaine)" : ""}
                </li>
              )),
            )}
            {l.entrants.flatMap((f) =>
              objetsDuFlux(f).map((o) => (
                <li key={`e-${f.source}-${f.cible}-${o}`}>
                  <span className="atl-orgs-sens" data-sens="entrant">Depuis {nomDe(l.partenaire)}</span> {o}
                  {f.approbationHumaine ? " (approbation humaine)" : ""}
                </li>
              )),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ListeTelephone({ dispo, prefixe, misEnEvidence, basculer }: { dispo: DispositionArbre; prefixe: string; misEnEvidence: string | null; basculer: (id: string) => void }) {
  const indexMis = misEnEvidence ? dispo.cartes.findIndex((c) => c.id === misEnEvidence) : -1;
  const [limite, setLimite] = useState(PAGE_TELEPHONE);
  const affiche = Math.max(limite, indexMis + 1);
  const cartes = dispo.cartes.slice(0, affiche);
  return (
    <div className="atl-orgs-liste-bloc">
      <ul className="atl-orgs-liste" aria-label="Agents du service">
        {cartes.map((c) => (
          <li key={c.id} className="atl-orgs-ligne" style={{ paddingLeft: `${0.75 + c.profondeur * 1}rem` }} data-mis-en-evidence={c.id === misEnEvidence || undefined} data-agent={c.agent?.id}>
            {c.genre === "groupe" ? (
              <button type="button" className="atl-orgs-groupe-ligne" aria-expanded={c.deplie === true} onClick={() => basculer(c.responsable ?? "")}>
                {c.deplie ? "Replier le groupe" : `+${nombre(c.restants ?? 0)} agents`}
              </button>
            ) : (
              <>
                <LienHote vers={`/${prefixe}/agents/${encodeURIComponent((c.agent as AgentHote).id)}`} className="atl-orgs-lien">
                  {(c.agent as AgentHote).name}
                </LienHote>
                <span className="atl-orgs-statut" data-famille={familleStatut((c.agent as AgentHote).status)}>
                  {libelleStatutAgent((c.agent as AgentHote).status)}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {affiche < dispo.cartes.length ? (
        <button type="button" className="atl-bouton" onClick={() => setLimite(affiche + PAGE_TELEPHONE)}>
          Afficher {nombre(Math.min(PAGE_TELEPHONE, dispo.cartes.length - affiche))} agents de plus
        </button>
      ) : null}
    </div>
  );
}

export function VueServiceOrganigramme(props: PropsVueServiceOrganigramme) {
  const { service, agents, flux, services, agentMisEnEvidence = null, ouvrirService, retour } = props;
  const telephone = useTelephone();
  const [depliees, setDepliees] = useState<ReadonlySet<string>>(() => new Set());
  const basculer = useCallback((id: string) => {
    setDepliees((avant) => {
      const apres = new Set(avant);
      if (apres.has(id)) apres.delete(id);
      else apres.add(id);
      return apres;
    });
  }, []);

  // Un agent mis en évidence caché dans un groupe : on déplie ses responsables.
  useLayoutEffect(() => {
    if (!agentMisEnEvidence) return;
    const ancetres = ancetresDe(agents, agentMisEnEvidence);
    setDepliees((avant) => (ancetres.every((a) => avant.has(a)) ? avant : new Set([...avant, ...ancetres])));
  }, [agentMisEnEvidence, agents]);

  const dispo = useMemo(() => disposerArbreAgents(agents, depliees), [agents, depliees]);
  const statuts = useMemo(() => compterStatuts(agents), [agents]);
  const nomPar = useMemo(() => new Map(services.map((s) => [s.slug, s.nom])), [services]);
  const nomDe = useCallback((slug: string) => nomPar.get(slug) ?? slug, [nomPar]);
  const liaisons = useMemo(() => liaisonsDe(service.slug, fluxMetier(flux)), [service.slug, flux]);
  const sats = useMemo(() => disposerSatellites(liaisons, nomDe), [liaisons, nomDe]);

  // Fenêtre visible du conteneur défilant (virtualisation au-delà de 200 cartes) et centrage sur l'agent mis en évidence.
  const defilant = useRef<HTMLDivElement | null>(null);
  const [fenetre, setFenetre] = useState<Fenetre>(FENETRE_REPLI);
  const lireFenetre = useCallback(() => {
    const el = defilant.current;
    if (!el) return;
    setFenetre({ x: el.scrollLeft, y: el.scrollTop, largeur: el.clientWidth || FENETRE_REPLI.largeur, hauteur: el.clientHeight || FENETRE_REPLI.hauteur });
  }, []);
  const dejaCentre = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (telephone || !agentMisEnEvidence) {
      dejaCentre.current = null;
      return;
    }
    const carte = dispo.cartes.find((c) => c.id === agentMisEnEvidence);
    const el = defilant.current;
    if (!carte || !el) return;
    const cle = `${service.slug}:${agentMisEnEvidence}`;
    if (dejaCentre.current === cle) return;
    dejaCentre.current = cle;
    const l = el.clientWidth || FENETRE_REPLI.largeur;
    const h = el.clientHeight || FENETRE_REPLI.hauteur;
    const x = Math.max(0, carte.x + carte.largeur / 2 - l / 2);
    const y = Math.max(0, carte.y + carte.hauteur / 2 - h / 2);
    el.scrollLeft = x;
    el.scrollTop = y;
    setFenetre({ x, y, largeur: l, hauteur: h });
    const noeud = el.querySelector(`[data-agent="${CSS.escape(agentMisEnEvidence)}"]`);
    (noeud as HTMLElement | null)?.scrollIntoView?.({ block: "center", inline: "center" });
  }, [agentMisEnEvidence, dispo, telephone, service.slug]);
  useEffect(() => {
    if (!telephone) lireFenetre();
  }, [telephone, lireFenetre]);

  const visibles = useMemo(() => elementsVisibles(dispo, fenetre, 240, agentMisEnEvidence), [dispo, fenetre, agentMisEnEvidence]);
  const hauteurFigure = sats.hauteur;
  const A = (n: number) => pluriel(n, "agent", "agents");

  return (
    <section className="atl-orgs" aria-label={`Service ${service.nom}`}>
      <style href="atelier-organigramme-service" precedence="default">
        {STYLES_ORGANIGRAMME_SERVICE}
      </style>
      <header className="atl-orgs-entete">
        <nav aria-label="Fil d'Ariane" className="atl-orgs-fil">
          <button type="button" className="atl-orgs-retour" onClick={retour}>
            Organigramme
          </button>
          <span aria-hidden="true" className="atl-orgs-sep">›</span>
          <span aria-current="page" className="atl-orgs-courant">
            {service.nom}
          </span>
        </nav>
        <h3 className="atl-orgs-titre-service">{service.nom}</h3>
        <p className="atl-orgs-resume">
          <strong>{A(statuts.total)}</strong>
          <span>{pluriel(statuts.actifs, "actif", "actifs")}</span>
          <span>{nombre(statuts.enPause)} en pause</span>
          <span>{nombre(statuts.enErreur)} en erreur</span>
        </p>
      </header>

      {agents.length === 0 ? <p className="atl-orgs-vide">Ce service n'a aucun agent.</p> : null}

      {telephone ? (
        <>
          {agents.length > 0 ? <ListeTelephone dispo={dispo} prefixe={service.prefixe} misEnEvidence={agentMisEnEvidence} basculer={basculer} /> : null}
          <h4 className="atl-orgs-sous-titre">Services partenaires</h4>
          {liaisons.length === 0 ? (
            <p className="atl-orgs-vide">Ce service n'a pas d'échange métier avec d'autres services.</p>
          ) : (
            <ul className="atl-orgs-partenaires-liste">
              {sats.gauche.concat(sats.droite).map((s) => (
                <li key={s.slug}>
                  <button type="button" className="atl-orgs-satellite-ligne" onClick={() => ouvrirService(s.slug)}>
                    <span className="atl-orgs-satellite-nom">{s.nom}</span>
                    <span className="atl-orgs-satellite-detail">
                      {s.sortants > 0 ? `${echanges(s.sortants)} sortants` : ""}
                      {s.sortants > 0 && s.entrants > 0 ? ", " : ""}
                      {s.entrants > 0 ? `${echanges(s.entrants)} entrants` : ""}
                      {s.liaison.approbation ? ", approbation" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="atl-orgs-legende">
            <span className="atl-orgs-legende-item">
              <svg width="40" height="10" aria-hidden="true"><line x1="0" y1="5" x2="40" y2="5" className="atl-orgs-echantillon" data-sens="sortant" /></svg>
              trait plein : ce service demande aux autres
            </span>
            <span className="atl-orgs-legende-item">
              <svg width="40" height="10" aria-hidden="true"><line x1="0" y1="5" x2="40" y2="5" className="atl-orgs-echantillon" data-sens="entrant" /></svg>
              trait pointillé : les autres lui demandent
            </span>
          </div>
          <div className="atl-orgs-figure-defile">
            <div
              className="atl-orgs-figure"
              style={{
                height: hauteurFigure,
                gridTemplateColumns: `${sats.gauche.length > 0 ? `${SATELLITE.largeur}px ${GOUTTIERE}px ` : ""}minmax(16rem, 1fr)${sats.droite.length > 0 ? ` ${GOUTTIERE}px ${SATELLITE.largeur}px` : ""}`,
              }}
            >
              {sats.gauche.length > 0 ? (
                <>
                  <div className="atl-orgs-colonne">
                    {sats.gauche.map((s) => (
                      <NoeudSatellite key={s.slug} s={s} ouvrir={ouvrirService} />
                    ))}
                  </div>
                  <svg className="atl-orgs-gouttiere" width={GOUTTIERE} height={hauteurFigure} aria-hidden="true">
                    <Fleches sats={sats.gauche} cote="gauche" largeur={GOUTTIERE} />
                  </svg>
                </>
              ) : null}
              <div className="atl-orgs-bloc">
                <div
                  className="atl-orgs-defilant"
                  ref={defilant}
                  tabIndex={0}
                  role="region"
                  aria-label={`Arbre des agents du service ${service.nom}`}
                  onScroll={dispo.cartes.length > CARTES_AVANT_VIRTUALISATION ? lireFenetre : undefined}
                >
                  <div className="atl-orgs-plan" style={{ width: dispo.largeur, height: dispo.hauteur }}>
                    <svg className="atl-orgs-traits" width={dispo.largeur} height={dispo.hauteur} aria-hidden="true">
                      {visibles.traits.map((t) => (
                        <path key={t.id} d={t.d} />
                      ))}
                    </svg>
                    {visibles.cartes.map((c) => (
                      <CarteAgent key={c.id} c={c} prefixe={service.prefixe} misEnEvidence={c.id === agentMisEnEvidence} basculer={basculer} />
                    ))}
                  </div>
                </div>
              </div>
              {sats.droite.length > 0 ? (
                <>
                  <svg className="atl-orgs-gouttiere" width={GOUTTIERE} height={hauteurFigure} aria-hidden="true">
                    <Fleches sats={sats.droite} cote="droite" largeur={GOUTTIERE} />
                  </svg>
                  <div className="atl-orgs-colonne">
                    {sats.droite.map((s) => (
                      <NoeudSatellite key={s.slug} s={s} ouvrir={ouvrirService} />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </>
      )}

      <section className="atl-orgs-panneau" aria-label="Échanges avec les autres services">
        <h4 className="atl-orgs-sous-titre">Échanges avec les autres services</h4>
        <PanneauEchanges liaisons={liaisons} nomDe={nomDe} ouvrir={ouvrirService} />
      </section>
    </section>
  );
}
