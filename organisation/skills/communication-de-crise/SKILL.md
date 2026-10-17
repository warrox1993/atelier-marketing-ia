---
name: "communication-de-crise"
description: "Prépare et conduit la communication de crise d'une PME belge : cellule de crise, rôles, message d'attente, porte-parole, questions-réponses, journal de crise, coordination interne et externe, retour d'expérience. À utiliser dès qu'un événement (accident, fuite de données, rappel de produit, mise en cause publique, panne majeure) menace la réputation ou la sécurité de personnes ; jamais pour nier ou spéculer, ni pour diffuser sans approbation humaine, ni pour remplacer les obligations légales de notification ou l'avis d'un avocat."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "communication"
---

# Communication de crise d'une PME belge

## Quand l'utiliser

- Un événement grave touche l'entreprise : accident, incident de sécurité, fuite de données, rappel de produit, mise en cause sur les réseaux sociaux ou dans la presse, panne majeure, décès, cyberattaque.
- Un journaliste appelle sur un sujet que l'entreprise ne maîtrise pas encore.
- L'entreprise veut préparer à froid un dispositif de crise (cellule, modèles, exercices).
- Après une crise, pour organiser le retour d'expérience.

## Objectif

Protéger d'abord les personnes, puis la confiance : une cellule qui décide vite, un message d'attente prêt en quelques minutes, un seul fil de faits, un porte-parole préparé, un journal qui permet de reconstituer chaque décision, et des textes cohérents entre l'interne et l'externe. Rien ne part sans approbation humaine.

## Prérequis

- Le nom du responsable de crise (décideur), du porte-parole et de leurs suppléants, fixés par la direction.
- Les numéros d'urgence internes et la liste des canaux (site, réseaux sociaux, standard, courriel).
- Le contact du juridique, de l'assureur et, pour une fuite de données, du délégué à la protection des données s'il existe.
- Les faits confirmés au moment de la demande, avec heure et source.

## Entrées

- `evenement` : ce qui s'est passé, selon les faits confirmés seulement.
- `heure_debut` : heure de connaissance de l'événement.
- `personnes_touchees` : nombre estimé et nature (en agrégat, jamais de noms).
- `niveau` : 1 (incident contenu), 2 (visibilité publique probable), 3 (atteinte aux personnes, mise en cause grave ou obligation de notifier une autorité).
- `parties_prenantes` : personnel, clients, partenaires, autorités, presse, voisins.

## Étapes

1. **Évaluer le niveau et alerter.** Classer 1, 2 ou 3 d'après des critères écrits (personnes en danger, visibilité, obligation légale). Au niveau 3, poser immédiatement une carte à l'humain responsable avant toute rédaction.
   **Liste des 60 premières minutes** : confirmer les faits (ce qui est établi, par qui, à quelle heure) ; désigner un seul porte-parole ; préparer le message d'attente ; fixer l'heure de la prochaine mise à jour. En cas de fuite de données, de blessure, de procès ou d'intervention d'une autorité, demander l'avis juridique avant tout aveu de faute ou toute publication.
2. **Constituer la cellule de crise** : décideur, porte-parole, responsable des faits, responsable juridique, responsable interne, responsable des réseaux sociaux et de la veille, secrétaire du journal. Une personne peut cumuler dans une PME, jamais décideur et secrétaire.
3. **Ouvrir le journal de crise** (voir livrable) : chaque ligne porte heure, fait ou décision, source, auteur. Les faits confirmés sont séparés des rumeurs.
4. **Fixer la table des faits unique** : ce qui est établi, ce qui est en cours de vérification, ce qui est inconnu. Tous les textes en sortent. Mise à jour à chaque confirmation, avec l'heure.
5. **Rédiger le message d'attente** (moins de 100 mots, validé par l'humain) : reconnaître l'événement sans le qualifier, dire que les personnes passent d'abord, indiquer ce qui est fait, donner l'heure de la prochaine information et le contact. Pas de cause, pas de responsabilité, pas de chiffre non confirmé.
6. **Préparer le porte-parole** : un seul porte-parole externe ; trois messages à tenir ; ce qu'il ne dit pas (cause non établie, nom d'une personne, estimation des dégâts, montant d'indemnisation) ; la phrase de repli « Je préfère ne pas spéculer, nous reviendrons vers vous à HH h ». Les autres personnes renvoient vers lui.
7. **Écrire les questions-réponses** (au plus 15) : les questions les plus dures d'abord, réponse courte, preuve ou source, réponse interdite. Pas de réponse « sans commentaire ».
8. **Coordonner interne et externe.** Le personnel est informé avant ou en même temps que la presse quand il est concerné ; les représentants du personnel sont prévenus selon la procédure décidée avec un avocat en droit social ; une consigne simple aux collaborateurs : ne pas commenter, transmettre toute demande presse au porte-parole.
9. **Adapter aux canaux et aux langues.** Site (bandeau ou page dédiée), réseaux sociaux (un message, pas de débat), courriel aux clients ou partenaires, affichage, standard ; version FR et NL si le public l'est. Suspendre les publications promotionnelles planifiées pendant la crise.
10. **Gérer les obligations légales sans les confondre avec la communication.** Notification d'une violation de données, déclaration d'accident, information d'une autorité ou d'un assureur : listées, confiées au juridique, avec les délais à vérifier ; la communication ne retarde jamais une notification légale.
11. **Surveiller et répondre.** Veille presse et réseaux sociaux toutes les heures au début ; chaque demande de journaliste est consignée (média, heure, question, réponse, auteur). Un fait faux publié est rectifié par une demande courtoise au média ; si besoin, voir la compétence `communique-de-presse` pour le droit de réponse.
12. **Clore et tirer les leçons.** Décision de levée de la cellule par l'humain. Retour d'expérience sous 15 jours : chronologie, ce qui a marché, ce qui a manqué, actions avec responsable et date, mise à jour des modèles.

## Livrable

Pour une crise : la fiche de cellule (rôles, suppléants, joignabilité) ; la table des faits à jour ; le message d'attente et les déclarations successives ; les questions-réponses ; la note au porte-parole ; les messages interne et externe par canal ; le journal de crise horodaté ; la liste des obligations légales à traiter avec le juridique ; le plan de retour d'expérience. Pour une préparation à froid : fiche de cellule, modèles de messages à trous, arbre de décision par niveau, calendrier d'un exercice annuel. Toute diffusion attend la carte d'approbation.

## Critères de réussite

- Le message d'attente est prêt en moins d'une page et ne contient aucun fait non confirmé.
- La liste des 60 premières minutes est faite : faits confirmés, porte-parole, message d'attente, heure de la prochaine mise à jour.
- Chaque fait diffusé est dans la table des faits avec sa source et son heure.
- Le journal de crise permet de reconstituer chaque décision, son auteur et son heure.
- Un seul porte-parole s'exprime ; les textes interne et externe sont cohérents.
- Aucune diffusion sans approbation humaine ; aucune obligation légale oubliée.
- Le retour d'expérience produit des actions datées et attribuées.

## Limites

- La compétence ne qualifie pas juridiquement l'événement et ne remplace pas l'avocat, l'assureur ni les services d'urgence.
- Elle ne connaît que les faits transmis ; en leur absence, elle écrit « information manquante » plutôt que de combler.
- Une crise rapide laisse peu de temps de validation : l'humain peut décider de diffuser un message d'attente très court, mais la décision reste la sienne.
- Les modèles sont génériques : un secteur réglementé (santé, alimentaire, finance, chimie) a ses règles d'alerte propres, à confirmer.
- Le plan ne rend pas à lui seul une crise gérable si les rôles ne sont pas connus à l'avance : exercer une fois par an.

## Sources officielles

Consultée le 17/10/2026 :

- Autorité de protection des données, « Violation de données personnelles », https://www.autoriteprotectiondonnees.be/professionnel/actions/violation-de-donnees-personnelles :
  le responsable du traitement notifie une violation de données à caractère personnel à l'autorité dans les meilleurs
  délais et, si possible, 72 heures au plus tard après en avoir pris connaissance, sauf si elle n'est pas susceptible
  d'engendrer un risque (RGPD art. 33 ; l'information des personnes concernées relève de l'art. 34, à vérifier). La
  communication de crise ne retarde jamais cette notification, qui est confiée au délégué à la protection des données.
- Centre pour la Cybersécurité Belgique (CCB), https://ccb.belgium.be/fr : point de signalement d'un incident cyber ; le
  site a refusé l'accès le 17/10/2026 (réponse 403, non contournée). Obligations de notification (notamment NIS2) à
  vérifier avec le responsable informatique et la conformité.

## À vérifier par un professionnel

- Toute obligation de notification (APD, CCB, autorité de contrôle sectorielle, assureur) et son délai, par le juriste ou
  le délégué à la protection des données.
- Tout aveu de faute, toute mention d'une personne et toute déclaration chiffrée, par le juriste avant publication.

## Exemple

Une PME de 40 personnes subit une panne de serveur après une attaque informatique probable (constat du prestataire à 10 h 20, source : courriel du prestataire). Niveau 2. Cellule de 4 personnes. Message d'attente à 10 h 55, soumis à la gérante : « Nous rencontrons un incident informatique qui perturbe nos services. Nos équipes et nos prestataires travaillent à le résoudre. Nous informerons nos clients à 14 h. Contact : standard. » Aucun mot « attaque » ni nombre de données concernées, car non confirmés. Journal ouvert, juridique alerté pour évaluer une notification de violation de données (délai à vérifier). Message interne distinct et consigne aux collaborateurs de ne pas commenter.

Cas d'échec : à 11 h, un salarié annonce sur un réseau social que « des données clients ont fuité » et la direction demande de le démentir. Le démenti serait faux ou non prouvé : la compétence refuse de nier, ajoute à la table des faits « fuite de données : non confirmée, en cours de vérification », prépare un message qui dit ce qui est vérifié et l'heure de la prochaine information, et pose la carte d'approbation.

## Origine de la méthode

Liste des 60 premières minutes et avis juridique préalable adaptés et traduits de github.com/coreyhaines31/marketingskills,
`skills/public-relations/SKILL.md`, section « When Something Goes Wrong », commit dda3841f0b294e01e93b1541486beefbfab0915e,
licence MIT, Copyright (c) 2025 Corey Haines. Modifications : réécriture en français, obligations belges. Texte de la
licence et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
