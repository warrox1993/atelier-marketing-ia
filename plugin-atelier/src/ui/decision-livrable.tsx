/**
 * Décision humaine sur un livrable (Approuver, Demander une correction, Rejeter) : composant
 * partagé par la rubrique Contenus et par l'Accueil, qui décide sur place. Même action
 * (`atelier.decision`), même transmission au Coordinateur, mêmes gardes (porte franchie sur la
 * révision courante, commentaire obligatoire).
 */
import { useState, type FormEvent, type ReactNode } from "react";
import type { AppelPropose, DecisionHumaine, DossierHumain } from "../contrats/dossier.js";
import { Bouton, Champ, EtatErreur, Section } from "./composants.js";
import { useAction } from "./donnees.js";
import { ACTIONS_EXTERNES, ACTIONS_HUMAINES, idCourt } from "./format.js";
import { transitionTache } from "./hote.js";
import { centimesDepuisSaisie } from "./vues/campagnes.js";
import { ACTIONS_AVEC_APPEL, appelsApprouvables, CANAUX_DU_SERVICE, porteeDepuisAppel, raisonDuree } from "./vues/appels.js";

export type Choix = "approuver" | "demander_correction" | "rejeter";

export function raisonDecision(d: DossierHumain, choix: Choix, commentaire: string): string | null {
  if (!d.livrable) return "Aucun livrable : rien à décider.";
  if (d.statut.statut !== "ready_for_human") return "Décision possible seulement quand le livrable est prêt pour validation humaine (contrôle automatique réussi, étape d'approbation).";
  if (choix === "approuver") {
    const ev = d.evaluationPorte;
    if (!ev || ev.decision !== "PASS" || ev.perimee || ev.revisionId !== d.livrable.revisionId) return "Approbation impossible : le contrôle automatique n'est pas réussi sur la révision courante.";
  }
  if (!commentaire.trim()) return "Un commentaire est obligatoire.";
  return null;
}

export function DecisionPanneau({ dossier: d, onFait, integre = false }: { dossier: DossierHumain; onFait(message?: string): void; integre?: boolean }) {
  const decider = useAction<DecisionHumaine>("atelier.decision");
  const [choix, setChoix] = useState<Choix>("approuver");
  const [commentaire, setCommentaire] = useState("");
  const [portee, setPortee] = useState({ action: "aucune_action_externe", canal: d.perimetre.canaux[0] ?? "", compte: "", audience: "", montant: "", duree: "" });
  // v1.6 : l'humain choisit l'appel exact proposé (null : pas encore choisi ; AUCUN_APPEL : choix explicite sans appel).
  const [appelChoisi, setAppelChoisi] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [resultat, setResultat] = useState<string | null>(null);
  const montant = centimesDepuisSaisie(portee.montant);
  const duree = portee.duree.trim() ? Number(portee.duree) : null;
  let raison = raisonDecision(d, choix, commentaire);
  const externe = portee.action !== "aucune_action_externe";
  const proposes = externe && ACTIONS_AVEC_APPEL.includes(portee.action) ? appelsApprouvables(d, portee.action) : [];
  const appel = proposes.find((a) => a.id === appelChoisi) ?? null;
  if (!raison && choix === "approuver" && appel) {
    raison = raisonDuree(portee.duree);
  } else if (!raison && choix === "approuver" && proposes.length > 0 && appelChoisi !== AUCUN_APPEL) {
    raison = "Choisissez l'appel exact à approuver (ou « sans appel »).";
  } else if (!raison && choix === "approuver" && externe) {
    if (Number.isNaN(montant)) raison = "Montant maximal invalide.";
    else if (duree !== null && (!Number.isInteger(duree) || duree < 1 || duree > 365)) raison = "Durée : un nombre entier de jours entre 1 et 365.";
    else if (portee.action === "activer_campagne_payante" && montant === null) raison = "Une campagne payante exige un montant maximal.";
  }

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (raison || !d.livrable) return;
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const revisionId = d.livrable.revisionId;
      const enregistree = (await decider({
        issueId: d.issueId,
        revisionId,
        action: choix,
        commentaire: commentaire.trim(),
        portee:
          choix === "approuver" && appel
            ? porteeDepuisAppel(appel, { canal: portee.canal, audience: portee.audience, duree: portee.duree })
            : choix === "approuver"
            ? {
                revisionId,
                action: portee.action,
                // Champs masqués quand aucune action externe : jamais envoyés en douce.
                canal: externe ? portee.canal.trim() || null : null,
                compte: externe ? portee.compte.trim() || null : null,
                audience: externe ? portee.audience.trim() || null : null,
                montantMaxCents: externe ? montant : null,
                dureeJours: externe ? duree : null,
              }
            : null,
      })) as (DecisionHumaine & { transmission?: { transmission?: string } }) | undefined;
      let suite = "Décision enregistrée.";
      if (choix === "rejeter") {
        suite += " La tâche Paperclip a été annulée dans la même opération, avec votre commentaire.";
      } else if (choix === "demander_correction" && enregistree?.transmission?.transmission === "coordinateur") {
        // Le serveur a mis le livrable en attente et prévenu le Coordinateur : aucune transition native ici.
        suite += " La correction est transmise au Coordinateur, qui la répartira.";
      } else {
        try {
          const t = await transitionTache(
            d.issueId,
            choix === "approuver" ? "done" : "in_progress",
            choix === "approuver" ? `Approuvé dans l'atelier : ${commentaire.trim()}` : `Correction demandée dans l'atelier : ${commentaire.trim()}`,
          );
          suite += choix === "approuver" ? ` Tâche Paperclip passée à « ${t.status ?? "done"} ».` : " La tâche Paperclip repart en production.";
        } catch (err) {
          const m = (err as { message?: string }).message ?? "";
          suite += ` La transition de la tâche Paperclip a été refusée par le serveur (${m}) : ouvrez la tâche native pour la traiter.`;
        }
      }
      if (d.mode === "demonstration") suite += " Démonstration : aucune diffusion n'a été déclenchée.";
      setResultat(suite);
      setCommentaire("");
      onFait(suite);
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };

  const maj = (cle: keyof typeof portee) => (e: { target: { value: string } }) => {
    if (cle === "action") setAppelChoisi(null);
    setPortee((p) => ({ ...p, [cle]: e.target.value }));
  };
  // Hors de l'étape humaine, le formulaire n'apparaît pas : seule la raison est donnée.
  const fermee = raisonDecision(d, "rejeter", "-");
  if (fermee && !resultat) {
    return (
      <Conteneur integre={integre}>
        <p className="atl-decision atl-decision-fermee">{fermee}</p>
      </Conteneur>
    );
  }
  return (
    <Conteneur integre={integre}>
      <form className="atl-formulaire atl-decision" onSubmit={(e) => void soumettre(e)} noValidate>
        {d.livrable ? (
          <p className="atl-sous">
            Vise la révision {d.livrable.revisionNumber} ({idCourt(d.livrable.revisionId)}). Toute nouvelle révision invalidera cette décision.
          </p>
        ) : null}
        <fieldset className="atl-champ atl-choix">
          <legend>Votre décision</legend>
          {(["approuver", "demander_correction", "rejeter"] as const).map((c) => (
            <label key={c}>
              <input type="radio" name="decision" value={c} checked={choix === c} onChange={() => setChoix(c)} /> {ACTIONS_HUMAINES[c]}
            </label>
          ))}
        </fieldset>
        <Champ libelle="Commentaire">
          <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={3} maxLength={4000} />
        </Champ>
        {choix === "approuver" ? (
          <fieldset className="atl-champ atl-portee">
            <legend>Portée de l'approbation</legend>
            <p className="atl-aide">L'approbation d'un contenu n'autorise pas une campagne payante : choisissez l'action précise.</p>
            <Champ libelle="Action autorisée">
              <select value={portee.action} onChange={maj("action")}>
                {Object.entries(ACTIONS_EXTERNES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Champ>
            {appel ? <PorteeAppel appel={appel} portee={portee} maj={maj} /> : null}
            {proposes.length > 0 ? (
              <fieldset className="atl-champ atl-choix atl-choix-appel">
                <legend>Appel exact à approuver</legend>
                {proposes.map((a) => (
                  <label key={a.id} className="atl-choix-appel-ligne">
                    <input type="radio" name="appel" value={a.id} checked={appelChoisi === a.id} onChange={() => setAppelChoisi(a.id)} />
                    <span>
                      {a.apercu.resume}
                      <span className="atl-sous">
                        compte {a.compte}, empreinte <code>{a.empreinte}</code>
                      </span>
                    </span>
                  </label>
                ))}
                <label className="atl-choix-appel-ligne">
                  <input type="radio" name="appel" value={AUCUN_APPEL} checked={appelChoisi === AUCUN_APPEL} onChange={() => setAppelChoisi(AUCUN_APPEL)} />
                  <span>
                    Sans appel
                    <span className="atl-sous">Aucune preuve ne pourra être signée : l'agent ne pourra pas diffuser par la passerelle.</span>
                  </span>
                </label>
              </fieldset>
            ) : externe && ACTIONS_AVEC_APPEL.includes(portee.action) ? (
              <p className="atl-aide" data-sans-appel="true">
                Aucun appel proposé : aucune preuve ne pourra être signée. L'agent doit d'abord proposer l'appel exact.
              </p>
            ) : null}
            {portee.action !== "aucune_action_externe" && !appel && (proposes.length === 0 || appelChoisi === AUCUN_APPEL) ? (
              <div className="atl-grille-champs">
                <Champ libelle="Canal">
                  <input value={portee.canal} onChange={maj("canal")} autoComplete="off" maxLength={100} />
                </Champ>
                <Champ libelle="Compte">
                  <input value={portee.compte} onChange={maj("compte")} autoComplete="off" maxLength={200} />
                </Champ>
                <Champ libelle="Audience">
                  <input value={portee.audience} onChange={maj("audience")} autoComplete="off" maxLength={500} />
                </Champ>
                <Champ libelle="Montant maximal (euros)">
                  <input value={portee.montant} onChange={maj("montant")} inputMode="decimal" autoComplete="off" />
                </Champ>
                <Champ libelle="Durée (jours)">
                  <input value={portee.duree} onChange={maj("duree")} inputMode="numeric" autoComplete="off" />
                </Champ>
              </div>
            ) : null}
          </fieldset>
        ) : null}
        {d.mode === "demonstration" ? <p className="atl-aide">Démonstration : la décision est enregistrée, toute diffusion reste simulée.</p> : null}
        <Bouton type="submit" variante={choix === "rejeter" ? "danger" : "principal"} raisonDesactive={raison} enCours={enCours}>
          Enregistrer : {(ACTIONS_HUMAINES[choix] ?? choix).toLowerCase()}
        </Bouton>
        {choix === "demander_correction" ? <p className="atl-aide">La correction sera transmise au Coordinateur s'il y en a un pour cette tâche, sinon au producteur.</p> : null}
        {resultat ? (
          <p className="atl-succes" role="status">
            {resultat}
          </p>
        ) : null}
        {erreur ? <EtatErreur erreur={erreur} contexte="décision refusée" /> : null}
      </form>
    </Conteneur>
  );
}

/** Section titrée dans le dossier ; bloc sans titre quand la décision est dépliée dans l'Accueil. */
function Conteneur({ integre, children }: { integre: boolean; children: ReactNode }) {
  return integre ? <div className="atl-decision-integre">{children}</div> : <Section titre="Décision humaine">{children}</Section>;
}

const AUCUN_APPEL = "__aucun__";

/** Portée dérivée de l'appel choisi : action et compte imposés, canal du service, audience seulement hors CRM. */
function PorteeAppel({ appel, portee, maj }: { appel: AppelPropose; portee: { canal: string; audience: string; duree: string }; maj(cle: "canal" | "audience" | "duree"): (e: { target: { value: string } }) => void }) {
  const canaux = CANAUX_DU_SERVICE[appel.service] ?? [appel.service];
  const canal = canaux.includes(portee.canal) ? portee.canal : canaux[0]!;
  return (
    <div className="atl-grille-champs" data-portee-appel="true">
      <p className="atl-sous">
        Action {(ACTIONS_EXTERNES[appel.action] ?? appel.action).toLowerCase()}, compte {appel.compte} : imposés par l'appel choisi.
        {appel.action === "modifier_crm" ? " Une modification du CRM ne porte ni audience ni montant." : " Aucun montant : cette approbation ne dépense rien."}
      </p>
      <Champ libelle="Canal">
        {canaux.length > 1 ? (
          <select value={canal} onChange={maj("canal")}>
            {canaux.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <input value={canal} readOnly />
        )}
      </Champ>
      {appel.action !== "modifier_crm" ? (
        <Champ libelle="Audience">
          <input value={portee.audience} onChange={maj("audience")} autoComplete="off" maxLength={500} />
        </Champ>
      ) : null}
      <Champ libelle="Durée de la preuve (jours)">
        <input value={portee.duree} onChange={maj("duree")} inputMode="numeric" autoComplete="off" />
      </Champ>
    </div>
  );
}

