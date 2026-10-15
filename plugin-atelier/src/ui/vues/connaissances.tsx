/**
 * Rubrique « Connaissances » (lot R8) : les documents du client que les agents peuvent citer (RAG).
 * Import par glisser-déposer, liste avec statut et indexation, essai de recherche avec citation,
 * suppression confirmée. Seul un humain importe et supprime : le serveur contrôle les droits, l'écran
 * explique le refus. Un contenu de document est une donnée à citer, jamais une consigne.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import {
  CONSIGNE_PASSAGE,
  ImporterConnaissanceEntree,
  LIMITES_CONNAISSANCES,
  TYPES_PSEUDONYMISES_PAR_DEFAUT,
  TypeDocumentConnaissance,
  type EtatIndexation,
  type FormatDocumentConnaissance,
  type PassageRendu,
  type ResultatRechercheConnaissances,
  type StatutVersionConnaissance,
} from "../../contrats/connaissances.js";
import { Bouton, Champ, Chargement, EnTete, EtatErreur, Horodatage, Pastille, Section, Vide } from "../composants.js";
import { nombre, type Ton } from "../format.js";
import { appelRoute } from "../routes-prospection.js";
import { cheminAvecEntreprise, ROUTES_UI_CONNAISSANCES } from "../routes-connaissances.js";
import { STYLES_CONNAISSANCES } from "../styles-connaissances.js";

const LIBELLES_TYPES: Readonly<Record<TypeDocumentConnaissance, string>> = {
  conditions_generales: "Conditions générales",
  fiche_produit: "Fiche produit",
  tarif: "Tarif",
  offre: "Offre",
  faq: "Questions fréquentes",
  argumentaire: "Argumentaire",
  note_rdv: "Note de rendez-vous",
  retour_partenaire: "Retour de partenaire",
  reclamation: "Réclamation",
  campagne: "Campagne",
  autre: "Autre",
};

const LIBELLES_STATUTS: Readonly<Record<StatutVersionConnaissance, string>> = { en_vigueur: "En vigueur", a_venir: "À venir", perime: "Périmé", retire: "Retiré" };
const TONS_STATUTS: Readonly<Record<StatutVersionConnaissance, Ton>> = { en_vigueur: "succes", a_venir: "info", perime: "attention", retire: "neutre" };

const LIBELLES_INDEXATION: Readonly<Record<EtatIndexation, string>> = { en_file: "En attente d'indexation", en_cours: "Indexation en cours", indexe: "Indexé", refuse: "Refusé" };
const TONS_INDEXATION: Readonly<Record<EtatIndexation, Ton>> = { en_file: "info", en_cours: "info", indexe: "succes", refuse: "danger" };

const LANGUES = { fr: "Français", nl: "Néerlandais" } as const;

const FORMATS: ReadonlyArray<readonly [FormatDocumentConnaissance, RegExp]> = [
  ["pdf", /\.pdf$/iu],
  ["docx", /\.docx$/iu],
  ["xlsx", /\.xlsx$/iu],
  ["csv", /\.csv$/iu],
  ["markdown", /\.(md|markdown)$/iu],
  ["texte", /\.txt$/iu],
  ["html", /\.html?$/iu],
];
const EXTENSIONS_ACCEPTEES = ".pdf,.docx,.xlsx,.csv,.md,.markdown,.txt,.html,.htm";
const MAX_MO = LIMITES_CONNAISSANCES.importTailleMaxOctets / 1024 / 1024;

/* ------------------------------------------------------------------ */
/* Lecture des réponses (isolée : à ajuster quand le format serveur est figé) */
/* ------------------------------------------------------------------ */

export interface LigneDocument {
  id: string;
  titre: string;
  type: TypeDocumentConnaissance;
  langue: "fr" | "nl";
  mode: string | null;
  version: number | null;
  statut: StatutVersionConnaissance | null;
  indexation: EtatIndexation | null;
  motifRefus: string | null;
  passages: number | null;
  revuePrevueLe: string | null;
  aRevoir: boolean;
}

type Brut = Record<string, unknown>;
const objet = (v: unknown): Brut => (v && typeof v === "object" ? (v as Brut) : {});

/** Accepte une liste nue ou une enveloppe (`lignes`, `documents`, `items`) de `LigneConnaissance`. */
export function lireLignes(reponse: unknown): LigneDocument[] {
  const r = objet(reponse);
  const liste = Array.isArray(reponse) ? reponse : ((r.lignes ?? r.documents ?? r.items ?? []) as unknown[]);
  return liste.map((brut) => {
    const l = objet(brut);
    const d = objet(l.document ?? l);
    const v = l.derniereVersion ? objet(l.derniereVersion) : null;
    const revue = typeof v?.revuePrevueLe === "string" ? v.revuePrevueLe : null;
    return {
      id: String(d.id ?? ""),
      titre: String(d.titre ?? "Sans titre"),
      type: (d.type as TypeDocumentConnaissance) ?? "autre",
      langue: d.langue === "nl" ? "nl" : "fr",
      mode: typeof d.mode === "string" ? d.mode : null,
      version: typeof v?.version === "number" ? v.version : null,
      statut: (v?.statut as StatutVersionConnaissance) ?? null,
      indexation: (v?.etatIndexation as EtatIndexation) ?? null,
      motifRefus: typeof v?.motifRefus === "string" ? v.motifRefus : null,
      passages: typeof v?.passages === "number" ? v.passages : null,
      revuePrevueLe: revue,
      aRevoir: l.aRevoir === true || (revue !== null && revue < aujourdhui()),
    };
  });
}

/** Lit le résultat d'une recherche (schéma `ResultatRechercheConnaissances`). */
export function lireResultat(reponse: unknown): { passages: PassageRendu[]; aucuneSource: boolean; motif: string | null } {
  const r = objet(reponse) as Partial<ResultatRechercheConnaissances>;
  const passages = Array.isArray(r.passages) ? r.passages : [];
  return { passages, aucuneSource: r.aucuneSource === true || passages.length === 0, motif: r.motifAucuneSource ?? null };
}

function aujourdhui(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Brussels" }).format(new Date());
}

function lireBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const l = new FileReader();
    l.onload = () => res(String(l.result ?? "").replace(/^data:[^,]*,/u, ""));
    l.onerror = () => rej(l.error);
    l.readAsDataURL(blob);
  });
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

interface Fichier {
  nom: string;
  format: FormatDocumentConnaissance;
  base64: string;
}

function Import({ companyId, onImporte }: { companyId: string; onImporte(): void }) {
  const entree = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [fichier, setFichier] = useState<Fichier | null>(null);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [titre, setTitre] = useState("");
  const [type, setType] = useState<TypeDocumentConnaissance>("fiche_produit");
  const [langue, setLangue] = useState<"fr" | "nl">("fr");
  const [produit, setProduit] = useState("");
  const [dateDocument, setDateDocument] = useState(aujourdhui);
  const [valideDu, setValideDu] = useState(aujourdhui);
  const [valideAu, setValideAu] = useState("");
  const [pseudoChoisie, setPseudoChoisie] = useState<boolean | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [reussi, setReussi] = useState<string | null>(null);

  const pseudoDefaut = (TYPES_PSEUDONYMISES_PAR_DEFAUT as readonly string[]).includes(type);
  const pseudonymiser = pseudoChoisie ?? pseudoDefaut;

  async function choisir(f: File | undefined) {
    setErreurFichier(null);
    setReussi(null);
    setFichier(null);
    if (!f) return;
    const format = FORMATS.find(([, motif]) => motif.test(f.name))?.[0];
    if (!format) return setErreurFichier("Format non pris en charge : PDF, DOCX, XLSX, CSV, Markdown, texte ou HTML.");
    if (f.size > LIMITES_CONNAISSANCES.importTailleMaxOctets) {
      return setErreurFichier(`Fichier trop volumineux : ${(f.size / 1024 / 1024).toFixed(1).replace(".", ",")} Mo, le maximum est ${MAX_MO} Mo.`);
    }
    try {
      const base64 = await lireBase64(f);
      setFichier({ nom: f.name, format, base64 });
      setTitre((t) => t || f.name.replace(/\.[^.]+$/u, ""));
    } catch {
      setErreurFichier("Le fichier n'a pas pu être lu par le navigateur. Réessayez avec un autre fichier.");
    }
  }

  function deposer(e: DragEvent) {
    e.preventDefault();
    setSurvol(false);
    void choisir(e.dataTransfer.files?.[0]);
  }

  const corps = fichier
    ? {
        companyId,
        nomFichier: fichier.nom,
        format: fichier.format,
        contenuBase64: fichier.base64,
        titre: titre.trim(),
        type,
        produit: produit.trim() === "" ? null : produit.trim(),
        langue,
        dateDocument,
        valideDu,
        valideAu: valideAu === "" ? null : valideAu,
        pseudonymiser,
      }
    : null;
  const verif = corps ? ImporterConnaissanceEntree.safeParse(corps) : null;
  const raison = !fichier ? "Choisissez d'abord un fichier." : verif && !verif.success ? (verif.error.issues[0]?.message ?? "Import invalide.") : null;

  async function importer() {
    if (!verif?.success) return;
    setEnCours(true);
    setErreur(null);
    try {
      await appelRoute("POST", ROUTES_UI_CONNAISSANCES.importer, verif.data);
      setReussi(`« ${verif.data.titre} » est importé. L'indexation se fait en arrière-plan : l'état apparaît dans la liste.`);
      setFichier(null);
      setTitre("");
      setProduit("");
      setValideAu("");
      setPseudoChoisie(null);
      onImporte();
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Section titre="Ajouter un document" aide="Les agents ne citent que les documents importés ici, et seulement ceux qui sont en vigueur. Un humain importe ; le fichier lui-même n'est pas modifié.">
      <div
        className="atl-depot"
        data-survol={survol || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={deposer}
      >
        <span className="atl-depot-titre">{fichier ? fichier.nom : "Déposez un fichier ici"}</span>
        <span className="atl-sous">PDF, DOCX, XLSX, CSV, Markdown, texte ou HTML, {MAX_MO} Mo au maximum.</span>
        <input ref={entree} type="file" accept={EXTENSIONS_ACCEPTEES} aria-label="Fichier du document" tabIndex={-1} onChange={(e) => void choisir(e.target.files?.[0])} />
        <Bouton onClick={() => entree.current?.click()}>{fichier ? "Choisir un autre fichier" : "Choisir un fichier"}</Bouton>
      </div>
      {erreurFichier ? (
        <p className="atl-texte-danger" role="alert">
          {erreurFichier}
        </p>
      ) : null}
      {reussi ? (
        <p className="atl-succes" role="status">
          {reussi}
        </p>
      ) : null}

      {fichier ? (
        <div className="atl-formulaire">
          <div className="atl-grille-champs">
            <Champ libelle="Titre du document">
              <input value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={LIMITES_CONNAISSANCES.titreMax} autoComplete="off" />
            </Champ>
            <Champ libelle="Type de document">
              <select value={type} onChange={(e) => setType(e.target.value as TypeDocumentConnaissance)}>
                {TypeDocumentConnaissance.options.map((t) => (
                  <option key={t} value={t}>
                    {LIBELLES_TYPES[t]}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ libelle="Langue">
              <select value={langue} onChange={(e) => setLangue(e.target.value as "fr" | "nl")}>
                <option value="fr">{LANGUES.fr}</option>
                <option value="nl">{LANGUES.nl}</option>
              </select>
            </Champ>
            <Champ libelle="Produit (facultatif)">
              <input value={produit} onChange={(e) => setProduit(e.target.value)} maxLength={120} autoComplete="off" />
            </Champ>
            <Champ libelle="Date du document">
              <input type="date" value={dateDocument} onChange={(e) => setDateDocument(e.target.value)} />
            </Champ>
            <Champ libelle="En vigueur à partir du">
              <input type="date" value={valideDu} onChange={(e) => setValideDu(e.target.value)} />
            </Champ>
            <Champ libelle="En vigueur jusqu'au (facultatif)" aide="Laissez vide si aucune fin n'est connue.">
              <input type="date" value={valideAu} onChange={(e) => setValideAu(e.target.value)} />
            </Champ>
          </div>
          <label className="atl-case atl-champ">
            <input type="checkbox" checked={pseudonymiser} onChange={(e) => setPseudoChoisie(e.target.checked)} />
            <span>
              Pseudonymiser les données personnelles (courriels, téléphones, IBAN, numéros de registre national et de police)
              <span className="atl-sous">{pseudoDefaut ? "Proposé par défaut pour ce type de document." : "Facultatif pour ce type de document."}</span>
            </span>
          </label>
          {erreur ? <EtatErreur erreur={erreur} contexte="import du document" /> : null}
          <div className="atl-actions">
            <Bouton variante="principal" raisonDesactive={raison} enCours={enCours} onClick={() => void importer()}>
              Importer le document
            </Bouton>
          </div>
        </div>
      ) : null}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Liste                                                               */
/* ------------------------------------------------------------------ */

function Suppression({ ligne, companyId, onFini, onAnnuler }: { ligne: LigneDocument; companyId: string; onFini(): void; onAnnuler(): void }) {
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const raison = motif.trim().length < 3 ? "Indiquez le motif (3 caractères au moins)." : null;

  async function supprimer() {
    setEnCours(true);
    setErreur(null);
    try {
      await appelRoute("POST", ROUTES_UI_CONNAISSANCES.supprimer, { companyId, portee: { type: "document", documentId: ligne.id }, motif: motif.trim() });
      onFini();
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="atl-encart atl-confirmation" data-ton="danger" role="group" aria-label={`Confirmation de la suppression de ${ligne.titre}`}>
      <p className="atl-encart-titre">Supprimer « {ligne.titre} » ?</p>
      <p>Toutes les versions, tous les passages indexés et les extraits déjà cités dans des tâches seront supprimés. Cette action est journalisée et ne peut pas être annulée.</p>
      <Champ libelle="Motif de la suppression">
        <input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={500} autoComplete="off" />
      </Champ>
      {erreur ? <EtatErreur erreur={erreur} contexte="suppression du document" /> : null}
      <div className="atl-actions">
        <Bouton variante="danger" raisonDesactive={raison} enCours={enCours} onClick={() => void supprimer()}>
          Supprimer définitivement
        </Bouton>
        <Bouton variante="discret" onClick={onAnnuler}>
          Garder le document
        </Bouton>
      </div>
    </div>
  );
}

function Liste({ companyId, version, onChange }: { companyId: string; version: number; onChange(): void }) {
  const [etat, setEtat] = useState<{ lignes: LigneDocument[] | null; erreur: unknown; chargement: boolean }>({ lignes: null, erreur: null, chargement: true });
  const [rechargement, setRechargement] = useState(0);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    appelRoute<unknown>("GET", cheminAvecEntreprise(ROUTES_UI_CONNAISSANCES.lister, companyId))
      .then((r) => !annule && setEtat({ lignes: lireLignes(r), erreur: null, chargement: false }))
      .catch((erreur: unknown) => !annule && setEtat({ lignes: null, erreur, chargement: false }));
    return () => {
      annule = true;
    };
  }, [companyId, version, rechargement]);

  const cible = etat.lignes?.find((l) => l.id === aSupprimer) ?? null;
  const nbRevoir = etat.lignes?.filter((l) => l.aRevoir).length ?? 0;

  return (
    <Section titre="Documents du client">
      {etat.erreur ? <EtatErreur erreur={etat.erreur} onReessayer={() => setRechargement((v) => v + 1)} contexte="documents" /> : null}
      {etat.chargement && !etat.lignes ? <Chargement libelle="Chargement des documents" /> : null}
      {etat.lignes && etat.lignes.length === 0 ? (
        <Vide titre="Aucun document pour le moment.">Importez les conditions générales, les fiches produit et les tarifs : les agents pourront alors les citer au lieu d'inventer.</Vide>
      ) : null}
      {nbRevoir > 0 ? (
        <div className="atl-encart" data-ton="attention" role="status">
          <p className="atl-encart-titre">À revoir</p>
          <p>
            {nbRevoir} document{nbRevoir > 1 ? "s ont" : " a"} dépassé la date de revue prévue. Vérifiez qu'il est toujours exact, ou importez une nouvelle version.
          </p>
        </div>
      ) : null}
      {etat.lignes && etat.lignes.length > 0 ? (
        <>
          <p className="atl-resume">
            <span>
              <strong>{nombre(etat.lignes.length)}</strong> document{etat.lignes.length > 1 ? "s" : ""}
            </span>
          </p>
          <div className="atl-table-cadre">
            <table className="atl-table">
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Type</th>
                  <th scope="col">Langue</th>
                  <th scope="col">Version</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Indexation</th>
                  <th scope="col">Revue</th>
                  <th scope="col">
                    <span className="atl-sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {etat.lignes.map((l) => (
                  <tr key={l.id}>
                    <th scope="row">
                      {l.titre}
                      {l.mode === "demonstration" ? <span className="atl-sous">donnée de démonstration</span> : null}
                    </th>
                    <td data-libelle="Type">{LIBELLES_TYPES[l.type] ?? l.type}</td>
                    <td data-libelle="Langue">{LANGUES[l.langue]}</td>
                    <td data-libelle="Version">{l.version ? `v${l.version}` : <span className="atl-attenue">aucune</span>}</td>
                    <td data-libelle="Statut">{l.statut ? <Pastille ton={TONS_STATUTS[l.statut]}>{LIBELLES_STATUTS[l.statut]}</Pastille> : <span className="atl-attenue">aucune version</span>}</td>
                    <td data-libelle="Indexation">
                      {l.indexation ? <Pastille ton={TONS_INDEXATION[l.indexation]}>{LIBELLES_INDEXATION[l.indexation]}</Pastille> : <span className="atl-attenue">non indexé</span>}
                      {l.indexation === "refuse" && l.motifRefus ? <span className="atl-sous">{l.motifRefus}</span> : null}
                      {l.indexation === "indexe" && l.passages !== null ? <span className="atl-sous">{nombre(l.passages)} passages</span> : null}
                    </td>
                    <td data-libelle="Revue">
                      {l.revuePrevueLe ? <Horodatage iso={l.revuePrevueLe} seulementDate /> : <span className="atl-attenue">non prévue</span>}
                      {l.aRevoir ? <Pastille ton="attention">À revoir</Pastille> : null}
                    </td>
                    <td data-libelle="Actions">
                      <Bouton variante="discret" onClick={() => setASupprimer(l.id)}>
                        Supprimer
                      </Bouton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {cible ? (
        <Suppression
          key={cible.id}
          ligne={cible}
          companyId={companyId}
          onAnnuler={() => setASupprimer(null)}
          onFini={() => {
            setASupprimer(null);
            onChange();
          }}
        />
      ) : null}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Essai de recherche                                                  */
/* ------------------------------------------------------------------ */

function Passage({ p }: { p: PassageRendu }) {
  const c = p.citation;
  const lieu = c.page ? `page ${c.page}` : c.section ? `section « ${c.section} »` : null;
  return (
    <li className="atl-resultat">
      <div className="atl-cite">
        <strong>{c.titre}</strong>
        <span>version {c.version}</span>
        {lieu ? <span>{lieu}</span> : null}
        {c.perime ? <Pastille ton="attention">périmé</Pastille> : null}
        <code>{c.adresse}</code>
      </div>
      <blockquote className="atl-passage" data-perime={c.perime || undefined}>
        {p.texte}
      </blockquote>
      <span className="atl-sous">{p.consigne ?? CONSIGNE_PASSAGE}</span>
    </li>
  );
}

function Essai() {
  const [tache, setTache] = useState("");
  const [question, setQuestion] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [resultat, setResultat] = useState<ReturnType<typeof lireResultat> | null>(null);

  const raison = tache.trim() === "" ? "Indiquez la tâche dans laquelle chercher : sans tâche, l'essai est impossible." : question.trim().length < 3 ? "Posez une question de 3 caractères au moins." : null;

  async function chercher() {
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const r = await appelRoute<unknown>("POST", ROUTES_UI_CONNAISSANCES.rechercher(tache.trim()), { question: question.trim() });
      setResultat(lireResultat(r));
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Section titre="Essayer une recherche" aide="Voyez ce qu'un agent trouverait pour une question. La recherche passe par une tâche : chaque passage rendu y devient une source citée.">
      <form
        className="atl-formulaire"
        onSubmit={(e) => {
          e.preventDefault();
          if (!raison) void chercher();
        }}
      >
        <div className="atl-grille-champs">
          <Champ libelle="Tâche" aide="Identifiant de la tâche.">
            <input value={tache} onChange={(e) => setTache(e.target.value)} autoComplete="off" />
          </Champ>
          <Champ libelle="Question">
            <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={LIMITES_CONNAISSANCES.questionMax} autoComplete="off" />
          </Champ>
        </div>
        {erreur ? <EtatErreur erreur={erreur} contexte="recherche" /> : null}
        <div className="atl-actions">
          <Bouton type="submit" variante="principal" raisonDesactive={raison} enCours={enCours}>
            Chercher
          </Bouton>
        </div>
      </form>
      {resultat?.aucuneSource ? (
        <div className="atl-encart" role="status">
          <p className="atl-encart-titre">Aucune source trouvée</p>
          <p>{resultat.motif ?? "Aucun passage ne répond assez bien à cette question. Un agent devrait signaler l'information manquante plutôt que l'inventer."}</p>
        </div>
      ) : null}
      {resultat && !resultat.aucuneSource ? (
        <ul className="atl-liste-compacte" aria-label="Passages trouvés">
          {resultat.passages.map((p) => (
            <Passage key={p.citation.adresse} p={p} />
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Rubrique                                                            */
/* ------------------------------------------------------------------ */

export function VueConnaissances() {
  const { companyId } = useHostContext();
  const [version, setVersion] = useState(0);
  const rafraichir = useCallback(() => setVersion((v) => v + 1), []);
  return (
    <>
      <style>{STYLES_CONNAISSANCES}</style>
      <EnTete titre="Connaissances" description="Les documents du client que les agents peuvent citer : conditions, fiches produit, tarifs. Un agent ne cite que ce qui est en vigueur, et chaque citation indique son document, sa version et son endroit." />
      {companyId ? (
        <>
          <Import companyId={companyId} onImporte={rafraichir} />
          <Liste companyId={companyId} version={version} onChange={rafraichir} />
          <Essai />
        </>
      ) : (
        <Vide titre="Aucune entreprise sélectionnée." />
      )}
    </>
  );
}
