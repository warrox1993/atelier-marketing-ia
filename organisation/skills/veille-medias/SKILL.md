---
name: "veille-medias"
description: "Tient la revue de presse et mesure les retombées médiatiques d'une entreprise belge : retombées retenues ou écartées avec le motif, chaque article daté et lié, indicateurs utiles (nombre de retombées, trafic issu des articles, hausse des recherches de la marque, citation par les moteurs d'IA, conversations commerciales qui citent l'article), alertes de réputation et erreurs factuelles à faire rectifier. À utiliser pour une revue de presse périodique, un bilan après un communiqué ou une alerte ; jamais pour calculer un équivalent en valeur publicitaire, répondre à un journaliste ni exercer un droit de réponse sans validation."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "communication"
---

# Veille médias et mesure des retombées

## Quand l'utiliser

- Revue de presse hebdomadaire, mensuelle ou trimestrielle.
- Bilan des retombées après un communiqué ou un événement.
- Un article, un reportage ou une publication en ligne met l'entreprise en cause et il faut le signaler vite.

## Objectif

Une revue de presse exacte (chaque retombée datée, liée, rattachée à l'entreprise pour une raison dite) et une mesure qui
dit ce que la couverture a réellement produit, sans indicateur trompeur.

## Prérequis

- Les articles et publications de la période (liens, copies, export d'un service de veille) et la liste des sujets suivis.
- Les données disponibles pour la mesure : statistiques du site (trafic par provenance), recherches de la marque, notes
  du CRM qui citent un article. Une donnée absente est dite.
- Le communiqué ou l'événement de référence, pour un bilan.

## Entrées

- `articles` : titre, média, date, lien, langue, extrait.
- `periode` : dates de début et de fin.
- `mesures` : exports disponibles (trafic, recherches, CRM).

## Étapes

1. **Trier les articles** : une retombée parle de l'entreprise, de ses dirigeants nommés, de ses produits ou reprend son
   communiqué. Un article sans lien est écarté avec le motif (homonyme, sujet voisin, simple mention dans une liste).
2. **Fiche par retombée** : média, date, lien, langue, type (article, reportage, interview, reprise du communiqué),
   tonalité (positive, neutre, négative) justifiée par une phrase citée, message clé repris ou non, erreur factuelle
   éventuelle.
3. **Mesurer** avec les indicateurs utiles : nombre de retombées ; trafic du site venu des articles ; hausse des
   recherches de la marque sur la période ; citation de l'entreprise par les moteurs d'IA, si elle a été vérifiée ;
   conversations commerciales qui citent l'article (notes du CRM). Chaque indicateur indique sa source ou « non mesuré ».
   On ne calcule pas d'équivalent en valeur publicitaire : c'est un indicateur trompeur.
4. **Lever les alertes** : article négatif, erreur factuelle, rumeur reprise par plusieurs médias, mise en cause d'une
   personne. Une alerte part au coordinateur le jour même ; en crise, elle alimente la table des faits de la cellule de
   crise.
5. **Préparer les suites** : demande de rectification à un média (brouillon), droit de réponse (délais à vérifier avec
   la compétence `communique-de-presse` et le juriste), saisine d'une instance de déontologie : toutes en carte de
   décision.
6. **Rédiger la synthèse** : faits marquants, tendances, messages repris, points d'attention.

## Livrable

Revue de presse (tableau des retombées retenues et écartées avec motif) ; tableau des indicateurs avec sources ; alertes ;
brouillons de suites éventuelles ; synthèse d'une demi-page.

## Critères de réussite

- Chaque retombée est datée et liée ; chaque article écarté a son motif.
- Aucun équivalent en valeur publicitaire ; chaque indicateur a sa source ou est dit « non mesuré ».
- Chaque tonalité est justifiée par une citation exacte.
- Aucune demande de rectification ni droit de réponse envoyé sans carte.

## Sources officielles

Consultées le 16/10/2026 (sources de la compétence `communique-de-presse`) :

- Conseil de déontologie journalistique (Belgique francophone et germanophone), code de déontologie,
  https://www.lecdj.be/fr/deontologie/code/ : les rédactions rectifient explicitement et rapidement les faits erronés
  qu'elles ont diffusés ; base d'une demande de rectification ou d'une plainte déontologique.
- Raad voor de Journalistiek (Flandre), https://www.rvdj.be/ : instance d'autorégulation pour les médias flamands.
- Loi du 23 juin 1961 relative au droit de réponse, Justel, citée par `communique-de-presse` : délais et conditions à y
  relire avant toute demande.
- Belga, https://www.belga.be/fr : agence de presse belge (source commerciale du prestataire pour ses services).

## À vérifier par un professionnel

- Toute demande de rectification, tout droit de réponse et toute plainte déontologique sont relus par le juriste avant
  envoi, surtout quand l'article met en cause une personne.
- La conservation d'articles contenant des données sur des personnes (dirigeants, clients cités) suit la politique de
  l'entreprise, à valider par le délégué à la protection des données.

## Limites

- La compétence ne surveille pas les médias en continu : elle traite les articles fournis ou collectés par l'humain.
- Une hausse de trafic ou de recherches pendant la période n'est pas une preuve de causalité : elle est dite
  « observée ».
- La citation par les moteurs d'IA varie selon la question et le moment : un relevé ponctuel n'est pas une mesure stable.

## Exemple

Cas nominal : 6 articles du trimestre, dont 2 sans lien (un homonyme, une liste d'entreprises sans mention du sujet).
4 retombées retenues, datées et liées ; tonalité justifiée par une citation ; trafic issu des articles : 212 visites
(statistiques du site) ; recherches de la marque : non mesuré ; aucune valeur publicitaire calculée.

Cas d'échec évité : la direction demande « combien valent ces articles en publicité ». L'agent ne produit pas de montant :
il explique pourquoi l'indicateur est trompeur et propose les indicateurs mesurés.

## Origine de la méthode

Indicateurs de mesure adaptés et traduits de github.com/coreyhaines31/marketingskills, `skills/public-relations/SKILL.md`,
section « Measurement » (indicateurs utiles, rejet de l'équivalent en valeur publicitaire), commit
dda3841f0b294e01e93b1541486beefbfab0915e, licence MIT, Copyright (c) 2025 Corey Haines. Modifications : réécriture en
français, cadre belge (déontologie, droit de réponse). Texte de la licence et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
