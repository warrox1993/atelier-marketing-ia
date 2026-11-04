---
name: "grille-criteres-complements"
description: "Applique la grille de critères de qualité d'un complément alimentaire vendu en Belgique ou dans l'Union européenne : forme chimique, dose et apports maximaux tolérables, excipients, contaminants, certifications, analyses de lots, réglementation belge, critères propres à 13 catégories, signaux d'alarme et sources fiables. À utiliser avant d'étudier un complément ou une catégorie, pour savoir quoi vérifier et dans quel ordre ; jamais pour donner un avis médical, juger une interaction avec un traitement ou recommander une dose à une personne."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "complements"
---

# Grille de critères pour un complément alimentaire

## Quand l'utiliser

- Un complément précis ou une catégorie entière (magnésium, oméga-3, collagène, probiotiques...) doit être étudié et il faut la liste des points à contrôler.
- Une étiquette ou une fiche produit est devant soi et il faut repérer ce qui est solide, ce qui est du marketing et ce qui manque.
- Le contrôleur veut connaître les éliminatoires et les signaux d'alarme avant de revérifier un dossier.

## Objectif

Disposer d'une liste de contrôles ordonnée, sourcée et réutilisable, où chaque affirmation porte son statut : prouvé (source lue et citée), source secondaire (synthèse fiable, texte officiel non relu) ou incertain (à vérifier avant usage).

## Prérequis

- La catégorie du complément et le pays d'achat (la Belgique ajoute des règles propres : voir étape 6).
- Les exigences de l'utilisateur sur les allergènes (par exemple « aucun fruit à coque ni arachide ») : à demander, jamais à deviner.
- Un accès aux sources de l'étape 8 ; un texte officiel qui ne s'ouvre pas est noté « non relu », pas cité de mémoire.

## Entrées

- `categorie` : le complément ou la famille étudiée.
- `pays` : pays d'achat (Belgique par défaut pour cette installation).
- `exigences` : allergènes à exclure, régime, budget, contraintes de l'utilisateur.
- `produits` : étiquettes, fiches produit ou certificats déjà collectés, s'il y en a.

## Étapes

1. **Forme chimique (A)** : la forme exacte est déclarée (sel, ester), pas seulement « magnésium ». Magnésium : éviter l'oxyde comme forme principale (absorption fractionnelle d'environ 4 %, PMID 11794633 ; citrate mieux absorbé, PMID 14596323). Vitamine D : D3 plutôt que D2 (PMID 22552031). Oméga-3 : triglycérides plutôt qu'esters éthyliques (PMID 20638827). Folate : acide folique ou 5-MTHF, tous deux acceptables. Chélates, liposomes, « méthylé obligatoire » : incertain tant qu'aucun essai humain indépendant n'est cité.
2. **Dose (B)** : la dose journalière atteint celle des essais qui fondent la promesse, reste sous l'apport maximal tolérable (UL) de l'EFSA en tenant compte de l'alimentation, et est déclarée en élément actif (mg de magnésium élémentaire, mg d'EPA+DHA). Repères UL adulte : vitamine D 100 µg/j, magnésium ajouté 250 mg/j, zinc 25 mg/j, folate ajouté 1000 µg/j, vitamine B6 12 mg/j, sélénium 255 µg/j, iode 600 µg/j, calcium 2500 mg/j, cuivre 5 mg/j. Fer : pas d'UL, niveau sûr 40 mg/j. À relire dans le tableau de synthèse de l'EFSA avant tout chiffre cité.
3. **Excipients (D)** : liste courte et complète. Dioxyde de titane E171 : interdit dans l'Union (règlement (UE) 2022/63), donc éliminatoire. Colorants, arômes artificiels, édulcorants intenses : critère de propreté de la formule, pas de danger démontré aux doses autorisées. Stéarate de magnésium et dioxyde de silicium : neutres. Sucres, maltodextrine, huiles de remplissage inutiles : signal de dilution.
4. **Contaminants (E)** : plomb 3,0 mg/kg, cadmium 1,0 mg/kg, mercure 0,10 mg/kg (compléments, règlements (UE) 2021/1317, 2021/1323 et 2023/915, source secondaire, texte à relire) ; oxyde d'éthylène pour les gommes et extraits végétaux importés ; pesticides ; dioxines et PCB des huiles de poisson ; oxydation des oméga-3 (indice de peroxyde au plus 5, p-anisidine au plus 20, TOTOX au plus 26, repères GOED) ; adultération pharmaceutique pour les catégories minceur, sexualité, musculation (PMID 30646238) ; microbiologie.
5. **Certifications (G) et analyses de lots (H)** : un label anti-dopage (Informed Sport, Informed Choice, NSF Certified for Sport, Kölner Liste) contrôle des substances interdites, pas les métaux lourds, pesticides ni allergènes. IFOS vaut pour les oméga-3. « Fabriqué en usine GMP » est un minimum, « bio » ne dit rien de la pureté. Il faut en plus un certificat d'analyse par numéro de lot, d'un laboratoire tiers accrédité ISO 17025, avec teneur en actif, métaux lourds, microbiologie et les contrôles propres à la catégorie. Pour les oméga-3 et les probiotiques, la teneur est garantie à la date de péremption. La variabilité réelle justifie l'exigence (mélatonine de moins 83 % à plus 478 % de l'étiquette, PMID 27855744).
6. **Réglementation (I)** : directive 2002/46/CE ; en Belgique, notification obligatoire au SPF Santé publique avant mise sur le marché, numéro consultable dans FOODSUPP, absence de numéro = éliminatoire pour un achat en Belgique ; nouvel aliment non autorisé (règlement (UE) 2015/2283) = éliminatoire ; allégations limitées à la liste de l'Union (règlements (CE) 1924/2006 et (UE) 432/2012), une allégation thérapeutique (« soigne », « anti-arthrose ») est illégale et signale un mauvais produit ; vente depuis un pays hors Union : exclue par défaut. Mélatonine : en Belgique, 300 µg/j ou plus (200 µg pour les formes buccales) relève du médicament.
7. **Critères par catégorie (section 2 de la grille)** : vitamine D/K2, magnésium, oméga-3, zinc, fer, vitamines B, collagène, créatine, protéines, probiotiques, curcuma, ashwagandha, mélatonine. Exemples : K2 MK-7 avec mention d'interaction avec les anticoagulants dès 50 µg ; probiotique identifié au niveau de la souche avec UFC à la date de péremption ; curcuma et ashwagandha avec avertissement hépatique (PMID 36252717, PMID 42367407) ; collagène avec type, origine et dose d'étude déclarés (PMID 18416885, PMID 26822714).
8. **Signaux d'alarme et sources** : pas de numéro belge, allégation thérapeutique, mélange exclusif sans dose par ingrédient, dose en mg de sel, dose très inférieure aux études ou supérieure à l'UL, certificat introuvable ou générique, mots-valises (« pharmaceutical grade », « clinically proven » sans référence), faux avis et comptes à rebours, catégorie à risque sans label par lot, prix anormalement bas pour un ingrédient breveté, E171, rappels passés (RASFF, AFSCA). Sources : EFSA, registre UE des allégations, SPF Santé publique, AFSCA, RASFF Window, CBIP, PubMed et Cochrane, Examine, Labdoor, Test-Achats, et les sites des organismes de certification pour vérifier un label par produit et par lot.
9. **Marquer le statut** de chaque point repris : prouvé (source lue, citée avec son identifiant), secondaire ou incertain. Un chiffre réglementaire jamais relu à la source reste incertain.

## Livrable

Une fiche de contrôle pour le produit ou la catégorie : pour chaque famille (forme, dose, excipients, contaminants, certifications et lots, réglementation, critères propres), la constatation, le statut (prouvé, secondaire, incertain), la source ou l'identifiant d'étude, la liste des éliminatoires déclenchés et celle des informations manquantes.

## Critères de réussite

- Chaque affirmation chiffrée ou réglementaire porte son statut et sa source ; aucun chiffre repris de mémoire sans mention « à vérifier ».
- Les éliminatoires sont listés à part, avant toute note.
- Les informations manquantes sont écrites « inconnu », jamais comblées.
- Aucune phrase ne ressemble à un avis médical.

## Sources officielles

Textes et bases à ouvrir à la source (état de la grille au 02/11/2026) :

- EFSA, « Overview on Tolerable Upper Intake Levels » (version 11, août 2025), https://www.efsa.europa.eu/sites/default/files/assets/UL_Summary_tables.pdf : apports maximaux tolérables.
- EUR-Lex, https://eur-lex.europa.eu : règlements (UE) 2023/915, 2022/63, 1169/2011, 432/2012, 2015/2283 et directive 2002/46/CE. Le site bloque parfois les robots : le dire et marquer « non relu ».
- SPF Santé publique, https://www.health.belgium.be : notification, FOODSUPP, plantes, doses maximales belges.
- CBIP, https://www.cbip.be : statut médicament ou complément (mélatonine, avril 2021).

## À vérifier par un professionnel

Toute interaction avec un traitement, la grossesse, l'allaitement, l'âge, une maladie ou un risque d'allergie grave relève d'un médecin ou d'un pharmacien. La grille juge la qualité d'un produit, pas son opportunité pour une personne.

## Pièges

- Prendre un label anti-dopage pour un certificat de pureté.
- Comparer des produits sur le prix par gélule au lieu du prix par dose efficace.
- Citer un seuil réglementaire de mémoire : les textes ont été modifiés (cadmium des algues, valeurs belges).

## Limites

- Elle ne remplace ni un avis médical ni un laboratoire : elle ne mesure rien.
- Plusieurs règlements européens n'ont pas pu être relus à la source ; leurs seuils sont signalés comme secondaires ou incertains.
- Les labels et leurs périmètres (Kölner Liste, NSF, IFOS) sont à confirmer sur leur site.
- Les repères de dose sont ceux de l'adulte en population générale.

## Exemple

Cas illustratif, chiffres d'exemple. Catégorie « magnésium », achat en Belgique. La fiche relève : forme déclarée (bisglycinate), teneur en magnésium élémentaire 150 mg par dose, UL de 250 mg/j de magnésium ajouté respecté pour deux doses, pas de numéro de notification belge sur la page. Résultat : éliminatoire « notification belge absente » en attendant la preuve du numéro dans FOODSUPP ; certificat d'analyse demandé au vendeur.

Cas d'échec évité : un produit « complexe de 7 formes de magnésium » affiche 500 mg de « magnésium ». La fiche relève que la dose est en mg de sels, que la répartition par forme manque et que l'UL d'apport ajouté pourrait être dépassé : elle écrit « inconnu » et demande la répartition en milligrammes avant toute note.
