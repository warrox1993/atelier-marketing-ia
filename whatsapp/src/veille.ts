/**
 * Ce qui part vers JB sans qu'il ait écrit : réponses du coordinateur général (fil de discussion) et alertes
 * (nouveaux éléments « À faire » : validations, blocages, questions ; cycles épuisés et remises à l'humain du journal).
 *
 * Remise : dans la fenêtre de service client de 24 h (dernier message de l'opérateur), message texte gratuit. Hors fenêtre :
 * - par défaut, l'alerte attend le prochain message de l'opérateur (règle « gratuit uniquement »), dans une file EN MÉMOIRE
 *   seulement (jamais écrite sur le disque : aucun contenu dans etat.json ; un redémarrage la perd) ;
 * - si WHATSAPP_MODELE_HORS_FENETRE=oui, un modèle UTILITAIRE préapprouvé (facturé par Meta à l'unité) annonce le
 *   nombre d'alertes en attente, au plus une fois toutes les 4 heures ; le détail est remis quand JB répond.
 * Jamais de modèle marketing.
 */
import type { ClientAtelier, Departement } from "./atelier.js";
import type { ClientMeta } from "./meta.js";
import type { Etat } from "./etat.js";
import type { Journaliseur } from "./journal.js";
import { LONGUEUR_RAISON_MAX, nettoyerTexteAgent } from "./nettoyage.js";

export const FENETRE_MS = 24 * 3600 * 1000;
/** Marge de sécurité avant la fin de la fenêtre de 24 h. */
export const MARGE_FENETRE_MS = 10 * 60 * 1000;
export const ESPACEMENT_MODELE_MS = 4 * 3600 * 1000;

/** Événements du journal du plugin qui demandent l'humain. */
export const EVENEMENTS_ALERTE: Readonly<Record<string, string>> = {
  "cycles.epuises": "cycles de production épuisés sur une tâche",
  "cycles.remise_humaine": "tâche remise à l'humain après les cycles autorisés",
  "veilleur.abandon": "tâche bloquée abandonnée par le veilleur",
};

export interface DependancesVeille {
  atelier: ClientAtelier;
  meta: ClientMeta;
  etat: Etat;
  journal: Journaliseur;
  destinataire: string;
  entreprise: string;
  modeleHorsFenetre: boolean;
  horloge?: () => number;
}

export function creerVeille(d: DependancesVeille) {
  const maintenant = d.horloge ?? Date.now;
  let derniereModele = 0;

  const fenetreOuverte = () => {
    const t = d.etat.d.derniereEntree[d.destinataire];
    return typeof t === "number" && maintenant() - t < FENETRE_MS - MARGE_FENETRE_MS;
  };

  /** Remet un texte à l'opérateur, ou le met en file si la fenêtre est fermée. */
  async function remettre(texte: string): Promise<void> {
    if (fenetreOuverte()) {
      await d.meta.envoyerTexte(d.destinataire, texte);
      d.journal("remise", { mode: "session" });
      return;
    }
    d.etat.enfiler(texte);
    d.journal("remise_differee", { file: d.etat.file.length });
    if (d.modeleHorsFenetre && maintenant() - derniereModele >= ESPACEMENT_MODELE_MS) {
      derniereModele = maintenant();
      try {
        await d.meta.envoyerModele(d.destinataire, [String(d.etat.file.length)]);
        d.journal("remise", { mode: "modele_utilitaire" });
      } catch (e) {
        d.journal("modele_echec", { erreur: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  /** Appelé après chaque message de l'opérateur : la fenêtre vient de s'ouvrir, la file part. */
  async function viderFile(): Promise<void> {
    if (!fenetreOuverte() || d.etat.file.length === 0) return;
    const textes = d.etat.file.splice(0);
    await d.meta.envoyerTexte(d.destinataire, ["Pendant votre absence :", ...textes].join("\n\n"));
  }

  async function services(): Promise<Departement[]> {
    const deps = await d.atelier.departements().catch(() => [] as Departement[]);
    return deps.length > 0 ? deps : [{ companyId: d.entreprise, slug: "direction", nom: "Direction", estDirection: true }];
  }

  /** Nouveaux messages du coordinateur depuis le dernier passage (le premier passage ne fait que poser le curseur). */
  async function discussion(): Promise<void> {
    const e = d.etat.d;
    if (e.curseurDiscussion === null) {
      e.curseurDiscussion = new Date(maintenant()).toISOString();
      d.etat.sauver();
      return;
    }
    const messages = await d.atelier.messagesDiscussion(e.curseurDiscussion);
    if (messages.length === 0) return;
    e.curseurDiscussion = messages.reduce((a, m) => (m.date > a ? m.date : a), e.curseurDiscussion);
    d.etat.sauver();
    for (const m of messages) if (m.auteur === "agent" && m.texte.trim()) await remettre(`${m.nom} : ${m.texte}`);
  }

  /** Alertes : éléments « À faire » apparus, événements de cycles épuisés. Premier passage : inventaire silencieux. */
  async function alertes(): Promise<void> {
    const e = d.etat.d;
    const premier = !e.initialise;
    const lignes: string[] = [];
    for (const s of await services()) {
      for (const el of await d.atelier.accueil(s.companyId)) {
        const cle = `${s.companyId}:${el.id}`;
        if (Object.hasOwn(e.alertesConnues, cle)) continue;
        e.alertesConnues[cle] = maintenant();
        if (!premier) lignes.push(`• [${nettoyerTexteAgent(s.nom, 60)}] ${nettoyerTexteAgent(el.titre)} : ${nettoyerTexteAgent(el.raison, LONGUEUR_RAISON_MAX)}`);
      }
      let curseur = e.curseursJournal[s.companyId] ?? 0;
      for (let page = 0; page < 20; page++) {
        const j = await d.atelier.journal(s.companyId, curseur);
        for (const ev of j.evenements) {
          const libelle = EVENEMENTS_ALERTE[ev.type];
          if (libelle && !premier) lignes.push(`• [${nettoyerTexteAgent(s.nom, 60)}] ${libelle}${ev.issueId ? ` (tâche ${ev.issueId.slice(0, 8)})` : ""}`);
        }
        curseur = j.dernierSeq;
        if (j.complet) break;
      }
      e.curseursJournal[s.companyId] = curseur;
    }
    e.initialise = true;
    d.etat.sauver();
    if (lignes.length > 0) await remettre([`Atelier : ${lignes.length} nouveauté(s) qui vous attendent.`, ...lignes, "Répondez « attente » pour décider."].join("\n"));
  }

  return { remettre, viderFile, discussion, alertes, fenetreOuverte };
}
