---
name: "classement-archivage"
description: "Conçoit et applique le plan de classement, les règles de nommage et le calendrier de conservation des documents d'une PME belge : pièces comptables et fiscales (7 ans), documents sociaux (5 ans), documents de sociétés (durée de vie plus 5 ans), contrats et courriers, avec les principes du RGPD (minimisation, limitation de la conservation, accès sur besoin). À utiliser pour créer ou auditer une arborescence, nommer des fichiers, dresser un tableau de conservation ou préparer une proposition d'élimination ; jamais pour détruire, déplacer ou renommer un original, ni pour fixer seul une durée de conservation, ni pour trier des données de santé ou judiciaires sans instruction humaine écrite."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "administratif"
---

# Classement et archivage d'une PME belge

## Quand l'utiliser

- L'entreprise n'a pas de plan de classement, ou chaque service range à sa façon.
- Des dossiers partagés débordent et l'on ne sait pas ce qui peut être éliminé.
- Un contrôle (fiscal, social, d'un client, de la protection des données) approche et il faut retrouver des pièces.
- Un nouveau type de document apparaît (facture électronique, contrat signé en ligne) et il faut décider où et combien de temps le garder.

## Objectif

Un plan simple, stable et documenté : on sait où ranger, comment nommer, qui y accède, combien de temps garder et ce qui se passe à l'échéance. La compétence propose ; l'humain valide et exécute. Les originaux ne sont jamais déplacés, renommés ni supprimés par l'agent.

## Prérequis

- L'inventaire des espaces de stockage (serveur, nuage, boîtes de courriel, papier) et des logiciels qui génèrent des documents.
- Les services de l'entreprise et leurs responsables.
- La fiche de l'entreprise : forme juridique, présence de personnel, secteur (certains secteurs ont des durées propres : santé, construction, assurance, finance).
- Le registre des traitements de données personnelles, s'il existe.

## Entrées

- `inventaire` : liste des types de documents avec propriétaire, volume approximatif, support (papier ou numérique).
- `contraintes` : exigences de clients, de contrats ou de sectoriel connues.
- `existant` : arborescence actuelle, si elle existe.

## Étapes

Avant de créer un plan, une règle ou une procédure, chercher dans les connaissances et les documents du service s'il en existe déjà une version : la mettre à jour plutôt que créer un doublon, et noter la version remplacée.

1. **Inventorier par type de document**, pas par dossier : facture de vente, facture d'achat, extrait bancaire, contrat de travail, fiche de paie, procès-verbal d'assemblée, contrat client, courrier officiel, etc.
2. **Attribuer une classe** à chaque type (tableau « Classes et durées »). En cas de doute entre deux classes, retenir la durée la plus longue en attendant l'avis du comptable.
3. **Construire le plan de classement** sur trois niveaux au plus (voir « Plan type »). Un niveau supplémentaire doit être justifié.
4. **Fixer le nommage** : `AAAA-MM-JJ_type_tiers_reference_vN`, sans espace ni accent, date au format ISO, tiers en forme courte, version seulement pour les documents qui évoluent. Exemple : `2026-10-05_facture-achat_fournisseur-x_F2026-0412.pdf`.
5. **Définir les accès** : qui lit, qui écrit, qui supprime. Les documents sociaux et de santé sont restreints à la fonction qui en a besoin ; la comptabilité n'est pas ouverte à tous.
6. **Dater le calendrier de conservation** : pour chaque classe, la durée, le point de départ, la date d'échéance calculée sur un exemple, l'action à l'échéance (élimination proposée, révision, conservation prolongée).
7. **Traiter les données personnelles** : pour chaque classe qui en contient, vérifier finalité, durée justifiée, personnes habilitées ; signaler tout nouveau traitement pour inscription au registre (art. 30 RGPD) sans modifier le registre.
8. **Préparer la procédure d'élimination** : liste des documents échus, vérification d'une conservation prolongée (litige en cours, contrôle, perte reportée en comptabilité), validation écrite de l'humain, journal de destruction. L'agent ne détruit rien.
9. **Livrer** le plan, le tableau, les règles et une liste des points ouverts.

### Classes et durées de conservation

Ces durées sont des minimums légaux de principe ; elles ne couvrent pas tous les cas (immobilier, biens d'investissement, secteurs réglementés).

| Classe | Exemples | Durée | Point de départ | Base |
| --- | --- | --- | --- | --- |
| Livres comptables | journal central, journaux auxiliaires, livre d'inventaire | 7 ans | 1er janvier de l'année suivant la clôture | Code de droit économique (CDE) art. III.88 |
| Pièces justificatives comptables | factures de vente et d'achat, notes de crédit, extraits bancaires | 7 ans | le texte ne fixe pas de point de départ pour les pièces : prendre l'émission ou la clôture, la date la plus tardive des deux par prudence | CDE art. III.86 et III.88 |
| Pièces non destinées à faire preuve auprès des tiers | documents internes | 3 ans | date du document | CDE art. III.88 (exception mentionnée par la CNC) |
| Livres et documents fiscaux (impôts sur les revenus) | tout ce qui sert à établir l'impôt | 7 ans | fin de la période imposable | art. 315 CIR 92, ramené de 10 à 7 ans par la loi du 18/12/2025 |
| TVA | factures, livres et pièces TVA | 7 ans en règle générale ; plus long pour les biens d'investissement (révision de 15 ou 25 ans pour l'immobilier) | 1er janvier suivant l'émission | art. 60 Code TVA, ramené de 10 à 7 ans par la loi du 18/12/2025 |
| Documents sociaux | contrats de travail, compte individuel, conventions diverses, DmfA | 5 ans | fin d'exécution du contrat ou limite d'envoi de la déclaration, selon le document | AR du 8/8/1980, AR n° 5 du 23/10/1978 |
| Déclaration Dimona | copie de la déclaration | 6 mois | réception | tableau du cabinet cité en source |
| Règlement de travail | version en vigueur | tant que l'entreprise emploie du personnel | n/a | loi du 8/4/1965 |
| Actes et décisions des sociétés | statuts, procès-verbaux d'assemblée et de conseil, registre des titres | durée de vie de la société plus 5 ans après clôture ou liquidation | clôture de la liquidation | tableau du cabinet cité en source ; les statuts et comptes sont aussi publics |
| Lutte contre le blanchiment | pièces d'identification de clients des professions soumises | 10 ans | fin de la relation | loi du 18/9/2017 (professions concernées seulement) |
| Vidéosurveillance | enregistrements | 1 mois maximum, plus long en cas d'incident | enregistrement | loi du 21/3/2007 |
| Candidatures non retenues, boîte mail d'un ancien salarié | dossiers de recrutement, courriels | pas de durée légale : le temps nécessaire à la finalité ; l'autorité de protection des données retient 1 à 3 mois pour la boîte d'un ancien salarié | départ ou clôture du recrutement | principe de limitation du RGPD art. 5 |

Documents sans durée légale (contrats clients, offres, courriers, supports commerciaux) : proposer une durée en fonction du délai de prescription ou de garantie du contrat, à faire valider par le juriste ; sans avis, appliquer la durée comptable de 7 ans aux pièces qui justifient une écriture.

Règle de prudence : un document sous litige, sous contrôle ou lié à une perte reportée en comptabilité reste conservé au-delà de la durée de la classe. La perte reportée permet à l'administration d'examiner l'année d'origine au-delà des délais ordinaires.

### Plan type

```
01_Administration-societe      (statuts, PV, registre des titres, assurances, licences)
02_Comptabilite-fiscalite      (ventes, achats, banque, TVA, impots, comptes annuels)
03_Personnel                   (acces restreint : contrats, paie, absences)
04_Clients-commercial          (contrats, offres, correspondance)
05_Fournisseurs-achats         (contrats, commandes)
06_Courrier-officiel           (administrations, recommandes)
07_Protection-donnees          (registre, demandes de personnes, sous-traitants)
99_A-trier                     (vidé chaque mois, aucun document au-delà de 30 jours)
```

Sous chaque dossier : un dossier par année (comptable ou civile, toujours la même), puis éventuellement un type. Pas plus de trois niveaux.

### Protection des données dans l'archivage

- Minimisation (RGPD art. 5, par. 1, point c) : ne garder que des données adéquates, pertinentes et limitées à ce qui est nécessaire ; ne pas copier une carte d'identité, un certificat médical ou un dossier complet quand un extrait suffit.
- Limitation de la conservation (point e) : durée fixée, justifiée et revue ; ce que la loi n'impose pas de garder est éliminé quand la finalité est atteinte.
- Sécurité et confidentialité (point f) : accès par fonction, journalisation, sauvegarde séparée, chiffrement des supports qui sortent des locaux.
- Registre des activités de traitement (art. 30) : l'article 30, par. 5 prévoit un allègement pour les organisations de moins de 250 personnes, assorti d'exceptions dont le texte exact est à faire lire par un juriste. Dans le doute, tenir un registre.
- Données de santé, judiciaires ou autres données sensibles : interdites par défaut ; traitées seulement sur instruction humaine écrite, avec l'extrait nécessaire.

## Livrable

1. **Plan de classement** (arborescence commentée).
2. **Règles de nommage** avec dix exemples tirés des types réels de l'entreprise.
3. **Tableau de conservation** : classe, durée, point de départ, base, action à l'échéance, responsable proposé.
4. **Matrice d'accès** (fonction, lecture, écriture, suppression).
5. **Liste d'élimination proposée** (si demandée) : document, date d'échéance, vérifications faites, validation à obtenir.
6. **Points ouverts** : durées à confirmer, nouveaux traitements à inscrire au registre.

## Critères de réussite

- Chaque type de document a une classe, une durée, un point de départ et une base légale ou la mention « durée à décider ».
- Un nom de fichier se déduit des règles sans consulter l'auteur.
- Aucun document d'origine n'a été déplacé, renommé ou supprimé ; les propositions sont des listes.
- Les documents du personnel et de santé ont un accès restreint.
- Un contrôleur peut retrouver une facture d'achat de l'année N-5 en moins de deux minutes à partir du plan.

## Sources officielles

Consultées le 16/10/2026 :

- « Conservation des livres comptables - Article III.88 CDE », Commission des normes comptables, https://www.cnc-cbn.be/fr/node/189 : sept ans pour les livres, à compter du 1er janvier de l'année suivant la clôture ; pièces justificatives en original ou en copie, classées méthodiquement ; trois ans pour les pièces non destinées à faire preuve auprès des tiers ; supports qui garantissent inaltérabilité et accessibilité.
- « Délai de conservation des archives », Institut des Réviseurs d'Entreprises, 26 février 2025, https://www.ibr-ire.be/fr/actualites/news-detail/d-lai-de-conservation-des-archives : 7 ans comptable (art. III.86 et III.88 CDE), absence de point de départ défini pour les pièces ; contexte du passage fiscal à 10 ans, depuis abrogé.
- « Circulaire 2026/C/31 relative aux modifications apportées au délai de conservation... », Forum for the Future, https://blog.forumforthefuture.be/fr/article/circulaire-2026c31-relative-aux-modifications-apportees-au-delai-de-conservation-au-delai-de-prescription-en-cas-de-fraude-et-a-lobligation-de-notification-prealable-en-cas-dapplication-du-delai-de-prescription-en-cas-de-fraude/30286 : loi du 18/12/2025 (publiée le 30/12/2025), art. 60 du Code TVA, délai de conservation TVA ramené de 10 à 7 ans avec effet rétroactif depuis 2023. Source de seconde main.
- « Délais fiscaux 2026 : une complexité ajustée... vraiment ? », Deg & Partners, https://blog.degandpartners.com/fr/article/delais-fiscaux-2026-une-complexite-ajusteevraiment-/30806 : conservation ramenée de 10 à 7 ans, exception pour la perte reportée. Source de seconde main.
- « Délais et lieux de conservation des documents », BDO Belgique, avril 2026, https://www.bdo.be/getattachment/c4bce7e0-214e-42be-bf74-04e8d67109f6/Retention-period-and-locations-for-documents_FR-final-(1).pdf?lang=fr-BE : documents sociaux 5 ans, Dimona 6 mois, actes de sociétés, blanchiment 10 ans, caméras 1 mois, boîte mail d'un ancien salarié. Source de cabinet, non officielle ; elle mentionne qu'un projet de loi modifie encore les délais fiscaux et de TVA.
- « Documents sociaux », SPF Emploi, Travail et Concertation sociale, https://emploi.belgique.be/fr/themes/reglementation-du-travail/documents-sociaux : conservation sur tout support lisible permettant un contrôle réel (AR n° 5 du 23/10/1978 et AR du 8/8/1980). La page ne donne pas elle-même la durée de 5 ans.
- « Règlement (UE) 2016/679 (RGPD) », EUR-Lex, https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=fr : art. 5, par. 1, points c), e), f) ; art. 30, par. 5 (organisations de moins de 250 personnes).
- « Loi du 23 mars 2019 introduisant le Code des sociétés et des associations », Etaamb, https://etaamb.openjustice.be/fr/loi-du-23-mars-2019_n2019040586.html : dépôt et copie publique des comptes annuels (art. 3:10 et 3:15) ; les statuts sont conservés dans une base électronique consultable publiquement.

Les sites du SPF Finances et du SPF Economie étaient protégés par un test anti-robot le 16/10/2026 : non cités. Les textes de loi (art. 315 CIR 92, art. 60 Code TVA) n'ont pas été lus à la source mais par des commentaires.

## À vérifier par un professionnel

- Toute durée de conservation comptable, fiscale et de TVA, surtout après la loi du 18/12/2025 qui a bougé les délais : expert-comptable ou comptable de l'entreprise (et un projet de loi supplémentaire était mentionné en avril 2026).
- Documents sociaux et dossiers du personnel : secrétariat social ou conseiller en droit social.
- Choix d'une durée pour les contrats et courriers, et tout litige en cours : avocat ou juriste d'entreprise.
- Registre des traitements, durées de données personnelles, demandes de personnes : délégué à la protection des données ou conseil en RGPD.
- Secteurs réglementés (assurance, finance, santé, construction) : conseil sectoriel.

## Limites

- La compétence classe et propose ; elle ne décide pas d'une durée et ne détruit rien.
- Les durées sont celles de principe ; les cas particuliers (immobilier, biens d'investissement, litige, perte reportée) allongent la conservation.
- Elle ne lit pas le contenu de documents sensibles pour les classer : elle travaille sur des intitulés et des métadonnées fournis.
- Un original papier ne peut être éliminé après numérisation que sur avis du comptable et du juriste.

## Exemple

Une société de 12 personnes fournit un inventaire de 38 types de documents. La compétence les range en huit classes, propose le plan type et le nommage `2026-10-05_facture-achat_fournisseur-x_F2026-0412.pdf`. Pour la classe « factures d'achat 2019 », elle calcule : exercice clos le 31/12/2019, point de départ prudent 01/01/2020, 7 ans, échéance 31/12/2026 ; action proposée : liste d'élimination à valider en janvier 2027, sauf si une perte reportée de 2019 existe encore (question posée au comptable).

Cas d'échec : l'humain demande « supprime tout ce qui date d'avant 2018 ». La compétence refuse de supprimer. Elle produit la liste des documents d'avant 2018 par classe, signale ceux dont la durée n'est pas échue (contrats toujours en cours, pièces liées à une perte reportée, dossier de litige, actes de société à durée de vie), ceux dont la durée est échue, et demande la validation écrite du comptable avant toute élimination par l'humain.

## Origine de la méthode

Recherche d'un document existant à mettre à jour avant d'en créer un nouveau adaptée de github.com/anthropics/knowledge-work-plugins,
`operations/skills/process-doc/SKILL.md` (« If Connectors Available »), commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Les durées de conservation belges sont
propres à l'atelier. Liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
