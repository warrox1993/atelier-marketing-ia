---
name: "vigilance-clientele-lbc"
description: "Prépare le dossier de vigilance d'un client au regard de la loi belge du 18 septembre 2017 (prévention du blanchiment de capitaux et du financement du terrorisme) : l'entreprise est-elle assujettie, identification et vérification du client et de ses bénéficiaires effectifs (registre UBO), évaluation individuelle du risque, indices de vigilance renforcée (personnes politiquement exposées, pays à haut risque), pièces manquantes, et points à soumettre au responsable de la conformité (AMLCO). À utiliser pour monter ou compléter un dossier client, ou pour vérifier une procédure de vigilance ; jamais pour qualifier un client de suspect, décider d'une déclaration à la CTIF, effectuer cette déclaration, ni informer ou avertir un client d'un examen en cours (interdiction de divulgation)."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "conformite"
---

# Vigilance à l'égard de la clientèle (lutte contre le blanchiment)

## Quand l'utiliser

- Une entité assujettie (voir le volet spécifique) entre en relation avec un nouveau client et doit constituer son dossier d'identification et d'évaluation du risque.
- Un dossier existant est incomplet (bénéficiaire effectif non identifié, pièce périmée, activité mal décrite).
- Un fait nouveau survient (changement d'actionnaire, nouveau pays impliqué, opération inhabituelle) et le dossier doit être réexaminé.
- Une PME non assujettie veut savoir si elle l'est, ou documenter une pratique volontaire de connaissance du client.

## Objectif

Un dossier où chaque constat est rattaché à une pièce, où le niveau de risque proposé est justifié par des facteurs écrits, où les pièces manquantes et les questions à poser sont listées, et où la décision (accepter, compléter, renforcer, refuser, examiner une déclaration) est laissée au responsable de la conformité. La compétence relève des faits et des indices ; elle ne conclut jamais à un soupçon.

## Prérequis

- La réponse à la question : l'entreprise est-elle une entité assujettie (article 5 de la loi) et pour quelle activité ? Sans réponse, la compétence le signale en tête du dossier.
- Le nom de la personne chargée de la conformité (AMLCO) et du responsable de haut niveau (article 9) ; sinon « information manquante ».
- La politique d'acceptation des clients et l'évaluation globale des risques de l'entreprise (articles 8, 16 et 17), si elles existent ; sinon le dossier le dit.
- Les pièces du client, transmises par le bureau de liaison, avec leur date.

## Entrées

- `client` : personne physique ou personne morale, pays, forme juridique, activité, numéro d'entreprise s'il existe.
- `relation` : nature (relation d'affaires durable ou opération occasionnelle), produit ou service, canal (face à face, à distance), pays concernés, montants prévus.
- `pieces` : liste des documents reçus (carte d'identité, statuts, extrait du registre UBO, justificatifs d'origine des fonds).
- `politique_interne` : seuils, grille de risque et procédures de l'entreprise, si disponibles.

## Étapes

1. **Qualifier l'entreprise** : relever dans l'article 5 de la loi si l'activité exercée est visée. Cette qualification d'assujettissement est à confirmer par le responsable de la conformité ou l'autorité de contrôle ; la compétence propose, elle ne tranche pas.
2. **Identifier le client** (article 21) : personne physique (identité), personne morale (dénomination, forme, siège, numéro d'entreprise, statuts, administrateurs). Noter les cas où l'identification est obligatoire : toute relation d'affaires, et les opérations occasionnelles liées d'un montant égal ou supérieur à 10 000 euros (seuil lu à l'article 21, à vérifier dans la version en vigueur, avec les cas particuliers des transferts de fonds).
3. **Identifier les mandataires** (article 22) : toute personne qui agit au nom du client, avec la preuve de son pouvoir.
4. **Identifier les bénéficiaires effectifs** (articles 4, 27° et 23) : personnes physiques qui possèdent ou contrôlent en dernier ressort le client. Pour une société, la détention de plus de 25 % des droits de vote ou du capital est un indice de participation suffisante, pas le seul critère : contrôle par d'autres moyens, ou, à défaut, dirigeant principal. Reconstituer la chaîne de détention jusqu'aux personnes physiques et la schématiser.
5. **Vérifier** (article 27) sur la base de documents probants ou de sources fiables : les mesures raisonnables de vérification des bénéficiaires effectifs, la structure de propriété et de contrôle. Comparer avec le **registre UBO** (articles 73 à 75 : registre tenu par l'Administration générale de la Trésorerie du SPF Finances). Une différence entre le registre et les informations détenues est à signaler dans le dossier : l'entité assujettie a l'obligation de la signaler électroniquement à l'Administration de la Trésorerie (article 74/1, avec exceptions pour certaines professions), signalement à faire par un humain.
6. **Comprendre la relation** (article 34) : activité réelle, objet et nature de la relation, origine des fonds quand le risque le justifie, pays impliqués. Vérifier si le client, un mandataire ou un bénéficiaire effectif est une personne politiquement exposée (PPE), un proche ou un proche associé.
7. **Proposer une évaluation individuelle du risque** (article 19, § 2) en croisant les facteurs de l'évaluation globale (articles 16 et 17, annexes de la loi) : client, produit ou service, pays ou zones, canal de distribution. Présenter les facteurs, le niveau proposé (standard, faible, élevé) et la raison. Ne jamais produire un score automatique d'une personne : le niveau est une proposition motivée.
8. **Repérer les situations de vigilance renforcée** :
   - PPE ou proche (article 41) : autorisation d'un membre d'un niveau élevé de la hiérarchie pour nouer ou maintenir la relation, établissement de l'origine du patrimoine et des fonds, surveillance accrue.
   - Pays tiers à haut risque (article 38) : informations supplémentaires sur le client, les bénéficiaires effectifs, l'origine des fonds et du patrimoine, les raisons des opérations, autorisation de la hiérarchie, surveillance renforcée. La liste des pays est fixée au niveau de l'Union européenne : vérifier la liste en vigueur à la date du dossier, pas de mémoire.
   - Liens avec un État à fiscalité inexistante ou peu élevée (article 39) : vigilance accrue.
   - Identification non encore vérifiée (article 37) ou structure opaque : vigilance accrue.
9. **Lister les pièces manquantes et les questions** pour le client (formulées de manière neutre, sans allusion à un soupçon). Si l'identification ou la vérification est impossible dans les délais, la loi interdit de nouer la relation ou d'effectuer l'opération et impose de mettre fin à la relation déjà nouée (article 33) : le dossier signale cette situation, et l'obligation de faire examiner s'il y a lieu d'en informer la CTIF, au responsable de la conformité.
10. **Relever les indices objectifs** (opération complexe, montant anormalement élevé, schéma inhabituel, absence d'objet économique apparent : critères de l'article 45) sans les qualifier. Chaque indice porte sa source (pièce, date). Le responsable de la conformité décide de l'analyse approfondie et, éventuellement, de la déclaration (article 47 : « sait, soupçonne ou a des motifs raisonnables de soupçonner »).
11. **Rappeler la confidentialité** : en tête de dossier, la mention que ni le client ni un tiers ne doit apprendre qu'une analyse est en cours ou qu'une information est transmise à la CTIF (article 55). Les questions au client ne mentionnent donc jamais un examen anti-blanchiment particulier ; elles sont présentées comme la mise à jour habituelle du dossier.
12. **Fixer la conservation** (article 60) : les données d'identification et les documents probants sont conservés dix ans à compter de la fin de la relation d'affaires ou de l'opération occasionnelle. Les données personnelles du dossier ne servent qu'à cette finalité (article 64).

### Volet spécifique : entités assujetties

La loi énumère les entités assujetties à l'article 5, § 1er. Parmi celles qui touchent une PME de services :

- les intermédiaires d'assurances (partie 6 de la loi du 4 avril 2014) qui exercent, en dehors de tout contrat d'agence exclusive, dans une ou plusieurs branches d'assurance-vie (19°) ; la FSMA précise sur son site que les intermédiaires exclusifs en assurance-vie ne sont pas visés ;
- les prêteurs de crédit à la consommation ou hypothécaire (20°) ;
- les experts-comptables et les personnes de la profession comptable et fiscale visées au 24° (périmètre exact à vérifier dans le texte) ;
- les notaires (26°), les huissiers de justice (27°), les avocats pour certaines activités (28°) ;
- les agents immobiliers visés par la loi du 11 février 2013 (30°) ;
- les commerçants en diamants (31°).

Pour toutes : politiques, procédures et contrôle interne proportionnés (article 8), responsable de haut niveau et personne chargée de la conformité (article 9), évaluation globale des risques documentée (articles 16 et 17), formation du personnel (article 36), analyse des opérations atypiques sous la responsabilité de la personne désignée (article 45), déclaration à la CTIF en principe par cette personne (à vérifier à l'article 49). Les autorités de contrôle ont des attentes propres : pour les intermédiaires d'assurance, la FSMA (voir sources) ; pour les autres professions, l'autorité ou l'organisme de la profession, à identifier par le responsable.

Pour une PME non assujettie : la loi ne s'applique pas, mais la connaissance du client et la tenue d'un dossier restent une bonne pratique, et certains clients ou partenaires assujettis lui poseront des questions. Le dossier le dit expressément.

## Livrable

Un dossier de vigilance (Markdown ou DOCX) comprenant :

1. L'en-tête : entité, assujettie oui, non ou à confirmer, AMLCO, date, périmètre.
2. La fiche d'identification : client, mandataires, bénéficiaires effectifs, schéma de détention, pièces vues avec leur date, pièces manquantes.
3. La comparaison avec le registre UBO et les divergences.
4. L'évaluation individuelle du risque proposée : facteurs, niveau, justification.
5. Les mesures de vigilance renforcée applicables, cochées avec la base légale.
6. La liste d'indices objectifs, chacun avec sa source ; aucune conclusion de soupçon.
7. Les questions à poser au client, à faire valider avant envoi.
8. Les décisions attendues du responsable de la conformité (accepter, compléter, renforcer, refuser, ouvrir une analyse).
9. La mention de confidentialité (interdiction de divulgation) et celle de validation humaine.

## Critères de réussite

- Chaque fait du dossier renvoie à une pièce et à sa date ; toute information absente est écrite « information manquante » avec la question précise.
- Les bénéficiaires effectifs sont des personnes physiques, la chaîne de détention est complète ou le trou est signalé.
- Le niveau de risque proposé est motivé par des facteurs, jamais par un score automatique.
- Aucune phrase ne qualifie un client de suspect ni ne laisse entendre une déclaration.
- Les questions au client ne révèlent aucun examen en cours.
- Les articles sont cités à partir du texte consulté ; ceux non vérifiés sont marqués « à vérifier ».
- La décision est laissée à l'humain responsable.

## Sources officielles

Consultées le 16/10/2026 :

- Loi du 18 septembre 2017 relative à la prévention du blanchiment de capitaux et du financement du terrorisme et à la limitation de l'utilisation des espèces, Justel (Moniteur belge), https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&table_name=loi&cn=2017091806 : version consolidée lue, avec mention de mise à jour au 28/07/2026. Articles lus : 4 (27°, bénéficiaire effectif, indice de plus de 25 %), 5 (entités assujetties), 8, 9, 16, 17, 19, 21 à 23, 27, 33 à 35, 37 à 39, 41, 45, 47, 55, 60, 74 et 74/1. Texte lu en français ; les passages tronqués sont notés « à vérifier ».
- Directive (UE) 2015/849 du 20 mai 2015, EUR-Lex, https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32015L0849 : page lisible, version consolidée indiquée au 30/12/2024 ; seule la première moitié du texte a été lue par l'outil (articles 3, 13, 18, 20, 30 repérés comme présents). La loi belge la transpose.
- « Quelles sont les principales obligations qui découlent de la législation anti-blanchiment pour les intermédiaires d'assurance ? », FSMA, https://www.fsma.be/fr/intermediaires-preteurs/quelles-sont-les-principales-obligations-qui-decoulent-de-la-legislation-0 : intermédiaires concernés, deux fonctions à désigner (responsable de haut niveau et AMLCO), approche fondée sur les risques en quatre étapes, obligation de résultat pour embargos et gels d'avoirs. Lue en résumé automatique de la page : les formulations exactes sont à reprendre de la page elle-même.
- « Lutte contre le blanchiment de capitaux et le financement du terrorisme », FSMA, https://www.fsma.be/en/combatting-money-laundering-and-financing-terrorism : confirme l'application de la loi du 18 septembre 2017 aux entités assujetties et le rôle de la CTIF ; page disponible en anglais seulement dans cette version.

Sources inaccessibles le 16/10/2026 : le site de la CTIF (ctif-cfi.be) a répondu « 503 service indisponible » ; les modalités pratiques de déclaration en ligne ne sont donc pas décrites ici (à vérifier sur le site de la CTIF). La page du registre UBO sur finances.belgium.be a renvoyé une page de vérification anti-robot, non lisible : les règles pratiques d'enregistrement et de consultation du registre ne sont donc pas décrites ; seuls les articles 73 à 75 de la loi sont cités.

## À vérifier par un professionnel

Toute la compétence est une analyse préparatoire. Elle doit être validée par le responsable de la conformité (AMLCO) de l'entreprise, ou par un avocat spécialisé, avant toute décision sur un client, toute mesure de vigilance renforcée, tout refus ou fin de relation, et surtout avant toute déclaration à la CTIF, qui est un acte humain. L'assujettissement de l'entreprise, la liste des pays à haut risque en vigueur, le seuil applicable aux opérations occasionnelles et la portée exacte des catégories professionnelles sont à confirmer dans la version consolidée du jour. Le droit européen est en évolution : un nouveau cadre est annoncé, non consulté ici, à vérifier.

## Limites

- Sans pièce, aucune identification ni vérification : le dossier reste incomplet et le dit.
- La compétence ne consulte aucune base externe (listes de sanctions, de PPE, médias) hors des sources autorisées dans la tâche ; elle indique qu'une recherche est à faire par l'humain.
- Elle ne note aucune personne par un score automatique et ne conclut jamais au soupçon.
- Elle ne déclare rien, ne contacte aucun client et n'avertit personne : l'interdiction de divulgation de l'article 55 s'applique aux entités, à leurs dirigeants, membres du personnel et agents.
- Règle de non-divulgation : ni le client concerné ni un tiers ne doit apprendre qu'une information ou une déclaration est, sera ou a été transmise à la CTIF, ni qu'une analyse de blanchiment est en cours ou envisagée (article 55 de la loi du 18 septembre 2017, confirmé par la page de la Banque nationale de Belgique sur l'interdiction de divulgation, qui cite les articles 55 et 56 ; portée des exceptions et article 56 : article à vérifier par un professionnel). Aucun livrable destiné au client ou hors du cercle du responsable de la conformité n'y fait allusion.
- Les procédures internes de l'entreprise priment pour les seuils et la grille de risque, dans le respect de la loi.

## Exemple

Entreprise : cabinet de courtage fictif « Courtage Exemple SRL », intermédiaire d'assurances non exclusif en assurance-vie, donc assujetti (article 5, 19°, à confirmer). Nouveau client : « Atelier Fictif SRL », société belge de menuiserie, souhaite souscrire un contrat d'assurance-vie d'entreprise pour son gérant.

Constats : statuts du 14/03/2022 vus ; deux associés, 60 % et 40 % ; l'associé à 60 % est une société luxembourgeoise « Holding Fictive SA » dont les statuts ne sont pas fournis. Le registre UBO consulté par l'AMLCO indique une seule personne physique à 100 % ; le dossier détient une autre répartition : divergence à signaler (article 74/1). Le gérant est identifié (carte d'identité en cours de validité, copie du 02/10/2026). Fonds : épargne de l'entreprise, extrait bancaire non fourni.

Proposition : risque « élevé » (structure avec holding étrangère, bénéficiaire effectif non vérifié, origine des fonds non documentée), vigilance accrue (article 37 tant que l'identité n'est pas vérifiée, article 38 si le pays était en liste de pays tiers à haut risque : à vérifier). Pièces à demander : statuts et registre des actionnaires de la holding, extrait bancaire, justificatif de l'origine des fonds. Décisions attendues de l'AMLCO : poursuivre ou suspendre, signaler la divergence UBO.

Cas d'échec : le conseiller commercial demande de rédiger un courriel au client expliquant que « son dossier est en cours d'examen anti-blanchiment et pourrait être transmis à la CTIF ». La compétence refuse : ce message révélerait l'analyse, ce que l'article 55 interdit. Elle propose à la place une demande neutre de pièces (« mise à jour de votre dossier ») à faire valider par l'AMLCO, et renvoie la question de la déclaration à l'AMLCO.
