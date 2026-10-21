---
name: "leviers-influence-ethiques"
description: "Passe en revue les sept principes d'influence de Robert Cialdini (réciprocité, engagement et cohérence, preuve sociale, sympathie, autorité, rareté, unité) dans un contenu, exige un fondement factuel pour chacun, raye les leviers sans fondement et envoie obligatoirement la rareté et l'urgence à la conformité publicitaire. À utiliser pour relire un message de vente, un courriel, une page ou un script, jamais pour fabriquer une pression."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "creation"
---

# Leviers d'influence éthiques

## Quand l'utiliser

- Relecture d'un contenu commercial (courriel, page, annonce, script de relance).
- Avant d'ajouter un avis, un compteur, une mention d'urgence ou de rareté.
- Quand un contenu cherche à pousser à agir.

## Objectif

Ne garder que les leviers d'influence qui reposent sur un fait réel, et écarter toute pression ou manipulation. Niveau de
preuve : sept principes [vérifié] ; le septième (unité) a été ajouté dans l'édition élargie de 2021 d'*Influence* ; il avait
été introduit d'abord dans *Pre-Suasion* (2016) [mémoire].

## Prérequis

- Le document de stratégie du client, tenu par l'agent `stratege`, lu avant de produire.
- Les faits vérifiables de l'entreprise (agrément, ancienneté, avis authentiques, contenus utiles).

## Entrées

- `contenu` : texte à relire.
- `faits` : liste des preuves disponibles avec date et source.

## Étapes

1. Pour chaque contenu, cocher les principes réellement présents et leur fondement factuel : preuve sociale = avis
   authentiques et datés ; autorité = agrément FSMA, ancienneté réelle ; réciprocité = contenu utile gratuit ; unité =
   ancrage local réel ; sympathie ; engagement et cohérence ; rareté.
2. Rayer tout levier sans fondement : faux compteur, fausse rareté, avis sélectionnés de façon trompeuse, urgence inventée.
3. Envoyer à `conformite-publicitaire` toute rareté et toute urgence, qui sont les leviers les plus risqués.
4. Reformuler sans ajouter de fait nouveau.

## Livrable

Une table : levier, passage du contenu, fondement factuel (source, date), décision (garder, rayer, envoyer à la
conformité), et la version corrigée du passage.

## Critères de réussite

- Aucun levier ne subsiste sans fondement factuel daté.
- Toute rareté ou urgence a un avis de `conformite-publicitaire`.
- Aucun effet chiffré n'est promis.

## Limites

- Le droit belge (livre VI du Code de droit économique) interdit les pratiques trompeuses et agressives : la grille ne
  remplace pas le contrôle de `controle-communications-reglementees`.
- Certaines expériences de psychologie sociale citées dans ce domaine ont été discutées lors de la crise de réplication
  [probable, non vérifié au cas par cas] : ne pas promettre d'effet chiffré.
- Ne pas utiliser la grille comme une boîte à manipulations.

## Exemple

Cas nominal : courriel de relance d'un courtier. Preuve sociale : trois avis authentiques datés, cités avec accord ; autorité :
numéro d'agrément FSMA ; réciprocité : une checklist gratuite pour relire son contrat. La mention « offre limitée à vendredi »
est envoyée à la conformité, qui demande la preuve de la date de fin.

Cas d'échec évité : un compteur « plus que 2 places » sans réalité. Le levier est rayé et la compétence signale une pratique
potentiellement trompeuse.

## Origine de la méthode

Robert B. Cialdini, *Influence* (1984 ; édition « new and expanded », 2021). Procédure adaptée et traduite pour l'Atelier.
