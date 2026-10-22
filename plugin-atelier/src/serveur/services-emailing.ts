/**
 * Envoi d'une campagne e-mail après DÉCISION HUMAINE (service « emailing » de la passerelle).
 *
 * L'envoi n'est jamais un outil d'agent : la passerelle n'a pas d'outil d'envoi. Il se fait en DEUX routes du plugin :
 *  1. `emailing.demander_envoi` : le PLUGIN LIT la campagne chez la passerelle (route interne en lecture : sujet, listes, abonnés
 *     confirmés ciblés, empreintes ; l'agent ne déclare rien), crée lui-même la carte `request_confirmation` sur la tâche avec un
 *     texte construit ici (jamais rédigé par l'agent : un agent pouvait cacher un marqueur dans du Markdown invisible) et enregistre
 *     dans son état (version 2) l'identifiant de la carte, la campagne, l'empreinte du contenu, le nombre de destinataires et
 *     l'empreinte de leurs identifiants ;
 *  2. `emailing.envoyer` : n'accepte QU'une carte ainsi enregistrée (même campagne, même empreinte, texte inchangé), acceptée par un
 *     humain et jamais encore utilisée. Le plugin signe alors, avec la clé
 * d'approbation qu'il est seul à détenir, une preuve à usage unique (format `apv1`, qui couvre aussi le nombre de destinataires et
 * l'empreinte des abonnés acceptés) et la liste de révocation fraîche, puis appelle la
 * route interne de la passerelle (`POST /interne/emailing/envoyer`). La passerelle revérifie tout (preuve, empreinte du contenu,
 * désinscription, mode de test) : tant que le SMTP réel n'est pas configuré, le message va à Mailpit et la réponse le dit.
 *
 * Garanties : une carte acceptée ne sert qu'à UNE campagne et UNE version du contenu ; la carte doit avoir été résolue par un
 * humain (jamais par un agent) ; un agent n'envoie que la campagne d'une tâche qui lui est assignée ; aucune valeur secrète n'est
 * journalisée ni renvoyée.
 */
import { createHash, type KeyObject } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import * as z from "zod";
import { DemanderEnvoiEmailingEntree, EnvoyerEmailingEntree, type CleRouteApi } from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { erreur, erreurValidation } from "./erreurs.js";
import { empreinteArguments, signerPreuve } from "./signatures.js";

/** Mêmes valeurs que `passerelle/src/reel/emailing/envoi.ts` (preuve liée au service, à l'outil et au compte). */
export const SERVICE_EMAILING = "emailing";
export const OUTIL_ENVOI_EMAILING = "envoyer_campagne";
export const COMPTE_EMAILING = "listmonk-local";
export const CHEMIN_ENVOI = "/interne/emailing/envoyer";
/** Route interne en LECTURE de la passerelle (jamais un outil MCP) : ce que la carte doit montrer. */
export const CHEMIN_LECTURE_CAMPAGNE = "/interne/emailing/lire-campagne";
const DELAI_LECTURE_MS = 20_000;
/** Durée de validité de la preuve : le temps d'envoyer, pas plus. */
export const DUREE_PREUVE_ENVOI_S = 600;
const DELAI_ENVOI_MS = 60_000;

/** Clé d'état (portée tâche) du registre des cartes d'envoi créées par le plugin. */
export const CLE_ETAT_CARTES_ENVOI = "cartes-envoi-emailing";

/** Carte d'envoi créée par le plugin : ce que l'humain a vu (empreinte du texte) et si elle a déjà servi. */
export interface CarteEnvoiEnregistree {
  /** 2 : l'accord est lié aux destinataires réels. Une entrée sans `version: 2` est refusée par `envoyer`. */
  version?: number;
  campagneId: number;
  /** Nombre de destinataires et empreinte de leurs identifiants, tels que lus chez la passerelle et montrés à l'humain. */
  destinataires?: number;
  empreinteAbonnes?: string;
  empreinte: string;
  /** Empreinte SHA-256 du texte exact de la carte, pour détecter toute altération. */
  texte: string;
  /** Date ISO de l'usage (carte consommée), ou null. */
  utilisee: string | null;
}
type RegistreCartesEnvoi = Record<string, CarteEnvoiEnregistree>;

const LIMITE_SUJET = 200;
const LIMITE_LISTE = 100;
const LIMITE_EXTRAIT = 300;

/** Ce que la passerelle rend pour une campagne (route interne de lecture). */
const CampagneLue = z.object({
  campagne_id: z.number().int().min(1),
  sujet: z.string().max(1000),
  statut: z.string().max(40),
  listes: z.array(z.object({ id: z.number().int(), nom: z.string().max(500) })).max(50),
  destinataires: z.number().int().min(0),
  empreinte: z.string().regex(/^[0-9a-f]{64}$/),
  empreinte_abonnes: z.string().regex(/^[0-9a-f]{64}$/),
  extrait: z.string().max(2000),
});
type CampagneLue = z.infer<typeof CampagneLue>;

/** Verrou par tâche : les lectures-modifications-écritures du registre des cartes d'une même tâche se suivent, jamais en parallèle. */
const verrous = new Map<string, Promise<unknown>>();
async function avecVerrou<T>(cle: string, travail: () => Promise<T>): Promise<T> {
  const precedent = verrous.get(cle) ?? Promise.resolve();
  const courant = precedent.then(travail, travail);
  const fin = courant.then(() => undefined, () => undefined);
  verrous.set(cle, fin);
  try { return await courant; } finally { if (verrous.get(cle) === fin) verrous.delete(cle); }
}

/** Dépassement de délai (ou annulation) d'un appel : l'issue est INCONNUE, la passerelle a pu recevoir et exécuter la demande. */
function estDelaiDepasse(e: unknown): boolean {
  return typeof e === "object" && e !== null && ["TimeoutError", "AbortError"].includes((e as { name?: string }).name ?? "");
}

/** Rend un texte fourni par un agent inoffensif à l'affichage Markdown : une seule ligne, sans caractère de contrôle, tout caractère
 * syntaxique échappé (plus de lien, de définition de référence, de balise ni de commentaire possibles). */
export function neutraliserMarkdown(texte: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  const brut = texte.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return brut.replace(/[\\`*_{}\[\]()<>#+\-.!|~:&"'=^$%@]/g, (c) => `\\${c}`);
}

/** Texte de la carte, construit côté serveur à partir de valeurs LUES chez la passerelle ; les textes libres sont neutralisés, l'empreinte hexadécimale validée n'est affichée qu'en code. */
export function texteCarteEnvoi(e: { campagneId: number; empreinte: string; sujet: string; listes: Array<{ id: number; nom: string }>; destinataires: number; empreinteAbonnes: string; extrait: string }): { prompt: string; detailsMarkdown: string } {
  const sujet = neutraliserMarkdown(e.sujet, LIMITE_SUJET);
  const listes = e.listes.map((l) => ({ id: l.id, nom: neutraliserMarkdown(l.nom, LIMITE_LISTE) })).filter((l) => l.nom.length > 0);
  const extrait = neutraliserMarkdown(e.extrait, LIMITE_EXTRAIT);
  return {
    // Titre en texte simple, sans aucun texte libre : seuls des nombres entiers y figurent.
    prompt: `Envoyer la campagne numéro ${e.campagneId} à ${e.destinataires} destinataire${e.destinataires > 1 ? "s" : ""} ?`,
    detailsMarkdown: [
      `- Campagne : numéro ${e.campagneId}`,
      `- Sujet : ${sujet}`,
      `- Listes : ${listes.length > 0 ? listes.map((l) => `liste ${l.id} « ${l.nom} »`).join(", ") : "aucune"}`,
      `- Destinataires confirmés, lus dans listmonk : ${e.destinataires}`,
      `- Début du texte : ${extrait.length > 0 ? extrait : "vide"}`,
      `- Empreinte du contenu : \`${e.empreinte}\``,
      `- Empreinte des abonnés : \`${e.empreinteAbonnes}\``,
      "",
      "Accepter autorise l'envoi de cette version exacte du contenu à ces destinataires précis, une seule fois. Si le contenu ou la liste d'abonnés change, une nouvelle confirmation est nécessaire.",
    ].join("\n"),
  };
}

function empreinteTexte(c: { prompt: string; detailsMarkdown: string }): string {
  return createHash("sha256").update(`${c.prompt}\n${c.detailsMarkdown}`).digest("hex");
}

export interface DependancesEmailing {
  ctx: PluginContext;
  base: BaseAtelier;
  /** Clé privée d'approbation de l'entreprise (secret natif), ou null avec le motif. */
  cleApprobation: (companyId: string) => Promise<{ cle: KeyObject | null; motif?: string }>;
  /** Liste de révocation signée (arv1) fraîche de l'entreprise. */
  revocations: (companyId: string) => Promise<string>;
  /** Adresse de la passerelle (réglage `passerelleUrl`), boucle locale seulement ; null si absente ou illisible. */
  adressePasserelle: (companyId: string) => Promise<URL | null>;
  /** Tests : remplace le fetch de Node. */
  fetchLocal?: (url: string, init: RequestInit) => Promise<Response>;
  maintenant?: () => Date;
}

/** Est-ce la carte créée par le plugin (enregistrée), inchangée, pas encore utilisée, et acceptée par un humain ? */
function carteValide(i: Awaited<ReturnType<PluginContext["issues"]["listInteractions"]>>[number], reg: RegistreCartesEnvoi, campagneId: number, empreinte: string): boolean {
  const e = reg[i.id];
  if (!e || e.version !== 2 || e.utilisee !== null || e.campagneId !== campagneId || e.empreinte !== empreinte) return false;
  if (typeof e.destinataires !== "number" || typeof e.empreinteAbonnes !== "string") return false;
  if (i.kind !== "request_confirmation" || i.status !== "accepted") return false;
  if (!i.resolvedByUserId || i.resolvedByAgentId) return false;
  const p = i.payload as { prompt?: unknown; detailsMarkdown?: unknown };
  if (typeof p.prompt !== "string" || typeof p.detailsMarkdown !== "string") return false;
  return empreinteTexte({ prompt: p.prompt, detailsMarkdown: p.detailsMarkdown }) === e.texte;
}

export function routesEmailing(d: DependancesEmailing): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, base } = d;
  const appel = (url: string, init: RequestInit) => (d.fetchLocal ?? globalThis.fetch)(url, init);
  const maintenant = d.maintenant ?? ((): Date => new Date());
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  /** Lit le registre des cartes d'envoi d'une tâche (objet vide si rien ou valeur illisible). */
  const lireRegistre = async (issueId: string): Promise<RegistreCartesEnvoi> => {
    const v = await ctx.state.get({ scopeKind: "issue", scopeId: issueId, stateKey: CLE_ETAT_CARTES_ENVOI });
    return v && typeof v === "object" && !Array.isArray(v) ? (v as RegistreCartesEnvoi) : {};
  };
  const ecrireRegistre = (issueId: string, reg: RegistreCartesEnvoi) => ctx.state.set({ scopeKind: "issue", scopeId: issueId, stateKey: CLE_ETAT_CARTES_ENVOI }, reg);
  /** Relit le registre FRAIS sous le verrou de la tâche, applique la modification et l'écrit : aucune écriture ne peut en écraser une autre. */
  const modifierRegistre = (issueId: string, modifier: (reg: RegistreCartesEnvoi) => void) =>
    avecVerrou(issueId, async () => { const reg = await lireRegistre(issueId); modifier(reg); await ecrireRegistre(issueId, reg); });
  /** Ce que la passerelle sait de la campagne MAINTENANT (route interne en lecture) : sujet, listes, abonnés confirmés ciblés, empreintes. */
  const lireCampagne = async (companyId: string, campagneId: number): Promise<CampagneLue> => {
    const adresse = await d.adressePasserelle(companyId);
    if (!adresse) erreur("emailing_indisponible", "Adresse de la passerelle absente ou hors de cette machine (réglage « passerelleUrl »).");
    let reponse: Response;
    try {
      reponse = await appel(new URL(CHEMIN_LECTURE_CAMPAGNE, adresse).toString(), {
        method: "POST", headers: { "content-type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(DELAI_LECTURE_MS), body: JSON.stringify({ campagne_id: campagneId }),
      });
    } catch {
      erreur("emailing_indisponible", "La passerelle ne répond pas : la campagne n'a pas pu être lue, aucune carte n'est créée.");
    }
    let corps: unknown = null;
    try { corps = await reponse.json(); } catch { /* corps illisible : refus ci-dessous */ }
    if (!reponse.ok) {
      const message = typeof (corps as { message?: unknown } | null)?.message === "string" ? String((corps as { message: string }).message) : `HTTP ${reponse.status}`;
      erreur(reponse.status >= 500 ? "emailing_indisponible" : "conflit", `Lecture de la campagne ${campagneId} refusée : ${message}`);
    }
    const lue = CampagneLue.safeParse(corps);
    if (!lue.success || lue.data.campagne_id !== campagneId) erreur("emailing_indisponible", "Réponse illisible de la passerelle pour la campagne : aucune carte n'est créée.");
    return lue.data;
  };
  const verifierTache = async (r: { companyId: string; acteur: ActeurHote }, issueId: string) => {
    if (r.acteur.type === "systeme") erreur("elevation_refusee", "L'envoi d'e-mails est réservé à un humain ou à l'agent de la tâche.");
    const tache = await ctx.issues.get(issueId, r.companyId);
    if (!tache || tache.companyId.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Tâche introuvable dans cette entreprise.");
    if (r.acteur.type === "agent" && tache.assigneeAgentId !== r.acteur.agentId) erreur("elevation_refusee", "Refusé : la tâche n'est pas assignée à l'agent appelant.");
    return tache;
  };

  routes["emailing.demander_envoi"] = async (r) => {
    const c = (r.corps as { companyId?: unknown } | null)?.companyId;
    if (typeof c === "string" && c.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Le corps désigne une autre entreprise que celle de la route.");
    const p = DemanderEnvoiEmailingEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Demande d'envoi d'e-mails", p.error.issues);
    const { issueId, campagneId, empreinte } = p.data;
    const tache = await verifierTache(r, issueId);

    // La carte montre ce que la passerelle lit dans la campagne, pas ce que l'agent déclare.
    const lue = await lireCampagne(r.companyId, campagneId);
    if (lue.statut !== "draft") erreur("conflit", `La campagne ${campagneId} est « ${lue.statut} » et non en brouillon : aucun envoi à confirmer.`);
    if (lue.empreinte !== empreinte) erreur("conflit", `L'empreinte indiquée n'est pas celle de la campagne ${campagneId} (le contenu a changé ou l'empreinte est fausse) : relire l'empreinte avec etat_campagne.`);
    const texte = texteCarteEnvoi({ campagneId, empreinte, sujet: lue.sujet, listes: lue.listes, destinataires: lue.destinataires, empreinteAbonnes: lue.empreinte_abonnes, extrait: lue.extrait });
    const signature = empreinteTexte(texte);

    const resultat = await avecVerrou(tache.id, async () => {
      // Une carte identique (même texte, mêmes abonnés) encore en attente est réutilisée : pas de doublon à accepter.
      const registre = await lireRegistre(tache.id);
      const existantes = await ctx.issues.listInteractions(tache.id, r.companyId);
      const attente = existantes.find((i) => {
        const e = registre[i.id];
        return i.kind === "request_confirmation" && i.status === "pending" && e?.version === 2 && e.texte === signature && e.empreinteAbonnes === lue.empreinte_abonnes && e.utilisee === null;
      });
      if (attente) return { carteId: attente.id, reutilisee: true };
      const carte = await ctx.issues.requestConfirmation(tache.id, { continuationPolicy: "wake_assignee_on_accept", resolverPolicy: "human_only", payload: { version: 1, ...texte, acceptLabel: "Envoyer", rejectLabel: "Ne pas envoyer", supersedeOnUserComment: false, allowDeclineReason: true } }, r.companyId);
      registre[carte.id] = { version: 2, campagneId, empreinte, texte: signature, utilisee: null, destinataires: lue.destinataires, empreinteAbonnes: lue.empreinte_abonnes };
      await ecrireRegistre(tache.id, registre);
      return { carteId: carte.id, reutilisee: false };
    });
    if (!resultat.reutilisee) {
      await base.journaliser({
        companyId: r.companyId, type: "emailing.envoi_demande", entite: "campagne_emailing", entiteId: String(campagneId), issueId: tache.id,
        runId: r.acteur.runId, acteur: r.acteur.id, donnees: { empreinte, carte: resultat.carteId, destinataires: lue.destinataires, empreinteAbonnes: lue.empreinte_abonnes },
      });
    }
    return { corps: { carteId: resultat.carteId, statut: "en_attente", reutilisee: resultat.reutilisee } };
  };

  routes["emailing.envoyer"] = async (r) => {
    const c = (r.corps as { companyId?: unknown } | null)?.companyId;
    if (typeof c === "string" && c.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Le corps désigne une autre entreprise que celle de la route.");
    const p = EnvoyerEmailingEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Envoi d'e-mails", p.error.issues);
    const { issueId, campagneId, empreinte } = p.data;
    const acteur: ActeurHote = r.acteur;
    const tache = await verifierTache(r, issueId);

    // Sous le verrou de la tâche : trouver la carte valide, signer, puis la CONSOMMER avant tout appel (usage unique, pas de double envoi
    // en parallèle). Les erreurs (carte, clé, adresse) sont levées avant la consommation.
    const { carte, entree, preuve, revocations, adresse } = await avecVerrou(tache.id, async () => {
      const registre = await lireRegistre(tache.id);
      const cartes = await ctx.issues.listInteractions(tache.id, r.companyId);
      const trouvee = cartes.find((i) => carteValide(i, registre, campagneId, empreinte));
      if (!trouvee) {
        erreur("elevation_refusee", `Envoi refusé : aucune carte de confirmation créée par le plugin pour la campagne ${campagneId} (POST /emailing/demander-envoi), de version 2, acceptée par un humain, inchangée et pas encore utilisée. Demander l'envoi par cette route, puis attendre la décision de l'humain.`);
      }
      const { cle, motif } = await d.cleApprobation(r.companyId);
      if (!cle) erreur("conflit", `Envoi impossible : ${motif ?? "clé d'approbation indisponible"}.`);
      const adr = await d.adressePasserelle(r.companyId);
      if (!adr) erreur("emailing_indisponible", "Adresse de la passerelle absente ou hors de cette machine (réglage « passerelleUrl »).");
      const e = registre[trouvee.id]!;
      // La preuve couvre la campagne, son contenu ET les destinataires que l'humain a vus (nombre et empreinte de leurs identifiants).
      const args = { campagne_id: campagneId, empreinte, destinataires: e.destinataires!, empreinte_abonnes: e.empreinteAbonnes! };
      const s = Math.floor(maintenant().getTime() / 1000);
      const p = signerPreuve(cle, {
        v: 1, cle: `atelier-envoi-${trouvee.id}`, service: SERVICE_EMAILING, outil: OUTIL_ENVOI_EMAILING, empreinte: empreinteArguments(args), compte: COMPTE_EMAILING,
        diffusion: `envoi-${trouvee.id}`, decision: trouvee.id, emis: s, expire: s + DUREE_PREUVE_ENVOI_S, entreprise: r.companyId,
      });
      const rev = await d.revocations(r.companyId);
      registre[trouvee.id] = { ...e, utilisee: maintenant().toISOString() };
      await ecrireRegistre(tache.id, registre);
      return { carte: trouvee, entree: e, preuve: p, revocations: rev, adresse: adr };
    });
    /** Rend la carte (rien n'a pu partir), sur un registre relu sous le verrou. */
    const rendre = () => modifierRegistre(tache.id, (reg) => { if (reg[carte.id]) reg[carte.id] = { ...reg[carte.id]!, utilisee: null }; });
    /** L'issue est inconnue : la carte reste consommée, on le journalise et on dit de vérifier la campagne. */
    const incertain = async (cause: string): Promise<never> => {
      await base.journaliser({
        companyId: r.companyId, type: "emailing.envoi_incertain", entite: "campagne_emailing", entiteId: String(campagneId), issueId: tache.id,
        runId: acteur.runId, acteur: acteur.id, donnees: { empreinte, carte: carte.id, cause },
      });
      return erreur("emailing_indisponible", `Issue inconnue : la passerelle n'a pas confirmé (${cause}). L'envoi a peut-être eu lieu : vérifier l'état de la campagne avec etat_campagne avant tout nouvel essai. La carte est consommée.`);
    };

    let reponse: Response;
    try {
      reponse = await appel(new URL(CHEMIN_ENVOI, adresse).toString(), {
        method: "POST", headers: { "content-type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(DELAI_ENVOI_MS),
        body: JSON.stringify({ campagne_id: campagneId, empreinte, destinataires: entree.destinataires, empreinte_abonnes: entree.empreinteAbonnes, preuve_approbation: preuve, revocations_approbation: revocations }),
      });
    } catch (e) {
      if (estDelaiDepasse(e)) return incertain("délai dépassé");
      await rendre();
      erreur("emailing_indisponible", "La passerelle ne répond pas : rien n'a été envoyé.");
    }
    let corps: Record<string, unknown> = {};
    let lisible = true;
    try { corps = (await reponse.json()) as Record<string, unknown>; } catch { lisible = false; /* corps illisible : issue inconnue ci-dessous */ }
    if (!lisible) return incertain(`réponse illisible, HTTP ${reponse.status}`);
    const envoye = reponse.ok && corps["envoye"] === true;
    await base.journaliser({
      companyId: r.companyId, type: envoye ? "emailing.envoi_lance" : "emailing.envoi_refuse", entite: "campagne_emailing", entiteId: String(campagneId), issueId: tache.id,
      runId: acteur.runId, acteur: acteur.id,
      donnees: { empreinte, carte: carte.id, mode: corps["mode_envoi"] ?? null, code: corps["erreur"] ?? null, statutPasserelle: reponse.status },
    });
    if (!envoye) {
      // « incertain » : la passerelle a demandé le démarrage à listmonk sans savoir s'il a eu lieu ; la carte reste consommée.
      if (corps["incertain"] === true) return incertain("démarrage demandé, résultat inconnu");
      if (reponse.status >= 500) await rendre();
      const message = typeof corps["message"] === "string" ? corps["message"] : `La passerelle a refusé l'envoi (HTTP ${reponse.status}).`;
      erreur(reponse.status === 403 ? "diffusion_refusee" : reponse.status >= 500 ? "emailing_indisponible" : "conflit", message);
    }
    return { corps: { envoye: true, modeEnvoi: corps["mode_envoi"], message: corps["message"], campagne: corps["campagne"] } };
  };

  return routes;
}
