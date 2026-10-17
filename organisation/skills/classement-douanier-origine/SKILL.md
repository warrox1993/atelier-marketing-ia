---
name: "classement-douanier-origine"
description: "Prépare, pour une PME belge qui exporte ou importe, la proposition de classement douanier (code SH, NC, TARIC), l'analyse de l'origine préférentielle au titre des accords de l'UE, le statut d'exportateur enregistré (REX) et le premier examen des sanctions et des biens à double usage (règlement (UE) 2021/821), avec signal d'arrêt et escalade. À utiliser pour proposer un code ou une origine à faire confirmer, ou repérer un risque de conformité ; jamais pour certifier un code, une origine ou un statut, déposer une déclaration, ni conclure qu'une opération est autorisée : toute alerte suspend le dossier et passe à un humain."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "commerce-exterieur"
---

# Classement douanier, origine et conformité export

## Quand l'utiliser

- Une marchandise doit être décrite par un code pour une déclaration, un devis ou le calcul d'un droit de douane.
- L'importateur étranger demande une preuve d'origine pour profiter d'un tarif réduit dans un accord de l'UE.
- La PME se demande si elle peut ou doit devenir exportateur enregistré.
- Un produit technique, un client ou un pays soulève une question de sanctions ou de double usage.

## Objectif

Une proposition motivée, jamais une certification : un code avec les raisonnements écartés, une analyse d'origine avec les pièces manquantes, un état des contrôles de conformité, et, dès qu'un signal d'arrêt apparaît, l'arrêt écrit et l'escalade vers l'humain.

## Prérequis

- Une description technique réelle du produit : matière, composition, fonction, procédé de fabrication, fiche technique du fabricant.
- La provenance des matières et composants (pays, valeur) pour l'origine.
- Le pays de destination, le client final et l'usage prévu pour la conformité.

## Entrées

- `produit` : désignation, composition, fonction, photos ou fiche technique.
- `composants` : liste des matières et pièces avec pays d'origine et valeur, si connus.
- `destination` : pays, client, usage final déclaré.
- `statut_rex` : numéro d'exportateur enregistré s'il existe.

## Étapes

1. **Rassembler la description** et signaler tout manque (« composition inconnue », « fonction non précisée »). Sans description technique, ne pas proposer de code : écrire « information manquante » et la question précise.
2. **Proposer le classement** en suivant l'ordre de la nomenclature : la base internationale de six chiffres (Système harmonisé, SH), le code de huit chiffres de la Nomenclature combinée (NC) et, pour les mesures, le code de dix chiffres du TARIC, base de données de l'UE qui regroupe droits, préférences, suspensions, contingents, mesures de défense commerciale, interdictions et restrictions. Appliquer les règles générales interprétatives dans l'ordre, sans raccourci, et **écrire laquelle tranche** :
   - lire les notes de section et de chapitre, qui priment sur le libellé des positions ;
   - règle 1 : lire les libellés des positions à la lettre ; si une seule position couvre le produit, le classement est décidé ;
   - si plusieurs positions restent possibles, appliquer la règle 2 puis la règle 3 dans l'ordre ; pour un produit composite, chercher le caractère essentiel (fonction, valeur, volume ou facteur le plus pertinent pour ce produit) et dire lequel ;
   - valider la sous-position (règle 6, notes de sous-positions), puis vérifier que le code à huit ou dix chiffres prolonge bien la position à six chiffres retenue.
   Chercher des renseignements tarifaires contraignants déjà délivrés pour des produits identiques ou proches dans la base publique EBTI : ils éclairent sans lier un autre titulaire. Quand deux positions restent défendables, présenter **les deux**, argumentées, sans en affirmer une comme certaine. Écrire pour chaque proposition : le code, la règle qui tranche, les chapitres et positions écartés avec la raison, la description que l'on a utilisée, le degré de certitude (« forte », « moyenne », « faible »).
3. **Signaler les cas à sécuriser** : produit à usage multiple, ensemble, article composite, pièce détachée, produit nouveau. Pour un classement incertain, un risque de redressement ou une valeur élevée, suggérer une demande de renseignement tarifaire contraignant (décision de classement délivrée par l'administration des douanes, valable en principe trois ans dans toute l'UE et opposable à toutes les administrations douanières de l'UE et au titulaire) plutôt qu'un classement de bonne foi ; la décision de la demander est humaine et la démarche est à confirmer par le déclarant.
4. **Analyser l'origine** : distinguer l'origine non préférentielle (nationalité économique de la marchandise, pour la politique commerciale) et l'origine préférentielle (droit à un tarif réduit ou nul au titre d'un accord). Pour la préférentielle : le produit est soit entièrement obtenu dans la zone, soit a subi une ouvraison ou transformation suffisante selon la règle propre à son code dans l'accord ; examiner le cumul éventuel, les tolérances et la règle de non-modification pendant le transport. Lister l'accord applicable à la destination, la règle du produit et les pièces à fournir.
5. **Examiner la preuve d'origine** : selon l'accord, certificat ou déclaration d'origine ; pour les accords récents, la déclaration est établie par un exportateur enregistré au système REX. Si la PME n'a pas de statut REX et que l'accord l'exige au-delà d'un seuil, noter « enregistrement à envisager » et renvoyer à l'autorité douanière ; les seuils de valeur ne sont pas fixés ici, ils sont lus dans l'accord et à confirmer.
6. **Faire l'examen de conformité**, dans cet ordre, et s'arrêter au premier signal :
   - **Sanctions** : pays, entité, personne ou secteur visés par des mesures restrictives de l'UE ; destinataire ou intermédiaire inhabituel.
   - **Double usage** : le produit figure-t-il dans la liste de contrôle du règlement (UE) 2021/821 ? Pour un produit non listé, l'usage final signalé ou connu (militaire, armes de destruction massive, répression) peut quand même exiger une autorisation.
   - **Signaux d'alerte** : client qui refuse de dire l'usage, commande sans rapport avec son activité, itinéraire illogique, paiement par un tiers, pression pour éviter les formalités.
7. **Conclure** par un statut : « proposition prête, à confirmer », « informations manquantes » ou « ARRÊT » avec le motif, puis l'escalade (voir ci-dessous).

### Signal d'arrêt et escalade

Il y a arrêt, sans exception, dès qu'un de ces cas se présente :

- le pays, le client, un intermédiaire ou la banque est visé par une mesure restrictive de l'UE, ou un doute sérieux subsiste ;
- le produit figure dans la liste de contrôle des biens à double usage, ou son usage final soulève une inquiétude ;
- le client refuse ou esquive les questions sur l'usage final ou la destination réelle ;
- une licence ou autorisation est requise et n'est pas en main.

Conduite à tenir : ne pas poursuivre le dossier ; ne proposer aucune solution alternative (autre destinataire, autre pays, fractionnement de la commande, reformulation de la description) ; écrire le motif exact, ce qui est connu et ce qui ne l'est pas ; transmettre au coordinateur pour décision humaine et avis d'un avocat en droit du commerce international ou du déclarant, et, si nécessaire, de l'autorité compétente. La PME ne prévient pas son client avant cet avis.

## Livrable

1. Une fiche de classement : description utilisée, code proposé (SH, NC, TARIC), règle interprétative qui tranche, raisonnement, codes écartés, degré de certitude, mention « à confirmer par l'humain ou un transitaire ».
2. Une fiche d'origine : type (préférentielle ou non), accord, règle du produit, composants non originaires, état de la preuve, statut REX.
3. Un état de conformité : sanctions, double usage, signaux d'alerte, avec le résultat « rien relevé à ce stade, non vérifié dans les registres officiels » ou « ARRÊT ».
4. La liste des informations manquantes et des questions à poser.

## Critères de réussite

- Aucun code ni origine n'est affirmé sans description technique et sans mention de certitude.
- Le raisonnement montre les positions écartées et la règle interprétative qui tranche, pas seulement le code retenu.
- Un classement ambigu présente au moins deux positions argumentées et suggère un renseignement tarifaire contraignant.
- La distinction entre origine préférentielle et non préférentielle est respectée.
- Tout signal d'arrêt a stoppé le dossier, sans solution de contournement, avec escalade.
- Le résultat « rien relevé » n'est jamais présenté comme une autorisation.

## Sources officielles

Consultées en ligne le 16/10/2026 :

- « TARIC », Commission européenne, https://taxation-customs.ec.europa.eu/customs-4/calculation-customs-duties/customs-tariff/eu-customs-tariff-taric_en : base de données multilingue qui regroupe les mesures du tarif douanier commun et de la législation commerciale et agricole (droits, préférences, suspensions, contingents, défense commerciale, interdictions et restrictions). La page ne détaille pas la structure hiérarchique des codes et ne parle pas des décisions écrites : ces points restent à confirmer.
- « Rules of origin for goods », Commission européenne, https://taxation-customs.ec.europa.eu/customs/rules-origin-goods_en : origine non préférentielle et préférentielle, arrangements unilatéraux (par exemple le système de préférences généralisées) et réciproques (accords de libre-échange) ; l'origine, avec le classement et la valeur, détermine le traitement tarifaire.
- « Preferential rules of origin », Commission européenne, https://taxation-customs.ec.europa.eu/customs/rules-origin-goods/preferential-rules-origin_en : produits entièrement obtenus ou ayant subi une ouvraison suffisante, cumul, tolérance générale, règle de non-modification, outils d'auto-évaluation.
- « EU Binding Tariff Information (BTI) », Commission européenne, https://taxation-customs.ec.europa.eu/customs/common-customs-tariff-cct/tariff-classification-goods/eu-binding-tariff-information-bti_en, consultée le 17/10/2026 : décision juridique de classement délivrée par l'administration douanière d'un pays de l'UE, valable en général trois ans dans toute l'UE, liant toutes les administrations douanières de l'UE et le titulaire, sans effet rétroactif ; décisions publiées dans la base EBTI, informations confidentielles protégées.
- « Access2Markets », Commission européenne, https://trade.ec.europa.eu/access-to-markets/fr/home : portail pour exportateurs de l'UE (droits de douane, règles d'origine, procédures, exigences produit).

Non lu ce jour : le texte du règlement (UE) 2021/821 sur EUR-Lex (https://eur-lex.europa.eu) n'a pas pu être ouvert, le site ayant renvoyé une page vide à la lecture automatique. Les mentions du règlement dans cette compétence (liste de contrôle, rôle de l'usage final) restent donc sans citation d'article et sont à vérifier sur le texte officiel avant toute décision. Les pages de la Commission sur le système REX n'ont pas pu être ouvertes à l'adresse essayée (erreur 404) : le fonctionnement et les seuils du REX sont à confirmer auprès de l'administration des douanes et accises ou du transitaire. Les listes de sanctions n'ont pas été consultées.

## À vérifier par un professionnel

Le code douanier, l'origine, le statut REX, l'existence d'une licence et toute conclusion sur les sanctions ou le double usage relèvent d'un déclarant en douane ou d'un transitaire, et pour les sanctions et le double usage, d'un avocat en droit du commerce international, avant tout engagement, expédition ou communication au client.

## Limites

- La compétence propose ; seul un humain qualifié confirme un code, une origine ou une conformité.
- Elle n'interroge pas les registres officiels de sanctions ni la base TARIC en direct : le « rien relevé » signifie « non vérifié ».
- Les règles d'origine propres à chaque accord et à chaque produit sont longues et changent : la compétence renvoie à l'accord applicable et ne les recopie pas de mémoire.
- Pas de conseil sur le contournement d'une mesure, même théorique.

## Exemple

Produit : un lot de coffrets en aluminium usinés avec serrure en laiton, fiche technique fournie, destination Corée du Sud.

Classement : proposition d'un code de huit chiffres NC dans le chapitre des ouvrages en aluminium, certitude « moyenne » car la serrure peut faire basculer vers la position des articles de serrurerie ; positions écartées : ouvrages en laiton (la matière principale est l'aluminium), contenants pour le transport (fonction de rangement durable). Mention « à confirmer par le transitaire ; décision écrite des autorités à envisager si la valeur annuelle est élevée ».

Origine : aluminium acheté hors UE (45 % de la valeur), usinage et assemblage en Belgique. Accord applicable à vérifier ; règle du produit non lue dans l'accord ce jour : « information manquante : règle du produit dans l'accord, à lire ». Statut REX : non renseigné.

Conformité : rien relevé à ce stade, non vérifié dans les registres officiels.

Cas d'échec : l'acheteur commande des pièces usinées de précision et refuse de dire à quoi elles serviront, en demandant une livraison par un pays voisin de la destination annoncée. Statut : « ARRÊT : usage final inconnu, itinéraire illogique, risque de double usage ou de sanctions ». La compétence ne cherche pas de code « plus neutre » ni de découpage de la commande, n'informe pas le client, et transmet au coordinateur pour décision humaine et avis juridique.

Cas ambigu (version 1.1.0) : support métallique intégrant une carte électronique de commande. Deux positions candidates présentées : ouvrages en métal et appareils électriques ; la règle 1 ne tranche pas, la règle 3 b) est appliquée avec le caractère essentiel cherché dans la fonction (la commande électronique détermine l'usage), certitude « faible ». Aucune des deux n'est affirmée ; question au déclarant et suggestion d'un renseignement tarifaire contraignant posée en carte.

## Origine de la méthode

Version 1.1.0 : ordre d'application des règles générales interprétatives, règle qui tranche écrite, recherche de décisions de classement existantes, adapté et traduit de github.com/affaan-m/ECC, `skills/customs-trade-compliance/SKILL.md`, « Classification Decision Logic », commit ef648e01899ba3e8dc6371642deaaf64b4477775, compétence sous licence Apache 2.0 (en-tête `license: Apache-2.0`, auteur « evos »). Modifications : réécriture en français, sources de l'UE (EBTI) à la place des bases américaines, décision humaine. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
