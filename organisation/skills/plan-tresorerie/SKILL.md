---
name: "plan-tresorerie"
description: "Construit le plan de trésorerie d'une PME belge sur 13 semaines : solde de départ, encaissements (par échéance et retard probable), décaissements (fournisseurs, salaires, TVA, impôts, crédits), solde cumulé par semaine, trois scénarios et seuils d'alerte écrits. À utiliser pour savoir si l'entreprise tiendra son cash dans les trois prochains mois ou pour préparer un échange avec la banque ; jamais pour inventer un encaissement non sourcé, promettre qu'un client paiera à une date, ni présenter la prévision comme un engagement."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "comptabilite-finance"
---

# Plan de trésorerie sur 13 semaines

## Quand l'utiliser

- Le dirigeant veut savoir à quelle semaine le solde bancaire serait au plus bas, et de combien.
- Un gros paiement approche (TVA, précompte, investissement, échéance de crédit) et il faut vérifier qu'il sera couvert.
- La banque ou un associé demande une prévision de trésorerie.
- Un client important paie en retard et il faut mesurer l'effet sur le cash.

Pour une synthèse d'une page destinée à la direction, ce plan en est la base chiffrée ; pour le suivi mensuel des indicateurs, voir `tableau-de-bord-pme`.

## Objectif

Un tableau semaine par semaine, sur 13 semaines glissantes, où chaque ligne d'encaissement et de décaissement a une source (facture, contrat, échéancier, historique), une date et une hypothèse écrite. Le résultat dit le point bas, la semaine où il survient, la marge de sécurité et ce qui change dans deux scénarios dégradés.

## Prérequis

- La date de situation et les soldes bancaires réels de cette date, par compte.
- La balance âgée des clients (factures ouvertes avec date d'échéance) et celle des fournisseurs.
- L'échéancier connu : salaires et charges sociales, loyers, crédits et leasings, assurances, TVA, précompte professionnel, impôts.
- Le statut des chiffres : « provisoire » ou « validé par la comptabilité ».

## Entrées

- `date_situation` : par exemple `2026-10-16`.
- `soldes` : soldes bancaires par compte, en euros.
- `balance_agee_clients` et `balance_agee_fournisseurs` : montants TTC, dates d'échéance.
- `echeancier` : paiements récurrents et ponctuels connus, avec date.
- `ventes_prevues` : commandes signées non facturées, sinon hypothèse marquée comme telle.
- `seuil_securite` : montant minimal de trésorerie voulu par la direction, sinon un repère de départ (voir étape 6).

## Étapes

1. **Fixer le cadre** : semaine 1 = la semaine qui suit la date de situation, 13 colonnes, une seule unité (euros TTC pour les flux de caisse, puisque la TVA transite par la banque). Une unité ambiguë dans une source est signalée, pas supposée.
2. **Poser le solde de départ** : somme des soldes bancaires réels. Exclure les lignes de crédit non tirées et les comptes bloqués ; les mentionner à part.
3. **Prévoir les encaissements** en trois sous-lignes :
   - factures ouvertes : date d'échéance corrigée du retard habituel du client (calculé sur ses 12 derniers mois s'ils existent ; sans historique, écrire « pas d'historique » et utiliser le scénario prudent) ;
   - ventes prévues : facturation attendue, puis délai de paiement habituel ; si la vente n'est pas signée, la compter à part et ne l'inclure que dans le scénario optimiste ;
   - autres entrées : subsides, remboursements, apports, chacun avec sa pièce.
4. **Prévoir les décaissements** :
   - fournisseurs : échéances des factures ouvertes, puis commandes prévues avec leur délai ;
   - personnel : salaires nets, charges sociales et précompte professionnel à leurs dates réelles ;
   - TVA : montant estimé de la déclaration à payer, à la date limite de paiement de la périodicité de l'entreprise (voir `cloture-mensuelle`) ;
   - impôts, crédits, leasings, loyers, assurances, abonnements : selon l'échéancier ;
   - investissements décidés : à leur date de paiement.
5. **Calculer** le flux net de chaque semaine et le solde cumulé (solde de départ + flux). Garder visibles les lignes de départ ; aucun arrondi caché.
6. **Fixer les seuils d'alerte**, par défaut :
   - orange : solde cumulé sous le seuil de sécurité de la direction ; sans seuil fourni, repère de départ de un mois de charges fixes ;
   - rouge : solde cumulé négatif, ou inférieur au montant de la prochaine échéance obligatoire (salaires, TVA, précompte) ;
   - « seuil à définir par la direction » si rien n'est convenu, plutôt que de colorer.
7. **Construire trois scénarios** sur les mêmes lignes :
   - base : hypothèses de l'étape 3 et 4 ;
   - prudent : les clients qui paient déjà en retard glissent de 2 semaines, les ventes non signées sont exclues ;
   - optimiste : ventes non signées incluses, retards habituels inchangés.
   Pour chaque scénario : solde le plus bas, semaine du point bas, nombre de semaines sous le seuil.
8. **Mesurer la sensibilité** : effet sur le point bas du retard du plus gros client, en une phrase chiffrée (« si le client X paie 30 jours plus tard, le point bas passe de A à B »). Les noms de clients restent dans le dossier de travail ; la note à la direction peut les remplacer par « client n° 1 ».
9. **Proposer des leviers** classés par effet et par délai : relance ciblée des échéances dépassées, report négocié d'une échéance fournisseur, étalement d'un paiement, acompte à la commande, discussion préalable avec la banque. La compétence propose, la direction décide.
10. **Lister les données manquantes** et la personne à solliciter. Une ligne sans source est signalée, pas estimée en silence.

## Livrable

Un document avec : (1) une page de synthèse (solde de départ, point bas et semaine, marge de sécurité, échéances à risque, trois scénarios en trois lignes) ; (2) le tableau de 13 semaines avec les lignes d'encaissement et de décaissement, chacune avec source et hypothèse ; (3) la table des hypothèses ; (4) la liste des leviers ; (5) les données manquantes ; (6) la date d'extraction et le statut « provisoire » ou « validé ».

## Critères de réussite

- Chaque chiffre est recalculable à partir des soldes, de la balance âgée et de l'échéancier listés.
- Le solde de départ correspond au relevé bancaire de la date de situation.
- Aucun encaissement sans pièce ou hypothèse écrite ; aucune vente non signée dans le scénario de base.
- Les trois scénarios partent des mêmes données et ne diffèrent que par des hypothèses nommées.
- Les échéances obligatoires (salaires, précompte, TVA) figurent toutes, à leur vraie date.
- Aucun nom de client ou de débiteur dans la note de direction.

## Sources officielles

Consultées le 16/10/2026 :

- Loi du 2 août 2002 concernant la lutte contre le retard de paiement dans les transactions commerciales, Justel, https://www.ejustice.just.fgov.be/cgi_loi/change_lg_2.pl?language=fr&nm=2002009716&la=F : paiement dans les 30 jours civils par défaut entre entreprises, 60 jours au plus par contrat (clause plus longue réputée non écrite), intérêt de retard au taux directeur majoré de 8 points, indemnité forfaitaire de 40 euros. Sert à fixer l'échéance contractuelle plausible d'une facture et la valeur des retards.
- « Délai de conservation des archives », Institut des Réviseurs d'Entreprises, https://www.ibr-ire.be/fr/actualites/news-detail/d-lai-de-conservation-des-archives (source d'une organisation professionnelle) : rappelle les durées de conservation des pièces justificatives, utiles pour retrouver les factures et échéanciers sources.

Source secondaire, à ne pas prendre pour officielle : « Déclaration TVA en Belgique », Eurofiscalis, https://www.eurofiscalis.com/declaration-tva-belgique/ : dates limites de paiement de la TVA, mensuelle avant le 20 du mois suivant, trimestrielle avant le 25 du mois suivant le trimestre.

Les pages du SPF Finances sur la TVA et le site Intervat n'ont pas pu être ouvertes le 16/10/2026 (verification anti-robot, accès refusé) : elles ne sont pas citées. Les dates limites de TVA sont donc à confirmer sur le calendrier officiel avant d'être inscrites dans le plan.

La méthode de prévision sur 13 semaines et les seuils d'alerte sont des conventions de gestion, pas des textes officiels.

## À vérifier par un professionnel

Les soldes, la balance âgée, le montant de TVA à payer et les échéances d'impôts sont à faire valider par l'expert-comptable ou le comptable de l'entreprise avant toute décision. Toute discussion de financement, de plan de paiement avec un créancier public ou de report d'échéance relève de l'expert-comptable, du conseiller fiscal ou d'un conseil juridique.

## Limites

- Une prévision n'est pas un engagement : l'erreur grandit avec l'horizon, les semaines 9 à 13 sont indicatives.
- Pas de balance âgée ou pas d'échéancier : la compétence ne devine pas, elle produit un plan partiel clairement marqué.
- Les entreprises très saisonnières ou à gros projets ponctuels demandent des hypothèses propres, à fixer avec la direction.
- Le plan ne dit pas pourquoi un client paie tard ; il mesure l'effet du retard.
- Aucun paiement, aucune relance, aucune démarche bancaire n'est faite par la compétence.

## Exemple

Situation au 16/10/2026, entreprise de services de 14 personnes. Soldes bancaires : 48 000 euros (extrait du 16/10, provisoire). Semaine 4 : salaires et charges 41 000 euros, TVA trimestrielle estimée 12 500 euros à payer avant le 25/10 si la déclaration trimestrielle est confirmée (hypothèse, périodicité à confirmer). Encaissements attendus semaines 1 à 4 : 33 000 euros d'après la balance âgée, dont 18 000 euros d'un seul client qui paie en moyenne 25 jours après l'échéance.

Scénario de base : solde au plus bas en semaine 4, 48 000 + 33 000 - 41 000 - 12 500 - autres décaissements 14 200 = 13 300 euros, au-dessus de zéro mais sous le repère orange (un mois de charges fixes, 52 000 euros). Scénario prudent : l'encaissement de 18 000 euros glisse de deux semaines hors de la fenêtre, point bas à -4 700 euros en semaine 4 : rouge. Levier proposé : relance du client n° 1 dès la semaine 1 ; décision à la direction.

Cas d'échec : la balance âgée est reçue en hors TVA alors que les soldes et l'échéancier sont en TTC. Le plan sous-estimerait les encaissements d'environ 21 % (taux normal de TVA). La compétence ne publie pas de plan : elle écrit « unités différentes entre balance âgée et soldes » et demande la balance en TTC, ou le détail de la TVA par facture.
