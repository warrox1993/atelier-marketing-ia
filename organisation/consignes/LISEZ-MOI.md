# Consignes communes des agents

Deux sources, assemblées par `scripts/bootstrap-organisation.py` (fonction `consignes_communes`) et recopiées à la fin
de chaque `AGENTS.md`, sous le marqueur des consignes communes :

- `communes.md` : le tronc commun à TOUS les agents, quel que soit le service (appel de l'API, fichiers temporaires,
  livrable en relecture, échanges entre services). Aucune mention de la marque, des prospects ni des outils du marketing.
- `marketing.md` : le complément des seuls agents du marketing. Chaque bloc `<!-- bloc : nom -->` remplit
  l'emplacement `[[marketing:nom]]` du tronc (ou `[[marketing:nom|repli]]` dans une phrase : le texte de repli sert
  aux autres services). La section « Échanges entre services » est encadrée par `hors-marketing` dans le tronc : les
  agents du marketing ne la reçoivent pas, leur texte reste donc inchangé.

Après une modification : `python3 -I scripts/bootstrap-organisation.py generer`, puis `scripts/verifier-organisation.py`.
