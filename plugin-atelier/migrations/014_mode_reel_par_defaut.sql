-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Lot G1 du retrait du mode demonstration : le mode par defaut devient reel.
-- - mode_par_defaut des reglages de lentreprise : defaut reel, et les reglages deja enregistres passent en reel.
-- - Les contraintes CHECK acceptent encore demonstration : elles seront resserrees au lot suivant.
-- - Les campagnes et les donnees deja enregistrees gardent leur mode : rien de simule nest requalifie en reel
--   (la garde des donnees reste stricte, une donnee non signee ou simulee nest jamais acceptee comme reelle).

ALTER TABLE plugin_atelier_f0322cc62c.reglages_entreprise
  ALTER COLUMN mode_par_defaut SET DEFAULT 'reel';

UPDATE plugin_atelier_f0322cc62c.reglages_entreprise SET mode_par_defaut = 'reel', modifie_le = now()
  WHERE mode_par_defaut <> 'reel';
