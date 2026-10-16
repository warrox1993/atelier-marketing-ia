---
name: "organisation-transport"
description: "Prépare l'organisation d'un transport de marchandises pour une PME belge : choix du mode (route, rail, mer, air, messagerie, palette, camion complet), demande et comparaison de cotations, répartition des tâches selon l'Incoterm côté logistique, lettre de voiture CMR et convention CMR pour la route internationale, suivi, réserves à la livraison et litiges. À utiliser pour préparer une demande de cotation, comparer des offres de transporteurs ou instruire un litige de transport ; jamais pour réserver, commander, accepter une offre ni signer une lettre de voiture : tout engagement auprès d'un transporteur est humain."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "logistique"
---

# Organisation du transport

## Quand l'utiliser

- Une expédition (client, filiale, retour fournisseur) doit être organisée et il faut choisir le mode et demander des prix.
- Plusieurs cotations de transporteurs sont arrivées et il faut les comparer à périmètre égal.
- Un contrat de vente cite un Incoterm et il faut savoir ce que la logistique doit organiser et payer.
- Une livraison est arrivée abîmée, incomplète ou en retard et il faut protéger les droits de l'entreprise.

## Objectif

Une demande de cotation précise (mêmes données pour tous les transporteurs), un tableau comparatif à périmètre égal avec le coût total, le délai et les risques, un dossier de transport complet (lettre de voiture préparée, documents, suivi) et, en cas de litige, des réserves et une réclamation écrites dans les délais. Aucun engagement n'est pris : le choix du transporteur et la réservation sont humains.

## Prérequis

- La description de la marchandise : nature, nombre de colis ou palettes, dimensions, poids brut, valeur, caractère dangereux ou fragile, conditions de température.
- Les lieux et horaires de chargement et de livraison, les contacts sur place (noms professionnels seulement).
- L'Incoterm et le prix convenu avec le client, ou le contrat d'achat, fournis par les services commercial ou achats.
- Pour une expédition hors UE : le besoin de formalités transmis au service commerce extérieur via le bureau de liaison.

## Entrées

- `marchandise` : description, colisage, poids brut, valeur déclarable.
- `trajet` : adresse de chargement, adresse de livraison, dates souhaitées.
- `incoterm` : règle convenue et lieu nommé (par exemple FCA, DAP), tel qu'écrit au contrat.
- `cotations` : offres reçues, avec date de validité, périmètre et conditions.
- `incident` : en cas de litige, constat à la livraison, photos, lettre de voiture annotée.

## Étapes

1. **Qualifier le besoin** : urgence, valeur, fragilité, volume. Une marchandise dangereuse ou à température dirigée sort du cadre standard : la signaler et demander l'avis d'un conseiller à la sécurité ou d'un transporteur spécialisé.
2. **Choisir le mode par un critère écrit** : route pour l'Europe continentale et les petits et moyens lots ; messagerie ou palette pour les lots partiels, camion complet pour un lot entier ; rail ou mer pour les gros volumes peu pressés ; air pour l'urgent ou à forte valeur. Donner le coût total comparé, pas seulement le prix du transport (emballage, assurance, manutention, frais d'attente).
3. **Répartir les tâches selon l'Incoterm** : relire le contrat. Les règles Incoterms 2020 de la Chambre de commerce internationale (onze règles) précisent qui organise le transport, qui assure, qui dédouane et où le risque passe. Pour chaque expédition, écrire un tableau à deux colonnes (vendeur, acheteur) avec : transport principal, assurance, dédouanement export, dédouanement import, point de transfert des risques. Si le contrat ne cite pas l'Incoterm ou cite un terme inexact (un terme maritime pour un transport routier), le signaler comme risque à faire corriger. Le texte intégral des règles est payant : ne pas le recopier ni inventer une clause.
4. **Rédiger la demande de cotation**, identique pour tous : marchandise, trajet, dates, Incoterm, assurances demandées, documents attendus, validité de l'offre, conditions de paiement, limite de responsabilité proposée. Ne jamais communiquer à un transporteur le prix d'un autre.
5. **Comparer les cotations à périmètre égal** : prix total, délai garanti, suppléments (carburant, péages, attente, hayon), responsabilité (limite par kilo, assurance de la marchandise), traçabilité, conditions de paiement. Une offre qui ne couvre pas le même périmètre est signalée, pas comparée telle quelle.
6. **Préparer le dossier de transport** : pour la route internationale, brouillon de lettre de voiture CMR. La convention CMR s'applique à tout contrat de transport routier de marchandises, à titre onéreux, dont le lieu de prise en charge et le lieu de livraison sont dans deux pays différents dont l'un au moins est partie à la convention. La lettre de voiture est établie en trois exemplaires originaux signés par l'expéditeur et le transporteur : le premier pour l'expéditeur, le deuxième accompagne la marchandise, le troisième reste au transporteur. Son absence n'ôte pas au contrat sa validité, mais rend la preuve difficile. Vérifier que les mentions (parties, lieux, marchandise, poids, instructions) sont complètes et cohérentes avec la facture.
7. **Faire valider** : transmettre au responsable humain la carte avec le transporteur recommandé, le coût total, les risques et la date limite de validité de l'offre. La réservation, l'acceptation et la signature restent humaines.
8. **Suivre l'expédition** : points de contrôle (enlèvement, passage de frontière, livraison), alerte en cas d'écart, information du client par le service commercial. Un retard est daté et documenté dès qu'il apparaît.
9. **À la livraison, protéger les droits** (CMR) : le destinataire contrôle et note ses réserves sur le document de livraison. Pour une perte ou un dommage apparent, les réserves sont faites au plus tard à la livraison ; pour un dommage non apparent, par écrit dans les sept jours de la livraison, dimanches et jours fériés exclus ; pour un retard, une réserve écrite dans les vingt et un jours de la mise à disposition. Le jour de la livraison n'est pas compté.
10. **Instruire la réclamation** : écrit au transporteur avec les pièces (lettre de voiture annotée, photos, facture, preuve de valeur), calcul du préjudice. Le transporteur répond de la perte, du dommage ou du retard entre la prise en charge et la livraison, sauf faute de l'ayant droit, vice propre de la marchandise ou circonstances inévitables. L'indemnité pour perte ou avarie est calculée sur la valeur de la marchandise au lieu et au moment de la prise en charge et plafonnée à 8,33 droits de tirage spéciaux par kilo de poids brut manquant, sauf valeur ou intérêt spécial déclaré ; pour un retard, le dommage prouvé est indemnisé dans la limite du prix du transport. Les frais de transport et droits sont remboursés en proportion. Une marchandise non livrée trente jours après le délai convenu (soixante jours à défaut de délai convenu) peut être considérée comme perdue.
11. **Surveiller la prescription** : un an à compter de la livraison pour la perte partielle, l'avarie et le retard ; trois ans en cas de dol ou de faute équivalente ; une réclamation écrite suspend le délai jusqu'au refus écrit du transporteur. Noter la date limite dans le dossier et prévenir le service juridique par la liaison avant son terme.

## Livrable

Une demande de cotation prête à envoyer (brouillon), un tableau comparatif à périmètre égal avec recommandation argumentée, le tableau des responsabilités selon l'Incoterm, le brouillon de lettre de voiture avec la liste des mentions à contrôler, un tableau de suivi daté, et, en cas de litige, le dossier de réclamation (chronologie, pièces, calcul, délais). La table des faits indique la source de chaque donnée.

## Critères de réussite

- Toutes les cotations reposent sur la même demande et le même périmètre.
- Le coût total, pas seulement le prix de transport, est comparé.
- Le tableau Incoterm correspond au contrat réel ; toute incohérence est signalée.
- Les délais de réserve et de prescription sont calculés avec leur date limite et leur source.
- Aucune réservation, acceptation, signature ou paiement n'a été faite ; le choix passe par une carte humaine.

## Sources officielles

Textes ouverts en ligne le 16/10/2026 :

- Convention relative au contrat de transport international de marchandises par route (CMR), Genève, 19 mai 1956, modifiée par le protocole du 5 juillet 1978 (Nations unies), texte consulté dans une copie de lexmercatoria.org (https://www.pdports.co.uk/wp-content/uploads/2024/06/cmr-conditions-1978.pdf) : articles 1 (champ d'application), 4 et 5 (lettre de voiture), 12 (droit de disposer), 17 (responsabilité), 19 et 20 (retard, perte présumée), 23 (calcul de l'indemnité, 8,33 droits de tirage spéciaux par kilo), 30 (réserves), 32 (prescription). Copie hébergée par un tiers : à confronter au texte publié par la Commission économique pour l'Europe des Nations unies (page officielle inaccessible lors de la consultation, erreur 403).
- Incoterms 2020, Chambre de commerce internationale, https://iccwbo.org/business-solutions/incoterms-rules/ : onze règles, dernière version en vigueur depuis le 1er janvier 2020. Le détail de chaque règle n'a pas été lu en ligne (texte payant) : le contenu des règles cité ci-dessus relève de la pratique commerciale et doit être vérifié sur le texte de l'ICC.
- Source secondaire : « The CMR Convention », Law and More, https://lawandmore.eu/blog/cmr-convention-international-road-transport-guide/ : résumé cohérent avec le texte (réserves de sept et vingt et un jours, prescription d'un an).

## À vérifier par un professionnel

Toute réclamation chiffrée, toute clause d'assurance, la limite de responsabilité d'un contrat-cadre avec un transporteur et toute procédure judiciaire (compétence des tribunaux, article 31 de la convention) sont à faire valider par un avocat ou le service juridique avant envoi. Les conditions générales du transporteur et l'éventuelle assurance « marchandises transportées » de l'entreprise sont à lire par le courtier ou l'assureur. Le transport de marchandises dangereuses relève d'un conseiller à la sécurité habilité.

## Limites

- La compétence ne connaît pas les tarifs du jour : elle compare des cotations reçues, elle n'en invente pas.
- Les autres modes (mer, air, rail) suivent d'autres conventions ; seule la route internationale est détaillée ici.
- Un transport entièrement belge relève du droit interne, non couvert par la convention CMR : à faire confirmer.
- Les règles Incoterms exactes ne sont pas reproduites ; seul l'écart avec le contrat est signalé.
- Elle ne dédouane pas : voir le service commerce extérieur et la déclaration, qui reste humaine.

## Exemple

Expédition de 6 palettes (3 200 kg bruts, valeur 18 000 euros) de Belgique vers une société en Allemagne, Incoterm DAP au contrat. Trois cotations reçues : A 1 040 euros, 2 jours, hayon inclus ; B 960 euros, 3 jours, hayon en supplément de 45 euros ; C 890 euros, 2 jours, responsabilité limitée à 2 euros par kilo (6 400 euros au plus), alors que le plafond de l'article 23 de la convention est de 8,33 DTS par kilo, soit 26 656 DTS pour 3 200 kg (à convertir au cours du jour). La validité d'une limite contractuelle inférieure à la convention est à faire vérifier par le service juridique. Tableau Incoterm : DAP, le vendeur organise et paie le transport jusqu'au lieu nommé et supporte le risque jusque-là ; le déchargement et le dédouanement import restent à l'acheteur (à vérifier sur le texte ICC). Recommandation : A ou B selon le hayon ; C écartée sur la responsabilité sauf décision humaine contraire.

Cas d'échec : le client signale 2 palettes écrasées trois semaines après la livraison, sans aucune réserve sur le bon de livraison (le dommage était visible à l'ouverture du camion). La compétence ne promet pas d'indemnité : elle constate que les réserves ont dépassé le délai de sept jours (article 30), que la réception vaut présomption de livraison conforme, mais que cette présomption peut être renversée par la preuve contraire. Elle prépare quand même la réclamation écrite, la date limite de prescription (un an après la livraison) et transmet le dossier au service juridique.
