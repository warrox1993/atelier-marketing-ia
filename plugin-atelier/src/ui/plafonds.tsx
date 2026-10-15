/**
 * Plafond de dépenses publicitaires dans l'interface (décision de l'opérateur du 15/10/2026) :
 * choix « Montant maximal (€) » ou « Aucune limite », avertissement quand il n'y a plus
 * de garde-fou global, et affichage des montants engagés face à la limite.
 * Composants existants réutilisés (fieldset `atl-choix`, encart `atl-encart`, champ).
 */
import { useId } from "react";
import type { EngagementPub, PlafondEntree, PlafondPub } from "../contrats/plafonds.js";
import { Champ } from "./composants.js";
import { centimesDepuisSaisie, euros } from "./format.js";

/** État du formulaire : `inchange` = aucun choix (ou retrait du choix). */
export interface SaisiePlafond {
  mode: "aucun" | "montant" | "aucune_limite";
  /** Montant en euros, tel que saisi. */
  montant: string;
}

export const SAISIE_PLAFOND_VIDE: SaisiePlafond = { mode: "aucun", montant: "" };

export function saisieDepuisPlafond(p: PlafondPub | null): SaisiePlafond {
  if (p === null) return SAISIE_PLAFOND_VIDE;
  return p.type === "montant" ? { mode: "montant", montant: String(p.montantCents / 100).replace(".", ",") } : { mode: "aucune_limite", montant: "" };
}

/** Choix à envoyer : `null` (aucun choix) ou le plafond ; `raison` non nulle si la saisie est invalide. */
export function plafondDepuisSaisie(s: SaisiePlafond): { plafond: PlafondEntree | null; raison: string | null } {
  if (s.mode === "aucun") return { plafond: null, raison: null };
  if (s.mode === "aucune_limite") return { plafond: { type: "aucune_limite" }, raison: null };
  const cents = centimesDepuisSaisie(s.montant);
  if (cents === null || Number.isNaN(cents) || cents <= 0) return { plafond: null, raison: "Plafond publicitaire : saisir un montant en euros supérieur à 0 (exemple : 1500 ou 1500,50)." };
  return { plafond: { type: "montant", montantCents: cents }, raison: null };
}

/** Le plafond saisi est-il différent de celui qui est enregistré ? */
export function plafondModifie(saisie: SaisiePlafond, actuel: PlafondPub | null): boolean {
  const a = saisieDepuisPlafond(actuel);
  if (a.mode !== saisie.mode) return true;
  if (saisie.mode !== "montant") return false;
  return centimesDepuisSaisie(a.montant) !== centimesDepuisSaisie(saisie.montant);
}

export function ChoixPlafond({
  legende,
  valeur,
  onChange,
  libelleAucunChoix,
  aideAucunChoix,
  sansAucunChoix = false,
  avertissement,
  enregistre,
}: {
  legende: string;
  valeur: SaisiePlafond;
  onChange(v: SaisiePlafond): void;
  libelleAucunChoix: string;
  aideAucunChoix: string;
  /** Pas de troisième option « aucun choix » (budgets IA natifs : 0 = aucune limite). */
  sansAucunChoix?: boolean;
  /** Texte de l'avertissement « aucune limite » si différent de celui des dépenses publicitaires. */
  avertissement?: string;
  /**
   * Choix déjà enregistré. L'avertissement « plus de garde-fou » ne s'affiche que lorsque le choix
   * le retire : un état déjà enregistré est un état, pas une alerte (sinon il se répète sur chaque ligne).
   */
  enregistre?: SaisiePlafond["mode"];
}) {
  const nom = useId();
  const idAvertissement = useId();
  const { raison } = plafondDepuisSaisie(valeur);
  const avertir = valeur.mode === "aucune_limite" && enregistre !== "aucune_limite";
  return (
    <fieldset className="atl-champ atl-choix atl-plafond">
      <legend>{legende}</legend>
      {sansAucunChoix ? null : (
        <label>
          <input type="radio" name={nom} checked={valeur.mode === "aucun"} onChange={() => onChange({ ...valeur, mode: "aucun" })} /> {libelleAucunChoix}
          <span className="atl-aide">{aideAucunChoix}</span>
        </label>
      )}
      <label>
        <input type="radio" name={nom} checked={valeur.mode === "montant"} onChange={() => onChange({ ...valeur, mode: "montant" })} /> Montant maximal (€)
      </label>
      {valeur.mode === "montant" ? (
        <Champ libelle="Montant maximal en euros" className="atl-champ-etroit">
          <input
            value={valeur.montant}
            onChange={(e) => onChange({ ...valeur, montant: e.target.value })}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={raison ? true : undefined}
          />
        </Champ>
      ) : null}
      <label>
        <input
          type="radio"
          name={nom}
          checked={valeur.mode === "aucune_limite"}
          onChange={() => onChange({ ...valeur, mode: "aucune_limite" })}
          aria-describedby={avertir ? idAvertissement : undefined}
        />{" "}
        Aucune limite
      </label>
      {avertir ? (
        <div className="atl-encart" data-ton="attention" role="note" id={idAvertissement}>
          <p className="atl-encart-titre">{avertissement ? "Plus de garde-fou sur les coûts IA" : "Plus de garde-fou global sur les dépenses publicitaires"}</p>
          <p>
            {avertissement ?? "Chaque dépense reste soumise à une approbation humaine (montant, canal et durée précis), refusée par le serveur sinon. Aucun plafond ne limitera le total engagé."}
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}

/** « 1 500,00 € maximum », « Aucune limite » ou « Aucun choix ». */
export function libellePlafond(p: PlafondPub | null): string {
  if (p === null) return "Aucun choix";
  return p.type === "montant" ? `${euros(p.montantCents)} maximum` : "Aucune limite";
}

/** Montants engagés face à la limite, ou « sans limite ». */
export function EngagementFaceLimite({ plafond, engagement }: { plafond: PlafondPub | null; engagement: EngagementPub }) {
  const engage = euros(engagement.engageCents);
  const detail = `${euros(engagement.diffuseCents)} diffusés, ${euros(engagement.reserveCents)} réservés par des approbations`;
  if (!engagement.choisi) {
    return (
      <p>
        {engage} engagés. <span className="atl-attenue">Aucun plafond choisi : toute dépense est refusée par le serveur.</span>
      </p>
    );
  }
  if (plafond?.type === "aucune_limite" || engagement.limiteCents === null) {
    return (
      <p>
        {engage} engagés, <strong>sans limite</strong>. <span className="atl-sous">{detail}.</span>
      </p>
    );
  }
  return (
    <p>
      {engage} engagés sur {euros(engagement.limiteCents)}. <span className="atl-sous">{detail}.</span>
    </p>
  );
}
