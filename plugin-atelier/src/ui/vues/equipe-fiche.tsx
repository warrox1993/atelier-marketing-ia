/**
 * Fiche lisible d'un agent marketing et parcours d'une demande, pour un client.
 * Les textes viennent de `contrats/fiches-agents-marketing.ts` (généré depuis organisation/) : rien n'est écrit ici.
 */
import type { ReactNode } from "react";
import type { AgentVue } from "../../contrats/ui.js";
import { FICHES_AGENTS_MARKETING, HUMAIN_SEUL_MARKETING, OBLIGATIONS_MARKETING, PARCOURS_DEMANDE, type FicheAgentMarketing } from "../../contrats/fiches-agents-marketing.js";
import { LienHote, Section } from "../composants.js";
import { chemin } from "../route.js";
import { STYLES_FICHES_AGENTS } from "../styles-fiches-agents.js";

/** Identifiant d'un agent déduit de son nom, comme le fait le bootstrap : sans accents, minuscules, tirets. */
export function slugDepuisNom(nom: string): string {
  return nom.normalize("NFKD").replace(/[̀-ͯ]/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
}

export function ficheDeAgent(a: Pick<AgentVue, "nom">): FicheAgentMarketing | null {
  const slug = slugDepuisNom(a.nom);
  return FICHES_AGENTS_MARKETING.find((f) => f.slug === slug) ?? null;
}

function Liste({ elements }: { elements: readonly string[] }) {
  return (
    <ul>
      {elements.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}

/** Fiche d'un agent : mission, ce qu'il reçoit et livre, compétences, interdits, justification. Détails techniques en dessous. */
export function FicheAgent({ fiche, technique }: { fiche: FicheAgentMarketing; technique: ReactNode }) {
  return (
    <div className="atl-fiche">
      <style href="atelier-fiches-agents" precedence="default">
        {STYLES_FICHES_AGENTS}
      </style>
      <p className="atl-fiche-role">{fiche.pole ? `Pôle ${fiche.pole} · ${fiche.role}` : fiche.role}</p>
      <h3 className="atl-h3">Son rôle et sa mission</h3>
      <p>{fiche.mission}</p>
      <div className="atl-fiche-deux">
        <div>
          <h3 className="atl-h3">Ce qu'il reçoit</h3>
          <Liste elements={fiche.recoit} />
        </div>
        <div>
          <h3 className="atl-h3">Ce qu'il livre</h3>
          <Liste elements={fiche.livre} />
        </div>
      </div>
      <h3 className="atl-h3">Ses compétences</h3>
      {fiche.competences.length === 0 ? (
        <p className="atl-attenue">Aucune : cet agent est un programme de contrôle, sans modèle d'IA.</p>
      ) : (
        <dl className="atl-fiche-comp">
          {fiche.competences.map((c) => (
            <div key={c.cle}>
              <dt>
                {c.nom}
                <code className="atl-sous atl-fiche-cle">{c.cle}</code>
              </dt>
              <dd>{c.sert}</dd>
            </div>
          ))}
        </dl>
      )}
      <h3 className="atl-h3">Ce qu'il n'a pas le droit de faire</h3>
      {fiche.interdits.length > 0 ? <Liste elements={fiche.interdits} /> : <p className="atl-attenue">Ses consignes ne fixent pas d'interdit qui lui soit propre ; les décisions réservées à l'humain ci-dessous valent pour lui comme pour toute l'équipe.</p>}
      {fiche.outilsRetires.length > 0 ? <p className="atl-sous">{`Outils retirés par configuration : ${fiche.outilsRetires.join(", ")}.`}</p> : null}
      <p>
        <strong>Toujours réservé à l'humain :</strong> {HUMAIN_SEUL_MARKETING.join(" ; ")}.
      </p>
      <h3 className="atl-h3">Pourquoi cet agent</h3>
      <p>{fiche.pourquoi}</p>
      <details className="atl-fiche-tech">
        <summary>État dans le tableau de bord et détails techniques</summary>
        {technique}
      </details>
    </div>
  );
}

/** « Comment travaille l'équipe » : le parcours d'une demande en étapes, avec les agents concernés. Absent si aucun agent marketing connu. */
export function ParcoursEquipe({ agents }: { agents: AgentVue[] }) {
  const parSlug = new Map<string, AgentVue>();
  for (const a of agents) if (ficheDeAgent(a)) parSlug.set(slugDepuisNom(a.nom), a);
  if (parSlug.size === 0) return null;
  const nomDe = (slug: string) => FICHES_AGENTS_MARKETING.find((f) => f.slug === slug)?.nom ?? slug;
  return (
    <Section titre="Comment travaille l'équipe" aide="Le parcours d'une demande, d'après les consignes des agents. Cliquez sur un agent pour lire sa fiche.">
      <style href="atelier-fiches-agents" precedence="default">
        {STYLES_FICHES_AGENTS}
      </style>
      <ol className="atl-trajet-liste">
        {PARCOURS_DEMANDE.map((e) => (
          <li key={e.titre}>
            <strong>{e.titre}</strong>
            <p>{e.texte}</p>
            <p className="atl-trajet-agents">
              {e.agents.map((s, i) => {
                const a = parSlug.get(s);
                return (
                  <span key={s}>
                    {i > 0 ? ", " : ""}
                    {a ? <LienHote vers={chemin("equipe", a.id)}>{nomDe(s)}</LienHote> : nomDe(s)}
                  </span>
                );
              })}
            </p>
          </li>
        ))}
      </ol>
      <dl className="atl-trajet-cadre">
        <div>
          <dt>Ce qui reste toujours humain</dt>
          <dd>{HUMAIN_SEUL_MARKETING.join(" ; ")}.</dd>
        </div>
        <div>
          <dt>Conformité</dt>
          <dd>{OBLIGATIONS_MARKETING.join(" ; ")}.</dd>
        </div>
      </dl>
    </Section>
  );
}
