/**
 * Rubrique 4 : calendrier éditorial (cahier §12). Brouillon, en revue,
 * approuvé, planifié, publié ; date PROPOSÉE distincte de la publication
 * RÉELLEMENT programmée ; dépendances ; heure de Bruxelles avec décalage.
 */
import { useMemo, useState } from "react";
import type { Campagne } from "../../contrats/campagnes.js";
import type { EntreeCalendrier } from "../../contrats/ui.js";
import { Bouton, Champ, EnTete, EtatErreur, Fraicheur, Horodatage, LienHote, Lecture, Pastille, Vide } from "../composants.js";
import { useAction, useDonnees } from "../donnees.js";
import { bruxellesVersIso, decalageBruxelles, enDate, ETATS_CALENDRIER, isoVersBruxelles, ORDRE_CALENDRIER } from "../format.js";
import { chemin } from "../route.js";

export function trierCalendrier(entrees: EntreeCalendrier[]): EntreeCalendrier[] {
  return [...entrees].sort((a, b) => {
    const da = enDate(a.publicationProgrammee ?? a.dateProposee)?.getTime() ?? null;
    const db = enDate(b.publicationProgrammee ?? b.dateProposee)?.getTime() ?? null;
    if (da !== null && db !== null) return da - db;
    if (da !== null) return -1;
    if (db !== null) return 1;
    return a.titre.localeCompare(b.titre, "fr");
  });
}

/** L'humain propose ou déplace une date (jamais une programmation réelle). */
function ProposerDate({ entree, onFait }: { entree: EntreeCalendrier; onFait(): void }) {
  const planifier = useAction("atelier.planification");
  const [valeur, setValeur] = useState(() => isoVersBruxelles(entree.dateProposee));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const iso = valeur ? bruxellesVersIso(valeur) : null;
  const raison =
    entree.etat === "publie"
      ? "Déjà publié : la date proposée ne change plus rien."
      : valeur && !iso
        ? "Heure inexistante à Bruxelles (changement d'heure) ou saisie invalide."
        : null;
  const enregistrer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      await planifier({ issueId: entree.issueId, canal: entree.canal, dateProposee: iso });
      onFait();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <details className="atl-details atl-proposer">
      <summary>{entree.dateProposee ? "Déplacer" : "Proposer une date"}</summary>
      <Champ libelle="Date proposée (heure de Bruxelles)" aide={iso ? `${decalageBruxelles(iso)} à cette date ; vide pour retirer la date.` : "Vide pour retirer la date."}>
        <input type="datetime-local" value={valeur} onChange={(e) => setValeur(e.target.value)} />
      </Champ>
      <Bouton variante="principal" enCours={enCours} raisonDesactive={raison} onClick={() => void enregistrer()}>
        Enregistrer la proposition
      </Bouton>
      {erreur ? <EtatErreur erreur={erreur} contexte="date non enregistrée" /> : null}
    </details>
  );
}

export function FiltreCampagne({ valeur, onChange }: { valeur: string; onChange(v: string): void }) {
  const r = useDonnees<Campagne[]>("atelier.campagnes");
  return (
    <Champ libelle="Campagne" className="atl-champ-ligne">
      <select value={valeur} onChange={(e) => onChange(e.target.value)} disabled={!r.data}>
        <option value="">Toutes</option>
        {(r.data ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
      </select>
    </Champ>
  );
}

export function VueCalendrier() {
  const [campagneId, setCampagneId] = useState("");
  const [etat, setEtat] = useState<string>("tous");
  const r = useDonnees<EntreeCalendrier[]>("atelier.calendrier", campagneId ? { campagneId } : {});
  const maintenant = useMemo(() => new Date(), []);
  return (
    <>
      <EnTete
        titre="Calendrier éditorial"
        description={`Heures affichées à l'heure de Bruxelles (${decalageBruxelles(maintenant)} aujourd'hui), stockées en UTC. Une date proposée n'est jamais une publication programmée.`}
      />
      <Fraicheur chargeLe={r.chargeLe} actualisation={r.loading && r.data !== null} />
      <div className="atl-filtres">
        <FiltreCampagne valeur={campagneId} onChange={setCampagneId} />
        <div className="atl-segments" role="group" aria-label="Filtrer par état">
          {(["tous", ...ORDRE_CALENDRIER] as const).map((e) => {
            const n = e === "tous" ? (r.data?.length ?? 0) : (r.data ?? []).filter((x) => x.etat === e).length;
            return (
              <button key={e} type="button" className="atl-segment" aria-pressed={etat === e} onClick={() => setEtat(e)}>
                {e === "tous" ? "Tous" : ETATS_CALENDRIER[e]?.libelle} <span className="atl-compte">{n}</span>
              </button>
            );
          })}
        </div>
      </div>
      <Lecture
        r={r}
        libelle="calendrier"
        estVide={(d) => d.length === 0}
        vide={<Vide titre="Aucun contenu planifié.">Les dates sont proposées par les agents sur les tâches de production (route de planification) ; elles apparaissent ici dès qu'elles existent.</Vide>}
      >
        {(d) => {
          const lignes = trierCalendrier(etat === "tous" ? d : d.filter((x) => x.etat === etat));
          if (lignes.length === 0) return <p className="atl-attenue">Aucun contenu dans l'état choisi.</p>;
          return (
            <div className="atl-table-cadre">
              <table className="atl-table">
                <thead>
                  <tr>
                    <th scope="col">Contenu</th>
                    <th scope="col">Canal</th>
                    <th scope="col">État</th>
                    <th scope="col">Date proposée</th>
                    <th scope="col">Publication programmée</th>
                    <th scope="col">Dépendances</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((x) => (
                    <tr key={`${x.issueId}-${x.canal}`}>
                      <th scope="row" data-libelle="Contenu">
                        <LienHote vers={chemin("contenus", x.issueId)}>{x.titre}</LienHote>
                      </th>
                      <td data-libelle="Canal">{x.canal}</td>
                      <td data-libelle="État">
                        <Pastille ton={ETATS_CALENDRIER[x.etat]?.ton}>{ETATS_CALENDRIER[x.etat]?.libelle ?? x.etat}</Pastille>
                      </td>
                      <td data-libelle="Date proposée">
                        {x.dateProposee ? (
                          <span className="atl-pile">
                            <Horodatage iso={x.dateProposee} />
                            <span className="atl-sous">proposée, {decalageBruxelles(x.dateProposee)}</span>
                          </span>
                        ) : (
                          <span className="atl-attenue">aucune</span>
                        )}
                        <ProposerDate entree={x} onFait={r.refresh} />
                      </td>
                      <td data-libelle="Publication programmée">
                        {x.publicationProgrammee ? (
                          <span className="atl-pile">
                            <Horodatage iso={x.publicationProgrammee} />
                            <span className="atl-sous">confirmée par le connecteur</span>
                          </span>
                        ) : (
                          <span className="atl-attenue">non programmée</span>
                        )}
                      </td>
                      <td data-libelle="Dépendances">{x.dependancesSatisfaites ? <Pastille ton="succes">Satisfaites</Pastille> : <Pastille ton="attention">En attente</Pastille>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </Lecture>
    </>
  );
}
