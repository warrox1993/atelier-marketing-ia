/**
 * Assemblage : serveur du webhook, pilote des commandes, veille (alertes et réponses du coordinateur).
 * Toutes les dépendances externes (Meta, atelier, horloge) sont injectables pour les tests.
 */
import type { Server } from "node:http";
import { clientAtelier, type ClientAtelier } from "./atelier.js";
import { CodesConfirmation } from "./codes.js";
import type { Config } from "./config.js";
import { Etat } from "./etat.js";
import { journalTechnique, registreFichier, type Journaliseur, type Registre } from "./journal.js";
import { clientMeta, type ClientMeta } from "./meta.js";
import { creerPilote, type Charge } from "./pilote.js";
import { AVERTISSEMENT_DEBIT, creerServeur, type MessageEntrant } from "./serveur.js";
import { creerVeille } from "./veille.js";

export interface OptionsApplication {
  config: Config;
  atelier?: ClientAtelier;
  meta?: ClientMeta;
  etat?: Etat;
  journal?: Journaliseur;
  registre?: Registre;
  horloge?: () => number;
  tirageCode?: () => number;
}

export function creerApplication(o: OptionsApplication) {
  const horloge = o.horloge ?? Date.now;
  const journal = o.journal ?? journalTechnique;
  const etat = o.etat ?? new Etat(o.config.fichierEtat);
  const atelier = o.atelier ?? clientAtelier(o.config);
  const meta = o.meta ?? clientMeta(o.config);
  const registre = o.registre ?? registreFichier(o.config.fichierJournal);
  const codes = new CodesConfirmation<Charge>(horloge, o.tirageCode);
  const pilote = creerPilote({ atelier, codes, registre, entreprise: o.config.entreprise, contenuSensible: o.config.contenuSensible });
  const destinataire = o.config.numerosAutorises[0]!;
  const veille = creerVeille({ atelier, meta, etat, journal, destinataire, entreprise: o.config.entreprise, modeleHorsFenetre: o.config.modeleHorsFenetre, horloge });

  async function traiter(m: MessageEntrant): Promise<void> {
    const reponse = m.texte === null ? "Seuls les messages texte sont pris en charge. Envoyez « aide » pour la liste des commandes." : await pilote.traiter(m.de, m.texte);
    try {
      await meta.envoyerTexte(m.de, reponse);
    } catch (e) {
      journal("reponse_echec", { erreur: e instanceof Error ? e.message : "inconnue" });
    }
    try {
      await veille.viderFile();
    } catch (e) {
      journal("file_echec", { erreur: e instanceof Error ? e.message : "inconnue" });
    }
  }

  async function avertirDebit(de: string): Promise<void> {
    await meta.envoyerTexte(de, AVERTISSEMENT_DEBIT);
  }

  const { serveur, attendre } = creerServeur({ config: o.config, etat, journal, traiter, avertirDebit, horloge });
  const minuteries: NodeJS.Timeout[] = [];
  let enCours = { alertes: false, discussion: false };

  async function passe(quoi: "alertes" | "discussion") {
    if (enCours[quoi]) return;
    enCours = { ...enCours, [quoi]: true };
    try {
      await (quoi === "alertes" ? veille.alertes() : veille.discussion());
    } catch (e) {
      journal(`${quoi}_echec`, { erreur: e instanceof Error ? e.message.slice(0, 200) : "inconnue" });
    } finally {
      enCours = { ...enCours, [quoi]: false };
    }
  }

  return {
    serveur: serveur as Server,
    attendre,
    veille,
    etat,
    demarrerVeille() {
      void passe("discussion");
      void passe("alertes");
      minuteries.push(setInterval(() => void passe("discussion"), o.config.intervalleDiscussionMs));
      minuteries.push(setInterval(() => void passe("alertes"), o.config.intervalleAlertesMs));
    },
    arreter() {
      minuteries.splice(0).forEach(clearInterval);
      serveur.close();
    },
  };
}
