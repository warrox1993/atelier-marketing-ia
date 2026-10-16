/**
 * Rubrique 3 : contenus à valider (cahier §9 et §12).
 * Liste des dossiers prêts pour l'humain, bloqués affichés à part ; dossier
 * complet (versions, sources, matrice de couverture, revues, constats résolus
 * et restants, limites, questions, porte, usage) ; décision humaine.
 */
import { useState, type FormEvent } from "react";
import { MarkdownBlock } from "@paperclipai/plugin-sdk/ui";
import type { DecisionHumaine, Diffusion, DossierHumain, LigneMatrice, RelanceCorrection } from "../../contrats/dossier.js";
import type { Constat, VerdictRevue } from "../../contrats/revues.js";
import type { ChronologieExecution, ResumeDossier, VueContenusAValider } from "../../contrats/ui.js";
import { Champ, Bouton, EnTete, EtatErreur, Fraicheur, Horodatage, LienHote, Lecture, ListeOuAucun, Pastille, PastilleStatut, Section, Vide } from "../composants.js";
import { useAction, useDonnees } from "../donnees.js";
import {
  ACTIONS_EXTERNES,
  ACTIONS_HUMAINES,
  CATEGORIES_CONSTAT,
  COUVERTURES,
  DECISIONS_PORTE,
  ETAPES_CHRONOLOGIE,
  ETATS_DIFFUSION,
  euros,
  GRAVITES,
  idCourt,
  libelleEvenement,
  libelleRun,
  RESOLUTIONS,
  ROLES_REVUE,
  SOURCES_CHRONOLOGIE,
  STATUTS_ACCES_SOURCE,
  VERDICTS,
} from "../format.js";
import { ApprobationGroupee, DecisionPanneau, raisonDecision } from "../decision-livrable.js";

/** Gardes de la décision : définies dans le composant partagé, ré-exportées pour les tests existants. */
export { raisonDecision };
import { actionRecuperation, appliquerPalierAgent, ecrireVersionHumaine, reprendreTache } from "../hote.js";
import { CLE_LIVRABLE_DEFAUT } from "../../contrats/identifiants.js";
import { chemin } from "../route.js";
import { canalDePasserelle, SectionAppels, SuiviDiffusionReelle } from "./appels.js";

export function VueContenus({ id }: { id: string | null }) {
  return id ? <Dossier issueId={id} /> : <ListeContenus />;
}

function ListeContenus() {
  const r = useDonnees<VueContenusAValider>("atelier.contenus-a-valider");
  return (
    <>
      <EnTete
        titre="Contenus à valider"
        description="Seuls les livrables dont le contrôle automatique est réussi arrivent ici. Les livrables bloqués avant validation sont listés à part, avec leur motif."
      />
      <Fraicheur chargeLe={r.chargeLe} actualisation={r.loading && r.data !== null} />
      <Lecture r={r} libelle="contenus à valider">
        {(d) => (
          <>
            <Section titre={`Prêts pour validation humaine (${d.prets.length})`} aide="Contrôles applicables réussis, aucune exigence bloquante.">
              {/* Toujours monté : le bilan d'une approbation groupée reste affiché quand la liste se recharge. */}
              <ApprobationGroupee elements={d.prets.filter((l) => l.decisionPorte === "PASS")} onFait={() => r.refresh()} />
              {d.prets.length === 0 ? (
                <Vide titre="Rien à valider pour l'instant.">Un livrable arrive ici quand ses revues sont réussies et que le contrôle automatique est réussi sur sa révision courante.</Vide>
              ) : (
                <TableDossiers lignes={d.prets} />
              )}
            </Section>
            <Section titre={`Bloqués avant validation (${d.bloques.length})`} aide="Information manquante, dépendance, budget, cycles de correction épuisés : ces livrables ne sont pas présentés comme prêts.">
              {d.bloques.length === 0 ? <p className="atl-attenue">Aucun livrable bloqué.</p> : <TableDossiers lignes={d.bloques} bloques />}
            </Section>
          </>
        )}
      </Lecture>
    </>
  );
}

function TableDossiers({ lignes, bloques = false }: { lignes: ResumeDossier[]; bloques?: boolean }) {
  return (
    <div className="atl-table-cadre">
      <table className="atl-table">
        <thead>
          <tr>
            <th scope="col">Livrable</th>
            <th scope="col">{bloques ? "Motif" : "Statut"}</th>
            <th scope="col">Révision</th>
            <th scope="col">Contrôle automatique</th>
            <th scope="col" className="atl-num">Constats ouverts</th>
            <th scope="col">Modifié</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.issueId}>
              <th scope="row" data-libelle="Livrable">
                <LienHote vers={chemin("contenus", l.issueId)}>{l.titre}</LienHote>
                <span className="atl-sous">
                  {l.identifier ?? idCourt(l.issueId)}
                </span>
              </th>
              <td data-libelle={bloques ? "Motif" : "Statut"}>
                <span className="atl-pile">
                  <PastilleStatut statut={l.statut} motif={l.motif} />
                  {bloques ? <span className="atl-sous">{l.motif}</span> : null}
                </span>
              </td>
              <td data-libelle="Révision">{l.revisionNumber ?? <span className="atl-attenue">aucune</span>}</td>
              <td data-libelle="Contrôle automatique">
                {l.decisionPorte ? <Pastille ton={DECISIONS_PORTE[l.decisionPorte]?.ton}>{DECISIONS_PORTE[l.decisionPorte]?.libelle}</Pastille> : <span className="atl-attenue">non évaluée</span>}
              </td>
              <td data-libelle="Constats ouverts" className="atl-num">
                {l.constatsOuverts}
              </td>
              <td data-libelle="Modifié">
                <Horodatage iso={l.modifieLe} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dossier humain                                                        */
/* ------------------------------------------------------------------ */

export function Dossier({ issueId, compact = false }: { issueId: string; compact?: boolean }) {
  const r = useDonnees<DossierHumain>("atelier.dossier", { issueId });
  return (
    <Lecture r={r} libelle="dossier">
      {(d) => (
        <>
          {compact ? (
            <div className="atl-pile-ligne">
              <PastilleStatut statut={d.statut.statut} motif={d.statut.motif} />
              <span className="atl-attenue">{d.statut.motif}</span>
              <LienHote vers={chemin("contenus", d.issueId)}>Ouvrir le dossier complet</LienHote>
            </div>
          ) : (
            <EnTete
              titre={d.titre}
              retour={<LienHote vers={chemin("contenus")}>Contenus à valider</LienHote>}
              description={
                <span className="atl-pile-ligne">
                  <PastilleStatut statut={d.statut.statut} motif={d.statut.motif} />
                  <span>{d.statut.motif}</span>
                  <LienHote vers={`/issues/${d.issueId}`}>Tâche Paperclip</LienHote>
                  {d.campagneId ? <LienHote vers={chemin("campagnes", d.campagneId)}>Campagne</LienHote> : null}
                </span>
              }
            />
          )}
          {!compact ? <Fraicheur chargeLe={r.chargeLe} actualisation={r.loading} /> : null}
          <div className="atl-dossier">
            <div className="atl-dossier-principal">
              <SyntheseControles dossier={d} />
              <Section titre="Livrable" aide={d.livrable ? `Révision ${d.livrable.revisionNumber} (courante), document natif « livrable ».` : undefined}>
                {d.livrable ? (
                  <div className="atl-livrable">
                    {d.livrable.titre ? <p className="atl-livrable-titre">{d.livrable.titre}</p> : null}
                    <MarkdownBlock content={abaisserTitres(d.livrable.corps)} />
                  </div>
                ) : (
                  <p className="atl-attenue">Aucun livrable produit pour l'instant.</p>
                )}
              </Section>
              <SectionAppels dossier={d} />
              <Matrice lignes={d.matrice} revisionCourante={d.livrable?.revisionId ?? null} />
              <Constats titre="Constats restants" constats={d.constatsRestants} vide="Aucun constat ouvert." />
              <Constats titre="Constats résolus" constats={d.constatsResolus} vide="Aucun constat résolu pour l'instant." />
              <Revues revues={d.revues} revisionCourante={d.livrable?.revisionId ?? null} />
              {!compact ? <BriefEtPerimetre dossier={d} /> : null}
              <Sources dossier={d} />
              <LimitesQuestions dossier={d} />
              <Chronologie issueId={d.issueId} />
            </div>
            <aside className="atl-dossier-cote" aria-label="Décision humaine et usage">
              <DecisionPanneau dossier={d} onFait={() => r.refresh()} />
              <ReprisePanneau dossier={d} onFait={r.refresh} />
              <RelancePanneau dossier={d} onFait={r.refresh} />
              <DiffusionPanneau dossier={d} onFait={r.refresh} />
              <Historique decisions={d.decisions} dossier={d} />
              <Usage dossier={d} />
            </aside>
          </div>
        </>
      )}
    </Lecture>
  );
}

/**
 * Le livrable est affiché sous le titre de section « Livrable » (h2) : ses titres
 * Markdown sont abaissés de deux niveaux (# devient ###) pour garder une seule
 * h1 par page et une hiérarchie lisible par les lecteurs d'écran. Le texte n'est
 * pas modifié ; les blocs de code sont laissés tels quels.
 */
export function abaisserTitres(markdown: string): string {
  let code = false;
  return markdown
    .split("\n")
    .map((ligne) => {
      if (/^\s*(```|~~~)/u.test(ligne)) code = !code;
      if (code) return ligne;
      const m = /^(#{1,6})(\s)/u.exec(ligne);
      return m ? `${"#".repeat(Math.min(6, m[1]!.length + 2))}${ligne.slice(m[1]!.length)}` : ligne;
    })
    .join("\n");
}

/** Une exigence citée par son code (REQ-001) s'affiche par son titre ; le code reste en petit, pour retrouver la ligne. */
function ExigenceNommee({ code, matrice }: { code: string; matrice: DossierHumain["matrice"] }) {
  const titre = matrice.find((l) => l.exigence.code === code)?.exigence.interpretation;
  return (
    <span className="atl-marge-g">
      {titre ? `${titre} ` : null}
      <code className="atl-sous">{code}</code>
    </span>
  );
}

function SyntheseControles({ dossier: d }: { dossier: DossierHumain }) {
  const ev = d.evaluationPorte;
  const obligatoires = d.matrice.filter((l) => l.exigence.obligatoire);
  const couvertes = obligatoires.filter((l) => l.couverture?.etat === "couvert" || l.couverture?.etat === "na_justifie");
  return (
    <Section titre="Contrôles">
      <dl className="atl-chiffres">
        <div>
          <dt>Contrôle automatique</dt>
          <dd>
            {ev ? <Pastille ton={DECISIONS_PORTE[ev.decision]?.ton}>{DECISIONS_PORTE[ev.decision]?.libelle}</Pastille> : <span className="atl-attenue">non évaluée</span>}
            {ev?.perimee ? <Pastille ton="attention">Évaluation périmée</Pastille> : null}
            {ev?.cyclesEpuises ? <Pastille ton="danger">Cycles épuisés</Pastille> : null}
          </dd>
        </div>
        <div>
          <dt>Exigences obligatoires couvertes</dt>
          <dd>
            {couvertes.length} sur {obligatoires.length}
          </dd>
        </div>
        <div>
          <dt>Constats</dt>
          <dd>
            {d.constatsRestants.length} ouvert{d.constatsRestants.length > 1 ? "s" : ""}, {d.constatsResolus.length} résolu{d.constatsResolus.length > 1 ? "s" : ""}
          </dd>
        </div>
        <div>
          <dt>Revues</dt>
          <dd>{d.revues.length}</dd>
        </div>
      </dl>
      {ev && ev.motifs.length ? (
        <ul className="atl-liste">
          {ev.motifs.map((m, i) => (
            <li key={`${m.code}-${i}`}>
              {m.message}
              {m.exigence ? <ExigenceNommee code={m.exigence} matrice={d.matrice} /> : null}
              {m.element ? <span className="atl-attenue"> ({m.element})</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {ev ? (
        <p className="atl-sous">
          Évaluée <Horodatage iso={ev.creeLe} /> par {ev.evalueePar} ; empreinte des entrées <code>{ev.empreinte.slice(0, 12)}</code>
          {ev.revisionId && d.livrable && ev.revisionId !== d.livrable.revisionId ? " ; contrôle automatique calculé sur une révision antérieure" : ""}.
        </p>
      ) : null}
    </Section>
  );
}

function Matrice({ lignes, revisionCourante }: { lignes: LigneMatrice[]; revisionCourante: string | null }) {
  return (
    <Section titre="Matrice de couverture" aide="Pour chaque exigence : déclaration du producteur, preuves localisées dans la révision, verdict de chaque relecteur.">
      {lignes.length === 0 ? (
        <p className="atl-attenue">Aucune exigence ciblée par cette tâche.</p>
      ) : (
        <div className="atl-table-cadre">
          <table className="atl-table atl-table-matrice">
            <thead>
              <tr>
                <th scope="col">Exigence</th>
                <th scope="col">Couverture</th>
                <th scope="col">Preuves</th>
                {(["exigences", "metier", "technique"] as const).map((r) => (
                  <th scope="col" key={r} title={ROLES_REVUE[r]}>
                    {ROLES_COURTS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const c = l.couverture;
                const preuvesAutre = c ? c.preuves.filter((p) => revisionCourante && p.revisionId !== revisionCourante).length : 0;
                return (
                  <tr key={l.exigence.id}>
                    <th scope="row" data-libelle="Exigence">
                      {l.exigence.interpretation} {l.exigence.obligatoire ? null : <span className="atl-attenue">(facultative)</span>}
                      <span className="atl-sous">
                        <code>{l.exigence.code}</code>
                      </span>
                    </th>
                    <td data-libelle="Couverture">
                      {c ? <Pastille ton={COUVERTURES[c.etat]?.ton}>{COUVERTURES[c.etat]?.libelle ?? c.etat}</Pastille> : <Pastille ton="danger">Non déclarée</Pastille>}
                      {!l.examineeParControleur ? <span className="atl-sous">Non examinée par le contrôleur</span> : null}
                      {c?.question ? <span className="atl-sous">Question : {c.question}</span> : null}
                    </td>
                    <td data-libelle="Preuves">
                      {c && c.preuves.length ? (
                        <ul className="atl-liste-compacte">
                          {c.preuves.map((p, i) => (
                            <li key={i}>
                              {p.element ? <strong>{p.element} : </strong> : null}
                              <span className="atl-attenue">{p.emplacement}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="atl-attenue">aucune</span>
                      )}
                      {l.exigence.elementsAttendus.length ? (
                        <ElementsSansPreuve attendus={l.exigence.elementsAttendus} prouves={c?.preuves.map((p) => p.element ?? "") ?? []} />
                      ) : null}
                      {preuvesAutre ? <span className="atl-sous">{preuvesAutre} preuve(s) sur une autre révision</span> : null}
                    </td>
                    {(["exigences", "metier", "technique"] as const).map((role) => {
                      const v = l.verdictsParRole[role] ?? "absent";
                      return (
                        <td key={role} data-libelle={ROLES_REVUE[role]}>
                          <Pastille ton={VERDICTS[v]?.ton}>{VERDICTS[v]?.libelle ?? v}</Pastille>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

const ROLES_COURTS = { exigences: "Revue exigences", metier: "Revue métier", technique: "Revue technique" } as const;

function ElementsSansPreuve({ attendus, prouves }: { attendus: string[]; prouves: string[] }) {
  const manquants = attendus.filter((a) => !prouves.includes(a));
  if (!manquants.length) return <span className="atl-sous">Chaque élément attendu a sa preuve.</span>;
  return <span className="atl-sous atl-texte-danger">Sans preuve : {manquants.join(", ")}</span>;
}

function Constats({ titre, constats, vide }: { titre: string; constats: Constat[]; vide: string }) {
  return (
    <Section titre={`${titre} (${constats.length})`}>
      {constats.length === 0 ? (
        <p className="atl-attenue">{vide}</p>
      ) : (
        <ul className="atl-constats">
          {constats.map((c) => (
            <li key={c.findingId} className="atl-constat">
              <div className="atl-pile-ligne">
                <Pastille ton={GRAVITES[c.gravite]?.ton}>{GRAVITES[c.gravite]?.libelle ?? c.gravite}</Pastille>
                <strong>{CATEGORIES_CONSTAT[c.categorie] ?? c.categorie}</strong>
                <span className="atl-attenue">
                  {ROLES_REVUE[c.role]} ; {RESOLUTIONS[c.statutResolution] ?? c.statutResolution}
                </span>
              </div>
              <p>{c.description}</p>
              <dl className="atl-champs atl-champs-compacts">
                <div>
                  <dt>Emplacement</dt>
                  <dd>{c.emplacement}</dd>
                </div>
                <div>
                  <dt>Preuve</dt>
                  <dd>{c.preuve}</dd>
                </div>
                <div>
                  <dt>Correction attendue</dt>
                  <dd>{c.correctionAttendue}</dd>
                </div>
                {c.requirementIds.length ? (
                  <div>
                    <dt>Exigences</dt>
                    <dd>{c.requirementIds.join(", ")}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="atl-sous">
                {c.findingId} ; relevé <Horodatage iso={c.creeLe} />
                {c.resoluDansRevision ? ` ; résolu dans la révision ${idCourt(c.resoluDansRevision)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Revues({ revues, revisionCourante }: { revues: VerdictRevue[]; revisionCourante: string | null }) {
  return (
    <Section titre={`Revues exécutées (${revues.length})`} aide="Chaque verdict vise une révision précise ; un verdict sur une ancienne révision ne vaut pas pour la courante.">
      {revues.length === 0 ? (
        <p className="atl-attenue">Aucune revue déposée.</p>
      ) : (
        <ol className="atl-fil">
          {revues.map((v) => (
            <li key={v.id}>
              <div className="atl-fil-tete">
                <strong>{ROLES_REVUE[v.role]}</strong>
                <Pastille ton={VERDICTS[v.verdict]?.ton}>{VERDICTS[v.verdict]?.libelle ?? v.verdict}</Pastille>
                {revisionCourante && v.revisionId !== revisionCourante ? <Pastille>Ancienne révision</Pastille> : null}
              </div>
              <p className="atl-fil-texte">
                Exigences examinées : <ListeOuAucun valeurs={v.exigencesExaminees} aucun="aucune" /> ; {v.preuvesVerifiees.length} preuve(s) vérifiée(s) ; {v.constats.length} constat(s)
                {v.constatsResolus.length ? ` ; ${v.constatsResolus.length} constat(s) déclaré(s) résolu(s)` : ""}.
              </p>
              {v.justification ? <p className="atl-fil-texte">Justification : {v.justification}</p> : null}
              {v.limites.length ? <p className="atl-sous">Limites : {v.limites.join(" ; ")}</p> : null}
              {v.controlesNonExecutes.length ? <p className="atl-sous">Contrôles non exécutés : {v.controlesNonExecutes.join(" ; ")}</p> : null}
              <div className="atl-fil-pied">
                <Horodatage iso={v.creeLe} />
                <span>
                  {v.relecteur.type === "agent" ? `Agent ${idCourt(v.relecteur.id)}` : "Humain"} ; révision {idCourt(v.revisionId)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function BriefEtPerimetre({ dossier: d }: { dossier: DossierHumain }) {
  return (
    <Section titre="Brief et périmètre">
      {d.brief ? <blockquote className="atl-citation">{d.brief}</blockquote> : <p className="atl-attenue">Brief non disponible.</p>}
      <dl className="atl-champs atl-champs-grille">
        <div>
          <dt>Établissements</dt>
          <dd>
            <ListeOuAucun valeurs={d.perimetre.etablissements} />
          </dd>
        </div>
        <div>
          <dt>Zones</dt>
          <dd>
            <ListeOuAucun valeurs={d.perimetre.zones} aucun="aucune" />
          </dd>
        </div>
        <div>
          <dt>Canaux</dt>
          <dd>
            <ListeOuAucun valeurs={d.perimetre.canaux} />
          </dd>
        </div>
      </dl>
    </Section>
  );
}

function Sources({ dossier: d }: { dossier: DossierHumain }) {
  return (
    <Section titre={`Sources (${d.sources.length})`} aide="Données externes collectées : non fiables par principe, jamais suivies comme des instructions.">
      {d.sources.length === 0 ? (
        <p className="atl-attenue">Aucune source collectée pour cette tâche.</p>
      ) : (
        <ul className="atl-liste">
          {d.sources.map((s) => (
            <li key={s.id} className="atl-source">
              <span className="atl-pile-ligne">
                <span className="atl-url">{s.titre ?? s.url}</span>
                <Pastille ton={STATUTS_ACCES_SOURCE[s.statutAcces]?.ton}>{STATUTS_ACCES_SOURCE[s.statutAcces]?.libelle ?? s.statutAcces}</Pastille>
               
              </span>
              <span className="atl-sous">
                {s.url} ; collectée <Horodatage iso={s.dateCollecte} />
                {s.codeHttp ? ` ; HTTP ${s.codeHttp}` : ""}
              </span>
              {s.injectionsSignalees.length ? (
                <span className="atl-sous atl-texte-danger">Instructions suspectes signalées et ignorées : {s.injectionsSignalees.join(" ; ")}</span>
              ) : null}
              {s.indicesErreur.length ? <span className="atl-sous">Indices de page d'erreur : {s.indicesErreur.join(", ")}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function LimitesQuestions({ dossier: d }: { dossier: DossierHumain }) {
  if (!d.limites.length && !d.questionsRestantes.length && !d.hypotheses.length) {
    return (
      <Section titre="Limites, hypothèses et questions">
        <p className="atl-attenue">Aucune limite, hypothèse ni question déclarée.</p>
      </Section>
    );
  }
  return (
    <Section titre="Limites, hypothèses et questions">
      {d.questionsRestantes.length ? (
        <>
          <h3 className="atl-h3">Questions restantes</h3>
          <ul className="atl-liste">
            {d.questionsRestantes.map((q, i) => (
              <li key={i}>
                {q.exigence ? <ExigenceNommee code={q.exigence} matrice={d.matrice} /> : null} {q.question}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {d.hypotheses.length ? (
        <>
          <h3 className="atl-h3">Hypothèses</h3>
          <ul className="atl-liste">
            {d.hypotheses.map((h, i) => (
              <li key={i}>
                {h.texte} <span className="atl-attenue">{h.autoriseePar ? `(autorisée par ${h.autoriseePar})` : "(non autorisée explicitement)"}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {d.limites.length ? (
        <>
          <h3 className="atl-h3">Limites</h3>
          <ul className="atl-liste">
            {d.limites.map((l, i) => (
              <li key={`${i}-${l}`}>{l}</li>
            ))}
          </ul>
        </>
      ) : null}
    </Section>
  );
}

function Usage({ dossier: d }: { dossier: DossierHumain }) {
  return (
    <Section titre="Usage et coûts">
      <dl className="atl-champs">
        <div>
          <dt>Coût IA</dt>
          <dd>
            {euros(d.usage.coutIaCents)} {d.usage.estimation ? <Pastille ton="attention">Estimation</Pastille> : null}
            <span className="atl-sous">{d.usage.sourceUsage}</span>
          </dd>
        </div>
        <div>
          <dt>Dépenses publicitaires</dt>
          <dd>{d.usage.depensesPublicitairesCents === null ? <span className="atl-attenue">aucune importée (séparées des coûts IA)</span> : euros(d.usage.depensesPublicitairesCents)}</dd>
        </div>
      </dl>
    </Section>
  );
}

function Historique({ decisions, dossier: d }: { decisions: DecisionHumaine[]; dossier: DossierHumain }) {
  return (
    <Section titre="Décisions et diffusions">
      {decisions.length === 0 ? (
        <p className="atl-attenue">Aucune décision humaine enregistrée.</p>
      ) : (
        <ol className="atl-fil">
          {decisions.map((x) => (
            <li key={x.id}>
              <div className="atl-fil-tete">
                <strong>{ACTIONS_HUMAINES[x.action]}</strong>
                {x.invalidee ? <Pastille ton="attention">Invalidée par une nouvelle révision</Pastille> : null}
               
              </div>
              <p className="atl-fil-texte">{x.commentaire}</p>
              {x.portee ? (
                <p className="atl-sous">
                  Portée : {ACTIONS_EXTERNES[x.portee.action]}
                  {x.portee.canal ? `, canal ${x.portee.canal}` : ""}
                  {x.portee.compte ? `, compte ${x.portee.compte}` : ""}
                  {x.portee.audience ? `, audience ${x.portee.audience}` : ""}
                  {x.portee.montantMaxCents !== null ? `, montant max ${euros(x.portee.montantMaxCents)}` : ""}
                  {x.portee.dureeJours ? `, ${x.portee.dureeJours} jours` : ""}
                </p>
              ) : null}
              <div className="atl-fil-pied">
                <Horodatage iso={x.creeLe} />
                <span>révision {idCourt(x.revisionId)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {d.relances.length ? (
        <>
          <h3 className="atl-h3">Relances de correction</h3>
          <ol className="atl-fil">
            {d.relances.map((x) => (
              <li key={x.id}>
                <div className="atl-fil-tete">
                  <strong>Correction relancée</strong>
                  <Pastille ton="info">{`cycles ${x.maximumAvant} → ${x.maximumApres}`}</Pastille>
                 
                </div>
                <p className="atl-fil-texte">{x.commentaire}</p>
                <p className="atl-sous">Leviers : {x.leviers.map((l) => LEVIERS[l]).join(", ")}</p>
                {x.consigne ? <p className="atl-sous">Consigne : {x.consigne}</p> : null}
                {x.information ? <p className="atl-sous">Information apportée : {x.information.reponse}</p> : null}
                {x.escalade ? <p className="atl-sous">Producteur monté : {x.escalade.avant.modele} {x.escalade.avant.effort} → {x.escalade.apres.modele} {x.escalade.apres.effort}</p> : null}
                {x.revisionCorrigee ? <p className="atl-sous">Version corrigée à la main : révision {idCourt(x.revisionCorrigee)}</p> : null}
                <div className="atl-fil-pied">
                  <Horodatage iso={x.creeLe} />
                  {x.revisionAvant ? <span>après la révision {idCourt(x.revisionAvant)}</span> : null}
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {d.diffusions.length ? (
        <ul className="atl-liste">
          {d.diffusions.map((f) => (
            <li key={f.id}>
              <Pastille ton={ETATS_DIFFUSION[f.etat]?.ton}>{ETATS_DIFFUSION[f.etat]?.libelle ?? f.etat}</Pastille> {ACTIONS_EXTERNES[f.action]} sur {f.canal}
              {f.service || f.outil ? <span className="atl-sous">Appel visé : {[f.service ? `service ${f.service}` : null, f.outil ? `outil ${f.outil}` : null].filter(Boolean).join(", ")}</span> : null}
              {f.motifRefus ? <span className="atl-sous">{f.motifRefus}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Relance de correction (décision de l'opérateur du 15/10/2026)                  */
/* ------------------------------------------------------------------ */

export const LEVIERS: Record<RelanceCorrection["leviers"][number], string> = {
  information: "information manquante apportée",
  consigne: "consigne de correction",
  escalade: "montée d'un cran du producteur",
  version_corrigee: "version corrigée à la main",
};

export interface SaisieRelance {
  commentaire: string;
  information: boolean;
  question: string;
  reponse: string;
  consigne: boolean;
  texteConsigne: string;
  escalade: boolean;
  version: boolean;
  corps: string;
}

/** Relance possible : cycles épuisés, tâche ni terminée ni annulée. */
export function relanceOuverte(d: DossierHumain): boolean {
  return Boolean(d.cycles?.epuises) && !["approved", "completed", "cancelled"].includes(d.statut.statut);
}

/** Raison de désactiver l'envoi, ou null. Aucune option n'accepte le livrable en l'état. */
export function raisonRelance(d: DossierHumain, s: SaisieRelance): string | null {
  if (!relanceOuverte(d)) return "Relance possible seulement quand les cycles de correction sont épuisés.";
  if (!s.commentaire.trim()) return "Un commentaire est obligatoire.";
  if (!s.information && !s.consigne && !s.escalade && !s.version) return "Choisissez au moins un levier.";
  if (s.information && !s.reponse.trim()) return "Indiquez l'information apportée.";
  if (s.consigne && !s.texteConsigne.trim()) return "Écrivez la consigne de correction.";
  if (s.escalade && !d.producteur?.palierSuivant) return d.producteur?.raisonSansPalier ?? "Aucun producteur à monter d'un cran.";
  if (s.version && !s.corps.trim()) return "La version corrigée est vide.";
  if (s.version && d.livrable && s.corps.trim() === d.livrable.corps.trim()) return "La version corrigée est identique à la révision courante.";
  return null;
}

/** Paramètres de l'action `atelier.correction.relancer` (seulement les leviers choisis). */
export function parametresRelance(d: DossierHumain, s: SaisieRelance, revisionCorrigee: string | null = null): Record<string, unknown> {
  const p = d.producteur;
  return {
    issueId: d.issueId,
    commentaire: s.commentaire.trim(),
    information: s.information ? { question: s.question.trim() || null, reponse: s.reponse.trim() } : null,
    consigne: s.consigne ? s.texteConsigne.trim() : null,
    escalade:
      s.escalade && p?.palierSuivant
        ? { agentId: p.agentId, avant: { modele: p.modele ?? "", effort: p.effort ?? "medium" }, apres: p.palierSuivant }
        : null,
    versionCorrigee: s.version && revisionCorrigee ? { revisionId: revisionCorrigee } : null,
  };
}

function RelancePanneau({ dossier: d, onFait }: { dossier: DossierHumain; onFait(): void }) {
  const relancer = useAction<RelanceCorrection>("atelier.correction.relancer");
  const [s, setS] = useState<SaisieRelance>({
    commentaire: "",
    information: false,
    question: d.questionsRestantes[0]?.question ?? "",
    reponse: "",
    consigne: false,
    texteConsigne: "",
    escalade: false,
    version: false,
    corps: d.livrable?.corps ?? "",
  });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [resultat, setResultat] = useState<string | null>(null);
  if (!relanceOuverte(d) && !resultat) return null;
  const raison = raisonRelance(d, s);
  const maj = <K extends keyof SaisieRelance>(cle: K, v: SaisieRelance[K]) => setS((x) => ({ ...x, [cle]: v }));
  const p = d.producteur;

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (raison) return;
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    let palierApplique = false;
    try {
      let revisionCorrigee: string | null = null;
      if (s.version && d.livrable) {
        // Écrite d'abord dans le document natif (session de l'humain), puis vérifiée par le worker.
        const doc = await ecrireVersionHumaine(d.issueId, CLE_LIVRABLE_DEFAUT, d.livrable.titre, s.corps, d.livrable.revisionId);
        revisionCorrigee = doc.latestRevisionId ?? null;
      }
      const params = parametresRelance(d, s, revisionCorrigee);
      if (s.escalade && p?.palierSuivant) {
        // Le SDK des plugins ne modifie pas un agent : le palier est appliqué par l'API
        // native (session de l'humain), puis le worker vérifie la configuration réelle.
        await appliquerPalierAgent(p.agentId, p.palierSuivant);
        palierApplique = true;
      }
      const r = await relancer(params);
      setResultat(
        `Correction relancée : maximum de cycles porté de ${r.maximumAvant} à ${r.maximumApres}. La tâche repart chez le producteur ; la prochaine version repasse toutes les revues et le contrôle automatique.`,
      );
      onFait();
    } catch (err) {
      setErreur(err);
      if (palierApplique) setResultat("Attention : le palier du producteur a été appliqué, mais la relance a été refusée. Corrigez puis renvoyez (le palier ne sera pas remonté une seconde fois).");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Section titre="Relancer la correction" aide="Le livrable n'a pas passé les contrôles : il n'est ni accepté ni diffusé. Aucune option ne permet de l'accepter en l'état.">
      {resultat && !relanceOuverte(d) ? (
        <p className="atl-succes" role="status">
          {resultat}
        </p>
      ) : (
        <form className="atl-formulaire" onSubmit={(e) => void soumettre(e)} noValidate>
          <p className="atl-sous">
            Cycles épuisés : {d.cycles?.consommes} sur {d.cycles?.maximum}. Choisissez au moins un levier&nbsp;: la version suivante repassera tous les contrôles, avec de nouveaux cycles.
          </p>
          <Champ libelle="Commentaire (obligatoire)">
            <textarea value={s.commentaire} onChange={(e) => maj("commentaire", e.target.value)} rows={2} maxLength={4000} />
          </Champ>
          <fieldset className="atl-champ atl-leviers">
            <legend>Leviers</legend>
            <div className="atl-levier">
              <label className="atl-case">
                <input type="checkbox" checked={s.information} onChange={(e) => maj("information", e.target.checked)} /> Apporter l'information manquante
              </label>
              {s.information ? (
                <div className="atl-levier-champs">
                  <Champ libelle="Question bloquante">
                    <input value={s.question} onChange={(e) => maj("question", e.target.value)} maxLength={2000} />
                  </Champ>
                  <Champ libelle="Réponse" aide="Enregistrée comme source de provenance humaine.">
                    <textarea value={s.reponse} onChange={(e) => maj("reponse", e.target.value)} rows={2} maxLength={3500} />
                  </Champ>
                </div>
              ) : null}
            </div>
            <div className="atl-levier">
              <label className="atl-case">
                <input type="checkbox" checked={s.consigne} onChange={(e) => maj("consigne", e.target.checked)} /> Donner une consigne de correction
              </label>
              {s.consigne ? (
                <div className="atl-levier-champs">
                  <Champ libelle="Consigne" aide="Transmise au producteur en plus des constats.">
                    <textarea value={s.texteConsigne} onChange={(e) => maj("texteConsigne", e.target.value)} rows={2} maxLength={4000} />
                  </Champ>
                </div>
              ) : null}
            </div>
            <div className="atl-levier">
              <label className="atl-case">
                <input type="checkbox" checked={s.escalade} disabled={!p?.palierSuivant} onChange={(e) => maj("escalade", e.target.checked)} /> Monter le producteur d'un cran
              </label>
              <p className="atl-aide atl-levier-aide">
                {p?.palierSuivant
                  ? `${p.nom} : ${p.modele} effort ${p.effort ?? "medium"} → ${p.palierSuivant.modele} effort ${p.palierSuivant.effort}.`
                  : (p?.raisonSansPalier ?? "Aucun producteur identifié.")}
              </p>
            </div>
            <div className="atl-levier">
              <label className="atl-case">
                <input type="checkbox" checked={s.version} onChange={(e) => maj("version", e.target.checked)} /> Corriger la version moi-même
              </label>
              {s.version ? (
                <div className="atl-levier-champs">
                  <Champ libelle="Version corrigée (Markdown)" aide="Devient une nouvelle révision du livrable, relue comme les autres.">
                    <textarea value={s.corps} onChange={(e) => maj("corps", e.target.value)} rows={8} />
                  </Champ>
                </div>
              ) : null}
            </div>
          </fieldset>
          <Bouton type="submit" variante="principal" raisonDesactive={raison} enCours={enCours}>
            Relancer la correction
          </Bouton>
          {resultat ? <p className="atl-texte-danger" role="alert">{resultat}</p> : null}
          {erreur ? <EtatErreur erreur={erreur} contexte="relance refusée" /> : null}
        </form>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Reprise après un arrêt du serveur                                     */
/* ------------------------------------------------------------------ */

/** Corps de la réconciliation native : effets constatés (journal de l'atelier) + note de l'humain. */
export function corpsReprise(d: DossierHumain, note: string, actionId: string | null): Record<string, unknown> | null {
  const i = d.interruption;
  if (!i) return null;
  const effets = i.revisionsLivrable + i.couverturesDeclarees + i.diffusions;
  return {
    ...(actionId ? { actionId } : {}),
    outcome: "restored",
    sourceIssueStatus: "todo",
    resolutionNote: note.trim(),
    executionReconciliation: {
      runId: i.runId,
      providerStopped: true,
      actionOutcome: effets > 0 ? "mixed" : "not_performed",
      outcomeEvidence:
        `Passage interrompu ${i.runId} : révisions du livrable ${i.revisionsLivrable}, déclarations de couverture ${i.couverturesDeclarees}, ` +
        `diffusions ${i.diffusions} (journal de l'atelier et révisions natives). Vérifié par l'humain dans l'atelier.`,
    },
  };
}

/** Singulier pour 0 et 1, pluriel au-delà (règle française). */
function accord(n: number, singulier: string, pluriel: string): string {
  return n > 1 ? pluriel : singulier;
}

function ReprisePanneau({ dossier: d, onFait }: { dossier: DossierHumain; onFait(): void }) {
  const [note, setNote] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [resultat, setResultat] = useState<string | null>(null);
  if (!d.interruption && !resultat) return null;
  const raison = note.trim().length < 10 ? "Décrivez en une phrase ce que vous avez vérifié (10 caractères au moins)." : null;
  const reprendre = async () => {
    if (raison) return;
    setEnCours(true);
    setErreur(null);
    try {
      const corps = corpsReprise(d, note, await actionRecuperation(d.issueId));
      if (!corps) return;
      const r = await reprendreTache(d.issueId, corps);
      setResultat(`Reprise enregistrée : la tâche Paperclip repasse à « ${r.issue?.status ?? "todo"} » ; le producteur reprend à l'étape suivante, sans rejouer les effets déjà faits.`);
      onFait();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <Section titre="Reprendre après interruption" aide="Le serveur s'est arrêté pendant un passage : Paperclip ne rejoue rien automatiquement. Vous seul pouvez lever le blocage après vérification.">
      {resultat ? (
        <p className="atl-succes" role="status">
          {resultat}
        </p>
      ) : (
        <>
          <p className="atl-sous">Passage {idCourt(d.interruption!.runId)} interrompu. Effets déjà constatés :</p>
          <p className="atl-resume">
            <span>
              <strong>{d.interruption!.revisionsLivrable}</strong> {accord(d.interruption!.revisionsLivrable, "révision du livrable", "révisions du livrable")}
            </span>
            <span>
              <strong>{d.interruption!.couverturesDeclarees}</strong> {accord(d.interruption!.couverturesDeclarees, "déclaration de couverture", "déclarations de couverture")}
            </span>
            <span>
              <strong>{d.interruption!.diffusions}</strong> {accord(d.interruption!.diffusions, "diffusion", "diffusions")}
            </span>
          </p>
          <Champ libelle="Ce que vous avez vérifié">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} />
          </Champ>
          <Bouton variante="principal" raisonDesactive={raison} enCours={enCours} onClick={() => void reprendre()}>
            Reprendre
          </Bouton>
        </>
      )}
      {erreur ? <EtatErreur erreur={erreur} contexte="reprise refusée" /> : null}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Diffusion (décision de l'opérateur du 15/10/2026)                              */
/* ------------------------------------------------------------------ */

/** Dernière approbation valide autorisant une action externe sur la révision courante. */
export function approbationDiffusable(d: DossierHumain): DecisionHumaine | null {
  const rev = d.livrable?.revisionId;
  return d.decisions.find((x) => x.action === "approuver" && !x.invalidee && x.revisionId === rev && x.portee && x.portee.action !== "aucune_action_externe") ?? null;
}

/**
 * En mode réel, une diffusion sur un canal de la passerelle part de l'AGENT, avec l'appel approuvé :
 * l'interface ne propose pas « Diffuser » (le serveur répond `conflit`), elle montre l'état.
 */
export function diffusionParAgent(d: DossierHumain): boolean {
  if (d.mode !== "reel") return false;
  const a = approbationDiffusable(d);
  if (a?.portee) return canalDePasserelle(a.portee.canal) || Boolean(a.portee.appel);
  return d.diffusions.some((f) => f.mode === "reel" && canalDePasserelle(f.canal));
}

/** Raison de désactiver « Diffuser », ou null. Le serveur revérifie toujours. */
export function raisonDiffusion(d: DossierHumain): string | null {
  if (d.mode === "reel" && !d.connecteurPublication) return "Aucun connecteur de publication : rien ne peut être diffusé.";
  if (!approbationDiffusable(d)) return "Diffusion possible seulement après une approbation humaine qui autorise une action externe sur la révision courante.";
  return null;
}

function DiffusionPanneau({ dossier: d, onFait }: { dossier: DossierHumain; onFait(): void }) {
  const diffuser = useAction<Diffusion>("atelier.diffusion.demander");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [resultat, setResultat] = useState<string | null>(null);
  if (!d.livrable) return null;
  if (diffusionParAgent(d)) {
    return (
      <Section titre="Diffusion" aide="En mode réel, c'est l'agent qui diffuse, avec la preuve de l'appel que vous avez approuvé. Vous gardez la main : une preuve se révoque tant que rien n'est confirmé.">
        <SuiviDiffusionReelle dossier={d} onFait={onFait} />
      </Section>
    );
  }
  const raison = raisonDiffusion(d);
  const approbation = approbationDiffusable(d);
  const lancer = async () => {
    if (raison || !approbation?.portee) return;
    setEnCours(true);
    setErreur(null);
    try {
      const portee = approbation.portee;
      const r = await diffuser({
        issueId: d.issueId,
        revisionId: portee.revisionId,
        action: portee.action,
        canal: portee.canal ?? d.perimetre.canaux[0] ?? "site",
        compte: portee.compte,
        audience: portee.audience,
        montantCents: portee.montantMaxCents,
        // Une clé par approbation : un second clic ne produit aucun second effet.
        cleIdempotence: `interface-${approbation.id}`,
      });
      setResultat(`Diffusion : ${ETATS_DIFFUSION[r.etat]?.libelle ?? r.etat}.`);
      onFait();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <Section titre="Diffusion" aide={"La diffusion reprend la portée de votre approbation (canal, compte, montant)."}>
      <div className="atl-bouton-plein">
        <Bouton variante="principal" raisonDesactive={raison} enCours={enCours} onClick={() => void lancer()}>
          Diffuser
        </Bouton>
      </div>
      {resultat ? (
        <p className="atl-succes" role="status">
          {resultat}
        </p>
      ) : null}
      {erreur ? <EtatErreur erreur={erreur} contexte="diffusion refusée" /> : null}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Chronologie d'une exécution (actions, jamais de raisonnement interne) */
/* ------------------------------------------------------------------ */

export function Chronologie({ issueId }: { issueId: string }) {
  const r = useDonnees<ChronologieExecution>("atelier.chronologie", { issueId });
  return (
    <Section titre="Chronologie de l'exécution" aide="Actions observées (passages, journal de l'atelier) ; aucun raisonnement interne de modèle n'est affiché.">
      <Lecture r={r} libelle="chronologie" estVide={(c) => c.etapes.length === 0} vide={<p className="atl-attenue">Aucune étape enregistrée pour cette tâche.</p>}>
        {(c) => (
          <ol className="atl-chrono">
            {c.etapes.map((e, i) => (
              <li key={`${e.horodatage}-${i}`} data-type={e.type}>
                <span className="atl-chrono-type">{ETAPES_CHRONOLOGIE[e.type] ?? e.type}</span>
                <span className="atl-chrono-libelle">{e.source === "journal_atelier" ? libelleEvenement(e.libelle) : libelleRun(e.libelle)}</span>
                <span className="atl-chrono-meta">
                  <Horodatage iso={e.horodatage} /> ; {SOURCES_CHRONOLOGIE[e.source] ?? e.source}
                  {e.reference ? ` ; réf. ${e.reference.length > 12 ? idCourt(e.reference) : e.reference}` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Lecture>
    </Section>
  );
}
