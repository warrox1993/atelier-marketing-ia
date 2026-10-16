---
name: "proposition-commerciale"
description: "Rédige le projet de proposition commerciale d'une entreprise belge, centré sur le problème du client : contexte compris, solution, périmètre et exclusions, prix hors et avec TVA, conditions, validité, mentions obligatoires B2B ou B2C (information précontractuelle, droit de rétractation du consommateur à distance), prochaines étapes. À utiliser pour une offre, un devis argumenté ou la réponse à une demande de prix ; jamais pour l'envoyer, la signer, fixer un prix de mémoire ou valider juridiquement les conditions."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commercial"
---

# Proposition commerciale

## Quand l'utiliser

- Des notes de rendez-vous ou une demande écrite doivent devenir une offre à relire et à envoyer.
- Un devis doit être argumenté, avec périmètre, exclusions et conditions.
- Une même offre doit être déclinée pour un client entreprise (B2B) et pour un particulier (B2C).

## Objectif

Produire un projet d'offre clair, dont chaque chiffre est sourcé, qui commence par le problème du client, délimite ce qui est inclus et exclu, et porte les mentions et conditions que la personne responsable devra faire valider avant envoi.

## Prérequis

- Les notes de rendez-vous ou la demande du client, et l'objectif de l'offre.
- Les tarifs, conditions et documents fournis par le client de l'atelier (connaissances rattachées) : jamais de prix de mémoire.
- L'identité de l'émetteur (dénomination, numéro d'entreprise, numéro de TVA, adresse, et numéro d'agrément ou d'inscription s'il y en a un) recopiée uniquement depuis la fiche de l'entreprise, jamais d'une page web.
- Le statut du destinataire : entreprise ou consommateur, et canal de conclusion (sur place, à distance, hors établissement).

## Entrées

- `destinataire` : entreprise ou particulier, avec son statut.
- `besoin` : le problème exprimé, dans les mots du client.
- `faits` : table des chiffres avec leur source `connaissance://…`.
- `canal` : établissement, distance (courriel, site, téléphone) ou hors établissement.

## Étapes

1. Reformuler le contexte et le problème en trois à cinq phrases, avec les mots du client. Une information absente s'écrit « information manquante » avec la question à poser.
2. Décrire la solution proposée par rapport au problème, pas par catalogue. Ajouter le périmètre (ce qui est inclus), les exclusions explicites, les hypothèses (ce que le client doit fournir, délais d'accès, volumes supposés) et le planning.
3. Établir la table des faits : chaque prix, quantité, durée, garantie, franchise ou plafond avec sa source. Un chiffre sans source est retiré ou renvoyé au responsable.
4. Prix et TVA. Indiquer le prix hors TVA, le taux et le montant de TVA, le prix TTC. En Belgique le taux normal est 21 %, avec des taux réduits de 12 % et 6 % et un taux nul pour certains biens et services : le taux applicable dépend de la prestation, il est donc écrit « à confirmer par le comptable » sauf si les documents du client le donnent. Pour un consommateur, afficher le prix TTC en premier. Pour une entreprise, le prix hors TVA est d'usage.
5. Conditions : modalités et délai de paiement, acompte, durée du contrat, reconduction éventuelle (voir `renouvellement-fidelisation`), résiliation, responsabilité, droit applicable, validité de l'offre (date limite précise, par exemple 30 jours à compter de la date d'émission, et ce qui change après).
6. Mentions selon le destinataire.
   - Entreprise (B2B) : conditions générales communiquées et acceptées avant la conclusion (les annexer ou les lier) ; une clause qui crée un déséquilibre manifeste entre les parties est exposée à l'appréciation du juge : éviter les clauses unilatérales (modification du prix, reconduction sans délai raisonnable pour s'opposer).
   - Consommateur (B2C) : information précontractuelle claire et compréhensible avant l'engagement (identité et coordonnées du professionnel, caractéristiques essentielles, prix TTC avec tous les frais, durée et conditions de résiliation, existence ou non d'un droit de rétractation). Pour un contrat conclu à distance ou hors établissement : droit de rétractation de 14 jours calendaires sans justification, à compter du lendemain de la réception du bien ou de la conclusion du contrat de service, avec formulaire type de rétractation fourni ; exceptions possibles (biens personnalisés, produits périssables, contenus numériques téléchargés, certains services datés) à vérifier cas par cas. Si le consommateur supporte les frais de retour, le dire avant la conclusion.
7. Ajouter les prochaines étapes (qui fait quoi, avant quelle date), puis la liste des points à valider par le responsable avant envoi : chiffres, conditions, mentions, texte juridique.
8. Si le secteur est réglementé, ajouter les documents d'information obligatoires, joints par le responsable et non résumés ici, et ne formuler aucune recommandation personnalisée.

## Livrable

Un projet de proposition en français, prêt à relire : contexte, solution, périmètre et exclusions, prix et TVA, conditions, validité, mentions selon B2B ou B2C, prochaines étapes. Avec : la table des faits sourcés et la liste des points à valider avant envoi.

## Critères de réussite

- Chaque chiffre est dans la table des faits avec sa source ; aucun prix, remise, garantie ou délai inventé.
- Le projet commence par le problème du client, pas par le catalogue.
- Le périmètre, les exclusions et la date de validité sont explicites.
- Les mentions correspondent au statut du destinataire et au canal ; pour un consommateur à distance, le droit de rétractation est traité.
- Les points juridiques sont marqués « à valider », jamais présentés comme acquis.

## Limites

- Le projet ne vaut pas avis juridique ni fiscal. À faire vérifier avant envoi : les conditions générales et les mentions par un juriste ou un avocat en droit économique, le taux de TVA et les mentions de facture par un comptable ou un expert-comptable.
- Les articles du Code de droit économique relatifs à l'information précontractuelle et à la rétractation n'ont pas pu être relus à la source officielle le 16/10/2026 : leurs numéros ne sont pas cités ici, à vérifier.
- Le prolongement du délai de rétractation quand l'information n'a pas été donnée n'est pas confirmé par les sources consultées : à vérifier.
- Dans un secteur réglementé (assurance, crédit, placements, professions réglementées), la recommandation personnalisée et les documents obligatoires relèvent d'un professionnel habilité.
- L'agent n'envoie, ne signe et ne publie rien.

## Sources officielles

- « Droit de rétractation : j'ai acheté une chose et je le regrette, que puis-je faire ? », Droits Quotidiens (service d'information juridique), https://www.droitsquotidiens.be/fr/question/jachete-une-chose-et-je-regrette-que-puis-je-faire (consultée le 16/10/2026) : droit de rétractation de 14 jours calendaires pour les achats à distance et hors établissement, notification écrite, formulaire type, remboursement sous 14 jours, frais de retour.
- « Achat compulsif, signature impulsive : rétractez-vous ! », Forum for the Future, https://blog.forumforthefuture.be/fr/article/achat-compulsif-signature-impulsive-retractez-vous-/19399 (consultée le 16/10/2026) : départ du délai le lendemain de la réception ou de la signature, exceptions (biens personnalisés, périssables, contenus numériques, loisirs datés).
- « Banque-Carrefour des Entreprises (BCE) », portail e-Justice, https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/be_fr (consultée le 16/10/2026) : vérification publique de l'identité de l'émetteur et du destinataire.
- « Qu'est-ce que la TVA et quels sont les taux de TVA applicables ? », KBC Brussels, https://www.kbcbrussels.be/entreprendre/fr/articles/administration/impots-et-tva/formalites-administratives-remplir-tva.html (consultée le 16/10/2026) : taux de 21 %, 12 %, 6 % et 0 %. Source privée, pas officielle : à confirmer auprès du SPF Finances.
- Note : les pages du SPF Économie et du SPF Finances n'ont pas pu être ouvertes le 16/10/2026 (page de vérification antirobot).

## Exemple

Cas nominal : une entreprise de transport demande une offre pour un service annuel. Le projet ouvre sur son problème (trois pannes d'organisation en six mois, citées par le client), décrit le périmètre (deux sites, 12 mois), exclut explicitement les déplacements hors Belgique, affiche 4 800 euros hors TVA, TVA 21 % à confirmer, 5 808 euros TTC, valide jusqu'au 15/11/2026, avec les conditions générales annexées. La table des faits renvoie chaque montant à `connaissance://tarifs-2026`.

Cas d'échec : un particulier demande une offre par courriel pour un service conclu à distance, mais la grille de prix du client ne contient pas le tarif demandé et ne dit rien d'un droit de rétractation. L'agent ne devine ni le prix ni la position du client : il écrit « prix : information manquante, question au responsable », insère le bloc de rétractation en « à valider », et classe le projet « non envoyable en l'état ».
