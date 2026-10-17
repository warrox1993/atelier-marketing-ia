-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier. Le validateur de migrations
-- de Paperclip retire les chaines entre apostrophes AVANT les commentaires et avalerait le SQL qui suit.
--
-- Bureau de liaison, revue independante du 17/10/2026 (constats H2 et M1).
-- chaine : services traverses par la chaine de liaisons, du premier demandeur au service vise inclus, derivee
--   de la tache d origine ET de ses ancetres (une sous-tache d une tache recue herite de la chaine recue).
-- profondeur : nombre de relais de la chaine (1 pour une demande directe). Le plugin refuse au-dela de 2
--   relais et toute demande vers un service deja present dans la chaine.
-- approbation_requise : la liaison a exige une approbation humaine (flux sensible, ou tache d origine teintee).
-- teinte_retour : la reponse recue sur la tache d origine vient d une liaison approuvee ; cette tache et ses
--   descendantes sont teintees et toute nouvelle liaison ouverte depuis elles attend l approbation humaine.
--
-- Donnees existantes (aucune suppression) : chaine reprise des deux services de la liaison, profondeur 1 ;
-- approbation_requise vraie pour toute liaison encore en attente ou refusee, et pour toute liaison dont le flux
-- exige aujourd hui l approbation (sur-ensemble sur) ; teinte_retour vraie pour les reponses de ces liaisons.

ALTER TABLE plugin_atelier_f0322cc62c.liaisons
  ADD COLUMN IF NOT EXISTS chaine jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE plugin_atelier_f0322cc62c.liaisons
  ADD COLUMN IF NOT EXISTS profondeur integer NOT NULL DEFAULT 1 CHECK (profondeur >= 1);
ALTER TABLE plugin_atelier_f0322cc62c.liaisons
  ADD COLUMN IF NOT EXISTS approbation_requise boolean NOT NULL DEFAULT false;
ALTER TABLE plugin_atelier_f0322cc62c.liaisons
  ADD COLUMN IF NOT EXISTS teinte_retour boolean NOT NULL DEFAULT false;

UPDATE plugin_atelier_f0322cc62c.liaisons SET chaine = jsonb_build_array(service_source, service_cible)
  WHERE chaine = '[]'::jsonb;

UPDATE plugin_atelier_f0322cc62c.liaisons AS l SET approbation_requise = true
  WHERE l.approbation_requise = false
    AND (
      l.statut IN ('en_attente_approbation', 'refusee')
      OR EXISTS (
        SELECT 1 FROM plugin_atelier_f0322cc62c.services_entreprises AS s, plugin_atelier_f0322cc62c.flux_services AS f
        WHERE f.client_marqueur = s.client_marqueur AND s.company_id = l.company_id
          AND f.source_slug = l.service_source AND f.cible_slug = l.service_cible
          AND f.approbation_humaine = true
      )
    );

UPDATE plugin_atelier_f0322cc62c.liaisons SET teinte_retour = true
  WHERE statut = 'repondue' AND approbation_requise = true AND teinte_retour = false;

CREATE INDEX IF NOT EXISTS liaisons_origine_idx ON plugin_atelier_f0322cc62c.liaisons (company_id, tache_origine_id);
