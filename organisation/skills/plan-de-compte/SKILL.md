---
name: "plan-de-compte"
description: "Établit le plan de compte d'un client entreprise : carte des interlocuteurs (rôle, engagement, position, preuve), rôles manquants et risque d'interlocuteur unique, santé de la relation en cinq dimensions (relation, tendance d'engagement, commercial, support, valeur rendue) avec un verdict vert, jaune ou rouge, potentiel et prochaines démarches à valider. À utiliser pour un client important, avant une revue de portefeuille ou un renouvellement ; jamais pour contacter le client, deviner la position d'une personne ni recommander un produit."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commercial"
---

# Plan de compte d'un client entreprise

## Quand l'utiliser

- Un client entreprise important doit être suivi de façon structurée (plusieurs contrats, plusieurs interlocuteurs).
- Une revue annuelle ou un renouvellement approche et il faut savoir où en est la relation.
- Le seul interlocuteur connu vient de partir ou de changer de fonction.

## Objectif

Une vue d'une à deux pages qui dit qui compte chez le client et ce qu'on sait vraiment de chacun, où la relation est
fragile, comment se porte le compte avec preuves, et quelles démarches proposer à l'humain.

## Prérequis

- La fiche du client dans le CRM : contrats, interlocuteurs, historique des échanges et rendez-vous.
- Les réponses bornées de la liaison si nécessaire (réclamation ou sinistre ouvert, primes échues).
- La fiche publique de l'entreprise (BCE) pour les fonctions publiées.

## Entrées

- `client` : dénomination et numéro d'entreprise.
- `crm` : contacts, activités, contrats et échéances.
- `liaison` : réponses du SAV et du recouvrement (oui/non, une phrase).

## Étapes

1. **Lister les interlocuteurs** et classer chacun : fonction ; rôle dans la décision (relais interne, décideur
   financier, évaluateur, influenceur, opposant, inconnu) ; engagement (actif : rencontré il y a moins de 14 jours, tiède,
   froid, jamais rencontré) ; position (favorable, neutre, défavorable, inconnue) ; preuve (dernier rendez-vous,
   courriel, citation datée).
2. **Appliquer les règles de classement** : « relais interne » seulement pour une personne qui a agi (introduction,
   information interne partagée, réunion obtenue), pas pour un avis favorable exprimé une fois ; « inconnu » plutôt que
   deviner.
3. **Repérer les manques** : rôles sans personne identifiée (décideur financier, gestionnaire des risques, direction),
   nombre de personnes réellement actives sur 30 jours (risque d'interlocuteur unique), contacts présents aux réunions
   mais absents du CRM.
4. **Évaluer la santé en cinq dimensions**, chacune vert, jaune ou rouge avec son signal : relation (étendue et niveau
   des contacts actifs) ; tendance d'engagement (rendez-vous et échanges par rapport à la période précédente) ;
   commercial (échéances proches, primes échues signalées par la liaison, extension en cours) ; support (réclamation ou
   sinistre ouvert signalé par la liaison) ; valeur rendue (résultats documentés par rapport à ce qui était attendu).
5. **Rendre un verdict global** vert, jaune ou rouge, porté par une ou deux dimensions nommées.
6. **Décrire le potentiel** à partir de faits du dossier (nouvelle activité, croissance, site ajouté), étiqueté « à
   confirmer », sans recommandation de produit.
7. **Proposer les démarches** (qui, quoi, quand) : élargir les contacts, revue annuelle, préparation du renouvellement.
   Chaque démarche vers le client est une carte de décision.

## Livrable

Plan de compte : carte des interlocuteurs (tableau), manques et chemins d'accès proposés, tableau de santé en cinq
dimensions avec verdict, potentiel à confirmer, démarches proposées, contacts à créer dans le CRM (proposition).

## Critères de réussite

- Chaque rôle, position et engagement porte une preuve datée ; sinon « inconnu ».
- Le verdict de santé nomme les dimensions qui le portent.
- Le risque d'interlocuteur unique est évalué explicitement.
- Aucune démarche vers le client, aucune écriture CRM sans carte.

## Sources officielles

Consultées le 17/10/2026 :

- Règlement (UE) 2016/679 (RGPD), art. 5 § 1, c (minimisation) et art. 6 § 1, f (intérêt légitime),
  https://eur-lex.europa.eu/eli/reg/2016/679/oj (texte officiel non relu le 17/10/2026 : EUR-Lex renvoie une page de vérification antirobot, non contournée ; référence d'article à vérifier) : la carte ne contient que des informations professionnelles utiles à la
  relation ; aucune donnée sur la vie privée des interlocuteurs.
- « Banque-Carrefour des Entreprises (BCE) », portail e-Justice de la Commission européenne,
  https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/be_fr : fonctions
  publiées des dirigeants.

## À vérifier par un professionnel

- Une appréciation écrite sur une personne (position « défavorable ») est une donnée personnelle accessible à cette
  personne sur demande (droit d'accès) : formulation factuelle à faire valider par le délégué à la protection des données.

## Limites

- La compétence ne lit pas les dossiers des autres services : elle utilise les réponses bornées de la liaison.
- Sans historique dans le CRM, la santé est « non évaluable » sur les dimensions concernées.
- Le potentiel n'est pas un besoin : l'analyse des besoins d'assurance reste celle de l'intermédiaire.

## Exemple

Cas nominal : client PME, quatre contacts. Seule la responsable administrative est active (dernier rendez-vous il y a 9
jours) ; le gérant, décideur financier, n'a pas été rencontré depuis 14 mois. Santé : relation rouge (interlocuteur
unique), commercial jaune (échéance dans 70 jours), support vert (liaison SAV : aucun dossier ouvert). Verdict jaune
porté par la relation et l'échéance. Démarche proposée : demander une revue annuelle avec le gérant, en carte.

Cas d'échec évité : un comptable externe a dit « votre offre me paraît bonne » en réunion. L'agent ne le classe pas
« relais interne » : position favorable, rôle influenceur, engagement tiède, preuve citée.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `sales/skills/stakeholder-map/SKILL.md`,
étapes 3 et 4 (rôle, engagement, position, preuve ; relais seulement s'il a agi ; « inconnu » plutôt que deviner ; rôles
manquants et interlocuteur unique) et `sales/skills/customer-health/SKILL.md`, étape 3 (cinq dimensions, verdict porté
par une ou deux dimensions), commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications :
réécriture en français, liaison entre services, RGPD, carte de décision. Texte de la licence et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
