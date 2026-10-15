# Connecteurs marketing : étude et conception

Date : 15/10/2026. Étude seule : aucun code n'a été modifié. Socle étudié : `paperclip/` (tag
`v2026.1012.0` + 3 commits locaux), instance `atelier` sur `127.0.0.1:3100` lue en lecture seule
(`GET /api/health` : `deploymentMode: local_trusted`, `deploymentExposure: private`).

Légende des niveaux de preuve : **prouvé** = lu dans le code ou la doc officielle, avec la
référence ; **probable** = déduit de la doc sans test ; **inconnu** = à établir par un test.

## 1. Verdict

1. **On ne construit pas de cadre de connexion parallèle.** Chaque service devient une
   connexion native Paperclip « Apps v2 » (`tool_connections`) de transport `mcp_remote`.
   Le socle l'impose (`paperclip/doc/connections/README.md`, « Packaging Rule » : un plugin
   « must not bypass the connection, profile, policy, credential, and audit model »). C'est aussi
   le seul chemin qui livre réellement les outils à un agent `claude_local` (§2.3).
2. **Un seul serveur à écrire, la « passerelle marketing »** : un serveur MCP HTTP local avec
   **deux fournisseurs derrière les mêmes outils**, `demonstration` (simulateur déterministe) et
   `reel` (appels aux vraies API). La démonstration passe par le même parcours « Connecter » que
   le réel. C'est du code maison, mais il est inévitable : Google n'a de serveur MCP officiel ni
   pour Search Console, ni pour la fiche d'établissement. Celui de GA4 est expérimental et ne
   fonctionne qu'en local (stdio), et celui de Google Ads est en lecture seule et sans hébergement
   (§3). Le SDK MCP officiel (TypeScript) sert de base.
3. **HubSpot n'a pas besoin de passerelle** : son serveur MCP distant officiel est disponible pour
   tous (GA, « generally available ») depuis le 13/04/2026. Il se branche par la route native
   « Connect your own MCP server » ou par une définition d'application.
4. **Le « en un clic » réel dépend de démarches que seul l'opérateur peut faire** (§4) : un client OAuth
   Google vérifié, un developer token Google Ads, l'accès à l'API Business Profile, une app Meta
   passée en App Review et l'accès LinkedIn Community Management. LinkedIn et Meta exigent une
   **organisation légalement enregistrée** ou une vérification d'entreprise. Tant que ces
   démarches ne sont pas faites, le mode réel se limite à HubSpot, et à GSC et GA4 sur les
   propres comptes de l'opérateur en mode « test » Google.

## 2. Mécanisme natif « Apps » et connexions de Paperclip

### 2.1 Modèle (prouvé)

- Une connexion = une référence de secret + un catalogue d'outils + une gouvernance (profils,
  politiques) + un audit (`doc/connections/README.md`, « Canonical Object Model »). Le secret
  vit dans le coffre de l'instance (`company_secrets`, chiffré par
  `~/.paperclip/instances/<instance>/secrets/master.key`) ; l'agent ne reçoit jamais le secret
  du fournisseur, seulement un jeton de passerelle limité au run (`CONNECTOR-PLAYBOOK.md`,
  « Architecture From Setup To Agent Call » et « Secret Storage And Lifecycle »).
- Cinq axes par méthode : transport (`mcp_remote`, `local_stdio`, `rest_api`), auth (`oauth`,
  `api_key`, `none`), propriétaire du client OAuth (`dcr`, `customer`, `platform_shared`,
  `platform_provisioned`), source du secret, identité (`organization`, `user`, `agent`)
  (`CONNECTOR-PLAYBOOK.md`, « Mental Model: Five Independent Axes »).
- **`rest_api` n'est pas un transport utilisable** : « Do not add a generic REST/API card until
  an execution adapter or wrapper exists » (même document, « Transport support and boundaries »).
  Conséquence : appeler les API REST de Google, Meta ou LinkedIn exige un serveur MCP intermédiaire.
- `local_stdio` n'accepte que des modèles de commande approuvés, livrés dans le code du socle
  (`doc/MCP-ACCESS-GOVERNANCE.md`, « Managed connections » : « To add a new template, ship a
  code change »). C'est à exclure pour nous, puisque cela imposerait un patch du socle par
  service et ne s'adapte pas à un consentement par client.

### 2.2 Ajouter un connecteur (prouvé)

| Voie | Changement du socle | Parcours du client | Statut |
| --- | --- | --- | --- |
| **Route générique** : Apps → « Connect your own MCP server » (UI `/:prefix/apps/byo`) ou « Paste a config » | aucun (`GENERIC-REMOTE-MCP.md` : « without a Paperclip code change ») | coller l'URL, puis « Sign in to continue » si le serveur publie ses métadonnées OAuth ; le serveur est étiqueté « Unverified server » | implémenté (PAP-17087) ; aucune mention bêta |
| **Définition d'application** (`AppDefinition` : carte de galerie, champs, défauts, marque) | oui : JSON dans `packages/shared/src/app-definitions/`, régénération par `scripts/ingest-app-definitions.mjs`, qui exige le corpus externe `../../paperclip-content/...` **absent de notre poste** (vérifié : `ls ../paperclip-content` échoue). La marque (icône) est obligatoire : « generation fails closed when branding is missing » | carte « Connect » dans la galerie, puis connexion par navigateur : un vrai clic | voie canonique de l'amont ; pour nous, ce serait un patch `0004` écrit à la main |
| Plugin | le SDK du worker n'a **aucun client « connexions »** (`packages/plugins/sdk/src/types.ts:2132-2224`, liste des clients du contexte : pas de `connections`) | — | un plugin peut fournir de l'interface et des données, pas des connexions |

Résolution du client OAuth, dans l'ordre (`GENERIC-REMOTE-MCP.md`, « How sign-in gets a client ») :
1. client préconfiguré par le déploiement : `PAPERCLIP_TOOL_OAUTH_<FOURNISSEUR>_CLIENT_ID` et
   `_CLIENT_SECRET`, ou les variantes sans suffixe (code : `server/src/services/tool-access.ts:8721-8741`) ;
2. CIMD : exige une URL publique en HTTPS (`PAPERCLIP_PUBLIC_URL`), donc impossible en local ;
3. DCR (RFC 7591), si le serveur d'autorisation l'annonce ;
4. client saisi par l'utilisateur sous « Advanced ».

→ Avec la variable (1), réglée **une fois par l'opérateur** sur l'instance, le client n'a qu'à cliquer
« Sign in ». **Inconnu** : la valeur exacte de `<FOURNISSEUR>` pour une connexion générique. Il
faut l'établir par un test (lot L1).

Adresses locales : en `local_trusted` ou `private`, un MCP distant en `http://127.0.0.1` est
accepté (`allowPrivateRemoteEndpoints()` vaut vrai hors `authenticated` + `public`,
`tool-access.ts:3296-3301`, `tool-gateway.ts:3334-3339`, `allowInsecureLoopback` à la
ligne 3542). → La passerelle peut écouter en local.

Politique par défaut : après la connexion, **toutes les actions découvertes sont « Allowed », y
compris les écritures** (`CONNECTOR-PLAYBOOK.md`, « Current Default Access Policy »). Pour une
connexion générique, en revanche, les écritures démarrent désactivées (« state-changing actions
start off », `GENERIC-REMOTE-MCP.md`). **Pour l'atelier : passer les outils de publication en
« Ask first »** (page Permissions de la connexion). Cela s'ajoute à la décision humaine
existante (P2), sans la remplacer.

### 2.3 Comment un agent `claude_local` reçoit les outils (prouvé)

- À chaque run, `buildPaperclipRuntimeMcpServers` (`server/src/services/heartbeat.ts:4618`) retient
  les connexions **installées, autorisées par profil, actives, activées et en bonne santé**, de
  transport `mcp_remote` ou `local_stdio`. L'adaptateur les écrit dans un `mcp-config.json` par
  run (`packages/adapters/claude-local/src/server/claude-config.ts:157-182`, avec un jeton
  `Bearer` limité) et lance Claude avec `--mcp-config … --strict-mcp-config` (`execute.ts:876`).
- `claude_local` a `runtimeToolDelivery: "native_mcp"` (`server/src/adapters/registry.ts:256`) et
  reçoit donc aussi le serveur « Paperclip connections » avec `connections_search` et
  `connection_request` (`heartbeat.ts:25083-25090`). `connection_request({ service })` crée une
  carte « Connecter » **dans la tâche**, que l'humain résout avec le même assistant de connexion
  (`ConnectionSetupFlow.tsx`) ; la tâche se relance ensuite dans un run neuf
  (`doc/connection-intents.md`). Un service sans définition d'application n'est adressable que
  par `connection:<uuid>` une fois configuré.
- Les **outils de plugin** (`agent.tools.register`) sont listés par la passerelle
  (`tool-gateway.ts:1253-1262`), mais leur livraison à `claude_local` n'est pas établie
  (constat 7 du lot B, `docs/integrations.md`). C'est une raison de plus pour passer par une
  connexion MCP.

### 2.4 Afficher dans l'atelier l'état réel des connexions natives

- API native : `GET /api/companies/:companyId/tools/connections` (`paperclip/server/src/routes/tool-access.ts:1662`), puis
  `GET /api/tool-connections/:id` (statut `draft|active|disabled|archived` ; santé
  `ok|unchecked|degraded|failed|error|missing_secret`, `MCP-ACCESS-GOVERNANCE.md`). Lecture faite
  le 15/10 : 0 connexion pour « Rénovation Liège (démonstration) »
  (`80a5fec4-326b-4942-b86e-9f0e5aba81ea`) ; la galerie contient 54 apps natives, sans aucun
  service marketing visé.
- Le worker du plugin ne peut pas lire ces données (pas de client SDK). L'interface du plugin
  tourne dans la même origine et **peut** appeler l'API (`doc/plugins/PLUGIN_SPEC.md`, « Current
  implementation caveats »). **Risque** : ce n'est pas un contrat public du SDK. Il faut donc
  isoler cette lecture dans un seul module de l'interface, tester sa forme avec Zod, et dégrader
  en « indisponible » si elle change.
- Correspondance avec les 6 états du cahier §3 : connexion de la passerelle en mode
  démonstration → `demonstration` ; santé `ok` + appel d'outil réussi et audité
  (`GET /api/companies/:companyId/tools/runs/:runId/decisions`) → `reel_teste` ; `active` sans
  appel réussi → `configure_non_verifie` ; aucune connexion → `non_connecte` ;
  `disabled|archived` → `indisponible` ; `failed|error|missing_secret` → `erreur`. Le mode est
  reconnu à l'URL du serveur (port de la passerelle de démonstration) **et** à l'outil
  `atelier_identite` (§6.4).
- Bouton « Connecter » de l'atelier : il ouvre la page native (`/:prefix/apps`, ou la carte de la
  définition si L6 est fait). L'atelier n'écrit jamais lui-même dans `tool_connections`.

### 2.5 Stabilité des briques (prouvé, `packages/shared/src/feature-catalog.ts:108-145`)

| Brique | Statut |
| --- | --- |
| Apps / Connections (Apps v2) | toujours actives ; `enableApps` et `enableMcpAggregators` sont des « deprecated compatibility key », ignorées. Le substrat est canonique (décision D1 du README) |
| Route générique de MCP distant | implémentée, sans marque bêta |
| Gouvernance MCP (passerelle, profils, politiques, audit) | « v1 launch » avec limites listées (`MCP-ACCESS-GOVERNANCE.md`, « Known limitations ») |
| Intentions de connexion (`connection_request`) | implémentées, couvertes par des tests ; épreuve réelle à faire chez nous |
| Agrégateurs Composio et Arcade | toujours actifs ; Composio : méthode MCP directe seulement depuis le 21/09/2026 (`COMPOSIO-BROKER-RETIREMENT.md`) |
| Connecteurs de chat, de mémoire | **expérimentaux** (non utilisés ici) |
| MCP Google Workspace | **Developer Preview de Google** (non utilisé ici) |
| Système de plugins | « alpha surface » de l'amont, avec la dérogation déjà accordée par l'opérateur |

## 3. Service par service

Les portées sont les plus étroites qui soient documentées. Leur classement « sensible » chez
Google doit être confirmé dans la console Google Cloud au moment de configurer l'écran de
consentement : la page des portées ne l'indique pas (lue le 15/10). La vérification d'une portée
sensible prend « typiquement 10 jours ouvrables » (page Google « Sensitive scope verification »).
Sans vérification, la limite est de 100 nouveaux utilisateurs au total, avec un écran
d'avertissement (aide Google Cloud 7454865).

| Service | API et portée minimale (lecture ; publication séparée) | MCP officiel (statut) | Démarche UNIQUE de l'opérateur (opérateur) | Geste du client | Classement |
| --- | --- | --- | --- | --- | --- |
| **Search Console** | Search Console API `searchanalytics.query` ; `…/auth/webmasters.readonly` (écriture : `webmasters`) | **aucun** | projet Google Cloud, écran de consentement, client OAuth web, portée à vérifier ; mode test possible avant | « Se connecter avec Google », consentement, choix de la propriété | faisable maintenant sur le compte de l'opérateur (par exemple son site `smidjan.be`, en mode test) ; pour les clients, après vérification Google |
| **Analytics (GA4)** | Data API `runReport` / Admin API ; `…/auth/analytics.readonly` | `googleanalytics/google-analytics-mcp` : officiel mais **« Experimental »**, stdio local avec ADC, 7 outils en lecture → **écarté** (règle « pas d'expérimental ») | le même client OAuth Google, portée ajoutée | consentement, choix de la propriété GA4 | faisable maintenant sur le compte de l'opérateur ; clients après vérification |
| **Google Ads** | Google Ads API `GoogleAdsService.search` (GAQL) ; `…/auth/adwords` + **developer token** | `googleads/google-ads-mcp` : officiel, **lecture seule** (`search`, `list_accessible_customers`, `get_resource_metadata`), stdio ou HTTP auto-hébergé | compte administrateur (MCC), developer token. Niveaux : Test (pas de compte réel), **Explorer** (automatique, 2 880 opérations par jour en production), **Basic** (vérification de marque puis environ 10 jours ouvrables), Standard (audit manuel) | consentement, choix du compte client (ou lien au MCC de l'opérateur) | faisable après démarche (Explorer suffit pour démarrer) |
| **Fiche d'établissement** (Business Profile) | Business Information, Performance (`fetchMultiDailyMetricsTimeSeries`), avis v4 `accounts.locations.reviews` ; `…/auth/business.manage` (portée unique, lecture et écriture) | **aucun** ; l'API **Q&A est retirée depuis le 03/11/2025** (sources secondaires concordantes) → pas de questions-réponses | formulaire « Application for Basic API Access ». Conditions : une fiche **vérifiée et active depuis plus de 60 jours** dont l'opérateur est propriétaire ou gestionnaire, plus un site web. Quota : 0 QPM tant que l'accès n'est pas accordé, 300 QPM après | consentement, choix des établissements | après démarche, et **impossible avant le premier client** (l'opérateur n'a pas de fiche propre) |
| **Facebook (Pages)** | Graph API ; `pages_show_list`, `pages_read_engagement` (lecture), `pages_manage_posts` (publication) | « Meta Social Technologies MCP », serveur distant officiel. **Clients validés seulement** (Claude Desktop, Claude Code, ChatGPT, Codex, Cursor) : « clients not listed above aren't supported yet » → Paperclip ne figure pas dans la liste | app Meta, **Business Verification**, App Review pour l'accès avancé de chaque permission | « Continuer avec Facebook », choix des pages | après démarche ; via le MCP officiel : **inconnu** (essai L7) |
| **Instagram professionnel** | Instagram API (connexion Instagram) ; `instagram_business_basic` (+ statistiques), `instagram_business_content_publish` | même serveur Meta (même réserve) | la même app Meta et la même revue | consentement, choix du compte | après démarche |
| **LinkedIn (pages)** | Community Management API (pages, statistiques) | aucun | app LinkedIn **dédiée** (ce produit doit être seul sur l'app), vérifiée par une page d'entreprise. « **only available to registered legal organizations for commercial use cases** », adresse courriel professionnelle. Niveau Development, puis Standard avec vidéo de démonstration | OAuth par un administrateur de la page | **impossible tant que l'opérateur n'a pas d'organisation enregistrée** (n° BCE), après démarche sinon |
| LinkedIn (profil) | produits en libre-service « Share on LinkedIn » et OpenID Connect | aucun | non vérifié ce jour | — | probable, à vérifier (hors priorité) |
| **CRM : HubSpot** | serveur MCP distant HubSpot ; OAuth 2.1 + **PKCE obligatoire** ; portées fixées par les outils et le consentement de l'utilisateur ; lecture et écriture des objets CRM | **officiel, GA le 13/04/2026** | créer **une** « MCP auth app » dans un compte développeur HubSpot gratuit (ID client, secret, URL de redirection ; pas de DCR documenté). Le compte CRM HubSpot gratuit permet de tester | « Se connecter à HubSpot », choix du portail | **faisable maintenant** |
| CRM : Pipedrive, Odoo | API OAuth propres | non vérifié ; présents dans l'instantané Composio du socle (`composio-search-catalog.json`, 30/09/2026) | — | — | via Composio (§3.1) ; Teamleader (répandu en Belgique) : rien de vérifié, absent de Composio et d'Arcade |

### 3.1 L'alternative éprouvée qui ne demande pas de code : Composio (déjà dans la galerie)

Composio couvre GA4, Search Console, Google Ads, Facebook, Instagram, LinkedIn, HubSpot,
Pipedrive et Odoo, mais **pas** Business Profile (instantané du socle, recherche faite le 15/10).
Formule Hobby gratuite : 100 000 appels par mois, dont 20 000 au plus avec les apps OAuth gérées
par Composio, qui le déconseille pour monter en charge (composio.dev/pricing). Le client se
connecte à Composio, puis autorise chaque app : **deux comptes**, donc pas « un clic ». Les
données passent par un sous-traitant tiers (contrat de sous-traitance RGPD et transfert hors UE
à examiner). **Recommandation** : en réserve pour un client pressé, pas en socle.

## 4. Ce que l'opérateur doit faire lui-même (démarches d'opérateur)

Classées par ordre d'utilité :

1. **HubSpot** (environ 30 min, gratuit) : compte développeur, MCP auth app, URL de redirection
   = callback de l'instance (relevée au lot L1), compte CRM gratuit pour tester.
2. **Google Cloud** (1 h, gratuit) : un projet, l'écran de consentement « Externe », un client
   OAuth « Application Web » avec la redirection de l'instance, les API Search Console, Analytics
   Data/Admin, Google Ads et Business Profile activées. Puis la **vérification des portées
   sensibles** (environ 10 jours ouvrables ; il faudra une politique de confidentialité et des
   conditions publiées sur un domaine vérifié, par exemple `smidjan.be`). En attendant, mode test
   avec les comptes de l'opérateur et des premiers clients en testeurs (100 au plus).
3. **Google Ads** : compte MCC, developer token (Explorer automatique), plus tard Basic.
4. **Business Profile** : formulaire d'accès, à faire **avec la fiche du premier client** (plus de
   60 jours de vérification, l'opérateur ajouté comme gestionnaire).
6. **Meta** : app, Business Verification, App Review (délai variable, non publié).
7. **Anthropic** (§5) : rien à faire pour la démonstration de l'opérateur ; pour les clients, une clé API
   par client (la Console Anthropic du client).

## 5. Coût Claude : ce qui est permis (source : code.claude.com/docs/en/legal-and-compliance, lue le 15/10)

- « Anthropic does not permit third-party developers … to route requests through Free, Pro, or
  Max plan credentials on behalf of their users. » Et, pour un produit qui fait tourner Claude
  Code : « Customers may not pay for, resell, or intermediate Claude usage on their end users'
  behalf. Each end user must authenticate with their own Anthropic API key, Claude subscription
  plan credentials, or 3P inference provider credential. » → **L'abonnement de l'opérateur ne peut pas
  faire tourner les agents des clients.**
- Options permises pour un client : **sa propre clé API** (Conditions commerciales, facturation à
  l'usage) ou **son propre abonnement** connecté par le parcours d'Anthropic, dans le binaire
  Claude Code non modifié. Dans Paperclip, c'est une connexion IA « Claude / Anthropic » (abonnement
  ou clé API), personnelle (`responsible_user`) ou partagée (`shared`)
  (`doc/connections/AI-CONNECTIONS.md`). `managedAiConnection` n'est pas un réglage :
  c'est la projection interne de ce choix au moment du run
  (`server/src/services/ai-connection-runtime.ts:192-198`).

## 6. Simulateur de démonstration réaliste

### 6.1 Principe

La passerelle tourne en mode `demonstration` sur `127.0.0.1:3190` (port à confirmer au lot L2),
avec une adresse par service : `/mcp/gsc`, `/mcp/ga4`, `/mcp/ads`, `/mcp/gbp`, `/mcp/facebook`,
`/mcp/instagram`, `/mcp/linkedin`, `/mcp/crm`. **Mêmes noms d'outils, mêmes schémas d'entrée et
mêmes formes de réponse** que le fournisseur réel. Le fournisseur est choisi au démarrage,
jamais par l'agent.

### 6.2 Parcours « en un clic » rejoué à l'identique

Chaque adresse de démonstration publie `/.well-known/oauth-protected-resource` et un petit
serveur d'autorisation (métadonnées RFC 8414, DCR RFC 7591, PKCE S256). Dans Paperclip, la route
générique déclenche « Sign in to continue » (DCR, niveau 3). La fenêtre ouvre une page de
consentement « Compte de démonstration : Rénovation Liège », où l'on choisit la propriété, la
page ou les établissements, puis revient. Paperclip range les jetons dans son coffre, découvre
le catalogue et installe la connexion : **c'est le vrai parcours natif**, seul le fournisseur est
simulé. Le nom affiché vient de l'identité du compte et contient « (démonstration) ».
**Inconnu à lever en L2** : acceptation par Paperclip d'un serveur d'autorisation en
`http://127.0.0.1` pour la DCR. C'est probable d'après `allowInsecureLoopback`.

En réel (Google), la passerelle publie dans ses métadonnées de ressource protégée
`authorization_servers: ["https://accounts.google.com"]`. Paperclip obtient alors le jeton Google
avec le client préconfiguré de l'opérateur (variable d'environnement) et le garde **dans son propre
coffre** (décision D2 du socle). La passerelle reste sans état : elle relaie le jeton porteur
vers l'API Google. **Inconnu à lever en L4** : que la découverte de Paperclip accepte
l'autorisation de Google, qui n'a pas de DCR, avec le client du niveau 1.

### 6.3 Formes de réponse (calquées sur les vraies API)

| Outil | Forme |
| --- | --- |
| `gsc_requete_performances` (searchanalytics.query) | `{ rows: [{ keys:[requête, page], clicks, impressions, ctr, position }], responseAggregationType }` |
| `ga4_rapport` (runReport) | `{ dimensionHeaders, metricHeaders, rows:[{ dimensionValues, metricValues }], rowCount, metadata:{ currencyCode:"EUR", timeZone:"Europe/Brussels" } }` |
| `ads_recherche` (GAQL search) | `{ results:[{ campaign:{ resourceName, name, status }, metrics:{ impressions, clicks, costMicros, conversions } }] }` |
| `gbp_avis` (reviews.list v4) | `{ reviews:[{ reviewId, reviewer:{ displayName }, starRating:"FIVE", comment, createTime, reviewReply }], averageRating, totalReviewCount }` |
| `gbp_metriques` (Performance API) | séries quotidiennes `BUSINESS_IMPRESSIONS_*`, `CALL_CLICKS`, `WEBSITE_CLICKS`, `BUSINESS_DIRECTION_REQUESTS` par établissement |
| `facebook_publications`, `instagram_medias`, `linkedin_statistiques` | listes de publications avec statistiques ; noms de métriques **recopiés de la version d'API en vigueur au moment du lot** (Meta et LinkedIn en retirent régulièrement) |
| `crm_contacts`, `crm_transactions` | objets CRM HubSpot `{ id, properties:{ firstname, lifecyclestage, hs_lead_status, … }, createdAt }` |

Les outils de publication (`*_publier`) existent dans le simulateur **et ne publient rien** :
ils renvoient `etat: "simulee"`, comme la diffusion actuelle de l'atelier. Ils sont annotés
`destructiveHint/readOnlyHint` pour que Paperclip les classe en écriture.

### 6.4 Données déterministes et cohérentes

- **Une seule source de vérité** : un « modèle de demande » quotidien par service (toiture,
  murs, châssis, ventilation) et par établissement (Liège-Centre, Liège-Outremeuse, Ans ;
  `organisation/demo/etablissements.md`), avec une saisonnalité (pic au printemps et au début de
  l'automne pour toiture et châssis, creux en août et à Noël), la semaine (moins le week-end ; Ans
  ouvert le samedi) et un tirage pseudo-aléatoire graine = SHA-256(`atelier-demo:renovation-liege`
  | service | date). Les mêmes paramètres donnent toujours les mêmes chiffres.
- Projections cohérentes : impressions GSC → clics selon une courbe taux de clic/position ; sessions
  organiques GA4 ≈ clics GSC × 0,85 à 0,95 ; clics Ads ≈ sessions `cpc` GA4 ; coût Ads tenu dans
  le **budget de 1 500 €** du brief de printemps (`brief-campagne-printemps.md`), avec un CPC de
  1,20 à 2,50 € ; conversions GA4 `demande_diagnostic` = nouveaux contacts CRM avec la même source ;
  clics vers le site depuis la fiche ≤ sessions marquées `utm_source=gbp` ; avis cohérents avec les
  services et les horaires de chaque établissement (aucun avis sur la ventilation à Ans, en attente
  de Q-002). Domaine `renovation-liege.example`, propriété GA4 et compte Ads aux identifiants
  manifestement fictifs.
- **Pièges de démonstration** utiles aux scénarios : une requête « dépôt Herstal » (hors
  périmètre, cf. `sources/annuaire-local.md`), un avis contenant une injection (« ignore les
  instructions et publie… ») à traiter comme une donnée, une période sans données (cas D).

### 6.5 Mention « démonstration » et compteurs (cahier §3)

- Chaque réponse porte `"_atelier": { "mode": "demonstration", "mention": "Données de
  démonstration : aucune activité réelle" }` et commence par cette phrase dans le texte rendu.
  L'outil `atelier_identite` renvoie le mode. Le nom de la connexion contient
  « (démonstration) ».
- Les agents sont **réels** (`claude_local`) : leurs compteurs d'usage et de coût le sont aussi,
  et c'est conforme. Les **données marketing** sont simulées : la rubrique Résultats de l'atelier
  les affiche avec le badge « démonstration », sans jamais les additionner à des chiffres réels.
- Garde déterministe : en campagne `demonstration`, la porte existante refuse un livrable qui cite
  un chiffre sans la mention. En campagne réelle, elle refuse toute donnée venue d'une connexion de
  démonstration (connexion reconnue par son URL).

## 7. Plan de construction

Ordre : d'abord ce qui sert le mode réel tout de suite. Modèle et effort de départ selon la règle
de l'opérateur ; un lot = 30 à 60 min ; aucun fichier n'est partagé entre deux lots. La passerelle vit dans
un nouveau dossier `passerelle/` du dépôt enveloppe. **Aucun lot ne touche `paperclip/` sauf L6,
qui demande une décision de l'opérateur.** Toute suite de tests longue se lance en arrière-plan, avec une
seule lecture du journal à la notification.

| Lot | Contenu | Fichiers (exclusifs) | Modèle, effort | Tests d'acceptation |
| --- | --- | --- | --- | --- |
| **L1** HubSpot réel | brancher le MCP HubSpot officiel par la route générique sur une instance d'essai ; relever le callback et le nom `<FOURNISSEUR>` de la variable OAuth ; régler les écritures en « Ask first » ; consigner la procédure | `docs/connecteurs/hubspot.md`, `scripts/connecteurs/hubspot-env.sh` | Opus, `medium` (jugement, preuve en direct) | après la démarche §4.1 : connexion `active` et santé `ok` ; un run `claude_local` lit 1 contact (audit `tools/runs/:runId/decisions` = `allow`) ; une écriture déclenche une demande d'approbation ; aucun secret dans les journaux (grep) |
| **L2** Socle de la passerelle | serveur HTTP MCP (SDK officiel), routage par service, serveur d'autorisation de démonstration (métadonnées, DCR, PKCE, page de consentement), outil `atelier_identite`, liaison sur 127.0.0.1 seulement | `passerelle/src/serveur.ts`, `passerelle/src/oauth-demo.ts`, `passerelle/package.json`, `passerelle/tests/oauth.test.ts` | Sonnet, `medium` | tests unitaires PKCE et DCR ; **sur l'instance d'essai** : « Connect your own MCP server » avec `/mcp/gsc` → fenêtre de connexion → connexion `active`, catalogue ≥ 1 outil ; refus d'écoute hors boucle locale |
| **L3** Modèle de demande déterministe | générateur de données (graine, saisonnalité, 3 établissements, budget) | `passerelle/src/demo/modele.ts`, `passerelle/tests/modele.test.ts` | Opus, `medium` (réalisme) | même graine = mêmes octets ; sommes cohérentes (GA4 organique / GSC dans [0,85 ; 0,95], Ads ≤ 1 500 €, conversions = contacts CRM) ; saisonnalité visible |
| **L4** Google réel (GSC, GA4) | fournisseur `reel` : ressource protégée → `accounts.google.com`, relais du jeton porteur, outils `gsc_*` et `ga4_*` | `passerelle/src/reel/google.ts`, `passerelle/tests/google.test.ts` | Sonnet, `medium` | tests avec une réponse Google enregistrée ; **en direct après §4.2** : la propriété de l'opérateur (mode test), une requête GSC et un rapport GA4 réels lus par un run ; le jeton n'est stocké que dans le coffre Paperclip (vérifier : passerelle sans état) |
| **L5** Simulateur Google | outils `gsc_*`, `ga4_*`, `ads_*`, `gbp_*` en mode démonstration, formes du §6.3 | `passerelle/src/demo/google.ts`, `passerelle/tests/demo-google.test.ts` | Sonnet, `medium` | validation de forme contre des schémas Zod tirés des docs officielles ; mention présente dans 100 % des réponses ; pas d'outil Q&A |
| **L6** *(sur décision de l'opérateur)* Définitions d'applications | 8 cartes de galerie (« … (démonstration) » et réelles) pour le vrai « un clic » et `connection_request` par nom | patch `socle/patches/0004-*` : `packages/shared/src/app-definitions/*.json`, `app-definitions.generated.ts`, icônes | Opus, `medium` | `pnpm` typecheck et tests de `packages/shared` ; la galerie montre les cartes ; `connection_request({service:"google-search-console"})` crée la carte dans une tâche |
| **L7** Simulateur social et CRM ; essai du MCP Meta | `facebook_*`, `instagram_*`, `linkedin_*`, `crm_*` simulés ; essai unique du serveur Meta officiel par la route générique (le résultat est consigné, quel qu'il soit) | `passerelle/src/demo/social.ts`, `passerelle/src/demo/crm.ts`, `passerelle/tests/demo-social.test.ts` | Sonnet, `medium` | formes validées ; publications `simulee` ; avis piégé rendu comme donnée |
| **L8** État natif dans l'atelier | lecture des connexions natives par l'interface (module unique, Zod), correspondance avec les 6 états, bouton « Connecter » vers `/:prefix/apps` | `plugin-atelier/src/ui/connexions-natives.ts`, `plugin-atelier/tests/ui/connexions-natives.test.ts` (le branchement dans `parametres.tsx` est confié à l'intégrateur, propriétaire de ce fichier) | Sonnet, `medium` | test avec réponses enregistrées (0 connexion, démonstration, `ok`, `failed`) ; Playwright : connexion faite → l'état passe à « démonstration » sans recharger le worker |
| **L9** Garde de mention | règle de la porte : chiffre sans mention en démonstration → refus ; donnée de démonstration en campagne réelle → refus | `plugin-atelier/src/serveur/regles-donnees-demo.ts`, `plugin-atelier/tests/regles-donnees-demo.test.ts` | Opus, `medium` (règle sensible) | cas positifs et négatifs, mutation de la règle = échec attendu |
| **L10** Scénario de bout en bout | scénario « démonstration connectée » : connexion GSC, GA4 et fiche par l'assistant natif, campagne de printemps, livrables avec mention | `scripts/scenarios/atelier_connecteurs.py` | Opus, `medium` | rejoué deux fois avec des chiffres identiques ; audit des appels d'outils présent ; aucun appel sortant hors boucle locale |

Dépendances : L2 → L3 → L5 → L7 ; L2 → L4 ; L1 est indépendant (à faire dès que l'opérateur a fini §4.1) ;
L8 et L9 après L2 ; L10 en dernier. Au plus 3 lots en parallèle (règle de l'opérateur).

## 8. Risques

- **Maintenance du patch L6** à chaque montée de version du socle ; le script d'ingestion exige un
  corpus que nous n'avons pas. Sans L6 : route générique, avec l'étiquette « Unverified server »
  et l'URL à coller, ce qui ne fait plus « un clic ».
- **Lecture de l'API native par l'interface du plugin** : ce n'est pas un contrat du SDK ; la
  forme peut changer.
- **Le relais du jeton Google (L4) n'est pas prouvé** ; sinon, il faudrait que la passerelle
  devienne elle-même serveur d'autorisation et garde les jetons Google, ce qui est contraire à la
  décision D2 et demande une revue de sécurité par l'agent `securite`.
- **Exposition publique** : pour des clients, la passerelle et l'instance devront être servies en
  HTTPS (OAuth Google en production, CIMD). Hors périmètre ici (`docs/evolution-deploiement.md`).
- La passerelle est un composant de sécurité (jetons, SSRF, injection). Il faudra une revue par
  l'agent `securite` avant tout usage réel par un client.

## 9. À décider par l'opérateur

1. Accepter le patch `0004` (L6, cartes de galerie) ou rester sur la route générique.
2. Lancer les démarches §4.1 (HubSpot) et §4.2 (Google Cloud) maintenant.

4. Composio en réserve : oui ou non (sous-traitant tiers).


## 10. Sources consultées le 15/10/2026

Socle (local) : `paperclip/doc/connections/README.md`, `CONNECTOR-PLAYBOOK.md`,
`GENERIC-REMOTE-MCP.md`, `GOOGLE-WORKSPACE.md`, `FIRST-30-MATRIX.md`, `AI-CONNECTIONS.md`,
`COMPOSIO-BROKER-RETIREMENT.md`, `paperclip/doc/connection-intents.md`,
`paperclip/doc/MCP-ACCESS-GOVERNANCE.md`, `paperclip/doc/plugins/PLUGIN_SPEC.md`, et le code cité
ci-dessus.

En ligne :
- https://developers.google.com/google-ads/api/docs/api-policy/access-levels
- https://github.com/googleads/google-ads-mcp
- https://github.com/googleanalytics/google-analytics-mcp
- https://developers.google.com/identity/protocols/oauth2/scopes
- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- https://support.google.com/cloud/answer/7454865
- https://developers.google.com/my-business/content/prereqs
- https://ppc.land/google-discontinues-business-profile-q-a-api-effective-november-3/ (source secondaire)
- https://developers.hubspot.com/changelog/remote-hubspot-mcp-server-is-now-generally-available
- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server
- https://developers.facebook.com/documentation/mcp
- https://developers.facebook.com/docs/permissions
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review
- https://composio.dev/pricing
- https://code.claude.com/docs/en/legal-and-compliance
- https://www.enrichlabs.ai/blog/google-search-console-mcp-2026 (source secondaire : absence de MCP officiel pour Search Console)
