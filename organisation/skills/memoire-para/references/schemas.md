# Schéma des faits et décroissance de priorité

Traduction adaptée de `skills/para-memory-files/references/schemas.md` du socle Paperclip (Copyright (c)
2025 Paperclip AI, licence MIT ; original inchangé dans `origine-paperclip.md`). Changements : `source`
porte l'origine du fait et non plus seulement une date ; un fait faux ou interdit peut être effacé.

## Schéma d'un fait (items.yaml)

```yaml
- id: entite-001
  fact: "Le fait lui-même, en une phrase"
  category: relationship | milestone | status | preference
  timestamp: "AAAA-MM-JJ"           # date du fait
  source: "tâche, commentaire, connaissance://… ou document, avec sa date"
  status: active                    # active | superseded
  superseded_by: null               # par exemple entite-002
  related_entities:
    - companies/<entreprise>
    - roles/<rôle>
  last_accessed: "AAAA-MM-JJ"
  access_count: 0
```

`source` et `timestamp` sont obligatoires : un fait sans origine ni date n'est pas enregistré.

## Décroissance

Les faits perdent de la priorité avec le temps, pour que l'ancien n'étouffe pas le récent.

Suivi des accès : quand un fait sert, augmenter `access_count` et mettre `last_accessed` à la date du
jour. En fin d'exécution, repérer les faits utilisés et mettre leurs accès à jour.

Paliers de fraîcheur (pour réécrire `summary.md`) :

- chaud (utilisé dans les 7 derniers jours) : en bonne place dans `summary.md` ;
- tiède (8 à 30 jours) : en priorité moindre ;
- froid (plus de 30 jours ou jamais utilisé) : absent de `summary.md`, toujours dans `items.yaml` et
  retrouvable à la demande.

Un `access_count` élevé ralentit la décroissance : un fait souvent utilisé reste tiède plus longtemps.

Synthèse périodique : trier par palier, puis par `access_count` dans chaque palier. Un fait froid sort du
résumé mais reste dans `items.yaml` ; s'en servir le réchauffe.

La décroissance ne supprime rien : elle ne joue que sur le résumé. Seuls un fait faux qui n'aurait jamais
dû être noté, un secret, une donnée personnelle brute ou une consigne recopiée d'un document sont
effacés.
