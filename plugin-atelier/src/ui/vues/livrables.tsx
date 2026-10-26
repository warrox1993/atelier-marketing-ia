/**
 * Livrables de la fabrique (humain seulement) : les 50 derniers travaux de l'entreprise courante et, pour chaque
 * fichier produit, un bouton « Télécharger ». Le fichier arrive par morceaux de 8 Mio (route du plugin en JSON),
 * son empreinte SHA-256 est vérifiée dans le navigateur, puis il est remis par un lien `download`.
 * L'adresse `/atelier/livrables/<travail>` met un travail en avant (lien posé dans le commentaire de fin de travail).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import { Bouton, Chargement, EnTete, EtatErreur, Horodatage, Pastille, Section, Vide } from "../composants.js";
import { classerErreur, type Ton } from "../format.js";
import { ErreurTelechargement, recupererLivrable, remettreAuNavigateur } from "../livrables-telechargement.js";
import { appelRoute } from "../routes-prospection.js";

interface FichierLivrable {
  fichier: string;
  typeMime: string;
  taille: number;
  telechargeable: boolean;
}
interface TravailLivrable {
  travail: string;
  etat: string;
  type: string | null;
  debut: string | null;
  fin: string | null;
  message: string | null;
  fichiers: FichierLivrable[];
}

const ETATS: Readonly<Record<string, { libelle: string; ton: Ton }>> = {
  termine: { libelle: "Terminé", ton: "succes" },
  en_cours: { libelle: "En cours", ton: "attention" },
  en_attente_gpu: { libelle: "En attente de la carte graphique", ton: "attention" },
  echec: { libelle: "Échec", ton: "danger" },
};

export function tailleLisible(octets: number): string {
  if (octets >= 1024 * 1024) return `${(octets / 1024 / 1024).toLocaleString("fr-BE", { maximumFractionDigits: 1 })} Mio`;
  if (octets >= 1024) return `${Math.round(octets / 1024)} Kio`;
  return `${octets} o`;
}

interface Reception {
  cle: string;
  recus: number;
  morceaux: number;
}

export function VueLivrables({ id }: { id: string | null }) {
  const { companyId } = useHostContext();
  const [etat, setEtat] = useState<{ travaux: TravailLivrable[] | null; erreur: unknown; chargement: boolean }>({ travaux: null, erreur: null, chargement: true });
  const [version, setVersion] = useState(0);
  const [reception, setReception] = useState<Reception | null>(null);
  const [retour, setRetour] = useState<{ ton: "ok" | "erreur"; texte: string } | null>(null);
  const choisi = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    appelRoute<{ travaux: TravailLivrable[] }>("GET", `/livrables?companyId=${encodeURIComponent(companyId)}`)
      .then((d) => !annule && setEtat({ travaux: d.travaux, erreur: null, chargement: false }))
      .catch((erreur: unknown) => !annule && setEtat({ travaux: null, erreur, chargement: false }));
    return () => {
      annule = true;
    };
  }, [companyId, version]);

  // Le travail désigné par l'adresse est amené dans la vue une fois la liste affichée.
  useEffect(() => {
    if (etat.travaux && choisi.current && typeof choisi.current.scrollIntoView === "function") choisi.current.scrollIntoView({ block: "center" });
  }, [etat.travaux, id]);

  const recharger = useCallback(() => setVersion((v) => v + 1), []);

  async function telecharger(travail: TravailLivrable, f: FichierLivrable) {
    if (!companyId || reception) return;
    const cle = `${travail.travail}/${f.fichier}`;
    setReception({ cle, recus: 0, morceaux: Math.max(1, Math.ceil(f.taille / (8 * 1024 * 1024))) });
    setRetour(null);
    try {
      const { blob, nom } = await recupererLivrable(companyId, travail.travail, f.fichier, (p) => setReception({ cle, recus: p.recus, morceaux: p.morceaux }));
      remettreAuNavigateur(blob, nom);
      setRetour({ ton: "ok", texte: `« ${nom} » est téléchargé, son empreinte est vérifiée.` });
    } catch (e) {
      setRetour({ ton: "erreur", texte: e instanceof ErreurTelechargement ? e.message : classerErreur(e).message });
    } finally {
      setReception(null);
    }
  }

  const travaux = etat.travaux ?? [];
  return (
    <>
      <EnTete
        titre="Livrables"
        description="Les documents, tableurs, présentations, vidéos et images produits par la fabrique pour votre entreprise (50 derniers travaux). Chaque fichier est vérifié par son empreinte avant d'être enregistré sur votre poste."
        actions={
          <Bouton variante="secondaire" onClick={recharger}>
            Actualiser
          </Bouton>
        }
      />
      <Section titre="Travaux récents" id="livrables-liste">
        {etat.erreur ? <EtatErreur erreur={etat.erreur} onReessayer={recharger} contexte="les livrables" /> : null}
        {etat.chargement && !etat.travaux ? <Chargement libelle="Chargement des livrables" /> : null}
        {retour ? (
          <p role={retour.ton === "erreur" ? "alert" : "status"} className={retour.ton === "erreur" ? "atl-erreur" : "atl-succes"}>
            {retour.texte}
          </p>
        ) : null}
        {etat.travaux && travaux.length === 0 ? <Vide titre="Aucun livrable pour le moment.">Les fichiers produits par la fabrique apparaissent ici dès que le travail est terminé.</Vide> : null}
        {travaux.length > 0 ? (
          <div className="atl-table-cadre">
            <table className="atl-table">
              <thead>
                <tr>
                  <th scope="col">Travail</th>
                  <th scope="col">État</th>
                  <th scope="col">Date</th>
                  <th scope="col">Fichiers</th>
                </tr>
              </thead>
              <tbody>
                {travaux.map((t) => {
                  const e = ETATS[t.etat] ?? { libelle: t.etat, ton: "neutre" as Ton };
                  const estChoisi = t.travail === id?.toLowerCase();
                  return (
                    <tr key={t.travail} data-choisi={estChoisi} ref={estChoisi ? choisi : undefined}>
                      <th scope="row">
                        {t.type ?? "Travail"}
                        <span className="atl-sous"> {t.travail.slice(0, 8)}</span>
                      </th>
                      <td data-libelle="État">
                        <Pastille ton={e.ton}>{e.libelle}</Pastille>
                        {t.message ? <span className="atl-attenue"> {t.message}</span> : null}
                      </td>
                      <td data-libelle="Date">
                        <Horodatage iso={t.fin ?? t.debut} />
                      </td>
                      <td data-libelle="Fichiers">
                        {t.fichiers.length === 0 ? (
                          <span className="atl-attenue">{t.etat === "termine" ? "Aucun fichier" : "Pas encore de fichier"}</span>
                        ) : (
                          <ul className="atl-liste-nue">
                            {t.fichiers.map((f) => {
                              const cle = `${t.travail}/${f.fichier}`;
                              const encours = reception?.cle === cle ? reception : null;
                              return (
                                <li key={f.fichier}>
                                  <span>
                                    {f.fichier} <span className="atl-sous">({tailleLisible(f.taille)})</span>
                                  </span>
                                  <Bouton
                                    variante="secondaire"
                                    enCours={encours !== null}
                                    raisonDesactive={!f.telechargeable ? "Ce fichier dépasse 600 Mio : il ne peut pas être remis par cette page." : reception && !encours ? "Un autre téléchargement est en cours." : null}
                                    onClick={() => void telecharger(t, f)}
                                  >
                                    Télécharger
                                  </Bouton>
                                  {encours ? (
                                    <div
                                      className="atl-progression"
                                      role="progressbar"
                                      aria-label={`Téléchargement de ${f.fichier}`}
                                      aria-valuemin={0}
                                      aria-valuemax={encours.morceaux}
                                      aria-valuenow={encours.recus}
                                      aria-valuetext={`${encours.recus} morceau${encours.recus > 1 ? "x" : ""} sur ${encours.morceaux}`}
                                    >
                                      <span className="atl-progression-barre" style={{ width: `${Math.round((encours.recus / encours.morceaux) * 100)}%` }} />
                                    </div>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Section>
    </>
  );
}
