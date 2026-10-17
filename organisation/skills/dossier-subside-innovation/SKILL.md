---
name: "dossier-subside-innovation"
description: "Prépare le dossier de demande d'un subside de recherche ou d'innovation pour une PME belge : choix du dispositif selon la Région (Wallonie, Flandre, Bruxelles) ou le programme européen (Horizon Europe, EIC), éligibilité, budget, indicateurs, calendrier à rebours et risques de divulgation. À utiliser pour repérer des aides et monter un brouillon de dossier à faire introduire par l'humain ; jamais pour promettre un octroi, introduire une demande, gonfler un budget ou décrire une invention non protégée sans accord."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "recherche-innovation"
---

# Dossier de subside de recherche et d'innovation

## Quand l'utiliser

- Une PME a un projet de recherche, de développement ou d'innovation et cherche qui peut le cofinancer.
- Un appel à projets (régional, fédéral ou européen) vient de s'ouvrir et l'équipe veut savoir s'il lui convient.
- Un dossier est à monter en brouillon, avec budget, calendrier et indicateurs, avant que la direction décide de l'introduire.
- Une aide a été obtenue et il faut préparer la justification des dépenses.

## Objectif

Un brouillon de dossier prêt à relire : le bon dispositif, des conditions d'éligibilité vérifiées une par une dans le règlement, un budget sourcé qui se recalcule, des jalons et des indicateurs mesurables, un calendrier à rebours depuis la date limite. La compétence ne promet jamais l'octroi : la décision appartient à l'organisme.

## Prérequis

- La Région du siège d'exploitation (les dispositifs régionaux dépendent du lieu d'implantation), la taille de l'entreprise (PME ou non) et son secteur.
- Le projet : objectif, état d'avancement, durée, équipe, partenaires, résultat attendu.
- Un budget estimatif et la capacité de cofinancement validée par la direction (via la comptabilité).
- Le texte de l'appel ou du règlement en vigueur, à la date de la tâche.
- La situation de la protection de l'invention : déposée, en cours ou non protégée (elle conditionne le niveau de détail du dossier).

## Entrées

- `projet` : description générique et description technique (cette dernière reste dans la tâche).
- `region` : Wallonie, Flandre, Bruxelles ou autre.
- `budget` : postes de dépenses (personnel, sous-traitance, équipement, frais généraux) avec montants et sources.
- `appel` : texte officiel, date limite, formulaire.
- `partenaires` : universités, centres de recherche, autres entreprises, avec leur rôle.

## Étapes

0. **Décider d'aller ou non, avant toute rédaction** (étape obligatoire et première). Pour chaque appel envisagé, cinq contrôles dans cet ordre, le premier échec arrêtant l'examen :
   1. **éligibilité** : type d'entité, taille, localisation du siège d'exploitation, nature du projet ; un seul critère manqué est un non ferme ;
   2. **qualifications obligatoires** : partenaire de recherche exigé, références, agrément, effectif ; lire les « doit » et « obligatoire » du texte à la lettre ;
   3. **mécanique de dépôt** : date limite, plateforme, inscription préalable et son délai, formulaires, limites de pages ;
   4. **capacité à réaliser** : l'entreprise peut-elle mener le projet et apporter le cofinancement si l'aide est accordée ?
   5. **adéquation et chances** : correspondance avec les priorités de l'appel, montant demandé, coût du dossier au regard des chances réalistes.
   Toute condition non vérifiée est marquée « à vérifier auprès de l'organisme ». **Un non se dit clairement avec sa raison** et s'enregistre, car le même appel revient souvent chaque année. Aucune rédaction ne commence avant un « oui » ou un « oui sous conditions » validé par l'humain.
1. **Cartographier** les dispositifs possibles par niveau : régional (agence régionale d'innovation ou administration de la recherche de la Région), fédéral (incitants fiscaux, voir la compétence `incitants-fiscaux-rd`) et européen (Horizon Europe, European Innovation Council). Lister uniquement des noms de programmes lus sur le site de l'organisme, avec la date de lecture.
2. **Vérifier l'éligibilité critère par critère** dans le texte de l'appel : taille, localisation, nature du projet (recherche industrielle, développement expérimental, innovation), partenaires exigés, coûts éligibles, cumul d'aides, démarrage anticipé du projet. Citer l'extrait et sa page. Un critère illisible est « à vérifier », pas supposé rempli.
3. **Décider du niveau de détail technique** avec l'humain : une invention non protégée ne se décrit pas en détail dans un dossier lu par des évaluateurs externes. Poser la carte avant de rédiger la partie technique.
4. **Construire le budget** : un tableau poste par poste et par année, avec la base de calcul (heures, taux horaire, devis), le taux d'intervention et la part de cofinancement. Aucun poste sans source ; une hypothèse est étiquetée. Faire recalculer les totaux. Demander à la comptabilité-finance, par la liaison, la disponibilité du cofinancement.
5. **Fixer les jalons et les indicateurs** : un jalon = une date, un livrable vérifiable, un critère de réussite (par exemple un prototype qui atteint une performance mesurée). Un indicateur a une définition, une valeur de départ, une cible et une source de mesure.
6. **Rédiger le brouillon** dans la trame du formulaire officiel : contexte et problème, innovation et état de l'art (appuyé sur le rapport d'antériorité s'il existe), plan de travail, équipe, marché et valorisation, budget, risques et plan de maîtrise.
7. **Évaluer les risques** : technique, de marché, de calendrier, de dépendance à un partenaire, de propriété des résultats (à faire valider par le service juridique via la liaison).
8. **Dresser le calendrier à rebours** : date limite de l'appel, relecture juridique, validation de la direction, signatures éventuelles des partenaires, pièces à rassembler. Marquer « à vérifier » toute date non lue sur le texte officiel.
9. **Préparer les cartes de décision humaine** : introduction de la demande, signature, engagement du cofinancement, divulgation de contenus techniques. L'agent ne soumet rien sur une plateforme d'organisme.
10. **Après octroi** (décision humaine acquise), préparer le plan de justification : pièces comptables à conserver, feuilles de temps, échéances de rapports.

Repère d'exemple pour l'étape 0 : PME wallonne de 30 personnes, projet logiciel de 180 000 euros sans partenaire de recherche. Contrôle 1 : éligibilité de la taille et de la localisation lue sur la page de l'organisme ou « à vérifier » ; contrôle 2 : si l'appel exige un partenaire de recherche, non ferme, avec la raison, et proposition d'un autre dispositif ; aucun dépôt.

## Livrable

- Un tableau comparatif des dispositifs retenus et écartés, avec la raison.
- Le brouillon du dossier dans la trame de l'appel, avec la table des faits.
- Le budget et le calendrier en tableaux.
- La liste des pièces manquantes et des questions ouvertes.
- Les cartes de décision préparées.

## Critères de réussite

- Les cinq contrôles de l'étape 0 sont présents dans l'ordre avant toute rédaction ; un non est motivé et enregistré.
- Chaque condition d'éligibilité renvoie à un extrait daté du règlement.
- Chaque montant est sourcé ou étiqueté hypothèse, et les totaux se recalculent.
- Aucun passage ne promet ni ne laisse entendre un octroi.
- Les indicateurs sont mesurables, avec valeur de départ et cible.
- Les passages techniques sont au niveau de détail validé par l'humain.
- La date limite est confirmée à la source ou marquée « à vérifier ».

## Sources officielles

Consultées le 16/10/2026 par l'agent rédacteur :

- European Innovation Council, page EIC Accelerator, https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en : page lue. Éligibles : startups, PME et petites entreprises à moyenne capitalisation (jusqu'à 499 salariés) des États membres et pays associés ; subvention (somme forfaitaire) inférieure à 2,5 millions d'euros, investissement en fonds propres ou quasi-fonds propres de 1 à 10 millions d'euros ; candidature en étapes (dossier court de 12 pages, présentation de 10 diapositives et vidéo de 3 minutes, puis dossier complet de 20 pages incluant une analyse de liberté d'exploitation, puis entretien devant un jury). Montants et calendrier à vérifier dans l'appel en vigueur.
- Commission européenne, page Horizon Europe, https://research-and-innovation.ec.europa.eu/funding/funding-opportunities/funding-programmes-and-open-calls/horizon-europe_en : page lue. Programme 2021-2027 doté de 93,5 milliards d'euros, trois piliers (science d'excellence, défis mondiaux et compétitivité industrielle européenne, Europe innovante dont le Conseil européen de l'innovation) ; les appels se consultent et se déposent sur le portail Funding and Tenders.
- Innoviris (Région de Bruxelles-Capitale), page d'accueil, https://www.innoviris.brussels/fr : page lue en partie ; elle évoque le cofinancement de projets de recherche et d'innovation, un programme « Test your idea » et un « Innovation Journey », mais ne liste pas les dispositifs avec leurs conditions ; la page de financement n'a pas pu être ouverte (adresse testée introuvable).
- VLAIO (Flandre), https://www.vlaio.be : accès refusé (erreur 403) le 16/10/2026, non lu. Les noms de programmes flamands ne sont donc pas confirmés ici.
- SPW Recherche (Wallonie), https://recherche-technologie.wallonie.be/ et une page du portail wallonie.be : adresses introuvables (404), non lues. Les programmes wallons ne sont donc pas confirmés ici.

Pour la Wallonie, la Flandre et Bruxelles, aucun taux, plafond ni nom précis de programme n'est repris dans cette compétence : l'agent les lit sur le site de l'organisme le jour de la tâche. Toute connaissance générale sur ces dispositifs est une source secondaire à confirmer.

## À vérifier par un professionnel

Le règlement de l'appel prime sur tout résumé. Les règles européennes d'aides d'État (cumul d'aides, intensité), la titularité des résultats avec des partenaires et les clauses de confidentialité relèvent du service juridique ou d'un avocat. Les montants éligibles et leur justification comptable relèvent de l'expert-comptable. Beaucoup de régions travaillent avec des conseillers d'organismes d'accompagnement : l'humain peut leur demander un avis gratuit avant d'introduire la demande (à vérifier selon la Région).

## Limites

- Aucune garantie d'octroi, de délai de réponse ni de montant ; les décisions dépendent de l'organisme et du budget disponible.
- Les conditions changent d'un appel à l'autre ; un dossier basé sur l'appel de l'an dernier est faux jusqu'à preuve du contraire.
- Les programmes et conditions des trois Régions ne sont pas confirmés dans cette compétence (sites inaccessibles le 16/10/2026) : ils se lisent à la source à chaque tâche.
- Un brouillon bien écrit ne remplace pas la valeur du projet ; la compétence n'embellit aucun fait.
- Un projet déjà commencé ou une dépense déjà engagée peut être inéligible selon l'appel : vérifier avant tout engagement.

## Exemple

Une PME bruxelloise de 22 personnes veut développer un capteur de qualité d'air pour bureaux (18 mois, budget estimé 420 000 euros). L'agent liste deux pistes régionales à lire sur le site d'Innoviris (noms et conditions à relever à la date de la tâche) et une piste européenne, confrontées aux critères : taille, localisation, nature du projet. Le budget est un tableau par poste (personnel 60 %, sous-traitance d'un laboratoire universitaire 25 %, équipement 15 %), chaque ligne portant son devis ou « hypothèse ». Calendrier à rebours : date limite lue sur l'appel, relecture juridique 10 jours avant, validation de la direction 15 jours avant. Cartes : « introduire la demande » et « engager 30 % de cofinancement », toutes deux humaines.

Cas d'échec : le chef de projet demande de présenter 100 % du budget comme éligible et d'écrire « l'aide est quasi certaine ». L'agent refuse : il marque les postes dont l'éligibilité n'est pas confirmée par le règlement, écrit « sous réserve de décision de l'organisme », et pose une carte si l'humain maintient sa demande.

## Origine de la méthode

Version 1.1.0 : décision d'aller ou non avant toute rédaction, en cinq contrôles ordonnés (éligibilité, qualifications obligatoires, mécanique de dépôt, capacité, adéquation et chances), non clair et enregistré, adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `small-business/skills/grant-rfp-writer/SKILL.md`, « Step 3 » (go/no-go avant toute rédaction), commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : réécriture en français, organismes belges et européens, décision humaine. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
