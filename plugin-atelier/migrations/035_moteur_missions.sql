-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Moteur de missions (issue 49, tache 2) : donnees neuves (docs/moteur-missions.md, section Donnees neuves).
-- Migration additive : trois tables nouvelles, aucune donnee existante touchee ; relancer la migration ne change rien.
-- - missions : une mission suit un gabarit et un contrat versionnes ; son etat suit le tableau des transitions du moteur.
-- - etapes : une ligne par etape et par tentative ; une tentative rouvre la meme tache.
-- - executions : intention et resultat de chaque ecriture rejouable ; la cle d idempotence est unique par entreprise.

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.missions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  gabarit_cle text NOT NULL,
  gabarit_version integer NOT NULL,
  contrat_id text NOT NULL,
  contrat_version integer NOT NULL,
  mandat text NOT NULL,
  etat text NOT NULL CHECK (etat IN ('prete', 'en_cours', 'en_revue', 'attente_autorisation', 'en_execution', 'resultat_confirme', 'attente_information', 'blocage', 'pause', 'cloturee', 'annulee', 'echec')),
  etat_avant_pause text CHECK (etat_avant_pause IS NULL OR etat_avant_pause IN ('prete', 'en_cours', 'en_revue', 'attente_autorisation', 'en_execution', 'resultat_confirme', 'attente_information', 'blocage')),
  rang_courant integer NOT NULL DEFAULT 0,
  enveloppe_cents bigint NOT NULL DEFAULT 0,
  campagne_id uuid REFERENCES plugin_atelier_f0322cc62c.campagnes(id) ON DELETE SET NULL,
  issue_racine_id uuid REFERENCES public.issues(id) ON DELETE SET NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS missions_entreprise_etat_idx ON plugin_atelier_f0322cc62c.missions (company_id, etat);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.etapes (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.missions(id) ON DELETE CASCADE,
  rang integer NOT NULL,
  role text NOT NULL,
  tentative integer NOT NULL DEFAULT 1,
  etat text NOT NULL,
  entree jsonb,
  sortie jsonb,
  delai_le timestamptz,
  issue_id uuid REFERENCES public.issues(id) ON DELETE SET NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, rang, tentative)
);
CREATE INDEX IF NOT EXISTS etapes_tache_idx ON plugin_atelier_f0322cc62c.etapes (issue_id, tentative);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.executions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.missions(id) ON DELETE CASCADE,
  rang integer NOT NULL,
  type text NOT NULL CHECK (type IN ('evenement', 'creation_tache', 'reveil', 'effet_externe')),
  cle_idempotence text NOT NULL,
  requete jsonb NOT NULL DEFAULT '{}'::jsonb,
  statut text NOT NULL DEFAULT 'demandee' CHECK (statut IN ('demandee', 'appliquee', 'refusee')),
  statut_externe text,
  identifiant_fournisseur text,
  diffusion_id uuid REFERENCES plugin_atelier_f0322cc62c.diffusions(id) ON DELETE SET NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, cle_idempotence)
);
