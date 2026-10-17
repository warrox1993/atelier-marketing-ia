---
name: "pilotage-strategique"
description: "Aide la direction d'une PME à arbitrer entre les demandes concurrentes des services, à fixer des objectifs trimestriels (méthode OKR), à classer les initiatives par impact, effort et risque, et à tracer chaque décision dans un registre. À utiliser quand plusieurs services demandent des moyens limités, quand un trimestre doit être cadré ou quand une décision doit être préparée et documentée ; jamais pour trancher à la place du dirigeant, ni pour une décision d'investissement, d'embauche ou de tarification présentée comme prise."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "direction"
---

# Pilotage stratégique

## Quand l'utiliser

- Deux services ou plus demandent des moyens (budget, temps, personnes) qui ne suffisent pas pour tout.
- Le trimestre approche et la direction veut deux à cinq objectifs clairs, pas une liste de souhaits.
- Une décision structurante doit être préparée, puis tracée pour qu'on sache plus tard pourquoi elle a été prise.

## Objectif

Donner au dirigeant un arbitrage préparé : les demandes classées sur des critères explicites, des objectifs mesurables et un registre de décision. Le dirigeant tranche ; la compétence rend sa décision facile, rapide et traçable.

## Prérequis

- La liste des demandes, avec le service demandeur, la raison et l'échéance (extraits transmis par le bureau de liaison, jamais les dossiers complets).
- Les contraintes connues : budget disponible, effectifs, échéances légales, engagements en cours. Une contrainte non fournie est écrite « information manquante ».
- Le périmètre de la décision : qui décide, avant quand.

## Entrées

- `demandes` : intitulé, service, bénéfice attendu, coût estimé (marqué « estimation » s'il n'est pas chiffré par le service), échéance.
- `contraintes` : budget, capacité, dépendances.
- `trimestre` : période visée.

## Étapes

1. **Reformuler chaque demande en une phrase** : « Le service X veut Y pour obtenir Z avant la date D ». Fusionner les doublons en citant les services concernés.
2. **Écarter d'abord ce qui est obligatoire.** Une demande liée à une obligation légale ou contractuelle à échéance fixe (déclaration, échéance de contrat, norme) passe en tête, sous le libellé « obligation », et n'entre pas dans la notation. Si l'obligation n'est pas certaine, la marquer « à vérifier » et ne pas la classer comme obligatoire.
3. **Noter chaque autre demande sur trois critères, de 1 à 5**, avec une phrase de justification par note :
   - impact : effet attendu sur le chiffre d'affaires, la marge, la trésorerie, le risque évité ou le temps gagné ;
   - effort : coût et charge de travail (5 = très lourd) ;
   - risque : probabilité d'échec ou d'effet négatif (5 = risque élevé).
   Calculer le score de priorité : `impact x 2 - effort - risque`. Cette formule est un repère, pas une vérité : si deux demandes sont à moins de 2 points, le dire et laisser l'humain départager.
4. **Vérifier la capacité.** Additionner les efforts retenus ; si le total dépasse la capacité fournie, couper par le bas du classement et nommer ce qui est reporté et ce que le report coûte.
5. **Formuler les objectifs du trimestre (OKR).** Pour deux à cinq objectifs au maximum :
   - un objectif qualitatif, ambitieux, compréhensible par tous (« Rendre l'encaissement prévisible ») ;
   - deux à quatre résultats clés, chacun avec une mesure, une valeur de départ, une cible et une date (« Ramener le délai moyen d'encaissement de 52 à 42 jours au 31 décembre ») ;
   - un responsable par objectif, jamais un comité.
   Un résultat clé sans valeur de départ connue est écrit « valeur de départ à mesurer » ; on ne l'invente pas.
6. **Rédiger la décision tracée** selon le gabarit ci-dessous, avec les options écartées et la raison.
7. **Planifier la revue** : point de contrôle à mi-trimestre (cible atteinte à plus ou moins 30 %, objectif maintenu, ajusté ou abandonné) et clôture avec une note de 0 à 1 par résultat clé.

### Gabarit du registre de décision

| Champ | Contenu |
| --- | --- |
| Numéro et date | `DEC-AAAA-NN`, date de la proposition |
| Question | une phrase |
| Options étudiées | au moins deux, dont « ne rien faire » |
| Critères | impact, effort, risque, échéance légale |
| Recommandation | l'option, la raison, ce qu'elle exclut |
| Risques et plan B | deux ou trois, avec le signal d'alerte |
| Décision | vide tant que l'humain n'a pas tranché ; ensuite : option choisie, décideur, date |
| Revue prévue | date et indicateur regardé |

Chaque décision proposée est transmise au registre des décisions de la direction (compétence `registre-decisions`) avec
l'état « proposée » ; elle n'y passe à « prise » que sur la preuve d'une approbation humaine. Avant de proposer, vérifier
dans ce registre qu'une option identique n'a pas été rejetée avec la mention « ne pas reproposer ».

## Livrable

Un document court : tableau de priorisation (demandes, notes, score, justification), objectifs du trimestre en OKR, ce qui est reporté et son coût, et un registre de décision par décision à prendre. Les décisions sont marquées « proposée », jamais « prise ».

## Critères de réussite

- Chaque note est justifiée en une phrase ; aucune ne repose sur un chiffre inventé.
- Les obligations légales sont séparées de la notation.
- Chaque objectif a un responsable nommé, une mesure, une valeur de départ et une date.
- Le registre permet à quelqu'un d'extérieur de comprendre la décision un an plus tard.

## Sources officielles

Consultées le 16/10/2026 :

- « SME definition », Commission européenne, https://single-market-economy.ec.europa.eu/smes/sme-definition_en : micro-entreprise moins de 10 personnes et chiffre d'affaires ou total du bilan jusqu'à 2 millions d'euros ; petite moins de 50 personnes et jusqu'à 10 millions ; moyenne moins de 250 personnes, chiffre d'affaires jusqu'à 50 millions ou total du bilan jusqu'à 43 millions. Sert à adapter l'ambition des objectifs à la taille de l'entreprise.
- La méthode OKR et la formule de priorité sont des pratiques de gestion, pas une norme : aucune source officielle n'est citée pour elles.

## À vérifier par un professionnel

Une décision d'investissement, de financement, de restructuration, d'embauche ou de tarification a des effets comptables, fiscaux et sociaux : la faire relire par l'expert-comptable ou le réviseur d'entreprises de l'entreprise, et par un juriste (avocat) si elle touche un contrat ou le droit social.

## Limites

- Les scores sont des jugements fondés sur les informations transmises ; ils ne remplacent pas une étude chiffrée.
- Sans capacité ni budget fournis, l'étape 4 est impossible : le dire au lieu de supposer.
- La compétence ne choisit pas entre deux demandes d'importance égale : elle le signale.

## Exemple

Trimestre T1 2027. Trois demandes : le service commercial veut une campagne (coût estimé 4 000 euros), le service comptabilité veut remplacer son logiciel de facturation (coût non chiffré), le service administratif doit renouveler un contrat de bail avant le 15 mars (échéance contractuelle).

| Demande | Statut | Impact | Effort | Risque | Score |
| --- | --- | --- | --- | --- | --- |
| Renouvellement du bail | obligation (échéance 15/03) | n/a | n/a | n/a | en tête |
| Campagne commerciale | notée | 4 (nouveaux contacts, pas de chiffre de conversion fourni) | 2 | 2 | 4 |
| Logiciel de facturation | non notable | information manquante : coût non chiffré | | | |

Résultat : le bail passe en tête ; la campagne est recommandée ; le logiciel reste « à instruire » avec la question précise « quel est le coût de licence et de migration ? ».

Cas d'échec : le service commercial annonce « +30 % de ventes » sans source. La compétence ne retient pas ce chiffre : elle note l'impact « non démontrable », demande la source et ne classe pas la demande avant de l'avoir.
