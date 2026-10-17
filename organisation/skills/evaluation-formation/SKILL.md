---
name: "evaluation-formation"
description: "Évalue une formation et vérifie son efficacité : dispositif à quatre niveaux (réaction, apprentissage, comportement, résultats), délai d'attente avant la mesure, comparaison avant et après sur le même indicateur, méthode de mesure adaptée au type de problème visé, verdict efficace, à prolonger ou inefficace, plan de transfert et bilan agrégé. À utiliser après une formation à enjeu ou pour préparer son évaluation ; jamais pour noter ou classer une personne nommée sans accord humain, ni pour conclure à l'efficacité sur la seule satisfaction."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "formation"
---

# Évaluation et efficacité d'une formation

## Quand l'utiliser

- Une formation à enjeu vient de se terminer et la direction veut savoir si elle a servi.
- Un module est conçu et son dispositif d'évaluation doit être préparé avant la première session.
- Un bilan annuel du plan de formation est demandé.

## Objectif

Dire, preuves à l'appui, si une formation a changé ce qu'elle devait changer, en séparant ce que les participants en
ont pensé, ce qu'ils ont appris, ce qu'ils appliquent et ce qui a bougé dans le travail.

## Prérequis

- Les objectifs observables de la formation et l'indicateur de travail visé (erreurs, délais, réclamations).
- La valeur de cet indicateur avant la formation, sur une période définie. Sans elle, le niveau 4 est impossible et
  le bilan le dit.
- La date de fin de la formation et l'effectif formé.

## Entrées

- `formation` : intitulé, objectifs, date de fin, effectif.
- `indicateur` : définition, source, valeur avant et période.
- `resultats` : questionnaires et tests agrégés, données de suivi après la formation.

## Étapes

1. **Poser le dispositif par niveau** : niveau 1 (réaction, questionnaire court à la fin), niveau 2 (apprentissage,
   test avant et après), niveau 3 (comportement sur le poste, observation ou contrôle de dossiers), niveau 4 (résultat,
   indicateur de travail). Le niveau 1 se fait toujours ; le 4 seulement avec une valeur avant.
2. **Fixer le délai d'attente** avant de mesurer les niveaux 3 et 4 : 30 jours au moins pour un enjeu critique, 60 pour
   un enjeu important, 90 pour un enjeu courant, puis une fenêtre de mesure de 30 à 90, 60 à 180 ou 90 à 365 jours. Ces
   délais sont des valeurs par défaut, à ajuster.
3. **Choisir la méthode selon le problème** : tendance chiffrée pour un problème mesurable, contrôle de dossiers pour un
   problème de documentation, observation ou entretien pour un geste, test pour une connaissance.
4. **Préparer le plan de transfert** : ce que le responsable et le participant font à 30, 60 et 90 jours pour que
   l'apprentissage passe sur le poste.
5. **Mesurer et comparer** : même indicateur, même définition, périodes comparables avant et après ; écrire les autres
   causes possibles du changement (saison, nouvel outil, effectif).
6. **Rendre le verdict** :
   - le problème visé est réapparu pendant la fenêtre : inefficace, revoir la cause ou le module ;
   - les critères sont atteints : efficace ;
   - écart faible : à prolonger (fenêtre allongée) ou accepté avec une justification écrite ;
   - écart important : inefficace, revoir le module ou l'action.
7. **Rédiger le bilan agrégé** : résultats par niveau, verdict, limites, recommandations.

## Livrable

Un dispositif d'évaluation daté, un plan de transfert, puis un bilan : résultats par niveau (agrégés), comparaison avant
et après avec les dates, verdict justifié, autres causes possibles, recommandations.

## Critères de réussite

- Le verdict compare le même indicateur avant et après, avec les périodes.
- Le délai d'attente est respecté ou l'écart est écrit.
- Une satisfaction élevée n'est jamais présentée comme une preuve d'efficacité.
- Aucun résultat nominatif sans accord humain joint.

## Sources officielles

Consulté le 17/10/2026 :

- Code du bien-être au travail, livre Ier, titre 2, art. I.2-21, SPF Emploi, Travail et Concertation sociale,
  https://emploi.belgique.be/fr/themes/bien-etre-au-travail/principes-generaux/code-du-bien-etre-au-travail (version PDF
  du titre 2) : la formation au bien-être doit être suffisante et adéquate, donc vérifiable ; elle est donnée pendant le
  temps de travail et sans coût pour le travailleur.

## À vérifier par un professionnel

- Une évaluation nominative des acquis touche à l'évaluation du personnel : base légale, information des travailleurs
  et éventuelle concertation à faire vérifier par les ressources humaines ou le juridique social.

## Limites

- Un effectif faible (moins de 10 personnes) rend les comparaisons fragiles : le dire.
- Le niveau 4 mesure une corrélation, pas une preuve de cause.
- Le modèle à quatre niveaux (Kirkpatrick) est un cadre de la profession, pas une norme.

## Exemple

Cas nominal : formation de 2 heures à la nouvelle procédure de déclaration de sinistre, 18 gestionnaires, fin le 15/03.
Indicateur : dossiers transmis sans pièce obligatoire, 11 % sur janvier et février. Délai d'attente : 60 jours. Mesure
de mai à juillet : 4 %. Pas de récurrence au-dessus du seuil fixé. Verdict : efficace, avec une autre cause possible
écrite (nouvelle liste de contrôle mise en place en avril).

Cas d'échec évité : 95 % de participants satisfaits et aucune valeur avant. Le bilan ne conclut pas à l'efficacité : il
indique que le niveau 4 n'est pas mesurable et propose de relever l'indicateur dès maintenant.

## Origine de la méthode

Délais d'attente, méthodes de vérification selon le type de problème et arbre de décision d'efficacité transposés de la
vérification d'efficacité des actions correctives de github.com/alirezarezvani/claude-skills,
`ra-qm-team/skills/capa-officer/SKILL.md`, section « Effectiveness Verification », commit
19392f7a08264ed00486a251f5b2098321771f94, licence MIT, Copyright (c) 2025 Alireza Rezvani. Modifications : traduction,
transposition de l'action corrective à la formation, quatre niveaux d'évaluation, agrégation. Texte des licences et
liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
