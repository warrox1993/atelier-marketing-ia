# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Paperclip (socle, dossier `paperclip/`, avec ses correctifs dans `socle/patches/`) et le plugin de l'atelier `plugin-atelier/` (React 19, TypeScript). Le fichier `paperclip/doc/PRODUCT.md` décrit Paperclip lui-même, pas l'atelier.

## Users

Une seule personne pour l'instant : le gérant de l'atelier. Il pilote les agents, valide ce qu'ils produisent (posts, documents, vidéos) et suit chaque client. Les clients n'ont pas d'accès à l'interface.

## Product Purpose

Une agence marketing faite d'agents IA, pour des PME belges. L'interface sert à confier un travail, suivre son avancement, relire et valider les livrables avant toute diffusion.

## Positioning

Des agents spécialisés par métier, avec des garde-fous intégrés : validation avant publication, mention de l'IA, provenance des fichiers, règles belges de la publicité.

## Operating Context

Poste de travail, sessions longues de pilotage, beaucoup d'informations à parcourir et de décisions rapides (valider, renvoyer, corriger).

## Capabilities and Constraints

- Rien ne sort sans validation humaine.
- Dépôt public : aucune donnée personnelle ni donnée client dans le code ou les exemples.
- Aucun tiret cadratin dans les textes.

## Brand Commitments

À préciser : pas encore de marque arrêtée pour l'atelier.

## Evidence on Hand

Organisation des agents dans `organisation/`, livrables de la fabrique (page `/atelier/livrables`).

## Product Principles

Le gérant garde la main ; chaque livrable montre d'où il vient ; dire clairement ce qui attend une décision.

## Accessibility & Inclusion

Lecture longue confortable, navigation au clavier, états (en attente, refusé, prêt) jamais portés par la seule couleur.
