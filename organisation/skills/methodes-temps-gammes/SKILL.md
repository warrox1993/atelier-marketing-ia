---
name: "methodes-temps-gammes"
description: "Établit ou met à jour les gammes de fabrication (suite d'opérations, poste, temps de réglage et temps unitaire), mesure ou estime les temps standards, et réduit les temps de changement de série par la méthode SMED (séparer les opérations internes et externes, transférer, simplifier). À utiliser pour créer une gamme, fiabiliser des temps ou raccourcir les réglages ; jamais pour imposer une nouvelle gamme, une cadence ou un changement de poste sans décision humaine et concertation."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "production"
---

# Méthodes : gammes, temps et changements de série

## Quand l'utiliser

- Un nouveau produit doit être industrialisé et sa gamme n'existe pas.
- Les temps des gammes sont faux (le planning n'est jamais tenu) ou personne ne sait d'où ils viennent.
- Les changements de série sont longs et poussent à produire en grosses séries.

## Objectif

Des gammes à jour dont chaque temps a une origine (mesuré, estimé, repris du fabricant) et une date, et un plan de
réduction des temps de changement de série chiffré, avec la mise en application laissée à la décision humaine.

## Prérequis

- Le plan ou la fiche du produit, la nomenclature, les postes disponibles.
- Les relevés de temps existants (progiciel, fiches d'atelier) et, pour un changement de série, une observation filmée ou
  notée d'au moins un réglage complet.
- L'accord de l'atelier pour l'observation (les personnes savent pourquoi on mesure).

## Entrées

- `produit` : référence, plan, nomenclature.
- `postes` : machines et compétences disponibles.
- `releves` : temps observés avec date, poste, quantité, conditions.
- `reglage` : liste des opérations d'un changement de série observé, avec leur durée.

## Étapes

1. **Écrire la gamme** : opérations dans l'ordre, poste, outillage, contrôles, temps de réglage par lot et temps unitaire
   par pièce. Chaque temps porte son origine (mesuré le ..., estimé par ..., fabricant) ; un temps sans origine est
   « à mesurer ».
2. **Fiabiliser les temps** : comparer temps de gamme et temps réalisés sur plusieurs lots ; un écart durable de plus de
   10 % (repère à fixer) signale une gamme à revoir. Les temps décrivent une méthode, jamais la performance d'une personne.
3. **Analyser un changement de série (SMED)** :
   - phase 1 : lister chaque opération du réglage observé et la classer **interne** (machine arrêtée) ou **externe**
     (faisable pendant que la machine produit encore la série précédente) ;
   - phase 2 : transférer en externe tout ce qui peut l'être (préparer outils et matières à l'avance, préchauffer,
     prérégler) ;
   - phase 3 : simplifier les opérations internes restantes (fixations rapides, hauteurs standard, repères de couleur) ;
   - phase 4 : supprimer les réglages par tâtonnement (détrompeurs, gabarit de contrôle de la première pièce).
   Chiffrer le temps avant et le temps visé à chaque phase.
4. **Ordonner les séries** quand l'ordre change la durée du réglage (couleur claire vers foncée, petit vers grand) :
   construire la matrice des temps de réglage entre produits et la transmettre à l'ordonnancement.
5. **Évaluer l'effet** : temps de réglage gagné par semaine, taille de lot possible, encours et délai réduits ; coût des
   moyens nécessaires (outillage, chariot de préparation).
6. **Préparer la mise en application** : nouvelle gamme ou nouvelle méthode de réglage en projet, formation, essai sur une
   série, consultation prévue des travailleurs ; une carte de décision par changement.

## Livrable

Gamme à jour (opérations, postes, temps et origine) ; tableau des écarts gamme et réalisé ; analyse SMED (opérations
internes et externes, transferts, simplifications, temps avant et visé) ; matrice des réglages ; plan d'essai ; décisions.

## Critères de réussite

- Chaque temps a une origine et une date.
- Chaque opération de réglage est classée interne ou externe, et le gain est chiffré par phase.
- Aucun temps n'est rattaché nominativement à une personne.
- Aucune gamme ni méthode n'est présentée comme appliquée sans décision humaine.

## Sources officielles

Consultée le 17/10/2026 :

- Loi du 4 août 1996 relative au bien-être des travailleurs lors de l'exécution de leur travail, et Code du bien-être au
  travail, livre IV, titre 2, art. IV.2-2 (principes ergonomiques pris en considération pour le poste de travail et la
  position du travailleur lors de l'utilisation des équipements), SPF Emploi, Travail et Concertation sociale,
  https://emploi.belgique.be/fr/themes/bien-etre-au-travail/equipements-de-travail (page et texte du titre 2 lus) : une
  nouvelle méthode de travail tient compte de l'ergonomie du poste.

## À vérifier par un professionnel

- La consultation du comité pour la prévention et la protection au travail (ou de la délégation syndicale) avant un
  changement de poste ou de méthode, et l'éventuelle information du conseil d'entreprise : conseiller en prévention et
  ressources humaines.
- L'usage de relevés de temps pour une évaluation individuelle est exclu ici ; toute autre finalité est à valider par les
  ressources humaines.

## Limites

- Elle ne remplace pas une étude de temps chronométrée par un spécialiste quand la précision est critique.
- Les gains SMED annoncés dans la littérature sont des ordres de grandeur, pas des promesses.
- Elle ne choisit pas entre production par campagnes et production mélangée : elle fournit les temps à l'ordonnancement.

## Exemple

Changement de série d'une presse à injecter observé : 78 minutes. Phase 1 : 23 opérations, dont 9 faisables machine en
marche (préparer le moule suivant, chercher les outils, préchauffer). Phase 2 : 31 minutes transférées en externe. Phase 3 :
brides rapides sur 4 fixations, 12 minutes gagnées. Temps visé : 35 minutes, à confirmer par un essai. Effet : deux
réglages par jour possibles au lieu d'un, lots divisés par deux. Carte : « essai de la nouvelle méthode de réglage sur la
série du 3/11 ».

Cas d'échec évité : la direction veut « afficher le temps de réglage de chaque régleur ». La compétence refuse le
classement nominatif et propose un suivi par machine et par méthode.

## Origine de la méthode

Méthode SMED en quatre phases (opérations internes et externes, transfert, simplification, suppression des réglages)
et matrice des réglages selon l'ordre des séries adaptées et traduites de github.com/affaan-m/ECC,
`skills/production-scheduling/SKILL.md`, « Changeover Optimization », commit ef648e01899ba3e8dc6371642deaaf64b4477775,
compétence sous licence Apache 2.0 (en-tête `license: Apache-2.0`, auteur « evos »). Modifications : réécriture en
français, gammes et origine des temps, concertation des travailleurs, décision humaine. Texte des licences et liste des
reprises : `organisation/skills/LICENCES-TIERS.md`.
