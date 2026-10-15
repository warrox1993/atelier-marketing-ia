-- ATTENTION : pas de apostrophe dans les commentaires de ce fichier. Le validateur de migrations de Paperclip
-- retire les chaînes entre apostrophes AVANT les commentaires et avalerait alors le SQL qui suit.
-- Plafonds de dépenses publicitaires choisis par le client (décision de l'opérateur du
-- 15/10/2026) : un montant maximal OU « aucune limite », pour toute entreprise et pour
-- chaque campagne. Un champ de type vide signifie « aucun choix fait » (le serveur
-- refuse alors toute dépense publicitaire). Le choix est tracé : qui, quand.
-- Les coûts IA ne figurent pas ici : ils réutilisent les budgets natifs de
-- Paperclip (entreprise et agent).

ALTER TABLE plugin_atelier_f0322cc62c.reglages_entreprise
  ADD COLUMN IF NOT EXISTS plafond_pub_type text CHECK (plafond_pub_type IS NULL OR plafond_pub_type IN ('montant', 'aucune_limite')),
  ADD COLUMN IF NOT EXISTS plafond_pub_cents bigint CHECK (plafond_pub_cents IS NULL OR plafond_pub_cents > 0),
  ADD COLUMN IF NOT EXISTS plafond_pub_decide_par text,
  ADD COLUMN IF NOT EXISTS plafond_pub_decide_le timestamptz;

ALTER TABLE plugin_atelier_f0322cc62c.campagnes
  ADD COLUMN IF NOT EXISTS plafond_pub_type text CHECK (plafond_pub_type IS NULL OR plafond_pub_type IN ('montant', 'aucune_limite')),
  ADD COLUMN IF NOT EXISTS plafond_pub_decide_par text,
  ADD COLUMN IF NOT EXISTS plafond_pub_decide_le timestamptz;

-- Reprise des données existantes : un budget maximal déjà saisi sur une campagne devient un
-- plafond « montant » (décidé par « migration »). Un budget nul ne signifiait rien de
-- précis : il redevient « aucun choix » (0 serait confondu avec « illimité » côté natif).
UPDATE plugin_atelier_f0322cc62c.campagnes
   SET plafond_pub_type = 'montant', plafond_pub_decide_par = 'migration 003', plafond_pub_decide_le = now()
 WHERE budget_max_cents IS NOT NULL AND budget_max_cents > 0 AND plafond_pub_type IS NULL;
UPDATE plugin_atelier_f0322cc62c.campagnes SET budget_max_cents = NULL WHERE budget_max_cents IS NOT NULL AND budget_max_cents <= 0;

-- Cohérence : montant seulement avec le type « montant » ; type posé seulement avec sa trace.
ALTER TABLE plugin_atelier_f0322cc62c.campagnes
  DROP CONSTRAINT IF EXISTS campagnes_plafond_pub_coherent;
ALTER TABLE plugin_atelier_f0322cc62c.campagnes
  ADD CONSTRAINT campagnes_plafond_pub_coherent CHECK (
    (plafond_pub_type IS NULL AND budget_max_cents IS NULL)
    OR (plafond_pub_type = 'montant' AND budget_max_cents > 0 AND plafond_pub_decide_par IS NOT NULL AND plafond_pub_decide_le IS NOT NULL)
    OR (plafond_pub_type = 'aucune_limite' AND budget_max_cents IS NULL AND plafond_pub_decide_par IS NOT NULL AND plafond_pub_decide_le IS NOT NULL)
  );
ALTER TABLE plugin_atelier_f0322cc62c.reglages_entreprise
  DROP CONSTRAINT IF EXISTS reglages_plafond_pub_coherent;
ALTER TABLE plugin_atelier_f0322cc62c.reglages_entreprise
  ADD CONSTRAINT reglages_plafond_pub_coherent CHECK (
    (plafond_pub_type IS NULL AND plafond_pub_cents IS NULL)
    OR (plafond_pub_type = 'montant' AND plafond_pub_cents > 0 AND plafond_pub_decide_par IS NOT NULL AND plafond_pub_decide_le IS NOT NULL)
    OR (plafond_pub_type = 'aucune_limite' AND plafond_pub_cents IS NULL AND plafond_pub_decide_par IS NOT NULL AND plafond_pub_decide_le IS NOT NULL)
  );
