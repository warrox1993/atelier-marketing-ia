// Service réel « emailing » : cinq outils sur listmonk v6.2.0 local. L'ENVOI n'est PAS un outil : voir envoi.ts (route humaine).
//
//   lister_listes, etat_campagne                          lecture
//   creer_liste, ajouter_abonnes, creer_campagne_brouillon   écriture sans envoi
//
// Règles : un abonné n'entre qu'avec la preuve de son consentement (date, source, texte accepté) ; un abonné sur liste de suppression
// (blocklisté) ou désinscrit de la liste n'est jamais réinscrit ; une campagne n'est jamais créée autrement qu'en brouillon ; le lien
// de désinscription figure dans chaque campagne ; toute adresse privée ou locale citée (source du consentement, liens) est refusée.
// Le jeton utilisé ici n'a PAS le droit d'envoi (rôle listmonk « atelier-gestion »).

import { createHash } from "node:crypto";
import * as z from "zod";
import type { FournisseurService, OutilPasserelle } from "../../fournisseurs.js";
import { FICHE_EMAILING } from "../../services.js";
import { exigerUrlPublique, type OptionsVerification } from "../liens/verifier-url.js";
import { retirerInvisibles } from "../extraction/contenu-tiers.js";
import { ClientListmonk, ErreurListmonk, MESSAGE_ENVOI_TEST, lireJetonListmonk, modeEnvoi, type CampagneListmonk } from "./listmonk.js";
import { controlerContenu, ErreurContenu } from "./contenu-courriel.js";
export { FICHE_EMAILING };

export const GABARIT_CAMPAGNE = "atelier-corps";
export const ABONNES_MAX_PAR_APPEL = 50;
export const DATE_RGPD = "2018-05-25";
const RE_EMAIL = /^[^\s@<>()[\]\\,;:"'`]{1,64}@[^\s@<>()[\]\\,;:"'`]{1,190}\.[A-Za-z]{2,24}$/;
// eslint-disable-next-line no-control-regex
const RE_CONTROLE = /[\u0000-\u001f\u007f]/;

export interface OptionsEmailing extends Pick<OptionsVerification, "adresseAutorisee" | "resoudre"> {
  /** Client listmonk à droits de gestion (sans envoi). */
  client: ClientListmonk;
  maintenant?: () => Date;
  journal?: (message: string) => void;
}

/** Variables : PASSERELLE_LISTMONK_URL (boucle locale), PASSERELLE_LISTMONK_JETON_FICHIER (jeton « gestion », fichier 0600). */
export function optionsEmailingDepuisEnv(env: NodeJS.ProcessEnv): OptionsEmailing {
  const fichier = env["PASSERELLE_LISTMONK_JETON_FICHIER"]?.trim();
  if (!fichier) throw new Error("PASSERELLE_LISTMONK_JETON_FICHIER absent : le jeton d'API de listmonk est obligatoire.");
  const url = env["PASSERELLE_LISTMONK_URL"]?.trim();
  return { client: new ClientListmonk({ ...(url ? { url } : {}), jeton: lireJetonListmonk(fichier, "PASSERELLE_LISTMONK_JETON_FICHIER") }) };
}

/** Texte tiers : caractères invisibles retirés, espaces normalisés, sans caractère de contrôle (anti-injection d'en-têtes). */
function nettoyer(valeur: string): string {
  return retirerInvisibles(valeur).texte.replace(/\s+/gu, " ").trim();
}

export const schemaConsentement = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/, "date ISO attendue (AAAA-MM-JJ)").describe("Date du consentement (AAAA-MM-JJ), ni dans le futur ni avant le 25/05/2018."),
  source: z.string().min(3).max(300).describe("Où le consentement a été recueilli (formulaire, salon, page...). Une adresse web doit être publique."),
  texte: z.string().min(10).max(2000).describe("Texte exact que la personne a accepté."),
}).strict();

export const schemaAbonne = z.object({
  email: z.string().min(6).max(254),
  nom: z.string().max(120).optional(),
  consentement: schemaConsentement,
}).strict();

export const schemaListerListes = {};
export const schemaCreerListe = {
  nom: z.string().min(2).max(100).describe("Nom de la liste (unique)."),
  description: z.string().max(300).optional(),
};
export const schemaAjouterAbonnes = {
  liste_id: z.number().int().min(1).describe("Identifiant de la liste (lister_listes)."),
  abonnes: z.array(schemaAbonne).min(1).max(ABONNES_MAX_PAR_APPEL).describe(`Abonnés à inscrire (${ABONNES_MAX_PAR_APPEL} au plus). CHACUN porte la preuve de son consentement ; sans elle, l'appel est refusé.`),
};
export const schemaCreerCampagneBrouillon = {
  nom: z.string().min(2).max(150).describe("Nom interne de la campagne."),
  sujet: z.string().min(2).max(200).describe("Sujet du message."),
  liste_ids: z.array(z.number().int().min(1)).min(1).max(5).describe("Listes destinataires."),
  contenu_html: z.string().min(10).max(200_000).describe("Contenu HTML. Le lien de désinscription est ajouté en pied de page s'il manque."),
  contenu_texte: z.string().min(5).max(100_000).describe("Version texte du même message."),
};
export const schemaEtatCampagne = { campagne_id: z.number().int().min(1) };

interface ResultatAbonne { email: string; resultat: "ajoute" | "deja_present" | "supprime" | "desinscrit" | "refuse"; motif?: string }

function validerDate(date: string, maintenant: Date): string | null {
  const t = Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date);
  if (!Number.isFinite(t)) return "date de consentement illisible";
  if (t > maintenant.getTime() + 24 * 3600_000) return "date de consentement dans le futur";
  if (t < Date.parse(`${DATE_RGPD}T00:00:00Z`)) return `date de consentement antérieure au ${DATE_RGPD} (RGPD)`;
  return null;
}

/** Empreinte du contenu qu'un humain approuve : sujet, corps, texte, listes et gabarit (le statut n'y entre pas). */
export function empreinteCampagne(c: Pick<CampagneListmonk, "subject" | "body" | "altbody" | "lists" | "template_id">): string {
  const forme = JSON.stringify({ s: c.subject, b: c.body, a: c.altbody ?? "", l: c.lists.map((x) => x.id).sort((a, b) => a - b), t: c.template_id });
  return createHash("sha256").update(forme, "utf8").digest("hex");
}

function resumerCampagne(c: CampagneListmonk) {
  return {
    id: c.id, nom: c.name, sujet: c.subject, statut: c.status, listes: c.lists.map((l) => ({ id: l.id, nom: l.name })),
    destinataires_prevus: c.to_send, envoyes: c.sent, debut: c.started_at, mis_a_jour: c.updated_at, empreinte: empreinteCampagne(c),
  };
}

export function outilsEmailing(options: OptionsEmailing): OutilPasserelle[] {
  const { client } = options;
  const maintenant = options.maintenant ?? ((): Date => new Date());
  const journal = options.journal ?? ((): void => undefined);
  const verif = { ...(options.adresseAutorisee ? { adresseAutorisee: options.adresseAutorisee } : {}), ...(options.resoudre ? { resoudre: options.resoudre } : {}) };
  const consigne = "Écriture sans envoi : rien n'est envoyé par cet outil. L'envoi d'une campagne est une décision humaine prise dans l'atelier (carte de confirmation).";

  return [
    {
      nom: "lister_listes",
      description: "LECTURE. Liste les listes de diffusion (identifiant, nom, nombre d'abonnés) et rappelle que l'envoi est de test tant que le SMTP réel n'est pas configuré.",
      schemaEntree: schemaListerListes,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      executer: async () => {
        const listes = await client.listes();
        return { listes: listes.map((l) => ({ id: l.id, nom: l.name, abonnes: l.subscriber_count })), mode_envoi: await modeEnvoi(client) };
      },
    },
    {
      nom: "creer_liste",
      description: `ÉCRITURE (sans envoi). Crée une liste de diffusion privée au nom unique. ${consigne}`,
      schemaEntree: schemaCreerListe,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      executer: async (args) => {
        const a = args as { nom: string; description?: string };
        const nom = nettoyer(a.nom);
        if (nom.length < 2) throw new Error("Nom de liste vide après nettoyage.");
        if ((await client.listes()).some((l) => l.name.toLowerCase() === nom.toLowerCase())) throw new Error(`Une liste « ${nom} » existe déjà : utiliser lister_listes.`);
        const l = await client.creerListe(nom, nettoyer(a.description ?? ""));
        journal(`creer_liste ok (liste ${l.id})`);
        return { liste: { id: l.id, nom: l.name }, note: consigne };
      },
    },
    {
      nom: "ajouter_abonnes",
      description:
        `ÉCRITURE (sans envoi). Inscrit des abonnés à une liste, ${ABONNES_MAX_PAR_APPEL} au plus par appel. Chaque abonné DOIT porter la preuve de son consentement ` +
        "(date, source, texte accepté) ; un abonné sans preuve fait refuser tout l'appel. Un abonné sur la liste de suppression (blocklisté) ou désinscrit de cette liste n'est jamais réinscrit. " +
        `Une source qui est une adresse web doit être publique. ${consigne}`,
      schemaEntree: schemaAjouterAbonnes,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      executer: async (args) => {
        const a = args as { liste_id: number; abonnes: Array<z.infer<typeof schemaAbonne>> };
        const maint = maintenant();
        // 1. Contrôle de TOUT l'appel avant la moindre écriture : un seul abonné sans preuve valide fait tout refuser.
        const prets: Array<{ email: string; nom: string; consentement: { date: string; source: string; texte: string } }> = [];
        const vus = new Set<string>();
        for (const ab of a.abonnes) {
          const email = ab.email.trim().toLowerCase();
          if (!RE_EMAIL.test(email) || RE_CONTROLE.test(email)) throw new Error(`Adresse e-mail invalide : « ${ab.email.slice(0, 60)} ». Appel refusé.`);
          if (vus.has(email)) throw new Error(`Adresse en double dans l'appel : ${email}. Appel refusé.`);
          vus.add(email);
          const probleme = validerDate(ab.consentement.date, maint);
          if (probleme) throw new Error(`${email} : ${probleme}. Appel refusé : aucun abonné n'est ajouté sans preuve de consentement valable.`);
          const source = nettoyer(ab.consentement.source);
          const texte = nettoyer(ab.consentement.texte);
          if (source.length < 3 || texte.length < 10) throw new Error(`${email} : source ou texte de consentement vide. Appel refusé.`);
          if (/^https?:\/\//i.test(source)) {
            try { await exigerUrlPublique(source, verif); } catch (e) { throw new Error(`${email} : source du consentement refusée (${e instanceof Error ? e.message : String(e)}) Appel refusé.`); }
          }
          prets.push({ email, nom: nettoyer(ab.nom ?? "") || email.split("@")[0]!, consentement: { date: ab.consentement.date, source, texte } });
        }
        const listes = await client.listes();
        const liste = listes.find((l) => l.id === a.liste_id);
        if (!liste) throw new Error(`Liste ${a.liste_id} introuvable (lister_listes).`);
        // 2. Inscription une à une, en respectant la suppression.
        const resultats: ResultatAbonne[] = [];
        for (const p of prets) {
          const existant = await client.chercherAbonne(p.email);
          if (existant) {
            if (existant.status === "blocklisted") { resultats.push({ email: p.email, resultat: "supprime", motif: "adresse sur la liste de suppression : jamais réinscrite" }); continue; }
            const abonnement = existant.lists?.find((l) => l.id === a.liste_id);
            if (abonnement?.subscription_status === "unsubscribed") { resultats.push({ email: p.email, resultat: "desinscrit", motif: "la personne s'est désinscrite de cette liste : jamais réinscrite" }); continue; }
            if (abonnement) { resultats.push({ email: p.email, resultat: "deja_present" }); continue; }
            await client.ajouterALaListe(existant.id, a.liste_id);
            resultats.push({ email: p.email, resultat: "ajoute" });
            continue;
          }
          try {
            await client.creerAbonne({
              email: p.email, nom: p.nom, listeId: a.liste_id,
              attribs: { consentement: { ...p.consentement, enregistre_le: maint.toISOString(), enregistre_par: "passerelle-emailing" } },
            });
            resultats.push({ email: p.email, resultat: "ajoute" });
          } catch (e) {
            if (e instanceof ErreurListmonk && e.statut === 409) resultats.push({ email: p.email, resultat: "deja_present" });
            else throw e;
          }
        }
        journal(`ajouter_abonnes ok, liste ${a.liste_id}, ${resultats.filter((r) => r.resultat === "ajoute").length} ajouté(s) sur ${resultats.length}`);
        return { liste: { id: liste.id, nom: liste.name }, resultats, note: consigne };
      },
    },
    {
      nom: "creer_campagne_brouillon",
      description:
        "ÉCRITURE (sans envoi). Crée une campagne en BROUILLON (sujet, contenu HTML et texte, listes). Elle ne s'envoie jamais toute seule : l'envoi est une décision humaine dans l'atelier. " +
        "Le lien de désinscription est ajouté en pied de page s'il manque. Refusés : script, formulaire, balise de gabarit hors liste blanche, lien vers une adresse locale ou privée, lien relatif. " +
        "La réponse donne l'empreinte du contenu : à citer telle quelle dans la demande de confirmation d'envoi (marqueur [envoi-emailing:<id>:<empreinte>]).",
      schemaEntree: schemaCreerCampagneBrouillon,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      executer: async (args) => {
        const a = args as { nom: string; sujet: string; liste_ids: number[]; contenu_html: string; contenu_texte: string };
        const sujet = nettoyer(a.sujet);
        const nom = nettoyer(a.nom);
        if (sujet.length < 2 || nom.length < 2) throw new Error("Nom ou sujet vide après nettoyage.");
        const ids = [...new Set(a.liste_ids)];
        const listes = await client.listes();
        const inconnues = ids.filter((id) => !listes.some((l) => l.id === id));
        if (inconnues.length > 0) throw new Error(`Liste(s) introuvable(s) : ${inconnues.join(", ")}.`);
        let controle;
        try {
          controle = await controlerContenu(retirerInvisibles(a.contenu_html).texte, retirerInvisibles(a.contenu_texte).texte, verif);
        } catch (e) {
          if (e instanceof ErreurContenu) throw e;
          throw new Error(`Contenu refusé : ${e instanceof Error ? e.message : String(e)}`);
        }
        const gabaritId = await client.gabaritParNom(GABARIT_CAMPAGNE);
        if (gabaritId === null) throw new Error(`Gabarit « ${GABARIT_CAMPAGNE} » absent de listmonk : relancer scripts/emailing-provisionner.py.`);
        const c = await client.creerCampagne({ nom, sujet, listeIds: ids, html: controle.html, texte: controle.texte, gabaritId });
        if (c.status !== "draft") throw new Error(`listmonk a créé la campagne ${c.id} avec l'état « ${c.status} » au lieu de « draft » : arrêt par prudence.`);
        const complete = await client.campagne(c.id);
        journal(`creer_campagne_brouillon ok (campagne ${c.id}, brouillon)`);
        return { campagne: resumerCampagne(complete), desinscription_ajoutee: controle.desinscriptionAjoutee, liens_verifies: controle.liens, note: `${consigne} ${MESSAGE_ENVOI_TEST}` };
      },
    },
    {
      nom: "etat_campagne",
      description: "LECTURE. État d'une campagne : statut (draft, running, finished...), destinataires prévus, messages envoyés, empreinte du contenu, et le mode d'envoi (test : rien ne part de la machine).",
      schemaEntree: schemaEtatCampagne,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      executer: async (args) => {
        const c = await client.campagne((args as { campagne_id: number }).campagne_id);
        const mode = await modeEnvoi(client);
        return { campagne: resumerCampagne(c), mode_envoi: mode, ...(mode === "test" ? { avertissement: MESSAGE_ENVOI_TEST } : {}) };
      },
    },
  ];
}

export function fournisseurEmailingReel(options: OptionsEmailing): FournisseurService {
  return { service: "emailing", mode: "reel", fiche: FICHE_EMAILING, outils: outilsEmailing(options), autorisationLocale: true, verifierJeton: () => null };
}
