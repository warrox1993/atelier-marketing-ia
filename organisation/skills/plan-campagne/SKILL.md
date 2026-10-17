---
name: "plan-campagne"
description: "Rédige le brief d'une campagne marketing en dix rubriques (vue d'ensemble et objectif mesurable, public, messages clés avec preuves, canaux, calendrier par semaine avec dépendances, pièces à produire, indicateurs, budget si fourni, risques, prochaines étapes), adapté à une PME belge (langues FR, NL ou EN, mentions réglementées, consentements). À utiliser par le coordinateur marketing pour cadrer une campagne avant de créer les sous-tâches ; jamais pour engager un budget, publier ou présenter le plan comme validé sans l'accord de l'humain."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "marketing"
---

# Plan de campagne

## Quand l'utiliser

- L'humain demande une campagne (lancement, promotion saisonnière, notoriété locale, relance de clients).
- Une demande vague doit devenir un plan vérifiable avant de répartir le travail entre les rôles.
- Une campagne en cours doit être replanifiée.

## Objectif

Un brief court et complet qui dit quoi obtenir, auprès de qui, avec quel message, par quels canaux, quand et comment on
saura si ça a marché, et qui sert de base aux exigences REQ-xxx et aux sous-tâches.

## Prérequis

- La fiche de l'entreprise et la charte de marque.
- La demande de l'humain, recopiée telle quelle.
- Le budget s'il est donné ; sinon, le plan ne propose aucun montant.

## Entrées

- `demande` : texte de l'humain.
- `contexte` : offres, zone, publics, langues, résultats des campagnes passées s'ils existent.
- `budget` : montant et période, ou « non fourni ».

## Étapes

1. **Vue d'ensemble** : nom proposé, résumé en une phrase, objectif principal mesurable (indicateur, valeur cible,
   date), objectifs secondaires.
2. **Public** : segment principal et secondaire, problèmes et motivations, lieux où il se trouve (canaux, médias
   locaux), étape d'achat visée (découverte, considération, décision), langues (FR, NL, EN selon la zone).
3. **Messages clés** : message central en une phrase, trois ou quatre messages d'appui, déclinaisons par canal, et
   pour chaque message sa preuve. Une affirmation sans preuve (superlatif, chiffre, garantie) est retirée ou envoyée au
   rôle Conformité publicitaire.
4. **Canaux** : propres (site, courriel, réseaux sociaux), gagnés (presse, partenaires, communauté), payants (liens
   sponsorisés, publicité sociale) ; pour chacun, pourquoi il convient, format, effort (faible, moyen, élevé) et part du
   budget si un budget est fourni.
5. **Calendrier** par semaine (ou par jour pour une campagne courte) : pièce, canal, rôle responsable, jalon et
   dépendances (par exemple : la page d'atterrissage avant les annonces payantes).
6. **Pièces à produire** : nom, type, contenu attendu, priorité (indispensable ou souhaitable), délai ; chaque pièce
   deviendra une sous-tâche.
7. **Indicateurs** : un indicateur principal avec sa cible, trois à cinq secondaires, comment chacun est mesuré
   (compétence `mesure-experiences`) et à quel rythme il est rapporté.
8. **Budget** (seulement s'il est fourni) : répartition par canal, production et diffusion, réserve de 10 à 15 %.
9. **Risques** : deux ou trois (délai, public mal choisi, canal décevant, règle sectorielle), chacun avec sa parade.
10. **Prochaines étapes** : actions de lancement, validations humaines requises (plan, budget, chaque publication),
    points de décision.

## Livrable

Le brief en dix rubriques, suivi de la liste des exigences REQ-xxx qui en découlent et des validations humaines
attendues ; le plan est marqué « proposé » jusqu'à l'accord écrit de l'humain.

## Critères de réussite

- L'objectif principal est mesurable et daté.
- Chaque message clé a sa preuve ou est retiré.
- Le calendrier montre les dépendances entre pièces.
- Aucun montant n'est proposé sans budget fourni ; aucune publication ni dépense n'est présentée comme décidée.

## Sources officielles

Consulté le 17/10/2026 :

- Code de droit économique, livre VI, texte consolidé sur Justel,
  https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=2013022819&table_name=loi : art. VI.110
  (communications non souhaitées : appels automatisés et télécopie soumis au consentement, identité de l'annonceur
  jamais dissimulée) et VI.112 (liste « Ne m'appelez plus ! ») ; un canal téléphonique dans le plan exige ce contrôle
  (compétence `recherche-prospects`).

## À vérifier par un professionnel

- Mentions obligatoires d'une publicité sur un produit d'assurance ou financier (règles FSMA) : contrôle par le rôle
  Conformité publicitaire, puis juriste ou responsable conformité au moindre doute.
- Courriel et SMS de prospection : consentement préalable (CDE art. XII.13), à vérifier pour chaque fichier.

## Limites

- Le plan ne prévoit pas le résultat : les cibles sont des hypothèses à confirmer par la mesure.
- Sans historique de campagne, les ordres de grandeur restent des estimations signalées.

## Exemple

Cas nominal : courtier à Liège, campagne « assurance habitation des jeunes propriétaires », avril et mai. Objectif : 40
demandes de rendez-vous qualifiées au 31/05 (formulaire du site). Public : primo-acquéreurs de la province, FR.
Message central : « Un courtier près de chez vous relit votre contrat avant la signature chez le notaire. » Preuve :
service décrit sur la fiche. Canaux : fiche d'établissement et site (propres), notaires partenaires (gagné), annonces
locales (payant, seulement si budget). Dépendance : la page du formulaire est en ligne avant la première annonce.

Cas d'échec évité : la demande dit « dis que nous sommes les moins chers ». Le message est retiré et transmis à la
Conformité publicitaire comme affirmation à preuve obligatoire.

## Origine de la méthode

Structure du brief en dix rubriques adaptée et traduite de github.com/anthropics/knowledge-work-plugins,
`marketing/skills/campaign-plan/SKILL.md`, section « Campaign Brief Structure », commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : traduction, langues et mentions belges,
preuve exigée pour chaque message, validations humaines. Texte des licences et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
