# Déploiement de la phase 3 de l'Observatoire sur l'instance 3100

Ce que le déploiement change : plugin construit depuis le commit retenu (migrations 022, 023 et 024 du plugin, module
`src/serveur/observatoire/`, routes `obs.*`, règles OBS-01 à OBS-16 de la porte), consignes des 13 agents de l'Observatoire,
puis déclaration de l'entreprise Observatoire au plugin. Les 28 autres services ne doivent pas bouger.

Le plugin servi par 3100 date du 24/10 (`f10bdbd`, 21 migrations de plugin). Le déploiement apporte donc aussi les
11 commits de `plugin-atelier/` entre `f10bdbd` et `dba8bf4` : migration 022, correctifs de la fabrique, dépendances.
La revue de sécurité porte sur `git diff f10bdbd <commit> -- plugin-atelier` en plus du lot Observatoire.

## Répétition du 27/10/2026 (instance d'essai `atelier-ph3`, ports 3121 et 54351)

- Commit répété : `1bbfb9d`. Base : dump de 3100 rejoué en strict, avec les mêmes comptes de lignes sur les 324 tables.
- Photo de l'essai, après le passage au plugin du commit répété : identique à la photo de 3100 (0 écart, 29 entreprises,
  233 agents dont 23 actifs, 3 routines en pause, 32 tâches).
- Migrations 022 et 023 appliquées, 9 tables `obs_*` créées.
- `mettre-a-jour-client` à blanc : code 0, 28 services à 0 écart, 13 écarts sur l'Observatoire (empreintes).
- `mettre-a-jour-client` réel : code 0, « Import natif : oui » une seule fois (Observatoire), « non (déjà à jour) » 28 fois.
  Photo après : seuls les 13 agents de l'Observatoire changent (`metadata.atelier.bootstrap`, `AGENTS.md` pour 12 d'entre eux),
  plus le « Gardien des connexions » du marketing, dont l'empreinte contient l'adresse de l'API (port 3121 sur l'essai).
  Sur 3100, l'adresse ne change pas : les photos du 26/10 montrent la même empreinte avant et après.
- `declarer-services.py` : 29 entreprises confirmées, 0 flux retiré, 56 flux ajoutés (tous avec l'Observatoire).
- Routes : `POST obs/publications/a-exporter` (corps `{companyId}`) répond 200 pour l'Observatoire et 403 `acces_refuse` pour le marketing
  (même refus sur `POST obs/projets` et `POST obs/publications`).
- **Défaut corrigé (commit bf2cf16)** : `obs.projet.declarer` et `obs.publications.marquer` acceptent `companyId` dans le corps
  s'il est celui de la requête (sinon refus). Vérifié le 27/10 sur l'essai `atelier-ph4` : `POST obs/projets` avec `companyId`
  répond 201, sans lui 400 « Unable to resolve company for plugin API route ».

## Répétition du 27/10/2026, seconde (instance d'essai `atelier-ph4`, ports 3122 et 54352)

- Commit répété : `dfe9390` (plugin reconstruit, migrations 022 à 024 `applied`, colonne `injections_signalees` présente). Résultat : toutes les étapes passent.
- Photo avant/après : alertes aucune ; seuls les 13 agents de l'Observatoire changent (`metadata.atelier`, `AGENTS.md` pour 3) ; `declarer-services.py` : 0 flux retiré, 0 ajouté.
- Fumée des routes : `POST obs/projets` 201, collecte 200, instantané `nonFiable: true` avec `consigne` et `injectionsSignalees`, projet sans source 409 `obs_projet_sans_source`, `a-exporter` 200 (Observatoire) et 403 (marketing), `GET` 404.
- Doc corrigée : la requête des migrations de la section 6 ne rendait rien (la clé est le nom du fichier), les chemins de la section 6 visaient 3100 ou `instance/`.

## Répéter sur une instance d'essai (avant tout passage sur 3100)

**Avertissement : sans les deux exports ci-dessous, `mettre-a-jour-client` et `declarer-services.py` visent l'instance 3100 par
défaut** (adresse lue dans `config/atelier.env`, données locales dans `instance/`). Une répétition qui oublie l'un d'eux écrit sur 3100.

```bash
cd ~/Projets/atelier-marketing-ia
export ATELIER_API=http://127.0.0.1:<port>/api                      # port HTTP de l'instance d'essai, jamais 3100
export ATELIER_DONNEES_LOCALES=<dossier de l'instance d'essai>      # données locales isolées (jamais instance/)
echo "$ATELIER_API" "$ATELIER_DONNEES_LOCALES"                      # relire les deux valeurs avant toute commande
```

1. Créer et démarrer l'instance (premier plan, donc dans un terminal ou en arrière-plan ; identifiant `atelier-<suffixe>`, jamais
   `atelier`) : `scripts/instance-essai.sh demarrer <id> <port> <port_pg>`. Arrêt : `scripts/instance-essai.sh arreter <id> <port> <port_pg>`.
   Les données sont dans `instance/instances/<id>/`. Pour une base identique à 3100, rejouer le dump de la section 1 dans cette base.
2. Construire le plugin : `(cd plugin-atelier && node esbuild.config.mjs)`.
3. Le servir depuis un dossier **hors de `instance/plugin-jb`** (celui de 3100) : copier `dist/`, `migrations/` et `package.json`
   de `plugin-atelier/` dans un dossier propre à l'essai, puis installer le plugin sur l'essai depuis ce dossier (`POST /plugins/install`
   sur `$ATELIER_API`, méthode de `docs/resultats-tests.md`, instance `atelier-cles`).
   ```bash
   E=<dossier du plugin d'essai>; mkdir -p "$E"
   rsync -a --delete plugin-atelier/dist/ "$E/dist/" && rsync -a --delete plugin-atelier/migrations/ "$E/migrations/"
   command cp -f plugin-atelier/package.json "$E/package.json"
   ```
   **Ne jamais utiliser `scripts/deployer.sh` pour l'essai** : il ne vise que 3100 ou toutes les instances, et il reconstruit
   l'interface du socle partagé.
4. Avec les deux exports en place, rejouer les sections 4 et 5 (`mettre-a-jour-client`, `declarer-services.py`) puis les contrôles
   de la section 6, en visant l'essai (`$A` = `$ATELIER_API` sans `/api`, plus `/plugins/atelier.marketing-ia/api`).

Pour redéployer sur un essai déjà installé, qui sert le plugin depuis un dossier propre : reconstruire, `rsync` vers ce dossier, puis
`arreter` et `demarrer` (en arrière-plan : `setsid nohup scripts/instance-essai.sh demarrer <id> <port> <port_pg> > <journal> 2>&1 < /dev/null &`),
sans réinstaller le plugin ; attendre `until curl -s http://127.0.0.1:<port>/api/plugins | grep -q '"status":"ready"'; do sleep 5; done`.
Chaque appel du shell repart sans variables : refaire les `export` (et `PGPASSWORD`) dans chaque commande. Les requêtes SQL de l'essai
visent `127.0.0.1` et son port PostgreSQL (jamais 54329). Fumée des routes : `POST /obs/projets` (corps avec `companyId`, `slug`, `nom`,
`alias`), `POST /taches/<issueId>/obs/collecter` (corps `{"slug"}`, tâche de l'Observatoire existante), `GET /taches/<issueId>/obs/instantanes/<id>`,
`POST /obs/publications/a-exporter` (corps `{"companyId"}` ; un `GET` répond 404 « Plugin API route not found »).

Leçons de la répétition du 27/10 (~05 h 40, plugin mis à jour vers HEAD `13d00c5` sur une copie restaurée de 3100) :

- Rejeu du dump : le passer par un `sed` qui remplace les chemins de 3100 par ceux de l'essai, sinon l'essai écrit dans les fichiers de consignes de 3100.
- Copier en lecture seule `instances/atelier/companies` et `instances/atelier/skills` vers le dossier de l'instance d'essai
  (sans `skills`, le comparateur échoue en 404).
- Avec `ATELIER_DONNEES_LOCALES` isolé, `mettre-a-jour-client` voit un faux écart « liaison locale à refaire » sur tous les agents :
  lancer les scripts Python dans un espace de montage privé (`sudo -n unshare -m`, `instance/` remplacé par la copie).
- Exporter `ATELIER_API` vers l'essai avant `photo.py`, sinon la photo vise 3100.
- Alerte attendue sur une copie, et seulement sur une copie : un agent qui déchiffre des secrets (« Gardien des connexions » du
  marketing) passe en `error` (« Secret decryption failed »), car la copie a sa propre clé maîtresse. Ne jamais copier la clé maîtresse de 3100 pour l'éteindre.

Les attendus chiffrés de ce document sont ceux de 3100. Un montage d'essai différent peut donner d'autres nombres : ne pas les
reprendre sur 3100.

## 0. Conditions de départ (arrêt si l'une manque)

1. La revue de sécurité du diff est faite et ses constats bloquants sont corrigés.
2. Le commit à déployer est celui de la dernière répétition. Sinon : refaire la répétition (même méthode) sur ce commit.
3. `git status --porcelain` est vide dans le dépôt et dans `paperclip/`, sinon `deployer.sh` s'arrête à son étape 1
   (les fichiers non suivis comptent). Au 27/10, trois fichiers non suivis du propriétaire bloquent `deployer.sh` à son étape 1 :
   `docs/mode-authentifie.md`, `scripts/passer-en-mode-authentifie.py` et `scripts/passer-en-mode-authentifie.sh`. À traiter avec
   le propriétaire avant le déploiement : la décision est la sienne.
4. Le défaut `companyId` ci-dessus est corrigé (fait : bf2cf16).
5. Aucun agent de 3100 n'est en cours d'exécution :
   `psql -X -h 127.0.0.1 -p 54329 -U paperclip -d paperclip -Atc "select count(*) from heartbeat_runs where status not in ('succeeded','failed','cancelled')"`
   rend 0.

```bash
cd ~/Projets/atelier-marketing-ia
export CLIENT=<slug du client, dossier de instance/atelier-client/>
export D=/mnt/donnees/Systeme/Sauvegardes/atelier/phase3-$(date +%Y%m%d-%H%M)   # dossier NEUF (l'élagage ne touche que lui)
export J=$D/journaux B=$D/brouillon PGPASSWORD=paperclip
mkdir -p -m 700 "$D" "$J" "$B"
git rev-parse HEAD | tee "$J/commit.txt"
scripts/deployer.sh --essai --cible 3100 --sans-tests     # simulation, rien n'est exécuté
```

## 1. Sauvegarde (instance démarrée, lecture seule)

```bash
(cd paperclip && set -a && source ../config/atelier.env && set +a && pnpm paperclipai db:backup --dir "$D" --json) | tee "$J/sauvegarde.json"
F=$(ls -t "$D"/paperclip-*.sql.gz | head -1); gzip -t "$F" && sha256sum "$F" | tee "$D/EMPREINTE.sha256"
scripts/sauvegarde-hors-machine.sh /mnt/donnees/Systeme/Sauvegardes/atelier | tee "$J/hors-machine.log"   # secrets, companies/, plugin-jb
tar -C instance -czf "$D/locales-avant.tar.gz" atelier-client agents-atelier claude-config                # écrits par mettre-a-jour-client
```

Comptes de lignes de toutes les tables, sur 3100 puis sur le dump rejoué dans une base temporaire :

```bash
cat > "$B/comptes.sql" <<'SQL'
set default_transaction_read_only = on;
select format('select %L || ''|'' || count(*) from %I.%I;', n.nspname||'.'||c.relname, n.nspname, c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%'
order by 1 \gexec
SQL
psql -X -q -h 127.0.0.1 -p 54329 -U paperclip -d paperclip -At -f "$B/comptes.sql" | sort > "$B/comptes-3100.txt"
BIN=$(ls -d paperclip/node_modules/.pnpm/@embedded-postgres+linux-x64@*/node_modules/@embedded-postgres/linux-x64/native/bin | head -1)
P=$(mktemp -d /tmp/verif-pg.XXXXXX)   # chemin court : une socket Unix est limitée à 107 octets
"$BIN/initdb" -D "$P/db" -U paperclip --auth=trust -E UTF8 >/dev/null
"$BIN/pg_ctl" -D "$P/db" -w -l "$P/pg.log" -o "-p 54852 -c listen_addresses='' -c unix_socket_directories=$P" start
psql -X -q -h "$P" -p 54852 -U paperclip -d postgres -c 'create database paperclip'
zcat "$F" | psql -X -q -h "$P" -p 54852 -U paperclip -d paperclip -v ON_ERROR_STOP=1 -f - > "$J/restauration.log" 2>&1; echo "rejeu : $?"
psql -X -q -h "$P" -p 54852 -U paperclip -d paperclip -At -f "$B/comptes.sql" | sort | diff "$B/comptes-3100.txt" - && echo COMPTES-IDENTIQUES
"$BIN/pg_ctl" -D "$P/db" -m fast -w stop && rm -rf "$P"
```

**Arrêt** si : rejeu différent de 0, ou comptes différents (hors tables qui bougent pendant la mesure, à justifier ligne à ligne).

## 2. Photo avant (lecture seule)

Script de l'annexe A, copié dans `$B/photo.py`, et comparateur de l'annexe B, copié dans `$B/comparer.py` :

```bash
python3 -I "$B/photo.py" "$B/photo-avant.json"     # attendu le 27/10 : 29 entreprises, 233 agents, 23 non en pause
psql -X -h 127.0.0.1 -p 54329 -U paperclip -d paperclip -At -c "select * from plugin_atelier_f0322cc62c.flux_services" | cut -d'|' -f1-5,7 | sort > "$B/flux-avant.txt"
```

Le nom du schéma du plugin se lit avec `select nspname from pg_namespace where nspname like 'plugin_atelier%'`.

## 3. Plugin et redémarrage

Rappel : un premier passage de la porte de l'Observatoire met l'entreprise en pause (événement de coût « unpriced » de l'adaptateur
process, politique de budget `block` par défaut). Décision du propriétaire sur la politique avant le pilote.

```bash
scripts/deployer.sh --cible 3100 --journaux "$J"
psql -X -h 127.0.0.1 -p 54329 -U paperclip -d paperclip -At -c "select migration_key, status from plugin_migrations where migration_key >= '022' order by 1"
```

**Arrêt** et retour arrière (section 7) si : `deployer.sh` sort en échec après son étape 5 (redémarrage), le plugin n'est pas
`ready` en 4 minutes, ou 022, 023 et 024 ne sont pas `applied`. Un échec aux étapes 1 à 4 ne touche pas 3100 : corriger, relancer.

## 4. Consignes : essai à blanc puis mise à jour

```bash
python3 -I scripts/bootstrap-organisation.py mettre-a-jour-client --client "$CLIENT" --a-blanc > "$J/a-blanc.log" 2>&1; echo "code $?"; cat "$J/a-blanc.log"
```

**Arrêt** si : code différent de 0 ; un agent à créer, hors registre ou à renommer ; un service autre que l'Observatoire avec
un écart différent de 0 ; une ligne « RISQUE DE COLLISION ». Attendu : « 0 à créer ; 0 écart(s) » pour chaque service existant, des écarts seulement sur l'Observatoire. Les nombres exacts
(écarts de l'Observatoire, services « non (déjà à jour) ») sont à confirmer sur la photo avant de 3100 ; tout écart hors du service
observatoire (et marketing si son import natif est attendu) arrête le déploiement. La garde vaut pour les 29 services à la fois : en code 1, lire le motif avant toute autre action.

```bash
python3 -I scripts/bootstrap-organisation.py mettre-a-jour-client --client "$CLIENT" > "$J/mise-a-jour.log" 2>&1; echo "code $?"
grep -c "Import natif : oui" "$J/mise-a-jour.log"            # attendu : 1 (Observatoire ; à confirmer sur la photo avant)
grep -c "Import natif : non" "$J/mise-a-jour.log"            # nombre de services déjà à jour : à confirmer sur la photo avant de 3100
```

**Arrêt** et retour arrière si : code différent de 0, ou un autre service que l'Observatoire importé.

## 5. Déclaration de l'entreprise Observatoire au plugin

Sans elle, la garde (`observatoire/garde.ts`) refuse toutes les routes `obs.*`, l'Observatoire compris : avant le déploiement,
`services_entreprises` compte 28 lignes, sans la ligne `observatoire`.

```bash
python3 -I scripts/declarer-services.py "$CLIENT" > "$J/declarer.log" 2>&1; echo "code $?"; tail -3 "$J/declarer.log"
psql -X -h 127.0.0.1 -p 54329 -U paperclip -d paperclip -At -c "select * from plugin_atelier_f0322cc62c.flux_services" | cut -d'|' -f1-5,7 | sort > "$B/flux-apres.txt"
diff "$B/flux-avant.txt" "$B/flux-apres.txt" | grep -c '^<'                       # attendu : 0 flux retiré
diff "$B/flux-avant.txt" "$B/flux-apres.txt" | grep '^>' | grep -vc observatoire  # attendu : 0 ajout hors Observatoire
```

## 6. Contrôles après

```bash
psql -X -h 127.0.0.1 -p 54329 -U paperclip -d paperclip -At -c "select migration_key, status from plugin_migrations where migration_key ~ '^02[234]_' order by 1"   # attendu : 3 lignes applied (migration_key est le nom du fichier, « 022_diffusions_travaux_fabrique.sql » : un « in ('022',…) » ne rend rien)
psql -X -h 127.0.0.1 -p 54329 -U paperclip -d paperclip -At -c "select column_name from information_schema.columns where table_schema = 'plugin_atelier_f0322cc62c' and table_name = 'obs_instantanes' and column_name = 'injections_signalees'"   # attendu : 1 ligne (migration 024)
python3 -I "$B/photo.py" "$B/photo-apres.json" && python3 -I "$B/comparer.py" "$B/photo-avant.json" "$B/photo-apres.json"
DL=${ATELIER_DONNEES_LOCALES:-instance}   # sur un essai : son dossier de données locales, jamais instance/
OBS=$(python3 -I -c "import json;print(json.load(open('$DL/atelier-client/$CLIENT/entreprise.json'))['entreprises']['observatoire']['entrepriseId'])")
MKT=$(python3 -I -c "import json;print(json.load(open('$DL/atelier-client/$CLIENT/entreprise.json'))['entreprises']['marketing']['entrepriseId'])")
A=http://127.0.0.1:3100/api/plugins/atelier.marketing-ia/api   # sur un essai : http://127.0.0.1:<port>/api/plugins/atelier.marketing-ia/api
curl -s -w ' %{http_code}\n' -X POST -H 'content-type: application/json' -d "{\"companyId\":\"$OBS\"}" "$A/obs/publications/a-exporter"   # attendu : 200
curl -s -w ' %{http_code}\n' -X POST -H 'content-type: application/json' -d "{\"companyId\":\"$MKT\"}" "$A/obs/publications/a-exporter"   # attendu : 403 acces_refuse
```

Mesuré sur la copie du 27/10 : migrations 021 à 024 `applied`, aucune après 024 ; `mettre-a-jour-client` 28 services à 0 écart,
« Import natif : oui » 1 fois (Observatoire) et « non » 28 fois ; `declarer-services.py` 0 flux retiré, 0 ajouté ; `a-exporter` 200
`{"copiees":0,...}` pour l'Observatoire et 403 `acces_refuse` pour le marketing ; comparateur : seuls `metadata.atelier` de 13 agents de
l'Observatoire changent. Sur 3100 (bonne clé maîtresse), « ALERTES : aucune » est attendu : l'alerte du Gardien serait un vrai défaut.

**Attendu** du comparateur : « ALERTES : aucune » ; agents modifiés seulement dans l'entreprise Observatoire (leur nombre est à confirmer sur la photo avant), champs
`metadata.atelier` et `AGENTS.md`. Un agent modifié dans une autre entreprise, une entreprise ou un agent en plus ou en moins,
un changement de statut, de budget, de tâches ou de routines : retour arrière.

## 6 bis. Politique de budget « usage non tarifé » (accord de l'opérateur du 27/10)

Pas de SQL : la route du socle est `POST /api/companies/<id>/budgets/policies` (`paperclip/server/src/routes/costs.ts`), lecture par
`GET /api/companies/<id>/budgets/overview`. Corps `{"scopeType","scopeId","unpricedUsagePolicy":"allow"}` : sans `amount`, l'upsert garde le plafond
en centimes, la fenêtre et l'arrêt dur ; il ne reprend aucun agent en pause (`resumeScopeFromBudget` ne touche que l'entreprise en pause « budget »).
Faire un `GET` avant et après sur chaque politique de l'entreprise (14 pour l'Observatoire : 13 agents et l'entreprise) ; seul `unpricedUsagePolicy` doit changer.

## 7. Retour arrière (testé sur l'instance d'essai pour la base, le 27/10)

Point de retour : le dump `$F` (empreinte dans `$D/EMPREINTE.sha256`), la copie hors machine du même jour (`companies/`,
`plugin-jb/`) et `$D/locales-avant.tar.gz`.

```bash
C=$(ls -d /mnt/donnees/Systeme/Sauvegardes/atelier/atelier-* | tail -1)   # copie hors machine faite à l'étape 1
sha256sum -c "$D/EMPREINTE.sha256"
scripts/arreter-instance.sh
I=instance/instances/atelier
"$BIN/pg_ctl" -D "$I/db" -w -l "$J/pg-retour.log" -o "-p 54329 -c listen_addresses=127.0.0.1" start
psql -X -q -h 127.0.0.1 -p 54329 -U paperclip -d postgres -c "drop database paperclip" -c "create database paperclip"
zcat "$F" | psql -X -q -h 127.0.0.1 -p 54329 -U paperclip -d paperclip -v ON_ERROR_STOP=1 -f - > "$J/retour.log" 2>&1; echo "rejeu : $?"
"$BIN/pg_ctl" -D "$I/db" -m fast -w stop
rsync -a --delete "$C/instance/instances/atelier/companies/" "$I/companies/"
rsync -a --delete "$C/instance/plugin-jb/dist/" instance/plugin-jb/dist/
rsync -a --delete "$C/instance/plugin-jb/migrations/" instance/plugin-jb/migrations/
command cp -f "$C/instance/plugin-jb/package.json" instance/plugin-jb/package.json
tar -C instance -xzf "$D/locales-avant.tar.gz"
setsid nohup scripts/lancer-instance.sh > "$J/instance-retour.log" 2>&1 < /dev/null &
```

Puis prendre une photo et la comparer à `photo-avant.json` : 0 écart attendu, hors `updatedAt`. Seul le rejeu de la base a été
répété le 27/10 ; la remise en place de `plugin-jb` et des données locales, non.

## 8. Premier export réel vers le site (OUT-3, après la première approbation de l'opérateur)

Jamais exécuté au 30/10/2026 : le dépôt de contenu n'a que son commit initial et aucun code `obs_*` n'apparaît dans les journaux.
À faire une fois, par l'humain, dès qu'une révision (fiche ou article) est approuvée sur sa carte. Variables de la section 6.

```bash
L=$B/a-exporter.json; C=~/Projets/avenue-observatoire-contenu
curl -s -X POST -H 'content-type: application/json' -d "{\"companyId\":\"$OBS\"}" "$A/obs/publications/a-exporter" > "$L"   # attendu : aPublier non vide
python3 -I -c "import json;[print(e['id'],e['langue'],e['slug'],e['verifieLe'],e['baseRevisionFr'],e['secondeDecision']) for e in json.load(open('$L'))['aPublier']]"
# Première publication du site (INJ-9) : seconde décision humaine, puis liste régénérée.
curl -s -w ' %{http_code}\n' -X POST -H 'content-type: application/json' -d "{\"companyId\":\"$OBS\",\"objet\":\"<id>\"}" "$A/obs/publications/confirmer"   # attendu : 201
curl -s -X POST -H 'content-type: application/json' -d "{\"companyId\":\"$OBS\"}" "$A/obs/publications/a-exporter" > "$L"
python3 -I scripts/exporter-observatoire.py --id <id> --liste-a-exporter "$L" --depot "$C"   # sortie : hash du commit ; erreur standard : corps exact du marquage
curl -s -w ' %{http_code}\n' -X POST -H 'content-type: application/json' -d '<corps affiché, companyId remplacé par $OBS>' "$A/obs/publications"   # attendu : 201
git -C "$C" log --oneline | head -2   # attendu : le commit « observatoire: … révision <n> (<langue>) »
cd ~/Projets/avenue-observatoire && CONTENU_DIR="$C" pnpm exec astro build   # le schéma du site (content.config.ts) valide le fichier exporté
```

**Attendu** : la révision disparaît de `a-exporter` ; le fichier exporté a ses citations en numéros de note `[n](#a-<id>)` vers la liste
des affirmations, `verifie_le` égal au jour de l'approbation, chaque affirmation avec au moins une source ; une version anglaise porte
`base_revision_fr` égal au `revision` de la version française exportée. Tout refus de l'exporteur ou de la construction du site est un
défaut à corriger avant toute autre publication (pas de retouche à la main du dépôt de contenu).

## Annexe A : `photo.py` (lecture seule, méthode GET seulement)

```python
"""Photo de l'instance (ATELIER_API, défaut 3100) : entreprises, agents, empreinte de AGENTS.md, routines, politiques, budgets,
nombre de tâches. Usage : python3 -I photo.py <sortie.json>"""
import hashlib, importlib.util, json, sys
spec = importlib.util.spec_from_file_location("bo", "scripts/bootstrap-organisation.py")
bo = importlib.util.module_from_spec(spec); spec.loader.exec_module(bo)

class ApiLecture(bo.Api):
    def appel(self, methode, chemin, corps=None, attendu=(200, 201)):
        assert methode == "GET", "photo en lecture seule"
        return super().appel(methode, chemin, corps, attendu)

api = ApiLecture(bo.url_api())
def lire(chemin):
    try:
        return api.get(chemin)
    except bo.ErreurAtelier as e:
        return {"_erreur": str(e)[:200]}

photo = {}
for c in api.get("/companies"):
    cid, agents = c["id"], {}
    for a in api.get(f"/companies/{cid}/agents"):
        f = lire(f"/agents/{a['id']}/instructions-bundle/file?path=AGENTS.md")
        t = f.get("content") if isinstance(f, dict) else None
        agents[a["id"]] = {"detail": lire(f"/agents/{a['id']}"),
                           "agentsMd": hashlib.sha256(t.encode()).hexdigest() if isinstance(t, str) else f}
    taches = lire(f"/companies/{cid}/issues")
    photo[cid] = {"entreprise": c, "agents": agents, "routines": lire(f"/companies/{cid}/routines"),
                  "politiques": lire(f"/companies/{cid}/tools/policies"), "budgets": lire(f"/companies/{cid}/budgets"),
                  "nbTaches": len(taches) if isinstance(taches, list) else taches}
json.dump(photo, open(sys.argv[1], "w"), ensure_ascii=False, indent=1, sort_keys=True)
print(f"{len(photo)} entreprises, {sum(len(p['agents']) for p in photo.values())} agents, "
      f"{sum(1 for p in photo.values() for a in p['agents'].values() if isinstance(a['detail'], dict) and a['detail'].get('status') != 'paused')} non en pause")
```

## Annexe B : `comparer.py`

```python
"""Compare deux photos : dates ignorées, listes d'objets triées par identifiant. Usage : comparer.py avant.json apres.json"""
import json, sys
from collections import Counter
IGNORES = {"updatedAt", "lastHeartbeatAt", "createdAt"}
def net(v):
    if isinstance(v, dict):
        return {k: net(x) for k, x in v.items() if k not in IGNORES}
    if isinstance(v, list):
        l = [net(x) for x in v]
        return sorted(l, key=lambda x: str(x.get("id"))) if all(isinstance(x, dict) and "id" in x for x in l) else l
    return v
def chemins(a, b, p=""):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in set(a) | set(b):
            yield from chemins(a.get(k), b.get(k), f"{p}.{k}" if p else k)
    elif a != b:
        yield p
av, ap = (net(json.load(open(f))) for f in sys.argv[1:3])
print("entreprises en plus :", [ap[c]["entreprise"]["name"] for c in set(ap) - set(av)])
print("entreprises en moins :", [av[c]["entreprise"]["name"] for c in set(av) - set(ap)])
par_ent, champs, alertes = Counter(), Counter(), []
for cid, e in av.items():
    f, nom = ap[cid], e["entreprise"]["name"]
    alertes += [f"{nom} : {k} changé" for k in ("nbTaches", "budgets", "routines", "politiques") if e[k] != f[k]]
    if sorted(e["agents"]) != sorted(f["agents"]):
        alertes.append(f"{nom} : liste des agents changée")
    for aid, a in e["agents"].items():
        b = f["agents"].get(aid)
        if b is None:
            continue
        alertes += [f"{nom} / {a['detail'].get('name')} : {k}" for k in ("status", "name", "budgetMonthlyCents", "reportsTo", "role")
                    if a["detail"].get(k) != b["detail"].get(k)]
        d = {".".join(k.split(".")[:2]) for k in chemins(a["detail"], b["detail"])} | ({"AGENTS.md"} if a["agentsMd"] != b["agentsMd"] else set())
        champs.update(d)
        par_ent[nom] += bool(d)
print("ALERTES :", alertes or "aucune")
print("agents modifiés par entreprise :", {k: n for k, n in par_ent.items() if n} or "aucun")
print("champs modifiés :", dict(champs) or "aucun")
```
