---
name: "comparaison-offres-fournisseurs"
description: "Compare les offres reçues de plusieurs fournisseurs pour un achat de PME belge sur une grille explicite : coût total de possession, délais, niveau de service (SLA), solvabilité à partir des données publiques (BCE, comptes annuels déposés à la Banque nationale), références ; détecte les offres anormalement basses ou incomplètes et rédige une recommandation motivée, la décision restant humaine. À utiliser dès que deux offres ou plus répondent à une même demande ; jamais pour extrapoler un prix absent, divulguer les prix d'un fournisseur à un autre, contacter un fournisseur ou choisir à la place de l'humain."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "achats"
---

# Comparaison d'offres de fournisseurs

## Quand l'utiliser

- Plusieurs fournisseurs ont répondu à une demande de prix (voir `cahier-des-charges-achat`) et il faut éclairer le choix.
- Un renouvellement de contrat est proposé et l'on veut le comparer à deux alternatives.
- Une offre paraît étonnamment bonne ou étonnamment chère et l'on veut savoir pourquoi.

## Objectif

Un tableau où chaque ligne renvoie à la page ou à la clause de l'offre, des totaux calculés sur la même durée, une note par critère selon la pondération du demandeur, une liste des écarts et des risques, et une recommandation motivée qui assume ses limites. Une information absente est signalée, jamais remplie.

## Prérequis

- Le cahier des charges ou, à défaut, la liste des critères et leurs poids donnés par le demandeur. La compétence n'invente pas de pondération : sans critères, elle demande au demandeur de les fixer.
- Au moins deux offres écrites, datées, avec leur durée de validité. Une offre orale ne se compare pas.
- La durée d'analyse retenue (souvent 3 ou 5 ans) et le périmètre (options incluses ou non).

## Entrées

- `offres` : documents de chaque fournisseur, avec leur date de réception.
- `criteres` : critères, poids, exigences obligatoires (E1, E2...).
- `donnees_publiques` : numéro d'entreprise du fournisseur, comptes annuels publics récupérés par l'humain ou le bureau de liaison.

## Étapes

1. **Contrôle de conformité** : pour chaque offre, cocher les exigences obligatoires (oui, non, information manquante, avec la page). Une offre qui manque une exigence obligatoire est écartée du classement, mais gardée dans le tableau avec la raison.
2. **Normaliser les offres** : même durée, même périmètre, même devise, hors TVA pour tous (les entreprises assujetties la récupèrent généralement ; sinon le dire). Les options non demandées sont retirées du total et listées à part.
3. **Calculer le coût total de possession** (CTP) sur la durée retenue :
   CTP = achat ou mise en service + abonnements ou licences x durée + maintenance + formation + migration et intégration + consommables + coût de sortie (reprise des données, démontage) + indexation prévue.
   Chaque terme est sourcé ; un terme absent est écrit « information manquante » et une fourchette n'est donnée que si le fournisseur l'a donnée. Les valeurs de départ et d'arrivée restent visibles.
4. **Comparer les délais et les engagements de service** : délai de livraison ou de mise en service (engagement écrit ou simple estimation), niveau de service (temps de réponse, temps de rétablissement, disponibilité en pourcentage et sa traduction en heures par mois), pénalités et plafonds, garantie, conditions de reconduction et de sortie.
5. **Évaluer la solidité du fournisseur** avec des données publiques seulement :
   - identité : numéro d'entreprise, forme juridique, statut actif, adresse, activité, date de début, consultables à la Banque-Carrefour des Entreprises ;
   - comptes annuels déposés à la Banque nationale (Centrale des bilans) : chiffre d'affaires ou marge brute selon le schéma, fonds propres, résultat, évolution sur 3 exercices, date du dernier dépôt ;
   - signaux d'alerte : comptes non déposés dans les délais, fonds propres négatifs, perte répétée, changement récent de dénomination ou de dirigeants, société très récente pour un contrat long.
   Ne tirer aucune conclusion sur une personne physique ; ne jamais écrire « en difficulté » sur la base d'un seul signal.
6. **Évaluer les risques de chaque offre** sur une grille fixe, chaque ligne notée faible, moyen ou élevé avec sa
   pièce : solidité financière (étape 5) ; sécurité et conformité (certifications annoncées, sous-traitant au sens de
   l'article 28 du RGPD si des données personnelles sont traitées, lieu d'hébergement) ; dépendance à un seul
   fournisseur (part des dépenses ou des fonctions critiques qui reposerait sur lui) ; verrouillage contractuel
   (durée ferme, reconduction tacite, préavis, format et coût de récupération des données, réversibilité) ; continuité
   (plan de reprise annoncé, engagement en cas de défaillance). Un coût de sortie absent de l'offre est une question
   au fournisseur, jamais un zéro.
7. **Vérifier les références** : au moins deux clients comparables, contactables, par l'humain ; la compétence prépare les questions (délai tenu, incidents, qualité du support, coûts imprévus), n'appelle personne.
8. **Détecter les offres anormalement basses ou incomplètes** : une offre est suspecte quand elle est nettement inférieure aux autres (repère de départ : plus de 25 % sous la médiane des autres offres, ou sous 70 % de l'estimation du demandeur), quand un poste obligatoire manque (maintenance, formation, migration), quand le périmètre est plus étroit, ou quand le prix de la première année est cassé avec forte hausse ensuite. Réponse : ne pas écarter automatiquement, faire poser par l'humain une question écrite demandant d'expliquer la composition du prix (méthode de production ou de service, conditions exceptionnelles, respect des obligations sociales et fiscales), puis juger l'explication. Une offre sans explication satisfaisante n'est pas recommandée.
9. **Noter** chaque critère selon la méthode et les pondérations écrites avant d'ouvrir les offres (celles du demandeur), calculer le total sur 100, puis faire un test de sensibilité : le classement change-t-il si le poids du prix passe de 40 à 30 ou à 50 ? Si oui, l'écrire.
10. **Rédiger la recommandation** : offre proposée, pourquoi en trois phrases, ce qu'elle coûte réellement sur la durée, risques résiduels (dépendance, reconduction tacite, indexation, sortie), rubrique « points de négociation » (chaque point avec l'écart constaté et ce qu'on demande : plafond d'indexation, coût de sortie, pénalités de service, durée ferme), offre de repli, et questions encore ouvertes pour chaque fournisseur. La décision, la négociation et la signature restent humaines.

## Livrable

1. Le tableau de conformité aux exigences obligatoires.
2. La grille comparative (CTP, délais, SLA, solidité, références) avec renvoi à la page ou à la clause.
3. Le classement noté et son test de sensibilité.
4. La grille de risques par offre.
5. La note de recommandation d'une page : choix proposé, risques, points de négociation, questions au fournisseur.
6. La liste des informations absentes et des vérifications confiées à l'humain.

## Critères de réussite

- Toutes les offres sont ramenées à la même durée, au même périmètre et à la même unité (hors TVA).
- Chaque valeur renvoie à une page ou une clause ; aucune valeur inventée ou arrondie en silence.
- Les offres écartées le sont pour une raison écrite et vérifiable.
- Toute offre anormalement basse a déclenché une question écrite, pas un rejet d'office ni une acceptation.
- Aucun prix d'un fournisseur n'apparaît dans une question adressée à un autre.
- La recommandation dit ce qui pourrait la faire changer.
- Les pondérations sont écrites avant la notation ; le coût de sortie de chaque offre est chiffré ou demandé.
- Chaque offre a sa grille de risques complète (cinq lignes).

## Sources officielles

Consultées le 16/10/2026 :

- « Centrale des bilans », Banque nationale de Belgique, https://www.nbb.be/fr/centrale-des-bilans : service qui collecte les comptes annuels de la quasi-totalité des sociétés et organisations du pays, avec une plateforme « Consulter » pour accéder aux données déposées. Source des signaux de solidité.
- Directive 2014/24/UE du Parlement européen et du Conseil du 26 février 2014 sur la passation des marchés publics, EUR-Lex, https://eur-lex.europa.eu/eli/dir/2014/24/oj/fra : en marchés publics, une offre qui paraît anormalement basse n'est pas rejetée d'office, le soumissionnaire est invité à expliquer son prix et l'offre n'est écartée que si l'explication n'est pas satisfaisante. Le texte ne s'impose pas à une entreprise privée ; il sert de méthode (seul l'esprit de l'article 69 est repris ici, le corps de l'article n'a pas pu être relu en entier lors de la consultation).
- Loi du 2 août 2002 concernant la lutte contre le retard de paiement dans les transactions commerciales, Justel, https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=2002009716&la=F : délai de paiement de 30 jours par défaut et 60 jours au maximum par contrat, intérêt de retard au taux directeur plus 8 points, indemnité de 40 euros ; une clause qui exclut ces droits est nulle. À comparer aux conditions de paiement offertes.
- « L'e-facturation à la portée de tous », SPF BOSA, https://efacture.belgium.be : facture électronique structurée obligatoire entre entreprises belges assujetties à la TVA depuis le 1er janvier 2026 ; le fournisseur doit pouvoir la produire.

La Banque-Carrefour des Entreprises (recherche publique du SPF Économie) n'a pas pu être consultée : la page s'est ouverte sur un test anti-robot, elle n'est donc pas citée. Les données d'identité sont à récupérer par un humain sur le site officiel.
Les seuils de 25 % sous la médiane et de 70 % de l'estimation, et les signaux d'alerte financière, sont des repères de pratique, pas des règles légales.

## À vérifier par un professionnel

- Lecture des comptes annuels et appréciation de la solvabilité d'un fournisseur pour un contrat long ou un montant important : expert-comptable ou réviseur d'entreprises.
- Conditions contractuelles de l'offre retenue (responsabilité, pénalités, reconduction, traitement de données) : avocat ou juriste d'entreprise, voir `contrat-fournisseur`.
- Achat public ou subventionné : la procédure et le traitement des offres anormalement basses sont encadrés par la loi sur les marchés publics ; juriste en marchés publics.

## Limites

- La compétence compare ce qui est écrit. Elle ne sait pas si une promesse sera tenue.
- Les comptes annuels sont publics mais en retard d'un à deux ans, et les petites sociétés déposent des schémas abrégés : peu de postes lisibles.
- Une recommandation fondée sur un total sur 100 reste sensible aux poids : le test de sensibilité est obligatoire.
- Elle ne contacte aucun fournisseur, ne négocie pas, ne commande pas, ne signe pas.
- Un coût de sortie non chiffré dans l'offre reste une inconnue, pas zéro.

## Exemple

Besoin : logiciel de planning, 3 ans, 25 utilisateurs. Trois offres reçues, chiffrées hors TVA.

| | Fournisseur A | Fournisseur B | Fournisseur C |
| --- | --- | --- | --- |
| Abonnement annuel | 5 400 | 6 000 | 2 700 |
| Mise en service (unique) | 1 200 | 900 | information manquante |
| Formation | incluse (p. 4) | 600 (p. 5) | information manquante |
| Indexation prévue | 3 % par an (art. 7) | indice santé (art. 6) | information manquante |
| Export des données à la sortie | gratuit (art. 12) | 800 (art. 11) | information manquante |

CTP sur 3 ans pour A : 1 200 + 5 400 x 3 + indexation (3 % sur années 2 et 3, soit 162 + 329 = 491 euros) = 17 891 euros. Pour B : 900 + 600 + 6 000 x 3 + 800 = 20 300 euros, hors indexation non chiffrée. C : total impossible à établir.

Offre C : 2 700 par an, c'est environ 53 % sous la médiane des deux autres (5 700). Offre anormalement basse présumée. Action : question écrite à C (« le prix inclut-il la mise en service, la formation, le support, l'export des données ? Quelles hypothèses de volume ? »). Le prix de A et de B n'est pas mentionné dans la question.

Cas d'échec : l'humain demande de ne retenir que l'offre C « parce que c'est la moins chère » et que la compétence « fasse le total ». Elle refuse de publier un classement : trois postes sont manquants, un total ne serait pas comparable. Elle livre le tableau avec les « informations manquantes », la question à C, et précise qu'aucune recommandation n'est possible tant que C n'a pas répondu.

## Origine de la méthode

Grille de risques (solidité, sécurité et conformité, dépendance, verrouillage, continuité), coût de sortie dans le coût
total et rubrique de points de négociation adaptés et traduits de github.com/anthropics/knowledge-work-plugins,
`operations/skills/vendor-review/SKILL.md` (« Evaluation Framework »), commit 33eeda1e8fd856455b05479d13a0f85b5f803744,
licence Apache 2.0. Modifications : traduction, sources publiques belges, validation humaine. Licence et reprises :
`organisation/skills/LICENCES-TIERS.md`.
