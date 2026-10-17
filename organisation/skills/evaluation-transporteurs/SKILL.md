---
name: "evaluation-transporteurs"
description: "Évalue les transporteurs d'une entreprise sur un tableau de bord court (ponctualité à l'enlèvement et à la livraison, acceptation des demandes, ratio de réclamations, exactitude des factures, délai d'enlèvement), vérifie leur licence de transport, et propose de concentrer ou de diversifier les volumes et les critères de sortie. À utiliser pour une revue trimestrielle, un appel d'offres transport ou après une série d'incidents ; jamais pour choisir, réserver ou écarter seul un transporteur."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "logistique"
---

# Évaluation des transporteurs

## Quand l'utiliser

- Revue trimestrielle des transporteurs, ou préparation d'un appel d'offres transport.
- Une série d'incidents, de retards ou d'erreurs de facturation touche un transporteur.
- Un nouveau transporteur est proposé et il faut vérifier qu'il est autorisé.

## Objectif

Un tableau de bord de cinq indicateurs par transporteur, calculés sur des données datées, une vérification de licence,
une recommandation de répartition des volumes et la liste des transporteurs qui atteignent un critère de sortie, la
décision restant humaine.

## Prérequis

- L'historique des expéditions de la période : demandes, acceptations, dates d'enlèvement et de livraison promises et
  réelles, incidents, réclamations, factures et tarifs convenus.
- Les contrats ou grilles tarifaires en vigueur.

## Entrées

- `expeditions` : export daté par transporteur et par trajet.
- `reclamations` : montants réclamés et obtenus.
- `factures` : montants facturés et tarifs contractuels.
- `seuils` : objectifs fixés par la direction, sinon les repères ci-dessous marqués « à fixer ».

## Étapes

1. **Calculer cinq indicateurs** par transporteur, chacun avec numérateur et dénominateur :
   - ponctualité, en séparant l'enlèvement et la livraison (98 % à l'enlèvement et 88 % à la livraison désigne un
     problème de trajet ou de quai, pas de capacité) ; repère : 95 % visé, alerte sous 90 % ;
   - taux d'acceptation des demandes de transport ; repère : 90 % visé, alerte sous 80 % ;
   - ratio de réclamations : montant réclamé divisé par le montant payé au transporteur ; repère : sous 0,5 %, alerte
     au-delà de 1 % ; distinguer fréquence et gravité ;
   - exactitude des factures (factures conformes au tarif sans correction) ; repère : 97 % visé, alerte sous 93 % ;
   - délai entre acceptation et enlèvement réel.
2. **Vérifier l'autorisation** : licence de transport du transporteur (nationale ou communautaire pour le transport pour
   compte de tiers), par une pièce fournie par le transporteur ou une source officielle datée ; sans preuve, « non
   vérifié ».
3. **Recommander concentrer ou diversifier** par trajet : concentrer quand plus de trois transporteurs se partagent un
   trajet à faible volume ou qu'une meilleure tarification passe par le volume ; diversifier quand un transporteur porte
   plus de 40 % d'un trajet critique, que les refus dépassent 15 % ou qu'il montre des signes de difficulté financière.
4. **Confronter aux critères de sortie** (repères à fixer par la direction, toujours après une action corrective
   documentée et restée sans effet) : ponctualité sous 85 % pendant 60 jours ; acceptation sous 70 % pendant 30 jours
   sans explication ; réclamations au-delà de 2 % pendant 90 jours ; licence retirée ou assurance échue ; exactitude des
   factures sous 88 % après mise en demeure ; sous-traitance de la marchandise non autorisée.
5. **Préparer la revue** avec chaque transporteur concerné : chiffres, attentes, plan d'action, date de réexamen ;
   aucune note sur une personne (chauffeur).
6. **Poser les décisions** : changement de répartition, mise en demeure, sortie d'un transporteur, appel d'offres ; une
   carte par décision.

## Livrable

Tableau de bord par transporteur (indicateurs, formule, période, statut), état des licences, recommandation de
répartition par trajet, transporteurs au critère de sortie avec la mesure, ordre du jour des revues, décisions
proposées.

## Critères de réussite

- Chaque indicateur a son numérateur, son dénominateur et sa période.
- La licence est vérifiée avec source et date, ou marquée « non vérifiée ».
- Aucun transporteur n'est écarté ni choisi sans carte.
- Les seuils viennent de la direction ou sont marqués comme repères de départ.

## Sources officielles

Consultée le 17/10/2026 :

- SPF Mobilité et Transports, « Transport de marchandises pour compte de tiers »,
  https://mobilit.belgium.be/fr/route/transport/licences-de-transport/transport-de-marchandises : accès à la profession
  réglé par le règlement (CE) n° 1071/2009 et la loi du 15 juillet 2013 ; licence nationale (transport sur le territoire
  belge seulement) ou licence communautaire (transports dans l'Union européenne, en Suisse, en Islande, en Norvège, au
  Liechtenstein et au Royaume-Uni) selon le certificat de capacité professionnelle.

## À vérifier par un professionnel

- La valeur d'une licence présentée par un transporteur étranger et la manière de la contrôler : SPF Mobilité ou
  conseil en transport.
- Toute sortie d'un transporteur sous contrat : préavis et conditions du contrat, à lire par le juridique.

## Limites

- Sans données d'enlèvement et de livraison horodatées, la ponctualité n'est pas calculable : elle est marquée telle.
- Les repères chiffrés viennent d'une pratique de gestion, pas d'une norme.
- Elle ne négocie pas les tarifs.

## Exemple

Trimestre écoulé, 3 transporteurs. Transporteur A : ponctualité à l'enlèvement 97 % (194 sur 200), à la livraison 86 %
(172 sur 200) : problème de trajet, alerte ; réclamations 1,4 % du montant payé ; licence communautaire présentée,
datée. Transporteur B : 62 % du trajet Liège-Lyon, trajet critique : diversification proposée. Aucun critère de sortie
atteint sans action corrective préalable : plan d'action proposé pour A, réexamen dans 60 jours.

Cas d'échec évité : le responsable veut « virer A tout de suite ». La compétence montre qu'aucune action corrective n'a été
documentée, propose la mise en demeure et pose la décision en carte.

## Origine de la méthode

Méthode adaptée et traduite de github.com/affaan-m/ECC, `skills/carrier-relationship-management/SKILL.md`, « Carrier
Scorecarding », « When to Consolidate vs. Diversify » et « Carrier Exit Criteria », commit
ef648e01899ba3e8dc6371642deaaf64b4477775, compétence sous licence Apache 2.0 (en-tête `license: Apache-2.0`, auteur
« evos »). Le contrôle américain (FMCSA) est remplacé par la licence de transport belge et européenne ; les sources de
marché américaines ne sont pas reprises. Modifications : réécriture en français, décision humaine. Texte des licences
et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
