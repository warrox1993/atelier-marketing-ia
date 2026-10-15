---
name: "controles-techniques-liens"
description: "Exécute les contrôles techniques d'un livrable : liens et redirections, contenu réel de la page d'arrivée, formulaires, balises de suivi, formats, données structurées et affichage, avec un rapport par élément et la liste des contrôles non exécutés. À utiliser dès qu'un livrable contient une URL, un formulaire, une balise ou un format imposé."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "controle"
---

# Contrôles techniques et de liens

## Quand l'utiliser

- Un livrable contient des liens, un formulaire, des balises ou des données structurées.
- Avant le dossier humain, et après chaque correction qui touche ces éléments.

## Objectif

Prouver que chaque élément technique fonctionne réellement, sans confondre un code de
réponse avec le bon contenu.

## Prérequis

- Révision du livrable et liste des éléments à contrôler.

## Entrées

- `urls`, `formulaires`, `schemas_attendus`, `formats` (longueurs, dimensions).

## Étapes

1. Refuser d'emblée toute URL non `http(s)`, toute adresse privée, locale, de lien local ou
   de métadonnées ; statut « refusée par sécurité ».
2. Pour chaque URL publique, passer par l'outil serveur protégé de l'atelier
   (`POST /api/plugins/atelier.marketing-ia/api/taches/<issueId>/liens/verifier`, 50 URLs au
   plus) : code HTTP, chaîne de redirections, destination finale, type de contenu, taille.
   Sans cet outil, déclarer le contrôle non exécuté plutôt que d'improviser.
3. Contrôler le contenu : titre attendu présent, absence de signes de page d'erreur (« page
   introuvable », « 404 », page vide, page de parking) ; un 200 sur une page d'erreur est
   un échec.
4. Formulaires : champs, obligations, consentement, page de confirmation (sans soumettre de
   données réelles).
5. Balises et données structurées : présence, syntaxe JSON valide, cohérence avec la page.
6. Formats : longueurs de titres et descriptions, dimensions demandées.
7. Lister chaque contrôle non exécuté avec sa raison (outil absent, accès refusé, délai).

## Livrable

Rapport : tableau par élément (élément, contrôle, résultat, preuve, date UTC), puis verdict
du rôle `technique` déposé par la route des verdicts (catégories `lien_defectueux`,
`page_erreur`, `technique`), avec la liste `controlesNonExecutes`.

## Critères de réussite

- Chaque URL a un statut, une destination finale et un contrôle de contenu.
- Aucun contrôle non exécuté n'est déclaré réussi.

## Limites

- L'affichage réel dans les navigateurs n'est vérifié que si un outil de rendu est
  disponible ; sinon, contrôle déclaré non exécuté.
- La protection contre les adresses internes est assurée par l'outil serveur, pas par la
  bonne volonté de l'agent.

## Exemple

| élément | contrôle | résultat | preuve |
| --- | --- | --- | --- |
| https://renovation-liege.example/agences/ans | contenu | échec | 200, titre « Page introuvable » |
| https://renovation-liege.example/devis | redirections | réussi | 301 puis 200, titre « Demande de devis » |
| http://169.254.169.254/ | sécurité | refusée par sécurité | adresse de métadonnées |
| affichage mobile | rendu | non exécuté | aucun outil de rendu connecté |
