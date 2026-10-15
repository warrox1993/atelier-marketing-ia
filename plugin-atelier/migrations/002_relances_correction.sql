-- Relances de correction décidées par l'humain après épuisement des cycles
-- (décision de l'opérateur du 15/10/2026). Une relance n'accepte jamais un livrable :
-- elle accorde de nouveaux cycles, et la version suivante repasse tous les
-- contrôles. Au moins un levier est obligatoire (contrainte ci-dessous).
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.relances_correction (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  commentaire text NOT NULL CHECK (length(commentaire) BETWEEN 1 AND 4000),
  information jsonb,
  source_id uuid,
  consigne text,
  escalade jsonb,
  revision_avant uuid,
  revision_corrigee uuid,
  cycles_consommes integer NOT NULL CHECK (cycles_consommes >= 0),
  maximum_avant integer NOT NULL CHECK (maximum_avant > 0),
  maximum_apres integer NOT NULL,
  mode text NOT NULL CHECK (mode IN ('demonstration', 'reel')),
  cree_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relances_au_moins_un_levier CHECK (information IS NOT NULL OR consigne IS NOT NULL OR escalade IS NOT NULL OR revision_corrigee IS NOT NULL),
  CONSTRAINT relances_nouveaux_cycles CHECK (maximum_apres > maximum_avant)
);
CREATE INDEX IF NOT EXISTS relances_tache_idx ON plugin_atelier_f0322cc62c.relances_correction (issue_id, cree_le);
