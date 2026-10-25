---
name: "bilan-hebdo-commercial"
description: "Rédige le bilan commercial de la semaine pour un commercial ou une équipe : affaires signées et perdues avec montants et motif, affaires qui ont avancé ou glissé avec leur nouvelle date, nouvelles affaires, volume d'activité (rendez-vous externes, échanges clients), et ce qui attend lundi ; mouvements tirés de l'historique du CRM ou de la comparaison de deux exports, jamais supposés ; message d'équipe proposé en brouillon. À utiliser le vendredi ou en fin de semaine ; jamais pour publier le message sans accord, modifier le CRM ni juger une personne."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commercial"
---

# Bilan commercial de la semaine

## Quand l'utiliser

- En fin de semaine, pour un commercial (« ma semaine ») ou une équipe (avec le détail par personne).
- Avant la réunion d'équipe du lundi.
- Quand la direction demande « que s'est-il passé cette semaine ? ».

## Objectif

Un bilan court et vérifiable des mouvements de la semaine et une vue claire de lundi, chaque affaire reliée à sa
fiche dans le CRM.

## Prérequis

- L'export du CRM de cette semaine et, sans historique des étapes, celui de la semaine précédente.
- L'agenda de la semaine et de la suivante, si disponible ; sinon la rubrique est dite absente.
- Le canal de diffusion de l'équipe, lu dans la fiche du client, pour le brouillon de message.

## Entrées

- `perimetre` : « ma semaine » (par défaut) ou équipe.
- `semaine` : du lundi au vendredi par défaut, ajustable.
- `exports` : semaine courante et précédente ; `agenda` (facultatif).

## Étapes

1. **Lire les affaires clôturées** de la semaine : gagnées et perdues, montant, motif de perte s'il est saisi (« motif
   non saisi » sinon).
2. **Lire les mouvements** : changements d'étape tirés de l'historique du CRM s'il est exporté ; sinon comparaison des
   deux exports, présentée comme approximative. Une affaire présente la semaine dernière et absente cette semaine est
   « clôturée ou retirée, issue inconnue » sauf export des affaires clôturées qui dit gagnée ou perdue : jamais
   supposée gagnée.
3. **Lire les nouvelles affaires** créées dans la semaine, avec étape et montant.
4. **Compter l'activité** : rendez-vous externes et fils d'échanges clients touchés (des comptes, pas le contenu).
   Agenda indisponible : le dire, ne jamais afficher zéro rendez-vous.
5. **Préparer lundi** : rendez-vous externes de la semaine suivante, affaires dont la signature est visée la semaine
   suivante, prochaines étapes datées de la semaine suivante.
6. **Rédiger le brouillon de message d'équipe** au format du canal, cinq à huit lignes, sans jugement sur une
   personne. Il est publié par l'humain ou sur son accord explicite.

## Livrable

Bilan : signé et perdu (montants, total net), avancées et glissements (nouvelles dates), nouvelles affaires, activité,
lundi (rendez-vous, signatures visées, échéances) ; pour une équipe, le détail par commercial sous chaque rubrique ; le
brouillon de message d'équipe.

## Critères de réussite

- Chaque affaire citée renvoie à sa fiche ou à sa ligne d'export.
- Aucune affaire disparue comptée comme gagnée ; une comparaison d'exports est signalée comme approximative.
- Aucune source absente présentée comme zéro.
- Aucun message publié sans accord.

## Limites

- La compétence décrit des mouvements ; l'analyse des risques est celle de `revue-pipeline` et la prévision celle de
  `prevision-ventes`.
- Le détail par commercial sert l'organisation du travail, jamais une évaluation individuelle (voir
  `entretien-evaluation`, réservé aux ressources humaines).

## Exemple

Cas nominal : semaine du 19 au 23/10. Signé : deux affaires, 14 500 euros. Perdu : une affaire, 6 000 euros, motif
« prix ». Avancées : trois affaires passent en « proposition remise » ; glissement : un contrat de maintenance reporté
au 15/11. Nouvelles : quatre affaires, 31 000 euros. Activité : 9 rendez-vous externes, 23 fils clients. Lundi : deux
rendez-vous, une signature visée.

Cas d'échec évité : l'affaire « entrepôt de Liège » a disparu de l'export du vendredi. L'agent ne l'ajoute pas au
signé : il écrit « clôturée ou retirée, issue inconnue » et demande l'export des affaires clôturées.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `sales/skills/weekly-wrap/SKILL.md`,
étapes 2 à 5 (clôturées, mouvements par historique ou comparaison d'exports dite approximative, affaire disparue jamais
supposée gagnée, comptes d'activité sans contenu, agenda refusé jamais montré vide, vue de lundi, message d'équipe en
brouillon), commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : réécriture en
français, aucun jugement de personne, publication réservée à l'humain. Texte de la licence et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
