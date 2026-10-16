# Installation chez un client : compte Unix dédié

Document du 16/10/2026. Décision de l'opérateur : l'atelier est installé **une fois par client, sur la
machine Linux du client**, avec ses propres agents et sa propre base de connaissances ; pas d'hébergement mutualisé.
Script : `scripts/installer-chez-client.sh` (mode `--essai` par défaut, `--appliquer` explicite) ; test :
`scripts/tests/tester-installer-chez-client.sh`. Marqueurs : **prouvé** (mesuré ou lu dans le code, avec la référence),
**probable** (déduction), **non testé**.

## 0. En bref

| Couche | Ce qu'elle protège | État |
| --- | --- | --- |
| Compte de service `atelier` sans sudo, répertoire 0700 qui ne contient que l'atelier | les fichiers personnels du client et des autres comptes de la machine (`~/.ssh`, documents, navigateur) | livré par le script |
| Code dans `/opt/atelier-marketing-ia`, propriété du compte d'administration, groupe `atelier` en lecture seule | le code du serveur, des scripts, du plugin et la configuration : un agent ne peut pas les réécrire avec `curl -o` | livré par le script |
| Confinement réseau natif de l'adaptateur (`networkScope: "allowlist"`) | la fuite : un agent ne peut plus envoyer ce qu'il a lu ailleurs qu'aux hôtes listés | **prouvé fonctionnel sur Ubuntu 26.04 sans toucher AppArmor** (section 3.3) ; à activer dans le générateur (décision) |
| Confinement fichiers natif (`filesystemScope: "workspace"`) | la lecture des secrets de l'instance (`master.key`, `.env`, clés) par un agent | **cassé sur Ubuntu** (défaut amont prouvé, section 3.2) ; correctif de trois lignes à porter en patch du socle (décision) |

Sans les deux dernières couches, un agent piégé peut encore **lire** les secrets de l'instance (liste honnête en section 4),
mais plus rien du reste de la machine, et il ne peut plus modifier le code.

## 1. Menace traitée

Les agents Claude (`claude_local`) ont `Bash(curl *)` (nécessaire pour parler à Paperclip, `docs/guide-agents-competences.md`).
Une page web lue par Veille ou Prospection peut contenir une injection. Un agent piégé peut alors :
lire un fichier (`curl file:///…`), écrire un fichier (`curl -o`), envoyer des données (`curl https://…`).
Une règle de permission de Claude ne borne ni l'hôte ni le chemin joint par `curl`, et les règles `Read` refusées du
`settings.json` de l'agent ne s'appliquent pas à `curl` (c'est une commande Bash, pas l'outil Read).
Le bac à sable propre à Claude Code n'est pas utilisable ici et on ne modifie pas AppArmor.

## 2. Prérequis sur la machine du client

À installer par le compte d'administration (par exemple celui de l'opérateur), jamais par `atelier` :

| Élément | Version ou forme | Pourquoi |
| --- | --- | --- |
| Linux avec systemd 248 ou plus (`systemctl --user -M compte@`) | Ubuntu 24.04+, Debian 12+ | unités utilisateur et linger |
| Node.js | 24.11.0 ou plus (`paperclip/package.json`, `engines.node`) | socle |
| corepack | fourni avec Node | pnpm 9.15.4 épinglé (`packageManager`) |
| `python3`, `git`, `curl`, `rsync`, `bwrap` (paquet `bubblewrap`) | dépôts de la distribution | scripts, copie, confinement |
| CLI `claude` | **dépôt apt officiel, canal `stable`** : `/usr/bin/claude`, propriété de root, sans mise à jour automatique (https://code.claude.com/docs/en/setup, « Install with Linux package managers », consulté le 16/10/2026) | un agent ne doit pas pouvoir remplacer le binaire qu'il exécute ; l'installateur natif le placerait dans `~/.local/bin` du compte, donc modifiable par les agents |

Le script vérifie la présence de ces outils (il ne les installe pas) et, en `--appliquer`, signale si `claude` est
modifiable par le compte.

## 3. Conception et décisions (questions a, b, c)

### 3.1 (a) Agents et serveur sous le même compte ?

**Oui, aujourd'hui, et c'est inévitable sans privilège.** Prouvé dans le code :

- l'adaptateur lance la CLI par `spawn` sans option `uid`/`gid` (`paperclip/packages/adapter-utils/src/server-utils.ts:4724-4730`) :
  le processus de l'agent a l'identité du serveur ;
- la seule prise est la commande configurable (`config.command`, défaut `claude`,
  `paperclip/packages/adapters/claude-local/src/server/execute.ts:176`). Lancer sous `atelier-agents` imposerait un
  enveloppeur `sudo -u atelier-agents` et une règle sudoers (sudo-rs 0.2.13 accepte `Runas` et `SETENV`, `man sudoers`) ;
- **ce montage est incompatible avec le confinement réseau natif** : Bubblewrap met `no_new_privs` (mesuré :
  `bwrap --bind / / --dev /dev --proc /proc grep NoNewPrivs /proc/self/status` donne `NoNewPrivs: 1`), donc `sudo`
  lancé à l'intérieur ne peut plus changer d'identité ;
- autres frictions (**non testé**) : l'arrêt d'un run passe par `process.kill(-pgid)` (`server-utils.ts:133`), qui ne peut
  pas tuer les petits-enfants d'un autre compte ; les dossiers de travail, de configuration Claude et le fichier MCP écrit par
  le serveur devraient être partagés par un groupe commun.

**Recommandation** : un seul compte de service `atelier` (serveur, passerelle et agents), plus le code en lecture seule,
plus les confinements natifs (3.2 et 3.3). Le deuxième compte (`atelier-agents`) n'apporterait la protection de
`master.key` qu'au prix d'une règle sudoers, d'un pare-feu par utilisateur (3.4) et de la perte du confinement réseau
natif ; à n'envisager que si le correctif du confinement fichiers (3.2) était refusé.

### 3.2 Confinement fichiers natif : présent, mais cassé sur Ubuntu

`filesystemScope: "workspace"` (documenté, `paperclip/doc/spec/agent-runs.md:319`) monte une racine neuve qui ne
contient que les dossiers système, l'espace de travail, la configuration Claude de l'agent et ses consignes : `master.key`,
`.env`, `cles/`, la base et le reste du disque deviennent invisibles. **Prouvé cassé ici** : le test d'intégration de
l'amont échoue sur ce poste (`PAPERCLIP_TEST_BWRAP=/usr/bin/bwrap pnpm exec vitest run
packages/adapter-utils/src/local-process-sandbox.test.ts` : 11 réussis, 2 échoués, « Can't bind mount /oldroot/usr/bin on
/newroot/bin »). Cause reproduite à la main : la liste `SYSTEM_READ_PATHS` (`local-process-sandbox.ts:51-67`) monte
`/bin` (lien vers `usr/bin` sur une distribution à `/usr` fusionné) avant `/usr` ; sans ce montage redondant, `bwrap` passe.
Correctif (à porter en patch `socle/patches/`, hors de ce lot) : ne pas monter un chemin système qui est un lien symbolique
(les liens `/bin`, `/sbin`, `/lib`, `/lib64` sont déjà créés par `--symlink`).

### 3.3 (c) Réseau sortant des agents

**Recommandé : le confinement réseau natif**, `networkScope: "allowlist"` (`agent-runs.md:321`) : espace de noms réseau
privé, sortie seulement par un mandataire qui n'accepte que les hôtes listés, plus l'URL de Paperclip et des serveurs MCP
(`execute.ts:584-588`). **Prouvé sur ce poste, AppArmor inchangé** (essai du 16/10/2026 avec `runChildProcess` du socle,
confinement réseau seul) : hôte listé joint (`curl` code 0) ; `http://example.com` refusé (403) ; `https://example.com`
refusé (code 7) ; sortie directe sans mandataire impossible (code 7). Le profil AppArmor de `bwrap` livré par Ubuntu
(`/etc/apparmor.d/bwrap-userns-restrict`) suffit.

À régler avant de l'activer (décision) : le générateur `bootstrap-organisation.py` ne pose pas encore `networkScope` ; la
liste exacte des hôtes nécessaires à Claude Code avec un jeton d'abonnement doit être relevée par un run réel ; `WebFetch`
des agents qui l'ont serait coupé (ce qui est voulu : c'est aussi un canal de fuite par l'URL).

### 3.4 Alternative : pare-feu par utilisateur (nftables `meta skuid`)

Ne vaut que si les agents ont leur propre uid (sinon il couperait aussi le serveur et la passerelle, qui sortent légitimement).
Coût : règles installées par root et chargées au démarrage ; filtrage par adresse IP et non par nom d'hôte (plages à tenir à
jour) ; il faut aussi fermer la boucle locale sauf les ports de Paperclip et de la passerelle, car `curl` sait parler
`gopher://` à n'importe quel port local (base PostgreSQL embarquée) ; aucun AppArmor en jeu. Le script ne touche à aucun
pare-feu.

### 3.5 (b) Le jeton d'abonnement dans l'environnement de l'agent

**Inévitable tant que la CLI `claude` s'authentifie elle-même.** Le jeton arrive par `CLAUDE_CODE_OAUTH_TOKEN`
(`bootstrap-organisation.py:147`, secret natif injecté au run) ; tout processus lancé par l'agent en hérite et
`curl file:///proc/self/environ` le lit. Un fichier d'identifiants dans la configuration Claude ou un `apiKeyHelper` ne
change rien : même compte, même lecture. La seule séparation réelle est une passerelle LLM qui détient la clé et que la
CLI joint par `ANTHROPIC_BASE_URL` ; elle est prévue pour une clé d'API, pas pour un jeton d'abonnement. Mesures
retenues : le confinement réseau (3.3) limite l'envoi du jeton aux hôtes listés ; un jeton par installation, révocable
seul.

Point à vérifier par l'opérateur avant toute installation chez un client : les conditions d'utilisation d'Anthropic pour
un abonnement personnel servant à faire tourner des agents pour un tiers ; la voie commerciale est la clé d'API
(conditions commerciales). Non vérifié ici.

## 4. Ce que `curl` peut encore atteindre après installation (liste honnête)

État : script appliqué, confinements natifs **non** activés (état livrable aujourd'hui).

**Lecture** (identité `atelier`) :
- tout `/opt/atelier-marketing-ia/instance/` : `instances/<id>/secrets/master.key` et `decision-signing.key`,
  `instances/<id>/.env` (`PAPERCLIP_AGENT_JWT_SECRET`, `PAPERCLIP_TOOL_ACTION_SIGNING_SECRET` : permettent de fabriquer des
  jetons d'agent), les fichiers bruts de la base (`db/`), `cles/passerelle-signature.pem`, `secrets/`, les registres
  `atelier-client/`, les configurations Claude de tous les agents, journaux de runs, exports ;
- `/proc/<pid>/environ` des processus du compte : jeton d'abonnement et jeton de run des autres agents en cours ;
- le code et `config/atelier.env` (sans secret) ;
- les fichiers lisibles par tous du système (`/etc/passwd`, etc.).

**Écriture** : `instance/` (base, clés, configurations d'agents : corruption ou sabotage possible) et le répertoire du compte,
dont `~/.config/systemd/user/` (un agent peut y déposer une unité qui démarrera avec le compte : persistance) et
`~/.local/bin/` (d'où l'importance d'un `claude` hors de ce dossier).

**Envoi** : n'importe quel hôte d'internet, tant que `networkScope` n'est pas activé.

**Plus atteignable** grâce au compte dédié : `~/.ssh`, documents, navigateurs, trousseaux du client et des autres comptes
(répertoires 0700/0750), toute écriture dans le code, les scripts, le plugin et la configuration.

Avec `networkScope: "allowlist"` : l'envoi se limite aux hôtes listés, à l'API Paperclip et aux serveurs MCP. Reste un canal
indirect : toute route qui lit une URL pour l'agent (routes de lecture de sources du plugin) peut porter des données dans
l'URL demandée (**probable**, non mesuré).
Avec en plus `filesystemScope: "workspace"` corrigé : la lecture se limite à l'espace de travail de l'agent, sa
configuration Claude et ses consignes ; le `/proc` des autres processus disparaît (`--proc` neuf et `--unshare-pid`). Le
jeton d'abonnement de l'agent lui-même reste lisible (3.5).

## 5. Pas à pas

Tout se lance depuis une copie git propre du dépôt, sur la machine du client, par le compte d'administration.
Le script ne copie que les fichiers **suivis par git** : jamais `instance/`, `config/*.env`, journaux ni données d'un
autre client.

```bash
# 0. Fiche du client hors dépôt (modèle : organisation/modeles/fiche-client.exemple.json, docs/exploitation.md section 17)
# 1. Simulation : n'écrit rien, affiche chaque commande
scripts/installer-chez-client.sh --fiche ~/fiche-client.json
# 2. Application (compte, dossiers, droits, unités, linger) ; s'arrête (code 4) tant que le socle n'est pas construit
sudo scripts/installer-chez-client.sh --appliquer --fiche ~/fiche-client.json
# 3. Construction par le compte d'administration, jamais par « atelier »
/opt/atelier-marketing-ia/scripts/preparer-socle.sh
/opt/atelier-marketing-ia/scripts/preparer-plugin.sh
# 4. Relance : remet les droits, démarre l'instance, attend /api/health (4 min au plus), nouveau-client à blanc puis réel
sudo scripts/installer-chez-client.sh --appliquer --fiche ~/fiche-client.json
```

Étapes manuelles ensuite, sous le compte (`sudo -u atelier -H bash`, le compte n'a pas de shell de connexion), dans
`/opt/atelier-marketing-ia` :

1. Jeton : `python3 -I scripts/bootstrap-organisation.py jeton --confirmer` (saisi par l'opérateur, jamais dans un script ni un fichier).
2. Clés de l'entreprise du client : `python3 -I scripts/bootstrap-organisation.py cles --entreprise <UUID> --confirmer` (docs/exploitation.md, section 11).
3. Passerelle : relancer le script (il active `atelier-passerelle@3190` dès que la clé existe).
4. Mode par entreprise du plugin (Paramètres), agents en pause jusqu'à la décision de l'opérateur (section 17, point 5).

Options utiles : `--compte`, `--code`, `--proprietaire` (défaut : l'appelant de sudo, jamais root ni le compte de service),
`--port`, `--port-db`, `--port-passerelle`, `--reel` (transmis à `nouveau-client`). Le script est idempotent : il ne
recrée rien, ne remplace jamais un fichier de réglages existant (il signale une différence) et n'exécute aucune
suppression, aucun `pkill`, aucun pare-feu, aucun AppArmor ni sudoers.

Disposition obtenue :

| Chemin | Propriétaire | Droits |
| --- | --- | --- |
| `/home/atelier` | `atelier` | 0700 ; contient `Projets/atelier-marketing-ia` (lien vers le code), `.config/atelier/atelier.env` (ports), `.config/systemd/user/` (4 unités), `.local/bin/` (pnpm) |
| `/opt/atelier-marketing-ia` | compte d'administration, groupe `atelier` | dossiers 2750, fichiers sans écriture de groupe, rien pour les autres |
| `/opt/atelier-marketing-ia/config/atelier.env` | idem | 0640, sans secret, `PAPERCLIP_HOME=/opt/atelier-marketing-ia/instance` |
| `/opt/atelier-marketing-ia/instance` | `atelier` | 0700 |

Les unités du dépôt (`scripts/systemd/`) fonctionnent sans modification : elles visent `%h/Projets/atelier-marketing-ia`,
qui est le lien. Les unités de sauvegarde et de mise à jour BCE ne sont pas installées : leur destination est propre au
poste de l'opérateur (à adapter, `docs/exploitation.md`, sections 7 et 16).

## 6. Vérifications

Faites par le script en fin d'application, et à refaire à la main :

```bash
id atelier                                     # aucun groupe sudo, admin, adm, docker, lxd, libvirt…
sudo -l -U atelier                             # « not allowed » : aucun droit sudo
stat -c '%U:%G %a %n' /home/atelier /opt/atelier-marketing-ia /opt/atelier-marketing-ia/instance
sudo runuser -u atelier -- test ! -w /opt/atelier-marketing-ia/scripts/lancer-instance.sh && echo "code en lecture seule"
sudo runuser -u atelier -- ls /home/<compte du client>     # doit échouer (Permission denied)
systemctl --user -M atelier@ status atelier-instance@atelier
journalctl --user -M atelier@ -u atelier-instance@atelier   # au premier démarrage : chercher « EACCES »
curl -fsS http://127.0.0.1:3100/api/health
```

**Non testé** : le démarrage du serveur avec un code en lecture seule (aucune écriture attendue hors de `PAPERCLIP_HOME`,
des caches du compte et de `/tmp`, mais pas mesuré). En cas d'`EACCES` sur un chemin du code, le signaler plutôt que
d'ouvrir tout le dossier en écriture.

## 7. Mise à jour

Par le compte d'administration : `git pull` dans la copie source, relance du script (copie des fichiers suivis, sans
suppression : un fichier retiré du dépôt reste dans `/opt` et se retire à la main), construction (étape 3), puis
`systemctl --user -M atelier@ restart atelier-instance@atelier`. `scripts/deployer.sh` est conçu pour le poste de l'opérateur
(copie du plugin dans `instance/plugin-jb`, arbres git propres) et ne s'utilise pas tel quel chez un client.

## 8. Retour arrière

Dans l'ordre, après un export du client (`docs/exploitation.md`, section 18) et une sauvegarde de `instance/` (base ET
`master.key`) :

```bash
systemctl --user -M atelier@ disable --now atelier-instance@atelier atelier-sante@atelier.timer atelier-passerelle@3190
sudo loginctl disable-linger atelier
# Données : purge du client si fin de contrat (section 18), puis seulement ensuite :
sudo userdel -r atelier                 # supprime /home/atelier (le lien, pas le code)
sudo rm -r /opt/atelier-marketing-ia    # code ET instance/ : irréversible, après sauvegarde vérifiée
```

Ces commandes destructives ne sont volontairement pas dans le script.
