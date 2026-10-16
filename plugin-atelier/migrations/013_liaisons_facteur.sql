-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Bureau de liaison : file de sortie (essai reel L9 du 16/10/2026). L hote refuse toute ecriture dans une
-- autre entreprise que celle de l invocation en cours (route ou evenement) : la route de la source ne peut pas
-- creer la tache chez la cible, l evenement de la cible ne peut pas commenter chez la source. Les routes et
-- les evenements ne font plus que les ecritures de leur propre entreprise et laissent le reste dans cette
-- table ; le facteur du worker (minuterie, hors invocation) le traite pour les seules entreprises configurees.
--
-- facteur_essais, facteur_prochain_le : essais bornes avec attente croissante (jamais de boucle serree).
-- facteur_erreur : derniere erreur, lue par l humain dans le journal et le registre.
-- source_notifiee_le : date du commentaire de reponse (ou d annulation) pose sur la tache d origine.
-- Les liaisons deja conclues avant cette migration sont tenues pour notifiees : aucun commentaire tardif.

ALTER TABLE plugin_atelier_f0322cc62c.liaisons
  ADD COLUMN IF NOT EXISTS facteur_essais integer NOT NULL DEFAULT 0 CHECK (facteur_essais >= 0);
ALTER TABLE plugin_atelier_f0322cc62c.liaisons
  ADD COLUMN IF NOT EXISTS facteur_prochain_le timestamptz;
ALTER TABLE plugin_atelier_f0322cc62c.liaisons
  ADD COLUMN IF NOT EXISTS facteur_erreur text CHECK (facteur_erreur IS NULL OR char_length(facteur_erreur) <= 500);
ALTER TABLE plugin_atelier_f0322cc62c.liaisons
  ADD COLUMN IF NOT EXISTS source_notifiee_le timestamptz;

UPDATE plugin_atelier_f0322cc62c.liaisons SET source_notifiee_le = coalesce(repondu_le, now())
  WHERE statut IN ('repondue', 'annulee', 'refusee') AND source_notifiee_le IS NULL;

CREATE INDEX IF NOT EXISTS liaisons_facteur_idx ON plugin_atelier_f0322cc62c.liaisons (statut, facteur_prochain_le)
  WHERE (statut = 'ouverte' AND tache_cible_id IS NULL) OR (statut IN ('repondue', 'annulee') AND source_notifiee_le IS NULL);
