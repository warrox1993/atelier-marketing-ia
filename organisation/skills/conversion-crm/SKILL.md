---
name: "conversion-crm"
description: "Conçoit pages de conversion, formulaires, segments et scénarios de suivi en documentant entrées, déclencheurs, exclusions, consentements et conditions d'envoi, sans aucune prospection réelle automatique. À utiliser pour une page de demande de devis, un formulaire, une séquence de relance ou une segmentation de contacts."
metadata:
  version: "1.2.0"
  langue: "fr"
  domaine: "conversion"
---

# Pages de conversion et scénarios CRM

## Quand l'utiliser

- Le brief demande plus de demandes de devis, de rendez-vous ou d'inscriptions.
- Un scénario de relance ou une segmentation doit être conçu ou revu.

## Objectif

Concevoir des parcours de conversion clairs et des scénarios de suivi complets, qui ne
peuvent rien envoyer sans consentement documenté et approbation humaine.

## Prérequis

- Offres validées, parcours visé, charte de marque.
- Chiffres d'une connexion de la passerelle marketing (Search Console, Analytics, Ads, fiche,
  réseaux sociaux, CRM) : `atelier_identite` d'abord, chaque réponse d'outil déposée telle quelle avec
  les arguments exacts de l'appel (`POST …/taches/<issueId>/donnees-connexion`, champ `arguments`),
  mention « démonstration » sur chaque chiffre de démonstration, aucun chiffre absent d'une réponse
  déposée (section « Connexions de la passerelle marketing » des consignes de l'agent).
- Toute écriture réelle (modification d'un contact, d'un lead, d'une personne) suit le parcours de la
  section « Diffusion réelle : parcours complet » des consignes de l'agent : approbation de l'humain sur la
  version exacte, demande de diffusion avec service, outil et arguments exacts, preuve jointe à l'appel,
  issue rapportée, jamais de nouvel essai à l'aveugle sur une issue ambiguë. Le livrable écrit donc, mot pour
  mot, chaque valeur à écrire.

## Entrées

- `objectif_conversion`, `offres_validees`, `parcours`, `segments_envisages`.

## Étapes

1. Page : promesse (offre validée), preuves sourcées, réponses aux objections, un seul appel
   à l'action, informations de l'établissement concerné.
2. Formulaire : champs strictement nécessaires, obligatoires justifiés, messages d'erreur,
   case de consentement non pré-cochée par finalité, lien vers la politique de
   confidentialité, accusé de réception.
3. Segments : critère, source de la donnée, base légale à faire vérifier.
4. Scénarios : pour chacun, entrée, déclencheur, exclusions (déjà client, désinscrit,
   demande en cours), consentement requis, condition d'envoi, fréquence maximale, sortie.
5. En démonstration, n'utiliser que des prospects fictifs (adresses en `.invalid`).
6. Lister les approbations nécessaires avant tout envoi (version, audience, canal).

## Livrable

Structure de page, spécification de formulaire, tableau des segments, fiches de
scénarios, approbations requises.

## Critères de réussite

- Chaque scénario est complet ; aucun envoi sans consentement ni approbation.
- Aucune donnée réelle de prospect en démonstration.

## Limites

- Aucun CRM n'est connecté : les scénarios sont des spécifications.
- La conformité RGPD est signalée pour vérification, jamais certifiée.

## Exemple

Scénario « Relance devis non signé » : entrée = devis envoyé depuis 10 jours ; déclencheur
= aucune réponse ; exclusions = devis signé, demande de ne plus être contacté, chantier en
cours ; consentement = suivi de la demande de devis (relation précontractuelle, à faire
vérifier) ; envoi = un courriel, puis rien ; contact fictif : `client.demo1@exemple.invalid`.
