---
name: "declinaison-regies-video"
description: "Décline une publicité vidéo faite avec l'outil fabriquer_video pour chaque régie : Meta (Reels, Stories, fil), TikTok, YouTube Shorts, LinkedIn. Choisit parmi les trois formats de l'outil (vertical 1080x1920, carré 1080x1080, horizontal 1920x1080), propose une durée prudente, rédige le texte d'accompagnement et renvoie aux centres d'aide pour toute limite chiffrée non vérifiée. À utiliser quand une même vidéo doit servir plusieurs réseaux ou qu'il faut choisir le format avant de déposer la demande ; jamais pour afficher une limite de régie non sourcée ni pour publier."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "creation"
---

# Déclinaison d'une vidéo par régie

## Quand l'utiliser

- Une vidéo doit être diffusée sur plusieurs réseaux et il faut décider quel format fabriquer.
- Le texte d'accompagnement d'un post vidéo doit être adapté à la régie.
- Un client demande « quelle durée » ou « quelle taille » pour une régie : la réponse part de cette compétence, avec renvoi à la source.

## Objectif

Pour chaque régie visée : un format parmi les trois de l'outil, une durée cible prudente, un texte d'accompagnement, et la liste de
ce qui reste à vérifier dans le centre d'aide de la régie.

## Prérequis

- Le script de la vidéo (compétence `script-video-publicitaire`) et le brief validé.
- La liste des régies visées et la place voulue (Reel, Story, fil, Short).
- La compétence `conformite-publicite-ia` pour les étiquettes IA propres à chaque régie.

## Entrées

- `regies` : Meta, TikTok, YouTube Shorts, LinkedIn.
- `emplacements` : Reels, Stories, fil, Shorts, fil professionnel.
- `message` et `appel_a_l_action`.

## Étapes

1. **Choisir le format de l'outil** (`format_sortie`), par emplacement :
   - vertical `1080x1920` : Reels et Stories de Meta, TikTok, YouTube Shorts ; c'est le format par défaut des vidéos courtes ;
   - carré `1080x1080` : fil de Meta, fil de LinkedIn ; bon compromis quand une seule vidéo doit servir deux fils ;
   - horizontal `1920x1080` : YouTube classique, LinkedIn sur ordinateur, présentation d'offre un peu plus longue.
   - L'outil ne fabrique que ces trois formats : une vidéo par format, pas de recadrage fait par l'agent.
2. **Fixer une durée prudente** : viser 15 à 30 secondes pour les formats courts verticaux, jusqu'à 45 secondes en carré ou horizontal.
   Ce sont des repères de travail de l'atelier, pas des règles de régie. Les durées maximales, poids de fichier, zones de sécurité
   et ratios acceptés par chaque régie ne sont pas donnés ici : **à vérifier dans le centre d'aide de la régie** (Meta : facebook.com/business/help ;
   TikTok : ads.tiktok.com/help ; YouTube : support.google.com/youtube ; LinkedIn : linkedin.com/help/lms).
3. **Rédiger le texte d'accompagnement** par régie, à partir du message validé :
   - Meta : une phrase d'accroche, une phrase de bénéfice, l'appel à l'action ; mention « vidéo réalisée avec l'IA » ;
   - TikTok : ton direct, première ligne qui répète l'accroche de la vidéo, mention IA, rappel d'activer l'étiquette « contenu généré par IA » ;
   - YouTube Shorts : titre clair et descriptif, une ligne de description avec l'appel à l'action ;
   - LinkedIn : ton professionnel, le problème du client en une phrase, la preuve, l'appel à l'action ; pas de mot d'ordre creux.
   - Pas d'émoji en guise de ponctuation, pas de tiret cadratin, pas de lot de mots-clics : en rester à quelques mots-clics pertinents.
4. **Prévoir les étiquettes IA** de chaque régie avec `conformite-publicite-ia` : TikTok demande d'activer l'étiquette, Meta étiquette
   lui-même mais sa règle de déclaration manuelle est à vérifier dans son centre d'aide.
5. **Écrire le tableau de déclinaison** (une ligne par régie et emplacement) et les points « à vérifier » avec le lien du centre d'aide.

## Livrable

Un tableau : régie, emplacement, `format_sortie`, durée cible, texte d'accompagnement, étiquette IA à activer, point à vérifier
et lien de son centre d'aide. Une demande `fabriquer_video` par format retenu, chacune dans le commentaire de la tâche.

## Critères de réussite

- Chaque emplacement a un format parmi les trois de l'outil.
- Aucune limite chiffrée de régie n'est affirmée sans source ; sinon la ligne dit « à vérifier dans le centre d'aide de la régie ».
- Le texte d'accompagnement signale que la vidéo est faite avec l'IA.
- Le nombre de vidéos demandées tient dans le plafond de 10 par jour.

## Limites

- Les formats et durées des régies changent souvent : la compétence ne les fige pas.
- L'outil fabrique trois formats (le vertical `1080x1920` est déjà du 9:16) ; pas de format 4:5, ni de recadrage d'une
  vidéo déjà fabriquée vers un autre format : il faut une nouvelle fabrication.
- Elle prépare le texte et le format ; elle ne publie rien, ne programme rien, ne règle aucun budget publicitaire.
- Les liens des centres d'aide sont donnés comme points de départ : vérifier qu'ils s'ouvrent encore.

## Exemple

Un client veut une même vidéo sur Instagram (Reels) et sur LinkedIn. Deux fabrications : une verticale `1080x1920` de 20 secondes pour
les Reels, une carrée `1080x1080` de 30 secondes pour le fil LinkedIn. Pour les Reels, texte court et mention IA ; pour LinkedIn, le
problème, la preuve et l'appel à l'action, avec la mention IA. Dans le tableau, la durée maximale de chaque emplacement est
« à vérifier dans le centre d'aide de la régie ».

Cas d'échec évité : un brouillon affirmait « Reels : 90 secondes maximum » sans source ; la phrase est remplacée par le renvoi
au centre d'aide.

## Origine de la méthode

Grille de déclinaison par réseau rédigée en français par l'Atelier Marketing IA pour les trois formats de l'outil
`fabriquer_video`. Aucun texte de dépôt tiers n'est repris ; licence Apache 2.0.
