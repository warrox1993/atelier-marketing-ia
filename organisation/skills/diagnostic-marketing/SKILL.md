---
name: "diagnostic-marketing"
description: "Produit le dossier de diagnostic d'un client avant toute stratégie ou tactique : cinq volets (marché, clients, concurrents, marque, données internes), 3 à 5 constats chacun avec sa preuve et son niveau de confiance, liste des inconnus. À utiliser quand un client n'a pas de document de stratégie à jour, avant de choisir une cible, un positionnement ou un canal ; jamais pour recopier des généralités sur le secteur."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "marketing"
---

# Diagnostic marketing

## Quand l'utiliser

- Le client n'a aucun document de stratégie, ou le sien date de plus d'un an, ou un fait nouveau (concurrent, loi, sinistre médiatisé) touche un de ses volets.
- Une demande de campagne arrive et personne ne peut dire où en est le client ni pourquoi.
- C'est la première étape de la stratégie : sans constats prouvés, les compétences `segmentation-ciblage`, `positionnement-concurrentiel`, `objectifs-marque-activation` et `selection-canaux-bullseye` n'ont rien sur quoi s'appuyer.

## Objectif

Établir, avant de prescrire quoi que ce soit, où en est le client et pourquoi, sous forme de 3 à 5 constats prouvés, avec ce qui reste inconnu. Le marketing se fait en trois temps d'égale importance : diagnostic, stratégie, tactiques. Beaucoup d'entreprises sautent directement aux tactiques ; cette compétence l'empêche. Source de la méthode : Mark Ritson (Mini MBA, chroniques), sans ouvrage de référence unique [vérifié, secondaire]. Le découpage cible, position, objectifs pour l'étape suivante est [mémoire].

## Prérequis

- La fiche du client et ses connaissances (compétence `recherche-connaissances`).
- La fiche de cadrage de l'agent `exigences` : objectifs d'affaires, budget, contraintes réglementaires.
- Les données disponibles : ventes, sources des clients, statistiques du site, avis, résultats des campagnes passées.
- Des entretiens clients réels, s'ils existent (compétence `entretien-client-sans-biais`). Sans eux, les volets « clients » et « marque » restent en grande partie des hypothèses.

## Entrées

- `client` : fiche et connaissances.
- `cadrage` : fiche de cadrage validée.
- `donnees` : exports et statistiques fournis par le client ou par `mesure`.
- `veille` : note de marché et fiches concurrents (compétences `recherche-sourcee` et `analyse-concurrentielle`).

## Étapes

1. Ouvrir le dossier avec cinq volets : marché (taille, tendances), clients (études qualitatives puis quantitatives), concurrents, marque (notoriété, associations), données internes (ventes, sources des clients).
2. Pour chaque volet, demander à `veille`, `mesure` ou `exigences` ce qui manque, au lieu de le combler de mémoire. Chaque information porte sa source et sa date.
3. Écrire 3 à 5 constats au total. Chacun a : l'énoncé, la preuve (source, extrait, date), le niveau de confiance (« vérifié », « secondaire », « hypothèse », « contesté ») et ce qu'il implique pour la stratégie.
4. Séparer nettement fait, inférence et hypothèse. Une supposition n'est jamais présentée comme un constat.
5. Dresser la liste des inconnus : ce qu'il faudrait savoir, qui peut le fournir, et par quel moyen (entretien, export, sondage).
6. Refuser toute tactique qui n'est pas rattachée à un objectif de l'étape stratégie. Si le client a demandé une tactique précise, la noter comme demande en attente et ne pas la déduire du diagnostic.
7. Faire relire par `relecteur` : une preuve par constat, aucune généralité.
8. Déposer le dossier de diagnostic dans le document de stratégie du client (rubrique « Diagnostic »), nouvelle version datée.

## Livrable

Le « dossier de diagnostic » : cinq volets, 3 à 5 constats sourcés avec niveau de confiance, liste des inconnus, liste des sources non consultées. Une à deux pages, hors annexes de sources.

## Critères de réussite

- Chaque constat a une preuve réelle et un niveau de confiance ; aucune hypothèse n'est écrite comme un fait.
- Les constats portent sur ce client et ses clients, pas sur « le marché de l'assurance » en général.
- Les inconnus sont listés avec qui peut les lever.
- Aucune tactique ni aucun canal n'est recommandé dans ce dossier.

## Limites

- Piège principal : remplir le diagnostic de généralités sectorielles au lieu de faits sur le client. Une généralité sans lien avec le client est écartée.
- Contesté : Ritson défend un ciblage marqué, alors que Sharp (voir `objectifs-marque-activation`) plaide pour une large portée. Les deux se concilient : ciblage serré pour le positionnement et l'activation, portée large pour la construction de marque [contesté].
- Un agent IA ne mène pas d'entretien et n'invente aucune réponse « type » : sans donnée réelle, la case est « inconnu ».
- Aucune citation d'auteur entre guillemets sans l'avoir vérifiée : citer l'idée et l'ouvrage.

### Règles de vérité

- Tout chiffre du dossier vient de l'entrée et est cité tel quel avec sa source. Une valeur absente de l'entrée (budget, taux de conversion, part de marché, volume, cycle) s'écrit « inconnu » ou « non mesurable », jamais estimée ni reprise d'un chiffre de secteur.
- Un fait cité par une seule source est « isolé » et son niveau de confiance le reflète. Une supposition porte « hypothèse », jamais « vérifié ».
- Le dossier ne recommande rien : ni canal, ni outil, ni campagne, ni action commerciale, ni calendrier, ni budget, y compris dans la colonne « implication ». L'implication s'écrit comme une question à traiter par l'étape suivante (par exemple « à examiner au positionnement »), pas comme une action. Toute tactique demandée est notée dans « demandes en attente », sans être déduite.
- Les inconnus et les sources non consultées sont des listes séparées : chaque inconnu nomme qui peut le lever et par quel moyen.

### Modèle de livrable

À recopier, tous les champs sont obligatoires.

**Cinq volets** : marché, clients, concurrents, marque, données internes. Pour chacun : faits connus avec source et date, ou « inconnu ».

**Constats (3 à 5)**

| N° | Constat | Preuve (source, extrait, date) | Confiance (vérifié, secondaire, hypothèse, contesté) | Question pour l'étape suivante |
| --- | --- | --- | --- | --- |

**Inconnus** : liste (inconnu, qui peut le fournir, moyen).

**Sources non consultées** : liste.

**Demandes de tactique en attente** : liste, ou « aucune ».

**Recommandation de canal ou de campagne** : aucune à ce stade.

## Exemple

Client fictif : un courtier de taille moyenne, zone urbaine.

| Constat | Preuve | Confiance |
| --- | --- | --- |
| 70 % des nouveaux contrats de l'an dernier viennent de la recommandation | export des contrats du client, colonne « origine », 2026-10-01 | vérifié (chiffre du client) |
| Les concurrents locaux ne publient aucun prix | pages tarifs de 5 concurrents lues le 2026-10-15 (liste en annexe) | secondaire (échantillon de 5) |
| Les clients quittent le courtier précédent après un sinistre mal géré | aucun entretien réalisé | hypothèse, à valider par 5 entretiens |

Inconnus : coût d'acquisition par canal ; part des clients qui renouvellent ; raisons de départ (entretiens à mener par le client).
