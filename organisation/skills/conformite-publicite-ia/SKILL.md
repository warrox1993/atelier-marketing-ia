---
name: "conformite-publicite-ia"
description: "Liste de contrôle à cocher avant et après la fabrication d'une publicité vidéo ou audio faite avec une voix ou des images de synthèse : signalement de l'IA dès la première seconde (règlement européen sur l'IA, article 50 ; article 9 du Code belge de la publicité), voix et visages de vraies personnes, célébrités, étiquettes de TikTok et de Meta, registre de la musique, publicité trompeuse et comparaison déloyale (Code de droit économique), produits d'assurance. À utiliser avant de déposer une demande fabriquer_video et à la livraison de la vidéo, dans le commentaire de la tâche ; jamais pour valider juridiquement une publicité ni pour publier."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "conformite"
---

# Conformité d'une publicité faite avec l'IA

## Quand l'utiliser

- Avant de déposer une demande `fabriquer_video` (liste AVANT).
- À la réception de la vidéo fabriquée, avant de la remettre pour approbation (liste APRÈS).
- Pour relire la vidéo ou le texte d'accompagnement d'un tiers qui utilise une voix ou des images de synthèse.

## Objectif

Un commentaire de tâche où chaque point de contrôle est coché, justifié ou marqué « à vérifier », pour que la personne qui
approuve la publication sache ce qui a été contrôlé et ce qui reste ouvert.

## Prérequis

- Le script de la vidéo (compétence `script-video-publicitaire`) et, après fabrication, le résultat donné par `etat_fabrication`.
- La fiche du client : statut, secteur (assurance, finance et autres secteurs réglementés), mentions obligatoires.
- Pour la musique : l'identifiant du registre de la fabrique et, hors registre, source, licence et preuve.

## Entrées

- `script` : texte de voix, visuels et appel à l'action de chaque scène.
- `regie` : Meta, TikTok, YouTube, LinkedIn (voir `declinaison-regies-video`).
- `resultat` : identifiant de travail et état de la fabrication (pour la liste APRÈS).

## Étapes

1. **Liste AVANT fabrication** (recopier et cocher dans le commentaire de la tâche) :
   - [ ] Signalement de l'IA : la vidéo sera signalée comme générée par IA dès la première seconde quand la voix ou une scène peut passer pour réelle. L'outil pose d'office la mention et le filigrane ; le texte d'accompagnement du post le dit aussi.
   - [ ] Aucune voix, aucun visage ni aucun nom d'une vraie personne sans contrat écrit préalable avec elle ; jamais une célébrité, ni un sosie. Seules les voix du registre de la fabrique sont utilisées.
   - [ ] Aucune promesse d'une « vraie » voix humaine, d'un témoignage ou d'un employé qui parle : la voix est une synthèse.
   - [ ] Musique : identifiant du registre, ou source, licence et preuve consignées dans le commentaire. Pas de titre commercial sans licence écrite.
   - [ ] Aucune publicité trompeuse : chaque chiffre, prix, délai, garantie et avis a sa source dans les documents du client (Code de droit économique, livre VI, articles VI.97 et suivants sur les pratiques trompeuses).
   - [ ] Aucune comparaison déloyale : le concurrent n'est pas nommé sans preuve ni dénigré (Code de droit économique, article VI.17).
   - [ ] Produit d'assurance ou autre secteur réglementé : passage préalable par le rôle Conformité publicitaire (règle existante), sans exception.
   - [ ] Aucune donnée personnelle d'un client, aucun faux avis, aucune fausse urgence.
2. **Liste APRÈS fabrication** :
   - [ ] L'état de la fabrication est « terminé » (« en_attente_gpu » n'est pas un échec : attendre, ne pas redéposer).
   - [ ] La mention IA est visible dès le début et le filigrane est présent (à constater sur la vidéo, pas à supposer).
   - [ ] Les sous-titres correspondent au texte de voix, sans faute ni chiffre mal lu ; une écoute humaine est demandée pour l'accent et la prononciation.
   - [ ] Le texte du post annonce que la vidéo est faite avec l'IA.
   - [ ] **TikTok** : l'étiquette « contenu généré par IA » doit être activée au moment de la publication, sinon la vidéo peut être refusée.
   - [ ] **Meta** : la plateforme pose elle-même une étiquette sur les contenus qu'elle détecte comme faits avec l'IA. Il n'existe pas, à notre connaissance, de page officielle décrivant une déclaration manuelle en dehors de sa politique publicitaire : à vérifier dans le centre d'aide de Meta au moment de publier.
   - [ ] Le client sait que la publication reste soumise à une approbation humaine.
3. **Conclure** par un verdict : conforme sur les points vérifiés, conforme après corrections listées, ou bloqué (raison). Une case non cochée est écrite, jamais passée sous silence.

## Livrable

Le bloc « Conformité » dans le commentaire de la tâche : les deux listes avec leur état (coché, non applicable avec la raison,
à vérifier avec par qui), la source de chaque règle citée, et le verdict.

## Critères de réussite

- Chaque case porte un état et, si elle n'est pas cochée, une raison.
- Aucun article, chiffre ou date ajouté qui ne figure pas dans la section « Sources officielles ».
- Les points incertains sont dits incertains.
- Aucune vidéo remise pour approbation avec une case bloquante non résolue.

## Limites

- Cette liste aide à contrôler ; elle ne remplace ni un juriste ni la validation humaine, et ne rend pas une publicité « conforme ».
- Le règlement européen sur l'IA (article 50, obligations de transparence, en vigueur depuis le 02/08/2026) et l'article 9 du
  Code belge de la publicité sont cités d'après l'étude vérifiée du 24/10/2026 ; leur application à chaque cas reste à confirmer.
- Le rôle de « fournisseur » au sens du règlement sur l'IA (qui est tenu de quoi quand l'atelier fabrique la vidéo pour un client) est
  un point incertain : à confirmer par un juriste avant de vendre le service.
- Les règles des régies (TikTok, Meta, YouTube, LinkedIn) changent : relire leur centre d'aide au moment de publier.

## Sources officielles

- Règlement (UE) 2024/1689 sur l'intelligence artificielle, article 50 : eur-lex.europa.eu.
- Code de droit économique, livre VI (articles VI.17 et VI.97) : ejustice.just.fgov.be.
- Code belge de la publicité, article 9 : jep.be (Jury d'Éthique Publicitaire).
- Centres d'aide des régies : à ouvrir au moment de publier (voir `declinaison-regies-video`).

## À vérifier par un professionnel

- Le rôle de fournisseur ou de déployeur au sens du règlement sur l'IA, avant de vendre le service.
- La portée exacte de l'article 9 du Code belge de la publicité pour une voix de synthèse.
- Tout contrat avec une personne dont la voix ou l'image serait utilisée.

## Exemple

Cas nominal : vidéo de 20 secondes, voix de synthèse du registre, musique du registre. Liste AVANT : toutes cases cochées sauf
« produit d'assurance » (non applicable : cabinet de rénovation). Liste APRÈS : mention et filigrane constatés sur la vidéo,
texte du post « vidéo réalisée avec l'IA », étiquette TikTok à activer par la personne qui publie. Verdict : conforme sur les
points vérifiés, écoute humaine encore demandée.

Cas d'échec évité : un brief demandait « la voix de l'animateur de la radio locale ». Sans contrat écrit avec cette personne, la
demande est bloquée et remplacée par une voix du registre.

## Origine de la méthode

Liste de contrôle rédigée en français par l'Atelier Marketing IA à partir de l'étude vérifiée du 24/10/2026 sur la publicité
faite avec l'IA. Aucun texte de dépôt tiers n'est repris ; licence Apache 2.0.
