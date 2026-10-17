---
name: "preparation-tva"
description: "Prépare le contrôle de la TVA d'une PME belge avant la déclaration périodique : vérification des opérations, des taux, de l'autoliquidation et des opérations intracommunautaires, préparation du listing annuel des clients et du relevé intracommunautaire, contrôle des factures électroniques structurées obligatoires entre assujettis depuis 2026. À utiliser pour préparer une déclaration ou repérer ce qui manque ; jamais pour déposer une déclaration, trancher le taux ou le lieu d'une opération douteuse, ni deviner un numéro de TVA absent."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "fiscalite"
---

# Préparation de la TVA d'une PME belge

## Quand l'utiliser

- La période de déclaration approche (mensuelle ou trimestrielle) et il faut contrôler les opérations avant le dépôt par l'humain.
- Une opération sort de l'ordinaire : vente à un client d'un autre État membre, achat à un fournisseur étranger, sous-traitance dans la construction, taux douteux.
- Le listing annuel des clients ou le relevé intracommunautaire doit être préparé.
- L'entreprise vérifie qu'elle émet et reçoit ses factures dans le format structuré imposé entre assujettis.

## Objectif

Un dossier de préparation où chaque ligne de TVA est rattachée à une pièce, à un taux justifié et à une case de déclaration proposée, avec la liste des cas douteux transmis à l'expert-comptable. Le dossier ne vaut ni déclaration ni avis fiscal : le dépôt reste une décision humaine.

## Prérequis

- Le régime de l'entreprise (assujettie, franchise des petites entreprises, régime mixte) et la périodicité de déclaration, tels que la fiche du client les donne.
- Les extraits comptables de la période avec leur statut « provisoire » ou « validé » (voir la compétence `cloture-mensuelle` pour obtenir une période close).
- Les numéros de TVA des clients et fournisseurs étrangers, tels qu'ils figurent sur les pièces.

## Entrées

- `periode` : par exemple `2026-09` ou `T3 2026`.
- `ventes` et `achats` : lignes de la période avec date, montant hors TVA, taux appliqué, TVA, pays et numéro de TVA de la contrepartie, nature (bien ou service).
- `listing_annee` : opérations de l'année civile par client, pour le listing annuel.
- `format_factures` : pour chaque flux entre assujettis belges, le canal utilisé (réseau Peppol, autre).

## Étapes

### Barrière avant tout calcul

Aucun contrôle fiscal ne commence tant que la comptabilité de la période n'est pas clôturée. Le coordinateur demande au
coordinateur comptabilité, par le bureau de liaison, si chaque mois de la période est clôturé (rapprochements soldés,
aucun point ouvert, dossier de clôture produit) :

- clôturé : vérifier seulement que rien n'a été passé après la clôture, le dire en une ligne et continuer ;
- non clôturé ou partiellement : s'arrêter, lister ce qui reste ouvert et ce que cela peut changer au montant
  (« 11 pièces non imputées pour 6 800 euros : le montant de la déclaration peut varier en conséquence ») ;
- si l'humain décide de continuer malgré tout, cette décision devient une hypothèse écrite en tête du livrable, pas
  une note de bas de page.

### Contrôles

1. **Vérifier le périmètre** : période, régime, périodicité, statut des chiffres (provisoire ou validé). Un chiffre provisoire est signalé comme tel sur toutes les lignes.
2. **Contrôler chaque vente** : taux appliqué rapproché de la nature de l'opération, mention de TVA ou d'exemption sur la facture, date d'exigibilité. Un taux inhabituel pour la nature de l'opération est une question pour l'expert-comptable, jamais une correction silencieuse.
3. **Contrôler chaque achat** : TVA déductible justifiée par une facture conforme, au nom de l'entreprise, avec la période de déduction cohérente. Les achats à usage mixte ou à déduction limitée sont signalés sans calcul de proportion inventé.
4. **Repérer l'autoliquidation** : achats de services à un prestataire établi dans un autre État, sous-traitance concernée par un régime de report de perception, cas où le client est le redevable. Pour chaque cas, noter la pièce, la mention attendue sur la facture et la question de qualification posée à l'expert-comptable ; la qualification n'est pas tranchée par l'agent.
5. **Repérer les opérations intracommunautaires** : livraisons de biens à un assujetti d'un autre État membre, acquisitions, prestations de services. Vérifier que le numéro de TVA de la contrepartie est présent et à valider auprès du système européen de validation (VIES) par l'humain ; sans numéro, la livraison ne peut pas être traitée comme exemptée : question à l'expert-comptable.
6. **Préparer le relevé intracommunautaire** : regrouper par client identifié à la TVA dans un autre État membre les livraisons de biens et, selon le cas, les services concernés ; contrôler que le total correspond aux cases de la déclaration. Les seuils qui rendent le relevé mensuel ou trimestriel sont à vérifier à la source du jour.
7. **Préparer le listing annuel des clients** : par client assujetti belge, total hors TVA de l'année civile et TVA ; appliquer le seuil de déclaration en vigueur (à vérifier, voir ci-dessous) ; signaler les clients sans numéro de TVA valide. Le délai de dépôt normal est le 31 mars de l'année suivante (source secondaire) et un report annoncé pour une année donnée n'est retenu qu'avec sa source datée.
8. **Contrôler la facturation électronique entre assujettis** : pour chaque flux entre assujettis belges, noter si la facture est émise et reçue dans le format structuré par le réseau Peppol (obligation depuis le 1er janvier 2026 selon les sources ci-dessous). Les exceptions (opérations exemptées, clients ou fournisseurs étrangers, ventes aux consommateurs) et les mesures de tolérance éventuelles sont à vérifier à la source du jour, jamais supposées.
9. **Rapprocher** les totaux de TVA collectée et déductible avec la comptabilité ; tout écart non expliqué est listé avec les deux montants et les deux sources, sans arrondi caché.
10. **Lister les questions** pour l'expert-comptable, chacune avec la pièce, la règle supposée marquée « à vérifier » et la conséquence si la réponse est négative.

## Livrable

Un dossier en Markdown : tableau des opérations contrôlées (pièce, taux, case proposée, statut), cas d'autoliquidation et intracommunautaires avec leurs questions, projet de relevé intracommunautaire et de listing annuel, état de la facturation électronique par flux, table des faits sourcés, écarts de rapprochement, questions à l'expert-comptable. Mention en tête : « analyse préparatoire, déclaration à valider et à déposer par l'humain ».

## Critères de réussite

- Si la clôture de la période n'est pas validée, le livrable s'arrête à la barrière et le dit.
- Chaque ligne renvoie à une pièce ; aucun taux ni numéro de TVA inventé.
- Les chiffres provisoires sont marqués comme tels.
- Les cas douteux sont des questions, pas des décisions.
- Les totaux du relevé et du listing se rapprochent de la comptabilité, ou l'écart est expliqué ou signalé.
- Aucune déclaration n'est présentée comme déposée.

## Sources officielles

Textes de référence à consulter par l'humain ou l'expert-comptable : Code de la TVA (loi du 3 juillet 1969) et arrêtés d'exécution, sur le site Justel du SPF Justice (https://www.ejustice.just.fgov.be) et sur les pages du SPF Finances (https://finances.belgium.be). Pages du SPF Finances (https://finances.belgium.be) : essayées le 16/10/2026, elles ont renvoyé une vérification anti-robot (CAPTCHA) ; elles n'ont donc pas pu être lues. Le texte consolidé du Code de la TVA n'a pas pu être ouvert non plus le 16/10/2026 sur Justel (les adresses essayées n'ont pas renvoyé le Code). Aucune citation de ces textes n'est reprise ici : tout ce qui suit vient de sources secondaires.

Sources secondaires ouvertes le 16/10/2026 :

- « Facturation électronique obligatoire en Belgique dès janvier 2026 (arrêté royal du 14 juillet 2025) », Forum for the Future, article du 16/07/2025, https://blog.forumforthefuture.be/fr/article/facturation-electronique-obligatoire-en-belgique-des-janvier-2026-arrete-royal-du-14-juillet-2025/27862 : obligation à partir du 1er janvier 2026 entre assujettis belges, transmission par le réseau Peppol au format Peppol BIS 3.0 (norme EN 16931), amendes progressives indiquées (1 500, 3 000 puis 5 000 euros), e-reporting annoncé à partir du 1er janvier 2028. Source secondaire, antérieure à la date d'application : les périodes de tolérance et les exceptions n'y sont pas traitées.
- « Obligation de dépôt de la liste annuelle des assujettis franchisés, même néant, report au 30/04/2026 », Forum for the Future, https://blog.forumforthefuture.be/fr/article/obligation-depot-liste-annuelle-assujetti-franchises-meme-neant-report-30-iv-26/30740 : échéance normale du 31 mars, report au 30 avril 2026 pour les opérations de 2025 selon cet article, dépôt par Intervat ; l'article indique aussi que, pour les franchisés, l'obligation est passée de l'article 53quinquies à l'article 56quinquies du Code de la TVA. Source secondaire concernant les franchisés ; ne pas l'appliquer telle quelle aux assujettis ordinaires.

Un seuil de 250 euros par client pour le listing et un seuil de 50 000 euros pour un relevé intracommunautaire mensuel apparaissent dans des résultats de recherche secondaires (pages de cabinets et d'éditeurs) qui n'ont pas été ouvertes : ils sont à vérifier à la source officielle avant tout usage.

## À vérifier par un professionnel

Le taux applicable, le lieu et la qualification d'une opération, l'autoliquidation, l'exemption d'une livraison intracommunautaire, le droit à déduction, les seuils et délais du listing et du relevé, les exceptions et tolérances de la facturation électronique, et le contenu exact de la déclaration à déposer sont à valider par un expert-comptable ou un conseiller fiscal. Le dépôt par Intervat est fait par l'humain.

## Limites

- La compétence ne qualifie pas une opération complexe (opération triangulaire, vente à distance, services immobiliers, régime de la marge) : elle la signale.
- Sans les numéros de TVA et les pièces, aucune exemption n'est retenue.
- Les seuils, délais et exceptions évoluent : une valeur sans source datée du jour est écrite « à vérifier ».
- Elle ne remplace ni le logiciel comptable ni le contrôle de l'expert-comptable.

## Exemple

Période T3 2026, entreprise de services informatiques trimestrielle. Extraits (provisoires) : une facture de vente de 12 000 euros hors TVA à une société d'un autre État membre, numéro de TVA de la contrepartie présent sur la pièce ; une facture d'achat de 3 000 euros hors TVA à un prestataire établi hors de Belgique, sans TVA belge.

Le dossier écrit : vente transfrontalière avec numéro de TVA présent, à valider dans VIES par l'humain (pièce V-014) ; qualification du lieu de la prestation et traitement de la TVA : question à l'expert-comptable (« à vérifier »). Achat sans TVA belge : cas d'autoliquidation possible, mention attendue sur la facture à contrôler, case proposée sans décision. Aucun montant de TVA n'est calculé tant que la qualification n'est pas confirmée.

Cas d'échec : le numéro de TVA du client étranger est absent de la facture. Le dossier n'écrit pas « exemptée » : il écrit « numéro de TVA de la contrepartie manquant, exemption non retenue » et pose la question « fournir le numéro et sa validation, ou confirmer le traitement avec l'expert-comptable ». La ligne reste hors du projet de relevé intracommunautaire.

## Origine de la méthode

Barrière « livres d'abord » adaptée et traduite de github.com/anthropics/knowledge-work-plugins,
`small-business/skills/tax-prep/SKILL.md` (« Step 1 » et « The gate before Step 2 »), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : traduction, question posée au
coordinateur comptabilité par le bureau de liaison, droit belge. Licence et reprises : `organisation/skills/LICENCES-TIERS.md`.
