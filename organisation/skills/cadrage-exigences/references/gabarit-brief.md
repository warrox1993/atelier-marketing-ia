# Gabarit du brief

```markdown
# Brief : <titre court>

Version : <n> · Date (Europe/Brussels) : <JJ/MM/AAAA> · Auteur : Coordinateur

## Demande d'origine
> <citation exacte, sans reformulation>
Provenance : <canal, auteur, date>

## Contexte et objectif
<2 à 5 phrases ; aucun chiffre qui n'est pas dans la demande ou dans une source>

## Périmètre
- Établissements : <liste confirmée par l'humain, ou « à confirmer »>
- Canaux : <...>
- Période : <...>
- Budget maximal : <montant, devise, ce qu'il couvre>

## Exigences
| id | texte d'origine | interprétation | obligatoire | critères | dépendances | preuve attendue | état |
| --- | --- | --- | --- | --- | --- | --- | --- |

États possibles : non traité, partiel, couvert, bloqué, non applicable justifié (décision
humaine obligatoire pour une exigence obligatoire).

## Informations manquantes
| id | question | pourquoi | conséquence si absente | type (recherche, client) | bloquant pour |
| --- | --- | --- | --- | --- | --- |

## Hypothèses
| id | hypothèse | autorisée par | exigences dépendantes |
| --- | --- | --- | --- |

## Hors périmètre
- <ce qui n'est pas demandé et ne sera pas produit>
```

Règles de numérotation : `REQ-` suivi de trois chiffres, jamais réutilisé ; `HYP-` pour
les hypothèses ; `Q-` pour les questions. Une exigence modifiée garde son identifiant et
reçoit une note de version.
