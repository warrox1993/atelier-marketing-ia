---
name: "procedure-qualite"
description: "Rédige ou révise une procédure écrite d'une PME belge (objet, champ d'application, responsabilités par fonction, étapes, contrôles, enregistrements, indicateurs, versionnage) selon la logique de l'approche processus et de l'amélioration continue de l'ISO 9001. À utiliser pour décrire un processus réel (accueil d'une commande, traitement d'une réclamation, validation d'un document), mettre à jour une procédure périmée ou uniformiser plusieurs procédures ; jamais pour décrire un idéal que l'entreprise ne pratique pas, reproduire le texte de la norme (payant), approuver soi-même la procédure ni imposer un changement d'organisation."
metadata:
  version: "1.1.0"
  langue: "fr"
  domaine: "qualite"
---

# Procédure qualité d'une PME belge

## Quand l'utiliser

- Un processus existe « dans la tête des gens » et doit être écrit pour être transmis, contrôlé ou audité.
- Une procédure existante ne correspond plus à ce qui se fait réellement.
- Plusieurs procédures n'ont pas la même structure, les mêmes mots ou les mêmes responsables.

## Objectif

Une procédure courte (une à trois pages) qu'un nouvel arrivant peut suivre sans poser de question, qui décrit ce qui se fait réellement, nomme des fonctions responsables, précise ce qui est contrôlé et ce qui est enregistré, et porte un numéro de version avec un approbateur humain.

## Prérequis

- Le processus à décrire et sa raison d'être (quel résultat, pour quel client interne ou externe).
- La description des pratiques par les personnes qui font le travail (pas seulement par leur responsable).
- Les procédures, modèles et formulaires existants.
- Le nom de la fonction qui approuvera (jamais le rédacteur).

## Entrées

- `processus` : intitulé et déclencheur (ce qui lance le processus).
- `pratiques` : description des pratiques réelles, avec la date et les personnes (fonctions) consultées.
- `existant` : procédure précédente, si elle existe.
- `exigences` : obligations légales ou contractuelles qui s'appliquent, si connues.

## Étapes

1. **Cadrer** : écrire en une phrase l'objet (« cette procédure décrit comment... »), le déclencheur et le résultat attendu. Si le processus n'a pas de début ou de fin nets, le dire et proposer une coupe.
2. **Fixer le champ d'application** : ce qui est couvert, ce qui est exclu, les sites ou équipes concernés. Une exclusion non écrite est une source de désaccord plus tard.
3. **Définir les responsabilités par fonction** : chaque étape a une seule fonction qui rend des comptes (« gestionnaire des commandes », jamais un prénom). Les fonctions qui contribuent sont listées à part. Une étape sans responsable est signalée comme manque. Présenter le tout en matrice RACI (réalise, rend des comptes, consulté, informé) : exactement un « A » par étape.
4. **Décrire les étapes dans l'ordre réel** : un verbe d'action par étape, qui fait quoi, avec quel outil ou document, dans quel délai. Les cas d'exception (client absent, produit refusé, panne) ont leur propre étape plutôt qu'une parenthèse, et sont repris dans un tableau « exceptions et cas particuliers » (situation, quoi faire, qui décide) : c'est souvent la partie la plus utile de la procédure. Une exception citée en passant pendant l'entretien y figure toujours.
5. **Placer les contrôles** : à quel endroit on vérifie, quoi, par qui, avec quel critère d'acceptation et que fait-on si le critère n'est pas atteint (renvoi vers la compétence `non-conformite-action-corrective`).
6. **Lister les enregistrements** : pour chacun, nom, support, responsable de la tenue, lieu, durée de conservation. Quand l'enregistrement contient des données personnelles, la durée est justifiée et à valider (voir « À vérifier »).
7. **Choisir deux à quatre indicateurs** : définition, formule, fréquence, source. Un indicateur qui ne déclenche aucune décision est retiré.
8. **Comparer à la pratique** : relever chaque écart entre le texte et ce que les personnes décrivent, sans juger. Pour chacun, proposer soit d'adapter le texte à la pratique, soit de signaler que la pratique devrait changer et que cette décision revient à l'humain responsable.
9. **Versionner** : numéro (1.0 pour une première version, 1.1 pour une correction de forme, 2.0 pour un changement de fond), date, nature de la modification, approbateur (fonction et statut « à approuver » tant qu'il n'a pas signé).
10. **Relire à voix haute** : chaque étape doit être comprise sans le rédacteur. Supprimer les phrases du type « le cas échéant », « si nécessaire » sans critère.

### Plan type

| Rubrique | Contenu minimal |
| --- | --- |
| En-tête | titre, code, version, date, approbateur, statut |
| 1. Objet | une à deux phrases |
| 2. Champ d'application | couvert, exclu |
| 3. Définitions | seulement les mots qui prêtent à confusion |
| 4. Responsabilités | tableau fonction / rôle |
| 5. Description | étapes numérotées, qui fait quoi, quand |
| 6. Contrôles | quoi, par qui, critère, si non conforme |
| 7. Enregistrements | nom, responsable, lieu, durée |
| 8. Indicateurs | définition, formule, fréquence |
| 9. Documents liés | procédures, formulaires |
| 10. Historique | version, date, modification, approbateur |

### Repères de rédaction

- Une phrase = une action, au présent de l'indicatif ou à l'impératif, voix active.
- Pas de sigle sans définition à la première occurrence.
- Les délais sont chiffrés (« sous 2 jours ouvrables »), les critères sont mesurables.
- Les numéros de téléphone, noms de personnes et mots de passe n'ont pas leur place dans la procédure : on renvoie vers un annuaire tenu à jour.

## Livrable

- La procédure en Markdown selon le plan type.
- La liste des écarts entre le texte et les pratiques décrites.
- Le tableau des versions.
- La liste des points à faire valider (légaux, de sécurité, de santé) et des questions restées sans réponse.

## Critères de réussite

- Chaque étape a un verbe, une fonction responsable et, si elle est contrôlée, un critère.
- Aucun nom de personne ; des fonctions seulement.
- Chaque enregistrement a un responsable et une durée de conservation.
- Chaque écart avec la pratique décrite est listé.
- Le statut reste « à approuver » jusqu'à la décision de l'humain responsable.

## Sources officielles

Consultées le 16/10/2026 :

- « Famille ISO 9000 », Comité ISO, https://committee.iso.org/fr/normes/les-plus-connues/famille-iso-9000 : la page présente l'ISO 9001 (édition 2026) comme norme d'exigences pour les systèmes de management de la qualité et l'ISO 9000 comme norme des concepts fondamentaux et du vocabulaire. Le texte de la norme est payant et n'est pas reproduit ici.
- « Les 7 principes fondamentaux ISO 9001 et le cycle PDCA », LRQA (organisme de certification), https://www.lrqa.com/fr-fr/iso-9001/7-principes-fondamentaux-iso-9001/ : orientation client, leadership, engagement du personnel, approche processus, amélioration, décision fondée sur les preuves, management des relations ; cycle planifier, déployer, vérifier, agir. Source privée, citée pour sa présentation des principes publics, pas pour le texte de la norme.

L'accès aux pages de iso.org et de l'organisme belge de normalisation (NBN) pour la norme elle-même a été refusé ou n'a pas permis de lire le contenu : ces pages ne sont pas citées. La structure du plan type, les règles de versionnage et les repères de rédaction sont des pratiques courantes de gestion, pas des exigences officielles.

## À vérifier par un professionnel

- Un conseiller en qualité ou un auditeur qualité si la procédure doit servir à une certification ISO 9001 : seul le texte de la norme en vigueur (à acheter auprès du NBN) fait foi, et la transition d'édition éventuelle est à confirmer auprès de l'organisme de certification.
- Le conseiller en prévention ou le service externe pour la prévention et la protection au travail si la procédure touche à la sécurité ou à la santé.
- Le délégué à la protection des données ou un juriste si des enregistrements contiennent des données personnelles (durée de conservation, accès).

## Limites

- La compétence décrit un processus tel que des personnes le racontent ; elle ne l'observe pas. Si deux personnes décrivent deux façons de faire, elle le signale et ne tranche pas.
- Elle ne certifie rien et ne garantit pas la conformité à une norme.
- Elle n'approuve ni ne publie la procédure.
- Un processus qui change chaque semaine ne se prête pas à une procédure figée : proposer plutôt une liste de contrôle.

## Exemple

Demande : décrire le traitement d'une commande dans une entreprise de 12 personnes. Pratiques décrites par l'assistante commerciale et le magasinier le 14/10/2026.

Extrait de la procédure (v1.0, à approuver) :

| N° | Étape | Responsable | Délai | Contrôle |
| --- | --- | --- | --- | --- |
| 1 | Enregistrer la commande dans le logiciel de gestion | assistante commerciale | le jour de réception | les références et quantités correspondent au bon de commande du client |
| 2 | Vérifier le stock | magasinier | 1 jour ouvrable | stock disponible >= quantité commandée |
| 3 | Si stock insuffisant, prévenir le client et proposer une date | assistante commerciale | même jour | confirmation écrite du client |

Écart relevé : le texte demande une confirmation écrite du client ; le magasinier dit confirmer parfois par téléphone sans trace. Décision demandée à la direction : exiger l'écrit ou accepter un compte rendu d'appel.

Cas d'échec : deux personnes décrivent des ordres différents (l'une vérifie le stock avant d'enregistrer, l'autre après). La compétence ne choisit pas : elle écrit « ordre à confirmer par la direction » à l'étape 1 et laisse le statut « à approuver » avec la question en tête de page. Elle ne livre pas une procédure qui aurait l'air définitive.

## Origine de la méthode

Matrice RACI et tableau des exceptions adaptés et traduits de github.com/anthropics/knowledge-work-plugins,
`operations/skills/process-doc/SKILL.md`, sections « Output » et « Tips », commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : traduction, un seul « A » par étape,
validation humaine. Texte des licences et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
