---
name: "recherche-vendeurs-europe"
description: "Inventorie les boutiques en ligne européennes qui vendent un complément alimentaire en lisant les pages publiques de comparateurs de prix (Idealo, Ceneo, Árukereső, Compari, Beslist, KuantoKusta), puis fusionne les domaines trouvés en une liste unique avec pays, type de site et origine. À utiliser pour savoir où acheter un complément ou une catégorie et pour comparer prix et disponibilité ; jamais pour contourner un CAPTCHA, accepter un consentement à la place de l'utilisateur, ni pour affirmer qu'un vendeur livre en Belgique sans l'avoir vérifié sur sa boutique."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "complements"
---

# Inventaire des vendeurs européens d'un complément

## Quand l'utiliser

- Il faut savoir quelles boutiques européennes vendent un complément ou une famille de compléments, au-delà des quelques marques connues.
- Une comparaison de prix par dose efficace demande une liste de vendeurs aussi large que possible.
- Une liste existante doit être complétée par un pays ou un comparateur pas encore parcouru.

## Objectif

Une liste de domaines de vendeurs, sans doublon, où chaque ligne indique le pays d'après l'extension, le type de site (pharmacie, nutrition et santé, généraliste) et le comparateur qui l'a révélée, avec la mention de ce qui reste à vérifier boutique par boutique.

## Prérequis

- Un navigateur piloté sous le contrôle de l'utilisateur (page publique, sans compte). Les comparateurs bloquent souvent les lectures automatiques simples (erreurs 403 ou 429) : c'est un constat à noter, pas un obstacle à contourner par la force.
- La requête de recherche dans la langue de chaque pays (nom du complément ou de la catégorie).
- Un dossier de travail à part, qui reçoit un fichier texte par comparateur et par pays.

## Entrées

- `requetes` : mots de recherche par langue (français, néerlandais, allemand, italien, espagnol, polonais, hongrois, portugais, roumain, anglais).
- `comparateurs` : ceux du tableau de l'étape 2.
- `dossier` : répertoire des fichiers « domaine | source », une ligne par vendeur.

## Étapes

1. **Choisir les comparateurs qui fonctionnent.** Retenus : Idealo (Allemagne, Autriche, France, Italie, Espagne, Royaume-Uni), Ceneo (Pologne), Árukereső (Hongrie) et Compari (Roumanie), Beslist (Pays-Bas), KuantoKusta (Portugal). Écartés après essai, car illisibles ou inutiles pour cet usage : Heureka, Zboží, Pricemania, Skroutz, Trovaprezzi, Pazaruvaj, PriceRunner, Prisjakt, Kieskeurig. Une exclusion se réévalue à la demande de l'utilisateur, pas d'office.
2. **Connaître comment chaque site expose ses vendeurs.**

   | Comparateur | Où lire le vendeur |
   | --- | --- |
   | Idealo (DE, AT, FR, IT, ES, UK) | attribut `data-shop-name` des offres d'une fiche produit (adresse de fiche : suite de 6 chiffres ou plus suivie de `/` ou `_-`) |
   | Ceneo | attribut `data-shopurl` sur les fiches produit |
   | Árukereső, Compari | page de catégorie `c1044`, nom du vendeur dans l'attribut `alt` des images |
   | Beslist, KuantoKusta | liens sortants : extraire les domaines par expression régulière |

3. **Tester d'abord sur UNE requête, dans UN onglet, par variante de site.** Chaque pays est une variante : l'adresse de fiche, les attributs et les blocs de consentement diffèrent. Lancer le script de lecture sur cette seule page, puis vérifier un échantillon de la sortie analysée : les domaines ont-ils la forme attendue (`^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}/?$`), sont-ils des boutiques et non des liens du comparateur lui-même, le nombre est-il plausible ? Corriger le script sur cette page.
4. **Ne lancer partout qu'après ce contrôle.** Le même script ne part dans plusieurs onglets ou plusieurs pays qu'une fois l'échantillon de chaque variante vérifié. Relancer sans contrôle une récolte déjà fausse multiplie l'erreur.
5. **Borner chaque récolte.** Un script de lecture qui tourne longtemps porte un délai maximum et un nombre maximum d'itérations, écrit son avancement dans une variable de page et se relit par appels courts : une commande de navigateur dépasse vite son délai (environ 45 secondes) si elle attend la fin. Enregistrer le résultat de chaque pays dans son fichier dès qu'il est complet.
6. **Respecter les sites.** Jamais de CAPTCHA contourné, jamais de consentement aux cookies accepté à la place de l'utilisateur (c'est à lui de le faire ou de le refuser dans le navigateur), jamais de compte créé, de connexion forcée ni de cadence agressive. Une page bloquée est notée « bloquée » dans le fichier de suivi avec la date.
7. **Fusionner par domaine.** Normaliser (minuscules, retrait de `www.` et de la barre finale), éliminer les doublons, garder pour chaque domaine l'ensemble des comparateurs qui l'ont vu, déduire le pays de l'extension (`.pl`, `.de`, `.fr`, `.co.uk`...) et le type de site par mots du nom de domaine (pharmacie, nutrition et santé, généraliste), en laissant `Europe (.xyz)` quand l'extension n'est pas nationale. Contrôler le script par une assertion sur deux domaines connus.
8. **La Belgique se vérifie boutique par boutique.** Aucun comparateur de la liste ne couvre la Belgique : pour chaque vendeur retenu, ouvrir sa boutique, vérifier qu'elle livre en Belgique, que le produit porte un numéro de notification belge et relever le prix en euros, la livraison comprise.

## Livrable

Un fichier tableur (CSV) `domaine, pays, type, vu_sur`, trié par domaine, avec en tête le nombre de domaines par pays ; un fichier de suivi qui liste, par comparateur et par pays, la date, la requête, le nombre de vendeurs lus et les blocages rencontrés.

## Critères de réussite

- Chaque variante de site a été testée sur une page et son échantillon vérifié avant le lancement général.
- La liste ne contient aucun doublon ni lien du comparateur lui-même.
- Les pays sont déduits de l'extension, et l'incertitude est écrite quand l'extension est générique (`.com`, `.eu`).
- La livraison en Belgique n'est affirmée que pour les boutiques réellement vérifiées.

## Pièges

- Une expression régulière d'adresse de fiche qui marche dans un pays peut rater les autres (adresses à trois segments en France et en Italie) : tester avant de généraliser.
- Les pages de catégorie d'Idealo (adresses contenant `/cat/`) sont exclues de la récolte : seules les fiches produit portent les offres.
- Un domaine de marque (boutique officielle) et un domaine de revendeur ne se valent pas pour la fiabilité : le type de site est un indice, pas une note.

## Limites

- Les comparateurs ne listent que les vendeurs qui paient leur référencement ; l'inventaire n'est pas exhaustif.
- Un comparateur modifie son code de page sans prévenir : les attributs cités sont à revérifier à chaque campagne.
- Aucun prix n'est comparé ici ; l'inventaire dit où chercher, pas qui est le moins cher.
- Un vendeur listé peut vendre un produit non notifié en Belgique ou hors du droit de l'Union.

## Exemple

Cas illustratif, chiffres d'exemple. Catégorie « collagène ». Un essai sur une fiche Idealo allemande renvoie 31 noms de boutiques avec `data-shop-name`. L'échantillon montre 3 noms au lieu de domaines : le script est corrigé pour lire l'adresse de la boutique, puis relancé sur la page française, qui a une adresse de fiche différente, avant tout lancement dans les six pays. La fusion de tous les fichiers donne une liste unique de plusieurs centaines de domaines, avec pays déduits des extensions.

Cas d'échec évité : un comparateur répond 429 à une lecture directe. La compétence note « bloqué » et passe par le navigateur ouvert de l'utilisateur sans contourner de CAPTCHA ; si une vérification humaine apparaît, elle est laissée à l'utilisateur.

## Origine de la méthode

Méthode tirée d'une campagne menée le 02/11/2026 sur une catégorie de compléments (collagène), avec une fusion par un script court (lecture des fichiers « domaine | source », normalisation, déduction du pays et du type, sortie CSV).
