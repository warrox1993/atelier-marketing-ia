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
import { useNombreAFaire, useTitreOnglet } from "./compteur-afaire.js";
import { useEnvoiDemande } from "./demande.js";
import { FournisseurDonnees, useDonnees } from "./donnees.js";
import { ListeOnglets, PanneauOnglet, useAncre } from "./onglets.js";
import { chemin, lireRoute, type CleVue } from "./route.js";
import { cheminOnglet, rubriquesVisibles, rubriqueDe, type CleRubriqueNav, type RubriqueNav } from "./rubriques.js";
import { STYLES_ATELIER } from "./styles.js";
import { VueAccueil } from "./vues/accueil.js";
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
import { OngletEchanges, useAccesDirection, useLiaisonsTache, VueRegistre } from "./vues/echanges.js";

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
    case "accueil":
      return <VueAccueil />;
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
    case "rapport":
      return <VueRapport />;
    case "echanges":
      return <VueRegistre />;
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

/** Titre de l'onglet du navigateur : « (3) Atelier » selon le nombre d'éléments en attente. */
function TitreOnglet({ companyId }: { companyId: string | null | undefined }) {
  useTitreOnglet(useNombreAFaire(companyId));
  return null;
}

export function PageAtelier({ context }: PluginPageProps) {
  const { pathname } = useHostLocation();
  const route = lireRoute(pathname);
  const { rubrique, onglet } = rubriqueDe(route.vue, useAncre());
  const base = `atl-rub-${rubrique.cle}`;
  const rubriques = rubriquesVisibles(useAccesDirection(context.companyId));
  const vue = context.companyId ? <Vue key={`${route.vue}:${route.id ?? ""}`} vue={route.vue} id={route.id} /> : <SansEntreprise />;
  return (
    <Racine>
      <FournisseurDonnees>
        <TitreOnglet companyId={context.companyId} />
        <main className="atl-page">
          {context.companyId && route.vue !== "mise-en-place" ? <BandeauEntreprise /> : null}
          <Rubriques courante={rubrique.cle} rubriques={rubriques} />
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

/** Pastille du nombre d'éléments en attente (entrée du menu et rubrique « À faire »). */
function PastilleAFaire({ companyId }: { companyId: string | null | undefined }) {
  const n = useNombreAFaire(companyId);
  if (!n) return null;
  return (
    <span className="atl-nav-compte" data-testid="pastille-afaire">
      {n}
      <span className="atl-sr"> à faire</span>
    </span>
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
  const { rubrique } = rubriqueDe(route.vue, useAncre());
  const rubriques = rubriquesVisibles(useAccesDirection(context.companyId));
  return (
    <Racine>
      <FournisseurDonnees veille={false}>
        <nav className="atl-nav" aria-label="Rubriques de l'atelier">
          {rubriques.map((r) => {
            const lien = (
              <LienHote key={r.cle} vers={cheminOnglet(r.onglets[0]!)} courant={rubrique.cle === r.cle} className="">
                <span>{r.libelle}</span>
                {r.cle === "marketing" && context.companyId ? <CompteurContenus /> : null}
                {r.cle === "accueil" && context.companyId ? <PastilleAFaire companyId={context.companyId} /> : null}
              </LienHote>
            );
            return r.cle === "reglages" ? (
              <div key={r.cle} className="atl-nav-pied">
                {lien}
                <LienHote vers="/dashboard" className="atl-nav-sortie">
                  <span>Menu principal (tableau de bord)</span>
                </LienHote>
              </div>
            ) : (
              lien
            );
          })}
        </nav>
      </FournisseurDonnees>
    </Racine>
  );
}

export function EntreeAtelier({ context }: PluginSidebarProps) {
  const { pathname } = useHostLocation();
  const actif = /\/atelier(\/|$)/u.test(pathname);
  return (
    <Racine>
      <LienHote vers={chemin("accueil")} className="atl-entree" courant={actif}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2.5 13.5V6l5.5-3.5L13.5 6v7.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M6 13.5v-4h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        Atelier marketing
        {context.companyId ? <PastilleAFaire companyId={context.companyId} /> : null}
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
  if (!contenus.data) return <Chargement libelle="Atelier marketing" lignes={2} />;
  return (
    <section className="atl-widget" aria-label="Atelier marketing">
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
