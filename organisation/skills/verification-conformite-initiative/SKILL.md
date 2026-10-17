---
name: "verification-conformite-initiative"
description: "Rend un avis préalable de conformité sur un projet d'une PME belge (nouveau produit, nouvel outil ou logiciel, campagne, traitement de données, partenariat) : synthèse en trois issues (poursuivre, poursuivre sous conditions, examen approfondi), textes applicables, exigences avec statut, zones de risque, actions recommandées, approbations nécessaires et revue complémentaire à demander. À utiliser avant de lancer une initiative qui touche des données personnelles, des clients, une réglementation sectorielle ou de l'IA ; jamais pour autoriser le lancement ni remplacer l'avis d'un juriste."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "conformite"
---

# Vérification de conformité d'une initiative

## Quand l'utiliser

- Le marketing veut lancer une campagne par courriel à une liste achetée.
- Un service veut adopter un nouvel outil en ligne qui traite des données de clients.
- Un nouveau produit ou service va être proposé aux clients.

## Objectif

Un avis court et structuré, rendu avant la décision, qui dit quels textes s'appliquent, ce qui est déjà satisfait, ce
qui manque, qui doit approuver et quand un avis spécialisé est nécessaire.

## Prérequis

- La description précise du projet : quoi, pour qui, quelles données, quels outils, quels pays.
- L'inventaire des obligations de l'entreprise (`inventaire-obligations-conformite`), s'il existe.

## Entrées

- `projet` : description, calendrier, responsable.
- `donnees` : catégories de personnes et de données.
- `geographie` : pays des personnes visées et des prestataires.

## Étapes

1. **Préciser le projet** : une description vague (« une campagne ») est complétée par au plus trois questions
   (quelles personnes, quelles données, quels pays).
2. **Identifier les textes applicables** depuis les sources officielles : protection des données, prospection
   électronique (livre XII du Code de droit économique), pratiques commerciales (livre VI), règles sectorielles (par
   exemple distribution d'assurances sous contrôle de la FSMA), règlement européen sur l'IA si un système d'IA est en
   jeu, cybersécurité. Chaque texte est cité avec son article ou marqué « à vérifier ».
3. **Lister les exigences** : numéro, exigence, statut (satisfaite, non satisfaite, inconnue), action.
4. **Relever les zones de risque** avec une gravité (élevée, moyenne, faible) et une mesure.
5. **Recommander les actions** par priorité.
6. **Lister les approbations** nécessaires (délégué à la protection des données, juriste, direction, responsable
   conformité) et leur statut.
7. **Conclure** : poursuivre, poursuivre sous conditions (lesquelles), ou examen approfondi nécessaire (par qui).

## Livrable

L'avis : synthèse et issue ; tableau des textes applicables ; tableau des exigences ; tableau des risques ; actions
recommandées ; approbations nécessaires ; revue complémentaire recommandée ; carte de décision.

## Critères de réussite

- Chaque texte applicable cite sa source officielle ou est marqué « à vérifier ».
- Chaque exigence a un statut et une action ; aucune n'est laissée « inconnue » sans question associée.
- L'issue est justifiée et le lancement reste une décision humaine.

## À vérifier par un professionnel

- L'interprétation des textes et toute zone de risque élevée : juriste.
- Les traitements de données à risque élevé (analyse d'impact) : délégué à la protection des données.

## Limites

- L'avis vaut pour le projet tel que décrit ; tout changement de périmètre demande une nouvelle vérification.
- La compétence ne contrôle pas la mise en œuvre réelle.

## Exemple

Projet : envoyer une infolettre commerciale à 2 000 adresses achetées. Textes : livre XII du Code de droit économique
(consentement préalable pour la prospection par courriel, à vérifier), RGPD (base légale, information). Exigences : preuve
du consentement des personnes, non satisfaite ; désinscription simple, inconnue. Risque élevé : plainte et sanction.
Issue : examen approfondi nécessaire, par le juriste ; action : ne pas utiliser la liste sans preuve de consentement.

Cas d'échec : l'agent conclut « poursuivre » parce que le fournisseur de la liste affirme qu'elle est « conforme RGPD ».
Une affirmation commerciale n'est pas une preuve de consentement.

## Origine de la méthode

Format de sortie adapté de github.com/anthropics/knowledge-work-plugins, `legal/skills/compliance-check/SKILL.md`
(« Output » : synthèse, textes, exigences, risques, actions, approbations, revue complémentaire), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : français, textes belges et européens,
aucune autorisation de lancement. Liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
