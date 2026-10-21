/**
 * Facteur du bureau de liaison : file de sortie traitée hors invocation (essai réel L9, 16/10/2026).
 *
 * Constat : l'hôte attache chaque appel du worker à l'invocation en cours (route ou événement) et refuse toute
 * entreprise autre que celle de cette invocation (« requested company <cible> but the current invocation is scoped to
 * company <source> », `host-client-factory.ts`). La route de la source ne peut donc pas créer la tâche chez la cible,
 * ni l'événement de la cible commenter chez la source. Les appels SANS invocation (minuterie du worker) sont admis
 * pour les seules entreprises qui ont une configuration du plugin (`proactiveCompanyScopes`, `plugin-loader.ts`).
 *
 * Les routes et l'événement n'écrivent plus que dans leur propre entreprise et dans la base du plugin ; le facteur,
 * lancé par une minuterie créée dans `setup()` (donc hors de toute invocation), fait le reste :
 * - transmission : liaison `ouverte` sans tâche cible. Les gardes de la demande sont REVÉRIFIÉES (deux entreprises
 *   déclarées, même client, services inchangés, flux toujours dans la matrice) ; sinon la liaison passe à `refusee` et
 *   la source en est informée, rien ne part. Puis la transmission commune (`transmission.ts`) : tâche racine chez le
 *   coordinateur cible (retrouvée par `originId` si elle existe déjà), réveil avec clé d'idempotence, journal ;
 * - notification : liaison `repondue` ou `annulee` dont la source n'a pas reçu la réponse : commentaire sur la tâche
 *   d'origine (DONNÉE, jamais instruction), réveil du coordinateur source, journal des deux côtés.
 * - comptes rendus d'étape (`etapes.ts`) : commentaire d'agent d'une tâche cible `in_review` d'une liaison encore ouverte,
 *   relayé une seule fois à la tâche d'origine ;
 * Le facteur n'agit que sur des liaisons enregistrées par les routes après leurs gardes, et seulement dans les deux
 * entreprises de chaque liaison. Aucune capacité de plus : minuterie du worker, comme le veilleur.
 *
 * Bornes : un seul passage à la fois ; au plus `lot` liaisons par étape et par passage ; chaque essai est réservé en
 * base avant d'agir (comparer et échanger) avec une attente croissante, au plus `essaisMax` essais par étape, puis un
 * seul journal d'échec que l'humain voit. Un rejeu explicite de la demande (ou de la décision) remet les essais à zéro.
 */
import type { LiaisonStockee, StockLiaisons } from "./base-liaisons.js";
import { cloturerCibleSupprimee } from "./cible-supprimee.js";
import { toujoursAutorisee } from "./autorisation.js";
import { creerRelaisEtapes } from "./etapes.js";
import { corpsReponse, estTronquee, notifierSource } from "./retour.js";
import { creerTransmission, type DependancesLiaisons } from "./transmission.js";

export const FACTEUR = {
  intervalleMs: 15_000,
  lot: 20,
  essaisMax: 8,
  attenteBaseMs: 15_000,
  attenteMaxMs: 30 * 60_000,
  acteur: "atelier:facteur",
} as const;

/** Attente avant l'essai suivant : 15 s, 30 s, 1 min, 2 min… plafonnée à 30 min. */
export const attenteFacteur = (essaisFaits: number): number => Math.min(FACTEUR.attenteMaxMs, FACTEUR.attenteBaseMs * 2 ** Math.max(0, essaisFaits));

export interface ResultatFacteur {
  transmises: string[];
  notifiees: string[];
  /** Liaisons ouvertes dont un compte rendu d'étape a été relayé à la source. */
  etapesRelayees: string[];
  refusees: string[];
  echecs: Array<{ liaisonId: string; etape: "transmission" | "notification"; erreur: string }>;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function creerFacteur(d: DependancesLiaisons & { maintenant?: () => number }) {
  const { ctx, base, stock } = d;
  const relaisEtapes = creerRelaisEtapes(d);
  const { transmettre } = creerTransmission(d);
  let enCours = false;
  let minuterie: ReturnType<typeof setInterval> | null = null;

  async function echec(l: LiaisonStockee, etape: "transmission" | "notification", erreur: string, r: ResultatFacteur) {
    r.echecs.push({ liaisonId: l.id, etape, erreur });
    await stock.noterErreurFacteur(l.entrepriseSource, l.id, erreur);
    const dernier = (l.facteurEssais ?? 0) + 1 >= FACTEUR.essaisMax;
    ctx.logger.warn(`Liaison : ${etape} impossible${dernier ? ", plafond d'essais atteint : intervention humaine nécessaire" : ", nouvel essai plus tard"}`, { liaisonId: l.id, erreur });
    if (dernier) {
      await base.journaliser({
        companyId: l.entrepriseSource, type: `liaison.${etape}_echouee`, entite: "liaison", entiteId: l.id, issueId: l.tacheOrigine, acteur: FACTEUR.acteur, runId: null,
        donnees: { liaisonId: l.id, serviceCible: l.serviceCible, essais: FACTEUR.essaisMax, erreur },
      });
    }
  }

  async function transmissionUne(l: LiaisonStockee, r: ResultatFacteur) {
    if (!(await stock.reserverEssai(l.entrepriseSource, l.id, attenteFacteur(l.facteurEssais ?? 0), FACTEUR.essaisMax))) return;
    try {
      if (l.entrepriseCible === null) {
        // Entreprise cible supprimee : la liaison de la source survit, rien ne part, etat final explicite.
        if (await cloturerCibleSupprimee(d, l, FACTEUR.acteur)) r.refusees.push(l.id);
        return;
      }
      if (!(await toujoursAutorisee(l, stock))) {
        if (!(await stock.transiter(l.entrepriseSource, l.id, ["ouverte"], { statut: "refusee", repondu: true }))) return;
        r.refusees.push(l.id);
        const corps = `**Demande au service « ${l.serviceCible} » non transmise** : « ${l.objet.replace(/\s+/gu, " ")} ». Le flux entre ces deux services n'est plus autorisé (déclaration des services ou matrice des flux modifiée depuis la demande).`;
        const { erreurCommentaire, erreurReveil } = await notifierSource(ctx, l, corps, "atelier_liaison_refusee");
        if (!erreurCommentaire) await stock.marquerNotifiee(l.entrepriseSource, l.id);
        await base.journaliser({
          companyId: l.entrepriseSource, type: "liaison.non_transmise", entite: "liaison", entiteId: l.id, issueId: l.tacheOrigine, acteur: FACTEUR.acteur, runId: null,
          donnees: { liaisonId: l.id, serviceCible: l.serviceCible, raison: "flux_retire", ...(erreurCommentaire ? { erreurCommentaire } : {}), ...(erreurReveil ? { erreurReveil } : {}) },
        });
        return;
      }
      await transmettre(l, l.demandePar, null);
      r.transmises.push(l.id);
    } catch (e) {
      await echec(l, "transmission", message(e), r);
    }
  }

  /** Liaison dont la cible a disparu (transmise ou non, en attente d'approbation ou ouverte) : clôture, source informée une fois. */
  async function cibleSupprimeeUne(l: LiaisonStockee, r: ResultatFacteur) {
    if (!(await stock.reserverEssai(l.entrepriseSource, l.id, attenteFacteur(l.facteurEssais ?? 0), FACTEUR.essaisMax))) return;
    try {
      if (await cloturerCibleSupprimee(d, l, FACTEUR.acteur)) r.refusees.push(l.id);
    } catch (e) {
      await echec(l, "transmission", message(e), r);
    }
  }

  async function notificationUne(l: LiaisonStockee, r: ResultatFacteur) {
    if (!(await stock.reserverEssai(l.entrepriseSource, l.id, attenteFacteur(l.facteurEssais ?? 0), FACTEUR.essaisMax))) return;
    const { erreurCommentaire, erreurReveil } = await notifierSource(ctx, l, corpsReponse(l), "atelier_liaison_reponse");
    if (erreurCommentaire) {
      await echec(l, "notification", erreurCommentaire, r);
      return;
    }
    if (!(await stock.marquerNotifiee(l.entrepriseSource, l.id))) return;
    r.notifiees.push(l.id);
    const annulee = l.statut === "annulee";
    const donnees = {
      liaisonId: l.id, serviceSource: l.serviceSource, serviceCible: l.serviceCible, issue: annulee ? "annulee" : "terminee",
      longueurReponse: l.reponse?.length ?? 0, tronquee: estTronquee(l.reponse), ...(erreurReveil ? { erreurReveil } : {}),
    };
    const type = annulee ? "liaison.annulee" : "liaison.repondue";
    await base.journaliser({ companyId: l.entrepriseSource, type, entite: "liaison", entiteId: l.id, issueId: l.tacheOrigine, acteur: FACTEUR.acteur, runId: null, donnees });
    // Cible supprimee : pas de journal chez une entreprise qui n'existe plus.
    if (l.entrepriseCible !== null) await base.journaliser({ companyId: l.entrepriseCible, type, entite: "liaison", entiteId: l.id, issueId: l.tacheCible, acteur: FACTEUR.acteur, runId: null, donnees });
  }

  /** Un passage : transmissions puis notifications dues. Un seul passage à la fois ; ne lève jamais. */
  async function passe(): Promise<ResultatFacteur> {
    const r: ResultatFacteur = { transmises: [], notifiees: [], etapesRelayees: [], refusees: [], echecs: [] };
    if (enCours) return r;
    enCours = true;
    try {
      const etapes: Array<[() => Promise<LiaisonStockee[]>, (l: LiaisonStockee, r: ResultatFacteur) => Promise<void>, "transmission" | "notification"]> = [
        [() => stock.listerCibleSupprimee(FACTEUR.lot, FACTEUR.essaisMax), cibleSupprimeeUne, "transmission"],
        [() => stock.listerATransmettre(FACTEUR.lot, FACTEUR.essaisMax), transmissionUne, "transmission"],
        [() => stock.listerANotifier(FACTEUR.lot, FACTEUR.essaisMax), notificationUne, "notification"],
      ];
      for (const [lister, traiter, etape] of etapes) {
        let liste: LiaisonStockee[] = [];
        try {
          liste = await lister();
        } catch (e) {
          ctx.logger.warn("Liaison : file de sortie illisible", { etape, erreur: message(e) });
          continue;
        }
        for (const l of liste) {
          try {
            await traiter(l, r);
          } catch (e) {
            r.echecs.push({ liaisonId: l.id, etape, erreur: message(e) });
            ctx.logger.warn("Liaison : traitement de la file de sortie interrompu", { liaisonId: l.id, etape, erreur: message(e) });
          }
        }
      }
      r.etapesRelayees.push(...(await relaisEtapes.passe()));
    } finally {
      enCours = false;
    }
    return r;
  }

  return {
    passe,
    /**
     * À appeler depuis `setup()` seulement : la minuterie hérite du contexte où elle est créée, et seul un contexte
     * sans invocation permet d'agir dans les deux entreprises d'une liaison.
     */
    demarrer(intervalleMs: number = FACTEUR.intervalleMs) {
      if (minuterie) return;
      minuterie = setInterval(() => {
        passe().catch((e) => ctx.logger.warn("Liaison : passage du facteur en échec", { erreur: message(e) }));
      }, intervalleMs);
      (minuterie as { unref?: () => void }).unref?.();
    },
    arreter() {
      if (minuterie) clearInterval(minuterie);
      minuterie = null;
    },
  };
}

export type Facteur = ReturnType<typeof creerFacteur>;
