---
name: "objectifs-marque-activation"
description: "Fixe les objectifs chiffrés et datés d'un client, répartit le budget entre construction de marque et activation (hypothèse de départ B2B 46/54 présentée comme hypothèse), estime la part d'acheteurs « en marché » et fixe les indicateurs longs et courts. À utiliser après le positionnement et avant le plan de canaux ; jamais pour appliquer un ratio comme une loi."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "marketing"
---

# Objectifs, marque et activation

## Quand l'utiliser

- Le positionnement est écrit et il faut fixer ce que l'on veut obtenir, et quand.
- Un budget doit être réparti entre contenus de fond, présence locale, annonces, relances.
- Une revue annuelle ou trimestrielle de la stratégie est ouverte.

## Objectif

Produire des objectifs mesurables, une répartition marque et activation documentée comme hypothèse, et des indicateurs distincts pour l'effet long et l'effet court. Sources : Byron Sharp, *How Brands Grow* (2010) et Romaniuk et Sharp, *How Brands Grow Part 2* (2015) [vérifié pour l'idée] ; Les Binet et Peter Field, *The Long and the Short of It* (IPA, 2013) et LinkedIn B2B Institute, *The 5 Principles of Growth in B2B Marketing* (2019) pour le 46/54 [vérifié, contesté] ; John Dawes, « The 95:5 rule » (B2B Institute, 2021) [vérifié].

## Prérequis

- Le dossier de diagnostic et le positionnement.
- Le budget fourni par le client (fiche de cadrage).
- Les données de départ : nombre de clients, renouvellements, origine des nouveaux contrats, part de voix si elle existe.

## Entrées

- `budget` : enveloppe et période.
- `donneesClient` : ventes, rétention, sources d'acquisition.
- `cycle` : cycle de renouvellement estimé de la catégorie, à mesurer chez le client.
- `positionnement` : énoncé et cible.

## Étapes

1. Poser l'objectif principal sur l'acquisition (pénétration : part de la cible qui devient cliente), la rétention en second. Elle n'est pas abandonnée : en assurance, le renouvellement est un revenu récurrent. La logique de Sharp vient surtout de la grande consommation, le courtage local est peu étudié : à appliquer avec précaution [contesté].
2. Écrire 2 à 4 objectifs chiffrés et datés (par exemple nouveaux contrats, demandes de devis, rendez-vous), avec la valeur de départ ou « inconnue ».
3. Classer chaque ligne de budget : marque (notoriété, contenus de fond, présence locale) ou activation (annonces de recherche, relances, offres).
4. Partir de l'hypothèse 46/54 (marque/activation) pour un client B2B, l'ajuster selon la catégorie, la taille de la marque et le cycle d'achat, et écrire noir sur blanc que c'est une hypothèse. Les ratios viennent de la base de cas de l'IPA, un échantillon sélectionné de campagnes primées ; les chiffres d'ESOV n'ont pas été vérifiés dans le texte original [contesté].
5. Si des données existent, calculer la part de voix face à la part de marché. L'association « 10 points de part de voix en plus, environ 0,5 point de part de marché gagné par an » est [secondaire] : ne pas la présenter comme une prévision.
6. Estimer la part « en marché » de la cible : si une entreprise change de prestataire tous les cinq ans, environ 20 % sont en marché sur un an et 5 % sur un trimestre. Dawes précise que ces pourcentages ne sont pas à lire littéralement. Mesurer le cycle réel chez le client.
7. Déduire la conduite : hors marché, présence mémorable et régulière sans pression commerciale ; en marché, être trouvé et choisi (recherche, avis, rappel rapide). Ne pas créer de demande artificielle : guetter les déclencheurs.
8. Fixer les indicateurs longs (notoriété assistée et spontanée, points d'entrée de catégorie associés, recherches de la marque, demandes spontanées, part des nouveaux clients venus par recommandation) et courts (demandes de devis, rendez-vous, taux de transformation, coût par rendez-vous). Demander à `mesure` de confirmer qu'ils sont mesurables.
9. Déposer objectifs, répartition et indicateurs dans le document de stratégie (rubrique « Objectifs »). La répartition du budget est un choix métier à valider par l'humain.

## Livrable

Objectifs chiffrés et datés, tableau de répartition marque et activation (avec la mention « hypothèse »), part « en marché » estimée avec sa limite, indicateurs longs et courts avec l'agent qui les mesure.

## Critères de réussite

- Chaque objectif a une valeur de départ (ou « inconnue »), une cible, une date et un indicateur.
- Le ratio marque/activation est écrit comme hypothèse, avec la raison de l'ajustement.
- La part « en marché » est présentée comme ordre de grandeur, jamais comme un fait.
- Les indicateurs longs et courts sont séparés ; aucun contenu de marque n'est jugé au coût par clic après trois semaines.

## Limites

- Ne jamais appliquer 60/40 ni 46/54 comme une loi.
- La règle des « 20 % des acheteurs pèsent 80 % des ventes » varie selon les sources (environ 50 à 60 % selon les synthèses) [vérifié pour l'idée, chiffres variables].
- Relancer en boucle des prospects hors marché provoque des rejets et un risque RGPD en cas d'opposition.
- Sans données, un indicateur est « non mesurable », pas estimé.
- Conclure sur 10 demandes est interdit : voir les seuils de `mesure-experiences`.

### Règles de vérité

- Toute valeur de départ vient de l'entrée ; sinon elle s'écrit « inconnue ». Aucune valeur de départ, aucun cycle de renouvellement, aucune taille de marché n'est estimé de mémoire.
- Chaque objectif porte quatre champs fixes : valeur de départ (ou « inconnue »), cible chiffrée, date (jour, mois, année) et indicateur. Un objectif sans chiffre ou sans date est refusé et réécrit. Les cibles chiffrées sont des hypothèses de travail à valider par l'humain, et le disent.
- La répartition marque et activation est chiffrée en euros, la somme est égale à l'enveloppe fournie (la vérifier et l'écrire), et le tableau et le ratio portent la mention « hypothèse » avec la raison de l'ajustement.
- La part « en marché » est « inconnue » tant que le cycle réel ou le nombre d'acheteurs par an n'est pas fourni. Un ordre de grandeur issu de la règle de Dawes n'est permis que marqué « illustration, non mesurée », avec le cycle supposé écrit, et la limite est dite.
- Chaque indicateur, long ou court, nomme l'agent qui le mesure (`mesure` en général) et indique s'il est « mesurable » ou « non mesurable aujourd'hui ».

### Modèle de livrable

À recopier, tous les champs sont obligatoires.

**Objectifs** (2 à 4)

| Objectif | Valeur de départ | Cible chiffrée | Date | Indicateur | Agent mesureur |
| --- | --- | --- | --- | --- | --- |

**Répartition du budget (hypothèse)** : enveloppe fournie : (montant, période).

| Ligne | Type (marque ou activation) | Montant (euros) | Part | Mention |
| --- | --- | --- | --- | --- |
| (ligne) | (type) | (montant) | (part) | hypothèse |

Total des lignes : (somme) = enveloppe. Raison de l'ajustement du ratio : (texte).

**Part « en marché »** : valeur ou « inconnue ». Limite : (ce qui manque pour la mesurer).

**Indicateurs longs** et **indicateurs courts** : listes séparées, chacune avec agent mesureur et état de mesure.

**Validation humaine** : la répartition est un choix métier, en attente de décision.

## Exemple

Client fictif, budget annuel de 24 000 euros (donnée de la fiche de cadrage).

| Ligne | Type | Montant | Hypothèse |
| --- | --- | --- | --- |
| Contenus de fond et présence locale | marque | 11 000 | 46 % : hypothèse B2B, à ajuster après 2 trimestres |
| Annonces de recherche locales, relances d'offres | activation | 13 000 | 54 % |

Objectif d'exemple : passer de 18 à 30 demandes de devis qualifiées par trimestre d'ici le 30 juin 2027 (valeur de départ : export du client, 2026-10-01). Part « en marché » : environ 5 % par trimestre si le cycle est de cinq ans (ordre de grandeur, cycle réel inconnu).
