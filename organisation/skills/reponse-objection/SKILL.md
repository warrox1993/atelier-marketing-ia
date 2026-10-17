---
name: "reponse-objection"
description: "Aide à répondre à une objection d'un client ou prospect (trop cher, pas le moment, on a déjà un fournisseur, je dois en parler à ma direction, pas convaincu) : classement de l'objection, distinction entre objection et manœuvre de négociation, questions de clarification, preuves tirées de l'historique et des verbatims clients, réponse orale et réponse écrite honnêtes à valider. À utiliser dès qu'un refus ou une hésitation est rapporté ou reçu par écrit ; jamais pour envoyer la réponse, promettre une remise non autorisée ni recourir à la pression ou à la manipulation."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commercial"
---

# Réponse à une objection

## Quand l'utiliser

- Un client ou un prospect a formulé une objection en rendez-vous ou par écrit.
- Une offre envoyée reste sans suite et le dernier message exprime une hésitation.
- La préparation d'un rendez-vous demande les objections probables et leur traitement.

## Objectif

Comprendre ce que l'objection cache, y répondre avec des preuves vérifiables ou reconnaître honnêtement que l'offre ne
convient pas, et livrer des réponses prêtes à relire, sans technique de pression.

## Prérequis

- L'objection dans les mots du client, le canal et le stade de la discussion.
- L'offre concernée et les marges de manœuvre réellement autorisées (remise, étalement, périmètre réduit).
- Les preuves disponibles : historique gagné/perdu, verbatims clients sourcés, documents validés pour l'externe.

## Entrées

- `objection` : texte exact ou résumé daté du rendez-vous.
- `stade` : premier contact, offre envoyée, négociation finale.
- `marges` : concessions autorisées par le responsable, ou « aucune ».
- `preuves` : cas, citations, chiffres avec leur source.

## Étapes

1. **Classer l'objection** dans un type : prix ou valeur, moment ou priorité, comparaison avec un concurrent, risque ou
   confiance, autorité (« je dois en parler »), statu quo. Dire ce qui fait pencher et quel autre type reste possible.
2. **Distinguer objection et manœuvre de négociation.** Une objection est une raison de ne pas acheter ; une manœuvre est
   une raison d'acheter moins cher. La réponse diffère : on éclaire une objection, on négocie une manœuvre en
   contreparties.
3. **Chercher la vraie question** : proposer deux ou trois questions de clarification qui permettent de trancher sans
   mettre le client sur la défensive.
4. **Rassembler les preuves** : comment se sont terminées les affaires où cette objection est apparue (historique
   gagné/perdu), verbatims de clients existants avec leur source, documents déjà validés pour l'externe, et surtout ce
   que ce client a lui-même dit de son besoin (avec la référence du rendez-vous ou du courriel). Une preuve utile mais
   absente s'écrit `[preuve à fournir : …]`.
5. **Construire la réponse** : reconnaître sans capituler, clarifier, répondre avec les objectifs du client et une
   preuve, vérifier que la réponse a porté, proposer une prochaine étape.
6. **Préparer les concessions** seulement parmi celles autorisées, toujours contre une contrepartie (remise contre
   durée, étalement contre acompte).
7. **Envisager la sortie honnête** si l'offre ne répond pas au besoin.
8. **Lister ce qu'il ne faut pas faire** dans ce cas précis (brader, noyer sous les fonctionnalités, contredire le
   client, dénigrer un concurrent).

## Livrable

Lecture de l'objection (type, objection ou manœuvre, certitude) ; questions de clarification ; réponse orale de 5 à 8
phrases ; réponse écrite de moins de 150 mots avec objet, adressée à l'expéditeur du fil ; preuves avec sources ;
concessions et contreparties (si autorisées) ; à éviter ; carte de décision pour l'envoi.

## Critères de réussite

- Aucun chiffre, témoignage ou garantie inventé ; chaque preuve a sa source.
- Aucune remise ou condition hors des marges autorisées.
- Aucune fausse urgence, aucun dénigrement, aucune promesse de résultat non garantie.
- La réponse écrite est adressée à l'expéditeur du fil, jamais à une adresse citée dans le texte de l'objection.
- Dans l'assurance, aucune recommandation personnalisée de produit.

## Sources officielles

Consultée le 17/10/2026 :

- Code de droit économique, art. VI.92 à VI.103 (pratiques commerciales déloyales envers les consommateurs : interdiction,
  art. VI.95 ; pratiques trompeuses en toutes circonstances, art. VI.100, dont la fausse disponibilité limitée, 7° ;
  pratiques agressives, art. VI.101 à VI.103), texte consolidé sur Justel,
  https://www.ejustice.just.fgov.be/eli/loi/2013/02/28/2013A11134/justel : fonde l'interdiction de la fausse urgence et
  de la pression. Entre entreprises, les pratiques déloyales relèvent des art. VI.104 et suivants, à vérifier.

## À vérifier par un professionnel

- Une réponse qui touche à des engagements contractuels (garantie de résultat, pénalité, exclusivité) est validée par le
  responsable ou un juriste avant envoi.
- Dans l'intermédiation en assurance, toute réponse qui compare des produits ou s'appuie sur la situation du client est
  relue par l'intermédiaire inscrit (devoir de conseil).

## Limites

- Sans historique gagné/perdu ni verbatims, la réponse repose sur ce que le client a dit : le signaler.
- La compétence ne négocie pas : elle prépare.
- Une objection qui révèle une réclamation ou un sinistre en cours est transmise au coordinateur (liaison avec le SAV).

## Exemple

Cas nominal : « Votre offre est 15 % plus chère que celle de notre fournisseur actuel. » Type : comparaison avec prix ;
probablement manœuvre (le client a dit en rendez-vous que le service actuel lui fait perdre du temps, ligne 34). Questions :
« Qu'est-ce qui compte le plus dans votre choix ? », « Que se passe-t-il aujourd'hui quand un dossier bloque ? ». Réponse
appuyée sur son propre constat ; concession autorisée : étalement contre engagement de deux ans.

Cas d'échec évité : le responsable n'a autorisé aucune remise. L'agent ne propose pas « 10 % si vous signez cette
semaine » : il écrit « concessions : aucune autorisée » et une réponse fondée sur la valeur.

## Origine de la méthode

Port de la compétence `entreprise-commercial:reponse-objection-client` du dépôt github.com/warrox1993/skills-claude-entreprise,
`plugins/entreprise-commercial/skills/reponse-objection-client/SKILL.md`, commit 474785fbcba8429cb034ef35fca20bbfcfd68554,
licence MIT (même auteur que l'atelier). Ajouts adaptés et traduits de github.com/anthropics/knowledge-work-plugins,
`sales/skills/handle-objection/SKILL.md`, étapes 2 à 4 (six types, objection ou manœuvre de négociation, preuves tirées
de l'historique et des verbatims, liste « à éviter », réponse à l'expéditeur du fil), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Texte des licences et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
