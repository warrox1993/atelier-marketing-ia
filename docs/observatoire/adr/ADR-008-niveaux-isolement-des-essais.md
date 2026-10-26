# ADR-008 : niveaux d'isolement des essais, de 0 à 3

- **Statut** : Accepté (JB, 26/10/2026)
- **Décision de référence** : D8 et O5 du plan

## Contexte

Un dossier « testé » suppose parfois d'exécuter un outil découvert en ligne, donc du code tiers potentiellement
hostile. Docker et Podman ne sont pas une frontière de sécurité suffisante contre du code hostile. Les agents ne
doivent ni exécuter de code non approuvé sur l'hôte (le poste de développement) ni accéder à des secrets.

## Décision

Quatre niveaux, choisis selon le risque, enregistrés dans `obs_essais.niveau_isolement` :

- **0** : lecture de métadonnées seulement, aucune exécution (défaut, P0).
- **1** : analyse statique du code téléchargé, dans une cage sans réseau (modèle de `fabrique/cage.py`).
- **2** : exécution dans une **VM jetable libvirt** (instantané, réseau coupé ou liste blanche, CPU, RAM et durée
  bornés, détruite après usage), **sur approbation humaine** (approbation native de Paperclip, P1).
- **3** : exécution locale autorisée seulement pour un outil déjà installé par décision de l'opérateur (cas de REA), et
  jamais pour un essai publié comme « vérifié ».

Jamais d'exécution sur l'hôte pour du code non approuvé. Au démarrage : niveaux 0 et 1 seulement ; le niveau 2
s'ouvre sur approbation de l'opérateur (O5).

## Options écartées et pourquoi

- **Conteneur Docker ou Podman comme isolation** : noyau partagé, échappements connus.
- **Exécution directe pour aller vite** : risque d'exfiltration de secrets et de compromission du poste.
- **Pas d'essais du tout** : le dossier ne pourrait rien affirmer de « testé ».
- **Service d'exécution distant payant** : coût et fuite potentielle de données, contraire à la règle de gratuité.

## Conséquences

- Positives : frontière nette entre ce qui est lu, analysé et exécuté ; chaque essai tracé (commandes, journal
  empreinté, approbation).
- Négatives : mise en place d'une VM jetable (temps, disque) ; moindre couverture tant que le niveau 2 n'est pas
  ouvert ; REA n'est essayé « pour le dossier » qu'en VM.

## Références

- Plan : Livrable A (D8), J.1 (modèle de menaces et niveaux), Livrable O (O5), F.2 (`obs_essais`).
- Dépôt : `fabrique/cage.py` (modèle de cage), `docs/conception-execution-etroite.md`.
