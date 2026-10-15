-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaînes entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Contrats v1.7, lot R1 : connaissances du client, recherche documentaire (docs/rag-conception.md,
-- §6.2 et §13.8). Schémas Zod correspondants : src/contrats/connaissances.ts.
--
-- Décisions du lot R0 appliquées ici :
-- - pas de pgvector (absent du PostgreSQL embarqué ; CREATE EXTENSION interdit au plugin) : le vecteur
--   est un bytea de 4 096 octets (1 024 float32), écrit par decode(…, base64) et lu par encode(…, base64),
--   rangé hors ligne sans compression (SET STORAGE EXTERNAL) ;
-- - pas de unaccent (non installé, et STABLE donc inutilisable en colonne générée ou en index) : le code
--   remplit texte_normalise (sans accents, minuscules), le même à l indexation et à la requête ;
-- - plein texte french ou dutch selon la langue du passage, colonne générée et index GIN ; index
--   trigramme pour les codes et numéros (pg_trgm est installé par Paperclip) ;
-- - une version est écrite en plusieurs INSERT si besoin, puis activée par un seul UPDATE : la recherche
--   ne lit que les versions actives ;
-- - le cache des vecteurs se charge par pages, en suivant l index (company_id, index_id, id).

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.connaissances_index (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fournisseur text NOT NULL CHECK (fournisseur IN ('aucun', 'local', 'voyage')),
  modele text,
  revision text CHECK (revision IS NULL OR revision ~ '^[0-9a-f]{40}$'),
  empreinte_modele text CHECK (empreinte_modele IS NULL OR empreinte_modele ~ '^[0-9a-f]{64}$'),
  dimension integer CHECK (dimension IS NULL OR dimension BETWEEN 256 AND 2048),
  version_index integer NOT NULL CHECK (version_index > 0),
  actif boolean NOT NULL DEFAULT false,
  passages_indexes integer NOT NULL DEFAULT 0 CHECK (passages_indexes >= 0),
  cree_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connaissances_index_sans_vecteur CHECK ((fournisseur = 'aucun') = (modele IS NULL AND dimension IS NULL)),
  CONSTRAINT connaissances_index_local CHECK (
    fournisseur <> 'local' OR (dimension = 1024 AND revision IS NOT NULL AND empreinte_modele IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS connaissances_index_actif_uidx ON plugin_atelier_f0322cc62c.connaissances_index (company_id) WHERE actif;

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.connaissances_documents (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  titre text NOT NULL,
  type text NOT NULL CHECK (type IN (
    'conditions_generales', 'fiche_produit', 'tarif', 'offre', 'faq', 'argumentaire',
    'note_rdv', 'retour_partenaire', 'reclamation', 'campagne', 'autre'
  )),
  produit text,
  langue text NOT NULL CHECK (langue IN ('fr', 'nl')),
  mode text NOT NULL CHECK (mode IN ('demonstration', 'reel')),
  cree_par text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connaissances_documents_entreprise_idx ON plugin_atelier_f0322cc62c.connaissances_documents (company_id, type);

-- Versions : validité, statut, empreinte du fichier (jamais le fichier lui-même), indexation.
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.connaissances_versions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.connaissances_documents(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  nom_fichier text NOT NULL,
  format text NOT NULL CHECK (format IN ('pdf', 'docx', 'markdown', 'texte', 'html', 'csv', 'xlsx')),
  taille_octets integer NOT NULL CHECK (taille_octets >= 0),
  empreinte text NOT NULL CHECK (empreinte ~ '^[0-9a-f]{64}$'),
  pages integer CHECK (pages IS NULL OR pages >= 0),
  date_document date NOT NULL,
  valide_du date NOT NULL,
  valide_au date,
  statut text NOT NULL CHECK (statut IN ('en_vigueur', 'a_venir', 'perime', 'retire')),
  remplace_version integer,
  revue_prevue_le date NOT NULL,
  pseudonymise boolean NOT NULL DEFAULT false,
  pseudonymisation jsonb,
  injections_signalees jsonb NOT NULL DEFAULT '[]'::jsonb,
  etat_indexation text NOT NULL DEFAULT 'en_file' CHECK (etat_indexation IN ('en_file', 'en_cours', 'indexe', 'refuse')),
  motif_refus text,
  passages integer NOT NULL DEFAULT 0 CHECK (passages >= 0),
  active boolean NOT NULL DEFAULT false,
  mode text NOT NULL CHECK (mode IN ('demonstration', 'reel')),
  importe_par text NOT NULL,
  importe_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connaissances_versions_validite CHECK (valide_au IS NULL OR valide_au > valide_du),
  CONSTRAINT connaissances_versions_remplace CHECK (remplace_version IS NULL OR remplace_version < version),
  CONSTRAINT connaissances_versions_refus CHECK ((etat_indexation = 'refuse') = (motif_refus IS NOT NULL)),
  CONSTRAINT connaissances_versions_active_indexee CHECK (NOT active OR etat_indexation = 'indexe'),
  CONSTRAINT connaissances_versions_pseudonymisation CHECK (pseudonymise = (pseudonymisation IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS connaissances_versions_numero_uidx ON plugin_atelier_f0322cc62c.connaissances_versions (document_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS connaissances_versions_active_uidx ON plugin_atelier_f0322cc62c.connaissances_versions (document_id) WHERE active;
CREATE INDEX IF NOT EXISTS connaissances_versions_filtres_idx ON plugin_atelier_f0322cc62c.connaissances_versions (company_id, active, statut, valide_du, valide_au);
CREATE INDEX IF NOT EXISTS connaissances_versions_revue_idx ON plugin_atelier_f0322cc62c.connaissances_versions (company_id, revue_prevue_le);
CREATE INDEX IF NOT EXISTS connaissances_versions_file_idx ON plugin_atelier_f0322cc62c.connaissances_versions (etat_indexation, importe_le);

-- Passages : texte, texte normalisé par le code, plein texte généré, vecteur facultatif de l index actif.
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.connaissances_passages (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.connaissances_documents(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.connaissances_versions(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  ordre integer NOT NULL CHECK (ordre >= 0),
  texte text NOT NULL,
  texte_normalise text NOT NULL,
  langue text NOT NULL CHECK (langue IN ('fr', 'nl')),
  page integer CHECK (page IS NULL OR page > 0),
  section text,
  empreinte text NOT NULL CHECK (empreinte ~ '^[0-9a-f]{64}$'),
  injections_signalees jsonb NOT NULL DEFAULT '[]'::jsonb,
  index_id uuid REFERENCES plugin_atelier_f0322cc62c.connaissances_index(id) ON DELETE SET NULL,
  vecteur bytea CHECK (vecteur IS NULL OR (octet_length(vecteur) BETWEEN 1024 AND 8192 AND octet_length(vecteur) % 4 = 0)),
  tsv tsvector GENERATED ALWAYS AS (
    to_tsvector(CASE WHEN langue = 'nl' THEN 'dutch'::regconfig ELSE 'french'::regconfig END, texte_normalise)
  ) STORED,
  CONSTRAINT connaissances_passages_vecteur_index CHECK (vecteur IS NULL OR index_id IS NOT NULL)
);
ALTER TABLE plugin_atelier_f0322cc62c.connaissances_passages ALTER COLUMN vecteur SET STORAGE EXTERNAL;
CREATE UNIQUE INDEX IF NOT EXISTS connaissances_passages_ordre_uidx ON plugin_atelier_f0322cc62c.connaissances_passages (version_id, ordre);
CREATE INDEX IF NOT EXISTS connaissances_passages_cache_idx ON plugin_atelier_f0322cc62c.connaissances_passages (company_id, index_id, id);
CREATE INDEX IF NOT EXISTS connaissances_passages_version_idx ON plugin_atelier_f0322cc62c.connaissances_passages (company_id, version_id);
CREATE INDEX IF NOT EXISTS connaissances_passages_tsv_idx ON plugin_atelier_f0322cc62c.connaissances_passages USING gin (tsv);
CREATE INDEX IF NOT EXISTS connaissances_passages_trgm_idx ON plugin_atelier_f0322cc62c.connaissances_passages USING gin (texte_normalise public.gin_trgm_ops);

-- Sources de tâche de provenance connaissance : le passage cité. Supprimer un document supprime aussi
-- les sources qui en citent un extrait (cascade par le passage).
ALTER TABLE plugin_atelier_f0322cc62c.sources
  ADD COLUMN IF NOT EXISTS connaissance_document_id uuid REFERENCES plugin_atelier_f0322cc62c.connaissances_documents(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS connaissance_version integer,
  ADD COLUMN IF NOT EXISTS connaissance_passage_id uuid REFERENCES plugin_atelier_f0322cc62c.connaissances_passages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS connaissance_adresse text;
ALTER TABLE plugin_atelier_f0322cc62c.sources
  DROP CONSTRAINT IF EXISTS sources_provenance_connue;
ALTER TABLE plugin_atelier_f0322cc62c.sources
  ADD CONSTRAINT sources_provenance_connue CHECK (provenance IN ('lecture_url', 'import', 'corpus_demonstration', 'humaine', 'connexion', 'connaissance'));
ALTER TABLE plugin_atelier_f0322cc62c.sources
  DROP CONSTRAINT IF EXISTS sources_connaissance_coherente;
ALTER TABLE plugin_atelier_f0322cc62c.sources
  ADD CONSTRAINT sources_connaissance_coherente CHECK (
    provenance <> 'connaissance'
    OR (
      connaissance_document_id IS NOT NULL AND connaissance_version IS NOT NULL
      AND connaissance_passage_id IS NOT NULL AND connaissance_adresse LIKE 'connaissance://%'
    )
  );
CREATE INDEX IF NOT EXISTS sources_connaissance_idx ON plugin_atelier_f0322cc62c.sources (company_id, connaissance_document_id);
