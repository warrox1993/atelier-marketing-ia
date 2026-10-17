---
name: "revue-de-direction-qualite"
description: "Prépare le dossier de la revue de direction qualité d'une PME : état des actions des revues précédentes, indicateurs de qualité et de satisfaction, résultats d'audits, état des non-conformités et actions correctives (ouvertes, en retard, efficacité, sources), changements à prendre en compte, ressources, risques, avec un statut vert, jaune ou rouge par rubrique et la liste des décisions attendues. À utiliser avant une revue de direction ou un comité qualité ; jamais pour prendre les décisions de la revue ni recopier le texte d'une norme payante."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "qualite"
---

# Revue de direction qualité

## Quand l'utiliser

- La revue de direction annuelle ou semestrielle approche.
- La direction veut un point sur la qualité avant de fixer ses priorités.
- Un audit de certification demande la preuve qu'une revue a eu lieu et a produit des décisions.

## Objectif

Un dossier court qui donne à la direction l'état réel du système qualité, chiffres sourcés, et qui lui dit clairement
ce qu'elle doit décider, pour que la revue se termine par des décisions et des actions suivies.

## Prérequis

- Le compte rendu et les actions de la revue précédente.
- Les indicateurs qualité de la période (réclamations, non-conformités, délais), les rapports d'audit, l'état des
  actions correctives, les résultats de satisfaction.
- La période couverte.

## Entrées

- `periode` : dates de début et de fin.
- `donnees` : indicateurs, rapports et registres, datés et sourcés.
- `changements` : évolutions internes ou externes (organisation, réglementation, clients, fournisseurs).

## Étapes

1. **Faire le point des actions de la revue précédente** : faite, en cours, en retard, abandonnée (avec la raison).
2. **Rassembler les entrées** : satisfaction et réclamations des clients ; atteinte des objectifs qualité ; performance
   des processus ; résultats des audits ; non-conformités et actions correctives (nombre ouvert par gravité et état,
   liste des retards avec leur responsable, tendance du délai de clôture et de l'efficacité, répartition par source :
   réclamations, audits, non-conformités) ; performance des fournisseurs ; ressources ; risques et opportunités ;
   changements à prendre en compte.
3. **Donner un statut par rubrique** : vert (conforme à l'objectif), jaune (écart à surveiller), rouge (écart qui
   demande une décision), avec la raison en une ligne. Une donnée absente est « donnée manquante », jamais 0.
4. **Lister les décisions attendues** : améliorations, besoins en ressources, changements du système qualité, chacune
   avec les options et la date limite proposée.
5. **Préparer le compte rendu type** : décisions, actions avec responsable et échéance, à remplir pendant la revue
   (compétence `compte-rendu-instances` pour le format des actions).

## Livrable

Un dossier de revue de deux à quatre pages : tableau des actions précédentes, tableau des rubriques avec statut et
chiffres sourcés, décisions attendues, trame du compte rendu.

## Critères de réussite

- Chaque chiffre porte sa source et sa période.
- Chaque rubrique a un statut et une raison.
- Les décisions attendues sont formulées comme des questions à trancher, avec options.
- Aucune décision n'est présentée comme prise.

## À vérifier par un professionnel

- Pour un client certifié ISO 9001, la liste exacte des éléments d'entrée et de sortie exigés est à relire dans la
  norme achetée par l'entreprise (chapitre 9.3) ; son texte n'est pas reproduit ici.

## Limites

- Le dossier vaut ce que valent les registres : des actions correctives mal tenues donnent un état faux, et le dossier
  le signale.
- La compétence ne fixe pas les objectifs qualité ; elle en rend compte.

## Exemple

Cas nominal : revue semestrielle d'un courtier. Actions précédentes : 5 faites, 2 en retard (responsables cités).
Réclamations : 42 sur le semestre contre 35 (source : registre des plaintes), jaune. Actions correctives : 9 ouvertes
dont 3 de plus de 90 jours, rouge. Audits : 4 sur 4 faits à la date prévue, vert. Décision attendue : renforcer
l'équipe sinistres en période de pic ou accepter le délai actuel, avant le 30/06.

Cas d'échec évité : le taux de satisfaction n'a pas été mesuré ce semestre. Le dossier écrit « donnée manquante » et
propose une mesure, au lieu de reprendre le chiffre de l'an passé.

## Origine de la méthode

Entrées de la revue sur les actions correctives adaptées et traduites de github.com/alirezarezvani/claude-skills,
`ra-qm-team/skills/capa-officer/SKILL.md`, section « Management Review Inputs », commit
19392f7a08264ed00486a251f5b2098321771f94, licence MIT, Copyright (c) 2025 Alireza Rezvani ; statut vert, jaune, rouge
et rubrique des décisions attendues adaptés de github.com/anthropics/knowledge-work-plugins,
`operations/skills/status-report/SKILL.md`, commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0.
Modifications : traduction, rubriques complétées pour une PME, aucune reprise du texte de la norme. Texte des licences
et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
