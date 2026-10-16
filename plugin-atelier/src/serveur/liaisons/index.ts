/** Bureau de liaison : routes `liaison.demander`, `liaison.decider` et `services.declarer`, retour de la réponse. */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { CleRouteApi } from "../../contrats/index.js";
import type { GestionnaireRoute } from "../atelier.js";
import { routeDecider } from "./decider.js";
import { routeDeclarer } from "./declarer.js";
import { routeDemander } from "./demander.js";
import { lectureLiaisonsParesseuse, type LectureLiaisons } from "./lecture-liaisons.js";
import { routeLire } from "./lire.js";
import { routeRegistre } from "./registre.js";
import { creerStockLiaisons, type StockLiaisons } from "./base-liaisons.js";
import type { DependancesLiaisons } from "./transmission.js";

export { ORIGINE_LIAISON, cleLiaison, descriptionLiaison, type DependancesLiaisons } from "./transmission.js";
export { creerStockLiaisons, type StockLiaisons } from "./base-liaisons.js";
export { creerRetour, borner, type EvenementIssue } from "./retour.js";
export { creerFacteur, FACTEUR } from "./facteur.js";

/** Stock à création différée : le contexte des tests n'a pas toujours de base, l'accès échoue alors proprement. */
export function stockLiaisonsParesseux(ctx: PluginContext): StockLiaisons {
  let reel: StockLiaisons | null = null;
  const p = (): StockLiaisons => (reel ??= creerStockLiaisons(ctx.db));
  return {
    serviceDeEntreprise: (c) => p().serviceDeEntreprise(c), servicesParSlug: (s) => p().servicesParSlug(s),
    lireFlux: (c, s, t) => p().lireFlux(c, s, t), declarer: (x) => p().declarer(x), lireParCle: (c, k) => p().lireParCle(c, k),
    compterOuvertes: (c) => p().compterOuvertes(c), estTacheDeLiaison: (c, i) => p().estTacheDeLiaison(c, i),
    inserer: (l) => p().inserer(l), lireParId: (c, i) => p().lireParId(c, i), lireParTacheCible: (c, t) => p().lireParTacheCible(c, t),
    listerEnAttente: (c, n) => p().listerEnAttente(c, n), transiter: (c, i, d, v) => p().transiter(c, i, d, v), attacher: (c, i, x) => p().attacher(c, i, x),
    listerATransmettre: (n, m) => p().listerATransmettre(n, m), listerANotifier: (n, m) => p().listerANotifier(n, m),
    reserverEssai: (c, i, a, m) => p().reserverEssai(c, i, a, m), noterErreurFacteur: (c, i, e) => p().noterErreurFacteur(c, i, e),
    marquerNotifiee: (c, i) => p().marquerNotifiee(c, i), relancerFacteur: (c, i) => p().relancerFacteur(c, i),
  };
}

/** Liaisons de l'entreprise source qui attendent une décision, au format de l'Accueil (contenu complet). */
export const liaisonsPourAccueil = (stock: StockLiaisons) => async (companyId: string) =>
  (await stock.listerEnAttente(companyId, 20)).map((l) => ({
    liaisonId: l.id, serviceSource: l.serviceSource, serviceCible: l.serviceCible, objet: l.objet, question: l.question, extraits: l.extraits, tacheOrigine: l.tacheOrigine,
  }));

export function routesLiaisons(d: Omit<DependancesLiaisons, "stock"> & { stock?: DependancesLiaisons["stock"]; /** Tests : lectures de l'onglet Échanges et du registre en mémoire. */ lecture?: LectureLiaisons }): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const stock: StockLiaisons = d.stock ?? stockLiaisonsParesseux(d.ctx);
  const lecture = d.lecture ?? lectureLiaisonsParesseuse(d.ctx);
  return { ...routeDemander({ ...d, stock }), ...routeDecider({ ...d, stock }), ...routeDeclarer({ base: d.base, stock }), ...routeLire({ ctx: d.ctx, lecture }), ...routeRegistre({ stock, lecture }) };
}
