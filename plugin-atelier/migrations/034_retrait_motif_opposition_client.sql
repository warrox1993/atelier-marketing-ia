-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier (voir la migration 030).
--
-- Migration de DONNEES, additive : aucune table, colonne ni ligne supprimee.
-- Lopposition dun client ne fait plus quinformer : elle ne pose plus le motif opposition_client. Les fiches que lancien code
-- avait ecartees avec ce motif sont corrigees : le motif est retire de motifs_exclusion et, si aucun autre motif ne reste,
-- le statut redevient nouveau (la contrainte prospects_exclusion_coherente impose : exclu si et seulement si au moins un motif).
-- Une fiche qui porte aussi un autre motif garde cet autre motif et reste exclue.

UPDATE plugin_atelier_f0322cc62c.prospects
SET motifs_exclusion = COALESCE((SELECT jsonb_agg(m) FROM jsonb_array_elements(motifs_exclusion) AS m WHERE m->>'motif' <> 'opposition_client'), '[]'::jsonb),
    statut = CASE WHEN statut = 'exclu' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(motifs_exclusion) AS m WHERE m->>'motif' <> 'opposition_client') THEN 'nouveau' ELSE statut END,
    modifie_le = now()
WHERE motifs_exclusion @> '[{"motif":"opposition_client"}]'::jsonb;
