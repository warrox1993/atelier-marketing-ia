-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier (format du validateur de migrations de Paperclip).
--
-- O1 (audit du 29/10/2026) : la porte refuse desormais (OBS-15) toute source citee dont politique_collecte n est pas
-- explicitement autorisee. Les sources deja enregistrees sont des sources examinees : elles sont autorisees, en attendant
-- la decision de droits K4. Seules les lignes sans decision sont modifiees ; relancer la migration ne change rien.
UPDATE plugin_atelier_f0322cc62c.obs_sources
  SET politique_collecte = politique_collecte || '{"autorisee": true}'::jsonb
  WHERE politique_collecte->'autorisee' IS NULL;
