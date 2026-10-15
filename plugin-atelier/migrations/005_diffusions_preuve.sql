-- ATTENTION : pas de apostrophe dans les commentaires de ce fichier (validateur de migrations de Paperclip).
-- Revue de securite de la passerelle, paragraphe 6 (preuve d approbation signee) et revue independante (M1).
-- Une diffusion reelle garde l appel d outil vise : service, outil et empreinte SHA-256 des arguments
-- (JSON canonique, sans la preuve). Un rejeu de la meme demande ne re-signe une preuve que pour ces
-- memes valeurs. La preuve elle-meme n est JAMAIS stockee.
-- L issue rapportee apres l appel (reponse signee de la passerelle) est datee, avec son motif.

ALTER TABLE plugin_atelier_f0322cc62c.diffusions
  ADD COLUMN IF NOT EXISTS service text,
  ADD COLUMN IF NOT EXISTS outil text,
  ADD COLUMN IF NOT EXISTS empreinte_arguments text CHECK (empreinte_arguments IS NULL OR empreinte_arguments ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS issue_rapportee_le timestamptz,
  ADD COLUMN IF NOT EXISTS issue_motif text;

CREATE INDEX IF NOT EXISTS diffusions_tache_idx ON plugin_atelier_f0322cc62c.diffusions (company_id, issue_id, decision_id);
