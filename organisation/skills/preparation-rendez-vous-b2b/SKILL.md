---
name: "preparation-rendez-vous-b2b"
description: "Prépare un rendez-vous commercial avec une entreprise belge : fiche entreprise à partir des données publiques (BCE, comptes annuels de la Banque nationale), besoins probables, carte des interlocuteurs (rôle, engagement, position, preuve), questions de découverte, objections probables, prochaine étape à obtenir. À utiliser avant un premier contact, une découverte, une démonstration ou un point de suivi ; jamais pour contacter l'entreprise, conseiller le client ni présenter une hypothèse comme un fait."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "commercial"
---

# Préparation d'un rendez-vous B2B

## Quand l'utiliser

- Un rendez-vous est fixé avec une entreprise (prospect ou client) et il faut une fiche d'une page.
- Un dossier existe déjà (notes d'échanges, offre envoyée) et le prochain rendez-vous doit être cadré.
- Une liste de prospects est passée en rendez-vous et chaque fiche doit être préparée.

## Objectif

Donner à la personne qui mène le rendez-vous une fiche d'une page qui sépare nettement ce qui est établi (dossier, registres publics), ce qui est supposé, et ce qu'il reste à demander, avec les questions à poser dans l'ordre utile.

## Prérequis

- Le nom ou le numéro d'entreprise de l'interlocuteur, l'objectif du rendez-vous (découvrir, présenter, relancer, conclure) et sa date.
- Le dossier rattaché et les notes précédentes, s'ils existent.
- Les connexions de lecture `bce` et `bnb` si disponibles ; sinon l'écrire, et demander à l'humain de consulter les registres publics (voir « Sources officielles »).

## Entrées

- `entreprise` : dénomination ou numéro d'entreprise à dix chiffres.
- `objectif` : ce que le rendez-vous doit produire (décision, information, accord de principe).
- `dossier` : notes et documents déjà rattachés à la tâche.

## Étapes

1. Établir l'identité de l'entreprise. Source publique : la Banque-Carrefour des Entreprises (BCE), dont la consultation des données publiques est gratuite. Relever : dénomination, numéro d'entreprise, statut, situation juridique, forme juridique, adresse du siège, date de début, activités (codes NACE). Avec les outils : `bce_rechercher`, puis déposer la réponse brute sur la tâche si la procédure du service l'exige.
2. Lire la taille et la santé financière à partir des comptes annuels publics (Centrale des bilans de la Banque nationale de Belgique), avec `bnb_comptes` : chiffre d'affaires ou marge brute selon le schéma, effectif, résultat, fonds propres. Noter l'exercice. Une petite entreprise dépose souvent un schéma abrégé sans chiffre d'affaires : écrire « non publié », ne pas estimer.
3. Dresser la carte des interlocuteurs : dirigeants et fonctions publiées à la BCE, plus ce que le dossier connaît. Pour chacun : rôle dans la décision (relais interne, décideur financier, évaluateur, influenceur, opposant, inconnu), engagement (actif : rencontré il y a moins de 14 jours, tiède, froid, jamais rencontré), position (favorable, neutre, défavorable, inconnue) et preuve (dernier échange daté). « Relais interne » seulement pour une personne qui a déjà agi (introduction, information partagée, réunion obtenue) ; « inconnu » plutôt que deviner ; une fonction non confirmée s'écrit « à confirmer ». Signaler les rôles sans personne identifiée (décideur financier absent, par exemple) et le risque d'interlocuteur unique.
4. Formuler 3 à 5 hypothèses de besoins, chacune étiquetée « supposé » avec le signal qui la fonde (secteur, taille, croissance, ancienneté, ce que le dossier dit). Aucune hypothèse n'est présentée comme un besoin avéré.
5. Rédiger 8 à 12 questions de découverte, ouvertes, dans cet ordre : contexte de l'entreprise, situation actuelle et fournisseur en place, problème ou projet déclencheur, enjeux chiffrés, calendrier, budget et mode de décision, critères de choix, prochaine étape. Une question par besoin à confirmer.
6. Lister 4 à 6 objections probables (prix, fournisseur en place, mauvais moment, décision ailleurs, doute sur le résultat) avec, pour chacune, la question à poser pour comprendre ce qu'elle cache. Pas de formule de réponse manipulatrice.
7. Écrire la prochaine étape à obtenir (second rendez-vous, envoi de documents, présentation à un décideur) et la liste des « informations manquantes » avec la question précise pour chacune.

## Livrable

Une fiche d'une page : objectif et date ; identité et chiffres publics (avec la source et la date de lecture) ; carte des interlocuteurs (tableau rôle, engagement, position, preuve) et rôles manquants ; hypothèses étiquetées « supposé » ; questions de découverte ; objections probables et questions de compréhension ; prochaine étape ; informations manquantes.

## Critères de réussite

- Chaque donnée d'identité ou chiffre porte sa source et la date de lecture ; rien n'est inventé ni arrondi à l'estime.
- Aucune hypothèse n'est écrite comme un fait ; l'absence d'information est écrite « information manquante ».
- Les questions sont ouvertes, utilisables telles quelles, et ne contiennent aucune recommandation de produit.
- Chaque interlocuteur a un rôle, un engagement et une position prouvés ou marqués « inconnu ».
- La fiche tient sur une page.

## Limites

- Les registres publics ne disent rien de l'intérêt de l'entreprise pour l'offre : ils donnent un profil, pas un besoin.
- Les comptes annuels ont souvent plus d'un an et peuvent manquer (dépôt tardif, entreprise récente, personne physique) : le dire.
- Une personne physique ou un indépendant n'a pas de comptes annuels publics ; ne rien chercher d'autre sur sa vie privée (minimisation des données, RGPD).
- La fiche ne prépare pas un appel de prospection : avant un premier appel téléphonique à un prospect, le contrôle de la liste « Ne m'appelez plus » (compétence `qualification-leads-entrants`) doit être fait.
- Dans un secteur réglementé (assurance, crédit, placement, professions libérales), la fiche prépare des questions ; l'analyse des besoins et toute recommandation personnalisée relèvent d'un professionnel habilité (par exemple un intermédiaire inscrit auprès de l'autorité de contrôle). À faire vérifier par ce professionnel avant usage.

## Sources officielles

- « Banque-Carrefour des Entreprises (BCE) », portail e-Justice de la Commission européenne, https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/be_fr (consultée le 16/10/2026) : consultation gratuite des données publiques sur Public Search ; recherche par numéro, nom, adresse ou activité ; fichier Open Data gratuit après enregistrement.
- « Centrale des bilans », Banque nationale de Belgique, https://www.nbb.be/fr/centrale-des-bilans (consultée le 16/10/2026) : consultation gratuite des comptes annuels déposés par la quasi-totalité des entreprises et organisations en Belgique.
- Note : les pages du SPF Économie sur Public Search n'ont pas pu être ouvertes le 16/10/2026 (page de vérification antirobot) ; seules les deux sources ci-dessus sont citées.

## Exemple

Cas nominal : entreprise de menuiserie, SRL, fictive. `bce_rechercher` rend statut actif, siège à Liège, code NACE 43.320, début en 2014. `bnb_comptes` rend un schéma abrégé 2025 : effectif 6 temps pleins, résultat positif, pas de chiffre d'affaires publié. La fiche écrit « chiffre d'affaires : non publié (schéma abrégé) », pose 10 questions de découverte, et classe « besoin d'un contrat pour la flotte de véhicules » en « supposé : trois camionnettes visibles sur le site, à confirmer ».

Cas d'échec : le numéro d'entreprise saisi ne correspond à aucune fiche (un chiffre en trop). `bce_rechercher` ne rend rien. La fiche n'invente pas une entreprise voisine : elle s'arrête sur « identité non établie », demande le numéro exact ou le nom exact avec la commune, et livre seulement les questions de découverte génériques, marquées « à adapter ».

## Origine de la méthode

Carte des interlocuteurs adaptée et traduite de github.com/anthropics/knowledge-work-plugins,
`sales/skills/stakeholder-map/SKILL.md`, étapes 3 et 4, commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence
Apache 2.0. Modifications : réécriture en français, intégration à la fiche d'une page. Texte de la licence et liste des
reprises : `organisation/skills/LICENCES-TIERS.md`.
