---
name: "analyse-menaces-outil"
description: "Établit le modèle de menaces d'un outil de développement (surface d'attaque, données exposées, droits demandés, chaîne d'approvisionnement), lit un résultat de scan statique et fixe la gravité de chaque constat avec sa preuve. À utiliser pour rédiger le chapitre sécurité d'un dossier de l'Observatoire à partir de scans faits par le code et des avis officiels."
metadata:
  version: "1.0.3"
  langue: "fr"
  domaine: "observatoire"
---

# Modèle de menaces d'un outil de développement

## Quand l'utiliser

- Le chapitre sécurité (ch21) ou confidentialité (ch22) d'un dossier doit être écrit.
- Un résultat de scan statique est livré et doit être interprété.
- Un avis de sécurité officiel concerne une version de l'outil.

## Objectif

Transformer des résultats de scan et des permissions relevées en constats de gravité structurés,
chacun avec une preuve. Le niveau d'isolement est celui de l'ADR-008 : niveau 0 ou 1 (lecture et
analyse statique sans réseau). Aucune exécution ici.

## Prérequis

- Résultats de scan faits par le code, permissions relevées par l'intégrateur, avis officiels.
- Version exacte de l'outil.

## Entrées

- Les résultats de scan statique faits par le code, avec l'outil de scan et sa version.
- Les permissions relevées par l'intégrateur et les avis de sécurité officiels datés.
- La version exacte de l'outil analysé.

## Étapes

1. Lister les actifs : code de l'utilisateur, secrets et variables d'environnement, fichiers
   locaux, réseau, compte du fournisseur.
2. Dresser la surface d'attaque : exécution de commandes, lecture et écriture de fichiers, accès
   réseau, appels sortants, télémétrie, mise à jour automatique, extensions tierces.
3. Examiner la chaîne d'approvisionnement : dépendances et leurs versions, scripts d'installation,
   origine et signature des paquets, mainteneurs.
4. Pour chaque outil ou droit exposé, noter ce qu'un contenu malveillant (injection dans un
   README, un fichier ou une réponse d'outil) pourrait lui faire faire.
5. Lire le scan : écarter les doublons et les faux positifs motivés, rattacher chaque trouvaille à
   un fichier et à une ligne ou à l'avis officiel qui la fonde.
6. Fixer la gravité : `critique`, `majeure`, `mineure` ou `info` (l'énumération `Gravite` du plugin), selon l'impact (données,
   exécution, étendue) et la facilité d'exploitation. Écrire le motif.
7. Enregistrer chaque constat comme affirmation (voir `affirmations-preuves`) avec sa preuve : extrait
   du scan ou de l'avis, position, version.

## Livrable

Des constats structurés (titre, gravité et motif, preuve, version concernée, correctif connu) et le
texte du chapitre sécurité.

## Critères de réussite

- Chaque constat a une preuve ; l'absence de preuve donne `non_verifie`.
- Chaque gravité a un motif ; les limites du scan sont énoncées.
- Une faille critique non publiée suspend la publication et remonte au directeur.

## Limites

- Une analyse statique ne dit pas ce que fait le code à l'exécution ; l'essai relève de
  `protocole-essai-isole`.
- Ce guide ne remplace ni un audit ni l'agent `securite`.

## Exemple

Cas illustratif, outil et valeurs fictifs : le scan de « Outil-Demo » signale un script d'installation qui télécharge un binaire.

| constat | gravité | motif | preuve |
| --- | --- | --- | --- |
| Le script d'installation télécharge un binaire sans vérifier sa signature. | majeure | exécution de code non vérifié sur le poste de l'utilisateur | extrait du scan, fichier `install.sh`, ligne indiquée par le scan |
| Aucune télémétrie trouvée. | info | le scan est vide sur ce point, ce qui ne prouve pas l'absence | `non_verifie` |

Le chapitre sécurité reprend ces deux lignes et énonce la limite du scan.

## Pièges

- Écrire « sûr » parce que le scan est vide : un scan vide ne prouve pas l'absence de faille.
- Copier la gravité d'un tiers sans la relire contre la version réelle de l'outil.
- Confondre « droit demandé » et « abus constaté ».
- Publier le détail d'exploitation d'une faille non corrigée.
- Citer un avis de sécurité sans sa date ni la version corrigée.
