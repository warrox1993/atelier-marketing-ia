---
name: "actifs-distinctifs"
description: "Inventorie les actifs distinctifs d'une marque (logo, couleur, formule, personnage, ton, visage du courtier), mesure si possible leur notoriété et leur unicité par sondage, les classe en à utiliser, à investir, à éviter et fournit des règles d'usage à reporter dans la charte de marque. À utiliser avant de modifier une identité visuelle ou pour vérifier qu'une création utilise les bons actifs."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "creation"
---

# Actifs distinctifs de marque

## Quand l'utiliser

- Création ou refonte d'identité visuelle ou verbale.
- Relecture d'une création pour vérifier qu'elle porte les actifs connus de la marque.
- Préparation d'un sondage de reconnaissance.

## Objectif

Savoir quels éléments font reconnaître la marque sans son nom, lesquels renforcer, lesquels abandonner, et imposer les actifs
retenus dans `charte-marque`. Niveau de preuve : [mémoire] ; à contrôler dans l'ouvrage avant toute citation.

## Prérequis

- Le document de stratégie du client, tenu par l'agent `stratege`, lu avant de produire.
- La charte de marque et les pièces actuelles du client (site, supports, réseaux).

## Entrées

- `pieces` : exemples de supports montrant les éléments de marque.
- `sondage` : résultats éventuels de reconnaissance (sinon, « non mesuré »).
- `concurrents` : éléments visibles chez les concurrents locaux.

## Étapes

1. Inventorier les actifs actuels : logo, couleur, formule, personnage ou visage du courtier, forme, ton.
2. Si un sondage est possible (agent `mesure`) : mesurer la notoriété (part qui relie l'actif à la marque) et l'unicité (part
   qui ne le relie pas à un concurrent). Sinon écrire « non mesuré ».
3. Classer chaque actif : à utiliser, à investir, à éviter ; écarter les éléments partagés avec une grande compagnie.
4. Rédiger les règles d'usage retenues et les reporter dans `charte-marque` ; chaque création les applique (agent `contenus`)
   et le `relecteur` contrôle la constance.

## Livrable

Un inventaire classé avec, pour chaque actif, sa notoriété et son unicité (mesurées ou « non mesuré »), la décision, la règle
d'usage et l'exemple de bon usage.

## Critères de réussite

- Chaque actif est classé avec la preuve ou la mention « non mesuré ».
- Aucun changement d'identité n'est proposé par goût sans mesure.
- Les règles d'usage figurent dans la charte de marque.

## Limites

- Sans sondage, le classement reste une hypothèse.
- Une couleur ou un style partagé avec une grande compagnie n'est pas distinctif.
- La compétence ne crée pas de logo ni de visuel final : elle fixe les règles.

## Exemple

Cas nominal (illustratif, chiffres fictifs) : un courtier local utilise un logo bleu, une couleur partagée avec deux grandes compagnies, et le visage du
courtier sur ses supports. Sondage de 100 clients : le visage est relié à la marque par une majorité, la couleur par peu. Décision :
investir dans le visage et la formule d'accueil ; éviter de miser sur la couleur seule.

Cas d'échec évité : une refonte graphique est proposée par goût. Sans mesure ni raison, la compétence recommande de garder
les actifs connus.

## Origine de la méthode

Jenni Romaniuk, *Building Distinctive Brand Assets* (2018). Procédure adaptée et traduite pour l'Atelier.
