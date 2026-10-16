---
name: "courrier-officiel"
description: "Prépare les courriers et courriels formels d'une PME belge (réponse à une administration, mise en demeure simple, envoi recommandé, relance formelle) avec les mentions obligatoires d'une personne morale sur ses documents (dénomination, forme, siège, numéro d'entreprise, RPM et tribunal) et les durées de conservation à appliquer à l'original et à la preuve d'envoi. À utiliser pour rédiger un brouillon destiné à être relu, signé et envoyé par un humain ; jamais pour envoyer, signer, qualifier juridiquement un litige, chiffrer des intérêts de retard ou répondre seul à un courrier sensible (recours, plainte, demande RGPD, courrier d'autorité)."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "administratif"
---

# Courrier officiel d'une PME belge

## Quand l'utiliser

- Une administration (fiscale, sociale, communale, régionale) écrit à l'entreprise et attend une réponse écrite.
- Un client ou un fournisseur doit recevoir un courrier formel : relance ferme, mise en demeure simple, contestation, résiliation.
- Un modèle de papier à en-tête ou de signature d'e-mail doit être vérifié : mentions manquantes ou périmées.
- Il faut décider comment prouver l'envoi (recommandé, e-mail avec accusé) et combien de temps garder le dossier.

## Objectif

Un brouillon sobre, complet et vérifiable : en-tête conforme, références du dossier, faits datés, demande précise, délai proposé, pièces jointes listées. L'humain relit, signe et envoie. Tout ce qui est inconnu est écrit « information manquante » avec la question à poser, jamais comblé.

## Prérequis

- La fiche de l'entreprise : dénomination exacte, forme légale, adresse du siège, numéro d'entreprise, tribunal du siège, adresse électronique et site web, mention de liquidation le cas échéant.
- Le courrier reçu (ou l'échange précédent), avec sa date de réception.
- Le nom et la fonction de la personne qui signera.
- Si l'entreprise est un indépendant en personne physique : les mentions de l'article ci-dessous visent les personnes morales ; ses mentions propres sont à faire confirmer (voir « À vérifier »).

## Entrées

- `destinataire` : nom, fonction, adresse postale ou électronique (telle que fournie, jamais devinée).
- `objet` et `reference` : numéro de dossier, de facture ou de référence de l'administration.
- `faits` : liste datée et sourcée (pièce, date, montant hors TVA ou TVA comprise précisé).
- `demande` : ce que l'entreprise veut obtenir, et pour quand.
- `mode_envoi` : courriel, courrier simple, recommandé (voir étapes).

## Étapes

1. **Lire le courrier reçu** : expéditeur, objet, référence, date du courrier et date de réception, délai fixé par l'expéditeur. Noter le délai en tête de brouillon. Si le courrier est sensible (voir plus bas), s'arrêter et remonter au coordinateur.
2. **Poser les faits** dans l'ordre chronologique, un fait par ligne, chacun avec sa pièce. Un fait sans pièce est marqué « à confirmer ».
3. **Formuler la demande** en une phrase, puis le délai proposé pour répondre (par exemple « dans les 15 jours calendrier de la réception du présent courrier »). Pas de menace dont l'entreprise n'a pas décidé l'exécution.
4. **Choisir le ton** : réponse à une administration = neutre, factuel, numéroté ; relance = courtois et ferme ; mise en demeure simple = faits, montant exact, échéance dépassée, délai de régularisation, conséquence annoncée sans la qualifier juridiquement.
5. **Compléter l'en-tête et le pied** avec les mentions obligatoires (tableau ci-dessous).
6. **Choisir le mode d'envoi** selon l'enjeu : courriel pour le courant ; recommandé (avec accusé de réception) quand la date de réception comptera (mise en demeure, résiliation, contestation, réponse à une autorité dont le délai court). Garder la preuve d'envoi avec le dossier.
7. **Lister les pièces jointes** et vérifier qu'elles ne contiennent que le nécessaire (minimisation : retirer ou masquer les données personnelles sans rapport).
8. **Établir la fiche de classement** : nom de fichier, durée de conservation proposée, lien vers la compétence `classement-archivage`.
9. **Relire contre la liste de contrôle** : orthographe des noms, montants et dates recoupés avec les pièces, aucun engagement non validé, aucun tiret cadratin, signature laissée vierge.

### Mentions obligatoires sur les documents d'une personne morale

L'article 2:20 du Code des sociétés et des associations (CSA) impose que « tous les actes, factures, annonces, publications, lettres, notes de commande, sites internet et autres documents, sous forme électronique ou non », émanant d'une personne morale, contiennent :

| N° | Mention | Exemple de forme |
| --- | --- | --- |
| 1 | Dénomination de la personne morale | Dupont Menuiserie |
| 2 | Forme légale, en entier ou en abrégé | SRL |
| 3 | Indication précise du siège | rue de l'Exemple 12 bte 3, 4000 Liège |
| 4 | Numéro d'entreprise | BE 0123.456.789 (exemple fictif) |
| 5 | Les termes « registre des personnes morales » ou « RPM », suivis du tribunal du siège | RPM Liège, division Liège (tribunal de l'entreprise du siège) |
| 6 | Le cas échéant, adresse électronique et site internet | contact@exemple.invalid, www.exemple.be |
| 7 | Le cas échéant, l'indication de liquidation | « en liquidation » |

Précisions utiles :

- Cela vaut pour le courrier, le courriel (donc la signature automatique) et le site, pas seulement pour la facture.
- Si une société anonyme mentionne son capital, ce doit être le capital libéré tel qu'il résulte du dernier bilan ; si ce capital n'est plus intact, c'est l'actif net du dernier bilan qui est mentionné (art. 2:21). Dans le doute, ne pas écrire le capital.
- Une succursale belge d'une société étrangère a une liste propre (art. 2:29) : adresse de la succursale, registre étranger et numéro d'immatriculation en plus.

### Courriers sensibles : ne pas répondre seul

Remonter sans attendre, avec la date de réception et le délai affiché, tout courrier qui est : une mise en demeure reçue, un recours, une plainte, une demande d'une personne sur ses données, un courrier d'une autorité de contrôle, une convocation judiciaire. Pour une demande d'une personne sur ses données (accès, effacement), le RGPD (art. 12, par. 3) impose de répondre « dans les meilleurs délais et en tout état de cause dans un délai d'un mois à compter de la réception », prolongeable de deux mois si la complexité l'exige, avec information de la personne dans le premier mois. Le brouillon n'est préparé que sur instruction humaine.

### Durées de conservation applicables au courrier

| Pièce | Durée | Point de départ | Base |
| --- | --- | --- | --- |
| Courrier de gestion courante (devis, relances) | 3 ans proposés | date du courrier | pratique de prudence, à valider par le comptable |
| Courrier justifiant une écriture comptable (facture, note de crédit, contestation d'une facture) | 7 ans | livres : 1er janvier suivant la clôture ; pièces : pas de point de départ fixé par le texte, prendre la date d'émission par prudence | Code de droit économique, art. III.86 et III.88 |
| Courrier et pièces fiscaux (déclarations, réponses du fisc) | 7 ans | période imposable | art. 315 CIR 92, délai ramené à 7 ans par la loi du 18/12/2025 |
| Courrier de personnel (contrats, avertissements) | 5 ans | fin du contrat | AR du 8/8/1980 et AR n° 5 du 23/10/1978 (documents sociaux) |
| Courrier RGPD (demande d'une personne et réponse) | le temps nécessaire à la preuve de conformité, à fixer par le responsable du traitement | date de clôture de la demande | RGPD art. 5 (limitation de la conservation) |

Ces durées sont des minimums d'obligation ; la durée finale d'un document précis est décidée par l'humain avec le comptable ou le juriste. Cette compétence ne détruit rien.

## Livrable

Un fichier par courrier :

1. **Brouillon** prêt à relire : en-tête avec mentions, objet, références, corps, formule de politesse, bloc de signature vide.
2. **Fiche d'accompagnement** : délai à respecter (date), mode d'envoi proposé et raison, pièces jointes, faits à confirmer, questions posées à l'humain, classement et durée proposés.
3. Si une langue autre que le français est demandée : version dans cette langue, relecture signalée.

## Critères de réussite

- Les sept points de l'article 2:20 CSA sont présents ou signalés « information manquante ».
- Chaque fait, chaque montant et chaque date est relié à une pièce.
- Le délai de réponse est repris en tête de la fiche, avec la date de réception.
- Aucune menace, aucun intérêt ou indemnité chiffré sans validation ; aucun engagement de prix ou de rendez-vous.
- Le brouillon ne contient que les données personnelles nécessaires.
- Le courrier n'a été ni envoyé, ni signé, ni classé comme définitif.

## Sources officielles

Consultées le 16/10/2026 :

- « Loi du 23 mars 2019 introduisant le Code des sociétés et des associations et portant des dispositions diverses », texte coordonné affiché par Etaamb (Moniteur belge), https://etaamb.openjustice.be/fr/loi-du-23-mars-2019_n2019040586.html : art. 2:20 (mentions sur les documents), art. 2:21 (capital), art. 2:29 (succursales), art. 3:1 et 3:10 (comptes annuels).
- « Conservation des livres comptables - Article III.88 CDE », Commission des normes comptables, https://www.cnc-cbn.be/fr/node/189 : livres conservés sept ans ; pièces justificatives classées méthodiquement ; trois ans pour les pièces non destinées à faire preuve auprès des tiers.
- « Règlement (UE) 2016/679 (RGPD) », EUR-Lex, https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=fr : art. 5 (minimisation, limitation de la conservation) et art. 12, par. 3 (délai d'un mois, prolongation de deux mois).
- « Délai de conservation des archives », Institut des Réviseurs d'Entreprises, 26 février 2025, https://www.ibr-ire.be/fr/actualites/news-detail/d-lai-de-conservation-des-archives : 7 ans pour les livres et pièces comptables (art. III.86 et III.88 CDE), sans point de départ défini pour les pièces ; cette page décrit aussi l'ancien délai fiscal de 10 ans, depuis ramené à 7 ans (voir la circulaire ci-dessous).
- « Circulaire 2026/C/31 relative aux modifications apportées au délai de conservation, au délai de prescription en cas de fraude... », Forum for the Future, https://blog.forumforthefuture.be/fr/article/circulaire-2026c31-relative-aux-modifications-apportees-au-delai-de-conservation-au-delai-de-prescription-en-cas-de-fraude-et-a-lobligation-de-notification-prealable-en-cas-dapplication-du-delai-de-prescription-en-cas-de-fraude/30286 : délai de conservation en matière de TVA ramené de dix à sept ans par la loi du 18/12/2025, avec effet rétroactif depuis 2023. Source de seconde main : le texte officiel est à faire contrôler.
- « Délais et lieux de conservation des documents », BDO Belgique, avril 2026, https://www.bdo.be/getattachment/c4bce7e0-214e-42be-bf74-04e8d67109f6/Retention-period-and-locations-for-documents_FR-final-(1).pdf?lang=fr-BE : tableaux de durées comptables (7 ans), fiscales, sociales (5 ans) et vie privée. Source de cabinet, non officielle.

Les sites des services publics fédéraux (SPF Finances, SPF Economie) étaient protégés par un test anti-robot le 16/10/2026 : ils ne sont pas cités. Les règles d'envoi recommandé et de preuve ne reposent sur aucune source consultée : elles sont des pratiques de prudence.

## À vérifier par un professionnel

- Le contenu d'une mise en demeure, d'une résiliation ou de toute réponse qui engage l'entreprise (taux et indemnité de retard, délais de recours, valeur probante de l'envoi) : avocat ou juriste d'entreprise.
- Les durées de conservation et le classement des pièces comptables et fiscales : expert-comptable ou comptable de l'entreprise.
- Les mentions d'un indépendant en personne physique ou d'une forme non couverte par le CSA : comptable ou guichet d'entreprises.
- Toute demande d'une personne sur ses données : délégué à la protection des données ou conseil en RGPD.

## Limites

- La compétence rédige, elle ne qualifie pas : elle ne dit pas si un manquement est établi ni si une prescription est acquise.
- Elle ne calcule pas d'intérêts ni d'indemnités.
- Elle ne vérifie pas l'existence ni la validité d'une adresse de destinataire.
- Les modèles sont génériques ; le ton d'un secteur réglementé (assurance, santé, finance) demande une relecture spécialisée.

## Exemple

Une société reçoit le 12/10/2026 une lettre d'une commune réclamant un document dans un délai de 15 jours. Le brouillon reprend en tête : « Réponse attendue avant le 27/10/2026 (15 jours calendrier à compter de la réception du 12/10) ; sensibilité : normale ; envoi proposé : recommandé car la date de réception comptera ». Le corps cite la référence de la commune, liste les pièces jointes et laisse la signature vide. Le bas de page porte les sept mentions de l'article 2:20 ; le capital n'est pas mentionné (inutile et à risque).

Cas d'échec : le courrier reçu est une mise en demeure d'un fournisseur qui annonce une action en justice, et l'humain demande « une réponse ferme qui conteste tout ». La compétence ne rédige pas de réponse de fond : elle prépare la fiche « courrier sensible » (dates, pièces, demande de l'humain) et écrit « qualification juridique et stratégie de réponse : à demander à un avocat ». Elle peut, si l'humain le demande, préparer un simple accusé de réception neutre sans reconnaissance de dette.
