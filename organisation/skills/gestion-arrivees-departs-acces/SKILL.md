---
name: "gestion-arrivees-departs-acces"
description: "Prépare la liste ordonnée et datée des actions informatiques pour l'arrivée, le changement de fonction ou le départ d'un collaborateur : comptes, droits d'accès selon le moindre privilège, authentification multifacteur, matériel et licences, puis au départ blocage de la connexion, révocation des sessions, retrait des licences et des groupes, sort de la boîte et des fichiers décidé par l'humain. À utiliser dès qu'une arrivée, une mutation ou un départ est annoncé ; jamais pour créer, modifier ou supprimer un accès ou des données à la place de l'humain."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "informatique"
---

# Arrivées, départs et accès

## Quand l'utiliser

- Un collaborateur arrive : il lui faut des comptes, des droits, du matériel et des licences le premier jour.
- Un collaborateur change de fonction : ses anciens droits doivent partir quand les nouveaux arrivent.
- Un collaborateur part (fin de contrat, démission, licenciement) : ses accès doivent être coupés à la bonne heure,
  sans perdre les données dont l'entreprise a besoin.

## Objectif

Une liste d'actions ordonnée, datée et attribuée, qui couvre tous les accès connus de la personne, applique le
moindre privilège, et laisse à l'humain chaque action sur un compte et chaque décision sur les données.

## Prérequis

- L'annonce de l'événement (arrivée, mutation, départ) avec la date et l'heure effectives, transmise par les ressources
  humaines par le bureau de liaison (aucun motif de départ n'est demandé ni noté).
- Le registre des comptes et accès (compétence `documentation-technique`) et l'inventaire du matériel et des licences.
- Le profil de droits de la fonction (rôle type) validé par le responsable du service.

## Entrées

- `evenement` : arrivée, mutation ou départ ; date et heure.
- `fonction` : ancienne et nouvelle fonction, service, responsable.
- `acces_actuels` : comptes et droits connus (applications, groupes, partages, accès distants, comptes partagés
  connus).
- `materiel` : postes, téléphones, badges, jetons.

## Étapes

1. **Lister tous les accès** de la personne à partir du registre et de l'entrée ; un accès mentionné nulle part
   ailleurs est ajouté au registre, pas ignoré.
2. **Arrivée** : comptes à créer, droits du rôle type et pas plus, authentification multifacteur à activer dès la
   première connexion, matériel et licences, accès distants seulement si la fonction l'exige, date de revue des droits
   à trois mois.
3. **Mutation** : droits de la nouvelle fonction ajoutés à la date effective, droits de l'ancienne retirés à la même
   date (ou à une date de passation écrite), jamais cumulés sans limite.
4. **Départ**, dans cet ordre, chaque action avec date et heure :
   1. bloquer la connexion à l'heure effective du départ ;
   2. révoquer les sessions ouvertes et les jetons d'accès ;
   3. vérifier avant retrait ce que chaque licence et chaque groupe donnent (aperçu, sans exécuter) ;
   4. retirer les licences, les groupes, les partages et les accès distants ;
   5. changer le secret de tout compte partagé que la personne connaissait (par l'humain, dans le gestionnaire de mots
      de passe) ;
   6. récupérer le matériel et les badges.
5. **Boîte et fichiers** : proposer le sort (conversion en boîte partagée, transfert à un responsable, réponse
   automatique, durée de conservation), sans rien exécuter. La conservation et la suppression de la boîte d'un ancien
   collaborateur sont des décisions humaines, prises au regard de la minimisation et des durées de conservation de
   l'entreprise. Aucune donnée n'est supprimée sans décision écrite.
6. **Contrôle** : chaque accès listé à l'étape 1 a une action et une date ; mise à jour du registre.
7. **Carte de décision** pour la création, la modification ou la suppression d'accès et pour le sort des données.

## Livrable

Une liste ordonnée (action, système, date et heure, responsable humain, statut), la proposition pour la boîte et les
fichiers, la mise à jour du registre des accès, et la carte de décision.

## Critères de réussite

- Tous les accès connus de la personne sont couverts par une action datée.
- Au départ, le blocage de la connexion et la révocation des sessions viennent en premier.
- Zéro suppression de données sans décision humaine écrite ; le transfert de la boîte est proposé, pas exécuté.
- Aucun secret dans le livrable ; aucun motif de départ.

## Sources officielles

Textes de référence déjà cités par les compétences voisines (`registre-traitements-rgpd`, `cybersecurite-pme`) :

- Règlement (UE) 2016/679 (RGPD), EUR-Lex, https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:32016R0679 :
  article 5 (minimisation, limitation de la conservation) et article 32 (sécurité du traitement).
- NIST SP 800-63B, https://pages.nist.gov/800-63-4/sp800-63b.html : authentification multifacteur et gestion des
  authentifiants (référence américaine, reprise comme bonne pratique).

La consultation de la boîte d'un ancien collaborateur touche au secret des communications et à la vie privée : règles
belges (dont la CCT nº 81 pour les communications électroniques) à vérifier par le juridique avant toute consultation.

## À vérifier par un professionnel

L'accès au contenu de la boîte d'un ancien collaborateur, la durée de conservation de sa boîte et de ses fichiers, et
l'information du collaborateur relèvent du juridique et du délégué à la protection des données ; les actions sur les
comptes, du responsable informatique.

## Limites

- La compétence n'exécute aucune commande sur un annuaire ou un service en ligne ; aucun script n'est fourni.
- Elle ne traite pas du volet ressources humaines (contrat, documents sociaux).
- Un accès inconnu du registre ne peut pas être couvert : la liste demande au responsable de compléter.

## Exemple

Départ le 31/10/2026 à 17 h d'une gestionnaire avec accès à la messagerie, au partage « Clients », au logiciel de
gestion des contrats et au portail d'une compagnie. Liste : 31/10 17 h blocage de la connexion et révocation des
sessions ; 31/10 17 h 15 aperçu puis retrait des licences et des groupes ; changement du mot de passe du portail
partagé par le responsable ; 03/11 récupération du portable. Boîte : conversion en boîte partagée accessible au
responsable pendant trois mois proposée, décision humaine.

Cas d'échec : la liste oublie le portail de la compagnie parce qu'il n'est pas dans l'annuaire. L'entrée le
mentionnait : chaque accès de l'entrée doit avoir une action.

## Origine de la méthode

Ordre des étapes d'un départ (bloquer la connexion, révoquer les sessions, aperçu avant retrait, retrait des licences
et des groupes, sort de la boîte) adapté de github.com/alirezarezvani/claude-skills,
`engineering-team/skills/ms365-tenant-manager/SKILL.md` (« Workflow 3: User Offboarding »), commit
19392f7a08264ed00486a251f5b2098321771f94, licence MIT, Copyright (c) 2025 Alireza Rezvani. Les scripts PowerShell
ne sont pas repris. Modifications : traduction, outils neutres, minimisation RGPD, décisions humaines. Licence et
reprises : `organisation/skills/LICENCES-TIERS.md`.
