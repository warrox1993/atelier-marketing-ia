/**
 * Mise en place du client : un parcours en six étapes, avec barre de progression, qui remplace la mise
 * en place éparpillée (fiche, connexions, base clients, documents, plafonds, connexions).
 *
 * Aucune nouvelle source de vérité : l'état de chaque étape est lu sur les routes des écrans actuels,
 * et les formulaires sont ceux de ces écrans, réutilisés tels quels.
 * - fiche : `atelier.marque` (référentiel enregistré ou non), écriture par `atelier.marque.enregistrer` ;
 * - sources et connexions : connexions natives de la passerelle et `atelier.sante` (sources réelles) ;
 * - base clients : `GET /base-clients` ;
 * - documents : `GET /connaissances/statut` ;
 * - plafonds et budget : `atelier.reglages` (plafond publicitaire choisi ou non) ;
 * - connexions : `GET /realite` (route `realite.etat`).
 *
 * L'étape courante est la première qui n'est pas faite. Une étape facultative non faite n'est pas
 * bloquante, mais elle reste « non faite » pour la progression.
 */
import { useCallback, useEffect, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { Diagnostic, ReglagesEntreprise } from "../../contrats/campagnes.js";
import type { StatutConnaissances } from "../../contrats/connaissances.js";
import type { VueMarque } from "../../contrats/ui.js";
import { BandeauEntreprise, Bouton, EnTete, LienHote, Pastille, Section } from "../composants.js";
import { lireConnexionsNatives, lignesServices } from "../connexions-natives.js";
import { BaseClients } from "../base-clients.js";
import { useDonnees } from "../donnees.js";
import { branchementsManquants, LIEN_PASSAGE_AU_REEL, RecapPassageAuReel, useRealite, type LectureRealite } from "../realite.js";
import { chemin } from "../route.js";
import { appelRoute } from "../routes-prospection.js";
import { STYLES_CONNAISSANCES } from "../styles-connaissances.js";
import { Import, ImportPageWeb } from "./connaissances.js";
import { EditeurMarque } from "./marque.js";
import { BudgetsIa, PlafondEntreprise } from "./parametres.js";

export type EtatEtape = "fait" | "a_faire" | "facultatif" | "inconnu";
export type CleEtape = "fiche" | "sources" | "base-clients" | "documents" | "plafonds" | "reel";

export interface EtapeCalculee {
  cle: CleEtape;
  titre: string;
  /** Pourquoi cette étape sert, en une ou deux phrases. */
  pourquoi: string;
  /** Ce qui est déjà fait, ou ce qui manque, d'après les données lues. */
  detail: string;
  etat: EtatEtape;
}

interface Lecture<T> {
  etat: "chargement" | "erreur" | "pret";
  valeur: T | null;
}

/** Données lues, telles que les routes existantes les donnent (`null` : pas encore lu ou illisible). */
export interface EntreesParcours {
  marque: VueMarque | null;
  reglages: ReglagesEntreprise | null;
  baseClients: { existe: boolean; clients: number } | null;
  connaissances: Pick<StatutConnaissances, "documents"> | null;
  /** Nombre de services de la passerelle reliés ; `null` : connexions non lues. */
  nbServices: number | null;
  sourcesReelles: NonNullable<Diagnostic["sourcesReelles"]> | null;
  realite: LectureRealite;
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

function detailFiche(marque: VueMarque | null): string {
  const m = marque?.marque;
  if (!m) return marque ? "Aucune fiche enregistrée pour ce client." : "Fiche non lue.";
  const bureaux = m.etablissements;
  const avecPosition = bureaux.filter((e) => e.position != null).length;
  const avecSegments = bureaux.filter((e) => (e.segmentsSuivis ?? []).length > 0).length;
  const identifiants = (m.entites ?? []).flatMap((e) => e.identifiants);
  const valeur = (type: "bce" | "fsma") => identifiants.find((i) => i.type === type)?.valeur;
  const bce = valeur("bce");
  const fsma = valeur("fsma");
  const reglementaire = `BCE ${bce ?? "non renseigné"}, FSMA ${fsma ?? "non renseigné"}`;
  const bureauxTexte =
    bureaux.length === 0
      ? "aucun bureau"
      : `${pluriel(bureaux.length, "bureau", "bureaux")} dont ${avecPosition} avec position et ${avecSegments} avec segments suivis`;
  return `Fiche enregistrée (version ${m.version}) : ${bureauxTexte} ; ${reglementaire}.`;
}

function detailSources(nbServices: number | null, src: EntreesParcours["sourcesReelles"]): string {
  const services = nbServices === null ? "connexions non lues" : `${pluriel(nbServices, "service relié", "services reliés")}`;
  const sources = !src
    ? "sources réelles non lues"
    : src.passerelle !== "joignable"
      ? "passerelle non vérifiée, aucune source tenue pour réelle"
      : `${src.sources.filter((s) => s.reelle).length} source${src.sources.filter((s) => s.reelle).length > 1 ? "s" : ""} réelle${src.sources.filter((s) => s.reelle).length > 1 ? "s" : ""} sur ${src.sources.length}`;
  return `${services[0]!.toUpperCase()}${services.slice(1)} ; ${sources}.`;
}

/** Calcule les six étapes, leur état et leur texte d'après les données lues. Fonction pure (testée). */
export function calculerEtapes(e: EntreesParcours): EtapeCalculee[] {
  const lu = (pret: boolean, fait: boolean, sinon: EtatEtape = "a_faire"): EtatEtape => (pret ? (fait ? "fait" : sinon) : "inconnu");
  const nbSourcesReelles = e.sourcesReelles && e.sourcesReelles.passerelle === "joignable" ? e.sourcesReelles.sources.filter((s) => s.reelle).length : 0;
  const nbDocuments = e.connaissances?.documents ?? 0;
  const manquants = e.realite.etat === "pret" ? branchementsManquants(e.realite.branchements) : null;
  const sourcesLues = e.nbServices !== null || e.sourcesReelles !== null;
  return [
    {
      cle: "fiche",
      titre: "Fiche du client",
      pourquoi: "Les agents n'affirment que ce que la fiche contient : identité, offres, bureaux. La position et les segments suivis de chaque bureau permettent de repérer le bureau spécialisé le plus proche d'un prospect.",
      detail: detailFiche(e.marque),
      etat: lu(e.marque !== null, e.marque?.marque != null),
    },
    {
      cle: "sources",
      titre: "Sources et connexions",
      pourquoi: "Sans service relié ni source réelle, les agents n'ont aucune donnée à lire. Reliez au moins un service (analyse, réseaux sociaux ou CRM) pour qu'ils lisent de vraies données.",
      detail: detailSources(e.nbServices, e.sourcesReelles),
      etat: lu(sourcesLues, (e.nbServices ?? 0) > 0 || nbSourcesReelles > 0),
    },
    {
      cle: "base-clients",
      titre: "Base clients",
      pourquoi: "Importer la liste des clients actuels évite de les démarcher comme des prospects et repère les ventes croisées. Facultatif : le travail peut commencer sans.",
      detail: e.baseClients?.existe ? `${pluriel(e.baseClients.clients, "client chargé", "clients chargés")}.` : e.baseClients ? "Aucune base clients importée." : "Base clients non lue.",
      etat: lu(e.baseClients !== null, e.baseClients?.existe === true, "facultatif"),
    },
    {
      cle: "documents",
      titre: "Documents",
      pourquoi: "Conditions générales, fiches produit et tarifs : les agents ne citent que des documents en vigueur, avec leur version et l'endroit cité. Facultatif au début, utile dès qu'on rédige.",
      detail: e.connaissances ? (nbDocuments > 0 ? `${pluriel(nbDocuments, "document importé", "documents importés")}.` : "Aucun document importé.") : "Documents non lus.",
      etat: lu(e.connaissances !== null, nbDocuments > 0, "facultatif"),
    },
    {
      cle: "plafonds",
      titre: "Plafonds et budget",
      pourquoi: "Sans plafond choisi, aucune dépense publicitaire n'est possible. Chaque dépense reste de toute façon soumise à l'approbation d'un humain.",
      detail: e.reglages?.plafondPub ? "Plafond publicitaire choisi par le client." : e.reglages ? "Aucun plafond publicitaire choisi." : "Réglages non lus.",
      etat: lu(e.reglages !== null, e.reglages?.plafondPub != null),
    },
    {
      cle: "reel",
      titre: "Connexions",
      pourquoi: "Vue d'ensemble de ce qui est branché, de ce qui ne l'est pas encore et de ce qui est à fournir : qui doit agir et ce que chaque connexion débloque.",
      detail: manquants ? (manquants.length === 0 ? "Toutes les sources sont connectées." : `${pluriel(manquants.length, "connexion à établir", "connexions à établir")} sur ${e.realite.etat === "pret" ? e.realite.branchements.length : 0}.`) : "État des connexions non lu.",
      etat: manquants ? (manquants.length === 0 ? "fait" : "a_faire") : "inconnu",
    },
  ];
}

/** Indice de l'étape courante : la première qui n'est pas faite ; la dernière si tout est fait. */
export function indexEtapeCourante(etapes: readonly Pick<EtapeCalculee, "etat">[]): number {
  const i = etapes.findIndex((e) => e.etat !== "fait");
  return i < 0 ? Math.max(0, etapes.length - 1) : i;
}

const LIBELLE_ETAT: Record<EtatEtape, { libelle: string; ton: "succes" | "attention" | "neutre" }> = {
  fait: { libelle: "Fait", ton: "succes" },
  a_faire: { libelle: "À faire", ton: "attention" },
  facultatif: { libelle: "Facultatif", ton: "neutre" },
  inconnu: { libelle: "État non lu", ton: "neutre" },
};

/** Lecture ponctuelle d'une route du plugin ou d'une API native, relue quand `revision` change. */
function useLectureUnique<T>(lire: (companyId: string) => Promise<T>, revision: number): Lecture<T> {
  const { companyId } = useHostContext();
  const [lecture, setLecture] = useState<Lecture<T>>({ etat: "chargement", valeur: null });
  const charger = useCallback(() => lire(companyId ?? ""), [lire, companyId]);
  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    charger()
      .then((valeur) => !annule && setLecture({ etat: "pret", valeur }))
      .catch(() => !annule && setLecture({ etat: "erreur", valeur: null }));
    return () => {
      annule = true;
    };
  }, [companyId, charger, revision]);
  return lecture;
}

const lireBaseClients = (companyId: string) => appelRoute<{ existe: boolean; clients: number }>("GET", `/base-clients?companyId=${encodeURIComponent(companyId)}`);
const lireStatutConnaissances = (companyId: string) => appelRoute<StatutConnaissances>("GET", `/connaissances/statut?companyId=${encodeURIComponent(companyId)}`);
const lireServices = async (companyId: string) => lignesServices(await lireConnexionsNatives(companyId));

export function VueMiseEnPlace() {
  const { companyId } = useHostContext();
  const marque = useDonnees<VueMarque>("atelier.marque");
  const reglages = useDonnees<ReglagesEntreprise>("atelier.reglages");
  const sante = useDonnees<Diagnostic>("atelier.sante");
  // Les lectures ponctuelles sont refaites à chaque changement d'étape et après un import.
  const [revision, setRevision] = useState(0);
  const base = useLectureUnique(lireBaseClients, revision);
  const connaissances = useLectureUnique(lireStatutConnaissances, revision);
  const services = useLectureUnique(lireServices, revision);
  const [realite, relireRealite] = useRealite();
  const [choix, setChoix] = useState<number | null>(null);

  const nbServices = services.etat === "pret" ? (services.valeur?.filter((s) => s.etat === "reel_teste" || s.etat === "configure_non_verifie" || s.etat === "demonstration").length ?? 0) : null;
  const etapes = calculerEtapes({
    marque: marque.data,
    reglages: reglages.data,
    baseClients: base.valeur,
    connaissances: connaissances.valeur,
    nbServices,
    sourcesReelles: sante.data?.sourcesReelles ?? null,
    realite,
  });
  const courante = indexEtapeCourante(etapes);
  const affichee = choix ?? courante;
  const etape = etapes[affichee]!;
  const faites = etapes.filter((x) => x.etat === "fait").length;
  const aller = (i: number) => {
    setChoix(i);
    setRevision((r) => r + 1);
  };

  return (
    <>
      <BandeauEntreprise />
      <EnTete titre="Mise en place du client" description="Six étapes pour qu'un nouveau client puisse travailler avec l'équipe. L'état de chaque étape est lu sur l'atelier ; l'étape à faire en premier est signalée." />
      <div className="atl-progression" role="progressbar" aria-label="Progression de la mise en place" aria-valuemin={0} aria-valuemax={etapes.length} aria-valuenow={faites} aria-valuetext={`${faites} étape${faites > 1 ? "s" : ""} sur ${etapes.length} faite${faites > 1 ? "s" : ""}`}>
        <span className="atl-progression-barre" style={{ width: `${Math.round((faites / etapes.length) * 100)}%` }} />
      </div>
      <p className="atl-resume" role="status">
        <span>
          <strong>{faites}</strong> étape{faites > 1 ? "s" : ""} sur {etapes.length} faite{faites > 1 ? "s" : ""}
        </span>
      </p>
      <div className="atl-parcours">
        <nav aria-label="Étapes de la mise en place">
          <ol className="atl-parcours-liste">
            {etapes.map((e, i) => (
              <li key={e.cle}>
                <button type="button" className="atl-parcours-pas" data-etape={e.cle} data-etat={e.etat} data-courante={i === courante || undefined} aria-current={i === affichee ? "step" : undefined} onClick={() => aller(i)}>
                  <span className="atl-parcours-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="atl-parcours-nom">
                    {e.titre}
                    {i === courante && e.etat !== "fait" ? <span className="atl-sr"> (à faire en premier)</span> : null}
                  </span>
                  <Pastille ton={LIBELLE_ETAT[e.etat].ton}>{LIBELLE_ETAT[e.etat].libelle}</Pastille>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <section className="atl-parcours-panneau" aria-labelledby="atl-parcours-titre" data-etape={etape.cle}>
          <header className="atl-parcours-entete">
            <h2 id="atl-parcours-titre">
              Étape {affichee + 1} sur {etapes.length} : {etape.titre}
            </h2>
            <Pastille ton={LIBELLE_ETAT[etape.etat].ton}>{LIBELLE_ETAT[etape.etat].libelle}</Pastille>
          </header>
          <p className="atl-parcours-pourquoi">{etape.pourquoi}</p>
          {etape.cle !== "reel" ? (
            <p className="atl-parcours-detail" role="status">
              {etape.detail}
            </p>
          ) : null}
          <ContenuEtape cle={etape.cle} companyId={companyId ?? null} marque={marque.data} reglages={reglages.data} sante={sante.data} nbServices={nbServices} realite={realite} onMarque={marque.refresh} onReglages={reglages.refresh} onRelire={() => setRevision((r) => r + 1)} onRelireRealite={relireRealite} />
          <div className="atl-parcours-pas-suivant">
            {affichee > 0 ? (
              <Bouton variante="discret" onClick={() => aller(affichee - 1)}>
                Étape précédente
              </Bouton>
            ) : null}
            {affichee < etapes.length - 1 ? (
              <Bouton variante="secondaire" onClick={() => aller(affichee + 1)}>
                Étape suivante
              </Bouton>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}

interface PropsContenu {
  cle: CleEtape;
  companyId: string | null;
  marque: VueMarque | null;
  reglages: ReglagesEntreprise | null;
  sante: Diagnostic | null;
  nbServices: number | null;
  realite: LectureRealite;
  onMarque(): void;
  onReglages(): void;
  onRelire(): void;
  onRelireRealite(): void;
}

function ContenuEtape(p: PropsContenu) {
  switch (p.cle) {
    case "fiche":
      return <EtapeFiche marque={p.marque} onFait={p.onMarque} />;
    case "sources":
      return <EtapeSources sante={p.sante} nbServices={p.nbServices} />;
    case "base-clients":
      return <BaseClients />;
    case "documents":
      return p.companyId ? (
        <>
          <style>{STYLES_CONNAISSANCES}</style>
          <Import companyId={p.companyId} onImporte={p.onRelire} />
          <ImportPageWeb companyId={p.companyId} onImporte={p.onRelire} />
          <p>
            <LienHote vers={chemin("connaissances")} className="atl-bouton">
              Voir tous les documents
            </LienHote>
          </p>
        </>
      ) : null;
    case "plafonds":
      return p.reglages ? (
        <>
          <Section titre="Plafond publicitaire">
            <PlafondEntreprise reglages={p.reglages} onFait={p.onReglages} />
          </Section>
          <Section titre="Budget IA des agents">
            <BudgetsIa />
          </Section>
        </>
      ) : (
        <p className="atl-attenue">Réglages en cours de lecture…</p>
      );
    case "reel":
      return (
        <>
          <RecapPassageAuReel lecture={p.realite} relire={p.onRelireRealite} />
          <p>
            <LienHote vers={LIEN_PASSAGE_AU_REEL} className="atl-bouton">
              Ouvrir les connexions
            </LienHote>
          </p>
        </>
      );
  }
}

function EtapeFiche({ marque, onFait }: { marque: VueMarque | null; onFait(): void }) {
  const [edition, setEdition] = useState(false);
  if (marque === null) return <p className="atl-attenue">Lecture de la fiche en cours…</p>;
  const m = marque.marque;
  const ouvert = edition || m === null;
  return (
    <>
      {m ? (
        <ul className="atl-liste-compacte" aria-label="Bureaux de la fiche">
          {m.etablissements.length === 0 ? <li className="atl-attenue">Aucun bureau dans la fiche.</li> : null}
          {m.etablissements.map((e, i) => (
            <li key={`${i}-${e.nom}`}>
              <strong>{e.nom}</strong>
              <span className="atl-sous">{e.position ? "Position renseignée" : "Position à saisir"}</span>
              <span className="atl-sous">{(e.segmentsSuivis ?? []).length > 0 ? `Segments suivis : ${(e.segmentsSuivis ?? []).join(", ")}` : "Segments suivis à saisir"}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {m ? (
        <Bouton variante={ouvert ? "discret" : "secondaire"} onClick={() => setEdition((x) => !x)}>
          {ouvert ? "Fermer la saisie" : "Compléter la fiche (nouvelle version)"}
        </Bouton>
      ) : null}
      {ouvert ? (
        <EditeurMarque
          initiale={m}
          onFait={() => {
            setEdition(false);
            onFait();
          }}
        />
      ) : null}
    </>
  );
}

function EtapeSources({ sante, nbServices }: { sante: Diagnostic | null; nbServices: number | null }) {
  const src = sante?.sourcesReelles;
  return (
    <>
      <p className="atl-attenue">{detailSources(nbServices, src ?? null)}</p>
      {src && src.passerelle === "joignable" ? (
        <ul className="atl-liste-compacte" aria-label="Sources réelles">
          {src.sources.map((s) => (
            <li key={s.cle}>
              {s.nom} <Pastille ton={s.reelle ? "succes" : "neutre"}>{s.reelle ? "Réelle" : "Pas encore réelle"}</Pastille>
            </li>
          ))}
        </ul>
      ) : null}
      <p>
        <LienHote vers={chemin("parametres")} className="atl-bouton">
          Ouvrir les connexions et les sources
        </LienHote>
      </p>
    </>
  );
}
