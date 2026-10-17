---
name: "registre-risques-entreprise"
description: "Tient le registre des risques de l'entreprise, consolidé depuis les risques remontés par les services : six catégories (opérationnel, financier, conformité, stratégique, réputation, sécurité), matrice gravité × probabilité de 5 × 5 présentée comme convention d'entreprise, quatre niveaux (vert 1-4, jaune 5-9, orange 10-15, rouge 16-25), mesures, responsable, statut et source. À utiliser pour une revue périodique des risques, la préparation d'un conseil ou l'arrivée d'un risque nouveau ; jamais pour accepter un risque, réévaluer à la place d'un service ni remplacer l'analyse des risques au travail."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "direction"
---

# Registre des risques de l'entreprise

## Quand l'utiliser

- Revue trimestrielle ou annuelle des risques par la direction ou le conseil d'administration.
- Un service remonte un risque qui dépasse son périmètre.
- La direction prépare un arbitrage et veut voir les risques rouges et orange.

## Objectif

Une vue unique, sourcée et comparable des risques de l'entreprise, qui dit pour chacun ce qui est fait, qui en répond et
quelle décision est attendue, sans réévaluer ce que les services ont déjà évalué.

## Prérequis

- Les extraits de registres des services (risques projet, HSE, juridique, informatique, conformité) transmis par la
  liaison, avec leur date.
- L'état précédent du registre de l'entreprise, s'il existe.
- L'échelle de l'entreprise si elle en a une ; à défaut, l'échelle ci-dessous, marquée « convention à valider ».

## Entrées

- `risques_services` : extraits datés, avec l'évaluation faite par chaque service.
- `registre` : état précédent.
- `periode` : période de la revue.

## Étapes

1. **Classer** chaque risque dans une catégorie : opérationnel (processus, personnel, pannes), financier (budget,
   coûts, revenus), conformité (réglementation, audit, politique interne), stratégique (marché, concurrence,
   technologie), réputation (clients, public, partenaires), sécurité (données, accès, tiers).
2. **Rapprocher les doublons** : un même risque remonté par deux services est fusionné avec ses deux origines citées ;
   si les évaluations divergent, écrire l'écart, ne pas choisir.
3. **Évaluer** sur la matrice de 5 × 5 quand le service ne l'a pas fait : gravité de 1 (négligeable) à 5 (critique),
   probabilité de 1 (très improbable) à 5 (presque certain), score = gravité × probabilité. Niveaux : 1 à 4 vert, 5 à 9
   jaune, 10 à 15 orange, 16 à 25 rouge. Un risque déjà évalué par un service garde son évaluation.
4. **Décrire les mesures** existantes et proposées, le responsable proposé (fonction), le statut (ouvert, atténué,
   accepté, clos). « Accepté » exige une décision humaine jointe.
5. **Appliquer les règles de données** : une donnée absente est « donnée manquante », jamais 0 ; un total ne sert pas de
   dénominateur à un ratio d'un périmètre plus étroit.
6. **Lister les décisions attendues** : chaque risque rouge et orange avec l'option proposée (réduire, transférer,
   éviter, accepter) et la date limite proposée.

## Livrable

Le registre consolidé (catégorie, description, origine, gravité, probabilité, score, niveau, mesures, responsable
proposé, statut, date), la liste des écarts d'évaluation entre services et la liste des décisions attendues.

## Critères de réussite

- Chaque score correspond à la matrice et chaque niveau à ses seuils.
- Chaque risque cite son origine et sa date.
- Aucun risque « accepté » sans décision humaine jointe ; aucune évaluation d'un service modifiée en silence.

## Sources officielles

Consulté le 17/10/2026 :

- « Principes généraux relatifs à la politique du bien-être », SPF Emploi, Travail et Concertation sociale,
  https://emploi.belgique.be/fr/themes/bien-etre-au-travail/principes-generaux/principes-generaux-relatifs-la-politique-du-bien :
  les risques pour la santé et la sécurité des travailleurs relèvent du système dynamique de gestion des risques de
  l'employeur et de son plan global de prévention ; le registre de l'entreprise les reprend sans les remplacer.

La matrice de 5 × 5 n'est imposée par aucun texte : c'est une convention d'entreprise.

## À vérifier par un professionnel

- Pour une entité soumise à NIS2 ou à une réglementation sectorielle (assurance, crédit), le format de l'analyse des
  risques exigée par l'autorité peut différer : à faire vérifier par le responsable conformité.

## Limites

- Le registre consolide ; il ne remplace ni l'analyse des risques au travail (HSE), ni l'évaluation d'un risque
  juridique (juridique), ni le registre des risques d'un projet (gestion de projets).
- Les probabilités sont des estimations : elles sont présentées comme telles.

## Exemple

Cas nominal : trois remontées. Informatique : sauvegarde jamais restaurée en test, gravité 4, probabilité 3, score 12,
orange. Juridique : contrat de sous-traitance sans clause RGPD, évalué orange par le juridique, repris tel quel.
Recouvrement et comptabilité remontent tous deux la dépendance à un gros client : fusionné, deux origines citées,
évaluations 15 et 20 divergentes, écart écrit et décision demandée.

Cas d'échec évité : un service écrit « risque accepté par la direction » sans référence. Le statut reste « ouvert » et la
preuve est demandée.

## Origine de la méthode

Matrice de 5 × 5 et seuils des quatre niveaux adaptés et traduits de github.com/anthropics/knowledge-work-plugins,
`legal/skills/legal-risk-assessment/SKILL.md`, sections « Severity x Likelihood Matrix » et « Risk Score Calculation » ;
catégories de risques et format du registre de `operations/skills/risk-assessment/SKILL.md` ; règles « absent n'est pas
zéro » et « dénominateur du bon périmètre » de `small-business/shared/absent-is-not-zero.md` et
`small-business/shared/chain-seams.md` (section 1) ; commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0.
Modifications : traduction, consolidation entre services, statut « accepté » soumis à décision humaine. Texte des
licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
