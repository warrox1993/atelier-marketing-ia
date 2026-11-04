-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier (format du validateur de migrations de Paperclip).
--
-- V2-7 (audit du 29/10/2026) : etat suspecte, pose par un humain (route obs.base.suspecter) sur une source commune douteuse.
-- Une source suspecte reste dans la base (base cumulative, jamais supprimee) : elle est listee, jamais citable, et aucune
-- collecte ne la reveille ni ne l endort. Seule la contrainte d etat de la 025 est elargie (nom donne par Postgres a la
-- contrainte de colonne) ; aucune ligne n est modifiee. Relancer la migration ne change rien.
ALTER TABLE plugin_atelier_f0322cc62c.obs_sources
  DROP CONSTRAINT IF EXISTS obs_sources_etat_check;
ALTER TABLE plugin_atelier_f0322cc62c.obs_sources
  ADD CONSTRAINT obs_sources_etat_check CHECK (etat IN ('active', 'candidate', 'en_sommeil', 'suspecte'));
