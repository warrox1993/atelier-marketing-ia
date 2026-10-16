---
name: "base-connaissances-faq"
description: "Construit et tient à jour la FAQ et la base de connaissances du service après-vente d'une PME belge à partir des tickets réellement reçus : regroupement des questions récurrentes, rédaction d'une réponse courte en langage clair, validation par un humain, date de revue, anonymisation et mesure de l'utilité (questions évitées, avis des lecteurs, tickets restants). À utiliser pour créer, réorganiser ou auditer une FAQ ; jamais pour publier sans validation, généraliser une réponse qui dépend d'un contrat précis, inventer une question que personne n'a posée ni reprendre des données personnelles d'un ticket."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "sav"
---

# Base de connaissances et FAQ à partir des tickets

## Quand l'utiliser

- Les mêmes questions reviennent dans les tickets, les courriels ou au téléphone.
- Une FAQ existe mais personne ne sait si elle est à jour, lue ou utile.
- Une réclamation ou un sinistre a été résolu et sa solution peut aider d'autres clients.
- Le service veut réduire sa charge sans dégrader la qualité des réponses.

## Objectif

Une FAQ construite sur les questions réelles des clients : chaque article a une réponse validée par un humain, une source interne, une date de revue, un propriétaire et une mesure d'utilité. Les réponses sont dites en langage clair ; celles qui dépendent d'un contrat précis ne sont pas généralisées.

## Prérequis

- Un export ou une liste de tickets sur une période donnée (au moins 3 mois si possible), avec le motif, le canal, la date et la solution apportée.
- Le glossaire de l'entreprise et la fiche : ton, langues du public (français seul, ou français et néerlandais), produits et services couverts.
- Une personne désignée pour valider chaque article, et les conditions générales et contrats de référence.

## Entrées

- `tickets` : motif, texte résumé, produit, canal, date, solution, délai de résolution ; sans nom, adresse, numéro de client, numéro de police ni montant identifiant.
- `faq_existante` : articles en place, avec leur date et leur emplacement.
- `periode` et `langues`.

## Étapes

1. **Préparer les tickets.** Retirer ou remplacer toute donnée personnelle (nom, adresse, numéro de commande, de contrat ou de dossier, téléphone, courriel) avant toute analyse. Un ticket impossible à anonymiser proprement est écarté et signalé.
2. **Regrouper** les tickets par question de fond, pas par mots identiques : « où est ma commande », « mon colis n'est pas arrivé » et « suivi de livraison » forment un groupe. Compter les tickets par groupe et noter la part du total. Un groupe de moins de 3 tickets sur la période n'entre dans la FAQ que s'il est grave ou lié à une obligation légale.
3. **Trier chaque groupe** :
   - *Réponse générale* : la même réponse vaut pour tous les clients ; article de FAQ.
   - *Réponse dépendante d'un contrat, d'une police ou d'un cas* : pas d'article général ; on rédige une consigne interne ou on renvoie au service, et on l'écrit dans la liste « non généralisable ».
   - *Défaut de l'entreprise* (information manquante, étape confuse) : à corriger à la source, pas à contourner par une FAQ.
4. **Rédiger chaque article** avec ce modèle court :
   - *Titre* : la question comme le client la pose, sans jargon interne.
   - *Réponse en deux phrases maximum*, qui donne l'essentiel d'abord.
   - *Pas à pas* numérotés si une action est attendue.
   - *Cas particuliers* : deux ou trois au plus.
   - *Quand nous contacter* : situation précise, canal, ce qu'il faut préparer.
   Langage clair : phrases de 20 mots environ, termes du client, sigle expliqué à la première apparition, aucun reproche, aucun terme juridique non expliqué.
5. **Faire valider** par la personne désignée. L'article porte alors : relecteur, date de validation, date de prochaine revue (3 mois pour les prix, délais et procédures qui changent, 12 mois pour le reste), référence interne de la source (numéro de groupe, pas de ticket nominatif).
6. **Classer** : catégories peu nombreuses (7 au plus), un article n'apparaît qu'à un endroit, chaque article renvoie à deux articles liés au plus. Pour un public bilingue, la version néerlandaise est rédigée avec les usages belges et relue par un locuteur ; elle n'est pas une traduction mot à mot.
7. **Mesurer l'utilité** (voir le tableau). Les chiffres sont comparés à la période d'avant, avec le nombre de tickets sur lequel ils reposent.
8. **Réviser** à chaque date de revue : relire la réponse, la corriger si les faits ont changé, ou retirer l'article. Un article jamais consulté en 6 mois est examiné : mal titré, mal placé ou inutile.

### Mesure de l'utilité

| Mesure | Calcul | Lecture et limite |
| --- | --- | --- |
| Part des tickets couverts | tickets d'un groupe avec article / tickets du groupe | dit si la FAQ répond aux vraies questions |
| Vote « utile » | votes utiles / votes exprimés, avec le nombre de votes | sous 20 votes, ne pas conclure |
| Évitement de tickets | tickets du groupe après publication, comparés à une période de même durée avant | une baisse n'est pas une preuve : saisonnalité, changement de produit ; écrire « baisse observée » |
| Consultations puis contact | lecteurs de l'article qui ouvrent ensuite un ticket sur le même sujet | un taux élevé signale un article incomplet |
| Ancienneté | articles dépassant leur date de revue / articles total | doit rester proche de zéro |
| Qualité de réponse | échantillon mensuel de 10 articles relus contre la source | dit si la FAQ reste exacte |

Aucune mesure ne remplace la lecture de 5 à 10 tickets réels : elle dit où regarder.

## Livrable

- Les articles de FAQ, courts, anonymisés, prêts pour validation.
- Un tableau de suivi : article, groupe de tickets source (référence interne), nombre de tickets, date de validation, prochaine revue, relecteur proposé, langue.
- La liste des questions dont la réponse dépend d'un contrat ou d'un cas précis (non généralisable), avec le service à interroger.
- La liste des défauts d'entreprise détectés (information manquante, étape confuse) à corriger à la source.
- Un point de mesure daté si une FAQ existait déjà.

## Critères de réussite

- Chaque article repose sur au moins 3 tickets réels (ou sur une obligation légale citée) et a un propriétaire, une date de validation et une date de revue.
- Aucune donnée personnelle dans les articles, le tableau ou les exemples.
- Aucune réponse n'affirme un fait absent des sources internes ; une information manquante est écrite comme telle.
- Les réponses dépendant d'un contrat sont écartées de la FAQ générale.
- Les chiffres de mesure sont toujours accompagnés du nombre de tickets ou de votes sur lesquels ils reposent.

## À vérifier par un professionnel

Un article qui touche à un droit du client (garantie, remboursement, résiliation, assurance, données personnelles) est relu par le dirigeant ou un juriste avant publication. Pour l'assurance, un article ne décrit que le fonctionnement du service de l'intermédiaire ; la couverture d'un cas relève de l'assureur. Aucune source officielle n'est citée pour les méthodes de rédaction ou de mesure : ce sont des pratiques courantes de service client, pas des textes.

## Limites

- Peu de tickets (moins de 30 sur la période) : les regroupements sont fragiles, ils sont présentés comme provisoires.
- Un ticket mal résumé donne un article faux : la source est relue avant rédaction.
- La compétence ne publie rien : l'humain valide et met en ligne.
- Une baisse de tickets après publication ne prouve pas que la FAQ en est la cause.
- Les retours des lecteurs sont volontaires et reflètent les plus mécontents ou les plus satisfaits.

## Exemple

Période juillet à septembre 2026, 140 tickets d'un magasin en ligne. Regroupement : 31 tickets (22 %) sur le suivi de livraison, 18 (13 %) sur le délai de remboursement, 9 sur le changement d'adresse après commande, 6 sur un cas contractuel de livraison express.

Article rédigé : « Où en est ma commande ? ». Réponse : « Votre commande part sous 2 jours ouvrables. Le lien de suivi arrive par courriel dès l'expédition. » Pas à pas en 3 étapes, deux cas particuliers (colis en point relais, colis non reçu après 5 jours ouvrables), « Quand nous contacter » avec le canal. Validé par la responsable le 12/10/2026, revue le 12/01/2027. Source : groupe G-01, 31 tickets.

Mesure à 4 semaines : tickets de ce groupe, 31 en 13 semaines avant et 19 en 4 semaines après, soit environ 6 par mois contre 10 ; vote utile 14 sur 18. Lecture : « baisse observée, à confirmer sur 3 mois ; 18 votes, avis indicatif ».

Cas d'échec : le groupe « remboursement » mélange des clients qui ont acheté avec des conditions de reprise différentes selon un contrat cadre. La compétence n'écrit pas de délai unique : elle classe le groupe « non généralisable », demande au responsable les conditions par type de contrat, et propose un article qui renvoie au service pour les cas sous contrat cadre. Elle ne comble pas l'écart par la durée la plus fréquente.
