---
name: "liens-entrants-seo"
description: "Construit un plan de liens entrants et de mentions tierces pour une PME ou un courtier belge : vérifie d'abord que les liens sont bien le frein (écart de liens par page), choisit les tactiques par effort et qualité, qualifie les sites cibles, prépare des messages à faire valider, impose les attributs sponsored ou nofollow aux placements payants et mesure liens, positions et citations par les assistants d'IA. À utiliser quand une page bien construite ne progresse pas faute d'autorité ou pour évaluer un fournisseur de liens ; jamais pour acheter ou échanger des liens qui transmettent du crédit de classement, ni pour envoyer sans validation."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "seo"
---

# Liens entrants et mentions tierces

## Quand l'utiliser

- Une page correcte (indexée, qui répond à l'intention de recherche) stagne alors que les pages mieux classées reçoivent bien plus de liens.
- L'entreprise veut être citée sur les pages que les moteurs de recherche et les assistants d'IA lisent pour sa catégorie.
- Un fournisseur de liens, une agence ou un site propose un placement et il faut savoir s'il est sûr.
- Une marque, un partenaire ou un client est cité sans lien et le lien peut être demandé.

## Objectif

Obtenir des liens et des mentions utiles vers les pages qui en ont besoin, sur des sites pertinents, sans créer ce que Google traite comme du spam de liens, et mesurer deux résultats : le gain de classement et la présence dans les réponses des assistants d'IA.

## Prérequis

- Les pages cibles et les requêtes (et questions posées aux assistants d'IA) sur lesquelles elles doivent apparaître.
- La position actuelle sur ces requêtes et les pages qui les devancent.
- Les atouts qui méritent un lien : données propres, outil, modèle de document, page partenaire, expert reconnu, clients et partenaires.
- Le temps disponible, le budget et la personne qui enverra les messages ; les outils de données de liens (sinon la console de recherche du site et les opérateurs de recherche).
- L'historique : fournisseurs de liens passés, placements payants, échanges de liens, action manuelle signalée dans la console de recherche.

## Entrées

- `pages_cibles` : pages à faire progresser, avec requêtes visées.
- `contraintes` : heures par semaine, budget, langues (FR, NL, EN).
- `historique` : fournisseurs et pratiques passés.

## Étapes

1. **Confirmer que les liens sont le frein.** Vérifier la page d'abord (indexée, intention couverte, aussi complète que celles qui la devancent) ; sinon renvoyer à `audit-seo`. Comparer, page contre page et non domaine contre domaine, le nombre de domaines qui renvoient vers la page cible et vers les trois à cinq pages qui la devancent. Lecture : beaucoup plus de domaines pertinents chez les concurrents, c'est un écart d'autorité (plan de liens) ; nombre voisin mais classement inférieur, c'est un écart de contenu ou de fraîcheur (corriger la page) ; classement obtenu avec peu de liens, requête peu disputée (contenu et maillage interne suffisent) ; très peu de liens partout, c'est un écart de fondation (annuaires, partenaires, mentions non liées d'abord). Ajouter les liens internes depuis les pages les plus fortes avant de chercher des liens externes.
2. **Avoir quelque chose à citer.** Atouts classés par fréquence de liens gagnés seuls : statistiques et données propres, outils et calculateurs, glossaire, modèles et listes de contrôle, pages de partenaires et d'intégrations. Placer l'atout près de la page cible et le relier à elle.
3. **Choisir les tactiques par effort et qualité**, en commençant par le haut : (a) mentions sans lien à réclamer (le site parle déjà de l'entreprise) ; (b) pages de partenaires, de clients, de fournisseurs, d'événements dont l'entreprise est sponsor ou intervenant ; (c) liens cassés ou redirigés vers l'entreprise (redirections permanentes d'abord, puis demande de mise à jour) ; (d) inclusion dans les listes « meilleurs X » que les moteurs citent ; (e) pages de ressources et d'outils d'un secteur ou d'une fédération ; (f) remplacement d'un lien mort par un atout équivalent ; (g) articles d'expert sur des sites éditoriaux ; (h) relations presse et podcasts (renvoi à `communique-de-presse` et `veille-medias`) ; (i) annuaires, avis, communautés (en ancrage de fondation). Garder trois ou quatre tactiques à la fois.
4. **Pour la visibilité dans les assistants d'IA**, lister les pages tierces que les assistants citent déjà pour les questions de la catégorie (articles comparatifs, avis, fils de discussion) : elles forment le haut de la liste de cibles, lien suivi ou non. Si les assistants citent surtout les sites d'entreprises de la catégorie, le contenu propre pèse plus que la prospection (voir `contenu-recherche-ia`).
5. **Qualifier chaque cible avant d'écrire.** Pertinente (les lecteurs ont besoin de l'offre ; le sujet pèse plus que la note d'autorité), réelle (trafic non effondré, normes éditoriales, pas de liens sortants commerciaux sans rapport), joignable (une personne nommée qui tient la page), utile (la page liée en a besoin ou la mention apparaît là où l'on cite). Écarter les sites qui acceptent tout contre paiement.
6. **Rédiger les messages à faire valider.** Court, précis, sur leur page : ce qui a été remarqué, pourquoi la ressource aide leurs lecteurs, une seule demande. Pour une réclamation de mention : la phrase exacte et la page la plus utile à lier. Pour une liste « meilleurs X » : de quoi les évaluer honnêtement (résumé, public visé, prix, essai), sans demander la première place. Les règles d'envoi suivent `recherche-prospects` (base légale, liste de suppression). Aucun envoi sans validation de la liste et du texte.
7. **Rester dans les règles.** Un placement payant, un échange de produit ou de service contre un article avec lien, un lien en échange d'un autre, un lien tiré d'un réseau de blogs, une insertion payée dans un vieil article ou un outil automatique de création de liens ne sont admis que si le lien porte `rel="sponsored"` ou `rel="nofollow"` et si le contenu est identifiable comme publicité ; les trois derniers sont refusés d'emblée. Un article d'invité utilise une ancre de marque ou neutre, jamais une expression-clé exacte. Laisser aux autres le choix de l'ancre. Ne pas planifier un rythme de liens ; répartir les liens sur plusieurs pages.
8. **Évaluer un fournisseur.** Refuser s'il vend des liens « suivis » au prix du lien ou selon une note d'autorité ; s'il ne montre pas les placements réels sur des sites avec audience et auteurs nommés ; si ses sites acceptent toute demande ; s'il laisse choisir des ancres exactes ; s'il ne rapporte que des nombres de liens sans classement ni trafic. Une agence sérieuse vend du travail (contenu, relations presse, démarchage), pas un résultat garanti.
9. **Profil déjà abîmé.** Action manuelle : lire l'avis, retirer ou qualifier les liens maîtrisés, documenter l'impossible, puis demande de réexamen. Sans action manuelle mais avec des liens achetés : arrêter d'acheter, demander le retrait ou l'attribut, gagner des liens propres. Désaveu de liens seulement s'il y a action manuelle ou risque réel de l'être, jamais sur la seule foi d'un score « toxique ».
10. **Mesurer deux résultats**, par page cible et non en total : nouveaux domaines référents (mensuel), classements (mensuel, retard de plusieurs semaines), mentions sur les pages citées par les assistants, taux de mention et de recommandation sur les questions suivies, entonnoir de prospection (qualifiées, contactées, répondu, placées), trafic et conversions venus des sites référents.

## Livrable

Un plan en sept parties : diagnostic par page (le frein est-il le lien, écart page contre page) ; atouts existants et à créer d'abord ; mélange de tactiques et raison ; liste de cibles qualifiées (page, contact, angle, citée ou non par les assistants) ; messages à valider, un par tactique au moins ; notes de risque (profil actuel ou fournisseur proposé) ; objectifs de mesure à 30 et 90 jours.

## Critères de réussite

- Le diagnostic compare des pages, pas des domaines, et dit si le frein est le lien ou la page.
- Chaque cible porte une raison de pertinence et une personne joignable.
- Aucun lien acheté ou échangé sans attribut `sponsored` ou `nofollow` ; aucune promesse de gain de classement pour un placement payant.
- Aucune ancre exacte imposée ; aucun rythme de liens promis.
- Aucun message envoyé sans validation humaine.
- Les résultats sont rapportés par page cible, avec classements et mentions, pas par total de liens.

## Limites

- Les politiques de Google évoluent : la version amont a été contrôlée contre les règles de spam du 28/08/2026 ; à relire avant de conseiller un cas limite.
- Les données de liens dépendent de l'outil (couverture variable) ; sans outil payant, la console de recherche du site ne montre que les liens vers soi.
- Le classement réagit avec retard et dépend aussi du contenu ; aucun résultat n'est garanti.
- L'agent prépare et ne publie, n'envoie ni ne paie rien.

## À vérifier par un professionnel

- L'obligation que la publicité soit identifiable comme telle (Code de droit économique) pour un contenu sponsorisé, et le traitement des données personnelles de contacts dans la prospection (voir `recherche-prospects`) : à confirmer par un juriste ou le délégué à la protection des données.

## Exemple

Un cabinet de courtage liégeois voit sa page « assurance flotte » derrière trois concurrents. Comparaison page contre page : 4 domaines référents contre 25 à 40. La page est indexée et complète, le frein est bien l'autorité. Atouts : un guide chiffré des sinistres flotte (données propres). Tactiques : réclamer deux mentions sans lien, demander l'inscription sur la page d'une fédération professionnelle dont le cabinet est membre, proposer le guide à deux sites sectoriels. Un fournisseur propose dix liens suivis à prix fixe : refusé (vente de crédit de classement). Les messages sont rédigés pour validation.

## Origine de la méthode

Diagnostic du frein, classement des tactiques par effort, règles sur les liens payants, évaluation d'un fournisseur et mesure par page adaptés et traduits de github.com/coreyhaines31/marketingskills, `skills/link-building/SKILL.md` et son fichier amont « risk-policy » (version 2.13.0, commit e85f3cbc2e4a79bf33b2a12e9bdd9087d414735b), licence MIT, Copyright (c) 2025 Corey Haines. Modifications : réécriture en français, renvois vers les compétences de l'atelier, cadre belge. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
