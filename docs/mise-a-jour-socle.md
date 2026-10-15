# Mise à jour du socle Paperclip et retour arrière

Document du lot B, rédigé le 15/10/2026. Socle actuel : tag stable `v2026.1012.0`
(SHA `bba6a45f0d364cfd962ac59b3bdf2426a8222adb`), branche locale `atelier-marketing` = ce tag + 4 patches
(`socle/patches/0001` à `0004`). Les chemins `paperclip/...` ci-dessous sont ceux du socle ; chaque affirmation
cite le fichier et la ligne, ou une mesure faite ce jour.

## 0. Ce qu'il faut savoir avant de commencer

- **Stable seulement.** Les tags locaux contiennent aussi des `canary/` et `nightly/` (`git tag` dans `paperclip/`).
  Règle de travail : pas de bêta pour les outils de travail. Le format stable est `vAAAA.MJJ.P` (`doc/RELEASING.md:21-26`).
  Lister les stables : `git ls-remote --tags origin 'v20*' | sed 's/.*tags\///' | sort -V | tail`. Au 15/10/2026
  le plus récent est `v2026.1012.0` : **il n'y a rien à mettre à jour aujourd'hui** (lecture seule du dépôt amont).
- **Les migrations vont toujours vers l'avant.** `packages/db/src/migrations/` contient 305 fichiers SQL
  (`0000` à `0305`), aucune migration inverse. Revenir à une version plus ancienne du code sur une base déjà
  migrée n'est donc pas supporté : le retour arrière passe par la **restauration d'une sauvegarde faite avant la
  mise à jour** (section 6 et `docs/exploitation.md`, avec son avertissement sur les sauvegardes sans `pg_dump`).
- **Un redémarrage tue les runs en cours** (`process_lost`) : mettre à jour hors des heures de campagne,
  vérifier `SELECT count(*) FROM heartbeat_runs WHERE status = 'running'` d'abord
  (`docs/deploy/dev-plane-restart-hygiene.md:5-19`). Les agents de l'atelier sont en pause par défaut.
- **Un seul serveur par instance** (commentaire de `scripts/lancer-instance.sh`) ; on arrête l'instance avant de
  toucher à `paperclip/`.

## 1. Fichiers qui portent la version

| Fichier | Rôle |
| --- | --- |
| `socle/VERSION` | `DEPOT`, `TAG`, `SHA`, `DATE_COMMIT`, `CANAL`, `BRANCHE_LOCALE` lus par `scripts/preparer-socle.sh` |
| `socle/patches/*.patch` | patches locaux, appliqués dans l'ordre alphabétique avec `git am` |
| `paperclip/` (ignoré par git, `.gitignore`) | clone amont ; la branche `atelier-marketing` porte les patches |
| `plugin-atelier/.paperclip-sdk/*.tgz` et `pnpm-lock.yaml` du plugin | SDK empaqueté depuis le socle (`scripts/preparer-plugin.sh`) ; le lockfile contrôle l'empreinte |

`scripts/preparer-socle.sh` : vérifie que le tag pointe sur le SHA attendu, refuse une copie de travail modifiée,
crée la branche locale sur le tag, applique les patches, puis `pnpm install --frozen-lockfile` et `pnpm build`
(`scripts/preparer-socle.sh:27-65`). Si la branche existe déjà, il exige exactement autant de commits que de
patches (ligne 44) : c'est pourquoi une mise à jour utilise un **nouveau nom de branche**.

## 2. Préparer (réversible)

```bash
cd ~/Projets/atelier-marketing-ia
# a. Sauvegarde complète (docs/exploitation.md, sections 1 et 4) : base, secrets/master.key, companies/, data/storage
cd paperclip && set -a && source ../config/atelier.env && set +a && pnpm db:backup && cd ..
# b. Arrêt de l'instance principale
scripts/arreter-instance.sh
# c. Photo de l'état actuel du socle, pour pouvoir revenir
git -C paperclip branch atelier-marketing-AVANT-<date> atelier-marketing
git -C paperclip rev-parse HEAD                      # à noter : c'est le point de retour
# d. Lire les notes de la nouvelle version : paperclip/releases/vAAAA.MJJ.P.md (workflow : doc/RELEASING.md:336-362)
```

## 3. Rejouer les patches sur le nouveau tag

Les quatre patches sont des commits locaux (`git format-patch`). Procédure :

```bash
cd ~/Projets/atelier-marketing-ia/paperclip
git fetch --tags origin
NOUVEAU=v2026.XXXX.N
SHA="$(git rev-list -n1 "$NOUVEAU")"; echo "$SHA"                       # à reporter dans socle/VERSION
git checkout -b "atelier-marketing-$NOUVEAU" "$NOUVEAU"
git am --3way ../socle/patches/*.patch
```

Cas de conflit : `git am` s'arrête et nomme le fichier. Les points sensibles connus sont ceux que touchent les
patches : `server/src/services/companies.ts` (ordre de suppression `projects` avant `goals`, autour de la ligne 579
au tag actuel), les routes d'agents et de tâches pour les gardes P1/P2, et `server/src/services/heartbeat*` pour le
régulateur de runs et le journal des compétences. Le patch `0004` (cartes de la passerelle marketing, lot L6) touche le catalogue d'applications : `packages/shared/src/app-definitions.generated.ts` (liste des imports),
`packages/shared/src/app-definitions.ts` (`CONNECTABLE_APP_SLUGS`), `doc/connections/tool-method-permission-reviews.json`,
`ui/public/brands/apps/manifest.json`, le compte attendu de `packages/shared/src/app-definitions.test.ts` (59 + 11),
le contrôle HTTPS et `appForConnectionSetup` de `server/src/services/tool-access.ts`, la route de galerie
(`server/src/routes/tool-access.ts`) et `server/src/index.ts`. Si l'amont régénère son catalogue, **ajouter de nouveau
les 11 imports `atelier-*`** à la fin de la liste générée ; le script d'ingestion amont ne connaît pas ces définitions
(il exige un corpus `../../paperclip-content` absent du poste) et les supprimerait. Résoudre, `git add`, `git am --continue`. Si le défaut amont est
corrigé dans la nouvelle version, **supprimer le patch correspondant** au lieu de le forcer (vérifier avec
`bootstrap-organisation.py reinitialiser` sur une instance d'essai : `DELETE /companies/:id` ne doit plus répondre 500).

Une fois les patches appliqués, les régénérer et mettre à jour la version :

```bash
rm ../socle/patches/*.patch
git format-patch "$NOUVEAU"..HEAD -o ../socle/patches
# éditer ../socle/VERSION : TAG, SHA, DATE_COMMIT (git log -1 --format=%cI "$NOUVEAU"), BRANCHE_LOCALE=atelier-marketing-$NOUVEAU
```

**Rejeu avec le patch `0004` (15/10/2026, lot L6)** : arbre de travail jetable `git worktree add --detach … v2026.1012.0`,
`git am socle/patches/*.patch` (0001 à 0004) sans conflit ; empreinte d'arbre obtenue identique à celle de la branche
`atelier-marketing` (`1691e75434451cd495318d823423797b44741cc0`).

**Mesure du rejeu sur le tag actuel (15/10/2026)** : clone local jetable, `git checkout -b essai-rejeu v2026.1012.0`,
`git am --3way socle/patches/*.patch` : les trois patches s'appliquent sans conflit et l'arbre obtenu est
**identique** à celui de `atelier-marketing` (même empreinte d'arbre `0d6707d6cddf0cf0ab1baf34ca3f5287c53d51a4`).
Le rejeu est donc reproductible ; il reste à l'éprouver face à un vrai nouveau tag, qui n'existe pas encore.

## 4. Reconstruire, migrer, tester

```bash
cd ~/Projets/atelier-marketing-ia
scripts/preparer-socle.sh        # installation figée + build du socle (une seule suite lourde à la fois)
scripts/preparer-plugin.sh       # repaquette le SDK, installe, typecheck, tests, build du plugin
```

- Si `pnpm install --frozen-lockfile` échoue parce que le lockfile amont a bougé, l'amont a changé ses
  dépendances : relire le diff de `pnpm-lock.yaml` du tag, ne pas contourner par `--no-frozen-lockfile` sans l'avoir lu.
  Le patch `0001` (resynchronisation du lockfile) est lui-même un contournement d'un défaut de la v2026.1012.0 : le
  rejouer seulement s'il est encore nécessaire.
- Si `preparer-plugin.sh` refuse l'installation figée (« SDK différent du lockfile »), c'est normal après une montée de
  version : relancer une installation non figée **une fois** dans `plugin-atelier/`, vérifier le diff du lockfile,
  le commiter.
- **Migrations de base.** Au démarrage le serveur compare le journal des migrations et applique les migrations en
  attente. Sans terminal interactif il applique automatiquement ; avec un terminal il demande confirmation ;
  `PAPERCLIP_MIGRATION_AUTO_APPLY=true` force l'application, `PAPERCLIP_MIGRATION_PROMPT=never` la refuse
  (`server/src/index.ts:244-300`). Un refus arrête le serveur avec « Refusing to start against a stale schema.
  Run pnpm db:migrate » (`index.ts:293`). Commande manuelle : `pnpm db:migrate` (`package.json:31`). **Toujours après
  la sauvegarde de la section 2** : il n'y a pas de migration inverse.
- Les migrations du plugin (`plugin-atelier/`, schéma `plugin_atelier_*`) sont gérées par le système de plugins au
  chargement (`doc/DATABASE.md:412-414`).

Tests dans cet ordre (aucun appel de modèle) :

```bash
scripts/tests-serveur.sh                                  # P1, P2, régulateur, compétences, suppression (patches)
scripts/tests-serveur.sh server/src/__tests__/<fichiers natifs autour du patch>   # comme dans REPRISE.md
(cd plugin-atelier && pnpm typecheck && pnpm test && pnpm build)
python3 -I scripts/verifier-organisation.py
eval "$(scripts/bootstrap-instance-test.sh env)"; scripts/bootstrap-instance-test.sh demarrer   # en arrière-plan
scripts/bootstrap-tests.sh --instance --remise-a-zero     # sur l'instance d'essai
python3 -I scripts/scenarios/atelier_scenarios.py B "$ATELIER_API"   # puis C, D, F, S, J (voir REPRISE.md)
scripts/bootstrap-instance-test.sh arreter
```

Attendu : les mêmes nombres que `REPRISE.md` (19 tests d'atelier côté serveur, 178 côté plugin, scénarios B à S
sans écart). Un écart qui n'existait pas avant est un défaut de la montée de version, pas un test à assouplir.

## 5. Basculer l'instance principale

```bash
git -C paperclip checkout atelier-marketing-$NOUVEAU
scripts/lancer-instance.sh      # applique les migrations, puis sert (premier plan ; Ctrl+C pour arrêter)
python3 -I scripts/bootstrap-organisation.py etat && python3 -I scripts/bootstrap-organisation.py appliquer
curl -s localhost:3100/api/health
```

`appliquer` doit afficher `Import natif : non (déjà à jour)` ou rejouer proprement l'import, et la deuxième passe
`Écritures API totales : 0`. Puis `git add socle/ && git commit` (commit local ; rien n'est poussé). Le plugin
nécessite un rechargement du worker après un build : `POST /api/plugins/atelier.marketing-ia/disable` puis `/enable`
(`REPRISE.md`, « Commandes utiles »).

## 6. Revenir en arrière

| Situation | Action |
| --- | --- |
| Échec avant d'avoir lancé le serveur (rejeu, build, tests) | `git -C paperclip checkout atelier-marketing` (branche d'avant) ; supprimer la branche `atelier-marketing-<nouveau>` ; `git checkout -- socle/` ; la base n'a pas été touchée |
| Serveur lancé, migrations appliquées, problème constaté | arrêter ; **restaurer la base et `companies/`** de la section 2 (procédure `docs/exploitation.md`, section 4) ; `git -C paperclip checkout atelier-marketing` ; `git checkout -- socle/` ; `scripts/preparer-socle.sh` ; relancer |
| Base restaurée avec le moteur JavaScript (pas de `pg_dump`) | restauration **non fidèle** (contraintes perdues, `docs/exploitation.md` 3.3) : préférer, si l'on n'a pas de données de campagne à garder, `bootstrap-organisation.py reinitialiser` puis `appliquer` sur une base neuve du code d'avant |
| Patch `0002` et `0003` à retirer (dernier recours) | `git -C paperclip reset --hard eacb9dcaa` (ancienne méthode de `REPRISE.md`, destructive : seulement sur décision de l'opérateur) |

Les versions amont ne se « dé-publient » pas ; leur propre retour arrière consiste à pointer vers un stable précédent
et corriger vers l'avant (`doc/RELEASING.md:407-418`) : même logique ici, avec la sauvegarde comme filet.

## 7. Ce que cette mise à jour ne couvre pas

- Le plugin utilise le système de plugins de Paperclip, « surface alpha » selon l'amont (utilisé par choix explicite de l'opérateur) : une montée de version peut casser le SDK ; les tests de la section 4 existent pour le voir.
- Le SHA et la date de `socle/VERSION` doivent être relus avant d'être commités : `preparer-socle.sh` refuse un tag qui ne
  pointe pas sur le SHA attendu (`preparer-socle.sh:27-31`), ce qui protège d'un tag déplacé.
