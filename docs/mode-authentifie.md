# Passer l'atelier en mode authentifié

Aujourd'hui, l'instance tourne en mode `local_trusted` : toute requête qui arrive sur la machine sans jeton
est traitée comme celle de l'administrateur `local-board`. Le mode `authenticated` ajoute une seconde barrière :
chaque personne se connecte avec son compte (adresse e-mail et mot de passe), les scripts utilisent une clé,
les agents leur propre jeton. C'est aussi le préalable à un portail client et à des rôles.

Le passage se fait avec `scripts/passer-en-mode-authentifie.sh`. Il a été prouvé de bout en bout sur l'instance
d'essai `atelier-e2e` (port 3590) le 22/10/2026, aller et retour.

## Ce que fait le script

Chaque lancement relit l'état de l'instance et reprend à l'étape suivante : on peut le relancer sans risque.

1. **Sauvegarde** de `config.json` et de la surcharge éventuelle dans `instance/instances/<id>/mode-authentifie/`.
2. **Surcharge** `config/atelier-auth.env` (instance d'essai : `instance/instances/<id>/atelier-auth.env`) avec
   `PAPERCLIP_DEPLOYMENT_MODE=authenticated` et `PAPERCLIP_DEPLOYMENT_EXPOSURE=private`, puis redémarrage.
   `config/atelier.env` et `config.json` ne sont jamais modifiés : la surcharge, lue par `scripts/lancer-instance.sh`
   après `config/atelier.env`, suffit, et la supprimer suffit à revenir.
3. **Réclamation de l'instance** : au démarrage, Paperclip affiche une adresse à usage unique (`/board-claim/…`,
   valable 24 h). Le script l'affiche dans le terminal (elle n'est écrite dans aucun fichier du dépôt) et attend.
4. **Clé des scripts** : le script ouvre une demande d'autorisation (`/cli-auth/…`, valable 10 minutes) et affiche
   son adresse. Une fois approuvée, il crée une clé « board » sans date d'expiration, l'écrit dans
   `~/.config/atelier/board-<port>.key` (droits 0600, hors dépôt) et révoque la clé temporaire de la demande.
5. **Réaffectations** : les cartes en attente et les tâches ouvertes adressées à `local-board` passent au compte de
   JB (sinon plus personne ne les verrait) ; le réglage `humainDestinataire` du plugin est posé sur ce compte dans
   chaque entreprise où il était vide. Les identifiants touchés sont notés pour le retour arrière.
6. **Inscriptions fermées** (`PAPERCLIP_AUTH_DISABLE_SIGN_UP=true`), redémarrage, contrôles : sans jeton, l'API
   refuse (HTTP 403 « Board access required ») ; avec la clé, elle répond ; le plugin est prêt.

## Ce que l'opérateur devra faire lui-même

Deux gestes dans son navigateur, sur la tour, pendant que le script attend (30 minutes au plus, puis relancer) :

1. Ouvrir `http://127.0.0.1:3100/auth`, cliquer sur « Create one », saisir son nom, son adresse e-mail et **un mot
   de passe de son choix** (personne d'autre ne le connaît : ni Claude, ni le script). Puis ouvrir l'adresse
   `/board-claim/…` affichée par le script et cliquer sur « Claim ownership ».
2. Ouvrir l'adresse `/cli-auth/…` affichée ensuite et cliquer sur « Approve CLI access ».

Le premier compte devient administrateur de l'instance et propriétaire de toutes les entreprises. Les inscriptions
sont ensuite fermées : un second compte ne peut plus être créé par le formulaire (refus vérifié :
`EMAIL_PASSWORD_SIGN_UP_DISABLED`).

## Commandes

```sh
scripts/passer-en-mode-authentifie.sh --a-blanc            # liste ce qui serait fait, n'écrit rien
scripts/passer-en-mode-authentifie.sh --redemarrer         # bascule de l'instance réelle (redémarre par systemd)
scripts/passer-en-mode-authentifie.sh --revenir --redemarrer   # retour au mode local_trusted
scripts/passer-en-mode-authentifie.sh --essai [ID PORT PORT_PG]  # même chose sur une instance d'essai
```

Sans `--redemarrer`, le script s'arrête avec le code 3 au moment de redémarrer l'instance réelle et affiche la
commande (`systemctl --user restart atelier-instance@atelier`) ; il suffit de le relancer ensuite. Le code 3 signale
aussi qu'un geste de l'opérateur est attendu.

## Effets sur le reste de l'atelier

- **Scripts** (`bootstrap-organisation.py`, `declarer-services.py`, `releve-couts.py`, `sante-atelier.sh`,
  `deployer.sh`, `transferer-instance.sh`, et pour l'Observatoire `confier.py`, `photo_obs.py`, `outils.sh`) : ils lisent la clé dans `~/.config/atelier/board-<port>.key` si le
  fichier existe, m'appartient et est en 0600 ; sinon ils appellent sans jeton, comme avant. La clé ne passe jamais
  dans les arguments d'une commande. Une clé d'une autre instance (autre port) n'est jamais envoyée.
- **Gardien des connexions** (agent `process`, commande `bootstrap-organisation.py assurer-connexions`) : même règle,
  il tourne sous le compte de l'opérateur et trouve le fichier de clé tout seul.
- **Agents** : rien à changer. Paperclip leur remet un jeton propre à chaque passage ; un jeton d'agent ne donne
  accès qu'à sa propre entreprise (vérifié : 200 sur son entreprise, 403 ailleurs, 401 après révocation).
- **Pages de captation** (`atelier-pages.service`) et **passerelle WhatsApp** : ajouter dans leur fichier
  d'environnement (`~/.config/atelier/pages.env`, `~/.config/atelier/whatsapp.env`) la ligne
  `ATELIER_CLE_BOARD_FICHIER=~/.config/atelier/board-3100.key`, puis redémarrer le service.
  Sans cette ligne, le dépôt d'un formulaire et les décisions par WhatsApp seraient refusés (403).
- **Plugin** : les blocages de revue et les messages destinés à l'humain vont au compte de l'opérateur
  (`humainDestinataire`), plus à `local-board`.

## Effets sur le portable

Le portable passe par le tunnel `tailscale ssh … -L 3100:127.0.0.1:3100`, puis `http://localhost:3100` : la page de
connexion s'affiche à la place de l'atelier. JB s'y connecte avec le même compte ; la session est gardée par le
navigateur. Une adresse de l'atelier ouverte sans session renvoie vers `/auth` sans montrer aucune donnée.
Pour un accès par `tailscale serve`, la surcharge `config/atelier-distant.env` reste celle décrite dans
`config/atelier-distant.env.exemple` (elle impose déjà le mode authentifié).

## Retour arrière

`scripts/passer-en-mode-authentifie.sh --revenir --redemarrer` défait tout dans l'ordre inverse : réglage
`humainDestinataire` rétabli, cartes et tâches encore en attente rendues à `local-board`, clé des scripts révoquée
et son fichier supprimé, surcharge retirée (une copie reste dans `instance/instances/atelier/mode-authentifie/`),
redémarrage, contrôle que l'API répond sans jeton et que le plugin est prêt. Le compte de l'opérateur reste dans la base,
sans effet en `local_trusted` ; s'il rebascule plus tard, il n'y aura plus de réclamation, seulement l'autorisation
de la clé. En cas d'urgence, supprimer `config/atelier-auth.env` puis redémarrer l'instance suffit à rendre l'accès
sans compte (les réaffectations restent alors à défaire avec `--revenir`).
