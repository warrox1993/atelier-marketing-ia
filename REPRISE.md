# Reprise : Atelier Marketing IA

Dernière mise à jour : 15/10/2026, intégration des connecteurs dans l'usine (après les lots L6 à L9).
Seul responsable du code à cette date : l'intégrateur final. Historique : `git log`.

## État réel

- **Architecture** : plugin officiel Paperclip `atelier.marketing-ia` (`plugin-atelier/`,
  choix explicite de l'opérateur limité au système de plugins) + patch serveur isolé (P1, P2, régulateur,
  journal des compétences, suppression d'entreprise). Vue d'ensemble : `docs/architecture.md` ;
  contrats v1.4 : `docs/contrats.md` (§11 décisions du 15/10/2026, §12 plafonds, §13 données simulées).
- **Socle** : `paperclip/` = tag `v2026.1012.0` + 5 commits locaux (`socle/patches/`). Rien n'est poussé.
  Le patch `0005` met en « Ask first » par défaut toute action non `read` des cartes `atelier-*` et classe en écriture les
  verbes français de la passerelle (`docs/integrations.md`, « Intégration des connecteurs »).
  Le patch `0004` (lot L6) ajoute 11 cartes de galerie « passerelle marketing » (Google Search Console,
  Google Analytics 4, Google Ads, fiche d'établissement, Facebook, Instagram, LinkedIn, HubSpot, Pipedrive,
  Odoo, Teamleader) ; adresse par `PAPERCLIP_ATELIER_GATEWAY_URL` (défaut `http://127.0.0.1:3190`) ;
  libellé « (démonstration) » lu sur `GET /sante` de la passerelle. Détail et preuves : `docs/integrations.md`,
  section « Lot L6 ». **L'instance 3100 ne montre les cartes qu'après un redémarrage** (code chargé au démarrage).
- **Plugin** : migrations `001`, `002` (relances), `003` (plafonds), `004` (sources de connexion), worker, interface (six rubriques, dossier,
  décision, relance de correction, Reprendre, Diffuser), agents de démonstration (`demo/`).
- **Interface** : démarche Impeccable du lot C (captures `docs/captures/`, tests `tests/ui/`, e2e
  `tests/e2e/atelier/`, README du dossier) ; nouveaux panneaux de l'intégration sans nouvelle
  passe Impeccable (mêmes composants et jetons).
- **Organisation** : 10 agents marketing `claude_local` + agent déterministe `porte`
  (process) ; politiques alignées sur le circuit 1.1 ; bootstrap idempotent vérifié en mode réel.
- **Décisions de l'opérateur du 15/10/2026 appliquées** : aucun livrable non conforme accepté ni
  diffusé (relance humaine à leviers, levée de porte retirée) ; rejet = annulation native ;
  bouton Diffuser ; **priorité au mode réel** (les agents déterministes restent un banc de test).
- **Plafonds de dépenses (décision de l'opérateur du 15/10/2026)** : le client choisit un montant maximal ou
  « aucune limite ». Coûts IA = budgets natifs de Paperclip (0 = aucune limite), réglés dans
  Paramètres et tracés. Dépenses publicitaires = plafond par campagne et par entreprise
  (`plafondPub`, migration 003) ; engagé = dépensé + réservé ; le serveur refuse toute approbation
  ou diffusion qui dépasse, et toute dépense sans approbation à montant, canal et durée précis,
  même sans limite ; aucun choix = aucune dépense ; un agent ne modifie rien. Détail :
  `docs/contrats.md` §12, `docs/dictionnaire-etats.md` §11 ; scénario H.
- **Données simulées (lot L9)** : un agent dépose la réponse BRUTE d'un outil de la passerelle
  (`POST …/taches/:issueId/donnees-connexion`) ; le serveur en déduit le mode (enveloppe `_atelier`,
  mention, identifiants fictifs), refuse un mode déclaré ou une réponse sans enveloppe, retient les
  chiffres. La porte refuse un chiffre ou une source de démonstration sans la mention « démonstration »
  dans son paragraphe, sa liste, son tableau ou le titre de sa section (constat localisé), et toute
  donnée de démonstration dans une campagne réelle (campagne OU entreprise en mode réel) ; la
  diffusion réelle aussi. `atelier.sante` liste les 11 services de la passerelle (réel : Google
  implémenté par L4 mais jamais exécuté, les sept autres non implémentés). Détail : `docs/contrats.md` §13 ; scénario K.
  Les consignes des cinq rôles concernés (`organisation/agents/*/AGENTS.md`) la décrivent depuis
  l'intégration des connecteurs (identité d'abord, dépôt de chaque réponse, mention, aucun chiffre inventé).
- **Connecteurs dans l'usine (intégration du 15/10/2026)** : « Connecter » ouvre la carte native du service ;
  connexions réservées par rôle par `bootstrap-organisation.py appliquer` (relancer après chaque nouvelle connexion) ;
  écritures en « Ask first » ; mode effectif affiché dans la campagne et appliqué à la diffusion ; scénario A complet
  (33 OK). Détail : `docs/integrations.md` ; preuves : `docs/resultats-tests.md`.
- **Instances** :
  - principale `atelier` (3100) : utilisée par l'opérateur, mise à jour par la session principale ;
    ne pas l'arrêter ni y réinstaller le plugin depuis une autre session.
  - essai `atelier-lotz` (3320, PG 54520, intégration des connecteurs, passerelle de démonstration sur 3391) :
    arrêtée ; données dans `instance/instances/atelier-lotz/` (entreprises « Rénovation Liège » avec trois connexions
    de cartes, scénarios A, dossiers e2e).
  - essai `atelier-lot9` (3260, PG 54460, données simulées) : arrêtée ; données dans
    `instance/instances/atelier-lot9/`.
  - essai `atelier-loth` (3220, plafonds) : arrêtée ; données dans `instance/instances/atelier-loth/`.
  - essai `atelier-lot6` (3240, PG 54440, cartes de galerie L6) : arrêtée ; données dans
    `instance/instances/atelier-lot6/` (entreprise « Essai L6 (démonstration) », 2 connexions de démonstration).
  - essais `atelier-lota` (3120), `atelier-lotc` (3140), `atelier-lote` (3180, intégration
    finale) : arrêtées ; données dans `instance/instances/<id>/`.

## Ce qui est prouvé

Voir `docs/resultats-tests.md` (commandes, sorties, dates) et `docs/tracabilite.md`.

## Limites et points ouverts

- Mode réel jamais exécuté : `claude setup-token` par l'opérateur, puis `bootstrap-organisation.py jeton
  --confirmer` et `test-reel --confirmer` (`README.md` §3, `docs/checklist-usage-reel.md`).
- `curl` des agents réels non borné : `networkScope: "allowlist"` (stable dans l'adaptateur,
  Bubblewrap présent) non activé faute de pouvoir valider la liste d'hôtes sans run réel.
- Lecture d'URL du plugin non exposée comme outil Claude : les agents passent par les routes.
- Aucun connecteur de diffusion ni de mesure ; recherche Web absente ; pause de campagne
  indisponible (limite du socle).
- Suite serveur complète non lancée. Scénario A joué avec les agents de démonstration seulement.
- Une connexion ajoutée par une carte reste ouverte à tous les agents jusqu'au prochain `appliquer`.
- Tâches parallèles d'un même agent : le socle peut annuler un run qui a déjà écrit puis bloquer la tâche sans
  rejeu (vu une fois au scénario A) ; reprise humaine (« Reprendre ») nécessaire.
- Diffusion réelle des réseaux sociaux et CRM : preuve d'approbation signée (Ed25519) attendue par la passerelle,
  non implémentée dans le plugin (`docs/passerelle.md`).
- Commentaires natifs de relance et de rejet signés par le plugin (attribution humaine non
  demandée : capacité supplémentaire).

## Prochaine étape

1. L'opérateur fournit le jeton ; premier run réel minimal (`test-reel --confirmer`), puis une campagne
   de test sur l'entreprise fictive avec budgets bas ; trancher `networkScope`.
2. Connecteurs (étude : commit `1fcf74a`).
3. Instance 3100 de l'opérateur : la redémarrer pour charger le patch `0005` (serveur lancé sur les sources), avec la passerelle
   sur 3190 ; puis `bootstrap-organisation.py appliquer` après chaque nouvelle connexion.

## Commandes utiles

```bash
cd ~/Projets/atelier-marketing-ia
scripts/verifier-config.sh
scripts/demonstration.sh                                     # démonstration en une commande
scripts/instance-essai.sh demarrer atelier-lote 3180 54380   # instance d'essai isolée (premier plan)
python3 -I scripts/scenarios/atelier_scenarios.py G http://127.0.0.1:3180/api   # B C D E F G H K S J
python3 -I scripts/scenarios/atelier_scenarios.py A http://127.0.0.1:3320/api   # A : passerelle de démonstration requise (README §2)
scripts/tests-serveur.sh                                     # tests serveur de l'atelier, environnement vierge
(cd plugin-atelier && pnpm typecheck && pnpm test && pnpm build)
```

Recharger le worker après `pnpm build` : `POST /api/plugins/atelier.marketing-ia/disable` puis `/enable`.

## Retour arrière

- Plugin : `POST /api/plugins/atelier.marketing-ia/disable` puis
  `paperclipai plugin uninstall atelier.marketing-ia --force` (purge ses données).
- Socle : `git -C paperclip reset --hard eacb9dcaa` revient avant les patches 0002 et 0003
  (destructif : sur décision seulement).
- Instances d'essai : supprimer `instance/instances/atelier-lot*/` (instances arrêtées).
