-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier (format du validateur de migrations de Paperclip).
--
-- INJ-9 (audit du 29/10/2026) : seconde decision humaine, distincte de l approbation de la revision, exigee avant
-- d enregistrer la premiere publication du site et celle de tout article qui contient un lien externe. Une ligne par
-- revision confirmee (objet = identifiant de la revision, comme obs_publications.objet). Table ajoutee seulement ;
-- relancer la migration ne change rien.
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.obs_confirmations_publication (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  objet text NOT NULL,
  confirmee_par text NOT NULL,
  confirmee_le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, objet)
);
