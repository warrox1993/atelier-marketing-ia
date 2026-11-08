-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier (voir la migration 030).
--
-- Temoin de la cle des empreintes. Les empreintes des oppositions sont calculees avec le secret
-- donneesCleHmac ; si ce secret change, elles ne sont plus retrouvees et la liste parait vide sans rien dire.
-- Chaque entreprise garde donc un temoin court de la cle utilisee (16 caracteres hexadecimaux, HMAC dune
-- constante par la cle, jamais la cle ni un hachage nu de la cle). Au chargement des cles, un temoin different
-- est signale (reponse et journal) ; rien nest refuse. Une entreprise sans temoin adopte la premiere cle chargee.
-- Migration additive : une seule colonne nullable, aucune donnee modifiee ni retiree.

ALTER TABLE plugin_atelier_f0322cc62c.reglages_entreprise
  ADD COLUMN IF NOT EXISTS temoin_cle_empreintes text NULL;
