# Journal de recherche de prospects

Une ligne par appel d'outil, y compris les appels sans résultat ou refusés.

| champ | contenu | obligatoire |
| --- | --- | --- |
| `service` | `bce`, `bnb`, `fsma`, `osm` ou `b2c` | oui |
| `outil` | nom exact de l'outil appelé | oui |
| `arguments` | objet envoyé, valeurs par défaut explicites | oui |
| `mode` | mode rendu par `atelier_identite` (`demonstration` ou `reel`) | oui |
| `date` | date et heure UTC de l'appel | oui |
| `resultats` | nombre d'éléments rendus | oui |
| `depot` | accepté ou refusé, avec le motif du serveur | oui |
| `exclus` | nombre et motifs d'exclusion rendus par le serveur | si dépôt accepté |
| `limite` | page atteinte, plafond, source muette | oui |

Règles :

- Un appel non déposé ne compte pas : ses résultats ne figurent pas dans la liste.
- Une réponse refusée n'est jamais corrigée à la main : l'appel est refait.
- Les personnes physiques de la BCE et les particuliers hors `b2c` n'apparaissent dans
  aucune colonne, même comme exclus nommés.
