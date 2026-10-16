---
name: "mesure-satisfaction"
description: "Conçoit et lit une mesure de satisfaction client pour une PME belge : CSAT, NPS et CES avec leur définition exacte, la question, l'échelle, le moment d'envoi, la taille d'échantillon, les biais et un plan d'action chiffré. À utiliser pour lancer un questionnaire, interpréter des scores ou préparer un rapport de satisfaction à la direction ; jamais pour conclure sur trop peu de réponses, comparer des indicateurs d'échelles différentes, ni identifier un client à partir de son avis."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "service-client"
---

# Mesure de la satisfaction client

## Quand l'utiliser

- L'entreprise veut savoir si ses clients sont satisfaits et n'a que des impressions.
- Un score circule (« notre NPS est de 40 ») sans que personne sache comment il est calculé.
- La direction demande un rapport trimestriel du service client.
- Un changement (nouvelle FAQ, nouveau délai de réponse) doit être évalué.

## Objectif

Un jeu de mesures à définition écrite, avec le moment d'envoi, la population interrogée, le nombre de réponses, la marge d'incertitude, les biais connus et trois actions au plus dont l'effet attendu est mesurable. Un score sans effectif ni période n'est jamais publié.

## Prérequis

- Les canaux d'interaction et un volume approximatif de contacts par mois.
- La base légale et l'information des clients pour l'envoi du questionnaire (courriel de sollicitation : accord ou lien existant avec le client, à faire valider par le juriste).
- Le choix, par la direction, de l'indicateur principal : un seul indicateur de pilotage, les autres en appui.

## Entrées

- `reponses` : note, date, canal, langue, commentaire libre, sans nom ni adresse.
- `envois` : nombre de questionnaires envoyés par période (pour le taux de réponse).
- `periodes_precedentes` : scores et effectifs antérieurs avec la même définition.
- `evenements` : changements de processus, pannes, campagnes de la période.

## Étapes

1. **Choisir l'indicateur** selon la question de gestion (tableau ci-dessous) ; ne jamais mélanger deux échelles sous un même nom.
2. **Fixer le moment d'envoi** : CSAT et CES juste après l'interaction ; NPS à intervalle régulier, hors d'un incident en cours.
3. **Rédiger la question** exacte, l'échelle et une seule question ouverte facultative (« Qu'est-ce qui aurait pu être mieux ? »). Questionnaire de 1 à 3 questions.
4. **Définir l'échantillon** : tous les clients concernés ou un tirage aléatoire ; jamais seulement ceux qui ont eu un bon contact. Noter le taux de réponse (réponses divisées par envois).
5. **Contrôler l'effectif** : en dessous de 30 réponses par période et segment, le score est présenté comme indicatif, sans pourcentage de variation ; sous 10, aucun score.
6. **Calculer** avec les formules ci-dessous, garder les décomptes visibles, comparer à la période précédente sans extrapoler.
7. **Lire les biais** (section suivante) et les écrire dans le rapport.
8. **Classer les commentaires** par thème (délai, clarté, compétence, prix, accessibilité) avec leur nombre, en retirant tout élément identifiant.
9. **Proposer le plan d'action** : trois actions au plus, un responsable humain, une échéance, l'indicateur qui doit bouger et de combien (hypothèse écrite comme telle).
10. **Boucler avec les clients** : les clients très insatisfaits (CSAT bas, NPS de 0 à 6 avec demande de rappel) sont signalés pour contact humain ; une réclamation exprimée est transférée au SAV.

### Définitions exactes

| Indicateur | Question type | Échelle | Calcul |
| --- | --- | --- | --- |
| CSAT | « Dans quelle mesure êtes-vous satisfait de cette réponse ? » | 1 à 5 | réponses 4 et 5 divisées par le total des réponses, fois 100 (convention courante, à écrire dans le rapport) |
| NPS | « Dans quelle mesure recommanderiez-vous notre entreprise à un ami ou un collègue ? » | 0 à 10 | pourcentage de promoteurs (9 et 10) moins pourcentage de détracteurs (0 à 6) ; les passifs (7 et 8) ne comptent pas ; résultat de -100 à +100 |
| CES | « L'entreprise m'a facilité la résolution de mon problème. » | 1 à 7 (accord) | moyenne des réponses, ou pourcentage de réponses 5 à 7 ; choisir une méthode et la garder |

Précisions : le CSAT mesure un contact précis, le NPS la relation globale, le CES la facilité d'une démarche. Le NPS est un nombre entier (par exemple +32), pas un pourcentage. La méthode de calcul du CSAT et du CES varie selon les éditeurs ; elle est donc écrite dans chaque rapport.

### Biais à nommer

- **Non-réponse** : les clients très contents ou très fâchés répondent plus ; le taux de réponse est donné.
- **Sélection** : n'interroger que les tickets clos oublie ceux abandonnés.
- **Moment** : un envoi tardif mesure le souvenir, pas le contact.
- **Courtoisie** : les notes sont plus hautes si l'agent demande la note à voix haute.
- **Langue et canal** : un questionnaire disponible en français seulement sous-représente la clientèle néerlandophone.
- **Petits effectifs** : un seul avis peut déplacer un NPS de plusieurs points.

## Livrable

Une note courte : indicateurs, valeur, période, nombre d'envois, nombre de réponses, taux de réponse, comparaison, marge d'incertitude qualitative (fiable, indicatif, non publiable), thèmes des commentaires avec effectifs, biais relevés, trois actions au plus avec responsable humain, échéance et indicateur visé. Une annexe donne les décomptes bruts de chaque note.

## Critères de réussite

- Chaque score est recalculable à partir des décomptes de l'annexe.
- Aucun score sous 10 réponses ; mention « indicatif » sous 30.
- Définition, échelle et formule écrites ; aucune comparaison entre indicateurs de définitions différentes.
- Aucun commentaire reproduit tel quel s'il permet d'identifier une personne.
- Chaque action a un responsable humain et un indicateur de suivi.

## Sources officielles

Consultées le 16/10/2026 :

- « Measuring your Net Promoter Score », Bain & Company, https://nps.bain.com/about/measuring-your-net-promoter-score/ : question de recommandation, échelle de 0 à 10, promoteurs 9 et 10, passifs 7 et 8, détracteurs 0 à 6, NPS égal au pourcentage de promoteurs moins celui de détracteurs, de -100 à +100. Source de l'éditeur de la méthode.
- « Customer Effort Score », SurveyMonkey, https://www.surveymonkey.com/learn/customer-feedback/how-to-use-customer-effort-score/ (source secondaire, éditeur d'outil) : échelles de 1 à 5 ou de 1 à 7, calcul par moyenne ; la page n'a pas été lue en entier (derniers 3 334 caractères non lus). La variante par pourcentage de réponses 5 à 7 provient de résultats de recherche non ouverts : non sourcée ici.
- Définition du CSAT : aucune source ouverte n'a pu être lue le 16/10/2026 (la page consultée a renvoyé une erreur 404). Le calcul « réponses 4 et 5 sur total » est donc une convention de gestion courante, pas un texte officiel.
- Règlement général sur la protection des données, article 12, texte reproduit par gdpr-info.eu (source secondaire), https://gdpr-info.eu/art-12-gdpr/ : à citer pour les demandes d'exercice de droits qui arriveraient dans un questionnaire (délai d'un mois).

Les niveaux d'effectif (10 et 30) sont des repères de prudence de cette compétence, pas des normes statistiques.

## À vérifier par un professionnel

L'envoi de questionnaires par courriel ou SMS (accord préalable, désinscription, information sur le traitement) est à faire valider par le juriste ou le délégué à la protection des données. Toute communication externe des scores (site, offre commerciale) est à faire relire par le juriste pour éviter une allégation trompeuse.

## Limites

- Un score de satisfaction ne dit pas pourquoi : seule l'analyse des commentaires oriente l'action.
- Les repères de comparaison entre entreprises ou secteurs ne sont pas fournis, faute de source.
- Pour une petite PME, quelques dizaines de réponses par trimestre suffisent pour une tendance, pas pour un classement de personnes.
- La compétence n'évalue pas les agents individuellement.
- Elle ne contacte aucun client : l'envoi du questionnaire et les rappels sont des décisions humaines.

## Exemple

Trimestre T3 2026, PME de 15 personnes. Envois : 240 questionnaires NPS ; réponses : 96 (taux de réponse 40 %). Promoteurs (9 et 10) : 48 ; passifs (7 et 8) : 30 ; détracteurs (0 à 6) : 18.

NPS = 48 / 96 x 100 - 18 / 96 x 100 = 50 - 18,75 = +31 (arrondi à l'entier, calcul visible). Effectif supérieur à 30 : score fiable pour une tendance. Biais : 40 % de réponse, questionnaire en français seulement alors que 20 % des clients sont néerlandophones. Thèmes des commentaires (54 renseignés) : délai de réponse 21, clarté 14, prix 11, autre 8. Action 1 : traduire le questionnaire en néerlandais ; responsable : coordinateur du service client ; échéance : fin novembre 2026 ; effet attendu : taux de réponse néerlandophone en hausse (hypothèse).

Cas d'échec : sur un segment de 7 réponses (clients d'une seule ville), le rapport annonce « NPS de +57, en hausse de 20 points ». Sous 10 réponses, aucun score ne se publie. Correctif : le segment est regroupé avec un autre ou signalé « non publiable », et la hausse n'est pas commentée.
