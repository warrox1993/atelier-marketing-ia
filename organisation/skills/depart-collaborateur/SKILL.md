---
name: "depart-collaborateur"
description: "Prépare le départ d'un collaborateur d'une PME belge une fois la fin du contrat décidée par l'humain : calendrier à rebours, matériel et documents à restituer, accès informatiques à fermer dans l'ordre, passation des dossiers, documents sociaux de sortie à vérifier avec le secrétariat social et entretien de sortie facultatif. À utiliser dès qu'une date de départ est connue (démission, fin de contrat, pension, rupture décidée) ; jamais pour décider ou motiver une rupture, calculer un préavis ou une indemnité, ni évaluer la personne."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "ressources-humaines"
---

# Départ d'un collaborateur

Service sensible : la compétence organise un départ déjà décidé. La rupture, son motif, le préavis et les montants
relèvent du service juridique social et de l'humain ; la compétence n'en traite aucun.

## Quand l'utiliser

- Une démission, une fin de contrat à durée déterminée, un départ à la pension ou une rupture décidée est confirmé par
  écrit avec sa date.
- Les accès d'anciens collaborateurs restent ouverts faute de liste.
- La passation des dossiers d'une personne qui part n'est pas organisée.

## Objectif

Un plan de départ daté, miroir du plan d'accueil, où chaque restitution, chaque fermeture d'accès, chaque document de
sortie et chaque dossier transmis a un responsable humain, une date et un statut, sans aucune appréciation sur la
personne.

## Prérequis

- La date de fin de contrat confirmée par écrit par l'humain responsable, et le type de départ (sans motif détaillé).
- L'inventaire du matériel et des accès attribués (fourni par l'informatique par le bureau de liaison).
- La liste des dossiers en cours tenue par le manager.
- Le nom du secrétariat social.

## Entrées

- `poste`, `date_fin`, `type_depart` (démission, fin de durée déterminée, pension, rupture décidée par l'employeur).
- `materiel` : ordinateur, téléphone, badge, clés, cartes.
- `acces` : messagerie, dossiers partagés, logiciels, comptes administrateurs.
- `dossiers_en_cours` : liste du manager.

## Étapes

1. **Fixer le calendrier à rebours** : J-15 (passation lancée), J-5 (restitutions planifiées), J-1 (dernier jour
   ouvré), J (fermeture des accès), J+30 (contrôle).
2. **Organiser la passation** : par dossier, le repreneur, l'état, les échéances, les contacts et l'emplacement des
   pièces ; un échange de passation par dossier important avant J-5.
3. **Lister les restitutions** : matériel, badges, clés, cartes de paiement ou de carburant, documents de l'entreprise.
4. **Planifier la fermeture des accès** avec l'informatique, dans cet ordre : comptes à privilèges d'abord, puis accès
   distants, messagerie (réponse automatique et transfert décidés par le manager, durée limitée), logiciels,
   badges. Les secrets partagés connus de la personne sont à changer par l'informatique.
5. **Lister les documents de sortie à vérifier avec le secrétariat social**, sans les produire : documents sociaux
   de fin de contrat, attestation de vacances, certificat de travail, décompte final. Chacun reste « à vérifier » :
   la liste exacte dépend du type de départ.
6. **Proposer un entretien de sortie facultatif** avec trois questions ouvertes (ce qui a bien fonctionné, ce qui
   devrait changer, conseil au successeur), réponses agrégées et jamais utilisées contre la personne.
7. **Rédiger les brouillons** : annonce interne neutre (fait et date, sans motif), message au repreneur.
8. **Contrôler à J+30** : accès réellement fermés (preuve fournie par l'informatique), matériel rendu, documents remis.

## Livrable

- Le calendrier daté du départ.
- Le tableau de passation par dossier.
- La liste des restitutions et des accès à fermer, avec responsable et statut.
- La liste des documents de sortie « à vérifier » avec le secrétariat social.
- Les brouillons d'annonce interne et de trame d'entretien de sortie.

## Critères de réussite

- Chaque accès a une date de fermeture et une preuve attendue ; aucun accès à privilèges ne reste ouvert après J.
- Chaque dossier en cours a un repreneur nommé.
- Aucun motif de départ, aucune appréciation et aucun montant ne figurent dans le plan.

## À vérifier par un professionnel

- La liste et le contenu des documents sociaux de sortie selon le type de départ, ainsi que les délais de remise :
  secrétariat social.
- Toute question de préavis, d'indemnité, de clause de non-concurrence ou de motif : service juridique social et
  avocat en droit social.

## Limites

- La compétence ne ferme aucun accès elle-même ; l'informatique agit et prouve.
- Elle n'a lu aucun texte officiel sur les documents de sortie : tout ce point reste « à vérifier ».
- Elle ne traite aucune donnée de santé, même en cas de départ lié à une incapacité.

## Exemple

Départ d'une commerciale le 30 novembre 2026 (démission). Passation : 14 dossiers clients répartis entre deux collègues
avant le 20 novembre ; restitution de l'ordinateur et du badge le 30 ; l'informatique ferme l'accès distant et le
compte du logiciel commercial le 30 à 18 h, la messagerie passe en réponse automatique pour 30 jours ; documents de
sortie à confirmer avec le secrétariat social ; contrôle le 30 décembre.

Cas d'échec : le manager demande d'ajouter au plan « personne peu fiable, ne pas réengager ». La compétence refuse :
aucune appréciation sur la personne n'entre dans un document de départ.

## Origine de la méthode

Construite en miroir de la compétence `accueil-nouveau-collaborateur` de l'atelier. Aucun dépôt tiers ne propose de
méthode dédiée au départ (étude usine v2, groupe 1, section 8.2) ; rien n'est repris.
