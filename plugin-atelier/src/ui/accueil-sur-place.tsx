/**
 * Traitement sur place des éléments de l'Accueil : chaque ligne de « À faire » se déplie et
 * s'exécute sans changer d'écran.
 *
 * - contenu à valider : aperçu du livrable et décision partagée avec Contenus (`DecisionPanneau`) ;
 * - question de l'équipe (`ask_user_questions`) : les questions avec leurs choix, bouton Envoyer ;
 * - confirmation (`request_confirmation`) : Confirmer ou Refuser ;
 * - approbation native et demande d'accès : Approuver ou Refuser ;
 * - tâche bloquée : la raison et le lien vers la tâche.
 *
 * Réponses aux cartes et aux approbations natives : le SDK des plugins ne sait que « accepter ou
 * refuser » une carte (`respondInteraction`, capacité absente du manifeste) et ne transmet pas les
 * réponses d'une carte de questions. Comme l'écran le fait déjà pour d'autres actions natives
 * (`hote.ts`), l'interface appelle donc les routes natives de l'hôte avec la session de la
 * personne : `POST /api/issues/:id/interactions/:id/respond` (réponses), `/accept`, `/reject`, et
 * `POST /api/approvals/:id/approve` ou `/reject`. L'hôte contrôle les droits (réservé au board).
 */
import { useState, type ReactNode } from "react";
import { MarkdownBlock } from "@paperclipai/plugin-sdk/ui";
import type { DossierHumain } from "../contrats/dossier.js";
import type { ElementAccueil, InteractionAccueil, QuestionAccueil } from "../serveur/services-accueil.js";
import { Bouton, Champ, EtatErreur, Lecture, LienHote } from "./composants.js";
import { DecisionPanneau } from "./decision-livrable.js";
import { useDonnees } from "./donnees.js";
import { appelHote } from "./hote.js";
import { abaisserTitres } from "./vues/contenus.js";

/** Vrai pour les éléments qu'on peut traiter sur place (les autres n'ont que le bouton d'ouverture). */
export function traitableSurPlace(e: ElementAccueil): boolean {
  return Boolean(e.interaction || e.approbationId || (e.type === "contenu_a_valider" && e.issueId) || (e.type === "tache_bloquee" && e.issueId));
}

export interface PropsSurPlace {
  element: ElementAccueil;
  /** Appelé après une action réussie : l'élément disparaît de la liste avec ce message. */
  onFait(message: string): void;
}

export function SurPlace({ element, onFait }: PropsSurPlace) {
  if (element.interaction?.kind === "ask_user_questions" && element.issueId) return <Questions element={element} interaction={element.interaction} issueId={element.issueId} onFait={onFait} />;
  if (element.interaction && element.issueId) return <Confirmation interaction={element.interaction} issueId={element.issueId} onFait={onFait} />;
  if (element.approbationId) return <Approbation id={element.approbationId} demandeAcces={element.type === "demande_acces"} onFait={onFait} />;
  if (element.type === "contenu_a_valider" && element.issueId) return <Contenu issueId={element.issueId} onFait={onFait} />;
  if (element.type === "tache_bloquee") return <Bloquee element={element} />;
  return null;
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
  return (
    <Encadre etiquette="Confirmation demandée">
      {interaction.invite ? <p>{interaction.invite}</p> : null}
      {interaction.details ? <MarkdownBlock content={abaisserTitres(interaction.details)} /> : null}
      <Champ libelle="Raison (facultative, utile si vous refusez)">
        <textarea value={raison} onChange={(e) => setRaison(e.target.value)} rows={2} maxLength={4000} />
      </Champ>
      <div className="atl-surplace-actions">
        <Bouton variante="principal" enCours={enCours} onClick={() => void lancer(() => appelHote("POST", `${base}/accept`, {}), () => onFait("Confirmé : l'équipe reprend le travail."))}>
          {interaction.libelleAccepter ?? "Confirmer"}
        </Bouton>
        <Bouton
          variante="danger"
          enCours={enCours}
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

function Approbation({ id, demandeAcces, onFait }: { id: string; demandeAcces: boolean; onFait(message: string): void }) {
  const [note, setNote] = useState("");
  const { enCours, erreur, lancer } = useActionNative();
  const corps = () => (note.trim() ? { decisionNote: note.trim() } : {});
  const base = `/approvals/${encodeURIComponent(id)}`;
  return (
    <Encadre etiquette={demandeAcces ? "Demande d'accès" : "Approbation"}>
      <Champ libelle="Note (facultative)">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={4000} />
      </Champ>
      <div className="atl-surplace-actions">
        <Bouton variante="principal" enCours={enCours} onClick={() => void lancer(() => appelHote("POST", `${base}/approve`, corps()), () => onFait(demandeAcces ? "Demande acceptée." : "Approuvé."))}>
          Approuver
        </Bouton>
        <Bouton variante="danger" enCours={enCours} onClick={() => void lancer(() => appelHote("POST", `${base}/reject`, corps()), () => onFait(demandeAcces ? "Demande refusée." : "Refusé."))}>
          Refuser
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
