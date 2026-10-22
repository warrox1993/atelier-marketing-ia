/**
 * Frise d'avancement d'une mission : six phases (Stratégie, Production, Coordonnées, Revue, Contrôles, Réponse), chacune
 * avec son état écrit en toutes lettres ET dessiné par une forme différente (jamais la couleur seule), le nombre de
 * tâches et la dernière activité. Un clic sur une phase déplie la liste de ses tâches, avec un lien vers chacune.
 * Les missions terminées se replient en une ligne « Terminée ». Lecture seule : tout vient de `avancement-missions.ts`.
 */
import { useId, useState } from "react";
import { annoncePhase, LIBELLES_ETAT, libelleStatutTache, type AvancementMission, type EtatPhase, type IdPhase, type Phase } from "../avancement-missions.js";
import { LienHote } from "../composants.js";
import { enDate, ilYA } from "../format.js";

/** Terminées montrées en ligne ; les autres sont comptées. */
export const TERMINEES_AFFICHEES = 3;

/** Marqueur dessiné : coche (faite), disque à moitié plein (en cours), point d'exclamation (attend), cercle vide (à venir), tiret (non prévue). */
export function Marqueur({ etat }: { etat: EtatPhase }) {
  const trait = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg className="atl-frise-marqueur" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      {etat === "faite" ? (
        <>
          <circle cx="10" cy="10" r="9" fill="currentColor" />
          <path d="M6 10.3l2.8 2.8L14 7.6" {...trait} stroke="var(--atl-fond)" />
        </>
      ) : etat === "en_cours" ? (
        <>
          <circle cx="10" cy="10" r="8.25" {...trait} />
          <path d="M10 4.5a5.5 5.5 0 010 11z" fill="currentColor" />
        </>
      ) : etat === "attend_decision" ? (
        <>
          <circle cx="10" cy="10" r="9" fill="currentColor" />
          <path d="M10 5.6v5.2" {...trait} stroke="var(--atl-fond)" strokeWidth={2} />
          <circle cx="10" cy="14" r="1.1" fill="var(--atl-fond)" />
        </>
      ) : etat === "a_venir" ? (
        <circle cx="10" cy="10" r="8.25" {...trait} />
      ) : (
        <path d="M5.5 10h9" {...trait} />
      )}
    </svg>
  );
}

export function derniere(p: Phase): string | null {
  const d = enDate(p.derniere);
  return d ? ilYA(d) : null;
}

export function PanneauTaches({ phase, id }: { phase: Phase; id: string }) {
  return (
    <div id={id} className="atl-frise-taches" data-testid={`frise-taches-${phase.id}`}>
      <ul role="list">
        {phase.taches.map((t) => (
          <li key={t.id}>
            {t.lien && t.identifier ? (
              <LienHote vers={t.lien} className="atl-frise-tache-id">
                {t.identifier}
              </LienHote>
            ) : (
              <span className="atl-frise-tache-id">{t.identifier ?? "sans numéro"}</span>
            )}
            <span className="atl-frise-tache-titre">{t.title}</span>
            <span className="atl-frise-tache-meta">
              {libelleStatutTache(t.status)}
              {t.agentNom ? ` · ${t.agentNom}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FriseMission({ mission }: { mission: AvancementMission }) {
  const base = useId();
  const [ouverte, setOuverte] = useState<IdPhase | null>(null);
  const courante = mission.phases.find((p) => p.etat === "attend_decision") ?? mission.phases.find((p) => p.etat === "en_cours");
  const phaseOuverte = mission.phases.find((p) => p.id === ouverte && p.taches.length > 0);
  return (
    <article className="atl-frise" aria-label={`Avancement de la mission ${mission.racine.identifier ?? ""} du service ${mission.nom}`.replace(/\s+/g, " ")} data-testid="frise-mission">
      <header className="atl-frise-entete">
        <p className="atl-frise-titre" title={mission.racine.title}>
          <span className="atl-frise-service">{mission.nom}</span>
          <span className="atl-frise-mission">{mission.racine.title}</span>
        </p>
        {courante ? <p className="atl-frise-resume">{courante.etat === "attend_decision" ? `${courante.libelle} : vous devez décider` : `En cours : ${courante.libelle}`}</p> : null}
      </header>
      <ol className="atl-frise-pas" role="list">
        {mission.phases.map((p) => {
          const quand = derniere(p);
          const n = p.taches.length;
          const corps = (
            <>
              <Marqueur etat={p.etat} />
              <span className="atl-frise-texte">
                <span className="atl-frise-nom">{p.libelle}</span>
                <span className="atl-frise-etat">{LIBELLES_ETAT[p.etat]}</span>
                {n > 0 || quand ? (
                  <span className="atl-frise-detail">
                    {n > 0 ? `${n} tâche${n > 1 ? "s" : ""}` : ""}
                    {n > 0 && quand ? " · " : ""}
                    {quand ?? ""}
                  </span>
                ) : null}
              </span>
            </>
          );
          return (
            <li key={p.id} className="atl-frise-phase" data-etat={p.etat} data-phase={p.id} aria-current={p === courante ? "step" : undefined}>
              {n > 0 ? (
                <button
                  type="button"
                  className="atl-frise-bouton"
                  aria-expanded={ouverte === p.id}
                  aria-controls={`${base}-${p.id}`}
                  aria-label={`${annoncePhase(p)}${quand ? `, dernière activité ${quand}` : ""}`}
                  onClick={() => setOuverte((o) => (o === p.id ? null : p.id))}
                >
                  {corps}
                </button>
              ) : (
                <div className="atl-frise-bouton" role="group" aria-label={annoncePhase(p)}>
                  {corps}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {phaseOuverte ? <PanneauTaches phase={phaseOuverte} id={`${base}-${phaseOuverte.id}`} /> : null}
    </article>
  );
}

/** Zone de frises en tête du fil : une frise par mission en cours, une ligne « Terminée » par mission close. */
export function FrisesMissions({ enCours, terminees }: { enCours: readonly AvancementMission[]; terminees: readonly AvancementMission[] }) {
  if (enCours.length === 0 && terminees.length === 0) return null;
  const visibles = terminees.slice(0, TERMINEES_AFFICHEES);
  const reste = terminees.length - visibles.length;
  return (
    <section className="atl-frises" aria-label="Avancement des missions" data-testid="frises-missions">
      {enCours.map((m) => (
        <FriseMission key={m.racine.id} mission={m} />
      ))}
      {visibles.length > 0 ? (
        <ul className="atl-frise-finies" role="list" aria-label="Missions terminées">
          {visibles.map((m) => (
            <li key={m.racine.id} data-testid="frise-terminee">
              <span className="atl-frise-fini-marque" aria-hidden="true">
                <Marqueur etat="faite" />
              </span>
              <span className="atl-frise-fini-texte" title={m.racine.title}>
                {m.nom} : {m.racine.title}
              </span>
              <span className="atl-frise-fini-etat">Terminée</span>
            </li>
          ))}
          {reste > 0 ? <li className="atl-frise-fini-reste">et {reste} autre{reste > 1 ? "s" : ""} terminée{reste > 1 ? "s" : ""}</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
