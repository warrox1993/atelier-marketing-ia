---
name: "veille-reglementaire"
description: "Organise la veille réglementaire d'une PME belge à partir de sources officielles (Moniteur belge et Justel, Journal officiel de l'Union européenne sur EUR-Lex, autorités de contrôle comme la FSMA) : choix des sources et des sujets, relevé des textes nouveaux ou modifiés, fiche d'impact (qui est concerné, quoi, à partir de quand, quelle action), registre des obligations et priorisation par échéance et gravité. Volet spécifique pour les entités soumises à une autorité (intermédiaires d'assurance, comptables, agents immobiliers). À utiliser pour lancer ou mettre à jour une veille, ou pour évaluer l'impact d'un texte ; jamais pour interpréter un texte comme un avis juridique, citer une référence de mémoire, modifier une procédure de l'entreprise ni écrire ou déposer quoi que ce soit auprès d'une autorité."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "conformite"
---

# Veille réglementaire

## Quand l'utiliser

- L'entreprise n'a pas de veille organisée et apprend les changements par hasard ou trop tard.
- Un texte nouveau (loi, arrêté, règlement européen, circulaire d'une autorité) paraît et il faut dire s'il concerne l'entreprise.
- Il faut tenir à jour la liste des obligations de l'entreprise et leurs échéances.
- Une échéance approche et il faut savoir par quoi commencer.

## Objectif

Une veille régulière, courte et traçable : pour chaque changement, une fiche qui dit qui est concerné, quoi, à partir de quand et quelle action, avec l'adresse de la source et la date de consultation ; un registre des obligations à jour ; une liste ordonnée de ce qui doit être fait d'abord. Le texte est rapporté, pas interprété : toute question de lecture va au juriste, au responsable de la conformité ou à l'autorité.

## Prérequis

- La fiche de l'entreprise : activités, forme juridique, taille, secteur, clients (consommateurs ou entreprises), autorités dont elle dépend (par exemple la FSMA pour un intermédiaire d'assurance).
- La liste des sujets suivis (par exemple anti-blanchiment, protection des données, facturation électronique, pratiques commerciales, droit social) et de leurs responsables internes.
- Les sources autorisées par la tâche ; toute autre source est signalée comme secondaire.

## Entrées

- `sujets` : thèmes à suivre.
- `periode` : par exemple `2026-10` ou la semaine en cours.
- `registre` : le registre des obligations existant, s'il y en a un.
- `textes` : textes ou liens transmis par l'humain à analyser.

## Étapes

1. **Choisir les sources, du plus officiel au moins officiel** :
   - le **Moniteur belge** (publication des textes belges, sommaire quotidien et recherche) et **Justel** (législation consolidée, avec la date de mise à jour de chaque texte) ;
   - le **Journal officiel de l'Union européenne** sur **EUR-Lex** (séries L pour la législation, C pour les communications ; depuis juillet 2013 seule l'édition électronique fait foi) ;
   - les **autorités de contrôle** de l'entreprise (circulaires et communications de la FSMA, par exemple) ;
   - en dernier lieu, la presse ou les cabinets : sources secondaires, à dire telles quelles et à confirmer sur une source officielle.
2. **Fixer le rythme** : lecture hebdomadaire courte pour les sujets sensibles, mensuelle pour le reste, et une lecture à la demande quand un texte est annoncé. Écrire dans le registre la date de la dernière lecture de chaque source.
3. **Relever** les textes nouveaux ou modifiés de la période. Pour chacun : intitulé exact, date du texte, date de publication, date d'entrée en vigueur, adresse, date de consultation. Distinguer le texte **publié** (Moniteur belge, Journal officiel) de la **version consolidée** (Justel, texte consolidé EUR-Lex), qui n'a pas la même valeur : la consolidation est un confort de lecture.
4. **Trier** : ce texte touche-t-il un sujet suivi ? Concerne-t-il le secteur, la forme juridique, la taille de l'entreprise ? Si le doute subsiste, le texte reste « à qualifier » avec la question précise au juriste ; il n'est ni écarté ni déclaré applicable.
5. **Rédiger la fiche d'impact** (modèle ci-dessous) : une page au plus par changement.
6. **Mettre à jour le registre des obligations** : une ligne par obligation (voir le tableau ci-dessous).
7. **Prioriser** (voir la grille) et proposer l'ordre des actions avec responsable et échéance, à valider par l'humain.
   Escalader sans attendre au responsable conformité et à la direction quand : un texte nouveau touche directement l'activité principale de l'entreprise ; une sanction d'une autorité dans le secteur annonce un contrôle plus strict ; une échéance de mise en conformité approche et demande des changements d'organisation ; un mécanisme sur lequel l'entreprise s'appuie (par exemple une garantie de transfert de données) est contesté ou annulé ; une autorité ouvre une demande ou une enquête visant l'entreprise.
8. **Lister les textes non vérifiés ou inaccessibles** : source indisponible, texte tronqué, version non consolidée, traduction. Un point non vérifié n'entre pas dans le registre comme obligation certaine.
9. **Planifier la prochaine lecture** et les rappels d'échéance (par exemple avec la compétence d'agenda des échéances légales de l'atelier).

### Fiche d'impact

| Rubrique | Contenu |
| --- | --- |
| Texte | intitulé exact, nature (loi, arrêté, règlement UE, directive, circulaire), date, adresse, date de consultation |
| Statut | publié, consolidé, projet ou proposition (un projet n'oblige personne) |
| Qui | entités, activités, tailles ou clients concernés ; « à qualifier » si incertain |
| Quoi | ce qui change, en trois lignes, avec renvoi à l'article ; pas de paraphrase hasardeuse |
| Quand | entrée en vigueur, dates transitoires, première échéance pratique |
| Action | ce que l'entreprise devrait faire, formulé comme une proposition ; responsable proposé |
| Risque si rien n'est fait | sanction ou conséquence citée dans le texte, ou « information manquante » |
| Questions ouvertes | points à poser à un juriste ou à l'autorité |

### Registre des obligations

| Champ | Contenu |
| --- | --- |
| Obligation | énoncé court |
| Base | texte et article, avec adresse |
| Qui dans l'entreprise | fonction responsable |
| Périodicité ou échéance | date ou fréquence |
| Preuve de conformité | document ou trace qui la démontre |
| Dernière vérification | date de lecture de la source |
| Statut | à qualifier, applicable, non applicable (motivé), en cours, conforme |

### Grille de priorisation

| Niveau | Critère |
| --- | --- |
| 1, urgent | échéance dans moins de 90 jours, ou sanction ou interruption d'activité possible, ou obligation déjà en vigueur et non couverte |
| 2, à planifier | échéance entre 3 et 12 mois, ou charge de mise en oeuvre importante |
| 3, à surveiller | texte non encore en vigueur, projet, ou impact incertain |

L'ordre d'une même catégorie suit la gravité de la conséquence puis l'effort. Ces seuils sont des repères de départ que le responsable ajuste.

### Volet spécifique : entités soumises à une autorité de contrôle

- Ajouter aux sources les publications de l'autorité de la profession : circulaires, communications et questions-réponses de la FSMA pour les intermédiaires d'assurance et les entreprises financières ; l'institut ou l'organe de la profession pour les comptables et les agents immobiliers (à identifier avec le responsable, sans le deviner).
- Surveiller séparément les textes qui créent des obligations propres à l'entité : anti-blanchiment, règles de conduite et d'information, publicité des produits financiers, cadre organisationnel, questionnaires périodiques.
- Les circulaires sont mises à jour sans changer de numéro : relever la mention « update » de la première page (par exemple une circulaire de 2015 mise à jour en 2019, une communication de 2022 mise à jour en 2026) et comparer avec la version déjà analysée.
- Un texte national qui transpose une directive est lu avec la directive ; un règlement européen s'applique directement : le dire dans la fiche.
- Un échange avec l'autorité (question, déclaration, dépôt) est préparé en brouillon, jamais envoyé par la compétence.

## Livrable

- Une note de veille de la période : liste des changements retenus, une fiche d'impact par changement, liste « à qualifier ».
- Le registre des obligations mis à jour.
- La liste ordonnée des actions proposées avec échéance et responsable.
- La liste des textes ou sources non vérifiés.
- La date de la prochaine lecture.

## Critères de réussite

- Chaque changement a une source officielle (adresse et date de consultation) ou est marqué secondaire.
- Aucune référence légale n'est citée de mémoire.
- La distinction texte publié, consolidé ou projet est faite pour chaque ligne.
- Chaque ligne du registre a un responsable, une échéance ou une périodicité, et une preuve de conformité.
- Les questions d'interprétation sont renvoyées à un humain nommé ou à l'autorité, pas résolues dans la note.
- La note tient en deux pages hors fiches.

## Sources officielles

Consultées le 16/10/2026 :

- Moniteur belge, https://www.ejustice.just.fgov.be/cgi/welcome.pl?language=fr : site officiel de publication, sommaire quotidien des textes publiés, recherche dans les textes, dernières éditions en PDF, accès à la banque de législation consolidée Justel.
- Justel, exemple de consolidation : loi du 18 septembre 2017 (anti-blanchiment), https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&table_name=loi&cn=2017091806 : la version consolidée indique sa date de mise à jour (28/07/2026) et contient des notes sur des articles annulés par la Cour constitutionnelle. Code de droit économique : https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=2013022819&table_name=loi, version indiquant une mise à jour au 04/08/2026.
- Journal officiel de l'Union européenne, accès direct sur EUR-Lex, https://eur-lex.europa.eu/oj/direct-access.html?locale=fr : consultation par période, références du Journal officiel, séries L et C, éditions récentes ; seule l'édition électronique fait foi depuis juillet 2013.
- Directive (UE) 2015/849 sur EUR-Lex, https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32015L0849 : montre l'accès aux versions consolidées (celle du 30/12/2024) et aux formats HTML, PDF et Journal officiel.
- Circulaires de la FSMA lues comme exemples de textes mis à jour : FSMA_2015_16 (27/10/2015, update 30/07/2019), https://www.fsma.be/sites/default/files/public/sitecore/%6Dedia%20library/Files/fsmafiles/circ/fr/2015/fsma_2015_16.pdf ; FSMA_2022_29 (12/12/2022, update 08/09/2026), https://www.fsma.be/sites/default/files/%6Dedia/files/2022-12/fsma_2022_29_fr.pdf.

Note : dans les adresses de la FSMA, « %6D » est la lettre m encodée (l'adresse fonctionne telle quelle).

Sources inaccessibles le 16/10/2026 : le site de la CTIF (ctif-cfi.be), indisponible (503), n'a pas pu être consulté ; la page du registre UBO sur finances.belgium.be a renvoyé une vérification anti-robot ; la page FSMA tentée pour la liste des circulaires a renvoyé un autre organisme : la page d'index officielle de la FSMA est à retrouver par l'humain. La méthode ci-dessus ne dépend pas de ces pages.

## À vérifier par un professionnel

Une note de veille n'est pas un avis juridique. Avant toute décision (mettre en place une procédure, modifier un contrat, répondre à une autorité), la qualification « concerné ou non » et l'action proposée sont à valider par le juriste ou l'avocat de l'entreprise, par le responsable de la conformité, et, pour une entité contrôlée, par l'autorité ou la fédération professionnelle. Les dates d'entrée en vigueur sont à confirmer sur le texte publié au Moniteur belge ou au Journal officiel, pas sur une version consolidée seule.

## Limites

- La compétence ne lit que les sources autorisées ; elle ne peut pas garantir l'exhaustivité d'une veille.
- Elle ne dit pas si l'entreprise est en infraction : elle signale un écart possible entre l'obligation relevée et la preuve de conformité disponible.
- Les projets et propositions de textes sont suivis comme « à surveiller », jamais comme obligations.
- Une traduction ou un résumé n'a pas la valeur du texte officiel dans la langue de publication.
- Elle ne modifie ni procédure ni registre interne sans validation humaine.

## Exemple

Période octobre 2026, entreprise fictive « Courtage Exemple SRL », intermédiaire d'assurance de 12 personnes. Relevé : la circulaire FSMA_2022_29 (communications publicitaires relatives à des OPC) porte la mention « update 08/09/2026 » ; la version analysée l'an passé portait une autre date.

Fiche d'impact : texte et adresse indiqués ; statut : communication de l'autorité, mise à jour ; qui : entités qui diffusent des communications publicitaires sur des parts d'OPC (le courtier ne commercialise que de l'assurance : « à qualifier », question au responsable de la conformité) ; quoi : changements à lire dans la page d'historique ; quand : date de l'update ; action proposée : comparer avec la version précédente et confirmer la non-application ; priorité 3 (à surveiller).

Cas d'échec : l'utilisateur transmet un article de presse annonçant « une nouvelle obligation pour tous les courtiers à partir du 1er janvier » sans lien officiel. La compétence ne crée pas de ligne d'obligation dans le registre : elle la place en « à qualifier », indique « source secondaire, texte officiel non trouvé » et demande l'adresse du texte publié au Moniteur belge ou au Journal officiel. Elle ne date aucune échéance tant que le texte officiel n'est pas lu.

## Origine de la méthode

Critères d'escalade de l'étape 7 adaptés de github.com/anthropics/knowledge-work-plugins,
`legal/skills/compliance-check/SKILL.md` (« Regulatory Monitoring Basics », « Escalation Criteria »), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Les sources officielles belges et européennes restent la
base de la veille. Liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
