---
name: "pilotage-partenaires"
description: "Pilote le portefeuille de partenaires d'une PME belge : indicateurs par partenaire, revue trimestrielle, plan d'action conjoint, détection des dérapages et fin de partenariat ordonnée (préavis, stock, clientèle, communication). À utiliser pour suivre un partenaire en place, préparer une revue ou envisager de réduire ou d'arrêter une relation ; jamais pour mettre fin à un contrat, partager des données ou engager un budget sans décision humaine."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "partenariats"
---

# Pilotage des partenaires

## Quand l'utiliser

- Des partenaires sont en place et la direction ne sait pas lesquels tiennent leurs objectifs.
- Une revue trimestrielle d'un partenaire doit être préparée.
- Un partenaire dérape (ventes en baisse, retards de paiement, plaintes, conflit de territoire) et il faut un plan d'action ou une sortie.

## Objectif

Pour chaque partenaire, un tableau court et comparable d'une période à l'autre, une revue trimestrielle qui aboutit à une décision écrite (poursuivre, ajuster, mettre sous surveillance, arrêter) et un plan d'action conjoint avec responsables et échéances. Quand l'arrêt est envisagé, un plan de sortie ordonnée qui limite le risque juridique, financier et commercial.

## Prérequis

- La convention en vigueur du partenaire et ses objectifs minimaux (durée, préavis, exclusivité, commissions).
- Les indicateurs convenus avec la direction et, si possible, avec le partenaire.
- Les données de ventes ou d'activité du partenaire, avec leur source et leur date.

## Entrées

- `partenaire` : nom légal et référence de la convention.
- `periode` : par exemple `T3 2026`.
- `donnees` : chiffres transmis par le partenaire, extraits du service commercial ou de la comptabilité via la liaison (montants seuls, pas de données personnelles de clients).
- `objectifs` : cibles inscrites dans la convention ou fixées par la direction.

## Étapes

1. **Définir les indicateurs** (cinq à huit au plus, chacun avec définition, formule, source, fréquence) : chiffre d'affaires ou commandes apportés, atteinte de l'objectif minimal en pourcentage, nombre de prospects transmis et taux de conversion, marge ou commission versée, délai de paiement du partenaire et délai de paiement à celui-ci, qualité (réclamations, retours, satisfaction mesurée), respect des engagements de marque et de territoire, niveau d'activité (formations suivies, visites, événements).
2. **Collecter et dater** les données ; une donnée déclarée par le partenaire est marquée « déclarée », une donnée de l'entreprise « constatée ». Aucune donnée manquante n'est estimée.
3. **Comparer** à l'objectif, à la période précédente et à la même période de l'année précédente quand elle existe. Une rupture de série (changement de territoire, de gamme, de prix) est notée.
4. **Attribuer un statut** selon des seuils écrits par la direction (vert, orange, rouge). Sans seuil convenu : « seuil à définir par la direction », pas de couleur.
5. **Préparer la revue trimestrielle** : ordre du jour d'une page (résultats, causes, points forts, difficultés, demandes du partenaire, demandes de l'entreprise), questions préparées, ce qui ne sera pas dit (informations réservées, autres partenaires).
6. **Bâtir le plan d'action conjoint** : trois à cinq actions maximum, chacune avec responsable (côté entreprise et côté partenaire), échéance, indicateur de succès. Une action qui engage un budget, une exclusivité, un territoire ou un partage de données devient une carte de décision, pas une ligne de plan.
7. **Décider de la suite** : recommandation motivée (poursuivre, ajuster, surveiller, arrêter) ; la décision appartient à la direction.
8. **Organiser une fin ordonnée** si l'arrêt est décidé :
   - relire la convention (durée, résiliation, préavis, indemnités, clause de non-concurrence, sort du stock, de la marque et des données) ;
   - demander à l'avocat la lecture de la sortie avant tout courrier (flux « convention de partenariat à relire ») ; pour un agent commercial ou un concessionnaire exclusif, le préavis ou l'indemnité de fin peut être important (voir `accord-de-partenariat`) ;
   - chiffrer les engagements restants : commandes en cours, stock chez le partenaire, commissions dues, exposition à une indemnité ;
   - préparer la transition : répartition de la clientèle, informations aux clients (message validé par l'humain), reprise ou désactivation des accès, restitution des supports et données, fin de l'usage de la marque ;
   - établir le calendrier et les responsables ; consigner la décision.
9. **Archiver** la revue et la décision dans les documents du service, pour que la suivante parte de celle-ci.

## Livrable

Tableau de pilotage par partenaire (indicateurs, valeurs, source, date, statut) ; note de revue trimestrielle d'une à deux pages avec décision recommandée ; plan d'action conjoint ; en cas d'arrêt, plan de fin de partenariat avec calendrier, chiffrage des engagements restants, questions pour l'avocat et projets de messages à valider ; table des faits et informations manquantes.

## Critères de réussite

- Chaque indicateur a une définition écrite, une source et une date ; aucune donnée manquante n'est estimée.
- Le tableau est comparable d'un trimestre à l'autre.
- La revue aboutit à une recommandation unique et motivée, et le plan d'action tient en cinq lignes au plus.
- Toute mesure engageant un budget, une exclusivité, un partage de données ou une rupture a sa carte de décision et sa lecture juridique.
- Un plan de sortie ne part jamais vers le partenaire sans validation humaine ; aucun message ne présente la fin comme décidée avant la décision.

## À vérifier par un professionnel

Toute rupture, tout non-renouvellement et tout calcul d'indemnité de fin de contrat sont à faire relire par un avocat avant courrier. Les commissions, remises et créances sur partenaires sont à valider par le comptable. Les messages aux clients touchant des données personnelles sont à valider avec le juridique (RGPD).

## Limites

- Les chiffres déclarés par un partenaire ne sont pas vérifiés par ce service ; un écart fort entre déclaré et constaté est signalé, pas arbitré.
- Aucun seuil universel : les repères de statut viennent de la direction et du secteur.
- Aucune source officielle en ligne n'a été ouverte pour cette compétence ; les indicateurs sont des conventions de gestion, pas des normes.
- Le service ne note jamais une personne : les indicateurs portent sur l'entreprise partenaire.

## Exemple

Revue du T3 2026 d'un revendeur régional. Objectif minimal inscrit à la convention : 120 000 euros de commandes par trimestre (hors TVA). Constaté par la comptabilité (extrait du 06/10, provisoire) : 84 000 euros, soit 70 %, contre 91 000 au T2. Statut orange selon le seuil de la direction (rouge sous 60 %). Hypothèse de cause : départ d'un commercial du partenaire, à confirmer en revue. Plan d'action : formation produit en novembre (responsable : le commercial interne), objectif de 100 000 euros au T4. Recommandation : ajuster et surveiller ; décision attendue de la direction.

Cas d'échec : la direction souhaite arrêter la relation et demande « un courrier de résiliation immédiate ». Le service ne rédige aucun courrier : il rappelle que le partenaire est agent commercial depuis sept ans, que l'exposition à un préavis long et à une indemnité d'éviction est à chiffrer et à faire valider, pose la carte de décision et la question à l'avocat, et prépare seulement le plan de sortie. Autre échec évité : le revendeur n'a pas transmis ses chiffres ; le tableau écrit « information manquante » et la demande de données, sans estimer à partir du trimestre précédent.
