---
name: "revue-sous-traitance-rgpd"
description: "Relit un contrat ou avenant de sous-traitance de données personnelles (article 28 du RGPD) proposé à une PME belge par un fournisseur (logiciel en ligne, hébergeur, secrétariat social, prestataire marketing) : éléments obligatoires, obligations du sous-traitant, sous-traitants ultérieurs, notification des violations, transferts hors EEE, problèmes fréquents, puis état des accords par fournisseur et analyse des manques. À utiliser avant la signature d'un tel contrat ou pour faire l'inventaire des fournisseurs qui traitent des données ; jamais pour signer ni pour juger seul de la validité d'un transfert international."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "juridique"
---

# Revue d'un contrat de sous-traitance RGPD

## Quand l'utiliser

- Un fournisseur envoie son « DPA » ou son avenant de traitement des données à accepter.
- Le registre des traitements mentionne un prestataire sans contrat de sous-traitance connu.
- La direction veut savoir quels fournisseurs traitent des données de l'entreprise et avec quels accords.

## Objectif

Une liste de contrôle remplie clause par clause, avec citations, manques et positions de départ, et un tableau des
accords par fournisseur qui montre ce qui existe, ce qui expire et ce qui manque, pour que l'humain signe, négocie ou
change de fournisseur.

## Prérequis

- Le contrat de sous-traitance et le contrat principal de service (pour comparer responsabilité et durée).
- La fiche du traitement concerné dans le registre.
- La liste des fournisseurs et des contrats connus, pour l'état des accords.

## Entrées

- `contrat_sous_traitance`, `contrat_principal` : textes intégraux.
- `traitement` : extrait du registre.
- `fournisseurs` : liste avec contrats connus, dates, renouvellement.

## Étapes

1. **Éléments à décrire dans le contrat** : objet et durée, nature et finalité, catégories de données, catégories de
   personnes, obligations et droits du responsable du traitement.
2. **Obligations du sous-traitant** : traitement sur instruction documentée seulement ; confidentialité du personnel ;
   mesures de sécurité décrites ; sous-traitants ultérieurs (autorisation écrite, information préalable des
   changements avec possibilité de s'y opposer, mêmes obligations imposées, sous-traitant responsable de leurs
   manquements) ; aide pour les demandes des personnes ; aide pour la sécurité, les violations et les analyses
   d'impact ; suppression ou restitution en fin de contrat au choix du responsable ; audits ou inspections ;
   notification des violations sans retard injustifié.
3. **Transferts hors Espace économique européen** : mécanisme identifié (décision d'adéquation, clauses contractuelles
   types de la Commission, autre garantie), lieux de traitement indiqués, analyse d'impact du transfert si nécessaire.
4. **Cohérence pratique** : responsabilité et durée alignées sur le contrat principal, lieux de traitement acceptables,
   normes de sécurité exigées.
5. **Problèmes fréquents et positions de départ** : autorisation générale des sous-traitants ultérieurs sans
   information (exiger l'information et le droit d'opposition) ; délai de notification d'une violation trop long pour
   permettre la notification à l'autorité dans les 72 heures (demander 24 à 48 heures) ; aucun droit d'audit (accepter
   un rapport d'audit indépendant et un audit sur motif) ; délai de suppression non précisé (30 à 90 jours après la fin) ;
   lieux de traitement non indiqués (exiger la liste) ; clauses types d'une ancienne version (exiger la version en
   vigueur). Ce sont des positions de négociation courantes, à faire valider.
6. **État des accords par fournisseur** : type d'accord, statut (en vigueur, expiré, en négociation, à signer), date
   d'effet, échéance, renouvellement tacite et préavis, points clés, avenants.
7. **Analyse des manques** : contrat principal sans contrat de sous-traitance alors que le fournisseur traite des
   données ; contrat expiré ; transfert sans mécanisme. Chaque manque est classé « bloquant » ou « à régulariser ».

## Livrable

La liste de contrôle (exigence, clause citée, conforme, écart ou absent, position proposée), le tableau des accords par
fournisseur, la liste des manques classés, les questions au juriste et la carte de décision.

## Critères de réussite

- Chaque exigence a une citation ou la mention « absent ».
- Chaque fournisseur qui traite des données a un statut d'accord ; aucun manque n'est passé sous silence.
- Les positions de départ sont présentées comme négociables, pas comme obligations légales.
- Aucune signature n'est présentée comme faite.

## À vérifier par un professionnel

- Le texte exact de l'article 28, paragraphe 3, et des clauses contractuelles types, à relire sur EUR-Lex : délégué à
  la protection des données ou juriste. EUR-Lex n'a pas pu être ouvert le 17/10/2026 (page protégée contre les robots).
- La validité d'un transfert hors Espace économique européen et l'analyse d'impact du transfert : juriste.

## Limites

- La compétence ne vérifie pas la sécurité réelle du fournisseur : elle relit ce que le contrat promet.
- Elle ne tranche pas si le fournisseur est sous-traitant ou responsable conjoint ; elle pose la question.

## Exemple

Logiciel de gestion de la relation client hébergé hors de l'Union. Écarts : sous-traitants ultérieurs autorisés « de
manière générale » sans information ; violation notifiée « dans les 7 jours » ; aucun lieu de traitement indiqué.
Positions proposées : information préalable et droit d'opposition, notification sous 48 heures, liste des lieux.
Transfert : mécanisme non identifié, classé bloquant. État des accords : contrat principal en vigueur jusqu'au
31/03/2027, renouvellement tacite avec préavis de 3 mois.

Cas d'échec : l'agent coche « audits » parce que le contrat cite « un certificat de sécurité disponible sur demande ».
Un certificat n'est pas un droit d'audit : écart à signaler.

## Origine de la méthode

Méthode adaptée de github.com/anthropics/knowledge-work-plugins, `legal/skills/compliance-check/SKILL.md` (« DPA Review
Checklist ») et `legal/skills/vendor-check/SKILL.md` (étapes 3 et 4 : état des accords et analyse des manques), commit
33eeda1e8fd856455b05479d13a0f85b5f803744, licence Apache 2.0. Non repris : addendum britannique. Modifications : français,
positions présentées comme négociables. Liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
