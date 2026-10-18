/**
 * Matrice des échanges de l'organigramme : tableau services x services (lignes = « De », la source ; colonnes = « Vers »,
 * la cible), une case = nombre de liaisons métier, repère « A » si l'une exige l'approbation humaine. En-têtes collants
 * dans un conteneur défilant, survol et focus en croix, totaux par ligne et par colonne, détail des échanges de la paire
 * choisie. Sur téléphone (640 px et moins) : pas de tableau, une liste « service → partenaires ».
 *
 * Composant autonome : il ne lit que ses propriétés (services, flux bruts de `services.flux`, case choisie) ; le réseau des
 * coordinateurs n'est jamais compté (`fluxMetier`). Le rendu ne dépend que du nombre de services.
 */
import { memo, useCallback, useMemo, useState, type FocusEvent, type MouseEvent } from "react";
import { fluxMetier, matriceEchanges, objetsDuFlux, type CaseMatrice, type FluxBrut, type Matrice, type ServiceCarte } from "./organigramme-flux.js";
import { STYLES_ORGANIGRAMME_MATRICE } from "./styles-organigramme-matrice.js";
import { useTelephone } from "./telephone.js";

export interface PropsMatriceEchanges {
  services: ServiceCarte[];
  flux: FluxBrut[];
  /** Paire choisie (slugs), ou rien. */
  caseChoisie?: { source: string; cible: string } | null;
  choisirCase: (source: string, cible: string) => void;
  ouvrirService: (slug: string) => void;
}

const MENTION_COORDINATEURS = "Le réseau des coordinateurs (tous reliés entre eux) n'est pas compté ici.";
const PALIERS = 4;

const echanges = (n: number) => `${n} échange${n > 1 ? "s" : ""}`;

/** Palier d'intensité 1 à 4, proportionnel au nombre ; référence minimale de 4 pour qu'un seul échange reste pâle. */
const palierDe = (n: number, max: number): number => Math.min(PALIERS, Math.max(1, Math.ceil((PALIERS * n) / Math.max(max, PALIERS))));

const etiquetteCase = (source: string, cible: string, c: Pick<CaseMatrice, "nombre" | "approbation">) =>
  `De ${source} vers ${cible} : ${echanges(c.nombre)}${c.approbation ? ", approbation requise" : ""}`;

// ---------------------------------------------------------------------------------------------------------------
// Détail des échanges d'une paire
// ---------------------------------------------------------------------------------------------------------------

function DetailPaire({ source, cible, c, titreNiveau = 3 }: { source: string; cible: string; c: CaseMatrice | null; titreNiveau?: 3 | 4 }) {
  const Titre = `h${titreNiveau}` as "h3" | "h4";
  return (
    <section className="atl-mx-detail" aria-live="polite" data-testid="detail-paire">
      <Titre>{`De ${source} vers ${cible}`}</Titre>
      {!c || c.nombre === 0 ? (
        <p className="atl-mx-detail-aide">{`Aucun échange métier de ${source} vers ${cible}.`}</p>
      ) : (
        <ul className="atl-mx-echanges">
          {c.flux.flatMap((f, k) =>
            objetsDuFlux(f).map((objet, m) => (
              <li key={`${k}-${m}`}>
                <span>{objet}</span>
                <span className="atl-mx-echange-sens">{`Sens : ${source} demande à ${cible}`}</span>
                <span className="atl-mx-echange-approbation">{f.approbationHumaine ? "Approbation humaine requise" : "Sans approbation humaine"}</span>
              </li>
            )),
          )}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Bureau : le tableau
// ---------------------------------------------------------------------------------------------------------------

interface PropsCase {
  i: number;
  j: number;
  nombre: number;
  approbation: boolean;
  palier: number;
  croise: boolean;
  choisie: boolean;
  etiquette: string;
}

/** Une case ; mémorisée pour que le survol ne redessine que les cases dont l'état change (60 services = 3 600 cases). */
const CaseTd = memo(function CaseTd({ i, j, nombre, approbation, palier, croise, choisie, etiquette }: PropsCase) {
  if (i === j) return <td className="atl-mx-case" data-diagonale="" data-i={i} data-j={j} />;
  if (nombre === 0) return <td className="atl-mx-case" data-i={i} data-j={j} {...(croise ? { "data-croise": "" } : {})} />;
  return (
    <td className="atl-mx-case" data-i={i} data-j={j} data-palier={palier} {...(croise ? { "data-croise": "" } : {})}>
      <button type="button" className="atl-mx-bouton" data-i={i} data-j={j} aria-label={etiquette} aria-pressed={choisie}>
        {nombre}
        {approbation ? <span className="atl-mx-a" aria-hidden="true">A</span> : null}
      </button>
    </td>
  );
});

function TableauMatrice({ m, max, caseChoisie, choisirCase, ouvrirService }: { m: Matrice; max: number; caseChoisie: { i: number; j: number } | null; choisirCase: PropsMatriceEchanges["choisirCase"]; ouvrirService: PropsMatriceEchanges["ouvrirService"] }) {
  const [croix, setCroix] = useState<{ i: number; j: number } | null>(null);
  const place = useCallback((cible: EventTarget | null) => {
    const el = (cible as Element | null)?.closest?.("[data-i],[data-j]") as HTMLElement | null;
    if (!el) return;
    const i = el.dataset.i === undefined ? -1 : Number(el.dataset.i);
    const j = el.dataset.j === undefined ? -1 : Number(el.dataset.j);
    setCroix((a) => (a && a.i === i && a.j === j ? a : { i, j }));
  }, []);
  const clic = useCallback(
    (e: MouseEvent) => {
      const b = (e.target as Element).closest("button");
      if (!b) return;
      if (b.dataset.slug) return ouvrirService(b.dataset.slug);
      if (b.dataset.i !== undefined && b.dataset.j !== undefined) choisirCase(m.ordre[Number(b.dataset.i)]!, m.ordre[Number(b.dataset.j)]!);
    },
    [m, choisirCase, ouvrirService],
  );
  const total = m.totalLigne.reduce((a, b) => a + b, 0);

  return (
    <div className="atl-mx-defile" tabIndex={0} role="region" aria-label="Matrice des échanges, défilante">
      <table
        className="atl-mx-table"
        onClick={clic}
        onMouseOver={(e: MouseEvent) => place(e.target)}
        onMouseLeave={() => setCroix(null)}
        onFocus={(e: FocusEvent) => place(e.target)}
        onBlur={() => setCroix(null)}
      >
        <caption>Matrice des échanges entre services : chaque ligne est le service qui demande (De), chaque colonne le service sollicité (Vers).</caption>
        <thead>
          <tr>
            <th scope="col" className="atl-mx-coin">De (lignes), vers (colonnes)</th>
            {m.ordre.map((slug, j) => (
              <th key={slug} scope="col" {...(croix?.j === j ? { "data-croise": "" } : {})}>
                <button type="button" className="atl-mx-nom atl-mx-nom-colonne" data-slug={slug} data-j={j} title={m.noms[j]} aria-label={`Ouvrir le service ${m.noms[j]} (cible)`}>
                  {m.noms[j]}
                </button>
              </th>
            ))}
            <th scope="col"><span className="atl-mx-total-tete">Total envoyé</span></th>
          </tr>
        </thead>
        <tbody>
          {m.ordre.map((slug, i) => (
            <tr key={slug}>
              <th scope="row" {...(croix?.i === i ? { "data-croise": "" } : {})}>
                <button type="button" className="atl-mx-nom" data-slug={slug} data-i={i} title={m.noms[i]} aria-label={`Ouvrir le service ${m.noms[i]} (source)`}>
                  {m.noms[i]}
                </button>
              </th>
              {m.ordre.map((cible, j) => {
                const c = m.cases[i]![j]!;
                return (
                  <CaseTd
                    key={cible}
                    i={i}
                    j={j}
                    nombre={c.nombre}
                    approbation={c.approbation}
                    palier={c.nombre > 0 ? palierDe(c.nombre, max) : 0}
                    croise={croix !== null && (croix.i === i || croix.j === j)}
                    choisie={caseChoisie?.i === i && caseChoisie?.j === j}
                    etiquette={c.nombre > 0 ? etiquetteCase(m.noms[i]!, m.noms[j]!, c) : ""}
                  />
                );
              })}
              <td className="atl-mx-total">{m.totalLigne[i]}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total reçu</th>
            {m.ordre.map((slug, j) => (
              <td key={slug} className="atl-mx-total">{m.totalColonne[j]}</td>
            ))}
            <td className="atl-mx-total">{total}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Téléphone : liste « service → partenaires »
// ---------------------------------------------------------------------------------------------------------------

function BoutonPartenaire({ nom, c, source, cible, max, choisie, choisirCase, sourceNom, cibleNom }: { nom: string; c: CaseMatrice; source: string; cible: string; max: number; choisie: boolean; choisirCase: PropsMatriceEchanges["choisirCase"]; sourceNom: string; cibleNom: string }) {
  return (
    <button type="button" className="atl-mx-partenaire" data-palier={palierDe(c.nombre, max)} aria-pressed={choisie} aria-label={etiquetteCase(sourceNom, cibleNom, c)} onClick={() => choisirCase(source, cible)}>
      <span>{nom}</span>
      <span className="atl-mx-partenaire-compte">
        {echanges(c.nombre)}
        {c.approbation ? <span className="atl-mx-a" aria-hidden="true">A</span> : null}
      </span>
    </button>
  );
}

function ListeTelephone({ m, max, choisie, choisirCase, ouvrirService }: { m: Matrice; max: number; choisie: { i: number; j: number } | null; choisirCase: PropsMatriceEchanges["choisirCase"]; ouvrirService: PropsMatriceEchanges["ouvrirService"] }) {
  return (
    <ul className="atl-mx-tel" aria-label="Échanges par service">
      {m.ordre.map((slug, i) => {
        const sortants = m.ordre.map((_, j) => j).filter((j) => m.cases[i]![j]!.nombre > 0).sort((a, b) => m.cases[i]![b]!.nombre - m.cases[i]![a]!.nombre);
        const entrants = m.ordre.map((_, k) => k).filter((k) => m.cases[k]![i]!.nombre > 0).sort((a, b) => m.cases[b]![i]!.nombre - m.cases[a]![i]!.nombre);
        const ouvert = choisie !== null && (choisie.i === i || choisie.j === i);
        return (
          <li key={slug}>
            <details className="atl-mx-service" open={ouvert || undefined}>
              <summary>
                <span>{m.noms[i]}</span>
                <span className="atl-mx-service-totaux">{`${m.totalLigne[i]} envoyés, ${m.totalColonne[i]} reçus`}</span>
              </summary>
              <div className="atl-mx-service-corps">
                <div>
                  <h3>{`${m.noms[i]} demande à`}</h3>
                  {sortants.length === 0 ? (
                    <p className="atl-mx-rien">Aucun partenaire.</p>
                  ) : (
                    <ul className="atl-mx-partenaires">
                      {sortants.map((j) => (
                        <li key={j}>
                          <BoutonPartenaire nom={m.noms[j]!} c={m.cases[i]![j]!} source={slug} cible={m.ordre[j]!} max={max} choisie={choisie?.i === i && choisie.j === j} choisirCase={choisirCase} sourceNom={m.noms[i]!} cibleNom={m.noms[j]!} />
                          {choisie?.i === i && choisie.j === j ? <DetailPaire source={m.noms[i]!} cible={m.noms[j]!} c={m.cases[i]![j]!} titreNiveau={4} /> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3>{`${m.noms[i]} reçoit de`}</h3>
                  {entrants.length === 0 ? (
                    <p className="atl-mx-rien">Aucun partenaire.</p>
                  ) : (
                    <ul className="atl-mx-partenaires">
                      {entrants.map((k) => (
                        <li key={k}>
                          <BoutonPartenaire nom={m.noms[k]!} c={m.cases[k]![i]!} source={m.ordre[k]!} cible={slug} max={max} choisie={choisie?.i === k && choisie.j === i} choisirCase={choisirCase} sourceNom={m.noms[k]!} cibleNom={m.noms[i]!} />
                          {choisie?.i === k && choisie.j === i ? <DetailPaire source={m.noms[k]!} cible={m.noms[i]!} c={m.cases[k]![i]!} titreNiveau={4} /> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button type="button" className="atl-bouton atl-mx-ouvrir" onClick={() => ouvrirService(slug)}>
                  {`Ouvrir le service ${m.noms[i]}`}
                </button>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------------------------------------------

export function MatriceEchangesVue({ services, flux, caseChoisie = null, choisirCase, ouvrirService }: PropsMatriceEchanges) {
  const telephone = useTelephone();
  const m = useMemo(() => matriceEchanges(services, fluxMetier(flux)), [services, flux]);
  const max = useMemo(() => m.cases.reduce((a, ligne) => ligne.reduce((b, c) => Math.max(b, c.nombre), a), 0), [m]);
  const choisie = useMemo(() => {
    if (!caseChoisie) return null;
    const i = m.ordre.indexOf(caseChoisie.source);
    const j = m.ordre.indexOf(caseChoisie.cible);
    return i < 0 || j < 0 ? null : { i, j };
  }, [m, caseChoisie]);
  const total = m.totalLigne.reduce((a, b) => a + b, 0);

  return (
    <section className="atl-mx" aria-label="Matrice des échanges entre services">
      <style>{STYLES_ORGANIGRAMME_MATRICE}</style>
      <div className="atl-mx-legende">
        <p>
          Chaque case donne le nombre d&apos;échanges métier que le service de la ligne (De) peut demander au service de la colonne (Vers). Plus la teinte est
          marquée, plus il y en a.
        </p>
        <p>
          <span className="atl-mx-repere" aria-hidden="true">A</span> : au moins un de ces échanges exige l&apos;approbation humaine.
        </p>
        <p>{MENTION_COORDINATEURS}</p>
      </div>

      {m.ordre.length === 0 ? (
        <p className="atl-mx-rien">Aucun service à afficher.</p>
      ) : (
        <>
          {total === 0 ? <p className="atl-mx-rien">Aucun échange métier déclaré entre ces services.</p> : null}
          {telephone ? (
            <ListeTelephone m={m} max={max} choisie={choisie} choisirCase={choisirCase} ouvrirService={ouvrirService} />
          ) : (
            <>
              <TableauMatrice m={m} max={max} caseChoisie={choisie} choisirCase={choisirCase} ouvrirService={ouvrirService} />
              {choisie ? (
                <DetailPaire source={m.noms[choisie.i]!} cible={m.noms[choisie.j]!} c={m.cases[choisie.i]![choisie.j]!} />
              ) : (
                <p className="atl-mx-detail-aide">Choisissez une case pour voir le détail des échanges de la paire.</p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
