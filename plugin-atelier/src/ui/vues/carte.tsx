/**
 * Carte des prospects : carte SVG simple, sans tuiles ni bibliothèque externe (aucun appel réseau),
 * projection équirectangulaire bornée aux points. Les bureaux sont des carrés, les prospects des cercles
 * colorés par confiance de qualification (90 % et plus : vert, 60 à 89 % : orange, moins de 60 % : gris).
 * Un prospect dont la position n'est qu'approximative (centre d'un code postal ou d'une commune) est
 * dessiné en creux, avec un contour en tirets : la couleur n'est jamais le seul indice. Les prospects
 * sans position ne sont pas placés. Une liste textuelle sous la carte reprend tous les points.
 */
import { useEffect, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import { Chargement, EnTete, EtatErreur, LienHote, Pastille, Section, Vide } from "../composants.js";
import { nombre } from "../format.js";
import { chemin } from "../route.js";
import { appelRoute } from "../routes-prospection.js";

type Precision = "exacte" | "code_postal" | "commune";

interface PointCarte {
  id: string;
  nom: string;
  lat: number;
  lon: number;
  precision: Precision;
  confiance: number | null;
  qualifie: boolean;
}
interface EtablissementCarte {
  nom: string;
  code: string | null;
  adresse: string | null;
  lat: number;
  lon: number;
  confirme: boolean;
}
interface DonneesCarte {
  total: number;
  positionnes: number;
  sansPosition: number | null;
  tronque: boolean;
  points: PointCarte[];
  etablissements: EtablissementCarte[];
}

const LARGEUR = 800;
const HAUTEUR = 480;
const MARGE = 36;
/** Écart minimal (en degrés) pour qu'un seul point, ou des points alignés, ne donnent pas une échelle absurde. */
const ETENDUE_MIN = 0.02;

/**
 * Projection équirectangulaire bornée aux points donnés : la longitude est réduite par le cosinus de la
 * latitude moyenne pour que les distances restent justes, l'échelle est la même sur les deux axes.
 */
export function projeter(positions: ReadonlyArray<{ lat: number; lon: number }>): (p: { lat: number; lon: number }) => { x: number; y: number } {
  if (positions.length === 0) return () => ({ x: LARGEUR / 2, y: HAUTEUR / 2 });
  const lats = positions.map((p) => p.lat);
  const lons = positions.map((p) => p.lon);
  const [latMin, latMax, lonMin, lonMax] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const latC = (latMin + latMax) / 2;
  const lonC = (lonMin + lonMax) / 2;
  const cos = Math.cos((latC * Math.PI) / 180);
  const echelle = Math.min((LARGEUR - 2 * MARGE) / Math.max((lonMax - lonMin) * cos, ETENDUE_MIN), (HAUTEUR - 2 * MARGE) / Math.max(latMax - latMin, ETENDUE_MIN));
  return (p) => ({ x: LARGEUR / 2 + (p.lon - lonC) * cos * echelle, y: HAUTEUR / 2 - (p.lat - latC) * echelle });
}

/** Classe de confiance d'un point : sert à la couleur et au libellé de la légende. */
export function classeConfiance(confiance: number | null): "haute" | "moyenne" | "basse" {
  return confiance !== null && confiance >= 90 ? "haute" : confiance !== null && confiance >= 60 ? "moyenne" : "basse";
}

const LIBELLES_CLASSE = { haute: "90 % et plus", moyenne: "60 à 89 %", basse: "moins de 60 % ou non calculée" } as const;
const LIBELLES_PRECISION: Readonly<Record<Precision, string>> = { exacte: "position exacte", code_postal: "approximative, centre du code postal", commune: "approximative, centre de la commune" };

const STYLES_CARTE = `
.atl-carte { display: block; width: 100%; height: auto; max-height: 36rem; border: 1px solid var(--atl-trait); border-radius: var(--atl-rayon); background: var(--atl-surface-2); }
.atl-carte-point { stroke: var(--atl-fond); stroke-width: 1.5; }
.atl-carte-point[data-classe="haute"] { fill: var(--atl-succes); }
.atl-carte-point[data-classe="moyenne"] { fill: var(--atl-attention); }
.atl-carte-point[data-classe="basse"] { fill: var(--atl-attenue); }
.atl-carte-point[data-approx="true"] { fill-opacity: 0.35; stroke-width: 2; stroke-dasharray: 3 2; }
.atl-carte-point[data-classe="haute"][data-approx="true"] { stroke: var(--atl-succes); }
.atl-carte-point[data-classe="moyenne"][data-approx="true"] { stroke: var(--atl-attention); }
.atl-carte-point[data-classe="basse"][data-approx="true"] { stroke: var(--atl-attenue-fort); }
.atl-carte-bureau { fill: var(--atl-accent); stroke: var(--atl-fond); stroke-width: 1.5; }
.atl-carte-lien:focus-visible { outline: 2px solid var(--atl-anneau); outline-offset: 2px; }
.atl-carte-etiquette { font-size: 14px; fill: var(--atl-texte); paint-order: stroke; stroke: var(--atl-fond); stroke-width: 4px; stroke-linejoin: round; pointer-events: none; }
.atl-carte-legende { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; margin: 0.75rem 0 0; padding: 0; list-style: none; font-size: 0.8125rem; color: var(--atl-attenue-fort); }
.atl-carte-legende li { display: inline-flex; align-items: center; gap: 0.375rem; }
.atl-carte-legende svg { flex: none; }
.atl-carte-liste { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 0.25rem 1.5rem; }
.atl-carte-liste li { display: flex; flex-wrap: wrap; gap: 0.25rem 0.5rem; align-items: baseline; }
`;

/** Puce de légende : même forme et même couleur que sur la carte. */
function Puce({ forme, classe, approx = false }: { forme: "cercle" | "carre"; classe?: "haute" | "moyenne" | "basse"; approx?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      {forme === "carre" ? (
        <rect x="2" y="2" width="10" height="10" className="atl-carte-bureau" />
      ) : (
        <circle cx="7" cy="7" r="5" className="atl-carte-point" data-classe={classe} data-approx={approx ? "true" : undefined} />
      )}
    </svg>
  );
}

/** Nom du point survolé, placé près du point et gardé dans le cadre. */
function EtiquetteSurvol({ nom, x, y }: { nom: string; x: number; y: number }) {
  const adroite = x > LARGEUR - 220;
  return (
    <text className="atl-carte-etiquette" x={adroite ? x - 10 : x + 10} y={Math.max(y - 10, 18)} textAnchor={adroite ? "end" : "start"}>
      {nom}
    </text>
  );
}

export function VueCarte() {
  const { companyId } = useHostContext();
  const [etat, setEtat] = useState<{ data: DonneesCarte | null; erreur: unknown; chargement: boolean }>({ data: null, erreur: null, chargement: true });
  const [version, setVersion] = useState(0);
  const [survol, setSurvol] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    appelRoute<DonneesCarte>("GET", `/prospects/carte?companyId=${encodeURIComponent(companyId)}`)
      .then((data) => !annule && setEtat({ data, erreur: null, chargement: false }))
      .catch((erreur: unknown) => !annule && setEtat({ data: null, erreur, chargement: false }));
    return () => {
      annule = true;
    };
  }, [companyId, version]);

  const d = etat.data;
  const aPlacer = d ? [...d.points, ...d.etablissements] : [];
  const projection = projeter(aPlacer);
  const vers = chemin("prospects");
  const etiquette = survol === null ? null : (d?.points.find((p) => `p:${p.id}` === survol) ?? d?.etablissements.find((e) => `e:${e.code ?? e.nom}` === survol) ?? null);

  return (
    <>
      <style>{STYLES_CARTE}</style>
      <EnTete
        titre="Carte des prospects"
        description="Où se trouvent vos prospects par rapport à vos bureaux. La carte est dessinée ici, sans service externe. Cliquez sur un point pour ouvrir la liste des prospects."
      />
      <Section titre="Carte" id="carte-prospects">
        {etat.erreur ? <EtatErreur erreur={etat.erreur} onReessayer={() => setVersion((v) => v + 1)} contexte="la carte des prospects" /> : null}
        {etat.chargement && !d ? <Chargement libelle="Chargement de la carte" /> : null}
        {d && d.points.length === 0 ? (
          <Vide titre="Aucun prospect n'a de position connue.">
            {d.total > 0 ? `${nombre(d.total)} prospect${d.total > 1 ? "s" : ""} existent, mais aucun n'a de position : la source ne l'a pas fournie. Ils ne sont jamais placés au hasard.` : "Les prospects trouvés par la recherche d'entreprises ou par OpenStreetMap apparaîtront ici avec leur position."}
          </Vide>
        ) : null}
        {d && d.points.length > 0 ? (
          <>
            <p role="status">
              {nombre(d.positionnes)} prospect{d.positionnes > 1 ? "s" : ""} placé{d.positionnes > 1 ? "s" : ""}
              {d.sansPosition !== null && d.sansPosition > 0 ? `, ${nombre(d.sansPosition)} sans position connue (non placé${d.sansPosition > 1 ? "s" : ""})` : ""}
              {d.tronque ? ", carte limitée aux premiers résultats" : ""}.
            </p>
            <svg className="atl-carte" viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} role="img" aria-labelledby="carte-titre carte-desc">
              <title id="carte-titre">Carte des prospects et de vos bureaux</title>
              <desc id="carte-desc">{`${d.positionnes} prospects et ${d.etablissements.length} bureaux placés d'après leur position. La liste complète suit la carte.`}</desc>
              {d.etablissements.map((e) => {
                const { x, y } = projection(e);
                const cle = `e:${e.code ?? e.nom}`;
                return (
                  <g key={cle} onMouseEnter={() => setSurvol(cle)} onMouseLeave={() => setSurvol(null)}>
                    <title>{`Bureau : ${e.nom}`}</title>
                    <rect x={x - 6} y={y - 6} width="12" height="12" className="atl-carte-bureau" />
                  </g>
                );
              })}
              {d.points.map((p) => {
                const { x, y } = projection(p);
                const cle = `p:${p.id}`;
                return (
                  <LienHote key={cle} vers={vers} className="atl-carte-lien">
                    <g onMouseEnter={() => setSurvol(cle)} onMouseLeave={() => setSurvol(null)} onFocus={() => setSurvol(cle)} onBlur={() => setSurvol(null)}>
                      <title>{`${p.nom}, confiance ${p.confiance === null ? "non calculée" : `${p.confiance} %`}, ${LIBELLES_PRECISION[p.precision]}`}</title>
                      <circle cx={x} cy={y} r="6" className="atl-carte-point" data-classe={classeConfiance(p.confiance)} data-approx={p.precision === "exacte" ? undefined : "true"} />
                    </g>
                  </LienHote>
                );
              })}
              {etiquette ? <EtiquetteSurvol nom={etiquette.nom} {...projection(etiquette)} /> : null}
            </svg>
            <ul className="atl-carte-legende" aria-label="Légende de la carte">
              {(["haute", "moyenne", "basse"] as const).map((c) => (
                <li key={c}>
                  <Puce forme="cercle" classe={c} /> Confiance {LIBELLES_CLASSE[c]}
                </li>
              ))}
              <li>
                <Puce forme="cercle" classe="haute" approx /> Contour en tirets : position approximative (centre du code postal ou de la commune)
              </li>
              <li>
                <Puce forme="carre" /> Bureau (position saisie par vous)
              </li>
            </ul>
            <p className="atl-attenue">Plusieurs prospects d'un même code postal peuvent se superposer : la liste ci-dessous les distingue.</p>
          </>
        ) : null}
      </Section>
      {d && d.points.length > 0 ? (
        <Section titre="Liste des points" id="carte-liste">
          <ul className="atl-carte-liste">
            {d.points.map((p) => (
              <li key={p.id}>
                <LienHote vers={vers}>{p.nom}</LienHote>
                <Pastille ton={classeConfiance(p.confiance) === "haute" ? "succes" : classeConfiance(p.confiance) === "moyenne" ? "attention" : "neutre"}>{p.confiance === null ? "Confiance non calculée" : `Confiance ${p.confiance} %`}</Pastille>
                <span className="atl-attenue">{LIBELLES_PRECISION[p.precision]}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {d ? (
        <Section titre="Bureaux" id="carte-bureaux">
          {d.etablissements.length === 0 ? (
            <p className="atl-attenue">Aucun bureau n'a de position : elle se saisit dans la fiche du client (champ « position » de chaque établissement). Elle n'est jamais déduite des prospects.</p>
          ) : (
            <ul className="atl-carte-liste">
              {d.etablissements.map((e) => (
                <li key={e.code ?? e.nom}>
                  <strong>{e.nom}</strong>
                  {e.adresse ? <span className="atl-attenue">{e.adresse}</span> : null}
                  {e.confirme ? null : <Pastille ton="attention">Non confirmé</Pastille>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}
    </>
  );
}
