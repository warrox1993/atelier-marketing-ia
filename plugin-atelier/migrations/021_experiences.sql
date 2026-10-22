-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Experiences A/B tenues par le systeme. Une experience compare 2 a 4 variantes (la premiere est la reference) sur une
-- metrique de type taux (succes / essais). Les resultats par variante, leur provenance (reponse signee referencee ou
-- humain) et le verdict sont des documents JSON. Le verdict est CALCULE par le code a la cloture, puis fige : cette table
-- ne laisse aucun agent le saisir. La tache Apprentissage creee pour le Stratege est memorisee ici pour ne jamais etre
-- creee deux fois. La colonne version sert aux ecritures concurrentes (compare-and-set). Table nouvelle, aucune donnee existante touchee ; relancer la migration ne change rien.

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.experiences (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campagne_id uuid REFERENCES plugin_atelier_f0322cc62c.campagnes(id) ON DELETE SET NULL,
  issue_id uuid REFERENCES public.issues(id) ON DELETE SET NULL,
  hypothese text NOT NULL CHECK (char_length(hypothese) BETWEEN 1 AND 600),
  metrique text NOT NULL CHECK (char_length(metrique) BETWEEN 1 AND 120),
  variantes jsonb NOT NULL,
  essais_min integer NOT NULL CHECK (essais_min BETWEEN 1 AND 1000000000),
  duree_max_jours integer NOT NULL CHECK (duree_max_jours BETWEEN 1 AND 365),
  alpha double precision NOT NULL DEFAULT 0.05 CHECK (alpha > 0 AND alpha <= 0.1),
  statut text NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'conclue', 'arretee')),
  resultats jsonb NOT NULL DEFAULT '[]'::jsonb,
  verdict jsonb,
  tache_apprentissage_id uuid,
  version integer NOT NULL DEFAULT 0,
  cree_par text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  cloture_le timestamptz
);
CREATE INDEX IF NOT EXISTS experiences_entreprise_idx ON plugin_atelier_f0322cc62c.experiences (company_id, cree_le);
CREATE INDEX IF NOT EXISTS experiences_tache_idx ON plugin_atelier_f0322cc62c.experiences (company_id, issue_id);
