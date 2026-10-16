/**
 * Rubrique 1 : équipe et coordination (cahier §12).
 * Agents natifs, mission en cours, compétences transmises, dépendances,
 * échanges typés, blocages. Cliquer sur un agent ouvre ses tâches natives.
 */
import { IssuesList, useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { AgentVue, VueEquipe } from "../../contrats/ui.js";
import { EnTete, Fraicheur, Horodatage, LienHote, Lecture, PastilleConnexion, PastilleStatut, Pastille, Section, Vide } from "../composants.js";
import { useDonnees } from "../donnees.js";
import { ETATS_MESSAGE, idCourt, resumeMessage, TYPES_MESSAGE } from "../format.js";
import { chemin } from "../route.js";

export function VueEquipeAtelier({ agentId }: { agentId: string | null }) {
  const r = useDonnees<VueEquipe>("atelier.equipe");
  const agentChoisi = agentId && r.data ? (r.data.agents.find((a) => a.id === agentId) ?? null) : null;
  return (
    <>
      <EnTete
        titre="Équipe et coordination"
        description="Les agents Paperclip de cette entreprise, ce qu'ils font maintenant et ce qui les bloque. Les états viennent du moteur natif ; rien n'est animé sans événement réel."
      />
      <Fraicheur chargeLe={r.chargeLe} actualisation={r.loading && r.data !== null} />
      <Lecture r={r} libelle="équipe" estVide={(d) => d.agents.length === 0} vide={<Vide titre="Aucun agent dans cette entreprise.">Créez ou importez l'organisation de démonstration (scripts/bootstrap-organisation.py), puis actualisez.</Vide>}>
        {(d) => (
          <>
            <p className="atl-resume">
              <span>
                <strong>{d.agents.length}</strong> agent{d.agents.length > 1 ? "s" : ""}
              </span>
              <span>
                Runs actifs : <strong>{d.runsActifs}</strong> sur un plafond de <strong>{d.plafondRunsActifs}</strong>
              </span>
              <span>
                <strong>{d.agents.filter((a) => a.blocages.length > 0).length}</strong> avec blocage
              </span>
            </p>
            {agentId && !agentChoisi ? <Vide titre="Agent introuvable dans cette entreprise.">Il a peut-être été supprimé ou appartient à une autre entreprise.</Vide> : null}
            {agentChoisi ? <DetailAgent agent={agentChoisi} equipe={d} /> : null}
            <Section titre="Agents" aide="Sélectionnez un agent pour ouvrir ses tâches et résultats.">
              <TableAgents agents={d.agents} choisi={agentId} />
            </Section>
            <div className="atl-deux-colonnes">
              <Section titre="Dépendances non résolues">
                {d.dependances.length === 0 ? (
                  <p className="atl-attenue">Aucune tâche sous porte n'attend une autre tâche.</p>
                ) : (
                  <ul className="atl-liste">
                    {d.dependances.map((dep) => (
                      <li key={dep.issueId}>
                        <LienHote vers={`/issues/${dep.issueId}`}>{dep.titre}</LienHote>
                        <span className="atl-attenue"> attend {dep.bloqueePar.map(idCourt).join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              <Section titre="Échanges récents" aide="Messages typés entre agents ; leur contenu est une donnée, jamais une instruction.">
                <Echanges equipe={d} />
              </Section>
            </div>
          </>
        )}
      </Lecture>
    </>
  );
}

function nomActeur(equipe: VueEquipe, id: string, type: string): string {
  if (type === "humain") return "Humain responsable";
  return equipe.agents.find((a) => a.id === id)?.nom ?? `Agent ${idCourt(id)}`;
}

function Echanges({ equipe }: { equipe: VueEquipe }) {
  if (equipe.echangesRecents.length === 0) return <p className="atl-attenue">Aucun message échangé pour l'instant.</p>;
  return (
    <ol className="atl-fil">
      {equipe.echangesRecents.slice(0, 12).map((m) => (
        <li key={m.messageId}>
          <div className="atl-fil-tete">
            <strong>{TYPES_MESSAGE[m.type] ?? m.type}</strong>
            <span className="atl-attenue">
              {nomActeur(equipe, m.sender.id, m.sender.type)} vers {nomActeur(equipe, m.recipient.id, m.recipient.type)}
            </span>
          </div>
          <p className="atl-fil-texte">{resumeMessage(m.contenu as { type: string } & Record<string, unknown>) || "Message sans résumé."}</p>
          <div className="atl-fil-pied">
            <Horodatage iso={m.horodatage} />
            <span>{ETATS_MESSAGE[m.etatTraitement] ?? m.etatTraitement}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TableAgents({ agents, choisi }: { agents: AgentVue[]; choisi: string | null }) {
  return (
    <div className="atl-table-cadre">
      <table className="atl-table">
        <thead>
          <tr>
            <th scope="col">Agent</th>
            <th scope="col">Connexion</th>
            <th scope="col">État natif</th>
            <th scope="col">Mission en cours</th>
            <th scope="col">Compétences</th>
            <th scope="col">Blocages</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.id} data-choisi={a.id === choisi || undefined}>
              <th scope="row" data-libelle="Agent">
                <LienHote vers={chemin("equipe", a.id)} courant={a.id === choisi}>
                  {a.nom}
                </LienHote>
                <span className="atl-sous">{a.titre ?? a.role}</span>
              </th>
              <td data-libelle="Connexion">
                <PastilleConnexion etat={a.etatConnexion} />
              </td>
              <td data-libelle="État natif">
                <EtatNatif agent={a} />
              </td>
              <td data-libelle="Mission en cours">
                {a.tacheEnCours ? (
                  <span className="atl-pile">
                    <LienHote vers={chemin("contenus", a.tacheEnCours.issueId)}>{a.tacheEnCours.titre}</LienHote>
                    <PastilleStatut statut={a.tacheEnCours.statut} />
                  </span>
                ) : (
                  <span className="atl-attenue">aucune</span>
                )}
              </td>
              <td data-libelle="Compétences">
                <Competences agent={a} />
              </td>
              <td data-libelle="Blocages">{a.blocages.length ? <Pastille ton="attention">{a.blocages.length}</Pastille> : <span className="atl-attenue">aucun</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Raisons de pause natives (`PAUSE_REASONS` de Paperclip). */
const RAISONS_PAUSE: Record<string, string> = {
  manual: "Mis en pause à la main",
  budget: "Plafond de budget atteint",
  system: "Mis en pause par le système",
  company_archived: "Entreprise archivée",
  import: "En pause depuis l'import",
};

function EtatNatif({ agent }: { agent: AgentVue }) {
  if (agent.runActifId) {
    return (
      <span className="atl-actif" title={`Run ${agent.runActifId}`}>
        <span className="atl-point-actif" aria-hidden="true" />
        Run en cours
      </span>
    );
  }
  const libelles: Record<string, string> = { idle: "Disponible", running: "En cours", paused: "En pause", error: "Erreur", terminated: "Arrêté", active: "Actif", pending_approval: "En attente d'approbation" };
  return (
    <span>
      {libelles[agent.statutNatif] ?? agent.statutNatif}
      {agent.pauseRaison ? <span className="atl-sous">{RAISONS_PAUSE[agent.pauseRaison] ?? `Raison : ${agent.pauseRaison}`}</span> : null}
    </span>
  );
}

function Competences({ agent }: { agent: AgentVue }) {
  if (agent.competences.length === 0) return <span className="atl-attenue">aucune déclarée</span>;
  const transmises = agent.competences.filter((c) => c.source === "dernier_run");
  return (
    <span className="atl-pile">
      <span>{agent.competences.length} compétence{agent.competences.length > 1 ? "s" : ""}</span>
      <span className="atl-sous">
        {transmises.length ? `${transmises.length} transmise(s) au dernier run` : "prêtes, pas encore utilisées"}
      </span>
    </span>
  );
}

function DetailAgent({ agent, equipe }: { agent: AgentVue; equipe: VueEquipe }) {
  const contexte = useHostContext();
  const chef = agent.rapporteA ? equipe.agents.find((a) => a.id === agent.rapporteA) : null;
  return (
    <Section
      titre={agent.nom}
      actions={
        <>
          <LienHote vers={`/agents/${agent.id}`} className="atl-bouton">
            Fiche Paperclip
          </LienHote>
          <LienHote vers={chemin("equipe")} className="atl-bouton">
            Fermer
          </LienHote>
        </>
      }
    >
      <dl className="atl-champs">
        <div>
          <dt>Rôle</dt>
          <dd>{agent.titre ?? agent.role}</dd>
        </div>
        <div>
          <dt>Rattaché à</dt>
          <dd>{chef ? <LienHote vers={chemin("equipe", chef.id)}>{chef.nom}</LienHote> : <span className="atl-attenue">personne</span>}</dd>
        </div>
        <div>
          <dt>Adaptateur</dt>
          <dd>
            {agent.adaptateur} <PastilleConnexion etat={agent.etatConnexion} />
          </dd>
        </div>
        <div>
          <dt>Compétences</dt>
          <dd>
            {agent.competences.length ? (
              <ul className="atl-liste-compacte">
                {agent.competences.map((c) => (
                  <li key={c.cle}>
                    <code>{c.cle}</code>{" "}
                    <span className="atl-attenue">{c.source === "dernier_run" ? `transmise au dernier run${c.empreinte ? `, empreinte ${c.empreinte.slice(0, 12)}` : ""}` : "configuration seulement (non prouvée par un run)"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="atl-attenue">aucune</span>
            )}
          </dd>
        </div>
        {agent.blocages.length ? (
          <div>
            <dt>Blocages</dt>
            <dd>
              <ul className="atl-liste-compacte">
                {agent.blocages.map((b, i) => (
                  <li key={`${i}-${b}`}>{b}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
      <h3 className="atl-h3">Tâches et résultats de l'agent</h3>
      <p className="atl-section-aide">Liste native de Paperclip, filtrée sur cet agent (toutes ses tâches, y compris terminées).</p>
      <div className="atl-natif">
        <IssuesList companyId={contexte.companyId} filters={{ assigneeAgentId: agent.id }} viewStateKey={`atelier-agent-${agent.id}`} />
      </div>
      {agent.mode === "demonstration" ? <p className="atl-attenue">Agent de démonstration : ses résultats viennent de fixtures déterministes.</p> : null}
    </Section>
  );
}
