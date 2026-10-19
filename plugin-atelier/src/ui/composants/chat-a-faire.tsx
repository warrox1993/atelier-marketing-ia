/**
 * Liste « À faire » (ce qui attend une décision humaine) du chat du Coordinateur général :
 * lecture de `GET /accueil`, lignes triées par urgence et action « Traiter ici » (décision sur place) quand elle existe,
 * approbation groupée des contenus au contrôle automatique réussi. Composants déplacés tels quels depuis l'ancienne
 * page Accueil (supprimée) ; le chat les rend dans le message du Coordinateur en tête du fil (`MessageSituation`).
 */
import { useCallback, useEffect, useId, useState } from "react";
import type { ElementAccueil, MissionResumee, UrgenceAccueil } from "../../serveur/services-accueil.js";
import { SurPlace, traitableSurPlace } from "../accueil-sur-place.js";
import { compterAFaire, publierNombreAFaire } from "../compteur-afaire.js";
import { LienHote, Pastille, Vide } from "../composants.js";
import type { Ton } from "../format.js";
import { appelRoute } from "../routes-prospection.js";

export const URGENCES: Readonly<Record<UrgenceAccueil, { libelle: string; ton: Ton }>> = {
  haute: { libelle: "Urgent", ton: "danger" },
  moyenne: { libelle: "À voir", ton: "attention" },
  basse: { libelle: "Quand vous pouvez", ton: "neutre" },
};

const RANG_URGENCE: Readonly<Record<UrgenceAccueil, number>> = { haute: 0, moyenne: 1, basse: 2 };

/** Du plus urgent au moins urgent ; à urgence égale, l'ordre du serveur est conservé (tri stable). */
export function trierParUrgence(elements: readonly ElementAccueil[]): ElementAccueil[] {
  return elements.map((e, i) => ({ e, i })).sort((a, b) => RANG_URGENCE[a.e.urgence] - RANG_URGENCE[b.e.urgence] || a.i - b.i).map(({ e }) => e);
}

export interface DonneesAccueil {
  elements: ElementAccueil[];
  missions: MissionResumee[];
}

/**
 * Lecture de `GET /accueil` et éléments déjà traités sur place (masqués tout de suite, puis absents de la liste
 * rechargée). `intervalleMs` : relecture périodique, onglet visible seulement (aucune par défaut).
 */
export function useAFaireAccueil(companyId: string | null | undefined, intervalleMs?: number) {
  const [etat, setEtat] = useState<{ data: DonneesAccueil | null; erreur: unknown; chargement: boolean }>({ data: null, erreur: null, chargement: true });
  const [version, setVersion] = useState(0);
  // Éléments traités sur place : masqués tout de suite, puis absents de la liste rechargée.
  const [traites, setTraites] = useState<ReadonlySet<string>>(new Set());
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    appelRoute<DonneesAccueil>("GET", `/accueil?companyId=${encodeURIComponent(companyId)}`)
      .then((data) => {
        if (annule) return;
        setEtat({ data, erreur: null, chargement: false });
        // Ce que le serveur renvoie fait foi : un élément encore présent redevient visible.
        setTraites(new Set());
        publierNombreAFaire(companyId, compterAFaire(data.elements));
      })
      .catch((erreur: unknown) => !annule && setEtat({ data: null, erreur, chargement: false }));
    return () => {
      annule = true;
    };
  }, [companyId, version]);

  const recharger = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!intervalleMs || !companyId) return;
    const minuteur = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") recharger();
    }, intervalleMs);
    return () => clearInterval(minuteur);
  }, [intervalleMs, companyId, recharger]);

  const surTraite = useCallback(
    (element: ElementAccueil, message: string) => {
      setTraites((t) => new Set(t).add(element.id));
      setConfirmation(`${element.titre} : ${message}`);
      recharger();
    },
    [recharger],
  );
  /** Approbation groupée terminée : les contenus approuvés disparaissent tout de suite, la liste est relue. */
  const surTraiteGroupe = useCallback(
    (issueIds: string[]) => {
      const faits = (etat.data?.elements ?? []).filter((e) => e.issueId && issueIds.includes(e.issueId) && e.type === "contenu_a_valider");
      setTraites((t) => new Set([...t, ...faits.map((e) => e.id)]));
      recharger();
    },
    [etat.data, recharger],
  );
  return { etat, traites, setTraites, confirmation, recharger, surTraite, surTraiteGroupe };
}

export function AFaire({ elements, onFait }: { elements: ElementAccueil[]; onFait(element: ElementAccueil, message: string): void }) {
  if (elements.length === 0) return <Vide titre="Rien n'attend votre décision.">Quand l'équipe aura besoin de vous, la demande apparaîtra ici.</Vide>;
  return (
    <ul className="atl-afaire">
      {elements.map((e) => (
        <LigneAFaire key={e.id} element={e} onFait={(m) => onFait(e, m)} />
      ))}
    </ul>
  );
}

export function LigneAFaire({ element: e, onFait }: { element: ElementAccueil; onFait(message: string): void }) {
  const [ouvert, setOuvert] = useState(false);
  const idPanneau = useId();
  const surPlace = traitableSurPlace(e);
  return (
    <li data-ouvert={ouvert ? "oui" : undefined}>
      <span>
        <Pastille ton={URGENCES[e.urgence].ton}>{URGENCES[e.urgence].libelle}</Pastille>
      </span>
      <div className="atl-afaire-texte">
        <span className="atl-afaire-titre">{e.titre}</span>
        <span className="atl-afaire-raison">{e.raison}</span>
      </div>
      <div className="atl-afaire-actions">
        {surPlace ? (
          <button type="button" className="atl-bouton" data-variante="principal" aria-expanded={ouvert} aria-controls={ouvert ? idPanneau : undefined} onClick={() => setOuvert((o) => !o)}>
            {ouvert ? "Replier" : "Traiter ici"}
          </button>
        ) : null}
        <LienHote vers={e.lien} className="atl-bouton">
          {e.action}
        </LienHote>
      </div>
      {surPlace && ouvert ? (
        <div className="atl-afaire-detail" id={idPanneau}>
          <SurPlace element={e} onFait={onFait} />
        </div>
      ) : null}
    </li>
  );
}

/** Identifiant de l'élément « Aucune connexion à vos outils » : le message du Coordinateur (connexions manquantes) dit déjà la même chose. */
export const ID_ELEMENT_CONNEXIONS = "manque:passerelle";
