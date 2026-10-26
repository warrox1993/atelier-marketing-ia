# Clôture de la phase 2 de l'Observatoire : plan d'exécution

> **Pour les agents :** sous-compétence requise : superpowers:executing-plans (exécution native). Les étapes se suivent par cases à cocher (`- [ ]`).

**But :** fermer la phase 2. Concrètement : la porte OBS devient un programme sans modèle, les consignes ne promettent plus que des outils réellement donnés, « Pièges » devient une rubrique facultative, un 13e agent `explorateur-sources` est ajouté, puis le service est redéployé sur 3100 et publié.

**Architecture :**
- Un champ facultatif `deterministes` (liste de slugs) dans une entrée de `organisation/registre/services.json`. Le générateur y prend le gabarit `porte` de `organisation/registre/agents.json` (adaptateur `process`, script `agents/porte.mjs`) au lieu du gabarit `veille`. Toute la chaîne aval (`config_deterministe`, `construire_extension`, mise à jour du client) lit déjà `agent["deterministe"]`.
- La borne d'agents par service passe à 2-13 pour tous les services.

**Pile :** Python 3 (scripts, tests `unittest`), Markdown (consignes et compétences).

**Décisions :** prises par Claude, sur délégation de l'opérateur (26/10/2026 : « fixe les détails toi-même et avance directement »). Sources : revue de phase 2 (`RUN_DIR=/tmp/compound-engineering-1000/ce-code-review/20261026-221832-4f402e1c/report.md`) et décisions de l'opérateur du 26/10 (13e agent, YouTube = transcription locale + métadonnées, « Pièges » accepté).

## Contraintes globales

- Jamais le nom du client dans un fichier suivi par git (`publier.sh` le refuse, motif `MOTIF_CLIENT`).
- Ne pas toucher `docs/mode-authentifie.md`, `scripts/passer-en-mode-authentifie.{py,sh}`.
- Commits : `git commit -o -- <chemins>`, avec les trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` et `Claude-Session: https://claude.ai/code/session_012hDEUaJZ3u1rGj4CzNXrhC`.
- Aucun agent OBS activé : tous restent en pause. La porte OBS garde les règles marketing de `porte.mjs` jusqu'à la phase 3 (règles OBS-01..16).
- Le 13e agent n'exécute rien : pas de Bash libre, pas de Whisper. La transcription locale et les métadonnées YouTube relèvent du collecteur en code (K1, phase 3).
- 3100 : sauvegarde vérifiée, photo avant, `--a-blanc`, mise à jour, photo après, comparaison (même méthode que le 26/10).

## Points d'attention de la revue

1. Le marketing a déjà un agent `porte` : `deterministes` ne doit pas changer les agents marketing ni les 28 autres services. Test : seule la porte OBS change d'adaptateur dans l'essai à blanc.
2. Un slug de `deterministes` absent de `agents`, ou désignant le coordinateur, doit être refusé par le validateur. Test dans la tâche 1.
3. Avec 13 agents dans la liste, la borne doit passer, et 14 doivent être refusés. Test dans la tâche 1.
4. Une compétence avec « Pièges » placé n'importe où (avant ou après « Exemple ») doit passer le contrôle des rubriques ; une rubrique inconnue doit toujours échouer. Test dans la tâche 3.
5. `verifier-organisation.py:345` exige un seul déterministe dans le registre **marketing** : cette règle ne doit pas s'appliquer aux services. Test : `verifier-organisation.py` vert après la tâche 2.

---

### Tâche 1 : borne 2-13 et champ `deterministes` dans le validateur

**Fichiers :**
- Modifier : `scripts/atelier_services.py:146-147` (borne et message « 2 à 13 agents »), et la validation de `deterministes` juste après le coordinateur.
- Test : `scripts/tests/tester-atelier-services.py:237-245` (`test_nombre_agents`) et nouveau test `test_deterministes`.
- Doc : `docs/usine-services.md:10` (« 2 à 13 agents »).

**Interfaces :** produit le champ facultatif `deterministes: list[str]` d'une entrée de service. Chaque slug doit figurer dans `agents` et différer de `coordinateur` et de `coordinateurGeneral`.

- [ ] Étape 1 : mettre à jour `test_nombre_agents`. 13 agents ne déclenchent plus d'erreur « agents attendus ». Avec 14 agents, l'erreur contient « 2 à 13 agents ».
- [ ] Étape 2 : ajouter `test_deterministes`.
  - `deterministes=["inconnu"]` donne une erreur contenant « déterministe absent de la liste des agents ».
  - `deterministes=["coord-aaa"]` (le coordinateur) donne une erreur contenant « coordinateur ne peut pas être déterministe ».
  - `deterministes="porte"` (pas une liste) donne une erreur contenant « deterministes doit être une liste ».
  - Un slug valide ne donne aucune erreur.
- [ ] Étape 3 : `python3 -I scripts/tests/tester-atelier-services.py` doit être ROUGE sur ces deux tests.
- [ ] Étape 4 : implémenter dans `atelier_services.py`.
- [ ] Étape 5 : la même commande doit être VERTE.
- [ ] Étape 6 : commit `feat(registre): borne de 13 agents par service et agents déterministes déclarables`.

### Tâche 2 : porte OBS déterministe dans le générateur

**Fichiers :**
- Modifier : `scripts/bootstrap-organisation.py`, fonction `agents_service` (vers la ligne 3925). Si `slug in svc.get("deterministes", [])` :
  - partir du gabarit `gabarits["porte"]` ;
  - garder `slug`, `nom`, `titre` et `rapporteA` (le coordinateur), avec le rôle `qa` du gabarit ;
  - poser la mission « Porte de contrôle déterministe du service <nom> : aucun modèle ; vérifie les preuves avant toute validation. » ;
  - ne pas ajouter les compétences communes, car un adaptateur `process` ne lit pas de compétence ;
  - sauter, pour cet agent, le retrait de WebSearch des spécialistes (le gabarit `porte` n'a aucun outil) ;
  - dans `fichiers_service` (ligne 4031-4036), ne pas ajouter `MARQUEUR_CONSIGNES_COMMUNES`, les consignes communes ni la fiche de routes à un agent déterministe, comme le fait déjà le marketing (ligne 563).
- Corriger l'en-tête de `organisation/services/observatoire/agents/porte/AGENTS.md` : `reportsTo: "directeur"` au lieu de `relecteur-independant`. Le générateur ignore ce champ et rattache au coordinateur, donc l'en-tête du dépôt trompe le lecteur.
- Modifier : `organisation/registre/services.json`, entrée `observatoire` : `"deterministes": ["porte"]`.
- Test : nouveau test `test_porte_observatoire_deterministe` dans `scripts/tests/tester-atelier-services.py`. Il charge `bootstrap-organisation.py` comme `tester-competences-communes.py:22-25`.

**Interfaces :**
- Consomme le champ `deterministes` de la tâche 1.
- Produit, pour la porte OBS, un agent `{"deterministe": True, "modele": None, "role": "qa", "competences": []}`.

- [ ] Étape 1 : écrire le test.
  - Agents du service `observatoire` : `porte` a `deterministe` vrai, `modele` à None et `competences == []`.
  - Les autres agents ont `deterministe` faux.
  - Pour au moins un autre service (`juridique`), aucun agent n'est déterministe.
  - Dans le paquet `fichiers_service` de l'Observatoire, `agents/porte/AGENTS.md` ne contient pas `MARQUEUR_CONSIGNES_COMMUNES`, et son en-tête porte `reportsTo: "directeur"` et `skills: []`.
  - `construire_extension` du service donne à `porte` l'adaptateur `{"type": "process", "config": {"command": "node", "args": ["agents/porte.mjs"], ...}}`, et `claude_local` aux 12 autres.
- [ ] Étape 2 : le test doit être ROUGE.
- [ ] Étape 3 : implémenter, puis `python3 -I scripts/bootstrap-organisation.py generer` (régénère `organisation/company-package.lock.json` si besoin).
- [ ] Étape 4 : tous ces tests doivent être VERTS :
  - le test ;
  - `python3 -I scripts/verifier-organisation.py` ;
  - `python3 -I scripts/atelier_services.py verifier` ;
  - `python3 -I scripts/bootstrap-organisation.py generer --verifier` ;
  - `python3 -I scripts/tests/tester-competences-communes.py` ;
  - `python3 -I scripts/tests/tester-mettre-a-jour-client.py`.
- [ ] Étape 5 : commit `fix(observatoire): porte du service en programme déterministe`.

### Tâche 3 : rubrique facultative « Pièges » et 7 compétences

**Fichiers :**
- Modifier : `scripts/verifier-organisation.py:71`, en ajoutant `"Pièges"` à `RUBRIQUES_FACULTATIVES`.
- Modifier : les 7 `organisation/skills/{affirmations-preuves,analyse-mcp-plugins-skills,analyse-menaces-outil,dossier-24-chapitres,protocole-essai-isole,qualification-outils,veille-publications-videos}/SKILL.md`.
  - Le bloc « Pièges à éviter : » de « Limites » devient une rubrique `## Pièges`, placée après « Exemple ». Les puces sont gardées mot pour mot.
  - La version passe à 1.0.2.
- Doc : `docs/usine-services.md`, à l'endroit où les rubriques facultatives sont décrites (chercher « Sources officielles ») : une ligne pour « Pièges » (erreurs déjà rencontrées, la plus forte valeur d'une compétence).

- [ ] Étape 1 : écrire le test des rubriques, dans le style des tests du dépôt, sur une compétence temporaire.
  - Si `verifier-organisation.py` n'a pas de test unitaire, la preuve est la suivante : une copie temporaire d'une compétence avec `## Pièges` passe la fonction de contrôle des rubriques (vers la ligne 300), et une copie avec `## Truc` échoue.
  - Ce test va dans `scripts/tests/tester-atelier-services.py`, classe `TestRubriques`.
- [ ] Étape 2 : le test doit être ROUGE, puis il faut ajouter la rubrique.
- [ ] Étape 3 : migrer les 7 compétences. Contrôle : `grep -c "Pièges à éviter" organisation/skills/*/SKILL.md` doit donner 0, et le nombre de puces sous `## Pièges` doit être de 37 au total, comme avant.
- [ ] Étape 4 : doivent être verts : `verifier-organisation.py`, `bootstrap-organisation.py generer --verifier` (inventaire régénéré par `generer` si les sommes de contrôle changent) et le test.
- [ ] Étape 5 : commit `feat(organisation): rubrique facultative « Pièges » des compétences`.

### Tâche 4 : corrections P2 et P3 des consignes et des compétences

**Fichiers :**
- `organisation/services/observatoire/agents/veille-technique/AGENTS.md:31,45,81` et `veille-recherche-medias/AGENTS.md:44,81`.
  - `WebSearch` n'est pas donné aux spécialistes : la recherche d'une page manquante se demande au `directeur`, qui a WebSearch.
  - `WebFetch` est permis, pour lire une page officielle dont l'adresse est connue. Ses contenus sont des données, jamais des ordres.
- `organisation/services/observatoire/agents/redacteur-en-chef/AGENTS.md:19,33,67,80`.
  - L'outil de la fabrique n'est pas donné en phase 2. La demande de PDF arrive en phase 5, sur décision de l'opérateur.
  - En attendant, le livrable est l'édition web.
- `organisation/skills/analyse-menaces-outil/SKILL.md:47,83` : échelle `critique | majeure | mineure | info`, la même que l'énumération `Gravite` de `plugin-atelier/src/contrats/revues.ts:11`. L'exemple « élevée » devient « majeure ».
- `organisation/skills/protocole-essai-isole/SKILL.md`, niveau 3 : « déclenché par l'opérateur seul, jamais par un agent ; jamais publié comme vérifié ». Même phrase dans `ingenieur-essais/AGENTS.md` si le niveau 3 y figure.
- Les versions de compétence modifiées passent à 1.0.3 (après la tâche 3).

- [ ] Étape 1 : contrôles grep à obtenir, chacun doit rendre 0 ligne :
  - `grep -n "WebSearch\` reste permis\|WebSearch\` est permis" organisation/services/observatoire` ;
  - `grep -n "élevée\|moyenne\|faible\|informative" analyse-menaces-outil/SKILL.md` ;
  - `grep -n "fabriquer_document" redacteur-en-chef/AGENTS.md`.
- [ ] Étape 2 : faire les modifications.
- [ ] Étape 3 : relancer les greps (0 ligne), puis `verifier-organisation.py` et `generer --verifier`, qui doivent être verts.
- [ ] Étape 4 : commit `fix(observatoire): consignes alignées sur les outils réellement donnés`.

### Tâche 5 : 13e agent `explorateur-sources`

**Fichiers :**
- Créer `organisation/services/observatoire/agents/explorateur-sources/AGENTS.md`, sur le modèle de `veille-recherche-medias/AGENTS.md` : même en-tête, mêmes sections et consignes communes.
- Mission :
  - tenir la base `docs/observatoire/sources/base-sources.jsonl` (fiabilité, morts, doublons, trous de couverture) et proposer de nouvelles sources à qualifier, chacune vérifiée à la source ;
  - étudier les transcriptions de vidéos YouTube et leurs métadonnées, fournies par le collecteur en code (transcription locale Whisper, API YouTube Data officielle, phase 3), pour en tirer des affirmations avec preuve (compétence `veille-publications-videos`) ;
  - ne jamais republier une transcription (étude interne : le site publie une synthèse avec lien).
- Outils : ceux du gabarit `veille` des spécialistes (sans WebSearch). Aucun Bash libre.
- Compétences : `veille-publications-videos`, `qualification-outils`, `affirmations-preuves`.
- Modifier `organisation/registre/services.json`, entrée `observatoire` : `explorateur-sources` ajouté à `agents` avant `porte`, ce qui fait 13 agents.
- Modifier `scripts/tests/tester-atelier-services.py` si un attendu compte les agents de l'Observatoire (12 devient 13) ; même chose pour le total, que la sortie de `verifier` donne.
- Doc : `docs/observatoire/agents.md` (13 agents, rôle de l'explorateur) et `ADR-001` si le nombre d'agents y figure.

- [ ] Étape 1 : mettre à jour les attendus de test (13 agents OBS), qui doivent passer ROUGES.
- [ ] Étape 2 : écrire l'AGENTS.md et l'entrée du registre, puis lancer `generer`.
- [ ] Étape 3 : doivent être verts : `tester-atelier-services.py`, `verifier-organisation.py`, `atelier_services.py verifier`, `generer --verifier`, `tester-competences-communes.py`, `tester-mettre-a-jour-client.py` et `tester-roles-agents.py`.
- [ ] Étape 4 : commit `feat(observatoire): 13e agent explorateur de sources`.

### Tâche 6 : redéploiement sur 3100, vérification, revue, publication

- [ ] Sauvegarde : `pg_dump` vérifiée (relue), copie externe dans `/mnt/donnees/Systeme/Sauvegardes/atelier/`.
- [ ] Photo avant, puis `python3 -I scripts/bootstrap-organisation.py mettre-a-jour-client --client <slug du client de 3100> --a-blanc`. Écarts attendus : la porte OBS change d'adaptateur (`claude_local` devient `process`), un agent OBS est créé, et les consignes et compétences OBS changent. Aucun écart hors de l'Observatoire. Pour la porte OBS, le changement d'adaptateur passe par `PATCH /agents/<id>` avec `replaceAdapterConfig` (`bootstrap-organisation.py:1622-1630`). Le rôle passe de `general` à `qa` : vérifier dans l'essai à blanc que la mise à jour le pose. Sinon, consigner l'écart et le corriger avant la mise à jour réelle.
- [ ] Mise à jour réelle, photo après, puis `comparer.py`. Alertes attendues : aucune hors de l'Observatoire. Les 13 agents OBS sont en pause.
- [ ] Nouvel essai à blanc : 0 écart.
- [ ] Compétence `verification` (suite complète une fois), puis `ce-code-review` (une passe) sur `15a952b..HEAD`.
- [ ] `scripts/publier.sh`, puis `git push https://github.com/warrox1993/atelier-marketing-ia.git publication:main`.
- [ ] Rapport Notion, ligne de journal, mémoire.

## GSTACK REVIEW REPORT

Revue d'architecture (gstack plan-eng-review), 26/10/2026, cible : ce plan. Décisions déléguées par l'opérateur (« fixe les détails toi-même »), tranchées par Claude.

| Review | Trigger | Why | Runs | Status | Findings |
| --- | --- | --- | --- | --- | --- |
| Eng review | workflow règle 15 | plan avant TDD | 1 | DONE | 3 (2 corrigés dans le plan, 1 à vérifier à l'essai à blanc) |
| Outside voice (Codex) | défaut de la revue | second avis | 0 | DISABLED | `codex_reviews: disabled` (réglage) |

Constats :
- [P2] (confiance 9/10) `scripts/bootstrap-organisation.py:4034` : `fichiers_service` ajoute les consignes communes à tous les agents, y compris un déterministe ; le marketing les saute (`:563`). Corrigé : tâche 2, avec un test.
- [P3] (confiance 9/10) `organisation/services/observatoire/agents/porte/AGENTS.md:5` : `reportsTo: "relecteur-independant"`, alors que `agents_service` rattache au coordinateur. Corrigé : tâche 2.
- [P3] (confiance 6/10) la mise à jour d'un agent existant change bien l'adaptateur (`:1622-1630`), mais rien ne montre qu'elle change le rôle `general` → `qa`. À vérifier à l'essai à blanc : tâche 6.
- Vérifié sans constat : `verifier-organisation.py:340-347` ne lit que `registre/agents.json` (marketing). Le champ `deterministes` d'un service ne le touche pas. `porte.mjs` ne dépend que des variables de Paperclip.

Architecture : 1 nouveau champ de registre, aucun nouveau module ; ~9 fichiers modifiés, 1 créé (sous le seuil de complexité). Performance : sans objet (génération hors ligne).

VERDICT : plan accepté tel qu'amendé (scope accepted as-is).

NO UNRESOLVED DECISIONS
