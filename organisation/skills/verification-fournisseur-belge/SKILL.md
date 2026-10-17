---
name: "verification-fournisseur-belge"
description: "Vérifie un fournisseur avant un premier contact, une commande ou un paiement, avec des sources publiques belges et européennes : existence et statut à la Banque-Carrefour des Entreprises, numéro de TVA (VIES pour un fournisseur d'un autre État membre), comptes déposés à la Centrale des bilans, obligation de retenue pour dettes sociales et fiscales dans les secteurs concernés. À utiliser pour présélectionner, référencer ou contrôler un fournisseur ; jamais pour juger une personne physique, refuser un fournisseur ou effectuer une retenue à la place de l'humain."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "achats"
---

# Vérification d'un fournisseur belge

## Quand l'utiliser

- Un nouveau fournisseur est envisagé (présélection, premier contact, référencement).
- Une commande ferme ou un contrat va être signé.
- Avant le paiement d'une facture d'un fournisseur qui travaille dans un secteur soumis à l'obligation de retenue.

## Objectif

Une fiche de vérification datée où chaque point (identité, TVA, comptes, retenue) a une source publique, une date de
consultation et un statut (conforme, à vérifier, alerte), sans conclusion sur une personne et sans décision prise à la
place de l'humain.

## Prérequis

- Le numéro d'entreprise ou, à défaut, la dénomination exacte du fournisseur.
- Le numéro de TVA indiqué sur l'offre ou la facture.
- La nature de la prestation, pour savoir si elle entre dans un secteur soumis à l'obligation de retenue.
- Un humain disponible pour les consultations qui demandent une connexion ou un accès authentifié.

## Entrées

- `fournisseur` : dénomination, numéro d'entreprise, numéro de TVA, pays d'établissement.
- `prestation` : objet, montant estimé, durée.
- `moment` : présélection, signature, ou paiement d'une facture (date).

## Étapes

1. **Identité** : rechercher le numéro d'entreprise dans la recherche publique de la Banque-Carrefour des Entreprises
   (BCE) : dénomination, forme juridique, statut (actif ou non), siège, activités, date de début. Une dénomination ou
   un siège différents de l'offre sont une alerte à faire expliquer.
2. **TVA** : fournisseur belge, contrôler que le numéro de TVA correspond au numéro d'entreprise et que l'entité est
   assujettie selon la BCE ; fournisseur d'un autre État membre, faire valider le numéro par VIES (système européen
   de vérification des numéros de TVA) et garder la preuve de consultation.
3. **Comptes annuels** : pour une personne morale tenue au dépôt, relever à la Centrale des bilans la date du dernier
   dépôt et les grandeurs publiques utiles (fonds propres, résultat, évolution). Un dépôt absent ou tardif est un
   signal, pas une conclusion.
4. **Obligation de retenue (dettes sociales et fiscales)** : si la prestation relève d'un secteur visé (travaux
   immobiliers, gardiennage, préparation de la viande selon la page de la sécurité sociale), la vérification se fait
   à la signature du contrat et avant chaque paiement, dans l'application de l'ONSS. Statut vert, rouge ou gris noté
   avec la date. Statut rouge : la retenue et son versement sont une décision et un acte humains, préparés par une
   carte ; l'agent ne calcule pas de retenue sans la règle du jour.
5. **Signaux complémentaires** : société très récente pour un contrat long, changement récent de dirigeants ou de
   dénomination, activité sans lien avec la prestation. Jamais de conclusion sur une personne physique ; jamais
   « fournisseur en difficulté » sur un seul signal.
6. **Fiche de synthèse** et carte de décision si un point est en alerte (premier contact, commande, paiement).

## Livrable

Une fiche par fournisseur : identité (source, date), TVA (source, date, preuve VIES le cas échéant), comptes (date du
dernier dépôt, grandeurs), obligation de retenue (secteur visé ou non, statut et date), signaux, statut global,
questions au fournisseur et carte de décision.

## Critères de réussite

- Chaque point a une source publique et une date de consultation.
- Un fournisseur dans un secteur visé a un statut de retenue daté, consulté au moment voulu (signature ou paiement).
- Aucune conclusion sur une personne physique ; aucun refus présenté comme décidé.
- Aucune donnée réelle d'un fournisseur n'est inventée : une recherche sans résultat est écrite comme telle.

## Sources officielles

Consultées le 17/10/2026 :

- Recherche publique de la Banque-Carrefour des Entreprises, SPF Economie,
  https://kbopub.economie.fgov.be/kbopub/zoeknummerform.html : « données publiques de toutes les entités enregistrées »
  dans la BCE, recherche par numéro, dénomination, activité ou adresse.
- VIES, Commission européenne, https://ec.europa.eu/taxation_customs/vies/ : vérification des numéros de TVA des
  opérateurs de l'Union.
- Centrale des bilans, Banque nationale de Belgique, https://www.nbb.be/fr/centrale-des-bilans : dépôt et consultation
  des comptes annuels.
- « Consultation, préparation et paiement de la retenue sur facture », portail de la sécurité sociale,
  https://www.socialsecurity.be/site_fr/employer/applics/30bis/general/invoice.htm : vérification par les donneurs
  d'ordre, entrepreneurs et sous-traitants, « lors de la signature du contrat et avant chaque paiement de facture » ;
  secteurs : immobilier, gardiennage, préparation de la viande ; retenues de 35 % (ONSS), 15 % (SPF Finances) et 15 %
  (INASTI, activités immobilières seulement) ; base mise à jour chaque mois.

La base légale (article 30bis de la loi du 27 juin 1969 pour les dettes sociales, et la disposition fiscale
correspondante) est à lire sur Justel avant usage.

## À vérifier par un professionnel

L'appartenance d'une prestation à un secteur visé, le calcul et le versement d'une retenue, et la responsabilité
solidaire qui en découle relèvent du juriste ou de l'expert-comptable ; le refus d'un fournisseur reste une décision
humaine.

## Limites

- La compétence ne se connecte à aucune application authentifiée : l'humain fait la consultation de l'ONSS si elle
  demande un accès.
- Elle ne note pas la solvabilité d'un fournisseur et n'achète aucun rapport commercial.
- Les fournisseurs hors Union européenne demandent d'autres vérifications, non traitées ici.

## Exemple

Fournisseur fictif « Toitures Exemple SRL », travaux de réfection de toiture, 18 000 euros. BCE : active, activité de
couverture, siège conforme à l'offre (consulté le 17/10/2026). TVA : assujettie. Comptes : dernier dépôt pour
l'exercice 2025. Secteur visé (travaux immobiliers) : vérification de l'obligation de retenue demandée à l'humain avant
signature, puis avant chaque paiement. Carte : premier contact autorisé ou non.

Cas d'échec : l'agent écrit « aucune dette sociale » parce qu'il n'a rien trouvé dans les comptes annuels. Les comptes
ne le montrent pas : seul le statut consulté dans l'application de l'ONSS, daté, le dit.
