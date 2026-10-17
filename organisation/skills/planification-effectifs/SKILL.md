---
name: "planification-effectifs"
description: "Aide la direction d'une PME belge à planifier ses effectifs : besoins par rôle et par échéance, structure et lignes hiérarchiques, ordre des recrutements, coût estimé à partir des hypothèses fournies, et repères d'organisation (étendue d'encadrement, taille d'équipe) présentés comme pratiques et non comme normes. À utiliser pour préparer un budget d'effectifs, une réorganisation ou la question « qui recruter d'abord » ; jamais pour désigner des personnes à licencier, évaluer des individus ni décider d'une création ou suppression de poste."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "ressources-humaines"
---

# Planification des effectifs

Service sensible : la compétence raisonne sur des rôles et des postes, jamais sur des personnes. Toute création ou
suppression de poste est une décision humaine, et une réorganisation qui touche des emplois suit des procédures
d'information et de consultation propres (service juridique social).

## Quand l'utiliser

- Préparation du budget de l'année suivante : combien de postes, lesquels, quand.
- Une équipe grandit et la question de l'encadrement se pose.
- La direction hésite entre plusieurs recrutements et veut un ordre argumenté.

## Objectif

Un plan d'effectifs lisible : organigramme cible en texte, besoins par rôle avec échéance et justification, séquence
de recrutement argumentée, coût estimé à partir d'hypothèses écrites, et signalement des fragilités structurelles
(personne seule détentrice d'un savoir, encadrement trop large ou trop étroit).

## Prérequis

- L'organigramme actuel par rôle (sans données personnelles) et les postes ouverts.
- Les objectifs d'activité de la période (croissance, nouveaux services, départs connus).
- Les hypothèses de coût par poste fournies par la direction ou le secrétariat social. Sans hypothèse fournie, aucun
  coût n'est chiffré : il est écrit « coût à fournir ».

## Entrées

- `organigramme` : rôles, rattachements, effectif par rôle.
- `objectifs` : activité attendue et échéances.
- `couts_hypotheses` : coût annuel chargé par type de poste, si fourni.
- `contraintes` : budget maximal, délais, locaux.

## Étapes

1. **Poser les quatre dimensions** : effectif (combien, quels rôles, pour quand), structure (rattachements, étendue
   d'encadrement, frontières d'équipe), séquence (quels postes d'abord), budget (coût et arbitrages).
2. **Relier chaque besoin à un objectif** : un poste sans objectif d'activité associé est signalé.
3. **Comparer la structure aux repères d'organisation**, cités comme pratiques courantes et non comme normes : 5 à 8
   personnes encadrées par responsable (signal d'alerte sous 3 ou au-delà de 12), équipes de 5 à 9 personnes.
   Ces repères ne s'appliquent pas tels quels à une petite structure ; ils servent à poser une question, pas à
   trancher.
4. **Repérer les fragilités** : rôle tenu par une seule personne sans suppléant, encadrement surchargé, dépendance à
   un prestataire unique.
5. **Ordonner les recrutements** : impact sur l'objectif, délai de recrutement, dépendances entre postes.
6. **Chiffrer seulement avec les hypothèses fournies** et présenter deux ou trois scénarios (prudent, central, ambitieux).
7. **Signaler les obligations liées** : une suppression ou transformation de postes, un changement d'organisation
   important ou un licenciement collectif possible sont renvoyés au service juridique social avant toute annonce.

## Livrable

- Organigramme cible en texte, par rôle.
- Tableau des besoins : rôle, nombre, échéance, objectif servi, coût estimé ou « coût à fournir ».
- Séquence de recrutement argumentée.
- Fragilités relevées et pistes.
- Scénarios et décisions attendues de la direction.

## Critères de réussite

- Aucun nom de personne ni appréciation individuelle dans le plan.
- Chaque besoin est relié à un objectif et chaque coût à une hypothèse écrite.
- Les repères d'organisation sont présentés comme des pratiques, avec leur limite pour une PME.
- Les décisions sur les postes sont listées comme décisions humaines.

## À vérifier par un professionnel

- Coût réel d'un poste (cotisations, avantages, barèmes sectoriels) : secrétariat social.
- Toute réorganisation touchant des emplois, et l'information ou la consultation éventuelle des représentants du
  personnel : service juridique social et avocat en droit social.

## Limites

- La compétence ne connaît ni les barèmes ni les coûts salariaux : elle n'utilise que ceux fournis.
- Elle ne recommande jamais un licenciement et ne désigne aucune personne.

## Exemple

Cabinet de 14 personnes, objectif : ouvrir un service entreprises au printemps. Besoins : un gestionnaire entreprises
(mars, lié à l'objectif), un assistant administratif (juin, si le volume dépasse 40 dossiers par mois). Fragilité : la
seule personne qui maîtrise le logiciel de production n'a pas de suppléant ; piste : former un second utilisateur.
Structure : la gérante encadre 11 personnes directement, au-delà du repère de 8 : question posée à la direction, sans
conclusion imposée. Coûts : « coût à fournir » faute d'hypothèses.

Cas d'échec : la direction demande « quelles personnes supprimer pour financer le poste ». La compétence refuse de
désigner des personnes et renvoie la question au service juridique social et à la direction.

## Origine de la méthode

Méthode adaptée de github.com/anthropics/knowledge-work-plugins, `human-resources/skills/org-planning/SKILL.md`, commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0 (quatre dimensions, repères d'étendue d'encadrement et de
taille d'équipe, signalement des fragilités). Modifications : français, repères présentés comme pratiques et non
normes, aucun chiffrage sans hypothèse fournie, renvoi au juridique social. Liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
