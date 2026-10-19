/**
 * Message de situation du Coordinateur, en tête du fil du chat : il remplace le bandeau « Il manque N connexions »,
 * la carte « À faire (N) » épinglée et la pastille d'en-tête. Calculé à l'ouverture (jamais enregistré dans la tâche
 * Paperclip, jamais envoyé au serveur) et rendu comme une bulle du Coordinateur, dans la zone annoncée (`role="log"`).
 * Il n'existe que s'il y a quelque chose à dire : connexions manquantes, points qui attendent une décision, ou le
 * récapitulatif / bilan d'une approbation groupée ou une confirmation à lire. Rien pendant la lecture, rien si elle
 * échoue, rien quand tout est en ordre (le chat ne dit jamais « tout est en ordre »).
 */
import { useState } from "react";
import type { ElementAccueil } from "../../serveur/services-accueil.js";
import { AFaire, trierParUrgence } from "./chat-a-faire.js";
import { LienHote, MessageFait } from "../composants.js";
import { ApprobationGroupee } from "../decision-livrable.js";
import { branchementsManquants, LIEN_PASSAGE_AU_REEL, useRealite } from "../realite.js";

/** Connexions nommées dans le message ; le détail est dans les paramètres. */
const NOMS_AFFICHES = 3;
/** Points montrés d'emblée ; les autres se déplient. */
export const POINTS_AFFICHES = 3;

/** « Avant de commencer : il me manque N connexions pour travailler sur vos vraies données (A, B, C et K autres). … » */
export function phraseConnexionsManquantes(noms: readonly string[]): string {
  const n = noms.length;
  const liste = noms.slice(0, NOMS_AFFICHES).join(", ");
  const reste = n - NOMS_AFFICHES;
  const detail = reste > 0 ? `${liste} et ${reste} autre${reste > 1 ? "s" : ""}` : noms.length > 1 ? liste.replace(/, ([^,]*)$/u, " et $1") : liste;
  return `Avant de commencer : il me manque ${n} connexion${n > 1 ? "s" : ""} pour travailler sur vos vraies données (${detail}). Tant qu'${n > 1 ? "elles ne sont" : "elle n'est"} pas faite${n > 1 ? "s" : ""}, je travaille en démonstration.`;
}

/** « J'ai aussi 2 points qui attendent votre décision : » (sans « aussi » quand les connexions n'ont rien à dire). */
export function phrasePointsEnAttente(n: number, aussi: boolean): string {
  return `J'ai${aussi ? " aussi" : ""} ${n} point${n > 1 ? "s" : ""} qui attend${n > 1 ? "ent" : ""} votre décision :`;
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
}: {
  nom: string;
  connexions: readonly string[];
  elements: readonly ElementAccueil[];
  onFait(element: ElementAccueil, message: string): void;
  confirmation?: string | null;
  onFaitGroupe?(issueIds: string[]): void;
}) {
  const [toutVoir, setToutVoir] = useState(false);
  const [groupeActif, setGroupeActif] = useState(false);
  // Le bilan d'une approbation groupée reste affiché jusqu'à « Fermer », même si la liste se vide ou ne se recharge pas.
  if (connexions.length === 0 && elements.length === 0 && !groupeActif && !confirmation) return null;
  const tries = trierParUrgence(elements);
  const visibles = toutVoir ? tries : tries.slice(0, POINTS_AFFICHES);
  const autres = tries.length - POINTS_AFFICHES;
  const contenus = elements.filter((e) => e.type === "contenu_a_valider" && e.issueId).map((e) => ({ issueId: e.issueId as string, titre: e.titre }));
  return (
    <div className="atl-disc-bulle" data-auteur="agent" data-situation="oui" data-testid="chat-situation">
      <span className="atl-disc-meta">
        <span className="atl-disc-avatar" aria-hidden="true">
          C
        </span>
        <span className="atl-disc-nom">{nom}</span>
      </span>
      <div className="atl-disc-texte atl-disc-situation">
        {connexions.length > 0 ? (
          <div className="atl-disc-situation-bloc" data-testid="situation-connexions">
            <p>{phraseConnexionsManquantes(connexions)}</p>
            <div className="atl-disc-situation-actions">
              <LienHote vers={LIEN_PASSAGE_AU_REEL} className="atl-bouton">
                Ouvrir les connexions
              </LienHote>
            </div>
          </div>
        ) : null}
        {confirmation ? <MessageFait className="atl-succes atl-afaire-confirmation" texte={confirmation} /> : null}
        {elements.length > 0 ? (
          <div className="atl-disc-situation-bloc" data-testid="situation-points">
            <p>{phrasePointsEnAttente(elements.length, connexions.length > 0)}</p>
            <AFaire elements={visibles} onFait={onFait} />
            {autres > 0 ? (
              <div className="atl-disc-situation-actions">
                <button type="button" className="atl-bouton" aria-expanded={toutVoir} onClick={() => setToutVoir((v) => !v)}>
                  {toutVoir ? "Voir moins" : autres > 1 ? `Voir les ${autres} autres` : "Voir l'autre point"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {/* Toujours monté tant que le message existe : le bilan de l'approbation groupée reste affiché jusqu'à « Fermer ». */}
        {onFaitGroupe ? <ApprobationGroupee elements={contenus} onFait={onFaitGroupe} onActif={setGroupeActif} /> : null}
      </div>
    </div>
  );
}
