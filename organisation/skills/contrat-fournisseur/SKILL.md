---
name: "contrat-fournisseur"
description: "Contrôle un projet de contrat ou des conditions générales de fournisseur pour une PME belge : durée et reconduction, résiliation, prix et indexation, délais de paiement (loi du 2 août 2002), pénalités, responsabilité et garanties, confidentialité, propriété, réversibilité, clause de sous-traitance de données personnelles (article 28 du RGPD), clauses abusives entre entreprises ; produit une fiche de points de contrôle et une liste d'escalade vers le juriste. À utiliser avant toute signature ou renouvellement ; jamais pour donner un avis juridique définitif, rédiger un contrat opposable, négocier avec le fournisseur ou signer."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "achats"
---

# Contrôle d'un contrat fournisseur

## Quand l'utiliser

- Le fournisseur retenu envoie son contrat ou ses conditions générales et il faut savoir à quoi l'entreprise s'engage.
- Un contrat arrive à échéance ou se reconduit automatiquement et il faut décider de le laisser courir ou non.
- Le fournisseur va manipuler des données personnelles (paie, clients, prospects, salariés) pour le compte de l'entreprise.

## Objectif

Une fiche d'une à deux pages qui dit, clause par clause, ce que prévoit le contrat, ce qui est inhabituel ou risqué, ce qu'il faut demander de modifier et ce qui doit passer par un juriste avant signature. La compétence prépare la décision, elle ne la prend pas.

## Prérequis

- Le contrat complet, annexes comprises (conditions générales, accord de niveau de service, annexe sur les données, tarifs), avec sa version et sa date.
- L'offre acceptée ou l'offre comparée (voir `comparaison-offres-fournisseurs`) pour vérifier que le contrat reprend ce qui a été promis.
- Le montant, la durée prévue et ce qui se passe si le fournisseur s'arrête (activité critique ou non).

## Entrées

- `contrat` : texte intégral.
- `offre` : offre retenue.
- `enjeux` : activité couverte, données personnelles concernées, montant annuel, tolérance à l'interruption.

## Étapes

1. **Identifier les parties** : dénomination, forme, numéro d'entreprise et adresse du fournisseur identiques à l'offre ; qui signe, avec quel pouvoir. Une différence est signalée à l'humain.
2. **Parcourir les points de contrôle** du tableau ci-dessous, dans l'ordre ; pour chaque ligne écrire la clause (numéro), ce qu'elle dit en une phrase, et un statut : conforme, à négocier, à escalader, information manquante.

   | Point | Ce qu'on regarde | Alerte |
   | --- | --- | --- |
   | Durée | durée initiale, date de début, engagement minimal | engagement long (3 ans ou plus) sans clause de sortie |
   | Reconduction | tacite ou expresse, préavis pour s'y opposer | reconduction automatique sans préavis raisonnable, préavis plus long que la durée reconduite, rappel avant échéance non prévu |
   | Résiliation | pour faute, pour convenance, préavis, frais de sortie | résiliation possible seulement pour le fournisseur, indemnité disproportionnée |
   | Prix et indexation | prix fixe ou révisable, indice, plafond, taxes | modification unilatérale du prix sans motif valable ni droit de sortie |
   | Paiement | délai, point de départ, facturation électronique, acompte | délai au-delà de 60 jours, intérêts ou indemnité de recouvrement exclus |
   | Niveau de service | disponibilité, délais de réponse et de rétablissement, mesure, rapports | engagement vague, aucune pénalité, mesure faite par le seul fournisseur |
   | Pénalités | montant, plafond, réciprocité, cumul avec dommages | pénalités à sens unique, plafond dérisoire ou excessif |
   | Responsabilité | plafond, exclusions, dommages indirects, faute lourde ou dol | exclusion totale, plafond très inférieur à l'enjeu, responsabilité du client illimitée |
   | Garanties et assurance | garantie de conformité, durée, assurance responsabilité du fournisseur | aucune attestation d'assurance demandée |
   | Propriété et licences | droits sur les livrables, données du client, développements spécifiques | le fournisseur devient propriétaire des données ou des livrables payés |
   | Confidentialité | périmètre, durée, exceptions | clause à sens unique |
   | Données personnelles | rôle de chaque partie, contrat de sous-traitance (voir ci-dessous) | traitement de données sans annexe dédiée |
   | Sous-traitance du fournisseur | autorisation, liste, responsabilité | sous-traitants libres, hors Espace économique européen sans garanties |
   | Réversibilité | restitution des données, format, délai, aide à la sortie, suppression | aucune restitution prévue, frais non chiffrés |
   | Cession et changement de contrôle | cession du contrat, rachat du fournisseur | cession libre sans information du client |
   | Droit applicable, juridiction | droit belge, tribunaux compétents, médiation éventuelle | juridiction étrangère lointaine |
   | Modifications du contrat | procédure, accord écrit | changement des conditions par simple mise en ligne |

3. **Contrôler la clause de traitement de données** si le fournisseur traite des données personnelles pour l'entreprise. Il est sous-traitant (l'entreprise est responsable du traitement) et un contrat écrit doit prévoir au minimum : objet, durée, nature et finalité du traitement, type de données et catégories de personnes ; traitement sur instruction documentée seulement ; confidentialité des personnes autorisées ; mesures de sécurité ; recours à un autre sous-traitant seulement avec autorisation préalable écrite (spécifique ou générale, avec information des changements) ; aide pour les demandes de droits des personnes ; aide pour la sécurité, les violations de données et les analyses d'impact ; suppression ou restitution des données à la fin ; mise à disposition de l'information pour prouver la conformité et acceptation d'audits ; transferts hors de l'Espace économique européen encadrés. Une annexe absente ou un renvoi à « la politique de confidentialité » du fournisseur ne suffit pas.
4. **Contrôler les délais de paiement** : le délai est de 30 jours civils par défaut, il peut être porté à 60 jours au plus par contrat (sauf secteurs autorisés par arrêté royal), la période de vérification ou d'acceptation entre dans ce délai, un intérêt de retard au taux directeur majoré de 8 points et une indemnité forfaitaire de 40 euros sont dus, et toute clause qui les exclut est nulle. Vérifier dans les deux sens : le fournisseur ne peut pas imposer plus, et l'entreprise doit respecter ce qu'elle accepte.
5. **Repérer les clauses abusives entre entreprises** (Code de droit économique, livre VI) : une clause qui crée, seule ou combinée à d'autres, un déséquilibre manifeste entre les droits et obligations est interdite. Liste noire (interdites d'office) : engagement irrévocable du client alors que l'exécution du fournisseur dépend de sa seule volonté, droit unilatéral du fournisseur d'interpréter le contrat, renonciation du client à tout recours, acceptation présumée de clauses dont le client n'a pas pu prendre connaissance. Liste grise (présumées abusives) : modification unilatérale du prix, des caractéristiques ou des conditions sans motif valable, reconduction tacite d'un contrat à durée déterminée sans préavis raisonnable. Les signaler ; ne pas écrire qu'elles sont nulles, c'est au juriste ou au juge de le dire.
6. **Comparer au reste** : le contrat reprend-il le prix, les délais, le périmètre et les engagements de service de l'offre ? Tout écart est listé avec les deux textes côte à côte.
7. **Classer les points** en trois paquets : à accepter ; à négocier (proposer une formulation de remplacement en une phrase) ; à escalader au juriste avant signature (toute la partie responsabilité et plafonds, données personnelles, clauses de la liste noire ou grise, juridiction étrangère, engagement long, enjeu important).
8. **Préparer l'escalade** : message au juriste ou à l'avocat avec le contrat, la fiche, les trois à cinq clauses prioritaires et la question posée à chacune, la date limite de signature, ce qui se passe si l'on ne signe pas.

## Livrable

1. La fiche de contrôle : tableau des points avec numéro de clause, résumé, statut.
2. Le contrôle de la clause de traitement de données (présent, partiel, absent, pour chaque élément).
3. La liste des écarts avec l'offre.
4. Le message d'escalade au juriste, avec les clauses prioritaires.
5. Les formulations de remplacement proposées pour la négociation, comme brouillons.

## Critères de réussite

- Chaque ligne cite un numéro de clause ou « absent du contrat ».
- Aucune phrase du type « ce contrat est valable » ou « cette clause est nulle » : le statut est « à escalader ».
- La clause de traitement de données est contrôlée élément par élément dès que des données personnelles sont en jeu.
- Les délais de paiement du contrat sont comparés au plafond de 60 jours.
- Un projet qui dépasse la durée ou le montant fixé par la direction (à défaut : 3 ans ou 10 000 euros) part chez le juriste dans tous les cas.

## Sources officielles

Consultées le 16/10/2026 :

- Loi du 2 août 2002 concernant la lutte contre le retard de paiement dans les transactions commerciales, Justel, https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=2002009716&la=F : paiement dans les trente jours civils par défaut entre entreprises, extension conventionnelle limitée à soixante jours sauf secteurs autorisés, la vérification ou l'acceptation compte dans le délai, intérêt au taux directeur plus huit points, indemnité de recouvrement de quarante euros, clauses d'exclusion nulles.
- Règlement (UE) 2016/679 du 27 avril 2016 (RGPD), EUR-Lex, https://eur-lex.europa.eu/eli/reg/2016/679/oj/fra : article 28, contrat obligatoire avec le sous-traitant, instruction documentée, confidentialité, sécurité, sous-traitance ultérieure sur autorisation, assistance, suppression ou restitution, audit, transferts. La relecture n'a porté que sur la première partie du texte ; l'énumération ci-dessus est à vérifier sur le texte intégral de l'article.
- « Changement majeur dans la réglementation des relations B2B : l'abus de dépendance économique et les clauses abusives entre entreprises expressément interdits », Lexgo, https://www.lexgo.be/fr/actualites-et-articles/5914-changement-majeur-dans-la-reglementation-des-relations-b2b-l-abus-de-dependance-economique-et-les-clauses-abusives-entre-entreprises-expressement-interdits : présentée par la source comme une loi du 21 mars 2019 ; le texte consolidé du Code de droit économique (Justel) indique en réalité la loi du 4 avril 2019, en vigueur le 1er décembre 2020 (voir la compétence revue-contrat-commercial) ; interdiction des clauses créant un déséquilibre manifeste, liste noire et liste grise, exemples de clauses, application aux contrats conclus, renouvelés ou modifiés après l'entrée en vigueur. Source secondaire (article de cabinet) ; le texte officiel du Code de droit économique (articles VI.91/3 à VI.91/5) n'a pas pu être ouvert, la page du SPF Économie s'est affichée avec un test anti-robot, elle n'est pas citée.
- « L'e-facturation à la portée de tous », SPF BOSA, https://efacture.belgium.be : facture électronique structurée obligatoire entre entreprises belges assujetties à la TVA depuis le 1er janvier 2026 ; le contrat doit prévoir ce mode de facturation.

Les alertes du tableau (durée de 3 ans, préavis, plafonds) sont des repères de pratique, pas des règles légales.

## À vérifier par un professionnel

Tout contrat signé engage l'entreprise : avocat ou juriste d'entreprise pour les clauses de responsabilité, de pénalités, de résiliation, d'indemnités, de juridiction et de clauses abusives. Délégué à la protection des données ou conseiller RGPD (ou avocat spécialisé) pour l'annexe de traitement de données, les transferts hors Espace économique européen et l'analyse d'impact. Expert-comptable pour les conséquences financières (indexation, engagement pluriannuel). Courtier ou assureur pour les assurances exigées du fournisseur.

## Limites

- La compétence lit un texte, elle ne connaît pas les usages du secteur ni la jurisprudence récente.
- Elle ne dit pas si une clause est valable ; elle la signale et escalade.
- Un contrat en néerlandais ou en anglais est contrôlé sur le texte d'origine ; la traduction faite ici n'a aucune valeur et la relecture est confiée au juriste.
- Les conditions générales publiées en ligne peuvent changer : toujours garder la version datée signée.
- Elle ne négocie pas et ne contacte pas le fournisseur ; elle prépare les formulations pour l'humain.

## Exemple

Contrat d'abonnement à un logiciel de planning, 3 ans, 6 000 euros par an, données du personnel traitées.

| Point | Clause | Résumé | Statut |
| --- | --- | --- | --- |
| Reconduction | art. 3.2 | reconduction par périodes de 12 mois, préavis de 6 mois | à négocier (préavis ramené à 2 mois) |
| Paiement | art. 5.1 | facture payable à 90 jours | à escalader : dépasse le plafond de 60 jours |
| Prix | art. 5.4 | le fournisseur peut modifier ses tarifs « à tout moment » | à escalader : liste grise |
| Responsabilité | art. 9 | exclue pour tout dommage indirect, plafond à 500 euros | à escalader |
| Données personnelles | annexe absente | renvoi à une politique de confidentialité en ligne | à escalader : contrat article 28 à exiger |
| Réversibilité | absent | rien sur la restitution des données | à négocier |

Cas d'échec : l'humain demande « dis-moi juste si je peux signer ». La compétence ne répond pas oui ou non. Elle renvoie la fiche, indique que quatre points sont à escalader (paiement au-delà de 60 jours, prix modifiable, responsabilité, absence de contrat de sous-traitance de données), joint le message prêt pour le juriste et rappelle qu'aucune signature n'est préparable avant sa réponse.
