# Structure type d'une campagne en brouillon

```markdown
# Campagne : <nom> (brouillon, non activée)

Objectif : <exigences couvertes> · Zone : <...> · Période : <du ... au ...>
Budget maximal autorisé : <montant> · Proposé : <montant> · Marge : <montant>

## Groupes d'annonces
| groupe | page de destination | offre validée | mots-clés | correspondance |
| --- | --- | --- | --- | --- |

## Exclusions
| mot-clé exclu | raison |
| --- | --- |

## Annonces
| groupe | variante | titres | descriptions | offre | page |
| --- | --- | --- | --- | --- | --- |

## Budget
| campagne | par jour | jours | total |
| --- | --- | --- | --- |

## Approbations requises avant toute activation
- Contenu des annonces (version <n>)
- Compte publicitaire, audience, montant, durée
```

Rappels : une approbation d'article n'autorise pas une campagne payante ; toute
modification matérielle (montant, audience, texte) invalide l'approbation précédente.
