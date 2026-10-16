/**
 * Route `services.declarer` (humain seulement) : écrit quelle entreprise est quel service d'un client, et la
 * matrice des flux autorisés (copie validée du registre des services, `organisation/registre/services.json`).
 * Le bootstrap prendra le relais plus tard. L'entreprise de la route doit figurer parmi celles déclarées, et une
 * entreprise déjà déclarée pour un autre client ne peut pas être reprise (le cloisonnement par client tient).
 * `lireServicesDeclares` est la fonction de lecture : service d'une entreprise et services de son client.
 */
import { DeclarerServicesEntree, type CleRouteApi } from "../../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "../atelier.js";
import { erreur, erreurValidation } from "../erreurs.js";
import type { DependancesLiaisons } from "./demander.js";
import type { ServiceEntreprise, StockLiaisons } from "./base-liaisons.js";

const exigerHumain = (acteur: ActeurHote) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", "La déclaration des services est réservée à un humain.");
};

/** Lecture : service de l'entreprise, ou null si elle n'est pas déclarée. */
export const lireServiceDeclare = (stock: StockLiaisons, companyId: string): Promise<ServiceEntreprise | null> => stock.serviceDeEntreprise(companyId);

export function routeDeclarer(d: Pick<DependancesLiaisons, "base" | "stock">): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { base, stock } = d;
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};
  routes["services.declarer"] = async (r) => {
    exigerHumain(r.acteur);
    const p = DeclarerServicesEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Déclaration des services", p.error.issues);
    const e = p.data!;
    const ids = e.entreprises.map((x) => x.companyId.toLowerCase());
    if (!ids.includes(r.companyId.toLowerCase()) || e.companyId.toLowerCase() !== r.companyId.toLowerCase()) {
      erreur("hors_entreprise", "L'entreprise de la route doit être l'une des entreprises déclarées.");
    }
    if (new Set(ids).size !== ids.length) erreur("entree_invalide", "Une entreprise est déclarée deux fois.");
    const slugs = e.entreprises.map((x) => x.serviceSlug);
    if (new Set(slugs).size !== slugs.length) erreur("entree_invalide", "Un service est déclaré deux fois.");
    if (e.entreprises.filter((x) => x.estDirection).length > 1) erreur("entree_invalide", "Il ne peut y avoir qu'une seule entreprise Direction.");
    const connus = new Set(slugs);
    const paires = new Set<string>();
    for (const f of e.flux) {
      if (!connus.has(f.source) || !connus.has(f.cible)) erreur("entree_invalide", `Flux ${f.source} vers ${f.cible} : un des services n'est pas déclaré.`);
      if (f.source === f.cible) erreur("entree_invalide", `Flux ${f.source} vers lui-même interdit.`);
      if (paires.has(`${f.source}>${f.cible}`)) erreur("entree_invalide", `Flux ${f.source} vers ${f.cible} déclaré deux fois.`);
      paires.add(`${f.source}>${f.cible}`);
    }
    for (const x of e.entreprises) {
      const deja = await stock.serviceDeEntreprise(x.companyId);
      if (deja && deja.clientMarqueur !== e.clientMarqueur) erreur("conflit", `L'entreprise ${x.companyId} est déjà déclarée pour un autre client.`);
    }
    await stock.declarer({ clientMarqueur: e.clientMarqueur, entreprises: e.entreprises, flux: e.flux, par: r.acteur.id });
    await base.journaliser({
      companyId: r.companyId, type: "services.declares", entite: "entreprise", entiteId: r.companyId, acteur: r.acteur.id,
      donnees: { clientMarqueur: e.clientMarqueur, entreprises: e.entreprises.length, flux: e.flux.length },
    });
    return { corps: { clientMarqueur: e.clientMarqueur, entreprises: e.entreprises.length, flux: e.flux.length } };
  };
  return routes;
}
