/**
 * Organigramme sur téléphone (640 px et moins) : à la place de la toile, une liste accordéon indentée. Le Coordinateur
 * général en tête, puis un bloc repliable par service (coordinateur, puis agents avec le retrait de `reportsTo`).
 * Même disposition logique que la toile (lignesDuService), mêmes liens vers les fiches d'agents, mêmes filtre et
 * « Voir les liens » ; toutes les cibles font 44 px au moins.
 */
import { useMemo } from "react";
import { LienHote } from "./composants.js";
import { nombre } from "./format.js";
import { coordinateurDe, familleStatut, libelleStatutAgent, type AgentHote } from "./organigramme-arbre.js";
import { lignesDuService, type ServiceADisposer } from "./organigramme-disposition.js";

export interface PropsListe {
  services: readonly ServiceADisposer[];
  prefixes: Readonly<Record<string, string>>;
  /** Identifiants de cartes qui correspondent au filtre (mêmes identifiants que la toile). */
  trouvees: ReadonlySet<string>;
  selection: string | null;
  choisir: (slug: string) => void;
  relire: (slug: string) => void;
}

const pluriel = (n: number, un: string, plusieurs: string) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;

function LigneAgent({ agent, prefixe, trouve }: { agent: AgentHote; prefixe: string; trouve: boolean }) {
  return (
    <span className="atl-orgl-agent" data-trouve={trouve || undefined}>
      <LienHote vers={`/${prefixe}/agents/${encodeURIComponent(agent.id)}`} className="atl-orgl-lien">
        {agent.name}
      </LienHote>
      <span className="atl-org-statut" data-famille={familleStatut(agent.status)}>
        {libelleStatutAgent(agent.status)}
      </span>
    </span>
  );
}

export function ListeOrganigramme({ services, prefixes, trouvees, selection, choisir, relire }: PropsListe) {
  const direction = services.find((s) => s.estDirection);
  const general = direction && direction.etat === "pret" ? coordinateurDe(direction.agents) : null;
  // Direction d'abord, comme sur la toile.
  const ordonnes = useMemo(() => [...services.filter((s) => s.estDirection), ...services.filter((s) => !s.estDirection)], [services]);
  return (
    <div className="atl-orgl" data-testid="organigramme-liste">
      <div className="atl-orgl-general" data-trouve={trouvees.has("general") || undefined}>
        <span className="atl-orgl-titre">Coordinateur général</span>
        {general && direction ? <LigneAgent agent={general} prefixe={prefixes[direction.slug] ?? ""} trouve={false} /> : <span className="atl-org-titre">Lecture en cours</span>}
      </div>
      {ordonnes.map((s) => {
        const prefixe = prefixes[s.slug] ?? "";
        const coord = s.etat === "pret" ? coordinateurDe(s.agents) : null;
        const lignes = s.etat === "pret" ? lignesDuService(s.agents, coord?.id ?? null) : [];
        const trouve = [...trouvees].some((id) => id === `service:${s.slug}` || id.startsWith(`agent:${s.slug}:`));
        return (
          <details key={s.slug} className="atl-orgl-service" open={trouve || undefined} data-trouve={trouvees.has(`service:${s.slug}`) || undefined}>
            <summary>
              <span className="atl-orgl-nom">{s.nom}</span>
              <span className="atl-org-compteur">{pluriel(s.agents.length, "agent", "agents")}</span>
            </summary>
            <div className="atl-orgl-corps">
              {s.etat === "erreur" ? (
                <p className="atl-org-erreur" role="alert">
                  Lecture impossible
                  <button type="button" className="atl-bouton" onClick={() => relire(s.slug)}>
                    Réessayer
                  </button>
                </p>
              ) : s.etat === "chargement" ? (
                <p className="atl-org-titre">Lecture en cours</p>
              ) : (
                <>
                  {coord ? <LigneAgent agent={coord} prefixe={prefixe} trouve={trouvees.has(`service:${s.slug}`)} /> : null}
                  <ul className="atl-orgl-agents">
                    {lignes.map((l) => (
                      <li key={l.agent.id} style={{ paddingLeft: `${l.profondeur * 1.25}rem` }}>
                        <LigneAgent agent={l.agent} prefixe={prefixe} trouve={trouvees.has(`agent:${s.slug}:${l.agent.id}`)} />
                        {l.agent.title ? <span className="atl-org-titre">{l.agent.title}</span> : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button type="button" className="atl-bouton atl-orgl-liens" aria-pressed={selection === s.slug} onClick={() => choisir(s.slug)}>
                {selection === s.slug ? "Masquer les liens" : "Voir les liens"}
              </button>
            </div>
          </details>
        );
      })}
    </div>
  );
}
