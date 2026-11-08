-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Moteur de missions (issue 50) : lien entre la sortie deposee et le document relu.
-- Migration additive : une colonne nullable sur etapes, aucune donnee existante touchee ; relancer la migration ne change rien.
-- revision_livrable : revision du document natif de la tache au moment du depot de la derniere sortie sous porte.
-- Une approbation humaine sur une autre revision ne cloture pas la mission.

ALTER TABLE plugin_atelier_f0322cc62c.etapes ADD COLUMN IF NOT EXISTS revision_livrable text;
COMMENT ON COLUMN plugin_atelier_f0322cc62c.etapes.revision_livrable IS 'Revision du document livrable relue sous porte, comparee a la revision courante a lapprobation';
