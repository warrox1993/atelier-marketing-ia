/**
 * Interface de l'Atelier Marketing IA (lot C), montée par Paperclip via les
 * emplacements déclarés dans le manifeste. Exports obligatoires : EXPORTS_UI.
 *
 * - Lecture : `usePluginData(<clé de DONNEES_UI>)` ; l'hôte ajoute l'entreprise.
 * - Actions : `usePluginAction(<clé de ACTIONS_UI>)` ; les droits sont contrôlés
 *   côté serveur, l'interface ne fait qu'expliquer pourquoi une action est
 *   indisponible.
 * - Tout en français, dates à l'heure de Bruxelles, mention « démonstration ».
 */
import type { ReactNode } from "react";
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
import { Chargement, EtatErreur, LienHote } from "./composants.js";
import { FournisseurDonnees, useDonnees } from "./donnees.js";
import { chemin, lireRoute, VUES, type CleVue } from "./route.js";
import { STYLES_ATELIER } from "./styles.js";
import { VueCalendrier } from "./vues/calendrier.js";
import { VueCampagnes } from "./vues/campagnes.js";
import { Dossier, VueContenus } from "./vues/contenus.js";
import { VueEquipeAtelier } from "./vues/equipe.js";
import { VueMarqueAtelier } from "./vues/marque.js";
import { VueParametres } from "./vues/parametres.js";
import { VueResultatsAtelier } from "./vues/resultats.js";

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
    case "parametres":
      return <VueParametres />;
  }
}

/** Onglets de rubriques affichés dans la page sur téléphone (la barre latérale y est repliée). */
function Onglets({ courante }: { courante: CleVue }) {
  return (
    <nav className="atl-onglets" aria-label="Rubriques de l'atelier">
      {VUES.map((v) => (
        <LienHote key={v.cle} vers={chemin(v.cle)} courant={v.cle === courante} className="">
          {v.libelle}
        </LienHote>
      ))}
    </nav>
  );
}

export function PageAtelier({ context }: PluginPageProps) {
  const { pathname } = useHostLocation();
  const route = lireRoute(pathname);
  return (
    <Racine>
      <FournisseurDonnees>
        <main className="atl-page">
          <Onglets courante={route.vue} />
          {context.companyId ? <Vue key={`${route.vue}:${route.id ?? ""}`} vue={route.vue} id={route.id} /> : <SansEntreprise />}
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
  return (
    <Racine>
      <FournisseurDonnees veille={false}>
        <nav className="atl-nav" aria-label="Rubriques de l'atelier">
          {VUES.filter((v) => v.cle !== "parametres").map((v) => (
            <LienHote key={v.cle} vers={chemin(v.cle)} courant={route.vue === v.cle} className="">
              <span>{v.libelle}</span>
              {v.cle === "contenus" && context.companyId ? <CompteurContenus /> : null}
            </LienHote>
          ))}
          <div className="atl-nav-pied">
            <LienHote vers={chemin("parametres")} courant={route.vue === "parametres"} className="">
              Paramètres et diagnostic
            </LienHote>
          </div>
        </nav>
      </FournisseurDonnees>
    </Racine>
  );
}

export function EntreeAtelier(_props: PluginSidebarProps) {
  const { pathname } = useHostLocation();
  const actif = /\/atelier(\/|$)/u.test(pathname);
  return (
    <Racine>
      <LienHote vers={chemin("equipe")} className="atl-entree" courant={actif}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2.5 13.5V6l5.5-3.5L13.5 6v7.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M6 13.5v-4h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        Atelier marketing
      </LienHote>
    </Racine>
  );
}

export function OngletAtelierTache({ context }: PluginDetailTabProps) {
  return (
    <Racine className="atl-onglet">
      <FournisseurDonnees veille={false}>
        <div className="atl-page atl-page-onglet">
          <Dossier issueId={context.entityId} compact />
        </div>
      </FournisseurDonnees>
    </Racine>
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
            <strong>{equipe.data.runsActifs}</strong> run{equipe.data.runsActifs > 1 ? "s" : ""} actif{equipe.data.runsActifs > 1 ? "s" : ""} sur {equipe.data.plafondRunsActifs}
          </span>
        ) : null}
      </div>
      {contexte.companyId ? (
        <LienHote vers={chemin("contenus")} className="atl-bouton">
          Ouvrir les contenus à valider
        </LienHote>
      ) : null}
    </section>
  );
}
