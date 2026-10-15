---
name: "controle-couverture"
description: "Contrôle indépendant de la couverture d'un livrable : compare la version exacte du livrable au brief original et à chaque exigence REQ-xxx, exige une preuve localisable par point couvert, détecte établissements, canaux ou sections oubliés et rend un verdict structuré. À utiliser pour toute revue de livrable avant le dossier humain."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "controle"
---

# Contrôle de couverture des exigences

## Quand l'utiliser

- Un livrable passe en revue (étape de revue d'une politique d'exécution).
- Une nouvelle révision du livrable a été déposée après correction.

## Objectif

Établir, exigence par exigence, si la version examinée satisfait le brief original, avec
une preuve que n'importe qui peut retrouver.

## Prérequis

- Brief original complet, liste des exigences, identifiant de révision du livrable.

## Entrées

- `brief_original`, `exigences`, `livrable` (contenu + identifiant de révision), `criteres`.

## Étapes

1. Relever l'identifiant de révision examiné ; il figurera dans le verdict.
2. Pour chaque exigence obligatoire puis facultative : chercher la partie du livrable qui
   la satisfait ; vérifier les critères, pas seulement les mots.
3. Attribuer un état : non traité, partiel, couvert, bloqué, non applicable justifié
   (seulement avec la décision humaine citée).
4. Localiser la preuve : document, section ou titre, citation courte.
5. Pour une exigence collective (tous les établissements, tous les canaux), vérifier chaque
   élément séparément.
6. Rédiger un constat pour chaque écart : exigences liées, catégorie, gravité, emplacement,
   description, preuve, correction attendue (format et route dans
   `references/schema-verdict.md`).
7. Décider : `PASS` seulement si toutes les exigences obligatoires sont couvertes avec
   preuve et qu'aucun constat critique ou majeur n'est ouvert ; `BLOCKED_INFORMATION` si
   une information humaine manque ; sinon `CHANGES_REQUESTED`.

## Livrable

Verdict structuré du rôle `exigences`, déposé par la route des verdicts du moteur de
l'atelier (`references/schema-verdict.md`), puis résumé en commentaire de la tâche.

## Critères de réussite

- Chaque exigence obligatoire a un état et une preuve, ou un constat.
- Le verdict cite la révision examinée.

## Limites

- Le contrôle ne juge pas la qualité rédactionnelle ni l'exactitude factuelle (relecteur).
- Un verdict devient caduc dès qu'une nouvelle révision est déposée.
- Une sortie disant PASS ne franchit pas seule la porte : le contrôle déterministe du
  serveur vérifie aussi preuves, révision et revues requises.

## Exemple

Livrable « Article isolation toiture », deuxième révision. REQ-003 Liège-Centre : couvert,
preuve « section Nos agences, paragraphe 1 ». REQ-004 Outremeuse : couvert, « section Nos
agences, paragraphe 2 ». REQ-005 Ans : **non traité**. Constat de catégorie
`exigence_manquante`, gravité `majeure` : « L'établissement d'Ans n'apparaît nulle part ;
ajouter adresse, zone et lien de la page d'agence. » Verdict : `CHANGES_REQUESTED`. Après
la troisième révision, qui ajoute Ans, nouveau verdict `PASS` avec une preuve par
établissement.
