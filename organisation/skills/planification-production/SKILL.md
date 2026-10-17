---
name: "planification-production"
description: "Prépare le plan de production d'une PME belge industrielle ou de services : charge et capacité par poste ou équipe, plan directeur, ordonnancement des ordres de fabrication ou des interventions, repérage des goulots et simulation de scénarios. À utiliser pour proposer un planning réaliste, comparer des scénarios ou expliquer un retard ; jamais pour lancer un ordre de fabrication, modifier un planning déjà validé, imposer un horaire à une personne ni inventer une durée, une cadence ou une capacité absente des données."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "production"
---

# Planification de la production

## Quand l'utiliser

- Une commande, une série ou un projet doit être placé dans un planning existant et la direction veut savoir si la date promise est tenable.
- Les retards se répètent et il faut savoir où le flux se bloque (poste, équipe, matière, outil).
- Il faut comparer deux scénarios (heures supplémentaires, sous-traitance, décalage d'une commande, changement de séquence).
- Un plan directeur à 4 ou 12 semaines doit être rédigé ou mis à jour.

## Objectif

Un plan où chaque ordre a un poste, une durée, une date de début et de fin, des dépendances (matière, outil, personne), avec la charge de chaque ressource comparée à sa capacité, les goulots nommés, les hypothèses écrites et la décision humaine à prendre. Le plan est une proposition : il ne devient planning qu'après validation humaine.

## Prérequis

- La liste des ordres ou commandes à planifier, avec quantités, date promise au client et priorité décidée par la direction.
- Pour chaque poste ou équipe : horaire normal, nombre de ressources, jours d'arrêt connus (maintenance, congés collectifs, jours fériés).
- Les gammes ou durées par unité, avec leur origine (chronométrage, historique, estimation de l'atelier). Une durée estimée est marquée comme telle.
- La disponibilité des matières et des outils, transmise par la logistique et les achats via le bureau de liaison.
- Le taux de rendement disponible (voir la compétence `indicateurs-trs`), sinon l'hypothèse écrite.

## Entrées

- `ordres` : référence interne, quantité, date promise, priorité, gamme (suite de postes et durées).
- `ressources` : poste, capacité nominale en heures par période, absences planifiées.
- `contraintes` : matière attendue à telle date, outil partagé, délai de séchage ou de contrôle, réglage entre deux références.
- `horizon` : par exemple 4 semaines détaillées et 12 semaines en vue d'ensemble.

## Étapes

1. **Vérifier les données** : unités (minutes, heures, pièces), cohérence des gammes, dates réalistes. Une donnée manquante est listée, pas devinée.
2. **Calculer la capacité disponible** par poste et par période : capacité nominale moins absences et arrêts connus, puis multipliée par le taux de rendement retenu. Écrire le calcul en entier : heures nominales, déductions, taux, résultat.
3. **Calculer la charge** : pour chaque ordre, quantité multipliée par la durée unitaire, plus le temps de réglage, ajoutée au poste concerné et à la période où il s'exécute.
4. **Comparer charge et capacité** : taux de charge = charge / capacité disponible. Au-delà de 100 %, le poste est en surcharge ; entre 85 % et 100 %, il n'y a plus de marge pour les aléas (repères de départ, à fixer par la direction).
5. **Repérer le goulot** : classer les postes par rapport charge sur capacité disponible, par équipe et sur au moins deux périodes, pas en moyenne. Vérifier la causalité : une heure de capacité ajoutée à ce poste augmenterait-elle la production totale ? Un poste devant lequel l'encours s'accumule n'est pas forcément le goulot (un poste amont qui lance de gros lots ou une ressource partagée peut créer la file) : corriger d'abord le lancement amont. Si le goulot change selon l'équipe ou le mélange de produits, le dire et ordonnancer par équipe. La cause d'un goulot reste une hypothèse tant que l'atelier ne l'a pas confirmée.
6. **Ordonnancer selon la logique tambour, tampon, corde** : le goulot (tambour) fixe le rythme ; un tampon de temps protège le goulot (repère de départ : la moitié du délai de production jusqu'au goulot), suivi par zones (vert sous un tiers consommé, jaune entre un et deux tiers : relancer l'amont, rouge au-delà : alerte à la direction) ; la corde règle les lancements amont sur la consommation du goulot. Les postes non goulots servent le goulot et ne sont pas chargés à 100 % pour eux-mêmes : un temps d'inactivité prévu y est normal. Aucune affectation au-delà de la capacité déclarée d'un poste.
   Règles de priorité, dans cet ordre : ordres en retard ou qui le seront sans traitement immédiat (par exposition aux pénalités du client) ; ordres qui alimentent le goulot quand son tampon est en jaune ou en rouge ; puis, selon le mélange de produits, date promise la plus proche (grande variété, petites séries), durée de traitement la plus courte (longues séries, peu de produits) ou date promise avec regroupement des réglages quand un échange de deux ordres voisins économise un réglage important sans créer de retard ; à égalité, priorité de la direction. La règle appliquée est écrite.
7. **Bâtir au moins deux scénarios** quand une date promise est en danger : plan de base, plan avec levier (heures supplémentaires, équipe supplémentaire, sous-traitance, décalage d'une commande). Pour chaque scénario : date de fin, charge, coût indicatif si la donnée existe, risque.
8. **Écrire les aléas et la réponse prévue** : que se passe-t-il si la matière arrive deux jours plus tard, si un poste tombe en panne une journée, si un lot est bloqué par la qualité ou si un opérateur qualifié est absent ? Citer l'ordre le plus exposé. Réponse type à une perturbation : mesurer la durée d'indisponibilité et dire si le poste touché est le goulot ; geler les ordres en cours ou qui démarrent dans les deux heures ; réordonnancer le reste avec les règles de priorité (protéger d'abord le temps du goulot, puis les engagements clients) ; proposer le nouveau planning, puis le stabiliser au moins quatre heures ou jusqu'à la prochaine équipe sauf nouvelle perturbation. Un lot bloqué par la qualité est retiré du calcul tant qu'il n'est pas libéré.
9. **Rester cohérent avec le progiciel de gestion** (ERP) : la proposition part des ordres, gammes et nomenclatures du progiciel et signale tout écart (gamme fausse, ordre clos encore ouvert) ; elle ne modifie pas le progiciel.
10. **Préparer la décision** : tout plan qui touche une date promise à un client ou un horaire de personnel passe par une carte de décision humaine, avec les conséquences. Toute modification d'un planning déjà validé est une nouvelle proposition, jamais un remplacement silencieux.

Exemple de calcul (étape 4) : en semaine 2, le poste P3 a 52 heures de charge pour 40 heures disponibles, soit 130 % : il est le goulot ; le planning n'y affecte que 40 heures et liste les ordres reportés avec leur retard prévu, la décision (heures supplémentaires, sous-traitance, report) étant renvoyée à l'humain.

## Livrable

- Un tableau de plan (ordre, poste, début, fin, dépendance, statut « proposé »).
- Un tableau charge contre capacité par poste et par période, avec les calculs visibles.
- La liste des goulots et des hypothèses, la table des faits sourcés, les scénarios comparés et les informations manquantes.
- La carte de décision pour la personne qui valide.

## Critères de réussite

- Chaque capacité et chaque charge est recalculable à partir des données listées.
- Aucune durée, cadence ou date inventée ; toute estimation est étiquetée.
- Le goulot est désigné avec la preuve (taux de charge sur plusieurs périodes), pas par impression.
- Les limites légales de durée du travail sont respectées ou le dépassement est signalé comme point à valider par un humain.
- Aucune affectation au-delà de la capacité déclarée ; la règle de priorité est écrite ; la liste des ordres en retard prévus est exacte.
- Aucun ordre lancé, aucun planning validé modifié sans décision humaine écrite.

## Sources officielles

Consultées le 16/10/2026 :

- « Durée du travail et temps de repos », SPF Emploi, Travail et Concertation sociale, https://emploi.belgique.be/fr/themes/international/detachement/conditions-de-travail-respecter-en-cas-de-detachement-en-0 : durée du travail de 8 heures par jour au maximum (9 ou 10 heures dans certains cas), 38 heures par semaine en moyenne, au moins 11 heures de repos entre deux journées, pause de 15 minutes au-delà de 6 heures, travail du dimanche en principe interdit sauf dérogations sectorielles ; renvoie à la loi du 16 mars 1971 sur le travail. Page rédigée pour le détachement : la lire comme repère général, pas comme règle sectorielle.
- « Bien-être au travail », SPF Emploi, https://emploi.belgique.be/fr/themes/bien-etre-au-travail : le Code du bien-être au travail rassemble l'essentiel des arrêtés d'exécution de la loi du 4 août 1996 et a succédé au RGPT ; le conseiller en prévention du service interne ou externe est le premier interlocuteur.

Non obtenu : le texte de la loi du 16 mars 1971 sur Justel (la page renvoyée ne contenait que la navigation du site). Les règles d'horaire (règlement de travail, heures supplémentaires, travail de nuit, régimes flexibles) ne sont donc pas détaillées ici. Les formules de charge, de taux de charge et de goulot sont des conventions de gestion de production, sans source officielle citée.

## À vérifier par un professionnel

Tout horaire qui sort de l'horaire affiché (heures supplémentaires, équipe de nuit ou de week-end, chômage temporaire) est à faire vérifier par le secrétariat social ou le conseiller en droit social, et par le conseiller en prévention pour l'effet sur la sécurité. La consultation des représentants des travailleurs, quand l'entreprise en a, relève de la direction et de ses conseillers.

## Limites

- Le plan vaut ce que valent les durées d'entrée : sans gamme fiable, il donne un ordre de grandeur, pas une date ferme.
- La compétence ne lance pas la fabrication, ne réserve pas de matière, ne contacte pas de client et ne modifie aucun planning validé.
- Elle ne pilote pas des machines et ne remplace ni un logiciel d'ordonnancement avancé ni le chef d'atelier, qui connaît les contraintes non écrites.
- Sous quelques personnes par poste, une planification nominative peut exposer une personne : travailler par poste ou équipe, sauf besoin explicite.

## Exemple

Atelier de 12 personnes, horizon de 2 semaines. Poste « découpe » : 2 machines, 1 équipe de 8 heures, 5 jours par semaine, soit 80 heures nominales par semaine. Arrêt de maintenance planifié de 8 heures en semaine 2. Taux de rendement retenu : 75 % (hypothèse tirée de l'historique de l'atelier, à confirmer).

Capacité disponible : semaine 1 = 80 x 0,75 = 60 heures ; semaine 2 = (80 - 8) x 0,75 = 54 heures.
Charge : commandes A, B, C = 48, 14 et 12 heures, toutes passant par la découpe. Semaine 1 : A + B = 62 heures, soit 103 % ; semaine 2 : C = 12 heures, soit 22 %. Goulot en semaine 1. Scénario 1 : décaler B en semaine 2 (charge 26 heures, 48 %), A livrée à temps, B livrée 5 jours plus tard que la date promise. Scénario 2 : maintenir B en semaine 1 avec 4 heures supplémentaires. Les deux touchent un client ou du personnel : carte de décision à l'humain, aucune date communiquée avant sa réponse.

Cas d'échec : la gamme de la commande D ne donne pas la durée de réglage et l'atelier ne la connaît pas. Le plan ne place pas D sur une date ferme : il écrit « durée de réglage : information manquante », propose une fourchette marquée hypothèse à confirmer par le chef d'atelier, et signale que toute date promise à partir de cette fourchette est un risque.

## Origine de la méthode

Version 1.1.0 : repérage causal du goulot, tambour, tampon et corde avec zones du tampon, règles de priorité, réponse aux perturbations avec gel et stabilisation, cohérence avec le progiciel, adaptés et traduits de github.com/affaan-m/ECC, `skills/production-scheduling/SKILL.md`, « Bottleneck Management », « Disruption Response », « Job Priority Sequencing », « Disruption Re-Sequencing », « Bottleneck Identification » et « ERP/MES Interaction Patterns », commit ef648e01899ba3e8dc6371642deaaf64b4477775, compétence sous licence Apache 2.0 (en-tête `license: Apache-2.0`, auteur « evos »). Modifications : réécriture en français, décision humaine, repères marqués à fixer par la direction. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
