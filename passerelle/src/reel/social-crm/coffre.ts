// État persistant des fournisseurs réels réseaux sociaux et CRM : clients enregistrés (DCR), octrois
// (un consentement = un service + un compte), empreintes des jetons émis par la passerelle, journal des
// mutations (idempotence). Un seul fichier JSON 0600, écrit de façon atomique (fichier temporaire puis
// renommage). Les secrets des plateformes y sont chiffrés (AES-256-GCM, contexte = identifiant de l'octroi) ;
// les jetons de la passerelle n'y figurent que par leur empreinte SHA-256.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { placerClient } from "../../garde-oauth.js";
import { chiffrer, dechiffrer } from "../google/chiffrement.js";
import type { CompteChoisi, Details, Secrets } from "./connecteurs.js";

export interface Client {
  clientId: string;
  redirectUris: string[];
  clientName: string | null;
  emisLe: number;
}

export interface Octroi {
  id: string;
  service: string;
  compte: { id: string; libelle: string };
  portees: string[];
  details: Details;
  /** Secrets chiffrés (JSON de `Secrets`). */
  secrets: string;
  creeLe: number;
}

export interface JetonPasserelle {
  type: "acces" | "rafraichissement";
  clientId: string;
  resource: string;
  octroi: string;
  expire: number;
}

export type EtatMutation = "en_cours" | "executee" | "ambigue" | "echouee";

export interface EntreeMutation {
  /** Clé d'idempotence choisie par l'agent (signée dans la preuve) : jamais unique à elle seule (revue S-5). */
  cle: string;
  /**
   * Compte (de l'octroi) pour lequel la mutation a été demandée. Le journal est indexé par compte + service + outil
   * + clé. Absent : entrée d'avant la revue S-5, retrouvée seulement par la même clé, le même service, le même outil
   * et le même octroi.
   */
  compte?: string;
  service: string;
  outil: string;
  empreinte: string;
  octroi: string;
  etat: EtatMutation;
  /** Début de la dernière tentative (ms Unix) : borne de la réconciliation. */
  debut: number;
  fin: number | null;
  /** Résultat renvoyé par la plateforme (identifiants seulement), une fois l'effet confirmé. */
  resultat: Record<string, unknown> | null;
  tentatives: number;
  motif: string | null;
  /**
   * Expiration de la preuve d'approbation qui porte cette clé (ms Unix). Tant qu'elle n'est pas passée, l'entrée ne
   * peut pas être oubliée : sinon la même preuve pourrait être rejouée et l'action exécutée deux fois (revue S5).
   */
  expirePreuve?: number;
}

interface Etat {
  version: 1;
  clients: Client[];
  octrois: Octroi[];
  jetons: Record<string, JetonPasserelle>;
  mutations: Record<string, EntreeMutation>;
}

const MAX_MUTATIONS = 5000;

export class Coffre {
  private etat: Etat = { version: 1, clients: [], octrois: [], jetons: {}, mutations: {} };

  constructor(
    private readonly fichier: string,
    private readonly cle: Buffer,
    /** Taille visée du journal des mutations (tests : plus petite). */
    private readonly maxMutations: number = MAX_MUTATIONS,
    private readonly maintenant: () => number = Date.now,
  ) {
    if (existsSync(fichier)) {
      const brut = JSON.parse(readFileSync(fichier, "utf8")) as Etat;
      if (brut.version !== 1) throw new Error("Fichier d'état réseaux sociaux et CRM : version inconnue.");
      this.etat = { ...brut, mutations: brut.mutations ?? {} };
    }
  }

  sauvegarder(): void {
    mkdirSync(dirname(this.fichier), { recursive: true, mode: 0o700 });
    const temporaire = `${this.fichier}.${process.pid}.tmp`;
    writeFileSync(temporaire, JSON.stringify(this.etat), { mode: 0o600 });
    renameSync(temporaire, this.fichier);
  }

  // --- Clients -----------------------------------------------------------------------------

  /** Ajoute un client DCR ; table bornée qui n'évince jamais un client vivant (lève RefusGarde 503 si pleine). */
  ajouterClient(client: Client, vivant: (clientId: string) => boolean, maximum: number): void {
    placerClient(this.etat.clients, client, vivant, maximum);
    this.sauvegarder();
  }

  clientAUnJetonVivant(clientId: string, maintenant: number): boolean {
    return Object.values(this.etat.jetons).some((j) => j.clientId === clientId && j.expire > maintenant);
  }

  client(id: string | null): Client | undefined {
    return this.etat.clients.find((c) => c.clientId === id);
  }

  // --- Octrois -----------------------------------------------------------------------------

  creerOctroi(o: { id: string; service: string; compte: CompteChoisi; portees: string[]; details: Details; secrets: Secrets; creeLe: number }): Octroi {
    const octroi: Octroi = {
      id: o.id,
      service: o.service,
      compte: { id: o.compte.id, libelle: o.compte.libelle },
      portees: o.portees,
      details: o.details,
      secrets: chiffrer(this.cle, JSON.stringify(o.secrets), o.id),
      creeLe: o.creeLe,
    };
    this.etat.octrois.push(octroi);
    this.sauvegarder();
    return octroi;
  }

  octroi(id: string): Octroi | undefined {
    return this.etat.octrois.find((o) => o.id === id);
  }

  secrets(octroi: Octroi): Secrets {
    return JSON.parse(dechiffrer(this.cle, octroi.secrets, octroi.id)) as Secrets;
  }

  remplacerSecrets(octroi: Octroi, secrets: Secrets): void {
    octroi.secrets = chiffrer(this.cle, JSON.stringify(secrets), octroi.id);
    this.sauvegarder();
  }

  retirerOctroi(id: string): void {
    this.etat.octrois = this.etat.octrois.filter((o) => o.id !== id);
    for (const [c, v] of Object.entries(this.etat.jetons)) if (v.octroi === id) delete this.etat.jetons[c];
    this.sauvegarder();
  }

  // --- Jetons de la passerelle ---------------------------------------------------------------

  jeton(empreinte: string): JetonPasserelle | undefined {
    return this.etat.jetons[empreinte];
  }

  ajouterJetons(entrees: Record<string, JetonPasserelle>): void {
    Object.assign(this.etat.jetons, entrees);
    this.sauvegarder();
  }

  retirerJeton(empreinte: string): void {
    delete this.etat.jetons[empreinte];
  }

  nettoyerJetons(maintenant: number): void {
    let change = false;
    for (const [c, v] of Object.entries(this.etat.jetons)) {
      if (v.expire <= maintenant) {
        delete this.etat.jetons[c];
        change = true;
      }
    }
    if (change) this.sauvegarder();
  }

  // --- Journal des mutations -------------------------------------------------------------------

  /**
   * Entrée de journal pour (compte, service, outil, clé). Jamais l'entrée d'un autre compte, service ou outil, même
   * à clé identique (revue S-5). Repli pour les entrées d'avant S-5 (indexées par la clé seule, sans compte) : elles
   * ne sont rendues qu'à l'octroi, au service et à l'outil qui les ont créées.
   */
  mutation(cle: string, portee: PorteeMutation): EntreeMutation | undefined {
    const exacte = this.etat.mutations[indexMutation({ cle, compte: portee.compte, service: portee.service, outil: portee.outil })];
    if (exacte) return exacte;
    const ancienne = this.etat.mutations[cle];
    if (ancienne && ancienne.compte === undefined && ancienne.service === portee.service && ancienne.outil === portee.outil && ancienne.octroi === portee.octroi) return ancienne;
    return undefined;
  }

  ecrireMutation(entree: EntreeMutation): void {
    const index = indexMutation(entree);
    const cles = Object.keys(this.etat.mutations);
    if (!this.etat.mutations[index] && cles.length >= this.maxMutations) {
      // On oublie les plus anciennes entrées closes dont la preuve a EXPIRÉ (jamais une entrée en cours ou ambiguë,
      // jamais une entrée dont la preuve pourrait encore être présentée). Au besoin, le journal dépasse sa taille visée.
      const t = this.maintenant();
      const oubliables = Object.values(this.etat.mutations)
        .filter((m) => (m.etat === "executee" || m.etat === "echouee") && m.expirePreuve !== undefined && m.expirePreuve <= t)
        .sort((a, b) => a.debut - b.debut);
      for (const m of oubliables.slice(0, cles.length - this.maxMutations + 1)) delete this.etat.mutations[indexMutation(m)];
    }
    // Migration au fil de l'eau : l'entrée d'avant S-5 (clé seule) que celle-ci remplace est retirée.
    if (entree.compte !== undefined) {
      const ancienne = this.etat.mutations[entree.cle];
      if (ancienne && ancienne.compte === undefined && ancienne.service === entree.service && ancienne.outil === entree.outil && ancienne.octroi === entree.octroi) delete this.etat.mutations[entree.cle];
    }
    this.etat.mutations[index] = entree;
    this.sauvegarder();
  }
}

/** Ce qui, avec la clé, identifie une mutation : l'agent ne choisit que la clé. */
export interface PorteeMutation {
  compte: string;
  service: string;
  outil: string;
  octroi: string;
}

/** Index du journal : compte + service + outil + clé (JSON : aucune ambiguïté de séparateur). Sans compte : clé seule. */
function indexMutation(m: { cle: string; compte?: string | undefined; service: string; outil: string }): string {
  return m.compte === undefined ? m.cle : JSON.stringify([m.compte, m.service, m.outil, m.cle]);
}
