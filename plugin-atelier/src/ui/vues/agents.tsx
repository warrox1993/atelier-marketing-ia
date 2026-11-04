/**
 * Vue « Agents » : les agents de tous les départements du client sur une seule page, regroupés par département
 * (ordre du registre).
 *
 * - La liste des services vient de `departements.lister` croisée avec `GET /api/companies` (comme la grille des
 *   départements) ; les agents de chaque service sont lus par l'API de l'hôte avec le companyId de CE service (l'hôte
 *   vérifie l'accès), six lectures à la fois au plus. Chaque département se remplit ou échoue seul, avec « Réessayer ».
 * - Filtres : état (onglets), texte (nom ou intitulé), département. `#service=<slug>` pré-filtre un département.
 * - Chaque agent renvoie à sa fiche native : `/<préfixe du service>/agents/<id>`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import { agentsPourListe, ETATS_FILTRE, filtrerAgents, libelleEtat, texteResumeAgents, trierAgents, type AgentLigne, type FiltreEtat } from "../agents-tous.js";
import { Chargement, EtatErreur, LienHote, Vide } from "../composants.js";
import { lireDepartements, nomClient } from "../departements-sonde.js";
import { enDate, ilYA, nombre } from "../format.js";
import { appelHote } from "../hote.js";
import { useAncre } from "../onglets.js";
import { STYLES_AGENTS_TOUS } from "../styles-agents-tous.js";
import { departementsVisibles, enParallele, lireEntreprises, LECTURES_SIMULTANEES, type DepartementVisible } from "./departements.js";

type CaseAgents = { etat: "chargement" } | { etat: "pret"; agents: AgentLigne[] } | { etat: "erreur"; message: string };

const pl = (n: number, un: string, plusieurs: string) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;

function famille(statut: string): "actif" | "pause" | "erreur" | "autre" {
  if (statut === "active" || statut === "idle" || statut === "running") return "actif";
  return statut === "paused" ? "pause" : statut === "error" ? "erreur" : "autre";
}

function LigneAgent({ a, prefixe }: { a: AgentLigne; prefixe: string }) {
  const battement = enDate(a.derniereActivite);
  return (
    <li className="atl-ag-ligne">
      <div className="atl-ag-identite">
        <LienHote vers={`/${prefixe}/agents/${encodeURIComponent(a.id)}`} className="atl-ag-nom">
          {a.name}
        </LienHote>
        {a.title ? <span className="atl-ag-titre">{a.title}</span> : null}
      </div>
      <span className="atl-ag-etat" data-famille={famille(a.status)}>
        {libelleEtat(a.status)}
      </span>
      <span className="atl-ag-modele">{a.model ?? ""}</span>
      <span className="atl-ag-battement">{battement ? ilYA(battement) : ""}</span>
    </li>
  );
}

function GroupeDepartement({ d, c, filtre, texte, relire }: { d: DepartementVisible; c: CaseAgents; filtre: FiltreEtat; texte: string; relire: () => void }) {
  if (c.etat === "pret") {
    const visibles = trierAgents(filtrerAgents(c.agents, filtre, texte));
    if (visibles.length === 0 && (filtre !== "tous" || texte.trim() !== "")) return null;
    const erreurs = c.agents.filter((a) => a.status === "error").length;
    const compte = visibles.length === c.agents.length ? pl(c.agents.length, "agent", "agents") : `${nombre(visibles.length)} sur ${pl(c.agents.length, "agent", "agents")}`;
    return (
      <section className="atl-ag-groupe" aria-labelledby={`atl-ag-${d.slug}`}>
        <h2 id={`atl-ag-${d.slug}`}>
          <span className="atl-ag-depart">{d.nom}</span> <span className="atl-ag-compte">{erreurs ? `${compte} · ${nombre(erreurs)} en erreur` : compte}</span>
        </h2>
        {visibles.length ? (
          <ul className="atl-ag-liste">
            {visibles.map((a) => (
              <LigneAgent key={a.id} a={a} prefixe={d.prefixe} />
            ))}
          </ul>
        ) : (
          <p className="atl-ag-vide">Aucun agent dans ce département.</p>
        )}
      </section>
    );
  }
  return (
    <section className="atl-ag-groupe" aria-labelledby={`atl-ag-${d.slug}`}>
      <h2 id={`atl-ag-${d.slug}`}>
        <span className="atl-ag-depart">{d.nom}</span>
      </h2>
      {c.etat === "chargement" ? (
        <Chargement libelle={`Lecture des agents du département ${d.nom}`} lignes={2} />
      ) : (
        <div className="atl-ag-erreur" role="alert">
          <p>Lecture impossible : {c.message}</p>
          <button type="button" className="atl-bouton" onClick={relire}>
            Réessayer
          </button>
        </div>
      )}
    </section>
  );
}

export function VueTousLesAgents() {
  const { companyId } = useHostContext();
  const ancre = useAncre();
  const slugAncre = new URLSearchParams(ancre).get("service") ?? "";
  const [liste, setListe] = useState<{ client: string; departements: DepartementVisible[] } | null>(null);
  const [erreur, setErreur] = useState<unknown>(null);
  const [cases, setCases] = useState<Record<string, CaseAgents>>({});
  const [essai, setEssai] = useState(0);
  const [filtre, setFiltre] = useState<FiltreEtat>("tous");
  const [texte, setTexte] = useState("");
  const [slug, setSlug] = useState(slugAncre);

  useEffect(() => setSlug(slugAncre), [slugAncre]);

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

  const lireCase = useCallback(async (d: DepartementVisible, signal: { annule: boolean }) => {
    setCases((p) => ({ ...p, [d.companyId]: { etat: "chargement" } }));
    try {
      const brut = await appelHote<unknown>("GET", `/companies/${encodeURIComponent(d.companyId)}/agents`);
      if (!signal.annule) setCases((p) => ({ ...p, [d.companyId]: { etat: "pret", agents: agentsPourListe(brut) } }));
    } catch (e) {
      const message = (e as { message?: unknown } | null)?.message;
      if (!signal.annule) setCases((p) => ({ ...p, [d.companyId]: { etat: "erreur", message: typeof message === "string" ? message : "erreur inconnue" } }));
    }
  }, []);

  useEffect(() => {
    if (!liste) return;
    const signal = { annule: false };
    setCases(Object.fromEntries(liste.departements.map((d) => [d.companyId, { etat: "chargement" } as CaseAgents])));
    void enParallele(liste.departements, LECTURES_SIMULTANEES, (d) => lireCase(d, signal));
    return () => {
      signal.annule = true;
    };
  }, [liste, lireCase]);

  const resume = useMemo(() => {
    const r = { agents: 0, departements: liste?.departements.length ?? 0, enCours: 0, enErreur: 0, illisibles: 0, enLecture: 0 };
    for (const c of Object.values(cases)) {
      if (c.etat === "erreur") r.illisibles += 1;
      else if (c.etat === "chargement") r.enLecture += 1;
      else {
        r.agents += c.agents.length;
        r.enCours += c.agents.filter((a) => a.status === "running").length;
        r.enErreur += c.agents.filter((a) => a.status === "error").length;
      }
    }
    return r;
  }, [cases, liste]);

  if (erreur) return <EtatErreur erreur={erreur} onReessayer={() => setEssai((n) => n + 1)} contexte="agents" />;
  if (!liste) return <Chargement libelle="Agents" lignes={3} />;
  if (liste.departements.length === 0) {
    return (
      <Vide titre="Aucun service déclaré pour ce client">
        <p>La page des agents liste les agents des services auxquels vous avez accès, dès qu'au moins un service est déclaré.</p>
      </Vide>
    );
  }
  const departements = slug ? liste.departements.filter((d) => d.slug === slug) : liste.departements;
  const toutAfficher = () => {
    setFiltre("tous");
    setTexte("");
    setSlug("");
  };
  // Aucun agent à montrer : toutes les lectures sont finies et rien ne passe les filtres (un échec reste affiché).
  const rien = departements.every((d) => {
    const c = cases[d.companyId];
    return c?.etat === "pret" && filtrerAgents(c.agents, filtre, texte).length === 0 && (filtre !== "tous" || texte.trim() !== "");
  });
  return (
    <section className="atl-ag" aria-labelledby="atl-ag-titre">
      <style href="atelier-agents-tous" precedence="default">
        {STYLES_AGENTS_TOUS}
      </style>
      <header className="atl-entete">
        <h1 id="atl-ag-titre">Agents</h1>
        <p className="atl-ag-resume" data-testid="resume-agents">
          {texteResumeAgents(resume)}
        </p>
      </header>
      <div className="atl-ag-outils">
        <div className="atl-ag-onglets" role="group" aria-label="Filtrer par état">
          {ETATS_FILTRE.map((e) => (
            <button key={e.cle} type="button" className="atl-ag-onglet" aria-pressed={filtre === e.cle} onClick={() => setFiltre(e.cle)}>
              {e.libelle}
            </button>
          ))}
        </div>
        <label className="atl-ag-champ">
          <span className="atl-ag-etiquette">Rechercher un agent</span>
          <input type="search" value={texte} placeholder="Nom ou intitulé" onChange={(e) => setTexte(e.target.value)} />
        </label>
        <label className="atl-ag-champ">
          <span className="atl-ag-etiquette">Département</span>
          <select value={slug} onChange={(e) => setSlug(e.target.value)}>
            <option value="">Tous les départements</option>
            {liste.departements.map((d) => (
              <option key={d.companyId} value={d.slug}>
                {d.nom}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rien ? (
        <Vide
          titre="Aucun agent ne correspond à ces filtres."
          action={
            <button type="button" className="atl-bouton" onClick={toutAfficher}>
              Tout afficher
            </button>
          }
        />
      ) : (
        departements.map((d) => <GroupeDepartement key={d.companyId} d={d} c={cases[d.companyId] ?? { etat: "chargement" }} filtre={filtre} texte={texte} relire={() => void lireCase(d, { annule: false })} />)
      )}
    </section>
  );
}
