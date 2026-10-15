---
name: "redaction-declinaison-canal"
description: "Rédige un contenu principal puis le décline par canal (site, blog, réseaux sociaux, courriel, fiche d'établissement) en respectant les contraintes de chaque canal, la charte de marque et les sources. À utiliser pour produire articles, publications, pages, newsletters ou briefs de visuels."
metadata:
  version: "1.2.0"
  langue: "fr"
  domaine: "contenu"
---

# Rédaction et déclinaison par canal

## Quand l'utiliser

- Une tâche demande un texte (article, page, publication, courriel) ou un brief de visuel.
- Un texte approuvé doit être adapté à un autre canal.

## Objectif

Produire des textes justes et cohérents entre canaux, chacun adapté à son support, sans
aucune information inventée.

## Prérequis

- Brief, exigences, charte de marque (compétence `charte-marque`), sources validées.
- Chiffres d'une connexion de la passerelle marketing (Search Console, Analytics, Ads, fiche,
  réseaux sociaux, CRM) : `atelier_identite` d'abord, chaque réponse d'outil déposée telle quelle avec
  les arguments exacts de l'appel (`POST …/taches/<issueId>/donnees-connexion`, champ `arguments`),
  mention « démonstration » sur chaque chiffre de démonstration, aucun chiffre absent d'une réponse
  déposée (section « Connexions de la passerelle marketing » des consignes de l'agent).

## Entrées

- `message_cle`, `canaux`, `sources`, `offres_validees`, `calendrier`.

## Étapes

1. Écrire le contenu principal : message clé, preuves sourcées, appel à l'action unique.
2. Décliner par canal en respectant les contraintes : longueur, ton, format, lien, mentions
   (tableau des contraintes dans la note de livraison).
3. Garder les mêmes faits partout ; une variation de prix, de délai ou d'offre entre canaux
   est une erreur.
4. Pour un visuel : livrer un brief (objectif, format, éléments obligatoires, texte
   incrusté, sources des images, droits à vérifier), marqué « brief, pas un visuel final ».
5. Marquer « à confirmer » tout élément sans source et lister les droits à vérifier.
6. Déposer chaque version comme révision du document de la tâche.

## Livrable

Contenu principal et déclinaisons, chacune avec canal, longueur, appel à l'action, sources ;
briefs de visuels ; liste des points à confirmer.

## Critères de réussite

- Aucun témoignage, avis, prix, certification, subvention ou résultat inventé.
- Faits identiques entre canaux.
- Contraintes de chaque canal respectées.

## Limites

- Sans outil de génération d'image connecté, aucun visuel final.
- La publication n'est jamais faite par cette compétence.

## Exemple

Message clé : « Une toiture isolée, c'est un diagnostic avec visite puis un devis
détaillé. » Publication réseau social (≈ 300 caractères) : « Votre toiture laisse filer la
chaleur ? Nos équipes de Liège-Centre, Outremeuse et Ans passent faire un diagnostic avant
tout devis. Prenez rendez-vous sur notre site. » Point à confirmer : aucune promesse
« gratuit » tant que l'offre n'est pas validée.
