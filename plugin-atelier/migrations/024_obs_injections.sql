-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier (format du validateur de migrations de Paperclip).
--
-- Signalements d injection du texte collecte : la collecte repere les consignes piegees d une page, la lecture de l instantane
-- les rend a l agent avec le texte (donnee non fiable). Colonne nullable : un instantane ancien reste lisible, sans signalement.
-- Ne modifie pas la migration 023 (deja appliquee). Relancer la migration ne change rien.
ALTER TABLE plugin_atelier_f0322cc62c.obs_instantanes ADD COLUMN IF NOT EXISTS injections_signalees jsonb;
