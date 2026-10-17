---
name: "evaluation-risque-juridique"
description: "Évalue un risque juridique d'une PME belge sur une matrice gravité × probabilité de 5 × 5 (score de 1 à 25, quatre niveaux), rédige une note en dix rubriques avec options de traitement et risque résiduel, et dit si le recours à un avocat externe est obligatoire, fortement recommandé ou à envisager. À utiliser pour une clause risquée, une réclamation, un projet ou un incident dont l'enjeu juridique doit être pesé avant décision ; jamais pour accepter un risque, mandater un avocat ni donner un avis juridique définitif."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "juridique"
---

# Évaluation d'un risque juridique

## Quand l'utiliser

- Une clause de contrat, une réclamation ou un projet expose l'entreprise et la direction doit décider.
- Plusieurs risques doivent être comparés et classés.
- La question « faut-il prendre un avocat ? » se pose.

## Objectif

Une note courte, comparable d'un dossier à l'autre, qui chiffre le risque sur une échelle commune, sépare faits et
hypothèses, propose des options de traitement et indique le niveau de recours à un avocat, pour que l'humain décide
en connaissance de cause.

## Prérequis

- La description du risque et ses pièces (contrat, courrier, chronologie).
- La valeur en jeu si elle est connue (montant du contrat, chiffre d'affaires concerné).
- Le seuil de tolérance au risque de l'entreprise, s'il existe.

## Entrées

- `risque` : description en une phrase.
- `pieces` : documents de la tâche.
- `valeur_en_jeu` : montant de référence, facultatif.
- `tolerance` : seuil interne, facultatif.

## Étapes

1. **Décrire le risque** en une phrase : qui, quoi, conséquence possible.
2. **Coter la gravité de 1 à 5** : 1 négligeable, 2 faible, 3 modérée, 4 élevée, 5 critique. Repères financiers par
   défaut, à valider par l'entreprise : moins de 1 % de la valeur en jeu (2), 1 à 5 % (3), 5 à 25 % (4), plus de 25 %
   ou responsabilité personnelle des dirigeants, action d'une autorité probable (5). Ces pourcentages sont une
   convention de départ, pas une norme.
3. **Coter la probabilité de 1 à 5** : 1 très improbable, 2 peu probable, 3 possible, 4 probable, 5 quasi certaine,
   en citant les faits qui la fondent.
4. **Calculer le score** = gravité × probabilité et le niveau : 1 à 4 vert (faible), 5 à 9 jaune (moyen), 10 à 15 orange
   (élevé), 16 à 25 rouge (critique).
5. **Rédiger la note en dix rubriques** : description ; contexte ; analyse (gravité, probabilité, score) ; facteurs
   aggravants ; facteurs atténuants ; options de traitement (éviter, réduire, transférer par contrat ou assurance,
   accepter) ; approche recommandée ; risque résiduel après traitement ; suivi ; prochaines étapes.
6. **Dire le niveau de recours à un avocat externe** :
   - obligatoire : procédure judiciaire en cours ou annoncée, enquête ou demande d'une autorité, exposition pénale,
     décision qui exige le conseil d'administration ;
   - fortement recommandé : question juridique nouvelle ou incertaine, plusieurs droits nationaux en jeu, exposition
     au-delà de la tolérance, expertise pointue (concurrence, propriété intellectuelle), réglementation nouvelle ;
   - à envisager : litige contractuel important, réclamation d'un travailleur, incident de données personnelles,
     contestation avec un assureur.
7. **Préparer la carte de décision** : acceptation du risque, traitement choisi ou mandat d'un avocat.

## Livrable

La note en dix rubriques, une ligne de registre des risques (identifiant, description, gravité, probabilité, score,
niveau, responsable proposé, date de revue) et la carte de décision.

## Critères de réussite

- Gravité et probabilité sont chacune justifiées par des faits cités ; les hypothèses sont marquées.
- Le score et le niveau correspondent à la matrice.
- Le niveau de recours à l'avocat est indiqué avec le critère qui le déclenche.
- Aucune acceptation du risque n'est présentée comme décidée.

## À vérifier par un professionnel

- L'analyse juridique de fond (validité d'une clause, chances de succès, prescription) : avocat.
- Les repères financiers de gravité et la tolérance au risque : direction.

## Limites

- La cotation reste un jugement ; deux évaluateurs peuvent différer d'un point. La note sert à comparer et à décider,
  pas à prédire l'issue d'un procès.
- La compétence ne calcule aucune provision comptable.

## Exemple

Fournisseur informatique dont le contrat plafonne sa responsabilité à un mois de redevance (1 200 euros) alors qu'une
panne bloquerait la production (perte estimée 30 000 euros par jour, valeur annuelle du contrat 14 400 euros).
Gravité 4, probabilité 2 (pannes rares selon l'historique fourni) : score 8, jaune. Option recommandée : négocier un
plafond à douze mois et vérifier l'assurance. Avocat : à envisager si le fournisseur refuse.

Cas d'échec : l'agent cote la probabilité 5 « par prudence ». Une cotation non fondée sur des faits fausse la
comparaison ; la prudence s'exprime dans les options, pas dans la cote.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `legal/skills/legal-risk-assessment/SKILL.md`
(matrice 5 × 5, seuils 1-4, 5-9, 10-15, 16-25, note en dix rubriques, critères de recours à un avocat externe), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : français, pourcentages de gravité
présentés comme convention par défaut, critères américains (valeurs mobilières) retirés. Liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
