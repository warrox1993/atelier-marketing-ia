-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier (format du validateur de migrations de Paperclip).
--
-- Base commune des sources de l Observatoire : une source commune est citable par tout article de l entreprise, sans etre
-- rattachee a un projet. La base est cumulative : une source n est jamais supprimee ; injoignable ou muette, elle passe
-- en sommeil (etat, motif, date) et reste dans la base. Une source proposee par un agent reste candidate (listee, non
-- citable) tant qu elle n a pas ete lue avec succes.
-- Colonnes ajoutees seulement, valeurs par defaut sures : une source existante reste active et propre a son projet.
-- Ne modifie ni la 023 ni la 024 (deja appliquees). Relancer la migration ne change rien.
ALTER TABLE plugin_atelier_f0322cc62c.obs_sources
  ADD COLUMN IF NOT EXISTS commune boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fiabilite text CHECK (fiabilite IN ('A', 'B', 'C')),
  ADD COLUMN IF NOT EXISTS langue text,
  ADD COLUMN IF NOT EXISTS pays text,
  ADD COLUMN IF NOT EXISTS sujets jsonb,
  ADD COLUMN IF NOT EXISTS etat text NOT NULL DEFAULT 'active' CHECK (etat IN ('active', 'candidate', 'en_sommeil')),
  ADD COLUMN IF NOT EXISTS etat_motif text,
  ADD COLUMN IF NOT EXISTS etat_le timestamptz,
  ADD COLUMN IF NOT EXISTS motif text,
  ADD COLUMN IF NOT EXISTS ajoutee_par text,
  ADD COLUMN IF NOT EXISTS ajoutee_le timestamptz;
