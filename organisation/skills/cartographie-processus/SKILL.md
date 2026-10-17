---
name: "cartographie-processus"
description: "Cartographie un processus administratif ou de service d'une PME (état actuel avec étapes, décisions, transferts, durées de traitement et d'attente), repère les gaspillages (attentes, reprises, transferts, surtraitement, travail manuel répétitif), propose un état futur et mesure le gain (temps, erreurs, coût) avant et après. À utiliser quand un processus est lent, source d'erreurs ou mal compris, ou avant de rédiger une procédure ; jamais pour imposer un changement de processus, supprimer un contrôle exigé par la loi ou juger une personne."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "qualite"
---

# Cartographie et amélioration d'un processus

## Quand l'utiliser

- Un processus de bureau (déclaration de sinistre, devis, facturation, accueil) est jugé lent ou source d'erreurs.
- Une procédure doit être écrite et personne ne sait décrire le processus de bout en bout.
- Une amélioration a été faite et son gain doit être mesuré.

## Objectif

Une carte fidèle de ce qui se fait réellement, la liste chiffrée de ce qui fait perdre du temps ou provoque des erreurs,
et un état futur dont le gain est mesuré, présenté à l'humain qui décide du changement.

## Prérequis

- Le déclencheur et le résultat du processus, les fonctions qui y participent.
- Des relevés de durées ou un échantillon de dossiers (dates d'entrée et de sortie à chaque étape). À défaut, des
  estimations marquées comme telles.

## Entrées

- `processus` : nom, déclencheur, résultat.
- `releves` : durées, volumes, taux d'erreur ou de reprise, datés.
- `contraintes` : contrôles exigés par la loi, la conformité ou un client.

## Étapes

1. **Cartographier l'état actuel** : chaque étape, chaque décision, chaque transfert entre personnes ou services ; pour
   chaque étape, qui la fait, avec quel outil, durée de traitement et durée d'attente ; approbations et étapes
   manuelles signalées.
2. **Repérer les gaspillages** : attentes (files, approbations), reprises (étape refaite après erreur), transferts
   (chaque passage de main est un risque de perte ou de délai), surtraitement (étape sans valeur pour le client ni
   pour une obligation), travail manuel répétitif (ressaisie, copier-coller). Chiffrer chacun quand les relevés le
   permettent.
3. **Concevoir l'état futur** : supprimer les étapes inutiles, réduire les transferts, paralléliser ce qui est
   indépendant, automatiser ce qui est répétitif, placer des points de contrôle plutôt que des barrières. Un contrôle
   exigé par la loi, la conformité ou un client n'est jamais supprimé : il est déplacé ou simplifié avec l'accord de
   son propriétaire.
4. **Estimer puis mesurer le gain** : temps par dossier, délai total, taux d'erreur ou de reprise, coût ; même
   indicateur et même méthode avant et après, sur des périodes comparables.
5. **Préparer la décision** : comparaison avant et après, plan de mise en œuvre, personnes concernées à consulter,
   procédure à réviser (compétence `procedure-qualite`), et pour un problème de flux plus large la démarche
   d'amélioration continue (compétence `amelioration-continue-lean`).

## Livrable

La carte de l'état actuel (tableau des étapes avec durées), le tableau des gaspillages chiffrés, la carte de l'état
futur, la comparaison avant et après avec la source des chiffres et le plan de mise en œuvre soumis à décision.

## Critères de réussite

- Chaque durée est relevée ou marquée « estimation ».
- Chaque gaspillage est rattaché à une étape et, si possible, chiffré.
- Aucun contrôle obligatoire n'est supprimé.
- Le gain est mesuré avec la même méthode avant et après.

## Limites

- Sans relevé, la carte reste qualitative et le gain une estimation.
- La compétence ne couvre pas les processus de production industrielle (voir `amelioration-continue-lean`).

## Exemple

Cas nominal : déclaration de sinistre habitation, 30 dossiers relevés. État actuel : 9 étapes, 4 transferts, délai
médian 6 jours dont 4,5 jours d'attente ; 23 % des dossiers repris pour une pièce manquante. État futur : liste de
pièces envoyée au client dès l'ouverture, contrôle de complétude à l'entrée, un transfert de moins. Gain mesuré sur les
30 dossiers suivants : délai médian 3 jours, reprises 8 %.

Cas d'échec évité : supprimer la vérification d'identité du client « pour gagner une journée ». Le contrôle est gardé et
signalé comme obligation de conformité.

## Origine de la méthode

Cartographie de l'état actuel, cinq gaspillages, conception de l'état futur et mesure de l'effet adaptés et traduits de
github.com/anthropics/knowledge-work-plugins, `operations/skills/process-optimization/SKILL.md`, section « Analysis
Framework », commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : traduction, contrôles
obligatoires protégés, décision humaine. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
