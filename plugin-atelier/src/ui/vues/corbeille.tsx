/**
 * Corbeille (humain seulement) : les tâches, documents de connaissances et prospects supprimés restent
 * ici 30 jours. « Restaurer » remet l'élément comme avant ; « Vider la corbeille » supprime
 * définitivement les documents et les prospects, après une confirmation explicite.
 */
import { useCallback, useEffect, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import { Bouton, Chargement, EnTete, EtatErreur, Horodatage, Pastille, Section, Vide } from "../composants.js";
import { classerErreur } from "../format.js";
import { appelRoute } from "../routes-prospection.js";

type TypeElement = "tache" | "document" | "prospect";

interface LigneCorbeille {
  id: string;
  type: TypeElement;
  typeLibelle: string;
  elementId: string;
  titre: string;
  supprimePar: string;
  supprimeLe: string;
  purgePrevueLe: string;
  joursRestants: number;
}
interface DonneesCorbeille {
  delaiPurgeJours: number;
  elements: LigneCorbeille[];
  purges: number;
}

export function VueCorbeille() {
  const { companyId } = useHostContext();
  const [etat, setEtat] = useState<{ data: DonneesCorbeille | null; erreur: unknown; chargement: boolean }>({ data: null, erreur: null, chargement: true });
  const [version, setVersion] = useState(0);
  const [confirmation, setConfirmation] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ ton: "ok" | "erreur"; texte: string } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    appelRoute<DonneesCorbeille>("GET", `/corbeille?companyId=${encodeURIComponent(companyId)}`)
      .then((data) => !annule && setEtat({ data, erreur: null, chargement: false }))
      .catch((erreur: unknown) => !annule && setEtat({ data: null, erreur, chargement: false }));
    return () => {
      annule = true;
    };
  }, [companyId, version]);

  const recharger = useCallback(() => setVersion((v) => v + 1), []);

  async function restaurer(ligne: LigneCorbeille) {
    if (!companyId || enCours) return;
    setEnCours(ligne.id);
    setRetour(null);
    try {
      await appelRoute("POST", "/corbeille/restauration", { companyId, type: ligne.type, id: ligne.elementId });
      setRetour({ ton: "ok", texte: `« ${ligne.titre} » est restauré.` });
      recharger();
    } catch (e) {
      setRetour({ ton: "erreur", texte: classerErreur(e).message });
    } finally {
      setEnCours(null);
    }
  }

  async function vider() {
    if (!companyId || enCours) return;
    setEnCours("vider");
    setRetour(null);
    try {
      await appelRoute("POST", "/corbeille/vidage", { companyId, confirmer: true });
      setConfirmation(false);
      setRetour({ ton: "ok", texte: "La corbeille est vide." });
      recharger();
    } catch (e) {
      setRetour({ ton: "erreur", texte: classerErreur(e).message });
    } finally {
      setEnCours(null);
    }
  }

  const elements = etat.data?.elements ?? [];

  return (
    <>
      <EnTete
        titre="Corbeille"
        description={`Ce que vous supprimez reste ici ${etat.data?.delaiPurgeJours ?? 30} jours : vous pouvez le restaurer. Passé ce délai, les documents et les prospects sont supprimés pour de bon.`}
      />
      <Section titre="Éléments supprimés" id="corbeille-liste">
        {etat.erreur ? <EtatErreur erreur={etat.erreur} onReessayer={recharger} contexte="la corbeille" /> : null}
        {etat.chargement && !etat.data ? <Chargement libelle="Chargement de la corbeille" /> : null}
        {retour ? (
          <p role={retour.ton === "erreur" ? "alert" : "status"} className={retour.ton === "erreur" ? "atl-erreur" : "atl-succes"}>
            {retour.texte}
          </p>
        ) : null}
        {etat.data && elements.length === 0 ? <Vide titre="La corbeille est vide.">Les tâches, documents et prospects que vous supprimez apparaissent ici.</Vide> : null}
        {elements.length > 0 ? (
          <>
            <div className="atl-table-cadre">
              <table className="atl-table">
                <thead>
                  <tr>
                    <th scope="col">Élément</th>
                    <th scope="col">Type</th>
                    <th scope="col">Supprimé</th>
                    <th scope="col">Suppression définitive</th>
                    <th scope="col">
                      <span className="atl-sr">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {elements.map((l) => (
                    <tr key={l.id}>
                      <th scope="row">{l.titre}</th>
                      <td data-libelle="Type">{l.typeLibelle}</td>
                      <td data-libelle="Supprimé">
                        <Horodatage iso={l.supprimeLe} seulementDate />
                      </td>
                      <td data-libelle="Suppression définitive">
                        {l.type === "tache" ? (
                          <span className="atl-attenue">Reste annulée, hors de la corbeille</span>
                        ) : (
                          <>
                            <Horodatage iso={l.purgePrevueLe} seulementDate />
                            <Pastille ton={l.joursRestants <= 3 ? "attention" : "neutre"}>{l.joursRestants <= 1 ? "Dans 1 jour ou moins" : `Dans ${l.joursRestants} jours`}</Pastille>
                          </>
                        )}
                      </td>
                      <td data-libelle="Actions">
                        <Bouton variante="secondaire" enCours={enCours === l.id} onClick={() => void restaurer(l)}>
                          Restaurer
                        </Bouton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {confirmation ? (
              <div className="atl-encart atl-confirmation" data-ton="danger" role="group" aria-label="Confirmation du vidage de la corbeille">
                <p className="atl-encart-titre">Vider la corbeille ?</p>
                <p>Les documents et les prospects listés ci-dessus seront supprimés définitivement, avec leurs versions, leurs passages et leurs scores. Les tâches restent annulées. Cette action est journalisée et ne peut pas être annulée.</p>
                <div className="atl-actions">
                  <Bouton variante="danger" enCours={enCours === "vider"} onClick={() => void vider()}>
                    Supprimer définitivement
                  </Bouton>
                  <Bouton variante="discret" onClick={() => setConfirmation(false)}>
                    Garder la corbeille
                  </Bouton>
                </div>
              </div>
            ) : (
              <div className="atl-actions">
                <Bouton variante="danger" onClick={() => setConfirmation(true)}>
                  Vider la corbeille
                </Bouton>
              </div>
            )}
          </>
        ) : null}
      </Section>
    </>
  );
}
