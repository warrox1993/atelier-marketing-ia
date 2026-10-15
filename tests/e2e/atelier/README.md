# Tests de bout en bout de l'interface de l'atelier (lot C)

Contre une instance Paperclip **réelle** (backend, base PostgreSQL embarquée, moteur de
tâches), avec le plugin installé et l'organisation de démonstration. Aucun appel de modèle :
l'entreprise est en mode démonstration. Navigateur : chromium **sans interface** fourni par
le socle (`paperclip/node_modules`, Playwright 1.62.1) ; aucune fenêtre visible.

## Préparer

```bash
cd ~/Projets/atelier-marketing-ia
tests/e2e/atelier/preparer.sh                 # instance atelier-lotc, ports 3140 et 54369
```

Le script relie Playwright du socle (`tests/e2e/atelier/node_modules/`, non versionné),
construit une **copie isolée** du plugin dans `instance/plugin-lotc/` (le `dist/` du dépôt
reste celui du lot A, dont l'instance peut recharger le worker à chaque reconstruction), lance
l'instance d'essai par `scripts/instance-essai.sh`, installe le plugin depuis la copie et
applique `scripts/bootstrap-organisation.py appliquer --mode demonstration`.

Pour un dossier « prêt pour validation humaine » (test de décision) :
`python3 -I tests/e2e/atelier/preparer_dossier.py http://127.0.0.1:3140/api` rejoue le début
du scénario B (vrai moteur, agents de démonstration) et s'arrête avant la décision. Chaque
décision consomme le dossier : relancer ce script avant chaque passage du test.

## Lancer

```bash
node tests/e2e/atelier/node_modules/@playwright/test/cli.js test --config tests/e2e/atelier/playwright.config.ts
node tests/e2e/atelier/captures.mjs http://127.0.0.1:3140 <PRÉFIXE> docs/captures [nom=chemin ...]
```

`ATELIER_CAPTURES_FILTRE=<expression>` ne refait que les vues dont le nom correspond.
Les captures ajustent la hauteur de la fenêtre au contenu (la page de Paperclip défile dans son propre
conteneur : une capture « pleine page » serait tronquée).

Résultats et traces d'échec : `instance/e2e-atelier-resultats/` (non versionné).

## Arrêter

```bash
scripts/instance-essai.sh arreter atelier-lotc 3140 54369
```
