-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaînes entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Contrats v1.7, lot P1 : prospection sortante et base de clients (docs/prospection-conception.md).
-- Schémas Zod correspondants : src/contrats/prospection.ts.
--
-- Règles de conception :
-- - chaque ligne porte company_id (cascade à la suppression de l entreprise) ;
-- - aucun identifiant direct de personne en clair : nom, courriel, téléphone et adresse sont des
--   valeurs chiffrées « chv1. » (AES-256-GCM, clé hors base) ; le dédoublonnage et les oppositions
--   passent par des empreintes HMAC-SHA-256 (64 hexadécimaux) ;
-- - le fichier de base clients importé n est jamais conservé (empreinte et comptes seulement) ;
-- - une opposition survit à la purge de la base clients (aucune clé étrangère vers les clients) ;
-- - mode toujours déduit par le serveur (demonstration ou reel) ;
-- - offres, entités, segments, établissements et cibles sont des PARAMÈTRES du client (référentiel =
--   marque étendue, src/contrats/referentiel.ts) : les tables ci-dessous ne gardent que leurs codes.

-- Référentiel du client : la marque versionnée gagne ses listes nouvelles (les offres et les
-- établissements existants portent les champs ajoutés dans leur JSON).
ALTER TABLE plugin_atelier_f0322cc62c.marques
  ADD COLUMN IF NOT EXISTS entites jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cibles_prospection jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS modules_conformite jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Une campagne peut viser une entité, des offres, des segments et des établissements du référentiel.
ALTER TABLE plugin_atelier_f0322cc62c.campagnes
  ADD COLUMN IF NOT EXISTS referentiel jsonb;

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.prospects (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campagne_id uuid REFERENCES plugin_atelier_f0322cc62c.campagnes(id) ON DELETE SET NULL,
  cible text NOT NULL CHECK (cible IN ('entreprise', 'particulier', 'partenaire')),
  identifiant_type text NOT NULL CHECK (identifiant_type IN ('numero_bce', 'identifiant_reglementaire', 'empreinte')),
  forme text NOT NULL CHECK (forme IN ('personne_morale', 'personne_physique', 'inconnue')),
  referentiel jsonb NOT NULL,
  identifiant_valeur text NOT NULL,
  numero_bce text CHECK (numero_bce IS NULL OR numero_bce ~ '^[01][0-9]{3}[.][0-9]{3}[.][0-9]{3}$'),
  denomination text,
  nom_chiffre text CHECK (nom_chiffre IS NULL OR nom_chiffre ~ '^chv1[.]'),
  nace jsonb NOT NULL DEFAULT '[]'::jsonb,
  zone jsonb NOT NULL DEFAULT '{}'::jsonb,
  coordonnees jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL CHECK (jsonb_typeof(sources) = 'array' AND jsonb_array_length(sources) > 0),
  mode text NOT NULL CHECK (mode IN ('demonstration', 'reel')),
  statut text NOT NULL DEFAULT 'nouveau' CHECK (statut IN ('nouveau', 'exclu', 'qualifie', 'exporte', 'refuse')),
  motifs_exclusion jsonb NOT NULL DEFAULT '[]'::jsonb,
  particulier jsonb,
  origine_particulier text CHECK (origine_particulier IS NULL OR origine_particulier IN (
    'formulaire_entrant', 'publicite_ciblee', 'simulateur_devis', 'devis_abandonne', 'prise_rendez_vous',
    'point_de_vente', 'client_existant', 'partenaire_consentement', 'parrainage', 'evenement',
    'lead_achete_consentement', 'courrier_adresse'
  )),
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospects_volet_particulier CHECK ((cible = 'particulier') = (particulier IS NOT NULL AND origine_particulier IS NOT NULL)),
  CONSTRAINT prospects_exclusion_coherente CHECK ((statut = 'exclu') = (jsonb_array_length(motifs_exclusion) > 0)),
  CONSTRAINT prospects_particulier_sans_bce CHECK (cible <> 'particulier' OR (numero_bce IS NULL AND denomination IS NULL AND forme = 'personne_physique')),
  CONSTRAINT prospects_identifiant_bce CHECK (identifiant_type <> 'numero_bce' OR identifiant_valeur = numero_bce)
);
CREATE UNIQUE INDEX IF NOT EXISTS prospects_identifiant_uidx ON plugin_atelier_f0322cc62c.prospects (company_id, identifiant_type, identifiant_valeur);
CREATE INDEX IF NOT EXISTS prospects_liste_idx ON plugin_atelier_f0322cc62c.prospects (company_id, statut, campagne_id);
CREATE INDEX IF NOT EXISTS prospects_bce_idx ON plugin_atelier_f0322cc62c.prospects (company_id, numero_bce);
CREATE INDEX IF NOT EXISTS prospects_nace_idx ON plugin_atelier_f0322cc62c.prospects USING gin (nace);
CREATE INDEX IF NOT EXISTS prospects_referentiel_idx ON plugin_atelier_f0322cc62c.prospects USING gin (referentiel);

-- Empreintes HMAC des prospects (dédoublonnage, exclusion des clients, oppositions).
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.prospects_empreintes (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.prospects(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('courriel', 'telephone', 'nom_code_postal', 'numero_bce', 'identifiant_client')),
  empreinte text NOT NULL CHECK (empreinte ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (prospect_id, type, empreinte)
);
CREATE INDEX IF NOT EXISTS prospects_empreintes_recherche_idx ON plugin_atelier_f0322cc62c.prospects_empreintes (company_id, type, empreinte);

-- Poids du score choisis par le client, versionnés (jamais modifiés en place).
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.poids_score (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  poids jsonb NOT NULL,
  decide_par text NOT NULL,
  decide_le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, version)
);

-- Étalonnages (Platt ou isotonique) sur les issues réelles. Les seuils d affichage (300 prospects,
-- 30 conversions) sont vérifiés par le schéma Zod : ils restent réglables sans migration.
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.etalonnages (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  segment jsonb NOT NULL,
  methode text NOT NULL CHECK (methode IN ('platt', 'isotonique')),
  parametres jsonb,
  separation text NOT NULL CHECK (separation IN ('validation_croisee', 'decoupage_temporel')),
  horizon_jours integer NOT NULL CHECK (horizon_jours BETWEEN 7 AND 730),
  effectif integer NOT NULL CHECK (effectif >= 0),
  conversions integer NOT NULL CHECK (conversions >= 0),
  brier numeric NOT NULL CHECK (brier >= 0 AND brier <= 1),
  tranches jsonb NOT NULL DEFAULT '[]'::jsonb,
  statut text NOT NULL CHECK (statut IN ('estimation', 'probabilite_mesuree')),
  version_poids integer NOT NULL CHECK (version_poids > 0),
  donnees jsonb NOT NULL,
  mode text NOT NULL CHECK (mode IN ('demonstration', 'reel')),
  calcule_par text NOT NULL,
  calcule_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT etalonnages_conversions_effectif CHECK (conversions <= effectif),
  CONSTRAINT etalonnages_parametres_platt CHECK ((methode = 'platt') = (parametres IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS etalonnages_entreprise_idx ON plugin_atelier_f0322cc62c.etalonnages (company_id, calcule_le);

-- Scores expliqués (historique : le dernier calcul fait foi).
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.prospects_scores (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.prospects(id) ON DELETE CASCADE,
  valeur integer NOT NULL CHECK (valeur BETWEEN 0 AND 100),
  criteres jsonb NOT NULL CHECK (jsonb_typeof(criteres) = 'array' AND jsonb_array_length(criteres) > 0),
  version_poids integer NOT NULL CHECK (version_poids > 0),
  nature text NOT NULL CHECK (nature IN ('estimation', 'probabilite_mesuree')),
  etalonnage_id uuid REFERENCES plugin_atelier_f0322cc62c.etalonnages(id) ON DELETE SET NULL,
  probabilite numeric CHECK (probabilite IS NULL OR (probabilite >= 0 AND probabilite <= 1)),
  borne_basse numeric,
  borne_haute numeric,
  calcule_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospects_scores_nature CHECK (
    (nature = 'estimation' AND probabilite IS NULL AND borne_basse IS NULL AND borne_haute IS NULL)
    OR (nature = 'probabilite_mesuree' AND probabilite IS NOT NULL AND borne_basse <= probabilite AND probabilite <= borne_haute)
  )
);
CREATE INDEX IF NOT EXISTS prospects_scores_prospect_idx ON plugin_atelier_f0322cc62c.prospects_scores (company_id, prospect_id, calcule_le);

-- Base légale par prospect ET par canal (arrêté royal du 4 avril 2003, RGPD art. 6, 14 et 21).
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.bases_legales (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.prospects(id) ON DELETE CASCADE,
  cible text NOT NULL CHECK (cible IN ('entreprise', 'particulier', 'partenaire')),
  forme text NOT NULL CHECK (forme IN ('personne_morale', 'personne_physique', 'inconnue')),
  canal text NOT NULL CHECK (canal IN ('courriel', 'sms', 'telephone', 'courrier')),
  base text NOT NULL CHECK (base IN ('consentement', 'interet_legitime', 'client_existant_produits_analogues', 'personne_morale_adresse_impersonnelle')),
  nature_adresse text NOT NULL CHECK (nature_adresse IN ('impersonnelle', 'nominative', 'inconnue')),
  preuve jsonb NOT NULL,
  information jsonb NOT NULL,
  dncm_verifie_le timestamptz,
  verifie_par text NOT NULL,
  verifie_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bases_legales_particulier_electronique CHECK (
    cible <> 'particulier' OR canal NOT IN ('courriel', 'sms') OR base IN ('consentement', 'client_existant_produits_analogues')
  ),
  CONSTRAINT bases_legales_particulier_impersonnelle CHECK (cible <> 'particulier' OR base <> 'personne_morale_adresse_impersonnelle'),
  CONSTRAINT bases_legales_personne_morale CHECK (base <> 'personne_morale_adresse_impersonnelle' OR forme = 'personne_morale'),
  CONSTRAINT bases_legales_electronique CHECK (canal NOT IN ('courriel', 'sms') OR base <> 'interet_legitime'),
  CONSTRAINT bases_legales_impersonnelle CHECK (
    base <> 'personne_morale_adresse_impersonnelle' OR (canal IN ('courriel', 'sms') AND nature_adresse = 'impersonnelle')
  ),
  CONSTRAINT bases_legales_client_existant CHECK (base <> 'client_existant_produits_analogues' OR canal IN ('courriel', 'sms')),
  CONSTRAINT bases_legales_nominative CHECK (NOT (canal IN ('courriel', 'sms') AND nature_adresse = 'nominative' AND base <> 'consentement')),
  CONSTRAINT bases_legales_dncm CHECK (canal <> 'telephone' OR dncm_verifie_le IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS bases_legales_canal_uidx ON plugin_atelier_f0322cc62c.bases_legales (prospect_id, canal);
CREATE INDEX IF NOT EXISTS bases_legales_entreprise_idx ON plugin_atelier_f0322cc62c.bases_legales (company_id, prospect_id);

-- Oppositions (art. 21.3) : empreinte seule, gardée après toute purge.
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.oppositions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('courriel', 'telephone', 'nom_code_postal', 'numero_bce', 'identifiant_client')),
  empreinte text NOT NULL CHECK (empreinte ~ '^[0-9a-f]{64}$'),
  canal text NOT NULL CHECK (canal IN ('courriel', 'sms', 'telephone', 'courrier', 'tous')),
  origine text NOT NULL CHECK (origine IN ('desinscription_message', 'demande_ecrite', 'telephone', 'formulaire', 'import', 'humain')),
  enregistree_par text NOT NULL,
  recueillie_le timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS oppositions_uidx ON plugin_atelier_f0322cc62c.oppositions (company_id, type, empreinte, canal);

-- Liste « Ne m appelez plus » (licence du client) : versions chargées et numéros en empreintes HMAC.
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.listes_dncm (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version_du date NOT NULL,
  numeros integer NOT NULL CHECK (numeros >= 0),
  empreinte_fichier text NOT NULL CHECK (empreinte_fichier ~ '^[0-9a-f]{64}$'),
  chargee_par text NOT NULL,
  chargee_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listes_dncm_entreprise_idx ON plugin_atelier_f0322cc62c.listes_dncm (company_id, chargee_le);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.dncm_empreintes (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  liste_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.listes_dncm(id) ON DELETE CASCADE,
  empreinte text NOT NULL CHECK (empreinte ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (liste_id, empreinte)
);
CREATE INDEX IF NOT EXISTS dncm_empreintes_recherche_idx ON plugin_atelier_f0322cc62c.dncm_empreintes (company_id, empreinte);

-- Imports de base clients : compte rendu seulement, jamais le contenu du fichier.
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.bases_clients_imports (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nom_fichier text NOT NULL,
  format text NOT NULL CHECK (format IN ('csv', 'xlsx')),
  empreinte_fichier text NOT NULL CHECK (empreinte_fichier ~ '^[0-9a-f]{64}$'),
  lignes_lues integer NOT NULL CHECK (lignes_lues >= 0),
  lignes_retenues integer NOT NULL CHECK (lignes_retenues >= 0),
  lignes_rejetees integer NOT NULL CHECK (lignes_rejetees >= 0),
  rejets jsonb NOT NULL DEFAULT '[]'::jsonb,
  correspondance jsonb NOT NULL,
  colonnes_sensibles_refusees jsonb NOT NULL DEFAULT '[]'::jsonb,
  finalite text NOT NULL,
  duree_conservation_mois integer NOT NULL CHECK (duree_conservation_mois BETWEEN 1 AND 120),
  purge_le timestamptz NOT NULL,
  mode text NOT NULL CHECK (mode IN ('demonstration', 'reel')),
  importe_par text NOT NULL,
  importe_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bases_clients_imports_comptes CHECK (lignes_retenues + lignes_rejetees = lignes_lues)
);
CREATE INDEX IF NOT EXISTS bases_clients_imports_entreprise_idx ON plugin_atelier_f0322cc62c.bases_clients_imports (company_id, importe_le);
CREATE INDEX IF NOT EXISTS bases_clients_imports_purge_idx ON plugin_atelier_f0322cc62c.bases_clients_imports (purge_le);

-- Clients : identifiants directs chiffrés. La contrainte refuse toute valeur de donnees_chiffrees qui
-- ne commence pas par « chv1. » (aucune donnée en clair, même par erreur de code).
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.clients (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  import_id uuid REFERENCES plugin_atelier_f0322cc62c.bases_clients_imports(id) ON DELETE CASCADE,
  type_client text NOT NULL CHECK (type_client IN ('particulier', 'entreprise')),
  pseudonyme text NOT NULL CHECK (pseudonyme ~ '^\[client-[0-9a-f]{4,16}\]$'),
  contrats jsonb NOT NULL DEFAULT '[]'::jsonb,
  etablissement text,
  entites jsonb NOT NULL DEFAULT '[]'::jsonb,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  donnees_chiffrees jsonb NOT NULL DEFAULT '{}'::jsonb,
  entreprise text,
  numero_bce text CHECK (numero_bce IS NULL OR numero_bce ~ '^[01][0-9]{3}[.][0-9]{3}[.][0-9]{3}$'),
  code_postal text CHECK (code_postal IS NULL OR code_postal ~ '^[0-9]{4}$'),
  commune text,
  produits_detenus jsonb NOT NULL DEFAULT '[]'::jsonb,
  debut_contrat date,
  statut text NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'ancien')),
  consentements jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode text NOT NULL CHECK (mode IN ('demonstration', 'reel')),
  cree_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clients_particulier_sans_bce CHECK (type_client = 'entreprise' OR (numero_bce IS NULL AND entreprise IS NULL)),
  CONSTRAINT clients_donnees_chiffrees CHECK (
    jsonb_typeof(donnees_chiffrees) = 'object'
    AND NOT jsonb_path_exists(donnees_chiffrees, 'strict $.* ? (@.type() != "string" || !(@ like_regex "^chv1[.]"))')
  )
);
CREATE INDEX IF NOT EXISTS clients_entreprise_idx ON plugin_atelier_f0322cc62c.clients (company_id, type_client, statut);
CREATE UNIQUE INDEX IF NOT EXISTS clients_pseudonyme_uidx ON plugin_atelier_f0322cc62c.clients (company_id, pseudonyme);

-- Règles de vente croisée fournies par le client (codes d offres : qui détient X peut se voir proposer Y).
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.regles_ventes_croisees (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type_client text NOT NULL CHECK (type_client IN ('particulier', 'entreprise')),
  detenue text NOT NULL,
  proposee text NOT NULL,
  decide_par text NOT NULL,
  decide_le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, type_client, detenue, proposee),
  CONSTRAINT regles_ventes_croisees_distinctes CHECK (detenue <> proposee)
);
CREATE INDEX IF NOT EXISTS clients_bce_idx ON plugin_atelier_f0322cc62c.clients (company_id, numero_bce);

CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.clients_empreintes (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES plugin_atelier_f0322cc62c.clients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('courriel', 'telephone', 'nom_code_postal', 'numero_bce', 'identifiant_client')),
  empreinte text NOT NULL CHECK (empreinte ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (client_id, type, empreinte)
);
CREATE INDEX IF NOT EXISTS clients_empreintes_recherche_idx ON plugin_atelier_f0322cc62c.clients_empreintes (company_id, type, empreinte);

-- Issues commerciales (gagné ou perdu) : seule base des taux de conversion et de l étalonnage.
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.issues_commerciales (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prospect_id uuid REFERENCES plugin_atelier_f0322cc62c.prospects(id) ON DELETE CASCADE,
  client_id uuid REFERENCES plugin_atelier_f0322cc62c.clients(id) ON DELETE CASCADE,
  issue text NOT NULL CHECK (issue IN ('gagne', 'perdu')),
  date_issue date NOT NULL,
  origine text NOT NULL CHECK (origine IN ('crm', 'usine', 'import')),
  mode text NOT NULL CHECK (mode IN ('demonstration', 'reel')),
  importee_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issues_commerciales_cible CHECK (prospect_id IS NOT NULL OR client_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS issues_commerciales_entreprise_idx ON plugin_atelier_f0322cc62c.issues_commerciales (company_id, date_issue);

-- Exports vers le CRM du client : toujours portés par une diffusion réelle sous preuve d approbation.
CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c.exports_crm (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  diffusion_id uuid REFERENCES plugin_atelier_f0322cc62c.diffusions(id) ON DELETE SET NULL,
  entite text NOT NULL,
  referentiel_version integer NOT NULL CHECK (referentiel_version > 0),
  service text NOT NULL CHECK (service IN ('crm', 'pipedrive', 'odoo', 'teamleader')),
  canal text NOT NULL CHECK (canal IN ('courriel', 'sms', 'telephone', 'courrier')),
  prospect_ids jsonb NOT NULL CHECK (jsonb_typeof(prospect_ids) = 'array' AND jsonb_array_length(prospect_ids) BETWEEN 1 AND 200),
  verifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  etat text NOT NULL CHECK (etat IN ('refusee', 'simulee', 'preparee', 'confirmee', 'ambigue_a_reconcilier')),
  motif_refus text,
  cle_idempotence text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('demonstration', 'reel')),
  demande_par text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exports_crm_diffusion CHECK (etat NOT IN ('preparee', 'confirmee', 'ambigue_a_reconcilier') OR diffusion_id IS NOT NULL),
  CONSTRAINT exports_crm_refus_motive CHECK (etat <> 'refusee' OR motif_refus IS NOT NULL),
  CONSTRAINT exports_crm_demo_jamais_confirme CHECK (mode = 'reel' OR etat <> 'confirmee')
);
CREATE UNIQUE INDEX IF NOT EXISTS exports_crm_idempotence_uidx ON plugin_atelier_f0322cc62c.exports_crm (company_id, cle_idempotence);
CREATE INDEX IF NOT EXISTS exports_crm_tache_idx ON plugin_atelier_f0322cc62c.exports_crm (company_id, issue_id, cree_le);
