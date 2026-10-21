---
name: "selection-canaux-bullseye"
description: "Choisit les canaux d'acquisition d'un client avec la méthode Bullseye : revue des 19 canaux, une idée concrète par canal, classement en prometteur, possible ou improbable, plan de 2 ou 3 tests avec budget, durée et seuil de succès fixés d'avance, verdict et revue trimestrielle. À utiliser après les objectifs, pour décider où concentrer l'effort ; jamais pour se limiter aux canaux que l'Atelier sait automatiser, ni pour déclarer un gagnant sur un volume trop faible."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "marketing"
---

# Sélection des canaux (Bullseye)

## Quand l'utiliser

- Les objectifs et la répartition marque/activation sont posés et il faut décider où investir.
- Un test de canal a échoué : retour à cette compétence, pas à la création.
- Revue trimestrielle des canaux.

## Objectif

Passer en revue tous les canaux d'acquisition, tester vite et à bas coût les plus prometteurs avec des seuils fixés avant, puis concentrer l'effort sur celui qui marche. Source : Gabriel Weinberg et Justin Mares, *Traction* (2014, édition Portfolio 2015) [vérifié pour les étapes]. Complément sur la disponibilité et le parcours d'achat : Byron Sharp (2010) ; Gartner (CEB) cité en sources secondaires [secondaire].

## Prérequis

- Les objectifs chiffrés, le budget et la répartition marque/activation (compétence `objectifs-marque-activation`).
- La cible et la niche (compétence `segmentation-ciblage`).
- La liste des points où la cible cherche et achète, si elle existe.

## Entrées

- `objectifs` : objectifs et budget par période.
- `cible` : segment, niche, groupe d'achat si B2B.
- `contraintes` : réglementation, moyens humains du client.

## Étapes

1. Passer en revue les 19 canaux : marketing viral, relations presse, relations presse non conventionnelles, publicité sur les moteurs de recherche, publicité sociale et display, publicité hors ligne, référencement naturel, marketing de contenu, courriel, outils gratuits, blogs ciblés, partenariats, vente, affiliation, plateformes existantes, salons, événements, conférences, communauté. La liste exacte varie selon les synthèses [mémoire].
2. Écrire une idée concrète par canal (anneau extérieur), y compris pour les canaux que l'Atelier n'automatise pas.
3. Classer en prometteur, possible ou improbable selon coût, délai et adéquation avec la cible, avec une justification.
4. Pour un courtier, les candidats probables à tester sont les partenariats (comptables, notaires, agences immobilières, guichets d'entreprises), le référencement local, la recommandation, les événements locaux et la vente directe. Ce sont des pistes, pas des certitudes.
5. Cartographier le parcours B2B : lister les points où le prospect cherche (recherche et fiche d'établissement, comparateurs, réseau du comptable, site, téléphone, LinkedIn), vérifier présence, exactitude (horaires, langues) et délai de réponse, identifier le groupe d'achat et prévoir un contenu par rôle.
6. Affecter les points d'entrée de catégorie prioritaires aux canaux (pages et fiche d'établissement, annonces, contenus) avec `points-entree-categorie`.
7. Choisir 2 ou 3 canaux prometteurs à tester (anneau du milieu). Pour chacun, fixer AVANT le test : budget, durée, indicateur, seuil de succès, décision prévue (compétence `mesure-experiences`, confiée à `mesure`).
8. Après le test : verdict par canal (continuer, ajuster, abandonner) selon le seuil, jamais selon l'impression. Concentrer l'effort sur le canal gagnant (centre).
9. Refaire l'exercice chaque trimestre. La « règle des 50 % » (consacrer la moitié du temps à l'acquisition) vient d'un ouvrage pensé pour des jeunes pousses [mémoire] : à ne pas appliquer telle quelle.
10. Déposer le tableau et le plan de tests dans le document de stratégie (rubrique « Canaux »).

## Livrable

Le tableau des 19 canaux notés, le plan de 2 ou 3 tests (budget, durée, seuil), le tableau du parcours (points de contact, état, délai), le verdict par canal après test, la date de la prochaine revue.

## Critères de réussite

- Les 19 canaux sont traités ou écartés avec une raison.
- Chaque test a un budget, une durée et un seuil fixés avant son lancement.
- Les canaux non automatisables par l'Atelier figurent dans l'analyse.
- Aucun verdict n'est tiré d'un volume trop faible ; sinon « non concluant ».

## Limites

- Piège : se limiter aux réseaux sociaux et aux annonces parce que l'Atelier les automatise.
- Le chiffre Gartner (environ 17 % du temps d'achat passé avec les fournisseurs) n'a été lu qu'en source secondaire ; « 6 à 10 décideurs » concerne des solutions B2B complexes et n'est pas valable pour une petite entreprise [secondaire].
- Tout canal qui envoie des messages (courriel, téléphone, publicité) est soumis aux règles de consentement et de conformité : `conformite-publicitaire` valide avant l'activation.
- L'activation de tout canal payant ou la dépense sont des décisions de l'humain.

## Exemple

Client fictif : courtier, zone urbaine.

| Canal | Idée concrète | Classement | Test |
| --- | --- | --- | --- |
| Partenariats | convention avec 3 comptables de la zone, présentation commune | prometteur | oui : 3 rendez-vous en 8 semaines, seuil 2 introductions |
| Référencement local | fiche d'établissement et 5 pages de situations | prometteur | oui : seuil 10 demandes de devis en 12 semaines |
| Salons | stand au salon des indépendants | possible | non ce trimestre (coût élevé) |
| Affiliation | programme d'apporteurs rémunérés | improbable | non : risque réglementaire |

Verdicts après test : à remplir par `mesure` à la date prévue.
