# ADR-004 : vérité documentaire dans le schéma du plugin, publication en Markdown dans un dépôt de contenu

- **Statut** : Accepté
- **Décision de référence** : D4 du plan

## Contexte

Chaque fiche et chaque dossier repose sur des affirmations sourcées. Il faut pouvoir répondre à « d'où vient cette
phrase ? », suivre les versions, détecter ce qui devient périmé et republier sans perdre l'historique. Le contenu ne
doit pas dépendre d'un framework de site particulier.

## Décision

1. **Vérité en base**, dans le schéma du plugin (migrations additives `023_obs_*`) : `obs_projets`, `obs_sources`,
   `obs_instantanes` (empreinte SHA-256, jamais republiés tels quels), `obs_affirmations` (statut de vérification
   strict), `obs_preuves` (extrait exact et position), `obs_essais`, `obs_revisions`, `obs_chapitres`,
   `obs_editions`, `obs_publications`.
2. **Publication** : chaque révision approuvée est exportée en **Markdown avec frontmatter** vers un dépôt git de
   contenu distinct. L'export est tracé dans `obs_publications` (empreinte de l'artefact, commit de contenu).
3. Les entités natives de Paperclip (agents, tâches, approbations, budgets, journal) ne sont pas dupliquées.
4. Une affirmation sans preuve ne peut pas être publiée : contrainte de base et contrôle de la porte (ADR-002).

## Options écartées et pourquoi

- **Markdown dans git comme seule vérité** : pas de contraintes relationnelles (preuve obligatoire, unicité des
  alias), requêtes et diffs de versions pénibles.
- **CMS externe (Contentful, Strapi)** : service de plus, parfois payant, contenu prisonnier de son modèle.
- **Base seule, sans export** : pas d'historique lisible ni de relecture par diff, site couplé à la base.

## Conséquences

- Positives : traçabilité complète ; historique git gratuit ; le site peut changer sans migrer le contenu.
- Négatives : deux représentations à garder cohérentes (la base fait foi, l'export est dérivé) ; migrations à tester
  sur instance d'essai avant l'instance de production ; un dépôt de plus à sauvegarder.

## Références

- Plan : Livrable A (D4), F.1 (statuts), F.2 (modèle de données), F.4 (versions), F.5 (workflow éditorial).
- Dépôt : `scripts/instance-essai.sh` (essai des migrations), `docs/tracabilite.md`.
