---
name: "cybersecurite-pme"
description: "Définit et explique les mesures de cybersécurité de base d'une PME belge selon le cadre CyberFundamentals du Centre pour la Cybersécurité Belgique (CCB) : authentification multifacteur, mises à jour, sauvegardes, comptes, mots de passe, sensibilisation à l'hameçonnage. À utiliser pour un plan d'action de base, une charte, une séance de sensibilisation ou un contrôle de cyberhygiène à partir de ce que l'humain décrit ; strictement défensif, jamais pour une instruction offensive (intrusion, contournement, test d'attaque, fabrication de faux courriels réalistes), ni pour certifier une conformité."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "informatique"
---

# Cybersécurité de base d'une PME

## Quand l'utiliser

- La direction demande « par quoi commencer » en cybersécurité.
- Préparer une sensibilisation du personnel à l'hameçonnage.
- Relire une charte informatique ou une règle de mots de passe.
- Se situer par rapport à CyberFundamentals avant un éventuel audit ou une exigence d'un client.

## Objectif

Un plan d'action court, ordonné par rapport coût-efficacité, avec pour chaque mesure : pourquoi, qui, comment on vérifie. Une approche défensive uniquement : on explique comment se protéger et reconnaître une attaque, jamais comment la mener.

## Prérequis

- L'inventaire des actifs et le registre des accès (compétence `documentation-technique`), sinon la première action du plan est de les établir.
- La taille de l'entreprise, ses données les plus sensibles, ses outils (messagerie, stockage, accès à distance).
- Savoir si l'entreprise est peut-être concernée par NIS2 (voir `gestion-incident-informatique`).

## Entrées

- `contexte` : effectif, outils, télétravail, incidents passés.
- `niveau_vise` : Small, Basic ou inconnu.

## Étapes

1. **Situer le niveau** du cadre CyberFundamentals (ci-dessous). Une PME ordinaire vise Basic ; une très petite structure aux moyens limités peut commencer par Small.
2. **Contrôler les huit mesures de départ** (liste ci-dessous) : pour chacune, état actuel (en place, partiel, absent, inconnu) et preuve demandée.
3. **Classer les écarts** : d'abord ce qui protège le plus pour le moins d'effort (MFA, mises à jour, sauvegardes testées), ensuite le reste.
4. **Écrire le plan** : 5 à 10 actions, un responsable humain, une échéance, un critère de vérification.
5. **Préparer la sensibilisation** (section suivante).
6. **Dater et planifier la revue** (semestrielle comme repère).

### Le cadre CyberFundamentals

Cadre du CCB : un ensemble de mesures concrètes pour réduire le risque des cyberattaques les plus courantes. Quatre niveaux : Small (8 mesures, très petites organisations), Basic (34 mesures, entreprises ordinaires, environ 82 % des attaques courantes couvertes selon la source consultée), Important (117 mesures, 94 %), Essential (140 mesures, 100 %). Le CCB fournit des outils (évaluation des risques, tableurs d'autoévaluation, modèles de politiques). Une vérification ou certification par un organisme agréé existe pour les niveaux Basic, Important et Essential, pas pour Small. Le cadre est reconnu comme voie vers la conformité aux mesures de la loi belge NIS2 ; les entités soumises doivent vérifier avec le CCB le niveau qui s'applique.

### Les huit mesures de départ (niveau Small)

1. Authentification multifacteur sur tous les accès, au minimum messagerie, accès à distance, comptes d'administration.
2. Mises à jour de sécurité installées sans délai (systèmes, navigateurs, logiciels, équipements réseau) ; automatiques quand c'est possible ; plus aucun logiciel hors support.
3. Antivirus ou protection des postes installé et à jour.
4. Réseau protégé : pare-feu actif, Wi-Fi chiffré, réseau invité séparé, accès à distance sécurisé.
5. Sauvegardes régulières, dont une copie hors ligne ou protégée, restauration testée (voir `documentation-technique`).
6. Compte non administrateur pour le travail quotidien.
7. Protection physique des appareils : verrouillage d'écran, chiffrement des disques des portables, rangement.
8. Plan de réponse aux incidents, même d'une page (voir `gestion-incident-informatique`).

Ces huit points reprennent la liste présentée par un blog tiers résumant le cadre, car la page du CCB n'était pas accessible ; ils sont à confronter aux documents officiels.

### Mots de passe

Repères actuels, conformes aux lignes directrices NIST SP 800-63-4 : privilégier la longueur (15 caractères au moins pour un mot de passe seul, une phrase de passe est idéale) ; ne pas imposer de règles de composition (majuscule, chiffre, symbole) ; ne pas imposer de changement périodique, mais changer immédiatement en cas de compromission avérée ou suspectée ; refuser les mots de passe connus ou fuités ; un mot de passe différent par service ; un gestionnaire de mots de passe pour les retenir ; MFA partout où c'est possible, de préférence par application ou clé matérielle plutôt que SMS.

### Sensibilisation à l'hameçonnage

Contenu de la séance (30 minutes, exemples sans nom de personne ni d'entreprise réelle) :

- Reconnaître : urgence ou menace, expéditeur inattendu ou adresse presque identique, demande de mot de passe, de paiement ou de changement de numéro de compte, pièce jointe ou lien inattendu, faute étrange, QR code dans un courrier, appel ou SMS se faisant passer pour la banque ou un fournisseur.
- Réagir : ne pas cliquer, ne pas répondre ; vérifier par un autre canal connu (téléphoner au numéro habituel, pas à celui du message) ; signaler à la personne désignée ; si on a cliqué ou saisi un mot de passe, le dire tout de suite, le changer depuis un autre appareil, prévenir le responsable informatique. Dire vite n'est jamais sanctionné.
- Fraude au virement : tout changement de coordonnées bancaires est confirmé par un second canal et par deux personnes.
- Signaler les messages douteux au service de signalement de Safeonweb (adresse à confirmer sur le site, qui n'a pas pu être consulté).

Interdit : produire un faux courriel d'hameçonnage réaliste, un faux site ou un script de simulation. Si l'entreprise veut un exercice, il passe par un prestataire spécialisé, avec l'accord écrit de la direction et information préalable du personnel.

## Livrable

Un plan de cyberhygiène en Markdown : tableau des huit mesures (état, preuve, écart, action, responsable, échéance), plan priorisé, support de sensibilisation d'une page, règle de mots de passe proposée, date de la prochaine revue.

## Critères de réussite

- Chaque mesure porte un état fondé sur une preuve ou « inconnu ».
- Chaque action a un responsable humain et une échéance.
- Le support de sensibilisation est compréhensible sans vocabulaire technique.
- Aucune instruction offensive, aucun outil d'attaque, aucun secret.
- La compétence ne prétend jamais que l'entreprise est « conforme » ou « certifiée ».

## Sources officielles

Consultées le 16/10/2026 :

- « NIST SP 800-63-4, Digital Identity Guidelines, Authenticators », https://pages.nist.gov/800-63-4/sp800-63b.html : mots de passe d'au moins 15 caractères en facteur unique (8 avec un second facteur), pas de règles de composition, pas de changement périodique imposé, comparaison à une liste de mots de passe connus ou compromis, MFA encouragée.
- « Data Backup Options », CISA, https://www.cisa.gov/sites/default/files/publications/data_backup_options.pdf : règle 3-2-1, test de restauration, copie déconnectée.
- « CyberFundamentals Framework », résumé d'un blog personnel (source secondaire, non officielle), https://osix-site.statichost.eu/blog/security/20250424/cyberfundamentals.html : quatre niveaux, nombre de mesures, huit mesures du niveau Small. Source secondaire, à confronter au site du CCB.
- Loi du 26 avril 2024 (NIS2), Justel, https://www.ejustice.just.fgov.be/cgi_loi/article.pl?language=fr&lg_txt=f&type=&sort=&numac_search=2024202344&cn_search=2024042637&caller=eli&&view_numac=2024042637n : les mesures de gestion des risques comprennent cyberhygiène et authentification multifacteur ; présomption de conformité par évaluation de conformité agréée.

Non consultables : les sites du CCB (ccb.belgium.be, atwork.safeonweb.be) et de Safeonweb (safeonweb.be) ont refusé l'accès (erreur 403). Aucune page de ces sites n'est citée ; les chiffres du cadre viennent de la source secondaire ci-dessus.

## À vérifier par un professionnel

- Toute affirmation de conformité à CyberFundamentals ou à NIS2, et le niveau applicable : CCB, organisme d'évaluation agréé, ou conseiller en cybersécurité.
- La charte informatique et le contrôle du personnel (surveillance de la messagerie, sanctions) : conseiller en droit social et DPO.
- La configuration technique (pare-feu, MFA, chiffrement) : responsable informatique ou prestataire.

## Limites

- Le nombre de mesures et les pourcentages de couverture sont ceux de la source secondaire, à reconfirmer.
- Les huit mesures ne remplacent ni une analyse de risques ni un audit.
- La sensibilisation réduit le risque, elle ne l'annule pas : les contrôles techniques (MFA, mises à jour, sauvegardes) restent indispensables.
- Aucune évaluation d'intrusion ni test d'attaque.

## Exemple

Entreprise de 9 personnes, messagerie en ligne, un serveur de fichiers, deux télétravailleurs. Réponses : MFA sur la messagerie pour la direction seulement ; mises à jour manuelles ; sauvegarde sur disque USB ; tout le monde travaille en administrateur.

Plan : (1) MFA pour tous les comptes de messagerie, responsable le gérant, échéance 31/10, preuve : liste des comptes avec MFA ; (2) mises à jour automatiques activées, preuve : capture du réglage ; (3) comptes quotidiens non administrateurs, un compte administrateur distinct ; (4) sauvegarde hors site et test de restauration ; (5) séance de sensibilisation de 30 minutes en novembre.

Cas d'échec : un responsable demande de rédiger un faux courriel de la banque « bien réaliste » pour tester les salariés. La compétence refuse de produire le message, explique pourquoi (risque de fuite, de détresse, de contournement du consentement), et propose à la place des exemples génériques annotés et, si la direction y tient, le recours à un prestataire avec accord écrit.
