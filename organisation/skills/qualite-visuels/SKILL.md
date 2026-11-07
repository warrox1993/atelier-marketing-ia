---
name: "qualite-visuels"
description: "Note une image ou une vidéo publicitaire fabriquée par l'atelier en la regardant (image entière, ou planche d'images clés et transcription d'une vidéo) sur une grille de dix critères notés sur 20, et décide si elle est publiable : 16/20 au moins, aucun 0, note pleine sur les faits, la charte et la conformité (aucune mention incrustée). À utiliser par le relecteur pour toute revue d'un livrable qui contient une image ou une vidéo fabriquée, avant le verdict ; jamais pour juger un texte seul, ni pour remplacer l'approbation humaine du goût."
metadata:
  version: "1.6.0"
  langue: "fr"
  domaine: "contenu"
---

# Qualité d'une image ou d'une vidéo : le second avis sur le rendu

## Quand l'utiliser

- Relecteur : tu es la revue `metier` d'un livrable qui cite un travail `image` ou `video` de la fabrique ; tu regardes le
  rendu et tu le notes avant de rendre ton verdict.
- Contenus et Réseaux sociaux : tu relis la grille avant de demander une image ou une vidéo, pour viser 2/2 partout.

## Objectif

Un second avis porté sur ce que le public verra, pas sur la demande écrite. La fabrique a déjà mesuré et refusé ce qui se
mesure (dimensions, son, débit, zones sûres, sous-titres, contraste : `controle-qualite.json` du livrable). Ce qui reste
relève du jugement : l'accroche, la clarté, le rythme, le ton, la fidélité au dossier du sujet et à la charte.

## Prérequis

- L'outil `voir_rendu` (identifiant du travail) : il dépose l'image, ou la planche de la vidéo, dans ton espace ; tu
  l'ouvres avec Read.
- Le dossier du sujet de la tâche (document `dossier-sujet`, compétence `dossier-sujet`) et la charte du client.
- Pour une vidéo : la transcription de l'aperçu de la fabrique (`etat_fabrication` côté producteur, reprise dans le
  livrable) et les mesures de `controle-qualite.json`.

## Entrées

- L'identifiant du travail cité par le livrable.
- La planche d'une vidéo : images de 0, 1 et 2 s, puis la première image de chaque scène, à 360 px de large.
- Une image : le PNG entier, à juger comme sur un téléphone (360 px de large), pas en pleine résolution.

## Étapes

1. Appelle `voir_rendu` une seule fois, puis ouvre le fichier rendu avec Read. Sans rendu (outil refusé, fichier absent),
   ne note rien : verdict `CHANGES_REQUESTED`, constat `technique`, « rendu introuvable ».
2. Lis les alertes de `controle-qualite.json` : une alerte (voix qui démarre tard, débit faible, sous-titres trop rapides)
   abaisse le critère qu'elle touche.
3. Note chaque critère 0 (raté), 1 (passable) ou 2 (net) :

   | # | Critère | Ce que tu regardes |
   | --- | --- | --- |
   | 1 | Accroche | Vidéo : images de 0, 1 et 2 s et première phrase dite. Image : le titre se lit en premier |
   | 2 | Une seule idée | Un message, un bénéfice ; rien qui se dispute l'attention |
   | 3 | Hiérarchie | Titre, puis preuve, puis appel ; l'œil suit cet ordre |
   | 4 | Lisibilité sur téléphone | Tout le texte se lit à 360 px de large, sans zoom |
   | 5 | Rythme (vidéo) ou respiration (image) | Scènes de 2 à 5 s, pas de mur de texte ; marges régulières |
   | 6 | Voix et ton | La transcription suit le script ; le ton suit la rubrique `Ton` du dossier ; un humour qui tombe à plat ou qui exclut une partie du public vaut 0 |
   | 7 | Appel à l'action | Un seul appel, clair, réalisable, conforme à l'offre confirmée |
   | 8 | Dossier du sujet | Chaque fait, chiffre et nom vient du dossier ou de la fiche ; rien de la rubrique `À ne pas dire` ; **éliminatoire** |
   | 9 | Charte | Couleurs, police et logo de la charte, rien en plus ; **éliminatoire** |
   | 10 | Conformité | Ni l'image ni la vidéo ne portent de mention ni de filigrane visible (c'est un défaut : 0 ; le filigrane audio inaudible des voix n'en est pas un). Liste APRÈS remplie ; **éliminatoire** |

4. Décide : **publiable** si le total est d'au moins 16/20, sans aucun 0, et avec 2/2 aux critères 8, 9 et 10.
5. Écris le verdict selon ta consigne : `PASS` si publiable ; sinon `CHANGES_REQUESTED` avec un constat `majeure` par
   critère sous 2, de catégorie `marque` (critères 1 à 7 et 9), `affirmation_non_sourcee` (critère 8) ou `technique`
   (critère 10 et défaut de rendu), et une correction précise (« titre réduit à 6 mots », « scène 2 coupée à 4 s »).
   La note sur 20 et le détail des dix critères vont dans `justification`.

### Image ou vidéo sans illustration

Regarde d'abord si le rendu contient un vrai visuel peint (personnage, décor, ambiance) derrière le texte. Un aplat de
couleur avec du texte seul, ou une scène de vidéo sans illustration, est une publicité sans visuel : note globale 1/20,
verdict `CHANGES_REQUESTED` avec un constat `majeure` de catégorie `marque` et la correction « ajouter le champ `illustration`
(20 à 2500 caractères) à la demande, sans texte ni logo dans la description ». Ne détaille alors pas les
dix critères au-delà de ce constat. Côté producteur, c'est la première chose à vérifier avant de déposer la demande.

### Contrôle anatomique

Sur l'image, ou sur chaque image clé de la planche d'une vidéo, compte les doigts de chaque main visible et vérifie les visages,
les yeux et les membres. Une seule anomalie suffit au refus : doigt en trop ou en moins, doigts fondus, membre en trop ou
coupé net, visage déformé, yeux dépareillés. Le rendu est alors à 1/20 : note globale 1/20, verdict `CHANGES_REQUESTED` avec un
constat `majeure` de catégorie `technique` qui nomme l'anomalie et l'endroit (« main droite du personnage à six doigts »), et la
correction « redemander l'illustration avec une composition qui expose moins les mains (une main sur un bâton, les mains dans
les manches, un cadrage plus serré) ». Ne détaille pas les dix critères au-delà de ce constat. Côté producteur, ce contrôle
se fait avant de livrer, avec `voir_rendu`.

## Livrable

Le verdict de ta revue, avec la grille notée dans `justification`, par exemple
`Grille qualité 17/20 : 1=2 2=2 3=2 4=1 5=2 6=1 7=2 8=2 9=2 10=1`. Rien d'autre : pas de nouvelle image, pas de réécriture
du script à la place du producteur.

## Critères de réussite

- Le rendu a été regardé (fichier ouvert avec Read), pas seulement la demande.
- Les dix notes sont écrites ; chaque note sous 2 a son constat et sa correction.
- Aucun `PASS` sous 16/20, avec un 0, ou sans 2/2 aux critères 8, 9 et 10.

## Limites

- Le goût reste à l'humain : choix de la voix et de la musique, humour, « est-ce beau ». L'approbation humaine reste la
  dernière étape ; ta grille l'informe, elle ne la remplace pas.
- Le seuil de 16/20 est un choix interne, recalibré après 20 rendus jugés aussi par l'humain.
- La vidéo elle-même ne t'est jamais transmise : tu juges la planche et la transcription ; un défaut visible seulement en
  mouvement est signalé « à vérifier par l'humain » dans `justification`.

## Exemple

Vidéo de 15 s, deux voix, pour la lampe fictive Brindille 2 (dossier du sujet de l'exemple de la compétence
`dossier-sujet`). Planche : à 0 s, le titre « Encore au bureau à 23 h ? » se lit seul (accroche 2) ; à 1 s, deux phrases
se superposent au titre (une seule idée 1) ; la scène 3 dure 7 s (rythme 1). La transcription dit « 12 W » alors que le
dossier dit 9 W (dossier du sujet 0).

Total 15/20 avec un 0 au critère éliminatoire 8 : `CHANGES_REQUESTED`, constats `affirmation_non_sourcee` (« 12 W »
remplacé par « 9 W », extrait du dossier), `marque` (une seule phrase à 1 s) et `marque` (scène 3 coupée à 4 s).
