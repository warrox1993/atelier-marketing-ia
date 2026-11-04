/**
 * Message de situation, en tête du fil du chat : il remplace le bandeau « Il manque N connexions »,
 * la carte « À faire (N) » épinglée et la pastille d'en-tête. Calculé à l'ouverture (jamais enregistré dans la tâche
 * Paperclip, jamais envoyé au serveur) et rendu dans la zone annoncée (`role="log"`) en deux bulles : les connexions
 * manquantes, constat signé « Atelier » (le Coordinateur ne sait pas si une mission travaille en démonstration), puis
 * les points en attente, signés du Coordinateur.
 * Il n'existe que s'il y a quelque chose à dire : connexions manquantes, points qui attendent une décision, ou le
 * récapitulatif / bilan d'une approbation groupée ou une confirmation à lire. Rien pendant la lecture, rien si elle
 * échoue, rien quand tout est en ordre (le chat ne dit jamais « tout est en ordre »).
 */
import { useState } from "react";
import type { ElementAccueil } from "../../serveur/services-accueil.js";
import { AFaire, trierParUrgence } from "./chat-a-faire.js";
import { LienHote, MessageFait } from "../composants.js";
import { ApprobationGroupee } from "../decision-livrable.js";
import { phraseDecisions, type CarteService } from "../cartes-services.js";
import { branchementsManquants, LIEN_PASSAGE_AU_REEL, useRealite } from "../realite.js";

/** Connexions nommées dans le message ; le détail est dans les paramètres. */
const NOMS_AFFICHES = 3;
/** Points montrés d'emblée ; les autres se déplient. */
export const POINTS_AFFICHES = 3;

/** « N connexions ne sont pas branchées (A, B, C et K autres) ; les missions qui en ont besoin travaillent sans elles. » */
export function phraseConnexionsManquantes(noms: readonly string[]): string {
  const n = noms.length;
  const liste = noms.slice(0, NOMS_AFFICHES).join(", ");
  const reste = n - NOMS_AFFICHES;
  const detail = reste > 0 ? `${liste} et ${reste} autre${reste > 1 ? "s" : ""}` : noms.length > 1 ? liste.replace(/, ([^,]*)$/u, " et $1") : liste;
  return n > 1
    ? `${n} connexions ne sont pas branchées (${detail}) ; les missions qui en ont besoin travaillent sans elles.`
    : `1 connexion n'est pas branchée (${detail}) ; les missions qui en ont besoin travaillent sans elle.`;
}

/** « J'ai 2 points qui attendent votre décision : » */
export function phrasePointsEnAttente(n: number): string {
  return `J'ai ${n} point${n > 1 ? "s" : ""} qui attend${n > 1 ? "ent" : ""} votre décision :`;
}

function Signature({ initiale, nom }: { initiale: string; nom: string }) {
  return (
    <span className="atl-disc-meta">
      <span className="atl-disc-avatar" aria-hidden="true">
        {initiale}
      </span>
      <span className="atl-disc-nom">{nom}</span>
    </span>
  );
}

/**
 * Noms des connexions qui manquent ; liste vide pendant la lecture, si elle échoue ou si tout est connecté (aucun
 * message alors). Lu une seule fois par le chat, qui s'en sert aussi pour ne pas répéter l'élément « Aucune connexion ».
 */
export function useConnexionsManquantes(): string[] {
  const [lecture] = useRealite();
  if (lecture.etat !== "pret") return [];
  return branchementsManquants(lecture.branchements).map((b) => b.nom);
}

export function MessageSituation({
  nom,
  connexions,
  elements,
  onFait,
  confirmation,
  onFaitGroupe,
  decisionsServices = [],
  onBilanActif,
}: {
  nom: string;
  connexions: readonly string[];
  elements: readonly ElementAccueil[];
  onFait(element: ElementAccueil, message: string): void;
  confirmation?: string | null;
  onFaitGroupe?(issueIds: string[]): void;
  /** Décisions qui attendent dans les autres services : comptées parmi les points en attente. */
  decisionsServices?: readonly CarteService[];
  /** Signale l'ouverture ou la fermeture du bilan d'une approbation groupée (le conteneur reste monté tant qu'il est affiché). */
  onBilanActif?(actif: boolean): void;
}) {
  const [toutVoir, setToutVoir] = useState(false);
  const [groupeActif, setGroupeActif] = useState(false);
  // Le bilan d'une approbation groupée reste affiché jusqu'à « Fermer », même si la liste se vide ou ne se recharge pas.
  if (connexions.length === 0 && elements.length === 0 && decisionsServices.length === 0 && !groupeActif && !confirmation) return null;
  const total = elements.length + decisionsServices.length;
  const tries = trierParUrgence(elements);
  const visibles = toutVoir ? tries : tries.slice(0, POINTS_AFFICHES);
  const autres = tries.length - POINTS_AFFICHES;
  const contenus = elements.filter((e) => e.type === "contenu_a_valider" && e.issueId).map((e) => ({ issueId: e.issueId as string, titre: e.titre }));
  const coordinateur = total > 0 || groupeActif || Boolean(confirmation);
  return (
    <div className="atl-disc-situation-groupe" data-testid="chat-situation">
      {connexions.length > 0 ? (
        <div className="atl-disc-bulle" data-auteur="agent" data-situation="oui">
          <Signature initiale="A" nom="Atelier" />
          <div className="atl-disc-texte atl-disc-situation">
            <div className="atl-disc-situation-bloc" data-testid="situation-connexions">
              <p>{phraseConnexionsManquantes(connexions)}</p>
              <div className="atl-disc-situation-actions">
                <LienHote vers={LIEN_PASSAGE_AU_REEL} className="atl-bouton">
                  Ouvrir les connexions
                </LienHote>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {coordinateur ? (
        <div className="atl-disc-bulle" data-auteur="agent" data-situation="oui">
          <Signature initiale="C" nom={nom} />
          <div className="atl-disc-texte atl-disc-situation">
            {confirmation ? <MessageFait className="atl-succes atl-afaire-confirmation" texte={confirmation} /> : null}
            {total > 0 ? (
              <div className="atl-disc-situation-bloc" data-testid="situation-points">
                <p>{phrasePointsEnAttente(total)}</p>
                {decisionsServices.length > 0 ? <p data-testid="situation-services">{phraseDecisions(decisionsServices)}</p> : null}
                {elements.length > 0 ? <AFaire elements={visibles} onFait={onFait} /> : null}
                {autres > 0 ? (
                  <div className="atl-disc-situation-actions">
                    <button type="button" className="atl-bouton" aria-expanded={toutVoir} onClick={() => setToutVoir((v) => !v)}>
                      {toutVoir ? "Voir moins" : autres > 1 ? `Voir les ${autres} autres` : "Voir l'autre point"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {/* Monté tant que la bulle existe, et `groupeActif` la garde : le bilan de l'approbation groupée reste affiché jusqu'à « Fermer ». */}
            {onFaitGroupe ? <ApprobationGroupee elements={contenus} onFait={onFaitGroupe} onActif={(actif) => {
              setGroupeActif(actif);
              onBilanActif?.(actif);
            }} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
