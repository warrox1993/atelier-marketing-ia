---
name: "accident-du-travail"
description: "Prépare le dossier administratif et l'analyse d'un accident du travail dans une PME belge : premiers gestes administratifs, projet de déclaration à l'assureur, fiche d'accident, analyse des causes, mesures correctives, avec les délais à vérifier. À utiliser après un accident, quand les secours sont déjà passés, pour préparer les documents que l'employeur et le conseiller en prévention valideront ; jamais pour déclarer soi-même, décider d'une responsabilité, ni traiter un blessé ou une situation encore dangereuse."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "hse"
---

# Accident du travail : dossier et analyse des causes

## Quand l'utiliser

- Un accident est survenu sur le lieu ou le chemin du travail et la personne a reçu les soins nécessaires.
- L'employeur doit préparer la déclaration à l'assureur et la fiche d'accident.
- Une analyse des causes est demandée pour éviter la répétition.

## Objectif

Un dossier prêt à relire : chronologie des faits sans nom ni donnée de santé, projet de déclaration, analyse des causes, mesures correctives proposées, liste des délais à vérifier avec leur date limite calculée. L'employeur et le conseiller en prévention valident ; l'humain déclare.

## Prérequis

- Les secours ont été faits et le danger est écarté. Si ce n'est pas le cas, la compétence s'arrête et un humain est alerté.
- L'identité de l'assureur accidents du travail de l'entreprise et la date exacte de l'accident.
- Le nom du conseiller en prévention et du service de prévention et de protection au travail.

## Entrées

- `faits` : date, heure, lieu, activité en cours, description factuelle, témoins par fonction.
- `gravite_declaree` : ce qu'un humain a indiqué (incapacité, décès, pas d'incapacité), jamais déduit.
- `documents` : formulaire d'assureur, extraits du registre des accidents anonymisé, analyse de risques du poste.

## Étapes

1. **Vérifier la sécurité** : confirmer par un humain que la zone est sécurisée. Sans cette confirmation, s'arrêter.
2. **Qualifier le cas avec un humain** : accident sur le lieu ou sur le chemin du travail, gravité annoncée. Un accident grave (incapacité permanente ou décès) déclenche un signalement immédiat à l'inspection régionale du contrôle du bien-être au travail, qui est un acte humain à vérifier avec le conseiller en prévention.
3. **Calculer les délais à vérifier** : déclaration électronique à l'assureur dans les huit jours de l'accident (DRS scénario 1, à vérifier) ; fiche d'accident si l'incapacité est d'au moins quatre jours (à vérifier) ; la déclaration à l'assureur peut tenir lieu de fiche si elle contient toutes les données. Écrire chaque date limite en toutes lettres, avec la mention « à vérifier ».
4. **Reconstituer les faits** : chronologie en phrases courtes, sourcée, sans nom, sans diagnostic, sans jugement sur la personne.
5. **Analyser les causes** : de l'événement vers ses causes en demandant « pourquoi » à chaque niveau, jusqu'à des causes sur lesquelles l'entreprise peut agir. Passer en revue six familles : personnes (formation, charge, communication), équipements (entretien, état), méthodes (procédure, consigne absente ou floue), matériaux et produits, mesures et contrôles, milieu (sol, éclairage, météo, encombrement). Distinguer fait, inférence et hypothèse.
   **Valider la cause retenue** avant de proposer une mesure, en cochant ou en expliquant chacun des cinq points : elle est prouvée par un élément objectif ; la supprimer empêcherait la récurrence ; elle est maîtrisable par l'entreprise ; elle explique tous les faits constatés ; aucune autre cause importante ne reste sans traitement. Un point non validé est écrit, jamais passé sous silence.
6. **Proposer des mesures** dans l'ordre de prévention (voir `analyse-risques-poste`), avec responsable et échéance proposés, et lier l'accident à une mise à jour de l'analyse du poste.
7. **Préparer le projet de déclaration et de fiche** à partir des faits ; les champs inconnus restent vides avec « information manquante ».
8. **Remettre le dossier** à l'employeur et au conseiller en prévention avec les décisions attendues : déclarer, signaler, appliquer les mesures.

## Livrable

- Chronologie anonymisée des faits.
- Tableau des délais avec date limite calculée et mention « à vérifier ».
- Projet de déclaration à l'assureur et projet de fiche d'accident (brouillons).
- Analyse des causes et mesures proposées.
- Liste des informations manquantes et des décisions humaines.

## Critères de réussite

- Aucune donnée de santé ni nom dans le dossier ; la victime est désignée par sa fonction.
- Chaque délai est daté et marqué à vérifier ; aucun n'est présenté comme définitif.
- L'analyse remonte jusqu'à des causes actionnables, pas seulement « erreur humaine ».
- La déclaration n'est jamais envoyée par la compétence.

## Sources officielles

Consultées le 16/10/2026 :

- « Accidents du travail », SPF Emploi, Travail et Concertation sociale, https://emploi.belgique.be/fr/themes/bien-etre-au-travail/accidents-du-travail : accident grave (incapacité permanente ou décès) à signaler immédiatement à la division régionale du contrôle du bien-être au travail, avec service de garde téléphonique hors heures ouvrables ; fiche d'accident pour une incapacité d'au moins quatre jours (article I.6-12 du Code du bien-être au travail), la déclaration à l'assureur pouvant la remplacer si elle contient toutes les données ; assurance obligatoire auprès d'un assureur agréé.
- « Obligations employeur : accidents du travail », Portail de la sécurité sociale, https://www.socialsecurity.be/employer/instructions/dmfa/fr/latest/instructions/obligations/obligations_branches/workaccidents.html : déclaration électronique DRS scénario 1 dans un délai de huit jours pour un accident sur le lieu ou le chemin du travail ; déclaration papier possible auprès de Fedris. La page ne cite pas d'article de loi.

## À vérifier par un professionnel

Les délais, le formulaire de l'assureur, la qualification de l'accident (lieu, chemin, gravité) et le signalement à l'inspection relèvent du conseiller en prévention, du secrétariat social ou de l'assureur. Toute question de responsabilité ou de contestation relève d'un juriste ou d'un avocat.

## Limites

- Aucune déclaration, aucun signalement, aucun contact avec l'assureur ou l'inspection n'est fait par la compétence.
- Pas de conclusion sur la faute d'une personne ; l'analyse porte sur le système de travail.
- Les données de santé n'entrent pas dans le dossier ; elles restent entre la personne, son médecin et les organismes compétents.
- La liste des délais n'est pas exhaustive (maladie professionnelle, élèves et stagiaires, cas transfrontaliers).

## Exemple

Un opérateur de la ligne de conditionnement a subi une coupure à la main lors du changement de lame le mardi 6 octobre 2026 ; soins faits ; incapacité annoncée par l'employeur : pas encore connue.

Délais : déclaration à l'assureur au plus tard le mercredi 14 octobre 2026 (huit jours à compter du lendemain, à vérifier) ; fiche d'accident à décider selon la durée d'incapacité. Chronologie : « Mardi 6 octobre, vers 10 h, un opérateur change la lame de la ligne 2, machine arrêtée mais protecteur démonté (source : rapport du chef d'équipe). » Causes : procédure de changement non écrite (fait), absence de consignation de la machine (hypothèse à vérifier). Mesures proposées : procédure de changement de lame et protecteur fixe, responsable et échéance proposés.

Cas d'échec : la tâche arrive avec le certificat médical du blessé et la demande « indique qui est responsable ». La compétence ne recopie pas le certificat, n'écrit aucune responsabilité individuelle, signale que la question relève d'un juriste ou de l'assureur, et poursuit avec l'analyse des causes du système de travail. Si la machine n'est pas encore consignée et que d'autres personnes y travaillent, elle s'arrête et fait alerter un humain.

## Origine de la méthode

Six familles de causes et liste de validation de la cause adaptées et traduites de github.com/alirezarezvani/claude-skills,
`ra-qm-team/skills/capa-officer/SKILL.md`, sections « Fishbone Diagram Categories (6M) » et « Root Cause Validation »,
commit 19392f7a08264ed00486a251f5b2098321771f94, licence MIT, Copyright (c) 2025 Alireza Rezvani. Modifications :
traduction, transposition à l'accident du travail. Texte des licences et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
