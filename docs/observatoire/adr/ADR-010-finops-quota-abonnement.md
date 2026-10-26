# ADR-010 : FinOps, le quota de l'abonnement est la ressource

- **Statut** : Accepté (JB, 26/10/2026)
- **Décision de référence** : D9, Livrable K, O3 du plan

## Contexte

JB a un forfait Max à 100 € par mois, dépassements désactivés, et aucun service payant à l'usage. Le coût réel des
agents n'est donc pas en euros mais en **quota** (fenêtre de 5 heures et semaine). Il est en concurrence avec son
usage de Claude Code. Les montants « équivalent API » du plan servent à comparer, pas à facturer.

## Décision

1. **Le quota est la ressource à budgéter.** Les budgets natifs de Paperclip par agent et par service, un plafond de
   sujets par semaine et une estimation avant tout lot lourd bornent la consommation ; arrêt bloquant au plafond.
2. **Volume piloté par l'actualité vérifiée**, pas par un nombre de pages : objectif de départ 20 à 40 pages et un
   dossier complet par semaine (O3), ajusté après la mesure du pilote (phase 3).
3. **Les hypothèses d'unité sont des estimations** à remplacer par des mesures : fiche environ 0,90 $ équivalent API,
   dossier de 24 chapitres environ 7 $, mise à jour ciblée environ 0,50 $, édition hebdomadaire de 30 à 40 pages
   environ 4 à 5 $, question 0,02 $ sur Sonnet.
4. **Scénario de départ** : MVP privé économe (4 dossiers, 20 fiches, 4 éditions, 200 questions, environ 65 $
   équivalent API, 0 € réel). La production hebdomadaire régulière (environ 125 $) reste **à prouver** compatible
   avec le quota.
5. Leviers : modèle par agent, taille du contexte relu (premier levier mesuré), cache, API Batch (moins 50 %) si
   l'API s'ouvre un jour. Rapport hebdomadaire de consommation.

## Options écartées et pourquoi

- **Viser 300 pages par semaine** : remplissage, et quota hors de portée.
- **Passer à l'API pour lever la limite** : payant, contraire à la décision de l'opérateur tant qu'elle n'est pas revue
  (ADR-006).
- **Ne pas budgéter** : risque de vider le quota hebdomadaire et de bloquer le travail de l'opérateur.

## Conséquences

- Positives : coût en euros nul en V1 ; consommation visible et plafonnée ; décision d'extension fondée sur des
  mesures.
- Négatives : débit limité par le quota ; chiffres actuels non mesurés ; l'Observatoire peut priver Claude Code de
  quota si le plafond est mal réglé. Contrôle d'accès gratuit (Zero Trust) : conditions non vérifiées.

## Références

- Plan : Livrable A (D9), Livrable K (prix, hypothèses, scénarios), Livrable O (O3, O4), I.3 (calendrier).
- Mémoire de l'opérateur : `consommation-abonnement-23102026.md` (méthode de mesure du quota).
