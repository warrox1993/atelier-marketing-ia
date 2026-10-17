---
name: "selection-projets-innovation"
description: "Trie et classe les idées et projets d'innovation internes d'une PME : fiche d'idée, cinq contrôles d'aller ou non (adéquation à la stratégie, conditions impératives, faisabilité, capacité, intérêt et chances), note de priorité (impact et risque multipliés par la facilité), preuve de concept cadrée avec critère d'arrêt. À utiliser pour une revue du portefeuille d'idées, un comité d'innovation ou avant de lancer une preuve de concept ; jamais pour lancer, financer ou arrêter un projet sans décision humaine."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "recherche-innovation"
---

# Sélection des projets d'innovation

## Quand l'utiliser

- Des idées s'accumulent (boîte à idées, demandes clients, veille) et personne ne sait lesquelles mériter un essai.
- Un comité d'innovation ou la direction doit choisir les projets du semestre.
- Une preuve de concept est envisagée et il faut fixer ce qu'elle doit prouver et quand on arrête.

## Objectif

Un portefeuille d'idées trié, où chaque idée a une fiche, un verdict motivé (aller, aller sous conditions, non), une note
de priorité recalculable et, pour celles retenues, une preuve de concept cadrée avec son critère d'arrêt, la décision de
lancer ou d'arrêter restant humaine.

## Prérequis

- Les orientations stratégiques et le budget d'innovation fixés par la direction.
- Les idées décrites (problème, bénéficiaire, solution envisagée), même brièvement.
- Les capacités disponibles (personnes, compétences, équipements) et leur charge.

## Entrées

- `idees` : liste avec auteur (fonction), date, description.
- `strategie` : priorités écrites de la direction.
- `ressources` : capacités et budget disponibles sur la période.

## Étapes

1. **Rédiger la fiche d'idée** : problème, pour qui, solution envisagée, ce qui est nouveau, ce qu'il faudrait croire pour
   que cela marche. Une idée sans problème identifié est renvoyée à son auteur avec la question.
2. **Passer les cinq contrôles d'aller ou non**, dans l'ordre, le premier échec arrêtant l'examen :
   1. adéquation à la stratégie écrite ;
   2. conditions impératives (réglementation, sécurité, propriété intellectuelle d'un tiers à vérifier par la veille
      brevets) ;
   3. faisabilité technique au regard de l'état de l'art connu ;
   4. capacité : personnes et moyens disponibles sans mettre en péril l'activité courante ;
   5. intérêt et chances : bénéfice attendu au regard du coût et de la probabilité de réussite.
   Un non se dit clairement avec sa raison et s'enregistre pour ne pas réexaminer la même idée sans élément nouveau.
3. **Noter la priorité** des idées qui passent : impact (1 à 5), risque de ne rien faire (1 à 5), effort (1 à 5, un effort
   faible donnant une priorité haute). Priorité = (impact + risque) x (6 - effort). Les notes sont justifiées en une
   phrase et la grille est un repère de discussion, pas une décision.
4. **Repérer les financements possibles** : subside régional ou européen (compétence `dossier-subside-innovation`),
   incitants fiscaux (`incitants-fiscaux-rd`), à qualifier par les spécialistes.
5. **Cadrer la preuve de concept** des idées retenues : hypothèse à tester, essai minimal, durée, coût plafond,
   indicateur de réussite chiffré et **critère d'arrêt** écrit avant de commencer.
6. **Préparer la revue** : tableau du portefeuille (idées en attente, retenues, refusées avec raison, en cours, arrêtées),
   et les décisions demandées.
7. **Poser les décisions** : lancer, financer, arrêter ou prolonger une preuve de concept ; une carte par décision.

## Livrable

Fiches d'idées ; tableau des contrôles avec verdict et raison ; classement par priorité avec le calcul ; fiches de preuve
de concept (hypothèse, essai, durée, coût, indicateur, critère d'arrêt) ; tableau du portefeuille ; décisions demandées.

## Critères de réussite

- Chaque idée a un verdict et sa raison ; les cinq contrôles sont faits dans l'ordre.
- Chaque note de priorité est recalculable.
- Chaque preuve de concept a un critère d'arrêt écrit avant son lancement.
- Aucun projet n'est présenté comme lancé ou arrêté sans décision humaine.

## À vérifier par un professionnel

- La liberté d'exploitation d'une idée face aux brevets de tiers : conseil en propriété industrielle.
- La propriété des résultats d'une idée apportée par un travailleur, un stagiaire ou un partenaire : juridique.

## Limites

- La grille ne remplace pas le jugement de la direction ; deux idées à égalité se départagent par la stratégie.
- Elle n'estime pas un marché : les chiffres de marché viennent d'une étude sourcée.
- Elle ne gère pas un laboratoire de recherche ni un portefeuille de brevets.

## Exemple

14 idées. Contrôle 1 : 3 hors stratégie, refusées avec raison. Contrôle 2 : 1 bloquée par un brevet possible d'un tiers,
renvoyée à la veille brevets. Restent 10, notées : « outil de relance automatique des devis » : impact 4, risque 3,
effort 2, priorité (4 + 3) x 4 = 28, première. Preuve de concept : 6 semaines, 4 000 euros plafond, indicateur « taux de
réponse aux devis relancés supérieur à 25 % sur 60 devis », arrêt si inférieur à 15 %. Carte : « lancer la preuve de
concept au 2/11 ».

Cas d'échec évité : le directeur commercial demande de « lancer son idée sans passer par la grille, c'est urgent ». La
compétence la passe quand même aux cinq contrôles, signale l'urgence comme élément de décision et laisse la décision à
la direction.

## Origine de la méthode

Cinq contrôles ordonnés d'aller ou non, non motivé et enregistré, adaptés et traduits de
github.com/anthropics/knowledge-work-plugins, `small-business/skills/grant-rfp-writer/SKILL.md`, « Step 3 » (go/no-go avant
toute rédaction) (transposés aux projets internes) ; note de priorité (impact + risque) x (6 - effort) de
`engineering/skills/tech-debt/SKILL.md`, « Prioritization Framework », commit 33eeda1e8fd856455b05479d13a0f85b5f803744,
licence Apache 2.0. Modifications : réécriture en français, preuve de concept avec critère d'arrêt, décision humaine.
Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
