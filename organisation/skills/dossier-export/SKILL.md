---
name: "dossier-export"
description: "Constitue et contrôle le dossier d'une opération d'exportation hors UE par une PME belge : liste des pièces (facture commerciale, liste de colisage, document de transport, certificat ou déclaration d'origine, déclaration d'exportation, numéro EORI), choix et vérification de l'Incoterm, répartition des responsabilités et des risques, contrôle de cohérence avant expédition. À utiliser pour préparer ou vérifier un dossier d'export, jamais pour déposer une déclaration, signer une pièce, certifier une classification ou une origine, ni pour trancher un risque de sanctions : ces actes restent humains."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commerce-exterieur"
---

# Dossier d'exportation d'une PME belge

## Quand l'utiliser

- Une PME va expédier des marchandises hors du territoire douanier de l'Union et veut savoir quelles pièces réunir.
- Un dossier existe déjà et il faut vérifier sa complétude et la cohérence entre commande, facture, colisage et transport.
- Le client étranger propose un Incoterm et il faut en comprendre les conséquences avant d'accepter.

## Objectif

Un dossier où chaque pièce est présente, datée, cohérente avec les autres, et où l'Incoterm choisi correspond à ce que chaque partie fera réellement. Tout écart est listé avec la question à poser. Rien n'est déclaré ni signé par la compétence.

## Prérequis

- La fiche de l'entreprise (raison sociale, numéro d'entreprise, numéro EORI s'il existe).
- L'opération : marchandise, quantités, valeur, pays de destination, client, conditions de vente.
- Pour le classement et l'origine : la compétence `classement-douanier-origine` ; ici on ne fait que contrôler que ces deux mentions figurent et concordent.

## Entrées

- `operation` : client, pays, marchandise, valeur, devise, date d'expédition prévue.
- `pieces` : les documents déjà reçus ou produits, avec leur date.
- `incoterm_propose` : le terme annoncé par le client ou le service commercial, avec le lieu nommé.
- `fiche_entreprise` : identifiants et contacts (adresses fictives en test : @exemple.invalid).

## Étapes

1. **Cadrer l'opération** : exportation définitive, envoi temporaire, retour, échantillon sans valeur marchande. Le régime change les pièces ; en cas de doute, écrire « régime à confirmer par le transitaire ».
2. **Vérifier l'identification** : l'entreprise dispose-t-elle d'un numéro EORI ? Il est obligatoire pour les opérations douanières dans l'UE (source ci-dessous). S'il manque, la première action est l'enregistrement auprès de l'autorité douanière du pays d'établissement, par l'humain.
3. **Dresser la liste des pièces** selon le tableau ci-dessous et noter l'état de chacune : présente, manquante, à corriger, sans objet (avec la raison).
4. **Choisir ou vérifier l'Incoterm** (voir « Incoterms » plus bas) : le terme, le lieu nommé, qui contracte le transport, qui assure, qui fait les formalités d'exportation et d'importation.
5. **Contrôler la cohérence** pièce par pièce : identité des parties, adresses, désignation des marchandises, quantités, poids, valeur et devise, Incoterm et lieu, numéros de commande et de facture, dates. Chaque écart va dans un tableau d'incohérences.
6. **Identifier les risques** : paiement (voir `prospection-marche-etranger`), transport, assurance, conformité (classement, origine, biens à double usage, sanctions : voir `classement-douanier-origine`). Tout signal d'arrêt de cette compétence suspend le dossier.
7. **Préparer le contrôle avant expédition** : liste de vérifications cochées, pièces à remettre au transporteur ou au transitaire, pièces à conserver, et décisions humaines nécessaires (qui déclare, qui signe).

### Les pièces d'un dossier d'export

| Pièce | Rôle | Points de contrôle |
| --- | --- | --- |
| Facture commerciale | preuve de la vente et base de la valeur déclarée | parties, désignation précise, quantités, prix unitaire, devise, Incoterm et lieu, conditions de paiement, numéro d'EORI de l'exportateur si requis |
| Liste de colisage | contenu de chaque colis | nombre de colis, poids net et brut, dimensions, marques, concordance avec la facture |
| Document de transport | contrat et reçu du transport (lettre de voiture, connaissement, lettre de transport aérien) | expéditeur, destinataire, marchandise, port ou lieu de chargement et de livraison, mention de l'Incoterm, nombre de colis |
| Preuve d'origine | accès éventuel à un tarif préférentiel chez l'importateur | certificat ou déclaration d'origine exigé par l'accord applicable, statut REX s'il y a lieu, concordance avec la facture (voir `classement-douanier-origine`) |
| Déclaration d'exportation | formalité douanière électronique déposée au bureau de douane compétent | code marchandise, valeur, régime, EORI ; déposée et signée par le déclarant, jamais par la compétence |
| Autorisations et licences | si la marchandise est soumise à restriction ou à contrôle | présence, validité, concordance avec la marchandise ; absence = arrêt |
| Assurance transport | couverture de la marchandise pendant le transport | montant assuré, risques couverts, bénéficiaire, cohérence avec l'Incoterm |
| Preuve de sortie | atteste que la marchandise a quitté le territoire de l'Union | conservée avec le dossier ; peut servir à justifier l'exemption de TVA (à confirmer avec le comptable) |

Selon la marchandise et le pays, d'autres pièces s'ajoutent (certificat phytosanitaire, sanitaire, légalisation, certificat de conformité). La compétence les signale comme « pièce possible à confirmer par le transitaire » et n'en invente pas la liste.

### Incoterms : principes

Les Incoterms de la Chambre de commerce internationale forment un ensemble de onze termes de trois lettres, qui précisent les tâches, les coûts et les risques de la livraison entre vendeur et acheteur. Le texte complet de l'édition 2020 est payant : cette compétence n'en recopie pas le contenu et ne cite que des principes publics.

- Un Incoterm n'est pas un contrat : il doit être écrit dans le contrat de vente et accompagné d'un **lieu précis** (« FCA entrepôt du vendeur, ville », pas « FCA Belgique »).
- Il règle surtout : où le vendeur a rempli son obligation de livrer, où passe le risque de perte ou de dommage, qui paie le transport, qui accomplit les formalités d'exportation et d'importation.
- Il ne règle pas : le transfert de propriété, le prix, le paiement, la loi applicable ni les recours en cas de litige.
- Ne pas confondre terme maritime (convient au conteneur uniquement si le transport est de port à port) et terme tous modes : un terme maritime utilisé pour un envoi par camion ou par avion crée des ambiguïtés de risque.
- Question de contrôle : le vendeur peut-il réellement faire ce que le terme lui demande dans le pays visé (par exemple, dédouaner à l'importation dans un pays où il n'a pas de représentant) ? Sinon, proposer l'alternative à discuter avec le transitaire.

## Livrable

1. Une liste de contrôle de complétude : pièce, état, date, remarque.
2. Un tableau d'incohérences : champ, valeur de chaque pièce, écart, question à poser.
3. Une fiche Incoterm : terme et lieu, qui fait quoi, point de transfert du risque, assurance, points d'attention.
4. Une liste des décisions humaines : qui dépose la déclaration, qui signe, qui assure, qui paie le transport.
5. Un verdict : « prêt à expédier sous réserve de ... », « incomplet » ou « suspendu (signal d'arrêt) ».

## Critères de réussite

- Chaque pièce est suivie d'un état et d'une date ; aucune pièce n'est déclarée « conforme » sans avoir été comparée aux autres.
- L'Incoterm est accompagné d'un lieu, et ses conséquences sur le risque, l'assurance et les formalités sont écrites.
- Les identifiants (EORI, numéro d'entreprise) viennent de la fiche, jamais d'une supposition.
- Les mentions de classement et d'origine sont marquées « à confirmer par l'humain ou le transitaire ».
- Aucune déclaration, signature ni envoi n'a été fait par la compétence.

## Sources officielles

Consultées en ligne le 16/10/2026 :

- « Exportation », Commission européenne, DG Fiscalité et union douanière, https://taxation-customs.ec.europa.eu/customs/customs-procedures-import-and-export/exportation_en : la déclaration d'exportation est déposée par voie électronique (système automatisé d'exportation) ; deux bureaux interviennent, le bureau d'exportation et le bureau de sortie ; les marchandises restent sous surveillance douanière jusqu'à leur sortie du territoire de l'Union ; une déclaration préalable au départ est exigée comme formalité de sécurité.
- « EORI », Commission européenne, https://taxation-customs.ec.europa.eu/customs/customs-procedures-import-and-export/customs-operations/economic-operators-registration-and-identification-number-eori_en : numéro obligatoire pour les opérations douanières sur le territoire de l'Union ; l'opérateur établi dans l'UE s'enregistre auprès de l'autorité douanière de son pays d'établissement ; format : code pays de deux lettres suivi d'un identifiant ; un outil de validation en ligne existe.
- « Incoterms 2020 », Chambre de commerce internationale, https://iccwbo.org/business-solutions/incoterms-rules/ : onze termes de trois lettres qui précisent tâches, coûts et risques de la livraison ; l'édition 2020 est payante. Seuls ces principes publics sont repris.

Le détail des pièces complémentaires (certificats sanitaires, légalisations) et le calcul de l'exemption de TVA à l'exportation n'ont pas été relus dans une source officielle ce jour : ils sont à confirmer.

## À vérifier par un professionnel

Le choix de l'Incoterm, le régime douanier, la déclaration d'exportation, l'exemption de TVA et le contenu exact des pièces sont à valider par un déclarant en douane ou un transitaire. Les clauses du contrat de vente (Incoterm, paiement, loi applicable, responsabilité) sont à faire relire par un avocat en droit du commerce international.

## Limites

- La compétence prépare et contrôle ; elle ne dépose, ne signe, n'assure et ne paie rien.
- Elle ne reproduit pas le texte payant des Incoterms 2020 ; en cas de question fine, il faut le texte officiel.
- Elle ne couvre pas l'importation, ni les envois intra-UE (règles de TVA et de déclaration différentes).
- Les pays et marchandises soumis à des règles particulières (sanctions, double usage, produits sanitaires) exigent l'arrêt et l'avis d'un professionnel.

## Exemple

Opération : 12 palettes de pièces mécaniques, valeur 18 400 euros, vers un client de Suisse, transport routier, envoi prévu le 03/11/2026.

Pièces reçues : facture (n° 2026-0417), liste de colisage, projet de lettre de voiture. Le client propose « CIF Zurich ».

Contrôle : la facture indique 12 palettes, le colisage 11 palettes et 1 caisse : écart noté, question « la caisse est-elle comptée comme palette ? ». L'Incoterm CIF est un terme maritime : pour un envoi par camion il prête à confusion ; proposition à discuter avec le transitaire : un terme tous modes avec lieu nommé. EORI : présent dans la fiche. Verdict : « prêt à expédier sous réserve de la réponse sur les palettes, de l'Incoterm confirmé et de la preuve d'origine ».

Cas d'échec : le dossier d'un client dans un pays visé par des mesures restrictives de l'UE. La compétence ne complète pas la liste des pièces comme si de rien n'était : elle écrit « suspendu : signal d'arrêt, voir classement-douanier-origine », ne propose aucun contournement (autre pays de livraison, intermédiaire) et transmet au coordinateur pour décision humaine et avis juridique.
