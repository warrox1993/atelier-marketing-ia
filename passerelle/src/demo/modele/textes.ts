// Textes du modèle : publications, avis, réponses, noms des contacts fictifs.
// Les publications suivent la charte (organisation/demo/marque.md) : vouvoiement,
// vocabulaire autorisé, appel à l'action « Demander un diagnostic avec visite », aucun
// superlatif, aucune promesse absolue, aucun montant d'aide publique. Les avis sont
// écrits par des clients fictifs et ne mentionnent que les services réellement
// proposés par l'établissement (pas de ventilation à Ans) et ses vrais horaires.

import type { Metier } from "./referentiel.js";

export const PRENOMS: readonly string[] = [
  "Julie", "Thomas", "Sophie", "Nicolas", "Laura", "Maxime", "Camille", "Antoine", "Sarah", "Julien",
  "Marie", "Kevin", "Charlotte", "Olivier", "Élodie", "Sébastien", "Aurélie", "François", "Nathalie", "Benoît",
  "Céline", "Damien", "Isabelle", "Mehdi", "Fatima", "Luca", "Giulia", "Youssef", "Anne", "Pierre",
];

export const NOMS: readonly string[] = [
  "Lambert", "Dubois", "Renard", "Lejeune", "Simon", "Laurent", "Leclercq", "Goffin", "Collard", "Henrard",
  "Lemaire", "Dethier", "Jacquet", "Pirard", "Thiry", "Hansen", "Gilson", "Lhoest", "Dumont", "Mathy",
  "Bertrand", "Delvaux", "Marchal", "Lecomte", "Schmitz", "Benali", "Rossi", "Collignon", "Wathelet", "Piron",
];

type Gabarit = (v: { etab: string; localite: string; lien: string }) => string;

export const GABARITS_PUBLICATIONS: Record<Metier, readonly Gabarit[]> = {
  toiture: [
    (v) => `Isolation de toiture à ${v.localite} : notre équipe de ${v.etab} vient de terminer un grenier de 55 m², chantier propre et planifié. Demander un diagnostic avec visite : ${v.lien}`,
    (v) => `Isoler sa toiture par l'intérieur, comment ça se passe ? Diagnostic avec visite, puis devis détaillé poste par poste. L'équipe locale de ${v.etab} vous explique tout : ${v.lien}`,
    (v) => `Avant / après à ${v.localite} : combles isolés en trois jours, un interlocuteur unique du début à la fin. Demander un diagnostic avec visite : ${v.lien}`,
  ],
  murs: [
    (v) => `Murs froids, condensation dans les angles ? À ${v.localite}, l'équipe de ${v.etab} a isolé une façade arrière de maison mitoyenne. Demander un diagnostic avec visite : ${v.lien}`,
    (v) => `Isolation des murs par l'intérieur : un devis détaillé poste par poste, après un diagnostic avec visite. Parlez-en à l'équipe de ${v.etab} : ${v.lien}`,
  ],
  chassis: [
    (v) => `Nouveaux châssis en double vitrage posés à ${v.localite} par l'équipe de ${v.etab}. Chantier propre et planifié, un interlocuteur unique. Demander un diagnostic avec visite : ${v.lien}`,
    (v) => `Remplacer ses châssis : prix au devis uniquement, après un diagnostic avec visite. L'équipe de ${v.etab} vous répond : ${v.lien}`,
  ],
  ventilation: [
    (v) => `Une maison mieux isolée a besoin d'air : à ${v.localite}, l'équipe de ${v.etab} a installé une ventilation dans une maison rénovée. Demander un diagnostic avec visite : ${v.lien}`,
  ],
};

type GabaritAvis = (v: { etab: string; localite: string }) => string;

export const AVIS_POSITIFS: Record<Metier, readonly GabaritAvis[]> = {
  toiture: [
    () => "Isolation du grenier faite en trois jours, chantier propre. Le diagnostic avant le devis nous a bien aidés à comprendre.",
    (v) => `Très contents de l'isolation de notre toiture à ${v.localite}. Devis clair, équipe ponctuelle.`,
    () => "Équipe sérieuse, devis détaillé et respecté. On sent la différence dans les chambres sous le toit.",
  ],
  murs: [
    () => "Isolation des murs intérieurs bien réalisée, les finitions sont soignées. Un seul interlocuteur du début à la fin.",
    (v) => `Bonne expérience avec l'agence de ${v.etab} pour l'isolation de notre façade arrière.`,
  ],
  chassis: [
    () => "Châssis remplacés comme prévu au devis, pose propre et équipe agréable.",
    (v) => `Nouveaux châssis posés à ${v.localite}, plus aucun courant d'air. Délai annoncé respecté.`,
  ],
  ventilation: [
    () => "Installation de la ventilation bien expliquée et bien faite. Bon suivi après le chantier.",
  ],
};

export const AVIS_SAMEDI: GabaritAvis = (v) => `Pratique de pouvoir passer à l'agence de ${v.etab} le samedi. Accueil aimable et conseils utiles.`;

export const AVIS_MITIGES: readonly string[] = [
  "Travail correct mais le chantier a commencé avec une semaine de retard sur la date prévue.",
  "Résultat satisfaisant, mais nous avons dû relancer pour obtenir le devis.",
];

export const AVIS_NEGATIFS: readonly string[] = [
  "Rendez-vous de diagnostic déplacé deux fois. Déçu de l'organisation.",
  "Finitions à reprendre en fin de chantier, il a fallu insister.",
];

export function reponseAvis(note: number, etab: string, telephone: string): string {
  if (note >= 4) return `Merci pour votre avis ! Toute l'équipe de ${etab} est heureuse que le chantier vous convienne.`;
  return `Merci pour votre retour. Nous sommes désolés pour ce désagrément et souhaitons en parler avec vous : appelez l'agence de ${etab} au ${telephone}.`;
}

/** Lettres sans accents ni signes, pour fabriquer les adresses électroniques fictives. */
export function versAscii(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}
