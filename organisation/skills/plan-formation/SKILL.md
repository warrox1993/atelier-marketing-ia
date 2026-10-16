---
name: "plan-formation"
description: "Prépare le plan de formation annuel d'une PME belge : analyse des besoins, priorités, budget, calendrier, suivi du droit individuel à la formation (jours par travailleur, compte-formation individuel) et du réalisé. À utiliser pour bâtir ou mettre à jour un plan de formation à faire valider par la direction ; jamais pour inscrire quelqu'un, engager une dépense, affirmer qu'une obligation légale est remplie sans vérification, ni publier des données nominatives de santé ou d'évaluation."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "formation"
---

# Plan de formation d'une PME belge

## Quand l'utiliser

- La direction ou les ressources humaines veulent un plan de formation pour l'année à venir.
- L'entreprise doit vérifier où elle en est du droit individuel à la formation (jours par travailleur).
- Les demandes de formation arrivent en vrac et il faut les classer, les chiffrer et les caler dans l'année.

## Objectif

Un plan lisible : chaque formation prévue répond à un besoin écrit, a un public, un coût estimé, une période, une source de financement possible et un indicateur de suivi. Le plan montre aussi, en agrégat, le nombre de jours prévus par rapport au droit applicable. Il reste un projet tant que la direction ne l'a pas validé.

## Prérequis

- La taille de l'entreprise (nombre de travailleurs, en personnes) et la commission paritaire dont elle relève : le régime du droit individuel dépend de l'effectif et du secteur.
- Le budget disponible, communiqué par la direction (par le bureau de liaison depuis la comptabilité), ou la mention « budget non communiqué ».
- Les besoins de compétences transmis par les ressources humaines, sous forme de postes ou de fonctions, pas de noms.

## Entrées

- `besoins` : compétences manquantes ou à renforcer, avec leur origine (obligation légale, projet de l'entreprise, évolution du poste, demande de l'équipe).
- `effectif` : nombre de travailleurs, répartition temps plein et temps partiel, en agrégat.
- `budget` : enveloppe annuelle ou « non communiquée ».
- `catalogue` : formations connues de l'entreprise, avec prix et durée donnés par les organismes.
- `realise` : jours de formation déjà suivis dans l'année, en agrégat.

## Étapes

1. **Cadrer le droit applicable.** Relever l'effectif et la commission paritaire. Repères officiels (à confirmer, voir sources) : le droit individuel à la formation est de 5 jours par an pour un travailleur à temps plein depuis 2024 (4 jours en 2023), apprécié en moyenne sur une période, avec report du solde non utilisé à l'année suivante ; sous 10 travailleurs, la loi ne s'applique pas ; de 10 à 19 travailleurs, un régime dérogatoire s'applique ; il se concrétise par une convention collective sectorielle ou, à défaut, par un compte-formation individuel dans l'entreprise. Si le secteur a sa propre convention, c'est elle qui prime sur ces repères. Écrire le régime retenu et la raison, ou « régime à confirmer ».
2. **Calculer les jours dus par travailleur** avec la formule de l'administration : jours à temps plein x taux d'occupation x (mois d'occupation / 12), tout mois commencé comptant pour un mois. Le calcul se fait en agrégat (nombre de personnes par tranche), jamais en tableau nominatif dans le plan.
3. **Recenser les besoins** et les ramener à des besoins de compétences : qui (fonction), quoi, pourquoi, avec quelle échéance. Un besoin sans motif écrit est renvoyé à son demandeur.
4. **Classer les priorités** selon quatre critères notés par la direction : obligation (sécurité, réglementation du métier), impact sur l'activité, urgence, nombre de personnes concernées. Les obligations légales de formation (par exemple en sécurité) passent en premier.
5. **Choisir le format** pour chaque besoin : interne, organisme externe, formation en ligne, accompagnement sur le poste. Une formation informelle liée au travail peut compter pour le droit individuel (source officielle) : le noter, sans l'affirmer pour un cas précis.
6. **Chiffrer** : coût de l'organisme (source : devis ou catalogue), coût du temps de travail, déplacements. Un coût absent est écrit « à demander à l'organisme », pas estimé de mémoire. Appliquer, si elle existe, l'aide possible décrite par la compétence `financement-formation`, sans la déduire tant qu'elle n'est pas confirmée.
7. **Caler le calendrier** en tenant compte des pics d'activité, des congés et des échéances (délais de demande de congé-éducation ou de remboursement, voir `financement-formation`).
8. **Définir le suivi** : indicateurs (jours réalisés par rapport aux jours prévus, budget consommé, taux de satisfaction, mise en pratique constatée après trois mois) et responsable humain du suivi.
9. **Comparer le total au budget** et au droit : proposer ce qu'on reporte si l'enveloppe est dépassée, sans trancher.
10. **Préparer la validation** : le plan est livré comme projet, avec la carte de décision humaine pour la validation du plan et, pour toute dépense, une décision séparée.

## Livrable

Un plan de formation en tableau : besoin, public (fonction et effectif), format, organisme et source du prix, coût estimé, période, financement possible, indicateur. Une page de synthèse : jours prévus par rapport au droit, budget par rapport à l'enveloppe, risques, points ouverts, décisions attendues. Une table des faits avec la source de chaque chiffre.

## Critères de réussite

- Chaque ligne du plan a un besoin écrit et un indicateur.
- Aucun nom, aucune évaluation individuelle dans le plan : fonctions et effectifs seulement.
- Le régime du droit individuel est justifié par l'effectif et le secteur, ou marqué à confirmer.
- Aucun prix ni aide inventés ; chaque chiffre a une source ou la mention « information manquante ».
- Aucune inscription ni dépense n'est présentée comme faite : tout reste une proposition à valider.

## Sources officielles

Consultées le 16/10/2026 :

- « Droit individuel à la formation », SPF Emploi, Travail et Concertation sociale, https://emploi.belgique.be/fr/themes/formation/droit-individuel-la-formation : loi du 3 octobre 2022, 4 jours en 2023 et 5 jours à partir de 2024 pour un travailleur à temps plein, formation formelle et informelle liée à l'activité, rôle des conventions sectorielles et des fonds de formation.
- « Droit individuel à la formation : information pour les professionnels », SPF Emploi, https://emploi.belgique.be/fr/themes/formation/droit-individuel-la-formation/droit-individuel-la-formation-information-pour-les-0 : moyenne de 5 jours, exclusion sous 10 travailleurs, régime dérogatoire de 10 à 19 travailleurs, convention sectorielle ou plan de formation d'entreprise, report du solde non épuisé, disparition du Federal Learning Account au 1er janvier 2026 avec fin de l'obligation d'enregistrement qui s'y rattachait.
- « Droit individuel à la formation : FAQ », SPF Emploi, https://emploi.belgique.be/fr/themes/formation/droit-individuel-la-formation/droit-individuel-la-formation-faq : première période de calcul du 1er janvier 2024 au 31 décembre 2028 avec remise à zéro du solde ensuite, formule de calcul pour les temps partiels et les occupations partielles, apprentis en alternance exclus, pas de sanction propre à l'employeur à ce jour (sauf violation d'une convention sectorielle rendue obligatoire).

Le texte de la loi du 3 octobre 2022 sur Justel n'a pas pu être consulté en ligne : les repères ci-dessus viennent des pages du SPF Emploi (source administrative, pas le texte de loi).

## À vérifier par un professionnel

Le régime applicable (effectif, commission paritaire, convention sectorielle en vigueur), le nombre de jours dus et les obligations d'enregistrement ou de dépôt de convention sont à faire confirmer par le secrétariat social ou un conseiller en droit social avant de communiquer au personnel ou aux représentants des travailleurs. Les règles de consultation du conseil d'entreprise ou de la délégation syndicale sur le plan de formation, si l'entreprise en a un, sont à vérifier avec eux.

## Limites

- Le plan ne dit pas si l'entreprise respecte la loi : il prépare le calcul ; la conformité se confirme par un professionnel.
- Les repères sont ceux du 16/10/2026 ; une convention sectorielle peut fixer plus.
- Sous 10 travailleurs, les agrégats par fonction peuvent identifier une personne : ne pas les diffuser sans accord humain.
- Aucune inscription, aucun bon de commande, aucun engagement : ils relèvent d'une décision humaine.

## Exemple

Entreprise de 14 travailleurs (12 temps plein, 2 mi-temps), commission paritaire connue, budget annuel de 9 000 euros communiqué par la direction. Besoins transmis par les ressources humaines : sécurité des chariots élévateurs (4 personnes, obligation), logiciel de gestion (6 personnes), accueil client (3 personnes).

Régime : de 10 à 19 travailleurs, régime dérogatoire à confirmer avec le secrétariat social. Jours à temps plein : 5 ; mi-temps : 5 x 0,5 = 2,5 jours chacun, soit 12 x 5 + 2 x 2,5 = 65 jours de droit annuel de référence, à confirmer (hypothèse : tous présents toute l'année). Priorité 1 : chariots (obligation). Coût : devis de l'organisme joint pour les chariots ; logiciel et accueil : « à demander ». Total confirmé 2 400 euros sur 9 000 ; reste à chiffrer. Cartes posées : validation du plan, puis une carte par dépense.

Cas d'échec : la direction écrit « inscris Paul à la formation de management ». Le plan ne l'inscrit pas et ne traite pas un nom propre comme un besoin : il demande la fonction visée et le motif, signale qu'aucune inscription n'est possible sans décision humaine, et pose la carte de dépense. Si de plus aucun budget n'est communiqué, le tableau écrit « budget non communiqué » et ne conclut pas sur la faisabilité.
