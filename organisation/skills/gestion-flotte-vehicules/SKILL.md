---
name: "gestion-flotte-vehicules"
description: "Tient le parc de véhicules d'une PME belge : inventaire, échéances (fin de leasing, contrôle technique, assurance, entretien), kilométrages, sinistres de flotte, calendrier de remplacement et d'électrification, avec liaison obligatoire au service fiscalité pour tout avantage de toute nature ou toute déductibilité. À utiliser pour préparer un renouvellement, suivre la flotte ou instruire un sinistre ; jamais pour commander, restituer ou attribuer un véhicule, ni calculer un avantage imposable sans barème officiel de l'année."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "services-generaux"
---

# Gestion de la flotte de véhicules

## Quand l'utiliser

- Plusieurs leasings arrivent à échéance et il faut un calendrier de remplacement.
- La direction veut électrifier la flotte et demande un plan.
- Un véhicule a un sinistre, une échéance oubliée (contrôle, assurance) ou un kilométrage anormal.

## Objectif

Un tableau de la flotte où chaque véhicule a ses échéances, son kilométrage projeté et sa décision à prendre, et un
calendrier de remplacement daté, avec les questions fiscales transmises au service fiscalité et toute commande ou
restitution posée en décision humaine.

## Prérequis

- La liste des véhicules : immatriculation, modèle, carburant, date de mise en circulation, contrat (achat ou leasing,
  durée, kilométrage contractuel, date de fin), utilisateur (fonction ou pool, sans plus).
- Les relevés de kilométrage datés, les échéances d'assurance, d'entretien et de contrôle technique.
- La politique de véhicules de l'entreprise (car policy), si elle existe.

## Entrées

- `flotte` : inventaire daté.
- `releves` : kilométrages avec date.
- `contrats` : leasings et assurances.
- `politique` : règles internes d'attribution et de remplacement.

## Étapes

1. **Contrôler l'inventaire** : chaque véhicule a une fiche complète ; une donnée manquante est listée.
2. **Projeter le kilométrage** : kilométrage moyen par jour sur les relevés, kilométrage prévu à la fin du contrat,
   écart au kilométrage contractuel (risque de surcoût de fin de leasing à chiffrer avec le loueur).
3. **Dresser l'échéancier** : fins de leasing, contrôles techniques, renouvellements d'assurance, entretiens ; date
   limite pour agir (échéance moins le délai de commande ou de préavis) pour chaque ligne.
4. **Bâtir le calendrier de remplacement et d'électrification** : par véhicule, date de fin, usage (kilométrage,
   trajets), possibilité de recharge, option proposée (même motorisation, hybride, électrique, suppression, budget
   mobilité) ; besoins en bornes de recharge sur le site (lien avec la maintenance des bâtiments et l'énergie).
5. **Transmettre les questions fiscales** au service fiscalité par le bureau de liaison : avantage de toute nature des
   utilisateurs, déductibilité des frais, effets de l'électrification. **Aucun montant d'avantage n'est calculé sans le
   barème officiel de l'année** (coefficient de référence, pourcentage CO2, valeur catalogue) ; la réponse vient de la
   fiscalité.
6. **Instruire un sinistre de flotte** : constat, déclaration à l'assureur dans le délai du contrat (à vérifier),
   immobilisation, véhicule de remplacement, coût ; transmission au service SAV et sinistres si l'entreprise est courtier
   ou si le contrat le prévoit.
7. **Poser les décisions** : commande, restitution, attribution d'un véhicule, choix de motorisation, installation de
   bornes ; une carte par décision.

## Livrable

Tableau de la flotte (véhicule, contrat, échéances, kilométrage projeté, écart, décision à prendre) ; échéancier avec dates
limites ; calendrier de remplacement et d'électrification ; questions transmises à la fiscalité ; dossier de sinistre
s'il y a lieu ; décisions proposées.

## Critères de réussite

- Tous les véhicules de l'inventaire sont couverts.
- Chaque échéance a sa date limite pour agir.
- Aucun montant d'avantage de toute nature n'est calculé sans barème officiel de l'année ; la liaison avec la
  fiscalité est utilisée.
- Aucune commande, restitution ni attribution n'est présentée comme faite.

## Sources officielles

Consultée le 17/10/2026 :

- SPF Finances, « Voitures de société : avantage de toute nature », FAQ 2026,
  https://finances.belgium.be/sites/default/files/downloads/121-faq-voitures-de-societe-2026.pdf : l'avantage forfaitaire
  se calcule en appliquant un pourcentage CO2 aux six septièmes de la valeur catalogue (prix à l'état neuf, options et TVA
  réellement payée comprises, sans réductions), avec un minimum légal ; un pourcentage de la valeur catalogue décroît
  selon l'ancienneté du véhicule ; sans donnée CO2 connue, des émissions forfaitaires s'appliquent. Les coefficients et
  minimums de l'année sont lus dans le document de l'année, jamais repris de mémoire.

## À vérifier par un professionnel

- L'avantage de toute nature, la déductibilité et le traitement des véhicules électriques : service fiscalité ou conseiller
  fiscal, avec le barème de l'année.
- Le délai de déclaration d'un sinistre et les franchises : contrat d'assurance et assureur.
- Le budget mobilité et la politique de véhicules : ressources humaines et secrétariat social.

## Limites

- Elle ne négocie pas les contrats de leasing.
- Elle ne calcule pas le coût total de possession sans données de coûts fournies.
- Les règles régionales de circulation (zones de basses émissions) sont à vérifier par ville.

## Exemple

Flotte de 18 véhicules : 7 leasings finissent en 2027. Véhicule 4 : 31 000 km par an, projection 124 000 km pour 100 000
contractuels, surcoût à chiffrer avec le loueur. Calendrier : 5 remplacements électriques proposés (trajets courts,
recharge possible au site), 2 hybrides (longs trajets), 1 suppression (pool sous-utilisé). Besoin estimé de 6 bornes,
transmis à la maintenance des bâtiments. Questions à la fiscalité : « avantage de toute nature et déductibilité des 5
électriques pour l'année 2027 ». Aucun montant calculé dans le livrable.

Cas d'échec évité : un gestionnaire demande « combien ça coûtera en avantage pour Sophie ? ». La compétence ne calcule rien
sans le barème de l'année et pose la question au service fiscalité par la liaison.

## Origine de la méthode

Méthode propre à l'atelier : aucun modèle de dépôt tiers n'existe pour ce sujet (étude de l'usine, groupe 3, section
12.2) ; aucune reprise.
