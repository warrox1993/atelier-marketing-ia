/**
 * Synthèse en tête de la rubrique Marketing : quelques chiffres lus par les routes existantes, chacun lien vers son
 * écran, et la prochaine action la plus urgente. Jamais de chiffre inventé : une source illisible s'écrit « non mesuré »
 * (même règle que le rapport du mois).
 *
 * Sources : rapport mensuel du mois courant (campagnes actives, prospects trouvés et qualifiés, coût de l'IA),
 * `atelier.contenus-a-valider` (contenus qui attendent la validation humaine), état des connexions de la page « Mise en place » (`useRealite`).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import { RapportMensuel } from "../../contrats/rapport.js";
import type { VueContenusAValider } from "../../contrats/ui.js";
import { LienHote } from "../composants.js";
import { cheminDemandeModele } from "../demande.js";
import { useDonnees } from "../donnees.js";
import { euros, nombre } from "../format.js";
import { branchementsManquants, LIEN_PASSAGE_AU_REEL, useRealite } from "../realite.js";
import { appelRoute } from "../routes-prospection.js";
import { chemin } from "../route.js";
import { moisProposes } from "../vues/rapport.js";

/** `chargement` tant qu'on lit ; `null` : non mesuré (source absente ou illisible) ; sinon la valeur. */
type Mesure<T> = "chargement" | null | T;

interface ChiffresRapport {
  campagnesActives: number | null;
  prospectsTrouves: number | null;
  prospectsQualifies: number | null;
  /** Coût de l'IA du mois en centimes ; null s'il n'y a aucune ligne de coût (rien à mesurer). */
  coutCentimes: number | null;
}

/** Valeur d'un chiffre du rapport par sa clé ; null si la donnée est absente ou non mesurée. */
function valeurChiffre(liste: ReadonlyArray<{ cle: string; valeur: number | null }>, cle: string): number | null {
  return liste.find((c) => c.cle === cle)?.valeur ?? null;
}

export function chiffresDepuisRapport(r: RapportMensuel): ChiffresRapport {
  return {
    campagnesActives: valeurChiffre(r.campagnes, "campagnes_actives"),
    prospectsTrouves: valeurChiffre(r.prospects.chiffres, "prospects_trouves_reel"),
    prospectsQualifies: valeurChiffre(r.prospects.badges, "prospects_qualifies"),
    coutCentimes: r.coutsIa.lignes.length > 0 ? r.coutsIa.total.coutCentimes : null,
  };
}

function useRapportDuMois(): Mesure<ChiffresRapport> {
  const { companyId } = useHostContext();
  const mois = useMemo(() => moisProposes()[0]!, []);
  const [etat, setEtat] = useState<Mesure<ChiffresRapport>>("chargement");
  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    appelRoute<unknown>("GET", `/rapport/mensuel?companyId=${encodeURIComponent(companyId)}&mois=${encodeURIComponent(mois)}`).then(
      (brut) => {
        const lu = RapportMensuel.safeParse(brut);
        if (!annule) setEtat(lu.success ? chiffresDepuisRapport(lu.data) : null);
      },
      () => {
        if (!annule) setEtat(null);
      },
    );
    return () => {
      annule = true;
    };
  }, [companyId, mois]);
  return etat;
}

/** Connexions à établir, comptées comme sur la page « Mise en place » ; null si l'état n'est pas lisible. */
function useConnexionsManquantes(): Mesure<number> {
  const [lecture] = useRealite();
  if (lecture.etat === "chargement") return "chargement";
  return lecture.etat === "erreur" ? null : branchementsManquants(lecture.branchements).length;
}

function Chiffre({ vers, libelle, valeur, precision }: { vers: string; libelle: string; valeur: Mesure<string>; precision?: string | null }) {
  const nonMesure = valeur === null;
  return (
    <li>
      <LienHote vers={vers} className="atl-synthese-lien">
        <span className="atl-synthese-valeur" data-non-mesure={nonMesure || undefined} aria-busy={valeur === "chargement" || undefined}>
          {valeur === "chargement" ? "…" : nonMesure ? "non mesuré" : valeur}
          {precision ? <small> {precision}</small> : null}
        </span>
        <span className="atl-synthese-libelle">{libelle}</span>
      </LienHote>
    </li>
  );
}

const enTexte = (v: Mesure<number>): Mesure<string> => (v === "chargement" || v === null ? v : nombre(v));

export function SyntheseMarketing() {
  const rapport = useRapportDuMois();
  const connexions = useConnexionsManquantes();
  const contenus = useDonnees<VueContenusAValider>("atelier.contenus-a-valider");
  const aValider: Mesure<number> = contenus.data ? contenus.data.prets.length : contenus.error ? null : "chargement";

  const r = rapport === "chargement" || rapport === null ? null : rapport;
  const deRapport = (choisir: (c: ChiffresRapport) => number | null): Mesure<number> => (rapport === "chargement" ? "chargement" : r ? choisir(r) : null);
  const trouves = deRapport((c) => c.prospectsTrouves);
  const qualifies = deRapport((c) => c.prospectsQualifies);
  const actives = deRapport((c) => c.campagnesActives);
  const cout: Mesure<string> = rapport === "chargement" ? "chargement" : r && r.coutCentimes !== null ? euros(r.coutCentimes) : null;

  // Prochaine action : contenu à valider, puis connexion manquante, puis lancement d'une campagne par le chat.
  let action: ReactNode;
  if (typeof aValider === "number" && aValider > 0) {
    action = <LienHote vers={chemin("contenus")}>{`Valider ${aValider} contenu${aValider > 1 ? "s" : ""} qui attend${aValider > 1 ? "ent" : ""} votre accord`}</LienHote>;
  } else if (typeof connexions === "number" && connexions > 0) {
    action = <LienHote vers={LIEN_PASSAGE_AU_REEL}>{`Brancher ${connexions} connexion${connexions > 1 ? "s" : ""} manquante${connexions > 1 ? "s" : ""}`}</LienHote>;
  } else if (aValider === "chargement" || connexions === "chargement") {
    action = null;
  } else {
    action = <LienHote vers={cheminDemandeModele("Campagne Google Ads")}>{actives === 0 || actives === null ? "Lancer une première campagne en la demandant au Coordinateur" : "Lancer une nouvelle campagne en la demandant au Coordinateur"}</LienHote>;
  }

  return (
    <section className="atl-synthese" aria-label="Synthèse du mois">
      <ul className="atl-synthese-liste">
        <Chiffre vers={chemin("prospects")} libelle="prospects trouvés ce mois" valeur={enTexte(trouves)} precision={typeof qualifies === "number" ? `dont ${nombre(qualifies)} qualifiés` : null} />
        <Chiffre vers={chemin("contenus")} libelle="contenus à valider" valeur={enTexte(aValider)} />
        <Chiffre vers={chemin("campagnes")} libelle="campagnes actives" valeur={enTexte(actives)} />
        <Chiffre vers={chemin("rapport")} libelle="coût de l'IA ce mois" valeur={cout} />
        <Chiffre vers={LIEN_PASSAGE_AU_REEL} libelle="connexions manquantes" valeur={enTexte(connexions)} />
      </ul>
      {action ? (
        <p className="atl-synthese-action">
          <strong>Prochaine action :</strong> {action}
        </p>
      ) : null}
    </section>
  );
}
