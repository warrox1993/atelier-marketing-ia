-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier (voir la migration 030).
--
-- Lot 2 (T12) : la strategie marketing approuvee est publiee en connaissance, avec le type strategie.
-- La contrainte de la colonne type de la migration 008 (nom implicite connaissances_documents_type_check)
-- est elargie ; aucune ligne existante ne change.

ALTER TABLE plugin_atelier_f0322cc62c.connaissances_documents
  DROP CONSTRAINT IF EXISTS connaissances_documents_type_check;

ALTER TABLE plugin_atelier_f0322cc62c.connaissances_documents
  ADD CONSTRAINT connaissances_documents_type_check CHECK (type IN (
    'conditions_generales', 'fiche_produit', 'tarif', 'offre', 'faq', 'argumentaire',
    'note_rdv', 'retour_partenaire', 'reclamation', 'campagne', 'strategie', 'autre'
  ));
