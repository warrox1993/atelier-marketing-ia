---
name: "textes-interface"
description: "Rédige ou relit les textes d'une interface (boutons, messages d'erreur, états vides, fenêtres de confirmation, infobulles, chargement, premiers pas, champs de formulaire) : contexte et état de la personne d'abord, cinq principes (clair, bref, constant, utile, humain), modèles par type de texte, ton adapté au moment, recommandation et deux ou trois variantes, justification et notes pour la traduction en néerlandais et en anglais. À utiliser pour un formulaire, une page de conversion, un outil interne ou une application ; jamais pour changer une mention légale, une offre ou un fait, ni pour promettre ce que le produit ne fait pas."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "creation"
---

# Textes d'interface

## Quand l'utiliser

- Un formulaire, une page de demande de devis ou un tunnel d'inscription a besoin de ses libellés et messages.
- Un message d'erreur, un état vide ou une confirmation doit être écrit ou relu.
- Les textes d'un outil interne ou d'une application sont incohérents d'un écran à l'autre.

## Objectif

Des textes qui aident la personne à finir sa tâche du premier coup : chaque mot sert, les mêmes choses portent le même
nom partout, et chaque texte peut se traduire sans perdre son sens.

## Prérequis

- L'écran ou le parcours, avec ce que la personne veut faire et dans quel état elle est (pressée, inquiète, en
  erreur).
- Le ton de l'entreprise (`charte-marque`) et son glossaire s'il existe.
- Les contraintes : nombre de caractères, consignes de la plateforme, langues de diffusion.

## Entrées

- `contexte` : écran, parcours ou fonction.
- `textes` : à rédiger (liste des éléments) ou à relire (textes actuels).
- `contraintes` : longueur, ton, langues.

## Étapes

1. **Fixer le contexte** : tâche de la personne, moment du parcours, ce qui vient de se passer.
2. **Appliquer les cinq principes** : clair (sans jargon ni ambiguïté), bref (le moins de mots qui portent tout le
   sens), constant (même terme pour la même chose partout), utile (chaque mot aide à agir), humain (comme une personne
   serviable, pas une machine).
3. **Suivre le modèle du type de texte** :
   - *bouton et appel à l'action* : un verbe et son objet (« Envoyer ma demande », pas « Valider ») ; le libellé
     annonce ce qui se passe ;
   - *message d'erreur* : ce qui s'est passé, pourquoi, comment corriger (« Le paiement a été refusé par votre banque.
     Essayez une autre carte ou contactez-la. ») ; jamais de code seul ni de reproche ;
   - *état vide* : ce que c'est, pourquoi c'est vide, comment commencer ;
   - *confirmation* : l'action nommée (« Supprimer 3 fichiers ? »), la conséquence (« Cette action est
     définitive. »), des boutons qui nomment l'action (« Supprimer les fichiers » et « Garder les fichiers ») ;
   - *infobulle* : brève, jamais une évidence ;
   - *chargement* : dire ce qui se passe et, si possible, combien de temps ;
   - *premiers pas* : une notion à la fois ;
   - *champ de formulaire* : étiquette visible (pas seulement un texte d'exemple), format attendu, caractère
     facultatif ou obligatoire dit en clair.
4. **Adapter le ton au moment** : réussite sobre, erreur bienveillante et utile, avertissement clair et actionnable,
   information neutre. Vouvoiement par défaut, sauf charte contraire.
5. **Proposer une recommandation et deux ou trois variantes** (ton, longueur, cas d'usage) et justifier le choix.
6. **Préparer la traduction** : expressions idiomatiques évitées, place pour un texte plus long en néerlandais ou en
   allemand, variables et accords signalés ; la version traduite passe par `adaptation-fr-nl-en`.
7. **Relier à l'accessibilité** : textes d'erreur lisibles par un lecteur d'écran, intitulés de liens explicites
   (voir `accessibilite-wcag`).

## Livrable

Pour chaque élément : le texte recommandé, deux ou trois variantes en tableau (texte, ton, quand l'utiliser), la
justification, les notes de traduction ; pour une relecture, le texte actuel, le problème et la correction.

## Critères de réussite

- Chaque bouton nomme son action ; chaque erreur dit quoi faire.
- Un même objet porte le même nom sur tous les écrans relus.
- Aucun fait, prix, délai ou mention légale modifié ou ajouté.

## Limites

- Les mentions obligatoires (consentement, information précontractuelle, mentions légales) sont fournies par le
  responsable : la compétence peut les rendre lisibles, jamais les reformuler sur le fond.
- Elle ne teste pas les textes auprès des personnes : un test réel reste à prévoir pour un parcours important.

## Exemple

Cas nominal : formulaire de demande de devis. Bouton « Soumettre » remplacé par « Recevoir mon devis ». Erreur
« Champ invalide » remplacée par « Le numéro de téléphone doit compter 9 ou 10 chiffres, au format 04xx xx xx xx. »
Champ « Téléphone (facultatif) » avec la raison de la demande en une ligne. Note de traduction : « devis » se dit
« offerte » en néerlandais, prévoir 20 % de longueur en plus.

Cas d'échec évité : un brouillon d'état vide promettait « Réponse en 1 heure ». Aucun délai n'est dans la fiche du
client : la promesse est retirée et signalée.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `design/skills/ux-copy/SKILL.md`
(contexte et état de la personne, cinq principes, modèles par type de texte, ton selon le moment, recommandation,
variantes, justification et notes de traduction), commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache
2.0. Modifications : réécriture en français, champs de formulaire, vouvoiement, langues belges, aucun fait ajouté.
Texte de la licence et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
