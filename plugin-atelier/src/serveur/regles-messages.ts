/**
 * Règles d'autorisation des messages typés (cahier §6). Fonctions pures.
 *
 * - aucune élévation : un message ne transporte ni approbation, ni droit,
 *   ni budget, ni politique (champs refusés, où qu'ils soient) ;
 * - appartenance : destinataire de la même entreprise, tâche de la même
 *   entreprise et, si la tâche a un projet, références dans ce projet ;
 * - rôles : « décision » réservée à l'humain ou au coordinateur de la
 *   campagne ; constats et corrections réservés aux relecteurs désignés ;
 * - pas de diffusion générale ni de boucle : un seul destinataire, pas soi-même,
 *   débit borné par expéditeur et par tâche.
 */
import { CLES_INTERDITES_MESSAGE, type ContenuMessage, type Destinataire } from "../contrats/index.js";

export interface ContexteMessage {
  expediteur: { type: "agent" | "humain"; id: string };
  destinataire: Destinataire;
  contenu: ContenuMessage;
  /** Agents (id) de l'entreprise de la tâche. */
  agentsEntreprise: ReadonlySet<string>;
  /** Utilisateurs humains autorisés comme destinataires (board, responsable). */
  humainsAutorises: ReadonlySet<string>;
  /** Coordinateur de la campagne (assigné de la tâche de brief), s'il est connu. */
  coordinateurAgentId: string | null;
  /** Relecteurs désignés de la porte de la tâche. */
  relecteursDesignes: ReadonlySet<string>;
  /** Messages précédents de la tâche (pour réponses et contrats). */
  precedents: ReadonlyArray<{ messageId: string; type: string; destinataireId: string; expediteurId: string }>;
  /** Messages envoyés par cet expéditeur sur cette tâche dans la dernière heure. */
  envoisRecents: number;
}

export const DEBIT_MAX_PAR_HEURE = 30;

export type RefusMessage = { code: "elevation_refusee" | "hors_entreprise" | "role_non_autorise" | "entree_invalide" | "conflit"; message: string };

/** Cherche, à toute profondeur, une clé interdite dans le corps brut d'une requête de message. */
export function chercherClesInterdites(valeur: unknown, chemin = ""): string[] {
  if (!valeur || typeof valeur !== "object") return [];
  const trouvees: string[] = [];
  for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
    const ici = chemin ? `${chemin}.${cle}` : cle;
    if ((CLES_INTERDITES_MESSAGE as readonly string[]).includes(cle)) trouvees.push(ici);
    trouvees.push(...chercherClesInterdites(v, ici));
  }
  return trouvees;
}

export function autoriserMessage(c: ContexteMessage): RefusMessage | null {
  if (c.destinataire.type === "agent" && !c.agentsEntreprise.has(c.destinataire.id)) {
    return { code: "hors_entreprise", message: "Le destinataire n'appartient pas à l'entreprise de la tâche." };
  }
  if (c.destinataire.type === "humain" && !c.humainsAutorises.has(c.destinataire.id)) {
    return { code: "hors_entreprise", message: "Destinataire humain inconnu de l'entreprise." };
  }
  if (c.destinataire.id === c.expediteur.id) {
    return { code: "entree_invalide", message: "Un agent ne s'envoie pas de message à lui-même." };
  }
  if (c.envoisRecents >= DEBIT_MAX_PAR_HEURE) {
    return { code: "conflit", message: `Débit dépassé : ${DEBIT_MAX_PAR_HEURE} messages par heure et par tâche au plus. Concluez par une décision ou un blocage.` };
  }
  const estHumain = c.expediteur.type === "humain";
  switch (c.contenu.type) {
    case "decision":
      if (!estHumain && c.expediteur.id !== c.coordinateurAgentId) {
        return { code: "role_non_autorise", message: "Seuls l'humain ou le coordinateur de la campagne prennent une décision." };
      }
      break;
    case "constat_revue":
    case "correction_demandee":
      if (!estHumain && !c.relecteursDesignes.has(c.expediteur.id)) {
        return { code: "role_non_autorise", message: "Seuls les relecteurs désignés de la tâche émettent constats et corrections." };
      }
      break;
    case "reponse": {
      const origine = c.precedents.find((m) => m.messageId === (c.contenu as Extract<ContenuMessage, { type: "reponse" }>).enReponseA);
      if (!origine || origine.destinataireId !== c.expediteur.id) {
        return { code: "entree_invalide", message: "Une réponse doit viser un message de cette tâche adressé à l'expéditeur." };
      }
      break;
    }
    case "contrat_accepte": {
      const contrat = c.precedents.find((m) => m.messageId === (c.contenu as Extract<ContenuMessage, { type: "contrat_accepte" }>).contratMessageId);
      if (!contrat || contrat.type !== "contrat_propose" || contrat.destinataireId !== c.expediteur.id) {
        return { code: "entree_invalide", message: "L'acceptation doit viser un contrat proposé à l'expéditeur sur cette tâche." };
      }
      break;
    }
    default:
      break;
  }
  return null;
}
