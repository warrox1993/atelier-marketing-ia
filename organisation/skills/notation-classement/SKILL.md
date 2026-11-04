---
name: "notation-classement"
description: "Note et classe des compléments alimentaires sur 100 points avec un barème pondéré (pureté 35, preuves 25, forme et dose 20, transparence 12, prix 8), après application des éliminatoires, avec la règle « inconnu égale zéro point » et la preuve de chaque point attribué, et construit au besoin une grille de 110 critères propre à une catégorie. À utiliser une fois les produits collectés et lus pour obtenir un classement reproductible et contestable ; jamais pour noter à l'impression, remplacer une donnée manquante par une moyenne ni classer un produit éliminé."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "complements"
---

# Notation et classement pondérés

## Quand l'utiliser

- Plusieurs produits d'une même catégorie ont été lus (étiquettes, certificats, études) et il faut les ordonner.
- Un classement existant doit être refait ou défendu devant l'utilisateur ou le contrôleur.
- Une catégorie nouvelle demande sa propre grille de critères avant de noter.

## Objectif

Un classement où chaque produit a une note sur 100, sa décomposition par famille, la liste de ses éliminatoires et, pour chaque point, la preuve (adresse de page, numéro de lot du certificat, PMID). Deux personnes qui refont le calcul avec les mêmes preuves retrouvent le même résultat.

## Prérequis

- Les fiches produit remplies : chaque critère porte une valeur ou la mention `?` (inconnu).
- Les verdicts des compétences `lecture-etiquette-allergenes` et `preuves-cliniques` pour chaque produit.
- Les exigences de l'utilisateur (allergènes exclus, pays d'achat, budget).

## Entrées

- `produits` : une fiche par produit, avec ses preuves.
- `exigences` : éliminatoires propres à l'utilisateur.
- `categorie` : pour choisir la grille de critères (compétence `grille-criteres-complements`).

## Étapes

1. **Appliquer les éliminatoires d'abord.** Un produit sort du classement, quelle que soit sa note, si : un risque d'allergène exclu par l'utilisateur n'est pas écarté par écrit ; il n'a pas de notification belge pour un achat en Belgique ; il contient du dioxyde de titane E171, un ingrédient non autorisé ou un nouvel aliment non autorisé ; sa dose journalière dépasse l'UL de l'EFSA (ou la mélatonine atteint 300 µg/j vendue comme complément) ; un contaminant dépasse une limite légale sur un certificat, ou une alerte RASFF ou AFSCA reste non résolue. Un produit éliminé est listé à part avec sa raison et une note de 0, jamais classé.
2. **Attribuer les points du barème (100).**

   | Famille | Points | Sous-critères |
   | --- | --- | --- |
   | Pureté | 35 | certificat de lot par laboratoire tiers ISO 17025 (10) ; métaux lourds et contaminants spécifiques mesurés et bas (10) ; allergènes : site ou ligne exempt et analyse (8) ; excipients courts et propres (4) ; label de contrôle par lot (3) |
   | Preuves | 25 | ingrédient étudié chez l'humain en essai randomisé ou méta-analyse (12) ; étude sur la forme et la dose exactes du produit (8) ; indépendance du financement (5) |
   | Forme et dose | 20 | forme la mieux étayée (10) ; dose égale à celle des études et sous l'UL (10) |
   | Transparence | 12 | formule entièrement chiffrée, sans mélange exclusif (4) ; origine des matières et fabricant nommés (4) ; allégations conformes à la liste de l'Union (4) |
   | Prix | 8 | prix par dose efficace journalière (pas par gélule) comparé au marché : quartile le moins cher 8, puis 6, 4, 2 |

3. **Appliquer la règle « inconnu = zéro ».** Une information non trouvée ou non fournie après demande vaut 0 point, jamais la moyenne. Une affirmation du fabricant non documentée (pas de certificat, pas d'étude citée) vaut au plus 25 % des points du sous-critère.
4. **Écrire la preuve de chaque point.** À côté de chaque sous-score : adresse de la page, numéro de lot du certificat, PMID. Un point sans preuve est retiré.
5. **Départager.** Égalité : la famille Pureté d'abord, puis Preuves.
6. **Lire la note.** 80 et plus : excellent ; 65 à 79 : bon ; 50 à 64 : moyen ; moins de 50 : à écarter. Ajouter la liste des « inconnu » : ce sont les questions qui, si elles obtiennent une réponse, peuvent faire monter le produit.
7. **Construire la grille d'une catégorie si elle manque.** Une grille de 110 critères numérotés C001 à C110, en neuf familles : identité (C001-C010), composition et pureté, allergènes et contaminations croisées, origine, fabrication et contrôle qualité, efficacité et preuves, dosage et usage, prix, disponibilité et service, réputation. Chaque critère a une valeur ou `?`. Commencer par la grille de la section 2 de `grille-criteres-complements` pour la catégorie, puis compléter par les critères propres au produit (type, origine, brevet, dose du brevet).
8. **Calculer par script, pas à la main.** Un script court lit les fiches et applique les règles ci-dessus ; il contient une vérification interne (un produit à allergène non exclu est éliminé ; un produit documenté bat un produit à valeurs inconnues). La sortie est un tableau Markdown trié.

## Livrable

Un tableau de classement (rang, marque, produit, total sur 100, points par famille, éliminatoire éventuel), la fiche de preuves de chaque produit, la liste des éliminés avec leur raison et la liste des « inconnu » par produit.

## Critères de réussite

- Chaque note est recalculable à partir des fiches et des preuves.
- Aucun produit éliminé n'apparaît dans le classement.
- Aucune valeur inconnue n'a reçu de point.
- Le total de chaque famille respecte son plafond.
- Le classement ne contient aucune recommandation médicale : il dit la qualité du produit au regard de la grille.

## Pièges

- Pondérer selon la marque ou la notoriété : le barème note des preuves, pas des réputations.
- Mélanger des prix par gélule et des prix par dose efficace.
- Donner à un produit documenté la même note qu'un produit aux valeurs inconnues sous prétexte d'équité.

## Limites

- Le barème est un choix de méthode : il rend le classement lisible, il n'établit pas une vérité.
- La note dépend de la qualité des preuves collectées ; un produit mal documenté sur le web peut être bon et mal classé, c'est voulu (règle « inconnu égale zéro »).
- Les seuils réglementaires utilisés pour les éliminatoires sont à relire à la source (voir `grille-criteres-complements`).
- La grille de 110 critères est un outil de collecte, pas de pondération : seul le barème sur 100 fait le classement.

## Exemple

Cas illustratif, chiffres d'exemple. Trois produits d'une catégorie : A (certificat de lot, allergène exclu par écrit, essai randomisé sur la même dose) obtient 84 ; B (même ingrédient, certificat générique, pas de réponse sur les allergènes) obtient 48 mais reste classé car il n'a pas d'éliminatoire connu, avec la liste de ses inconnus ; C affiche « traité dans une usine qui manipule des fruits à coque » pour un utilisateur qui les exclut : éliminé, note 0, hors classement.

Cas d'échec évité : un produit à la note brute de 78 contient du dioxyde de titane. Le calcul s'arrête à l'étape 1 : éliminé, sans afficher la note de 78.
