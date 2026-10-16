-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Corbeille de l atelier : une suppression de tache, de document de connaissances ou de prospect est
-- d abord réversible. L element reste en place mais masque (colonne corbeille_le pour les documents et
-- les prospects ; statut annule pour une tache, le statut precedent est garde ici) et une ligne de la
-- table corbeille memorise ce qu il faut pour le restaurer. La suppression reelle a lieu a la purge
-- (30 jours apres, ou quand la personne vide la corbeille).

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.corbeille (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('tache', 'document', 'prospect')),
  element_id text NOT NULL CHECK (char_length(element_id) BETWEEN 1 AND 64),
  titre text NOT NULL,
  etat_avant jsonb NOT NULL DEFAULT '{}'::jsonb,
  supprime_par text NOT NULL,
  supprime_le timestamptz NOT NULL DEFAULT now(),
  purge_prevue_le timestamptz NOT NULL,
  CONSTRAINT corbeille_unique_element UNIQUE (company_id, type, element_id)
);
CREATE INDEX IF NOT EXISTS corbeille_entreprise_idx ON plugin_atelier_f0322cc62c.corbeille (company_id, supprime_le DESC);

-- Masquage des documents et des prospects : les listes, la recherche et les exports ignorent les lignes
-- dont corbeille_le est renseigne.
ALTER TABLE plugin_atelier_f0322cc62c.connaissances_documents
  ADD COLUMN IF NOT EXISTS corbeille_le timestamptz;
ALTER TABLE plugin_atelier_f0322cc62c.prospects
  ADD COLUMN IF NOT EXISTS corbeille_le timestamptz;
