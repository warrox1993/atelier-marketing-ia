/**
 * Onglet « Tableau de direction » (rubrique Marketing) : le bureau Marketing vu par un décideur. Entonnoir de
 * prospection, coût de l'IA, missions, décisions humaines, contenus, captation et e-mailing, tous comparés au mois
 * précédent, puis la liste de ce qu'il faudrait connecter pour mesurer davantage. Les chiffres viennent des routes
 * `rapport.mensuel` et `tableau.direction` ; les calculs sont ceux du module pur `tableau-direction.ts`.
 * Règle : une source absente s'écrit « non mesuré » ou « connexion à faire », jamais un chiffre inventé.
 */
import { useMemo, useState } from "react";
import { Chargement, EnTete, EtatErreur, LienHote, Section } from "../composants.js";
import { Barres, Entonnoir, lignesAgents, lignesPhases, ListeSources, TableIndicateurs } from "../composants/tableau-direction.js";
import { euros, nombre } from "../format.js";
import { chemin } from "../route.js";
import { STYLES_RAPPORT } from "../styles-rapport.js";
import { STYLES_TABLEAU } from "../styles-tableau.js";
import { useTableauDirection } from "../tableau-lecture.js";
import type { TableauDirection } from "../tableau-direction.js";
import { libelleMois, moisProposes } from "./rapport.js";

export function CorpsTableau({ t }: { t: TableauDirection }) {
  const abonnement = t.couts.total.valeur === 0 && (t.couts.jetons.valeur ?? 0) > 0;
  const sansMission = t.couts.sansMissionCentimes;
  const missionsLignes = t.couts.parMission.map((m) => ({ cle: m.libelle, libelle: m.libelle, valeur: abonnement ? m.jetons : m.coutCentimes, texte: abonnement ? `${nombre(m.jetons)} jetons` : euros(m.coutCentimes), detail: abonnement ? null : `${nombre(m.jetons)} jetons` }));
  return (
    <>
      <p className="atl-td-lecture">
        <i className="atl-td-cle-barre" aria-hidden="true" /> Barre : ce mois-ci. <i className="atl-td-cle-repere" aria-hidden="true" /> Trait : le mois précédent ({libelleMois(t.moisPrecedent)}), sur la même échelle.
      </p>
      <Section titre="De la recherche au client gagné">
        <Entonnoir etapes={t.entonnoir} />
      </Section>
      <div className="atl-td-grille">
        <Section titre="Coût de l'IA">
          <TableIndicateurs compact titre="Coût de l'IA" indicateurs={[t.couts.total, t.couts.jetons, t.couts.parProspectQualifie]} />
          <h3 className="atl-h3">Par agent</h3>
          <Barres titre="Coût par agent" lignes={lignesAgents(t.couts.parAgent, abonnement)} vide="Aucun coût déclaré ce mois : non mesuré." />
          <h3 className="atl-h3">Par mission</h3>
          <Barres titre="Coût par mission" lignes={missionsLignes} vide="Aucune dépense rattachée à une mission ce mois : non mesuré." />
          {sansMission !== null && sansMission > 0 ? <p className="atl-rapport-note">Hors mission (sans tâche rattachée) : {euros(sansMission)}.</p> : null}
        </Section>
        <Section titre="Missions">
          <TableIndicateurs compact titre="Missions" indicateurs={[t.missions.enCours, t.missions.terminees, t.missions.dureeMoyenne]} />
          <h3 className="atl-h3">Délai moyen par phase</h3>
          {t.missions.phasesMesurees ? (
            <Barres titre="Délai moyen par phase" lignes={lignesPhases(t.missions.phases)} vide="" />
          ) : (
            <p className="atl-td-vide">Non mesuré : aucune phase de mission n'est terminée sur ce mois.</p>
          )}
        </Section>
        <Section titre="Décisions humaines">
          <TableIndicateurs compact titre="Décisions humaines" indicateurs={[t.decisions.enAttente, t.decisions.delaiMoyen, t.decisions.delaiMedian]} />
          <p className="atl-rapport-note">Délai : de la mise sous porte du livrable à la décision.</p>
        </Section>
        <Section titre="Contenus">
          <TableIndicateurs compact titre="Contenus" indicateurs={t.contenus} />
        </Section>
      </div>
      <Section titre="Captation et e-mailing">
        <TableIndicateurs compact titre="Captation et e-mailing" indicateurs={t.captation} />
      </Section>
      <Section titre="Ce qu'il faudrait connecter pour mesurer davantage">
        <ListeSources sources={t.sources} />
      </Section>
    </>
  );
}

export function VueTableau() {
  const mois = useMemo(() => moisProposes(), []);
  const [choisi, setChoisi] = useState(mois[0]!);
  const { lecture, recharger } = useTableauDirection(choisi);
  return (
    <>
      <style href="atelier-rapport" precedence="default">
        {STYLES_RAPPORT}
      </style>
      <style href="atelier-tableau" precedence="default">
        {STYLES_TABLEAU}
      </style>
      <EnTete titre="Tableau de direction" description="Le bureau Marketing en un coup d'œil, comparé au mois précédent. Chaque chiffre a sa source ; ce qui n'est pas mesuré est écrit comme tel." />
      <div className="atl-td-commandes">
        <label>
          Mois
          <select value={choisi} onChange={(e) => setChoisi(e.target.value)}>
            {mois.map((m) => (
              <option key={m} value={m}>
                {libelleMois(m)}
              </option>
            ))}
          </select>
        </label>
        <LienHote vers={chemin("rapport")}>Rapport du mois (à imprimer ou enregistrer en PDF)</LienHote>
      </div>
      {lecture.etat === "chargement" ? <Chargement libelle="Chargement du tableau de direction" /> : null}
      {lecture.etat === "erreur" ? <EtatErreur erreur={lecture.erreur} onReessayer={recharger} contexte="le tableau de direction" /> : null}
      {lecture.etat === "pret" ? <CorpsTableau t={lecture.tableau} /> : null}
    </>
  );
}
