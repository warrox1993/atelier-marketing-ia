---
name: "prevision-ventes"
description: "Rédige la prévision commerciale d'une période : affaires classées en signé, engagé, probable et pipeline selon des règles écrites, tableau du chiffre et du nombre d'affaires par catégorie, écarts depuis la prévision précédente (montées, glissements, gains, pertes), commentaire d'une ligne par affaire engagée ou probable, risques sur le chiffre engagé et demandes à la direction. À utiliser avant une réunion de prévision, un point mensuel ou trimestriel avec la direction ; jamais pour changer seul la catégorie d'une affaire dans le CRM ni pour gonfler un chiffre."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commercial"
---

# Prévision des ventes de la période

## Quand l'utiliser

- Une réunion de prévision ou un point avec la direction approche et il faut dire « combien, quand, avec quel
  risque ».
- La direction demande le chiffre probable du trimestre ou de l'année.
- La prévision précédente doit être mise à jour après une semaine ou un mois d'activité.

## Objectif

Une prévision lisible en deux minutes : le chiffre, les affaires qui le portent, ce qui a changé depuis la dernière
fois et où est le risque, chaque élément vérifiable dans l'export du CRM.

## Prérequis

- Un export daté du CRM : affaires ouvertes dont la signature est visée dans la période (étape, catégorie de
  prévision si le CRM en a une, montant, date de signature visée, prochaine étape, dernière activité, titulaire)
  et affaires gagnées de la période.
- Les règles de correspondance entre étapes et catégories propres à l'entreprise. À défaut, les repères de l'étape
  1, marqués « à fixer par la direction ».
- La prévision précédente, si elle existe, pour mesurer les écarts.

## Entrées

- `periode` : mois, trimestre ou année (trimestre en cours par défaut).
- `perimetre` : un commercial, une équipe ou l'entreprise. Un périmètre vide n'est jamais élargi en silence : la
  question est posée.
- `export_crm` et, si possible, `prevision_precedente`.

## Étapes

1. **Fixer les règles de classement** avant de classer. Si le CRM a un champ de catégorie de prévision, il prime
   sur l'étape. Sinon, repères de départ : *signé* (affaire gagnée dans la période) ; *engagé* (proposition
   acceptée oralement ou par écrit, décideur identifié, date fixée) ; *probable* (proposition remise, intérêt
   confirmé, décision attendue dans la période) ; *pipeline* (le reste des affaires visant la période). Écrire la
   règle utilisée en tête de la prévision.
2. **Classer chaque affaire** de la période dans une catégorie, avec sa preuve lue dans l'export (étape, date,
   prochaine étape). Une donnée vide est écrite « vide », une donnée non exportée « non lue ».
3. **Chiffrer** : montant et nombre d'affaires par catégorie, total engagé en gras, signé à part (« déjà acquis »).
   Aucun pourcentage de probabilité inventé : si l'entreprise en applique, les citer avec leur source.
4. **Mesurer les écarts** avec la prévision précédente : affaires montées de catégorie, glissées hors de la
   période, ajoutées, gagnées, perdues. Sans prévision précédente, le dire en une ligne et passer. Une affaire
   absente du nouvel export est « clôturée ou retirée, issue inconnue », jamais supposée gagnée.
5. **Commenter les affaires qui comptent** : pour chaque affaire engagée ou probable, une ligne (où elle en est, ce
   qu'il faut pour signer, le risque éventuel) tirée de la prochaine étape et de la dernière activité. Pour une
   équipe nombreuse, garder les cinq plus gros montants par catégorie.
6. **Nommer les risques sur l'engagé** : affaire engagée sans activité récente, date de signature déjà repoussée,
   prochaine étape vide, décideur non rencontré. Pour chacun : l'affaire, le risque précis, la parade proposée.
7. **Proposer les corrections de catégorie** révélées par l'analyse (un probable devenu engagé, un engagé à
   rétrograder), une ligne par affaire avec avant, après et preuve. Chaque correction est une proposition, jamais
   appliquée sans validation humaine.
8. **Écrire les demandes** à la direction : appui sur une affaire, ressource, arbitrage.

## Livrable

Prévision datée : règle de classement, tableau signé, engagé, probable, pipeline (montant et nombre), écarts depuis
la dernière prévision, commentaires par affaire, risques sur l'engagé avec parade, corrections de catégorie
proposées, demandes à la direction.

## Critères de réussite

- Chaque affaire classée porte une preuve tirée de l'export ; la règle de classement est écrite.
- Les totaux se recalculent à partir du tableau ; aucune probabilité inventée.
- Une affaire disparue n'est jamais comptée comme gagnée.
- Aucune catégorie changée dans le CRM sans validation.

## Limites

- La prévision vaut ce que vaut le CRM : la part d'affaires sans date ou sans montant est dite en tête.
- La compétence ne verrouille pas le chiffre dans un outil de prévision de l'entreprise ; elle prépare le
  document.
- Pour une revue complète du portefeuille (propreté du CRM, analyse gagné et perdu), utiliser `revue-pipeline`.

## Exemple

Cas nominal : trimestre, équipe de trois commerciaux. Signé : 42 000 euros (6 affaires). Engagé : 65 000 euros (4
affaires). Probable : 38 000 euros (5). Pipeline : 120 000 euros (17). Écarts depuis la prévision du mois dernier :
une flotte de véhicules passe de probable à engagé (accord oral consigné le 14/03), un contrat incendie glisse au
trimestre suivant. Risque sur l'engagé : l'affaire « RC professionnelle, cabinet d'architectes » n'a plus
d'activité depuis 19 jours ; parade proposée : rendez-vous avec la gérante cette semaine.

Cas d'échec évité : une affaire présente le mois dernier n'apparaît plus dans l'export. L'agent ne l'ajoute pas au
signé : il l'écrit « clôturée ou retirée, issue inconnue » et demande le motif.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `sales/skills/forecast/SKILL.md`,
étapes 1 à 6 (catégorie du CRM prioritaire sur l'étape, quatre catégories, écarts depuis la prévision précédente,
commentaire d'une ligne par affaire engagée ou probable, risques sur l'engagé et demandes, corrections de catégorie
proposées avec preuve, affaire disparue jamais supposée gagnée), commit 33eeda1e8fd856455b05479d13a0f85b5f803744,
licence Apache 2.0. Modifications : réécriture en français, repères de classement explicites à faire fixer par la
direction, aucune probabilité inventée, validation humaine de toute correction. Texte de la licence et liste des
reprises : `organisation/skills/LICENCES-TIERS.md`.
