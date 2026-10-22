// ENVOI d'une campagne e-mail : jamais un outil d'agent (il n'est pas dans le catalogue MCP du service « emailing »).
//
// C'est une route interne de la passerelle (POST /interne/emailing/envoyer), appelée par le PLUGIN de l'atelier seulement après qu'un
// humain a accepté une carte de confirmation (request_confirmation) liée à cette campagne. Le plugin signe alors une preuve
// d'approbation à usage unique (même format apv1 que les autres actions sensibles, clé Ed25519 que la passerelle ne détient pas :
// elle ne peut donc pas fabriquer de preuve) et une liste de révocation fraîche. Sans preuve valide, rien ne part.
//
// Contrôles à l'envoi, dans l'ordre : preuve et révocation ; campagne en brouillon et contenu identique à celui approuvé (empreinte) ;
// lien de désinscription présent ; destinataires présents et plafonnés ; mode d'envoi connu. Tant que le SMTP réel n'est pas configuré,
// listmonk envoie à Mailpit et la réponse le dit : « envoi de test, rien n'est parti ». Un SMTP réel est refusé (non validé par l'atelier).

import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as z from "zod";
import { VerificateurPreuves } from "../social-crm/approbation.js";
import { ClientListmonk, ErreurListmonk, MESSAGE_ENVOI_TEST, modeEnvoi, type CampagneListmonk } from "./listmonk.js";
import { empreinteCampagne } from "./outils.js";
import { contientDesinscription } from "./contenu-courriel.js";

export const SERVICE_ENVOI = "emailing";
export const OUTIL_ENVOI = "envoyer_campagne";
/** Compte désigné dans la preuve : le listmonk local de l'atelier. */
export const COMPTE_ENVOI = "listmonk-local";
export const DESTINATAIRES_MAX = 500;

export const CHEMIN_LECTURE = "/interne/emailing/lire-campagne";
const LONGUEUR_EXTRAIT = 400;

export const schemaDemandeLecture = z.object({ campagne_id: z.number().int().min(1) }).strict();

export const schemaDemandeEnvoi = z.object({
  campagne_id: z.number().int().min(1),
  empreinte: z.string().regex(/^[0-9a-f]{64}$/),
  /** Nombre de destinataires que l'humain a vu et accepté, et empreinte de leurs identifiants : l'accord porte sur ces abonnés-là. */
  destinataires: z.number().int().min(0).max(1_000_000),
  empreinte_abonnes: z.string().regex(/^[0-9a-f]{64}$/),
  preuve_approbation: z.string().min(20).max(8000),
  revocations_approbation: z.string().min(20).max(200_000),
}).strict();

export interface OptionsEnvoi {
  /** Client listmonk à droit d'envoi (rôle « atelier-envoi »). */
  client: ClientListmonk;
  verificateur: VerificateurPreuves;
  maintenant?: () => Date;
  journal?: (message: string) => void;
  /** Fichier des preuves réservées (survit au redémarrage) ; absent : mémoire seulement (essais). */
  fichierPreuves?: string;
}

export interface ReponseEnvoi { statut: number; corps: Record<string, unknown> }

/** Arguments signés par le plugin : exactement ceux-ci, dans l'empreinte de la preuve. */
export function argumentsEnvoi(campagneId: number, empreinte: string, destinataires: number, empreinteAbonnes: string): Record<string, unknown> {
  return { campagne_id: campagneId, empreinte, destinataires, empreinte_abonnes: empreinteAbonnes };
}

/** Empreinte des identifiants d'abonnés (triés, sans doublon) : change dès qu'un abonné est ajouté ou retiré. */
export function empreinteAbonnes(ids: readonly number[]): string {
  const tries = [...new Set(ids)].sort((a, b) => a - b);
  return createHash("sha256").update(tries.join(","), "utf8").digest("hex");
}

/** Abonnés confirmés ciblés par la campagne (union des listes, sans doublon) : nombre et empreinte, lus chez listmonk à l'instant. */
export async function abonnesCibles(client: ClientListmonk, campagne: Pick<CampagneListmonk, "lists">): Promise<{ destinataires: number; empreinte: string }> {
  const ids = new Set<number>();
  for (const l of campagne.lists) for (const id of await client.idsConfirmes(l.id)) ids.add(id);
  return { destinataires: ids.size, empreinte: empreinteAbonnes([...ids]) };
}

/**
 * Route interne en LECTURE (jamais un outil MCP) : ce que la carte de confirmation doit montrer, lu chez listmonk et non déclaré par
 * un agent. Même protection que la route d'envoi (boucle locale, Host et Origin contrôlés, POST JSON) ; elle ne modifie rien.
 */
export function creerLecteurCampagne(options: { client: ClientListmonk; journal?: (message: string) => void }): (corpsBrut: unknown) => Promise<ReponseEnvoi> {
  return async (corpsBrut) => {
    const analyse = schemaDemandeLecture.safeParse(corpsBrut);
    if (!analyse.success) return { statut: 400, corps: { erreur: "demande_invalide", message: `Demande invalide : ${analyse.error.issues.map((i) => `${i.path.join(".") || "corps"} : ${i.message}`).join(" ; ")}` } };
    try {
      const c = await options.client.campagne(analyse.data.campagne_id);
      const cibles = await abonnesCibles(options.client, c);
      const texte = (c.altbody ?? "").replace(/\s+/g, " ").trim();
      return {
        statut: 200,
        corps: {
          campagne_id: c.id, sujet: c.subject, statut: c.status, listes: c.lists.map((l) => ({ id: l.id, nom: l.name })),
          destinataires: cibles.destinataires, empreinte: empreinteCampagne(c), empreinte_abonnes: cibles.empreinte, extrait: texte.slice(0, LONGUEUR_EXTRAIT),
        },
      };
    } catch (e) {
      const message = e instanceof ErreurListmonk ? e.message : "Erreur interne pendant la lecture de la campagne.";
      options.journal?.(`lecture de campagne en échec : ${message}`);
      return { statut: 502, corps: { erreur: "listmonk", message: `Campagne illisible : ${message}` } };
    }
  };
}

/**
 * Preuves déjà réservées, conservées dans un fichier (droits 0600) pour survivre à un redémarrage de la passerelle. Journal en ajout
 * seulement : une ligne par réservation (« r ») ou libération (« l »), rejoué au démarrage.
 */
export class PreuvesReservees {
  private readonly cles = new Set<string>();
  constructor(private readonly fichier: string | null = null) {
    if (fichier === null) return;
    if (existsSync(fichier)) {
      for (const ligne of readFileSync(fichier, "utf8").split("\n")) {
        const [op, ...reste] = ligne.split(" ");
        const cle = reste.join(" ");
        if (cle === "") continue;
        if (op === "r") this.cles.add(cle);
        else if (op === "l") this.cles.delete(cle);
      }
    } else {
      mkdirSync(dirname(fichier), { recursive: true });
      writeFileSync(fichier, "", { mode: 0o600 });
    }
    chmodSync(fichier, 0o600);
  }
  /** Réserve la clé ; faux si elle l'était déjà. Synchrone : aucune course possible entre deux requêtes. */
  reserver(cle: string): boolean {
    if (this.cles.has(cle)) return false;
    this.cles.add(cle);
    if (this.fichier !== null) appendFileSync(this.fichier, `r ${cle}\n`);
    return true;
  }
  liberer(cle: string): void {
    if (!this.cles.delete(cle)) return;
    if (this.fichier !== null) appendFileSync(this.fichier, `l ${cle}\n`);
  }
}

export function creerEnvoyeur(options: OptionsEnvoi): (corpsBrut: unknown) => Promise<ReponseEnvoi> {
  const maintenant = options.maintenant ?? ((): Date => new Date());
  const journal = options.journal ?? ((): void => undefined);
  /** Clés de preuve réservées : une preuve ne sert qu'une fois, même après un redémarrage (listmonk refuse de toute façon un second démarrage). */
  const reservees = new PreuvesReservees(options.fichierPreuves ?? null);
  const refus = (statut: number, code: string, message: string): ReponseEnvoi => ({ statut, corps: { envoye: false, erreur: code, message } });

  return async (corpsBrut) => {
    const analyse = schemaDemandeEnvoi.safeParse(corpsBrut);
    if (!analyse.success) return refus(400, "demande_invalide", `Demande invalide : ${analyse.error.issues.map((i) => `${i.path.join(".") || "corps"} : ${i.message}`).join(" ; ")}`);
    const d = analyse.data;
    const args = argumentsEnvoi(d.campagne_id, d.empreinte, d.destinataires, d.empreinte_abonnes);
    const verdict = options.verificateur.verifier(d.preuve_approbation, {
      service: SERVICE_ENVOI, outil: OUTIL_ENVOI, args, compte: COMPTE_ENVOI, maintenantS: Math.floor(maintenant().getTime() / 1000), revocations: d.revocations_approbation,
    });
    if (!verdict.ok) {
      journal(`envoi refusé (preuve) : ${verdict.motif}`);
      return refus(403, "preuve_refusee", `Envoi refusé : ${verdict.motif}.`);
    }
    // Réservation IMMÉDIATE et synchrone (avant tout await) : deux requêtes simultanées avec la même preuve ne passent jamais ensemble.
    const cle = verdict.charge.cle;
    if (!reservees.reserver(cle)) return refus(409, "preuve_deja_utilisee", "Envoi refusé : cette approbation a déjà servi. Une nouvelle décision humaine est nécessaire.");
    // Libérée seulement si on échoue AVANT d'avoir demandé le démarrage à listmonk ; ensuite (réponse incertaine) elle reste consommée.
    let demarrageDemande = false;
    const refuser = (statut: number, code: string, message: string): ReponseEnvoi => {
      if (!demarrageDemande) reservees.liberer(cle);
      return refus(statut, code, message);
    };
    try {
      const campagne = await options.client.campagne(d.campagne_id);
      if (campagne.status !== "draft") return refuser(409, "pas_un_brouillon", `Envoi refusé : la campagne est « ${campagne.status } » et non en brouillon.`);
      if (empreinteCampagne(campagne) !== d.empreinte) return refuser(409, "contenu_modifie", "Envoi refusé : le contenu de la campagne n'est plus celui que l'humain a approuvé (sujet, texte, listes ou gabarit modifiés). Demander une nouvelle confirmation.");
      if (campagne.content_type !== "html" || !contientDesinscription(campagne.body) || !contientDesinscription(campagne.altbody ?? "")) {
        return refuser(422, "desinscription_absente", "Envoi refusé : le lien de désinscription ({{ UnsubscribeURL }}) manque dans la campagne.");
      }
      const cibles = await abonnesCibles(options.client, campagne);
      if (cibles.destinataires < 1) return refuser(422, "aucun_destinataire", "Envoi refusé : les listes de la campagne n'ont aucun abonné.");
      if (cibles.destinataires !== d.destinataires || cibles.empreinte !== d.empreinte_abonnes) {
        return refuser(409, "liste_modifiee", `Envoi refusé : la liste a changé depuis l'accord : redemander la confirmation (${d.destinataires} destinataire(s) acceptés, ${cibles.destinataires} aujourd'hui).`);
      }
      if (cibles.destinataires > DESTINATAIRES_MAX) return refuser(422, "trop_de_destinataires", `Envoi refusé : ${cibles.destinataires} destinataires, plafond de ${DESTINATAIRES_MAX} par envoi.`);
      const mode = await modeEnvoi(options.client);
      if (mode !== "test") return refuser(422, "smtp_reel_non_valide", "Envoi refusé : le serveur SMTP de listmonk n'est pas Mailpit. Aucun SMTP réel n'est validé par l'atelier : remettre le SMTP de test.");
      demarrageDemande = true;
      const apres = await options.client.changerEtat(d.campagne_id, "running");
      journal(`envoi de test lancé (campagne ${d.campagne_id}, ${cibles.destinataires} destinataire(s), décision ${verdict.charge.decision})`);
      return {
        statut: 200,
        corps: {
          envoye: true, mode_envoi: "test", message: MESSAGE_ENVOI_TEST,
          campagne: { id: apres.id, statut: apres.status, destinataires_prevus: cibles.destinataires }, decision: verdict.charge.decision,
        },
      };
    } catch (e) {
      const message = e instanceof ErreurListmonk ? e.message : "Erreur interne pendant l'envoi.";
      journal(`envoi en échec : ${message}`);
      if (!demarrageDemande) {
        reservees.liberer(cle);
        return refus(502, "listmonk", `Envoi non lancé : ${message}`);
      }
      // Le démarrage a été demandé : on ne sait pas s'il a eu lieu. La preuve reste consommée et l'appelant doit vérifier l'état.
      return { statut: 502, corps: { envoye: false, erreur: "listmonk", incertain: true, message: `Issue inconnue : ${message} Vérifier l'état de la campagne avec etat_campagne avant tout nouvel essai.` } };
    }
  };
}
