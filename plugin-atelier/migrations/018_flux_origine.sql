-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Origine des flux de la matrice (vue Organigramme) : flux metier du registre des services, ou reseau des
-- coordinateurs genere par scripts/atelier_services.py (flux_coordinateurs). Le registre les separe deja ; la
-- table flux_services perdait cette information a la declaration.
--
-- Donnees existantes (aucune suppression) : les lignes dont l objet commence par un des deux libelles generes par
-- flux_coordinateurs passent en coordinateurs, toutes les autres restent metier (valeur par defaut). Les libelles
-- exacts sont OBJET_ENTRE_COORDINATEURS (Liaison entre coordinateurs, competence protocole-inter-coordinateurs) et
-- OBJET_COORDINATEUR_GENERAL (Coordinateur general et coordinateurs de departement, meme competence). Le motif
-- remplace les lettres accentuees par un joker, pour rester en ASCII.

ALTER TABLE plugin_atelier_f0322cc62c.flux_services
  ADD COLUMN IF NOT EXISTS origine text NOT NULL DEFAULT 'metier' CHECK (origine IN ('metier', 'coordinateurs'));

UPDATE plugin_atelier_f0322cc62c.flux_services SET origine = 'coordinateurs'
  WHERE origine = 'metier'
    AND (objet LIKE 'Liaison entre coordinateurs (comp%tence protocole-inter-coordinateurs) : %'
      OR objet LIKE 'Coordinateur g%n%ral et coordinateurs de d%partement (comp%tence protocole-inter-coordinateurs) : %');
