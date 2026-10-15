-- ATTENTION : pas de apostrophe dans les commentaires de ce fichier (validateur de migrations de Paperclip).
-- Revue de securite des signatures du 15/10/2026 (docs/revue-securite-signatures.md), contrat v1.6.
--
-- S-1 : l humain approuve l APPEL EXACT. L agent propose un appel (service, outil, compte, arguments
-- complets) sur une revision ; le serveur en calcule l empreinte canonique (SHA-256 du JSON canonique)
-- et garde les arguments pour les montrer a l humain. La decision vise cette empreinte.
--
-- S-4 : la charge de la premiere preuve signee est figee sur la diffusion ; un rejeu la re-signe
-- a l identique (meme emission, meme expiration ; Ed25519 deterministe : meme jeton). Le jeton
-- lui-meme n est toujours pas stocke.
--
-- S-7 : etat revoque d une preuve remise (horodatage et motif), consulte par le rejeu et publie
-- en liste signee pour la passerelle.
--
-- S-6 : compte signe par la passerelle d une donnee de connexion reelle (controle du compte au depot).

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.appels_proposes (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL,
  service text NOT NULL,
  outil text NOT NULL,
  action text NOT NULL CHECK (action IN ('publier', 'envoyer', 'modifier_crm')),
  compte text NOT NULL,
  arguments jsonb NOT NULL,
  empreinte text NOT NULL CHECK (empreinte ~ '^[0-9a-f]{64}$'),
  empreinte_arguments text NOT NULL CHECK (empreinte_arguments ~ '^[0-9a-f]{64}$'),
  propose_par text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS appels_proposes_empreinte_uidx ON plugin_atelier_f0322cc62c.appels_proposes (company_id, issue_id, revision_id, empreinte);
CREATE INDEX IF NOT EXISTS appels_proposes_tache_idx ON plugin_atelier_f0322cc62c.appels_proposes (company_id, issue_id, cree_le);

ALTER TABLE plugin_atelier_f0322cc62c.diffusions
  ADD COLUMN IF NOT EXISTS preuve_charge jsonb,
  ADD COLUMN IF NOT EXISTS revoquee_le timestamptz,
  ADD COLUMN IF NOT EXISTS revocation_motif text;

ALTER TABLE plugin_atelier_f0322cc62c.sources
  ADD COLUMN IF NOT EXISTS compte text;
