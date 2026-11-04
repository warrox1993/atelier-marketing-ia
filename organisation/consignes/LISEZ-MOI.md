# Consignes communes des agents

Deux sources, assemblées par `scripts/bootstrap-organisation.py` (fonction `consignes_communes`) et recopiées à la fin
de chaque `AGENTS.md`, sous le marqueur des consignes communes :

- `communes.md` : le tronc commun à TOUS les agents, quel que soit le service (appel de l'API, fichiers temporaires,
  livrable en relecture, échanges entre services). Aucune mention de la marque, des prospects ni des outils du marketing.
- `marketing.md` : le complément des seuls agents du marketing. Chaque bloc `<!-- bloc : nom -->` remplit
  l'emplacement `[[marketing:nom]]` du tronc (ou `[[marketing:nom|repli]]` dans une phrase : le texte de repli sert
  aux autres services). La section « Échanges entre services » est encadrée par `hors-marketing` dans le tronc : les
  agents du marketing ne la reçoivent pas, leur texte reste donc inchangé.
- Les blocs `memoire` et `sans-memoire` de `communes.md` : les rôles de `ROLES_SANS_MEMOIRE` (relecteur, exigences,
  contradicteur, relecteur indépendant) reçoivent le second (section « Connaissances »), tous les autres le premier.

- `observatoire.md` (T12) : les règles communes du seul service Observatoire, ajoutées par `fichiers_service` à la fin du
  corps de chaque agent non déterministe du service, avant le marqueur des consignes communes. Une règle propre à un
  rôle reste dans son `AGENTS.md`.

Après une modification : `python3 -I scripts/bootstrap-organisation.py generer`, puis `scripts/verifier-organisation.py`.

`pieges-valides.json` (APP-4) : pièges validés par l'humain à partir des rapports de `scripts/detecter-erreurs-repetees.py`,
une entrée `{"signature": "<signature du rapport>", "regle": "<consigne en une phrase>", "valide_le": "AAAA-MM-JJ"}` par
piège (30 au plus). Liste vide : aucune section ; sinon une section « Pièges constatés » à la fin des consignes communes
de tous les agents, une ligne par piège. Une entrée mal formée arrête `generer`.
