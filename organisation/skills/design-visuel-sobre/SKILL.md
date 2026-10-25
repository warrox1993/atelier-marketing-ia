---
name: "design-visuel-sobre"
description: "Critique puis finit un visuel, une page ou un document mis en forme : verdict de spécificité (fait pour ce client ou interchangeable), problèmes classés de P0 à P3, hiérarchie, typographie, espacement, contraste, états, et refus des habitudes qui donnent l'allure d'une production d'IA (cartes identiques, gros chiffre décoratif, surtitre, texte en dégradé, émojis en guise d'icônes, tiret cadratin) ; audite aussi un système de design (jetons, valeurs codées en dur, composants et leurs états) et documente ou conçoit un composant. À utiliser avant de livrer un brief de visuel, une maquette, une page ou une présentation, et pour relire ceux d'un tiers ; jamais pour changer un fait, une offre ou une mention."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "creation"
---

# Design visuel sobre : critique et finition

## Quand l'utiliser

- Un brief de visuel, une maquette de page, une présentation ou un document mis en forme est prêt à être livré.
- Un visuel produit par un outil ou un prestataire doit être relu avant validation.
- Un client trouve un rendu « générique » ou « fait par une IA ».
- Les pages ou documents d'un client divergent (couleurs, tailles, boutons) et il faut faire le point sur son système
  de design, documenter un composant ou en concevoir un nouveau.

## Objectif

Un visuel qui paraît conçu pour ce client et pour ce lecteur, lisible et accessible, avec une critique écrite qui
classe les problèmes et dit comment corriger chacun, sans toucher au contenu validé.

## Prérequis

- Le contenu validé (textes, chiffres, offres, mentions) : la critique ne modifie aucun fait.
- La charte de marque (compétence `charte-marque`) : couleurs, polices, logo, actifs distinctifs
  (`actifs-distinctifs`).
- Le support et sa taille réelle de diffusion (publication carrée, page web sur téléphone et ordinateur,
  diapositive 16:9, A4 imprimé), et si possible une capture du rendu à cette taille.

## Entrées

- `visuel` : maquette, capture, fichier ou brief.
- `objectif` : ce que le lecteur doit comprendre ou faire.
- `mode` : convaincre (campagne, page d'offre), faire une tâche (formulaire, outil), lire (article, rapport) ou
  montrer (galerie). Le mode fixe le niveau d'ambition : audace pour convaincre, précision et retenue pour faire
  une tâche ou lire.
- `tache` : critique (par défaut) ou système (audit, documentation d'un composant, nouveau composant).
- `etape_projet` : exploration, mise au point ou finition ; la critique d'une exploration porte sur la direction, celle
  d'une finition sur le détail.

## Étapes

1. **Regarder le rendu réel** à sa taille de diffusion, pas seulement le fichier source. Sans rendu, le dire et
   limiter la critique au brief.
2. **Rendre le verdict de spécificité** : le visuel pourrait-il servir tel quel à n'importe quel concurrent du
   secteur ? Si oui, nommer ce qui le rend interchangeable et ce qui, dans la charte ou le métier du client,
   pourrait le rendre propre.
3. **Contrôler le plancher de qualité**, chaque point sur le rendu :
   - *première impression* (deux secondes) : ce qui attire l'œil d'abord et si c'est le bon élément, l'objet compris
     immédiatement ;
   - *utilisabilité* : la personne peut-elle atteindre son but, les éléments cliquables se reconnaissent-ils, y a-t-il
     des étapes inutiles ;
   - *cohérence* : mêmes espacements, couleurs et tailles pour les mêmes rôles, éléments semblables qui se comportent
     de la même façon, respect de la charte et du système de design s'il existe ;
   - *hiérarchie* : un seul élément dominant, un ordre de lecture évident, l'appel à l'action trouvé en quelques
     secondes ;
   - *typographie* : deux familles au plus, une échelle de tailles franche, lignes de 65 à 75 caractères pour le
     texte courant, titres équilibrés sans mot seul en dernière ligne ;
   - *espacement* : éléments liés serrés, groupes bien séparés, plus d'espace au-dessus d'un titre qu'en
     dessous, alignements constants ;
   - *contraste* : 4,5:1 au moins pour le texte courant, 3:1 pour les grands titres et les éléments graphiques ;
     sur un fond coloré, texte secondaire teinté de ce fond plutôt que gris ;
   - *états et cas réels* (pages et interfaces) : survol, focus clavier visible, désactivé, chargement, erreur,
     vide ; vrai contenu, y compris le plus long ;
   - *textes* : la langue du client, des boutons qui nomment leur action, des erreurs qui disent le problème et la
     solution.
4. **Refuser les habitudes de production automatique**, sauf si le brief les demande explicitement : rangée de
   cartes identiques « icône, titre, texte » comme structure de page, et cartes imbriquées ; gabarit du gros
   chiffre avec petit libellé et statistiques en dessous ; surtitre en petites capitales au-dessus d'un titre ;
   numéros de section décoratifs (01, 02, 03) ; texte en dégradé ; verre dépoli et flou décoratifs ; bordure
   colorée épaisse sur un seul côté des encadrés ; ombres dures décalées ; émojis ou symboles à la place d'un vrai
   jeu d'icônes ; police monospace pour faire « technique » ; tiret cadratin dans les textes (virgule,
   deux-points ou parenthèses).
5. **Classer les problèmes** : P0 bloquant (le lecteur ne peut pas comprendre ou agir, texte illisible, mention
   obligatoire absente) ; P1 majeur (gêne nette, contraste insuffisant, appel à l'action noyé) ; P2 mineur ; P3
   finition. Pour chacun : ce qui ne va pas, pourquoi cela gêne le lecteur, la correction concrète.
6. **Finir dans l'ordre** : corriger d'abord les P0 et P1, puis la typographie, puis la mise en page et
   l'espacement, puis la finition (alignements, détails, cohérence). Si la critique montre un visuel trop chargé,
   retirer avant d'ajouter : un élément de moins vaut mieux qu'un effet de plus.
7. **Revérifier sur le rendu** après chaque série de corrections, en regroupant les contrôles de l'étape 3.
8. **Dire ce qui fonctionne** (deux ou trois points précis) pour que la correction ne le casse pas.
9. **Tâche « système »**, à la place des étapes 2 à 8 :
   - *audit* : relever les noms incohérents (même composant nommé de deux façons), les valeurs codées en dur au lieu
     d'un jeton (couleurs, espacements, tailles de police), la complétude de chaque composant (variantes, états normal,
     survol, actif, focus, désactivé, chargement, erreur, documentation) ; finir par les trois actions qui apportent le
     plus. Une note globale n'est donnée que si sa grille est écrite ;
   - *documentation d'un composant* : à quoi il sert et quand l'utiliser, variantes, propriétés, états, accessibilité
     (rôle, clavier, annonce au lecteur d'écran), à faire et à éviter ;
   - *nouveau composant* : le besoin, les composants existants proches et pourquoi ils ne suffisent pas, propriétés,
     variantes, états, jetons utilisés, accessibilité, questions ouvertes à trancher. Principes : la cohérence avant
     l'invention, un composant non documenté n'existe pas, tout changement qui casse l'existant prévoit sa migration.

## Livrable

La critique : verdict de spécificité, points qui fonctionnent, problèmes classés de P0 à P3 avec leur correction ;
la version finie ou le brief corrigé ; la liste des contrôles faits sur le rendu et de ceux qui n'ont pas pu l'être.
Pour la tâche « système » : tableau des noms incohérents, tableau des valeurs codées en dur par famille de jetons,
tableau de complétude des composants et trois actions prioritaires ; ou la fiche du composant documenté ou proposé.

## Critères de réussite

- Aucun fait, prix, offre ou mention modifié par la finition.
- Aucun P0 ni P1 restant ; contrastes mesurés et conformes.
- Aucune des habitudes de l'étape 4 sans demande explicite du brief ; aucun tiret cadratin.
- La critique cite des éléments précis du visuel, pas des généralités, et dit pourquoi chaque problème gêne.
- Un audit de système cite chaque valeur codée en dur avec son emplacement ; aucune note sans grille écrite.

## Limites

- Sans capture ni rendu, la critique porte sur le brief et le dit : contraste, débordements et états ne sont pas
  vérifiés.
- Sans outil de génération d'image connecté, aucun visuel final n'est produit : la compétence livre un brief
  corrigé.
- Le goût du client prime : une demande explicite du brief l'emporte sur les refus de l'étape 4, à noter dans la
  critique.

## Exemple

Cas nominal : la maquette de la page « Assurance habitation » aligne trois cartes identiques avec une icône, un
titre et deux lignes, sous un surtitre « NOS SOLUTIONS ». Verdict : interchangeable avec n'importe quel courtier.
P1 : bouton « Prendre rendez-vous » gris clair sur blanc, contraste 2,3:1. P2 : surtitre et cartes génériques. P3 :
espacement identique au-dessus et en dessous des titres. Finition : le surtitre est retiré, les trois cartes
deviennent un paragraphe et une photo du bureau de Liège tirée de la fiche du client, le bouton passe en bleu de la
charte (contraste 7,1:1).

Cas nominal, tâche « système » : le site et les présentations d'un client utilisent quatre bleus proches et trois
hauteurs de bouton. L'audit relève chaque occurrence, propose deux jetons (bleu-action, bleu-texte) et une seule
hauteur, et classe en tête le bouton principal, présent sur toutes les pages.

Cas d'échec évité : pour « dynamiser » la page, un brouillon ajoutait « 98 % de clients satisfaits » en gros
chiffre. Le chiffre n'est dans aucune source : il est retiré et signalé.

## Origine de la méthode

Méthode adaptée et traduite de github.com/pbakaus/impeccable, `skill/reference/critique.md` (verdict de
spécificité, gravité P0 à P3, points qui fonctionnent) et `skill/reference/craft-floor.md` (plancher de contrôles :
contraste, espacement, typographie, états, textes ; liste des habitudes à refuser), commit
936867543ac2576920d663cc9803597f6044f3ac, licence Apache 2.0, Copyright 2025 Paul Bakaus (fichier `LICENSE` du dépôt).
Le fichier `NOTICE.md` du dépôt ne vise que `skill/reference/ios.md` et `skill/reference/android.md`, dont rien
n'est repris. Modifications : réécriture en français, modes simplifiés, ordre de finition, tiret cadratin proscrit,
aucun fait modifié, cas sans rendu. Première impression, utilisabilité et cohérence de la critique, et tâche « système » (audit des noms, des valeurs
codées en dur et de la complétude des composants ; documentation d'un composant ; conception d'un nouveau composant ;
principes de cohérence, de documentation et de migration) adaptées et traduites de
github.com/anthropics/knowledge-work-plugins, `design/skills/design-critique/SKILL.md` (« Critique Framework », « How
to Give Feedback ») et `design/skills/design-system/SKILL.md` (« Components of a Design System », « Principles »,
formats « Audit », « Document », « Extend »), commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0.
Modifications : réécriture en français, note d'audit seulement avec une grille écrite. Texte des licences et liste des
reprises : `organisation/skills/LICENCES-TIERS.md`.
