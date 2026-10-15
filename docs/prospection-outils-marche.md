# Prospection : outils existants sur le marché

Étude du 15/10/2026, faite en lecture seule : aucun compte n'a été créé, rien n'a été acheté ni installé.
Elle répond à la demande de l'opérateur : quels outils, agents, plugins, skills et MCP existent déjà pour faire
de la prospection sortante pour une compagnie d'assurance belge. Les cibles sont des entreprises (B2B),
des particuliers (B2C), des courtiers et des partenaires, filtrés par secteur et par zone.

Ce document ne traite **que des outils**. Le cadre juridique belge (BCE, FSMA, RGPD, Code de droit
économique) est traité dans `docs/prospection-conception.md` ; on n'en reprend ici que ce qui fait
écarter un outil.

Tous les prix ont été lus le 15/10/2026, hors TVA sauf mention contraire. Quand un prix vient d'une
source secondaire et non du site de l'éditeur, le document le dit.

## 1. Verdict

1. **Ce qui est déjà sur la tour ne sert pas tel quel aux agents de l'usine.** Les MCP du plugin
   `sales` sont réglés pour la session Claude Code de l'opérateur. Les agents `claude_local` sont lancés avec
   `--strict-mcp-config` et un `CLAUDE_CONFIG_DIR` qui leur est propre : ils ne voient que les
   connexions Paperclip (`docs/connecteurs-conception.md` §2.3). Les cinq skills peuvent être
   **adaptés** en compétences de l'organisation, car leurs licences le permettent (Apache 2.0 ou MIT).
   Le catalogue Paperclip ne contient **aucune** application de prospection ni d'enrichissement.
2. **Branchable tout de suite et gratuitement :**
   - le fichier ouvert de la BCE (KBO Open Data), pour cibler les entreprises par code NACE et par commune ;
   - Hunter, en offre gratuite, avec son MCP officiel ;
   - HubSpot CRM gratuit, avec son MCP officiel (déjà prévu au lot L1) ;
   - un extrait OpenStreetMap de la Belgique (Geofabrik), pour les commerces d'une zone.
3. **Meilleur rapport qualité-prix pour la Belgique :**
   - une base belge issue de la BCE et de la BNB : Companyweb avec le module Prospection
     (1 011 €/an) ou Trends Top Marketing (620 €/an) ;
   - Dropcontact pour l'enrichissement : société et serveurs dans l'UE, pas de base de contacts, MCP ;
   - un outil d'envoi européen limité au canal e-mail : lemlist ou La Growth Machine ;
   - pour tout appel téléphonique, la licence DNCM, qui est obligatoire.
4. **À éviter :**
   - Lusha : amende de 2 M€ et interdiction de traitement en Italie le 27/07/2026 ;
   - tout ce qui automatise ou extrait LinkedIn (MCP communautaires, extensions, canaux LinkedIn des
     outils de séquences) : c'est interdit par les conditions de LinkedIn ;
   - les extracteurs de Google Maps, et le stockage des données de Places API ;
   - Apollo comme source principale pour la Belgique : données européennes faibles, et un utilisateur
     a déjà été sanctionné.

## 2. Ce qui existe déjà sur la tour de l'opérateur

| Élément | Ce que c'est (preuve) | Utilisable tel quel par l'usine ? |
| --- | --- | --- |
| Plugin `sales` 2.0.1 (Anthropic, Apache 2.0) | `~/.claude/plugins/synced/…/sales/.mcp.json` déclare 23 serveurs HTTP. Pour la prospection : Apollo `mcp.apollo.io/mcp`, Clay `api.clay.com/v3/mcp`, Lusha `mcp.lusha.com/mcp/claude`, ZoomInfo `mcp.zoominfo.com/mcp`, Crunchbase `mcp.crunchbase.com`, Close, Outreach, HubSpot `mcp.hubspot.com/anthropic` et Similarweb. Dans la session de l'opérateur, tous en attente d'authentification (outils `mcp__plugin_sales_*__authenticate`). | **Non.** Ils ne sont pas livrés aux agents `claude_local`, qui fonctionnent en `--strict-mcp-config`. Les URL restent valables pour une connexion Paperclip. |
| `marketing-skills:prospecting` 1.1.2 (Corey Haines, MIT) | `~/.claude/plugins/cache/marketingskills/marketing-skills/2.11.17/skills/prospecting/SKILL.md`. Méthode en cinq phases : ICP, sources, qualification, score, fiche. Règles saines : pas d'extraction massive de LinkedIn ni de Google Maps, URL et date de la source gardées pour chaque contact, pas de données sans provenance (l. 104-110). | **À adapter** : le cadre de conformité vise les États-Unis (CAN-SPAM, CASL), et les sources par défaut (Apollo, Clearbit) sont américaines. |
| `marketing-skills:cold-email` 2.1.0 (MIT) | Même dossier, `cold-email/SKILL.md`. Rédaction d'e-mails à froid et de relances. | **À adapter** : il manque le français et le néerlandais, la mention d'opposition et le registre d'un assureur. |
| `sales:account-research` (Apache 2.0) | `…/sales/skills/account-research/SKILL.md`. Fiche d'un compte croisée avec le CRM ; tout contenu externe y est traité comme une donnée. | **À adapter** : il suppose des connecteurs CRM et d'enrichissement. Sans eux, il travaille sur fichiers. |
| `sales:draft-outreach` (Apache 2.0) | `…/sales/skills/draft-outreach/SKILL.md`. Brouillon d'e-mail puis ajout à une séquence (Apollo, Outreach ou Salesloft) « si demandé ». | **À adapter** : à brancher sur l'outil d'envoi retenu, derrière l'approbation humaine de l'atelier. |
| `ecc:lead-intelligence` (ECC 2.2.3, MIT) | `~/.claude/plugins/cache/ecc/ecc/2.2.3/skills/lead-intelligence/SKILL.md`. Exige Exa, l'API X et « browser control » pour LinkedIn et X quand l'API manque (l. 21-32). | **Non, à écarter** : il pilote LinkedIn par le navigateur, ce que LinkedIn interdit (§8). |
| Catalogue Paperclip (`paperclip/packages/shared/src/app-definitions/`, 88 fichiers JSON) | Aucune application de prospection ni d'enrichissement : la recherche `apollo, hunter, lusha, kaspr, clay, zoominfo, lemlist, instantly, prospect, lead` ne trouve que `atelier-teamleader`, à cause du mot « leader ». Applications utiles autour : CRM `atelier-hubspot`, `atelier-pipedrive`, `atelier-teamleader`, `atelier-odoo` (cartes de l'atelier) ; envoi `resend`, `agentmail` ; `gmail` en brouillons seulement ; `similarweb` ; agrégateurs `composio`, `zapier`, `make`, `arcade`. | **CRM et envoi : oui**, par les cartes existantes. **Prospection : rien de prêt.** |
| Instantané Composio du socle (`paperclip/packages/shared/src/composio-search-catalog.json`, vérifié le 30/09/2026, 1 583 toolkits) | Contient `apollo`, `hunter`, `lemlist`, `instantly`, `dropcontact`, `lusha`, `clay`, `clay_mcp` et `zoominfo` ; ne contient ni Snov.io, ni Kaspr, ni Teamleader. | **En réserve** : deux comptes à créer et un sous-traitant tiers de plus (même avis que `connecteurs-conception.md` §3.1). |

Pour rendre une compétence disponible, on place son `SKILL.md` adapté dans
`organisation/skills/<slug>/` (registre `company_skills`, `docs/guide-agents-competences.md` §6). La
mention de licence doit être conservée.

## 3. Bases et enrichissement B2B

Légende MCP : « officiel » signifie publié par l'éditeur ; « bêta » ou « non vérifié » est précisé
quand c'est le cas.

| Outil | Ce qu'il fait | Belgique et Europe | Prix (offre gratuite, entrée) | API / MCP | RGPD et qualité des données (sources indépendantes) |
| --- | --- | --- | --- | --- | --- |
| **KBO Open Data** (SPF Économie) | Fichier CSV de toutes les entités actives : dénomination, adresse, code NACE, établissements, forme juridique | Belgique, exhaustif | **Gratuit** après inscription. Fichier complet et fichier des changements chaque mois, téléchargement manuel ou SFTP | Pas d'API gratuite ; il faut l'importer soi-même | Données publiques. **Interdiction de réutiliser à des fins de marketing direct les données des entités personnes physiques** (indépendants). Le détail est dans `prospection-conception.md`. |
| **Companyweb** (BE) | Fiches d'entreprises, surveillance, module Prospection | Belgique, plus une recherche internationale en option | Essai 7 jours. Basic 755 €/an, Standard 1 011, Premium 1 267, **module Prospection +256 €/an** (sélection et export de 1 000 sociétés) | Pas d'API publique vue | Données BCE, BNB et Moniteur. Fournisseur belge |
| **Trends Top** (Roularta, BE) | Base de plus de 1,6 million d'entreprises belges, dirigeants, chiffres clés | Belgique | Consult 300 €/an ; **Marketing 620 €/an** (outils de prospection, **filtre « Ne m'appelez plus »**, 1 000 adresses) ; Business 1 050 €/an (2 500 adresses) | Export ; pas d'API vue | Prix lus dans un extrait de recherche de la page tarifs de l'éditeur (accès direct refusé, HTTP 403). |
| **GraydonCreditsafe** | Données de crédit et listes de prospects | Belgique et Pays-Bas (Graydon racheté par Creditsafe le 28/02/2022) | Sur devis | API (payante) | Spécialiste historique de la Belgique |
| **Bizzy** (BE) | Plateforme de prospection avec « agents » | 33 pays européens annoncés | Formules CORE, BOOST et SCALE ; **montants non affichés** ; essai gratuit | Intégrations CRM | Certaines fonctions sont marquées « coming soon » : à considérer comme en construction |
| **Dropcontact** (FR) | Trouve, valide et normalise les e-mails professionnels à partir du nom et de la société | Europe | Pas d'offre gratuite. **Starter 79 €/mois** (500 crédits, payés seulement en cas de succès) ; Growth 120 €/mois (crédits reportés) | **API et MCP** annoncés sur la page tarifs ; statut du MCP non vérifié | « Algorithmes seulement, aucune base de contacts », serveurs dans l'UE : la meilleure posture RGPD de cette liste |
| **Hunter** (FR/US) | Recherche d'e-mails par domaine, vérification, base Discover, séquences | Mondial | **Gratuit : 50 crédits par mois** ; Starter 34 €/mois en annuel (2 000 crédits) ; Growth 104 € ; Scale 209 € | **MCP officiel `mcp.hunter.io/mcp`**, inclus dans toutes les offres, gratuite comprise ; aucune mention bêta ; clé API ou OAuth | Adresses tirées du web public. L'ancien dépôt `hunter-io/hunter-mcp` est **archivé** : utiliser le serveur hébergé |
| **Snov.io** | Recherche d'e-mails, vérification, séquences | Mondial | Essai gratuit renouvelable (50 crédits) ; Starter 39 $/mois | API | Son option « LinkedIn Automation » (69 $/mois) est **à exclure** (§8) |
| **Kaspr** (groupe Cognism) | Extension Chrome qui révèle e-mails et téléphones depuis LinkedIn | Europe | Gratuit : 15 crédits e-mail et 5 téléphone par mois ; Starter 49 ou 59 $/mois, Business 79 ou 99 $ (la page rendue ne permet pas de savoir quel prix correspond au mensuel et lequel à l'annuel) | Intégrations CRM | Elle fonctionne **sur les pages LinkedIn** : risque au regard des conditions de LinkedIn (§8) |
| **Apollo.io** (US) | Base de contacts, enrichissement, séquences | Mondial, plus faible en Europe | Gratuit (limité) ; Basic 49 $, Professional 79 $, Organization 119 $ par utilisateur et par mois en annuel (source secondaire : la page de l'éditeur n'affiche pas les montants) | **MCP officiel `mcp.apollo.io/mcp`** (OAuth ou clé). La doc précise que la disponibilité des outils dépend de l'offre et du « rollout status ». Elle **exige que l'entraînement des modèles soit désactivé** | Taux de rebond de 15 à 35 % en Europe selon des comparatifs, qui sont tous publiés par des concurrents. **Garante (Italie), 14/05/2026 : 1 500 € d'amende à un utilisateur** qui envoyait des e-mails à des contacts achetés sur Apollo sans vérifier la licéité de leur collecte (art. 5.1.a et 14) |
| **Lusha** (US/IL) | Base de contacts : e-mail 1 crédit, téléphone 5 | Mondial | Gratuit : 40 crédits par mois ; Starter 49,90 $/mois | MCP et API | **Garante (Italie), 27/07/2026 : amende de 2 M€, interdiction de traiter les données de résidents italiens et effacement ordonné**. Motifs : aucune base légale (intérêt légitime rejeté), surveillance de personnes, transparence |
| **Cognism** (UK) | Base B2B, téléphones vérifiés, signaux d'intention | Points forts annoncés : Europe et Royaume-Uni | **Sur devis** (Standard, Pro, 5 sièges inclus) | MCP et API dans les deux offres | Positionnement européen ; prix inconnu |
| **ZoomInfo** (US) | Base B2B haut de gamme | Surtout l'Amérique du Nord | Sur devis ; minimum de 3 sièges (source secondaire) | MCP officiel inclus dans l'abonnement | Hors budget pour démarrer |
| **Clay** (US) | Orchestrateur d'enrichissement (plus de 150 fournisseurs) | Selon les fournisseurs choisis | Gratuit : 100 crédits de données et 500 actions par mois, 200 lignes par table. Les prix payants lus sont incohérents (« 167 $/mois ou 54 $ en annuel ») : **à confirmer** | MCP officiel `api.clay.com/v3/mcp` (OAuth) ; statut non lu (page de doc en 404) | Dépend des fournisseurs sous-jacents |
| **LinkedIn Sales Navigator** | Recherche de comptes et de décideurs, InMail | Mondial | Core 120,99 €/mois, Advanced 164,99 €/mois (source secondaire) | **Pas d'API d'export ni de MCP officiel** | Usage **manuel** seulement : y brancher un agent violerait les conditions (§8) |
| **Crunchbase** | Start-up et levées de fonds | Mondial | Hors sujet ici | MCP (plugin `sales`) | Peu utile pour un assureur qui cible des PME belges |

## 4. Sources ouvertes et gratuites

| Source | Usage pour l'usine | Conditions (lues le 15/10) |
| --- | --- | --- |
| KBO Open Data | Socle B2B : secteur (NACE) et zone (code postal, commune, puis région) | Voir §3. Exclure les personnes physiques de tout usage marketing |
| OpenStreetMap, extrait Belgique (Geofabrik) | Commerces et indépendants d'une zone : type, adresse, parfois téléphone et site | Licence ODbL avec attribution. **L'instance publique d'Overpass n'est pas faite pour un usage commercial** (environ 100 requêtes par jour pour une application) : télécharger l'extrait et le filtrer avec osmium, ou héberger son propre Overpass |
| OpenCorporates | Recoupement international | Données ODbL avec partage à l'identique, ou licence commerciale sur devis |
| Google Places API | Vérifier une fiche ponctuellement | **Interdit de précharger, de mettre en cache ou de stocker le contenu**, sauf le place ID. Logo Google obligatoire. **On ne peut donc pas en faire une base de prospects** |
| Common Crawl | Rien pour la prospection | Les conditions interdisent de « collecter des données personnelles pour un usage séparé du contenu » |
| Fédérations et annuaires sectoriels | Listes de membres pour les partenaires | Les conditions varient selon le site : à vérifier site par site, sans extraction massive |
| Annuaire FSMA des intermédiaires | Cible « courtiers » | Cadre traité dans `prospection-conception.md` |

## 5. Agents, frameworks et serveurs MCP (GitHub, relevés le 15/10/2026 par `gh api`)

| Dépôt ou serveur | Étoiles, licence, activité | Avis |
| --- | --- | --- |
| Serveurs hébergés officiels : Hunter, Apollo, Clay, Lusha, ZoomInfo, HubSpot | (néant) | Seule voie propre. Hunter et HubSpot sont les plus clairs (HubSpot en disponibilité générale depuis le 13/04/2026, `connecteurs-conception.md`) |
| `eracle/OpenOutreach` | 3 294 étoiles, GPL-3.0, poussé le 14/10/2026, **tag v0.1.0** | Sérieux : pas de navigateur, pas d'extraction, un fournisseur de données sous licence. Mais il est **jeune** (0.1) et **envoie lui-même** depuis la boîte de l'utilisateur, ce qui contourne l'approbation humaine de l'atelier. À surveiller, pas à brancher |
| `stickerdaniel/linkedin-mcp-server` | 3 885 étoiles, Apache 2.0, version v4.27.0 du 10/10/2026 | **À éviter** : il agit « through your own browser session » (lit les profils, envoie des messages et des invitations), ce qui viole l'art. 8.2 des conditions de LinkedIn (n° 2 et 13). Même chose pour son service hébergé Cadenza |
| `joeyism/linkedin_scraper` | 4 599 étoiles, GPL-3.0 | **À éviter** : c'est un extracteur de LinkedIn |
| `gosom/google-maps-scraper`, `omkarcloud/google-maps-scraper` | 6 477 et 3 628 étoiles, MIT | **À éviter** : contraires aux conditions de Google |
| `apify/apify-mcp-server` | 11 390 étoiles, MIT, actif | Le MCP est sain, mais les « actors » qu'il appelle sont surtout des extracteurs (LinkedIn, Maps) : **ne pas brancher** pour la prospection |
| `apollographql/apollo-mcp-server` | 314 étoiles, MIT | **Homonyme** : c'est Apollo **GraphQL**, sans rapport avec Apollo.io |
| `clay-inc/clay-mcp` | Redirige vers `mesh/mesh-mcp` (35 étoiles, sans licence) | **Homonyme** : ce n'est pas Clay.com. Utiliser `api.clay.com/v3/mcp` |
| `lkm1developer/apollo-io-mcp-server` | 40 étoiles, MIT, dernier push 18/04/2025 | Communautaire et **non maintenu** : le serveur officiel le remplace |
| `hunter-io/hunter-mcp` | 8 étoiles, **archivé** | Remplacé par `mcp.hunter.io` |
| Recherches GitHub « lead generation mcp » et « sales prospecting agent » | Tous les résultats ont **0 à 5 étoiles** (par exemple `Clawdiegecko/leadagent-mcp-server`, `NexivoReach`) | Non éprouvés, à ignorer |
| Outils KBO sur GitHub (`JB-Analytica/kbo-open-data`, `Dj-Shortcut/kbo-lokaal`, `openSource4Brokers/KboOpenDataIO`) | 0 étoile chacun | Non éprouvés. Un import KBO restera notre propre code, mais court et vérifiable |

## 6. Envoi et séquences

| Outil | Prix d'entrée | API / MCP | Délivrabilité | Conformité européenne |
| --- | --- | --- | --- | --- |
| **lemlist** (FR) | Email 55 $/mois en annuel (50 000 e-mails par mois, base de 650 M de leads) ; Multicanal 87 $ ; essai de 14 jours sans carte | MCP hébergé `app.lemlist.com/mcp` avec clé API, d'après un annuaire tiers (scalably.io) ; **doc officielle non trouvée, donc statut non vérifié** | Protections intégrées (lemwarm) | Éditeur européen. **Ne prendre que l'offre Email** : le canal LinkedIn de l'offre Multicanal tombe sous §8 |
| **La Growth Machine** (FR) | Basic 60 €/mois par identité ; Pro 120 € ; essai de 14 jours | Intégrations Zapier, Make, Clay ; pas de MCP vu | Rotation des boîtes d'envoi (Pro) | Éditeur européen ; le produit repose surtout sur LinkedIn, qui est le canal à exclure, donc peu adapté |
| **Instantly** (US) | Growth 47 $/mois (5 000 e-mails) ; base de leads à partir de 47 $ | API | Chauffe des boîtes illimitée | Éditeur américain ; pensé pour le gros volume, ce qui ne colle pas avec le registre d'un assureur |
| **HubSpot Sequences** | Sales Hub **Professional** obligatoire, environ 100 $ par siège et par mois en annuel, frais d'intégration (source secondaire) | MCP officiel en disponibilité générale | Envoi depuis la boîte de l'utilisateur, faible volume | Bon choix si le client est déjà chez HubSpot |
| `resend` et `agentmail` (cartes Paperclip) | (néant) | Déjà dans la galerie | Envoi transactionnel, pas de séquences | Pour des envois unitaires approuvés |

## 7. B2C : particuliers

Il n'existe pas d'outil légal pour **trouver** des particuliers à démarcher. Les voies légales
consistent à acheter des demandes que les particuliers ont faites eux-mêmes, ou à louer des fichiers
déjà filtrés.

| Voie | Ce que c'est | Prix | Remarque |
| --- | --- | --- | --- |
| **Bobex** | Comparateur de devis belge : le particulier dépose une demande (auto, habitation, hospitalisation, obsèques…), Bobex la vérifie à la main et la revend à des partenaires | **Au lead reçu, prix sur devis** ; arrêt possible à tout moment | Plus de 300 000 visites et plus de 10 000 demandes par mois annoncées. Lead entrant, donc pas de prospection à froid |
| **HelloSafe** | Comparateur qui génère des leads pour assureurs et courtiers | Sur devis | Même modèle |
| **bpost SelectPost** | Location d'adresses de foyers pour du **courrier adressé** seulement : plus de 1 500 critères, dont la commune, l'âge et le revenu | Frais fixes plus devis | Livraison sous 5 jours ouvrables. Pas d'e-mail ni de téléphone |
| **Infobel PRO** | Fichier de foyers belges (environ 4 millions) avec téléphones et e-mails déclarés opt-in | Sur devis | Fiche produit (PDF) ; page de l'éditeur refusée (HTTP 403) |
| **Licence DNCM** (« Ne m'appelez plus ») | Liste à consulter **obligatoirement** avant tout appel commercial ; téléchargement manuel, par SFTP ou par **API**, mis à jour chaque jour | Annonceur : 60 €/mois ou 600 €/an jusqu'à 250 salariés, **1 950 €/an au-delà** | Le site conseille de mettre à jour les fichiers tous les 3 jours. Indispensable dès qu'un téléphone est utilisé (B2C, et B2B pour Trends Top) |

## 8. Pourquoi tout ce qui touche LinkedIn est écarté

Les conditions d'utilisation de LinkedIn (art. 8.2, lues le 15/10) interdisent :

- n° 2 : les logiciels, scripts, robots, extensions de navigateur ou modules qui servent à « scrape or copy » les profils ;
- n° 4 : la réutilisation de données obtenues « through third parties (such as … data aggregators or brokers) » sans le consentement de leur auteur ;
- n° 13 : les « bots or other unauthorized automated methods » utilisés pour ajouter des contacts ou envoyer des messages.

Cela vise les MCP communautaires de LinkedIn, `ecc:lead-intelligence`, Kaspr (qui fonctionne sur les
pages LinkedIn), les options LinkedIn de Snov.io, de lemlist et de La Growth Machine, et Cadenza.
LinkedIn ne reste utilisable qu'**à la main** (Sales Navigator) et pour **la page de l'entreprise**,
par l'API officielle (`atelier-linkedin`).

## 9. Recommandation classée

### 9.1 À brancher tout de suite, gratuitement

| Rang | Outil | Intégration dans l'usine |
| --- | --- | --- |
| 1 | **KBO Open Data** | Nouveau **fournisseur de notre passerelle** (`RegistreFournisseurs`, `docs/passerelle.md` §« Un service = une fiche + un fournisseur »). L'import mensuel du CSV va dans une base locale, et des outils en lecture seule `kbo_rechercher(nace, commune / code postal / région, forme)` excluent d'office les personnes physiques. C'est la seule pièce « maison », car il n'existe pas d'outil éprouvé ; elle est courte et testable |
| 2 | **Hunter, offre gratuite** (50 crédits par mois) | **Connexion MCP distante** Paperclip par la route générique (« Connect your own MCP server », stable sans marque bêta) vers `https://mcp.hunter.io/mcp` ; les écritures (listes, séquences) réglées en « Ask first » |
| 3 | **HubSpot CRM gratuit** | Carte `atelier-hubspot` / MCP officiel (lot L1 déjà prévu) comme **destination** des prospects qualifiés, avec la source et la date de chaque contact |
| 4 | **Extrait OSM Belgique** (Geofabrik) | Même fournisseur de passerelle que la BCE (outil `commerces_zone`), attribution ODbL incluse |
| 5 | Compétences `prospecting`, `cold-email`, `account-research`, `draft-outreach` | À **adapter** dans `organisation/skills/` : droit belge (renvoi à `prospection-conception.md`), français et néerlandais, aucune source LinkedIn ni Maps, licences gardées |

### 9.2 Meilleur rapport qualité-prix pour la Belgique (à payer par le client)

| Rang | Outil | Coût | Intégration |
| --- | --- | --- | --- |
| 1 | **Companyweb + Prospection** (ou **Trends Top Marketing**, moins cher et qui filtre DNCM) | 1 011 €/an (ou 620 €/an) | Pas d'API : l'export CSV est importé par le fournisseur de passerelle « BCE », qui le rapproche par numéro d'entreprise |
| 2 | **Dropcontact** | 79 €/mois | Connexion MCP distante (URL à relever dans le compte du client) ou API par un fournisseur de passerelle |
| 3 | **Hunter Starter** | 34 €/mois en annuel | Même connexion MCP qu'au §9.1, offre relevée |
| 4 | **lemlist, offre Email** (sinon les séquences HubSpot si le client a Sales Hub Pro) | 55 $/mois | MCP à confirmer auprès de l'éditeur ; à défaut, l'API par un fournisseur de passerelle. Tout envoi passe par l'approbation humaine |
| 5 | **Licence DNCM** dès qu'un appel est envisagé | 600 ou 1 950 €/an | API DNCM : fournisseur de passerelle, filtre obligatoire avant toute liste d'appels |
| 6 | B2C : **Bobex** (leads entrants) et **bpost SelectPost** (courrier) | Au lead, sur devis | Bobex livre des leads au CRM (import ou e-mail) ; bpost livre un fichier ; aucun MCP |

### 9.3 À éviter, et pourquoi

| Outil | Raison |
| --- | --- |
| Lusha | Illégal en Italie (amende de 2 M€ et interdiction, 27/07/2026). Même modèle de collecte partout en Europe |
| Apollo comme source principale | Données européennes faibles (rebonds de 15 à 35 % selon des concurrents) ; un utilisateur sanctionné en 2026 pour ne pas avoir vérifié l'origine des données |
| MCP et extracteurs LinkedIn, Kaspr, options LinkedIn des outils de séquences, `ecc:lead-intelligence` | Art. 8.2 des conditions de LinkedIn |
| Extracteurs Google Maps, base construite avec Places API | Conditions de Google (pas de stockage au-delà du place ID) |
| Apify pour la prospection | Ses « actors » sont des extracteurs |
| Common Crawl | Ses conditions interdisent d'en tirer des données personnelles |
| `apollographql/…`, `clay-inc/clay-mcp` | Homonymes : ce ne sont pas les bons produits |
| `lkm1developer/apollo-io-mcp-server`, `hunter-io/hunter-mcp`, dépôts à 0 étoile | Non maintenus, archivés ou non éprouvés |
| OpenOutreach | Version 0.1 et envoi autonome sans approbation : contraire à la règle « pas de bêta » et au contrôle de l'atelier |
| ZoomInfo, Cognism, Clay payant | Sur devis ou prix non confirmés, et surdimensionnés pour démarrer. Cognism reste l'option européenne haut de gamme si le client paie |
| Composio pour ces outils | Possible (toolkits présents), mais deux comptes et un sous-traitant de plus : à garder en réserve |

## 10. À décider par l'opérateur

1. Faire construire le fournisseur de passerelle « BCE et OSM » (seule pièce de code).
2. Choisir entre Companyweb et Trends Top, et savoir si le client prend la licence DNCM.
3. Choisir l'outil d'envoi : lemlist Email ou les séquences HubSpot, selon ce que le client possède déjà.
4. Autoriser l'adaptation des quatre compétences sous licence ouverte.

Points restés inconnus :

- le statut exact (stable ou bêta) des MCP de Dropcontact, de lemlist et de Clay ;
- les prix de Bizzy, de Bobex, de Cognism et de GraydonCreditsafe ;
- les prix payants de Clay et le sens mensuel ou annuel des prix de Kaspr.

## 11. Sources consultées le 15/10/2026

Tarifs et produits :

- https://www.apollo.io/pricing ; https://docket.io/resources/research/apollo-pricing (prix Apollo, source secondaire)
- https://docs.apollo.io/docs/apollo-mcp
- https://hunter.io/pricing ; https://hunter.io/mcp
- https://www.dropcontact.com/pricing
- https://www.kaspr.io/pricing
- https://www.lusha.com/pricing/ ; https://docs.lusha.com/
- https://www.clay.com/pricing ; https://developers.clay.com/concepts/mcp (extrait de recherche)
- https://snov.io/pricing
- https://www.lemlist.com/pricing ; https://scalably.io/mcp/lemlist-mcp (tiers)
- https://instantly.ai/pricing
- https://lagrowthmachine.com/pricing/
- https://www.cognism.com/pricing
- https://www.zoominfo.com/pricing ; https://reply.io/blog/zoominfo-mcp/ (secondaire)
- https://www.companyweb.be/fr ; https://www.companyweb.be/fr/order
- https://trendstop.levif.be/fr/trendstop-tarifs.aspx?type=bu3 (via extrait de recherche, accès direct en 403)
- https://www.creditsafe.com/be/en/more/about-us/graydoncreditsafe.html
- https://bizzy.ai/fr/pricing
- https://companydata.com/b2b-data-provider-comparisons/belgium/ (comparatif d'un vendeur, biais déclaré)
- https://woodpecker.co/blog/linkedin-sales-navigator-pricing/ (secondaire)
- https://docket.io/resources/research/hubspot-sales-hub-pricing (secondaire)
- https://composio.dev/toolkits

Sources ouvertes et conditions d'utilisation :

- https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises/services-everyone/public-data-available-reuse/cbe-open-data (protégé par captcha ; contenu lu par extrait de recherche)
- https://wiki.openstreetmap.org/wiki/Overpass_API
- https://api.opencorporates.com/
- https://developers.google.com/maps/documentation/places/web-service/policies ; https://developers.google.com/maps/billing-and-pricing/pricing
- https://commoncrawl.org/terms-of-use
- https://www.linkedin.com/legal/user-agreement

Sanctions et qualité des données :

- https://www.grcreport.com/post/italy-fines-lusha-eu2-million-says-data-brokers-business-crossed-into-gdpr-monitoring
- https://www.enforcementtracker.com/ETid-3218 et https://www.gpdp.it/web/guest/home/docweb/-/docweb-display/docweb/10263918
- https://bouncezero.io/apollo-vs-cognism-2026 ; https://www.salesforge.ai/fr/blog/apollo-io-review (concurrents, indicatif)

B2C :

- https://www.bobex.be/fr-be/leads/assurances/ ; https://hellosafe.be/?p=98964
- https://bpost.be/data
- https://www.infobelpro.com/hubfs/Fiches%20produits%20Infobelpro%20PDF/FR/Location_vente_adresse_res_V2.5_fr.pdf
- https://www.donotcallme.be/en/telemarketeers

GitHub (relevé par `gh api` et `gh search repos`) :

- stickerdaniel/linkedin-mcp-server, eracle/OpenOutreach, joeyism/linkedin_scraper
- apify/apify-mcp-server, apollographql/apollo-mcp-server, lkm1developer/apollo-io-mcp-server
- hunter-io/hunter-mcp, clay-inc/clay-mcp (vers mesh/mesh-mcp)
- gosom/google-maps-scraper, omkarcloud/google-maps-scraper
- JB-Analytica/kbo-open-data, Dj-Shortcut/kbo-lokaal, openSource4Brokers/KboOpenDataIO
