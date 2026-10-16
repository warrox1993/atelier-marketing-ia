// Points d'extension de la passerelle : un « fournisseur » apporte les outils d'un
// service. Il n'existe que des fournisseurs RÉELS (docs/connecteurs-conception.md §6.1) :
// un service sans fournisseur enregistré répond « non_connecte », jamais des données
// simulées. Le fournisseur est choisi au démarrage, jamais par l'agent.

import type * as z from "zod";
import { FICHES_PAR_DEFAUT, verifierFiche, type FicheService, type Service } from "./services.js";

/**
 * Valeur unique « reel » : la passerelle n'a plus de mode démonstration. Le champ est conservé parce que l'enveloppe
 * signée `_atelier.mode` l'atteste au plugin (qui ne tient pour mesure qu'une réponse signée en mode « reel »).
 */
export type ModePasserelle = "reel";

export interface AnnotationsOutil {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** Ce que reçoit un outil au moment de l'appel. */
export interface ContexteAppel {
  service: Service;
  mode: ModePasserelle;
  /** Identité du compte autorisé (services locaux : la source choisie sur la page d'autorisation locale). */
  identite: IdentiteAppel;
  /**
   * Jeton porteur reçu de Paperclip : à relayer tel quel vers l'API du service, sans le stocker
   * (la passerelle reste sans état). Jamais journalisé.
   */
  jetonPorteur: string | null;
}

export interface IdentiteAppel {
  compte: string;
  propriete: { id: string; libelle: string } | null;
}

export interface OutilPasserelle {
  nom: string;
  description: string;
  /** Forme brute Zod des paramètres d'entrée (comme l'attend le SDK MCP). */
  schemaEntree: z.ZodRawShape;
  annotations?: AnnotationsOutil;
  /** Renvoie les données de l'outil ; la passerelle ajoute l'enveloppe `_atelier` (et la signature). */
  executer(args: Record<string, unknown>, contexte: ContexteAppel): Promise<unknown> | unknown;
}

export interface FournisseurService {
  service: Service;
  mode: ModePasserelle;
  /** Fiche du service, si elle n'est pas déjà dans le registre (nouveau service : Pipedrive, Odoo...). */
  fiche?: FicheService;
  outils: readonly OutilPasserelle[];
  /**
   * Serveurs d'autorisation annoncés dans les métadonnées de ressource protégée (par exemple le serveur
   * d'autorisation propre au fournisseur). Ignoré si `autorisationLocale` est vrai.
   */
  serveursAutorisation?: readonly string[];
  /**
   * Vrai pour un service sans compte de tiers (osm, bce, bnb, liens) : l'accès est accordé par le serveur
   * d'autorisation local de la passerelle (oauth-local.ts), qui vérifie lui-même le jeton. Sinon le fournisseur
   * apporte sa propre autorisation (`verifierJeton`).
   */
  autorisationLocale?: boolean;
  /**
   * Vérifie le jeton porteur reçu de Paperclip pour CE service (validité, expiration, audience =
   * ressource <passerelle>/mcp/<service>). Appelé par le serveur MCP avant TOUTE requête (initialize, tools/list,
   * tools/call) ; null = refus HTTP 401. Un fournisseur sans cette fonction (et sans `autorisationLocale`) n'est jamais servi (refus 401).
   */
  verifierJeton?(jeton: string, service: Service): IdentiteAppel | null;
}

/** Registre des fournisseurs, indexé par service. */
export class RegistreFournisseurs {
  private readonly lesFiches = new Map<Service, FicheService>();

  constructor(fiches: readonly FicheService[] = FICHES_PAR_DEFAUT) {
    for (const fiche of fiches) this.declarerFiche(fiche);
  }

  /** Ajoute ou remplace la fiche d'un service. */
  declarerFiche(fiche: FicheService): this {
    verifierFiche(fiche);
    this.lesFiches.set(fiche.id, fiche);
    return this;
  }

  fiche(service: string): FicheService | undefined {
    return this.lesFiches.get(service);
  }

  fiches(): FicheService[] {
    return [...this.lesFiches.values()];
  }

  private readonly fournisseurs = new Map<Service, FournisseurService>();

  enregistrer(fournisseur: FournisseurService): this {
    if (fournisseur.fiche) {
      if (fournisseur.fiche.id !== fournisseur.service) throw new Error("La fiche ne correspond pas au service du fournisseur.");
      this.declarerFiche(fournisseur.fiche);
    }
    if (!this.lesFiches.has(fournisseur.service)) {
      throw new Error(`Service sans fiche : « ${fournisseur.service} ». Déclarer une fiche (declarerFiche ou champ fiche).`);
    }
    const noms = new Set<string>();
    for (const outil of fournisseur.outils) {
      if (outil.nom === "atelier_identite") {
        throw new Error("Le nom d'outil « atelier_identite » est réservé à la passerelle.");
      }
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(outil.nom)) {
        throw new Error(`Nom d'outil invalide : « ${outil.nom} » (minuscules, chiffres et _ seulement).`);
      }
      if (noms.has(outil.nom)) {
        throw new Error(`Outil en double dans le service ${fournisseur.service} : ${outil.nom}`);
      }
      noms.add(outil.nom);
    }
    this.fournisseurs.set(fournisseur.service, fournisseur);
    return this;
  }

  obtenir(service: Service): FournisseurService | undefined {
    return this.fournisseurs.get(service);
  }
}
