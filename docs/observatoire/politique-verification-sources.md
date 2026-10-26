# Politique de vérification des sources

Cette politique s'applique à toute affirmation stockée dans `obs_affirmations` et à tout texte publié. Elle découle du plan (F.1, F.3) et du modèle de données ([modele-donnees.md](modele-donnees.md)). Contexte d'ensemble : [architecture.md](architecture.md).

## 1. Types de sources

| Type | Définition | Exemples | Poids |
| --- | --- | --- | --- |
| Primaire | Produite par l'éditeur ou l'auteur du projet, ou donnée brute vérifiable | Dépôt et releases GitHub, documentation officielle, changelog, fichier LICENSE, manifeste de paquet, article arXiv de l'auteur, texte du règlement UE | Peut fonder `confirme_doc_officielle` |
| Secondaire | Analyse indépendante qui cite ses propres sources | Article de presse technique, étude d'un laboratoire tiers, documentation d'un projet voisin | Fonde `rapporte_tiers` |
| Communautaire | Contenu d'utilisateurs, sans contrôle éditorial | Forums, issues de tiers, réseaux sociaux, vidéos, réponses de sites de questions | Fonde `rapporte_tiers` avec confiance basse, ou `non_verifie` |

Règle de principe : **l'affirmation commerciale d'un fournisseur n'est jamais un fait indépendant.** Une page de produit qui annonce « 10 fois plus rapide » prouve que le fournisseur l'annonce (`rapporte_editeur`), pas que c'est vrai. Même une source primaire ne vaut que pour ce qu'elle atteste : la documentation dit ce que le logiciel est censé faire, pas ce qu'il fait.

Toute source garde `url_canonique`, `licence_reutilisation`, date de collecte et empreinte. Une source dont la licence n'autorise pas la réutilisation n'est citée que par courts extraits et lien (ADR-009).

## 2. Les huit statuts et la confiance de 0 à 3

La confiance va de 0 (aucune assurance) à 3 (plusieurs preuves concordantes ou essai reproduit) et porte toujours un motif écrit.

| Statut | Sens | Exemple | Confiance usuelle |
| --- | --- | --- | --- |
| `verifie_experimentalement` | Essai exécuté par notre service, lié à un `obs_essais` | « REA 6.7.0 ouvre ce binaire de test en VM : commande, journal et empreinte conservés » | 3 |
| `confirme_doc_officielle` | Preuve dans une source primaire de l'éditeur | « La licence du projet est MIT » avec extrait exact du fichier LICENSE | 2 à 3 |
| `rapporte_editeur` | Affirmation commerciale ou déclarative du fournisseur | « Le fournisseur annonce un gain de 40 % » (page du produit) | 1 |
| `rapporte_tiers` | Rapporté par une source secondaire ou communautaire | « Un article indépendant mesure un gain de 15 % » | 1 à 2 |
| `infere` | Déduit par un raisonnement explicite stocké | « Prise en charge d'ARM probable : paquets arm64 présents dans la release » | 1 |
| `non_verifie` | Aucune preuve exploitable pour l'instant | Rumeur d'une fonctionnalité à venir | 0 |
| `contredit` | Une preuve contraire est liée | La documentation annonce une option que le journal d'essai montre absente | 0 |
| `obsolete` | Vraie pour une version dépassée | « La commande X existe » vraie en 6.7.0, retirée en 6.8.0 | 0 à 1 |

Règle de la porte : **un chiffre de performance n'est jamais `verifie_experimentalement` sans essai exécuté par notre service.** Un `verifie_experimentalement` sans `obs_essais` lié est refusé par la base.

## 3. Passages d'un statut à l'autre

| De | Vers | Condition |
| --- | --- | --- |
| `non_verifie` | `rapporte_editeur` ou `rapporte_tiers` | Une source identifiée est liée avec extrait exact et position |
| `non_verifie` | `confirme_doc_officielle` | Un extrait exact d'une source primaire est lié |
| `rapporte_editeur`, `rapporte_tiers` | `confirme_doc_officielle` | Une source primaire indépendante de l'annonce atteste le fait (pour un fait technique, pas pour un argument commercial) |
| tout statut sauf `contredit` | `verifie_experimentalement` | Un essai approuvé, exécuté par notre service, version et environnement notés, journal conservé |
| `non_verifie` | `infere` | Raisonnement explicite écrit, dont chaque prémisse est elle-même sourcée |
| tout statut | `contredit` | Une preuve contraire (source ou essai) est liée ; l'affirmation contredite est remplacée, jamais effacée (`remplacee_par`) |
| tout statut | `obsolete` | Un instantané plus récent montre que la version concernée est dépassée |
| `obsolete` | nouvelle affirmation | Une nouvelle affirmation vérifiée pour la version courante remplace l'ancienne ; l'ancienne reste consultable |

Aucun passage ne se fait sans preuve nouvelle ou sans décision tracée. Un statut ne monte jamais parce que l'affirmation est répétée ou que plusieurs sources se copient entre elles ; la confiance baisse si les sources dérivent d'une même origine. La transition de l'état éditorial vers « Validé » exige un PASS frais de la porte et du relecteur.

## 4. Interdits

Ces pratiques bloquent la validation (la porte les rejette) :

1. Fausses fonctionnalités : décrire une capacité qui n'est pas attestée.
2. Versions inventées : numéro de version sans source ni instantané.
3. Benchmarks imaginaires : chiffre de performance sans essai exécuté ou sans source citée.
4. Comparaisons non étayées : classement ou jugement sans critères ni affirmations liées.
5. Compatibilités supposées : « fonctionne avec X » sans preuve ni essai.
6. Tutoriels « testés » sans exécution : le mot « testé » exige un essai lié.
7. Sources fictives : référence, lien, auteur ou titre qui n'existent pas.
8. Citations sans référence : toute citation porte une source, un extrait exact et une position.
9. Dates inventées : une date vient d'une source ; sinon elle est « inconnue ».
10. Coûts non vérifiés présentés comme actuels : un prix ou un quota porte sa date de vérification et sa source, sinon il est marqué non vérifié.

Conséquences : un champ de fiche sans preuve vaut `null` affiché « inconnu » ou « non vérifié », jamais une valeur par défaut inventée. Un chapitre sans affirmation vérifiable est `incomplet` ou `non_applicable` avec motif, jamais rempli de texte. Le modèle de langue ne produit aucune preuve : une preuve est un extrait exact d'un instantané ou le journal d'un essai.
