---
name: "non-conformite-action-corrective"
description: "Enregistre une non-conformité ou une réclamation client dans une PME belge, en analyse la cause (5 pourquoi, diagramme d'Ishikawa), propose des actions de correction, corrective et préventive avec responsable et échéance, puis prépare la vérification d'efficacité. À utiliser quand un produit, un service, un document ou un processus s'écarte de ce qui était promis ou prévu, ou quand un client se plaint ; jamais pour désigner un coupable, conclure à une cause sans preuve, clore une action sans vérification, ni promettre une indemnisation ou une réponse juridique au client."
metadata:
  version: "1.2.0"
  langue: "fr"
  domaine: "qualite"
---

# Non-conformité et action corrective

## Quand l'utiliser

- Une livraison, un document, un service ou un contrôle ne respecte pas l'exigence prévue (cahier des charges, procédure, promesse faite au client).
- Un client formule une réclamation et l'entreprise veut en tirer une amélioration durable, pas seulement une réponse.
- Le même problème revient et la correction habituelle ne suffit plus.

## Objectif

Un dossier unique par cas : ce qui s'est passé (faits), ce qui a été fait tout de suite, pourquoi c'est arrivé (cause racine prouvée), ce qui changera pour que cela n'arrive plus, qui s'en charge, pour quand, et comment on vérifiera que cela a fonctionné.

## Prérequis

- La description de l'écart par la personne qui l'a constaté, avec la date et la référence (commande, lot, dossier).
- L'exigence qui n'a pas été respectée (la procédure, le contrat, le cahier des charges).
- Les enregistrements liés (bon de livraison, e-mails, fiches de contrôle).
- Un humain responsable qui décide des actions et de la clôture.

## Entrées

- `constat` : faits bruts, sans interprétation, avec date, lieu, référence.
- `exigence` : ce qui était attendu, avec sa source.
- `origine` : interne (contrôle, collègue) ou externe (client, fournisseur).
- `preuves` : documents et chiffres disponibles.

## Étapes

0. **Décider s'il faut une action corrective** selon le déclencheur : réclamation touchant la sécurité, constat d'audit
   majeur, constat d'audit externe ou même non-conformité répétée 3 fois ou plus : oui ; constat d'audit mineur :
   recommandée ; réclamation qualité, non-conformité isolée ou tendance : à évaluer selon la gravité et la fréquence.
   La règle appliquée est citée dans le dossier.
1. **Enregistrer** : numéro du dossier, date, origine, description factuelle, exigence non respectée, gravité provisoire (mineure : sans effet sur le client ; majeure : le client ou la sécurité est touché ; critique : atteinte à la sécurité, à la loi ou perte importante). La description sépare ce qu'on a constaté de ce qu'on suppose.
2. **Contenir** : action immédiate pour limiter les dégâts (isoler le lot, prévenir le client, bloquer l'envoi). Elle est datée et attribuée. C'est la **correction**, qui traite le symptôme.
   **Proposer la destination du produit non conforme**, en suivant cet ordre ; la première situation qui s'applique décide :
   1. caractéristique de sécurité ou exigence réglementaire touchée : **jamais d'utilisation en l'état** ; retouche seulement si elle ramène à la pleine conformité, sinon rebut ;
   2. exigence propre au client, plus stricte que le plan, non respectée alors que le plan l'est : **dérogation à demander au client** avant toute décision ;
   3. effet sur la forme, l'assemblage ou la fonction : à évaluer par la personne compétente (méthodes, bureau d'études) ; sans effet et dans son autorité, utilisation en l'état avec justification écrite ; avec effet, retouche ou rebut ;
   4. retouche possible par un procédé approuvé : comparer son coût au coût de remplacement (repère : au-delà de 60 % du coût de remplacement, le rebut est souvent plus économique) ;
   5. défaut causé par un fournisseur : retour au fournisseur avec demande d'action corrective ; si la production ne peut pas attendre, retouche ou utilisation avec récupération du coût.
   Rebut, retouche, dérogation et libération d'un lot sont des **décisions humaines** : la compétence propose avec la raison.
3. **Étendre la recherche** : le même écart existe-t-il ailleurs (autres lots, autres clients, autres équipes) ? Si oui, les ajouter au dossier.
4. **Chercher la cause** avec les deux outils ci-dessous, en groupe avec les personnes concernées, sans chercher de coupable.
5. **Prouver la cause** : pour chaque cause retenue, une preuve (enregistrement, mesure, essai, témoignage daté). Une cause sans preuve est écrite « hypothèse ». Valider la cause sur cinq points, chacun coché ou expliqué : prouvée par un élément objectif ; la supprimer empêcherait la récurrence ; maîtrisable par l'entreprise ; elle explique tous les symptômes ; aucune autre cause importante ne reste sans traitement.
6. **Décider des actions** : corrective (supprimer la cause racine), préventive (éviter que la même cause produise un autre écart ailleurs), avec responsable (fonction), échéance et moyens. Une action sur une cause non prouvée n'est qu'un essai : le dire.
7. **Planifier la vérification d'efficacité** : date (après un délai suffisant pour qu'un cas se représente), critère mesurable (« zéro retour de ce type sur 3 mois »), qui vérifie.
8. **Suivre et clôturer** : l'action est « faite » quand elle est réalisée, « efficace » quand le critère est atteint. Le dossier n'est clos que sur « efficace », par la décision de l'humain responsable. Arbre de décision : récurrence pendant la période de vérification, inefficace (reprendre la cause) ; critères atteints, efficace ; écart faible, prolonger la vérification ou accepter avec justification écrite ; écart important, inefficace (revoir les actions).
   Indicateurs du suivi, présentés comme valeurs de départ à fixer par la direction : délai moyen de clôture (repère moins de 60 jours), taux de dossiers en retard (moins de 10 %), efficacité du premier coup (plus de 90 %), récurrence (moins de 5 %). Ancienneté des dossiers ouverts par tranche : 0 à 30 jours (suivre), 31 à 60 (surveiller), 61 à 90 (alerter la direction), plus de 90 (intervention de la direction).
9. **Capitaliser** : si la cause révèle un défaut d'une procédure, proposer sa mise à jour (compétence `procedure-qualite`) ; si elle touche un audit en cours, informer l'auditeur (compétence `audit-interne`).

### Les 5 pourquoi

Partir de l'écart et demander « pourquoi ? » jusqu'à une cause que l'entreprise peut changer (en général trois à cinq fois ; s'arrêter quand la réponse est une règle, un outil ou une organisation modifiable, pas une personne). Chaque réponse doit être soutenue par un fait.

Exemple de chaîne : l'étiquette est fausse (1) parce que l'ancien modèle a été imprimé (2) parce que le fichier à jour n'était pas dans le dossier de l'imprimante (3) parce que deux dossiers coexistent et que personne n'archive l'ancien (4) parce qu'aucune règle ne dit qui archive. Cause racine : absence de règle d'archivage, pas « l'opérateur s'est trompé ».

### Diagramme d'Ishikawa

Utile quand plusieurs causes possibles coexistent. Classer par familles (les « 5 M » : main-d'œuvre, méthode, matériel, matière, milieu, ou « 6 M » avec mesure), lister les causes par famille, puis marquer celles qui sont prouvées. Ne pas confondre une cause avec un symptôme ni avec une personne.

### Les trois niveaux d'action

| Niveau | Question | Exemple |
| --- | --- | --- |
| Correction | Que fait-on du produit ou du client touché ? | remplacer la pièce, rappeler le client |
| Action corrective | Que change-t-on pour supprimer cette cause ? | archiver automatiquement l'ancien fichier |
| Action préventive | Où la même cause peut-elle frapper ailleurs ? | appliquer la règle d'archivage aux autres imprimantes |

### Cas d'une réclamation client

- Accuser réception rapidement et dire quand le client aura une réponse.
- Séparer la réponse au client (rédigée avec la compétence de réponse aux réclamations, ton à valider par l'humain) de l'analyse interne.
- Ne pas conclure sur la responsabilité ni l'indemnisation : c'est une décision humaine, éventuellement juridique.
- Pour un consommateur, les droits de recours et la médiation sont rappelés (voir sources).

## Livrable

- Une fiche de non-conformité : numéro, faits, exigence, gravité provisoire, correction, analyse des causes (chaîne des pourquoi ou schéma d'Ishikawa en liste), preuves, actions avec responsable et échéance, critère d'efficacité.
- Un tableau de suivi des actions ouvertes.
- La liste des points sans preuve et des décisions à prendre.

## Critères de réussite

- Les faits sont séparés des suppositions.
- La correction, l'action corrective et l'action préventive sont distinguées.
- Chaque cause retenue a une preuve ou la mention « hypothèse ».
- Chaque action a un responsable (fonction) et une échéance.
- Le critère d'efficacité est chiffré et daté ; aucune clôture sans lui.
- Aucun nom de personne désignée comme cause.
- Le confinement est la première action ; « utilisation en l'état » n'est jamais proposée sur une caractéristique de sécurité ou réglementaire ; rebut, retouche, dérogation et libération restent des décisions humaines.

## Sources officielles

Consultées le 16/10/2026 :

- « Les 7 principes fondamentaux ISO 9001 et le cycle PDCA », LRQA, https://www.lrqa.com/fr-fr/iso-9001/7-principes-fondamentaux-iso-9001/ : l'amélioration continue et la décision fondée sur les preuves, et la phase « agir » du cycle (traiter les écarts, améliorer durablement). Source privée d'un organisme de certification.
- « Belmed, plateforme pour le règlement extrajudiciaire en ligne des litiges », Institut des Réviseurs d'Entreprises, https://www.ibr-ire.be/fr/actualites/news-detail/belmed-plateforme-pour-le-r-glement-extrajudiciaire-en-ligne-des-litiges : Belmed est la plateforme du SPF Economie pour les litiges entre entreprises et consommateurs ou entre entreprises ; sa consultation est gratuite, le coût éventuel de la médiation dépend des instances concernées ; l'entreprise doit rendre visibles ses coordonnées et l'accès à son service de plaintes, tenter une solution amiable et orienter les plaintes non résolues vers les entités qualifiées. Il s'agit d'une page d'un institut professionnel qui relaie la réglementation, pas du texte légal.

Le site du SPF Economie (economie.fgov.be) et celui de la Chambre ont refusé l'accès automatisé : ils ne sont pas cités. Les méthodes des 5 pourquoi et d'Ishikawa sont des outils de gestion courants, sans source officielle citée ; les niveaux de gravité sont un repère de départ à adapter.

## À vérifier par un professionnel

- Un juriste ou un avocat avant toute réponse engageant la responsabilité de l'entreprise, une indemnisation ou une garantie légale, et pour les règles applicables aux consommateurs.
- Le délégué à la protection des données ou un juriste si la non-conformité implique une fuite ou une perte de données personnelles : des obligations de notification peuvent exister, dans des délais courts.
- Le conseiller en prévention si l'écart touche à la sécurité ou à la santé de personnes, et l'assureur si un dommage est possible.

## Limites

- La compétence n'enquête pas elle-même : elle structure l'analyse à partir des faits transmis. Sans preuve, la cause reste une hypothèse.
- Elle ne fixe ni sanction ni responsabilité individuelle.
- Elle ne clôt pas un dossier ; c'est l'humain responsable qui le fait.
- Les 5 pourquoi simplifient les problèmes à plusieurs causes entrelacées ; dans ce cas, utiliser Ishikawa ou découper en plusieurs dossiers.

## Exemple

Constat (client externe) : un colis de 40 pièces livré le 08/10/2026 contient 38 pièces. Exigence : bon de commande du 01/10/2026, 40 pièces. Gravité provisoire : majeure (le client ne peut pas poser).

Correction : envoi des 2 pièces manquantes en express le 09/10, prévenu par téléphone et par écrit (magasinier, fait le 09/10).

Pourquoi : (1) 2 pièces manquent car le colis a été fermé sans contrôle de comptage ; (2) le comptage est prévu à la procédure mais pas enregistré ; (3) la fiche de comptage a disparu du poste d'emballage ; (4) la dernière version n'a pas été réimprimée après le déménagement de l'atelier. Cause racine prouvée : fiche absente (photo du poste du 10/10 et témoignage daté du magasinier).

Actions : corrective, remettre la fiche et l'inclure dans le bon de préparation (responsable : responsable logistique, 20/10) ; préventive, contrôler les autres postes d'emballage (même échéance). Vérification d'efficacité le 20/01/2027 : zéro livraison incomplète sur les commandes de plus de 20 pièces, relevé par le service client.

Cas d'échec : le chef d'équipe veut écrire « cause : négligence du magasinier ». La compétence refuse : aucune preuve ne l'établit, et une personne n'est pas une cause modifiable. Elle écrit « hypothèse non retenue : faute individuelle, pas de preuve » et reprend la chaîne jusqu'à une règle ou un outil. Si le client demande un dédommagement, elle transmet la demande à l'humain responsable sans promettre de montant.

## Origine de la méthode

Tableau de décision d'ouverture, validation de la cause en cinq points, arbre de décision d'efficacité, indicateurs et
tranches d'ancienneté adaptés et traduits de github.com/alirezarezvani/claude-skills,
`ra-qm-team/skills/capa-officer/SKILL.md`, sections « CAPA Necessity Determination », « Root Cause Validation »,
« Effectiveness Determination », « Key Performance Indicators » et « Aging Analysis Categories », commit
19392f7a08264ed00486a251f5b2098321771f94, licence MIT, Copyright (c) 2025 Alireza Rezvani. Modifications : traduction,
cibles présentées comme valeurs par défaut, clôture par l'humain. Texte des licences et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.

Version 1.2.0 : ordre de décision de la destination d'un produit non conforme (étape 2) adapté et traduit de github.com/affaan-m/ECC, `skills/quality-nonconformance/SKILL.md`, « NCR Disposition Decision Logic », commit ef648e01899ba3e8dc6371642deaaf64b4477775, compétence sous licence Apache 2.0 (en-tête `license: Apache-2.0`, auteur « evos ») ; les références sectorielles américaines et automobiles ne sont pas reprises. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
