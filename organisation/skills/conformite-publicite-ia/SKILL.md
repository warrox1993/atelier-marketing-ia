---
name: "conformite-publicite-ia"
description: "Liste de contrôle à cocher avant et après la fabrication d'une publicité vidéo, audio ou image (visuel de post composé par la fabrique) faite avec une voix ou des images de synthèse : voix et visages de vraies personnes, célébrités, faux témoignages, règles d'étiquetage de TikTok et de Meta, registre de la musique, publicité trompeuse et comparaison déloyale (Code de droit économique), produits d'assurance. À utiliser avant de déposer une demande fabriquer_video ou fabriquer_image et à la livraison du fichier, dans le commentaire de la tâche ; jamais pour valider juridiquement une publicité ni pour publier."
metadata:
  version: "1.6.0"
  langue: "fr"
  domaine: "conformite"
---

# Conformité d'une publicité faite avec l'IA

## Quand l'utiliser

- Avant de déposer une demande `fabriquer_video` ou `fabriquer_image` (liste AVANT ; pour une image, la variante « Liste image » ci-dessous).
- À la réception de la vidéo ou de l'image fabriquée, avant de la remettre pour approbation (liste APRÈS).
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
   - [ ] Provenance : aucune mention IA n'est ajoutée, ni à la vidéo ni au texte du post (décision de l'opérateur du 06/11/2026). Le filigrane audio inaudible (PerTh) des voix et la provenance IA dans les métadonnées du fichier sont posés par la fabrique.
   - [ ] **Personne réelle** : pas de personne réelle identifiable (voix, visage, nom, célébrité, sosie) sans son accord écrit. Un visage, une voix, un bureau ou une scène inventés sont permis, y compris en réalisme photographique. Seules les voix du registre de la fabrique sont utilisées.
   - [ ] **Témoignage** : pas de faux témoignage ni de faux avis de client présenté comme vrai.
   - [ ] Musique : identifiant du registre, ou source, licence et preuve consignées dans le commentaire. Pas de titre commercial sans licence écrite.
   - [ ] Aucune publicité trompeuse : chaque chiffre, prix, délai, garantie et avis a sa source dans les documents du client (Code de droit économique, livre VI : envers des consommateurs, articles VI.97 et suivants sur les pratiques trompeuses ; envers des entreprises, articles VI.104 et suivants sur les pratiques du marché).
   - [ ] Aucune comparaison déloyale : le concurrent n'est pas nommé sans preuve ni dénigré (Code de droit économique, article VI.17).
   - [ ] Produit d'assurance ou autre secteur réglementé : passage préalable par le rôle Conformité publicitaire (règle existante), sans exception.
   - [ ] Aucune donnée personnelle d'un client, aucune fausse urgence.
2. **Liste APRÈS fabrication** :
   - [ ] L'état de la fabrication est « terminé » (« en_attente_gpu » n'est pas un échec : attendre, ne pas redéposer).
   - [ ] La vidéo ne porte aucune mention incrustée ni filigrane visible (à constater sur la vidéo, pas à supposer).
   - [ ] Les sous-titres correspondent au texte de voix, sans faute ni chiffre mal lu ; une écoute humaine est demandée pour l'accent et la prononciation.
   - [ ] **Règles des régies** : TikTok peut refuser une vidéo sans son étiquette « contenu généré par IA », et Meta pose sa propre étiquette sur ce qu'elle détecte. Ce sont des règles de plateforme, pas de l'atelier : à vérifier dans leur centre d'aide au moment de publier, par la personne qui publie.
   - [ ] Le client sait que la publication reste soumise à une approbation humaine.
   ### Liste image (outil `fabriquer_image`)

   Elle remplace les points de voix, de musique et de sous-titres, qui ne concernent pas une image ; les autres points de la
   liste AVANT (publicité trompeuse, comparaison déloyale, secteur réglementé, données personnelles) restent à cocher.
   - [ ] AVANT : chaque chiffre, prix, remise et affirmation des `champs` a sa source dans les documents du client ; rien n'est arrondi ni inventé.
   - [ ] AVANT : les mentions obligatoires du client et du secteur tiennent dans `mentions_legales` (200 caractères au plus) ; sinon elles figurent dans le texte du post et le commentaire le dit.
   - [ ] AVANT : la demande ne contient que `format`, `gabarit`, `champs`, `charte` et, pour un fond peint par l'IA, `illustration` ; aucun `fond_ia` (champ posé par la fabrique), aucune couleur, police, logo, fichier ni URL.
   - [ ] AVANT : la `charte` est l'identifiant donné par la tâche ou la fiche du client, jamais deviné ; un message « charte refusée » n'est pas redéposé, il est signalé.
   - [ ] AVANT : les limites « Personne réelle » et « Témoignage » de la liste AVANT sont tenues, aucune fausse urgence.
   - [ ] AVANT : marque tierce : rubrique Droits du dossier du sujet sourcée (compétence `dossier-sujet`) ; « à confirmer » ou source absente : verdict « publiable après corrections » au plus, liaison vers `juridique` demandée au coordinateur, diffusion en attente de sa revue. Chaque fait de l'image figure dans les `Faits vérifiés` du dossier.
   - [ ] APRÈS : l'état est « terminé » et le résultat donne `image.png` avec son poids et son empreinte ; le fichier `provenance.json` est posé par la fabrique (la porte le contrôle avant diffusion), il ne se refait pas à la main.
   - [ ] APRÈS : le texte lu dans l'aperçu et dans l'image est exactement celui de la demande (chiffre, orthographe, coupure de ligne), le contraste et la lisibilité sont constatés sur le fichier, pas supposés.
   - [ ] APRÈS : l'image porte la provenance IA dans ses métadonnées et aucune mention incrustée ; aucune mention n'est ajoutée au texte du post (décision de l'opérateur du 06/11/2026). Étiquettes des régies (Meta, LinkedIn, TikTok) : à vérifier dans leur centre d'aide au moment de publier.
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
- Le règlement européen sur l'IA (règlement (UE) 2024/1689, article 50, obligations de transparence, applicable depuis le 02/08/2026
  selon son article 113) et l'article 9 du Code belge de la publicité sont cités d'après l'étude vérifiée du 24/10/2026 ; leur
  application à chaque cas reste à confirmer. Seul le § 2 de l'article 50 (marquage des contenus de synthèse dans un format lisible
  par machine, à la charge du fournisseur du système d'IA qui les génère) a un délai : les fournisseurs de systèmes mis sur le marché
  avant le 02/08/2026 doivent s'y conformer au plus tard le 02/12/2026 (article 111, § 4, ajouté par le règlement (UE) 2026/1744 du
  8 juillet 2026, JO L du 24/07/2026). Les §§ 1, 4 et 5 s'appliquent depuis le 02/08/2026.
- Le rôle de « fournisseur » au sens du règlement sur l'IA (qui est tenu de quoi quand l'atelier fabrique la vidéo pour un client) est
  un point incertain : à confirmer par un juriste avant de vendre le service.
- Aucune mention n'est ajoutée au public, par décision de l'opérateur du 06/11/2026 : le risque lié à l'article 50, § 4, pour un contenu qui peut
  passer pour réel est assumé, et reste à confirmer par un juriste avant de vendre le service.
- Les règles des régies (TikTok, Meta, YouTube, LinkedIn) changent : relire leur centre d'aide au moment de publier.

## Sources officielles

- Règlement (UE) 2024/1689 sur l'intelligence artificielle, article 50 : eur-lex.europa.eu.
- Code de droit économique, livre VI (articles VI.17, VI.97 et, pour une publicité adressée à des entreprises, VI.104 et suivants, déjà relus dans `controle-communications-reglementees`) : ejustice.just.fgov.be.
- Code belge de la publicité, article 9 : jep.be (Jury d'Éthique Publicitaire).
- Centres d'aide des régies : à ouvrir au moment de publier (voir `declinaison-regies-video`).

## À vérifier par un professionnel

- Le rôle de fournisseur ou de déployeur au sens du règlement sur l'IA, avant de vendre le service.
- La portée exacte de l'article 9 du Code belge de la publicité pour une voix de synthèse.
- Tout contrat avec une personne dont la voix ou l'image serait utilisée.

## Exemple

Cas nominal : vidéo de 20 secondes, voix de synthèse du registre, musique du registre. Liste AVANT : toutes cases cochées sauf
« produit d'assurance » (non applicable : cabinet de rénovation). Liste APRÈS : absence de mention incrustée et de filigrane visible constatée sur la vidéo,
règle d'étiquette de TikTok à vérifier par la personne qui publie. Verdict : conforme sur les
points vérifiés, écoute humaine encore demandée.

Cas d'échec évité : un brief demandait « la voix de l'animateur de la radio locale ». Sans accord écrit de cette personne, la
demande est bloquée et remplacée par une voix du registre.

## Origine de la méthode

Liste de contrôle rédigée en français par l'Atelier Marketing IA à partir de l'étude vérifiée du 24/10/2026 sur la publicité
faite avec l'IA. Aucun texte de dépôt tiers n'est repris ; licence Apache 2.0.
