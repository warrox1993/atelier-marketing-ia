-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- MK-09 (audit du 29/10/2026) : la Conformite publicitaire devient un controleur de la porte, avec son role de
-- revue (RoleRevue, src/contrats/communs.ts). Son verdict structure bloque alors la porte comme les trois autres.
-- La contrainte de la colonne role de la migration 001 (nom implicite verdicts_role_check) est elargie ;
-- aucune ligne existante ne change.

ALTER TABLE plugin_atelier_f0322cc62c.verdicts
  DROP CONSTRAINT IF EXISTS verdicts_role_check;

ALTER TABLE plugin_atelier_f0322cc62c.verdicts
  ADD CONSTRAINT verdicts_role_check CHECK (role IN ('exigences', 'metier', 'technique', 'conformite'));
