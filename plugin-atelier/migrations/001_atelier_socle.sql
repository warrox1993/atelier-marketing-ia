-- Atelier Marketing IA : schéma de l’espace de base du plugin (v1, T0).
-- Les commentaires n’utilisent pas l’apostrophe droite : le validateur de
-- l’hôte retire les chaînes entre apostrophes AVANT les commentaires.
--
-- Nom du schéma dérivé par l’hôte Paperclip à partir de la clé du plugin
-- « atelier.marketing-ia » et du slug « atelier » :
--   plugin_atelier_ + 10 premiers caractères hexadécimaux du SHA-256 de la clé
--   = plugin_atelier_f0322cc62c (vérifié par tests/contrats.spec.ts).
-- Règles de l’hôte (server/src/services/plugin-database.ts) : DDL seulement,
-- noms entièrement qualifiés, références en lecture aux seules tables
-- publiques déclarées dans `database.coreReadTables`.
--
-- Principe : chaque ligne porte company_id et l’identifiant natif lié
-- (issue_id, project_id, revision_id, run_id). Aucune table ne copie le statut
-- d’une tâche native : les statuts fonctionnels sont calculés à la lecture.

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.reglages_entreprise (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  max_runs_actifs integer NOT NULL DEFAULT 3 CHECK (max_runs_actifs BETWEEN 1 AND 20),
  max_cycles_correction integer NOT NULL DEFAULT 3 CHECK (max_cycles_correction BETWEEN 1 AND 10),
  mode_par_defaut text NOT NULL DEFAULT 'demonstration' CHECK (mode_par_defaut IN ('demonstration', 'reel')),
  retention_jours integer NOT NULL DEFAULT 365 CHECK (retention_jours BETWEEN 1 AND 3650),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.campagnes (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  brief_issue_id uuid REFERENCES public.issues(id) ON DELETE SET NULL,
  nom text NOT NULL,
  objectifs jsonb NOT NULL DEFAULT '[]'::jsonb,
  cible text,
  offre text,
  canaux jsonb NOT NULL DEFAULT '[]'::jsonb,
  etablissements jsonb NOT NULL DEFAULT '[]'::jsonb,
  zones jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget_max_cents integer CHECK (budget_max_cents IS NULL OR budget_max_cents >= 0),
  mode text NOT NULL CHECK (mode IN ('demonstration', 'reel')),
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS campagnes_projet_uidx ON plugin_atelier_f0322cc62c.campagnes (project_id);
CREATE INDEX IF NOT EXISTS campagnes_entreprise_idx ON plugin_atelier_f0322cc62c.campagnes (company_id, cree_le);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.briefs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campagne_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.campagnes(id) ON DELETE CASCADE,
  issue_id uuid REFERENCES public.issues(id) ON DELETE SET NULL,
  texte_original text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS briefs_version_uidx ON plugin_atelier_f0322cc62c.briefs (campagne_id, version);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.exigences (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campagne_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.campagnes(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^REQ-[0-9]{3,}$'),
  texte_original text NOT NULL,
  interpretation text NOT NULL,
  obligatoire boolean NOT NULL,
  criteres jsonb NOT NULL DEFAULT '[]'::jsonb,
  dependances jsonb NOT NULL DEFAULT '[]'::jsonb,
  elements_attendus jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusion_etat text NOT NULL DEFAULT 'aucune' CHECK (exclusion_etat IN ('aucune', 'demandee', 'autorisee', 'refusee')),
  exclusion_justification text,
  exclusion_demandee_par text,
  exclusion_decidee_par text,
  exclusion_decidee_le timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS exigences_code_uidx ON plugin_atelier_f0322cc62c.exigences (campagne_id, code);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.portes (
  issue_id uuid PRIMARY KEY REFERENCES public.issues(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campagne_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.campagnes(id) ON DELETE CASCADE,
  cle_livrable text NOT NULL DEFAULT 'livrable',
  exigences_ciblees jsonb NOT NULL,
  revues_requises jsonb NOT NULL,
  max_cycles integer NOT NULL DEFAULT 3 CHECK (max_cycles BETWEEN 1 AND 10),
  cycles_consommes integer NOT NULL DEFAULT 0 CHECK (cycles_consommes >= 0),
  actif boolean NOT NULL DEFAULT true,
  levee_par text,
  motif_levee text,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portes_campagne_idx ON plugin_atelier_f0322cc62c.portes (company_id, campagne_id);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.couvertures (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL,
  code text NOT NULL,
  etat text NOT NULL CHECK (etat IN ('non_traite', 'partiel', 'couvert', 'bloque', 'na_justifie')),
  preuves jsonb NOT NULL DEFAULT '[]'::jsonb,
  hypotheses jsonb NOT NULL DEFAULT '[]'::jsonb,
  question text,
  declaree_par text NOT NULL,
  run_id uuid,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS couvertures_tache_idx ON plugin_atelier_f0322cc62c.couvertures (issue_id, revision_id, code, cree_le);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.verdicts (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('exigences', 'metier', 'technique')),
  relecteur_type text NOT NULL CHECK (relecteur_type IN ('agent', 'humain')),
  relecteur_id text NOT NULL,
  run_id uuid,
  verdict text NOT NULL CHECK (verdict IN ('PASS', 'CHANGES_REQUESTED', 'BLOCKED_INFORMATION', 'NOT_APPLICABLE_JUSTIFIED')),
  exigences_examinees jsonb NOT NULL DEFAULT '[]'::jsonb,
  preuves_verifiees jsonb NOT NULL DEFAULT '[]'::jsonb,
  constats_resolus jsonb NOT NULL DEFAULT '[]'::jsonb,
  limites jsonb NOT NULL DEFAULT '[]'::jsonb,
  controles_non_executes jsonb NOT NULL DEFAULT '[]'::jsonb,
  justification text,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verdicts_tache_idx ON plugin_atelier_f0322cc62c.verdicts (issue_id, role, cree_le);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.constats (
  finding_id text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  verdict_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.verdicts(id) ON DELETE CASCADE,
  role text NOT NULL,
  relecteur_type text NOT NULL,
  relecteur_id text NOT NULL,
  revision_id uuid NOT NULL,
  requirement_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  categorie text NOT NULL,
  gravite text NOT NULL CHECK (gravite IN ('critique', 'majeure', 'mineure', 'info')),
  emplacement text NOT NULL,
  description text NOT NULL,
  preuve text NOT NULL,
  correction_attendue text NOT NULL,
  statut_resolution text NOT NULL DEFAULT 'ouvert' CHECK (statut_resolution IN ('ouvert', 'resolu', 'rejete', 'accepte_par_humain')),
  resolu_dans_revision uuid,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS constats_tache_idx ON plugin_atelier_f0322cc62c.constats (issue_id, statut_resolution);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.evaluations_porte (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  revision_id uuid,
  decision text NOT NULL CHECK (decision IN ('PASS', 'REFUS', 'BLOQUE_INFORMATION')),
  motifs jsonb NOT NULL DEFAULT '[]'::jsonb,
  empreinte text NOT NULL,
  entrees_jusqu_a timestamptz NOT NULL,
  perimee boolean NOT NULL DEFAULT false,
  cycles_epuises boolean NOT NULL DEFAULT false,
  evaluee_par text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS evaluations_tache_idx ON plugin_atelier_f0322cc62c.evaluations_porte (issue_id, cree_le);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.messages (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid,
  campagne_id uuid,
  run_id uuid,
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  expediteur_type text NOT NULL CHECK (expediteur_type IN ('agent', 'humain', 'systeme')),
  expediteur_id text NOT NULL,
  destinataire_type text NOT NULL CHECK (destinataire_type IN ('agent', 'humain')),
  destinataire_id text NOT NULL,
  type text NOT NULL,
  contenu jsonb NOT NULL,
  references_artefacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  commentaire_natif_id uuid,
  etat_traitement text NOT NULL DEFAULT 'recu' CHECK (etat_traitement IN ('recu', 'lu', 'traite', 'rejete')),
  provenance text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_boite_idx ON plugin_atelier_f0322cc62c.messages (company_id, destinataire_type, destinataire_id, etat_traitement);
CREATE INDEX IF NOT EXISTS messages_tache_idx ON plugin_atelier_f0322cc62c.messages (issue_id, cree_le);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.sources (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campagne_id uuid REFERENCES plugin_atelier_f0322cc62c.campagnes(id) ON DELETE SET NULL,
  issue_id uuid REFERENCES public.issues(id) ON DELETE SET NULL,
  revision_id uuid,
  url text NOT NULL,
  url_finale text,
  titre text,
  date_collecte timestamptz NOT NULL DEFAULT now(),
  statut_acces text NOT NULL,
  code_http integer,
  type_contenu text,
  extrait text,
  empreinte text,
  indices_erreur jsonb NOT NULL DEFAULT '[]'::jsonb,
  injections_signalees jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('demonstration', 'reel'))
);
CREATE INDEX IF NOT EXISTS sources_entreprise_idx ON plugin_atelier_f0322cc62c.sources (company_id, campagne_id, date_collecte);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.imports (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campagne_id uuid REFERENCES plugin_atelier_f0322cc62c.campagnes(id) ON DELETE SET NULL,
  nom_fichier text NOT NULL,
  type text NOT NULL CHECK (type IN ('texte', 'markdown', 'csv')),
  taille_octets integer NOT NULL CHECK (taille_octets >= 0),
  empreinte text NOT NULL,
  lignes integer,
  colonnes jsonb,
  contenu text NOT NULL,
  apercu text NOT NULL,
  injections_signalees jsonb NOT NULL DEFAULT '[]'::jsonb,
  cree_par text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS imports_entreprise_idx ON plugin_atelier_f0322cc62c.imports (company_id, cree_le);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.decisions_humaines (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('approuver', 'demander_correction', 'rejeter')),
  commentaire text NOT NULL,
  user_id text NOT NULL,
  portee jsonb,
  invalidee boolean NOT NULL DEFAULT false,
  mode text NOT NULL CHECK (mode IN ('demonstration', 'reel')),
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decisions_tache_idx ON plugin_atelier_f0322cc62c.decisions_humaines (issue_id, cree_le);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.diffusions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL,
  decision_id uuid REFERENCES plugin_atelier_f0322cc62c.decisions_humaines(id) ON DELETE SET NULL,
  action text NOT NULL,
  canal text NOT NULL,
  compte text,
  audience text,
  montant_cents integer,
  etat text NOT NULL CHECK (etat IN ('refusee', 'simulee', 'preparee', 'confirmee', 'ambigue_a_reconcilier')),
  cle_idempotence text NOT NULL,
  motif_refus text,
  mode text NOT NULL CHECK (mode IN ('demonstration', 'reel')),
  demandee_par text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS diffusions_idempotence_uidx ON plugin_atelier_f0322cc62c.diffusions (company_id, cle_idempotence);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.journal (
  seq bigserial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type text NOT NULL,
  entite text NOT NULL,
  entite_id text NOT NULL,
  issue_id uuid,
  run_id uuid,
  acteur text,
  donnees jsonb NOT NULL DEFAULT '{}'::jsonb,
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_entreprise_idx ON plugin_atelier_f0322cc62c.journal (company_id, seq);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.marques (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  identite text NOT NULL,
  ton text NOT NULL,
  offres jsonb NOT NULL DEFAULT '[]'::jsonb,
  zones jsonb NOT NULL DEFAULT '[]'::jsonb,
  etablissements jsonb NOT NULL DEFAULT '[]'::jsonb,
  affirmations_autorisees jsonb NOT NULL DEFAULT '[]'::jsonb,
  informations_manquantes jsonb NOT NULL DEFAULT '[]'::jsonb,
  cree_par text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marques_version_uidx ON plugin_atelier_f0322cc62c.marques (company_id, version);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.planifications (
  issue_id uuid PRIMARY KEY REFERENCES public.issues(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  canal text NOT NULL,
  date_proposee timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.mesures (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campagne_id uuid REFERENCES plugin_atelier_f0322cc62c.campagnes(id) ON DELETE SET NULL,
  indicateur text NOT NULL,
  valeur numeric NOT NULL,
  unite text NOT NULL,
  periode_debut timestamptz NOT NULL,
  periode_fin timestamptz NOT NULL,
  provenance text NOT NULL,
  import_id uuid REFERENCES plugin_atelier_f0322cc62c.imports(id) ON DELETE SET NULL,
  importe_le timestamptz NOT NULL DEFAULT now()
);
