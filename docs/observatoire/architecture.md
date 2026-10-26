# Architecture de l'Observatoire

Document de la phase 1 d'« Avenue de l'Observatoire ». Source : le plan approuvé (livrables C, F, H et O). Décisions détaillées : voir les ADR dans [adr/README.md](adr/README.md) (numéros cités ci-dessous). Modèle de données : [modele-donnees.md](modele-donnees.md).

Principe directeur : **la vérité documentaire vit en base (`obs_*`), la publication est un export Markdown** (ADR-004). Tout ce qui vient de l'extérieur est une donnée non fiable.

## 1. C4 niveau 1 : contexte

```mermaid
flowchart TB
  JB["JB<br/>propriétaire, seul approbateur humain"]
  LEC["Lecteurs futurs<br/>(phase publique, hors V1)"]
  SRC["Sources externes<br/>GitHub, registres de paquets, blogs et docs officiels,<br/>arXiv, réglementation UE, métadonnées YouTube"]
  ANT["Anthropic<br/>modèles Claude via l'abonnement de l'opérateur (V1),<br/>clé API seulement après décision de l'opérateur"]
  OBS["Observatoire<br/>département de veille et de documentation<br/>sur l'instance Paperclip 3100"]
  JB -- "approuve, arbitre, pose des questions" --> OBS
  SRC -- "données non fiables" --> OBS
  OBS -- "prompts sans outils, tâches d'agents" --> ANT
  ANT -- "texte généré" --> OBS
  OBS -- "site statique, réponses citées" --> JB
  OBS -. "phase publique seulement" .-> LEC
```

Acteurs :
- **JB** : seul utilisateur en V1 ; approuve les publications, les essais en VM et toute dépense (ADR-006, ADR-010).
- **Sources externes** : jamais crues sur parole ; chaque donnée garde sa source, son empreinte et sa date (voir [politique-verification-sources.md](politique-verification-sources.md)).
- **Anthropic** : fournisseur du modèle. L'abonnement de l'opérateur ne sert que l'opérateur ; servir d'autres personnes impose une clé API (ADR-006).
- **Lecteurs futurs** : hors périmètre de la V1 ; ils ne verront que le contenu publié, jamais la base.

## 2. C4 niveau 2 : conteneurs

```mermaid
flowchart LR
  subgraph Sources["Sources externes (non fiables)"]
    EXT["GitHub, npm, PyPI, crates, blogs, RSS, arXiv, UE, YouTube"]
  end
  subgraph Instance["Instance Paperclip 3100, organisation actuelle de l'usine"]
    PAP["Instance Paperclip<br/>routines, tâches, approbations, budgets, journal natifs"]
    WRK["Worker du plugin<br/>collecteurs en code, porte déterministe, export"]
    DB[("Schéma obs_*<br/>sources, instantanés, projets, versions,<br/>affirmations, preuves, révisions, éditions")]
    RAG["RAG<br/>plein texte + bge-m3 + RRF"]
    AG["Agents Claude<br/>11 agents + porte"]
  end
  subgraph Isolement["Essais isolés"]
    VM["VM d'essai jetable<br/>libvirt, réseau filtré"]
    FAB["Fabrique en cage<br/>PDF"]
  end
  subgraph Site["Plateforme du site"]
    GIT[("Dépôt de contenu<br/>Markdown FR/EN + frontmatter")]
    AST["Site statique<br/>Astro + Starlight + Pagefind"]
    QA["Service de questions<br/>RAG + Claude sans outils + contrôle des citations"]
  end
  EXT --> WRK
  PAP --> WRK
  WRK --> DB
  DB --> AG
  AG --> DB
  PAP -- "approbation humaine" --> VM
  AG --> FAB
  DB -- "export des révisions Publié" --> GIT
  GIT --> AST
  DB --> RAG
  RAG --> QA
  AST --> QA
```

| Conteneur | Rôle | Remarque |
| --- | --- | --- |
| Instance Paperclip | Orchestration native : routines, tâches, approbations, budgets, journal | Pas de moteur maison (ADR-003) ; le département vit dans l'organisation actuelle de l'usine (29e service), pas d'instance séparée (ADR-001) |
| Worker du plugin | Collecteurs en code sans modèle de langue, porte déterministe, export | Un contenu hostile peut fausser une donnée, jamais déclencher une action |
| Schéma `obs_*` | Vérité documentaire | Migrations additives, après la 022 |
| RAG | Recherche hybride sur les seules révisions publiées | Existant du plugin, pas de base vectorielle (ADR-007) |
| Fabrique | Documents PDF en cage | Autorisation par agent |
| VM d'essai | Exécution d'essais sur approbation | Niveaux d'isolement de 0 à 3 (ADR-008) |
| Dépôt de contenu | Export Markdown FR/EN | Seule interface entre l'usine et le site |
| Site | Astro, Starlight, Pagefind | Statique (ADR-005) |
| Service de questions | Réponses en langage naturel | Claude sans aucun outil, contrôle déterministe (ADR-006) |

## 3. Séquences

### (a) Collecte incrémentale d'une source GitHub

```mermaid
sequenceDiagram
  participant R as Routine Paperclip
  participant C as Collecteur (code)
  participant DB as obs_*
  participant GH as API GitHub
  R->>C: déclenche la collecte (source due)
  C->>DB: lit obs_sources (etag, last_modified, politique_collecte)
  C->>GH: GET avec If-None-Match (ETag)
  alt 304 Not Modified
    GH-->>C: 304
    C->>DB: met à jour la prochaine collecte, échecs consécutifs à 0
  else 200
    GH-->>C: contenu + nouvel ETag
    C->>C: normalise le texte, calcule l'empreinte SHA-256
    C->>DB: l'empreinte existe déjà pour cette source ?
    alt empreinte identique
      C->>DB: met à jour etag seulement, aucun instantané
    else empreinte nouvelle
      C->>DB: crée obs_instantanes (source_id, empreinte) unique
      C->>DB: enregistre version_detectee si présente
    end
  else erreur ou quota atteint
    GH-->>C: 403, 429 ou 5xx
    C->>DB: incrémente echecs_consecutifs, recule la cadence
  end
```

L'ETag évite le transfert, l'empreinte évite l'instantané en double quand le contenu est identique malgré un ETag différent. Un instantané n'est jamais republié tel quel.

### (b) Mise à jour incrémentale : REA 6.7.0 vers 6.8.0

```mermaid
sequenceDiagram
  participant C as Collecteur
  participant DB as obs_*
  participant P as Porte déterministe
  participant AT as analyste-technique
  participant AA as adaptateur-anglais
  participant J as JB
  participant G as Dépôt de contenu
  C->>DB: nouvel instantané (release REA 6.8.0)
  C->>DB: compare au précédent (release, changelog, README, licence, manifeste)
  C->>DB: crée obs_versions (rea, 6.8.0)
  DB->>DB: impact = affirmations dont une preuve pointe la source changée<br/>ou dont version_concernee est inférieure à 6.8.0
  DB->>DB: chapitres touchés passent a_actualiser (les autres restent publiés)
  DB->>AT: tâche avec la liste exacte des chapitres et affirmations
  AT->>DB: nouvelles affirmations, preuves, révision FR n+1
  DB->>P: contrôle (statuts, preuves, citations)
  P-->>DB: PASS ou FAIL (3 cycles de correction au plus, puis retour à l'humain)
  DB->>DB: révisions EN dont base_revision_fr est ancienne : traduction périmée
  DB->>AA: tâche sur le seul diff FR
  AA->>DB: révision EN n+1 avec base_revision_fr à jour
  DB->>DB: comparaisons citant une affirmation remplacée : a_actualiser
  DB->>J: demande d'approbation (modification majeure)
  J-->>DB: approuve
  DB->>G: export FR puis EN, nouveau commit de contenu
  DB->>DB: changelog documentaire généré depuis les révisions
```

Rien n'est réécrit en entier : l'agent reçoit une liste de chapitres, jamais « réécris le dossier ».

### (c) Question en langage naturel avec contrôle des citations

```mermaid
sequenceDiagram
  participant U as JB
  participant Q as Service de questions
  participant R as RAG (révisions publiées)
  participant M as Claude sans outils
  participant K as Contrôle déterministe
  U->>Q: question (FR ou EN)
  Q->>Q: valide longueur et langue, consulte le cache
  Q->>R: recherche hybride plein texte + bge-m3 + RRF
  R-->>Q: 8 à 12 passages avec id, projet, version, révision, verifie_le, statut, url_ancre
  alt aucun passage au-dessus du seuil
    Q-->>U: aucune source, résultats de recherche classiques
  else passages trouvés
    Q->>M: passages comme données, consigne : répondre depuis les passages, citer [n]
    M-->>Q: réponse avec citations
    Q->>K: chaque [n] existe dans le contexte ? phrase factuelle sans citation ?
    alt toutes les citations valides
      K-->>Q: ok (phrases sans citation marquées)
      Q-->>U: réponse en HTML échappé, liens limités aux ancres internes, date de vérification
    else citation invalide ou absente
      K-->>Q: rejet
      Q-->>U: refus poli + résultats de recherche classiques
    end
  end
```

Le modèle n'a aucun outil : pas de Bash, pas de web, pas de MCP. Le contrôle est du code, pas un second avis du modèle.

## 4. Flux de données : ce qui est fiable, ce qui ne l'est pas

| Donnée | Fiabilité | Pourquoi |
| --- | --- | --- |
| Contenu des sources externes | Non fiable | Peut être faux, hostile ou périmé ; traité comme donnée, jamais comme instruction |
| Affirmation commerciale d'un éditeur | Non fiable comme fait | Statut `rapporte_editeur` au mieux |
| Texte produit par un agent | Non fiable tant qu'il n'a pas passé la porte | Les affirmations sans preuve restent `non_verifie` ou `infere` |
| Instantané, empreinte, ETag, date de collecte | Fiable | Produits par du code déterministe |
| Résultat d'un essai exécuté par notre service | Fiable pour la version et l'environnement essayés | Seul à donner `verifie_experimentalement` |
| Statut et confiance d'une affirmation | Fiable si posés par la porte | Le statut est une règle de code |
| Réponse du service de questions | Fiable seulement pour ses citations valides | Contrôle déterministe des `[n]` |

Les collecteurs sont du code sans modèle de langue : un contenu hostile peut fausser une donnée (corrigée par la vérification), jamais déclencher une action.

## 5. Frontières et ce qui n'est jamais partagé

- L'Observatoire est une entreprise de plus de l'instance 3100, dans l'organisation actuelle de l'usine, dont il est le 29e service (ADR-001). Il ne lit ni les tâches ni les connaissances des autres services (cloisonnement natif) ; il n'échange qu'avec les flux déclarés du bureau de liaison. Les données du client courtier restent dans son entreprise ; la généralisation de l'usine (phase 1 bis) est annulée (ADR-001).
- **Le site ne lit jamais la base** de l'usine : il lit le dépôt de contenu exporté.
- **Le service de questions ne reçoit que l'index des révisions publiées**, jamais les brouillons ni les révisions non validées.
- **Jamais partagés** : secrets et jetons de connecteurs, instantanés bruts (jamais republiés tels quels), brouillons, journaux d'essais non publiés, questions et réponses des utilisateurs (journal local d'évaluation), données personnelles.
- **Jamais de modèle avec outils** sur le chemin public : le service de questions n'a ni Bash, ni web, ni MCP.
- **Jamais de clé ni de compte tiers** sans décision de l'opérateur ; l'abonnement de l'opérateur ne sert que l'opérateur (ADR-006).
- Les essais s'exécutent en VM jetable, sur approbation, jamais sur le poste de l'opérateur (ADR-008).
