/**
 * Vue « Organigramme » : carte des services, matrice des échanges, et vue détaillée d'un service.
 *
 * - Services : `departements.lister`, croisés avec les entreprises que l'utilisateur voit (`GET /api/companies`), comme la
 *   vue « Départements » ; le préfixe sert aux liens vers la fiche d'un agent dans le socle (`/<PRÉFIXE>/agents/<id>`).
 * - Agents : `GET /api/companies/<id>/agents` de l'hôte, un service à la fois (six lectures simultanées au plus), chaque
 *   service échoue et se relit indépendamment. Ils alimentent les compteurs de la carte, l'index de recherche et la vue
 *   d'un service. Jamais tous les agents dessinés d'un coup.
 * - À traiter : `departements/etat` (validations en attente), lecture facultative : son échec n'empêche rien.
 * - Flux : `services.flux`. La carte et la matrice n'en dessinent que les liaisons métier (organigramme-flux.ts).
 * - Adresse : l'ancre porte l'état (`#vue=matrice`, `#service=juridique`, `#service=juridique&agent=<id>&vue=matrice`),
 *   donc le bouton précédent du navigateur et le rechargement retrouvent la même vue.
 * - Recherche : un champ unique sur l'index en mémoire (services et agents), huit résultats au plus.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { EtatDepartement, ReponseFluxServices } from "../../contrats/departements.js";
import { Chargement, EnTete, EtatErreur, Vide } from "../composants.js";
import { lireDepartements, nomClient } from "../departements-sonde.js";
import { nombre } from "../format.js";
import { appelHote } from "../hote.js";
import { CarteServices, type ServiceAffiche } from "../organigramme-carte.js";
import { chercher, indexRecherche, type FluxBrut, type ResultatRecherche } from "../organigramme-flux.js";
import { agentsDepuisHote, type AgentHote } from "../organigramme-arbre.js";
import { MatriceEchangesVue } from "../organigramme-matrice.js";
import { VueServiceOrganigramme } from "../organigramme-service.js";
import { ListeOnglets, PanneauOnglet, useAncre } from "../onglets.js";
import { appelRoute } from "../routes-prospection.js";
import { STYLES_ORGANIGRAMME } from "../styles-organigramme.js";
import { departementsVisibles, enParallele, lireEntreprises, LECTURES_SIMULTANEES, type DepartementVisible } from "./departements.js";

// Compatibilité : la détection du téléphone vit maintenant dans ../telephone.ts.
export { useTelephone } from "../telephone.js";

type EtatAgents = { etat: "chargement" } | { etat: "pret"; agents: AgentHote[] } | { etat: "erreur"; message: string };
type EtatFlux = { etat: "chargement" } | { etat: "pret"; flux: FluxBrut[] } | { etat: "erreur"; message: string };
type OngletOrganigramme = "carte" | "matrice";

const BASE_ONGLETS = "atl-org";
const RESULTATS_AFFICHES = 8;
const pluriel = (n: number, un: string, plusieurs: string) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;
const messageDe = (e: unknown) => (typeof (e as { message?: unknown } | null)?.message === "string" ? (e as { message: string }).message : "erreur inconnue");

// ---------------------------------------------------------------------------------------------------------------
// Adresse (ancre)
// ---------------------------------------------------------------------------------------------------------------

export interface EtatNavigation {
  vue: OngletOrganigramme;
  service: string | null;
  agent: string | null;
}

/** Lit l'ancre : `vue=matrice`, `service=<slug>`, `agent=<id>`. Tout le reste retombe sur la carte. */
export function lireNavigation(ancre: string): EtatNavigation {
  const p = new URLSearchParams(ancre);
  const service = p.get("service");
  const agent = p.get("agent");
  return { vue: p.get("vue") === "matrice" ? "matrice" : "carte", service: service ? service : null, agent: service && agent ? agent : null };
}

/** Écrit l'ancre (une entrée d'historique : le bouton précédent revient à l'état d'avant). */
function ecrireNavigation(e: EtatNavigation): void {
  const p = new URLSearchParams();
  if (e.service) p.set("service", e.service);
  if (e.service && e.agent) p.set("agent", e.agent);
  if (e.vue === "matrice") p.set("vue", "matrice");
  window.location.hash = p.toString();
}

// ---------------------------------------------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------------------------------------------

function ChampRecherche({ resultats, texte, changer, choisir }: { resultats: ResultatRecherche[]; texte: string; changer: (t: string) => void; choisir: (r: ResultatRecherche) => void }) {
  const [actif, setActif] = useState(0);
  const entree = useRef<HTMLInputElement | null>(null);
  useEffect(() => setActif(0), [texte]);
  const ouvert = texte.trim() !== "";
  const idOption = (i: number) => `atl-org-resultat-${i}`;
  const surTouche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && resultats.length > 0) {
      e.preventDefault();
      setActif((i) => (i + 1) % resultats.length);
    } else if (e.key === "ArrowUp" && resultats.length > 0) {
      e.preventDefault();
      setActif((i) => (i - 1 + resultats.length) % resultats.length);
    } else if (e.key === "Enter" && resultats[actif]) {
      e.preventDefault();
      choisir(resultats[actif]!);
    } else if (e.key === "Escape" && ouvert) {
      e.preventDefault();
      e.stopPropagation();
      changer("");
    }
  };
  return (
    <div className="atl-org-recherche">
      <label htmlFor="atl-org-recherche-champ">Chercher un agent ou un service</label>
      <input
        id="atl-org-recherche-champ"
        ref={entree}
        type="search"
        role="combobox"
        aria-expanded={ouvert}
        aria-controls="atl-org-resultats"
        aria-autocomplete="list"
        aria-activedescendant={ouvert && resultats[actif] ? idOption(actif) : undefined}
        value={texte}
        onChange={(e) => changer(e.target.value)}
        onKeyDown={surTouche}
        autoComplete="off"
        placeholder="Nom d'un agent, d'un titre ou d'un service"
      />
      {ouvert ? (
        <ul id="atl-org-resultats" className="atl-org-resultats" role="listbox" aria-label="Résultats de la recherche">
          {resultats.length === 0 ? (
            <li className="atl-org-resultat-vide" role="presentation">
              Aucun agent ni service ne correspond à « {texte.trim()} ».
            </li>
          ) : (
            resultats.map((r, i) => (
              <li
                key={`${r.type}:${r.slug}:${r.id}`}
                id={idOption(i)}
                role="option"
                aria-selected={i === actif}
                className="atl-org-resultat"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActif(i)}
                onClick={() => choisir(r)}
              >
                <span className="atl-org-resultat-nom">{r.nom}</span>
                <span className="atl-org-resultat-suite">{r.type === "service" ? "Service" : `${r.titre ? `${r.titre}, ` : ""}service ${r.nomService}`}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Vue
// ---------------------------------------------------------------------------------------------------------------

export function VueOrganigramme() {
  const { companyId } = useHostContext();
  const ancre = useAncre();
  const nav = useMemo(() => lireNavigation(ancre), [ancre]);
  const [liste, setListe] = useState<{ client: string; departements: DepartementVisible[] } | null>(null);
  const [erreur, setErreur] = useState<unknown>(null);
  const [essai, setEssai] = useState(0);
  const [agents, setAgents] = useState<Record<string, EtatAgents>>({});
  const [aValider, setAValider] = useState<Record<string, number>>({});
  const [flux, setFlux] = useState<EtatFlux>({ etat: "chargement" });
  const [selection, setSelection] = useState<string | null>(null);
  const [caseChoisie, setCaseChoisie] = useState<{ source: string; cible: string } | null>(null);
  const [texte, setTexte] = useState("");

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setListe(null);
    setErreur(null);
    Promise.all([lireDepartements(companyId), lireEntreprises()])
      .then(([r, entreprises]) => {
        if (annule) return;
        if (!r) throw { code: "INDISPONIBLE", message: "La liste des services du client est indisponible." };
        const visibles = departementsVisibles(r.departements, entreprises);
        setListe({ client: nomClient(visibles.map((v) => v.nomEntreprise), r.client), departements: visibles });
      })
      .catch((e: unknown) => !annule && setErreur(e));
    return () => {
      annule = true;
    };
  }, [companyId, essai]);

  const lireAgents = useCallback(async (d: DepartementVisible, signal: { annule: boolean }) => {
    setAgents((p) => ({ ...p, [d.companyId]: { etat: "chargement" } }));
    try {
      const brut = await appelHote<unknown>("GET", `/companies/${encodeURIComponent(d.companyId)}/agents`);
      if (!signal.annule) setAgents((p) => ({ ...p, [d.companyId]: { etat: "pret", agents: agentsDepuisHote(brut) } }));
    } catch (e) {
      if (!signal.annule) setAgents((p) => ({ ...p, [d.companyId]: { etat: "erreur", message: messageDe(e) } }));
    }
  }, []);

  /** Validations en attente d'un service (pastille « À traiter ») ; un échec laisse simplement zéro. */
  const lireEtat = useCallback(async (d: DepartementVisible, signal: { annule: boolean }) => {
    try {
      const etat = await appelRoute<Partial<EtatDepartement> | null>("GET", `/departements/etat?companyId=${encodeURIComponent(d.companyId)}`);
      const total = etat?.validations?.total;
      if (!signal.annule && typeof total === "number") setAValider((p) => ({ ...p, [d.slug]: total }));
    } catch {
      /* facultatif */
    }
  }, []);

  const lireFlux = useCallback(
    async (signal: { annule: boolean }) => {
      if (!companyId) return;
      setFlux({ etat: "chargement" });
      try {
        const r = await appelRoute<Partial<ReponseFluxServices> | null>("GET", `/services/flux?companyId=${encodeURIComponent(companyId)}`);
        if (!signal.annule) setFlux({ etat: "pret", flux: Array.isArray(r?.flux) ? (r.flux as FluxBrut[]) : [] });
      } catch (e) {
        if (!signal.annule) setFlux({ etat: "erreur", message: messageDe(e) });
      }
    },
    [companyId],
  );

  useEffect(() => {
    if (!liste) return;
    const signal = { annule: false };
    setAgents(Object.fromEntries(liste.departements.map((d) => [d.companyId, { etat: "chargement" } as EtatAgents])));
    setAValider({});
    void enParallele(liste.departements, LECTURES_SIMULTANEES, async (d) => {
      await Promise.all([lireAgents(d, signal), lireEtat(d, signal)]);
    });
    void lireFlux(signal);
    return () => {
      signal.annule = true;
    };
  }, [liste, lireAgents, lireEtat, lireFlux]);

  const departements = liste?.departements ?? [];
  const parSlug = useMemo(() => new Map(departements.map((d) => [d.slug, d])), [departements]);

  const servicesAffiches = useMemo<ServiceAffiche[]>(
    () =>
      departements.map((d) => {
        const e = agents[d.companyId];
        return {
          slug: d.slug,
          nom: d.nom,
          estDirection: d.estDirection,
          agents: e?.etat === "pret" ? e.agents.length : null,
          aValider: aValider[d.slug] ?? 0,
          etat: e?.etat ?? "chargement",
        };
      }),
    [departements, agents, aValider],
  );
  const fluxListe = useMemo<FluxBrut[]>(() => (flux.etat === "pret" ? flux.flux : []), [flux]);

  // Index de recherche : reconstruit à chaque service lu, jamais de dessin.
  const index = useMemo(() => {
    const parService: Record<string, AgentHote[]> = {};
    for (const d of departements) {
      const e = agents[d.companyId];
      if (e?.etat === "pret") parService[d.slug] = e.agents;
    }
    return indexRecherche(departements, parService);
  }, [departements, agents]);
  const resultats = useMemo(() => chercher(index, texte, RESULTATS_AFFICHES), [index, texte]);

  const total = useMemo(() => Object.values(agents).reduce((n, e) => n + (e.etat === "pret" ? e.agents.length : 0), 0), [agents]);
  const enLecture = Object.values(agents).some((e) => e.etat === "chargement");

  const aller = useCallback((e: EtatNavigation) => ecrireNavigation(e), []);
  const ouvrirService = useCallback((slug: string, agent: string | null = null) => aller({ vue: nav.vue, service: slug, agent }), [aller, nav.vue]);
  const choisirResultat = (r: ResultatRecherche) => {
    setTexte("");
    ouvrirService(r.slug, r.type === "agent" ? r.id : null);
  };

  if (erreur) return <EtatErreur erreur={erreur} onReessayer={() => setEssai((n) => n + 1)} contexte="organigramme" />;
  if (!liste) return <Chargement libelle="Organigramme" lignes={3} />;
  if (departements.length === 0) {
    return (
      <Vide titre="Aucun service à afficher">
        <p>L'organigramme apparaît dès que le client a au moins un service auquel vous avez accès.</p>
      </Vide>
    );
  }

  const serviceOuvert = nav.service ? parSlug.get(nav.service) ?? null : null;
  const etatOuvert = serviceOuvert ? agents[serviceOuvert.companyId] : undefined;
  const fluxEnPanne = flux.etat === "erreur" ? flux.message : null;
  const relireFlux = () => void lireFlux({ annule: false });

  const corps = serviceOuvert ? (
    etatOuvert?.etat === "pret" ? (
      <VueServiceOrganigramme
        service={{ slug: serviceOuvert.slug, nom: serviceOuvert.nom, companyId: serviceOuvert.companyId, prefixe: serviceOuvert.prefixe, estDirection: serviceOuvert.estDirection }}
        agents={etatOuvert.agents}
        flux={fluxListe}
        services={departements}
        agentMisEnEvidence={nav.agent}
        ouvrirService={(slug) => ouvrirService(slug)}
        retour={() => aller({ vue: nav.vue, service: null, agent: null })}
      />
    ) : etatOuvert?.etat === "erreur" ? (
      <div className="atl-org-erreur" role="alert">
        <p>Lecture impossible des agents de {serviceOuvert.nom} : {etatOuvert.message}</p>
        <button type="button" className="atl-bouton" onClick={() => void lireAgents(serviceOuvert, { annule: false })}>
          Réessayer
        </button>
        <button type="button" className="atl-bouton" onClick={() => aller({ vue: nav.vue, service: null, agent: null })}>
          Retour à l'organigramme
        </button>
      </div>
    ) : (
      <Chargement libelle={`Agents de ${serviceOuvert.nom}`} lignes={3} />
    )
  ) : (
    <>
      <ListeOnglets
        etiquette="Affichage de l'organigramme"
        base={BASE_ONGLETS}
        actif={nav.vue}
        onglets={[
          { cle: "carte", libelle: "Carte" },
          { cle: "matrice", libelle: "Matrice" },
        ]}
        choisir={(cle) => aller({ vue: cle === "matrice" ? "matrice" : "carte", service: null, agent: null })}
      />
      <PanneauOnglet base={BASE_ONGLETS} cle="carte" actif={nav.vue === "carte"}>
        {nav.vue === "carte" ? <CarteServices services={servicesAffiches} flux={fluxListe} selection={selection} choisir={setSelection} ouvrirService={(slug) => ouvrirService(slug)} /> : null}
      </PanneauOnglet>
      <PanneauOnglet base={BASE_ONGLETS} cle="matrice" actif={nav.vue === "matrice"}>
        {nav.vue === "matrice" ? <MatriceEchangesVue services={departements} flux={fluxListe} caseChoisie={caseChoisie} choisirCase={(source, cible) => setCaseChoisie({ source, cible })} ouvrirService={(slug) => ouvrirService(slug)} /> : null}
      </PanneauOnglet>
    </>
  );

  return (
    <section className="atl-org" aria-labelledby="atl-org-titre">
      <style href="atelier-organigramme" precedence="default">
        {STYLES_ORGANIGRAMME}
      </style>
      <EnTete
        titre="Organigramme"
        description={`${liste.client} : ${pluriel(departements.length, "service", "services")}, ${pluriel(total, "agent", "agents")}${enLecture ? " lus pour l'instant" : ""}.`}
      />
      <span id="atl-org-titre" className="atl-sr">
        Organigramme de {liste.client}
      </span>
      <div className="atl-org-barre">
        <ChampRecherche resultats={resultats} texte={texte} changer={setTexte} choisir={choisirResultat} />
      </div>
      {fluxEnPanne ? (
        <div className="atl-org-erreur" role="alert">
          <p>Liaisons indisponibles : {fluxEnPanne}</p>
          <button type="button" className="atl-bouton" onClick={relireFlux}>
            Réessayer
          </button>
        </div>
      ) : null}
      {corps}
    </section>
  );
}
