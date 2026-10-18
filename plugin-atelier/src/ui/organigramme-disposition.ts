/**
 * Disposition pure de l'organigramme dessiné (testée sans interface) : positions et tailles des cartes, cadres de
 * service, segments de traits, transformations de la vue (ajuster, ouvrir, centrer, zoomer autour d'un point).
 *
 * Forme : le Coordinateur général en haut, centré. Chaque service est un CADRE (bordure fine) qui contient sa carte de
 * service en en-tête (nom, coordinateur) puis ses agents EMPILÉS VERTICALEMENT selon `reportsTo` (retrait par niveau,
 * petit trait à gauche reliant chaque carte). Les cadres sont rangés en GRILLE de plusieurs rangées dont le nombre de
 * colonnes donne un plan à peu près au format de l'écran. Une gouttière verticale au milieu porte le tronc qui descend
 * du général ; un bus horizontal passe dans l'espace au-dessus de chaque rangée et descend vers chaque cadre, sans jamais
 * traverser une carte. Les coordonnées sont en pixels du plan ; le zoom et le déplacement ne touchent jamais à la
 * disposition.
 */
import { coordinateurDe, construireArbre, filtrerService, type AgentHote, type NoeudAgent } from "./organigramme-arbre.js";

export const DIMENSIONS = {
  generalL: 264,
  generalH: 64,
  serviceL: 232,
  serviceH: 120,
  agentL: 208,
  agentH: 52,
  /** Décalage horizontal par niveau de `reportsTo`. */
  retrait: 20,
  /** Espace entre deux colonnes de cadres. */
  interColonne: 24,
  /** Espace entre deux cartes d'agents empilées. */
  interLigne: 8,
  /** Espace vertical au-dessus de chaque rangée de cadres : le bus horizontal y passe. */
  hauteurBarre: 56,
  /** Marge entre la bordure d'un cadre et ses cartes. */
  margeCadre: 12,
  /** Largeur de la gouttière centrale qui porte le tronc du général. */
  gouttiere: 40,
  /** Espace entre la carte du service et son premier agent. */
  sousService: 14,
} as const;

export type EtatLecture = "chargement" | "pret" | "erreur";

export interface ServiceADisposer {
  slug: string;
  nom: string;
  estDirection: boolean;
  etat: EtatLecture;
  agents: readonly AgentHote[];
}

export type GenreCarte = "general" | "service" | "agent";

export interface CarteDisposee {
  /** Identifiant unique de la carte dans le plan. */
  id: string;
  genre: GenreCarte;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  /** Service d'appartenance (absent pour le général quand la Direction n'est pas lue). */
  slug: string | null;
  /** Agent porté par la carte (général et agents) ; les cartes de service portent `coordinateur`. */
  agent: AgentHote | null;
  coordinateur: AgentHote | null;
  nom: string;
  /** Carte de service : nombre d'agents du service. */
  nbAgents: number;
  etat: EtatLecture;
  /** Niveau de retrait (0 pour général et service). */
  profondeur: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  de: string;
  vers: string;
}

/** Cadre d'un service : rectangle de fond qui entoure sa carte de service et ses agents. */
export interface CadreService {
  id: string;
  slug: string;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

export interface Disposition {
  cartes: CarteDisposee[];
  cadres: CadreService[];
  /** Nombre de colonnes de la grille de cadres. */
  colonnes: number;
  segments: Segment[];
  largeur: number;
  hauteur: number;
}

export interface Ligne {
  agent: AgentHote;
  profondeur: number;
  /** Agent parent dans la colonne, ou null quand le parent est la carte du service. */
  parent: string | null;
}

/**
 * Agents d'un service, à plat, dans l'ordre d'affichage. Le coordinateur est la carte du service : il n'y figure pas et
 * ses subordonnés viennent au niveau 1, comme les autres racines du service.
 */
export function lignesDuService(agents: readonly AgentHote[], idCoordinateur: string | null): Ligne[] {
  const lignes: Ligne[] = [];
  const visiter = (n: NoeudAgent, profondeur: number, parent: string | null) => {
    if (n.agent.id === idCoordinateur) {
      for (const e of n.enfants) visiter(e, profondeur, parent);
      return;
    }
    lignes.push({ agent: n.agent, profondeur, parent });
    for (const e of n.enfants) visiter(e, profondeur + 1, n.agent.id);
  };
  for (const r of construireArbre(agents)) visiter(r, 1, null);
  return lignes;
}

/** Direction d'abord, les autres services dans l'ordre reçu. */
const ordreServices = (services: readonly ServiceADisposer[]): ServiceADisposer[] => [...services.filter((s) => s.estDirection), ...services.filter((s) => !s.estDirection)];

/** Format cible du plan (largeur / hauteur) : proche de celui d'un écran de bureau. */
export const FORMAT_CIBLE = 1.6;

interface Colonne {
  s: ServiceADisposer;
  coord: AgentHote | null;
  lignes: Ligne[];
  largeur: number;
  hauteur: number;
}

/** Dispose les cadres sur `colonnes` colonnes. Fonction pure ; le choix du nombre de colonnes est fait par l'appelant. */
function disposerEnGrille(ordonnes: readonly ServiceADisposer[], colonnes: number): Disposition {
  const D = DIMENSIONS;
  const direction = ordonnes.find((s) => s.estDirection) ?? null;
  const general = direction && direction.etat === "pret" ? coordinateurDe(direction.agents) : null;

  const blocs: Colonne[] = ordonnes.map((s) => {
    const coord = s.etat === "pret" ? coordinateurDe(s.agents) : null;
    const lignes = s.etat === "pret" ? lignesDuService(s.agents, coord?.id ?? null) : [];
    const profMax = lignes.reduce((m, l) => Math.max(m, l.profondeur), 0);
    const interieur = Math.max(D.serviceL, D.retrait * profMax + D.agentL);
    const interieurH = D.serviceH + (lignes.length ? D.sousService + lignes.length * D.agentH + (lignes.length - 1) * D.interLigne : 0);
    return { s, coord, lignes, largeur: interieur + 2 * D.margeCadre, hauteur: interieurH + 2 * D.margeCadre };
  });

  // Au moins deux colonnes dès qu'il y a deux cadres : le tronc du général descend dans la gouttière entre elles.
  const nb = Math.max(blocs.length >= 2 ? 2 : 1, Math.min(colonnes, blocs.length || 1));
  const largeurCol = blocs.reduce<number>((m, b) => Math.max(m, b.largeur), D.serviceL);
  const gauche = Math.ceil(nb / 2);
  // x d'une colonne : les colonnes de gauche, la gouttière centrale (seulement s'il y a des deux côtés), puis la droite.
  const xColonne = (i: number) => i * (largeurCol + D.interColonne) + (i >= gauche ? D.gouttiere - D.interColonne : 0);
  const largeurGrille = nb * largeurCol + (nb - 1) * D.interColonne + (nb > gauche ? D.gouttiere - D.interColonne : 0);
  const xTronc = nb > gauche ? gauche * largeurCol + (gauche - 1) * D.interColonne + D.gouttiere / 2 : largeurGrille / 2;
  const largeur = Math.max(largeurGrille, D.generalL);
  const decalage = (largeur - largeurGrille) / 2;
  const cxGeneral = Math.max(D.generalL / 2, Math.min(largeur - D.generalL / 2, xTronc + decalage));
  const idGeneral = "general";

  const cartes: CarteDisposee[] = [];
  const cadres: CadreService[] = [];
  const segments: Segment[] = [];
  cartes.push({
    id: idGeneral, genre: "general", x: cxGeneral - D.generalL / 2, y: 0, largeur: D.generalL, hauteur: D.generalH,
    slug: direction?.slug ?? null, agent: general, coordinateur: null, nom: "Coordinateur général", nbAgents: 0, etat: direction?.etat ?? "chargement", profondeur: 0,
  });

  const rangees = Math.ceil(blocs.length / nb);
  let yRangee = D.generalH + D.hauteurBarre;
  let hauteur: number = D.generalH;
  const bus: Array<{ y: number; centres: Array<{ id: string; cx: number }> }> = [];
  for (let r = 0; r < rangees; r += 1) {
    const rang = blocs.slice(r * nb, (r + 1) * nb);
    const hRangee = rang.reduce((m, b) => Math.max(m, b.hauteur), 0);
    const centres: Array<{ id: string; cx: number }> = [];
    rang.forEach((c, i) => {
      const xCadre = decalage + xColonne(i);
      const idService = `service:${c.s.slug}`;
      cadres.push({ id: `cadre:${c.s.slug}`, slug: c.s.slug, x: xCadre, y: yRangee, largeur: largeurCol, hauteur: c.hauteur });
      const x = xCadre + D.margeCadre;
      const yService = yRangee + D.margeCadre;
      const carteService: CarteDisposee = {
        id: idService, genre: "service", x, y: yService, largeur: D.serviceL, hauteur: D.serviceH,
        slug: c.s.slug, agent: null, coordinateur: c.coord, nom: c.s.nom, nbAgents: c.s.agents.length, etat: c.s.etat, profondeur: 0,
      };
      cartes.push(carteService);
      centres.push({ id: `cadre:${c.s.slug}`, cx: xCadre + largeurCol / 2 });
      let y = yService + D.serviceH + D.sousService;
      const posees = new Map<string, CarteDisposee>();
      const enfantsDe = new Map<string, CarteDisposee[]>();
      for (const l of c.lignes) {
        const carte: CarteDisposee = {
          id: `agent:${c.s.slug}:${l.agent.id}`, genre: "agent", x: x + D.retrait * l.profondeur, y, largeur: D.agentL, hauteur: D.agentH,
          slug: c.s.slug, agent: l.agent, coordinateur: null, nom: l.agent.name, nbAgents: 0, etat: "pret", profondeur: l.profondeur,
        };
        cartes.push(carte);
        posees.set(l.agent.id, carte);
        const cle = l.parent ?? "";
        enfantsDe.set(cle, [...(enfantsDe.get(cle) ?? []), carte]);
        y += D.agentH + D.interLigne;
      }
      // Traits : un tronc vertical sous chaque parent et un petit trait horizontal vers chaque enfant.
      const relier = (parent: CarteDisposee, enfants: CarteDisposee[]) => {
        const tx = parent.x + D.retrait / 2;
        const dernier = enfants[enfants.length - 1]!;
        segments.push({ x1: tx, y1: parent.y + parent.hauteur, x2: tx, y2: dernier.y + dernier.hauteur / 2, de: parent.id, vers: dernier.id });
        for (const e of enfants) segments.push({ x1: tx, y1: e.y + e.hauteur / 2, x2: e.x, y2: e.y + e.hauteur / 2, de: parent.id, vers: e.id });
      };
      const racines = enfantsDe.get("");
      if (racines?.length) relier(carteService, racines);
      for (const [idParent, enfants] of enfantsDe) if (idParent !== "") relier(posees.get(idParent)!, enfants);
    });
    bus.push({ y: yRangee - D.hauteurBarre / 2, centres });
    hauteur = yRangee + hRangee;
    yRangee += hRangee + D.hauteurBarre;
  }

  // Général -> tronc dans la gouttière -> un bus au-dessus de chaque rangée -> un trait vers chaque cadre.
  if (bus.length) {
    const dernierBus = bus[bus.length - 1]!.y;
    segments.push({ x1: cxGeneral, y1: D.generalH, x2: cxGeneral, y2: dernierBus, de: idGeneral, vers: idGeneral });
    for (const b of bus) {
      const xs = [...b.centres.map((k) => k.cx), cxGeneral];
      const g = Math.min(...xs);
      const d = Math.max(...xs);
      if (d > g) segments.push({ x1: g, y1: b.y, x2: d, y2: b.y, de: idGeneral, vers: idGeneral });
      for (const k of b.centres) {
        const cadre = cadres.find((c) => c.id === k.id)!;
        segments.push({ x1: k.cx, y1: b.y, x2: k.cx, y2: cadre.y, de: idGeneral, vers: `service:${cadre.slug}` });
      }
    }
  }
  return { cartes, cadres, colonnes: nb, segments, largeur, hauteur };
}

/** Direction d'abord, les autres services dans l'ordre reçu. */
export function disposerOrganigramme(services: readonly ServiceADisposer[], options: { colonnes?: number; format?: number } = {}): Disposition {
  const ordonnes = ordreServices(services);
  if (options.colonnes !== undefined) return disposerEnGrille(ordonnes, options.colonnes);
  // Nombre de colonnes choisi pour que le plan ait à peu près le format de l'écran.
  const format = options.format ?? FORMAT_CIBLE;
  let meilleure: Disposition | null = null;
  let ecartMin = Infinity;
  for (let n = ordonnes.length >= 2 ? 2 : 1; n <= Math.max(1, ordonnes.length); n += 1) {
    const d = disposerEnGrille(ordonnes, n);
    const ecart = Math.abs(Math.log(d.largeur / d.hauteur / format));
    if (ecart < ecartMin - 1e-9) {
      ecartMin = ecart;
      meilleure = d;
    }
  }
  return meilleure ?? disposerEnGrille(ordonnes, 1);
}

/** Identifiants des cartes qui correspondent au filtre (nom ou titre d'un agent, nom d'un service). */
export function cartesCorrespondantes(dispo: Disposition, services: readonly ServiceADisposer[], filtre: string): Set<string> {
  const trouvees = new Set<string>();
  const direction = services.find((s) => s.estDirection);
  for (const s of services) {
    const r = filtrerService(filtre, s.nom, s.etat === "pret" ? s.agents : []);
    if (!r) continue;
    const coord = s.etat === "pret" ? coordinateurDe(s.agents) : null;
    if (r.service || (coord && r.agents.has(coord.id))) trouvees.add(`service:${s.slug}`);
    for (const id of r.agents) trouvees.add(`agent:${s.slug}:${id}`);
    if (s === direction && coord && r.agents.has(coord.id)) trouvees.add("general");
  }
  // Le filtre vide ne met rien en évidence.
  return filtre.trim() === "" ? new Set() : new Set([...trouvees].filter((id) => dispo.cartes.some((c) => c.id === id)));
}

/** Première carte, dans l'ordre du plan (général, puis chaque service et ses agents), qui correspond. */
export function premiereCorrespondance(dispo: Disposition, trouvees: ReadonlySet<string>): CarteDisposee | null {
  return dispo.cartes.find((c) => trouvees.has(c.id)) ?? null;
}

/** Transformation de la vue : le plan est translaté de (x, y) puis agrandi de `echelle`. */
export interface Transformation {
  echelle: number;
  x: number;
  y: number;
}

export const ECHELLE_MIN = 0.1;
export const ECHELLE_MAX = 2;
export const bornerEchelle = (e: number): number => Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, e));

/** Tout le plan visible et centré dans la vue (jamais agrandi au-delà de 100 %). */
export function transformationAjustee(dispo: Pick<Disposition, "largeur" | "hauteur">, vueL: number, vueH: number, marge = 16): Transformation {
  const echelle = bornerEchelle(Math.min(1, (vueL - 2 * marge) / dispo.largeur, (vueH - 2 * marge) / dispo.hauteur));
  return { echelle, x: (vueL - dispo.largeur * echelle) / 2, y: Math.max(marge, (vueH - dispo.hauteur * echelle) / 2) };
}

/** Échelle d'ouverture : le plus petit texte des cartes (11 px) reste à 9 px au moins. */
export const ECHELLE_OUVERTURE = 0.85;

/**
 * Ouverture de la vue : zoom lisible centré sur le Coordinateur général, première rangée de cadres en dessous.
 * Ne cherche pas à tout faire tenir (c'est le rôle d'« Ajuster à l'écran »), mais jamais plus grand que le plan ajusté.
 */
export function transformationOuverture(dispo: Pick<Disposition, "largeur" | "hauteur" | "cartes">, vueL: number, vueH: number, marge = 16): Transformation {
  const general = dispo.cartes.find((c) => c.genre === "general");
  const ajustee = transformationAjustee(dispo, vueL, vueH, marge);
  const echelle = bornerEchelle(Math.max(ajustee.echelle, ECHELLE_OUVERTURE));
  const cx = general ? general.x + general.largeur / 2 : dispo.largeur / 2;
  // Le plan lisible est plus large que la vue : on centre sur le général ; sinon on le centre tout simplement.
  const x = dispo.largeur * echelle <= vueL ? (vueL - dispo.largeur * echelle) / 2 : vueL / 2 - cx * echelle;
  return { echelle, x, y: marge };
}

/** Centre une carte dans la vue, avec au moins l'échelle donnée. */
export function transformationCentree(carte: Pick<CarteDisposee, "x" | "y" | "largeur" | "hauteur">, vueL: number, vueH: number, echelleMin = 0.8, actuelle = 0): Transformation {
  const echelle = bornerEchelle(Math.max(echelleMin, actuelle));
  return { echelle, x: vueL / 2 - (carte.x + carte.largeur / 2) * echelle, y: vueH / 2 - (carte.y + carte.hauteur / 2) * echelle };
}

/** Change l'échelle en gardant fixe le point (px, py) de la vue. */
export function zoomerAutour(t: Transformation, facteur: number, px: number, py: number): Transformation {
  const echelle = bornerEchelle(t.echelle * facteur);
  const f = echelle / t.echelle;
  return { echelle, x: px - (px - t.x) * f, y: py - (py - t.y) * f };
}
