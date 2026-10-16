---
name: "mentions-legales-site"
description: "Prépare les textes juridiques du site web d'une entreprise belge : mentions légales (identification de l'entreprise et numéro d'entreprise selon l'article III.74 du Code de droit économique, informations de l'article XII.6 pour les services de la société de l'information), politique de confidentialité (articles 12 à 14 du RGPD), politique de cookies avec recueil du consentement, et conditions générales de vente en ligne pour clients entreprises ou consommateurs (articles VI.45 à VI.53 du Code de droit économique), avec liste de contrôle des rubriques manquantes. À utiliser pour créer ou auditer ces pages avant la mise en ligne d'un site, d'une boutique ou d'un formulaire de contact ; jamais pour déclarer un site conforme, publier les textes, rédiger des conditions opposables sans relecture d'un avocat ni inventer une information sur l'entreprise."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "juridique"
---

# Mentions légales, confidentialité, cookies et conditions de vente d'un site

## Quand l'utiliser

- Un site vitrine, un blog, un formulaire de contact ou une boutique va être mis en ligne et il faut les pages juridiques.
- Un site existant n'a pas de mentions, ou celles-ci sont copiées d'un autre site et ne correspondent pas à l'entreprise.
- Une banque, un client ou un audit demande de montrer les mentions, la politique de cookies ou les conditions de vente.

## Objectif

Quatre textes à relire par un avocat, chacun construit uniquement à partir de faits fournis par l'entreprise : mentions légales, politique de confidentialité, politique de cookies avec dispositif de consentement, conditions générales de vente en ligne. Pour chaque rubrique obligatoire, un état : renseignée, à fournir par l'entreprise, ou non applicable (avec la raison). Rien n'est inventé pour combler un trou, et le dossier rappelle qu'il s'agit d'une analyse préparatoire à faire valider.

## Prérequis

- La fiche de l'entreprise : dénomination exacte, forme juridique, siège, numéro d'entreprise, numéro de TVA, coordonnées dont une adresse électronique.
- Le type de site (vitrine, blog, formulaire, boutique) et le public (entreprises seulement, ou consommateurs aussi).
- L'inventaire des traceurs réellement présents sur le site (mesure d'audience, publicité, vidéos intégrées, boutons de réseaux sociaux) et celui des traitements de données (voir la compétence `registre-traitements-rgpd`).
- Pour une profession réglementée ou une activité soumise à autorisation : l'ordre ou l'organisme de surveillance et le titre professionnel.

## Entrées

- `entreprise` : les faits d'identification, chacun avec sa source (extrait de la Banque-Carrefour des Entreprises fourni par l'entreprise, statuts).
- `site` : adresse, pages, outils tiers, formulaires, paiement en ligne.
- `traceurs` : liste des cookies et autres traceurs avec finalité et émetteur.
- `offre` : produits ou services vendus en ligne, prix, livraison, public.

## Étapes

1. **Cadrer** : site sans vente, avec vente à des entreprises, avec vente à des consommateurs. Le troisième cas ajoute les obligations de la vente à distance aux consommateurs et un droit de rétractation.
2. **Remplir les mentions légales** avec la liste ci-dessous. Une information absente du dossier est marquée « à fournir » ; le numéro d'entreprise et le numéro de TVA ne se déduisent jamais d'un autre document sans confirmation de l'entreprise.
3. **Rédiger la politique de confidentialité** à partir des fiches du registre : qui est responsable, pourquoi les données sont collectées, sur quelle base, combien de temps, à qui elles sont transmises, quels droits ont les personnes et comment les exercer. Le détail des informations à fournir est celui des articles 12 à 14 du RGPD, à relire sur le texte.
4. **Auditer les cookies** : classer chaque traceur par finalité, distinguer les traceurs strictement nécessaires (exemptés de consentement) de tous les autres (consentement préalable), et décrire le dispositif attendu (voir plus bas).
5. **Rédiger les conditions générales de vente** selon le public. Pour les consommateurs, reprendre les informations précontractuelles de l'article VI.45 et le droit de rétractation de l'article VI.47 ; pour les entreprises, éviter les clauses abusives des articles VI.91/3 à VI.91/6 (voir la compétence `revue-contrat-commercial`).
6. **Contrôler le parcours de commande** : informations avant la commande, correction des erreurs de saisie, accusé de réception, accès aux conditions sous une forme qu'on peut conserver et reproduire (articles XII.7 à XII.9).
7. **Vérifier la cohérence** : mêmes noms, mêmes adresses, mêmes durées partout, liens depuis le pied de page de chaque page, pages disponibles dans les langues du site, concordance entre la politique de cookies et les traceurs réellement chargés.
8. **Produire la liste de contrôle** et la liste des points à faire valider.

### Mentions légales : liste de contrôle

Deux textes se superposent, à vérifier ensemble.

**Article III.74 du Code de droit économique** (toute entreprise met à disposition, selon l'article III.75 : communiquées au client, accessibles sur le lieu de l'activité ou de la conclusion du contrat, accessibles par une adresse électronique communiquée, ou reprises dans un document d'information détaillé) :

1. nom ou dénomination sociale ; 2. forme juridique ; 3. adresse géographique d'établissement ; 4. coordonnées, y compris adresse électronique permettant un contact rapide et direct ; 5. numéro d'entreprise ; 6. siège social ; 7. si l'activité est soumise à autorisation, les coordonnées de l'autorité compétente (la rédaction du texte renvoie à une loi de 1992 : à faire relire) ; 8. pour les professions réglementées, l'association ou organisation professionnelle et le titre professionnel avec l'État membre qui l'a octroyé ; 9. les conditions générales, s'il y en a, et les langues dans lesquelles elles sont consultables ; 10. les clauses sur la loi applicable et la juridiction compétente, s'il y en a ; 11. toute garantie contractuelle après-vente non imposée par la loi ; 12. le prix du service lorsqu'il est fixé à l'avance ; 13. les principales caractéristiques de l'activité ; 14. les assurances ou garanties de l'article III.6, avec coordonnées de l'assureur et couverture géographique.

**Article XII.6** (livre XII, prestataire d'un service de la société de l'information : un site marchand ou une activité en ligne en est un) : accès facile, direct et permanent, pour les destinataires et les autorités, au moins à : 1. nom ou dénomination sociale ; 2. adresse géographique d'établissement ; 3. coordonnées, y compris courrier électronique ; 4. le cas échéant, numéro d'entreprise ; 5. coordonnées de l'autorité de surveillance si l'activité est soumise à autorisation ; 6. pour les professions réglementées, l'association, le titre professionnel, la référence aux règles professionnelles ; 7. numéro d'identification TVA si l'activité y est assujettie ; 8. codes de conduite éventuels. Les prix affichés sont clairs et précisent si taxes et frais de livraison sont inclus (article XII.6, § 2).

Compléments à prévoir : nom de l'hébergeur et du responsable de la publication (usage courant, pas dans les textes relus), propriété intellectuelle du site, limites de responsabilité et mention de la publicité identifiable comme telle (article XII.12, 1°).

### Cookies : liste de contrôle

- Règle de fond : le stockage d'informations, ou l'accès à des informations déjà stockées, dans l'équipement de l'utilisateur n'est permis qu'avec son accord, après une information claire et complète sur les finalités, sauf stockage ou accès techniquement nécessaire à la transmission ou strictement nécessaire à un service demandé expressément (directive 2002/58/CE, article 5, paragraphe 3).
- Selon la page de l'Autorité de protection des données, mise à jour le 17/11/2023 : le consentement doit remplir toutes les conditions de validité du RGPD ; le paramétrage du navigateur et la poursuite de la navigation ne valent pas consentement ; les cookies analytiques ne sont en principe pas exemptés ; les finalités distinctes (publicité propre, publicité de tiers, partage sur réseaux sociaux) se consentent séparément ; le local storage et les pixels sont des traceurs au même titre que les cookies.
- Dispositif à décrire : bandeau sans traceur non nécessaire déposé avant le choix, boutons Accepter et Refuser de poids égal, choix par finalité, possibilité de retirer le consentement aussi facilement que de le donner, preuve du consentement conservée, liste des traceurs avec émetteur, finalité et durée.
- Le texte de transposition belge exact n'a pas été retrouvé : l'ancien article 129 de la loi du 13 juin 2005 relative aux communications électroniques est abrogé depuis le 10/01/2022, et le texte actuel est à identifier par l'avocat.

### Conditions générales de vente : liste de contrôle

Entre entreprises : identification, objet, prix et TVA, paiement et intérêts de retard, livraison, réception, garanties, responsabilité et plafond, force majeure, propriété intellectuelle, données personnelles, droit applicable et for, langue. Les clauses de déséquilibre manifeste sont interdites (article VI.91/3) et certaines sont abusives de plein droit ou présumées l'être (VI.91/4 et VI.91/5).

Avec consommateurs, avant que le consommateur soit lié par un contrat à distance (article VI.45) : caractéristiques principales, identité de l'entreprise avec son numéro d'entreprise, adresse, téléphone et courriel, prix total toutes taxes comprises et frais supplémentaires, modalités de paiement, livraison et exécution, date de livraison, traitement des réclamations, droit de rétractation (conditions, délai, modalités et modèle de formulaire) ou information qu'il n'existe pas, garantie légale de conformité, assistance et garanties commerciales, durée et conditions de résiliation pour les contrats à durée indéterminée. Le délai de rétractation est de 14 jours sans motif (article VI.47), avec exceptions à l'article VI.53 et remboursement dans les 14 jours de l'information du consommateur (article VI.50). La liste complète de l'article VI.45 compte davantage de rubriques que celles citées ici : la relire en entier avant rédaction. Pour les clauses abusives à l'égard des consommateurs, voir l'article VI.83.

Commande en ligne (articles XII.7 à XII.9) : langues proposées, étapes techniques, moyens d'identifier et corriger les erreurs avant la commande, archivage ou non du contrat, accusé de réception électronique sans délai injustifié avec récapitulatif de la commande, conditions communiquées de façon à pouvoir être conservées et reproduites.

## Livrable

Un dossier en Markdown : les quatre textes proposés (chaque champ inconnu marqué « [à fournir : nom de la personne ou du service] »), la liste de contrôle remplie, le tableau des traceurs avec classement (nécessaire ou soumis au consentement), la liste des incohérences et des questions pour l'avocat. En tête de chaque texte : « projet à faire valider par un avocat avant publication ». Aucune publication par la compétence.

## Critères de réussite

- Chaque information d'identification provient d'un document fourni et porte sa source ; aucune n'est inventée.
- Chaque rubrique des articles III.74 et XII.6 a un état (renseignée, à fournir ou non applicable avec motif).
- Le tableau des traceurs est complet par rapport à ce que charge réellement le site ; chaque traceur soumis au consentement a une finalité distincte.
- Les conditions de vente distinguent clairement entreprises et consommateurs.
- Les liens vers les textes figurent dans le pied de page de toutes les pages.
- Aucune formule de conformité (« site conforme », « 100 % légal ») n'est utilisée.

## Sources officielles

Consultées le 16/10/2026 :

- Code de droit économique, texte consolidé, Justel (SPF Justice), https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=2013022819&table_name=loi : articles III.74 à III.76, VI.45, VI.47, VI.50, VI.53 (début), VI.83, VI.91/3 à VI.91/6, XII.6 à XII.9, XII.12 et XII.13. Le numéro d'entreprise figure à l'article III.74, 5° (livre III) et, « le cas échéant », à l'article XII.6, § 1er, 4° (livre XII). Le texte consolidé annonce une modification par une loi du 20 juillet 2026 avec entrée en vigueur au 20 novembre 2026 : à relire à cette date.
- Règlement (UE) 2016/679 (RGPD), EUR-Lex, https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:32016R0679 : texte intégral ; les articles 12 à 14 (information des personnes) sont cités par renvoi, leur contenu détaillé n'a pas été relu pour cette version.
- Directive 2002/58/CE modifiée (vie privée et communications électroniques), EUR-Lex, https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:02002L0058-20091219 : article 5, paragraphe 3, relu.
- Loi du 13 juin 2005 relative aux communications électroniques, Justel, https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=2005061332&table_name=loi : texte à jour au 02/04/2026 ; les articles 128 et 129 y sont abrogés (loi du 21 décembre 2021, en vigueur le 10/01/2022).
- « Cookies et autres traceurs », Autorité de protection des données, https://www.autoriteprotectiondonnees.be/citoyen/themes/internet/cookies (page de vulgarisation destinée aux citoyens, dernière mise à jour affichée 17/11/2023) : conditions du consentement, exemptions, finalités distinctes, navigation et navigateur. Source officielle mais non normative ; une page destinée aux professionnels n'a pas pu être ouverte (erreur 404).

## À vérifier par un professionnel

Les quatre textes sont à faire valider par un avocat avant publication, en particulier : les conditions générales de vente (clauses de responsabilité, droit de rétractation, garanties), le texte belge de transposition de la règle sur les cookies et les recommandations récentes de l'Autorité de protection des données, la liste des mentions pour une profession réglementée, et la langue des textes si le site cible plusieurs régions. Les chiffres de TVA, les prix et les délais sont à valider par le comptable de l'entreprise.

## Limites

- La compétence ne vérifie pas techniquement ce que le site dépose comme cookies : elle travaille sur l'inventaire fourni, qui doit être confirmé par un test technique du site.
- Elle ne couvre ni les règles sectorielles (santé, finance, voyages, jeux), ni la vente hors Belgique, ni la facturation électronique.
- Elle ne garantit pas la conformité du site ; elle fait un tri et prépare le travail de relecture.
- Les listes de contrôle sont celles des textes relus le 16/10/2026 ; un texte modifié depuis rend la liste caduque.
- Elle ne fournit pas de modèle de formulaire de rétractation : celui-ci figure dans l'annexe 2 du livre VI, non relue.

## Exemple

Entreprise de menuiserie de 12 personnes avec un site vitrine et un formulaire de devis, clients particuliers et entreprises. Fiche fournie : dénomination et forme juridique, adresse du siège, courriel de contact, numéro d'entreprise confirmé par l'entreprise. Pas de numéro de TVA fourni. Le site charge un outil d'audience et une carte intégrée.

| Rubrique | État |
| --- | --- |
| Dénomination, forme, siège, courriel, numéro d'entreprise | renseignés (source : fiche de l'entreprise) |
| Numéro de TVA (XII.6, 7°) | à fournir : confirmé par le comptable |
| Assurance (III.74, 14°) | à fournir |
| Garantie après-vente non légale | non applicable à confirmer |
| Cookies | outil d'audience : soumis au consentement; carte intégrée : soumise au consentement; cookie de session du formulaire : nécessaire |
| CGV | distinctes pour particuliers (rétractation à examiner, car le devis peut être sur mesure : article VI.53 à lire) et pour entreprises |

Cas d'échec : le client demande de « copier les mentions d'un concurrent » ou de mettre un numéro d'entreprise « provisoire ». La compétence refuse : elle laisse « [à fournir : numéro d'entreprise confirmé] » et indique la source à demander. Même règle si le site charge un traceur publicitaire absent de l'inventaire : le tableau des traceurs est déclaré incomplet et le texte de cookies n'est pas fini.
