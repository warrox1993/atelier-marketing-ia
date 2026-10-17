# Services de l'entreprise : consignes des agents

Chaque service a un coordinateur et un à quatre spécialistes. Les consignes sont dans
`organisation/services/<service>/agents/<agent>/AGENTS.md`, dans le même format que les consignes du
marketing (`organisation/agents/`), **sans** le marqueur des consignes communes : le générateur l'ajoutera.

Règles communes à tous les agents : jamais inventer (sans source, l'information manque), l'humain
approuve tout acte qui engage, aucun dossier complet d'un autre service, toute référence légale incertaine
est marquée « à vérifier ». Un coordinateur ne délègue jamais hors de son service ; pour une information
d'un autre service, il passe par le bureau de liaison (route `liaison.demander`) : demande au service X avec objet, question et seuls les extraits nécessaires.

| Service (dossier) | Coordinateur | Spécialistes | Ce qui reste humain |
| --- | --- | --- | --- |
| direction | coordinateur-direction | synthese, tableau-de-bord | Décisions stratégiques, communications engageantes, approbation de comptes |
| administratif | coordinateur-administratif | courrier, agenda-documents | Envoi de toute réponse, signature, acceptation d'un rendez-vous, destruction de documents |
| juridique | coordinateur-juridique | lecture-contrats, registre-rgpd | Avis juridique engageant, signature d'un contrat, réponse à une autorité, notification de violation |
| commercial | coordinateur-commercial | preparation-rdv, propositions, renouvellements | Conseil en assurance (IDD), envoi d'une offre, remise, prospection |
| recouvrement | coordinateur-recouvrement | relances, balance-agee | Envoi des relances et de toute mise en demeure, recours judiciaire, plan de paiement, abandon de créance |
| sav | coordinateur-sav | sinistres, reclamations, faq | Décision de couverture ou d'indemnisation, envoi des réponses, médiation, déclaration à l'assureur |
| commerce-exterieur | coordinateur-export | dossiers-export | Déclaration en douane, classification et origine, licences et sanctions, signature des documents |
| conformite | coordinateur-conformite | vigilance-clients, veille-reglementaire | Déclaration à la CTIF, qualification d'un client à risque, vigilance renforcée, échanges avec les autorités |
| comptabilite | coordinateur-comptabilite | commissions, tresorerie | Paiements, écritures et clôtures, déclarations fiscales, financements |
| rh | coordinateur-rh | offres-emploi, accueil | Sélection, classement ou refus de candidats, embauche, évaluation, publication d'une offre |
| informatique | coordinateur-informatique | procedures-incident, documentation | Toute action sur les systèmes et accès, déclaration d'incident à une autorité, communication de crise |
| achats | coordinateur-achats | comparaison-offres | Choix du fournisseur, commande, signature, paiement |
| qualite | coordinateur-qualite | procedures | Approbation et mise en application d'une procédure, audits, sanctions |

## Écarts et choix à signaler

- `organisation/registre/services.json` n'existait pas à la rédaction : les slugs viennent de la consigne
  de mission et sont à réaligner s'il diffère.
- Les en-têtes ont `skills: []` pour les spécialistes (aucune compétence de service n'existe encore) ; les
  coordinateurs reprennent les quatre compétences du coordinateur marketing.
- Le coordinateur n'a pas de `reportsTo` (il rend compte à l'humain responsable) ; les spécialistes
  rendent compte à leur coordinateur de service.
- Le slug du service du commerce extérieur est `commerce-exterieur`, celui de son coordinateur
  `coordinateur-export` (comme demandé).

## À faire valider par un juriste

Toutes les références marquées « à vérifier » dans les fichiers, en particulier : articles exacts du
livre XIX CDE et de la loi du 20/12/2002 ; taux et indemnités de la loi du 2/08/2002 ; transposition belge de
l'IDD (loi du 4/04/2014) et AssurMiFID ; articles de la loi du 18/09/2017 ; RGPD art. 28, 33, 34 ;
CCT nº 38 et 39 ; loi du 10/05/2007 ; NIS2 (loi du 26/04/2024) ; règlement (UE) nº 952/2013 et double usage ;
règles linguistiques des offres d'emploi ; art. XII.13 CDE (prospection électronique) ; délais de
conservation comptable.
