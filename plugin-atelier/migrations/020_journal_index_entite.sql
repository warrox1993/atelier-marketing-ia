-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Revue de securite du 21/10/2026, point F6 : le relais des comptes rendus d etape et les autres dedoublonnages
-- interrogent le journal par (entreprise, type, entite), requetes qui parcouraient toute la table. Cet index les couvre.
-- Aucune donnee touchee ; relancer la migration ne change rien.

CREATE INDEX IF NOT EXISTS journal_entreprise_type_entite_idx
  ON plugin_atelier_f0322cc62c.journal (company_id, type, entite_id);
