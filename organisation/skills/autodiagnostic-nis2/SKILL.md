---
name: "autodiagnostic-nis2"
description: "Aide une organisation belge à faire un premier autodiagnostic NIS2 (loi du 26 avril 2024) : est-elle probablement concernée selon son secteur et sa taille, comme entité essentielle ou importante, quelles obligations en découleraient (enregistrement, mesures de gestion des risques, notification des incidents, responsabilité de la direction) et par quoi commencer, en renvoyant au Centre pour la Cybersécurité Belgique (CCB) pour la qualification officielle. À utiliser dès qu'on parle de NIS2, de CyberFundamentals ou de Safeonweb@work ; jamais pour qualifier officiellement l'entité, enregistrer quoi que ce soit, notifier un incident ni décider de mesures techniques de sécurité."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "conformite"
---

# Autodiagnostic NIS2

Le diagnostic est indicatif : la qualification officielle et les obligations exactes se vérifient auprès du CCB, d'un
juriste ou d'un consultant spécialisé. Toute mesure technique de sécurité relève du service informatique et de l'agent
de sécurité, pas de la conformité.

## Quand l'utiliser

- Un dirigeant se demande si son entreprise est concernée par NIS2.
- Un client concerné par NIS2 impose des exigences de cybersécurité à ses fournisseurs.
- La conformité doit planifier les premières actions après une qualification probable.

## Objectif

Une conclusion provisoire argumentée (entité essentielle, importante, probablement hors champ ou incertain) avec son
niveau de confiance, les obligations qui s'appliqueraient et un plan de démarrage à 90 jours, sans aucune affirmation
non vérifiée sur les dates ou les sanctions.

## Prérequis

- L'activité précise (pas seulement le code NACE) et le pays d'établissement.
- L'effectif, le chiffre d'affaires annuel et le total du bilan, en tenant compte des entreprises liées ou partenaires.
- Les clients principaux et la situation actuelle en cybersécurité (responsable désigné, référentiel utilisé).

## Entrées

- `activite`, `effectif`, `chiffre_affaires`, `total_bilan`, `entreprises_liees`.
- `clients_principaux`, `situation_cyber`.
- Aucune information technique sensible (mot de passe, schéma réseau, vulnérabilité) : le diagnostic n'en a pas besoin.

## Étapes

1. **Examiner le secteur** : secteurs hautement critiques (annexe I : énergie, transports, banque, infrastructures des
   marchés financiers, santé, eau potable, eaux usées, infrastructures numériques, gestion des services TIC entre
   entreprises, administration publique, espace) et autres secteurs critiques (annexe II : services postaux, déchets,
   produits chimiques, denrées alimentaires hors commerce de détail, certaines fabrications, fournisseurs numériques,
   recherche). Dire quand le rattachement est incertain.
2. **Examiner la taille** : en règle générale, moyennes et grandes entreprises au sens de la recommandation européenne
   2003/361/CE (entreprises liées et partenaires comprises) ; certaines entités sont visées quelle que soit leur taille.
3. **En déduire une qualification probable** et un niveau de confiance (élevé, moyen, faible), avec le raisonnement.
4. **Si l'entité est probablement concernée, lister les obligations principales** : enregistrement auprès du CCB ;
   mesures de gestion des risques proportionnées (le CCB propose le cadre CyberFundamentals et reconnaît ISO/IEC 27001) ;
   notification des incidents significatifs au CCB (alerte précoce, notification, rapport final, délais à vérifier sur
   le site du CCB) ; responsabilité et formation des organes de direction ; supervision et évaluation selon la catégorie.
5. **Si l'entité est probablement hors champ**, le dire prudemment et signaler l'effet indirect possible par les
   exigences contractuelles de clients concernés.
6. **Proposer un plan de démarrage à 90 jours** : confirmation de la qualification, enregistrement si requis,
   responsable désigné, autoévaluation CyberFundamentals avec l'informatique, procédure de notification d'incident,
   sensibilisation de la direction.
7. **Incident en cours** : arrêter l'autodiagnostic et renvoyer immédiatement au coordinateur informatique et à la
   procédure d'incident ; rappeler que la notification au CCB est une décision humaine.

## Livrable

- `Conclusion provisoire` : qualification probable, niveau de confiance, raisons.
- `Analyse` : tableau critère, situation, effet sur la qualification.
- `Obligations qui s'appliqueraient` ou `Pourquoi vous pourriez être concerné indirectement`.
- `Plan de démarrage` : action, pourquoi, échéance proposée, responsable suggéré.
- `Questions à clarifier` et `Ressources officielles` (site du CCB, Safeonweb@work, CyberFundamentals).

## Critères de réussite

- La conclusion annonce en tête son caractère indicatif et son niveau de confiance.
- Aucune échéance ni aucun montant d'amende n'est cité sans source officielle vérifiée ce jour.
- Aucune information technique sensible n'est demandée.

## À vérifier par un professionnel

- La qualification, les délais de notification, les échéances d'enregistrement et d'évaluation : site du CCB
  (ccb.belgium.be) ; aucune de ces dates n'a été relue sur la source officielle le 17/10/2026.
- Le texte de la loi du 26 avril 2024 : juriste.

## Limites

- La compétence ne qualifie pas officiellement l'entité et ne s'enregistre nulle part.
- Elle ne choisit ni ne met en œuvre aucune mesure technique.

## Exemple

Courtier en assurances de 22 personnes, chiffre d'affaires 3 millions d'euros, aucune entreprise liée. Secteur :
l'intermédiation en assurances n'apparaît pas comme telle dans les annexes ; taille : petite entreprise. Conclusion
provisoire : probablement hors champ, confiance moyenne ; effet indirect possible si un assureur partenaire impose des
exigences contractuelles. Plan : démarche volontaire légère (autoévaluation CyberFundamentals de base avec
l'informatique), question au CCB si le doute persiste.

Cas d'échec : l'utilisateur décrit un rançongiciel en cours. L'agent ne poursuit pas le diagnostic : il renvoie
immédiatement à la procédure d'incident et au coordinateur informatique.

## Origine de la méthode

Reprise de github.com/warrox1993/skills-claude-entreprise, `plugins/entreprise-juridique/skills/autodiagnostic-nis2/SKILL.md`,
commit 474785fbcba8429cb034ef35fca20bbfcfd68554, licence MIT (même auteur que l'atelier). Modifications : rubriques de
l'atelier, dates et délais renvoyés au site du CCB, lien obligatoire avec le service informatique. Liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
