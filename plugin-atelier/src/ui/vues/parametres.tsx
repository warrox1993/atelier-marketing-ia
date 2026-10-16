/**
 * Paramètres et diagnostic (cahier §12 et §15) : gardes serveur, connecteurs,
 * réglages de l'entreprise (concurrence, cycles, rétention), renvois vers
 * les réglages natifs (modèles, budgets, compétences), remise à zéro de la
 * données de l'atelier protégée par une confirmation saisie.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import { LIMITES } from "../../contrats/identifiants.js";
import type { Diagnostic, ReglagesEntreprise, SourcesReelles } from "../../contrats/campagnes.js";
import { CRITERES_PERSONNALISES_MAX, SEUIL_QUALIFICATION_MAX, SEUIL_QUALIFICATION_MIN, type CriterePersonnalise, type ReglagesLeads, type ReglagesScore } from "../../contrats/prospection.js";
import { Champ, Bouton, EnTete, EtatErreur, Fraicheur, Horodatage, LienHote, Lecture, Pastille, PastilleConnexion, Section } from "../composants.js";
import { TableauConnecteurs } from "../connecteurs.js";
import { ListeOnglets, PanneauOnglet, useAncre } from "../onglets.js";
import { ANCRE_PASSAGE_AU_REEL, SectionPassageAuReel } from "../realite.js";
import { useAction, useDonnees } from "../donnees.js";
import { centimesDepuisSaisie, euros } from "../format.js";
import { ecrireBudgetNatif, lireBudgetEntreprise, lireBudgetsAgents, type BudgetNatif } from "../hote.js";
import { appelRoute } from "../routes-prospection.js";
import { ChoixPlafond, EngagementFaceLimite, plafondDepuisSaisie, plafondModifie, saisieDepuisPlafond, type SaisiePlafond } from "../plafonds.js";

/**
 * Panneaux (onglets) de la vue : chaque section garde son contenu et son ancre `#param-…` ;
 * l'ancre de l'adresse sélectionne l'onglet qui la porte. Les panneaux inactifs restent montés mais masqués.
 */
const PANNEAUX_PARAMETRES: ReadonlyArray<{ cle: string; libelle: string; ancres: readonly string[] }> = [
  { cle: "diagnostic", libelle: "Diagnostic", ancres: ["param-diagnostic"] },
  { cle: "sources", libelle: "Sources", ancres: ["param-sources"] },
  { cle: "criteres", libelle: "Critères des leads", ancres: ["param-criteres"] },
  { cle: "depenses", libelle: "Dépenses et coûts", ancres: ["param-depenses", "param-couts"] },
  { cle: "modeles", libelle: "Modèles", ancres: ["param-modeles"] },
  { cle: "avance", libelle: "Avancé", ancres: ["param-reglages", "param-recharger", "param-remise"] },
];
const BASE_PARAMETRES = "atl-param";

/** Panneau qui porte une ancre ; « diagnostic » par défaut. */
export function panneauParametres(ancre: string): string {
  return PANNEAUX_PARAMETRES.find((p) => p.ancres.includes(ancre))?.cle ?? "diagnostic";
}

export function VueParametres() {
  const diag = useDonnees<Diagnostic>("atelier.sante");
  const reg = useDonnees<ReglagesEntreprise>("atelier.reglages");
  const ancre = useAncre();
  const surReel = ancre === ANCRE_PASSAGE_AU_REEL;
  const [panneau, setPanneau] = useState(() => panneauParametres(ancre));
  // Une ancre de l'adresse (lien, retour, saisie) sélectionne l'onglet qui la porte, puis amène la section dans la vue.
  useEffect(() => {
    if (!ancre) return;
    if (!surReel) setPanneau(panneauParametres(ancre));
    const t = window.setTimeout(() => document.getElementById(ancre)?.scrollIntoView?.(), 0);
    return () => window.clearTimeout(t);
  }, [ancre, surReel]);
  const choisir = (cle: string) => {
    setPanneau(cle);
    try {
      window.history.replaceState(window.history.state, "", `#${PANNEAUX_PARAMETRES.find((p) => p.cle === cle)?.ancres[0] ?? ""}`);
      // `replaceState` ne signale rien : sans cet événement, la première section du panneau (repliée sur
      // téléphone) resterait fermée, car `Section` ne se déplie que sur `hashchange`.
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } catch {
      /* l'onglet reste choisi même si l'adresse ne se met pas à jour */
    }
  };
  const actif = (cle: string) => !surReel && panneau === cle;
  return (
    <>
      <EnTete titre="Paramètres et diagnostic" description="État vérifié des gardes et des connecteurs ; une configuration enregistrée ne vaut pas preuve de fonctionnement." />
      <Fraicheur chargeLe={diag.chargeLe} actualisation={diag.loading && diag.data !== null} />
      <div hidden={!surReel}>
        <SectionPassageAuReel />
      </div>
      <div hidden={surReel}>
        <ListeOnglets etiquette="Sections des paramètres" base={BASE_PARAMETRES} secondaire actif={panneau} onglets={PANNEAUX_PARAMETRES.map((p) => ({ cle: p.cle, libelle: p.libelle }))} choisir={choisir} />
      </div>
      <PanneauOnglet base={BASE_PARAMETRES} cle="diagnostic" actif={actif("diagnostic")}>
        <Section titre="Diagnostic" ancre="param-diagnostic" repliable>
          <Lecture r={diag} libelle="diagnostic">
            {(d) => (
              <>
                <dl className="atl-champs atl-champs-grille">
                  <div>
                    <dt>Plugin</dt>
                    <dd>
                      {d.plugin.id} {d.plugin.version}
                    </dd>
                  </div>
                  <div>
                    <dt>Espace de base</dt>
                    <dd>
                      <code>{d.espaceBase}</code> {d.migrationsAppliquees ? "(migrations appliquées)" : "(migrations NON appliquées)"}
                    </dd>
                  </div>
                  <div>
                    <dt>Politique de relecture verrouillée par le socle</dt>
                    <dd>
                      <PastilleConnexion etat={d.gardeServeur.p1PolitiqueVerrouillee} />
                    </dd>
                  </div>
                  <div>
                    <dt>Contrôle automatique imposé par le serveur</dt>
                    <dd>
                      <PastilleConnexion etat={d.gardeServeur.p2PorteDeterministe} />
                    </dd>
                  </div>
                  <div>
                    <dt>Régulateur de passages</dt>
                    <dd>
                      <PastilleConnexion etat={d.gardeServeur.regulateurRuns} />
                    </dd>
                  </div>
                  {d.destinataireHumain?.alerte ? (
                    <div>
                      <dt>Blocages de revue</dt>
                      <dd role="alert">{d.destinataireHumain.alerte}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Vérifié</dt>
                    <dd>
                      <Horodatage iso={d.verifieLe} />
                    </dd>
                  </div>
                </dl>
                <TableauConnecteurs diagnostic={d.connecteurs} />
              </>
            )}
          </Lecture>
        </Section>
      </PanneauOnglet>
      <PanneauOnglet base={BASE_PARAMETRES} cle="sources" actif={actif("sources")}>
        <Section titre="Sources de données réelles" ancre="param-sources" repliable aide="Mode lu sur la passerelle au moment du diagnostic ; rien n'est supposé.">
          <Lecture r={diag} libelle="sources de données">
            {(d) => <TableauSourcesReelles sources={d.sourcesReelles} />}
          </Lecture>
        </Section>
      </PanneauOnglet>
      <PanneauOnglet base={BASE_PARAMETRES} cle="criteres" actif={actif("criteres")}>
        <Section titre="Critères des leads" ancre="param-criteres" repliable aide="Ces réglages décident sur quoi reposent la confiance et la priorité de vos leads. Un critère personnalisé se coche à la main dans la fiche d'un lead.">
          <CriteresLeads />
        </Section>
      </PanneauOnglet>
      <PanneauOnglet base={BASE_PARAMETRES} cle="depenses" actif={actif("depenses")}>
        <Section titre="Dépenses publicitaires" ancre="param-depenses" repliable aide="Plafond choisi par le client pour toute l'entreprise. Chaque campagne peut avoir le sien. Même sans limite, chaque dépense exige une approbation humaine.">
          <Lecture r={reg} libelle="plafond publicitaire">
            {(d) => <PlafondEntreprise reglages={d} onFait={reg.refresh} />}
          </Lecture>
        </Section>
        <Section titre="Coûts IA" ancre="param-couts" repliable aide="Budget mensuel natif de Paperclip, pour l'entreprise et pour chaque agent. L'atelier ne crée pas de budget parallèle. À la limite, Paperclip met l'agent en pause.">
          <BudgetsIa />
        </Section>
      </PanneauOnglet>
      <PanneauOnglet base={BASE_PARAMETRES} cle="modeles" actif={actif("modeles")}>
        <Section titre="Modèles, budgets et compétences" ancre="param-modeles" repliable aide="Ces réglages appartiennent à Paperclip : l'atelier ne les duplique pas.">
          <ul className="atl-liste">
            <li>
              <LienHote vers="/agents/all">Agents</LienHote> : modèle et adaptateur par rôle, compétences assignées, pause et reprise.
            </li>
            <li>
              <LienHote vers="/costs">Coûts et budgets</LienHote> : plafonds par agent et par projet, usage déclaré par les fournisseurs.
            </li>
            <li>
              <LienHote vers="/skills">Compétences</LienHote> : versions publiées et empreintes.
            </li>
          </ul>
        </Section>
      </PanneauOnglet>
      <PanneauOnglet base={BASE_PARAMETRES} cle="avance" actif={actif("avance")}>
        <Section titre="Réglages de l'entreprise" ancre="param-reglages" repliable>
          <Lecture r={reg} libelle="réglages">
            {(d) => <FormulaireReglages reglages={d} onFait={reg.refresh} />}
          </Lecture>
        </Section>
        <RemiseAZero />
      </PanneauOnglet>
    </>
  );
}

const ETAT_PASSERELLE: Record<SourcesReelles["passerelle"], string> = {
  joignable: "Passerelle joignable.",
  injoignable: "Passerelle injoignable depuis le worker : le mode réel n'a pas pu être vérifié.",
  non_configuree: "Adresse de la passerelle non configurée dans le plugin : le mode réel n'a pas pu être vérifié.",
};

function TableauSourcesReelles({ sources }: { sources: SourcesReelles | undefined }) {
  if (!sources) return <p className="atl-vide">Le diagnostic ne contient pas encore les sources de données (worker plus ancien que cette vue).</p>;
  return (
    <>
      <p className="atl-aide" role="status">
        {ETAT_PASSERELLE[sources.passerelle]}
      </p>
      <div className="atl-table-cadre">
        <table className="atl-table">
          <caption className="atl-sr">Sources de données et état lu sur la passerelle</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">État</th>
              <th scope="col">Détail</th>
              <th scope="col">Vérifié le</th>
            </tr>
          </thead>
          <tbody>
            {sources.sources.map((l) => (
              <tr key={l.cle}>
                <th scope="row">{l.nom}</th>
                <td>
                  <Pastille ton={l.reelle ? "succes" : "neutre"}>{l.reelle ? "Connecté" : "Non connecté"}</Pastille>
                </td>
                <td>{l.detail}</td>
                <td>
                  <Horodatage iso={l.verifieLe} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FormulaireReglages({ reglages, onFait }: { reglages: ReglagesEntreprise; onFait(): void }) {
  const enregistrer = useAction<ReglagesEntreprise>("atelier.reglages.enregistrer");
  const [f, setF] = useState({ maxRunsActifs: String(reglages.maxRunsActifs), maxCyclesCorrection: String(reglages.maxCyclesCorrection), modeParDefaut: reglages.modeParDefaut, retentionJours: String(reglages.retentionJours) });
  useEffect(() => {
    setF({ maxRunsActifs: String(reglages.maxRunsActifs), maxCyclesCorrection: String(reglages.maxCyclesCorrection), modeParDefaut: reglages.modeParDefaut, retentionJours: String(reglages.retentionJours) });
    // Seulement quand les réglages enregistrés changent, pas à chaque actualisation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reglages.modifieLe]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [fait, setFait] = useState(false);
  const entier = (v: string, min: number, max: number) => /^\d+$/u.test(v) && Number(v) >= min && Number(v) <= max;
  const raison = !entier(f.maxRunsActifs, LIMITES.maxRunsActifsMin, LIMITES.maxRunsActifsMax)
    ? `Passages actifs : entre ${LIMITES.maxRunsActifsMin} et ${LIMITES.maxRunsActifsMax}.`
    : !entier(f.maxCyclesCorrection, LIMITES.maxCyclesCorrectionMin, LIMITES.maxCyclesCorrectionMax)
      ? `Cycles de correction : entre ${LIMITES.maxCyclesCorrectionMin} et ${LIMITES.maxCyclesCorrectionMax}.`
      : !entier(f.retentionJours, 1, 3650)
        ? "Rétention : entre 1 et 3650 jours."
        : null;
  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (raison) return;
    setEnCours(true);
    setErreur(null);
    setFait(false);
    try {
      await enregistrer({ maxRunsActifs: Number(f.maxRunsActifs), maxCyclesCorrection: Number(f.maxCyclesCorrection), modeParDefaut: f.modeParDefaut, retentionJours: Number(f.retentionJours) });
      setFait(true);
      onFait();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };
  const maj = (cle: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [cle]: e.target.value }));
  return (
    <form className="atl-formulaire" onSubmit={(e) => void soumettre(e)} noValidate>
      <div className="atl-grille-champs">
        <Champ libelle="Passages actifs simultanés au plus" aide="Appliqué par le serveur à toute l'entreprise.">
          <input value={f.maxRunsActifs} onChange={maj("maxRunsActifs")} inputMode="numeric" />
        </Champ>
        <Champ libelle="Cycles de correction avant escalade">
          <input value={f.maxCyclesCorrection} onChange={maj("maxCyclesCorrection")} inputMode="numeric" />
        </Champ>
        <Champ libelle="Rétention des données (jours)">
          <input value={f.retentionJours} onChange={maj("retentionJours")} inputMode="numeric" />
        </Champ>
      </div>
      <p className="atl-sous">
        Dernière modification <Horodatage iso={reglages.modifieLe} />.
      </p>
      {erreur ? <EtatErreur erreur={erreur} contexte="réglages non enregistrés" /> : null}
      {fait ? (
        <p className="atl-succes" role="status">
          Réglages enregistrés.
        </p>
      ) : null}
      <Bouton type="submit" variante="principal" raisonDesactive={raison} enCours={enCours}>
        Enregistrer les réglages
      </Bouton>
    </form>
  );
}

interface CompteRenduCorpus {
  importes: unknown[];
  refuses: unknown[];
  dejaImportes: unknown[];
}
interface CompteRenduBase {
  lignesRetenues: number;
  lignesRejetees: number;
}

function RemiseAZero() {
  const reinitialiser = useAction<{ supprimes: Record<string, number> }>("atelier.donnees.reinitialiser");
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [resultat, setResultat] = useState<Record<string, number> | null>(null);
  const confirmer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      setResultat((await reinitialiser({ confirmation: "REINITIALISER" })).supprimes);
      setSaisie("");
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <Section titre="Remise à zéro des données de l'atelier" ancre="param-remise" repliable aide="Supprime les données de l'atelier de cette entreprise (campagnes, revues, journal…). Refusée par le serveur si une campagne existe ou si l'entreprise garde une décision ou une diffusion. Les tâches et agents Paperclip ne sont pas supprimés.">
      <Champ libelle="Tapez REINITIALISER pour confirmer" className="atl-champ-etroit">
        <input value={saisie} onChange={(e) => setSaisie(e.target.value)} autoComplete="off" />
      </Champ>
      <Bouton variante="danger" enCours={enCours} raisonDesactive={saisie === "REINITIALISER" ? null : "Confirmation non saisie."} onClick={() => void confirmer()}>
        Remettre à zéro
      </Bouton>
      {erreur ? <EtatErreur erreur={erreur} contexte="remise à zéro refusée" /> : null}
      {resultat ? (
        <p className="atl-succes" role="status">
          Remise à zéro effectuée : {Object.entries(resultat).map(([k, v]) => `${k} ${v}`).join(", ") || "rien à supprimer"}.
        </p>
      ) : null}
    </Section>
  );
}

export function PlafondEntreprise({ reglages, onFait }: { reglages: ReglagesEntreprise; onFait(): void }) {
  const enregistrer = useAction<ReglagesEntreprise>("atelier.reglages.enregistrer");
  const [saisie, setSaisie] = useState<SaisiePlafond>(saisieDepuisPlafond(reglages.plafondPub));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [fait, setFait] = useState(false);
  useEffect(() => {
    setSaisie(saisieDepuisPlafond(reglages.plafondPub));
    // Seulement quand le choix enregistré change, pas à chaque actualisation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reglages.plafondPub?.decideLe, reglages.plafondPub?.type]);
  const choix = plafondDepuisSaisie(saisie);
  const raison = choix.raison ?? (plafondModifie(saisie, reglages.plafondPub) ? null : "Aucun changement à enregistrer.");
  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (raison) return;
    setEnCours(true);
    setErreur(null);
    setFait(false);
    try {
      await enregistrer({ plafondPub: choix.plafond });
      setFait(true);
      onFait();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <>
      <EngagementFaceLimite plafond={reglages.plafondPub} engagement={reglages.engagementPub} />
      {reglages.plafondPub ? (
        <p className="atl-sous">
          Choisi par {reglages.plafondPub.decidePar} le <Horodatage iso={reglages.plafondPub.decideLe} />.
        </p>
      ) : null}
      <form className="atl-formulaire" onSubmit={(e) => void soumettre(e)} noValidate>
        <ChoixPlafond
          legende="Plafond de l'entreprise"
          valeur={saisie}
          onChange={setSaisie}
          libelleAucunChoix="Pas de choix pour l'entreprise"
          aideAucunChoix="Sans choix ici ni sur la campagne, aucune dépense publicitaire n'est possible."
          enregistre={saisieDepuisPlafond(reglages.plafondPub).mode}
        />
        {erreur ? <EtatErreur erreur={erreur} contexte="plafond non enregistré" /> : null}
        {fait ? (
          <p className="atl-succes" role="status">
            Plafond enregistré.
          </p>
        ) : null}
        <Bouton type="submit" variante="principal" raisonDesactive={raison} enCours={enCours}>
          Enregistrer le plafond
        </Bouton>
      </form>
    </>
  );
}

/** Saisie d'un budget mensuel en euros : vide = aucune limite (0 côté Paperclip). */
function saisieDepuisCents(cents: number): string {
  return cents === 0 ? "" : String(cents / 100).replace(".", ",");
}

/** Centimes d'une saisie, ou une raison lisible si elle est invalide (vide = aucune limite, donc 0). */
function centsDepuisSaisieBudget(saisie: string): { cents: number; raison: null } | { cents: null; raison: string } {
  const c = centimesDepuisSaisie(saisie);
  if (c === null) return { cents: 0, raison: null };
  if (Number.isNaN(c) || c <= 0) return { cents: null, raison: "Montant invalide : saisir des euros supérieurs à 0 (exemple : 1500 ou 1500,50), ou laisser vide pour aucune limite." };
  return { cents: c, raison: null };
}

const libelleBudget = (cents: number) => (cents === 0 ? "Aucune limite" : euros(cents));

/** Budgets IA natifs de l'entreprise et de tous les agents dans un seul tableau, avec un seul enregistrement. */
export function BudgetsIa() {
  const contexte = useHostContext();
  const tracer = useAction("atelier.budget-ia.tracer");
  const [entreprise, setEntreprise] = useState<BudgetNatif | null>(null);
  const [agents, setAgents] = useState<BudgetNatif[]>([]);
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [pourTous, setPourTous] = useState("");
  const [erreur, setErreur] = useState<unknown>(null);
  const [enCours, setEnCours] = useState(false);
  const [echecs, setEchecs] = useState<Record<string, unknown>>({});
  const [bilan, setBilan] = useState<string | null>(null);
  // Lignes dont l'enregistrement a échoué : leur saisie est conservée au rechargement.
  const aGarder = useRef<Set<string>>(new Set());
  const charger = useCallback(async () => {
    if (!contexte.companyId) return;
    try {
      const [e, a] = await Promise.all([lireBudgetEntreprise(contexte.companyId), lireBudgetsAgents(contexte.companyId)]);
      setEntreprise(e);
      setAgents(a);
      const gardees = aGarder.current;
      aGarder.current = new Set();
      setSaisies((prec) => {
        const suivant: Record<string, string> = {};
        for (const c of [{ ...e, nom: "Entreprise" }, ...a]) suivant[c.id] = gardees.has(c.id) && c.id in prec ? prec[c.id]! : saisieDepuisCents(c.budgetMonthlyCents);
        return suivant;
      });
      setErreur(null);
    } catch (err) {
      setErreur(err);
    }
  }, [contexte.companyId]);
  useEffect(() => {
    void charger();
  }, [charger]);
  if (erreur) return <EtatErreur erreur={erreur} onReessayer={() => void charger()} contexte="budgets natifs illisibles" />;
  if (!entreprise) return <p className="atl-attenue">Chargement des budgets…</p>;

  const lignes: Array<{ cible: BudgetNatif; portee: "entreprise" | "agent" }> = [
    { cible: { ...entreprise, nom: "Entreprise" }, portee: "entreprise" },
    ...agents.map((cible) => ({ cible, portee: "agent" as const })),
  ];
  const etat = lignes.map((l) => {
    const saisie = saisies[l.cible.id] ?? saisieDepuisCents(l.cible.budgetMonthlyCents);
    const lu = centsDepuisSaisieBudget(saisie);
    return { ...l, saisie, lu, modifie: lu.cents === null || lu.cents !== l.cible.budgetMonthlyCents };
  });
  const modifiees = etat.filter((l) => l.modifie);
  const invalide = modifiees.find((l) => l.lu.raison !== null);
  const retraits = modifiees.filter((l) => l.lu.cents === 0 && l.cible.budgetMonthlyCents !== 0);
  const raison = modifiees.length === 0 ? "Aucun budget modifié." : invalide ? `Corriger la ligne « ${invalide.cible.nom} » avant d'enregistrer.` : null;
  const lecturePourTous = centsDepuisSaisieBudget(pourTous);
  const raisonPourTous = !pourTous.trim() ? "Saisir d'abord un montant." : lecturePourTous.raison;

  const enregistrer = async () => {
    if (raison) return;
    setEnCours(true);
    setBilan(null);
    const nouveauxEchecs: Record<string, unknown> = {};
    let reussies = 0;
    for (const l of modifiees) {
      const cents = l.lu.cents ?? 0;
      try {
        await ecrireBudgetNatif(l.portee, l.cible.id, cents);
        await tracer({ portee: l.portee, ...(l.portee === "agent" ? { agentId: l.cible.id } : {}), avantCents: l.cible.budgetMonthlyCents });
        reussies++;
      } catch (err) {
        nouveauxEchecs[l.cible.id] = err;
        aGarder.current.add(l.cible.id);
      }
    }
    setEchecs(nouveauxEchecs);
    const nbEchecs = Object.keys(nouveauxEchecs).length;
    setBilan(nbEchecs === 0 ? `${reussies} budget${reussies > 1 ? "s enregistrés" : " enregistré"} dans Paperclip et tracé${reussies > 1 ? "s" : ""}.` : `${reussies} enregistré${reussies > 1 ? "s" : ""}, ${nbEchecs} en échec (voir les lignes concernées).`);
    setEnCours(false);
    await charger();
  };

  return (
    <div className="atl-budget-ia">
      <div className="atl-formulaire">
        <Champ libelle="Même budget mensuel pour tous les agents (en euros)" aide="Recopie la valeur dans chaque ligne agent ; chaque ligne reste modifiable ensuite. Rien n'est enregistré avant le bouton du bas.">
          <input type="text" inputMode="decimal" value={pourTous} onChange={(e) => setPourTous(e.target.value)} />
        </Champ>
        <Bouton
          raisonDesactive={raisonPourTous}
          onClick={() => setSaisies((prec) => ({ ...prec, ...Object.fromEntries(agents.map((a) => [a.id, pourTous])) }))}
        >
          Appliquer à tous
        </Bouton>
      </div>
      <div className="atl-table-cadre">
        <table className="atl-table">
          <caption className="atl-sr">Budgets mensuels de l'entreprise et des agents</caption>
          <thead>
            <tr>
              <th scope="col">Nom</th>
              <th scope="col">Budget actuel</th>
              <th scope="col">Nouveau budget (€ par mois)</th>
            </tr>
          </thead>
          <tbody>
            {etat.map((l) => (
              <tr key={l.cible.id} data-choisi={l.modifie ? "true" : undefined}>
                <th scope="row">{l.cible.nom}</th>
                <td data-libelle="Budget actuel">{libelleBudget(l.cible.budgetMonthlyCents)}</td>
                <td data-libelle="Nouveau budget (€ par mois)">
                  <input
                    type="text"
                    inputMode="decimal"
                    style={{ minWidth: "8rem", width: "100%" }}
                    aria-label={`Budget mensuel de ${l.cible.nom} en euros`}
                    aria-invalid={l.lu.raison !== null && l.modifie ? true : undefined}
                    placeholder="Aucune limite"
                    value={l.saisie}
                    onChange={(e) => setSaisies((prec) => ({ ...prec, [l.cible.id]: e.target.value }))}
                  />
                  {l.lu.raison !== null && l.modifie ? <p className="atl-aide" role="alert">{l.lu.raison}</p> : null}
                  {l.cible.id in echecs ? <EtatErreur erreur={echecs[l.cible.id]} contexte={`budget de ${l.cible.nom} non enregistré`} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {agents.length === 0 ? <p className="atl-attenue">Aucun agent.</p> : null}
      {retraits.length > 0 ? (
        <div className="atl-encart" data-ton="attention" role="note">
          <p className="atl-encart-titre">Plus de garde-fou sur les coûts IA</p>
          <p>Paperclip ne mettra plus en pause pour budget : {retraits.map((l) => l.cible.nom).join(", ")}. Les coûts IA ne seront plus limités ici.</p>
        </div>
      ) : null}
      {bilan ? <p className="atl-succes" role="status">{bilan}</p> : null}
      <Bouton variante="principal" raisonDesactive={raison} enCours={enCours} onClick={() => void enregistrer()}>
        {`Enregistrer les budgets (${modifiees.length} modifié${modifiees.length > 1 ? "s" : ""})`}
      </Bouton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Critères des leads : confiance (critères, seuil, critères            */
/* personnalisés) et poids du score                                     */
/* ------------------------------------------------------------------ */

interface SaisieLeads {
  criteres: Array<{ code: string; libelle: string; actif: boolean; poids: string }>;
  seuil: string;
  personnalises: CriterePersonnalise[];
  score: Array<{ code: string; libelle: string; poids: string }>;
}

const sansAccents = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Code d'un critère personnalisé tiré de son libellé (préfixe « perso_ » : jamais celui d'un critère existant). */
function codePersonnalise(libelle: string, pris: readonly string[]): string {
  const racine = `perso_${sansAccents(libelle).replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "")}`.slice(0, 36).replace(/_+$/u, "") || "perso_critere";
  let code = racine;
  for (let i = 2; pris.includes(code); i++) code = `${racine}_${i}`;
  return code;
}

function saisieDepuis(l: ReglagesLeads, sc: ReglagesScore): SaisieLeads {
  return {
    criteres: l.criteres.map((c) => ({ code: c.code, libelle: c.libelle, actif: c.actif, poids: String(c.poids) })),
    seuil: String(l.seuil),
    personnalises: l.personnalises,
    score: sc.criteres.map((c) => ({ code: c.code, libelle: c.libelle, poids: String(sc.poids[c.code] ?? 0) })),
  };
}

const entierEntre = (v: string, min: number, max: number) => /^\d+$/u.test(v) && Number(v) >= min && Number(v) <= max;

export function CriteresLeads() {
  const { companyId } = useHostContext();
  const [charge, setCharge] = useState<{ leads: ReglagesLeads; score: ReglagesScore } | null>(null);
  const [f, setF] = useState<SaisieLeads | null>(null);
  const [nouveau, setNouveau] = useState({ libelle: "", poids: "10", description: "" });
  const [erreur, setErreur] = useState<unknown>(null);
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState(false);

  const charger = useCallback(async () => {
    if (!companyId) return;
    setErreur(null);
    try {
      const q = `?companyId=${encodeURIComponent(companyId)}`;
      const [leads, score] = await Promise.all([appelRoute<ReglagesLeads>("GET", `/reglages/leads${q}`), appelRoute<ReglagesScore>("GET", `/reglages/score${q}`)]);
      setCharge({ leads, score });
      setF(saisieDepuis(leads, score));
    } catch (err) {
      setErreur(err);
    }
  }, [companyId]);
  useEffect(() => {
    void charger();
  }, [charger]);

  if (!f || !charge) return erreur ? <EtatErreur erreur={erreur} onReessayer={() => void charger()} contexte="critères des leads" /> : <p className="atl-sous">Chargement des critères…</p>;

  const initial = saisieDepuis(charge.leads, charge.score);
  const leadsModifies = JSON.stringify([f.criteres, f.seuil, f.personnalises]) !== JSON.stringify([initial.criteres, initial.seuil, initial.personnalises]);
  const scoreModifie = JSON.stringify(f.score) !== JSON.stringify(initial.score);
  const raison =
    f.criteres.some((c) => !entierEntre(c.poids, 0, 100)) || f.score.some((c) => !entierEntre(c.poids, 0, 100))
      ? "Chaque poids est un entier de 0 à 100."
      : !entierEntre(f.seuil, SEUIL_QUALIFICATION_MIN, SEUIL_QUALIFICATION_MAX)
        ? `Seuil : entre ${SEUIL_QUALIFICATION_MIN} et ${SEUIL_QUALIFICATION_MAX} %.`
        : !f.criteres.some((c) => c.actif && Number(c.poids) > 0 && c.code !== "taille_connue") && !f.personnalises.some((c) => c.poids > 0)
          ? "Gardez au moins un critère actif avec un poids (autre que « Taille connue »)."
          : !leadsModifies && !scoreModifie
            ? "Aucune modification à enregistrer."
            : null;
  const raisonAjout = !nouveau.libelle.trim()
    ? "Donnez un libellé au critère."
    : !entierEntre(nouveau.poids, 0, 100)
      ? "Poids : entier de 0 à 100."
      : f.personnalises.length >= CRITERES_PERSONNALISES_MAX
        ? `Au plus ${CRITERES_PERSONNALISES_MAX} critères personnalisés.`
        : null;

  const majCritere = (code: string, champ: { actif?: boolean; poids?: string }) => setF((x) => x && { ...x, criteres: x.criteres.map((c) => (c.code === code ? { ...c, ...champ } : c)) });
  const majScore = (code: string, poids: string) => setF((x) => x && { ...x, score: x.score.map((c) => (c.code === code ? { ...c, poids } : c)) });
  const ajouter = () => {
    if (raisonAjout) return;
    setF((x) => x && {
      ...x,
      personnalises: [...x.personnalises, { code: codePersonnalise(nouveau.libelle, x.personnalises.map((c) => c.code)), libelle: nouveau.libelle.trim(), poids: Number(nouveau.poids), description: nouveau.description.trim() }],
    });
    setNouveau({ libelle: "", poids: "10", description: "" });
    setFait(false);
  };
  const retirer = (code: string) => setF((x) => x && { ...x, personnalises: x.personnalises.filter((c) => c.code !== code) });

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    if (raison || !companyId) return;
    setEnCours(true);
    setErreur(null);
    setFait(false);
    try {
      let { leads, score } = charge;
      if (leadsModifies) {
        leads = await appelRoute<ReglagesLeads>("PATCH", "/reglages/leads", {
          companyId, seuil: Number(f.seuil), personnalises: f.personnalises,
          criteres: f.criteres.map((c) => ({ code: c.code, actif: c.actif, poids: Number(c.poids) })),
        });
      }
      if (scoreModifie) {
        score = await appelRoute<ReglagesScore>("PATCH", "/reglages/score", { companyId, poids: Object.fromEntries(f.score.map((c) => [c.code, Number(c.poids)])) });
      }
      setCharge({ leads, score });
      setF(saisieDepuis(leads, score));
      setFait(true);
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form className="atl-formulaire atl-criteres-leads" onSubmit={(e) => void enregistrer(e)} noValidate>
      <h3>Confiance de qualification</h3>
      <div className="atl-table-cadre">
        <table className="atl-table">
          <caption className="atl-sr">Critères de la confiance de qualification</caption>
          <thead>
            <tr>
              <th scope="col">Critère</th>
              <th scope="col">Compte</th>
              <th scope="col">Poids (0 à 100)</th>
            </tr>
          </thead>
          <tbody>
            {f.criteres.map((c) => (
              <tr key={c.code}>
                <th scope="row">{c.libelle}</th>
                <td data-libelle="Compte">
                  <input type="checkbox" checked={c.actif} aria-label={`Compter « ${c.libelle} »`} onChange={(e) => majCritere(c.code, { actif: e.target.checked })} />
                </td>
                <td data-libelle="Poids">
                  <input value={c.poids} inputMode="numeric" aria-label={`Poids de « ${c.libelle} »`} disabled={!c.actif} onChange={(e) => majCritere(c.code, { poids: e.target.value })} />
                </td>
              </tr>
            ))}
            {f.personnalises.map((c) => (
              <tr key={c.code}>
                <th scope="row">
                  {c.libelle} <Pastille ton="neutre">à la main</Pastille>
                  {c.description ? <span className="atl-aide"> {c.description}</span> : null}
                </th>
                <td data-libelle="Compte">
                  <Bouton onClick={() => retirer(c.code)}>Retirer « {c.libelle} »</Bouton>
                </td>
                <td data-libelle="Poids">{c.poids}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="atl-grille-champs">
        <Champ libelle="Seuil de qualification (%)" aide={`Un lead est qualifié à partir de ce seuil (${SEUIL_QUALIFICATION_MIN} à ${SEUIL_QUALIFICATION_MAX}).`}>
          <input value={f.seuil} inputMode="numeric" onChange={(e) => setF((x) => x && { ...x, seuil: e.target.value })} />
        </Champ>
      </div>
      <fieldset className="atl-champ">
        <legend>Ajouter un critère personnalisé</legend>
        <div className="atl-grille-champs">
          <Champ libelle="Libellé du critère">
            <input value={nouveau.libelle} maxLength={120} onChange={(e) => setNouveau((x) => ({ ...x, libelle: e.target.value }))} />
          </Champ>
          <Champ libelle="Poids du critère">
            <input value={nouveau.poids} inputMode="numeric" onChange={(e) => setNouveau((x) => ({ ...x, poids: e.target.value }))} />
          </Champ>
          <Champ libelle="Description (facultative)">
            <input value={nouveau.description} maxLength={300} onChange={(e) => setNouveau((x) => ({ ...x, description: e.target.value }))} />
          </Champ>
        </div>
        <Bouton onClick={ajouter} raisonDesactive={raisonAjout}>
          Ajouter le critère
        </Bouton>
      </fieldset>
      <h3>Poids du score</h3>
      <div className="atl-table-cadre">
        <table className="atl-table">
          <caption className="atl-sr">Poids des critères du score</caption>
          <thead>
            <tr>
              <th scope="col">Critère du score</th>
              <th scope="col">Poids (0 à 100)</th>
            </tr>
          </thead>
          <tbody>
            {f.score.map((c) => (
              <tr key={c.code}>
                <th scope="row">{c.libelle}</th>
                <td data-libelle="Poids">
                  <input value={c.poids} inputMode="numeric" aria-label={`Poids du score : « ${c.libelle} »`} onChange={(e) => majScore(c.code, e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {erreur ? <EtatErreur erreur={erreur} contexte="critères des leads non enregistrés" /> : null}
      {fait ? (
        <p className="atl-succes" role="status">
          Critères des leads enregistrés.
        </p>
      ) : null}
      <Bouton type="submit" variante="principal" raisonDesactive={raison} enCours={enCours}>
        Enregistrer
      </Bouton>
    </form>
  );
}
