---
name: "bilan-evenement"
description: "Établit le bilan d'un événement ou d'un salon d'une PME belge : indicateurs de participation, coût par contact, satisfaction et opportunités générées, puis retour d'expérience avec décisions pour la prochaine édition. À utiliser dans les deux semaines suivant un événement ; jamais pour présenter un chiffre sans source, attribuer à l'événement un chiffre d'affaires non établi ni diffuser des réponses nominatives des participants."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "evenementiel"
---

# Bilan d'un événement

## Quand l'utiliser

- Un événement, une soirée clients ou un salon vient de se terminer et la direction demande « ça a servi à quoi ? ».
- Il faut décider de rééditer, d'ajuster ou d'arrêter un format.
- Le marketing doit mesurer l'effet d'un événement sur ses objectifs.

## Objectif

Un bilan d'une à deux pages : les objectifs de départ, les résultats mesurés avec leur formule et leur source, ce qui a marché et pas, et les décisions proposées pour la prochaine fois. Un indicateur sans donnée est signalé, jamais estimé.

## Prérequis

- Les objectifs mesurables fixés avant l'événement (charte). Sans objectif chiffré, le bilan le dit et se limite à décrire.
- La liste des coûts réels (factures, devis acceptés), avec la mention hors TVA ou TVA comprise.
- Les données de participation (inscrits, présents), de contacts et d'opportunités, avec leur source.

## Entrées

- `objectifs` : repris de la charte, sans reformulation.
- `couts` : montants réels par poste, hors TVA, avec la date de la pièce.
- `participation` : inscrits, présents, absents, nombre de contacts collectés, contacts qualifiés.
- `satisfaction` : réponses agrégées d'un court questionnaire, sans noms.
- `opportunites` : rendez-vous obtenus, devis émis, affaires conclues, fournis par le commercial (extraits agrégés, via le bureau de liaison).

## Étapes

1. **Reprendre les objectifs** de la charte tels quels et noter les indicateurs correspondants.
2. **Calculer la participation** : taux de présence = présents / inscrits x 100. Noter les inscrits sur place. Un taux calculé avec un dénominateur incertain est signalé.
3. **Calculer le coût total** réel (tous postes, y compris le temps de l'équipe s'il est valorisé, ce que le demandeur précise), puis :
   - coût par participant = coût total / présents ;
   - coût par contact = coût total / contacts collectés ;
   - coût par contact qualifié = coût total / contacts qualifiés (la définition de « qualifié » est celle du briefing, rappelée dans le bilan).
4. **Mesurer la satisfaction** : note moyenne et répartition sur les questions posées, nombre de réponses et taux de réponse. Sous 10 réponses, ne pas présenter de pourcentage comme représentatif. Les commentaires libres sont synthétisés par thèmes, sans citer de personne identifiable.
5. **Relever les opportunités** : rendez-vous obtenus, devis émis, affaires conclues, avec montants hors TVA. Une affaire est rattachée à l'événement seulement si le commercial le confirme ; sinon « attribution non établie ». Le chiffre d'affaires ne s'estime pas, il se constate, et le délai de conversion peut dépasser la date du bilan : prévoir un point à trois ou six mois.
6. **Contrôler le suivi** : proportion de contacts relancés dans les 48 heures (voir `salon-professionnel`), consentements recueillis, demandes d'opposition ou de suppression reçues et traitées.
7. **Classer les indicateurs en trois niveaux** :
   - **vanité** : inscriptions, badges scannés, passages, impressions ; suivis, jamais présentés comme un succès ;
   - **réels** : conversations qualifiées, rendez-vous obtenus, opportunités créées ou influencées ;
   - **décisifs** : coût par rendez-vous qualifié, coût par opportunité, affaires conclues confirmées ; ce sont eux qui
     décident de refaire ou non.
   Comparer le coût par rendez-vous qualifié à celui des autres canaux de l'entreprise (publicité, prospection directe)
   s'il est connu, sinon le demander par le bureau de liaison. Un événement touche plusieurs étapes d'une affaire : ne
   jamais lui attribuer seul une affaire qu'il a seulement influencée.
8. **Comparer** aux objectifs et, si elles existent, aux éditions précédentes. Écrire l'écart en valeur et en pourcentage. Une rupture de méthode est notée. Un format récurrent se juge sur la tendance de deux ou trois éditions, pas sur une seule : la première édition sous-performe souvent.
9. **Retour d'expérience** : trois choses à garder, trois à changer, un incident à ne pas reproduire, avec cause probable marquée « hypothèse ». Inclure les prestataires (à reconduire ou non), le plan B (a-t-il servi ?), l'accessibilité et la sécurité.
10. **Proposer des décisions** : rééditer, ajuster, arrêter, avec le coût et le bénéfice attendus. La décision est humaine.
11. **Clôturer les données** : confirmer la durée de conservation des listes d'invités et de contacts, la suppression des données sans suite, et la mise à jour du registre des traitements par le juridique.

## Livrable

Un bilan en Markdown : tableau des indicateurs par niveau (vanité, réels, décisifs ; valeur, formule, source, date d'extraction, écart à l'objectif) ; synthèse de la satisfaction ; opportunités ; retour d'expérience ; décisions proposées ; liste des données manquantes et du point de suivi à trois ou six mois. Une version courte destinée à la direction (rapport périodique) et, si le flux le permet, un extrait pour le marketing.

## Critères de réussite

- Chaque chiffre est recalculable à partir de sources listées.
- Les indicateurs sont classés en trois niveaux et la recommandation repose sur les indicateurs décisifs.
- Les objectifs comparés sont ceux fixés avant l'événement.
- Aucune attribution de chiffre d'affaires sans confirmation du commercial.
- Aucun nom de participant dans le bilan ; les réponses sont agrégées.
- Les décisions proposées sont distinguées des faits et marquées comme recommandations.

## Sources officielles

Pages ouvertes le 16/10/2026 :

- « Vos obligations RGPD » (marketing direct), Autorité de protection des données, https://www.autoriteprotectiondonnees.be/professionnel/themes/marketing-direct/vos-obligations-rgpd : finalités précises, documentation de la conformité, transparence. Fonde la limitation des données conservées après l'événement.

Les indicateurs (taux de présence, coût par contact, coût par contact qualifié) sont des conventions de gestion courantes, pas des textes officiels : aucune source officielle n'est citée pour eux.

## À vérifier par un professionnel

La durée de conservation des listes et des réponses, ainsi que l'usage des commentaires de participants, sont à faire valider par le juriste ou le délégué à la protection des données. La valorisation du temps de l'équipe et le traitement comptable des coûts relèvent du comptable.

## Limites

- Un événement produit aussi de la notoriété et de la relation, difficiles à chiffrer : le bilan le dit et ne les convertit pas en euros.
- Avec peu de participants, les pourcentages sont fragiles.
- Les opportunités se concrétisent parfois des mois après : un bilan à deux semaines est provisoire.
- Elle ne décide pas de rééditer l'événement.

## Exemple

Soirée clients, objectif « 40 présents, 10 rendez-vous ». Inscrits 52, présents 41 : taux de présence 78,8 %. Coût total réel 4 120 euros hors TVA (factures du 12/10) : 100,5 euros par participant. Contacts qualifiés 14 : 294,3 euros par contact qualifié. Satisfaction : 23 réponses sur 41 (56 %), note moyenne 4,2 sur 5. Rendez-vous obtenus 9 (objectif 10, écart -10 %). Attribution du chiffre d'affaires : non établie, point à trois mois. Retour d'expérience : le traiteur à reconduire, l'accueil trop lent à l'entrée (hypothèse : un seul poste d'enregistrement).

Cas d'échec : la direction demande « combien de chiffre d'affaires grâce à la soirée ? » alors que le commercial n'a rien confirmé. Le bilan écrit « attribution non établie » et pose la question « quelles affaires conclues ont pour origine l'événement ? » au commercial via le bureau de liaison, au lieu de répartir un chiffre d'affaires au prorata.

Cas d'échec évité (version 1.1.0) : le rapport du prestataire annonce « 600 badges scannés, succès ». Le bilan range ce chiffre en indicateur de vanité, constate 11 rendez-vous qualifiés pour 8 000 euros (727 euros par rendez-vous contre 310 euros en prospection directe, chiffre transmis par le commercial) et propose d'ajuster le format avant la deuxième édition plutôt que de conclure sur une seule.

## Origine de la méthode

Version 1.1.0 : étapes 7 et 8 adaptées et traduites de github.com/coreyhaines31/marketingskills, `skills/events/SKILL.md`, section « Measurement: Pipeline, Not Applause » (trois niveaux d'indicateurs, comparaison du coût par rendez-vous qualifié aux autres canaux, attribution multi-étapes, jugement sur deux ou trois éditions), commit dda3841f0b294e01e93b1541486beefbfab0915e, licence MIT, Copyright (c) 2025 Corey Haines. Modifications : réécriture en français, attribution confirmée par le commercial, RGPD. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
