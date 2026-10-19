/**
 * Tiroir « Agents en service » du chat du Coordinateur : tous les agents de toutes les entreprises du client,
 * groupés par service, avec sélection et mise en pause ou reprise en lot.
 *
 * - Services : `lireDepartements` (sonde partagée, contrat `departements`) ; un client sans services déclarés, ou une
 *   liste illisible, retombe sur l'entreprise courante seule (un seul groupe).
 * - Agents : `GET /api/companies/{id}/agents` de l'hôte, comme l'organigramme (`agentsDepuisHote`), six lectures
 *   simultanées au plus ; les agents `terminated` sont ignorés.
 * - Actions : `POST /api/agents/:id/pause` et `/resume` de l'hôte (sans corps), mêmes cookies de session que le reste
 *   de l'interface (`appelHote`), six appels simultanés au plus. Chaque refus est rendu avec le message de l'API.
 *   Aucune capacité ajoutée au manifeste : c'est l'utilisateur qui agit, avec ses propres droits.
 * - La sélection ne compte que les agents visibles (filtre et recherche) : rien n'est coupé hors de l'écran.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { appelHote } from "../hote.js";
import { agentsDepuisHote, type AgentHote } from "../organigramme-arbre.js";
import { lireDepartements } from "../departements-sonde.js";
import { STYLES_AGENTS_EN_SERVICE } from "../styles-agents-en-service.js";
import { Chargement, EtatErreur, Vide } from "../composants.js";
import { departementsVisibles, enParallele, lireEntreprises, LECTURES_SIMULTANEES } from "../vues/departements.js";

type ActionLot = "couper" | "allumer";
type Filtre = "tous" | "service" | "pause";

interface Groupe {
  cle: string;
  companyId: string;
  nom: string;
  etat: "chargement" | "pret" | "erreur";
  agents: AgentHote[];
  message?: string;
}

interface Bilan {
  action: ActionLot;
  reussis: number;
  refus: Array<{ nom: string; raison: string }>;
}

const SEUIL_DEPLIE = 100;

const messageDe = (e: unknown) => (typeof (e as { message?: unknown } | null)?.message === "string" ? (e as { message: string }).message : "erreur inconnue");
const estEnPause = (a: AgentHote) => a.status === "paused";
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

const LIBELLES_STATUT: Record<string, string> = {
  idle: "Disponible",
  running: "Au travail",
  paused: "En pause",
  error: "En erreur",
  pending_approval: "Attend une approbation",
};
const libelleStatut = (s: string) => LIBELLES_STATUT[s] ?? s;
const tonStatut = (s: string) => (s === "paused" ? "pause" : s === "error" ? "erreur" : s === "running" ? "actif" : undefined);

/** Chemin de l'API hôte pour une action : la mise en pause ou la reprise d'un seul agent. */
export function cheminAction(action: ActionLot, agentId: string): string {
  return `/agents/${encodeURIComponent(agentId)}/${action === "couper" ? "pause" : "resume"}`;
}

/** Agents sur lesquels une action agit : allumer = ceux en pause ; couper = ceux qui ne le sont pas. */
export function ciblesAction(action: ActionLot, selection: readonly AgentHote[]): AgentHote[] {
  return selection.filter((a) => (action === "allumer" ? estEnPause(a) : !estEnPause(a)));
}

function CaseTriEtat({ etat, onChange, libelle }: { etat: "aucun" | "partiel" | "tous"; onChange: () => void; libelle: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = etat === "partiel";
  }, [etat]);
  return <input ref={ref} type="checkbox" className="atl-case-tactile" checked={etat === "tous"} onChange={onChange} aria-label={libelle} aria-checked={etat === "partiel" ? "mixed" : etat === "tous"} />;
}

const etatCase = (n: number, total: number): "aucun" | "partiel" | "tous" => (n === 0 || total === 0 ? "aucun" : n === total ? "tous" : "partiel");

/**
 * Ne garde que les entreprises du client de l'entreprise courante, jamais celles d'un autre client de l'instance :
 * les entreprises d'un client portent toutes son nom en préfixe (« Client · Service », même règle que `nomClient`).
 * Sans préfixe sur l'entreprise courante (client à nom simple), la déclaration du client fait foi, telle quelle.
 */
export function gardesDuClientCourant<T extends { companyId: string; nomEntreprise: string }>(visibles: readonly T[], companyId: string): T[] {
  const courante = visibles.find((d) => d.companyId === companyId);
  const i = courante ? courante.nomEntreprise.indexOf(" · ") : -1;
  if (!courante || i <= 0) return [...visibles];
  const prefixe = `${courante.nomEntreprise.slice(0, i).trim()} · `;
  return visibles.filter((d) => d.companyId === companyId || d.nomEntreprise.startsWith(prefixe));
}

/** Événement de fenêtre qui ouvre le tiroir (cible `agents` d'une action `ouvrir` du Coordinateur). */
export const EVENEMENT_OUVRIR_AGENTS = "atelier:ouvrir-agents";

export function GererLesAgents({ companyId }: { companyId: string | null | undefined }) {
  const [ouvert, setOuvert] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const ouvrir = () => setOuvert(true);
    window.addEventListener(EVENEMENT_OUVRIR_AGENTS, ouvrir);
    return () => window.removeEventListener(EVENEMENT_OUVRIR_AGENTS, ouvrir);
  }, []);
  if (!companyId) return null;
  return (
    <>
      <style>{STYLES_AGENTS_EN_SERVICE}</style>
      <button
        ref={bouton}
        type="button"
        className="atl-aes-ouvrir"
        aria-label="Gérer les agents"
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        onClick={() => setOuvert(true)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <circle cx="9" cy="8" r="3.25" />
          <path d="M3 19.5c.5-3.2 3-5 6-5s5.5 1.8 6 5M16 5.2a3.1 3.1 0 0 1 0 5.6M18 14.8c1.6.6 2.7 2.2 3 4.7" />
        </svg>
        <span className="atl-aes-texte-court">Gérer les agents</span>
      </button>
      {ouvert ? (
        <TiroirAgents
          companyId={companyId}
          onFermer={() => {
            setOuvert(false);
            window.setTimeout(() => bouton.current?.focus(), 0);
          }}
        />
      ) : null}
    </>
  );
}

function TiroirAgents({ companyId, onFermer }: { companyId: string; onFermer: () => void }) {
  const idTitre = useId();
  const racine = useRef<HTMLDivElement>(null);
  const fond = useRef<HTMLDivElement>(null);
  const actif = useRef(true);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<unknown>(null);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [recherche, setRecherche] = useState("");
  const [ouverts, setOuverts] = useState<ReadonlySet<string>>(new Set());
  const [confirmation, setConfirmation] = useState<ActionLot | null>(null);
  const [execution, setExecution] = useState<{ fait: number; total: number } | null>(null);
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [essai, setEssai] = useState(0);
  const aEteDeplie = useRef(false);

  // Montage, démontage, puis remontage (StrictMode, hôte) : le drapeau doit être remis à vrai à CHAQUE montage,
  // sinon les lectures qui aboutissent après le remontage sont jetées et les groupes restent sur « lecture… ».
  useEffect(() => {
    actif.current = true;
    return () => {
      actif.current = false;
    };
  }, []);

  // Le reste de la page est inerte tant que le tiroir est ouvert (ni focus, ni clic, ni lecteur d'écran) : on marque
  // les frères de chaque ancêtre du tiroir, sauf le fond (qui ferme au clic), et on rend la main à la fermeture.
  useEffect(() => {
    const dialogue = racine.current;
    if (!dialogue) return;
    const marques: Element[] = [];
    for (let noeud: Element | null = dialogue; noeud && noeud.parentElement; noeud = noeud.parentElement) {
      for (const frere of Array.from(noeud.parentElement.children)) {
        if (frere === noeud || frere === fond.current || frere.hasAttribute("inert") || frere.tagName === "STYLE" || frere.tagName === "SCRIPT") continue;
        frere.setAttribute("inert", "");
        marques.push(frere);
      }
    }
    return () => {
      for (const m of marques) m.removeAttribute("inert");
    };
  }, []);

  /** Lit les agents d'un groupe ; un échec reste local au groupe. */
  const lireAgents = useCallback(async (g: Groupe) => {
    try {
      const brut = await appelHote<unknown>("GET", `/companies/${encodeURIComponent(g.companyId)}/agents`);
      const agents = agentsDepuisHote(brut);
      if (actif.current) setGroupes((p) => p.map((x) => (x.cle === g.cle ? { ...x, etat: "pret", agents, message: undefined } : x)));
    } catch (e) {
      if (actif.current) setGroupes((p) => p.map((x) => (x.cle === g.cle ? { ...x, etat: "erreur", message: messageDe(e) } : x)));
    }
  }, []);

  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    (async () => {
      const r = await lireDepartements(companyId);
      let declares: Groupe[] = [];
      if (r && r.departements.length > 0) {
        let visibles = r.departements.map((d) => ({ ...d, nomEntreprise: d.nom }));
        try {
          const entreprises = await lireEntreprises();
          const croises = gardesDuClientCourant(departementsVisibles(r.departements, entreprises), companyId);
          if (croises.length > 0) visibles = croises.map((d) => ({ ...d, nomEntreprise: d.nom }));
        } catch {
          // Liste des entreprises illisible : on garde les services déclarés, chaque lecture dira si elle est refusée.
        }
        declares = visibles.map((d) => ({ cle: d.companyId, companyId: d.companyId, nom: d.nom, etat: "chargement", agents: [] }));
      }
      if (declares.length === 0) declares = [{ cle: companyId, companyId, nom: "Agents", etat: "chargement", agents: [] }];
      if (annule) return;
      setGroupes(declares);
      setChargement(false);
      await enParallele(declares, LECTURES_SIMULTANEES, lireAgents);
    })().catch((e: unknown) => {
      if (!annule) {
        setErreur(e);
        setChargement(false);
      }
    });
    return () => {
      annule = true;
    };
  }, [companyId, essai, lireAgents]);

  const total = groupes.reduce((n, g) => n + g.agents.length, 0);
  const toutPret = groupes.length > 0 && groupes.every((g) => g.etat !== "chargement");

  // Groupes dépliés par défaut quand la liste est courte ; sinon l'utilisateur déplie ce qu'il veut.
  useEffect(() => {
    if (!toutPret || aEteDeplie.current) return;
    aEteDeplie.current = true;
    if (total <= SEUIL_DEPLIE) setOuverts(new Set(groupes.map((g) => g.cle)));
  }, [toutPret, total, groupes]);

  const requete = recherche.trim().toLocaleLowerCase("fr");
  const visibles = useMemo(
    () =>
      groupes.map((g) => ({
        groupe: g,
        agents: g.agents.filter((a) => (filtre === "tous" || (filtre === "pause" ? estEnPause(a) : !estEnPause(a))) && (requete === "" || a.name.toLocaleLowerCase("fr").includes(requete))),
      })),
    [groupes, filtre, requete],
  );
  const tousVisibles = useMemo(() => visibles.flatMap((v) => v.agents), [visibles]);
  const choisis = useMemo(() => tousVisibles.filter((a) => selection.has(a.id)), [tousVisibles, selection]);
  const aCouper = ciblesAction("couper", choisis);
  const aAllumer = ciblesAction("allumer", choisis);

  const basculer = (ids: readonly string[], coche: boolean) =>
    setSelection((p) => {
      const s = new Set(p);
      for (const id of ids) {
        if (coche) s.add(id);
        else s.delete(id);
      }
      return s;
    });

  const lancer = async (action: ActionLot) => {
    const cibles = ciblesAction(action, choisis);
    setConfirmation(null);
    if (cibles.length === 0) return;
    setBilan(null);
    setExecution({ fait: 0, total: cibles.length });
    const refus: Bilan["refus"] = [];
    const reussis = new Set<string>();
    await enParallele(cibles, LECTURES_SIMULTANEES, async (a) => {
      try {
        await appelHote("POST", cheminAction(action, a.id));
        reussis.add(a.id);
      } catch (e) {
        refus.push({ nom: a.name, raison: messageDe(e) });
      }
      if (actif.current) setExecution((p) => (p ? { ...p, fait: p.fait + 1 } : p));
    });
    if (!actif.current) return;
    setExecution(null);
    setBilan({ action, reussis: reussis.size, refus });
    basculer([...reussis], false);
    // Relecture des statuts : l'écran montre l'état réel, pas celui qu'on croit avoir obtenu.
    await enParallele(groupes, LECTURES_SIMULTANEES, lireAgents);
  };

  // Focus : à l'ouverture sur le titre ; confirmation et bilan prennent le focus pour être annoncés et utilisables.
  const titre = useRef<HTMLHeadingElement>(null);
  const zoneConfirmation = useRef<HTMLDivElement>(null);
  const zoneBilan = useRef<HTMLDivElement>(null);
  useEffect(() => titre.current?.focus(), []);
  useEffect(() => {
    if (confirmation) zoneConfirmation.current?.querySelector<HTMLElement>("button")?.focus();
  }, [confirmation]);
  useEffect(() => {
    if (bilan) zoneBilan.current?.focus();
  }, [bilan]);

  const surClavier = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onFermer();
      return;
    }
    if (e.key !== "Tab" || !racine.current) return;
    const focalisables = [...racine.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), summary')];
    const premier = focalisables[0];
    const dernier = focalisables[focalisables.length - 1];
    if (!premier || !dernier) return;
    const courant = document.activeElement;
    if (e.shiftKey && (courant === premier || courant === titre.current || !racine.current.contains(courant))) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && (courant === dernier || !racine.current.contains(courant))) {
      e.preventDefault();
      premier.focus();
    }
  };

  const nbTotalVisibles = tousVisibles.length;
  const etatGlobal = etatCase(choisis.length, nbTotalVisibles);

  return (
    <>
      <div ref={fond} className="atl-aes-fond" onClick={onFermer} aria-hidden="true" />
      <div ref={racine} className="atl-aes" role="dialog" aria-modal="true" aria-labelledby={idTitre} onKeyDown={surClavier}>
        <div className="atl-aes-entete">
          <h2 id={idTitre} ref={titre} tabIndex={-1}>
            Agents en service
          </h2>
          <button type="button" className="atl-aes-fermer" onClick={onFermer}>
            Fermer
          </button>
        </div>
        {chargement ? (
          <Chargement libelle="Lecture des agents" lignes={4} />
        ) : erreur ? (
          <EtatErreur erreur={erreur} onReessayer={() => setEssai((n) => n + 1)} contexte="les agents" />
        ) : (
          <>
            <div className="atl-aes-outils">
              <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher un agent par nom" aria-label="Chercher un agent par nom" />
              <fieldset className="atl-aes-filtre">
                <legend>Filtrer par état</legend>
                {(
                  [
                    ["tous", "Tous"],
                    ["service", "En service"],
                    ["pause", "En pause"],
                  ] as const
                ).map(([valeur, libelle]) => (
                  <label key={valeur}>
                    <input type="radio" name={`${idTitre}-filtre`} checked={filtre === valeur} onChange={() => setFiltre(valeur)} />
                    <span>{libelle}</span>
                  </label>
                ))}
              </fieldset>
              <div className="atl-aes-tout">
                <label className="atl-aes-case">
                  <CaseTriEtat etat={etatGlobal} libelle="Tout sélectionner" onChange={() => basculer(tousVisibles.map((a) => a.id), etatGlobal !== "tous")} />
                  Tout sélectionner
                </label>
                <span className="atl-aes-compteur" role="status" aria-live="polite">
                  {pluriel(choisis.length, "sélectionné", "sélectionnés")}
                </span>
              </div>
              <div className="atl-aes-actions">
                <button type="button" className="atl-bouton" disabled={aAllumer.length === 0 || execution !== null} onClick={() => setConfirmation("allumer")}>
                  Allumer la sélection
                </button>
                <button type="button" className="atl-bouton" disabled={aCouper.length === 0 || execution !== null} onClick={() => setConfirmation("couper")}>
                  Couper la sélection
                </button>
              </div>
              {confirmation ? (
                <div ref={zoneConfirmation} className="atl-aes-confirmation" role="group" aria-label="Confirmation">
                  <p>
                    {confirmation === "couper"
                      ? `Couper ${pluriel(aCouper.length, "agent", "agents")} ? Leurs tâches en cours s'arrêtent.`
                      : `Allumer ${pluriel(aAllumer.length, "agent", "agents")} ?`}
                  </p>
                  <div className="atl-aes-actions">
                    <button type="button" className="atl-bouton" onClick={() => setConfirmation(null)}>
                      Annuler
                    </button>
                    <button type="button" className="atl-bouton" data-variante="principal" onClick={() => void lancer(confirmation)}>
                      {confirmation === "couper" ? "Couper" : "Allumer"}
                    </button>
                  </div>
                </div>
              ) : null}
              {execution ? (
                <div className="atl-aes-bilan" role="status">
                  <p>{`En cours : ${execution.fait} sur ${execution.total}`}</p>
                </div>
              ) : null}
              {bilan ? (
                <div ref={zoneBilan} className="atl-aes-bilan" role="status" tabIndex={-1}>
                  <p>
                    {[
                      bilan.reussis > 0 ? `${bilan.reussis} ${bilan.action === "allumer" ? (bilan.reussis > 1 ? "allumés" : "allumé") : bilan.reussis > 1 ? "coupés" : "coupé"}` : null,
                      bilan.refus.length > 0 ? `${bilan.refus.length} ${bilan.refus.length > 1 ? "refusés" : "refusé"}` : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "Aucun agent concerné"}
                  </p>
                  {bilan.refus.length > 0 ? (
                    <ul>
                      {bilan.refus.map((r, i) => (
                        <li key={`${r.nom}-${i}`}>{`${r.nom} : ${r.raison}`}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="atl-aes-liste">
              {total === 0 && toutPret && groupes.every((g) => g.etat === "pret") ? (
                <Vide titre="Aucun agent" />
              ) : (
                visibles.map(({ groupe: g, agents }) => {
                  const choisisGroupe = agents.filter((a) => selection.has(a.id)).length;
                  const force = requete !== "" && agents.length > 0;
                  const ouvertGroupe = ouverts.has(g.cle) || force;
                  const enPause = g.agents.filter(estEnPause).length;
                  return (
                    <details
                      key={g.cle}
                      className="atl-aes-groupe"
                      open={ouvertGroupe}
                      onToggle={(e) => {
                        const o = (e.currentTarget as HTMLDetailsElement).open;
                        if (o !== ouvertGroupe)
                          setOuverts((p) => {
                            const s = new Set(p);
                            if (o) s.add(g.cle);
                            else s.delete(g.cle);
                            return s;
                          });
                      }}
                    >
                      <summary>
                        <span className="atl-aes-groupe-nom">{g.nom}</span>
                        <span className="atl-aes-groupe-nb">
                          {g.etat === "chargement" ? "lecture…" : g.etat === "erreur" ? "illisible" : `${pluriel(g.agents.length, "agent", "agents")}${enPause > 0 ? `, ${enPause} en pause` : ""}`}
                        </span>
                      </summary>
                      {ouvertGroupe ? (
                        g.etat === "chargement" ? (
                          <p className="atl-aes-etat">Lecture des agents…</p>
                        ) : g.etat === "erreur" ? (
                          <p className="atl-aes-etat" role="alert">
                            {`Lecture impossible : ${g.message ?? "erreur inconnue"}`}{" "}
                            <button type="button" className="atl-bouton" onClick={() => void lireAgents(g)}>
                              Réessayer
                            </button>
                          </p>
                        ) : agents.length === 0 ? (
                          <p className="atl-aes-etat">Aucun agent ne correspond.</p>
                        ) : (
                          <>
                            <label className="atl-aes-case atl-aes-groupe-case">
                              <CaseTriEtat
                                etat={etatCase(choisisGroupe, agents.length)}
                                libelle={`Tout sélectionner dans ${g.nom}`}
                                onChange={() => basculer(agents.map((a) => a.id), etatCase(choisisGroupe, agents.length) !== "tous")}
                              />
                              Tout sélectionner dans ce service
                            </label>
                            {agents.map((a) => (
                              <label key={a.id} className="atl-aes-ligne">
                                <input type="checkbox" className="atl-case-tactile" checked={selection.has(a.id)} onChange={(e) => basculer([a.id], e.target.checked)} aria-label={a.name} />
                                <span className="atl-aes-ligne-texte">
                                  <span className="atl-aes-ligne-nom">{a.name}</span>
                                  {a.title ? <span className="atl-aes-ligne-role">{a.title}</span> : null}
                                </span>
                                <span className="atl-aes-statut" data-ton={tonStatut(a.status)}>
                                  {libelleStatut(a.status)}
                                </span>
                              </label>
                            ))}
                          </>
                        )
                      ) : null}
                    </details>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
