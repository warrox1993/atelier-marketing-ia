/**
 * Traitement sur place des éléments de l'Accueil : chaque ligne de « À faire » se déplie et
 * s'exécute sans changer d'écran.
 *
 * - contenu à valider : aperçu du livrable et décision partagée avec Contenus (`DecisionPanneau`) ;
 * - question de l'équipe (`ask_user_questions`) : les questions avec leurs choix, bouton Envoyer ;
 * - confirmation (`request_confirmation`) : Confirmer ou Refuser ;
 * - approbation native : contenu affiché puis Approuver ou Refuser, seulement pour les types connus et
 *   sans effet caché ; demande d'accès (`hire_agent`), dépassement de budget et type inconnu : lien vers la
 *   page native uniquement ;
 * - carte qui exécute un outil (`toolAction`) ou propose un secret (`secretProposal`) : lien vers la tâche
 *   native uniquement ;
 * - demande entre services (bureau de liaison) : objet, question et extraits affichés EN ENTIER, puis Transmettre ou
 *   Ne pas transmettre (route du plugin `liaison.decider`, sans carte native ni capacité de plus) ;
 * - tâche bloquée : la raison et le lien vers la tâche.
 *
 * Réponses aux cartes et aux approbations natives : le SDK des plugins ne sait que « accepter ou
 * refuser » une carte (`respondInteraction`, capacité absente du manifeste) et ne transmet pas les
 * réponses d'une carte de questions. Comme l'écran le fait déjà pour d'autres actions natives
 * (`hote.ts`), l'interface appelle donc les routes natives de l'hôte avec la session de la
 * personne : `POST /api/issues/:id/interactions/:id/respond` (réponses), `/accept`, `/reject`, et
 * `POST /api/approvals/:id/approve` ou `/reject`. L'hôte contrôle les droits (réservé au board).
 */
import { Fragment, useState, type ReactNode } from "react";
import { MarkdownBlock, useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { DossierHumain } from "../contrats/dossier.js";
import type { DetailApprobation, ElementAccueil, InteractionAccueil, LiaisonAApprouver, QuestionAccueil } from "../serveur/services-accueil.js";
import { Bouton, Champ, EtatErreur, Lecture, LienHote } from "./composants.js";
import { DecisionPanneau } from "./decision-livrable.js";
import { useDonnees } from "./donnees.js";
import { appelHote } from "./hote.js";
import { appelRoute } from "./routes-prospection.js";
import { abaisserTitres } from "./vues/contenus.js";

/** Vrai pour les éléments qu'on peut traiter sur place (les autres n'ont que le bouton d'ouverture). */
export function traitableSurPlace(e: ElementAccueil): boolean {
  if (e.liaison) return true;
  if (e.interaction) return !e.interaction.natifSeulement;
  if (e.approbationId) return e.approbation?.surPlace === true;
  return Boolean((e.type === "contenu_a_valider" && e.issueId) || (e.type === "tache_bloquee" && e.issueId));
}

/** Vrai pour les cartes et approbations qui ne se décident jamais sur place : seul le lien natif est proposé. */
export function natifSeulement(e: ElementAccueil): boolean {
  return Boolean((e.interaction || e.approbationId) && !traitableSurPlace(e));
}

export interface PropsSurPlace {
  element: ElementAccueil;
  /**
   * Entreprise d'origine de l'élément quand elle n'est pas celle de la page (Discussion d'un client à plusieurs
   * services). Les décisions par routes natives de l'hôte n'en dépendent pas ; la décision du bureau de liaison part avec
   * ce companyId ; celles qui passent par le pont du plugin (contenu à valider) sont liées à l'entreprise de la page :
   * pour un autre service, seul le lien vers sa page est proposé.
   */
  companyId?: string;
  /** Appelé après une action réussie : l'élément disparaît de la liste avec ce message. */
  onFait(message: string): void;
}

export function SurPlace({ element, companyId, onFait }: PropsSurPlace) {
  const { companyId: courante } = useHostContext();
  if (element.liaison) return <Liaison liaison={element.liaison} companyId={companyId} onFait={onFait} />;
  if (companyId && courante && companyId !== courante && element.type === "contenu_a_valider") return <AutreService element={element} />;
  if (natifSeulement(element)) return <PageNative element={element} />;
  if (element.interaction?.kind === "ask_user_questions" && element.issueId) return <Questions element={element} interaction={element.interaction} issueId={element.issueId} onFait={onFait} />;
  if (element.interaction && element.issueId) return <Confirmation interaction={element.interaction} issueId={element.issueId} onFait={onFait} />;
  if (element.approbationId && element.approbation) return <Approbation id={element.approbationId} detail={element.approbation} onFait={onFait} />;
  if (element.type === "contenu_a_valider" && element.issueId) return <Contenu issueId={element.issueId} onFait={onFait} />;
  if (element.type === "tache_bloquee") return <Bloquee element={element} />;
  return null;
}

/** Cartes et approbations dont la décision exige de voir le détail natif : aucun bouton de décision ici. */
function PageNative({ element }: { element: ElementAccueil }) {
  return (
    <Encadre etiquette="Décision dans la page native">
      <p>{element.interaction ? "Cette demande déclenche une action (envoi, accès ou secret) : son détail complet est dans la tâche." : "Cette décision se prend dans la page native, où tout son contenu est visible."}</p>
      <LienHote vers={element.lien} className="atl-lien">
        {element.interaction ? "Ouvrir la tâche" : "Ouvrir la page native"}
      </LienHote>
    </Encadre>
  );
}

/** Contenu d'un autre service : la décision se prend dans sa page, jamais ici (le pont du plugin vise l'entreprise de la page). */
function AutreService({ element }: { element: ElementAccueil }) {
  return (
    <Encadre etiquette="Décision dans la page du service">
      <p>Ce contenu appartient à un autre service : sa décision se prend dans la page de ce service, où tout son détail est visible.</p>
      <LienHote vers={element.lien} className="atl-lien">
        Ouvrir la page du service
      </LienHote>
    </Encadre>
  );
}

/** Exécute une action native et expose état, erreur et message de réussite. */
function useActionNative() {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const lancer = async (action: () => Promise<unknown>, apres: () => void) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
      apres();
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  };
  return { enCours, erreur, lancer };
}

function Encadre({ children, etiquette }: { children: ReactNode; etiquette: string }) {
  return (
    <div className="atl-surplace" role="group" aria-label={etiquette}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contenu à valider                                                     */
/* ------------------------------------------------------------------ */

function Contenu({ issueId, onFait }: { issueId: string; onFait(message: string): void }) {
  const r = useDonnees<DossierHumain>("atelier.dossier", { issueId });
  return (
    <Encadre etiquette="Contenu à valider">
      <Lecture r={r} libelle="le contenu">
        {(d) => (
          <>
            {d.livrable ? (
              <div className="atl-surplace-apercu" tabIndex={0} aria-label="Aperçu du livrable">
                {d.livrable.titre ? <p className="atl-livrable-titre">{d.livrable.titre}</p> : null}
                <MarkdownBlock content={abaisserTitres(d.livrable.corps)} />
              </div>
            ) : (
              <p className="atl-attenue">Aucun livrable produit pour l'instant.</p>
            )}
            <DecisionPanneau dossier={d} integre onFait={(m) => onFait(m ?? "Décision enregistrée.")} />
          </>
        )}
      </Lecture>
    </Encadre>
  );
}

/* ------------------------------------------------------------------ */
/* Questions de l'équipe                                                 */
/* ------------------------------------------------------------------ */

interface Saisie {
  choix: string[];
  autre: string;
}

/** Réponses au format de la route native, une entrée par question répondue. */
export function reponsesDepuisSaisies(questions: readonly QuestionAccueil[], saisies: Readonly<Record<string, Saisie>>) {
  const reponses: Array<{ questionId: string; optionIds: string[]; otherText?: string }> = [];
  for (const q of questions) {
    const s = saisies[q.id];
    if (!s) continue;
    const autre = s.autre.trim();
    const texteLibre = q.options.some((o) => o.texteLibre && s.choix.includes(o.id));
    if (s.choix.length === 0 && !autre) continue;
    reponses.push({ questionId: q.id, optionIds: s.choix, ...(autre && (texteLibre || q.autre) ? { otherText: autre } : {}) });
  }
  return reponses;
}

/** Raison pour laquelle l'envoi est impossible, `null` si les questions obligatoires sont répondues. */
export function raisonQuestions(questions: readonly QuestionAccueil[], saisies: Readonly<Record<string, Saisie>>): string | null {
  const reponses = reponsesDepuisSaisies(questions, saisies);
  const manque = questions.find((q) => q.obligatoire && !reponses.some((r) => r.questionId === q.id));
  if (manque) return `Répondez d'abord à la question « ${manque.invite} ».`;
  if (reponses.length === 0) return "Répondez à au moins une question.";
  return null;
}

function Questions({ element, interaction, issueId, onFait }: { element: ElementAccueil; interaction: InteractionAccueil; issueId: string; onFait(message: string): void }) {
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({});
  const { enCours, erreur, lancer } = useActionNative();
  const raison = raisonQuestions(interaction.questions, saisies);
  const maj = (id: string, f: (s: Saisie) => Saisie) => setSaisies((x) => ({ ...x, [id]: f(x[id] ?? { choix: [], autre: "" }) }));

  const envoyer = () =>
    lancer(
      () => appelHote("POST", `/issues/${encodeURIComponent(issueId)}/interactions/${encodeURIComponent(interaction.id)}/respond`, { answers: reponsesDepuisSaisies(interaction.questions, saisies) }),
      () => onFait("Réponse envoyée à l'équipe, qui reprend le travail."),
    );

  return (
    <Encadre etiquette="Questions de l'équipe">
      <form
        className="atl-formulaire"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!raison) void envoyer();
        }}
      >
        {interaction.questions.length === 0 ? <p className="atl-attenue">Cette carte ne contient aucune question lisible ici : ouvrez la tâche pour y répondre.</p> : null}
        {interaction.questions.map((q) => {
          const s = saisies[q.id] ?? { choix: [], autre: "" };
          const unique = q.choix === "single";
          const libreChoisie = q.options.some((o) => o.texteLibre && s.choix.includes(o.id));
          return (
            <fieldset key={q.id} className="atl-champ atl-choix atl-question">
              <legend>
                {q.invite}
                {q.obligatoire ? null : <span className="atl-attenue"> (facultatif)</span>}
              </legend>
              {q.aide ? <p className="atl-aide">{q.aide}</p> : null}
              {q.options.map((o) => (
                <label key={o.id}>
                  <input
                    type={unique ? "radio" : "checkbox"}
                    name={`q-${interaction.id}-${q.id}`}
                    value={o.id}
                    checked={s.choix.includes(o.id)}
                    onChange={(e) =>
                      maj(q.id, (x) => ({
                        ...x,
                        choix: unique ? [o.id] : e.target.checked ? [...x.choix, o.id] : x.choix.filter((c) => c !== o.id),
                      }))
                    }
                  />{" "}
                  <span>
                    {o.libelle}
                    {o.description ? <span className="atl-sous">{o.description}</span> : null}
                  </span>
                </label>
              ))}
              {libreChoisie || q.autre ? (
                <Champ libelle={libreChoisie ? "Votre précision" : "Autre réponse"}>
                  <input value={s.autre} onChange={(e) => maj(q.id, (x) => ({ ...x, autre: e.target.value }))} autoComplete="off" maxLength={4000} />
                </Champ>
              ) : null}
            </fieldset>
          );
        })}
        <Bouton type="submit" variante="principal" enCours={enCours} raisonDesactive={raison}>
          Envoyer
        </Bouton>
        {erreur ? <EtatErreur erreur={erreur} contexte="réponse refusée" /> : null}
        <LienHote vers={element.lien} className="atl-lien">
          Ouvrir la tâche
        </LienHote>
      </form>
    </Encadre>
  );
}

/* ------------------------------------------------------------------ */
/* Confirmation                                                          */
/* ------------------------------------------------------------------ */

function Confirmation({ interaction, issueId, onFait }: { interaction: InteractionAccueil; issueId: string; onFait(message: string): void }) {
  const [raison, setRaison] = useState("");
  const { enCours, erreur, lancer } = useActionNative();
  const base = `/issues/${encodeURIComponent(issueId)}/interactions/${encodeURIComponent(interaction.id)}`;
  const obligatoire = interaction.refusRaisonObligatoire;
  return (
    <Encadre etiquette="Confirmation demandée">
      {interaction.invite ? <p>{interaction.invite}</p> : null}
      {interaction.details ? <MarkdownBlock content={abaisserTitres(interaction.details)} /> : null}
      <Champ libelle={obligatoire ? "Raison (obligatoire pour refuser)" : "Raison (facultative, utile si vous refusez)"}>
        <textarea value={raison} onChange={(e) => setRaison(e.target.value)} rows={2} maxLength={4000} />
      </Champ>
      <div className="atl-surplace-actions">
        <Bouton variante="principal" enCours={enCours} onClick={() => void lancer(() => appelHote("POST", `${base}/accept`, {}), () => onFait("Confirmé : l'équipe reprend le travail."))}>
          {interaction.libelleAccepter ?? "Confirmer"}
        </Bouton>
        <Bouton
          variante="danger"
          enCours={enCours}
          raisonDesactive={obligatoire && !raison.trim() ? "Indiquez la raison du refus : elle est obligatoire." : null}
          onClick={() => void lancer(() => appelHote("POST", `${base}/reject`, raison.trim() ? { reason: raison.trim() } : {}), () => onFait("Refusé : l'équipe en est informée."))}
        >
          {interaction.libelleRefuser ?? "Refuser"}
        </Bouton>
      </div>
      {erreur ? <EtatErreur erreur={erreur} contexte="décision refusée" /> : null}
    </Encadre>
  );
}

/* ------------------------------------------------------------------ */
/* Approbation native et demande d'accès                                 */
/* ------------------------------------------------------------------ */

function Approbation({ id, detail, onFait }: { id: string; detail: DetailApprobation; onFait(message: string): void }) {
  const [note, setNote] = useState("");
  const { enCours, erreur, lancer } = useActionNative();
  const corps = () => (note.trim() ? { decisionNote: note.trim() } : {});
  const base = `/approvals/${encodeURIComponent(id)}`;
  return (
    <Encadre etiquette="Approbation">
      <dl className="atl-surplace-detail">
        <dt>Type</dt>
        <dd>{LIBELLES_TYPES_APPROBATION[detail.type] ?? detail.type}</dd>
        <dt>Demandeur</dt>
        <dd>{detail.demandeur}</dd>
        {detail.lignes.map((l) => (
          <Fragment key={l.libelle}>
            <dt>{l.libelle}</dt>
            <dd>{l.valeur}</dd>
          </Fragment>
        ))}
      </dl>
      <Champ libelle="Note (facultative)">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={4000} />
      </Champ>
      <div className="atl-surplace-actions">
        <Bouton variante="principal" enCours={enCours} onClick={() => void lancer(() => appelHote("POST", `${base}/approve`, corps()), () => onFait("Approuvé."))}>
          Approuver
        </Bouton>
        <Bouton variante="danger" enCours={enCours} onClick={() => void lancer(() => appelHote("POST", `${base}/reject`, corps()), () => onFait("Refusé."))}>
          Refuser
        </Bouton>
      </div>
      {erreur ? <EtatErreur erreur={erreur} contexte="décision refusée" /> : null}
    </Encadre>
  );
}

const LIBELLES_TYPES_APPROBATION: Readonly<Record<string, string>> = {
  approve_ceo_strategy: "Stratégie du Coordinateur",
  request_board_approval: "Accord demandé à la direction",
};

/* ------------------------------------------------------------------ */
/* Demande entre services (bureau de liaison)                            */
/* ------------------------------------------------------------------ */

/** Texte brut, jamais interprété : le contenu vient d'un autre service et s'affiche tel quel, en entier. */
function TexteComplet({ texte, etiquette }: { texte: string; etiquette: string }) {
  return (
    <pre className="atl-surplace-texte" tabIndex={0} aria-label={etiquette}>
      {texte}
    </pre>
  );
}

function Liaison({ liaison, companyId: origine, onFait }: { liaison: LiaisonAApprouver; companyId?: string; onFait(message: string): void }) {
  const { companyId: courante } = useHostContext();
  const companyId = origine ?? courante;
  const [raison, setRaison] = useState("");
  const { enCours, erreur, lancer } = useActionNative();
  const decider = (decision: "approuver" | "refuser") =>
    lancer(
      () => appelRoute("POST", "/liaisons/decider", { companyId, liaisonId: liaison.liaisonId, decision, ...(raison.trim() ? { raison: raison.trim() } : {}) }),
      () => onFait(decision === "approuver" ? "Demande transmise au service." : "Demande refusée : le service demandeur en est informé."),
    );
  return (
    <Encadre etiquette="Demande à un autre service">
      <p>
        Le service <strong>{liaison.serviceSource}</strong> veut envoyer ceci au service <strong>{liaison.serviceCible}</strong>. Ce texte partira tel quel, rien d'autre.
      </p>
      <h4>Objet</h4>
      <TexteComplet texte={liaison.objet} etiquette="Objet de la demande" />
      <h4>Question</h4>
      <TexteComplet texte={liaison.question} etiquette="Question posée" />
      {liaison.extraits.length > 0 ? <h4>{liaison.extraits.length === 1 ? "Extrait joint" : `${liaison.extraits.length} extraits joints`}</h4> : <p className="atl-attenue">Aucun extrait joint.</p>}
      {liaison.extraits.map((x, i) => (
        <div key={i}>
          <p className="atl-livrable-titre">{x.titre}</p>
          <TexteComplet texte={x.texte} etiquette={`Extrait ${i + 1}`} />
        </div>
      ))}
      <Champ libelle="Raison (facultative, utile si vous refusez)">
        <textarea value={raison} onChange={(e) => setRaison(e.target.value)} rows={2} maxLength={1000} />
      </Champ>
      <div className="atl-surplace-actions">
        <Bouton variante="principal" enCours={enCours} onClick={() => void decider("approuver")}>
          Transmettre
        </Bouton>
        <Bouton variante="danger" enCours={enCours} onClick={() => void decider("refuser")}>
          Ne pas transmettre
        </Bouton>
      </div>
      {erreur ? <EtatErreur erreur={erreur} contexte="décision refusée" /> : null}
    </Encadre>
  );
}

/* ------------------------------------------------------------------ */
/* Tâche bloquée                                                         */
/* ------------------------------------------------------------------ */

function Bloquee({ element }: { element: ElementAccueil }) {
  return (
    <Encadre etiquette="Tâche bloquée">
      <p>{element.raison}</p>
      <LienHote vers={element.lien} className="atl-lien">
        Ouvrir la tâche
      </LienHote>
    </Encadre>
  );
}
