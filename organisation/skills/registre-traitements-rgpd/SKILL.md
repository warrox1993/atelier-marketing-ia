---
name: "registre-traitements-rgpd"
description: "Établit ou met à jour le registre des activités de traitement (article 30 du RGPD) d'une PME belge : une fiche par traitement avec les rubriques de l'article 30, paragraphe 1, une base légale proposée parmi celles de l'article 6, des durées de conservation à justifier, la liste des sous-traitants et la vérification du contrat de l'article 28, puis un test d'analyse d'impact (article 35) qui dit si elle est probablement nécessaire. À utiliser pour créer le registre, ajouter un traitement (nouvel outil, nouveau fournisseur, nouvelle campagne) ou préparer un contrôle ; jamais pour trancher la base légale à la place du responsable du traitement, déclarer un traitement licite, notifier l'autorité ou conclure qu'une analyse d'impact n'est pas requise."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "juridique"
---

# Registre des activités de traitement (RGPD, article 30)

## Quand l'utiliser

- L'entreprise n'a pas de registre, ou celui qu'elle a ne couvre pas les outils réellement utilisés (CRM, paie, newsletter, vidéosurveillance, site web).
- Un nouveau traitement démarre : outil, fournisseur, campagne, collecte de données auprès de prospects.
- Un contrôle, un audit client ou un appel d'offres demande de montrer la conformité RGPD.

## Objectif

Un registre où chaque traitement a sa fiche complète, avec une base légale proposée et motivée, une durée de conservation justifiée, les destinataires et sous-traitants identifiés, et un signalement clair des traitements qui demandent une analyse d'impact ou une décision du responsable du traitement. La compétence propose, le responsable du traitement décide : c'est une analyse préparatoire à faire valider par un juriste ou le délégué à la protection des données.

## Prérequis

- La description des activités par les services (RH, ventes, marketing, comptabilité, informatique) : quelles données, pour quoi, avec quel outil, depuis quand.
- La liste des outils et fournisseurs qui touchent à des données personnelles, avec leur contrat si disponible.
- Le nom du responsable du traitement (l'entreprise) et, s'il existe, du délégué à la protection des données.
- L'effectif : l'article 30, paragraphe 5, dispense en principe les entreprises de moins de 250 personnes, sauf si le traitement est susceptible de comporter un risque pour les droits et libertés, n'est pas occasionnel, ou porte sur des catégories particulières de données ou des données pénales. Dans la pratique presque tout traitement régulier (paie, clients) est non occasionnel : le registre est donc à tenir, et la compétence le suppose.

## Entrées

- `activites` : descriptions rédigées par les services, une par activité.
- `outils` : liste des logiciels et prestataires, avec le pays d'hébergement s'il est connu.
- `registre_existant` : version précédente, le cas échéant.
- `contexte` : secteur, présence de mineurs, de données de santé, de vidéosurveillance, de profilage.

## Étapes

1. **Découper en traitements.** Un traitement est un ensemble d'opérations avec une même finalité (par exemple « gestion de la paie », « prospection par courriel », « facturation des clients »). Une même base de données peut servir plusieurs traitements : ils ont chacun leur fiche.
2. **Remplir la fiche** avec les rubriques de l'article 30, paragraphe 1 (liste plus bas). Toute rubrique inconnue est écrite « à confirmer » avec la personne à interroger, jamais devinée.
3. **Proposer la base légale** parmi les six de l'article 6, paragraphe 1, avec la raison en une phrase et l'alternative écartée. Pour l'intérêt légitime (f), exiger la mise en balance écrite avec les droits de la personne. Pour le consentement (a), vérifier qu'il peut être prouvé et retiré. Une base légale incertaine part en « questions ouvertes ».
4. **Fixer la durée de conservation** par catégorie de données : le RGPD n'impose pas de durée, il impose de ne pas conserver plus longtemps que nécessaire (article 5, paragraphe 1, point e). Une durée vient d'une obligation légale citée (par exemple sept ans pour les livres comptables, article III.88 du Code de droit économique), d'une prescription ou d'un besoin motivé. « Illimité » ou « tant que nécessaire » est refusé : la fiche est marquée incomplète.
5. **Recenser les destinataires et les sous-traitants.** Pour chaque prestataire qui traite des données pour le compte de l'entreprise, vérifier l'existence d'un contrat ou acte juridique conforme à l'article 28, paragraphe 3, avec les clauses listées plus bas. Un sous-traitant sans contrat est signalé « bloquant ». Noter les transferts hors Espace économique européen et la garantie invoquée.
6. **Décrire les mesures de sécurité** en termes généraux (contrôle d'accès, chiffrement, sauvegarde, journalisation), dans la mesure du possible, comme le demande l'article 30, paragraphe 1, point g.
7. **Passer le test d'analyse d'impact** (article 35) pour chaque fiche : voir la grille plus bas. Le résultat est « probablement requise », « à examiner » ou « aucun critère relevé », toujours à valider.
8. **Établir la liste des questions ouvertes** : base légale incertaine, durée absente, sous-traitant sans contrat, transfert non encadré, catégorie particulière de données, information des personnes (articles 12 à 14) non vérifiée.
9. **Préparer un contrôle** avec six questions qu'un auditeur ou l'Autorité de protection des données poserait : le registre est-il complet et daté de sa dernière mise à jour ? Quelle est la base légale de chaque finalité (une seule par finalité) ? Où sont les analyses d'impact des traitements à risque élevé ? Quelle est la dernière demande d'exercice de droits et en combien de temps a-t-elle reçu réponse ? Quels transferts hors Espace économique européen et sur quelle garantie ? Où est le registre des violations, y compris celles qui n'ont pas été notifiées ? Chaque question sans réponse documentée devient une question ouverte.
10. **Dater et versionner** : date de la fiche, auteur, sources des informations, prochaine révision (au moins une fois par an et à chaque changement d'outil).

### Rubriques de l'article 30, paragraphe 1

Le registre du responsable du traitement comporte toutes les informations suivantes :

- a) le nom et les coordonnées du responsable du traitement et, le cas échéant, du responsable conjoint, du représentant et du délégué à la protection des données ;
- b) les finalités du traitement ;
- c) la description des catégories de personnes concernées et des catégories de données à caractère personnel ;
- d) les catégories de destinataires, y compris dans des pays tiers ou organisations internationales ;
- e) le cas échéant, les transferts vers un pays tiers ou une organisation internationale, avec identification du pays et, pour certains transferts exceptionnels, les documents attestant de garanties appropriées ;
- f) dans la mesure du possible, les délais prévus pour l'effacement des différentes catégories de données ;
- g) dans la mesure du possible, une description générale des mesures de sécurité techniques et organisationnelles de l'article 32, paragraphe 1.

Le registre est écrit (la forme électronique suffit) et mis à disposition de l'autorité de contrôle sur demande (article 30, paragraphes 3 et 4). Un sous-traitant tient son propre registre de catégories d'activités (article 30, paragraphe 2) : si l'entreprise agit pour le compte d'un client, elle ouvre une section séparée.

### Bases légales (article 6, paragraphe 1)

| Base | Point | Question à poser |
| --- | --- | --- |
| Consentement | a | peut-on prouver un accord libre, spécifique, informé, retirable aussi facilement qu'il a été donné ? |
| Contrat ou mesures précontractuelles | b | le traitement est-il nécessaire à ce contrat précis (livraison, paie) ? |
| Obligation légale | c | quel texte précis l'impose ? |
| Intérêts vitaux | d | situation d'urgence vitale seulement |
| Mission d'intérêt public | e | rarement applicable à une entreprise privée |
| Intérêts légitimes | f | l'intérêt est-il réel, le traitement nécessaire, et les droits de la personne ne prévalent-ils pas ? |

Le point f ne s'applique pas aux autorités publiques dans l'exécution de leurs missions. Une prospection par courrier électronique relève en plus des règles propres de l'envoi de messages publicitaires (article XII.13 du Code de droit économique : consentement préalable, sauf exceptions) : la base légale RGPD ne suffit pas à elle seule.

### Contrat de sous-traitance (article 28, paragraphe 3)

Le contrat ou acte juridique définit l'objet et la durée, la nature et la finalité, le type de données, les catégories de personnes et les droits et obligations du responsable, et prévoit que le sous-traitant : traite uniquement sur instruction documentée (y compris pour les transferts) ; fait respecter la confidentialité par les personnes autorisées ; prend les mesures de l'article 32 ; respecte les conditions de recours à un autre sous-traitant (autorisation écrite préalable, générale ou spécifique, article 28, paragraphe 2) ; aide le responsable pour les demandes des personnes ; aide pour les obligations des articles 32 à 36 ; supprime ou renvoie les données au terme de la prestation ; met à disposition les informations nécessaires et permet les audits.

### Test d'analyse d'impact (article 35)

L'analyse est requise avant le traitement quand il est « susceptible d'engendrer un risque élevé pour les droits et libertés des personnes physiques » (article 35, paragraphe 1). L'article 35, paragraphe 3, la rend requise en particulier pour : (a) l'évaluation systématique et approfondie d'aspects personnels fondée sur un traitement automatisé, y compris le profilage, avec des décisions produisant des effets juridiques ou similaires ; (b) le traitement à grande échelle de catégories particulières de données (article 9) ou de données pénales (article 10) ; (c) la surveillance systématique à grande échelle d'une zone accessible au public. L'autorité de contrôle publie des listes complémentaires (article 35, paragraphes 4 et 5) : la liste de l'Autorité de protection des données n'a pas été ouverte pour cette version, elle est à consulter avant de conclure « aucun critère relevé ». Quand l'analyse est requise, elle contient au moins les quatre éléments du paragraphe 7 : description systématique, nécessité et proportionnalité, évaluation des risques, mesures envisagées. Si elle révèle un risque élevé non atténué, la consultation préalable de l'autorité s'impose (article 36).

## Livrable

Un registre en tableau (une ligne par traitement) ou en fiches, avec les colonnes de l'article 30, paragraphe 1, plus : base légale proposée et motif, source de la durée, sous-traitants et statut du contrat, résultat du test d'analyse d'impact, statut (complet, incomplet, bloquant), date. Plus : la liste des questions ouvertes classées par urgence, et la mention « proposition à faire valider par le responsable du traitement et par un juriste ou le délégué à la protection des données ».

## Critères de réussite

- Chaque fiche contient les sept rubriques de l'article 30, paragraphe 1, ou signale celles qui manquent.
- Chaque base légale est motivée et rattachée à un point de l'article 6 ; aucune n'est présentée comme définitive.
- Chaque durée a une source ou est marquée à justifier ; aucune durée « illimitée » acceptée.
- Chaque sous-traitant a un statut de contrat vérifié (présent, absent, à demander).
- Les traitements de catégories particulières de données ou à grande échelle sont signalés en tête.
- Aucune donnée personnelle réelle dans le registre : on décrit des catégories, pas des individus.

## Sources officielles

Consultées le 16/10/2026 :

- Règlement (UE) 2016/679 du 27 avril 2016 (RGPD), EUR-Lex, https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:32016R0679 : texte intégral en français relu pour les articles 5, 6, 28, 30 (paragraphes 1 à 5) et 35 (paragraphes 1 à 11). Les rubriques, les points a à g de l'article 30 et le contenu du contrat de l'article 28 ci-dessus en sont tirés.
- Code de droit économique, texte consolidé, Justel (SPF Justice), https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=2013022819&table_name=loi : article III.88 (conservation des livres pendant sept ans à partir du 1er janvier de l'année qui suit la clôture) et article XII.13 (courrier électronique publicitaire sans consentement préalable interdit).

Les listes de traitements à analyse d'impact obligatoire de l'Autorité de protection des données, les lignes directrices du Comité européen de la protection des données et les modèles de registre de l'autorité belge n'ont pas été ouverts : ils ne sont pas cités.

## À vérifier par un professionnel

Le choix de chaque base légale, la mise en balance de l'intérêt légitime, les durées de conservation, les contrats de sous-traitance, les transferts hors Espace économique européen et toute analyse d'impact sont à faire valider par un juriste spécialisé ou le délégué à la protection des données. Les traitements de données de santé, de mineurs, de vidéosurveillance, de géolocalisation des salariés ou de profilage relèvent obligatoirement d'une validation humaine avant mise en œuvre.

## Limites

- La compétence décrit ce qu'on lui déclare ; elle ne découvre pas les traitements que les services oublient de signaler.
- Elle ne fixe pas la base légale ni les durées à la place du responsable du traitement et ne déclare aucun traitement licite.
- Elle ne remplace pas l'information des personnes (articles 12 à 14), le traitement des demandes d'exercice de droits ni la procédure de violation de données.
- Elle n'applique pas les règles sectorielles (santé, banque, assurance) ni le droit du travail sur la surveillance des salariés sans qu'un juriste le demande.
- Le test d'analyse d'impact n'est qu'un tri : « aucun critère relevé » n'est pas « non requise ».

## Exemple

Activité décrite par le service commercial d'une PME de 40 personnes : « Nous envoyons une newsletter mensuelle à nos clients et prospects depuis un outil d'envoi hébergé hors Union européenne. »

| Rubrique | Contenu |
| --- | --- |
| Traitement | Newsletter mensuelle |
| Responsable | l'entreprise (coordonnées et délégué : à confirmer) |
| Finalité | informer clients et prospects de l'actualité de l'entreprise |
| Personnes et données | clients et prospects ; nom, courriel, entreprise, historique d'ouverture des messages |
| Base légale proposée | consentement (article 6, paragraphe 1, a) pour les prospects ; envoi aux clients : à examiner avec le juriste, car les règles de l'article XII.13 du Code de droit économique s'ajoutent |
| Destinataires | fournisseur de l'outil d'envoi (sous-traitant) |
| Transferts | oui, pays d'hébergement à identifier ; garantie à documenter |
| Durée | 3 ans après le dernier contact : à justifier (aucune source légale trouvée) |
| Sécurité | accès par compte nominatif, double authentification : à confirmer |
| Contrat article 28 | à demander au fournisseur : bloquant |
| Analyse d'impact | aucun critère relevé à ce stade ; liste de l'autorité à consulter |

Cas d'échec : le service écrit seulement « on garde les données tant qu'on est en relation avec le client » et ne sait pas dans quel pays l'outil héberge ses données. La fiche reste « incomplète » : durée marquée à justifier, transfert marqué à confirmer, deux questions ouvertes (qui est le contact chez le fournisseur ? quelles sont les clauses du contrat ?). La compétence ne remplit ni un pays ni une durée plausibles.

## Origine de la méthode

Les six questions de l'étape 9 sont adaptées de github.com/alirezarezvani/claude-skills,
`compliance-os/skills/gdpr-audit-prep/SKILL.md` (« The Six DPO Questions »), commit
19392f7a08264ed00486a251f5b2098321771f94, licence MIT, Copyright (c) 2025 Alireza Rezvani. Scripts non repris.
Modifications : français, cadre de l'Autorité de protection des données. Liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
