# Atelier Marketing IA

Usine d'agents marketing construite sur Paperclip (plan de contrôle d'agents), avec Claude Code
pour l'exécution réelle. Projet local, rien n'est publié. État réel et prochaine étape :
`REPRISE.md`.

Ce que fait l'atelier : une campagne (brief) devient des exigences numérotées, des tâches
confiées à des agents, des livrables révisés, relus par trois contrôleurs indépendants puis par
une porte déterministe côté serveur ; seul un livrable qui a passé tous les contrôles arrive à
l'humain, qui approuve, demande une correction ou rejette. Rien n'est diffusé sans approbation
humaine, et aucun connecteur de diffusion n'existe encore : la diffusion reste
« préparée », jamais envoyée.

## 1. Installation propre (Ubuntu, Node.js 24, pnpm 9 par corepack)

```bash
cd ~/Projets/atelier-marketing-ia
cp config/atelier.env.example config/atelier.env   # adapter PAPERCLIP_HOME si le dépôt est ailleurs
scripts/verifier-config.sh                         # validation : boucle locale, télémétrie coupée, aucun secret
scripts/preparer-socle.sh     # clone Paperclip v2026.1012.0, vérifie le SHA, applique socle/patches/, installe, construit
scripts/preparer-plugin.sh    # SDK empaqueté, installation figée, typecheck, tests, build du plugin
```

Prérequis système vérifiés : `pg_dump` et `psql` 18 (paquet Ubuntu `postgresql-client-18`)
pour des sauvegardes fidèles (`docs/exploitation.md` §3.3) ; Python 3 avec `python3-yaml` pour
l'export d'organisation seulement.

## 2. Fonctionnement réel (plus de mode démonstration)

Décision de l'opérateur du 15/10/2026 : **tout est réel**. Il n'y a plus de mode démonstration : un
connecteur qui n'est pas branché est affiché « non connecté », sans donnée fictive ni résultat
simulé. Les agents sont les vrais agents Claude (section 3), importés en pause et réveillés par
décision humaine. Le bootstrap n'accepte plus que le mode `reel` (l'option `--reel` est tolérée
sans effet, avec un avertissement).

Les anciens scripts de démonstration (`scripts/demonstration.sh`, `scripts/demo/`,
`organisation/demo/`) sont conservés en attente de retrait : ne plus les utiliser.

Scénarios rejouables contre une instance (résultats bruts dans `instance/scenarios/`) :

```bash
python3 -I scripts/scenarios/atelier_scenarios.py B http://127.0.0.1:3100/api   # B C D F G H K S J, ou « tous »
```

Le scénario A (parcours complet avec connexions créées par les cartes de galerie) exige une passerelle
marketing en démonstration et une instance d'essai qui la connaît :

```bash
(cd passerelle && PASSERELLE_PORT=3391 PASSERELLE_SERVICES_REELS=osm,liens PASSERELLE_ETAT=/tmp/oauth-local.json node dist/src/demarrer.js) &
PAPERCLIP_ATELIER_GATEWAY_URL=http://127.0.0.1:3391 scripts/instance-essai.sh demarrer atelier-lotz 3320 54520 &
tests/e2e/atelier/preparer.sh atelier-lotz 3320 54520
python3 -I scripts/scenarios/atelier_scenarios.py A http://127.0.0.1:3320/api
```

## 2 bis. Connecter un service marketing

Rubrique Paramètres de l'atelier, tableau « Services marketing » : « Connecter » ouvre la carte du service
dans la galerie native de Paperclip (Search Console, Analytics, Ads, fiche d'établissement, Facebook,
Instagram, LinkedIn, HubSpot, Pipedrive, Odoo, Teamleader). Les actions qui publient ou modifient y
arrivent en « Ask first » (accord humain natif), en plus de l'approbation de l'atelier. Ensuite, relancer
`python3 -I scripts/bootstrap-organisation.py appliquer` : il réserve la connexion aux seuls rôles qui
en ont besoin (`organisation/registre/agents.json`, champ `connexions`) et bloque les écritures d'un rôle
en lecture ; `bootstrap-organisation.py etat` signale une connexion encore ouverte à tous.

## 3. Activer le mode réel (à faire par l'opérateur)

```bash
claude setup-token                                                 # dans un terminal de l'opérateur
python3 -I scripts/bootstrap-organisation.py appliquer             # liaison réelle (claude_local) des 10 agents
python3 -I scripts/bootstrap-organisation.py jeton --confirmer     # coller le jeton : secret natif chiffré
python3 -I scripts/bootstrap-organisation.py test-reel             # à blanc : agent, modèle, jeton
python3 -I scripts/bootstrap-organisation.py test-reel --confirmer # un appel réel minimal (non exécuté à ce jour)
python3 -I scripts/bootstrap-organisation.py cles --confirmer      # clés de signature (preuves d'approbation, réponses de la passerelle)
```

La commande `cles` génère les deux paires Ed25519, range la clé privée du plugin comme secret natif, écrit les fichiers 0600 sous
`instance/cles/` et `instance/passerelle.env` (à charger avant de relancer la passerelle) ; sans `--confirmer`, elle affiche l'état.
Rotation, perte et sauvegarde des clés : `docs/exploitation.md` §11.

Les agents restent en pause : les réveiller est une décision humaine. Avant un vrai client :
`docs/checklist-usage-reel.md`.

## 4. Arrêt et reprise

```bash
scripts/arreter-instance.sh               # SIGTERM au bon PID, jamais pkill -f
scripts/lancer-instance.sh                # relance au premier plan ; les données sont conservées
```

Après un arrêt pendant un run, Paperclip marque le run `interrupted` et bloque la tâche sans
rejeu automatique : la réconciliation se fait par l'humain (fiche native de la tâche) ; le
producteur reprend alors à l'étape suivante sans double effet (scénario E).

## 5. Dépannage

| Symptôme | Cause et remède |
| --- | --- |
| `Configuration refusée` | lire les écarts de `scripts/verifier-config.sh` |
| `Le port 3100 est déjà utilisé` | instance déjà lancée (`ss -ltnp 'sport = :3100'`) |
| Le plugin ne reflète pas une reconstruction | recharger le worker : `curl -X POST http://127.0.0.1:3100/api/plugins/atelier.marketing-ia/disable` puis `/enable` |
| Une tâche reste « décision humaine requise » | cycles de correction épuisés : dossier > « Relancer la correction » (au moins un levier) |
| Erreur `[elevation_refusee]` | action réservée à l'humain appelée par un agent : refus voulu |
| Sauvegarde peu fidèle | vérifier `which pg_dump` (sinon moteur JavaScript, `docs/exploitation.md` §3.3) |
| Agent réel muet | jeton absent ou agent en pause : `bootstrap-organisation.py test-reel` |

## 6. Documents

| Besoin | Document |
| --- | --- |
| Architecture, version du socle, limites | `docs/architecture.md`, `docs/note-technique-2026-10-15.md` |
| Contrats (routes, schémas, interface) | `docs/contrats.md` |
| États, sorties, revues, approbations, relances | `docs/dictionnaire-etats.md` |
| Agents, compétences, permissions | `docs/guide-agents-competences.md` |
| Intégrations : réel testé, non testé, absent | `docs/integrations.md` |
| Exploitation : sauvegarde, restauration, rétention, budgets, journaux | `docs/exploitation.md` |
| Résultats des tests exécutés | `docs/resultats-tests.md` |
| Matrice de traçabilité du cahier (§0 à §19) | `docs/tracabilite.md` |
| Checklist avant utilisation réelle | `docs/checklist-usage-reel.md` |
| Mise à jour du socle, évolution du déploiement | `docs/mise-a-jour-socle.md`, `docs/evolution-deploiement.md` |
| Usine d'agents : 28 services, matrice des échanges, compétences, mise en place chez un client | `docs/usine-services.md` |

`paperclip/` (clone amont) et `instance/` (données) ne sont pas versionnés ici. Droits :
tous droits réservés (`LICENSE`) ; les correctifs et extraits issus de Paperclip restent sous
sa licence MIT (`NOTICE`, `socle/patches/LICENSE-Paperclip`).

## 7. Publication

`scripts/publier.sh` prépare la version publique : il met à jour la branche locale
`publication`, dont chaque commit a pour arbre l'état nettoyé de `main` et pour seul parent le
commit précédent de `publication` (le premier est orphelin : l'historique détaillé de `main`
reste local). Il ne pousse jamais : il affiche la commande `git push` à lancer.

```bash
scripts/publier.sh              # contrôle puis crée le commit (ou « Rien à publier »)
scripts/publier.sh --a-blanc    # contrôle seulement, sans rien écrire
```

Le script travaille sur un export temporaire de `main` (jamais sur la copie de travail) :

1. il retire les passages balisés comme privés dans les fichiers texte (un commentaire HTML
   `prive:debut` ouvre le passage, `prive:fin` le ferme ; sur des lignes entières ou en ligne) ;
2. il applique les remplacements de `scripts/publication/regles.txt` (motif, tabulation,
   remplacement) : adresse e-mail personnelle vers l'adresse noreply GitHub, chemins personnels
   vers `~`, nom de la machine de développement ;
3. il refuse de publier (code de sortie 1, aucun commit) si gitleaks trouve un secret, si le nom
   du client apparaît (hors empreintes de lockfiles), si une adresse ou un chemin personnel
   subsiste, si un fichier suivi est ignoré par `.gitignore` ou si un balisage est mal apparié ;
4. il crée le commit avec l'identité noreply, sans toucher à la branche courante.

Seul l'état de `main` est publié : valider (commit) avant de lancer le script.

