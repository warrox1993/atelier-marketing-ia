---
name: "entretien-client-sans-biais"
description: "Prépare un guide d'entretien client fondé sur des faits passés (règles de The Mom Test de Rob Fitzpatrick), interdit les questions qui flattent une idée, fournit la grille de classement des notes (faits, douleurs, engagements, compliments, opinions) et la synthèse sur 5 à 10 entretiens. L'entretien est mené par un humain : sans entretien réel, la réponse est « inconnu ». À utiliser pour comprendre pourquoi des clients choisissent ou quittent un courtier, avant de fixer un positionnement ou un message."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "etudes"
---

# Entretien client sans biais

## Quand l'utiliser

- Avant un positionnement, une offre ou une campagne, quand la stratégie du client repose sur des suppositions.
- Quand des clients ou prospects consentants peuvent être interrogés par un humain de l'entreprise.
- Pour classer des comptes rendus d'entretiens déjà réalisés.

## Objectif

Obtenir des faits sur la vie réelle du client (ce qu'il a fait, combien cela lui a coûté, pourquoi il a changé) plutôt que
des opinions polies sur une idée, et en tirer une synthèse exploitable par les compétences `analyse-jobs-a-faire` et
`points-entree-categorie`. Niveau de preuve des règles : [vérifié] ; numéros de chapitres de l'ouvrage : [mémoire].

## Prérequis

- Le document de stratégie du client, tenu par l'agent `stratege`, lu avant de produire.
- Une liste de clients ou prospects qui acceptent l'entretien, avec l'information et la base légale RGPD documentées.
- Un humain de l'entreprise pour mener les entretiens : l'agent n'interroge personne.

## Entrées

- `questions_apprentissage` : trois questions que l'étude doit éclairer (par exemple : comment une PME de la zone choisit-elle
  son courtier ? qu'est-ce qui la fait changer ?).
- `participants` : rôles et situations (jamais de données personnelles brutes dans les livrables).
- `notes` : comptes rendus d'entretiens, s'il y en a déjà.

## Étapes

1. Fixer les trois questions d'apprentissage et les écrire en tête du dossier.
2. Rédiger un guide de 8 à 10 questions factuelles au passé : « racontez la dernière fois que... », « qu'avez-vous fait
   ensuite ? », « combien cela vous a-t-il coûté ? », « qui d'autre a participé à la décision ? ».
3. Interdire dans le guide : « achèteriez-vous... », « que pensez-vous de notre idée ? », « à l'avenir, feriez-vous... ».
   Trois règles : parler de la vie du client et non de l'idée ; demander des faits passés précis, pas des opinions sur
   l'avenir ; faire parler le client plus que soi.
4. Après chaque entretien mené par l'humain, classer chaque note dans une catégorie : fait, douleur, engagement (rendez-vous
   fixé, introduction, achat), compliment (à ignorer), opinion (poids faible).
5. Agréger sur 5 à 10 entretiens : faits qui reviennent, douleurs, engagements obtenus ; marquer les points vus une seule fois.
6. Transmettre la synthèse à `analyse-jobs-a-faire` et `points-entree-categorie`.

## Livrable

Un dossier : questions d'apprentissage, guide d'entretien, grille de classement vierge puis remplie, synthèse des faits
récurrents avec leur nombre d'occurrences, liste des inconnues restantes. Verbatims anonymisés ; les propos cités sont
ceux des notes fournies, jamais reformulés comme citations.

## Critères de réussite

- Chaque question du guide porte sur un fait passé ou un comportement réel.
- Chaque affirmation de la synthèse renvoie à au moins une note, avec son nombre d'occurrences.
- Les compliments sont séparés des faits et ne pèsent pas dans la conclusion.
- Sans entretien réel, la synthèse dit « inconnu » et ne propose aucune réponse type inventée.

## Limites

- Un agent IA ne mène pas l'entretien et n'invente jamais de réponses « types » de clients.
- Cinq à dix entretiens donnent des pistes, pas une mesure statistique.
- Un client qui parle de lui par politesse reste un biais : l'engagement concret (rendez-vous, introduction) pèse plus que le compliment.

### Règles de vérité

- Les occurrences se comptent entretien par entretien : chaque fait liste les identifiants des entretiens où il apparaît (E1, E2...) et son total « n sur N ». Un compte qui ne se retrouve pas dans les notes est faux.
- Un fait cité par un seul client est « isolé (1 sur N) ». Il n'est jamais écrit comme récurrent, fréquent ou général. Un fait n'est récurrent qu'à partir de deux entretiens distincts.
- Les verbatims sont copiés mot pour mot depuis les notes, entre guillemets, avec l'identifiant anonyme de l'entretien. Un propos reformulé n'est pas un verbatim : il se range dans la synthèse, sans guillemets. Pas de passage exact dans les notes, pas de verbatim.
- Aucune réponse, aucun fait, aucune cause n'est déduit au-delà des notes. Ce que les notes ne disent pas va dans les inconnues restantes. Aucun nom, aucune coordonnée n'est repris.
- Compliments et opinions sont séparés des faits et ne comptent pas dans la conclusion.

### Modèle de livrable

À recopier, tous les champs sont obligatoires.

**Questions d'apprentissage** : trois.

**Faits** (classés par nombre d'occurrences)

| Fait | Entretiens | Occurrences | Statut (récurrent ou isolé) |
| --- | --- | --- | --- |
| (fait tiré des notes) | (E1, E3...) | (n sur N) | (récurrent ou isolé) |

**Douleurs, engagements concrets, compliments et opinions** : une rubrique chacune, avec identifiant d'entretien.

**Verbatims anonymisés** : « (propos exact) » (E3), un par fait important.

**Inconnues restantes** : liste de ce que les notes ne permettent pas de dire.

## Exemple

Cas nominal : un courtier veut comprendre pourquoi des indépendants le quittent. Questions d'apprentissage : comment
choisissent-ils un courtier, qu'ont-ils fait au dernier renouvellement, qu'est-ce qui les a fait partir ? Guide : « Racontez
le dernier renouvellement de votre assurance professionnelle. Qu'avez-vous fait avant d'appeler ? Combien de temps cela
a-t-il pris ? » Après six entretiens, quatre notes indiquent un sinistre refusé sans explication : fait récurrent, transmis
à l'analyse des jobs.

Cas d'échec évité : on demande de « simuler cinq clients qui répondent à notre idée ». La compétence refuse : sans
entretien réel, la sortie est « inconnu » et elle propose le guide pour que l'humain mène de vrais entretiens.

## Origine de la méthode

Rob Fitzpatrick, *The Mom Test* (2013) : règles [vérifié], chapitres 1 et 2 [mémoire]. Procédure adaptée et traduite pour
l'Atelier ; aucune phrase de l'ouvrage n'est reproduite.
