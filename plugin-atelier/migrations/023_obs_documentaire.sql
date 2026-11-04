-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Stockage documentaire de l Observatoire : projets suivis, alias, sources, instantanes (texte normalise des pages lues),
-- versions, affirmations verifiables, preuves (extrait exact cite), revisions de dossier et publications.
-- Chaque table porte company_id : toute lecture ou ecriture est filtree par entreprise. Une preuve cite soit un instantane,
-- soit un essai (exactement un des deux) ; la table des essais viendra plus tard, donc essai_id n a pas de cle etrangere.
-- Les sources gardent leur controle (date, echecs consecutifs, etat en echec, etag) pour reprendre une collecte interrompue.
-- La revision native pointe vers la revision de document de tache approuvee. Tables nouvelles, aucune donnee existante
-- touchee ; relancer la migration ne change rien.

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.obs_projets (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  slug text NOT NULL,
  nom text NOT NULL,
  editeur text,
  depot_canonique text,
  statut_editorial text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);
CREATE INDEX IF NOT EXISTS obs_projets_statut_idx ON plugin_atelier_f0322cc62c.obs_projets (company_id, statut_editorial);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.obs_alias (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  projet_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.obs_projets(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('github', 'npm', 'pypi', 'site', 'nom')),
  valeur text NOT NULL,
  UNIQUE (company_id, type, valeur)
);
CREATE INDEX IF NOT EXISTS obs_alias_projet_idx ON plugin_atelier_f0322cc62c.obs_alias (company_id, projet_id);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.obs_sources (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  url_canonique text NOT NULL,
  type text NOT NULL CHECK (type IN ('primaire', 'secondaire', 'communautaire')),
  politique_collecte jsonb NOT NULL DEFAULT '{}'::jsonb,
  licence_reutilisation text,
  etag text,
  last_modified text,
  controle_le timestamptz,
  echecs_consecutifs integer NOT NULL DEFAULT 0,
  en_echec boolean NOT NULL DEFAULT false,
  prochaine_collecte timestamptz,
  UNIQUE (company_id, url_canonique)
);
CREATE INDEX IF NOT EXISTS obs_sources_prochaine_idx ON plugin_atelier_f0322cc62c.obs_sources (company_id, prochaine_collecte);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.obs_instantanes (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.obs_sources(id) ON DELETE CASCADE,
  empreinte_sha256 char(64) NOT NULL,
  recupere_le timestamptz NOT NULL,
  texte_normalise text NOT NULL,
  version_detectee text,
  UNIQUE (source_id, empreinte_sha256)
);
CREATE INDEX IF NOT EXISTS obs_instantanes_source_idx ON plugin_atelier_f0322cc62c.obs_instantanes (company_id, source_id, recupere_le);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.obs_versions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  projet_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.obs_projets(id) ON DELETE CASCADE,
  version text NOT NULL,
  publiee_le timestamptz,
  instantane_id uuid REFERENCES plugin_atelier_f0322cc62c.obs_instantanes(id) ON DELETE SET NULL,
  prerelease boolean NOT NULL DEFAULT false,
  UNIQUE (projet_id, version)
);
CREATE INDEX IF NOT EXISTS obs_versions_projet_idx ON plugin_atelier_f0322cc62c.obs_versions (company_id, projet_id);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.obs_affirmations (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  projet_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.obs_projets(id) ON DELETE CASCADE,
  chapitre text NOT NULL,
  texte text NOT NULL,
  statut text NOT NULL CHECK (statut IN ('verifie_experimentalement', 'confirme_doc_officielle', 'rapporte_editeur', 'rapporte_tiers', 'infere', 'non_verifie', 'contredit', 'obsolete')),
  confiance smallint NOT NULL CHECK (confiance BETWEEN 0 AND 3),
  confiance_motif text NOT NULL,
  version_concernee text,
  remplacee_par uuid REFERENCES plugin_atelier_f0322cc62c.obs_affirmations(id) ON DELETE SET NULL,
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obs_affirmations_projet_idx ON plugin_atelier_f0322cc62c.obs_affirmations (company_id, projet_id, chapitre);
CREATE INDEX IF NOT EXISTS obs_affirmations_statut_idx ON plugin_atelier_f0322cc62c.obs_affirmations (company_id, statut);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.obs_preuves (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  affirmation_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.obs_affirmations(id) ON DELETE CASCADE,
  instantane_id uuid REFERENCES plugin_atelier_f0322cc62c.obs_instantanes(id) ON DELETE CASCADE,
  essai_id uuid,
  extrait_exact text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  CHECK ((instantane_id IS NOT NULL) <> (essai_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS obs_preuves_affirmation_idx ON plugin_atelier_f0322cc62c.obs_preuves (company_id, affirmation_id);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.obs_revisions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  dossier_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.obs_projets(id) ON DELETE CASCADE,
  langue text NOT NULL CHECK (langue IN ('fr', 'en')),
  numero integer NOT NULL CHECK (numero >= 1),
  base_revision_fr integer,
  contenu_md text NOT NULL,
  empreinte char(64) NOT NULL,
  statut text NOT NULL,
  revision_native_id uuid,
  publiee_le timestamptz,
  UNIQUE (dossier_id, langue, numero),
  CHECK (langue <> 'en' OR base_revision_fr IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS obs_revisions_dossier_idx ON plugin_atelier_f0322cc62c.obs_revisions (company_id, dossier_id);
CREATE INDEX IF NOT EXISTS obs_revisions_statut_idx ON plugin_atelier_f0322cc62c.obs_revisions (company_id, statut);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.obs_publications (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cible text NOT NULL CHECK (cible IN ('git', 'pdf', 'index')),
  objet text NOT NULL,
  empreinte_artefact char(64) NOT NULL,
  commit_contenu text,
  publiee_le timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS obs_publications_date_idx ON plugin_atelier_f0322cc62c.obs_publications (company_id, publiee_le);
