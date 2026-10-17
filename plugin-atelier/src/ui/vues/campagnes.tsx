/**
 * Rubrique 2 : campagnes (cahier §12). Liste, détail (brief, exigences, tâches
 * natives avec statut calculé, connexions nécessaires), création depuis un
 * brief, annulation ; pause et reprise affichées désactivées avec la raison
 * donnée par le serveur.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useHostContext, useHostNavigation } from "@paperclipai/plugin-sdk/ui";
import type { Campagne, Connecteur } from "../../contrats/campagnes.js";
import type { Exigence } from "../../contrats/exigences.js";
import type { DetailCampagne, VueEquipe } from "../../contrats/ui.js";
import { Champ, Bouton, EnTete, EtatErreur, Fraicheur, Horodatage, LienHote, Lecture, ListeOuAucun, Pastille, PastilleConnexion, PastilleStatut, Section, Vide } from "../composants.js";
import { ConfirmationLot, type ElementLot } from "../decision-groupee.js";
import { useAction, useDonnees } from "../donnees.js";
import { DECISIONS_PORTE, euros, idCourt, NIVEAUX_INTEGRATION } from "../format.js";
import { creerProjetNatif } from "../hote.js";
import { ChoixPlafond, EngagementFaceLimite, libellePlafond, plafondDepuisSaisie, plafondModifie, SAISIE_PLAFOND_VIDE, saisieDepuisPlafond, type SaisiePlafond } from "../plafonds.js";
import { chemin } from "../route.js";

/** Raison renvoyée par le worker pour la pause (services.ts, « pauseNonDisponible »). */
export const RAISON_PAUSE =
  "Indisponible : l'application ne met un projet en pause que par budget et n'offre pas cette action aux extensions. Mettez en pause les agents concernés depuis leur fiche.";

export function VueCampagnes({ id }: { id: string | null }) {
  if (id === "nouvelle") return <NouvelleCampagne />;
  if (id) return <DetailCampagneVue campagneId={id} />;
  return <ListeCampagnes />;
}

function etatProjet(c: Campagne): { libelle: string; ton: "neutre" | "attention" | "info" } {
  if (c.etatProjet.archive) return { libelle: "Archivée", ton: "neutre" };
  if (c.etatProjet.enPause) return { libelle: "En pause", ton: "attention" };
  const statuts: Record<string, string> = { backlog: "En attente", planned: "Planifiée", in_progress: "En cours", completed: "Terminée", cancelled: "Annulée" };
  return { libelle: statuts[c.etatProjet.statut] ?? c.etatProjet.statut, ton: "info" };
}

function ListeCampagnes() {
  const r = useDonnees<Campagne[]>("atelier.campagnes");
  return (
    <>
      <EnTete
        titre="Campagnes"
        description="Chaque campagne est un projet du tableau de bord ; ses tâches et leur état viennent de là."
        actions={
          <LienHote vers={chemin("campagnes", "nouvelle")} className="atl-bouton">
            Nouvelle campagne
          </LienHote>
        }
      />
      <Fraicheur chargeLe={r.chargeLe} actualisation={r.loading && r.data !== null} />
      <Lecture
        r={r}
        libelle="campagnes"
        estVide={(d) => d.length === 0}
        vide={
          <Vide titre="Aucune campagne pour l'instant." action={<LienHote vers={chemin("campagnes", "nouvelle")} className="atl-bouton">Créer une campagne depuis un brief</LienHote>}>
            Une campagne part d'un brief : le coordinateur en extrait les exigences (chacune avec son titre), puis les agents produisent sous contrôle.
          </Vide>
        }
      >
        {(d) => (
          <div className="atl-table-cadre">
            <table className="atl-table">
              <thead>
                <tr>
                  <th scope="col">Campagne</th>
                  <th scope="col">État</th>
                  <th scope="col">Canaux</th>
                  <th scope="col">Plafond publicitaire</th>
                  <th scope="col">Créée le</th>
                </tr>
              </thead>
              <tbody>
                {d.map((c) => {
                  const e = etatProjet(c);
                  return (
                    <tr key={c.id}>
                      <th scope="row" data-libelle="Campagne">
                        <LienHote vers={chemin("campagnes", c.id)}>{c.nom}</LienHote>
                      </th>
                      <td data-libelle="État">
                        <Pastille ton={e.ton}>{e.libelle}</Pastille>
                      </td>
                      <td data-libelle="Canaux">
                        <ListeOuAucun valeurs={c.canaux} />
                      </td>
                      <td data-libelle="Plafond publicitaire">
                        {libellePlafond(c.plafondPub)}
                        <span className="atl-sous">{euros(c.engagementPub.engageCents)} engagés</span>
                      </td>
                      <td data-libelle="Créée le">
                        <Horodatage iso={c.creeLe} seulementDate />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Lecture>
    </>
  );
}

function DetailCampagneVue({ campagneId }: { campagneId: string }) {
  const r = useDonnees<DetailCampagne>("atelier.campagne", { campagneId });
  return (
    <Lecture r={r} libelle="campagne">
      {(d) => (
        <>
          <EnTete
            titre={d.campagne.nom}
            retour={<LienHote vers={chemin("campagnes")}>Toutes les campagnes</LienHote>}
            description={
              <span className="atl-pile-ligne">
                <Pastille ton={etatProjet(d.campagne).ton}>{etatProjet(d.campagne).libelle}</Pastille>
                <LienHote vers={`/projects/${d.campagne.projectId}`}>Projet dans le tableau de bord</LienHote>
              </span>
            }
          />
          <Fraicheur chargeLe={r.chargeLe} actualisation={r.loading} />
          <ActionsCampagne campagne={d.campagne} onFait={r.refresh} />
          <Section titre="Cadre">
            <dl className="atl-champs atl-champs-grille">
              <div>
                <dt>Objectifs</dt>
                <dd>{d.campagne.objectifs.length ? <ul className="atl-liste-compacte">{d.campagne.objectifs.map((o, i) => <li key={`${i}-${o}`}>{o}</li>)}</ul> : <span className="atl-attenue">non renseignés</span>}</dd>
              </div>
              <div>
                <dt>Cible</dt>
                <dd>{d.campagne.cible ?? <span className="atl-attenue">non renseignée</span>}</dd>
              </div>
              <div>
                <dt>Offre</dt>
                <dd>{d.campagne.offre ?? <span className="atl-attenue">non renseignée</span>}</dd>
              </div>
              <div>
                <dt>Canaux</dt>
                <dd><ListeOuAucun valeurs={d.campagne.canaux} /></dd>
              </div>
              <div>
                <dt>Établissements</dt>
                <dd><ListeOuAucun valeurs={d.campagne.perimetre.etablissements} /></dd>
              </div>
              <div>
                <dt>Zones</dt>
                <dd><ListeOuAucun valeurs={d.campagne.perimetre.zones} aucun="aucune" /></dd>
              </div>
              <div>
                <dt>Plafond publicitaire</dt>
                <dd>{libellePlafond(d.campagne.plafondPub)}</dd>
              </div>
              <div>
                <dt>Créée le</dt>
                <dd><Horodatage iso={d.campagne.creeLe} /></dd>
              </div>
            </dl>
          </Section>
          <PlafondCampagne campagne={d.campagne} onFait={r.refresh} />
          <Section titre="Connexions nécessaires">
            <Connexions connecteurs={d.connexionsNecessaires} />
          </Section>
          <Section titre={`Tâches (${d.taches.length})`} aide="Statut calculé à la lecture depuis l'état natif de chaque tâche ; aucune copie n'est stockée.">
            {d.taches.length === 0 ? (
              <p className="atl-attenue">Aucune tâche dans le projet de cette campagne.</p>
            ) : (
              <div className="atl-table-cadre">
                <table className="atl-table">
                  <thead>
                    <tr>
                      <th scope="col">Tâche</th>
                      <th scope="col">Statut</th>
                      <th scope="col">Contrôle automatique</th>
                      <th scope="col">Dépendances</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.taches.map((t) => (
                      <tr key={t.issueId}>
                        <th scope="row" data-libelle="Tâche">
                          <LienHote vers={t.sousPorte ? chemin("contenus", t.issueId) : `/issues/${t.identifier ?? t.issueId}`}>{t.titre}</LienHote>
                          <span className="atl-sous">{t.identifier ?? idCourt(t.issueId)}</span>
                        </th>
                        <td data-libelle="Statut">
                          <span className="atl-pile">
                            <PastilleStatut statut={t.statut} motif={t.motif} />
                            <span className="atl-sous">{t.motif}</span>
                          </span>
                        </td>
                        <td data-libelle="Contrôle automatique">
                          {t.sousPorte ? (
                            t.decisionPorte ? (
                              <Pastille ton={DECISIONS_PORTE[t.decisionPorte]?.ton}>{DECISIONS_PORTE[t.decisionPorte]?.libelle ?? t.decisionPorte}</Pastille>
                            ) : (
                              <span className="atl-attenue">sous contrôle automatique, non évalué</span>
                            )
                          ) : (
                            <span className="atl-attenue">hors contrôle automatique</span>
                          )}
                        </td>
                        <td data-libelle="Dépendances">{t.bloqueePar.length ? `${t.bloqueePar.length} non ${t.bloqueePar.length > 1 ? "résolues" : "résolue"}` : <span className="atl-attenue">aucune</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
          <Section titre="Brief d'origine" aide={d.brief ? `Version ${d.brief.version}, conservée telle quelle.` : undefined}>
            {d.brief ? <blockquote className="atl-citation">{d.brief.texteOriginal}</blockquote> : <p className="atl-attenue">Aucun brief enregistré.</p>}
          </Section>
          <Section titre={`Exigences (${d.exigences.length})`} aide="Extraites du brief par le coordinateur ; seule une décision humaine peut exclure une exigence obligatoire.">
            {d.exigences.length === 0 ? (
              <p className="atl-attenue">Pas encore d'exigence : le coordinateur ne les a pas encore enregistrées.</p>
            ) : (
              <ExigencesListe exigences={d.exigences} onFait={r.refresh} />
            )}
          </Section>
        </>
      )}
    </Lecture>
  );
}

function Connexions({ connecteurs }: { connecteurs: Connecteur[] }) {
  if (connecteurs.length === 0) {
    return (
      <p className="atl-attenue">
        Aucune connexion supplémentaire requise par cette campagne.
      </p>
    );
  }
  return (
    <ul className="atl-liste">
      {connecteurs.map((c) => (
        <li key={c.cle} className="atl-connecteur">
          <span>
            <strong>{c.nom}</strong> <PastilleConnexion etat={c.etat} />
          </span>
          <span className="atl-sous">
            {NIVEAUX_INTEGRATION[c.niveau] ?? c.niveau}. {c.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Liste des exigences avec décision groupée sur les demandes d'exclusion : on coche, puis
 * « Autoriser la sélection (N) » ou « Refuser la sélection (N) » ouvre un récapitulatif et une
 * confirmation unique. Chaque exigence est ensuite décidée avec la même action que la décision
 * unitaire ; une erreur sur l'une n'arrête pas les autres.
 */
function ExigencesListe({ exigences, onFait }: { exigences: Exigence[]; onFait(): void }) {
  const exclure = useAction("atelier.exigence.exclusion");
  const demandees = exigences.filter((e) => e.exclusion.etat === "demandee");
  const [cochees, setCochees] = useState<ReadonlySet<string>>(new Set());
  const [lot, setLot] = useState<{ decision: "autoriser" | "refuser"; elements: ElementLot[] } | null>(null);
  const [justification, setJustification] = useState("");
  // Seules les demandes encore en attente restent cochées (une demande traitée disparaît de la sélection).
  const selection = demandees.filter((e) => cochees.has(e.id));
  const n = selection.length;
  const bascule = (id: string) =>
    setCochees((c) => {
      const suite = new Set(c);
      if (!suite.delete(id)) suite.add(id);
      return suite;
    });
  const touteCochee = demandees.length > 0 && n === demandees.length;
  const raisonSelection = n === 0 ? "Cochez au moins une demande d'exclusion." : lot ? "Une confirmation est déjà ouverte." : null;
  const ouvrir = (decision: "autoriser" | "refuser") => setLot({ decision, elements: selection.map((e) => ({ id: e.id, titre: e.interpretation })) });
  const raisonJustification = justification.trim().length < 10 ? "Justification d'au moins 10 caractères requise." : null;
  return (
    <>
      {demandees.length > 0 ? (
        <div className="atl-barre-actions" role="group" aria-label="Décision groupée sur les demandes d'exclusion">
          <label>
            <input
              type="checkbox"
              checked={touteCochee}
              onChange={() => setCochees(touteCochee ? new Set() : new Set(demandees.map((e) => e.id)))}
            />{" "}
            Toutes les demandes d'exclusion ({demandees.length})
          </label>
          <Bouton variante="principal" raisonDesactive={raisonSelection} onClick={() => ouvrir("autoriser")}>
            {`Autoriser la sélection (${n})`}
          </Bouton>
          <Bouton raisonDesactive={raisonSelection} onClick={() => ouvrir("refuser")}>
            {`Refuser la sélection (${n})`}
          </Bouton>
        </div>
      ) : null}
      {/* Hors du bloc des demandes : le bilan reste affiché jusqu'à « Fermer », même quand plus aucune demande n'est en attente. */}
      {lot ? (
        <ConfirmationLot
          titre={`${lot.decision === "autoriser" ? "Autoriser" : "Refuser"} l'exclusion de ${lot.elements.length > 1 ? `ces ${lot.elements.length} exigences` : "cette exigence"} ?`}
          elements={lot.elements}
          effet={
            lot.decision === "autoriser"
              ? "L'exclusion demandée par l'agent est acceptée pour chacune de ces exigences."
              : "Ces exigences restent à prouver : l'exclusion demandée par l'agent est refusée."
          }
          libelleConfirmer={`${lot.decision === "autoriser" ? "Confirmer l'autorisation" : "Confirmer le refus"} (${lot.elements.length})`}
          variante={lot.decision === "autoriser" ? "principal" : "danger"}
          raisonDesactive={raisonJustification}
          traiter={async (element) => {
            await exclure({ exigenceId: element.id, decision: lot.decision, justification });
          }}
          onBilan={(b) => {
            const faits = new Set(b.reussis.map((r) => r.element.id));
            setCochees((c) => new Set([...c].filter((id) => !faits.has(id))));
            onFait();
          }}
          onFermer={() => {
            setLot(null);
            setJustification("");
          }}
        >
          <Champ libelle="Votre justification commune">
            <textarea value={justification} onChange={(ev) => setJustification(ev.target.value)} rows={2} maxLength={2000} />
          </Champ>
        </ConfirmationLot>
      ) : null}
      <ul className="atl-exigences">
        {exigences.map((e) => (
          <ExigenceLigne key={e.id} exigence={e} onFait={onFait} coche={e.exclusion.etat === "demandee" ? cochees.has(e.id) : undefined} onCoche={() => bascule(e.id)} />
        ))}
      </ul>
    </>
  );
}

function ExigenceLigne({ exigence: e, onFait, coche, onCoche }: { exigence: Exigence; onFait(): void; coche?: boolean; onCoche?(): void }) {
  const exclure = useAction("atelier.exigence.exclusion");
  const [justification, setJustification] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const decider = async (decision: "autoriser" | "refuser") => {
    setEnCours(true);
    setErreur(null);
    try {
      await exclure({ exigenceId: e.id, decision, justification });
      setJustification("");
      onFait();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };
  const raison = justification.trim().length < 10 ? "Justification d'au moins 10 caractères requise." : null;
  return (
    <li className="atl-exigence">
      <div className="atl-exigence-tete">
        {coche !== undefined ? (
          <input type="checkbox" checked={coche} onChange={onCoche} aria-label={`Sélectionner l'exigence : ${e.interpretation}`} />
        ) : null}
        <strong>{e.interpretation}</strong>
        {e.obligatoire ? <Pastille ton="info">Obligatoire</Pastille> : <Pastille>Facultative</Pastille>}
        {e.exclusion.etat !== "aucune" ? (
          <Pastille ton={e.exclusion.etat === "autorisee" ? "neutre" : e.exclusion.etat === "demandee" ? "attention" : "neutre"}>
            Exclusion {e.exclusion.etat === "demandee" ? "demandée" : e.exclusion.etat === "autorisee" ? "autorisée" : "refusée"}
          </Pastille>
        ) : null}
      </div>
      <p className="atl-sous">
        Repère <code>{e.code}</code>. Texte du brief : « {e.texteOriginal} »</p>
      {e.elementsAttendus.length ? <p className="atl-sous">Éléments à prouver un par un : {e.elementsAttendus.join(", ")}</p> : null}
      {e.criteres.length ? <p className="atl-sous">Critères : {e.criteres.join(" ; ")}</p> : null}
      {e.exclusion.etat === "demandee" ? (
        <div className="atl-encart" data-ton="attention">
          <p className="atl-encart-titre">Un agent demande d'exclure cette exigence</p>
          {e.exclusion.justification ? <p>Motif de l'agent : {e.exclusion.justification}</p> : null}
          <Champ libelle="Votre justification">
            <textarea value={justification} onChange={(ev) => setJustification(ev.target.value)} rows={2} maxLength={2000} />
          </Champ>
          <div className="atl-actions">
            <Bouton variante="principal" raisonDesactive={raison} enCours={enCours} onClick={() => void decider("refuser")}>
              Refuser l'exclusion
            </Bouton>
            <Bouton raisonDesactive={raison} enCours={enCours} onClick={() => void decider("autoriser")}>
              Autoriser l'exclusion
            </Bouton>
          </div>
          {erreur ? <EtatErreur erreur={erreur} /> : null}
        </div>
      ) : null}
    </li>
  );
}

function ActionsCampagne({ campagne, onFait }: { campagne: Campagne; onFait(): void }) {
  const annuler = useAction("atelier.campagne.annuler");
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [fait, setFait] = useState(false);
  const termine = campagne.etatProjet.archive || ["completed", "cancelled"].includes(campagne.etatProjet.statut);
  const zoneBouton = useRef<HTMLSpanElement>(null);
  const zoneMotif = useRef<HTMLTextAreaElement>(null);
  // Panneau de confirmation : le focus va au motif à l'ouverture ; Échap le ferme
  // et rend le focus au bouton qui l'a ouvert (revue du lot C).
  useEffect(() => {
    if (ouvert) zoneMotif.current?.focus();
  }, [ouvert]);
  const fermer = () => {
    setOuvert(false);
    zoneBouton.current?.querySelector("button")?.focus();
  };
  const confirmer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      await annuler({ campagneId: campagne.id, motif: motif.trim() });
      setFait(true);
      setOuvert(false);
      onFait();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <div className="atl-barre-actions" role="group" aria-label="Actions sur la campagne">
      <Bouton raisonDesactive={RAISON_PAUSE}>Mettre en pause</Bouton>
      <Bouton raisonDesactive="Indisponible pour la même raison que la pause.">Reprendre</Bouton>
      <span ref={zoneBouton}>
        <Bouton variante="danger" raisonDesactive={termine ? "Campagne déjà terminée ou archivée." : null} onClick={() => setOuvert(true)}>
          Annuler la campagne
        </Bouton>
      </span>
      {fait ? <p className="atl-succes" role="status">Annulation enregistrée : les tâches ouvertes du projet sont passées à « annulée » dans le tableau de bord.</p> : null}
      {ouvert ? (
        <div
          className="atl-encart"
          data-ton="danger"
          role="group"
          aria-labelledby={`annulation-${campagne.id}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              fermer();
            }
          }}
        >
          <p className="atl-encart-titre" id={`annulation-${campagne.id}`}>Annuler « {campagne.nom} » ?</p>
          <p>Toutes les tâches non terminées du projet passeront au statut natif « annulée ». Cette action est tracée dans le journal.</p>
          <Champ libelle="Motif (obligatoire)">
            <textarea ref={zoneMotif} value={motif} onChange={(e) => setMotif(e.target.value)} rows={2} maxLength={500} />
          </Champ>
          <div className="atl-actions">
            <Bouton variante="danger" enCours={enCours} raisonDesactive={motif.trim() ? null : "Indiquez un motif."} onClick={() => void confirmer()}>
              Confirmer l'annulation
            </Bouton>
            <Bouton variante="discret" onClick={fermer}>
              Garder la campagne
            </Bouton>
          </div>
          {erreur ? <EtatErreur erreur={erreur} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Création depuis un brief                                              */
/* ------------------------------------------------------------------ */

function lignes(texte: string): string[] {
  return texte
    .split(/\r?\n|;/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function nouvelIdentifiant(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Clé d'idempotence de la création du projet natif (`idempotencyKey` de
 * `POST /api/companies/:id/projects`) : même formulaire et même nom donnent la
 * même clé ; un nom modifié donne une autre clé (le serveur refuserait sinon
 * une même clé avec des entrées différentes).
 */
export function cleIdempotenceProjet(formulaire: string, nom: string): string {
  let h = 0x811c9dc5;
  for (const c of nom) {
    h ^= c.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `atelier-campagne-${formulaire}-${h.toString(16)}`;
}

export { centimesDepuisSaisie } from "../format.js";

/** Limites du contrat `CreerCampagneEntree` (src/contrats/campagnes.ts), vérifiées avant l'envoi. */
const LIMITES_LISTES = {
  objectifs: { libelle: "objectifs", trop: "Trop d'objectifs", nombre: 20, longueur: 500 },
  canaux: { libelle: "canaux", trop: "Trop de canaux", nombre: 20, longueur: 100 },
  etablissements: { libelle: "établissements", trop: "Trop d'établissements", nombre: 100, longueur: 200 },
  zones: { libelle: "zones", trop: "Trop de zones", nombre: 100, longueur: 200 },
} as const;

export function depasseLimites(listes: Record<keyof typeof LIMITES_LISTES, string[]>): string | null {
  for (const [cle, l] of Object.entries(LIMITES_LISTES) as Array<[keyof typeof LIMITES_LISTES, (typeof LIMITES_LISTES)[keyof typeof LIMITES_LISTES]]>) {
    const v = listes[cle];
    if (v.length > l.nombre) return `${l.trop} : ${v.length} pour ${l.nombre} au plus.`;
    const long = v.find((x) => x.length > l.longueur);
    if (long) return `Un élément de « ${l.libelle} » dépasse ${l.longueur} caractères.`;
  }
  return null;
}

function NouvelleCampagne() {
  const contexte = useHostContext();
  const nav = useHostNavigation();
  const creer = useAction<Campagne>("atelier.campagne.creer");
  const equipe = useDonnees<VueEquipe>("atelier.equipe");
  const [f, setF] = useState({ nom: "", brief: "", objectifs: "", cible: "", offre: "", canaux: "", etablissements: "", zones: "", mode: "reel", coordinateur: "" });
  const [plafond, setPlafond] = useState<SaisiePlafond>(SAISIE_PLAFOND_VIDE);
  const [projetId, setProjetId] = useState<string | null>(null);
  // Une clé par formulaire : un nouvel essai après une réponse perdue ne crée pas un second projet.
  const cleFormulaire = useRef(nouvelIdentifiant());
  const [etape, setEtape] = useState<"saisie" | "projet" | "campagne">("saisie");
  const [erreur, setErreur] = useState<unknown>(null);
  const [etapeEchec, setEtapeEchec] = useState<"projet" | "campagne">("campagne");
  const maj = (cle: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [cle]: e.target.value }));
  const choixPlafond = plafondDepuisSaisie(plafond);
  const listes = {
    objectifs: lignes(f.objectifs),
    canaux: lignes(f.canaux.replace(/,/gu, "\n")),
    etablissements: lignes(f.etablissements),
    zones: lignes(f.zones.replace(/,/gu, "\n")),
  };
  const raison = depasseLimites(listes) ?? (!f.nom.trim()
    ? "Donnez un nom à la campagne."
    : !f.brief.trim()
      ? "Collez le brief : c'est la source des exigences."
      : choixPlafond.raison
        ? choixPlafond.raison
        : !contexte.companyId
          ? "Aucune entreprise sélectionnée."
          : null);

  const soumettre = async (ev: FormEvent) => {
    ev.preventDefault();
    if (raison || !contexte.companyId) return;
    setErreur(null);
    let etapeCourante: "projet" | "campagne" = "projet";
    try {
      let pid = projetId;
      if (!pid) {
        etapeCourante = "projet";
        setEtape("projet");
        pid = (await creerProjetNatif(contexte.companyId, f.nom.trim(), cleIdempotenceProjet(cleFormulaire.current, f.nom.trim()))).id;
        setProjetId(pid);
      }
      etapeCourante = "campagne";
      setEtape("campagne");
      const c = await creer({
        projectId: pid,
        nom: f.nom.trim(),
        brief: f.brief.trim(),
        objectifs: listes.objectifs,
        cible: f.cible.trim() || null,
        offre: f.offre.trim() || null,
        canaux: listes.canaux,
        etablissements: listes.etablissements,
        zones: listes.zones,
        plafondPub: choixPlafond.plafond,
        mode: f.mode,
        coordinateurAgentId: f.coordinateur || null,
      });
      nav.navigate(chemin("campagnes", c.id));
    } catch (err) {
      setErreur(err);
      setEtapeEchec(etapeCourante);
      setEtape("saisie");
    }
  };

  const agents = equipe.data?.agents ?? [];
  return (
    <>
      <EnTete
        titre="Nouvelle campagne"
        retour={<LienHote vers={chemin("campagnes")}>Toutes les campagnes</LienHote>}
        description="La campagne crée un projet dans le tableau de bord et une tâche de brief. Si un coordinateur est choisi, il reçoit le brief et en extrait les exigences."
      />
      <form className="atl-formulaire" onSubmit={(e) => void soumettre(e)} noValidate>
        <Champ libelle="Nom de la campagne">
          <input value={f.nom} onChange={maj("nom")} maxLength={200} required autoComplete="off" />
        </Champ>
        <Champ libelle="Brief" aide="Texte d'origine, conservé tel quel : établissements, offre, contraintes, ton.">
          <textarea value={f.brief} onChange={maj("brief")} rows={7} maxLength={50000} required />
        </Champ>
        <div className="atl-grille-champs">
          <Champ libelle="Objectifs" aide="Un par ligne.">
            <textarea value={f.objectifs} onChange={maj("objectifs")} rows={3} />
          </Champ>
          <Champ libelle="Cible">
            <textarea value={f.cible} onChange={maj("cible")} rows={3} maxLength={2000} />
          </Champ>
          <Champ libelle="Offre">
            <textarea value={f.offre} onChange={maj("offre")} rows={3} maxLength={2000} />
          </Champ>
          <Champ libelle="Canaux" aide="Séparés par des virgules (site, facebook…).">
            <input value={f.canaux} onChange={maj("canaux")} autoComplete="off" />
          </Champ>
          <Champ libelle="Établissements" aide="Un par ligne : chacun devra être prouvé.">
            <textarea value={f.etablissements} onChange={maj("etablissements")} rows={3} />
          </Champ>
          <Champ libelle="Zones" aide="Séparées par des virgules.">
            <input value={f.zones} onChange={maj("zones")} autoComplete="off" />
          </Champ>
          <Champ libelle="Coordinateur" aide={equipe.error ? "Liste des agents indisponible : la campagne peut être créée sans coordinateur." : "Il reçoit le brief et en extrait les exigences."}>
            <select value={f.coordinateur} onChange={maj("coordinateur")}>
              <option value="">Aucun (tâche de brief non affectée)</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nom}
                </option>
              ))}
            </select>
          </Champ>
        </div>
        <ChoixPlafond
          legende="Plafond des dépenses publicitaires"
          valeur={plafond}
          onChange={setPlafond}
          libelleAucunChoix="Pas de choix pour cette campagne"
          aideAucunChoix="Le plafond de l'entreprise s'applique ; sans plafond d'entreprise non plus, aucune dépense publicitaire n'est possible."
        />
        {projetId ? (
          <p className="atl-attenue">
            Projet déjà créé dans le tableau de bord ({idCourt(projetId)}) : un nouvel essai le réutilise au lieu d'en créer un second.
          </p>
        ) : null}
        {erreur ? <EtatErreur erreur={erreur} contexte={etapeEchec === "projet" ? "création du projet" : "création de la campagne"} /> : null}
        <div className="atl-actions">
          <Bouton type="submit" variante="principal" raisonDesactive={raison} enCours={etape !== "saisie"}>
            Créer la campagne
          </Bouton>
          <LienHote vers={chemin("campagnes")} className="atl-bouton">
            Abandonner
          </LienHote>
        </div>
      </form>
    </>
  );
}

/** Plafond publicitaire de la campagne : montants engagés face à la limite, et choix modifiable (humain, tracé). */
function PlafondCampagne({ campagne, onFait }: { campagne: Campagne; onFait(): void }) {
  const enregistrer = useAction<Campagne>("atelier.campagne.plafond");
  const [saisie, setSaisie] = useState<SaisiePlafond>(saisieDepuisPlafond(campagne.plafondPub));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [fait, setFait] = useState(false);
  useEffect(() => {
    setSaisie(saisieDepuisPlafond(campagne.plafondPub));
    // Seulement quand le choix enregistré change, pas à chaque actualisation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campagne.plafondPub?.decideLe, campagne.plafondPub?.type]);
  const choix = plafondDepuisSaisie(saisie);
  const raison = choix.raison ?? (plafondModifie(saisie, campagne.plafondPub) ? null : "Aucun changement à enregistrer.");
  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (raison) return;
    setEnCours(true);
    setErreur(null);
    setFait(false);
    try {
      await enregistrer({ campagneId: campagne.id, plafondPub: choix.plafond });
      setFait(true);
      onFait();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <Section titre="Plafond des dépenses publicitaires" aide="Choix du client, tracé dans le journal. Même sans limite, chaque dépense exige une approbation humaine.">
      <EngagementFaceLimite plafond={campagne.plafondPub} engagement={campagne.engagementPub} />
      {campagne.plafondPub ? (
        <p className="atl-sous">
          Choisi par {campagne.plafondPub.decidePar} le <Horodatage iso={campagne.plafondPub.decideLe} />.
        </p>
      ) : null}
      <form className="atl-formulaire" onSubmit={(e) => void soumettre(e)} noValidate>
        <ChoixPlafond
          legende="Modifier le plafond"
          valeur={saisie}
          onChange={setSaisie}
          libelleAucunChoix="Pas de choix pour cette campagne"
          aideAucunChoix="Le plafond de l'entreprise s'applique."
        />
        {erreur ? <EtatErreur erreur={erreur} contexte="plafond non enregistré" /> : null}
        {fait ? (
          <p className="atl-succes" role="status">
            Plafond enregistré.
          </p>
        ) : null}
        <Bouton type="submit" variante="principal" raisonDesactive={raison} enCours={enCours}>
          Enregistrer le plafond
        </Bouton>
      </form>
    </Section>
  );
}
