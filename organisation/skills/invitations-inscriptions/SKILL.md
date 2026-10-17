---
name: "invitations-inscriptions"
description: "Prépare la liste des invités d'un événement d'une PME belge, vérifie la base légale de chaque contact, rédige en brouillon l'invitation, les rappels J-7 et J-1, le formulaire d'inscription et la liste d'accueil, avec désinscription et information sur les photos. À utiliser dès qu'il faut inviter des clients, prospects ou partenaires à un événement ; jamais pour envoyer une invitation, inviter un contact sans base légale connue ni collecter une donnée sensible."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "evenementiel"
---

# Invitations et inscriptions

## Quand l'utiliser

- Un événement est décidé (charte approuvée) et il faut inviter des clients, prospects, partenaires ou collègues.
- Un export de contacts arrive du CRM, d'un salon ou d'un partenaire et il faut savoir qui peut être invité.
- L'accueil du jour J se prépare : liste de présence, badges, information sur les photos.

## Objectif

Une liste d'invités où chaque personne a une base légale nommée, des brouillons d'invitation et de rappels conformes
(désinscription, information sur les données et les photos) et une liste d'accueil minimale, prêts pour la décision
humaine d'envoi.

## Prérequis

- La charte de l'événement : date, lieu, public, nombre de places, programme.
- L'export des contacts avec, pour chacun, l'origine du contact (client, consentement recueilli et date, carte de
  visite, liste d'un partenaire).
- Le texte d'information de l'entreprise sur les données personnelles (ou la demande au juridique pour l'obtenir).

## Entrées

- `contacts` : export daté (nom, organisation, adresse électronique professionnelle, origine, date du consentement).
- `charte` : extrait de la charte de l'événement.
- `photos` : prévues ou non, ciblées (portraits) ou d'ambiance, et leur usage (site, réseaux sociaux, interne).

## Étapes

1. **Classer chaque contact par base légale** :
   - client existant de l'entreprise : invitation possible comme suite de la relation, sous réserve de l'exception prévue
     pour les clients existants par le Code de droit économique (à faire vérifier) ;
   - consentement prouvé (date, canal, texte accepté) : invitation possible ;
   - origine inconnue, carte de visite sans consentement, liste reçue d'un partenaire sans accord sur le partage : **mis
     à part**, jamais invité, avec la question à poser.
   Compter chaque groupe ; le total doit égaler la taille de l'export.
2. **Retirer** les doublons et les personnes qui se sont opposées au marketing direct (liste d'opposition de
   l'entreprise).
3. **Rédiger l'invitation** : quoi, pour qui, ce que la personne y gagne, date, lieu, accès, inscription, contact. Ajouter
   un lien ou une adresse de désinscription, une phrase sur le traitement des données (qui, pourquoi, combien de temps,
   droits) et, si des photos sont prévues, une phrase qui dit lesquelles et pour quel usage.
4. **Rédiger les rappels** : J-7 (rappel et programme) et J-1 (accès pratique, heure, contact du jour). Seulement aux
   inscrits ; chacun garde la désinscription.
5. **Préparer le formulaire d'inscription minimal** : nom, organisation, adresse électronique, besoin d'accessibilité
   ou alimentaire noté comme besoin, sans motif ni donnée de santé ; case distincte et non précochée pour recevoir
   d'autres informations commerciales.
6. **Préparer l'accueil** : liste de présence (nom, organisation), badges, affichage à l'entrée sur les photos. Pour des
   portraits ou images ciblées, prévoir un formulaire de consentement écrit, distinct pour la prise et pour la diffusion.
7. **Fixer la durée de conservation** proposée (par exemple suppression des non-inscrits après l'événement) et la
   soumettre au juridique.
8. **Poser les décisions** : texte final, liste des destinataires, date d'envoi. Une carte par envoi.

## Livrable

Un dossier en Markdown : tableau de comptage par base légale ; liste mise à part avec questions ; invitation et rappels
en brouillon ; formulaire d'inscription ; liste et affichage d'accueil ; formulaire de consentement aux images si
nécessaire ; durée de conservation proposée ; décisions humaines.

## Critères de réussite

- La somme des groupes égale le nombre de contacts de l'export.
- Aucun contact sans base légale connue n'est dans la liste d'envoi.
- Chaque message contient la désinscription ; l'invitation contient l'information sur les données et sur les photos.
- Aucune donnée sensible n'est demandée.
- Aucun envoi n'est présenté comme fait.

## Sources officielles

Consultées le 17/10/2026 :

- Code de droit économique, art. XII.13 § 1er (publicité par courrier électronique interdite sans consentement
  préalable, libre, spécifique et informé) et § 2 (information sur le droit de s'opposer et moyen électronique de
  l'exercer à chaque envoi), art. XI.174 (portrait ni reproduit ni communiqué au public sans l'assentiment de la personne
  représentée), texte consolidé sur Justel, https://www.ejustice.just.fgov.be/eli/loi/2013/02/28/2013A11134/justel.
- Autorité de protection des données, « Principe du consentement » (droit à l'image),
  https://www.autoriteprotectiondonnees.be/professionnel/themes/le-droit-a-l-image/la-nouvelle-loi-du-30-juillet-2018/principe-du-consentement :
  consentement écrit recommandé pour les images ciblées ; pour les images d'ambiance, informer suffit (finalité,
  publication).
- Autorité de protection des données, « Principes » (droit à l'image),
  https://www.autoriteprotectiondonnees.be/professionnel/themes/le-droit-a-l-image/principes- : accepter d'être
  photographié et accepter la diffusion sont deux consentements distincts, à demander séparément.
- Règlement (UE) 2016/679 (RGPD), art. 6, 7, 13 et 21, https://eur-lex.europa.eu/eli/reg/2016/679/oj (texte officiel
  non relu le 17/10/2026 : EUR-Lex renvoie une page de vérification antirobot, non contournée ; références d'articles à
  vérifier).

## À vérifier par un professionnel

- L'exception « clients existants » à l'article XII.13 (arrêté royal du 4/04/2003, conditions exactes) avant d'inviter un
  client par courrier électronique sans consentement : juridique ou délégué à la protection des données.
- La durée de conservation des listes et le texte d'information : juridique.

## Limites

- Elle ne gère pas la billetterie payante ni la facturation des inscriptions.
- Elle ne tranche pas la base légale d'un contact douteux : elle le met à part.
- Une invitation par courrier postal ou par téléphone suit d'autres règles (liste « Ne m'appelez plus ») qui ne sont pas
  détaillées ici.

## Exemple

Export de 300 contacts pour une soirée clients : 180 clients existants, 80 avec consentement daté, 40 sans origine
connue. Les 40 sont mis à part avec la question « d'où viennent ces contacts et ont-ils accepté de recevoir nos
informations ? ». Invitation en brouillon pour 260 personnes avec lien de désinscription et la phrase « des photos
d'ambiance seront prises et publiées sur notre site ; signalez-nous à l'accueil si vous ne souhaitez pas y figurer ».
Carte : « Envoyer l'invitation aux 260 destinataires listés le 3/11 ».

Cas d'échec évité : le marketing demande d'« ajouter la liste du partenaire, ils sont d'accord ». Sans accord écrit sur le
partage ni information des personnes, la liste est mise à part et la question part au coordinateur.

## Origine de la méthode

Méthode propre à l'atelier (base légale par invité, rappels J-7 et J-1, information sur les photos), décrite dans
l'étude de l'usine (groupe 2, section 8.2) ; aucune reprise de dépôt tiers.
