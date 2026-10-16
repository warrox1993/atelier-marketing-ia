---
name: "gestion-incident-informatique"
description: "Prépare la gestion d'un incident informatique ou de sécurité dans une PME belge : tri, niveau de gravité, communication, résolution, retour d'expérience, avec les obligations de notification à vérifier (NIS2 : loi du 26 avril 2024, notification au CCB ; violation de données RGPD : Autorité de protection des données, 72 heures) et la règle d'escalade. À utiliser pour rédiger ou mettre à jour un runbook, trier un incident décrit par le responsable, ou préparer un brouillon de notification ; jamais pour exécuter une commande sur les systèmes, déclarer un incident à une autorité à la place de l'humain, ni trancher seul si l'entreprise est soumise à NIS2 ou si une violation est notifiable."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "informatique"
---

# Gestion d'un incident informatique ou de sécurité

## Quand l'utiliser

- Une panne, une compromission de compte, un rançongiciel, un courriel d'hameçonnage ouvert, une perte d'ordinateur ou une fuite de données vient d'être signalée.
- L'entreprise n'a pas de procédure écrite, ou la procédure date et ne parle ni de NIS2 ni de délais de notification.
- Après un incident, il faut écrire le retour d'expérience.

## Objectif

Qu'une personne non spécialiste, sous stress, sache en trois minutes : quelle est la gravité, qui prévenir, quoi ne pas faire, et quelles échéances légales courent. La compétence prépare des textes et des décisions pour l'humain responsable ; elle n'agit sur aucun système.

## Prérequis

- L'inventaire des systèmes et des données (voir la compétence `documentation-technique`) et la liste des contacts : responsable informatique, direction, prestataire informatique, assureur cyber s'il existe, délégué à la protection des données s'il existe.
- Le statut de l'entreprise vis-à-vis de NIS2, ou la mention « information manquante ».
- La fiche de l'entreprise (secteur, taille, effectif).

## Entrées

- `description` : ce qui a été vu, par qui, quand (heure exacte), sur quel système.
- `donnees_personnelles` : oui, non, inconnu.
- `statut_nis2` : entité essentielle, entité importante, hors champ, inconnu.

## Étapes

1. **Noter l'heure de la prise de connaissance.** Tous les délais légaux partent de ce moment. L'écrire en tête du dossier.
2. **Trier** : est-ce un incident (service dégradé ou donnée atteinte) ou une simple demande ? Poser quatre questions : quel service est touché, combien de personnes, des données sont-elles lues, copiées, perdues ou chiffrées, l'attaque est-elle encore en cours ?
3. **Attribuer la gravité** selon le tableau ci-dessous. En cas de doute entre deux niveaux, retenir le plus élevé.
4. **Limiter les dégâts sans détruire les preuves** (gestes à demander à l'humain, jamais exécutés par la compétence) : débrancher du réseau l'appareil atteint sans l'éteindre si possible, changer les mots de passe du compte touché depuis un autre appareil sain, suspendre le compte, ne pas payer de rançon sans avis de la direction et des conseils, ne pas supprimer les courriels ni les journaux.
5. **Communiquer** selon le tableau « Qui prévenir » : message interne court (fait, impact, consigne, prochaine nouvelle à telle heure), puis message aux clients ou partenaires seulement après validation de la direction.
6. **Évaluer les obligations de notification** (section suivante) et préparer les brouillons. L'humain décide et envoie.
7. **Résoudre et rétablir** : cause identifiée, correctif appliqué par le responsable, restauration depuis une sauvegarde saine, surveillance renforcée pendant au moins sept jours (repère de départ, à ajuster).
8. **Retour d'expérience** dans les deux semaines : chronologie, cause, ce qui a marché, ce qui a manqué, actions avec responsable et échéance. Sans recherche de coupable.

### Niveaux de gravité (repères de départ, à adapter)

| Niveau | Critère | Exemple | Délai de première réaction visé |
| --- | --- | --- | --- |
| 1 Faible | un poste ou un utilisateur, aucune donnée atteinte, contournement possible | poste lent, courriel suspect non ouvert | le jour ouvrable |
| 2 Moyen | un service ou un groupe d'utilisateurs, pas de donnée sensible atteinte | imprimante réseau ou messagerie partielle en panne | 4 heures ouvrables |
| 3 Élevé | service critique à l'arrêt ou compte privilégié compromis ou donnée personnelle possiblement atteinte | rançongiciel sur un poste, compte de messagerie usurpé | immédiat, direction prévenue |
| 4 Critique | arrêt général, chiffrement de serveurs, fuite avérée de données, attaque en cours | rançongiciel sur le serveur de fichiers | immédiat, cellule de crise |

### Qui prévenir

| Niveau | Interne | Externe (décision humaine) |
| --- | --- | --- |
| 1 | responsable informatique | aucun |
| 2 | responsable informatique, responsables des services touchés | prestataire informatique si contrat |
| 3 | direction, prestataire, délégué à la protection des données | assureur cyber, évaluation des notifications |
| 4 | direction, cellule de crise, tous les services | autorités si notifiable, police, clients concernés, assureur |

Escalade : un incident passe au niveau supérieur si l'impact grandit, si aucune amélioration n'est constatée après une heure (niveaux 3 et 4) ou après la demi-journée (niveau 2), ou si des données personnelles apparaissent. Toute montée de niveau est notée avec l'heure.

### Obligations de notification (à faire valider par l'humain)

**Violation de données personnelles (RGPD, article 33).** Si l'incident porte atteinte à des données personnelles (perte, vol, accès non autorisé, chiffrement par un rançongiciel) et qu'il est susceptible d'engendrer un risque pour les personnes, le responsable du traitement notifie l'autorité de contrôle, en Belgique l'Autorité de protection des données (APD), sans retard injustifié et si possible dans les 72 heures après en avoir pris connaissance. Au-delà, la notification explique le retard. Contenu minimal : nature de la violation (catégories et nombre approximatif de personnes et de dossiers), point de contact, conséquences probables, mesures prises ou envisagées. L'information peut venir par étapes. L'APD propose un service en ligne et la possibilité d'une notification complémentaire. Si le risque est élevé, les personnes concernées sont informées sans retard injustifié, en termes clairs (article 34). Dans tous les cas, la violation est consignée dans un registre interne avec faits, effets et mesures, même sans notification. Une violation chez un sous-traitant est signalée par lui au responsable du traitement sans retard.

**NIS2 (loi du 26 avril 2024, entrée en vigueur le 18 octobre 2024).** La loi transpose la directive européenne NIS2 pour les entités essentielles et importantes de secteurs listés en annexes, en principe de taille moyenne ou grande. Pour un incident significatif, le calendrier est : alerte précoce dans les 24 heures de la prise de connaissance, notification d'incident dans les 72 heures avec une première évaluation, rapport final au plus tard un mois après la notification. Le destinataire est le CSIRT national, au sein du Centre pour la Cybersécurité Belgique (CCB), par la plateforme de notification indiquée sur le site Safeonweb@work du CCB (modalités exactes à confirmer sur ce site, non consulté faute d'accès). Un incident est significatif lorsqu'il cause ou peut causer une perturbation grave de service ou des pertes financières, ou touche d'autres personnes en leur causant des dommages considérables. Il est possible de signaler volontairement un incident évité de justesse. Le statut de l'entreprise (essentielle, importante, hors champ) se vérifie auprès du CCB.

Les deux régimes peuvent s'appliquer en même temps au même incident : deux notifications, deux destinataires, deux horloges.

## Livrable

Un dossier d'incident en Markdown : heure de prise de connaissance, description, gravité retenue avec motif, chronologie, mesures demandées à l'humain, tableau « Qui prévenir », analyse des notifications (régime, délai, échéance calculée, décision humaine attendue), brouillons de messages et de notification, puis, après coup, le retour d'expérience. Les échéances sont écrites en date et heure (« au plus tard le JJ/MM à HH h »).

## Critères de réussite

- L'heure de prise de connaissance et les échéances calculées sont visibles en première page.
- Chaque délai légal porte la mention « à vérifier » tant que l'humain n'a pas confirmé.
- Aucune commande, aucun secret, aucun mot de passe dans le dossier.
- Le retour d'expérience donne au moins trois actions avec responsable et date.
- Le dossier ne nomme aucune personne comme fautive.

## Sources officielles

Consultées le 16/10/2026 :

- Loi du 26 avril 2024 établissant un cadre pour la cybersécurité des réseaux et des systèmes d'information d'intérêt général pour la sécurité publique, Moniteur belge du 17 mai 2024, Justel, https://www.ejustice.just.fgov.be/cgi_loi/article.pl?language=fr&lg_txt=f&type=&sort=&numac_search=2024202344&cn_search=2024042637&caller=eli&&view_numac=2024042637n : transposition de NIS2, définition de l'incident significatif, calendrier 24 heures, 72 heures, un mois, notification au CSIRT national, incident évité. Les numéros d'articles ne sont pas repris ici : la lecture automatique de cette page longue les a donnés de façon incohérente, à contrôler dans le texte.
- Règlement (UE) 2016/679, article 33, texte en français, https://gdpr-text.com/fr/read/article-33/ : délai de 72 heures, contenu minimal, notification par étapes, documentation de toutes les violations. Site non officiel reproduisant le texte du règlement ; la version officielle est sur EUR-Lex (non consultée).
- « Manuel d'utilisation : notification d'une violation de données », Autorité de protection des données, https://www.dataprotectionauthority.be/index.php/publications/manuel-d-utilisation-notification-d-une-violation-de-donnees.pdf : service en ligne de notification, notification complémentaire, information des personnes en cas de risque élevé.

Non consultables : les pages du CCB (ccb.belgium.be et atwork.safeonweb.be) ont refusé l'accès automatique (erreur 403). Le détail pratique de la plateforme de notification NIS2 n'est donc pas confirmé par une page du CCB.

## À vérifier par un professionnel

- Le statut NIS2 de l'entreprise et le caractère significatif d'un incident : à confirmer auprès du CCB, avec un juriste ou un avocat en droit du numérique.
- Le caractère notifiable d'une violation de données, le contenu de la notification à l'APD et l'information des personnes : délégué à la protection des données (DPO) ou avocat en protection des données.
- Une attaque avec extorsion, un vol ou une plainte : conseil juridique et, si décidé, police ; assureur cyber avant toute action coûteuse.
- Les actions techniques (isolement, restauration, analyse de preuves) : responsable informatique ou prestataire spécialisé en réponse à incident.

## Limites

- La compétence n'a aucun accès aux systèmes : elle ne vérifie pas qu'un incident a eu lieu, elle structure ce que l'humain décrit.
- Les niveaux de gravité et les durées de réaction sont des repères, pas des normes.
- Les délais légaux courent depuis la prise de connaissance réelle ; en cas de doute sur ce moment, prendre la date la plus ancienne plausible.
- Aucune négociation ni paiement de rançon.

## Exemple

Mardi 13/10, 09 h 10 : une comptable signale que les fichiers du dossier partagé « Compta » portent une extension inconnue et qu'un message demande un paiement. Le dossier contient des fiches de paie.

Prise de connaissance : 13/10 à 09 h 10. Gravité 4 (serveur de fichiers chiffré, données personnelles de salariés). Gestes demandés au responsable : débrancher le câble réseau du serveur sans l'éteindre, suspendre le compte de la comptable, garder la note de rançon en capture d'écran. Notifications : RGPD, échéance indicative au plus tard le 16/10 à 09 h 10 (à vérifier : risque pour les salariés probable) ; NIS2, statut inconnu, question posée à la direction (« l'entreprise relève-t-elle d'un secteur de l'annexe et dépasse-t-elle la taille moyenne ? »). Si oui, alerte précoce au plus tard le 14/10 à 09 h 10.

Cas d'échec : le responsable informatique appelle à 14 h en disant « incident de niveau 1, un poste lent », sans mention des fichiers chiffrés. La compétence ne peut pas deviner : elle écrit « information manquante » sur les données atteintes, pose les quatre questions du tri, et fixe provisoirement le niveau 3 en attendant les réponses plutôt que de sous-estimer.
