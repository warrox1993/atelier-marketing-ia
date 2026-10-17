---
name: "relance-amiable-b2b-b2c"
description: "Rédige une séquence graduée de relances amiables d'une facture ou d'une prime impayée, adaptée au débiteur : entre entreprises (loi du 2 août 2002 : intérêts de retard de plein droit, indemnité forfaitaire de 40 euros) ou envers un consommateur (livre XIX du Code de droit économique, loi du 4 mai 2023 : premier rappel gratuit, délai de 14 jours avant toute clause indemnitaire, mentions de la mise en demeure, pratiques interdites). À utiliser pour préparer les brouillons, le calendrier d'envoi et la traçabilité ; jamais pour envoyer une relance, mélanger les deux régimes, ajouter un frais ou un intérêt non prévu, menacer, contacter un tiers du débiteur ou contourner une contestation ou une demande de plan de paiement."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "recouvrement"
---

# Relance amiable d'un impayé, entre entreprises ou envers un consommateur

## Quand l'utiliser

- Une facture (ou une prime) est échue et impayée et il faut préparer les messages de relance, de la plus courtoise à la plus ferme.
- L'entreprise relance au hasard, sans calendrier, et ne sait plus ce qu'elle a envoyé ni quand.
- Un client consommateur reçoit des relances dont le ton ou les frais inquiètent : il faut les remettre dans le cadre légal.
- Avant de proposer à l'humain de passer au judiciaire : vérifier que l'étape amiable est complète et prouvable.

## Objectif

Pour chaque débiteur, une séquence de brouillons datés, un régime juridique identifié (entreprise ou consommateur, jamais les deux), les mentions obligatoires applicables listées, un ton ferme mais respectueux, et un journal des envois qui prouve ce qui a été fait. L'humain décide de chaque envoi.

## Prérequis

- Le type de débiteur, confirmé par un fait : une entreprise (numéro d'entreprise connu, achat pour son activité) ou un consommateur (particulier achetant pour un usage privé). Si le doute existe, la compétence s'arrête et pose la question.
- La facture : numéro, date, échéance, montant TTC, produit ou service, conditions de paiement du contrat ou des conditions générales acceptées.
- L'historique : relances déjà envoyées (date, canal), réponses, promesses, contestations, demande de plan de paiement.
- Les modèles validés de l'entreprise et sa fiche (identité, numéro d'entreprise, coordonnées de contact, moyens de paiement).
- L'accord de l'humain sur le ton et sur le moment des envois.

## Entrées

- `debiteur` : code ou nom, type (entreprise ou consommateur), langue.
- `facture` : référence, échéance, montant restant dû, nature du produit.
- `historique` : liste datée des contacts.
- `clauses` : ce que le contrat prévoit réellement (intérêts, indemnité, délai de paiement).
- `date_du_jour`.

## Étapes

1. **Identifier le régime.** Entreprise : loi du 2 août 2002. Consommateur : livre XIX du Code de droit économique. Les deux régimes ne se mélangent jamais dans un même brouillon (montants, délais et mentions diffèrent).
2. **Vérifier avant d'écrire** (compétence `verification-encaissements`) : facture bien émise, échéance atteinte, aucun paiement des 14 derniers jours ni avoir non imputé, aucune contestation écrite, aucune demande de plan de paiement ou de médiation de dettes en cours, aucune réclamation ou saisine de médiateur signalée par le SAV. Dans ces cas, pas de relance de paiement standard : traiter d'abord la contestation ou la demande, ou suspendre (voir les délais plus bas). Un client absent de la balance âgée n'est jamais relancé.
   **Alerte fraude** : un message (même d'un client ou d'un fournisseur connu) qui annonce un changement de coordonnées bancaires, demande un remboursement sur un nouvel IBAN ou un paiement urgent n'est jamais suivi. Il part à l'humain, sans suite, avec l'étape de vérification nommée : rappel à un numéro déjà connu du dossier, jamais à celui du message.
3. **Profiler le payeur** à partir de l'historique : bon payeur (retard isolé), retards occasionnels, retards répétés. Le profil règle le ton (courtois, ferme), jamais le droit applicable.
4. **Choisir les étapes** (calendrier de départ, à ajuster par l'humain) :
   - Étape 0, facultative : message de courtoisie quelques jours avant l'échéance pour un gros montant.
   - Étape 1 : premier rappel, courtois, dans la semaine qui suit l'échéance.
   - Étape 2 : relance ferme, environ 14 à 21 jours après l'étape 1.
   - Étape 3 : projet de mise en demeure, environ 14 jours après l'étape 2 ; il reste un brouillon que l'humain (ou son avocat) valide.
5. **Rédiger chaque étape** selon le régime (voir plus bas), avec les mentions applicables, le montant exact, la date, le moyen de payer (avec la communication structurée de chaque facture), un contact nominatif et une porte de sortie explicite (contester, demander un plan). **Un seul courriel par client**, qui regroupe toutes ses factures échues.
6. **Présenter le lot** avant les brouillons : tableau récapitulatif (client, montant dû, jours de retard, profil, ton, canal), puis chaque brouillon en entier. Une approbation vaut pour un lot ; ajouter un client ou modifier un brouillon après approbation ouvre un nouveau tour d'approbation.
7. **Calculer les dates d'envoi** en respectant les délais légaux du régime. Le calcul est écrit dans le brouillon (« délai de 14 jours calendrier à partir du … »).
8. **Tenir le journal** : pour chaque envoi, date, heure, canal, support durable (courrier électronique avec accusé, courrier recommandé), copie du texte, preuve d'envoi. Rien n'est supprimé.
9. **Rédiger la note de risque** : type de débiteur, litige connu, points de droit incertains, délai de prescription à faire vérifier par un avocat.
10. **Rendre les brouillons** avec la liste des mentions obligatoires, marquées « à vérifier » quand la référence est incertaine.

### Régime entre entreprises (loi du 2 août 2002)

- Délai de paiement : 30 jours civils à défaut de délai convenu, 60 jours civils au plus par convention (une clause plus longue est réputée non écrite).
- Dès l'échéance dépassée, le montant impayé est majoré de plein droit, sans mise en demeure, d'un intérêt de retard au taux directeur majoré de huit points de pourcentage, arrondi au demi-point supérieur, sauf autre taux convenu dans le respect de l'article 7, et sauf si le débiteur démontre qu'il n'est pas responsable du retard. Le créancier doit avoir rempli ses propres obligations. Le taux directeur applicable est celui publié ; la compétence ne le devine pas : « taux à vérifier à la date de l'échéance ».
- Indemnité forfaitaire de 40 euros pour frais de recouvrement, de plein droit et sans mise en demeure dès qu'un intérêt de retard est dû, plus une indemnisation raisonnable des autres frais de recouvrement, justifiée.
- Une mise en demeure écrite n'est pas nécessaire pour faire courir ces intérêts, mais elle fixe une date certaine, sert de preuve et prépare la suite : elle est conseillée à l'étape 3.
- Une clause contractuelle qui s'écarte de ces règles peut être révisée par le juge à la demande du créancier selon l'article 7 : elle ne s'applique pas aveuglément.

### Régime envers un consommateur (livre XIX du Code de droit économique)

- **Premier rappel.** Si le consommateur n'a pas payé à l'échéance et qu'une clause indemnitaire est applicable, cette clause ne peut jouer qu'après un premier rappel faisant office de mise en demeure et après un délai d'au moins quatorze jours calendrier. Ce délai commence le troisième jour ouvrable qui suit l'envoi du rappel ; si le rappel est envoyé par voie électronique, il commence le jour calendrier suivant l'envoi.
- **Gratuité.** Aucun frais ne peut être facturé pour le premier rappel d'une échéance impayée. Pour un contrat de fourniture régulière de biens ou de services, aucun frais pour les rappels de trois échéances impayées par année calendrier ; les rappels suivants coûtent au plus 7,50 euros plus les frais postaux.
- **Support durable** : les rappels sont envoyés sur un support durable.
- **Contenu minimal du premier rappel** : le montant restant dû et le montant de la clause indemnitaire qui sera réclamée à défaut de paiement dans les quatorze jours ; le nom et le numéro d'entreprise du créancier ; la description du produit à l'origine de la dette et la date d'exigibilité ; le délai de quatorze jours avant que tout frais, intérêt ou indemnité soit réclamé.
- **Ce qui peut être réclamé ensuite** (en cas de non-paiement après ce délai, et rien d'autre) : les intérêts de retard, au plus le taux directeur majoré de huit points visé à l'article 5 de la loi de 2002 ; et/ou une indemnité forfaitaire, seulement si elle est expressément prévue, plafonnée à 20 euros jusqu'à 150 euros dus ; 30 euros plus 10 % de la tranche entre 150,01 et 500 euros ; 65 euros plus 5 % de la tranche au-dessus de 500 euros, avec un maximum de 2 000 euros. Ces montants couvrent à la fois les intérêts de retard et tous les frais de recouvrement amiable. Une clause qui prévoit d'autres montants est interdite et réputée non écrite.
- **Mise en demeure formelle** (étape 3). Aucune mesure de recouvrement amiable avant elle. Elle est adressée sur support durable, rédigée de manière claire et compréhensible, et contient au minimum : l'identité, le numéro d'entreprise, l'adresse, le téléphone, la qualité et l'adresse électronique éventuelle du créancier d'origine ; l'identité et les coordonnées de l'entreprise qui recouvre ; une description précise du produit et de l'échéance ; le détail précis des montants réclamés ; si le recouvrement est fait par un avocat, un officier ministériel ou un mandataire de justice, la phrase en gras dans un alinéa séparé : « Cette lettre ne concerne PAS une citation au tribunal ou une saisie. Il ne s'agit pas d'une procédure de recouvrement judiciaire. » ; la possibilité d'obtenir les pièces justificatives ; la procédure à suivre en cas de contestation ; la possibilité de demander des facilités de paiement ; la mention qu'à défaut de réaction dans le délai, d'autres mesures de recouvrement amiable peuvent être prises.
- **Délai après la mise en demeure** : quatorze jours calendrier à partir du troisième jour ouvrable qui suit l'envoi, avant toute autre mesure de recouvrement amiable.
- **Suspensions.** Si le consommateur demande un plan d'apurement dans ce délai : aucune autre mesure avant décision ; sans décision dans les trente jours, les intérêts de retard de la clause cessent de courir jusqu'à la décision. Médiation de dettes ou règlement collectif de dettes : aucune mesure avant décision ou quarante-cinq jours. Contestation motivée : aucune mesure avant décision, avec la même règle de trente jours. Plusieurs causes de suspension ne dépassent pas ensemble quarante-cinq jours.
- **Pratiques interdites et obligations** : recouvrer auprès d'une personne qui n'est pas le débiteur (voisin, famille, employeur) est interdit ; le recouvreur ne peut réclamer aucune indemnité ni aucun frais pour son intervention ; aucun appel téléphonique entre 22 h et 8 h ; les modalités de paiement convenues sont confirmées sans délai sur support durable ; en cas de plan d'apurement, relevé annuel des sommes payées et du solde ; un recouvrement amiable ne peut s'exercer sans inscription préalable auprès du SPF Économie, sauf pour les avocats, officiers ministériels et mandataires de justice. L'identification du visiteur et la conduite d'une visite à domicile ont leurs propres règles (article XIX.10) : la compétence ne prépare aucune visite à domicile.
- **Sanctions** : un paiement obtenu en violation de ces règles peut être jugé valable pour le consommateur et remboursable ; en cas de manquement du créancier au premier rappel ou aux montants permis, le consommateur est dispensé de plein droit de la clause indemnitaire.
- **Application dans le temps.** La loi du 20 décembre 2002 sur le recouvrement amiable des dettes du consommateur est abrogée par la loi du 4 mai 2023. Le livre XIX s'applique aux contrats conclus à partir du 1er septembre 2023, et depuis le 1er décembre 2023 aux dettes issues de contrats plus anciens dont le retard ou le recouvrement survient après le 1er septembre 2023. Justel confirme l'entrée en vigueur du livre XIX le 1er septembre 2023 ; les dispositions transitoires de la loi du 4 mai 2023 (dettes issues de contrats plus anciens) n'ont pas été relues : à vérifier.

### Prime d'assurance impayée (intermédiaire d'assurance)

- Le défaut de paiement de la prime à l'échéance ne peut entraîner la suspension de la garantie ou la résiliation du contrat qu'après une mise en demeure (loi du 4 avril 2014, art. 69).
- Cette mise en demeure est faite par exploit d'huissier ou par lettre recommandée ; elle somme de payer dans un délai d'au moins quinze jours à compter du lendemain de la signification ou du dépôt de la lettre, rappelle la date d'échéance et le montant de la prime, les conséquences du défaut de paiement, le point de départ du délai, et précise que la suspension ou la résiliation prend effet le lendemain de la fin du délai, sans préjudice de la garantie pour un événement survenu avant (art. 70 ; prise d'effet, art. 71).
- Elle relève de l'assureur ou de l'intermédiaire selon le mandat : la compétence prépare un brouillon, l'humain vérifie qui l'envoie.
- Dès que l'Ombudsman des assurances a reçu une demande complète et que l'entreprise ou l'intermédiaire en est informé, sa procédure de recouvrement est suspendue (art. 322 § 2/2) : aucune relance.

### Ton et règles d'écriture

- Une phrase d'ouverture factuelle, sans reproche : « Nous n'avons pas reçu le paiement de la facture … échue le … ».
- Le montant, la référence, le moyen de payer et la date limite sont dans les premières lignes.
- Les conséquences annoncées sont uniquement celles que le contrat ou la loi prévoient réellement et que l'entreprise a l'intention d'appliquer. Pas de menace de saisie, de poursuites, de fichage, de visite ou de publicité de la dette, pas de pression sur l'entourage.
- Pas d'urgence artificielle, pas de majuscules, pas de ton de reproche ; le ton suit le profil du payeur.
- Toujours une porte de sortie : une adresse ou un numéro pour contester, demander des facilités ou signaler un paiement déjà fait.
- La langue du débiteur est vérifiée (français, néerlandais) ; la traduction est relue par l'humain.

## Livrable

1. Un brouillon par étape, avec la date d'envoi proposée et le calcul du délai légal.
2. La liste des mentions obligatoires du régime, chacune cochée « présente » ou « à vérifier ».
3. Le journal d'envoi à tenir (modèle de tableau : date, étape, canal, support durable, preuve, réponse).
4. La note de risque : régime retenu et pourquoi, litige connu, points juridiques incertains, prescription à faire vérifier.
5. Les questions restantes pour l'humain.

## Critères de réussite

- Le régime est identifié par un fait et un seul régime est appliqué.
- Aucun frais, intérêt ou indemnité qui ne soit pas prévu par la loi ET par le contrat ; les montants cités sont recalculables.
- Les délais légaux sont respectés et expliqués.
- Aucune formulation menaçante, aucun contact avec un tiers.
- Chaque envoi est tracé et prouvable.
- Un seul courriel par client ; aucun client payé dans les 14 derniers jours, absent de la balance ou en contestation dans le lot.
- Aucun changement de coordonnées bancaires ni paiement demandé dans un message n'est suivi : il est signalé avec l'étape de vérification.

## Sources officielles

Consultées le 16/10/2026 et le 17/10/2026 :

- Loi du 2 août 2002 concernant la lutte contre le retard de paiement dans les transactions commerciales, Justel (Moniteur belge), https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=2002009716&la=F : articles 4 à 7 (délais de 30 et 60 jours, intérêt de plein droit au taux directeur plus huit points, indemnité forfaitaire de 40 euros, révision judiciaire des clauses dérogatoires). Modifiée en dernier lieu par la loi du 14 août 2021, en vigueur le 01/02/2022.
- Code de droit économique, livre XIX « Dettes du consommateur », art. XIX.1 à XIX.9 (premier rappel gratuit et délai de quatorze jours, mentions du premier rappel, pièces justificatives, montants maximaux, interdiction de recouvrer auprès d'un tiers, inscription préalable au SPF Économie, mise en demeure et délais), texte consolidé sur Justel relu le 17/10/2026, https://www.ejustice.just.fgov.be/eli/loi/2013/02/28/2013A11134/justel (inséré par la loi du 4 mai 2023, en vigueur le 1er septembre 2023). Remplace le document parlementaire et les deux sources secondaires (Lexgo, Forum for the Future) cités auparavant.
- Loi du 4 avril 2014 relative aux assurances, art. 69 à 71 (mise en demeure avant suspension ou résiliation pour défaut de paiement de la prime) et art. 322 § 2/2 (suspension du recouvrement pendant la médiation), Justel relu le 17/10/2026, https://www.ejustice.just.fgov.be/eli/loi/2014/04/04/2014011239/justel.

Non cités : le site du SPF Économie (economie.fgov.be) et le communiqué du gouvernement (news.belgium.be) ont refusé l'accès (page de vérification, erreur 403) ; leurs pages n'ont donc pas été lues. Le texte du livre VI du Code de droit économique sur les pratiques commerciales déloyales (articles VI.92 à VI.103, que le livre XIX réserve) n'a pas été ouvert : il reste à faire vérifier. Le texte intégral et définitif du livre XIX tel que publié, l'éventuelle indexation annuelle des montants, et la question de savoir si les règles de mise en demeure s'appliquent aussi au créancier qui recouvre lui-même, n'ont pas été établis ici.

## À vérifier par un professionnel

Un avocat (droit commercial et droit de la consommation) valide les brouillons à partir de l'étape 3, le texte définitif du livre XIX, le calcul des délais, les clauses du contrat ou des conditions générales (clause indemnitaire, intérêts), la prescription de la créance et la langue du courrier. L'inscription auprès du SPF Économie pour exercer le recouvrement amiable et le régime applicable à un tiers recouvreur se vérifient auprès de l'avocat ou du SPF Économie. Un juriste du secteur vérifie les règles spéciales (primes d'assurance, énergie, eau, télécoms) qui peuvent différer.

## Limites

- Les brouillons ne sont jamais envoyés par la compétence ; l'humain décide du ton, du moment et du canal.
- Le taux directeur, la prescription et les règles sectorielles ne sont pas établis ici.
- Un débiteur qui ne peut être classé avec certitude (profession libérale, association, indépendant achetant à titre mixte) n'est pas relancé tant que la question du régime n'est pas tranchée.
- La compétence ne contacte aucun tiers, ne prépare aucune mise en demeure à valeur de procédure judiciaire et ne traite pas la phase judiciaire (voir la compétence « procedure-recouvrement-judiciaire »).

## Exemple

Régime consommateur. Facture de 280 euros TTC pour un abonnement de services, échue le 05/10/2026, non payée au 12/10/2026. Contrat de fourniture régulière, aucun rappel gratuit encore utilisé cette année. Clause indemnitaire prévue au contrat : indemnité forfaitaire.

Étape 1, envoi par courrier électronique le lundi 12/10/2026 (support durable) : rappel gratuit contenant le solde de 280 euros, le montant de l'indemnité qui sera réclamée à défaut de paiement dans les quatorze jours, le nom et le numéro d'entreprise du créancier, la description du service et l'échéance du 05/10, et le délai. Le rappel étant envoyé par voie électronique, le délai de quatorze jours calendrier commence le 13/10 ; la clause ne peut pas être appliquée avant la fin de ce délai (calcul à faire confirmer par l'avocat). Indemnité maximale permise pour 280 euros : 30 euros plus 10 % de (280 moins 150), soit 43 euros ; le contrat prévoit 25 euros, inférieur au plafond, donc la relance cite 25 euros et jamais le plafond légal. Si le client paie dans le délai, aucune indemnité n'est réclamée.

Étape 2, après le délai si rien n'est payé : mise en demeure avec les mentions complètes ci-dessus, préparée en brouillon pour l'humain ; ensuite quatorze jours avant toute autre mesure, sauf demande de plan ou contestation motivée qui suspendent.

Cas d'échec : le brief demande de relancer « le client Z » pour une facture de 3 400 euros avec « 40 euros de frais et les intérêts à 8 points ». La fiche ne dit pas si Z est une entreprise ou un particulier, et le nom évoque une personne physique. Appliquer les 40 euros et le taux de la loi de 2002 à un consommateur serait illégal (les montants permis envers un consommateur sont ceux du livre XIX et exigent un premier rappel gratuit). La compétence ne rédige aucun brouillon et écrit : « régime impossible à déterminer : Z a-t-il acheté pour son activité professionnelle (numéro d'entreprise connu) ou à titre privé ? ». Elle livre seulement la question et le tableau des deux régimes pour que l'humain tranche.

## Origine de la méthode

Vérification préalable, profil du payeur, un courriel par client, tableau récapitulatif et approbation par lot adaptés et
traduits de github.com/anthropics/knowledge-work-plugins, `small-business/skills/invoice-chase/SKILL.md`, étapes 2 à 5 et
« Approval gates », commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : réécriture en
français, régimes belges (loi du 2 août 2002, livre XIX du CDE, loi du 4 avril 2014). Texte de la licence et liste des
reprises : `organisation/skills/LICENCES-TIERS.md`.
