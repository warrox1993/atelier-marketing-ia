/**
 * Paramètres et diagnostic (cahier §12 et §15) : gardes serveur, connecteurs,
 * réglages de l'entreprise (concurrence, cycles, mode, rétention), renvois vers
 * les réglages natifs (modèles, budgets, compétences), remise à zéro de la
 * démonstration protégée par une confirmation saisie.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import { LIMITES } from "../../contrats/identifiants.js";
import type { Diagnostic, ReglagesEntreprise } from "../../contrats/campagnes.js";
import { Champ, Bouton, EnTete, EtatErreur, Fraicheur, Horodatage, LienHote, Lecture, PastilleConnexion, Section } from "../composants.js";
import { TableauConnecteurs } from "../connecteurs.js";
import { useAction, useDonnees } from "../donnees.js";
import { euros } from "../format.js";
import { ecrireBudgetNatif, lireBudgetEntreprise, lireBudgetsAgents, type BudgetNatif } from "../hote.js";
import { ChoixPlafond, EngagementFaceLimite, plafondDepuisSaisie, plafondModifie, saisieDepuisPlafond, type SaisiePlafond } from "../plafonds.js";

export function VueParametres() {
  const diag = useDonnees<Diagnostic>("atelier.sante");
  const reg = useDonnees<ReglagesEntreprise>("atelier.reglages");
  return (
    <>
      <EnTete titre="Paramètres et diagnostic" description="État vérifié des gardes et des connecteurs ; une configuration enregistrée ne vaut pas preuve de fonctionnement." />
      <Fraicheur chargeLe={diag.chargeLe} actualisation={diag.loading && diag.data !== null} />
      <Section titre="Diagnostic">
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
                  <dt>Politique de relecture verrouillée (P1)</dt>
                  <dd>
                    <PastilleConnexion etat={d.gardeServeur.p1PolitiqueVerrouillee} />
                  </dd>
                </div>
                <div>
                  <dt>Porte déterministe côté serveur (P2)</dt>
                  <dd>
                    <PastilleConnexion etat={d.gardeServeur.p2PorteDeterministe} />
                  </dd>
                </div>
                <div>
                  <dt>Régulateur de runs</dt>
                  <dd>
                    <PastilleConnexion etat={d.gardeServeur.regulateurRuns} />
                  </dd>
                </div>
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
      <Section titre="Réglages de l'entreprise">
        <Lecture r={reg} libelle="réglages">
          {(d) => <FormulaireReglages reglages={d} onFait={reg.refresh} />}
        </Lecture>
      </Section>
      <Section titre="Dépenses publicitaires" aide="Plafond choisi par le client pour toute l'entreprise. Chaque campagne peut avoir le sien. Même sans limite, chaque dépense exige une approbation humaine.">
        <Lecture r={reg} libelle="plafond publicitaire">
          {(d) => <PlafondEntreprise reglages={d} onFait={reg.refresh} />}
        </Lecture>
      </Section>
      <Section titre="Coûts IA" aide="Budget mensuel natif de Paperclip, au niveau de l'entreprise et de chaque agent : l'atelier ne crée pas de budget parallèle. À la limite, Paperclip met l'agent en pause.">
        <BudgetsIa />
      </Section>
      <Section titre="Modèles, budgets et compétences" aide="Ces réglages appartiennent à Paperclip : l'atelier ne les duplique pas.">
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
      <RemiseAZero />
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
    ? `Runs actifs : entre ${LIMITES.maxRunsActifsMin} et ${LIMITES.maxRunsActifsMax}.`
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
        <Champ libelle="Runs actifs simultanés au plus" aide="Appliqué par le serveur à toute l'entreprise.">
          <input value={f.maxRunsActifs} onChange={maj("maxRunsActifs")} inputMode="numeric" />
        </Champ>
        <Champ libelle="Cycles de correction avant escalade">
          <input value={f.maxCyclesCorrection} onChange={maj("maxCyclesCorrection")} inputMode="numeric" />
        </Champ>
        <Champ libelle="Mode par défaut">
          <select value={f.modeParDefaut} onChange={maj("modeParDefaut")}>
            <option value="demonstration">Démonstration</option>
            <option value="reel">Réel</option>
          </select>
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

function RemiseAZero() {
  const reinitialiser = useAction<{ supprimes: Record<string, number> }>("atelier.demo.reinitialiser");
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
    <Section titre="Remise à zéro de la démonstration" aide="Supprime les données de l'atelier de cette entreprise (campagnes, revues, journal…). Refusée par le serveur si une campagne réelle existe. Les tâches et agents Paperclip ne sont pas supprimés.">
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

function PlafondEntreprise({ reglages, onFait }: { reglages: ReglagesEntreprise; onFait(): void }) {
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

/** Budget IA natif d'un périmètre : montant mensuel ou aucune limite (0 côté Paperclip). */
function LigneBudgetIa({ cible, portee, onFait }: { cible: BudgetNatif; portee: "entreprise" | "agent"; onFait(): void }) {
  const tracer = useAction("atelier.budget-ia.tracer");
  const initial: SaisiePlafond = cible.budgetMonthlyCents === 0 ? { mode: "aucune_limite", montant: "" } : { mode: "montant", montant: String(cible.budgetMonthlyCents / 100).replace(".", ",") };
  const [saisie, setSaisie] = useState<SaisiePlafond>(initial);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [fait, setFait] = useState(false);
  useEffect(() => setSaisie(initial), [cible.budgetMonthlyCents]); // eslint-disable-line react-hooks/exhaustive-deps
  const choix = plafondDepuisSaisie({ ...saisie, mode: saisie.mode === "aucun" ? "aucune_limite" : saisie.mode });
  const cents = choix.plafond?.type === "montant" ? choix.plafond.montantCents : 0;
  const modifie = cents !== cible.budgetMonthlyCents;
  const raison = choix.raison ?? (modifie ? null : "Aucun changement à enregistrer.");
  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (raison) return;
    setEnCours(true);
    setErreur(null);
    setFait(false);
    try {
      await ecrireBudgetNatif(portee, cible.id, cents);
      await tracer({ portee, ...(portee === "agent" ? { agentId: cible.id } : {}), avantCents: cible.budgetMonthlyCents });
      setFait(true);
      onFait();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <form className="atl-formulaire atl-budget-ia" onSubmit={(e) => void soumettre(e)} noValidate>
      <ChoixPlafond
        legende={`${cible.nom} : ${cible.budgetMonthlyCents === 0 ? "aucune limite" : `${euros(cible.budgetMonthlyCents)} par mois`}`}
        valeur={saisie.mode === "aucun" ? { ...saisie, mode: "aucune_limite" } : saisie}
        onChange={setSaisie}
        libelleAucunChoix=""
        aideAucunChoix=""
        sansAucunChoix
        avertissement="Paperclip ne mettra plus cet agent en pause pour budget : les coûts IA ne seront plus limités ici."
      />
      {erreur ? <EtatErreur erreur={erreur} contexte="budget non enregistré" /> : null}
      {fait ? (
        <p className="atl-succes" role="status">
          Budget enregistré dans Paperclip et tracé.
        </p>
      ) : null}
      <Bouton type="submit" variante="principal" raisonDesactive={raison} enCours={enCours}>
        Enregistrer le budget
      </Bouton>
    </form>
  );
}

function BudgetsIa() {
  const contexte = useHostContext();
  const [entreprise, setEntreprise] = useState<BudgetNatif | null>(null);
  const [agents, setAgents] = useState<BudgetNatif[]>([]);
  const [erreur, setErreur] = useState<unknown>(null);
  const charger = useCallback(async () => {
    if (!contexte.companyId) return;
    try {
      const [e, a] = await Promise.all([lireBudgetEntreprise(contexte.companyId), lireBudgetsAgents(contexte.companyId)]);
      setEntreprise(e);
      setAgents(a);
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
  return (
    <>
      <LigneBudgetIa cible={{ ...entreprise, nom: "Entreprise" }} portee="entreprise" onFait={() => void charger()} />
      <h3 className="atl-h3">Agents</h3>
      {agents.length === 0 ? <p className="atl-attenue">Aucun agent.</p> : agents.map((a) => <LigneBudgetIa key={a.id} cible={a} portee="agent" onFait={() => void charger()} />)}
    </>
  );
}
