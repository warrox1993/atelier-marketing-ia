# Tests de bout en bout de l'interface de l'atelier (lot C)

Contre une instance Paperclip **réelle** (backend, base PostgreSQL embarquée, moteur de
tâches), avec le plugin installé et l'organisation d'ESSAI. Aucun appel de modèle : sur l'instance
jetable, les agents sont basculés en agents `process` déterministes (`plugin-atelier/demo/agent-demo.mjs`).
Il n'existe plus de mode démonstration : l'organisation d'essai est l'organisation modèle créée en mode
`reel` (nom historique « Rénovation Liège (démonstration) », celui que cherchent les essais). Navigateur : chromium **sans interface** fourni par
le socle (`paperclip/node_modules`, Playwright 1.62.1) ; aucune fenêtre visible.

## Préparer

```bash
cd ~/Projets/atelier-marketing-ia
ATELIER_COPIE=$PWD/instance/plugin-e2e-essai tests/e2e/atelier/preparer.sh atelier-e2e 3590 54790   # instance jetable, ports 3590 et 54790
```

Le script relie Playwright du socle (`tests/e2e/atelier/node_modules/`, non versionné),
construit une **copie isolée** du plugin (`ATELIER_COPIE`, ici `instance/plugin-e2e-essai/`), lance
l'instance d'essai par `scripts/instance-essai.sh`, installe le plugin depuis la copie, applique
`scripts/bootstrap-organisation.py appliquer --mode reel` (état local isolé dans
`instance/essai-<id>-donnees/`), puis `preparer_agents.py` bascule les agents en `process` déterministes
par l'API de l'instance jetable.

Données des essais qui décident ou diffusent : `preparer_dossier.py` (dossier prêt pour validation),
`preparer_appel.py <URL> propose|diffusee` (appel exact, révocation). Chaque essai consomme son dossier.

Pour un dossier « prêt pour validation humaine » (test de décision) :
`python3 -I tests/e2e/atelier/preparer_dossier.py http://127.0.0.1:3590/api` rejoue le début
du scénario B (vrai moteur, agents de démonstration) et s'arrête avant la décision. Chaque
décision consomme le dossier : relancer ce script avant chaque passage du test.

## Lancer

```bash
node tests/e2e/atelier/node_modules/@playwright/test/cli.js test --config tests/e2e/atelier/playwright.config.ts
node tests/e2e/atelier/captures.mjs http://127.0.0.1:3590 <PRÉFIXE> docs/captures [nom=chemin ...]
```

`ATELIER_CAPTURES_FILTRE=<expression>` ne refait que les vues dont le nom correspond.
Les captures ajustent la hauteur de la fenêtre au contenu (la page de Paperclip défile dans son propre
conteneur : une capture « pleine page » serait tronquée).

Résultats et traces d'échec : `instance/e2e-atelier-resultats/` (non versionné).

## Arrêter

```bash
scripts/instance-essai.sh arreter atelier-e2e 3590 54790
```
