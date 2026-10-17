---
name: "inventaire-systemes-ia"
description: "Tient l'inventaire des systèmes d'intelligence artificielle utilisés ou fournis par une PME belge et prépare, pour chacun, le classement provisoire selon le règlement européen sur l'IA (pratique interdite, haut risque, obligation de transparence, risque minimal), le rôle de l'entreprise (fournisseur, déployeur, importateur, distributeur) et la liste des obligations qui en découlent. À utiliser avant d'adopter un outil d'IA, pour faire l'inventaire existant ou préparer une mise en service ; jamais pour décider du classement définitif, mettre en service un système à haut risque ni signer une déclaration de conformité."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "conformite"
---

# Inventaire des systèmes d'IA

## Quand l'utiliser

- Un service veut adopter un outil qui « utilise l'IA » (tri de candidatures, assistant de rédaction, analyse de
  documents, notation de clients).
- La direction veut savoir quels systèmes d'IA sont utilisés dans l'entreprise.
- Un système classé à haut risque doit être mis en service.

## Objectif

Un inventaire où chaque système a sa finalité, son fournisseur, son rôle pour l'entreprise, un classement provisoire
argumenté et la liste des obligations correspondantes, pour que l'humain responsable décide de l'adoption ou de la
mise en service, avec avis juridique pour tout cas à haut risque ou incertain.

## Prérequis

- Pour chaque système : finalité, utilisateurs, personnes concernées, données utilisées, degré d'autonomie, contexte
  d'usage, fournisseur et documentation du fournisseur.
- Le texte du règlement (UE) 2024/1689 à relire sur EUR-Lex pour toute citation d'article et toute date.

## Entrées

- `systemes` : fiches descriptives.
- `role_entreprise` : l'entreprise met-elle le système sur le marché sous son nom, l'utilise-t-elle sous sa propre
  autorité, l'importe-t-elle ou le distribue-t-elle ?

## Étapes

1. **Poser d'abord les questions préalables** : la pratique est-elle interdite (notation sociale, reconnaissance des
   émotions au travail ou à l'école, techniques subliminales manipulatrices, certaines identifications biométriques) ?
   Le système entre-t-il dans une catégorie à haut risque de l'annexe III (biométrie, infrastructures critiques,
   éducation, emploi et gestion des travailleurs, accès aux services essentiels, répression, migration, justice) ou
   est-il un composant de sécurité d'un produit réglementé ? Quel est le rôle de l'entreprise ? S'agit-il d'un modèle
   d'IA à usage général ?
2. **Classer provisoirement** dans un seul niveau : interdit, haut risque, transparence (dialogue avec une personne,
   contenu généré ou modifié), risque minimal. Pour un cas de l'annexe III, examiner les exceptions prévues (tâche
   procédurale étroite, amélioration d'un travail humain déjà fait, détection de schémas sans remplacer l'évaluation
   humaine, tâche préparatoire), en rappelant qu'un système qui fait du profilage de personnes reste à haut risque.
3. **Déterminer les rôles** : fournisseur, déployeur, importateur, distributeur ; une entreprise qui modifie
   substantiellement un système à haut risque ou le met sur le marché sous son nom devient fournisseur.
4. **Lister les obligations selon le rôle** : pour un déployeur d'un système à haut risque, notamment usage conforme à
   la notice, contrôle humain, qualité des données d'entrée qu'il maîtrise, conservation des journaux, information des
   travailleurs ; pour un fournisseur, évaluation de conformité, documentation technique, gestion des risques,
   surveillance après mise sur le marché. Chaque obligation est citée « à vérifier » sur EUR-Lex.
5. **Relier au RGPD** : si des données personnelles sont traitées, signaler l'analyse d'impact possible et
   l'inscription au registre des traitements.
6. **Préparer la carte de décision** : adoption, refus, mise en service, recours au juriste.

## Livrable

L'inventaire (système, finalité, fournisseur, rôle, classement provisoire, raisonnement, obligations, statut) et, pour
chaque système à haut risque ou incertain, une note de classement avec les questions au juriste.

## Critères de réussite

- Les questions préalables sont posées avant tout classement.
- Chaque classement est motivé par la catégorie et les faits ; un doute est écrit « incertain », jamais tranché.
- Toute citation d'article ou de date est marquée « à vérifier sur EUR-Lex ».

## À vérifier par un professionnel

- Le classement définitif, les exceptions de l'annexe III et les obligations applicables : juriste.
- Les dates d'application des différentes obligations du règlement : texte officiel sur EUR-Lex, qui n'a pas pu être
  ouvert le 17/10/2026 (page protégée contre les robots).

## Limites

- La compétence ne teste pas les systèmes et ne vérifie pas les déclarations du fournisseur.
- Elle n'utilise aucun script de classement automatique : le classement est un raisonnement écrit, relu par l'humain.

## Exemple

Outil de présélection de CV proposé par un fournisseur. Questions préalables : pratique non interdite ; annexe III,
emploi (recrutement et sélection) ; rôle : déployeur. Classement provisoire : haut risque, aucune exception applicable
car le système classe des personnes. Obligations du déployeur à lister (contrôle humain, information des candidats et
des travailleurs, journaux) ; RGPD : analyse d'impact probable. Carte : recours au juriste avant toute adoption.

Cas d'échec : l'agent classe l'outil « risque minimal » parce que « l'humain décide à la fin ». Le tri préalable de
candidats reste dans la catégorie de l'emploi ; la présence d'un humain en bout de chaîne ne suffit pas à l'en sortir.

## Origine de la méthode

Méthode adaptée de github.com/alirezarezvani/claude-skills, `ra-qm-team/skills/eu-ai-act-specialist/SKILL.md` (« Key
Questions », « AI System Risk Classification », « Per-Role Obligation Tracker »), commit
19392f7a08264ed00486a251f5b2098321771f94, licence MIT, Copyright (c) 2025 Alireza Rezvani. Non repris : les scripts de
classement et de planification. Modifications : français, citations marquées à vérifier sur EUR-Lex, aucune décision
de mise en service. Liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
