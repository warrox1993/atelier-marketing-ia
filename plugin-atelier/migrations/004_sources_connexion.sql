-- ATTENTION : pas de apostrophe dans les commentaires de ce fichier. Le validateur de migrations de Paperclip
-- retire les chaînes entre apostrophes AVANT les commentaires et avalerait alors le SQL qui suit.
-- Lot L9 (garde des données simulées) : une source peut désormais venir d une connexion
-- (réponse d un outil de la passerelle marketing déposée par un agent). Son mode est déduit
-- par le serveur à partir de la réponse, jamais déclaré par l agent. On garde ici le service,
-- l outil, les indices qui ont fixé le mode, les chiffres retenus pour la porte et le mode
-- effectif de la campagne au moment du dépôt.

ALTER TABLE plugin_atelier_f0322cc62c.sources
  ADD COLUMN IF NOT EXISTS service text,
  ADD COLUMN IF NOT EXISTS outil text,
  ADD COLUMN IF NOT EXISTS indices_mode jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS chiffres jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mode_campagne text CHECK (mode_campagne IS NULL OR mode_campagne IN ('demonstration', 'reel'));

-- Provenances connues, et cohérence : une source de connexion porte toujours son service,
-- son outil, au moins un indice de mode et le mode de sa campagne.
ALTER TABLE plugin_atelier_f0322cc62c.sources
  DROP CONSTRAINT IF EXISTS sources_provenance_connue;
ALTER TABLE plugin_atelier_f0322cc62c.sources
  ADD CONSTRAINT sources_provenance_connue CHECK (provenance IN ('lecture_url', 'import', 'corpus_demonstration', 'humaine', 'connexion'));
ALTER TABLE plugin_atelier_f0322cc62c.sources
  DROP CONSTRAINT IF EXISTS sources_connexion_coherente;
ALTER TABLE plugin_atelier_f0322cc62c.sources
  ADD CONSTRAINT sources_connexion_coherente CHECK (
    provenance <> 'connexion'
    OR (service IS NOT NULL AND outil IS NOT NULL AND mode_campagne IS NOT NULL AND jsonb_array_length(indices_mode) > 0)
  );

CREATE INDEX IF NOT EXISTS sources_tache_idx ON plugin_atelier_f0322cc62c.sources (company_id, issue_id, mode);
