/**
 * Carte des services de l'organigramme : le Coordinateur général au centre, un nœud par service autour (anneau, deux
 * anneaux au-delà de 24 services), aucun agent dessiné. Disposition et courbes viennent de organigramme-flux.ts.
 *
 * - Au repos : seuls de très fins traits relient le général à chaque service (réseau hiérarchique). Le réseau générique des
 *   coordinateurs n'est jamais tracé (une mention fixe le rappelle).
 * - Survol ou focus d'un nœud : aperçu de ses liaisons métier en traits légers.
 * - Clic ou Entrée : sélection persistante, flèches vers chaque partenaire (sortant : trait plein, teinte info ; entrant :
 *   pointillé, teinte attention ; aller et retour décalés ; épaisseur selon le volume), partenaires mis en avant, autres
 *   nœuds atténués, panneau des liaisons. Double-clic ou bouton : ouvrir le service. Échap : désélectionner.
 * - Téléphone (640 px et moins) : liste des services, chacun avec un bouton « Voir les liens » qui déplie ses partenaires.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { nombre } from "./format.js";
import {
  courbeLiaison, dispositionAnneau, fluxMetier, ID_GENERAL, liaisonsDe, objetsDuFlux, ordonnerServices, volumeDuFlux,
  type Dimensions, type FluxBrut, type LiaisonPartenaire, type NoeudAnneau, type ServiceCarte,
} from "./organigramme-flux.js";
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

/** Tête de flèche : petit triangle plein posé sur la pointe, orienté selon l'angle de la courbe. */
function Tete({ x, y, angle, sens }: { x: number; y: number; angle: number; sens: "sortant" | "entrant" }) {
  return <path className="atl-car-tete" data-sens={sens} d="M0 0 L-10 -5 L-10 5 Z" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((angle * 180) / Math.PI).toFixed(1)})`} />;
}

// ---------------------------------------------------------------------------------------------------------------
// Carte (bureau)
// ---------------------------------------------------------------------------------------------------------------

function useTailleElement(ref: React.RefObject<HTMLElement | null>): Dimensions {
  const [taille, setTaille] = useState<Dimensions>(TAILLE_REPLI);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const lire = () => {
      const largeur = el.clientWidth;
      const hauteur = el.clientHeight;
      if (largeur > 0 && hauteur > 0) setTaille((p) => (p.largeur === largeur && p.hauteur === hauteur ? p : { largeur, hauteur }));
    };
    lire();
    if (typeof ResizeObserver === "undefined") return;
    const observateur = new ResizeObserver(lire);
    observateur.observe(el);
    return () => observateur.disconnect();
  }, [ref]);
  return taille;
}

function Legende() {
  return (
    <div className="atl-car-legende">
      <ul>
        <li>
          <span className="atl-car-trait" data-sens="sortant" aria-hidden="true" />
          Trait plein : ce que le service choisi peut demander aux autres.
        </li>
        <li>
          <span className="atl-car-trait" data-sens="entrant" aria-hidden="true" />
          Trait pointillé : ce que les autres peuvent lui demander.
        </li>
        <li>
          <span className="atl-car-trait" data-sens="hierarchie" aria-hidden="true" />
          Trait fin : rattachement au Coordinateur général.
        </li>
      </ul>
      <p>{MENTION_COORDINATEURS}</p>
    </div>
  );
}

function PanneauLiaisons({ service, liaisons, nomDe, choisir, ouvrirService, fermer }: { service: ServiceAffiche; liaisons: LiaisonPartenaire[]; nomDe: (slug: string) => string; choisir: (slug: string) => void; ouvrirService: (slug: string) => void; fermer: () => void }) {
  return (
    <>
      <div className="atl-car-panneau-tete">
        <h2 id="atl-car-panneau-titre">{service.nom}</h2>
        <button type="button" className="atl-bouton" onClick={fermer}>
          Désélectionner
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
    </>
  );
}

function CarteBureau({ services, flux, selection, choisir, ouvrirService }: PropsCarteServices) {
  const zone = useRef<HTMLDivElement | null>(null);
  const taille = useTailleElement(zone);
  const [survol, setSurvol] = useState<string | null>(null);
  const metier = useMemo(() => fluxMetier(flux), [flux]);
  const cleServices = services.map((s) => `${s.slug}|${s.estDirection ? 1 : 0}`).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ordonnes = useMemo(() => ordonnerServices(services), [cleServices]);
  const disposition = useMemo(() => dispositionAnneau(ordonnes, taille), [ordonnes, taille]);
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

  return (
    <div className="atl-car">
      <div className="atl-car-corps">
        <div className="atl-car-zone" ref={zone}>
          <div
            className="atl-car-scene"
            style={{ width: disposition.largeur, height: disposition.hauteur }}
            onClick={(e) => {
              if (e.target === e.currentTarget) choisir(null);
            }}
          >
            <svg className="atl-car-traits" width={disposition.largeur} height={disposition.hauteur} aria-hidden="true" focusable="false">
              {general
                ? disposition.noeuds
                    .filter((n) => n.genre === "service")
                    .map((n) => <line key={n.id} className="atl-car-hierarchie" x1={general.x} y1={general.y} x2={n.x} y2={n.y} />)
                : null}
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
              <div className="atl-car-general" style={{ left: general.x - general.largeur / 2, top: general.y - general.hauteur / 2, width: general.largeur, height: general.hauteur }}>
                <strong>Coordinateur général</strong>
                <span>{pluriel(services.length, "service", "services")}</span>
              </div>
            ) : null}
            {disposition.noeuds
              .filter((n) => n.genre === "service")
              .map((n) => {
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
                    title={s.nom}
                    onClick={() => choisir(estChoisi ? null : s.slug)}
                    onDoubleClick={() => ouvrirService(s.slug)}
                    onMouseEnter={() => setSurvol(s.slug)}
                    onMouseLeave={() => setSurvol((v) => (v === s.slug ? null : v))}
                    onFocus={() => setSurvol(s.slug)}
                    onBlur={() => setSurvol((v) => (v === s.slug ? null : v))}
                  >
                    <span className="atl-car-nom">{s.nom}</span>
                    <span className="atl-car-meta">
                      <span className="atl-car-agents">{texteAgents(s)}</span>
                      {s.aValider > 0 ? <span className="atl-car-traiter">À traiter</span> : null}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
        <aside className="atl-car-panneau" aria-labelledby={choisi ? "atl-car-panneau-titre" : undefined} aria-label={choisi ? undefined : "Liaisons du service"}>
          {choisi ? (
            <PanneauLiaisons service={choisi} liaisons={liaisons} nomDe={nomDe} choisir={choisir} ouvrirService={ouvrirService} fermer={() => choisir(null)} />
          ) : (
            <p className="atl-car-aide">Choisissez un service pour voir avec qui il échange : les flèches apparaissent sur la carte et le détail ici. Double-cliquez pour ouvrir ses agents.</p>
          )}
        </aside>
      </div>
      <Legende />
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
