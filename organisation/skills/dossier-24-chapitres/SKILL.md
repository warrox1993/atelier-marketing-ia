---
name: "dossier-24-chapitres"
description: "Donne le plan et le contenu attendu des 24 chapitres d'un dossier d'outil de l'Observatoire (ch01 à ch24), l'état de chaque chapitre (complet, incomplet, non applicable) et les types de sous-chapitres. À utiliser pour construire, relire ou mettre à jour un dossier, ou pour décider si un chapitre est complet."
metadata:
  version: "1.0.2"
  langue: "fr"
  domaine: "observatoire"
---

# Dossier en 24 chapitres

## Quand l'utiliser

- Un dossier est créé à partir d'une Fiche acceptée.
- Une nouvelle version impose de relire les chapitres touchés.
- Un relecteur doit juger qu'un chapitre est complet ou non.

## Objectif

Produire un dossier dont les 24 chapitres existent tous, chacun avec un état honnête et ses
affirmations liées. Le contrat est dans `plugin-atelier/src/contrats/observatoire.ts`.

## Prérequis

- Une Fiche acceptée et ses sources enregistrées (voir `recherche-sourcee`).
- Le contrat des 24 chapitres, tel que décrit dans le plan en tête des étapes.

## Entrées

- La Fiche acceptée de l'outil et la liste de ses sources enregistrées.
- Les affirmations déjà posées, avec leur statut, leur confiance et leurs preuves.
- Pour une mise à jour : la nouvelle version et les chapitres que le code signale comme touchés.

## Étapes

### Plan des chapitres

| Bloc | Clés et intitulés |
| --- | --- |
| Présentation | ch01 Identité et présentation ; ch02 Synthèse exécutive ; ch03 Origines et problèmes résolus ; ch04 Concepts fondamentaux et glossaire ; ch05 Public cible et positionnement |
| Fonctionnement | ch06 Fonctionnalités détaillées ; ch07 Architecture globale ; ch08 Fonctionnement interne ; ch09 Technologies et dépendances ; ch10 Compatibilité et environnement ; ch11 Licence, gouvernance et propriété |
| Mise en oeuvre | ch12 Installation rapide ; ch13 Installation avancée ; ch14 Configuration et personnalisation ; ch15 Utilisation fondamentale ; ch16 Utilisation avancée |
| Intégrations | ch17 Intégrations Claude, MCP et agents ; ch18 Intégrations à d'autres environnements ; ch19 Cas d'usage et projets pratiques |
| Qualité | ch20 Performances et benchmarks ; ch21 Sécurité ; ch22 Confidentialité et conformité ; ch23 Coûts, exploitation et maintenance ; ch24 Comparaisons et évolution |

### Déroulé

1. Créer les 24 clés, ni plus ni moins, chacune portant la même clé dans son chapitre.
2. Pour chaque chapitre, rassembler les affirmations (voir `affirmations-preuves`) à partir des
   instantanés de sources, puis rédiger le texte au-dessus d'elles.
3. Fixer l'état :
   - `complet` : au moins une affirmation liée ;
   - `incomplet` : preuves insuffisantes pour l'instant, motif écrit ;
   - `non_applicable` : le sujet n'existe pas pour cet outil, motif écrit.
4. Organiser le contenu en sous-chapitres typés : debutant, intermediaire, expert, exemple,
   procedure, diagramme, preuve, resultat_essai, limites, problemes_connus, sources.
5. Annoncer les chapitres que les autres agents alimentent : ch17 par l'intégrateur Claude et MCP,
   ch21 par l'auditeur de sécurité, ch20 par l'ingénieur d'essais.
6. Pour une mise à jour, lister les chapitres impactés avec le motif plutôt que tout réécrire.

## Livrable

Le dossier : 24 chapitres, états, motifs, sous-chapitres, annexes, affirmations liées.

## Critères de réussite

- Les 24 clés existent, aucune n'est omise ou dupliquée.
- Aucun chapitre `complet` sans affirmation ; aucun `incomplet` ou `non_applicable` sans motif.
- Un `non_applicable` justifié par la nature de l'outil, pas par la paresse.

## Limites

- Ce guide donne la structure, pas la méthode de recherche (`recherche-sourcee`), ni la mise en
  forme technique (`documentation-technique`), ni la version anglaise (`adaptation-fr-nl-en`).

## Exemple

Cas illustratif, outil fictif « Outil-Demo » : un dossier est ouvert à partir de sa Fiche.

| chapitre | état | motif |
| --- | --- | --- |
| ch01 Identité et présentation | `complet` | trois affirmations liées (nom, éditeur, licence) |
| ch20 Performances et benchmarks | `incomplet` | aucun essai exécuté pour l'instant, essai demandé à l'ingénieur d'essais |
| ch13 Installation avancée | `non_applicable` | l'outil est un service en ligne, sans installation locale |

Les 24 clés existent. Pour une nouvelle version, seuls ch10 et ch20 sont listés comme impactés.

## Pièges

- Remplir un chapitre de prose générique sans affirmation pour le déclarer complet.
- Marquer `non_applicable` un chapitre difficile à documenter, comme ch22 ou ch23.
- Décrire une fonctionnalité de ch06 ou une compatibilité de ch10 sans preuve.
- Écrire « installation testée » dans ch12 sans essai lié.
- Perdre l'historique : une affirmation obsolète est remplacée, jamais effacée.
