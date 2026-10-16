---
name: "qualite-donnees"
description: "Mesure et améliore la qualité d'un jeu de données d'une PME belge selon cinq dimensions (exactitude, complétude, cohérence, fraîcheur, unicité) : règles de contrôle écrites, tableau de qualité chiffré par dimension, anomalies classées, plan de correction à la source. À utiliser avant tout tableau de bord ou analyse, lors d'une migration ou quand deux chiffres censés être identiques diffèrent ; jamais pour corriger des données en production sans accord du propriétaire, ni pour deviner une valeur manquante."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "donnees"
---

# Qualité des données

## Quand l'utiliser

- Un indicateur surprend (chiffre d'affaires différent entre deux services, clients en double, dates impossibles).
- Un jeu de données va alimenter un tableau de bord, une analyse ou un outil d'IA et personne n'en connaît la fiabilité.
- Une migration ou un nouvel import va fusionner plusieurs sources.

## Objectif

Savoir, chiffres à l'appui, si un jeu de données est assez fiable pour l'usage prévu, où sont les défauts, qui peut les corriger et comment éviter qu'ils reviennent. La qualité se juge par rapport à un usage : le même fichier peut être suffisant pour un suivi mensuel et insuffisant pour une facturation.

## Prérequis

- L'usage prévu du jeu de données (décision ou traitement qu'il alimente) et son propriétaire métier.
- Un dictionnaire minimal : nom de chaque champ, signification, unité, format attendu. S'il manque, le produire d'abord et le faire confirmer.
- Un jeu de données déjà autorisé pour la tâche. Si des données personnelles sont nécessaires, l'extraction passe par l'approbation humaine du service ; sinon travailler sur un extrait pseudonymisé ou agrégé.

## Entrées

- `jeu` : extrait ou description du jeu de données (source, date d'extraction, périmètre, nombre de lignes).
- `usage` : décision ou traitement visé.
- `regles` : règles métier connues (par exemple « une date de facture n'est jamais postérieure à la date d'échéance »).
- `seuils` : niveau de qualité exigé par dimension, sinon ceux proposés ci-dessous, à faire confirmer.

## Étapes

1. **Fixer le périmètre** : jeu, champs critiques pour l'usage (au plus une dizaine), période. Les champs sans effet sur l'usage ne sont pas contrôlés.
2. **Écrire les règles de contrôle**, une par ligne, avec identifiant `QD-001`, `QD-002`..., dimension, champ, condition vérifiable et gravité (bloquant, important, mineur).
3. **Mesurer par dimension** :
   - exactitude : la valeur correspond à la réalité (comparaison avec une pièce, un registre ou une autre source fiable sur un échantillon dont la taille est écrite) ;
   - complétude : part de valeurs renseignées parmi les valeurs attendues (champ obligatoire vide, « N/A », « 0 » ou date par défaut comptés comme absents) ;
   - cohérence : respect des règles entre champs et entre sources (totaux, formats, codes, unités, devises) ;
   - fraîcheur : écart entre la date de la dernière mise à jour et la date attendue pour l'usage ;
   - unicité : doublons exacts et quasi-doublons (même entité écrite de deux façons), mesurés sur une clé définie.
4. **Classer les anomalies** par cause : saisie, import, règle de gestion absente, doublon de source, changement de définition. Une anomalie sans cause identifiée est notée « cause à investiguer ».
5. **Calculer le tableau de qualité** : taux par dimension et par champ critique, nombre de lignes concernées, comparaison au seuil, feu vert, orange ou rouge, ou « seuil à définir » si aucun n'est convenu.
6. **Proposer la correction à la source** : qui corrige (propriétaire du processus), où (formulaire, logiciel, procédure), comment empêcher la récidive (champ obligatoire, liste de valeurs, contrôle à la saisie). Une correction faite seulement dans l'entrepôt ou dans le tableau de bord reviendra : elle est notée comme palliatif.
7. **Statuer sur l'usage** : utilisable, utilisable avec réserves écrites, ou non utilisable en l'état, avec la condition pour passer au niveau suivant.

Repères de départ (à confirmer par le propriétaire) : exactitude et cohérence des champs financiers à 99 % ou plus ; complétude des champs critiques à 95 % ou plus ; doublons sous 1 % ; fraîcheur compatible avec la fréquence de décision (un tableau hebdomadaire n'accepte pas des données de plus de 7 jours). Ce sont des ordres de grandeur de départ, pas des normes.

## Livrable

Un rapport de qualité : périmètre, dictionnaire utilisé, liste des règles `QD-xxx`, tableau de qualité par dimension, anomalies classées avec exemples anonymisés, plan de correction à la source avec propriétaire et échéance proposés, statut d'usage et réserves. Chaque taux indique son dénominateur et la date d'extraction.

## Critères de réussite

- Les cinq dimensions sont traitées ou l'absence d'une dimension est justifiée.
- Chaque taux est reproductible à partir de la règle et du jeu indiqués.
- Aucune valeur manquante n'est remplie par une moyenne ou une supposition ; aucune donnée n'est modifiée dans la source par l'agent.
- Les exemples d'anomalies ne contiennent aucune donnée personnelle superflue (identifiants pseudonymisés ou lignes décrites sans nom).
- Le statut d'usage est lié à l'usage prévu, pas à un jugement général.

## Sources officielles

Consultées le 16/10/2026 :

- Règlement (UE) 2016/679 du 27 avril 2016 (RGPD), EUR-Lex, https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:32016R0679 : texte lisible en français ; article 5, paragraphe 1, points c (minimisation), d (exactitude, données rectifiées ou effacées sans tarder) et e (limitation de la conservation), qui font de l'exactitude et de la qualité des données personnelles une obligation légale.
- Règlement (UE) 2024/1689 (loi sur l'IA), EUR-Lex, https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:32024R1689 : lisible par tranches ; l'article 10 prévoit des pratiques de gouvernance des données d'entraînement, de validation et de test pour les systèmes d'IA à haut risque, ce qui rappelle que la qualité des données conditionne l'usage de l'IA.
- Statbel (https://statbel.fgov.be/fr) : page non lisible le 16/10/2026 (test anti-robot affiché), aucune statistique officielle n'est donc citée ici. Les seuils de qualité ci-dessus ne s'appuient sur aucune source officielle.

## À vérifier par un professionnel

Toute donnée comptable corrigée à la source relève de la comptabilité de l'entreprise. Les corrections de données personnelles (droit de rectification) et la durée de conservation relèvent du responsable du traitement et, si l'entreprise en a un, du délégué à la protection des données.

## Limites

- Un contrôle automatique détecte l'incohérence, pas l'erreur plausible : l'exactitude exige une comparaison à une source de référence, donc un échantillon.
- Les seuils sont génériques ; une facturation exige plus qu'un suivi marketing.
- Les quasi-doublons sont des candidats, pas des certitudes : la fusion de fiches est décidée par le propriétaire.
- La compétence ne corrige jamais une source et ne supprime aucun enregistrement.

## Exemple

Usage : suivre les ventes mensuelles à partir d'un export de facturation de 4 200 lignes, extrait le 12/10/2026.

| Dimension | Règle | Résultat | Feu |
| --- | --- | --- | --- |
| Complétude | QD-001 : code client renseigné | 4 137 / 4 200 = 98,5 % | vert |
| Unicité | QD-002 : numéro de facture unique | 42 doublons, soit 1,0 % | orange |
| Cohérence | QD-003 : date de facture avant date d'échéance | 4 200 / 4 200 | vert |
| Fraîcheur | QD-004 : dernière facture le 30/09, usage mensuel | 12 jours d'écart | vert |

Cause des 42 doublons : hypothèse, double import du 30/09 ; à confirmer avec l'informatique. Correction à la source : contrôle d'unicité à l'import. Statut : utilisable avec réserve (retirer les doublons dans l'analyse, sans les supprimer de la source).

Cas d'échec : le rapport affiche « complétude 100 % » parce que les codes clients absents ont été remplis par « 0000 » à l'export. Les « 0000 » sont comptés comme absents ; le taux réel est de 91 %, le statut passe à orange et la question est posée à l'informatique sur l'origine de ce code par défaut.
