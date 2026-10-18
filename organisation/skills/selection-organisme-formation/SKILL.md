---
name: "selection-organisme-formation"
description: "Compare des organismes de formation externes pour un besoin donné sur une grille écrite (adéquation au programme, formateur, modalités, reconnaissance pour les dispositifs de financement, références, prix total, conditions d'annulation) à partir de leurs offres et devis, et prépare le dossier de choix et le brouillon de demande de précisions. À utiliser quand plusieurs organismes ou un seul devis doivent être évalués avant une inscription ou une commande ; jamais pour concevoir le module, inscrire ou choisir seule."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "formation"
---

# Sélection d'un organisme de formation

## Quand l'utiliser

- Une formation prévue au plan sera confiée à un organisme externe et plusieurs offres existent.
- Un seul devis a été reçu et il faut savoir s'il tient la comparaison.
- Un organisme déjà utilisé est à réévaluer avant un renouvellement.
- Le financement (congé-éducation, chèques-formation, fonds sectoriel) dépend de la reconnaissance de l'organisme ou de la formation.

## Objectif

Un tableau comparatif à périmètre égal et une recommandation argumentée, avec les critères pondérés par le coordinateur,
chaque donnée sourcée, les questions restées sans réponse et les décisions à poser. Le contenu du cahier des charges vient
de `conception-modules`, les pistes de financement de `financement`, le plan de `plan-formation` ; l'inscription et la
dépense restent humaines.

## Prérequis

- Le besoin validé : objectifs, public (fonctions, effectif), durée, période, budget.
- Les offres, programmes et devis reçus, ou la liste des organismes à étudier fournie par la tâche.
- Les critères et leur pondération fixés par le coordinateur ou la direction.

## Entrées

- `besoin` : fiche de module ou cahier des charges.
- `offres` : programme, formateur annoncé, dates, lieu, modalités, prix, conditions.
- `criteres` : liste pondérée ; à défaut, la grille de départ ci-dessous marquée « à fixer ».
- `financement` : dispositifs visés et exigences de reconnaissance connues.

## Étapes

1. **Normaliser les offres** : même unité de prix (total pour l'effectif prévu, hors et avec TVA), même durée en heures,
   même périmètre (supports, évaluation, attestation, repas, déplacements). Ce qui manque est « information manquante ».
2. **Fixer la grille** : adéquation au programme demandé ; compétence du formateur (profil annoncé, expérience
   vérifiable) ; modalités (présentiel, distanciel, taille du groupe, pratique) ; reconnaissance pour le financement
   visé ; références vérifiables ; prix total ; conditions d'annulation et de report ; délai de réalisation. Repère de
   départ à fixer : adéquation et formateur pèsent plus que le prix.
3. **Vérifier les points de reconnaissance** par la page de l'autorité du dispositif, datée : formation reconnue pour le
   congé-éducation, opérateur agréé pour les chèques-formation, fonds sectoriel. Sans preuve, « non vérifié » ; ne
   jamais écrire qu'un financement est acquis.
4. **Noter chaque offre** par critère, avec la phrase source ; l'écart de plus de deux points entre deux notes est
   justifié par un élément daté.
5. **Contrôler les risques** : dépendance à un seul formateur, durée annoncée inférieure au programme, effectif minimum
   pour maintenir la session, pénalités d'annulation, données personnelles transmises à l'organisme.
6. **Recommander** : l'organisme le mieux noté, l'alternative et la condition qui ferait changer ; si une seule offre,
   dire si elle tient les critères et ce qui manquerait pour comparer.
7. **Rédiger le brouillon de demande de précisions** aux organismes (mêmes questions pour tous, sans citer le prix d'un
   concurrent) pour validation humaine.
8. **Poser les décisions** : écarter, négocier, inscrire, commander ; une carte par décision.

## Livrable

Tableau comparatif (critère, poids, note, source de chaque organisme), prix total harmonisé, statut de reconnaissance par
dispositif avec date de consultation, risques, recommandation argumentée avec alternative, questions aux organismes en
brouillon, cartes de décision, liste des informations manquantes.

## Critères de réussite

- Les offres sont comparées à périmètre égal, avec la même unité de prix.
- Chaque note renvoie à une source datée de l'offre, du site ou de l'autorité.
- Aucune reconnaissance ni aucun financement n'est présenté comme acquis sans preuve datée.
- Aucun prix d'un organisme n'apparaît dans un message adressé à un autre.
- Aucune évaluation d'une personne nommée (formateur ou participant) au-delà de son profil public annoncé.

## Sources officielles

Reprises des compétences `financement-formation` et `plan-formation` du dépôt (pages consultées par elles le 16/10/2026),
non relues le 18/10/2026 :

- « Reconnaissance des formations dans le cadre du congé-éducation payé », SPF Emploi,
  https://emploi.belgique.be/fr/themes/formation/reconnaissance-des-formations-dans-le-cadre-du-conge-education-paye :
  compétence des Régions depuis le 1er juillet 2014, reconnaissance des formations par les commissions paritaires.
- « Former ses travailleurs grâce aux chèques-formation », Wallonie.be,
  https://wallonie.be/fr/demarches/former-ses-travailleurs-grace-aux-cheques-formation : opérateurs agréés, gestion par
  le Forem.
- « Droit individuel à la formation », SPF Emploi, https://emploi.belgique.be/fr/themes/formation/droit-individuel-la-formation :
  loi du 3 octobre 2022, rôle des secteurs et des fonds de formation.

## À vérifier par un professionnel

L'éligibilité d'une formation à un dispositif, le traitement TVA d'une facture de formation, le contrat avec l'organisme
et la sous-traitance de données personnelles (RGPD art. 28) sont à faire valider par le secrétariat social, le comptable
ou le juridique avant toute inscription.

## Limites

- Elle n'évalue pas la qualité pédagogique réelle sans retour de participants ou observation, que l'humain apporte.
- Elle ne contacte aucun organisme et ne conclut aucune réservation ni aucun contrat.
- Les repères de pondération sont des points de départ à fixer par le coordinateur.

## Exemple

Besoin : formation de 14 heures à la prévention du blanchiment pour 8 collaborateurs. Trois offres : A à 2 400 euros HTVA
tout compris, B à 1 900 euros hors supports et attestation, C sans prix publié. Étape 1 : B ramenée à 2 250 euros avec
supports et attestation estimés (étiquetés « estimation »). Étape 3 : reconnaissance pour le congé-éducation de A
vérifiée sur la page de la Région (datée), B et C « non vérifié ». Recommandation : A, alternative B si le coordinateur
accepte d'ajouter des supports ; C demande ses prix. Carte de décision : inscription (humaine).

Cas d'échec évité : un organisme promet « financement garanti à 100 % ». La compétence le note comme affirmation non
vérifiée et renvoie à `financement`.
