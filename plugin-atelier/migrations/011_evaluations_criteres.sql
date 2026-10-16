-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Evaluation automatique des criteres personnalises par l agent Prospection. Table distincte de
-- corrections_criteres (migration 010) : la decision humaine prime toujours, l agent ne peut jamais
-- l effacer ni la remplacer. Une seule evaluation par prospect et par critere, remplacee a chaque nouvel avis.

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.evaluations_criteres (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.prospects(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  statut text NOT NULL CHECK (statut IN ('verifie', 'contraire', 'non_verifie')),
  justification text NOT NULL CHECK (char_length(justification) BETWEEN 3 AND 500),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  agent text NOT NULL,
  evalue_le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (prospect_id, code)
);
CREATE INDEX IF NOT EXISTS evaluations_criteres_entreprise_idx ON plugin_atelier_f0322cc62c.evaluations_criteres (company_id);
