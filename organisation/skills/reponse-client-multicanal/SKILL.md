---
name: "reponse-client-multicanal"
description: "Rédige des brouillons de réponse à des clients d'une PME belge sur plusieurs canaux (courriel, formulaire, chat, réseaux sociaux, courrier, script téléphonique) en français, néerlandais ou anglais : ton, gabarits, délais annoncés, accessibilité et protection des données personnelles. À utiliser pour répondre à une question, une demande ou un incident courant ; jamais pour promettre un remboursement, un avoir, une remise ou un délai non confirmé, ni pour répondre à une réclamation engageante sans validation humaine."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "service-client"
---

# Réponse client multicanal

## Quand l'utiliser

- Un ticket de support courant ou d'avant-vente attend une réponse écrite ou un script d'appel.
- La même réponse doit exister sur plusieurs canaux (courriel détaillé, chat court, réponse publique à un commentaire).
- Le client écrit en néerlandais ou en anglais et la réponse doit sonner naturelle, pas traduite mot à mot.
- Une équipe veut des gabarits cohérents sans réponses robotiques.

## Objectif

Un brouillon qui répond à la question posée dès la première phrase, que le client peut comprendre et appliquer sans nouvel échange, qui ne promet rien que l'entreprise ne tienne, n'expose aucune donnée inutile et attend la validation humaine quand la réponse engage l'entreprise.

## Prérequis

- Le ticket trié (catégorie, priorité, langue) et son historique minimal.
- Les faits sourcés nécessaires : tarif publié, délai confirmé, procédure interne, article de la base de connaissances. Un fait absent est demandé, pas inventé.
- La charte de ton de l'entreprise si elle existe ; sinon le ton ci-dessous (clair, poli, direct).
- Les délais réellement tenus par l'équipe, pas les délais souhaités.

## Entrées

- `ticket` et `canal`.
- `faits` : extraits de la base de connaissances ou de documents internes, avec leur source.
- `limites_gestes` : ce que l'agent n'a pas le droit de proposer (remboursement, avoir, remise, exception).
- `langue_client`.

## Étapes

1. **Identifier la question réelle**, en une phrase, et ce que le client doit pouvoir faire après la réponse.
2. **Vérifier la nature** : une réclamation, une menace de procédure ou un dommage n'est pas une réponse courante. Arrêter, signaler au tri pour transfert au SAV, ne rien rédiger d'engageant.
3. **Rassembler les faits** et leur source. Un point sans source reçoit « à confirmer » dans une note interne, jamais dans le texte client.
4. **Choisir le gabarit** du canal (section suivante) et la langue du client.
5. **Rédiger** : réponse dans la première phrase, une seule action demandée au client à la fois, étapes numérotées s'il y en a, dates écrites en toutes lettres.
6. **Annoncer le délai** seulement s'il est confirmé ; sinon dire quand le client aura des nouvelles et par quel canal.
7. **Protéger les données** : ne citer que ce que le client a lui-même écrit dans ce fil ; aucun numéro complet, aucune donnée d'un tiers ; un message public ne contient aucune donnée personnelle et renvoie vers un canal privé.
8. **Contrôler l'accessibilité** : phrases courtes, un sujet par paragraphe, pas d'information portée par la couleur seule, texte de remplacement pour les images, liens explicites (« guide de connexion » plutôt que « cliquez ici »).
9. **Relire** : ton, faits, langue, absence de promesse, absence de donnée en trop. Remplir la note interne.
10. **Soumettre** : brouillon prêt à envoyer, jamais envoyé. Si un geste commercial est utile, rédiger une carte de décision pour un humain.

### Ton

- Poli, direct, humain. Un « nous » d'entreprise, une personne signataire.
- Pas de formule creuse (« votre satisfaction est notre priorité »), pas de jargon interne, pas de reproche au client.
- Reconnaître la gêne en une phrase simple quand elle existe, sans excès.
- Jamais de promesse de résultat qui dépend d'un tiers ou d'une décision non prise.

### Gabarits par canal

| Canal | Format | Longueur visée | Particularités |
| --- | --- | --- | --- |
| Courriel | objet précis, réponse, étapes, suite, signature | 80 à 200 mots | objet qui reprend la demande, pas « Votre demande » |
| Formulaire | accusé puis réponse | 60 à 150 mots | rappeler la demande en une ligne |
| Chat | messages courts | 1 à 3 phrases par message | une question à la fois, lien vers l'article utile |
| Réseau social, public | accusé et déplacement en privé | 2 phrases | aucune donnée personnelle, aucun détail de dossier |
| Courrier | lettre structurée | 1 page | références, date, coordonnées de contact |
| Téléphone | script avec vérification d'identité | points clés | rappel écrit du résultat par le canal préféré du client |

### Langues

- **Français (Belgique)** : « vous », « ce jeudi », format de date jour mois année, « septante » et « nonante » acceptés à l'oral, ne pas copier des usages français de France (« courrier » pour un envoi postal reste clair).
- **Néerlandais (Flandre)** : « u » par défaut avec un client inconnu, « je » seulement si le client a lui-même tutoyé ; ton plus direct que le français ; l'adaptation est rédigée, pas traduite, et signalée « à faire relire par un néerlandophone ».
- **Anglais** : simple, sans idiomes, car la lectrice ou le lecteur peut ne pas être anglophone natif ; mêmes règles sur les promesses.
- Répondre dans la langue du client, sauf si l'entreprise impose une langue par contrat. Dans le doute, répondre dans la langue du message et proposer l'autre.

### Délais de réponse

- Accusé de réception : immédiat ou le jour même si le canal le permet.
- Première réponse de fond : selon la priorité du tri, jamais plus que le délai affiché au client.
- Après un accusé, le délai annoncé est un engagement : l'équipe le tient ou prévient avant l'échéance.

## Livrable

Pour chaque ticket : le brouillon de réponse dans la langue du client et le canal voulu ; une note interne (faits utilisés avec source, points « à confirmer », décision humaine requise ou non) ; si besoin la carte de décision pour un geste commercial ; la mention « à faire relire » pour le néerlandais ou l'anglais.

## Critères de réussite

- La première phrase répond à la question ; une seule action est demandée au client.
- Chaque fait précis du brouillon renvoie à une source de la note interne.
- Aucune promesse de remboursement, d'avoir, de remise, d'exception ou de délai non confirmé.
- Aucune donnée personnelle en trop, aucune donnée d'un tiers, aucun détail de dossier dans un message public.
- Le texte est compréhensible à la première lecture, y compris avec un lecteur d'écran.

## Sources officielles

Consultées le 16/10/2026 :

- « Web Content Accessibility Guidelines (WCAG) 2.2 », W3C, https://www.w3.org/TR/WCAG22/ : Recommandation du W3C du 12 décembre 2024 ; quatre principes (perceptible, utilisable, compréhensible, robuste) et trois niveaux A, AA, AAA ; le niveau AA est la cible usuelle. Fonde les contrôles de l'étape 8 (lecture seule de l'en-tête et du résumé ; les 170 000 derniers caractères n'ont pas été lus).
- Règlement général sur la protection des données, article 12, paragraphe 3, texte reproduit par gdpr-info.eu (source secondaire), https://gdpr-info.eu/art-12-gdpr/ : réponse à une personne qui exerce ses droits dans un délai d'un mois, prorogeable de deux mois avec information motivée. La version EUR-Lex n'a pas pu être lue (page vide).
- « European Accessibility Act in Belgium », Craftzing, https://www.craftzing.com/our-insights/articles/european-accessibility-act-in-belgium-compliance-complaints-penalties (source secondaire, cabinet privé) : applicable depuis le 28 juin 2025 ; commerce électronique visé ; norme EN 301 549 ; les microentreprises belges de commerce électronique bénéficieraient d'une période transitoire jusqu'en 2030. Le texte officiel de la loi belge n'a pas été consulté : à confirmer avant de s'y appuyer.

Les gabarits, longueurs et règles de ton sont des conventions de gestion courantes : aucune source officielle n'est citée pour eux.

## À vérifier par un professionnel

Toute réponse qui commente un droit du consommateur (garantie, rétractation, remboursement), un contrat ou un délai légal est à faire valider par le juriste ou l'avocat avant envoi. L'obligation d'accessibilité applicable à l'entreprise (commerce électronique, taille) est à confirmer avec le juriste. Les textes en néerlandais sont à faire relire par un néerlandophone.

## Limites

- La compétence rédige des brouillons ; elle n'envoie rien et ne gère pas les gestes commerciaux.
- Elle ne répond pas à une réclamation engageante : celle-ci va au SAV avec décision humaine.
- Sans fait sourcé, la réponse demande l'information au lieu de la deviner.
- Un message public est limité à l'accusé et au déplacement vers un canal privé.
- Elle ne vérifie pas l'identité du client ; la vérification est humaine, avant toute information liée à un compte.

## Exemple

Ticket en néerlandais, canal courriel, catégorie SUP : un client demande comment récupérer l'accès à son espace en ligne. Fait sourcé : article « Mot de passe oublié » de la base de connaissances, validé le 2 octobre 2026.

Brouillon (extrait) : « Beste mevrouw, beste heer, u kunt uw wachtwoord zelf opnieuw instellen via de knop « Wachtwoord vergeten » op de inlogpagina. U ontvangt binnen enkele minuten een e-mail met een link. Lukt het niet, antwoord dan op dit bericht en wij helpen u verder. » Note interne : source = article du 02/10/2026 ; « binnen enkele minuten » repris de l'article ; texte à faire relire par un néerlandophone.

Cas d'échec : le client ajoute « et remboursez-moi le mois perdu ». Le brouillon accepte « bien sûr, nous vous créditerons ». C'est une promesse non autorisée. Correctif : la partie remboursement est retirée, la demande est signalée au tri comme REC, une carte de décision est posée, et le brouillon dit seulement « nous revenons vers vous sur ce point d'ici le jeudi 15 octobre 2026 », date confirmée par le coordinateur.
