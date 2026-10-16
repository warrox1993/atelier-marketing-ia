---
name: "gouvernance-donnees"
description: "Met en place la gouvernance des données d'une PME belge : catalogue des jeux de données, propriétaire et responsable de chacun, droits d'accès par rôle, durées de conservation, règles de pseudonymisation, circuit d'extraction et de partage, et cadrage de l'usage de l'IA (obligations du règlement européen sur l'IA selon le niveau de risque, à vérifier). À utiliser pour créer ou mettre à jour le catalogue de données, avant d'ouvrir des données à un outil d'analyse ou d'IA, ou pour préparer un contrôle ; jamais pour accorder un accès, décider d'une base légale ou déclarer un usage d'IA conforme."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "donnees"
---

# Gouvernance des données

## Quand l'utiliser

- L'entreprise n'a pas de liste des jeux de données qu'elle détient, ni de responsable pour chacun.
- Un service veut ouvrir des données à un outil de tableau de bord, un prestataire ou un outil d'IA.
- Un contrôle, un client ou un audit demande qui a accès à quoi et pendant combien de temps.

## Objectif

Un catalogue vivant où chaque jeu de données a un propriétaire, une finalité, une classification, des droits d'accès par rôle, une durée de conservation, des règles de pseudonymisation et de partage, et un cadrage clair de l'usage de l'IA. La gouvernance rend les décisions rapides et traçables : elle ne remplace ni le registre des traitements, ni le juriste.

## Prérequis

- La liste des services et des outils qui produisent ou reçoivent des données.
- Le registre des traitements existant (compétence `registre-traitements-rgpd`) ou, à défaut, l'accord pour l'établir.
- Un interlocuteur informatique pour les droits d'accès techniques et la sécurité.

## Entrées

- `jeux` : description des jeux de données (origine, contenu en catégories, volume, outil, service).
- `traitements` : lignes du registre des traitements reliées aux jeux.
- `acteurs` : rôles de l'entreprise (direction, services, informatique, éventuel délégué à la protection des données).
- `usages_ia` : outils d'IA utilisés ou envisagés et données qu'ils recevraient.

## Étapes

1. **Inventorier** les jeux de données : un identifiant `JD-001`, `JD-002`..., un nom, l'outil source, le service, la fréquence de mise à jour.
2. **Désigner un propriétaire métier** (décide de l'usage et de l'accès) et un gardien technique (opère l'outil et la sécurité) par jeu. Un jeu sans propriétaire est signalé à la direction.
3. **Classer** chaque jeu : public, interne, confidentiel, personnel, sensible (catégories particulières). La classe fixe le niveau de contrôle.
4. **Relier au registre des traitements** : finalité, base légale proposée (décidée par le responsable du traitement), destinataires, transferts hors Espace économique européen, sous-traitants.
5. **Définir les droits d'accès par rôle** selon le principe du besoin d'en connaître : lecture agrégée pour la plupart, lecture détaillée pour peu de rôles, écriture réservée aux gardiens. La demande d'accès passe par une carte à l'humain ; l'agent n'accorde rien.
6. **Fixer les durées de conservation** par jeu avec leur justification (obligation légale, finalité, usage). Sans justification, la durée est notée « à justifier » et le jeu figure sur la liste d'examen.
7. **Fixer les règles de pseudonymisation et d'agrégation** : pseudonymiser par défaut, garder la table de correspondance séparée et à accès restreint, agréger avec un effectif minimal par groupe (par exemple pas de cellule de moins de 5 personnes), ne jamais livrer de résultat par personne identifiable. Une donnée pseudonymisée reste une donnée personnelle.
8. **Écrire le circuit d'extraction et de partage** : demande motivée, minimisation (champs et lignes strictement utiles), approbation humaine pour toute donnée personnelle, date de suppression de l'extrait, journal des extractions.
9. **Cadrer l'IA** : lister chaque usage et le classer selon le niveau de risque du règlement européen (usage interdit, haut risque, obligation de transparence, risque minimal), en distinguant le rôle de l'entreprise (utilisatrice ou fournisseuse). Indiquer l'obligation de maîtrise de l'IA pour les personnes qui l'utilisent, l'interdiction d'envoyer à un outil externe des données non autorisées, la supervision humaine des résultats et la conservation des preuves. Toute classification est une proposition à faire confirmer.
10. **Planifier la revue** : date de revue du catalogue (au moins une fois par an), déclencheurs (nouvel outil, incident, départ d'un propriétaire).

## Livrable

Le catalogue de données (tableau : identifiant, nom, propriétaire, gardien, classe, finalité, base légale proposée, durée, accès par rôle, pseudonymisation, outil), la politique d'extraction et de partage en une page, la liste des usages d'IA avec niveau de risque proposé et mesures, la liste des points ouverts à trancher par la direction ou le juriste.

## Critères de réussite

- Chaque jeu a un propriétaire, une classe, une durée justifiée ou signalée « à justifier », et un lien avec une ligne du registre.
- Aucun accès n'est présenté comme accordé : tout accès est une demande à approuver.
- Les données personnelles et sensibles sont minimisées et pseudonymisées par défaut dans tous les circuits décrits.
- Chaque usage d'IA est classé avec sa justification et marqué « à vérifier ».
- Les points ouverts sont listés avec la personne qui peut les trancher.

## Sources officielles

Consultées le 16/10/2026 :

- Règlement (UE) 2016/679 du 27 avril 2016 (RGPD), EUR-Lex, https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:32016R0679 : article 5, paragraphe 1 (licéité, limitation des finalités, minimisation, exactitude, limitation de la conservation, intégrité et confidentialité), article 4, point 5 (pseudonymisation) et article 25, paragraphe 1 (protection dès la conception, mesures techniques et organisationnelles appropriées).
- Règlement (UE) 2024/1689 (loi sur l'IA), EUR-Lex, https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:32024R1689 : lu en partie. Article 4 (niveau suffisant de maîtrise de l'IA), article 5 (pratiques interdites), article 6 (classification des systèmes à haut risque, annexe III) et article 10 (gouvernance des données d'entraînement, de validation et de test). Les articles 50 (transparence) et 113 (dates d'application échelonnées) n'ont pas pu être relus le 16/10/2026 : ils sont cités sans date et marqués « à vérifier ».
- Statbel (https://statbel.fgov.be/fr) : page non lisible le 16/10/2026 (test anti-robot affiché) ; non utilisée.

## À vérifier par un professionnel

La base légale, les durées de conservation, la nécessité d'une analyse d'impact, la désignation d'un délégué à la protection des données, les contrats avec les sous-traitants et la classification des usages d'IA selon le règlement européen sont à confirmer par un juriste ou le délégué à la protection des données avant toute application. Les calendriers d'application du règlement sur l'IA sont échelonnés et sujets à évolution : les dates se vérifient sur le texte à jour.

## Limites

- Le catalogue décrit ce qu'on lui déclare ; un jeu caché dans un tableur personnel n'y figure pas tant que personne ne le signale.
- Les classes, rôles et durées sont des propositions, la décision appartient à la direction et au responsable du traitement.
- La compétence ne configure aucun droit dans les systèmes et ne supprime aucune donnée.
- Elle ne qualifie pas à elle seule un usage d'IA : un cas limite est transmis au juriste.

## Exemple

PME de 25 personnes. Jeu `JD-004` « Export des commandes clients » (outil de facturation, service comptabilité). Propriétaire : la direction financière ; gardien : l'informatique. Classe : personnel. Finalité : facturation et suivi (ligne 3 du registre). Durée : « à justifier » (obligation comptable à vérifier avec l'expert-comptable). Accès : lecture agrégée pour le commercial, lecture détaillée pour la comptabilité seule. Pseudonymisation : identifiant client remplacé par un code pour les analyses ; table de correspondance gardée par l'informatique.

Usage d'IA envisagé : résumer les commentaires clients avec un outil externe. Proposition : risque minimal à vérifier ; condition : commentaires anonymisés avant envoi, accord humain, preuve du contrat avec le prestataire.

Cas d'échec : un responsable commercial demande un export complet des clients avec adresses pour « un test d'un outil d'IA ». Aucune finalité n'est inscrite au registre et le prestataire n'a pas de contrat de sous-traitance. La demande n'est pas exécutée : une carte de décision à la direction expose le problème, propose un extrait pseudonymisé de 200 lignes et attend la réponse du juriste.
