# Fiche de qualification

Une fiche par prospect retenu ou écarté.

| champ | contenu | obligatoire |
| --- | --- | --- |
| `prospect` | identifiant rendu par le dépôt (jamais saisi à la main) | oui |
| `mode` | `demonstration` ou `reel` | oui |
| `criteres` | une ligne par critère : constat, source, date, points | oui |
| `score` | total des points, toujours suivi de « estimation » si l'étalonnage n'est pas mesuré | oui |
| `classement` | retenu, à revoir par l'humain, écarté | oui |
| `motif` | raison du classement | oui |
| `limites` | ce que les sources ne permettent pas de conclure | oui |

Mots interdits dans une fiche : « certain », « garanti », « taux exact », toute
recommandation de garantie, de prime ou de franchise.
