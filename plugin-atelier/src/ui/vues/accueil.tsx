/**
 * Accueil de l'atelier (lot 1) : une seule page pour savoir quoi faire, demander quelque chose à
 * l'équipe et suivre ce qu'elle fait. Lecture seule hors l'envoi d'une demande, qui devient une
 * tâche native confiée au Coordinateur.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { ElementAccueil, EtapeMission, MissionResumee, UrgenceAccueil } from "../../serveur/services-accueil.js";
import { Bouton, Champ, Chargement, EnTete, EtatErreur, Horodatage, LienHote, Pastille, Section, Vide } from "../composants.js";
import { MODELES_DEMANDE, useEnvoiDemande } from "../demande.js";
import type { Ton } from "../format.js";
import { appelRoute } from "../routes-prospection.js";
import { STYLES_ACCUEIL } from "../styles-accueil.js";

const URGENCES: Readonly<Record<UrgenceAccueil, { libelle: string; ton: Ton }>> = {
  haute: { libelle: "Urgent", ton: "danger" },
  moyenne: { libelle: "À voir", ton: "attention" },
  basse: { libelle: "Quand vous pouvez", ton: "neutre" },
};

const TON_STATUT_NATIF: Readonly<Record<string, Ton>> = {
  done: "succes",
  in_progress: "info",
  in_review: "info",
  blocked: "attention",
};

interface DonneesAccueil {
  elements: ElementAccueil[];
  missions: MissionResumee[];
}
interface Suivi {
  mere: EtapeMission;
  sousTaches: EtapeMission[];
}

export function VueAccueil() {
  const { companyId } = useHostContext();
  const [etat, setEtat] = useState<{ data: DonneesAccueil | null; erreur: unknown; chargement: boolean }>({ data: null, erreur: null, chargement: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    appelRoute<DonneesAccueil>("GET", `/accueil?companyId=${encodeURIComponent(companyId)}`)
      .then((data) => !annule && setEtat({ data, erreur: null, chargement: false }))
      .catch((erreur: unknown) => !annule && setEtat({ data: null, erreur, chargement: false }));
    return () => {
      annule = true;
    };
  }, [companyId, version]);

  const recharger = useCallback(() => setVersion((v) => v + 1), []);

  return (
    <>
      <style>{STYLES_ACCUEIL}</style>
      <EnTete titre="Accueil" description="Ce qui attend votre décision, une zone pour demander quelque chose à l'équipe, et l'avancement de ses missions." />
      <DemanderAEquipe companyId={companyId ?? null} onEnvoyee={recharger} />
      <Section titre="À faire" id="accueil-afaire">
        {etat.erreur ? <EtatErreur erreur={etat.erreur} onReessayer={recharger} contexte="l'accueil" /> : null}
        {etat.chargement && !etat.data ? <Chargement libelle="Chargement de l'accueil" /> : null}
        {etat.data ? <AFaire elements={etat.data.elements} /> : null}
      </Section>
      <Section titre="Missions en cours" id="accueil-missions">
        {etat.data ? (
          etat.data.missions.length === 0 ? (
            <Vide titre="Aucune mission en cours.">Envoyez une demande ci-dessus : le Coordinateur la répartit et vous la suivez ici.</Vide>
          ) : (
            <div>
              {etat.data.missions.map((m) => (
                <Mission key={m.issueId} mission={m} companyId={companyId ?? null} />
              ))}
            </div>
          )
        ) : null}
      </Section>
    </>
  );
}

function DemanderAEquipe({ companyId, onEnvoyee }: { companyId: string | null; onEnvoyee: () => void }) {
  const [texte, setTexte] = useState("");
  const zone = useRef<HTMLTextAreaElement>(null);
  const { envoyer: envoyerDemande, enCours, erreur, envoyee } = useEnvoiDemande(companyId);

  const envoyer = async (e?: FormEvent) => {
    e?.preventDefault();
    if (await envoyerDemande(texte)) {
      setTexte("");
      onEnvoyee();
    }
  };

  // Un modèle remplit la zone sans l'envoyer : on relit, on complète les <…>, puis on envoie.
  const [modeleAppose, setModeleAppose] = useState(0);
  const appliquerModele = (modele: string) => {
    setTexte(modele);
    setModeleAppose((n) => n + 1);
  };
  // Après le rendu du modèle : focus dans la zone, curseur en fin de texte.
  useEffect(() => {
    const z = zone.current;
    if (modeleAppose === 0 || !z) return;
    z.focus();
    z.setSelectionRange(z.value.length, z.value.length);
  }, [modeleAppose]);

  return (
    <Section titre="Demander à l'équipe" id="accueil-demande">
      <form className="atl-demande" onSubmit={envoyer}>
        <Champ libelle="Votre demande" aide="Écrivez comme à un collègue : le but, pour qui, pour quand.">
          <textarea
            ref={zone}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              // Entrée envoie, Maj+Entrée passe à la ligne ; pas pendant une composition (accents, IME).
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void envoyer();
              }
            }}
            rows={4}
          />
        </Champ>
        <div className="atl-demande-modeles">
          <span className="atl-demande-aide">Modèles de demande</span>
          {MODELES_DEMANDE.map((m) => (
            <Bouton key={m.libelle} variante="discret" onClick={() => appliquerModele(m.texte)}>
              {m.libelle}
            </Bouton>
          ))}
        </div>
        <div className="atl-demande-pied">
          <Bouton type="submit" variante="principal" enCours={enCours} raisonDesactive={texte.trim() === "" ? "Écrivez d'abord votre demande." : null}>
            Envoyer
          </Bouton>
          <span className="atl-demande-aide">Entrée pour envoyer, Maj+Entrée pour aller à la ligne. Le Coordinateur reçoit votre demande et la répartit.</span>
        </div>
        {envoyee ? (
          <p className="atl-demande-retour" role="status">
            Demande envoyée{envoyee.identifiant ? ` (${envoyee.identifiant})` : ""}. Elle apparaît dans les missions en cours.
          </p>
        ) : null}
        {erreur ? (
          <p className="atl-demande-erreur" role="alert">
            {erreur}
          </p>
        ) : null}
      </form>
    </Section>
  );
}

function AFaire({ elements }: { elements: ElementAccueil[] }) {
  if (elements.length === 0) return <Vide titre="Rien n'attend votre décision.">Quand l'équipe aura besoin de vous, la demande apparaîtra ici.</Vide>;
  return (
    <ul className="atl-afaire">
      {elements.map((e) => (
        <li key={e.id}>
          <span>
            <Pastille ton={URGENCES[e.urgence].ton}>{URGENCES[e.urgence].libelle}</Pastille>
          </span>
          <div className="atl-afaire-texte">
            <span className="atl-afaire-titre">{e.titre}</span>
            <span className="atl-afaire-raison">{e.raison}</span>
          </div>
          <LienHote vers={e.lien} className="atl-bouton">
            {e.action}
          </LienHote>
        </li>
      ))}
    </ul>
  );
}

function Mission({ mission, companyId }: { mission: MissionResumee; companyId: string | null }) {
  const [suivi, setSuivi] = useState<{ data: Suivi | null; erreur: unknown }>({ data: null, erreur: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    appelRoute<Suivi>("GET", `/missions/${encodeURIComponent(mission.issueId)}?companyId=${encodeURIComponent(companyId)}`)
      .then((data) => !annule && setSuivi({ data, erreur: null }))
      .catch((erreur: unknown) => !annule && setSuivi({ data: null, erreur }));
    return () => {
      annule = true;
    };
  }, [companyId, mission.issueId, version]);

  return (
    <article className="atl-mission" aria-label={`Mission : ${mission.titre}`}>
      <div className="atl-frise-ligne" data-testid="entete-mission">
        <span className="atl-frise-agent">{mission.projet ? `Projet : ${mission.projet.nom}` : "Sans projet"}</span>
        <Pastille ton={TON_STATUT_NATIF[mission.statut] ?? "neutre"}>{mission.statutLibelle}</Pastille>
        {mission.lienPlan ? (
          <LienHote vers={mission.lienPlan} className="atl-lien">
            Voir le plan
          </LienHote>
        ) : null}
      </div>
      {suivi.erreur ? <EtatErreur erreur={suivi.erreur} onReessayer={() => setVersion((v) => v + 1)} contexte="la mission" /> : null}
      {!suivi.data && !suivi.erreur ? <Chargement libelle="Chargement de la mission" lignes={2} /> : null}
      {suivi.data ? (
        <ol className="atl-frise">
          {[suivi.data.mere, ...suivi.data.sousTaches].map((etape) => (
            <li key={etape.issueId} data-profondeur={etape.profondeur}>
              <div className="atl-frise-ligne">
                <LienHote vers={etape.lien} className={etape.profondeur === 0 ? "atl-lien atl-mission-titre" : "atl-lien"}>
                  {etape.titre}
                </LienHote>
                <Pastille ton={TON_STATUT_NATIF[etape.statut] ?? "neutre"}>{etape.statutLibelle}</Pastille>
                <span className="atl-frise-agent">{etape.agent ? etape.agent.nom : "Pas encore confiée"}</span>
                <Horodatage iso={etape.misAJourLe} />
              </div>
              {etape.dernierCommentaire ? <span className="atl-frise-commentaire">{etape.dernierCommentaire.resume}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}
