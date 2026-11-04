# 01. Un agent ou mille : deux laboratoires, deux réponses opposées

**Catégorie du site** : `agents` (IA.2), sous-rubrique IA.2.3 Orchestration.
**Remplace l'exemple** : « Des agents qui coopèrent ».

## Angle

La même semaine, Anthropic conseille aux entreprises de replier leurs sous-agents dans une seule boucle d'agent, et Microsoft publie en source ouverte un harnais qui fait travailler jusqu'à 1 024 agents sans chef d'orchestre. Pour un développeur, la question est concrète : faut-il découper un agent en spécialistes ou le garder d'un seul tenant ? Pour un décideur, Anthropic nomme un piège d'organisation : l'architecture des agents qui recopie l'organigramme.

## Public visé

Développeurs qui construisent des agents ; responsables techniques qui arbitrent une architecture multi-agents.

## Faits sourcés

| Fait | URL | Date | Extrait exact | Statut |
| --- | --- | --- | --- | --- |
| Anthropic constate qu'un agent unique doté de compétences fait souvent mieux que les sous-agents, sur ses comparaisons en entreprise | https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop | 22/10/2026 | a single agent with skills frequently outperformed both the one-prompt-for-everything design and the subagent design on quality | rapporte_editeur |
| Un client mesure un temps d'exécution environ deux fois plus court avec une boucle unique | https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop | 22/10/2026 | One customer that evaluated their multi-agent harness against a single agent loop saw a roughly 2x faster runtime with the latter. | rapporte_editeur |
| Anthropic garde trois cas où les sous-agents restent utiles, dont la dégradation mesurable par excès de contexte | https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop | 22/10/2026 | A single agent loop hits measurable performance degradation from context bloat | rapporte_editeur |
| Le piège nommé : l'architecture des agents devient une copie de l'organigramme | https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop | 22/10/2026 | with the agent architecture becoming a copy of their org chart (Conway’s law at work) | rapporte_editeur |
| L'invite système de Claude Code a été réduite de plus de 80 % pour les modèles avancés | https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop | 22/10/2026 | we reduced Claude Code’s system prompt for more advanced models by over 80% | rapporte_editeur |
| Microsoft a ouvert le code d'Agensh le 24/10 (prépublication arXiv du 22/09, hors période) | https://github.com/microsoft/Agensh | 24/10/2026 | 2026-10-24: We open-sourced Agensh, including the harness, experiment launch | confirme_doc_officielle |
| Agensh fait coopérer jusqu'à 1 024 agents sans orchestrateur central | https://github.com/microsoft/Agensh | 24/10/2026 | merge progress asynchronously, without a central orchestrator | rapporte_editeur |
| Sur cinq tâches ProgramBench, le taux de tests réussis passe de 19,31 % (1 agent) à 28,78 % (128 agents) | https://github.com/microsoft/Agensh | 24/10/2026 | from 19.31% with 1 agent to 28.78% with 128 agents | rapporte_editeur |
| Sur Pandoc, 55,06 % avec 1 024 agents, dans le même budget de six heures | https://github.com/microsoft/Agensh | 24/10/2026 | 55.06% with 1,024 agents under the same | rapporte_editeur |

## Questions ouvertes

- Les comparaisons d'Anthropic portent sur « plusieurs déploiements en entreprise » non nommés : ni taille d'échantillon ni protocole publiés.
- Agensh mesure un gain de qualité, pas un coût : combien coûtent 128 ou 1 024 agents pendant six heures ? Le dépôt ne le dit pas dans la partie lue.
- Les deux résultats ne portent pas sur les mêmes tâches (service client en entreprise contre reconstruction de logiciels) : ils ne se contredisent peut-être pas.
- Le kit de migration d'Anthropic (dépôt `anthropics/single-agent-loop-kit`) n'affiche pas de date lisible : à dater avant citation.

## Sources complémentaires à lire

- https://github.com/anthropics/single-agent-loop-kit (kit compagnon, licence Apache-2.0, « Not maintained »)
- Le PDF `agensh.pdf` et `REPRODUCE.md` du dépôt Agensh
- https://www.aitimes.com/news/articleView.html?idxno=216662 (traitement coréen d'Agensh, 26/10/2026)
- https://the-decoder.de/weniger-ist-mehr-anthropic-raet-zum-einzelnen-ki-agent-statt-zu-vielen-subagenten/ (traitement allemand, 25/10/2026)

## Plan proposé

1. La semaine des deux réponses : boucle unique contre essaim.
2. Ce qu'Anthropic a observé chez ses clients, et ce qu'il ne publie pas.
3. La loi de Conway appliquée aux agents.
4. Agensh : comment 1 024 agents se partagent le travail sans chef.
5. Lire les chiffres : qualité mesurée, coût absent.
6. Grille de décision pour un développeur : quand découper, quand replier.
