# Observatoire : matrice des risques

Statut : phase 1 (fondations, documentation seulement). Source : « Revue contradictoire des risques » du plan, complétée par les risques propres à la phase 2 (département). Les risques de la phase 1 bis (généralisation de l'usine) sont sans objet : phase annulée le 26/10/2026.

Décisions de l'opérateur du 26/10/2026 prises en compte : abonnement Max pour l'opérateur seul en V1 ; l'Observatoire est le 29e service de l'organisation actuelle de l'usine sur l'instance 3100 (ni organisation générique, ni instance séparée ; phase 1 bis annulée) ; Astro 7 + Starlight 0.42 ; V1 locale ; 20 à 40 pages et 1 dossier complet par semaine ; aucune exécution d'outil tiers, puis VM jetable sur approbation ; aucun service payant à l'usage.

Échelles : probabilité et impact en faible / moyen / fort. Le responsable est un rôle (JB = décision humaine ; les agents sont ceux du département, voir le registre).

## 1. Risques du plan (18)

| # | Risque | Proba. | Impact | Détection | Prévention | Correction | Résiduel | Responsable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | Architecture trop complexe | moyenne | fort | lots qui débordent du créneau de 15 à 30 min | réutilisation de l'existant, 13 agents au plus, monolithe | couper des éléments P1 | faible | JB (arbitrage), orchestrateur |
| R02 | Quota saturé par l'usine | **forte** | fort | relevé hebdomadaire de consommation (voir `finops.md`) | plafond de sujets par semaine, Sonnet par défaut, contexte court | baisser le volume | moyen | orchestrateur, JB |
| R03 | Dépendance à Anthropic | moyenne | moyenne | revue de phase | contenu en Markdown dans git, RAG local, recherche sans LLM | autre modèle pour les questions | faible | JB |
| R04 | Agents inefficaces | moyenne | moyenne | taux PASS de la porte, nombre de corrections | compétences ciblées, porte déterministe | réécrire les consignes | moyen | orchestrateur |
| R05 | Documentation hallucinée | moyenne | **fort** | porte, relecteur indépendant, corpus piégé | preuves obligatoires pour chaque affirmation | correction tracée et republiée | faible | relecteur, porte |
| R06 | Collecte non autorisée | faible | fort | contrôle K4 (voir `droits-collecte.md`) | API officielles d'abord, robots.txt, cadence bornée | retirer la source | faible | collecteur, JB |
| R07 | Publication erronée | moyenne | fort | retours de lecteurs, relecteur | approbation humaine avant publication | correction publiée et datée | faible | JB |
| R08 | Trop dépendant de GitHub | **forte** | moyenne | rapport de couverture (I.2) | sources officielles, arXiv, registres | ajouter des sources | moyen | collecteur |
| R09 | Doublons | moyenne | faible | table d'alias | résolution d'identité | fusion tracée | faible | collecteur |
| R10 | Données obsolètes | **forte** | moyenne | dates de vérification, statut `obsolete` | K10 (versions), bandeaux de péremption | révision ciblée | moyen | agent de mise à jour |
| R11 | Outil malveillant | moyenne | **fort** | analyse statique en cage | jamais d'exécution sur l'hôte ; VM jetable sur approbation | destruction de la VM | faible | JB (approbation), agent d'essais |
| R12 | Mauvaise isolation | faible | fort | revue `securite` unique par ensemble de lots | cage, `CLAUDE_CONFIG_DIR` dédié, VM | correctif | faible | agent `securite` |
| R13 | Pas de modèle économique | **forte** | moyenne | décision de phase 7 | coûts quasi nuls jusque-là | rester un projet personnel | moyen | JB |
| R14 | Hebdomadaire trop volumineux | **forte** | moyenne | quota, retards | volume piloté par l'actualité, 20 à 40 pages | édition réduite | faible | orchestrateur |
| R15 | MVP surdimensionné | moyenne | fort | dérive des lots | P0 strict | reporter | faible | JB |
| R16 | Maintenance trop coûteuse | moyenne | moyenne | quota par mise à jour | diff ciblé, révision par chapitre | suivre moins de projets | moyen | agent de mise à jour |
| R17 | Conflit entre le projet personnel de l'opérateur (O7) et un client professionnel existant : l'Observatoire vit dans l'organisation du client courtier (prévention de la phase 1 bis annulée le 26/10/2026, voir aussi R37) | moyenne | fort | revue avant l'ouverture publique : propriété des données `obs_*`, du dépôt de contenu, du domaine et des clés | dépôt de contenu, domaine et clés au nom de l'opérateur dès la phase 3 ; aucune donnée ni aucun secret du client dans les enregistrements `obs_*` ; décision de séparation par l'opérateur avant la phase 7 | export du contenu vers un espace propre à l'opérateur | moyen | JB, `securite` |
| R18 | **Sans objet : phase 1 bis annulée le 26/10/2026.** Perte de données lors de la généralisation | moyenne | **fort** | comptes de lignes avant/après par table | `pg_dump` restauré à blanc, répétition sur instance d'essai | restauration du dump | faible | exécutant, JB (approbation) |

Remarque sur R12 : la décision du 26/10 retire l'instance séparée. L'isolement repose donc sur la cage, le répertoire de configuration dédié aux agents, la portée de fichiers limitée au dossier de travail, le hook de garde de la mémoire et la VM jetable. Cette substitution est reprise dans R37.

## 2. Risques propres à la phase 1 bis (sans objet : phase 1 bis annulée le 26/10/2026)

| # | Risque | Proba. | Impact | Détection | Prévention | Correction | Résiduel | Responsable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R19 | **Sans objet : phase 1 bis annulée le 26/10/2026.** Organisation unique sur 3100 : un défaut du département Observatoire touche les 28 autres services | moyenne | fort | export de l'organisation avant/après, `verifier-organisation.py` | entreprise Observatoire ajoutée avec `--ajouter-services` seulement, agents en pause à l'ajout, budgets par agent | mise en pause de l'entreprise, restauration du dump | faible | exécutant, JB |
| R20 | **Sans objet : phase 1 bis annulée le 26/10/2026.** Nom ou donnée du client pro oubliés dans l'organisation « générique » | moyenne | fort | recherche exhaustive des noms, fiches, connaissances, prospects, connecteurs, secrets (liste dans le plan de la phase 1 bis) | inventaire écrit avant renommage ; contrôle automatique sur l'export | nouveau passage de renommage ; purge | faible | `securite`, JB |
| R21 | **Sans objet : phase 1 bis annulée le 26/10/2026.** Renommage cassant les références (identifiants d'entreprise, routines, liens de tâches) | moyenne | fort | tests de bootstrap, comptes de lignes, tâches orphelines | renommage par libellé seulement, identifiants conservés ; répétition sur instance d'essai | restauration du dump | faible | exécutant |
| R22 | **Sans objet : phase 1 bis annulée le 26/10/2026.** Sauvegarde non restaurable (dump jamais rejoué) | faible | **fort** | restauration à blanc obligatoire avant tout changement | critère d'acceptation : restauration réussie et comptes identiques | refaire le dump, bloquer le chantier | faible | exécutant |
| R23 | **Sans objet : phase 1 bis annulée le 26/10/2026.** Secrets du client pro accessibles aux agents de l'Observatoire (instance partagée) | faible | **fort** | revue des secrets par entreprise, test d'accès | secrets rattachés à l'entreprise du client ; aucun secret commun ; agents sans accès aux autres entreprises | rotation des secrets concernés | faible | `securite` |
| R24 | **Sans objet : phase 1 bis annulée le 26/10/2026.** Interruption du service des 28 autres départements pendant la migration | moyenne | moyenne | surveillance de l'instance 3100, tâches en retard | fenêtre de maintenance annoncée, application après répétition réussie | retour arrière par dump | faible | JB |

## 3. Risques propres à la phase 2 (département)

| # | Risque | Proba. | Impact | Détection | Prévention | Correction | Résiduel | Responsable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R25 | Dépassement de la limite de 13 agents ou de leurs rôles qui se recouvrent | faible | moyenne | validateur du registre | correspondance 24 rôles vers 13 agents (D.1, 13e agent le 26/10/2026) | fusionner des rôles | faible | orchestrateur |
| R26 | Agent activé trop tôt (avant tests de bootstrap) | moyenne | fort | statut des agents (pause par défaut) | activation soumise à approbation de l'opérateur | remise en pause | faible | JB |
| R27 | Budget natif absent ou mal réglé sur un agent ou un service | moyenne | fort | test « budget atteint » du bootstrap | budgets déclarés dans la liste des services, arrêt bloquant testé | corriger puis rejouer le test | faible | exécutant |
| R28 | Dérive des consignes `AGENTS.md` par rapport au contrat type | moyenne | moyenne | validateur de contrats, génération des fiches | schémas, génération des fiches depuis une source unique | régénération | faible | exécutant |
| R29 | Outils interdits accessibles malgré les consignes (Bash libre, web) | faible | fort | test « outils interdits refusés » | liste d'outils explicite par agent, aucun outil pour les agents de questions | correctif, test de non-régression | faible | `securite` |
| R30 | Reprise après interruption créant des doublons | moyenne | moyenne | test d'interruption/reprise | empreintes d'idempotence, clés uniques | dédoublonnage | faible | exécutant |
| R31 | Boucle de corrections sans fin entre rédacteur et relecteur | moyenne | moyenne | compteur de tours | nombre de tours borné, budget par tâche | arrêt et escalade à l'opérateur | faible | orchestrateur |
| R32 | Contenu hostile (README piégé) qui influence un agent | moyenne | fort | corpus piégé, motifs d'injection | documents = données, collecteurs sans LLM, agents sans outil libre | rejet du document, mise en liste noire | faible | porte, `securite` |
| R33 | Usage de l'abonnement pour servir des tiers (interdit par les conditions d'Anthropic) | faible en V1 | fort | revue avant tout accès d'un second utilisateur | V1 pour l'opérateur seul ; clé API dédiée dès qu'un tiers pose des questions | coupure du service de questions | faible | JB |
| R34 | Coût caché d'un service payant à l'usage activé par mégarde | faible | fort | revue des connecteurs et facturations | aucun service payant sans décision explicite ; dépassements désactivés | désactivation immédiate | faible | JB |
| R35 | Chiffre de performance publié comme « vérifié » sans essai exécuté | moyenne | fort | règle de la porte (statut `verifie_experimentalement` exige un essai lié) | contrainte SQL et règle de porte | dépublication et correction tracée | faible | porte, relecteur |
| R36 | Traduction périmée publiée comme à jour | moyenne | moyenne | comparaison des révisions FR/EN | marquage automatique « traduction périmée » | retraduction | faible | agent de traduction |
| R37 | Mélange des données de l'Observatoire avec celles du client courtier (même organisation, 29e service) | faible | **fort** | contrôle automatique de l'export de chaque entreprise, test d'accès croisé, recherche des noms et données du client dans les enregistrements `obs_*` et dans le dépôt de contenu | entreprise distincte, cloisonnement natif de Paperclip, secrets rattachés à l'entreprise, dépôt de contenu séparé, routes `obs.*` refusées hors de l'entreprise « observatoire » | purge des données mélangées, rotation des secrets concernés, republication corrigée ; séparation du contenu avant l'ouverture publique (ADR-001, O7) | faible | `securite`, JB |

## 4. Suivi

La matrice est relue à la fin de chaque phase. Tout risque dont la probabilité ou l'impact change est mis à jour ici avec la date. Un risque nouveau reçoit le numéro suivant, sans renumérotation.
