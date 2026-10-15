# Modèle d'organisation de l'Atelier Marketing IA

Paquet au format natif de Paperclip (« Agent Companies », `agentcompanies/v1`) pour
l'organisation de démonstration « Rénovation Liège (démonstration) », plus son registre
canonique, ses gabarits de politiques et son corpus fictif.

- Source canonique : `registre/agents.json` et `registre/organisation.json`, corps des
  `AGENTS.md`, `SKILL.md`, `PROJECT.md`, `TASK.md`.
- Fichiers générés (ne pas modifier à la main) : `.paperclip.yaml`, en-têtes de
  `COMPANY.md` et des `AGENTS.md`, `company-package.lock.json`.
- Envoyés à Paperclip : `COMPANY.md`, `.paperclip.yaml`, `agents/`, `skills/`, `projects/`.
  Restent hors du paquet : `registre/`, `politiques/`, `demo/`, ce fichier, le verrou.

Commandes et explications : `docs/guide-agents-competences.md`.
