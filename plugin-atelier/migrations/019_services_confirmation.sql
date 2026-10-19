-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Declaration des services en deux temps (revue de securite du 19/10/2026, faille E1) : une entreprise ajoutee a un
-- client par une declaration lancee depuis une AUTRE entreprise n est qu une demande. Elle ne compte comme membre du
-- client (lecture de la synthese, base commune, departements, registre des echanges, flux) qu apres confirmation par
-- la route services.confirmer, qui prouve l acces de l humain a CETTE entreprise (verifie par l hote).
-- Colonne confirme_le : date de la confirmation, NULL tant que l entreprise n est pas confirmee.
--
-- Donnees existantes (aucune suppression) : toutes les lignes deja presentes sont marquees CONFIRMEES, pour ne pas
-- casser le client reel. Le defaut now() ne sert qu a cela : il est retire aussitot apres, de sorte qu une ligne
-- nouvelle est NON confirmee tant que le code ne la confirme pas. Relancer cette migration ne confirme rien de plus.

ALTER TABLE plugin_atelier_f0322cc62c.services_entreprises
  ADD COLUMN IF NOT EXISTS confirme_le timestamptz DEFAULT now();

ALTER TABLE plugin_atelier_f0322cc62c.services_entreprises
  ALTER COLUMN confirme_le DROP DEFAULT;
