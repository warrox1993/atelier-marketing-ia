-- ATTENTION : aucune apostrophe droite dans les commentaires de ce fichier (format du validateur de migrations de Paperclip).
--
-- LIV-OB-7 (audit du 29/10/2026) : l import humain de la base commune cree desormais une source candidate, active a sa
-- premiere lecture reussie par une collecte. Les sources importees avant ce changement sont entrees actives sans avoir
-- jamais ete lues : elles repassent candidates (listees, non citables), avec motif et date. Une source deja collectee
-- (un instantane existe) ou rattachee a un projet par un alias garde son etat. Aucune ligne n est supprimee (base
-- cumulative). Relancer la migration ne change rien.
UPDATE plugin_atelier_f0322cc62c.obs_sources s
  SET etat = 'candidate', etat_motif = 'importee sans lecture (LIV-OB-7)', etat_le = now()
  WHERE s.commune AND s.ajoutee_par = 'humain' AND s.etat = 'active'
    AND NOT EXISTS (SELECT 1 FROM plugin_atelier_f0322cc62c.obs_instantanes i WHERE i.source_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM plugin_atelier_f0322cc62c.obs_alias a WHERE a.company_id = s.company_id AND a.valeur = s.url_canonique);
