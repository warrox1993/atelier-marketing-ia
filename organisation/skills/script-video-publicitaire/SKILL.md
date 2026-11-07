---
name: "script-video-publicitaire"
description: "Écrit le script d'une publicité vidéo courte et le transforme en demande valide pour l'outil fabriquer_video : choix de la structure (accroche des trois premières secondes, problème-solution, AIDA, PAS, preuve, appel à l'action), découpage en scènes adapté aux trois gabarits visuels (titre plein écran, chiffre clé, liste de trois points), durée par format, écriture pensée pour une voix de synthèse. À utiliser pour une publicité vidéo, un Reel, un TikTok, un Short ou une vidéo de présentation d'offre ; jamais pour inventer un chiffre ou publier la vidéo."
metadata:
  version: "1.6.0"
  langue: "fr"
  domaine: "creation"
---

# Script de publicité vidéo

## Quand l'utiliser

- Une tâche demande une publicité vidéo courte (Reel, Story, TikTok, Short, vidéo de fil) pour une offre ou un message validé.
- Un brouillon de texte de post doit devenir une vidéo de quelques scènes à voix off et visuels à gabarit.
- Une demande `fabriquer_video` a été refusée ou ratée et son contenu doit être repris.

## Objectif

Un script où chaque scène tient dans l'outil, où l'accroche arrive avant la quatrième seconde, où chaque chiffre vient d'une
source du client, et une demande `fabriquer_video` valide du premier coup.

## Prérequis

- Le brief validé : offre, public, objectif unique (faire découvrir, faire cliquer, faire écrire), régie visée.
- La charte de marque (compétence `charte-marque`) et les faits du client : chiffres, preuves, mentions.
- Les voix permises : seules celles du registre de la fabrique existent (`synthese-chatterbox-fr`, `synthese-kokoro-fr`).
  Aucun échantillon de voix. Visages, personnages et scènes inventés sont permis, y compris en réalisme photographique (limites : `conformite-publicite-ia`).
- Le quota : 10 vidéos par jour et par entreprise. Une demande bien préparée vaut mieux que trois essais.

## Entrées

- `brief` : message, offre, public, preuve disponible, appel à l'action voulu.
- `regie` et `format_sortie` : voir la compétence `declinaison-regies-video` (vertical 1080x1920, carré 1080x1080, horizontal 1920x1080).
- `duree_cible` en secondes, `musique` (identifiant du registre, facultatif), `sous_titres` (oui par défaut).

## Étapes

1. **Fixer l'objectif unique** de la vidéo et le public. Une vidéo, un message, un appel à l'action.
2. **Choisir la structure** selon le niveau de conscience du public (compétence `niveau-conscience-message`) :
   - *problème-solution* : la situation qui gêne, puis ce que l'offre change. Structure par défaut, à privilégier pour 15 à 30 s.
   - *PAS* (problème, agitation, solution) : nommer le problème, montrer son coût réel (sans dramatiser ni inventer), puis la solution.
   - *AIDA* (attention, intérêt, désir, action) : pour un public déjà intéressé et une vidéo un peu plus longue.
   - *preuve* : un chiffre vérifié du client en ouverture (gabarit `chiffre_cle`), puis ce qui l'explique.
   - Dans tous les cas, finir par **un seul appel à l'action** concret (écrire, réserver, demander un devis).
3. **Écrire l'accroche des trois premières secondes** : une question précise, un chiffre vérifié ou une situation reconnaissable.
   Pas de présentation de l'entreprise en ouverture, pas de formule d'introduction.
4. **Découper en scènes** (de 1 à 30 par vidéo ; viser 3 à 7 pour une vidéo courte) :
   - une idée par scène ; une scène dure de 3 à 8 secondes en général ;
   - `titre_plein_ecran` (titre, sous_titre facultatif) : accroche, transition, appel à l'action final ;
   - `chiffre_cle` (chiffre, titre, sous_titre facultatif) : une preuve chiffrée unique, le chiffre court (20 caractères au plus) ;
   - `liste_3_points` (titre, trois points) : trois bénéfices ou trois étapes, jamais plus ni moins ;
   - limites de caractères : titre 120, sous-titre 200, chiffre 20, chaque point 120, texte de voix 1500 par scène ;
   - `duree_max` de 1 à 60 secondes par scène, facultatif ; la durée totale de la vidéo ne dépasse pas 180 secondes ;
   - `illustration` (20 à 2500 caractères) : obligatoire dans toute scène de ton script, voir « Illustration de chaque scène ».
5. **Écrire pour la voix**, pas pour l'écran :
   - phrases courtes, un verbe, une idée ; lire à voix haute et couper là où l'on reprend son souffle ;
   - environ 2 à 3 mots par seconde en français parlé : 6 secondes de scène portent 12 à 18 mots ; en cas de doute, durée prudente ;
   - écrire en lettres ce que la synthèse risque de mal lire (sigles, montants, dates, unités, « 24/7 »), et vérifier le résultat à l'écoute si possible ;
   - le texte de la voix peut être plus riche que le visuel, mais ne le contredit jamais ;
   - ne pas écrire de mention « contenu généré par IA » dans le script : aucune mention n'est ajoutée.
6. **Vérifier chaque fait** : un chiffre, un prix, un délai, un nom ou un détail du sujet n'est repris que s'il figure dans le dossier du sujet de la tâche (compétence `dossier-sujet`) ou dans la fiche du client ; rien de la rubrique `À ne pas dire`. Sinon, le retirer ou le marquer « à confirmer » dans le commentaire de la tâche, jamais dans la vidéo.
7. **Passer la liste de contrôle** de la compétence `conformite-publicite-ia` avant de déposer la demande.
8. **Déposer la demande** avec `fabriquer_video`, noter l'identifiant de travail, suivre avec `etat_fabrication` (voir « Limites »).

### Standard haut de gamme

Une vidéo publicitaire de l'atelier vise ce standard ; ce qui se mesure, la fabrique le refuse elle-même, le reste est
noté par le relecteur sur la grille de la compétence `qualite-visuels` (publiable à 16/20, aucun 0).

- **Chronologie d'une vidéo de 15 s** (la durée de référence ; 6 s pour un format court, 30 s au plus) :
  0 à 2 s, l'accroche, à l'écran ET dans la voix dès la première demi-seconde ; 2 à 10 s, la situation et son
  développement (problème, ou mise en scène humoristique) ; 10 à 13 s, la solution ou la preuve ; 13 à 15 s, la carte
  finale : une scène `titre_plein_ecran` d'au moins 2 s avec l'appel à l'action seul.
- **Dialogue** : deux voix différentes du registre, choisies par le champ `voix` de chaque scène ; une réplique par scène ;
  la chute arrive à l'avant-dernière scène, juste avant la carte finale ; l'humour vient de la situation décrite dans le
  dossier du sujet (vocabulaire et références du public), jamais d'une moquerie d'un groupe ni d'un fait inventé.
- **Rythme** : scènes de 2 à 5 s ; un changement visuel au moins toutes les 3 s ; aucune scène muette sauf la carte finale.
- **Lisible sans le son** : 7 mots au plus à l'écran par scène ; sous-titres toujours demandés (`sous_titres: true`,
  l'outil refuse sinon).
- **Mesuré et refusé par la fabrique** : sonie intégrée −16 LUFS (± 1 LU) et crête vraie −1 dBTP au plus ; première
  seconde jamais noire ; débit vidéo d'au moins 516 kb/s ; sous-titres de 42 caractères par ligne et 2 lignes au plus,
  alerte au-delà de 17 caractères par seconde ; en 9:16, rien d'important dans les 14 % du haut, les 35 % du bas et les
  6 % des côtés. La musique baisse d'elle-même sous la voix : ne pas la retirer pour « laisser parler ».
- **Avant de déposer** : note ton propre script sur les critères 1 à 7 de `qualite-visuels` et réécris toute scène
  sous 2/2 ; le relecteur notera ensuite le rendu réel.

### Illustration de chaque scène (obligatoire)

Une vidéo publicitaire sans visuel est refusée par l'opérateur et notée 1/20 par le relecteur : le gabarit seul n'est qu'un texte sur
un aplat. Chaque scène de la demande `fabriquer_video` porte le champ `illustration`, la scène que l'IA peint derrière le texte.

- Écrire pour FLUX 3, qui peint la scène : une seule description en anglais de 100 à 350 mots, en prose continue, d'abord le support
  et le style, puis le décor, la lumière et le cadrage, puis les sujets avec leur profil observable et leur position dans le cadre,
  et où se trouve la zone calme réservée au texte. Forme complète et exemple : `design-visuel-sobre/references/description-flux3.md`.
  Ni texte, ni lettres, ni logo, ni marque ; rien qui contredise le dossier du sujet.
- Une illustration par scène, qui suit l'histoire : le décor et les personnages restent reconnaissables d'une scène à l'autre
  (même personnage, même palette), mais le plan change au moins toutes les deux scènes.
- Un fait du script (chiffre, prix, délai) s'écrit dans les champs du gabarit, jamais dans l'illustration.
- Choisir un cadrage qui expose peu les mains (une main sur un bâton, les mains dans les manches, un plan plus serré) : l'IA se trompe sur les doigts, et une scène est refusée à la moindre anomalie (voir `qualite-visuels`).

## Livrable

Dans le commentaire de la tâche : le script complet (scène, texte de voix, visuel, illustration, durée estimée), la structure choisie et pourquoi,
la demande `fabriquer_video` déposée, l'identifiant de travail, la liste de contrôle de conformité remplie, et le texte
d'accompagnement du post (voir `declinaison-regies-video`).

## Critères de réussite

- L'accroche tient dans les trois premières secondes et ne commence pas par le nom de l'entreprise.
- Chaque scène respecte les limites de l'outil et porte son `illustration` ; la durée totale estimée est inférieure à la durée cible et à 180 secondes.
- Un seul appel à l'action, en dernière scène (carte finale d'au moins 2 s).
- La chronologie du « Standard haut de gamme » est tenue : accroche avant 2 s, chute à l'avant-dernière scène, scènes de 2 à 5 s.
- Aucun chiffre, avis ou promesse absent des documents du client.
- Aucune voix hors registre ; les limites de `conformite-publicite-ia` (personne réelle, faux témoignage) sont tenues.

## Limites

- La fabrication est asynchrone : la réponse immédiate donne un identifiant et l'état « en_file ». L'état « en_attente_gpu » signifie que la vidéo attend la carte graphique ; ce n'est pas un échec, ne pas redéposer la demande.
- Seules les voix du registre existent ; la qualité de l'accent et du rythme n'est pas garantie : prévoir une écoute humaine avant diffusion.
- Trois gabarits seulement : pas de vidéo filmée, pas d'animation libre ; le visuel de chaque scène est une illustration peinte par l'IA (champ `illustration`), réalisme photographique compris.
- La compétence écrit et prépare ; elle ne publie rien. La diffusion est approuvée par un humain et faite par le rôle Contenus.

## Exemple

Vidéo verticale (`1080x1920`) de 15 secondes pour un artisan qui propose des devis gratuits, dialogue à deux voix,
sous-titres activés. Cinq scènes de 3 s, environ 2,5 mots par seconde : accroche de 0 à 3 s, situation et preuve jusqu'à 9 s, chute à
l'avant-dernière scène, carte finale de 3 s.

```json
{
  "format_sortie": "1080x1920",
  "sous_titres": true,
  "scenes": [
    {
      "texte_voix": "Ton devis traîne depuis trois semaines ?",
      "voix": "synthese-kokoro-fr",
      "visuel": {
        "gabarit": "titre_plein_ecran",
        "champs": {
          "titre": "Un devis qui traîne ?"
        }
      },
      "duree_max": 3
    },
    {
      "texte_voix": "Trois semaines ? Le mien a fêté son anniversaire.",
      "voix": "synthese-chatterbox-fr",
      "visuel": {
        "gabarit": "titre_plein_ecran",
        "champs": {
          "titre": "Il a même un gâteau"
        }
      },
      "duree_max": 3
    },
    {
      "texte_voix": "Chez nous : quarante-huit heures, prix écrit.",
      "voix": "synthese-kokoro-fr",
      "visuel": {
        "gabarit": "chiffre_cle",
        "champs": {
          "chiffre": "48 h",
          "titre": "Pour recevoir ton devis"
        }
      },
      "duree_max": 3
    },
    {
      "texte_voix": "Zut, j'avais acheté les bougies.",
      "voix": "synthese-chatterbox-fr",
      "visuel": {
        "gabarit": "titre_plein_ecran",
        "champs": {
          "titre": "Fin de la fête"
        }
      },
      "duree_max": 3
    },
    {
      "texte_voix": "Écris-nous, on regarde ton projet.",
      "voix": "synthese-kokoro-fr",
      "visuel": {
        "gabarit": "titre_plein_ecran",
        "champs": {
          "titre": "Demande ton devis",
          "sous_titre": "Écris-nous"
        }
      },
      "duree_max": 3
    }
  ]
}
```

Le « quarante-huit heures » vient de la fiche du client ; sans cette source, la scène trois est retirée. Cas d'échec évité : un brouillon
promettait « la voix de notre gérant » : seules les voix du registre existent, la phrase est supprimée.

## Origine de la méthode

Structures publicitaires classiques (problème-solution, AIDA, PAS, preuve, appel à l'action), connues et d'usage courant,
rédigées en français par l'Atelier Marketing IA pour les limites de l'outil `fabriquer_video`. Aucun texte de dépôt tiers
n'est repris ; licence Apache 2.0, comme les autres compétences écrites par l'atelier.
