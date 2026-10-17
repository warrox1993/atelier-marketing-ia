---
name: "proposition-commerciale"
description: "Rédige le projet de proposition commerciale d'une entreprise belge, centré sur le problème du client : contexte compris, solution, périmètre et exclusions, prix hors et avec TVA, conditions, validité, mentions obligatoires B2B ou B2C (information précontractuelle, droit de rétractation du consommateur à distance), plan d'action commun jusqu'à la signature, prochaines étapes. À utiliser pour une offre, un devis argumenté ou la réponse à une demande de prix ; jamais pour l'envoyer, la signer, fixer un prix de mémoire ou valider juridiquement les conditions."
metadata:
  version: "1.1.0"
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
   - Consommateur (B2C) : information précontractuelle claire et compréhensible avant l'engagement (identité et coordonnées du professionnel, caractéristiques essentielles, prix TTC avec tous les frais, durée et conditions de résiliation, existence ou non d'un droit de rétractation). Pour un contrat conclu à distance : droit de rétractation de 14 jours sans motivation (CDE art. VI.47 § 1er), délai qui court à compter du jour de la conclusion du contrat de service ou de la prise de possession physique du bien (art. VI.47 § 2), avec formulaire type de rétractation (annexe 2 du livre VI) ; si l'information sur ce droit n'est pas donnée, le délai est prolongé de douze mois (art. VI.48) ; exceptions limitativement énumérées (art. VI.53 : service pleinement exécuté avec accord exprès, biens personnalisés, périssables, etc.) à vérifier cas par cas. Contrat hors établissement et services financiers à distance (dont l'assurance) : régimes propres, à vérifier. Si le consommateur supporte les frais de retour, le dire avant la conclusion.
7. Ajouter le plan d'action commun jusqu'à la signature, construit à rebours depuis la date de signature visée : validations restantes, relecture juridique, accord des achats ou de la direction du client, approbations internes de l'entreprise, signatures. Chaque ligne : étape, responsable (nous, le client, personne nommée), date cible, état. Signaler toute étape dont la date rend la date de signature impossible.
8. Ajouter les prochaines étapes immédiates, puis la liste des points à valider par le responsable avant envoi : chiffres, conditions, mentions, texte juridique.
9. Si le secteur est réglementé, ajouter les documents d'information obligatoires, joints par le responsable et non résumés ici, et ne formuler aucune recommandation personnalisée.

## Livrable

Un projet de proposition en français, prêt à relire : contexte, solution, périmètre et exclusions, prix et TVA, conditions, validité, mentions selon B2B ou B2C, plan d'action commun, prochaines étapes. Avec : la table des faits sourcés et la liste des points à valider avant envoi.

## Critères de réussite

- Chaque chiffre est dans la table des faits avec sa source ; aucun prix, remise, garantie ou délai inventé.
- Le projet commence par le problème du client, pas par le catalogue.
- Le périmètre, les exclusions et la date de validité sont explicites.
- Les mentions correspondent au statut du destinataire et au canal ; pour un consommateur à distance, le droit de rétractation est traité.
- Les points juridiques sont marqués « à valider », jamais présentés comme acquis.
- Le plan d'action commun a un responsable et une date par étape, et les dates impossibles sont signalées.

## Limites

- Le projet ne vaut pas avis juridique ni fiscal. À faire vérifier avant envoi : les conditions générales et les mentions par un juriste ou un avocat en droit économique, le taux de TVA et les mentions de facture par un comptable ou un expert-comptable.
- Dans un secteur réglementé (assurance, crédit, placements, professions réglementées), la recommandation personnalisée et les documents obligatoires relèvent d'un professionnel habilité.
- L'agent n'envoie, ne signe et ne publie rien.

## Sources officielles

Consultées le 17/10/2026 :

- Code de droit économique, texte consolidé sur Justel, https://www.ejustice.just.fgov.be/eli/loi/2013/02/28/2013A11134/justel :
  art. VI.2 (information précontractuelle hors distance), VI.45 (information précontractuelle à distance), VI.47
  (rétractation de 14 jours et point de départ), VI.48 (prolongation de douze mois sans information), VI.53 (exceptions),
  annexe 2 du livre VI (formulaire type de rétractation), VI.91/5 (clauses présumées abusives entre entreprises).
- « Banque-Carrefour des Entreprises (BCE) », portail e-Justice, https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/be_fr :
  vérification publique de l'identité de l'émetteur et du destinataire.
- Taux de TVA : la page du SPF Finances (https://finances.belgium.be/fr/entreprises/tva/taux-tva) n'a pas pu être lue
  le 16/10 ni le 17/10/2026 (page de vérification antirobot, non contournée). Aucun taux n'est donc tiré d'une source
  privée : le taux applicable est toujours écrit « à confirmer par le comptable ».

## À vérifier par un professionnel

- Le taux de TVA applicable à chaque prestation (21 %, 12 %, 6 % ou 0 % selon le Code de la TVA et ses arrêtés), par
  le comptable ou l'expert-comptable.
- Les conditions générales et les mentions, par un juriste en droit économique.
- Le régime de rétractation des contrats hors établissement et des services financiers à distance, dont l'assurance.

## Exemple

Cas nominal : une entreprise de transport demande une offre pour un service annuel. Le projet ouvre sur son problème (trois pannes d'organisation en six mois, citées par le client), décrit le périmètre (deux sites, 12 mois), exclut explicitement les déplacements hors Belgique, affiche 4 800 euros hors TVA, TVA 21 % à confirmer, 5 808 euros TTC, valide jusqu'au 15/11/2026, avec les conditions générales annexées. La table des faits renvoie chaque montant à `connaissance://tarifs-2026`.

Cas d'échec : un particulier demande une offre par courriel pour un service conclu à distance, mais la grille de prix du client ne contient pas le tarif demandé et ne dit rien d'un droit de rétractation. L'agent ne devine ni le prix ni la position du client : il écrit « prix : information manquante, question au responsable », insère le bloc de rétractation en « à valider », et classe le projet « non envoyable en l'état ».

## Origine de la méthode

Plan d'action commun adapté et traduit de github.com/anthropics/knowledge-work-plugins, `sales/skills/close-plan/SKILL.md`,
étape 4 (à rebours de la date de signature, responsable, date, état, dates impossibles signalées), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : réécriture en français, cadre belge.
Texte de la licence et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
