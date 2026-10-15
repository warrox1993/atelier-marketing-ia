# Checklist avant utilisation réelle

À cocher par l'opérateur avant de confier un vrai client à l'atelier. Chaque ligne renvoie à la preuve
ou à la procédure. Rien ici n'est fait automatiquement.

## Accès nécessaires

- [ ] Jeton d'abonnement Claude créé par l'opérateur lui-même (`claude setup-token`), enregistré dans le
      coffre de secrets natif de Paperclip, jamais dans un fichier (`README.md`, « Activer le
      mode réel »).
- [ ] Un `CLAUDE_CONFIG_DIR` dédié par agent (`instance/claude-config/<slug>/`), jamais
      le `~/.claude` de l'opérateur (`docs/guide-agents-competences.md`).
- [ ] Budgets mensuels posés par agent et par entreprise (`docs/exploitation.md` §5).
- [ ] Une entreprise Paperclip par client (frontière dure d'isolement ; deux projets d'une
      même entreprise ne sont pas isolés entre eux).
- [ ] **Clés de signature générées** (une étape, un geste) :
      `python3 -I scripts/bootstrap-organisation.py cles --confirmer`. Elle crée la paire Ed25519 du
      plugin (preuves d'approbation : clé privée rangée comme secret natif de l'entreprise et référencée
      par `approbationClePrivee`, jamais sur disque) et celle de la passerelle (signature des réponses :
      clé privée dans un fichier 0600 sous `instance/cles/`, clé publique dans `passerelleClesPubliques`),
      puis écrit `instance/passerelle.env` (non suivi). Relancer ensuite la passerelle avec ce fichier
      (`set -a; source instance/passerelle.env; set +a; npm start`). Contrôle : la passerelle journalise
      « réponses d'outils signées » avec l'empreinte de sa clé ; `bootstrap-organisation.py cles` (sans
      `--confirmer`) affiche l'état sans rien écrire. Sans ces clés, aucune donnée de connexion n'est tenue
      pour réelle et toute diffusion reste « préparée ». Rotation, perte et sauvegarde des clés :
      `docs/exploitation.md` §11.
- [ ] Les clés sont sauvegardées hors machine avec le reste (`instance/cles/` et le coffre de
      Paperclip, `docs/exploitation.md` §11) : sans elles, il faut une rotation, pas une restauration.

## Contrôles techniques

- [ ] `scripts/verifier-config.sh` : configuration conforme (boucle locale, télémétrie coupée,
      aucun secret).
- [ ] Sauvegarde puis restauration rejouées sur une instance d'essai avec `pg_dump`
      (`docs/exploitation.md` §4) ; dossier `data/backups/` copié hors machine.
- [ ] Un run réel minimal d'un agent `claude_local` en mode réel, sur une campagne de test,
      avec plafond de budget bas ; vérifier dans « Équipe » que les compétences passent à la
      source « dernier run » avec leur empreinte.
- [ ] Lecture d'URL : en réel, interdire `curl` vers l'extérieur dans les outils autorisés et
      passer par les routes du plugin (l'outil d'agent n'est pas branché).

## Limites constatées à accepter ou à lever

- Diffusion réelle : le plugin signe la preuve d'approbation (contrats v1.5, §14) et la passerelle
  la vérifie, mais aucune écriture n'a été exécutée contre une vraie plateforme (fournisseurs
  réels testés contre de faux serveurs seulement) ; sans les clés de l'étape ci-dessus, une diffusion
  approuvée reste « préparée ». Aujourd'hui seul le rôle CRM conversion a un accès en écriture
  (registre `connexions`) : Contenus, SEO, SEA et Mesure sont en lecture seule (`docs/integrations.md`).
- Recherche Web non connectée.
- Pause et reprise de campagne indisponibles (limite du socle) : mettre en pause les agents.
- Reprise après arrêt du serveur : la tâche interrompue reste bloquée jusqu'à la
  réconciliation humaine native (`REPRISE.md`, scénario E).
- Système de plugins « alpha surface » selon l'amont (utilisé par choix explicite de l'opérateur).
- Base embarquée mono-machine ; une seule personne (`local_trusted`).
- Un livrable non conforme n'est jamais accepté : au-delà des cycles, seule la relance humaine
  (au moins un levier) le remet en production.
