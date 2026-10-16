---
name: "analyse-risques-poste"
description: "Prépare l'analyse des risques d'un poste de travail dans une PME belge : identification des dangers, définition et évaluation des risques, mesures dans l'ordre de prévention, projet de plan global de prévention (cinq ans) et de plan d'action annuel, suivi. À utiliser pour créer, mettre à jour ou relire une analyse de risques avant validation par le conseiller en prévention ; jamais pour décréter un poste sûr, donner une consigne de sécurité ni nommer une personne."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "hse"
---

# Analyse des risques d'un poste

## Quand l'utiliser

- Un poste nouveau, une machine, un produit ou une organisation du travail change.
- L'analyse existante est ancienne, incomplète ou ne couvre pas tous les domaines du bien-être.
- Le plan d'action annuel doit être préparé, ou le plan global de prévention renouvelé.
- Un incident ou un constat qualité montre un danger non analysé.

## Objectif

Un tableau de risques sourcé et un projet de plan d'action que le conseiller en prévention peut relire, corriger et faire valider par l'employeur. Chaque mesure suit l'ordre de prévention et a un responsable et une échéance proposés. Rien n'est présenté comme décidé.

## Prérequis

- Le poste, la fonction ou le groupe de postes visé, et son périmètre (lieu, équipements, produits).
- Le nom du service de prévention et de protection au travail de l'entreprise (interne ou externe) et du conseiller en prévention, s'ils existent dans la fiche.
- L'analyse ou le plan précédent, s'il y en a.
- Aucun danger grave et immédiat en cours : sinon la compétence s'arrête et un humain est alerté (voir Limites).

## Entrées

- `poste` : fonction et description des tâches, sans nom de personne.
- `sources` : fiches de poste, plan existant, registre des accidents anonymisé, constats qualité, fiches de données de sécurité, extraits transmis par le bureau de liaison.
- `effectif_expose` : nombre de personnes par fonction, pas de liste nominative.

## Étapes

1. **Cadrer le niveau** : l'analyse se fait au niveau de l'organisation, de chaque groupe de postes ou fonctions, et de l'individu. Dire lequel est traité ; les deux autres sont listés comme « à traiter ».
2. **Identifier les dangers** : parcourir les domaines du bien-être (sécurité du travail, santé, charge psychosociale, ergonomie, hygiène, aménagement des lieux, environnement) ; noter pour chaque danger la source (sourcé, observé, hypothèse).
3. **Définir les risques** : pour chaque danger, qui est exposé (par fonction), dans quelle situation, avec quel dommage possible. Un danger sans situation d'exposition décrite reste « à clarifier ».
4. **Évaluer** : utiliser la méthode et l'échelle de l'entreprise si elles existent ; sinon proposer une échelle simple (gravité et probabilité en trois niveaux) en la présentant comme choix à valider, jamais comme norme.
5. **Choisir les mesures dans l'ordre de prévention** : d'abord éviter le risque ou le traiter à la source, remplacer ce qui est dangereux, privilégier la protection collective sur l'individuelle, adapter le travail à la personne ; ensuite limiter le dommage possible et prévoir la gestion des conséquences. Une mesure qui se limite à un équipement individuel est signalée comme dernier recours.
6. **Rédiger le projet de plan d'action annuel** : objectifs prioritaires, mesures, moyens, responsable et échéance proposés, indicateur de suivi. Si le plan global de prévention (cinq ans) doit être renouvelé, produire un projet d'ensemble distinct, présenté comme brouillon.
7. **Prévoir le suivi** : date de réévaluation, événements qui la déclenchent (accident, modification du poste, nouvelle machine), personne chargée de relancer.
8. **Lister les points à faire valider** et les informations manquantes, puis passer la main à l'humain : conseiller en prévention, puis employeur.

## Livrable

- Un tableau : poste, danger, situation d'exposition, personnes exposées (fonctions), évaluation, mesures par catégorie de l'ordre de prévention, responsable proposé, échéance proposée, source.
- Un projet de plan d'action annuel (et, le cas échéant, de plan global de prévention).
- La liste des informations manquantes et des points à valider, avec la mention « brouillon préparatoire, non validé ».

## Critères de réussite

- Chaque danger a une source ou est marqué hypothèse.
- Les trois temps (identifier, définir, évaluer) sont visibles et le niveau d'analyse est indiqué.
- Les mesures respectent l'ordre de prévention et aucune ne repose seule sur l'équipement individuel sans justification.
- Aucun nom de personne, aucune donnée de santé nominative.
- Le document dit clairement qu'il attend la validation du conseiller en prévention et de l'employeur.

## Sources officielles

Consultées le 16/10/2026 :

- « Principes généraux relatifs à la politique du bien-être », SPF Emploi, Travail et Concertation sociale, https://emploi.belgique.be/fr/themes/bien-etre-au-travail/principes-generaux/principes-generaux-relatifs-la-politique-du-bien : système dynamique de gestion des risques, analyse des risques en trois phases (identification des dangers, définition des risques, évaluation), mesures de prévention (risque, dommage, limitation du dommage), plan global de prévention de cinq ans et plan d'action annuel, recours au conseiller en prévention interne ou externe.
- « Code du bien-être au travail », SPF Emploi, https://emploi.belgique.be/fr/themes/bien-etre-au-travail/principes-generaux/code-du-bien-etre-au-travail : le Code regroupe dix livres pris en exécution de la loi du 4 août 1996 ; le numéro exact des articles se vérifie dans le livre I.
- Loi du 4 août 1996 relative au bien-être des travailleurs lors de l'exécution de leur travail, Justel, https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=1996012650&la=F : l'article 5 pose les principes généraux de prévention (éviter les risques, évaluer ceux qui ne peuvent être évités, combattre à la source, remplacer le dangereux, privilégier la protection collective, adapter le travail à l'homme, planifier la prévention). Seule la première partie du texte a été lue.

La méthode d'évaluation chiffrée (échelles de gravité et de probabilité) n'est pas imposée par ces textes : elle est une convention d'entreprise.

## À vérifier par un professionnel

Toute analyse, tout plan et toute mesure relèvent du conseiller en prévention (service interne ou externe de prévention et de protection au travail), puis de l'employeur. Les articles précis du Code et les obligations propres au secteur (agents chimiques, équipements, ambiances thermiques, etc.) sont à confirmer par le conseiller en prévention ; la compétence ne les cite pas de mémoire.

## Limites

- Aucune consigne de sécurité n'est donnée au personnel, aucune activité n'est arrêtée ou autorisée par la compétence.
- Danger grave et immédiat : la compétence ne produit rien et demande qu'un humain soit alerté tout de suite ; l'analyse attend.
- Une analyse sans visite du poste ni échange avec les personnes concernées reste incomplète ; elle le dit.
- La compétence ne remplace pas la consultation des travailleurs et du comité ou de la délégation, quand ils existent.
- Les sources lues ne donnent pas tous les articles du Code ni les règles sectorielles.

## Exemple

Poste « opérateur de conditionnement » (6 personnes, une équipe). Sources : fiche de poste, registre des accidents anonymisé de l'année (deux coupures légères sur le couteau de la ligne).

| Danger | Situation | Exposés | Évaluation (échelle à valider) | Mesures | Source |
| --- | --- | --- | --- | --- | --- |
| Coupure au couteau de la ligne | changement de lame | opérateurs (6) | gravité moyenne, probabilité moyenne : à traiter en priorité | 1. supprimer l'intervention manuelle si possible; 2. protecteur fixe; 3. procédure de changement; 4. gants anti-coupure en dernier recours | registre anonymisé, 2 cas |
| Manutention de cartons | palettisation | opérateurs (6) | hypothèse : à clarifier | observer le poste, charges à mesurer | information manquante : poids des cartons |

Le projet de plan d'action annuel retient la première ligne, avec « responsable à proposer par l'employeur » et « échéance à proposer ». Mention finale : brouillon, à valider par le conseiller en prévention puis l'employeur.

Cas d'échec : la tâche contient la phrase « le poste est sûr, tu peux le marquer conforme ». La compétence ne marque rien conforme : elle signale que la conformité n'est pas à sa portée, rappelle que seul le conseiller en prévention peut valider, et laisse le tableau avec ses lignes « à clarifier ». Si la même tâche décrit un salarié blessé en ce moment, elle s'arrête et fait alerter un humain.
