# ADR-002 : 12 agents (11 Claude et une porte déterministe), rôles mécaniques en code ; révisé à 13 le 26/10/2026

- **Statut** : Accepté
- **Décision de référence** : D1 du plan

## Contexte

Le cahier des charges décrit 24 rôles fonctionnels sous forme d'agents autonomes. Le registre de l'usine borne un
service à 12 agents au plus : `scripts/atelier_services.py:146` rejette toute liste hors de l'intervalle 2 à 12
(« 2 à 12 agents attendus »). Environ la moitié des rôles (collecte, dédoublonnage, diff de versions, vérification de
liens, archives, suivi de budget) sont mécaniques.

## Décision

Les 24 rôles sont ramenés à **11 agents Claude et 1 porte déterministe**, soit 12, plus des travailleurs en code :

- Agents : `directeur` (coordinateur), `veille-technique`, `veille-recherche-medias`, `analyste-technique`,
  `integrateur-claude-mcp`, `ingenieur-essais`, `analyste-comparatif`, `auditeur-securite`, `redacteur-en-chef`,
  `adaptateur-anglais`, `relecteur-independant`.
- `porte` : adaptateur `process`, sans modèle. Elle vérifie que chaque affirmation a une preuve, que chaque extrait
  existe dans l'instantané et que chaque mention « testé » a un essai.
- En code (jobs du plugin) : collecte, dédoublonnage, résolution d'identité, diff d'instantanés, archives, lint,
  agrégation, alertes de budget.
- Les rôles de planification (A2) et d'archivage (F2) ne sont pas des agents : Paperclip planifie, la base versionne.

## Options écartées et pourquoi

- **24 agents** : impossible sans modifier la borne du registre, et coûteux en quota pour des tâches sans jugement.
- **Relever la borne de 12** : écarté, la borne protège la lisibilité et le budget de chaque service ; la modifier
  toucherait tous les services existants.
- **Tout en agents Claude, sans porte** : écarté, un contrôle de preuves doit être reproductible et non probabiliste.

## Conséquences

- Positives : moindre consommation de quota ; contrôles testables ; conformité à la borne du registre.
- Négatives : plus de code à écrire et à tester (jobs du plugin) ; les modèles par agent restent à valider au pilote.

## Références

- Plan : Livrable A (D1), D.1 (correspondance 24 rôles vers 12 agents), Livrable E.
- Dépôt : `scripts/atelier_services.py:146`, `scripts/generer-fiches-agents.py`, `docs/usine-services.md`.

## Révision du 26/10/2026

JB a autorisé un 13e agent, `explorateur-sources` : il tient la base des sources (sites, presse, chaînes YouTube,
podcasts, toutes langues) ; l'étude des vidéos est prévue mais suspendue : aucun code de transcription n'existe et la
collecte audio attend l'avis d'un juriste (DROIT-5.3, 30/10/2026). La borne de l'usine (`scripts/atelier_services.py`) passe de 12 à 13 agents pour tous les services ;
c'est une borne de l'usine, pas une limite de Paperclip. La porte reste un programme déterministe, déclaré par le
champ `deterministes` du registre des services. Le nom du fichier est gardé pour les liens existants.
