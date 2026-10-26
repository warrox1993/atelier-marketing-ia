-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier (validateur de migrations de Paperclip).
-- Revue de securite du 25/10 (M1) : une diffusion garde la liste des travaux de la fabrique dont la provenance IA
-- a ete controlee (tableau JSON de UUID en minuscules, trie, sans doublon). Au rejeu, ces travaux sont reverifies
-- avec ceux de la nouvelle requete. Colonne nulle ou absente = liste vide (diffusions anterieures). Relancer ne change rien.

ALTER TABLE plugin_atelier_f0322cc62c.diffusions
  ADD COLUMN IF NOT EXISTS travaux_fabrique jsonb;
