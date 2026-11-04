---
name: "lecture-etiquette-allergenes"
description: "Lit l'étiquette et la fiche d'un complément alimentaire pour établir le risque allergène et de contamination croisée : allergènes déclarés, mention « peut contenir des traces », site et lignes de fabrication, supports et enrobages, preuve écrite du fabricant et analyse ELISA ou PCR du lot. À utiliser dès qu'un utilisateur exclut un allergène (fruits à coque, arachide, lait, soja, poisson, œuf) et avant de classer un produit ; jamais pour conclure à l'absence d'allergène sur la seule foi d'une étiquette silencieuse ni pour donner un avis médical."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "complements"
---

# Lecture de l'étiquette et des allergènes

## Quand l'utiliser

- L'utilisateur écarte un ou plusieurs allergènes et il faut dire si un produit peut être retenu.
- Une marque affiche « sans fruits à coque » ou ne dit rien et il faut savoir ce que cela prouve.
- Le contrôleur revérifie les éliminatoires d'un classement qui touche aux allergènes.

## Objectif

Pour chaque produit, un verdict d'allergène en trois états : exclu par écrit (preuve citée), non exclu (donc éliminatoire pour l'allergène en cause), ou contradictoire. Chaque verdict recopie la phrase exacte de la source avec son adresse et sa date de lecture.

## Prérequis

- La liste des allergènes à exclure, donnée par l'utilisateur. À défaut, la demander ; ne jamais supposer.
- L'étiquette complète (liste d'ingrédients, mentions d'allergènes) et la page du fabricant, lues à la source.
- Pour la preuve la plus forte : un échange écrit avec le fabricant (préparé en brouillon, envoyé par l'utilisateur) et un certificat d'analyse de lot.

## Entrées

- `allergenes` : allergènes à exclure.
- `produit` : marque, nom exact, lot s'il est connu.
- `sources` : étiquette, fiche, certificats, réponses du fabricant.

## Étapes

1. **Lire la liste des ingrédients et les mentions.** Les 14 allergènes à déclarer sont à l'annexe II du règlement (UE) 1169/2011 (texte à relire à la source), dont arachides et fruits à coque. Relever les allergènes déclarés dans la composition (ils sont en évidence dans la liste), dans les enveloppes de gélule, les huiles de support, les arômes « naturels », les enrobages.
2. **Interpréter « peut contenir des traces de... ».** Ces mentions ne sont pas harmonisées dans l'Union (acte d'exécution prévu à l'article 36 du règlement 1169/2011). Leur présence est un signal de risque ; leur absence ne prouve rien.
3. **Chercher le site et les lignes.** La page du fabricant, la fiche de l'usine ou le sous-traitant indiquent-ils que l'usine traite des fruits à coque, des arachides ou d'autres allergènes ? Une usine polyvalente qui traite l'allergène exclu = exclusion, sauf lignes dédiées avec plan HACCP allergènes montré par écrit.
4. **Repérer les matières à risque caché.** Huile végétale de support, arômes, MCT (huile de coco, fruit à coque pour la FDA américaine mais absent de l'annexe UE : à signaler comme incertain), enrobages, poudres aromatisées aux noix, lignes partagées avec des beurres de cacahuète pour les protéines en poudre.
5. **Exiger la preuve écrite.** Pour retenir un produit : (a) une déclaration écrite du fabricant que le site est exempt de l'allergène ou que les lignes sont dédiées, avec la description du plan HACCP allergènes ; (b) les résultats d'analyse ELISA ou PCR du lot sur l'allergène, avec la limite de détection. Une réponse de service client qui dit « normalement non » n'est pas une preuve.
6. **Décider.** Allergène non exclu par écrit = éliminatoire pour cet utilisateur, quelle que soit la note du produit. Le contrôleur ne rouvre ce verdict que si une nouvelle pièce écrite est produite.
7. **Recopier.** Pour chaque produit : la phrase exacte (en langue d'origine, entre guillemets), l'adresse de la page, la date de lecture, le nom et la date du document de preuve, la limite de détection de l'analyse.

## Livrable

Un tableau par produit : allergènes déclarés, mention de traces (texte exact), site et lignes (texte exact), matières à risque, preuve écrite et analyse de lot présentes ou absentes, verdict (exclu par écrit, non exclu, contradictoire), liste des questions à poser au fabricant.

## Critères de réussite

- Chaque verdict cite une phrase recopiée et sa source ; aucune paraphrase à la place d'une citation.
- Aucun produit n'est déclaré sans allergène sur une étiquette silencieuse.
- Les cas « non exclu » sont marqués éliminatoires, avec la raison.
- Les questions au fabricant sont précises et prêtes à envoyer par l'utilisateur.

## À vérifier par un professionnel

Une allergie avérée, grave ou à risque d'anaphylaxie relève d'un allergologue ou d'un médecin : aucun verdict de produit ne le remplace, et l'utilisateur garde la décision d'acheter.

## Limites

- Aucune analyse n'est faite ici : les résultats d'un laboratoire sont seulement lus et cités.
- Un certificat de lot ne garantit pas les lots suivants.
- La liste de l'annexe II du règlement 1169/2011 est citée sans relecture du texte officiel, qui doit être ouvert avant d'être reprise dans un document sortant.
- Le contenu d'une page de marque est une affirmation du vendeur, pas un fait vérifié.

## Exemple

Cas illustratif, chiffres d'exemple. Un collagène bovin affiche « sans arôme, sans additif » et ne mentionne aucune trace. La compétence trouve sur la page du fabricant : « fabriqué dans un site qui traite aussi des fruits à coque ». Verdict : non exclu, éliminatoire pour un utilisateur qui exclut les fruits à coque.

Cas d'échec évité : une marque répond par courriel « nos produits sont naturellement sans noix ». La réponse ne parle ni du site, ni des lignes, ni d'analyse de lot : verdict « non exclu », et trois questions précises sont préparées (site et lignes, plan HACCP, résultat ELISA ou PCR du lot).
