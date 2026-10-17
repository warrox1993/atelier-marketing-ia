---
name: "audit-interne"
description: "Prépare et documente un audit interne dans une PME belge : programme et plan d'audit, liste de contrôle tirée de la procédure auditée, classement des constats (conformité, point sensible, écart mineur, écart majeur) avec preuve, rapport et suivi des actions, selon les principes de l'audit des systèmes de management (ISO 19011). À utiliser pour auditer une procédure, un processus ou un service par rapport à ses propres règles ; jamais pour auditer son propre travail, évaluer des personnes, certifier une conformité ni conclure sans preuve observée."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "qualite"
---

# Audit interne d'une PME belge

## Quand l'utiliser

- L'entreprise veut vérifier que ce qui est écrit dans une procédure est réellement appliqué.
- Un audit annuel ou ponctuel doit être planifié, mené et rapporté.
- Des non-conformités se répètent et on veut savoir si la cause est systémique.

## Objectif

Un audit dont chaque constat repose sur une preuve observable (document vu, enregistrement consulté, geste observé, propos recueilli), classé selon une échelle écrite à l'avance, avec un rapport lisible et des actions suivies jusqu'à vérification.

## Prérequis

- Le périmètre : processus, service, période couverte.
- Le référentiel d'audit : les procédures de l'entreprise, les exigences du contrat ou de la loi retenues pour cet audit (jamais le texte de la norme lui-même, payant).
- Un auditeur indépendant de l'activité auditée (un service ne s'audite pas lui-même).
- L'accord de la direction et la disponibilité des personnes à interroger.

## Entrées

- `perimetre` : processus ou service, période.
- `referentiel` : procédures et exigences utilisées, avec leur version.
- `historique` : rapports d'audit et non-conformités précédents.
- `contraintes` : dates possibles, personnes absentes.

## Étapes

1. **Cadrer le programme** : objectifs (vérifier l'application, la maîtrise des risques, l'efficacité), fréquence selon l'importance du processus et les résultats précédents, auditeurs, ressources. Un processus déjà en difficulté est audité plus tôt. Fréquence par défaut selon le risque : élevé, trimestrielle (au moins 4 audits par an) ; moyen, semestrielle ; faible, annuelle.
   Indépendance de l'auditeur, vérifiée avant chaque désignation sur quatre points : il n'est pas responsable du
   processus audité ; il n'a pas de lien hiérarchique direct avec l'audité (il n'audite donc ni son propre processus ni
   celui de son supérieur direct) ; il n'a pas pris part récemment aux activités auditées ; sa qualification pour ce
   périmètre est documentée. Un auditeur qui ne passe pas les quatre points est remplacé.
2. **Préparer le plan d'audit** : date, durée, lieu, personnes (fonctions) à rencontrer, documents à demander, horaire, confidentialité. Le plan est envoyé à l'avance aux audités.
3. **Construire la liste de contrôle** à partir de la procédure : une question par exigence, formulée de façon ouverte (« montrez-moi le dernier enregistrement de... »), avec la preuve attendue. Ne pas inventer d'exigence absente du référentiel.
4. **Ouvrir la réunion** : rappeler objet, méthode, échelle des constats, confidentialité, déroulement.
5. **Recueillir les preuves** : observer, consulter, interroger, par échantillon (par exemple dix dossiers pris au hasard sur la période, pas ceux que l'audité propose). Noter la référence exacte de chaque preuve.
6. **Évaluer chaque point** avec l'échelle ci-dessous, en séparant le fait observé, l'exigence et l'écart.
7. **Faire la réunion de clôture** : présenter les constats avant le rapport, vérifier avec les audités qu'ils sont factuels, noter les désaccords.
8. **Rédiger le rapport** : périmètre, dates, auditeur, personnes rencontrées (fonctions), points forts, constats classés avec preuve, conclusion, actions demandées avec échéance.
9. **Suivre** : chaque écart ouvre un dossier de non-conformité (compétence `non-conformite-action-corrective`) ; l'audit n'est clos qu'après vérification d'efficacité de chaque action ou décision motivée de l'humain responsable.
10. **Mettre à jour le programme** : résultats, processus à ré-auditer, procédures à corriger (compétence `procedure-qualite`). Indicateurs du programme : respect du calendrier (audits faits à la date prévue), délai de clôture des constats, constats répétés d'un audit à l'autre.

### Échelle des constats

| Constat | Définition | Suite |
| --- | --- | --- |
| Conformité | l'exigence est appliquée, preuve à l'appui | aucune ; peut figurer comme point fort |
| Point sensible (observation) | pas encore un écart, mais un risque de dérive | à surveiller, action facultative |
| Écart mineur | un point isolé n'est pas respecté, sans effet direct sur le client ni sur la sécurité, ou le système reste maîtrisé | action corrective sous un délai court (par exemple 30 à 60 jours) |
| Écart majeur | une exigence n'est pas appliquée de façon répétée ou systémique, ou l'écart touche le client, la sécurité ou une obligation légale | action immédiate, escalade à la direction, délai court et suivi rapproché |

Les délais cités sont des repères de départ à fixer par la direction. En cas de doute entre deux niveaux, retenir le niveau inférieur et le dire, ou demander l'avis de l'humain responsable ; ne jamais surclasser pour impressionner.

### Qualités d'un bon constat

- Factuel : « 3 bons de livraison sur 10 n'ont pas de signature du client (n° ... à ... ) », pas « le personnel est négligent ».
- Référencé : la procédure et l'article concernés, la preuve.
- Relié à l'exigence : un écart sans exigence est une remarque, pas un écart.
- Impersonnel : jamais de nom d'un employé dans le rapport diffusé.

## Livrable

- Programme d'audit (fréquence, ordre des processus).
- Plan d'audit et liste de contrôle.
- Rapport d'audit : constats classés avec preuves, points forts, conclusion.
- Tableau de suivi des actions.
- Liste des points non vérifiés et des raisons.

## Critères de réussite

- Chaque constat a une exigence, une preuve et un niveau.
- L'auditeur n'a pas audité son propre travail.
- Les audités ont vu les constats avant le rapport.
- Le rapport ne nomme aucune personne ; il parle de fonctions.
- Chaque écart a une action, un responsable et une échéance.
- Les limites de l'audit (échantillon, absents) sont écrites.

## Sources officielles

Consultées le 16/10/2026 :

- « ISO 19011:2026, Lignes directrices pour l'audit des systèmes de management », AFNOR Boutique, https://www.boutique.afnor.org/fr-fr/norme/iso-190112026/lignes-directrices-pour-laudit-des-systemes-de-management/xs147111/599829 : la page décrit la norme (publiée en mai 2026, remplace l'édition 2018) comme lignes directrices sur les principes de l'audit, la gestion d'un programme d'audit et la conduite des audits de systèmes de management, applicable à toute organisation. Le texte est payant et n'est pas reproduit ici.
- « Les 7 principes fondamentaux ISO 9001 et le cycle PDCA », LRQA, https://www.lrqa.com/fr-fr/iso-9001/7-principes-fondamentaux-iso-9001/ : la phase « vérifier » du cycle repose sur des audits et des analyses ; la décision doit s'appuyer sur des données fiables. Source privée d'un organisme de certification.

Les pages de iso.org ont refusé l'accès automatisé : elles ne sont pas citées. L'échelle des constats (conformité, point sensible, mineur, majeur) et les délais indiqués sont des usages répandus, pas des textes officiels ; ils sont à adapter par la direction.

## À vérifier par un professionnel

- Un auditeur qualité qualifié ou l'organisme de certification si l'audit sert à préparer ou à maintenir une certification : seule l'édition en vigueur de la norme, achetée auprès du NBN ou d'un revendeur, fait foi.
- Le conseiller en prévention pour un audit touchant à la sécurité ou à la santé au travail.
- Un juriste ou le délégué à la protection des données pour un audit de la conformité au RGPD ou à une obligation légale : la compétence audite la conformité aux procédures de l'entreprise, pas l'exactitude de leur base légale.

## Limites

- Un audit repose sur un échantillon : l'absence de constat ne prouve pas l'absence d'écart.
- La compétence prépare, structure et rédige ; elle n'observe pas elle-même sur le terrain. Les preuves doivent lui être transmises par l'auditeur humain.
- Elle n'évalue pas les personnes, ne propose pas de sanction et ne certifie rien.
- Avec une équipe de moins de cinq personnes, le rapport peut rendre une personne reconnaissable : ne pas le diffuser largement sans accord de la direction.

## Exemple

Audit de la procédure « traitement des commandes » (v1.0, voir la compétence `procedure-qualite`), période septembre 2026, auditeur : responsable administratif, extérieur au service commercial. Échantillon : 10 commandes tirées au sort sur 64.

| Question | Preuve vue | Constat |
| --- | --- | --- |
| Commande enregistrée le jour de réception ? | 10 horodatages du logiciel | Conformité |
| Confirmation écrite du client si stock insuffisant ? | 3 cas concernés ; 1 confirmation écrite, 2 sans trace | Écart mineur (2 cas sur 3, effet limité, délai respecté) |
| Fiche de comptage jointe au colis ? | 4 fiches sur 10 | Écart majeur (répété, touche la livraison) |

Conclusion : processus partiellement maîtrisé ; deux dossiers de non-conformité ouverts, le majeur avec escalade à la direction sous 5 jours ouvrables.

Cas d'échec : l'audité propose cinq dossiers « bien tenus » à montrer. L'auditeur refuse l'échantillon fourni et tire lui-même les dix commandes. S'il ne peut pas le faire (accès au logiciel refusé), le rapport écrit « point non vérifié : accès aux données refusé » et ne conclut pas à la conformité. Règle : la compétence n'écrit pas « conforme » sur la base d'une déclaration orale seule.

## Origine de la méthode

Fréquence d'audit selon le risque, indépendance de l'auditeur et indicateurs du programme adaptés et traduits de
github.com/alirezarezvani/claude-skills, `ra-qm-team/skills/qms-audit-expert/SKILL.md`, sections « Risk-Based Audit
Frequency », « Auditor Independence » et « Audit Program Metrics », commit 19392f7a08264ed00486a251f5b2098321771f94,
licence MIT, Copyright (c) 2025 Alireza Rezvani ; les clauses ISO 13485 propres aux dispositifs médicaux ne sont pas
reprises. Modifications : traduction, adaptation à une PME. Texte des licences et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
