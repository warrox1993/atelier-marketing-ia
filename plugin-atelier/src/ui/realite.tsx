/**
 * « Passage au réel » : visibilité sur ce qui manque pour brancher l'entreprise sur la réalité.
 *
 * - `SectionPassageAuReel` : en tête de la vue Paramètres, un tableau (liste de cartes sur téléphone) :
 *   état, ce que le branchement débloque, qui doit agir, leads concernés, puis la synthèse par critère.
 * - `EncartPassageAuReel` : sur l'accueil, « Ce qui manque pour le réel : N branchements » et le lien vers la section.
 *
 * Les états viennent de la route `realite.etat` (diagnostic des sources, import de la base clients, fiche du client,
 * configuration) ; les lignes Google et diffusion viennent du tableau des connecteurs existant
 * (`connexions-natives.ts`), seule lecture possible des connexions natives. Rien n'est supposé réel.
 */
import { useCallback, useEffect, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import { BRANCHEMENTS_INTERFACE, CleBranchement, RealiteEtat, type ActeurBranchement, type Branchement, type EtatBranchement } from "../contrats/realite.js";
import type { EtatConnexion } from "../contrats/communs.js";
import { Chargement, EtatErreur, LienHote, Pastille, Section } from "./composants.js";
import { lireConnexionsNatives, lignesServices, SERVICES_PASSERELLE, type LigneService } from "./connexions-natives.js";
import type { Ton } from "./format.js";
import { chemin } from "./route.js";
import { appelRoute } from "./routes-prospection.js";

export const ANCRE_PASSAGE_AU_REEL = "param-reel";
/** Adresse de la section depuis une autre vue (l'accueil). */
export const LIEN_PASSAGE_AU_REEL = `${chemin("parametres")}#${ANCRE_PASSAGE_AU_REEL}`;

export const LIBELLES_ETAT: Readonly<Record<EtatBranchement, { libelle: string; ton: Ton }>> = {
  reel: { libelle: "Branché en réel", ton: "succes" },
  demonstration: { libelle: "En démonstration", ton: "demo" },
  configure_non_verifie: { libelle: "Configuré, non vérifié", ton: "neutre" },
  en_attente_acces: { libelle: "En attente d'accès", ton: "attention" },
  a_fournir_client: { libelle: "À fournir par le client", ton: "attention" },
  non_branche: { libelle: "Non branché", ton: "neutre" },
};

export const LIBELLES_ACTEUR: Readonly<Record<ActeurBranchement, string>> = {
  client: "Le client",
  acces_officiel: "Un accès officiel à obtenir",
  nous: "Nous",
};

/** Du plus faible au plus fort : un regroupement prend l'état de son maillon le plus faible. */
const ORDRE_ETAT: readonly EtatBranchement[] = ["non_branche", "a_fournir_client", "en_attente_acces", "demonstration", "configure_non_verifie", "reel"];

/** États de connexion d'un service de la passerelle, traduits en état de branchement. */
function etatDeConnexion(e: EtatConnexion): EtatBranchement {
  switch (e) {
    case "reel_teste":
      return "reel";
    case "configure_non_verifie":
      // Configuré mais jamais prouvé par un appel réel : ce n'est pas « réel », et il reste à faire.
      return "configure_non_verifie";
    case "demonstration":
      return "demonstration";
    default:
      return "non_branche";
  }
}

const NOMS_SERVICES: Readonly<Record<string, string>> = Object.fromEntries(SERVICES_PASSERELLE.map((s) => [s.cle, s.nom]));

/** Ligne regroupant plusieurs services de la passerelle : l'état le plus faible, le détail service par service. */
function ligneRegroupee(meta: (typeof BRANCHEMENTS_INTERFACE)[number], lignes: readonly LigneService[] | null, motif: string | null, date: string): Branchement {
  const base: Omit<Branchement, "etat" | "preuve" | "detail"> = { cle: meta.cle, nom: meta.nom, acteur: meta.acteur, debloque: { criteres: [], fonctions: [...meta.fonctions] }, leadsConcernes: null, verifieLe: date };
  if (lignes === null) return { ...base, etat: "non_branche", preuve: "aucune", detail: `Connexions de l'entreprise illisibles : ${motif ?? "erreur inconnue"}.` };
  const pris = lignes.filter((l) => meta.services.includes(l.cle));
  const etats = pris.map((l) => etatDeConnexion(l.etat));
  const etat = ORDRE_ETAT.find((e) => etats.includes(e)) ?? "non_branche";
  const groupe = (e: EtatBranchement) => pris.filter((l) => etatDeConnexion(l.etat) === e).map((l) => NOMS_SERVICES[l.cle] ?? l.nom);
  const morceaux = ORDRE_ETAT.flatMap((e) => (groupe(e).length > 0 ? [`${LIBELLES_ETAT[e].libelle} : ${groupe(e).join(", ")}`] : []));
  return { ...base, etat, preuve: etat === "configure_non_verifie" ? "declare" : "mesure", detail: morceaux.join(" ; ") };
}

/** Les branchements du serveur et les deux lignes de l'interface, dans l'ordre de `CleBranchement`. */
export function fusionnerBranchements(serveur: readonly Branchement[], lignes: readonly LigneService[] | null, motif: string | null, date: string): Branchement[] {
  const ajoutes = BRANCHEMENTS_INTERFACE.map((m) => ligneRegroupee(m, lignes, motif, date));
  const ordre = CleBranchement.options;
  return [...serveur, ...ajoutes].sort((a, b) => ordre.indexOf(a.cle) - ordre.indexOf(b.cle));
}

/** Branchements qui ne sont pas encore en réel. */
export const branchementsManquants = (b: readonly Branchement[]): Branchement[] => b.filter((x) => x.etat !== "reel");

export type LectureRealite = { etat: "chargement" } | { etat: "erreur"; erreur: unknown } | { etat: "pret"; realite: RealiteEtat; branchements: Branchement[] };

/** Lit l'état serveur et les connexions natives à l'ouverture ; `relire` les lit de nouveau. */
export function useRealite(): [LectureRealite, () => void] {
  const { companyId } = useHostContext();
  const [etat, setEtat] = useState<LectureRealite>({ etat: "chargement" });
  const charger = useCallback(async () => {
    if (!companyId) return;
    try {
      const [brut, connexions] = await Promise.all([
        appelRoute<unknown>("GET", `/realite?companyId=${encodeURIComponent(companyId)}`),
        lireConnexionsNatives(companyId).then(
          (c) => ({ lignes: lignesServices(c), motif: null as string | null }),
          (err: unknown) => ({ lignes: null, motif: (err as { message?: string } | null)?.message ?? "erreur inconnue" }),
        ),
      ]);
      // Un worker plus ancien que cette vue répond autrement : on le dit au lieu d'afficher des trous.
      const lue = RealiteEtat.safeParse(brut);
      if (!lue.success) throw { code: "FORME_INCONNUE", message: "Réponse inattendue de la route « realite.etat » : le worker du plugin n'est peut-être pas à jour." };
      const realite = lue.data;
      setEtat({ etat: "pret", realite, branchements: fusionnerBranchements(realite.branchements, connexions.lignes, connexions.motif, realite.verifieLe) });
    } catch (erreur) {
      setEtat({ etat: "erreur", erreur });
    }
  }, [companyId]);
  // Lecture à l'ouverture seulement : le tableau des connecteurs relit déjà au retour sur l'onglet, la section a son bouton « Actualiser ».
  useEffect(() => {
    void charger();
  }, [charger]);
  return [etat, () => void charger()];
}

/** Branchements nommés dans l'encart de l'accueil ; le détail est dans Paramètres. */
const NOMS_AFFICHES = 4;

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n === 1 ? un : plusieurs}`;

function TableauBranchements({ branchements }: { branchements: readonly Branchement[] }) {
  return (
    <div className="atl-table-cadre">
      <table className="atl-table atl-table-realite">
        <caption className="atl-sr">Branchements nécessaires pour passer au réel : état, ce qu'ils débloquent, qui doit agir, leads concernés</caption>
        <thead>
          <tr>
            <th scope="col">Branchement</th>
            <th scope="col">État</th>
            <th scope="col">Ce que cela débloque</th>
            <th scope="col">Qui doit agir</th>
            <th scope="col" className="atl-num">
              Leads concernés
            </th>
          </tr>
        </thead>
        <tbody>
          {branchements.map((b) => {
            const e = LIBELLES_ETAT[b.etat];
            return (
              <tr key={b.cle} data-branchement={b.cle}>
                <th scope="row">{b.nom}</th>
                <td data-libelle="État">
                  <Pastille ton={e.ton} titre={b.etat === "configure_non_verifie" ? "Présent dans la configuration, jamais prouvé par un appel réel" : undefined}>
                    {e.libelle}
                  </Pastille>
                  <span className="atl-sous">{b.detail}</span>
                </td>
                <td data-libelle="Débloque">
                  {b.debloque.fonctions.join(". ")}.
                  {b.debloque.criteres.length > 0 ? <span className="atl-sous">Critères des leads : {b.debloque.criteres.map((c) => c.libelle).join(", ")}</span> : null}
                </td>
                <td data-libelle="Qui agit">{LIBELLES_ACTEUR[b.acteur]}</td>
                <td data-libelle="Leads" className="atl-num">
                  {b.leadsConcernes === null ? (
                    <span className="atl-attenue" aria-label="non calculable">
                      <span aria-hidden="true">–</span>
                    </span>
                  ) : (
                    b.leadsConcernes
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Contenu({ realite, branchements }: { realite: RealiteEtat; branchements: Branchement[] }) {
  const manquants = branchementsManquants(branchements);
  return (
    <>
      <p className="atl-encart-titre" role="status">
        Ce qui manque pour le réel : {pluriel(manquants.length, "branchement", "branchements")} sur {branchements.length}.
      </p>
      <TableauBranchements branchements={branchements} />
      <h3 className="atl-h3">Ce que les leads attendent</h3>
      {realite.leads.analyses === 0 ? (
        <p className="atl-vide-texte">Aucun lead à qualifier pour l'instant.</p>
      ) : realite.synthese.length === 0 ? (
        <p className="atl-vide-texte">Tous les critères des {realite.leads.analyses} leads sont vérifiés.</p>
      ) : (
        <ul className="atl-liste">
          {realite.synthese.map((s) => (
            <li key={s.code}>{s.phrase}</li>
          ))}
        </ul>
      )}
      <p className="atl-sous">
        {pluriel(realite.leads.analyses, "lead analysé", "leads analysés")}
        {realite.leads.tronque ? " (parcours arrêté au plafond : les nombres sont des minimums)" : ""}
        {realite.leads.illisibles > 0 ? ` ; ${pluriel(realite.leads.illisibles, "lead illisible ignoré", "leads illisibles ignorés")}` : ""}.
      </p>
    </>
  );
}

/**
 * Récapitulatif du passage au réel pour le parcours de mise en place : ce qui manque, branchement par
 * branchement, sans le tableau complet (qui reste dans l'onglet « Passage au réel »). La lecture est
 * faite par l'appelant (`useRealite`) pour que l'état de l'étape et son contenu viennent de la même source.
 */
export function RecapPassageAuReel({ lecture, relire }: { lecture: LectureRealite; relire: () => void }) {
  if (lecture.etat === "chargement") return <Chargement libelle="Chargement du passage au réel" />;
  if (lecture.etat === "erreur") return <EtatErreur erreur={lecture.erreur} onReessayer={relire} contexte="le passage au réel" />;
  const manquants = branchementsManquants(lecture.branchements);
  return (
    <>
      <p className="atl-encart-titre" role="status">
        {manquants.length === 0 ? "Tous les branchements sont en réel." : `Ce qui manque pour le réel : ${pluriel(manquants.length, "branchement", "branchements")} sur ${lecture.branchements.length}.`}
      </p>
      {manquants.length > 0 ? (
        <ul className="atl-liste">
          {manquants.map((b) => (
            <li key={b.cle} data-branchement={b.cle}>
              <strong>{b.nom}</strong> : {LIBELLES_ETAT[b.etat].libelle}. {b.detail}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** Section de tête de la vue Paramètres. */
export function SectionPassageAuReel() {
  const [lecture, relire] = useRealite();
  // Arrivée depuis l'accueil : la section est en tête, mais on y amène aussi le regard si l'adresse la vise.
  useEffect(() => {
    if (window.location.hash !== `#${ANCRE_PASSAGE_AU_REEL}`) return;
    document.getElementById(ANCRE_PASSAGE_AU_REEL)?.scrollIntoView?.();
  }, []);
  return (
    <Section titre="Passage au réel" ancre={ANCRE_PASSAGE_AU_REEL} repliable aide="Ce qu'il faut encore brancher pour que l'entreprise travaille sur la réalité plutôt que sur la démonstration : où on en est, ce que cela débloque, et qui doit agir.">
      {lecture.etat === "chargement" ? <Chargement libelle="Chargement du passage au réel" /> : null}
      {lecture.etat === "erreur" ? <EtatErreur erreur={lecture.erreur} onReessayer={relire} contexte="le passage au réel" /> : null}
      {lecture.etat === "pret" ? <Contenu realite={lecture.realite} branchements={lecture.branchements} /> : null}
      {lecture.etat === "pret" ? (
        <button type="button" className="atl-bouton" onClick={relire}>
          Actualiser le passage au réel
        </button>
      ) : null}
    </Section>
  );
}

/** Encart d'accueil : combien de branchements manquent, avec le lien vers la section. */
export function EncartPassageAuReel() {
  const [lecture] = useRealite();
  if (lecture.etat === "chargement") return null;
  const lien = (
    <LienHote vers={LIEN_PASSAGE_AU_REEL} className="atl-bouton">
      Voir le passage au réel
    </LienHote>
  );
  if (lecture.etat === "erreur") {
    return (
      <Section titre="Passage au réel" id="accueil-reel">
        <p className="atl-vide-texte">L'état des branchements n'a pas pu être lu.</p>
        {lien}
      </Section>
    );
  }
  const manquants = branchementsManquants(lecture.branchements);
  return (
    <Section titre="Passage au réel" id="accueil-reel">
      <div className="atl-encart" data-ton={manquants.length > 0 ? "attention" : undefined}>
        <p className="atl-encart-titre">
          {manquants.length > 0 ? `Ce qui manque pour le réel : ${pluriel(manquants.length, "branchement", "branchements")}` : "Tous les branchements sont en réel."}
        </p>
        {manquants.length > 0 ? (
          <p className="atl-vide-texte">
            {manquants.slice(0, NOMS_AFFICHES).map((b) => b.nom).join(" ; ")}
            {manquants.length > NOMS_AFFICHES ? ` ; et ${manquants.length - NOMS_AFFICHES} autres` : ""}.
          </p>
        ) : null}
        {lien}
      </div>
    </Section>
  );
}
