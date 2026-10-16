/**
 * Mise en place du client : la liste des sept choses à régler avant de travailler pour un nouveau
 * client, avec pour chacune son état (fait ou à faire, lu sur les routes existantes) et un lien vers
 * la rubrique qui permet de la régler. Aucune écriture : la vue ne fait que lire.
 *
 * Sources de l'état :
 * - marque et offres : `atelier.marque` (référentiel enregistré ou non) ;
 * - connexions : connexions natives de la passerelle (même lecture que le tableau des connecteurs) ;
 * - base clients : `GET /base-clients` ;
 * - documents : `GET /connaissances/statut` ;
 * - plafonds : `atelier.reglages` (plafond publicitaire choisi ou non) ;
 * - premier brief : `atelier.campagnes` (au moins une campagne).
 */
import { useCallback, useEffect, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { Campagne, Diagnostic, ReglagesEntreprise } from "../../contrats/campagnes.js";
import type { StatutConnaissances } from "../../contrats/connaissances.js";
import type { VueMarque } from "../../contrats/ui.js";
import { BandeauEntreprise, EnTete, LienHote, Pastille } from "../composants.js";
import { lireConnexionsNatives, lignesServices } from "../connexions-natives.js";
import { useDonnees } from "../donnees.js";
import { chemin, type CleVue } from "../route.js";
import { appelRoute } from "../routes-prospection.js";

type Etat = "fait" | "a_faire" | "inconnu";
interface LectureUnique<T> {
  etat: "chargement" | "erreur" | "pret";
  valeur: T | null;
}

/** Lecture ponctuelle d'une route du plugin ou d'une API native, sans casser la vue en cas d'échec. */
function useLectureUnique<T>(lire: (companyId: string) => Promise<T>): LectureUnique<T> {
  const { companyId } = useHostContext();
  const [lecture, setLecture] = useState<LectureUnique<T>>({ etat: "chargement", valeur: null });
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
  }, [companyId, charger]);
  return lecture;
}

const lireBaseClients = (companyId: string) => appelRoute<{ existe: boolean; clients: number }>("GET", `/base-clients?companyId=${encodeURIComponent(companyId)}`);
const lireStatutConnaissances = (companyId: string) => appelRoute<StatutConnaissances>("GET", `/connaissances/statut?companyId=${encodeURIComponent(companyId)}`);
const lireServices = async (companyId: string) => lignesServices(await lireConnexionsNatives(companyId));

interface LigneEtape {
  cle: string;
  titre: string;
  detail: string;
  etat: Etat;
  vers: CleVue;
  action: string;
}

const LIBELLE_ETAT: Record<Etat, { libelle: string; ton: "succes" | "neutre" }> = {
  fait: { libelle: "Fait", ton: "succes" },
  a_faire: { libelle: "À faire", ton: "neutre" },
  inconnu: { libelle: "État non lu", ton: "neutre" },
};

export function VueMiseEnPlace() {
  const marque = useDonnees<VueMarque>("atelier.marque");
  const reglages = useDonnees<ReglagesEntreprise>("atelier.reglages");
  const campagnes = useDonnees<Campagne[]>("atelier.campagnes");
  const base = useLectureUnique(lireBaseClients);
  const connaissances = useLectureUnique(lireStatutConnaissances);
  const services = useLectureUnique(lireServices);
  const sante = useDonnees<Diagnostic>("atelier.sante");

  const lire = (pret: boolean, fait: boolean): Etat => (pret ? (fait ? "fait" : "a_faire") : "inconnu");
  const nbServices = services.valeur?.filter((s) => s.etat === "reel_teste" || s.etat === "configure_non_verifie" || s.etat === "demonstration").length ?? 0;

  const nbDocuments = connaissances.valeur?.documents ?? 0;
  const sourcesReelles = sante.data?.sourcesReelles;
  const nbSourcesReelles = sourcesReelles?.sources.filter((s) => s.reelle).length ?? 0;
  const texteDocuments = connaissances.etat === "pret" ? `${nbDocuments} document${nbDocuments > 1 ? "s" : ""} de connaissances` : "documents de connaissances non lus";
  const texteSources = !sourcesReelles
    ? "sources réelles non lues"
    : sourcesReelles.passerelle !== "joignable"
      ? "passerelle non vérifiée, aucune source tenue pour réelle"
      : `${nbSourcesReelles} source${nbSourcesReelles > 1 ? "s" : ""} réelle${nbSourcesReelles > 1 ? "s" : ""} sur ${sourcesReelles.sources.length}`;
  const detailSources = `${texteDocuments} ; ${texteSources}.`;

  const etapes: LigneEtape[] = [
    {
      cle: "marque",
      titre: "Marque et offres",
      detail: marque.data?.marque ? `Référentiel enregistré (version ${marque.data.versions[0]?.version ?? 1}).` : "Décrivez la marque, ses offres, son ton et ses règles de conformité : les agents s'y réfèrent pour tout contenu.",
      etat: lire(marque.data !== null, marque.data?.marque != null),
      vers: "marque",
      action: "Ouvrir la marque",
    },
    {
      cle: "connexions",
      titre: "Connexions de la passerelle",
      detail: nbServices > 0 ? `${nbServices} service${nbServices > 1 ? "s" : ""} relié${nbServices > 1 ? "s" : ""} (Google, réseaux sociaux, CRM).` : "Reliez au moins un service (analyse, réseaux sociaux ou CRM) pour que les agents lisent de vraies données.",
      etat: lire(services.etat === "pret", nbServices > 0),
      vers: "parametres",
      action: "Voir les connexions",
    },
    {
      cle: "base-clients",
      titre: "Base clients",
      detail: base.valeur?.existe ? `${base.valeur.clients} clients chargés.` : "Importez un fichier CSV ou Excel pour exclure vos clients actuels et repérer les ventes croisées.",
      etat: lire(base.etat === "pret", base.valeur?.existe === true),
      vers: "prospects",
      action: "Ouvrir la base clients",
    },
    {
      cle: "documents",
      titre: "Documents",
      detail: (connaissances.valeur?.documents ?? 0) > 0 ? `${connaissances.valeur!.documents} document${connaissances.valeur!.documents > 1 ? "s" : ""} importé${connaissances.valeur!.documents > 1 ? "s" : ""}.` : "Importez les conditions générales, les fiches produit et les tarifs : les agents pourront les citer.",
      etat: lire(connaissances.etat === "pret", (connaissances.valeur?.documents ?? 0) > 0),
      vers: "connaissances",
      action: "Ouvrir les documents",
    },
    {
      cle: "sources",
      titre: "Connaissances et sources réelles",
      detail: detailSources,
      etat: lire(sante.data !== null && connaissances.etat === "pret", nbDocuments > 0 || nbSourcesReelles > 0),
      vers: "parametres",
      action: "Voir les sources",
    },
    {
      cle: "plafonds",
      titre: "Plafonds de dépense",
      detail: reglages.data?.plafondPub ? "Plafond publicitaire choisi par le client." : "Choisissez le plafond publicitaire (un montant ou aucune limite). Chaque dépense reste soumise à l'approbation d'un humain.",
      etat: lire(reglages.data !== null, reglages.data?.plafondPub != null),
      vers: "parametres",
      action: "Régler les plafonds",
    },
    {
      cle: "brief",
      titre: "Premier brief",
      detail: (campagnes.data?.length ?? 0) > 0 ? `${campagnes.data!.length} campagne${campagnes.data!.length > 1 ? "s" : ""} créée${campagnes.data!.length > 1 ? "s" : ""}.` : "Créez une première campagne avec son brief : l'équipe prend le relais à partir de là.",
      etat: lire(campagnes.data !== null, (campagnes.data?.length ?? 0) > 0),
      vers: "campagnes",
      action: "Créer une campagne",
    },
  ];
  const faites = etapes.filter((e) => e.etat === "fait").length;

  return (
    <>
      <BandeauEntreprise />
      <EnTete titre="Mise en place du client" description="Sept étapes pour qu'un nouveau client puisse travailler avec l'équipe. L'état est lu sur l'atelier ; chaque étape mène à la rubrique qui la règle." />
      <p className="atl-resume" role="status">
        <span>
          <strong>{faites}</strong> étape{faites > 1 ? "s" : ""} sur {etapes.length} faite{faites > 1 ? "s" : ""}
        </span>
      </p>
      <ol className="atl-etapes">
        {etapes.map((e, i) => {
          const etat = LIBELLE_ETAT[e.etat];
          return (
            <li key={e.cle} className="atl-etape" data-etat={e.etat}>
              <span className="atl-etape-titre">
                {i + 1}. {e.titre}
              </span>
              <span className="atl-etape-detail">{e.detail}</span>
              <span className="atl-etape-etat">
                <Pastille ton={etat.ton}>{etat.libelle}</Pastille>
                <LienHote vers={chemin(e.vers)} className="atl-bouton">
                  {e.action}
                </LienHote>
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
