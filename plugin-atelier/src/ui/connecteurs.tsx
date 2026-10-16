/**
 * Tableau « Connecteurs » de la rubrique Paramètres (lot L8) : il reflète l'état
 * RÉEL des connexions natives de Paperclip pour l'entreprise, au lieu d'une
 * liste figée maintenue par l'atelier. La lecture passe par un seul module :
 * `connexions-natives.ts`. Le bouton « Connecter » ouvre la carte de galerie
 * NATIVE du service (`/apps/connect?source=atelier-<service>`, route de
 * `paperclip/ui/src/App.tsx`, lien construit comme `appSourceConnectHref` de
 * `pages/apps/app-connect-policy.ts`) : l'atelier ne recrée pas le parcours et
 * n'écrit jamais dans les connexions.
 */
import { useCallback, useEffect, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { Connecteur } from "../contrats/campagnes.js";
import type { EtatConnexion } from "../contrats/communs.js";
import { EtatErreur, Horodatage, LienHote, PastilleConnexion } from "./composants.js";
import { NIVEAUX_INTEGRATION } from "./format.js";
import { etatClaude, etatRechercheWeb, lireAgentsClaude, lireConnexionsNatives, LIBELLES_SANTE, lignesServices, type AgentClaude, type ConnexionNative, type LigneService } from "./connexions-natives.js";

type Lecture<T> = { etat: "chargement" } | { etat: "erreur"; erreur: unknown } | { etat: "pret"; valeur: T };

/** Relit à l'ouverture, au retour sur l'onglet (après le parcours natif) et à la demande. */
function useLecture<T>(lire: (companyId: string) => Promise<T>): [Lecture<T>, () => void] {
  const { companyId } = useHostContext();
  const [lecture, setLecture] = useState<Lecture<T>>({ etat: "chargement" });
  const charger = useCallback(async () => {
    if (!companyId) return;
    try {
      setLecture({ etat: "pret", valeur: await lire(companyId) });
    } catch (erreur) {
      setLecture({ etat: "erreur", erreur });
    }
  }, [companyId, lire]);
  useEffect(() => {
    void charger();
    const auRetour = () => {
      if (document.visibilityState === "visible") void charger();
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => document.removeEventListener("visibilitychange", auRetour);
  }, [charger]);
  return [lecture, () => void charger()];
}

/** Liens natifs : carte du service, reprise d'un brouillon, page de la connexion (onglet Permissions). */
export function lienCarte(ligne: Pick<LigneService, "slug" | "etat" | "connexionId">): string {
  const p = new URLSearchParams({ source: ligne.slug });
  if (ligne.etat === "non_connecte" && ligne.connexionId) p.set("resume", ligne.connexionId);
  return `/apps/connect?${p.toString()}`;
}

function ActionConnexion({ ligne }: { ligne: LigneService }) {
  return ligne.etat === "non_connecte" ? (
    <LienHote vers={lienCarte(ligne)} className="atl-bouton">
      Connecter<span className="atl-sr"> {ligne.nom}</span>
    </LienHote>
  ) : (
    <LienHote vers={`/apps/${encodeURIComponent(ligne.connexionId ?? "")}/permissions`} className="atl-bouton">
      Gérer<span className="atl-sr"> {ligne.nom}</span>
    </LienHote>
  );
}

function TableServices({ lignes }: { lignes: LigneService[] }) {
  return (
    <div className="atl-table-cadre">
      <table className="atl-table">
        <caption className="atl-sr">Services marketing de la passerelle et état de leur connexion native</caption>
        <thead>
          <tr>
            <th scope="col">Service</th>
            <th scope="col">État</th>
            <th scope="col">Santé</th>
            <th scope="col">Dernière vérification</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.cle}>
              <th scope="row" data-libelle="Service">
                {l.nom}
                <span className="atl-sous">{l.capacites}</span>
              </th>
              {l.connexionId === null ? (
                // Aucune connexion native : une seule cellule, sans colonnes vides ni tirets répétés.
                <td data-libelle="État" colSpan={3}>
                  <span className="atl-pile-ligne">
                    <PastilleConnexion etat={l.etat} />
                    <span className="atl-attenue">{l.detail}</span>
                  </span>
                </td>
              ) : (
                <>
                  <td data-libelle="État">
                    <PastilleConnexion etat={l.etat} />
                    <span className="atl-sous">{l.detail}</span>
                  </td>
                  <td data-libelle="Santé">
                    {l.sante ? (
                      <>Santé : {LIBELLES_SANTE[l.sante]}</>
                    ) : (
                      <span className="atl-attenue" aria-label="sans objet">
                        <span aria-hidden="true">–</span>
                      </span>
                    )}
                  </td>
                  <td data-libelle="Dernière vérification">
                    {l.verifieLe ? (
                      <Horodatage iso={l.verifieLe} />
                    ) : (
                      <span className="atl-attenue" aria-label="aucune vérification">
                        <span aria-hidden="true">–</span>
                      </span>
                    )}
                  </td>
                </>
              )}
              <td data-libelle="Action">
                <ActionConnexion ligne={l} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface LigneAutre {
  cle: string;
  nom: string;
  capacites: string;
  etat: EtatConnexion;
  integration: string;
  detail: string;
  verifieLe: string | null;
}

/**
 * Lignes hors passerelle. Adaptateur Claude Code et recherche Web viennent des
 * agents natifs ; lecture d'URL et diffusion restent celles du diagnostic.
 */
export function lignesAutres(diagnostic: Connecteur[], agents: Lecture<AgentClaude[]>): LigneAutre[] {
  const garde = (cle: string) => diagnostic.find((c) => c.cle === cle);
  const depuis = (c: Connecteur | undefined): LigneAutre[] =>
    c ? [{ cle: c.cle, nom: c.nom, capacites: c.capacites.join(", "), etat: c.etat, integration: NIVEAUX_INTEGRATION[c.niveau] ?? c.niveau, detail: c.detail, verifieLe: c.verifieLe }] : [];
  const natif = (cle: string, nom: string, integration: string, calcul: (a: AgentClaude[]) => { etat: EtatConnexion; detail: string }): LigneAutre => {
    if (agents.etat === "pret") return { cle, nom, capacites: "lecture", integration, ...calcul(agents.valeur), verifieLe: null };
    if (agents.etat === "chargement") return { cle, nom, capacites: "lecture", integration, etat: "configure_non_verifie", detail: "Lecture des agents natifs en cours…", verifieLe: null };
    return { cle, nom, capacites: "lecture", integration, etat: "indisponible", detail: "Agents natifs illisibles : état non déterminé (voir l'alerte du tableau).", verifieLe: null };
  };
  return [
    natif("claude_local", "Adaptateur Claude Code (Paperclip)", "Adaptateur natif", etatClaude),
    ...depuis(garde("lecture_url")),
    natif("recherche_web", "Recherche Web", "Outil natif de l'agent", etatRechercheWeb),
    ...depuis(garde("diffusion")),
  ];
}

function TableAutres({ lignes }: { lignes: LigneAutre[] }) {
  return (
    <div className="atl-table-cadre">
      <table className="atl-table">
        <caption className="atl-sr">Autres connecteurs : adaptateur, lecture d'URL, recherche Web, diffusion</caption>
        <thead>
          <tr>
            <th scope="col">Connecteur</th>
            <th scope="col">État</th>
            <th scope="col">Intégration</th>
            <th scope="col">Détail</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((c) => (
            <tr key={c.cle}>
              <th scope="row" data-libelle="Connecteur">
                {c.nom}
                <span className="atl-sous">{c.capacites}</span>
              </th>
              <td data-libelle="État">
                <PastilleConnexion etat={c.etat} />
              </td>
              <td data-libelle="Intégration">{c.integration}</td>
              <td data-libelle="Détail">
                {c.detail}
                {c.verifieLe ? (
                  <span className="atl-sous">
                    Vérifié <Horodatage iso={c.verifieLe} />
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TableauConnecteurs({ diagnostic }: { diagnostic: Connecteur[] }) {
  const [connexions, relireConnexions] = useLecture<ConnexionNative[]>(lireConnexionsNatives);
  const [agents, relireAgents] = useLecture<AgentClaude[]>(lireAgentsClaude);
  const relire = () => {
    relireConnexions();
    relireAgents();
  };
  return (
    <>
      <div className="atl-barre-titre">
        <h3 className="atl-h3">Services marketing (passerelle)</h3>
        <button type="button" className="atl-bouton" data-variante="discret" onClick={relire}>
          Relire les connexions
        </button>
      </div>
      <p className="atl-section-aide">Lu en direct dans les connexions natives de Paperclip. « Connecter » ouvre la carte du service dans la galerie de Paperclip ; les actions qui publient ou modifient y restent soumises à votre accord (« Ask first »). L'atelier n'écrit jamais dans vos connexions.</p>
      {connexions.etat === "chargement" ? (
        <p className="atl-attenue" role="status" aria-busy="true">
          Lecture des connexions natives…
        </p>
      ) : connexions.etat === "erreur" ? (
        <EtatErreur erreur={connexions.erreur} onReessayer={relireConnexions} contexte="connexions natives illisibles" />
      ) : (
        <>
          {connexions.valeur.every((c) => c.service === null) ? (
            <p className="atl-attenue" role="status">
              Aucun service marketing n'est connecté pour cette entreprise.
            </p>
          ) : null}
          <TableServices lignes={lignesServices(connexions.valeur)} />
        </>
      )}
      <h3 className="atl-h3">Autres connecteurs</h3>
      {agents.etat === "erreur" ? <EtatErreur erreur={agents.erreur} onReessayer={relireAgents} contexte="agents natifs illisibles" /> : null}
      <TableAutres lignes={lignesAutres(diagnostic, agents)} />
    </>
  );
}
