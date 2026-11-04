# Second avis et standard de qualité des images et des vidéos : plan (option A)

> Pour l'agent qui exécute : suivre son lot seulement, test d'abord, un commit par étape verte.

**But.** Demande de l'opérateur du 30/10/2026 : chaque image et chaque vidéo terminée reçoit un second avis d'un autre agent, et
un standard « haut de gamme » mesuré. Étude : `docs/superpowers/etudes/2026-10-30-qualite-visuels.md` (valeurs et
sources en 2.1 et 2.2, grille en 2.3, conception en 3).

**Décisions** (recommandations de l'étude retenues, règle de l'opérateur « prends toujours les recommandés ») :
- étage a dans la fabrique : un rendu hors norme n'est pas livré, le motif revient au producteur ;
- étage b par le `relecteur` existant (revue `metier`), qui voit le rendu par un outil `voir_rendu` et note sur la
  grille 2.3 : publiable à 16/20 au moins, aucun 0, 2/2 sur les critères 8, 9 et 10 ;
- sous-titres obligatoires pour toute vidéo publicitaire ;
- le goût (voix, musique, humour, « est-ce beau ») reste à l'approbation humaine, dernière étape inchangée.

## Interface commune (fixée ici, utilisée par les lots 1, 2 et 3)

`resultat.json` d'un travail `video` ou `image` gagne deux clés, en plus de `fichiers` (inchangé) :
- `"revue": {"fichier": "<nom>", "sha256": "<64 hex>"}` : `planche.png` pour une vidéo, `image.png` pour une image ;
  le fichier est dans le dossier du livrable ; il n'est PAS ajouté à `fichiers` (il ne se diffuse pas) ;
- `"controle_qualite": "controle-qualite.json"` : mesures et alertes non bloquantes, dans le dossier du livrable.

## Lot 1 : fabrique, vidéo
`fabrique/generateurs/montage.py`, `fabrique/generateurs/sous_titres.py`, `fabrique/service.py` (partie vidéo),
`fabrique/hyperframes/gabarits/_commun/base.css`. Valeurs : étude 2.1. Tests : `fabrique/tests/test_montage.py`,
`test_sous_titres.py`, `test_service.py`.

## Lot 2 : fabrique, image (après la passe de design en cours)
`fabrique/hyperframes/gabarits-images/_commun/base.css`, `fabrique/generateurs/images.py`, `fabrique/registre_charte.py`,
partie image de `fabrique/service.py`. Valeurs : étude 2.2. Tests : `fabrique/tests/test_images.py`.

## Lot 3 : plugin
Outil `voir_rendu` (étude 3) ; `sous_titres` forcé pour une vidéo publicitaire ; classement de l'outil dans
`organisation/registre/agents.json` (relecteur seulement) et fiches régénérées dans le même commit.

## Lot 4 : organisation (après le lot 3)
Compétence `organisation/skills/qualite-visuels/SKILL.md` (grille 2.3), consigne du `relecteur`, livraison des
producteurs avec `controle-qualite.json`.

## Fin
Une seule revue `securite` sur l'ensemble des lots de la soirée (dont `voir_rendu`, qui copie un fichier vers l'espace
d'un agent). Recalibrer le seuil de 16/20 après 20 rendus jugés aussi par l'opérateur.
