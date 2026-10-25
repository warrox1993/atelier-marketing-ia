---
name: "fiche-transmission-developpeurs"
description: "Rédige la fiche de transmission d'une maquette validée à ceux qui vont la développer (prestataire web, développeur interne) : vue d'ensemble et contexte, grille et points de rupture, jetons de design utilisés plutôt que des valeurs brutes, composants et variantes, tous les états (normal, survol, actif, désactivé, chargement, erreur, vide), comportement selon la largeur d'écran, cas limites (texte long, traduction, données manquantes, connexion lente), animations avec durée et courbe, notes d'accessibilité (ordre du focus, rôles, clavier, annonces) et raisons des choix. À utiliser quand une page, un formulaire ou un écran passe du design au développement ; jamais pour inventer une valeur absente de la maquette ni pour valider le résultat développé à la place d'un contrôle."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "informatique"
---

# Fiche de transmission aux développeurs

## Quand l'utiliser

- Une maquette de page, de formulaire ou d'écran est validée et part chez un prestataire ou un développeur.
- Un dossier de changement (`demande-de-changement`) porte sur une interface et doit en décrire le comportement.
- Un développement revient avec des écarts et il faut écrire ce qui était attendu.

## Objectif

Une fiche qui ne laisse rien à deviner : ce qui n'est pas spécifié sera deviné par le développeur. Chaque valeur
renvoie à un jeton ou à la maquette, chaque choix important porte sa raison.

## Prérequis

- La maquette validée (fichier, captures à chaque largeur) et son contenu validé.
- Le système de design s'il existe (jetons, composants ; voir le mode « système » de `design-visuel-sobre`).
- La pile technique visée, si elle est connue, pour adapter les notes.

## Entrées

- `ecran` : nom de la page ou de la fonction.
- `maquette` et `systeme_design` (facultatif).
- `contraintes` : navigateurs, langues, performances, délais.

## Étapes

1. **Écrire la vue d'ensemble** : ce que fait l'écran, pour qui, dans quel parcours.
2. **Décrire la mise en page** : grille, marges, points de rupture et comportement entre eux.
3. **Lister les jetons utilisés** (couleur, typographie, espacement, rayon, ombre) avec leur valeur et leur usage.
   Référencer le jeton (« espacement-moyen »), pas la valeur brute ; une valeur de la maquette sans jeton est signalée.
4. **Lister les composants** : composant, variante, propriétés, comportement particulier.
5. **Spécifier tous les états** de chaque élément interactif : normal, survol, actif, focus, désactivé, chargement,
   erreur, vide ; un état absent de la maquette est écrit « à concevoir », pas inventé.
6. **Décrire le comportement par largeur** : ordinateur, tablette, téléphone, ce qui change à chaque palier.
7. **Traiter les cas limites** : contenu minimal et maximal, texte long et règle de coupure, version néerlandaise ou
   anglaise plus longue, données manquantes, connexion lente, nombre élevé d'éléments.
8. **Spécifier les animations** : élément, déclencheur, effet, durée en millisecondes, courbe, et la variante quand la
   personne demande moins de mouvement.
9. **Écrire les notes d'accessibilité** : ordre du focus, étiquettes et rôles, interactions au clavier, annonces aux
   lecteurs d'écran (à contrôler avec `accessibilite-wcag`).
10. **Donner les raisons** des choix qui pourraient sembler arbitraires (« le menu se replie sur téléphone parce que
    la page se consulte d'une main sur un chantier »), pour que le développeur tranche bien un cas imprévu.

## Livrable

La fiche : vue d'ensemble, mise en page, tableau des jetons, tableau des composants, tableau des états et
interactions, comportement par largeur, cas limites, tableau des animations, notes d'accessibilité, raisons, et la
liste des éléments « à concevoir » ou « valeur sans jeton ».

## Critères de réussite

- Chaque élément interactif a tous ses états spécifiés ou marqués « à concevoir ».
- Aucune valeur inventée : tout vient de la maquette ou du système de design.
- Les cas limites et l'accessibilité sont traités, pas renvoyés « au développement ».

## Limites

- La fiche ne remplace pas la recette : le résultat développé se contrôle sur le rendu réel (`design-visuel-sobre`,
  `accessibilite-wcag`, `controles-techniques-liens`).
- Sans maquette des états ou des largeurs, la fiche le dit et liste ce qui reste à concevoir.

## Exemple

Cas nominal : formulaire « Demander un devis ». Jetons : couleur-action, texte-courant, espacement-moyen. États du
bouton : normal, survol (fond assombri selon le jeton couleur-action-survol), chargement (indicateur, bouton inactif),
erreur. Téléphone : champs empilés, bouton en pleine largeur. Cas limite : nom d'entreprise de 120 caractères, coupé
sur deux lignes. Accessibilité : focus dans l'ordre visuel, erreurs annoncées sans déplacer le focus.

Cas d'échec évité : la maquette ne montre pas l'état « envoi réussi ». La fiche ne l'invente pas : elle l'inscrit
« à concevoir » et propose de le demander au designer.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `design/skills/design-handoff/SKILL.md`
(spécifications visuelles, d'interaction et de contenu, cas limites, accessibilité, quatre principes : ne rien
supposer, jetons plutôt que valeurs, tous les états, dire pourquoi ; format de la fiche), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : réécriture en français, état absent
marqué « à concevoir » au lieu d'être inventé, mouvement réduit, renvois aux contrôles de l'usine. Texte de la licence
et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
