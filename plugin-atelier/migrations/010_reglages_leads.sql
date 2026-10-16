-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Reglages des leads choisis par le client : quels criteres comptent pour la confiance de qualification,
-- leur poids, le seuil et les criteres personnalises (verifies seulement a la main). Versionnes comme les
-- poids du score : chaque modification ajoute une version, rien n est modifie en place.

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.reglages_leads (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  criteres jsonb NOT NULL,
  seuil integer NOT NULL CHECK (seuil BETWEEN 50 AND 100),
  personnalises jsonb NOT NULL DEFAULT '[]'::jsonb,
  decide_par text NOT NULL,
  decide_le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, version)
);

-- Decision humaine sur un critere d un lead : elle remplace le statut calcule de CE critere pour CE
-- prospect, jusqu a sa suppression (retour au calcul). Une seule decision par prospect et par critere.
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.corrections_criteres (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.prospects(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  statut text NOT NULL CHECK (statut IN ('verifie', 'contraire', 'non_verifie')),
  justification text NOT NULL CHECK (char_length(justification) BETWEEN 3 AND 500),
  auteur text NOT NULL,
  decide_le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (prospect_id, code)
);
CREATE INDEX IF NOT EXISTS corrections_criteres_entreprise_idx ON plugin_atelier_f0322cc62c.corrections_criteres (company_id);
