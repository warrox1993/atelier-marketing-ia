---
name: "registre-risques-projet"
description: "Tient le registre des risques d'un projet ou du portefeuille : identification, formulation cause-événement-conséquence, probabilité et impact notés sur une échelle écrite, réponses (éviter, réduire, transférer, accepter), propriétaire, déclencheur et revue datée. À utiliser au cadrage puis à chaque revue périodique ; jamais pour décider d'assumer un risque majeur ou d'engager un budget de réponse, qui restent humains."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "gestion-projets"
---

# Registre des risques d'un projet

## Quand l'utiliser

- Au cadrage d'un projet, pour poser les premiers risques de la charte.
- À chaque revue périodique, ou quand un événement change la situation (retard d'un fournisseur, départ d'une personne clé, changement de règle).
- Pour consolider les risques de plusieurs projets et repérer ceux qui se répètent.

## Objectif

Un registre court, vivant et utile : chaque risque est formulé de façon vérifiable, noté avec une échelle écrite, relié à une réponse, à un propriétaire et à une date de revue. Les risques majeurs remontent à la direction avant de se réaliser.

## Prérequis

- La charte du projet (objectifs, périmètre, jalons, budget) : voir `cadrage-projet`.
- L'échelle de notation de l'entreprise, ou à défaut l'échelle proposée ci-dessous, à faire valider.
- Les rapports d'avancement récents : voir `suivi-avancement-projet`.

## Entrées

- `projet` : identifiant et phase en cours.
- `sources_de_risques` : charte, rapports, comptes rendus, retours des équipes, contraintes externes.
- `registre_existant` : risques ouverts avec dernière revue.
- `echelle` : probabilité et impact, de 1 à 5, avec définition écrite de chaque niveau.

## Étapes

1. **Définir l'échelle avant de noter**. Probabilité : 1 rare (moins de 10 %), 2 peu probable, 3 possible, 4 probable, 5 quasi certain (plus de 80 %). Impact : 1 négligeable ; 3 un jalon glisse de deux semaines ou +10 % de budget ; 5 le projet échoue ou +30 % de budget. Les seuils chiffrés sont proposés puis fixés par la direction.
2. **Identifier** à partir de sources écrites : chaque risque cite sa source. Parcourir des catégories (périmètre, délai, budget, ressources, fournisseurs, technique, juridique, données personnelles, adoption par les utilisateurs) pour ne pas oublier.
3. **Formuler** en une phrase : « Si [cause incertaine], alors [événement], ce qui entraînerait [conséquence sur objectif, délai, coût ou qualité] ». Un problème déjà survenu est une **difficulté**, pas un risque : il va dans les points bloquants du rapport.
4. **Noter** probabilité x impact = score (1 à 25). Niveaux : vert 1 à 6, orange 7 à 14, rouge 15 à 25 (repères à valider). Écrire la justification de chaque note en une ligne ; une note sans justification est refusée.
5. **Choisir la réponse** : éviter (changer le plan), réduire (agir sur la probabilité ou l'impact), transférer (contrat, assurance : à faire vérifier), accepter (en connaissance de cause, avec un plan de secours). Décrire l'action concrète, qui la fait, avant quand, pour quel coût indicatif.
6. **Nommer un propriétaire par rôle** (un seul) et un **déclencheur** observable qui signale que le risque se réalise.
7. **Noter le risque résiduel** après réponse et la date de la prochaine revue (mensuelle ; hebdomadaire pour un rouge).
8. **Escalader** : tout rouge, tout risque sans propriétaire et tout risque dont la réponse demande du budget ou des personnes deviennent des cartes de décision. Accepter un risque majeur ou financer une réponse est une décision humaine.
9. **Revoir** : pour chaque ligne, risque toujours valable ? notes à jour ? réponse faite ? déclencheur observé ? Clore un risque seulement avec la raison (échéance passée, réponse efficace, réalisé et transformé en difficulté).
10. **Consolider** le portefeuille : risques communs à plusieurs projets, ressources partagées, fournisseur unique.

## Livrable

Un registre en tableau : identifiant `RSK-001`, formulation, catégorie, source, probabilité, impact, score, niveau, justification, réponse, propriétaire (rôle), déclencheur, risque résiduel, statut, dernière et prochaine revue ; plus la liste des risques escaladés, des risques clos avec motif et des informations manquantes.

## Critères de réussite

- Chaque risque suit la forme cause, événement, conséquence et cite sa source.
- Chaque note est justifiée avec l'échelle écrite.
- Aucun risque ouvert sans propriétaire, réponse et date de revue.
- Aucune difficulté déjà survenue n'est classée comme risque.
- Les risques rouges sont tous remontés à l'humain.

## Sources officielles

Consultées le 16/10/2026 :

- Manifeste pour le développement Agile, https://agilemanifesto.org/ : lu en ligne ; l'accueil du changement et la revue régulière des pratiques justifient une revue périodique du registre plutôt qu'un document figé.
- pmi.org : accès refusé (erreur 403) le 16/10/2026 ; aucun contenu lu. Axelos (PRINCE2) : page sans contenu exploitable. La matrice probabilité x impact et les quatre familles de réponse sont des pratiques courantes de gestion des risques, non citées d'une source officielle lue ce jour.

## À vérifier par un professionnel

Les risques juridiques (contrat, données personnelles, sécurité au travail, subsides), le transfert par assurance et les seuils de financement d'une réponse sont à faire valider par le juriste, l'assureur ou le courtier, le délégué à la protection des données et le conseiller en prévention.

## Limites

- Les notes sont des jugements : elles se discutent avec les personnes concernées, elles ne sont pas des mesures.
- L'échelle est générique ; une entreprise à forte exposition (chantiers, produits alimentaires) a besoin d'échelles propres.
- Un registre exhaustif noie l'essentiel : viser 10 à 20 risques ouverts par projet, priorisés.
- La compétence n'estime pas de probabilité statistique sans données ; elle le dit.

## Exemple

Projet de déménagement d'un atelier. Risque `RSK-003` : « Si le transporteur retenu n'est pas disponible la semaine du 11/01/2027, alors le déménagement est reporté, ce qui arrêterait la production deux semaines de plus. » Source : compte rendu du 08/10, le transporteur n'a pas confirmé. Probabilité 3 (aucune confirmation), impact 4 (arrêt de production), score 12, orange. Réponse : réduire, obtenir une confirmation écrite avant le 30/10 et identifier un second transporteur. Propriétaire : responsable d'exploitation. Déclencheur : pas de confirmation au 30/10. Revue : 30/10.

Cas d'échec : le compte rendu dit « le fournisseur a déjà annulé la livraison ». Ce n'est plus un risque mais une difficulté. La compétence ne l'ajoute pas au registre avec une probabilité : elle la place dans les points bloquants du rapport, demande la décision de replanification et ouvre un risque distinct pour la suite (« si aucun fournisseur de remplacement n'est trouvé... »).
