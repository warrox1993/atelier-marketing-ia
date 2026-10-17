---
name: "documentation-technique"
description: "Établit la documentation technique d'une PME belge : inventaire des actifs informatiques, procédures d'exploitation, plan de sauvegarde 3-2-1 avec test de restauration, registre des comptes et des accès (moindre privilège, authentification multifacteur). À utiliser pour créer, compléter ou auditer ces documents à partir de ce que l'humain fournit ; jamais pour inventer un équipement, un accès ou un résultat de test, recopier un mot de passe ou une clé, ni modifier un système."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "informatique"
---

# Documentation technique d'une PME

## Quand l'utiliser

- Personne d'autre que le responsable informatique (ou le prestataire) ne sait ce qui existe ni comment le remettre en route.
- Avant un audit, une assurance cyber, une passation ou un départ.
- Pour préparer le terrain d'une procédure d'incident : on ne gère pas bien ce qu'on n'a pas inventorié.

## Objectif

Quatre documents courts, tenus à jour, lisibles par un remplaçant : inventaire, procédures, plan de sauvegarde avec preuve de restauration, registre des comptes et accès. Ce qui n'est pas connu est écrit « information manquante », avec la personne à interroger.

## Prérequis

- La personne ou le prestataire qui connaît l'environnement, et un export ou une liste de départ (même un tableur).
- La liste des applications métier et des données personnelles qu'elles contiennent.
- Aucun mot de passe, clé ou jeton : ils restent dans le gestionnaire de mots de passe.

## Entrées

- `sources` : inventaires existants, exports d'annuaire, factures de licences, schémas, scripts.
- `perimetre` : un site, tout, un service.
- `date_extraction` pour chaque source.

## Étapes

1. **Inventorier les actifs.** Un tableau, une ligne par actif : identifiant, type (poste, serveur, imprimante, équipement réseau, téléphone, service en ligne, licence), usage, propriétaire (une personne ou un service), emplacement, système et version, date de fin de support, données hébergées (aucune, internes, personnelles), criticité (1 à 3), sauvegardé oui ou non. Ajouter les services en ligne : messagerie, stockage, comptabilité, site web, nom de domaine.
2. **Classer par criticité.** Critique : l'entreprise s'arrête en moins d'une journée sans lui. Écrire le temps de remise en route toléré (repère à fixer par la direction).
3. **Rédiger les procédures d'exploitation** pour les tâches répétées et à risque : arrivée et départ d'un salarié, installation d'un poste, mise à jour, renouvellement du nom de domaine et des certificats, ajout d'un accès, mise au rebut d'un matériel avec effacement des données. Chaque procédure d'exploitation suit une structure fixe : en-tête (propriétaire, fréquence, date de mise à jour,
   dernière exécution) ; but et moment de l'utiliser ; prérequis (accès, outils, données) ; procédure en étapes
   numérotées, chacune avec l'action exacte, le résultat attendu et quoi faire si elle échoue ; vérification finale ;
   tableau de dépannage (symptôme, cause probable, correction) ; retour arrière ; escalade (situation, qui, comment) ;
   historique des exécutions (date, par qui, remarques). « Lancer le script » n'est pas une étape : l'étape dit quelle
   commande, depuis quel poste, avec quels paramètres (sans aucun secret).
4. **Établir le plan de sauvegarde** (voir ci-dessous) et en planifier le test.
5. **Tenir le registre des comptes et accès** (voir ci-dessous), revu au moins deux fois par an et à chaque départ.
6. **Dater et attribuer.** Chaque document porte une version, une date, un propriétaire et une date de prochaine revue.
7. **Lister les trous** : actif sans propriétaire, système hors support, sauvegarde jamais testée, compte sans responsable.

### Plan de sauvegarde 3-2-1

Règle : trois copies des données (l'original plus deux sauvegardes), sur deux types de supports différents, dont une copie hors du site. Pour résister aux rançongiciels, au moins une copie est déconnectée du réseau ou protégée contre la modification et la suppression.

Le plan indique, pour chaque ensemble de données critique : ce qui est sauvegardé, fréquence, durée de conservation, lieu de chaque copie, qui surveille les alertes d'échec, qui peut restaurer. Les données personnelles sauvegardées suivent les durées de conservation de l'entreprise : une sauvegarde ne prolonge pas indéfiniment des données qui devraient être supprimées.

### Test de restauration

Une sauvegarde non testée n'est pas une sauvegarde. Le plan prévoit, comme repère de départ à ajuster : restauration d'un fichier choisi au hasard chaque mois, restauration d'une application ou d'une base complète chaque trimestre, scénario de reprise globale chaque année. Chaque test laisse une trace : date, jeu restauré, durée mesurée, résultat, anomalies, signature du responsable. Un test jamais réalisé est écrit « jamais testé », pas « ok ».

### Comptes et accès

Registre : compte (identifiant, pas le secret), personne ou service, système, niveau de droits, date de création, dernier contrôle, MFA activée oui ou non. Règles :

- **Moindre privilège** : chacun a les droits nécessaires à sa fonction et rien de plus ; les droits d'administrateur sont réservés à des comptes distincts, utilisés pour les seules tâches d'administration.
- **MFA** (authentification multifacteur) sur la messagerie, l'accès à distance, les comptes administrateurs et les services en ligne contenant des données sensibles.
- **Pas de compte partagé** sauf impossibilité technique, alors documenté avec un responsable et un journal d'utilisation.
- **Départ** : désactivation des accès le jour du départ, transfert des fichiers et de la messagerie à un responsable, récupération du matériel.
- **Secrets** : dans un gestionnaire de mots de passe, jamais dans un tableur ni un courriel.
- Voir la compétence `cybersecurite-pme` pour les règles de mots de passe.

## Livrable

Un dossier Markdown : `inventaire`, `procedures`, `plan-sauvegarde`, `registre-acces`, `trous-a-combler`. Chaque fichier a version, date, propriétaire, prochaine revue. Un en-tête de commentaires est proposé pour chaque script documenté, à insérer par l'humain.

## Critères de réussite

- Aucun actif sans propriétaire ni criticité renseignée, ou alors listé dans les trous.
- Aucun secret dans les documents.
- Le plan de sauvegarde montre trois copies, deux supports, une copie hors site et une copie protégée, ou signale laquelle manque.
- Au moins un test de restauration daté est consigné, sinon la mention « jamais testé » apparaît en tête.
- Un remplaçant peut refaire une procédure sans poser de question.
- Chaque procédure d'exploitation contient les rubriques de la structure fixe, dont le retour arrière et l'escalade.

## Sources officielles

Consultées le 16/10/2026 :

- « Data Backup Options », CISA (agence américaine de cybersécurité), https://www.cisa.gov/sites/default/files/publications/data_backup_options.pdf : règle 3-2-1 (trois copies, deux supports, une copie hors site), importance de tester régulièrement la restauration, copie déconnectée du réseau contre les rançongiciels. Source étrangère, utilisée comme référence technique reconnue.
- « NIST SP 800-63-4, Digital Identity Guidelines, Authenticators », https://pages.nist.gov/800-63-4/sp800-63b.html : recommandations d'authentification (longueur, pas de changement périodique imposé, MFA). Texte long, seules les premières sections ont été lues.
- Loi du 26 avril 2024 (NIS2), Justel, https://www.ejustice.just.fgov.be/cgi_loi/article.pl?language=fr&lg_txt=f&type=&sort=&numac_search=2024202344&cn_search=2024042637&caller=eli&&view_numac=2024042637n : les mesures de gestion des risques comprennent la continuité d'activité, la cyberhygiène et l'authentification multifacteur.

Les durées de test de restauration, les seuils de criticité et les fréquences de revue sont des repères de pratique, pas des textes officiels. Les pages du CCB n'ont pas pu être consultées (accès refusé).

## À vérifier par un professionnel

- Le responsable informatique ou le prestataire valide l'exactitude technique de l'inventaire et réalise les tests de restauration.
- Les durées de conservation des données sauvegardées et l'inscription des traitements au registre (RGPD, article 30) : délégué à la protection des données ou juriste.
- Si l'entreprise relève de NIS2 : conseiller en cybersécurité ou juriste pour calibrer la documentation exigée.

## Limites

- La compétence documente à partir de ce qu'on lui donne ; elle ne scanne rien et ne se connecte à rien.
- Un inventaire est vrai le jour de l'extraction : la date est obligatoire.
- Elle ne choisit pas l'outil de sauvegarde ni le prestataire.

## Exemple

Entreprise de 12 personnes, un serveur de fichiers, une messagerie en ligne. Extrait fourni : tableur de 14 lignes.

Constat : serveur de fichiers, propriétaire « responsable administratif », criticité 3, Windows Server dont la fin de support est à vérifier (information manquante), sauvegarde quotidienne sur un disque USB resté branché au serveur. Analyse 3-2-1 : une seule copie en plus de l'original, un seul support, aucune copie hors site, copie non déconnectée donc exposée à un rançongiciel. Test de restauration : jamais testé. Trous listés avec actions : ajouter une copie hors site, déconnecter ou protéger une copie, planifier un test de fichier ce mois-ci.

Cas d'échec : le tableur contient une colonne « mot de passe administrateur ». La compétence ne la recopie pas, la signale comme risque majeur, écrit « secret à retirer du tableur et à placer dans un gestionnaire de mots de passe », et recommande de considérer ces mots de passe comme compromis donc à changer.

## Origine de la méthode

Structure fixe d'une procédure d'exploitation adaptée et traduite de github.com/anthropics/knowledge-work-plugins,
`operations/skills/runbook/SKILL.md`, commit 33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0.
Modifications : traduction, règles de secrets et de sauvegarde de l'atelier. Licence et reprises :
`organisation/skills/LICENCES-TIERS.md`.
