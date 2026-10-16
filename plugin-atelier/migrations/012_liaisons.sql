-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Bureau de liaison entre services. Chaque service de l entreprise du client est une entreprise Paperclip
-- distincte (cloisonnement natif) ; les services ne communiquent que par des liaisons portees par le plugin.
--
-- services_entreprises : quelle entreprise correspond a quel service. Le marqueur du client regroupe les
-- entreprises d un meme client (deux entreprises de marqueurs differents ne se parlent jamais). Declare par
-- un humain (route services.declarer) en attendant le bootstrap.
-- flux_services : matrice des flux autorises entre services d un client, copie validee du registre des services.
-- liaisons : une demande d un service vers un autre. company_id est l entreprise SOURCE (propriete et purge).

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.services_entreprises (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  client_marqueur text NOT NULL CHECK (client_marqueur ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  service_slug text NOT NULL CHECK (service_slug ~ '^[a-z][a-z0-9-]{1,39}$'),
  est_direction boolean NOT NULL DEFAULT false,
  declare_par text NOT NULL,
  declare_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_entreprises_service_unique UNIQUE (client_marqueur, service_slug)
);
CREATE INDEX IF NOT EXISTS services_entreprises_client_idx ON plugin_atelier_f0322cc62c.services_entreprises (client_marqueur);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.flux_services (
  client_marqueur text NOT NULL CHECK (client_marqueur ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  source_slug text NOT NULL CHECK (source_slug ~ '^[a-z][a-z0-9-]{1,39}$'),
  cible_slug text NOT NULL CHECK (cible_slug ~ '^[a-z][a-z0-9-]{1,39}$'),
  objet text NOT NULL CHECK (char_length(objet) BETWEEN 1 AND 200),
  approbation_humaine boolean NOT NULL DEFAULT false,
  declare_le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_marqueur, source_slug, cible_slug)
);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.liaisons (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entreprise_cible_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_source text NOT NULL,
  service_cible text NOT NULL,
  tache_origine_id uuid NOT NULL,
  tache_cible_id uuid,
  interaction_id text,
  statut text NOT NULL CHECK (statut IN ('en_attente_approbation', 'ouverte', 'repondue', 'annulee', 'refusee')),
  objet text NOT NULL CHECK (char_length(objet) BETWEEN 1 AND 200),
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 4000),
  extraits jsonb NOT NULL DEFAULT '[]'::jsonb,
  cle_idempotence text NOT NULL,
  demande_par text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  repondu_le timestamptz,
  reponse text CHECK (reponse IS NULL OR char_length(reponse) <= 8000),
  CONSTRAINT liaisons_idempotence_unique UNIQUE (company_id, cle_idempotence)
);
CREATE INDEX IF NOT EXISTS liaisons_source_idx ON plugin_atelier_f0322cc62c.liaisons (company_id, statut);
CREATE INDEX IF NOT EXISTS liaisons_cible_idx ON plugin_atelier_f0322cc62c.liaisons (entreprise_cible_id, statut);
CREATE INDEX IF NOT EXISTS liaisons_tache_cible_idx ON plugin_atelier_f0322cc62c.liaisons (tache_cible_id);
