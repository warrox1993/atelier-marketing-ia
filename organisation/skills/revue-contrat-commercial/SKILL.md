---
name: "revue-contrat-commercial"
description: "Prépare la revue d'un contrat commercial pour une PME belge : grille de lecture en dix points (parties, objet, prix, durée, résiliation, responsabilité et plafond, force majeure, confidentialité, propriété intellectuelle, droit applicable et for), détection des clauses à risque, rapprochement avec les clauses abusives entre entreprises (articles VI.91/3 à VI.91/6 du Code de droit économique, loi du 4 avril 2019) et synthèse en feux rouges, orange et verts avec questions pour l'avocat. À utiliser avant la signature, le renouvellement ou la renégociation d'un contrat de vente, de prestation, de distribution ou de licence ; jamais pour dire qu'un contrat est valable ou sans risque, rédiger un contrat opposable, contacter la contrepartie ni signer."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "juridique"
---

# Revue d'un contrat commercial

## Quand l'utiliser

- Un client ou un fournisseur envoie son projet de contrat ou ses conditions générales et il faut savoir à quoi l'entreprise s'engage.
- Un contrat arrive à échéance ou se reconduit et la direction veut décider de le laisser courir, de le renégocier ou de le quitter.
- Une clause inquiète (plafond de responsabilité, exclusivité, pénalité) et il faut préparer les questions à poser à un avocat.

## Objectif

Une fiche qui, pour dix rubriques, dit ce que prévoit le contrat (avec l'article et la citation exacte), ce qui est absent, inhabituel ou déséquilibré, et ce qu'il faut demander de changer, résumée en feux rouge, orange et vert. C'est une analyse préparatoire : elle n'est ni un avis juridique ni une validation du contrat, et elle se termine par la liste des points à faire trancher par un avocat.

## Prérequis

- Le texte complet du contrat, annexes et conditions générales incluses (une annexe manquante est signalée, pas supposée).
- Le côté de l'entreprise : vendeur ou acheteur, prestataire ou client, et la nature de l'autre partie (entreprise, consommateur, pouvoir public). Les règles ci-dessous sur les clauses abusives entre entreprises ne valent que si les deux parties sont des entreprises.
- La valeur et la durée approximatives de l'engagement, pour juger si un plafond ou une pénalité est proportionné.

## Entrées

- `contrat` : le texte, avec la numérotation des articles.
- `position` : côté de l'entreprise et objectif (signer, renouveler, sortir).
- `contexte` : montant, dépendance à la contrepartie, historique de la relation, données personnelles en jeu.

## Étapes

1. **Identifier le type de contrat et la nature des parties.** Si une partie est un consommateur, arrêter la grille B2B et le signaler : le régime des clauses abusives est différent (articles VI.82 et suivants du Code de droit économique) et la revue passe à l'avocat. Si le contrat est un marché public ou un service financier, l'indiquer : le titre sur les clauses abusives entre entreprises ne s'y applique pas (article VI.91/1).
2. **Charger le référentiel de positions** de l'entreprise (positions acceptables, de repli et inacceptables par type de clause), fourni ou trouvé dans les connaissances. S'il manque, l'écrire en tête de la synthèse et appliquer les positions de marché courantes, marquées comme telles. Puis **lire le contrat en entier** avant de signaler quoi que ce soit, en lisant ensemble les clauses qui s'équilibrent (plafond de responsabilité et indemnisation, durée et résiliation, garanties et exclusions).
   **Remplir la grille de lecture**, une ligne par rubrique : citation exacte, article, lecture en une phrase, feu (voir plus bas). Une rubrique absente du contrat reçoit « silence du contrat » et un feu, jamais un blanc.
3. **Chercher les clauses à risque** de la liste ci-dessous, même placées hors de leur rubrique habituelle (dans les conditions générales ou une annexe).
4. **Rapprocher des clauses abusives entre entreprises** : pour chaque clause jugée déséquilibrée, dire laquelle des trois catégories elle évoque (clause interdite par principe, clause présumée abusive, ou déséquilibre manifeste à apprécier) et le raisonnement, en écrivant « à confirmer par l'avocat ». Ne jamais écrire « cette clause est nulle ».
5. **Vérifier la cohérence interne** : définitions utilisées mais non définies, renvois à un article inexistant, contradiction entre contrat et conditions générales, ordre de priorité des documents, versions linguistiques.
6. **Attribuer les feux** et rédiger la synthèse : d'abord les rouges, puis les oranges, puis ce qui est vert. Ne pas détailler une clause équitable et courante ; signaler en revanche ce qui manque (un contrat muet sur le plafond de responsabilité ou sur les modifications de commande est souvent plus risqué qu'une clause défavorable).
7. **Pour chaque point orange ou rouge**, écrire : citation exacte, modification proposée, raison, priorité de négociation (indispensable : sans elle on ne signe pas ; importante : risque réel mais marge de discussion ; souhaitable : à céder si nécessaire) et position de repli acceptable.
8. **Préparer les questions pour l'avocat** : une question par point rouge ou orange, avec la clause citée, l'enjeu en euros ou en jours si connu, et la modification souhaitée en une phrase.

### Grille de lecture

| Rubrique | Ce qu'on relève | Alertes fréquentes |
| --- | --- | --- |
| Parties | dénomination, forme, numéro d'entreprise, siège, signataire et son pouvoir | entité qui signe différente de celle qui livre ou paie; groupe sans garantie de la maison mère |
| Objet | description des produits ou services, livrables, critères d'acceptation, niveaux de service | objet vague; services « selon les besoins »; acceptation tacite; périmètre modifiable par une seule partie |
| Prix | montant, devise, TVA, indexation, frais annexes, facturation, délai de paiement, intérêts de retard | prix révisable à la seule volonté d'une partie; indexation sans plafond; délai de paiement très long |
| Durée | date d'entrée en vigueur, durée initiale, reconduction | reconduction tacite sans délai raisonnable de résiliation; engagement très long sans sortie |
| Résiliation | préavis, résiliation pour faute, pour convenance, conséquences financières | résiliation possible pour une partie seulement; indemnité de sortie disproportionnée; pas de mise en demeure préalable |
| Responsabilité et plafond | exclusions, plafond, dommages indirects, garanties, assurance | plafond d'un côté seulement; exclusion de la faute lourde ou du dol; responsabilité illimitée pour l'entreprise |
| Force majeure | définition, liste, avis, durée avant sortie | définition réservée à une partie; pas de droit de sortie après une durée; exclut les pannes de sous-traitants sans nuance |
| Confidentialité | périmètre, durée, exceptions, retour ou destruction | durée perpétuelle; asymétrie; absence d'exception pour les obligations légales |
| Propriété intellectuelle | titulaire des créations, licence, étendue, garantie d'éviction | cession totale sans prix ni limite; réutilisation par le fournisseur de vos données ou livrables; absence de garantie contre les tiers |
| Droit applicable et for | loi, juridiction ou arbitrage, langue, médiation | tribunal étranger lointain; arbitrage coûteux imposé à la plus petite partie; loi étrangère sans raison |

### Clauses à risque à chercher partout

- Engagement ferme d'une partie alors que l'autre peut ne pas exécuter selon sa seule volonté.
- Droit unilatéral d'interpréter le contrat ou de le modifier (prix, caractéristiques, conditions) sans raison valable.
- Renonciation à tout recours en cas de litige; limitation des moyens de preuve.
- Reconduction tacite sans délai de résiliation raisonnable; engagement sans délai de résiliation raisonnable.
- Pénalités ou dommages et intérêts forfaitaires qui dépassent manifestement le préjudice probable.
- Exclusion ou limitation de la responsabilité pour dol, faute grave ou inexécution des engagements essentiels (hors force majeure).
- Exclusivité, non-concurrence, clause de préférence, interdiction de sous-traiter, sans contrepartie.
- Transfert du risque économique sans contrepartie.
- Données personnelles traitées sans clause de l'article 28 du RGPD quand l'autre partie agit pour le compte de l'entreprise (voir la compétence `registre-traitements-rgpd`).
- Cession du contrat ou changement de contrôle qui permet à la contrepartie de sortir ou de changer les conditions.

### Les clauses abusives entre entreprises (repères)

Le Code de droit économique, livre VI, titre 3/1 « Contrats conclus entre entreprises » (articles VI.91/1 à VI.91/7, insérés par la loi du 4 avril 2019, en vigueur depuis le 1er décembre 2020) pose quatre niveaux, à citer par article :

- **Principe général (VI.91/3)** : une clause est abusive quand, seule ou combinée à d'autres, elle crée un déséquilibre manifeste entre les droits et obligations des parties ; l'appréciation tient compte de la nature des produits, des circonstances de la conclusion, de l'économie du contrat, des usages et des autres clauses. Elle ne porte ni sur la définition de l'objet principal ni sur l'adéquation du prix, si ces clauses sont claires et compréhensibles.
- **Clauses abusives en toute hypothèse (VI.91/4)** : engagement irrévocable alors que l'exécution de l'autre est soumise à sa seule volonté; droit unilatéral d'interpréter une clause; renonciation à tout recours; reconnaissance irréfragable de clauses qu'on n'a pas pu lire avant la conclusion.
- **Clauses présumées abusives sauf preuve contraire (VI.91/5)** : modification unilatérale sans raison valable du prix, des caractéristiques ou des conditions; reconduction tacite d'un contrat à durée déterminée sans délai raisonnable de résiliation; risque économique placé sans contrepartie; exclusion ou limitation inappropriée des droits légaux en cas d'inexécution; engagement sans délai raisonnable de résiliation; exclusion de responsabilité pour dol, faute grave ou inexécution des engagements essentiels; limitation des moyens de preuve; dommages et intérêts manifestement excessifs.
- **Sanction (VI.91/6)** : la clause abusive est interdite et nulle ; le contrat reste contraignant s'il peut subsister sans elle.

À cela s'ajoute l'exigence de rédaction claire et compréhensible des clauses écrites (VI.91/2). L'abus de dépendance économique relève d'autres articles du même titre et n'est pas traité ici.

### Le feu

- **Rouge** : clause qui correspond à une catégorie de VI.91/4 ou de VI.91/5, engagement sans sortie, responsabilité illimitée, silence sur un point essentiel (paiement, résiliation, loi applicable). À traiter par l'avocat avant toute signature.
- **Orange** : clause déséquilibrée mais négociable, ou imprécise, ou dépendant d'un fait à vérifier. À négocier ou à clarifier par écrit.
- **Vert** : clause claire, équilibrée au regard de la grille, sans alerte. Un vert ne dit pas que la clause est valable, il dit que la revue n'y a rien relevé.

## Livrable

Une fiche en Markdown : identité du contrat et des parties, tableau de la grille (rubrique, article, citation exacte, lecture, feu), liste des clauses à risque avec le rapprochement des articles du Code de droit économique, synthèse en trois colonnes rouge, orange, vert, liste des informations manquantes, questions pour l'avocat. Chaque page porte la mention « analyse préparatoire à faire valider par un avocat ».

## Critères de réussite

- Chaque constat renvoie à un article du contrat et cite la clause entre guillemets, sans reformulation qui change le sens.
- Dix rubriques traitées, y compris celles où le contrat est muet.
- Aucune phrase de type « c'est ok », « contrat conforme », « clause nulle » : les verdicts sont des hypothèses à confirmer.
- Chaque article de loi cité a été relu sur le texte consolidé le jour de la revue.
- Les questions pour l'avocat sont précises, hiérarchisées et chiffrées quand l'enjeu est connu.

## Sources officielles

Consultées le 16/10/2026 :

- Code de droit économique, texte consolidé, Justel (SPF Justice), https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=2013022819&table_name=loi : articles VI.91/1 à VI.91/7 relus intégralement. Ils ont été insérés par la loi du 4 avril 2019 (articles 14 à 19 pour VI.91/1 à VI.91/6), en vigueur le 1er décembre 2020 ; l'article VI.91/1, § 3, a été complété par la loi du 9 février 2024 (en vigueur le 31 mars 2024) pour viser les contrats avec certaines associations de copropriétaires ; l'article VI.91/5, 5°, renvoie au Code civil depuis le 1er janvier 2023. Le texte consolidé affiche une modification annoncée par une loi du 20 juillet 2026 avec entrée en vigueur au 20 novembre 2026 : à relire à cette date.
- Intitulé et numéro de la loi du 4 avril 2019 : déduits des références portées par le texte consolidé du Code (« L 2019-04-04/53 »). Le texte de la loi elle-même n'a pas été ouvert séparément ; la date de publication au Moniteur belge n'est pas citée.

Les repères d'alerte du tableau (durée, plafond, pénalités) sont des pratiques de lecture, pas des règles légales.

## À vérifier par un professionnel

Toute la revue : un avocat (droit des contrats, et droit de la concurrence si une exclusivité ou une dépendance économique est en cause) valide la lecture avant signature. Les montants, plafonds et pénalités sont à relire avec l'expert-comptable. Tout contrat avec un consommateur, un pouvoir public, un partenaire étranger ou un transfert de données hors Union européenne sort du cadre de cette grille.

## Limites

- La compétence ne qualifie pas juridiquement une clause et ne prédit pas la décision d'un juge : elle repère et classe.
- Elle ne lit que le texte fourni ; les usages entre les parties, les échanges antérieurs et les clauses orales lui échappent.
- Elle n'applique pas le droit étranger ni le droit sectoriel (assurance, banque, santé, construction) sans qu'un avocat le demande.
- Elle ne rédige pas de contre-proposition opposable ; elle indique la modification souhaitée en une phrase.
- Un contrat illisible ou incomplet donne une revue partielle, annoncée comme telle.

## Exemple

Contrat de maintenance informatique proposé à une PME de 25 personnes. Extraits : « Article 4.2 : Le prestataire peut modifier ses tarifs à tout moment. » ; « Article 9.1 : Le contrat est conclu pour trois ans et se renouvelle tacitement pour la même durée. » ; « Article 11.3 : La responsabilité du prestataire est exclue en toute hypothèse. »

| Rubrique | Citation et article | Lecture | Feu |
| --- | --- | --- | --- |
| Prix | art. 4.2, « Le prestataire peut modifier ses tarifs à tout moment » | modification unilatérale sans raison ni préavis; évoque VI.91/5, 1° (hypothèse, à confirmer) | rouge |
| Durée | art. 9.1, « se renouvelle tacitement pour la même durée » | renouvellement de trois ans sans délai de résiliation indiqué; évoque VI.91/5, 2° et 5° | rouge |
| Responsabilité | art. 11.3, « exclue en toute hypothèse » | exclut même le dol et la faute grave; évoque VI.91/5, 6° | rouge |
| Force majeure | silence du contrat | à définir | orange |

Question pour l'avocat : « Les articles 4.2, 9.1 et 11.3 relèvent-ils de VI.91/5 ? Peut-on exiger un préavis de 90 jours avant toute révision de prix et un droit de sortie sans frais ? Enjeu : 3 ans de redevances. » Rappel en bas de fiche : analyse préparatoire à faire valider par un avocat.

Cas d'échec : l'une des parties est une association de copropriétaires de plus de vingt-cinq pour cent de lots professionnels, ou un consommateur. La fiche ne conclut pas : elle écrit « nature de la partie à confirmer, le régime applicable diffère; revue B2B suspendue » et pose la question à l'avocat. Autre échec évité : les conditions générales annexées manquent ; le feu des rubriques concernées reste orange avec « document manquant », jamais vert.

## Origine de la méthode

Référentiel de positions avec repli explicite, lecture complète et lecture d'ensemble des clauses qui s'équilibrent,
format de modification avec position de repli et trois priorités de négociation adaptés de
github.com/anthropics/knowledge-work-plugins, `legal/skills/review-contract/SKILL.md` (étapes 3, 4, 6 et 7) ; « ne pas
signaler le standard équitable, signaler ce qui manque » de `small-business/skills/contract-review/SKILL.md`
(« Approval gates ») ; commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Les feux et la couche
VI.91/1 et suivants sont propres à l'atelier. Liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
