---
name: "gestion-bail-commercial"
description: "Prépare le suivi d'un bail commercial belge : fiche des clauses (durée, renouvellement, indexation, état des lieux, garantie locative, charges), calendrier des échéances à surveiller et questions à poser à un avocat. À utiliser pour lire un bail, préparer une échéance de renouvellement ou de congé, ou tenir le registre des baux ; jamais pour signer, notifier un congé ou une demande de renouvellement, ni pour affirmer la validité d'une clause sans validation d'un avocat."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "services-generaux"
---

# Gestion d'un bail commercial

## Quand l'utiliser

- L'entreprise loue (ou donne en location) un local commercial, un bureau ou un entrepôt et veut connaître ses échéances.
- Un bail arrive à l'une de ses dates charnières (fin de triennat, fenêtre de renouvellement, fin de période).
- Une indexation, un décompte de charges ou une demande de révision de loyer arrive et doit être contrôlé.
- Un nouveau bail est proposé et il faut en extraire les clauses avant la lecture par un avocat.

## Objectif

Une fiche de bail où chaque clause importante renvoie à son article du contrat, et un calendrier d'échéances avec la date limite, le délai de préparation et le responsable humain. Les délais légaux sont donnés comme repères sourcés, jamais comme avis juridique. Rien n'est notifié, signé ni envoyé : le dossier est prêt pour la décision humaine.

## Prérequis

- Le contrat de bail complet et ses annexes (état des lieux d'entrée, plans, avenants), sous forme de documents de la tâche.
- La région où se situe le bien : la matière relève en partie des régions, le régime applicable est à faire confirmer par l'avocat.
- Le rôle de l'entreprise : preneur (locataire) ou bailleur.
- La date du jour de travail, pour calculer les délais restants.

## Entrées

- `bail` : le contrat et ses avenants (documents).
- `etat_des_lieux` : état des lieux d'entrée, et de sortie s'il existe.
- `historique` : indexations appliquées, décomptes de charges, courriers échangés avec le bailleur.
- `date_reference` : date de calcul des délais.

## Étapes

1. **Identifier le bail** : parties, bien (adresse, surface), date de prise de cours, durée, régime (bail de neuf ans ou autre). Une information absente du contrat est écrite « information manquante ».
2. **Remplir la fiche des clauses** avec l'article source pour chaque ligne :
   - durée et possibilités de sortie anticipée (fin de triennat) ;
   - renouvellement : fenêtre de demande, nombre de renouvellements ;
   - loyer et indexation : montant, indice, date anniversaire, formule ;
   - révision de loyer à l'expiration d'un triennat ;
   - charges et précompte : ce que le contrat met à charge du preneur, mode de décompte et de régularisation ;
   - garantie locative : forme, montant, conditions de restitution ;
   - état des lieux : entrant, sortant, expert, et sort des travaux réalisés par le preneur ;
   - sous-location et cession, affectation des lieux, assurances, enregistrement du bail.
3. **Contrôler l'indexation** : recalculer avec l'indice et la formule du contrat, comparer au montant réellement facturé, écrire l'écart. Si l'indice de départ n'est pas connu, ne pas deviner : poser la question.
4. **Construire le calendrier des échéances** : pour chaque date (fin de triennat, fenêtre de renouvellement, indexation annuelle, régularisation des charges, restitution de garantie), indiquer la date limite, la date à laquelle préparer (au moins trois mois avant pour une décision de renouvellement ou de congé), le responsable humain et la conséquence d'un oubli.
5. **Repérer les clauses à risque** : clause dérogatoire à la durée minimale, reconduction, charges non plafonnées, garantie supérieure à l'usage, interdiction de cession sans motif, indemnité de sortie. Les classer en « conforme au texte légal consulté », « inhabituel » ou « à faire valider ».
6. **Préparer les questions pour l'avocat** : une question précise par point, avec la clause en cause et la date qui presse.
7. **Préparer, sans l'envoyer, les brouillons utiles** (par exemple lettre de demande de renouvellement ou demande de décompte détaillé des charges), marqués « brouillon, à valider par l'avocat ». Les envois recommandés et les congés sont des actes humains.
8. **Livrer** la fiche, le calendrier, la table des faits et la carte de décision humaine.

## Livrable

- Fiche du bail : tableau clause, contenu, article source, statut (conforme, inhabituel, à valider).
- Calendrier des échéances trié par date, avec responsable et alerte à J-90, J-60 et J-30.
- Contrôle d'indexation : calcul détaillé, montant attendu, montant facturé, écart.
- Liste des questions pour l'avocat et brouillons éventuels.
- Table des faits : chaque donnée avec sa page ou son article.

## Critères de réussite

- Chaque clause citée renvoie à un article du contrat ; aucune clause n'est reformulée de mémoire.
- Chaque échéance du calendrier a une date limite calculée et vérifiable, ou la mention « information manquante ».
- Aucun délai légal n'est présenté comme définitif : il porte la source consultée et la mention « à faire valider par un avocat ».
- Aucun acte n'est accompli : pas de congé, pas de demande de renouvellement, pas de signature, pas de paiement.
- Le calcul d'indexation est reproductible à partir des chiffres donnés.

## Sources officielles

Consultées le 16/10/2026 :

- Loi du 30 avril 1951 sur les baux commerciaux (ancien Code civil, livre III, titre VIII, chapitre II, section 2bis), Justel, https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=1951043030&table_name=loi : durée minimale de neuf ans avec sortie possible à chaque triennat moyennant préavis de six mois pour le preneur ; demande de renouvellement entre dix-huit et quinze mois avant l'expiration ; révision du loyer demandée au juge de paix à l'expiration d'un triennat lorsque la valeur diffère d'au moins 15 % ; refus de renouvellement limité à des motifs listés ; indemnité d'éviction d'un à trois ans de loyer selon les cas. Le texte consulté est celui de l'ancien Code civil tel que publié par Justel : des règles régionales ou plus récentes peuvent s'y ajouter ou le modifier selon la région du bien, ce que cette lecture n'a pas permis de vérifier. Les délais et montants repris ici sont donc des repères à confirmer.

Aucune source officielle n'a été ouverte sur l'indexation des loyers commerciaux, les charges ni la garantie locative : ces points se lisent dans le contrat et se vérifient avec l'avocat.

## À vérifier par un professionnel

Tout le dossier est à faire valider par un avocat (de préférence en droit immobilier) avant toute notification, tout congé, toute demande de renouvellement, toute signature ou toute négociation : calcul des délais, régime régional applicable, validité des clauses dérogatoires, formalités d'envoi (recommandé, huissier) et enregistrement. Le calcul de l'indexation et le traitement comptable des charges sont à contrôler par l'expert-comptable.

## Limites

- La compétence lit et organise ; elle ne qualifie pas juridiquement une clause.
- Elle n'a pas accès au registre du bien ni aux courriers non fournis : elle le dit.
- Un bail non écrit, un bail de courte durée ou un bail mixte (habitation et commerce) sort de son cadre : renvoi à l'avocat.
- La région du bien peut changer le régime : elle ne le suppose pas.
- Les délais sont calculés à partir des dates fournies ; une date contestée est signalée, pas tranchée.

## Exemple

Bail commercial pour un entrepôt, prise de cours le 01/03/2023, durée neuf ans, loyer de base 2 400 euros par mois, indexation annuelle à la date anniversaire (formule du contrat, article 7, indice de départ donné en annexe).

Calendrier : fin du premier triennat le 28/02/2026 (déjà passée) ; fin du deuxième triennat le 28/02/2029 ; fin du bail le 28/02/2032. Fenêtre de demande de renouvellement : entre le 28/08/2030 et le 28/11/2030 (dix-huit à quinze mois avant le 28/02/2032), repère à faire confirmer par l'avocat. Alerte à préparer dès le 01/06/2030.

Contrôle d'indexation 2026 : loyer indexé attendu selon la formule de l'article 7 et les deux indices fournis, comparé au montant facturé par le bailleur, écart écrit en euros par mois et par an.

Cas d'échec : l'annexe qui devait donner l'indice de départ est absente et le bailleur a facturé un loyer indexé. La compétence ne recalcule pas avec un indice deviné : elle écrit « indexation non contrôlable : indice de départ manquant », ajoute la question « fournir l'annexe ou demander au bailleur l'indice et la formule appliqués », laisse le statut de la clause à « à valider » et ne produit aucun brouillon de contestation.
