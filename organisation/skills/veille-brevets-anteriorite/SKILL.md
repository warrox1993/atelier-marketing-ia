---
name: "veille-brevets-anteriorite"
description: "Prépare une recherche d'antériorité dans les bases publiques de brevets (Espacenet de l'Office européen des brevets), choisit les classes CPC, lit les revendications élément par élément et rédige une note préliminaire de liberté d'exploitation avec ses limites. À utiliser avant de décider de déposer un brevet, pour surveiller un domaine ou pour repérer des brevets proches d'un produit ; jamais pour conclure qu'une invention est brevetable ou libre d'exploitation, ni pour saisir en ligne la description complète d'une invention non déposée."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "recherche-innovation"
---

# Recherche d'antériorité et veille de brevets

## Quand l'utiliser

- Une PME envisage de déposer un brevet et veut savoir ce qui existe déjà.
- Un produit ou procédé nouveau doit être comparé aux brevets d'un concurrent avant lancement.
- Un domaine technique doit être surveillé tous les trimestres (nouveaux dépôts, nouveaux déposants).
- Un client, un partenaire ou un salarié signale un brevet proche et la direction demande ce qu'il couvre.

## Objectif

Un dossier de recherche rejouable : bases et dates, requêtes exactes, classes CPC, documents retenus et écartés avec la raison, comparaison élément par élément avec l'invention, limites écrites. Le dossier éclaire la décision d'un conseil en propriété industrielle et de l'humain ; il n'est jamais un avis sur la brevetabilité ni sur la liberté d'exploitation.

## Prérequis

- Une description de l'invention en deux niveaux : une version générique (problème, domaine, effet technique) utilisable pour les requêtes, et une version détaillée gardée dans le dossier de la tâche.
- L'accord écrit de l'humain responsable avant toute étape qui exposerait l'invention (saisie dans un outil en ligne qui garde les requêtes, envoi à un tiers).
- Les pays et la période qui comptent pour le marché de l'entreprise.
- La liste de ce qui est déjà connu de l'équipe (brevets, articles, concurrents).

## Entrées

- `invention_generique` : problème technique, domaine, effet recherché, sans le secret de fabrication.
- `invention_detaillee` : éléments techniques, dans le dossier de la tâche uniquement.
- `marches` : pays où l'entreprise vend ou produira.
- `connus` : documents déjà identifiés.
- `objet` : antériorité avant dépôt, veille périodique ou liberté d'exploitation préliminaire.

## Étapes

1. **Protéger la confidentialité d'abord.** Écrire les requêtes avec des termes génériques. Ne jamais copier un paragraphe de la description détaillée dans un moteur en ligne. En cas de doute sur une étape, poser la carte de décision humaine avant de la faire.
2. **Découper l'invention en éléments** (caractéristiques techniques numérotées E1, E2...) : ce sont eux qu'on cherchera et qu'on comparera.
3. **Choisir des classes CPC.** La classification coopérative des brevets (CPC) range les documents par domaine technique ; chercher d'abord une classe proche à partir de brevets connus (leur fiche indique leurs classes), puis élargir par les classes voisines. Noter les classes retenues et pourquoi.
4. **Interroger Espacenet** en croisant mots-clés (avec synonymes et variantes d'orthographe), classes CPC et, si utile, déposants connus. Garder une ligne de journal par requête : date, base, requête exacte, nombre de résultats.
5. **Trier les résultats** : titre et résumé d'abord, revendications ensuite. Regrouper par famille de brevets pour ne pas compter plusieurs fois la même invention publiée dans plusieurs pays.
6. **Lire les revendications.** Une revendication indépendante définit l'étendue de la protection. La découper en éléments, puis dresser pour chaque brevet proche un tableau : élément de l'invention, présent ou absent dans la revendication, passage du document qui le montre. Lire aussi la description pour comprendre les termes, sans confondre exemple et revendication.
7. **Vérifier le statut juridique** de chaque brevet pertinent (en vigueur, expiré, retiré, taxes de maintien payées) dans le registre de l'office concerné. Les données d'une base de recherche peuvent être en retard : écrire « statut à vérifier » tant que le registre n'a pas été consulté.
8. **Rédiger la note** : ce qui est proche, ce qui semble absent des documents trouvés (formulé comme une hypothèse), ce qui n'a pas été couvert (pays, langues, demandes non encore publiées), questions pour le conseil en brevets.
9. **Pour la liberté d'exploitation**, limiter la note à une liste de brevets à examiner par un professionnel, avec pays et statut à vérifier ; ne pas écrire que le produit « ne contrefait pas ».
10. **Poser les cartes de décision** : poursuivre la recherche, consulter un conseil en brevets, déposer, ou garder le secret. Aucune n'est décidée par l'agent.

## Livrable

- Le journal de recherche (base, date, requête, classes CPC, nombre de résultats).
- Le tableau des documents retenus : numéro de publication, titre, date, famille, statut (à vérifier), éléments communs et éléments absents.
- La note de synthèse d'une à trois pages avec les limites en tête.
- La liste des questions pour le conseil en propriété industrielle et les cartes de décision.

## Critères de réussite

- Toute requête est rejouable par une autre personne à partir du journal.
- Chaque document cité porte son numéro de publication, sa date et la base où il a été lu.
- Les éléments de l'invention sont comparés un par un, sans conclusion globale hâtive.
- La note dit ce qu'une recherche en bases publiques ne peut pas voir : les demandes déposées mais pas encore publiées, les documents non brevets, les pays hors périmètre.
- Aucune phrase ne dit « brevetable », « non brevetable », « libre d'exploitation » ni « pas de risque ».
- Aucune description détaillée d'invention non déposée n'est sortie du dossier de la tâche.

## Sources officielles

Consultées le 16/10/2026 par l'agent rédacteur, avec les limites suivantes :

- Office européen des brevets (OEB), pages de présentation d'Espacenet, https://www.epo.org/en/searching-for-patents/technical/espacenet : page ouverte, mais seule la structure du menu a été lisible (rubriques Global Patent Index, bases d'offices nationaux, notes de version) ; les fonctions de recherche n'ont pas pu être confirmées par cette page.
- OEB, texte de l'article 54 de la Convention sur le brevet européen (nouveauté), https://www.epo.org/en/legal/epc/2020/a54.html : page ouverte, texte de l'article non lisible dans l'extraction ; le principe de nouveauté absolue est connu mais n'a pas été confirmé ligne à ligne ici.
- Espacenet (interface de recherche, https://worldwide.espacenet.com/patent/) : accès refusé (erreur 403) le 16/10/2026, non lue.
- Office belge de la propriété intellectuelle (SPF Economie), pages sur les brevets : bloquées par un test anti-robot le 16/10/2026, non lues.
- Page CPC de l'OEB : adresse introuvable (404), non lue. La description de la CPC ci-dessus est donc une connaissance générale, source secondaire à confirmer sur le site de l'OEB.

Les étapes décrivent une méthode courante de recherche, pas un texte officiel.

## À vérifier par un professionnel

Toute décision de déposer, de renoncer ou de lancer un produit repose sur l'avis d'un conseil en propriété industrielle (mandataire agréé) ou d'un avocat spécialisé. Le statut juridique des brevets, l'étendue des revendications et le risque de contrefaçon relèvent de lui. Le délai de priorité après un premier dépôt, la nouveauté et l'effet d'une divulgation antérieure sont à vérifier avec lui avant toute communication publique.

## Limites

- Une recherche en bases publiques n'est jamais exhaustive : les demandes sont publiées environ dix-huit mois après leur dépôt (délai à vérifier auprès de l'office), la traduction automatique déforme les termes techniques, et les publications scientifiques ou commerciales ne sont pas des brevets.
- Les classes CPC aident mais ne remplacent pas les mots-clés : un document peut être mal classé.
- Une revendication se lit avec sa description et son historique d'examen, que cette compétence ne couvre pas.
- Aucune valeur d'avis juridique ; aucune extrapolation d'un brevet étranger à la situation belge sans vérification.

## Exemple

Une PME de 15 personnes conçoit un support de capteur à fixation sans outil pour serres. Elle demande une recherche avant de déposer. Requêtes génériques : « fixation sans outil capteur serre », classes proches relevées à partir de deux brevets connus. Le journal montre 40 résultats triés en 6 familles. Pour la famille la plus proche, tableau : E1 (clip élastique) présent, E2 (verrouillage par rotation d'un quart de tour) absent, E3 (matériau recyclé) non mentionné. La note écrit : « E2 n'apparaît dans aucun des 6 documents lus ; hypothèse seulement, demandes non publiées non couvertes ». Carte : « consulter un conseil en brevets avant tout salon ».

Cas d'échec : l'inventeur colle dans la tâche une demande de « tester » la description complète dans un outil en ligne de recherche par texte libre qui conserve les requêtes. L'agent ne le fait pas : il propose des requêtes génériques, pose une carte de décision humaine sur le risque de divulgation, et note « recherche par texte libre non effectuée, confidentialité ».
