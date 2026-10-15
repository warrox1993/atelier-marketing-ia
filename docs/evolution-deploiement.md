# Évolution du déploiement : PostgreSQL externe, déploiement partagé, Azure

Document du lot B, rédigé le 15/10/2026. Rien n'a été créé, installé ni payé : c'est un guide de décision et de
procédure, fondé sur les documents du socle `v2026.1012.0` (chemins relatifs à `paperclip/`, avec ligne). Ce qui est
une déduction de ma part est marqué **déduction** ; ce qui n'a pas été essayé est marqué **non testé**.
Point de départ de l'atelier : mode `local_trusted`, écoute sur la boucle locale, PostgreSQL embarqué, port 3100
(`config/atelier.env.example`).

## 0. Les modes officiellement supportés

| Mode | Authentification | Usage prévu | Source |
| --- | --- | --- | --- |
| `local_trusted` | aucune | un opérateur, une machine (notre cas) | `doc/DEPLOYMENT-MODES.md:50,65-69` |
| `authenticated` + `private` | connexion obligatoire | réseau privé : Tailscale, VPN, LAN | `doc/DEPLOYMENT-MODES.md:51,71-77` |
| `authenticated` + `public` | connexion obligatoire, URL publique explicite | internet, cloud | `doc/DEPLOYMENT-MODES.md:52,79-86` |

Accessibilité réseau (`bind`) : `loopback`, `lan`, `tailnet`, `custom` (`doc/DEPLOYMENT-MODES.md:56-61`). En public,
l'amont recommande `loopback` derrière un reverse proxy (`doc/DEPLOYMENT-MODES.md:84`).
Base de données : embarquée (sans `DATABASE_URL`), Docker local, Supabase hébergé
(`docs/deploy/database.md:82-90`). Stockage : `local_disk` ou S3 compatible (`docs/deploy/storage.md:28-34`). Le seul
guide cloud complet de l'amont est **AWS ECS Fargate + RDS PostgreSQL 17 + EFS** (`docs/deploy/aws-ecs.md:1-6`).
**Il n'existe aucun guide Azure** dans `doc/` ni `docs/` (recherche faite : seules des notes de plans sur les
adaptateurs de messagerie Teams mentionnent Azure).

## 1. Passer à un PostgreSQL externe

### 1.1 Ce que dit l'amont

- Il suffit de définir `DATABASE_URL` : le serveur utilise alors cette base à la place du PostgreSQL embarqué
  (`doc/DEVELOPING.md:1505-1507`, `docs/deploy/environment-variables.md:16`). Le schéma est le même dans tous les modes
  (`docs/deploy/database.md:90`).
- Les migrations sont exécutées au démarrage (`docs/deploy/database.md:19-20`, `server/src/index.ts:244-300`).
  Derrière un pooleur en mode transaction (Supabase, pgbouncer, Neon `-pooler`) : `DATABASE_PREPARED_STATEMENTS=false`
  et `DATABASE_MIGRATION_URL` sur une connexion **directe** (`doc/DATABASE.md:109-116`).
- Réglages du pool : `DATABASE_POOL_MAX`, `DATABASE_IDLE_TIMEOUT_SECONDS`, `DATABASE_CONNECT_TIMEOUT_SECONDS`,
  `DATABASE_MAX_LIFETIME_SECONDS`, `DATABASE_APPLICATION_NAME` (`docs/deploy/database.md:69-80`).
- La CLI de sauvegarde sait lire l'URL de la base : `DATABASE_URL`, sinon `database.connectionString` du `config.json`
  (`cli/src/commands/db-backup.ts:23-35`).

### 1.2 Pièges propres à notre situation (mesurés ou lus dans le code)

1. **Version de PostgreSQL.** Le serveur embarqué est `18.1.0-beta.16`
   (`node_modules/.pnpm/embedded-postgres@18.1.0-beta.16`), alors que les guides Docker et RDS de l'amont visent la
   version 17 (`docs/deploy/database.md:27-35`, `docs/deploy/aws-ecs.md:6`). Choisir une version **stable** de
   PostgreSQL pour la base externe (pas de bêta pour les outils de travail) et vérifier que le schéma
   migré passe sur cette version avant de décider : la compatibilité d'une base migrée en 18 beta vers 17 n'est pas
   documentée (**non testé**).
2. **Migration des données existantes.** Aucune commande officielle ne déplace une base embarquée vers une base
   externe. Les briques existent (`pnpm db:backup`, puis `runDatabaseRestore` de `@paperclipai/db`,
   `packages/db/src/backup-lib.ts:1051`) mais la restauration depuis une sauvegarde faite **sans `pg_dump`** est
   infidèle (`docs/exploitation.md`, 3.3 : 110 écarts dont 103 contraintes `CHECK` perdues). Deux voies :
   - **Repartir d'une base neuve** : pointer `DATABASE_URL` sur la base externe vide, laisser le serveur migrer,
     puis `bootstrap-organisation.py appliquer` reconstruit l'organisation ; les campagnes, coûts et historique de
     l'instance locale ne suivent pas. C'est la voie la plus sûre aujourd'hui.
   - **Déplacer les données** : après avoir installé `pg_dump`/`psql` (version égale ou supérieure à celle de la base
     source), refaire la mesure de fidélité de `docs/exploitation.md`, puis restaurer sur la base externe vide
     et appliquer les migrations. **Non testé** sur une base externe.
3. **Secrets.** `secrets/master.key` doit accompagner la base : sans elle, les secrets chiffrés (jeton Claude
   notamment) sont illisibles (`doc/DATABASE.md:454-459`). Alternative documentée pour l'hébergé : fournisseur
   `aws_secrets_manager` (`docs/deploy/secrets.md:109`, `doc/SECRETS-AWS-PROVIDER.md`).
4. **Sauvegardes.** Avec une base externe, `pnpm db:backup` se connecte à `DATABASE_URL` : un `pg_dump` du poste doit
   être au moins de la version du serveur. Les sauvegardes managées du fournisseur (instantanés) complètent, elles ne
   remplacent pas la copie des fichiers hors base (`docs/exploitation.md`, section 1).
5. **Plugin.** Le plugin `atelier.marketing-ia` crée son schéma `plugin_atelier_*` par ses propres migrations
   (`doc/DATABASE.md:412-414`, `DATABASE_MIGRATION_URL` si les connexions de lecture et de migration sont séparées).
   L'utilisateur de la base doit pouvoir créer des schémas.

### 1.3 Procédure (ordre conseillé, **non testé sur une base externe**)

```bash
# 1. Sauvegarde complète et arrêt (docs/exploitation.md, sections 1 et 4 ; scripts/arreter-instance.sh)
# 2. Créer la base vide chez le fournisseur choisi (hors de ce dépôt, sans rien payer sans décision de l'opérateur)
# 3. Définir DATABASE_URL (et DATABASE_MIGRATION_URL si pooleur) dans l'environnement du serveur, jamais dans le dépôt
# 4. Premier lancement : le serveur applique les migrations ; vérifier GET /api/health
# 5. python3 -I scripts/bootstrap-organisation.py appliquer ; puis un « etat » pour comparer
# 6. Retour arrière : retirer DATABASE_URL, relancer sur l'ancienne base embarquée (non modifiée, à conserver
#    tant que le test n'est pas concluant)
```

## 2. Passer à un déploiement partagé (plusieurs personnes)

### 2.1 Ce que dit l'amont

1. Choisir `authenticated` + `private` (VPN, Tailscale, LAN) ou `authenticated` + `public`
   (`docs/deploy/overview.md:39-45`). Pour Tailscale : `PAPERCLIP_DEPLOYMENT_MODE=authenticated`,
   `PAPERCLIP_DEPLOYMENT_EXPOSURE=private`, `PAPERCLIP_BIND=tailnet` (`docs/deploy/tailscale-private-access.md:8-20`).
2. Première installation authentifiée : état `bootstrap_pending` jusqu'à la création du premier administrateur ;
   en privé, « Claim this instance » dans le navigateur ; en public, uniquement l'invitation à haute entropie :
   `pnpm paperclipai auth bootstrap-ceo` (`doc/DEPLOYMENT-MODES.md:170-205`). Le premier arrivé gagne : ne pas laisser
   un `bootstrap_pending` privé joignable par des tiers (`doc/DEPLOYMENT-MODES.md:187-191`).
3. Migration depuis `local_trusted` : si le seul administrateur est `local-board`, le serveur émet une URL de
   revendication à usage unique `/board-claim/<jeton>?code=<code>` qui fait de l'utilisateur connecté l'administrateur
   et conserve les entreprises existantes (`doc/DEPLOYMENT-MODES.md:157-168`).
4. Public : URL publique explicite, contrôles plus stricts du `doctor`, limitation de débit des connexions active par
   défaut ; `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true` pour fermer les inscriptions (`doc/DEPLOYMENT-MODES.md:79-86`,
   `docs/deploy/aws-ecs.md:411-420`).
5. Conteneur : `docker compose -f docker/docker-compose.quickstart.yml up --build` (port 3100, données dans
   `./data/docker-paperclip`) ou construction manuelle (`docs/deploy/docker.md:8-47`). L'image préinstalle la CLI
   `claude` (`docs/deploy/docker.md:51-57`). Les clés passent par des variables d'environnement
   (`ANTHROPIC_API_KEY`, `docs/deploy/docker.md:60-72`) ; pour l'atelier on préférera le secret natif de Paperclip
   (`bootstrap-organisation.py jeton --confirmer`).

### 2.2 Spécificités de l'atelier

- **L'image doit être construite depuis notre branche**, pas depuis l'amont : le `Dockerfile` fait `COPY . .`
  (`Dockerfile:128`), donc l'image embarque ce qui est dans `paperclip/` au moment de la construction, patches
  `socle/patches/*` compris (**déduction** : à confirmer par un test de construction, non fait ici). L'image
  officielle de l'amont n'aurait ni les gardes P1/P2 ni le régulateur de runs.
- **Plugin** : `plugin-atelier/dist` doit être présent et installé dans l'instance du conteneur ; le chemin d'installation
  du plugin est un chemin de la machine (`REPRISE.md`, « Retour arrière » du plugin). **Non testé** en conteneur.
- **Agents réels** : `claude_local` lance `claude` dans le conteneur avec `CLAUDE_CONFIG_DIR` par agent
  (`instance/claude-config/<slug>/`, `bootstrap-organisation.py`). Les dossiers `organisation/` et le paquet restent
  dans le dépôt ; `agents-atelier/` et `claude-config/` sont créés par `appliquer` sur le volume de données.
- **Isolation des consignes personnelles de l'opérateur** : le test d'isolement de `scripts/bootstrap-tests.sh` prouve que `claudeMdExcludes`
  empêche de charger le fichier global de consignes de l'opérateur ; dans un conteneur ce fichier n'existe pas, mais le réglage reste appliqué.
- **Plus d'un utilisateur** : les rôles et l'appartenance à l'entreprise passent par les mécanismes natifs
  (`docs/guides/board-operator`) ; le plugin lit l'acteur fourni par l'hôte (aucune identité propre), voir
  `docs/contrats.md`.
- **Un seul serveur par instance** (comme en local) : l'amont ne documente pas de mise à l'échelle horizontale du serveur
  Paperclip ; le guide AWS déploie **une seule tâche** (`docs/deploy/aws-ecs.md:6`).

## 3. Azure

**Statut officiel : non supporté ni documenté.** L'amont ne fournit ni guide, ni image publiée, ni script pour Azure.
Les seuls chemins cloud documentés sont AWS ECS Fargate (guide complet) et le déploiement conteneur générique
(`docs/deploy/docker.md`). Je ne décris donc pas de procédure Azure comme supportée.

**Déduction** (à valider avant toute décision, rien n'a été créé) : les briques génériques que l'amont documente
sont portables, et c'est de l'assemblage fait par nous, pas un mode supporté :

| Brique documentée | Source | Équivalent Azure possible (déduction) |
| --- | --- | --- |
| Image Docker du serveur | `docs/deploy/docker.md`, `Dockerfile` | registre de conteneurs + service de conteneurs |
| PostgreSQL via `DATABASE_URL` | `docs/deploy/database.md:82-90` | PostgreSQL géré (version stable à choisir, voir 1.2) |
| Stockage S3 compatible | `docs/deploy/storage.md:18-34` | stockage objet compatible S3 (l'amont ne cite pas Azure Blob) |
| Fichiers locaux (`data/`, `companies/`, `secrets/`) | `doc/DEVELOPING.md:700-722` | volume persistant monté sur le conteneur (l'amont utilise EFS sur AWS) |
| Secrets natifs `local_encrypted` + clé maîtresse | `doc/DATABASE.md:454-459` | clé sur le volume ; le fournisseur `aws_secrets_manager` n'a pas d'équivalent Azure documenté |
| `authenticated` + `public`, bind `loopback` derrière reverse proxy | `doc/DEVELOPING.md`, `doc/DEPLOYMENT-MODES.md:84` | reverse proxy ou passerelle d'entrée avec TLS |

Points ouverts à trancher par l'opérateur avant d'aller plus loin : nécessité réelle d'un hébergement (l'usage actuel est
un seul opérateur en local), coût mensuel (aucun chiffre vérifié ici : à demander au fournisseur le jour venu),
et si Azure est imposé par un client ou si le guide AWS officiel convient. Ce qui est connu et réutilisable
sans Azure : tout le travail de ce document sur la base et les sauvegardes.

## 4. Quand déclencher quelle évolution

| Besoin | Évolution | Prérequis chez nous |
| --- | --- | --- |
| Garder les données si le disque lâche | sauvegarde hors machine, installer `pg_dump` | `docs/exploitation.md` 3.3 |
| Ouvrir l'atelier à un collègue sur le même réseau | `authenticated` + `private`, `bind=tailnet` ou `lan` | claim du premier administrateur |
| Ouvrir à un client sur internet | `authenticated` + `public`, URL publique, TLS, inscriptions fermées | base externe conseillée, image construite depuis notre branche, revue de sécurité (agent `securite`) |
| Hébergement géré | PostgreSQL externe + conteneur | tests de construction et de migration, décision de l'opérateur sur le coût |
