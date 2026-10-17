---
name: "inventaire-obligations-conformite"
description: "Construit et tient l'inventaire des obligations de conformité d'une PME belge : chaque obligation reliée à son texte source, au contrôle interne qui la couvre, à son responsable, à la preuve attendue (quoi, où, date de dernière collecte), au calendrier des échéances et des audits, puis l'analyse des écarts priorisée avec un plan de correction. À utiliser pour préparer un contrôle, faire le point sur la conformité ou suivre les preuves ; jamais pour déclarer l'entreprise conforme, accepter un écart ni répondre à une autorité."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "conformite"
---

# Inventaire des obligations de conformité

## Quand l'utiliser

- La direction demande « où en sommes-nous de nos obligations ? ».
- Un contrôle (autorité de surveillance, assureur, client) approche et les preuves sont dispersées.
- Une nouvelle obligation issue de la veille doit être intégrée au suivi.

## Objectif

Un tableau unique où chaque obligation a sa source officielle, son contrôle, son responsable, sa preuve datée et son
échéance, et une liste d'écarts priorisée que l'humain accepte ou fait corriger.

## Prérequis

- La liste des domaines applicables à l'entreprise (protection des données, lutte contre le blanchiment, distribution
  d'assurances, cybersécurité, lanceurs d'alerte, etc.), validée par le responsable conformité.
- Les procédures et preuves existantes, ou leur emplacement.
- Les fiches de veille réglementaire récentes.

## Entrées

- `domaines` : liste validée.
- `obligations_connues` : texte, article, résumé.
- `controles_existants` : procédures, responsables, preuves et dates.
- `calendrier` : contrôles annoncés, échéances légales.

## Étapes

1. **Inventaire des contrôles** : pour chaque obligation, le texte et l'article sources (officiels), le contrôle
   interne qui la couvre, son responsable et son efficacité constatée.
2. **Gestion des preuves** : quelle preuve démontre le contrôle, où elle est conservée, quand elle a été collectée pour
   la dernière fois, prochaine collecte. Une preuve absente est écrite « preuve manquante », jamais supposée.
3. **Calendrier** : échéances légales, contrôles et audits annoncés, dates de collecte des preuves, dates de correction.
4. **Analyse des écarts** : exigence, situation actuelle, écart, gravité (élevée, moyenne, faible), correction
   proposée, responsable, échéance ; trier par gravité puis échéance.
5. **Relier à la veille** : chaque nouvelle obligation issue de `veille-reglementaire` entre dans l'inventaire avec sa
   date d'application.
6. **Préparer les cartes** : acceptation d'un écart, plan de correction, priorités.

## Livrable

Le tableau d'inventaire (obligation, source, contrôle, responsable, preuve, dernière collecte, prochaine échéance),
le calendrier, la liste des écarts priorisée et les cartes de décision.

## Critères de réussite

- Chaque obligation cite une source officielle et un article, ou est marquée « source à vérifier ».
- Chaque contrôle a une preuve identifiée et datée, ou la mention « preuve manquante ».
- Aucun écart n'est présenté comme accepté sans décision humaine.

## À vérifier par un professionnel

- La liste des domaines applicables et l'interprétation de chaque obligation : responsable conformité ou juriste.
- Les échéances fixées par une autorité de surveillance : sur la source officielle de cette autorité.

## Limites

- La compétence ne déclare jamais l'entreprise « conforme » : elle décrit l'état des contrôles et des preuves.
- Les cadres étrangers (normes américaines) ne sont pas repris ; une norme volontaire (ISO) n'est suivie que si
  l'entreprise s'y est engagée.

## Exemple

Courtier en assurances, domaines validés : RGPD, lutte contre le blanchiment, règles de conduite FSMA, lanceurs
d'alerte. Écarts : registre des traitements daté de 2024 (moyen, mise à jour avant le 31/12) ; aucune preuve de la
dernière formation anti-blanchiment du personnel (élevé, preuve manquante) ; procédure de signalement sans preuve de
consultation des partenaires sociaux (moyen, question au juriste).

Cas d'échec : l'agent marque « conforme » le contrôle anti-blanchiment parce qu'une procédure existe. Une procédure sans
preuve d'application n'est pas un contrôle démontré.

## Origine de la méthode

Méthode adaptée de github.com/anthropics/knowledge-work-plugins, `operations/skills/compliance-tracking/SKILL.md`
(inventaire des contrôles, calendrier, gestion des preuves, analyse des écarts), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Non repris : cadres américains (SOC 2, HIPAA).
Modifications : français, sources officielles belges et européennes, aucune déclaration de conformité. Liste des
reprises : `organisation/skills/LICENCES-TIERS.md`.
