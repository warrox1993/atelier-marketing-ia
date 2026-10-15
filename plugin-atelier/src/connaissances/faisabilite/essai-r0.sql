-- Commentaires sans apostrophe droite : le validateur de l’hôte retire les chaînes avant les commentaires.
-- Lot R0 (faisabilité) : table JETABLE, installée seulement dans la copie du plugin sur une
-- instance d’essai (copiée en `migrations/900_essai_r0.sql` par construire-copie-r0.mjs).
-- Ne jamais la mettre dans plugin-atelier/migrations/ : la vraie table viendra de la 008 (lot R1).

CREATE TABLE plugin_atelier_f0322cc62c.essai_r0_passages (
  id integer PRIMARY KEY,
  langue text NOT NULL CHECK (langue IN ('fr', 'nl')),
  texte text NOT NULL,
  texte_normalise text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (
    to_tsvector(CASE WHEN langue = 'nl' THEN 'dutch'::regconfig ELSE 'french'::regconfig END, texte_normalise)
  ) STORED,
  tsv_accents tsvector GENERATED ALWAYS AS (
    to_tsvector(CASE WHEN langue = 'nl' THEN 'dutch'::regconfig ELSE 'french'::regconfig END, texte)
  ) STORED,
  vecteur_bytea bytea,
  vecteur_reel real[]
);

CREATE INDEX essai_r0_passages_tsv ON plugin_atelier_f0322cc62c.essai_r0_passages USING gin (tsv);

CREATE INDEX essai_r0_passages_trgm ON plugin_atelier_f0322cc62c.essai_r0_passages USING gin (texte_normalise public.gin_trgm_ops);
