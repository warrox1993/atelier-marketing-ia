/**
 * Interface de l'Atelier Marketing IA (lot C), montée par Paperclip via les
 * emplacements déclarés dans le manifeste. Exports obligatoires : EXPORTS_UI.
 *
 * - Lecture : `usePluginData(<clé de DONNEES_UI>)` ; l'hôte ajoute l'entreprise.
 * - Actions : `usePluginAction(<clé de ACTIONS_UI>)` ; les droits sont contrôlés
 *   côté serveur, l'interface ne fait qu'expliquer pourquoi une action est
 *   indisponible.
 * - Tout en français, dates à l'heure de Bruxelles, aucune mention de démonstration.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  useHostContext,
  useHostLocation,
  type PluginDetailTabProps,
  type PluginPageProps,
  type PluginRouteSidebarProps,
  type PluginSidebarProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import type { VueContenusAValider, VueEquipe } from "../contrats/ui.js";
import { BandeauEntreprise, Bouton, Champ, Chargement, EtatErreur, LienHote } from "./composants.js";
import { BandeauDecisions, VeilleDecisions } from "./composants/bandeau-decisions.js";
import { useCartesServices, useDirectionId } from "./cartes-services.js";
import { useNombreAFaire, useTitreOnglet } from "./compteur-afaire.js";
import { useEnvoiDemande } from "./demande.js";
import { FournisseurDonnees, useDonnees } from "./donnees.js";
import { ListeOnglets, PanneauOnglet, useAncre } from "./onglets.js";
import { chemin, lireRoute, type CleVue } from "./route.js";
import { cheminOnglet, estVueEnsemble, rubriquesVisibles, rubriqueDe, sansMenuSecondaire, type CleRubriqueNav, type RubriqueNav } from "./rubriques.js";
import { STYLES_ATELIER } from "./styles.js";
import { VueCalendrier } from "./vues/calendrier.js";
import { VueCampagnes } from "./vues/campagnes.js";
import { VueCarte } from "./vues/carte.js";
import { Dossier, VueContenus } from "./vues/contenus.js";
import { VueEquipeAtelier } from "./vues/equipe.js";
import { VueMarqueAtelier } from "./vues/marque.js";
import { VueMiseEnPlace } from "./vues/mise-en-place.js";
import { VueParametres } from "./vues/parametres.js";
import { VueProspects } from "./vues/prospects.js";
import { VueConnaissances } from "./vues/connaissances.js";
import { VueCorbeille } from "./vues/corbeille.js";
import { VueDiscussion } from "./vues/discussion.js";
import { VueResultatsAtelier } from "./vues/resultats.js";
import { VueRapport } from "./vues/rapport.js";
import { VueTableau } from "./vues/tableau.js";
import { OngletEchanges, useAccesDirection, useLiaisonsTache, VueRegistre } from "./vues/echanges.js";
import { VueEnsembleClient } from "./vues/ensemble.js";
import { aPlusieursDepartements, slugDuService, useDepartements } from "./departements-sonde.js";
import { useRedirectionBureau } from "./redirections.js";

/** Racine commune : styles (dédupliqués par React), langue, portée `.atl`. */
function Racine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`atl${className ? ` ${className}` : ""}`} lang="fr">
      <style href="atelier-marketing-ia" precedence="default">
        {STYLES_ATELIER}
      </style>
      {children}
    </div>
  );
}

function SansEntreprise() {
  return <EtatErreur erreur={{ code: "INVOCATION_SCOPE_DENIED", message: "Aucune entreprise n'est sélectionnée : ouvrez l'atelier depuis une entreprise Paperclip." }} />;
}

function Vue({ vue, id }: { vue: CleVue; id: string | null }) {
  switch (vue) {
    case "discussion":
      return <VueDiscussion />;
    case "equipe":
      return <VueEquipeAtelier agentId={id} />;
    case "campagnes":
      return <VueCampagnes id={id} />;
    case "contenus":
      return <VueContenus id={id} />;
    case "calendrier":
      return <VueCalendrier />;
    case "resultats":
      return <VueResultatsAtelier />;
    case "marque":
      return <VueMarqueAtelier />;
    case "prospects":
      return <VueProspects />;
    case "carte":
      return <VueCarte />;
    case "connaissances":
      return <VueConnaissances />;
    case "mise-en-place":
      return <VueMiseEnPlace />;
    case "parametres":
      return <VueParametres />;
    case "corbeille":
      return <VueCorbeille />;
    case "tableau":
      return <VueTableau />;
    case "rapport":
      return <VueRapport />;
    case "echanges":
      return <VueRegistre />;
    case "departements":
    case "organigramme":
      return <VueEnsembleClient vueAdresse={vue} />;
  }
}

/** Rubriques affichées dans la page sur téléphone (la barre latérale y est repliée). */
function Rubriques({ courante, rubriques }: { courante: CleRubriqueNav; rubriques: ReadonlyArray<RubriqueNav> }) {
  const barre = useRef<HTMLElement>(null);
  const [suite, setSuite] = useState(false);
  // La rubrique active est amenée dans la vue au chargement et à chaque changement de rubrique.
  useEffect(() => {
    const actif = barre.current?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (actif && typeof actif.scrollIntoView === "function") actif.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [courante]);
  // L'ombre du bord droit reste tant qu'il y a des rubriques à faire défiler.
  useEffect(() => {
    const el = barre.current;
    if (!el) return;
    const mesurer = () => setSuite(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    mesurer();
    el.addEventListener("scroll", mesurer, { passive: true });
    window.addEventListener("resize", mesurer);
    return () => {
      el.removeEventListener("scroll", mesurer);
      window.removeEventListener("resize", mesurer);
    };
  }, []);
  return (
    <div className="atl-onglets-cadre" data-suite={suite ? "oui" : undefined}>
      <nav className="atl-onglets" aria-label="Rubriques de l'atelier" ref={barre}>
        {rubriques.map((r) => (
          <LienHote key={r.cle} vers={cheminOnglet(r.onglets[0]!)} courant={r.cle === courante} className="">
            {r.libelle}
          </LienHote>
        ))}
      </nav>
    </div>
  );
}

/**
 * Titre de l'onglet du navigateur : « (3) Atelier » selon le nombre d'éléments en attente, décisions des autres
 * services comprises.
 */
function TitreOnglet({ companyId }: { companyId: string | null | undefined }) {
  const aFaire = useNombreAFaire(companyId);
  const decisions = useCartesServices(useDirectionId(companyId)).cartes.length;
  useTitreOnglet(aFaire === null && decisions === 0 ? null : (aFaire ?? 0) + decisions);
  return null;
}

export function PageAtelier({ context }: PluginPageProps) {
  const { pathname } = useHostLocation();
  const route = lireRoute(pathname);
  const ancre = useAncre();
  const { rubrique, onglet } = rubriqueDe(route.vue, ancre);
  const base = `atl-rub-${rubrique.cle}`;
  const departements = useDepartements(context.companyId);
  const slugService = slugDuService(departements, context.companyId);
  const rubriques = rubriquesVisibles({ estDirection: useAccesDirection(context.companyId), slugService });
  // Chat, Réglages et vues d'ensemble : pas de rubriques de bureau (Prospects, Marketing, Registre).
  const sansRubriques = sansMenuSecondaire(route.vue, ancre) || rubriques.length === 0;
  // Vue ouverte dans le mauvais bureau (chat hors Direction, Prospects ou Marketing hors Marketing) : redirection.
  const redirection = useRedirectionBureau(context.companyId, route.vue, route.id, departements);
  const vue = !context.companyId ? <SansEntreprise /> : redirection ? <Chargement libelle="Ouverture du bureau concerné" lignes={2} /> : <Vue key={`${route.vue}:${route.id ?? ""}`} vue={route.vue} id={route.id} />;
  return (
    <Racine>
      <FournisseurDonnees>
        <TitreOnglet companyId={context.companyId} />
        {/* Vue d'ensemble (Départements et Organigramme) : toute la largeur de l'écran pour les deux vues, afin que la bascule ne change ni de largeur ni de place d'une vue à l'autre. */}
        <main className={estVueEnsemble(route.vue) ? "atl-page atl-page-large" : "atl-page"}>
          {context.companyId ? <BandeauEntreprise /> : null}
          {/* Décisions qui attendent dans un service : bandeau persistant, sauf dans le chat où les cartes sont dans le fil. */}
          {context.companyId && route.vue !== "discussion" ? <BandeauDecisions companyId={context.companyId} /> : null}
          {/* Chat, Réglages et vues de groupe : pas de rubriques d'un bureau, sur téléphone non plus. */}
          {sansRubriques ? null : <Rubriques courante={rubrique.cle} rubriques={rubriques} />}
          {rubrique.onglets.length > 1 ? (
            <ListeOnglets
              etiquette={`${rubrique.libelle} : sections`}
              base={base}
              actif={onglet.cle}
              onglets={rubrique.onglets.map((o) => ({ cle: o.cle, libelle: o.libelle, vers: cheminOnglet(o), suite: o.cle === "contenus" && context.companyId ? <CompteurContenus /> : undefined }))}
            />
          ) : null}
          {rubrique.onglets.length > 1 ? (
            <PanneauOnglet base={base} cle={onglet.cle} actif>
              {vue}
            </PanneauOnglet>
          ) : (
            vue
          )}
        </main>
      </FournisseurDonnees>
    </Racine>
  );
}

function CompteurContenus() {
  const r = useDonnees<VueContenusAValider>("atelier.contenus-a-valider");
  const n = r.data?.prets.length ?? 0;
  if (!n) return null;
  return (
    <span className="atl-nav-compte">
      {n}
      <span className="atl-sr"> à valider</span>
    </span>
  );
}

export function NavigationAtelier({ context }: PluginRouteSidebarProps) {
  const { pathname } = useHostLocation();
  const route = lireRoute(pathname);
  const ancre = useAncre();
  const { rubrique } = rubriqueDe(route.vue, ancre);
  const slugService = slugDuService(useDepartements(context.companyId), context.companyId);
  const rubriques = rubriquesVisibles({ estDirection: useAccesDirection(context.companyId), slugService });
  // Chat (pleine largeur), Réglages et vues d'ensemble : pas de deuxième colonne (le menu principal les propose).
  if (sansMenuSecondaire(route.vue, ancre) || rubriques.length === 0) return null;
  return (
    <Racine>
      <FournisseurDonnees veille={false}>
        <nav className="atl-nav" aria-label="Rubriques de l'atelier">
          {rubriques.map((r) => (
            <LienHote key={r.cle} vers={cheminOnglet(r.onglets[0]!)} courant={rubrique.cle === r.cle} className="">
              <span>{r.libelle}</span>
              {r.cle === "marketing" && context.companyId ? <CompteurContenus /> : null}
            </LienHote>
          ))}
        </nav>
      </FournisseurDonnees>
    </Racine>
  );
}

export function EntreeAtelier({ context }: PluginSidebarProps) {
  const { pathname } = useHostLocation();
  const departements = useDepartements(context.companyId);
  const vueCourante = lireRoute(pathname).vue;
  const actif = /\/atelier(\/|$)/u.test(pathname);
  const surEnsemble = vueCourante === "departements" || vueCourante === "organigramme";
  const ancre = useAncre();
  const surReglages = actif && rubriqueDe(vueCourante, ancre).rubrique.cle === "reglages";
  return (
    <Racine>
      {/* Veille des décisions en attente : alimente la pastille « Coordinateur général » du menu, où que soit la personne. */}
      <VeilleDecisions companyId={context.companyId} />
      {/* Client à plusieurs services : la vue d'ensemble (grille des départements ou organigramme), depuis le menu principal. */}
      {aPlusieursDepartements(departements) ? (
        <LienHote vers={chemin("departements")} className="atl-entree" courant={surEnsemble}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            {/* Départements : une grille de quatre cartes (même trait que les autres icônes de l'atelier). */}
            <rect x="1.75" y="1.75" width="5.25" height="5.25" rx="0.75" stroke="currentColor" strokeWidth="1.4" />
            <rect x="9" y="1.75" width="5.25" height="5.25" rx="0.75" stroke="currentColor" strokeWidth="1.4" />
            <rect x="1.75" y="9" width="5.25" height="5.25" rx="0.75" stroke="currentColor" strokeWidth="1.4" />
            <rect x="9" y="9" width="5.25" height="5.25" rx="0.75" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          Départements
        </LienHote>
      ) : null}
      <LienHote vers={chemin("mise-en-place")} className="atl-entree" courant={surReglages}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          {/* Réglages : deux curseurs (même trait que les autres icônes de l'atelier). */}
          <path d="M2 4.5h12M2 11.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="10" cy="4.5" r="1.75" fill="var(--atl-fond, #fff)" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="6" cy="11.5" r="1.75" fill="var(--atl-fond, #fff)" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        Réglages de l'atelier
      </LienHote>
    </Racine>
  );
}

export function OngletAtelierTache({ context }: PluginDetailTabProps) {
  return (
    <Racine className="atl-onglet">
      <FournisseurDonnees veille={false}>
        <div className="atl-page atl-page-onglet">
          <ContenuOngletTache issueId={context.entityId} />
        </div>
      </FournisseurDonnees>
    </Racine>
  );
}

/** Dossier de la tâche ; si la tâche a des échanges avec d'autres services, un second onglet « Échanges » apparaît. */
function ContenuOngletTache({ issueId }: { issueId: string }) {
  const liaisons = useLiaisonsTache(issueId);
  const [choix, setChoix] = useState<string | null>(null);
  if (!liaisons || liaisons.length === 0) return <Dossier issueId={issueId} compact />;
  // Une tâche reçue d'un autre service s'ouvre sur ses échanges ; une tâche d'origine, sur son dossier.
  const actif = choix ?? (liaisons.every((l) => l.role === "cible") ? "echanges" : "dossier");
  return (
    <>
      <ListeOnglets
        etiquette="Sections de la tâche"
        base="atl-tache"
        actif={actif}
        choisir={setChoix}
        onglets={[
          { cle: "dossier", libelle: "Dossier" },
          { cle: "echanges", libelle: "Échanges", suite: <span className="atl-nav-compte">{liaisons.length}<span className="atl-sr"> échange{liaisons.length > 1 ? "s" : ""}</span></span> },
        ]}
      />
      <PanneauOnglet base="atl-tache" cle="dossier" actif={actif === "dossier"}>
        <Dossier issueId={issueId} compact />
      </PanneauOnglet>
      <PanneauOnglet base="atl-tache" cle="echanges" actif={actif === "echanges"}>
        <OngletEchanges liaisons={liaisons} />
      </PanneauOnglet>
    </>
  );
}

export function WidgetAtelier({ context }: PluginWidgetProps) {
  return (
    <Racine>
      <FournisseurDonnees veille={false}>{context.companyId ? <ContenuWidget /> : <SansEntreprise />}</FournisseurDonnees>
    </Racine>
  );
}

function ContenuWidget() {
  const contenus = useDonnees<VueContenusAValider>("atelier.contenus-a-valider");
  const equipe = useDonnees<VueEquipe>("atelier.equipe");
  const contexte = useHostContext();
  if (contenus.error) return <EtatErreur erreur={contenus.error} onReessayer={contenus.refresh} contexte="atelier" />;
  if (!contenus.data) return <Chargement libelle="Atelier" lignes={2} />;
  return (
    <section className="atl-widget" aria-label="Atelier">
      <div className="atl-widget-ligne">
        <span>
          <strong>{contenus.data.prets.length}</strong> à valider
        </span>
        <span>
          <strong>{contenus.data.bloques.length}</strong> bloqué{contenus.data.bloques.length > 1 ? "s" : ""}
        </span>
        {equipe.data ? (
          <span>
            <strong>{equipe.data.runsActifs}</strong> passage{equipe.data.runsActifs > 1 ? "s" : ""} actif{equipe.data.runsActifs > 1 ? "s" : ""} sur {equipe.data.plafondRunsActifs}
          </span>
        ) : null}
      </div>
      {contexte.companyId ? (
        <LienHote vers={chemin("contenus")} className="atl-bouton">
          Ouvrir les contenus à valider
        </LienHote>
      ) : null}
      <DemandeRapide companyId={contexte.companyId ?? null} />
    </section>
  );
}

/** Petit formulaire « Demander à l'équipe » de l'encart : même route et même redirection que l'accueil. */
function DemandeRapide({ companyId }: { companyId: string | null }) {
  const [texte, setTexte] = useState("");
  const { envoyer, enCours, erreur } = useEnvoiDemande(companyId);
  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (await envoyer(texte)) setTexte("");
  };
  if (!companyId) return null;
  return (
    <form className="atl-widget-demande" onSubmit={soumettre}>
      <Champ libelle="Demander à l'équipe">
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={2} placeholder="Écrivez votre demande au Coordinateur" />
      </Champ>
      <Bouton type="submit" variante="principal" enCours={enCours} raisonDesactive={texte.trim() === "" ? "Écrivez d'abord votre demande." : null}>
        Envoyer
      </Bouton>
      {erreur ? (
        <p className="atl-widget-erreur" role="alert">
          {erreur}
        </p>
      ) : null}
    </form>
  );
}
