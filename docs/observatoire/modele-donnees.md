# Observatoire : modèle de données (indicatif)

Source : plan « Avenue de l'Observatoire », F.2. Ce document est **indicatif** : la migration réelle
(numérotée 023 ou plus, après la 022) sera écrite en **phase 3**, testée sur l'instance d'essai
(`scripts/instance-essai.sh`) avant toute instance Observatoire. Aucune table n'est créée par ce lot.

Les entités natives de Paperclip ne sont pas dupliquées : agents, skills, tâches, workflows,
approbations, budgets et coûts, journal d'activité, utilisateurs et rôles. Les tables ci-dessous s'y
rattachent par identifiant (`approbation_id`, `entreprise_id`).

Convention : identifiants `uuid`, horodatages `timestamptz` en UTC, tables préfixées `obs_`, toutes
rattachées à une entreprise (`entreprise_id`). Les routes `obs.*` sont refusées hors entreprise
déclarée « observatoire ».

## SQL indicatif

```sql
CREATE TABLE obs_editeurs (
  id            uuid PRIMARY KEY,
  entreprise_id uuid NOT NULL,
  nom           text NOT NULL,
  nom_normalise text NOT NULL,
  site          text,
  UNIQUE (entreprise_id, nom_normalise)
);
CREATE INDEX obs_editeurs_nom ON obs_editeurs (nom);

CREATE TABLE obs_categories (
  id         uuid PRIMARY KEY,
  parent_id  uuid REFERENCES obs_categories (id),
  libelle_fr text NOT NULL,
  libelle_en text NOT NULL
);
CREATE INDEX obs_categories_parent ON obs_categories (parent_id);

CREATE TABLE obs_projets (
  id               uuid PRIMARY KEY,
  entreprise_id    uuid NOT NULL,
  slug             text NOT NULL,
  nom              text NOT NULL,
  editeur_id       uuid REFERENCES obs_editeurs (id),
  depot_canonique  text,
  statut_editorial text NOT NULL,
  UNIQUE (entreprise_id, slug),
  UNIQUE (entreprise_id, depot_canonique)
);
CREATE INDEX obs_projets_statut ON obs_projets (statut_editorial);

CREATE TABLE obs_projets_categories (
  projet_id    uuid NOT NULL REFERENCES obs_projets (id),
  categorie_id uuid NOT NULL REFERENCES obs_categories (id),
  PRIMARY KEY (projet_id, categorie_id)
);
CREATE INDEX obs_projets_categories_categorie ON obs_projets_categories (categorie_id);

CREATE TABLE obs_alias (
  type      text NOT NULL CHECK (type IN ('github', 'npm', 'pypi', 'site', 'nom')),
  valeur    text NOT NULL,
  projet_id uuid NOT NULL REFERENCES obs_projets (id),
  PRIMARY KEY (type, valeur)
);
CREATE INDEX obs_alias_valeur ON obs_alias (valeur);

CREATE TABLE obs_sources (
  id                     uuid PRIMARY KEY,
  url_canonique          text NOT NULL UNIQUE,
  type                   text NOT NULL CHECK (type IN ('primaire', 'secondaire', 'communautaire')),
  politique_collecte     jsonb NOT NULL,  -- api, cadence, robots
  licence_reutilisation  text,
  etag                   text,
  last_modified          text,
  echecs_consecutifs     integer NOT NULL DEFAULT 0,
  prochaine_collecte     timestamptz
);
CREATE INDEX obs_sources_prochaine_collecte ON obs_sources (prochaine_collecte);

CREATE TABLE obs_instantanes (
  id                uuid PRIMARY KEY,
  source_id         uuid NOT NULL REFERENCES obs_sources (id),
  empreinte_sha256  char(64) NOT NULL,
  recupere_le       timestamptz NOT NULL,
  texte_normalise   text NOT NULL,        -- jamais republié tel quel
  version_detectee  text,
  UNIQUE (source_id, empreinte_sha256)
);
CREATE INDEX obs_instantanes_source_date ON obs_instantanes (source_id, recupere_le);

CREATE TABLE obs_versions (
  id            uuid PRIMARY KEY,
  projet_id     uuid NOT NULL REFERENCES obs_projets (id),
  version       text NOT NULL,
  publiee_le    timestamptz,
  instantane_id uuid REFERENCES obs_instantanes (id),
  prerelease    boolean NOT NULL DEFAULT false,
  UNIQUE (projet_id, version)
);
CREATE INDEX obs_versions_projet ON obs_versions (projet_id);

CREATE TABLE obs_affirmations (
  id                uuid PRIMARY KEY,
  projet_id         uuid NOT NULL REFERENCES obs_projets (id),
  chapitre          text NOT NULL CHECK (chapitre ~ '^(ch(0[1-9]|1[0-9]|2[0-4])|fiche\.[a-zA-Z]+)$'),
  texte             text NOT NULL,
  statut            text NOT NULL CHECK (statut IN (
    'verifie_experimentalement', 'confirme_doc_officielle', 'rapporte_editeur', 'rapporte_tiers',
    'infere', 'non_verifie', 'contredit', 'obsolete')),
  confiance         smallint NOT NULL CHECK (confiance BETWEEN 0 AND 3),
  confiance_motif   text NOT NULL,
  version_concernee text,
  remplacee_par     uuid REFERENCES obs_affirmations (id)
);
CREATE INDEX obs_affirmations_projet_chapitre ON obs_affirmations (projet_id, chapitre);
CREATE INDEX obs_affirmations_statut ON obs_affirmations (statut);

CREATE TABLE obs_essais (
  id                uuid PRIMARY KEY,
  projet_id         uuid NOT NULL REFERENCES obs_projets (id),
  version           text NOT NULL,
  niveau_isolement  text NOT NULL,
  commandes         jsonb NOT NULL,
  journal_empreinte char(64) NOT NULL,
  resultat          jsonb NOT NULL,
  approbation_id    uuid                    -- approbation native Paperclip
);
CREATE INDEX obs_essais_projet ON obs_essais (projet_id);

CREATE TABLE obs_preuves (
  id              uuid PRIMARY KEY,
  affirmation_id  uuid NOT NULL REFERENCES obs_affirmations (id),
  instantane_id   uuid REFERENCES obs_instantanes (id),
  essai_id        uuid REFERENCES obs_essais (id),
  extrait_exact   text NOT NULL,
  position        integer NOT NULL CHECK (position >= 0),
  -- exactement un des deux liens
  CHECK ((instantane_id IS NULL) <> (essai_id IS NULL))
);
CREATE INDEX obs_preuves_affirmation ON obs_preuves (affirmation_id);

CREATE TABLE obs_revisions (
  id                uuid PRIMARY KEY,
  dossier_id        uuid NOT NULL REFERENCES obs_projets (id),
  langue            text NOT NULL CHECK (langue IN ('fr', 'en')),
  numero            integer NOT NULL CHECK (numero >= 1),
  base_revision_fr  integer,
  contenu_md        text NOT NULL,
  empreinte         char(64) NOT NULL,
  statut            text NOT NULL,
  publiee_le        timestamptz,
  UNIQUE (dossier_id, langue, numero),
  CHECK (langue <> 'en' OR base_revision_fr IS NOT NULL)
);
CREATE INDEX obs_revisions_dossier ON obs_revisions (dossier_id);
CREATE INDEX obs_revisions_statut ON obs_revisions (statut);

CREATE TABLE obs_chapitres (
  id          uuid PRIMARY KEY,
  revision_id uuid NOT NULL REFERENCES obs_revisions (id),
  cle         text NOT NULL CHECK (cle ~ '^ch(0[1-9]|1[0-9]|2[0-4])$'),
  etat        text NOT NULL CHECK (etat IN ('complet', 'incomplet', 'non_applicable')),
  motif       text,
  UNIQUE (revision_id, cle),
  CHECK (etat = 'complet' OR motif IS NOT NULL)
);
CREATE INDEX obs_chapitres_revision ON obs_chapitres (revision_id);

CREATE TABLE obs_comparaisons (
  id                uuid PRIMARY KEY,
  entreprise_id     uuid NOT NULL,
  projets           uuid[] NOT NULL,
  criteres          jsonb NOT NULL,
  affirmations_ids  uuid[] NOT NULL,
  revision          integer NOT NULL
);

CREATE TABLE obs_editions (
  id             uuid PRIMARY KEY,
  numero         integer NOT NULL,
  langue         text NOT NULL CHECK (langue IN ('fr', 'en')),
  version        text NOT NULL,
  periode_debut  date NOT NULL,
  periode_fin    date NOT NULL,
  statut         text NOT NULL,
  corrections    jsonb NOT NULL DEFAULT '[]',
  UNIQUE (numero, langue, version),
  CHECK (periode_debut <= periode_fin)
);
CREATE INDEX obs_editions_numero ON obs_editions (numero);

CREATE TABLE obs_entrees_edition (
  edition_id uuid NOT NULL REFERENCES obs_editions (id),
  projet_id  uuid NOT NULL REFERENCES obs_projets (id),
  revision_id uuid REFERENCES obs_revisions (id),
  PRIMARY KEY (edition_id, projet_id)
);

CREATE TABLE obs_publications (
  id                 uuid PRIMARY KEY,
  cible              text NOT NULL CHECK (cible IN ('git', 'pdf', 'index')),
  objet              text NOT NULL,
  empreinte_artefact char(64) NOT NULL,
  commit_contenu     text,
  publiee_le         timestamptz NOT NULL
);
CREATE INDEX obs_publications_date ON obs_publications (publiee_le);
```

## Correspondance tables et schémas Zod

Les schémas sont dans `plugin-atelier/src/contrats/observatoire.ts` (tests :
`plugin-atelier/tests/contrats-observatoire.spec.ts`).

| Table | Schéma Zod | Remarques |
| --- | --- | --- |
| `obs_affirmations` | `Affirmation`, `StatutVerification`, `Confiance` | `confiance` + `confiance_motif` forment l'objet `Confiance` |
| `obs_preuves` | `PreuveObservatoire` | le `CHECK` SQL reprend le « exactement un lien » ; `Affirmation.preuves` les embarque |
| `obs_essais` | (phase 2 ou 3) | seul `essaiId` est référencé par ce lot |
| `obs_instantanes` | (phase 2) | seul `instantaneId` est référencé par ce lot |
| `obs_projets`, `obs_affirmations` (cible `fiche.<champ>`) | `Fiche`, `ChampFiche` | la fiche est un document dérivé : un champ = une valeur nullable + statut + `affirmationId` |
| `obs_revisions` | `Revision`, `LangueObservatoire` | règle « EN exige `baseRevisionFr` » : `CHECK` SQL identique |
| `obs_chapitres` | `Chapitre`, `CleChapitre`, `SousChapitre`, `Annexe` | sous-chapitres et annexes vivent dans le contenu de la révision (`contenu_md`) |
| `obs_revisions` + `obs_chapitres` (24 clés) | `Dossier` (`dossier-observatoire/v1`) | vue complète d'une révision |
| `obs_editions` | `Edition` | `obs_entrees_edition` : liste des projets d'une édition, pas encore de schéma |
| `obs_editeurs`, `obs_categories`, `obs_alias`, `obs_sources`, `obs_versions`, `obs_comparaisons`, `obs_publications` | aucun dans ce lot | schémas prévus avec leur phase |

Règle de la porte (F.1) : un chiffre de performance n'est jamais `verifie_experimentalement` sans
essai exécuté par notre service ; côté Zod, `Affirmation` exige déjà une preuve de type essai. Le
contrôle « essai exécuté par notre service » (lien vers `obs_essais`, `approbation_id`) reste à
faire côté serveur.
