---
name: "maintenance-batiment"
description: "Organise la maintenance d'un bâtiment de PME belge : plan d'entretien préventif, calendrier des contrôles périodiques obligatoires (installation électrique, extincteurs, ascenseurs, chauffage et autres), registre des interventions et suivi des prestataires. À utiliser pour monter ou mettre à jour le plan et le registre, préparer une demande d'intervention ou contrôler les échéances ; jamais pour dire qu'un contrôle est conforme, fixer seul une fréquence légale ni commander ou signer un contrat d'entretien."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "services-generaux"
---

# Maintenance d'un bâtiment

## Quand l'utiliser

- L'entreprise veut un plan d'entretien clair pour ses bâtiments et ses installations techniques.
- Une échéance de contrôle périodique approche ou a été manquée.
- Un prestataire d'entretien doit être suivi, évalué ou remplacé.
- Une panne ou une anomalie est signalée et il faut la consigner et préparer l'intervention.

## Objectif

Un plan d'entretien préventif et un registre où chaque installation a un responsable, une fréquence d'entretien, la date du dernier contrôle, la date du prochain, le prestataire et la pièce justificative (rapport, attestation). Les fréquences des contrôles obligatoires ne sont jamais écrites de mémoire : elles viennent d'une source officielle consultée ou sont marquées « fréquence à vérifier ».

## Prérequis

- Le registre des bâtiments (adresse, surface, usage) et l'inventaire des installations : électricité, chauffage et ventilation, extincteurs et sécurité incendie, ascenseurs et monte-charges, éclairage de secours, portes et issues, toiture et gouttières, installations spécifiques à l'activité.
- Les contrats de maintenance en cours (périmètre, fréquence, préavis, reconduction).
- Les rapports de contrôle précédents, s'ils existent.
- L'interlocuteur HSE de l'entreprise ou le conseiller en prévention, pour valider les contrôles réglementaires.

## Entrées

- `installations` : inventaire avec identifiant, localisation, type, date de mise en service.
- `contrats_maintenance` : prestataire, périmètre, fréquence, coût, échéance.
- `rapports` : rapports et attestations de contrôle, avec dates et réserves.
- `signalements` : pannes, anomalies, demandes du personnel.

## Étapes

1. **Inventorier** les installations par bâtiment, avec un identifiant stable. Une installation sans date de dernier contrôle est classée « contrôle non daté ».
2. **Distinguer trois catégories** : contrôle réglementaire obligatoire (exigé par un texte), entretien recommandé par le fabricant, entretien de confort. Un contrôle n'est classé « réglementaire » que si une source officielle ou le conseiller en prévention le confirme ; sinon « à qualifier ».
3. **Fixer les fréquences** : pour un contrôle réglementaire, la fréquence vient de la source officielle ou du rapport du dernier organisme ; sinon « fréquence à vérifier » avec la question à poser à l'organisme de contrôle ou au conseiller en prévention. Pour l'entretien recommandé, reprendre la notice du fabricant ou le contrat.
4. **Bâtir le calendrier** : pour chaque installation, dernier contrôle, prochain contrôle, délai de préparation (prendre rendez-vous au moins deux mois avant), responsable humain. Alertes à J-60, J-30 et J-7, puis alerte de retard.
5. **Tenir le registre** : chaque intervention reçoit une date, une installation, un prestataire, un résultat, les réserves émises, la date de levée des réserves et la pièce jointe. Une réserve non levée remonte au coordinateur et au HSE.
6. **Suivre les prestataires** : respect des dates, qualité des rapports, délai de levée des réserves, coût par rapport au contrat. Un prestataire à remplacer déclenche une demande de comparaison au service achats par le bureau de liaison.
7. **Traiter un signalement** : classer l'urgence (sécurité, arrêt d'activité, confort), consigner, préparer la demande d'intervention en brouillon. Toute urgence liée à la sécurité des personnes est transmise sans attendre au HSE.
8. **Livrer** le plan, le calendrier, le registre à jour et les cartes de décision pour toute dépense ou tout contrat.

## Livrable

- Plan d'entretien préventif par bâtiment et par installation.
- Calendrier des contrôles et entretiens avec alertes.
- Registre des interventions avec pièces justificatives et réserves ouvertes.
- Fiche prestataire : périmètre, performance, coût, échéance de contrat.
- Liste des fréquences et classements « à vérifier » avec la question à poser.

## Critères de réussite

- Chaque installation figure au plan, avec ou sans date, et rien n'est supposé conforme faute de pièce.
- Chaque fréquence réglementaire renvoie à une source ou porte la mention « fréquence à vérifier ».
- Chaque contrôle réalisé renvoie à une attestation ou un rapport présent dans le dossier.
- Les réserves ouvertes sont listées avec leur ancienneté.
- Aucune commande, aucune signature de contrat d'entretien, aucun paiement : tout passe par une décision humaine.

## Sources officielles

Aucune source officielle sur les fréquences des contrôles périodiques (installation électrique, extincteurs, ascenseurs, chauffage) n'a pu être ouverte en ligne le 16/10/2026. Les fréquences et obligations de ces contrôles ne sont donc pas reprises ici : elles se vérifient auprès d'un organisme de contrôle agréé, du conseiller en prévention de l'entreprise, du SPF Emploi, Travail et Concertation sociale pour le bien-être au travail, de la région pour le chauffage et du service d'incendie communal pour la sécurité incendie.

## À vérifier par un professionnel

La liste des contrôles obligatoires, leurs fréquences et le caractère conforme ou non d'une installation relèvent d'un organisme de contrôle agréé, du conseiller en prévention et, pour l'incendie, des pompiers de la commune. L'assurance du bâtiment peut imposer des contrôles supplémentaires : à confirmer avec le courtier. Les contrats d'entretien sont à valider par la direction et, si besoin, par un juriste.

## Limites

- La compétence organise et rappelle ; elle ne contrôle pas elle-même une installation et ne certifie rien.
- Elle ne connaît pas les règlements communaux ni les exigences propres à l'assureur : elle le dit.
- Une installation spécifique à l'activité (machines, froid industriel) relève du HSE et du fabricant.
- Elle ne remplace pas l'intervention d'urgence : en cas de danger, l'alerte humaine passe avant tout.

## Exemple

Bâtiment B, entrepôt, 12 extincteurs, un ascenseur de charge, une installation électrique. Rapports fournis : attestation extincteurs datée du 12/03/2025 par un prestataire du contrat n° 4 ; aucun rapport pour l'ascenseur ni pour l'électricité.

Plan : extincteurs, dernier contrôle 12/03/2025, fréquence « à vérifier » auprès du prestataire et du conseiller en prévention, échéance provisoire à confirmer. Ascenseur : « contrôle non daté », question à l'organisme de contrôle et au courtier. Électricité : « contrôle non daté », question au conseiller en prévention. Aucune de ces trois lignes n'est déclarée conforme.

Cas d'échec : le prestataire envoie un rapport signalant une réserve sur l'éclairage de secours, sans date de levée. La compétence ne ferme pas la ligne : elle inscrit « réserve ouverte », transmet l'information au HSE par le coordinateur, prépare un brouillon de demande d'intervention et crée la carte de décision pour la dépense éventuelle, sans écrire que le bâtiment est conforme.
