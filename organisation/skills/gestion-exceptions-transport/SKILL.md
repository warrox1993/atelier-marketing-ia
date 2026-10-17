---
name: "gestion-exceptions-transport"
description: "Traite un incident de transport (retard, avarie apparente ou non apparente, manquant, perte, livraison refusée ou erronée) : chronologie, classement de gravité, réserves encore possibles selon la convention CMR pour le transport routier international, arbitrage chiffré entre absorber et réclamer, projet de réclamation au transporteur. À utiliser dès qu'une livraison pose problème ; jamais pour envoyer une réclamation, signer un bon de livraison ou accepter une indemnisation."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "logistique"
---

# Incidents de transport et réclamations

## Quand l'utiliser

- Une livraison arrive en retard, abîmée, incomplète, chez le mauvais destinataire, ou n'arrive pas.
- Un client refuse une livraison ou découvre une avarie après réception.
- Plusieurs incidents sont ouverts en même temps et il faut fixer un ordre de traitement.

## Objectif

Pour chaque incident : une chronologie sourcée, un niveau de gravité, la liste des délais encore ouverts (réserves,
prescription), un arbitrage chiffré « absorber ou réclamer » et, si la réclamation est retenue, un projet prêt à envoyer
par un humain.

## Prérequis

- Le document de transport (lettre de voiture CMR pour un transport routier international, bon de livraison), avec ce
  qui y a été écrit à la livraison.
- La commande, la facture et la valeur des marchandises ; le poids brut des colis concernés.
- Les photos, constats et échanges avec le transporteur.

## Entrées

- `incident` : type, date et heure de livraison ou de mise à disposition, constat.
- `documents` : lettre de voiture, bon de livraison, photos, échanges.
- `valeurs` : valeur des marchandises, frais annexes, pénalités client éventuelles.
- `transporteur` : identité, historique d'incidents des 30 derniers jours.

## Étapes

1. **Classer l'incident** : retard ; avarie apparente (visible à la livraison) ; avarie non apparente (découverte après) ;
   manquant ; excédent (quelqu'un d'autre est en manque) ; livraison refusée ; livraison erronée ; perte totale ou
   partielle ; contamination. Le type fixe les pièces et les délais.
2. **Établir la chronologie** : prise en charge, livraison ou mise à disposition, constat, réserves écrites, échanges.
   Chaque date renvoie à un document.
3. **Contrôler les délais**, pour un transport routier international soumis à la CMR :
   - avarie ou perte apparente : réserves au plus tard au moment de la livraison ;
   - avarie ou perte non apparente : réserves **écrites** dans les **sept jours** à dater de la livraison, dimanches et
     jours fériés non compris ;
   - retard : réserve écrite dans les **21 jours** à dater de la mise à disposition de la marchandise ;
   - action en justice : prescription d'**un an** (trois ans en cas de dol), à compter de la livraison pour une avarie,
     une perte partielle ou un retard.
   Une lettre de voiture signée sans réserve crée une présomption de bon état, que seule la preuve contraire renverse.
   Pour un transport national ou un autre mode, les délais sont à vérifier sur le contrat et la loi applicable.
4. **Classer la gravité** sur trois axes et retenir le plus élevé : impact financier (paliers en euros fixés par la
   direction), impact client (client clé avec engagement de délai, pénalités contractuelles, arrêt de production chez le
   client), urgence (livraison nécessaire sous 48 heures sans solution de remplacement). Sécurité ou produit réglementé :
   toujours en premier.
5. **Chiffrer l'arbitrage « absorber ou réclamer »** : montant récupérable (valeur au lieu et au moment de la prise en
   charge, plafonnée par kilogramme de poids brut selon la CMR), coût interne du dossier, probabilité de succès selon les
   preuves (réserves faites ou non, photos). Repères de départ à fixer par la direction : petit montant et bonne relation,
   absorber et noter pour l'évaluation du transporteur ; au-delà, réclamer. Trois incidents ou plus du même transporteur
   en 30 jours : traiter comme un problème de performance du transporteur, quel que soit le montant.
6. **Fixer l'ordre de traitement** si plusieurs incidents sont ouverts : sécurité et réglementaire ; arrêt de production
   chez un client ; périssable ; impact financier le plus élevé ; le plus ancien.
7. **Préparer le projet de réclamation** : faits datés, réserves faites, préjudice chiffré avec pièces, demande, délai de
   réponse ; et le message au client concerné, sans reconnaissance de responsabilité.
8. **Poser les décisions** : envoi de la réclamation, acceptation d'une offre d'indemnisation, renvoi vers l'assureur
   marchandises ; une carte par décision.

## Livrable

Fiche d'incident : type, chronologie sourcée, délais ouverts et dates limites, gravité et raison, arbitrage chiffré,
projet de réclamation, message client en brouillon, décisions humaines.

## Critères de réussite

- Chaque délai cité porte sa source ou la mention « à vérifier ».
- La date limite des réserves encore possibles est calculée et affichée.
- L'arbitrage est chiffré avec ses hypothèses.
- Aucun envoi au transporteur ni acceptation d'une offre n'est présenté comme fait.

## Sources officielles

Consultée le 17/10/2026 :

- Convention relative au contrat de transport international de marchandises par route (CMR), Genève, 19 mai 1956,
  Recueil des traités des Nations unies, volume 399, n° 5742,
  https://treaties.un.org/doc/Publication/UNTS/Volume%20399/volume-399-I-5742-French.pdf : article 30 (réserves au plus
  tard à la livraison pour les pertes ou avaries apparentes, écrites dans les sept jours, dimanches et jours fériés non
  compris, pour les non apparentes ; présomption de réception conforme à la lettre de voiture à défaut ; retard
  indemnisé seulement après réserve écrite dans les 21 jours de la mise à disposition), article 32 (prescription d'un
  an, trois ans en cas de dol ; point de départ), article 23 (indemnité calculée sur la valeur au lieu et à l'époque de
  la prise en charge, plafonnée par kilogramme de poids brut manquant).

## À vérifier par un professionnel

- Le plafond par kilogramme : le texte de 1956 l'exprime en francs-or ; le montant actuel en droits de tirage spéciaux
  résulte d'un protocole ultérieur, non relu ici. À confirmer par l'assureur ou un avocat en droit des transports.
- Le droit applicable à un transport national belge et les conditions générales du transporteur.
- La couverture par l'assurance marchandises de l'entreprise.

## Limites

- Elle ne traite ni le transport maritime, ni l'aérien, ni le ferroviaire, qui ont leurs propres conventions.
- Les repères de gravité et d'arbitrage sont des points de départ, à fixer par la direction.
- Elle ne qualifie pas une faute lourde ni un dol : question à l'avocat.

## Exemple

Livraison de 8 palettes le lundi 12/10, 2 abîmées, lettre de voiture CMR signée sans réserve ; avarie constatée au
déballage le mardi. Réserves écrites encore possibles jusqu'au mardi 20/10 (sept jours dimanches non compris, jour férié
éventuel à vérifier). Valeur des 2 palettes : 3 400 euros, poids brut 620 kg. Arbitrage : réclamer, avec photos et
réserves écrites à envoyer aujourd'hui ; carte « envoyer la réserve écrite au transporteur ». Projet de réclamation joint.

Cas d'échec évité : le transporteur propose par téléphone « 50 % et on oublie ». La compétence ne l'accepte pas, note
l'offre avec sa date et pose la décision en carte avec le montant récupérable estimé.

## Origine de la méthode

Méthode adaptée et traduite de github.com/affaan-m/ECC, `skills/logistics-exception-management/SKILL.md`, « Exception
Taxonomy », « Severity Classification », « Eat-the-Cost vs Fight-the-Claim » et « Priority Sequencing », commit
ef648e01899ba3e8dc6371642deaaf64b4477775, compétence sous licence Apache 2.0 (en-tête `license: Apache-2.0`, auteur
« evos »). Les seuils en dollars et les pratiques propres aux transporteurs américains ne sont pas repris ; délais
remplacés par la convention CMR. Modifications : réécriture en français, décision humaine. Texte des licences et liste
des reprises : `organisation/skills/LICENCES-TIERS.md`.
