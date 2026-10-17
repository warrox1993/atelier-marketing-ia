---
name: "escalade-interne"
description: "Décide s'il faut escalader un dossier client vers un autre service (informatique, commercial, juridique, direction) ou le garder, mesure l'impact en six dimensions, rédige le dossier d'escalade (gravité, impact, description, ce qui a été tenté, étapes de reproduction, communication client, demande précise et échéance), fixe une cadence de suivi et prépare la désescalade. À utiliser pour un incident qui touche plusieurs clients, un client bloqué, un délai dépassé ou un problème récurrent ; jamais pour contacter soi-même un autre service hors liaison ni annoncer aux clients un incident sans validation."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "service-client"
---

# Escalade interne

## Quand l'utiliser

- Un problème dépasse ce que le service peut résoudre (incident technique, décision commerciale, question juridique).
- Plusieurs clients signalent le même problème, ou un client important est bloqué.
- Un dossier dépasse le délai fixé par la direction, ou un problème supposé réglé revient.
- Un dossier escaladé doit être suivi, puis refermé.

## Objectif

Une escalade qui part au bon service, chiffrée, reproductible et assortie d'une demande précise, suivie à une cadence
connue, et refermée avec ce qu'on en a appris, sans que le client soit laissé sans nouvelles.

## Prérequis

- Le ou les tickets concernés avec leur historique et leur tri.
- Les cadences de suivi fixées par la direction ; à défaut, les repères de l'étape 6, marqués « repères à fixer par la
  direction ».
- La route de liaison vers le service visé (le dossier part par le coordinateur, jamais en direct).

## Entrées

- `tickets` : identifiants, dates, symptômes, clients touchés (identifiants internes).
- `essais` : ce qui a déjà été tenté et le résultat.
- `cible` : service visé pressenti.

## Étapes

1. **Garder ou escalader.** On garde quand une solution documentée ou un contournement existe, quand il s'agit d'un
   réglage ou d'une explication, ou quand des cas semblables ont été résolus au service. On escalade pour : une
   correction technique ou une perte de données ; un diagnostic hors de portée du service ; plusieurs clients touchés,
   un service à l'arrêt ou un risque de sécurité ; un client important en risque, un délai dépassé ou une demande
   d'intervention de la direction ; un dossier sans progrès ; un même problème signalé par 3 clients ou plus, ou revenu
   après correction.
2. **Mesurer l'impact** sur six dimensions : étendue (combien de clients, en hausse ?), profondeur (bloqué ou gêné ?),
   durée (depuis quand, quand deviendra-t-il critique ?), enjeu financier (contrats, primes ou affaires en cours touchés),
   réputation (risque public, client de référence), contrat (engagement de service ou obligation contractuelle en jeu).
3. **Fixer la gravité** : critique (service à l'arrêt, données en risque, faille de sécurité, plusieurs clients
   importants), haute (fonction majeure en panne, client clé bloqué, engagement en risque), moyenne (problème sérieux avec
   contournement).
4. **Écrire les étapes de reproduction** pour un incident : point de départ, gestes exacts, valeurs exactes,
   environnement (navigateur, appareil, type de compte), fréquence, preuves (message d'erreur exact, capture), ce qui a
   été écarté.
5. **Rédiger le dossier d'escalade** : titre d'une ligne, gravité, service visé, date ; impact (clients touchés, ce
   qu'ils ne peuvent plus faire, enjeu, ancienneté) ; description en 3 à 5 phrases ; ce qui a été tenté ; reproduction ;
   communication client (dernier message, attente du client, risque d'aggravation) ; demande précise (« chercher la
   cause », « corriger », « décider », « autoriser une exception ») et échéance ; pièces utiles. Seuls les extraits
   nécessaires partent, jamais un dossier complet.
6. **Fixer la cadence de suivi** (repères) : critique, interne toutes les 2 heures et client toutes les 2 à 4 heures ;
   haute, interne toutes les 4 heures et client toutes les 4 à 8 heures ; moyenne, interne chaque jour et client tous
   les 1 à 2 jours ouvrables. Un message d'attente au client est proposé même sans nouvelle (« voici ce que nous savons »),
   en brouillon.
7. **Désescalader** quand la cause est trouvée et traitable au service, qu'un contournement débloque le client ou que la
   gravité change : prévenir le service visé, mettre à jour les tickets, proposer le message de résolution au client,
   noter ce qui a été appris.

## Livrable

Dossier d'escalade complet ; décision « garder ou escalader » motivée ; tableau de cadence ; brouillons de messages
d'attente et de résolution au client ; note de clôture avec l'enseignement retenu.

## Critères de réussite

- L'impact est chiffré sur les six dimensions, ou chaque dimension inconnue est dite.
- La demande au service visé est un verbe précis avec une échéance.
- Les étapes de reproduction d'un incident permettent de le refaire.
- Aucun message aux clients, individuel ou collectif, ne part sans carte de décision.
- Les cadences sont présentées comme des repères de la direction.

## Sources officielles

État au 17/10/2026 :

- Aucune règle légale ne fixe la cadence d'une escalade interne : les cadences sont des repères de gestion, présentés
  comme tels.
- Violation de données personnelles : notification à l'autorité et information des personnes, RGPD art. 33 et 34
  (texte officiel sur EUR-Lex non relu le 17/10/2026, page de vérification antirobot ; procédure de notification à lire
  sur le site de l'Autorité de protection des données, https://www.autoriteprotectiondonnees.be, avant tout usage).

## À vérifier par un professionnel

- Un incident qui touche des données personnelles ou la sécurité est signalé sans délai au coordinateur pour décision
  sur une éventuelle notification (APD, et pour un incident cyber le Centre pour la Cybersécurité Belgique) : à
  qualifier par le délégué à la protection des données et le responsable informatique.
- Les engagements de service promis aux clients (conditions générales, contrats) qui fixent des délais sont relus par
  un juriste.

## Limites

- La compétence ne résout pas l'incident : elle le transmet, le suit et le referme.
- Elle ne contacte pas elle-même l'autre service : le dossier part par le coordinateur et le bureau de liaison.
- Un message à plusieurs clients sur un incident est une communication engageante : elle relève de l'humain et, en cas
  de crise, du service communication.

## Exemple

Cas nominal : 5 tickets en 2 heures « l'espace client affiche une erreur 500 à la connexion ». Décision : escalader
(3 clients ou plus). Impact : 5 clients, bloqués, depuis 9 h 05, aucun contournement. Gravité haute. Reproduction :
navigateur Firefox, compte particulier, page de connexion, identifiants valides, erreur à chaque essai. Demande à
l'informatique : « chercher la cause et donner une heure de rétablissement estimée », échéance 12 h. Message d'attente
proposé aux 5 clients, en brouillon.

Cas d'échec évité : un client demande comment changer son adresse ; l'agent n'escalade pas, l'article de la base de
connaissances existe.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `customer-support/skills/customer-escalation/SKILL.md`
(« When to Escalate vs. Handle in Support », six dimensions d'impact, niveaux de gravité, étapes de reproduction, format
du dossier d'escalade, cadence de suivi, désescalade), commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence
Apache 2.0. Modifications : réécriture en français, passage par le bureau de liaison, cadences présentées comme repères,
couche RGPD. Texte de la licence et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
