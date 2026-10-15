// Points d'extension de la passerelle : un « fournisseur » apporte les outils d'un
// service, dans un mode donné. Les mêmes noms d'outils, schémas d'entrée et formes
// de réponse doivent exister en mode `demonstration` et en mode `reel`
// (docs/connecteurs-conception.md §6.1). Le mode est choisi au démarrage, jamais
// par l'agent.
//
// Lots suivants : L5 et L7 enregistrent des fournisseurs de démonstration, L4
// enregistre des fournisseurs réels. Ce lot ne livre que le mécanisme et un
// fournisseur factice pour les tests (tests/fournisseur-factice.ts).

import type * as z from "zod";
import { FICHES_PAR_DEFAUT, verifierFiche, type FicheService, type Service } from "./services.js";

export type ModePasserelle = "demonstration" | "reel";

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
  /** Identité du compte autorisé (démonstration : choisie sur la page de consentement). */
  identite: IdentiteAppel;
  /**
   * Jeton porteur reçu de Paperclip. Mode réel : à relayer tel quel vers l'API du
   * service, sans le stocker (la passerelle reste sans état). Jamais journalisé.
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
  /** Renvoie les données de l'outil ; la passerelle ajoute la mention de démonstration. */
  executer(args: Record<string, unknown>, contexte: ContexteAppel): Promise<unknown> | unknown;
}

export interface FournisseurService {
  service: Service;
  mode: ModePasserelle;
  /** Fiche du service, si elle n'est pas déjà dans le registre (nouveau service : Pipedrive, Odoo...). */
  fiche?: FicheService;
  outils: readonly OutilPasserelle[];
  /**
   * Mode réel seulement : serveurs d'autorisation annoncés dans les métadonnées de
   * ressource protégée (par exemple https://accounts.google.com).
   */
  serveursAutorisation?: readonly string[];
  /**
   * Mode réel : vérifie le jeton porteur reçu de Paperclip pour CE service (validité, expiration, audience =
   * ressource <passerelle>/mcp/<service>). Appelé par le serveur MCP avant TOUTE requête (initialize, tools/list,
   * tools/call) ; null = refus HTTP 401. Un fournisseur réel sans cette fonction n'est jamais servi (refus 401).
   */
  verifierJeton?(jeton: string, service: Service): IdentiteAppel | null;
}

/** Registre des fournisseurs, indexé par mode puis par service. */
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

  private readonly parMode: Record<ModePasserelle, Map<Service, FournisseurService>> = {
    demonstration: new Map(),
    reel: new Map(),
  };

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
    this.parMode[fournisseur.mode].set(fournisseur.service, fournisseur);
    return this;
  }

  obtenir(mode: ModePasserelle, service: Service): FournisseurService | undefined {
    return this.parMode[mode].get(service);
  }
}
