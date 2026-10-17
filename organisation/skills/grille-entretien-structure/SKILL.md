---
name: "grille-entretien-structure"
description: "Construit la grille d'un entretien d'embauche structuré pour une PME belge à partir d'une offre ou d'une fiche de poste : 4 à 6 compétences liées au poste, questions comportementales et situationnelles avec relances, échelle ancrée de 1 à 4, déroulé minuté, questions à ne pas poser et fiche de notation individuelle. À utiliser pour préparer un entretien de recrutement ou un jury de sélection et rendre les entretiens comparables ; jamais pour noter, classer, présélectionner ou écarter un candidat réel, ni pour analyser un CV nominatif."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "ressources-humaines"
---

# Grille d'entretien structuré

Service sensible : la grille aide les recruteurs à poser les mêmes questions à chaque candidat et à noter sur des faits ;
elle ne note personne. Toute présélection, toute note et toute décision d'embauche sont humaines. Un système d'IA qui
trie ou évalue des candidats relève des usages à haut risque du règlement européen sur l'IA : la compétence n'en fait
jamais office.

## Quand l'utiliser

- Un recrutement est ouvert et les entretiens se font « au feeling », sans questions communes.
- Un jury de plusieurs personnes doit comparer des candidats sur les mêmes critères.
- Un manager veut une liste de questions à éviter avant son premier entretien.

## Objectif

Une grille prête à imprimer où chaque question est reliée à une compétence du poste, chaque compétence a une échelle
ancrée sur des comportements observables, et la règle de consolidation (notes individuelles d'abord, discussion
ensuite, décision argumentée par écrit par l'humain) est écrite.

## Prérequis

- L'offre d'emploi ou la fiche de poste (missions, compétences attendues).
- La durée de l'entretien et le nombre d'intervenants.
- Les compétences que l'entreprise juge décisives, si elle les connaît. À défaut, la compétence en déduit 4 à 6 et
  les présente d'abord pour validation, en une phrase chacune.

## Entrées

- `offre` ou `fiche_poste` : texte fourni par l'entreprise.
- `duree_minutes`, `intervenants` : format de l'entretien.
- `competences_decisives` : facultatif.
- Aucun CV ni donnée de candidat : la grille porte sur le poste, pas sur une personne.

## Étapes

1. **Choisir 4 à 6 compétences** réellement liées au poste (techniques et comportementales), avec pour chacune
   pourquoi elle compte et un poids. Au-delà de six, l'entretien se dilue.
2. **Écrire une ou deux questions par compétence** : comportementale (« Racontez une situation où… ») pour ce qui a déjà
   été vécu, situationnelle (« Que feriez-vous si… ») pour un profil junior ou en reconversion. Chaque question a une
   ou deux relances neutres pour obtenir le contexte, l'action personnelle et le résultat.
3. **Ancrer l'échelle de 1 à 4** par compétence : indicateurs observables pour 1, pour 2-3 et pour 4. Une échelle paire
   évite le « moyen » par défaut.
4. **Lister ce qu'on ne demande pas**, adapté au poste : projet de grossesse ou d'enfants, situation familiale, état de
   santé ou handicap (sauf si le candidat aborde lui-même un aménagement raisonnable), conviction religieuse ou
   philosophique, opinion politique ou syndicale, origine, âge, orientation sexuelle. Donner une reformulation liée au
   travail quand elle existe (« Êtes-vous disponible pour une semaine de garde par mois ? »).
5. **Minuter le déroulé** : accueil, présentation du poste, questions, questions du candidat, suite de la procédure.
6. **Préparer la fiche de notation** vierge et la règle de consolidation : chaque évaluateur note seul avant la
   discussion collective ; la décision est argumentée par écrit par les personnes responsables du recrutement.
7. **Vérifier** : chaque question est reliée à une compétence ; aucune question n'approche un critère protégé ; aucun
   test de personnalité ni question piège ; si une compétence demandée est discriminatoire (« âge compatible avec
   l'équipe »), la signaler et proposer un critère lié au travail réel.

## Livrable

- `Compétences évaluées` : tableau compétence, pourquoi elle compte, poids.
- `Déroulé` : liste minutée.
- `Questions` : par compétence, questions, relances et échelle ancrée (note, indicateurs observables).
- `À ne pas demander` : puces avec reformulations acceptables.
- `Fiche de notation` : tableau vierge compétence, note de 1 à 4, faits observés, évaluateur, et règle de consolidation.

## Critères de réussite

- Mêmes questions pour tous les candidats du poste ; chaque question renvoie à une compétence.
- Chaque niveau de l'échelle est décrit par un comportement observable, pas par un adjectif.
- La liste « à ne pas demander » couvre les critères protégés de la loi du 10 mai 2007.
- Aucun candidat réel n'est noté, classé ou commenté dans le livrable.

## À vérifier par un professionnel

- La liste des critères protégés et les questions tolérées pour un poste particulier (exigence professionnelle
  essentielle) : juriste en droit social ou Unia.
- La durée de conservation des notes d'entretien et l'information des candidats (RGPD) : délégué à la protection des
  données.

## Limites

- La compétence ne lit pas de CV, ne fait aucune présélection et ne compare pas des candidats.
- Elle ne garantit pas l'absence de biais : elle les réduit par la structure ; la formation des recruteurs reste humaine.
- Les notes d'entretien sont des données personnelles : la compétence ne les conserve pas.

## Exemple

Poste de gestionnaire de sinistres. Compétences : rigueur documentaire (poids 3), relation client sous tension (3),
organisation des priorités (2), maîtrise des outils bureautiques (1). Question comportementale : « Racontez un dossier où
il manquait une pièce décisive : qu'avez-vous fait ? » ; relance : « Quel a été le résultat ? ». Échelle : 1 = aucun
exemple concret ; 2-3 = exemple avec action personnelle mais résultat flou ; 4 = exemple daté, action et résultat
mesurable. À ne pas demander : « Avez-vous des enfants en bas âge ? » ; reformulation : « Le poste demande une
permanence un samedi par mois : est-ce compatible avec vos disponibilités ? ».

Cas d'échec : le manager colle trois CV et demande « lequel retenir ». La compétence refuse le classement, rappelle que
la décision est humaine et propose la grille vierge à remplir par chaque évaluateur.

## Origine de la méthode

Reprise de github.com/warrox1993/skills-claude-entreprise, `plugins/entreprise-rh/skills/grille-entretien-structure/SKILL.md`,
commit 474785fbcba8429cb034ef35fca20bbfcfd68554, licence MIT (même auteur que l'atelier) : 4 à 6 compétences, questions
comportementales et situationnelles, échelle ancrée de 1 à 4, questions à ne pas poser, notes individuelles avant
discussion. Principes « mêmes questions pour tous, grille de notation, panel varié » confirmés par
github.com/anthropics/knowledge-work-plugins, `human-resources/skills/interview-prep/SKILL.md`, commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : rubriques de l'atelier, refus explicite du
classement de candidats. Liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
