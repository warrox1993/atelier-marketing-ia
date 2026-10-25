---
name: "humanisation-texte-fr"
description: "Retire d'un texte français les tics d'écriture des modèles d'IA (vocabulaire gonflé, anglicismes, ouvertures et conclusions toutes faites, participes en -ant en cascade, règle de trois systématique, gras et listes mécaniques, typographie incohérente, uniformité des phrases) sans changer le sens, le registre ni aucun fait. À utiliser en dernière passe sur un texte rédigé avant relecture ou validation (article, publication, courriel, proposition, communiqué) ; jamais pour ajouter une anecdote, une opinion ou un chiffre absent des sources."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "contenu"
---

# Humanisation d'un texte français

## Quand l'utiliser

- Un texte rédigé (article, publication, page, courriel, proposition, communiqué) sonne « généré » : formules
  creuses, rythme uniforme, vocabulaire gonflé.
- Un relecteur ou un client a signalé un texte « qui fait IA ».
- Avant de déposer la version finale d'un texte destiné à un lecteur humain.

## Objectif

Un texte qui se lit comme écrit par une personne du métier, au bon registre, avec exactement les mêmes faits,
sources, chiffres, offres et mentions que la version d'origine.

## Prérequis

- Le texte à traiter et ses sources : la passe ne touche à aucun fait.
- Le registre attendu (soutenu, courant, familier) et le support (réseau social, article, courrier officiel). S'ils
  ne ressortent ni du brief ni du texte, poser la question avant de commencer.
- La charte de marque (compétence `charte-marque`) : ton, mots à éviter, tutoiement ou vouvoiement.

## Entrées

- `texte` : la version à traiter.
- `registre` et `support`.
- `contraintes` : longueur, mentions obligatoires, format propre au canal.

## Étapes

1. **Fixer le registre et ne jamais l'abaisser.** Un texte soutenu reste soutenu. L'ennemi est l'écriture toute
   faite, pas l'écriture formelle : une subordonnée bien construite ou un connecteur précis (« néanmoins »,
   « toutefois ») sont du bon français.
2. **Repérer les tics par famille** et noter leur densité par paragraphe :
   - *contenu* : importance gonflée (« véritable pilier », « joue un rôle clé ») ; analyses plaquées en participe
     présent (« ..., soulignant ainsi ... ») ; langage de brochure ; attributions vagues (« les experts
     s'accordent ») ; section « défis et perspectives » sans contenu ;
   - *vocabulaire* : « crucial », « essentiel », « également » répété, « notamment » répété, « robuste »,
     « holistique », « levier », « au cœur de », « dans le paysage actuel », « il convient de noter que »,
     « permettre de » et « favoriser » au lieu d'un verbe concret, jargon administratif hors contexte
     (« dispositif », « acteurs », « enjeux ») ;
   - *anglicismes* : « faire du sens » (avoir du sens), « adresser un problème » (traiter), « impacter »
     (toucher), « supporter » au sens de soutenir, « définitivement » au sens d'assurément, virgule avant « et »
     dans une énumération ;
   - *construction* : évitement du verbe être (« constitue », « se positionne comme ») ; parallélismes négatifs
     (« ce n'est pas X, c'est Y ») ; règle de trois partout ; doublets d'adjectifs (« robuste et fiable ») ;
     synonymes qui tournent pour éviter une répétition ;
   - *forme* : tiret cadratin (proscrit dans l'atelier : virgule, deux-points ou parenthèses) ; gras posé
     mécaniquement ; listes à puces avec intitulé en gras et deux-points pour ce qui serait un paragraphe ;
     majuscules à l'anglaise dans les titres ; émojis qui décorent la structure ; guillemets et apostrophes
     mélangés (en français : « » avec espaces insécables, apostrophe typographique) ; balisage Markdown resté
     dans un texte qui n'en veut pas ;
   - *discours* : annonce du plan et récapitulation finale, écho de la consigne (« Voici un article sur ... »),
     ouvertures toutes faites (« À l'ère de », « Dans un monde où »), conclusions toutes faites (« En
     conclusion », « En somme ») suivies d'une généralité positive ; ton servile ; prudence excessive ; tous les
     paragraphes de même longueur et même moule ; faux équilibre « d'un côté, de l'autre » sans prise de
     position quand la source en prend une.
3. **Appliquer la règle des trois signaux** : un tic isolé est normal en français ; trois tics ou plus dans le même
   paragraphe le rendent suspect. Réécrire en priorité ces paragraphes, sans traquer chaque occurrence : un texte
   qui évite tout mécaniquement devient uniforme d'une autre façon.
4. **Réécrire** : remplacer le mot gonflé par le terme du métier ou le supprimer ; remplacer « permettre de » par
   ce qui se passe vraiment ; rétablir « est » et « a » ; casser la règle de trois quand deux éléments suffisent ;
   faire varier la longueur des phrases (une courte après deux longues) ; commencer par le contenu, finir sur un
   fait concret plutôt que sur une généralité.
5. **Donner de la voix sans inventer** : la voix vient de ce qui est déjà dans les sources et le brief (un détail
   précis, un lieu, une date, une citation sourcée, la position assumée du client). Aucune anecdote, opinion,
   témoignage ou chiffre n'est ajouté pour « humaniser ».
6. **Respecter le format du canal** : une accroche de réseau social, la structure d'un communiqué ou une liste
   attendue par le client peuvent garder une forme signalée à l'étape 2 ; c'est le format qui parle, pas la
   machine.
7. **Faire une seule passe**, puis une relecture finale avec la question « Qu'est-ce qui trahit encore une
   écriture automatique ? » et corriger ce qui reste. Ne pas repasser plusieurs fois le même texte : chaque passe
   aplatit la voix. Si le texte sonne encore creux, il manque du contenu ancré (fait, date, preuve), à demander
   au rédacteur.
8. **Comparer les faits** entre l'avant et l'après : noms, chiffres, prix, délais, offres, mentions légales et
   appels à l'action doivent être identiques.

## Livrable

La version réécrite ; la liste courte des familles de tics retirées ; le contrôle des faits (« faits identiques » ou
écart précis) ; les questions ouvertes (registre, contenu manquant).

## Critères de réussite

- Sens, registre, faits, chiffres, mentions et appel à l'action inchangés.
- Aucun paragraphe ne cumule trois tics ou plus ; aucun tiret cadratin.
- Typographie française cohérente (guillemets, espaces insécables, apostrophes).
- Aucune information, opinion ou anecdote ajoutée.

## Limites

- La compétence ne rend pas un texte « indétectable » par un outil : elle vise un français naturel pour un lecteur
  humain.
- Elle ne remplace ni la relecture indépendante (`relecture-independante`) ni le contrôle des communications
  réglementées.
- Pour un texte néerlandais ou anglais, elle ne s'applique pas (compétence `adaptation-fr-nl-en` pour les
  versions).

## Exemple

Avant : « Dans le paysage actuel de l'assurance, il est crucial de noter que notre bureau constitue un véritable
pilier pour les familles liégeoises, offrant un accompagnement robuste et personnalisé, favorisant ainsi leur
sérénité. »

Après : « Depuis 1998, notre bureau de Liège fait le point avec chaque famille avant de proposer un contrat. »
(La date et le lieu viennent de la fiche du client ; « sérénité » est retiré faute de preuve.)

Cas d'échec évité : pour « donner de la voix », un brouillon ajoutait « Marie, cliente depuis dix ans, en
témoigne ». Aucun témoignage n'est dans les sources : la phrase est retirée.

## Origine de la méthode

Méthode adaptée et traduite de github.com/samber/cc-skills, `skills/humaniseur-fr/SKILL.md` (version 1.1.3), commit
f866b800353719270a9ea101a41c5e2a2618d460, licence MIT, Copyright (c) 2026 Samuel Berthe : familles de tics
(contenu, vocabulaire, anglicismes, construction, forme, discours), registre jamais abaissé, règle des trois signaux,
une seule passe suivie d'une relecture finale, priorité au format du canal. Modifications : réécriture en français
de la méthode, interdiction d'ajouter tout fait ou toute opinion, tiret cadratin proscrit, contrôle des faits avant
et après, renvois aux compétences de l'atelier. Texte de la licence et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
