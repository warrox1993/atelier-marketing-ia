/**
 * Page d'ensemble du client : « Départements » (grille des services) et « Organigramme » réunis sous une bascule
 * segmentée en tête. Les deux adresses restent valides : `atelier/departements` s'ouvre sur la grille et
 * `atelier/organigramme` sur l'organigramme.
 *
 * - Adresse : l'ancre porte la vue (`#vue=departements` ou `#vue=organigramme`). Les ancres de l'organigramme restent
 *   valides : tout lien avec `service=` ou `vue=matrice` ou `vue=carte` ouvre l'organigramme.
 * - Le contenu est celui des vues existantes, réutilisées telles quelles.
 */
import type { CleVue } from "../route.js";
import { useAncre } from "../onglets.js";
import { STYLES_ENSEMBLE } from "../styles-ensemble.js";
import { VueDepartements } from "./departements.js";
import { VueOrganigramme } from "./organigramme.js";

export type VueEnsemble = "departements" | "organigramme";

/** Vue à afficher : l'ancre prime, sinon la vue de l'adresse de la page. */
export function vueEnsemble(ancre: string, vueAdresse: CleVue): VueEnsemble {
  const p = new URLSearchParams(ancre);
  const vue = p.get("vue");
  if (vue === "departements") return "departements";
  if (p.get("service") || vue === "matrice" || vue === "carte" || vue === "organigramme") return "organigramme";
  return vueAdresse === "organigramme" ? "organigramme" : "departements";
}

const CHOIX: ReadonlyArray<{ cle: VueEnsemble; libelle: string; ancre: string }> = [
  { cle: "departements", libelle: "Départements", ancre: "vue=departements" },
  { cle: "organigramme", libelle: "Organigramme", ancre: "vue=carte" },
];

export function VueEnsembleClient({ vueAdresse }: { vueAdresse: CleVue }) {
  const ancre = useAncre();
  const actuelle = vueEnsemble(ancre, vueAdresse);
  return (
    <>
      <style href="atelier-ensemble" precedence="default">
        {STYLES_ENSEMBLE}
      </style>
      <div className="atl-bascule" role="group" aria-label="Vue d'ensemble du client">
        {CHOIX.map((c) => (
          <button
            key={c.cle}
            type="button"
            className="atl-bascule-bouton"
            aria-pressed={actuelle === c.cle}
            onClick={() => {
              if (actuelle !== c.cle) window.location.hash = c.ancre;
            }}
          >
            {c.libelle}
          </button>
        ))}
      </div>
      {actuelle === "organigramme" ? <VueOrganigramme /> : <VueDepartements />}
    </>
  );
}
