---
name: "impot-des-societes"
description: "Prépare la déclaration à l'impôt des sociétés d'une PME belge : documents à réunir, contrôle de la cohérence entre comptes annuels et résultat fiscal, repérage des dépenses non admises à valider, suivi des versements anticipés et de la majoration, vérification des conditions du taux réduit PME. À utiliser pour préparer la déclaration et les échéances d'acomptes ; jamais pour déposer la déclaration, trancher l'admissibilité d'une dépense ni affirmer qu'une société bénéficie du taux réduit."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "fiscalite"
---

# Préparation de l'impôt des sociétés d'une PME belge

## Quand l'utiliser

- Les comptes annuels sont arrêtés ou en cours d'arrêt et il faut préparer la déclaration à l'impôt des sociétés.
- Une échéance de versement anticipé approche et la société veut savoir où elle en est.
- Une dépense d'une nature particulière (restaurant, voiture, cadeaux, amendes) doit être examinée avant la déclaration.
- La direction demande si la société peut prétendre au taux réduit des PME.

## Objectif

Un dossier de préparation qui relie les comptes annuels au résultat fiscal proposé, liste les dépenses à examiner avec la pièce et la question posée, suit les versements anticipés par rapport à l'impôt estimé et met en face du taux réduit chaque condition avec l'état de la preuve. Aucune position n'est prise : l'expert-comptable valide, l'humain dépose.

## Prérequis

- L'exercice comptable concerné (dates de début et de fin) et l'exercice d'imposition correspondant, indiqués par la fiche du client.
- Les comptes annuels ou un projet de comptes avec leur statut (provisoire, arrêté, approuvé).
- La composition de l'actionnariat, la rémunération des dirigeants et la taille de la société, tels que la fiche ou les documents de la tâche les donnent.

## Entrées

- `exercice` : par exemple `01/01/2026 au 31/12/2026`.
- `comptes` : bilan, compte de résultats, annexes, grand livre des comptes de charges concernés (extraits seulement).
- `versements` : versements anticipés effectués avec dates et montants.
- `depenses_a_examiner` : lignes de charges de nature sensible, avec pièce.
- `taille_et_actionnariat` : effectif, chiffre d'affaires, total du bilan, détenteurs des actions, rémunérations des dirigeants.

## Étapes

1. **Cadrer** : exercice comptable, exercice d'imposition, date de clôture, délai de dépôt de la déclaration annoncé par l'administration pour cet exercice (source datée ; sans source, « à vérifier »).
2. **Rapprocher** le résultat comptable des comptes annuels avec le point de départ de la déclaration ; tout écart est listé avec les deux montants.
3. **Examiner les dépenses de nature sensible** : frais de restaurant et de réception, véhicules, cadeaux, amendes et pénalités, avantages en nature, charges non justifiées par une pièce, provisions. Pour chaque ligne : pièce, montant, règle d'admissibilité supposée marquée « à vérifier », question à l'expert-comptable. Le taux de déductibilité n'est jamais appliqué de mémoire : il vient d'une source datée de l'exercice ou reste « information manquante ».
4. **Suivre les versements anticipés** : lister les quatre échéances de l'exercice avec leur source datée, les versements faits, le total, et l'impôt estimé fourni par l'expert-comptable. Le calcul de la majoration pour insuffisance de versements ne se fait qu'avec le taux de l'exercice d'imposition lu dans une source datée ; sinon, écrire « taux à vérifier ». Vérifier si une exonération de majoration pour petites sociétés récentes est invoquée : condition à valider.
5. **Examiner le taux réduit des PME** : tableau condition par condition (taille de la société, détention des actions, rémunération minimale d'un dirigeant, autres conditions de la source officielle), avec pour chacune la donnée disponible et son statut : réunie, manquante, douteuse. Ne jamais conclure « la société bénéficie du taux réduit » ; conclure « les conditions suivantes paraissent réunies, les suivantes restent à confirmer ».
6. **Lister les pièces à réunir** pour l'expert-comptable : état des réserves, tableau des amortissements, détails des provisions, contrats d'emprunt, état des participations.
7. **Préparer les questions** et la table des faits ; mentionner les calendriers qui dépendent de l'agenda général (voir la compétence `agenda-echeances-legales`) plutôt que de les recopier.

## Livrable

Un dossier en Markdown : cadre de l'exercice, rapprochement comptes et résultat, tableau des dépenses examinées, tableau des versements anticipés avec échéances et statut, tableau des conditions du taux réduit, pièces à réunir, questions à l'expert-comptable, table des faits sourcés. Mention en tête : « analyse préparatoire, déclaration à valider et à déposer par l'humain ».

## Critères de réussite

- Aucun taux, seuil ou date n'est repris sans exercice d'imposition et source datée.
- Chaque dépense examinée a une pièce et une question, aucune n'est tranchée.
- Le taux réduit est présenté condition par condition, jamais comme acquis.
- Les versements anticipés sont rapprochés d'un impôt estimé fourni, pas calculé de mémoire.
- Aucune déclaration n'est présentée comme déposée.

## Sources officielles

Textes de référence à consulter par l'humain ou l'expert-comptable : Code des impôts sur les revenus 1992 (articles sur le taux de l'impôt des sociétés, les dépenses non admises et les versements anticipés) sur le site Justel du SPF Justice (https://www.ejustice.just.fgov.be) et pages du SPF Finances (https://finances.belgium.be). Le 16/10/2026, les pages du SPF Finances essayées ont renvoyé une vérification anti-robot (CAPTCHA) et n'ont pas pu être lues ; le texte consolidé du Code des impôts sur les revenus 1992 n'a pas pu être ouvert non plus sur Justel (les adresses essayées n'ont pas renvoyé le Code). Aucune citation de ces textes n'est reprise ici : ce qui suit vient de sources secondaires, à confronter aux textes.

Sources secondaires ouvertes le 16/10/2026 :

- « Guide des versements anticipés pour sociétés », MyFid, https://www.myfid.be/ressources/comptabilite/versements-anticipes-societe/ : pour l'exercice d'imposition 2027 (revenus 2026), échéances indiquées 10 avril 2026, 10 juillet 2026, 12 octobre 2026 et 21 décembre 2026 ; taux de majoration indiqué 6,75 % ; exemption de majoration pour les petites sociétés pendant leurs trois premiers exercices comptables. La page cite aussi des pourcentages d'avantage par échéance (9 %, 7,5 %, 6 %, 4,5 %) tout en précisant que les sociétés n'ont pas droit à une bonification : ces deux indications ne s'accordent pas sans lecture de la loi, donc les pourcentages d'avantage ne sont pas repris dans les calculs.
- « Conséquences importantes de la réforme de l'impôt des sociétés belges », Jubel (article de juin 2018, donc ancien), https://www.jubel.be/fr/consequences-importantes-de-la-reforme-de-limpot-des-societes-belges/ : taux normal de 25 % et taux de 20 % sur les premiers 100 000 euros de bénéfice des PME sous conditions, dont une rémunération minimale de 45 000 euros pour au moins un dirigeant. Article ancien : les seuils et conditions actuels ne sont pas confirmés par une source officielle lue.

Une recherche du 16/10/2026 a aussi renvoyé, sans qu'une page officielle ait pu être ouverte, des critères de taille (chiffre d'affaires, effectif, total du bilan) et une exigence de détention des actions par des personnes physiques pour le taux réduit : ces critères sont à vérifier à la source officielle de l'exercice d'imposition concerné.

## À vérifier par un professionnel

L'admissibilité de chaque dépense, le résultat fiscal, le bénéfice du taux réduit et ses conditions, le calcul de l'impôt estimé et de la majoration, l'exonération des petites sociétés récentes, les échéances de versement et le délai de dépôt de la déclaration sont à valider par un expert-comptable ou un conseiller fiscal. Le dépôt de la déclaration est fait par l'humain.

## Limites

- La compétence ne calcule pas l'impôt définitif et ne décide d'aucune optimisation fiscale.
- Les règles changent selon l'exercice d'imposition : sans source datée de l'exercice, la valeur est « à vérifier ».
- Les cas de groupes, de sociétés de management, de réserves exonérées et de fusions dépassent la compétence : ils sont signalés à l'expert-comptable.
- Elle ne traite pas la comptabilité : la clôture relève de la compétence `cloture-mensuelle` et du service comptabilité.

## Exemple

Société de 12 personnes, exercice clos le 31/12/2026. Données fournies : trois versements anticipés (avril, juillet, octobre) de 6 000 euros ; impôt estimé par l'expert-comptable : 30 000 euros ; deux dirigeants dont un rémunéré 48 000 euros d'après la fiche de paie fournie ; actions détenues par deux personnes physiques.

Le dossier écrit : versements à ce jour 18 000 euros sur 30 000 euros estimés ; échéance de décembre à confirmer par la source du jour ; majoration éventuelle non calculée tant que le taux de l'exercice d'imposition n'est pas lu à la source (« taux à vérifier »). Taux réduit : condition de rémunération paraît réunie sur la base de la fiche fournie (à confirmer avec le montant de l'exercice), détention par des personnes physiques paraît réunie, critères de taille à confirmer avec les comptes. Question à l'expert-comptable : confirmer l'ensemble et décider du dernier versement.

Cas d'échec : une dépense de 2 400 euros « réception clients » sans pièce justificative. Le dossier n'écrit pas « admise » ni « non admise » : il la classe « pièce manquante, traitement à valider », demande la facture et le nom des participants si la règle l'exige, et n'inclut pas cette ligne dans le résultat fiscal proposé.
