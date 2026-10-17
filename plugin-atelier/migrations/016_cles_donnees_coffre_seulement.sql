-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Faille E1 : la cle de demonstration des donnees personnelles etait DETERMINISTE (sha256 dune chaine fixe et
-- de lidentifiant de lentreprise), donc calculable par quiconque connait cet identifiant. Le serveur ne lit
-- desormais les cles que dans le coffre de secrets et refuse sans elles. Cette migration :
-- 1. fait passer en reel tout reglage reste en demonstration et interdit desormais ce choix ;
-- 2. ne supprime AUCUNE donnee : ce qui a pu etre chiffre ou empreint avec lancienne cle devinable est
--    seulement marque cle_a_reimporter = true (colonne nouvelle, aucune colonne ou statut existant ne convient).
--
-- Perimetre du marquage (sur-ensemble sur, jamais un sous-ensemble) :
-- - prospects, clients et bases_clients_imports en mode demonstration : seules ces lignes ont pu recevoir la
--   cle de demonstration (en mode reel, le serveur refusait deja sans cle du coffre). Une ligne de demonstration
--   chiffree avec les cles du coffre est aussi marquee : elle reste lisible, le marquage est alors sans effet.
-- - oppositions : la table na pas de colonne mode. Sont marquees toutes les oppositions des entreprises dont le
--   journal porte au moins un evenement avec donnees.cles = demonstration (empreinte HMAC peut-etre calculee avec
--   lancienne cle, donc ne correspondant plus a la meme personne avec la cle du coffre).
-- Le marqueur demonstration des colonnes mode (origine dune donnee simulee) est conserve tel quel : cest une garde.

UPDATE plugin_atelier_f0322cc62c.reglages_entreprise SET mode_par_defaut = 'reel', modifie_le = now()
  WHERE mode_par_defaut <> 'reel';

ALTER TABLE plugin_atelier_f0322cc62c.reglages_entreprise
  DROP CONSTRAINT IF EXISTS reglages_entreprise_mode_par_defaut_check;

ALTER TABLE plugin_atelier_f0322cc62c.reglages_entreprise
  ADD CONSTRAINT reglages_entreprise_mode_par_defaut_check CHECK (mode_par_defaut = 'reel');

ALTER TABLE plugin_atelier_f0322cc62c.prospects
  ADD COLUMN IF NOT EXISTS cle_a_reimporter boolean NOT NULL DEFAULT false;

ALTER TABLE plugin_atelier_f0322cc62c.clients
  ADD COLUMN IF NOT EXISTS cle_a_reimporter boolean NOT NULL DEFAULT false;

ALTER TABLE plugin_atelier_f0322cc62c.bases_clients_imports
  ADD COLUMN IF NOT EXISTS cle_a_reimporter boolean NOT NULL DEFAULT false;

ALTER TABLE plugin_atelier_f0322cc62c.oppositions
  ADD COLUMN IF NOT EXISTS cle_a_reimporter boolean NOT NULL DEFAULT false;

UPDATE plugin_atelier_f0322cc62c.prospects SET cle_a_reimporter = true
  WHERE mode = 'demonstration' AND cle_a_reimporter = false;

UPDATE plugin_atelier_f0322cc62c.clients SET cle_a_reimporter = true
  WHERE mode = 'demonstration' AND cle_a_reimporter = false;

UPDATE plugin_atelier_f0322cc62c.bases_clients_imports SET cle_a_reimporter = true
  WHERE mode = 'demonstration' AND cle_a_reimporter = false;

UPDATE plugin_atelier_f0322cc62c.oppositions AS o SET cle_a_reimporter = true
  WHERE o.cle_a_reimporter = false
    AND EXISTS (
      SELECT 1 FROM plugin_atelier_f0322cc62c.journal AS j
      WHERE j.company_id = o.company_id AND j.donnees ->> 'cles' = 'demonstration'
    );

CREATE INDEX IF NOT EXISTS prospects_cle_a_reimporter_idx ON plugin_atelier_f0322cc62c.prospects (company_id) WHERE cle_a_reimporter;
CREATE INDEX IF NOT EXISTS clients_cle_a_reimporter_idx ON plugin_atelier_f0322cc62c.clients (company_id) WHERE cle_a_reimporter;
CREATE INDEX IF NOT EXISTS oppositions_cle_a_reimporter_idx ON plugin_atelier_f0322cc62c.oppositions (company_id) WHERE cle_a_reimporter;
