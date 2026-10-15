/**
 * Rubrique 5 : résultats (cahier §12). Uniquement des mesures importées avec
 * période et provenance ; sinon « non mesurable » et connexions nécessaires.
 * Coûts IA toujours séparés des dépenses publicitaires.
 */
import { useState } from "react";
import type { VueResultats } from "../../contrats/ui.js";
import { EnTete, Fraicheur, Horodatage, Lecture, Pastille, Section } from "../composants.js";
import { useDonnees } from "../donnees.js";
import { dateSeule, euros, nombre } from "../format.js";
import { EngagementFaceLimite } from "../plafonds.js";
import { FiltreCampagne } from "./calendrier.js";

export function VueResultatsAtelier() {
  const [campagneId, setCampagneId] = useState("");
  const r = useDonnees<VueResultats>("atelier.resultats", campagneId ? { campagneId } : {});
  return (
    <>
      <EnTete titre="Résultats" description="Seules des mesures réellement importées sont affichées, avec leur période et leur provenance. Aucune performance n'est estimée ni inventée." />
      <Fraicheur chargeLe={r.chargeLe} actualisation={r.loading && r.data !== null} />
      <div className="atl-filtres">
        <FiltreCampagne valeur={campagneId} onChange={setCampagneId} />
      </div>
      <Lecture r={r} libelle="résultats">
        {(d) => (
          <>
            <Section titre="Mesures importées">
              {d.mesures.length === 0 ? (
                <div className="atl-encart" data-ton="neutre">
                  <p className="atl-encart-titre">Non mesurable</p>
                  <p>{d.absenceDonnees?.explication ?? "Aucune mesure importée."}</p>
                  {d.absenceDonnees?.connexionsNecessaires.length ? (
                    <>
                      <p>Connexions nécessaires pour mesurer :</p>
                      <ul className="atl-liste-compacte">
                        {d.absenceDonnees.connexionsNecessaires.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  <p className="atl-attenue">Demandes qualifiées et attribution n'apparaîtront que si elles sont importées avec leur provenance.</p>
                </div>
              ) : (
                <div className="atl-table-cadre">
                  <table className="atl-table">
                    <thead>
                      <tr>
                        <th scope="col">Indicateur</th>
                        <th scope="col" className="atl-num">Valeur</th>
                        <th scope="col">Période</th>
                        <th scope="col">Provenance</th>
                        <th scope="col">Importée le</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.mesures.map((m) => (
                        <tr key={m.id}>
                          <th scope="row" data-libelle="Indicateur">
                            {m.indicateur}
                          </th>
                          <td data-libelle="Valeur" className="atl-num">
                            {nombre(m.valeur)} {m.unite}
                          </td>
                          <td data-libelle="Période">
                            du {dateSeule(m.periodeDebut)} au {dateSeule(m.periodeFin)}
                          </td>
                          <td data-libelle="Provenance">{m.provenance}</td>
                          <td data-libelle="Importée le">
                            <Horodatage iso={m.importeLe} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
            <div className="atl-deux-colonnes">
              <Section titre="Coûts IA">
                <p className="atl-montant">
                  {euros(d.coutsIa.totalCents)} {d.coutsIa.estimation ? <Pastille ton="attention">Estimation</Pastille> : null}
                </p>
                <p className="atl-sous">{d.coutsIa.detail}</p>
                <p>
                  Ce mois : {euros(d.coutsIa.moisCents)}, budget mensuel <strong>{d.coutsIa.budgetMensuelCents === 0 ? "sans limite" : euros(d.coutsIa.budgetMensuelCents)}</strong>
                  <span className="atl-sous">Budget mensuel natif de l'entreprise (Paramètres).</span>
                </p>
              </Section>
              <Section titre="Dépenses publicitaires">
                {d.depensesPublicitaires ? (
                  <>
                    <p className="atl-montant">{euros(d.depensesPublicitaires.totalCents)}</p>
                    <p className="atl-sous">Provenance : {d.depensesPublicitaires.provenance}</p>
                  </>
                ) : (
                  <p className="atl-attenue">Aucune dépense publicitaire importée. Elles ne sont jamais mélangées aux coûts IA.</p>
                )}
                <h3 className="atl-h3">Montants engagés face au plafond</h3>
                <p className="atl-sous">Dépensé ou réservé par une approbation valide.</p>
                <p>
                  <strong>Entreprise</strong>
                </p>
                <EngagementFaceLimite plafond={d.plafondsPub.entreprise.plafondPub} engagement={d.plafondsPub.entreprise.engagementPub} />
                {d.plafondsPub.campagnes.map((c) => (
                  <div key={c.campagneId}>
                    <p>
                      <strong>{c.nom}</strong>
                    </p>
                    <EngagementFaceLimite plafond={c.plafondPub} engagement={c.engagementPub} />
                  </div>
                ))}
              </Section>
            </div>
          </>
        )}
      </Lecture>
    </>
  );
}
