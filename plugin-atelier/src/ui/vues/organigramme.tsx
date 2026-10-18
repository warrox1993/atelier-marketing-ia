/**
 * Vue « Organigramme » : tous les agents de tous les services du client, dessinés, et les services entre eux.
 *
 * - Services : `departements.lister`, croisés avec les entreprises que l'utilisateur voit (`GET /api/companies`), comme la
 *   vue « Départements » ; le préfixe sert aux liens vers la fiche d'un agent dans le socle (`/<PRÉFIXE>/agents/<id>`).
 * - Agents : `GET /api/companies/<id>/agents` de l'hôte, un service à la fois pour chacun (six lectures simultanées au
 *   plus), chaque service échoue et se relit indépendamment. L'arbre suit `reportsTo` (logique pure : organigramme-arbre.ts).
 * - Dessin : le Coordinateur général en haut, un cadre par service (coordinateur en tête, agents empilés dessous) rangés
 *   en grille, disposition pure dans organigramme-disposition.ts, rendu et gestes dans organigramme-toile.tsx. Sur
 *   téléphone (640 px et moins), une liste accordéon (organigramme-liste.tsx) remplace la toile.
 * - Interconnexions : `services.flux` (matrice des flux autorisés). On choisit un service (« Voir les liens ») : la vue
 *   surligne ses voisins et liste ses flux, dans les deux sens.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { FluxServiceLu, ReponseFluxServices } from "../../contrats/departements.js";
import { Chargement, EnTete, EtatErreur, Vide } from "../composants.js";
import { lireDepartements, nomClient } from "../departements-sonde.js";
import { nombre } from "../format.js";
import { appelHote } from "../hote.js";
import { agentsDepuisHote, liensDuService, type AgentHote } from "../organigramme-arbre.js";
import { cartesCorrespondantes, disposerOrganigramme, type ServiceADisposer } from "../organigramme-disposition.js";
import { ListeOrganigramme } from "../organigramme-liste.js";
import { LEGENDE_ORGANIGRAMME, ToileOrganigramme } from "../organigramme-toile.js";
import { appelRoute } from "../routes-prospection.js";
import { STYLES_ORGANIGRAMME } from "../styles-organigramme.js";
import { departementsVisibles, enParallele, lireEntreprises, LECTURES_SIMULTANEES, type DepartementVisible } from "./departements.js";

type EtatAgents = { etat: "chargement" } | { etat: "pret"; agents: AgentHote[] } | { etat: "erreur"; message: string };
type EtatFlux = { etat: "chargement" } | { etat: "pret"; flux: FluxServiceLu[] } | { etat: "erreur"; message: string };

const pluriel = (n: number, un: string, plusieurs: string) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;
const messageDe = (e: unknown) => (typeof (e as { message?: unknown } | null)?.message === "string" ? (e as { message: string }).message : "erreur inconnue");

function ListeFlux({ titre, flux, sens, nomDe, ouvrir }: { titre: string; flux: FluxServiceLu[]; sens: "sortant" | "entrant"; nomDe: (slug: string) => string; ouvrir: (slug: string) => void }) {
  return (
    <div className="atl-org-flux-bloc">
      <h3>
        {titre} <span className="atl-org-compteur">{nombre(flux.length)}</span>
      </h3>
      {flux.length === 0 ? (
        <p className="atl-org-vide">Aucun flux.</p>
      ) : (
        <ul className="atl-org-flux">
          {flux.map((f) => {
            const autre = sens === "sortant" ? f.cible : f.source;
            return (
              <li key={`${f.source}>${f.cible}`}>
                <span className="atl-org-flux-sens">
                  {sens === "sortant" ? "vers" : "depuis"}{" "}
                  <button type="button" className="atl-org-flux-service" onClick={() => ouvrir(autre)}>
                    {nomDe(autre)}
                  </button>
                </span>
                <span className="atl-org-flux-objet">{f.objet}</span>
                {f.approbationHumaine ? <span className="atl-org-approbation">approbation humaine</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PanneauLiens({ d, flux, nomDe, ouvrir, fermer, relireFlux }: { d: DepartementVisible; flux: EtatFlux; nomDe: (slug: string) => string; ouvrir: (slug: string) => void; fermer: () => void; relireFlux: () => void }) {
  const liens = useMemo(() => (flux.etat === "pret" ? liensDuService(flux.flux, d.slug) : null), [flux, d.slug]);
  return (
    <section className="atl-org-panneau" aria-labelledby="atl-org-liens-titre">
      <div className="atl-org-panneau-tete">
        <h2 id="atl-org-liens-titre">Liens de {d.nom}</h2>
        <button type="button" className="atl-bouton" onClick={fermer}>
          Fermer
        </button>
      </div>
      {flux.etat === "chargement" ? (
        <Chargement libelle="Lecture des flux entre services" lignes={2} />
      ) : flux.etat === "erreur" ? (
        <div className="atl-org-erreur" role="alert">
          <p>Flux indisponibles : {flux.message}</p>
          <button type="button" className="atl-bouton" onClick={relireFlux}>
            Réessayer
          </button>
        </div>
      ) : liens ? (
        <>
          <p className="atl-org-panneau-texte">
            {liens.voisins.size === 0 ? "Ce service n'est relié à aucun autre." : `Relié à ${pluriel(liens.voisins.size, "service", "services")} : ils sont surlignés ci-dessous.`}
          </p>
          <div className="atl-org-flux-grille">
            <ListeFlux titre="Demandes qu'il peut envoyer" flux={liens.sortants} sens="sortant" nomDe={nomDe} ouvrir={ouvrir} />
            <ListeFlux titre="Demandes qu'il peut recevoir" flux={liens.entrants} sens="entrant" nomDe={nomDe} ouvrir={ouvrir} />
          </div>
        </>
      ) : null}
    </section>
  );
}

/** Largeur à partir de laquelle l'organigramme dessiné laisse la place à la liste (téléphone). */
const REQUETE_TELEPHONE = "(max-width: 640px)";

/** Vrai sur un téléphone (640 px et moins) ; faux si le navigateur ne sait pas mesurer (tests, anciens navigateurs). */
export function useTelephone(): boolean {
  const lire = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(REQUETE_TELEPHONE).matches : false);
  const [telephone, setTelephone] = useState(lire);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const requete = window.matchMedia(REQUETE_TELEPHONE);
    const maj = () => setTelephone(requete.matches);
    maj();
    requete.addEventListener("change", maj);
    return () => requete.removeEventListener("change", maj);
  }, []);
  return telephone;
}

export function VueOrganigramme() {
  const telephone = useTelephone();
  const { companyId } = useHostContext();
  const [liste, setListe] = useState<{ client: string; departements: DepartementVisible[] } | null>(null);
  const [erreur, setErreur] = useState<unknown>(null);
  const [essai, setEssai] = useState(0);
  const [agents, setAgents] = useState<Record<string, EtatAgents>>({});
  const [flux, setFlux] = useState<EtatFlux>({ etat: "chargement" });
  const [selection, setSelection] = useState<string | null>(null);
  const [filtre, setFiltre] = useState("");

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

  const lireFlux = useCallback(
    async (signal: { annule: boolean }) => {
      if (!companyId) return;
      setFlux({ etat: "chargement" });
      try {
        const r = await appelRoute<Partial<ReponseFluxServices> | null>("GET", `/services/flux?companyId=${encodeURIComponent(companyId)}`);
        if (!signal.annule) setFlux({ etat: "pret", flux: Array.isArray(r?.flux) ? r.flux : [] });
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
    void enParallele(liste.departements, LECTURES_SIMULTANEES, (d) => lireAgents(d, signal));
    void lireFlux(signal);
    return () => {
      signal.annule = true;
    };
  }, [liste, lireAgents, lireFlux]);

  const departements = liste?.departements ?? [];
  const parSlug = useMemo(() => new Map(departements.map((d) => [d.slug, d])), [departements]);
  const nomDe = useCallback((slug: string) => parSlug.get(slug)?.nom ?? slug, [parSlug]);
  const choisi = selection ? parSlug.get(selection) ?? null : null;
  const voisins = useMemo(() => (choisi && flux.etat === "pret" ? liensDuService(flux.flux, choisi.slug).voisins : new Set<string>()), [choisi, flux]);
  const prefixes = useMemo(() => Object.fromEntries(departements.map((d) => [d.slug, d.prefixe])), [departements]);

  // Entrée du dessin : un service par entreprise, avec l'état de lecture de ses agents.
  const services = useMemo<ServiceADisposer[]>(
    () =>
      departements.map((d) => {
        const e = agents[d.companyId];
        return { slug: d.slug, nom: d.nom, estDirection: d.estDirection, etat: e?.etat ?? "chargement", agents: e?.etat === "pret" ? e.agents : [] };
      }),
    [departements, agents],
  );
  const trouvees = useMemo(() => {
    if (filtre.trim() === "") return new Set<string>();
    return cartesCorrespondantes(disposerOrganigramme(services), services, filtre);
  }, [services, filtre]);
  const correspondances = trouvees.size;

  const total = useMemo(
    () => Object.values(agents).reduce((n, e) => n + (e.etat === "pret" ? e.agents.length : 0), 0),
    [agents],
  );

  if (erreur) return <EtatErreur erreur={erreur} onReessayer={() => setEssai((n) => n + 1)} contexte="organigramme" />;
  if (!liste) return <Chargement libelle="Organigramme" lignes={3} />;
  if (departements.length === 0) {
    return (
      <Vide titre="Aucun service à afficher">
        <p>L'organigramme apparaît dès que le client a au moins un service auquel vous avez accès.</p>
      </Vide>
    );
  }
  const filtreActif = filtre.trim() !== "";
  const relireService = (slug: string) => {
    const d = parSlug.get(slug);
    if (d) void lireAgents(d, { annule: false });
  };
  return (
    <section className="atl-org" aria-labelledby="atl-org-titre">
      <style href="atelier-organigramme" precedence="default">
        {STYLES_ORGANIGRAMME}
      </style>
      <EnTete
        titre="Organigramme"
        description={`${liste.client} : ${pluriel(departements.length, "service", "services")}, ${pluriel(total, "agent", "agents")}.${telephone ? " Ouvrez un service pour voir ses agents et avec qui il est relié." : " Glissez pour vous déplacer, zoomez avec les boutons ou Ctrl et la molette, et choisissez un service pour voir avec qui il est relié."}`}
      />
      <span id="atl-org-titre" className="atl-sr">
        Organigramme de {liste.client}
      </span>

      <div className="atl-org-barre">
        <label className="atl-org-filtre">
          <span>Filtrer par agent ou par service</span>
          <input type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)} autoComplete="off" placeholder="Nom d'un agent ou d'un service" />
        </label>
        <p className="atl-org-etat" role="status">
          {filtreActif ? (correspondances === 0 ? `Aucune carte ne correspond à « ${filtre.trim()} ».` : `${pluriel(correspondances, "carte correspond", "cartes correspondent")}, mises en évidence ; « Ajuster à l'écran » centre la première.`) : ""}
        </p>
      </div>

      {choisi ? <PanneauLiens d={choisi} flux={flux} nomDe={nomDe} ouvrir={(slug) => setSelection(slug)} fermer={() => setSelection(null)} relireFlux={() => void lireFlux({ annule: false })} /> : null}

      {telephone ? (
        <ListeOrganigramme
          services={services}
          prefixes={prefixes}
          trouvees={trouvees}
          selection={choisi?.slug ?? null}
          choisir={(slug) => setSelection((s) => (s === slug ? null : slug))}
          relire={relireService}
        />
      ) : (
        <ToileOrganigramme
          services={services}
          prefixes={prefixes}
          filtre={filtre}
          selection={choisi?.slug ?? null}
          voisins={voisins}
          selectionActive={choisi !== null && flux.etat === "pret"}
          choisir={(slug) => setSelection((s) => (s === slug ? null : slug))}
          relire={relireService}
        />
      )}
      <p className="atl-org-legende">{LEGENDE_ORGANIGRAMME}</p>
    </section>
  );
}
