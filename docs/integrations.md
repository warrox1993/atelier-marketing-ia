# Rapport des intégrations : réel testé, non testé, partiel, absent

Date : 15/10/2026. « Testé » veut dire exécuté ce jour contre une instance réelle ou par un test
automatisé, avec la preuve citée ; une configuration enregistrée ne vaut pas preuve. Le même
classement est affiché dans l'interface (Paramètres et diagnostic, `atelier.sante`).

| Intégration | État | Preuve ou raison |
| --- | --- | --- |
| Moteur Paperclip (tâches, politiques review/approval, réveils, checkout, budgets, secrets) | **réel testé** | scénarios B à G et S, J sur instances d'essai (`instance/scenarios/*.json`) ; `docs/matrice-capacites.md` |
| Gardes serveur P1, P2, régulateur, journal des compétences | **réel testé** | `scripts/tests-serveur.sh` (fichiers `atelier-*.test.ts`) ; scénarios B, C, F |
| Adaptateur `process` (agents de démonstration) | **réel testé** | scénarios B à G : runs natifs réels, aucun modèle |
| Adaptateur `claude_local` (Claude Code, mode réel) | **implémenté, non testé** | configuration des 10 agents (`organisation/.paperclip.yaml`) et tests unitaires de l'amont ; aucun run réel : il faut `claude setup-token` par l'opérateur puis le secret natif (`README.md`, « Activer le mode réel ») |
| Compétences réellement transmises à un run | **partiel** | inventaire clé + SHA-256 consigné par le patch (`atelier-competences.test.ts`) ; jamais observé sur un run `claude_local` réel |
| Lecture d'URL protégée (anti-SSRF) et vérification de liens | **réel testé** | `tests/securite.spec.ts` ; lecture réelle d'`https://example.com/` (scénario S, `ATELIER_TEST_RESEAU=1`) ; corpus de démonstration dans les scénarios C, D |
| Lecture d'URL comme OUTIL d'un agent `claude_local` | **absent** | les routes du plugin existent, l'exposition comme outil d'agent n'est pas branchée ; en réel, interdire `curl` vers l'extérieur et passer par les routes (constat 7 du lot B) |
| Import texte, Markdown, CSV | **réel testé** | `tests/securite.spec.ts` ; scénario S (CSV accepté, formule neutralisée, `.exe` refusé, injection signalée) |
| Information apportée par l'humain (relance) | **réel testé** | scénario G : source de provenance `humaine` |
| Recherche Web | **partiel : outil natif de l'agent, non vérifié** | en mode réel, les agents `claude_local` dont `--allowedTools` contient `WebSearch` (Veille, SEO local GEO, Relecteur dans le registre) l'ont nativement ; aucun run réel n'a encore prouvé l'usage. Paramètres l'affiche « Disponible en mode réel (outil natif de l'agent), non vérifié » (lot L8) |
| Diffusion (réseaux sociaux, e-mail, publication de site, publicité) | **absent (contrat seulement)** | en démonstration : `simulee` après approbation ; en réel : `preparee` (rien n'est envoyé) ; bouton « Diffuser » désactivé avec la raison « aucun connecteur de publication » ; côté passerelle, les outils de publication réels n'exécutent qu'avec une preuve d'approbation signée par le plugin (Ed25519), une seule fois par clé d'idempotence : **la signature côté plugin reste à faire** (`docs/passerelle.md`, « Changement attendu côté plugin ») |
| Google Search Console (`gsc_requete_performances`) | **implémenté, non testé en réel** | passerelle `src/reel/google/` (lot L4, `docs/passerelle.md` « Fournisseurs Google réels (L4) ») : tests contre un faux Google local (`tests/reel-google/`, 39 tests) et parcours prouvé sur l'instance d'essai `atelier-lot4` (connexion générique et carte L6, appel d'outil par Paperclip) ; aucun compte Google : rien n'a touché les vraies API |
| Google Analytics 4 (`ga4_rapport`) | **implémenté, non testé en réel** | idem ; Data API `v1beta` (version de référence de la documentation, pas de `v1`) |
| Google Ads (`ads_recherche`) | **implémenté, non testé en réel** | idem ; API `v26`, sans jeton développeur (supprimé par Google le 09/09/2026) ; niveau d'accès du projet Google Cloud à demander |
| Fiche d'établissement (`gbp_avis`, `gbp_metriques`) | **implémenté, non testé en réel** | idem ; exige l'accès Business Profile accordé par Google (fiche vérifiée depuis plus de 60 jours) |
| Réseaux sociaux (Facebook, Instagram, LinkedIn) et CRM (HubSpot, Pipedrive, Odoo, Teamleader) | **implémenté, non testé en réel** | passerelle `src/reel/social-crm/` (`docs/passerelle.md`, « Fournisseurs réseaux sociaux et CRM réels ») : mêmes outils que la démonstration L7, 76 tests contre des faux serveurs locaux (`tests/reel-social-crm/`), aucun compte réel ; connexion « en un clic » par le serveur d'autorisation de la passerelle (OAuth, ou adresse et clé d'API pour Odoo et Pipedrive) ; en démonstration, connectable comme avant. Sans connexion, la rubrique Résultats affiche « non mesurable » |
| Sauvegarde de la base (`pg_dump` 18.6) | **réel testé** | `docs/exploitation.md` §3.3 et §4 (cycle sauvegarde, sinistre, restauration du 15/10/2026) |
| Pause et reprise de campagne | **absent (limite du socle)** | Paperclip ne met un projet en pause que par budget ; boutons désactivés avec la raison |
| PostgreSQL externe, déploiement partagé, Azure | **non testé** | note séparée `docs/evolution-deploiement.md` ; aucune infrastructure créée |

## Lot L8 : tableau « Connecteurs » des Paramètres lu dans les connexions natives (15/10/2026)

Le tableau ne maintient plus de liste figée : l'interface lit l'état réel des connexions natives de Paperclip.
Code : `plugin-atelier/src/ui/connexions-natives.ts` (seul module qui appelle ces routes, validé par Zod),
`plugin-atelier/src/ui/connecteurs.tsx` (affichage). Tests : `plugin-atelier/tests/ui/connexions-natives.spec.tsx`,
avec des réponses réelles relevées sur une instance d'essai dans `plugin-atelier/tests/ui/fixtures/`.

**Routes natives utilisées (hors contrat du SDK, lecture seule, même origine)**

- `GET /api/companies/:id/tools/connections` renvoie `{ connections: [...] }`. Champs lus : `id`, `name`, `status`
  (`draft|active|disabled|archived`), `enabled`, `healthStatus` (`ok|unchecked|degraded|failed|error|missing_secret`),
  `healthMessage`, `healthCheckedAt`, `lastUsedAt`, `config.url`, `config.oauth.scope(s)`. Tout le reste (références
  de secret, métadonnées OAuth) est ignoré dès l'analyse.
- `GET /api/companies/:id/agents` renvoie une liste. Champs lus : `adapterType`, `status`, `adapterConfig.extraArgs`
  (`--allowedTools`, `--disallowedTools`) et la seule PRÉSENCE de `adapterConfig.env.CLAUDE_CODE_OAUTH_TOKEN` ou
  `ANTHROPIC_API_KEY` (`secret_ref`, ou valeur masquée `***REDACTED***` par l'hôte). Le jeton n'est jamais lu ni affiché.
- Si la forme change, l'interface affiche « Fonction indisponible » (aucun état inventé) ; HTTP 401 ou 403 : « Accès refusé ».

**Correspondance avec les six états** : service reconnu par la carte qui a créé la connexion (`config.sourceTemplateKey`,
`atelier-<service>`) ou, pour une connexion générique, par l'URL de boucle locale `/mcp/<service>` ; mode « démonstration » si le nom
se termine par « (démonstration) » (donné par le socle aux connexions des cartes en démonstration) ou si la portée OAuth est
`demonstration`, sinon « réel ».
Brouillon : non connecté ; désactivée ou archivée : indisponible ; santé `failed|error|missing_secret` : erreur ;
démonstration active : démonstration ; réel avec santé `ok` et un appel d'outil enregistré (`lastUsedAt`) : réel testé,
sinon configuré non vérifié.

**Bouton « Connecter »** (remplacé le 15/10/2026, intégration des connecteurs) : il ouvre la carte de galerie NATIVE du service,
`/:prefix/apps/connect?source=atelier-<service>` (route `apps/connect` de `paperclip/ui/src/App.tsx`, lien construit comme
`appSourceConnectHref` de `ui/src/pages/apps/app-connect-policy.ts` ; HubSpot = `atelier-hubspot`, servi par `/mcp/crm`). Un brouillon
est repris par `&resume=<connexion>` ; « Gérer » ouvre l'onglet Permissions de la connexion (`/:prefix/apps/<id>/permissions`).
L'ancien lien générique « byo » et l'adresse à coller ont disparu. L'atelier n'écrit jamais dans les connexions.
Le tableau se relit au retour sur l'onglet et par « Relire les connexions ».

**Limites connues**

1. Le mode est déduit de la portée OAuth ; `atelier_identite` (appel d'outil) le confirmerait mais l'interface n'appelle aucun outil.
2. « Réel testé » s'appuie sur `lastUsedAt` (dernier événement d'appel d'outil, y compris refusé) : l'issue de l'appel n'est pas relue
   (il faudrait un `runId` pour `tools/runs/:runId/decisions`). Aucun service n'est encore en mode réel.
3. L'adaptateur Claude Code n'est jamais « réel testé » ici (un run réussi se voit dans la vue Équipe).
4. Le diagnostic du worker (`atelier.sante`) garde encore ses anciennes lignes figées (Google, CRM : « non implémenté »), reprises par
   `connexionsNecessaires` d'une campagne réelle : à aligner côté `src/serveur/` (hors périmètre du lot L8, voir lot L9).
5. HubSpot officiel (MCP distant hors passerelle) n'est pas reconnu : seules les connexions de la passerelle (boucle locale) le sont.

## Lot L6 : cartes de galerie de la passerelle marketing (patch socle `0004`, 15/10/2026)

Décision de l'opérateur : de vraies cartes dans la galerie de connexions de Paperclip (« un clic », sans coller d'adresse).
Patch `socle/patches/0004-feat-atelier-local-cartes-de-galerie-de-la-passerell.patch` (commit `677102b90` de la
branche `atelier-marketing`, 129 861 octets, 41 fichiers).

| Élément | Où | Choix |
| --- | --- | --- |
| 11 définitions d'applications | `paperclip/packages/shared/src/app-definitions/atelier-*.json` | slug préfixé `atelier-` (aucune collision avec une future définition amont) ; nom, description française, catégorie `marketing` (ajoutée au type et au validateur), instructions d'agent (`agentInstructions`, appel d'`atelier_identite` d'abord), méthodes `lecture` (choix par défaut d'un clic) et `publication` |
| Portées | méthode `lecture` / `publication` (`defaults.scopesHint`) et `doc/connections/tool-method-permission-reviews.json` | sources lues le 15/10 : Search Console `webmasters.readonly` / `webmasters` ; GA4 `analytics.readonly` / + `analytics.edit` ; Google Ads et fiche d'établissement : une seule portée (`adwords`, `business.manage`), séparation par la politique d'actions ; Facebook `pages_show_list`, `pages_read_engagement`, `pages_read_user_engagement` / + `pages_manage_posts`, `pages_manage_engagement` ; Instagram `instagram_business_basic` / + `instagram_business_content_publish` ; LinkedIn `r_organization_social` / + `w_organization_social` ; HubSpot `crm.objects.{contacts,deals}.read` / + `.write` ; Pipedrive `contacts:read deals:read` / `contacts:full deals:full`. **Odoo et Teamleader : aucune portée** (modèle non vérifié dans leur documentation, mode réel absent de la passerelle) |
| Adresse de la passerelle | `PAPERCLIP_ATELIER_GATEWAY_URL` (serveur Paperclip), défaut `http://127.0.0.1:3190` | lue au démarrage (valeur invalide = refus de démarrer) et à chaque lecture de la galerie ; réécrit `serverUrl` et `urlPatterns` des seules définitions `atelier-*` (`server/src/services/atelier-gateway.ts`). Seule l'adresse **de boucle locale configurée** est exemptée de la règle HTTPS des définitions curées ; toute autre adresse doit être en HTTPS |
| Mode démonstration | `GET <passerelle>/sante` (cache 15 s) | en `demonstration` : nom « … (démonstration) », description préfixée « Démonstration : données fictives, aucune activité réelle », la connexion créée porte ce nom, et **aucune portée n'est demandée** (le serveur d'autorisation de démonstration n'accepte que sa portée `demonstration`) ; en `reel` : portées de la méthode choisie ; passerelle muette ou service non servi : carte « Unavailable » avec la raison, et refus de la connexion (`atelier_gateway_unavailable`) |
| Icônes | `ui/public/brands/apps/atelier-*.svg` (+ `-dark`) | **pictogrammes génériques dessinés pour l'atelier, aucune marque** : Google exige une autorisation préalable pour ses logos (<https://partnermarketinghub.withgoogle.com/brands/google/trademarks-and-terms/terms-and-conditions/>) ; les conditions de Meta, LinkedIn, HubSpot, Pipedrive, Odoo et Teamleader n'ont pas été vérifiées. Écart assumé au `CONNECTOR-PLAYBOOK.md` (Phase 4 : marque officielle) |
| Masquage Google (« visibility hold ») | `ui/src/pages/apps/Browse.tsx` (`GOOGLE_CONNECTOR_SLUGS`) | le filtre ne vise que les `appSlug` de `GOOGLE_WORKSPACE_CONNECTOR_PROFILES` (Gmail, Drive…) ; nos slugs n'y sont pas : vérifié par test (`atelier-app-definitions.test.ts`, `Browse.test.tsx`) et par la capture |

Tests ajoutés ou ajustés (tous verts le 15/10) :

- `packages/shared/src/atelier-app-definitions.test.ts` (15 tests : schéma, chemins, portées, méthode par défaut,
  masquage Google, catégorie) ; `app-definitions.test.ts` : compte de la vitrine 59 → 70 (59 amont + 11).
- `server/src/__tests__/atelier-marketing-apps.test.ts` (9 tests, base PostgreSQL embarquée, passerelle simulée) :
  adresse par défaut et par variable, refus des adresses invalides, exemption HTTPS limitée à la boucle locale
  configurée, portées rétablies en réel ; route de galerie en démonstration, en réel (service non servi =
  indisponible) et passerelle muette ; connexion complète en démonstration (DCR, sans `scope`, `resource` exact,
  catalogue, `active`) ; portées exactes par méthode en réel et refus d'élargissement.
- `ui/src/pages/apps/Browse.test.tsx` : un test ajouté (cartes visibles malgré le masquage Google, une seule ligne
  HubSpot) ; dans trois tests amont, le fournisseur fictif d'agrégateur « HubSpot » est renommé « Salesforce »,
  assertions inchangées : HubSpot étant désormais une carte native, la galerie fusionne volontairement la route
  Composio ou Arcade du même nom dans notre carte (règle amont « les définitions natives priment »).
- Vérifications : `pnpm --filter @paperclipai/{shared,server,ui} typecheck` = 0 ; build `shared`, `server` et `ui`
  (`vite build` vers un dossier temporaire, pour ne pas toucher `paperclip/ui/dist` servi par l'instance 3100) = 0 ;
  `node scripts/check-app-brand-assets.mjs` (92 identités) et `node --test scripts/app-brand-validation.test.mjs`
  (13/13) ; lot ciblé final : 8 fichiers, 407 tests verts (`atelier-marketing-apps`, `app-definitions`, `atelier-app-definitions`, `app-brand-assets`, `AppLogo.brand-assets`, `Browse`, `AppsConnect`, `generic-mcp-connection`), `tsc --noEmit` du serveur = 0 ; rejeu `git am` de 0001 à 0004 sur `v2026.1012.0` : arbre `1691e75434451cd495318d823423797b44741cc0`, identique à la branche.

Essai réel (instance `atelier-lot6`, 3240, PG 54440, passerelle `node dist/src/demarrer.js` en démonstration sur
3291, état OAuth dans un dossier temporaire ; `PAPERCLIP_ATELIER_GATEWAY_URL=http://127.0.0.1:3291`) :

- `GET /api/companies/:id/tools/gallery` : 11 cartes « … (démonstration) », adresses `http://127.0.0.1:3291/mcp/<service>`
  (HubSpot → `/mcp/crm`).
- Clic joué par l'API de l'interface (`POST …/tools/apps/connect` `{galleryKey, connectionMethodKey}`, puis
  `POST /api/tools/oauth/:id/start`, consentement de la passerelle par requêtes HTTP, rappel
  `/api/tools/oauth/callback` = 200, `POST …/finish`) :
  - Search Console, méthode `lecture` : DCR, aucune portée demandée, `resource=http://127.0.0.1:3291/mcp/gsc` ;
    connexion « Google Search Console (démonstration) » `active`, santé `ok`, catalogue `atelier_identite` et
    `gsc_requete_performances`. Appel d'outil par la passerelle de Paperclip (`POST /api/tool-connections/:id/test-calls`,
    agent `process` d'essai) : `decision: allowed`, réponse « Données de démonstration : aucune activité réelle »,
    `mode: demonstration`, propriété `sc-domain:renovation-liege.example`.
  - HubSpot, méthode `publication` : connexion « HubSpot (démonstration) » `active`, catalogue `atelier_identite`,
    `crm_contacts`, `crm_transactions`, `crm_modifier_contact` (écriture).
- Captures headless (Playwright de `tests/e2e/atelier/node_modules`, Chromium sans fenêtre) :
  `docs/captures/galerie-cartes-atelier-light.png` et `…-dark.png` (11 cartes après filtre « démonstration »).
- Premier essai : refus « Connection server URL must use HTTPS » (contrôle des définitions curées,
  `normalizeConnectionMethodConfig`), non vu par les tests qui simulaient une passerelle en HTTPS ; corrigé par
  l'exemption de la seule adresse de boucle locale configurée, test ajouté.

**Correction du 15/10/2026 (patch socle `0006`, suite à la revue de sécurité §5)** : les cartes de galerie sont alignées
sur les fournisseurs réels de la passerelle.

- **Cartes Google en lecture seule (variante A du §5.1)** : la méthode `publication` est retirée des quatre cartes
  (Search Console, GA4, Ads, fiche d'établissement). La passerelle Google n'a aucun outil d'écriture et refuse les
  portées `webmasters` et `analytics.edit` (`invalid_scope`) ; pour Ads et la fiche, la méthode réussissait sans rien
  apporter. Chaque carte n'a plus que `lecture`. Les quatre revues `publication` correspondantes sont retirées de
  `doc/connections/tool-method-permission-reviews.json` (une revue par méthode, ni plus ni moins). Une connexion
  `publication` sur ces cartes est désormais refusée par `connectGalleryApp` (test serveur).
- **Portées complétées** (source : `porteesPermises` de `passerelle/src/reel/social-crm/connecteurs.ts`, relues dans
  `docs/passerelle.md`, « Choix par plateforme ») : Facebook `read_insights` (lecture et publication) et
  `pages_messaging` (publication seule : messages de Page) ; Instagram `instagram_business_manage_insights` (lecture et
  publication) ; LinkedIn `rw_organization_admin` (lecture et publication). La lecture ne contient aucune portée
  d'écriture (test) ; publication = lecture + portées d'écriture. `rw_organization_admin` donne aussi l'écriture sur
  l'administration de la page LinkedIn (c'est le nom de la portée) : la passerelle ne l'emploie qu'en lecture
  (`organizationAcls`, statistiques). Mêmes listes dans `requestedScopes` des revues, `supportedActions` complétées.
- Le réglage « Ask first » du patch 0005 ne référence aucune méthode par clé (`methodKey` est ignoré, tout slug
  `atelier-*`) : inchangé, il continue de couvrir tous les outils qui ne sont pas des lectures.
- Tests mis à jour : `packages/shared/src/atelier-app-definitions.test.ts` (`EXPECTED` avec `write: null` pour Google,
  deux tests ajoutés), `server/src/__tests__/atelier-marketing-apps.test.ts` (une méthode Search Console, portées réelles
  LinkedIn et Facebook, refus de `publication` Google). Résultats (15/10/2026) : shared (`atelier-app-definitions`, `app-definitions`) 48 tests verts ; serveur via
  `scripts/tests-serveur.sh` (`atelier-marketing-apps` 12 tests, `atelier-gardes` 15 tests) 27 verts ; `Browse.test.tsx`
  70 verts sans modification ; `typecheck` de shared, server et ui = 0 ; `paperclip/ui/dist` non touché. Patch
  `socle/patches/0006-fix-atelier-local-cartes-Google-en-lecture-seule-et-.patch` (commit `c66a5cf6e`) ; rejeu `git am`
  de 0001 à 0006 sur `v2026.1012.0` : arbre `382dfbdb15e7b4e5069be4dce71fed34e68daa54`, identique à la branche.

Limites :

- Politique amont : à la fin d'une connexion curée, **toutes les actions sont « Allowed », écritures comprises**
  (`recommendedDefaultsForApp`, inchangé). La méthode par défaut est `lecture`, mais pour `publication`, passer les
  outils d'écriture en « Ask first » (page Permissions), en plus de la décision humaine P2.
- Google Ads et fiche d'établissement n'ont pas de portée en lecture seule (`adwords`, `business.manage`) : leur
  méthode `lecture` demande une portée plus large que la lecture ; seule la passerelle (aucun outil d'écriture) et la
  politique d'actions les tiennent en lecture. Depuis le patch `0006`, ces cartes n'ont plus de méthode `publication`.
- Les noms natifs fusionnent avec les routes Composio et Arcade du même nom (HubSpot, Facebook, Instagram…) : un
  seul rang par service dans la galerie.
- Le mode réel des cartes n'est pas testé contre un vrai fournisseur (pas de mode réel dans la passerelle à ce jour).
  Google ne propose pas de DCR : en réel il faudra un client OAuth préconfiguré,
  `PAPERCLIP_TOOL_OAUTH_<SLUG>_CLIENT_ID` / `_CLIENT_SECRET` (`<SLUG>` = slug en majuscules, tirets en `_`, par
  exemple `PAPERCLIP_TOOL_OAUTH_ATELIER_GOOGLE_SEARCH_CONSOLE_CLIENT_ID` : le fournisseur d'une connexion curée est
  son `sourceTemplateKey`, `server/src/services/tool-access.ts`, `oauthProviderForConnection`), ou « Use your own
  OAuth app » (méthodes `customer`).
  **Mis à jour par L4 (15/10/2026) : caduc.** Le mode réel Google de la passerelle a son propre serveur d'autorisation
  (DCR, comme la démonstration) et garde lui-même les jetons Google ; ne poser aucune variable `PAPERCLIP_TOOL_OAUTH_*`
  (elle l'emporterait sur la DCR). Carte GA4 `lecture` éprouvée en réel contre un faux Google ; les méthodes
  `publication` des cartes Google sont refusées (`invalid_scope`) : voir `docs/passerelle.md`, « Fournisseurs Google réels (L4) ».
- Une connexion créée en démonstration garde son nom « (démonstration) » si la passerelle passe ensuite en réel.
- Le script d'ingestion amont (`scripts/ingest-app-definitions.mjs`) ne connaît pas ces définitions : à chaque
  montée de version, rajouter les imports `atelier-*` (`docs/mise-a-jour-socle.md` §3).
- Changement souhaitable côté `passerelle/` (non fait, hors périmètre) : faire accepter par le serveur d'autorisation
  de démonstration les portées réelles déclarées par la fiche du service (lecture et publication), pour que la
  démonstration rejoue la même demande de portées que le réel (§6.2 de la conception) ; l'effacement des portées en
  démonstration côté socle deviendrait alors inutile.

Pour que l'instance de l'opérateur (3100) affiche les cartes : **la redémarrer** (le serveur tourne par `tsx` sur les sources,
chargées au démarrage), avec une passerelle joignable à `http://127.0.0.1:3190` ou `PAPERCLIP_ATELIER_GATEWAY_URL`
réglée dans `config/atelier.env`. Son interface est servie depuis `paperclip/ui/dist` : la reconstruire
(`pnpm --filter @paperclipai/ui build`) pour obtenir les icônes (`/brands/apps/atelier-*.svg`, copiées depuis
`ui/public`) ; sans cela, les cartes s'affichent avec la lettre de repli.

## Lot réseaux sociaux et CRM réels (passerelle, 15/10/2026)

Détail, choix par plateforme, démarches d'opérateur et tests : `docs/passerelle.md`, section « Fournisseurs réseaux sociaux
et CRM réels ». Effets sur les cartes de galerie du lot L6 (patch `0004`, non modifié ici) :

- **Aucune variable `PAPERCLIP_TOOL_OAUTH_<SLUG>_CLIENT_ID/SECRET` n'est nécessaire** pour ces services : comme pour Google
  (L4), le serveur d'autorisation est la passerelle elle-même (DCR, PKCE), qui garde les applications OAuth de l'opérateur
  (`PASSERELLE_META_*`, `PASSERELLE_INSTAGRAM_*`, `PASSERELLE_LINKEDIN_*`, `PASSERELLE_HUBSPOT_*`, `PASSERELLE_PIPEDRIVE_*`,
  `PASSERELLE_TEAMLEADER_*`). La note L6 « client OAuth préconfiguré possible » ne s'applique pas ; la poser casserait la DCR.
- **Portées des méthodes à compléter** dans les définitions `atelier-*` : Facebook `read_insights` (statistiques de Page) et
  `pages_messaging` (`facebook_envoyer_message`) ; Instagram `instagram_business_manage_insights` ; LinkedIn
  `rw_organization_admin` (liste des organisations administrées et statistiques de partage, d'après la page « Organization
  Share Statistics » lue le 15/10). La passerelle demande de toute façon ses portées de lecture par défaut ; les portées
  envoyées par Paperclip doivent seulement appartenir à la liste permise du service (sinon `invalid_scope`).
- **Odoo et Teamleader sans portée** : normal. Teamleader fixe ses portées dans l'intégration du Marketplace ; Odoo se
  connecte par adresse et clé d'API, saisies dans le formulaire de la passerelle ouvert par le même clic.
- Une diffusion réelle passe désormais par deux gardes : la décision humaine du plugin (P2, portée exacte) **et** la preuve
  signée vérifiée par la passerelle ; tant que le plugin ne signe pas, toute publication réelle reste « préparée ».

## Intégration des connecteurs dans l'usine (15/10/2026)

Preuves détaillées : `docs/resultats-tests.md`, section du même nom. Instance d'essai `atelier-lotz` (3320, PG 54520),
passerelle `passerelle/dist/src/demarrer.js` en démonstration sur 3391, `PAPERCLIP_ATELIER_GATEWAY_URL=http://127.0.0.1:3391`.

| Élément | Où | État |
| --- | --- | --- |
| « Ask first » par défaut pour les écritures des cartes | patch socle `0005` (`recommendedDefaultsForApp`, `classifyRisk`) | **réel testé** (instance + tests serveur) |
| Connexions réservées aux rôles, lecture seule imposée | registre `connexionsPasserelle` et `connexions` ; bootstrap `assurer_connexions` | **réel testé** (instance, deux passes) |
| Consignes des agents réels (identité, dépôt, démonstration, aucun chiffre inventé, `connection_request`) | `organisation/agents/*/AGENTS.md`, six compétences 1.1.0 ; vérificateur | **fait** (contrôlé) ; **non testé en run réel** (jeton) |
| Bouton « Connecter » vers la carte native | `plugin-atelier/src/ui/connecteurs.tsx` | **réel testé** (Playwright) |
| Mode effectif (règle prudente L9) appliqué partout et affiché | `calculerModeEffectif`, `atelier.campagne.modeEffectif`, `NoteModeEffectif` | **réel testé** (scénario A, tests) |
| Scénario A complet | `scripts/scenarios/atelier_scenarios.py A`, `scripts/scenarios/cartes.py` | **réel testé** (démonstration) |

**« Ask first » (patch `0005`).** Constat du lot L6 : à la fin d'une connexion de catalogue, Paperclip autorise toutes les actions
(`recommendedDefaultsForApp` renvoyait `askFirstRiskLevels: []`). Pour les seules cartes `atelier-*`, ce défaut vaut désormais tous les
niveaux de risque sauf `read` ; les deux chemins de finalisation l'appliquent (assistant de connexion, et finalisation serveur au rappel
OAuth du navigateur, `finishOAuthCatalogWithRecommendedDefaults`). `classifyRisk` classe en `write` les verbes de mutation français de la
passerelle (`publier`, `envoyer`, `modifier`, `ecrire`, `creer`…) et `supprimer` en `destructive`, même sans annotation ou avec une
annotation de lecture erronée : un fournisseur réel mal annoté ne contourne pas « Ask first ». Les simulateurs annotent déjà leurs écritures
(`readOnlyHint: false`). L'humain garde la main : il peut passer une action en « Allow » dans l'onglet Permissions.

**Secret de signature.** Une action « Ask first » exige `PAPERCLIP_TOOL_ACTION_SIGNING_SECRET` (`paperclip/doc/MCP-RUNTIME-OPERATIONS.md`) :
sans lui, l'appel échoue en 500 (`signing_secret_unconfigured`). L'onboarding de l'instance principale l'a créé (`instance/instances/atelier/.env`) ;
les instances d'essai ne l'avaient pas : `scripts/instance-essai.sh` le génère désormais (0600, propre à l'instance).

**Connexions par rôle.** Registre 1.4.0 : SEO local GEO lit `gsc`, `ga4`, `gbp` ; SEA lit `ads` ; Mesure lit `ga4`, `ads`, `gsc` ;
CRM conversion a les quatre CRM en `ecriture_sur_accord` ; Contenus lit `facebook`, `instagram`, `linkedin`. Les autres rôles n'ont aucune
connexion ni outil de connexion. `bootstrap-organisation.py appliquer` réserve chaque connexion EXISTANTE de la passerelle : accès natif par
le même geste que l'onglet Permissions (`POST …/tools/apps/:id/finish`, actions activées et « Ask first » inchangés, `access: {agentIds}`),
installations par agent (`PUT /tool-connections/:id/installs`, barrière de livraison d'un run), et politique native `block` sur les écritures
(`risk.isWrite`) pour un rôle en lecture. Une connexion ajoutée ensuite par une carte arrive pour « tous les agents » (défaut natif) :
**relancer `appliquer`** la resserre ; `bootstrap-organisation.py etat` signale l'écart.

**Outils autorisés aux agents réels.** Les agents tournent en `--permission-mode dontAsk` avec une liste `--allowedTools` : un outil MCP absent
de la liste serait refusé. Les rôles avec connexions reçoivent `mcp__paperclip-assigned` (outils des connexions, livrés par Paperclip sous ce
nom de serveur, `server/src/services/mcp-tool-names.ts`) et `mcp__Paperclip_connections__connections_search` /
`…__connection_request` (serveur « Paperclip connections », nom normalisé par Claude Code : tout caractère hors `[a-zA-Z0-9_-]` devient `_`,
vérifié dans le binaire Claude Code 2.1.292). Ce qui atteint réellement un agent reste décidé par Paperclip (installations, politiques).

**Limites.**
1. Aucun run `claude_local` réel : l'usage des outils de connexion par un vrai agent, le dépôt effectif de chaque réponse et le nom exact des
   outils vus par Claude Code restent à observer au premier run réel (jeton de l'opérateur).
2. Rien n'oblige un agent à déposer une réponse reçue (le plugin ne voit pas les appels d'outils, constat du lot L9).
3. L'appel d'essai du tableau de bord (`test-calls`) évalue les politiques mais pas les installations : il reste « allowed » pour un agent sans
   la connexion ; la réservation se lit dans le profil effectif (`/tools/profiles/effective/agents/:id`), celui que lit le moteur au run.
4. Agents de démonstration (`process`) : ils ne reçoivent pas de serveur MCP ; au scénario A, le lanceur fait le vrai appel d'outil par la
   passerelle d'outils de Paperclip au nom de l'agent, et l'agent dépose la réponse brute avec son jeton de run.
5. Socle, tâches parallèles d'un même agent : un run qui avait déjà écrit peut être annulé (« Cancelled before issue reassignment ») quand une
   autre tâche de cet agent passe à l'humain ; la récupération native bloque alors la tâche sans rejeu (observé une fois sur quatre passages
   du scénario A). Le lanceur joue la réconciliation humaine documentée et la consigne ; dans l'interface : « Reprendre ».
6. La preuve d'approbation signée (Ed25519) exigée par les fournisseurs réels réseaux sociaux et CRM pour une diffusion réelle n'est pas
   implémentée dans le plugin (hors de ce lot, `docs/passerelle.md`).

