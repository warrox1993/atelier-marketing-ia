---
name: "plaquette-commerciale"
description: "Conçoit le contenu d'un support commercial destiné à un prospect ou un client précis (fiche d'une page, courte présentation, document à laisser après un rendez-vous, foire aux questions) : forme et public fixés d'abord, barrière entre contenu interne et contenu remis au client, inventaire de chaque affirmation avec sa source (documents validés de l'entreprise, données du compte, propos du client), plan validé avant la rédaction, aucun chiffre ni témoignage inventé, emplacement entre crochets pour toute donnée manquante, puis contrôle final. À utiliser pour préparer un support personnalisé avant ou après un rendez-vous ; jamais pour une offre chiffrée (voir proposition-commerciale), ni pour envoyer ou publier le support."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commercial"
---

# Plaquette commerciale personnalisée

## Quand l'utiliser

- Un prospect demande « un document qui résume ce que vous faites pour des entreprises comme nous ».
- Un rendez-vous de découverte a besoin d'une courte présentation adaptée au secteur du client.
- Un document doit être laissé au client après un rendez-vous.

## Objectif

Un support propre à ce client, dont chaque affirmation vient d'une source validée, qui ne laisse passer aucun contenu
interne et qui marque clairement ce qui reste à compléter.

## Prérequis

- Les documents validés de l'entreprise (présentation, offres, références autorisées, gabarit, charte) dans ses
  connaissances ; sans eux, toute affirmation sur l'offre est « non vérifiée ».
- Les données du compte (CRM, comptes rendus, échanges), si le support est personnalisé.
- Le public : support interne ou remis au client.

## Entrées

- `forme` : fiche d'une page, présentation, document à laisser, foire aux questions (déduite de la demande ; si elle
  est ambiguë, une seule question).
- `public` et `compte`.
- `materiel_fourni` : ce que l'humain a donné pour ce support (signal le plus fort de son intention).

## Étapes

1. **Fixer la forme, le public et le compte.** Lire le gabarit, la charte (`charte-marque`) et le récit de référence
   s'il existe.
2. **Poser la barrière du public** : un contenu interne (projets non annoncés, argumentaires contre un concurrent,
   marges, notes sur des personnes) ne va jamais dans un support remis au client.
3. **Rassembler le contenu par ordre de priorité** : matériel fourni par l'humain ; documents validés de l'entreprise ;
   données du compte (faits du CRM, thèmes et citations du client, marqués citation exacte ou reformulation).
4. **Dresser l'inventaire** : chaque affirmation avec sa source. Une affirmation sur l'offre, un prix, une garantie ou
   une conformité sans source validée est marquée « non vérifiée » ou retirée. Un chiffre propre au client cite sa
   source ou devient un emplacement entre crochets (« [CHIFFRE CLIENT] »). Aucun logo, témoignage, nom de client ou
   résultat inventé.
5. **Proposer le plan** et le faire valider avant de rédiger : pour une première présentation, cinq ou six diapositives
   (qui nous sommes, ce qui change dans leur secteur, preuves, comment démarrer, demande), plus seulement sur demande
   ou selon le gabarit de l'entreprise.
6. **Rédiger** dans le gabarit, puis passer `humanisation-texte-fr` sur le texte et `design-visuel-sobre` sur la mise en
   forme ; le fichier lui-même se produit avec `documents-bureautiques`.
7. **Contrôler** : chaque affirmation se retrouve dans l'inventaire ; rien d'interne dans un support client ; longueur
   conforme au plan ; chaque chiffre du client cité ou entre crochets ; mentions obligatoires du secteur jointes par le
   responsable (voir `controle-communications-reglementees`).

## Livrable

L'inventaire du contenu (affirmation, source, statut), le plan validé, le support rédigé, la liste des emplacements à
compléter et des affirmations non vérifiées, et la prochaine action proposée (par exemple un message de
`redaction-prospection` pour l'accompagner).

## Critères de réussite

- Aucune affirmation hors inventaire ; aucun chiffre, logo ou témoignage inventé.
- Aucun contenu interne dans un support remis au client.
- Le plan a été validé avant la rédaction.
- Le support n'est ni envoyé ni publié par l'agent.

## Limites

- Une offre chiffrée avec conditions et mentions précontractuelles relève de `proposition-commerciale`.
- Un guide remis contre des coordonnées relève de `aimant-a-prospects`.
- Dans un secteur réglementé, la publicité et les documents d'information obligatoires sont validés par le
  professionnel responsable.

## Exemple

Cas nominal : fiche d'une page pour une PME de logistique rencontrée en découverte. Inventaire de douze affirmations :
huit tirées de la présentation validée, deux citations exactes du compte rendu (« nos quais débordent en décembre »),
une référence autorisée, un délai de mise en place « non vérifié » retiré. Le volume de colis du client devient
« [VOLUME ANNUEL] ».

Cas d'échec évité : la note interne sur le concurrent du client figurait dans les sources. La barrière du public
l'écarte de la fiche et le contrôle final le confirme.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `sales/skills/create-an-asset/SKILL.md`
(règles communes : sources validées seules, barrière du public, aucun chiffre inventé et emplacement entre crochets,
contenu du client traité comme une donnée ; étapes 1, 2 et 4 : forme et public, inventaire du contenu par ordre de
priorité, plan validé avant la rédaction, présentation de cinq ou six diapositives, contrôle final), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : réécriture en français, renvois aux
compétences de l'usine pour la charte, le style, la mise en forme et le fichier, aucun envoi. Texte de la licence et
liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
