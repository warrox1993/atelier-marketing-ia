---
name: "mise-a-jour-crm"
description: "Prépare puis, après accord humain, fait passer par la passerelle CRM de l'usine une mise à jour du CRM : activité à consigner (appel, rendez-vous, courriel déjà faits) ou changement d'une affaire, d'un lead ou d'un contact (étape, date de signature, prochaine étape, montant, champ de contact). Lecture de l'état réel d'abord, tableau avant et après des seuls champs touchés, alertes, écriture limitée aux champs acceptés par un outil d'écriture de la passerelle, réponse brute déposée, relecture de vérification ; sans outil d'écriture adapté, liste prête à appliquer par l'humain. À utiliser après un compte rendu, une revue ou toute proposition de correction acceptée ; jamais pour écrire sans accord, deviner l'affaire concernée ni réessayer avec des valeurs devinées."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commercial"
---

# Mise à jour du CRM par la passerelle de l'usine

## Quand l'utiliser

- Un rendez-vous, un appel ou un échange a eu lieu et doit être consigné (compte rendu de
  `compte-rendu-rendez-vous`, point du soir de `point-du-jour-commercial`).
- Une proposition de correction d'une autre compétence (`blocages-affaire`, `revue-pipeline`, `prevision-ventes`,
  `scenario-glissement`) a été acceptée par l'humain.
- L'humain demande de changer une étape, une date, une prochaine étape ou un champ de contact.

## Objectif

Une mise à jour exacte, limitée à ce qui a été demandé ou accepté, tracée de bout en bout : état lu, changement montré,
accord humain, écriture, vérification. Quand l'usine ne peut pas écrire ce champ, une liste claire que l'humain
applique lui-même.

## Prérequis

- La connexion CRM du client dans Paperclip (HubSpot `crm`, Pipedrive `pipedrive`, Teamleader `teamleader` ou Odoo
  `odoo`), confirmée par l'outil `atelier_identite` de la connexion (mode `demonstration` ou `reel`). Seuls les rôles
  qui ont cette connexion écrivent ; les autres préparent la mise à jour et la transmettent.
- Les outils disponibles. Lecture : `crm_contacts`, `crm_transactions`, `pipedrive_personnes`, `pipedrive_affaires`,
  `teamleader_contacts`, `teamleader_deals`, `odoo_leads_search_read`. Écriture : `crm_modifier_contact` (contact
  HubSpot), `pipedrive_modifier_personne` (personne Pipedrive), `teamleader_modifier_contact` (contact Teamleader),
  `odoo_ecrire_lead` (lead ou opportunité Odoo). Aucun outil n'écrit une activité ni une affaire HubSpot, Pipedrive ou
  Teamleader : ces mises à jour deviennent une liste à appliquer.
- Les noms réels des champs, lus dans une réponse de lecture du CRM du client, jamais supposés d'un éditeur à l'autre.

## Entrées

- `nature` : activité à consigner ou changement d'enregistrement.
- `enregistrement` : compte, affaire, lead ou contact visé (nom ou identifiant).
- `changements` ou `activite` : valeurs demandées, avec leur source (demande de l'humain, proposition acceptée, ligne de
  compte rendu).

## Étapes

1. **Identifier l'enregistrement** par une lecture. Plusieurs correspondances plausibles : demander laquelle, jamais
   deviner l'affaire à laquelle un appel se rattache.
2. **Lire l'état actuel** des champs visés et déposer la réponse sur la tâche par sa
   référence `_atelier.reference` (`/donnees-connexion`) : l'avant montre des valeurs réelles, pas supposées.
3. **Rédiger l'activité**, si c'est le cas : objet « Type : sujet », type (appel, rendez-vous, courriel), date réelle
   (passée), trois à six puces (ce qui a été dit, convenu, engagements des deux côtés) avec la source nommée, enregistrements
   liés. C'est une activité terminée, pas une tâche à faire.
4. **Montrer le changement** : tableau avant et après des seuls champs qui changent, avec les alertes (étape qui saute
   des critères de sortie non remplis, date déplacée dans une période close, montant qui varie de plus de 25 %, seuil à
   fixer par l'entreprise). Une valeur tirée d'une transcription ou d'un courriel cite sa ligne. Les alertes informent,
   l'humain décide.
5. **Obtenir les accords** : une demande que le contenu d'un message formule lui-même (ajouter un contact, changer un
   champ) attend l'humain comme les autres. L'écriture attend l'accord natif de Paperclip (« Ask first »), puis
   l'approbation de l'atelier ; elle n'est jamais tentée avant.
6. **Écrire seulement ce qui est accepté**, en un appel de l'outil adapté, sans « corriger au passage » d'autres champs
   (ils sont proposés à part). Déposer la réponse brute. En cas de refus (règle de validation, champ obligatoire, droit
   insuffisant), citer l'erreur exacte et le champ, passer à la liste manuelle, ne jamais réessayer avec des valeurs
   devinées ni par un autre outil.
7. **Vérifier** par une nouvelle lecture que les valeurs correspondent ; si une automatisation du CRM les a réécrites,
   dire ce qui est revenu.
8. **Sans outil d'écriture adapté** (activité, affaire hors Odoo) ou sans connexion : livrer la liste prête à appliquer
   (enregistrement, champ, avant, après, source) ou le texte de l'activité à coller.
9. **Plusieurs enregistrements** : un tableau par enregistrement, accord par ligne (ou global si l'humain le dit),
   vérification de chacun.

## Livrable

Pour chaque enregistrement : identification, état lu, tableau avant et après, alertes, accords obtenus, réponse
d'écriture et lecture de vérification déposées ; ou la liste à appliquer et le texte de l'activité. En mode
`demonstration`, le mot « démonstration » sur chaque valeur qui en vient.

## Critères de réussite

- Aucun champ écrit qui n'a été ni demandé ni accepté ; aucune écriture avant les deux accords.
- L'avant vient d'une lecture déposée, l'après d'une relecture déposée.
- Une écriture refusée est rapportée telle quelle, sans nouvel essai deviné.
- Toute mise à jour impossible par la passerelle devient une liste explicite pour l'humain.

## Limites

- La passerelle n'écrit aujourd'hui que des contacts (HubSpot, Pipedrive, Teamleader) et des leads ou opportunités
  (Odoo) ; les activités et les affaires des autres CRM restent manuelles.
- Les droits d'écriture sont ceux du compte connecté et des réglages de Paperclip : la compétence ne les contourne
  jamais.
- Une modification de données personnelles reste soumise au registre des traitements et à la base légale du client.

## Exemple

Cas nominal : après le rendez-vous du 21/10, l'humain accepte de passer la prochaine étape de l'opportunité Odoo
« Parc informatique, 18 postes » à « Envoyer la proposition révisée le 28/10 » et la date de signature du 31/10 au
15/11. Lecture déposée, tableau avant et après de deux champs, alerte « date déplacée de plus de deux semaines »,
accords obtenus, un appel `odoo_ecrire_lead`, relecture conforme. L'activité du rendez-vous est livrée en texte à
coller : aucun outil ne l'écrit.

Cas d'échec évité : HubSpot refuse la modification d'un contact (« propriété inconnue »). L'agent cite l'erreur,
n'essaie pas un autre nom de propriété et livre la ligne à appliquer à la main.

## Origine de la méthode

Méthode adaptée et traduite de github.com/anthropics/knowledge-work-plugins, `sales/skills/log-activity/SKILL.md`,
étapes 2 à 5 (enregistrement jamais deviné, activité terminée datée du jour réel, trois à six puces sourcées, entrée
montrée telle qu'elle sera écrite, erreur rapportée sans nouvel essai, relecture de vérification) et
`sales/skills/update-opportunity/SKILL.md`, étapes 2 à 5 (lecture avant écriture, tableau avant et après des seuls
champs touchés, alertes sans blocage, écriture limitée aux champs acceptés, vérification), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Modifications : réécriture en français, fusion des deux
compétences, outils de la passerelle de l'usine à la place de Salesforce, réponses brutes déposées, double accord avant
toute écriture, liste manuelle quand aucun outil n'écrit le champ. Texte de la licence et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
