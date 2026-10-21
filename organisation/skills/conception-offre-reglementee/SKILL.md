---
name: "conception-offre-reglementee"
description: "Conçoit l'offre d'un client d'un secteur réglementé (assurance, finance) avec l'équation de valeur : inventaire des obstacles du client, une solution par variable, liste des leviers interdits ou à risque (rareté, urgence, garanties de résultat), fiche d'offre à faire valider par la conformité. À utiliser après le positionnement quand il faut rendre l'offre évidente ; jamais pour promettre un résultat ni copier tel quel les procédés de vente d'un ouvrage de praticien."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "marketing"
---

# Conception d'une offre réglementée

## Quand l'utiliser

- Le positionnement est écrit et les demandes arrivent mais ne se transforment pas : retour à l'offre et au parcours.
- Le client veut un « bilan de couverture », un comparatif, un accompagnement : il faut le structurer avant de le communiquer.
- Avant tout texte de vente d'un produit d'un secteur réglementé.

## Objectif

Produire une fiche d'offre où chaque obstacle du client a une solution, sans promesse de résultat et sans levier de pression interdit, prête pour la validation de `conformite-publicitaire`. Source : Alex Hormozi, *$100M Offers* (2021) [secondaire : texte non consulté]. L'équation de valeur (résultat rêvé fois probabilité perçue, divisé par délai fois effort et sacrifices) est une grille de réflexion, pas une formule mathématique. Le livre est celui d'un praticien, sans étude contrôlée. Complément : Christensen et al., *Competing Against Luck* (2016) et Bob Moesta pour les forces du progrès [mémoire]. La paternité de l'approche « Jobs to be Done » est disputée [contesté].

## Prérequis

- Le positionnement (cible, valeur, preuves).
- Les anxiétés et jobs identifiés, s'ils existent (compétence `analyse-jobs-a-faire`). Sinon, les marquer « hypothèse ».
- Les contraintes réglementaires connues du client (fiche de cadrage).

## Entrées

- `positionnement` : énoncé et tableau de preuves.
- `obstacles` : ce que les clients disent ou font avant, pendant et après l'achat (entretiens, avis, questions reçues).
- `coutLivraison` : ce que chaque solution coûte réellement au client en temps et en moyens.

## Étapes

1. Lister tous les obstacles du client avant, pendant et après l'achat. Exemples pour un courtier : temps de comparaison, peur d'être mal couvert pendant un changement, paperasse, gestion du sinistre.
2. Pour chaque obstacle, proposer une solution qui joue sur UNE variable : la probabilité perçue (preuve), le délai (rapidité), l'effort (prise en charge).
3. Retenir les solutions à forte valeur pour le client et faible coût de livraison, puis les empaqueter (par exemple bilan de couverture, comparatif, accompagnement en cas de sinistre).
4. Nommer l'offre clairement, sans promesse de résultat.
5. Passer chaque élément au crible de la liste des leviers interdits ou à risque (voir Limites). Retirer ou reformuler.
6. Pour chaque solution, noter la preuve disponible et les mentions obligatoires à prévoir (compétence `controle-communications-reglementees`).
7. Faire valider par `conformite-publicitaire` avant tout usage par `crm-conversion`, `contenus` ou `sea`. Si le feu vert n'est pas donné, l'offre reste en brouillon.
8. Faire valider l'offre par l'humain (choix métier) et la déposer dans le document de stratégie (rubrique « Offre »).

## Livrable

Une fiche d'offre : obstacles, solutions, variable visée (probabilité, délai, effort), preuve, coût de livraison, mentions à prévoir, statut conformité, leviers écartés avec la raison.

## Critères de réussite

- Aucun résultat de sinistre, de remboursement ou de prix n'est promis.
- Chaque solution porte sa variable, sa preuve et son coût de livraison.
- La fiche mentionne les leviers écartés et pourquoi.
- Le retour de la conformité est joint ; sans lui, l'offre est marquée « non validée ».

## Limites

- Leviers interdits ou à risque en assurance : rareté artificielle, urgence artificielle, garanties « satisfait ou remboursé », promesse sur l'issue d'un sinistre. Ils peuvent constituer une pratique trompeuse ou agressive (livre VI du Code de droit économique) ; un courtier ne garantit pas l'issue d'un sinistre. À confirmer par un juriste avant usage client.
- Un contenu ne doit jamais être présenté comme un conseil personnalisé : le conseil suppose la collecte préalable des exigences et besoins du client (règles de conduite issues de la directive (UE) 2016/97, articles à vérifier).
- Document d'information normalisé (IPID) pour les produits non-vie : mention à vérifier avec le client [mémoire].
- Ne jamais tenir pour acquise la valeur d'une solution qu'aucun client n'a confirmée : « hypothèse ».
- La conformité ne se conclut pas toute seule : un humain valide.

## Exemple

Client fictif : courtier spécialisé dans les cabinets de santé.

| Obstacle | Solution | Variable | Preuve | Coût de livraison | Statut |
| --- | --- | --- | --- | --- | --- |
| « Je ne sais pas si je suis bien couvert » | bilan de couverture d'une heure, document remis | probabilité (preuve) | modèle de bilan existant | 1 h de conseil | à valider par la conformité |
| « Changer prend du temps » | le client gère les formalités de résiliation | effort | procédure écrite du client | 30 min | à valider |
| « Que se passe-t-il en cas de sinistre ? » | un interlocuteur désigné, délai de premier retour annoncé | délai | délai moyen mesuré (à fournir, sinon hypothèse) | variable | à valider |

Leviers écartés : « offre limitée à 10 cabinets » (rareté artificielle), « satisfait ou remboursé » (garantie de résultat).
