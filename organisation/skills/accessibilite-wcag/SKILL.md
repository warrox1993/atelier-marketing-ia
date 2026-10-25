---
name: "accessibilite-wcag"
description: "Audite l'accessibilité d'une page web, d'un formulaire, d'une application ou d'une maquette selon les WCAG 2.2 niveau AA : critères clés des quatre principes (perceptible, utilisable, compréhensible, robuste), contrastes mesurés, parcours au clavier, ordre et visibilité du focus, étiquettes et messages d'erreur, taille des cibles, agrandissement à 200 % et affichage sur 320 pixels de large, restitution par lecteur d'écran ; constats classés bloquant, majeur ou mineur avec le critère cité et la correction, et liste de ce qui demande un test manuel. À utiliser avant la mise en ligne d'une page ou d'un formulaire, avant une transmission aux développeurs ou pour relire un site existant ; jamais pour déclarer un site conforme ni pour remplacer un test avec des personnes et des technologies d'assistance."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "creation"
---

# Audit d'accessibilité selon les WCAG

## Quand l'utiliser

- Une page, un formulaire ou une interface va être mis en ligne.
- Une maquette doit être relue avant la transmission aux développeurs (`fiche-transmission-developpeurs`).
- Un client demande où en est l'accessibilité de son site ou doit préparer une déclaration d'accessibilité.

## Objectif

Une liste de constats précis, chacun relié à un critère des WCAG, à sa gravité et à sa correction, qui distingue ce qui
a été vérifié de ce qui reste à tester à la main.

## Prérequis

- L'objet à auditer : adresse de la page, fichier, maquette ou captures à la taille réelle.
- La charte (couleurs exactes en hexadécimal) pour mesurer les contrastes.
- Le contexte : public visé, secteur public ou privé, présence d'un service soumis à des exigences légales
  d'accessibilité.

## Entrées

- `objet` : page, formulaire, application ou maquette.
- `parcours` : la ou les tâches à accomplir (par exemple « demander un devis »).
- `norme` : WCAG 2.2 niveau AA par défaut ; WCAG 2.1 AA si un texte applicable ou un marché l'impose.

## Étapes

1. **Commencer par le contraste et le clavier**, qui révèlent les défauts les plus fréquents et les plus gênants.
2. **Perceptible** : texte de remplacement des images utiles et image décorative ignorée (1.1.1) ; structure portée par
   le balisage (titres, listes, tableaux, 1.3.1) ; contraste du texte d'au moins 4,5:1, 3:1 pour le grand texte
   (1.4.3) ; contraste de 3:1 pour les composants et graphiques utiles (1.4.11) ; contenu lisible à 200 % (1.4.4) et sans
   défilement horizontal sur 320 pixels de large (1.4.10) ; information jamais portée par la seule couleur (1.4.1).
3. **Utilisable** : toute fonction accessible au clavier (2.1.1) sans piège (2.1.2), y compris dans les fenêtres
   modales ; ordre du focus logique (2.4.3) ; focus visible (2.4.7) et non masqué par un élément collant (2.4.11) ;
   cibles d'au moins 24 sur 24 pixels CSS ou assez espacées (2.5.8) ; titres de page et intitulés de liens
   explicites (2.4.2, 2.4.4) ; pas de limite de temps sans possibilité de la prolonger (2.2.1) ; média sans lecture
   automatique non maîtrisable (1.4.2).
4. **Compréhensible** : langue de la page déclarée (3.1.1) ; aucun changement inattendu au focus (3.2.1) ; erreur
   identifiée et décrite en texte (3.3.1) ; étiquette ou consigne pour chaque champ (3.3.2) ; suggestion de correction
   (3.3.3) ; pas de test cognitif imposé à la connexion (3.3.8).
5. **Robuste** : nom, rôle et valeur de chaque composant exposés aux technologies d'assistance (4.1.2), messages d'état
   annoncés sans déplacer le focus (4.1.3).
6. **Mesurer les contrastes** : tableau élément, couleur du texte, couleur du fond, rapport, seuil, conforme ou non.
7. **Décrire le parcours au clavier** et la restitution attendue par un lecteur d'écran des éléments clés.
8. **Classer** chaque constat : bloquant (une personne ne peut pas accomplir la tâche), majeur (gêne nette), mineur. Pour
   chacun : critère, élément, ce qui ne va pas, correction concrète.
9. **Lister ce qui reste à tester à la main** : un contrôle automatique ne trouve qu'une partie des défauts ; parcours
   avec NVDA ou VoiceOver, zoom réel, test avec des personnes concernées.

## Livrable

Rapport daté : norme et niveau, résumé (nombre de constats par gravité), constats par principe, tableau des contrastes,
parcours au clavier, restitution par lecteur d'écran, corrections prioritaires, tests manuels restants.

## Critères de réussite

- Chaque constat cite un critère numéroté et une correction.
- Les contrastes sont mesurés sur les couleurs exactes, pas estimés à l'œil.
- Le rapport ne conclut jamais « conforme » : il dit ce qui a été vérifié et ce qui ne l'a pas été.

## Limites

- Sans rendu ni code, l'audit d'une maquette ne vérifie ni le clavier ni la restitution : il le dit.
- La cible de 44 sur 44 pixels (2.5.5) relève du niveau AAA ; elle peut être recommandée, jamais exigée au titre du AA.
- Pour un document Word, PDF ou une présentation, les contrôles propres aux fichiers sont dans
  `documents-bureautiques`.

## Sources officielles

- W3C, Web Content Accessibility Guidelines (WCAG) 2.2, recommandation du 12 décembre 2024,
  https://www.w3.org/TR/WCAG22/ (lue le 24/10/2026) : critères cités ci-dessus, 2.5.8 au niveau AA (24 sur 24 pixels
  CSS), 2.5.5 au niveau AAA (44 sur 44), 4.1.1 « obsolète et retiré ».

## À vérifier par un professionnel

- Les obligations légales qui s'appliquent au client : la loi belge du 19 juillet 2018 sur l'accessibilité des sites et
  applications mobiles des organismes du secteur public, et la directive (UE) 2019/882 sur les exigences
  d'accessibilité des produits et services, applicable depuis le 28 juin 2025 et transposée en Belgique par plusieurs
  textes fédéraux et régionaux [références exactes à revérifier par un juriste].
- La norme européenne EN 301 549 et la version des WCAG qu'elle reprend, si un marché public la cite.

## Exemple

Cas nominal : formulaire « Demander un devis ». Bloquant : le bouton d'envoi n'est pas atteignable au clavier (2.1.1).
Majeur : texte gris #8a8a8a sur blanc, 3,45:1 au lieu de 4,5:1 (1.4.3) ; erreurs signalées par une bordure rouge seule
(1.4.1 et 3.3.1). Mineur : focus peu visible sur les cases à cocher (2.4.7). Tests restants : parcours avec NVDA.

Cas d'échec évité : un outil automatique ne signalait aucune erreur. Le rapport ne conclut pas à la conformité : le
parcours au clavier révèle le bouton inatteignable.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins,
`design/skills/accessibility-review/SKILL.md` (critères par principe, défauts fréquents, démarche de test en cinq
temps, constats classés avec critère et correction, tableaux de contraste, de clavier et de lecteur d'écran),
commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : réécriture en français, passage aux
WCAG 2.2 (2.5.8 au niveau AA, 2.5.5 rappelé au niveau AAA, 2.4.11 et 3.3.8 ajoutés), cadre légal belge et européen à
faire vérifier, aucune déclaration de conformité. Texte de la licence et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
