---
name: "suivi-energie-batiment"
description: "Suit la consommation d'énergie des bâtiments d'une PME belge : relevés de compteurs, consommation par mètre carré, comparaison dans le temps, échéances des contrats d'énergie, repérage des dérives, rappel du certificat PEB, des audits énergétiques et des primes régionales avec renvoi à l'administration régionale. À utiliser pour un bilan mensuel ou annuel, une dérive de facture ou la préparation d'un renouvellement de contrat ; jamais pour signer un contrat d'énergie, engager des travaux ni garantir l'obtention d'une prime."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "services-generaux"
---

# Suivi de l'énergie d'un bâtiment

## Quand l'utiliser

- La direction veut savoir ce que coûtent et consomment les bâtiments, site par site.
- La facture d'énergie dérive et il faut dire si c'est la consommation, le prix ou la période.
- Un contrat d'électricité, de gaz ou de mazout arrive à échéance et il faut préparer la comparaison.
- Un audit énergétique, un certificat PEB ou une prime sont envisagés et il faut cadrer la demande.

## Objectif

Un tableau de suivi par bâtiment et par type d'énergie, où chaque chiffre a son relevé ou sa facture, sa période et son unité, accompagné d'un indicateur par mètre carré, d'une comparaison avec la période précédente et d'une liste d'échéances de contrat. Les pistes d'économie sont proposées comme hypothèses chiffrées ; les primes sont indiquées comme pistes à vérifier auprès de l'administration régionale, jamais comme droits acquis.

## Prérequis

- La liste des bâtiments avec adresse, région, surface utile (en mètres carrés) et usage ; une surface inconnue est « information manquante ».
- Les compteurs : numéro d'identification, type d'énergie, bâtiment desservi (le numéro de compteur n'est cité que dans le document de la tâche).
- Les relevés ou factures d'au moins douze mois pour une comparaison annuelle.
- Les contrats d'énergie en cours : fournisseur, type de prix (fixe ou variable), date de fin, préavis.

## Entrées

- `batiments` : registre des bâtiments (surface, usage, région).
- `releves` : index de compteurs ou factures avec dates et unités (kWh, m3, litres).
- `contrats` : contrats d'énergie et leurs échéances.
- `periode` : par exemple `2026` ou `T3 2026`.
- `cibles` : objectifs de la direction s'il y en a ; sinon aucun objectif n'est inventé.

## Étapes

1. **Contrôler les données** : unités, périodes couvertes, trous dans la série, estimations du fournisseur contre relevés réels. Une facture estimée est marquée comme telle.
2. **Convertir dans une unité commune** (kWh) en écrivant le coefficient utilisé et sa source. Sans coefficient sourcé, garder l'unité d'origine et ne pas additionner des énergies différentes.
3. **Calculer** par bâtiment et par énergie : consommation de la période, consommation par mètre carré de surface utile, coût total hors TVA, coût moyen par kWh. Garder les valeurs de départ visibles.
3 bis. **Décomposer chaque facture** en ses composantes, sans les fondre en un « prix du kWh » : énergie (seule composante ouverte à la concurrence, prix fixe ou variable selon le contrat, à comparer au prix du contrat et à son indexation) ; coûts de réseau (transport et distribution, régulés) ; redevances et surcharges (cotisation sur l'énergie, accises, obligations de service public, certificats verts et cogénération, surcharges régionales) ; puissance ou pointe quand la facture la mesure. Vérifier que la somme des composantes égale le total hors TVA à l'euro près ; un écart est signalé, pas corrigé. Les régulateurs compétents sont la CREG (fédéral) et, selon la Région du bâtiment, la CWaPE, Brugel ou la VREG.
4. **Comparer** à la période précédente et à la même période de l'année précédente. Séparer, quand les données le permettent, l'effet volume (consommation) de l'effet prix (tarif). Une rupture (nouveau bâtiment, changement de surface, fermeture) est notée en toutes lettres.
5. **Repérer les dérives** : consommation hors heures d'activité, hausse sans cause connue, facture très supérieure à la tendance, relevé identique plusieurs mois de suite (compteur bloqué ou estimation). Chaque dérive devient une question précise.
6. **Suivre les contrats** : date de fin, préavis, reconduction tacite, indexation. Avant un renouvellement, poser les questions de stratégie d'achat pour la direction : quelle variation du budget énergie l'entreprise supporte-t-elle sans difficulté (faible tolérance : prix fixe ; tolérance plus large : variable ou mixte) ? Où se situent les prix à terme dans leur fourchette récente (bas : fixer une plus grande part ; hauts : garder du variable ; incertain : acheter par tranches) ? Quelle durée (un an : l'écart fixe ou variable compte peu ; trois ans ou plus : la prime du fixe s'accumule) ? Le profil de consommation est-il régulier ? Le choix revient à l'humain. Calculer la date limite pour agir (fin moins préavis) et déclencher une demande de comparaison d'offres au service achats par le bureau de liaison, avec la consommation annuelle comme seule donnée transmise.
7. **Rappeler le cadre réglementaire sans l'interpréter** : certificat de performance énergétique (PEB), audits, primes régionales. Indiquer l'administration régionale compétente selon la région du bâtiment et les rubriques à consulter, puis laisser la qualification au conseiller ou à l'administration.
8. **Proposer des pistes** (réglage, éclairage, isolation, régulation) comme hypothèses avec l'économie attendue chiffrée uniquement si les données le permettent ; tout engagement de travaux ou de dépense passe par une carte de décision humaine.

## Livrable

- Tableau de suivi : bâtiment, énergie, période, consommation, kWh par m², coût, variation.
- Liste des dérives avec la question à poser pour chacune.
- Calendrier des contrats d'énergie : date de fin, préavis, date limite d'action.
- Fiche réglementaire courte par bâtiment : PEB, audit éventuel, primes à vérifier, administration à contacter.
- Table des faits et liste des informations manquantes.

## Critères de réussite

- Chaque valeur renvoie à un relevé ou une facture identifiés (date, unité).
- La somme des composantes de chaque facture égale son total hors TVA à l'euro près, ou l'écart est signalé.
- Aucune conversion sans coefficient écrit ; aucune moyenne sur une série trouée.
- Les indicateurs par mètre carré utilisent la surface du registre, citée.
- Les échéances de contrat portent une date limite calculée et le responsable humain.
- Les primes et obligations sont présentées comme « à vérifier auprès de l'administration régionale », avec la rubrique consultable.
- Aucun contrat n'est signé, aucune dépense engagée, aucun fournisseur contacté par la compétence.

## Sources officielles

Consultées le 16/10/2026 (pages d'accueil lisibles ; les pages de détail n'ont pas toutes pu être ouvertes) :

- Service public de Wallonie Énergie, https://energie.wallonie.be/ : rubriques sur la performance énergétique des bâtiments (PEB) pour bâtiments résidentiels et non résidentiels, et programmes d'audit et d'aides pour les entreprises (intitulés relevés : AMUREBA, OWAT, UREBA). Les conditions, montants et dates d'ouverture n'ont pas été lus : à consulter sur le site.
- Bruxelles Environnement, https://environnement.brussels/ : rubriques « Rénover et construire » et accès au certificat PEB du logement. Les règles pour les bâtiments non résidentiels n'ont pas été lues : à consulter sur le site.
- Portail du gouvernement flamand, https://www.vlaanderen.be/ : rubrique « Bouwen, wonen en energie » et « Economie en ondernemen ». Les pages sur le certificat de performance énergétique (EPC) et les aides aux entreprises n'ont pas pu être ouvertes : à rechercher sur le portail.

- CREG, « Comment est composé le prix de l'énergie ? », https://www.creg.be/fr/consommateurs/le-marche-de-lenergie/comment-est-compose-le-prix-de-lenergie, consultée le 17/10/2026 : quatre grandes composantes (énergie, coûts de réseau, redevances, TVA) ; l'énergie est la seule composante ouverte à la concurrence, à comparer au prix du contrat et à son indexation ; pour les clients professionnels, la TVA est récupérable.
- CWaPE, « Les composantes de la facture », https://www.cwape.be/node/19, page ouverte le 17/10/2026 (régulateur wallon).

Les formules de consommation par mètre carré et de coût moyen par kWh sont des conventions de gestion, pas des textes officiels. Aucun coefficient de conversion ni aucun montant de prime n'est repris ici.

## À vérifier par un professionnel

Les obligations PEB et d'audit, l'éligibilité aux primes et les montants sont à confirmer auprès de l'administration régionale de l'énergie ou d'un conseiller en énergie agréé. Le choix et la signature d'un contrat d'énergie, et le traitement comptable des factures, sont à valider par la direction et l'expert-comptable.

## Limites

- Sans relevé ou facture, pas de chiffre : la compétence ne reconstitue pas une consommation.
- Elle ne remplace pas un audit énergétique réalisé par un professionnel agréé.
- Elle ne garantit aucune prime et ne dépose aucun dossier de demande.
- La comparaison entre bâtiments exige des usages proches ; sinon elle est signalée comme peu fiable.
- Les prix de marché ne sont pas connus d'elle : ils viennent des offres reçues via le service achats.

## Exemple

Bâtiment A, bureaux, 450 m2 de surface utile (registre des bâtiments). Électricité 2025 : 31 500 kWh, 8 190 euros hors TVA (factures de janvier à décembre, toutes relevées). Électricité 2024 : 28 800 kWh, 6 912 euros.

Consommation 2025 : 31 500 / 450 = 70 kWh par m2 ; 2024 : 64 kWh par m2, soit 9,4 % de plus. Coût moyen 2025 : 0,26 euro par kWh contre 0,24 en 2024, soit 8,3 % de plus. Effet volume et effet prix sont tous deux à la hausse. Hypothèse à vérifier : un équipement ajouté en 2025. Contrat : fin le 31/03/2027 avec préavis de deux mois, donc date limite d'action le 31/01/2027 ; demande de comparaison à transmettre au service achats avant cette date.

Cas d'échec : le fournisseur a facturé onze mois sur estimation et un seul relevé réel en décembre. La compétence ne publie pas de consommation par m2 pour l'année : elle écrit « série non fiable : onze factures estimées », calcule seulement le total annuel régularisé si la facture de régularisation existe, et pose la question « fournir les index relevés aux compteurs en début et fin de période ».

## Origine de la méthode

Version 1.1.0 : lecture d'une facture par composantes (étape 3 bis) et questions de stratégie d'achat fixe, variable ou mixte (étape 6) adaptées et traduites de github.com/affaan-m/ECC, `skills/energy-procurement/SKILL.md`, « Pricing Structures and Utility Bill Anatomy » et « Procurement Strategy Selection », commit ef648e01899ba3e8dc6371642deaaf64b4477775, compétence sous licence Apache 2.0 (en-tête `license: Apache-2.0`, auteur « evos »). Le contenu propre au marché américain n'est pas repris ; composantes belges selon la CREG. Modifications : réécriture en français, décision humaine. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
