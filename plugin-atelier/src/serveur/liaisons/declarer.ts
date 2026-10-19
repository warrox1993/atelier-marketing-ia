/**
 * Route `services.declarer` (humain seulement) : écrit quelle entreprise est quel service d'un client, et la
 * matrice des flux autorisés (copie validée du registre des services, `organisation/registre/services.json`).
 * Le bootstrap prendra le relais plus tard. L'entreprise de la route doit figurer parmi celles déclarées, et une
 * entreprise déjà déclarée pour un autre client ne peut pas être reprise (le cloisonnement par client tient). La Direction
 * déclarée est l'entreprise de la route ou une entreprise déjà déclarée pour ce client (M1 : la base commune).
 * Déclaration en deux temps (revue du 19/10/2026, E1) : l'hôte ne prouve l'accès de l'humain qu'à l'entreprise de la
 * route. Une autre entreprise, pas encore membre confirmée du client, est enregistrée « à confirmer » et ignorée de tous
 * les lecteurs jusqu'à `services.confirmer`, appelée avec SON companyId (l'hôte en prouve alors l'accès). Un client qui a
 * déjà une Direction ne peut être redéclaré que depuis cette Direction (E2).
 * `lireServicesDeclares` est la fonction de lecture : service d'une entreprise et services de son client.
 */
import { ConfirmerServiceEntree, DeclarerServicesEntree, origineDepuisObjet, type CleRouteApi } from "../../contrats/index.js";
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
    // Un marqueur de client déjà connu ne peut être redéclaré que depuis une entreprise qui en fait déjà partie :
    // sinon une entreprise étrangère s'y glisserait et lirait le registre des autres (revue de sécurité F5).
    const propre = await stock.serviceDeEntreprise(r.companyId);
    if (!propre && (await stock.clientExiste(e.clientMarqueur))) {
      erreur("acces_refuse", "Ce client existe déjà : seule une de ses entreprises peut le redéclarer.");
    }
    for (const x of e.entreprises) {
      const deja = await stock.serviceDeEntreprise(x.companyId);
      if (deja && deja.clientMarqueur !== e.clientMarqueur) erreur("conflit", `L'entreprise ${x.companyId} est déjà déclarée pour un autre client.`);
    }
    // E2 (revue du 19/10/2026) : un client qui a déjà une Direction ne se redéclare que depuis elle. Sinon un membre d'un
    // seul service (RH, par exemple) se déclarerait Direction et lirait toute la synthèse du client.
    const existants = await stock.servicesDuClient(e.clientMarqueur);
    const directionExistante = existants.find((s) => s.estDirection);
    if (directionExistante && directionExistante.companyId.toLowerCase() !== r.companyId.toLowerCase()) {
      erreur("acces_refuse", "Ce client a déjà une Direction : seule la Direction peut le redéclarer.");
    }
    // M1 (revue du 18/10/2026) : la Direction ouvre sa base de connaissances à tout le client (base commune). L'hôte ne
    // prouve l'accès de l'humain qu'à l'entreprise de la route : la Direction déclarée doit donc être cette entreprise,
    // ou une entreprise déjà déclarée pour ce client ; une entreprise ajoutée ne devient jamais Direction d'un client qui
    // en a déjà une. Sinon un humain d'une entreprise X ferait lire à ses agents la base d'une Direction D quelconque.
    const direction = e.entreprises.find((x) => x.estDirection);
    const membres = new Set(existants.map((s) => s.companyId.toLowerCase()));
    if (direction) {
      const cible = direction.companyId.toLowerCase();
      const dejaMembre = membres.has(cible);
      if (!dejaMembre && cible !== r.companyId.toLowerCase()) {
        erreur("acces_refuse", "La Direction déclarée doit être l'entreprise de la route ou une entreprise déjà déclarée pour ce client.");
      }
      // Défense en profondeur : déjà impliqué par F5 plus haut (une entreprise de la route encore non déclarée ne
      // redéclare jamais un client existant), gardé si F5 venait à changer.
      if (!dejaMembre && existants.some((s) => s.estDirection)) {
        erreur("acces_refuse", "Ce client a déjà une Direction : une entreprise ajoutée ne peut pas la remplacer.");
      }
    }
    // L'origine vient de l'entrée ; absente (anciens scripts), elle se déduit de l'objet des flux générés.
    const flux = e.flux.map((f) => ({ ...f, origine: f.origine ?? origineDepuisObjet(f.objet) }));
    // E1 : seule l'entreprise de la route (accès prouvé par l'hôte) et les membres déjà confirmés comptent tout de suite.
    const entreprises = e.entreprises.map((x) => ({ ...x, confirmee: x.companyId.toLowerCase() === r.companyId.toLowerCase() || membres.has(x.companyId.toLowerCase()) }));
    await stock.declarer({ clientMarqueur: e.clientMarqueur, entreprises, flux, par: r.acteur.id });
    await base.journaliser({
      companyId: r.companyId, type: "services.declares", entite: "entreprise", entiteId: r.companyId, acteur: r.acteur.id,
      donnees: { clientMarqueur: e.clientMarqueur, entreprises: e.entreprises.length, flux: e.flux.length, aConfirmer: entreprises.filter((x) => !x.confirmee).length },
    });
    return { corps: { clientMarqueur: e.clientMarqueur, entreprises: e.entreprises.length, flux: e.flux.length, aConfirmer: entreprises.filter((x) => !x.confirmee).length } };
  };
  // E1 : confirme l'entreprise de la route (`companyId` du corps, dont l'hôte prouve l'accès de l'humain) comme membre du
  // client sous lequel elle a été déclarée. Idempotent ; 404 si aucune déclaration ne la nomme.
  routes["services.confirmer"] = async (r) => {
    exigerHumain(r.acteur);
    const p = ConfirmerServiceEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Confirmation d'un service", p.error.issues);
    if (p.data!.companyId.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "La confirmation porte sur l'entreprise de la requête.");
    const confirme = await stock.confirmer(r.companyId);
    const service = await stock.serviceDeEntreprise(r.companyId);
    if (!service) erreur("introuvable", "Aucune déclaration de services ne nomme cette entreprise.");
    if (confirme) {
      await base.journaliser({
        companyId: r.companyId, type: "services.confirme", entite: "entreprise", entiteId: r.companyId, acteur: r.acteur.id,
        donnees: { clientMarqueur: service.clientMarqueur, serviceSlug: service.serviceSlug },
      });
    }
    return { corps: { clientMarqueur: service.clientMarqueur, serviceSlug: service.serviceSlug, estDirection: service.estDirection, dejaConfirmee: !confirme } };
  };
  return routes;
}
