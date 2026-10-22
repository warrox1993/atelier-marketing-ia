/**
 * Pièces d'affichage du tableau de direction : barres de comparaison (écran) et tables (écran et impression).
 *
 * Un graphique n'apporte rien que le texte ne dise pas : chaque rangée porte sa valeur, son état et sa variation
 * en toutes lettres ; la barre est décorative (`aria-hidden`). Une barre = ce mois ; le trait = le mois précédent,
 * sur la même échelle. Une donnée non mesurée n'a pas de barre : son état est écrit (« Non mesuré » ou
 * « Connexion à faire »), jamais un zéro.
 */
import type { ReactNode } from "react";
import { euros, nombre } from "../format.js";
import { libelleDuree, type EtapeEntonnoir, type Indicateur, type LigneAgent, type PhaseDelai, type SourceManquante, type Variation } from "../tableau-direction.js";

const MOINS = "−";

export function texteValeur(i: Pick<Indicateur, "valeur" | "unite">): string {
  if (i.valeur === null) return "";
  switch (i.unite) {
    case "euros":
      return euros(Math.round(i.valeur));
    case "heures":
      return libelleDuree(i.valeur);
    case "pourcent":
      return `${nombre(Math.round(i.valeur))} %`;
    default:
      return nombre(i.valeur);
  }
}

export const libelleEtat = (i: Pick<Indicateur, "etat">): string => (i.etat === "connexion_a_faire" ? "Connexion à faire" : "Non mesuré");

/** « +4 (+50 %) » ou « inchangé » ; « mois précédent non mesuré » sans comparaison possible. */
export function texteVariation(v: Variation | null, unite: Indicateur["unite"]): string {
  if (v === null) return "mois précédent non mesuré";
  const signe = v.ecart > 0 ? "+" : v.ecart < 0 ? MOINS : "";
  const absolu = texteValeur({ valeur: Math.abs(v.ecart), unite });
  const pct = v.pourcent === null ? "" : ` (${signe}${nombre(Math.round(Math.abs(v.pourcent)))} %)`;
  const avant = texteValeur({ valeur: v.precedent, unite });
  return v.sens === "stable" ? `inchangé (${avant} le mois précédent)` : `${signe}${absolu}${pct}, ${avant} le mois précédent`;
}

/** Valeur lisible d'un indicateur, ou son état écrit. */
export function Valeur({ i }: { i: Indicateur }) {
  return i.valeur === null ? <span className="atl-td-etat" data-etat={i.etat}>{libelleEtat(i)}</span> : <>{texteValeur(i)}</>;
}

function Piste({ valeur, precedent, max }: { valeur: number | null; precedent: number | null; max: number }) {
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / max) * 100))}%`;
  return (
    <span className="atl-td-piste" aria-hidden="true">
      {valeur !== null && max > 0 ? <span className="atl-td-barre" style={{ width: pct(valeur) }} /> : null}
      {precedent !== null && max > 0 ? <span className="atl-td-repere" style={{ left: pct(precedent) }} /> : null}
    </span>
  );
}

/** L'entonnoir : une rangée par étape, barre et repère du mois précédent sur la même échelle. */
export function Entonnoir({ etapes }: { etapes: readonly EtapeEntonnoir[] }) {
  const max = Math.max(0, ...etapes.flatMap((e) => [e.valeur ?? 0, e.variation?.precedent ?? 0]));
  return (
    <ol className="atl-td-rangees" aria-label="Entonnoir de prospection">
      {etapes.map((e) => (
        <li key={e.cle} className="atl-td-rangee" data-etat={e.etat}>
          <span className="atl-td-nom">{e.libelle}</span>
          {e.valeur === null ? (
            <span className="atl-td-piste atl-td-piste-vide">{libelleEtat(e)}</span>
          ) : (
            <Piste valeur={e.valeur} precedent={e.variation?.precedent ?? null} max={max} />
          )}
          <span className="atl-td-chiffre">
            {e.valeur === null ? <span className="atl-td-masque">{libelleEtat(e)}</span> : <strong>{texteValeur(e)}</strong>}
            {e.passage !== null ? <span className="atl-td-sous">{nombre(Math.round(e.passage))} % de l'étape précédente</span> : null}
            {e.valeur !== null ? <span className="atl-td-sous">{texteVariation(e.variation, e.unite)}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export interface LigneBarre {
  cle: string;
  libelle: string;
  valeur: number | null;
  texte: string;
  detail?: string | null;
}

/** Barres horizontales simples (un seul jeu de données), triées par l'appelant. */
export function Barres({ lignes, titre, vide }: { lignes: readonly LigneBarre[]; titre: string; vide: ReactNode }) {
  if (lignes.length === 0) return <p className="atl-td-vide">{vide}</p>;
  const max = Math.max(0, ...lignes.map((l) => l.valeur ?? 0));
  return (
    <ol className="atl-td-rangees" aria-label={titre}>
      {lignes.map((l) => (
        <li key={l.cle} className="atl-td-rangee">
          <span className="atl-td-nom">{l.libelle}</span>
          {l.valeur === null ? <span className="atl-td-piste atl-td-piste-vide" aria-hidden="true" /> : <Piste valeur={l.valeur} precedent={null} max={max} />}
          <span className="atl-td-chiffre">
            <strong>{l.valeur === null ? "Non mesuré" : l.texte}</strong>
            {l.detail ? <span className="atl-td-sous">{l.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export const lignesAgents = (agents: readonly LigneAgent[], parJetons: boolean): LigneBarre[] =>
  agents.map((a) => ({ cle: a.agent, libelle: a.agent, valeur: parJetons ? a.jetons : a.coutCentimes, texte: parJetons ? `${nombre(a.jetons)} jetons` : euros(a.coutCentimes), detail: parJetons ? null : `${nombre(a.jetons)} jetons` }));

export const lignesPhases = (phases: readonly PhaseDelai[]): LigneBarre[] =>
  phases.map((p) => ({
    cle: p.id,
    libelle: p.libelle,
    valeur: p.heures,
    texte: p.heures === null ? "" : libelleDuree(p.heures),
    detail: p.heures === null ? "aucune phase terminée ce mois" : `${p.effectif} mission${p.effectif > 1 ? "s" : ""}`,
  }));

/**
 * Table d'indicateurs : valeur, comparaison au mois précédent, source. `compact` (écran du tableau) met la source sous
 * le libellé pour tenir en demi-colonne et sur téléphone ; le rapport garde la colonne « Source » (impression).
 */
export function TableIndicateurs({ indicateurs, titre, compact = false }: { indicateurs: readonly Indicateur[]; titre: string; compact?: boolean }) {
  return (
    <table className="atl-rapport-table atl-td-table" aria-label={titre}>
      <thead>
        <tr>
          <th scope="col">Indicateur</th>
          <th scope="col" className="atl-num">Valeur</th>
          <th scope="col">Comparé au mois précédent</th>
          {compact ? null : <th scope="col">Source</th>}
        </tr>
      </thead>
      <tbody>
        {indicateurs.map((i) => (
          <tr key={i.cle}>
            <th scope="row">
              {i.libelle}
              {i.note ? <span className="atl-rapport-note">{i.note}</span> : null}
              {compact ? <span className="atl-rapport-note">Source : {i.source}</span> : null}
            </th>
            <td className="atl-num"><Valeur i={i} /></td>
            <td>{i.valeur === null ? "" : texteVariation(i.variation, i.unite)}</td>
            {compact ? null : <td>{i.source}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Les sources à connecter ou à importer pour mesurer ce qui ne l'est pas encore. */
export function ListeSources({ sources }: { sources: readonly SourceManquante[] }) {
  if (sources.length === 0) return <p className="atl-td-vide">Tout ce que le tableau sait mesurer est mesuré ce mois-ci.</p>;
  return (
    <ul className="atl-td-sources">
      {sources.map((s) => (
        <li key={s.cle}>
          <strong>{s.libelle}</strong>
          <span className="atl-rapport-note">{s.raison}</span>
          <span>{s.aConnecter}</span>
        </li>
      ))}
    </ul>
  );
}
