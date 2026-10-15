# Fiche source

Une fiche par source consultée, y compris en cas d'échec.

| champ | contenu | obligatoire |
| --- | --- | --- |
| `sourceId` | identifiant stable, par exemple `SRC-014` | oui |
| `url` ou `document` | adresse complète ou chemin du document | oui |
| `titre` | titre de la page ou du document | oui |
| `editeur` | organisation responsable | si connu |
| `datePublication` | date affichée, sinon « inconnue » | oui |
| `dateCollecte` | date et heure UTC de consultation | oui |
| `statutAcces` | consultée, inaccessible, payante, supprimée, archivée, refusée par sécurité | oui |
| `extrait` | citation exacte et courte qui soutient l'affirmation | si consultée |
| `limite` | ce que la source ne permet pas de conclure | oui |
| `utiliseePar` | identifiants des livrables et exigences | oui |

Règles :

- Une source primaire (site officiel de l'entreprise, texte officiel) prime sur un
  agrégateur.
- Deux pages d'un même site ne sont pas deux sources indépendantes.
- Une archive porte la date de l'archive, pas celle de la consultation.
- Une adresse privée, locale ou de métadonnées n'est jamais consultée ; le statut est
  « refusée par sécurité ».
