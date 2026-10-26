# ADR-007 : RAG existant du plugin, pas de base vectorielle

- **Statut** : Accepté
- **Décision de référence** : D6 du plan

## Contexte

La recherche Claude a besoin de retrouver des passages pertinents. Le plugin de l'usine possède déjà une couche de
connaissances : recherche hybride, vectorisation locale, protection contre l'injection. Le RAG est décrit dans
`docs/rag-conception.md`.

## Décision

Réutiliser le RAG du plugin tel quel, sans nouvelle base :

- **plein texte PostgreSQL** et **similarité des vecteurs** `bge-m3` (licence MIT, exécution locale, 1 024
  dimensions, plus de 100 langues), fusionnés par **RRF** (somme de 1/(60 + rang), Cormack, Clarke et Büttcher,
  SIGIR 2009) ;
- empreinte SHA-256 des fichiers du modèle consignée avec chaque index ; jamais deux modèles dans un même index ;
- **à ajouter** : une configuration de recherche plein texte `english` pour les dossiers en anglais (les
  configurations `dutch`, `english`, `french`, `simple` existent dans PostgreSQL, mais l'index actuel n'en utilise pas
  pour l'anglais) ;
- le modèle rédige la réponse **sans outils**, et du code vérifie chaque citation (extrait réel, passage publié) ;
- l'index public est construit uniquement depuis le contenu publié et approuvé.

## Options écartées et pourquoi

- **Base vectorielle dédiée (Qdrant, Weaviate, Pinecone)** : un service de plus à exploiter, parfois payant,
  alors que PostgreSQL suffit au volume visé.
- **Embeddings par API payante (Voyage ou autre)** : coût et sortie de données ; `bge-m3` local mesuré suffisant.
- **Plein texte seul** : mauvais rappel sur les paraphrases et entre le français et l'anglais.

## Conséquences

- Positives : aucun achat ; infrastructure inchangée ; protection contre l'injection déjà en place (documents =
  données, motifs détectés à l'indexation).
- Négatives : indexation locale à planifier (GPU pour de gros volumes) ; la qualité bilingue doit être mesurée par
  un jeu d'évaluation (plan H.4) avant de promettre quoi que ce soit.

## Références

- Plan : Livrable A (D6), H.1, H.3, H.4.
- Dépôt : `docs/rag-conception.md` (§1, §3.3, §5.3), `plugin-atelier/src/serveur/connaissances/`
  (vectorisation, recherche).
