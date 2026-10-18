# Licences des méthodes reprises de dépôts tiers

Certaines compétences de `organisation/skills/` reprennent une **méthode** (étapes, grille, seuils de départ, liste de
contrôle, format de sortie) publiée dans un dépôt tiers sous licence libre. La méthode est réécrite en français et
adaptée au droit belge ; aucun texte n'est recopié tel quel, sauf la copie inchangée du texte d'origine de S8,
conservée pour la licence (voir sa ligne ci-dessous). Chaque compétence concernée a une section « Origine de la
méthode » qui renvoie ici. Seules les licences Apache 2.0 et MIT sont admises. Les compétences `docx`, `xlsx`, `pdf`
et `pptx` du dépôt github.com/anthropics/skills sont sous licence propriétaire : rien n'en est repris.

Modifications (Apache 2.0, section 4 b) : toutes les reprises ci-dessous ont été traduites, résumées, réordonnées et
adaptées (droit belge, validation humaine, sources officielles) par l'Atelier Marketing IA, octobre 2026.

## Dépôts

| Id | Dépôt | Commit lu | Licence | Titulaire des droits |
| --- | --- | --- | --- | --- |
| S1 | github.com/anthropics/knowledge-work-plugins | 33eeda1e8fd856455b05479d13a0f85b5f803744 (15/10/2026) | Apache 2.0 | Anthropic (fichier `LICENSE` du dépôt, sans fichier NOTICE) |
| S2 | github.com/coreyhaines31/marketingskills | dda3841f0b294e01e93b1541486beefbfab0915e (02/10/2026, version 2.11.17) | MIT | Copyright (c) 2025 Corey Haines |
| S3 | github.com/alirezarezvani/claude-skills | 19392f7a08264ed00486a251f5b2098321771f94 (26/08/2026) | MIT | Copyright (c) 2025 Alireza Rezvani |
| S4 | github.com/wshobson/agents | 044b4b21f083948e69ec878a7b07c8d0951a6ffa (15/10/2026) | MIT | Copyright (c) 2024 Seth Hobson |
| S5 | github.com/anthropics/skills | b9e19e6f44773509fbdd7001d77ff41a49a486c1 (20/04/2026, dernier commit du dossier `skills/internal-comms`) | Apache 2.0 (fichier `skills/internal-comms/LICENSE.txt`) | Copyright 2026 Anthropic, PBC |
| S6 | github.com/warrox1993/skills-claude-entreprise | 474785fbcba8429cb034ef35fca20bbfcfd68554 (28/09/2026) | MIT | Copyright (c) 2026 Jean-Baptiste Dhondt (même auteur que l'atelier) |
| S7 | github.com/affaan-m/ECC | ef648e01899ba3e8dc6371642deaaf64b4477775 (01/10/2026) | dépôt sous MIT (fichier `LICENSE`) ; les compétences métiers reprises portent `license: Apache-2.0` dans leur en-tête (auteur « evos ») : Apache 2.0 appliquée à ces reprises | Copyright (c) 2026 Affaan Mustafa (dépôt) ; auteur des compétences : evos |
| S8 | github.com/paperclipai/paperclip (socle de l'atelier) | bba6a45f0d364cfd962ac59b3bdf2426a8222adb (12/10/2026, version v2026.1012.0, `socle/VERSION`) | MIT (copie : `socle/patches/LICENSE-Paperclip`) | Copyright (c) 2025 Paperclip AI |

## Reprises par compétence

| Compétence | Dépôt | Chemin dans le dépôt | Ce qui est repris |
| --- | --- | --- | --- |
| `cloture-mensuelle` | S1 | `finance/skills/close-management/SKILL.md` | carte des dépendances en 5 niveaux, chemin critique, tableau d'état |
| `cloture-mensuelle` | S1 | `small-business/skills/month-end-prep/SKILL.md` (étape 4) | règle du doublon suspect (3 critères) |
| `rapprochement-comptes` | S1 | `finance/skills/reconciliation/SKILL.md` | 3 catégories d'écart, tranches d'ancienneté, seuils d'escalade, séparation des tâches |
| `traitement-factures-fournisseurs` | S1 | `small-business/skills/ap-processor/SKILL.md` (étapes 2 à 7) | champs illisibles nommés, rapprochement à trois voies, double approbation, notes de crédit |
| `traitement-factures-fournisseurs` | S1 | `small-business/skills/month-end-prep/SKILL.md` (étape 4) | règle du doublon suspect (3 critères) |
| `analyse-ecarts-budgetaires` | S1 | `finance/skills/variance-analysis/SKILL.md` | seuils de départ, ordre de priorité, décomposition prix et volume, structure de commentaire, anti-modèles |
| `analyse-ecarts-budgetaires` | S6 | `plugins/entreprise-finance/skills/analyse-ecarts-budgetaires/SKILL.md` | note courte à la direction (même auteur) |
| `preparation-tva` | S1 | `small-business/skills/tax-prep/SKILL.md` (« Step 1 », « The gate before Step 2 ») | barrière : pas de calcul fiscal sur des livres non clôturés |
| `impot-des-societes` | S1 | `small-business/skills/tax-prep/SKILL.md` (mêmes passages) | même barrière |
| `agenda-echeances-legales` | S1 | `operations/skills/compliance-tracking/SKILL.md` | échéance reliée à une preuve de dépôt |
| `reponse-demande-renseignements` | S1 | `finance/skills/audit-support/SKILL.md` (« Testing Documentation Standards » seulement) | une pièce par affirmation, index des pièces, préparateur et date |
| `comparaison-offres-fournisseurs` | S1 | `operations/skills/vendor-review/SKILL.md` (« Evaluation Framework ») | coût total avec coût de sortie, grille de risques, points de négociation |
| `evaluation-fournisseurs` | S3 | `business-operations/skills/vendor-management/SKILL.md` (étapes 2 à 4) | note sur 100 en 5 dimensions, verdicts, suivi des engagements de service, 4 axes de risque tiers |
| `analyse-depenses-achats` | S3 | `business-operations/skills/procurement-optimizer/SKILL.md` (étapes 2, 4 et 5) | Pareto, grappes de fonctions en double, pas de fournisseur unique sans plan de secours, grappes de renouvellement |
| `commande-approvisionnement` | S1 | `small-business/skills/restock/SKILL.md` (étape 3) | trace de commande rapprochable de la facture |
| `gestion-incident-informatique` | S1 | `engineering/skills/incident-response/SKILL.md` | mise à jour d'incident à cadence fixe, retour d'expérience structuré, 5 pourquoi |
| `gestion-incident-informatique` | S4 | `plugins/incident-response/skills/postmortem-writing/SKILL.md` | principe sans recherche de coupable, déclencheurs du retour d'expérience |
| `documentation-technique` | S1 | `operations/skills/runbook/SKILL.md` | structure fixe d'une procédure d'exploitation |
| `demande-de-changement` | S1 | `operations/skills/change-request/SKILL.md` | rubriques du dossier de changement |
| `demande-de-changement` | S1 | `engineering/skills/deploy-checklist/SKILL.md` | déclencheurs chiffrés de retour arrière |
| `gestion-arrivees-departs-acces` | S3 | `engineering-team/skills/ms365-tenant-manager/SKILL.md` (« Workflow 3: User Offboarding ») | ordre des étapes d'un départ (scripts non repris) |
| `qualite-donnees` | S3 | `engineering/data-quality-auditor/skills/data-quality-auditor/SKILL.md` | score pondéré sur 100, trois niveaux, déclencheurs de risque |
| `validation-analyse` | S1 | `data/skills/validate-data/SKILL.md` | liste de contrôle avant diffusion, verdict en trois niveaux |
| `analyse-donnees-decision` | S1 | `data/skills/analyze/SKILL.md` (étapes 1 à 5) | déroulé question, données, analyse, validation, présentation |
| `tableau-de-bord-pme` | S4 | `plugins/business-analytics/skills/kpi-dashboard-design/SKILL.md` | niveaux de tableaux (direction, gestion, opérationnel), indicateurs contradictoires |
| `dictionnaire-donnees` | S1 | `data/skills/data-context-extractor/SKILL.md` (« Reference File Standards ») | fiche par table, par indicateur, par entité |
| `grille-entretien-structure` | S6 | `plugins/entreprise-rh/skills/grille-entretien-structure/SKILL.md` | compétence reprise (même auteur) : 4 à 6 compétences, questions, échelle ancrée de 1 à 4, questions à ne pas poser |
| `grille-entretien-structure` | S1 | `human-resources/skills/interview-prep/SKILL.md` | principes : mêmes questions pour tous, grille de notation, panel varié |
| `reponse-politique-interne` | S1 | `human-resources/skills/policy-lookup/SKILL.md` | démarche en cinq temps, format réponse courte, détails, exceptions, contact, source, « rien trouvé » dit clairement |
| `indicateurs-rh-agreges` | S1 | `human-resources/skills/people-report/SKILL.md` | indicateurs de rétention et de productivité, démarche en cinq temps (sans diversité ni risque individuel) |
| `indicateurs-rh-agreges` | S1 | `small-business/shared/absent-is-not-zero.md et small-business/shared/chain-seams.md (section 1)` | donnée absente n'est pas zéro ; un total n'est pas le dénominateur d'un périmètre plus étroit |
| `planification-effectifs` | S1 | `human-resources/skills/org-planning/SKILL.md` | quatre dimensions, repères d'encadrement et de taille d'équipe présentés comme pratiques |
| `entretien-evaluation` | S1 | `human-resources/skills/performance-review/SKILL.md (« Tips »)` | quatre règles de rédaction (sans note globale, rémunération ni calibrage) |
| `accueil-nouveau-collaborateur` | S1 | `human-resources/skills/onboarding/SKILL.md (« Output »)` | jour 1 en tableau, liste de la première semaine, tableau des contacts clés |
| `offre-emploi-non-discriminante` | S6 | `plugins/entreprise-rh/skills/offre-emploi-inclusive/SKILL.md` | plafond des exigences indispensables, mention d'ouverture et aménagement raisonnable, relecture des contraintes réelles |
| `triage-accord-confidentialite` | S1 | `legal/skills/triage-nda/SKILL.md (étapes 3 et 4, « Common NDA Issues »)` | lecture en dix points, classement vert, orange, rouge, positions de départ sur les problèmes fréquents |
| `evaluation-risque-juridique` | S1 | `legal/skills/legal-risk-assessment/SKILL.md` | matrice 5 × 5, seuils 1-4, 5-9, 10-15, 16-25, note en dix rubriques, critères de recours à un avocat externe |
| `reponse-droits-personnes` | S1 | `legal/skills/compliance-check/SKILL.md (« Data Subject Request Handling »)` | réception, identité, journal, exceptions, réponse (sans le droit californien) |
| `reponse-droits-personnes` | S1 | `legal/skills/legal-response/SKILL.md (« Data Subject Request Escalation Triggers »)` | déclencheurs d'escalade d'une demande de personne |
| `revue-sous-traitance-rgpd` | S1 | `legal/skills/compliance-check/SKILL.md (« DPA Review Checklist »)` | liste de contrôle article 28, transferts, problèmes fréquents et positions |
| `revue-sous-traitance-rgpd` | S1 | `legal/skills/vendor-check/SKILL.md (étapes 3 et 4)` | état des accords par fournisseur et analyse des manques |
| `dossier-litige` | S1 | `legal/skills/brief/SKILL.md (mode « Incident Brief »)` | format du dossier d'incident et consignes de rapidité |
| `revue-contrat-commercial` | S1 | `legal/skills/review-contract/SKILL.md (étapes 3, 4, 6 et 7)` | référentiel de positions et repli, lecture complète, modification avec repli, trois priorités |
| `revue-contrat-commercial` | S1 | `small-business/skills/contract-review/SKILL.md (« Approval gates »)` | ne pas signaler le standard équitable, signaler ce qui manque |
| `registre-traitements-rgpd` | S3 | `compliance-os/skills/gdpr-audit-prep/SKILL.md (« The Six DPO Questions »)` | six questions de préparation d'un contrôle |
| `protocole-inter-coordinateurs` | S3 | `c-level-advisor/skills/agent-protocol/SKILL.md` (« Response Format », « Loop Prevention », « When to Invoke vs When to Assume », « Conflict Resolution ») | format de réponse, prévention des boucles, quand demander ou supposer, conflits jamais tranchés en silence |
| `protocole-inter-coordinateurs` | S4 | `plugins/agent-teams/skills/team-communication-protocols/SKILL.md` (« broadcast », à n'employer qu'avec parcimonie) | message direct par défaut, diffusion à tous réservée |
| `qualification-leads-entrants` | S1 | `sales/skills/lead-triage/SKILL.md` (étapes 3 à 5) | adéquation avec preuve et « sans objet », quatre signaux d'intention, priorités P0 à P2 et hors cible, compte déjà suivi |
| `compte-rendu-rendez-vous` | S1 | `sales/skills/call-summary/SKILL.md` (étapes 2 à 5) | extraction avec repères, suivi de moins de 150 mots, destinataires hors transcription, synthèse « nous / eux », mises à jour proposées avec citation |
| `reponse-objection` | S6 | `plugins/entreprise-commercial/skills/reponse-objection-client/SKILL.md` | port de la compétence (même auteur) |
| `reponse-objection` | S1 | `sales/skills/handle-objection/SKILL.md` (étapes 2 à 4) | six types d'objection, objection ou manœuvre de négociation, preuves tirées de l'historique et des verbatims |
| `reponse-appel-offres` | S3 | `commercial/skills/rfp-responder/SKILL.md` (étapes 1, 2 et 5) | classement obligatoire, pondérée, souhaitée ; couverture forte, partielle, écart ; écart jamais comblé (scripts et prédicteur non repris) |
| `plan-de-compte` | S1 | `sales/skills/stakeholder-map/SKILL.md` (étapes 3 et 4) | rôle, engagement, position, preuve ; rôles manquants, interlocuteur unique |
| `plan-de-compte` | S1 | `sales/skills/customer-health/SKILL.md` (étape 3) | santé en cinq dimensions, verdict porté par une ou deux dimensions |
| `revue-pipeline` | S1 | `sales/skills/pipeline-review/SKILL.md` (étape 4) | drapeaux de risque |
| `revue-pipeline` | S1 | `sales/skills/win-loss-review/SKILL.md` (étapes 3 et 4) | taux par source, taille, type ; étape de perte ; plus grosses pertes et gains cités |
| `revue-pipeline` | S3 | `commercial/skills/commercial-policy/SKILL.md` (« Anti-patterns ») | trois exceptions semblables signalent une règle à revoir |
| `preparation-rendez-vous-b2b` | S1 | `sales/skills/stakeholder-map/SKILL.md` (étapes 3 et 4) | carte des interlocuteurs |
| `proposition-commerciale` | S1 | `sales/skills/close-plan/SKILL.md` (étape 4) | plan d'action commun à rebours, dates impossibles signalées |
| `renouvellement-fidelisation` | S1 | `sales/skills/renewal-radar/SKILL.md` (étapes 3 et 4) | table de signaux, verdicts, contrôle de propreté |
| `renouvellement-fidelisation` | S2 | `skills/churn-prevention/SKILL.md` (« Churn Prediction & Proactive Retention ») | signaux faibles de départ, adaptés à l'assurance |
| `redaction-contrat-travail` | S4 | `plugins/hr-legal-compliance/agents/hr-pro.md (« Operating Principles », « Information to Collect »)` | droit inconnu : demander ; plusieurs pays : norme la plus protectrice ; au plus trois questions |
| `fin-contrat-travail` | S1 | `legal/skills/legal-response/SKILL.md (étape 3, « Universal Escalation Triggers »)` | déclencheurs d'escalade d'office |
| `fin-contrat-travail` | S4 | `plugins/hr-legal-compliance/agents/hr-pro.md (« Guardrails »)` | liste des actes à haut risque |
| `temps-travail-conges` | S1 | `human-resources/skills/policy-lookup/SKILL.md (« How to Answer », « Output »)` | format de réponse à une question de politique interne |
| `inventaire-obligations-conformite` | S1 | `operations/skills/compliance-tracking/SKILL.md` | inventaire des contrôles, calendrier, gestion des preuves, analyse des écarts (sans SOC 2 ni HIPAA) |
| `verification-conformite-initiative` | S1 | `legal/skills/compliance-check/SKILL.md (« Output »)` | format de l'avis : synthèse, textes, exigences, risques, actions, approbations, revue complémentaire |
| `inventaire-systemes-ia` | S3 | `ra-qm-team/skills/eu-ai-act-specialist/SKILL.md (« Key Questions », « AI System Risk Classification », « Per-Role Obligation Tracker »)` | questions préalables, classement en quatre niveaux, obligations par rôle (scripts non repris) |
| `autodiagnostic-nis2` | S6 | `plugins/entreprise-juridique/skills/autodiagnostic-nis2/SKILL.md` | compétence reprise (même auteur) |
| `veille-reglementaire` | S1 | `legal/skills/compliance-check/SKILL.md (« Escalation Criteria »)` | critères d'escalade de la veille |
| `reponse-avis-en-ligne` | S1 | `small-business/skills/review-reputation/SKILL.md` (« Step 4 », « What not to do ») | réponse à tous les avis par type, moins de 60 mots, citation exacte, aucune note inventée, publication une par une |
| `synthese-voix-client` | S2 | `skills/customer-research/SKILL.md` (mode 1 : « Extraction Framework », « Synthesis Steps », « Research Quality Guardrails ») | extraction, thèmes par fréquence et intensité, niveaux de confiance, biais d'échantillon |
| `synthese-voix-client` | S1 | `sales/skills/customer-voice/SKILL.md` (étape 3) | citation exacte, attribuée et datée |
| `escalade-interne` | S1 | `customer-support/skills/customer-escalation/SKILL.md` | quand escalader, six dimensions d'impact, gravités, reproduction, dossier d'escalade, cadence, désescalade |
| `tri-tickets-support` | S1 | `customer-support/skills/ticket-triage/SKILL.md` (« Duplicate Detection », « Priority Escalation Triggers ») | doublons et hausse de priorité |
| `reponse-client-multicanal` | S1 | `customer-support/skills/draft-response/SKILL.md` (étape 4) | liste de contrôle de relecture |
| `reponse-client-multicanal` | S1 | `small-business/skills/ticket-deflector/SKILL.md` (étape 4) | politique écrite d'abord, refus motivé, politique muette renvoyée à l'humain |
| `base-connaissances-faq` | S1 | `customer-support/skills/kb-article/SKILL.md` (« Article Type Templates », « Writing for Searchability ») | trois modèles d'articles, titre dans les mots du client, « Toujours un problème ? » |
| `tri-courrier-entrant` | S1 | `legal/skills/legal-response/SKILL.md (étape 3)` | déclencheurs d'escalade universels et propres aux actes de procédure |
| `preparation-signature` | S1 | `legal/skills/signature-request/SKILL.md (étapes 2 et 3, « Tips »)` | liste de contrôle avant signature, configuration des signataires (sans l'envoi) |
| `courrier-officiel` | S1 | `legal/skills/legal-response/SKILL.md (« Template Format », étape 3)` | modèle avec « à utiliser quand » et « ne pas utiliser quand » |
| `classement-archivage` | S1 | `operations/skills/process-doc/SKILL.md (« If Connectors Available »)` | chercher un document existant à mettre à jour avant d'en créer un |
| `agenda-echeances-legales` | S1 | `small-business/shared/chain-seams.md (section 2)` | une cadence enregistrée ne déclenche rien sans planificateur réel |
| `registre-plaintes` | S1 | `customer-support/skills/customer-escalation/SKILL.md` (« De-escalation ») | documenter ce qui a été appris |
| `dossier-mediation` | S1 | `customer-support/skills/customer-escalation/SKILL.md` (format « ESCALATION ») | impact, description, ce qui a été tenté, ce qui est demandé |
| `traitement-reclamation` | S1 | `customer-support/skills/customer-escalation/SKILL.md` (« Follow-up Cadence After Escalation », « De-escalation ») | cadence d'information, désescalade |
| `traitement-reclamation` | S1 | `customer-support/skills/draft-response/SKILL.md` (étape 4) | liste de contrôle de relecture |
| `gestion-dossier-sinistre` | S1 | `small-business/skills/ticket-deflector/SKILL.md` (étape 2) | ne jamais choisir seul un dossier quand plusieurs correspondent |
| `veille-medias` | S2 | `skills/public-relations/SKILL.md` (« Measurement ») | indicateurs utiles, rejet de l'équivalent en valeur publicitaire |
| `adaptation-fr-nl-en` | S6 | `plugins/entreprise-marketing/skills/adaptation-fr-nl-en/SKILL.md` | port de la compétence (même auteur) |
| `communique-de-presse` | S2 | `skills/public-relations/SKILL.md` (« Quick Reference: Pitch Quality Bar ») | liste de contrôle de la proposition au journaliste |
| `communication-de-crise` | S2 | `skills/public-relations/SKILL.md` (« When Something Goes Wrong ») | liste des 60 premières minutes, avis juridique avant tout aveu |
| `communication-interne` | S5 | `skills/internal-comms/SKILL.md` et `skills/internal-comms/examples/3p-updates.md` | format « 3P », choix du format selon le type de message |
| `verification-encaissements` | S1 | `small-business/skills/invoice-chase/SKILL.md` (étape 2, « Approval gates ») | paiement des 14 derniers jours exclu, correspondance par adresse ou par nom seulement, aucun client hors balance, source muette nommée |
| `contestation-creance` | S1 | `small-business/skills/reactivate/SKILL.md` (étape 4, « Approval gates ») | une plainte arrête la séquence, sans approbation pour arrêter |
| `contestation-creance` | S1 | `customer-support/skills/draft-response/SKILL.md` (étape 4) | liste de contrôle de la réponse |
| `relance-amiable-b2b-b2c` | S1 | `small-business/skills/invoice-chase/SKILL.md` (étapes 2 à 5, « Approval gates ») | profil du payeur, un courriel par client, tableau récapitulatif, approbation par lot |
| `suivi-contacts-evenement` | S2 | `skills/events/SKILL.md` (« The Universal Arc », partie « After ») | fenêtre de 24 à 48 heures, suivi par paliers, source « événement » dans le CRM |
| `salon-professionnel` | S2 | `skills/events/SKILL.md` (« The Universal Arc », parties « Before » et « During » ; « Attending (No Booth, No Stage) » ; « Common Mistakes ») | liste cible, rendez-vous pris avant d'arriver, conversations qualifiées et contexte noté, alternative sans stand |
| `bilan-evenement` | S2 | `skills/events/SKILL.md` (« Measurement: Pipeline, Not Applause ») | trois niveaux d'indicateurs, comparaison aux autres canaux, jugement sur deux ou trois éditions |
| `co-marketing-partenaire` | S2 | `skills/co-marketing/SKILL.md` (« Structuring the Partnership », « Co-Marketing Checklist ») | questions à aligner, plan d'accord en 8 points, liste de contrôle avant, pendant, après |
| `selection-partenaire` | S3 | `commercial/skills/partnerships-architect/SKILL.md` (« Step 1 », « Step 2 ») | fiche d'entrée remplie honnêtement sinon arrêt, critères d'arrêt écrits dès la sélection |
| `selection-partenaire` | S2 | `skills/co-marketing/SKILL.md` (« Partner Scoring Criteria ») | grille de 1 à 5 en six critères pour un partenaire de co-marketing |
| `accord-de-partenariat` | S3 | `commercial/skills/partnerships-architect/SKILL.md` (« Step 4 », « Step 5 ») | critères d'arrêt inscrits dans l'accord, questions de rétribution selon la contribution (sans pourcentages) |
| `pilotage-partenaires` | S2 | `skills/co-marketing/SKILL.md` (« Measuring Co-Marketing Success ») | indicateurs quantitatifs et qualitatifs d'une campagne commune |
| `pilotage-partenaires` | S3 | `commercial/skills/partnerships-architect/SKILL.md` (« Step 5 ») | confrontation aux critères d'arrêt |
| `routage-coordination` | S3 | `c-level-advisor/skills/chief-of-staff/SKILL.md` (« Decision Complexity Scoring ») | score de complexité de base 1 et cinq critères, nombre de rôles consultés selon le score |
| `routage-coordination` | S1 | `small-business/skills/smb-router/SKILL.md` (« Step 6 », « Guardrails ») | départage par urgence, plus petit périmètre, une question à deux options ; ne jamais faire le travail soi-même |
| `registre-decisions` | S3 | `c-level-advisor/skills/decision-logger/SKILL.md` (« Decision Entry Format », « Conflict Detection ») | format d'entrée, rejets à ne pas reproposer, trois cas de conflit, formule de réouverture (scripts non repris) |
| `compte-rendu-instances` | S6 | `plugins/entreprise-direction/skills/compte-rendu-reunion/SKILL.md` | décisions, actions et points ouverts, trous marqués `[à attribuer]` (même auteur) |
| `registre-risques-entreprise` | S1 | `legal/skills/legal-risk-assessment/SKILL.md` (« Severity x Likelihood Matrix », « Risk Score Calculation ») | matrice 5 × 5, seuils 1-4, 5-9, 10-15, 16-25 |
| `registre-risques-entreprise` | S1 | `operations/skills/risk-assessment/SKILL.md` (« Risk Categories », « Risk Register Format ») | six catégories de risques, champs du registre |
| `registre-risques-entreprise` | S1 | `small-business/shared/absent-is-not-zero.md et small-business/shared/chain-seams.md (section 1)` | donnée absente n'est pas zéro ; dénominateur du bon périmètre |
| `revue-contradictoire` | S3 | `c-level-advisor/skills/board-meeting/SKILL.md` (phases 2 et 3) | contributions isolées, puis critique : accord trop facile, hypothèse partagée, voix absente, risque oublié, avis hors domaine |
| `controle-sanctions-double-usage` | S7 | `skills/customs-trade-compliance/SKILL.md` (« Restricted Party Screening », « Screening Hit Assessment ») | toutes les parties filtrées, signaux d'alerte, correspondance ni bloquée ni levée sans analyse justifiée, aucune poursuite tant qu'elle est ouverte (listes de l'UE à la place des listes américaines) |
| `incoterms-paiement-international` | S7 | `skills/customs-trade-compliance/SKILL.md` (« Incoterms 2020 ») | liste de questions et pièges (EXW, DDP, FOB et FCA, propriété, valeur en douane dans l'UE) ; texte de la CCI non reproduit |
| `classement-douanier-origine` | S7 | `skills/customs-trade-compliance/SKILL.md` (« Classification Decision Logic ») | règles générales interprétatives dans l'ordre, règle qui tranche écrite, décisions existantes consultées |
| `evaluation-formation` | S3 | `ra-qm-team/skills/capa-officer/SKILL.md` (« Effectiveness Verification ») | délai d'attente et fenêtre de mesure, méthodes selon le type de problème, comparaison avant et après, arbre efficace, à prolonger, inefficace |
| `conduite-changement` | S3 | `c-level-advisor/skills/change-management/SKILL.md` | cinq étapes (modèle ADKAR de Prosci cité, supports non repris), séquence de communication d'un changement d'outil, schémas de résistance, fatigue du changement |
| `accident-du-travail` | S3 | `ra-qm-team/skills/capa-officer/SKILL.md` (« Fishbone Diagram Categories (6M) », « Root Cause Validation ») | six familles de causes, validation de la cause en cinq points |
| `plan-urgence` | S1 | `operations/skills/runbook/SKILL.md` (« Output ») | fiche de procédure : prérequis, étapes avec résultat attendu, vérification, dépannage |
| `procedure-qualite` | S1 | `operations/skills/process-doc/SKILL.md` (« Output », « Tips ») | matrice RACI, tableau des exceptions et cas particuliers |
| `non-conformite-action-corrective` | S3 | `ra-qm-team/skills/capa-officer/SKILL.md` (« CAPA Necessity Determination », « Root Cause Validation », « Effectiveness Determination », « Key Performance Indicators », « Aging Analysis Categories ») | ouverture selon le déclencheur, validation de la cause en cinq points, arbre d'efficacité, indicateurs et tranches d'ancienneté présentés comme valeurs par défaut |
| `audit-interne` | S3 | `ra-qm-team/skills/qms-audit-expert/SKILL.md` (« Risk-Based Audit Frequency », « Auditor Independence », « Audit Program Metrics ») | fréquence selon le risque, indépendance de l'auditeur en quatre points, indicateurs du programme (clauses ISO 13485 non reprises) |
| `maitrise-documentaire` | S3 | `ra-qm-team/skills/quality-documentation-manager/SKILL.md` | numérotation, cycle de vie, relecteurs et approbateurs, suites des commentaires, classes de modification, retrait des obsolètes (21 CFR Part 11 non repris) |
| `revue-de-direction-qualite` | S3 | `ra-qm-team/skills/capa-officer/SKILL.md` (« Management Review Inputs ») | entrées de la revue sur les actions correctives |
| `revue-de-direction-qualite` | S1 | `operations/skills/status-report/SKILL.md` | statut vert, jaune, rouge et décisions attendues |
| `cartographie-processus` | S1 | `operations/skills/process-optimization/SKILL.md` (« Analysis Framework ») | état actuel, cinq gaspillages, état futur, mesure de l'effet |
| `prevision-demande-stocks` | S7 | `skills/inventory-demand-planning/SKILL.md` (« Forecast Accuracy Metrics », « Reorder Logic », « Safety Stock Calculation ») | erreur pondérée, biais, signal de suivi, position de stock, méthode de Croston |
| `prevision-demande-stocks` | S1 | `small-business/skills/inventory-planner/SKILL.md` (étapes 2 à 5) | rupture exclue de la base, date de rupture sur la vitesse la plus forte et quantité sur 28 jours, stock commandé retranché, article sans vente jamais réassorti |
| `gestion-stocks-inventaire` | S7 | `skills/inventory-demand-planning/SKILL.md` (« ABC/XYZ Classification ») | ABC sur la marge, XYZ par coefficient de variation, matrice de politiques |
| `gestion-stocks-inventaire` | S1 | `small-business/skills/inventory-planner/SKILL.md` (étape 5) | surstock au-delà de 120 jours, dormant depuis 90 jours, trésorerie immobilisée totalisée |
| `gestion-exceptions-transport` | S7 | `skills/logistics-exception-management/SKILL.md` (« Exception Taxonomy », « Severity Classification », « Eat-the-Cost vs Fight-the-Claim », « Priority Sequencing ») | typologie, gravité sur trois axes, arbitrage absorber ou réclamer, ordre de priorité (délais remplacés par la CMR) |
| `evaluation-transporteurs` | S7 | `skills/carrier-relationship-management/SKILL.md` (« Carrier Scorecarding », « When to Consolidate vs. Diversify », « Carrier Exit Criteria ») | cinq indicateurs, concentrer ou diversifier, critères de sortie (licence belge à la place du contrôle américain) |
| `gestion-retours-logistique` | S7 | `skills/returns-reverse-logistics/SKILL.md` (« Disposition Decision Trees », « Disposition Routing by Category and Condition ») | arbre de destination par état et par économie du cas |
| `plan-campagne` | S1 | `marketing/skills/campaign-plan/SKILL.md` (« Campaign Brief Structure ») | brief en dix rubriques |
| `calendrier-reseaux-sociaux` | S2 | `skills/social/SKILL.md` (« Content Pillars Framework », « Content Calendar Structure », « Content Repurposing System », « Engagement Strategy ») | piliers et questions pour les définir, grille de calendrier, recyclage, règles d'engagement |
| `calendrier-reseaux-sociaux` | S6 | `plugins/entreprise-marketing/skills/calendrier-editorial/SKILL.md` | rythme tenable, temps forts d'abord, marges et contenus de réserve (même auteur) |
| `recherche-prospects` | S2 | `skills/prospecting/SKILL.md` (« Compliance Guardrails », « Quality Checks ») | garde-fous de collecte (pas d'aspiration ni de contournement, canaux publics, source et date, aucune donnée sans origine ni sensible), contrôles de qualité avant de rendre la liste |
| `qualification-prospects` | S2 | `skills/prospecting/SKILL.md` (« Quality Checks ») | prioritaire seulement avec un signal sourcé, confiance élevée avec deux sources indépendantes |
| `planification-production` | S7 | `skills/production-scheduling/SKILL.md` (« Bottleneck Management », « Disruption Response », « Job Priority Sequencing », « Disruption Re-Sequencing », « Bottleneck Identification », « ERP/MES Interaction Patterns ») | goulot vérifié causalement, tambour, tampon et corde, règles de priorité, réponse aux perturbations, cohérence avec le progiciel |
| `methodes-temps-gammes` | S7 | `skills/production-scheduling/SKILL.md` (« Changeover Optimization ») | SMED en quatre phases, matrice des réglages selon l'ordre des séries |
| `non-conformite-action-corrective` | S7 | `skills/quality-nonconformance/SKILL.md` (« NCR Disposition Decision Logic ») | ordre de décision de la destination d'un produit non conforme |
| `dossier-subside-innovation` | S1 | `small-business/skills/grant-rfp-writer/SKILL.md` (« Step 3 » (go/no-go avant toute rédaction)) | décision d'aller ou non avant toute rédaction, cinq contrôles ordonnés, non motivé et enregistré |
| `selection-projets-innovation` | S1 | `small-business/skills/grant-rfp-writer/SKILL.md` (« Step 3 ») | cinq contrôles d'aller ou non transposés aux projets internes |
| `selection-projets-innovation` | S1 | `engineering/skills/tech-debt/SKILL.md` (« Prioritization Framework ») | priorité = (impact + risque) x (6 - effort) |
| `registre-risques-projet` | S1 | `operations/skills/risk-assessment/SKILL.md` (« Risk Assessment Matrix », « Risk Categories », « Risk Register Format ») | matrice de trois sur trois, six catégories, statuts ouvert, atténué, accepté, clos |
| `plan-capacite-ressources` | S1 | `operations/skills/capacity-plan/SKILL.md` (« Utilization Targets », « Common Pitfalls », « Output ») | cibles d'occupation par rôle, pièges, scénarios |
| `plan-capacite-ressources` | S3 | `business-operations/skills/capacity-planner/SKILL.md` (« Forcing-question library », questions 1 et 2) | goulot constaté sur des faits, compromis de service accepté |
| `compte-rendu-comite` | S6 | `plugins/entreprise-direction/skills/compte-rendu-reunion/SKILL.md` | décisions, actions avec responsable et échéance, trous marqués, points ouverts, message de diffusion (même auteur) |
| `suivi-energie-batiment` | S7 | `skills/energy-procurement/SKILL.md` (« Pricing Structures and Utility Bill Anatomy », « Procurement Strategy Selection ») | facture lue par composantes, questions de stratégie d'achat fixe, variable ou mixte (composantes belges selon la CREG) |
| `demandes-occupants` | S1 | `operations/skills/process-doc/SKILL.md` (« Output », « If Connectors Available », « Tips ») | processus écrit avec RACI, étapes, exceptions, indicateurs ; document existant mis à jour d'abord |
| `memoire-para` | S8 | `skills/para-memory-files/SKILL.md` et `skills/para-memory-files/references/schemas.md` | méthode PARA en trois couches, règles des faits, schéma des faits, décroissance ; traduite et adaptée (emplacement `./memoire/`, Grep au lieu de `qmd`, pas de personnes privées, source et date obligatoires) ; texte d'origine recopié INCHANGÉ dans `memoire-para/references/origine-paperclip.md` |

## Texte de la licence MIT de S2

```
MIT License

Copyright (c) 2025 Corey Haines

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Texte de la licence MIT de S3

```
MIT License

Copyright (c) 2025 Alireza Rezvani

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Texte de la licence MIT de S4

```
MIT License

Copyright (c) 2024 Seth Hobson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE. ```

## Texte de la licence MIT de S6

```
MIT License

Copyright (c) 2026 Jean-Baptiste Dhondt

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Texte de la licence MIT de S8

```
MIT License

Copyright (c) 2025 Paperclip AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Texte de la licence Apache 2.0 de S1

```

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.


  Syntax-file, code seperations,code vault integeted with css definition.
Pre-recordec, pre-tested, elements to capture elements into Packeted-User-Relations to capture - [

pre-requisites, statements, recorded-cams
, cams-data
, data, input()

]
```

## Texte de la licence Apache 2.0 de S5

```

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2026 Anthropic, PBC.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

## Licences de S7

Les reprises de S7 viennent de compétences dont l'en-tête déclare la licence Apache 2.0 : le texte de cette licence est
celui reproduit plus haut pour S1 et S5 (licence identique). Le dépôt lui-même est publié sous la licence MIT suivante :

```
MIT License

Copyright (c) 2026 Affaan Mustafa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
