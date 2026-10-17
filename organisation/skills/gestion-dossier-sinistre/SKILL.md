---
name: "gestion-dossier-sinistre"
description: "Organise le suivi administratif d'un dossier de sinistre par un intermédiaire d'assurance en Belgique : ouverture, pièces à réunir, délais de déclaration à l'assureur, suivi avec l'assureur, communication régulière avec l'assuré, clôture et conservation. À utiliser quand un client signale un sinistre ou qu'un dossier ouvert doit être relancé ; jamais pour décider si le sinistre est couvert, évaluer ou promettre une indemnisation, refuser une prise en charge, ni pour envoyer quoi que ce soit à l'assureur sans validation humaine."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "sav"
---

# Gestion d'un dossier de sinistre par l'intermédiaire

## Quand l'utiliser

- Un client (preneur d'assurance ou assuré) signale un sinistre : dégât, vol, accident, litige ou décès selon la branche.
- Un dossier ouvert est silencieux et il faut vérifier les pièces, les délais et relancer l'assureur.
- Un client demande où en est son dossier.
- Un dossier est terminé et doit être clôturé proprement.

## Objectif

Un dossier tenu : faits déclarés, pièces reçues et manquantes, délais, dernier contact, prochaine étape, tout daté. Le client est informé régulièrement et honnêtement ; l'assureur reçoit un dossier complet à temps. L'intermédiaire ne décide jamais de la couverture ni du montant : il recueille, transmet, suit et explique.

## Prérequis

- La police et ses conditions : garanties, franchise, exclusions, obligations de déclaration et délai contractuel d'avis.
- Le contact sinistres de l'assureur concerné et ses exigences de pièces.
- La fiche de l'entreprise : qui valide les envois, qui parle au client, quel ton, quelles limites.
- Les consentements utiles : le traitement des données de l'assuré (parfois sensibles : santé, dommages corporels) se limite aux données nécessaires au dossier.

## Entrées

- `declaration` : description du sinistre par le client, recopiée telle quelle, avec date et canal.
- `police` : numéro de police interne, conditions, avenants.
- `pieces` : documents déjà reçus (constat, photos, factures, rapport de police, certificat médical, devis).
- `echanges` : messages précédents avec l'assuré et l'assureur.

## Étapes

1. **Ouvrir le dossier** le jour de la réception : référence interne, date et heure de l'avis reçu, identité du déclarant et lien avec la police, date et lieu du sinistre, circonstances telles que déclarées, tiers éventuels (nom, assureur, plaque), blessés éventuels. Noter ce qui est déclaré comme « déclaré par le client », sans le qualifier.
2. **Vérifier la police rattachée** : en vigueur à la date du sinistre ? numéro, assureur, branche. Si plusieurs polices ou plusieurs dossiers correspondent (même nom, même adresse, déclaration sans numéro), ne jamais en choisir un seul : les lister tous et demander à l'humain lequel s'applique avant d'aller plus loin. Un doute (police échue, prime impayée, risque non assuré) est écrit « à confirmer par l'assureur » : l'intermédiaire ne tranche pas.
3. **Calculer le délai d'avis à l'assureur.** La loi du 4 avril 2014 impose à l'assuré de donner avis du sinistre dès que possible et en tout cas dans le délai fixé par le contrat ; l'assureur ne peut pas se prévaloir du dépassement du délai contractuel si l'avis a été donné aussi rapidement que cela pouvait raisonnablement se faire. En cas de manquement, l'assureur peut réduire sa prestation à concurrence du préjudice qu'il subit, et décliner sa garantie seulement en cas d'intention frauduleuse (voir sources). Conséquence pratique : déclarer sans attendre la collecte de toutes les pièces. Relever dans la police le délai exact et écrire la date limite ; ne jamais en citer un de mémoire.
4. **Transmettre la déclaration à l'assureur** (brouillon préparé, envoi par l'humain) avec les informations disponibles, dans le canal prévu, et conserver la preuve d'envoi. Ne pas retenir l'avis pour compléter le dossier.
5. **Dresser la liste des pièces** à partir de la liste par type de sinistre établie avec l'entreprise cliente et des exigences de l'assureur (la liste ci-après n'est qu'un point de départ, jamais une liste d'un autre cabinet) : constat ou déclaration écrite, photos, factures ou devis, rapport de police en cas de vol ou d'infraction, coordonnées bancaires, certificats médicaux pour les dommages corporels. Chaque pièce a un statut : demandée, reçue, incomplète, transmise. Une pièce illisible est redemandée, pas supposée.
6. **Informer l'assuré** par écrit dans un langage clair : ce qui est fait, ce qu'il doit fournir, avant quelle date, ce qu'il ne doit pas faire (reconnaître sa responsabilité, engager des réparations importantes sans accord de l'assureur, jeter les objets endommagés, selon les conditions de la police à lire). Aucune promesse d'indemnisation, aucun pronostic de couverture.
7. **Suivre avec l'assureur.** Noter la date de transmission, le numéro de sinistre attribué, le gestionnaire, l'expert éventuel, la date de la dernière réponse. Relancer à intervalle fixe (par défaut toutes les 2 semaines ouvrables sans nouvelle, à confirmer avec le responsable) ; chaque relance est datée. Transmettre sans délai à l'assuré les demandes de l'assureur et à l'assureur les pièces reçues.
8. **Communiquer avec l'assuré** à des dates convenues (dernier contact au maximum 15 jours auparavant, sinon un point de situation même sans nouveau) : où en est le dossier, ce qui attend qui, prochaine étape. Dire « information manquante » plutôt que deviner une date de paiement.
9. **Relayer la décision de l'assureur** sans la commenter comme si elle était la sienne : l'intermédiaire explique ce que dit la décision, indique les voies de recours et renvoie à l'assureur pour le fond. En cas de désaccord de l'assuré, ouvrir un traitement de plainte (compétence `traitement-reclamation`) ; l'Ombudsman des assurances est compétent pour les plaintes visant les assureurs et les intermédiaires.
10. **Clôturer** quand l'assureur a clôturé ou que l'assuré renonce par écrit : vérifier que toutes les pièces sont rendues, que l'assuré a reçu la décision finale, noter la date de clôture, le résultat tel que communiqué (accepté, refusé, partiel) et la durée totale. Conserver le dossier selon la durée prévue par l'entreprise ; les actions dérivant du contrat d'assurance se prescrivent en principe par trois ans à compter de l'événement qui ouvre l'action (voir sources), ce qui guide la conservation minimale.

## Livrable

- L'état du dossier : faits déclarés, police, pièces reçues et manquantes, délais calculés, dernier contact, prochaine étape et responsable.
- Le projet de déclaration à l'assureur et le projet de message à l'assuré (liste des pièces, dates).
- Le journal daté du dossier (appels, courriels, relances).
- Les citations de la police pertinentes, marquées « à confirmer par le gestionnaire ou l'assureur ».
- Le projet de message de clôture.

Rien n'est envoyé, signé, payé ni déposé : l'humain valide et agit.

## Critères de réussite

- La déclaration est transmise à l'assureur sans attendre que le dossier soit complet, et la preuve d'envoi est au dossier.
- Chaque délai affiché cite sa source (police ou loi) et sa date de départ.
- Chaque pièce a un statut et une date.
- L'assuré n'est jamais plus de 15 jours sans nouvelle écrite pendant que le dossier est ouvert.
- Aucune phrase du dossier ne tranche la couverture, ne chiffre une indemnité ni promet un résultat.
- Les données sensibles se limitent à ce qui est nécessaire.
- Quand plusieurs polices ou dossiers correspondent, aucun n'est choisi sans décision humaine.

## Sources officielles

Consultées le 16/10/2026 :

- Loi du 4 avril 2014 relative aux assurances, Justel (texte mis à jour au 04/08/2026), https://www.ejustice.just.fgov.be/cgi_loi/article.pl?language=fr&lg_txt=f&type=&sort=&numac_search=2014011239&cn_search=2014040446&caller=article&&view_numac=2014011239n : article 74 (avis du sinistre dès que possible et dans le délai du contrat ; assureur privé du moyen tiré du délai si l'avis a été donné aussi vite que raisonnablement possible ; renseignements sans retard), article 75 (mesures raisonnables pour limiter le dommage), article 76 (réduction à concurrence du préjudice ; déchéance seulement en cas d'intention frauduleuse), article 88 (prescription de trois ans des actions dérivant du contrat, avec les règles de départ), articles 265 et 322 (plaintes visant les intermédiaires, Ombudsman des assurances).
- Même loi, art. 322 § 1er (le service ombudsman contribue à résoudre les différends entre assureurs ou intermédiaires et leurs clients « en rendant un avis ou en intervenant en qualité de médiateur ») et § 2/2 (suspension de la prescription de l'art. 88 dès réception d'une demande complète), relus sur Justel le 17/10/2026, https://www.ejustice.just.fgov.be/eli/loi/2014/04/04/2014011239/justel.
- Ombudsman des Assurances, « Introduire une plainte », https://www.ombudsman-insurance.be/introduire-une-plainte/ (17/10/2026) : le client interroge d'abord l'assureur ou l'intermédiaire ; plainte écrite avec la référence du dossier. L'article de Test-Achats cité auparavant a été retiré.

Aucun texte officiel n'a été consulté sur les délais d'intervention de l'assureur ou de l'expert, ni sur les pièces exigées par branche : ils figurent dans la police et chez l'assureur.

## À vérifier par un professionnel

Le délai d'avis et les obligations de l'assuré se lisent dans la police : à faire confirmer par le gestionnaire ou le courtier responsable. Toute question de responsabilité, de couverture, de franchise, d'expertise contradictoire, de dommage corporel ou de fraude relève de l'assureur, d'un expert ou d'un avocat. Le traitement des données de santé (RGPD) est à valider par le responsable de la protection des données de l'entreprise.

## Limites

- La compétence ne décide pas de la couverture et ne dit jamais « vous serez remboursé ».
- Elle ne remplace ni l'expert, ni le gestionnaire de sinistres de l'assureur, ni l'avocat.
- Les pièces exigées varient selon l'assureur et la branche : la liste est celle de l'assureur, complétée au besoin.
- Les délais de relance proposés (2 semaines, 15 jours) sont des repères internes, pas des délais légaux.
- Un dossier avec dommage corporel grave ou décès est escaladé au responsable dès l'ouverture.

## Exemple

Le 12/10/2026, une cliente signale par courriel un dégât des eaux dans sa cuisine constaté le 11/10 au matin, avec photos. Police habitation en vigueur selon le fichier interne ; délai d'avis contractuel de 8 jours dans les conditions générales (article cité : à confirmer par le courtier).

- Ouverture le 12/10 : référence interne SIN-2026-014, faits « déclarés par la cliente », cause présumée « fuite sous l'évier », écrite comme hypothèse.
- Délai : date limite 19/10 selon la police ; la déclaration à l'assureur part le 13/10, avec photos, sans attendre les devis.
- Pièces : photos (reçues), devis de réparation (demandé), facture du plombier (demandée), coordonnées bancaires (demandées).
- Message à la cliente : liste des pièces, prise de mesures raisonnables pour limiter le dommage (art. 75), pas de réparation lourde avant l'accord de l'assureur, aucune promesse de montant.
- Relance de l'assureur le 27/10 si aucune réponse ; point de situation à la cliente le 27/10 au plus tard.

Cas d'échec : le client signale un vol de vélo le 10/10 mais ne retrouve la police qu'une semaine plus tard et ne veut déclarer à l'assureur que lorsque le rapport de police sera obtenu. La compétence ne retient pas l'avis : elle recommande de déclarer immédiatement, rappelle le délai relevé dans la police et la règle de l'article 74, et note que le rapport de police sera transmis dès réception. Si la police n'est pas retrouvée, elle écrit « délai d'avis : information manquante, police à obtenir auprès de l'assureur » et ne cite aucun délai générique.

## Origine de la méthode

Règle « ne jamais choisir seul un dossier quand plusieurs correspondent » adaptée et traduite de
github.com/anthropics/knowledge-work-plugins, `small-business/skills/ticket-deflector/SKILL.md`, étape 2, commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Le reste de la méthode est propre à l'atelier et fondé sur
la loi du 4 avril 2014. Texte de la licence et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
