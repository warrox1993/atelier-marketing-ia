---
name: "script-video-publicitaire"
description: "Écrit le script d'une publicité vidéo courte et le transforme en demande valide pour l'outil fabriquer_video : choix de la structure (accroche des trois premières secondes, problème-solution, AIDA, PAS, preuve, appel à l'action), découpage en scènes adapté aux trois gabarits visuels (titre plein écran, chiffre clé, liste de trois points), durée par format, écriture pensée pour une voix de synthèse. À utiliser pour une publicité vidéo, un Reel, un TikTok, un Short ou une vidéo de présentation d'offre ; jamais pour promettre une voix ou un visage humain réel, inventer un chiffre ou publier la vidéo."
metadata:
  version: "1.0.0"
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
  Aucune voix humaine réelle, aucun échantillon, aucun visage.
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
   - `duree_max` de 1 à 60 secondes par scène, facultatif ; la durée totale de la vidéo ne dépasse pas 180 secondes.
5. **Écrire pour la voix**, pas pour l'écran :
   - phrases courtes, un verbe, une idée ; lire à voix haute et couper là où l'on reprend son souffle ;
   - environ 2 à 3 mots par seconde en français parlé : 6 secondes de scène portent 12 à 18 mots ; en cas de doute, durée prudente ;
   - écrire en lettres ce que la synthèse risque de mal lire (sigles, montants, dates, unités, « 24/7 »), et vérifier le résultat à l'écoute si possible ;
   - le texte de la voix peut être plus riche que le visuel, mais ne le contredit jamais ;
   - ne pas écrire la mention « contenu généré par IA » ni le filigrane : l'outil les pose d'office.
6. **Vérifier chaque fait** : un chiffre, un prix, un délai, un avis n'est repris que s'il figure dans les documents du client. Sinon, le retirer ou le marquer « à confirmer » dans le commentaire de la tâche, jamais dans la vidéo.
7. **Passer la liste de contrôle** de la compétence `conformite-publicite-ia` avant de déposer la demande.
8. **Déposer la demande** avec `fabriquer_video`, noter l'identifiant de travail, suivre avec `etat_fabrication` (voir « Limites »).

## Livrable

Dans le commentaire de la tâche : le script complet (scène, texte de voix, visuel, durée estimée), la structure choisie et pourquoi,
la demande `fabriquer_video` déposée, l'identifiant de travail, la liste de contrôle de conformité remplie, et le texte
d'accompagnement du post (voir `declinaison-regies-video`).

## Critères de réussite

- L'accroche tient dans les trois premières secondes et ne commence pas par le nom de l'entreprise.
- Chaque scène respecte les limites de l'outil ; la durée totale estimée est inférieure à la durée cible et à 180 secondes.
- Un seul appel à l'action, en dernière scène.
- Aucun chiffre, avis ou promesse absent des documents du client.
- Aucune voix hors registre, aucune promesse de voix humaine, aucun visage ou nom de personne réelle utilisé comme voix.

## Limites

- La fabrication est asynchrone : la réponse immédiate donne un identifiant et l'état « en_file ». L'état « en_attente_gpu » signifie que la vidéo attend la carte graphique ; ce n'est pas un échec, ne pas redéposer la demande.
- Seules les voix du registre existent ; la qualité de l'accent et du rythme n'est pas garantie : prévoir une écoute humaine avant diffusion.
- Trois gabarits seulement : pas de vidéo filmée, pas de photo de personne, pas d'animation libre.
- La compétence écrit et prépare ; elle ne publie rien. La diffusion est approuvée par un humain et faite par le rôle Contenus.

## Exemple

Vidéo verticale (`1080x1920`) de 24 secondes pour un artisan qui propose des devis gratuits, sous-titres activés :

```json
{
  "format_sortie": "1080x1920",
  "sous_titres": true,
  "scenes": [
    {
      "texte_voix": "Votre devis dort dans un tiroir depuis trois semaines ?",
      "voix": "synthese-kokoro-fr",
      "visuel": { "gabarit": "titre_plein_ecran", "champs": { "titre": "Un devis qui traîne ?" } },
      "duree_max": 4
    },
    {
      "texte_voix": "Chez nous, la réponse arrive en quarante-huit heures, avec un prix clair.",
      "voix": "synthese-kokoro-fr",
      "visuel": { "gabarit": "chiffre_cle", "champs": { "chiffre": "48 h", "titre": "Pour recevoir votre devis" } },
      "duree_max": 6
    },
    {
      "texte_voix": "Vous gardez trois choses : un prix écrit, un délai, un seul interlocuteur.",
      "voix": "synthese-kokoro-fr",
      "visuel": { "gabarit": "liste_3_points", "champs": { "titre": "Ce que vous gardez", "points": ["Un prix écrit", "Un délai annoncé", "Un seul interlocuteur"] } },
      "duree_max": 8
    },
    {
      "texte_voix": "Écrivez-nous, on regarde votre projet ensemble.",
      "voix": "synthese-kokoro-fr",
      "visuel": { "gabarit": "titre_plein_ecran", "champs": { "titre": "Demandez votre devis", "sous_titre": "Écrivez-nous" } },
      "duree_max": 5
    }
  ]
}
```

Le « quarante-huit heures » vient de la fiche du client ; sans cette source, la scène deux est retirée. Cas d'échec évité : un brouillon
promettait « la voix de notre gérant » : seules les voix du registre existent, la phrase est supprimée.

## Origine de la méthode

Structures publicitaires classiques (problème-solution, AIDA, PAS, preuve, appel à l'action), connues et d'usage courant,
rédigées en français par l'Atelier Marketing IA pour les limites de l'outil `fabriquer_video`. Aucun texte de dépôt tiers
n'est repris ; licence Apache 2.0, comme les autres compétences écrites par l'atelier.
