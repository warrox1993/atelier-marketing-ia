-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Securite des donnees dautrui : supprimer une entreprise ne doit jamais effacer les liaisons dune autre.
-- - company_id est lentreprise SOURCE proprietaire de la liaison : sa suppression efface bien ses liaisons.
-- - entreprise_cible_id ne fait que viser une autre entreprise : sa suppression laissait CASCADE effacer les
--   liaisons de la source. La cle devient nullable avec ON DELETE SET NULL : la liaison survit, sa cible devient
--   nulle et laffichage indique service supprime.
-- - Nouveau statut final cible_supprimee : le facteur ne transmet plus une demande dont la cible nexiste plus.
-- - Aucune autre table du plugin na de cle vers public.companies autre que company_id (verifie par grep).

ALTER TABLE plugin_atelier_f0322cc62c.liaisons
  ALTER COLUMN entreprise_cible_id DROP NOT NULL;

ALTER TABLE plugin_atelier_f0322cc62c.liaisons
  DROP CONSTRAINT IF EXISTS liaisons_entreprise_cible_id_fkey;

ALTER TABLE plugin_atelier_f0322cc62c.liaisons
  ADD CONSTRAINT liaisons_entreprise_cible_id_fkey FOREIGN KEY (entreprise_cible_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE plugin_atelier_f0322cc62c.liaisons
  DROP CONSTRAINT IF EXISTS liaisons_statut_check;

ALTER TABLE plugin_atelier_f0322cc62c.liaisons
  ADD CONSTRAINT liaisons_statut_check CHECK (statut IN ('en_attente_approbation', 'ouverte', 'repondue', 'annulee', 'refusee', 'cible_supprimee'));
