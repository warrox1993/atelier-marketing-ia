-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier (voir la migration 030).
--
-- Retrait de la liste Ne m appelez plus decide par le proprietaire le 06/11 : une base legale telephone
-- s enregistre sans date de verification. La contrainte de la migration 007 qui l exigeait est levee.
-- Migration additive : la colonne dncm_verifie_le et les deux tables de la liste restent en base, vides de
-- tout usage (ni lues ni ecrites par le code) ; le socle refuse DROP TABLE et le proprietaire exclut DROP COLUMN.

ALTER TABLE plugin_atelier_f0322cc62c.bases_legales
  DROP CONSTRAINT IF EXISTS bases_legales_dncm;
