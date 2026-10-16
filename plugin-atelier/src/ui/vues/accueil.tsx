/**
 * Accueil de l'atelier (lot 1) : une seule page pour savoir quoi faire, demander quelque chose à
 * l'équipe et suivre ce qu'elle fait. Lecture seule hors l'envoi d'une demande, qui devient une
 * tâche native confiée au Coordinateur.
 */
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { ElementAccueil, EtapeMission, MissionResumee, UrgenceAccueil } from "../../serveur/services-accueil.js";
import { SurPlace, traitableSurPlace } from "../accueil-sur-place.js";
import { compterAFaire, publierNombreAFaire } from "../compteur-afaire.js";
import { Bouton, Champ, Chargement, EnTete, EtatErreur, Horodatage, LienHote, MessageFait, Pastille, Section, Vide } from "../composants.js";
import { ApprobationGroupee } from "../decision-livrable.js";
import { MODELES_DEMANDE, useEnvoiDemande } from "../demande.js";
import type { Ton } from "../format.js";
import { appelRoute } from "../routes-prospection.js";
import { EncartPassageAuReel } from "../realite.js";
import { chemin } from "../route.js";
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
  const surTraite = useCallback(
    (element: ElementAccueil, message: string) => {
      setTraites((t) => new Set(t).add(element.id));
      setConfirmation(`${element.titre} : ${message}`);
      recharger();
    },
    [recharger],
  );
  // Modèle posé depuis l'encart Prospection : `n` change à chaque clic pour rejouer l'effet.
  const [modeleExterne, setModeleExterne] = useState<{ texte: string; n: number }>({ texte: "", n: 0 });

  return (
    <>
      <style>{STYLES_ACCUEIL}</style>
      <EnTete titre="Accueil" description="Ce qui attend votre décision, une zone pour demander quelque chose à l'équipe, et l'avancement de ses missions." />
      <EncartProspection companyId={companyId ?? null} onModele={() => setModeleExterne((m) => ({ texte: MODELE_PROSPECTION, n: m.n + 1 }))} />
      <EncartPassageAuReel />
      <DemanderAEquipe companyId={companyId ?? null} onEnvoyee={recharger} modeleExterne={modeleExterne} />
      <Section titre="À faire" id="accueil-afaire">
        {etat.erreur ? <EtatErreur erreur={etat.erreur} onReessayer={recharger} contexte="l'accueil" /> : null}
        {etat.chargement && !etat.data ? <Chargement libelle="Chargement de l'accueil" /> : null}
        {confirmation ? (
          <MessageFait className="atl-succes atl-afaire-confirmation" texte={confirmation} />
        ) : null}
        {etat.data ? (
          <ApprobationGroupee
            elements={etat.data.elements.filter((e) => e.type === "contenu_a_valider" && e.issueId && !traites.has(e.id)).map((e) => ({ issueId: e.issueId as string, titre: e.titre }))}
            onFait={(ids) => {
              const elementsTraites = (etat.data?.elements ?? []).filter((e) => e.issueId && ids.includes(e.issueId) && e.type === "contenu_a_valider");
              setTraites((t) => new Set([...t, ...elementsTraites.map((e) => e.id)]));
              recharger();
            }}
          />
        ) : null}
        {etat.data ? <AFaire elements={etat.data.elements.filter((e) => !traites.has(e.id))} onFait={surTraite} /> : null}
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

const MODELE_PROSPECTION = MODELES_DEMANDE.find((m) => m.libelle === "Prospection d'une zone")?.texte ?? "";

interface TotauxProspection {
  total: number;
  qualifies: number;
}

/** Encart d'accueil : la prospection d'abord (total de leads, leads qualifiés, accès aux prospects et à la carte). */
function EncartProspection({ companyId, onModele }: { companyId: string | null; onModele: () => void }) {
  const [etat, setEtat] = useState<{ data: TotauxProspection | null; erreur: unknown; chargement: boolean }>({ data: null, erreur: null, chargement: true });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    const base = `companyId=${encodeURIComponent(companyId)}&parPage=1&vue=complete`;
    const total = (r: { total?: unknown }): number => {
      if (typeof r.total !== "number") throw new Error("Réponse de prospection sans total.");
      return r.total;
    };
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    Promise.all([appelRoute<{ total?: unknown }>("GET", `/prospects?${base}`), appelRoute<{ total?: unknown }>("GET", `/prospects?${base}&qualifiesSeulement=true`)])
      .then(([tous, qualifies]) => !annule && setEtat({ data: { total: total(tous), qualifies: total(qualifies) }, erreur: null, chargement: false }))
      .catch((erreur: unknown) => !annule && setEtat({ data: null, erreur, chargement: false }));
    return () => {
      annule = true;
    };
  }, [companyId, version]);

  return (
    <Section titre="Prospection" id="accueil-prospection">
      <div className="atl-prospection">
        {etat.erreur ? <EtatErreur erreur={etat.erreur} onReessayer={() => setVersion((v) => v + 1)} contexte="la prospection" /> : null}
        {etat.chargement && !etat.data && !etat.erreur ? <Chargement libelle="Chargement de la prospection" lignes={1} /> : null}
        {etat.data && etat.data.total === 0 ? (
          <>
            <p>Aucun lead pour l'instant : demandez une prospection à l'équipe.</p>
            <div className="atl-prospection-actions">
              <Bouton variante="principal" onClick={onModele}>
                Utiliser le modèle « Prospection d'une zone »
              </Bouton>
            </div>
          </>
        ) : null}
        {etat.data && etat.data.total > 0 ? (
          <>
            <div className="atl-prospection-chiffres">
              <p className="atl-prospection-chiffre">
                <span className="atl-prospection-valeur">{etat.data.total}</span>
                <span>{etat.data.total > 1 ? "leads au total" : "lead au total"}</span>
              </p>
              <p className="atl-prospection-chiffre">
                <span className="atl-prospection-valeur">{etat.data.qualifies}</span>
                <span>{etat.data.qualifies > 1 ? "leads qualifiés" : "lead qualifié"}</span>
              </p>
            </div>
            <div className="atl-prospection-actions">
              <LienHote vers={chemin("prospects")} className="atl-bouton">
                Voir les prospects
              </LienHote>
              <LienHote vers={chemin("carte")} className="atl-bouton">
                Voir la carte
              </LienHote>
            </div>
          </>
        ) : null}
      </div>
    </Section>
  );
}

function DemanderAEquipe({ companyId, onEnvoyee, modeleExterne }: { companyId: string | null; onEnvoyee: () => void; modeleExterne: { texte: string; n: number } }) {
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
  // Modèle demandé depuis l'encart Prospection.
  useEffect(() => {
    if (modeleExterne.n > 0) appliquerModele(modeleExterne.texte);
  }, [modeleExterne]);
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

function AFaire({ elements, onFait }: { elements: ElementAccueil[]; onFait(element: ElementAccueil, message: string): void }) {
  if (elements.length === 0) return <Vide titre="Rien n'attend votre décision.">Quand l'équipe aura besoin de vous, la demande apparaîtra ici.</Vide>;
  return (
    <ul className="atl-afaire">
      {elements.map((e) => (
        <LigneAFaire key={e.id} element={e} onFait={(m) => onFait(e, m)} />
      ))}
    </ul>
  );
}

function LigneAFaire({ element: e, onFait }: { element: ElementAccueil; onFait(message: string): void }) {
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
