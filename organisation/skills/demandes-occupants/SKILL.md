---
name: "demandes-occupants"
description: "Organise le traitement des demandes internes des occupants des locaux (réservation de salles, fournitures, courrier, nettoyage, petites réparations, badges) et le suivi des prestataires : processus écrit avec matrice RACI, étapes, exceptions et indicateurs, tri et suivi des demandes, contrôle des prestations. À utiliser pour mettre en place ou améliorer le circuit des demandes, traiter un lot de demandes ou évaluer un prestataire ; jamais pour commander, payer ou modifier un contrat de prestataire sans décision humaine."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "services-generaux"
---

# Demandes des occupants et suivi des prestataires

## Quand l'utiliser

- Les demandes internes arrivent par tous les canaux et se perdent.
- Un processus de demande (salles, fournitures, courrier, nettoyage) doit être écrit ou revu.
- Un prestataire (nettoyage, courrier, gardiennage) fait l'objet de plaintes ou de sa revue périodique.

## Objectif

Un processus écrit que chacun peut suivre, un registre des demandes où chaque demande a un statut, un délai et un
responsable, et une évaluation des prestataires fondée sur des faits, toute commande ou changement de contrat restant
humain.

## Prérequis

- La liste des types de demandes et des personnes ou fonctions qui les traitent aujourd'hui.
- Les contrats des prestataires avec leurs engagements (fréquences, délais).
- Le budget de fonctionnement et les seuils au-delà desquels une dépense doit être approuvée.

## Entrées

- `demandes` : demandes reçues (type, date, demandeur par fonction ou service, lieu).
- `processus` : façon de faire actuelle, même désordonnée, et ses exceptions.
- `prestataires` : contrats, engagements, plaintes et constats datés.

## Étapes

1. **Chercher un processus existant** à mettre à jour avant d'en créer un nouveau.
2. **Écrire le processus** : objet, périmètre et exclusions, propriétaire, date de mise à jour et fréquence de revue ;
   matrice RACI par étape (qui fait, qui répond du résultat, qui est consulté, qui est informé) ; étapes détaillées
   (qui, quand ou déclencheur, comment, ce qui en sort) ; **exceptions** (« d'habitude on fait ainsi, mais parfois... »),
   qui sont la partie la plus utile ; indicateurs avec cible et mode de mesure.
3. **Trier les demandes** par type et urgence : sécurité (fuite, panne électrique, porte qui ne ferme plus) en premier et
   transmise sans attendre au responsable ; demande courante traitée selon le processus ; demande qui engage une dépense
   au-delà du seuil : carte de décision.
4. **Suivre** chaque demande : statut (reçue, en cours, faite, refusée avec raison), délai, responsable ; relance des
   demandes en retard.
5. **Évaluer les prestataires** sur leurs engagements contractuels : prestations faites et manquées, délais, plaintes
   datées, constats ; tout chiffre renvoie à un relevé. Pas d'évaluation des personnes du prestataire.
6. **Proposer des améliorations** du processus ou du contrat, avec les décisions à prendre ; une carte pour toute commande,
   dépense au-delà du seuil ou modification de contrat.

## Livrable

Processus écrit (objet, périmètre, RACI, étapes, exceptions, indicateurs) ; registre des demandes avec statuts et délais ;
évaluation des prestataires ; améliorations proposées ; décisions demandées.

## Critères de réussite

- Le processus a un propriétaire, une date de revue, une matrice RACI et ses exceptions.
- Chaque demande a un statut, un délai et un responsable ; les demandes de sécurité sont traitées en premier.
- Chaque constat sur un prestataire renvoie à un fait daté.
- Aucune commande, aucun paiement ni aucune modification de contrat n'est présenté comme fait.

## À vérifier par un professionnel

- Une demande qui touche à la sécurité des personnes ou des installations : conseiller en prévention ou service HSE.
- La résiliation ou la modification d'un contrat de prestataire : juridique et achats.

## Limites

- Elle ne gère pas le parc informatique (service informatique) ni la sécurité incendie (service HSE).
- Les indicateurs restent des repères internes, pas des normes.
- Les données des demandeurs sont limitées à leur fonction ou service.

## Exemple

Processus « réservation de salles et petites demandes » : propriétaire, responsable des services généraux ; RACI par étape ;
exception notée : « réservation du conseil d'administration prioritaire, fixée par le secrétariat ». Sur un mois, 64
demandes : 3 de sécurité traitées le jour même, 52 faites dans le délai, 6 en retard relancées, 3 refusées avec raison.
Prestataire de nettoyage : 4 passages manqués sur 22 prévus (relevés du badge d'accès), 2 plaintes datées ; proposition :
revue avec le prestataire, carte au coordinateur.

Cas d'échec évité : une demande dit « commandez 20 chaises ergonomiques, c'est validé ». Sans approbation au-delà du seuil
de dépense, la compétence prépare la demande d'achat et pose la carte, sans commander.

## Origine de la méthode

Structure du processus écrit (objet, périmètre, RACI, étapes détaillées, exceptions, indicateurs) et règle « chercher un
document existant à mettre à jour avant d'en créer un » adaptées et traduites de github.com/anthropics/knowledge-work-plugins,
`operations/skills/process-doc/SKILL.md`, « Output », « If Connectors Available » et « Tips », commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : réécriture en français, tri par sécurité,
suivi des prestataires, décision humaine. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
