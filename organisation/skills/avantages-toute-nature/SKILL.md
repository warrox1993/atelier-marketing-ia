---
name: "avantages-toute-nature"
description: "Prépare le relevé des avantages de toute nature accordés par une entreprise belge (voiture de société, téléphone, ordinateur, connexion internet, autres avantages) et la question de la déductibilité des véhicules, à partir du barème officiel de l'année : inventaire par catégorie, données nécessaires au calcul, montants seulement quand le barème de l'année a été lu, points à faire valider. À utiliser pour préparer la paie de fin d'année, une politique voiture ou la fiche 281 ; jamais pour fixer une politique, choisir un véhicule ou appliquer un barème de mémoire."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "fiscalite"
---

# Avantages de toute nature

## Quand l'utiliser

- Fin d'année : vérifier que les avantages accordés sont bien relevés avant les fiches fiscales 281.
- Une nouvelle voiture de société, un téléphone ou un ordinateur est mis à disposition d'un collaborateur.
- La direction revoit sa politique de véhicules et veut connaître l'effet fiscal pour l'entreprise et le bénéficiaire.

## Objectif

Un inventaire des avantages de toute nature par catégorie, avec pour chacun les données nécessaires au calcul, le
barème officiel de l'année cité avec sa date, le montant seulement quand ce barème a été lu, et les questions
ouvertes, sans aucun montant repris de mémoire.

## Prérequis

- La liste des avantages accordés, par catégorie, fournie par la comptabilité ou le secrétariat social (comptages et
  caractéristiques, pas de dossier nominatif).
- Pour chaque véhicule : date de première immatriculation, valeur catalogue, type de carburant ou motorisation,
  émissions de CO2 selon le certificat de conformité, usage privé ou non.
- Le barème officiel de l'année concernée (SPF Finances) ou un extrait daté fourni par l'expert-comptable ou le
  secrétariat social.

## Entrées

- `annee` : année de revenus.
- `avantages` : catégorie, nombre de bénéficiaires, caractéristiques utiles au calcul.
- `vehicules` : une ligne par véhicule avec les données ci-dessus.
- `bareme` : extrait daté du barème officiel de l'année, avec sa source.

## Étapes

1. **Inventorier** les avantages par catégorie : véhicule, téléphone, ordinateur, tablette, connexion internet,
   abonnement, logement, chauffage, électricité, prêt à taux réduit, autres. Un avantage soupçonné mais non documenté
   est une question, pas une ligne.
2. **Vérifier le barème** : chaque forfait ou formule doit venir du barème officiel de l'année concernée, avec la date
   de lecture. Les montants et coefficients changent chaque année : un barème d'une autre année n'est jamais appliqué.
   Sans barème lu, la colonne montant porte « barème de l'année à fournir ».
3. **Véhicules** : pour chacun, réunir valeur catalogue, émissions de CO2, motorisation, âge, et signaler les données
   manquantes. Le calcul de l'avantage du bénéficiaire et la déductibilité pour la société dépendent de règles qui ont
   changé selon la date de commande ou d'acquisition : citer la règle de l'année et de la date du véhicule, ou la
   marquer « à vérifier ».
4. **Contribution du bénéficiaire** : une contribution personnelle réduit l'avantage dans certains cas ; la noter avec
   sa pièce, sans en déduire l'effet sans règle lue.
5. **Lien avec la paie et les fiches 281** : la liste des avantages par catégorie est transmise au secrétariat social
   par le coordinateur ; le calcul individuel et la déclaration restent au secrétariat social.
6. **Lien avec les services généraux** (flotte) et les ressources humaines (politique) : une question de politique
   voiture est remontée au coordinateur, jamais tranchée.
7. **Questions ouvertes** pour l'expert-comptable ou le secrétariat social, chacune avec la donnée manquante et l'effet
   possible.

## Livrable

Un tableau par catégorie (catégorie, nombre de bénéficiaires, données de calcul, barème cité avec date, montant ou
« barème à fournir », statut), un tableau des véhicules (données, manques, règle citée), les questions ouvertes et la
table des faits. Mention en tête : « analyse préparatoire, à valider par le secrétariat social et l'expert-comptable ».

## Critères de réussite

- Zéro montant sans barème officiel de l'année cité et daté.
- Chaque véhicule a ses données de calcul ou la liste de celles qui manquent.
- Aucune donnée nominative inutile : comptages et caractéristiques, pas de noms.
- Aucune politique ni choix de véhicule présentés comme décidés.

## Sources officielles

- Code des impôts sur les revenus 1992 (avantages de toute nature et frais de voiture), Justel,
  https://www.ejustice.just.fgov.be : texte consolidé non ouvert le 17/10/2026, à lire avant usage.
- Pages du SPF Finances sur les avantages de toute nature et la voiture de société, https://finances.belgium.be :
  vérification anti-robot le 17/10/2026, non contournée ; non citées.

Aucun montant, coefficient ni pourcentage n'est donc donné dans cette compétence : ils viennent chaque année du barème
officiel, fourni par l'humain, l'expert-comptable ou le secrétariat social.

## À vérifier par un professionnel

Le barème de l'année, le calcul de chaque avantage, l'effet d'une contribution personnelle, la déductibilité des
véhicules selon leur date d'acquisition et leur motorisation, et le traitement social (cotisation de solidarité sur les
voitures) relèvent du secrétariat social et de l'expert-comptable.

## Limites

- La compétence ne calcule aucun avantage individuel et n'établit aucune fiche fiscale.
- Elle ne recommande pas de véhicule et ne fixe aucune politique.
- Les avantages sociaux exonérés ou les plans de rémunération (bonus, warrants) ne sont pas traités ici.

## Exemple

Année 2026 : 14 voitures de société, 40 téléphones avec abonnement, 38 ordinateurs portables. Barème 2026 non fourni :
colonne montant à « barème de l'année à fournir ». Trois voitures sans taux de CO2 renseigné : données manquantes
listées. Question au secrétariat social : traitement des deux voitures commandées en 2026 selon leur motorisation.

Cas d'échec : l'agent applique le forfait de l'année précédente parce qu'il « change peu ». C'est un montant inventé
pour l'année en cours : il doit écrire « barème de l'année à fournir ».
