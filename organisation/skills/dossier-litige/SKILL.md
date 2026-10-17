---
name: "dossier-litige"
description: "Prépare pour l'avocat le dossier de précontentieux d'une PME belge face à une mise en demeure, une citation, une réclamation sérieuse ou une demande d'une autorité : situation, chronologie sourcée, points juridiques immédiats (délais, conservation des pièces, notification), accords et assurances concernés, actions urgentes proposées, informations manquantes et sources consultées. À utiliser dès qu'un différend risque de devenir judiciaire ou qu'un acte de procédure arrive ; jamais pour répondre à la partie adverse, saisir un tribunal ni évaluer seul les chances de succès."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "juridique"
---

# Dossier de litige pour l'avocat

## Quand l'utiliser

- Une mise en demeure, une citation ou un courrier d'avocat arrive.
- Un client ou un fournisseur menace d'une action en justice.
- Une autorité demande des informations ou annonce un contrôle.
- Un incident (fuite de données, accident, faute professionnelle alléguée) peut engager la responsabilité.

## Objectif

Un dossier produit vite avec ce qui est disponible, qui permet à l'avocat de comprendre la situation en quelques minutes,
qui signale tout de suite les délais et l'obligation de conserver les pièces, et qui dit clairement ce qui n'a pas pu
être vérifié.

## Prérequis

- Le document déclencheur (courrier, acte, courriel) avec sa date de réception.
- Les pièces disponibles : contrats, échanges, factures, rapports.
- Le nom de l'avocat ou de l'assureur protection juridique, s'il existe.

## Entrées

- `declencheur` : document et date de réception.
- `pieces` : documents de la tâche.
- `contrats_assurances` : accords et polices concernés, transmis par le bureau de liaison.

## Étapes

1. **Résumer la situation** : ce qui est connu, qui réclame quoi, montant ou demande.
2. **Établir la chronologie** : chaque événement daté avec sa pièce ; un événement sans pièce est marqué « déclaré,
   non documenté ».
3. **Relever les points juridiques immédiats**, tous « à vérifier par l'avocat » : délai indiqué dans l'acte ou le
   courrier ; obligation de conserver toutes les pièces liées (aucune suppression, y compris des courriels) ;
   notification à l'assureur selon la police ; notification à une autorité si des données personnelles sont touchées
   (72 heures pour une violation notifiable, à apprécier par le délégué à la protection des données) ;
   confidentialité des échanges avec l'avocat.
4. **Lister les accords concernés** : contrat avec la partie adverse, clauses de responsabilité, de juridiction et de
   règlement des différends, polices d'assurance.
5. **Résumer la réponse interne déjà donnée** : qui a écrit quoi à la partie adverse, quand.
6. **Proposer les actions urgentes** par priorité : prévenir l'avocat ou l'assureur, geler les pièces, ne plus écrire
   à la partie adverse sans validation, calendrier des délais.
7. **Lister les informations manquantes** et les **sources consultées** (et celles qui n'ont pas pu l'être).
8. **Préparer la carte de décision** : mandat de l'avocat, déclaration à l'assureur, toute démarche vers la partie
   adverse ou un tribunal.

## Livrable

Le dossier : situation, chronologie, points juridiques immédiats, accords concernés, réponse interne déjà donnée,
contacts, actions urgentes, informations manquantes, sources consultées ; et la carte de décision.

## Critères de réussite

- Chaque événement de la chronologie a une date et une pièce, ou la mention « non documenté ».
- Les délais et l'obligation de conserver les pièces figurent en tête des points juridiques.
- Les manques et les sources non consultées sont visibles.
- Aucune réponse n'est envoyée et aucune chance de succès n'est chiffrée.

## À vérifier par un professionnel

- Tous les délais de procédure, la prescription et la juridiction compétente : avocat.
- La qualification d'une violation de données personnelles et sa notification : délégué à la protection des données.
- Les conditions de la police d'assurance : courtier ou assureur.

## Limites

- La compétence ne qualifie pas juridiquement les faits et ne prédit pas l'issue.
- Un acte de procédure (citation, signification d'huissier) est toujours transmis à l'avocat le jour même ; le dossier
  ne retarde jamais cette transmission.

## Exemple

Mise en demeure reçue le 12 octobre 2026 : un client réclame 18 000 euros pour une erreur de conseil et donne 15 jours.
Chronologie : 6 événements dont 5 documentés ; l'appel téléphonique du 3 septembre est « déclaré, non documenté ».
Points immédiats : délai du 27 octobre ; conserver tous les échanges avec le client ; déclaration à l'assureur
responsabilité civile professionnelle selon la police. Actions : prévenir l'assureur et l'avocat aujourd'hui, ne plus
répondre au client sans validation. Manque : le contrat signé avec le client n'est pas dans les pièces.

Cas d'échec : l'agent attend d'avoir toutes les pièces pour livrer le dossier. La rapidité prime : il livre avec ce qui
existe et liste les manques.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `legal/skills/brief/SKILL.md` (mode
« Incident Brief » : format et consignes), commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0.
Modifications : français, délais marqués à vérifier, aucune démarche vers la partie adverse. Liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
