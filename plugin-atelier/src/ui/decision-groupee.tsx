/**
 * Décision groupée : un seul clic pour plusieurs éléments, mais toujours une décision humaine
 * explicite. La personne voit d'abord la liste exacte des éléments et ce que la décision change,
 * puis confirme une seule fois. Chaque élément est ensuite traité un par un avec l'action qui
 * existe déjà (boucle côté interface, aucune route de plus) : si l'un échoue, les autres continuent
 * et le bilan dit lesquels ont échoué, avec la raison.
 */
import { useRef, useState, type ReactNode } from "react";
import { Bouton } from "./composants.js";
import { classerErreur } from "./format.js";

export interface ElementLot {
  id: string;
  titre: string;
}

export interface BilanLot {
  /** Éléments enregistrés ; `note` signale un point à vérifier malgré la réussite. */
  reussis: Array<{ element: ElementLot; note: string | null }>;
  echecs: Array<{ element: ElementLot; message: string }>;
}

/**
 * Traite les éléments dans l'ordre, un par un. Une erreur sur l'un n'arrête pas les suivants.
 * `traiter` peut renvoyer une note (réussite avec un point à vérifier).
 */
export async function traiterLot(elements: readonly ElementLot[], traiter: (element: ElementLot) => Promise<string | void>): Promise<BilanLot> {
  const bilan: BilanLot = { reussis: [], echecs: [] };
  for (const element of elements) {
    try {
      const note = await traiter(element);
      bilan.reussis.push({ element, note: typeof note === "string" && note ? note : null });
    } catch (err) {
      bilan.echecs.push({ element, message: classerErreur(err).message });
    }
  }
  return bilan;
}

export function accord(n: number, singulier: string, pluriel: string): string {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}

/**
 * Récapitulatif puis confirmation unique. Le composant garde son bilan affiché jusqu'à « Fermer »,
 * même si la liste d'origine est rechargée entre-temps.
 */
export function ConfirmationLot({
  titre,
  elements,
  effet,
  libelleConfirmer,
  variante = "principal",
  raisonDesactive,
  children,
  traiter,
  onBilan,
  onFermer,
}: {
  titre: string;
  elements: readonly ElementLot[];
  /** Ce que la décision change, et ce qu'elle ne change pas. */
  effet: ReactNode;
  libelleConfirmer: string;
  variante?: "principal" | "danger" | "secondaire";
  raisonDesactive?: string | null;
  /** Champs communs (commentaire, justification). */
  children?: ReactNode;
  traiter(element: ElementLot): Promise<string | void>;
  /** Appelé une fois le lot terminé : recharger la liste, vider la sélection. */
  onBilan(bilan: BilanLot): void;
  onFermer(): void;
}) {
  const [enCours, setEnCours] = useState(false);
  const [bilan, setBilan] = useState<BilanLot | null>(null);
  // Liste figée à l'ouverture : elle ne change pas pendant le traitement.
  const figes = useRef(elements);
  const confirmer = async () => {
    if (enCours || bilan) return;
    setEnCours(true);
    const resultat = await traiterLot(figes.current, traiter);
    setBilan(resultat);
    setEnCours(false);
    onBilan(resultat);
  };
  if (bilan) {
    const total = bilan.reussis.length + bilan.echecs.length;
    const notes = bilan.reussis.filter((r) => r.note);
    return (
      <div className="atl-encart" data-ton={bilan.echecs.length ? "attention" : undefined} role="status" aria-label="Bilan de la décision groupée">
        <p className="atl-encart-titre">
          {bilan.echecs.length === 0
            ? `${accord(bilan.reussis.length, "décision enregistrée", "décisions enregistrées")}.`
            : `${bilan.reussis.length} sur ${accord(total, "élément", "éléments")} enregistré${bilan.reussis.length > 1 ? "s" : ""} ; ${accord(bilan.echecs.length, "échec", "échecs")}.`}
        </p>
        {bilan.echecs.length ? (
          <>
            <p className="atl-sous">Non enregistrés, à reprendre un par un :</p>
            <ul className="atl-liste">
              {bilan.echecs.map((e) => (
                <li key={e.element.id}>
                  {e.element.titre} : {e.message}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {notes.length ? (
          <ul className="atl-liste">
            {notes.map((r) => (
              <li key={r.element.id}>
                {r.element.titre} : {r.note}
              </li>
            ))}
          </ul>
        ) : null}
        <Bouton variante="discret" onClick={onFermer}>
          Fermer
        </Bouton>
      </div>
    );
  }
  return (
    <div className="atl-encart" data-ton="attention" role="group" aria-label="Confirmation de la décision groupée">
      <p className="atl-encart-titre">{titre}</p>
      <ul className="atl-liste">
        {figes.current.map((e) => (
          <li key={e.id}>{e.titre}</li>
        ))}
      </ul>
      <p className="atl-sous">{effet}</p>
      {children}
      <div className="atl-actions">
        <Bouton variante={variante} enCours={enCours} raisonDesactive={raisonDesactive} onClick={() => void confirmer()}>
          {libelleConfirmer}
        </Bouton>
        {enCours ? null : (
          <Bouton variante="discret" onClick={onFermer}>
            Annuler
          </Bouton>
        )}
      </div>
    </div>
  );
}
