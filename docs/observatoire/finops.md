# Observatoire : FinOps

Statut : phase 1. Source : Livrable K du plan. Les chiffres ci-dessous sont recopiés du plan sans modification ; les mentions « non vérifié » sont conservées.

## 1. Règle directrice

**Le quota est la ressource.** JB a un forfait Max à 100 euros par mois, dépassements désactivés, et ne veut aucun service payant à l'usage. Le coût réel des agents n'est donc pas en euros mais en quota (fenêtre de 5 heures et semaine), partagé avec son propre usage de Claude Code. Les montants « équivalent API » servent à comparer et à préparer une éventuelle ouverture, pas à facturer.

Décision du 26/10/2026 : abonnement Max pour l'opérateur seul en V1. Servir d'autres personnes avec l'abonnement est interdit (conditions d'Anthropic, voir H.2 du plan) : dès qu'un tiers pose des questions, une clé API avec plafond de dépense est nécessaire, et rien de payant ne s'active sans décision explicite de l'opérateur.

## 2. Prix et quotas vérifiés à la source le 26/10/2026

Relevé par extraction, à relire mot à mot avant tout engagement.

| Élément | Valeur | Source |
| --- | --- | --- |
| Opus 5.5 | 4 $ entrée, 20 $ sortie, 0,20 $ lecture de cache par million de jetons | platform.claude.com/docs/en/about-claude/pricing |
| Sonnet 5.5 | 2 $ / 10 $ / 0,10 $ | idem |
| Haiku 5.5 (prompt ≤ 100 k) | 0,10 $ / 0,50 $ / 0,01 $ (au-delà de 100 k : 0,50 / 2,50 / 0,05) | idem |
| Batch API | −50 % sur entrée et sortie | idem |
| GitHub | REST 5 000 req/h authentifié ; recherche 30 req/min (code 10/min) ; GraphQL 5 000 points/h | docs.github.com |
| YouTube Data API | 10 000 unités/jour ; `videos.list` 1 unité ; `search.list` : extraction contradictoire, **100 unités selon la doc habituelle, à relire** ; `captions.download` 200 unités et **droit de modification de la vidéo requis** | developers.google.com/youtube/v3 |
| arXiv | 1 requête toutes les 3 s, une connexion ; métadonnées CC0 1.0 | info.arxiv.org/help/api/tou.html |
| Cloudflare Pages (gratuit) | 500 builds/mois, 20 000 fichiers/site, 25 MiB/fichier ; bande passante non indiquée | developers.cloudflare.com/pages/platform/limits |
| Contrôle d'accès gratuit (Zero Trust) | **non vérifié** (nombre d'utilisateurs, facturation d'un dépassement) | aucune (non relevé) |
| Plus petit serveur Hetzner | CX23 2 vCPU, 4 Go, 40 Go NVMe : 5,99 € HT/mois (≈ 7,25 € TTC à 21 %), affiché « indisponible » le jour de lecture | hetzner.com/cloud/cost-optimized |
| Versions | astro 7.4.2, pagefind 1.5.2, @anthropic-ai/sdk 1.3.0 (stables) ; @astrojs/starlight 0.42.7 | npm |

## 3. Hypothèses d'unité

Estimations, à remplacer par les mesures du pilote.

- Fiche : environ 400 k jetons relus (70 % en cache) + 25 k produits sur Sonnet, plus relecture Opus 60 k/5 k : **environ 0,90 $**.
- Dossier de 24 chapitres : environ 3 M relus (60 % en cache) + 200 k produits sur Sonnet, plus relecture Opus 400 k/30 k : **environ 7 $**.
- Mise à jour ciblée : environ 0,50 $.
- Édition hebdomadaire de 30 à 40 pages (assemblage + traduction) : environ 4 à 5 $.
- Question : environ 7 k entrée + 600 sortie : **0,02 $ sur Sonnet, 0,001 $ sur Haiku**.

## 4. Les trois scénarios (par mois)

| Scénario | Volume | Équivalent API | Coût réel en euros |
| --- | --- | --- | --- |
| 1. MVP privé économe | 4 dossiers, 20 fiches, 4 éditions, 200 questions de l'opérateur | environ 65 $ | **0 €** (abonnement, quota consommé) |
| 2. Production hebdomadaire régulière | 4 dossiers, 40 fiches, 80 mises à jour, 4 éditions de 40 pages | environ 125 $ | 0 € sur l'abonnement si le quota suffit (**à prouver** : part importante du quota hebdomadaire, en concurrence avec l'usage de Claude Code par l'opérateur) ; sinon environ 125 $ en API |
| 3. Plateforme publique | scénario 2 + 10 000 questions (1 000 utilisateurs × 10) | environ 125 $ + 10 $ (Haiku) ou + 200 $ (Sonnet) | abonnement possible pour le travail interne de l'opérateur, **questions des tiers : API obligatoire** ; + serveur environ 7,25 €/mois TTC + domaine (prix non vérifié, quelques euros à quelques dizaines par an) |

| Poste | Scénario 1 | Scénario 2 | Scénario 3 |
| --- | --- | --- | --- |
| Agents | abonnement Max (0 € en plus), quota | abonnement Max, quota ; risque de saturation | API (payant) ou abonnement réservé à la production interne |
| Embeddings | bge-m3 local (0 €) | idem | idem (GPU pour l'indexation) |
| Base, stockage | instance locale (0 €) | idem | idem + sauvegarde hors site |
| Collecte | API gratuites (GitHub, registres, arXiv, YouTube clé gratuite) | idem | idem |
| Site | local (0 €) | local ou statique gratuit | statique gratuit + service de questions sur petit serveur |
| Questions Claude | abonnement, JB seul | idem | API avec plafond ; gratuit = Pagefind |
| Domaine | aucun | facultatif | requis |

Facteurs de variation : nombre de sujets traités par semaine, profondeur des dossiers, modèle par agent, taille du contexte relu (le principal levier mesuré le 23/10), nombre de questions publiques.

## 5. Mécanismes de maîtrise

1. **Budgets natifs de Paperclip par agent et par service** : chaque agent et chaque service du département porte un budget déclaré à l'ajout (liste des services), avec arrêt à l'atteinte. Les valeurs sont fixées au pilote, après mesure ; elles ne sont pas inventées ici.
2. **Plafond de sujets par semaine** : nombre maximal de sujets traités (cadre de décision de l'opérateur : 20 à 40 pages et 1 dossier complet par semaine). Le plafond baisse tout seul quand le relevé hebdomadaire dépasse la part de quota allouée.
3. **Estimation avant tout lot lourd** : avant un dossier complet, une édition ou une série de mises à jour, l'orchestrateur calcule une fourchette (hypothèses du point 3, puis mesures) et la compare au quota restant. Pas d'estimation, pas de lancement.
4. **Arrêt bloquant** : atteinte du budget d'un agent ou d'un service, ou du plafond hebdomadaire, arrête les tâches concernées et prévient JB. Aucune reprise automatique ; elle exige une décision. Preuve exigée par le test « budget atteint » (voir `plan-tests.md`).
5. **Rapport hebdomadaire de consommation** : quota consommé et équivalent API par fiche, dossier, mise à jour, édition et question.

## 6. Mesure du quota au pilote

Méthode reprise de la mesure du 23/10, adaptée à l'organisation de l'usine.

1. Lire les transcriptions des agents de l'usine sous `instance/claude-config/**` (fichiers `.jsonl`).
2. Pour chaque message de l'assistant, lire `message.usage` : jetons d'entrée, de sortie, d'écriture de cache et de lecture de cache.
3. **Dédoublonner** par `message.id` et `requestId` : un même message est écrit plusieurs fois (blocs de contenu), il ne doit compter qu'une fois. Garder l'enregistrement final de chaque couple.
4. Agréger par agent, par tâche (fiche, dossier, mise à jour, édition, question) et par modèle, puis convertir en équivalent API avec les prix du point 2.
5. Comparer aux hypothèses du point 3 et remplacer celles-ci par les valeurs mesurées. Ne jamais lire un transcript en entier : extraire les champs utiles par script.
6. Relever aussi la part du quota hebdomadaire consommée (observation de l'abonnement) pour juger si le scénario 2 tient en concurrence avec l'usage de l'opérateur.

## 7. KPI économiques

- Quota consommé et équivalent API par fiche, par dossier, par mise à jour, par édition et par question (relevé d'usage).
- Équivalent API mensuel par scénario, comparé à l'estimation.
- Part du quota hebdomadaire consommée par l'usine.
- Nombre d'arrêts bloquants déclenchés et leur cause.
- Taux de cache (lecture de cache sur total relu), principal levier.
- Coût moyen d'une question, par modèle.
- Dépenses réelles en euros (cible : zéro tant qu'aucun tiers n'est servi).
