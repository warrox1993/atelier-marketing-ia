-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Moteur de missions (issue 56) : compteur de cycles de blocage de la mission.
-- Migration additive : une colonne entiere avec valeur par defaut, aucune donnee existante touchee ; relancer la migration ne change rien.
-- cycle_blocage : monte de un a chaque sortie de blocage, dans le meme UPDATE que le changement detat.
-- Il entre dans les cles de transition et de reveil du moteur : un second blocage dune meme mission sapplique comme le premier.

ALTER TABLE plugin_atelier_f0322cc62c.missions ADD COLUMN IF NOT EXISTS cycle_blocage integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN plugin_atelier_f0322cc62c.missions.cycle_blocage IS 'Nombre de sorties de blocage de la mission, repris dans les cles de transition et de reveil';
